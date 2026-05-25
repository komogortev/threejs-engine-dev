<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ThreeModule } from '@base/threejs-engine'
import { DEFAULT_BINDINGS, InputModule, mergeBindings } from '@base/input'
import { useInputSettings } from '@/composables/useInputSettings'
import { SandboxSceneModule } from '@/modules/SandboxSceneModule'
import { sandboxScene } from '@/scenes/sandbox'
import { useShellContext } from '@/composables/useShellContext'
import { assetDb, type SceneRow, type SandboxSceneSave } from '@base/ui'

const router  = useRouter()
const context = useShellContext()
const container = ref<HTMLElement>()

const { loadActive } = useInputSettings()
const engine      = new ThreeModule()
const inputModule = new InputModule(
  mergeBindings(loadActive(), {
    keyboard: { toggle_camera: ['Tab'] },
    gamepad: { toggle_camera: [8] },
  } as Parameters<typeof mergeBindings>[1]),
  { enablePointerLook: true },
)
const sceneModule = new SandboxSceneModule({
  descriptor: sandboxScene,
  cameraPreset: 'close-follow',
})

// ── Scene picker state ───────────────────────────────────────────────────────
const scenes = ref<SceneRow[]>([])
const selectedSceneId = ref<string | null>(null)
const showPicker = computed(() => selectedSceneId.value === null)

async function loadScenesList(): Promise<void> {
  scenes.value = await assetDb.scenes.orderBy('savedAt').reverse().toArray()
}

