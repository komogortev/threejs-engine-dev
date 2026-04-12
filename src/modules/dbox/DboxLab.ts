import * as THREE from 'three'
import type { EventBus } from '@base/engine-core'
import type { InputActionEvent } from '@base/input'
import type { ThreeContext } from '@base/threejs-engine'
import type { GameplayLabHost } from './GameplayLabHost'
import { RocketPunchPointer } from './rocketPunchPointer'

const CD_PUNCH_S = 4
const CD_UPPERCUT_S = 6
const CD_SLAM_S = 6
const PUNCH_CHARGE_MAX_S = 1.4
const PUNCH_SPEED_MIN = 78
const PUNCH_SPEED_MAX = 152
const PUNCH_SELF_LIFT_VY_MIN = 1.65
const PUNCH_SELF_LIFT_VY_MAX = 3.15
const UPPERCUT_FORWARD = 4
/** Rising uppercut — `replace` in air so it always wins over gravity/fall. */
const UPPERCUT_UP = 26
const SLAM_DOWN = -24
const SLAM_CONE_RANGE = 7.25
const SLAM_CONE_DEG = 86
const SLAM_CONE_SEG = 22
const SLAM_PREVIEW_Y = 0.045
/** When mouse ray misses usable ground — sample point along mouse XZ up to this distance (m) from player. */
const SLAM_MOUSE_FALLBACK_M = 20
const SLAM_RAY_T_STEP = 0.4
const SLAM_RAY_T_MAX = 280
const SLAM_RAY_HIT_EPS_M = 0.38
const SLAM_TO_APEX_SPEED_MIN = 8
const SLAM_TO_APEX_SPEED_MAX = 22
const UPPERCUT_VICTIM_LOCK_S = 0.6
const UPPERCUT_HIT_RADIUS_XZ = 4.25
const UPPERCUT_HIT_CONE_DEG = 105
const UPPERCUT_HIT_MAX_Y_DELTA = 2.85
const UPPERCUT_NPC_GRAVITY = 30
const PUNCH_SKIM_MIN_CARRY = 22
const UPPERCUT_LOCK_EMISSIVE = 0.95
const BLOB_IDLE_EMISSIVE = 0.35
const DEFAULT_UPPERCUT_NPC_MOVE_INTENT_FORWARD_BIAS = 0.85

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
  lockRemaining: number
}

export interface DboxLabOptions {
  uppercutNpcMoveIntentForwardBias?: number
}

interface SlamApex {
  x: number
  z: number
  ySurf: number
}

/**
 * OW1-style ability prototype + pool NPC blobs, composed into {@link DboxSceneModule}.
 * Keyboard abilities use `input:action` (`ability_primary` / `ability_secondary`); rocket punch uses {@link RocketPunchPointer}.
 */
export class DboxLab {
  private readonly uppercutNpcMoveIntentForwardBias: number
  private pendingRocketPunchHoldS: number | null = null
  private lastPunchMs = -1e9
  private lastUppercutMs = -1e9
  private lastSlamMs = -1e9
  private slamHoldActive = false
  private slamSuppressNextKeyUp = false
  private slamPreviewLine: THREE.Line | null = null
  private slamPreviewGeom: THREE.BufferGeometry | null = null
  private slamPreviewPos: THREE.BufferAttribute | null = null
  private slamHostCtx: ThreeContext | null = null
  private offInputAction: (() => void) | null = null
  private readonly blobs: BlobNpc[] = []
  private rocketPunch: RocketPunchPointer | null = null
  private pointerRoot: HTMLElement | null = null
  private readonly pointerCleanup: Array<() => void> = []
  private readonly slamRaycaster = new THREE.Raycaster()
  private readonly pointerNdc = new THREE.Vector2(0, 0)
  private readonly _rayO = new THREE.Vector3()
  private readonly _rayD = new THREE.Vector3()
  private readonly _rayP = new THREE.Vector3()
  private readonly _camFwd = new THREE.Vector3()

  constructor(
    private readonly host: GameplayLabHost,
    options: DboxLabOptions = {},
  ) {
    this.uppercutNpcMoveIntentForwardBias =
      options.uppercutNpcMoveIntentForwardBias ?? DEFAULT_UPPERCUT_NPC_MOVE_INTENT_FORWARD_BIAS
  }

