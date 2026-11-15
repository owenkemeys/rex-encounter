import * as THREE from 'three/webgpu';
import { makeTerrain } from './terrain.js';
import { RexSim, DIM } from './sim/rex.js';
import { Mind } from './sim/mind.js';
import { RexBody, watchBody } from './view/body.js';
import { buildWorld } from './view/world.js';
import { Effects, Audio } from './view/effects.js';
import { Overlays } from './view/overlays.js';
import { Director } from './director.js';
import { Arena } from './sim/arena.js';
import { Props } from './view/props.js';
import { makePost } from './view/post.js';
import { clamp, bearing, makeRng } from './math.js';
import { createUI, KIT as KIT_START } from './ui.js';
import { detectQuality, backendPreference, QualityController, qualityMenu } from './view/quality.js';
import { createTelemetry, NO_TELEMETRY } from './telemetry.js';

const DT = 1 / 120;
const PERSON_SLOPE = 1.0, PERSON_DROP = 2.2;      // steepest ground (rise over run) a person on foot can scramble up: the Bluff, the Overlook's faces and the Crags are not
const $ = (id) => document.getElementById(id);
const TEST = location.hash.startsWith('#test');
// quality: chosen by measured frame time (src/view/quality.js); hints (GPU name, cores, memory, phone) only make the first guess
const Q = detectQuality(TEST);
const SEED = (() => { const m = location.hash.match(/seed(\d+)/); return m ? +m[1] : TEST ? 3 : (Date.now() % 100000); })();

