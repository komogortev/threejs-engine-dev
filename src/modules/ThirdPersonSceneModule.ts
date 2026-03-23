import * as THREE from 'three'
import { BaseModule } from '@base/engine-core'
import type { EngineContext } from '@base/engine-core'
import type { ThreeContext } from '@base/threejs-engine'
import type { InputAxisEvent } from '@base/input'
import { SceneBuilder } from '@/scene/SceneBuilder'
import { TerrainSampler } from '@/scene/TerrainSampler'
import type { SceneDescriptor } from '@/scene/SceneDescriptor'

// Tied to CapsuleGeometry(0.35, 1.0): total height 1.7, pivot at centre.
const CHARACTER_HALF_HEIGHT = 0.85

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lerpAngle(current: number, target: number, t: number): number {
  let diff = target - current
  while (diff >  Math.PI) diff -= 2 * Math.PI
  while (diff < -Math.PI) diff += 2 * Math.PI
  return current + diff * Math.min(1, t)
}

// ─── Module ──────────────────────────────────────────────────────────────────

/**
 * ThirdPersonSceneModule — third-person character controller with an optional
 * terrain descriptor for shaped environments.
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

  private character!: THREE.Mesh
  private sampler?: TerrainSampler
  private effectiveRadius = 50

  private characterFacing = 0
  private readonly moveInput = { x: 0, y: 0 }

  private offInput: (() => void) | null = null
  private unregisterSystem: (() => void) | null = null

  // Reused each frame — no per-frame allocation
  private readonly _camDir    = new THREE.Vector3()
  private readonly _camRight  = new THREE.Vector3()
  private readonly _moveDir   = new THREE.Vector3()
  private readonly _camTarget = new THREE.Vector3()
  private readonly _lookAt    = new THREE.Vector3()

  constructor(options: Partial<ThirdPersonSceneConfig> & { descriptor?: SceneDescriptor } = {}) {
    super()
    const { descriptor, ...configOverrides } = options
    this.cfg        = { ...DEFAULT_CONFIG, ...configOverrides }
    this.descriptor = descriptor
  }

  // ─── Mount ──────────────────────────────────────────────────────────────────

  protected async onMount(_container: HTMLElement, context: EngineContext): Promise<void> {
    const ctx = context as ThreeContext

    if (this.descriptor) {
      const result = await SceneBuilder.build(ctx, this.descriptor)
      this.character       = result.character
      this.sampler         = result.sampler
      this.effectiveRadius = result.effectiveRadius
    } else {
      this.effectiveRadius = this.cfg.groundRadius
      this.character = this.buildDefaultScene(ctx)
    }

    this.initCamera(ctx.camera)

    this.offInput = context.eventBus.on('input:axis', (raw) => {
      const e = raw as InputAxisEvent
      if (e.axis === 'move') {
        this.moveInput.x = e.value.x
        this.moveInput.y = e.value.y
      }
    })

    this.unregisterSystem = ctx.registerSystem('third-person-scene', (delta) => {
      this.tick(delta, ctx)
    })
  }

  protected async onUnmount(): Promise<void> {
    this.unregisterSystem?.()
    this.offInput?.()

    const ctx = this.context as ThreeContext
    ctx.scene.clear()
    ctx.scene.background = null
    ctx.scene.fog        = null
  }

  // ─── Default flat-disc scene (no descriptor) ─────────────────────────────────

  private buildDefaultScene(ctx: ThreeContext): THREE.Mesh {
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
    character.position.set(0, CHARACTER_HALF_HEIGHT, 0)
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
    this.updateMovement(delta, ctx.camera)
    this.snapToTerrain()
    this.updateCamera(delta, ctx.camera)
  }

  private updateMovement(delta: number, camera: THREE.PerspectiveCamera): void {
    const { x, y } = this.moveInput
    if (Math.abs(x) < 0.01 && Math.abs(y) < 0.01) return

    // Camera-relative horizontal movement
    camera.getWorldDirection(this._camDir)
    this._camDir.y = 0
    this._camDir.normalize()

    this._camRight.crossVectors(this._camDir, THREE.Object3D.DEFAULT_UP).normalize()

    this._moveDir
      .copy(this._camDir).multiplyScalar(y)
      .addScaledVector(this._camRight, x)
      .normalize()

    const speed = this.cfg.characterSpeed
    this.character.position.x += this._moveDir.x * speed * delta
    this.character.position.z += this._moveDir.z * speed * delta

    // Clamp to playable disc
    const limit  = this.effectiveRadius - 1.5
    const distSq = this.character.position.x ** 2 + this.character.position.z ** 2
    if (distSq > limit * limit) {
      const d = Math.sqrt(distSq)
      this.character.position.x *= limit / d
      this.character.position.z *= limit / d
    }

    // Rotate to face movement direction
    // Three.js rotation.y=0 faces -Z. Target: atan2(-dx, -dz).
    const targetFacing = Math.atan2(-this._moveDir.x, -this._moveDir.z)
    this.characterFacing = lerpAngle(this.characterFacing, targetFacing, this.cfg.facingLerp * delta)
    this.character.rotation.y = this.characterFacing
  }

  /**
   * Snap character Y to terrain surface every frame.
   * No-op when no descriptor is provided (flat ground, character stays at y=0.85).
   */
  private snapToTerrain(): void {
    if (!this.sampler) return
    const groundY = this.sampler.sample(
      this.character.position.x,
      this.character.position.z,
    )
    this.character.position.y = groundY + CHARACTER_HALF_HEIGHT
  }

  private updateCamera(delta: number, camera: THREE.PerspectiveCamera): void {
    const { cameraDistance, cameraHeight, cameraLerp } = this.cfg

    // Spring-arm: stay behind character's current facing direction
    // Character's -Z in world space when facing=f is (-sin(f), 0, -cos(f)).
    // Behind = (sin(f), 0, cos(f)) × distance.
    this._camTarget.set(
      this.character.position.x + Math.sin(this.characterFacing) * cameraDistance,
      this.character.position.y + cameraHeight,
      this.character.position.z + Math.cos(this.characterFacing) * cameraDistance,
    )

    camera.position.lerp(this._camTarget, cameraLerp * delta)

    this._lookAt.copy(this.character.position).setY(this.character.position.y + 0.3)
    camera.lookAt(this._lookAt)
  }
}
