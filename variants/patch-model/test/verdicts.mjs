// Determined players against the appraisal (src/sim/appraise.js): can a person who sets out to be a rival, or a threat, get
// there in a session, and does it look and sound different from a nuisance once they do?
//   node test/verdicts.mjs [seeds e.g. 3,5,8] [--secs 300] [--quiet]
// rival: keeps 12-20 m off facing it (holds its gaze), never runs, walks at it whenever it displays or charges, shouts back
//        every ~10 s, and takes meat off it when it feeds (meat is put down near it every 70 s).
// threat: keeps 12-20 m off, throws a stone at its head every ~5 s when it is in range, holds the torch in its eyes whenever
//        within 15 m (night), and lands a flare at its feet every 45 s. Never runs.
// press: the animal already holds you a threat (ov.verdict pinned); you keep pressing it: walk in to 8-12 m, a stone at its
//        head every ~5 s, torch in its eyes. Reports how long you last.
// nuisance (control): two stones at its body and goes on wandering. Should stay nuisance (never rival or threat).
// Reports time to the verdict, the lead-up (rivalry/fear at 60 s intervals), the stance mix after it, and the thoughts.
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';

const dt = 1 / 120, hyp = Math.hypot, quiet = process.argv.includes('--quiet');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SEEDS = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '3,5,8').split(',').map(Number), SECS = +arg('--secs', 300);
const fail = [];
const check = (ok, msg) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fail.push(msg); };

