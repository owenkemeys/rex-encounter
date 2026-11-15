// Commitment and fixation: does the animal decide, and hold to what it decided? Seeded encounters with scripted people on our
// arena and on the made-up world (test/foreign_world.mjs), measured from the mind's own state (behaviour, attention focus,
// gaze, body heading, thought stream, appraisal, peril). See out/platform/COMMIT.md for what each number means.
//   node test/commit.mjs [script,...|all] [--seeds 3,5] [--secs 150] [--world arena|foreign|both] [--save name] [--quiet]
// Scripts: still walkpast dart flee peek hidden rocks hop lure flare food_dart herd_dart threat
// Fairness scripts (out/platform/TUNE.md): still10 still6 slowwalk backoff dartcalm run5 walk38 (see FAIR below)
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';
import { makeForeign, RECT } from './foreign_world.mjs';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

const dt = 1 / 120, hyp = Math.hypot, wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
export const SCRIPTS = ['still', 'walkpast', 'dart', 'flee', 'peek', 'hidden', 'rocks', 'hop', 'lure', 'flare', 'food_dart', 'herd_dart', 'threat'];
// fairness: calm play (still at 10-12 m and at 6 m, a slow walk, backing off steadily at its tells), prey-like play that turns
// calm at the first tell (dartcalm), running straight off from 5 m, and an ordinary first meeting at a game walking pace (walk38,
// 3.8 m/s with sharp turns at waypoints, arena.opening on)
export const FAIR = ['still10', 'still6', 'slowwalk', 'backoff', 'dart', 'dartcalm', 'hop', 'peek', 'flee', 'run5', 'rocks', 'walk38', 'sprint5', 'sprint12', 'sprint25', 'cover12'];
// chases: sprint5/12/25 stand that far in front of it in the open until it has had a good look (4 s), then sprint straight away
// (6.2 m/s; along the fence where it meets one); cover12 stands 12 m from it, ~4 m short of a way in that its body cannot pass
// (the culvert on ours, the small zorb's door on the made-up world), and sprints in
const FOREIGN_OK = new Set(['sprint5', 'sprint12', 'sprint25', 'cover12', 'still', 'dart', 'peek', 'hidden', 'rocks', 'hop', 'lure', 'threat', 'still10', 'still6', 'slowwalk', 'backoff', 'dartcalm', 'run5', 'walk38']);
// what a watching player can read off its body: the low creep and fixed stare of a stalk, a warning, the dead-still moment
export const tellNow = (mind) => { const b = mind.beh, P = mind.peril; return !!((b && b.name === 'prowl' && b.phase !== 'rush') || P.stage === 'warn' || P.stage === 'still' || (mind.know.seen && mind.intent && mind.intent.stalk && mind.intent.look && mind.intent.look.lock)); };
// it has gone for you: a rush, a pounce, a committed strike, a predatory grab
export const rushNow = (mind) => { const b = mind.beh, P = mind.peril; return !!((b && b.name === 'prowl' && b.phase === 'rush') || P.stage === 'rush' || P.stage === 'strike' || (b && b.name === 'pounce') || (b && b.name === 'seize' && b.phase !== 'after')); };
const ENGAGE = new Set(['stalk', 'prowl', 'shadow', 'test', 'pounce', 'chase', 'inspect', 'appraise', 'circle', 'watch', 'fixate', ...['butt', 'swipe', 'pin', 'seize', 'toy']]);
const COMMIT_APPROACH = new Set(['stalk', 'prowl', 'shadow', 'test', 'pounce', 'chase', 'inspect', 'fixate', 'seize', 'butt']);
const DISMISS = new Set(['roam', 'leave', 'feed', 'hunt', 'trail', 'investigate', 'patrol', 'rest']);
// behaviours that travel to a place: progress toward it can be measured
const TRAVEL = new Set(['stalk', 'inspect', 'prowl', 'chase', 'pounce', 'search', 'revisit', 'trail', 'feed', 'hunt', 'investigate', 'nudge', 'fixate']);

function setupWorld(world, seed, script) {
  let T, sim, x0, z0;
  // (hide-and-peek is played at play distance: the animal starts ~20 m from the near face of the cover, the hiding place ~33 m off;
  //  TUNE.md: from 42-45 m, the old start, it barely ever saw a peek at all)
  if (world === 'foreign') { T = makeForeign(); x0 = 245; z0 = -305; if (script === 'peek' || script === 'hidden') { x0 = 250; z0 = -308; } } else { T = makeTerrain(7); x0 = 0; z0 = 0; if (script === 'peek' || script === 'hidden') { x0 = 30; z0 = 40; } }
  let yaw0 = 0.4;
  if (script === 'cover12') { if (world === 'foreign') { x0 = 236; z0 = -332; yaw0 = Math.atan2(225 - 236, -328 + 332); } else { x0 = 0; z0 = -58; yaw0 = Math.PI; } }
  sim = new Creature(T, { x: x0, z: z0, yaw: yaw0, seed });
  const mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  A.herd.disabled = !(script === 'herd_dart');
  return { T, sim, mind, A };
}
const inBounds = (T, x, z, m) => (T.rect ? x > T.rect.x0 + m && x < T.rect.x1 - m && z > T.rect.z0 + m && z < T.rect.z1 - m : hyp(x, z) < T.arena - m);
function clampB(T, me, m) {
  if (T.rect) { me.x = Math.min(T.rect.x1 - m, Math.max(T.rect.x0 + m, me.x)); me.z = Math.min(T.rect.z1 - m, Math.max(T.rect.z0 + m, me.z)); }
  else { const r = hyp(me.x, me.z), lim = T.arena - m; if (r > lim) { me.x *= lim / r; me.z *= lim / r; } }
}
// the direction nearest `away` with ~8 m of open ground ahead (inside the bounds, clear of rocks)
function roomy(T, me, away) {
  const a0 = Math.atan2(away.x, away.z);
  for (const k of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
    const a = a0 + k * 0.26, x = Math.sin(a), z = Math.cos(a);
    if (inBounds(T, me.x + x * 8, me.z + z * 8, 7) && !T.obstacles.some((o) => hyp(o.x - me.x - x * 4, o.z - me.z - z * 4) < o.r + 2)) return { x, z };
  }
  return away;
}
function openSpot(T, sim, d, rnd) {
  for (let k = 0; k < 60; k++) {
    const a = rnd() * 6.283, x = sim.x + Math.sin(a) * d, z = sim.z + Math.cos(a) * d;
    if (inBounds(T, x, z, 10) && !T.obstacles.some((o) => hyp(o.x - x, o.z - z) < o.r + 6) && !(T.insideStructure && T.insideStructure(x, z))) return { x, z };
  }
  return { x: sim.x + d, z: sim.z };
}
// things to hide behind, as rectangles (the big zorb on the made-up world; the stacked containers on ours)
function coverList(T) {
  if (T.rect) return [{ x: 270, z: -320, hw: 11, hd: 8 }];
  // (the barn: 6.5 m walls and a roof, taller than its eyes; over the 5.2 m container stack its head saw a crouched person
  //  for a third of the time, TUNE.md section 5)
  const S = T.structures.find((q) => q.kind === 'barn'); return [{ x: S.cx, z: S.cz, hw: S.hw, hd: S.hd }];
}
// the spot behind a rectangle from a viewpoint, `out` m beyond its face, slid `side` m along it
function behind(cv, vx, vz, out = 1, side = 0) {
  const dx = cv.x - vx, dz = cv.z - vz, u = hyp(dx, dz) || 1, ux = dx / u, uz = dz / u, ext = Math.min(cv.hw / Math.max(1e-3, Math.abs(ux)), cv.hd / Math.max(1e-3, Math.abs(uz)));
  return { x: cv.x + ux * (ext + out) - uz * side, z: cv.z + uz * (ext + out) + ux * side };
}

