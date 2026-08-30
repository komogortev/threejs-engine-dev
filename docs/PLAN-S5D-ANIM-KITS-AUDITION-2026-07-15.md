# PLAN — S5-d: Animation Kits + In-Editor Audition

**Scoped:** 2026-07-15 · **Track:** Phase 5 S5-d (follows S5-a/b/c, `feat/s5-anim-recorder`)
**Decisions locked this session:** grouping = **animation kit** (multi-clip pack is the asset unit); build audition + kit authoring as **one combined track** (~2 sessions).

Supersedes nothing; extends `PLAN-S5-ANIMATION-RECORDER-2026-07-05.md`. All work is in `@base/ui` (SHARED) unless noted.

---

## Problem (owner-reported)

1. **No way to verify an available animation on the NPC.** The Anim tab previews only the *recorder buffer* (what you just captured). You cannot pick a stored clip and watch it play on the NPC. Verification is the immediate need.
2. **Kit vs single is ambiguous.** The layers disagree: the Dexie schema (`clipNames[]`) is a *kit* (many clips per asset), but the export pipeline mints a *single*-clip pack per recording, NPC binding picks *one* `defaultClip`, and the room player loops *one* clip. Owner wants to group assigned animations.

## Decision: the kit is the asset unit

An `'animation-pack'` **is a kit** — a named GLB holding N clips over one embedded skeleton/mesh. A "single animation" is just a kit-of-one. **No schema change** (`AssetRow.clipNames[]` + `EditorNpcEntry.animationPackAssetId`/`defaultClip` already carry it). What this track adds is (a) authoring to *grow* a kit and (b) UI to *audition* any clip in it.

**Explicitly out of scope (later, reactions-driven track):** runtime playback of more than one clip per NPC (idle→wave state machine). The room player keeps looping `defaultClip`. The kit only makes many clips *available*; choosing among them at runtime is a separate track.

---

## Workstream A — In-editor clip audition (verify any clip on the NPC)

**The machinery already exists.** `startAnimPreview(clip: THREE.AnimationClip)` (`useSceneEditorViewport.ts:1021`) plays any clip on the NPC pose mesh; `_loadPlayCharacter` (`:686-694`) already loads a pack via `createEditorGltfLoader` and plays `animGltf.animations` **as-is on a same-skeleton mixer** — that IS the audition recipe. Missing: a way to pick a clip *by name* and a ▶ affordance.

### A1. Viewport delegator — `auditionPackClip(packBlobUrl, clipName)`
- Load pack GLB via `createEditorGltfLoader` (cache the last-loaded pack blob URL → clip array to avoid re-parsing on every ▶).
- `clips.find(c => c.name === clipName)` → hand to `startAnimPreview(clip)`.
- **Loop mode:** audition wants `LoopRepeat` (watch it cycle), unlike the recorder preview's `LoopOnce+clampWhenFinished`. `PosePreviewMixer.play()` currently **hardcodes** `LoopOnce`/`clampWhenFinished` (`posePreviewMixer.ts:46-47`) — add a `loop = false` param: audition passes `true` (and skips `clampWhenFinished`), recorder preview unchanged. Note the shared mixer means audition and recorder-preview are mutually exclusive on the same pose mesh (fine — stop one before the other).
- **Pre-flight bone-resolution check (REPLACES the earlier "count bound tracks" idea — that was unsound: three.js exposes no public bound-track count; `PropertyBinding` internals are private).** Before playing, resolve each clip track: split the track name on `.` → bone name → `skeleton.getBoneByName(name)`. If **0 of N** resolve, don't play — toast "clip's bones don't match this character." This is public-API, deterministic, and runs *before* the silent-nothing failure S5-c documented. Extract as a shared helper `resolveClipBones(clip, skeleton): { matched: number; total: number }` (also used by B2 append guard).
- Stop resets the pose mesh to bind pose (reuse `stopAnimPreview`).

### A2. Inspector Asset tab — clip list with ▶/■
- Replace the bare **Default clip** `<select>` region with a **clip list**: each `clipNames[]` entry is a row with the name, a ▶/■ audition toggle, and a "default" radio/star (sets `defaultClip`). Keep the existing `defaultClip` emit.
- New emits: `audition-clip(entityId, clipName)`, `audition-stop()`. `SceneEditorView` orchestrates → viewport delegator.
- Playing-state highlight driven by a new `auditionPlaying: string | null` prop (which clip, if any).

### A3. Scope simplification — same-skeleton only for V1
Clips in an NPC's own pack were recorded on that character → same skeleton → as-is playback (exactly S5-c's embedded path). **Defer retargeting.** Auditioning a *foreign* pack (e.g. raw Mixamo library) is what needs retargeting — and note that path is **not free plumbing**: the retarget fn lives in `@base/player-three` (`mixamoRetargetClips.ts`, exported from its index), not `@base/ui`, so retarget-on-audition would need a new `@base/ui → @base/player-three` dep or a port. The A1 pre-flight check catches the mismatch and warns instead of playing garbage. Retarget-on-audition is a follow-up only if actually wanted — the cross-package cost reinforces deferring it.

