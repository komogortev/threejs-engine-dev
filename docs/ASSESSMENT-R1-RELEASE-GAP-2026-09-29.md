# ASSESSMENT — Release 1 (manual tool) vs. current state: the gap

> **Date:** 2026-09-29. **Docks:** [`docs/architecture/02-story-to-world-vision.md`](../../docs/architecture/02-story-to-world-vision.md) §1.1 — this project is **Release 1**: the plain manual tool for scene creation **and narrative programming**, on which a later AI-attached Release 2 is built.
> **Method:** re-read `STATE.md`, the 09-04 inventory, the 09-11 P0 plan, the editor roadmap, `three-dreams/src/reaction/`; ran `git fetch` + `gh pr list` + `git log` in engine-dev and SHARED; grepped the runtime for the gaps the docs claim.
> **Verification caveat (read first):** the editor and room player have **not been seen running by the owner since 09-16** — the visual pass has slipped three sessions. Every ✅ below is *source- or headless-verified*, not *eye-verified*. Feel (eye height, speed, FOV, the black void) is unmeasured. This is a gauge of what is built, not of how it plays.

---

## 1. Findings in one paragraph

Engine-dev's authoring half is largely built (assets, placement, NPC pose/animation recording, package export/import). Its **playing half is not**: nothing placed is solid, zones are dropped at load, and there is **no way to author or run narrative** — the one capability Release 1 is now defined to include. The narrative vocabulary already exists, but in the wrong place (`three-dreams`, a parked fork, coupled to its `GamePhase` type) and is absent from the package format, the SHARED packages and the editor. The roadmap ranks it last (Phase 6, "reevaluated after Phase 2–5 ship"); under Release 1 it is the **largest single gap**. Separately, **the engine track has produced no code since 2026-08-31** — state, not intent (the ai-env track had the cycle) — so the gap below is measured against a track that is not currently moving.

## 2. State check (probed 2026-09-29)