/** One encounter. Returns the record (see summarise). */
export function commitRun(script, seed, o = {}) {
  const world = o.world || 'arena', secs = o.secs ?? 150;
  const { T, sim, mind, A } = setupWorld(world, seed, script);
  if (o.cfg) for (const k in o.cfg) Object.assign(mind.cfg[k], o.cfg[k]);      // ablations: --cfg '{"prey":{"dart":0}}'
  mind.hunger = o.hunger0 ?? (['food_dart', 'herd_dart'].includes(script) ? 0.7 : 0.55);      // (--hunger h: the start; it rises at the game's own rate, 1/700 per s)
  let rs = (seed * 9301 + 49297 + script.length * 977) % 233280; const rnd = () => (rs = (rs * 9301 + 49297) % 233280) / 233280;
  // where the person starts: in the open, 25 m off (hiders near a cover)
  const D0 = { still10: 11, still6: 6, slowwalk: 15, backoff: 12, dartcalm: 13, walk38: 22 }[script] ?? 25;
  let start = openSpot(T, sim, D0, rnd);
  if (script === 'run5') start = { x: sim.x + Math.sin(sim.psi) * 5.5, z: sim.z + Math.cos(sim.psi) * 5.5 };
  const SPR = { sprint5: 5, sprint12: 12, sprint25: 25 }[script];
  if (SPR) start = { x: sim.x + Math.sin(sim.psi) * (SPR + 4.33), z: sim.z + Math.cos(sim.psi) * (SPR + 4.33) };      // (that far from its snout: hips to snout 4.33 m)
  let coverIn = null;
  if (script === 'cover12') { if (world === 'foreign') { start = { x: 225, z: -328 }; coverIn = [{ x: 225, z: -324.6 }, { x: 225, z: -320 }]; } else { start = { x: 0, z: -70 }; coverIn = [{ x: 0, z: -74 }, { x: 0, z: -82 }]; } }
  if (script === 'walk38') A.opening({ x: start.x, z: start.z });
  const CV = coverList(T);
  let cover = null;
  if (script === 'peek' || script === 'hidden') {
    cover = CV[0]; start = behind(cover, sim.x, sim.z, 4, 6);
  }
  if (script === 'food_dart') { const f = { x: sim.x + Math.sin(sim.psi) * 12, z: sim.z + Math.cos(sim.psi) * 12 }; A.things.place('carcass', f.x, f.z, { by: 'world' }); }
  if (script === 'herd_dart') { const hx = sim.x + 40, hz = sim.z + 10; A.herd.home = { x: hx, z: hz }; const L0 = A.herd.list[0]; const ox = L0.x, oz = L0.z; for (const p of A.herd.list) { p.x = hx + (p.x - ox); p.z = hz + (p.z - oz); } }
  const me = { id: 'you', x: start.x, z: start.z, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1 };
  const V = A.victim('you');
  const P = { mode: 'init', t0: 0, dir: null, dur: 0, stoneT: -99, lureN: 0, lureT: -99, flareN: 0, stepT: 0, hopPh: 0, walkDir: 1, out: false, peekT: 0 };
  // the record
  const R = { script, seed, world, secs, beh: [], focusRuns: [], verdicts: [], deaths: [], lures: [], threats: [], strikes: 0, firstSeen: null, commit: null,
    tellAt: null, rushT: null, goAt: null, lead: null, eps: [], tellT: 0, lastTell: -99, wasRush: false,
    samples: 0, agreeN: 0, agreeD: 0, agree3N: 0, agree3D: 0, seenT: 0, onYouT: 0, pdMax: 0, pounces: 0, fixT: 0, stance: {}, glanceN: 0, interruptN: 0 };
  let curB = null, curF = null, lastVerdict = null;
  // (a behaviour started by the peril system's stillness is the strike coming, not a new goal: named 'peril')
  const startB = (t) => { const b = mind.beh; curB = { name: b.reason === 'still' ? 'peril' : b.name, gen: b.gen, t0: t, t1: t, reason: b.reason, d0: null, dmin: 1e9, done: false, focus: mind.att ? mind.att._behFocus() : null }; R.beh.push(curB); };
  const noises = [];
  const events = [];      // scheduled one-off stimuli
  // (early: a darting person is often taken within a minute now, and the probes are about the fixated animal)
  if (script === 'threat') events.push({ t: 22, kind: 'bang' }, { t: 30, kind: 'flareClose' }, { t: 38, kind: 'bang' });
  for (let i = 0; i < secs * 120; i++) {
    const t = i * dt, px = me.x, pz = me.z, dR = hyp(sim.x - me.x, sim.z - me.z);
    noises.length = 0; let vx = 0, vz = 0, sp = 0, hop = 0; me.crouch = false;
    const away = { x: (me.x - sim.x) / (dR || 1), z: (me.z - sim.z) / (dR || 1) }, tang = { x: -away.z, z: away.x };
    const engaged = mind.know.seen && mind.att && mind.att.focusKey() === 'you';
    // lures go in while it is set on him: fixated, where the mind has that (the tree before this work does not: engaged only)
    const keen = engaged && (mind.ap.fixed === undefined ? true : mind.ap.fixed);
    if (V.dead) {
      if (o.untilDeath !== false) { R.secs = t; break; }      // the encounter is over: what follows (eating, a new life) is another story
      if (t - V.deadT > 6) { const s = A.respawn('you'); me.x = s.x; me.z = s.z; P.mode = 'init'; }
    } else if (V.free) {
      if (P.wasHandled) { me.x = V.x; me.z = V.z; }
      P.wasHandled = false;
      const base = script === 'lure' || script === 'flare' || script === 'food_dart' || script === 'herd_dart' || script === 'threat' ? 'dart' : script === 'still10' || script === 'still6' ? 'still' : script;
      const tellSeen = R.tellSince !== null && R.tellSince !== undefined && t - R.tellSince > 1.0;      // a player reacts about a second after a tell shows
      if (base === 'dartcalm') {
        // darts until it sees a tell, then goes calm (still) for up to 30 s or until there has been no tell for 8 s; then darts again
        if (P.calm) { if (t - P.calm.t0 > 30 || t - R.lastTell > 8) { P.calm.ep.end = +(t).toFixed(1); P.calm = null; P.mode = 'init'; } }
        else if (tellSeen && t > 3) { P.calm = { t0: t, ep: { t: +t.toFixed(1), rushed: null } }; R.eps.push(P.calm.ep); }
      }
      if (base === 'still' || (base === 'dartcalm' && P.calm)) { /* nothing */ }
      else if (base === 'slowwalk') {
        // a slow walk (1 m/s) to and fro across its front, 12-20 m off
        if (P.mode === 'init') { P.mode = 'walk'; P.ax = tang.x; P.az = tang.z; P.cx = me.x; P.cz = me.z; }
        const along = (me.x - P.cx) * P.ax + (me.z - P.cz) * P.az; if (along > 15) P.walkDir = -1; if (along < -15) P.walkDir = 1;
        if (!inBounds(T, me.x + P.ax * P.walkDir * 3, me.z + P.az * P.walkDir * 3, 7) && t - (P.turnT ?? -9) > 3) { P.walkDir *= -1; P.turnT = t; }      // (turns at the fence, as a walker would, not standing against it)
        const keep = dR < 12 ? 1.6 : dR > 20 ? -0.5 : 0;      // (never nearer than about 10 m: calm play at 10 m or more)
        vx = P.ax * P.walkDir + away.x * keep; vz = P.az * P.walkDir + away.z * keep; const l = hyp(vx, vz) || 1; vx /= l; vz /= l; sp = 1.0;
        if (!inBounds(T, me.x + vx * 3, me.z + vz * 3, 7)) { const r2 = roomy(T, me, { x: vx, z: vz }); vx = r2.x; vz = r2.z; }
      } else if (base === 'backoff') {
        // stands about 12 m off; at a tell it backs away steadily at a walk, facing it, until 6 s after the last tell
        // (as a person would: straight away from it where there is room, else the nearest way off that line that has room;
        //  sliding along the fence at its edge is not backing away)
        if (tellSeen || t - R.lastTell < 6) { const dir = roomy(T, me, away); vx = dir.x; vz = dir.z; sp = 1.2; P.backing = true; }
        else P.backing = false;
      } else if (base === 'run5') {
        // standing in front of it until it has seen him (4 s), stepping in at a slow walk until within 5 m of it (it keeps its own
        // distance, so he follows it in), then a flat-out run straight away from it
        if (!P.go && t > 4 && dR > 5) { vx = -away.x; vz = -away.z; sp = 1.0; if (t > 40) P.go = t; }
        else if (!P.go && t > 4) P.go = t;
        if (P.go && dR < 45) { vx = away.x; vz = away.z; sp = 6.2; if (!inBounds(T, me.x + vx * 3, me.z + vz * 3, 8)) { const s = (tang.x * -me.x + tang.z * -me.z) > 0 ? 1 : -1; vx = tang.x * s * 0.8 + away.x * 0.2; vz = tang.z * s * 0.8 + away.z * 0.2; } }
      } else if (SPR || base === 'cover12') {
        // stand facing it until it has had a good look (seen, 4 s), then sprint: straight away in the open, or into the cover
        if (!P.go && t > 4 && mind.know.seen && mind.att && mind.att.focusKey() === 'you') P.go = t;
        if (P.go && SPR) { vx = away.x; vz = away.z; sp = 6.2; if (!inBounds(T, me.x + vx * 3, me.z + vz * 3, 8)) { const s = (tang.x * -me.x + tang.z * -me.z) > 0 ? 1 : -1; vx = tang.x * s * 0.8 + away.x * 0.2; vz = tang.z * s * 0.8 + away.z * 0.2; } }
        else if (P.go) { const w = coverIn[P.wi || 0], d = hyp(w.x - me.x, w.z - me.z); if (d < 0.4 && (P.wi || 0) < coverIn.length - 1) P.wi = (P.wi || 0) + 1; if (d > 0.3) { vx = (w.x - me.x) / d; vz = (w.z - me.z) / d; sp = (P.wi || 0) ? 3 : 6.2; } me.crouch = !!P.wi; }
      } else if (base === 'walk38') {
        // a game's walking pace (3.8 m/s, Saltline's): waypoints round it 8-20 m off, a sharp turn at each; for the first minute, then still
        if (t < 60) {
          if (!P.wp || hyp(P.wp.x - me.x, P.wp.z - me.z) < 0.8) { const a2 = rnd() * 6.283, r2 = 8 + rnd() * 12; P.wp = { x: sim.x + Math.sin(a2) * r2, z: sim.z + Math.cos(a2) * r2 }; if (!inBounds(T, P.wp.x, P.wp.z, 8)) P.wp = { x: sim.x, z: sim.z }; }
          const d2 = hyp(P.wp.x - me.x, P.wp.z - me.z); vx = (P.wp.x - me.x) / (d2 || 1); vz = (P.wp.z - me.z) / (d2 || 1); sp = 3.8;
        }
      }
      else if (base === 'walkpast') {
        // slowly to and fro along a line past where the animal first stood, ~20 m off
        if (P.mode === 'init') { P.mode = 'walk'; P.ax = tang.x; P.az = tang.z; P.cx = me.x; P.cz = me.z; }
        const along = (me.x - P.cx) * P.ax + (me.z - P.cz) * P.az; if (along > 30) P.walkDir = -1; if (along < -30) P.walkDir = 1;
        vx = P.ax * P.walkDir; vz = P.az * P.walkDir; sp = 1.3;
      } else if (base === 'dart' || base === 'dartcalm') {
        // small quick darts in the 10-15 m band: a pause, a burst of half a second at a sprint, a pause
        if (P.mode === 'init') { P.mode = 'pause'; P.t0 = t; P.dur = 1 + rnd(); }
        if (P.mode === 'pause' && t - P.t0 > P.dur) {
          P.mode = 'go'; P.t0 = t; P.dur = 0.3 + 0.4 * rnd();
          const radial = dR > 15 ? -0.8 : dR < 10 ? 0.9 : (rnd() - 0.5) * 0.6, s = rnd() < 0.5 ? -1 : 1;
          P.dir = { x: tang.x * s + away.x * radial, z: tang.z * s + away.z * radial }; const l = hyp(P.dir.x, P.dir.z) || 1; P.dir.x /= l; P.dir.z /= l;
          if (dR > 30) { P.dir = { x: -away.x, z: -away.z }; P.dur = 1.2; }      // too far to be in it: come back in
        } else if (P.mode === 'go') { vx = P.dir.x; vz = P.dir.z; sp = 6.2; if (t - P.t0 > P.dur) { P.mode = 'pause'; P.t0 = t; P.dur = 0.8 + 1.4 * rnd(); } }
      } else if (base === 'flee') {
        if (dR < 40) { vx = away.x; vz = away.z; sp = 6.2; if (!inBounds(T, me.x + vx * 3, me.z + vz * 3, 8)) { const s = (tang.x * -me.x + tang.z * -me.z) > 0 ? 1 : -1; vx = tang.x * s * 0.8 + away.x * 0.2; vz = tang.z * s * 0.8 + away.z * 0.2; } }
      } else if (base === 'peek' || base === 'hidden') {
        let { x: gx, z: gz } = behind(cover, sim.x, sim.z, 1, 0);
        if (base === 'peek' && P.mode !== 'init') {
          if (!P.out && t - P.peekT > 4 + 3 * rnd()) { P.out = true; P.peekT = t; P.atT = null; P.hold = null; P.side = rnd() < 0.5 ? -1 : 1; }
          // out past the corner, a look of about two seconds once there, and back
          // (sideways along the far face until there is a clear line between its head and his eyes, as a person peeking would)
          if (P.out) {
            const clear = T.segClear(sim.head.pos.x, sim.head.pos.y, sim.head.pos.z, me.x, me.y, me.z);
            if (P.atT === null && clear) { P.atT = t; P.hold = { x: me.x, z: me.z }; }
            ({ x: gx, z: gz } = P.hold || behind(cover, sim.x, sim.z, 0.5, P.side * (Math.max(cover.hw, cover.hd) + 12)));
            if ((P.atT !== null && t - P.atT > 1.5 + rnd()) || t - P.peekT > 8) { P.out = false; P.peekT = t; P.atT = null; P.hold = null; }
          }
        }
        const d = hyp(gx - me.x, gz - me.z);
        if (d > 0.5) { vx = (gx - me.x) / d; vz = (gz - me.z) / d; sp = d > 6 && P.mode === 'init' ? 6.2 : P.out || d > 3 ? 4 : 1.6; }
        if (d < 1.5 && P.mode === 'init') { P.mode = 'hid'; P.peekT = t; }
        me.crouch = !P.out && d < 6;
        // (is the cover doing its job: a hider that is meant to be hidden, crouched behind it, with a clear line to its eyes)
        if (P.mode === 'hid' && !P.out && i % 12 === 0) { R.hidN = (R.hidN || 0) + 1; if (T.segClear(sim.head.pos.x, sim.head.pos.y, sim.head.pos.z, me.x, T.height(me.x, me.z) + 1.0, me.z)) R.hidVis = (R.hidVis || 0) + 1; }
      } else if (base === 'rocks') {
        if (dR < 10) { vx = away.x; vz = away.z; sp = 2.6; } else if (dR > 15) { vx = -away.x; vz = -away.z; sp = 2.6; }
        if (dR < 20 && t - P.stoneT > 4) { P.stoneT = t; A.things.throw('stone', me.x, me.y, me.z, sim.x, sim.z, 'you', sim.head.pos.y); }
      } else if (base === 'hop') {
        // jumping about close by: hop after hop, this way and that
        P.hopPh += dt * 2.2; if (P.hopPh >= 1) { P.hopPh -= 1; noises.push({ x: me.x, y: T.height(me.x, me.z), z: me.z, loud: 0.09, kind: 'step' }); const radial = dR > 13 ? -0.7 : dR < 8 ? 0.7 : (rnd() - 0.5); const s = rnd() < 0.5 ? -1 : 1; P.dir = { x: tang.x * s + away.x * radial, z: tang.z * s + away.z * radial }; const l = hyp(P.dir.x, P.dir.z) || 1; P.dir.x /= l; P.dir.z /= l; }
        hop = 0.6 * Math.sin(Math.PI * P.hopPh); if (P.dir) { vx = P.dir.x; vz = P.dir.z; sp = 3.2; }
      }
      // lures: meat thrown away from himself while it is on him
      if (script === 'lure' && keen && dR < 35 && t - P.lureT > 25 && P.lureN < 4) {
        P.lureT = t; P.lureN++; const s = rnd() < 0.5 ? -1 : 1, lx = me.x + tang.x * s * 10 + away.x * 4, lz = me.z + tang.z * s * 10 + away.z * 4;
        const th = A.things.throw('meat', me.x, me.y, me.z, lx, lz, 'you');
        R.lures.push({ t, kind: 'meat', id: th && th.id, d: +dR.toFixed(1), beh: mind.beh.name, pulledAt: null, back: null });
      }
      if (script === 'flare' && keen && dR < 35 && t - P.lureT > 45 && P.flareN < 2) {
        P.lureT = t; P.flareN++; const s = rnd() < 0.5 ? -1 : 1, lx = sim.x + tang.x * s * 12, lz = sim.z + tang.z * s * 12;
        const th = A.things.throw('flare', me.x, me.y, me.z, lx, lz, 'you');
        R.lures.push({ t, kind: 'flare', id: th && th.id, d: +dR.toFixed(1), beh: mind.beh.name, pulledAt: null, back: null });
      }
      me.x += vx * sp * dt; me.z += vz * sp * dt; clampB(T, me, 6);
      for (const q of T.obstacles) { const d = hyp(me.x - q.x, me.z - q.z); if (d < q.r + 0.4) { me.x = q.x + (me.x - q.x) / (d || 1) * (q.r + 0.4); me.z = q.z + (me.z - q.z) / (d || 1) * (q.r + 0.4); } }
      if (sp > 0.1) { me.fx = vx; me.fz = vz; } else { me.fx = (sim.x - me.x) / (dR || 1); me.fz = (sim.z - me.z) / (dR || 1); }
      if (sp > 0.5 && script !== 'hop') { P.stepT -= dt * sp; if (P.stepT <= 0) { P.stepT = 1.5; const loud = me.crouch ? 0 : sp > 4 ? 0.16 : 0.045; if (loud) noises.push({ x: me.x, y: T.height(me.x, me.z), z: me.z, loud, kind: 'step' }); } }
    } else {
      P.wasHandled = true;
      if (V.state === 'held' || V.state === 'pinned') { if (i % 18 === 0) A.struggle('you', 1); }
      else if (V.state === 'down' && i % 30 === 0 && V.t > 1.5) A.struggle('you', 1);
      me.x = V.x; me.z = V.z;
    }
    // scheduled stimuli (the threat probes)
    for (const e of events) if (!e.done && t >= e.t) {
      e.done = true; const bx = sim.x - Math.sin(sim.psi) * 7, bz = sim.z - Math.cos(sim.psi) * 7;      // behind it, close
      if (e.kind === 'bang') noises.push({ x: bx, y: T.height(bx, bz) + 0.5, z: bz, loud: 1.0, kind: 'crash' });
      else { const fx = sim.x + Math.sin(sim.psi + 1.2) * 4, fz = sim.z + Math.cos(sim.psi + 1.2) * 4; A.things.throw('flare', me.x, me.y, me.z, fx, fz, 'you'); }
      R.threats.push({ t, kind: e.kind, x: e.kind === 'bang' ? bx : sim.x, z: e.kind === 'bang' ? bz : sim.z, gen: mind.beh ? mind.beh.gen : -1, beh: mind.beh ? mind.beh.name : null, headAt: null, behAt: null, orientAt: null });
    }
    me.y = T.height(me.x, me.z) + (me.crouch ? 1.0 : 1.7) + hop; me.vx = (me.x - px) / dt; me.vz = (me.z - pz) / dt; me.speed = V.free ? hyp(me.vx, me.vz) : 0;
    A.step(dt, { agents: [me], noises: [...noises], light: 0.85, flash: false, wind: { x: 0, z: -2 } });
    for (const e of A.events) {
      if (e.src === 'victim' && e.type === 'death') R.deaths.push({ t: +t.toFixed(1), cause: e.cause });
      if (e.src === 'mind' && e.type === 'strike') R.strikes++;
    }
    A.events.length = 0;
    // ---- measurement (ten times a second, after the mind's decision tick)
    const b = mind.beh; if (!b) continue;
    if (o.trace && i % (o.every || 30) === 0) o.trace(t, mind, sim, me, V);
    if (V.free && !V.dead) {
      const tl = tellNow(mind); if (tl) { R.lastTell = t; if (R.tellSince === null || R.tellSince === undefined) R.tellSince = t; if (R.tellAt === null) R.tellAt = t; R.tellT += dt; } else if (t - R.lastTell > 4) R.tellSince = null;
    }
    // chases (a run of rushing, gaps under 1 s bridged): duration, peak speed, the gap each second, why it ended
    { const rn = rushNow(mind) || (mind.beh && mind.beh.name === 'chase'), C = R.chases || (R.chases = []), L = C[C.length - 1];
      if (rn && (!L || L.end !== null && t - L.end > 1)) C.push({ t0: +t.toFixed(1), end: null, vmax: 0, gap: [], why: null });
      const K2 = C[C.length - 1];
      if (K2 && (K2.end === null || t - K2.end <= 1)) {
        if (rn) { K2.end = null; K2.vmax = Math.max(K2.vmax, Math.abs(sim.v)); if (i % 120 === 0) K2.gap.push(+dR.toFixed(1)); }
        else if (K2.end === null) { K2.end = t; const b2 = mind.beh, oc = mind.ap.last; K2.why = V.dead ? 'kill' : `${b2 ? b2.name : '-'}${oc && t - oc.t < 1.5 ? ':' + oc.kind + (oc.why ? '/' + oc.why : '') : ''} fat${(mind.ctx && mind.ctx.fatigue || 0).toFixed(2)} d${dR.toFixed(0)}`; }
      } }
    { const rn = rushNow(mind); if (rn && !R.wasRush) { R.rushes = (R.rushes || 0) + 1; if (R.rushT === null) { R.rushT = t; R.lead = R.tellSince !== null && R.tellSince !== undefined ? +(t - R.tellSince).toFixed(1) : 0; } if (P.calm && P.calm.ep.rushed === null) P.calm.ep.rushed = +(t - P.calm.t0).toFixed(1); } R.wasRush = rn; }
    if (!curB || curB.gen !== b.gen) { if (curB) { curB.t1 = t; curB.done = curB.doneFlag; } startB(t); if (b.name === 'pounce') R.pounces++; }
    curB.t1 = t; curB.doneFlag = b.done;
    if (i % 12 !== 0) continue;
    R.samples++;
    const K = mind.know, att = mind.att, fk = att.focusKey(), h = sim.head;
    if (K.seen && R.firstSeen === null) R.firstSeen = t;
    if (K.seen) { R.seenT += 0.1; if (fk === 'you') R.onYouT += 0.1; }
    if (mind.ap.sig !== R.lastSig) { R.lastSig = mind.ap.sig; if (mind.ap.sig.vanish) R.vanN = (R.vanN || 0) + 1; if (mind.ap.sig.peek) R.peekN = (R.peekN || 0) + 1; }
    R.pdMax = Math.max(R.pdMax, mind.pd.k); { const k = mind.ap.arousal || 0; R.fixMax = Math.max(R.fixMax || 0, k); if (mind.ap.fixed) { R.fixT += 0.1; if (R.fixAt === undefined) R.fixAt = t; } }
    R.stance[mind.stance] = (R.stance[mind.stance] || 0) + 0.1;
    if (mind.ap.verdict !== lastVerdict) { lastVerdict = mind.ap.verdict; R.verdicts.push([+t.toFixed(0), lastVerdict]); }
    // focus runs (what its behaviour is about)
    const fkey = att._behFocus() ?? null;
    if (!curF || curF.k !== fkey) { curF = { k: fkey, t0: t, t1: t }; R.focusRuns.push(curF); } curF.t1 = t;
    // progress on travelling behaviours: distance to what it is about
    const fp = fkey ? att.pos(fkey) : null;
    if (TRAVEL.has(b.name)) { const g = fp || (b.spot ? b.spot : null); if (g) { const d = hyp(g.x - sim.x, g.z - sim.z); if (curB.d0 === null) curB.d0 = d; curB.dmin = Math.min(curB.dmin, d); } }
    // agreement: gaze, body and the latest thought on the behaviour's focus
    const angTo = (p) => { const dx = p.x - h.pos.x, dy = (p.y ?? h.pos.y) - h.pos.y, dz = p.z - h.pos.z, d = hyp(dx, dy, dz) || 1; return { a: Math.acos(Math.max(-1, Math.min(1, (dx * h.f.x + dy * h.f.y + dz * h.f.z) / d))), d }; };
    const TS = mind.thinker.stream, last = TS[TS.length - 1], thoughtOn = last && t - last.t < 8 ? last.about : null;
    if (fkey && fkey !== 'self' && fp) {
      const g = angTo(fp), gazeOn = g.a < 0.42 + Math.atan(1.3 / g.d) + 0.15;
      const bodyOn = Math.abs(wrapA(Math.atan2(fp.x - sim.x, fp.z - sim.z) - sim.psi)) < 0.8;
      const thOn = thoughtOn === null || thoughtOn === fkey || thoughtOn === 'self';
      R.agreeD++; if (gazeOn && bodyOn && thOn) R.agreeN++;
      R.gazeOnN = (R.gazeOnN || 0) + (gazeOn ? 1 : 0); R.bodyOnN = (R.bodyOnN || 0) + (bodyOn ? 1 : 0); R.thOnN = (R.thOnN || 0) + (thOn ? 1 : 0);
    }
    // all three name a target: are they the same one?
    {
      const cands = [];
      if (K.seen && K.target) cands.push(['you', K.target]); else if (mind.sum.cert > 0.2) cands.push(['you', { x: mind.sum.x, y: T.height(mind.sum.x, mind.sum.z) + 1.2, z: mind.sum.z }]);
      if (mind.focus && mind.focus.id != null) cands.push(['obj:' + mind.focus.id, mind.focus]);
      if (mind.prey) cands.push(['prey:' + mind.prey.id, { ...mind.prey, y: (mind.prey.y ?? 0) }]);
      let gz = null, gb = 9, bz = null, bb = 0.8;
      for (const [k, p] of cands) { const g = angTo(p), tol = 0.42 + Math.atan(1.3 / g.d); if (g.a < tol && g.a - tol < gb) { gb = g.a - tol; gz = k; } const e = Math.abs(wrapA(Math.atan2(p.x - sim.x, p.z - sim.z) - sim.psi)); if (e < bb) { bb = e; bz = k; } }
      if (gz && bz && thoughtOn && thoughtOn !== 'self' && thoughtOn !== 'sound') { R.agree3D++; if (gz === bz && bz === thoughtOn) R.agree3N++; }
    }
    // first committed approach or dismissal after first sight
    if (R.firstSeen !== null && !R.commit) {
      const dur = t - curB.t0;
      if (COMMIT_APPROACH.has(b.name) && dur >= 4) R.commit = { t: +(curB.t0 - R.firstSeen).toFixed(1), how: b.name };
      else if ((DISMISS.has(b.name) || (b.name === 'pause' && !K.seen)) && dur >= 15 && curB.t0 > R.firstSeen) R.commit = { t: +(curB.t0 - R.firstSeen).toFixed(1), how: 'dismiss:' + b.name };
    }
    // lures: pulled onto the thing thrown, and for how long
    for (const L of R.lures) {
      if (L.id == null) continue; const k = 'obj:' + L.id;
      if (L.pulledAt === null && t - L.t < 20 && fkey === k) L.pulledAt = +(t - L.t).toFixed(1);
      if (L.pulledAt !== null && L.back === null && fkey !== k) L.back = +(t - L.t - L.pulledAt).toFixed(1);
    }
    // threats: head on it, behaviour broken off
    for (const E of R.threats) {
      if (t - E.t > 6) continue;
      if (E.orientAt === null && mind.orientTo && mind.orientTo.t >= E.t - 0.01) E.orientAt = +(t - E.t).toFixed(1);
      if (E.headAt === null && E.kind === 'bang' && Math.abs(wrapA(Math.atan2(E.x - h.pos.x, E.z - h.pos.z) - Math.atan2(h.f.x, h.f.z))) < 0.6) E.headAt = +(t - E.t).toFixed(1);
      if (E.kind === 'bang') E.turn = Math.max(E.turn || 0, Math.PI - Math.abs(wrapA(Math.atan2(E.x - h.pos.x, E.z - h.pos.z) - Math.atan2(h.f.x, h.f.z))) - (Math.PI - E.off0));
      if (E.off0 === undefined) E.off0 = Math.abs(wrapA(Math.atan2(E.x - h.pos.x, E.z - h.pos.z) - Math.atan2(h.f.x, h.f.z)));
      if (E.behAt === null && b.gen !== E.gen) E.behAt = +(t - E.t).toFixed(1);
    }
    const g = att.glancing && att.glancing('tilt'); if (g && g.at > t - 0.1) R.glanceN++;
  }
  if (curB) curB.t1 = R.secs;
  if (curF) curF.t1 = R.secs;
  R.thoughts = mind.thinker.stream.length;
  return R;
}

