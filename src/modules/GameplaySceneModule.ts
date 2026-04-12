import * as THREE from 'three'
import { BaseModule } from '@base/engine-core'
import type { EngineContext } from '@base/engine-core'
import type { ThreeContext } from '@base/threejs-engine'
import type { InputActionEvent } from '@base/input'
import {
  GameplayCameraController,
  type GameplayCameraMode,
  type ThirdPersonCameraPreset,
  type ThirdPersonViewCam,
} from '@base/camera-three'
import {
  CharacterAnimationRig,
  DEFAULT_SKINNED_CROUCH_TERRAIN_Y_DELTA,
  PlayerController,
  PLAYER_CAPSULE_HALF_HEIGHT,
  type PlayerControllerEvent,
  type TerrainSurfaceSampler,
} from '@base/player-three'
import {
  EnvironmentRuntime,
  SceneBuilder,
  type SceneDescriptor,
} from '@base/scene-builder'
import { PlayerCameraCoordinator, EV_GAMEPLAY_CAMERA_MODE } from '@base/gameplay'
export { EV_GAMEPLAY_CAMERA_MODE }
import { MeshTerrainSampler } from '@/utils/MeshTerrainSampler'
import { createSceneBuildOptions } from '@/utils/sceneBuildOptions'
import { resolvePublicUrl } from '@/utils/resolvePublicUrl'

/** EventBus keys emitted by this module. Listen on the shell EventBus to react. */
const EV_REQUEST_SCENE_CHANGE = 'game:request-scene-change' as const
const EV_REPORT_OUTCOME       = 'game:report-outcome'       as const

// ─── Configuration ────────────────────────────────────────────────────────────

export interface GameplaySceneConfig {
  /** Used only when no descriptor is provided (flat default scene). */
  groundRadius: number
  groundColor: number
  fogColor: number
  characterSpeed: number
  /** Camera smoothing; higher = snappier (third-person only). */
  cameraLerp: number
  /** Character facing rotation lerp speed. */
  facingLerp: number
  /**
   * Facing lerp speed used while camera is in third-person mode.
   * Falls back to {@link facingLerp} when not set.
   * Lower values give smoother, more cinematic body turns and camera-orbit feel.
   */
  facingLerpThirdPerson?: number
  /** Starting rig; overridden by explicit camera* fields when provided. */
  cameraPreset?: ThirdPersonCameraPreset
  cameraDistance?: number
  cameraHeight?: number
  cameraLateralOffset?: number
  cameraPivotHeight?: number
  /** Initial gameplay camera mode. */
  cameraMode?: GameplayCameraMode
  /**
   * First-person: world Y offset from character root to eye. Tune for feet- vs centre-pivot meshes.
   * @base/camera-three default is 0.75.
   */
  firstPersonEyeOffsetY?: number
  /** First-person: eye lowers by this × crouch blend. */
  firstPersonCrouchEyeDrop?: number
  /**
   * First-person: nudge camera forward along body XZ (m), same axis as walk forward — see `@base/camera-three` `eyePullback`.
   * @base/camera-three default is 0.
   */
  firstPersonEyePullback?: number
  /**
   * World Y added to the grounded root while crouching (× smoothed crouch). Negative lowers skinned meshes so feet stay on terrain.
   * If omitted and the descriptor loads a `modelUrl`, {@link DEFAULT_SKINNED_CROUCH_TERRAIN_Y_DELTA} is applied automatically.
   */
  crouchTerrainYOffsetDelta?: number
  /**
   * Steepest slope the character can walk up before movement is blocked as "wall".
   * Default in PlayerController is 35° — works for gentle hills.
   * Increase to 55–65° for scenes with steep navigable terrain (e.g. hillside ascent).
   */
  maxWalkableSlopeDeg?: number
  /**
   * Drop threshold (metres) before the cliff-edge catch blocks walk/jog movement.
   * Default is feetToHips × 2/3 ≈ 0.59m — suited for flat terrain with real cliff edges.
   * For steep downhill: set to probeHorizon × tan(slopeDeg).
   * At 55° slope with default probe multiplier: ~1.78 × tan(55°) ≈ 2.55m.
   * Sprint always bypasses this check regardless of threshold.
   */
  cliffDropCatchThreshold?: number
  /** Log jump arc telemetry (peak, fall dist, air time) on landing. */
  debugJumpArc?: boolean
  /** Log resolved animation clip names on CharacterAnimationRig init. */
  debugClipResolution?: boolean
  /**
   * Exponential decay (per second) for {@link PlayerController} planar carry velocity (ability bursts).
   * When omitted, the package default applies.
   */
  carryImpulseDecayPerSecond?: number
  /**
   * Navigation / collision mesh that replaces the procedural `TerrainSampler`.
   * Load a GLB whose meshes represent the exact walkable surfaces (ground, roads, rooftops).
   * The mesh is placed with the same transform as the visual GLB so physics aligns.
   * The root is added to the scene invisible — physics only, no visual contribution.
   */
  navigationMesh?: {
    url: string
    x?: number
    y?: number
    z?: number
    scale?: number
    rotationY?: number
    /** Set true temporarily to render the nav mesh as a wireframe overlay for alignment debugging. */
    debugVisible?: boolean
  }
  /**
   * Scene exit trigger zones. A glowing ring is placed at each zone; standing inside for
   * `dwellSeconds` (default 1.2s) emits `game:request-scene-change` with the target scene id.
   * Positions are world-space X/Z. Y is sampled from terrain at mount time.
   */
  exitZones?: Array<{
    x: number
    /** Explicit world Y for the ring. Overrides terrain sampling — use when the ring
     *  sits on a steep slope or elevated surface where sampling gives a wrong value. */
    y?: number
    z: number
    /** Trigger radius in metres. Default 2.5. */
    radius?: number
    targetSceneId: string
    /** Ring colour (hex). Default amber 0xffdd44. */
    ringColor?: number
    /** Seconds the player must stand inside before transition fires. Default 1.2. */
    dwellSeconds?: number
  }>
  /**
   * Emissive sky orb — used for the dead sun in scene-01.
   * Rendered as a solid sphere with MeshBasicMaterial (unlit, always visible through fog).
   */
  sunOrb?: {
    x: number
    y: number
    z: number
    /** Sphere radius. Default 12. */
    radius?: number
    /** Colour hex. Default amber 0xff8800. */
    color?: number
  }
  /**
   * Scene-local secret double-jump policy.
   * Keep this feature scenario-owned here; shared packages expose only generic movement capability.
   */
  secretDoubleJump?: {
    enabled: boolean
    activationCenterX: number
    activationCenterZ: number
    activationRadius: number
    requiredDirectionX: number
    requiredDirectionZ: number
    minDirectionDot: number
    preFallVyThreshold: number
    postFallGraceSeconds: number
    slowmoScale: number
    slowmoMaxSeconds: number
  }
}

