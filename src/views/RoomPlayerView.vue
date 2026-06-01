<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ThreeModule } from '@base/threejs-engine'
import { InputModule, mergeBindings } from '@base/input'
import { loadRoomPackage, type LoadedRoomPackage } from '@base/ui'
import { useInputSettings } from '@/composables/useInputSettings'
import { useShellContext } from '@/composables/useShellContext'
import { RoomPlayerModule } from '@/modules/RoomPlayerModule'

const router   = useRouter()
const context  = useShellContext()
const container = ref<HTMLElement>()

const { loadActive } = useInputSettings()
const engine      = new ThreeModule()
const inputModule = new InputModule(
  mergeBindings(loadActive(), {
    keyboard: {
      toggle_camera: ['Tab'],
      crouch: ['KeyC', 'ControlLeft', 'ControlRight'],
    },
    gamepad: { toggle_camera: [8] },
  } as Parameters<typeof mergeBindings>[1]),
  { enablePointerLook: true },
)
const sceneModule = new RoomPlayerModule()

type ViewState = 'idle' | 'loading' | 'playing'
const viewState   = ref<ViewState>('idle')
const errorMsg    = ref('')
const sceneLabel  = ref('')
const isDragOver  = ref(false)

let currentPkg: LoadedRoomPackage | null = null

async function bootRoom(file: File): Promise<void> {
  if (viewState.value === 'loading') return
  viewState.value = 'loading'
  errorMsg.value  = ''
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const pkg = loadRoomPackage(bytes)
    currentPkg  = pkg
    sceneLabel.value = pkg.manifest.sceneLabel

    if (!container.value) throw new Error('Canvas container not ready')
    await engine.mount(container.value, context)
    await engine.mountChild('input', inputModule)
    await engine.mountChild('scene', sceneModule)
    await sceneModule.loadRoom(pkg)

    viewState.value = 'playing'
    container.value.focus()
  } catch (e) {
    viewState.value = 'idle'
    errorMsg.value  = e instanceof Error ? e.message : String(e)
    console.error('[RoomPlayerView] Boot failed:', e)
  }
}

async function exitRoom(): Promise<void> {
  if (viewState.value === 'playing') {
    await engine.unmount()
    currentPkg?.revoke()
    currentPkg = null
  }
  viewState.value = 'idle'
  sceneLabel.value = ''
}

// ── Drag-drop ─────────────────────────────────────────────────────────────────

function onDragOver(e: DragEvent): void {
  e.preventDefault()
  isDragOver.value = true
}

function onDragLeave(): void {
  isDragOver.value = false
}

function onDrop(e: DragEvent): void {
  e.preventDefault()
  isDragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) bootRoom(file)
}

function onFileInput(e: Event): void {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) bootRoom(file)
}

onUnmounted(async () => {
  if (viewState.value === 'playing') await engine.unmount()
  currentPkg?.revoke()
  currentPkg = null
})
</script>

<template>
  <div class="relative w-screen h-screen bg-black overflow-hidden">

    <!-- Three.js canvas -->
    <div
      ref="container"
      class="absolute inset-0 outline-none transition-opacity duration-300"
      :class="viewState === 'playing' ? 'opacity-100' : 'opacity-0 pointer-events-none'"
      tabindex="0"
    />

    <!-- In-room HUD -->
    <template v-if="viewState === 'playing'">
      <div class="absolute top-4 left-4 z-40 flex gap-2 items-center">
        <button
          class="flex items-center gap-2 px-4 py-2 bg-black/40 hover:bg-black/60 text-white/70 hover:text-white text-xs font-medium rounded-lg backdrop-blur-sm border border-white/10 transition-all"
          @click="exitRoom"
        >
          ← Load another
        </button>
        <span v-if="sceneLabel" class="text-white/35 text-xs font-medium tracking-wide px-1">
          {{ sceneLabel }}
        </span>
      </div>
      <div class="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none">
        <p class="text-white/20 text-[10px] tracking-widest uppercase text-center">
          WASD move · Mouse look · Tab camera · Shift sprint
        </p>
      </div>
    </template>

    <!-- Loading spinner -->
    <div
      v-else-if="viewState === 'loading'"
      class="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black text-white/45 text-sm"
      aria-busy="true"
    >
      <span class="inline-block size-8 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
      <span>Loading room…</span>
    </div>

    <!-- Drop zone -->
    <div
      v-else
      class="absolute inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <div class="absolute top-4 left-4">
        <button class="nav-btn" @click="router.push('/')">← Menu</button>
      </div>

      <div class="drop-panel" :class="isDragOver ? 'drop-panel--active' : ''">
        <!-- Upload icon -->
        <svg class="drop-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="6" y="10" width="36" height="28" rx="3" />
          <path d="M16 22l8-8 8 8M24 14v18" />
        </svg>

        <p class="drop-title">Drop a room package</p>
        <p class="drop-hint">.zip exported from the Editor</p>

        <label class="browse-btn">
          Browse file…
          <input type="file" accept=".zip" class="sr-only" @change="onFileInput" />
        </label>

        <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
      </div>
    </div>

  </div>
</template>

<style scoped>
.nav-btn {
  padding: 6px 14px;
  background: rgba(0,0,0,0.5);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  color: rgba(255,255,255,0.6);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}
.nav-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }

.drop-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 56px;
  border: 2px dashed rgba(255,255,255,0.1);
  border-radius: 16px;
  transition: border-color 0.15s, background 0.15s;
  max-width: 440px;
  width: 90vw;
}
.drop-panel--active {
  border-color: rgba(90,176,245,0.5);
  background: rgba(90,176,245,0.04);
}

.drop-icon {
  width: 48px;
  height: 48px;
  color: rgba(255,255,255,0.2);
  margin-bottom: 4px;
}

.drop-title {
  font-size: 15px;
  font-weight: 600;
  color: rgba(255,255,255,0.7);
  margin: 0;
}
.drop-hint {
  font-size: 11px;
  color: rgba(255,255,255,0.25);
  margin: 0 0 4px;
}

.browse-btn {
  padding: 8px 22px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 8px;
  color: rgba(255,255,255,0.6);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}
.browse-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }

.error-msg {
  font-size: 11px;
  color: #f87171;
  margin: 4px 0 0;
  text-align: center;
  max-width: 320px;
}
</style>
