# PLAN — Room player P0s: collision (P0-1) + zone runtime (P0-2)

> **Date:** 2026-09-11. **Source register:** [`INVENTORY-SCENE-AUTHORING-2026-09-04.md`](INVENTORY-SCENE-AUTHORING-2026-09-04.md) §3.
> **Method:** source read against `main` (engine-dev `414cd91`, SHARED `origin/main`), the dbox nav-resolver plan, the
> rapier.js changelog, and the installed package on disk. **Nothing below has been run yet.** Claims marked
> *(inference)* are reasoned, not observed.

---

## 0. Two corrections to the register

1. **P0-2 is cheaper than recorded.** `GameplaySceneModule` already has a complete exit-zone runtime: dwell accumulator,
   ground rings, and an emit of `game:request-scene-change` (`GameplaySceneModule.ts:750-774`). What's missing:
   - it reads `cfg.exitZones`, which is fixed at construction, while a room's zones arrive in `loadRoom()`;
   - **nothing in engine-dev subscribes to the event**, so it goes nowhere;
   - `RoomPlayerView.switchToScene()` (`RoomPlayerView.vue:77`) already does unload → `loadRoomFromDb` → load.
2. **P0-1: "add `@base/physics`" is necessary but not the design.** The risk is the architecture around it, not the
   dependency (§2.3).

---

## 1. P0-2 — zone runtime

### 1.1 Tasks

| # | Task | File | Notes |
|---|---|---|---|
| 2a | Protected `setExitZones(zones)`: assign, size `_exitZoneDwell`, reset `_exitTriggered`, **track ring meshes** and dispose the old set | `GameplaySceneModule.ts` | Rings are added in `onMount()` today and never tracked or disposed (same class as the remount-hygiene rule) |
| 2b | `loadRoom()` maps `zones.filter(z => z.type === 'exit' && z.targetSceneId)` → `{ x, z, radius, targetSceneId, ringColor: z.color }`; `unloadRoom()` clears | `RoomPlayerModule.ts` | Call **after** the sampler is set (P0-1) so rings sit on the real floor |
| 2c | Subscribe to `game:request-scene-change` → `switchToScene(id)`; unsubscribe in `exitRoom()` | `RoomPlayerView.vue` | |
| 2d | **Re-arm on leave, not on load.** After a transition, the zone stays disarmed until the player has left every zone once | `GameplaySceneModule.ts` | Without it, a spawn point inside the target room's own exit zone bounces the player back after 1.2 s of standing still |
| 2e | Failure path: an unknown `targetSceneId` → `console.warn` + re-arm on leave | `RoomPlayerView.vue` | Today `_exitTriggered` would stay `true` and the zone goes permanently dead with no feedback |

### 1.2 Out of scope, stated

- **Proximity zones fire nothing.** There is no action for them to take; that is P1-3 (schema). Optional: emit
  `room:zone-enter` / `room:zone-leave` so P1-3 becomes a subscriber. Nothing consumes those yet.
- **`targetSceneId` is free text** in the Inspector. Export-time validation against the `scenes` table is a SHARED
  follow-on, not P0.
- **A dropped ZIP can only exit to scenes in this browser's IndexedDB.** Dexie is per browser profile.

### 1.3 Done when

