<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ThreeModule } from '@base/threejs-engine'
import { useShellContext } from '@/composables/useShellContext'
import { EditorSceneModule } from '@/editor/EditorSceneModule'
import type { EditorState, EditorTool, EditorObject, GizmoMode } from '@/editor/EditorSceneModule'
import type { PrimitiveType, GltfObject } from '@/scene/SceneDescriptor'
import { copyObjectsToClipboard, copyDescriptorToClipboard } from '@/editor/DescriptorExporter'
import { scene01 } from '@/scenes/scene-01'

// ─── Engine setup ─────────────────────────────────────────────────────────────

const router    = useRouter()
const context   = useShellContext()
const container = ref<HTMLElement>()

const engine = new ThreeModule()
const editor = new EditorSceneModule(scene01)

// ─── Reactive editor state ────────────────────────────────────────────────────

const state = ref<EditorState>({
  objects:       [],
  selectedIndex: null,
  activeTool:    'select',
  gizmoMode:     'translate',
  activeGltfUrl: '',
})

const selected = computed<EditorObject | null>(() =>
  state.value.selectedIndex !== null
    ? (state.value.objects[state.value.selectedIndex] ?? null)
    : null,
)

// ─── GLTF tool state ──────────────────────────────────────────────────────────

const gltfUrlInput = ref('')

function applyGltfUrl(): void {
  const url = gltfUrlInput.value.trim()
  if (!url) return
  editor.setActiveGltfUrl(url)
  editor.setActiveTool('gltf')
}

// ─── Clipboard ────────────────────────────────────────────────────────────────

const copyObjLabel  = ref('Copy objects[]')
const copyDescLabel = ref('Copy full scene')
const copyTimeout   = ref<ReturnType<typeof setTimeout>>()

function flash(label: Ref<string>, ok: boolean, reset: string): void {
  label.value = ok ? 'Copied!' : 'Failed'
  clearTimeout(copyTimeout.value)
  copyTimeout.value = setTimeout(() => { label.value = reset }, 2000)
}

async function copyObjects(): Promise<void> {
  flash(copyObjLabel, await copyObjectsToClipboard(editor.getObjects()), 'Copy objects[]')
}

