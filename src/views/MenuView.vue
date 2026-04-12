<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="flex flex-col items-center justify-center min-h-screen bg-zinc-950 gap-4 select-none">
    <div class="flex flex-col items-center gap-2 mb-8">
      <h1 class="text-4xl font-bold tracking-tight text-white">threejs-engine-dev</h1>
      <p class="text-xs font-medium tracking-[0.3em] uppercase text-zinc-500">Phase 3 dev harness</p>
    </div>

    <div class="flex flex-col gap-3 w-52">
      <button
        class="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors"
        @click="router.push('/scene')"
      >
        Scene
      </button>
      <button
        class="w-full px-6 py-3 bg-violet-700 hover:bg-violet-600 active:bg-violet-800 text-white text-sm font-semibold rounded-xl transition-colors"
        @click="router.push('/editor')"
      >
        Scene Editor
      </button>
      <button
        class="w-full px-6 py-3 bg-teal-800 hover:bg-teal-700 active:bg-teal-900 text-white text-sm font-semibold rounded-xl transition-colors"
        @click="router.push('/sandbox')"
      >
        Sandbox
      </button>
      <button
        class="w-full px-6 py-3 bg-cyan-900 hover:bg-cyan-800 active:bg-cyan-950 text-cyan-100 text-sm font-semibold rounded-xl transition-colors"
        @click="router.push('/dbox')"
      >
        Dbox (locomotion lab)
      </button>
      <button
        class="w-full px-6 py-3 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-900 text-white text-sm font-semibold rounded-xl transition-colors"
        @click="router.push('/game')"
      >
        Engine Test
      </button>
      <button
        class="w-full px-6 py-3 bg-sky-900 hover:bg-sky-800 active:bg-sky-950 text-sky-200 text-sm font-semibold rounded-xl transition-colors"
        @click="router.push('/scene-editor')"
      >
        Scene Editor
      </button>
      <button
        class="w-full px-6 py-3 bg-amber-900 hover:bg-amber-800 active:bg-amber-950 text-amber-200 text-sm font-semibold rounded-xl transition-colors"
        @click="router.push('/waypoints')"
      >
        Waypoint Editor (legacy)
      </button>
      <button
        class="w-full px-6 py-3 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-900 text-zinc-400 text-sm font-semibold rounded-xl transition-colors"
        @click="router.push('/settings')"
      >
        Settings
      </button>
    </div>

    <p class="absolute bottom-6 text-zinc-600 text-xs font-mono">
      WASD to move · gamepad supported · E = interact
    </p>
  </div>
</template>