async function deleteScene(id: string): Promise<void> {
  await assetDb.scenes.delete(id)
  scenes.value = scenes.value.filter(s => s.id !== id)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

/**
 * One-time migration: if the old single-slot localStorage save exists and no
 * Dexie scenes exist yet, import it as "Migrated Scene" and remove the key.
 */
async function migrateLocalStorage(): Promise<void> {
  const raw = localStorage.getItem('sandbox:scene')
  if (!raw) return
  try {
    const save = JSON.parse(raw) as SandboxSceneSave
    if (!save || save.version !== 1 || !Array.isArray(save.placedObjects)) return
    const count = await assetDb.scenes.count()
    if (count === 0) {
      await assetDb.scenes.add({
        id: `scene-${crypto.randomUUID().slice(0, 8)}`,
        name: save.name ?? 'Migrated Scene',
        savedAt: save.savedAt || new Date().toISOString(),
        placedObjects: save.placedObjects,
      })
      localStorage.removeItem('sandbox:scene')
    }
  } catch {
    // Migration failed — leave localStorage intact for manual recovery
  }
}

// ── Time control state ───────────────────────────────────────────────────────
const timeScale = ref(1.0)
const paused    = computed(() => timeScale.value === 0)

function setScale(s: number): void {
  timeScale.value = s
  sceneModule.setTimeScale(s)
}

function togglePause(): void {
  setScale(paused.value ? 1.0 : 0.0)
}

function stepFrame(): void {
  if (!paused.value) setScale(0)
  sceneModule.stepOneFrame()
}

// ── World ready / hint ───────────────────────────────────────────────────────
const worldReady = ref(false)
const showHint   = ref(true)
let hintTimer: ReturnType<typeof setTimeout>

// ── Keyboard ─────────────────────────────────────────────────────────────────
function onKeyDown(e: KeyboardEvent): void {
  if (!worldReady.value) return
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return

  switch (e.code) {
    case 'KeyP':
    case 'Pause':
      e.preventDefault()
      togglePause()
      break
    case 'KeyF':
      e.preventDefault()
      stepFrame()
      break
    case 'KeyR':
      if (paused.value) {
        e.preventDefault()
        setScale(1.0)
      }
      break
    case 'BracketLeft':
      e.preventDefault()
      setScale(Math.max(0.125, timeScale.value / 2))
      break
    case 'BracketRight':
      e.preventDefault()
      setScale(Math.min(4, timeScale.value * 2))
      break
  }
}

// ── Scene start / return ─────────────────────────────────────────────────────
async function returnToPicker(): Promise<void> {
  if (selectedSceneId.value !== null) {
    await engine.unmount()
    selectedSceneId.value = null
  }
  await loadScenesList()
}

async function startSandbox(sceneId: string): Promise<void> {
  if (!container.value) return
  selectedSceneId.value = sceneId
  worldReady.value = false
  await engine.mount(container.value, context)
  await engine.mountChild('input', inputModule)
  await engine.mountChild('scene', sceneModule)
  await sceneModule.loadPlacedObjects(sceneId)
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
  hintTimer = setTimeout(() => { showHint.value = false }, 5000)
}

onMounted(async () => {
  await migrateLocalStorage()
  await loadScenesList()
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(async () => {
  window.removeEventListener('keydown', onKeyDown)
  clearTimeout(hintTimer)
  if (selectedSceneId.value !== null) {
    await engine.unmount()
  }
})
</script>

<template>
  <div class="relative w-screen h-screen bg-black overflow-hidden">

    <!-- Three.js canvas -->
    <div
      ref="container"
      class="absolute inset-0 outline-none transition-opacity duration-200"
      :class="worldReady ? 'opacity-100' : 'opacity-0 pointer-events-none'"
      tabindex="0"
    />

    <!-- Loading veil (shown while engine mounts after scene pick) -->
    <div
      v-if="!showPicker && !worldReady"
      class="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black text-white/45 text-sm"
      aria-busy="true" aria-live="polite"
    >
      <span class="inline-block size-8 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
      <span>Building sandbox…</span>
    </div>

    <!-- Scene picker overlay -->
    <div
      v-if="showPicker"
      class="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90"
    >
      <!-- Back button -->
      <div class="absolute top-4 left-4">
        <button class="picker-nav-btn" @click="router.push('/')">← Menu</button>
      </div>

      <div class="picker-panel">
        <h2 class="picker-title">Load Scene</h2>

        <!-- Empty state -->
        <div v-if="scenes.length === 0" class="picker-empty">
          <p class="picker-empty-text">No saved scenes yet.</p>
          <button class="picker-empty-btn" @click="router.push('/scene-editor')">
            Open Editor →
          </button>
        </div>

        <!-- Scene list -->
        <div v-else class="picker-list">
          <div
            v-for="scene in scenes"
            :key="scene.id"
            class="picker-item"
            @click="startSandbox(scene.id)"
          >
            <div class="picker-item-info">
              <span class="picker-item-name">{{ scene.name }}</span>
              <span class="picker-item-meta">
                {{ scene.placedObjects.length }} object{{ scene.placedObjects.length !== 1 ? 's' : '' }}
                · {{ formatDate(scene.savedAt) }}
              </span>
            </div>
            <button
              class="picker-item-delete"
              title="Delete scene"
              @click.stop="deleteScene(scene.id)"
            >×</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Back button (in-sandbox) -->
    <div v-if="!showPicker" class="absolute top-4 left-4 z-40 flex gap-2">
      <button
        class="flex items-center gap-2 px-4 py-2 bg-black/40 hover:bg-black/60 text-white/70 hover:text-white text-xs font-medium rounded-lg backdrop-blur-sm border border-white/10 transition-all"
        @click="router.push('/')"
      >
        ← Menu
      </button>
      <button
        class="flex items-center gap-2 px-4 py-2 bg-black/40 hover:bg-black/60 text-white/70 hover:text-white text-xs font-medium rounded-lg backdrop-blur-sm border border-white/10 transition-all"
        @click="returnToPicker()"
      >
        ⊞ Scenes
      </button>
    </div>

    <!-- Time control HUD (top-right) -->
    <div
      v-if="worldReady"
      class="absolute top-4 right-4 z-40 flex flex-col gap-1.5 items-end"
    >
      <!-- Status pill -->
      <div
        class="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold tracking-wider"
        :class="paused
          ? 'bg-amber-950/70 border-amber-500/40 text-amber-300'
          : 'bg-black/50 border-white/10 text-white/60'"
      >
        <span
          class="inline-block size-2 rounded-full"
          :class="paused ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'"
        />
        {{ paused ? 'PAUSED' : `×${timeScale.toFixed(timeScale % 1 === 0 ? 0 : 2)}` }}
      </div>

      <!-- Time buttons -->
      <div class="flex gap-1">
        <button
          class="px-2 py-1 text-[10px] font-mono rounded bg-black/50 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-all"
          title="[[] Slow motion"
          @click="setScale(Math.max(0.125, timeScale / 2))"
        >½×</button>
        <button
          class="px-2 py-1 text-[10px] font-mono rounded border transition-all"
          :class="paused
            ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
            : 'bg-black/50 border-white/10 text-white/50 hover:text-white hover:bg-white/10'"
          title="[P] Pause / resume"
          @click="togglePause"
        >{{ paused ? '▶' : '⏸' }}</button>
        <button
          class="px-2 py-1 text-[10px] font-mono rounded bg-black/50 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-all"
          title="[F] Step one frame (auto-pauses)"
          @click="stepFrame"
        >⏭</button>
        <button
          class="px-2 py-1 text-[10px] font-mono rounded bg-black/50 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-all"
          title="[]] Speed up"
          @click="setScale(Math.min(4, timeScale * 2))"
        >2×</button>
      </div>
    </div>

    <!-- WASD + time-control hint -->
    <Transition
      enter-active-class="transition-opacity duration-500"
      leave-active-class="transition-opacity duration-700"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showHint && worldReady"
        class="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none"
      >
        <div class="flex flex-col items-center gap-1">
          <div class="flex justify-center"><kbd class="key">W</kbd></div>
          <div class="flex gap-1"><kbd class="key">A</kbd><kbd class="key">S</kbd><kbd class="key">D</kbd></div>
        </div>
        <p class="text-white/30 text-[11px] tracking-widest uppercase text-center">
          move · Shift sprint · Space jump
        </p>
        <p class="text-white/20 text-[10px] tracking-wider text-center">
          Tab third / first / free-float · Time: P pause · F step frame · R resume · [ ] slow / fast
        </p>
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

/* ── Scene picker ─────────────────────────────────────────────────────────── */
.picker-nav-btn {
  padding: 6px 14px;
  background: rgba(0,0,0,0.5);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  color: rgba(255,255,255,0.6);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}
.picker-nav-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }

.picker-panel {
  background: rgba(10, 15, 25, 0.95);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 28px 32px;
  min-width: 380px;
  max-width: 520px;
  width: 90vw;
}

.picker-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.35);
  margin: 0 0 20px;
}

.picker-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 24px 0;
}
.picker-empty-text {
  color: rgba(255,255,255,0.3);
  font-size: 13px;
}
.picker-empty-btn {
  padding: 8px 20px;
  background: rgba(20, 60, 100, 0.6);
  border: 1px solid rgba(90,176,245,0.25);
  border-radius: 6px;
  color: #7ab0d8;
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.picker-empty-btn:hover { color: #c8e0f0; border-color: rgba(90,176,245,0.5); }

.picker-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 400px;
  overflow-y: auto;
}

.picker-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.picker-item:hover {
  background: rgba(90,176,245,0.06);
  border-color: rgba(90,176,245,0.2);
}

.picker-item-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.picker-item-name {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255,255,255,0.8);
}
.picker-item-meta {
  font-size: 10px;
  color: rgba(255,255,255,0.3);
  font-family: ui-monospace, monospace;
}

.picker-item-delete {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: rgba(255,255,255,0.2);
  font-size: 14px;
  cursor: pointer;
  flex-shrink: 0;
  transition: color 0.12s, border-color 0.12s, background 0.12s;
}
.picker-item-delete:hover {
  color: #f87171;
  border-color: rgba(248,113,113,0.3);
  background: rgba(248,113,113,0.08);
}
</style>
