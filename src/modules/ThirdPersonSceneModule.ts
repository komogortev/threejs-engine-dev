import * as THREE from 'three'
import { BaseModule } from '@base/engine-core'
import type { EngineContext } from '@base/engine-core'
import type { ThreeContext } from '@base/threejs-engine'
import type { InputAxisEvent } from '@base/input'

// ─── Configuration ────────────────────────────────────────────────────────────

export interface ThirdPersonSceneConfig {
  /** Half-diameter of the playable ground disc in world units (default 50 = 100 unit diameter). */
  groundRadius: number
  groundColor: number
  fogColor: number
  /** Linear speed in world units per second. */
  characterSpeed: number
  /** How far behind the character the camera rests. */
  cameraDistance: number
  /** How far above the character's pivot the camera sits. */
  cameraHeight: number
  /** Camera position lerp speed — higher = snappier follow. */
  cameraLerp: number
  /** Character facing rotation lerp speed — higher = snappier turn. */
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Shortest-path angle interpolation — handles the -π/π wrap boundary.
 */
function lerpAngle(current: number, target: number, t: number): number {
  let diff = target - current
  while (diff > Math.PI) diff -= 2 * Math.PI
  while (diff < -Math.PI) diff += 2 * Math.PI
  return current + diff * Math.min(1, t)
}

// ─── Module ───────────────────────────────────────────────────────────────────

/**
 * ThirdPersonSceneModule — base template for any authored 3D scene.
 *
 * Provides:
 * - Bounded disc ground with atmospheric fog
 * - Capsule character placeholder (swap for GLTF later)
 * - Camera-relative movement mapped from @base/input axis events
 * - Spring-arm follow camera that stays behind the character's facing direction
 * - Cinematic three-point lighting rig
 *
 * Mount as a child of ThreeModule alongside InputModule:
 *   await engine.mountChild('input', new InputModule())
 *   await engine.mountChild('scene', new ThirdPersonSceneModule())
 *
 * The character's pivot is at world origin (0, 0, 0) on mount.
 * Override `onMount` / extend this class to layer scene-specific content on top.
 */
export class ThirdPersonSceneModule extends BaseModule {
  readonly id = 'third-person-scene'

  protected readonly cfg: ThirdPersonSceneConfig

  private character!: THREE.Mesh
  /** Y-axis rotation of the character, in radians. rotation.y = 0 faces -Z. */
  private characterFacing = 0

  /** Most recent move-axis value from @base/input. Updated via EventBus. */
  private readonly moveInput = { x: 0, y: 0 }

  private offInput: (() => void) | null = null
  private unregisterSystem: (() => void) | null = null

  /** Reusable vectors — allocated once to avoid GC pressure. */
  private readonly _camDir   = new THREE.Vector3()
  private readonly _camRight = new THREE.Vector3()
  private readonly _moveDir  = new THREE.Vector3()
  private readonly _camTarget = new THREE.Vector3()
  private readonly _lookAt    = new THREE.Vector3()

  constructor(config: Partial<ThirdPersonSceneConfig> = {}) {
    super()
    this.cfg = { ...DEFAULT_CONFIG, ...config }
  }

  // ─── Mount ───────────────────────────────────────────────────────────────────

  protected async onMount(_container: HTMLElement, context: EngineContext): Promise<void> {
    const ctx = context as ThreeContext

    this.buildScene(ctx)

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
    ctx.scene.fog = null
  }

  // ─── Scene setup ─────────────────────────────────────────────────────────────

  private buildScene(ctx: ThreeContext): void {
    const { fogColor, groundRadius } = this.cfg

    ctx.scene.background = new THREE.Color(fogColor)
    ctx.scene.fog = new THREE.FogExp2(fogColor, 0.012)

    this.addLights(ctx.scene)
    this.addGround(ctx.scene, groundRadius)
    this.addBoundaryRing(ctx.scene, groundRadius)
    this.character = this.addCharacter(ctx.scene)
    this.initCamera(ctx.camera)
  }

  private addLights(scene: THREE.Scene): void {
    // Ambient fill — cool slate
    scene.add(new THREE.AmbientLight(0x334155, 0.9))

    // Key light — warm, front-right above
    const key = new THREE.DirectionalLight(0xffeedd, 1.4)
    key.position.set(6, 12, 5)
    scene.add(key)

    // Rim light — indigo from behind-left, gives the music-clip silhouette
    const rim = new THREE.DirectionalLight(0x6d28d9, 1.0)
    rim.position.set(-6, 4, -8)
    scene.add(rim)
  }