---

## Workstream B — Kit authoring (grow a pack)

**Today:** `exportAnimationGlb(root, clip)` hardcodes `animations: [clip]` (`exportAnimPack.ts:24`); `buildAnimPackRow(clipName, blob, thumbnail?)` sets `clipNames: [clipName]` + `name: ${clipName}.glb` (`:34-48`). Always a fresh single-clip asset.

### B1. Multi-clip export — widen both helpers
- `exportAnimationGlb(root, clips: AnimationClip[])` → `animations: clips`. One embedded mesh/skeleton, N clips. (GLTFExporter handles multiple animations natively; the S5-a spike proved the per-clip round-trip.) Update the **one** existing caller — viewport `exportAnimClip` (`useSceneEditorViewport.ts:1054`) passes a single clip → wrap as `[clip]`.
- `buildAnimPackRow(kitName, clipNames: string[], blob, thumbnail?)` → `clipNames` array + kit display name. New-kit export passes `[clipName]` (unchanged behavior); append rebuilds from the full set.

### B2. Append mode — "Add to kit…"
- New `exportAnimPackAppend(targetAssetId, poseMeshRoot, newClip)`:
  1. Load target pack GLB via `createEditorGltfLoader` → `existingClips = gltf.animations`.
  2. **Skeleton-coherence guard (OD-F — was missing):** a kit is bound to one skeleton by bone-name. Run `resolveClipBones` (from A1) for `newClip` **and** each `existingClip` against `poseMeshRoot`'s skeleton. If any set has 0 matches, the kit and the current NPC character are different skeletons → **reject** with a clear toast; do not silently produce a pack whose tracks target non-existent nodes.
  3. Guard duplicate clip name → **reject** with a toast (OD-E; clearer than auto-suffix).
  4. `exportAnimationGlb(poseMeshRoot, [...existingClips, newClip])` → new blob.
  5. **Update** the existing row in place (`assetDb.assets.update(id, { blob, size, clipNames: [...existing, newName] })`) — `liveQuery` propagates. Do NOT `add()` a new row. Keep the existing thumbnail (don't regenerate).
- Cost: re-embeds the mesh each append (~5 MB uncompressed per S5-b datum). Acceptable for authoring; note it in JSDoc.

### B3. Anim-tab export UI — two paths
- In the timeline panel's Export section, offer **"Export as new kit"** (current behavior) vs **"Add to kit…"** → opens the `AssetPicker` filtered to `kind==='animation-pack'` → append via B2.
- Kit gets a display name on first export; clips keep their recorded names.

---

## Open decisions (recommend-locked; flag if you disagree)

- **OD-A (audition retarget):** V1 = same-skeleton as-is + bind-check warn; retarget deferred. *Recommend lock.*
- **OD-B (append re-embed cost):** accept full-GLB rebuild per append (authoring-time, uncompressed). *Recommend lock.*
- **OD-C (audition loop):** `LoopRepeat` while auditioning; stop → bind pose. *Recommend lock.*
- **OD-D (runtime multi-clip):** out of scope — room player still loops `defaultClip`. Kit only makes clips *available*. *Recommend lock.*
- **OD-E (dup clip name on append):** reject with toast (vs auto-suffix). *Recommend lock: reject.*
- **OD-F (kit skeleton binding — added in review):** a kit's clips must all resolve against one skeleton by bone-name. Append guards `newClip` + `existingClips` against the pose mesh via `resolveClipBones`; mismatch → reject. Prevents building an incoherent pack when a kit recorded on character X is bound to an NPC using character Y. *Recommend lock.*

## Out of scope / deferred
- Runtime state machine / reaction-driven clip selection (separate track).
- Retarget-on-audition of foreign packs.
- Real-time recording, drag-retime timeline polish (already S5-c-optional).

## Test / verify plan
- vitest: `resolveClipBones` (all-match / partial / zero-match against a synthetic skeleton — the shared correctness primitive, worth a positive-control); `exportAnimPack` multi-clip + append (clipNames grows, row updated not added, dup-name rejected, cross-skeleton append rejected per OD-F).
- Live (editor): bind a kit → Asset tab clip list → ▶ each clip plays on the NPC, ■ resets; record a new clip → "Add to kit…" → pack now lists N+1, all audition. Headless-rAF caveat applies (owner 30 s glance, same as S5-a/c).

## Sequencing (one track, ~2 sessions)
1. **B1+B2+B3** kit authoring (export widen → append → UI). Unblocks having multi-clip packs to audition.
2. **A1+A2+A3** audition (delegator + bind-check → clip-list UI). Verifies the kits from step 1.
3. CodeReview 0-blocking → commit on `feat/s5-anim-recorder` → dashboard/STATE refresh.
