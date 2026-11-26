// A watcher at range: from the game's start a person walks toward the animal until it is D m off (default 25), then stands
// still facing it, watching, for SECS s (default 120). Being watched should change how it comes, not stop it coming.
// Per seed: time from the stand until the gap first closes below CLOSE m (15), the longest spell with no change of distance
// (+-0.5 m) or bearing (+-2 deg, seen from the person), death time, and the behaviours/thoughts along the way.
// node test/watch25.mjs [seeds=6] [secs=120] [D=25]   HUNGER=0.78 starts it that hungry; --dart: darts about first until the prey reflex fixes on it; --noopen [--from=50]: no game opening, the person starts that far off; --root=/path runs another tree; -v prints a trace
import { pathToFileURL, fileURLToPath } from 'node:url';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const pos = process.argv.slice(2).filter((x) => !x.startsWith('-'));
const N = +(pos[0] || 6), SECS = +(pos[1] || 120), D = +(pos[2] || 25), CLOSE = 15, dt = 1 / 120, hyp = Math.hypot, V_ = process.argv.includes('-v');
const ROOT = arg('root', fileURLToPath(new URL('..', import.meta.url))).replace(/\/$/, '');
const imp = (p) => import(pathToFileURL(ROOT + '/' + p).href);
const { makeTerrain } = await imp('src/terrain.js'), { Creature } = await imp('src/rex/body/rex.js'), { Mind } = await imp('src/rex/brain/mind.js'), { Arena } = await imp('src/sim/arena.js'), { LAYOUT } = await imp('src/paddock.js');
const SP = LAYOUT.spawn, rows = [], DART = process.argv.includes('--dart');
for (let seed = 1; seed <= N; seed++) {
  const T = makeTerrain(7), sim = new Creature(T, { x: SP.rex.x, z: SP.rex.z, yaw: SP.rex.yaw, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  const me = { id: 'you', x: SP.you.x, z: SP.you.z, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 1, fz: 0 };
  if (process.argv.includes('--noopen')) { const F = +arg('from', 50), dx = me.x - sim.x, dz = me.z - sim.z, l = hyp(dx, dz) || 1; me.x = sim.x + dx / l * F; me.z = sim.z + dz / l * F; }
  me.y = T.height(me.x, me.z) + 1.7; if (!process.argv.includes('--noopen')) A.opening(me);
  if (process.env.HUNGER) mind.hunger = +process.env.HUNGER;
  const Vc = A.victim('you');
  let dartT0 = null, fixedAtStand = null, standT = null, closeT = null, death = null, anchor = null, spell = 0, spellMax = 0, spellAt = 0, lab = '', th = '', behs = {}, thoughts = [], minD = 99;
  for (let i = 0; i < 400 * 120; i++) {
    const t = i * dt, px = me.x, pz = me.z, d = hyp(sim.x - me.x, sim.z - me.z);
    if (Vc.free) {
      // --dart: first at D m it darts side to side (0.7 s sprints every 2 s) until the prey reflex has fixed on it (or 25 s), as a
      // person who has just been running about would have it; then it stands and watches
      if (standT === null) { if (d > D + 0.3 && !dartT0) { const s = Math.min(d - D, 1.4 * dt); me.x += (sim.x - me.x) / d * s; me.z += (sim.z - me.z) / d * s; }
        else if (DART && (dartT0 === null || ((!mind.ap.fixed || t - dartT0 < 4) && t - dartT0 < 25))) { if (dartT0 === null) dartT0 = t; const ph = (t - dartT0) % 2, sg = Math.floor((t - dartT0) / 2) % 2 ? 1 : -1; if (ph < 0.7) { const ux = (sim.z - me.z) / d, uz = -(sim.x - me.x) / d; me.x += ux * sg * 6 * dt; me.z += uz * sg * 6 * dt; } if (d < D - 3) { me.x -= (sim.x - me.x) / d * 3 * dt; me.z -= (sim.z - me.z) / d * 3 * dt; } }
        else { standT = t; fixedAtStand = mind.ap.fixed; } }
      me.fx = (sim.x - me.x) / (d || 1); me.fz = (sim.z - me.z) / (d || 1);      // always looking at it
    } else { me.x = Vc.x; me.z = Vc.z; }
    me.y = T.height(me.x, me.z) + 1.7; me.vx = (me.x - px) / dt; me.vz = (me.z - pz) / dt; me.speed = Vc.free ? hyp(me.vx, me.vz) : 0;
    A.step(dt, { agents: [me], noises: [], light: 0.9, flash: false, wind: { x: 0, z: -1 } });
    for (const e of A.events) if (e.src === 'victim' && e.type === 'death' && death === null) death = t;
    A.events.length = 0;
    if (standT !== null) {
      const ts = t - standT, dd = hyp(sim.x - me.x, sim.z - me.z), br = Math.atan2(sim.x - me.x, sim.z - me.z);
      minD = Math.min(minD, dd);
      if (closeT === null && dd < CLOSE) closeT = ts;
      // (a still spell: no change of gap or bearing; counted only while it is beyond CLOSE: standing at arm's length sniffing is not a stall)
      if (!anchor || dd < CLOSE || Math.abs(dd - anchor.d) > 0.5 || Math.abs(Math.atan2(Math.sin(br - anchor.b), Math.cos(br - anchor.b))) > 0.035) { anchor = { d: dd, b: br }; spell = 0; } else { spell += dt; if (spell > spellMax) { spellMax = spell; spellAt = ts - spell; } }
      const L = mind.label + (mind.beh && mind.beh.phase ? '/' + mind.beh.phase : '');
      behs[L] = (behs[L] || 0) + dt;
      const tt = mind.voice && mind.voice.think;
      if (tt && tt !== th) { th = tt; thoughts.push(`${ts.toFixed(0)}:${tt}`); }
      if (V_ && L !== lab) { lab = L; console.log(`  s${seed} ${ts.toFixed(1).padStart(6)} ${L.padEnd(18)} d=${dd.toFixed(1)} r=${mind.peril.r.toFixed(2)} H=${mind.hunger.toFixed(2)} watched=${mind.ctx && mind.ctx.watched ? 1 : 0} | ${tt}`); }
      if (ts > SECS || death !== null) break;
    }
  }
  const r = { seed, standT, closeT, spellMax, spellAt, death: death === null ? null : death - (standT ?? 0), minD, behs, thoughts };
  rows.push(r);
  console.log(`s${seed} stand@${(standT ?? -1).toFixed(0)}s fixed=${fixedAtStand ? 1 : 0}  closes<${CLOSE}m ${closeT === null ? 'never' : closeT.toFixed(1) + ' s'}  longest still spell beyond ${CLOSE} m ${spellMax.toFixed(1)} s (from ${spellAt.toFixed(0)} s)  minD ${minD.toFixed(1)}  ${death === null ? 'alive' : 'dead +' + r.death.toFixed(0) + ' s'}`);
  console.log(`    behs ${Object.entries(behs).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + ' ' + v.toFixed(0)).join(', ')}`);
  console.log(`    thoughts ${thoughts.slice(0, 14).join(' | ')}`);
}
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const cl = rows.map((r) => r.closeT ?? SECS * 2);
console.log(`\nSUMMARY closes<${CLOSE}m: ${rows.map((r) => r.closeT === null ? 'never' : r.closeT.toFixed(0)).join(', ')} (median ${med(cl).toFixed(0)} s, never counted as ${SECS * 2})  longest still spell beyond ${CLOSE} m: ${rows.map((r) => r.spellMax.toFixed(0)).join(', ')} (median ${med(rows.map((r) => r.spellMax)).toFixed(0)} s, max ${Math.max(...rows.map((r) => r.spellMax)).toFixed(0)})  dead ${rows.filter((r) => r.death !== null).length}/${rows.length}`);
