<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import { useRouter } from 'vue-router'
import { ThreeModule } from '@base/threejs-engine'
import { useShellContext } from '@/composables/useShellContext'
import { EditorSceneModule } from '@/editor/EditorSceneModule'
import type { EditorState, EditorTool, EditorObject, GizmoMode, EnvironmentState } from '@/editor/EditorSceneModule'
import type { PrimitiveType, GltfObject, ScatterField } from '@/scene/SceneDescriptor'
import { copyObjectsToClipboard, copyDescriptorToClipboard } from '@/editor/DescriptorExporter'
import { scene01 } from '@/scenes/scene-01'

function defaultEnvironmentState(): EnvironmentState {
  return {
    dynamicSky:        false,
    phase:             0.28,
    phaseSpeed:        0,
    fogDensity:        0.012,
    fogColor:          0x080810,
    skyModel:          'physical',
    cloudEnabled:      false,
    cloudOpacity:      0.55,
    cloudScrollSpeed:  0.04,
    cloudWindX:        0.35,
    cloudWindZ:        0.12,
    cloudVisibleFrom:  0,
    cloudVisibleTo:    1,
    cloudDensityNight: 0.35,
    cloudDensityNoon:  1,
  }
}

function hex6(n: number): string {
  return `#${(n >>> 0).toString(16).padStart(6, '0')}`
}

// ─── Engine setup ─────────────────────────────────────────────────────────────

const router    = useRouter()
const context   = useShellContext()
const container = ref<HTMLElement>()

const engine = new ThreeModule()
const editor = new EditorSceneModule(scene01)

// ─── Reactive editor state ────────────────────────────────────────────────────

const state = ref<EditorState>({
  objects:               [],
  selectedIndex:       null,
  activeTool:          'select',
  gizmoMode:           'translate',
  activeGltfUrl:       '',
  scatterFields:       [],
  selectedScatterIndex: null,
  environment:         defaultEnvironmentState(),
})

const selected = computed<EditorObject | null>(() =>
  state.value.selectedIndex !== null
    ? (state.value.objects[state.value.selectedIndex] ?? null)
    : null,
)

/** Scatter zone currently selected in the sidebar (seed / count / rings). */
const selectedScatter = computed<ScatterField | null>(() => {
  const i = state.value.selectedScatterIndex
  if (i === null) return null
  return state.value.scatterFields[i] ?? null
})

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
  flash(
    copyDescLabel,
    await copyDescriptorToClipboard(
      scene01,
      editor.getObjects(),
      editor.getScatterFields(),
      editor.getAtmosphereForExport(),
    ),
    'Copy full scene',
  )
}

function scatterZoneLabel(sf: ScatterField, idx: number): string {
  return `#${idx + 1} ${sf.primitive} · ${sf.count}@${sf.seed ?? 0}`
}

