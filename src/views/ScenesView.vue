<!--
  ScenesView — the one place to open, import and delete scenes.

  Replaces the menu's separate Sandbox / Import Scene entries (E2, E10).
  Rows are the saved scenes in this browser's library (Dexie). Edit opens the
  editor on that row, Play runs it in the room player, Sandbox in the dev
  sandbox. Import writes a scene package (.zip) into the library, so it can be
  edited as well as played.
-->
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { assetDb, importRoomPackageToDb, useSavedScenes, type SceneRow } from '@base/ui'

const router = useRouter()
const { classified, loaded } = useSavedScenes()

const status = ref<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null)
const isImporting = ref(false)
const isDragOver = ref(false)

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

async function importFile(file: File): Promise<void> {
  if (isImporting.value) return
  isImporting.value = true
  status.value = null
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const r = await importRoomPackageToDb(bytes)
    const parts = [`Imported "${r.sceneName}"`, `${r.assetsAdded} asset${r.assetsAdded === 1 ? '' : 's'} added`]
    if (r.assetsReused > 0) parts.push(`${r.assetsReused} already in library`)
    if (r.missingAssetIds.length > 0) {
      status.value = {
        kind: 'warn',
        text: `${parts.join(' · ')} · ${r.missingAssetIds.length} referenced asset(s) were not in the file`,
      }
    } else {
      status.value = { kind: 'ok', text: parts.join(' · ') }
    }
  } catch (e) {
    console.error('[ScenesView] import failed:', e)
    status.value = { kind: 'error', text: e instanceof Error ? e.message : String(e) }
  } finally {
    isImporting.value = false
  }
}

function onFileInput(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // allow re-importing the same file
  if (file) void importFile(file)
}

function onDrop(e: DragEvent): void {
  isDragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) void importFile(file)
}

async function onDelete(scene: SceneRow, unloadable: boolean): Promise<void> {
  const detail = unloadable
    ? 'Its assets are missing in this browser, so it cannot be opened here. If it was saved in another browser or profile, it is still intact there — deleting here does not affect that copy.'
    : 'Its assets stay in the library.'
  if (!window.confirm(`Delete scene "${scene.name}" permanently?\n\n${detail}\n\nThis cannot be undone.`)) return
  try {
    await assetDb.scenes.delete(scene.id)
    status.value = { kind: 'ok', text: `Deleted "${scene.name}"` }
  } catch (e) {
    console.error('[ScenesView] delete failed:', e)
    status.value = { kind: 'error', text: `Could not delete "${scene.name}" — see console` }
  }
}

function go(path: string, id: string): void {
  void router.push({ path, query: { scene: id } })
}
</script>

<template>
  <div
    class="min-h-screen bg-zinc-950 text-white select-none flex flex-col items-center py-12 px-4"
    @dragover.prevent="isDragOver = true"
    @dragleave="isDragOver = false"
    @drop.prevent="onDrop"
  >
    <div class="w-full max-w-2xl flex flex-col gap-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold tracking-tight">Scenes</h1>
        <button
          class="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          @click="router.push('/')"
        >
          ← Menu
        </button>
      </div>

      <label
        class="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-dashed text-sm transition-colors cursor-pointer"
        :class="isDragOver ? 'border-teal-400 bg-teal-950/40 text-teal-200' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'"
      >
        <span>{{ isImporting ? 'Importing…' : 'Import a scene package — drop a .zip here or choose a file' }}</span>
        <span class="px-3 py-1 rounded-lg bg-teal-800 text-white text-xs font-semibold">Choose file</span>
        <input type="file" accept=".zip,application/zip" class="hidden" :disabled="isImporting" @change="onFileInput" />
      </label>

      <p
        v-if="status"
        class="text-xs px-3 py-2 rounded-lg"
        :class="{
          'bg-teal-950/60 text-teal-300': status.kind === 'ok',
          'bg-amber-950/60 text-amber-300': status.kind === 'warn',
          'bg-red-950/60 text-red-300': status.kind === 'error',
        }"
      >
        {{ status.text }}
      </p>

      <ul class="flex flex-col gap-2">
        <li
          v-for="entry in classified"
          :key="entry.scene.id"
          class="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800"
        >
          <div class="min-w-0">
            <div class="text-sm font-semibold truncate" :title="entry.scene.name">
              {{ entry.scene.name }}
              <span
                v-if="entry.availability.status !== 'ok'"
                class="ml-2 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded"
                :class="entry.availability.status === 'partial' ? 'bg-amber-900/60 text-amber-300' : 'bg-red-900/60 text-red-300'"
                :title="`${entry.availability.missing.length} of ${entry.availability.referenced.length} assets missing`"
              >{{ entry.availability.status === 'partial' ? 'partial' : 'assets missing' }}</span>
            </div>
            <div class="text-xs text-zinc-500">
              {{ entry.scene.placedObjects?.length ?? 0 }} obj · {{ entry.scene.config?.npcs?.length ?? 0 }} npc ·
              {{ entry.scene.config?.zones?.length ?? 0 }} zone · {{ formatDate(entry.scene.savedAt) }}
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <template v-if="!loaded || entry.availability.status !== 'unloadable'">
              <button class="btn bg-violet-700 hover:bg-violet-600" @click="go('/editor', entry.scene.id)">Edit</button>
              <button class="btn bg-teal-800 hover:bg-teal-700" @click="go('/room', entry.scene.id)">Play</button>
              <button class="btn bg-zinc-800 hover:bg-zinc-700 text-zinc-300" @click="go('/sandbox', entry.scene.id)">Sandbox</button>
            </template>
            <button
              class="btn bg-zinc-800 hover:bg-red-900 text-zinc-400 hover:text-red-200"
              :title="entry.availability.status === 'unloadable'
                ? 'Assets are missing in this browser — the scene may still be intact elsewhere'
                : 'Delete this scene'"
              @click="onDelete(entry.scene, entry.availability.status === 'unloadable')"
            >
              Delete
            </button>
          </div>
        </li>
        <li v-if="classified.length === 0" class="text-sm text-zinc-500 text-center py-8">
          No scenes yet. Import a package above, or build one in the Editor.
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.btn {
  padding: 0.35rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: white;
  transition: background-color 0.15s;
}
</style>
