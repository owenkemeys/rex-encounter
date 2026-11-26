// What the animal can do about something, from the geometry round it and the animal's own body: no names of places or kinds.
//   body  : it can bring its whole body up to the target (walk in, stand over it): every move it has is open to it
//   reach : its body stays outside, but its head can be threaded to the target along a clear line (a door, a window, a gap,
//           over a wall, down through a hole) from a place the body can stand on and walk to
//   see   : an eye can get a clear line to the target from ground it can walk to (nearby)
// Everything is read off `self` (body.selfModel(): one structure, so another body can be swapped in) and the world's
// colliders (T.segClear), the route grid (nav: the body's own bulk already stamped into it) and the ground.

/** The body numbers the affordances read, from Creature.selfModel() (postures: neck root ahead of the hips and above the ground
 *  per crouch; neck and head length) plus a few sizes of the body itself. */
export function bodyOf(model) {
  if (model.body) return model.body;
  const P = model.postures, top = P[0], neckReach = model.neckLen + model.headLen;
  // highest the snout gets: the neck root standing tall, the neck and head raised at the most it raises them (~35 deg)
  const snoutUp = top.y + neckReach * Math.sin(0.6);
  return (model.body = {
    width: model.width ?? 2.1,                 // across the chest and hips (the trunk's two radii)
    shoulderH: top.hip,                       // hip/back height standing: what a lintel must clear for the body to go under
    crouchH: P[P.length - 1].hip,             // the same at the deepest crouch it has
    headW: model.headW ?? 0.8,               // across the skull behind the eyes
    neckReach, biteReach: 0.6, snoutUp,
    standoff: model.standoff ?? 4.75,         // hips from a point the snout must reach, standing (species reachStop)
    postures: P,
  });
}

const AZ = 24;
/** Affordances for a target point P {x, y, z} (y: the middle of what is to be reached) seen from the animal at `from`. */
export function affordances(T, nav, model, from, P) {
  const B = bodyOf(model), g = T.height(P.x, P.z);
  const out = { body: false, reach: false, see: false, rise: P.y - g, stance: null };
  if (!nav || !T.segClear) { out.body = out.reach = out.see = true; return out; }
  nav._fresh();
  const n = nav.n, me = nav._compAt(from.x, from.z);
  const standable = (x, z) => { const [i, j] = nav.cellOf(x, z), k = i + n * j; return nav.cost[k] < Infinity && nav.comp[k] === me; };
  // body: ground it can walk to, within its standing reach of the target, with nothing solid between its chest and the target
  // (low walls do not count: the line runs at chest height over them), and the target not above its snout
  for (const r of [0, 1.5, 3, B.standoff]) {
    for (let k = 0; k < (r ? AZ : 1) && !out.body; k++) {
      const a = k / AZ * 6.283, x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r;
      if (!standable(x, z)) continue;
      const gy = T.height(x, z);
      if (P.y - gy > B.shoulderH) continue;      // above its own back: only the neck goes up there (reach, below)
      const cy = gy + B.shoulderH * 0.85;      // chest height, level: the chest itself could move in along this line
      if ((r === 0 || T.segClear(x, cy, z, P.x, cy, P.z, B.width / 2)) && T.segClear(x, cy, z, P.x, P.y, P.z, B.headW / 2)) { out.body = true; out.reach = true; out.see = true; out.stance = { x, z }; }
    }
    if (out.body) return out;
  }
  // reach: the jaws a bite's length off the target, the head and neck a straight line back from there to the neck root in
  // one of its postures, clear of everything at the skull's half-width; the hips behind that on ground it can walk to, and
  // the chest's path from the hips to the neck root clear too (a body never goes through a gap its chest does not fit)
  const L = B.neckReach * 0.95;
  for (let k = 0; k < AZ && !out.reach; k++) {
    const a = k / AZ * 6.283, ux = Math.sin(a), uz = Math.cos(a);
    const tx = P.x + ux * B.biteReach, tz = P.z + uz * B.biteReach, ty = P.y;
    for (const q of B.postures) {
      // where the neck root lands: iterate once for the ground under it
      let hd = L, rx = tx + ux * hd, rz = tz + uz * hd, ry = T.height(rx, rz) + q.y, dy = ry - ty;
      if (Math.abs(dy) > L * 0.97) continue;
      hd = Math.sqrt(L * L - dy * dy); rx = tx + ux * hd; rz = tz + uz * hd; ry = T.height(rx, rz) + q.y;
      const hx = rx + ux * q.f, hz = rz + uz * q.f;
      if (!standable(hx, hz)) continue;
      if (!T.segClear(tx, ty, tz, rx, ry, rz, B.headW / 2)) continue;
      const hy = T.height(hx, hz) + q.hip;
      if (!T.segClear(hx, hy, hz, rx, ry - 0.3, rz, B.width / 2 - 0.25)) continue;
      out.reach = true; out.see = true; out.stance = { x: hx, z: hz, low: q.low }; break;
    }
  }
  if (out.see) return out;
  // see: an eye at standing head height from walkable ground within 30 m, a clear line to the target
  for (const r of [6, 12, 20, 30]) for (let k = 0; k < AZ && !out.see; k++) {
    const a = k / AZ * 6.283, x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r;
    if (!standable(x, z)) continue;
    if (T.segClear(x, T.height(x, z) + B.postures[0].y + 0.8, z, P.x, P.y, P.z, 0.02)) out.see = true;
  }
  return out;
}

