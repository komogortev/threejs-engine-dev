import * as THREE from 'three'
import { BaseModule } from '@base/engine-core'
import type { EngineContext } from '@base/engine-core'
import type { ThreeContext } from '@base/threejs-engine'
import type { InputActionEvent, InputAxisEvent } from '@base/input'
import { PlayerController, PLAYER_CAPSULE_HALF_HEIGHT } from '@/player/PlayerController'
import { SceneBuilder } from '@/scene/SceneBuilder'
import { EnvironmentRuntime } from '@/scene/EnvironmentRuntime'
import type { SceneDescriptor } from '@/scene/SceneDescriptor'
import type { TerrainSampler } from '@/scene/TerrainSampler'

// ─── Configuration ────────────────────────────────────────────────────────────

export interface ThirdPersonSceneConfig {
  /** Used only when no descriptor is provided (flat default scene). */
  groundRadius: number
  groundColor: number
  fogColor: number
  characterSpeed: number
  cameraDistance: number
  cameraHeight: number
  /** Camera position lerp speed — higher = snappier. */
  cameraLerp: number
  /** Character facing rotation lerp speed. */
  facingLerp: number
}

const DEFAULT_CONFIG: ThirdPersonSceneConfig = {
  groundRadius: 50,
  groundColor: 0x0f172a,
  fogColor: 0x080810,
  characterSpeed: 7,
  cameraDistance: 7,
  cameraHeight: 3.5,
  cameraLerp: 8,
  facingLerp: 12,
}

// ─── Module ──────────────────────────────────────────────────────────────────

/**
 * ThirdPersonSceneModule — third-person character controller with an optional
 * terrain descriptor for shaped environments.
 *
 * Locomotion state and rules live in {@link PlayerController}; this module wires
 * input, terrain snap, environment, and the follow camera rig.
 *
 * ## Basic usage (flat default scene)
 * ```ts
 * new ThirdPersonSceneModule({ characterSpeed: 8 })
 * ```
 *
 * ## With a terrain descriptor
 * ```ts
 * new ThirdPersonSceneModule({
 *   descriptor: {
 *     terrain: { radius: 50, features: [
 *       { type: 'hill', x: 15, z: -10, radius: 12, height: 6 },
 *       { type: 'lake', x: -14, z: -8, radius: 10, depth: 2 },
 *       { type: 'river', path: [[10, 12], [-12, -0.8, -8]], width: 4, depth: 1 },
 *     ]},
 *     atmosphere: { fogColor: 0x0a120a, fogDensity: 0.013 },
 *   },
 * })
 * ```
 *
 * Mount alongside InputModule as a child of ThreeModule:
 * ```ts
 * await engine.mountChild('input', new InputModule())
 * await engine.mountChild('scene', new ThirdPersonSceneModule({ ... }))
 * ```
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

  private readonly _camTarget = new THREE.Vector3()
  private readonly _lookAt = new THREE.Vector3()

  constructor(options: Partial<ThirdPersonSceneConfig> & { descriptor?: SceneDescriptor } = {}) {
    super()
    const { descriptor, ...configOverrides } = options
    this.cfg        = { ...DEFAULT_CONFIG, ...configOverrides }
    this.descriptor = descriptor
    this.player     = new PlayerController({
      characterSpeed: this.cfg.characterSpeed,
      facingLerp: this.cfg.facingLerp,
      terrainYOffset: PLAYER_CAPSULE_HALF_HEIGHT,
    })
  }

  /** Exposed for editor HUD / future game modules that read locomotion state. */
  getPlayerController(): PlayerController {
    return this.player
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
      this.environment      = EnvironmentRuntime.attachGame(ctx, this.descriptor.atmosphere ?? {})
    } else {
      this.effectiveRadius = this.cfg.groundRadius
      this.character = this.buildDefaultScene(ctx)
    }

    this.player.resetFacing(this.character.rotation.y)

    this.initCamera(ctx.camera)

    this.offInputAxis = context.eventBus.on('input:axis', (raw) => {
      const e = raw as InputAxisEvent
      if (e.axis === 'move') {
        this.player.setMoveIntent(e.value.x, e.value.y)
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
    const charPos = this.character.position
    camera.position.set(
      charPos.x,
      charPos.y + this.cfg.cameraHeight,
      charPos.z + this.cfg.cameraDistance,
    )
    camera.lookAt(charPos.x, charPos.y + 1, charPos.z)
  }

  // ─── Per-frame update ─────────────────────────────────────────────────────────

  private tick(delta: number, ctx: ThreeContext): void {
    this.player.tick(delta, {
      camera: ctx.camera,
      character: this.character,
      sampler: this.sampler,
      playableRadius: this.effectiveRadius,
    })
    this.updateCamera(delta, ctx.camera)
  }

  private updateCamera(delta: number, camera: THREE.PerspectiveCamera): void {
    const { cameraDistance, cameraHeight, cameraLerp } = this.cfg
    const facing = this.player.getFacing()

    this._camTarget.set(
      this.character.position.x + Math.sin(facing) * cameraDistance,
      this.character.position.y + cameraHeight,
      this.character.position.z + Math.cos(facing) * cameraDistance,
    )

    camera.position.lerp(this._camTarget, cameraLerp * delta)

    this._lookAt.copy(this.character.position).setY(this.character.position.y + 0.3)
    camera.lookAt(this._lookAt)
  }
}
