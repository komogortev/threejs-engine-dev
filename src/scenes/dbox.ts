import type { SceneDescriptor } from '@base/scene-builder'
import { sandboxScene } from './sandbox'

/**
 * Locomotion dev box — same physics fixtures as {@link sandboxScene}, distinct
 * descriptor identity so logs / volumes / future per-scene tuning do not collide.
 */
export const dboxScene: SceneDescriptor = (() => {
  const d = structuredClone(sandboxScene) as SceneDescriptor
  const vols = d.swimmableVolumes
  if (vols?.[0]) vols[0].label = 'dbox-pool'
  return d
})()
