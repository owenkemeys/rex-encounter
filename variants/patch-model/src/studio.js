// Studio: the real skinned animal (real skin material, real sim pose) on a plain matte floor under neutral light, for
// review renders. A separate entry (built by test/studio.py to out/skel/studio/), not part of the game; nothing in
// src/main.js depends on it. Everything is chosen by the URL hash:
//   #scen=walk&t=4.2            a named scenario (see SC) advanced to t seconds (fixed 120 Hz step, seed 3)
//   #scen=walk&phase=toeoff&foot=L   ... or, after a 2 s warm-up, the next moment that foot reaches a stance phase:
//                               midstance | heeloff | toeoff | midswing | land
//   &cam=side|front|rear|tq|top|eye|foot_L|foot_R|hip|knee   &tier=high|low   &webgpu   &noshadow   &w=..&h=..
//   &jaw=0.85   override the jaw opening (rad, PS.JAW) after the pose;  &roar=T   the animal roars from T s (head up, jaw open)
//   &cam=dist&d=8   (SKIN3) a plain 62 degree lens at eye height, d metres from the hips (three-quarter front): the skin at game range
//   &cam=leg   the left leg, hip to toes, from the side
//   &cam=head|headtq|headeye   head close-ups: side, three-quarter front, and from player eye height (1.7 m, ~5 m ahead, below)
//   &cam=oside|ofront|otop [&scale=64]   orthographic at a known scale (px per metre), with a 1 m grid (see test/studio.md)
// When the frame is drawn window.__studio = { done: true, info } and the canvas holds the image.
import * as THREE from 'three/webgpu';
import { RexSim, PV, LEG, IDX, SPINE_N, PS } from './sim/rex.js';
import { RexBody } from './view/body.js';
import { WEATHER } from './view/world.js';

