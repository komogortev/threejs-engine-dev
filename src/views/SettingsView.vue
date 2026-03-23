<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useShellStore } from '@/stores/shell'

const router = useRouter()
const shell = useShellStore()

const locales = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
] as const
</script>

<template>
  <div class="flex flex-col min-h-screen bg-zinc-950 text-white">
    <div class="max-w-lg mx-auto w-full px-6 py-8">
      <button
        class="flex items-center gap-1 text-zinc-400 hover:text-white text-sm transition-colors mb-10"
        @click="router.push('/')"
      >
        ← Back
      </button>

      <h1 class="text-2xl font-bold mb-8">Settings</h1>

      <div class="space-y-4">
        <div class="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
          <label class="block text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">
            Language
          </label>
          <select
            v-model="shell.locale"
            class="w-full bg-zinc-800 text-white text-sm rounded-xl px-4 py-2.5 border border-zinc-700 focus:outline-none focus:border-indigo-500 transition-colors"
          >
            <option v-for="loc in locales" :key="loc.value" :value="loc.value">
              {{ loc.label }}
            </option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>
