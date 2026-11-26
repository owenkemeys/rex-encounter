// The world the rex reads: what a host game's terrain object (`T`) must answer, and the smallest valid one, flatTerrain().
// The body (body/rex.js), route planning (body/nav.js) and the mind (brain/*) query the world only through T. Nothing in them knows
// our paddock: a host builds T from its own physics (variants/saltline/src/saltworld.js maps boxes to it; src/terrain.js is our arena).
//
// Units: metres and seconds, y up. Flat ground with no solids is a valid answer to every query.
//
// REQUIRED (the rex throws without these):
//   height(x, z) -> y                       ground height (also what feet stand on: logs, steps and relief belong in it)
//   normal(x, z, out) -> out                ground normal written into out.x/.y/.z (out may be a three Vector3); returns out
//   obstacles: Pillar[]                     every solid the body and the route planner must keep out of, as vertical pillars
//   near(x, z, rad) -> Collider[]           colliders whose footprint comes within rad of (x, z) (may reuse one array)
//   pushOut(p, r, y0, y1, iters, wallsFull) -> [dx, dz]   move p.x/p.z out of colliders overlapping the vertical span y0..y1
//                                                         for a circle of radius r; returns the total shove
//   segClear(ax, ay, az, bx, by, bz, pad) -> bool   the 3-D segment is clear of the ground and of solids (sight, reach, paths)
//   bumps: []                               ground edits made at run time (route planning watches its length); [] if none
//   and a fence: rect {x0, x1, z0, z1} (the area it keeps to), or bound (half-size of a square round the origin, containing rect),
//   and arena (radius it treats as home ground, 36 in the paddock). Give all three; rect is the one that matters most.
//
// OPTIONAL (left out, the rex treats the world as plain open ground; each is guarded where it is read):
//   obstaclesNear(x, z, rad) -> Pillar[]    a fast spatial lookup over obstacles (else it scans them all)
//   structures: Structure[], insideStructure(x, z, y?) -> Structure|null    buildings it can go into, peer into or wait outside
//   roofBlocks(ax, ay, az, bx, by, bz) -> bool   a roof cuts the segment (sight into a building from above)
//   coverAt(x, z) -> 0..1, coverHeight(x, z) -> m   vegetation that hides a crouching person
//   windAt(x, z, w, out) -> out             the wind at a place, given the world's wind w {x, z} (m/s); else w everywhere
//   depthAt(x, z) -> m, wetAt(x, z) -> 0..1, surfaceAt(x, z) -> string ('mud', 'concrete', ...), speedFactor(x, z) -> 0..1
//   placeName(x, z) -> string               what the voice may call a place ('the yard'); thoughts fall back to its own words
//   navBlocks: [{x, z, r}]                  extra pillars only the route planner avoids (low ceilings it cannot pass under)
//   doors: [], stepDoors(dt, sim, events)   doors it can burst; ver: number, bumped when the solids change (route replanning)
//   solids: [{id, ...}]                     named solids the voice can refer to by id
//
// Shapes:
//   Pillar   {x, z, r, h, top, kind, sid?}  a vertical cylinder from the ground to `top` (world y). Walls and boxes are chains of
//            pillars ~0.75 m apart, r >= 0.35, or the animal walks through them. kind 'wall' for walls; any other string is fine.
//   Collider {x, z, r, top, bot?, kind}     the same for contact; with `bot` it is a slab hanging from bot to top (a beam, a floor)
//   Structure {kind, id, cx, cz, yaw, hw, hd, h, base, walls, openings: [{x, z, nx, nz, w, y}], roof: {y} | null}
//            centre, half sizes, wall height, floor y, ways in (centre, outward normal, width, sill height), roof height
//
// checkTerrain(T) lists what is missing, so a host finds out at load rather than ten minutes into play.

export const REQUIRED = ['height', 'normal', 'obstacles', 'near', 'pushOut', 'segClear', 'bumps'];
export const OPTIONAL = ['obstaclesNear', 'structures', 'insideStructure', 'roofBlocks', 'coverAt', 'coverHeight', 'windAt', 'depthAt', 'wetAt',
  'surfaceAt', 'speedFactor', 'placeName', 'navBlocks', 'doors', 'stepDoors', 'ver', 'solids'];

/** The names a terrain object is missing: required ones, and the fence (rect, bound, arena). [] means the rex can run on it. */
export function checkTerrain(T) {
  const miss = REQUIRED.filter((k) => T[k] === undefined);
  for (const k of ['rect', 'bound', 'arena']) if (T[k] === undefined) miss.push(k);
  return miss;
}

/** Flat open ground at height y, fenced to a square of half-size `half` round the origin; no solids, no water, no cover.
 *  The smallest world the rex runs in (src/rex/test/smoke.mjs), and a starting point for a host's own adapter. */
export function flatTerrain({ half = 60, y = 0 } = {}) {
  const none = [];
  return {
    height: () => y, base: () => y,
    normal: (x, z, out) => { out.x = 0; out.y = 1; out.z = 0; return out; },
    obstacles: [], colliders: [], near: () => none, obstaclesNear: () => none,
    pushOut: () => [0, 0],
    segClear: (ax, ay, az, bx, by, bz) => ay > y - 1e-6 && by > y - 1e-6,
    bumps: [], addBump() {}, ver: 0,
    rect: { x0: -half, x1: half, z0: -half, z1: half }, bound: half, arena: Math.min(36, half), size: 2 * half + 40,
    structures: [], insideStructure: () => null, doors: [], solids: [], grazing: [],
  };
}
