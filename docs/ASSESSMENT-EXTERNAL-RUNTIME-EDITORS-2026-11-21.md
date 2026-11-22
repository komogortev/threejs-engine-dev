# ASSESSMENT — External Three.js runtimes and browser editors vs. this engine

> **Date:** 2026-11-21. **Answers (progress, not closes):** INBOX `3e1f0b7a` (mindblown teleoperator +
> hh-hang/three-player-controller), `8d2c4f19` (Paper World), `6b8e2a54` (Awaken). The owner closes lines.
> **Companion:** [`ASSESSMENT-EXTERNAL-WORLDGEN-2026-11-21.md`](ASSESSMENT-EXTERNAL-WORLDGEN-2026-11-21.md) covers
> World Labs Atlas, the Gessa guide and Rogue Engine (INBOX `a7a5be01`, `9e55a0c3`, `4b1c7e2d`, closed via #47/#48).
> Not repeated here; its borrow items are referenced where they meet a gap row.
> **Read first:** [`ASSESSMENT-R1-RELEASE-GAP-2026-09-29.md`](ASSESSMENT-R1-RELEASE-GAP-2026-09-29.md) §4 (rows 1–13),
> [`PLAN-SCENE-CONTENT-DELIVERY-2026-10-07.md`](PLAN-SCENE-CONTENT-DELIVERY-2026-10-07.md) (CD-0…CD-6, CD-M),
> [`../../docs/PLAN-EDITOR-PROMPT-PANEL-2026-10-07.md`](../../docs/PLAN-EDITOR-PROMPT-PANEL-2026-10-07.md).
> **Method:** a read-only research agent read the public pages and, where public, source on 2026-11-21; the parent
> session verified git-state claims; this session re-verified every code claim against the files (file:line below).
> **Nothing was installed, signed up for or run. No `renderer.info` was measured** (see open decision 4).
> **Tags:** **[obs <url>]** = stated on a page or in public source read 2026-11-21 · **[inf]** = inference ·
> **[code file:line]** = verified in this workspace on 2026-11-21 (SHARED `main` 0c12b80, three-dbox `main` 7e6f511,
> engine-dev `origin/main` 87dcf20).

> **Flag (not fixed here):** the companion doc was merged twice — #43 (`d35cd22`, adds the file) and #46 (`ccc9a76`,
> same title, an empty diff on `main`). Both commits are on `origin/main`; history only, no content duplication.

---

## 0. Verdicts at a glance

| Item | Verdict | One line |
|---|---|---|
| **mindblown teleoperator** | **Ideas only (Recommended)** | No public source or licence found [inf proprietary]. The per-device quality tier with a crash-fallback "safe" tier is the idea worth taking |
| **hh-hang/three-player-controller** | **Borrow the design for a dbox vehicle slice; do not adopt the dependency (Recommended)** | MIT, but its physics is `three-mesh-bvh` + its own body system, not Rapier — adopting it adds a second collision authority |
| **Paper World** | **Ideas only, no code (Recommended)** | No licence. Smoothness comes mostly from cheap primitive assets + instancing; supports keeping CD-3 conditional on CD-M |
| **Awaken** | **Borrow the export shape as the D4 candidate (Recommended — top pick)** | One-file `game.html` + compressed scene file is a concrete shape for row 13 distribution, which is currently undefined |

---

## 1. mindblown teleoperator (`3e1f0b7a`)

