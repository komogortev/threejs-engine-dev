import type { PlatformAdapter, StorageAdapter } from './adapter'

const webStorage: StorageAdapter = {
  async get(key: string): Promise<unknown> {
    const raw = localStorage.getItem(key)
    return raw !== null ? (JSON.parse(raw) as unknown) : null
  },

  async set(key: string, value: unknown): Promise<void> {
    localStorage.setItem(key, JSON.stringify(value))
  },

  async remove(key: string): Promise<void> {
    localStorage.removeItem(key)
  },
}

export const webAdapter: PlatformAdapter = {
  isElectron: false,
  storage: webStorage,

  openExternal(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer')
  },
}
