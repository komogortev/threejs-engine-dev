import type {
  SceneDescriptor,
  PlacedObject,
  GltfObject,
  ScatterField,
} from '@/scene/SceneDescriptor'

export type EditorObject = PlacedObject | GltfObject

// ─── Objects-only export ──────────────────────────────────────────────────────

/**
 * Serializes a PlacedObject / GltfObject array to a formatted TypeScript literal.
 *
 * Output is human-readable, not JSON:
 *   - Keys are unquoted
 *   - Strings use single quotes
 *   - Numbers rounded to 2 decimal places
 *   - Padded columns for visual scanning
 *
 * @example
 * [
 *   { type: 'rock',  x:  -8.34, z:   5.21, scale: 1.00, rotationY: 0.80 },
 *   { type: 'gltf',  url: '/models/tree.glb', x:  12.00, z:  -3.15, scale: 1.20, rotationY: 1.47 },
 * ]
 */
export function serializeObjects(objects: EditorObject[]): string {
  if (objects.length === 0) return '[]'

  const lines = objects.map((o) => {
    if (o.type === 'gltf') {
      const g = o as GltfObject
      return `  { type: 'gltf', url: '${g.url}', x: ${fmt(g.x)}, z: ${fmt(g.z)}, scale: ${fmt(g.scale ?? 1)}, rotationY: ${fmt(g.rotationY ?? 0)} },`
    }
    const p    = o as PlacedObject
    const type = p.type.padEnd(7)
    return `  { type: '${type}', x: ${fmt(p.x)}, z: ${fmt(p.z)}, scale: ${fmt(p.scale ?? 1)}, rotationY: ${fmt(p.rotationY ?? 0)} },`
  })

  return `[\n${lines.join('\n')}\n]`
}

/** Copy the editor's objects[] to clipboard. Returns true on success. */
export async function copyObjectsToClipboard(objects: EditorObject[]): Promise<boolean> {
  return writeClipboard(serializeObjects(objects))
}

// ─── Full descriptor export ───────────────────────────────────────────────────

/**
 * Serializes the complete `SceneDescriptor` as a standalone TypeScript module.
 *
 * Merges:
 *   - terrain, atmosphere, character from `base`
 *   - scatter fields from `base.objects`
 *   - interactively-placed objects from `editorObjects`
 *
 * Color-keyed number fields (anything with "color" in the name) are output
 * as hex literals (0x1c2e1a) rather than plain decimals.
 *
 * Paste the output into a new `src/scenes/<name>.ts` file.
 */
/**
 * @param scatterFieldsOverride — When set (e.g. from the editor), used instead of
 *   scatter entries still present in `base.objects`. Keeps export in sync with
 *   live seed / count / radius edits.
 */
export function serializeDescriptor(
  base: SceneDescriptor,
  editorObjects: EditorObject[],
  scatterFieldsOverride?: ScatterField[],
): string {
  const scatterFields =
    scatterFieldsOverride ??
    ((base.objects ?? []).filter((o) => o.type === 'scatter') as ScatterField[])
  const allObjects = [...scatterFields, ...editorObjects]

  const merged: SceneDescriptor = { ...base, objects: allObjects.length > 0 ? allObjects : undefined }

  return [
    `import type { SceneDescriptor } from '@/scene/SceneDescriptor'\n`,
    `export const scene: SceneDescriptor = ${tsLiteral(merged, 0)}`,
  ].join('\n')
}

/** Copy the full scene descriptor to clipboard. Returns true on success. */
export async function copyDescriptorToClipboard(
  base: SceneDescriptor,
  editorObjects: EditorObject[],
  scatterFieldsOverride?: ScatterField[],
): Promise<boolean> {
  return writeClipboard(serializeDescriptor(base, editorObjects, scatterFieldsOverride))
}

// ─── TypeScript literal serializer ───────────────────────────────────────────

/**
 * Known keys whose numeric values should be emitted as 0xRRGGBB hex literals.
 * Matched case-insensitively anywhere in the key name.
 */
const COLOR_KEYS = /color/i

function tsLiteral(value: unknown, depth = 0, key?: string): string {
  const pad  = '  '.repeat(depth)
  const pad1 = '  '.repeat(depth + 1)

  if (value === null || value === undefined) return 'undefined'

  if (typeof value === 'boolean') return String(value)

  if (typeof value === 'number') {
    // Hex color: key contains "color", integer, fits 0x000000–0xffffff
    if (key && COLOR_KEYS.test(key) && Number.isInteger(value) && value >= 0 && value <= 0xffffff) {
      return `0x${value.toString(16).padStart(6, '0')}`
    }
    // Clean up floating-point noise
    if (!Number.isInteger(value)) {
      const s = value.toFixed(4)
      return s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
    }
    return String(value)
  }

  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    // Short flat arrays inline
    const allPrimitive = value.every((v) => typeof v !== 'object' || v === null)
    if (allPrimitive && value.length <= 8) {
      return `[${value.map((v) => tsLiteral(v, 0)).join(', ')}]`
    }
    const items = value.map((v) => `${pad1}${tsLiteral(v, depth + 1)}`).join(',\n')
    return `[\n${items},\n${pad}]`
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
    if (entries.length === 0) return '{}'
    const lines = entries.map(([k, v]) => `${pad1}${k}: ${tsLiteral(v, depth + 1, k)}`)
    return `{\n${lines.join(',\n')},\n${pad}}`
  }

  return String(value)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a number to 2dp, right-aligned in 7 chars. */
function fmt(n: number): string {
  return n.toFixed(2).padStart(7)
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
