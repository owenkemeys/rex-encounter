// One attention: do the thought stream and the body tell the same story?
//   node test/attend.mjs [seeds=1,2,3] [scenario|all] [--src=DIR] [--v]
// Plays scenarios (feeding while you come slowly / fast / throw stones; hunting the herd with you nearby / following behind /
// shouting; besieging you in the shed; idling with you far off; you hidden while a stone lands elsewhere) and, for every
// thought, works out on its own (from the thought's key and the mind's state at that moment, not from attend.js) what the
// thought is about, what "it" in it refers to, and what the current focus is. It checks:
//   response  every thought about an item X (you, a prey animal, food, a noise) comes with the head pointing at X within about
//             a second (-0.4..+1.2 s), or is an explicit disregard (kind 'disregard')
//   it        "it" refers to the focus at the moment it is said
//   share     the share of thoughts about items that are not the focus is small
// Counts and kinds only. --src=DIR runs another copy of src/ (e.g. the code before a change).
import { pathToFileURL } from 'node:url';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const SRC = arg('src', new URL('../src', import.meta.url).pathname), V = process.argv.includes('--v');
const pos = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const SEEDS = (pos[0] || '1,2,3').split(',').map(Number), ONLY = pos[1] || 'all';
const imp = (p) => import(pathToFileURL(SRC + p).href);
const { makeTerrain } = await imp('/terrain.js'), { Creature } = await imp('/rex/body/rex.js'), { Mind } = await imp('/rex/brain/mind.js'), { Arena } = await imp('/sim/arena.js');
const { covers } = await import('./hidecover.mjs');
const dt = 1 / 120, hyp = Math.hypot;

// ------------------------------------------------------------------ what a thought is about, by its key (independent of attend.js)
const IDLE = new Set(['roam', 'pause', 'sniff', 'leave', 'rest']);
function behFocus(m) {
  const b = m.beh; if (!b) return null; const n = b.name;
  if (n === 'hunt') return 'prey:' + b.id;
  if (n === 'feed' || n === 'trail' || n === 'investigate') return b.obj != null ? 'obj:' + b.obj : m.focus ? 'obj:' + m.focus.id : null;
  if (n === 'answer') return 'self';
  if (IDLE.has(n)) return undefined;
  return 'you';
}
function focusOf(m) { if (m.att) return m.att.focus; const f = behFocus(m); if (f !== undefined) return f; if (m.att) return m.att.focus; return m.know.seen ? 'you' : null; }
function classify(e, m) {
  const key = e.key || '', hasIt = /\bit\b/.test(e.text);
  let about = 'you';
  if (e.about) about = e.about;
  else if (key === 'beh' || key === 'phase') { const f = behFocus(m); about = f == null ? (hasIt ? 'you' : 'self') : f; }
  else if (key === 'focus' || key === 'muse:eat' || key === 'noreach') about = m.focus ? 'obj:' + m.focus.id : m.beh && m.beh.obj != null ? 'obj:' + m.beh.obj : 'self';
  else if (key === 'prey' || key === 'muse:preyM') about = m.prey ? 'prey:' + m.prey.id : 'self';
  else if (key === 'noise') about = ['heard', 'heard+fast', 'heard+flinch'].includes(e.cond) ? 'sound' : 'you';
  else if (/^(hit|glare|thunder|wade|calm|full|spent|winded|muse:(hunger|bored|idle|tired))$/.test(key) && !hasIt) about = 'self';
  const ref = (key === 'beh' || key === 'phase') && about !== 'self' ? about : 'you';
  return { about, ref };
}
function where(m, A, key, me) {
  const out = [];
  if (key === 'you') { out.push({ x: me.x, y: me.y, z: me.z }); if (m.sum) out.push({ x: m.sum.x, y: m.T.height(m.sum.x, m.sum.z) + 1.2, z: m.sum.z }); if (m.know.last) out.push({ x: m.know.last.x, y: m.T.height(m.know.last.x, m.know.last.z) + 1.2, z: m.know.last.z }); }
  else if (key === 'sound') { const n = m.mem.lastNoise; if (n) out.push({ x: n.x, y: m.T.height(n.x, n.z) + 1, z: n.z }); }
  else if (key.startsWith('prey:')) { const q = A.herd.list.find((p) => 'prey:' + p.id === key); if (q) out.push({ x: q.x, y: q.y + 1, z: q.z }); }
  else if (key.startsWith('obj:')) { const o = A.things.list.find((p) => 'obj:' + p.id === key); if (o) out.push({ x: o.x, y: o.y + 0.3, z: o.z }); else if (m.focus) out.push({ x: m.focus.x, y: (m.focus.y ?? 0) + 0.3, z: m.focus.z }); }
  return out;
}
const aimed = (g, P) => { const dx = P.x - g.px, dy = P.y - g.py, dz = P.z - g.pz, d = hyp(dx, dy, dz) || 1; return Math.acos(Math.max(-1, Math.min(1, (dx * g.fx + dy * g.fy + dz * g.fz) / d))) < 0.55 + Math.atan(2.5 / d); };