  mount(container: HTMLElement, eventBus: EventBus, ctx: ThreeContext): void {
    this.slamHostCtx = ctx
    this.pointerRoot = container
    this.spawnPoolBlobs(ctx.scene)

    const onPointerMove = (e: PointerEvent): void => {
      const el = this.pointerRoot
      if (el == null) return
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return
      const nx = THREE.MathUtils.clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1)
      const ny = THREE.MathUtils.clamp(-((e.clientY - r.top) / r.height) * 2 + 1, -1, 1)
      this.pointerNdc.set(nx, ny)
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    this.pointerCleanup.push(() => window.removeEventListener('pointermove', onPointerMove))

    this.offInputAction = eventBus.on('input:action', (raw) => {
      const e = raw as InputActionEvent
      if (e.action === 'ability_primary' && e.type === 'pressed') {
        this.tryUppercut()
        return
      }
      if (e.action === 'ability_secondary') {
        if (e.type === 'pressed') this.tryBeginSlamHold()
        else this.tryReleaseSlamKey()
      }
    })

    this.rocketPunch = new RocketPunchPointer(
      container,
      () => this.host.getPlayerController().getSnapshot().waterMode === null,
      () => this.onRocketPunchChargeStart(),
      (heldS) => this.onRocketPunchChargeEnd(heldS),
      () => this.onRocketPunchChargeAbort(),
    )
    this.rocketPunch.mount()
  }

  unmount(): void {
    for (const off of this.pointerCleanup) off()
    this.pointerCleanup.length = 0
    this.pointerRoot = null
    this.offInputAction?.()
    this.offInputAction = null
    this.rocketPunch?.unmount()
    this.rocketPunch = null
    this.disposeSlamPreview()
    this.slamHostCtx = null
    for (const b of this.blobs) b.mesh.parent?.remove(b.mesh)
    this.blobs.length = 0
  }

  beforeGameplayTick(): void {
    this.flushPendingRocketPunch()
  }

  afterGameplayTick(simDelta: number, ctx: ThreeContext): void {
    if (this.slamHoldActive) {
      const snap = this.host.getPlayerController().getSnapshot()
      if (snap.waterMode !== null) {
        this.cancelSlamDueToInterrupt()
      } else {
        this.updateSlamPreview(ctx)
      }
    }
    this.tickBlobNpcs(simDelta)
  }

  handleJumpPressedEarly(): boolean {
    return this.host.getPlayerController().tryActivateRocketPunchSkimJump(
      this.host.getCharacter(),
      PUNCH_SKIM_MIN_CARRY,
    )
  }

  private onRocketPunchChargeStart(): void {
    this.cancelSlamDueToInterrupt()
    this.pendingRocketPunchHoldS = null
  }

  private onRocketPunchChargeEnd(heldSecondsRaw: number): void {
    const heldS = Math.min(
      PUNCH_CHARGE_MAX_S,
      Math.max(0, heldSecondsRaw),
    )
    const snap = this.host.getPlayerController().getSnapshot()
    if (snap.waterMode !== null) return
    if (!this.fireRocketPunchFromHoldSeconds(heldS)) {
      this.pendingRocketPunchHoldS = heldS
    }
  }

  private onRocketPunchChargeAbort(): void {
    this.pendingRocketPunchHoldS = null
    this.cancelSlamDueToBlur()
  }

  private cancelSlamDueToInterrupt(): void {
    if (!this.slamHoldActive) return
    this.slamHoldActive = false
    this.slamSuppressNextKeyUp = true
    this.setSlamPreviewVisible(false)
  }

  private cancelSlamDueToBlur(): void {
    this.cancelSlamDueToInterrupt()
  }

  private tryBeginSlamHold(): void {
    if (this.slamHoldActive) return
    const snap = this.host.getPlayerController().getSnapshot()
    if (snap.waterMode !== null) return
    this.slamSuppressNextKeyUp = false
    this.slamHoldActive = true
    const slamCtx = this.slamHostCtx
    if (slamCtx) {
      this.ensureSlamPreviewLine(slamCtx)
      this.updateSlamPreview(slamCtx)
    }
  }

  private tryReleaseSlamKey(): void {
    if (this.slamSuppressNextKeyUp) {
      this.slamSuppressNextKeyUp = false
      this.setSlamPreviewVisible(false)
      return
    }
    if (!this.slamHoldActive) return
    this.slamHoldActive = false
    this.setSlamPreviewVisible(false)
    this.executeSlamOnKeyRelease()
  }