- Scene A → exit → scene B, then **B → exit → A** (proves 2a's reset).
- Negative controls: a zone with no `targetSceneId` is skipped; spawning inside an exit zone does not bounce.
- Unknown target: warning logged, zone works again after the player walks out and back in.

---

## 2. P0-1 — collision

### 2.1 Rapier capability assessment

`@dimforge/rapier3d-compat` **0.14.0** installed (Jul 2024); **0.20.0** latest. The compat build inlines the WASM as
base64: `rapier.es.js` is **2.06 MB** raw on disk (the `.wasm` alone is 1.44 MB).

| Rapier capability | Wrapped in `@base/physics` today | Room use | Verdict |
|---|---|---|---|
| **Static trimesh colliders** (fixed body) | `addStaticMesh(root)`: merges one root into one world-space trimesh | One call per placed prop root | **Use (P0-1)** |
| **Kinematic character controller** (collide-and-slide, autostep, snap-to-ground, slope climb/slide, grounded) | `CharacterMover`, S0 ✅ 22/22 + 6/6 headless | Wall blocking + slide | **Use (P0-1)**, first live integration anywhere (§2.3) |
| **Ray cast** with max distance | `castRayDown(x, z, fromY)` | Height-aware ground sample (§2.2) | **Use (P0-1)** |
| Shape cast (swept sphere) | `shapeCastSphere` | Anti-tunnelling is subsumed by the KCC (swept by construction) | Not needed |
| Point projection / shape overlap | `spherePenetration` | Not needed once the KCC resolves walls | Not needed |
| **Collision groups / query filters** (16-bit membership + filter, exclude-collider, predicate) | **not wrapped** | Keep the player capsule out of ground rays; mark props non-blocking (glass, decals, foliage) | **Wrap (P0-1)**, small |
| **Debug render** (`world.debugRender()` → line buffers) | **not wrapped** | `?physdebug` wireframe so the owner sees what's solid | **Wrap (P0-1)**, cheapest proof there is |
| Primitive shapes (cuboid, capsule, cylinder, convex hull, compound) | capsule inside `CharacterMover` only | Cheaper than trimesh for box-like props; needs an authoring choice | Later |
| Kinematic rigid bodies (moved colliders) | not wrapped | Doors, lifts, drawers (P1-3) | Later. In a never-stepped world, move with `setTranslation` + `updateSceneQueries()`, not `setNextKinematic*` *(inference)* |
| Sensors + intersection/collision/contact-force events | not wrapped | Arbitrary-shape zones | **Skip.** Events come out of `world.step()`, and this world is never stepped. Circular zones are a distance check the runtime already does |
| Dynamic bodies, gravity, CCD, joints (revolute/prismatic/spherical/rope/spring), multibody | not wrapped | Pushable props, physical doors | **Skip.** Conflicts with the HYBRID rule (carry system owns motion); a room-specific exception would be an owner call |
| Heightfield, voxels (0.16+) | not wrapped | Outdoor terrain / destructible | Skip |
| Snapshots, deterministic / SIMD builds (0.15+), PID controller (0.15+), profiler timings (0.18+) | not wrapped | — | Skip. Profiler timings might earn a place in a later perf pass |

**How much we use:** five things. Fixed trimesh colliders, the character controller, one ray query, collision groups,
debug render. Two of those (groups, debug render) need new wrapper surface; the other three already exist.

**Version drift is a separate slice, not part of P0-1:**
- 0.15.1: `FIX_INTERNAL_EDGES` no longer implies `ORIENTED`. That is very likely the cause of the S0 caveat
  "winding-aware → `grounded=false` on inverted winding" *(inference)*.
- 0.18.0: broad-phase reworked "to support scene queries". The never-stepped world depends on `updateSceneQueries()`,
  which exists in 0.14 (`world.ts:293`). **Whether it survives to 0.20 is unverified.** The v0.20.0 source path
  returned 404, so the S0 spike tests are the regression gate for any upgrade.

### 2.2 The ground-sample trap

`MeshTerrainSampler.sample(x, z)` casts from **Y = 500** and takes the first hit (`MeshTerrainSampler.ts:58`). In any
enclosed room that first hit is the **ceiling or roof**, so the player snaps onto it. The `TerrainSurfaceSampler`
interface takes no height (`player-three/src/terrainSurface.ts:5`), so a height-aware sampler has to carry its own
reference height:

```
RoomColliderSampler implements TerrainSurfaceSampler
  refFeetY    — set each onBeforeGameplayTick from character.position.y − PLAYER_CAPSULE_HALF_HEIGHT
  sample(x,z) — world.castRayDown(x, z, refFeetY + maxStepUp), fallback 0 on miss
```

No SHARED interface change. A second storey above the player is ignored by construction.

### 2.3 The architectural risk: two height writers

`PlayerController` grounds Y from the `sampler` passed in the tick context (`GameplaySceneModule.ts:673`). dbox's
working collision is a **post-tick correction** in `onAfterGameplayTick` (`DboxCharacterEntity.resolveCollision()`,
then `syncPosition()`). EX-2's root cause in dbox was exactly this shape: **two subsystems writing Y from different
world models**, reconciled by deadbands, never converging.

The room avoids it with one rule: **one world model.** Ground *and* walls both come from the same Rapier trimesh.

| Stage | Y (ground) | XZ (walls) | Cost |
|---|---|---|---|
| **A (Recommended now)** | `RoomColliderSampler` (Rapier ray, §2.2) through the existing `PlayerController` path | `CharacterMover.move()` in `onAfterGameplayTick` with the tick's XZ delta; apply XZ only; `player.syncPosition()` | engine-dev only |
| B (after dbox S1 feel sign-off) | KCC owns Y too (snap-to-ground + autostep) | KCC | Needs `PlayerController` to stop snapping Y from the sampler, a SHARED change |

In Stage A a wall ahead reads as floor to the sampler (ray starts below the wall top and hits the floor), so
`PlayerController` walks into it and the KCC stops it. **The `wall_stumble` animation will not fire.** That's fine for a
walkthrough *(inference, to confirm in the playtest)*.

### 2.4 Tasks

| # | Task | File | Notes |
|---|---|---|---|
| 1a | Add `"@base/physics": "link:../SHARED/packages/physics"`; mirror whatever dbox's Vite config does for Rapier | `package.json`, `vite.config.ts` | Load it with a dynamic `import()` inside `/room` so the ~2 MB payload stays off `/editor` |
| 1b | World lifecycle: `loadRoom()` → `PhysicsWorld.create()` → `addStaticMesh(root)` **per placed prop** → `createCharacterMover()` **last** → `setSampler(new RoomColliderSampler(...))`. `unloadRoom()` → `mover.dispose()` → `world.dispose()` → `setSampler(undefined)` | `RoomPlayerModule.ts` | The mover must be created after all static meshes (`CharacterMover.ts:20-24`). No `removeCollider` wrapper exists, so recreate the world on every room switch |
| 1c | **Per-prop try/catch** around `addStaticMesh` | `RoomPlayerModule.ts` | `extractTrimesh` throws on a root with no mesh geometry (lights/empties only); one such prop would abort the whole load |
| 1d | **Props only, never NPC roots** | `RoomPlayerModule.ts` | `placedMeshes` holds both (`RoomPlayerModule.ts:194`). `extractTrimesh` already skips `SkinnedMesh`, but NPC accessories may not be skinned |
| 1e | `RoomColliderSampler` (§2.2) | `src/utils/` (new) | |
| 1f | XZ correction in `onAfterGameplayTick`. Capsule profile `radius 0.35`, `halfHeight 0.5` (matches the default capsule: `CapsuleGeometry(0.35, 1.0)`, `PLAYER_CAPSULE_HALF_HEIGHT = 0.85`) | `RoomPlayerModule.ts` | Track last position; `move(last, delta with y = 0)` |
| 1g | `?physdebug`: wrap `debugRender()` → `LineSegments` | `@base/physics` + `RoomPlayerModule.ts` | Additive SHARED export |
| 1h | Collision-group wrap: `addStaticMesh(..., { groups })` + ray filter | `@base/physics` | Additive; existing calls unchanged |

1g and 1h are the only SHARED edits, both additive, so the order is SHARED PR → engine-dev PR, as with S5.

### 2.5 Risks

- **First live character-controller integration anywhere.** dbox's source has zero `CharacterMover` references; dbox S1
  never started. Room feel (stairs, corners, door frames narrower than 0.7 m) is new evidence, owner-playtest gated.
- **Trimesh build cost on heavy props.** `extractTrimesh` accumulates into JS `number[]` with `push`. A ~1M-triangle
  environment GLB could stall `loadRoom()`. Measure load time with the heaviest prop in the library.
- **Stair descent feel.** Stage A keeps sampler-based down-steps: the "down-stairs pop" dbox fought. Stage B's
  snap-to-ground is the known fix.
- **Winding.** Leave `fixInternalEdges` off in Stage A. 0.14's flag makes grounding winding-sensitive (S0 caveat).

### 2.6 Done when

- `?physdebug` wireframe overlays every placed prop, and no NPC.
- In the seeded **space home** room: floor holds, walls block with a slide along them, **the vault ceiling does not
  capture the player**, the glass wall blocks.
- Negative controls: a prop with no geometry logs a warning and the room still loads; a switch A → B → A leaves exactly
  one character-controller capsule (no leak across `unloadRoom`).
- Owner playtest: walking, corners, eye height.

---

## 3. Order

1. **P0-2** (engine-dev only, no Rapier decision needed)
2. **P0-1 SHARED additions** 1g + 1h (one PR)
3. **P0-1 engine-dev** 1a–1f (one PR, depends on 2)
4. Owner playtest → Stage B decision rides on dbox S1
5. Rapier 0.14 → 0.20 upgrade: its own slice, S0 tests as the gate
