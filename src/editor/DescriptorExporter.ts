import type { PlacedObject } from '@/scene/SceneDescriptor'

/**
 * Serializes a PlacedObject array to a formatted TypeScript object-literal string.
 *
 * Output is intentionally human-readable, not JSON:
 *   - Keys are unquoted
 *   - Single-quoted string values
 *   - Numbers rounded to 2 decimal places
 *   - Padded columns for easy visual scanning
 *
 * Paste the result into SceneDescriptor.objects alongside your ScatterField entries.
 *
 * @example
 * // output:
 * [
 *   { type: 'rock',  x:  -8.34, z:   5.21, scale: 1.00, rotationY: 0.80 },
 *   { type: 'tree',  x:  12.00, z:  -3.15, scale: 1.20, rotationY: 1.47 },
 * ]
 */
export function serializeObjects(objects: PlacedObject[]): string {
  if (objects.length === 0) return '[]'

  const lines = objects.map((o) => {
    const type      = o.type.padEnd(7)
    const x         = fmt(o.x)
    const z         = fmt(o.z)
    const scale     = fmt(o.scale     ?? 1)
    const rotationY = fmt(o.rotationY ?? 0)
    return `  { type: '${type}', x: ${x}, z: ${z}, scale: ${scale}, rotationY: ${rotationY} },`
  })

  return `[\n${lines.join('\n')}\n]`
}

/** Copy serialized objects to the clipboard. Returns true on success. */
export async function copyObjectsToClipboard(objects: PlacedObject[]): Promise<boolean> {
  const text = serializeObjects(objects)
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a number with sign padding and 2 decimal places, right-aligned in 7 chars. */
function fmt(n: number): string {
  const s = n.toFixed(2)
  // pad to width 7: sign + up to 3 integer digits + dot + 2 decimals
  return s.padStart(7)
}
