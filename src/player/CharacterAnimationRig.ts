import * as THREE from 'three'

function firstSkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null
  root.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh && !found) found = o
  })
  return found
}

function pickClip(
  clips: THREE.AnimationClip[],
  re: RegExp,
): THREE.AnimationClip | undefined {
  return clips.find((c) => re.test(c.name.toLowerCase()))
}

/**
 * Minimal locomotion visuals: `AnimationMixer` on the first `SkinnedMesh`, idle/walk cross-fade from horizontal speed.
 * No-ops when the model has no skinned mesh or no clips (e.g. static GLTF like McCree sample).
 *
 * Clips are read from `root.userData.gltfAnimations` (set by `SceneBuilder` on GLTF load).
 */
export class CharacterAnimationRig {
  private readonly mixer: THREE.AnimationMixer | null = null
  private idleAction: THREE.AnimationAction | null = null
  private walkAction: THREE.AnimationAction | null = null
  /** 0 = idle, 1 = full walk weight */
  private moveBlend = 0

  constructor(root: THREE.Object3D) {
    const clips = (root.userData['gltfAnimations'] as THREE.AnimationClip[] | undefined) ?? []
    const skinned = firstSkinnedMesh(root)
    if (!skinned || clips.length === 0) return

    this.mixer = new THREE.AnimationMixer(skinned)

    const idleClip =
      pickClip(clips, /idle|stand|wait|rest|breath|t[-_]?pose/) ??
      clips[0]
    const walkClip =
      pickClip(clips, /walk|run|jog|move|locomotion/) ??
      (clips.length > 1 ? clips[1] : undefined)

    if (idleClip) {
      this.idleAction = this.mixer.clipAction(idleClip)
      this.idleAction.play()
    }
    if (walkClip && this.mixer) {
      this.walkAction = this.mixer.clipAction(walkClip)
      this.walkAction.play()
      this.walkAction.setEffectiveWeight(0)
    }
  }

  /**
   * @param horizontalSpeed — m/s on XZ (e.g. from `PlayerController` snapshot velocity).
   * @param walkThreshold — speed at which walk weight reaches 1.
   */
  update(delta: number, horizontalSpeed: number, walkThreshold = 2.2): void {
    if (!this.mixer) return
    this.mixer.update(delta)

    if (!this.idleAction || !this.walkAction) return

    const target = THREE.MathUtils.clamp(horizontalSpeed / walkThreshold, 0, 1)
    const k = 1 - Math.exp(-delta * 10)
    this.moveBlend = THREE.MathUtils.lerp(this.moveBlend, target, k)

    this.idleAction.setEffectiveWeight(1 - this.moveBlend)
    this.walkAction.setEffectiveWeight(this.moveBlend)
  }

  dispose(): void {
    this.mixer?.stopAllAction()
    this.idleAction = null
    this.walkAction = null
  }
}
