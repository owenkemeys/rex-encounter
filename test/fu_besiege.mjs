// Follow-up probe: attend.mjs's besiege scenario, behaviour/position each second.  node test/fu_besiege.mjs seed [--src=DIR] [--secs=70]
import { pathToFileURL } from 'node:url';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const SRC = arg('src', new URL('../src', import.meta.url).pathname), seed = +(process.argv[2] || 1), SECS = +arg('secs', 70);
const imp = (p) => import(pathToFileURL(SRC + p).href);
const { makeTerrain } = await imp('/terrain.js'), { Creature } = await imp('/rex/body/rex.js'), { Mind } = await imp('/rex/brain/mind.js'), { Arena } = await imp('/sim/arena.js');
const dt = 1 / 120, hyp = Math.hypot;
const T = makeTerrain(7), St = T.structures.find((s) => s.kind === 'barn') || T.structures[0], O = St.openings[0], nl = hyp(O.nx, O.nz) || 1;
const back = +arg("back", 24), rx = O.x + O.nx / nl * back, rz = O.z + O.nz / nl * back, yaw = Math.atan2(St.cx - rx, St.cz - rz), h = St.hide || { x: St.cx, z: St.cz };
const me = { id: 'you', x: O.x + O.nx / nl * 7, z: O.z + O.nz / nl * 7, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1 };
const sim = new Creature(T, { x: rx, z: rz, yaw, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
A.herd.list.length = 0; A.herd.disabled = true;
let hide = { x: O.x, z: O.z, next: h }, inside = false, last = null; const V = A.victim('you');
for (let i = 0; i < SECS * 120; i++) {
  const t = i * dt, px = me.x, pz = me.z;
  if (V.free) { if (t > 4 && !inside) { const d = hyp(hide.x - me.x, hide.z - me.z); if (d < 0.3) { if (hide.next) hide = hide.next; else inside = true; } else { me.x += (hide.x - me.x) / d * 3 * dt; me.z += (hide.z - me.z) / d * 3 * dt; } } } else if (V.handled) { me.x = V.x; me.z = V.z; }
  me.y = T.height(me.x, me.z) + 1.7; const fl = hyp(sim.x - me.x, sim.z - me.z) || 1; me.fx = (sim.x - me.x) / fl; me.fz = (sim.z - me.z) / fl;
  me.vx = (me.x - px) / dt; me.vz = (me.z - pz) / dt; me.speed = V.free ? hyp(me.vx, me.vz) : 0;
  A.step(dt, { agents: [me], noises: [], light: 0.85, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0;
  const st = mind.thinker.stream; let k = st.length - 1; while (k >= 0 && st[k] !== last) k--;
  for (const e of st.slice(k + 1)) console.log(`   ${t.toFixed(1)} thought key=${e.key} kind=${e.kind} cond=${e.cond || ''} about=${e.about || ''}`);
  last = st[st.length - 1];
  if (i % 120 === 0) { const b = mind.beh; console.log(`${t.toFixed(0).padStart(3)} beh=${b ? b.name + '/' + (b.sub || b.phase || '') : '-'} d=${hyp(sim.x - me.x, sim.z - me.z).toFixed(1)} pos=${sim.x.toFixed(1)},${sim.z.toFixed(1)} seen=${mind.know.seen ? mind.know.via : 0} gaveUp=${mind.mem.gaveUp ? JSON.stringify(mind.mem.gaveUp).slice(0, 60) : ''} int=${(mind.interest ?? 0).toFixed?.(2) ?? ''} free=${V.free}`); }
}
