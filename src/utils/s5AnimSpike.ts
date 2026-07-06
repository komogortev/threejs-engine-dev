/**
 * S5-a step 1 — Animation Recorder round-trip spike (dev-only).
 *
 * Proves, in the real browser environment, that:
 *   1. a pose snapshot (bone-name + quaternion pairs, same shape as
 *      `capturePoseSnapshot()` in @base/ui) can be assembled into an
 *      AnimationClip of `${boneName}.quaternion` QuaternionKeyframeTracks,
 *   2. GLTFExporter exports that clip alongside the skinned mesh (binary GLB),
 *   3. GLTFLoader re-imports it with track names/targets intact, and
 *   4. an AnimationMixer on the re-imported scene plays it back with correct
 *      slerp interpolation at t=0 / t=0.5 / t=1.
 *
 * Usage (dev console or preview_eval):
 *   await window.__s5AnimSpike()                          // default character
 *   await window.__s5AnimSpike('/models/dfist_base.glb')  // alternate GLB
 *
 * See docs/PLAN-S5-ANIMATION-RECORDER-2026-07-05.md (S5-a step 1).
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

interface SpikeCheck {
  name: string
  pass: boolean
  detail: string
}

export interface SpikeResult {
  url: string
  verdict: 'PASS' | 'FAIL'
  checks: SpikeCheck[]
  boneCount: number
  testBone: string
  sanitizedTrackNames: string[]
  bindingWarnings: string[]
  exportedBytes: number
}

/** Same shape as @base/ui capturePoseSnapshot(). */
type PoseSnapshot = Array<{ bone: string; q: [number, number, number, number] }>

function snapshotSkeleton(sm: THREE.SkinnedMesh): PoseSnapshot {
  return sm.skeleton.bones.map((b) => ({
    bone: b.name,
    q: [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w],
  }))
}

function buildClip(name: string, frameA: PoseSnapshot, frameB: PoseSnapshot, duration: number): THREE.AnimationClip {
  const byBoneB = new Map(frameB.map((e) => [e.bone, e.q]))
  const tracks: THREE.KeyframeTrack[] = []
  for (const a of frameA) {
    const b = byBoneB.get(a.bone)
    if (!b) continue
    tracks.push(new THREE.QuaternionKeyframeTrack(`${a.bone}.quaternion`, [0, duration], [...a.q, ...b]))
  }
  return new THREE.AnimationClip(name, duration, tracks)
}

