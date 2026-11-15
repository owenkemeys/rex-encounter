// Headless attack scenarios: what it takes for the animal to lay hold of a person, what it does, and that it always ends
// with the person released and able to get up.  node test/attack.mjs [scenario|all] [seed] [--quiet]
// Each scripted person reacts to what is done to them: 'fight' mashes keys whenever handled, 'limp' goes still.
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';

const dt = 1 / 120;
const SC = {
  // no provocation, ordinary appetite, standing in plain view: cautious curiosity, never contact
  default: { secs: 150, at: [0, 14], hunger: 0.5 },
  default_close: { secs: 150, at: [0, 9], hunger: 0.55 },
  // stones that hit, from close: it warns, then (if you keep on) knocks you down, and escalates if you get up and carry on
  stones: { secs: 150, at: [7, 9], throwEvery: 7, mode: 'fight' },
  stones_limp: { secs: 120, at: [7, 9], throwEvery: 7, stopAfterHandled: true, mode: 'limp' },
  // a lamp held in its eyes at night
  torch: { secs: 150, at: [2, 11], torch: true, light: 0.15, mode: 'fight' },
  // you walk up to the meat it is eating
  food: { secs: 150, meat: [0, 8], at: [6, 22], walkTo: 'meat', hunger: 0.8, mode: 'fight' },
  // real hunger and a small thing close by
  hungry: { secs: 150, at: [3, 11], hunger: 0.97, holdHunger: true, mode: 'fight' },
  hungry_limp: { secs: 150, at: [3, 11], hunger: 0.97, holdHunger: true, mode: 'limp' },
  // standing behind it after a stone
  behind: { secs: 80, at: [0, -6], throwEvery: 9, behind: true, mode: 'fight' },
};

