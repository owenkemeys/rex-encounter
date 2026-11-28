// Lot B, played out headless: node test/lotrun.mjs [passive|decoy] [runs] [verbose]
// passive: the player never leaves the kiosk. decoy: a crude player who goes and thumps a far car whenever the visitors are pinned.
// Prints, per run, when each visitor moved on, escaped or died. For judging the pacing, not a pass/fail test.
import { makeLotPaddock, LOT_SEED } from '../src/lot.js';
import { makeTerrain } from '../src/terrain.js';
import { RexSim } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
import { LotMode } from '../src/sim/lotmode.js';

const mode = process.argv[2] || 'passive', runs = +(process.argv[3] || 5), verbose = !!process.argv[4];
const P = makeLotPaddock(+(process.env.LOT || LOT_SEED)), g = P.LAYOUT.spawns.gate;
const out = [];
for (let r = 0; r < runs; r++) {
  const seed = 100 + r * 17, terrain = makeTerrain(7, P);
  const sim = new RexSim(terrain, { x: g.rex.x, z: g.rex.z, yaw: g.rex.yaw, seed }), mind = new Mind(sim, seed), arena = new Arena(terrain, sim, mind, seed);
  arena.herd.disabled = true;
  const lot = new LotMode(terrain, P.lot), you = { x: g.guard.x, z: g.guard.z, vx: 0, vz: 0, dead: false };
  const DT = 1 / 120, log = []; let goal = null, tLast = '';
  if (process.env.OPENING) arena.opening({ x: you.x, z: you.z }); lot.activate(); mind.hunger = Math.max(mind.hunger, 0.6);
  for (let i = 0; i < 120 * 240 && lot.status === 'active'; i++) {
    const t = i * DT, n = [];
    if (mode === 'decoy' && !you.dead && t > 8) {      // walk to a locked car well away from the visitors' next run, thump it, shout, repeat
      const k = lot.kids.find((q) => q.state !== 'escaped' && q.state !== 'dead');
      if (k && (!goal || goal.car.alarmLeft <= 0 || t > goal.until)) {
        const nx = lot.stops[Math.min(k.stop + 1, lot.stops.length - 1)], nz = nx.z ?? nx.z0;
        const c = lot.cars.filter((c) => c.locked && c.alarmLeft > 0 && Math.hypot(c.x - k.x, c.z - k.z) > 22 && Math.hypot(c.x - nx.x, c.z - nz) > 22).sort((a, b) => Math.hypot(a.x - you.x, a.z - you.z) - Math.hypot(b.x - you.x, b.z - you.z))[0];
        goal = c ? { car: c, until: t + 40 } : null;
      }
      if (goal) {
        const dx = goal.car.x - you.x, dz = goal.car.z - you.z, d = Math.hypot(dx, dz);
        if (d > 2.2) { you.vx = dx / d * 5.5; you.vz = dz / d * 5.5; you.x += you.vx * DT; you.z += you.vz * DT; const p = { x: you.x, z: you.z }; terrain.pushOut(p, 0.35, 0.1, 1.6, 2); you.x = p.x; you.z = p.z; }
        else { you.vx = you.vz = 0; if (goal.car.alarmT <= 0) lot.interact(you, { flare: { n: 3, max: 3 } }, n); if (i % 360 === 0) n.push({ x: you.x, y: 1.6, z: you.z, loud: 0.9, kind: 'shout', you: true }); }
      }
    }
    const v = arena.victims.get('you'); if (v && v.dead && !you.dead) { you.dead = true; log.push(`${t.toFixed(0)}s YOU died`); }
    const hidden = (mode === 'passive' && !process.env.SEEN) || (mode === 'decoy' && Math.hypot(you.x - g.guard.x, you.z - g.guard.z) < 2 && !you.seen); if (!hidden) you.seen = true; const ag = [...(you.dead || hidden ? [] : [{ id: 'you', x: you.x, y: 1.7, z: you.z, vx: you.vx, vz: you.vz, speed: Math.hypot(you.vx, you.vz), crouch: false, fx: 0, fz: 1, torch: false }]), ...lot.extraAgents()];
    arena.things.extra = lot.extraLights();
    arena.step(DT, { agents: ag, noises: n, light: 0.4, flash: 0, wind: { x: 1, z: 0 } });
    lot.step(DT, sim, mind, arena, arena.things, n, you.dead);
    for (const e of lot.events) if (/kid|lotDone/.test(e.type)) log.push(`${t.toFixed(0)}s ${e.type}${e.id ? ' ' + e.id : ''}${e.to ? ' ->' + e.to : ''}${e.status ? ' ' + e.status : ''}`);
    lot.events.length = 0; arena.events.length = 0;
    if (verbose && i % 600 === 0) { const tg = mind.know.target; const s = `${t.toFixed(0)}s rex ${sim.x.toFixed(0)},${sim.z.toFixed(0)} v${Math.abs(sim.v).toFixed(1)} [${(mind.b && mind.b.kind) || mind.mode || ""}] "${mind.thought || ""}" tgt ${tg ? tg.id : '-'} | kids ${lot.kids.map((k) => `${k.state[0]}${k.stop}@${k.x.toFixed(0)},${k.z.toFixed(0)}`).join(' ')} | alarms ${lot.cars.filter((c) => c.alarmT > 0).length}`; if (s !== tLast) console.log(s); tLast = s; }
  }
  out.push(`run ${r}: ${lot.status} | ${log.join(' · ')}`);
}
console.log(out.join('\n'));
