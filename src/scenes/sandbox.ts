import type { SceneDescriptor } from '@base/scene-builder'
import { MIXAMO_FBX_CLIP_URLS } from '@base/player-three'

/** Mixamo Remy from /public — same as scene-01. */
const MIXAMO_REMY_FBX = encodeURI('/Remy.fbx')

/**
 * Physics / animation sandbox — 100 × 100 m flat arena with calibration fixtures:
 *
 *  Landing-tier platforms (X ≈ −28, arrayed north → south on Z):
 *    soft      : 2 m hill  (fall ≈ 1 m)
 *    medium    : 4 m hill  (fall ≈ 3.5 m)
 *    hard      : 7 m hill  (fall ≈ 6 m)
 *    critical  : 11 m hill (fall ≈ 10 m)
 *    fatal     : 22 m hill (fall ≈ 20 m)
 *
 *  Pool (X 15–25, Z −25–25):
 *    10 m wide × 50 m long.  South end (Z=25) is flush with ground — character walks in.
 *    Floor slopes from Y = 0 (south / shallow entry) to Y = −25 m (north / deep end).
 *    SwimmableVolume at surfaceY = 0; swim mode triggers at shoulder depth (~1.5 m in).
 *
 *  Obstacles (X 4–10, Z −6–−1):
 *    Knee-height bump  (0.5 m) — below wall-stumble threshold → character walks over.
 *    Body-height bump  (1.8 m) — above threshold             → triggers wall stumble.
 *    Visual box meshes added by SandboxSceneModule.
 */
export const sandboxScene: SceneDescriptor = {
  terrain: {
    radius: 50,
    resolution: 100,  // flat — low resolution is fine
    // seaLevel intentionally very low so the terrain renderer emits no global water plane.
    // The pool water surface is rendered explicitly by SandboxSceneModule.
    seaLevel: -100,
    baseColor: 0x222831,
    waterColor: 0x0d2b45,
    waterOpacity: 0.82,
    // No terrain features — all geometry (platforms, obstacles, pool) is built
    // programmatically by SandboxSceneModule with a custom hard-edged sampler.
  },

  // Minimal atmosphere: neutral sky so grid colours read cleanly.
  atmosphere: {
    dynamicSky: false,
    fogColor: 0x111827,
    fogDensity: 0.006,
    ambientColor: 0x8899aa,
    ambientIntensity: 1.2,
    hemisphereSkyColor: 0xc4d8f0,
    hemisphereGroundColor: 0x2d3748,
    hemisphereIntensity: 0.7,
    time: { initialPhase: 0.25, phaseSpeed: 0 },   // fixed noon
    sunMoon: { sunIntensity: 1.4, moonIntensity: 0 },
  },

  character: {
    // Start south of all ramp bases (ramps approach from z=20, character faces north).
    startPosition: [0, 30],
    modelUrl: MIXAMO_REMY_FBX,
    modelScale: 1,
    modelFitHeight: 1.78,
    pruneExtraSkinnedMeshes: false,
    rotationY: Math.PI / 2,
    animationClipUrls: [...MIXAMO_FBX_CLIP_URLS],
  },

  // ── Swimmable volume for the pool ─────────────────────────────────────────
  swimmableVolumes: [
    {
      bounds: { minX: 15, maxX: 25, minZ: -25, maxZ: 25 },
      surfaceY: 0,
      label: 'sandbox-pool',
    },
  ],
}
