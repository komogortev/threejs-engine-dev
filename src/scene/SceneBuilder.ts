import * as THREE from 'three'
import type { ThreeContext } from '@base/threejs-engine'
import type { SceneDescriptor, LightDescriptor, TerrainDescriptor } from './SceneDescriptor'
import { TerrainSampler } from './TerrainSampler'

/** Pivot-centre-to-ground distance for the default CapsuleGeometry(0.35, 1.0). */
const CHARACTER_HALF_HEIGHT = 0.85

export interface SceneBuilderResult {
  sampler: TerrainSampler
  character: THREE.Mesh
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
 */
export class SceneBuilder {
  static build(ctx: ThreeContext, descriptor: SceneDescriptor): SceneBuilderResult {
    const terrain = descriptor.terrain   ?? {}
    const atmo    = descriptor.atmosphere ?? {}
    const charDesc = descriptor.character ?? {}

    const radius   = terrain.radius   ?? 50
    const seaLevel = terrain.seaLevel ?? 0

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
    const sampler = new TerrainSampler(terrain.features ?? [])
    ctx.scene.add(SceneBuilder.buildTerrain(sampler, terrain))

    // ── Water ─────────────────────────────────────────────────────────────────
    // Add water plane whenever features can produce sub-seaLevel terrain.
    const hasSubmergedFeatures = (terrain.features ?? []).some(
      (f) => f.type === 'lake' || f.type === 'river',
    )
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

    return { sampler, character, effectiveRadius: radius }
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
