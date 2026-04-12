# Critical Path Implementation Plans

Three sequential targets to close Phase 3d and unblock three-dreams Phase 4C.

---

## Target 1 — Scene Editor Harmonization

**Goal:** Replace the hardcoded single-scene `config`+`sceneLabel` API in `threejs-engine-dev/src/views/SceneEditorPage.vue` with the `scenes` array pattern used by three-dreams.

**Current state:** The harness page passes `config` (computed) and `scene-label` (string) directly to `SceneEditorView`. It hardcodes scene-01 NPC entries, zone entries, floor GLB URL, context GLBs, spawn point, and storage key prefix. There is no scene registry, no sandbox entry, and no scene switcher.

**Target state:** The harness page builds a `SceneEditorEntry[]` from a harness-local scene registry, prepends a sandbox entry, and passes via the `scenes` prop — identical pattern to `three-dreams/src/views/SceneEditorPage.vue`.

### Files to create

#### 1. `src/scenes/editor/types.ts`
```ts
export interface HarnessSceneEntry {
  id: string
  label: string
}
```

#### 2. `src/scenes/editor/registry.ts`
Harness scene registry for the editor. Currently only scene-01.
```ts
import type { HarnessSceneEntry } from './types'

export const HARNESS_EDITOR_SCENES: HarnessSceneEntry[] = [
  { id: 'scene-01', label: 'Scene 01 — House on the Hill' },
]
```

#### 3. `src/scenes/editor/configs.ts`
Maps each registry entry to a full `SceneEditorConfig`. This is where the NPC entries, zones, spawn points, floor GLB URLs, and context GLBs live — moved from the current `SceneEditorPage.vue`.
```ts
import type { SceneEditorConfig } from '@base/ui'

export function getEditorConfig(sceneId: string): SceneEditorConfig {
  return EDITOR_CONFIGS[sceneId] ?? { npcs: [], zones: [] }
}

const EDITOR_CONFIGS: Record<string, SceneEditorConfig> = {
  'scene-01': {
    floorGlbUrl: '/scenes/scene-01/house_on_the_hill_mesh_ground.glb',
    contextGlbUrls: ['/scenes/scene-01/house_on_the_hill_4k.glb'],
    storageKeyPrefix: 'scene-editor:scene-01',
    exportNamePrefix: 'SCENE_01',
    npcs: [
      {
        entityId: 'npc-dad-scene-01',
        label: 'Dad (60y)',
        x: -18, z: -14, y: 0,
        proximityRadius: 4,
      },
    ],
    zones: [
      {
        id: 'exit-hilltop',
        type: 'exit',
        label: 'Hilltop Exit → scene-02',
        x: 5, z: -36, radius: 3,
        targetSceneId: 'scene-02',
        color: 0xffdd44,
      },
    ],
    spawnPoint: { x: -52, z: 9 },
  },
}
```

### Files to modify

#### 4. `src/views/SceneEditorPage.vue`
Rewrite to mirror three-dreams pattern:
- Import `HARNESS_EDITOR_SCENES` from `src/scenes/editor/registry`
- Import `getEditorConfig` from `src/scenes/editor/configs`
- Build sandbox entry (no floor GLB, empty npcs/zones)
- Map registry entries to `SceneEditorEntry[]` using `getEditorConfig`
- Pass `scenes` prop to `SceneEditorView` instead of `config`+`scene-label`
- Keep the `← Back` button and page styles

```vue
<template>
  <div class="page">
    <SceneEditorView :scenes="sceneEntries" />
    <button class="back-btn" @click="router.push('/')">← Back</button>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { SceneEditorView } from '@base/ui'
import type { SceneEditorEntry } from '@base/ui'
import { HARNESS_EDITOR_SCENES } from '@/scenes/editor/registry'
import { getEditorConfig } from '@/scenes/editor/configs'

const router = useRouter()

const sandboxEntry: SceneEditorEntry = {
  id: '__sandbox__',
  label: 'Sandbox',
  config: { npcs: [], zones: [] },
}

const registryEntries: SceneEditorEntry[] = HARNESS_EDITOR_SCENES.map((s) => ({
  id: s.id,
  label: s.label,
  config: getEditorConfig(s.id),
}))

const sceneEntries: SceneEditorEntry[] = [sandboxEntry, ...registryEntries]
</script>
```

