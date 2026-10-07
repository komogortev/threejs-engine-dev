# PLAN — Scene content delivery: a build stage between the authored scene and the runtime

> **Date:** 2026-10-07. **Status:** queued, no code. Slotted into the R1 order
> ([`ASSESSMENT-R1-RELEASE-GAP-2026-09-29.md`](ASSESSMENT-R1-RELEASE-GAP-2026-09-29.md) §8).
> **Source:** a read of [webdevcody/survive-the-night-fps](https://github.com/webdevcody/survive-the-night-fps) at `ee173eb`
> (MIT, read 2026-10-07) and our own load paths. **Nothing was run on either side.** Their figures are from their
> `docs/performance.md` (RTX 3070), not reproduced here. Our gaps are read from the code, with file and line.

## 1. Why: the same scene, delivered in two different ways

The project is orthogonal to ours: a multiplayer survival FPS with no editor and no model files. Every model is
three.js code, and every world is built from a seed. Its value to us is **structural**. It keeps 60 fps with about 80
animated characters and a city of props on screen because the runtime never sees the world as one object per
placement. Owner framing, 2026-10-07: a different structural approach to content delivery that sustains performance in
a rich, object-filled scene.

| | Their pipeline | Ours today |
|---|---|---|
| Unit the runtime holds | **one mesh per material for the whole world**: every chunk's triangles are a run of one vertex buffer, drawn in one `WEBGL_multi_draw` call (`client/render/multimesh.js`, 182 lines, only `three`) | **one Object3D tree per placement**, exactly as authored (`RoomPlayerModule.ts:139-157`) |
| Repeats | one instanced call per body type; the bones of all characters are rows of one float texture (`client/render/crowd.js`, 290 lines) | parsed again per placement: no GLTF cache (`AssetLoader.ts:79` says "cache the clone, not the original", and nothing does) |
| Shader programs | all compiled behind the splash; rule: `renderer.info.programs.length` never grows in play (`Game.prewarm`) | compiled on first draw, on the main thread. There are no `renderer.compile` / `compileAsync` calls in SHARED or engine-dev `src` |
| Colliders | derived from what is drawn, held to it by a measure (`scripts/hitbox/`: "solid air" vs "holes", in metres) | none (P0-1). Stage A plans one trimesh per placed root |
| Cost grows with | materials and body types in view | **number of placements** |

**The principle we take (not their code):** what the editor needs (one selectable, movable object per placement) and
what the runtime needs (few draw calls, shared GPU data, warm shaders, colliders) are different representations. Today
the runtime receives the editor's representation unchanged. Put a **scene build stage** between them, so the editor
stays per-object and only the runtime is batched.

What we do **not** take: procedural content in place of GLBs (R1 is a tool for user-supplied assets), their
box-and-cylinder collision (we chose Rapier), their networking, and their file shape (58 files over 600 lines).

## 2. Slices

Placement follows the SHARED-first rule. The build stage is reusable engine runtime, so it goes in
`@base/threejs-engine` and RoomPlayer and Sandbox consume it. Today they hold two copies of the same load loop.

| Id | What | Where | Size | Acceptance |
|---|---|---|---|---|
| **CD-0** | Sandbox uses `createEditorGltfLoader()`. `SandboxSceneModule.ts:73` is a plain `new GLTFLoader()`, so a Draco or Meshopt GLB is skipped with a console warning: it shows in the editor and the room but **not in Sandbox** | engine-dev | XS | a decimated character placed in a saved scene appears in Sandbox |
| **CD-M** | **Measure first.** A rich fixture scene (proposal: ~200 placements of ~10 assets + 5 NPCs, built by a dev hook in the style of `__seedSpaceHome`) and a script that records load ms, draw calls, triangles, `programs.length` and frame ms from `renderer.info` | engine-dev | S | the baseline table exists before CD-1 lands. Every later slice reports against it |
| **CD-1** | **Load once per `assetId`, clone per placement** (`SkeletonUtils.clone` for skinned). Loads run concurrently with a bound, not one `await` at a time. One shared `loadPlacedObjects` replaces the two copies. Dispose by shared reference count, not per clone | `@base/threejs-engine` → RoomPlayer + Sandbox | S–M | fixture: parses = distinct assets, not placements. Load ms down. Unmount frees GPU memory (remount-hygiene rule) |
| **CD-2** | **Shader warm-up** after `loadRoom()`, before reveal: `renderer.compileAsync(scene, camera)` plus one hidden frame | `@base/threejs-engine` | S | test: `programs.length` after the first visible frame equals the count after warm-up. Known positive first: remove the warm-up and the test must fail |
| **CD-3** | **Batch statics at runtime only.** Repeated static (unskinned, unanimated) props become one `InstancedMesh` per (geometry, material). Unique statics are merged by material (`BatchedMesh` is in three r172). The editor is untouched | `@base/threejs-engine` | M | runs only if CD-M shows the fixture is **draw-call bound**. The `perf:visual` idea applies: before/after screenshots of the fixture, diffed |
| **CD-4** | **Colliders from the build stage.** P0-1's `addStaticMesh` per placed root reuses the CD-1 dedupe (one extracted trimesh per asset, transformed per placement). Rebuild their solid-air/holes measure in TS against Rapier colliders as P0-1's acceptance check | with P0-1 Stage A; measure in `@base/ui` `editor/gate/` next to the L0 linter (its deferred "collider intent" check) | M | P0-1's done criteria plus a measure report with no hole deeper than an agreed threshold on the space-home rooms |

**Parked:**
- **CD-5**, the crowd bone texture for NPCs. Re-entry condition: a scene with ≥ 20 animated NPCs on one asset, and
  CD-M shows NPC draw calls dominating.
- **CD-6**, baking the build stage into the Room Package at export (a format change and schema bump). Re-entry
  condition: CD-1 to CD-3 load time on the fixture still over budget.

## 3. Budget, stated at design time

- Their rule of thumb: a draw call costs about as much as 1,000 triangles. It is **unverified for our hardware**, so
  CD-M settles it. Machine limits: the GTX 1050 Ti is headless, and the hidden Browser pane suspends rAF (frame ms
  needs a visible pane or the headless GPU).
- CD-1's break-even is any asset placed twice. CD-3's break-even is set by CD-M, not by this document.
- The editor's per-object path keeps its current cost. That is accepted, because authoring scenes are what the owner
  edits, not what ships.

## 4. Sequencing in R1

`CD-0` any time (XS, independent) → R1 step 1 **P0-2** → **CD-M → CD-1 → CD-2** → R1 step 2 **P0-1** with **CD-4** →
R1 step 3 owner visual + feel pass (now on a measured, warmed scene) → **CD-3 only if CD-M says draw-call bound**.

Why before P0-1: Stage A calls `addStaticMesh` per placed root, so the dedupe CD-1 builds is the dedupe its colliders
want. Doing it after would mean writing the collider loop twice.

## 5. What this plan does not establish

- That we are slow today. No scene of ours has been measured for draw calls or load time. CD-M exists to find out,
  and CD-3 is conditional on what it shows.
- Anything about their runtime behaviour. It is a source read of their code and documents.
- That their environment note applies to us. Their `CLAUDE.md` reports that headless Chromium tries an empty-password
  Windows sign-in for each new profile, which locked an account out. None of our repos depend on puppeteer or
  playwright today. If CD-M ever adds a headless-Chrome runner on this Windows machine, that note applies first.