export function attackRun(name, seed = 3, { quiet = false } = {}) {
  const S = SC[name], T = makeTerrain(7), sim = new Creature(T, { x: 0, z: 0, yaw: 0, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  A.herd.disabled = true;
  if (S.hunger) mind.hunger = S.hunger; if (S.holdHunger) mind.ov.hold.hunger = S.hunger;
  let meat = null; if (S.meat) meat = A.things.place('meat', S.meat[0], S.meat[1]), meat.amount = 6;
  const me = { id: 'you', x: S.at[0], z: S.at[1], y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1, torch: false, lx: 0, ly: 0, lz: 1 };
  const V = A.victim('you'), log = [], counts = {}, ev = {}; let lastB = null, lastVoice = '', thrown = 0, handledT = 0, maxHeld = 0, heldT = 0, maxPinned = 0, pinnedT = 0, nan = false, stopThrow = false, firstContact = null, warnBefore = false;
  const say = (t, s) => { if (!quiet) log.push(`${t.toFixed(1).padStart(6)}s ${s}`); };
  for (let i = 0; i < S.secs * 120; i++) {
    const t = i * dt, px = me.x, pz = me.z;
    if (V.free) {
      // the person: walks where told (back to their spot after a fall), faces the animal
      const goal = S.walkTo === 'meat' && t > 25 && meat ? { x: meat.x + 1.2, z: meat.z } : S.behind ? { x: sim.x - Math.sin(sim.psi) * 6.5, z: sim.z - Math.cos(sim.psi) * 6.5 } : null;
      if (goal) { const dx = goal.x - me.x, dz = goal.z - me.z, d = Math.hypot(dx, dz); if (d > 0.4) { const sp = Math.min(S.behind ? 3 : 1.4, d); me.x += dx / d * sp * dt; me.z += dz / d * sp * dt; } }
      else if (V.handled) { me.x = V.x; me.z = V.z; }      // after a fall you stand where you landed
      const d = Math.hypot(sim.head.pos.x - me.x, sim.head.pos.z - me.z) || 1; me.fx = (sim.x - me.x) / (Math.hypot(sim.x - me.x, sim.z - me.z) || 1); me.fz = (sim.z - me.z) / (Math.hypot(sim.x - me.x, sim.z - me.z) || 1);
      me.y = T.height(me.x, me.z) + 1.7;
      if (S.torch) { me.torch = true; const dy = sim.head.pos.y - me.y; const L = Math.hypot(sim.head.pos.x - me.x, dy, sim.head.pos.z - me.z); me.lx = (sim.head.pos.x - me.x) / L; me.ly = dy / L; me.lz = (sim.head.pos.z - me.z) / L; }
      void d;
      if (S.throwEvery && !stopThrow && t > 4 && t - thrown * S.throwEvery > S.throwEvery * (thrown ? 1 : 0.3)) { thrown++; A.things.throw('stone', me.x, me.y, me.z, sim.x, sim.z, 'you', sim.py.x + 0.4); }
    } else if (S.mode === 'fight' || (S.mode === 'limp' && Math.hypot(sim.x - V.x, sim.z - V.z) > 22)) { if (i % 20 === 0) A.struggle('you', 1); }
    if (!V.free && S.stopAfterHandled) stopThrow = true;
    me.vx = (me.x - px) / dt; me.vz = (me.z - pz) / dt; me.speed = V.free ? Math.hypot(me.vx, me.vz) : 0;
    A.step(dt, { agents: [me], noises: [], light: S.light ?? 0.85, flash: false, wind: { x: 0, z: -2 } });
    for (const e of A.events) {
      if (e.src === 'victim') { ev[e.type] = (ev[e.type] || 0) + 1; if (e.type !== 'victim') say(t, `   >> ${e.type}${e.speed ? ' ' + e.speed.toFixed(1) + ' m/s' : ''}${e.by ? ' by ' + e.by : ''}`); if (!firstContact && ['knocked', 'seized', 'pinned'].includes(e.type)) firstContact = t; }
    }
    A.events.length = 0;
    if (!V.free) handledT += dt;
    heldT = V.state === 'held' ? heldT + dt : 0; maxHeld = Math.max(maxHeld, heldT);
    pinnedT = V.state === 'pinned' ? pinnedT + dt : 0; maxPinned = Math.max(maxPinned, pinnedT);
    if (!(sim.x === sim.x) || !(V.x === V.x) || !(sim.head.pos.y === sim.head.pos.y)) nan = true;
    const b = mind.beh;
    if (b && b.gen !== lastB) { lastB = b.gen; counts[b.name] = (counts[b.name] || 0) + 1; if (!firstContact && ['display', 'bluff', 'snap'].includes(b.name)) warnBefore = true; say(t, `${b.name.padEnd(8)} (${b.reason}) d=${Math.hypot(sim.x - V.x, sim.z - V.z).toFixed(1)} you=${V.state} grudge=${mind.grudge.toFixed(2)} hunger=${mind.hunger.toFixed(2)}${b.motive ? ' motive=' + b.motive : ''}`); }
    const vv = mind.voice, line = `${vv.think} | ${vv.want} | ${vv.doing} | sees: ${vv.lookingAt}`;
    if (line !== lastVoice && i % 12 === 0) { lastVoice = line; say(t, `      "${line}"`); }
  }
  // at the end: whatever happened, nobody is still in its mouth or under its foot for good; let the person get up
  let freed = V.free || V.dead;
  if (!freed) { for (let i = 0; i < 120 * 50 && !V.free; i++) { if (i % 15 === 0) A.struggle('you', 1); A.step(dt, { agents: [me], noises: [], light: 0.85, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0; } freed = V.free || V.dead; }
  const contacts = (ev.knocked || 0) + (ev.seized || 0) + (ev.pinned || 0);
  const hungerKill = V.dead && (V.lastMotive === 'prey' || (mind.ap.verdict === 'food' && mind.hunger > 0.6));      // the hunger route, not anger
  const res = { name, seed, hungerKill, verdict: mind.ap.verdict, hunger: mind.hunger, contacts, ev, counts, maxHeld, maxPinned, handledT, freed, nan, firstContact, warnBefore, health: V.health, dead: V.dead, cause: V.cause, injury: V.injury };
  if (!quiet) console.log(`\n== ${name} (seed ${seed})\n` + log.join('\n'));
  console.log(`   ${name.padEnd(13)} s${seed}: contacts ${contacts} ${JSON.stringify(ev)}; attacks ${JSON.stringify(Object.fromEntries(Object.entries(counts).filter(([k]) => ['butt', 'swipe', 'pin', 'seize', 'toy'].includes(k))))}; warned first ${warnBefore}; first contact ${firstContact ? firstContact.toFixed(0) + 's' : '-'}; longest held ${maxHeld.toFixed(1)}s, pinned ${maxPinned.toFixed(1)}s; handled ${handledT.toFixed(0)}s; released and up at the end ${freed}${nan ? ' NaN!' : ''}; health ${V.health.toFixed(2)} (${V.injury})${V.dead ? ' DEAD: ' + V.cause : ''}`);
  return res;
}

if (process.argv[1].endsWith('attack.mjs')) {
  const which = process.argv[2] || 'all', seeds = process.argv[3] ? [+process.argv[3]] : [3, 5, 8], quiet = process.argv.includes('--quiet') || which === 'all';
  const all = [];
  for (const seed of seeds) for (const k of Object.keys(SC)) if (which === 'all' || which === k) all.push(attackRun(k, seed, { quiet }));
  const bad = all.filter((r) => !r.freed || r.nan || r.maxHeld > 41);
  const calm = all.filter((r) => r.name.startsWith('default'));
  const angry = calm.filter((r) => r.dead && !r.hungerKill), hungry = calm.filter((r) => r.dead && r.hungerKill);
  console.log(`\nDEATHS: ${all.filter((r) => r.dead).map((r) => r.name + ' s' + r.seed + ' ' + r.cause + (r.hungerKill ? ' (hunger)' : '')).join(', ') || 'none'}; unprovoked deaths: anger ${angry.length}, hunger ${hungry.length} (the food verdict: ${hungry.map((r) => r.name + ' s' + r.seed + ' verdict ' + r.verdict + ', hunger after eating ' + r.hunger.toFixed(2)).join(', ') || '-'})`);
  console.log(`\nSUMMARY: ${all.length} runs; contacts in unprovoked runs: ${calm.reduce((s, r) => s + r.contacts, 0)}; provoked runs with contact: ${all.filter((r) => !r.name.startsWith('default') && r.contacts > 0).length}/${all.filter((r) => !r.name.startsWith('default')).length}; never released or NaN: ${bad.length}`);
  // unprovoked contact is a failure unless it was the hunger route (it decided you were food and hunted you)
  if (bad.length || calm.some((r) => (r.contacts > 0 || r.dead) && !r.hungerKill)) process.exitCode = 1;
}