### Verification

1. `pnpm dev` in harness — navigate to `/#/scene-editor`
2. Confirm scene switcher dropdown shows "Sandbox" + "Scene 01 — House on the Hill"
3. Switching to scene-01 loads the floor GLB, context GLBs, NPC markers, zone rings, spawn point
4. Switching to sandbox shows invisible floor (flat plane), no NPCs/zones
5. Waypoint editor storage keys still scoped correctly per scene

### Effort: ~1 session, 3 new files + 1 modified file

---

## Target 2 — Camera Architecture Review

**Goal:** Document the current camera system, verify it covers the editor + gameplay requirements, and produce a clear sign-off checklist for Phase 3d.

**Current state:** The camera system is already implemented and working across three contexts:

1. **Gameplay** (`@base/camera-three` + `@base/gameplay`):
   - `GameplayCameraController` — drives `PerspectiveCamera` in `third-person` or `first-person` mode
   - 4 named third-person presets: `close-follow`, `shoulder`, `high`, `tactical`
   - First-person: eye offset, crouch drop, pull-back config
   - `PlayerCameraCoordinator` — coordinates input routing, player tick, and camera update
   - Tab key toggles camera mode; `[`/`]` cycles third-person presets
   - `EV_GAMEPLAY_CAMERA_MODE` event emitted on mode change

2. **Editor play-sim** (`EditorSceneModule`):
   - `setPlaySimulation(on)` — enters walk-the-scene mode with `GameplayCameraController`
   - `togglePlayCameraMode()` — B key toggles FPV/TPV in editor walk mode
   - `cyclePlayCameraPreset(delta)` — `[`/`]` cycles presets during editor walk
   - Editor orbit (`OrbitControls`) disabled during play-sim, re-enabled on exit

3. **Editor orbit** (`EditorSceneModule`):
   - `OrbitControls` for free camera in edit mode
   - Session avatar with orbit-follow locomotion (WASD moves avatar, orbit pivot follows)
   - Orbit bookmarks for saved camera positions

**What "camera strategy switching" means in Phase 3d context:**
The original milestone description said "allow a level author to walk the scene as the player character under third-person and first-person camera strategies simultaneously." This is already implemented via `togglePlayCameraMode()` (B key) and `cyclePlayCameraPreset()` (`[`/`]`). The editor already switches between orbit (edit mode) and gameplay camera (walk mode) via `setPlaySimulation()`.

### Deliverables

#### 1. Camera architecture decision record
Append to `threejs-engine-dev/STATE.md` Decision Log:
```
- **2026-04-XX** — Camera architecture reviewed for Phase 3d sign-off. Three camera
  contexts documented: gameplay (GameplayCameraController via PlayerCameraCoordinator),
  editor play-sim (same controller, toggled via setPlaySimulation), editor orbit
  (OrbitControls with avatar follow). Strategy switching (TPV↔FPV) works in both
  gameplay and editor play-sim. No missing capabilities identified for Phase 4C
  cinematic camera — that system will layer on top (camera rails, scripted sequences,
  blend transitions) without modifying the existing gameplay camera stack.
```

#### 2. Camera architecture doc
Create `SHARED/packages/camera-three/ARCHITECTURE.md`:
- Package structure (6 source files)
- `GameplayCameraController` — modes, presets, update loop, snap API
- `computeThirdPersonCamera` — the math behind third-person rig positioning
- `ThirdPersonViewCam` — the 4-parameter rig (distance, height, lateral, pivotY)
- `FirstPersonViewConfig` — eye offset, crouch drop, pull-back
- Integration with `PlayerCameraCoordinator` from `@base/gameplay`
- How the editor uses the same controller in play-sim mode

