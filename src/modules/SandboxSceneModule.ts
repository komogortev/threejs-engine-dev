import * as THREE from 'three'
import type { EngineContext } from '@base/engine-core'
import type { ThreeContext } from '@base/threejs-engine'
import type { TerrainSurfaceSampler } from '@base/player-three'
import { ThirdPersonSceneModule, type ThirdPersonSceneConfig } from './GameplaySceneModule'
import type { SceneDescriptor } from '@base/scene-builder'

// ─── Hard-geometry definitions ─────────────────────────────────────────────────

interface PlatformDef {
  label: string
  color: number
  cx: number          // X centre of platform
  rampStartZ: number  // Z where ramp begins (ground level)
  rampEndZ: number    // Z where ramp ends / flat top begins (at height)
  topEndZ: number     // Z where the flat top ends (fall-off edge)
  width: number       // X extent
  height: number      // Peak height in metres
}

interface ObstacleDef {
  label: string
  color: number
  cx: number
  cz: number
  width: number   // X extent
  depth: number   // Z extent
  height: number
}

interface PoolDef {
  minX: number; maxX: number
  minZ: number; maxZ: number   // minZ = north (deep end), maxZ = south (shallow entry from ground)
  surfaceY: number             // floor Y at maxZ (south, shallow — character walks in here)
  depthY: number               // floor Y at minZ (north, deepest end)
}

// ─── Sandbox layout ────────────────────────────────────────────────────────────
//
// All ramps are PARALLEL — side by side along X, base at z=+20 (south), ascending
// northward (decreasing Z).  Ramp length = height × 2 → ≈ 26.6° slope, comfortably
// under the default maxWalkableSlopeDeg (35°).  All geometry stays within the 50 m
// terrain radius.  Character spawns at [0, 30] (south of all ramp bases).

const PLATFORMS: PlatformDef[] = [
  { label: 'soft',     color: 0x22d3ee, cx: -27, rampStartZ: 20, rampEndZ: 16,  topEndZ: 12,  width: 5, height: 2  },
  { label: 'medium',   color: 0x84cc16, cx: -20, rampStartZ: 20, rampEndZ: 12,  topEndZ: 8,   width: 5, height: 4  },
  { label: 'hard',     color: 0xfbbf24, cx: -13, rampStartZ: 20, rampEndZ: 6,   topEndZ: 2,   width: 5, height: 7  },
  { label: 'critical', color: 0xf97316, cx: -6,  rampStartZ: 20, rampEndZ: -2,  topEndZ: -6,  width: 5, height: 11 },
  { label: 'fatal',    color: 0xef4444, cx: 1,   rampStartZ: 20, rampEndZ: -24, topEndZ: -28, width: 5, height: 22 },
]

const OBSTACLES: ObstacleDef[] = [
  { label: 'knee (0.5 m)', color: 0xa78bfa, cx: 5, cz: -5, width: 2, depth: 0.5, height: 0.5 },
  { label: 'body (1.8 m)', color: 0xc084fc, cx: 9, cz: -5, width: 2, depth: 0.5, height: 1.8 },
]

const POOL: PoolDef = { minX: 15, maxX: 25, minZ: -25, maxZ: 25, surfaceY: 0, depthY: -25 }

// ─── Custom terrain sampler ────────────────────────────────────────────────────

/** Flat-base sampler overridden with hard-edged platform/obstacle/pool heights. */
class SandboxSampler implements TerrainSurfaceSampler {
  sample(x: number, z: number): number {
    // Pool floor takes priority (can go below 0).
    // south end (maxZ=25, near character start) = shallow (surfaceY=0),
    // north end (minZ=-25) = deep (depthY=-25).  t=0 at south, t=1 at north.
    if (x >= POOL.minX && x <= POOL.maxX && z >= POOL.minZ && z <= POOL.maxZ) {
      const t = (POOL.maxZ - z) / (POOL.maxZ - POOL.minZ)
      return POOL.surfaceY + (POOL.depthY - POOL.surfaceY) * t
    }
    let h = 0
    for (const p of PLATFORMS) h = Math.max(h, platformSample(x, z, p))
    for (const o of OBSTACLES)  h = Math.max(h, obstacleSample(x, z, o))
    return h
  }
}