  private executeSlamOnKeyRelease(): void {
    const t = performance.now() * 0.001
    if (t - this.lastSlamMs < CD_SLAM_S) return
    const snap = this.host.getPlayerController().getSnapshot()
    if (snap.waterMode !== null) return
    const ctx = this.slamHostCtx
    if (ctx == null) return

    const land = this.resolveSlamApex(ctx)
    const f = this.host.getPlayerController().getFacing()
    const px = snap.position.x
    const pz = snap.position.z
    const dx = land.x - px
    const dz = land.z - pz
    const dist = Math.hypot(dx, dz)
    if (dist > 0.06) {
      const inv = 1 / dist
      const v = THREE.MathUtils.clamp(
        SLAM_TO_APEX_SPEED_MIN + dist * 0.75,
        SLAM_TO_APEX_SPEED_MIN,
        SLAM_TO_APEX_SPEED_MAX,
      )
      this.host.getPlayerController().setPlanarCarryVelocity(dx * inv * v, dz * inv * v)
    } else {
      this.host.getPlayerController().setPlanarCarryVelocity(0, 0)
    }

    this.host.getPlayerController().applyVerticalAbilityImpulse(SLAM_DOWN, this.host.getCharacter(), {
      verticalBlend: 'replace',
    })
    this.applySlamToBlobsInCone(land.x, land.z, land.ySurf, f)

    this.lastSlamMs = t
  }

  /**
   * Slam apex: mouse ray vs {@link GameplayLabHost#sampleTerrainSurfaceY} (first downward hit inside play disc);
   * else a point up to {@link SLAM_MOUSE_FALLBACK_M} along mouse XZ from the player, clamped to the play disc.
   */
  private resolveSlamApex(ctx: ThreeContext): SlamApex {
    const cam = ctx.camera
    this.slamRaycaster.setFromCamera(this.pointerNdc, cam)
    this._rayO.copy(this.slamRaycaster.ray.origin)
    this._rayD.copy(this.slamRaycaster.ray.direction).normalize()

    const hit = this.raycastTerrainAlongMouse(this._rayO, this._rayD)
    const R = this.host.getPlayableRadius() * 1.01
    if (hit && Math.hypot(hit.x, hit.z) <= R) {
      return { x: hit.x, z: hit.z, ySurf: hit.ySurf }
    }
    return this.slamMouseFallbackXZ(ctx)
  }

  /**
   * First ray segment below `sampleTerrain` (camera → ground). Requires mostly downward ray.
   * @returns world XZ + surface Y, or `null` when no crossing is found.
   */
  private raycastTerrainAlongMouse(O: THREE.Vector3, D: THREE.Vector3): SlamApex | null {
    if (D.y > -0.03) return null
    let startedAbove = false
    for (let t = 0.12; t < SLAM_RAY_T_MAX; t += SLAM_RAY_T_STEP) {
      this._rayP.copy(O).addScaledVector(D, t)
      const gy = this.host.sampleTerrainSurfaceY(this._rayP.x, this._rayP.z)
      if (this._rayP.y > gy + 0.22) startedAbove = true
      if (startedAbove && this._rayP.y <= gy + SLAM_RAY_HIT_EPS_M) {
        return { x: this._rayP.x, z: this._rayP.z, ySurf: gy }
      }
    }
    return null
  }

  private slamMouseFallbackXZ(ctx: ThreeContext): SlamApex {
    const snap = this.host.getPlayerController().getSnapshot()
    const px = snap.position.x
    const pz = snap.position.z
    this._rayO.copy(this.slamRaycaster.ray.origin)
    this._rayD.copy(this.slamRaycaster.ray.direction)
    let dx = this._rayD.x
    let dz = this._rayD.z
    const flatLen = Math.hypot(dx, dz)
    if (flatLen < 1e-4) {
      ctx.camera.getWorldDirection(this._camFwd)
      dx = this._camFwd.x
      dz = this._camFwd.z
    } else {
      dx /= flatLen
      dz /= flatLen
    }
    let fx = px + dx * SLAM_MOUSE_FALLBACK_M
    let fz = pz + dz * SLAM_MOUSE_FALLBACK_M
    const R = this.host.getPlayableRadius()
    const rad = Math.hypot(fx, fz)
    if (rad > R) {
      const s = R / rad
      fx *= s
      fz *= s
    }
    const ySurf = this.host.sampleTerrainSurfaceY(fx, fz)
    return { x: fx, z: fz, ySurf }
  }

