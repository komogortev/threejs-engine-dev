# NOTE — P0-1: does an AABB-footprint interim belong before Rapier trimesh?

> **Date:** 2026-10-03. **Status:** scoped note, no code. **Verdict: no — keep Stage A as planned; two small
> borrows only (§4).** Companion to [`PLAN-ROOM-P0-COLLISION-ZONES-2026-09-11.md`](PLAN-ROOM-P0-COLLISION-ZONES-2026-09-11.md) §2.
> **Method:** source read of Agent Office v0.1.206 (`src/client/player/collide.ts`, `world/types.ts`, docs) against this
> repo and SHARED `main`. **Nothing was run** — Agent Office's feel, performance and its colliders-for-GLBs path are
> unobserved. Claims marked *(inference)* are reasoned, not observed.

## 1. What was proposed, and where it came from

Agent Office (a 3D "office" for coding agents, MIT) walks its avatar with **no physics engine**: a `Collider` is a 2D
footprint `{minX,maxX,minZ,maxZ,top,bottom?}`; the player is a 0.32 m circle, 1.7 m tall; ledges ≤ 0.3 m are stepped
up; blocked moves slide by bisecting the free fraction of the step; a spawn that overlaps a solid may only escape
toward its near face. Roofs and lofts are handled by `bottom` and a `ceilingAt` check. The colliders are declared by
the hand-written world builders (*(inference)* — I did not read how its 10 GLBs get theirs).

The idea: generate one such box per placed GLB from its bounding box, as a cheap interim for "nothing placed is solid"
(P0-1) before trimesh colliders.

## 2. Why it does not fit our room data

- **`environment` assets are room shells.** `AssetKind` = `character | prop | environment | animation-pack | audio`, and
  `environment` is "large static GLB (terrain, room mesh, sky dome)" (`SHARED/packages/ui/src/editor/assetDb.ts:19`).
  The seeded space home is six `environment` GLBs. **The bounding box of a room shell is the whole room**: a box
  collider would wall the player out of — or lock them inside — the space they are meant to walk in.
- **The plan's own done-criteria need meshes.** §2.6 requires the *vault ceiling not to capture the player* and the
  *glass wall to block*. A footprint model needs hand-authored `bottom`/`top` per piece to do either; a Rapier
  trimesh gets both from geometry.
- **The hard part is untouched.** The ground-sample trap (plan §2.2: a Y=500 ray lands on the ceiling indoors) and the
  one-world-model rule (§2.3) are about *ground*, not walls. An AABB interim still needs a height-aware sampler, so it
  would add a second collision model that Stage A then has to replace.
- **Little is saved.** It removes the Rapier dependency only for `prop` assets, but the plan already loads Rapier via a
  dynamic `import()` inside `/room` (task 1a), so `/editor` never pays the ~2 MB. It would also still leave the two
  SHARED additions (1g debug render, 1h groups) in play for the environment path.
- **Over-blocking on organic props.** A tree's box blocks walking under its canopy; a pillar's box is fine. Coarse
  boxes are a per-asset-class call, not a default.

## 3. Where a box *does* belong — it is already in the plan

Plan §2.1 lists "primitive shapes (cuboid, capsule, …) — cheaper than trimesh for box-like props; needs an authoring
choice — **Later**". That is this idea, correctly scoped: an **opt-in per-asset collider mode** for `prop` assets
(`'mesh'` default, `'box'` for boxy props), not an interim for the whole room.

**Re-entry condition (replaces "Later"):** build that opt-in only if task 1c's measurement shows `extractTrimesh`
stalls `loadRoom()` on the heaviest prop in the library (plan §2.5, "trimesh build cost on heavy props"). Until the
number exists, no mode and no authoring field.

## 4. Two borrows worth taking into Stage A

1. **Spawn-overlapping-a-solid negative control (add to plan §2.6).** Agent Office's `blockerAt(..., allowEscape)` only
   lets an overlapped body move *toward the near face*, so a spawn inside a solid cannot tunnel through to the far
   side. Our P0-2 plan already guards "spawn inside an exit zone"; P0-1 has no equivalent. Add: *spawn the player with
   the capsule overlapping a placed prop's trimesh → player resolves out on the near side, not through the prop.* Whether
   Rapier's KCC depenetration does this by default is **unverified** (plan §2.5 already marks KCC feel as new evidence).
2. **Step-height as an explicit tunable.** Their 0.3 m `STEP` is a named constant. The plan's capsule profile fixes
   radius/halfHeight but does not state autostep height; name it in task 1f so the playtest has a number to move.

## 5. Decision

| Option | Verdict |
|---|---|
| AABB interim for all placed GLBs | **Reject** — wrong for `environment`, duplicates the sampler problem |
| Stage A as written (Rapier trimesh + RoomColliderSampler + KCC XZ) | **Keep (Recommended)** |
| Per-asset `'box'` collider mode for props | **Park** — re-entry: task 1c measures a heavy-prop stall |
| §4 borrows (negative control + named step height) | **Take** — plan-text edits only |

*Correction recorded:* the 2026-10-03 chat assessment called the AABB interim "Recommended" and sized the logic at "about
130 lines". The size was unmeasured (`collide.ts` is 5,006 bytes) and the recommendation did not account for the
`environment` asset kind. This note supersedes it.
