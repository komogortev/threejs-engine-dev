<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ThreeModule } from '@base/threejs-engine'
import { SpinningCubeModule } from '@/modules/SpinningCubeModule'
import { useShellContext } from '@/composables/useShellContext'
import { useShellStore } from '@/stores/shell'

const router = useRouter()
const context = useShellContext()
const shell = useShellStore()

const container = ref<HTMLElement>()
const engine = new ThreeModule()
const cubeModule = new SpinningCubeModule()

onMounted(async () => {
  if (!container.value) return

  shell.setActiveModule(engine.id)

  // Mount the engine into the container
  await engine.mount(container.value, context)

  // Mount SpinningCubeModule as a child — it receives ThreeContext
  await engine.mountChild('spinning-cube', cubeModule)
})

onUnmounted(async () => {
  // unmount() cascades to all children and disposes GPU resources
  await engine.unmount()
  shell.setActiveModule(null)
})
</script>

<template>
  <div class="relative w-screen h-screen bg-black overflow-hidden">
    <div ref="container" class="absolute inset-0" />

    <div class="absolute top-4 left-4 flex items-center gap-3">
      <button
        class="flex items-center gap-2 px-4 py-2 bg-black/50 hover:bg-black/70 text-white text-xs font-medium rounded-lg backdrop-blur-sm border border-white/10 transition-colors"
        @click="router.push('/')"
      >
        ← Menu
      </button>
      <span class="px-3 py-1.5 bg-indigo-600/70 text-indigo-100 text-xs font-mono rounded-lg backdrop-blur-sm">
        threejs-engine-dev
      </span>
    </div>
  </div>
</template>
