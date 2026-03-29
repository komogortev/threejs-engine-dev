import * as THREE from 'three'
import type { TerrainSurfaceSampler } from '@base/player-three'

/**
 * Mesh-based terrain sampler — replaces the procedural `TerrainSampler` with
 * exact geometry from a loaded GLB collision mesh.
 *
 * Uses downward raycasting (Y=500 → Y=-∞) against a pre-collected flat list of
 * mesh objects. The collision GLB must already be added to the scene and have its
 * `matrixWorld` updated before this sampler is used.
 *
 * Limitation: top-down raycasting cannot sample the face of near-vertical surfaces
 * (steep hills, walls). Use `fallback` to provide a secondary sampler (e.g. the
 * procedural TerrainSampler) that handles missed positions gracefully.
 *
 * Performance: ~5 raycasts per frame (PlayerController footprint pattern).
 * For a simplified collision mesh (~10–50k triangles), Three.js native raycasting
 * is sufficient. Add `three-mesh-bvh` if frame budget tightens on complex geometry.
 */
export class MeshTerrainSampler implements TerrainSurfaceSampler {
  private readonly raycaster: THREE.Raycaster
  private readonly origin = new THREE.Vector3()
  private static readonly DOWN = new THREE.Vector3(0, -1, 0)
  private readonly meshes: THREE.Mesh[]
  private readonly fallback: TerrainSurfaceSampler | null

  /**
   * @param meshes   Pre-collected mesh objects from the collision GLB.
   * @param fallback Optional secondary sampler used when the ray misses (returns 0).
   *                 A procedural TerrainSampler works well here for steep slope coverage.
   */
  constructor(meshes: THREE.Mesh[], fallback: TerrainSurfaceSampler | null = null) {
    this.meshes = meshes
    this.fallback = fallback
    this.raycaster = new THREE.Raycaster(this.origin, MeshTerrainSampler.DOWN)
  }

  /**
   * Collect all Mesh objects from a GLB root for use as collision geometry.
   * Call after the root has been added to the scene and `updateMatrixWorld(true)` called.
   */
  static fromRoot(
    root: THREE.Object3D,
    fallback: TerrainSurfaceSampler | null = null,
  ): MeshTerrainSampler {
    const meshes: THREE.Mesh[] = []
    root.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh)
    })
    return new MeshTerrainSampler(meshes, fallback)
  }

  /**
   * Returns world Y at (x, z) by casting a ray downward from Y=500.
   * Falls back to the secondary sampler on a miss (steep slopes, off-mesh positions).
   */
  sample(x: number, z: number): number {
    this.origin.set(x, 500, z)
    const hits = this.raycaster.intersectObjects(this.meshes, false)
    if (hits.length > 0) return hits[0].point.y
    return this.fallback ? this.fallback.sample(x, z) : 0
  }
}