function platformSample(x: number, z: number, p: PlatformDef): number {
  const hw = p.width / 2
  if (x < p.cx - hw || x > p.cx + hw) return 0
  // rampStartZ (south, +Z) > rampEndZ (north, −Z): ramp ascends as z decreases.
  if (z <= p.rampStartZ && z > p.rampEndZ) {
    return p.height * (p.rampStartZ - z) / (p.rampStartZ - p.rampEndZ)
  }
  if (z <= p.rampEndZ && z >= p.topEndZ) return p.height
  return 0
}

function obstacleSample(x: number, z: number, o: ObstacleDef): number {
  if (x >= o.cx - o.width / 2 && x <= o.cx + o.width / 2 &&
      z >= o.cz - o.depth / 2 && z <= o.cz + o.depth / 2) {
    return o.height
  }
  return 0
}

// ─── Module ────────────────────────────────────────────────────────────────────

export class SandboxSceneModule extends ThirdPersonSceneModule {
  private sandboxMeshes: THREE.Object3D[] = []

  constructor(options: Partial<ThirdPersonSceneConfig> & { descriptor?: SceneDescriptor } = {}) {
    super({
      ...options,
      // Enable diagnostic logging in the sandbox to help calibrate animations.
      debugJumpArc: true,
      debugClipResolution: true,
    })
  }

  protected override async onMount(container: HTMLElement, context: EngineContext): Promise<void> {
    await super.onMount(container, context)
    this.setSampler(new SandboxSampler())
    const ctx = context as ThreeContext
    this.buildSandboxGeometry(ctx.scene)
  }

  protected override async onUnmount(): Promise<void> {
    for (const m of this.sandboxMeshes) m.parent?.remove(m)
    this.sandboxMeshes = []
    await super.onUnmount()
  }

  // ─── Scene geometry ────────────────────────────────────────────────────────

  private buildSandboxGeometry(scene: THREE.Scene): void {
    this.addGrid(scene)
    for (const p of PLATFORMS) this.addPlatform(scene, p)
    for (const o of OBSTACLES)  this.addObstacle(scene, o)
    this.addPool(scene)
  }

  // ── 1 m world grid ──────────────────────────────────────────────────────────