  private addGround(scene: THREE.Scene, radius: number): void {
    const geo = new THREE.CylinderGeometry(radius, radius, 0.2, 72)
    const mat = new THREE.MeshStandardMaterial({
      color: this.cfg.groundColor,
      roughness: 0.9,
      metalness: 0.05,
    })
    const ground = new THREE.Mesh(geo, mat)
    ground.position.y = -0.1
    scene.add(ground)
  }

  /**
   * A thin emissive ring at the boundary edge — subtle visual cue without a wall.
   */
  private addBoundaryRing(scene: THREE.Scene, radius: number): void {
    const geo = new THREE.TorusGeometry(radius, 0.06, 8, 80)
    const mat = new THREE.MeshStandardMaterial({
      color: 0x4f46e5,
      emissive: 0x4f46e5,
      emissiveIntensity: 0.6,
      roughness: 0.4,
    })
    const ring = new THREE.Mesh(geo, mat)
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0
    scene.add(ring)
  }

  private addCharacter(scene: THREE.Scene): THREE.Mesh {
    // CapsuleGeometry(radius, length, capSegments, radialSegments)
    // Total height = length + 2 * radius = 1.0 + 0.7 = 1.7 — pivot at center (y = 0.85)
    const geo = new THREE.CapsuleGeometry(0.35, 1.0, 8, 16)
    const mat = new THREE.MeshStandardMaterial({
      color: 0x6366f1,
      roughness: 0.5,
      metalness: 0.2,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(0, 0.85, 0)
    scene.add(mesh)
    return mesh
  }

  private initCamera(camera: THREE.PerspectiveCamera): void {
    // Position camera directly behind character's initial facing direction (-Z)
    camera.position.set(0, this.cfg.cameraHeight, this.cfg.cameraDistance)
    camera.lookAt(0, 1, 0)
  }

  // ─── Per-frame tick ───────────────────────────────────────────────────────────

  private tick(delta: number, ctx: ThreeContext): void {
    this.updateCharacter(delta, ctx.camera)
    this.updateCamera(delta, ctx.camera)
  }

  private updateCharacter(delta: number, camera: THREE.PerspectiveCamera): void {
    const { x, y } = this.moveInput
    if (Math.abs(x) < 0.01 && Math.abs(y) < 0.01) return

    // ── Camera-relative movement ──────────────────────────────────────────────
    // Get camera's horizontal forward vector (flatten Y, re-normalise)
    camera.getWorldDirection(this._camDir)
    this._camDir.y = 0
    this._camDir.normalize()

    // Right = camDir × worldUp
    this._camRight.crossVectors(this._camDir, THREE.Object3D.DEFAULT_UP).normalize()

    // Combined move direction from both input axes
    this._moveDir
      .copy(this._camDir).multiplyScalar(y)
      .addScaledVector(this._camRight, x)
      .normalize()

    // ── Translate ─────────────────────────────────────────────────────────────
    const speed = this.cfg.characterSpeed
    this.character.position.x += this._moveDir.x * speed * delta
    this.character.position.z += this._moveDir.z * speed * delta

    // Clamp to ground radius (leave 1.5 u gap from edge)
    const limit = this.cfg.groundRadius - 1.5
    const distSq = this.character.position.x ** 2 + this.character.position.z ** 2
    if (distSq > limit * limit) {
      const d = Math.sqrt(distSq)
      this.character.position.x *= limit / d
      this.character.position.z *= limit / d
    }

    // ── Rotate character to face movement direction ────────────────────────────
    // In Three.js a mesh at rotation.y=0 faces -Z.
    // To face direction (dx, 0, dz): targetAngle = atan2(-dx, -dz).
    const targetFacing = Math.atan2(-this._moveDir.x, -this._moveDir.z)
    this.characterFacing = lerpAngle(this.characterFacing, targetFacing, this.cfg.facingLerp * delta)
    this.character.rotation.y = this.characterFacing
  }

  private updateCamera(delta: number, camera: THREE.PerspectiveCamera): void {
    const { cameraDistance, cameraHeight, cameraLerp } = this.cfg

    // Spring arm offset: always behind the character's current facing direction.
    // Character faces direction (-sin(f), 0, -cos(f)), so behind = (sin(f), h, cos(f)) * dist.
    this._camTarget
      .set(
        Math.sin(this.characterFacing) * cameraDistance,
        cameraHeight,
        Math.cos(this.characterFacing) * cameraDistance,
      )
      .add(this.character.position)

    camera.position.lerp(this._camTarget, cameraLerp * delta)

    // Look at character's chest, not ground pivot
    this._lookAt.copy(this.character.position).setY(this.character.position.y + 0.3)
    camera.lookAt(this._lookAt)
  }
}
