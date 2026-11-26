// Hiding inside: a person walks in (in plain view) to a hiding place in a structure, stays STAY s, then walks out of the way out
// nearest the hiding place and on away from it (30 m, at SPD m/s). Per run: caught on leaving (seized, knocked down or dead within
// 40 s of stepping out), how many distinct ways in its head went to while he was inside (snout tip within 2.5 m of an opening, or
// inside the footprint), how much time its head spent inside, where it was when he came out, and its behaviours.
// node test/hideout.mjs [seeds=4] [stay=300] [where=barn,loft] [--speed=1.6] [--root=/path] [-v]
import { pathToFileURL, fileURLToPath } from 'node:url';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const pos = process.argv.slice(2).filter((x) => !x.startsWith('-'));
const N = +(pos[0] || 4), STAY = +(pos[1] || 300), WHERE = (pos[2] || 'barn,loft').split(','), SPD = +arg('speed', 1.6), dt = 1 / 120, hyp = Math.hypot, VB = process.argv.includes('-v');
const ROOT = arg('root', fileURLToPath(new URL('..', import.meta.url))).replace(/\/$/, '');
const imp = (p) => import(pathToFileURL(ROOT + '/' + p).href);
const { makeTerrain } = await imp('src/terrain.js'), { Creature } = await imp('src/rex/body/rex.js'), { Mind } = await imp('src/rex/brain/mind.js'), { Arena } = await imp('src/sim/arena.js'), { Nav } = await imp('src/rex/body/nav.js');
const all = {};
for (const where of WHERE) {
  all[where] = [];
  for (let seed = +(process.env.SEED0 || 1); seed <= N; seed++) {
    const T = makeTerrain(7), barn = T.structures.find((s) => s.kind === 'barn'), loft = T.structures.find((s) => s.id === 'loft' || (s.kind === 'tower' && Math.hypot(s.cx - barn.cx, s.cz - barn.cz) < 25));
    const S = barn, up = where === 'loft';
    const hide = up ? { x: 46.2, z: 68.5 } : barn.hide, floorY = up ? loft.base + 3.0 : null;
    // the way out nearest the hiding place (a door: ground-level openings of the barn), and where he goes after
    let O = S.openings[0], bd = 1e9; for (const o of S.openings) { const d = hyp(o.x - hide.x, o.z - hide.z); if (d < bd) { bd = d; O = o; } }
    const nl = hyp(O.nx, O.nz) || 1, nx = O.nx / nl, nz = O.nz / nl;
    const ladder = up ? { x: 41.8, z: 72 } : null;
    // the animal starts 24-34 m out from that door, on open ground (as test/probe.mjs)
    const NV = new Nav(T); let ax = O.x + nx * 28, az = O.z + nz * 28;
    found: for (const d of [28, 24, 34]) for (const da of [0, 0.4, -0.4, 0.8, -0.8]) { const x = O.x + (nx * Math.cos(da) - nz * Math.sin(da)) * d, z = O.z + (nz * Math.cos(da) + nx * Math.sin(da)) * d; if (NV.costAt(x, z) < 1.3 && !(T.depthAt && T.depthAt(x, z) > 0)) { ax = x; az = z; break found; } }
    const sim = new Creature(T, { x: ax, z: az, yaw: Math.atan2(O.x - ax, O.z - az), seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
    A.herd.list.length = 0;
    if (process.env.HUNGER) mind.hunger = +process.env.HUNGER;
    const out = [{ x: O.x + nx * 1.5, z: O.z + nz * 1.5 }, { x: O.x - nx * 1.2, z: O.z - nz * 1.2 }];
    const pathIn = [{ x: O.x + nx * 7, z: O.z + nz * 7 }, ...out, ...(up ? [ladder, 'up', hide] : [hide])];
    const pathOut = [...(up ? [ladder, 'down'] : []), out[1], out[0], { x: O.x + nx * 31, z: O.z + nz * 31 }];
    const me = { id: 'you', x: pathIn[0].x, z: pathIn[0].z, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: -nx, fz: -nz };
    const V = A.victim('you');
    let caughtStay = null, path = pathIn, leg = 1, onFloor = false, phase = 'pre', inT = null, outT = null, exitT = null, caught = null, death = null;
    const tested = new Set(), allOps = [...barn.openings.map((o, i) => ['b' + i, o]), ...(loft ? loft.openings.map((o, i) => ['l' + i, o]) : [])];
    const entries = []; let headIn = 0, lab = '', behs = {}, atExit = null, thoughts = [];
    const inFoot = (St, x, z) => { const dx = x - St.cx, dz = z - St.cz, c = Math.cos(St.yaw || 0), s = Math.sin(St.yaw || 0), lx = dx * c - dz * s, lz = dx * s + dz * c; return Math.abs(lx) < St.hw && Math.abs(lz) < St.hd; };
    for (let i = 0; i < (STAY + 140) * 120; i++) {
      const t = i * dt, px = me.x, pz = me.z;
      if (V.free) {
        if (phase === 'pre' && t > 8) phase = 'in';
        if ((phase === 'in' || phase === 'out') && leg < path.length) {
          const g = path[leg];
          if (g === 'up') { onFloor = true; leg++; } else if (g === 'down') { onFloor = false; leg++; }
          else { const dx = g.x - me.x, dz = g.z - me.z, d = hyp(dx, dz), st = Math.min(d, SPD * dt); if (d > 0.01) { me.x += dx / d * st; me.z += dz / d * st; me.fx = dx / d; me.fz = dz / d; } if (d < 0.05) leg++; }
          if (phase === 'in' && leg >= path.length) { phase = 'stay'; inT = t; }
          if (phase === 'out' && exitT === null && leg >= path.length - 1) { exitT = t; atExit = { d: hyp(sim.x - me.x, sim.z - me.z), beh: mind.label, seen: mind.know.seen }; }
          if (phase === 'out' && leg >= path.length) phase = 'gone';
        }
        if (phase === 'stay' && t - inT > STAY) { phase = 'out'; path = pathOut; leg = 0; outT = t; }
      } else { me.x = V.x; me.z = V.z; if (caught === null) { if (phase === 'stay' || phase === 'in' || phase === 'pre') caughtStay = t - (inT ?? t); else caught = t - outT; } if (i % 30 === 0) A.struggle('you', 1); }
      me.y = (onFloor ? floorY : T.height(me.x, me.z)) + 1.7; me.vx = (me.x - px) / dt; me.vz = (me.z - pz) / dt; me.speed = V.free ? hyp(me.vx, me.vz) : 0;
      A.step(dt, { agents: [me], noises: [], light: 0.9, flash: false, wind: { x: 0, z: -2 } });
      for (const e of A.events) if (e.src === 'victim' && e.type === 'death' && death === null) death = t;
      A.events.length = 0;
      if (phase === 'stay') {
        const h = sim.head, HL = sim.species.dims.headLen, tx = h.pos.x + h.f.x * HL, ty = h.pos.y + h.f.y * HL, tz = h.pos.z + h.f.z * HL;
        for (const [k, o] of allOps) if (hyp(tx - o.x, tz - o.z) < 2.5 && Math.abs(ty - (o.y ?? 1)) < 2.5) tested.add(k);
        if (inFoot(barn, tx, tz)) { headIn += dt; if (!entries.some((q) => hyp(q.x - tx, q.z - tz) < 3.5)) entries.push({ x: tx, z: tz }); }
        const L = mind.label + (mind.beh && mind.beh.phase ? '/' + mind.beh.phase : ''); behs[L] = (behs[L] || 0) + dt;
        const tt = mind.voice && mind.voice.think; if (tt && thoughts[thoughts.length - 1] !== tt) thoughts.push(tt);
        if (VB && L !== lab) { lab = L; console.log(`   ${where} s${seed} ${(t - inT).toFixed(0).padStart(4)} ${L.padEnd(18)} rex (${sim.x.toFixed(1)},${sim.z.toFixed(1)}) d ${hyp(sim.x - me.x, sim.z - me.z).toFixed(1)} H ${mind.hunger.toFixed(2)} | ${tt}`); }
      }
      if (VB && phase === 'out' && i % 120 === 0) console.log(`   ${where} s${seed} out +${(t - outT).toFixed(0)} P=${mind.peril.stage} beh.done=${mind.beh && mind.beh.done ? 1 : 0} V=${V.state} ${mind.label}/${mind.beh && mind.beh.phase} d ${hyp(sim.x - me.x, sim.z - me.z).toFixed(1)} seen ${mind.know.seen ? 1 : 0} sp ${JSON.stringify(mind.senseParts(me, { light: 0.9, flash: false }), (k, v) => typeof v === 'number' ? +v.toFixed(2) : v)} ev ${(mind.know.ev || 0).toFixed(2)} hdF ${(() => { const h = sim.head; return (Math.atan2(me.x - h.pos.x, me.z - h.pos.z) - Math.atan2(h.f.x, h.f.z)).toFixed(2); })()} | ${mind.voice && mind.voice.think}`);
      if (death !== null || (exitT !== null && t - exitT > 40)) break;
      if (caughtStay !== null) break;
    }
    if (caught === null && caughtStay === null && death !== null) { if (outT !== null && death >= outT) caught = death - outT; else caughtStay = death - (inT ?? death); }
    // the places its snout got inside the barn's walls (merged within 3.5 m): one per way in it really got its head through
    const places = entries;
    const r = { seed, caught, places: places.length, caughtStay, exitT: exitT !== null && outT !== null ? exitT - outT : null, death, tested: tested.size, headIn, atExit, behs, thoughts };
    all[where].push(r);
    console.log(`${where} s${seed}: ${caughtStay !== null ? 'TAKEN WHILE HIDING at ' + caughtStay.toFixed(0) + ' s' : caught === null ? 'got away' : 'CAUGHT leaving, ' + caught.toFixed(1) + ' s after setting off (door at ' + (exitT !== null ? (exitT - outT).toFixed(1) : '-') + ' s)'}${death !== null ? ' (dead)' : ''}  doors/hatches tried ${tested.size} [${[...tested].join(',')}], places its snout got in ${places.length}  head inside ${headIn.toFixed(0)} s  at exit: ${atExit ? atExit.beh + ' ' + atExit.d.toFixed(1) + ' m seen ' + (atExit.seen ? 1 : 0) : '-'}`);
    console.log(`    behs ${Object.entries(behs).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k, v]) => k + ' ' + v.toFixed(0)).join(', ')}`);
  }
}
console.log('\nSUMMARY');
for (const [w, R] of Object.entries(all)) {
  const cg = R.filter((r) => r.caught !== null), ins = R.filter((r) => r.caughtStay !== null), med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
  console.log(`  ${w}: caught on leaving ${cg.length}/${R.length} (median ${isNaN(med(cg.map((r) => r.caught))) ? '-' : med(cg.map((r) => r.caught)).toFixed(1)} s after setting off), taken while hiding ${ins.length}/${R.length}, doors/hatches tried ${R.map((r) => r.tested).join(',')}, places snout got in ${R.map((r) => r.places).join(',')}, head inside ${R.map((r) => r.headIn.toFixed(0)).join(',')} s, besiege share ${R.map((r) => (100 * Object.entries(r.behs).filter(([k]) => k.startsWith('besiege')).reduce((a, [, v]) => a + v, 0) / STAY).toFixed(0)).join(',')}%`);
}
