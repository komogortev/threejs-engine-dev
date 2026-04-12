import type { TerrainSurfaceSampler } from '@base/player-three'

// ─── Layout definitions (single source for sampler + sandbox meshes) ───────────

export interface CalibrationPlatformDef {
  label: string
  color: number
  cx: number
  rampStartZ: number
  rampEndZ: number
  topEndZ: number
  width: number
  height: number
}

export interface CalibrationObstacleDef {
  label: string
  color: number
  cx: number
  cz: number
  width: number
  depth: number
  height: number
}

export interface CalibrationPoolDef {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  surfaceY: number
  depthY: number
}

export const CALIBRATION_PLATFORMS: CalibrationPlatformDef[] = [
  { label: 'soft', color: 0x22d3ee, cx: -27, rampStartZ: 20, rampEndZ: 16, topEndZ: 12, width: 5, height: 2 },
  { label: 'medium', color: 0x84cc16, cx: -20, rampStartZ: 20, rampEndZ: 12, topEndZ: 8, width: 5, height: 4 },
  { label: 'hard', color: 0xfbbf24, cx: -13, rampStartZ: 20, rampEndZ: 6, topEndZ: 2, width: 5, height: 7 },
  { label: 'critical', color: 0xf97316, cx: -6, rampStartZ: 20, rampEndZ: -2, topEndZ: -6, width: 5, height: 11 },
  { label: 'fatal', color: 0xef4444, cx: 1, rampStartZ: 20, rampEndZ: -24, topEndZ: -28, width: 5, height: 22 },
]

export const CALIBRATION_OBSTACLES: CalibrationObstacleDef[] = [
  { label: 'knee (0.5 m)', color: 0xa78bfa, cx: 5, cz: -5, width: 2, depth: 0.5, height: 0.5 },
  { label: 'body (1.8 m)', color: 0xc084fc, cx: 9, cz: -5, width: 2, depth: 0.5, height: 1.8 },
]

export const CALIBRATION_POOL: CalibrationPoolDef = {
  minX: 15,
  maxX: 25,
  minZ: -25,
  maxZ: 25,
  surfaceY: 0,
  depthY: -25,
}

/** Pool XZ footprint at water surface — shared by dbox NPC placement and UI copy. */
export const CALIBRATION_POOL_BOUNDS = {
  minX: CALIBRATION_POOL.minX,
  maxX: CALIBRATION_POOL.maxX,
  minZ: CALIBRATION_POOL.minZ,
  maxZ: CALIBRATION_POOL.maxZ,
} as const

function platformSample(x: number, z: number, p: CalibrationPlatformDef): number {
  const hw = p.width / 2
  if (x < p.cx - hw || x > p.cx + hw) return 0
  if (z <= p.rampStartZ && z > p.rampEndZ) {
    return p.height * (p.rampStartZ - z) / (p.rampStartZ - p.rampEndZ)
  }
  if (z <= p.rampEndZ && z >= p.topEndZ) return p.height
  return 0
}

function obstacleSample(x: number, z: number, o: CalibrationObstacleDef): number {
  if (
    x >= o.cx - o.width / 2 &&
    x <= o.cx + o.width / 2 &&
    z >= o.cz - o.depth / 2 &&
    z <= o.cz + o.depth / 2
  ) {
    return o.height
  }
  return 0
}

/**
 * Flat-base terrain sampler with hard-edged calibration ramps, obstacles, and sloped pool floor.
 * Used by {@link SandboxSceneModule} and any lab that clones the sandbox layout.
 */
export class CalibrationTerrainSampler implements TerrainSurfaceSampler {
  private readonly pool = CALIBRATION_POOL

  sample(x: number, z: number): number {
    const P = this.pool
    if (x >= P.minX && x <= P.maxX && z >= P.minZ && z <= P.maxZ) {
      const t = (P.maxZ - z) / (P.maxZ - P.minZ)
      return P.surfaceY + (P.depthY - P.surfaceY) * t
    }
    let h = 0
    for (const p of CALIBRATION_PLATFORMS) h = Math.max(h, platformSample(x, z, p))
    for (const o of CALIBRATION_OBSTACLES) h = Math.max(h, obstacleSample(x, z, o))
    return h
  }
}
