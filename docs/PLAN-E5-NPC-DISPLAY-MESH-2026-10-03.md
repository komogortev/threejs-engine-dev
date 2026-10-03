# Plan — E5: persistent NPC display mesh in the editor

**Date:** 2026-10-03 · **Status:** slices 1-4 built; decisions Q-E5-1..3 taken as recommended 2026-10-03; review changes listed under *Changes from review* · **Source issue:** `ISSUES-EDITOR-UX-2026-09-30.md` E5
**Target:** `SHARED/packages/ui/src/editor/` (+ one small runtime change in `RoomPlayerModule.ts` if Q-E5-1 = yes)
**Basis:** code-read of `useSceneEditorViewport.ts`, `SceneEditorView.vue`, `markers/markerRegistry.ts`, `pose/characterFit.ts`, `RoomPlayerModule.ts`. Nothing reproduced (empty asset library); the symptom is the owner's.

## What he sees → why

Set a character on an NPC → nothing appears. Open Pose → the model appears. The editor has **no persistent NPC model**: the only always-on representation is the sphere marker. The one model that ever exists is the *pose editor's* mesh, loaded by `attachPoseNpc` (`useSceneEditorViewport.ts:1047`) on Pose/Anim activation, one at a time, disposed on every selection change, asset change, NPC removal and `reinitScene`. Two jobs (display, pose editing) share one lifetime.

## Findings beyond the issue doc (read before deciding)

1. **The editor and the room player disagree on how an NPC is placed**, independent of E5. The pose mesh does `fitCharacterScale` (rescues cm/mm exports to 1.7 m) and **grounds** the bbox to y=0, at the marker's XZ, ignoring `y` and `rotationY`. `RoomPlayerModule` (`:188-191`) does none of fit or ground: `position = (x, y ?? 0, z)`, `rotation.y = rotationY`, `scale = npc.scale`. A mis-scaled model is normal-sized in the editor and giant in the player; a model whose origin isn't at its feet floats or sinks in one and not the other. Whatever the display mesh does becomes "what the editor shows", so it must pick a side. → **Q-E5-1**.
2. **The pose mesh does not follow the marker.** It is placed at the marker's XZ once, at attach. Drag the NPC and the model stays behind. (Today masked because the model only exists while posing.)
3. **A persistent mesh makes un-captured pose edits lie.** Today, bone edits not captured to `poseOverride` vanish when the mesh is disposed. With a persistent mesh they would stay visible but not be saved. Detaching the pose editor must restore *authored* state (bind pose + `poseOverride`).

## Design

### Shape: one declarative reconcile, not per-event patches

`reconcile(entries)` where an entry = `{ entityId, assetUrl, scale, rotationY, y, poseOverride }`. L2 calls it from **one** watcher over `localNpcs` (asset id, scale, rotationY, y, poseOverride) **and** the asset store's resolved URLs. It diffs against what exists: add, swap asset, retransform, remove. Asset set, NPC add/remove, scene load/restore, library finishing its async load and a swapped asset all become the same code path. That is the structural answer to "fix the first click but leave selection-change, scene-load and multi-NPC broken": there is no per-event path to forget (R5).

### Layering (contract: L0 / L1 / L2, no L1→L1, context = engine handles only)

| Layer | New module | Owns |
|---|---|---|
| L0 | `pose/npcPlacement.ts` | Pure: given a measured height + bbox-min-y + the entry → base scale, grounded Y, final transform. Wraps `fitScaleFor`. Tested without THREE. |
| L1 | `npc/npcDisplayRegistry.ts` — `createNpcDisplayRegistry({ loadGltf })` | `npcMeshGroup` (added to the scene once at init, like the marker groups); per-entity display root + skinned mesh; an asset cache keyed by blob URL, **refcounted**; per-entity generation token for stale loads; disposal. Does **not** import `markers/`. |
| L2 | composable + `SceneEditorView.vue` | calls `reconcile`; per-frame `follow(id, markerRoot.position)` for each marker (so display follows drag with no L1→L1 link); `clear()` before `markers.clear()` in `clearScene`; `dispose()` on unmount; hands the pose editor the display's skinned mesh. |

