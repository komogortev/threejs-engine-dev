/**
 * Dev seed — creates the "space home" scene in the local Dexie DB.
 *
 * Browser console API:
 *   window.__seedSpaceHome(opts?)   — (re)build the scene from fresh GLBs
 *   window.__clearSpaceHome()       — wipe all space-home assets + scene row
 */

import { assetDb } from '@base/ui'
import type { AssetRow, SceneRow } from '@base/ui'
import type { SavedPlacedObject } from '@base/ui'
import { genFloor, genWall, genGlassWall, genVaultCeiling, genVaultRib } from './roomMeshGen'

// ─── Tiny ID helper ───────────────────────────────────────────────────────────
const uid = (n: number) => crypto.getRandomValues(new Uint8Array(n))
  .reduce((s, b) => s + (b & 63).toString(36), '')
  .slice(0, n)

// ─── Clear (wipe all tagged assets + scene row) ───────────────────────────────

export async function clearSpaceHome(): Promise<void> {
  // Multi-entry '*tags' index — anyOf() matches rows where tags[] contains the value.
  const assets = await assetDb.assets.where('tags').anyOf(['space-home']).toArray()
  await Promise.all(assets.map(a => assetDb.assets.delete(a.id)))

  const scene = await assetDb.scenes.where('name').equals('space home').first()
  if (scene) await assetDb.scenes.delete(scene.id)

  console.log(`[clearSpaceHome] removed ${assets.length} assets + ${scene ? 1 : 0} scene row`)
}

// ─── Asset upload (always fresh — call clearSpaceHome first) ─────────────────

async function uploadAsset(piece: { name: string; blob: Blob }): Promise<string> {
  const id = `asset-${uid(21)}`
  const row: AssetRow = {
    id,
    name: piece.name,
    kind: 'environment',
    size: piece.blob.size,
    contentType: 'model/gltf-binary',
    blob: piece.blob,
    createdAt: new Date().toISOString(),
    tags: ['generated', 'architecture', 'space-home'],
  }
  await assetDb.assets.put(row)
  console.log(`[seedSpaceHome] ↑ "${piece.name}" (${(piece.blob.size / 1024).toFixed(1)} KB) → ${id}`)
  return id
}

// ─── Placed object builder ────────────────────────────────────────────────────

function placed(
  assetId: string,
  label: string,
  x: number,
  y: number,
  z: number,
  rotY = 0,
): SavedPlacedObject {
  return {
    id: `placed-${uid(6)}`,
    assetId, label, x, y, z,
    rotationX: 0, rotationY: rotY, rotationZ: 0,
    scaleX: 1, scaleY: 1, scaleZ: 1,
  }
}

// ─── Main seed ────────────────────────────────────────────────────────────────

export interface SpaceHomeOpts {
  /** Room width along X in metres. Default: 10. */
  roomW?: number
  /** Room depth along Z in metres. Default: 10. */
  roomD?: number
  /** Room height in metres. Default: 3. */
  roomH?: number
}

export async function seedSpaceHome(opts: SpaceHomeOpts = {}): Promise<void> {
  const { roomW = 10, roomD = 10, roomH = 3 } = opts

  console.log('[seedSpaceHome] clearing old space-home data…')
  await clearSpaceHome()

  const vaultRise = 2.5   // metres the barrel vault rises above the walls

  console.log(`[seedSpaceHome] generating ${roomW}×${roomD}×${roomH}m room meshes…`)

  // North wall: curved glass. S/E/W: near-white semi-transparent panels.
  // Ceiling: barrel vault + 3 arch ribs instead of a flat slab.
  const [floor, glassN, wallS, wallEW, vault, rib] = await Promise.all([
    genFloor(roomW, roomD),
    genGlassWall(roomW, roomH),
    genWall(roomW, roomH),
    genWall(roomD, roomH),
    genVaultCeiling(roomW, roomD, vaultRise),
    genVaultRib(roomW, vaultRise),
  ])

  console.log('[seedSpaceHome] uploading assets…')

  const [floorId, glassNId, wallSId, wallEWId, vaultId, ribId] = await Promise.all([
    uploadAsset(floor),
    uploadAsset(glassN),
    uploadAsset(wallS),
    uploadAsset(wallEW),
    uploadAsset(vault),
    uploadAsset(rib),
  ])

  //
  // Room layout:
  //
  //         −Z (north) ← glass wall bows outward
  //          ╔══════════╗
  //  −X      ║    rib   ║      +X   ← 3 ribs across the vault
  // (west)   ║  origin  ║   (east)
  //          ║          ║
  //          └──────────┘
  //         +Z (south)
  //
  // Vault: spring line at y=roomH, extruded from z=−hd to z=+hd.
  //   placed at (0, roomH, −hd) — extrude goes +Z to cover full depth. ✓
  //
  // Ribs: same arch shape, placed at y=roomH, at z=−hd/2, 0, +hd/2.
  //
  const P = Math.PI
  const hw = roomW / 2
  const hd = roomD / 2

  const placedObjects: SavedPlacedObject[] = [
    placed(floorId,  'floor',       0,      0,           0),
    placed(glassNId, 'wall-north',  0,      0,          -hd),
    placed(wallSId,  'wall-south',  0,      0,           hd,    P),
    placed(wallEWId, 'wall-east',   hw,     0,           0,     P / 2),
    placed(wallEWId, 'wall-west',  -hw,     0,           0,    -P / 2),
    placed(vaultId,  'vault',       0,      roomH,      -hd),
    placed(ribId,    'rib-north',   0,      roomH,      -hd / 2),
    placed(ribId,    'rib-center',  0,      roomH,       0),
    placed(ribId,    'rib-south',   0,      roomH,       hd / 2),
  ]

  const existing = await assetDb.scenes.where('name').equals('space home').first()
  const row: SceneRow = {
    id: existing?.id ?? `saved-${uid(8)}`,
    name: 'space home',
    savedAt: new Date().toISOString(),
    placedObjects,
  }
  await assetDb.scenes.put(row)

  console.log(
    `[seedSpaceHome] ✓ "space home" ready — ${placedObjects.length} objects`,
    '\n  Reload the editor and select "space home" from the scene picker.',
  )
}