// ------------------------------------------------------------------ scenarios
const approach = (me, sim, sp, stop) => { const dx = sim.x - me.x, dz = sim.z - me.z, d = hyp(dx, dz); if (d > stop) { me.x += dx / d * sp * dt; me.z += dz / d * sp * dt; return true; } return false; };
const SC = {
  feed_slow: { secs: 60, hunger: 0.85, meat: true, at: (s) => [s.x + 40, s.z + 10], act(t, me, ctx) { if (t > 8) me.speed = approach(me, ctx.sim, 1.3, 12) ? 1.3 : 0; } },
  feed_fast: { secs: 60, hunger: 0.85, meat: true, at: (s) => [s.x + 45, s.z + 5], act(t, me, ctx) { if (t > 10 && t < 30) me.speed = approach(me, ctx.sim, 5.5, 9) ? 5.5 : 0; else if (t >= 30) { const dx = me.x - ctx.sim.x, dz = me.z - ctx.sim.z, d = hyp(dx, dz) || 1; if (d < 40) { me.x += dx / d * 4 * dt; me.z += dz / d * 4 * dt; me.speed = 4; } else me.speed = 0; } } },
  feed_throw: { secs: 60, hunger: 0.85, meat: true, at: (s) => [s.x + 22, s.z - 8], act(t, me, ctx) { for (const T of [10, 18, 26, 40]) if (Math.abs(t - T) < dt / 2) ctx.A.things.throw('stone', me.x, me.y, me.z, ctx.sim.x + 1.5, ctx.sim.z, 'you'); } },
  hunt_near: { secs: 70, hunger: 0.92, herd: true, at: (s) => [s.x - 18, s.z + 6], act() {} },
  hunt_behind: { secs: 70, hunger: 0.92, herd: true, at: (s) => [s.x - 25, s.z - 5], act(t, me, ctx) { const s = ctx.sim, bx = s.x - Math.sin(s.psi) * 16, bz = s.z - Math.cos(s.psi) * 16, d = hyp(bx - me.x, bz - me.z); if (d > 2) { me.x += (bx - me.x) / d * 1.6 * dt; me.z += (bz - me.z) / d * 1.6 * dt; me.speed = 1.6; } else me.speed = 0; } },
  hunt_noise: { secs: 70, hunger: 0.92, herd: true, at: (s) => [s.x - 25, s.z], act(t, me, ctx) { for (const T of [15, 30, 45]) if (Math.abs(t - T) < dt / 2) ctx.noises.push({ x: me.x, y: me.y, z: me.z, loud: 0.6, kind: 'shout' }); } },
  besiege: { secs: 70, shed: true, act(t, me, ctx) { if (t > 4 && !ctx.inside) { const d = hyp(ctx.hide.x - me.x, ctx.hide.z - me.z); if (d < 0.3) { if (ctx.hide.next) ctx.hide = ctx.hide.next; else ctx.inside = true; } else { me.x += (ctx.hide.x - me.x) / d * 3 * dt; me.z += (ctx.hide.z - me.z) / d * 3 * dt; } } } },
  idle: { secs: 60, at: (s) => [s.x + 60, s.z], act(t, me, ctx) { if (t > 25 && t < 40) me.speed = approach(me, ctx.sim, 1.2, 35) ? 1.2 : 0; } },
  hidden_noise: { secs: 60, hidden: true, act(t, me, ctx) { for (const T of [12, 32]) if (Math.abs(t - T) < dt / 2) { const a = Math.atan2(ctx.sim.x - me.x, ctx.sim.z - me.z) + 1.2; ctx.A.things.throw('stone', me.x, me.y, me.z, me.x + Math.sin(a) * 18, me.z + Math.cos(a) * 18, 'you'); } } },
};