// ─── Fall time dilation ──────────────────────────────────────────────────────

/**
 * Configuration for narrative fall time-dilation.
 * @see ThirdPersonSceneModule.setFallTimeDilation
 */
export interface FallTimeDilationConfig {
  zone:
    | { type: 'circle'; x: number; z: number; radius: number }
    | { type: 'aabb'; minX: number; maxX: number; minZ: number; maxZ: number }
  /** Facing angle (rad, 0 = +Z) the character must be facing at liftoff. Omit to skip. */
  facingAngle?: number
  /** Half-arc facing tolerance (rad). Default **π/3**. */
  facingTolerance?: number
  /** Minimum downward speed (m/s) before dilation activates. Default **4**. */
  minFallSpeed?: number
  /** Time scale while dilated. Default **0.25**. */
  dilationScale?: number
  /** Exponential blend speed (s⁻¹). Default **5**. */
  blendSpeed?: number
}

function inDilationZone(cfg: FallTimeDilationConfig, x: number, z: number): boolean {
  const { zone } = cfg
  if (zone.type === 'circle') {
    const dx = x - zone.x, dz = z - zone.z
    return dx * dx + dz * dz <= zone.radius * zone.radius
  }
  return x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ
}

function facingMatches(cfg: FallTimeDilationConfig, facing: number): boolean {
  if (cfg.facingAngle === undefined) return true
  const tol = cfg.facingTolerance ?? Math.PI / 3
  let diff = Math.abs(facing - cfg.facingAngle) % (Math.PI * 2)
  if (diff > Math.PI) diff = Math.PI * 2 - diff
  return diff <= tol
}

