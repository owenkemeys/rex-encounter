import './newplayer.js';      // '#newplayer': wipe first-visit state before anything reads storage
import * as THREE from 'three/webgpu';
import { makeTerrain } from './terrain.js';
import { RexSim, DIM } from './sim/rex.js';
import { Mind } from './sim/mind.js';
import { RexBody, watchBody } from './view/body.js';
import { buildWorld } from './view/world.js';
import { Effects, Audio } from './view/effects.js';
import { Overlays } from './view/overlays.js';
import { Replay } from './view/replay.js';
import { createClip } from './view/clip.js';      // clip
import { Director } from './director.js';
import { Arena } from './sim/arena.js';
import { Props } from './view/props.js';
import { makePost } from './view/post.js';
import { clamp, bearing, makeRng, renew } from './math.js';
import { pickRespawn } from './paddock.js';
import * as JMP from './jump.js';      // the on-foot jump (pure numbers; test/jump.mjs)
import { createUI, KIT as KIT_START } from './ui.js';
import { tune, tuneGroup } from './view/tune.js';      // tune
import { touchLayout } from './touchlayout.js';
import { GAIT_DEMOS, GAIT_CAM, GaitMeter } from './gaitdemo.js';      // gait demos
import { detectQuality, backendPreference, QualityController, qualityMenu } from './view/quality.js';
import { createTelemetry, NO_TELEMETRY } from './telemetry.js';
import { countRun } from './runs.js';
import { makeGatehouseDesk } from './view/gatehouse.js';      // the gatehouse start: the guard's counter and monitor
import { gateFidget } from './gatesplash.js';      // the gatehouse start: the guard's small sounds that keep the animal round the hut

const DT = 1 / 120;
const PERSON_SLOPE = 1.0, PERSON_DROP = 2.2;      // steepest ground (rise over run) a person on foot can scramble up: the Bluff, the Overlook's faces and the Crags are not
const $ = (id) => document.getElementById(id);
const TEST = location.hash.startsWith('#test');
// quality: chosen by measured frame time (src/view/quality.js); hints (GPU name, cores, memory, phone) only make the first guess
const Q = detectQuality(TEST);
const pickSeed = () => { const m = location.hash.match(/seed(\d+)/); return m ? +m[1] : TEST ? 3 : (Date.now() % 100000); };
let SEED = pickSeed();      // a new one for each scenario: every page load and every start over

