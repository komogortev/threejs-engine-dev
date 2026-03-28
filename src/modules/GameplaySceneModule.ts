import * as THREE from 'three'
import { BaseModule } from '@base/engine-core'
import type { EngineContext } from '@base/engine-core'
import type { ThreeContext } from '@base/threejs-engine'
import type { InputActionEvent, InputAxisEvent } from '@base/input'
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
} from '@base/player-three'
import {
  EnvironmentRuntime,
  SceneBuilder,
  type SceneDescriptor,
  type TerrainSampler,
} from '@base/scene-builder'
import { createSceneBuildOptions } from '@/utils/sceneBuildOptions'

// ─── Configuration ────────────────────────────────────────────────────────────

export interface ThirdPersonSceneConfig {
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
   * Log jump arc telemetry (peak height, fall distance, air time) to the console on landing.
   * Passed through to {@link PlayerController} — useful for tuning jump feel in the sandbox.
   */
  debugJumpArc?: boolean
  /**
   * Log resolved animation clip names to the console when the CharacterAnimationRig initialises.
   * Helps diagnose missing or mismatched Mixamo clip names.
   */
  debugClipResolution?: boolean
}

// ─── Fall time dilation ──────────────────────────────────────────────────────

/**
 * Configuration for narrative fall time-dilation — slow-motion that activates
 * when the character falls within an authored zone.
 *
 * **Both** zone and direction conditions must pass for dilation to fire.
 * This lets you author a specific cliff edge moment ("walk south off this ledge")
 * without triggering everywhere a character can fall.
 *
 * @example
 * // Slow-mo only when falling south off the cliff at X=−20, Z=30
 * {
 *   zone: { type: 'circle', x: -20, z: 30, radius: 6 },
 *   facingAngle: Math.PI,   // character facing +Z (south)
 *   facingTolerance: Math.PI / 4,
 *   minFallSpeed: 4,
 *   dilationScale: 0.25,
 * }
 */