const DEFAULT_CONFIG: GameplaySceneConfig = {
  groundRadius: 50,
  groundColor: 0x0f172a,
  fogColor: 0x080810,
  characterSpeed: 7,
  cameraLerp: 8,
  facingLerp: 12,
  facingLerpThirdPerson: 5,
  secretDoubleJump: {
    enabled: false,
    activationCenterX: 0,
    activationCenterZ: 0,
    activationRadius: 999,
    requiredDirectionX: 1,
    requiredDirectionZ: 0,
    minDirectionDot: 0.75,
    preFallVyThreshold: -0.18,
    postFallGraceSeconds: 0.3,
    slowmoScale: 0.35,
    slowmoMaxSeconds: 1.5,
  },
}

/**
 * Enables {@link PlayerController} movement logs in Vite dev.
 * - Default: **on** in dev (uses `console.log`, visible at default DevTools levels).
 * - Silence: `localStorage.setItem('debugPlayerMove','0')` then reload.
 * - Force on after silencing: `localStorage.removeItem('debugPlayerMove')` or set `'1'`.
 * - URL still works: `?debugMove=1` turns **on** even if localStorage was `'0'` (highest priority).
 */
function playerMovementDebugEnabled(): boolean {
  if (typeof window === 'undefined' || !import.meta.env.DEV) return false
  try {
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('debugMove') === '1' || sp.get('debugMove') === 'true') return true
    if (window.localStorage.getItem('debugPlayerMove') === '0') return false
  } catch {
    /* private mode / no storage */
  }
  return true
}

// ─── Module ──────────────────────────────────────────────────────────────────

/**
 * GameplaySceneModule — gameplay character controller with an optional
 * terrain descriptor for shaped environments.
 *
 * Locomotion state and rules live in {@link PlayerController}; this module wires
 * input, terrain snap, environment, follow camera rig, and optional skeletal
 * locomotion clips via {@link CharacterAnimationRig}.
 *
 * Camera: `GameplayCameraController` from `@base/camera-three` — presets, overrides,
 * third- vs first-person. Call {@link setCameraPreset} / {@link setCameraMode} at runtime.
 *
 * **Movement debug:** In Vite dev, movement logging is **on** by default (`console.log`,
 * `[PlayerController.move]`). Silence with `localStorage.debugPlayerMove = '0'`. Optional: `?debugMove=1`.
 */
export class GameplaySceneModule extends BaseModule {
  readonly id = 'third-person-scene'

  protected readonly cfg: GameplaySceneConfig
  private readonly descriptor?: SceneDescriptor

  private readonly player: PlayerController

  private character!: THREE.Object3D
  private sampler?: TerrainSurfaceSampler
  protected setSampler(s: TerrainSurfaceSampler | undefined): void { this.sampler = s }
  private effectiveRadius = 50

  private offInputAction: (() => void) | null = null
  private unregisterSystem: (() => void) | null = null
  private environment: EnvironmentRuntime | null = null

  private animRig: CharacterAnimationRig | null = null

  /** Set from `consumeEvents` `landed` for the next `CharacterAnimationRig.update` only. */
  private pendingLandForRig: { fallDistance: number; airTimeSeconds: number } | null = null

  private readonly gameplayCam: GameplayCameraController
  private readonly coordinator: PlayerCameraCoordinator
  private jumpHeld = false
  private secretWindowOpen = false
  private secretWindowTimer = 0
  private secretSecondJumpTriggered = false
  private secretPendingWinOnLand = false
  private secretConsumed = false
  private slowmoRemainingSeconds = 0
  private secondJumpAnimTrigger = false
  private edgeCatchAnimTrigger = false
  private wallStumbleAnimTrigger = false
  private failedJumpAnimTrigger = false

  // ── Dev time control (sandbox) ────────────────────────────────────────────
  private _devTimeScale = 1.0
  private _devPendingFrames = 0
  private _devStepDelta = 1 / 60

  // ── Fall time dilation ────────────────────────────────────────────────────
  private _dilation: FallTimeDilationConfig | null = null
  private _dilationActive = false
  private _dilationCurrentScale = 1.0

  // Exit zone dwell accumulators — one entry per exitZones[] index.
  private _exitZoneDwell: number[] = []
  private _exitTriggered = false

