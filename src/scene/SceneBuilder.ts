import * as THREE from 'three'
import type { ThreeContext } from '@base/threejs-engine'
import type {
  SceneDescriptor,
  LightDescriptor,
  TerrainDescriptor,
  SceneObject,
  PlacedObject,
  ScatterField,
  PrimitiveType,
} from './SceneDescriptor'
import { TerrainSampler } from './TerrainSampler'
import { type HeightmapData, loadHeightmap } from './HeightmapLoader'
import { PrimitiveFactory, PRIMITIVE_BASE_OFFSETS } from './PrimitiveFactory'
import { createSeeder } from './Seeder'

/** Pivot-centre-to-ground distance for the default CapsuleGeometry(0.35, 1.0). */
const CHARACTER_HALF_HEIGHT = 0.85

export interface SceneBuilderResult {
  sampler: TerrainSampler
  character: THREE.Mesh
  terrainMesh: THREE.Mesh
  effectiveRadius: number
}

/**
 * SceneBuilder — converts a SceneDescriptor into a live Three.js scene.
 *
 * All geometry is added directly to ctx.scene.
 * Call ctx.scene.clear() in onUnmount to dispose everything in one call.
 *
 * Build order:
 *   1. Atmosphere (background colour, fog, ambient light)
 *   2. Directional / point lights
 *   3. Terrain mesh (height-displaced PlaneGeometry)
 *   4. Water surface (single plane at seaLevel, only when terrain goes negative)
 *   5. Boundary ring (thin emissive torus at playable edge)
 *   6. Character capsule (positioned at terrain surface at startPosition)
 *   7. Scene objects (explicit PlacedObjects + seeded ScatterFields)
 */
export class SceneBuilder {
  static async build(ctx: ThreeContext, descriptor: SceneDescriptor): Promise<SceneBuilderResult> {
    const terrain  = descriptor.terrain    ?? {}
    const atmo     = descriptor.atmosphere ?? {}
    const charDesc = descriptor.character  ?? {}

    const radius   = terrain.radius   ?? 50
    const seaLevel = terrain.seaLevel ?? 0

    // ── Pre-load all heightmap images before anything else ───────────────────
    const heightmapData = await SceneBuilder.loadHeightmaps(terrain, radius)

    // ── Atmosphere ────────────────────────────────────────────────────────────
    const fogColor = atmo.fogColor ?? 0x080810
    ctx.scene.background = new THREE.Color(fogColor)
    ctx.scene.fog = new THREE.FogExp2(fogColor, atmo.fogDensity ?? 0.012)

    const ambientColor     = atmo.ambientColor     ?? 0x334155
    const ambientIntensity = atmo.ambientIntensity ?? 0.9
    ctx.scene.add(new THREE.AmbientLight(ambientColor, ambientIntensity))

    if (atmo.lights && atmo.lights.length > 0) {
      for (const l of atmo.lights) SceneBuilder.addLight(ctx.scene, l)
    } else {
      // Default cinematic rig: warm key front-right + indigo rim back-left
      const key = new THREE.DirectionalLight(0xffeedd, 1.4)
      key.position.set(6, 12, 5)
      ctx.scene.add(key)

      const rim = new THREE.DirectionalLight(0x6d28d9, 1.0)
      rim.position.set(-6, 4, -8)
      ctx.scene.add(rim)
    }

    // ── Terrain ───────────────────────────────────────────────────────────────
    const sampler = new TerrainSampler(terrain.features ?? [], heightmapData)
    const terrainMesh = SceneBuilder.buildTerrain(sampler, terrain)
    ctx.scene.add(terrainMesh)

    // ── Water ─────────────────────────────────────────────────────────────────
    // Add water plane whenever features can produce sub-seaLevel terrain.
    const hasSubmergedFeatures =
      heightmapData.length > 0 ||
      (terrain.features ?? []).some((f) => f.type === 'lake' || f.type === 'river')
    if (hasSubmergedFeatures) {
      ctx.scene.add(
        SceneBuilder.buildWater(
          radius,
          seaLevel,
          terrain.waterColor   ?? 0x0a2040,
          terrain.waterOpacity ?? 0.72,
        ),
      )
    }

    // ── Boundary ring ─────────────────────────────────────────────────────────
    ctx.scene.add(SceneBuilder.buildBoundaryRing(radius))

    // ── Character ─────────────────────────────────────────────────────────────
    const [startX, startZ] = charDesc.startPosition ?? [0, 0]
    const groundY = sampler.sample(startX, startZ)
    const character = SceneBuilder.buildCharacter()
    character.position.set(startX, groundY + CHARACTER_HALF_HEIGHT, startZ)
    ctx.scene.add(character)

    // ── Objects ───────────────────────────────────────────────────────────────
    SceneBuilder.placeObjects(ctx.scene, descriptor.objects ?? [], sampler, radius, seaLevel)

    return { sampler, character, terrainMesh, effectiveRadius: radius }
  }

