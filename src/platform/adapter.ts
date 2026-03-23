export interface StorageAdapter {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
}

export interface SteamAdapter {
  getPlayerName(): Promise<string>
  setAchievement(id: string): Promise<void>
  clearAchievement(id: string): Promise<void>
  saveToCloud(key: string, data: string): Promise<void>
  loadFromCloud(key: string): Promise<string | null>
}

export interface PlatformAdapter {
  readonly isElectron: boolean
  storage: StorageAdapter
  openExternal(url: string): void
  steam?: SteamAdapter
}
