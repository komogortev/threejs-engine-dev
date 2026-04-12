# STATE.md — threejs-engine-dev

## SNAPSHOT
Phase: 3d | Last: 2026-04-12 | Stack: Vue 3 + @base Three.js harness
Working: Player locomotion (ground/air/water), third-person camera, sandbox ramps, swimming v1; **dbox** locomotion lab (**`/dbox`**) with OW1-tuned punch/slam/uppercut, pool NPC blobs, uppercut victim lift + **0.6 s** lock on blobs; `GameplaySceneModule.onAfterGameplayTick` hook; optional `carryImpulseDecayPerSecond` scene config; **gameplay harmonization Phase 3+4**: `GameplaySceneModule` delegates to `@base/gameplay` `PlayerCameraCoordinator` (tickPlayer/tickCamera split); input settings page (`/settings`) with click-to-rebind keyboard bindings via `useInputSettings` composable + localStorage persistence
Broken: Swimming clips unconfirmed, camera-relative movement (movementBasis)
Blocker: Terrain surface-normal API not exposed (needed for uphill lean animation)
Next: Camera architecture review → Phase 3d sign-off (scene editor harmonization done)

---

## Status

_Last updated: 2026-04-12_

**What's working:** Player moves and animates across grounded, airborne, and water states. Sandbox scene has calibration ramps (soft → fatal landing tiers), knee/body-height obstacles, and a pool. Third-person orbit camera functional via mouse/gamepad. Jump arc and clip resolution debug logging available. Swimming v1 wired: `water.tread` and `water.swim.forward` trigger at shoulder depth. Landing severity tiers (soft/medium/hard/critical/fatal) wired to animation slots.

### Checkpoint — dbox locomotion lab (2026-04-11)

- **Route / menu:** `/dbox` · **Dbox (locomotion lab)** in main menu · persistent on-screen key map.
- **Scene:** `dboxScene` clones sandbox descriptor (`src/scenes/dbox.ts`); `DboxSceneModule` extends sandbox geometry + behaviour (`src/modules/DboxSceneModule.ts`).
- **OW1-oriented tunables:** walk **5.5 m/s**; rocket punch charge **~1.4 s**, CD **4 s**, planar carry tuned for **~10–20 m** slide with decay **8/s**; uppercut / slam CD **6 s**; uppercut vertical tuned for prototype.
- **Abilities:** **E** charge punch · **Q** uppercut · **G** slam (air); `@base/player-three`: `addPlanarCarryImpulse`, `applyVerticalAbilityImpulse`, optional `carryImpulseDecayPerSecond` (SHARED commits on `player-three`).
- **NPC blobs ×5:** magenta spheres south of pool; **uppercut** hits frontal cone + range → **lift** + **0.6 s** victim lock (no self-move/abilities during lock) + emissive feedback; per-frame integration via `onAfterGameplayTick`.
- **Git:** commits through `8736709` on branch `feat/gameplay-module-sync-2026-03-28`; tag **`dbox-locomotion-checkpoint-2026-04-11`** marks this checkpoint (see below).

**What's broken / incomplete:** Swimming animations not visually confirmed — clip resolution depends on Mixamo internal name matching (enable `debugClipResolution` to verify). `water__entry__fall.fbx` is a placeholder. `failJump` clip uses "Straight Landing" as mild substitute. Third-person orbit does not affect WASD movement basis (camera-relative movement needs `movementBasis: 'camera'`). Phase 3d camera strategy switching not started.

## Active Work

**Harmonized plan adopted 2026-04-12.** Three tracks: critical path (unblock 4C), foundation (shared infra quality), dbox (exploratory).

- **Next up (critical path):** Camera architecture review — document `@base/camera-three` API, confirm Phase 4C readiness → Phase 3d sign-off
- **Done:** Scene editor harmonization (harness `SceneEditorPage.vue` on `scenes` prop pattern, registry + configs extracted)
- **Foundation track:** GameplaySceneModule refactor (both sides), input settings page
- **Deferred:** Swimming clip investigation, dbox enhancements

## Blockers & Open Questions

- **[2026-03-28]** Terrain surface-normal API not exposed from `GameplaySceneModule` — needed for uphill lean animation. Options: expose from scene or compute in `PlayerController`.
- **[2026-03-28]** `water__entry__fall.fbx` placeholder — source proper water-entry clip from Mixamo before three-dreams integration.

## Next Session

