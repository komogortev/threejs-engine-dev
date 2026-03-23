<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ThreeModule } from '@base/threejs-engine'
import { InputModule } from '@base/input'
import { ThirdPersonSceneModule } from '@/modules/ThirdPersonSceneModule'
import type { SceneDescriptor } from '@/scene/SceneDescriptor'
import { useShellContext } from '@/composables/useShellContext'

const router = useRouter()
const context = useShellContext()
const container = ref<HTMLElement>()

// ─── Scene authoring ─────────────────────────────────────────────────────────
//
// This is the entire scene definition. Swap values, add features, change
// atmosphere — the engine rebuilds on next mount.
//
const descriptor: SceneDescriptor = {
  terrain: {
    radius: 50,
    resolution: 160,
    seaLevel: 0,
    baseColor: 0x1c2e1a,       // dark forest green
    waterColor: 0x0a1e3a,
    waterOpacity: 0.74,
    features: [
      // Two hills — upper area
      { type: 'hill', x: 18,  z: -14, radius: 14, height: 7   },
      { type: 'hill', x: -10, z:  20, radius: 9,  height: 3.5 },
      // Lake — lower-left quarter
      { type: 'lake', x: -16, z: -10, radius: 11, depth: 2.2  },
      // River flowing from upper slope, across flat ground, into the lake
      // First two points are 2D → auto Y = terrain − 1.0 (surface river)
      // Last two points are 3D → explicit descending floor into the lake basin
      {
        type: 'river',
        path: [
          [12, -5],              // 2D: high ground near hill base
          [4,   2],              // 2D: mid-flat terrain
          [-6, -0.4, -3],        // 3D: begins descending toward lake
          [-12, -1.6, -8],       // 3D: enters lake basin at -1.6 world Y
        ],
        width: 3.5,
        depth: 1.0,
      },
    ],
  },

  atmosphere: {
    fogColor:         0x080d08,
    fogDensity:       0.013,
    ambientColor:     0x1e3320,
    ambientIntensity: 0.85,
    lights: [
      // Key: warm golden sun from front-right
      { type: 'directional', color: 0xfff0cc, intensity: 1.3, position: [6, 14, 7]    },
      // Rim: cool blue from behind-left (separates character from background)
      { type: 'directional', color: 0x1a3a7a, intensity: 0.7, position: [-8, 4, -10] },
    ],
  },

  character: {
    startPosition: [0, 0],   // centre of scene, Y auto-snapped to terrain
  },
}

const engine      = new ThreeModule()
const inputModule = new InputModule()
const sceneModule = new ThirdPersonSceneModule({ descriptor })

/** Hide the WASD hint on first movement or after 4 s. */
const showHint = ref(true)
let hintTimer: ReturnType<typeof setTimeout>

onMounted(async () => {
  if (!container.value) return

  await engine.mount(container.value, context)
  await engine.mountChild('input', inputModule)
  await engine.mountChild('scene', sceneModule)

  const offAxis = context.eventBus.on('input:axis', (raw) => {
    const e = raw as { axis: string; value: { x: number; y: number } }
    if (e.axis === 'move' && (Math.abs(e.value.x) > 0.1 || Math.abs(e.value.y) > 0.1)) {
      clearTimeout(hintTimer)
      showHint.value = false
      offAxis()
    }
  })

  hintTimer = setTimeout(() => { showHint.value = false }, 4000)
})

onUnmounted(async () => {
  clearTimeout(hintTimer)
  await engine.unmount()
})
</script>

<template>
  <div class="relative w-screen h-screen bg-black overflow-hidden">
    <div ref="container" class="absolute inset-0" />

    <!-- Back button -->
    <div class="absolute top-4 left-4">
      <button
        class="flex items-center gap-2 px-4 py-2 bg-black/40 hover:bg-black/60 text-white/70 hover:text-white text-xs font-medium rounded-lg backdrop-blur-sm border border-white/10 transition-all"
        @click="router.push('/')"
      >
        ← Menu
      </button>
    </div>

    <!-- WASD hint -->
    <Transition
      enter-active-class="transition-opacity duration-500"
      leave-active-class="transition-opacity duration-700"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showHint"
        class="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none"
      >
        <div class="flex flex-col items-center gap-1">
          <div class="flex justify-center"><kbd class="key">W</kbd></div>
          <div class="flex gap-1">
            <kbd class="key">A</kbd><kbd class="key">S</kbd><kbd class="key">D</kbd>
          </div>
        </div>
        <p class="text-white/30 text-[11px] tracking-widest uppercase">move</p>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.key {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 6px;
  border: 1px solid rgb(255 255 255 / 0.2);
  background: rgb(255 255 255 / 0.06);
  backdrop-filter: blur(4px);
  color: rgb(255 255 255 / 0.5);
  font-size: 0.7rem;
  font-weight: 600;
  font-family: ui-monospace, monospace;
}
</style>
