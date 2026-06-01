# STATE.md — threejs-engine-dev

## SNAPSHOT
Phase: Phase D COMPLETE → Phase 5 Room Package pipeline | Last: 2026-06-01 | Stack: Vue 3 + @base Three.js harness
Working: All prior + **S4-b SHIPPED (2026-06-01):** CCD IK via custom iterative solver (`runCcdIk` — 10-iteration CCD, no skeleton modification needed), IK target spheres for all 4 Mixamo limb chains (right/leftArm, right/leftLeg) appearing in viewport when Pose tab is active — click to attach TC in translate mode → bone chain follows via `objectChange` IK update; `selectIkTarget()` + `ikChainNames` ref on viewport return. `detachPoseNpc` / `resetPoseBones` handle IK cleanup and sphere repositioning. `RoomPlayerModule` applies `poseOverride` quaternions before root add (static NPC pose). Both builds clean. Branch SHARED PR #31.
Broken: Swimming clips unconfirmed, camera-relative movement (movementBasis)
Blocker: Terrain surface-normal API not exposed (needed for uphill lean animation)
Next: S4-c polish (optional) or S5 Animation Recorder. Personal Planner L2-S2 Tags also queued.

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

- **2026-06-01** — **Phase 5 S2 shipped — Room Package export side.** `roomPackageTypes.ts`: locked `RoomPackageManifest` (version/exportedAt/packageId/sceneLabel) + `RoomPackageScene` (placedObjects + npcs + zones + spawnPoint + ambientAudio) contracts. `exportRoomPackage.ts`: async fflate ZIP builder — collects all unique assetIds from placed objects + NPC meshes + anim packs + ambient audio, resolves each from Dexie, writes `manifest.json` + `scene.json` + `assets/<assetId>.<ext>`, triggers browser download. `buildRoomPackageScene()` in `SceneEditorExporter.ts`: pure sync mapping from editor state → `RoomPackageScene`. "Export Room" button in `SceneEditorView.vue` save toolbar: disabled until scene is saved (`currentSceneId !== null`), amber hover distinct from ZIP export (purple) and Copy TS (green). All types exported from `@base/ui` index. Why disabled-until-saved: ensures scene has a label and the user has an intentional authoring checkpoint before packaging; ZIP export (no label requirement) is kept separate for raw asset bundles. Consumption path: `/room` drag-drop in S3 (not manual unpack — full in-memory unzip → blob URL map → scene boot from single dropped file).
- **2026-05-31** — **Procedural GLB generator pattern + Dexie seed dev-tool.** `src/utils/roomMeshGen.ts` codifies conventions: (1) Origin at anchor surface (floor top, wall bottom, ceiling bottom); (2) BoxGeometry for slabs not PlaneGeometry (0-thickness causes z-fighting + invisible backface); (3) ExtrudeGeometry for curved surfaces — profile in shape-XY, rotate axes after, translate baked position stays at origin; (4) Quadratic Bezier control = 2×peak for midpoint accuracy; (5) DoubleSide + depthWrite:false for transparent pieces. `src/utils/seedSpaceHome.ts` establishes Dexie seed pattern: always clear-before-reseed (tag-based `where('tags').anyOf()`), upload fresh assets, write scene row. Dev hooks via `window.__seedSpaceHome/clearSpaceHome` exposed in `main.ts` DEV guard — call once from console, reload editor, pick scene. Why: enables fast iteration on room design without UI-based asset import workflow.
- **2026-05-31** — **Room-from-image CV tooling scoped — two tracks.** Exploration confirmed `TOOLS/image-to-3d/` is greenfield (no server, no depth code, no Open3D). Track A: Depth Anything v2 Small (CPU, ~8s) → Open3D point cloud → RANSAC plane fitting → trimesh GLBs — good for real photos, outputs flat planes only (curves → planar approximation). Track B: OpenCV LSD line detection → 3-VP Manhattan world → camera + room cuboid → trimesh GLB — better for rendered/architectural images (geometrically perfect perspective), ~half dev-day. Both deferred to a dedicated image-to-3d session after Phase 5 S1.

