<!--
  WaypointEditorPage — scene-01 waypoint authoring tool.

  Loads the scene-01 floor as a raycast surface. Click the road to place
  navigation waypoints; "Copy TypeScript" emits a ready-to-paste array for
  three-dreams/src/scenes/scene-01/navPath.ts.

  Persisted to localStorage under "waypoints:scene-01" across refreshes.
  Accessible in dev and production builds (no guard) since this harness
  is never deployed as a player-facing app.

  Assets served from three-dreams/public via the gamePublicFallback vite plugin.
-->
<template>
  <div class="page-wrap">
    <WaypointEditorView
      floor-glb-url="/scenes/scene-01/house_on_the_hill_mesh_ground.glb"
      :context-glb-urls="['/scenes/scene-01/house_on_the_hill_4k.glb']"
      storage-key="waypoints:scene-01"
      export-name="ROAD_WAYPOINTS"
    />

    <button class="back-btn" @click="router.push('/')">← Back</button>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { WaypointEditorView } from '@base/ui'

const router = useRouter()
</script>

<style scoped>
.page-wrap {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

.back-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 10;
  background: rgba(0, 0, 0, 0.65);
  color: #888;
  border: 1px solid #333;
  font-family: monospace;
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: color 0.1s;
}
.back-btn:hover { color: #ccc; }
</style>