  private ensureSlamPreviewLine(ctx: ThreeContext): void {
    if (this.slamPreviewLine) return
    const maxVerts = SLAM_CONE_SEG + 4
    const arr = new Float32Array(maxVerts * 3)
    const attr = new THREE.BufferAttribute(arr, 3)
    attr.setUsage(THREE.DynamicDrawUsage)
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', attr)
    geom.setDrawRange(0, 0)
    const mat = new THREE.LineBasicMaterial({
      color: 0xff7a18,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    })
    const line = new THREE.LineLoop(geom, mat)
    line.name = 'dbox-slam-preview'
    line.frustumCulled = false
    line.renderOrder = 900
    ctx.scene.add(line)
    this.slamPreviewLine = line
    this.slamPreviewGeom = geom
    this.slamPreviewPos = attr
  }

  private disposeSlamPreview(): void {
    const line = this.slamPreviewLine
    if (line) {
      line.removeFromParent()
      line.geometry.dispose()
      ;(line.material as THREE.Material).dispose()
    }
    this.slamPreviewLine = null
    this.slamPreviewGeom = null
    this.slamPreviewPos = null
  }

  private setSlamPreviewVisible(visible: boolean): void {
    if (this.slamPreviewLine) this.slamPreviewLine.visible = visible
  }

  private updateSlamPreview(ctx: ThreeContext): void {
    this.ensureSlamPreviewLine(ctx)
    const land = this.resolveSlamApex(ctx)
    const f = this.host.getPlayerController().getFacing()
    const n = this.writeSlamConeOutlinePositions(land.x, land.z, f)
    const geom = this.slamPreviewGeom
    const attr = this.slamPreviewPos
    if (!geom || !attr) return
    geom.setDrawRange(0, n)
    attr.needsUpdate = true
    geom.computeBoundingSphere()
    this.setSlamPreviewVisible(true)
  }

  private writeSlamConeOutlinePositions(landX: number, landZ: number, facing: number): number {
    const attr = this.slamPreviewPos
    if (!attr) return 0
    const w = attr.array as Float32Array
    const fwdX = -Math.sin(facing)
    const fwdZ = -Math.cos(facing)
    const half = THREE.MathUtils.degToRad(SLAM_CONE_DEG * 0.5)
    const R = SLAM_CONE_RANGE
    let o = 0
    const y0 = this.host.sampleTerrainSurfaceY(landX, landZ) + SLAM_PREVIEW_Y
    w[o++] = landX
    w[o++] = y0
    w[o++] = landZ
    for (let i = 0; i <= SLAM_CONE_SEG; i += 1) {
      const u = SLAM_CONE_SEG <= 0 ? 0 : i / SLAM_CONE_SEG
      const ang = -half + 2 * half * u
      const c = Math.cos(ang)
      const s = Math.sin(ang)
      const dx = fwdX * c - fwdZ * s
      const dz = fwdZ * c + fwdX * s
      const x = landX + dx * R
      const z = landZ + dz * R
      w[o++] = x
      w[o++] = this.host.sampleTerrainSurfaceY(x, z) + SLAM_PREVIEW_Y
      w[o++] = z
    }
    return SLAM_CONE_SEG + 2
  }

  private applySlamToBlobsInCone(landX: number, landZ: number, ySurf: number, facing: number): void {
    const fwdX = -Math.sin(facing)
    const fwdZ = -Math.cos(facing)
    const cosHalf = Math.cos(THREE.MathUtils.degToRad(SLAM_CONE_DEG * 0.5))
    const y0 = ySurf + SLAM_PREVIEW_Y
    for (const b of this.blobs) {
      const bx = b.mesh.position.x
      const bz = b.mesh.position.z
      const dx = bx - landX
      const dz = bz - landZ
      const dist = Math.hypot(dx, dz)
      if (dist > SLAM_CONE_RANGE || dist < 1e-4) continue
      const inv = 1 / dist
      const nx = dx * inv
      const nz = dz * inv
      const dot = nx * fwdX + nz * fwdZ
      if (dot < cosHalf) continue
      if (b.mesh.position.y < y0 - 2.5 || b.mesh.position.y > y0 + 6) continue

      b.vy = Math.min(b.vy, SLAM_DOWN * 0.35)
      const knock = 3.2
      b.vx += nx * knock
      b.vz += nz * knock
    }
  }

