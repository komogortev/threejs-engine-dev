/**
 * SceneDescriptor — pure TypeScript types, no Three.js imports.
 *
 * A SceneDescriptor is a plain data object that fully describes a 3D scene.
 * Hand it to SceneBuilder to get a live Three.js scene.
 * Hand it to ThirdPersonSceneModule as a constructor option.
 *
 * Design principles:
 * - Author in world-space coordinates (X right, Y up, Z toward viewer)
 * - groundRadius = 50 means a 100-unit diameter playable disc
 * - seaLevel = 0 by default; water renders at this Y, terrain can go negative
 * - All features are additive / subtractive from a flat Y=0 baseline
 */

// ─── Path types ───────────────────────────────────────────────────────────────

/**
 * A 2D point [x, z]. Y is automatically computed as:
 *   baseTerrainAt(x, z) − feature.depth
 * Use for rivers that stay on the terrain surface.
 */
export type PathPoint2D = [number, number]

/**
 * A 3D point [x, y, z] with an explicit world-space Y.
 * Use for rivers that descend below sea level (ocean floors, dive scenes).
 */
export type PathPoint3D = [number, number, number]

export type PathPoint = PathPoint2D | PathPoint3D

// ─── Terrain features ─────────────────────────────────────────────────────────

/**
 * Gaussian hill centred at (x, z).
 * Height falls off as exp(-dist² / radius²) — roughly flat beyond 2×radius.
 */
export interface HillFeature {
  type: 'hill'
  x: number
  z: number
  /** Influence radius — controls how broad the base is, not a hard edge. */
  radius: number
  /** Peak height above the baseline in world units. */
  height: number
}

/**
 * Smooth bowl depression centred at (x, z).
 * Uses a cosine cross-section so the edge blends seamlessly into surrounding terrain.
 * Any part of the bowl below seaLevel fills with water automatically.
 */
export interface LakeFeature {
  type: 'lake'
  x: number
  z: number
  /** Hard radius — depression reaches 0 exactly at this distance. */
  radius: number
  /** Maximum depth at the centre in world units. */
  depth: number
}

/**
 * River channel carved along a CatmullRom spline.
 *
 * Path points can be 2D [x, z] or 3D [x, y, z]:
 * - 2D: river floor Y = baseTerrainAt(x, z) − depth  (surface river, ergonomic)
 * - 3D: river floor Y = explicit value                (for sub-sea-level sections)
 * Mixed arrays are supported — each point is evaluated independently.
 *
 * The cross-section is a cosine arch (smooth banks, no hard walls).
 */
export interface RiverFeature {
  type: 'river'
  path: PathPoint[]
  /** Full channel width in world units. */
  width: number
  /** How deep the channel floor sits below the river-floor Y at the centreline. */
  depth: number
}

export type TerrainFeature = HillFeature | LakeFeature | RiverFeature

// ─── Terrain ─────────────────────────────────────────────────────────────────

export interface TerrainDescriptor {
  /** Playable disc half-diameter. Terrain is square under the hood; fog hides corners. */
  radius?: number          // default 50
  /** Vertex grid resolution per axis. Higher = smoother hills but slower build. */
  resolution?: number      // default 160
  /** Y at which the water surface renders. Terrain below this value is submerged. */
  seaLevel?: number        // default 0
  /** Base terrain mesh colour. */
  baseColor?: number       // default 0x1a2a14
  /** Water surface colour. */
  waterColor?: number      // default 0x0a2040
  /** Water surface opacity [0–1]. */
  waterOpacity?: number    // default 0.72
  features?: TerrainFeature[]
}

// ─── Atmosphere ───────────────────────────────────────────────────────────────

export interface DirectionalLight {
  type: 'directional'
  color?: number
  intensity?: number
  position: [number, number, number]
}

export interface PointLight {
  type: 'point'
  color?: number
  intensity?: number
  position: [number, number, number]
}

export type LightDescriptor = DirectionalLight | PointLight

export interface AtmosphereDescriptor {
  /** Scene background and fog colour. */
  fogColor?: number        // default 0x080810
  /** Exponential fog density — 0.012 reaches fog at ~60 units. */
  fogDensity?: number      // default 0.012
  /** Hemisphere ambient colour. */
  ambientColor?: number    // default 0x334155
  ambientIntensity?: number // default 0.9
  /** Custom lights. If omitted, a default key + rim rig is added. */
  lights?: LightDescriptor[]
}

// ─── Character ───────────────────────────────────────────────────────────────

export interface CharacterDescriptor {
  /** [x, z] spawn point. Y is clamped to terrain surface automatically. */
  startPosition?: [number, number]
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export interface SceneDescriptor {
  terrain?: TerrainDescriptor
  atmosphere?: AtmosphereDescriptor
  character?: CharacterDescriptor
}