  constructor(
    options: Partial<GameplaySceneConfig> & { descriptor?: SceneDescriptor } = {},
  ) {
    super()
    const {
      descriptor,
      cameraPreset = 'close-follow',
      cameraDistance,
      cameraHeight,
      cameraLateralOffset,
      cameraPivotHeight,
      cameraMode,
      firstPersonEyeOffsetY,
      firstPersonCrouchEyeDrop,
      firstPersonEyePullback,
      ...configRest
    } = options
    this.cfg        = { ...DEFAULT_CONFIG, ...configRest }
    this.descriptor = descriptor

    const thirdPersonOverrides: Partial<ThirdPersonViewCam> = {}
    if (cameraDistance !== undefined) thirdPersonOverrides.distance = cameraDistance
    if (cameraHeight !== undefined) thirdPersonOverrides.height = cameraHeight
    if (cameraLateralOffset !== undefined) thirdPersonOverrides.lateral = cameraLateralOffset
    if (cameraPivotHeight !== undefined) thirdPersonOverrides.pivotY = cameraPivotHeight

    const fp: { eyeOffsetY?: number; crouchEyeDrop?: number; eyePullback?: number } = {}
    if (firstPersonEyeOffsetY !== undefined) fp.eyeOffsetY = firstPersonEyeOffsetY
    if (firstPersonCrouchEyeDrop !== undefined) fp.crouchEyeDrop = firstPersonCrouchEyeDrop
    if (firstPersonEyePullback !== undefined) fp.eyePullback = firstPersonEyePullback

    this.gameplayCam = new GameplayCameraController({
      cameraLerp: this.cfg.cameraLerp,
      cameraPreset,
      thirdPersonOverrides,
      firstPerson: Object.keys(fp).length ? fp : undefined,
      mode: cameraMode ?? 'third-person',
    })

    this.player = new PlayerController({
      characterSpeed: this.cfg.characterSpeed,
      facingLerp: this.cfg.facingLerp,
      terrainYOffset: PLAYER_CAPSULE_HALF_HEIGHT,
      debugMovement: playerMovementDebugEnabled(),
      debugJumpArc: this.cfg.debugJumpArc,
      maxWalkableSlopeDeg: this.cfg.maxWalkableSlopeDeg,
      cliffDropCatchThreshold: this.cfg.cliffDropCatchThreshold,
      ...(this.cfg.carryImpulseDecayPerSecond !== undefined
        ? { carryImpulseDecayPerSecond: this.cfg.carryImpulseDecayPerSecond }
        : {}),
      extraJumps: 1,
      canUseExtraJump: () => this.canUseSecretExtraJumpNow(),
    })
    this.coordinator = new PlayerCameraCoordinator(this.player, this.gameplayCam, {
      facingLerp: this.cfg.facingLerp,
      facingLerpThirdPerson: this.cfg.facingLerpThirdPerson,
    })

    if (import.meta.env.DEV && playerMovementDebugEnabled()) {
      console.log(
        '[ThirdPersonSceneModule] Player movement debug enabled — hold W to see [PlayerController.move] lines',
      )
    }
  }

  getPlayerController(): PlayerController {
    return this.player
  }

  /** Terrain surface Y at world XZ (feet level); `0` when no sampler yet. */
  sampleTerrainSurfaceY(x: number, z: number): number {
    return this.sampler?.sample(x, z) ?? 0
  }

  /** Mounted character root (same object passed into {@link PlayerController.tick}). */
  getCharacter(): THREE.Object3D {
    return this.character
  }

  getCameraPreset(): ThirdPersonCameraPreset {
    return this.gameplayCam.getCameraPreset()
  }

  /** Swap distance / height / lateral / pivot to a named rig; keeps constructor distance/height overrides. */
  setCameraPreset(preset: ThirdPersonCameraPreset): void {
    this.gameplayCam.setCameraPreset(preset)
  }

  getCameraMode(): GameplayCameraMode {
    return this.gameplayCam.getMode()
  }

  /** Current player world position — useful for tuning exit zone coordinates in dev. */
  getPlayerPosition(): THREE.Vector3 {
    return this.character.position.clone()
  }

  /** Outer playable disc radius (m) in XZ from scene origin — used by slam / tooling. */
  getPlayableRadius(): number {
    return this.effectiveRadius
  }

  setCameraMode(mode: GameplayCameraMode): void {
    const ctx = this.context as ThreeContext | undefined
    this.coordinator.setCameraMode(
      mode,
      ctx?.camera ?? null,
      this.character ?? null,
      this.context.eventBus,
    )
  }

  // ─── Mount ──────────────────────────────────────────────────────────────────