- **2026-05-30** — **Animation retargeting + procedural variation assessed — Phase 5 S3+S6.** Planning session. Retargeting already fully solved: `retargetMixamoClipsToCharacter()` in `@base/player-three` covers three tiers — same Mixamo rig (direct play, no retarget needed), same rig different prefix (`remapClipTracksToTargetSkeleton`), different hierarchy (`SkeletonUtils.retargetClip` — proportion-aware). For the room's same-rig NPCs: zero new work. New piece: `perturbClip(clip, { rng, maxAngleDeg, transitionErrorPercent })` — ~70 lines pure math, zero deps. Seeded per-NPC via `mulberry32(hashCode(entityId))` — deterministic, no author configuration needed, each NPC always gets same variation. Quaternion noise: random axis + angle within ±maxAngleDeg, premultiplied per keyframe. Transition arc: mid-keyframe inserted between original keys, deflected by errorPercent — creates organic motion paths instead of mechanical slerp. Applied at runtime in `RoomPlayerModule` (S3), not export-time — package stays minimal (1 clip, not N). Data contract: `EditorNpcEntry.animationVariationDegrees?`, `animationVariationTimingPercent?`, `animationVariationSeed?`. S6: inspector slider + live preview in editor. Why runtime: package size scales O(1) not O(N NPCs); variation is deterministic so reproducible.
- **2026-05-30** — **Animation recording assessed — Phase 5 S5.** Planning session. Skeleton system is directly adoptable: `capturePose()` from pose editor IS the keyframe primitive (add timestamp → `RecordedFrame`). `QuaternionKeyframeTrack` + `AnimationClip` + `AnimationClip.optimize()` all in Three.js core. `GLTFExporter` confirmed in bundle — exports `AnimationClip[]` directly into GLB → uploaded as Dexie `animation-pack`. Two modes: stepped/authored (DCC-style: scrub → pose → K) and real-time sampling (record on tick → optimize after). One constraint: track naming format (`.bones[Name]` vs `Name.quaternion`) must match character's existing clips — detected at recorder construction via `clipsUseSkinnedMeshMixerRoot()`. `AnimationRecorder` class shape defined. Timeline UI ~200 lines Vue. Sequenced as S5 (after pose editor S4 — shared primitive). Existing `CharacterAnimationRig` clip resolution requires zero changes — named recorded clip slots in automatically.
- **2026-05-30** — **Pose Editor layer assessed — FK + CCDIKSolver (Phase 5 S4).** Planning session. Missing layer identified: editor operates at object granularity (whole GLB), not bone granularity. Cannot author seated/posed NPCs without custom animation packs today. Three options evaluated: (A) FK-only via bone list + TC rotation — 1 session, no deps, good for head/spine/fingers; (B) FK + CCDIKSolver — 2-3 sessions, zero new deps (CCDIKSolver confirmed in `three/examples/jsm/animation/CCDIKSolver.js`), handles limb placement by dragging IK target spheres; (C) `three-ik` FABRIK — external dep, marginal gain over CCD for static poses. **Option B recommended and adopted.** Data contract: `EditorNpcEntry.poseOverride?: Array<{ bone: string; q: [x,y,z,w] }>` — serializes into `scene.json` in RoomPackage. AnimationMixer conflict resolved via V1 strategy: apply pose before mixer initializes at scene load; V2 (post-mixer `bone.quaternion.copy()`) available as drop-in extension for runtime blending. `usePoseEditor` composable shape defined (attachToNpc / selectBone / setIkTarget / capturePose / applyPose / clearPose). Sequenced as Phase 5 S4 — requires room player (S3) to exist first. Why: the room player is the runtime that must apply saved poses; building the pose tool before its consumer exists inverts the dependency.
- **2026-05-30** — **Room Package pipeline scoped (Phase 5, J-1 close).** Planning session. Full 6-layer pipeline inventory (Creation → Asset → Scene → Runtime → Content → Distribution) identified J-1 (editor→player) as the largest strategic gap: editor produces TS, player consumes hardcoded descriptors — no round-trip without developer intervention. Locked `RoomPackage` contract: `manifest.json` (version/packageId/exportedAt/sceneLabel) + `scene.json` (placedObjects + npcs + zones + spawnPoint + ambientAudioAssetId/Volume) + `assets/<assetId>.<ext>`. Dexie v3 required: `SceneRow.config?: SceneEditorConfig` so dynamically-added NPCs survive save/load (currently only placed objects persist to Dexie — NPCs are in-memory only). `floorGlbUrl` excluded from V1 package; rooms use placed environment GLBs. T-D8 audio reframed: not three-dreams polish but interactional room ambient layer using the already-built `MusicLayer.play(buffer)`. New deliverable type: "interactional room" — authored in editor, packaged as ZIP, loaded by `/room` player shell. Why: closes the gap between "developer prototype" and "non-developer authoring pipeline."
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
