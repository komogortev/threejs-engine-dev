import { DEFAULT_BINDINGS, mergeBindings } from '@base/input'
import type { InputBindings } from '@base/input'

const STORAGE_KEY = 'input-bindings-overrides'

/**
 * Composable for loading, saving, and resetting user input key-binding overrides.
 * Overrides are persisted to localStorage and merged onto {@link DEFAULT_BINDINGS}
 * at scene-mount time via {@link loadActive}.
 *
 * Changes take effect on the next scene load (no hot-swap required for MVP).
 */
export function useInputSettings() {
  function loadActive(): InputBindings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return DEFAULT_BINDINGS
      const overrides: Partial<InputBindings> = JSON.parse(raw)
      return mergeBindings(DEFAULT_BINDINGS, overrides)
    } catch {
      return DEFAULT_BINDINGS
    }
  }

  function loadOverrides(): Partial<InputBindings> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  }

  function saveKeyboardOverride(action: string, keys: string[]): void {
    const overrides = loadOverrides() as Record<string, unknown>
    const kb = (overrides.keyboard ?? {}) as Record<string, unknown>
    kb[action] = keys
    overrides.keyboard = kb
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  }

  function resetToDefaults(): void {
    localStorage.removeItem(STORAGE_KEY)
  }

  return { loadActive, loadOverrides, saveKeyboardOverride, resetToDefaults }
}
