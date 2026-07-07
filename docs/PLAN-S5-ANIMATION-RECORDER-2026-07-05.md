# PLAN — Phase 5 S5: Animation Recorder

**Scoped:** 2026-07-05 (code surface re-verified this session; supersedes the 2026-05-30 assessment where they differ).
**Goal:** In-editor keyframe animation authoring. Author poses an NPC on a timeline in the scene editor, exports the recorded clip as a GLB `animation-pack` asset in Dexie, and the clip plays back on NPCs in the room player.

---

## Verified code surface (2026-07-05)

| Surface | Fact | Where |
|---|---|---|
| Capture primitive | `capturePoseSnapshot(): Array<{ bone: string; q: [x,y,z,w] }>` — skeleton quaternions only; **no bone positions, no root translation, no time** | `SHARED/packages/ui/src/editor/useSceneEditorViewport.ts:827` |
| Pose viewport API | `attachPoseNpc / selectPoseBone / capturePoseSnapshot / resetPoseBones / detachPoseNpc / ikChainNames / selectIkTarget` on `SceneEditorViewportReturn` | `useSceneEditorViewport.ts:149-164` |
| `poseOverride` contract | `EditorNpcEntry.poseOverride?: Array<{ bone, q }>` — applied before mixer at runtime | `sceneEditorTypes.ts:33`, applied in `RoomPlayerModule.ts:157-166` |
| Asset DB | `'animation-pack'` AssetKind **already exists**; `AssetRow.clipNames?: string[]` already exists; Dexie at **v3** → **no schema bump needed** for S5 | `SHARED/packages/ui/src/editor/assetDb.ts:16-43,68-84` |
| GLTFExporter | Used only in engine-dev `roomMeshGen.ts` `meshToGLB()` (binary parse → Blob). **Not yet a dependency of @base/ui** — recipe must be ported | `threejs-engine-dev/src/utils/roomMeshGen.ts:27-40` |
| Runtime consumption | Rig reads `root.userData.gltfAnimations` (`CharacterAnimationRig.ts:120`); SceneBuilder writes it via `retargetMixamoClipsToCharacter` + `sanitizeMixamoClips` (`SceneBuilder.ts:490-510`); editor play-sim loads pack blob directly (`useSceneEditorViewport.ts:626-677`) | — |
| **Room player gap** | `loadRoomPackage.ts:100-102` pre-fetches `animationPackAssetId` but V1 `RoomPlayerModule` plays **static poses only** ("no animation in V1"). ⚠️ The 2026-05-30 note's "no runtime changes required" claim is **wrong** — room-player playback is a real (small, pre-staged) runtime change | `loadRoomPackage.ts:100`, `RoomPlayerModule.ts:145` |
| Prior work | No AnimationRecorder / timeline / keyframe code anywhere — greenfield | grep-verified |

## Architecture

```
SceneEditorInspector.vue          new "Anim" NpcTab (timeline strip UI)
        │ emits
SceneEditorView.vue               orchestrates recorder ↔ viewport
        │
animationRecorder.ts (NEW)        pure-TS keyframe store + clip assembly (vitest-able)
        │ build()
THREE.AnimationClip               QuaternionKeyframeTrack per bone + optimize()
        │ exportAnimationGlb() (NEW, GLTFExporter → binary Blob)
assetDb 'animation-pack' row      clipNames populated → AssetPicker → EditorNpcEntry.animationPackAssetId
        │
RoomPlayerModule (S5-c)           mixer per NPC, plays named clip from pre-fetched pack
```

**Code placement:** recorder class + export util + UI in `SHARED/packages/ui/src/editor/` (editor surface, reusable). Room-player playback in `threejs-engine-dev/src/modules/RoomPlayerModule.ts` (consumer).

### AnimationRecorder (pure TS, unit-tested)

```typescript
interface RecordedKeyframe { time: number; bones: Array<{ bone: string; q: [number,number,number,number] }> }

class AnimationRecorder {
  keyframes: RecordedKeyframe[]          // sorted by time
  addKeyframe(time, bones): void         // insert/replace at time (epsilon match)
  removeKeyframe(time): void
  retimeKeyframe(from, to): void
  sampleAt(time): bones                  // slerp between bracketing keyframes → scrub preview
  build(clipName): THREE.AnimationClip   // one QuaternionKeyframeTrack per bone + optimize()
  clear(): void
}
```

Track naming at `build()`: `${boneName}.quaternion` (bone nodes exist in the exported scene graph; GLTFLoader re-imports in the same form). The `.bones[Name].quaternion` SkinnedMesh-root form is NOT used for export — GLTFExporter resolves tracks against node names. Playback binding is verified by the S5-a spike (below), not assumed.

## Session breakdown

