// node test/necksniff.mjs [--secs 120] [--seeds 3,5,8] [--d 14] [--trace]: the neck seen from above while the animal stands and
// sniffs / reads a still person (the owner's play note: lateral S, "snakelike from the front"). A person stands still d m in
// front of it; per tick in the probe's standing phases (sniff, read, stop, |v| < 0.4 m/s) it measures, in the chest's horizontal
// plane: each neck joint's lateral bend (root off the chest, the six joints between the seven vertebrae, the skull off the last),
// the sum along the neck, sign reversals along it (an S), and the jaw angle (rate of change and reversals: twitch).
import { makeTerrain } from '../src/terrain.js';
import { Creature, IDX } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const orbit = +arg('--orbit', 0), secs = +arg('--secs', 120), seeds = arg('--seeds', '3,5,8').split(',').map(Number), D0 = +arg('--d', 14), trace = process.argv.includes('--trace');
const dt = 1 / 120, R2D = 180 / Math.PI, wr = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export function neckBends(sim) {
  const c = sim.chest, fl = Math.hypot(c.f.x, c.f.z), fx = c.f.x / fl, fz = c.f.z / fl;
  const hd = (x, z) => Math.atan2(x * fz - z * fx, x * fx + z * fz);      // heading in the chest's frame (+ toward -l? sign only matters for reversals)
  const pts = [sim.nb]; for (let k = IDX.NECK0; k <= IDX.HEAD; k++) pts.push(sim.spine[k].p);
  const seg = []; for (let i = 1; i < pts.length; i++) seg.push(hd(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const b = [seg[0]]; for (let i = 1; i < seg.length; i++) b.push(Math.atan2(Math.sin(seg[i] - seg[i - 1]), Math.cos(seg[i] - seg[i - 1])));
  const sk = hd(sim.head.f.x, sim.head.f.z); b.push(Math.atan2(Math.sin(sk - seg[seg.length - 1]), Math.cos(sk - seg[seg.length - 1])));
  return b;      // [root, j1..j6, skull] rad
}
export function sCount(b, th = 1.5 / R2D, from = 0, to = b.length) { let s = 0, n = 0; for (let i = from; i < to; i++) { if (Math.abs(b[i]) < th) continue; const g = Math.sign(b[i]); if (s && g !== s) n++; s = g; } return n; }
// lateral S as seen from above: the joints' sideways distance from the chord neck root -> skull pivot, on both sides by > 2 cm
export function sBulge(sim) {
  const c = sim.chest, b = sim.nb, h = sim.spine[IDX.HEAD].p, ax = h.x - b.x, az = h.z - b.z, al = Math.hypot(ax, az) || 1;
  let lo = 0, hi = 0; for (let k = IDX.NECK0; k < IDX.HEAD; k++) { const p = sim.spine[k].p, d = ((p.x - b.x) * az - (p.z - b.z) * ax) / al; lo = Math.min(lo, d); hi = Math.max(hi, d); }
  return [lo, hi];
}
if (process.argv[1].endsWith('necksniff.mjs')) {
  const all = { n: 0, maxJ: 0, maxSum: 0, maxRoot: 0, maxSk: 0, sTicks: 0, sTicksNeck: 0, bulgeS: 0, maxBoth: 0, jawRev: 0, jawN: 0, jawMaxRate: 0, sumAbs: [] };
  for (const seed of seeds) {
    const T = makeTerrain(7), sim = new Creature(T, { x: 0, z: 0, yaw: 0.4, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
    A.herd.disabled = true;
    const me = { id: 'you', x: Math.sin(0.4) * D0, y: 0, z: Math.cos(0.4) * D0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1 };
    const beh = {}; let jprev = null, jdprev = 0, last = '';
    for (let i = 0; i < secs * 120; i++) {
      if (orbit && i > 120 * 20) { const t = (i - 2400) * dt, a0 = Math.atan2(me.x - sim.x, me.z - sim.z), r = Math.hypot(me.x - sim.x, me.z - sim.z); if (r < 9) { const a1 = a0 + orbit * dt; me.x = sim.x + Math.sin(a1) * r; me.z = sim.z + Math.cos(a1) * r; } }
      me.y = T.height(me.x, me.z) + 1.7; const dd = Math.hypot(sim.x - me.x, sim.z - me.z) || 1; me.fx = (sim.x - me.x) / dd; me.fz = (sim.z - me.z) / dd;
      A.step(dt, { agents: [me], noises: [], light: 0.85, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0;
      const bn = mind.beh ? mind.beh.name + '/' + (mind.beh.phase || '') : '-'; beh[bn] = (beh[bn] || 0) + 1;
      if (trace && bn !== last) { console.log(`  s${seed} t=${(i * dt).toFixed(1)} ${bn} d=${dd.toFixed(1)}`); last = bn; }
      const stand = Math.abs(sim.v) < 0.4 && mind.beh && (process.argv.includes('--any') || (mind.beh.name === 'probe' && ['sniff', 'read', 'stop'].includes(mind.beh.phase)));
      if (!stand) { jprev = null; continue; }
      const b = neckBends(sim), j = sim.jaw;
      if (jprev != null) { const jd = (j - jprev) / dt; all.jawMaxRate = Math.max(all.jawMaxRate, Math.abs(jd)); if (Math.abs(jd) > 0.05 && jdprev && Math.sign(jd) !== Math.sign(jdprev)) all.jawRev++; if (Math.abs(jd) > 0.05) jdprev = jd; }
      jprev = j; all.jawN++;
      all.n++; { const h = sim.head, dx = me.x - h.pos.x, dy = me.y - h.pos.y, dz = me.z - h.pos.z, g = Math.acos(Math.max(-1, Math.min(1, (h.f.x * dx + h.f.y * dy + h.f.z * dz) / Math.hypot(dx, dy, dz)))); (all.gz || (all.gz = [])).push(g); }
      const joints = b.slice(1, 7), sum = b.slice(0, 7).reduce((a, x) => a + x, 0);
      all.maxJ = Math.max(all.maxJ, ...joints.map(Math.abs)); all.maxRoot = Math.max(all.maxRoot, Math.abs(b[0])); all.maxSk = Math.max(all.maxSk, Math.abs(b[7])); all.maxSum = Math.max(all.maxSum, Math.abs(sum));
      all.sumAbs.push(b.slice(0, 7).reduce((a, x) => a + Math.abs(x), 0));
      if (sCount(b, 1.5 / R2D, 0, 8) > 0) all.sTicks++; if (sCount(b, 1.5 / R2D, 0, 7) > 0) all.sTicksNeck++;
      const [lo, hi] = sBulge(sim); if (lo < -0.02 && hi > 0.02) all.bulgeS++; all.maxBoth = Math.max(all.maxBoth, Math.min(-lo, hi));
      if (trace && i % (+arg("--every", 24)) === 0) console.log(`   t=${(i * dt).toFixed(1)} bends deg ${b.map((x) => (x * R2D).toFixed(1)).join(' ')} sum ${(sum * R2D).toFixed(1)} jaw ${j.toFixed(3)} bulge ${(lo * 100).toFixed(0)}/${(hi * 100).toFixed(0)}cm | chest-psi ${(wr(sim.chest.yaw - sim.psi) * R2D).toFixed(0)} tgt ${(wr(Math.atan2(me.x - sim.head.pos.x, me.z - sim.head.pos.z) - sim.chest.yaw) * R2D).toFixed(0)} skull ${(wr(sim.head.yaw - sim.chest.yaw) * R2D).toFixed(0)} pos ${(wr(Math.atan2(sim.head.pos.x - sim.nb.x, sim.head.pos.z - sim.nb.z) - sim.chest.yaw) * R2D).toFixed(0)} goal ${(wr(Math.atan2(sim.head.goal.x - sim.nb.x, sim.head.goal.z - sim.nb.z) - sim.chest.yaw) * R2D).toFixed(0)} gap ${(sim.neckGap * 100).toFixed(0)}cm` + (sim.dbg && sim.dbg.Gp ? ['Gp', 'Gc', 'Gs'].map((k) => ` ${k} ${(wr(Math.atan2(sim.dbg[k][0] - sim.nb.x, sim.dbg[k][2] - sim.nb.z) - sim.chest.yaw) * R2D).toFixed(0)}`).join('') + ' ko ' + sim.dbg.Gs[3] : ''));
    }
    console.log(`seed ${seed}: ` + Object.entries(beh).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${(v / 120).toFixed(1)}s`).join(', '));
  }
  const sa = all.sumAbs.sort((a, b) => a - b), p = (q) => sa.length ? (sa[Math.floor(q * (sa.length - 1))] * R2D).toFixed(1) : '-';
  console.log(`standing probe ticks ${all.n} (${(all.n / 120).toFixed(1)} s)`);
  console.log(`lateral deg: max joint ${(all.maxJ * R2D).toFixed(1)}, max root ${(all.maxRoot * R2D).toFixed(1)}, max skull-off-neck ${(all.maxSk * R2D).toFixed(1)}, max |net| along neck ${(all.maxSum * R2D).toFixed(1)}, sum|bend| p50 ${p(0.5)} p90 ${p(0.9)} max ${p(1)}`);
  console.log(`S (sign reversal along root..j6, >1.5 deg): ${(100 * all.sTicksNeck / Math.max(1, all.n)).toFixed(1)}% of ticks; incl. skull ${(100 * all.sTicks / Math.max(1, all.n)).toFixed(1)}%; top-view S bulge both sides >2 cm ${(100 * all.bulgeS / Math.max(1, all.n)).toFixed(1)}% (worst ${(all.maxBoth * 100).toFixed(1)} cm)`);
  { const g = (all.gz || [0]).sort((a, b) => a - b), q = (x) => (g[Math.floor(x * (g.length - 1))] * R2D).toFixed(0); console.log(`skull aim off the person deg: p50 ${q(0.5)} p90 ${q(0.9)} max ${q(1)}`); }
  console.log(`jaw: max rate ${all.jawMaxRate.toFixed(2)} rad/s, direction reversals ${all.jawRev} in ${(all.jawN / 120).toFixed(1)} s (${(all.jawRev / Math.max(1, all.jawN / 120)).toFixed(2)}/s)`);
}
