import type { SceneDescriptor } from '@/scene/SceneDescriptor'

/**
 * Scene 01 — Heightmap terrain with procedural scatter.
 *
 * Heightmap encoding (heatmap-scene-1.png):
 *   Mid-grey (128) = sea level baseline (Y = 0)
 *   White           = +amplitude  (hills / ridges)
 *   Black           = −amplitude  (depressions / lake floors)
 *
 * Zone map (approximate world coordinates):
 *   Large hill   bright, left-centre   X ≈ −25 to 0,  Z ≈ −10 to 15
 *   Depression   dark,  centre-right   X ≈   0 to 25, Z ≈ −15 to 15
 *   Outcrop arc  bright, right-upper   X ≈  15 to 40, Z ≈ −35 to  0
 */
export const scene01: SceneDescriptor = {
  terrain: {
    radius:       50,
    resolution:   180,
    seaLevel:     0,
    baseColor:    0x1c2e1a,
    waterColor:   0x0a1c38,
    waterOpacity: 0.76,
    features: [
      {
        type:      'heightmap',
        url:       '/terrains/heatmap-scene-1.png',
        amplitude: 10,
      },
    ],
  },

  atmosphere: {
    fogColor:         0x06100a,
    fogDensity:       0.013,
    ambientColor:     0x1e3320,
    ambientIntensity: 0.8,
    lights: [
      { type: 'directional', color: 0xfff0cc, intensity: 1.3, position: [6, 14, 7]    },
      { type: 'directional', color: 0x0a1e5a, intensity: 0.8, position: [-8, 4, -10] },
    ],
  },

  character: {
    startPosition: [0, 0],
  },

  objects: [
    // ── Rock clusters along the hill base ──
    {
      type:        'scatter',
      primitive:   'rock',
      count:       18,
      centerX:     -14,
      centerZ:     2,
      innerRadius: 10,
      outerRadius: 24,
      scaleMin:    0.6,
      scaleMax:    2.2,
      seed:        1,
    },

    // ── Tree ring around the depression (sea-level culling prevents underwater trees) ──
    {
      type:        'scatter',
      primitive:   'tree',
      count:       28,
      centerX:     12,
      centerZ:     -2,
      innerRadius: 12,
      outerRadius: 26,
      scaleMin:    0.7,
      scaleMax:    1.4,
      seed:        2,
    },

    // ── Crystal cluster on the rocky outcrop arc ──
    {
      type:        'scatter',
      primitive:   'crystal',
      count:       10,
      centerX:     24,
      centerZ:     -20,
      innerRadius: 2,
      outerRadius: 14,
      scaleMin:    0.5,
      scaleMax:    1.6,
      seed:        3,
    },

    // ── Sparse trees across the general plateau ──
    {
      type:        'scatter',
      primitive:   'tree',
      count:       15,
      centerX:     -5,
      centerZ:     -20,
      innerRadius: 5,
      outerRadius: 20,
      scaleMin:    0.8,
      scaleMax:    1.2,
      seed:        4,
    },

    // ── Anchor rocks — hand-placed for visual landmarks near spawn ──
    { type: 'rock', x: -8,  z: -12, scale: 3.2, rotationY: 0.8 },
    { type: 'rock', x:  6,  z:  8,  scale: 2.0, rotationY: 2.1 },
    { type: 'rock', x: -18, z:  6,  scale: 4.0, rotationY: 0.3 },
  ],
}
