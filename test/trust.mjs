// Headless trust scenarios: scripted people who treat the animal well, badly, well-then-badly, who nurse the thorn scenario,
// and who play the same hiding tricks over and over. Prints the behaviour timeline, what it said, the hidden trust over time
// and a summary per run.   node test/trust.mjs [kind|cruel|betray|thorn|hide|decoy|exit|all] [seed] [--quiet]
// The scripts only act on what a player could see or hear (where the animal is, what it is doing, its voice); trust is read
// for the report only.
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
import { applyScenario } from '../src/sim/scenario.js';

const dt = 1 / 120;
const hyp = Math.hypot;

function world(T, seed, scen) {
  const sim = new Creature(T, { x: 0, z: 0, yaw: 0, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  A.herd.disabled = true;
  if (scen) applyScenario(scen, A);
  return { sim, mind, A };
}

/** One run. `script(t, P, ctx)` moves the person P and returns optional actions { throwAt, stone, offer, take }. */
export function trustRun(name, seed = 3, { quiet = false } = {}) {
  const T = makeTerrain(7), S = SC[name], { sim, mind, A } = world(T, seed, S.scen);
  if (S.setup) S.setup({ sim, mind, A, T });
  const P = { id: 'you', x: S.at[0], z: S.at[1], y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1, torch: false, lx: 0, ly: 0, lz: 1, hand: false };
  const V = A.victim('you'), log = [], counts = {}, ev = {}, trust = [], st = { pets: 0, petOK: 0, petNo: 0, snaps: 0, closest: 99, closeTip: 99, follow: 0, followT: 0, restT: 0, lidMax: 0, relaxT: 0, voice: new Set(), thornAt: null, thornTries: 0, handfed: 0, snatch: 0, rests: 0, contacts: 0 };
  const say = (t, s) => { if (!quiet) log.push(`${t.toFixed(1).padStart(6)}s ${s}`); };
  let lastB = null, lastVoice = '', nan = false, maxAcc = 0, prevH = null, prevH2 = null;
  const ctx = { sim, mind, A, T, V, st, say, mem: {} };
  for (let i = 0; i < S.secs * 120; i++) {
    const t = i * dt, px = P.x, pz = P.z;
    const act = V.free ? (S.script(t, P, ctx) || {}) : {};
    if (!V.free) { P.hand = false; if (i % 20 === 0) A.struggle('you', 1); if (V.handled) { P.x = V.x; P.z = V.z; } }
    P.y = T.height(P.x, P.z) + (P.crouch ? 1.0 : 1.7);
    // look: at a point the script names, else at the animal's head
    const L = act.look || { x: sim.head.pos.x, y: sim.head.pos.y, z: sim.head.pos.z }, lx = L.x - P.x, ly = L.y - P.y, lz = L.z - P.z, ll = hyp(lx, ly, lz) || 1;
    P.lx = lx / ll; P.ly = ly / ll; P.lz = lz / ll; const fl = hyp(lx, lz) || 1; P.fx = lx / fl; P.fz = lz / fl;
    if (act.stone) A.things.throw('stone', P.x, P.y, P.z, act.stone.x, act.stone.z, 'you', act.stone.y ?? null);
    if (act.meat) A.things.throw('meat', P.x, P.y, P.z, act.meat.x, act.meat.z, 'you');
    if (act.offer) { if (A.offer('you')) say(t, '   (you hold out meat in your hand)'); }
    if (act.take) A.take(act.take, 'you');
    P.vx = (P.x - px) / dt; P.vz = (P.z - pz) / dt; P.speed = V.free ? hyp(P.vx, P.vz) : 0;
    A.step(dt, { agents: [P], noises: act.noise ? [act.noise] : [], light: S.light ?? 0.85, flash: false, wind: { x: 0, z: -2 } });
    for (const e of A.events) {
      if (['knocked', 'seized', 'pinned'].includes(e.type)) st.contacts++;
      if (e.src === 'victim' && e.type !== 'victim') say(t, `   >> ${e.type}`);
      if (e.type === 'handfed') { st.handfed++; if (!e.gentle) st.snatch++; say(t, `   >> it takes the meat from your hand ${e.gentle ? 'gently' : '(snatched)'}`); }
      if (e.type === 'thorn') { st.thornAt = t; say(t, '   >> THE THORN IS OUT'); }
      if (e.type === 'snap' && e.src === 'sim') st.snaps++;
      if (e.src === 'arena' && e.type === 'taken') say(t, '   >> you take the meat');
      ev[e.type] = (ev[e.type] || 0) + 1;
    }
    A.events.length = 0;
    // body sanity: head acceleration spikes, NaN
    const hp = sim.head.pos; if (prevH2) { const a = hyp(hp.x - 2 * prevH.x + prevH2.x, hp.y - 2 * prevH.y + prevH2.y, hp.z - 2 * prevH.z + prevH2.z) / (dt * dt); if (a > maxAcc) maxAcc = a; }
    prevH2 = prevH; prevH = { x: hp.x, y: hp.y, z: hp.z };
    if (!(sim.x === sim.x) || !(hp.y === hp.y)) nan = true;
    const d = hyp(sim.x - P.x, sim.z - P.z), tip = hyp(hp.x + sim.head.f.x * 1.75 - P.x, hp.y + sim.head.f.y * 1.75 - (P.y - 0.4), hp.z + sim.head.f.z * 1.75 - P.z);
    if (V.free) { st.closest = Math.min(st.closest, d); st.closeTip = Math.min(st.closeTip, tip); }
    st.lidMax = Math.max(st.lidMax, sim.lid); if (sim.relax > 0.5) st.relaxT += dt; if (sim.lying) st.restT += dt;
    const b = mind.beh;
    if (b && b.name === 'follow') st.followT += dt;
    if (b && b.gen !== lastB) {
      lastB = b.gen; counts[b.name] = (counts[b.name] || 0) + 1;
      if (b.name === 'pet') { st.pets++; if (b.permit) st.petOK++; else st.petNo++; }
      if (b.name === 'rest') st.rests++;
      say(t, `${b.name.padEnd(8)} (${b.reason}) d=${d.toFixed(1)} trust=${mind.bond.trust.toFixed(2)}${b.name === 'pet' ? (b.permit ? ' PERMITS' : ' REFUSES') : ''} irr=${mind.mood.irritation.toFixed(2)} pain=${mind.pain.toFixed(2)}`);
    }
    if (i % 1200 === 0) trust.push(+mind.bond.trust.toFixed(2));
    const vv = mind.voice, line = `${vv.think} | ${vv.want} | ${vv.doing}`;
    st.voice.add(vv.think);
    if (line !== lastVoice && i % 12 === 0) { lastVoice = line; say(t, `      "${line}"`); }
  }
  if (S.after) S.after(ctx);
  const B = mind.bond;
  const res = { name, seed, trust: B.trust, scar: B.scar, betrayals: B.betrayals, saved: B.saved, counts, ev, st, nan, maxAcc, trustCurve: trust };
  if (!quiet) console.log(`\n== ${name} (seed ${seed})\n` + log.join('\n'));
  console.log(`   ${name.padEnd(7)} s${seed}: trust ${B.trust.toFixed(2)} (every 10 s: ${trust.join(' ')}) scar ${B.scar.toFixed(2)} betrayals ${B.betrayals}${B.saved ? ' SAVED' : ''}; closest hips ${st.closest.toFixed(1)} m, snout ${st.closeTip.toFixed(1)} m; pets ${st.petOK} allowed / ${st.petNo} refused; handfed ${st.handfed} (${st.snatch} snatched); rests ${st.rests} (${st.restT.toFixed(0)} s down); follow ${st.followT.toFixed(0)} s; relaxed ${st.relaxT.toFixed(0)} s; eyelids max ${st.lidMax.toFixed(2)}; snaps ${st.snaps}; contacts ${st.contacts}${st.thornAt !== null ? `; thorn out at ${st.thornAt.toFixed(0)} s` : ''}${S.report ? '; ' + S.report(ctx) : ''}; head acc max ${maxAcc.toFixed(0)}${nan ? ' NaN!' : ''}`);
  console.log(`            behaviours ${JSON.stringify(counts)}`);
  return res;
}

// ------------------------------------------------------------------ script helpers
const walkTo = (P, x, z, sp, t) => { const dx = x - P.x, dz = z - P.z, d = hyp(dx, dz); if (d > 0.15) { const s = Math.min(sp * dt, d); P.x += dx / d * s; P.z += dz / d * s; } return d; };
const tipOf = (sim) => ({ x: sim.head.pos.x + sim.head.f.x * 1.6, y: sim.head.pos.y + sim.head.f.y * 1.6 - 0.1, z: sim.head.pos.z + sim.head.f.z * 1.6 });
/** A spot `d` m from the animal along the line toward the person (where thrown meat should land). */
const between = (sim, P, d) => { const dx = P.x - sim.x, dz = P.z - sim.z, l = hyp(dx, dz) || 1; return { x: sim.x + dx / l * d, z: sim.z + dz / l * d }; };
const meatOut = (A) => A.things.list.some((o) => o.kind === 'meat' && o.amount > 0);
const soreFoot = (sim) => sim.injury ? sim.feet[sim.injury.foot].pos : null;

/** Someone patient: keeps a calm distance, feeds it, comes closer, holds out meat, reaches for its snout, walks off. */
function kindScript(o = {}) {
  return (t, P, { sim, mind, A, mem }) => {
    const act = {}, d = hyp(sim.x - P.x, sim.z - P.z), tip = tipOf(sim), dTip = hyp(tip.x - P.x, tip.z - P.z), voice = mind.voice.doing;
    P.crouch = false; P.hand = false;
    if (o.stoneAt && t >= o.stoneAt && t < o.stoneAt + dt) act.stone = { x: sim.x, z: sim.z, y: sim.py.x + 0.4 };
    if (o.until && t > o.until) { if (o.after) return o.after(t, P, { sim, mind, A, mem }, act); return act; }
    // keep a respectful distance that shrinks with time (and backs off if it is displaying)
    const want = t < 60 ? 15 : t < 120 ? 11 : 8, hot = /GROWL|SHOW BIG|RUN AT|BITE/.test(voice);
    if (t < (o.leaveAt ?? 1e9)) {
      if (hot && d < 14) { const ax = P.x + (P.x - sim.x) / d * 3, az = P.z + (P.z - sim.z) / d * 3; walkTo(P, ax, az, 1.2); }
      else if (d > want + 2) walkTo(P, sim.x + (P.x - sim.x) / d * want, sim.z + (P.z - sim.z) / d * want, 1.2);
      // a piece of meat now and then, thrown to land between you
      if (!meatOut(A) && t > 10 && t - (mem.meatT ?? -99) > 30 && t < (o.handFeedAt ?? 1e9)) { mem.meatT = t; act.meat = between(sim, P, Math.min(d - 3, 7)); }
      // later: held out in the hand when it is close
      if (o.handFeedAt && t > o.handFeedAt && t < o.handFeedAt + 60 && !meatOut(A) && d < 14 && t - (mem.offerT ?? -99) > 25) { mem.offerT = t; act.offer = true; }
      if (A.things.list.some((q) => q.hand === 'you')) P.hand = true;
      // later still: a hand to its snout when it is right there and not angry
      if (o.petAt && t > o.petAt && dTip < 2.2 && !hot) { P.hand = true; act.look = tip; }
    } else {
      // walk away across the paddock, steadily, looking back now and then
      const tx = o.leaveTo[0], tz = o.leaveTo[1]; if (walkTo(P, tx, tz, 1.5) < 1 && !mem.arrived) mem.arrived = t;
      if (Math.floor(t / 7) % 3 !== 0) act.look = { x: tx, y: P.y, z: tz };
    }
    return act;
  };
}

const SC = {
  // fed and kept calm company; later hand-feeding and a hand to its snout; then you walk away
  kind: { secs: 330, at: [0, 22], script: kindScript({ handFeedAt: 140, petAt: 200, leaveAt: 285, leaveTo: [-40, 30] }) },
  // stones and a torch in its eyes, then the same hand to its snout
  cruel: {
    secs: 200, at: [3, 13], light: 0.2,
    script: (t, P, { sim, mind, A }) => {
      const act = {}, tip = tipOf(sim), dTip = hyp(tip.x - P.x, tip.z - P.z), d = hyp(sim.x - P.x, sim.z - P.z);
      P.torch = t < 90; P.hand = false;
      if (t > 5 && t < 100 && Math.floor(t / 9) !== Math.floor((t - dt) / 9)) act.stone = { x: sim.x, z: sim.z, y: sim.py.x + 0.4 };
      if (t > 110) { if (d > 9) walkTo(P, sim.x, sim.z, 1.2); if (dTip < 2.4) { P.hand = true; act.look = tip; } }
      return act;
    },
  },
  // kind for four minutes, then a stone from close; then the same hand
  betray: { secs: 330, at: [0, 22], script: kindScript({ handFeedAt: 120, petAt: 170, stoneAt: 235, until: 236, after: (t, P, { sim }, act) => { const tip = tipOf(sim), dTip = hyp(tip.x - P.x, tip.z - P.z), d = hyp(sim.x - P.x, sim.z - P.z); P.hand = false; if (t > 255 && d > 9) walkTo(P, sim.x, sim.z, 1.0); if (t > 255 && dTip < 2.4) { P.hand = true; act.look = tip; } return act; } }) },
  // the thorn: approach, feed, keep calm company; when it is lying down, crouch at the sore foot and work at it; let go when it growls
  thorn: {
    secs: 600, at: [-6, 30], scen: 'thorn',
    script: (t, P, { sim, mind, A, mem, st, say }) => {
      const act = {}, d = hyp(sim.x - P.x, sim.z - P.z), voice = mind.voice.doing, hot = /SHOW BIG|RUN AT|BITE|GROWL/.test(voice);
      P.hand = false; P.crouch = false;
      if (st.thornAt !== null) {      // afterwards: stay near, let it come to you; reach for its snout when it is there
        const tip = tipOf(sim), dTip = hyp(tip.x - P.x, tip.z - P.z); if (dTip < 2.2 && t - st.thornAt > 20) { P.hand = true; act.look = tip; }
        if (t - st.thornAt > 60 && t - st.thornAt < 140) walkTo(P, 30, -30, 1.4);      // walk off: does it come along?
        return act;
      }
      if (!meatOut(A) && t > 15 && t - (mem.meatT ?? -99) > 35 && d < 30) { mem.meatT = t; act.meat = between(sim, P, Math.min(d - 3, 8)); }
      const f = soreFoot(sim), lyingNow = sim.lie.phase === 'lying';
      const ready = t > 200 && lyingNow && !hot && t - (mem.backT ?? -99) > 6;
      if (ready && f) {
        // come round to the sore foot from the side, crouch, and work at it
        const side = sim.feet[sim.injury.foot].s, lx = Math.cos(sim.psi) * side, lz = -Math.sin(sim.psi) * side;
        const sx = f.x + lx * 1.0 - Math.sin(sim.psi) * 0.4, sz = f.z + lz * 1.0 - Math.cos(sim.psi) * 0.4;
        const r = walkTo(P, sx, sz, 0.9);
        if (r < 0.4) { P.crouch = true; P.hand = true; act.look = { x: f.x, y: f.y + 0.2, z: f.z }; if (!mem.on) { mem.on = true; st.thornTries++; say(t, '   (you take hold of the foot)'); } }
      } else {
        if (mem.on) { mem.on = false; mem.backT = t; say(t, `   (you let go: "${voice}")`); }
        // otherwise keep a calm distance; back off if it is angry
        const want = t < 100 ? 16 : 11;
        if (hot && d < 13) walkTo(P, P.x + (P.x - sim.x) / d * 3, P.z + (P.z - sim.z) / d * 3, 1.3);
        else if (d > want + 2) walkTo(P, sim.x + (P.x - sim.x) / d * want, sim.z + (P.z - sim.z) / d * want, 1.0);
        P.crouch = d < 13;
      }
      return act;
    },
    report: ({ sim, st }) => `thorn tries ${st.thornTries}; injury at end ${sim.injury ? sim.injury.sev.toFixed(2) + (sim.injury.thorn ? ' (thorn in)' : ' (healing)') : 'healed'}`,
  },
  // hide behind the same rock again and again: does it learn to look there first?
  hide: {
    secs: 420, at: [0, 30],
    setup: ({ T, mem }) => {},
    script: (t, P, { sim, mind, T, mem, st, say }) => {
      const act = {};
      if (!mem.rock) { mem.rock = T.obstacles.filter((o) => o.kind === 'rock' && hyp(o.x, o.z) > 15 && hyp(o.x, o.z) < 45).sort((a, b) => hyp(a.x, a.z) - hyp(b.x, b.z))[0]; mem.round = 0; mem.phase = 'show'; mem.at = 0; mem.log = []; }
      const R = mem.rock, d = hyp(sim.x - P.x, sim.z - P.z);
      // the hiding place: behind the rock from the animal
      const away = Math.atan2(R.x - sim.x, R.z - sim.z), hx = R.x + Math.sin(away) * (R.r + 1.2), hz = R.z + Math.cos(away) * (R.r + 1.2);
      const open = { x: R.x + Math.sin(away + 2.2) * 22, z: R.z + Math.cos(away + 2.2) * 22 };
      if (mem.phase === 'show') { walkTo(P, open.x, open.z, 1.4); P.crouch = false; if (mind.know.seen && t - mem.at > 8) { mem.phase = 'run'; mem.at = t; } }
      else if (mem.phase === 'run') { mem.hx = mem.hx ?? hx; mem.hz = mem.hz ?? hz; P.crouch = false; if (walkTo(P, mem.hx, mem.hz, 5) < 0.5) { mem.phase = 'hide'; mem.at = t; mem.round++; mem.firstLook = null; } }
      else if (mem.phase === 'hide') {
        P.crouch = true;
        const b = mind.beh; if (!mem.firstLook && b && ['search', 'revisit', 'besiege'].includes(b.name) && !mind.know.seen) { mem.firstLook = { name: b.name, memo: !!b.memo, t: t - mem.at }; }
        if (mind.know.seen && t - mem.at > 3) { mem.log.push({ round: mem.round, found: +(t - mem.at).toFixed(1), first: mem.firstLook }); say(t, `   (found you behind the rock, round ${mem.round}, after ${(t - mem.at).toFixed(0)} s; first look: ${mem.firstLook ? mem.firstLook.name + (mem.firstLook.memo ? ' at the usual spot' : '') : '-'})`); mem.phase = 'show'; mem.at = t; mem.hx = null; mem.hz = null; }
        if (t - mem.at > 70) { mem.log.push({ round: mem.round, found: null, first: mem.firstLook }); mem.phase = 'show'; mem.at = t; mem.hx = null; mem.hz = null; }
      }
      void d;
      return act;
    },
    report: ({ mind, mem }) => `rounds ${JSON.stringify(mem.log)}; spots ${JSON.stringify(mind.mem.spots.map((s) => [Math.round(s.x), Math.round(s.z), s.n]))}`,
  },
  // hidden, throwing stones to send it the wrong way, again and again
  decoy: {
    secs: 300, at: [0, 0],
    setup: ({ T, sim }) => {},
    script: (t, P, { sim, mind, T, mem, say }) => {
      const act = {};
      if (!mem.init) { mem.init = true; const R = T.obstacles.filter((o) => o.kind === 'rock' && hyp(o.x, o.z) > 20 && hyp(o.x, o.z) < 50)[0]; mem.R = R; const a = Math.atan2(R.x, R.z); P.x = R.x + Math.sin(a) * (R.r + 1); P.z = R.z + Math.cos(a) * (R.r + 1); mem.n = 0; mem.res = []; }
      P.crouch = true;
      // a stone every 25 s, to land 18 m to one side of you, toward the animal's side
      if (t > 8 && Math.floor((t - 8) / 25) !== Math.floor((t - 8 - dt) / 25) && !mind.know.seen) {
        const a = Math.atan2(sim.x - P.x, sim.z - P.z) + (mem.n % 2 ? 1.1 : -1.1); act.stone = { x: P.x + Math.sin(a) * 18, z: P.z + Math.cos(a) * 18 }; act.look = { x: act.stone.x, y: P.y + 3, z: act.stone.z }; mem.n++; mem.at = t; mem.pending = true;
        say(t, `   (stone ${mem.n} thrown)`);
      }
      if (mem.pending && t - mem.at > 3.5) { mem.pending = false; const b = mind.beh; mem.res.push(`${mem.n}:${b ? b.name + (b.decoy ? '(ignored)' : b.traced ? '(traced)' : b.fromSound ? '(to the stone)' : '') : '-'}`); }
      return act;
    },
    report: ({ mind, mem }) => `responses ${mem.res.join(' ')}; decoys learnt ${mind.mem.decoys}`,
  },
  // into the culvert by one end and out of the other, three times: does it wait at the end you use?
  exit: {
    secs: 420, at: [0, 0],
    script: (t, P, { sim, mind, T, mem, say }) => {
      const act = {};
      if (!mem.S) { mem.S = T.structures.find((s) => s.kind === 'culvert'); const [A0, B0] = mem.S.openings; mem.A = A0; mem.B = B0; const nl = hyp(A0.nx, A0.nz); P.x = A0.x + A0.nx / nl * 20; P.z = A0.z + A0.nz / nl * 20; mem.phase = 'show'; mem.at = 0; mem.round = 0; mem.res = []; }
      const S = mem.S, A0 = mem.A, B0 = mem.B, na = hyp(A0.nx, A0.nz), nb = hyp(B0.nx, B0.nz);
      P.crouch = mem.phase === 'in';
      if (mem.phase === 'show') { walkTo(P, A0.x + A0.nx / na * 18, A0.z + A0.nz / na * 18, 1.5); if (mind.know.seen && t - mem.at > 6) { mem.phase = 'enter'; } }
      else if (mem.phase === 'enter') { const r = walkTo(P, mem.k === 1 ? S.cx : A0.x, mem.k === 1 ? S.cz : A0.z, 4); if (r < 0.3) { if (mem.k === 1) { mem.phase = 'in'; mem.at = t; mem.round++; mem.k = 0; } else mem.k = 1; } }
      else if (mem.phase === 'in') {
        const b = mind.beh;
        // leave by the far end once it is working the near one (or after a while)
        const atA = hyp(sim.head.pos.x - A0.x, sim.head.pos.z - A0.z) < 6;
        if ((atA && t - mem.at > 8) || t - mem.at > 45) { mem.phase = 'out'; mem.at = t; }
        void b;
      } else if (mem.phase === 'out') { const r = walkTo(P, mem.k === 1 ? B0.x + B0.nx / nb * 25 : B0.x, mem.k === 1 ? B0.z + B0.nz / nb * 25 : B0.z, 4); if (r < 0.3) { if (mem.k === 1) { mem.phase = 'away'; mem.at = t; mem.k = 0; } else mem.k = 1; } }
      else if (mem.phase === 'away') {
        if (t - mem.at > 20) {
          const b = mind.beh; mem.res.push(`round ${mem.round}: exits learnt ${JSON.stringify(mind.mem.exits[S.id] || [])}`); mem.phase = 'show'; mem.at = t;
        }
      }
      // what it does while you are inside: which end it waits at
      const b = mind.beh; if (mem.phase === 'in' && b && b.name === 'besiege' && b.phase === 'wait') { const O = b.S.openings[b.order[b.k % b.order.length]]; const which = O === B0 ? 'far end (your way out)' : 'near end'; if (mem.lastWait !== mem.round) { mem.lastWait = mem.round; say(t, `   (it waits at the ${which}${b.memoWait ? ', remembering' : ''})`); mem.res.push(`round ${mem.round} waits at ${which}`); } }
      return act;
    },
    report: ({ mem }) => mem.res.join('; '),
  },
};

if (process.argv[1].endsWith('trust.mjs')) {
  const which = process.argv[2] || 'all', seeds = process.argv[3] && !process.argv[3].startsWith('--') ? [+process.argv[3]] : [3, 5, 8], quiet = process.argv.includes('--quiet') || which === 'all';
  const all = [];
  for (const seed of seeds) for (const k of Object.keys(SC)) if (which === 'all' || which === k) all.push(trustRun(k, seed, { quiet }));
  const by = (n) => all.filter((r) => r.name === n), avg = (a) => a.length ? (a.reduce((s, x) => s + x, 0) / a.length).toFixed(2) : '-';
  console.log(`\nSUMMARY: ${all.length} runs` +
    (by('kind').length ? `; kind: trust ${avg(by('kind').map((r) => r.trust))}, pets allowed ${by('kind').reduce((s, r) => s + r.st.petOK, 0)}, refused ${by('kind').reduce((s, r) => s + r.st.petNo, 0)}, contacts ${by('kind').reduce((s, r) => s + r.st.contacts, 0)}` : '') +
    (by('cruel').length ? `; cruel: trust ${avg(by('cruel').map((r) => r.trust))}, pets allowed ${by('cruel').reduce((s, r) => s + r.st.petOK, 0)}` : '') +
    (by('betray').length ? `; betray: trust ${avg(by('betray').map((r) => r.trust))}, scar ${avg(by('betray').map((r) => r.scar))}, pets allowed after ${by('betray').reduce((s, r) => s + r.st.petOK, 0)}` : '') +
    (by('thorn').length ? `; thorn: out in ${by('thorn').filter((r) => r.st.thornAt !== null).length}/${by('thorn').length}` : '') +
    `; NaN ${all.filter((r) => r.nan).length}`);
  if (all.some((r) => r.nan) || by('kind').some((r) => r.st.contacts > 0)) process.exitCode = 1;
}
