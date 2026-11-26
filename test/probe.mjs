// Announced versus done at structures: a person stands inside each structure; count what the body actually does at the
// openings (head joint inside, an eye brought to an opening and aimed through it, snout or a foot in) against what the mind
// is in (besiege phases and sub-moves) and what its thoughts announce (besiege intents and probe moves).
// node test/probe.mjs [--enter [--speed=1.8] [--from=m] [--pre=8]] [--herd] [--root=/path/to/tree] [--seeds=3,5,8,11] [--secs=180] [--only=barn,culvert] [--par=2] [--json=file]
// (--root runs another copy of the game with this same measurement, e.g. the pristine tree.)
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
const HERE = fileURLToPath(import.meta.url);
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const ROOT = arg('root', fileURLToPath(new URL('..', import.meta.url)));
const SEEDS = arg('seeds', '3,5,8,11').split(',').map(Number), SECS = +arg('secs', 180), PAR = +arg('par', 2);
const ONLY = arg('only', '') ? arg('only').split(',') : null;
const ONE = arg('one', ''), ENTER = process.argv.includes('--enter'), HERD = process.argv.includes('--herd'), SPD = +arg('speed', 1.8), FROM = +arg('from', 0), PRE = +arg('pre', 8), TRACE = process.argv.includes('--trace');
const dt = 1 / 120;

