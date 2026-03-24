import * as THREE from 'three'
import { BaseModule } from '@base/engine-core'
import type { EngineContext } from '@base/engine-core'
import type { ThreeContext } from '@base/threejs-engine'
import type { InputActionEvent, InputAxisEvent } from '@base/input'
import {
  CharacterAnimationRig,
  PlayerController,
  PLAYER_CAPSULE_HALF_HEIGHT,
} from '@base/player-three'
import { SceneBuilder } from '@/scene/SceneBuilder'
import { EnvironmentRuntime } from '@/scene/EnvironmentRuntime'
import type { SceneDescriptor } from '@/scene/SceneDescriptor'
import type { TerrainSampler } from '@/scene/TerrainSampler'
import {
  type ThirdPersonCameraPreset,
  type ThirdPersonViewCam,
  THIRD_PERSON_CAMERA_PRESETS,
  resolveThirdPersonViewCam,
} from './thirdPersonCamera'

// ─── Configuration ────────────────────────────────────────────────────────────

export interface ThirdPersonSceneConfig {
  /** Used only when no descriptor is provided (flat default scene). */
  groundRadius: number
  groundColor: number
  fogColor: number
  characterSpeed: number
  /** Camera smoothing; higher = snappier. */
  cameraLerp: number
  /** Character facing rotation lerp speed. */
  facingLerp: number
  /** Starting rig; overridden by explicit camera* fields when provided. */
  cameraPreset?: ThirdPersonCameraPreset
  cameraDistance?: number
  cameraHeight?: number
  cameraLateralOffset?: number
  cameraPivotHeight?: number
}

const DEFAULT_CONFIG: ThirdPersonSceneConfig = {
  groundRadius: 50,
  groundColor: 0x0f172a,
  fogColor: 0x080810,
  characterSpeed: 7,
  cameraLerp: 8,
  facingLerp: 12,
}

// Re-export for consumers (SceneView, game modules).
export type { ThirdPersonCameraPreset, ThirdPersonViewCam }
export { THIRD_PERSON_CAMERA_PRESETS, THIRD_PERSON_CAMERA_PRESET_ORDER } from './thirdPersonCamera'

// ─── Module ──────────────────────────────────────────────────────────────────

/**
 * ThirdPersonSceneModule — third-person character controller with an optional
 * terrain descriptor for shaped environments.
 *
 * Locomotion state and rules live in {@link PlayerController}; this module wires
 * input, terrain snap, environment, follow camera rig, and optional skeletal
 * locomotion clips via {@link CharacterAnimationRig}.
 *
 * Camera: use `cameraPreset` (`close-follow` default) or override distance /
 * height / lateral / pivot. Call {@link setCameraPreset} at runtime for tactical views.
 */
export class ThirdPersonSceneModule extends BaseModule {
  readonly id = 'third-person-scene'

  protected readonly cfg: ThirdPersonSceneConfig
  private readonly descriptor?: SceneDescriptor

  private readonly player: PlayerController

  private character!: THREE.Object3D
  private sampler?: TerrainSampler
  private effectiveRadius = 50

  private offInputAxis: (() => void) | null = null
  private offInputAction: (() => void) | null = null
  private unregisterSystem: (() => void) | null = null
  private environment: EnvironmentRuntime | null = null

  private animRig: CharacterAnimationRig | null = null

  /** Merged per frame from `input:axis` `locomotion` (keyboard + gamepad may both emit). */
  private locoSprintOr = false
  private locoCrouchOr = false
  /** Smoothed 0–1 for camera height when crouching. */
  private crouchCameraBlend = 0

  private viewCam: ThirdPersonViewCam
  private activeCameraPreset: ThirdPersonCameraPreset