  // ─── Terrain mesh ─────────────────────────────────────────────────────────────

  /**
   * Generates a height-displaced PlaneGeometry.
   *
   * The plane is square (radius*2 × radius*2). Vertices beyond `radius` are
   * pushed to Y=-2 so the jagged corners sit below the ground plane and
   * disappear under the boundary ring + fog. No shader clipping needed.
   *
   * Normals are recomputed after displacement for correct lighting on slopes.
   */
  private static buildTerrain(sampler: TerrainSampler, terrain: TerrainDescriptor): THREE.Mesh {
    const radius = terrain.radius     ?? 50
    const res    = terrain.resolution ?? 160
    const color  = terrain.baseColor  ?? 0x1a2a14

    const geo = new THREE.PlaneGeometry(radius * 2, radius * 2, res, res)
    geo.rotateX(-Math.PI / 2)

    const pos = geo.attributes['position'] as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const outsideDisc = x * x + z * z > (radius + 1) * (radius + 1)
      pos.setY(i, outsideDisc ? -2 : sampler.sample(x, z))
    }

    pos.needsUpdate = true
    geo.computeVertexNormals()

    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.88,
      metalness: 0.04,
    })

    return new THREE.Mesh(geo, mat)
  }

  // ─── Water ────────────────────────────────────────────────────────────────────

  /**
   * A single flat plane at seaLevel covering the full terrain area.
   * Where terrain is above seaLevel the opaque terrain mesh occludes it.
   * Where terrain is below seaLevel the water surface shows on top.
   *
   * Offset by +0.02 to prevent Z-fighting at exactly seaLevel.
   */
  private static buildWater(
    radius: number,
    seaLevel: number,
    color: number,
    opacity: number,
  ): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(radius * 2, radius * 2)
    geo.rotateX(-Math.PI / 2)

    const mat = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity,
      roughness: 0.05,
      metalness: 0.45,
      side: THREE.FrontSide,
    })

    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.y = seaLevel + 0.02
    mesh.renderOrder = 1
    return mesh
  }

  // ─── Boundary ring ────────────────────────────────────────────────────────────

  /** Thin emissive torus lying flat at Y=0 marking the playable edge. */
  private static buildBoundaryRing(radius: number): THREE.Mesh {
    const geo = new THREE.TorusGeometry(radius, 0.06, 8, 80)
    const mat = new THREE.MeshStandardMaterial({
      color: 0x4f46e5,
      emissive: 0x4f46e5,
      emissiveIntensity: 0.5,
      roughness: 0.4,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.rotation.x = -Math.PI / 2
    return mesh
  }

  // ─── Character placeholder ────────────────────────────────────────────────────

  /** Capsule mesh. Swap this for a GLTF skin in a future phase. */
  private static buildCharacter(): THREE.Mesh {
    const geo = new THREE.CapsuleGeometry(0.35, 1.0, 8, 16)
    const mat = new THREE.MeshStandardMaterial({
      color: 0x6366f1,
      roughness: 0.5,
      metalness: 0.2,
    })
    return new THREE.Mesh(geo, mat)
  }

  // ─── Lights ───────────────────────────────────────────────────────────────────

  // ─── Heightmap pre-loading ────────────────────────────────────────────────────

  private static async loadHeightmaps(
    terrain: TerrainDescriptor,
    radius: number,
  ): Promise<HeightmapData[]> {
    const features = terrain.features ?? []
    const diameter = radius * 2

    const loads = features
      .filter((f) => f.type === 'heightmap')
      .map((f) => loadHeightmap(f as import('./SceneDescriptor').HeightmapFeature, diameter))

    return Promise.all(loads)
  }

  // ─── Object placement ─────────────────────────────────────────────────────────

  /**
   * Iterates the objects array and dispatches each entry to either explicit
   * placement or scatter placement.
   *
   * `seaLevel` is the cut-off: objects whose terrain Y is below sea level are
   * silently skipped — authors should avoid scattering trees into lakes.
   */
  private static placeObjects(
    scene: THREE.Scene,
    objects: SceneObject[],
    sampler: TerrainSampler,
    terrainRadius: number,
    seaLevel: number,
  ): void {
    for (const obj of objects) {
      if (obj.type === 'scatter') {
        SceneBuilder.placeScatter(scene, obj as ScatterField, sampler, terrainRadius, seaLevel)
      } else {
        SceneBuilder.placeExplicit(scene, obj as PlacedObject, sampler, seaLevel)
      }
    }
  }

  /** Places a single explicitly-positioned primitive. */
  private static placeExplicit(
    scene: THREE.Scene,
    obj: PlacedObject,
    sampler: TerrainSampler,
    seaLevel: number,
  ): void {
    const terrainY = sampler.sample(obj.x, obj.z)
    if (terrainY < seaLevel) return

    const scale  = obj.scale     ?? 1
    const offset = PRIMITIVE_BASE_OFFSETS[obj.type as PrimitiveType] ?? 0
    const mesh   = PrimitiveFactory.build(obj.type as PrimitiveType, scale, Math.random)
    mesh.position.set(obj.x, terrainY + offset * scale, obj.z)
    mesh.rotation.y = obj.rotationY ?? 0
    scene.add(mesh)
  }

  /**
   * Scatters `field.count` instances within a donut zone.
   *
   * Distribution:
   *   - Uniform area distribution: √(u * (outerR² − innerR²) + innerR²)
   *     ensures density is even across the annulus, not clustered at the centre.
   *   - Seeded PRNG guarantees identical layouts across reloads.
   *   - Placement is retried (up to count×10 attempts) when a candidate lands
   *     outside the terrain disc or below sea level.
   *   - Scale and rotation are also seeded so each instance is deterministic.
   */
  private static placeScatter(
    scene: THREE.Scene,
    field: ScatterField,
    sampler: TerrainSampler,
    terrainRadius: number,
    seaLevel: number,
  ): void {
    const rng      = createSeeder(field.seed ?? 0)
    const cx       = field.centerX    ?? 0
    const cz       = field.centerZ    ?? 0
    const innerR   = field.innerRadius ?? 0
    const outerR   = field.outerRadius
    const scaleMin = field.scaleMin   ?? 0.75
    const scaleMax = field.scaleMax   ?? 1.25
    const discR2   = (terrainRadius - 2) * (terrainRadius - 2)
    const outerR2  = outerR  * outerR
    const innerR2  = innerR  * innerR

    let placed   = 0
    let attempts = 0
    const maxAttempts = field.count * 10

    while (placed < field.count && attempts < maxAttempts) {
      attempts++

      // Uniform area distribution within the annulus
      const angle = rng() * 2 * Math.PI
      const r     = Math.sqrt(rng() * (outerR2 - innerR2) + innerR2)
      const x     = cx + Math.cos(angle) * r
      const z     = cz + Math.sin(angle) * r

      // Reject if outside the playable terrain disc
      if (x * x + z * z > discR2) continue

      const terrainY = sampler.sample(x, z)

      // Skip submerged positions (lakes, ocean floor)
      if (terrainY < seaLevel) continue

      const scale  = scaleMin + rng() * (scaleMax - scaleMin)
      const rotY   = rng() * Math.PI * 2
      const offset = PRIMITIVE_BASE_OFFSETS[field.primitive] ?? 0

      const obj = PrimitiveFactory.build(field.primitive, scale, rng)
      obj.position.set(x, terrainY + offset * scale, z)
      obj.rotation.y = rotY
      scene.add(obj)
      placed++
    }
  }

  // ─── Lights ───────────────────────────────────────────────────────────────────

  private static addLight(scene: THREE.Scene, l: LightDescriptor): void {
    const color     = l.color     ?? 0xffffff
    const intensity = l.intensity ?? 1.0
    const pos       = l.position

    let light: THREE.Light
    if (l.type === 'directional') {
      light = new THREE.DirectionalLight(color, intensity)
    } else {
      light = new THREE.PointLight(color, intensity)
    }

    light.position.set(pos[0], pos[1], pos[2])
    scene.add(light)
  }
}