async function one(si, seed) {
  const imp = (p) => import(pathToFileURL(ROOT.replace(/\/$/, '') + '/' + p).href);
  const { makeTerrain } = await imp('src/terrain.js'), { Creature } = await imp('src/rex/body/rex.js'), { Mind } = await imp('src/rex/brain/mind.js'), { Arena } = await imp('src/sim/arena.js'), { Nav } = await imp('src/rex/body/nav.js');
  const T = makeTerrain(7), S = T.structures[si];
  // start 20-38 m out from a way in, on easy open ground (as test/siege.mjs)
  const NV = new Nav(T); let ax = 0, az = 0;
  found: for (const d of [32, 26, 20, 38]) for (const O1 of S.openings) { const nl = Math.hypot(O1.nx, O1.nz), x = O1.x + O1.nx / nl * d, z = O1.z + O1.nz / nl * d; if (NV.costAt(x, z) < 1.3 && !(T.depthAt && T.depthAt(x, z) > 0) && [0, 1, 2, 3, 4, 5, 6, 7].every((k) => Math.abs(T.height(x + Math.sin(k) * 6, z + Math.cos(k) * 6) - T.height(x, z)) < 1.5)) { ax = x; az = z; break found; } }
  const sim = new Creature(T, { x: ax, z: az, yaw: Math.atan2(S.cx - ax, S.cz - az), seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  if (!HERD) A.herd.list.length = 0;      // --herd keeps the arena's herd, as in play
  const up = S.kind === 'tower';
  const HID = arg('hide', '') ? arg('hide').split(',').map(Number) : null;      // --hide=x,z: somewhere else inside (e.g. the Loft doorway 46.2,68.5)
  const me = { id: 'you', x: HID ? HID[0] : S.hide ? S.hide.x : S.cx, z: HID ? HID[1] : S.hide ? S.hide.z : S.cz, y: 0, vx: 0, vz: 0, speed: 0, crouch: S.kind === 'culvert' || !!S.crouch, fx: 0, fz: 1 };
  // --enter (the way it happens in play): the person starts outside in plain view, 7 m out from the way in nearest the animal
  // (--from=m: that far from the animal, on its line to the way in), stands 8 s (--pre=s), walks (--speed) in through it to the hiding
  // place and stays there (up onto the floor of a raised one)
  const hideP = { x: me.x, z: me.z }, crouchIn = me.crouch;
  let path = null;
  if (ENTER) { let O = S.openings[0], bd = 1e9; for (const O1 of S.openings) { const d = Math.hypot(O1.x - ax, O1.z - az); if (d < bd) { bd = d; O = O1; } }
    const nl = Math.hypot(O.nx, O.nz) || 1, nx = O.nx / nl, nz = O.nz / nl;
    const p0 = FROM ? (() => { const dx = O.x + nx * 2 - ax, dz = O.z + nz * 2 - az, dl = Math.hypot(dx, dz) || 1, k = Math.min(FROM, dl - 2); return { x: ax + dx / dl * k, z: az + dz / dl * k }; })() : { x: O.x + nx * 7, z: O.z + nz * 7 };
    path = [p0, { x: O.x + nx * 1.5, z: O.z + nz * 1.5 }, { x: O.x - nx * 1.2, z: O.z - nz * 1.2 }, hideP]; me.x = path[0].x; me.z = path[0].z; me.crouch = false; }
  let leg = 1;
  const floorY = up ? S.base + S.h : null;
  // signed depth of a point into the structure's footprint (positive inside); out of the interior above a roof
  const depthIn = (x, y, z) => { const dx = x - S.cx, dz = z - S.cz, lx = dx * Math.cos(S.yaw || 0) - dz * Math.sin(S.yaw || 0), lz = dx * Math.sin(S.yaw || 0) + dz * Math.cos(S.yaw || 0); return Math.min(S.hw - Math.abs(lx), S.hd - Math.abs(lz)) - (S.roof && y > S.roof.y ? 9 : 0); };
  // distance from a point to an opening (a vertical rectangle w wide, ~2 m tall round its y; the up ones are a floor edge)
  const opD = (O, x, y, z) => { const nl = Math.hypot(O.nx, O.nz) || 1, nx = O.nx / nl, nz = O.nz / nl, dx = x - O.x, dz = z - O.z, across = dx * nx + dz * nz, along = -dx * nz + dz * nx;
    return Math.hypot(Math.max(0, Math.abs(along) - O.w / 2), across, Math.max(0, Math.abs(y - O.y) - 1.0)); };
  const ep = (name) => ({ name, on: false, n: 0, ticks: 0, last: -99 });
  const pressBy = {};
  const E = { press: ep('press'), head: ep('head'), snout: ep('snout'), foot: ep('foot'), eye: ep('eye'), eyeSees: ep('eyeSees'), besiege: ep('besiege'), probe: ep('probe'), peer: ep('peer'), wait: ep('wait') };
  const mark = (e, on, t) => { if (on) { e.ticks++; if (!e.on && t - e.last > 0.5) e.n++; e.last = t; } e.on = on; };
  const ann = { besiege: 0, probe: 0, peer: 0, wait: 0, up: 0, other: 0, texts: {} };
  let lastEntry = null, deepest = -9;
  const HL = sim.species && sim.species.dims && sim.species.dims.headLen || 1.75;
  for (let i = 0; i < SECS * 120; i++) {
    const t = i * dt;
    if (path && t > PRE && leg < path.length) { const g = path[leg], dx = g.x - me.x, dz = g.z - me.z, d = Math.hypot(dx, dz), st = Math.min(d, SPD * dt); me.vx = dx / (d || 1) * SPD; me.vz = dz / (d || 1) * SPD; me.speed = SPD; me.fx = dx / (d || 1); me.fz = dz / (d || 1); me.x += dx / (d || 1) * st; me.z += dz / (d || 1) * st; if (d < 0.05) { leg++; if (leg >= path.length) { me.vx = me.vz = me.speed = 0; me.crouch = crouchIn; } } }
    const inside = depthIn(me.x, 0, me.z) > 0;
    me.y = (up && (!path || inside) ? floorY : T.height(me.x, me.z)) + (me.crouch ? 0.9 : 1.7);
    const noises = Math.abs(t - 3) < 0.004 || Math.abs(t - 50) < 0.004 ? [{ x: me.x, y: me.y, z: me.z, loud: 0.6, kind: 'shout' }] : [];
    A.step(dt, { agents: [me], noises, light: 0.9, flash: false, wind: { x: 0, z: -2 } });
    A.events.length = 0;
    const h = sim.head, hp = h.pos;
    mark(E.head, depthIn(hp.x, hp.y, hp.z) > 0, t);
    const tip = [hp.x + h.f.x * HL, hp.y + h.f.y * HL, hp.z + h.f.z * HL], dTip = depthIn(...tip); deepest = Math.max(deepest, dTip);
    mark(E.snout, dTip > 0, t);
    mark(E.foot, sim.feet.some((f) => depthIn(f.pos.x, f.pos.y, f.pos.z) > 0), t);
    let atO = false, sees = false;
    for (const sd of [1, -1]) {
      const ex = hp.x + h.f.x * 0.42 + h.l.x * sd * 0.55 + h.u.x * 0.4, ey = hp.y + h.f.y * 0.42 + h.l.y * sd * 0.55 + h.u.y * 0.4, ez = hp.z + h.f.z * 0.42 + h.l.z * sd * 0.55 + h.u.z * 0.4;
      let ox = h.f.x * 0.8 + h.l.x * sd * 0.6, oy = h.f.y * 0.8 + h.l.y * sd * 0.6, oz = h.f.z * 0.8 + h.l.z * sd * 0.6; const ol = Math.hypot(ox, oy, oz); ox /= ol; oy /= ol; oz /= ol;      // the eye looks forward and out
      for (const O of S.openings) {
        if (opD(O, ex, ey, ez) > 1.5) continue;
        // aimed through it: the eye's axis points into the structure through the opening (inward normal; down onto an up floor)
        const nl = Math.hypot(O.nx, O.nz) || 1, inX = -O.nx / nl, inZ = -O.nz / nl;
        const toC = [S.cx - ex, (up ? floorY : ey) - ey, S.cz - ez], cl = Math.hypot(...toC);
        if (ox * inX + oz * inZ > 0.35 || (ox * toC[0] + oy * toC[1] + oz * toC[2]) / cl > 0.6) atO = true;
      }
      const vx = me.x - ex, vy = me.y - ey, vz = me.z - ez, vl = Math.hypot(vx, vy, vz);
      if ((vx * ox + vy * oy + vz * oz) / vl > Math.cos(1.25) && vl < 6 && T.segClear(ex, ey, ez, me.x, me.y, me.z, 0.02)) sees = true;
    }
    mark(E.eye, atO, t); mark(E.eyeSees, sees, t);
    // its head pressed on a wall within 1.5 m of an opening, the snout not in: aimed through the planks beside the gap
    { const touching = (sim.headTouchK || 0) > 0 || (sim.headPress || 0) > 0.3; const pr = touching && dTip <= 0 && S.openings.some((O) => opD(O, ...tip) < 1.5); mark(E.press, pr, t); if (pr && process.env.PRESSBY) { const bb = mind.beh, L = mind.label + (bb && bb.phase ? '/' + bb.phase : '') + (bb && bb.sub ? '/' + bb.sub : ''); pressBy[L] = (pressBy[L] || 0) + 1 / 120; } }
    const b = mind.beh, bes = mind.label === 'besiege';
    if (TRACE) { const L = mind.label + (b && b.phase ? '/' + b.phase : ''), st0 = mind.thinker ? mind.thinker.stream : [], th = st0.length ? st0[st0.length - 1] : null, key = L + '|' + (th ? th.t : '');
      if (key !== one.k) { one.k = key; const c = mind.ctx || {}; console.error(`${t.toFixed(1).padStart(6)} ${L.padEnd(18)} in ${depthIn(me.x, 0, me.z) > 0 ? 'Y' : 'n'} seen ${mind.know && mind.know.seen ? 'Y' : 'n'} d ${Math.hypot(me.x - sim.x, me.z - sim.z).toFixed(1)} encl ${c.enclosed ? 'Y' : 'n'} walled ${c.walled ? 'Y' : 'n'} reach ${c.aff && c.aff.reach ? 'Y' : 'n'} see ${c.aff && c.aff.see ? 'Y' : 'n'} verdict ${mind.ap && mind.ap.verdict} stance ${mind.stance} U ${JSON.stringify(mind.lastU && mind.lastU.slice(0, 4))} mg ${mind._margin ? mind._margin().toFixed(2) : "-"} goal ${mind.goal ? mind.goal.mode : "-"} | ${th ? '"' + th.text + '" ' + th.cond : ''}`); } }
    mark(E.besiege, bes, t); mark(E.probe, bes && b && b.phase === 'probe', t); mark(E.peer, bes && b && b.phase === 'probe' && b.sub === 'peer', t); mark(E.wait, bes && b && b.phase === 'wait', t);
    const st = mind.thinker ? mind.thinker.stream : []; let fresh = 0; for (let k = st.length - 1; k >= 0 && st[k] !== lastEntry; k--) fresh++;
    for (const e of st.slice(st.length - fresh)) {
      const c = e.cond || '';
      const k = /^phase:besiege\/probe/.test(c) ? (/look in|see in/.test(e.text) ? 'peer' : 'probe') : /^phase:besiege\/wait/.test(c) || /^besiege\+memo/.test(c) ? 'wait' : /^beh:besiege/.test(c) ? 'besiege' : /hole|get in|head in|look in|reach up|neck up|snap up|get it down|reach it/.test(e.text) ? 'other' : null;
      if (k) { ann[k]++; ann.texts[e.text] = (ann.texts[e.text] || 0) + 1; }
    }
    if (st.length) lastEntry = st[st.length - 1];
  }
  if (process.env.PRESSBY) console.error('pressBy', S.name, seed, JSON.stringify(Object.fromEntries(Object.entries(pressBy).map(([k, v]) => [k, +v.toFixed(1)]))));
  const o = { kind: S.kind, name: S.name, seed, secs: SECS, deepest: +deepest.toFixed(2), ann };
  for (const k in E) o[k] = { n: E[k].n, s: +(E[k].ticks / 120).toFixed(1) };
  return o;
}

if (ONE) {
  const [si, seed] = ONE.split(':').map(Number);
  one(si, seed).then((o) => { process.stdout.write('@@' + JSON.stringify(o) + '\n'); });
} else {
  const { makeTerrain } = await import(pathToFileURL(ROOT.replace(/\/$/, '') + '/src/terrain.js').href);
  const T = makeTerrain(7), jobs = [];
  T.structures.forEach((S, si) => { if (!ONLY || ONLY.includes(S.kind) || ONLY.includes(S.name)) for (const seed of SEEDS) jobs.push([si, seed]); });
  const res = []; let next = 0;
  const run = () => new Promise((done) => {
    const go = () => { if (next >= jobs.length) return done(); const [si, seed] = jobs[next++];
      const p = spawn(process.execPath, [HERE, '--one=' + si + ':' + seed, '--root=' + ROOT, '--secs=' + SECS, ...(ENTER ? ['--enter'] : []), ...(HERD ? ['--herd'] : []), '--speed=' + SPD, '--from=' + FROM, '--pre=' + PRE, ...(arg('hide', '') ? ['--hide=' + arg('hide')] : [])], { stdio: ['ignore', 'pipe', 'inherit'] }); let out = '';
      p.stdout.on('data', (d) => { out += d; });
      p.on('close', () => { const m = out.match(/@@(.*)/); if (m) { const o = JSON.parse(m[1]); res.push(o); console.log(`${o.name.padEnd(18)} s${String(seed).padEnd(3)} head ${o.head.n}x ${o.head.s}s | eye ${o.eye.n}x ${o.eye.s}s | sees ${o.eyeSees.s}s | snout ${o.snout.n}x ${o.snout.s}s | foot ${o.foot.s}s | besiege ${o.besiege.s}s probe ${o.probe.s}s peer ${o.peer.s}s wait ${o.wait.s}s | said besiege ${o.ann.besiege} probe ${o.ann.probe} peer ${o.ann.peer} wait ${o.ann.wait} other ${o.ann.other}`); } else console.log('FAILED', si, seed); go(); });
    }; go(); });
  await Promise.all(Array.from({ length: PAR }, run));
  // per structure: done (episodes, seconds) against announced (thought counts) and the mind's time in the behaviours
  console.log(`\n== ${ROOT}  seeds ${SEEDS.join(',')}  ${SECS} s${ENTER ? '  (--enter: walks in from outside, in view)' : ''}${HERD ? '  (--herd)' : ''}${FROM ? `  (from ${FROM} m off it)` : ''}  speed ${SPD} pre ${PRE} s`);
  console.log('structure          | head in n/s | eye at opening n/s | snout in n/s | wall press by gap n/s | foot s | mind besiege/probe/peer/wait s | thoughts besiege/probe/peer/wait');
  const names = [...new Set(res.map((o) => o.name))], tot = {};
  const add = (a, o) => { for (const k of ['press', 'head', 'eye', 'snout', 'foot', 'besiege', 'probe', 'peer', 'wait', 'eyeSees']) { a[k] = a[k] || { n: 0, s: 0 }; a[k].n += o[k].n; a[k].s += o[k].s; } a.ann = a.ann || { besiege: 0, probe: 0, peer: 0, wait: 0, other: 0 }; for (const k in a.ann) a.ann[k] += o.ann[k]; a.runs = (a.runs || 0) + 1; };
  for (const nm of names) { const a = {}; for (const o of res.filter((x) => x.name === nm)) { add(a, o); add(tot, o); }
    const f = (x) => `${x.n}/${x.s.toFixed(0)}`;
    console.log(`${nm.padEnd(18)} | ${f(a.head).padEnd(11)} | ${f(a.eye).padEnd(18)} | ${f(a.snout).padEnd(12)} | ${f(a.press).padEnd(21)} | ${a.foot.s.toFixed(0).padEnd(6)} | ${[a.besiege, a.probe, a.peer, a.wait].map((x) => x.s.toFixed(0)).join('/').padEnd(30)} | ${[a.ann.besiege, a.ann.probe, a.ann.peer, a.ann.wait].join('/')}`); }
  const f = (x) => `${x.n}/${x.s.toFixed(0)}`;
  if (tot.runs) console.log(`${'ALL'.padEnd(18)} | ${f(tot.head).padEnd(11)} | ${f(tot.eye).padEnd(18)} | ${f(tot.snout).padEnd(12)} | ${f(tot.press).padEnd(21)} | ${tot.foot.s.toFixed(0).padEnd(6)} | ${[tot.besiege, tot.probe, tot.peer, tot.wait].map((x) => x.s.toFixed(0)).join('/').padEnd(30)} | ${[tot.ann.besiege, tot.ann.probe, tot.ann.peer, tot.ann.wait].join('/')}  (${tot.runs} runs)`);
  if (arg('json', '')) writeFileSync(arg('json'), JSON.stringify(res, null, 1));
}