export interface FallTimeDilationConfig {
  /**
   * XZ zone in which dilation can activate — tested at the moment the character
   * leaves the ground (liftoff position).
   *
   * - `circle`: centre (x, z) + radius
   * - `aabb`:   axis-aligned rectangle minX/maxX/minZ/maxZ
   */
  zone:
    | { type: 'circle'; x: number; z: number; radius: number }
    | { type: 'aabb'; minX: number; maxX: number; minZ: number; maxZ: number }
  /**
   * Optional world-facing angle (radians, Three.js convention: 0 = +Z, CCW)
   * the character must be facing (within `±facingTolerance`) at liftoff.
   * When omitted, no facing constraint is applied.
   */
  facingAngle?: number
  /** Half-arc tolerance for the facing check (radians). Default **π/3** (60°). */
  facingTolerance?: number
  /**
   * Minimum downward speed (m/s, positive value) before dilation activates.
   * Prevents the effect from firing on tiny hops. Default **4**.
   */
  minFallSpeed?: number
  /** Simulation time scale while dilated. Default **0.25** (quarter speed). */
  dilationScale?: number
  /**
   * Exponential-approach speed (s⁻¹) for blending into / out of dilation.
   * Higher = snappier transition. Default **5**.
   */
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

const DEFAULT_CONFIG: ThirdPersonSceneConfig = {
  groundRadius: 50,
  groundColor: 0x0f172a,
  fogColor: 0x080810,
  characterSpeed: 7,
  cameraLerp: 8,
  facingLerp: 12,
  facingLerpThirdPerson: 5,
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
 * ThirdPersonSceneModule — third-person character controller with an optional
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
export class ThirdPersonSceneModule extends BaseModule {
  readonly id = 'third-person-scene'

  protected readonly cfg: ThirdPersonSceneConfig
  private readonly descriptor?: SceneDescriptor

  private readonly player: PlayerController

  private character!: THREE.Object3D
  private sampler?: TerrainSampler
  /** Allow subclasses (e.g. SandboxSceneModule) to inject a custom sampler after mount. */
  protected setSampler(s: TerrainSampler | undefined): void { this.sampler = s }
  private effectiveRadius = 50

  private offInputAxis: (() => void) | null = null
  private offInputAction: (() => void) | null = null
  private unregisterSystem: (() => void) | null = null
  private environment: EnvironmentRuntime | null = null

  private animRig: CharacterAnimationRig | null = null

  /** Merged per frame from `input:axis` `locomotion` (keyboard + gamepad may both emit). */
  private locoSprintOr = false
  private locoCrouchOr = false
  private locoJogOr = false

  /** Merged per frame from `input:axis` `look` (pointer lock / gamepad). */
  private lookYawAcc = 0
  private lookPitchAcc = 0
  /** First-person vertical aim (radians), passed to {@link GameplayCameraController}. */
  private fpPitch = 0
  private readonly fpPitchLimit = Math.PI / 2 - 0.15

  private readonly gameplayCam: GameplayCameraController
  private edgeCatchAnimTrigger = false
  private wallStumbleAnimTrigger = false
  private failedJumpAnimTrigger = false

  /** 0 = paused; 1 = real-time (default); other values slow / fast-forward. */
  private _timeScale = 1.0
  /** Pending single-frame advances when paused (each decrements by 1 after advancing). */
  private _pendingStepFrames = 0
  /** Fixed delta used when stepping a single frame (seconds; default 1/60). */
  private _stepFrameDelta = 1 / 60

  // ── Fall time dilation ────────────────────────────────────────────────────
  private _dilation: FallTimeDilationConfig | null = null
  /** Whether dilation is currently active (character is in qualifying fall). */
  private _dilationActive = false
  /** Horizontal facing angle (rad) at the moment the character left the ground. */
  private _dilationLiftoffFacing = 0
  /** Smoothed effective time scale that blends toward the dilation target. */
  private _dilationCurrentScale = 1.0

  constructor(
    options: Partial<ThirdPersonSceneConfig> & { descriptor?: SceneDescriptor } = {},
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

  // ─── Time control ────────────────────────────────────────────────────────────

  /**
   * Set the simulation time scale.
   * - `1.0` = real-time (default)
   * - `0.0` = paused; use {@link stepOneFrame} to advance one frame at a time
   * - `0.5` = half-speed slow-motion
   */
  setTimeScale(scale: number): void {
    this._timeScale = Math.max(0, scale)
  }

  getTimeScale(): number {
    return this._timeScale
  }

  /**
   * Advance exactly one simulation frame while paused (`timeScale === 0`).
   * Queues up; multiple calls before the next RAF fire accumulate.
   * No-ops when `timeScale > 0` (simulation is already running).
   */
  stepOneFrame(): void {
    this._pendingStepFrames++
  }

  /** Override the fixed delta (seconds) used for single-frame step. Default `1/60`. */
  setStepFrameDelta(seconds: number): void {
    this._stepFrameDelta = Math.max(1e-4, seconds)
  }

  // ─── Fall time dilation ────────────────────────────────────────────────────

  /**
   * Configure or clear the fall time-dilation zone.
   * When set, the scene will automatically slow time when the player falls within
   * the zone while facing the specified direction, and restore on landing.
   */
  setFallTimeDilation(config: FallTimeDilationConfig | null): void {
    this._dilation = config
    if (!config) {
      this._dilationActive = false
      this._dilationCurrentScale = 1.0
    }
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

  setCameraMode(mode: GameplayCameraMode): void {
    if (mode === 'third-person') {
      if (typeof document !== 'undefined' && document.exitPointerLock) {
        document.exitPointerLock()
      }
      this.fpPitch = 0
      this.lookYawAcc = 0
      this.lookPitchAcc = 0
      this.player.setMovementBasis('facing')
    } else {
      this.player.setMovementBasis('camera')
    }
    this.gameplayCam.setMode(mode)
    const ctx = this.context as ThreeContext | undefined
    if (ctx?.camera && this.character) {
      this.gameplayCam.snapToCharacter(
        ctx.camera,
        this.character,
        this.player.getFacing(),
        this.player.getCrouchGroundBlend(),
      )
    }
  }

  // ─── Mount ──────────────────────────────────────────────────────────────────

  protected async onMount(_container: HTMLElement, context: EngineContext): Promise<void> {
    const ctx = context as ThreeContext

    if (this.descriptor) {
      const result = await SceneBuilder.build(ctx, this.descriptor, createSceneBuildOptions())
      if (!result.character || result.characterTerrainYOffset === undefined) {
        throw new Error(
          'ThirdPersonSceneModule: SceneBuilder returned no character — remove skipPlayerCharacter from the descriptor.',
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
      // Wire swimmable volumes or fallback global sea level for water physics.
      const vols = this.descriptor?.swimmableVolumes
      if (vols && vols.length > 0) {
        this.player.setSwimmableVolumes(vols)
      } else {
        const seaLevel = this.descriptor?.terrain?.seaLevel
        if (seaLevel !== undefined && seaLevel !== 0) {
          this.player.setWaterSurfaceY(seaLevel)
        }
      }
      this.environment      = EnvironmentRuntime.attachGame(ctx, this.descriptor.atmosphere ?? {})
    } else {
      this.effectiveRadius = this.cfg.groundRadius
      this.character = this.buildDefaultScene(ctx)
    }

    this.player.resetFacing(this.character.rotation.y)
    this.animRig = new CharacterAnimationRig(this.character, {
      debugClipResolution: this.cfg.debugClipResolution,
    })

    this.initCamera(ctx.camera)

    if (this.gameplayCam.getMode() === 'first-person') {
      this.player.setMovementBasis('camera')
    }

    this.offInputAxis = context.eventBus.on('input:axis', (raw) => {
      const e = raw as InputAxisEvent
      if (e.axis === 'move') {
        this.player.setMoveIntent(e.value.x, e.value.y)
      }
      if (e.axis === 'locomotion') {
        this.locoSprintOr ||= e.value.x > 0.5
        this.locoCrouchOr ||= e.value.y > 0.5
        this.locoJogOr ||= (e.value.z ?? 0) > 0.5
      }
      if (e.axis === 'look') {
        this.lookYawAcc += e.value.x
        this.lookPitchAcc += e.value.y
      }
    })

    this.offInputAction = context.eventBus.on('input:action', (raw) => {
      const e = raw as InputActionEvent
      if (e.action === 'jump' && e.type === 'pressed') {
        this.player.notifyJumpPressed()
      }
    })

    this.unregisterSystem = ctx.registerSystem('third-person-scene', (rawDelta) => {
      let delta: number
      if (this._timeScale === 0) {
        if (this._pendingStepFrames > 0) {
          this._pendingStepFrames--
          delta = this._stepFrameDelta
        } else {
          return  // paused, no step pending
        }
      } else {
        delta = rawDelta * this._timeScale
      }
      this.environment?.update(delta)
      this.tick(delta, ctx)
    })
  }

  protected async onUnmount(): Promise<void> {
    this.unregisterSystem?.()
    this.offInputAxis?.()
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

  // ─── Camera init ─────────────────────────────────────────────────────────────

  private initCamera(camera: THREE.PerspectiveCamera): void {
    this.gameplayCam.snapToCharacter(
      camera,
      this.character,
      this.player.getFacing(),
      this.player.getCrouchGroundBlend(),
    )
  }

  // ─── Per-frame update ─────────────────────────────────────────────────────────

  private tick(delta: number, ctx: ThreeContext): void {
    const sprintHeld = this.locoSprintOr
    const crouchHeld = this.locoCrouchOr
    const jogHeld = this.locoJogOr
    this.locoSprintOr = false
    this.locoCrouchOr = false
    this.locoJogOr = false

    if (this.lookYawAcc !== 0 || this.lookPitchAcc !== 0) {
      if (this.gameplayCam.getMode() === 'first-person') {
        this.player.addFacingDelta(this.lookYawAcc)
        this.fpPitch = THREE.MathUtils.clamp(
          this.fpPitch + this.lookPitchAcc,
          -this.fpPitchLimit,
          this.fpPitchLimit,
        )
      } else {
        // Third-person orbit: cap per-frame yaw to facingLerpThirdPerson rate so camera orbit
        // feels the same speed as the character naturally turns while walking.
        const tpRate = this.cfg.facingLerpThirdPerson ?? this.cfg.facingLerp
        const maxYaw = tpRate * delta
        this.player.addFacingDelta(Math.max(-maxYaw, Math.min(maxYaw, this.lookYawAcc)))
      }
      this.lookYawAcc = 0
      this.lookPitchAcc = 0
    }

    const isThirdPerson = this.gameplayCam.getMode() === 'third-person'
    this.player.tick(delta, {
      camera: ctx.camera,
      character: this.character,
      sampler: this.sampler,
      playableRadius: this.effectiveRadius,
      facingLerpOverride: isThirdPerson
        ? (this.cfg.facingLerpThirdPerson ?? this.cfg.facingLerp)
        : undefined,
      sprintHeld,
      crouchHeld,
    })
    const movementEvents = this.player.consumeEvents()
    this.edgeCatchAnimTrigger = movementEvents.some((e) => e.type === 'edge_catch')
    this.wallStumbleAnimTrigger = movementEvents.some((e) => e.type === 'wall_stumble')
    this.failedJumpAnimTrigger = movementEvents.some((e) => e.type === 'jump_failed_high_ledge')

    const snap = this.player.getSnapshot()
    this.tickFallDilation(snap, this.character)

    this.animRig?.update(delta, this.character, snap.velocity, {
      crouch: snap.crouching,
      sprint: snap.sprinting,
      grounded: snap.grounded,
      jog: jogHeld,
      edgeCatchTrigger: this.edgeCatchAnimTrigger,
      wallStumbleTrigger: this.wallStumbleAnimTrigger,
      failedJumpTrigger: this.failedJumpAnimTrigger,
      waterMode: snap.waterMode,
    })
    this.edgeCatchAnimTrigger = false
    this.wallStumbleAnimTrigger = false
    this.failedJumpAnimTrigger = false

    const fpMode = this.gameplayCam.getMode() === 'first-person'
    this.gameplayCam.update(
      ctx.camera,
      delta,
      this.character,
      this.player.getFacing(),
      this.player.getCrouchGroundBlend(),
      fpMode ? this.fpPitch : 0,
    )
  }

  // ── Fall time dilation internal ────────────────────────────────────────────

  private tickFallDilation(
    snap: ReturnType<PlayerController['getSnapshot']>,
    character: THREE.Object3D,
  ): void {
    const cfg = this._dilation
    if (!cfg) return

    const minFallSpeed = cfg.minFallSpeed ?? 4
    const dilationScale = cfg.dilationScale ?? 0.25
    const blendSpeed   = cfg.blendSpeed ?? 5

    const isFalling = snap.mode === 'airborne' && snap.velocity.y < -minFallSpeed

    if (!this._dilationActive) {
      // Check activation: must be airborne in zone with matching facing at liftoff.
      if (isFalling) {
        const { x, z } = character.position
        const inZone = inDilationZone(cfg, x, z)
        const facingOk = facingMatches(cfg, this.player.getFacing())
        if (inZone && facingOk) {
          this._dilationActive = true
          this._dilationLiftoffFacing = this.player.getFacing()
        }
      }
    } else {
      // Deactivate on landing (or entering water — both exit airborne).
      if (!isFalling && snap.mode !== 'airborne') {
        this._dilationActive = false
      }
    }

    // Smooth blend toward target scale (exponential approach, frame-rate independent).
    const targetScale = this._dilationActive ? dilationScale : 1.0
    const k = 1 - Math.exp(-blendSpeed * (1 / 60))  // use fixed dt for stable k
    this._dilationCurrentScale += (targetScale - this._dilationCurrentScale) * k

    // Apply if meaningfully different from current manual timeScale (don't clobber pause).
    if (this._timeScale !== 0) {
      this._timeScale = this._dilationCurrentScale
    }
  }
}
