<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { assetDb } from '@base/ui'

const router = useRouter()

const hasSandboxScene = ref(false)
onMounted(async () => {
  // Check Dexie for named scenes (new path) or legacy localStorage save (migration pending).
  const dbCount = await assetDb.scenes.count()
  const legacyExists = localStorage.getItem('sandbox:scene') !== null
  hasSandboxScene.value = dbCount > 0 || legacyExists
})
</script>

<template>
  <div class="flex flex-col items-center justify-center min-h-screen bg-zinc-950 gap-4 select-none">
    <div class="flex flex-col items-center gap-2 mb-8">
      <h1 class="text-4xl font-bold tracking-tight text-white">threejs-engine-dev</h1>
      <p class="text-xs font-medium tracking-[0.3em] uppercase text-zinc-500">Phase D dev harness</p>
    </div>

    <div class="flex flex-col gap-3 w-52">
      <button
        class="w-full px-6 py-3 bg-teal-800 hover:bg-teal-700 active:bg-teal-900 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-teal-800"
        :disabled="!hasSandboxScene"
        @click="router.push('/sandbox')"
      >
        Sandbox
      </button>
      <button
        class="w-full px-6 py-3 bg-violet-700 hover:bg-violet-600 active:bg-violet-800 text-white text-sm font-semibold rounded-xl transition-colors"
        @click="router.push('/editor')"
      >
        Editor
      </button>
      <button
        class="w-full px-6 py-3 bg-teal-900 hover:bg-teal-800 active:bg-teal-950 text-teal-300 text-sm font-semibold rounded-xl transition-colors"
        @click="router.push('/room')"
      >
        Load Room
      </button>
      <button
        class="w-full px-6 py-3 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-900 text-zinc-400 text-sm font-semibold rounded-xl transition-colors"
        @click="router.push('/settings')"
      >
        Settings
      </button>
    </div>
  </div>
</template>
