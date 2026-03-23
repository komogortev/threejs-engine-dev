/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface Window {
  electronAPI?: {
    steam?: Record<string, unknown>
    storage?: {
      get: (key: string) => Promise<unknown>
      set: (key: string, value: unknown) => Promise<void>
      remove: (key: string) => Promise<void>
    }
  }
}
