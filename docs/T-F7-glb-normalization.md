# T-F7 — GLB Model Normalization

> **Status:** Implemented 2026-06-01 — pipeline + runtime fallback shipped; integration validation pending first Rodin GLB (P3b)
> **Affects:** `@base/threejs-engine` (AssetLoader), `three-dreams/scripts/optimize-glb.sh`, shared character pipeline
> **Blocks:** Clean Tripo AI model adoption across three-dreams + three-dbox

---

## Problem

Tripo AI-generated GLBs don't align correctly inside the player bounding box. Symptoms:
- Model floats above terrain or clips through floor
- Horizontal origin offset — character appears beside its collider
- Occasional scale drift (Tripo sometimes exports in cm → 100× scale)

The player system (`PlayerController.terrainYOffset`, `character.position.y` snap) assumes:
- **Feet at local Y=0**
- **Origin centered on XZ**
- **Scale = 1** (1 unit = 1 metre)

Tripo GLBs violate all three. Mixamo FBX/GLBs and hand-authored Blender exports are generally clean.

**Current workaround (three-dbox):** Uses original non-Tripo mesh. Not a fix.

---

## Root Cause Analysis

### Cross-pipeline insight (gmod-model-pipeline Iter 3)

The bone orientation problem in gmod was structurally identical:
- Tripo FBX bones don't match Valve Biped rest-pose convention → twisted limbs in-game
- **Fix pattern:** measure actual rest pose from authoritative reference (m_anm.mdl binary), compute correction, apply at export

The same pattern applies to T-F7:
- Tripo GLB origin doesn't match player-three convention
- **Fix pattern:** measure actual bounding box at export time, compute floor/center correction, apply in pipeline

Key principle from gmod: **fix in the parent frame, not per child**. Correct at the root `Object3D` or at export, not by offsetting individual `SkinnedMesh` children.

---

## Design — Two-Layer Fix

### Layer 1: Pipeline (primary fix — zero runtime cost)

`gltf-transform` includes a `center` function with a `bottom` pivot mode. This is the direct equivalent of Blender's "Set Origin to Bottom of Bounding Box":

```bash
# Add to optimize-glb.sh — run before meshopt compression
npx @gltf-transform/cli center "$INPUT" "$INTERMEDIATE" --pivot bottom
# then compress:
npx @gltf-transform/cli optimize "$INTERMEDIATE" "$OUTPUT" ...
```

The `--pivot bottom` flag:
- Snaps bounding box floor to Y=0 (feet at origin)
- Centers mesh on XZ
- Does not alter scale

**Scale drift** is a separate concern — detect via bounding box height heuristic (human character ≈ 1.5–2.0 m; if height > 5 m, likely cm export). Correction: add `--scale` normalization or a preflight check that warns.

**Implementation file:** `three-dreams/scripts/optimize-glb.sh` (also copy to `three-dbox/scripts/` once that project has one)

### Layer 2: Runtime fallback (safety net for non-pipeline imports)

In `@base/threejs-engine/AssetLoader.ts`, add an optional `normalizeOrigin: boolean` flag on character load. After the GLB loads, before handing to `CharacterAnimationRig`:

```ts
// Compute bounding box of the loaded scene
const box = new THREE.Box3().setFromObject(loadedScene)

const floorOffset  = -box.min.y                        // shift feet to Y=0
const centerX      = -(box.min.x + box.max.x) / 2     // center XZ
const centerZ      = -(box.min.z + box.max.z) / 2

// Wrap in a corrective pivot group
const pivot = new THREE.Group()
pivot.add(loadedScene)
loadedScene.position.set(centerX, floorOffset, centerZ)

// `pivot` becomes the locomotionRoot; terrainYOffset stays 0 (feet-pivot convention)
```

This mirrors the gmod "chain bridging" pattern — wrap the non-conformant hierarchy in a frame-corrected parent rather than patching individual children.

**Scale normalization** (optional, if scale drift is detected):
```ts
const height = box.max.y - box.min.y
if (height > 5 || height < 0.5) {
  const targetHeight = 1.75  // expected human height
  const scaleFactor = targetHeight / height
  loadedScene.scale.setScalar(scaleFactor)
  console.warn(`[AssetLoader] GLB height=${height.toFixed(2)}m — auto-scaled ×${scaleFactor.toFixed(3)}`)
}
```

---

## Implementation Checklist

### Phase A — Pipeline fix (unblocks Tripo adoption immediately)

- [x] **A1** Add `center --pivot bottom` pass to `optimize-glb.sh` (two-pass: center → optimize) — 2026-06-01
- [ ] **A2** Re-optimize existing character GLBs (deferred — no Tripo GLBs in project yet; run when first Rodin GLB arrives)
- [ ] **A3** Verify in three-dreams: Rodin character aligns correctly (pending P3b)
- [ ] **A4** Verify in three-dbox: dfist_base.glb (if Tripo-sourced) aligns correctly (pending)

### Phase B — Runtime fallback in AssetLoader

- [x] **B1** Add `normalizeGLTFOrigin(scene: THREE.Group): THREE.Group` to `@base/threejs-engine/AssetLoader.ts` — 2026-06-01
- [x] **B2** Implement pivot-wrap + floor-snap logic (Box3 approach) — 2026-06-01
- [x] **B3** Add scale-drift detection + warning log (height > 5 || < 0.5) — 2026-06-01
- [ ] **B4** Unit test (no test infrastructure in package — skip unless regression found)
- [x] **B5** Rebuild `@base/threejs-engine` + `threejs-engine-dev` — both clean 2026-06-01

### Phase C — Integration validation

- [ ] **C1** Load a raw (pre-pipeline) Tripo GLB with `normalizeOrigin: true` — confirm it lands feet-grounded
- [ ] **C2** Confirm `terrainYOffset: 0` (feet-pivot) is used, not PLAYER_CAPSULE_HALF_HEIGHT
- [ ] **C3** Confirm animations still play (pivot wrapper must not break `AnimationMixer` root resolution)
- [ ] **C4** Update `optimize-glb.sh` usage docs / README to note the `center` step

---

## Convention to Establish

Document in `SHARED/packages/player-three/` or harness `docs/`:

> **GLB character convention:** Feet at local Y=0, origin at XZ center, scale = 1 (1 unit = 1 m), forward = -Z. All characters loaded via `AssetLoader` are expected to follow this convention. The pipeline (`optimize-glb.sh`) enforces it. `normalizeOrigin: true` is a developer convenience fallback only.

---

## Related

- `SHARED/packages/player-three/PlayerController.ts` — `terrainYOffset`, `setTerrainYOffset()`
- `SHARED/packages/threejs-engine/src/AssetLoader.ts` — load site for the fix
- `three-dreams/scripts/optimize-glb.sh` — pipeline fix target
- `TOOLS/gmod-model-pipeline/` — source of the "measure + correct in parent frame" pattern
- Memory: `project_glb_normalization_bug.md`