### S5-a — Recorder core + timeline UI (stepped keyframing)
1. **Round-trip spike FIRST** — ✅ **PASS 11/11, 2026-07-05** (`src/utils/s5AnimSpike.ts`, dev hook `window.__s5AnimSpike(url?)`, run live against `/models/dfist_base.glb`, 40-bone Tripo skeleton):
   - `${boneName}.quaternion` tracks export via GLTFExporter (binary) and re-import via GLTFLoader with **all 40 track names byte-identical** — no sanitization, no PropertyBinding/mixer warnings.
   - Mixer playback on the re-imported scene is exact at t=0 / 0.5 / 0.75 / 1 (angleTo ≈ 0 vs expected slerp poses; checks positive-controlled — the t=1 assertion failed at 1.57 rad before the LoopOnce clamp fix, so they measure real deviation).
   - **Harness gotcha for the recorder's preview:** default `LoopRepeat` wraps `t == duration` back to `t=0`; preview/scrub must use `LoopOnce` + `clampWhenFinished` (or sample below duration).
   - **Pack-size datum for OD-1:** exporter writes uncompressed — 1.5 MB meshopt source → **4.96 MB** exported GLB. Acceptable in Dexie; note for S5-b (optional future: re-compress on export).
   - **Loader caveat:** the spike needed `setMeshoptDecoder` for the compressed source; S5-b's export util re-imports its own (uncompressed) output so it does not, but any recorder-side loading of library characters must use the same decoder-configured loader the editor already uses.
   - Bone-name risk retired for in-repo assets: dfist + `animations_base.glb` both use the clean Tripo family (`L_Upperarm`…), zero dots/colons/brackets. Mixamo-style `mixamorig:` names remain a caveat for user-uploaded characters — the real recorder should warn when a skeleton contains PropertyBinding-reserved chars.
   - Bonus confirmation: `animations_base.glb` is a **mesh-less skin** (0 meshes, 1 skin, 8 clips) — the existing pack shape tolerates no-mesh GLBs, but OD-1's self-contained (mesh+skeleton) export stays the choice since GLTFExporter needs real target nodes.
2. `animationRecorder.ts` + vitest suite (add/remove/retime/sampleAt/build; @base/ui already has vitest from S4-c).
3. Viewport additions: `applyPoseSample(bones)` (scrub), `previewPoseClip(clip)` / `stopPosePreview()` (mixer on the attached pose mesh; TC detached during preview).
4. "Anim" tab in `SceneEditorInspector.vue` (5th NpcTab, same pattern as Pose): horizontal timeline strip, diamond keyframe markers, scrubber, [K] capture-at-time, [▶] preview, duration field. Emits mirror the Pose tab's emit-pair pattern into `SceneEditorView.vue`.

### S5-b — Export pipeline → Dexie → binding
1. `exportAnimationGlb(clip, poseMesh): Promise<Blob>` in @base/ui — GLTFExporter (port the `roomMeshGen.ts` recipe), `{ binary: true, animations: [clip] }`, exporting the pose mesh + skeleton so tracks have real target nodes (self-contained pack, consistent with existing Mixamo-derived packs).
2. [Export] button → name prompt → `assetDb.assets.put()` with `kind: 'animation-pack'`, `clipNames: [clipName]`.
3. Verify: appears in AssetPicker, bindable to `EditorNpcEntry.animationPackAssetId`, clip listed in the Asset tab, and **plays in editor play-sim** (existing `_loadPlayCharacter` path loads pack blobs directly).

### S5-c — Room player playback (closes the V2 gap) + optional polish
1. `RoomPlayerModule`: for NPCs with a bound pack + assigned clip, create an `AnimationMixer`, load clips from the already-pre-fetched pack blob, loop the named clip. Precedence: **playing clip wins over `poseOverride`** (mixer overwrites bone quats each frame anyway); `poseOverride` remains the static fallback when no clip is assigned.
2. Recorded packs must take the **embedded/as-is clip path**, not `retargetMixamoClipsToCharacter` — same-skeleton clips need no retarget and the Mixamo sanitize/retarget pass is a mangling risk. Verify against `gltfEmbeddedAnimation.ts` path.
3. Optional (budget-permitting, S4-c pattern): real-time recording mode (`startRealtime()/tick()/stopRealtime()` + `optimize()` dedupe), drag-retime/delete on timeline markers.

## Decisions (recommended, locked unless owner objects)

- **OD-1 Pack contents:** self-contained GLB (mesh + skeleton + clip). Exporter needs real nodes; matches existing pack shape. Cost: pack carries mesh bytes — acceptable, packs are per-character anyway.
- **OD-2 Recording modes:** stepped only through S5-b; real-time deferred to S5-c-optional.
- **OD-3 Room-player playback:** in scope as S5-c — it is the payoff (interactional-room idle NPC), and the hook (`animationPackAssetId` pre-fetch) is already staged.
- **OD-4 Root motion:** out of scope. Quaternion-only capture = in-place clips (idle/wave/gesture). Root/hip position track is a future extension.
- **OD-5 Precedence:** clip > poseOverride at runtime (see S5-c.1).

## Risks

| Risk | Mitigation |
|---|---|
| GLTFExporter track/target binding fails round-trip | S5-a step 1 spike before any UI investment |
| Bone names with dots/colons break PropertyBinding on re-import | Known pitfall (`PropertyBinding.sanitizeNodeName`) — spike uses a real character GLB from the asset library |
| Mixamo retarget path mangles same-skeleton recorded clips | S5-c consumes embedded clips as-is; never route recorded packs through `retargetMixamoClipsToCharacter` |
| `AnimationClip.optimize()` collapses sparse authored keys | Only call `optimize()` in real-time mode; stepped keyframes are already sparse — skip it there |

## Out of scope

Root motion / hip translation, BVH export, mocap input (MediaPipe), multi-clip packs from one session, animation blending authoring, three-dreams consumption (follows free via `@base/ui`).