async function boot() {
  let canvas = $('view'), renderer, backend, swapping = false;
  // the loading bar (index.html fills the first half as the code arrives): each step is shown before the next one holds the page
  const bootAt = (f) => { const i = document.querySelector('#bootBar i'); if (i) i.style.width = (f * 100).toFixed(1) + '%'; return new Promise((ok) => setTimeout(ok, 0)); };
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
  await bootAt(0.56);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1200);
  camera.rotation.order = 'YXZ';
  const terrain = makeTerrain(7); await bootAt(0.62);
  const world = buildWorld(scene, terrain, Q); await bootAt(0.72);
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
  // where the game opens (not the #test hashes, whose scripts expect the animal at the origin): in the open about equally far from
  // the Barn, the Containers and the gatehouse, the animal about 24 m off and coming (paddock.js LAYOUT.spawns.first)
  const SPOTS = terrain.paddock && terrain.paddock.LAYOUT && terrain.paddock.LAYOUT.spawns, FIRST = SPOTS && SPOTS.first;      // first spawn of a session: paddock.js LAYOUT.spawns
  const SP = FIRST ? { you: FIRST.you, rex: { x: FIRST.rex.x, z: FIRST.rex.z, yaw: Math.atan2(FIRST.you.x - FIRST.rex.x, FIRST.you.z - FIRST.rex.z) } } : terrain.paddock && terrain.paddock.LAYOUT && terrain.paddock.LAYOUT.spawn;
  const OPEN = TEST ? null : SP ? { x: SP.you.x, z: SP.you.z, rx: SP.rex.x, rz: SP.rex.z, yaw: SP.rex.yaw } : { x: -18, z: -4, rx: 12, rz: -4, yaw: 0.4 };
  // The gatehouse start, only with '#gate' in the hash since 2026-11-18 (owner: "lets revert the scenario then to just starting about
  // eqidistant between a few structures"; not with a crash test): paddock.js LAYOUT.spawns.gate. The splash is the gatehouse's
  // security camera, live: the animal comes in from the paddock east of the hut and sniffs round it. "click to begin" only takes the card
  // away (the feed carries on, with sound); the first move or look (takeOver) cuts to you, the guard, looking down at that monitor, and you
  // look up from it, out of the east window it is coming to. Respawns use the usual spots, never the hut.
  const GATE = OPEN && SPOTS && SPOTS.gate && /(^|[#&-])gate($|[&-])/.test(location.hash) && !/crash/.test(location.hash) ? SPOTS.gate : null;
  const body = new RexBody(Q); scene.add(body.group);
  const fx = new Effects(scene, terrain), audio = new Audio(), ov = new Overlays(scene, terrain);
  const props = new Props(scene, terrain, Q); await bootAt(0.78);
  // the gatehouse feed: the hut's own cameras (SE and SW corners) while one can see the animal, and still while it is round the hut out of
  // their sight (the owner: never cut away to the paddock while it is at the hut); a pole camera out where the director would stand only
  // when it has gone off. The splash uses `director` (observe mode later, 'o' or watching after a death, frames as before); the monitor on
  // the guard's counter keeps showing the same feed after the cut (`feedDir`, src/view/gatehouse.js live()).
  const HUTCAMS = GATE ? [{ ...GATE.cam, cam: 1, label: 'GATEHOUSE EXT' }, ...(GATE.cam2 ? [{ ...GATE.cam2, cam: 2, label: 'GATEHOUSE W' }] : [])] : [];
  const gateMount = (D) => (sm, md) => {
    const at = (M) => ({ x: M.x, y: terrain.height(M.x, M.z) + M.y, z: M.z, cam: M.cam, label: M.label });
    const sees = (M) => { const p = at(M); return Math.hypot(sm.x - M.x, sm.z - M.z) < 45 && md.los(p.x, p.y, p.z, sm.head.pos.x, sm.head.pos.y, sm.head.pos.z); };
    const cur = D.cam.mount && HUTCAMS.find((M) => M.cam === D.cam.mount.cam), far = (M) => Math.hypot(sm.x - M.x, sm.z - M.z) > D.tooClose;
    if (cur && sees(cur) && far(cur)) return at(cur);
    const vis = HUTCAMS.filter(sees).sort((a, b) => (far(b) - far(a)) || Math.abs(Math.hypot(sm.x - a.x, sm.z - a.z) - 10) - Math.abs(Math.hypot(sm.x - b.x, sm.z - b.z) - 10));      // not right under it; about 10 m off frames it best
    if (vis.length) return at(vis[0]);
    if (Math.hypot(sm.x - GATE.guard.x, sm.z - GATE.guard.z) < 22) return at(cur || HUTCAMS[0]);      // round the back of the hut: stay on the hut
    const s = D._spot(sm, md); return { ...s, y: s.y + 3.3, cam: 3 + ((Math.abs(Math.round(s.x * 7 + s.z * 3)) % 7)), label: 'PADDOCK' };
  };
  // The scenario: the animal, its mind, the things, herd and people in the paddock, the cameras that follow it. Built here, and built
  // again from nothing by the pause card's "start over" (startOver), which is a fresh start without a page load. `arena` keeps its
  // identity (the view and telemetry tap its step); everything else is new.
  let sim, mind, arena, things, herd, director, feedDir, fidget, wr, rpx;
  function newScenario() {
    sim = new RexSim(terrain, GATE ? { x: GATE.rex.x, z: GATE.rex.z, yaw: GATE.rex.yaw, seed: SEED } : { x: OPEN ? OPEN.rx : 0, z: OPEN ? OPEN.rz : 0, yaw: OPEN ? OPEN.yaw : 0.4, seed: SEED });
    mind = new Mind(sim, SEED); body.fix = sim.fix;
    audio.attach({ camera, sim, mind, terrain, world, tier: Q.tier });
    director = new Director(terrain, SEED + 1);
    if (GATE) { const m = gateMount(director); director.mount = (sm, md) => (S.gate ? null : m(sm, md)); director.tooClose = 6; }
    feedDir = GATE ? new Director(terrain, SEED + 3) : null;
    if (feedDir) { feedDir.mount = gateMount(feedDir); feedDir.tooClose = 6; }
    if (GATE) { const c = director.cam, M = GATE.cam; c.x = M.x; c.z = M.z; c.y = terrain.height(M.x, M.z) + M.y; c.cut = true; c.mount = { ...HUTCAMS[0], y: c.y }; }
    else if (OPEN) {      // the opening camera stands on the start point, framed as the director frames it (a long lens, stand-off distance), with no cut to a new spot
      const c = director.cam, hy = terrain.height(OPEN.rx, OPEN.rz) + 2.4, dx = OPEN.rx - OPEN.x, dz = OPEN.rz - OPEN.z;
      c.x = OPEN.x; c.z = OPEN.z; c.y = terrain.height(OPEN.x, OPEN.z) + 1.7; c.lx = OPEN.rx; c.ly = hy; c.lz = OPEN.rz;
      c.fov = clamp(2 * Math.atan(6.5 / Math.hypot(dx, dz, hy - c.y)) * 57.3, 18, 70); c.cut = false;
    }
    const A = new Arena(terrain, sim, mind, SEED); arena = arena ? renew(arena, A) : A; things = arena.things; herd = arena.herd;
    fidget = GATE ? gateFidget(GATE, terrain, SEED) : null; wr = makeRng(SEED + 5);
    rpx = Object.create(sim); rpx.head = Object.create(sim.head); rpx.head.pos = new THREE.Vector3(); rpx.act = null; rpx.headTouch = null;      // what the audio sees of the animal while it plays: the recorded head
  }
  newScenario();
  const desk = GATE ? makeGatehouseDesk(scene, terrain, GATE) : null;
  let gateWarm = 0;      // the feed's look goes on after a few frames in the camcorder look, so that look is built before the cut (else the first frames after it came out blank)

  // what a scenario starts from ("start over" puts these back and drops every field added in play: startOver)
  const freshS = () => ({
    mode: 'observe', acc: 0, goal: null, goalId: 1, noises: [], stones: [], item: 0, started: false, paused: false, invite: false,
    you: { x: 0, z: 0, yaw: 0, pitch: 0.1, vx: 0, vz: 0, px: 0, pz: 0, crouch: false, eye: 1.7, stepT: 0, push: { x: 0, z: 0 }, up: null, rustleT: 0, J: JMP.newJump(), dip: 0 },
    fly: { x: 0, y: 8, z: 0, yaw: 0, pitch: -0.2 },
    wind: { a: wr() * 6.283, s: 3 }, clock: 0, hudT: 0, stepTimes: [],
  });
  const S = { mindOn: true, timeScale: 1, pace: DIM.walk, stalk: false, lure: false, mx: 0, my: 0, keys: new Set(), fps: 60, ...freshS() };
  const prev = { v: new Float32Array(sim.pose.v.length), s: new Float32Array(sim.pose.s.length) };
  const blend = { v: new Float32Array(sim.pose.v.length), s: new Float32Array(sim.pose.s.length) };
  prev.v.set(sim.pose.v); prev.s.set(sim.pose.s);
  // death cam (src/view/replay.js): the tape runs while you are on foot; "watch it back" on the death card plays it from outside
  const rec = new Replay(scene, terrain, sim.pose.v.length, sim.pose.s.length), tagEl = document.getElementById('replayTag');
  // The replay is shot by a security camera (src/view/ptz.js picks the mount and moves the camera; post.setCCTV is the look, on whatever the VHS setting).
  // While it runs the things in the world are the recorded ones (rec.things), live sim events are not played, and the recorded sound events are
  // re-emitted through the usual audio calls with the listener at the camera, through a thin small-microphone filter (audio.mic). Dust, rain, the herd stay as now.
  let torchLive = false, micHeld = false;
  const clip = createClip({ getCanvas: () => canvas, audio, tape: rec, extra: () => { const V = arena.victims && arena.victims.get('you'); return { cause: V && V.cause, eaten: !!(V && V.gone), motive: V && V.lastHurt && V.lastHurt.motive, deaths: V ? V.lives : 1, crouch: !!S.you.crouch, label: rec.label, lasted: S.footSince && V ? (performance.now() - S.footSince) / 1000 - (V.dead ? Math.max(0, (V.clock || 0) - (V.deadT || 0)) : 0) : 0 }; }, onCard: (live) => { if (!live && S.dead) paChime(true); } }); S.clip = clip;      // closeout: the card's facts      // clip: "save clip" on the death card records the replay to a file
  // The death card's PA chime, 0.5 s after the card is up: out loud once per death, and into every recording of the card (watch again and SAVE CLIP re-record it)
  function paChime(intoClip) { const V = arena.victims && arena.victims.get('you'), life = V ? V.lives : 1, spk = S.chimed !== life; S.chimed = life; audio.chime(spk, intoClip && clip.active, 0.5); }
  function startClip() {      // closeout: "save clip" on the death menu when there is no finished clip (the replay was skipped): the replay and card play once more, recorded, with the small tag
    if (!clip.supported || !S.dead || (S.replay && !S.replayHold) || clip.hasClip()) return false;
    try { audio.resume(); } catch {}      // clipsound: inside the tap on SAVE CLIP: wake the audio context so the re-recording has sound
    clip.wantSave = true;      // handed over by itself at the end if the browser still allows it, else the button is pressed once more
    if (!startReplay(false, true) || !clip.active) { clip.wantSave = false; if (S.replay) holdReplay(); return false; }
    return true;
  }
  // closeout: a clip taken in play. The game is frozen (S.clipLive: the sim, the animal and you do not advance), the last 15 s of the tape play through the same camera and recorder, and the game comes back as it was.
  let liveSaved = null;
  function startLiveClip() {
    if (!clip.supported || !S.started || S.dead || S.replay || S.paused || S.frozen || S.clipLive || clip.active || S.mode !== 'foot' || rec.count < 90 || rec.death >= 0) return false;
    liveSaved = { p: camera.position.clone(), q: camera.quaternion.clone(), fov: camera.fov, torch: props.torchOn, locked: locked() };
    S.clipLive = true; S.keys.clear(); drag = null; S.call = null; S.zoom.hold = false; releaseTouch();
    if (!rec.play(camera.aspect, true)) { S.clipLive = false; liveSaved = null; return false; }
    S.replay = true; document.body.classList.add('replay'); tagEl.hidden = true; clip.dropCard();
    if (post && post.setCCTV) post.setCCTV(true);
    torchLive = props.torchOn; audio.sim = rpx; if (audio.mic) audio.mic(true, false, 0.03, 1.5); micHeld = false;      // the replay's sound comes up from silence (it may open on a roar)
    if (!clip.start(true, true)) { endReplay(); return false; }
    document.body.classList.add('clipping'); return true;
  }
  function endLiveClip(relock = true) {
    if (!S.clipLive) return; S.clipLive = false; document.body.classList.remove('clipping');
    const L = liveSaved; liveSaved = null;
    if (L) { camera.position.copy(L.p); camera.quaternion.copy(L.q); if (camera.fov !== L.fov) { camera.fov = L.fov; camera.updateProjectionMatrix(); } props.torchOn = L.torch; }
    S.keys.clear(); audio.resume();
    if (relock && L && L.locked && S.started && !S.paused) { S.relock = performance.now(); lockPointer(); setTimeout(() => { if (S.relock && !locked() && !S.paused && !S.frozen && !S.dead) setPaused(true); S.relock = 0; }, 1200); }
  }
  const TAG = tagEl.textContent;
  /** `auto`: the death cam's own first play. A replay records itself (untagged: nothing on screen) unless a finished clip of this death exists; `tagged`: SAVE CLIP after a skip, with the small tag. */
  function startReplay(auto, tagged) {
    if (!S.dead || (S.replay && !S.replayHold) || !rec.play(camera.aspect)) return false;
    const was = S.replayHold; S.replayHold = false; document.body.classList.remove('hold'); audio.chimeStop();
    S.replay = true; document.body.classList.add('replay'); tagEl.hidden = false;
    if (post && post.setCCTV) post.setCCTV(true);
    if (!was) torchLive = props.torchOn; audio.sim = rpx; if (audio.mic) audio.mic(true, false, 0.03, 1.5); micHeld = false;      // the replay's sound comes up from silence (it may open on a roar)
    clip.dropCard(); clip.dim(false);
    if (!clip.hasClip() && !clip.active && (tagged ? clip.supported : clip.canRecord())) { if (clip.start(false, !!tagged) && tagged) document.body.classList.add('clipping'); }      // record by default; the file is finished by the time the menu is up
    return true;
  }
  // one recorded sound event, as the camera's microphone catches it: placed by its own position, heard from the camera
  function hear(e) {
    audio.src = e; const cp = camera.position, hp = rpx.head.pos, dist = cp.distanceTo(hp), at = e.x !== undefined ? Math.hypot(e.x - cp.x, (e.y ?? cp.y) - cp.y, e.z - cp.z) : dist;
    if (e.src === 'things') {
      if (e.type === 'impact') { if (e.kind === 'stone') audio.stoneHit(at, e); else audio.thud(Math.min(0.5, 3 / (1 + at))); if (e.first && fx.puff) fx.puff(e.x, e.y, e.z); }
      else if (e.type === 'hit') { audio.smack(at); if (fx.puff) fx.puff(e.x, e.y, e.z); }
      else if (e.type === 'stamped') audio.thud(0.4);
      else if (e.type === 'ignite') audio.ignite();
      return;
    }
    if (e.src === 'herd') { if (e.type === 'alarm') audio.alarm(at); if (e.type === 'killed') audio.crunch(at); return; }
    if (e.src === 'mind') { if (e.type === 'bite') audio.crunch(at); else if (e.type === 'tear') audio.tear(at); return; }
    if (e.src === 'victim') {
      const near = Math.min(1, 6 / (2 + at));
      if (e.type === 'knocked') { audio.smack(at); audio.thud(near); } else if (e.type === 'landed') audio.thud(Math.min(1, e.speed / 7) * near);
      else if (e.type === 'seized') audio.crunch(at); else if (e.type === 'pinned') audio.thud(near);
      return;
    }
    if (e.type === 'footfall') fx.footfall(e, cp, audio);
    else if (e.type === 'roar') audio.roar(dist); else if (e.type === 'huff') audio.huff(dist);
    else if (e.type === 'contact') { if (audio.contact) audio.contact(e, dist); if ((e.force || 0) > 2.5 && fx.burst) fx.burst(e.x, e.y || 0, e.z, e.nx || 0, e.nz || 0, clamp(((e.force || 0) - 2.5) / 6, 0.15, 1)); }
    else if (e.type === 'growl' || e.type === 'worry') audio.growl(dist); else if (e.type === 'clack') audio.clack(dist);
    else if (e.type === 'butt' || e.type === 'swipe' || e.type === 'toss') audio.huff(dist);
  }
  // owner: "pressing any key (except t) brings up the usual death/respawn menu, with restart replay button"
  // The key or click that ends it is swallowed (held key repeats, its keyup, the click after a tap) so it cannot press a button on the card.
  let eatKey = null, eatClick = 0;
  const recLocked = () => clip.active && clip.tagged;
  // closeout: what happens to a recording when the footage stops: it is finished (then the "ready" panel) or thrown away
  function clipStop(natural) {
    if (!clip.active) return false;
    document.body.classList.remove('clipping');
    if (natural === true) {
      const live = S.clipLive, want = clip.wantSave; clip.wantSave = false;
      clip.finish().then((ok) => { if (live) { if (ok) clipReadyPanel(); else endLiveClip(); } else if (ok && want) clip.deliver(true).then((r) => { try { ui.clipResult(r); } catch {} }); }, () => { if (live) endLiveClip(); });
      return true;
    }
    clip.wantSave = false; clip.cancel(); return false;      // skipped early: the recording is incomplete, thrown away
  }
  function clipReadyPanel() {
    if (S.clipLive && locked()) { S.unlockOk = true; document.exitPointerLock(); }      // the panel is clicked: the pointer comes back for it
    clip.openReady(() => { if (S.clipLive) endLiveClip(); else try { ui.deathFocus(); } catch {} });
  }
  // The footage and the card are over (or a key or click, Escape). After a death: the death menu over the closing card (or over the last frame when it was skipped before the card), dimmed. A clip taken in play: back to the game.
  function stopReplay(natural) { if (!S.replay) return; if (S.dead && !S.clipLive) holdReplay(natural); else endReplay(natural); }
  function holdReplay(natural) {
    if (!S.replay) return;
    clipStop(natural); clip.dim(true);
    S.replayHold = true; document.body.classList.remove('replay'); document.body.classList.add('hold'); tagEl.hidden = true;
    if (audio.mic) audio.mic(true, true); audio.hiss(0); post.cctvU.burst.value = 0;
    try { ui.deathMenu(); paChime(false); } catch {}      // the replay was skipped before the card: the chime comes with the menu
  }
  function endReplay(natural) {
    if (!S.replay) return;
    const fin = clipStop(natural); clip.dropCard(); clip.dim(false); S.replayHold = false; document.body.classList.remove('hold');
    S.replay = false; rec.stop(); document.body.classList.remove('replay'); tagEl.hidden = true;
    if (post && post.setCCTV) post.setCCTV(false);      // the player's own VHS setting is back as it was
    props.torchOn = torchLive; audio.sim = sim; if (audio.mic) audio.mic(false, false); audio.hiss(0);
    if (!eatKey && !S.clipLive) try { document.getElementById('xAgain').focus({ preventScroll: true }); } catch {}      // after the keyup when a key ended it
    if (S.clipLive && !fin) endLiveClip(!S.noRelock);      // closeout
  }
  window.addEventListener('keydown', (e) => {
    if (S.frozen) return;      // the note box is open: typing there is its own
    if (eatKey && e.key === eatKey) { e.stopImmediatePropagation(); e.preventDefault(); return; }
    if (S.replay && recLocked()) { if (e.key.toLowerCase() === 't' && !e.ctrlKey && !e.metaKey && !e.altKey) return; e.stopImmediatePropagation(); e.preventDefault(); if (e.key === 'Escape' && !e.repeat) { eatKey = e.key; stopReplay(); } return; }      // a recording the player asked for: only Escape ends it (T still opens the note box and holds the tape)
    if (S.dead && (S.replayHold || !S.replay) && document.body.classList.contains('dead') && !e.ctrlKey && !e.metaKey && !e.altKey) {      // closeout: the death menu's keys
      const k = e.key.toLowerCase(), clickIf = (id) => { const b = $(id); if (b && !b.hidden && !e.repeat) { e.stopImmediatePropagation(); e.preventDefault(); b.click(); } };
      if (k === 'r') clickIf('xReplay'); else if (k === 'c') clickIf('xClip'); else if (k === 'enter' && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#dead button'))) clickIf('xAgain');
      return;
    }
    if (!S.replay || S.replayHold || (e.key.toLowerCase() === 't' && !e.ctrlKey && !e.metaKey && !e.altKey)) return;      // t is the note box: it passes through and the replay runs on
    e.stopImmediatePropagation(); e.preventDefault(); if (!e.repeat) { eatKey = e.key; stopReplay(); }
  }, true);
  window.addEventListener('keyup', (e) => {
    if (!eatKey || e.key !== eatKey) return;
    e.stopImmediatePropagation(); e.preventDefault(); eatKey = null;
    if (S.dead && !S.replay) try { document.getElementById('xAgain').focus({ preventScroll: true }); } catch {}
  }, true);
  window.addEventListener('pointerdown', (e) => {
    if (S.replay && recLocked()) { if (e.target.closest && e.target.closest('#noteBox, #noteBtn, #noteShield')) return; e.stopImmediatePropagation(); e.preventDefault(); return; }      // clip
    if (!S.replay || S.replayHold || S.frozen || (e.target.closest && e.target.closest('#noteBox, #noteBtn, #noteShield'))) return;
    e.stopImmediatePropagation(); e.preventDefault(); eatClick = performance.now() + 500; stopReplay();
  }, true);
  window.addEventListener('click', (e) => { if (performance.now() < eatClick) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);

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
      if (S.footSince == null) { S.footSince = performance.now(); countRun(); }
      if (S.awareAt === undefined) S.awareAt = S.clock + 1;
      // the open start: the meeting begins as you step in (your first footfalls are heard), not while the start card is up; hungrier
      // than the gatehouse's, so the nosing turns to wanting you within the first minute (FIRST.hunger; test/openstart.mjs)
      if (OPEN && !GATE && !S.met) { S.met = true; arena.opening({ x: Y.x, z: Y.z }, 45, (FIRST && FIRST.hunger) || undefined); }
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
    const o = camera.position, a = aimPoint(), dx = a.x - o.x, dz = a.z - o.z, d = Math.hypot(dx, dz), k = Math.min(1, (kind === 'meat' ? PLY.throwMeat : kind === 'flare' ? PLY.throwFlare : PLY.throwStone) / (d || 1));
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
  const PLY = { walk: 2.6, run: 6.2, crouch: 1.3, eyeStand: 1.7, eyeCrouch: 1.0, throwStone: 40, throwFlare: 40, throwMeat: 22 };      // tune: the player's speeds (m/s), eye heights (m) and how far a throw goes (m)
  { const G = 'Player', K = KIT; tuneGroup(G, { order: 80 });      // tune
    tune(G, 'Walk speed (m/s)', PLY, 'walk', 0.8, 8, 0.05, null, 'player.walk'); tune(G, 'Run speed (m/s)', PLY, 'run', 2, 14, 0.1, null, 'player.run'); tune(G, 'Crouch speed (m/s)', PLY, 'crouch', 0.3, 5, 0.05, null, 'player.crouch'); tune(G, 'Eye height standing (m)', PLY, 'eyeStand', 1.0, 2.4, 0.01, null, 'player.eyeStand'); tune(G, 'Eye height crouched (m)', PLY, 'eyeCrouch', 0.4, 1.6, 0.01, null, 'player.eyeCrouch');      // tune
    tune(G, 'Flare throw: furthest it lands (m)', PLY, 'throwFlare', 5, 120, 1, null, 'player.throwFlare'); tune(G, 'Stone throw: furthest it lands (m)', PLY, 'throwStone', 5, 120, 1, null, 'player.throwStone'); tune(G, 'Meat throw: furthest it lands (m)', PLY, 'throwMeat', 5, 80, 1, null, 'player.throwMeat');      // tune
    tune(G, 'Stones come back every (s)', K.stone, 'every', 0.5, 20, 0.1, null, 'kit.stone.every'); tune(G, 'Meat comes back every (s)', K.meat, 'every', 5, 300, 1, null, 'kit.meat.every'); tune(G, 'Pause between stone throws (s)', K.stone, 'gap', 0.1, 5, 0.05, null, 'kit.stone.gap'); tune(G, 'Pause between flares (s)', K.flare, 'gap', 0.1, 10, 0.1, null, 'kit.flare.gap'); tune(G, 'Pause between meat throws (s)', K.meat, 'gap', 0.1, 10, 0.1, null, 'kit.meat.gap'); }      // tune
  const kitReset = () => { for (const [k, c] of [['stone', KIT_START.stones], ['flare', KIT_START.flares], ['meat', KIT_START.meat]]) { const e = KIT[k]; e.n = e.max = c; e.last = -99; e.t = 0; } };
  kitReset();
  S.kit = KIT;
  // one hand, one held thing: left click (RT, a tap on the view) uses it; the wheel, 1 2 3, the d-pad or the item button changes it
  const ITEMS = [['flare', KIT_START.flares], ['stone', KIT_START.stones], ['meat', KIT_START.meat]].filter(([, c]) => c > 0).map(([k]) => k); S.items = ITEMS;
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
      const D = terrain.doorNear && terrain.doorNear(Y.x, Y.z); if (D) return (D[0].state === 'open' ? 'shut the door' : 'open the door');
      return null;
    },
    interact() { const w = act.interactable(); if (!w) return; if (w === 'take the meat') act.take(); else if (w.endsWith('door')) act.door(); else act.climb(); ui.taught('interact'); },
    /** Swing the nearest door or shutter shut or open (terrain.useDoor); its sounds go out as events. */
    door() { const Y = S.you, D = terrain.doorNear && terrain.doorNear(Y.x, Y.z); if (!D) return; terrain.useDoor(D, arena.events); const [x, z] = D[0].hinge; S.noises.push({ x, y: D[0].y0 + 1, z, loud: 0.22, kind: 'door', you: true }); },
    // call: a tap whistles (carries across the paddock), holding it shouts (loud, close)
    callDown() { if (S.call) return; S.call = { at: performance.now(), shouted: false }; },
    callUp() { const c = S.call; S.call = null; if (c && !c.shouted) { audio.resume(); act.whistle(); ui.taught('call'); } },
    callTick() { const c = S.call; if (c && !c.shouted && performance.now() - c.at > 400) { c.shouted = true; audio.resume(); act.shout(); ui.taught('call'); } },
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
      const V = arena.victim('you'), pk = SPOTS && SPOTS.respawn && pickRespawn(terrain, SPOTS.respawn, sim.x, sim.z, sim.head.pos.y), far = !pk && OPEN && Math.hypot(sim.x - OPEN.x, sim.z - OPEN.z) > 40, { x, z } = pk ? arena.respawn('you', pk.x, pk.z) : far ? arena.respawn('you', OPEN.x, OPEN.z) : arena.respawn('you');      // the farthest respawn spot 40 m or more from it, unseen first; else the old rule
      if (S.footSince != null) countRun();
      if (S.mode !== 'foot') setMode('foot');
      const Y = S.you; Y.x = Y.px = x; Y.z = Y.pz = z; Y.up = null; JMP.reset(Y.J); Y.dip = 0; S.jumpReq = false; Y.crouch = false; S.crouchToggle = false; Y.eye = 1.7; S.handled = null;
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
    document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); }); window.addEventListener('pageshow', wake);
    // a tap while the sound is still faded out (the focus event never came: some phones and frames) brings it back first
    for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, () => { if (audio._away && !document.hidden) audio.back(S.started && !S.paused && !S.frozen); }, { capture: true, passive: true }); }
  // not in front, no sound: a hidden tab, a hidden or frozen page: fade 0.1 s then suspend; a blurred window (another window or app in
  // front, or focus moved out of the frame): fade 0.15 s, suspend after a 0.3 s grace so a browser prompt does not chop the sound.
  // Back (visible, focus, pageshow): the master fades up over 0.2 s and a resume is tried (iOS may refuse without a gesture: the next tap's wake does it).
  { const hideNow = () => audio.away(120, 0.03), backNow = () => { if (!document.hidden) audio.back(S.started && !S.paused && !S.frozen); };
    document.addEventListener('visibilitychange', () => { if (document.hidden) hideNow(); else backNow(); });
    window.addEventListener('pagehide', hideNow); document.addEventListener('freeze', hideNow);
    window.addEventListener('blur', () => { if (S.dev !== 'touch' && !document.hidden) audio.away(300, 0.05); });      // not on touch: phones fire blur for things that are not leaving
    window.addEventListener('focus', backNow); window.addEventListener('pageshow', backNow); }
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
    if (S.dev === 'touch') { try { if (localStorage.getItem('dh.thint') !== '1') { localStorage.setItem('dh.thint', '1'); applyLayout(); const h = $('tHint'); h.hidden = false; setTimeout(() => { h.hidden = true; }, 3000); } } catch {} }      // once: the two sticks and the cluster, named for three seconds
    // fullscreen is its own explicit action (pause card), never part of this gesture
    lockPointer(); S.invite = true; S.startedAt = performance.now(); S.clock0 = S.clock;
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch {}
    window.focus();
  }
  // the gatehouse start: the first move or look cuts from the feed to the guard at the monitor; the head comes up off the screen over GATE_LOOK s
  const GATE_LOOK = { hold: 0.7, tilt: 0.9 };
  function gateBegin() {
    const G = GATE, Y = S.you;
    if (post && post.setCCTV) { post.setCCTV(false); post.cctvInfo.live = false; }
    // the animal stays exactly where the feed last showed it (the guard's noises kept it round the hut: src/gatesplash.js); the monitor
    // carries on with the same camera
    if (feedDir) { Object.assign(feedDir.cam, director.cam); S.mon = null; }
    S.awareAt = S.clock + GATE_LOOK.hold + GATE_LOOK.tilt;      // it can sense you once you have looked up (setMode keeps this)
    setMode('foot');
    Y.x = Y.px = G.guard.x; Y.z = Y.pz = G.guard.z; Y.vx = Y.vz = 0; Y.eye = 1.7; Y.crouch = false; Y.up = null;
    Y.yaw = Math.atan2(-(G.window.x - G.guard.x), -(G.window.z - G.guard.z)); Y.pitch = 0.04; S.lens = 62;
    const sc = desk.screenAt(), ey = terrain.height(Y.x, Y.z) + Y.eye;
    S.gate = { t0: S.clock, down: Math.atan2(sc.y - ey, Math.hypot(sc.x - Y.x, sc.z - Y.z)) - Y.pitch, done: false };
  }
  /** The look-up: how far below your own pitch the eye still is (0 once done); at the end you are in the world for it to notice. */
  function gateTilt() {
    const g = S.gate; if (!g || g.done) return 0;
    const t = S.clock - g.t0, k = clamp((t - GATE_LOOK.hold) / GATE_LOOK.tilt, 0, 1), e = k * k * (3 - 2 * k);
    if (k >= 1) { g.done = true; arena.opening({ x: S.you.x, z: S.you.z }); }      // the chair scrapes and a step: it is curious, and comes to see
    return g.down * (1 - e);
  }
  function setPaused(p) {
    if (!S.started || p === S.paused || (p && S.dead)) return;
    S.paused = p; document.body.classList.toggle('paused', p); S.keys.clear(); drag = null; if (p) releaseTouch();
    if (p) { releasePointer(); try { if (audio.ctx && audio.ctx.state === 'running') audio.ctx.suspend(); } catch {} }
    else { audio.resume(); lockPointer(); }
    ui.paused(p);
    // the card takes the keyboard and the gamepad: Resume has the focus (Enter, Space or A resumes)
    try { if (p) $('pResume').focus({ preventScroll: true }); else if (document.activeElement && $('pause').contains(document.activeElement)) document.activeElement.blur(); } catch {}
  }
  document.addEventListener('pointerlockchange', () => {
    const on = locked(); document.body.classList.toggle('locked', on);
    if (on) { S.lock.fail = false; S.lock.ok++; document.body.classList.remove('hover'); }
    if (!on && S.clipLive && S.replay && !S.unlockOk) { S.noRelock = true; endReplay(); S.noRelock = false; setPaused(true); }      // closeout: Esc during a clip in play: the clip is dropped and the pause card comes up
    else if (!on && S.started && !S.paused && !S.unlockOk && !S.dead && !S.frozen && !S.clipLive) setPaused(true);      // Esc (or anything else) took the pointer away: pause
    S.unlockOk = false;
  });
  document.addEventListener('pointerlockerror', () => { S.unlockOk = false; lockRefused('pointerlockerror event'); });
  // diagnostic drawer line: lock state and the last error text, for the owner to report
  { const host = document.querySelector('#panel details'); const el = document.createElement('div'); el.className = 'row'; el.style.cssText = 'font-size:11px;opacity:.7;display:block';
    if (host) host.appendChild(el);
    const upd = () => { el.textContent = 'pointer lock: ' + (locked() ? 'locked' : 'unlocked') + ' · asks ' + S.lock.asks + ' ok ' + S.lock.ok + (canLock ? '' : ' · unsupported') + (S.lock.last ? ' · last: ' + S.lock.last : ''); };
    setInterval(upd, 400); upd(); }
  // the first move or look from observe mode steps you out from where the camera stands
  // (the gatehouse start: the first one is the cut from the feed to the guard at the monitor)
  const takeOver = () => { if (S.mode === 'observe' && S.started && !S.paused && !S.dead && !ui.flags.panel) { if (GATE && !S.gate) gateBegin(); else setMode('foot'); } };
  // no selecting, dragging or context menus over the game (the drawer's own controls still work)
  const formy = (t) => t && t.closest && t.closest('input, select, textarea');
  for (const ev of ['contextmenu', 'selectstart', 'dragstart']) document.addEventListener(ev, (e) => { if (!formy(e.target)) e.preventDefault(); });
  window.addEventListener('beforeunload', (e) => { if (S.started && S.mode === 'foot' && !TEST) { e.preventDefault(); e.returnValue = ''; } });
  // "start over" (pause card): the whole scenario from scratch, as a fresh page load gives it but without one: back to the gatehouse feed
  // and "click to begin", with a new animal, mind and memory, herd, people, things, doors, trample field, tape, tips and death card.
  // Settings, the sandbox drawer and the hash stay; the run count goes up on the next step out, as after a load (setMode). Every field
  // play adds to S is dropped (KEEP is S as boot left it). test/restart.py checks the result against a fresh load.
  function startOver() {
    gaitEnd(); if (crashRun) { crashRun = null; setMind(true); }
    releasePointer(); releaseTouch(); drag = null; touches.clear(); pinch = null; setCrouch(false); setMode('observe');
    SEED = pickSeed(); newScenario(); mind.ov = OV; if ($('temper').value) mind.setTemper($('temper').value); herd.disabled = !$('herdOn').checked;
    prev.v.set(sim.pose.v); prev.s.set(sim.pose.s);
    for (const k of Object.keys(S)) if (!KEEP.has(k)) delete S[k];
    Object.assign(S, freshS()); S.keys.clear(); Object.assign(S.zoom, { toggle: false, hold: false, padHold: false, cur: 1 }); $('tZoom').setAttribute('aria-pressed', 'false');
    kitReset(); kitTick(0); props.reset(); for (const b of document.querySelectorAll('[data-torch]')) b.setAttribute('aria-pressed', 'false');
    rec.reset(); clip.resetLine(); torchLive = false; micHeld = false; eatKey = null;
    fx.reset(); world.trampleField.clear(); terrain.resetDoors();
    if (desk) desk.noSignal(); gateWarm = 0; if (post && post.setCCTV) post.setCCTV(false);
    world.resetWeather(); audio.restart();
    ui.restart({ sim, mind, SEED }); tel.restart({ sim, mind, SEED });
    document.body.classList.remove('started', 'paused');
    try { document.activeElement.blur(); } catch {}
  }
  // look speed (the pause card's setting) and the lens: zoomed in, the same hand movement turns you less
  S.sens = (() => { try { const v = +localStorage.getItem('dh.sens'); return v > 0.1 && v < 5 ? v : 1; } catch { return 1; } })();
  S.zoom = { toggle: false, hold: false, padHold: false, cur: 1 };
  S.invert = (() => { try { return localStorage.getItem('dh.invert') === '1'; } catch { return false; } })();
  const look = (dx, dy, k = 0.0042) => { if (S.clipLive) return; const c = S.mode === 'foot' ? S.you : S.fly; k *= S.sens / S.zoom.cur; c.yaw -= dx * k; c.pitch = clamp(c.pitch - dy * k * (S.invert ? -1 : 1), -1.4, 1.4); };
  const ZOOM = 3;      // the one zoomed state: a fixed magnification over the lens, off or on
  document.addEventListener('mousemove', (e) => {
    if (!locked() || S.paused || S.clipLive) return;
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
    if (e.pointerType === 'touch' && stickDown(e)) return;
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
    if (e.pointerId === S.stick.id) { stickAt(e); return; } if (S.lk && e.pointerId === S.lk.id) { lookAt(e); return; }
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
    if (e.pointerType === 'touch' && S.touchLook === 'stick') return;      // the right stick looks; a drag elsewhere does not
    look(dx, dy);
  });
  stage.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') S.over = false; });
  const touchEnd = (e) => { touches.delete(e.pointerId); if (pinch && touches.size < 2) { pinch = touches.size ? 'after' : null; drag = null; } };
  stage.addEventListener('pointercancel', (e) => { if (stickEnd(e) || lookEnd(e)) return; touchEnd(e); drag = null; });
  stage.addEventListener('pointerup', (e) => {
    if (stickEnd(e) || lookEnd(e)) return;
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
  { const el = $('pTLook'); if (el) { el.value = S.touchLook; el.addEventListener('change', () => { S.touchLook = el.value === 'drag' ? 'drag' : 'stick'; document.body.dataset.tlook = S.touchLook; releaseTouch(); try { localStorage.setItem('dh.tlook', S.touchLook); } catch {} }); }
    const ar = $('pARun'); if (ar) { ar.checked = S.runLock; ar.addEventListener('change', () => { S.runLock = ar.checked; try { localStorage.setItem('dh.arun', S.runLock ? '1' : '0'); } catch {} }); } }
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
    else if (k === 'e' && S.mode === 'foot' && !e.repeat) act.interact();
    else if (k === ' ' && S.mode === 'foot' && !e.repeat) S.jumpReq = true;      // Space jumps (it was the contextual action; E still is)
    else if (k === 'q' && S.mode !== 'fly' && !e.repeat) act.callDown();
    else if (k === 'f' && !e.repeat) { act.torch(); ui.taught('torch'); }
    else if (k === 'c' && S.mode === 'foot' && !e.repeat) { setCrouch(!S.crouchToggle); ui.taught('crouch'); }
    else if (k === 'r' && !e.repeat) startLiveClip();      // closeout: record the last 15 s
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
  { const clipAway = () => { if (clip.active) { if (clip.tagged) endReplay(); else if (S.replay) stopReplay(); } };      // clip: a hidden tab stops the picture (and the recording is cancelled by endReplay / stopReplay)
    document.addEventListener('visibilitychange', () => { if (document.hidden) clipAway(); }); window.addEventListener('pagehide', clipAway); document.addEventListener('freeze', clipAway); }
  // touch: a thumbstick to walk (push it to the rim to run), drag anywhere else to look, tap to throw what is in hand
  // the device in use, live: the last of keyboard/mouse ('kb'), touch, gamepad ('pad'). Every hint and control list follows it.
  function setDev(d) {
    if (S.dev === d) return;
    S.dev = d; const b = document.body; b.dataset.dev = d; b.classList.toggle('touch', d === 'touch'); b.classList.toggle('pad', d === 'pad');
    if (padRef) padRef.on = d === 'pad';
    if (uiRef) uiRef.devChanged();
    try { applyLayout(); } catch {}
  }
  let padRef = null, uiRef = null;
  document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' || e.pointerType === 'pen') setDev('touch'); else if (e.pointerType === 'mouse') setDev('kb'); }, true);
  document.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && S.dev !== 'kb' && Math.abs(e.movementX) + Math.abs(e.movementY) > 2) setDev('kb'); }, true);
  S.stick = { x: 0, y: 0, id: null, run: false };      // run: the stick pushed to its rim (starts above 0.88, stops below 0.75)
  try { S.runLock = localStorage.getItem('dh.arun') === '1'; } catch { S.runLock = false; }      // "always run on touch" (pause card): any stick movement runs
  S.touchLook = (() => { try { return localStorage.getItem('dh.tlook') === 'drag' ? 'drag' : 'stick'; } catch { return 'stick'; } })();
  const stick = $('stick'), nub = $('nub'), lstick = $('lstick'), lnub = $('lnub');
  // the look stick's feel: deflection sets turn rate. sens: rad/s at the rim (before the look-speed setting); vert: vertical share; curve: exponent
  const TL = { sens: 3.4, vert: 0.6, curve: 3, dead: 0.08, smooth: 0.06 };      // tune: the touch look stick (turn rate at the rim, vertical share, response curve exponent, dead zone, smoothing time)
  { const G = 'Player'; tune(G, 'Touch look stick: turn rate at the rim (rad/s)', TL, 'sens', 0.5, 8, 0.1, null, 'touchLook.sens'); tune(G, 'Touch look stick: vertical share', TL, 'vert', 0.2, 1.2, 0.05, null, 'touchLook.vert'); tune(G, 'Touch look stick: response curve exponent', TL, 'curve', 1, 5, 0.1, null, 'touchLook.curve'); tune(G, 'Touch look stick: dead zone', TL, 'dead', 0, 0.3, 0.01, null, 'touchLook.dead'); tune(G, 'Touch look stick: smoothing (s)', TL, 'smooth', 0, 0.3, 0.01, null, 'touchLook.smooth'); }      // tune
  S.lk = null; document.body.dataset.tlook = S.touchLook;
  // the whole layout comes from touchLayout(): fixed sticks in the bottom corners, buttons on an arc round each. Re-applied on resize and rotation.
  let LAY = null;
  const probe = document.createElement('div'); probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'; document.body.appendChild(probe);
  const place = (el, x, y, w, h) => { const st = el.style; st.left = x + 'px'; st.top = y + 'px'; if (w != null) { st.width = w + 'px'; st.height = h + 'px'; } };
  const applyLayout = () => {
    const cs = getComputedStyle(probe), ins = { top: Math.max(10, parseFloat(cs.paddingTop) || 0), right: Math.max(10, parseFloat(cs.paddingRight) || 0), bottom: Math.max(10, parseFloat(cs.paddingBottom) || 0), left: Math.max(10, parseFloat(cs.paddingLeft) || 0) };
    // innerWidth/Height: the visible frame (the host's own bars are already outside it)
    const L = LAY = touchLayout(innerWidth, innerHeight, ins), root = document.documentElement.style;
    for (const [el, c] of [[stick, L.left], [lstick, L.right]]) { place(el, c.cx, c.cy, c.r * 2, c.r * 2); }
    for (const n of [nub, lnub]) { n.style.width = n.style.height = L.knob + 'px'; }
    for (const [id, c] of [['tJump', L.buttons.jump], ['tCrouch', L.buttons.crouch], ['tItem', L.buttons.flare], ['tTorch', L.buttons.torch], ['tCall', L.buttons.call]]) { place($(id), c.cx, c.cy, c.r * 2, c.r * 2); $(id).style.fontSize = Math.round(c.r * 0.46) + 'px'; }
    const P = L.pill; place($('tAct'), P.x, P.y, P.w, P.h);
    const H = L.hint, hs = $('hint').style; if (!document.body.classList.contains('touch')) hs.cssText = ''; else { hs.left = H.x + 'px'; hs.width = H.w + 'px'; hs.top = 'auto'; hs.bottom = (innerHeight - (H.y + H.h)) + 'px'; hs.maxWidth = 'none'; hs.transform = 'none'; hs.textAlign = 'center'; hs.fontSize = '12px'; hs.letterSpacing = '0.08em'; }
    { const M = L.mute, ms = $('muteIcon').style; if (!document.body.classList.contains('touch')) ms.cssText = ''; else { ms.left = (M.x + M.w / 2) + 'px'; ms.top = M.y + 'px'; ms.bottom = 'auto'; } }      // touch: centred above the hint line
    root.setProperty('--tbar', (L.topbar.y + L.topbar.h) + 'px');
    const h1 = $('tHint').querySelector('.h1'), h2 = $('tHint').querySelector('.h2'), h3 = $('tHint').querySelector('.h3'); place(h1, L.left.cx, L.left.cy); place(h2, L.right.cx, L.right.cy); place(h3, P.x, P.y - 4, P.w, null);
    if (S.lk) lookEnd(); if (S.stick.id != null) stickEnd();
  };
  window.addEventListener('resize', () => applyLayout()); window.addEventListener('orientationchange', () => setTimeout(applyLayout, 120)); if (window.visualViewport) window.visualViewport.addEventListener('resize', () => applyLayout());
  const ring = (el) => { el.classList.add('on'); };
  const stickAt = (e) => { const r = stick.getBoundingClientRect(), R = r.width / 2; let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } S.stick.x = x; S.stick.y = y; if (!S.stick.run && l > 0.88) { S.stick.run = true; ui.taught('run'); } else if (S.stick.run && l < 0.75) S.stick.run = false; stick.classList.toggle('run', S.stick.run || (S.runLock && l > 0.15)); const t = R - LAY.knob / 2; nub.style.transform = `translate(calc(-50% + ${x * t}px), calc(-50% + ${y * t}px))`; };
  const stickEnd = (e) => { if (e && e.pointerId !== S.stick.id) return false; S.stick.id = null; S.stick.x = S.stick.y = 0; S.stick.run = false; stick.classList.remove('run', 'on'); nub.style.transform = ''; return true; };
  const lookAt = (e) => { const L = S.lk; if (!L) return; const r = lstick.getBoundingClientRect(); let x = (e.clientX - r.left - L.R) / L.R, y = (e.clientY - r.top - L.R) / L.R; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } L.x = x; L.y = y; const t = L.R - LAY.knob / 2; lnub.style.transform = `translate(calc(-50% + ${x * t}px), calc(-50% + ${y * t}px))`; };
  const lookEnd = (e) => { if (!S.lk || (e && e.pointerId !== S.lk.id)) return false; S.lk = null; lstick.classList.remove('on'); lnub.style.transform = ''; return true; };
  const releaseTouch = () => { stickEnd(); lookEnd(); };
  /** A finger went down on the view. Inside the move stick's base (plus a 20 px halo): it drives the move stick; inside the look stick's: the look stick
   *  (unless "touch look" is drag). The bases never move. Buttons never get here: they sit above the stage. Returns true when the touch is taken. */
  const stickDown = (e) => {
    if (!S.started || S.paused || S.dead || S.frozen || S.replay || S.clipLive || !LAY) return false;
    const x = e.clientX, y = e.clientY, hit = (c) => Math.hypot(x - c.cx, y - c.cy) <= c.r + LAY.halo;
    if (hit(LAY.left)) { if (S.stick.id != null) return true; takeOver(); S.stick.id = e.pointerId; try { stage.setPointerCapture(e.pointerId); } catch {} ring(stick); stickAt(e); return true; }
    if (S.touchLook === 'stick' && hit(LAY.right)) { if (S.lk) return true; takeOver(); try { stage.setPointerCapture(e.pointerId); } catch {} S.lk = { id: e.pointerId, R: LAY.right.r, x: 0, y: 0, sx: 0, sy: 0 }; ring(lstick); lookAt(e); return true; }
    return false;
  };
  applyLayout();
  /** Per frame: the look stick turns you. Smoothed, dead zone, then a curve: fine near the centre, quick at the rim; pitch slower than yaw. */
  const lookStickTick = (dt) => {
    const L = S.lk; if (!L || S.clipLive || S.paused || S.mode === 'observe') return;
    const sm = TL.smooth > 0 ? 1 - Math.exp(-dt / TL.smooth) : 1; L.sx += (L.x - L.sx) * sm; L.sy += (L.y - L.sy) * sm;
    const m = Math.hypot(L.sx, L.sy); if (m <= TL.dead) return;
    const mm = Math.min(1, (m - TL.dead) / (1 - TL.dead)), g = 0.15 * mm + 0.85 * Math.pow(mm, TL.curve), vx = L.sx / m * g, vy = L.sy / m * g;
    look(vx * dt, vy * TL.vert * dt, TL.sens);
  };
  /** A button that acts on the touch going down (a click is dropped on some phones while another finger is held). */
  const press = (id, fn, up) => { const el = $(id); el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('down'); try { el.setPointerCapture(e.pointerId); } catch {} fn(e); }); const end = () => { el.classList.remove('down'); if (up) up(); }; el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); };
  press('tCrouch', () => { setCrouch(!S.crouchToggle); ui.taught('crouch'); });
  press('tItem', () => { audio.resume(); takeOver(); act.use(); });      // the flare button throws
  press('tCall', () => { audio.resume(); act.callDown(); }, () => act.callUp());      // tap: whistle; hold: shout
  press('tAct', () => { audio.resume(); act.interact(); });
  press('tJump', () => { audio.resume(); if (S.mode === 'foot') { if (!arena.victim('you').free) { arena.struggle('you', 1); ui.taught('struggle'); } else S.jumpReq = true; } });      // held by the animal: a jump press is a struggle press, as Space is
  $('tCall').addEventListener('pointerleave', () => act.callUp());
  // start, pause, fullscreen
  $('startGo').addEventListener('click', (e) => { e.stopPropagation(); start(false); });
  $('start').addEventListener('click', (e) => { if (!e.target.closest('label, button, input')) start(false); });
  if (!fsOk) for (const el of document.querySelectorAll('.fs-only')) el.hidden = true;
  $('pauseBtn').addEventListener('click', () => { audio.resume(); setPaused(!S.paused); });
  $('pResume').addEventListener('click', () => setPaused(false));
  { const b = $('pDebug'); if (b) b.addEventListener('click', () => { setPaused(false); setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '`' })), 60); }); }      // the sandbox drawer without a backtick key (phones; the claude.ai frame has no URL hash)
  $('pAgain').addEventListener('click', () => startOver());
  $('pFull').addEventListener('click', () => { audio.resume(); fullscreen(); });
  if (!KIT_START.torch) $('tTorch').hidden = true;
  press('tTorch', () => { act.torch(); ui.taught('torch'); });
  $('tZoom').addEventListener('click', () => ui.taught('zoom'));
  // closeout: save a clip of the last 15 s (key R, the touch button, the pause card)
  { const tc = $('tClip'), pc = $('pClip'); if (tc) { tc.hidden = !clip.supported; tc.addEventListener('click', () => { if (!startLiveClip()) ui.note('nothing to record yet'); }); }
    if (pc) { pc.hidden = !clip.supported; pc.addEventListener('click', () => { setPaused(false); setTimeout(() => { if (!startLiveClip()) ui.note('nothing to record yet'); }, 80); }); } }
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
    if (!on) { audio.on = false; try { audio._applyVol(); } catch {} }
    // the muted-speaker icon: shown whenever the game is on screen but silent (setting off, context waiting for a gesture, master still faded); a tap fixes it
    const mi = $('muteIcon'); let miOn = false;
    const silent = () => !audio.on || audio._away || (!S.paused && !(audio.ctx && audio.ctx.state === 'running'));
    // it stays clear of the start card (a portrait phone's card fills the bottom) and the death card: lifted to just above whichever is up
    const card = document.querySelector('#start .card'), deadCard = document.querySelector('#dead > *'), dodge = () => { if (!miOn) return; mi.style.translate = ''; const b = document.body.classList;
      const o = !b.contains('started') ? card : b.contains('dead') ? deadCard : null; if (!o) return;
      const c = o.getBoundingClientRect(), m = mi.getBoundingClientRect(); if (c.width && m.right > c.left - 8 && m.left < c.right + 8 && m.bottom > c.top - 8 && m.top < c.bottom + 8) mi.style.translate = '0 ' + Math.round(c.top - 8 - m.bottom) + 'px'; };
    const miTick = () => { const v = !document.hidden && !audio.offline && !$('boot') && silent(); if (v !== miOn) { miOn = v; mi.hidden = !v; } dodge(); };
    mi.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); if (!audio.on) setSound(true); else { audioResume(); audio._applyVol(); } audio.back(true); miTick(); });
    mi.addEventListener('pointerdown', (e) => e.stopPropagation());
    setInterval(miTick, 250); miTick(); }
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

  // ------------------------------------------------------------ gait demos (debug drawer; #gait=corner|hairpin|steer|rush|stop, add &ab for A/B)
  // The splaying situations (src/gaitdemo.js) as scripted body-only runs on open flat ground, the camera low and three-quarter front, 12 m from the turn.
  // The old gait (sim.gaitLegacy) is on only while a demo runs and only for the demo's animal: gaitTick sets the flag from the run every frame, so it is
  // off the moment a demo ends, is interrupted (pause, death, another mode) or the page does anything else; normal play never sees it.
  const GD = { legacy: false, slow: false, ab: false }, gmeter = new GaitMeter();
  let gaitRun = null, gaitLast = 'corner', gaitFlash = 0, gaitCam = null;
  const gaitSet = (id, on, text) => { const el = $(id); if (el) { el.setAttribute('aria-pressed', String(on)); el.textContent = text; } };
  const gaitDemo = (key, phase = 0) => {
    const D = GAIT_DEMOS[key] || GAIT_DEMOS[gaitLast]; if (!D) return; gaitLast = GAIT_DEMOS[key] ? key : gaitLast;
    const prev = gaitRun ? gaitRun.prev : { mode: S.mode, ts: S.timeScale };
    crashRun = null; ui.set && ui.set('panel', false);
    setMind(false); setMode('fly'); S.stalk = false; S.pace = 8; S.goal = null;
    const legacy = GD.ab ? phase === 0 : GD.legacy; sim.gaitLegacy = legacy;
    sim.reset(D.start[0], D.start[1], D.start[2]);
    gaitRun = { key, D, phase, legacy, st: {}, t0: sim.t, prev }; gmeter.reset(); gaitFlash = 0; gaitCam = null;
    S.timeScale = GD.slow ? 0.5 : prev.ts; $('speed').value = String(S.timeScale);
    const cap = $('gaitCap'); cap.textContent = legacy ? 'OLD GAIT' : 'CURRENT GAIT'; cap.classList.toggle('old', legacy); cap.hidden = false; $('gaitHud').hidden = false;
  };
  const gaitEnd = () => {
    const R = gaitRun; gaitRun = null; sim.gaitLegacy = false; $('gaitCap').hidden = true; $('gaitHud').hidden = true;
    if (!R) return;
    S.goal = null; setMind(true); S.timeScale = R.prev.ts; $('speed').value = String(S.timeScale); if (R.prev.mode !== 'fly') setMode(R.prev.mode);
  };
  const gaitTick = (dtReal) => {
    if (!gaitRun) { if (sim.gaitLegacy) sim.gaitLegacy = false; return; }
    const R = gaitRun, t = sim.t - R.t0;
    if (S.dead || S.paused || S.mode !== 'fly') { gaitEnd(); return; }
    if (t > R.D.dur) { if (GD.ab && R.phase === 0) gaitDemo(R.key, 1); else gaitEnd(); return; }
    sim.gaitLegacy = R.legacy;
    // camera: P is the first turn; it stands at P + off (low, ahead and to the outside) and follows a share of the animal's way slowly; the aim follows the hips a little faster
    const C = GAIT_CAM, [ax, az] = R.D.at, k = 1 - Math.exp(-dtReal / C.tau), ka = 1 - Math.exp(-dtReal / C.aimTau), f = S.fly;
    const dx = ax + C.off[0] + C.follow * (sim.x - ax), dz = az + C.off[2] + C.follow * (sim.z - az), dy = terrain.height(dx, dz) + C.off[1];
    if (!gaitCam) { gaitCam = { x: dx, y: dy, z: dz, ax: sim.x, ay: sim.py.x, az: sim.z }; }
    gaitCam.x += (dx - gaitCam.x) * k; gaitCam.y += (dy - gaitCam.y) * k; gaitCam.z += (dz - gaitCam.z) * k;
    gaitCam.ax += (sim.x - gaitCam.ax) * ka; gaitCam.ay += (sim.py.x - gaitCam.ay) * ka; gaitCam.az += (sim.z - gaitCam.az) * ka;
    f.x = gaitCam.x; f.y = gaitCam.y; f.z = gaitCam.z; f.yaw = Math.atan2(-(gaitCam.ax - f.x), -(gaitCam.az - f.z)); f.pitch = Math.atan2(gaitCam.ay - f.y, Math.hypot(gaitCam.ax - f.x, gaitCam.az - f.z));
    const m = gmeter, now = performance.now(); if (m.bad) gaitFlash = now + 700;
    $('ghHip').textContent = m.hip.toFixed(2) + ' m'; $('ghSt').textContent = m.stance.toFixed(2) + ' m'; $('ghEp').textContent = String(m.episodes); $('ghSplay').classList.toggle('on', now < gaitFlash);
  };
  for (const [id, k] of [['gdCorner', 'corner'], ['gdHairpin', 'hairpin'], ['gdSteer', 'steer'], ['gdRush', 'rush'], ['gdStop', 'stop'], ['gdAgain', null]]) { const el = $(id); if (el) el.addEventListener('click', () => { audio.resume(); gaitDemo(k || gaitLast); }); }
  { const g = $('gdGait'); if (g) g.addEventListener('click', () => { GD.legacy = !GD.legacy; gaitSet('gdGait', GD.legacy, 'gait: ' + (GD.legacy ? 'old' : 'current')); }); }
  { const g = $('gdSlow'); if (g) g.addEventListener('click', () => { GD.slow = !GD.slow; gaitSet('gdSlow', GD.slow, 'slow motion ½×: ' + (GD.slow ? 'on' : 'off')); if (gaitRun) { S.timeScale = GD.slow ? 0.5 : gaitRun.prev.ts; $('speed').value = String(S.timeScale); } }); }
  { const g = $('gdAB'); if (g) g.addEventListener('change', () => { GD.ab = g.checked; }); }
  { const m = location.hash.match(/gait=(corner|hairpin|steer|rush|stop)/); if (m) { GD.ab = /[&#]ab\b/.test(location.hash); const wait = setInterval(() => { if (S.started && !S.paused) { clearInterval(wait); setTimeout(() => gaitDemo(m[1]), 3000); } }, 250); } }

  function directedIntent() {
    const K = S.keys, up = K.has('arrowup'), dn = K.has('arrowdown'), lf = K.has('arrowleft'), rt = K.has('arrowright');
    if (gaitRun) return gaitRun.D.intent(sim.t - gaitRun.t0, sim, gaitRun.st);      // a gait demo's script
    let goal = S.goal;
    if (up || dn || lf || rt) { S.goal = null; goal = { kind: 'drive', throttle: up ? 1 : dn ? -0.3 : 0, steer: (lf ? 1 : 0) - (rt ? 1 : 0) }; }
    return { goal, pace: S.pace, attention: S.mode === 'fly' || crashRun ? null : camera.position,      /* in a crash test it is not to know of you: it was watching you all the way in (owner 2026-11-15) */ faceAttention: true, curious: true, stalk: S.stalk };
  }

  // ------------------------------------------------------------ you, as a body in the world
  function solidify(p, r = 0.4, lift = 0) {
    // you cannot stand inside rock or inside the animal; if it walks into you, you are pushed
    { const g = terrain.height(p.x, p.z); terrain.pushOut(p, r, g + lift, g + 1.8 + lift, 3); }      // the same solid shapes you see: rocks, trunks, cycads, walls
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
    if (clip.panelOpen()) { clip.panelPad(down(0), down(1)); pad.prev = bt; return; }      // closeout: the clip-ready panel
    if (S.replay && !S.replayHold) { if (!recLocked() && bt.some((b, i) => b && !pad.prev[i])) stopReplay(); pad.prev = bt; return; }      // death cam: any button skips
    if (!S.started) { if (down(9)) start(false); else padMenu($('start'), down); pad.prev = bt; return; }   // Start: begin; A: the focused control (start, unless moved)
    if (down(9) && !S.dead) setPaused(!S.paused);                                                      // Start/Menu: pause
    if (S.paused) { if (down(1)) setPaused(false); else padMenu($('pause'), down); pad.prev = bt; return; }   // B: resume; d-pad and A work the card
    if (S.dead) { if (document.body.classList.contains('dead')) { if (down(2) && !$('xReplay').hidden) $('xReplay').click(); else if (down(3) && !$('xClip').hidden) $('xClip').click(); else padMenu($('dead'), down); } pad.prev = bt; return; }      // (closeout: X watch again, Y save clip)
    if (S.mode === 'observe' && (Math.hypot(pad.lx, pad.ly, pad.rx, pad.ry) > 0.3)) takeOver();          // a stick: step in
    if (!!bt[8] !== !!pad.prev[8]) ui.peek(!!bt[8]);                                                     // View/Back held: peek at the controls
    if (S.mode !== 'observe') {
      if (down(7)) act.use();                                             // RT: use what is in hand
      if (down(5)) act.cycle(1); if (down(4)) act.cycle(-1);             // RB / LB: what is in hand
    }
    if (S.mode !== 'fly') { if (down(2)) act.callDown(); if (!bt[2] && pad.prev[2]) act.callUp(); }   // X: tap whistle, hold shout
    if (S.mode === 'foot') {
      if (down(0)) S.jumpReq = true;                                        // A: jump
      if (down(12)) act.interact();                                       // D-pad up: the contextual action (was A)
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
    const K = S.keys; lookStickTick(dt);
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
      if (!V.free) for (const v of [S.stick.id != null && S.stick, S.lk]) if (v) { const m = Math.hypot(v.x, v.y); if (m > 0.7) { const ux = v.x / m, uy = v.y / m, f = v.flick; if (!f) v.flick = { x: ux, y: uy }; else if (ux * f.x + uy * f.y < -0.3) { v.flick = { x: ux, y: uy }; arena.struggle('you', 1); ui.taught('struggle'); } } }      // waggle a stick: each rim-to-rim flick is one press
      if (held && !V.free) arena.struggle('you', Math.min(0.5, dt * 2.5));      // a held key counts for a little; mashing counts for much more
      Y.x = Y.px = V.x; Y.z = Y.pz = V.z; Y.vx = Y.vz = 0; Y.push.x = Y.push.z = 0; Y.crouch = false; Y.up = null; JMP.reset(Y.J); Y.dip = 0; S.jumpReq = false;
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
      const Y = S.you, sl = Math.hypot(S.stick.x, S.stick.y), sprint = K.has('shift') || S.stick.run || (S.runLock && sl > 0.15) || pad.sprint; Y.crouch = !!S.crouchToggle;
      const AR = S.mindOn;      // with its own mind on, the arrow keys walk you too (with it directed they steer the animal)
      let f = (K.has('w') || (AR && K.has('arrowup')) ? 1 : 0) - (K.has('s') || (AR && K.has('arrowdown')) ? 1 : 0), r = (K.has('d') || (AR && K.has('arrowright')) ? 1 : 0) - (K.has('a') || (AR && K.has('arrowleft')) ? 1 : 0);
      if (sl > 0.15) { f = -S.stick.y; r = S.stick.x; }
      if (pad.on && Math.hypot(pad.lx, pad.ly) > 0) { f = -pad.ly; r = pad.lx; }
      // the ground under you: wading and mud hold you back (terrain.speedFactor); off the tower, a face steeper than a person
      // can scramble up (PERSON_SLOPE) turns an uphill step aside, axis by axis, so you slide along the foot of it
      const ground = Y.up || !terrain.speedFactor ? 1 : terrain.speedFactor(Y.x, Y.z, 'person');
      const mag = Math.min(1, Math.hypot(f, r)), sp = (Y.crouch ? PLY.crouch : sprint && V.canSprint ? PLY.run : PLY.walk) * mag * (V.slow || 1) * ground, sy = Math.sin(Y.yaw), cy = Math.cos(Y.yaw), n = Math.hypot(f, r) || 1;
      Y.px = Y.x; Y.pz = Y.z;
      // jump (src/jump.js): only from the ground, on your feet, standing (not crouched, not on the tower, not wading); the run is carried
      const J = Y.J, ix = (-sy * f + cy * r) / n * sp, iz = (-cy * f - sy * r) / n * sp;
      if (S.jumpReq) { S.jumpReq = false; if (JMP.takeoff(J, Y.vx, Y.vz, !Y.crouch && !Y.up && ground >= JMP.GROUND_MIN && !S.dead)) ui.taught('jump'); }
      if (J.air) JMP.steer(J, ix, iz, dt);
      Y.x += ((J.air ? J.vx : ix) + Y.push.x) * dt; Y.z += ((J.air ? J.vz : iz) + Y.push.z) * dt;
      if (!Y.up && terrain.slopeAt) {
        const h0 = terrain.height(Y.px, Y.pz), steep = (x, z) => { const d = Math.hypot(x - Y.px, z - Y.pz), dh = terrain.height(x, z) - h0; return d > 1e-5 && ((dh / d > PERSON_SLOPE && terrain.slopeAt(x, z) > PERSON_SLOPE) || dh < -PERSON_DROP); };      // nor step off a drop deeper than PERSON_DROP (the bluff, the ledge, the hole over the cave)
        if (steep(Y.x, Y.z)) { if (!steep(Y.x, Y.pz)) Y.z = Y.pz; else if (!steep(Y.px, Y.z)) Y.x = Y.px; else { Y.x = Y.px; Y.z = Y.pz; } }
      }
      Y.push.x *= Math.exp(-dt * 4); Y.push.z *= Math.exp(-dt * 4);
      if (Y.up) { const T = Y.up, dx = Y.x - T.cx, dz = Y.z - T.cz, c = Math.cos(T.yaw), s2 = Math.sin(T.yaw); let lx = dx * c - dz * s2, lz = dx * s2 + dz * c; lx = clamp(lx, -T.hw + 0.4, T.hw - 0.4); lz = clamp(lz, -T.hd + 0.4, T.hd - 0.4); Y.x = T.cx + lx * c + lz * s2; Y.z = T.cz - lx * s2 + lz * c; }
      else if (solidify(Y, 0.4, Math.min(J.h, JMP.CLEAR_MAX)) > 0.05) fx.kick(0.04);      // feet this high clear a log or rubble under half a metre, nothing taller
      Y.vx = (Y.x - Y.px) / dt; Y.vz = (Y.z - Y.pz) / dt;
      Y.eye += ((Y.crouch ? PLY.eyeCrouch : PLY.eyeStand) - Y.eye) * Math.min(1, dt * 8);
      { const L = JMP.stepJump(J, dt); Y.dip *= Math.exp(-dt * 7);
        if (L) {      // landing: the knees give, and it is heard like a heavy step (the same 'step' noise path, a little louder than a run)
          const surf = terrain.surfaceAt ? terrain.surfaceAt(Y.x, Y.z) : 'grass', hard = surf === 'gravel' || surf === 'rock' ? 1.5 : 1, run = Math.hypot(Y.vx, Y.vz) > 4;
          Y.dip = 0.10 + 0.05 * clamp(L.speed / 3.7, 0, 1); fx.kick(0.05);
          S.noises.push({ x: Y.x, y: terrain.height(Y.x, Y.z), z: Y.z, loud: (run ? 0.3 : 0.2) * hard, kind: 'step', you: true }); audio.step(run ? 0.3 : 0.22, surf); } }
      // footsteps: walking is quiet, running carries
      const v = Math.hypot(Y.vx, Y.vz);
      // (what the ground is changes the step: gravel and rock click, water splashes; the splash the animal hears is the arena's)
      if (v > 0.5 && !J.air) { Y.stepT -= dt * v; if (Y.stepT <= 0) { Y.stepT = 1.5; const surf = Y.up ? 'wood' : terrain.surfaceAt ? terrain.surfaceAt(Y.x, Y.z) : 'grass', hard = surf === 'gravel' || surf === 'rock' ? 1.5 : 1; const loud = Y.crouch ? 0 : (v > 4 ? 0.16 : 0.045) * hard; if (loud) S.noises.push({ x: Y.x, y: terrain.height(Y.x, Y.z), z: Y.z, loud, kind: 'step', you: true }); audio.step(Y.crouch ? 0.03 : v > 4 ? 0.2 : 0.08, surf); } }
      const bob = v > 0.5 && !J.air ? Math.sin(sim.t * (v > 4 ? 13 : 8)) * (v > 4 ? 0.05 : 0.025) : 0;
      // pushing through fern is noisy, and leaves a trail of bent fronds
      if (v > 0.4 && !Y.up && !J.air) { Y.rustleT -= dt; if (Y.rustleT <= 0) { Y.rustleT = 0.35; const f = world.trample(Y.x, Y.z, 0.7, 0.55); if (f > 0.2) { audio.rustle(Y.crouch ? 0.05 : v > 4 ? 0.3 : 0.14); S.noises.push({ x: Y.x, y: terrain.height(Y.x, Y.z), z: Y.z, loud: Y.crouch ? 0.02 : v > 4 ? 0.14 : 0.06, kind: 'rustle', you: true }); } } }
      camera.position.set(Y.x, (Y.up ? Y.up.base + Y.up.h : terrain.height(Y.x, Y.z)) + Y.eye + bob + J.h - Y.dip, Y.z);
      camera.rotation.set(clamp(Y.pitch + gateTilt(), -1.5, 1.5), Y.yaw, 0);
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
    return [{ id: 'you', x: Y.x, y: (Y.up ? Y.up.base + Y.up.h : terrain.height(Y.x, Y.z)) + Y.eye + Y.J.h, z: Y.z, vx: Y.vx, vz: Y.vz, speed: sp, crouch: Y.crouch, fx: -Math.sin(Y.yaw), fz: -Math.cos(Y.yaw), torch: props.torchOn, lx: f.x, ly: f.y, lz: f.z }];
  }

  function birds(x, z, loud) { const n = props.flush(x, z, loud); if (n) { S.noises.push(n); audio.flurry(Math.hypot(n.x - camera.position.x, n.z - camera.position.z)); } }

  // The gatehouse monitor after the cut (owner: "it would be so slick if it was live (whilst you're close only, to save resources)"): the feed's
  // camera keeps following the animal (feedDir, the splash's own pan-follow) and is drawn into a small target at FEED_HZ, only while you are
  // within FEED_NEAR m and the screen is in view. Walk off and it shows NO SIGNAL; on the low level it stays live FEED_LOW s after the cut, then
  // NO SIGNAL for good.
  const FEED_NEAR = 4, FEED_HZ = 12, FEED_LOW = 4, frus = new THREE.Frustum(), frusM = new THREE.Matrix4();
  function monitorTick(dt) {
    const M = S.mon || (S.mon = { acc: 1, t: 0, off: false }); M.t += dt; M.acc += dt;
    if (S.replay || S.clipLive) return;
    const sc = desk.screenAt(), near = camera.position.distanceTo(sc) < FEED_NEAR, lowOver = Q.tier === 'low' && M.t > FEED_LOW;
    if (!near || lowOver || S.mode !== 'foot') { if (!M.off) { M.off = true; desk.noSignal((feedDir.cam.mount && feedDir.cam.mount.cam) || 1); } return; }
    camera.updateMatrixWorld(); frus.setFromProjectionMatrix(frusM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    if (!frus.containsPoint(sc)) return;      // close but looking away: nothing drawn, the screen keeps what it had
    if (M.acc < 1 / FEED_HZ) return;
    feedDir.update(Math.min(M.acc, 1), sim, mind, desk.feedCam); feedDir.noises.length = 0; feedDir.drop = null; M.acc = 0;
    desk.live(renderer, scene); M.off = false;
  }

  // ------------------------------------------------------------ frame
  function frame(dtReal) {
    dtReal = Number.isFinite(dtReal) && dtReal > 0 ? dtReal : 0;      // never a negative or NaN step (see the loop below)
    qc.begin();
    readPad(); act.callTick(); crashTick(); gaitTick(dtReal);
    const run = S.paused || S.frozen || S.clipLive ? 0 : 1, dts = dtReal * S.timeScale * run, dtv = dtReal * Math.min(S.timeScale, 1) * run;      // paused: the world holds still
    S.wind.a += (wr() - 0.5) * dts * 0.02; S.wind.s = 2.5 + 1.5 * Math.sin(sim.t * 0.05);
    const wind = { x: Math.sin(S.wind.a) * S.wind.s, z: Math.cos(S.wind.a) * S.wind.s };
    world.setWind(wind); fx.wind = wind; props.wind = wind;      // the world shows the wind the animal smells by

    S.acc += dts; S.clock += dts;
    let n = 0;
    const ag = agents();
    if (fidget && !S.gate && S.acc >= DT) { const q = fidget.tick(sim.t, sim); if (q) S.noises.push(q); }      // the gatehouse splash: the guard inside is not quite still
    while (S.acc >= DT && n < 12) {
      S.acc -= DT; n++;
      prev.v.set(sim.pose.v); prev.s.set(sim.pose.s);
      if (S.mode === 'observe') { S.noises.push(...director.noises); director.noises.length = 0; }
      if (!aware() && S.noises.length) S.noises = S.noises.filter((q) => !q.you);
      for (const q of S.noises) if (q.you && clip) clip.note(q.kind);      // closeout: whistles and shouts, for the closing card
      for (const q of S.noises) if (q.you && ui.achv) ui.achv.noise(q, { x: q.x, y: q.y, z: q.z });      // dares: a shout right in its face
      arena.step(DT, { agents: ag, noises: S.noises, light: world.light, flash: world.flash, wind }, S.mindOn ? null : directedIntent());
      if (gaitRun) gmeter.tick(sim, sim.t - gaitRun.t0);
      S.noises.length = 0;
      S.legT = (S.legT || 0) - DT;
      if (S.legT <= 0 && !S.replay) { S.legT = 0.15; for (const f of sim.feet) if (!f.planted) world.trample(f.pos.x, f.pos.z, 0.9, 0.6); for (const p of herd.alive) if (p.v > 2) world.trample(p.x, p.z, 0.5, 0.4);
        world.wake('rex', sim.x, sim.z, 1.5); if (S.mode === 'foot' && !S.you.up) world.wake('you', S.you.x, S.you.z, 0.5); }      // plants and ground fog part round the body and lie in its wake (not from the live animal while the replay shows another moment)
      for (const e of arena.events) {
        if (S.mode === 'foot' && S.started) rec.event(e);      // the tape keeps the sound events, to play them back from the camera
        if (S.replay) continue;      // the replay plays the recorded ones (hear), not these
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
        else if (e.type === 'contact') { if (audio.contact) audio.contact(e, dist); { const tr = e.part === 'torso' || e.part === 'hips', hf = (e.force || 0) + (tr ? 2.5 : 0); if (hf > 1.2 && dist < 36) fx.kick(Math.min(0.65, 0.075 * hf) * (1 - dist / 36)); if (hf > 2.5 && fx.burst) fx.burst(e.x, e.y || 0, e.z, e.nx || 0, e.nz || 0, clamp((hf - 2.5) / 6, 0.15, 1)); }      /* (owner 2026-11-15: shake and dust "okay but perhaps a little weak": kick 0.045 -> 0.075 per m/s, felt to 36 m; a burst thrown off the surface in place of footfall puffs) */ }
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
    // the tape: the pose as drawn, with the player's body and the head (while the death cam plays, the tape is shown instead)
    if (S.replay && !S.dead && !S.clipLive) endReplay();
    {      // (keeps appending the tail after the death while the replay already plays)
      if (S.mode === 'foot' && S.started) {
        rec.tick(dts, S.dead, blend, rec.body(S.you, arena.victim('you'), sim, terrain, S.replay ? torchLive : props.torchOn), things.list);
      } else if (!S.dead) rec.reset();
    }
    let shown = blend;
    if (!S.replay) clip.tick(dtReal); else if (clip.active) clip.pause(!!S.frozen);
    if (S.replay) {
      if (S.replayHold) { shown = rec.pose; rpx.head.pos.copy(rec.head); props.torchOn = rec.torchOn; const I = post.cctvInfo; I.cam = rec.camNo; I.label = rec.label; I.stamp = rec.stampMs; I.clock = performance.now() / 1000; I.paused = true; post.cctvU.burst.value = 0; }      // closeout: the death menu over the last frame of the footage
      else if (!clip.closing() && rec.update(S.frozen ? 0 : dtReal, camera)) {      // closeout: once the tape has ended a recording goes on into the closing card
        shown = rec.pose; rpx.head.pos.copy(rec.head); props.torchOn = rec.torchOn;
        for (const e of rec.fired) hear(e);
        if (!!S.frozen !== micHeld) { micHeld = !!S.frozen; if (audio.mic) audio.mic(true, micHeld); }      // paused: the sound is held (muted); T resumes it
        const I = post.cctvInfo; I.cam = rec.camNo; I.label = rec.label; I.stamp = rec.stampMs; I.clock = performance.now() / 1000; I.paused = !!S.frozen; post.cctvU.burst.value = S.frozen ? 0 : rec.burst;
      } else if (clip.card(S.frozen ? 0 : dtReal)) { shown = rec.pose; }      // closeout: the closing card, at the end of every replay
      else stopReplay(true);
    }
    { const ja = sim.act; body.voiceJaw = audio.mouthOpen;      /* (in the replay too: the taped sounds are re-emitted through the mouth bus) */ body.voiceFast = audio.mouthFast; body.jawHold = !!(sim.mouthHold > 0 || (ja && ja.forced && /^(strike|seize|snap|butt)$/.test(ja.kind))); }      // jaw-from-voice
    body.glareEye = mind.dazzle || null; body.update(shown); fx.breath(body.nostril, body.snout, shown.s[1], dtv); if (audio.breathCue) { fx.snort(body.nostril, body.snout, audio.breathCue); audio.breathCue = 0; }

    if (S.mode === 'observe') {
      director.update(dtReal * run, sim, mind, camera); solidify(director.cam, 0.5); S.lens = director.cam.fov;
      if (GATE && post && post.cctv) {      // the live gatehouse feed's lettering, and a burst of static when it switches camera
        const I = post.cctvInfo, m = director.cam.mount; if (m && m.cam !== I.cam) post.cctvU.burst.value = 1;
        if (m) { I.cam = m.cam; I.label = m.label; } I.stamp = Date.now(); I.clock = performance.now() / 1000; I.paused = false; I.live = true;
        post.cctvU.burst.value = Math.max(0, post.cctvU.burst.value - dtReal * 2.5);
      }
      if (GATE && !S.gate) { director.noises.length = 0; director.drop = null; }      // the feed: no stones, meat or flares to draw it off the hut
      const D = director.drop; director.drop = null;
      if (D) {
        // meat goes upwind, so the scent comes to it; a flare goes where it can see it
        const w = Math.atan2(S.wind.a ? Math.sin(S.wind.a) : 0, Math.cos(S.wind.a)), up = D.kind === 'meat' ? S.wind.a + Math.PI + (Math.random() - 0.5) * 0.6 : sim.psi + (Math.random() - 0.5) * 1.2;
        let x = sim.x + Math.sin(up) * D.d, z = sim.z + Math.cos(up) * D.d; const r = Math.hypot(x, z), lim = terrain.arena - 8; if (r > lim) { x *= lim / r; z *= lim / r; }
        if (!(D.kind === 'meat' && things.list.some((o) => o.kind === 'meat'))) things.place(D.kind, x, z);
        void w;
      }
    }
    else if (!S.paused && !S.frozen && !S.replay) moveCamera(dtReal);
    if (!S.replay) lens(dtReal); if (!S.paused && !S.frozen) kitTick(dts);
    fx.update(dtv, camera);
    world.followLight(sim.x, sim.groundY, sim.z);
    if (world.update(dtv, camera, renderer)) {
      const delay = 0.6 + Math.random() * 2.2, a = Math.random() * 6.283; audio.thunder(delay);
      S.thunderAt = { t: performance.now() + delay * 1000, x: sim.x + Math.sin(a) * 900, z: sim.z + Math.cos(a) * 900 };
    }
    if (S.thunderAt && performance.now() > S.thunderAt.t) { S.noises.push({ x: S.thunderAt.x, y: 300, z: S.thunderAt.z, loud: 1, kind: 'thunder' }); S.thunderAt = null; }
    { const TL = S.replay ? rec.things : things, EC = S.replay ? rec.eye : camera;      // the recorded things and the player's own torch position while the replay plays
      props.update(dtv, TL, herd, EC, performance.now() / 1000);
      let h = 0; for (const o of TL.list) if (o.kind === 'flare' && o.burn > 0) h = Math.max(h, 0.25 / (1 + camera.position.distanceTo(new THREE.Vector3(o.x, o.y, o.z)) * 0.25)); audio.hiss(h); }
    ov.update(sim, blend, S.mindOn ? (mind.intent.goal && mind.intent.goal.kind === 'reach' ? mind.intent.goal : null) : S.goal, null, 9);
    ov.updateSenses(sim, mind);
    audio.breath(shown.s[1], camera.position.distanceTo(S.replay ? rpx.head.pos : sim.head.pos));
    if (!S.noRender && !swapping) { if (desk && S.gate) monitorTick(dtReal); try { draw(); } catch (err) { if (backend === 'WebGPU') fallBack(); else throw err; } tel.afterDraw(); if (clip.active || clip.closing()) clip.frame(); if (desk && !S.gate && post && !post.cctv && ++gateWarm === 3 && post.setCCTV) post.setCCTV(true); }      // the monitor before the frame that shows it; clip: copy the picture right after the render

    S.fps += (1 / Math.max(dtReal, 1e-3) - S.fps) * 0.05;
    // hold the frame rate: resolution (fast) and the quality level (slow), from measured frame times (src/view/quality.js)
    if (!TEST && !S.noRender) qc.end(dtReal);
    ui.frame(dtReal * run, dtReal);
    tel.frame(dtReal);
  }

  const ui = createUI({ S, sim, mind, camera, canvas, arena, terrain, act, Q, audio, SEED, test: TEST, backend: () => backend, pad, post, props,
    session: { replay: startReplay, clip: startClip, liveClip: startLiveClip, clipOK: () => clip.supported, canReplay: () => rec.length > 1 && rec.death >= 0, start, setPaused, releasePointer, lockPointer, setMode, takeOver, fullscreen, fsOk, locked } });
  uiRef = ui;
  // the note box (src/telemetry.js): freeze time where it stands, without the pause card, and come back from it. Freezing lets the
  // pointer go (so the box can be clicked) without pausing; unfreezing asks for it again from the same key press or click that
  // sent the note; if the pointer was in use and is refused, the pause card comes up instead.
  function freeze(on) {
    if (on) {
      if (!S.started || S.paused || S.frozen || (S.dead && !S.replay && !document.body.classList.contains('dead'))) return false;      // (allowed in the death cam and on the card)
      S.frozen = true; S.keys.clear(); drag = null; S.call = null; S.zoom.hold = false; releaseTouch();
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
  if (!/notel/.test(location.hash)) tel = createTelemetry({ replayInfo: () => (S.replay ? rec.info() : null), S, sim, mind, arena, act, audio, camera, canvas, Q, ui, props, post, renderer, SEED, backend: () => backend, freeze });
  window.__tel = tel;

  qualityMenu(qc);
  watchBody(renderer, body);      // self-check a few frames in: is the skin visible and drawing? (window.__bodyCheck, #perf)
  document.body.dataset.mode = 'observe'; document.body.dataset.mind = 'on'; document.body.classList.toggle('gatestart', !!GATE); S.gateStart = !!GATE;
  const KEEP = new Set(Object.keys(S));      // settings and session fields: what startOver leaves in S
  await bootAt(0.9);      // the rest is the first picture (its shaders): the loading screen goes once it is drawn
  let unboot = () => { $('boot').remove(); unboot = () => {}; };
  if (TEST) {
    window.__dino = {
      ui, start, setPaused, takeOver, renderer, scene, get sim() { return sim; }, get mind() { return mind; }, S, get director() { return director; }, camera, setMode, setMind, reachTo, fx, ov, body, act, world, applyMood, arena, props, qc, post, Q, get backendNow() { return backend; },
      advance(sec, fdt = 1 / 30) { S.noRender = true; for (let t = 0; t < sec - fdt - 1e-9; t += fdt) frame(fdt); S.noRender = false; frame(fdt); },
      look(px, py, pz, tx, ty, tz) { camera.position.set(px, py, pz); camera.lookAt(tx, ty, tz); body.update(sim.pose); world.followLight(sim.x, sim.groundY, sim.z); world.update(0, camera, renderer); draw(); },
    };
    window.__dino.backend = backend;
    if (!/start/.test(location.hash)) start(false);      // tests begin past the start card unless they ask to see it
    frame(1 / 30); unboot();
  } else {
    window.__rex = { clip, audio /* jaw-from-voice */, get seed() { return SEED; }, get sim() { return sim; }, rec, setMode, desk, get director() { return director; }, get feedDir() { return feedDir; }, get kit() { return S.kit; }, get items() { return S.items; }, S, arena, props, ui, ov, renderer, scene, camera, body, Q, qc, post, world, get backend() { return backend; }, recheck: () => watchBody(renderer, body, { frames: 10, secs: 0.5 }) };      // console/diagnostics handle (the body self-check reads it)
    // the downloads in, then pictures with nothing culled or hidden and in both looks before the loading screen goes, so every
    // shader, texture and buffer is ready (else the first fast turn built them a few at a time: lag until you had looked everywhere)
    let got = 0; await Promise.all(world.loading.map((p) => p.then(() => bootAt(0.9 + 0.06 * ++got / world.loading.length))));
    await audio.tapeIn;      // the cassette clunk a saved clip starts with
    const culled = []; scene.traverse((o) => { if (o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
    frame(1 / 30);
    const hidden = []; scene.traverse((o) => { if (!o.visible && !o.isLight && (!o.geometry || o.geometry.attributes.position)) { o.visible = true; hidden.push(o); } });
    await new Promise((ok) => requestAnimationFrame(ok)); draw();      // (the scene pass draws once per animation frame)
    for (const o of hidden) o.visible = false;
    if (post && !post.cctv) { post.setCCTV(true); draw(); post.setCCTV(false); }
    for (const o of culled) o.frustumCulled = true;
    await bootAt(0.97);
    let last = performance.now();
    // a rAF timestamp is when the frame began, which can be earlier than the performance.now() taken above (by seconds after a
    // long boot on a slow device): never hand the simulation a negative step (it ran the director's easing backwards, so its
    // look point and lens blew up before the start card was dismissed, and the takeover inherited a ground-facing, whited-out view)
    const loop = (now) => { const dt = clamp((now - last) / 1000, 0, 0.1); last = Math.max(last, now); frame(dt); unboot(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
}

boot().catch((err) => {
  console.error(err);
  const b = $('boot'); if (b) b.textContent = 'This browser could not start the 3D renderer (' + (err && err.message ? err.message : err) + '). Try a current Chrome, Edge, Firefox or Safari.';
});
