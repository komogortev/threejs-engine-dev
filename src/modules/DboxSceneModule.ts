import * as THREE from 'three'
import type { EngineContext } from '@base/engine-core'
import type { ThreeContext } from '@base/threejs-engine'
import type { SceneDescriptor } from '@base/scene-builder'
import { SandboxSceneModule } from './SandboxSceneModule'
import type { ThirdPersonSceneConfig } from './GameplaySceneModule'

/**
 * OW1 Doomfist-adjacent tuning (see research): standard hero walk **5.5 m/s**, rocket punch
 * **~10–20 m** self-displacement with **~1.4 s** max charge and **4 s** CD, uppercut / slam **6 s** CD.
 * Planar carry peak speeds are scaled with {@link carryImpulseDecayPerSecond} **8** so asymptotic slide
 * distance is roughly **v / k** metres (≈10–20 m band at full charge).
 */
const CD_PUNCH_S = 4
const CD_UPPERCUT_S = 6
const CD_SLAM_S = 6
const PUNCH_CHARGE_MAX_S = 1.4
/** ~10 m slide at min charge (k≈8 → v≈10k). */
const PUNCH_SPEED_MIN = 78
/** ~20 m slide at full charge. */
const PUNCH_SPEED_MAX = 152
const UPPERCUT_FORWARD = 4
const UPPERCUT_UP = 14
const SLAM_DOWN = -20

/**
 * OW1 Rising Uppercut victim behaviour (Dec 11, 2018 patch notes / wiki): **~0.6 s** loss of air control —
 * represented here as no self-movement or ability use on the dummy NPC for that window while external
 * lift / gravity integration runs.
 */
const UPPERCUT_VICTIM_LOCK_S = 0.6
const UPPERCUT_HIT_RADIUS_XZ = 4.25
/** Total cone aperture in degrees (rough frontal arc). */
const UPPERCUT_HIT_CONE_DEG = 105
const UPPERCUT_HIT_MAX_Y_DELTA = 2.85
const UPPERCUT_NPC_LAUNCH_Y = 11.5
const UPPERCUT_NPC_OUTWARD_XZ = 2.4
/** Match {@link PlayerController} default gravity for coherent arcs. */
const UPPERCUT_NPC_GRAVITY = 30
const UPPERCUT_LOCK_EMISSIVE = 0.95
const BLOB_IDLE_EMISSIVE = 0.35

/** Pool AABB (matches `SandboxSceneModule`); blobs sit on dry ground outside this footprint. */
const POOL_MIN_X = 15
const POOL_MAX_X = 25
const POOL_MIN_Z = -25
const POOL_MAX_Z = 25

/** Five NPC blobs — grouped south / south-east of the shallow pool entry (world XZ). */
const BLOB_SPAWN_XZ: ReadonlyArray<readonly [number, number]> = [
  [19.0, 28.5],
  [22.5, 29.0],
  [21.0, 31.5],
  [17.5, 30.0],
  [24.0, 27.0],
]

const BLOB_RADIUS = 0.42
const BLOB_COLOR = 0xe879f9
const BLOB_EMISSIVE = 0x86198f

interface BlobNpc {
  mesh: THREE.Mesh
  vx: number
  vy: number
  vz: number
  /** While > 0, victim cannot move or use abilities (OW1 air-control lock). */
  lockRemaining: number
}

/**
 * Sandbox fixtures + OW1-tuned hero locomotion prototype + NPC blobs by the pool.
 * Rising Uppercut applies OW1-style victim lock and lift to blobs in frontal range.
 *
 * **Bindings:** **E** hold → release rocket punch · **Q** uppercut · **G** slam (air).
 */
export class DboxSceneModule extends SandboxSceneModule {
  private punchEHeld = false
  private punchHoldStartMs = 0
  private lastPunchMs = -1e9
  private lastUppercutMs = -1e9
  private lastSlamMs = -1e9
  private readonly keyCleanup: Array<() => void> = []
  private readonly blobs: BlobNpc[] = []

  constructor(options: Partial<ThirdPersonSceneConfig> & { descriptor?: SceneDescriptor } = {}) {
    super({
      ...options,
      characterSpeed: options.characterSpeed ?? 5.5,
      carryImpulseDecayPerSecond: options.carryImpulseDecayPerSecond ?? 8,
    })
  }