> **Read `PLAN-critical-path.md` first** — it has the full implementation spec with code sketches.
>
> ### Target 1 — Scene Editor Harmonization (implement)
>
> Create 3 files, rewrite 1:
>
> 1. **Create `src/scenes/editor/types.ts`** — `HarnessSceneEntry` interface (`id`, `label`)
> 2. **Create `src/scenes/editor/registry.ts`** — `HARNESS_EDITOR_SCENES` array (scene-01 only for now)
> 3. **Create `src/scenes/editor/configs.ts`** — `getEditorConfig(sceneId)` function
>    - Move NPC entries, zone entries, spawn point, floor/context GLB URLs, storage key prefix, export name prefix from the current `SceneEditorPage.vue` into a `Record<string, SceneEditorConfig>` map
>    - scene-01 config: `floorGlbUrl`, `contextGlbUrls`, `storageKeyPrefix`, `exportNamePrefix`, `npcs` (dad), `zones` (hilltop exit), `spawnPoint`
> 4. **Rewrite `src/views/SceneEditorPage.vue`**:
>    - Import `HARNESS_EDITOR_SCENES` + `getEditorConfig`
>    - Build sandbox entry: `{ id: '__sandbox__', label: 'Sandbox', config: { npcs: [], zones: [] } }`
>    - Map registry → `SceneEditorEntry[]` via `getEditorConfig`
>    - Pass `[sandboxEntry, ...registryEntries]` as `:scenes` prop
>    - Drop old `config` / `scene-label` props, drop `computed`, drop inline NPC/zone arrays
>    - Keep `← Back` button + page styles
> 5. **Verify**: `pnpm dev` → `/#/scene-editor` → dropdown shows Sandbox + Scene 01 → switching loads floor + NPCs + zones → waypoint storage scoped correctly
>
> ### Target 2 — Camera Architecture Review (document)
>
> 1. **Create `SHARED/packages/camera-three/ARCHITECTURE.md`**:
>    - 6 source files, their roles
>    - `GameplayCameraController`: modes (`third-person` | `first-person`), 4 presets, update/snap API
>    - `computeThirdPersonCamera`: the 4-param rig math (distance, height, lateral, pivotY)
>    - `FirstPersonViewConfig`: eye offset, crouch drop, pull-back
>    - Integration with `PlayerCameraCoordinator` from `@base/gameplay`
>    - Editor play-sim usage (same controller, B toggles mode, `[`/`]` cycles presets)
> 2. **Phase 4C readiness section**: camera rails (new mode), `CameraTransitionManager` (new class for blend), no changes needed to existing API
> 3. **Append decision** to `STATE.md` Decision Log: camera arch reviewed, no gaps, 4C can proceed
> 4. **Verify manually**: gameplay cam in sandbox + scene-01, editor play-sim toggle + preset cycle, editor orbit + avatar follow
>
> ### Target 3 — Phase 3d Sign-off (gate)
>
> After targets 1+2 are verified:
> 1. Walk the sign-off checklist in `PLAN-critical-path.md` Target 3
> 2. `pnpm build` all SHARED packages — confirm clean
> 3. Update `threejs-engine-dev/PROJECT.md` — mark Phase 3d complete
> 4. Update `threejs-engine-dev/STATE.md` — clear Phase 3d from active work
> 5. Update `three-dreams/STATE.md` + `PROJECT.md` — unblock Phase 4C
> 6. Update memory files + `CLAUDE.md` — remove/update blocking rule

## Decision Log

<!-- Append-only. One line per decision, newest first. -->

- **2026-04-12** — **Camera architecture reviewed (Target 2).** `@base/camera-three` has no blockers for Phase 4C. Cinematic mode is purely additive: `CinematicCameraRig` + `CameraTransitionManager` + `PlayerCameraCoordinator.suspend/resume` — no existing API changes needed. See `SHARED/packages/camera-three/ARCHITECTURE.md`.
- **2026-04-12** — **Scene editor harmonization complete (Target 1).** Harness `SceneEditorPage.vue` rewritten to use `scenes` prop pattern (mirrors three-dreams). Created `src/scenes/editor/types.ts`, `registry.ts`, `configs.ts`. Also fixed two pre-existing build errors: `DboxView.vue` `mergeBindings` cast (`as unknown as`), and `EditorOrbitBookmark`/`EDITOR_ORBIT_BOOKMARKS`/`EDITOR_ORBIT_LOCOMOTION_IDS` missing from `@base/ui` src exports + `sceneEditorTypes.ts`.
- **2026-04-11** — **dbox checkpoint:** locomotion lab lives only in `threejs-engine-dev` (not three-dreams). NPC “blobs” are visual/physics stand-ins for uppercut victim lock (**0.6 s** OW1 air-control window); full AI / `@base/input` ability channels deferred.
- **2026-04-11** — **`onAfterGameplayTick`** on `GameplaySceneModule` for lightweight scene extras that must share the same **simDelta** as the player (avoids a second `registerSystem` and double time-step logic).
- **2026-03-28** — `SwimmableVolume` per-body rather than global `seaLevel`. Enables pools at any elevation (scene-01 pool + future multi-level scenes).
- **2026-03-28** — Climbing: trigger volumes + fixed-grid movement, no IK in v1. Design finalized, implementation deferred pending swim fix.
- **2026-03-28** — `facingLerpThirdPerson: 5` as separate config from `facingLerp: 12`. Third-person body turns feel wrong at first-person snap speed.
- **2026-03-27** — Overlay system handles upper/lower body split (not separate rigs). Fewer draw calls, simpler pipeline.
- **2026-03-22** — Dev harness stays as permanent fork; nothing extracted from it directly (packages go to SHARED independently).

## Deferred

- **Climbing implementation:** Design complete (`next-session-swimming-climbing-uphill.md`). Needs `ClimbVolume` descriptor, `PlayerMode`, animation slots, and ledge-exit position snap. Blocked on swim fix first.
- **Camera-relative movement (`movementBasis: 'camera'`):** WASD moves relative to character facing in third-person orbit. Needs `movementBasis` config in `PlayerController`. Deferred until Phase 3d camera work.
- **Phase 3d camera strategy switching:** Switch between third-person and first-person cameras in editor play-sim. Prerequisite for Phase 3 sign-off.
- **`water__entry__fall.fbx` replacement:** Placeholder in place. Source a proper water-entry clip from Mixamo.
- **`failJump` clip:** "Straight Landing" used as substitute. No true stumble-back clip found yet.
