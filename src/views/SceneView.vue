<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ThreeModule } from '@base/threejs-engine'
import { InputModule } from '@base/input'
import {
  THIRD_PERSON_CAMERA_PRESET_ORDER,
  type GameplayCameraMode,
  type ThirdPersonCameraPreset,
} from '@base/camera-three'
import { ThirdPersonSceneModule } from '@/modules/ThirdPersonSceneModule'
import { scene01 } from '@/scenes/scene-01'
import { useShellContext } from '@/composables/useShellContext'

const router = useRouter()
const context = useShellContext()
const container = ref<HTMLElement>()

const engine      = new ThreeModule()
const inputModule = new InputModule()
const sceneModule = new ThirdPersonSceneModule({
  descriptor: scene01,
  cameraPreset: 'close-follow',
})

const cameraPresetLabel = ref<ThirdPersonCameraPreset>(sceneModule.getCameraPreset())
const cameraModeLabel = ref<GameplayCameraMode>(sceneModule.getCameraMode())

let presetIndex = Math.max(0, THIRD_PERSON_CAMERA_PRESET_ORDER.indexOf(cameraPresetLabel.value))

function cycleCamera(delta: number): void {
  if (sceneModule.getCameraMode() !== 'third-person') return
  presetIndex = (presetIndex + delta + THIRD_PERSON_CAMERA_PRESET_ORDER.length) % THIRD_PERSON_CAMERA_PRESET_ORDER.length
  const p = THIRD_PERSON_CAMERA_PRESET_ORDER[presetIndex]!
  sceneModule.setCameraPreset(p)
  cameraPresetLabel.value = p
}

function toggleCameraMode(): void {
  const next: GameplayCameraMode =
    sceneModule.getCameraMode() === 'third-person' ? 'first-person' : 'third-person'
  sceneModule.setCameraMode(next)
  cameraModeLabel.value = next
  if (next === 'third-person') {
    presetIndex = Math.max(0, THIRD_PERSON_CAMERA_PRESET_ORDER.indexOf(sceneModule.getCameraPreset()))
    cameraPresetLabel.value = sceneModule.getCameraPreset()
  }
}

function onWindowKeyDown(e: KeyboardEvent): void {
  if (e.code === 'Tab') {
    e.preventDefault()
    toggleCameraMode()
    return
  }
  if (e.code === 'BracketRight') {
    e.preventDefault()
    cycleCamera(1)
  } else if (e.code === 'BracketLeft') {
    e.preventDefault()
    cycleCamera(-1)
  }
}

/** Hide the WASD hint on first movement or after 4 s. */
const showHint = ref(true)
let hintTimer: ReturnType<typeof setTimeout>

/** Hide WebGL + UI flash while Three.js default camera (0,0,0) runs before the scene module finishes async build. */
const worldReady = ref(false)

onMounted(async () => {
  if (!container.value) return

  worldReady.value = false
  await engine.mount(container.value, context)
  await engine.mountChild('input', inputModule)
  await engine.mountChild('scene', sceneModule)
  worldReady.value = true

  container.value.focus()

  const offAxis = context.eventBus.on('input:axis', (raw) => {
    const e = raw as { axis: string; value: { x: number; y: number } }
    if (e.axis === 'move' && (Math.abs(e.value.x) > 0.1 || Math.abs(e.value.y) > 0.1)) {
      clearTimeout(hintTimer)
      showHint.value = false
      offAxis()
    }
  })

  hintTimer = setTimeout(() => { showHint.value = false }, 4000)

  window.addEventListener('keydown', onWindowKeyDown)
})

onUnmounted(async () => {
  window.removeEventListener('keydown', onWindowKeyDown)
  clearTimeout(hintTimer)
  await engine.unmount()
})
</script>

<template>
  <div class="relative w-screen h-screen bg-black overflow-hidden">
    <div
      ref="container"
      class="absolute inset-0 outline-none transition-opacity duration-200"
      :class="worldReady ? 'opacity-100' : 'opacity-0 pointer-events-none'"
      tabindex="0"
    />

    <div
      v-if="!worldReady"
      class="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black text-white/45 text-sm"
      aria-busy="true"
      aria-live="polite"
    >
      <span class="inline-block size-8 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
      <span>Loading world…</span>
    </div>

    <!-- Back button (above loading veil) -->
    <div class="absolute top-4 left-4 z-40">
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
        <p class="text-white/30 text-[11px] tracking-widest uppercase text-center">
          move · Shift sprint · Ctrl crouch · Space jump (buffer)
        </p>
        <p class="text-white/20 text-[10px] tracking-wider text-center">
          Tab third / first person · [ ] cycle rig (third person)
        </p>
      </div>
    </Transition>

    <!-- Camera mode + preset -->
    <div
      class="absolute bottom-4 right-4 px-2 py-1 rounded-md bg-black/50 border border-white/10 text-[10px] font-mono text-white/50 uppercase tracking-wide max-w-[min(100vw-2rem,20rem)] text-right leading-relaxed"
    >
      <div>mode: {{ cameraModeLabel === 'first-person' ? '1p' : '3p' }}</div>
      <div v-if="cameraModeLabel === 'third-person'">rig: {{ cameraPresetLabel }}</div>
    </div>
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
