<script setup lang="ts">
import { ref, onMounted, onUnmounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ThreeModule } from '@base/threejs-engine'
import { InputModule } from '@base/input'
import { AudioModule } from '@base/audio'
import type { InputActionEvent, InputAxisEvent } from '@base/input'
import { SpinningCubeModule } from '@/modules/SpinningCubeModule'
import { useShellContext } from '@/composables/useShellContext'
import { useShellStore } from '@/stores/shell'

const router = useRouter()
const context = useShellContext()
const shell = useShellStore()

const container = ref<HTMLElement>()
const engine = new ThreeModule()
const cubeModule = new SpinningCubeModule()
const inputModule = new InputModule()
const audioModule = new AudioModule()

// ─── HUD state for Phase 3 validation ────────────────────────────────────────
const hud = reactive({
  lastAction: '—',
  moveAxis: { x: 0, y: 0 },
  lookAxis: { x: 0, y: 0 },
  audioReady: false,
})

function fmt(n: number): string {
  return n.toFixed(2).padStart(5)
}

onMounted(async () => {
  if (!container.value) return

  shell.setActiveModule(engine.id)

  await engine.mount(container.value, context)
  await engine.mountChild('spinning-cube', cubeModule)
  await engine.mountChild('input', inputModule)
  await engine.mountChild('audio', audioModule)

  hud.audioReady = true

  // ─── Input validation ───────────────────────────────────────────────────────
  context.eventBus.on('input:action', (raw) => {
    const e = raw as InputActionEvent
    hud.lastAction = `${e.action} ${e.type}`

    // Play a short beep via oscillator when 'interact' is pressed
    if (e.action === 'interact' && e.type === 'pressed') {
      playBeep()
    }
  })

  context.eventBus.on('input:axis', (raw) => {
    const e = raw as InputAxisEvent
    if (e.axis === 'move') {
      hud.moveAxis.x = e.value.x
      hud.moveAxis.y = e.value.y
    } else if (e.axis === 'look') {
      hud.lookAxis.x = e.value.x
      hud.lookAxis.y = e.value.y
    }
  })
})

onUnmounted(async () => {
  await engine.unmount()
  shell.setActiveModule(null)
})

// ─── Oscillator beep — validates AudioModule's sfx destination ───────────────
function playBeep(): void {
  const ctx = audioModule.audioManager.audioContext
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.frequency.value = 520
  gain.gain.setValueAtTime(0.25, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)

  osc.connect(gain)
  gain.connect(audioModule.audioManager.sfxDestination)
  osc.start()
  osc.stop(ctx.currentTime + 0.3)
}
</script>

<template>
  <div class="relative w-screen h-screen bg-black overflow-hidden">
    <div ref="container" class="absolute inset-0" />

    <!-- Top bar -->
    <div class="absolute top-4 left-4 flex flex-wrap items-center gap-3">
      <button
        class="flex items-center gap-2 px-4 py-2 bg-black/50 hover:bg-black/70 text-white text-xs font-medium rounded-lg backdrop-blur-sm border border-white/10 transition-colors"
        @click="router.push('/')"
      >
        ← Menu
      </button>
      <button
        class="px-3 py-2 bg-indigo-600/60 hover:bg-indigo-500/70 text-indigo-100 text-[10px] font-semibold rounded-lg backdrop-blur-sm border border-indigo-400/20 transition-colors"
        type="button"
        @click="router.push('/scene')"
      >
        Scene
      </button>
      <button
        class="px-3 py-2 bg-violet-700/60 hover:bg-violet-600/70 text-violet-100 text-[10px] font-semibold rounded-lg backdrop-blur-sm border border-violet-400/20 transition-colors"
        type="button"
        @click="router.push('/editor')"
      >
        Editor
      </button>
      <span class="px-3 py-1.5 bg-indigo-600/70 text-indigo-100 text-xs font-mono rounded-lg backdrop-blur-sm">
        threejs-engine-dev · Phase 3
      </span>
    </div>

    <!-- Phase 3 validation HUD -->
    <div class="absolute bottom-4 left-4 font-mono text-xs text-white/80 space-y-1 bg-black/60 backdrop-blur-sm rounded-lg px-4 py-3 border border-white/10 min-w-[220px]">
      <p class="text-white/40 uppercase tracking-widest text-[10px] mb-2">Input · Audio</p>

      <div class="flex justify-between gap-6">
        <span class="text-white/50">action</span>
        <span class="text-emerald-400">{{ hud.lastAction }}</span>
      </div>

      <div class="flex justify-between gap-6">
        <span class="text-white/50">move</span>
        <span>{{ fmt(hud.moveAxis.x) }} {{ fmt(hud.moveAxis.y) }}</span>
      </div>

      <div class="flex justify-between gap-6">
        <span class="text-white/50">look</span>
        <span>{{ fmt(hud.lookAxis.x) }} {{ fmt(hud.lookAxis.y) }}</span>
      </div>

      <div class="flex justify-between gap-6 mt-1">
        <span class="text-white/50">audio</span>
        <span :class="hud.audioReady ? 'text-emerald-400' : 'text-yellow-400'">
          {{ hud.audioReady ? 'ready' : 'init…' }}
        </span>
      </div>

      <p class="text-white/30 text-[10px] pt-1 border-t border-white/10">
        WASD move · E = interact + beep · gamepad supported
      </p>
    </div>
  </div>
</template>
