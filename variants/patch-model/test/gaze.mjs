// Attention truthfulness: while the mind says it knows where you are, where is the head pointing?
// node test/gaze.mjs [seed...]  prints, per behaviour, the gaze-to-target angle (mean / p90 / share > 60 deg / > 120 deg / looking up > 35 deg)
// and, for the bad ticks, what was steering the head (a gesture's point, a glance, glare, no look, body could not turn).
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';
const seeds = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number); if (!seeds.length) seeds.push(3, 5, 8);
const dt = 1 / 120, D = 180 / Math.PI;
const SCRIPTS = {
  still_open: [120, (s) => { s.me.x = 0; s.me.z = 30; }],
  wander_near: [150, (s) => { s.me.x = Math.sin(s.t * 0.05) * 30; s.me.z = 20 + Math.cos(s.t * 0.07) * 15; }],
  orbit_close: [120, (s) => { s.me.x = s.sim.x + Math.sin(s.t * 0.12) * 16; s.me.z = s.sim.z + Math.cos(s.t * 0.12) * 16; }],
  approach_it: [100, (s, dt) => { if (s.t < 1e-6) { s.me.x = 3; s.me.z = 40; } const d = Math.hypot(s.sim.x - s.me.x, s.sim.z - s.me.z); if (s.t > 5 && d > 7) { s.me.x += (s.sim.x - s.me.x) / d * dt * 1.3; s.me.z += (s.sim.z - s.me.z) / d * dt * 1.3; } }],
  run_away: [60, (s, dt) => { if (s.t < 1e-6) { s.me.x = 0; s.me.z = 22; } if (s.t > 12 && s.t < 30) { s.me.z += dt * 5.5; s.me.x += dt * 2; } }],
  shout_behind: [60, (s) => { s.me.x = 0; s.me.z = -45; if (Math.abs(s.t - 10) < 1e-3) s.noises.push({ x: 0, y: 0, z: -45, loud: 0.6, kind: 'shout' }); }],
  stones: [70, (s) => { if (s.t < 1e-6) { s.me.x = s.sim.x + 20; s.me.z = s.sim.z + 14; } if ([8, 14, 20, 30, 40].some((T) => Math.abs(s.t - T) < 1e-3)) s.A.things.throw('stone', s.me.x, s.me.y, s.me.z, s.sim.x, s.sim.z, 'you', s.sim.py.x + 0.4); }],
  storm: [120, (s) => { s.me.x = 0; s.me.z = 28; if (Math.abs((s.t % 17) - 9) < 1e-3) s.noises.push({ x: 300, y: 0, z: 200, loud: 1, kind: 'thunder' }); }],
};
export function gazeRun(name, seed, { verbose = false } = {}) {
  const [secs, fn] = SCRIPTS[name];
  const T = makeTerrain(7), sim = new Creature(T, { x: 0, z: 0, yaw: 0.4, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  A.herd.disabled = true;
  const me = { id: 'you', x: 0, y: 0, z: 30, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1 };
  const s = { t: 0, me, sim, mind, A, T, noises: [] }, per = {}; let ep = 0, epB = '';
  for (let i = 0; i < secs * 120; i++) {
    s.t = Math.round(i * dt * 1e6) / 1e6; s.noises = [];
    const px = me.x, pz = me.z; fn(s, dt);
    me.y = T.height(me.x, me.z) + 1.7; me.vx = (me.x - px) / dt; me.vz = (me.z - pz) / dt; me.speed = Math.hypot(me.vx, me.vz);
    const dd = Math.hypot(sim.x - me.x, sim.z - me.z) || 1; me.fx = (sim.x - me.x) / dd; me.fz = (sim.z - me.z) / dd;
    const I = A.step(dt, { agents: [me], noises: s.noises, light: 0.85, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0;
    if (!mind.know.seen || !mind.beh) { ep = 0; continue; }
    if (i % 6) continue;
    const h = sim.head, tg = mind.know.target, dx = tg.x - h.pos.x, dy = tg.y - h.pos.y, dz = tg.z - h.pos.z, dl = Math.hypot(dx, dy, dz);
    const ang = Math.acos(Math.max(-1, Math.min(1, (h.f.x * dx + h.f.y * dy + h.f.z * dz) / dl))) * D, up = Math.asin(h.f.y) * D;
    // what the head was asked to look at, if anything, and how far that is from you
    const L = I.look, la = L ? Math.acos(Math.max(-1, Math.min(1, ((L.x - h.pos.x) * dx + (L.y - h.pos.y) * dy + (L.z - h.pos.z) * dz) / (Math.hypot(L.x - h.pos.x, L.y - h.pos.y, L.z - h.pos.z) * dl || 1)))) * D : null;
    const relBody = Math.abs(((Math.atan2(dx, dz) - sim.psi + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * D;
    // how far off it is beyond what the neck could do from where the chest points (the skull turns at most 1.7 rad off it)
    const relChest = Math.abs(((Math.atan2(dx, dz) - sim.chest.yaw + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * D, reach = Math.max(0, relChest - 1.7 * D);
    const ex = Math.max(0, ang - reach);
    const k = mind.beh.name, P = per[k] || (per[k] = { n: 0, a: [], gt60: 0, gt120: 0, up: 0, why: {} });
    // an attention shift the mind reports (it says it is looking at a sound, the sky, food, prey) is the truth, not a bug
    const shift = ['sound', 'sky', 'food', 'light', 'prey', 'belief', 'hole'].includes(mind.voice.look);
    if (ex > 45 && shift) P.shift = (P.shift || 0) + 1;
    if (ex > 45 && !shift) { ep += 0.05; if (ep > (P.ep || 0)) P.ep = ep; if (Math.abs(ep - 1.5) < 0.026) P.long = (P.long || 0) + 1; } else ep = 0;
    P.n++; P.a.push(ang); if (ang > 60) P.gt60++; if (ex > 45) P.ex45 = (P.ex45 || 0) + 1; if (ang > 120) P.gt120++; if (up > 35) P.up++;
    if (ang > 60) {
      const act = sim.act, why = act && act.pt && act.kind !== 'snap' ? 'gesture:' + act.kind : la != null && la > 45 ? 'look-elsewhere' : !L && !I.attention ? 'no-look' : relBody > 100 ? 'behind-body' : sim.att.kind !== 'brain' && sim.att.kind !== 'player' ? 'att:' + sim.att.kind : 'lag';
      P.why[why] = (P.why[why] || 0) + 1;
      if (verbose && ep > 1.5 && ep < 1.56) console.log(`  ${name} s${seed} t=${s.t.toFixed(1)} ${k}/${mind.beh.phase || ''} ex=${ex.toFixed(0)} headRel=${(((sim.head.yaw - sim.psi + 9.42) % 6.283 - 3.14)).toFixed(2)} chestRel=${(((sim.chest.yaw - sim.psi + 9.42) % 6.283 - 3.14)).toFixed(2)} fix=${Math.hypot(sim.fix.x - tg.x, sim.fix.z - tg.z).toFixed(1)}m goal=${I.goal?.kind} freeze=${!!I.freeze} probe=${I.probe ? I.probe.k : '-'} ang=${ang.toFixed(0)} up=${up.toFixed(0)} relBody=${relBody.toFixed(0)} look=${la?.toFixed(0)} act=${act?.kind} att=${sim.att.kind} why=${why}`);
    }
  }
  return per;
}
if (process.argv[1].endsWith('gaze.mjs')) {
  const tot = {}; let longs = 0;
  for (const seed of seeds) for (const name of Object.keys(SCRIPTS)) {
    const per = gazeRun(name, seed, { verbose: !!process.env.V });
    for (const [k, P] of Object.entries(per)) { const Q = tot[k] || (tot[k] = { n: 0, a: [], gt60: 0, gt120: 0, up: 0, why: {} }); Q.n += P.n; Q.ep = Math.max(Q.ep || 0, P.ep || 0); Q.long = (Q.long || 0) + (P.long || 0); Q.ex45 = (Q.ex45 || 0) + (P.ex45 || 0); Q.shift = (Q.shift || 0) + (P.shift || 0); Q.a.push(...P.a); Q.gt60 += P.gt60; Q.gt120 += P.gt120; Q.up += P.up; for (const [w, c] of Object.entries(P.why)) Q.why[w] = (Q.why[w] || 0) + c; }
  }
  let all = 0, bad = 0, badx = 0, allx = 0;
  console.log('behaviour   samples  mean  p90  >60%  >120%  up>35%  beyondNeck>45%  reported%  longest  eps>1.5s  causes of >60   (episodes: beyond what the neck allows > 45 deg)');
  for (const [k, Q] of Object.entries(tot).sort((a, b) => b[1].n - a[1].n)) {
    const a = Q.a.sort((x, y) => x - y), mean = a.reduce((x, y) => x + y, 0) / a.length; all += Q.n; bad += Q.gt60; badx = (badx || 0) + (['leave', 'roam', 'feign', 'answer'].includes(k) ? 0 : Q.ex45 || 0); allx = (allx || 0) + (['leave', 'roam', 'feign', 'answer'].includes(k) ? 0 : Q.n); if (!['leave', 'roam', 'feign', 'answer'].includes(k)) longs += Q.long || 0;
    console.log(`${k.padEnd(11)} ${String(Q.n).padStart(7)} ${mean.toFixed(0).padStart(5)} ${a[Math.floor(a.length * 0.9)].toFixed(0).padStart(4)} ${(100 * Q.gt60 / Q.n).toFixed(1).padStart(5)} ${(100 * Q.gt120 / Q.n).toFixed(1).padStart(6)} ${(100 * Q.up / Q.n).toFixed(1).padStart(7)} ${(100 * (Q.ex45 || 0) / Q.n).toFixed(1).padStart(14)} ${(100 * (Q.shift || 0) / Q.n).toFixed(1).padStart(9)} ${(Q.ep || 0).toFixed(1).padStart(7)}s ${String(Q.long || 0).padStart(8)}  ${JSON.stringify(Q.why)}`);
  }
  console.log(`ALL seen ticks: ${all}, gaze > 60 deg off target: ${(100 * bad / all).toFixed(1)}%; attending you and > 45 deg beyond the neck's reach: ${(100 * badx / allx).toFixed(2)}%; unreported episodes > 1.5 s while attending you (not leave/roam/feign/answer): ${longs}`);
}