// what a behaviour is for, as an observer would read it: the level at which "torn between goals" shows
const MODE = { stalk: 'pred', prowl: 'pred', appraise: 'pred', test: 'pred', shadow: 'pred', lurk: 'pred', pounce: 'pred', seize: 'pred', fixate: 'pred',
  inspect: 'curious', circle: 'curious', nudge: 'curious', watch: 'curious', feign: 'curious', toy: 'curious',
  display: 'agon', bluff: 'agon', snap: 'agon', chase: 'agon', butt: 'agon', swipe: 'agon', pin: 'agon', backoff: 'agon', guard: 'agon', avoid: 'agon',
  search: 'seek', stare: 'seek', ambush: 'seek', listen: 'seek', besiege: 'seek', revisit: 'seek', sniff: 'seek',
  feed: 'food', trail: 'food', hunt: 'herd', investigate: 'light', roam: 'own', pause: 'own', leave: 'own', rest: 'own', answer: 'own' };
/** Mode-level numbers from a behaviour sequence string ("roam12 stalk8 ..."): mode changes per minute, mean mode dwell, A-B-A-B
 *  alternations of modes inside 20 s. Works on saved baselines too. */
export function modeStats(seq, secs) {
  const toks = seq.split(' ').filter(Boolean).map((t) => { const m = t.match(/^([a-z]+)(\d+)$/); return m ? { name: m[1], d: +m[2] } : null; }).filter(Boolean);
  const runs = []; let t = 0;
  // searching for you is not a change of goal from what it was doing about you (stalking you, looking at you, warning you
  // off): out of sight it goes on with that goal by other means, so a 'seek' run joins the run about you before it
  for (const k of toks) { let md = MODE[k.name] || k.name; const L = runs[runs.length - 1]; if (md === 'seek' && L && ['pred', 'curious', 'agon'].includes(L.m)) md = L.m; if (k.name === 'peril' && L) md = L.m; if (L && L.m === md) L.d += k.d; else runs.push({ m: md, t0: t, d: k.d }); t += k.d; }
  // vacillation: coming back to a mode it left less than 15 s before, having done something else in between
  let ab = 0; for (let i = 2; i < runs.length; i++) { for (let j = i - 2; j >= 0; j--) { if (runs[i].t0 - (runs[j].t0 + runs[j].d) > 15) break; if (runs[j].m === runs[i].m) { ab++; break; } } }
  // dwell, time-weighted: how long the goal it is on at a random moment lasts in all (short encounters do not shrink it)
  const tot = runs.reduce((a, r) => a + r.d, 0) || 1;
  return { modeChanges: +((runs.length - 1) / (secs / 60)).toFixed(1), modeDwell: +(runs.reduce((a, r) => a + r.d * r.d, 0) / tot).toFixed(1), modeAB: ab, modes: runs.map((r) => r.m + r.d).join(' ') };
}

