<!--
  SceneEditorPage — threejs-engine-dev scene editor route.

  Builds a SceneEditorEntry[] from the harness scene registry, prepends a
  sandbox entry, and passes via the `scenes` prop to SceneEditorView.
  Mirrors the pattern used by three-dreams/src/views/SceneEditorPage.vue.

  Assets are served from three-dreams/public via the gamePublicFallback
  Vite plugin (vite.config.ts). No game imports leak into @base/ui.
-->
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
  config: { storageKeyPrefix: 'scene-editor:sandbox', exportNamePrefix: 'SANDBOX', npcs: [], zones: [] },
}

const registryEntries: SceneEditorEntry[] = HARNESS_EDITOR_SCENES.map((s) => ({
  id: s.id,
  label: s.label,
  config: getEditorConfig(s.id),
}))

const sceneEntries: SceneEditorEntry[] = [sandboxEntry, ...registryEntries]
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