  private addGrid(scene: THREE.Scene): void {
    const grid = new THREE.GridHelper(100, 100, 0x334155, 0x1e293b)
    grid.position.y = 0.01
    scene.add(grid)
    this.sandboxMeshes.push(grid)

    // Axis cross
    const mat = new THREE.LineBasicMaterial({ vertexColors: true })
    for (const [pts, cols] of [
      [[-50, 0.03, 0, 50, 0.03, 0], [1, 0.2, 0.2, 1, 0.2, 0.2]],
      [[0, 0.03, -50, 0, 0.03, 50], [0.2, 0.4, 1, 0.2, 0.4, 1]],
    ] as [number[], number[]][]) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3))
      geo.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(cols), 3))
      const line = new THREE.LineSegments(geo, mat)
      scene.add(line)
      this.sandboxMeshes.push(line)
    }
  }

  // ── Platforms: wedge ramp + flat top ───────────────────────────────────────

  private addPlatform(scene: THREE.Scene, p: PlatformDef): void {
    const mat = new THREE.MeshStandardMaterial({
      color: p.color, roughness: 0.55, metalness: 0.05,
      transparent: true, opacity: 0.88,
    })
    const wire = new THREE.LineBasicMaterial({ color: p.color })

    // ── Wedge (ramp) ──
    // rampStartZ (south) > rampEndZ (north): ramp ascends northward.
    // makeWedge tip is at local z=0, high end at local z=rampLen.
    // rotation.y = Math.PI flips local +Z to point south (world −Z = north),
    // so local z=0 sits at world rampStartZ and the wedge rises toward rampEndZ.
    const rampLen  = p.rampStartZ - p.rampEndZ   // always positive
    const wedge    = makeWedge(p.width, rampLen, p.height)
    const rampMesh = new THREE.Mesh(wedge, mat)
    rampMesh.rotation.y = Math.PI
    rampMesh.position.set(p.cx, 0, p.rampStartZ)
    rampMesh.renderOrder = 1
    scene.add(rampMesh)
    this.sandboxMeshes.push(rampMesh)

    const rampWire = new THREE.LineSegments(new THREE.EdgesGeometry(wedge), wire)
    rampWire.rotation.y = Math.PI
    rampWire.position.copy(rampMesh.position)
    scene.add(rampWire)
    this.sandboxMeshes.push(rampWire)

    // ── Flat top (box) ──
    const topLen    = Math.abs(p.topEndZ - p.rampEndZ)
    const topCenterZ = (p.rampEndZ + p.topEndZ) / 2
    const topGeo    = new THREE.BoxGeometry(p.width, p.height, topLen)
    const topMesh   = new THREE.Mesh(topGeo, mat)
    topMesh.position.set(p.cx, p.height / 2, topCenterZ)
    scene.add(topMesh)
    this.sandboxMeshes.push(topMesh)

    const topWire = new THREE.LineSegments(new THREE.EdgesGeometry(topGeo), wire)
    topWire.position.copy(topMesh.position)
    scene.add(topWire)
    this.sandboxMeshes.push(topWire)

    // Tier label marker south of ramp base (approach side).
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 0.06, 12),
      new THREE.MeshStandardMaterial({ color: p.color, emissive: p.color, emissiveIntensity: 0.5 }),
    )
    disc.position.set(p.cx, 0.03, p.rampStartZ + 1)
    scene.add(disc)
    this.sandboxMeshes.push(disc)
  }

  // ── Obstacles: solid boxes ──────────────────────────────────────────────────

  private addObstacle(scene: THREE.Scene, o: ObstacleDef): void {
    const mat = new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.5, metalness: 0.05 })
    const geo  = new THREE.BoxGeometry(o.width, o.height, o.depth)
    const box  = new THREE.Mesh(geo, mat)
    box.position.set(o.cx, o.height / 2, o.cz)
    scene.add(box)
    this.sandboxMeshes.push(box)

    const wire = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: o.color }))
    wire.position.copy(box.position)
    scene.add(wire)
    this.sandboxMeshes.push(wire)
  }

  // ── Pool: 3 hard walls + sloped floor ──────────────────────────────────────

  private addPool(scene: THREE.Scene): void {
    const w = POOL.maxX - POOL.minX     // 10 m
    const l = POOL.maxZ - POOL.minZ     // 50 m
    const d = Math.abs(POOL.depthY)     // 25 m (max depth)
    const mx = (POOL.minX + POOL.maxX) / 2
    const mz = (POOL.minZ + POOL.maxZ) / 2

    const wallMat  = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.7, metalness: 0.1 })
    const wireMat  = new THREE.LineBasicMaterial({ color: 0x38bdf8 })
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x0a1c38, roughness: 0.8, side: THREE.DoubleSide })

    const addWall = (geo: THREE.BoxGeometry, px: number, py: number, pz: number): void => {
      const mesh = new THREE.Mesh(geo, wallMat)
      mesh.position.set(px, py, pz)
      scene.add(mesh)
      this.sandboxMeshes.push(mesh)
      const wm = new THREE.LineSegments(new THREE.EdgesGeometry(geo), wireMat)
      wm.position.copy(mesh.position)
      scene.add(wm)
      this.sandboxMeshes.push(wm)
    }

    addWall(new THREE.BoxGeometry(0.4, d, l), POOL.minX - 0.2, -d / 2, mz)  // west
    addWall(new THREE.BoxGeometry(0.4, d, l), POOL.maxX + 0.2, -d / 2, mz)  // east
    // North wall (z = minZ = −25) — deep end; south (maxZ=25) is open entry from ground level.
    addWall(new THREE.BoxGeometry(w, d, 0.4), mx, -d / 2, POOL.minZ - 0.2)

    // Sloped floor: shallow at south (maxZ, Y=0), deep at north (minZ, Y=−25).
    // rotation.x = −(π/2 + slopeAngle) tilts the +Z edge (south) UP and −Z edge (north) DOWN.
    const slopeAngle = Math.atan2(d, l)  // ≈ 26.6°
    const hypotenuse = Math.sqrt(l * l + d * d)
    const floorGeo = new THREE.PlaneGeometry(w, hypotenuse, 1, 20)
    const floorMesh = new THREE.Mesh(floorGeo, floorMat)
    floorMesh.rotation.x = -(Math.PI / 2 + slopeAngle)
    floorMesh.position.set(mx, (POOL.surfaceY + POOL.depthY) / 2, mz)
    scene.add(floorMesh)
    this.sandboxMeshes.push(floorMesh)

    // Water surface plane at Y=0 covering only the pool XZ footprint.
    const waterGeo  = new THREE.PlaneGeometry(w, l)
    const waterMesh = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({
      color: 0x0a4f6f, transparent: true, opacity: 0.55,
      roughness: 0.1, metalness: 0.2, side: THREE.FrontSide,
      depthWrite: false,
    }))
    waterMesh.rotation.x = -Math.PI / 2
    waterMesh.position.set(mx, POOL.surfaceY + 0.02, mz)
    scene.add(waterMesh)
    this.sandboxMeshes.push(waterMesh)

    // Pool XZ perimeter line at water surface for visual clarity
    const corners: [number, number][] = [
      [POOL.minX, POOL.minZ], [POOL.maxX, POOL.minZ],
      [POOL.maxX, POOL.maxZ], [POOL.minX, POOL.maxZ],
      [POOL.minX, POOL.minZ],
    ]
    const pts: number[] = []
    for (const [cx, cz] of corners) pts.push(cx, 0.05, cz)
    const rimGeo = new THREE.BufferGeometry()
    rimGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3))
    const rim = new THREE.Line(rimGeo, wireMat)
    scene.add(rim)
    this.sandboxMeshes.push(rim)

    // Depth tick lines on pool floor (every 5 m) — south=shallow, north=deep.
    for (let i = 0; i <= 5; i++) {
      const t  = i / 5                                            // 0 = south (maxZ), 1 = north (minZ)
      const fz = POOL.maxZ - l * t                               // z decreasing northward
      const fy = POOL.surfaceY + (POOL.depthY - POOL.surfaceY) * t  // 0 at south, −25 at north
      const tickGeo = new THREE.BufferGeometry()
      tickGeo.setAttribute('position', new THREE.BufferAttribute(
        new Float32Array([POOL.minX, fy + 0.04, fz, POOL.maxX, fy + 0.04, fz]), 3,
      ))
      const c = new THREE.Color().setHSL(0.55, 0.8, 0.72 - t * 0.4)
      scene.add(new THREE.Line(tickGeo, new THREE.LineBasicMaterial({ color: c })))
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Triangular prism (wedge) geometry.
 * Local space: base at y=0, tip at (z=0, y=0), high end at (z=length, y=height).
 * X extends ±width/2 from centre.
 */
function makeWedge(width: number, length: number, height: number): THREE.BufferGeometry {
  const hw = width / 2

  // 6 vertices: low-front, low-back, high-back × 2 sides
  // prettier-ignore
  const verts = new Float32Array([
    // Left face (x = -hw)
    -hw, 0,      0,       // 0: ramp base start
    -hw, 0,      length,  // 1: ramp base end
    -hw, height, length,  // 2: ramp top end
    // Right face (x = +hw)
     hw, 0,      0,       // 3
     hw, 0,      length,  // 4
     hw, height, length,  // 5
  ])

  // Triangles (CCW winding, outward normal)
  // prettier-ignore
  const idx = new Uint16Array([
    // Left triangle face
    0, 2, 1,
    // Right triangle face
    3, 4, 5,
    // Bottom face
    0, 1, 4,  0, 4, 3,
    // Ramp slope face
    1, 2, 5,  1, 5, 4,
    // Back vertical face (high end)
    2, 3, 5,  2, 0, 3,
  ])

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
  geo.setIndex(new THREE.BufferAttribute(idx, 1))
  geo.computeVertexNormals()
  return geo
}
