/**
 * S5-c verification hook — builds a self-contained room-package ZIP entirely
 * in-page, so the /room drop zone can be exercised without seeding assets
 * through the editor UI.
 *
 * The ZIP contains one NPC bound to a freshly recorded animation pack:
 *   1. fetch the character GLB (default: dfist 40-bone Tripo rig)
 *   2. record a 3-keyframe "wave" clip via AnimationRecorder (rest → arm
 *      raised 90° → rest over 2 s)
 *   3. export the pack with exportAnimationGlb (self-contained mesh+skeleton)
 *   4. zip manifest.json + scene.json + both assets (store mode, like
 *      exportRoomPackage)
 *
 * Usage (dev console, any route):
 *   const bytes = await window.__s5cRoomZip()
 *   // then drop as a File onto /room, e.g. via a synthetic DataTransfer drop
 */
import * as THREE from 'three'
import { strToU8, zipSync } from 'fflate'
import {
  AnimationRecorder,
  createEditorGltfLoader,
  exportAnimationGlb,
  type PoseBoneSample,
  type RoomPackageManifest,
  type RoomPackageScene,
} from '@base/ui'

const CLIP_NAME = 's5c-wave'

export async function s5cRoomZip(charUrl = '/models/dfist_base.glb'): Promise<Uint8Array> {
  const res = await fetch(charUrl)
  if (!res.ok) throw new Error(`[s5cRoomZip] fetch failed for ${charUrl}: ${res.status}`)
  const charBytes = new Uint8Array(await res.arrayBuffer())

  const loader = createEditorGltfLoader()
  const gltf = await loader.loadAsync(charUrl)
  let skinned: THREE.SkinnedMesh | null = null
  gltf.scene.traverse(o => { if (!skinned && o instanceof THREE.SkinnedMesh) skinned = o as THREE.SkinnedMesh })
  if (!skinned) throw new Error(`[s5cRoomZip] no SkinnedMesh in ${charUrl}`)
  const bones = (skinned as THREE.SkinnedMesh).skeleton.bones

  const rest: PoseBoneSample[] = bones.map(b => ({
    bone: b.name,
    q: b.quaternion.toArray() as [number, number, number, number],
  }))
  const target =
    bones.find(b => /upperarm|shoulder|clavicle/i.test(b.name)) ??
    bones[Math.min(2, bones.length - 1)]
  const lift = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
  const waved: PoseBoneSample[] = rest.map(s =>
    s.bone === target.name
      ? {
          bone: s.bone,
          q: new THREE.Quaternion().fromArray(s.q).multiply(lift).toArray() as [number, number, number, number],
        }
      : { bone: s.bone, q: [...s.q] as [number, number, number, number] },
  )

  const rec = new AnimationRecorder()
  rec.addKeyframe(0, rest)
  rec.addKeyframe(1, waved)
  rec.addKeyframe(2, rest)
  const clip = rec.build(CLIP_NAME)

  const packBlob = await exportAnimationGlb(gltf.scene, clip)
  const packBytes = new Uint8Array(await packBlob.arrayBuffer())

  const scene: RoomPackageScene = {
    placedObjects: [],
    npcs: [{
      entityId: 's5c-npc',
      x: 0,
      z: -3,
      assetId: 's5c-char',
      animationPackAssetId: 's5c-pack',
      defaultClip: CLIP_NAME,
      rotationY: 180,
    }],
    zones: [],
    spawnPoint: { x: 0, z: 0 },
  }
  const manifest: RoomPackageManifest = {
    version: 1,
    exportedAt: new Date().toISOString(),
    packageId: 'room-s5cprobe',
    sceneLabel: 'S5-c playback probe',
  }

  const zipped = zipSync({
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
    'scene.json': strToU8(JSON.stringify(scene, null, 2)),
    'assets/s5c-char.glb': charBytes,
    'assets/s5c-pack.glb': packBytes,
  }, { level: 0 })

  console.log(
    `[s5cRoomZip] ✓ ready — char ${(charBytes.length / 1024).toFixed(0)} KB, ` +
    `pack ${(packBytes.length / 1024).toFixed(0)} KB, clip "${CLIP_NAME}" targets "${target.name}"`,
  )
  return zipped
}
