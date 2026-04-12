<script setup lang="ts">
import { ref, reactive, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useShellStore } from '@/stores/shell'
import { DEFAULT_BINDINGS } from '@base/input'
import type { KeyboardBindings } from '@base/input'
import { useInputSettings } from '@/composables/useInputSettings'

const router = useRouter()
const shell = useShellStore()
const { loadActive, saveKeyboardOverride, resetToDefaults } = useInputSettings()

const locales = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Fran\u00e7ais' },
  { value: 'es', label: 'Espa\u00f1ol' },
] as const

// ─── Input bindings state ───────────────────────────────────────────────────

/** Keyboard actions we expose in settings. Move keys are handled separately. */
const BINDABLE_ACTIONS: Array<{ key: keyof KeyboardBindings; label: string }> = [
  { key: 'jump', label: 'Jump' },
  { key: 'sprint', label: 'Sprint' },
  { key: 'crouch', label: 'Crouch' },
  { key: 'interact', label: 'Interact' },
  { key: 'toggle_camera', label: 'Toggle Camera' },
  { key: 'pause', label: 'Pause' },
  { key: 'ability_primary', label: 'Ability 1' },
  { key: 'ability_secondary', label: 'Ability 2' },
]

/** Live snapshot of current bindings (including user overrides). */
const bindings = reactive(loadActive().keyboard)

/** Which action row is currently listening for a keypress. `null` = none. */
const rebindingAction = ref<keyof KeyboardBindings | null>(null)

function formatKey(code: string): string {
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace('ShiftLeft', 'L-Shift')
    .replace('ShiftRight', 'R-Shift')
    .replace('ControlLeft', 'L-Ctrl')
    .replace('ControlRight', 'R-Ctrl')
    .replace('AltLeft', 'L-Alt')
    .replace('AltRight', 'R-Alt')
    .replace('ArrowUp', '\u2191')
    .replace('ArrowDown', '\u2193')
    .replace('ArrowLeft', '\u2190')
    .replace('ArrowRight', '\u2192')
}

function startRebind(action: keyof KeyboardBindings): void {
  rebindingAction.value = action
}

function onKeyDown(e: KeyboardEvent): void {
  if (!rebindingAction.value) return
  e.preventDefault()
  e.stopPropagation()

  if (e.code === 'Escape') {
    rebindingAction.value = null
    return
  }

  const action = rebindingAction.value
  const keys = [e.code]

  saveKeyboardOverride(action, keys)
  // Update reactive state
  ;(bindings as Record<string, unknown>)[action] = keys
  rebindingAction.value = null
}

function handleResetAll(): void {
  resetToDefaults()
  Object.assign(bindings, DEFAULT_BINDINGS.keyboard)
}

// Global keydown listener for rebinding
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', onKeyDown, { capture: true })
}
onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onKeyDown, { capture: true })
  }
})
</script>

<template>
  <div class="flex flex-col min-h-screen bg-zinc-950 text-white">
    <div class="max-w-lg mx-auto w-full px-6 py-8">
      <button
        class="flex items-center gap-1 text-zinc-400 hover:text-white text-sm transition-colors mb-10"
        @click="router.push('/')"
      >
        &larr; Back
      </button>

      <h1 class="text-2xl font-bold mb-8">Settings</h1>

      <div class="space-y-4">
        <!-- Language -->
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

        <!-- Input Bindings -->
        <div class="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
          <div class="flex items-center justify-between mb-4">
            <label class="block text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Keyboard Bindings
            </label>
            <button
              class="text-xs text-zinc-500 hover:text-red-400 transition-colors"
              @click="handleResetAll"
            >
              Reset All
            </button>
          </div>

          <p class="text-xs text-zinc-600 mb-4">
            Click a key to rebind. Press Escape to cancel. Changes apply on next scene load.
          </p>

          <div class="space-y-1">
            <div
              v-for="action in BINDABLE_ACTIONS"
              :key="action.key"
              class="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-zinc-800/50 transition-colors"
            >
              <span class="text-sm text-zinc-300">{{ action.label }}</span>
              <button
                class="min-w-[80px] text-center text-sm px-3 py-1 rounded-lg border transition-colors"
                :class="
                  rebindingAction === action.key
                    ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300 animate-pulse'
                    : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500 hover:text-white'
                "
                @click="startRebind(action.key)"
              >
                <template v-if="rebindingAction === action.key">
                  Press key...
                </template>
                <template v-else>
                  {{ ((bindings as Record<string, unknown>)[action.key] as string[] | undefined)?.map(formatKey).join(', ') || 'Unbound' }}
                </template>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
