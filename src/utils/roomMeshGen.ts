/**
 * Procedural room mesh generator — Three.js geometry → GLB blobs.
 *
 * Structural conventions for editor-compatible GLBs:
 *
 *   1. ORIGIN PLACEMENT — the origin is the "anchor" the editor snaps to.
 *      • Floor/ceiling slabs: origin at the walk/interior surface (top of floor,
 *        bottom of ceiling). Place at y=0 or y=roomHeight respectively.
 *      • Wall panels: origin at bottom-center of the face. Place at y=0 facing
 *        inward; rotate Y to orient.
 *
 *   2. SCALE — 1 unit = 1 metre (Three.js default). All dimensions in metres.
 *
 *   3. SOLID GEOMETRY — use BoxGeometry for slabs (not PlaneGeometry). A slab
 *      with 0 thickness produces z-fighting at exact floor height and is
 *      invisible from below. 0.05 m is imperceptible but avoids both issues.
 *
 *   4. ONE MESH, ONE FILE — each reusable piece is its own GLB. The editor
 *      assigns an independent transform per placed instance, so composability
 *      requires separate assets (wall placed 4× with different rotationY).
 *
 *   5. NAMED NODES — mesh.name is preserved in the GLB and visible in the
 *      Three.js scene graph after import. Use snake_case.
 */

import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'

function meshToGLB(mesh: THREE.Mesh): Promise<Blob> {
  const root = new THREE.Scene()
  root.add(mesh)
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(
      root,
      (buf) => resolve(new Blob([buf as ArrayBuffer], { type: 'model/gltf-binary' })),
      reject,
      { binary: true },
    )
  })
}

// ─── Material factories ───────────────────────────────────────────────────────
// Palette: light sci-fi interior — pale ice floor, near-white walls, bright vault.

// Polished pale-blue floor, opaque.
const matFloor = () =>
  new THREE.MeshStandardMaterial({ color: 0xddeeff, roughness: 0.25, metalness: 0.05 })

// Wall panels: near-white, semi-transparent so orbit camera outside can see in.
const matWall = () =>
  new THREE.MeshStandardMaterial({
    color: 0xf2f8ff, roughness: 0.75, metalness: 0.05,
    transparent: true, opacity: 0.30,
    side: THREE.DoubleSide, depthWrite: false,
  })

// Kept for backward compat; vault replaces flat ceiling in seeds.
const matCeiling = () =>
  new THREE.MeshStandardMaterial({
    color: 0xf8fcff, roughness: 0.5, metalness: 0.05,
    transparent: true, opacity: 0.35,
    side: THREE.DoubleSide, depthWrite: false,
  })

// Glass: very light blue tint, highly transparent.
const matGlass = () =>
  new THREE.MeshStandardMaterial({
    color: 0xaaddff, roughness: 0.03, metalness: 0.05,
    transparent: true, opacity: 0.14,
    side: THREE.DoubleSide, depthWrite: false,
  })

// Vault shell + ribs: bright white, slightly transparent for camera.
const matVault = () =>
  new THREE.MeshStandardMaterial({
    color: 0xfdfeff, roughness: 0.35, metalness: 0.05,
    transparent: true, opacity: 0.65,
    side: THREE.DoubleSide, depthWrite: false,
  })

// Solid white for arch ribs — opaque structural elements.
const matArch = () =>
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.08 })

// ─── Piece generators ─────────────────────────────────────────────────────────

/**
 * Floor slab.
 *   • Dimensions:  width × 0.05 × depth
 *   • Origin:      top surface center — place at y=0, walk surface = y=0. ✓
 *   • Name:        space_home_floor
 */
export async function genFloor(
  width = 10,
  depth = 10,
): Promise<{ name: string; blob: Blob }> {
  const thickness = 0.05
  const geo = new THREE.BoxGeometry(width, thickness, depth)
  geo.translate(0, -thickness / 2, 0) // shift down so top face is at y=0
  const mesh = new THREE.Mesh(geo, matFloor())
  mesh.name = 'space_home_floor'
  return { name: 'space-home-floor.glb', blob: await meshToGLB(mesh) }
}

/**
 * Wall panel.
 *   • Dimensions:  width × height × 0.1
 *   • Origin:      bottom-center (both width and thickness centered, y=0 at base)
 *   • Name:        space_home_wall
 *   • Usage:       place at y=0 on the room boundary; rotate Y to face inward:
 *                    N wall → rotY=0      (faces +Z, outer face −Z)
 *                    S wall → rotY=π      (faces −Z, outer face +Z)
 *                    E wall → rotY=π/2   (faces −X, outer face +X)
 *                    W wall → rotY=−π/2  (faces +X, outer face −X)
 */
export async function genWall(
  width = 10,
  height = 3,
): Promise<{ name: string; blob: Blob }> {
  const thickness = 0.1
  const geo = new THREE.BoxGeometry(width, height, thickness)
  // Translate so origin is at the bottom of the wall, horizontally centered.
  // Z stays centered (inner/outer faces symmetric around origin).
  geo.translate(0, height / 2, 0)
  const mesh = new THREE.Mesh(geo, matWall())
  mesh.name = 'space_home_wall'
  return { name: `space-home-wall-${width}x${height}.glb`, blob: await meshToGLB(mesh) }
}

/**
 * Ceiling slab.
 *   • Dimensions:  width × 0.05 × depth
 *   • Origin:      bottom surface center — place at y=roomHeight, interior = y=roomHeight. ✓
 *   • Name:        space_home_ceiling
 */
