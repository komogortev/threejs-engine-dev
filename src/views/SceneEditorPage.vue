<!--
  SceneEditorPage — threejs-engine-dev scene editor route.

  Maps scene-01's descriptor + gameplay policy to SceneEditorConfig
  and hands it to SceneEditorView from @base/ui.

  Assets are served from three-dreams/public via the gamePublicFallback
  Vite plugin (vite.config.ts). No game imports leak into @base/ui.
-->
<template>
  <div class="page">
    <SceneEditorView
      :config="editorConfig"
      :scene-label="sceneLabel"
    />
    <button class="back-btn" @click="router.push('/')">← Back</button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { SceneEditorView } from '@base/ui'
import type { SceneEditorConfig, EditorNpcEntry, EditorZoneEntry } from '@base/ui'

const router = useRouter()

// ─── Scene-01 mapping ─────────────────────────────────────────────────────────
//
// Hardcoded here — in three-dreams this would be driven by the scene registry.
// The harness is for authoring scene-01 nav paths; extend by adding a scene
// selector dropdown when more scenes need editing.

const sceneLabel = 'scene-01 — House on the Hill'

// NPC entries mirror scene-01/index.ts gameplay.npcEntries
const npcs: EditorNpcEntry[] = [
  {
    entityId: 'npc-dad-scene-01',
    label: 'Dad (60y)',
    x: -18,
    z: -14,
    y: 0,
    proximityRadius: 4,
  },
]

// Zone entries mirror scene-01/index.ts gameplay.exitZones
const zones: EditorZoneEntry[] = [
  {
    id: 'exit-hilltop',
    type: 'exit',
    label: 'Hilltop Exit → scene-02',
    x: 5,
    z: -36,
    radius: 3,
    targetSceneId: 'scene-02',
    color: 0xffdd44,
  },
]

const editorConfig = computed<SceneEditorConfig>(() => ({
  // Assets from three-dreams/public, served via gamePublicFallback plugin
  floorGlbUrl: '/scenes/scene-01/house_on_the_hill_mesh_ground.glb',
  contextGlbUrls: ['/scenes/scene-01/house_on_the_hill_4k.glb'],

  storageKeyPrefix: 'scene-editor:scene-01',
  exportNamePrefix: 'SCENE_01',

  npcs,
  zones,

  spawnPoint: { x: -52, z: 9 },
}))
</script>

<style scoped>
.page {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

.back-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 20;
  background: rgba(0, 0, 0, 0.65);
  color: #666;
  border: 1px solid #222;
  font-family: monospace;
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: color 0.1s;
}
.back-btn:hover { color: #bbb; }
</style>