export async function s5AnimSpike(url = '/characters/npc/animations_base.glb'): Promise<SpikeResult> {
  const checks: SpikeCheck[] = []
  const check = (name: string, pass: boolean, detail: string) => {
    checks.push({ name, pass, detail })
    console.log(`[s5spike] ${pass ? '✓' : '✗ FAIL'} ${name} — ${detail}`)
  }

  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)

  // ── 1. Load a real character and find its SkinnedMesh ────────────────────
  const src = await loader.loadAsync(url)
  let sm: THREE.SkinnedMesh | null = null
  src.scene.traverse((o) => {
    if (!sm && (o as THREE.SkinnedMesh).isSkinnedMesh) sm = o as THREE.SkinnedMesh
  })
  if (!sm) throw new Error(`[s5spike] no SkinnedMesh in ${url}`)
  const srcMesh = sm as THREE.SkinnedMesh
  const bones = srcMesh.skeleton.bones
  const dottyBones = bones.filter((b) => /[.\[\]:]/.test(b.name)).map((b) => b.name)
  check('skinned-mesh-found', true, `${bones.length} bones; names with dots/brackets/colons: ${dottyBones.length ? dottyBones.join(', ') : 'none'}`)

  // ── 2. Two-keyframe "recording": bind pose → arm bone rotated 90° ────────
  const frameA = snapshotSkeleton(srcMesh)
  const testBone =
    bones.find((b) => /arm|shoulder/i.test(b.name)) ?? bones.find((b) => /spine|head/i.test(b.name)) ?? bones[Math.floor(bones.length / 2)]
  const qA = testBone.quaternion.clone()
  const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
  const qB = qA.clone().multiply(rot)
  const frameB: PoseSnapshot = frameA.map((e) =>
    e.bone === testBone.name ? { bone: e.bone, q: [qB.x, qB.y, qB.z, qB.w] } : e,
  )
  const CLIP = 's5-spike-clip'
  const DURATION = 1
  const clip = buildClip(CLIP, frameA, frameB, DURATION)
  check('clip-built', clip.tracks.length === bones.length, `${clip.tracks.length} tracks for ${bones.length} bones; test bone "${testBone.name}"`)

  // ── 3. Export mesh + skeleton + clip as binary GLB ───────────────────────
  const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
    new GLTFExporter().parse(
      src.scene,
      (out) => resolve(out as ArrayBuffer),
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
      { binary: true, animations: [clip] },
    )
  })
  check('export-binary', buf.byteLength > 0, `${(buf.byteLength / 1024).toFixed(1)} KB GLB`)

  // ── 4. Re-import ─────────────────────────────────────────────────────────
  const re = await loader.parseAsync(buf, '')
  const reClip = re.animations.find((c) => c.name === CLIP) ?? re.animations[0]
  check('clip-survives', re.animations.length === 1 && !!reClip && reClip.name === CLIP, `${re.animations.length} clip(s), name "${reClip?.name}"`)
  check('tracks-survive', (reClip?.tracks.length ?? 0) === clip.tracks.length, `${reClip?.tracks.length ?? 0}/${clip.tracks.length} tracks`)

  const inputNames = new Set(clip.tracks.map((t) => t.name))
  const sanitizedTrackNames = (reClip?.tracks ?? []).filter((t) => !inputNames.has(t.name)).map((t) => t.name)
  check('track-names-stable', sanitizedTrackNames.length === 0, sanitizedTrackNames.length ? `renamed: ${sanitizedTrackNames.slice(0, 5).join(', ')}` : 'all track names identical after round-trip')

  // ── 5. Playback: mixer on re-imported scene, endpoints + slerp midpoint ──
  const bindingWarnings: string[] = []
  const origWarn = console.warn
  console.warn = (...args: unknown[]) => {
    const msg = args.map(String).join(' ')
    if (/PropertyBinding|AnimationMixer|KeyframeTrack/.test(msg)) bindingWarnings.push(msg)
    origWarn.apply(console, args)
  }
  let angle0 = NaN
  let angleMid = NaN
  let angle75 = NaN
  let angle1 = NaN
  try {
    if (!reClip) throw new Error('no re-imported clip')
    const reBone = re.scene.getObjectByName(testBone.name)
    if (!reBone) throw new Error(`test bone "${testBone.name}" missing in re-import`)
    const mixer = new THREE.AnimationMixer(re.scene)
    const action = mixer.clipAction(reClip)
    // LoopRepeat would wrap t=duration back to t=0 — clamp at the end pose instead.
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    action.play()
    const qMid = qA.clone().slerp(qB, 0.5)
    const qThreeQ = qA.clone().slerp(qB, 0.75)
    mixer.setTime(0)
    angle0 = reBone.quaternion.angleTo(qA)
    mixer.setTime(DURATION / 2)
    angleMid = reBone.quaternion.angleTo(qMid)
    mixer.setTime(DURATION * 0.75)
    angle75 = reBone.quaternion.angleTo(qThreeQ)
    mixer.setTime(DURATION)
    angle1 = reBone.quaternion.angleTo(qB)
  } finally {
    console.warn = origWarn
  }
  const EPS = 1e-3
  check('binding-clean', bindingWarnings.length === 0, bindingWarnings.length ? bindingWarnings[0] : 'no PropertyBinding/mixer warnings')
  check('playback-t0', angle0 < EPS, `angleTo(poseA) = ${angle0.toExponential(2)} rad`)
  check('playback-slerp-mid', angleMid < EPS, `angleTo(slerp(A,B,0.5)) = ${angleMid.toExponential(2)} rad`)
  check('playback-slerp-75', angle75 < EPS, `angleTo(slerp(A,B,0.75)) = ${angle75.toExponential(2)} rad`)
  check('playback-t1', angle1 < EPS, `angleTo(poseB) = ${angle1.toExponential(2)} rad`)

  const verdict: SpikeResult['verdict'] = checks.every((c) => c.pass) ? 'PASS' : 'FAIL'
  console.log(`[s5spike] ═══ VERDICT: ${verdict} (${checks.filter((c) => c.pass).length}/${checks.length}) ═══`)
  return {
    url,
    verdict,
    checks,
    boneCount: bones.length,
    testBone: testBone.name,
    sanitizedTrackNames,
    bindingWarnings,
    exportedBytes: buf.byteLength,
  }
}