  private readonly _camTarget = new THREE.Vector3()
  private readonly _lookAt = new THREE.Vector3()

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
      ...configRest
    } = options
    this.cfg        = { ...DEFAULT_CONFIG, ...configRest }
    this.descriptor = descriptor
    this.activeCameraPreset = cameraPreset
    this.viewCam = resolveThirdPersonViewCam(cameraPreset, {
      distance: cameraDistance,
      height: cameraHeight,
      lateral: cameraLateralOffset,
      pivotY: cameraPivotHeight,
    })
    this.player = new PlayerController({
      characterSpeed: this.cfg.characterSpeed,
      facingLerp: this.cfg.facingLerp,
      terrainYOffset: PLAYER_CAPSULE_HALF_HEIGHT,
    })
  }

  getPlayerController(): PlayerController {
    return this.player
  }

  getCameraPreset(): ThirdPersonCameraPreset {
    return this.activeCameraPreset
  }

  /** Swap distance / height / lateral / pivot to a named rig (tactical, high, …). */
  setCameraPreset(preset: ThirdPersonCameraPreset): void {
    this.activeCameraPreset = preset
    this.viewCam = { ...THIRD_PERSON_CAMERA_PRESETS[preset] }
  }

  // ─── Mount ──────────────────────────────────────────────────────────────────

  protected async onMount(_container: HTMLElement, context: EngineContext): Promise<void> {
    const ctx = context as ThreeContext

    if (this.descriptor) {
      const result = await SceneBuilder.build(ctx, this.descriptor)
      this.character       = result.character
      this.sampler         = result.sampler
      this.effectiveRadius = result.effectiveRadius
      this.player.setTerrainYOffset(result.characterTerrainYOffset)
      const ch = this.descriptor?.character
      const fp =
        ch?.terrainFootprintRadius ?? (ch?.modelUrl?.trim() ? 0.22 : 0)
      this.player.setTerrainFootprintRadius(fp)
      this.environment      = EnvironmentRuntime.attachGame(ctx, this.descriptor.atmosphere ?? {})
    } else {
      this.effectiveRadius = this.cfg.groundRadius
      this.character = this.buildDefaultScene(ctx)
    }

    this.player.resetFacing(this.character.rotation.y)
    this.animRig = new CharacterAnimationRig(this.character)

    this.initCamera(ctx.camera)

    this.offInputAxis = context.eventBus.on('input:axis', (raw) => {
      const e = raw as InputAxisEvent
      if (e.axis === 'move') {
        this.player.setMoveIntent(e.value.x, e.value.y)
      }
      if (e.axis === 'locomotion') {
        this.locoSprintOr ||= e.value.x > 0.5
        this.locoCrouchOr ||= e.value.y > 0.5
      }
    })

    this.offInputAction = context.eventBus.on('input:action', (raw) => {
      const e = raw as InputActionEvent
      if (e.action === 'jump' && e.type === 'pressed') {
        this.player.notifyJumpPressed()
      }
    })

    this.unregisterSystem = ctx.registerSystem('third-person-scene', (delta) => {
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
    this.placeCamera(camera, this.player.getFacing(), 1)
  }

  // ─── Per-frame update ─────────────────────────────────────────────────────────

  private tick(delta: number, ctx: ThreeContext): void {
    const sprintHeld = this.locoSprintOr
    const crouchHeld = this.locoCrouchOr
    this.locoSprintOr = false
    this.locoCrouchOr = false

    this.player.tick(delta, {
      camera: ctx.camera,
      character: this.character,
      sampler: this.sampler,
      playableRadius: this.effectiveRadius,
      sprintHeld,
      crouchHeld,
    })

    const snap = this.player.getSnapshot()
    this.animRig?.update(delta, this.character, snap.velocity, {
      crouch: snap.crouching,
      sprint: snap.sprinting,
    })

    const kCam = 1 - Math.exp(-delta * 12)
    this.crouchCameraBlend = THREE.MathUtils.lerp(
      this.crouchCameraBlend,
      snap.crouching ? 1 : 0,
      kCam,
    )

    this.updateCamera(delta, ctx.camera)
  }

  /**
   * Camera sits behind the character along facing, plus lateral offset on XZ.
   * back = (sin(f), cos(f)) * distance in (x,z); right = (cos(f), -sin(f)) * lateral.
   */
  private placeCamera(camera: THREE.PerspectiveCamera, facing: number, lerpT: number): void {
    const { distance, height, lateral, pivotY } = this.viewCam
    const cb = this.crouchCameraBlend
    const effHeight = height * (1 - 0.2 * cb)
    const effPivot = pivotY * (1 - 0.35 * cb)
    const bx = Math.sin(facing) * distance
    const bz = Math.cos(facing) * distance
    const rx = Math.cos(facing) * lateral
    const rz = -Math.sin(facing) * lateral

    const p = this.character.position
    this._camTarget.set(p.x + bx + rx, p.y + effHeight, p.z + bz + rz)
    if (lerpT >= 1) {
      camera.position.copy(this._camTarget)
    } else {
      camera.position.lerp(this._camTarget, lerpT)
    }

    this._lookAt.copy(p).setY(p.y + effPivot)
    camera.lookAt(this._lookAt)
  }

  private updateCamera(delta: number, camera: THREE.PerspectiveCamera): void {
    const facing = this.player.getFacing()
    const t = Math.min(1, this.cfg.cameraLerp * delta)
    this.placeCamera(camera, facing, t)
  }
}
