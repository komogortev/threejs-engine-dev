# Dbox (Doomfist harness) — progress log

Dev harness: `threejs-engine-dev` route **dbox**, scene `src/scenes/dbox.ts`, module `src/modules/DboxSceneModule.ts`, UI `src/views/DboxView.vue`. Locomotion uses `@base/player-three` via workspace `link:` to `SHARED`.

## Bindings (current)

| Action        | Input |
|---------------|--------|
| Rocket punch  | **Right mouse** on canvas — hold / release (charge ~1.4 s max, 4 s CD) |
| Rising uppercut | **Q** (6 s CD) |
| Meteor slam   | **E** hold → **floor cone** at **predicted landing**; **release** executes (6 s CD). Cancel: **Q**, punch start, punch fire, **blur**, or **water** while holding |
| Punch skim jump | **Space** during high planar carry |

`DboxView` clears default keyboard `interact` on **E** so slam does not conflict with shell interact.

## Rocket punch

- Charge curve, planar carry replace + vertical `replace` so punch cancels fall / overtakes uppercut.
- Pending charge if released on CD (`onBeforeGameplayTick` flush before `player.tick`).

## Uppercut

- Tuned rise (`UPPERCUT_UP` ≈ +0.5 s apex vs legacy at g = 30).
- NPC blobs: cone hit, lift, OW-style short lock; planar knock aligned with carry decay + optional forward intent bias.

## Slam

- **Any stance** (no air-only gate); **not** in water.
- **Hold**: `THREE.LineLoop` cone on **terrain** at ballistic **predicted landing** (gravity 30, current velocity + planar carry via `getPlanarCarryVelocity()`).
- **Release**: forward planar carry (minimum **1 m** asymptotic slide vs default carry decay `k`: `v ≥ k × 1`) + `SLAM_DOWN` vertical; blob hits in same cone at predicted landing.
- Tuning constants live at top of `DboxSceneModule.ts` (`SLAM_*`).

## Character asset

- `public/models/dfist_base.glb` — Trinity export, meshopt/WebP pipeline (see comments in `dbox.ts`).

## Shared package

- `SHARED/packages/player-three`: `getPlanarCarryVelocity()`, `setPlanarCarryVelocity`, `applyVerticalAbilityImpulse` blend modes, punch skim, `onBeforeGameplayTick` in `GameplaySceneModule` for pending punch.

## Verification

- `pnpm exec vue-tsc --noEmit` in `threejs-engine-dev`
- `pnpm --filter @base/player-three typecheck` in `SHARED`
