import type { SceneDescriptor } from '@base/scene-builder'
import { MIXAMO_FBX_CLIP_URLS } from '@base/player-three'

/** Mixamo Remy from /public — same as scene-01. */
const MIXAMO_REMY_FBX = encodeURI('/Remy.fbx')

/**
 * Sandbox scene descriptor — flat 100 × 100 m arena for viewing saved editor scenes.
 * Geometry is minimal (grid + axis cross); placed objects are loaded from
 * localStorage['sandbox:scene'] by SandboxSceneModule.loadPlacedObjects().
 */
export const sandboxScene: SceneDescriptor = {
  terrain: {
    radius: 50,
    resolution: 100,
    seaLevel: -100,
    baseColor: 0x222831,
    waterColor: 0x0d2b45,
    waterOpacity: 0.82,
  },

  atmosphere: {
    dynamicSky: false,
    fogColor: 0x111827,
    fogDensity: 0.006,
    ambientColor: 0x8899aa,
    ambientIntensity: 1.2,
    hemisphereSkyColor: 0xc4d8f0,
    hemisphereGroundColor: 0x2d3748,
    hemisphereIntensity: 0.7,
    time: { initialPhase: 0.25, phaseSpeed: 0 },
    sunMoon: { sunIntensity: 1.4, moonIntensity: 0 },
  },

  character: {
    startPosition: [0, 0],
    modelUrl: MIXAMO_REMY_FBX,
    modelScale: 1,
    modelFitHeight: 1.78,
    pruneExtraSkinnedMeshes: false,
    rotationY: Math.PI,
    animationClipUrls: [...MIXAMO_FBX_CLIP_URLS],
  },
}
