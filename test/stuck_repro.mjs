// node test/stuck_repro.mjs <seed> <mode: strike|script> <crash:1|0> [flare:0|1] [verbose]
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
const seed = +(process.argv[2] || 1), mode = process.argv[3] || 'script', crash = process.argv[4] !== '0', flare = process.argv[5] === '1', V = !!process.argv[6], dt = 1 / 120, hyp = Math.hypot;
const PATCH = (process.env.PATCH || '').split(',');
const T = makeTerrain(7);
const sim = new Creature(T, { x: 12, z: 70, yaw: -Math.PI / 2, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
A.herd.list.length = 0; A.herd.disabled = true; mind.hunger = 1;
if (PATCH.includes('nocrashreel')) { const o = sim._crash.bind(sim); }
if (PATCH.includes('noOnCrash')) mind._onCrash = () => {};
const me = { id: 'you', x: +(process.env.PX || (crash ? -15 : 5)), z: +(process.env.PZ || 70), y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 1, fz: 0, lx: 1, ly: 0, lz: 0 }; me.y = T.height(me.x, me.z) + 1.65;
const v = A.victim('you'); v.x = me.x; v.z = me.z; v.y = me.y;
{ const orig = mind.step.bind(mind); mind.step = (d, w) => { const I = orig(d, w); if (process.env.DRIVE && killT !== null && tNow < killT + +process.env.DRIVE) { I.goal = { kind: 'drive', throttle: 1, steer: 0 }; I.pace = 9; } return I; }; } let killT = null, respT = null, i0 = 0;
const world = (agents) => ({ agents, noises: [], light: 0.85, flash: false, wind: { x: 0, z: -2 } });
let tNow = 0; { const P = mind.peril, os = P._strike.bind(P), ok = P.onKill.bind(P); P._strike = (a) => { if (process.env.TRACE) console.log(new Error().stack.split('\n')[2].trim().slice(0,90), tNow.toFixed(3), '_strike called: stage', P.stage, 'a.dead', !!a.dead, 'a.state', a.state, 'victim.dead', v.dead); return os(a); }; P.onKill = () => { if (process.env.TRACE) console.log(tNow.toFixed(3), 'peril.onKill, stage was', P.stage); return ok(); }; } let lastThought = '', lastTT = 0, seenSecs = 0, nowS = 0;
for (let i = 0; i < 150 * 120; i++) {
  const t = i * dt; tNow = t;
  if (v.state === 'free' && !v.dead) { me.x = v.x; me.z = v.z; }
  if (killT === null && mode === 'script' && sim.v > +(process.env.KV || 5) && sim.x < +(process.env.KX || -14)) { v.kill('rex', 'prey'); killT = t; }
  if (killT !== null && respT === null && t > killT + 10) { const r = A.respawn('you', sim.x + (process.env.RDX ? +process.env.RDX : 60), sim.z + +(process.env.RDZ || 0)); me.x = r.x; me.z = r.z; respT = t; me.y = T.height(me.x, me.z) + 1.65; }
  if (respT !== null && !v.dead) { // walk to 12 m
    const tx = process.env.RDX ? me.x : sim.x + 12, tz = process.env.RDX ? me.z : sim.z; const d = hyp(tx - me.x, tz - me.z); if (d > 0.1 && v.state === 'free') { const s = Math.min(d, 1.6 * dt); me.x += (tx - me.x) / d * s; me.z += (tz - me.z) / d * s; v.x = me.x; v.z = me.z; }
    me.fx = (sim.x - me.x) / 12; me.fz = (sim.z - me.z) / 12;
  } else { const fl = hyp(sim.x - me.x, sim.z - me.z) || 1; me.fx = (sim.x - me.x) / fl; me.fz = (sim.z - me.z) / fl; }
  if (process.env.TELE && killT !== null && !globalThis.tele && t >= killT + 0.2) { globalThis.tele = 1; sim.x = -8; sim.z = 70; sim.psi = -Math.PI / 2; sim.psiV = -Math.PI / 2; sim.v = 8.5; }
  A.step(dt, world(v.dead && respT === null ? [] : [me]));
  const evs = A.events.splice(0); if (PATCH.includes('zeroblink')) sim.blink = 0; if (PATCH.includes('unquiet')) mind.peril.quiet = false; if (PATCH.includes('fix') && mind.peril.stage === 'strike' && (!sim.act || sim.act.kind !== 'strike')) { mind.peril.stage = 'calm'; mind.peril.quiet = false; }
  for (const e of evs) if (V && /death|remains/.test(e.type)) console.log(t.toFixed(2), 'EVENT', e.type);
  if (v.dead && killT === null) killT = t;
  const th = mind.thinker.stream.length ? mind.thinker.stream[mind.thinker.stream.length - 1] : null; if (th) { lastThought = th.text; lastTT = th.t; }
  if (killT !== null && i % +(process.env.EV || 120) === 0 && t - killT < 90 || (V && killT !== null && t - killT < 4 && i % 24 === 0)) {
    const b = mind.beh, K = mind.know, C = sim.crashS || {};
    console.log(`x${sim.x.toFixed(1)} z${sim.z.toFixed(1)} psi${sim.psi.toFixed(2)} t+${(t - killT).toFixed(1)} beh ${b && b.name}/${b && b.phase || ''} t${b && b.t.toFixed(0)}/${b && b.dur && b.dur.toFixed(0)} done${b && b.done ? 1 : 0} v${0} sp${(sim.v || 0).toFixed(1)} seen${K.seen ? 1 : 0} tgt${K.target ? K.target.id : '-'} focus ${mind.focus ? mind.focus.kind || mind.focus.id : '-'} peril ${mind.peril.stage}/${mind.peril.quiet ? 'Q' : '-'} busy${mind.peril.busy ? 1 : 0} wary${mind.wary ? 1 : 0} blink${sim.blink.toFixed(2)} dz${mind.dazzle ? mind.dazzle[1].toFixed(1) : '-'} lid${sim.lid.toFixed(2)} sq${sim.squint.toFixed(2)} act ${sim.act && sim.act.kind} crash ${C.t?.toFixed?.(1)}/${C.dur?.toFixed?.(1)}/${C.reel?.toFixed?.(2)} hun${mind.hunger.toFixed(2)} hf${sim.head.f.y.toFixed(2)} hyaw${(sim.head.yaw||0).toFixed(2)} ev${mind.know.ev.toFixed(2)} d${hyp(me.x - sim.x, me.z - sim.z).toFixed(0)} "${lastThought}"@${lastTT.toFixed(0)}`);
  }
  if (killT !== null && t > killT + +(process.env.AFTER || 90)) break;
}
console.log('killT', killT, 'respT', respT);
