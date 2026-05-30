# STATE.md — threejs-engine-dev

## SNAPSHOT
Phase: Phase D — D-0 ✅, D-1 ✅, D-2 ✅, D-3 ✅, D-4 ✅, D-5 ✅, D-6 ✅ — Phase D COMPLETE | Last: 2026-05-29 | Stack: Vue 3 + @base Three.js harness
Working: Phase 3d signed off (2026-04-12). Player locomotion, camera presets, sandbox, settings. **D-0–D-6 complete** (see Decision Log for per-step detail). **Camera + controls calibration (2026-05-29):** (1) Camera mode isolation fixed — `controls.update()` guarded to orbit/follow-3p only; removed stray `camera.quaternion.setFromEuler()` from FPV snap that triggered OrbitControls drift detection. (2) Editor 3P strafe: character always faces `camFwd`, A/D no longer spins body. (3) 3P polish: `minDistance 2/maxDistance 12`, `maxPolarAngle 0.82π`, entry resets camera behind character, exp-lerp target (frame-rate-independent `1-exp(-6δ)`). (4) Assets section stripped to count badge + "+ Add Assets" button opening new `AssetLibraryDialog.vue`. (5) Sandbox standardized with editor: initial `'first-person'` mode, `firstPersonEyeOffsetY: 1.675`, Tab cycles FPV→3P→float. (6) Character hidden in FPV — `GameplaySceneModule.setCameraMode` toggles `character.visible = mode !== 'first-person'`. (7) Ctrl crouch in sandbox: `mergeBindings` adds `ControlLeft`/`ControlRight` to crouch alongside default `KeyC`. (8) Free-float height: `ShiftLeft/ShiftRight`=raise, `ControlLeft/ControlRight`=lower in both editor and sandbox; `PlayerCameraCoordinator` captures `ffRaise`/`ffLower` before clearing locomotion flags in `tickPlayer`. **Prior — @base/ui editor UX polish (2026-05-26):** asset detail dialog, Dexie scene load/save, camera 4-button system, FPV eye height fixes, named scene persistence.
Broken: Swimming clips unconfirmed, camera-relative movement (movementBasis)
Blocker: Terrain surface-normal API not exposed (needed for uphill lean animation)
Next: **Camera/controls calibration ✅ (2026-05-29) — commit + PR this session.** After merging: merge PR #29 (D-5b play-sim real character), then NPC rendered-character preview, zone behaviour wiring, or T-F7 GLB normalization.

---

## Status

_Last updated: 2026-05-20_

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

**Phase 3d complete (2026-04-12).** Harness is stable. Foundation track 6/8 items done; dbox extracted to standalone project.

- **Critical path:** ~~Scene editor harmonization~~ done → ~~Camera architecture review~~ done → ~~Phase 3d sign-off~~ done
- **Foundation track:** ~~Gameplay harmonization~~ done → ~~Input settings~~ done → ~~Scene editor to @base/ui~~ done → ~~Waypoint editor to @base/ui~~ done → ~~NPC animation packs~~ done → ~~Player ability hooks~~ done → GameplaySceneModule refactor remaining
- **Dbox track:** Extracted to `three-dbox` standalone project (2026-04-12)
- **Deferred:** Swimming clip investigation, camera-relative movement

## Blockers & Open Questions

- **[2026-03-28]** Terrain surface-normal API not exposed from `GameplaySceneModule` — needed for uphill lean animation. Options: expose from scene or compute in `PlayerController`.
- **[2026-03-28]** `water__entry__fall.fbx` placeholder — source proper water-entry clip from Mixamo before three-dreams integration.

## Next Session

> **Phase D demo milestone is planned.** Start with D-0 (route + menu cleanup), then D-1 (free-float camera). T-F7 GLB normalization is pending but deprioritised relative to Phase D. See `docs/roadmap/01-editor-roadmap.md` §Phase D for full sequence and decisions.

### Phase D — Demo milestone (active next)

D-0 → D-1 → D-2 → D-3 → D-4 → D-5 → D-6. See editor roadmap for per-phase detail. Pre-implementation check for D-1: grep `three-dreams` and `three-dbox` for exhaustive switches on `GameplayCameraMode` before adding `'free-float'` to the union.

### T-F7 — GLB Model Normalization (pending)

Design complete (2026-04-19). Cross-pipeline consult with gmod-model-pipeline confirmed approach.
Full findings + checklist: `docs/T-F7-glb-normalization.md`

**Phase A — Pipeline fix (start here):**
- Add `center --pivot bottom` pass to `optimize-glb.sh` before meshopt compression
- Re-optimize existing Tripo GLBs and verify alignment in three-dreams + three-dbox

**Phase B — Runtime fallback in `@base/threejs-engine/AssetLoader.ts`:**
- `normalizeOrigin?: boolean` option on character load
- Box3 pivot-wrap + floor-snap; scale-drift detection + warning

**Phase C — Integration validation** (harness sandbox scene + three-dreams)

### GameplaySceneModule refactor (Foundation #10, follow-on)

Both harness and three-dreams use `GameplaySceneModule` from `@base/gameplay`. Clean up legacy overrides so both sides delegate cleanly to the shared base.

### Deferred items (low priority)

- Swimming clip investigation — verify `water.tread` / `water.swim.forward` with `debugClipResolution`
- Camera-relative movement (`movementBasis: 'camera'`) — WASD relative to camera facing in third-person

## Decision Log

<!-- Append-only. One line per decision, newest first. -->