async function copyDescriptor(): Promise<void> {
  flash(copyDescLabel, await copyDescriptorToClipboard(scene01, editor.getObjects()), 'Copy full scene')
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

function objectIcon(obj: EditorObject): string {
  if (obj.type === 'gltf') return '📦'
  return PRIMITIVE_ICONS[obj.type as PrimitiveType] ?? '?'
}

function objectLabel(obj: EditorObject, idx: number): string {
  if (obj.type === 'gltf') {
    // Show basename of URL: /models/tree.glb → tree.glb
    const parts = (obj as GltfObject).url.split('/')
    return parts[parts.length - 1] ?? 'model'
  }
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

// helper type re-export so template can use it
type Ref<T> = ReturnType<typeof ref<T>>
</script>

<template>
  <div class="relative w-screen h-screen bg-black overflow-hidden select-none">

    <!-- Three.js canvas -->
    <div ref="container" class="absolute inset-0" />

    <!-- ── Top toolbar ──────────────────────────────────────────────────────── -->
    <div class="absolute top-0 left-0 right-64 h-11 flex items-center gap-2 px-4
                bg-black/60 backdrop-blur-sm border-b border-white/10">

      <button class="nav-btn" @click="router.push('/')">← Menu</button>

      <div class="w-px h-5 bg-white/10" />

      <!-- Gizmo mode (only when something is selected) -->
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

      <span class="text-white/30 text-xs font-mono">
        {{ state.objects.length }} object{{ state.objects.length !== 1 ? 's' : '' }}
      </span>
    </div>

    <!-- ── Right sidebar ─────────────────────────────────────────────────────── -->
    <div class="absolute top-0 right-0 bottom-0 w-64 flex flex-col
                bg-black/70 backdrop-blur-md border-l border-white/10 text-white text-xs">

      <!-- ── Primitive tools ── -->
      <div class="px-3 pt-3 pb-2 border-b border-white/10">
        <p class="text-white/30 uppercase tracking-widest text-[10px] mb-2">Primitives</p>

        <button
          :class="['tool-btn w-full mb-1', state.activeTool === 'select' ? 'tool-active' : 'tool-idle']"
          @click="setTool('select')"
        >
          <span class="text-sm">⬡</span> Select / Move
        </button>

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
      </div>

      <!-- ── GLTF tool ── -->
      <div class="px-3 py-2 border-b border-white/10">
        <p class="text-white/30 uppercase tracking-widest text-[10px] mb-2">GLTF Model</p>

        <div class="flex gap-1 mb-1">
          <input
            v-model="gltfUrlInput"
            type="text"
            placeholder="/models/tree.glb"
            class="flex-1 min-w-0 px-2 py-1 rounded bg-white/5 border border-white/10
                   text-white/80 placeholder-white/20 focus:outline-none focus:border-indigo-400
                   text-[11px] font-mono"
            @keydown.enter="applyGltfUrl"
          />
          <button
            class="px-2 py-1 rounded bg-indigo-700/60 hover:bg-indigo-600/80 text-indigo-200
                   hover:text-white transition-colors text-[11px] shrink-0"
            @click="applyGltfUrl"
          >
            Use
          </button>
        </div>

        <button
          v-if="state.activeGltfUrl"
          :class="['tool-btn w-full', state.activeTool === 'gltf' ? 'tool-active' : 'tool-idle']"
          @click="setTool('gltf')"
        >
          📦 <span class="truncate font-mono text-[10px]">{{ state.activeGltfUrl.split('/').pop() }}</span>
        </button>

        <p class="mt-1.5 text-white/20 text-[10px] leading-snug">
          Type a /public path, hit Use, then click terrain to place.
        </p>
      </div>

      <!-- ── Selected properties ── -->
      <div v-if="selected" class="px-3 py-2 border-b border-white/10 space-y-2">
        <p class="text-white/30 uppercase tracking-widest text-[10px]">Selected</p>

        <div class="flex items-center gap-2">
          <span class="text-white/50 w-16 shrink-0">Scale</span>
          <input
            type="range" min="0.1" max="6" step="0.05"
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
            type="range" min="0" :max="(Math.PI * 2).toFixed(4)" step="0.05"
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
                 hover:text-red-100 transition-colors"
          @click="deleteSelected"
        >
          Delete <kbd class="opacity-50 text-[10px]">Del</kbd>
        </button>
      </div>

      <!-- ── Object list ── -->
      <div class="flex-1 overflow-y-auto px-3 py-2">
        <p class="text-white/30 uppercase tracking-widest text-[10px] mb-1">
          Objects ({{ state.objects.length }})
        </p>

        <p v-if="state.objects.length === 0" class="text-white/20 text-[10px] mt-4 text-center leading-relaxed">
          No objects placed yet.<br>Pick a primitive or set a<br>GLTF URL above.
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
            <span class="text-sm leading-none">{{ objectIcon(obj) }}</span>
            <span class="font-mono text-[11px] flex-1 truncate">{{ objectLabel(obj, idx) }}</span>
            <span class="font-mono text-[10px] text-white/25">×{{ (obj.scale ?? 1).toFixed(1) }}</span>
          </li>
        </ul>
      </div>

      <!-- ── Export ── -->
      <div class="px-3 py-3 border-t border-white/10 space-y-1.5">
        <!-- Objects[] only — paste into existing descriptor -->
        <button
          class="w-full py-1.5 rounded bg-indigo-900/50 hover:bg-indigo-800/70 text-indigo-300
                 hover:text-white transition-colors font-medium disabled:opacity-40"
          :disabled="state.objects.length === 0"
          @click="copyObjects"
        >
          {{ copyObjLabel }}
        </button>

        <!-- Full scene file — ready to save as src/scenes/scene-XX.ts -->
        <button
          class="w-full py-1.5 rounded bg-violet-900/50 hover:bg-violet-800/70 text-violet-300
                 hover:text-white transition-colors font-medium"
          @click="copyDescriptor"
        >
          {{ copyDescLabel }}
        </button>

        <p class="text-white/20 text-[10px] leading-snug">
          "Full scene" includes terrain, atmosphere, scatter, and your placed objects — ready for a new <code class="text-indigo-400">src/scenes/</code> file.
        </p>
      </div>
    </div>

    <!-- ── Hints ─────────────────────────────────────────────────────────────── -->
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
