import { EventBus } from '@base/engine-core'
import type { ShellContext } from '@base/engine-core'
import { useRouter } from 'vue-router'
import { useShellStore } from '@/stores/shell'

// One shared EventBus for the entire shell lifetime.
// All modules mounted by this shell communicate through this bus.
const shellEventBus = new EventBus()

export function useShellContext(): ShellContext {
  const router = useRouter()
  const shell = useShellStore()

  return {
    eventBus: shellEventBus,
    locale: shell.locale,
    navigate(path: string): void {
      void router.push(path)
    },
  }
}
