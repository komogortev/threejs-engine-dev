import type { SceneDescriptor } from '@/scene/SceneDescriptor'

/**
 * Quaternius **Universal Base Characters [Standard]** — glTF in `Godot - UE` (paired `.bin` + textures).
 * Use `encodeURI` so spaces and `[Standard]` survive in fetches.
 */
export const UBC_STANDARD_MALE_GLTF = encodeURI(
  '/models/Universal Base Characters[Standard]/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf',
)
export const UBC_STANDARD_FEMALE_GLTF = encodeURI(
  '/models/Universal Base Characters[Standard]/Base Characters/Godot - UE/Superhero_Female_FullBody.gltf',
)

/**
 * When you add **Universal Animation Library [Standard]** Godot/Unreal **glTF** clips under
 * `public/animations/Universal Animation Library[Standard]/…`, list them here (encode with `encodeURI`).
 * Same humanoid rig as Universal Base Characters — clips merge into `CharacterAnimationRig`.
 *
 * Example (uncomment when files exist):
 * `encodeURI('/animations/Universal Animation Library[Standard]/Unreal-Godot/Walking.gltf')`
 */
export const UAL_STANDARD_ANIMATION_CLIP_URLS: string[] = [
  // Add walking / idle glTF URLs here after extracting the pack.
]

export const scene01: SceneDescriptor = {
  terrain: {
    radius: 50,
    resolution: 180,
    seaLevel: 0,
    baseColor: 0x1c2e1a,
    waterColor: 0x0a1c38,
    waterOpacity: 0.76,
    features: [
      {
        type: 'heightmap',
        url: '/terrains/heatmap-scene-1.png',
        amplitude: 10,
      },
    ],
  },
  atmosphere: {
    dynamicSky: true,
    fogColor: 0x1fdb93,
    fogDensity: 0.011,
    ambientColor: 0x3d5244,
    ambientIntensity: 1.22,
    hemisphereSkyColor: 0xc4e0ff,
    hemisphereGroundColor: 0x3a4536,
    hemisphereIntensity: 0.58,
    time: {
      initialPhase: 0.3438,
      phaseSpeed: 0.0051,
    },
    sky: {
      model: 'physical',
    },
    sunMoon: {
      sunIntensity: 1.02,
      moonIntensity: 0.26,
    },
    clouds: {
      enabled: true,
      height: 140,
      scale: 800,
      windX: 0.4,
      windZ: -0.5,
      scrollSpeed: 0.035,
      opacity: 0.76,
      visibleFrom: 0,
      visibleTo: 1,
      densityAtNight: 0.4,
      densityAtNoon: 1,
    },
  },
  character: {
    startPosition: [0, 0],
    modelUrl: UBC_STANDARD_MALE_GLTF,
    modelScale: 1,
    /** Tweak if feet slide or model faces wrong way vs movement (−Z forward). */
    rotationY: 0,
    animationClipUrls: UAL_STANDARD_ANIMATION_CLIP_URLS,
  },
  objects: [
    {
      type: 'scatter',
      primitive: 'tree',
      count: 12,
      centerX: -40.5,
      centerZ: 0,
      innerRadius: 0,
      outerRadius: 12,
      scaleMin: 1.8,
      scaleMax: 2.7,
      seed: 1753081254,
    },
    {
      type: 'scatter',
      primitive: 'tree',
      count: 27,
      centerX: -36,
      centerZ: -26,
      innerRadius: 0,
      outerRadius: 17,
      scaleMin: 1.2,
      scaleMax: 1.85,
      seed: 2054067398,
    },
    {
      type: 'scatter',
      primitive: 'tree',
      count: 39,
      centerX: -38.5,
      centerZ: 19,
      innerRadius: 0,
      outerRadius: 12,
      scaleMin: 1.15,
      scaleMax: 1.9,
      seed: 3573289182,
    },
    {
      type: 'scatter',
      primitive: 'tree',
      count: 37,
      centerX: -26,
      centerZ: 33,
      innerRadius: 0,
      outerRadius: 12,
      scaleMin: 0.95,
      scaleMax: 1.6,
      seed: 43290863,
    },
    {
      type: 'rock',
      x: -8,
      z: -12,
      scale: 3.2,
      rotationY: 0.8,
    },
    {
      type: 'rock',
      x: 6,
      z: 8,
      scale: 2,
      rotationY: 2.1,
    },
    {
      type: 'rock',
      x: -18,
      z: 6,
      scale: 4,
      rotationY: 0.3,
    },
    {
      type: 'gltf',
      url: '/models/dirty_stones_pile.glb',
      x: -0.72,
      z: 8.16,
      scale: 1,
      rotationY: 4.61,
    },
  ],
}