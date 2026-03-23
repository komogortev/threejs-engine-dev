import type { PlatformAdapter } from '@/platform/adapter'
import { webAdapter } from '@/platform/webAdapter'

let _adapter: PlatformAdapter | null = null

/**
 * Returns the platform adapter appropriate for the current runtime.
 * - In a browser: returns the web adapter (localStorage, window.open)
 * - In Electron (Phase 5): returns the Electron adapter (electron-store, Steamworks)
 *
 * Call this once; the result is cached for the app lifetime.
 */
export function usePlatformAdapter(): PlatformAdapter {
  if (_adapter !== null) return _adapter

  if (typeof window !== 'undefined' && window.electronAPI !== undefined) {
    // Electron adapter is implemented in Phase 5.
    // Until then, fall back to web adapter with a warning.
    console.warn('[platform] Electron runtime detected — ElectronAdapter not yet implemented, using web fallback')
  }

  _adapter = webAdapter
  return _adapter
}