function patchScatter(idx: number, patch: Partial<ScatterField>): void {
  editor.updateScatterField(idx, patch)
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
        {{ state.scatterFields.length }} scatter
        · {{ state.objects.length }} placed
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

      <!-- ── Seeded spawners (scatter fields) ── -->
      <div class="px-3 py-2 border-b border-white/10">
        <div class="flex items-center justify-between mb-1.5">
          <p class="text-white/30 uppercase tracking-widest text-[10px]">Seeded spawners</p>
          <button
            type="button"
            class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-300
                   hover:bg-emerald-800/60 transition-colors"
            @click="editor.addScatterField()"
          >
            + Zone
          </button>
        </div>

        <p v-if="state.scatterFields.length === 0" class="text-white/20 text-[10px] leading-relaxed">
          No scatter zones. Use <strong class="text-white/40">+ Zone</strong> or load a scene with scatter entries.
        </p>

        <ul v-else class="space-y-0.5 max-h-28 overflow-y-auto">
          <li
            v-for="(sf, idx) in state.scatterFields"
            :key="idx"
            :class="[
              'flex items-center gap-1 px-2 py-1 rounded cursor-pointer transition-colors text-[11px]',
              state.selectedScatterIndex === idx
                ? 'bg-emerald-700/35 text-white ring-1 ring-emerald-500/40'
                : 'hover:bg-white/5 text-white/55 hover:text-white/85',
            ]"
            @click="editor.selectScatterIndex(idx)"
          >
            <span>{{ PRIMITIVE_ICONS[sf.primitive] }}</span>
            <span class="font-mono truncate flex-1">{{ scatterZoneLabel(sf, idx) }}</span>
          </li>
        </ul>
      </div>

      <!-- ── Selected scatter zone (seed, count, radii, …) ── -->
      <div v-if="selectedScatter && state.selectedScatterIndex !== null" class="px-3 py-2 border-b border-white/10 space-y-2">
        <div class="flex items-center justify-between">
          <p class="text-white/30 uppercase tracking-widest text-[10px]">Scatter zone</p>
          <button
            type="button"
            class="text-[10px] text-red-400/80 hover:text-red-300"
            @click="editor.removeScatterField(state.selectedScatterIndex!)"
          >
            Remove
          </button>
        </div>

        <div class="grid grid-cols-2 gap-1">
          <span class="text-white/40 col-span-2 text-[10px]">Primitive</span>
          <button
            v-for="prim in PRIMITIVES"
            :key="prim"
            type="button"
            :class="[
              'py-1 rounded text-[10px] transition-colors',
              selectedScatter.primitive === prim
                ? 'bg-emerald-700/50 text-white'
                : 'bg-white/5 text-white/50 hover:bg-white/10',
            ]"
            @click="patchScatter(state.selectedScatterIndex!, { primitive: prim })"
          >
            {{ PRIMITIVE_ICONS[prim] }} {{ prim }}
          </button>
        </div>

        <label class="block space-y-0.5">
          <span class="text-white/40 text-[10px]">Seed (deterministic layout)</span>
          <div class="flex gap-1">
            <input
              type="number"
              class="flex-1 min-w-0 px-2 py-1 rounded bg-white/5 border border-white/10 font-mono text-[11px]"
              :value="selectedScatter.seed ?? 0"
              @change="patchScatter(state.selectedScatterIndex!, { seed: parseInt(($event.target as HTMLInputElement).value, 10) || 0 })"
            />
            <button
              type="button"
              class="px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-[10px] shrink-0"
              @click="editor.randomizeScatterSeed(state.selectedScatterIndex!)"
            >
              Dice
            </button>
          </div>
        </label>

        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="text-white/50 w-14 shrink-0 text-[10px]">Count</span>
            <input
              type="range" min="0" max="200" step="1"
              :value="selectedScatter.count"
              class="flex-1 accent-emerald-500"
              @input="patchScatter(state.selectedScatterIndex!, { count: parseInt(($event.target as HTMLInputElement).value, 10) })"
            />
            <span class="font-mono text-white/60 w-8 text-right text-[10px]">{{ selectedScatter.count }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-white/50 w-14 shrink-0 text-[10px]">Outer R</span>
            <input
              type="range" min="1" max="55" step="0.5"
              :value="selectedScatter.outerRadius"
              class="flex-1 accent-emerald-500"
              @input="patchScatter(state.selectedScatterIndex!, { outerRadius: parseFloat(($event.target as HTMLInputElement).value) })"
            />
            <span class="font-mono text-white/60 w-8 text-right text-[10px]">{{ selectedScatter.outerRadius.toFixed(1) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-white/50 w-14 shrink-0 text-[10px]">Inner R</span>
            <input
              type="range" min="0" max="50" step="0.5"
              :value="selectedScatter.innerRadius ?? 0"
              class="flex-1 accent-emerald-500"
              @input="patchScatter(state.selectedScatterIndex!, { innerRadius: parseFloat(($event.target as HTMLInputElement).value) })"
            />
            <span class="font-mono text-white/60 w-8 text-right text-[10px]">{{ (selectedScatter.innerRadius ?? 0).toFixed(1) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-white/50 w-14 shrink-0 text-[10px]">Centre X</span>
            <input
              type="range" min="-50" max="50" step="0.5"
              :value="selectedScatter.centerX ?? 0"
              class="flex-1 accent-emerald-500"
              @input="patchScatter(state.selectedScatterIndex!, { centerX: parseFloat(($event.target as HTMLInputElement).value) })"
            />
            <span class="font-mono text-white/60 w-8 text-right text-[10px]">{{ (selectedScatter.centerX ?? 0).toFixed(1) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-white/50 w-14 shrink-0 text-[10px]">Centre Z</span>
            <input
              type="range" min="-50" max="50" step="0.5"
              :value="selectedScatter.centerZ ?? 0"
              class="flex-1 accent-emerald-500"
              @input="patchScatter(state.selectedScatterIndex!, { centerZ: parseFloat(($event.target as HTMLInputElement).value) })"
            />
            <span class="font-mono text-white/60 w-8 text-right text-[10px]">{{ (selectedScatter.centerZ ?? 0).toFixed(1) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-white/50 w-14 shrink-0 text-[10px]">Scale min</span>
            <input
              type="range" min="0.05" max="4" step="0.05"
              :value="selectedScatter.scaleMin ?? 0.75"
              class="flex-1 accent-emerald-500"
              @input="patchScatter(state.selectedScatterIndex!, { scaleMin: parseFloat(($event.target as HTMLInputElement).value) })"
            />
            <span class="font-mono text-white/60 w-8 text-right text-[10px]">{{ (selectedScatter.scaleMin ?? 0.75).toFixed(2) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-white/50 w-14 shrink-0 text-[10px]">Scale max</span>
            <input
              type="range" min="0.05" max="4" step="0.05"
              :value="selectedScatter.scaleMax ?? 1.25"
              class="flex-1 accent-emerald-500"
              @input="patchScatter(state.selectedScatterIndex!, { scaleMax: parseFloat(($event.target as HTMLInputElement).value) })"
            />
            <span class="font-mono text-white/60 w-8 text-right text-[10px]">{{ (selectedScatter.scaleMax ?? 1.25).toFixed(2) }}</span>
          </div>
        </div>
      </div>

      <!-- ── Selected placed object ── -->
      <div v-else-if="selected" class="px-3 py-2 border-b border-white/10 space-y-2">
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

      <!-- ── Atmosphere: fog, time, clouds ── -->
      <div class="px-3 py-2 border-b border-white/10 max-h-64 overflow-y-auto shrink-0">
        <p class="text-white/30 uppercase tracking-widest text-[10px] mb-2">Atmosphere</p>

        <div class="space-y-2 text-[10px]">
          <div class="flex items-center gap-2">
            <span class="text-white/50 w-14 shrink-0">Fog ρ</span>
            <input
              type="range" min="0" max="0.12" step="0.001"
              :value="state.environment.fogDensity"
              class="flex-1 accent-sky-500"
              @input="editor.setEnvironmentFogDensity(parseFloat(($event.target as HTMLInputElement).value))"
            />
            <span class="font-mono text-white/50 w-10 text-right">{{ state.environment.fogDensity.toFixed(3) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-white/50 w-14 shrink-0">Fog rgb</span>
            <input
              type="color"
              class="h-7 w-12 rounded border border-white/20 cursor-pointer bg-transparent"
              :value="hex6(state.environment.fogColor)"
              @input="editor.setEnvironmentFogColor(parseInt(($event.target as HTMLInputElement).value.slice(1), 16))"
            />
            <span class="font-mono text-white/40 truncate">{{ hex6(state.environment.fogColor) }}</span>
          </div>

          <template v-if="state.environment.dynamicSky">
            <p class="text-sky-400/80 text-[9px] uppercase tracking-wider pt-1">Day cycle</p>
            <div class="flex items-center gap-2">
              <span class="text-white/50 w-14 shrink-0">Phase</span>
              <input
                type="range" min="0" max="1" step="0.005"
                :value="state.environment.phase"
                class="flex-1 accent-amber-500"
                @input="editor.setEnvironmentPhase(parseFloat(($event.target as HTMLInputElement).value))"
              />
              <span class="font-mono text-white/50 w-8 text-right">{{ state.environment.phase.toFixed(2) }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-white/50 w-14 shrink-0">Speed</span>
              <input
                type="range" min="0" max="0.01" step="0.0001"
                :value="state.environment.phaseSpeed"
                class="flex-1 accent-amber-500"
                @input="editor.setEnvironmentPhaseSpeed(parseFloat(($event.target as HTMLInputElement).value))"
              />
              <span class="font-mono text-white/50 w-10 text-right">{{ state.environment.phaseSpeed.toFixed(4) }}</span>
            </div>
            <p class="text-white/25 text-[9px] leading-snug">
              Phase 0≈night · 0.25↑dawn · 0.5 noon · 0.75↓dusk. Speed 0 = static.
            </p>

            <template v-if="state.environment.cloudEnabled">
              <p class="text-sky-400/80 text-[9px] uppercase tracking-wider pt-1">Clouds (timeline)</p>
              <div class="flex items-center gap-2">
                <span class="text-white/50 w-14 shrink-0">Opacity</span>
                <input
                  type="range" min="0" max="1" step="0.02"
                  :value="state.environment.cloudOpacity"
                  class="flex-1 accent-slate-400"
                  @input="editor.setCloudOpacity(parseFloat(($event.target as HTMLInputElement).value))"
                />
              </div>
              <div class="flex items-center gap-2">
                <span class="text-white/50 w-14 shrink-0">Scroll</span>
                <input
                  type="range" min="0" max="0.2" step="0.005"
                  :value="state.environment.cloudScrollSpeed"
                  class="flex-1 accent-slate-400"
                  @input="editor.setCloudScrollSpeed(parseFloat(($event.target as HTMLInputElement).value))"
                />
              </div>
              <div class="flex items-center gap-2">
                <span class="text-white/50 w-14 shrink-0">Wind X</span>
                <input
                  type="range" min="-1" max="1" step="0.05"
                  :value="state.environment.cloudWindX"
                  class="flex-1 accent-slate-400"
                  @input="editor.setCloudWind(parseFloat(($event.target as HTMLInputElement).value), state.environment.cloudWindZ)"
                />
              </div>
              <div class="flex items-center gap-2">
                <span class="text-white/50 w-14 shrink-0">Wind Z</span>
                <input
                  type="range" min="-1" max="1" step="0.05"
                  :value="state.environment.cloudWindZ"
                  class="flex-1 accent-slate-400"
                  @input="editor.setCloudWind(state.environment.cloudWindX, parseFloat(($event.target as HTMLInputElement).value))"
                />
              </div>
              <div class="flex items-center gap-2">
                <span class="text-white/50 w-14 shrink-0">On from</span>
                <input
                  type="range" min="0" max="1" step="0.02"
                  :value="state.environment.cloudVisibleFrom"
                  class="flex-1 accent-slate-400"
                  @input="editor.setCloudVisibilityWindow(parseFloat(($event.target as HTMLInputElement).value), state.environment.cloudVisibleTo)"
                />
              </div>
              <div class="flex items-center gap-2">
                <span class="text-white/50 w-14 shrink-0">On to</span>
                <input
                  type="range" min="0" max="1" step="0.02"
                  :value="state.environment.cloudVisibleTo"
                  class="flex-1 accent-slate-400"
                  @input="editor.setCloudVisibilityWindow(state.environment.cloudVisibleFrom, parseFloat(($event.target as HTMLInputElement).value))"
                />
              </div>
              <div class="flex items-center gap-2">
                <span class="text-white/50 w-14 shrink-0">Den night</span>
                <input
                  type="range" min="0" max="2" step="0.05"
                  :value="state.environment.cloudDensityNight"
                  class="flex-1 accent-slate-400"
                  @input="editor.setCloudDensityCurve(parseFloat(($event.target as HTMLInputElement).value), state.environment.cloudDensityNoon)"
                />
              </div>
              <div class="flex items-center gap-2">
                <span class="text-white/50 w-14 shrink-0">Den noon</span>
                <input
                  type="range" min="0" max="2" step="0.05"
                  :value="state.environment.cloudDensityNoon"
                  class="flex-1 accent-slate-400"
                  @input="editor.setCloudDensityCurve(state.environment.cloudDensityNight, parseFloat(($event.target as HTMLInputElement).value))"
                />
              </div>
            </template>
          </template>
          <p v-else class="text-white/25 text-[9px] leading-snug pt-1">
            Set <code class="text-indigo-400">atmosphere.dynamicSky: true</code> in the scene file for sky, sun/moon, and cloud timeline.
          </p>
        </div>
      </div>

      <!-- ── Object list ── -->
      <div class="flex-1 overflow-y-auto px-3 py-2 min-h-0">
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
          Full export includes terrain, <strong class="text-white/40">atmosphere</strong> (fog + day cycle + clouds if enabled), scatter, and placed objects.
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