function run(seed, kind, secs = SECS) {
  const T = makeTerrain(7), sim = new Creature(T, { x: 0, z: 0, yaw: 0, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  A.herd.disabled = true; mind.hunger = 0.5; mind.ov.hold.hunger = 0.5; const press = kind === 'press'; if (press) { mind.ov.verdict = 'threat'; kind = 'threat'; }
  const me = { id: 'you', x: 0, z: 22, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1, torch: false, lx: 0, ly: 0, lz: -1 }, V = A.victim('you');
  const R = { seed, kind: press ? 'press' : kind, at: null, lead: [], st: {}, stAfter: {}, thoughts: [], verdicts: [], died: false };
  let stoneT = -99, shoutT = 0, flareT = 10, meatT = 20, meatId = null, stones = 0, lastEntry = null, lastV = 'curious', advance = 0, wp = null;
  const light = kind === 'threat' ? 0.15 : 0.85, near = press ? 8 : 12, far = press ? 12 : 20;
  for (let i = 0; i < secs * 120; i++) {
    const t = i * dt, px = me.x, pz = me.z, noises = [];
    const d = hyp(sim.x - me.x, sim.z - me.z), u = d || 1, b = mind.beh;
    if (V.dead) { R.died = true; R.diedT = t; break; }
    if (V.free) {
      let sp = 0, tx = me.x, tz = me.z;
      if (kind === 'nuisance') {
        if (!wp || hyp(wp.x - me.x, wp.z - me.z) < 1) { const a = (t * 0.37 + seed) % 6.283; wp = { x: sim.x + Math.sin(a) * 24, z: sim.z + Math.cos(a) * 24 }; }
        tx = wp.x; tz = wp.z; sp = 1.4;
        if (stones < 2 && t > 15 + stones * 20 && d < 25) { stones++; A.things.throw('stone', me.x, me.y, me.z, sim.x, sim.z, 'you', sim.py.x + 0.4); }
      } else {
        // hold 12-20 m: close in if far, give a little ground (walking) if it is right on top of you
        if (b && ['display', 'bluff'].includes(b.name) && kind === 'rival') advance = 2.2;
        if (advance > 0) { advance -= dt; tx = sim.x; tz = sim.z; sp = d > 7 ? 1.8 : 0; }
        else if (d > far) { tx = sim.x; tz = sim.z; sp = 1.5; }
        else if (d < near - 2) { tx = me.x + (me.x - sim.x) / u * 5; tz = me.z + (me.z - sim.z) / u * 5; sp = 1.2; }
        if (kind === 'rival') {
          if (t - shoutT > 10 && d < 24) { shoutT = t; noises.push({ x: me.x, y: me.y, z: me.z, loud: 0.7, kind: 'shout' }); }
          if (t > meatT) { meatT = t + 70; const a = sim.psi + 0.4; meatId = A.things.place('meat', sim.x + Math.sin(a) * 9, sim.z + Math.cos(a) * 9).id; }
          if (meatId && b && b.name === 'feed' && b.t > 4) {
            const o = A.things.get(meatId);
            if (!o) meatId = null; else { tx = o.x; tz = o.z; sp = 1.8; advance = 0; if (hyp(o.x - me.x, o.z - me.z) < 1.5) { A.take(meatId, 'you'); meatId = null; } }
          }
        } else {
          if (t - stoneT > 5 && d < 24 && d > 6) { stoneT = t; stones++; const h = sim.head.pos; A.things.throw('stone', me.x, me.y, me.z, h.x, h.z, 'you', h.y); }
          me.torch = d < 15;
          if (t > flareT && d < 22) { flareT = t + 45; A.things.throw('flare', me.x, me.y, me.z, sim.x + Math.sin(sim.psi) * 2, sim.z + Math.cos(sim.psi) * 2, 'you'); }
        }
      }
      const dx = tx - me.x, dz = tz - me.z, dl = hyp(dx, dz);
      if (dl > 0.2 && sp > 0) { me.x += dx / dl * sp * dt; me.z += dz / dl * sp * dt; }
      for (const q of T.obstacles) { const e = hyp(me.x - q.x, me.z - q.z); if (e < q.r + 0.4) { me.x = q.x + (me.x - q.x) / (e || 1) * (q.r + 0.4); me.z = q.z + (me.z - q.z) / (e || 1) * (q.r + 0.4); } }
      if (kind !== 'nuisance' || sp === 0) { me.fx = (sim.x - me.x) / u; me.fz = (sim.z - me.z) / u; }
      else { me.fx = dx / (dl || 1); me.fz = dz / (dl || 1); }
      const h = sim.head.pos, L = hyp(h.x - me.x, h.y - me.y, h.z - me.z) || 1; me.lx = (h.x - me.x) / L; me.ly = (h.y - me.y) / L; me.lz = (h.z - me.z) / L;
    } else { if (i % 20 === 0) A.struggle('you', 1); me.x = V.x; me.z = V.z; }
    me.y = T.height(me.x, me.z) + 1.7; me.vx = (me.x - px) / dt; me.vz = (me.z - pz) / dt; me.speed = V.free ? hyp(me.vx, me.vz) : 0;
    A.step(dt, { agents: [me], noises, light, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0;
    if (i % 12 === 0) {
      const v = mind.ap.verdict, s = mind.stance;
      if (v !== lastV) { lastV = v; R.verdicts.push(`${t.toFixed(0)}s:${v}`); }
      if (R.at === null && v === kind && kind !== 'nuisance') R.at = t;
      if (kind === 'nuisance' && R.at === null && v === 'nuisance') R.at = t;
      (R.at !== null ? R.stAfter : R.st)[s] = ((R.at !== null ? R.stAfter : R.st)[s] || 0) + 0.1;
      if (i % (120 * 30) === 0) R.lead.push(`${t.toFixed(0)}s r${mind.ap.rivalry.toFixed(2)} f${mind.ap.fear.toFixed(2)} g${mind.grudge.toFixed(2)}`);
      const S = mind.thinker.stream; let k = S.length - 1; while (k >= 0 && S[k] !== lastEntry) k--;
      for (let j = k + 1; j < S.length; j++) R.thoughts.push(`${S[j].t.toFixed(0)}s "${S[j].text}" [${S[j].cond}]`);
      if (S.length) lastEntry = S[S.length - 1];
    }
  }
  return R;
}

const res = { rival: [], threat: [], nuisance: [], press: [] };
const share = (o) => { const tot = Object.values(o).reduce((a, b) => a + b, 0) || 1; return Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${(100 * v / tot).toFixed(0)}%`).join(', '); };
for (const kind of ['rival', 'threat', 'nuisance', 'press']) for (const seed of SEEDS) {
  const r = run(seed, kind, kind === 'threat' ? Math.max(SECS, 540) : kind === 'press' ? 240 : SECS); res[kind].push(r);
  console.log(`\n== ${kind} s${seed}: reached ${r.at === null ? 'never' : (r.at / 60).toFixed(1) + ' min'}${r.died ? ' (died)' : ''}; verdicts ${r.verdicts.join(' ')}`);
  console.log(`   lead-up ${r.lead.join(' | ')}`);
  console.log(`   stance before: ${share(r.st)}${r.at !== null ? `; after: ${share(r.stAfter)}` : ''}`);
  if (!quiet && seed === SEEDS[0]) { const key = r.thoughts.filter((x) => /ap:|lead|rival|afraid|beh:(avoid|display|bluff|backoff)/.test(x)); console.log('   ' + key.slice(0, 16).join('\n   ')); }
}
const times = (a) => a.map((r) => (r.at === null ? 'never' : (r.at / 60).toFixed(1))).join(', ');
console.log(`\nTIME TO VERDICT (min): rival ${times(res.rival)}; threat ${times(res.threat)}; nuisance control ${times(res.nuisance)}`);
const sum = (a) => { const o = {}; for (const r of a) for (const [k, v] of Object.entries(r.stAfter)) o[k] = (o[k] || 0) + v; return o; };
const pressSt = sum(res.press), tot = Object.values(pressSt).reduce((x, y) => x + y, 0) || 1, sh = (k) => (pressSt[k] || 0) / tot;
console.log(`THREAT STANCES (reached threat): ${share(sum(res.threat))}`);
console.log(`PRESSING A THREAT (4 min each): stances ${share(pressSt)}; fleeing (afraid) ${(100 * sh('afraid')).toFixed(1)}%; deaths ${res.press.filter((r) => r.died).length}/${res.press.length} at ${res.press.map((r) => (r.died ? r.diedT.toFixed(0) + 's' : 'alive')).join(', ')}`);
console.log('CHECKS');
check(res.rival.filter((r) => r.at !== null && r.at < 300).length >= Math.ceil(0.6 * SEEDS.length), 'a determined rival gets there within five minutes for most animals');
check(res.threat.filter((r) => r.at !== null).length >= 1, 'a determined tormentor can make it a threat');
check(res.nuisance.every((r) => !r.verdicts.some((v) => v.endsWith('rival') || v.endsWith('threat'))), 'two stones are only a nuisance');
const after = (a, k) => a.filter((r) => r.at !== null).reduce((s, r) => s + (r.stAfter[k] || 0), 0) / (a.filter((r) => r.at !== null).reduce((s, r) => s + Object.values(r.stAfter).reduce((x, y) => x + y, 0), 0) || 1);
const reached = res.threat.filter((r) => r.at !== null);
check(reached.every((r) => r.at > 120), `a threat takes minutes of sustained effort (over 2; was ~1.2) ${times(res.threat)} min`);
const firm = sh('dominant') + sh('guarded') + sh('attacking') + after(res.threat, 'dominant') + after(res.threat, 'guarded') + after(res.threat, 'attacking');
check(sh('dominant') + sh('guarded') + sh('attacking') > 0.6, `a threat is faced, not fled (dominant+guarded+attacking ${(100 * (sh('dominant') + sh('guarded') + sh('attacking'))).toFixed(0)}% while pressed)`);
check(sh('afraid') < 0.05 && after(res.threat, 'afraid') < 0.05, `it never cowers (afraid ${(100 * sh('afraid')).toFixed(1)}% pressed, ${(100 * after(res.threat, 'afraid')).toFixed(1)}% after the verdict)`);
check(res.press.filter((r) => r.died).length >= Math.ceil(SEEDS.length / 2), 'pressing a threat gets you killed');
void firm;
check(after(res.rival, 'rival') + after(res.rival, 'angry') > 0.15, `a rival is faced down (rival+angry ${(100 * (after(res.rival, 'rival') + after(res.rival, 'angry'))).toFixed(0)}% after)`);
console.log(fail.length ? `\n${fail.length} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
if (fail.length) process.exitCode = 1;
