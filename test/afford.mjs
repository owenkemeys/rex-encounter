// Affordances, not names: you stand still inside each enclosure of the arena; for each verdict it holds of you (curious, food,
// threat) report what the animal can do about you there (afford.js: body / reach / see), what it actually does over 3 minutes,
// whether you are hurt and how, the thought kinds it has (counts), and its body against the walls (it never goes through).
// node test/afford.mjs [place|all] [seed] [secs]
import { makeTerrain } from '../src/terrain.js';
import { makePaddock } from '../src/paddock.js';
import { Creature } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
import { Nav } from '../src/rex/body/nav.js';
import { affordances } from '../src/rex/brain/afford.js';
const only = process.argv[2] || 'all', seed = +(process.argv[3] || 3), secs = +(process.argv[4] || 180);
const PD = makePaddock(7), ref = (n) => PD.refuges.find((r) => r.name === n);
const T0 = makeTerrain(7);
// the places: every enclosure's hiding place, plus the cave and the bluff ledge (where you stand; up: on a platform)
const places = [];
for (const S of T0.structures) {
  const R = PD.refuges.find((r) => r.of === S.key);
  const h = S.hide || { x: S.cx, z: S.cz }, up = R && R.up ? R.y : null;
  places.push({ name: S.key, x: h.x, z: h.z, up, crouch: !!S.crouch, S });
  // and just inside its first way in (on the ground: a platform has only its hiding place)
  const O = S.openings.find((o) => Math.hypot(o.nx, o.nz) > 0.5);
  if (!up && O) { const nl = Math.hypot(O.nx, O.nz); places.push({ name: S.key + '@door', x: O.x - O.nx / nl * 1.5, z: O.z - O.nz / nl * 1.5, up: null, crouch: !!S.crouch, S }); }
}
{ const C = T0.solids.find((s) => s.kind === 'cave'); if (C) places.push({ name: 'cave', x: C.cx, z: C.cz, up: null, crouch: false, S: C }); }
{ const L = ref('bluff ledge'); if (L) places.push({ name: 'ledge', x: (L.rect[0] + L.rect[2]) / 2, z: (L.rect[1] + L.rect[3]) / 2, up: null, crouch: false, S: null }); }