export async function genCeiling(
  width = 10,
  depth = 10,
): Promise<{ name: string; blob: Blob }> {
  const thickness = 0.05
  const geo = new THREE.BoxGeometry(width, thickness, depth)
  geo.translate(0, thickness / 2, 0) // shift up so bottom face is at y=0
  const mesh = new THREE.Mesh(geo, matCeiling())
  mesh.name = 'space_home_ceiling'
  return { name: 'space-home-ceiling.glb', blob: await meshToGLB(mesh) }
}

/**
 * Barrel vault ceiling.
 *
 * Profile (XY cross-section): quadratic arc, spring line to spring line.
 *   P0=(−W/2, 0), control=(0, 2·rise), P2=(W/2, 0) → peak at (0, rise). ✓
 *   Outer arc offset by shell thickness t.
 * Extruded along +Z for room depth.
 *
 * Origin: spring-line center at z=0 end.
 * Place at (0, roomH, −roomD/2) so the vault spans the full room depth.
 */
export async function genVaultCeiling(
  width = 10,
  depth = 10,
  rise = 2.5,
): Promise<{ name: string; blob: Blob }> {
  const halfW = width / 2
  const t = 0.12  // shell thickness

  const shape = new THREE.Shape()
  shape.moveTo(-halfW, 0)
  shape.quadraticCurveTo(0, 2 * rise, halfW, 0)               // inner arc (faces room)
  shape.lineTo(halfW, t)
  shape.quadraticCurveTo(0, 2 * (rise + t), -halfW, t)        // outer arc
  shape.closePath()

  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
  const mesh = new THREE.Mesh(geo, matVault())
  mesh.name = 'space_home_vault'
  return { name: `space-home-vault-${width}x${depth}x${rise}.glb`, blob: await meshToGLB(mesh) }
}

/**
 * Arch rib — a thin structural arch spanning the room width.
 *
 * Same cross-section profile as the vault, but extruded only `ribW` metres deep,
 * creating a visible ring/rib. Matches the vault's rise so ribs sit flush with
 * the vault inner surface.
 *
 * Origin: spring-line center, with extrusion centred on z=0 (translate −ribW/2).
 * Place at (0, roomH, z) for each desired rib position along room depth.
 */
export async function genVaultRib(
  width = 10,
  rise = 2.5,
  ribW = 0.35,
): Promise<{ name: string; blob: Blob }> {
  const halfW = width / 2
  const t = 0.18  // rib thickness (thicker than vault shell for visual weight)

  const shape = new THREE.Shape()
  shape.moveTo(-halfW, 0)
  shape.quadraticCurveTo(0, 2 * rise, halfW, 0)
  shape.lineTo(halfW, -t)
  shape.quadraticCurveTo(0, 2 * (rise - t), -halfW, -t)
  shape.closePath()

  const geo = new THREE.ExtrudeGeometry(shape, { depth: ribW, bevelEnabled: false })
  geo.translate(0, 0, -ribW / 2)   // centre rib on its own origin

  const mesh = new THREE.Mesh(geo, matArch())
  mesh.name = 'space_home_rib'
  return { name: `space-home-rib-${width}x${rise}.glb`, blob: await meshToGLB(mesh) }
}

/**
 * Glass wall — bowed outward, curved profile, glass material.
 *
 * Shape (top-view, XZ plane):
 *   The profile is defined in shape-space XY where +Y = outward from room.
 *   After rotateX(-π/2): shape_Y → world_-Z (outward), extrude_Z → world_Y (height).
 *
 *   Bezier control point rule for midpoint = `bow`:
 *     at t=0.5 → Y = 0.5 * controlY   →   controlY = 2 * bow
 *
 *   Inner face: arc from (-half,0) → (half,0), peak at bow (bows outward).
 *   Outer face: arc from (half,t) → (-half,t), peak at bow+t (parallel surface).
 *
 *   • Origin:  bottom-center of the inner face edge (y=0 at floor, z=0 at room boundary).
 *   • Usage:   place at (0, 0, -roomD/2) with rotationY=0 for north wall.
 */
export async function genGlassWall(
  width = 10,
  height = 3,
  bow = 1.6,        // metres the centre bows outward (larger = more dramatic arc)
  thickness = 0.06, // glass pane thickness in metres
): Promise<{ name: string; blob: Blob }> {
  const half = width / 2
  const t = thickness

  // 2D profile: shape_X = world X, shape_Y > 0 = outward (→ world -Z after rotation)
  const shape = new THREE.Shape()
  shape.moveTo(-half, 0)
  shape.quadraticCurveTo(0, 2 * bow, half, 0)              // inner arc
  shape.lineTo(half, t)                                      // right edge (glass thickness)
  shape.quadraticCurveTo(0, 2 * bow + t, -half, t)         // outer arc
  shape.closePath()                                          // left edge back to start

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
  })

  // rotateX(-π/2): (x, y_s, z_e) → (x, z_e, -y_s)
  //   world_X = shape_X  ✓
  //   world_Y = extrude_Z (0→height)  ✓
  //   world_Z = -shape_Y (0=inner face, -bow=peak)  ✓
  geo.rotateX(-Math.PI / 2)

  const mesh = new THREE.Mesh(geo, matGlass())
  mesh.name = 'space_home_glass_wall'
  return { name: `space-home-glass-wall-${width}x${height}.glb`, blob: await meshToGLB(mesh) }
}