| Probe | Result |
|---|---|
| engine-dev `main` vs `origin` | in sync, clean; **0 open PRs** |
| engine-dev commits since 09-16 | 1, docs only (STATE contract). Code commits stop **08-31** |
| SHARED `origin/main` since 09-16 | 1, docs only. Last feature commits 09-16 (#49 saved-scene guards, #50 F-G5 linter) |
| `@base/physics` in engine-dev `package.json` | **absent** (P0-1 gap unchanged) |
| `zones` / `addStaticMesh` / `CharacterMover` / `request-scene-change` in `RoomPlayerModule.ts` + `RoomPlayerView.vue` | **0 matches** (P0-1 and P0-2 both still open) |
| `reaction*` anywhere in engine-dev `src/` | **0 files** |
| `EditorSceneModule.ts` (legacy, frozen) | **1,436 lines**, still present |

Nothing has moved since the 09-16 STATE, so STATE's "Broken / Next" lines remain accurate.

## 3. Release 1 exit criteria *(D1 — **ACCEPTED 2026-09-29**)*

R1 is done when an author **with no code** can, on a clean machine:

1. build a room from uploaded assets whose geometry is **solid** and whose lighting is not the default void;
2. place NPCs and props, pose/animate NPCs;
3. **program narrative** — trigger → condition → reaction (dialogue, set flag, play animation, change scene) — without editing TypeScript;
4. **play it inside the editor** and re-open a saved or exported scene to edit again;
5. link several rooms and ship the set as one distributable that runs **without the editor and without the author's browser storage**;
6. pass a validation gate that can actually fail.

**Acceptance test (a known positive, per rule R2): reproduce `three-dreams` scene-01's dad-NPC interaction with no code.** three-dreams hand-codes exactly what R1 must let an author do; if the tool cannot reproduce it, R1 is not done, whatever the checklist says.

## 4. Capability gap

Status: ✅ built (source/headless-verified) · 🟡 partial · ❌ not built. Size: **S** ≈ 1 working session · **M** ≈ 2–3 · **L** ≈ 4+ *(inferred; see §6 on why these are sessions, not dates)*.

| # | R1 capability | Status | Evidence | Remaining work | Size |
|---|---|---|---|---|---|
| 1 | Asset intake, library, GLB lint | ✅ | F-A1..A4, F-G5 (#50) | owner visual pass | — |
| 2 | Place / transform props | ✅ | D-3/D-4 gizmo | — | — |
| 3 | Characters: bind, pose, record, audition | ✅ | S4, S5-a..d | ~30 s real-rAF glance owed | — |
| 4 | Precision authoring | 🟡 | placed-object inspector is one hint line (C-5); undo is single-slot (C-10) | P1-4 inspector; undo stack optional for R1 | S (+L optional) |
| 5 | **Solid world** | ❌ | C-1; §2 probe | P0-1: 1g/1h SHARED (S) → 1a–1f engine-dev Stage A (M); *first live use of `CharacterMover` anywhere* | **M–L** |
| 6 | **Scene transitions (zones)** | ❌ | C-2; §2 probe | P0-2: tasks 2a–2e, pure wiring | **S** |
| 7 | Lighting / atmosphere | ❌ | C-9; F-LE4 unmigrated; no package fields | migrate F-LE4, add package fields, runtime read | M |
| 8 | Interactive objects | ❌ | C-3 — no type exists | see decision D2: **fold into #9**, do not build separately | (in #9) |
| 9 | **Narrative programming** | ❌ | vocabulary exists only in `three-dreams` (§5) | N1 extract → N2 schema + runtime → N3 authoring UI → N4 validation | **L (≈ 9–14 sessions total)** |
| 10 | Author loop | ❌ | C-7 no in-editor play; C-8 saved scene not openable from `/room`; F-A6 no ZIP re-import | F-LE6 play mode (M) · C-8 (S) · F-A6 (S–M) | M–L |
| 11 | Package export / import | 🟡 | single room ✅; a dropped ZIP can exit only to scenes in *this browser's* IndexedDB | multi-room world manifest (vision G4) | M |
| 12 | Validation gate | 🟡 | F-G5 live; L0 placement gate **vacuous** (C-6: nothing writes `attachment`); F-V1 not started | P1-5 gesture *or* stop claiming the gate; F-V1 | S–M |
| 13 | **Distribution** | ❌ | master roadmap Phases 5 (Electron) and 6 (Steam) ⬜; no design for how an author ships | undefined — see decision D4 | **L, unbounded until defined** |
| — | Owner-verified feel | ❌ | visual pass pending since 09-16 | one owner session; gates calibration of #5 | S (owner) |

**Count: 3 of 13 built, 3 partial, 7 not built.** By count that reads ~⅓–½ done; **by remaining size the ratio is worse**, because the three built rows are the small ones and the four ❌ rows carrying an L (#5, #9, #10, #13) are the release-defining ones.

## 5. The narrative gap, specifically

**What exists** — `three-dreams/src/reaction/` (711 lines): `Stimulus → Condition → Reaction`, no Three.js coupling.

| Axis | Vocabulary today |
|---|---|
| Stimulus (7) | `proximity_enter` `proximity_exit` `interact` `look_at`\* `flag_changed` `scene_entered` `custom` |
| Condition (5) | `flag_is` `phase_is` `once` `cooldown` `not` |
| Reaction (6) | `dialog` `animation` `set_flag` `emit` `sequence` `wait` |

\* declared, marked future.

**Why it is not already R1:**

- lives in a **parked fork**; engine-dev has zero reaction code;
- imports `GamePhase` from three-dreams' `sessionTypes` — a game-specific type in a would-be generic engine;
- **absent from the package format** — `reactions.json` was in the original D-4 layout and dropped at ship;
- dialog **rendering** is a UI subscriber that does not exist in the room player;
- the only link from editor to it is `EditorNpcEntry.entityId`, by naming convention in a comment;
- the roadmap places its authoring panel (F-R1) in Phase 6, *projected*, with "no scheduling commitment".

**Slices** (order matters):

| Slice | Content | Notes | Size |
|---|---|---|---|
| **N1** | Extract to SHARED (new package, Three.js-free); replace `GamePhase` with a generic flag/phase key | three-dreams keeps its copy until the fork-sync gate reopens — *copy, do not move* (fork boundary rule) | M |
| **N2** | Schema: reactions per entity in `scene.json` (+ flags); runtime: `RoomPlayerModule` hosts the engine; dialog UI + animation bridge | wires the P0-2 zone events as the first stimulus source | M |
| **N3** | Authoring UI (F-R1): stimulus/condition/reaction editor in the inspector | largest UI slice; depends on selection/inspector shape — the reason D-6 deferred it, now satisfiable | L |
| **N4** | F-V1 validation: broken entity/asset/clip/scene references; duplicate entityIds | makes the gate able to fail (#12) | S–M |

## 6. Total gap and how to read it

Sum of the sizes above, as a **range** (inferred, sessions not dates): **≈ 28–38 engine working sessions** to R1 exit, of which #9 narrative is roughly a third and #13 distribution is an unbounded term excluded from the low figure.

**Why sessions and not dates:** velocity is not a constant of this project, it is a function of which track has the cycle. Measured: S5 (five sub-slices) landed 07-05 → 07-15, ~10 days, when engine-dev was the active track. Since 08-31 the same track has landed nothing while ai-env ran. Commit recency cannot separate "parked" from "slow" (workspace sequencing rule); converting sessions to a calendar needs a statement of how many sessions per week engine-dev gets, which only the owner can give.

## 7. Roadmap vs. reality

| Roadmap element | Finding | Action |
|---|---|---|
| Editor roadmap goal line | "Author-friendly editor producing a downloadable scene package" — no narrative, no static build | Amend to R1 definition (D1) |
| **Phase 6 — F-R1 / F-V1** | Ranked last, "projected" | **Promote onto the R1 critical path** (N3, N4) |
| Phase 4 — F-LE2 primitives, F-LE3 scatter, F-LE8 bookmarks | Not required by any R1 criterion | **Defer explicitly**; unmigrated legacy features are not R1 |
| Phase 4 — F-LE4 atmosphere, F-LE6 play-sim | Required (#7, #10) | Keep, ranked P2 today → raise |
| Phase 4 — M-FINAL | Legacy 1,436-line `EditorSceneModule.ts` still present | Keep as hygiene; not blocking |
| Phase 2 / Phase 4 status marks | Headers read ⚪ though F-A1..A4, F-LE1, F-LE5 shipped (drift-sync note admits it) | Re-mark on next roadmap touch |
| **P0-1, P0-2** | Correctly first; verified still open | No change |
| Phase 5 F-A6 (editor re-import) | ⚪ | Needed for #10 |
| **Missing from roadmap** | World manifest / multi-room; distribution/packaging; R1 exit criteria | Add (D1, D4) |
| Track G L0 gate | Vacuously green (C-6) | Fix or stop citing it as a gate |
| Rapier 0.14 → 0.20 | Own slice | **Not on the R1 path** unless a bug forces it |
| Fork sync (three-dreams, dbox) | Parked on P0-2 + P0-1 Stage A; N1 adds a *consumer* of the new package there | Unchanged gate; three-dreams later adopts N1's package |

## 8. Recommended order

1. **P0-2** zone runtime (S) → 2. **P0-1** SHARED 1g/1h → engine-dev Stage A → 3. **owner visual + feel pass** (this is the first eyes on it since 09-16; do not skip)
4. **N1 → N2** (narrative package + runtime; zone events become its first stimulus) → 5. **F-LE6 in-editor play + C-8 + F-A6** (close the author loop *before* the large UI, so N3 is built with a fast iteration cycle)
6. **N3** authoring UI → 7. **N4** validation + P1-4 inspector + #7 lighting → 8. **#11** multi-room manifest → 9. **#13** distribution (after D4) → 10. **Acceptance test:** three-dreams scene-01 parity.

Steps 1–3 are already the queued engine work and unchanged.

**Amended 2026-10-07: content-delivery slices queued** ([`PLAN-SCENE-CONTENT-DELIVERY-2026-10-07.md`](PLAN-SCENE-CONTENT-DELIVERY-2026-10-07.md)).
The plan adds a build stage between the authored scene and the runtime, so a room filled with objects does not cost
one parse, one draw call and one cold shader per placement. The steps slot in as follows:
**CD-0** Sandbox loader fix (any time, XS) · after step 1: **CD-M** measure a rich fixture → **CD-1** load once per
asset → **CD-2** shader warm-up · inside step 2: **CD-4** colliders from the same dedupe, plus a solid-air/holes
measure as the acceptance check · after step 3: **CD-3** runtime batching, **only if CD-M shows draw-call bound**.
CD-5 (NPC crowd instancing) and CD-6 (bake at export) are parked with re-entry conditions in the plan.

**Amended 2026-10-07: editor Track P (prompt panel) queued ahead of E7 paths** (owner;
[`../../docs/PLAN-EDITOR-PROMPT-PANEL-2026-10-07.md`](../../docs/PLAN-EDITOR-PROMPT-PANEL-2026-10-07.md)). The
working order is now: SHARED #57 → **PP-1 … PP-6** → E7-a/b → E8 → P0-2 (+ CD-M/1/2) → P0-1 (+ CD-4). PP-1
absorbs the deferred undo stack (H-1), and PP-3 is the first author of placement attachments (Track G).

## 9. Decisions

| # | Decision | Recommendation |
|---|---|---|
| **D1** | Adopt §3 as the R1 exit definition (incl. narrative, multi-room, static-distributable, scene-01 parity test)? | ✅ **ACCEPTED 2026-09-29.** Without it "release" has no edge and the gap has no denominator |
| **D2** | P1-3 proposed a bespoke `interaction: { trigger, action }` on `placedObject`. Keep, or express interactive objects as stimulus bindings on the reaction vocabulary? | ✅ **ACCEPTED 2026-09-29 — fold into reactions; P1-3 is retired as a separate slice.** A second trigger vocabulary beside `Stimulus→Condition→Reaction` would be built twice and reconciled later |
| **D3** | Home for the extracted reaction engine | ✅ **ACCEPTED 2026-09-29 — new `@base/narrative`** via the `new-base-package` skill — Three.js-free, distinct concern; `@base/gameplay` is player/camera-shaped |
| **D4** | What does "release" ship — a hosted web tool, an Electron app, or a tool plus a player-runtime bundle for authors' outputs? | ⏳ **OPEN. Re-entry condition: decide before slice #11 (multi-room) starts (Recommended).** Nothing before then depends on it; #13 stays out of the gap total until then (vision Q8: owner's own authoring base first) |

## 10. What this assessment does not establish

- **Feel.** Nothing here says the room is pleasant to walk in.
- **Sizes.** S/M/L are inferred from the plans' task counts and S5's cadence; the ≈28–38 range is a sum of guesses and should be re-measured after P0-2 lands, the first slice whose actual cost can be compared to its estimate.
- **The 3 ✅ rows** are not owner-verified (see caveat above).
- **Distribution** is unsized because it is undefined.
