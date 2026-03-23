import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useShellStore = defineStore('shell', () => {
  const locale = ref<string>('en')
  const activeModuleId = ref<string | null>(null)

  function setLocale(value: string): void {
    locale.value = value
    // Consumers subscribe to shell:locale-change on the eventBus
  }

  function setActiveModule(id: string | null): void {
    activeModuleId.value = id
  }

  return { locale, activeModuleId, setLocale, setActiveModule }
})