  protected async onMount(_container: HTMLElement, context: EngineContext): Promise<void> {
    const ctx = context as ThreeContext

    if (this.descriptor) {
      const result = await SceneBuilder.build(ctx, this.descriptor, createSceneBuildOptions())
      if (!result.character || result.characterTerrainYOffset === undefined) {
        throw new Error(
          'GameplaySceneModule: SceneBuilder returned no character — remove skipPlayerCharacter from the descriptor.',
        )
      }
      this.character       = result.character
      this.sampler         = result.sampler
      this.effectiveRadius = result.effectiveRadius
      this.player.setTerrainYOffset(result.characterTerrainYOffset)
      const ch = this.descriptor?.character
      const fp =
        ch?.terrainFootprintRadius ?? (ch?.modelUrl?.trim() ? 0.22 : 0)
      this.player.setTerrainFootprintRadius(fp)
      const crouchY =
        this.cfg.crouchTerrainYOffsetDelta !== undefined
          ? this.cfg.crouchTerrainYOffsetDelta
          : ch?.modelUrl?.trim()
            ? DEFAULT_SKINNED_CROUCH_TERRAIN_Y_DELTA
            : 0
      this.player.setCrouchTerrainYOffsetDelta(crouchY)
      this.environment      = EnvironmentRuntime.attachGame(ctx, this.descriptor.atmosphere ?? {})

      if (this.cfg.navigationMesh) {
        const nav = this.cfg.navigationMesh
        const gltf = await ctx.assets.loadGLTF(resolvePublicUrl(nav.url))
        const navRoot = gltf.scene
        navRoot.position.set(nav.x ?? 0, nav.y ?? 0, nav.z ?? 0)
        navRoot.scale.setScalar(nav.scale ?? 1)
        navRoot.rotation.y = nav.rotationY ?? 0
        if (nav.debugVisible) {
          // Wireframe overlay so you can see nav mesh alignment against the visual GLB.
          // Set debugVisible: false (or remove) once alignment is confirmed.
          navRoot.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh
              mesh.material = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true })
            }
          })
        } else {
          // Hide root AND every child — GLTF nodes can carry their own visible flag
          // from Blender which survives the parent-level toggle.
          navRoot.traverse((child) => { child.visible = false })
        }
        ctx.scene.add(navRoot)
        navRoot.updateMatrixWorld(true)
        // Procedural sampler stays as fallback — covers steep hill faces where
        // top-down raycasting misses. Mesh wins on flat/walkable surfaces.
        this.sampler = MeshTerrainSampler.fromRoot(navRoot, this.sampler ?? null)
      }

      // ── Exit zone rings ────────────────────────────────────────────────────
      if (this.cfg.exitZones?.length) {
        this._exitZoneDwell = this.cfg.exitZones.map(() => 0)
        for (const zone of this.cfg.exitZones) {
          const r = zone.radius ?? 2.5
          const groundY = zone.y ?? this.sampler?.sample(zone.x, zone.z) ?? 0
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(r * 0.55, r, 48),
            new THREE.MeshBasicMaterial({
              color: zone.ringColor ?? 0xffdd44,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.65,
            }),
          )
          ring.rotation.x = -Math.PI / 2
          ring.position.set(zone.x, groundY + 0.06, zone.z)
          ctx.scene.add(ring)
        }
      }

      // ── Dead sun / sky orb ─────────────────────────────────────────────────
      if (this.cfg.sunOrb) {
        const s = this.cfg.sunOrb
        const orb = new THREE.Mesh(
          new THREE.SphereGeometry(s.radius ?? 12, 32, 16),
          new THREE.MeshBasicMaterial({ color: s.color ?? 0xff8800 }),
        )
        orb.position.set(s.x, s.y, s.z)
        ctx.scene.add(orb)
      }
    } else {
      this.effectiveRadius = this.cfg.groundRadius
      this.character = this.buildDefaultScene(ctx)
    }

    this.player.resetFacing(this.character.rotation.y)
    this.animRig = new CharacterAnimationRig(this.character, {
      debugClipResolution: this.cfg.debugClipResolution,
    })

    this.coordinator.mount(context.eventBus)
    this.coordinator.initCamera(ctx.camera, this.character)

    if (this.gameplayCam.getMode() === 'first-person') {
      this.player.setMovementBasis('camera')
    }

    this.offInputAction = context.eventBus.on('input:action', (raw) => {
      const e = raw as InputActionEvent
      if (e.action !== 'jump') return
      if (e.type === 'pressed') {
        this.jumpHeld = true
        if (!this.handleJumpPressedEarly()) {
          this.player.notifyJumpPressed()
        }
      } else if (e.type === 'released') {
        this.jumpHeld = false
        if (this.secretSecondJumpTriggered) {
          this.slowmoRemainingSeconds = 0
        }
      }
    })

    this.unregisterSystem = ctx.registerSystem('third-person-scene', (rawDelta) => {
      let delta: number
      if (this._devTimeScale === 0) {
        if (this._devPendingFrames > 0) {
          this._devPendingFrames--
          delta = this._devStepDelta
        } else {
          return
        }
      } else {
        delta = rawDelta * this._devTimeScale
      }
      this.environment?.update(delta)
      this.tick(delta, ctx)
    })
  }

  protected async onUnmount(): Promise<void> {
    this.unregisterSystem?.()
    this.coordinator.unmount()
    this.offInputAction?.()

    this.animRig?.dispose()
    this.animRig = null

    this.environment?.dispose()
    this.environment = null

    const ctx = this.context as ThreeContext
    ctx.scene.clear()
    ctx.scene.background = null
    ctx.scene.fog        = null
  }

  // ─── Default flat-disc scene (no descriptor) ─────────────────────────────────

  private buildDefaultScene(ctx: ThreeContext): THREE.Object3D {
    const { fogColor, groundColor, groundRadius } = this.cfg

    ctx.scene.background = new THREE.Color(fogColor)
    ctx.scene.fog = new THREE.FogExp2(fogColor, 0.012)

    ctx.scene.add(new THREE.AmbientLight(0x334155, 0.9))

    const key = new THREE.DirectionalLight(0xffeedd, 1.4)
    key.position.set(6, 12, 5)
    ctx.scene.add(key)

    const rim = new THREE.DirectionalLight(0x6d28d9, 1.0)
    rim.position.set(-6, 4, -8)
    ctx.scene.add(rim)

    const ground = new THREE.Mesh(
      new THREE.CylinderGeometry(groundRadius, groundRadius, 0.2, 72),
      new THREE.MeshStandardMaterial({ color: groundColor, roughness: 0.9, metalness: 0.05 }),
    )
    ground.position.y = -0.1
    ctx.scene.add(ground)

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(groundRadius, 0.06, 8, 80),
      new THREE.MeshStandardMaterial({ color: 0x4f46e5, emissive: 0x4f46e5, emissiveIntensity: 0.5 }),
    )
    ring.rotation.x = -Math.PI / 2
    ctx.scene.add(ring)

    const character = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 1.0, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.5, metalness: 0.2 }),
    )
    character.position.set(0, PLAYER_CAPSULE_HALF_HEIGHT, 0)
    ctx.scene.add(character)

    return character
  }

  // ─── Per-frame update ─────────────────────────────────────────────────────────

  private tick(delta: number, ctx: ThreeContext): void {
    const simDelta = this.computeSimDelta(delta)
    const tickCtx = {
      camera: ctx.camera,
      character: this.character,
      sampler: this.sampler,
      playableRadius: this.effectiveRadius,
    }

    this.onBeforeGameplayTick(simDelta, ctx)
    this.coordinator.tickPlayer(simDelta, tickCtx)

    const movementEvents = this.player.consumeEvents()
    this.handlePlayerEvents(movementEvents)

    const land = this.pendingLandForRig
    this.pendingLandForRig = null

    const snap = this.player.getSnapshot()
    this.tickFallDilation(snap, this.character)

    this.animRig?.update(simDelta, this.character, snap.velocity, {
      crouch: snap.crouching,
      sprint: snap.sprinting,
      grounded: snap.grounded,
      landFallDistance: land?.fallDistance,
      landAirTimeSeconds: land?.airTimeSeconds,
      secondJumpTrigger: this.secondJumpAnimTrigger,
      edgeCatchTrigger: this.edgeCatchAnimTrigger,
      wallStumbleTrigger: this.wallStumbleAnimTrigger,
      failedJumpTrigger: this.failedJumpAnimTrigger,
    })
    this.secondJumpAnimTrigger = false
    this.edgeCatchAnimTrigger = false
    this.wallStumbleAnimTrigger = false
    this.failedJumpAnimTrigger = false
    this.updateSecretWindow(simDelta, snap.velocity.y)
    this.tickExitZones(simDelta, ctx)

    this.coordinator.tickCamera(simDelta, tickCtx)
    this.onAfterGameplayTick(simDelta, ctx)
  }

  /**
   * Runs **before** {@link PlayerController.tick} each frame (same `simDelta` as the player).
   * Use for impulses that must apply before gravity / terrain integration in the same step
   * (e.g. dbox pending rocket punch).
   */
  protected onBeforeGameplayTick(_simDelta: number, _ctx: ThreeContext): void {}

  /**
   * Runs at the end of each gameplay tick after camera update, using the same `simDelta`
   * as the player (slow-mo / fall dilation included). Subclasses use for lightweight props / NPCs.
   */
  protected onAfterGameplayTick(_simDelta: number, _ctx: ThreeContext): void {}

  /**
   * Jump `pressed` hook before {@link PlayerController.notifyJumpPressed} sets the buffer.
   * Return `true` when the press is fully handled (e.g. dbox rocket-punch skim jump).
   */
  protected handleJumpPressedEarly(): boolean {
    return false
  }

  private canUseSecretExtraJumpNow(): boolean {
    return (
      !!this.cfg.secretDoubleJump?.enabled &&
      this.secretWindowOpen &&
      !this.secretConsumed
    )
  }

  private computeSimDelta(delta: number): number {
    let d = delta
    if (this.slowmoRemainingSeconds > 0) {
      this.slowmoRemainingSeconds = Math.max(0, this.slowmoRemainingSeconds - delta)
      d = delta * (this.cfg.secretDoubleJump?.slowmoScale ?? 0.35)
    }
    // Apply fall dilation (multiplicative; 1.0 when inactive).
    return d * this._dilationCurrentScale
  }

  private tickExitZones(delta: number, ctx: ThreeContext): void {
    if (this._exitTriggered || !this.cfg.exitZones?.length) return
    const px = this.character.position.x
    const pz = this.character.position.z
    for (let i = 0; i < this.cfg.exitZones.length; i++) {
      const zone = this.cfg.exitZones[i]!
      const r = zone.radius ?? 2.5
      const dx = px - zone.x
      const dz = pz - zone.z
      if (dx * dx + dz * dz <= r * r) {
        const prev = this._exitZoneDwell[i] ?? 0
        this._exitZoneDwell[i] = prev + delta
        if (import.meta.env.DEV && prev === 0) {
          console.log(`[ExitZone] entered zone ${i} → ${zone.targetSceneId} (x:${px.toFixed(1)} z:${pz.toFixed(1)})`)
        }
        if (this._exitZoneDwell[i]! >= (zone.dwellSeconds ?? 1.2)) {
          this._exitTriggered = true
          console.log(`[ExitZone] triggered → ${zone.targetSceneId}`)
          ctx.eventBus.emit(EV_REQUEST_SCENE_CHANGE, { targetSceneId: zone.targetSceneId })
        }
      } else {
        this._exitZoneDwell[i] = 0
      }
    }
  }

  private isInSecretActivationZone(): boolean {
    const s = this.cfg.secretDoubleJump
    if (!s?.enabled) return false
    const dx = this.character.position.x - s.activationCenterX
    const dz = this.character.position.z - s.activationCenterZ
    return dx * dx + dz * dz <= s.activationRadius * s.activationRadius
  }

  private movementMatchesSecretDirection(velocity: { x: number; y: number; z: number }): boolean {
    const s = this.cfg.secretDoubleJump
    if (!s?.enabled) return false
    const len = Math.hypot(velocity.x, velocity.z)
    if (len < 1e-4) return false
    const vx = velocity.x / len
    const vz = velocity.z / len
    const dirLen = Math.hypot(s.requiredDirectionX, s.requiredDirectionZ) || 1
    const dx = s.requiredDirectionX / dirLen
    const dz = s.requiredDirectionZ / dirLen
    const dot = vx * dx + vz * dz
    return dot >= s.minDirectionDot
  }

  private handlePlayerEvents(events: PlayerControllerEvent[]): void {
    for (const event of events) {
      if (event.type === 'jump_started') {
        this.tryOpenSecretWindowFromTakeoff()
        continue
      }
      if (event.type === 'extra_jump_used') {
        if (this.secretWindowOpen && !this.secretConsumed) {
          this.secretSecondJumpTriggered = true
          this.secretPendingWinOnLand = true
          this.secretConsumed = true
          this.secondJumpAnimTrigger = true
          this.secretWindowOpen = false
          this.secretWindowTimer = 0
          this.slowmoRemainingSeconds = this.cfg.secretDoubleJump?.slowmoMaxSeconds ?? 1.5
        }
        continue
      }
      if (event.type === 'edge_catch') {
        this.edgeCatchAnimTrigger = true
        continue
      }
      if (event.type === 'wall_stumble') {
        this.wallStumbleAnimTrigger = true
        continue
      }
      if (event.type === 'jump_failed_high_ledge') {
        this.failedJumpAnimTrigger = true
        continue
      }
      if (event.type === 'landed') {
        this.pendingLandForRig = {
          fallDistance: event.fallDistance,
          airTimeSeconds: event.airTimeSeconds,
        }
        if (this.secretPendingWinOnLand) {
          this.context.eventBus.emit(EV_REPORT_OUTCOME, {
            kind: 'win',
            reason: 'secret-double-jump-landing',
          })
          this.secretPendingWinOnLand = false
          this.secretSecondJumpTriggered = false
          this.slowmoRemainingSeconds = 0
        }
      }
    }
  }

  private tryOpenSecretWindowFromTakeoff(): void {
    const s = this.cfg.secretDoubleJump
    if (!s?.enabled || this.secretConsumed) return
    const snap = this.player.getSnapshot()
    if (!this.isInSecretActivationZone()) return
    if (!this.movementMatchesSecretDirection(snap.velocity)) return
    this.secretWindowOpen = true
    this.secretWindowTimer = s.postFallGraceSeconds
    this.slowmoRemainingSeconds = s.slowmoMaxSeconds
  }

  private updateSecretWindow(delta: number, verticalVelocity: number): void {
    const s = this.cfg.secretDoubleJump
    if (!s?.enabled || !this.secretWindowOpen) return
    if (verticalVelocity > s.preFallVyThreshold) return
    this.secretWindowTimer = Math.max(0, this.secretWindowTimer - delta)
    if (this.secretWindowTimer <= 0) {
      this.secretWindowOpen = false
      if (!this.secretSecondJumpTriggered) {
        this.slowmoRemainingSeconds = 0
      }
    }
    if (!this.isInSecretActivationZone()) {
      this.secretWindowOpen = false
      if (!this.secretSecondJumpTriggered) {
        this.slowmoRemainingSeconds = 0
      }
    }
  }

  // ── Fall time dilation ───────────────────────────────────────────────────

  /**
   * Configure or clear the fall time-dilation zone.
   * Pass `null` to disable and immediately restore real-time.
   */
  setFallTimeDilation(config: FallTimeDilationConfig | null): void {
    this._dilation = config
    if (!config) {
      this._dilationActive = false
      this._dilationCurrentScale = 1.0
    }
  }

  // ── Dev time control (used by SandboxSceneModule / SandboxView) ──────────

  setTimeScale(scale: number): void { this._devTimeScale = Math.max(0, scale) }
  getTimeScale(): number { return this._devTimeScale }
  stepOneFrame(): void { this._devPendingFrames++ }
  setStepFrameDelta(seconds: number): void { this._devStepDelta = Math.max(1e-4, seconds) }

  private tickFallDilation(
    snap: ReturnType<PlayerController['getSnapshot']>,
    character: THREE.Object3D,
  ): void {
    const cfg = this._dilation
    if (!cfg) return

    const minFallSpeed  = cfg.minFallSpeed ?? 4
    const dilationScale = cfg.dilationScale ?? 0.25
    const blendSpeed    = cfg.blendSpeed ?? 5

    const isFalling = !snap.grounded && snap.velocity.y < -minFallSpeed

    if (!this._dilationActive) {
      if (isFalling) {
        const { x, z } = character.position
        if (inDilationZone(cfg, x, z) && facingMatches(cfg, this.player.getFacing())) {
          this._dilationActive = true
        }
      }
    } else {
      if (!isFalling && snap.grounded) {
        this._dilationActive = false
      }
    }

    const targetScale = this._dilationActive ? dilationScale : 1.0
    const k = 1 - Math.exp(-blendSpeed * (1 / 60))
    this._dilationCurrentScale += (targetScale - this._dilationCurrentScale) * k
  }
}

// ─── Backward-compat aliases ───────────────────────────────────────────────────
// Engine-dev consumers used the old ThirdPersonSceneModule / ThirdPersonSceneConfig
// names before the rename. Keep re-exports so existing views and sandbox compile.
export { GameplaySceneModule as ThirdPersonSceneModule }
export type { GameplaySceneConfig as ThirdPersonSceneConfig }