- **2026-05-24** — **Named scene persistence.** `assetDb` v2 adds `scenes` table (`SceneRow { id, name, savedAt, placedObjects[] }`). Editor "Save Scene" replaces "Save as Sandbox" — name input + Dexie write, `currentSceneId` for overwrite. `SandboxSceneModule.loadPlacedObjects(sceneId)` drops localStorage in favour of `assetDb.scenes.get(sceneId)`. `SandboxView` shows a picker overlay (newest-first list, delete per scene) before mounting the engine; auto-migrates legacy `localStorage['sandbox:scene']` to Dexie on first visit and removes the key. `MenuView` gate checks Dexie count || legacy localStorage. `@base/ui` index exports `SceneRow`. Browser-verified end-to-end (migration + pick + load). Why: single-slot localStorage was a D-6 shortcut; named persistence is the minimal viable path toward multi-scene authoring.
- **2026-05-23** — **D-5 complete — Player model in editor (browser-verified).** `EditorCamMode = 'orbit' | 'follow-3p' | 'free-float'` exported from `sceneEditorTypes.ts`; `{ kind: 'player' }` added to `EditorSelection`. Teal `CapsuleGeometry` proxy at origin (no `@base/player-three` dep — capsule avoids GLB dependency for D-5; full character GLB is D-5b). Tab cycles all three modes. Click player (or Player row in hierarchy) → `follow-3p`: player visible, WASD camera-relative movement, `controls.target` lerps to player. `free-float`: pointer-lock mouse-look + WASD drives camera directly, player hidden — Esc releases lock and returns to `orbit`. T/R/S shortcuts guarded to `orbit` mode only (WASD not stolen). Mutual exclusivity: click NPC/zone/placed → `orbit` + TC attaches; click player → `follow-3p` + TC detaches. Camera mode pill (top-right, color-coded) + context-aware hint strip in `SceneEditorView`. `follow-3p` badge on Player row in hierarchy. Inspector shows empty for player (read-only position display deferred to D-5b). D-6 (save-as-sandbox) is next.
- **2026-05-21** — **D-3 complete — TransformControls in `@base/ui`.** `useSceneEditorViewport` now creates a `TransformControls` (r170+ `getHelper()` pattern). NPC marker parts (sphere + stem + ring) grouped into a per-NPC `THREE.Group` so the gizmo moves the whole marker. T/R/S mode buttons on viewport toolbar + T/R/S keyboard shortcuts. `gizmoMouseDown` flag (from TC's `mouseDown` event) prevents `onMouseUp` selection logic from firing when user clicks a gizmo handle. Uniform-scale enforcement on `objectChange` in scale mode. `enabled=false` when nothing selected prevents TC from stealing pointer from OrbitControls. Browser-verified: NPC marker translates in viewport. D-4 (placement pipeline) is next.
- **2026-05-21** — **D-1 complete — free-float camera.** `'free-float'` added to `GameplayCameraMode` union in `@base/camera-three`. `PlayerCameraCoordinator` (`@base/gameplay`) extended: `ffYaw`/`ffPitch`/`ffPosition` state seeded from camera transform on mode entry; `lastCamera` cached each tick as fallback when toggle passes `camera=null` (Tab always passes null — the fallback is the common path). Pitch-aware YXZ forward vector (`-sinYaw·cosPitch, sinPitch, -cosYaw·cosPitch`) for WASD translation; right vector stays horizontal. `CAMERA_MODE_ORDER = ['third-person','first-person','free-float']` replaces binary flip. `tickCamera` returns early for free-float, bypassing `GameplayCameraController.update()` (which falls through to third-person for unknown modes). Browser-verified in Sandbox: Tab cycles 3p→1p→free-float; WASD moves in the direction the camera is pointing; mouse-look rotates freely.
- **2026-05-20** — **D-0 complete.** Menu collapsed to Sandbox · Editor · Settings. Dead routes + views deleted (GameView, DboxView, SceneView, DboxSceneModule, dbox.ts). Sandbox button disabled when `sandbox:scene` absent from localStorage. Legacy `/editor` kept as frozen Phase 4 reference. WaypointEditorPage back link corrected to `/editor`. Build clean (5s). three-dreams + three-dbox verified: no exhaustive switches on `GameplayCameraMode` → D-1 safe to implement.
- **2026-05-20** — **Phase D demo milestone planned.** Menu → Sandbox · Editor · Settings. Engine Test + Dbox removed from engine-dev. Sandbox gated on saved scene. Free-float = WASD+mouse-look (new `'free-float'` in `GameplayCameraMode`). Editor base: `@base/ui` SceneEditorView extended with TransformControls (D-3) + placement pipeline (D-4) + player model with click-select (D-5). Legacy editor frozen as Phase 4 reference. Scatter/atmosphere deferred post-demo. Full plan: `docs/roadmap/01-editor-roadmap.md` §Phase D.
- **2026-05-20** — **Main menu editor naming.** **Scene Editor** → `/scene-editor` (`SceneEditorPage` / `@base/ui`); **Legacy Editor** → `/editor` (`EditorView` / `EditorSceneModule`) — fixes prior mismatch where the menu label pointed at the legacy route while `/scene-editor` had no entry. `WaypointEditorPage` “← Scene Editor” back button now returns to `/scene-editor`.
- **2026-04-12** — **Animation harmonization.** Dbox character (`dfist_base.glb`) wired to `animations_base.glb` GLB pack (same path as three-dreams NPC pack, served via `gamePublicFallback`). `SandboxSceneModule` already sets `debugClipResolution: true` — slot resolution logs visible in dbox. Harmonized rule: FBX characters use `MIXAMO_FBX_CLIP_URLS`; GLB characters use GLB animation pack URL.
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
