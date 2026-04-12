import type { SceneEditorConfig } from '@base/ui'

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

export function getEditorConfig(sceneId: string): SceneEditorConfig {
  return EDITOR_CONFIGS[sceneId] ?? { npcs: [], zones: [] }
}