/** Numbers per run from the record. */
export function summarise(R) {
  const B = R.beh, mins = R.secs / 60;
  const dw = B.map((b) => b.t1 - b.t0);
  // torn: two behaviours alternating (A B A B) inside 15 s; or a travelling behaviour broken off (not finished) within 8 s
  // with under 1.5 m of progress toward what it was about
  let ab = 0; for (let i = 3; i < B.length; i++) { const [p, q, r, s] = [B[i - 3], B[i - 2], B[i - 1], B[i]]; if (p.name === r.name && q.name === s.name && p.name !== q.name && s.t0 - p.t0 < 15) ab++; }
  let abF = 0; const F = R.focusRuns.filter((f) => f.t1 - f.t0 > 0.15); for (let i = 3; i < F.length; i++) { const [p, q, r, s] = [F[i - 3], F[i - 2], F[i - 1], F[i]]; if (p.k === r.k && q.k === s.k && p.k !== q.k && s.t0 - p.t0 < 15) abF++; }
  let aband = 0; for (let i = 0; i < B.length - 1; i++) { const b = B[i]; if (TRAVEL.has(b.name) && !b.done && b.t1 - b.t0 < 8 && b.d0 !== null && b.d0 - b.dmin < 1.5 && b.d0 > 6) aband++; }
  const fdw = F.map((f) => f.t1 - f.t0), fyou = F.filter((f) => f.k === 'you').map((f) => f.t1 - f.t0);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const lures = R.lures.map((L) => (L.pulledAt === null ? 'no' : `${L.pulledAt}s/${L.back === null ? 'kept' : L.back + 's'}`));
  const out = {
    script: R.script, seed: R.seed, world: R.world, switchesPerMin: +(B.length / mins).toFixed(1), meanDwell: +mean(dw).toFixed(1), medDwell: +(dw.slice().sort((a, b) => a - b)[dw.length >> 1] || 0).toFixed(1),
    focusDwell: +mean(fdw).toFixed(1), youDwell: +mean(fyou).toFixed(1), tornAB: ab, tornFocus: abF, abandoned: aband,
    agree: R.agreeD ? +(R.agreeN / R.agreeD).toFixed(2) : null, gaze: R.agreeD ? +((R.gazeOnN || 0) / R.agreeD).toFixed(2) : null, body: R.agreeD ? +((R.bodyOnN || 0) / R.agreeD).toFixed(2) : null, thought: R.agreeD ? +((R.thOnN || 0) / R.agreeD).toFixed(2) : null,
    agree3: R.agree3D ? +(R.agree3N / R.agree3D).toFixed(2) : null, onYou: R.seenT ? +(R.onYouT / R.seenT).toFixed(2) : null, seenS: +R.seenT.toFixed(0),
    firstSeen: R.firstSeen === null ? null : +R.firstSeen.toFixed(1), commit: R.commit ? `${R.commit.how}@${R.commit.t}` : '-',
    pounces: R.pounces, strikes: R.strikes, deaths: R.deaths.map((d) => `${d.t}s ${d.cause}`).join(',') || '-', firstDeath: R.deaths.length ? R.deaths[0].t : null,
    lures: lures.join(' ') || '-', threats: R.threats.map((E) => `${E.kind}(${E.beh}): orient ${E.orientAt ?? '-'} head ${E.headAt ?? '-'}${E.kind === 'bang' ? ' turned ' + (E.turn || 0).toFixed(1) + '/' + (E.off0 || 0).toFixed(1) + 'rad' : ''} beh ${E.behAt ?? '-'}`).join('; ') || '-',
    vanN: R.vanN || 0, peekN: R.peekN || 0,
    hidVis: R.hidN ? +(R.hidVis || 0) / R.hidN : null,
    chases: (R.chases || []).map((C) => ({ dur: +((C.end ?? R.secs) - C.t0).toFixed(1), t0: C.t0, vmax: +C.vmax.toFixed(1), gap: C.gap, why: C.why ?? (R.deaths.length ? 'kill' : 'end of run') })),
    firstTell: R.tellAt === null ? null : +R.tellAt.toFixed(1), firstRush: R.rushT === null ? null : +R.rushT.toFixed(1), lead: R.lead, tellS: +R.tellT.toFixed(0), rushes: R.rushes || 0,
    eps: R.eps.length, epsCalled: R.eps.filter((e) => e.rushed === null && e.end !== undefined).length, epsRushed: R.eps.filter((e) => e.rushed !== null).length,
    verdicts: R.verdicts.map(([t, v]) => `${t}:${v}`).join(' '), fixT: +(R.fixT || 0).toFixed(0), fixAt: R.fixAt === undefined ? null : +R.fixAt.toFixed(0), arMax: +(R.fixMax || 0).toFixed(2), pdMax: +R.pdMax.toFixed(2), secs: +R.secs.toFixed(0),
    stance: Object.fromEntries(Object.entries(R.stance).map(([k, v]) => [k, Math.round(100 * v / (R.secs || 1))])),
    seq: B.map((b) => `${b.name}${(b.t1 - b.t0).toFixed(0)}`).join(' '),
    ...modeStats(B.map((b) => `${b.name}${(b.t1 - b.t0).toFixed(0)}`).join(' '), R.secs),
  };
  out.torn = out.modeAB + aband;      // torn: coming back within 15 s to a mode it had left, or a journey broken off before it got anywhere
  return out;
}

