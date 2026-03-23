<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { EngineModule, ShellContext } from '@base/engine-core'

const props = defineProps<{
  module: EngineModule
  context: ShellContext
}>()

const container = ref<HTMLElement>()

onMounted(async () => {
  if (container.value) {
    await props.module.mount(container.value, props.context)
  }
})

onUnmounted(async () => {
  await props.module.unmount()
})
</script>

<template>
  <div ref="container" class="w-full h-full" />
</template>