[obs https://teleoperator.mindblown.ai/?car=roadster]
- The game runs in an iframe that loads **three.js 0.185.1**.
- **Per-device quality tier** `saver < mobile < perf < high < ultra`, scaling city radius, textures, shadows and
  traffic. After a **crashed start** it falls back to the lightest **"safe"** tier; `?tier=safe` forces it.
- Driving on gamepad / keyboard / touch; steering sensitivity, driver assist, several camera views, 5 cars,
  a traffic toggle.
- No public repository or licence found → **[inf] proprietary → ideas only.**

**Borrow:** the tier ladder and, specifically, the *crash-remembering fallback* (a start that died once comes up on
the safe tier next time). We have nothing equivalent — see §5 row "Runtime quality tier".

### 1.1 hh-hang/three-player-controller (part of `3e1f0b7a`)

[obs https://github.com/hh-hang/three-player-controller] MIT, npm `three-player-controller`.
- **Physics: `three-mesh-bvh` + its own `DynamicBodySystem` — NOT Rapier.** *Premise correction:* the INBOX line
  says "with Rapier"; that is wrong.
- Walk / run / jump / fly; vehicles with suspension, steering, grip, handbrake; `toggleVehicle` on **E**; spring
  camera with obstacle avoidance; custom keys; mobile joystick; foot-IK and route plugins.

**Verdict:** borrow the *design* (enter/exit toggle, vehicle parameter set, spring camera) for a three-dbox vehicle
slice; **do not take it as a dependency.** Its BVH physics would be a second collision authority beside Rapier KCC —
the exact two-writer failure dbox already hit in EX-2, where player Y was co-written by `MeshTerrainSampler` and the
Rapier sphere lift until KCC was adopted as the single resolver [code `three-dbox/STATE.md:116`].

---

## 2. Paper World (`8d2c4f19`)

[obs https://github.com/aadil6971/PaperWorld, live https://aadil6971.github.io/PaperWorld] **No licence →
ideas only, no code copied.**
- One `index.html`, three **0.170.0**, **no GLTFLoader** — everything is primitives.
- **8 `InstancedMesh` uses**, including an outline mesh that shares the body's `instanceMatrix`; instanced
  traffic and pedestrians.
- **Distance-sorted chunk ring** with seeded per-chunk generation.
- `MeshToonMaterial`.
- Quality presets: view radius, fog, shadow-map size, traffic density.
- **autoRes:** lowers `pixelRatio` below 42 fps, raises it above 57.
- No `THREE.LOD`, no physics library.
- **`renderer.info` NOT measured** — the INBOX asked for draw calls / triangles / frame time; that is still owed.

**Takeaway [inf]:** the smoothness is largely cheap assets (primitives, toon shading, no textures to stream) plus
instancing — consistent with dbox EX-1, where the lag driver was a 960K-tri mesh, not draw calls
[code `three-dbox/STATE.md:120`]. **Keep CD-3 (runtime batching) conditional on CD-M**, as the plan already says
[code `docs/PLAN-SCENE-CONTENT-DELIVERY-2026-10-07.md:44`, `:65`]. The autoRes hysteresis (42/57) is a concrete
starting point for the tier slice in §5.

---

## 3. Awaken (`6b8e2a54`)

[obs https://editor.awaken3d.dev]
- "Entirely in your browser on WebGPU, no install, no login, free".
- Raw WebGPU/WGSL; no three.js marker found → **[inf] its own renderer**, so nothing to share at code level.
- Rapier (wasm) physics; Monaco editor for scripts; templates incl. **Empty** and **Third Person Walk**.
- **Export = `game.html` + compressed `scene.fg`**; a mobile export with an Android release key.
- No repository or licence found.
- **Not verified:** in-game input rebinding (listed on its welcome page per the INBOX line; not confirmed working).

**Borrow (top pick):** the export shape — one self-contained HTML runtime plus one compressed scene file — as the
**candidate for decision D4** (how an author ships), which today is undefined. Secondary: template-first start
(Empty / Third Person Walk).

---

## 4. Version note

We are on **three r172** [code `package.json:24`; `three-dbox/package.json:24`; SHARED packages devDep `^0.172.0`,
peer `>=0.160.0`, e.g. `SHARED/packages/physics/package.json:23,27`]. The tools above assume 0.170 (Paper World) to
0.185 (teleoperator). Borrowing ideas is version-free; borrowing code from the 0.18x tools would need a bump check.

---

## 5. Gap matrix

Rows map to [`ASSESSMENT-R1-RELEASE-GAP-2026-09-29.md`](ASSESSMENT-R1-RELEASE-GAP-2026-09-29.md) §4 (rows ~:46–58)
and the CD slices. Status as of 2026-11-21.

| Gap | R1 row / slice | Our state | External reference | Proposal |
|---|---|---|---|---|
| **Vehicles** | none (not an R1 row) | **None.** `grep -riE "vehicle\|wheel"` over engine-dev `src/`, `three-dbox/src/`, `SHARED/packages/*/src/` = 0 hits (positive control: same grep path set finds Rapier in 3 dbox files) [code]. *Premise correction:* "three-dbox walk + drive" — **dbox drive does not exist** | three-player-controller (design), teleoperator (controls/assist) | dbox vehicle slice, **not R1** (open decision 2) |
| **Runtime quality tier / adaptive resolution** | no CD slice | No tier system. Only dbox's static `min(dpr,2)` pixel-ratio cap [code `three-dbox/STATE.md:120`]; CD plan has no tier/autoRes slice [code: no match in `PLAN-SCENE-CONTENT-DELIVERY-2026-10-07.md`] | teleoperator tier ladder + crash fallback; Paper World presets + autoRes 42/57 | **Candidate new CD slice after CD-M, sized by CD-M** [code CD-M at `PLAN-SCENE-CONTENT-DELIVERY-2026-10-07.md:41`]; gated on open decision 3 |
| **Distribution** | row 13 (❌, D4 undefined, "L, unbounded") [code `ASSESSMENT-R1-RELEASE-GAP-2026-09-29.md:58`] | No design for how an author ships | Awaken `game.html` + compressed `scene.fg` | **Candidate shape for D4** (open decision 1) |
| **Validation gate** | row 12 (🟡) [code `:57`] | F-G5 lint live; no licence metadata | Gessa idea (companion doc §2) | per-asset `licence?` / `attribution?` fields |
| **Author loop / play** | row 10 (❌) [code `:55`] | No in-editor play (C-7) | Rogue shared play controller (companion doc §3); Awaken Play mode | shared play controller reusing `RoomPlayerModule` [code `src/modules/RoomPlayerModule.ts:24`] |
| **Templates** | row 10 (author loop) | None | Awaken Empty / Third Person Walk | template-first new-scene start; small, after play mode |
| **Input rebinding** | — | `InputModule` takes `bindings` once as a `private readonly` constructor parameter and hands them to providers at mount; **no runtime rebind API** [code `SHARED/packages/input/src/InputModule.ts:63-66`, `:79`, `:82`] | Awaken (listed, not verified) | rebind API in `@base/input` — park until a consumer needs it |

---

## 6. Open owner decisions

None of these is decided. Each carries a recommendation.

1. **One-file HTML + scene file as the D4 candidate.** *(Recommended: yes, as a candidate — not a commitment.)*
2. **Vehicles: a three-dbox slice, not R1.** *(Recommended.)* Borrow three-player-controller's design, keep Rapier
   KCC the single collision authority.
3. **Low-end / mobile as an R1 target.** Owner's call — no recommendation from evidence. It gates whether the
   quality-tier CD slice enters R1 or waits.
4. **Measure Paper World / teleoperator `renderer.info`** (draw calls, triangles, frame ms) with a *visible* browser
   pane (a hidden pane suspends rAF, see `PLAN-SCENE-CONTENT-DELIVERY-2026-10-07.md:56`). *(Recommended: later —
   re-entry when CD-M runs, so both sides are measured with the same script.)*
