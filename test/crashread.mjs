// node test/crashread.mjs [key] [trace]: the crash tests of main.js (CRASH table), headless: does a crash READ? Each scenario is
// run twice in one sim (reset between, as the "Again" button does) and the body's answer to the knock is measured: speed lost,
// how far the snout comes back off what it hit, how far the hips come back, the peak pitch / roll / heading change, and how long
// the snout stays within 0.5 m of where it struck. `trace` prints the 0.1 s rows of the first run.
import { makeTerrain } from '../src/terrain.js';
import { RexSim } from '../src/sim/rex.js';
const CRASH = {
  headon: { rex: [-9, 70, -Math.PI / 2], pace: 9, drive: true }, glancing: { rex: [-22.4, 50, Math.atan2(-1.8, 20)], pace: 9.5, drive: true },
  corner: { rex: [-21.5, 48, 0], pace: 9.5, to: [-46, 77] }, barn: { rex: [30, 40, 0], pace: 9, drive: true }, gate: { rex: [-7, 68, 0], pace: 9, drive: true },
  post: { rex: [-1.6, -42, 0], pace: 9, drive: true }, bamboo: { rex: [-58, 40, -Math.PI / 2], pace: 9, drive: true },
};
const only = process.argv[2] && CRASH[process.argv[2]] ? process.argv[2] : null, trace = process.argv.includes('trace');
export function run(sim, C, secs = 7, rows = null) {
  sim.reset(C.rex[0], C.rex[1], C.rex[2]); sim.events.length = 0;
  const ev = []; let k = null; const m = { v0: 0, vmin: 9, back: 0, hipBack: 0, pitch: 0, roll: 0, yaw: 0, stuck: 0, headUp: 0 };
  for (let i = 0; i < secs * 120; i++) {
    const t = i / 120, goal = C.drive ? { kind: 'drive', throttle: 1, steer: 0 } : { kind: 'approach', id: 1, x: C.to[0], z: C.to[1], stop: 0.5, quick: true };
    const vb = sim.v; sim.step(1 / 120, { goal, pace: C.pace, burst: false, agitation: 0, attention: null });
    for (const e of sim.events) if (e.type === 'contact') { ev.push({ t, part: e.part, surface: e.surface, force: e.force }); if (!k && (e.force > 2.5 || e.part === 'torso' || e.part === 'hips')) k = { t, v: vb, hx: sim.head.pos.x, hy: sim.head.pos.y, hz: sim.head.pos.z, x: sim.x, z: sim.z, psi: sim.psi, nx: e.nx, nz: e.nz }; }
    sim.events.length = 0;
    if (k) { const H = sim.head.pos, back = (H.x - k.hx) * k.nx + (H.z - k.hz) * k.nz, hb = (sim.x - k.x) * k.nx + (sim.z - k.z) * k.nz, dt = t - k.t;
      if (dt < 2.5) { m.vmin = Math.min(m.vmin, sim.v); m.back = Math.max(m.back, back); m.hipBack = Math.max(m.hipBack, hb); m.pitch = Math.max(m.pitch, Math.abs(sim.pPitch.x)); m.roll = Math.max(m.roll, Math.abs(sim.pRoll.x)); m.yaw = Math.max(m.yaw, Math.abs(Math.atan2(Math.sin(sim.psi - k.psi), Math.cos(sim.psi - k.psi)))); m.headUp = Math.max(m.headUp, H.y - k.hy); if (Math.hypot(H.x - k.hx, H.z - k.hz) < 0.5) m.stuck += 1 / 120; }
      if (rows && Math.abs(dt * 10 - Math.round(dt * 10)) < 1e-6 && dt <= 3) rows.push(`  +${dt.toFixed(1)} v ${sim.v.toFixed(2)} snoutBack ${back.toFixed(2)} hipBack ${hb.toFixed(2)} headY ${(H.y - k.hy).toFixed(2)} pitch ${sim.pPitch.x.toFixed(3)} roll ${sim.pRoll.x.toFixed(3)} yaw ${(sim.psi - k.psi).toFixed(2)} hipY ${(sim.py.x - sim.groundY).toFixed(2)} dip ${sim.chestDip.x.toFixed(2)} tilt ${sim.head.tilt.x.toFixed(2)}`); }
  }
  return { k, ev, m };
}
if (import.meta.url === `file://${process.argv[1]}`) for (const key of Object.keys(CRASH)) {
  if (only && key !== only) continue;
  const T = makeTerrain(7), sim = new RexSim(T, { seed: 3 });
  for (const pass of [1, 2]) { const rows = trace && pass === 1 ? [] : null, { k, ev, m } = run(sim, CRASH[key], 7, rows);
    console.log(`${key.padEnd(8)} run ${pass}: ${k ? `knock ${k.t.toFixed(2)} s at ${k.v.toFixed(1)} m/s` : 'NO KNOCK'}; events ${ev.length} [${ev.slice(0, 4).map(e => `${e.t.toFixed(2)} ${e.part}/${e.surface}/${e.force}`).join(', ')}]` + (k ? `; v min ${m.vmin.toFixed(2)}; snout back ${m.back.toFixed(2)} m, up ${m.headUp.toFixed(2)}; hips back ${m.hipBack.toFixed(2)} m; pitch ${m.pitch.toFixed(2)} roll ${m.roll.toFixed(2)} yaw ${m.yaw.toFixed(2)} rad; snout within 0.5 m of the spot ${m.stuck.toFixed(2)} s` : ''));
    if (rows) console.log(rows.join('\n')); }
}
