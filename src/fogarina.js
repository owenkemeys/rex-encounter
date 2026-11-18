// Fogarina: ankle-deep ground fog that parts and swirls where bodies move through it (after Ocarina of Time's remake).
// Two pieces, plain three.js (WebGPURenderer, TSL node materials), no other dependencies:
//  - createField(): a small wrapping grid that travels with the eye for free. Bodies write into it (stamp for a foot or a
//    press, wake for a moving body, which sweeps the push along its travel); it relaxes back over a few seconds. Its at(xz)
//    node gives (push x, push z, flatten) anywhere, so grass or anything else can read the same field.
//  - createFogarina(): a few transparent sheets just above the ground in a box round the camera. They read the field, so
//    the fog clears where something pressed and swirls along the push, then drifts back in as the field relaxes.
// In another project:
//   import { createField, createFogarina } from './fogarina.js';
//   const field = createField();
//   const fog = createFogarina({ field, heightAt: (xz) => myGroundHeightNode(xz), color: myFogColour });
//   scene.add(fog.mesh);
//   each frame: field.wake('player', p.x, p.z, 0.5); field.update(dt); fog.update(camera);
// heightAt and maskAt take a TSL vec2 world xz and return a float node (the ground height; 1 where fog may lie, 0 not).
// color, flash and wind may be plain values or TSL nodes (a vec3 colour, a float lightning lift, a vec2 drift in m/s).
import * as THREE from 'three/webgpu';
import { uniform, vec3, float, mix, smoothstep, abs, normalize, length, oneMinus, attribute, texture, time, positionLocal, positionWorld, positionView, cameraPosition } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** n x n cells of size cell metres (it repeats every n * cell). relax: seconds for a press to fade to a third. */
export function createField({ n = 96, cell = 0.75, relax = 2.4 } = {}) {
  const W = n * cell, dat = new Uint8Array(n * n * 4), fl = new Float32Array(n * n * 3), wakes = new Map();
  for (let i = 0; i < n * n; i++) { dat[i * 4] = dat[i * 4 + 1] = 128; dat[i * 4 + 3] = 255; }
  const tex = new THREE.DataTexture(dat, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  let live = false, clock = 0;
  const F = {
    texture: tex,
    /** (push x, push z, flatten) at a world xz node: push is the direction something is pressed, length up to 1. */
    at: (xz) => { const sm = texture(tex, xz.div(W)).level(0); return vec3(sm.r.mul(2).sub(1), sm.g.mul(2).sub(1), sm.b); },
    /** Press at (x, z) within rad metres, strength k (0 to 1); a velocity (vx, vz) sweeps the push along it. */
    stamp(x, z, rad, k, vx = 0, vz = 0) {
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
    },
    /** A body moving through (call every few frames with the same id): presses a wake along its motion. */
    wake(id, x, z, rad) {
      const w = wakes.get(id);
      if (w && clock > w.t) { const dt = clock - w.t, vx = (x - w.x) / dt, vz = (z - w.z) / dt, sp = Math.hypot(vx, vz); if (sp > 0.3 && sp < 40) F.stamp(x, z, rad, Math.min(0.95, 0.35 + sp * 0.1), vx, vz); }
      wakes.set(id, { x, z, t: clock });
    },
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
    dispose() { tex.dispose(); },
  };
  return F;
}

/** Tiling value noise, four octaves, in the red channel. */
function noiseTex(S = 128, seed = 71) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const d = new Uint8Array(S * S * 4), oct = [4, 8, 16, 32].map((n) => ({ n, v: Array.from({ length: n * n }, rnd) }));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let sum = 0, wt = 0, a = 1;
    for (const { n, v } of oct) {
      const fx = (x / S) * n, fy = (y / S) * n, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, t = fy - j, us = u * u * (3 - 2 * u), ts = t * t * (3 - 2 * t);
      const at = (a2, b2) => v[(b2 % n) * n + (a2 % n)];
      sum += a * ((at(i, j) * (1 - us) + at(i + 1, j) * us) * (1 - ts) + (at(i, j + 1) * (1 - us) + at(i + 1, j + 1) * us) * ts); wt += a; a *= 0.55;
    }
    d[(y * S + x) * 4] = Math.round((sum / wt) * 255); d[(y * S + x) * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}

/** The fog. size: the box round the eye (m); layers: sheets, lowest at lift, the top one depth above it.
 *  params (live, also on the returned object): thick (opacity), depth (m), swirl (how far a push drags it), clear (0 to 1). */
export function createFogarina({ field, heightAt = () => float(0), maskAt = () => float(1), color = new THREE.Color(0x3a454f), flash = 0, wind = new THREE.Vector2(0.8, 0.4), size = 52, layers = 3, lift = 0.05, thick = 0.34, depth = 0.22, swirl = 2.2, clear = 0.9 } = {}) {
  const P = { at: uniform(new THREE.Vector2()), amount: uniform(1), thick: uniform(thick), depth: uniform(depth), swirl: uniform(swirl), clear: uniform(clear) };
  const node = (v) => (v && v.isNode ? v : uniform(v));
  const ntex = noiseTex();
  const g = mergeGeometries([...Array(layers)].map((_, l) => {      // lowest sheet first, so seen from above they blend back to front
    const pg = new THREE.PlaneGeometry(size, size, size, size).rotateX(-Math.PI / 2); pg.deleteAttribute('uv'); pg.deleteAttribute('normal');
    pg.setAttribute('fl', new THREE.Float32BufferAttribute(new Float32Array(pg.attributes.position.count).fill(layers > 1 ? l / (layers - 1) : 0), 1)); return pg;
  }));
  const per = g.index.count / layers;
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const fl = attribute('fl', 'float'), wv = positionLocal.xz.add(P.at);
  m.positionNode = vec3(wv.x, heightAt(wv).add(fl.mul(P.depth)).add(lift), wv.y);
  const wp = positionWorld.xz, tr = field ? field.at(wp) : vec3(0), drift = node(wind).mul(time).mul(0.7);
  const q = wp.sub(tr.xy.mul(P.swirl).mul(fl.add(0.6)));      // pushed out of the way, further up the sheet
  const n1 = texture(ntex, q.add(drift).div(11).add(fl.mul(0.37))).r, n2 = texture(ntex, q.sub(drift.mul(1.6)).div(3.7).add(fl.mul(0.61))).r;
  const den = smoothstep(0.32, 0.78, n1.mul(0.7).add(n2.mul(0.3)));
  const cleared = oneMinus(smoothstep(0.03, 0.35, tr.z).mul(P.clear));
  const dxz = length(wp.sub(cameraPosition.xz)), vy = abs(normalize(positionWorld.sub(cameraPosition)).y);
  const edge = smoothstep(size * 0.5, size * 0.3, dxz).mul(smoothstep(0.4, 2.2, length(positionView)));
  const graze = mix(float(2.6), float(0.25), smoothstep(0.06, 0.6, vy));      // thick looked along, the way a low bank reads; thin looked down into
  m.opacityNode = den.mul(cleared).mul(mix(float(1), float(0.5), fl)).mul(edge).mul(graze).mul(maskAt(wp)).mul(P.thick).mul(P.amount).min(0.8);
  m.colorNode = vec3(node(color)).add(vec3(0.6, 0.65, 0.75).mul(node(flash)).mul(1.4));
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 1;
  return {
    mesh, params: P,
    /** Once a frame: keep the box under the eye (snapped to whole metres, so the sheets never swim). amount scales it (0 hides). */
    update(camera, amount = 1) { P.at.value.set(Math.round(camera.position.x), Math.round(camera.position.z)); P.amount.value = amount; },
    /** How many sheets to draw (0 turns it off): fewer on slower machines. */
    setQuality(n) { mesh.visible = n > 0; g.setDrawRange(0, per * Math.min(layers, n)); },
    dispose() { g.dispose(); m.dispose(); ntex.dispose(); },
  };
}
