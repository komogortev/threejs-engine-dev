/**
 * Dev seed — imports the converted Mixamo "X Bot" character GLB into the
 * editor asset library (Dexie) so it shows up in the NPC/character picker.
 *
 * The GLB is produced by `scripts/fbx-to-glb.mjs` + the @gltf-transform minify
 * pass (65-bone mixamorig rig, Draco-compressed, ~197 KB). Classifying it
 * `kind: 'character'` is what makes the picker's character filter list it.
 *
 * Browser console API:
 *   window.__seedXBot()    — add /characters/npc/X Bot.glb (idempotent by name)
 *   window.__clearXBot()   — remove it from the library
 */

import { assetDb } from '@base/ui'
import type { AssetRow } from '@base/ui'

const SRC = '/characters/npc/X Bot.glb'
const NAME = 'X Bot.glb'

const uid = (n: number) =>
  crypto.getRandomValues(new Uint8Array(n))
    .reduce((s, b) => s + (b & 63).toString(36), '')
    .slice(0, n)

export async function seedXBot(): Promise<string> {
  const existing = await assetDb.assets.where('name').equals(NAME).first()
  if (existing) {
    console.log(`[seedXBot] "${NAME}" already in library → ${existing.id}`)
    return existing.id
  }

  const res = await fetch(SRC)
  if (!res.ok) throw new Error(`[seedXBot] fetch ${SRC} failed: ${res.status}`)
  const blob = await res.blob()

  const id = `asset-${uid(21)}`
  const row: AssetRow = {
    id,
    name: NAME,
    kind: 'character',
    size: blob.size,
    contentType: 'model/gltf-binary',
    blob,
    createdAt: new Date().toISOString(),
    tags: ['mixamo', 'character'],
  }
  await assetDb.assets.put(row)
  console.log(
    `[seedXBot] ↑ "${NAME}" (${(blob.size / 1024).toFixed(1)} KB) → ${id} (kind:character)`,
  )
  return id
}

export async function clearXBot(): Promise<void> {
  const rows = await assetDb.assets.where('name').equals(NAME).toArray()
  await Promise.all(rows.map((r) => assetDb.assets.delete(r.id)))
  console.log(`[clearXBot] removed ${rows.length} "${NAME}" row(s)`)
}