function run(name, S, seed) {
  const T = makeTerrain(7);
  let rx = 0, rz = 0, yaw = 0.4;
  let me = null;
  if (S.shed) { const St = T.structures.find((s) => s.kind === 'barn') || T.structures[0], O = St.openings[0], nl = hyp(O.nx, O.nz) || 1; let back = 24; const B = (T.bound || 1e9) - 8; while (back > 12 && Math.max(Math.abs(O.x + O.nx / nl * back), Math.abs(O.z + O.nz / nl * back)) > B) back -= 1;      // 24 m out, or less where the fence is nearer (a body put at the fence is thrown along it, tens of metres, by rex.js)
    rx = O.x + O.nx / nl * back; rz = O.z + O.nz / nl * back; yaw = Math.atan2(St.cx - rx, St.cz - rz); const h = St.hide || { x: St.cx, z: St.cz }; me = { x: O.x + O.nx / nl * 7, z: O.z + O.nz / nl * 7, crouch: false }; me.hide = h; me.door = O; }
  if (S.hidden) { const R = covers(T, { minR: 20, maxR: 50, minSize: 1.5 })[0], a = Math.atan2(R.x, R.z); me = { x: R.x + Math.sin(a) * (R.r + 1), z: R.z + Math.cos(a) * (R.r + 1), crouch: true }; }
  const sim = new Creature(T, { x: rx, z: rz, yaw, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  if (!S.herd) { A.herd.list.length = 0; A.herd.disabled = true; }
  else { A.herd.home = { x: sim.x + 50, z: sim.z + 10 }; const p0 = A.herd.list[0]; for (const p of A.herd.list) { p.x = sim.x + 50 + (p.x - p0.x); p.z = sim.z + 10 + (p.z - p0.z); } }
  if (S.hunger) { mind.hunger = S.hunger; mind.ov.hold.hunger = S.hunger; }
  if (S.meat) A.things.place('meat', sim.x + Math.sin(sim.psi) * 7, sim.z + Math.cos(sim.psi) * 7);
  if (!me) { const [x, z] = S.at(sim); me = { x, z, crouch: false }; }
  Object.assign(me, { id: 'you', y: 0, vx: 0, vz: 0, speed: 0, fx: 0, fz: 1 });
  const ctx = { sim, mind, A, noises: [], hide: me.hide && (me.door ? { x: me.door.x, z: me.door.z, next: me.hide } : me.hide) }, V = A.victim('you');
  const G = [], pend = [], res = { n: 0, ent: 0, nonFocus: 0, noResp: 0, itBad: 0, dis: 0, kinds: {}, badKinds: {} };
  let lastEntry = null;
  for (let i = 0; i < S.secs * 120; i++) {
    const t = i * dt, px = me.x, pz = me.z; ctx.noises = [];
    if (V.free) S.act(t, me, ctx); else if (V.handled) { me.x = V.x; me.z = V.z; }
    me.y = T.height(me.x, me.z) + (me.crouch ? 1.0 : 1.7);
    const fl = hyp(sim.x - me.x, sim.z - me.z) || 1; me.fx = (sim.x - me.x) / fl; me.fz = (sim.z - me.z) / fl;
    me.vx = (me.x - px) / dt; me.vz = (me.z - pz) / dt; me.speed = V.free ? hyp(me.vx, me.vz) : 0;
    A.step(dt, { agents: [me], noises: ctx.noises, light: 0.85, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0;
    const h = sim.head; if (i % 4 === 0) G.push({ t: mind.t, px: h.pos.x, py: h.pos.y, pz: h.pos.z, fx: h.f.x, fy: h.f.y, fz: h.f.z });
    // new thoughts
    const st = mind.thinker.stream; let k = st.length - 1; while (k >= 0 && st[k] !== lastEntry) k--;
    for (const e of st.slice(k + 1)) {
      res.n++;
      const { about, ref } = classify(e, mind), foc = focusOf(mind);
      if (/\bit\b/.test(e.text) && ref !== foc) { res.itBad++; res.badKinds['it:' + e.kind] = (res.badKinds['it:' + e.kind] || 0) + 1; }
      if (about === 'self') continue;
      res.ent++;
      if (about !== foc) res.nonFocus++;
      if (e.kind === 'disregard') { res.dis++; continue; }
      pend.push({ t: e.t, about, kind: e.kind, P: where(mind, A, about, me), dbg: V ? `${e.key}/${mind.beh && mind.beh.name}/${mind.beh && mind.beh.sub}/foc=${focusOf(mind)}/resp=${e.resp}/gl=${mind.att && mind.att.glance ? mind.att.glance.key + ':' + mind.att.glance.level : '-'}` : '' });
    }
    lastEntry = st[st.length - 1];
    // settle the ones whose window has closed
    while (pend.length && mind.t - pend[0].t > 1.2) {
      const p = pend.shift(), win = G.filter((g) => g.t >= p.t - 0.4 && g.t <= p.t + 1.2);
      if (!p.P.length || !win.some((g) => p.P.some((P) => aimed(g, P)))) { res.noResp++; if (process.env.DBG) { const ang = Math.min(...win.flatMap((g) => p.P.map((P) => { const dx = P.x - g.px, dy = P.y - g.py, dz = P.z - g.pz, d = hyp(dx, dy, dz) || 1; return Math.acos(Math.max(-1, Math.min(1, (dx * g.fx + dy * g.fy + dz * g.fz) / d))); }))); console.log('   miss', p.t, p.about, p.kind, p.dbg, 'best angle', ang.toFixed(2), JSON.stringify(p.P.map((P) => [P.x.toFixed(1), P.y.toFixed(1), P.z.toFixed(1)])), JSON.stringify([win[0].px.toFixed(1), win[0].py.toFixed(1), win[0].pz.toFixed(1), win[0].fx.toFixed(2), win[0].fy.toFixed(2), win[0].fz.toFixed(2)])); } const kk = p.about.split(':')[0] + ':' + p.kind; res.badKinds[kk] = (res.badKinds[kk] || 0) + 1; }
    }
    if (G.length > 200) G.splice(0, G.length - 200);
  }
  return res;
}

// ------------------------------------------------------------------ a shelter entered unseen: when does it suspect, when is it sure, on what evidence?
function shelter(seed, wind) {
  const T = makeTerrain(7), St = T.structures.find((s) => s.kind === 'barn'), h = St.hide || { x: St.cx, z: St.cz };
  // the animal 30 m off one side, facing away; you come in by the opening furthest from it
  const ax = St.cx + 30, az = St.cz - 6, O = St.openings.slice().sort((p, q) => hyp(q.x - ax, q.z - az) - hyp(p.x - ax, p.z - az))[0], nl = hyp(O.nx, O.nz) || 1;
  const sim = new Creature(T, { x: ax, z: az, yaw: Math.atan2(ax - St.cx, az - St.cz), seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  A.herd.list.length = 0; A.herd.disabled = true; mind.hunger = 0.5;
  const me = { id: 'you', x: O.x + O.nx / nl * 25, z: O.z + O.nz / nl * 25, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1 };
  const way = [{ x: O.x + O.nx / nl * 2, z: O.z + O.nz / nl * 2 }, { x: O.x, z: O.z }, h]; let wi = 0, inT = null;
  const W = wind === 'away' ? { x: (St.cx - ax) / 30 * 2.5, z: 0 } : { x: (ax - St.cx) / 30 * 2.5, z: 0 };      // to-it: your scent blows to it
  const ctx0 = { stepT: 1.5 }, ev = new Set(); let suspect = null, sure = null, seenBefore = false;
  for (let i = 0; i < 150 * 120; i++) {
    const t = i * dt, px = me.x, pz = me.z, noises = [];
    if (me.speed > 0.5 && (ctx0.stepT -= dt * me.speed) <= 0) { ctx0.stepT = 1.5; noises.push({ x: me.x, y: T.height(me.x, me.z), z: me.z, loud: 0.045, kind: 'step', you: true }); }
    if (wi < way.length) { const q = way[wi], d = hyp(q.x - me.x, q.z - me.z); if (d < 0.2) wi++; else { me.x += (q.x - me.x) / d * Math.min(d, 1.4 * dt); me.z += (q.z - me.z) / d * Math.min(d, 1.4 * dt); } }
    if (inT === null && T.insideStructure(me.x, me.z)) inT = t;
    me.y = T.height(me.x, me.z) + 1.7; me.vx = (me.x - px) / dt; me.vz = (me.z - pz) / dt; me.speed = hyp(me.vx, me.vz);
    A.step(dt, { agents: [me], noises, light: 0.85, flash: false, wind: W }); A.events.length = 0;
    const K = mind.know, c = mind.ctx || {};
    if (inT === null && K.seen) seenBefore = true;
    if (K.seen) ev.add(K.via === 'sight' ? 'sight' : K.via === 'near' ? 'near' : 'memory');
    if (mind.scent > 0.08) ev.add('scent');
    if (mind.mem.steps && t - mind.mem.steps.t < 0.1) ev.add('steps');
    if (inT === null) continue;
    const bel = T.insideStructure(mind.sum.x, mind.sum.z), inS = (S) => S && S.id === St.id;
    const susp = (inS(bel) && mind.sum.cert > 0.12) || (mind.beh && mind.beh.name === 'besiege') || (K.seen && inS(c.enclosed));
    if (suspect === null && susp) suspect = { t: t - inT, ev: [...ev].join('+') || 'none' };
    if (sure === null && ((K.seen && K.via === 'sight' && inS(c.enclosed)) || (inS(bel) && mind.sum.cert > 0.55))) sure = { t: t - inT, ev: [...ev].join('+') || 'none' };
  }
  return { inT, seenBefore, suspect, sure };
}
if (ONLY === 'shelter' || ONLY === 'all') {
  let fast = 0;
  for (const wind of ['to-it', 'away']) for (const seed of SEEDS) {
    const r = shelter(seed, wind), f = (x) => (x ? `${x.t.toFixed(1)} s (${x.ev})` : 'never');
    if (r.suspect && r.suspect.t < 3 && !r.seenBefore && r.suspect.ev === 'none') fast++;
    console.log(`shelter wind ${wind.padEnd(5)} seed ${seed}: seen going in ${r.seenBefore ? 'yes' : 'no'}; suspects ${f(r.suspect)}, sure ${f(r.sure)}`);
  }
  if (fast) { console.log(`FAIL: ${fast} near-instant suspicions with no evidence`); process.exitCode = 1; }
}
// ------------------------------------------------------------------ repetition while it works a shelter (3 minutes): per behaviour, how often its top line recurs
if (ONLY === 'repeat') {
  for (const seed of SEEDS) {
    const T = makeTerrain(7), St = T.structures.find((s) => s.kind === (process.env.KIND || 'containers')), O = St.openings[0], nl = hyp(O.nx, O.nz) || 1, h = St.hide || { x: St.cx, z: St.cz };
    const rx = O.x + O.nx / nl * 24, rz = O.z + O.nz / nl * 24, sim = new Creature(T, { x: rx, z: rz, yaw: Math.atan2(St.cx - rx, St.cz - rz), seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
    A.herd.list.length = 0; A.herd.disabled = true;
    const me = { id: 'you', x: O.x + O.nx / nl * 6, z: O.z + O.nz / nl * 6, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1 }, way = [{ x: O.x, z: O.z }, h]; let wi = 0, last = null; const per = {};
    for (let i = 0; i < 180 * 120; i++) {
      const t = i * dt, px = me.x, pz = me.z; if (t > 4 && wi < way.length) { const q = way[wi], d = hyp(q.x - me.x, q.z - me.z); if (d < 0.2) wi++; else { me.x += (q.x - me.x) / d * Math.min(d, 2 * dt); me.z += (q.z - me.z) / d * Math.min(d, 2 * dt); } }
      me.y = T.height(me.x, me.z) + 1.7; me.vx = (me.x - px) / dt; me.vz = (me.z - pz) / dt; me.speed = hyp(me.vx, me.vz);
      A.step(dt, { agents: [me], noises: [], light: 0.85, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0;
      const st = mind.thinker.stream; let k = st.length - 1; while (k >= 0 && st[k] !== last) k--;
      for (const e of st.slice(k + 1)) { const b = mind.beh ? mind.beh.name : '-', P = per[b] || (per[b] = { n: 0, by: {} }); P.n++; P.by[e.text] = (P.by[e.text] || 0) + 1; P.keys = P.keys || {}; P.keys[e.key] = (P.keys[e.key] || 0) + 1; }
      last = st[st.length - 1];
    }
    for (const [b, P] of Object.entries(per)) { const top = Math.max(...Object.values(P.by)); console.log(`repeat seed ${seed} ${b.padEnd(10)} ${P.n} thoughts, ${Object.keys(P.by).length} distinct, top line x${top}, probe-step thoughts x${P.keys.phase || 0}, top kind of thought x${Math.max(...Object.values(P.keys))} (${Object.entries(P.keys).sort((p, q) => q[1] - p[1])[0][0]})`); }
  }
}
const tot = { n: 0, ent: 0, nonFocus: 0, noResp: 0, itBad: 0, dis: 0, badKinds: {} };
for (const [name, S] of Object.entries(SC)) {
  if (ONLY !== 'all' && ONLY !== name) continue;
  for (const seed of SEEDS) {
    const r = run(name, S, seed);
    for (const k of ['n', 'ent', 'nonFocus', 'noResp', 'itBad', 'dis']) tot[k] += r[k];
    for (const [k, v] of Object.entries(r.badKinds)) tot.badKinds[k] = (tot.badKinds[k] || 0) + v;
    console.log(`${name.padEnd(13)} seed ${seed}: ${r.n} thoughts, ${r.ent} about things, non-focus ${r.nonFocus} (disregards ${r.dis}), no response ${r.noResp}, "it" not the focus ${r.itBad}${V ? '  ' + JSON.stringify(r.badKinds) : ''}`);
  }
}
const share = tot.nonFocus / Math.max(1, tot.ent);
console.log(`\nTOTAL ${tot.n} thoughts, ${tot.ent} about things: no response ${tot.noResp}, "it" not the focus ${tot.itBad}, non-focus share ${(100 * share).toFixed(1)}% (disregards ${tot.dis})`);
console.log('violation kinds', JSON.stringify(tot.badKinds));
const lim = +arg('max', 0.03);
if (tot.noResp > lim * tot.ent || tot.itBad > lim * tot.n || share > 0.25) { console.log(`FAIL (allowed: ${Math.round(lim * 100)}% unanswered or misreferred, 25% non-focus)`); process.exitCode = 1; }
