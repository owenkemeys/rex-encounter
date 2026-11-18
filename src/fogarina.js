// Fogarina: ankle-deep ground fog that is pushed about like a fluid by whatever walks through it (after the Ocarina of Time
// remake). Plain three.js (WebGPURenderer with its WebGL2 fallback, TSL node materials), no other dependencies.
//
// The look and the flow are a port of "Cheap Ground Fog (or not)" for Godot 4 by OrdinaryCicada / AtSaturn (CC0,
// https://oddpotatodev.itch.io/godot-cheap-ground-fog): fog/fog_trail.gdshader (the flow) and fog/ground_fog.gdshader (the
// surface). What it does:
//  - The flow: a small shallow-water sim on two render targets that follow the eye. Each texel holds how much fog was pushed
//    out (0 at rest, 1 cleared, below 0 piled up) and a velocity. Fog moves along the velocity, height differences push it back
//    into holes, and vorticity confinement keeps eddies spinning, so trails are narrow, curl, and slosh shut over a few seconds.
//  - The surface: one mesh draped on the ground, lifted by the fog's depth (noise lumps that are dragged along the flow, piled
//    up on a trail's rim). Per pixel it redoes that depth from four taps, so it shades as a lit, lumpy surface (the creamy look)
//    and its opacity comes from how far the eye looks through the layer: thin looking down, dense along the ground, soft at the
//    crests and where it thins, with fine wisps that drift with the flow. No stacked sheets, so no layers at any angle.
//
// Two pieces:
//  - createField(): a coarse wrapping grid that bodies write into (stamp for a foot or a press, wake for a moving body).
//    Grass or anything else can read it with at(xz). The fog listens to the same calls and runs its own finer flow.
//  - createFogarina({ field }): the fog. Add fog.mesh to the scene, call fog.update(camera, amount, renderer, dt) every frame.
// In another project:
//   import { createField, createFogarina } from './fogarina.js';
//   const field = createField();
//   const fog = createFogarina({ field, heightAt: (xz) => myGroundHeightNode(xz), color: myFogColour });
//   scene.add(fog.mesh);
//   each frame: field.wake('player', p.x, p.z, 0.4); field.stamp(foot.x, foot.z, 0.6, 1);   // a footfall
//               field.update(dt); fog.update(camera, 1, renderer, dt);
// heightAt and maskAt take a TSL vec2 world xz and return a float node (the ground height; 1 where fog may lie, 0 not).
// color, flash and wind may be plain values or TSL nodes (a vec3 colour, a float lightning lift, a vec2 drift in m/s).
// fog.knobs lists [key, label, min, max, step] for a tuning panel; fog.params[key].value is live.
import * as THREE from 'three/webgpu';
import { Fn, uniform, texture, uv, vec2, vec3, vec4, float, mix, smoothstep, clamp, exp, abs, max, min, length, normalize, dot, fract, step, time, positionLocal, positionWorld, cameraPosition, cameraViewMatrix } from 'three/tsl';

