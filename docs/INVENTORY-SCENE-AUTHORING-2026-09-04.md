# Scene-authoring inventory — what a user can build today, and the ceiling

> **Scope:** `threejs-engine-dev` `/editor` (backed by `@base/ui` `editor/`) + the `/room` walkthrough player.
> **Date:** 2026-09-04. **Method:** source read + live editor session (assets seeded, IndexedDB inspected, DOM driven).
> **Verification caveat:** the Browser pane was hidden for this session, so the canvas was **0×0 and rAF suspended**.
> Every capability claim below is grounded in source, DOM or IndexedDB. **Nothing about *feel* was measured** —
> frame pacing, camera comfort, lighting readability and locomotion calibration all still need an owner glance.

---

## 1. What a user can achieve today

Verified working end-to-end in a live editor session.

### Assets

| Action | Path | Notes |
|---|---|---|
| Upload GLB / FBX | drag-drop or file picker → Dexie (`@base-assets`) | kind auto-classified: `skinnedCount>0` → character; large unskinned+clips → environment |
| Browse / filter library | Asset Library dialog, kind-aware picker | thumbnails via offscreen render |
| Reuse across scenes | asset rows are global, scenes reference `assetId` | |

### Scene composition

| Action | Path | Notes |
|---|---|---|
| Place a GLB | AssetPicker → **Place in scene** | creates `EditorPlacedObject` |
| Move / rotate / scale it | TransformControls gizmo (T/R/S) | **gizmo only — no numeric entry** |
| Revert last gizmo drag | Ctrl+Z | single slot, **not a stack** |
| Set player spawn | Inspector → Spawn Point (X/Z) | **no yaw** |
| Set ambient audio | Inspector → Audio track + volume | one global track per scene |
| Switch editor camera | Tab — orbit / first-person / follow-3p / free-fly | |

### NPCs

| Action | Notes |
|---|---|
| Add / remove NPC | |
| Position (numeric X/Z/Y), rotationY, scale, proximity radius | numeric fields exist here, unlike placed objects |
| Bind character mesh + animation pack + default clip | any model kind is assignable as a body |
| Pose via FK bone tree + IK chains | DFS-ordered collapsible tree; pose memos in localStorage |
| Record / edit animation clips, export an anim pack | S5 — timeline tab, keyframes, load-existing-clip round-trip |
| Audition a clip on the NPC | ▶/■ in the Asset tab |

### Zones

| Action | Notes |
|---|---|
| Add / remove zone | type is **`exit` or `proximity` only** |
| Centre (X/Z), radius, label, colour, `targetSceneId` | |

### Output

| Action | Result |
|---|---|
| Save scene to IndexedDB | reachable from Sandbox |
| Download sandbox ZIP | manifest + asset blobs |
| **Export room package ZIP** | `manifest.json` + `scene.json` + `assets/` — the Interactional Room artifact |
| Copy scene config as TypeScript | |
| Walk it | `/room` → drop the ZIP |

---

## 2. The ceiling

This is what you actually get when you walk a scene you just authored.

### C-1 — Nothing you place is solid. *(the dominant ceiling)*

`RoomPlayerModule` constructs `GameplaySceneModule` with **no descriptor**, so no `navMeshUrl` is set, so
`MeshTerrainSampler.fromRoot()` never runs. The player walks a **flat procedural disc** (`groundRadius: 60`, y=0)
and passes through every wall, floor, stair and prop. `RoomPlayerModule.ts` contains **zero** references to
`collider`, `collision`, `physics` or `navMesh`.

A room is currently a **diorama you float through**, not a space. Nothing else on this list matters as much.

Compounding it: **`threejs-engine-dev` does not depend on `@base/physics` at all.** The platform already solved
this in dbox — `PhysicsWorld.addStaticMesh()` and `CharacterMover` (Rapier KCC, S0 ✅ GO) are on `@base/physics`
main. The room player just never picked them up.

### C-2 — Zones are authored, exported, and then silently dropped.

`RoomPackageScene.zones` is written by the exporter. `RoomPlayerModule.loadRoom()` reads `placedObjects`, `npcs`,
`spawnPoint` and `ambientAudioAssetId` — **and never touches `zones`**. So exit zones don't transition and
proximity zones fire nothing. This is the only interactivity the schema can express, and the runtime ignores it.

### C-3 — There is no interactive-object type.

The complete authorable vocabulary is:

```
placedObject   transform + assetId             (inert)
npc            transform + mesh + one looping clip + pose
zone           centre + radius + type          (inert at runtime, see C-2)
spawnPoint     x, z
ambientAudio   one track + volume
```

No door, switch, pickup, container, lever, trigger→action binding, or per-object state exists anywhere in
`sceneEditorTypes.ts` / `roomPackageTypes.ts`. **A user cannot author an interactive object at all** — the request
that opened this session has no target in the current schema.

### C-4 — NPCs are ambient set-dressing.

