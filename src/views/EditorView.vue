<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ThreeModule } from '@base/threejs-engine'
import { useShellContext } from '@/composables/useShellContext'
import { EditorSceneModule } from '@/editor/EditorSceneModule'
import type { EditorState, EditorTool, GizmoMode } from '@/editor/EditorSceneModule'
import type { PlacedObject, PrimitiveType } from '@/scene/SceneDescriptor'
import { copyObjectsToClipboard } from '@/editor/DescriptorExporter'
import { scene01 } from '@/scenes/scene-01'

// ─── Engine setup ─────────────────────────────────────────────────────────────

const router    = useRouter()
const context   = useShellContext()
const container = ref<HTMLElement>()

const engine = new ThreeModule()
const editor = new EditorSceneModule(scene01)

// ─── Reactive editor state (synced from module via callback) ──────────────────

const state = ref<EditorState>({
  objects:       [],
  selectedIndex: null,
  activeTool:    'select',
  gizmoMode:     'translate',
})

const selected = computed<PlacedObject | null>(() =>
  state.value.selectedIndex !== null
    ? state.value.objects[state.value.selectedIndex] ?? null
    : null,
)

// ─── Clipboard ────────────────────────────────────────────────────────────────

const copyLabel  = ref('Copy objects[]')
const copyTimeout = ref<ReturnType<typeof setTimeout>>()

async function copyObjects(): Promise<void> {
  const ok = await copyObjectsToClipboard(editor.getObjects())
  copyLabel.value = ok ? 'Copied!' : 'Failed'
  clearTimeout(copyTimeout.value)
  copyTimeout.value = setTimeout(() => { copyLabel.value = 'Copy objects[]' }, 2000)
}

// ─── Tool helpers ─────────────────────────────────────────────────────────────

const PRIMITIVES: PrimitiveType[] = ['rock', 'tree', 'crystal', 'pillar']

const PRIMITIVE_ICONS: Record<PrimitiveType, string> = {
  rock:    '🪨',
  tree:    '🌲',
  crystal: '💎',
  pillar:  '🏛️',
}

function setTool(tool: EditorTool): void  { editor.setActiveTool(tool) }
function setMode(mode: GizmoMode): void   { editor.setGizmoMode(mode) }
function selectItem(idx: number): void    { editor.selectByIndex(idx) }
function deleteSelected(): void           { editor.deleteSelected() }