async function boot() {
  let canvas = $('view'), renderer, backend, swapping = false;
  // WebGPU first, WebGL2 if it is missing. If the WebGPU device dies mid-session the page
  // restarts itself on the WebGL2 path.
  // A GPU that an earlier session found slower on WebGPU than on WebGL2 starts on WebGL2 (#webgpu forces WebGPU back).
  async function makeRenderer(forceWebGL) {
    const r = new THREE.WebGPURenderer({ canvas, antialias: Q.tier !== 'low', forceWebGL, powerPreference: 'high-performance', trackTimestamp: /perf/.test(location.hash) });
    await r.init();
    // a software or fallback WebGPU adapter is always the slow path: take WebGL2 before anything is built on it
    const ai = !forceWebGL && r.backend && r.backend.device && r.backend.device.adapterInfo;
    if (ai && (ai.isFallbackAdapter || /swiftshader|llvmpipe|software/i.test(`${ai.description} ${ai.vendor} ${ai.architecture}`))) { try { r.dispose(); } catch {} return makeRenderer(true); }
    r.setPixelRatio(Q.ratio);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    renderer = r; backend = r.backend && r.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
    const dev = r.backend && r.backend.device;
    if (dev && dev.lost) dev.lost.then(() => fallBack());
  }
  function fallBack() {
    if (swapping || backend !== 'WebGPU') return;
    swapping = true;
    location.hash = TEST ? '#test-webgl' : '#webgl';
    location.reload();
  }
  await makeRenderer(location.hash.includes('webgl') || (!location.hash.includes('webgpu') && !TEST && backendPreference(Q.hints.gpu) === 'webgl'));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1200);
  camera.rotation.order = 'YXZ';
  const terrain = makeTerrain(7);
  const world = buildWorld(scene, terrain, Q);
  const post = makePost(renderer, scene, camera, Q), draw = () => (post ? post.render() : renderer.render(scene, camera));
  // the quality loops; the backend trial: WebGPU that cannot hold the frame rate even at the bottom of the low level is
  // compared once against WebGL2 on this GPU (a reload while still on the start card, else on the next load); the faster wins
  const BK = 'dh.backend', bkGet = () => { try { return JSON.parse(localStorage.getItem(BK) || 'null'); } catch { return null; } }, bkSet = (v) => { try { localStorage.setItem(BK, JSON.stringify(v)); } catch {} };
  const qc = new QualityController({ Q, renderer, world, post, scene, camera, resize: () => resize(), backend: () => backend, started: () => !!S.started,
    place: () => (terrain.paddock && terrain.paddock.placeName ? terrain.paddock.placeName(camera.position.x, camera.position.z) : ''),
    onBackendTrial: TEST || location.hash.includes('webgl') || location.hash.includes('webgpu') ? null : (m) => {
      const gpu = Q.hints.gpu, rec = bkGet(), mine = rec && rec.gpu === gpu ? rec : null;
      if (backend === 'WebGPU') {
        if (mine && mine.use === 'webgpu') return true;      // already compared on this GPU
        if (!m.slow) return false;
        bkSet({ gpu, use: 'trial-webgl', webgpu: +m.score.toFixed(2) });
        try { localStorage.removeItem('dh.q.auto'); } catch {}      // let the WebGL2 run find its own level
        Q.log.push({ t: Math.round(qc.t), from: 'WebGPU', to: 'WebGL2', why: `slow ${m.avg.toFixed(1)}ms at the bottom of low` });
        if (m.opening) { swapping = true; location.reload(); }
        return true;
      }
      if (mine && mine.use === 'trial-webgl') { const use = m.score > mine.webgpu + 0.1 ? 'webgl' : 'webgpu'; bkSet({ gpu, use, webgpu: mine.webgpu, webgl: +m.score.toFixed(2) }); Q.log.push({ t: Math.round(qc.t), from: 'trial', to: use, why: `WebGPU ${mine.webgpu} vs WebGL2 ${m.score.toFixed(2)}` }); }
      return true;
    } });
  // where the game opens (not the #test hashes, whose scripts expect the animal at the origin): on the Lawn, you and the animal in
  // the open about 30 m apart (paddock.js LAYOUT.spawn), the Feeding Tower off to one side
  const SP = terrain.paddock && terrain.paddock.LAYOUT && terrain.paddock.LAYOUT.spawn;
  const OPEN = TEST ? null : SP ? { x: SP.you.x, z: SP.you.z, rx: SP.rex.x, rz: SP.rex.z, yaw: SP.rex.yaw } : { x: -18, z: -4, rx: 12, rz: -4, yaw: 0.4 };
  const sim = new RexSim(terrain, { x: OPEN ? OPEN.rx : 0, z: OPEN ? OPEN.rz : 0, yaw: OPEN ? OPEN.yaw : 0.4, seed: SEED });
  const mind = new Mind(sim, SEED);
  const body = new RexBody(Q); scene.add(body.group); body.fix = sim.fix;
  const fx = new Effects(scene, terrain), audio = new Audio(), ov = new Overlays(scene, terrain);
  audio.attach({ camera, sim, mind, terrain, world, tier: Q.tier });
  const director = new Director(terrain, SEED + 1);
  if (OPEN) {      // the opening camera stands on the start point, framed as the director frames it (a long lens, stand-off distance), with no cut to a new spot
    const c = director.cam, hy = terrain.height(OPEN.rx, OPEN.rz) + 2.4, dx = OPEN.rx - OPEN.x, dz = OPEN.rz - OPEN.z;
    c.x = OPEN.x; c.z = OPEN.z; c.y = terrain.height(OPEN.x, OPEN.z) + 1.7; c.lx = OPEN.rx; c.ly = hy; c.lz = OPEN.rz;
    c.fov = clamp(2 * Math.atan(6.5 / Math.hypot(dx, dz, hy - c.y)) * 57.3, 18, 70); c.cut = false;
  }
  const arena = new Arena(terrain, sim, mind, SEED), things = arena.things, herd = arena.herd, props = new Props(scene, terrain, Q);
  if (OPEN) arena.opening({ x: OPEN.x, z: OPEN.z });
  const wr = makeRng(SEED + 5);

  const S = {
    mode: 'observe', mindOn: true, timeScale: 1, acc: 0, pace: DIM.walk, stalk: false, lure: false, mx: 0, my: 0,
    goal: null, goalId: 1, keys: new Set(), noises: [], stones: [],
    you: { x: 0, z: 0, yaw: 0, pitch: 0.1, vx: 0, vz: 0, px: 0, pz: 0, crouch: false, eye: 1.7, stepT: 0, push: { x: 0, z: 0 }, up: null, rustleT: 0 },
    fly: { x: 0, y: 8, z: 0, yaw: 0, pitch: -0.2 },
    wind: { a: wr() * 6.283, s: 3 }, clock: 0, fps: 60, hudT: 0, stepTimes: [],
  };
  const prev = { v: new Float32Array(sim.pose.v.length), s: new Float32Array(sim.pose.s.length) };
  const blend = { v: new Float32Array(sim.pose.v.length), s: new Float32Array(sim.pose.s.length) };
  prev.v.set(sim.pose.v); prev.s.set(sim.pose.s);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  // ------------------------------------------------------------ modes
  function setMode(m) {
    if (m === S.mode) return;
    const Y = S.you;
    if (m === 'foot') {
      const c = camera.position;
      if (S.mode === 'observe') {
        // take over from the observing camera exactly where it stands and looks: no cut, no lurch (the lens eases back to
        // normal and the eye settles to standing height over a moment; see moveCamera)
        Y.x = Y.px = c.x; Y.z = Y.pz = c.z; solidify(Y); Y.yaw = camera.rotation.y; Y.pitch = clamp(camera.rotation.x, -1.4, 1.4);
        Y.eye = clamp(c.y - terrain.height(c.x, c.z), 0.6, 3); Y.vx = Y.vz = 0; Y.up = null; S.handled = null;
      } else {
        // from the free camera: step out where it was, or 35 m in front of the animal if that is too close or in the air
        let x = c.x, z = c.z; const d = Math.hypot(x - sim.x, z - sim.z);
        if (d < 18 || S.mode === 'fly') { const a = sim.psi + 0.5; x = sim.x + Math.sin(a) * 35; z = sim.z + Math.cos(a) * 35; }
        Y.x = Y.px = x; Y.z = Y.pz = z; Y.yaw = Math.atan2(-(sim.x - x), -(sim.z - z)); Y.pitch = 0.12;
      }
      S.footSince = S.footSince ?? performance.now();
      if (S.awareAt === undefined) S.awareAt = S.clock + 1;
    } else if (m === 'fly') {
      const f = S.fly; f.x = camera.position.x; f.y = Math.max(camera.position.y + 3, terrain.height(camera.position.x, camera.position.z) + 4); f.z = camera.position.z;
      f.yaw = Math.atan2(-(sim.x - f.x), -(sim.z - f.z)); f.pitch = Math.atan2(sim.py.x - f.y, Math.hypot(sim.x - f.x, sim.z - f.z));
    } else director.cam.cut = true;
    S.mode = m; S.invite = false;
    for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
    document.body.dataset.mode = m;
  }
  function setMind(on) {
    S.mindOn = on; S.goal = null; document.body.dataset.mind = on ? 'on' : 'off';
    $('mindSel').value = on ? 'on' : 'off';
  }
  const reachTo = (x, z) => { const lim = terrain.arena, r = Math.hypot(x, z); if (r > lim) { x *= lim / r; z *= lim / r; } S.goal = { kind: 'reach', id: ++S.goalId, x, z }; };

  // ------------------------------------------------------------ the world acting on it
  const ray = new THREE.Vector3(), rp = new THREE.Vector3();
  function pick(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ray.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize();
    rp.copy(camera.position);
    for (let i = 0, st = 0.3; i < 700; i++, st *= 1.012) { rp.addScaledVector(ray, st); if (rp.y < terrain.height(rp.x, rp.z)) return rp; }
    return null;
  }
  /** Where a throw toward the cursor should go: the animal if the line of aim passes close to it, else the ground. */
  function aimPoint() {
    const r = canvas.getBoundingClientRect(), centre = pad.on || locked() || hoverLook() || (S.mode === 'foot' && (Q.touch || !S.mx)), cx = centre ? r.left + r.width / 2 : S.mx, cy = centre ? r.top + r.height / 2 : S.my;
    ray.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize();
    let best = null, bd = 1.6;
    for (const i of [3, 6, 9, 13, 15, 18, 21, 24]) {
      const j = i < 26 ? sim.spine[i].p : sim.head.pos, vx = j.x - camera.position.x, vy = j.y - camera.position.y, vz = j.z - camera.position.z, along = vx * ray.x + vy * ray.y + vz * ray.z;
      if (along < 1 || along > 45) continue;
      const d = Math.hypot(vx - ray.x * along, vy - ray.y * along, vz - ray.z * along); if (d < bd) { bd = d; best = { x: j.x, y: j.y, z: j.z }; }
    }
    if (best) return best;
    const p = pick(cx, cy); if (p) return { x: p.x, y: null, z: p.z };
    return { x: camera.position.x + ray.x * 25, y: null, z: camera.position.z + ray.z * 25 };
  }
  function lob(kind) {
    const o = camera.position, a = aimPoint(), dx = a.x - o.x, dz = a.z - o.z, d = Math.hypot(dx, dz), k = Math.min(1, (kind === 'meat' ? 22 : 40) / (d || 1));
    if (S.mode !== 'foot') { const x = o.x + dx * k, z = o.z + dz * k; if (kind === 'stone') things.throw('stone', x, terrain.height(x, z) + 6, z, x, z); else things.place(kind, x, z); if (kind === 'flare') audio.ignite(); return; }
    things.throw(kind, o.x, o.y - 0.25, o.z, o.x + dx * k, o.z + dz * k, 'you', k < 1 ? null : a.y);
    if (kind === 'flare') audio.ignite();
  }
  // what you carry: stones come to hand quickly, flares and meat are few and come back slowly. Nothing shows the count; an
  // empty hand simply does nothing (the touch buttons dim). The sandbox drawer's buttons are not rationed.
  // What the player starts each life with is the KIT switch in ui.js ({ torch, flares, stones, meat }); the three entries
  // below always exist (the sandbox and the retired mechanics use them), but only kinds with a count above 0 are in hand.
  // Flares do not come back by themselves: three per life.
  const KIT = { stone: { n: 0, max: 0, every: 2.5, gap: 0.45 }, flare: { n: 0, max: 0, every: Infinity, gap: 2.5 }, meat: { n: 0, max: 0, every: 70, gap: 1.5 } };
  const kitReset = () => { for (const [k, c] of [['stone', KIT_START.stones], ['flare', KIT_START.flares], ['meat', KIT_START.meat]]) { const e = KIT[k]; e.n = e.max = c; e.last = -99; e.t = 0; } };
  kitReset();
  S.kit = KIT;
  // one hand, one held thing: left click (RT, a tap on the view) uses it; the wheel, 1 2 3, the d-pad or the item button changes it
  const ITEMS = [['flare', KIT_START.flares], ['stone', KIT_START.stones], ['meat', KIT_START.meat]].filter(([, c]) => c > 0).map(([k]) => k); S.item = 0; S.items = ITEMS;
  function kitTick(dt) {
    for (const k in KIT) { const c = KIT[k]; if (c.n < c.max) { c.t += dt; if (c.t >= c.every) { c.t = 0; c.n++; } } else c.t = 0; }
    const el = $('tItem'), cur = KIT[ITEMS[S.item]], none = !ITEMS.some((k) => KIT[k].n >= 1);
    if (el) { el.classList.toggle('spent', !cur || cur.n < 1 || none); }      // its label and pips are drawn by ui.js
  }
  function ration(kind, free) {
    if (free) return true;
    const c = KIT[kind], now = performance.now() / 1000;
    if (c.n < 1 || now - c.last < c.gap) return false;
    c.n--; c.last = now; return true;
  }
  /** A ladder foot within reach: [structure, ladder] (towers and the loft; each ladder knows where its top comes out). */
  const ladderNear = (Y) => { for (const t of terrain.structures) if (t.kind === 'tower') for (const l of t.ladders || [{ ...t.ladder, at: [0, 0] }]) if (Math.hypot(l.x - Y.x, l.z - Y.z) < 2.2) return [t, l]; return null; };
  const act = {
    throwStone(free) { if (ration('stone', free)) lob('stone'); },
    throwFlare(free) { if (ration('flare', free)) lob('flare'); },
    throwMeat(free) { if (ration('meat', free)) lob('meat'); },
    /** Use what is in your hand. An empty hand says so, quietly. */
    use() {
      const k = ITEMS[S.item]; if (!k || S.mode === 'observe') return;
      if (KIT[k].n < 1) return;          // nothing to say: the item indicator shows 'none'
      ({ stone: act.throwStone, flare: act.throwFlare, meat: act.throwMeat })[k](); ui.taught('use');
      if (!ITEMS.some((i) => KIT[i].n >= 1)) ui.held();
    },
    select(i) { if (!ITEMS.length) return; S.item = ((i % ITEMS.length) + ITEMS.length) % ITEMS.length; ui.held(); kitTick(0); },
    cycle(d) { act.select(S.item + d); },
    /** The one contextual action: whatever makes sense where you stand (climb the tower, come down, take the meat). */
    interactable() {
      const Y = S.you; if (S.mode !== 'foot' || S.dead || !arena.victim('you').free) return null;
      if (Y.up) return 'climb down';
      for (const t of things.list) if (t.kind === 'meat' && t.amount > 0 && Math.hypot(t.x - Y.x, t.z - Y.z) < 2.4) return 'take the meat';
      if (ladderNear(Y)) return 'climb';
      const D = terrain.doorNear && terrain.doorNear(Y.x, Y.z); if (D) return { open: 'shut the door', closed: 'bar the door', barred: 'unbar the door' }[D[0].state];
      return null;
    },
    interact() { const w = act.interactable(); if (!w) return; if (w === 'take the meat') act.take(); else if (w.endsWith('door')) act.door(); else act.climb(); ui.taught('interact'); },
    /** Swing the nearest door or shutter shut, bar it, or unbar and open it (terrain.useDoor); its sounds go out as events. */
    door() { const Y = S.you, D = terrain.doorNear && terrain.doorNear(Y.x, Y.z); if (!D) return; const st = terrain.useDoor(D, arena.events); const [x, z] = D[0].hinge; S.noises.push({ x, y: D[0].y0 + 1, z, loud: st === 'barred' ? 0.12 : 0.22, kind: 'door', you: true }); },
    // call: a tap whistles (carries across the paddock), holding it shouts (loud, close)
    callDown() { if (S.call) return; S.call = { at: performance.now(), shouted: false }; },
    callUp() { const c = S.call; S.call = null; if (c && !c.shouted) { audio.resume(); act.whistle(); ui.taught('call'); } },
    callTick() { const c = S.call; if (c && !c.shouted && performance.now() - c.at > 350) { c.shouted = true; audio.resume(); act.shout(); ui.taught('call'); } },
    /** Meat taken back from the ground goes back in the bag. */
    gotMeat() { KIT.meat.n = Math.min(KIT.meat.max, KIT.meat.n + 1); },
    /** A new life: the starting kit again (the KIT switch in ui.js). */
    resetKit() { kitReset(); kitTick(0); },
    torch() { if (!KIT_START.torch) return; props.torchOn = !props.torchOn; for (const b of document.querySelectorAll('[data-torch]')) b.setAttribute('aria-pressed', String(props.torchOn)); },
    climb() {
      const Y = S.you; if (S.mode !== 'foot') return;
      if (Y.up) {      // down the ladder whose top is nearest where you stand (the loft has two: inside the barn, and the catwalk to the silo)
        const T = Y.up, Ls = T.ladders || [{ ...T.ladder, at: [0, 0] }]; let L = Ls[0], bd = 1e9;
        for (const l of Ls) { const [ax, az] = [T.cx + l.at[0] * Math.cos(T.yaw) + l.at[1] * Math.sin(T.yaw), T.cz - l.at[0] * Math.sin(T.yaw) + l.at[1] * Math.cos(T.yaw)], d = Math.hypot(ax - Y.x, az - Y.z); if (d < bd) { bd = d; L = l; } }
        Y.x = Y.px = L.x; Y.z = Y.pz = L.z; Y.up = null; return;
      }
      const hit = ladderNear(Y); if (hit) { const [T, l] = hit; Y.up = T; Y.x = T.cx + l.at[0] * Math.cos(T.yaw) + l.at[1] * Math.sin(T.yaw); Y.z = T.cz - l.at[0] * Math.sin(T.yaw) + l.at[1] * Math.cos(T.yaw); }
    },
    teleport(kind) {
      const T = terrain.structures.find((t) => t.key === kind) || terrain.structures.find((t) => t.kind === kind); if (!T) return;
      setMode('foot'); const Y = S.you; Y.up = null;
      if (T.kind === 'tower') { Y.up = T; Y.x = T.cx; Y.z = T.cz; } else { const h = T.hide || { x: T.cx, z: T.cz }; Y.x = Y.px = h.x; Y.z = Y.pz = h.z; }
      Y.yaw = Math.atan2(-(sim.x - Y.x), -(sim.z - Y.z)); Y.crouch = false;
    },
    herdHere() { const a = sim.psi + 0.6; herd.home = { x: sim.x + Math.sin(a) * 45, z: sim.z + Math.cos(a) * 45 }; for (const p of herd.alive) { p.x = herd.home.x + (Math.random() - 0.5) * 12; p.z = herd.home.z + (Math.random() - 0.5) * 12; p.state = 'graze'; p.alert = 0; } },
    shout() { const o = camera.position; S.noises.push({ x: o.x, y: o.y, z: o.z, loud: 0.6, kind: 'shout', you: true }); audio.ping(); },
    // a long, two-finger whistle: the call that carries right across the paddock (~170 m) to get its attention from afar
    whistle() { const o = camera.position; S.noises.push({ x: o.x, y: o.y, z: o.z, loud: 0.9, kind: 'whistle', you: true }); ui.whistle(); },
    /** After a death: back on your feet, out of its reach. Uses the sim's respawn if it has one. */
    respawn() {
      // a new life (victim.js): whole, at a start point well away from the animal, which keeps everything it knows of you
      const V = arena.victim('you'), far = OPEN && Math.hypot(sim.x - OPEN.x, sim.z - OPEN.z) > 40, { x, z } = far ? arena.respawn('you', OPEN.x, OPEN.z) : arena.respawn('you');
      if (S.mode !== 'foot') setMode('foot');
      const Y = S.you; Y.x = Y.px = x; Y.z = Y.pz = z; Y.up = null; Y.crouch = false; S.crouchToggle = false; Y.eye = 1.7; S.handled = null;
      Y.yaw = Math.atan2(-(sim.x - x), -(sim.z - z)); Y.pitch = 0.08; Y.vx = Y.vz = 0;
      if (V.x !== undefined && V.free) { V.x = x; V.z = z; }
      S.footSince = performance.now(); act.resetKit();
    },
    shove() { const dx = sim.x - camera.position.x, dz = sim.z - camera.position.z, d = Math.hypot(dx, dz) || 1; sim.shove((dx / d) * 2.8, (dz / d) * 2.8); fx.kick(0.25); S.noises.push({ x: sim.x, y: sim.py.x, z: sim.z, loud: 0.5, kind: 'shove' }); },
    roar() { sim.roar(); },
    sculpt(h) { const p = pick(S.mx, S.my); if (!p) return; terrain.addBump(p.x, p.z, h, 3.2); world.refresh(p.x, p.z, 9); },
    ridge() {
      const f = [Math.sin(sim.psi), Math.cos(sim.psi)], d = 9 + Math.abs(sim.v) * 1.5;
      for (let k = -3; k <= 3; k++) terrain.addBump(sim.x + f[0] * d + f[1] * k * 2.4, sim.z + f[1] * d - f[0] * k * 2.4, 1.1, 2.4);
      world.refresh(sim.x + f[0] * d, sim.z + f[1] * d, 16);
    },
  };

  // ------------------------------------------------------------ input
  let drag = null;
  const stage = $('stage');
  // ---- the session: a start gate (secures focus, audio and the pointer), pause, pointer lock, fullscreen with keyboard lock.
  // Nothing is bound to Ctrl, Alt or Meta, so browser shortcuts (Ctrl+W, Ctrl+T...) are never needed for play; in fullscreen
  // the Keyboard Lock API keeps every key in the game (hold Esc to leave fullscreen).
  S.started = false; S.paused = false; S.invite = false;
  // Pointer lock (FPS mouse). It needs a user gesture, and a host page that frames us in a sandbox without allow-pointer-lock
  // refuses it: the request rejects / 'pointerlockerror' fires, or nothing happens at all. Either way S.lock.fail is set and
  // the mouse looks by plain movement over the view (no button held), turning on at the edges of the view; a later
  // successful lock clears it. Every click on the view asks again. What the host did is logged once to the console.
  S.lock = { fail: false, err: '', at: 0, asks: 0, ok: 0 };
  const canLock = 'requestPointerLock' in stage;
  const locked = () => document.pointerLockElement === stage;
  let lastPtr = Q.touch ? 'touch' : 'mouse';
  document.addEventListener('pointerdown', (e) => { lastPtr = e.pointerType || 'mouse'; }, true);
  const hoverLook = () => S.lock.fail && !locked() && lastPtr === 'mouse';
  function lockRefused(why) {
    if (locked()) return;
    lockNote('refused (' + why + ')'); S.lock.err = why; S.lock.fail = true; document.body.classList.add('hover');
    if (S.relock && !S.paused && !S.frozen && !S.dead) { S.relock = 0; setPaused(true); }      // back from the note box and the pointer was refused: the pause card
  }
  // Canonical request: bare requestPointerLock() on the stage, called synchronously from the trusted mousedown/click (or key) that
  // is running right now. No await, timer or rAF between the gesture and the call. Failure is only what the browser reports.
  S.lock.state = 'idle'; S.lock.last = '';
  const lockNote = (t) => { S.lock.last = t; console.warn('[dino] pointer lock: ' + t); };
  function lockPointer() {
    if (!canLock || lastPtr !== 'mouse' || S.dev === 'pad' || S.dev === 'touch' || !S.started || S.paused || S.dead || ui.flags.panel || locked()) return;
    S.lock.at = performance.now(); S.lock.asks++;
    try { const p = stage.requestPointerLock(); if (p && typeof p.then === 'function') p.then(undefined, (err) => lockRefused('promise rejected: ' + (err ? err.name + ' ' + err.message : '?'))); }
    catch (err) { lockRefused('threw: ' + (err && (err.name + ' ' + err.message))); }
    try { const v = $('view'); if (v) { v.tabIndex = -1; v.focus({ preventScroll: true }); } } catch {}      // as the reference game does
  }
  const releasePointer = () => { if (locked()) { S.unlockOk = true; document.exitPointerLock(); } };
  const fsOk = !!(document.documentElement.requestFullscreen && document.fullscreenEnabled);
  async function fullscreen(on = !document.fullscreenElement) {
    try {
      if (on) { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); if (navigator.keyboard && navigator.keyboard.lock) await navigator.keyboard.lock().catch(() => {}); }
      else if (document.fullscreenElement) await document.exitFullscreen();
    } catch {}
  }
  document.addEventListener('fullscreenchange', () => { const on = !!document.fullscreenElement; document.body.classList.toggle('fs', on); if (!on && navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock(); });
  // audio may only start from the player's own gesture and stays quiet while paused
  const audioResume = audio.resume.bind(audio);
  audio.resume = (c) => { if (c || (S.started && !S.paused)) audioResume(c); };
  // iOS only lets audio start (and restart after an interruption or a lock) from touchend / pointerup / click, so on every such gesture, and
  // whenever the page comes back, wake a context that is not running; the capture phase, so nothing that stops propagation can hide it.
  // needsUnlock() also covers iOS's media elements (the silent switch): until one is playing, every gesture tries again.
  { const wake = () => { if (S.started && !S.paused && !S.frozen && audio.needsUnlock()) audio.resume(); };      // not while the note box holds the game frozen: typing there must not restart the sound
    for (const ev of ['touchend', 'pointerup', 'click', 'keydown']) document.addEventListener(ev, wake, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); }); window.addEventListener('pageshow', wake); }
  // hidden diagnostic: '#audio' (also '#audioios', '#audiodirect') shows a plain readout of the sound path and a test-tone button
  if (/^#audio/.test(location.hash)) {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:4px;top:4px;z-index:2147483647;max-width:calc(100vw - 8px);background:rgba(0,0,0,.82);color:#fff;font:11px/1.35 ui-monospace,monospace;padding:6px;white-space:pre-wrap;word-break:break-word;pointer-events:auto';
    const btn = document.createElement('button'); btn.textContent = 'test tone'; btn.style.cssText = 'font:13px sans-serif;padding:6px 12px;margin-bottom:4px;display:block';
    const pre = document.createElement('div'); box.append(btn, pre); document.body.appendChild(box);
    for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'touchstart', 'touchend']) box.addEventListener(ev, (e) => e.stopPropagation());
    btn.addEventListener('click', (e) => { e.stopPropagation(); audio.testTone(); upd(); });
    const upd = () => { try { pre.textContent = audio.debugText(); } catch (err) { pre.textContent = 'readout failed: ' + err; } };
    setInterval(upd, 500); upd();
  }
  function start(fs) {
    if (S.started) return;
    S.started = true; document.body.classList.add('started'); audio.resume();
    // fullscreen is its own explicit action (pause card), never part of this gesture
    lockPointer(); S.invite = true; S.startedAt = performance.now(); S.clock0 = S.clock;
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch {}
    window.focus();
  }
  function setPaused(p) {
    if (!S.started || p === S.paused || (p && S.dead)) return;
    S.paused = p; document.body.classList.toggle('paused', p); S.keys.clear(); drag = null;
    if (p) { releasePointer(); try { if (audio.ctx && audio.ctx.state === 'running') audio.ctx.suspend(); } catch {} }
    else { audio.resume(); lockPointer(); }
    ui.paused(p);
    // the card takes the keyboard and the gamepad: Resume has the focus (Enter, Space or A resumes)
    try { if (p) $('pResume').focus({ preventScroll: true }); else if (document.activeElement && $('pause').contains(document.activeElement)) document.activeElement.blur(); } catch {}
  }
  document.addEventListener('pointerlockchange', () => {
    const on = locked(); document.body.classList.toggle('locked', on);
    if (on) { S.lock.fail = false; S.lock.ok++; document.body.classList.remove('hover'); }
    if (!on && S.started && !S.paused && !S.unlockOk && !S.dead && !S.frozen) setPaused(true);      // Esc (or anything else) took the pointer away: pause
    S.unlockOk = false;
  });
  document.addEventListener('pointerlockerror', () => { S.unlockOk = false; lockRefused('pointerlockerror event'); });
  // diagnostic drawer line: lock state and the last error text, for the owner to report
  { const host = document.querySelector('#panel details'); const el = document.createElement('div'); el.className = 'row'; el.style.cssText = 'font-size:11px;opacity:.7;display:block';
    if (host) host.appendChild(el);
    const upd = () => { el.textContent = 'pointer lock: ' + (locked() ? 'locked' : 'unlocked') + ' · asks ' + S.lock.asks + ' ok ' + S.lock.ok + (canLock ? '' : ' · unsupported') + (S.lock.last ? ' · last: ' + S.lock.last : ''); };
    setInterval(upd, 400); upd(); }
  // the first move or look from observe mode steps you out from where the camera stands
  const takeOver = () => { if (S.mode === 'observe' && S.started && !S.paused && !S.dead && !ui.flags.panel) setMode('foot'); };
  // no selecting, dragging or context menus over the game (the drawer's own controls still work)
  const formy = (t) => t && t.closest && t.closest('input, select, textarea');
  for (const ev of ['contextmenu', 'selectstart', 'dragstart']) document.addEventListener(ev, (e) => { if (!formy(e.target)) e.preventDefault(); });
  window.addEventListener('beforeunload', (e) => { if (S.started && S.mode === 'foot' && !TEST) { e.preventDefault(); e.returnValue = ''; } });
  // look speed (the pause card's setting) and the lens: zoomed in, the same hand movement turns you less
  S.sens = (() => { try { const v = +localStorage.getItem('dh.sens'); return v > 0.1 && v < 5 ? v : 1; } catch { return 1; } })();
  S.zoom = { toggle: false, hold: false, padHold: false, cur: 1 };
  S.invert = (() => { try { return localStorage.getItem('dh.invert') === '1'; } catch { return false; } })();
  const look = (dx, dy, k = 0.0042) => { const c = S.mode === 'foot' ? S.you : S.fly; k *= S.sens / S.zoom.cur; c.yaw -= dx * k; c.pitch = clamp(c.pitch - dy * k * (S.invert ? -1 : 1), -1.4, 1.4); };
  const ZOOM = 3;      // the one zoomed state: a fixed magnification over the lens, off or on
  document.addEventListener('mousemove', (e) => {
    if (!locked() || S.paused) return;
    const dx = e.movementX || 0, dy = e.movementY || 0; if (Math.abs(dx) > 300 || Math.abs(dy) > 300) return;      // a browser's jump on lock
    if (S.mode === 'observe') { S.lookAcc = (S.lookAcc || 0) + Math.abs(dx) + Math.abs(dy); if (S.lookAcc > 12) takeOver(); return; }
    look(dx, dy, 0.0024);
  });
  const touches = new Map(); let pinch = null;
  stage.addEventListener('mousedown', () => { if (S.started && !S.paused) lockPointer(); });      // trusted gesture, synchronous
  stage.addEventListener('pointerdown', (e) => {
    if (!S.started) return;
    audio.resume();
    if (e.pointerType === 'mouse' && e.button === 2) { S.zoom.hold = true; ui.taught('zoom'); return; }      // right button: hold to zoom
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { const [p, q] = [...touches.values()]; pinch = { d: Math.hypot(p.x - q.x, p.y - q.y) || 1 }; drag = null; return; }
      if (touches.size > 2) return;
    }
    if (canLock && e.pointerType === 'mouse' && !locked()) { if (S.paused) return; if (S.mode === 'observe') return; }
    if (locked()) { if (e.button === 0 && S.mode !== 'observe' && S.mindOn) act.use(); return; }
    drag = { x: e.clientX, y: e.clientY, moved: 0 }; try { stage.setPointerCapture(e.pointerId); } catch {}
  });
  stage.addEventListener('pointermove', (e) => {
    S.mx = e.clientX; S.my = e.clientY; S.over = true;      // (a mouse moving hands the device back to keyboard/mouse: setDev, above)
    if (pinch && touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size >= 2) { const [p, q] = [...touches.values()], d = Math.hypot(p.x - q.x, p.y - q.y) || 1; pinch.d = d; }      // two fingers: no pinch scaling, just no stray look/tap
      return;
    }
    if (S.lure && !S.mindOn && !drag && S.mode !== 'observe') { const p = pick(e.clientX, e.clientY); if (p) { if (!S.goal || !S.goal.lure) S.goal = { kind: 'reach', id: ++S.goalId, lure: true, x: p.x, z: p.z }; else { S.goal.x = p.x; S.goal.z = p.z; } } }
    // no pointer lock to be had: plain mouse movement over the view looks, as near to an FPS as the host allows
    if (!drag && e.pointerType === 'mouse' && hoverLook() && S.started && !S.paused && !S.dead && !ui.flags.panel) {
      const dx = e.movementX || 0, dy = e.movementY || 0; if (Math.abs(dx) > 200 || Math.abs(dy) > 200) return;
      if (S.mode === 'observe') { S.lookAcc = (S.lookAcc || 0) + Math.abs(dx) + Math.abs(dy); if (S.lookAcc > 12) takeOver(); return; }
      look(dx, dy, 0.003); return;
    }
    if (!drag || locked() || S.paused) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    if (S.mode === 'observe') { if (drag.moved > 14) { takeOver(); drag.moved = 6; } return; }
    look(dx, dy);
  });
  stage.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') S.over = false; });
  const touchEnd = (e) => { touches.delete(e.pointerId); if (pinch && touches.size < 2) { pinch = touches.size ? 'after' : null; drag = null; } };
  stage.addEventListener('pointercancel', (e) => { touchEnd(e); drag = null; });
  stage.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse' && e.button === 2) { S.zoom.hold = false; return; }
    const wasPinch = !!pinch; touchEnd(e); if (wasPinch) { if (!touches.size) pinch = null; return; }
    if (drag && drag.moved < 6 && S.mode !== 'observe' && !S.paused) {
      if (S.mindOn) { if (e.pointerType !== 'touch') act.use(); }      // on touch the flare button throws: a tap while looking never wastes one
      else { const p = pick(e.clientX, e.clientY); if (p) reachTo(p.x, p.z); }
    }
    drag = null;
  });
  // the wheel changes what is in your hand (zoom is on/off only); it never scrolls the page
  let wheelAcc = 0;
  stage.addEventListener('wheel', (e) => { if (!S.started) return; e.preventDefault(); if (S.paused || S.mode === 'observe') return; wheelAcc += e.deltaY; if (Math.abs(wheelAcc) > 40) { act.cycle(wheelAcc > 0 ? 1 : -1); wheelAcc = 0; } }, { passive: false });
  $('tZoom').addEventListener('click', () => { S.zoom.toggle = !S.zoom.toggle; $('tZoom').setAttribute('aria-pressed', String(S.zoom.toggle)); });
  window.addEventListener('mouseup', (e) => { if (e.button === 2) S.zoom.hold = false; });
  // clicking anywhere off the pause card resumes (and asks for the pointer again, from that click)
  $('pause').addEventListener('mousedown', (e) => { if (e.target === e.currentTarget) setPaused(false); });
  // options on the pause card: look speed, the camcorder look (post.setVHS, if the renderer offers it)
  { const el = $('pSens'); if (el) { el.value = Math.log2(S.sens); el.addEventListener('input', () => { S.sens = 2 ** +el.value; try { localStorage.setItem('dh.sens', S.sens.toFixed(3)); } catch {} }); } }
  { const el = $('pInvert'); el.checked = S.invert; el.addEventListener('change', () => { audio.resume(); S.invert = el.checked; try { localStorage.setItem('dh.invert', S.invert ? '1' : '0'); } catch {} }); }
  { const el = $('pVHS'); let on = true; try { on = localStorage.getItem('dh.vhs') !== '0'; } catch {}      // VHS mode starts on; only an explicit choice turns it off
    const setVHS = (v) => { try { if (post && typeof post.setVHS === 'function') post.setVHS(v); } catch {} };
    const els = [el, $('sVHS')].filter(Boolean);       // the pause card's toggle and the start card's: one setting, kept in step
    for (const e of els) { e.checked = on; e.addEventListener('change', () => { for (const o of els) o.checked = e.checked; setVHS(e.checked); try { localStorage.setItem('dh.vhs', e.checked ? '1' : '0'); } catch {} }); }
    if (on) setVHS(true); }
  const MOVE = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
  const setCrouch = (v) => { S.crouchToggle = v; for (const b of document.querySelectorAll('[data-crouch]')) b.setAttribute('aria-pressed', String(v)); };
  window.addEventListener('keydown', (e) => {
    setDev('kb');
    if (e.key === 'Escape' && S.started && S.paused && !S.dead && !ui.flags.panel) { e.preventDefault(); setPaused(false); return; }      // even from a focused slider
    if (formy(e.target)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) { S.keys.clear(); return; }      // leave every browser shortcut alone, and bind none
    const k = e.key.toLowerCase();
    if (!S.started) { if ((k === 'enter' || k === ' ') && !(e.target && e.target.closest && e.target.closest('#start button, #start label'))) { e.preventDefault(); start(false); } return; }
    if (k === 'escape') { if (ui.flags.panel) return; e.preventDefault(); setPaused(!S.paused); return; }
    if (k === 'p' && !S.dead) { setPaused(!S.paused); return; }
    if (S.paused || S.dead) return;
    audio.resume();
    S.keys.add(k);
    if (k.startsWith('arrow') || k === ' ' || k === 'tab') e.preventDefault();
    // struggling: while the animal has hold of you (knocked down, under its foot, in its jaws) every press of a movement key or
    // Space is a kick or a scramble; mashing them gets you out and back on your feet
    if (S.mode === 'foot' && !arena.victim('you').free && [...MOVE, ' '].includes(k)) { if (!e.repeat) { arena.struggle('you', 1); ui.taught('struggle'); } e.preventDefault(); return; }
    if (S.mode === 'observe' && (MOVE.includes(k) && (S.mindOn || !k.startsWith('arrow')))) { takeOver(); return; }
    // the player's verbs: use (click), 1 2 3 / wheel what is in hand, E the one contextual action, Q call, F torch, C crouch
    if (k === '1' || k === '2' || k === '3') { if (S.mode !== 'observe') act.select(+k - 1); }
    else if ((k === 'e' || k === ' ') && S.mode === 'foot' && !e.repeat) act.interact();
    else if (k === 'q' && S.mode !== 'fly' && !e.repeat) act.callDown();
    else if (k === 'f' && !e.repeat) { act.torch(); ui.taught('torch'); }
    else if (k === 'c' && S.mode === 'foot' && !e.repeat) { setCrouch(!S.crouchToggle); ui.taught('crouch'); }
    else if (k === 'z') { S.zoom.hold = true; ui.taught('zoom'); }
    // sandbox and diagnostic keys: only once debug is on (backtick, or #debug); listed in the sandbox drawer
    else if (!ui.debug) return;
    else if (k === 'o') setMode('observe');
    else if (k === 'm') setMind(!S.mindOn);
    else if (k === 'v' && S.mode !== 'observe') act.shove();
    else if (k === 'b') act.roar();
    else if (k === 'x') S.goal = null;
  });
  window.addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); S.keys.delete(k); if (k === 'z') S.zoom.hold = false; if (k === 'q') act.callUp(); });
  window.addEventListener('blur', () => { S.keys.clear(); S.zoom.hold = false; S.call = null; });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !S.frozen) setPaused(true); });
  // touch: a thumbstick to walk (push it to the rim to run), drag anywhere else to look, tap to throw what is in hand
  // the device in use, live: the last of keyboard/mouse ('kb'), touch, gamepad ('pad'). Every hint and control list follows it.
  function setDev(d) {
    if (S.dev === d) return;
    S.dev = d; const b = document.body; b.dataset.dev = d; b.classList.toggle('touch', d === 'touch'); b.classList.toggle('pad', d === 'pad');
    if (padRef) padRef.on = d === 'pad';
    if (uiRef) uiRef.devChanged();
  }
  let padRef = null, uiRef = null;
  document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' || e.pointerType === 'pen') setDev('touch'); else if (e.pointerType === 'mouse') setDev('kb'); }, true);
  document.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && S.dev !== 'kb' && Math.abs(e.movementX) + Math.abs(e.movementY) > 2) setDev('kb'); }, true);
  S.stick = { x: 0, y: 0, id: null };
  const stick = $('stick'), nub = $('nub');
  const stickAt = (e) => { const r = stick.getBoundingClientRect(); let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2); const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } S.stick.x = x; S.stick.y = y; nub.style.transform = `translate(${x * 40}px, ${y * 40}px)`; };
  stick.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (!S.started || S.paused) return; audio.resume(); takeOver(); S.stick.id = e.pointerId; try { stick.setPointerCapture(e.pointerId); } catch {} stickAt(e); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === S.stick.id) stickAt(e); });
  const stickEnd = (e) => { if (e.pointerId === S.stick.id) { S.stick.id = null; S.stick.x = S.stick.y = 0; nub.style.transform = ''; } };
  stick.addEventListener('pointerup', stickEnd); stick.addEventListener('pointercancel', stickEnd);
  $('tCrouch').addEventListener('click', () => { setCrouch(!S.crouchToggle); ui.taught('crouch'); });
  $('tItem').addEventListener('click', () => { audio.resume(); takeOver(); act.use(); });      // the flare button throws
  $('tCycle').addEventListener('click', () => { audio.resume(); act.cycle(1); });
  $('tCall').addEventListener('pointerdown', (e) => { e.preventDefault(); audio.resume(); act.callDown(); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) $('tCall').addEventListener(ev, () => act.callUp());
  $('tAct').addEventListener('click', () => { audio.resume(); act.interact(); });
  // start, pause, fullscreen
  $('startGo').addEventListener('click', (e) => { e.stopPropagation(); start(false); });
  $('start').addEventListener('click', (e) => { if (!e.target.closest('label, button, input')) start(false); });
  if (!fsOk) for (const el of document.querySelectorAll('.fs-only')) el.hidden = true;
  $('pauseBtn').addEventListener('click', () => { audio.resume(); setPaused(!S.paused); });
  $('pResume').addEventListener('click', () => setPaused(false));
  { const b = $('pDebug'); if (b) b.addEventListener('click', () => { setPaused(false); setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '`' })), 60); }); }      // the sandbox drawer without a backtick key (phones; the claude.ai frame has no URL hash)
  $('pAgain').addEventListener('click', () => { ui.restart(); setPaused(false); });
  $('pFull').addEventListener('click', () => { audio.resume(); fullscreen(); });
  if (!KIT_START.torch) $('tTorch').hidden = true;
  $('tTorch').addEventListener('click', () => { act.torch(); ui.taught('torch'); });
  $('tZoom').addEventListener('click', () => ui.taught('zoom'));
  for (const [id, fn] of [['bFlare', () => act.throwFlare(true)], ['bMeat', () => act.throwMeat(true)], ['bTorch', () => act.torch()], ['bHerd', () => act.herdHere()]]) $(id).addEventListener('click', () => { audio.resume(); fn(); });
  $('tp').addEventListener('change', (e) => { if (e.target.value) act.teleport(e.target.value); e.target.value = ''; e.target.blur(); });
  $('herdOn').addEventListener('change', (e) => { herd.disabled = !e.target.checked; });
  // ---- mind probes
  const OV = mind.ov;
  for (const b of Mind.BEHAVIOURS) { const o = document.createElement('option'); o.value = b; o.textContent = b; $('force').appendChild(o); }
  const noticeIds = { nYou: 'you', nSounds: 'sounds', nFood: 'food', nFlares: 'flares', nPrey: 'prey' }, senseIds = { sSight: 'sight', sHear: 'hearing', sSmell: 'smell' };
  for (const [id, k] of Object.entries(noticeIds)) $(id).addEventListener('change', (e) => { OV.notice[k] = e.target.checked; });
  for (const [id, k] of Object.entries(senseIds)) $(id).addEventListener('change', (e) => { OV.senses[k] = e.target.checked; });
  $('omni').addEventListener('change', (e) => { OV.omniscient = e.target.checked; });
  $('force').addEventListener('change', (e) => { OV.force = e.target.value || null; });
  $('freeze').addEventListener('change', (e) => { OV.freeze = e.target.checked; });
  $('temper').addEventListener('change', (e) => { mind.setTemper(e.target.value || null); });
  const drives = { hHun: 'hunger', hIrr: 'irritation', hInt: 'interest', hAr: 'arousal' };
  const syncDrive = (id) => { OV.hold[drives[id]] = $(id + 'C').checked ? +$(id).value : null; };
  for (const id of Object.keys(drives)) { $(id).addEventListener('input', () => { if (!$(id + 'C').checked) { $(id + 'C').checked = true; } syncDrive(id); }); $(id + 'C').addEventListener('change', () => syncDrive(id)); }
  $('onlyYou').addEventListener('click', () => { for (const [id, k] of Object.entries(noticeIds)) { const on = k === 'you' || k === 'sounds'; $(id).checked = on; OV.notice[k] = on; } });
  $('ovReset').addEventListener('click', () => {
    for (const [id, k] of Object.entries(noticeIds)) { $(id).checked = true; OV.notice[k] = true; }
    for (const [id, k] of Object.entries(senseIds)) { $(id).checked = true; OV.senses[k] = true; }
    $('omni').checked = false; OV.omniscient = false; $('force').value = ''; OV.force = null; $('freeze').checked = false; OV.freeze = false; $('temper').value = ''; mind.setTemper(null);
    for (const id of Object.keys(drives)) { $(id + 'C').checked = false; OV.hold[drives[id]] = null; }
  });
  // ---- volumes
  for (const [id, k] of [['volMaster', 'master'], ['volAmb', 'amb'], ['volCre', 'cre'], ['volFx', 'fx']]) { $(id).value = audio.vol[k]; $(id).addEventListener('input', (e) => { audio.resume(); audio.setVolume(k, +e.target.value); }); }
  window.addEventListener('blur', () => S.keys.clear());
  for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => { audio.resume(); setMode(b.dataset.mode); });
  $('mindSel').addEventListener('change', (e) => setMind(e.target.value === 'on'));
  $('pace').addEventListener('input', (e) => { S.pace = +e.target.value; $('paceV').textContent = S.pace.toFixed(1) + ' m/s'; });
  $('speed').addEventListener('change', (e) => { S.timeScale = +e.target.value; });
  $('ovGait').addEventListener('change', (e) => { ov.gait.visible = e.target.checked; });
  $('ovSkel').addEventListener('change', (e) => { ov.skel.visible = e.target.checked; });
  $('ovSense').addEventListener('change', (e) => { ov.senses.visible = e.target.checked; });
  $('stalk').addEventListener('change', (e) => { S.stalk = e.target.checked; });
  $('lure').addEventListener('change', (e) => { S.lure = e.target.checked; if (!S.lure && S.goal && S.goal.lure) S.goal = null; });
  const applyMood = (key) => { world.setMood(key); if (post) post.setMood(key); body.setWet(world.mood.wet); fx.setDust(world.mood.dust, world.mood.wet); audio.setRain(world.mood.rain); };
  $('mood').addEventListener('change', (e) => { audio.resume(); applyMood(e.target.value); });
  applyMood('storm');
  for (const [id, fn] of [['bStone', () => act.throwStone(true)], ['bShout', () => act.shout()], ['bWhistle', () => act.whistle()], ['bShove', () => act.shove()], ['bRoar', () => act.roar()], ['bRaise', () => act.sculpt(1.3)], ['bPit', () => act.sculpt(-1.3)], ['bWall', () => act.ridge()]]) $(id).addEventListener('click', () => { audio.resume(); fn(); });
  { const els = [$('sound'), $('sSound')];
    let on = true; try { on = localStorage.getItem('dh.sound') !== '0'; } catch {}
    const setSound = (v) => { audio.on = v; for (const el of els) el.checked = v; try { localStorage.setItem('dh.sound', v ? '1' : '0'); } catch {} audioResume(); audio._applyVol(); audio.setRain(world.mood.rain); };
    for (const el of els) { el.checked = on; el.addEventListener('change', (e) => setSound(e.target.checked)); }
    if (!on) { audio.on = false; try { audio._applyVol(); } catch {} } }
  $('shake').addEventListener('input', (e) => { fx.shakeGain = +e.target.value; });
  $('call').addEventListener('click', () => { const p = camera.position, b = bearing(sim.x - p.x, sim.z - p.z); reachTo(p.x + Math.sin(b) * 4.6, p.z + Math.cos(b) * 4.6); });
  $('stop').addEventListener('click', () => { S.goal = null; });
  // ------------------------------------------------------------ crash tests (debug drawer; #crash=headon|glancing|corner)
  // The animal is put at a run at the Containers, the player placed side-on 10-15 m off with his view turned to where it will hit
  // and kept out of its way (the mind is off for the run, so it is a scripted run at the solid, not at him); about three seconds
  // after the knock the mind takes over again. The staging is the one the body notes' in-game shots use (out/skel/BODY4.md).
  const CRASH = {
    headon: { rex: [-9, 70, -Math.PI / 2], pace: 9, goal: () => ({ kind: 'drive', throttle: 1, steer: 0 }), you: [-12.5, 63], look: [-24, 70], dur: 6.5 },
    glancing: { rex: [-22.4, 50, Math.atan2(-1.8, 20)], pace: 9.5, goal: () => ({ kind: 'drive', throttle: 1, steer: 0 }), you: [-12.5, 73], look: [-23.5, 68], dur: 6.5 },
    corner: { rex: [-21.5, 48, 0], pace: 9.5, goal: () => ({ kind: 'approach', id: ++S.goalId, x: -46, z: 77, stop: 0.5, quick: true }), you: [-10.5, 77], look: [-24.5, 74], dur: 7.5 },
    // (2026-11-15, probed headless with the same intent: /tmp probe in out/skel/BODY4.md) other things to hit
    barn: { rex: [30, 40, 0], pace: 9, goal: () => ({ kind: 'drive', throttle: 1, steer: 0 }), you: [43, 55], look: [30, 62], dur: 7.5 },              // timber, head-on
    gate: { rex: [-7, 68, 0], pace: 9, goal: () => ({ kind: 'drive', throttle: 1, steer: 0 }), you: [5, 86], look: [-7, 91], dur: 7.5 },               // concrete, head-on
    post: { rex: [-1.6, -42, 0], pace: 9, goal: () => ({ kind: 'drive', throttle: 1, steer: 0 }), you: [9, -23], look: [-3, -17], dur: 7.5 },          // its shoulder clips the Feeding Tower
    bamboo: { rex: [-58, 40, -Math.PI / 2], pace: 9, goal: () => ({ kind: 'drive', throttle: 1, steer: 0 }), you: [-65, 52], look: [-76, 40], dur: 9 },  // a run into the bamboo stand
  };
  let crashRun = null, crashLast = 'headon';
  const crashTest = (key) => {
    const C = CRASH[key] || CRASH[crashLast]; crashLast = CRASH[key] ? key : crashLast; if (!C) return;
    ui.set && ui.set('panel', false);
    setMind(false); setMode('foot');
    sim.reset(C.rex[0], C.rex[1], C.rex[2]); S.pace = C.pace; S.stalk = false; S.goal = C.goal();
    const Y = S.you, [x, z] = C.you; Y.x = Y.px = x; Y.z = Y.pz = z; Y.vx = Y.vz = 0; Y.up = null; Y.crouch = false;
    Y.yaw = Math.atan2(-(C.look[0] - x), -(C.look[1] - z)); Y.pitch = 0.1;
    crashRun = { key: crashLast, t0: sim.t, dur: C.dur };
  };
  const crashTick = () => {
    if (!crashRun) return;
    if (sim.t - crashRun.t0 > crashRun.dur || S.dead) { crashRun = null; S.goal = null; setMind(true); }
  };
  for (const [id, k] of [['cHead', 'headon'], ['cGlance', 'glancing'], ['cCorner', 'corner'], ['cBarn', 'barn'], ['cGate', 'gate'], ['cPost', 'post'], ['cBamboo', 'bamboo'], ['cAgain', null]]) { const el = $(id); if (el) el.addEventListener('click', () => { audio.resume(); crashTest(k || crashLast); }); }
  { const m = location.hash.match(/crash=(headon|glancing|corner|barn|gate|post|bamboo)/); if (m) { const wait = setInterval(() => { if (S.started && !S.paused) { clearInterval(wait); setTimeout(() => crashTest(m[1]), 3000); } }, 250); } }

  function directedIntent() {
    const K = S.keys, up = K.has('arrowup'), dn = K.has('arrowdown'), lf = K.has('arrowleft'), rt = K.has('arrowright');
    let goal = S.goal;
    if (up || dn || lf || rt) { S.goal = null; goal = { kind: 'drive', throttle: up ? 1 : dn ? -0.3 : 0, steer: (lf ? 1 : 0) - (rt ? 1 : 0) }; }
    return { goal, pace: S.pace, attention: S.mode === 'fly' || crashRun ? null : camera.position,      /* in a crash test it is not to know of you: it was watching you all the way in (owner 2026-11-15) */ faceAttention: true, curious: true, stalk: S.stalk };
  }

  // ------------------------------------------------------------ you, as a body in the world
  function solidify(p, r = 0.4) {
    // you cannot stand inside rock or inside the animal; if it walks into you, you are pushed
    { const g = terrain.height(p.x, p.z); terrain.pushOut(p, r, g, g + 1.8, 3); }      // the same solid shapes you see: rocks, trunks, cycads, walls
    for (const q of herd.alive) { const dx = p.x - q.x, dz = p.z - q.z, d = Math.hypot(dx, dz), m = 0.55 + r; if (d < m && d > 0) { p.x = q.x + dx / d * m; p.z = q.z + dz / d * m; } }
    const v = sim.pose.v, L = (k, j) => ({ x: v[(55 + k * 6 + j) * 3], z: v[(55 + k * 6 + j) * 3 + 2] });
    const segs = [[sim.spine[13].p, sim.spine[18].p, 1.25], [sim.spine[13].p, sim.spine[8].p, 1.0], [sim.spine[8].p, sim.spine[3].p, 0.55], [sim.spine[3].p, sim.spine[0].p, 0.3], [L(0, 1), L(0, 2), 0.35], [L(1, 1), L(1, 2), 0.35]];      // trunk, tail to the tip, and the shins
    let pushed = 0;
    for (const [A, B, rad] of segs) {
      const ax = B.x - A.x, az = B.z - A.z, L2 = ax * ax + az * az || 1, t = clamp(((p.x - A.x) * ax + (p.z - A.z) * az) / L2, 0, 1);
      const cx = A.x + ax * t, cz = A.z + az * t, dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz), m = rad + r;
      if (d < m) { p.x = cx + dx / (d || 1) * m; p.z = cz + dz / (d || 1) * m; pushed = Math.max(pushed, m - d); }
    }
    for (const f of sim.feet) { const dx = p.x - f.pos.x, dz = p.z - f.pos.z, d = Math.hypot(dx, dz), m = 0.6 + r; if (d < m) { p.x = f.pos.x + dx / (d || 1) * m; p.z = f.pos.z + dz / (d || 1) * m; pushed = Math.max(pushed, m - d); } }
    if (terrain.bound) { const b = terrain.bound - 0.3; p.x = clamp(p.x, -b, b); p.z = clamp(p.z, -b, b); }      // the square perimeter fence
    else { const R0 = terrain.arena + 10, rr = Math.hypot(p.x, p.z); if (rr > R0) { p.x *= R0 / rr; p.z *= R0 / rr; } }
    return pushed;
  }
  // ---- gamepad (standard mapping): left stick move, right stick look; buttons act on press
  const pad = { on: false, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, prev: [], sprint: false, ny: 0, nx: 0 };
  padRef = pad; S.dev = null; setDev(Q.touch ? 'touch' : 'kb');
  const dz = (x, y) => { const m = Math.hypot(x, y); if (m < 0.16) return [0, 0]; const k = (m - 0.16) / (0.84 * m); return [x * Math.min(k, 1 / m), y * Math.min(k, 1 / m)]; };
  function readPad() {
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null;
    if (!gp) { if (S.dev === 'pad') setDev(Q.touch ? 'touch' : 'kb'); return; }
    const ax = gp.axes, bt = gp.buttons.map((b) => b.pressed || b.value > 0.5), val = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
    [pad.lx, pad.ly] = dz(ax[0] || 0, ax[1] || 0); [pad.rx, pad.ry] = dz(ax[2] || 0, ax[3] || 0); pad.lt = val(6); pad.rt = val(7);
    S.zoom.padHold = S.mode !== 'fly' && pad.lt > 0.4;                                                 // LT: hold to zoom (in the free camera it sinks)
    const down = (i) => bt[i] && !pad.prev[i];
    const any = bt.some(Boolean) || Math.hypot(pad.lx, pad.ly, pad.rx, pad.ry) > 0;
    if (any) { setDev('pad'); audio.resume(); }
    if (S.frozen) { pad.prev = bt; return; }      // the note box is open: the pad does nothing
    if (!S.started) { if (down(9)) start(false); else padMenu($('start'), down); pad.prev = bt; return; }   // Start: begin; A: the focused control (start, unless moved)
    if (down(9) && !S.dead) setPaused(!S.paused);                                                      // Start/Menu: pause
    if (S.paused) { if (down(1)) setPaused(false); else padMenu($('pause'), down); pad.prev = bt; return; }   // B: resume; d-pad and A work the card
    if (S.dead) { if (document.body.classList.contains('dead')) padMenu($('dead'), down); pad.prev = bt; return; }
    if (S.mode === 'observe' && (Math.hypot(pad.lx, pad.ly, pad.rx, pad.ry) > 0.3)) takeOver();          // a stick: step in
    if (!!bt[8] !== !!pad.prev[8]) ui.peek(!!bt[8]);                                                     // View/Back held: peek at the controls
    if (S.mode !== 'observe') {
      if (down(7)) act.use();                                             // RT: use what is in hand
      if (down(5)) act.cycle(1); if (down(4)) act.cycle(-1);             // RB / LB: what is in hand
    }
    if (S.mode !== 'fly') { if (down(2)) act.callDown(); if (!bt[2] && pad.prev[2]) act.callUp(); }   // X: tap whistle, hold shout
    if (S.mode === 'foot') {
      if (down(0)) act.interact();                                        // A: the contextual action
      if (down(1)) { setCrouch(!S.crouchToggle); ui.taught('crouch'); }  // B: crouch
      if (down(3)) { act.torch(); ui.taught('torch'); }                  // Y: torch
      if (down(10)) pad.sprint = !pad.sprint;                             // L3: sprint
      if (Math.hypot(pad.lx, pad.ly) < 0.2) pad.sprint = false;
    }
    pad.prev = bt;
  }

  // A card (start, pause, the end) on a gamepad: d-pad or left stick up/down moves the focus, left/right changes a slider, a
  // list or a box, A presses the focused control (or the card's main button when nothing has the focus)
  function padMenu(card, down) {
    const list = [...card.querySelectorAll('button, select, input, summary')].filter((e) => !e.disabled && e.getClientRects().length && !e.closest('[hidden]') && !(e.tagName !== 'SUMMARY' && e.closest('details:not([open])')));
    if (!list.length) return;
    const step = (v, key) => { const was = pad[key]; pad[key] = Math.abs(v) > 0.6 ? Math.sign(v) : Math.abs(v) < 0.3 ? 0 : was; return pad[key] !== was ? pad[key] : 0; };
    const sy = step(pad.ly, 'ny'), sx = step(pad.lx, 'nx');
    const dy = down(12) ? -1 : down(13) ? 1 : sy, dx = down(14) ? -1 : down(15) ? 1 : sx;
    const cur = list.indexOf(document.activeElement), el = cur >= 0 ? list[cur] : null;
    if (dy) { const i = cur < 0 ? (dy > 0 ? 0 : list.length - 1) : (cur + dy + list.length) % list.length; list[i].focus({ preventScroll: true }); list[i].scrollIntoView({ block: 'nearest' }); }
    if (dx && el) {
      if (el.type === 'range') { if (dx > 0) el.stepUp(); else el.stepDown(); el.dispatchEvent(new Event('input', { bubbles: true })); }
      else if (el.tagName === 'SELECT') { el.selectedIndex = clamp(el.selectedIndex + dx, 0, el.options.length - 1); el.dispatchEvent(new Event('change', { bubbles: true })); }
      else if (el.type === 'checkbox') el.click();
    }
    if (down(0)) {
      audio.resume();
      if (el && el.tagName === 'SELECT') { el.selectedIndex = (el.selectedIndex + 1) % el.options.length; el.dispatchEvent(new Event('change', { bubbles: true })); }
      else if (el && el.type !== 'range') el.click(); else if (!el) { const b = card.querySelector('.big'); if (b) b.click(); }
    }
  }

  function moveCamera(dt) {
    const K = S.keys;
    if (pad.on && S.mode !== 'observe') {         // look: rate grows with deflection, a little faster at the rim
      const c = S.mode === 'foot' ? S.you : S.fly, m = Math.hypot(pad.rx, pad.ry), g = 2.6 * (0.45 + 0.55 * m) * dt * S.sens / S.zoom.cur;
      c.yaw -= pad.rx * g; c.pitch = clamp(c.pitch - pad.ry * g * 0.75 * (S.invert ? -1 : 1), -1.4, 1.4);
    }
    const V = arena.victim('you');
    if (S.mode === 'foot' && (!V.free || S.handled)) {
      // the animal has hold of you: the simulation owns your body; the camera rides it (tumbling, lying, in the jaws), the look
      // you had when it took you is kept as an offset you can still turn, and movement keys are struggles (see keydown)
      const Y = S.you, C = V.cam;
      if (!S.handled) S.handled = { yaw: Y.yaw, pitch: Y.pitch };
      const oy = Y.yaw - S.handled.yaw, op = Y.pitch - S.handled.pitch;
      const held = K.has('w') || K.has('a') || K.has('s') || K.has('d') || Math.hypot(S.stick.x, S.stick.y) > 0.5 || (pad.on && Math.hypot(pad.lx, pad.ly) > 0.5);
      if (held && !V.free) arena.struggle('you', Math.min(0.5, dt * 2.5));      // a held key counts for a little; mashing counts for much more
      Y.x = Y.px = V.x; Y.z = Y.pz = V.z; Y.vx = Y.vz = 0; Y.push.x = Y.push.z = 0; Y.crouch = false; Y.up = null;
      if (V.free) {
        // on your feet again: you look where the fall left you looking
        Y.yaw = C.yaw + oy; Y.pitch = clamp(C.pitch + op, -1.4, 1.4); Y.eye = 1.7; S.handled = null;
      } else {
        const sk = C.shake * 0.06 * (fx.shakeGain ?? 1), rnd = () => Math.random() * 2 - 1;
        camera.position.set(C.x + rnd() * sk, C.y + rnd() * sk, C.z + rnd() * sk);
        camera.rotation.set(clamp(C.pitch + op * (C.free ? 1 : 0.3), -3.2, 3.2) + rnd() * sk * 0.5, C.yaw + oy * (C.free ? 1 : 0.3), C.roll + rnd() * sk * 0.5);
        Y.eye = C.eye;
      }
    }
    if (S.mode === 'foot' && V.free && !S.handled) {
      const Y = S.you, sl = Math.hypot(S.stick.x, S.stick.y), sprint = K.has('shift') || sl > 0.92 || pad.sprint; Y.crouch = !!S.crouchToggle;
      const AR = S.mindOn;      // with its own mind on, the arrow keys walk you too (with it directed they steer the animal)
      let f = (K.has('w') || (AR && K.has('arrowup')) ? 1 : 0) - (K.has('s') || (AR && K.has('arrowdown')) ? 1 : 0), r = (K.has('d') || (AR && K.has('arrowright')) ? 1 : 0) - (K.has('a') || (AR && K.has('arrowleft')) ? 1 : 0);
      if (sl > 0.15) { f = -S.stick.y; r = S.stick.x; }
      if (pad.on && Math.hypot(pad.lx, pad.ly) > 0) { f = -pad.ly; r = pad.lx; }
      // the ground under you: wading and mud hold you back (terrain.speedFactor); off the tower, a face steeper than a person
      // can scramble up (PERSON_SLOPE) turns an uphill step aside, axis by axis, so you slide along the foot of it
      const ground = Y.up || !terrain.speedFactor ? 1 : terrain.speedFactor(Y.x, Y.z, 'person');
      const mag = Math.min(1, Math.hypot(f, r)), sp = (Y.crouch ? 1.3 : sprint && V.canSprint ? 6.2 : 2.6) * mag * (V.slow || 1) * ground, sy = Math.sin(Y.yaw), cy = Math.cos(Y.yaw), n = Math.hypot(f, r) || 1;
      Y.px = Y.x; Y.pz = Y.z;
      Y.x += ((-sy * f + cy * r) / n * sp + Y.push.x) * dt; Y.z += ((-cy * f - sy * r) / n * sp + Y.push.z) * dt;
      if (!Y.up && terrain.slopeAt) {
        const h0 = terrain.height(Y.px, Y.pz), steep = (x, z) => { const d = Math.hypot(x - Y.px, z - Y.pz), dh = terrain.height(x, z) - h0; return d > 1e-5 && ((dh / d > PERSON_SLOPE && terrain.slopeAt(x, z) > PERSON_SLOPE) || dh < -PERSON_DROP); };      // nor step off a drop deeper than PERSON_DROP (the bluff, the ledge, the hole over the cave)
        if (steep(Y.x, Y.z)) { if (!steep(Y.x, Y.pz)) Y.z = Y.pz; else if (!steep(Y.px, Y.z)) Y.x = Y.px; else { Y.x = Y.px; Y.z = Y.pz; } }
      }
      Y.push.x *= Math.exp(-dt * 4); Y.push.z *= Math.exp(-dt * 4);
      if (Y.up) { const T = Y.up, dx = Y.x - T.cx, dz = Y.z - T.cz, c = Math.cos(T.yaw), s2 = Math.sin(T.yaw); let lx = dx * c - dz * s2, lz = dx * s2 + dz * c; lx = clamp(lx, -T.hw + 0.4, T.hw - 0.4); lz = clamp(lz, -T.hd + 0.4, T.hd - 0.4); Y.x = T.cx + lx * c + lz * s2; Y.z = T.cz - lx * s2 + lz * c; }
      else if (solidify(Y) > 0.05) fx.kick(0.04);
      Y.vx = (Y.x - Y.px) / dt; Y.vz = (Y.z - Y.pz) / dt;
      Y.eye += ((Y.crouch ? 1.0 : 1.7) - Y.eye) * Math.min(1, dt * 8);
      // footsteps: walking is quiet, running carries
      const v = Math.hypot(Y.vx, Y.vz);
      // (what the ground is changes the step: gravel and rock click, water splashes; the splash the animal hears is the arena's)
      if (v > 0.5) { Y.stepT -= dt * v; if (Y.stepT <= 0) { Y.stepT = 1.5; const surf = Y.up ? 'wood' : terrain.surfaceAt ? terrain.surfaceAt(Y.x, Y.z) : 'grass', hard = surf === 'gravel' || surf === 'rock' ? 1.5 : 1; const loud = Y.crouch ? 0 : (v > 4 ? 0.16 : 0.045) * hard; if (loud) S.noises.push({ x: Y.x, y: terrain.height(Y.x, Y.z), z: Y.z, loud, kind: 'step', you: true }); audio.step(Y.crouch ? 0.03 : v > 4 ? 0.2 : 0.08, surf); } }
      const bob = v > 0.5 ? Math.sin(sim.t * (v > 4 ? 13 : 8)) * (v > 4 ? 0.05 : 0.025) : 0;
      // pushing through fern is noisy, and leaves a trail of bent fronds
      if (v > 0.4 && !Y.up) { Y.rustleT -= dt; if (Y.rustleT <= 0) { Y.rustleT = 0.35; const f = world.trample(Y.x, Y.z, 0.7, 0.55); if (f > 0.2) { audio.rustle(Y.crouch ? 0.05 : v > 4 ? 0.3 : 0.14); S.noises.push({ x: Y.x, y: terrain.height(Y.x, Y.z), z: Y.z, loud: Y.crouch ? 0.02 : v > 4 ? 0.14 : 0.06, kind: 'rustle', you: true }); } } }
      camera.position.set(Y.x, (Y.up ? Y.up.base + Y.up.h : terrain.height(Y.x, Y.z)) + Y.eye + bob, Y.z);
      camera.rotation.set(Y.pitch, Y.yaw, 0);
    } else if (S.mode !== 'foot') {
      const c = S.fly, fast = K.has('shift') ? 3 : 1, sp = 14 * fast * dt, cp = Math.cos(c.pitch);
      let f = (K.has('w') ? 1 : 0) - (K.has('s') ? 1 : 0), r = (K.has('d') ? 1 : 0) - (K.has('a') ? 1 : 0), u = (K.has('e') ? 1 : 0) - (K.has('q') ? 1 : 0);
      if (pad.on) { if (Math.hypot(pad.lx, pad.ly) > 0) { f = -pad.ly; r = pad.lx; } u += pad.rt - pad.lt; }
      const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
      c.x += (-sy * cp * f + cy * r) * sp; c.z += (-cy * cp * f - sy * r) * sp; c.y += (Math.sin(c.pitch) * f + u) * sp;
      c.y = Math.max(c.y, terrain.height(c.x, c.z) + 0.4);
      camera.position.set(c.x, c.y, c.z);
      camera.rotation.set(c.pitch, c.yaw, 0);
    }
    // the lens eases to normal (after taking over from observe mode's long lens there is no zoom jump)
    if (S.lens === undefined) S.lens = camera.fov;
    if (S.lens !== 62) S.lens = Math.abs(S.lens - 62) < 0.05 ? 62 : S.lens + (62 - S.lens) * Math.min(1, dt * 2.2);
  }
  /** The player's zoom over whatever lens the camera has (observe mode's director, or the eye): hold RMB/Z, LT, or the touch toggle: on or off. */
  function lens(dt) {
    const Z = S.zoom, target = Z.hold || Z.padHold || Z.toggle ? ZOOM : 1;
    Z.cur += (target - Z.cur) * Math.min(1, dt * 9); if (Math.abs(Z.cur - target) < 0.002) Z.cur = target;
    const base = S.lens ?? 62, fov = 2 * Math.atan(Math.tan(base * Math.PI / 360) / Z.cur) * 180 / Math.PI;
    if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); }
    // no pointer lock: the pointer resting near the edge of the view keeps turning you that way
    if (hoverLook() && S.over && S.mode !== 'observe' && S.started && !S.paused && !S.dead && !ui.flags.panel && !drag) {
      const r = canvas.getBoundingClientRect(), u = (S.mx - r.left) / r.width, v = (S.my - r.top) / r.height, E = 0.07;
      const ex = u < E ? -(E - u) / E : u > 1 - E ? (u - 1 + E) / E : 0, ey = v < E ? -(E - v) / E : v > 1 - E ? (v - 1 + E) / E : 0;
      if (ex || ey) look(clamp(ex, -1, 1) * 2.4 * dt / 0.0042, clamp(ey, -1, 1) * 1.2 * dt / 0.0042);
    }
  }
  // It cannot sense you (or the camera) until a moment after you first take over: every player sees it become aware of
  // them. Until then no agent is offered, and the noises you make are kept from it.
  const aware = () => S.awareAt !== undefined && S.clock >= S.awareAt;
  function agents() {
    if (!aware()) return [];
    if (S.mode === 'observe') return [director.agent()];
    if (S.mode === 'fly') return [];
    const Y = S.you, sp = Math.hypot(Y.vx, Y.vz);
    const f = ray.set(0, 0, -1).applyQuaternion(camera.quaternion);
    return [{ id: 'you', x: Y.x, y: (Y.up ? Y.up.base + Y.up.h : terrain.height(Y.x, Y.z)) + Y.eye, z: Y.z, vx: Y.vx, vz: Y.vz, speed: sp, crouch: Y.crouch, fx: -Math.sin(Y.yaw), fz: -Math.cos(Y.yaw), torch: props.torchOn, lx: f.x, ly: f.y, lz: f.z }];
  }

  function birds(x, z, loud) { const n = props.flush(x, z, loud); if (n) { S.noises.push(n); audio.flurry(Math.hypot(n.x - camera.position.x, n.z - camera.position.z)); } }

  // ------------------------------------------------------------ frame
  function frame(dtReal) {
    dtReal = Number.isFinite(dtReal) && dtReal > 0 ? dtReal : 0;      // never a negative or NaN step (see the loop below)
    qc.begin();
    readPad(); act.callTick(); crashTick();
    const run = S.paused || S.frozen ? 0 : 1, dts = dtReal * S.timeScale * run, dtv = dtReal * Math.min(S.timeScale, 1) * run;      // paused: the world holds still
    S.wind.a += (wr() - 0.5) * dts * 0.02; S.wind.s = 2.5 + 1.5 * Math.sin(sim.t * 0.05);
    const wind = { x: Math.sin(S.wind.a) * S.wind.s, z: Math.cos(S.wind.a) * S.wind.s };
    world.setWind(wind); fx.wind = wind; props.wind = wind;      // the world shows the wind the animal smells by

    S.acc += dts; S.clock += dts;
    let n = 0;
    const ag = agents();
    while (S.acc >= DT && n < 12) {
      S.acc -= DT; n++;
      prev.v.set(sim.pose.v); prev.s.set(sim.pose.s);
      if (S.mode === 'observe') { S.noises.push(...director.noises); director.noises.length = 0; }
      if (!aware() && S.noises.length) S.noises = S.noises.filter((q) => !q.you);
      arena.step(DT, { agents: ag, noises: S.noises, light: world.light, flash: world.flash, wind }, S.mindOn ? null : directedIntent());
      S.noises.length = 0;
      S.legT = (S.legT || 0) - DT;
      if (S.legT <= 0) { S.legT = 0.15; for (const f of sim.feet) if (!f.planted) world.trample(f.pos.x, f.pos.z, 0.9, 0.6); for (const p of herd.alive) if (p.v > 2) world.trample(p.x, p.z, 0.5, 0.4);
        world.wake('rex', sim.x, sim.z, 1.5); if (S.mode === 'foot' && !S.you.up) world.wake('you', S.you.x, S.you.z, 0.5); }      // plants part round the body and lie in its wake
      for (const e of arena.events) {
        audio.src = e;      // places the sound of this event
        const dist = camera.position.distanceTo(sim.head.pos), at = e.x !== undefined ? Math.hypot(e.x - camera.position.x, (e.y ?? camera.position.y) - camera.position.y, e.z - camera.position.z) : dist;
        if (e.src === 'things') {
          if (e.type === 'impact') { if (e.kind === 'stone') audio.stoneHit(at, e); else audio.thud(Math.min(0.5, 3 / (1 + at))); if (e.first) fx.puff && fx.puff(e.x, e.y, e.z); if (e.loud > 0.25) birds(e.x, e.z, e.loud); }
          else if (e.type === 'hit') { audio.smack(at); fx.puff && fx.puff(e.x, e.y, e.z); }
          else if (e.type === 'stamped') { audio.thud(0.4); }
          continue;
        }
        if (e.src === 'herd') { if (e.type === 'alarm' && Math.random() < 0.5) audio.alarm(at); if (e.type === 'killed') { audio.crunch(at); fx.kick(Math.min(0.4, 6 / (2 + at))); } continue; }
        if (e.src === 'mind') {
          if (e.type === 'nudge') { const k = 3.2; audio.thud(0.9); fx.kick(0.5); if (S.mode === 'foot') { S.you.push.x += e.dx * k; S.you.push.z += e.dz * k; } else if (S.mode === 'observe') { director.cam.x += e.dx * 1.2; director.cam.z += e.dz * 1.2; } }
          else if (e.type === 'bite') audio.crunch(at); else if (e.type === 'tear') audio.tear(at);
          continue;
        }
        if (e.src === 'victim') {
          // what happened to a person's body: you feel it if it is you
          const me = e.id === 'you' && S.mode === 'foot', near = Math.min(1, 6 / (2 + at));
          if (e.type === 'knocked') { audio.smack(me ? 0 : at); audio.thud(me ? 1 : near); if (me) fx.kick(0.9); }
          else if (e.type === 'landed') { audio.thud(Math.min(1, e.speed / 7) * (me ? 1 : near)); if (me) fx.kick(Math.min(1, 0.25 + e.speed / 9)); }
          else if (e.type === 'seized') { audio.crunch(me ? 0 : at); if (me) { fx.kick(0.8); fx.rumble && fx.rumble(0.5, 1.2); } }
          else if (e.type === 'pinned') { audio.thud(me ? 1 : near); if (me) { fx.kick(0.7); fx.rumble && fx.rumble(0.4, 2); } }
          else if (e.type === 'tossed' || e.type === 'dropped' || e.type === 'slipped' || e.type === 'wriggled') { if (me) fx.kick(0.3); }
          continue;
        }
        if (e.type === 'footfall') { fx.footfall(e, camera.position, audio); world.trample(e.x, e.z, 1.3, 1); S.stepTimes.push(sim.t); if (S.stepTimes.length > 5) S.stepTimes.shift(); }
        else if (e.type === 'roar') { audio.roar(dist); fx.kick(Math.min(0.7, 14 / (4 + dist))); birds(sim.x, sim.z, 1); }
        else if (e.type === 'huff') { audio.huff(dist); if (dist < 6) fx.kick(0.05); }
        else if (e.type === 'contact') { if (audio.contact) audio.contact(e, dist); { const tr = e.part === 'torso' || e.part === 'hips', hf = (e.force || 0) + (tr ? 2.5 : 0); if (hf > 1.2 && dist < 28) fx.kick(Math.min(0.4, 0.045 * hf) * (1 - dist / 28)); if (hf > 2.5 && fx.puff) for (let i = 0; i < (tr ? 5 : 3); i++) fx.puff(e.x + (Math.random() - 0.5) * 1.2, (e.y || 0) * (i % 2 ? 0.15 : 1), e.z + (Math.random() - 0.5) * 1.2); } }
        else if (e.type === 'growl') { audio.growl(dist); fx.rumble && fx.rumble(Math.min(0.5, 6 / (3 + dist)), 2.2); }
        else if (e.type === 'clack') { audio.clack(dist); fx.kick(Math.min(0.8, 5 / (1 + dist))); }
        else if (e.type === 'worry') { audio.growl(dist); fx.rumble && fx.rumble(Math.min(0.6, 8 / (2 + dist)), 1.8); }
        else if (e.type === 'butt' || e.type === 'swipe' || e.type === 'toss') { audio.huff(dist); }
        else if (e.type === 'arrived' && !S.mindOn && S.goal && S.goal.id === e.id && !S.goal.lure) S.goal = null;
      }
      arena.events.length = 0;
      ov.sample(sim, DT);
    }
    if (n === 12) S.acc = 0;
    const a = S.acc / DT, pv = prev.v, cv = sim.pose.v, bv = blend.v;
    for (let i = 0; i < bv.length; i++) bv[i] = pv[i] + (cv[i] - pv[i]) * a;
    for (let i = 0; i < blend.s.length; i++) blend.s[i] = prev.s[i] + (sim.pose.s[i] - prev.s[i]) * a;
    body.glareEye = mind.dazzle || null; body.update(blend); fx.breath(body.nostril, body.snout, blend.s[1], dtv); if (audio.breathCue) { fx.snort(body.nostril, body.snout, audio.breathCue); audio.breathCue = 0; }

    if (S.mode === 'observe') {
      director.update(dtReal * run, sim, mind, camera); solidify(director.cam, 0.5); S.lens = director.cam.fov;
      const D = director.drop; director.drop = null;
      if (D) {
        // meat goes upwind, so the scent comes to it; a flare goes where it can see it
        const w = Math.atan2(S.wind.a ? Math.sin(S.wind.a) : 0, Math.cos(S.wind.a)), up = D.kind === 'meat' ? S.wind.a + Math.PI + (Math.random() - 0.5) * 0.6 : sim.psi + (Math.random() - 0.5) * 1.2;
        let x = sim.x + Math.sin(up) * D.d, z = sim.z + Math.cos(up) * D.d; const r = Math.hypot(x, z), lim = terrain.arena - 8; if (r > lim) { x *= lim / r; z *= lim / r; }
        if (!(D.kind === 'meat' && things.list.some((o) => o.kind === 'meat'))) things.place(D.kind, x, z);
        void w;
      }
    }
    else if (!S.paused && !S.frozen) moveCamera(dtReal);
    lens(dtReal); if (!S.paused && !S.frozen) kitTick(dts);
    fx.update(dtv, camera);
    world.followLight(sim.x, sim.groundY, sim.z);
    if (world.update(dtv, camera, renderer)) {
      const delay = 0.6 + Math.random() * 2.2, a = Math.random() * 6.283; audio.thunder(delay);
      S.thunderAt = { t: performance.now() + delay * 1000, x: sim.x + Math.sin(a) * 900, z: sim.z + Math.cos(a) * 900 };
    }
    if (S.thunderAt && performance.now() > S.thunderAt.t) { S.noises.push({ x: S.thunderAt.x, y: 300, z: S.thunderAt.z, loud: 1, kind: 'thunder' }); S.thunderAt = null; }
    props.update(dtv, things, herd, camera, performance.now() / 1000);
    { let h = 0; for (const o of things.list) if (o.kind === 'flare' && o.burn > 0) h = Math.max(h, 0.25 / (1 + camera.position.distanceTo(new THREE.Vector3(o.x, o.y, o.z)) * 0.25)); audio.hiss(h); }
    ov.update(sim, blend, S.mindOn ? (mind.intent.goal && mind.intent.goal.kind === 'reach' ? mind.intent.goal : null) : S.goal, null, 9);
    ov.updateSenses(sim, mind);
    audio.breath(blend.s[1], camera.position.distanceTo(sim.head.pos));
    if (!S.noRender && !swapping) { try { draw(); } catch (err) { if (backend === 'WebGPU') fallBack(); else throw err; } tel.afterDraw(); }

    S.fps += (1 / Math.max(dtReal, 1e-3) - S.fps) * 0.05;
    // hold the frame rate: resolution (fast) and the quality level (slow), from measured frame times (src/view/quality.js)
    if (!TEST && !S.noRender) qc.end(dtReal);
    ui.frame(dtReal * run, dtReal);
    tel.frame(dtReal);
  }

  const ui = createUI({ S, sim, mind, camera, canvas, arena, terrain, act, Q, audio, SEED, test: TEST, backend: () => backend, pad, post, props,
    session: { start, setPaused, releasePointer, lockPointer, setMode, takeOver, fullscreen, fsOk, locked } });
  uiRef = ui;
  // the note box (src/telemetry.js): freeze time where it stands, without the pause card, and come back from it. Freezing lets the
  // pointer go (so the box can be clicked) without pausing; unfreezing asks for it again from the same key press or click that
  // sent the note; if the pointer was in use and is refused, the pause card comes up instead.
  function freeze(on) {
    if (on) {
      if (!S.started || S.paused || S.dead || S.frozen) return false;
      S.frozen = true; S.keys.clear(); drag = null; S.call = null; S.zoom.hold = false; S.stick.x = S.stick.y = 0; S.stick.id = null; nub.style.transform = '';
      document.body.classList.add('frozen'); S.relockWas = locked(); releasePointer();
      try { if (audio.ctx && audio.ctx.state === 'running') audio.ctx.suspend(); } catch {}
      return true;
    }
    if (!S.frozen) return false;
    S.frozen = false; document.body.classList.remove('frozen'); audio.resume();
    if (S.relockWas) {
      S.relock = performance.now(); lockPointer();
      setTimeout(() => { if (S.relock && !locked() && !S.paused && !S.frozen && !S.dead) setPaused(true); S.relock = 0; }, 1200);
    }
    return true;
  }
  // session telemetry and notes (src/telemetry.js): reads the game, never changes it; '#notel' turns it off
  let tel = NO_TELEMETRY;
  if (!/notel/.test(location.hash)) tel = createTelemetry({ S, sim, mind, arena, act, audio, camera, canvas, Q, ui, props, post, renderer, SEED, backend: () => backend, freeze });
  window.__tel = tel;

  qualityMenu(qc);
  watchBody(renderer, body);      // self-check a few frames in: is the skin visible and drawing? (window.__bodyCheck, #perf)
  document.body.dataset.mode = 'observe'; document.body.dataset.mind = 'on';
  $('boot').remove();
  if (TEST) {
    window.__dino = {
      ui, start, setPaused, takeOver, renderer, scene, sim, mind, S, director, camera, setMode, setMind, reachTo, fx, ov, body, act, world, applyMood, arena, props, qc, post, Q, get backendNow() { return backend; },
      advance(sec, fdt = 1 / 30) { S.noRender = true; for (let t = 0; t < sec - fdt - 1e-9; t += fdt) frame(fdt); S.noRender = false; frame(fdt); },
      look(px, py, pz, tx, ty, tz) { camera.position.set(px, py, pz); camera.lookAt(tx, ty, tz); body.update(sim.pose); world.followLight(sim.x, sim.groundY, sim.z); world.update(0, camera, renderer); draw(); },
    };
    window.__dino.backend = backend;
    if (!/start/.test(location.hash)) start(false);      // tests begin past the start card unless they ask to see it
    frame(1 / 30);
  } else {
    window.__rex = { get kit() { return S.kit; }, get items() { return S.items; }, S, arena, props, ui, ov, renderer, scene, camera, body, Q, qc, post, world, get backend() { return backend; }, recheck: () => watchBody(renderer, body, { frames: 10, secs: 0.5 }) };      // console/diagnostics handle (the body self-check reads it)
    let last = performance.now();
    // a rAF timestamp is when the frame began, which can be earlier than the performance.now() taken above (by seconds after a
    // long boot on a slow device): never hand the simulation a negative step (it ran the director's easing backwards, so its
    // look point and lens blew up before the start card was dismissed, and the takeover inherited a ground-facing, whited-out view)
    const loop = (now) => { const dt = clamp((now - last) / 1000, 0, 0.1); last = Math.max(last, now); frame(dt); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
}

boot().catch((err) => {
  console.error(err);
  const b = $('boot'); if (b) b.textContent = 'This browser could not start the 3D renderer (' + (err && err.message ? err.message : err) + '). Try a current Chrome, Edge, Firefox or Safari.';
});
