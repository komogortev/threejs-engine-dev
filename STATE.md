# STATE.md — threejs-engine-dev

## Status

_Last updated: 2026-03-28_

**What's working:** Player moves and animates across grounded, airborne, and water states. Sandbox scene has calibration ramps (soft → fatal landing tiers), knee/body-height obstacles, and a pool. Third-person orbit camera functional via mouse/gamepad. Jump arc and clip resolution debug logging available. Swimming v1 wired: `water.tread` and `water.swim.forward` trigger at shoulder depth. Landing severity tiers (soft/medium/hard/critical/fatal) wired to animation slots.

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