const VERDICTS = { curious: null, food: 'food', threat: 'threat' };
const rows = [];
let bad = 0;
for (const pl of places) {
  if (only !== 'all' && only !== pl.name) continue;
  for (const [vn, ov] of Object.entries(VERDICTS)) {
    const T = makeTerrain(7), NV = new Nav(T);
    const groundY = pl.up ?? T.height(pl.x, pl.z), eyeH = pl.crouch ? 0.9 : 1.7;
    // start 22-40 m away on easy open ground the animal can walk from
    let ax = pl.x + 30, az = pl.z;
    found: for (const d of [26, 32, 22, 40, 50]) for (let k = 0; k < 16; k++) { const a = k / 16 * 6.283, x = pl.x + Math.sin(a) * d, z = pl.z + Math.cos(a) * d; if (Math.max(Math.abs(x), Math.abs(z)) < 90 && NV.costAt(x, z) < 1.3 && !(T.depthAt && T.depthAt(x, z) > 0)) { ax = x; az = z; break found; } }
    const sim = new Creature(T, { x: ax, z: az, yaw: Math.atan2(pl.x - ax, pl.z - az), seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
    A.herd.list.length = 0; A.herd.disabled = true;
    if (ov) mind.ov.verdict = ov;
    if (vn === 'food') { mind.hunger = 0.92; mind.ov.hold.hunger = 0.92; }
    const me = { id: 'you', x: pl.x, z: pl.z, y: groundY + eyeH, vx: 0, vz: 0, speed: 0, crouch: pl.crouch, fx: 0, fz: 1 };
    const V = A.victim('you');
    const aff = affordances(T, sim.nav || NV, sim.selfModel(), { x: ax, z: az }, { x: me.x, y: groundY + (pl.crouch ? 0.5 : 0.9), z: me.z });
    const beh = {}, kinds = {}, ev = {}; let inWall = 0, maxPen = 0, minTip = 99, seenThought = new Set(), deadAt = null;
    const R = (j) => (j <= 12 ? 0.15 + 0.6 * (j / 12) : j <= 18 ? 1.05 : 0.55);
    for (let i = 0; i < secs * 120; i++) {
      const t = i / 120;
      if (V.free) { if (V.handled) { me.x = V.x; me.z = V.z; } me.y = (pl.up && Math.hypot(me.x - pl.x, me.z - pl.z) < 2 ? pl.up : T.height(me.x, me.z)) + eyeH; me.fx = (sim.x - me.x) / (Math.hypot(sim.x - me.x, sim.z - me.z) || 1); me.fz = (sim.z - me.z) / (Math.hypot(sim.x - me.x, sim.z - me.z) || 1); }
      else if (vn !== 'curious' && i % 20 === 0) A.struggle('you', 1);
      const noises = Math.abs(t - 3) < 0.004 ? [{ x: me.x, y: me.y, z: me.z, loud: 0.6, kind: 'shout' }] : [];
      A.step(1 / 120, { agents: [me], noises, light: 0.9, flash: false, wind: { x: 0, z: -2 } });
      for (const e of A.events) if (e.src === 'victim' && e.type !== 'victim') { const k = e.type === 'hurt' ? 'hurt:' + e.by : e.type; ev[k] = (ev[k] || 0) + 1; }
      A.events.length = 0;
      if (V.dead && deadAt === null) deadAt = t;
      const L = mind.label || (mind.beh && mind.beh.name) || '-'; beh[L] = (beh[L] || 0) + 1 / 120;
      for (const th of mind.voice.stream || []) { const key = th.t + '|' + th.text; if (!seenThought.has(key)) { seenThought.add(key); kinds[th.kind] = (kinds[th.kind] || 0) + 1; } }
      const h = sim.head; minTip = Math.min(minTip, Math.hypot(h.pos.x + h.f.x * 1.75 - V.x, h.pos.y + h.f.y * 1.75 - (V.y + 1), h.pos.z + h.f.z * 1.75 - V.z));
      if (i % 4 === 0) {
        const pts = sim.spine.map((sp, j) => [sp.p.x, sp.p.y, sp.p.z, R(j)]);
        for (let k = 0; k <= 4; k++) { const u = k / 4 * 1.75; pts.push([h.pos.x + h.f.x * u, h.pos.y + h.f.y * u - 0.15, h.pos.z + h.f.z * u, 0.4 - 0.2 * k / 4]); }
        for (const [x, y, z, r] of pts) for (const o of T.near(x, z, r + 1)) { if (o.kind !== 'wall') continue; const d = Math.hypot(x - o.x, z - o.z), pen = o.r + r * 0.8 - d; if (pen > 0.05 && y - r * 0.5 < o.top && (o.bot === undefined || y + r * 0.5 > o.bot)) { maxPen = Math.max(maxPen, pen); if (pen > 0.5) inWall++; } }
      }
      if (deadAt !== null && t - deadAt > 5) break;
    }
    const top = Object.entries(beh).sort((p, q) => q[1] - p[1]).slice(0, 3).map(([k, v]) => `${k} ${v.toFixed(0)}s`).join(', ');
    const hurt = Object.entries(ev).filter(([k]) => k.startsWith('hurt:')).map(([k, v]) => `${k.slice(5)}x${v}`).join(' ');
    const r = { place: pl.name, verdict: vn, aff: `${aff.body ? 'B' : '-'}${aff.reach ? 'R' : '-'}${aff.see ? 'S' : '-'}`, top, seized: ev.seized || 0, knocked: ev.knocked || 0, hurt: hurt || '-', health: V.health, dead: V.dead ? V.cause : '', minTip, inWall, kinds };
    rows.push(r); if (inWall > 0) bad++;
    console.log(`${pl.name.padEnd(10)} ${vn.padEnd(7)} aff ${r.aff} | ${top.padEnd(52)} | seized ${r.seized} knocked ${r.knocked} hurt ${r.hurt} health ${V.health.toFixed(2)}${r.dead ? ' DEAD ' + r.dead : ''} | snout ${minTip.toFixed(1)} m | wall max ${maxPen.toFixed(2)} m, through ${inWall} | thoughts ${JSON.stringify(kinds)}`);
  }
}
// summary per place: can it be hurt there, under some verdict?
const byPlace = {};
for (const r of rows) { const p = byPlace[r.place] || (byPlace[r.place] = { aff: r.aff, hurt: [], wall: 0 }); if (r.health < 1 || r.seized || r.knocked) p.hurt.push(r.verdict + (r.dead ? '(dead)' : '')); p.wall += r.inWall; }
console.log('\nSUMMARY');
for (const [k, p] of Object.entries(byPlace)) console.log(`  ${k.padEnd(10)} aff ${p.aff}  hurt under: ${p.hurt.join(',') || 'none'}  body-in-wall ${p.wall}`);
if (bad) { console.log(`FAIL: body more than 0.5 m into walls in ${bad} runs`); process.exitCode = 1; }