/** n x n cells of size cell metres (it repeats every n * cell). relax: seconds for a press to fade to a third. */
export function createField({ n = 96, cell = 0.75, relax = 2.4 } = {}) {
  const W = n * cell, dat = new Uint8Array(n * n * 4), fl = new Float32Array(n * n * 3), wakes = new Map(), ears = [];
  const rest = () => { fl.fill(0); for (let i = 0; i < n * n; i++) { dat[i * 4] = dat[i * 4 + 1] = 128; dat[i * 4 + 2] = 0; dat[i * 4 + 3] = 255; } };
  rest();
  const tex = new THREE.DataTexture(dat, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  let live = false, clock = 0;
  function press(x, z, rad, k, vx, vz) {
    const sp = Math.hypot(vx, vz), R = rad + Math.min(1.2, sp * 0.2), ux = sp > 0.3 ? vx / sp : 0, uz = sp > 0.3 ? vz / sp : 0, sw = Math.min(1, sp / 5);
    for (let j = Math.floor((z - R) / cell); j <= Math.floor((z + R) / cell); j++) for (let i = Math.floor((x - R) / cell); i <= Math.floor((x + R) / cell); i++) {
      const dx = (i + 0.5) * cell - x, dz = (j + 0.5) * cell - z, d = Math.hypot(dx, dz); if (d > R) continue;
      const f = k * Math.min(1, (1 - d / R) * 1.8), o = ((((j % n) + n) % n) * n + (((i % n) + n) % n)) * 3;
      if (f <= fl[o + 2]) continue;
      // parted outward from the centre, swept along the direction of travel (the wake)
      let px = (dx / (d || 1)) * (1 - sw * 0.6) + ux * sw, pz = (dz / (d || 1)) * (1 - sw * 0.6) + uz * sw; const pl = Math.hypot(px, pz) || 1;
      fl[o] = (px / pl) * f; fl[o + 1] = (pz / pl) * f; fl[o + 2] = f;
    }
    live = true;
  }
  const F = {
    texture: tex,
    /** (push x, push z, flatten) at a world xz node: push is the direction something is pressed, length up to 1. */
    at: (xz) => { const sm = texture(tex, xz.div(W)).level(0); return vec3(sm.r.mul(2).sub(1), sm.g.mul(2).sub(1), sm.b); },
    /** Press at (x, z) within rad metres, strength k (0 to 1, a footfall 1); a velocity (vx, vz) sweeps the push along it. */
    stamp(x, z, rad, k, vx = 0, vz = 0) { press(x, z, rad, k, vx, vz); for (const f of ears) f('stamp', x, z, rad, k, vx, vz); },
    /** A body moving through (call every few frames with the same id): presses a wake along its motion. */
    wake(id, x, z, rad) {
      const w = wakes.get(id);
      if (w && clock > w.t) { const dt = clock - w.t, vx = (x - w.x) / dt, vz = (z - w.z) / dt, sp = Math.hypot(vx, vz); if (sp > 0.3 && sp < 40) press(x, z, rad, Math.min(0.95, 0.35 + sp * 0.1), vx, vz); }
      wakes.set(id, { x, z, t: clock });
      for (const f of ears) f('wake', id, x, z, rad);
    },
    /** Hear every stamp and wake too: fn(kind, ...the same arguments). */
    listen(fn) { ears.push(fn); },
    /** Once a frame: relax toward rest and upload. */
    update(dt) {
      clock += dt;
      if (!live) return;
      const a = Math.exp(-dt / relax); let any = false;
      for (let c = 0, o = 0; c < n * n; c++, o += 3) {
        if (fl[o + 2] < 0.01) { if (fl[o + 2]) { fl[o] = fl[o + 1] = fl[o + 2] = 0; dat[c * 4] = dat[c * 4 + 1] = 128; dat[c * 4 + 2] = 0; } continue; }
        any = true; fl[o] *= a; fl[o + 1] *= a; fl[o + 2] *= a;
        dat[c * 4] = 128 + Math.round(fl[o] * 127); dat[c * 4 + 1] = 128 + Math.round(fl[o + 1] * 127); dat[c * 4 + 2] = Math.round(fl[o + 2] * 255);
      }
      tex.needsUpdate = true; live = any;
    },
    /** Everything back at rest at once, no wakes remembered (a new scenario). */
    clear() { rest(); wakes.clear(); live = false; tex.needsUpdate = true; },
    dispose() { tex.dispose(); },
  };
  return F;
}

/** Tiling smooth value noise (four octaves) in red, mipmapped. */
function noiseTex(S = 256, seed = 71) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const d = new Uint8Array(S * S * 4), oct = [4, 8, 16, 32].map((n) => ({ n, v: Array.from({ length: n * n }, rnd) }));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let sum = 0, wt = 0, a = 1;
    for (const { n, v } of oct) {
      const fx = (x / S) * n, fy = (y / S) * n, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, t = fy - j;
      const us = u * u * u * (u * (u * 6 - 15) + 10), ts = t * t * t * (t * (t * 6 - 15) + 10);
      const at = (a2, b2) => v[(b2 % n) * n + (a2 % n)];
      sum += a * ((at(i, j) * (1 - us) + at(i + 1, j) * us) * (1 - ts) + (at(i, j + 1) * (1 - us) + at(i + 1, j + 1) * us) * ts); wt += a; a *= 0.5;
    }
    d[(y * S + x) * 4] = Math.round(Math.min(1, Math.max(0, ((sum / wt) - 0.5) * 1.6 + 0.5)) * 255); d[(y * S + x) * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t;
}

// [key, label, min, max, step, default]: the live knobs (fog.params) and a tuning panel's list (fog.knobs)
const KNOBS = [
  ['density', 'Thickness', 0, 20, 0.1, 7],
  ['height', 'Depth (m, top of the lumps above the ground)', 0, 0.6, 0.01, 0.17],
  ['soft', 'Softness (thin fog fades out below this depth, m)', 0.02, 0.6, 0.01, 0.22],
  ['bright', 'Brightness', 0, 4, 0.02, 2.2],
  ['lit', 'Lit by the scene (0 flat colour, 1 fully lit)', 0, 1, 0.01, 0.7],
  ['lumps', 'Lump size (m)', 4, 60, 0.5, 20],
  ['trail', 'Trail width', 0.2, 3, 0.05, 1],
  ['push', 'How hard bodies push it (m/s)', 0, 5, 0.05, 1.4],
  ['vort', 'Swirl (eddies keep spinning)', 0, 6, 0.05, 1.6],
  ['flow', 'Flow back speed (m/s)', 0, 4, 0.05, 1.1],
  ['damp', 'Calming (how fast the motion dies)', 0, 4, 0.05, 0.7],
  ['refill', 'Heal speed (closes holes on its own)', 0, 2, 0.01, 0.06],
  ['streak', 'Streaks dragged behind movers (s)', 0, 2, 0.02, 0.7],
  ['lift', 'Piling up on the trail rim', 0, 2, 0.02, 0.5],
  ['detail', 'Fine wisps', 0, 1, 0.01, 0.45],
];
const MAXB = 32;      // bodies stirring the flow at once

/** The fog. params (live, also on the returned object as params): see KNOBS. size, res: the flow window round the eye (m) and its
 *  texels, per quality (setQuality 1-2 medium, 3 high, 0 off). */
export function createFogarina({ field, heightAt = () => float(0), maskAt = () => float(1), color = new THREE.Color(0x3a454f), flash = 0, wind = new THREE.Vector2(0.8, 0.4), high = { size: 48, res: 256 }, medium = { size: 36, res: 128 }, ...opts } = {}) {
  const node = (v) => (v && v.isNode ? v : uniform(v));
  const P = {}; for (const [k, , , , , d] of KNOBS) P[k] = uniform(opts[k] ?? d);
  const U = { origin: uniform(new THREE.Vector2()), size: uniform(high.size), texel: uniform(1 / high.res), scroll: uniform(new THREE.Vector2()), dt: uniform(0), reset: uniform(1), amount: uniform(1) };
  const cell = () => U.size.value * U.texel.value;
  const ntex = noiseTex(), NT = texture(ntex);
  const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, generateMipmaps: false, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping };
  let rtA = null, rtB = null;
  const RD = texture(new THREE.Texture()), ST = texture(new THREE.Texture());      // the sim reads RD; the fog reads ST (the newest state)

  // ---- the flow (port of fog_trail.gdshader). State: r = carved (0 rest, 1 cleared, < 0 piled), gb = velocity (m/s).
  const B = [...Array(MAXB)].map(() => ({ a: uniform(new THREE.Vector4()), b: uniform(new THREE.Vector4()), c: uniform(new THREE.Vector4()) }));
  const simMat = new THREE.NodeMaterial(); simMat.depthTest = simMat.depthWrite = false; simMat.toneMapped = false; simMat.fog = false; simMat.lights = false;
  simMat.fragmentNode = Fn(() => {
    const tx = U.texel, cl = U.size.mul(tx), dt = U.dt;
    const prev = (q) => RD.sample(q).mul(step(0, q.x).mul(step(q.x, 1)).mul(step(0, q.y)).mul(step(q.y, 1)));      // outside the window: fresh fog
    const q0 = uv(), base = q0.add(U.scroll), ox = vec2(tx, 0), oy = vec2(0, tx);
    const c0 = prev(base).gb, nl = prev(base.sub(ox)), nr = prev(base.add(ox)), nd = prev(base.sub(oy)), nu = prev(base.add(oy));
    const inv2 = float(0.5).div(cl);
    const div = nr.g.sub(nl.g).add(nu.b.sub(nd.b)).mul(inv2);
    const gradC = vec2(nr.r.sub(nl.r), nu.r.sub(nd.r)).mul(inv2);
    const curl = nr.b.sub(nl.b).sub(nu.g.sub(nd.g)).mul(inv2);
    // curl at the four neighbours (wider stencil); confinement spins the flow round the stronger eddies so they do not die out
    const r2 = prev(base.add(ox.mul(2))).gb, l2 = prev(base.sub(ox.mul(2))).gb, u2 = prev(base.add(oy.mul(2))).gb, d2 = prev(base.sub(oy.mul(2))).gb;
    const ru = prev(base.add(ox).add(oy)).gb, rd = prev(base.add(ox).sub(oy)).gb, lu = prev(base.sub(ox).add(oy)).gb, ld = prev(base.sub(ox).sub(oy)).gb;
    const cR = r2.y.sub(c0.y).sub(ru.x.sub(rd.x)).mul(inv2), cL = c0.y.sub(l2.y).sub(lu.x.sub(ld.x)).mul(inv2);
    const cU = ru.y.sub(lu.y).sub(u2.x.sub(c0.x)).mul(inv2), cD = rd.y.sub(ld.y).sub(c0.x.sub(d2.x)).mul(inv2);
    const gc = vec2(abs(cR).sub(abs(cL)), abs(cU).sub(abs(cD))), ncu = gc.div(max(length(gc), 1e-5));
    const conf = vec2(ncu.y, ncu.x.negate()).mul(curl).mul(P.vort);
    // semi-Lagrangian advection with a little blur
    const src = base.sub(c0.mul(dt).div(U.size)), here = prev(src);
    const around = prev(src.add(ox)).add(prev(src.sub(ox))).add(prev(src.add(oy))).add(prev(src.sub(oy))).mul(0.25);
    const s = mix(here, around, 0.15);
    const h = float(1).sub(s.r);
    const carved = float(1).sub(max(h.sub(h.mul(div).mul(dt)), 0)).mul(exp(P.refill.negate().mul(dt))).toVar();      // continuity, then a slow heal
    const v = s.gb.add(P.flow.mul(P.flow).mul(gradC).add(conf).mul(dt)).mul(exp(P.damp.negate().mul(dt))).toVar();      // pressure: fog runs back downhill
    const injK = float(1).sub(exp(dt.mul(-6))), carveK = float(1).sub(exp(dt.mul(-14))), ringK = float(1).sub(exp(dt.mul(-12)));
    const wp = U.origin.add(q0.sub(0.5).mul(U.size));      // this texel in world xz
    for (const { a, b, c } of B) {
      // a capsule from where the body was (a.xy) to where it is (b.xy); a.z stir radius, a.w strength, b.zw its velocity;
      // c.x carve radius, c.y ring radius (a footfall's puff), c.z outward speed, c.w ring width
      const ab = b.xy.sub(a.xy), t = clamp(dot(wp.sub(a.xy), ab).div(max(dot(ab, ab), 1e-6)), 0, 1), off = wp.sub(a.xy.add(ab.mul(t))), d = length(off);
      const out = off.div(max(d, 1e-4)), sp = length(b.zw);
      const m = float(1).sub(smoothstep(a.z, a.z.mul(2).add(0.6), d)).mul(a.w).mul(smoothstep(0, P.flow.max(0.2), sp));
      v.assign(mix(v, b.zw.mul(0.6).add(out.mul(min(sp, P.push))), m.mul(injK)));
      carved.assign(mix(carved, 1, float(1).sub(smoothstep(c.x.mul(0.45), c.x, d)).mul(step(1e-3, c.x)).mul(a.w).mul(carveK)));
      const ring = exp(d.sub(c.y).div(max(c.w, 0.02)).pow(2).negate()).mul(step(1e-3, c.y)).mul(a.w);
      v.assign(mix(v, out.mul(c.z), ring.mul(ringK)));
    }
    v.assign(v.mul(min(1, float(8).div(max(length(v), 1e-5)))));
    return vec4(clamp(carved, -1, 1), v, 1).mul(float(1).sub(U.reset));
  })();
  const quad = new THREE.QuadMesh(simMat);

  // ---- the surface (port of ground_fog.gdshader)
  const windN = node(wind);
  const ws = (xz) => xz.sub(U.origin).div(U.size).add(0.5);      // world xz to the flow window's uv
  // how deep the fog is at xz: noise lumps dragged along the flow, carved or piled by the flow, a rim lift, faded at the window edge
  const fogDepth = (xz, vert) => {
    const q = ws(xz), sm = ST.sample(q).level(0), g = U.texel.mul(2);
    const grad = abs(ST.sample(q.add(vec2(g, 0))).level(0).r.sub(ST.sample(q.sub(vec2(g, 0))).level(0).r)).add(abs(ST.sample(q.add(vec2(0, g))).level(0).r.sub(ST.sample(q.sub(vec2(0, g))).level(0).r)));
    const nz = (p) => (vert ? NT.sample(p).level(0) : NT.sample(p)).r;
    const hs = float(1).div(P.lumps), p = xz.sub(sm.gb.mul(P.streak)).mul(hs);
    const n = nz(p.add(windN.mul(hs).mul(time))).mul(0.6).add(nz(p.mul(1.7).add(vec2(windN.y.negate(), windN.x).mul(hs).mul(time).mul(0.5))).mul(0.4));
    const hills = smoothstep(0.2, 0.8, n);
    const cover = smoothstep(0.15, 0.75, nz(xz.mul(0.011).add(windN.mul(0.004).mul(time))));      // big slow thin patches, so it never covers everything
    const edge = float(1).sub(smoothstep(U.size.mul(0.2), U.size.mul(0.48), length(xz.sub(cameraPosition.xz))));
    const amount = clamp(float(1).sub(sm.r), 0, 2).mul(edge).mul(mix(0.35, 1, cover)).mul(maskAt(xz));
    return P.height.mul(amount).mul(mix(0.4, 1.2, hills).add(grad.mul(P.lift)));
  };
  const mat = new THREE.MeshLambertNodeMaterial({ transparent: true, depthWrite: false });
  {
    const lx = positionLocal.xz, wv = lx.add(U.origin);
    // the ground under the mesh, draped over little ledges instead of stepping
    let g = heightAt(wv); const dr = 0.8;
    { let s = float(0); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; s = s.add(heightAt(wv.add(vec2(Math.cos(a) * dr, Math.sin(a) * dr)))); } g = max(g, s.mul(0.125)); }
    mat.positionNode = vec3(lx.x, g.add(0.02).add(fogDepth(wv, true)), lx.y);
    // per pixel: redo the fog's top from four taps one texel apart, for a smooth shaded normal and a smooth layer depth
    const wp = positionWorld.xz, e = U.size.mul(U.texel);
    const tap = (o) => { const d = fogDepth(wp.add(o), false); return { d, top: heightAt(wp.add(o)).add(d) }; };
    const t0 = tap(vec2(e, 0)), t1 = tap(vec2(e.negate(), 0)), t2 = tap(vec2(0, e)), t3 = tap(vec2(0, e.negate()));
    const layer = t0.d.add(t1.d).add(t2.d).add(t3.d).mul(0.25);
    const hx = clamp(t0.top.sub(t1.top), e.mul(-4), e.mul(4)), hz = clamp(t2.top.sub(t3.top), e.mul(-4), e.mul(4));
    const nW = normalize(vec3(hx.negate(), e.mul(2), hz.negate()));
    mat.normalNode = normalize(cameraViewMatrix.mul(vec4(nW, 0)).xyz);
    // opacity: how far the eye looks through the layer (thin looking down, dense along the ground)
    const toEye = positionWorld.sub(cameraPosition), dist = length(toEye), descent = max(toEye.y.negate().div(dist), 0.03);
    let thick = max(layer, 0.001).div(descent);
    // fine wisps carried along the flow: two noise layers slide with the velocity, each one resets while the other shows
    const vel = ST.sample(ws(wp)).level(0).gb, cyc = 1.4, ph = time.div(cyc), p0 = fract(ph), p1 = fract(ph.add(0.5)), dsc = 0.3;
    const dp = wp.add(windN.mul(time).mul(0.5)).mul(dsc);
    const w0 = NT.sample(dp.sub(vel.mul(p0).mul(cyc * dsc))).r, w1 = NT.sample(dp.add(vec2(0.37, 0.71)).sub(vel.mul(p1).mul(cyc * dsc))).r;
    const wisps = mix(w0, w1, abs(float(1).sub(p0.mul(2))));
    thick = thick.mul(mix(1, smoothstep(0.15, 0.85, wisps).mul(2), P.detail));
    mat.opacityNode = float(1).sub(exp(thick.mul(P.density).negate())).mul(smoothstep(0, P.soft, layer)).mul(smoothstep(0.3, 1.8, dist)).mul(U.amount).min(0.92);
    const col = vec3(node(color)).mul(P.bright), fl = node(flash);
    mat.colorNode = col.mul(P.lit);
    mat.emissiveNode = col.mul(float(1).sub(P.lit)).add(vec3(0.6, 0.65, 0.75).mul(fl).mul(1.2));
  }
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat); mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.receiveShadow = true;

  let q = null, on = true;
  function build(Q) {
    if (q === Q) return; q = Q;
    if (rtA) { rtA.dispose(); rtB.dispose(); }
    rtA = new THREE.RenderTarget(Q.res, Q.res, rtOpts); rtB = new THREE.RenderTarget(Q.res, Q.res, rtOpts);
    U.size.value = Q.size; U.texel.value = 1 / Q.res; U.reset.value = 1;
    mesh.geometry.dispose(); mesh.geometry = new THREE.PlaneGeometry(Q.size, Q.size, Q.res >> 1, Q.res >> 1).rotateX(-Math.PI / 2);
    RD.value = rtA.texture; ST.value = rtB.texture;
  }
  build(high);

  // ---- bodies: the field's stamps and wakes become short-lived brushes on the flow
  const live = [], wakes = new Map(); let clock = 0;
  const add = (o) => { live.push({ age: 0, ...o }); if (live.length > MAXB) live.splice(0, live.length - MAXB); };
  const ear = (kind, ...a) => {
    const T = P.trail.value;
    if (kind === 'stamp') {      // a foot or a press: carve its footprint; a full footfall also puffs a ring outward
      const [x, z, rad, k] = a, rc = rad * 0.34 * T;
      add({ ax: x, az: z, bx: x, bz: z, vx: 0, vz: 0, rs: 0, rc, ring: k >= 0.95 ? rc : 0, grow: 2.2, out: k >= 0.95 ? 1.6 : 0, ringW: 0.25, life: k >= 0.95 ? 0.45 : 0.16 });
    } else {      // a moving body: drag the fog along its travel; small bodies (legs in the fog) carve a narrow lane too
      const [id, x, z, rad] = a, w = wakes.get(id);
      if (w && clock > w.t + 1e-3) {
        const dt = clock - w.t, vx = (x - w.x) / dt, vz = (z - w.z) / dt, sp = Math.hypot(vx, vz);
        if (sp > 0.2 && sp < 40) add({ ax: w.x, az: w.z, bx: x, bz: z, vx, vz, rs: rad * 0.22, rc: rad < 1 ? rad * 0.42 * T : 0, ring: 0, grow: 0, out: 0, ringW: 0.25, life: Math.min(0.3, dt * 1.2) });
      }
      wakes.set(id, { x, z, t: clock });
    }
  };
  if (field && field.listen) field.listen(ear);

  return {
    mesh, params: P, knobs: KNOBS.map(([k, l, lo, hi, st]) => [k, l, lo, hi, st]),
    /** Hear a stamp or wake directly, when there is no field: fog.stamp(x, z, rad, k), fog.wake(id, x, z, rad). */
    stamp: (...a) => ear('stamp', ...a), wake: (...a) => ear('wake', ...a),
    /** Once a frame: follow the eye, step the flow (renderer and dt; dt 0 just keeps it still). amount scales it (0 hides). */
    update(camera, amount = 1, renderer = null, dt = 1 / 60) {
      U.amount.value = amount; if (!on || !renderer) return;
      const c = cell(), nx = Math.round(camera.position.x / c) * c, nz = Math.round(camera.position.z / c) * c, o = U.origin.value;
      if (Math.hypot(nx - o.x, nz - o.y) > U.size.value * 0.4) U.reset.value = 1;
      dt = Math.min(dt, 1 / 30); if (!(dt > 0) && U.reset.value < 0.5) return;
      clock += dt;
      U.scroll.value.set((nx - o.x) / U.size.value, (nz - o.y) / U.size.value); o.set(nx, nz); mesh.position.set(nx, 0, nz);
      U.dt.value = dt;
      for (let i = 0; i < MAXB; i++) {
        const b = live[i], u = B[i];
        if (!b) { u.a.value.set(0, 0, 0, 0); u.b.value.set(0, 0, 0, 0); u.c.value.set(0, 0, 0, 0); continue; }
        const f = 1 - b.age / b.life;
        u.a.value.set(b.ax, b.az, b.rs, f); u.b.value.set(b.bx, b.bz, b.vx, b.vz); u.c.value.set(b.rc, b.ring ? b.ring + b.grow * b.age : 0, b.out, b.ringW);
      }
      for (const b of live) b.age += dt;
      for (let i = live.length - 1; i >= 0; i--) if (live[i].age >= live[i].life) live.splice(i, 1);
      RD.value = rtA.texture; const keep = renderer.getRenderTarget();
      renderer.setRenderTarget(rtB); quad.render(renderer); renderer.setRenderTarget(keep);
      ST.value = rtB.texture; [rtA, rtB] = [rtB, rtA]; U.reset.value = 0;
    },
    _rt: () => rtA, _origin: () => U.origin.value, _size: () => U.size.value,      // the newest flow state, for tests
    /** 0 turns it off; 1-2 the cheaper medium flow; 3 the full one. */
    setQuality(n) { on = n > 0; mesh.visible = on; if (on) build(n >= 3 ? high : medium); },
    dispose() { mesh.geometry.dispose(); mat.dispose(); simMat.dispose(); ntex.dispose(); if (rtA) { rtA.dispose(); rtB.dispose(); } },
  };
}
