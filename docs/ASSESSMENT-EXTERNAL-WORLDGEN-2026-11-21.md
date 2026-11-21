# ASSESSMENT — External world-gen and AI-assisted Three.js tools vs. this engine

> **Date:** 2026-11-21. **Answers:** INBOX `a7a5be01` (World Labs Atlas), `9e55a0c3` (Gessa guide), `4b1c7e2d` (Rogue Engine).
> **Read first:** [`PLAN-SCENE-CONTENT-DELIVERY-2026-10-07.md`](PLAN-SCENE-CONTENT-DELIVERY-2026-10-07.md),
> [`ASSESSMENT-R1-RELEASE-GAP-2026-09-29.md`](ASSESSMENT-R1-RELEASE-GAP-2026-09-29.md),
> [`../../docs/roadmap/01-editor-roadmap.md`](../../docs/roadmap/01-editor-roadmap.md) (Track G, Track P),
> [`../../docs/PLAN-EDITOR-PROMPT-PANEL-2026-10-07.md`](../../docs/PLAN-EDITOR-PROMPT-PANEL-2026-10-07.md).
> **Method:** public pages read on 2026-11-21 through a fetch agent, plus Rogue Engine's public docs source on GitHub
> (`BeardScript/RogueEngine`, `docs/src/`) read with `gh api`, because most of its docs site returns 404. **Nothing was
> signed up for, installed or run.** No Atlas onboarding: `atlas.worldlabs.ai/onboarding` is a shell page with an
> "ENTER" button and no content.
> **Tags:** **[obs]** = stated on a page I read (URL given once per block); **[inf]** = my inference. Quotes are kept short.
> **Constraints applied:** R1 = manual scene + narrative tool on user-supplied GLBs (D1). Image-to-3D is local-GPU only
> and uses **no paid services** (the precedent: Rodin deferred). Local hardware: GTX 1050 Ti, 4 GB VRAM.

---

## 0. Verdicts at a glance

| Item | Verdict | One line |
|---|---|---|
| **World Labs Atlas** | **Skip for R1, park with a re-entry condition (Recommended)** | Cloud-only and paid, and free-tier outputs are non-commercial and owned by World Labs. Its GLB + collider output would fit our intake, but it serves R2 (generated worlds), not R1 |
| **Gessa guide** | **Borrow two small items, skip the product (Recommended)** | The guide is a vendor overview with no prompt method. Worth taking: per-asset licence metadata, and the "prompt or direct edit, same project" loop, which Track P already has |
| **Rogue Engine** | **Skip as a tool, borrow three patterns (Recommended)** | A proprietary desktop app that cannot be embedded in `@base/ui`. Its prefab asset, ordered build scene list and shared play controller map onto open R1 rows |

---

## 1. World Labs Atlas

### 1.1 What it is