// --report <name>[,<name>]: the per-script table of saved runs (mode numbers recomputed from the saved sequences)
function report(names) {
  const keys = ['modeChanges', 'modeDwell', 'modeAB', 'switchesPerMin', 'meanDwell', 'torn', 'agree', 'agree3', 'onYou', 'fixT', 'arMax', 'pounces', 'strikes', 'firstDeath'];
  const tabs = names.map((n) => JSON.parse(readFileSync(`out/platform/commit/${n}.json`, 'utf8')).map((r) => { const ms = modeStats(r.seq, r.secs || 150); return { ...r, ...ms, torn: ms.modeAB + (r.abandoned || 0) }; }));
  const scripts = [...new Set(tabs.flatMap((rows) => rows.map((r) => r.script)))];
  const m = (a, k) => { const v = a.map((r) => r[k]).filter((x) => typeof x === 'number'); return v.length ? +(v.reduce((x, y) => x + y, 0) / v.length).toFixed(2) : '-'; };
  console.log('script    | ' + keys.join(' | ') + ' | deaths | commit | lures');
  for (const sc of [...scripts, 'ALL']) for (const [i, rows] of tabs.entries()) {
    const a = sc === 'ALL' ? rows : rows.filter((r) => r.script === sc); if (!a.length) continue;
    console.log(`${(i ? '' : sc).padEnd(9)} ${names[i].padEnd(9)}| ` + keys.map((k) => String(m(a, k))).join(' | ') + ` | ${a.filter((r) => r.firstDeath !== null).length}/${a.length} | ${a.map((r) => r.commit).join(',')} | ${a.map((r) => r.lures).join(' ; ')}`);
  }
}
// --fairness: death rate and time to death per script and world, the lead from the first tell a player could read to the rush,
// and how often going calm at a tell calls the rush off (out/platform/TUNE.md). Every seed on both worlds; runs end at the first death.
function fairness(scripts) {
  const seedsA = arg('--seeds', '3,5,8,11,13,17').split(',').map(Number), seedsF = arg('--fseeds', '3,5,8').split(',').map(Number), secs = +arg('--secs', 180), save = arg('--save', null);
  const W = arg('--world', 'both'), rows = [];
  const med = (a) => { const v = a.filter((x) => x !== null && x !== undefined).sort((p, q) => p - q); return v.length ? v[v.length >> 1] : null; };
  for (const sc of scripts) for (const w of W === 'both' ? ['arena', 'foreign'] : [W]) {
    if (w === 'foreign' && !FOREIGN_OK.has(sc)) continue;
    for (const seed of w === 'foreign' ? seedsF : seedsA) {
      const ss = sc === 'run5' || /^(sprint|cover)/.test(sc) ? Math.min(secs, 60) : sc === 'walk38' ? Math.min(secs, 90) : secs;      // (a chase is settled within the minute)
      const r = summarise(commitRun(sc, seed, { world: w, secs: ss, hunger0: arg('--hunger', null) === null ? undefined : +arg('--hunger'), cfg: arg('--cfg', null) ? JSON.parse(arg('--cfg')) : null }));
      rows.push(r);
      if (!process.argv.includes('--quiet')) console.log(`${w.padEnd(7)} ${sc.padEnd(9)} s${String(seed).padEnd(3)} death ${r.firstDeath ?? '-'}${r.hidVis !== null && r.hidVis !== undefined ? ' hidVis ' + r.hidVis.toFixed(2) + ' van ' + r.vanN + ' peek ' + r.peekN : ''} | tell ${r.firstTell ?? '-'} rush ${r.firstRush ?? '-'} lead ${r.lead ?? '-'} rushes ${r.rushes} | fixed ${r.fixT}s from ${r.fixAt ?? '-'} ar ${r.arMax} | eps ${r.eps} called ${r.epsCalled} rushed ${r.epsRushed} | ${r.deaths} | ${r.modes.slice(0, 120)}`);
    }
  }
  console.log('\nFAIRNESS (runs end at the first death)');
  console.log('script    world   | deaths      | t death med (range) | lead med (min) | first tell med | calm episodes called off');
  for (const sc of scripts) for (const w of ['arena', 'foreign', 'both']) {
    const a = rows.filter((r) => r.script === sc && (w === 'both' || r.world === w)); if (!a.length || (w === 'both' && new Set(a.map((r) => r.world)).size < 2)) continue;
    const dd = a.filter((r) => r.firstDeath !== null), td = dd.map((r) => r.firstDeath), ld = dd.map((r) => r.lead);
    const ep = a.reduce((s2, r) => s2 + r.eps, 0), epc = a.reduce((s2, r) => s2 + r.epsCalled, 0), epr = a.reduce((s2, r) => s2 + r.epsRushed, 0);
    console.log(`${sc.padEnd(9)} ${w.padEnd(7)} | ${String(dd.length + '/' + a.length).padEnd(5)} ${(Math.round(100 * dd.length / a.length) + '%').padStart(4)} | ${td.length ? med(td) + ' (' + Math.min(...td) + '-' + Math.max(...td) + ')' : '-'} | ${ld.length ? med(ld) + ' (' + Math.min(...ld) + ')' : '-'} | ${med(a.map((r) => r.firstTell)) ?? '-'} | ${ep ? epc + '/' + ep + ' (rushed ' + epr + ')' : '-'}`);
  }
  // the chases, run by run, for the chase scripts (and any script with --chases)
  const CH = new Set(['sprint5', 'sprint12', 'sprint25', 'cover12', 'run5', 'flee']);
  console.log('\nCHASES (dur s, peak speed m/s, gap m each second, why it ended)');
  for (const r of rows) if (CH.has(r.script) || process.argv.includes('--chases')) for (const C of r.chases) console.log(`${r.script.padEnd(9)} ${r.world.padEnd(7)} s${String(r.seed).padEnd(3)} t${C.t0} dur ${C.dur} vmax ${C.vmax} gap ${C.gap.join(',')} | ${C.why}`);
  if (save) { mkdirSync('out/platform/tune', { recursive: true }); writeFileSync(`out/platform/tune/${save}.json`, JSON.stringify(rows, null, 1)); console.log('saved out/platform/tune/' + save + '.json'); }
}
if (process.argv[1] && process.argv[1].endsWith('commit.mjs') && process.argv.includes('--report')) { report(arg('--report').split(',')); process.exit(0); }
if (process.argv[1] && process.argv[1].endsWith('commit.mjs')) {
  const which = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'all';
  const scripts = which === 'all' ? SCRIPTS : which === 'fair' ? FAIR : which.split(',');
  if (process.argv.includes('--fairness')) { fairness(scripts); process.exit(0); }
  const seeds = arg('--seeds', '3,5').split(',').map(Number), secs = +arg('--secs', 150), W = arg('--world', 'both'), save = arg('--save', null), quiet = process.argv.includes('--quiet');
  const rows = [];
  for (const w of W === 'both' ? ['arena', 'foreign'] : [W]) for (const sc of scripts) {
    if (w === 'foreign' && !FOREIGN_OK.has(sc)) continue;
    for (const seed of w === 'foreign' ? [seeds[0]] : seeds) {
      const t0 = Date.now(), r = summarise(commitRun(sc, seed, { world: w, secs, cfg: arg('--cfg', null) ? JSON.parse(arg('--cfg')) : null }));
      rows.push(r);
      console.log(`${w.padEnd(7)} ${sc.padEnd(9)} s${seed} | sw/min ${r.switchesPerMin} dwell ${r.meanDwell}/${r.medDwell} focus ${r.focusDwell} you ${r.youDwell} | modes ${r.modeChanges}/min dwell ${r.modeDwell} AB ${r.modeAB} | torn ${r.torn} (ab ${r.tornAB} f ${r.tornFocus} abd ${r.abandoned}) | agree ${r.agree} (g ${r.gaze} b ${r.body} th ${r.thought}) a3 ${r.agree3} onYou ${r.onYou} | seen ${r.firstSeen}s commit ${r.commit} | pounce ${r.pounces} strike ${r.strikes} deaths ${r.deaths} | fixed ${r.fixT}s from ${r.fixAt ?? '-'} ar ${r.arMax} pd ${r.pdMax} | ran ${r.secs}s | lures ${r.lures} | ${r.threats} | verdicts ${r.verdicts} | ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      if (!quiet) console.log('    ' + r.seq + '\n    ' + r.modes);
    }
  }
  // per script means
  console.log('\nSUMMARY (means over seeds/worlds)');
  const by = {}; for (const r of rows) (by[r.script] || (by[r.script] = [])).push(r);
  const m = (a, k) => { const v = a.map((r) => r[k]).filter((x) => typeof x === 'number'); return v.length ? +(v.reduce((x, y) => x + y, 0) / v.length).toFixed(2) : null; };
  for (const [k, a] of Object.entries(by)) console.log(`  ${k.padEnd(9)} modes/min ${m(a, 'modeChanges')} modeDwell ${m(a, 'modeDwell')} modeAB ${m(a, 'modeAB')} sw/min ${m(a, 'switchesPerMin')} dwell ${m(a, 'meanDwell')} focusDwell ${m(a, 'focusDwell')} torn ${m(a, 'torn')} agree ${m(a, 'agree')} a3 ${m(a, 'agree3')} onYou ${m(a, 'onYou')} pounce ${m(a, 'pounces')} strikes ${m(a, 'strikes')} deaths ${a.filter((r) => r.firstDeath !== null).length}/${a.length} commit ${a.map((r) => r.commit).join(',')}`);
  const all = rows; console.log(`  ALL       modes/min ${m(all, 'modeChanges')} modeDwell ${m(all, 'modeDwell')} modeAB ${m(all, 'modeAB')} sw/min ${m(all, 'switchesPerMin')} dwell ${m(all, 'meanDwell')} focusDwell ${m(all, 'focusDwell')} torn ${m(all, 'torn')} agree ${m(all, 'agree')} a3 ${m(all, 'agree3')}`);
  if (save) { mkdirSync('out/platform/commit', { recursive: true }); writeFileSync(`out/platform/commit/${save}.json`, JSON.stringify(rows, null, 1)); console.log('saved out/platform/commit/' + save + '.json'); }
}