#### 3. Phase 4C readiness assessment
Document in the architecture doc what three-dreams Phase 4C (cinematic camera) will need:
- **Camera rails**: New mode type that interpolates camera position along a spline. Does NOT modify existing modes — adds alongside them.
- **Scripted sequences**: Transition API that blends from current gameplay camera to a rail camera and back. Needs a `CameraTransitionManager` (new class) that lerps between two camera states over a duration.
- **Blend between modes**: The existing `snapToCharacter` is instant. Phase 4C needs a `blendToMode(targetMode, duration)` that smoothly interpolates position+rotation over time.
- **None of these require changes to the existing `GameplayCameraController` API** — they layer on top.

#### 4. Review checklist verification
Walk through each item:
- [ ] Gameplay camera works in harness (sandbox, scene-01)
- [ ] Gameplay camera works in three-dreams (all scenes)
- [ ] Editor play-sim camera works (enter/exit, TPV/FPV toggle, preset cycling)
- [ ] Editor orbit camera works (orbit, zoom, pan, avatar follow)
- [ ] Camera mode event (`EV_GAMEPLAY_CAMERA_MODE`) fires correctly
- [ ] First-person pitch respects limits
- [ ] Third-person presets produce correct framing
- [ ] No game-specific logic in `@base/camera-three` or `@base/gameplay`

### Effort: ~1 session, mostly documentation + manual verification

---

## Target 3 — Phase 3d Sign-off

**Goal:** Formal gate review confirming all Phase 3d requirements are met, unblocking three-dreams Phase 4C.

**Prerequisites:** Targets 1 and 2 must be complete.

### Sign-off checklist

1. **Scene editor harmonization** (Target 1)
   - [ ] Harness uses `scenes` prop pattern (not hardcoded config)
   - [ ] Harness has scene registry + config map
   - [ ] Sandbox entry works
   - [ ] Scene-01 entry works with full config (NPCs, zones, spawn, context GLBs)
   - [ ] Both harness and three-dreams scene editor pages follow the same pattern

2. **Camera architecture** (Target 2)
   - [ ] Architecture documented in `@base/camera-three/ARCHITECTURE.md`
   - [ ] All camera contexts verified working (gameplay, editor play-sim, editor orbit)
   - [ ] Phase 4C readiness assessed — no blocking gaps in existing API
   - [ ] Decision logged in STATE.md

3. **Gameplay harmonization** (completed in Phases 1-4)
   - [ ] `PlayerCameraCoordinator` in `@base/gameplay` used by both projects
   - [ ] Input settings page working in both projects
   - [ ] `SceneGameplayPolicy` interface shared via `@base/scene-builder`

4. **Package API stability**
   - [ ] No pending breaking changes to `@base/camera-three` exports
   - [ ] No pending breaking changes to `@base/gameplay` exports
   - [ ] No pending breaking changes to `@base/ui` editor exports
   - [ ] `pnpm build` succeeds for all SHARED packages

### Deliverables

#### 1. Update `threejs-engine-dev/PROJECT.md`
- Mark Phase 3d as complete
- Add Phase 3d completion date
- Note that three-dreams Phase 4C is now unblocked

#### 2. Update `threejs-engine-dev/STATE.md`
- Move from "Phase 3d" to maintenance/support mode
- Clear the "Next Session" section of Phase 3d tasks
- Update SNAPSHOT line

#### 3. Update `three-dreams/STATE.md`
- Remove "BLOCKED" from Phase 4C
- Update blocker section
- Add Phase 4C to active work / next session

#### 4. Update `three-dreams/PROJECT.md`
- Move Phase 4C from "Blocked" to active planning
- Update harmonized plan tables

#### 5. Update memory files
- `MEMORY.md` — remove blocking note or update to "unblocked"
- `project_scene_editor.md` — mark harmonization complete
- `CLAUDE.md` — update cross-project rule (Phase 4C no longer blocked)

### Effort: ~30 minutes, documentation updates after verification pass
