# Editor / menu UX issues — owner walkthrough, 2026-09-30

Source: owner's first hands-on pass of the editor this session (the visual pass owed since 09-16, partially done).
Purpose: one structured fix session, not one-off patches. Each item: what he saw → analysis → status → proposed fix.
Basis legend: **code-read** = traced in source, not reproduced · **verified** = observed in the running app.
Reproduction caveat: the dev browser profile has an empty asset library, so anything needing an assigned GLB could not be reproduced this session.

## Index

| # | Issue | Class | Status |
|---|---|---|---|
| E1 | Menu "Load Room" is really scene import | naming | label **shipped** (#33); code keeps `room` by owner decision |
| E2 | Three overlapping ways to open a scene | information architecture | **closed 2026-10-03** — single Scenes entry (#33) |
| E3 | Saved Scenes section duplicates the scene dropdown | redundancy | **closed 2026-10-03** — Saved Scenes panel removed from the editor; delete/manage lives on `/scenes` |
| E4 | "Scene Settings" row reads as a section title | affordance | **closed 2026-10-03** — Scene Settings is a button-styled tool row (E9) |
| E5 | NPC character mesh not shown unless Pose tab is active | **bug / design gap** | **closed 2026-10-03** — persistent NPC models (SHARED #54, engine-dev #35); plan `PLAN-E5-NPC-DISPLAY-MESH-2026-10-03.md` |
| E6 | Asset Library dialog appears open on editor load | **bug** | **reopened and fixed 2026-10-03** — it was real (see E6 section); SHARED fix/ui-editor-click-targets |
| E7 | Path / waypoints: no purpose, no preview, no storage, no triggers, no speed | **missing capability** (R1 gap) | open — needs design |
| E8 | Animations work (owner-verified) but have no triggers / time programming | **missing capability** (same gap as E7) | open — design jointly with E7 |
| E9 | Left panel: inconsistent add flows, misnamed "Player", list placement, no collapse | information architecture | **built 2026-10-03** (SHARED feat/ui-hierarchy-sections, awaiting merge); owner visual pass pending |
| E10 | No import of a scene (ZIP) into the editor — only play via `/room` | **missing capability** | **closed 2026-10-03** — import into the editor library (SHARED #53) |
| E11 | Right-side editor buttons click unreliably (T/R/S, Transform to Anim tabs) | **bug (UI reliability)** | **partly fixed 2026-10-03** (ghost dialog, bigger targets); the first-click symptom is not reproduced, owner retest pending |
| E12 | T / R / S transform the NPC **marker**, not the model (rotate and scale have no effect on the model) | **bug (E5 follow-up)** | **built 2026-10-03** (SHARED feat/ui-npc-gizmo-on-model, awaiting review/merge); owner retest pending |

## E1 — "Load Room" → "Import Scene"

- **Saw:** the menu button `Load Room` opens `/room`, which imports a Room Package (ZIP drop / `loadRoomFromDb`). That is scene import.
- **Change made:** label only, `src/views/MenuView.vue:42` → `Import Scene`. Verified in the running app.
- **Left alone on purpose:** route `/room`, `RoomPlayerModule`, `loadRoom()`, "Room Package" in docs and types. The user-facing word is now "scene", the code word is still "room".
- **Open question:** is the vocabulary "scene" or "room" going forward? R1's acceptance test is a *scene* (scene-01), the editor's unit is a *scene*, the export is a *Room Package*. Pick one, then rename code and docs together, or don't rename code. Half-renamed is the failure mode.
- **Proposed fix:** decide vocabulary (E2 session), then one rename sweep across route, module, types, docs (R5: grep every site).

## E2 — Three ways to open a scene

- **Saw:** Sandbox loads saved scenes adequately; the editor has a scene dropdown and a Saved Scenes panel that loaded the same scene identically; the menu has Import Scene.
- **Analysis:** entry points today — Sandbox (play a saved scene), Editor dropdown (open for editing), Editor Saved Scenes panel (open for editing, plus remove), Import Scene (play a ZIP package). Two of the four do the same thing (see E3). The real distinction is **edit vs play** and **Dexie vs ZIP**, and the UI does not express it.
- **Proposed fix:** one written table of entry points → (edit|play) × (Dexie|ZIP), then delete or merge the duplicates. Do this before touching E3's removal surface, because it decides where "manage scenes" should live.
- **Decision needed:** should the menu have a single "Scenes" entry (list, open, import, delete) instead of Sandbox + Import Scene? **Recommended: yes** — it also gives unloadable-scene removal a home outside the editor sidebar.

- **Decided 2026-10-03 (owner):** single **Scenes** menu entry; vocabulary = "scene" in UI only, code keeps `room` (route `/room`, `RoomPlayerModule`, `loadRoom()`, "Room Package" types/docs). No code rename sweep.
- **Entry-point table (target):**

  | | Dexie (saved in this browser) | ZIP (Room Package file) |
  |---|---|---|
  | **Edit** | Scenes → Edit (`/editor?scene=<id>`) | Scenes → Import (E10) writes assets + scene row into Dexie, then Edit |
  | **Play** | Scenes → Play (`/room?scene=<id>`), Sandbox (`/sandbox?scene=<id>`) | Scenes → Import, then Play (a ZIP is always imported first; `/room` drop zone stays as a dev shortcut) |
  | **Manage** | Scenes → Delete (confirmed; the only home for unloadable rows besides E3's sidebar panel) | — |

## E3 — Saved Scenes panel is redundant with the dropdown

- **Saw:** same load behavior from both.
- **Analysis (code-read):** not purely redundant. The dropdown (`SceneEditorHierarchy.vue:12`) lists only *loadable* rows. The panel (`SceneEditorSavedScenesSection.vue`) also shows `partial` / `unloadable` rows and is the **only place an unloadable scene can be deleted**. The code comment at `SceneEditorHierarchy.vue:30` says so. Removing the panel outright would strand those rows.
- **Change made:** collapsed by default, header toggles it (`aria-expanded`). Verified in the running app. `@base/ui` rebuilt. **Uncommitted in SHARED, on `main`.**
- **Proposed fix:** after E2, move delete/manage to the menu's scene list (or a dropdown-adjacent "Manage…"), then drop the sidebar panel. Keep the `useSavedScenes` classification shared.
- **Side effect to know:** the collapse state is not persisted; it resets on every mount. Fine unless it becomes annoying.

## E4 — "Scene Settings" looks like a title

- **Saw:** the row sits above NPCs / Zones / Placed and reads as the heading of the group below it.
- **Analysis (code-read):** it is a selectable row (`SceneEditorHierarchy.vue:47`) that opens the scene-level inspector, styled like the other group rows. Only ordering and styling make it look like a title; "Player" above it is the same kind of row.
- **Proposed fix:** restyle as an ordinary row (icon + label, same weight as Player) or rename to "Scene properties". Part of the hierarchy-panel pass, not standalone. Verify on the rendered result (R1).

## E5 — NPC character mesh renders only while the Pose tab is active  *(largest)*

- **Saw:** added an NPC (marker appeared) → Asset tab → set a character mesh → nothing visible. Switching to Pose made the model appear. Not consistently visible.
- **Basis:** code-read. Not reproduced (empty asset library).
- **Analysis:**
  - Asset tab "Set…" only writes `assetId` onto the NPC entry (`npc-changed` → `onNpcChanged`). No viewport load.
  - The only code that instantiates the NPC model is `attachPoseNpc` (`useSceneEditorViewport.ts:1047`), called from `ensurePoseMeshAttached` (`SceneEditorView.vue:869`) on Pose/Anim activation (and audition/pack-play paths).
  - There is **one** pose mesh at a time. It is detached when selection moves to a different NPC or non-NPC (`SceneEditorView.vue:531`), on asset change (`:839`), on NPC removal (`:801`), and on `reinitScene` (`useSceneEditorViewport.ts:752`).
  - So the editor has no persistent NPC model at all: a blue/orange sphere marker is the only always-on representation. The room player does render the models, so editor and runtime disagree about what an NPC looks like.
- **Symptom class:** "I set it, I can't see it" on every NPC except the one currently being posed; also after loading a saved scene (markers only).
- **Why not patch:** auto-calling `attachPoseNpc` on asset set would fix the first click but leave selection-change, scene-load and multi-NPC broken, and would make the *pose editor's* mesh double as the display mesh — two jobs, one lifetime.
- **Proposed fix (Recommended):** separate the two lifetimes.
  1. A per-NPC **display mesh** in the viewport: loaded on asset set and on scene load/restore, positioned and scaled like the runtime (`RoomPlayerModule` does `root.scale.setScalar(npc.scale)`), disposed with the NPC / scene.
  2. The pose editor attaches to the selected NPC's display mesh (or hides it and shows the pose mesh, one or the other) instead of loading a second copy.
  3. Reuse the grounding / fit-normalize code (`fitCharacterScale`, `_groundPoseMesh`) so display and runtime match.
- **Budget to state at design time:** N GLB loads for N NPCs; decide whether to share one loaded asset across NPCs using the same `assetId` (clone with `SkeletonUtils`), and dispose GPU resources before `scene.clear()` (remount-hygiene rule).
- **Structural note:** `useSceneEditorViewport.ts` is ~2,000 lines. The NPC-mesh logic should land as an L1 module (editor layering: L0/L1/L2, no L1→L1, context = engine handles only), not more lines in the composable. Check the structural gate before and after.
- **Acceptance:** set a mesh → it appears immediately · select another object → it stays · reload a saved scene → it appears · two NPCs with the same asset both appear · pose editing still works on the selected NPC and does not leave a duplicate.

## E6 — Asset Library dialog left laid out while closed  *(REOPENED, fixed 2026-10-03)*

- **History:** closed 2026-09-30 on a single 2×2 px measurement ("inconclusive, probably a mid-transition frame"). That was a wrong reading of weak evidence: the defect was real and every screenshot taken since showed it as a clipped panel fragment over the inspector's left edge.
- **Measured 2026-10-03:** `dialog.asset-lib-dialog` has `open = false` but computed `display: flex`, 560 × 202 px, `position: absolute` at x 232–792, y 92–294. Its inner header intercepts clicks over the canvas and over the left ~28 px of the inspector (Entity ID, Label, Position, Scale fields).
- **Cause:** `AssetLibraryDialog.vue` scoped style sets `display: flex` on the `<dialog>` itself, which overrides the browser's `dialog:not([open]) { display: none }`. The other two dialogs (`asset-detail-dialog`, `asset-picker`) do not have the override and were `display: none`.
- **Fix:** the rule applies only to `.asset-lib-dialog[open]`. After: all three dialogs `display: none` while closed, zero sampled points hit a dialog, and the library still opens modally and closes on Escape.
- **Lesson (R3):** an absence claim names the artifact that would prove the opposite and reads it. "Appears at 2×2 px" was not that artifact; `getComputedStyle(...).display` was.

## E7 — Path / waypoints: an unfinished feature, not a bug

- **Saw:** NPC → Path tab → "+ Add Waypoints" → click the floor → a list of vectors appears. No stated purpose, no way to see the NPC move, no way to keep more than one path, nothing to start a path, no speed.
- **Basis:** code-read across the editor, exporter, package types, `RoomPlayerModule`, and three-dreams.
- **What exists today (all of it):**
  - Waypoints are per-NPC arrays of `Vector3`, held in `waypointMap` and **persisted only in browser `localStorage`**, keyed `<storageKeyPrefix>:<entityId>` (`SceneEditorView.vue:549–610`).
  - They are **not** on the NPC entry, **not** in the saved Dexie scene row, **not** in the Room Package, **not** read by `RoomPlayerModule`. Clearing site data, using another browser, or exporting a scene drops them silently.
  - The only output is "Copy TypeScript" → paste a `new THREE.Vector3(...)` array into game code. The design intent was a hand-off to three-dreams (`scenes/scene-01/navPath.ts`, `ROAD_WAYPOINTS`, "dad's walking path triggered after dialog completion").
  - **Nothing consumes that array.** `ROAD_WAYPOINTS` is exported and referenced only in comments; no module in three-dreams, engine-dev or SHARED imports it. So even the hand-off path is a dead end.
  - Consequence: the owner's questions are all correct, and the answer to each is "not built": purpose (was a hand-off format), preview (none), multiple reusable paths (one array per NPC, localStorage), triggers (none at any layer), speed (none).
- **Why this matters for R1:** the R1 acceptance test is scene-01's dad-NPC interaction with no code — dialog finishes, dad walks the road. That is exactly path + trigger + speed. The reaction engine (`three-dreams/src/reaction`, to be extracted as `@base/narrative`, decisions D1–D3) has reactions `dialog · animation · set_flag · emit · sequence · wait` and **no movement reaction**. So E7 is the same gap as narrative N1–N2, seen from the editor side.
- **Requirements as stated by the owner, made explicit:**
  1. **Purpose visible:** a path is "an object's route through space", and the editor says so.
  2. **Preview:** play the object along the path in the editor, at its speed, to validate by eye. Stop / restart / scrub.
  3. **Library:** create a path, validate it, create another, validate it — multiple named paths per scene, reusable across objects and triggers. Not one anonymous array per NPC.
  4. **Triggers:** declare what starts a path (and ideally stops/loops it) for any path.
  5. **Speed:** a controllable speed per path, possibly overridable per invocation.
- **Analysis — the design decision that comes first:** today path ownership is *NPC → waypoints*. The owner's model is *Scene → named paths*, and an NPC is **bound** to a path by a **trigger → reaction**. That changes the data shape and is also where it meets narrative:
  - `Path` = `{ id, label, points[], speed, loop|pingpong|once, (easing?) }`, stored in the **scene** (Dexie row + Room Package + `RoomPlayerModule` input), not in `localStorage` and not on the NPC.
  - A new reaction kind `follow_path { entityId, pathId, speed? }` in the reaction vocabulary (with a matching stop). The trigger is then just a reaction binding: `zone_enter | dialog_end | flag_set | interact | scene_start → follow_path`. **This is the same shape as D2** (interactive objects become reaction bindings) — so paths should not get a bespoke `trigger:{...}` field. Recommended to reuse, consistent with how P1-3 was retired.
  - Runtime: a path-follower in the room player (and the editor preview) that advances an entity along `points` at `speed` (m/s), facing along the tangent, clamped to ground via the sampler once P0-1 lands. One implementation, shared by editor preview and runtime, so "validated in the editor" means "behaves the same in the player".
- **Ordering constraint:** trigger declaration needs the trigger sources to exist. `zone_enter` needs **P0-2 (zone runtime)**; `dialog_end` needs `@base/narrative` (N1). Path *definition, storage, preview and speed* need neither — they can land first.
- **Proposed slices (Recommended order):**
  - **E7-a — storage & model:** `Path` type; move waypoints from `localStorage` to the scene (Dexie + Room Package + schema version bump + migration of existing `localStorage` data, with a one-shot import so nothing is lost); named path list in the editor (create / rename / delete / select). Acceptance: save, reload, export/import a scene → paths survive.
  - **E7-b — preview & speed:** shared path-follower; Play/Stop on a selected path bound to a chosen entity; speed field; live tangent facing. Acceptance: two paths on one scene, each previewed at different speeds, visually correct.
  - **E7-c — triggers:** `follow_path` reaction + binding UI, after P0-2 (zone) and `@base/narrative` N1 (dialog/flag). Acceptance = R1 test: scene-01 dad walks the road on dialog end, no code.
  - **E7-d — retire the hand-off:** remove or demote "Copy TypeScript" and the dead `ROAD_WAYPOINTS` once E7-c replaces it; fix the WaypointEditor pages that still advertise it.
- **Open questions (each needs the owner):**
  - **Q-E7-1:** path ownership — scene-level named paths, bound by reaction (Recommended), or keep NPC-owned and add a name? Scene-level is required for "reuse".
  - **Q-E7-2:** can a path move non-NPC things (placed objects, the player, camera rigs)? The owner's wording was "object". **Recommended:** entities generally, but ship NPCs first.
  - **Q-E7-3:** speed is a path property with a per-invocation override, or one or the other? **Recommended:** path default, reaction can override.
  - **Q-E7-4:** what happens at the end — stop, loop, ping-pong, hand back to idle? Needs a per-path setting; end-of-path should also be able to emit an event (chaining reactions).
- **Perf / budget at design time:** per-frame cost is one vector advance per moving entity — negligible; the cost to state is ground-clamping each step against the collision sampler (P0-1), which should reuse the existing sampler rather than raycast.
- **Re-entry condition:** E7-a/b can start at any time and do not depend on P0-2 or narrative; E7-c is gated on P0-2 + `@base/narrative` N1. Fold E7 into the R1 assessment's capability list if it is not already a row (check §3).

## E8 — Animations work; nothing can trigger or sequence them

- **Saw (owner `[stated]`):** loading an animation pack and playing a clip on an NPC works — he could load one and observe it. Same need as paths: a way to **program an object/NPC's progression over time and have it react to triggers**.
- **What exists (code-read):**
  - Asset tab: animation pack, clip list, per-clip audition (▶), and a `★` **default clip** that the room player loops (`SceneEditorInspector.vue:282–334`). That is the only runtime behavior an authored animation has: one looping default per NPC.
  - Anim tab: recorder/keyframes for authored clips.
  - The reaction vocabulary (`three-dreams/src/reaction`) **already has** `animation { entityId, clipName|clipIndex, loop, transient }`, `sequence` (steps with `delaySeconds`), `wait`, `set_flag`, `emit`, `dialog` — i.e. "do X, then after N seconds do Y" is expressible in data. What is missing is the **editor surface that authors bindings** and the **room-player executor** that consumes them. The vocabulary is also still parked in three-dreams (extraction to `@base/narrative` accepted as D3).
- **Analysis:** E7 (paths), E8 (animations) and the narrative gap are one capability, not three. The owner's model — *entity + trigger → timed reactions (play clip, follow path, speak, set flag, wait)* — is exactly `Stimulus → Condition → Reaction` with a `sequence` for time. Building path triggers and animation triggers separately would create two binding systems to merge later (the same objection that retired P1-3's bespoke `interaction:{trigger,action}`).
- **Proposed design (Recommended):** one **Behaviors** surface, bound to an entity:
  1. Trigger list (source + condition): `scene_start · zone_enter/exit · dialog_end · flag_set · interact · path_end · clip_end`.
  2. Reaction sequence: ordered steps with delay — `play_clip`, `follow_path`, `dialog`, `set_flag`, `wait`, `emit`.
  3. "Test" button: fire the binding in the editor (same executor as the room player), so the owner validates by eye — the same preview requirement as E7.
  4. Chaining falls out for free: `path_end` / `clip_end` are triggers.
- **Dependencies:** executor needs `@base/narrative` (N1) and the room-player hook; `zone_enter` needs P0-2; `follow_path` needs E7-a/b. **Independent and startable now:** the `play_clip` step + editor preview trigger (audition already exists — it is the first, hard-wired binding).
- **Open questions:**
  - **Q-E8-1:** is "Behaviors" a new inspector tab on the entity (Recommended — same place as Path/Asset/Anim) or a separate scene-level panel listing all bindings? A scene-level list is better for reviewing flow; an entity tab is better for authoring. Recommended: entity tab to author, plus a read-only scene list later.
  - **Q-E8-2:** time model — only per-step `delaySeconds` (what exists), or a true timeline with parallel tracks? Recommended: start with delay steps (already implemented); a timeline is a later UI over the same data.
  - **Q-E8-3:** default clip (`★`) becomes the `scene_start → play_clip(loop)` binding, or stays a separate field? Recommended: fold it in, so there is one mechanism (migrate existing `defaultClip` on load).

- **Owner question 2026-10-03 (animation packs):** *"do we want to assign multiple animations or do we need a separate system managing animations that would qualify animation compatibility and apply it on trigger to the model?"* **Recommended: the separate system, built as three parts.** (1) **Library**: the kits in the Asset Library (the Anim tab now lists every kit's clips). (2) **Compatibility**: a verdict per (character, kit) from bone-name overlap (reuse `resolveClipBones`), computed not stored, shown as matched/total in the pickers; the Canonical Humanoid Rig track later adds retargeting. (3) **Application**: `play_clip { kit, clip }` behavior steps fired by triggers (this E8 design). Do **not** add `animationPacks: string[]` to the NPC: it is a second binding system E8 would replace. Keep `animationPackAssetId` as the NPC's default kit meanwhile. Consequence for E7/E8: the scene package export collects only each NPC's bound pack today, so it must collect every kit a behavior references. **Open for the owner:** compatibility threshold (recommended: show matched/total, call a kit compatible at 90% or more).

## E9 — Left panel: one consistent model  *(absorbs E4)*

- **Saw (owner):**
  - NPCs and Zones have a `+` in their section header and their rows appear directly beneath it. Assets have a `+ Add Assets` button in a differently styled section, and what gets placed shows up in a *different* list further down. Different feel for the same kind of action.
  - "Player" row looks like a scene object but is actually player-view controls (visual validation). Should be named for what it does. Wants the same menu standard as the rest.
  - Wants: NPCs, Assets, Zones, each with a `+` in the header; one readable order; each section collapsible.
- **Analysis (code-read, `SceneEditorHierarchy.vue`):**
  - Current order: Assets (launcher only) → Saved Scenes → Player → Scene Settings → NPCs → Zones → Placed Objects (hidden when empty).
  - **Root cause of the "different feel":** the "Assets" section is a **library launcher** (opens `AssetLibraryDialog`), not a list of scene objects; the scene objects made from assets live in **Placed Objects**, at the bottom. NPC and Zone sections are *both* the launcher and the list. So the user adds in one place and sees the result in another. It is a model mismatch, not a styling one.
  - Creation flows also differ in kind: NPC and Zone are created **instantly at the origin and selected**; an asset is **picked in a dialog, then the floor must be clicked** (place mode), and is selected only after the async GLB load (`placeObject`, `useSceneEditorViewport.ts:1414`). An auto-expand-on-add rule must key off *selection change*, not off the `+` click, or the asset case will open the wrong moment.
- **Proposed layout (owner's design, made explicit):**

  | Order | Section | Header `+` does | Rows |
  |---|---|---|---|
  | 1 | **NPCs** | create NPC, select it | NPC list |
  | 2 | **Objects** (was Assets + Placed Objects) | open asset library → pick → place | placed instances |
  | 3 | **Zones** | create zone, select it | zone list |

  Plus a fixed, non-collapsible **Scene** block above (Scene Settings, Player View, scene switcher) and Saved Scenes per E3.
- **Collapse behavior:** every section collapsible, **collapsed by default**; a section **opens when a selection of its kind occurs** (by row click, viewport click, or after add — add auto-selects, so one rule covers both); it does not force itself open again while the user holds the same selection. Open/closed state is per-section UI state, not persisted (or persisted per browser — decide at build).
- **Naming:** "Player" → **"Player View"** (Recommended: it switches the viewport into play view and shows the camera-mode badge; "cam" understates it). Restyle it, Scene Settings (E4) and the scene switcher as a "Scene" block of tool rows visibly distinct from object sections, so neither reads as a heading for what follows.
- **The Assets library is not removed:** upload / browse / delete still needs a home — it stays as the dialog opened by the Objects `+`, plus an "Asset library…" entry in that section's header for management without placing.
- **Open questions:**
  - **Q-E9-1:** should placing an asset match the NPC/Zone flow (created instantly at a default spot — view centre or origin — selected, moved with the gizmo) instead of the click-the-floor place mode? **Recommended: yes** — one creation model; click-to-place can stay as an option. Needs owner confirmation because it changes a working flow.
  - **Q-E9-2:** section name "Objects" vs "Assets" vs "Props"? The owner said "assets"; the list holds instances, which are objects. Recommended: **Objects**, with the library called "Asset library".
  - **Q-E9-3:** persist collapse state across sessions? Recommended: no (derive from selection on mount).
- **Structure:** this is a refactor of one 300-line SFC into a shared `HierarchySection` (header, count, `+`, collapse, rows slot) used by all three — consistent by construction. Interacts with E5 (NPC display mesh) only through the NPC row; no ordering constraint.
- **Acceptance:** all three sections look and behave identically; add → new object appears in its own section, selected, section open; selecting in the viewport opens the matching section; no section open on a fresh load; "Player View" named and styled as a view control; no row reads as a heading.
- **Built 2026-10-03:** `HierarchySection` (shared header: chevron + title + count + "+", rows below) used by NPCs, Objects, Zones, so they cannot drift; Scene Settings and **Player View** are button-styled tool rows above them; sections start collapsed and open on a selection of their kind (`hierarchy/sectionForSelection.ts`, pure, 7 tests with negative controls). The Saved Scenes panel and the old Assets launcher section are gone (`SceneEditorSavedScenesSection.vue`, `SceneEditorAssetsSection.vue` deleted; E3 closes with them because delete now lives on `/scenes`).
- **Verified in the editor:** fresh load = three identical collapsed sections; "+" on NPCs / Zones creates the object in its own section, selects it and opens the section; collapsing while that object stays selected sticks; selecting in the viewport opens the matching section; the Objects "+" opens the asset library.
- **Decisions taken (recommended options):** Q-E9-2 name = **Objects**; Q-E9-3 collapse state is **not** persisted. **Q-E9-1 deferred, working flow unchanged:** placing an asset is still pick-in-library then click-the-floor (the doc recommended instant create-at-default; that changes a working flow and needs your confirmation). **Dropped from the design:** the separate "Asset library…" entry, because the Objects "+" opens the same dialog (upload, browse, delete and Use).
- **Also changed:** "×" remove buttons are visible at rest (dimmed) and 22 px instead of appearing on hover at ~14 px; section "+" is 24 px (was 16).

## E10 — No way to import a scene into the editor  *(owner, 2026-10-03)*

- **Saw:** the editor can export a Room Package (`onExportRoomPackage`, `SceneEditorView.vue:768`) but nothing imports one. "Import Scene" in the menu (E1) opens `/room`, which only *plays* a ZIP.
- **Basis:** code-read. `loadRoomPackage` (`loadRoomPackage.ts:31`) is consumed only by `RoomPlayerView.vue`; the editor has no importer. The round trip editor → ZIP → editor does not exist, so a ZIP cannot be moved between browsers/machines for editing, and E1's new label overpromises.
- **Why not a one-liner:** `loadRoomPackage` returns blob URLs, which the editor cannot use. The editor's scenes live in Dexie (`assetDb.scenes` + `assetDb.assets`). Editing import must write the package's asset blobs into `assetDb.assets` and a scene row into `assetDb.scenes`, then open that row through the existing saved-scene path (`SceneEditorView.vue:442`).
- **Decisions the importer needs (R5, enumerate before building):** asset-id collision policy (same id → reuse; different content under the same id → ?), scene-name collision (rename vs overwrite), what the package does not carry (waypoints are `localStorage`-only, E7), and the schema version check (`manifest.version`).
- **Proposed fix (Recommended):** `importRoomPackageToDb(zipBytes)` in `@base/ui` (unzip → upsert assets → insert scene row → return sceneId), an "Import scene…" action in the editor's scene switcher / the E2 "Scenes" surface, and a round-trip test (export → import → deep-equal scene). Belongs in E2's table as the *(edit × ZIP)* cell, currently empty.
- **Acceptance:** export a scene, clear it from Dexie, import the ZIP in the editor → same placed objects, NPCs (with clips), zones, spawn, audio; assets present; re-import does not duplicate assets.

## E11 — Right-side editor buttons click unreliably  *(owner, 2026-10-03)*

- **Saw (owner `[stated]`):** the T / R / S gizmo buttons and the inspector tabs (Transform, Path, Asset, Pose, Anim) are hard to click. He can only activate the option they represent by clicking them **sequentially**, i.e. a click lands only after a previous one.
- **Basis:** not yet reproduced or traced. Hypotheses, none confirmed:
  1. **Overlap.** The harness page overlays an absolutely positioned `← Back` button (`SceneEditorPage.vue`, `z-index: 20`, top/right 10 px) on the inspector header, over the tab row. Every screenshot this session shows it sitting on the right edge of the tab bar, and a clipped panel fragment (the Asset Library dialog) overlapping the inspector's left edge around x≈600. Either can intercept clicks.
  2. **Pointer capture / focus.** TransformControls and OrbitControls attach listeners to the canvas / `window`; a pointer capture or `pointerup` handler that is still armed could swallow the first click on a button outside the canvas, so the second click lands.
  3. **Re-render under the pointer.** Selection-driven re-renders of the inspector (tab content or the NPC row) between `mousedown` and `mouseup` would drop the click.
- **Checked 2026-10-03, in the browser pane:**
  - `elementFromPoint` at every T/R/S button, tab and the Back button centre: each receives its own click. **Hypothesis 1 (overlap at the centres) refuted.**
  - A MutationObserver on the inspector, toolbar and camera buttons for 3 s idle: 0 mutations, buttons stay connected. **Hypothesis 3 (re-render under the pointer) refuted at idle.**
  - Real clicks activate R, S and the Anim tab on the first click, including right after an orbit drag on the canvas. **Hypothesis 2 (pointer capture / first click after canvas) not reproduced** with synthetic input; hardware-specific behaviour is not excluded.
  - No global `pointerdown` / `pointerup` / `click` listener in `packages/ui/src/editor` could swallow a click (the only `window` listeners are `keydown`, `keyup`, `mousemove`, `resize`).
- **Found and fixed while looking:** (a) the ghost Asset Library dialog (E6) took clicks over the canvas and the inspector's left edge; (b) the targets were small: T/R/S 24 × 24 px and tabs ~31 px tall, in a crowded top-right cluster (camera buttons, T/R/S, tabs, Back). Now T/R/S 32 × 32 px with a 6 px gap and tabs ~41 px tall.
- **Not explained:** "only reliable when clicked sequentially". Needed from the owner (he is the reconciliation layer here): window size, and what a failed click does (nothing / wrong option / needs a second click), and whether it fails more often right after using the canvas.
- **Why it matters:** E9 rebuilds the left panel and every acceptance test in the fix session assumes the right panel is clickable.
- **Acceptance:** each T/R/S button and each inspector tab activates on its first click, in a fresh load and after canvas interaction (orbit, gizmo drag, selection change), on the owner's own window and input device.

## E12 — T / R / S act on the marker, not the model  *(owner, 2026-10-03)*

- **Saw (owner `[stated]`):** with an NPC selected, Translate / Rotate / Scale change the marker, not the model. His model of the tool: **the markers are identification** (a pin that says "this is an NPC, this one is selected"), and using the gizmo he expects **the model** to be transformed, not necessarily the marker.
- **Basis:** code-read, not yet reproduced as a screenshot. The gizmo (`TransformControls`) is attached to the marker root (`markers.npcRoot`, attach sites in `useSceneEditorViewport.ts` around lines 1002, 1174, 1349-1367). Only **position** flows back: the `objectChange` tick writes the marker's XZ into `npcLivePositions`, `SceneEditorView` copies it to `npc.x/z`, and the E5 display model follows. **Rotate and Scale only turn or scale the marker**; nothing maps them to `rotationY` or `scale`, so the model never reacts. That is a gap I left in E5 (it moved position, and the inspector's Rotation / Scale fields, but not the gizmo).
- **What the owner has now decided (answers Q-E5-3):** the marker is an **identification pin, not the transform handle**. It should not itself be transformed.
- **Design (Recommended): attach the gizmo to the model, keep the marker as a pin.**
  1. For an NPC that has a display model, `TransformControls` attaches to `npcDisplay.get(id).root`. For one without a model yet (no asset) it falls back to the marker, as today.
  2. Rotate is restricted to **Y** (`rotationY` is the only authored rotation); Scale is restricted to **uniform** (`scale` is one number). Translate keeps XZ and may also write `y` (authored).
  3. On every `objectChange`, write the result back to the entry (`x`, `z`, `y`, `rotationY` in degrees, `scale = root.scale / baseScale`). The display registry already applies entry to model on reconcile, so the write-back is idempotent; the marker follows position and is never rotated or scaled.
  4. Ctrl+Z gesture revert must restore the model's transform, not the marker's: the gesture snapshot is keyed to the attached object today.
  5. One attach function ("attach the gizmo for this selection") replacing the ~7 scattered `transformControls.attach(root)` sites, so there is a single place that decides marker vs model. (R5: enumerate every site.)
- **Cost / risk:** touches the oversized `useSceneEditorViewport.ts` (2,091 lines, +17 from E5) in the gizmo-attach paths and the gesture-revert path. It is a good moment to put the attach decision in a small L1 module rather than add lines to the composable.
- **Alternative (rejected):** keep the gizmo on the marker and map its rotation/scale into the entry, then reset the marker. Resetting the object the gizmo is mid-drag on breaks `TransformControls`' own drag state.
- **Open question:** should the marker be hidden or shrunk when a model exists, now that it is purely an identification pin? **Recommended:** keep it, smaller, so an NPC with an unloaded or invisible model is still findable. Decide after seeing the model move with the gizmo.
- **Acceptance:** select an NPC with a model, press R and drag: the model turns about Y and `rotationY` updates in the inspector; press S and drag: the model scales uniformly and `scale` updates; T moves the model and marker together; the marker itself never rotates or scales; Ctrl+Z reverts the model; an NPC without a model still moves by its marker.
- **Built 2026-10-03 (as designed, Recommended option):** the gizmo attaches to the display model when one exists (marker as fallback), through one `attachGizmo` that every attach site now uses, so axis limits cannot leak onto a bone / zone / placed object. On the model: translate XZ only, rotate Y only, scale uniform. `rotationY` is derived from the quaternion (three's `Euler.y` is wrong past 90 degrees: measured, a 150 deg yaw decomposes to (180, 30, 180)); `scale = model.scale / baseScale`, clamped at 0.01. The marker follows XZ and is never rotated or scaled. The registry's transform write became `rotation.set(0, y, 0)`, because a gizmo-written quaternion leaves Euler x = z = 180 and setting only `.y` faced the model the wrong way.
- **Also fixed on the way:** the old "force uniform" code read `scale.x`, so dragging the green (Y) or blue (Z) scale handle did nothing. It now follows whichever axis moved furthest (`uniformScaleFrom`).
- **Verified in the editor:** gizmo parent is `npc-display`; Rotate shows only the Y ring; a real mouse drag of the ring took `rotationY` 180 -> 302.24 with the model facing 302.2 and Euler x/z = 0; a real drag of the Y scale handle took scale 1 -> 1.938 with the model uniform; synthetic gizmo events: yaw 150 / 260 exact, non-uniform scale forced uniform, negative scale clamps to 0.01, translate moves model and marker together with the marker's rotation/scale untouched, Ctrl+Z reverts the model, inspector and marker.

## Target flow — the acceptance scenario the fix session unlocks  *(owner, 2026-09-30)*

One authored scene that exercises E5, E7, E8, E9 and P0-2 together, with no code:

1. **Zone A** and **Zone B** exist. An **NPC** stands in Zone A, idling (its default clip).
2. **Trigger:** the player enters Zone A.
3. **Reaction sequence on the NPC:** play the *walk* clip (looping) **while** following **path A→B** at the path's speed.
4. **On arrival** (end of the path) in Zone B: switch to another clip (e.g. *wave*).
5. **Chain:** when that clip finishes, play the next clip in an ordered list (clip 2, clip 3 …).
6. **When the chain is exhausted:** fall back to the NPC's default (idle) clip.
7. The whole flow is **validated in the editor** (Test/preview) and behaves the same in the room player.

What each step needs, and where it is tracked:

| Step | Needs | Tracked in | State |
|---|---|---|---|
| 1 NPC visible in the zone, idling | persistent NPC display mesh; default clip playing | E5; E8 (default clip) | open |
| 1 Zones as authored objects with positions | zone list in the panel; zone positions usable as path anchors | E9; P0-2 | zones exist in the editor; runtime discards them |
| 2 Player-enters-zone trigger | zone runtime: `loadRoom()` reads zones, emits enter/exit | **P0-2** | open (Next) |
| 3 Walk clip + path follow together | a sequence step that starts a looping clip and a path in parallel, clip tied to the movement | E8 reaction sequence + E7 follower | open |
| 3 Path A→B with speed | named scene-level path, speed per path; ideally **endpoints snap to a zone** so moving the zone moves the path end | E7-a/b (new requirement, below) | open |
| 4 Arrival event | `path_end` trigger/emit | E7 (Q-E7-4) | open |
| 5 Clip chain | `clip_end` trigger **or** a `sequence` of `play_clip` steps each waiting for the previous clip's end | E8 | open |
| 6 Fallback to idle | end of chain returns the entity to its default clip — a rule, not a hand-written step | E8 (Q-E8-3) | open |
| 7 Same in editor and player | one shared executor, editor "Test" fires the same binding | E7 + E8 (shared follower/executor) | open |

**New requirements this scenario adds (not in E7/E8 as first written):**
- **Path ↔ zone anchoring:** a path endpoint can reference a zone (or a point) instead of only raw coordinates, so "move NPC from zone A to zone B" is authored by picking zones. Open question **Q-E7-5**: anchor by reference (Recommended — survives moving a zone) or by copying the coordinate at author time?
- **Clip-with-motion coupling:** walking must not slide. Options: clip speed scaled to path speed, or a fixed pairing. Recommended: start simple (walk clip loops while the path runs; stop it on arrival), tune foot-sliding later. **Q-E8-4.**
- **Chain semantics:** an ordered clip list runs once, each step starting on the previous `clip_end`; at the end the entity reverts to its default clip automatically. Per-step loop counts and interruption (a new trigger firing mid-chain: cancel, queue or ignore) need a stated policy. **Q-E8-5**, recommended: a new trigger **cancels** the running chain and starts its own, because queued chains hide what the player sees.
- **Re-trigger:** the player leaves and re-enters Zone A. Once-only, cooldown, or every time? The reaction vocabulary already has `once` and `cooldown` conditions — expose them on the binding. **Q-E8-6.**

**Session plan for the dedicated fix session:** build the smallest slice that can run steps 1–7 with one NPC, two zones, one path, two clips; everything else (multiple NPCs, timelines, extra trigger sources) waits. The scenario is the exit test for the combined E5 + E7 + E8 + E9 + P0-2 work, and is the natural first concrete cut of the R1 acceptance test (scene-01 dad-NPC interaction).

## State of the working tree at write-up

| Repo | Change | State |
|---|---|---|
| `threejs-engine-dev` | `MenuView.vue` label (E1) | uncommitted |
| `SHARED` | `SceneEditorSavedScenesSection.vue` collapse (E3); `@base/ui` rebuilt | uncommitted, on `main` |

Typecheck not run for either. SHARED is a package, so its change must go through a SHARED PR.

## Suggested order for the fix session

1. **E2** — entry-point table + vocabulary decision (E1's open question). Short, unblocks E3.
2. **E5** — the bug; design the display-mesh module first (perf budget, layering), then implement.
3. **E9 (with E3 / E4)** — one left-panel refactor (`HierarchySection`), once E2 has decided where scene management lives. Do E5 and E9 in the same session only if the NPC row is touched once.
4. **E7-a/b + E8 preview** — path storage, path preview, speed, and the first hard-wired clip trigger (no dependency on zones or narrative). **E7-c / E8 bindings** wait for P0-2 + `@base/narrative` N1 and should be designed as **one Behaviors surface**, not two binders.

Relative to the existing Next (P0-2 zones → P0-1 collision): E5 affects how the owner's visual pass reads, so **Recommended:** run E5 before P0-2, and schedule E7-a/b right after P0-2 so E7-c's trigger sources exist when it starts.