One looping `defaultClip`, no reaction, dialogue, gaze, path-following or player-awareness in the room package.
The Reaction Engine exists, but in `three-dreams` — not in the editor and not in the package format.

### C-5 — Placed objects have no inspector.

Selecting one shows exactly one line: *"Placed object selected. Use the gizmo (T/R/S) to transform it."*
No numeric transform, no rename, no delete, no duplicate. NPCs and zones have numeric fields; props don't —
which inverts the need, since precision placement (a lamp *on* a table) is a prop problem.

### C-6 — The L0 placement gate validates nothing in practice.

`validatePlacement` is wired into save/export, but the snapshot path is `.filter((o) => o.attachment)` and
**no editor gesture ever writes `attachment`**. It is only ever passed through when reloading a scene that already
had one. The gate ships; the data it gates does not exist. (Roadmap Track G records this as "drop-warn deferred to
gesture" — worth restating as a blocker rather than a deferral, because the gate currently reports clean on every
scene by construction.)

### C-7 — No in-editor play mode.

F-LE6 "walk-scene play simulation" is Phase 4, not started. The Inspector's **"Play Simulation"** is a section
*header* over the player-character binding fields, not a mode. To see your scene you must export a ZIP and drop it
into `/room`.

### C-8 — You cannot open the scene you just saved.

`/room` cold start accepts **only a dropped ZIP**. `loadRoomFromDb()` exists and works, but is reachable only from
the in-world E-key environment menu — i.e. after you are already inside a room. Save-to-IndexedDB and the room
player never meet.

### C-9 — Lighting and atmosphere are not authorable.

F-LE4 (atmosphere editing) is unmigrated, and `RoomPackageScene` has no lighting fields. Every room renders under
`GameplaySceneModule` defaults with `fogColor`/`groundColor` hardcoded to `0x111111` — a black void beyond
whatever you placed.

### C-10 — Undo is a single slot.

Last gizmo drag only. No history stack (assessed and deferred as H-1/H-2).

---

## 3. Missing features, ranked

Ranked by what unblocks *"a scene with interactive objects"*, not by effort.

| # | Gap | Why it ranks here |
|---|---|---|
| **P0-1** | **Collision for placed geometry in the room player** | Without it nothing reads as a space. `@base/physics` already has `PhysicsWorld.addStaticMesh` + `CharacterMover`; the work is adding the dep and feeding placed roots in, not new physics. |
| **P0-2** | **Zone runtime in `RoomPlayerModule`** | The only authored interactivity that exists, currently discarded at load. Cheapest real interactivity on the board: `exit` → `unloadRoom()` + `loadRoomFromDb(targetSceneId)` is already written. |
| **P1-3** | **An interactive-object type in the schema** | `placedObject` + optional `interaction: { trigger, action }`. Additive; loaders are already documented as lenient on unknown keys. |
| **P1-4** | **Placed-object inspector** | Numeric transform, rename, delete, duplicate. Daily authoring friction, small change. |
| **P1-5** | **Attachment authoring gesture** | Makes the shipped L0 gate real instead of vacuously green. |
| **P2-6** | **Load-from-DB on the `/room` landing screen** | Closes the save→walk loop; the loader already exists. |
| **P2-7** | **Per-room lighting / atmosphere in the package** | Currently every room is the same black void. |
| **P2-8** | **In-editor play mode (F-LE6)** | Removes the export→download→drop round-trip from every iteration. |
| **P3-9** | **Undo stack** | Known, assessed, deferred. |

---

## 4. Calibrations — owner playtest required

Not measurable in this session (canvas 0×0, rAF suspended). Each is a hardcoded constant with no authoring surface:

- `firstPersonEyeOffsetY: 1.675` — fixed eye height, no per-room override.
- `groundRadius: 60`, `groundColor` / `fogColor` `0x111111` — the void beyond the room.
- Character auto-fit clamps meshes outside `[0.3, 4]` m to `1.7` m — a silent correction that can mask a bad export.
- Locomotion speed, turn rate, FOV — inherited from `GameplaySceneModule` defaults, never tuned for a walkthrough
  (they were tuned for a combat sandbox).
- **Unverified since S5 merged:** animation playback over time in a real rAF frame (animated room NPC, live
  audition, kit-append). This is the ~30 s glance STATE has carried as outstanding.

---

## 5. Note on `three-dbox`

This session opened scoped to dbox before re-scoping here. Recording the relevant finding: **dbox has no scene
authoring surface at all.** Building an arena there is a GLB produced externally, a hand-written
`src/maps/<name>.ts` `MapDescriptorData`, a registry entry, and a rebuild. Its interactive-object vocabulary is
health packs (extracted by OWLib hex entity ID), five hardcoded NPC blobs, swimmable volumes and wall colliders —
all code-authored, none of it reachable from the editor.

The two halves are complementary and disconnected: **dbox has the collision and physics the room player lacks;
the editor has the authoring the arena lacks.** P0-1 above is the seam.