  private spawnPoolBlobs(scene: THREE.Scene): void {
    const geo = new THREE.SphereGeometry(BLOB_RADIUS, 20, 16)

    for (let i = 0; i < BLOB_SPAWN_XZ.length; i += 1) {
      const [x, z] = BLOB_SPAWN_XZ[i]!
      const groundY = this.host.sampleTerrainSurfaceY(x, z)
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
      if (
        !hasMotion &&
        b.mesh.position.y <=
          this.host.sampleTerrainSurfaceY(b.mesh.position.x, b.mesh.position.z) + BLOB_RADIUS + 1e-3
      ) {
        continue
      }

      b.mesh.position.x += b.vx * dt
      b.mesh.position.z += b.vz * dt
      b.mesh.position.y += b.vy * dt
      b.vy -= g * dt

      const kCarry = this.host.getCarryImpulseDecayPerSecond()
      const carryDecay = Math.exp(-kCarry * dt)
      b.vx *= carryDecay
      b.vz *= carryDecay

      const ground =
        this.host.sampleTerrainSurfaceY(b.mesh.position.x, b.mesh.position.z) + BLOB_RADIUS
      if (b.mesh.position.y <= ground && b.vy <= 0) {
        b.mesh.position.y = ground
        b.vx = 0
        b.vy = 0
        b.vz = 0
      }
    }
  }

  private applyUppercutToNearbyBlobs(): void {
    const char = this.host.getCharacter()
    const px = char.position.x
    const py = char.position.y
    const pz = char.position.z
    const facing = this.host.getPlayerController().getFacing()
    const fwdX = -Math.sin(facing)
    const fwdZ = -Math.cos(facing)
    const cosHalf = Math.cos(THREE.MathUtils.degToRad(UPPERCUT_HIT_CONE_DEG * 0.5))
    const snap = this.host.getPlayerController().getSnapshot()
    const forwardIntent01 = THREE.MathUtils.clamp(snap.moveIntent.y, 0, 1)
    const planarForward =
      UPPERCUT_FORWARD + forwardIntent01 * this.uppercutNpcMoveIntentForwardBias

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
      b.vy = Math.max(b.vy, UPPERCUT_UP)
      b.vx = fwdX * planarForward
      b.vz = fwdZ * planarForward
    }
  }

  private tryUppercut(): void {
    this.cancelSlamDueToInterrupt()
    const t = performance.now()
    if (t * 0.001 - this.lastUppercutMs < CD_UPPERCUT_S) return
    const snap = this.host.getPlayerController().getSnapshot()
    if (snap.waterMode !== null) return

    const f = this.host.getPlayerController().getFacing()
    const fx = -Math.sin(f) * UPPERCUT_FORWARD
    const fz = -Math.cos(f) * UPPERCUT_FORWARD
    this.host.getPlayerController().addPlanarCarryImpulse(fx, fz)
    this.host.getPlayerController().applyVerticalAbilityImpulse(UPPERCUT_UP, this.host.getCharacter(), {
      verticalBlend: 'replace',
    })
    this.applyUppercutToNearbyBlobs()
    this.lastUppercutMs = t * 0.001
  }

  private flushPendingRocketPunch(): void {
    if (this.pendingRocketPunchHoldS == null) return
    const snap = this.host.getPlayerController().getSnapshot()
    if (snap.waterMode !== null) {
      this.pendingRocketPunchHoldS = null
      return
    }
    if (this.fireRocketPunchFromHoldSeconds(this.pendingRocketPunchHoldS)) {
      this.pendingRocketPunchHoldS = null
    }
  }

  private fireRocketPunchFromHoldSeconds(heldS: number): boolean {
    const t = performance.now() * 0.001
    if (t - this.lastPunchMs < CD_PUNCH_S) return false
    const snap = this.host.getPlayerController().getSnapshot()
    if (snap.waterMode !== null) return false

    this.cancelSlamDueToInterrupt()

    const chargeT = PUNCH_CHARGE_MAX_S <= 1e-6 ? 1 : heldS / PUNCH_CHARGE_MAX_S
    const shaped = Math.pow(chargeT, 1.12)
    const speed = PUNCH_SPEED_MIN + (PUNCH_SPEED_MAX - PUNCH_SPEED_MIN) * shaped
    const f = this.host.getPlayerController().getFacing()
    const fx = -Math.sin(f) * speed
    const fz = -Math.cos(f) * speed
    this.host.getPlayerController().setPlanarCarryVelocity(fx, fz)
    const liftVy =
      PUNCH_SELF_LIFT_VY_MIN + (PUNCH_SELF_LIFT_VY_MAX - PUNCH_SELF_LIFT_VY_MIN) * shaped
    this.host.getPlayerController().applyVerticalAbilityImpulse(liftVy, this.host.getCharacter(), {
      verticalBlend: 'replace',
    })
    this.lastPunchMs = t
    return true
  }
}
