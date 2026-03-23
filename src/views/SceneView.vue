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
// The terrain is driven entirely by the painted heightmap.
// Mid-grey (128) = sea level baseline.
// White  = +amplitude (hills/ridges).
// Black  = −amplitude (depressions, lake floors).
//
// Additional procedural features can stack on top if needed.
//
const descriptor: SceneDescriptor = {
  terrain: {
    radius:      50,
    resolution:  180,      // higher res = sharper detail from the image
    seaLevel:    0,
    baseColor:   0x1c2e1a,
    waterColor:  0x0a1c38,
    waterOpacity: 0.76,
    features: [
      {
        type:      'heightmap',
        url:       '/terrains/heatmap-scene-1.png',
        amplitude: 10,       // white pixel = +10 world units, black = -10
        // worldWidth/worldDepth default to terrain diameter (100 units)
        // offsetX/offsetZ default to 0 (image centred on world origin)
      },
    ],
  },

  atmosphere: {
    fogColor:         0x06100a,
    fogDensity:       0.013,
    ambientColor:     0x1e3320,
    ambientIntensity: 0.8,
    lights: [
      // Key: warm afternoon sun, front-right
      { type: 'directional', color: 0xfff0cc, intensity: 1.3, position: [6, 14, 7]    },
      // Rim: cool deep-blue from behind-left
      { type: 'directional', color: 0x0a1e5a, intensity: 0.8, position: [-8, 4, -10] },
    ],
  },

  character: {
    startPosition: [0, 0],   // world centre — Y auto-snapped to terrain
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
