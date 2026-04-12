<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ThreeModule } from '@base/threejs-engine'
import { DEFAULT_BINDINGS, InputModule, mergeBindings } from '@base/input'
import { useInputSettings } from '@/composables/useInputSettings'
import { DboxSceneModule } from '@/modules/DboxSceneModule'
import { dboxScene } from '@/scenes/dbox'
import { useShellContext } from '@/composables/useShellContext'

const router  = useRouter()
const context = useShellContext()
const container = ref<HTMLElement>()

const { loadActive } = useInputSettings()
const engine      = new ThreeModule()
/** Default binds **KeyE** to `interact`; dbox uses **E** for slam, so drop keyboard interact here. */
const inputModule = new InputModule(
  mergeBindings(loadActive(), {
    keyboard: {
      interact: [],
      ability_primary: ['KeyQ'],
      ability_secondary: ['KeyE'],
      toggle_camera: ['Tab'],
    },
    gamepad: {
      ability_primary: [3],
      ability_secondary: [2],
      toggle_camera: [8],
    },
  } as unknown as Parameters<typeof mergeBindings>[1]),
  { enablePointerLook: true },
)
const sceneModule = new DboxSceneModule({
  descriptor: dboxScene,
  cameraPreset: 'close-follow',
})

// ── Time control state ─────────────────────────────────────────────────────
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
  if (!paused.value) setScale(0)   // auto-pause when stepping
  sceneModule.stepOneFrame()
}

// ── World ready / hint ──────────────────────────────────────────────────────
const worldReady = ref(false)
const showHint   = ref(true)
let hintTimer: ReturnType<typeof setTimeout>

// ── Keyboard ────────────────────────────────────────────────────────────────
function onKeyDown(e: KeyboardEvent): void {
  // Skip if a text input has focus.
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
      // R = resume / release time control
      if (paused.value) {
        e.preventDefault()
        setScale(1.0)
      }
      break
    case 'BracketLeft':
      e.preventDefault()
      // Slow-mo: halve speed (min 0.125)
      setScale(Math.max(0.125, timeScale.value / 2))
      break
    case 'BracketRight':
      e.preventDefault()
      // Speed-up: double speed (max 4)
      setScale(Math.min(4, timeScale.value * 2))
      break
  }
}

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
  hintTimer = setTimeout(() => { showHint.value = false }, 5000)

  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(async () => {
  window.removeEventListener('keydown', onKeyDown)
  clearTimeout(hintTimer)
  await engine.unmount()
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

    <!-- Loading veil -->
    <div
      v-if="!worldReady"
      class="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black text-white/45 text-sm"
      aria-busy="true" aria-live="polite"
    >
      <span class="inline-block size-8 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
      <span>Building dbox…</span>
    </div>

    <!-- Back button -->
    <div class="absolute top-4 left-4 z-40">
      <button
        class="flex items-center gap-2 px-4 py-2 bg-black/40 hover:bg-black/60 text-white/70 hover:text-white text-xs font-medium rounded-lg backdrop-blur-sm border border-white/10 transition-all"
        @click="router.push('/')"
      >
        ← Menu
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
          Time: P pause · F step frame · R resume · [ ] slow / fast
        </p>
      </div>
    </Transition>

    <!-- Key bindings — always visible -->
    <div
      v-if="worldReady"
      class="absolute top-16 left-4 z-40 max-w-[20rem] rounded-lg border border-white/15 bg-black/55 px-3 py-2.5 backdrop-blur-sm"
    >
      <p class="text-white/55 text-[9px] font-mono uppercase tracking-widest mb-1.5">Key map</p>
      <dl class="space-y-1 text-[10px] font-mono leading-snug text-white/45">
        <div class="flex gap-2"><dt class="shrink-0 text-cyan-400/90 w-14">Move</dt><dd>W A S D · 5.5 m/s walk (OW1) · Shift sprint · Space jump · C crouch</dd></div>
        <div class="flex gap-2"><dt class="shrink-0 text-cyan-400/90 w-14">Punch</dt><dd>Right mouse on canvas hold → release (~1.4 s max · 4 s CD) · small upward pop (harness; OW kit is horizontal)</dd></div>
        <div class="flex gap-2"><dt class="shrink-0 text-cyan-400/90 w-14">Uppercut</dt><dd>Q · 6 s CD · NPCs in cone: lift + 0.6 s move/ability lock (OW1)</dd></div>
        <div class="flex gap-2"><dt class="shrink-0 text-cyan-400/90 w-14">Slam</dt><dd>E hold → cone at mouse→ground (else ≤20 m along aim) · release: dash to apex + slam · 6 s CD</dd></div>
        <div class="flex gap-2"><dt class="shrink-0 text-cyan-400/90 w-14">Camera</dt><dd>Tab — first / third person (click canvas for mouse-look in 1p)</dd></div>
        <div class="flex gap-2"><dt class="shrink-0 text-cyan-400/90 w-14">Time</dt><dd>P pause · F step 1 frame · R resume · [ ] slower / faster</dd></div>
      </dl>
    </div>

    <!-- Fixture legend (bottom-left) — same layout as sandbox -->
    <div
      v-if="worldReady"
      class="absolute bottom-4 left-4 z-40 flex flex-col gap-0.5 bg-black/50 border border-white/10 rounded-lg px-3 py-2 backdrop-blur-sm max-w-[min(100vw-2rem,22rem)]"
    >
      <p class="text-white/40 text-[9px] font-mono uppercase tracking-widest mb-0.5">dbox · locomotion lab</p>
      <p class="text-white/35 text-[9px] font-mono mb-1">Keys: top-left panel</p>
      <p class="text-white/30 text-[9px] font-mono uppercase tracking-widest mb-1">Landing tiers (X ≈ −28)</p>
      <div v-for="item in [
        { label: 'soft     ~2 m', color: '#22d3ee' },
        { label: 'medium   ~4 m', color: '#84cc16' },
        { label: 'hard     ~7 m', color: '#fbbf24' },
        { label: 'critical ~11 m', color: '#f97316' },
        { label: 'fatal    ~22 m', color: '#ef4444' },
      ]" :key="item.label" class="flex items-center gap-2">
        <span class="inline-block size-2 rounded-full flex-shrink-0" :style="{ background: item.color }" />
        <span class="text-[9px] font-mono text-white/50">{{ item.label }}</span>
      </div>
      <div class="mt-1 border-t border-white/10 pt-1">
        <p class="text-white/35 text-[9px] font-mono">NPC blobs ×5 · magenta spheres · south of pool entry</p>
        <p class="text-white/30 text-[9px] font-mono">Pool: X 15–25 · Z −25–25 · depth 0→−25 m</p>
        <p class="text-white/30 text-[9px] font-mono">Obstacles: knee 0.5 m · body 1.8 m (X 5, 9)</p>
      </div>
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