  protected override async onMount(container: HTMLElement, context: EngineContext): Promise<void> {
    await super.onMount(container, context)
    const ctx = context as ThreeContext
    this.spawnPoolBlobs(ctx.scene)
    this.mountAbilityKeys()
  }

  protected override async onUnmount(): Promise<void> {
    for (const off of this.keyCleanup) off()
    this.keyCleanup.length = 0
    for (const b of this.blobs) b.mesh.parent?.remove(b.mesh)
    this.blobs.length = 0
    await super.onUnmount()
  }

  protected override onAfterGameplayTick(simDelta: number, _ctx: ThreeContext): void {
    this.tickBlobNpcs(simDelta)
  }

  private mountAbilityKeys(): void {
    const onKeyDown = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement | undefined)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.repeat) return

      if (e.code === 'KeyE') {
        if (!this.punchEHeld) {
          this.punchEHeld = true
          this.punchHoldStartMs = performance.now()
        }
        e.preventDefault()
      } else if (e.code === 'KeyQ') {
        this.tryUppercut()
        e.preventDefault()
      } else if (e.code === 'KeyG') {
        this.trySlam()
        e.preventDefault()
      }
    }

    const onKeyUp = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement | undefined)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.code === 'KeyE' && this.punchEHeld) {
        this.punchEHeld = false
        this.fireRocketPunch()
        e.preventDefault()
      }
    }

    const opts: AddEventListenerOptions = { capture: true }
    window.addEventListener('keydown', onKeyDown, opts)
    window.addEventListener('keyup', onKeyUp, opts)
    this.keyCleanup.push(
      () => window.removeEventListener('keydown', onKeyDown, opts),
      () => window.removeEventListener('keyup', onKeyUp, opts),
    )
  }

  private spawnPoolBlobs(scene: THREE.Scene): void {
    const geo = new THREE.SphereGeometry(BLOB_RADIUS, 20, 16)

    for (let i = 0; i < BLOB_SPAWN_XZ.length; i += 1) {
      const [x, z] = BLOB_SPAWN_XZ[i]!
      const groundY = this.sampleTerrainSurfaceY(x, z)
      const mat = new THREE.MeshStandardMaterial({
        color: BLOB_COLOR,
        roughness: 0.35,
        metalness: 0.15,
        emissive: BLOB_EMISSIVE,
        emissiveIntensity: BLOB_IDLE_EMISSIVE,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.name = `dbox-npc-blob-${i + 1}`
      mesh.position.set(x, groundY + BLOB_RADIUS, z)
      mesh.castShadow = true
      mesh.receiveShadow = true
      scene.add(mesh)
      this.blobs.push({ mesh, vx: 0, vy: 0, vz: 0, lockRemaining: 0 })
    }
  }

  private tickBlobNpcs(dt: number): void {
    const g = UPPERCUT_NPC_GRAVITY
    for (const b of this.blobs) {
      const mat = b.mesh.material as THREE.MeshStandardMaterial
      if (b.lockRemaining > 0) {
        b.lockRemaining = Math.max(0, b.lockRemaining - dt)
        mat.emissiveIntensity = UPPERCUT_LOCK_EMISSIVE
      } else {
        mat.emissiveIntensity = BLOB_IDLE_EMISSIVE
      }

      const hasMotion = Math.abs(b.vx) > 1e-4 || Math.abs(b.vy) > 1e-4 || Math.abs(b.vz) > 1e-4
      if (!hasMotion && b.mesh.position.y <= this.sampleTerrainSurfaceY(b.mesh.position.x, b.mesh.position.z) + BLOB_RADIUS + 1e-3) {
        continue
      }

      b.mesh.position.x += b.vx * dt
      b.mesh.position.z += b.vz * dt
      b.mesh.position.y += b.vy * dt
      b.vy -= g * dt

      if (b.lockRemaining > 0) {
        const drag = Math.exp(-5.5 * dt)
        b.vx *= drag
        b.vz *= drag
      }

      const ground = this.sampleTerrainSurfaceY(b.mesh.position.x, b.mesh.position.z) + BLOB_RADIUS
      if (b.mesh.position.y <= ground && b.vy <= 0) {
        b.mesh.position.y = ground
        b.vx = 0
        b.vy = 0
        b.vz = 0
      }
    }
  }

  private applyUppercutToNearbyBlobs(): void {
    const char = this.getCharacter()
    const px = char.position.x
    const py = char.position.y
    const pz = char.position.z
    const facing = this.getPlayerController().getFacing()
    const fwdX = -Math.sin(facing)
    const fwdZ = -Math.cos(facing)
    const cosHalf = Math.cos(THREE.MathUtils.degToRad(UPPERCUT_HIT_CONE_DEG * 0.5))

    for (const b of this.blobs) {
      const bx = b.mesh.position.x
      const by = b.mesh.position.y
      const bz = b.mesh.position.z
      const dx = bx - px
      const dz = bz - pz
      const dist = Math.hypot(dx, dz)
      if (dist > UPPERCUT_HIT_RADIUS_XZ || dist < 1e-5) continue
      if (Math.abs(by - py) > UPPERCUT_HIT_MAX_Y_DELTA) continue
      const inv = 1 / dist
      const nx = dx * inv
      const nz = dz * inv
      const dot = nx * fwdX + nz * fwdZ
      if (dot < cosHalf) continue

      b.lockRemaining = UPPERCUT_VICTIM_LOCK_S
      b.vy = Math.max(b.vy, UPPERCUT_NPC_LAUNCH_Y)
      const ox = nx * UPPERCUT_NPC_OUTWARD_XZ
      const oz = nz * UPPERCUT_NPC_OUTWARD_XZ
      b.vx = ox + fwdX * 1.2
      b.vz = oz + fwdZ * 1.2
    }
  }

  private tryUppercut(): void {
    const t = performance.now()
    if (t * 0.001 - this.lastUppercutMs < CD_UPPERCUT_S) return
    const snap = this.getPlayerController().getSnapshot()
    if (snap.waterMode !== null) return

    const f = this.getPlayerController().getFacing()
    const fx = -Math.sin(f) * UPPERCUT_FORWARD
    const fz = -Math.cos(f) * UPPERCUT_FORWARD
    this.getPlayerController().addPlanarCarryImpulse(fx, fz)
    this.getPlayerController().applyVerticalAbilityImpulse(UPPERCUT_UP, this.getCharacter())
    this.applyUppercutToNearbyBlobs()
    this.lastUppercutMs = t * 0.001
  }

  private trySlam(): void {
    const t = performance.now()
    if (t * 0.001 - this.lastSlamMs < CD_SLAM_S) return
    const snap = this.getPlayerController().getSnapshot()
    if (snap.waterMode !== null) return
    if (snap.grounded) return

    const f = this.getPlayerController().getFacing()
    const fx = -Math.sin(f) * 2.5
    const fz = -Math.cos(f) * 2.5
    this.getPlayerController().addPlanarCarryImpulse(fx, fz)
    this.getPlayerController().applyVerticalAbilityImpulse(SLAM_DOWN, this.getCharacter())
    this.lastSlamMs = t * 0.001
  }

  private fireRocketPunch(): void {
    const t = performance.now() * 0.001
    if (t - this.lastPunchMs < CD_PUNCH_S) return
    const snap = this.getPlayerController().getSnapshot()
    if (snap.waterMode !== null) return

    const heldS = Math.min(PUNCH_CHARGE_MAX_S, Math.max(0, (performance.now() - this.punchHoldStartMs) * 0.001))
    const chargeT = PUNCH_CHARGE_MAX_S <= 1e-6 ? 1 : heldS / PUNCH_CHARGE_MAX_S
    const shaped = Math.pow(chargeT, 1.12)
    const speed = PUNCH_SPEED_MIN + (PUNCH_SPEED_MAX - PUNCH_SPEED_MIN) * shaped
    const f = this.getPlayerController().getFacing()
    const fx = -Math.sin(f) * speed
    const fz = -Math.cos(f) * speed
    this.getPlayerController().addPlanarCarryImpulse(fx, fz)
    this.lastPunchMs = t
  }
}

/** Pool bounds (matches sandbox layout). */
export const DBOX_POOL_BOUNDS = {
  minX: POOL_MIN_X,
  maxX: POOL_MAX_X,
  minZ: POOL_MIN_Z,
  maxZ: POOL_MAX_Z,
} as const