function objectLabel(obj: PlacedObject, idx: number): string {
  const counts: Record<string, number> = {}
  for (let i = 0; i < idx; i++) {
    const t = state.value.objects[i]?.type ?? ''
    counts[t] = (counts[t] ?? 0) + 1
  }
  const n = (counts[obj.type] ?? 0) + 1
  return `${obj.type}_${String(n).padStart(2, '0')}`
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(async () => {
  if (!container.value) return

  editor.onStateChanged = (s) => { state.value = s }

  await engine.mount(container.value, context)
  await engine.mountChild('editor', editor)
})

onUnmounted(async () => {
  clearTimeout(copyTimeout.value)
  await engine.unmount()
})
</script>

<template>
  <div class="relative w-screen h-screen bg-black overflow-hidden select-none">

    <!-- Three.js canvas -->
    <div ref="container" class="absolute inset-0" />

    <!-- ── Top toolbar ──────────────────────────────────────────────────────── -->
    <div class="absolute top-0 left-0 right-64 h-11 flex items-center gap-2 px-4
                bg-black/60 backdrop-blur-sm border-b border-white/10">

      <!-- Back button -->
      <button class="nav-btn" @click="router.push('/')">← Menu</button>

      <div class="w-px h-5 bg-white/10" />

      <!-- Gizmo mode (only when selection exists) -->
      <template v-if="state.selectedIndex !== null">
        <button
          v-for="m in (['translate', 'rotate', 'scale'] as GizmoMode[])"
          :key="m"
          :class="['mode-btn', state.gizmoMode === m ? 'mode-active' : 'mode-idle']"
          @click="setMode(m)"
        >
          {{ m[0]!.toUpperCase() }}
          <span class="hidden sm:inline text-[10px] opacity-50 ml-0.5">{{ m.slice(1) }}</span>
        </button>
        <span class="text-white/25 text-[10px] tracking-wider">T/R/S</span>
      </template>

      <div class="flex-1" />

      <!-- Object count -->
      <span class="text-white/30 text-xs font-mono">
        {{ state.objects.length }} object{{ state.objects.length !== 1 ? 's' : '' }}
      </span>
    </div>

    <!-- ── Right sidebar ─────────────────────────────────────────────────────── -->
    <div class="absolute top-0 right-0 bottom-0 w-64 flex flex-col
                bg-black/70 backdrop-blur-md border-l border-white/10 text-white text-xs">

      <!-- ── Primitive picker ── -->
      <div class="px-3 pt-3 pb-2 border-b border-white/10">
        <p class="text-white/30 uppercase tracking-widest text-[10px] mb-2">Place</p>

        <!-- Select (pointer) tool -->
        <button
          :class="['tool-btn w-full mb-1', state.activeTool === 'select' ? 'tool-active' : 'tool-idle']"
          @click="setTool('select')"
        >
          <span class="text-sm">⬡</span> Select / Move
        </button>

        <!-- Primitive type buttons -->
        <div class="grid grid-cols-2 gap-1">
          <button
            v-for="prim in PRIMITIVES"
            :key="prim"
            :class="['tool-btn', state.activeTool === prim ? 'tool-active' : 'tool-idle']"
            @click="setTool(prim)"
          >
            {{ PRIMITIVE_ICONS[prim] }}
            <span class="capitalize">{{ prim }}</span>
          </button>
        </div>

        <p class="mt-2 text-white/20 text-[10px] leading-snug">
          Click terrain to place. Click object to select.
        </p>
      </div>

      <!-- ── Selected properties ── -->
      <div v-if="selected" class="px-3 py-2 border-b border-white/10 space-y-2">
        <p class="text-white/30 uppercase tracking-widest text-[10px]">Selected</p>

        <div class="flex items-center gap-2">
          <span class="text-white/50 w-16 shrink-0">Scale</span>
          <input
            type="range"
            min="0.1"
            max="6"
            step="0.05"
            :value="selected.scale ?? 1"
            class="flex-1 accent-indigo-500"
            @input="editor.updateSelectedScale(parseFloat(($event.target as HTMLInputElement).value))"
          />
          <span class="font-mono text-white/60 w-9 text-right">
            {{ (selected.scale ?? 1).toFixed(2) }}
          </span>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-white/50 w-16 shrink-0">Rotation</span>
          <input
            type="range"
            min="0"
            :max="(Math.PI * 2).toFixed(4)"
            step="0.05"
            :value="selected.rotationY ?? 0"
            class="flex-1 accent-indigo-500"
            @input="editor.updateSelectedRotationY(parseFloat(($event.target as HTMLInputElement).value))"
          />
          <span class="font-mono text-white/60 w-9 text-right">
            {{ ((selected.rotationY ?? 0) * 57.3).toFixed(0) }}°
          </span>
        </div>

        <div class="grid grid-cols-2 gap-1 font-mono text-white/30 text-[10px]">
          <span>X {{ selected.x.toFixed(1) }}</span>
          <span>Z {{ selected.z.toFixed(1) }}</span>
        </div>

        <button
          class="w-full py-1 rounded bg-red-900/40 hover:bg-red-800/60 text-red-300
                 hover:text-red-100 transition-colors text-xs"
          @click="deleteSelected"
        >
          Delete  <kbd class="opacity-50 text-[10px]">Del</kbd>
        </button>
      </div>

      <!-- ── Object list ── -->
      <div class="flex-1 overflow-y-auto px-3 py-2">
        <p class="text-white/30 uppercase tracking-widest text-[10px] mb-1">
          Objects ({{ state.objects.length }})
        </p>

        <p v-if="state.objects.length === 0" class="text-white/20 text-[10px] mt-4 text-center leading-relaxed">
          No objects placed yet.<br>Pick a type above and<br>click the terrain.
        </p>

        <ul class="space-y-0.5">
          <li
            v-for="(obj, idx) in state.objects"
            :key="idx"
            :class="[
              'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors',
              state.selectedIndex === idx
                ? 'bg-indigo-600/40 text-white'
                : 'hover:bg-white/5 text-white/60 hover:text-white/90',
            ]"
            @click="selectItem(idx)"
          >
            <span class="text-sm leading-none">{{ PRIMITIVE_ICONS[obj.type as PrimitiveType] }}</span>
            <span class="font-mono text-[11px] flex-1 truncate">{{ objectLabel(obj, idx) }}</span>
            <span class="font-mono text-[10px] text-white/25">×{{ (obj.scale ?? 1).toFixed(1) }}</span>
          </li>
        </ul>
      </div>

      <!-- ── Export ── -->
      <div class="px-3 py-3 border-t border-white/10">
        <p class="text-white/30 text-[10px] mb-2">
          Paste into <code class="text-indigo-400">SceneDescriptor.objects</code>
        </p>
        <button
          class="w-full py-1.5 rounded bg-indigo-700/50 hover:bg-indigo-600/70 text-indigo-200
                 hover:text-white transition-colors text-xs font-medium"
          :disabled="state.objects.length === 0"
          @click="copyObjects"
        >
          {{ copyLabel }}
        </button>
      </div>
    </div>

    <!-- ── Hints overlay ─────────────────────────────────────────────────────── -->
    <div class="absolute bottom-4 left-4 space-y-1 pointer-events-none">
      <p class="hint">Orbit: left-drag · Zoom: scroll · Right-click terrain: set orbit anchor</p>
      <p class="hint">T = move · R = rotate · S = scale · Esc = deselect · Del = delete</p>
    </div>
  </div>
</template>

<style scoped>
.nav-btn {
  @apply px-3 py-1 rounded text-white/50 hover:text-white hover:bg-white/10
         text-xs font-medium transition-colors;
}

.mode-btn {
  @apply px-3 py-1 rounded text-xs font-medium transition-colors flex items-center;
}
.mode-active { @apply bg-indigo-600 text-white; }
.mode-idle   { @apply text-white/50 hover:bg-white/10 hover:text-white; }

.tool-btn {
  @apply flex items-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors;
}
.tool-active { @apply bg-indigo-600/60 text-white ring-1 ring-indigo-400/50; }
.tool-idle   { @apply text-white/60 hover:bg-white/10 hover:text-white/90; }

.hint {
  @apply text-white/20 text-[10px] font-mono tracking-wider;
}
</style>