Model per entity: root = the cloned `gltf.scene` (same shape as today's `poseMeshRoot`, so `exportAnimationGlb(poseMeshRoot)` and `posePreviewMixer.attach(poseMeshRoot)` keep working unchanged).

### Pose editor adopts the display mesh (does not load a second copy)

`attachPoseNpc` stops loading. It takes the entity's display mesh and adds only the decorations: `SkeletonHelper`, IK target spheres, bone list. `detachPoseNpc` removes decorations and **no longer disposes the mesh**; it then re-applies authored state (`skeleton.pose()` + `poseOverride`) — finding 3. Net: one mesh per NPC, what you pose is what you see, no duplicate (an acceptance line).

### Shared assets: clone, don't reload

N NPCs with the same asset → one GLB parse, N `SkeletonUtils.clone` (own skeleton, shared geometry + materials). Cache key = blob URL, not asset id, so an `appendToPack`-grown blob (same id, new URL) reloads. Geometry/materials are disposed only when the refcount hits 0, and **before** `scene.clear()` / group removal (remount-hygiene rule). Pose editing touches bones only, never materials, so sharing them is safe; the registry never mutates a material.

### Failure and race behaviour

- Load fails or the URL isn't resolvable yet → the marker remains, one `console.warn` per (entity, url), no throw. The sync re-runs when the asset library changes, which re-adds the NPC.
- A load that resolves after its entity was removed, swapped or the scene reset is **discarded and disposed** (generation token). A scene switch mid-load must not add a mesh to the new scene.
- A failed load is **not retried** while the entry is unchanged (a retry per reconcile would hammer a broken asset on every drag tick). It retries on a URL change or a remove and re-add. A transient failure (decoder fetch) therefore sticks until one of those; a bounded retry is a possible follow-up.

## Perf budget (stated at design time)

| Cost | Figure |
|---|---|
| GLB parses | one per **distinct** asset in the scene, not per NPC |
| Geometry / material memory | one copy per distinct asset (clones share) |
| Per-NPC memory | one skeleton + bone matrices |
| Per-frame | one skinned draw per NPC, static pose (no mixer), plus N position copies in `follow` — negligible |
| Ceiling | target ≤ ~10 NPCs at ≤ ~40k tris each (the decimated dbox rig is 38k) |

Verify, don't assert: in the preview, `renderer.info` with 1 vs 8 NPCs on one asset — `geometries` should stay flat, `calls` rises by ~8 (recipe: `reference_threejs_perf_measurement_preview`).

## Decisions needed

- **Q-E5-1 — placement semantics (blocks the display transform).** Editor and player disagree (finding 1). **Recommended:** one shared rule in the L0 kernel used by **both** — fit-rescue for outliers (already the editor's behaviour; touches only models outside 0.3–4 m) and `y`/`rotationY`/`scale` from the entry — and **apply the same kernel in `RoomPlayerModule`** (a ~10-line change in engine-dev). *Grounding:* do **not** ground to bbox in either (runtime today doesn't, and `y` is an authored field; grounding would silently override it). Cost: a mis-scaled model now rescues in the player too, which is the behaviour the author already sees. Alternatives: (b) display mirrors the player exactly, no fit, no ground — honest but a cm-export shows 180 m tall in the editor; (c) keep editor-only fit+ground — the lie stays.
- **Q-E5-2 — default clip in the editor view.** The player loops `defaultClip`; the editor display would show bind pose / `poseOverride`. **Recommended:** v1 shows the static authored pose only; playing `defaultClip` on the display mesh folds into E8 (it is the `scene_start → play_clip` binding, and needs the anim-pack load + one mixer per NPC, a separate budget line).
- **Q-E5-3 — marker sphere once a model exists.** **Recommended:** keep it unchanged for v1. It is the click target, the selection colour and the gizmo anchor; decide after seeing the model beside it. (Making the model itself pickable is a follow-up, not v1.)

## Slices (each ends green: typecheck + tests + structural gate)

1. **L0 `pose/npcPlacement.ts`** + tests (fit band edges, y/rotation/scale composition, degenerate bbox). Replace the duplicated `fitCharacterScale` height/scale logic in the composable with it.
2. **L1 `npc/npcDisplayRegistry.ts`** + tests with an injected loader: same asset twice → one load; swap → old released and disposed only at refcount 0; **out-of-order resolution → final state = latest request** (known positive: reverse the resolve order); remove during load → nothing added; clear disposes (spy count > 0, i.e. the dispose path actually ran); `follow` moves root.
3. **L2 wiring:** reconcile watcher, `follow` tick, clear/dispose order; pose editor adopts; `detachPoseNpc` stops disposing and restores authored state. Net line change on `useSceneEditorViewport.ts` must be **negative** (it is already over its baseline).
4. **Runtime parity (if Q-E5-1 = yes):** `RoomPlayerModule` uses the kernel. Verify with the S5-c probe ZIP and a deliberately cm-scaled model.

## Acceptance (from E5, extended)

Set a mesh → appears immediately · select another object → stays · reload a saved scene → appears (library-load race included) · two NPCs, same asset → both appear, `geometries` flat · drag the marker → model follows · `y` / `rotationY` / `scale` honoured · pose editing works on the selected NPC with no duplicate · leaving Pose restores the authored pose (no phantom edits) · an NPC removed mid-load leaves nothing behind · editor and player place a cm-scaled model identically.

## Not in scope

`defaultClip` playback (E8) · model picking by click · path/waypoint display (E7) · lighting/shadows on the model · pose-editor rewrite.

## Changes from review (CodeReview, 2026-10-03)

Verified against the files before acting. Done:

- **Rest pose, not `Skeleton.pose()`.** three 0.172 `pose()` copies the bind *world* matrix as the local one for a root bone under a non-bone parent, so an Armature node's scale/rotation is applied twice. The registry now snapshots each bone's local transform at load and restores from that. Tested with a scaled + rotated Armature above the root bone; mutation-checked.
- **Borrowed model removed under the pose editor** (asset left the library): `setNpcDisplayEntries` detaches the pose editor and calls `onPoseMeshLost` so the host resets its pose/anim/bone-list state.
- **IK spheres follow the borrowed model** when scale/position/rotation change while attached.
- **All skeletons disposed** (a character split into body/head rigs has several), not just the first.
- **A throw while building a display** (bad override, clone failure) takes the same release-and-warn path as a failed load; `reconcile` never rejects.
- **One placement code path:** `placementFor(baseScale, entry)`; the registry and `npcTransform` both use it (the room player uses `npcTransform`).
- **Dead API removed:** `follow`, `entries`. Drag-follow works because live marker positions write `npc.x/z`, which re-runs the sync. A gizmo **Y** drag does not move the model: `y` is authored only.
- **Scene switch no longer clears NPC models.** They do not depend on scene geometry and the sync owns the list, so a switch reparses only what changed.
- **`attachPoseNpc`** waits for that NPC's load only (`settled(id)`), and a superseded attach discards itself (token), so a quick Pose + audition cannot orphan a SkeletonHelper.

Left as is, on purpose:

- **Anim-pack export carries the NPC's placement** on the pack's scene node (position, rotationY, scale). Pack consumers read only `animations`; documented at the call site. A pack loaded as a *model* would inherit it.
- **`resolveBlobUrl` creates an object URL inside a getter** and the sync recomputes on every drag tick. Pre-existing store behaviour; the window around `remove()` is narrow and `remove` has no caller in SHARED.
- **`resetPoseBones` still uses `Skeleton.pose()`** (an explicit user action, pre-existing). It has the same Armature hazard and should move to the rest snapshot in a follow-up.
- **`useSceneEditorViewport.ts` is not net-negative** (2,091 lines vs 2,074 before E5). Slice 3 was -10; the review fixes added ~26. The pose-editor cluster is the next L1 extraction (it is the 'pose/IK' item already queued in the decomposition plan).
