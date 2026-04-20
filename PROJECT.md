# PROJECT.md — threejs-engine-dev

## Identity

- **Module:** `threejs-engine-dev` (dev harness — not an @base package)
- **Role:** Development and validation harness for all @base Three.js infrastructure packages. Drives implementation of `@base/player-three`, `@base/scene-builder`, `@base/camera-three`, and `@base/threejs-engine` before they are consumed by game forks.
- **Fork of:** `BASE/pwa-shell`
- **Extracts to:** Nothing — this is a permanent harness, not a candidate for extraction.

## North Star

A complete, playable dev playground where any `@base` Three.js package can be authored, validated, and calibrated before shipping into a game fork.

## Current Milestone

**Phase 3d — COMPLETE (2026-04-12)**

Scene editor harmonization done, camera architecture reviewed and documented, Phase 4C gate closed. Foundation track items continue as Phase 3e.

## Harmonized Plan (2026-04-12)

Work is organized in three tracks. Critical path unblocks the game fork; foundation track strengthens shared infrastructure; the dbox track is exploratory prototyping.

### Critical Path (unblocks Phase 4C)

| # | Target | Est. | Status |
|---|--------|------|--------|
| 1 | Harness scene editor harmonization — `SceneEditorPage.vue` → scenes prop + sandbox + registry | 1 session, 2-3 files | **Done** |
| 2 | Camera architecture review + documentation — formalize strategy switching, document decisions | 1 session | **Done** |
| 3 | Phase 3d sign-off — gate review, unblock three-dreams Phase 4C | — | **Done** |

### Foundation Track (parallel, not blocking)

| # | Target | Est. | Status |
|---|--------|------|--------|
| 4 | Gameplay harmonization — PlayerCameraCoordinator, tickPlayer/tickCamera split | 1 session | **Done** (2026-04-12) |
| 5 | Input settings page — click-to-rebind, 4-ability slots, mouse button rebinding | 1 session | **Done** (2026-04-12) |
| 6 | Scene editor extraction to @base/ui — SceneEditorView, multi-scene switcher | 1 session | **Done** (2026-04-10) |
| 7 | Waypoint editor to @base/ui — WaypointEditor composable, view, HUD, panel | 1 session | **Done** (2026-04-10) |
| 8 | NPC animation pack system — animationPackUrls, NpcGltfEntry, mixer lifecycle | 1 session | **Done** (2026-04-05) |
| 9 | Player ability locomotion hooks — rocket punch carry, skim jump, vertical impulse | 1 session | **Done** (2026-04-11) |
| 10 | GameplaySceneModule refactor — both harness and three-dreams use shared base cleanly | 1 session, ~10 files | Pending |
| 11 | Camera-relative movement (`movementBasis: 'camera'`) | 1 session | Deferred |

### Dbox Track (extracted to three-dbox 2026-04-12)

| # | Target | Status |
|---|--------|--------|
| 12 | Punch respects NPC lock | Moved to three-dbox |
| 13 | Slam interacts with blobs | Moved to three-dbox |

### Sequencing Principle

Steady progress on solid foundations. Each session should leave the codebase cleaner than it started. No rushing to close the gate — the gate closes when the foundation is right.

## V1 Scope

**In scope:**
- Full player locomotion harness: grounded, airborne, water, recovery states
- Mixamo FBX animation pipeline with semantic slot resolution
- Sandbox calibration scene with jump-arc debug, landing-tier ramps, and pool
- Scene descriptor / editor workflow (`SceneDescriptor` → `SceneBuilder` → `EditorSceneModule`)
- Third-person orbit camera (`facingLerpThirdPerson`, camera orbit via mouse/gamepad)
- Swimming v1: `water` PlayerMode, tread/swim animation slots, `SwimmableVolume` descriptor
- Dbox locomotion lab: OW1-tuned abilities, NPC blob interactions

**Out of scope for v1:**
- Game logic, narrative, or win conditions (lives in game forks)
- Multiplayer, networking
- Physics engine (Rapier) — pure raycasting is sufficient for harness
- Climbing implementation (design complete, implementation deferred)
- Camera mode switching in-game (Phase 4 game fork concern)

## Stack (beyond base fork)

- `@base/threejs-engine`: Three.js renderer, RAF loop, ECS, ThreeContext
- `@base/player-three`: PlayerController, CharacterAnimationRig, Mixamo FBX pipeline
- `@base/scene-builder`: SceneDescriptor, SceneBuilder, TerrainSampler, SwimmableVolume
- `@base/camera-three`: GameplayCameraController, third-person presets
- `@base/input`: keyboard, gamepad, touch providers → abstract InputAction
- `@base/audio`: AudioManager, MusicLayer, spatial audio

## Architectural Decisions

<!-- Append-only. Date each entry. Never remove old decisions. -->

- **2026-03-22** — Harness is a permanent fork, not promoted to a package. Reason: it is an integration test bed, not a reusable module. Packages extracted from it live in SHARED.
- **2026-03-23** — `ThreeModule` owns the RAF loop; child modules receive ticks via `engine:frame` event — no direct `update()` calls. Ensures decoupled module lifecycle.
- **2026-03-27** — `CharacterAnimationRig` uses regex-based Mixamo clip name resolution with a fallback chain. Explicit name mapping rejected: too brittle against Mixamo internal name variants.
- **2026-03-28** — `SwimmableVolume` (XZ bounding rect + surfaceY) replaces scalar `seaLevel`. Supports pools at any elevation. Old `descriptor.terrain.seaLevel` deprecated, kept for back-compat.
- **2026-03-28** — Climbing design: trigger volumes (not raycasted mesh tags), fixed-grid movement (no IK), animation-driven positioning. IK deferred post-launch.
- **2026-03-28** — `facingLerpThirdPerson` separate from `facingLerp` — third-person body turns need slower lerp than first-person snap.