const keyOf = (T, nav, from, P, q = 2, y = true) => {
  const ds = T.doors ? T.doors.reduce((s, d) => s + (d.ang || 0), 0).toFixed(1) : '';
  if (nav && nav._fresh) nav._fresh();      // the component grid must exist before it is read for the key
  return `${Math.round(P.x * q)}:${y ? Math.round(P.y * q) : ''}:${Math.round(P.z * q)}:${T.ver || 0}:${ds}:${nav ? nav._compAt(from.x, from.z) : 0}`;
};
/** The same, remembered for a while per place (the target quantised to half a metre, the world's version, the doors' state). */
export function affordCache() {
  const memo = new Map();
  return (T, nav, model, from, P, t) => {
    const key = keyOf(T, nav, from, P);
    const e = memo.get(key);
    if (e && t - e.t < 6) return e.v;
    if (memo.size > 400) memo.clear();
    const v = affordances(T, nav, model, from, P); memo.set(key, { v, t }); return v;
  };
}

/** The one answer to "can its body, or its head, get at that?" that every gate and the head-placing planner (nav.senseSpots,
 *  used by besiege) share. The cheap geometric test above answers first; once the planner has worked the same place out in full
 *  (where a head can actually go, carried by a neck from ground the body can walk to), its answer replaces the cheap one for that
 *  place for a while: no spot at all means no reach (whatever the cheap test said); a spot means reach, at that spot's stance.
 *  The body verdict (walk in, stand over it) is not the planner's to overrule: the planner places a head, not a body.
 *  judge(T, nav, model, from, P, t) -> {body, reach, see, rise, stance, planned}; judge.plan(T, nav, from, P, spots, t) records;
 *  judge.planned(T, nav, from, P, t) -> the planner's record for that place, if fresh (spots, t). Places are keyed by ground
 *  position to a metre (a person's head and middle are one place to reach). */
export function reachJudge(keep = 25) {
  const cheap = affordCache(), plans = new Map();
  const pkey = (T, nav, from, P) => keyOf(T, nav, from, P, 1, false);
  const judge = (T, nav, model, from, P, t) => {
    const v = cheap(T, nav, model, from, P, t), pl = plans.get(pkey(T, nav, from, P));
    if (!pl || t - pl.t > keep || v.body) return v;
    // no spot: no reach, unless its hips already stand within a strike of it (the planner keeps a head off a person to look and
    // smell; that is not the measure of a bite from where it stands)
    if (!pl.spots.length) { const B = bodyOf(model); return v.reach && Math.hypot(from.x - P.x, from.z - P.z) > B.standoff + B.biteReach + 0.9 ? { ...v, reach: false, stance: null, planned: 0 } : v; }
    if (!v.reach) { const s = pl.spots[0]; return { ...v, reach: true, see: true, stance: { x: s.B.x, z: s.B.z, low: s.low }, planned: pl.spots.length }; }
    return v;
  };
  judge.plan = (T, nav, from, P, spots, t) => { if (plans.size > 200) plans.clear(); plans.set(pkey(T, nav, from, P), { spots, t }); };
  judge.planned = (T, nav, from, P, t) => { const pl = plans.get(pkey(T, nav, from, P)); return pl && t - pl.t <= keep ? pl : null; };
  return judge;
}
