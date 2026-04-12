# STATE.md — threejs-engine-dev

## SNAPSHOT
Phase: 3d | Last: 2026-04-11 | Stack: Vue 3 + @base Three.js harness
Working: Player locomotion (ground/air/water), third-person camera, sandbox ramps, swimming v1; **dbox** locomotion lab (**`/dbox`**) with OW1-tuned punch/slam/uppercut, pool NPC blobs, uppercut victim lift + **0.6 s** lock on blobs; `GameplaySceneModule.onAfterGameplayTick` hook; optional `carryImpulseDecayPerSecond` scene config
Broken: Swimming clips unconfirmed, camera-relative movement (movementBasis), Phase 3d not started
Blocker: Terrain surface-normal API not exposed (needed for uphill lean animation)
Next: Uphill threshold fix in PlayerController.ts (maxWalkableSlope), then Phase 3d camera strategy switching; optional — dbox: punch respects NPC lock, slam interacts with blobs, `@base/input` ability actions

---

## Status

_Last updated: 2026-04-11_

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

- Phase 3d: editor camera strategy switching (third-person ↔ first-person in scene editor without touching game code)
- Investigating swimming animation clip resolution discrepancy

## Blockers & Open Questions

- **[2026-03-28]** Terrain surface-normal API not exposed from `GameplaySceneModule` — needed for uphill lean animation. Options: expose from scene or compute in `PlayerController`.
- **[2026-03-28]** `water__entry__fall.fbx` placeholder — source proper water-entry clip from Mixamo before three-dreams integration.

## Next Session

> Start with **uphill threshold fix**: open `PlayerController.ts`, find `isWallAhead()`, log `heightDelta` vs `wallStumbleHeightThreshold` at the rejection moment. Add `maxWalkableSlope` config param (degrees → height-delta) so ~35° slopes pass but ≥45° ledges still block. Then 30-min jump calibration pass using `debugJumpArc` logs on the sandbox ramps.

## Decision Log

<!-- Append-only. One line per decision, newest first. -->

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