// deterministic: the eyes' saccades and anything else that draws on Math.random
{ let s = 12345; Math.random = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

const H = Object.fromEntries(location.hash.slice(1).split('&').filter(Boolean).map((kv) => { const [k, v] = kv.split('='); return [k, v === undefined ? true : decodeURIComponent(v)]; }));
const flat = { height: () => 0, normal: (x, z, o) => { o.x = 0; o.y = 1; o.z = 0; return o; }, arena: 1e4, size: 1e4, addBump() {}, bumps: [] };
const drive = (pace, steer = 0, extra = {}) => () => ({ goal: { kind: 'drive', throttle: 1, steer }, pace, attention: null, ...extra });
const SC = {
  stand: () => ({ goal: null, pace: 2.2, attention: null }),
  walk: drive(2.2), slow: drive(1.2), jog: drive(4.5), run: drive(8), stalk: drive(2.2, 0, { stalk: true }),
  turn: (t) => ({ goal: t > 0.5 ? { kind: 'face', x: Math.sin(2.094) * 40, z: Math.cos(2.094) * 40 } : null, pace: 2, attention: null, faceAttention: false }),
  walkturn: (t) => ({ goal: { kind: 'drive', throttle: 1, steer: t > 1 ? 1 : 0 }, pace: 2.2, attention: null }),
};

const info = { hash: location.hash };
const log = (k, v) => { info[k] = v; };
window.__studio = { done: false, info };

async function main() {
  const T0 = performance.now();
  const W = +(H.w || 1280), Hh = +(H.h || 720);
  const canvas = document.getElementById('view'); canvas.width = W; canvas.height = Hh; canvas.style.width = W + 'px'; canvas.style.height = Hh + 'px';
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: !H.webgpu, preserveDrawingBuffer: true });
  await renderer.init();
  renderer.setPixelRatio(1); renderer.setSize(W, Hh, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = !H.noshadow; renderer.shadowMap.type = THREE.PCFShadowMap;
  log('backend', renderer.backend && renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2');
  // neutral air: the skin's silhouette fresnel takes the fog colour
  WEATHER.fog.value && WEATHER.fog.value.setRGB ? WEATHER.fog.value.setRGB(0.6, 0.6, 0.6) : null;
  if (WEATHER.flash && 'value' in WEATHER.flash) WEATHER.flash.value = 0;

  // ---------------------------------------------------------------- the pose
  const sim = new RexSim(flat, { x: 0, z: 0, yaw: 0, seed: +(H.seed || 3) });
  const fn = SC[H.scen || 'walk'] || SC.walk, dt = 1 / 120;
  let t = 0, roared = false; const step = () => { if (H.roar !== undefined && !roared && t >= +H.roar) { sim.roar(); roared = true; } sim.step(dt, fn(t, sim)); sim.events.length = 0; t += dt; };
  const side = (k) => { const v = sim.pose.v, o = (PV.LEG + k * LEG.SIZE) * 3, p = IDX.PELVIS * 3, q = (IDX.PELVIS + 1) * 3;
    const fx = v[q] - v[p], fz = v[q + 2] - v[p + 2], hx = v[o] - v[p], hz = v[o + 2] - v[p + 2]; return fz * hx - fx * hz > 0 ? 'L' : 'R'; };   // +x is left of +z (y up)
  if (H.phase) {
    while (t < 2) step();
    const k = side(0) === (H.foot || 'L') ? 0 : 1, F = sim.feet[k];
    const ph = { midstance: () => F.planted && (F.phi || 0) >= 0.45, heeloff: () => F.planted && (F.beta || 0) > 0.12, toeoff: () => F.planted && (F.beta || 0) > 0.6,
      midswing: () => !F.planted && F.sw && F.sw.t / F.sw.T >= 0.5, land: () => F.planted && sim.t - F.tLand < 0.02 }[H.phase];
    // start from the opposite state so the phase is reached fresh (planted phases wait for a swing first)
    const wantPlanted = H.phase !== 'midswing';
    let guard = 0; while (F.planted === wantPlanted && guard++ < 1200) step();
    guard = 0; while (!ph() && guard++ < 1200) step();
    log('foot', { k, side: side(k), planted: F.planted, phi: +(F.phi || 0).toFixed(2), beta: +(F.beta || 0).toFixed(2), spread: F.spread ? +F.spread.x.toFixed(2) : null });
  } else { const te = +(H.t || 0); while (t < te - 1e-9) step(); }
  if (H.jaw !== undefined) sim.pose.s[PS.JAW] = +H.jaw;
  log('t', +t.toFixed(3)); log('v', +sim.v.toFixed(2)); log('jaw', +sim.pose.s[PS.JAW].toFixed(3));
  const tPose = performance.now();

  // ---------------------------------------------------------------- the scene: matte floor, sky fill, one key light
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0.62, 0.63, 0.64);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x8c8a84, roughness: 1, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  scene.add(new THREE.HemisphereLight(0xe4e8ee, 0x7a766e, 1.7));
  const key = new THREE.DirectionalLight(0xfff6e8, 3.2); scene.add(key); scene.add(key.target);
  const Q = { tier: H.tier === 'low' ? 'low' : 'high' };
  const body = new RexBody(Q); scene.add(body.group);
  body.update(sim.pose);
  log('tris', body.stats.tris); log('verts', body.stats.verts);
  const tBody = performance.now();

  // ---------------------------------------------------------------- the camera, from the joints
  const v = sim.pose.v, J = (i) => new THREE.Vector3().fromArray(v, i * 3);
  const legP = (k, j) => new THREE.Vector3().fromArray(v, (PV.LEG + k * LEG.SIZE + j) * 3);
  const pel = J(IDX.PELVIS), fwd = new THREE.Vector3(Math.sin(sim.psi), 0, Math.cos(sim.psi)), left = new THREE.Vector3(fwd.z, 0, -fwd.x);
  const all = []; for (let i = 0; i < SPINE_N; i++) all.push(J(i)); all.push(new THREE.Vector3().fromArray(v, PV.HEAD_P * 3));
  { const hp = new THREE.Vector3().fromArray(v, PV.HEAD_P * 3), hf = new THREE.Vector3().fromArray(v, PV.HEAD_F * 3).normalize(); all.push(hp.clone().addScaledVector(hf, 1.9)); }
  for (let k = 0; k < 2; k++) for (let j = 0; j < 4; j++) all.push(legP(k, j));
  // the skin stands out from the bones: pad the joint cloud by its flesh (more around the trunk)
  const kL = side(0) === 'L' ? 0 : 1;
  const footPts = (k) => { const a = legP(k, 2), m = legP(k, 3), tf = legP(k, 4).setY(0).normalize(), sl = new THREE.Vector3(tf.z, 0, -tf.x), g = new THREE.Vector3(m.x, 0.05, m.z);
    return [a, m, g.clone().addScaledVector(tf, 1.0), g.clone().addScaledVector(tf, -0.25), g.clone().addScaledVector(sl, 0.45).addScaledVector(tf, 0.6), g.clone().addScaledVector(sl, -0.45).addScaledVector(tf, 0.6)]; };
  // the head's own points (head space scaled by the species): pivot, crown, snout tip, back of the jaw, chin (with the jaw's opening)
  const headPts = (() => { const hp = new THREE.Vector3().fromArray(v, PV.HEAD_P * 3), hf = new THREE.Vector3().fromArray(v, PV.HEAD_F * 3).normalize(),
    hu = new THREE.Vector3().fromArray(v, PV.HEAD_U * 3); hu.addScaledVector(hf, -hu.dot(hf)).normalize(); const sc = 0.9, ja = sim.pose.s[PS.JAW];
    const at = (z, y) => hp.clone().addScaledVector(hf, z * sc).addScaledVector(hu, y * sc);
    const jz = 1.94 * Math.cos(ja), jy = -1.94 * Math.sin(ja), bz = 0.0 - 0.6 * Math.sin(ja), by = -0.86 * Math.cos(ja);
    return { hp, hf, hu, pts: [at(-0.45, 0.2), at(0.3, 0.62), at(1.9, 0.2), at(1.85, -0.35), at(-0.2 + jz, -0.34 + jy), at(-0.2 + bz, -0.34 + by), at(-0.5, -0.7)] }; })();
  const cam = H.cam || 'side', fovDeg = +(H.fov || 30);
  let dir, pts, pad = 0.9, dist = null, look = null, up = new THREE.Vector3(0, 1, 0);
  const tilt = (d, a) => d.clone().multiplyScalar(Math.cos(a)).add(new THREE.Vector3(0, Math.sin(a), 0)).normalize();
  if (cam === 'side') { dir = tilt(left, 0.06); pts = all; }
  else if (cam === 'front') { dir = tilt(fwd, 0.08); pts = all; }
  else if (cam === 'rear') { dir = tilt(fwd.clone().negate(), 0.12); pts = all; }
  else if (cam === 'tq') { dir = tilt(fwd.clone().add(left).normalize(), 0.12); pts = all; }
  else if (cam === 'top') { dir = new THREE.Vector3(0, 1, 0); up = fwd.clone(); pts = all; }
  else if (cam === 'head') { dir = tilt(left, 0.05); pts = headPts.pts; pad = 0.3; }
  else if (cam === 'headtq') { dir = tilt(headPts.hf.clone().setY(0).normalize().add(left).normalize(), 0.1); pts = headPts.pts; pad = 0.3; }
  else if (cam === 'headeye') { const hf = headPts.hf.clone().setY(0).normalize(), hl = new THREE.Vector3(hf.z, 0, -hf.x), tip = headPts.hp.clone().addScaledVector(headPts.hf, 0.9);
    const d = hf.clone().multiplyScalar(Math.cos(0.45)).addScaledVector(hl, Math.sin(0.45)); look = tip;
    var eyePos = new THREE.Vector3(tip.x + d.x * 5, 1.7, tip.z + d.z * 5), eyePts = headPts.pts, eyePad = 0.35; }
  else if (cam === 'dist') { const d = +(H.d || 8); look = pel.clone().setY(pel.y * 0.85); const dd = fwd.clone().multiplyScalar(0.5).add(left).normalize();      // SKIN3: a game-like view from d metres
    var eyePos = new THREE.Vector3(look.x + dd.x * d, 1.7, look.z + dd.z * d), eyePts = all, eyePad = 1.0; }
  else if (cam === 'eye') { look = pel.clone().setY(pel.y * 0.75); const d = fwd.clone().multiplyScalar(0.8).add(left).normalize(); dist = 8; pts = null;
    var eyePos = new THREE.Vector3(look.x + d.x * 8, 1.7, look.z + d.z * 8); }
  else if (cam === 'foot_L' || cam === 'foot_R') { const k = cam === 'foot_L' ? kL : 1 - kL, tf = legP(k, 4).setY(0).normalize(), lat = new THREE.Vector3(tf.z, 0, -tf.x).multiplyScalar(k === kL ? 1 : -1);
    const trail = legP(k, 3).sub(pel).dot(fwd) < -0.2;
    dir = tilt(lat.multiplyScalar(0.92).add(tf.multiplyScalar(trail ? -0.35 : 0.4)).normalize(), 0.2); pts = footPts(k); pad = 0.12; dist = 2.0; }
  else if (cam === 'hip') { const k = kL; dir = tilt(left.clone().multiplyScalar(0.9).add(fwd.clone().multiplyScalar(0.3)).normalize(), 0.08); pts = [legP(k, 0), legP(k, 1), J(IDX.PELVIS), J(IDX.TAIL_BASE), J(IDX.PELVIS + 2), legP(k, 2)]; pad = 0.7; }
  else if (cam === 'leg') { const k = kL; dir = tilt(left, 0.04); pts = [legP(k, 0), legP(k, 1), legP(k, 2), legP(k, 3), ...footPts(k), J(IDX.PELVIS)]; pad = 0.55; }     // the left leg whole, from the side
  else if (cam === 'knee') { const k = kL; dir = tilt(left.clone().multiplyScalar(0.9).add(fwd.clone().multiplyScalar(0.35)).normalize(), 0.05); pts = [legP(k, 0).lerp(legP(k, 1), 0.5), legP(k, 1), legP(k, 2), legP(k, 3)]; pad = 0.5; }
  else { dir = left; pts = all; }
  let camera = new THREE.PerspectiveCamera(fovDeg, W / Hh, 0.05, 500);
  if (eyePos) { camera.position.copy(eyePos); camera.lookAt(look); pts = (typeof eyePts !== 'undefined' && eyePts) || all; pad = (typeof eyePad !== 'undefined' && eyePad) || 1.0; dir = eyePos.clone().sub(look).normalize(); }
  {
    // fit: the points' extent across the view, padded, at the lens's field (both axes), from the given distance or the fitted one
    const z = dir.clone().normalize(), x = new THREE.Vector3().crossVectors(up, z).normalize(), y = new THREE.Vector3().crossVectors(z, x);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, zMax = -Infinity;
    for (const p of pts) { const a = p.dot(x), b = p.dot(y), c = p.dot(z); x0 = Math.min(x0, a - pad); x1 = Math.max(x1, a + pad); y0 = Math.min(y0, b - pad); y1 = Math.max(y1, b + pad); zMax = Math.max(zMax, c + pad); }
    if (cam !== 'top') y0 = Math.max(y0, -0.25 + 0 * y0);
    // front and rear views stand on the animal's midline (the tail's swing would pull them aside)
    if (cam === 'front' || cam === 'rear') { const m = pel.dot(x), r = Math.max(x1 - m, m - x0); x0 = m - r; x1 = m + r; }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = (x1 - x0) / 2, hh = (y1 - y0) / 2;
    const tv = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2), th = tv * (W / Hh);
    const need = Math.max(hw / th, hh / tv);
    let cz;
    if (eyePos) cz = null;
    if (eyePos) {}
    else if (dist) { cz = zMax - pad + dist; camera.fov = Math.min(80, 2 * THREE.MathUtils.radToDeg(Math.atan(Math.max(hh / (cz - (zMax - pad)), hw / (cz - (zMax - pad)) / (W / Hh))))); }
    else cz = zMax + need;
    if (!eyePos) {
    camera.position.copy(x.clone().multiplyScalar(cx)).addScaledVector(y, cy).addScaledVector(z, cz);
    if (camera.position.y < 0.15) camera.position.y = 0.15;
    camera.up.copy(up); camera.lookAt(x.clone().multiplyScalar(cx).addScaledVector(y, cy).addScaledVector(z, cz - 1)); }
    if (cam !== 'top') {
      // perspective: aim at the middle of the points' angular extent and open the lens to cover it (near points subtend more)
      const C = camera.position, base = Math.atan2(-z.x, -z.z); let a0 = Infinity, a1 = -Infinity, e0 = Infinity, e1 = -Infinity;
      for (const p of pts) { for (const s of [-1, 1]) { const q = p.clone().addScaledVector(y, s * pad * 0.8), dx = q.x - C.x, dy = q.y - C.y, dz = q.z - C.z;
        let a = Math.atan2(dx, dz) - base; a = Math.atan2(Math.sin(a), Math.cos(a)); const e = Math.atan2(dy, Math.hypot(dx, dz)), hz = Math.hypot(dx, dz), aw = Math.atan2(pad * 0.8, hz);
        a0 = Math.min(a0, a - aw); a1 = Math.max(a1, a + aw); e0 = Math.min(e0, e); e1 = Math.max(e1, e); } }
      if (cam === 'front' || cam === 'rear') { const r = Math.max(Math.abs(a0), Math.abs(a1)); a0 = -r; a1 = r; }
      const am = base + (a0 + a1) / 2, em = (e0 + e1) / 2;
      camera.lookAt(C.x + Math.sin(am) * Math.cos(em), C.y + Math.sin(em), C.z + Math.cos(am) * Math.cos(em));
      const vf = Math.max(e1 - e0, (a1 - a0) * Math.cos(em) / (W / Hh)) * 1.04;
      camera.fov = Math.min(85, THREE.MathUtils.radToDeg(vf));
    }
  }
  // cam=dist: a plain lens (fov=, default 62 like the game's) from eye height at d= metres (default 8) from the hips, not fitted
  if (cam === 'dist') { camera.position.copy(eyePos); camera.lookAt(look); camera.fov = +(H.fov || 62); }
  // orthographic views at a known scale (`scale` px per metre, default 64): oside | ofront | otop. Horizontally centred on the
  // animal's extent (front: on the hips), the ground 0.4 m above the bottom edge; a 1 m grid stands 4 m behind the animal
  // (on the ground for otop), every 5th line darker. The view is logged (`ortho`) so pixels convert to metres.
  const ORTHO = { oside: 'side', ofront: 'front', otop: 'top' }[cam];
  if (ORTHO) {
    const S = +(H.scale || 64), w = W / S, h = Hh / S, oc = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 400);
    let a0 = Infinity, a1 = -Infinity; for (const p of all) { const a = p.clone().sub(pel).dot(fwd); a0 = Math.min(a0, a); a1 = Math.max(a1, a); }
    const mid = pel.clone().addScaledVector(fwd, (a0 + a1) / 2 - 0.4); mid.y = h / 2 - 0.4;
    const grid = new THREE.Group(), mk = (n, c) => { const g = new THREE.GridHelper(n, n, c, c); return g; };
    const g1 = mk(40, 0x7c7c7c), g5 = new THREE.GridHelper(40, 8, 0x404040, 0x404040); grid.add(g1, g5);
    if (ORTHO === 'side') { oc.position.copy(mid).addScaledVector(left, 100); oc.up.set(0, 1, 0); oc.lookAt(mid);
      grid.position.copy(mid).addScaledVector(left, -4); grid.position.y = 20; grid.lookAt(grid.position.clone().add(left)); grid.rotateX(Math.PI / 2); }
    else if (ORTHO === 'front') { const c = pel.clone(); c.y = h / 2 - 0.4; oc.position.copy(c).addScaledVector(fwd, 100); oc.up.set(0, 1, 0); oc.lookAt(c);
      grid.position.copy(c).addScaledVector(fwd, -9); grid.position.y = 20; grid.lookAt(grid.position.clone().add(fwd)); grid.rotateX(Math.PI / 2); }
    else { const c = pel.clone().addScaledVector(fwd, (a0 + a1) / 2); c.y = 0; oc.position.copy(c).setY(100); oc.up.copy(fwd); oc.lookAt(c); grid.position.copy(c).setY(0.01); }
    scene.add(grid); camera = oc;
    log('ortho', { view: ORTHO, pxPerM: S, widthM: +w.toFixed(2), heightM: +h.toFixed(2), groundPx: ORTHO === 'top' ? null : Math.round(Hh - 0.4 * S) });
  }
  camera.updateProjectionMatrix();
  // the key light: high, from the camera's left and a little in front of the subject, its shadow fitted to the animal
  { const c = new THREE.Vector3(); for (const p of all) c.add(p); c.multiplyScalar(1 / all.length);
    const toCam = camera.position.clone().sub(c).setY(0).normalize(), l2 = new THREE.Vector3(-toCam.z, 0, toCam.x);
    const kd = toCam.multiplyScalar(0.55).add(l2.multiplyScalar(0.65)).setY(0.62).normalize();
    key.position.copy(c).addScaledVector(kd, 30); key.target.position.copy(c);
    key.castShadow = !H.noshadow; const sc = key.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 5; sc.far = 60;
    key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.03; sc.updateProjectionMatrix(); }
  if (pts) log('pts', pts.map((p) => p.toArray().map((n) => +n.toFixed(2))));
  log('cam', { name: cam, pos: camera.position.toArray().map((n) => +n.toFixed(2)), fov: camera.fov ? +camera.fov.toFixed(1) : null });

  // ---------------------------------------------------------------- draw once (compile included)
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
  const tCompile = performance.now();
  renderer.render(scene, camera);
  // WebGL: make sure the GPU has finished before the screenshot
  try { const gl = renderer.backend && renderer.backend.gl; if (gl) { const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } } catch {}
  const tDraw = performance.now();
  log('ms', { pose: Math.round(tPose - T0), body: Math.round(tBody - tPose), compile: Math.round(tCompile - tBody), draw: Math.round(tDraw - tCompile), total: Math.round(tDraw - T0) });
  window.__studio.done = true;
}
main().catch((e) => { console.error('studio failed', e && e.stack || e); window.__studio.error = String(e && e.stack || e); window.__studio.done = true; });