- **[obs]** "Atlas, our latest world model, turns images into 3D worlds you can explore and edit."
  (https://www.worldlabs.ai). The blog post is dated 2026-09-01 and describes "an omni model … to natively operate on text,
  images, video, and 3D" (https://www.worldlabs.ai/blog/atlas).
- **[obs]** Delivery is "via our web apps and developer API endpoints", with a Blender integration mentioned
  (blog; https://www.worldlabs.ai/atlas).
- **[obs]** The docs call Marble and the World API "legacy": "Use the endpoint names and schemas in this documentation, not
  examples for the legacy Marble or World APIs" (https://docs.atlas.worldlabs.ai/quickstart).
- **[obs, not found publicly]** The 2027-01-08 Marble / World API retirement date appears on **no public page I read**.
  Its only source is the service notice behind INBOX `6da6e942`.
- **[obs]** On 2026-09-28 World Labs "signed a definitive agreement to join AMD", with closing "expected … by the end of
  2026" (https://www.worldlabs.ai/blog/amd-announcement). The post says nothing about product or API continuity.

### 1.2 Inputs, outputs and the API (the "builds a world from renders" claim, made precise)

**[obs]** The API has six tasks, called as `POST https://api.atlas.worldlabs.ai/api/v2/tasks:<name>`, asynchronous, with
a `WLT-Api-Key` header (https://docs.atlas.worldlabs.ai/api-reference and its per-task pages):

| Task | In | Out |
|---|---|---|
| `atlasTextToImage` | prompt, aspect ratio (16:9 … 1:1), 1–4 samples | images, optional camera + depth |
| `images2PosedRGBD` | 1+ images, optional camera / depth / mask | per frame: camera pose, **linear-depth EXR**, confidence PNG |
| `atlasGenerate` | posed context frames (image + camera + depth), target cameras, prompt | new views (image + camera, optional depth) |
| `atlasChisel` | 1280×720 target frames (optional image, depth, masks), style reference image, prompt | one restyled RGB view per target |
| `posedImages2Splats` | **2 to 512 posed frames** (image + camera + depth EXR) | **Gaussian splats, `.spz`**, keyed by splat count |
| `splats2Mesh` | an `.spz`, optional cameras, `textureMode` (`image_texture` / `vertex_color` / `none`, texture 4096 by default), `colliderBoxes` | **a GLB mesh**, a **GLB of collider boxes** ("one node per box"), anchor positions |

- **[obs]** "Renders" means posed images. A render from our own editor (image + camera + depth) is a valid
  `posedImages2Splats` input. A single photo first goes through `images2PosedRGBD`
  (https://docs.atlas.worldlabs.ai/task-overview).
- **[obs]** No `.ply`, `.sog` or `.obj` appears in any task schema. There is no video task (the video skill uses
  `ffmpeg` "to turn frames into an MP4"; https://docs.atlas.worldlabs.ai/skills-and-plugins), and the API has no 360°
  panorama option, although the blog claims 360 images.
- **[obs]** Output URLs are readable "for 24 hours". Asset ids persist until deletion. Inline base64 is < 10 MiB, file
  uploads up to 1 GiB (https://docs.atlas.worldlabs.ai/assets).
- **[obs]** Inference is cloud-only. Frameboy, the real-time preview, "must run on a powerful GPU server in the cloud"
  (https://www.worldlabs.ai/blog/atlas-realtime). **No downloadable weights or local mode found.**
  **[inf]** The GTX 1050 Ti limit therefore applies only to *viewing* the outputs, never to generating them.

### 1.3 Rendering in three.js

- **[obs]** Spark (`@sparkjsdev/spark`, **MIT**, built by World Labs) is "An advanced 3D Gaussian Splatting renderer for
  THREE.js". It loads `.ply`, `.spz`, `.splat`, `.ksplat` and `.sog` and targets "98%+ WebGL2 support"
  (https://github.com/sparkjsdev/spark). Atlas's own guide renders `.spz` through Spark in React Three Fiber
  (https://docs.atlas.worldlabs.ai/rendering-with-spark).
- **[obs]** No minimum three.js version is stated. The README's CDN example pins `three@0.180.0`.
  **[inf]** Our stack is on r172 (per the content-delivery plan), so compatibility is unverified and would be the first
  check.
- **[inf]** Splat frame cost on a 4 GB, 2016-era GPU is unmeasured. The CD-M fixture would be the place to measure it.

### 1.4 Licence and price

- **[obs]** Free accounts: "World Labs retains all rights in and to any Output". Use is licensed for "personal,
  Non-Commercial Use" only (ToS §3.3(a), last updated 2026-01-21; https://www.worldlabs.ai/terms-of-service).
- **[obs]** Paid accounts "own all rights, title, and interest in and to Outputs", for "any purpose, including Commercial
  Purposes" (§3.3(b)). API outputs are commercial-use "subject to" §§2.9–2.10 (§3.3(d)).
- **[obs]** Inputs are licensed to World Labs for model training (§3.6). Paid users can opt out, free users cannot.
  Attribution ("Generated using World Labs") is owed on request (§3.7(b)). No use "to develop competitive products" or
  "competing AI models" (§2.8(d)).
- **[obs]** Billing is by credits, "1,000 credits per US dollar". The per-task rate card is shown only "in the platform",
  behind a login (https://docs.atlas.worldlabs.ai/billing). Public studio-tool prices run from 10 to 500 credits
  ($0.01–$0.50) per action. `/pricing` returns 404.
- **[obs] Sources disagree:** billing says purchased credits "do not expire". The ToS (§6.6(b)) says top-up credits
  "remain valid for one (1) year". Unresolved. It matters only if credits are ever bought.

### 1.5 Gap table: Atlas against this engine

| Our pipeline step | What Atlas would supply | Gap / conflict | Tag |
|---|---|---|---|
| **Asset intake** (F-A1..A4, R1 row 1) | a GLB room shell from `splats2Mesh` | none at the format level: GLB is our intake format | [obs] format · [inf] fit |
| **L0 GLB linter** (F-G5: named root, base pivot, scale 1) | a generated GLB of unknown structure | unknown whether it passes. The linter is warn-only at upload, so it would load either way | [inf] |
| **Content delivery** (CD-1..CD-3: draw calls, dedupe) | one large mesh with a 4096 texture by default | a single unique mesh gets nothing from CD-1's dedupe. Its texture size against 4 GB VRAM is unmeasured. `textureSize` is a parameter, so it can be lowered | [obs] param · [inf] cost |
| **Colliders** (P0-1 Stage A, CD-4) | a GLB of collider boxes | could feed `addStaticMesh` or box colliders directly. It would have to pass CD-4's solid-air/holes measure like any other collider | [obs] output · [inf] fit |
| **Splat rendering** | `.spz` | **we have no splat renderer.** It would need a Spark dependency (MIT) and a new asset kind in `scene.json` (`RoomPackageScene` has none): a schema bump | [obs] Spark · [inf] schema |
| **Room Package / static distribution** (R1 #11, #13) | assets downloaded within 24 h | any output has to be copied into our asset store at once. A link-based reference would break after a day | [obs] |
| **Image-to-3D track** (local-only, no paid services) | cloud-only, paid for commercial ownership | **conflicts with the standing constraint.** It is the same reason Rodin was deferred | [obs] terms · [stated] constraint |
| **R1 definition** (manual tool, user-supplied assets) | generated environments | **outside R1.** It is R2's "AI proposes, human calibrates" | [inf] from D1 |
| **Vendor stability** | — | Marble and its API are being retired, and World Labs is being acquired with no continuity statement. A pipeline step built on its API carries that churn | [obs] facts · [inf] risk |

### 1.6 Verdict: Atlas

**Skip for R1, park with a re-entry condition (Recommended).** Nothing in R1's 13 rows needs generated worlds, and using
it conflicts with the no-paid-services constraint. A free account gives no ownership and no commercial use.

What would make it worth a slice, in order of cheapness:
1. **Re-entry condition:** R2 work starts on generated environments, **or** the owner lifts no-paid-services for this
   one vendor. Either one comes from the owner.
2. **Then the first slice is S-sized and local:** render one public `.spz` sample through Spark in a throwaway route on
   r172, and read `renderer.info` plus frame ms on the 1050 Ti. It costs no credits and settles the two [inf] rows
   (three.js version, GPU cost) before any spend.
3. **Then one paid `splats2Mesh` run** on a room built from our own editor renders, put through F-G5 and the CD-4
   measure.

Not in scope here: whether the owner's existing Marble test account holds anything worth exporting before 2027-01-08.
That is INBOX `6da6e942` and the owner's to check.

---

## 2. Gessa.ai: "Three.js games with AI" guide

### 2.1 What the guide proposes

- **[obs]** Four steps: choose a workflow (a custom Three.js project with a coding assistant, a starter kit, a hosted
  platform, or Gessa); check rendering on the target browsers and devices, "including the rendering backend they use";
  create assets (in Gessa, or through its MCP tools plus "appropriately licensed assets"); test and share
  (https://gessa.ai/guides/three-js-games-with-ai/).
- **[obs]** The custom-project asset advice in full: "load suitable glTF/GLB models with the appropriate loader and test
  materials, scale and performance in your scene" (guide).
- **[obs]** Validation is manual play-testing: "Test the rules, assets and multiplayer behavior of the actual result
  before sharing it", and "assess the actual result rather than assuming a generated project has or lacks them" (guide).
- **[obs]** Gessa itself is a browser engine on three.js's WebGPU renderer with a WebGL2 fallback. Its loop is
  "Describe" → "Build" ("Keep refining the project through prompts or direct edits in the engine") → "Play". It has
  visual scripting, "generated code views" for inspecting what the AI wrote, and MCP tools through which "Claude Code,
  Cursor, or Codex can mint an agent workspace without human signup" (https://gessa.ai/free-ai-game-maker/).
- **[obs]** Free, including the built-in AI. The agent workspace "includes 25 standard model generations per month"
  (same page). Per the ToS, "You own" generated models, textures and images. "Library assets carry the license shown on
  the asset". "If no license is shown, you may only view the asset in Gessa" (https://gessa.ai/terms/, 2026-09-05).
- **[obs]** An existing Three.js app "is not a drop-in project import" (guide).
- **[obs, not found]** No prompt templates, context-file conventions, scene-description format, named model or automated
  validation anywhere in the guide. **[inf]** It is a product funnel, not a method.

### 2.2 Gap table: Gessa against Track P and the asset pipeline

| Gessa idea | Track P / ours today | Gap | Borrow? | Tag |
|---|---|---|---|---|
| prompts and direct edits refine the same project | PP-1: gizmo, inspector and panel all route through `editor/commands/` (shipped) | none, we already have it | — | [obs] both |
| AI output is inspectable ("generated code views") | PP-4: staged changeset with ghosts, a diff and a gate verdict per item | none. Ours is stricter, since nothing applies before an accept | — | [obs] Gessa · [obs] plan |
| manual "assess the actual result" | PP-6 `view` self-check, plus the owner's review as the only approval | none. Ours adds a deterministic veto layer Gessa does not describe | — | [obs] / [obs] |
| **MCP tools so external coding agents drive the engine** | owner decision 2026-10-07: the prompt enters through a **panel inside the editor**, not a bridge from Claude Code | a different entry point. PP-1 commands + PP-2 `describeScene` are exactly the surface an MCP server would expose | **park**: re-entry = the owner wants Claude Code to drive a running editor | [obs] Gessa · [stated] owner |
| **per-asset licence + attribution** shown on each library asset | the F-A2 asset record (`{ id, name, kind, size, contentType, blob, clipNames?, thumbnail?, createdAt, tags?[] }`) has **no licence field**. A grep for `licen[cs]e|attribution` in SHARED `packages/ui/src/editor/` on 2026-11-21 matched no files | R1 ships a distributable (#13). Assets the author did not make need their licence carried into the package | **borrow**: optional `licence?` + `attribution?` on the asset record, copied into `manifest.json` at export. S-sized, additive | [obs] Gessa · [obs] roadmap schema · [inf] need |
| check the rendering backend per target device | WebGL only. No WebGPU path | not an R1 row | skip | [inf] |
| AI-generated models / textures / audio | out of scope (R1 = user-supplied assets) | — | skip | [stated] D1 |

### 2.3 Verdict: Gessa

**Borrow two small items, skip the product (Recommended).**
1. **Borrow now (S):** licence and attribution fields on asset records, carried into the Room Package manifest. Slot it
   next to F-V1 or N4 validation, so a distributable with an unlicensed third-party asset can be flagged.
2. **Borrow as a parked option:** expose the PP-1 commands and PP-2 description over MCP. **Re-entry condition:** the
   owner asks for Claude Code to drive a running editor. Until then the in-editor panel decision stands.
3. **Skip:** the guide offers no prompt method to copy, and Gessa is a closed hosted platform that does not import
   existing three.js apps.

---

## 3. Rogue Engine

### 3.1 Editor model, formats and export

- **[obs]** "A Unity like environment to create web apps and games in three.js with no code". It runs as a desktop app
  with installers for macOS, Windows and Debian, plus a pacman package. You "Code using plain three.js on top of Rogue's
  component framework" (https://rogueengine.io/; https://docs.rogueengine.io/).
- **[obs]** Behaviour comes from **components**: TypeScript (recommended) or JS scripts attached to objects, which are
  async with a "ready state" until their referenced assets load. The no-code layer is "Visual components", described as
  "A brick-based, extendible, visual interface that feels like programming with legos"
  (`docs/src/Assets/Components.md`; rogueengine.io). **[inf]** How far visual components reach without TS is unverified,
  because their docs page returns 404.
- **[obs]** **Scenes** are `.rogueScene` files "that contain the serialization of the three.js Scene object, the
  components being used by the objects in the scene, the Skybox, and the asset configurations"
  (`docs/src/Assets/Scenes.md`).
- **[obs]** **Prefabs** are `.roguePrefab` files, made by dragging an object from the hierarchy to a folder, edited in an
  isolated "Prefab Editor", and instantiable from code by name (`Assets/Prefabs/`) (`docs/src/Assets/Prefabs.md`).
- **[obs]** **Models**: gltf, fbx, glb and drc. A scene stores "a light reference called a model stub, with a stable id",
  kept in a `.meta` uuid file beside the model, and "rehydrates" it at load (`docs/src/Assets/Models.md`).
- **[obs]** **Build**: Project Settings → a scene list, where "The first Scene on the list will be your project's initial
  Scene" → a `Build_[timestamp]` folder holding `index.html`, a `<name>_Data` folder (assets + bundled JS) and `Assets`.
  It "needs to be served through a web server" (`docs/src/Workflow/BuildingYourProject.md`). Targets named: static hosts,
  "Itch and Poki", their Rogue Play hosting (rogueengine.io). Desktop and mobile targets: not found.
- **[obs]** The play-mode **Runtime** "extends SceneController" and governs the loaded scene "whenever you press play"
  (`docs/src/EngineAPI/Runtime.md`).
- **[obs]** AI: an "AI agent and MCP server", with "AI Credits" per plan: Indie 1,000, Plus 2,000, Enterprise 12,500
  (rogueengine.io; https://rogueengine.io/GetStarted).

### 3.2 Licence and price

- **[obs]** Proprietary: "the editor, its components, and services, are proprietary software". No redistributing or
  commercialising the engine or its parts (https://rogueengine.io/EULA; FAQ). The public GitHub repo holds only docs and
  the issue tracker, with no licence file.
- **[obs]** You "own what you build", with no royalties. The engine's proprietary code ships inside your build and "must
  only be used by the created application" (EULA §3.1).
- **[obs] Sources disagree on tiers:** GetStarted says the editor is free under a personal licence when revenue or
  funding over the last 12 months is "below 80k USD", and shows Indie at $12, Plus at $20 and Enterprise at $100 per seat
  per month, billed annually. EULA §2.2 lists Personal < $80k (free), **Indie < $150k (free)**, Plus, **Pro** (not on
  GetStarted) and Enterprise. Unresolved. **[inf]** Either reading makes our use free at today's scale.
- **[obs]** On cancellation, "your files will be locked" and are "scheduled for deletion in 30 days" (FAQ).
- **[obs, not found]** No npm runtime licence could be read (npmjs returned 403), and no way to embed the runtime in an
  existing Vite/Vue app is documented.

### 3.3 Comparison with our decomposition and R1 scope

**[inf]** Our L0/L1/L2 contract (no L1→L1, context = engine handles only) is a layering rule *inside* the open `@base/ui`
editor package. Rogue is a closed application, so its internal layering cannot be compared. What can be compared is the
*author-facing* model:

| Concern | Rogue Engine | Ours (`@base/ui` + engine-dev) | Gap / note | Tag |
|---|---|---|---|---|
| Host | standalone desktop app | a web editor inside our Vue app, with IndexedDB storage (D-2) | Rogue cannot become an L2 inside `@base/ui`. Adopting it means replacing the editor | [obs] / [inf] |
| Scene file | `.rogueScene` = serialized three.js `Scene` + components + skybox | `scene.json` = our own `RoomPackageScene` (placed objects, NPCs, zones, spawn, audio). Not ObjectLoader JSON | different contracts. Ours is narrower and validated by our gates | [obs] / [obs] |
| Asset references | model stub + `.meta` uuid, rehydrated at load | logical `assetId` resolved by the registry (D-3) | **same idea, already ours.** It confirms D-3 | [obs] / [obs] |
| **Prefabs** | `.roguePrefab`, an isolated prefab editor, spawn by name | **none.** Each placement is a single asset | **gap.** A grouped, reusable placement ("table + 4 chairs") fits PP-3's attachments well | [obs] / [inf] |
| Behaviour (R1 #3 narrative, #8 interactive) | TS components, plus visual "lego" components | `Stimulus → Condition → Reaction` data (D2, D3 `@base/narrative`, N1–N4), no code by design | R1 requires **no-code** narrative. Rogue's code-first route does not meet D1 without its visual layer, whose depth is unverified | [obs] / [stated] D1 |
| **Play in editor** (R1 #10, F-LE6) | press Play. The same `Runtime`/`SceneController` that the build uses | not built. The room player (`RoomPlayerModule`) is a separate route | **borrow:** F-LE6 should host the room player's module in the editor, not a second "play simulation" | [obs] / [obs] R1 gap |
| **Multi-room ship** (R1 #11, #13, D4) | build settings: an ordered scene list, the first one initial → one static folder | single-room ZIP. Multi-room manifest and distribution undefined (D4 open) | **borrow:** an ordered scene list with an initial scene is the minimal world manifest. It is an input to D4, not a decision | [obs] / [obs] |
| Physics | via packages ("integrations for Physics Libraries"); `HitMesh` / `BVH` APIs | `@base/physics` (Rapier), not yet wired (P0-1) | not comparable without their docs | [obs] / [obs] |
| AI | in-app agent + MCP server, credit-metered | Track P: in-editor panel, bring-your-own key, staged review | ours puts an owner review in front of every change. Their review model is not documented | [obs] / [obs] |
| Licence | proprietary, runtime code embedded in builds | MIT/own code throughout | adopting it gives up owning the runtime | [obs] / [inf] |

### 3.4 Verdict: Rogue Engine

**Skip as a tool, borrow three patterns (Recommended).** It is a credible Unity-style three.js editor, but it is
proprietary, desktop-only and code-first for behaviour. It cannot sit inside `@base/ui`, so adopting it would mean
throwing away R1's 3 built and 3 partial rows.

What to borrow, each mapped to an existing slot (no new track):
1. **Shared play controller → F-LE6 / R1 #10.** In-editor play should reuse `RoomPlayerModule`, the way Rogue's
   `Runtime` is the same controller in editor and build.
2. **Ordered scene list with an initial scene → R1 #11 and decision D4.** It is the smallest multi-room manifest. Record
   it as an input when D4 is taken.
3. **Prefabs → a backlog item after PP-3.** A saved group of placements with attachments. **Re-entry condition:** the
   first scene where the same multi-object group is placed by hand more than twice.

---

## 4. What this assessment does not establish

- **Nothing was run.** No Atlas output was rendered, no Rogue build was made, no Gessa project was opened. The [inf]
  rows on three.js r172 compatibility and splat cost on the 1050 Ti are exactly what §1.6 step 2 would measure.
- **Atlas per-task prices.** The rate card sits behind a login. Only the credit conversion and the studio-tool prices are
  public.
- **Rogue's visual-component depth, physics and animation import.** Those docs pages return 404 on the site. Its GitHub
  docs source may lag the live product.
- **Gessa's prompt method.** The guide does not publish one.
- **Two source conflicts are left open:** Atlas credit expiry (billing vs ToS §6.6(b)) and Rogue's tier table
  (GetStarted vs EULA §2.2).
