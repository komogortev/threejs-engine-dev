import type { SceneDescriptor } from '@base/scene-builder'
import { sandboxScene } from './sandbox'

/**
 * Doomfist-style dev mesh (Trinity export): single GLB with **Armature + SkinnedMesh** and
 * (ideally) embedded locomotion clips. Served from `public/models/dfist_base.glb`
 * (**meshopt** + **WebP** textures via `@gltf-transform/cli optimize`).
 *
 * {@link SceneBuilder.buildCharacter} clones with `SkeletonUtils.clone`, aligns feet to the
 * locomotion root, and runs clips through `retargetMixamoClipsToCharacter` (handles same-file
 * rigs and Mixamo-style hip roots). **Do not** pass sandbox Mixamo FBX URLs here — Trinity
 * bone names differ from Remy.
 *
 * If gloves/hair are separate weighted meshes that disappear with pruning, set
 * `pruneExtraSkinnedMeshes: false` below.
 */
const DFIST_BASE_GLB = encodeURI('/models/dfist_base.glb')

/**
 * Locomotion dev box — same physics fixtures as {@link sandboxScene}, distinct
 * descriptor identity so logs / volumes / future per-scene tuning do not collide.
 */
export const dboxScene: SceneDescriptor = (() => {
  const d = structuredClone(sandboxScene) as SceneDescriptor
  const vols = d.swimmableVolumes
  if (vols?.[0]) vols[0].label = 'dbox-pool'

  const base = sandboxScene.character
  d.character = {
    startPosition: base?.startPosition ?? [0, 30],
    modelUrl: DFIST_BASE_GLB,
    modelScale: base?.modelScale ?? 1,
    modelFitHeight: base?.modelFitHeight ?? 1.78,
    pruneExtraSkinnedMeshes: true,
    rotationY: base?.rotationY ?? Math.PI / 2,
    terrainFootprintRadius: 0.22,
    // Harness-owned copy of the shared GLB locomotion pack.
    // Copied from three-dreams/public — see player capability contracts note in roadmap.
    animationClipUrls: ['/characters/npc/animations_base.glb'],
    locomotionClipIndices: { idleStand: 4, walkFwdStand: 6, runFwdStand: 3 },
  }

  return d
})()
