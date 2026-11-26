// The opening: for each seed, you appear at the spawn (paddock LAYOUT.spawn) and stand looking about; does the animal notice
// you within a couple of seconds, turn, come to within thought range (30 m) and size you up, with no attack in the first 40 s?
// node test/opening.mjs [nSeeds=30] [--raw]  (--raw: without arena.opening(), as before)
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
import { LAYOUT } from '../src/paddock.js';
import { makeRng } from '../src/math.js';
const N = +(process.argv[2] || 30), raw = process.argv.includes('--raw'), SP = LAYOUT.spawn;
const ATT = ['butt', 'swipe', 'pin', 'seize', 'toy', 'pounce', 'test', 'prowl', 'snap', 'bluff', 'chase'];
let bad = 0; const sum = { att: [], d5: [], d15: [], d30: [] };
for (let s = 1; s <= N; s++) {
  const T = makeTerrain(7), sim = new Creature(T, { x: SP.rex.x, z: SP.rex.z, yaw: SP.rex.yaw, seed: s }), mind = new Mind(sim, s), A = new Arena(T, sim, mind, s);
  const wr = makeRng(s + 5), wind = { a: wr() * 6.283, s: 3 }, W = { x: Math.sin(wind.a) * 3, z: Math.cos(wind.a) * 3 };
  const me = { id: 'you', x: SP.you.x, z: SP.you.z, y: T.height(SP.you.x, SP.you.z) + 1.7, vx: 0, vz: 0, speed: 0, crouch: false, fx: 1, fz: 0 };
  if (!raw && A.opening) A.opening(me);
  let att = null, first = [], dd = {}, attack = null, minD = 99, close = null;
  for (let i = 0; i < 40 * 120; i++) {
    const t = i / 120, a = 0.6 * Math.sin(t * 0.5); me.fx = Math.sin(1.2 + a); me.fz = Math.cos(1.2 + a);      // looking about
    A.step(1 / 120, { agents: [me], noises: [], light: 0.9, flash: false, wind: W }); A.events.length = 0;
    const n = mind.beh && mind.beh.name; if (n && first[first.length - 1] !== n) first.push(n);
    if (att === null && (mind.know.seen || (mind.voice && mind.voice.look === 'you'))) att = t;
    const d = Math.hypot(sim.x - me.x, sim.z - me.z); minD = Math.min(minD, d); if (close === null && d < 30) close = t;
    for (const k of [5, 15, 30]) if (Math.abs(t - k) < 0.004) dd[k] = d;
    if (!attack && mind.peril && mind.peril.strikes) attack = 'strike@' + t.toFixed(1);
    if (!attack && n && ['butt', 'swipe', 'pin', 'seize', 'pounce', 'snap', 'bluff', 'chase'].includes(n)) attack = n + '@' + t.toFixed(1);
  }
  const ok = att !== null && att <= 2.5 && close !== null && close < 25 && !attack;
  if (!ok) bad++;
  sum.att.push(att ?? 99); sum.d5.push(dd[5]); sum.d15.push(dd[15]); sum.d30.push(dd[30]);
  console.log(`seed ${String(s).padStart(2)} attn ${att === null ? '-' : att.toFixed(1)}s  d5 ${dd[5].toFixed(0)} d15 ${dd[15].toFixed(0)} d30 ${dd[30].toFixed(0)} (<30m at ${close === null ? '-' : close.toFixed(0)}s, min ${minD.toFixed(0)})  ${first.slice(0, 6).join(' > ')}${attack ? '  ATTACK ' + attack : ''}${ok ? '' : '  <-- '}`);
}
const med = (a) => a.slice().sort((p, q) => p - q)[a.length >> 1];
console.log(`median attention ${med(sum.att).toFixed(1)} s, distance ${med(sum.d5).toFixed(0)} / ${med(sum.d15).toFixed(0)} / ${med(sum.d30).toFixed(0)} m at 5/15/30 s; ${N - bad}/${N} good`);
if (bad) process.exitCode = 1;
