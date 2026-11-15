// The paddock: weather, light, ground, vegetation and the fence. Mood presets set the tone;
// the default is a storm at dusk, where the animal is a shape in rain and lightning.
// Sky, fog, ground, foliage and rain are TSL node materials driven by a few shared uniforms, so
// lightning, wetness and wind reach every surface at once.
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, vec2, vec3, vec4, float, mix, smoothstep, clamp, max, min, pow, exp, abs, dot, normalize, length, sin, cos, fract, floor, step,
  positionWorld, positionLocal, positionView, positionGeometry, normalView, normalWorld, cameraPosition, time, uv, texture, vertexColor, attribute, instanceIndex, hash,
  mx_noise_float, mx_fractal_noise_float, mx_worley_noise_float, mx_worley_noise_vec2, fog, transformNormalToView, normalLocal, cross, sign, faceDirection, fwidth, varying, oneMinus,
} from 'three/tsl';
import { makeRng } from '../math.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildFeatures } from './features.js';

export const MOODS = {
  storm: { name: 'Storm at dusk', top: 0x334458, hor: 0x9aa6b0, fog: 0x63707c, dens: 0.0066, low: 1.2, hemi: [0xb4c4da, 0x4c4a3e, 2.1], sun: [0xc8c4d4, 3.2], glow: 0xe0905a, dir: [-0.6, 0.3, 0.5], exp: 1.55, rim: [0xa8c0e4, 1.6], rain: 1, wet: 1, dust: 0x4a4740, cov: [0.0, 0.55], sunGlow: 0.8, env: 0.9, cloud: 0x5a6674 },
  dusk: { name: 'Last light', top: 0x1d2a44, hor: 0xe0915a, fog: 0x8a7366, dens: 0.0062, low: 1.2, hemi: [0x95a3c8, 0x4b4033, 0.55], sun: [0xffa860, 3.6], dir: [-0.8, 0.16, 0.32], exp: 1.0, rim: [0x8fa0d8, 1.0], rain: 0, wet: 0, dust: 0x5e4d3d, cov: [0.15, 0.7], sunGlow: 1.0, env: 0.7, cloud: 0x5a4a52 },
  day: { name: 'Overcast day', top: 0x5f7a93, hor: 0xc7c4b6, fog: 0xb3b4a8, dens: 0.0036, low: 0.8, hemi: [0xdfe6ee, 0x8a8468, 1.0], sun: [0xfff0d8, 3.0], dir: [-0.55, 0.62, 0.42], exp: 1.0, rim: [0xffffff, 0.3], rain: 0, wet: 0, dust: 0x9a8e74, cov: [0.05, 0.6], sunGlow: 0.35, env: 0.9, cloud: 0x9a9fa4 },
};

function canvasTex(size, draw, repeat, srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8; }
  return t;
}

/** A normal from a scalar height field, by screen-space derivatives (no tangents needed). */
export function bumpNormal(h, k = 1, N = normalView) {
  const dHx = h.dFdx().mul(k), dHy = h.dFdy().mul(k);
  const sX = positionView.dFdx(), sY = positionView.dFdy();
  const R1 = cross(sY, N), R2 = cross(N, sX), det = dot(sX, R1).mul(faceDirection);
  const grad = R1.mul(dHx).add(R2.mul(dHy)).mul(sign(det));
  return normalize(abs(det).mul(N).sub(grad));
}

// ---- shared weather uniforms
const U = {
  top: uniform(new THREE.Color()), hor: uniform(new THREE.Color()), fog: uniform(new THREE.Color()), cloud: uniform(new THREE.Color()),
  sunDir: uniform(new THREE.Vector3(0, 1, 0)), sunCol: uniform(new THREE.Color()), sunGlow: uniform(0),
  flash: uniform(0), flashDir: uniform(new THREE.Vector3(1, 0.3, 0)), dens: uniform(0.01), low: uniform(1), fogBase: uniform(0),
  cov0: uniform(0), cov1: uniform(0.5), wet: uniform(0), rain: uniform(0), wind: uniform(new THREE.Vector2(1, 0)),
};
export const WEATHER = U;

/** Colour of the air looking along dir: fog, light scattered toward the sun, and the lightning. */
const airColor = (dir) => {
  const s = max(dot(dir, U.sunDir), 0), f = max(dot(dir, U.flashDir), 0);
  return vec3(U.fog).add(vec3(U.sunCol).mul(pow(s, 6).mul(0.35).add(pow(s, 32).mul(0.4)).mul(U.sunGlow)))
    .add(vec3(0.75, 0.8, 1.0).mul(U.flash).mul(f.mul(f).mul(0.25).add(0.04)));
};

export function buildWorld(scene, terrain, Q = { tier: 'high' }) {
  const lo = Q.tier === 'low', lerpN = (a, b, u) => a + (b - a) * u, ARENA = !!(terrain.paddock && terrain.paddock.things);
  const r = makeRng(5), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3(), k = new THREE.Color();

  // ---- pre-built CC0 textures (dist/assets/tex, see CREDITS.md), fetched after start. Every material that uses one
  // keeps its procedural look until the file arrives (slot.on = 0), and keeps it for good if the file fails.
  const texSlots = [];
  const mkSlot = (name, srgb, fb) => {
    const S = { name, srgb, nodes: [], on: uniform(0) };
    S.at = (u) => { const n = texture(fb, u); S.nodes.push(n); return n; };
    texSlots.push(S); return S;
  };
  const grey1 = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255]), 1, 1); grey1.needsUpdate = true;
  const flatN = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1); flatN.needsUpdate = true;
  const TX = { ground: mkSlot('ground', true, grey1), mud: mkSlot('mud', true, grey1), rock: mkSlot('rock', true, grey1), bark: mkSlot('bark', true, grey1), concrete: mkSlot('concrete', true, grey1) };
  if (!lo) Object.assign(TX, { groundN: mkSlot('ground_n', false, flatN), mudN: mkSlot('mud_n', false, flatN), rockN: mkSlot('rock_n', false, flatN) });
  const loadAssets = () => {
    for (const S of texSlots) {
      fetch(new URL(`assets/tex/${S.name}.jpg`, document.baseURI)).then((res) => { if (!res.ok) throw new Error(res.status); return res.blob(); })
        .then((b) => createImageBitmap(b, lo ? { resizeWidth: 512, resizeHeight: 512, resizeQuality: 'medium' } : {}))
        .then((img) => {
          const tx = new THREE.Texture(img); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = lo ? 2 : 8; tx.flipY = false;
          if (S.srgb) tx.colorSpace = THREE.SRGBColorSpace; tx.needsUpdate = true;
          for (const n of S.nodes) n.value = tx; S.on.value = 1;
        }).catch((e) => console.warn('texture', S.name, e && e.message));
    }
  };
  /** Triplanar sample of a slot in world space (scale: repeats per metre), weights from the world normal. */
  const tri = (S, sc, P = positionWorld, Nw = normalWorld) => {
    const w = abs(Nw).pow(vec3(4)), ws = w.div(w.x.add(w.y).add(w.z));
    return S.at(P.zy.mul(sc)).mul(ws.x).add(S.at(P.xz.mul(sc)).mul(ws.y)).add(S.at(P.xy.mul(sc)).mul(ws.z));
  };
  /** Triplanar sample of a plain texture in world space (for meshes whose UVs are stretched by scaling). */
  const triT = (tex, sc, P = positionWorld, Nw = normalWorld) => {
    const w = abs(Nw).pow(vec3(4)), ws = w.div(w.x.add(w.y).add(w.z));
    return texture(tex, P.zy.mul(sc)).mul(ws.x).add(texture(tex, P.xz.mul(sc)).mul(ws.y)).add(texture(tex, P.xy.mul(sc)).mul(ws.z));
  };
  /** Triplanar normal: each plane's tangent-space normal folded onto the world normal (cheap 'UDN' blend). */
  const triN = (S, sc, k2, P = positionWorld, Nw = normalWorld) => {
    const w = abs(Nw).pow(vec3(4)), ws = w.div(w.x.add(w.y).add(w.z));
    const a = S.at(P.zy.mul(sc)).xy.mul(2).sub(1), b = S.at(P.xz.mul(sc)).xy.mul(2).sub(1), c = S.at(P.xy.mul(sc)).xy.mul(2).sub(1);
    return normalize(Nw.add(vec3(0, a.y, a.x).mul(ws.x).add(vec3(b.x, 0, b.y).mul(ws.y)).add(vec3(c.x, c.y, 0).mul(ws.z)).mul(k2)));
  };

  // ---- the trample field: a small world-anchored grid (wrapping, so it travels with the camera for free) that feet,
  // bodies and the player press into. Grass, meadow and ferns read it in the vertex shader: they part away from what
  // pushed them, lie flat in a running body's wake, and spring back as the field relaxes. One 96x96 RGBA8 upload a frame.
  const FN = 96, FC = 0.75, FW = FN * FC, fdat = new Uint8Array(FN * FN * 4), ffl = new Float32Array(FN * FN * 3);
  for (let i = 0; i < FN * FN; i++) { fdat[i * 4] = fdat[i * 4 + 1] = 128; fdat[i * 4 + 3] = 255; }
  const fieldTex = new THREE.DataTexture(fdat, FN, FN, THREE.RGBAFormat, THREE.UnsignedByteType);
  fieldTex.wrapS = fieldTex.wrapT = THREE.RepeatWrapping; fieldTex.magFilter = fieldTex.minFilter = THREE.LinearFilter; fieldTex.needsUpdate = true;
  let fieldLive = false;
  const stamp = (x, z, rad, kk, vx = 0, vz = 0) => {
    const sp = Math.hypot(vx, vz), R = rad + Math.min(1.2, sp * 0.2), ux = sp > 0.3 ? vx / sp : 0, uz = sp > 0.3 ? vz / sp : 0, sw = Math.min(1, sp / 5);
    for (let j = Math.floor((z - R) / FC); j <= Math.floor((z + R) / FC); j++) for (let i = Math.floor((x - R) / FC); i <= Math.floor((x + R) / FC); i++) {
      const dx = (i + 0.5) * FC - x, dz = (j + 0.5) * FC - z, d = Math.hypot(dx, dz); if (d > R) continue;
      const f = kk * Math.min(1, (1 - d / R) * 1.8), o = ((((j % FN) + FN) % FN) * FN + (((i % FN) + FN) % FN)) * 3;
      if (f <= ffl[o + 2]) continue;
      // parted outward from the centre, swept along the direction of travel (the wake)
      let px = (dx / (d || 1)) * (1 - sw * 0.6) + ux * sw, pz = (dz / (d || 1)) * (1 - sw * 0.6) + uz * sw; const pl = Math.hypot(px, pz) || 1;
      ffl[o] = (px / pl) * f; ffl[o + 1] = (pz / pl) * f; ffl[o + 2] = f;
    }
    fieldLive = true;
  };
  const relax = (dt) => {
    if (!fieldLive) return;
    const a = Math.exp(-dt / 2.4); let any = false;
    for (let n = 0, o = 0; n < FN * FN; n++, o += 3) {
      if (ffl[o + 2] < 0.01) { if (ffl[o + 2]) { ffl[o] = ffl[o + 1] = ffl[o + 2] = 0; fdat[n * 4] = fdat[n * 4 + 1] = 128; fdat[n * 4 + 2] = 0; } continue; }
      any = true; ffl[o] *= a; ffl[o + 1] *= a; ffl[o + 2] *= a;
      fdat[n * 4] = 128 + Math.round(ffl[o] * 127); fdat[n * 4 + 1] = 128 + Math.round(ffl[o + 1] * 127); fdat[n * 4 + 2] = Math.round(ffl[o + 2] * 255);
    }
    fieldTex.needsUpdate = true; fieldLive = any;
  };
  /** (push x, push z, flatten) at a world xz node: push is the direction a plant is pressed, length up to 1. */
  const trampleAt = (wxz) => { const sm = texture(fieldTex, wxz.div(FW)).level(0); return vec3(sm.r.mul(2).sub(1), sm.g.mul(2).sub(1), sm.b); };
  const wakes = new Map();
  scene.background = new THREE.Color(); scene.fog = new THREE.FogExp2(0, 0.01);
  // fog: denser in the low air, coloured by where it is looked through
  {
    const viewDir = normalize(positionWorld.sub(cameraPosition));
    const d = length(positionView), h = positionWorld.y.sub(U.fogBase).max(0);
    const kk = U.dens.mul(d), hk = exp(h.negate().div(6)).mul(U.low).add(0.36);      // tall things stand out of the low murk: the tree line keeps its silhouette
    const f = float(1).sub(exp(kk.mul(kk).mul(hk).negate())).mul(0.985);
    scene.fogNode = fog(airColor(viewDir), f);
  }

  // ---- sky: gradient, a moving cloud deck lit from below by the horizon and from within by lightning
  const sg = new THREE.SphereGeometry(900, 32, 16);
  const skyMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, fog: false, depthWrite: false });
  {
    const dir = normalize(positionLocal), y = dir.y;
    // the horizon takes the sun's colour on its side of the sky (the gap under the deck at dusk), cold on the far side
    const az = dot(normalize(dir.xz.add(vec2(0.0001, 0))), normalize(U.sunDir.xz.add(vec2(0.0001, 0)))).mul(0.5).add(0.5);
    const horC = mix(vec3(U.hor).mul(0.85), vec3(U.hor).mul(0.6).add(vec3(U.sunCol).mul(U.sunGlow).mul(0.55)), pow(az, 3));
    const grad = mix(horC, vec3(U.top), pow(max(y, 0), 0.45));
    const s = max(dot(dir, U.sunDir), 0), fd = max(dot(dir, U.flashDir), 0);
    // two decks: a slow high layer and low scud racing under it (more parallax, darker); both domain-warped so they
    // tear and billow instead of reading as plain noise, both lit from the sun's side by a second, offset sample
    const deck = (h, sc, spd, oct, seed) => {
      const pp = dir.xz.div(y.max(0.02).add(h)).mul(sc).add(U.wind.mul(time.mul(spd)));
      const wq = lo ? vec2(0) : vec2(mx_noise_float(vec3(pp.mul(0.6), seed)), mx_noise_float(vec3(pp.mul(0.6).add(5.2), seed))).mul(0.55);
      const q2 = pp.add(wq);
      const nn = mx_fractal_noise_float(vec3(q2, time.mul(0.012).add(seed)), oct, 2.1, 0.5).mul(0.5).add(0.5);
      const nl = lo ? nn : mx_fractal_noise_float(vec3(q2.add(U.sunDir.xz.mul(0.18)), time.mul(0.012).add(seed)), 3, 2.1, 0.5).mul(0.5).add(0.5);
      return [nn, nn.sub(nl)];      // density, and how much thinner it gets toward the sun (> 0: a lit edge)
    };
    const [n, lit1] = deck(0.09, 0.55, 0.012, lo ? 2 : 5, 0.0), [n2, lit2] = deck(0.05, 0.9, 0.03, lo ? 2 : 3, 3.7);
    const detail = lo ? float(0.5) : mx_fractal_noise_float(vec3(dir.xz.div(y.max(0.02).add(0.09)).mul(1.7), time.mul(0.03)), 3, 2.0, 0.5).mul(0.5).add(0.5);
    const cov = smoothstep(U.cov0, U.cov1, n.add(detail.sub(0.5).mul(0.35)));
    const cov2 = smoothstep(U.cov0.add(0.12), U.cov1.add(0.1), n2).mul(0.85).mul(U.rain.mul(0.5).add(0.5));
    const thick = smoothstep(0.3, 0.95, n);
    const sunLit = (lt, th) => vec3(U.sunCol).mul(U.sunGlow).mul(lt.max(0).mul(pow(az, 3)).mul(1.2).add(pow(s, 5).mul(oneMinus(th).mul(0.9).add(0.1)).mul(0.5)));
    const flashC = vec3(0.7, 0.75, 1.0).mul(U.flash).mul(pow(fd, 4).mul(3.0).add(0.4));
    const cl = mix(vec3(U.cloud), vec3(U.cloud).mul(0.42), thick).add(sunLit(lit1, thick)).add(flashC.mul(oneMinus(thick.mul(0.5))));
    const cl2 = vec3(U.cloud).mul(mix(float(0.7), float(0.35), smoothstep(0.4, 0.9, n2))).add(sunLit(lit2, n2).mul(0.6)).add(flashC.mul(0.6));
    const sunDisk = vec3(U.sunCol).mul(pow(s, 900).mul(8).add(pow(s, 12).mul(0.6))).mul(U.sunGlow).mul(oneMinus(cov.mul(0.85)));
    const above = smoothstep(-0.02, 0.12, y);
    let col = mix(grad.add(sunDisk), cl, cov.mul(above));
    col = mix(col, cl2, cov2.mul(above).mul(smoothstep(0.02, 0.2, y)));
    // distant rain: grey curtains hanging from the deck to the horizon, drifting, streaked, thicker where the deck is dark
    const hz = normalize(dir.xz.add(vec2(0.0001, 0)));
    const curtain = smoothstep(0.5, 0.78, mx_noise_float(vec3(hz.mul(2.2).add(U.wind.mul(time.mul(0.004))), time.mul(0.01))).mul(0.5).add(0.5));
    const streak = lo ? float(0.8) : mx_noise_float(vec3(hz.mul(70).add(y.mul(10)), y.mul(3.0).sub(time.mul(0.6)))).mul(0.2).add(0.8);
    const shaft = curtain.mul(streak).mul(smoothstep(0.2, 0.04, y)).mul(smoothstep(-0.03, 0.01, y)).mul(U.rain).mul(0.75);
    col = mix(col, mix(vec3(U.cloud).mul(0.7), vec3(U.fog), 0.5).add(flashC.mul(0.3)), shaft);
    col = mix(airColor(dir).mul(mix(float(1), horC.div(vec3(U.hor).max(0.01)).mul(0.5).add(0.5), 0.6)), col, smoothstep(-0.03, 0.22, y));        // meets the fog at the horizon
    skyMat.colorNode = col;
  }
  const sky = new THREE.Mesh(sg, skyMat);
  sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky);

  // ---- lightning bolt: a jagged ribbon far off, drawn only during a strike
  const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdfe6ff).multiplyScalar(lo ? 1.5 : 6), fog: false, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const bolt = new THREE.Mesh(new THREE.BufferGeometry(), boltMat); bolt.visible = false; bolt.frustumCulled = false; scene.add(bolt);
  const makeBolt = (cx, cz, cam) => {
    const P = [], I = [], R = r;
    const seg = (x, y, z, dx, dy, dz, n, w) => {
      let px = x, py = y, pz = z;
      for (let i = 0; i < n; i++) {
        const nx = px + dx + (R() - 0.5) * 22, ny = py + dy * (0.8 + R() * 0.4), nz = pz + dz + (R() - 0.5) * 22;
        const ox = -(nz - pz), oz = nx - px, ol = Math.hypot(ox, oz) || 1, ww = w * (1 - i / n * 0.5);
        const b = P.length / 3; P.push(px + ox / ol * ww, py, pz + oz / ol * ww, px - ox / ol * ww, py, pz - oz / ol * ww, nx + ox / ol * ww, ny, nz + oz / ol * ww, nx - ox / ol * ww, ny, nz - oz / ol * ww);
        I.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        if (R() < 0.18 && n > 4) seg(nx, ny, nz, (R() - 0.5) * 30, dy, (R() - 0.5) * 30, Math.floor(n * 0.4), w * 0.5);
        px = nx; py = ny; pz = nz;
        if (py < terrain.height(px, pz)) break;
      }
    };
    seg(cx, 420, cz, 0, -24, 0, 18, 1.6);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I);
    bolt.geometry.dispose(); bolt.geometry = g; void cam;
  };

  // ---- ground
  const N = lo ? 104 : 230, size = terrain.size, step0 = size / N;
  const geo = new THREE.PlaneGeometry(size, size, N, N); geo.rotateX(-Math.PI / 2);
  const features = buildFeatures(scene, terrain, Q, geo, U);      // the paddock's water, mud, tall grass, cliff rock; re-spaces geo (src/view/features.js)
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), gdat = new Float32Array(p.count * 3), gzd = new Float32Array(p.count * 4), GZ = features && features.groundZones;
  const dry = new THREE.Color(0x737048), green = new THREE.Color(0x4f6034), dirt = new THREE.Color(0x5e5039);
  // what the ground is like here, read from the terrain itself (so a new layout dresses itself): slope, how wet
  // (hollows that collect water, or the terrain's own wetness if it has one), and plant cover overhead
  const wetAt = (x, z, h) => {
    if (terrain.wetness) return Math.min(1, Math.max(0, terrain.wetness(x, z)));
    const R = 7, avg = (terrain.height(x + R, z) + terrain.height(x - R, z) + terrain.height(x, z + R) + terrain.height(x, z - R)) / 4;
    return Math.min(1, Math.max(0, (avg - h) * 0.9 - 0.08));
  };
  const shade = (i) => {
    const x = p.getX(i), z = p.getZ(i), h = terrain.height(x, z); p.setY(i, h);
    const e = 1.2, sl = Math.hypot(terrain.height(x + e, z) - h, terrain.height(x, z + e) - h) / e;
    // paths worn between the structures and around the rock: bare where the ground is steep or trodden
    k.copy(green).lerp(dry, Math.min(1, Math.max(0, (h + 1.5) / 5))).lerp(dirt, Math.min(1, sl * 3.5)); k.toArray(col, i * 3);
    if (GZ) gzd.set(GZ(x, z), i * 4);
    gdat[i * 3] = Math.min(1, sl); gdat[i * 3 + 1] = wetAt(x, z, h); gdat[i * 3 + 2] = terrain.coverAt ? Math.min(1, terrain.coverAt(x, z)) : 0;
  };
  for (let i = 0; i < p.count; i++) shade(i);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('gd', new THREE.BufferAttribute(gdat, 3)); geo.setAttribute('gz', new THREE.BufferAttribute(gzd, 4)); geo.computeVertexNormals();
  const gtex = canvasTex(512, (g, S) => {      // fine grit: small stones and soil, no large blotches
    const rr = makeRng(11); g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 30000; i++) { const v = 120 + rr() * 135, sz = 0.6 + rr() * rr() * 3.2; g.fillStyle = `rgba(${v},${v},${v},${0.3 + rr() * 0.5})`; g.fillRect(rr() * S, rr() * S, sz, sz * (0.5 + rr())); }
    for (let i = 0; i < 260; i++) { const v = 70 + rr() * 60; g.strokeStyle = `rgba(${v},${v * 0.95},${v * 0.8},0.5)`; g.lineWidth = 0.6 + rr(); g.beginPath(); const x = rr() * S, y = rr() * S, a = rr() * 6.3, L = 3 + rr() * 9; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke(); }     // twigs and dead straw
  }, 0, false);
  gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping; gtex.anisotropy = 8;
  const groundMat = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
  {
    const wp = positionWorld.xz;
    const grit = texture(gtex, wp.mul(0.42)).r, grit2 = texture(gtex, wp.mul(0.11).add(0.37)).r;
    const macro = mx_fractal_noise_float(vec3(wp.mul(0.035), 1.3), lo ? 2 : 3, 2.0, 0.5);
    const patch = mx_noise_float(vec3(wp.mul(0.18), 4.1));
    const mud = smoothstep(0.1, 0.45, macro.add(patch.mul(0.25)));          // trampled muddy patches
    const vc = vertexColor();
    let base = vc.mul(mix(float(0.78), float(1.12), grit.mul(0.6).add(grit2.mul(0.4))));
    base = mix(base, vec3(0.2, 0.16, 0.11), mud.mul(0.55)).mul(float(0.92).add(patch.mul(0.12)));
    // puddles collect in the mud and low spots; wet ground darkens and gains a sheen
    const pud = smoothstep(0.32, 0.4, macro.add(patch.mul(0.12)).add(grit2.mul(0.06))).mul(U.wet);
    // ---- the photographed ground (when loaded): forest floor, worn to mud on slopes, in hollows, under the brakes
    const gd = attribute('gd', 'vec3'), slopeQ = gd.x, wetQ = gd.y, covQ = gd.z;
    const on = TX.ground.on;
    const gA = TX.ground.at(wp.mul(0.3)).rgb, gB = TX.ground.at(wp.mul(0.071).add(vec2(0.37, 0.61))).rgb;
    const mA = TX.mud.at(wp.mul(0.26).add(vec2(0.13, 0.4))).rgb;
    const tint = vc.div(dot(vc, vec3(0.33)).max(0.02)).mul(0.5).add(0.5);           // the height/slope colouring, as a tint
    const floorC = mix(gA, gB, 0.35).mul(tint).mul(float(0.85).add(patch.mul(0.2)));
    const mudK = clamp(smoothstep(0.35, 0.75, slopeQ.mul(1.6).add(wetQ.mul(1.1)).add(macro.mul(0.45)).add(patch.mul(0.18)).add(covQ.mul(0.25))), 0, 1);
    const texC = mix(floorC, mA.mul(vec3(0.95, 0.9, 0.85)), mudK).mul(float(1).sub(covQ.mul(0.25)));
    base = mix(base, texC, on);
    // meadow: under the grass the ground is a mat of living and dead grass, not bare soil, so the open reads as one sward
    // (the same patch noise thins the near meadow's clumps; trodden, steep, wet and shaded ground stays bare)
    const sward = smoothstep(-0.25, 0.25, mx_noise_float(vec3(wp.mul(0.07), 2.0))).mul(0.55).add(0.45);
    const meadowK = sward.mul(oneMinus(mudK.mul(0.25))).mul(0.92).mul(oneMinus(covQ.min(1).mul(0.8))).mul(smoothstep(0.4, 0.12, slopeQ)).mul(oneMinus(wetQ.mul(0.8)));
    const straw = mx_noise_float(vec3(wp.mul(vec2(2.2, 0.6)), 3.3)).mul(0.5).add(0.5);
    const swardC = mix(vec3(0.075, 0.085, 0.035), vec3(0.15, 0.13, 0.065), straw.mul(0.6).add(grit.mul(0.4))).mul(mix(vec3(1.0), vec3(1.15, 1.05, 0.8), smoothstep(-0.3, 0.6, macro)));
    base = mix(base, swardC.mul(float(0.85).add(patch.mul(0.2))), meadowK);
    // the arena's made ground (features.js groundZones): yard gravel, concrete pads and aprons, jungle litter, bank mud
    {
      const gz = attribute('gz', 'vec4');
      const gravelC = mix(vec3(0.085, 0.082, 0.075), vec3(0.2, 0.19, 0.175), grit.mul(0.7).add(grit2.mul(0.3))).mul(float(0.85).add(patch.mul(0.25)));
      const jx = fract(wp.x.div(4.0)), jz = fract(wp.y.div(4.0)), joint = smoothstep(0.012, 0.0, jx.min(oneMinus(jx))).max(smoothstep(0.012, 0.0, jz.min(oneMinus(jz))));
      const ctex = TX.concrete.at(wp.mul(0.2)).rgb, ctl = dot(ctex, vec3(0.333));
      const concC = mix(vec3(0.17, 0.165, 0.155).mul(float(0.85).add(grit.mul(0.25))), ctex.div(ctl.max(0.01)).mul(0.16).mul(float(0.8).add(ctl.mul(1.5))).min(0.4), TX.concrete.on)
        .mul(oneMinus(joint.mul(0.45))).mul(float(0.9).add(macro.mul(0.15)));
      const litter = mx_noise_float(vec3(wp.mul(1.7), 6.0)).mul(0.5).add(0.5);
      const jungleC = mix(mix(vec3(0.05, 0.036, 0.022), vec3(0.11, 0.08, 0.045), litter), mA.mul(0.55), on.mul(0.5)).mul(float(0.85).add(grit.mul(0.3)));
      const mudC = mix(vec3(0.075, 0.058, 0.04), mA.mul(vec3(0.8, 0.72, 0.62)), on).mul(float(0.8).add(patch.mul(0.2)));
      base = mix(base, gravelC, gz.x); base = mix(base, concC, gz.y); base = mix(base, jungleC, gz.z.mul(oneMinus(gz.y))); base = mix(base, mudC, gz.w.mul(0.85));
    }
    const pudT = smoothstep(0.5, 0.7, wetQ.add(macro.mul(0.25)).add(grit2.mul(0.08))).mul(U.wet);
    const pud2 = mix(pud, pudT, on);
    const wetC = base.mul(mix(float(1), float(0.55), max(U.wet, wetQ.mul(0.35).mul(on))));
    // standing water: dark, mirror-smooth, picking up the sky (environment) at grazing angles
    // steep faces (bluff, overlook, slot, crags, gully banks): every map above is projected straight down, so on a face it
    // streaks into long smears. There the ground turns to rock mapped from all three axes (triplanar), and the planar
    // grit, puddles and ground normals fade out.
    const cliff = smoothstep(0.8, 0.55, normalWorld.y).mul(smoothstep(0.08, 0.3, slopeQ));
    const cn = mx_fractal_noise_float(positionWorld.mul(0.45), lo ? 2 : 3, 2.0, 0.5), cs = sin(positionWorld.y.mul(4.2).add(cn.mul(2.5))).mul(0.5).add(0.5);
    // bedded sandstone/mudstone: warped beds ~0.6 m thick, each its own shade, a step (ledge) at the top of each bed; vertical
    // joints from stretched cells (the cracks the stacks split along), dark in their depths, streaked below by run-off
    const Pc = positionWorld, ys = Pc.y.mul(1.15).add(cn.mul(0.7)), bed = fract(ys), bedId = floor(ys);
    const bedTone = fract(sin(bedId.mul(91.7)).mul(43758.5)), ledge = smoothstep(0.68, 0.96, bed);
    const jw = lo ? null : mx_worley_noise_vec2(vec3(Pc.x.mul(0.55), Pc.y.mul(0.09), Pc.z.mul(0.55)).add(cn.mul(0.15)));
    const crack = lo ? smoothstep(0.04, 0.0, abs(mx_noise_float(vec3(Pc.x.mul(0.8).add(Pc.z.mul(0.6)), Pc.y.mul(0.08), Pc.z.mul(0.8).sub(Pc.x.mul(0.5)))))) : smoothstep(0.06, 0.0, jw.y.sub(jw.x)).mul(0.75), runoff = smoothstep(0.75, 1.0, mx_noise_float(vec3(Pc.x.mul(3.0).add(Pc.z.mul(3.0)), Pc.y.mul(0.15), 9.0)).mul(0.5).add(0.5));
    const hCliff = bed.mul(0.05).sub(ledge.mul(0.05)).sub(crack.mul(0.015)).add(cn.mul(0.05));
    const cliffProc = mix(vec3(0.115, 0.108, 0.095), vec3(0.16, 0.15, 0.132), cs).mul(float(0.85).add(cn.mul(0.3)));
    const rt = tri(TX.rock, 0.22).rgb, rl0 = dot(rt, vec3(0.333)), cliffC0 = mix(cliffProc, mix(rt, vec3(rl0), 0.5).mul(vec3(0.82, 0.8, 0.74)).mul(float(0.85).add(cn.mul(0.25))), TX.rock.on);
    const cliffC = cliffC0.mul(mix(vec3(0.82, 0.8, 0.78), vec3(1.18, 1.08, 0.95), bedTone)).mul(oneMinus(crack.mul(0.55))).mul(oneMinus(ledge.mul(0.18))).mul(oneMinus(runoff.mul(0.3)));
    const ledgeMoss = smoothstep(0.62, 0.8, normalWorld.y.add(cn.mul(0.25))).max(ledge.mul(smoothstep(0.3, 0.8, cn.add(0.5))).mul(0.7)).mul(0.6);
    const cliffAll = mix(cliffC, vec3(0.06, 0.07, 0.035), ledgeMoss).mul(mix(float(1), float(0.6), U.wet));
    const pud3 = pud2.mul(oneMinus(cliff));
    groundMat.colorNode = mix(mix(wetC, wetC.mul(0.22).add(vec3(0.008, 0.01, 0.013)), pud3), cliffAll, cliff).mul(features && features.interiorShade ? features.interiorShade : float(1));
    groundMat.roughnessNode = mix(mix(mix(float(0.97), float(0.8), U.wet).add(grit.mul(0.1)).sub(mudK.mul(on).mul(0.12)), float(0.04), pud3), mix(float(0.9), float(0.5), U.wet), cliff);
    const hgt = mix(grit.mul(0.045).add(grit2.mul(0.06)).mul(oneMinus(pud3)), cn.mul(0.06).add(hCliff), cliff);
    let nTex = null;
    if (!lo) {
      const nA = TX.groundN.at(wp.mul(0.3)).xy.mul(2).sub(1), nM = TX.mudN.at(wp.mul(0.26).add(vec2(0.13, 0.4))).xy.mul(2).sub(1);
      const tn = mix(nA, nM, mudK).mul(oneMinus(pud2)).mul(1.4).mul(oneMinus(cliff));
      nTex = transformNormalToView(normalize(mix(normalWorld.add(vec3(tn.x, 0, tn.y.negate())), triN(TX.rockN, 0.22, 1.2), cliff)));
    }
    if (lo) groundMat.normalNode = bumpNormal(hgt, 1);
    else {
      // rain rings on the puddles
      const cellP = wp.mul(2.2), id = floor(cellP), fr = fract(cellP).sub(0.5);
      const rnd = fract(sin(dot(id, vec2(127.1, 311.7))).mul(43758.5453));
      const ph = fract(time.mul(1.3).add(rnd.mul(7.0)));
      const off = vec2(fract(rnd.mul(13.7)), fract(rnd.mul(29.3))).sub(0.5).mul(0.5);
      const dd = length(fr.sub(off)), ring = sin(dd.sub(ph.mul(0.45)).mul(55)).mul(oneMinus(ph)).mul(smoothstep(0.5, 0.0, dd)).mul(step(dd, ph.mul(0.45).add(0.06)));
      const ripple = ring.mul(0.006).mul(pud3).mul(U.rain);
      groundMat.normalNode = mix(bumpNormal(hgt.add(ripple), 1), bumpNormal(ripple.add(hCliff.mul(cliff)), 1, nTex), on);
    }
  }
  const ground = new THREE.Mesh(geo, groundMat); ground.receiveShadow = true; scene.add(ground);

  // ---- distant hills: a fogged ring of forested ridges beyond the trees, for depth at dusk and by day
  if (!lo) {
    const segs = 160, P = [], I = [], Cc = [], rr = makeRng(41);
    const ridge = (a) => 18 + 22 * Math.sin(a * 3 + 1) * 0.5 + 14 * Math.sin(a * 7 + 2) + 6 * Math.sin(a * 17) + 4 * Math.sin(a * 31 + rr() * 0.3);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2, h = Math.max(6, ridge(a));
      for (const [rad, y] of [[250, -8], [330, h * 0.6], [430, h * 1.4]]) P.push(Math.sin(a) * rad, y, Math.cos(a) * rad);
      for (let j = 0; j < 3; j++) Cc.push(0.12, 0.15, 0.1);
      if (i < segs) { const b = i * 3; I.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5); }
    }
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); hg.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3)); hg.setIndex(I); hg.computeVertexNormals();
    const hills = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })); hills.frustumCulled = false; scene.add(hills);
  }

  // ---- grass: crossed blades with upward normals so they take the ground's light; they sway in the wind
  const btex = canvasTex(256, (g, S) => {
    // tapering blades, denser and shorter at the edges so a clump has a rounded silhouette, a few seed heads
    const rr = makeRng(3); g.clearRect(0, 0, S, S);
    for (let i = 0; i < 150; i++) {
      const u = rr(), x = S * (0.08 + 0.84 * u), edge = 1 - Math.abs(u - 0.5) * 1.5, hgt = S * (0.2 + rr() * 0.75 * edge), lean = (rr() - 0.5) * 70 + (u - 0.5) * 60, v = 130 + rr() * 110, w = 2.2 + rr() * 2.2;
      const dry = rr() < 0.3;
      g.fillStyle = dry ? `rgb(${v | 0},${v * 0.92 | 0},${v * 0.6 | 0})` : `rgb(${v * 0.78 | 0},${v | 0},${v * 0.5 | 0})`;
      const tx = x + lean, ty = S - hgt, mx = x + lean * 0.3, my = S - hgt * 0.6;
      g.beginPath(); g.moveTo(x - w / 2, S); g.quadraticCurveTo(mx - w * 0.3, my, tx, ty); g.quadraticCurveTo(mx + w * 0.3, my, x + w / 2, S); g.fill();
      if (rr() < 0.05) { g.fillStyle = 'rgb(170,150,100)'; g.beginPath(); g.ellipse(tx, ty, 2.5, 7, lean * 0.01, 0, 7); g.fill(); }
    }
  });
  const quad = (ry) => { const g = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateY(ry); const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); return g; };
  const quads = [0, Math.PI / 2].map(quad);      // two crossed cards, drawn from both sides
  const clump = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) clump.setAttribute(name, new THREE.Float32BufferAttribute(quads.flatMap((g) => [...g.attributes[name].array]), name === 'uv' ? 2 : 3));
  clump.setIndex(quads.flatMap((g, n) => Array.from(g.index.array, (i) => i + 4 * n)));
  /** No grass in standing water or on rock faces (the same tests the cliff shading and the water surfaces use). */
  const plantless = (x, z) => (terrain.depthAt && terrain.depthAt(x, z) > 0.02) || (terrain.slopeAt && terrain.slopeAt(x, z) > 0.75) || (GZ && (([g, c]) => g + c > 0.35)(GZ(x, z)));
  const grassless = (x, z) => plantless(x, z) || (GZ && GZ(x, z)[2] > 0.35);      // no grass on the made ground nor under the jungle (ferns there)
  const NG = lo ? 4800 : 19000, gpos = new Float32Array(NG * 4), GR = Math.min(terrain.size * 0.48, (terrain.arena || 100) + 70);
  const swayMat = (tex, tint, stiff, alpha) => {
    const m = new THREE.MeshStandardNodeMaterial({ alphaTest: alpha, roughness: 1, side: THREE.DoubleSide });
    const tx = texture(tex, uv()), tip = uv().y;
    m.normalNode = normalize(transformNormalToView(vec3(0, 1, 0)));      // both faces lit as the ground under them
    const ph = hash(instanceIndex).mul(6.283), ip4 = attribute('ipos', 'vec4'), ip = ip4.xy;
    // gusts roll across the field downwind: a travelling wave in the direction the wind blows, at the wind's speed
    const ws = U.wind.length(), wd = U.wind.div(ws.max(0.01)), along = dot(ip, wd);
    const gust = sin(along.mul(0.16).sub(time.mul(ws.mul(0.55).add(0.6)))).mul(0.5).add(0.5).add(mx_noise_float(vec3(ip.mul(0.05).sub(U.wind.mul(time.mul(0.6))), 3.0)).mul(0.35)).clamp(0, 1);
    // a gust bends the blades and shows their paler undersides: the wave of light that crosses a field in wind
    m.colorNode = tx.rgb.mul(tint).mul(mix(float(0.45), float(1.15), tip)).mul(float(1).add(gust.mul(gust).mul(ws).mul(0.28).mul(tip))).mul(float(1).sub(trampleAt(ip).z.mul(0.22)));
    m.opacityNode = tx.a;
    const w = gust.mul(gust).mul(1.3).add(sin(time.mul(2.3).add(ph)).mul(0.18)).add(0.25);
    const tr = trampleAt(ip), hy = positionLocal.y, h2 = hy.mul(hy);
    // offset in metres in the world (wind plus whatever pressed it), turned into the clump's own frame
    const off = U.wind.mul(w).mul(stiff * 2.4).add(tr.xy.mul(0.85)).mul(h2), ca = cos(ip4.z), sa = sin(ip4.z);
    const lo2 = vec2(off.x.mul(ca).sub(off.y.mul(sa)), off.x.mul(sa).add(off.y.mul(ca))).div(1.2);
    m.positionNode = vec3(positionLocal.x.add(lo2.x), hy.mul(oneMinus(tr.z.mul(0.72))), positionLocal.z.add(lo2.y));
    m.roughnessNode = float(1);
    return m;
  };
  const grassTint = uniform(new THREE.Color(0xa3a074));
  const grass = new THREE.InstancedMesh(clump, swayMat(btex, grassTint, 0.12, 0.45), NG);
  const setGrass = (i) => { const x = gpos[i * 4], z = gpos[i * 4 + 1], sIn = terrain.insideStructure && terrain.insideStructure(x, z), sc = sIn && sIn.kind !== 'pen' ? 0.001 : gpos[i * 4 + 2]; q.setFromAxisAngle(t.set(0, 1, 0), gpos[i * 4 + 3]); m4.compose(t.set(x, terrain.height(x, z) - 0.04, z), q, s.set(sc * 1.2, sc, sc * 1.2)); grass.setMatrixAt(i, m4); };
  for (let i = 0; i < NG; i++) {
    const a = r() * 6.283, d = Math.sqrt(r()) * GR, gx = Math.sin(a) * d, gz = Math.cos(a) * d, wq = terrain.wetness ? terrain.wetness(gx, gz) : 0;
    const bare = wq > 0.85 || grassless(gx, gz);
    gpos.set([gx, gz, (0.3 + r() * r() * 0.9) * (bare ? 0.001 : 1), r() * 3.14], i * 4); setGrass(i);
    k.setHSL(0.13 + r() * 0.08, 0.12 + r() * 0.16, 0.36 + r() * 0.22); grass.setColorAt(i, k);
  }
  { const ip = new Float32Array(NG * 4); for (let i = 0; i < NG; i++) ip.set([gpos[i * 4], gpos[i * 4 + 1], gpos[i * 4 + 3], gpos[i * 4 + 2]], i * 4); clump.setAttribute('ipos', new THREE.InstancedBufferAttribute(ip, 4)); }
  grass.receiveShadow = !lo; grass.frustumCulled = false; scene.add(grass);

  // ---- the meadow near the eye (high tier): a dense field of grass that travels with the camera, standing on a
  // baked height map, kept off rock, trunks and floors by a mask baked beside it
  let hmap = null, bakeH = null, meadow = null, meadowBox = null, NM = 0;
  if (!lo) {
    const HN = 512, HS = 260, hd = new Float32Array(HN * HN * 4);
    bakeH = (x0 = -1e9, z0 = -1e9, x1 = 1e9, z1 = 1e9) => {
      for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
        const x = (i / (HN - 1) - 0.5) * HS, z = (j / (HN - 1) - 0.5) * HS;
        if (x < x0 || x > x1 || z < z0 || z > z1) continue;
        const o = (j * HN + i) * 4, sIn = terrain.insideStructure(x, z);
        hd[o] = terrain.height(x, z); hd[o + 1] = (sIn && sIn.kind !== 'pen') || grassless(x, z) ? 0 : 1;
      }
      // keep it off rock and out of trunks: stamp each obstacle's footprint
      for (const ob of terrain.obstacles) {
        const rad = (ob.r || 1) * (ob.kind === 'tree' ? 1.1 : 0.85), toI = (v) => Math.round((v / HS + 0.5) * (HN - 1));
        for (let j = Math.max(0, toI(ob.z - rad)); j <= Math.min(HN - 1, toI(ob.z + rad)); j++) for (let i = Math.max(0, toI(ob.x - rad)); i <= Math.min(HN - 1, toI(ob.x + rad)); i++) {
          const x = (i / (HN - 1) - 0.5) * HS, z = (j / (HN - 1) - 0.5) * HS; if (Math.hypot(x - ob.x, z - ob.z) < rad) hd[(j * HN + i) * 4 + 1] = 0;
        }
      }
      if (hmap) hmap.needsUpdate = true;
    };
    bakeH();
    hmap = new THREE.DataTexture(hd, HN, HN, THREE.RGBAFormat, THREE.FloatType); hmap.magFilter = hmap.minFilter = THREE.LinearFilter; hmap.needsUpdate = true;
    NM = 44000; const BXM = 66;
    const pair = [0, Math.PI / 2].map((ry) => { const g = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateY(ry); return g; });
    const mg = new THREE.BufferGeometry();
    for (const name of ['position', 'uv']) mg.setAttribute(name, new THREE.Float32BufferAttribute(pair.flatMap((g) => [...g.attributes[name].array]), name === 'uv' ? 2 : 3));
    mg.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(8).fill([0, 1, 0]).flat(), 3));
    mg.setIndex([0, 2, 1, 2, 3, 1, 4, 6, 5, 6, 7, 5]);
    const seeds = new Float32Array(NM * 4), rr = makeRng(55);
    for (let i = 0; i < NM; i++) seeds.set([rr(), rr(), rr(), rr()], i * 4);
    mg.setAttribute('gseed', new THREE.InstancedBufferAttribute(seeds, 4));
    const im = new THREE.InstancedMesh(mg, null, NM);
    const m = new THREE.MeshStandardNodeMaterial({ alphaTest: 0.45, roughness: 1, side: THREE.DoubleSide });
    m.normalNode = normalize(transformNormalToView(vec3(0, 1, 0)));
    meadowBox = uniform(BXM);      // the box the clumps fill around the eye: the quality level shrinks it with the count (setQuality)
    const sd = attribute('gseed', 'vec4'), box = meadowBox;
    // each clump keeps a fixed spot on a grid that slides with the camera (no swimming)
    const cell = sd.xy.mul(box), rel = cell.sub(cameraPosition.xz).add(box.mul(0.5));
    const wpos = rel.sub(floor(rel.div(box)).mul(box)).sub(box.mul(0.5)).add(cameraPosition.xz);
    const huv = wpos.div(HS).add(0.5), hs = texture(hmap, huv).level(0);
    const dist = length(wpos.sub(cameraPosition.xz)), edge = oneMinus(smoothstep(box.mul(0.12), box.mul(0.5), dist)).pow(0.6);
    const patchy = smoothstep(-0.25, 0.25, mx_noise_float(vec3(wpos.mul(0.07), 2.0)));      // clearings and thick stands
    const sc = sd.z.mul(0.7).add(0.35).mul(hs.g).mul(edge).mul(patchy.mul(0.7).add(0.3)).mul(dist.div(28).add(0.9));      // fewer, bigger clumps further out
    const ang = sd.w.mul(6.283), ca = cos(ang), sa = sin(ang);
    const lp = positionLocal, rot = vec3(lp.x.mul(ca).sub(lp.z.mul(sa)), lp.y, lp.x.mul(sa).add(lp.z.mul(ca))).mul(vec3(1.3, 1, 1.3)).mul(sc);
    const wd = U.wind.div(U.wind.length().max(0.01)), gust = sin(dot(wpos, wd).mul(0.16).sub(time.mul(U.wind.length().mul(0.55).add(0.6)))).mul(0.5).add(0.5);
    const w = gust.mul(gust).mul(1.3).add(sin(time.mul(2.3).add(ang)).mul(0.18)).add(0.25), bend = lp.y.mul(lp.y).mul(0.14).mul(sc);
    const trm = trampleAt(wpos);
    m.positionNode = vec3(wpos.x, hs.r.sub(0.03), wpos.y).add(vec3(rot.x, rot.y.mul(oneMinus(trm.z.mul(0.75))), rot.z))
      .add(vec3(U.wind.x, 0, U.wind.y).mul(w).mul(bend)).add(vec3(trm.x, 0, trm.y).mul(lp.y.mul(lp.y).mul(0.95).mul(sc)));
    const tx = texture(btex, uv());
    const hue = mx_noise_float(vec3(wpos.mul(0.25), 7.0)).mul(0.5).add(0.5);
    m.colorNode = tx.rgb.mul(grassTint).mul(mix(vec3(0.85, 1.0, 0.75), vec3(1.15, 1.0, 0.7), hue)).mul(mix(float(0.4), float(1.1), uv().y)).mul(0.85)
      .mul(float(1).add(gust.mul(gust).mul(U.wind.length()).mul(0.3).mul(uv().y))).mul(float(1).sub(trm.z.mul(0.22)))
      .mul(mix(float(0.55), float(1), smoothstep(0.0, 0.65, uv().y.add(sd.z.mul(0.25)).sub(patchy.mul(0.15)))));      // blades shade each other: deeper at the root of thick stands
    // translucency: light through the blade when looking toward the sky's bright side (and the lightning), strongest at the tips
    { const vdir = normalize(positionWorld.sub(cameraPosition)), back = pow(max(dot(vdir, U.sunDir), 0), 3).mul(U.sunGlow).add(U.flash.mul(0.5));
      m.emissiveNode = tx.rgb.mul(grassTint).mul(vec3(0.75, 0.95, 0.45)).mul(mix(vec3(U.sunCol), vec3(U.hor), 0.5)).mul(back.mul(0.4).add(0.05)).mul(uv().y.mul(uv().y)).mul(oneMinus(trm.z.mul(0.6))); }
    m.opacityNode = tx.a;
    im.material = m; im.frustumCulled = false; im.receiveShadow = true; scene.add(im); meadow = im;
  }

  // ---- light
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1), sunDir = new THREE.Vector3(0, 1, 0), lightDir = new THREE.Vector3();
  sun.castShadow = true; sun.shadow.mapSize.set(lo ? 1024 : 2048, lo ? 1024 : 2048);
  const sc2 = sun.shadow.camera; sc2.left = -30; sc2.right = 30; sc2.top = 30; sc2.bottom = -30; sc2.near = 10; sc2.far = 260;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.06; if (!lo) sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0xffffff, 1); scene.add(rim, rim.target);     // sky bounce from the far side so the shadowed flank keeps its form

  // ---- foliage textures: needle sprays for the conifers, bark
  const sprayTex = canvasTex(512, (g, S) => {
    const rr = makeRng(17); g.clearRect(0, 0, S, S);
    const twig = (x0, y0, a, L, w, depth) => {
      const x1 = x0 + Math.sin(a) * L, y1 = y0 - Math.cos(a) * L;
      g.strokeStyle = 'rgb(70,58,40)'; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      const n = Math.floor(L / 2.2);
      for (let i = 1; i < n; i++) {
        const u = i / n, x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u, nl = (5 + 9 * Math.sin(Math.PI * Math.min(1, u * 1.2))) * (depth ? 0.75 : 1) * 1.5;
        for (const sd of [-1, 1]) {
          const b = a + sd * (0.75 + rr() * 0.4), v = 0.65 + rr() * 0.5;
          const tipL = 1 + u * 0.35; g.strokeStyle = `rgb(${(48 + rr() * 30) * v * tipL | 0},${(86 + rr() * 40) * v * tipL | 0},${(36 + rr() * 22) * v | 0})`; g.lineWidth = 1.6 + rr() * 1.2;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(b) * nl, y - Math.cos(b) * nl); g.stroke();
        }
      }
      if (depth < 2) for (let i = 0; i < 5; i++) { const u = 0.15 + rr() * 0.7; twig(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, a + (rr() < 0.5 ? -1 : 1) * (0.5 + rr() * 0.4), L * (0.35 + rr() * 0.25) * (1 - u * 0.5), w * 0.6, depth + 1); }
    };
    twig(S / 2, S - 2, 0, S * 0.94, 3, 0);
  });
  const barkTex = canvasTex(256, (g, S) => {
    const rr = makeRng(23); g.fillStyle = '#7a6a58'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 420; i++) { const x = rr() * S, w = 1 + rr() * 4, v = 60 + rr() * 90; g.fillStyle = `rgba(${v},${v * 0.86},${v * 0.7},0.55)`; g.fillRect(x, 0, w, S); }
    for (let i = 0; i < 900; i++) { const v = 30 + rr() * 50; g.fillStyle = `rgba(${v},${v * 0.9},${v * 0.8},0.6)`; g.fillRect(rr() * S, rr() * S, 1 + rr() * 2, 4 + rr() * 22); }
  });
  barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping;
  const barkMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  {
    const tx = texture(barkTex, uv().mul(vec2(2, 6))), bt = TX.bark.at(uv().mul(vec2(2, 2.2))).rgb, bl = dot(bt, vec3(0.33));
    barkMat.colorNode = mix(tx.rgb.mul(vec3(0.62, 0.55, 0.47)), bt.mul(0.85), TX.bark.on).mul(mix(float(1), float(0.55), U.wet));
    barkMat.roughnessNode = mix(float(0.95), float(0.5), U.wet);
    barkMat.normalNode = bumpNormal(mix(tx.r.mul(0.04), bl.mul(0.06), TX.bark.on), 1);
  }
  const leafMat = (tint) => {
    const m = new THREE.MeshStandardNodeMaterial({ alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85 });
    m.normalNode = normalize(transformNormalToView(normalLocal));      // both faces keep the clump's outward normal
    const tx = texture(sprayTex, uv()), shd = attribute('shade', 'float'), hue = attribute('hue', 'float');
    // the spray texture carries only detail (normalised to ~1); the albedo comes from the instance colour and a per-clump
    // hue, so crowns are mid greens with olive, blue-green and a few rusty clumps, not three dark colours multiplied together
    const tl = dot(tx.rgb, vec3(0.333)), det = mix(vec3(tl.div(0.09).min(1.8)), tx.rgb.div(tl.max(0.02)).mul(tl.div(0.09).min(1.8)), 0.25);
    const var3 = mix(mix(vec3(0.78, 1.0, 0.82), vec3(1.12, 1.04, 0.7), smoothstep(0.25, 0.75, hue)), vec3(1.25, 0.95, 0.62), step(0.93, hue));
    const alb = det.mul(var3).mul(vec3(tint)).mul(0.42).mul(mix(float(1), float(0.8), U.wet));
    // self-shadowing: the inner, lower clumps sit in the crown's own shade (and the wet makes it all darker)
    const ao = shd.min(1.15).mul(0.75).add(0.1);
    m.colorNode = alb.mul(ao);
    m.opacityNode = tx.a.mul(smoothstep(0.5, 2.0, length(positionView)).mul(0.6).add(0.4));      // no hard black card in the eye
    m.roughnessNode = float(0.9);
    // needles are thin: light comes through. Toward the sun (or a strike) the crown glows at its edges; on the shaded side
    // the sky still comes through and bounces about, so no clump goes black
    const vdir = normalize(positionWorld.sub(cameraPosition));
    const thru = pow(max(dot(vdir, U.sunDir), 0), 4).mul(U.sunGlow.mul(0.7).add(0.25)), fl = pow(max(dot(vdir, U.flashDir), 0), 2).mul(U.flash).mul(0.5);
    m.emissiveNode = alb.mul(vec3(U.sunCol).mul(thru).mul(0.7).add(vec3(0.6, 0.68, 0.8).mul(fl)).add(mix(vec3(U.hor), vec3(U.fog), 0.5).mul(0.07))).mul(shd.mul(0.6).add(0.4));
    const ph = hash(instanceIndex).mul(6.283), h = positionLocal.y.max(0).mul(0.04);
    const sway = sin(time.mul(0.9).add(ph)).mul(0.35).add(0.55).add(sin(time.mul(2.3).add(ph.mul(2.0)).add(positionLocal.x)).mul(0.18));
    const flutter = sin(time.mul(4.1).add(positionLocal.x.mul(1.7)).add(positionLocal.z.mul(1.3)).add(ph)).mul(0.04).mul(U.wind.length());
    m.positionNode = positionLocal.add(vec3(U.wind.x, 0, U.wind.y).mul(sway.mul(h).mul(h).mul(0.6))).add(vec3(0, flutter, 0));
    return m;
  };

  /** A tree as two geometries in unit space: trunk (bark) and foliage cards (sprays). */
  const buildTree = (kind, seed, crownOnly = false, lite = false) => {
    const rr = makeRng(seed), TP = [], TN = [], TU = [], TI = [], LP = [], LN = [], LU = [], LS = [], LI = [];
    const H = 20;
    // trunk: tapered, slightly kinked
    // rings bunched toward the foot, where buttress roots flare out in lobes and dive into the ground
    const sides = lite ? 5 : lo ? 7 : 12, rings = lite ? 3 : lo ? 5 : 10, r0 = kind === 'arau' ? 0.6 : 0.75, top = kind === 'arau' ? 0.98 : 0.92;
    const vAt = (i) => Math.pow(i / rings, 1.6), lobes = 4 + Math.floor(rr() * 3), lph = rr() * 6.283;
    const kinks = Array.from({ length: rings + 1 }, (_, i) => [(rr() - 0.5) * 0.4 * vAt(i), (rr() - 0.5) * 0.4 * vAt(i)]);
    for (let i = 0; i <= rings; i++) {
      const v = vAt(i), y = v * H * top - (i === 0 ? 0.35 : 0), fl = Math.exp(-y / 0.9);
      for (let j = 0; j <= sides; j++) {
        const a = (j / sides) * 6.283, lobe = Math.pow(0.5 + 0.5 * Math.cos(a * lobes + lph), 2.5);
        const rad = r0 * (1 - 0.82 * v) * (1 + fl * (0.35 + 1.5 * lobe)) * (1 + 0.04 * Math.sin(a * 7 + y * 2));
        TP.push(Math.sin(a) * rad + kinks[i][0], y, Math.cos(a) * rad + kinks[i][1]); TN.push(Math.sin(a), 0.15 + fl * 0.6, Math.cos(a)); TU.push(j / sides, v * 3);
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < sides; j++) { const a = i * (sides + 1) + j, b = a + sides + 1; TI.push(a, b, a + 1, a + 1, b, b + 1); }
    const trunkAt = (y) => { const v = Math.max(0, Math.min(1, y / (H * top))) * rings || 0, i = Math.max(0, Math.min(rings - 1, Math.floor(v))), f = v - i; return [kinks[i][0] + (kinks[i + 1][0] - kinks[i][0]) * f, kinks[i][1] + (kinks[i + 1][1] - kinks[i][1]) * f]; };
    // a spray card: from base point along dir, width w, rolled about its axis by roll
    const LH = [];
    const card = (bx, by, bz, dx, dy, dz, L, w, roll, shade, cen = null, hue = rr()) => {
      const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
      let sx = -dz, sy = 0, sz = dx; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;       // horizontal side
      const ux = dy * sz - dz * sy, uy = dz * sx - dx * sz, uz = dx * sy - dy * sx;        // up, perpendicular
      const c = Math.cos(roll), sn = Math.sin(roll), wx = (sx * c + ux * sn) * w / 2, wy = (sy * c + uy * sn) * w / 2, wz = (sz * c + uz * sn) * w / 2;
      const b = LP.length / 3, ex = bx + dx * L, ey = by + dy * L, ez = bz + dz * L;
      // a little droop: tip sags
      LP.push(bx - wx, by - wy, bz - wz, bx + wx, by + wy, bz + wz, ex - wx, ey - wy - L * 0.12, ez - wz, ex + wx, ey + wy - L * 0.12, ez + wz);
      LU.push(0, 0, 1, 0, 0, 1, 1, 1);
      // normals point out from the trunk and up: the crown lights as a volume, not as cards
      for (let v = 0; v < 4; v++) {
        const px = LP[(b + v) * 3], py = LP[(b + v) * 3 + 1], pz = LP[(b + v) * 3 + 2], [tx, tz] = trunkAt(py); let nx = px - tx, ny = 0.25 + (py / H - 0.6) * 0.6, nz = pz - tz; let nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        // a cluster shades as a little ball of foliage set on the crown's big volume: blend the two normals
        if (cen) { let cx = px - cen[0], cy = py - cen[1] + 0.25, cz = pz - cen[2]; const cl = Math.hypot(cx, cy, cz) || 1; nx = nx * 0.5 + cx / cl * 0.75; ny = ny * 0.5 + cy / cl * 0.75 + 0.15; nz = nz * 0.5 + cz / cl * 0.75; nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl; }
        LN.push(nx, ny, nz); LS.push(shade * (v > 1 ? 1.12 : 0.85)); LH.push(hue);
      }
      LI.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    };
    // a limb: a thin tapered bark tube from the trunk out along a branch, so foliage hangs on something
    const limb = (ax, ay, az, bx, by, bz, r0, r1) => {
      const n = 3, dx = bx - ax, dy = by - ay, dz = bz - az, dl = Math.hypot(dx, dy, dz) || 1;
      let sx = -dz / dl, sz = dx / dl; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
      const ux = (dy / dl) * sz, uy = (dz / dl) * sx - (dx / dl) * sz, uz = -(dy / dl) * sx, b = TP.length / 3;
      for (let e = 0; e < 2; e++) for (let j = 0; j <= n; j++) {
        const a = (j / n) * 6.283, c = Math.cos(a), sn = Math.sin(a), rad = e ? r1 : r0, ox = sx * c + ux * sn, oy = uy * sn, oz = sz * c + uz * sn;
        TP.push((e ? bx : ax) + ox * rad, (e ? by : ay) + oy * rad, (e ? bz : az) + oz * rad); TN.push(ox, oy, oz); TU.push(j / n, e * dl * 0.4);
      }
      for (let j = 0; j < n; j++) TI.push(b + j, b + n + 1 + j, b + j + 1, b + j + 1, b + n + 1 + j, b + n + 2 + j);
    };
    if (kind === 'conifer') {
      // podocarp / early redwood: drooping layered limbs the whole way up, each carrying clumps of needle sprays (crossed
      // pairs, so a clump has volume from any side), shaded as small balls of foliage set into the crown's overall cone
      const whorls = lite ? 7 : lo ? 9 : (crownOnly ? 12 : 13), per = lo ? 4 : (crownOnly ? 4 : 5), nCl = lite ? 1 : lo ? 2 : (crownOnly ? 2 : 3);
      for (let wI = 0; wI < whorls; wI++) {
        const f = wI / (whorls - 1), y = H * (0.24 + 0.72 * f), L = (1 - f) * 5.0 + 1.0, [tx, tz] = trunkAt(y);
        for (let b = 0; b < per; b++) {
          const a = (b / per) * 6.283 + rr() * 1.0 + wI * 2.4, dx = Math.sin(a), dz = Math.cos(a), droop = -0.22 - rr() * 0.2 + f * 0.25, Lb = L * (0.85 + rr() * 0.3);
          const ex = tx + dx * Lb, ey = y + droop * Lb * 0.6, ez = tz + dz * Lb;
          if (!crownOnly && !lo) limb(tx, y, tz, ex, ey, ez, 0.07 + 0.12 * (1 - f), 0.02);
          for (let c = 0; c < nCl; c++) {
            const u = nCl === 1 ? 0.75 : 0.3 + 0.7 * (c / (nCl - 1)), cx = tx + (ex - tx) * u, cy = y + (ey - y) * u, cz = tz + (ez - tz) * u;
            const sz = Lb * (nCl > 2 ? 0.45 : lite ? 1.0 : crownOnly ? 0.8 : 0.62) * (0.85 + rr() * 0.3) + (crownOnly ? 0.9 : 0.55), ya = a + (rr() - 0.5) * 0.9, ddx = Math.sin(ya), ddz = Math.cos(ya), dr = droop - 0.1 - rr() * 0.25;
            const shade = (0.5 + 0.45 * f + 0.25 * u) * (0.85 + rr() * 0.3), hue = rr(), cen = [cx + ddx * sz * 0.4, cy, cz + ddz * sz * 0.4];
            card(cx - ddx * sz * 0.15, cy, cz - ddz * sz * 0.15, ddx, dr, ddz, sz, sz * 0.95, (rr() - 0.5) * 0.5, shade, cen, hue);
            card(cx - ddx * sz * 0.15, cy + 0.08, cz - ddz * sz * 0.15, ddx, dr + 0.1, ddz, sz * 0.9, sz * 0.7, 1.35 + (rr() - 0.5) * 0.4, shade * 0.92, cen, hue);
          }
        }
      }
      const tp = trunkAt(H * 0.9); card(tp[0], H * 0.9, tp[1], 0, 1, 0.05, 2.6, 1.6, 0, 1.3);
      if (!lo) card(tp[0], H * 0.9, tp[1], 0.05, 1, 0, 2.6, 1.6, 1.57, 1.3);
    } else {
      // araucaria: bare trunk, then whorls of horizontal rope-like branches turning up at the ends
      const whorls = lo ? 6 : 11, per = lo ? 4 : 6;
      for (let wI = 0; wI < whorls; wI++) {
        const f = wI / (whorls - 1), y = H * (0.52 + 0.45 * f), L = lerpN(5.4, 1.2, f) * (0.9 + rr() * 0.2), [tx, tz] = trunkAt(y);
        for (let b = 0; b < per; b++) {
          const a = (b / per) * 6.283 + wI * 0.9 + rr() * 0.4, dx = Math.sin(a), dz = Math.cos(a), shade = 0.6 + 0.55 * f + rr() * 0.15;
          // two segments: out and slightly down, then up at the tip
          const L1 = L * 0.62, mx = tx + dx * L1, my = y - L1 * 0.08, mz = tz + dz * L1;
          if (!crownOnly && !lo) { limb(tx, y, tz, mx, my, mz, 0.1 * (1 - f) + 0.05, 0.03); }
          card(tx, y, tz, dx, -0.08, dz, L1 + 0.3, 1.5, 0, shade); if (!lo) card(tx, y, tz, dx, -0.08, dz, L1 + 0.3, 1.2, 1.57, shade * 0.85);
          card(mx, my, mz, dx, 0.45, dz, L - L1 + 0.6, 1.4, 0, shade * 1.05); if (!lo) card(mx, my, mz, dx, 0.45, dz, L - L1 + 0.6, 1.1, 1.57, shade);
        }
      }
      const [tx, tz] = trunkAt(H * 0.97); card(tx, H * 0.95, tz, 0, 1, 0.05, 2.2, 1.6, 0, 1.25); card(tx, H * 0.95, tz, 0.05, 1, 0, 2.2, 1.6, 1.57, 1.25);
    }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(TP, 3)); tg.setAttribute('normal', new THREE.Float32BufferAttribute(TN, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(TU, 2)); tg.setIndex(TI); tg.computeVertexNormals();
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(LP, 3)); lg.setAttribute('normal', new THREE.Float32BufferAttribute(LN, 3)); lg.setAttribute('uv', new THREE.Float32BufferAttribute(LU, 2)); lg.setAttribute('shade', new THREE.Float32BufferAttribute(LS, 1)); lg.setAttribute('hue', new THREE.Float32BufferAttribute(LH, 1)); lg.setIndex(LI);
    return { trunk: tg, leaves: lg, H };
  };

  // ---- perimeter forest
  const nT = 190, perim = [];
  {
    const T = buildTree(ARENA ? 'arau' : 'conifer', 7, true, lo);
    const trunk = new THREE.InstancedMesh(T.trunk, barkMat, nT), crown = new THREE.InstancedMesh(T.leaves, leafMat(uniform(new THREE.Color(0xd8e2c8))), nT);
    for (let i = 0; i < nT; i++) {
      const a = r() * 6.283, d = terrain.arena + 24 + r() * r() * 90, x = Math.sin(a) * d, z = Math.cos(a) * d, y = terrain.height(x, z) - 0.3, hgt = 13 + r() * 15;
      const sc = hgt / T.H, w = sc * (0.85 + r() * 0.3);
      m4.compose(t.set(x, y, z), q.setFromAxisAngle(s.set(0, 1, 0), r() * 6.283), s.set(w, sc, w)); trunk.setMatrixAt(i, m4); crown.setMatrixAt(i, m4);
      k.setHSL(0.24 + r() * 0.08, 0.25 + r() * 0.2, 0.42 + r() * 0.16); crown.setColorAt(i, k);
      r(); r(); r();
    }
    q.identity();
    trunk.castShadow = crown.castShadow = !lo; scene.add(trunk, crown); perim.push(trunk, crown);
  }
  // ---- small rocks and the outcrops: displaced, smooth, mossy on top, darker when wet
  const rockGeo = (detail, seed, amp) => {
    const g = new THREE.IcosahedronGeometry(1, detail), p2 = g.attributes.position, rr = makeRng(seed), v = new THREE.Vector3();
    const bumps = Array.from({ length: 9 }, () => [new THREE.Vector3(rr() - 0.5, rr() - 0.5, rr() - 0.5).normalize(), rr() * amp]);
    // fractured stone: a dozen random cleavage planes shear the lumpy body into flat broken faces with sharp arrises
    const cuts = Array.from({ length: 11 }, () => [new THREE.Vector3(rr() - 0.5, (rr() - 0.5) * 1.4, rr() - 0.5).normalize(), 0.72 + rr() * 0.22]);
    for (let i = 0; i < p2.count; i++) {
      v.fromBufferAttribute(p2, i).normalize(); let f = 1; for (const [b, a] of bumps) f += a * Math.max(0, v.dot(b) - 0.4) * 1.6; f -= Math.max(0, -v.y - 0.3) * 0.3;
      for (const [n, d] of cuts) { const c = v.dot(n); if (c > 0.05) f = Math.min(f, d / c); }
      f *= 1 + (rr() - 0.5) * amp * 0.12; p2.setXYZ(i, v.x * f, v.y * f, v.z * f);
    }
    // weld shared vertices so the surface shades smooth
    const m = new THREE.BufferGeometry(); m.setAttribute('position', p2); const merged = mergeVerts(m); merged.computeVertexNormals(); return merged;
  };
  const rockMat = (base) => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
    const wpos = positionWorld, n1 = mx_fractal_noise_float(wpos.mul(0.7), lo ? 2 : 4, 2.0, 0.5), n2 = mx_noise_float(wpos.mul(4.5));
    const moss = smoothstep(0.45, 0.8, normalWorld.y.add(n1.mul(0.5))).mul(0.85);
    let c = vec3(base).mul(float(0.82).add(n1.mul(0.3)).add(n2.mul(0.08)));
    // photographed rock (triplanar), its colour pulled toward this rock's base so outcrops vary
    const rt = tri(TX.rock, 0.3).rgb, rl = dot(rt, vec3(0.33));
    c = mix(c, mix(rt, vec3(rl).mul(vec3(base)).mul(3.2), 0.35).mul(float(0.8).add(n1.mul(0.25))), TX.rock.on);
    c = mix(c, vec3(0.17, 0.2, 0.1), moss.mul(mix(float(1), float(0.6), TX.rock.on)));
    m.colorNode = c.mul(mix(float(1), float(0.55), U.wet));
    m.roughnessNode = mix(float(0.9), float(0.5), U.wet).add(moss.mul(0.25)).sub(rl.mul(0.15).mul(TX.rock.on));
    const bp = bumpNormal(n1.mul(0.1).add(n2.mul(0.015)), 1);
    m.normalNode = lo ? bp : mix(bp, bumpNormal(n2.mul(0.01), 1, transformNormalToView(triN(TX.rockN, 0.3, 1.3))), TX.rock.on);
    return m;
  };
  const nR = 110, rocks = new THREE.InstancedMesh(rockGeo(lo ? 1 : 2, 9, 0.25), rockMat(new THREE.Color(0x77736a)), nR);
  for (let i = 0; i < nR; i++) {
    const a = r() * 6.283, d = 8 + r() * 150, x = Math.sin(a) * d, z = Math.cos(a) * d, big = d > terrain.arena + 10, sz = big ? 1 + r() * 3 : 0.12 + r() * 0.3;
    q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3)); m4.compose(t.set(x, terrain.height(x, z) + sz * 0.2, z), q, s.set(sz, sz * (0.5 + r() * 0.4), sz * (0.7 + r() * 0.5))); rocks.setMatrixAt(i, m4);
  }
  rocks.castShadow = !lo; rocks.receiveShadow = true; scene.add(rocks);
  const rockM = rockMat(new THREE.Color(0x7d7a72));
  // cover outcrops: the boulders the animal's eyes and the player's body both respect
  {
    const parts = terrain.obstacles.filter((o) => o.parts).flatMap((o) => o.parts);      // generated with the colliders, so what you see is what is solid
    const bg = rockGeo(lo ? 2 : 3, 77, 0.18);
    const boulders = new THREE.InstancedMesh(bg, rockM, parts.length);
    parts.forEach(([x, y, z, sx, sy, sz, ra, rb], i) => { q.setFromEuler(new THREE.Euler(ra * 0.2, rb, ra * 0.15)); m4.compose(t.set(x, y, z), q, s.set(sx, sy, sz)); boulders.setMatrixAt(i, m4); });
    q.identity();
    boulders.castShadow = !lo; boulders.receiveShadow = true; scene.add(boulders);
  }
  q.identity();

  // ---- inside the paddock: trees, fallen logs, cycads, fern brakes
  {
    // each tree drawn as its own species (araucaria or podocarp), in a few shapes so the Wood is not one tree repeated
    const trees = ARENA ? [] : terrain.obstacles.filter((o) => o.kind === 'tree'), nVar = lo ? 1 : 2;
    const crownMat = leafMat(uniform(new THREE.Color(0xe0e8d0)));
    for (const sp of ['arau', 'conifer']) for (let vI = 0; vI < nVar; vI++) {
      const mine = trees.filter((o) => (o.species || 'arau') === sp && (o.seed % nVar) === vI); if (!mine.length) continue;
      const T = buildTree(sp, sp === 'arau' ? 13 + vI * 17 : 29 + vI * 11), r0 = sp === 'arau' ? 0.6 : 0.75;
      const tr = new THREE.InstancedMesh(T.trunk, barkMat, mine.length), cr = new THREE.InstancedMesh(T.leaves, crownMat, mine.length);
      mine.forEach((o, i) => {
        const rr = makeRng(o.seed), y = terrain.height(o.x, o.z) - 0.15, H = o.h, sc = H / T.H, tw = o.r / r0;
        q.setFromEuler(new THREE.Euler((rr() - 0.5) * 0.04, rr() * 6, (rr() - 0.5) * 0.04));
        m4.compose(t.set(o.x, y, o.z), q, s.set(tw, sc, tw)); tr.setMatrixAt(i, m4);
        m4.compose(t.set(o.x, y, o.z), q, s.set(sc * 0.95, sc, sc * 0.95)); cr.setMatrixAt(i, m4);
        k.setHSL(sp === 'arau' ? 0.22 + rr() * 0.06 : 0.27 + rr() * 0.06, 0.25 + rr() * 0.15, 0.38 + rr() * 0.12); cr.setColorAt(i, k);
      });
      tr.castShadow = cr.castShadow = true; tr.receiveShadow = true; scene.add(tr, cr);
    }
    // fallen logs lie on the ridges they make in the ground
    // a log is a unit cylinder scaled to metres of length: its own UVs would smear the bark along it, so it is mapped in the world
    const logMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
    {
      const tx = triT(barkTex, 0.35), bt = tri(TX.bark, 0.45).rgb, bl = dot(bt, vec3(0.33));
      logMat.colorNode = mix(tx.rgb.mul(vec3(0.55, 0.49, 0.42)), bt.mul(0.75), TX.bark.on).mul(mix(float(1), float(0.55), U.wet));
      logMat.roughnessNode = mix(float(0.95), float(0.5), U.wet);
      logMat.normalNode = bumpNormal(mix(tx.r.mul(0.04), bl.mul(0.06), TX.bark.on), 1);
    }
    const lg = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, lo ? 9 : 14, 1).rotateZ(Math.PI / 2), logMat, Math.max(1, terrain.logs.length));
    terrain.logs.forEach((L, i) => {
      const ox = L.cz * (L.r * 1.6), oz = -L.cx * (L.r * 1.6), ax = L.x + L.cx * L.half, az = L.z + L.cz * L.half, bx = L.x - L.cx * L.half, bz = L.z - L.cz * L.half;
      const base = (x, z) => Math.min(terrain.height(x + ox, z + oz), terrain.height(x - ox, z - oz));
      const ya = base(ax, az), yb = base(bx, bz), len = 2 * L.half + 2 * L.r;
      q.setFromEuler(new THREE.Euler(0, L.yaw - Math.PI / 2, Math.atan2(ya - yb, 2 * L.half), 'YXZ'));
      m4.compose(t.set(L.x, (ya + yb) / 2 + L.r * 0.5, L.z), q, s.set(len, L.r, L.r)); lg.setMatrixAt(i, m4);
    });
    lg.castShadow = lg.receiveShadow = true; scene.add(lg);
  }
  // structures: concrete shed, block pen, culvert pipe, watchtower, rock cleft
  const wetMats = [];
  {
    const concTex = canvasTex(256, (g, S) => {
      const rr = makeRng(31); g.fillStyle = '#b8b5aa'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 9000; i++) { const v = 150 + rr() * 80; g.fillStyle = `rgba(${v},${v},${v * 0.96},${0.25 + rr() * 0.3})`; g.fillRect(rr() * S, rr() * S, 1 + rr() * 2, 1 + rr() * 2); }
      for (let i = 0; i < 70; i++) { const x = rr() * S, w = 2 + rr() * 8; const gr = g.createLinearGradient(0, S * 0.3, 0, S); gr.addColorStop(0, 'rgba(50,48,40,0)'); gr.addColorStop(1, `rgba(40,40,30,${0.2 + rr() * 0.3})`); g.fillStyle = gr; g.fillRect(x, S * (0.2 + rr() * 0.4), w, S); }      // rain streaks and grime
      g.fillStyle = 'rgba(60,70,40,0.35)'; g.fillRect(0, S * 0.9, S, S * 0.1);
    }, 1);
    // poured concrete, weathered and rain-streaked: the photographed wall projected in world space, so long walls don't stretch it
    const concMat = (hex, blocks = false) => {
      const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 }), pcT = triT(concTex, 0.25), pc = pcT.rgb.mul(new THREE.Color(hex)), ct = tri(TX.concrete, 0.28).rgb;
      const streak = mx_noise_float(vec3(positionWorld.x.mul(3.0).add(positionWorld.z.mul(3.0)), positionWorld.y.mul(0.25), 5.0)).mul(0.5).add(0.5);
      // the photo is dark (mean ~0.1 linear): keep only its variation, normalised, around this wall's own albedo. (Multiplying the
      // photo by a linear tint squared the darkness and left the walls near black under pale lichen: the old 'black slab' bug.)
      const ctN = ct.div(dot(ct, vec3(0.333)).max(0.01).mul(0.6).add(0.04)).min(2.2);
      let c = mix(pc, ctN.mul(new THREE.Color(hex)).mul(float(0.85).add(streak.mul(0.25))), TX.concrete.on);
      // how it was built: board-formed pours (horizontal lifts and tie-holes) for the shed, breeze-block courses for the pen
      const Pw0 = positionWorld, alongW = mix(Pw0.x, Pw0.z, step(abs(normalWorld.x), abs(normalWorld.z)).oneMinus());
      const course = fract(Pw0.y.div(blocks ? 0.2 : 0.45)), bx = fract(alongW.div(blocks ? 0.4 : 0.9).add(blocks ? floor(Pw0.y.div(0.2)).mul(0.5) : 0));
      const joint = max(smoothstep(0.06, 0.0, course).add(smoothstep(0.94, 1.0, course)), blocks ? smoothstep(0.035, 0.0, bx).add(smoothstep(0.965, 1.0, bx)) : float(0)).min(1).mul(oneMinus(abs(normalWorld.y)));
      const tie = blocks ? float(0) : smoothstep(0.035, 0.015, length(vec2(fract(alongW.div(0.9)).sub(0.5).mul(0.9), fract(Pw0.y.div(0.45).add(0.5)).sub(0.5).mul(0.45)))).mul(oneMinus(abs(normalWorld.y)));
      c = c.mul(oneMinus(joint.mul(blocks ? 0.35 : 0.18))).mul(oneMinus(tie.mul(0.6)));
      // decades out in the rain: green-black run-off streaks hanging from every top edge, a damp rising tide of algae and
      // moss from the ground, rust bleeding from rebar in a few places, lichen blotches, moss thick on anything facing up
      const P = positionWorld, nb = mx_fractal_noise_float(P.mul(0.9), 3, 2.0, 0.5), ny = normalWorld.y;
      const runs = mx_noise_float(vec3(P.x.mul(5.0).add(P.z.mul(5.0)), P.y.mul(0.12), 2.0)).mul(0.5).add(0.5);
      const grime = smoothstep(0.45, 0.85, runs).mul(0.55);
      const rustM = smoothstep(0.72, 0.9, mx_noise_float(vec3(P.x.mul(1.3).add(P.z.mul(1.3)), 3.0, 1.0))).mul(smoothstep(0.35, 0.8, mx_noise_float(vec3(P.x.mul(9).add(P.z.mul(9)), P.y.mul(0.5), 4.0)).mul(0.5).add(0.5)));
      const lichen = smoothstep(0.66, 0.82, mx_noise_float(P.mul(3.5)).mul(0.5).add(0.5).add(nb.mul(0.1))).mul(0.18);
      const damp = smoothstep(0.9, 0.0, P.y.sub(attribute('gy', 'float')).add(nb.mul(0.5))).mul(0.55), moss = max(smoothstep(0.35, 0.75, ny.add(nb.mul(0.5))), damp.mul(oneMinus(abs(ny))));
      c = c.mul(oneMinus(grime.mul(vec3(0.75, 0.7, 0.72))));
      c = mix(c, vec3(0.32, 0.12, 0.04), rustM.mul(0.7));
      c = mix(c, vec3(0.3, 0.31, 0.22), lichen.mul(oneMinus(moss)));
      c = mix(c, vec3(0.06, 0.085, 0.03).add(nb.mul(0.03)), moss.mul(0.9));
      m.colorNode = c.mul(mix(float(1), float(0.6), U.wet));
      m.roughnessNode = mix(float(0.95), float(0.55), U.wet).add(moss.mul(0.1)).sub(grime.mul(U.wet).mul(0.2));
      m.normalNode = bumpNormal(mix(pcT.r.mul(0.01), dot(ctN, vec3(0.33)).mul(0.006), TX.concrete.on).sub(joint.mul(0.006)).sub(tie.mul(0.01)), 1);
      return m;
    };
    const conc = concMat(0x8e8a7f), block = concMat(0x7f7b71, true);
    // weathered timber, grain mapped in the world along the members (boxes scaled to a post's length would smear it)
    const wood = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
    {
      const w = normalWorld, Pw = positionWorld, wy = abs(w.y), sideX = step(abs(w.z), abs(w.x));
      const g = texture(barkTex, mix(mix(vec2(Pw.x, Pw.y), vec2(Pw.z, Pw.y), sideX), vec2(Pw.x, Pw.z), step(0.7, wy)).mul(vec2(0.9, 0.18)));
      const n = mx_noise_float(Pw.mul(vec3(2, 0.3, 2)));
      wood.colorNode = g.rgb.mul(vec3(0.5, 0.45, 0.38)).mul(float(0.8).add(n.mul(0.25))).mul(mix(float(1), float(0.6), U.wet));
      wood.roughnessNode = mix(float(0.95), float(0.6), U.wet);
      wood.normalNode = bumpNormal(g.r.mul(0.02), 1);
    }
    const add = (geo, mat, x, y, z, ry, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz, 'YXZ'); m.scale.set(sx, sy, sz); m.castShadow = m.receiveShadow = true; pending.push(m); return m; };
    const pending = [];      // merged per material below: a structure is a handful of draw calls, not one per board
    const box = new THREE.BoxGeometry(1, 1, 1);
    const rockBoxes = [12, 19, 33].map((sd) => rockGeo(2, sd, 0.15)), chunk = rockGeo(1, 41, 0.1);
    // rusted steel: plates, sign boards, bands; pitted orange-brown with darker scale
    const rust = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0.35 });
    { const n = mx_fractal_noise_float(positionWorld.mul(6), 3, 2.0, 0.5), n2 = mx_noise_float(positionWorld.mul(25));
      rust.colorNode = mix(vec3(0.2, 0.075, 0.025), vec3(0.09, 0.06, 0.045), smoothstep(-0.2, 0.4, n)).mul(float(0.8).add(n2.mul(0.25))).mul(mix(float(1), float(0.65), U.wet));
      rust.normalNode = bumpNormal(n.mul(0.004).add(n2.mul(0.002)), 1); rust.roughnessNode = mix(float(0.88), float(0.55), U.wet); }
    const rrS = makeRng(4242);
    let culvertIn = null;
    for (const S of terrain.structures) {
      if (S.blockout) continue;      // the arena's structures are drawn as blockout by features.js until they are dressed
      for (const w of S.walls) {
        if (w.mat === 'pipe') continue;
        const L = Math.hypot(w.bx - w.ax, w.bz - w.az), yaw = Math.atan2(w.bx - w.ax, w.bz - w.az), mx = (w.ax + w.bx) / 2, mz = (w.az + w.bz) / 2, h = w.h + 0.6;
        if (w.mat === 'rock') {
          const n = Math.ceil(L / 2.2), rr = makeRng(Math.round(mx * 13 + mz * 7));
          for (let i = 0; i <= n; i++) { const u = i / n, x = w.ax + (w.bx - w.ax) * u, z = w.az + (w.bz - w.az) * u, hh = w.h * rr.range(0.75, 1.1); add(rockBoxes[i % 3], rockM, x, S.base + hh * 0.3, z, yaw + rr.range(-0.3, 0.3), (w.t + rr.range(0.5, 1.0)) * 0.6, hh * 0.62, rr.range(1.4, 1.9), rr.range(-0.08, 0.08), rr.range(-0.1, 0.1)); }
          continue;
        }
        const wm = w.mat === 'block' ? block : conc;
        add(box, wm, mx, S.base - 0.6 + h / 2, mz, yaw, w.t, h, L + w.t);
        // spalled concrete heaped at the foot, a broken notch or two out of the top edge (drawn as fallen pieces), a rusted plate
        const fx = Math.cos(yaw), fz = -Math.sin(yaw);      // the wall's face normal
        for (let i = 0, n = lo ? 0 : Math.round(L / 2.5); i < n; i++) { const u = rrS.range(-0.45, 0.45), sd = rrS() < 0.5 ? -1 : 1, off = w.t / 2 + rrS.range(0.1, 0.5), x = mx + Math.sin(yaw) * u * L + fx * off * sd, z = mz + Math.cos(yaw) * u * L + fz * off * sd, sz = rrS.range(0.08, 0.22);
          add(chunk, wm, x, terrain.height(x, z) + sz * 0.2, z, rrS() * 6, sz * 1.4, sz * 0.7, sz); }
        if (L > 3 && rrS() < 0.7) { const u = rrS.range(-0.3, 0.3), sd = rrS() < 0.5 ? -1 : 1, x = mx + Math.sin(yaw) * u * L + fx * (w.t / 2 + 0.015) * sd, z = mz + Math.cos(yaw) * u * L + fz * (w.t / 2 + 0.015) * sd;
          add(box, rust, x, S.base + Math.min(h - 0.9, 1.6), z, yaw, 0.03, 0.42, 0.62, 0, rrS.range(-0.06, 0.06)); }
      }
      for (const w of S.slabs || []) {      // lintels over doorways and windows (roof and pipe crown are drawn whole below)
        if (w.mat === 'roof' || w.mat === 'pipe') continue;
        add(box, w.mat === 'block' ? block : conc, (w.ax + w.bx) / 2, S.base + (w.y0 + w.y1) / 2, (w.az + w.bz) / 2, Math.atan2(w.bx - w.ax, w.bz - w.az), w.t, w.y1 - w.y0, Math.hypot(w.bx - w.ax, w.bz - w.az));
      }
      if (S.kind === 'shed') {
        // a timber roof on the concrete box: joists along the roof runs the colliders use, weathered boards nailed across them
        const loc = (lx, lz) => [S.cx + lx * Math.cos(S.yaw) + lz * Math.sin(S.yaw), S.cz - lx * Math.sin(S.yaw) + lz * Math.cos(S.yaw)];
        add(box, conc, S.cx, S.base + S.h - 0.02, S.cz, S.yaw, S.hw * 2 + 0.6, 0.12, S.hd * 2 + 0.6);      // ring beam
        for (let lx = -S.hw; lx <= S.hw + 0.01; lx += 0.7) { const [x, z] = loc(lx, 0); add(box, wood, x, S.base + S.h + 0.12, z, S.yaw, 0.12, 0.2, S.hd * 2 + 0.7, 0, rrS.range(-0.02, 0.02)); }
        for (let lz = -S.hd - 0.3; lz <= S.hd + 0.3; lz += rrS.range(0.21, 0.26)) { const [x, z] = loc(rrS.range(-0.05, 0.05), lz);
          add(box, wood, x, S.base + S.h + 0.245 + rrS.range(-0.008, 0.008), z, S.yaw + rrS.range(-0.012, 0.012), S.hw * 2 + 0.7 + rrS.range(-0.15, 0.1), 0.035, rrS.range(0.18, 0.23), rrS.range(-0.02, 0.02), rrS.range(-0.015, 0.015)); }
        // a fascia board along each long edge
        for (const e of [-1, 1]) { const [x, z] = loc(0, e * (S.hd + 0.37)); add(box, wood, x, S.base + S.h + 0.15, z, S.yaw, S.hw * 2 + 0.75, 0.24, 0.035); }
      }
      if (S.kind === 'culvert') {
        const pipe = new THREE.CylinderGeometry(1.25, 1.25, S.hd * 2, 20, 1, true); pipe.rotateX(Math.PI / 2);
        const inner = new THREE.CylinderGeometry(1.05, 1.05, S.hd * 2, 20, 1, true); inner.rotateX(Math.PI / 2);
        add(pipe, conc, S.cx, S.base + 0.85, S.cz, S.yaw); const im = add(inner, culvertIn || (culvertIn = concMat(0x55534c)), S.cx, S.base + 0.85, S.cz, S.yaw); im.material.side = THREE.BackSide;
        for (const e of [1, -1]) add(new THREE.RingGeometry(1.05, 1.25, 20), conc, S.cx + Math.sin(S.yaw) * S.hd * e, S.base + 0.85, S.cz + Math.cos(S.yaw) * S.hd * e, S.yaw);
      }
      if (S.kind === 'tower') {
        const loc = (lx, lz) => [S.cx + lx * Math.cos(S.yaw) + lz * Math.sin(S.yaw), S.cz - lx * Math.sin(S.yaw) + lz * Math.cos(S.yaw)];
        for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const [x, z] = loc(i * S.hw, j * S.hd); add(box, wood, x, S.base + S.h / 2 - 0.3, z, S.yaw, 0.28, S.h + 0.6, 0.28); }
        add(box, wood, S.cx, S.base + S.h - 0.1, S.cz, S.yaw, S.hw * 2 + 0.5, 0.18, S.hd * 2 + 0.5);
        for (const [i, j, w2, d2] of [[0, 1, 2, 0], [0, -1, 2, 0], [1, 0, 0, 2], [-1, 0, 0, 2]]) { const [x, z] = loc(i * (S.hw + 0.2), j * (S.hd + 0.2)); add(box, wood, x, S.base + S.h + 0.6, z, S.yaw, w2 ? S.hw * 2 + 0.4 : 0.08, 0.08, d2 ? S.hd * 2 + 0.4 : 0.08); }
        const ly = S.base + S.h / 2; for (const sd of [-0.3, 0.3]) { const [x, z] = loc(sd, S.hd + 0.35); add(box, wood, x, ly - 0.3, z, S.yaw, 0.07, S.h + 0.6, 0.07, -0.08); }
        for (let r2 = 0.4; r2 < S.h; r2 += 0.4) { const [x, z] = loc(0, S.hd + 0.35); add(box, wood, x, S.base + r2, z, S.yaw, 0.6, 0.05, 0.05); }
        for (const [i, j] of [[-1, -1], [1, 1]]) { const [x, z] = loc(i * S.hw * 0.5, j * S.hd * 0.5); add(box, wood, x, S.base + S.h * 0.45, z, S.yaw + (i > 0 ? 0.785 : -0.785), 0.1, 0.1, S.hw * 2.8, 0.9, 0); }
      }
    }
    const buckets = new Map();
    for (const m of pending) {
      m.updateMatrix(); const g = m.geometry, key = m.material.uuid + '|' + Object.keys(g.attributes).sort().join(',') + (g.index ? '|i' : '|n');
      (buckets.get(key) || buckets.set(key, []).get(key)).push(m);
    }
    for (const list of buckets.values()) {
      const mg = mergeGeometries(list.map((m) => { const g = m.geometry.clone().applyMatrix4(m.matrix), pp = g.attributes.position, gy = new Float32Array(pp.count);
        for (let i = 0; i < pp.count; i++) gy[i] = terrain.height(pp.getX(i), pp.getZ(i));      // the ground under each vertex: damp rises from it
        g.setAttribute('gy', new THREE.BufferAttribute(gy, 1)); return g; }), false);
      if (!mg) { for (const m of list) scene.add(m); continue; }
      const mm = new THREE.Mesh(mg, list[0].material); mm.castShadow = mm.receiveShadow = true; scene.add(mm);
    }
  }
  // fern fronds: an arching strip with leaflets, eight to a plant
  const ftex = canvasTex(128, (g, S) => {
    g.clearRect(0, 0, S, S); g.strokeStyle = 'rgb(120,140,80)'; g.lineWidth = 2; g.beginPath(); g.moveTo(S / 2, S); g.lineTo(S / 2, 0); g.stroke();
    for (let y = 4; y < S; y += 4) { const w = (S / 2 - 4) * Math.sin(Math.PI * (1 - y / S)) ** 0.6, v = 120 + ((y * 37) % 70); g.fillStyle = `rgb(${v * 0.62 | 0},${v | 0},${v * 0.42 | 0})`; for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(S / 2, y); g.quadraticCurveTo(S / 2 + sd * w * 0.6, y - 5, S / 2 + sd * w, y - 7); g.quadraticCurveTo(S / 2 + sd * w * 0.5, y - 1, S / 2, y + 2); g.fill(); } }
  });
  const frondGeo = (() => {
    const P = [], Uu = [], I = [], seg = lo ? 4 : 5, F = lo ? 6 : 9, rr = makeRng(21);
    for (let f = 0; f < F; f++) {
      const yaw = (f / F) * 6.283 + rr() * 0.4, rise = rr.range(0.9, 1.35), L = rr.range(0.85, 1.15), base = P.length / 3, twist = (rr() - 0.5) * 0.6;
      for (let kk = 0; kk <= seg; kk++) {
        const u = kk / seg, fwd = u * L, up = L * rise * u * (1.05 - 0.95 * u), w = 0.2 * Math.sin(Math.PI * Math.min(1, u * 1.1 + 0.05)) ** 0.7, tw = twist * u;
        for (const sd of [-1, 1]) { const lx = sd * w * Math.cos(tw), ly = sd * w * Math.sin(tw); P.push(Math.sin(yaw) * fwd + Math.cos(yaw) * lx, up + ly, Math.cos(yaw) * fwd - Math.sin(yaw) * lx); Uu.push(sd < 0 ? 0 : 1, u); }
        if (kk) { const a = base + (kk - 1) * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }      // one winding, drawn double-sided with the normal kept up: lit from the sky on either face
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(Uu, 2)); g.setIndex(I);
    const n = new Float32Array(P.length); for (let i = 0; i < n.length; i += 3) { n[i + 1] = 1; } g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    return g;
  })();
  const fernTint = uniform(new THREE.Color(0xb4c48c));
  const fernMat = (() => {
    const m = new THREE.MeshStandardNodeMaterial({ alphaTest: 0.4, roughness: 0.95, side: THREE.DoubleSide });
    m.normalNode = normalize(transformNormalToView(normalLocal));
    const tx = texture(ftex, uv());
    m.colorNode = tx.rgb.mul(fernTint).mul(mix(float(0.5), float(1.1), uv().y.oneMinus().mul(0.4).add(positionLocal.y.mul(0.8)).min(1)));
    m.opacityNode = tx.a;
    m.roughnessNode = float(0.9);
    const ph = hash(instanceIndex).mul(6.283), ip4 = attribute('ipos', 'vec4'), ip = ip4.xy, wd = U.wind.div(U.wind.length().max(0.01));
    const gust = sin(dot(ip, wd).mul(0.16).sub(time.mul(U.wind.length().mul(0.55).add(0.6)))).mul(0.5).add(0.5);
    const sw = gust.mul(gust).mul(0.12).add(0.025).add(sin(time.mul(3.1).add(ph).add(positionLocal.x.mul(4))).mul(0.014));
    // pressed by whatever walks through (cycad crowns, w < 0, stand above it); offsets in world, turned into the plant's frame
    const tr = trampleAt(ip).mul(step(0, ip4.w)), ly = positionLocal.y, l2 = ly.mul(ly);
    const off = U.wind.mul(sw).mul(2.5).add(tr.xy.mul(1.1)).mul(l2), ca = cos(ip4.z), sa = sin(ip4.z);
    const lo2 = vec2(off.x.mul(ca).sub(off.y.mul(sa)), off.x.mul(sa).add(off.y.mul(ca)));
    const spread = float(1).add(tr.z.mul(0.25));
    m.positionNode = vec3(positionLocal.x.mul(spread).add(lo2.x), ly.mul(oneMinus(tr.z.mul(0.6))), positionLocal.z.mul(spread).add(lo2.y));
    return m;
  })();
  const NF = lo ? 380 : 1800, fpos = new Float32Array(NF * 5);      // x, z, scale, rotation, (unused)
  const fernGeo = frondGeo.clone(), ferns = new THREE.InstancedMesh(fernGeo, fernMat, NF);
  {
    let n = 0;
    const cv = terrain.cover;
    while (n < NF) {
      let x, z, sc;
      if (n < NF * 0.78 && cv.length) { const c = cv[n % cv.length], a = r() * 6.283, d = Math.sqrt(r()) * c.r; x = c.x + Math.sin(a) * d; z = c.z + Math.cos(a) * d; sc = r.range(1.1, 1.9) * (1 - 0.35 * d / c.r); }
      else { const a = r() * 6.283, d = Math.sqrt(r()) * (terrain.arena + 20); x = Math.sin(a) * d; z = Math.cos(a) * d; sc = r.range(0.6, 1.1); if (ARENA && terrain.paddock.inWood && !terrain.paddock.inWood(x, z) && r() < 0.85) continue; }
      if (plantless(x, z) || terrain.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r * (o.kind === 'tree' ? 1.2 : 0.8) + (o.kind === 'wall' ? 0.5 : 0)) || (terrain.insideStructure(x, z) && terrain.insideStructure(x, z).kind !== 'pen')) continue;
      fpos.set([x, z, sc, r() * 6.283, 0], n * 5);
      k.setHSL(0.2 + r() * 0.07, 0.3 + r() * 0.2, 0.42 + r() * 0.18); ferns.setColorAt(n, k); n++;
    }
  }
  // cycads: a stout scaly trunk under a crown of stiff fronds, beside the rock
  {
    const cyc = [];
    for (const o of terrain.obstacles) if (o.cycads) cyc.push(...o.cycads);
    const cgeo = new THREE.CylinderGeometry(0.26, 0.38, 1, lo ? 7 : 10, lo ? 1 : 5).translate(0, 0.5, 0);
    { const pp = cgeo.attributes.position; for (let i = 0; i < pp.count; i++) { const y = pp.getY(i), a = Math.atan2(pp.getX(i), pp.getZ(i)), f = 1 + 0.12 * Math.sin(y * 28 + a * 3); pp.setX(i, pp.getX(i) * f); pp.setZ(i, pp.getZ(i) * f); } cgeo.computeVertexNormals(); }
    // a cycad's trunk is grey-brown armour of old leaf bases, not red bark: its own darker, cooler tint, banded by the scales
    const cycMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
    {
      const bt = tri(TX.bark, 0.9).rgb, sc = sin(positionWorld.y.mul(28)).mul(0.5).add(0.5);
      cycMat.colorNode = mix(vec3(0.16, 0.14, 0.11), vec3(dot(bt, vec3(0.33))).mul(vec3(0.62, 0.58, 0.5)), TX.bark.on).mul(float(0.75).add(sc.mul(0.35))).mul(mix(float(1), float(0.6), U.wet));
      cycMat.roughnessNode = mix(float(0.9), float(0.55), U.wet);
    }
    const ct = new THREE.InstancedMesh(cgeo, cycMat, cyc.length);
    const cg2 = frondGeo.clone(), cip = new Float32Array(Math.max(1, cyc.length) * 4); cyc.forEach(([x, z, , ry], i) => cip.set([x, z, ry, -1], i * 4));
    cg2.setAttribute('ipos', new THREE.InstancedBufferAttribute(cip, 4));
    const cc = new THREE.InstancedMesh(cg2, fernMat, cyc.length);
    cyc.forEach(([x, z, h, ry], i) => { const y = terrain.height(x, z) - 0.1; m4.compose(t.set(x, y, z), q.setFromAxisAngle(s.set(0, 1, 0), ry), s.set(1, h, 1)); ct.setMatrixAt(i, m4); m4.compose(t.set(x, y + h - 0.1, z), q, s.set(2.3, 1.6, 2.3)); cc.setMatrixAt(i, m4); k.setHSL(0.2, 0.35, 0.4); cc.setColorAt(i, k); });
    ct.castShadow = cc.castShadow = !lo; scene.add(ct, cc);
  }
  // tree ferns (Dicksonia-like): a shaggy fibrous trunk under a parasol of long fronds, crowding the Wood's understorey.
  // They stand tight against the big trunks and the outcrops (inside what is already solid), so nothing walk-through looks solid.
  {
    const PD = terrain.paddock, spots = [], rr = makeRng(91);
    const solid = ARENA ? [] : terrain.obstacles.filter((o) => o.kind === 'tree' || o.parts);
    for (const o of solid) {
      const wood = PD && PD.inWood && PD.inWood(o.x, o.z), n = o.kind === 'tree' ? (wood ? (lo ? 1 : 2) : (rr() < 0.25 ? 1 : 0)) : (wood ? 2 : rr() < 0.4 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const a = rr() * 6.283, d = o.kind === 'tree' ? o.r + 0.18 : (o.r || 1.5) * 0.85, x = o.x + Math.sin(a) * d, z = o.z + Math.cos(a) * d;
        if (terrain.depthAt && terrain.depthAt(x, z) > 0) continue;
        spots.push([x, z, rr.range(1.8, wood ? 4.2 : 2.8), rr() * 6.283, (rr() - 0.5) * 0.25]);
      }
    }
    if (spots.length) {
      const tg = new THREE.CylinderGeometry(0.13, 0.2, 1, lo ? 6 : 8, lo ? 2 : 6).translate(0, 0.5, 0);
      { const pp = tg.attributes.position; for (let i = 0; i < pp.count; i++) { const y = pp.getY(i), a = Math.atan2(pp.getX(i), pp.getZ(i)), f = 1 + 0.18 * Math.abs(Math.sin(y * 19 + a * 5)) + 0.25 * Math.max(0, y - 0.85) * 4; pp.setX(i, pp.getX(i) * f); pp.setZ(i, pp.getZ(i) * f); } tg.computeVertexNormals(); }
      const tfm = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
      { const n = mx_noise_float(positionWorld.mul(vec3(9, 2.5, 9))), fib = sin(positionWorld.y.mul(40).add(n.mul(4))).mul(0.5).add(0.5);
        tfm.colorNode = mix(vec3(0.075, 0.05, 0.03), vec3(0.16, 0.11, 0.065), fib.mul(0.6).add(n.mul(0.4))).mul(mix(float(1), float(0.65), U.wet));
        tfm.normalNode = bumpNormal(fib.mul(0.012).add(n.mul(0.01)), 1); }
      const tt = new THREE.InstancedMesh(tg, tfm, spots.length), cg = frondGeo.clone(), cip = new Float32Array(spots.length * 4);
      spots.forEach(([x, z, , ry], i) => cip.set([x, z, ry, -1], i * 4)); cg.setAttribute('ipos', new THREE.InstancedBufferAttribute(cip, 4));
      const tc = new THREE.InstancedMesh(cg, fernMat, spots.length), e2 = new THREE.Euler();
      spots.forEach(([x, z, h, ry, lean], i) => {
        const y = terrain.height(x, z) - 0.1; q.setFromEuler(e2.set(lean, ry, lean * 0.5, 'YXZ'));
        m4.compose(t.set(x, y, z), q, s.set(1, h, 1)); tt.setMatrixAt(i, m4);
        const top = new THREE.Vector3(0, h, 0).applyQuaternion(q);
        m4.compose(t.set(x + top.x, y + top.y - 0.15, z + top.z), q.setFromAxisAngle(s.set(0, 1, 0), ry), s.set(3.1, 1.25, 3.1)); tc.setMatrixAt(i, m4);
        k.setHSL(0.21 + rr() * 0.05, 0.38, 0.36 + rr() * 0.1); tc.setColorAt(i, k);
      });
      tt.castShadow = tc.castShadow = !lo; tt.receiveShadow = true; scene.add(tt, tc);
    }
  }
  // horsetails (Equisetum): dense clumps of jointed green stems on the wet ground by the pond, the stream and in the Wood
  if (!lo) {
    const PD = terrain.paddock, rr = makeRng(57), spots = [];
    const ok = (x, z) => !(plantless(x, z) || terrain.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < (o.r || 1) + 0.3) || terrain.insideStructure(x, z));
    if (PD && PD.pond) for (let i = 0; i < 260 && spots.length < 140; i++) { const a = rr() * 6.283, d = PD.pond.R(PD.pond.x + Math.sin(a), PD.pond.z + Math.cos(a)) + rr.range(1.5, 7), x = PD.pond.x + Math.sin(a) * d, z = PD.pond.z + Math.cos(a) * d; if (ok(x, z)) spots.push([x, z]); }
    if (PD && PD.gully) for (let i = 0; i < 260 && spots.length < 260; i++) { const p0 = PD.gully.at(rr() * PD.gully.len), w = p0.v[3] + rr.range(0.8, 3), sd = rr() < 0.5 ? -1 : 1, x = p0.x - p0.tz * w * sd, z = p0.z + p0.tx * w * sd; if (ok(x, z)) spots.push([x, z]); }
    if (PD && PD.inWood) for (let i = 0; i < 900 && spots.length < 420; i++) { const x = rr.range(-100, 100), z = rr.range(-100, 100); if (Math.hypot(x, z) < 100 && PD.inWood(x, z) && ok(x, z)) spots.push([x, z]); }
    if (spots.length) {
      // a clump: 14 stems, each a thin tapered blade pair; nodes and whorls drawn by the shader along the height
      const P = [], Uv = [], I = [], cr = makeRng(5);
      for (let j = 0; j < 14; j++) {
        const a = cr() * 6.283, d = Math.sqrt(cr()) * 0.35, bx = Math.sin(a) * d, bz = Math.cos(a) * d, hh = cr.range(0.6, 1.3), lx = (cr() - 0.5) * 0.25, lz = (cr() - 0.5) * 0.25, w = 0.022;
        for (const ry of [0, 1.57]) { const cx = Math.cos(ry) * w, cz = Math.sin(ry) * w, b = P.length / 3; P.push(bx - cx, 0, bz - cz, bx + cx, 0, bz + cz, bx + lx - cx * 0.3, hh, bz + lz - cz * 0.3, bx + lx + cx * 0.3, hh, bz + lz + cz * 0.3); Uv.push(0, 0, 1, 0, 0, hh, 1, hh); I.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(Uv, 2)); g.setIndex(I);
      g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(P.length / 3).fill([0, 1, 0]).flat(), 3));
      const hm = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.7 });
      hm.normalNode = normalize(transformNormalToView(vec3(0, 1, 0)));
      const yy = uv().y, node = smoothstep(0.82, 0.97, fract(yy.mul(9))), ph = hash(instanceIndex).mul(6.283);
      hm.colorNode = mix(vec3(0.07, 0.11, 0.035), vec3(0.03, 0.025, 0.015), node).mul(mix(float(0.45), float(1.0), yy.div(1.3))).mul(mix(float(1), float(0.75), U.wet));
      const sw = sin(time.mul(1.7).add(ph)).mul(0.3).add(0.6);
      hm.positionNode = positionLocal.add(vec3(U.wind.x, 0, U.wind.y).mul(sw.mul(positionLocal.y).mul(positionLocal.y).mul(0.06)));
      const hz = new THREE.InstancedMesh(g, hm, spots.length);
      spots.forEach(([x, z], i) => { m4.compose(t.set(x, terrain.height(x, z) - 0.03, z), q.setFromAxisAngle(s.set(0, 1, 0), rr() * 6.283), s.setScalar(rr.range(0.8, 1.4))); hz.setMatrixAt(i, m4); });
      q.identity(); hz.receiveShadow = true; scene.add(hz);
    }
  }
  // trampling: plants near feet and bodies are pressed down and spring back over several seconds
  const flat = { grass: new Map(), fern: new Map() };
  const setFern = (i, f = 0, dx = 0, dz = 0) => {
    const x = fpos[i * 5], z = fpos[i * 5 + 1], sc = fpos[i * 5 + 2];
    q.setFromAxisAngle(t.set(0, 1, 0), fpos[i * 5 + 3]);
    if (f > 0) { const ax = new THREE.Vector3(dz, 0, -dx).normalize(); q.premultiply(new THREE.Quaternion().setFromAxisAngle(ax, 1.15 * f)); }
    m4.compose(t.set(x, terrain.height(x, z) - 0.05, z), q, s.set(sc * (1 + 0.15 * f), sc * (1 - 0.55 * f), sc * (1 + 0.15 * f))); ferns.setMatrixAt(i, m4);
  };
  for (let i = 0; i < NF; i++) setFern(i);
  { const ip = new Float32Array(NF * 4); for (let i = 0; i < NF; i++) ip.set([fpos[i * 5], fpos[i * 5 + 1], fpos[i * 5 + 3], fpos[i * 5 + 2]], i * 4); fernGeo.setAttribute('ipos', new THREE.InstancedBufferAttribute(ip, 4)); }
  ferns.receiveShadow = !lo; ferns.castShadow = !lo; ferns.frustumCulled = false; scene.add(ferns);
  const CELL = 4, grid = (arr, stride, n) => { const G = new Map(); for (let i = 0; i < n; i++) { const key = Math.floor(arr[i * stride] / CELL) * 4096 + Math.floor(arr[i * stride + 1] / CELL); (G.get(key) || G.set(key, []).get(key)).push(i); } return G; };
  const gGrid = grid(gpos, 4, NG), fGrid = grid(fpos, 5, NF);

  // ---- the fence: 6.5 m posts and cables around the paddock, with amber lamps
  const nP = terrain.bound ? 100 : 78, fr = terrain.arena + 13, fb = terrain.bound ? terrain.bound + 0.5 : 0;
  // a square fence (the arena) or the old round one
  const fencePt = (i) => { if (!fb) { const a = (i / nP) * 6.283; return [Math.sin(a) * fr, Math.cos(a) * fr, a]; } const u = (i / nP) * 4, sd = Math.floor(u), f = (u - sd) * 2 - 1; return [[f * fb, fb, 0], [fb, -f * fb, Math.PI / 2], [-f * fb, -fb, 0], [-fb, f * fb, Math.PI / 2]][sd]; };
  const post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 6.5, 0.4).translate(0, 3.25, 0), new THREE.MeshStandardMaterial({ color: 0x3f423d, roughness: 0.7, metalness: 0.3 }), nP);
  wetMats.push([post.material, 0x3f423d, 0.7]);
  const signs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.6, 0.03).translate(0, 2.3, 0.24), new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.5, metalness: 0.1 }), Math.ceil(nP / 3));
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffa13a, fog: false });
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), lampMat, Math.ceil(nP / 3));
  const cable = [];
  for (let i = 0; i < nP; i++) {
    const [x, z, a] = fencePt(i), y = terrain.height(x, z) - 0.2;
    m4.compose(t.set(x, y, z), q.setFromAxisAngle(s.set(0, 1, 0), a), s.set(1, 1, 1)); post.setMatrixAt(i, m4);
    if (i % 3 === 0) { m4.compose(t.set(x, y + 6.7, z), q, s.set(1, 1, 1)); lamps.setMatrixAt(i / 3, m4); m4.compose(t.set(x, y, z), q.setFromAxisAngle(s.set(0, 1, 0), a + Math.PI), s.set(1, 1, 1)); signs.setMatrixAt(i / 3, m4); }
    cable.push([x, y, z]);
  }
  post.castShadow = !lo; scene.add(post, lamps, signs);
  const cvv = [];
  for (let c = 0; c < 7; c++) for (let i = 0; i < nP; i++) { const A = cable[i], B = cable[(i + 1) % nP], h = 0.9 + c * 0.85; cvv.push(A[0], A[1] + h, A[2], B[0], B[1] + h, B[2]); }
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cvv, 3));
  scene.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0x1c1d1b })));

  // ---- rain: streaks animated entirely on the GPU in a box that wraps around the camera
  const NR = lo ? 1400 : 9000, BOX = new THREE.Vector3(lo ? 40 : 52, 26, lo ? 40 : 52);
  const rain = (() => {
    const P = new Float32Array(NR * 4 * 3), S4 = new Float32Array(NR * 4 * 4), I = new Uint32Array(NR * 6), rr = makeRng(8);
    for (let i = 0; i < NR; i++) {
      const sx = rr(), sy = rr(), sz = rr(), sp = 0.85 + rr() * 0.3;
      for (let c = 0; c < 4; c++) { const o = (i * 4 + c); P[o * 3] = c & 1 ? 1 : -1; P[o * 3 + 1] = c >> 1; P[o * 3 + 2] = 0; S4.set([sx, sy, sz, sp], o * 4); }
      I.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2], i * 6);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('seed', new THREE.BufferAttribute(S4, 4)); g.setIndex(new THREE.BufferAttribute(I, 1));
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    const seed = attribute('seed', 'vec4'), box = vec3(BOX.x, BOX.y, BOX.z), fall = float(lo ? 11 : 13).mul(seed.w);
    const vel = vec3(U.wind.x.mul(3.4), fall.negate(), U.wind.y.mul(3.4));
    const raw = seed.xyz.mul(box).add(vel.mul(time)).sub(cameraPosition).add(box.mul(0.5));
    const wrapped = raw.sub(floor(raw.div(box)).mul(box)).sub(box.mul(0.5)).add(cameraPosition).add(vec3(0, 3, 0));
    const axis = normalize(vel), toCam = normalize(cameraPosition.sub(wrapped)), side = normalize(cross(axis, toCam));
    const corner = positionGeometry, len = float(lo ? 0.7 : 0.55), wid = float(lo ? 0.012 : 0.008);
    m.positionNode = wrapped.add(side.mul(corner.x).mul(wid)).add(axis.mul(corner.y.sub(0.5)).mul(len.mul(-1)));
    // dim near the eye (a streak inches away is a blur, not a line), fade at the box edge; brighter when lightning hits
    const dCam = length(wrapped.sub(cameraPosition)), along = corner.y;
    const fade = smoothstep(0.6, 3.0, dCam).mul(oneMinus(smoothstep(BOX.x * 0.3, BOX.x * 0.5, dCam)));
    const lit = vec3(U.fog).mul(0.7).add(vec3(0.6, 0.65, 0.75).mul(U.flash).mul(2.5)).add(0.04);
    const mid = oneMinus(abs(corner.x));
    m.colorNode = lit.mul(fade).mul(U.rain).mul(along.mul(0.7).add(0.3)).mul(lo ? 0.75 : 0.65).mul(mid.mul(0.5).add(0.5));
    m.opacityNode = float(1);
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 2; scene.add(mesh); return mesh;
  })();

  // ---- blown leaves and seeds: specks tumbling downwind at the wind's speed, the plainest sign of where it is going
  {
    const NL = lo ? 160 : 700, BX = new THREE.Vector3(36, 9, 36);
    const P = new Float32Array(NL * 4 * 3), S4 = new Float32Array(NL * 4 * 4), I = new Uint32Array(NL * 6), rr = makeRng(19);
    for (let i = 0; i < NL; i++) {
      const sd = [rr(), rr(), rr(), rr()];
      const V4 = [[0, -0.6], [0.32, 0], [-0.32, 0], [0, 0.6]]; for (let c = 0; c < 4; c++) { const o = i * 4 + c; P[o * 3] = V4[c][0]; P[o * 3 + 1] = V4[c][1]; S4.set(sd, o * 4); }
      I.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2], i * 6);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('seed', new THREE.BufferAttribute(S4, 4)); g.setIndex(new THREE.BufferAttribute(I, 1));
    const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.8 });
    const sd = attribute('seed', 'vec4'), box = vec3(BX.x, BX.y, BX.z), ws = U.wind.length().mul(3);
    const ph = sd.w.mul(6.283), tt = time.add(sd.w.mul(40));
    // carried at the wind's speed, eddying, settling slowly
    const vel = vec3(U.wind.x.mul(3.2), float(-0.45).sub(sd.z.mul(0.3)), U.wind.y.mul(3.2));
    const wob = vec3(sin(tt.mul(1.3).add(ph)), sin(tt.mul(2.1).add(ph)).mul(0.5), cos(tt.mul(1.1).add(ph))).mul(ws.mul(0.12).add(0.15));
    const raw = sd.xyz.mul(box).add(vel.mul(time)).add(wob).sub(cameraPosition).add(box.mul(0.5));
    const wrapped = raw.sub(floor(raw.div(box)).mul(box)).sub(box.mul(0.5)).add(cameraPosition).add(vec3(0, 1.5, 0));
    // tumble: spin the little quad about a seeded axis
    const a = tt.mul(sd.x.mul(6).add(3)), ca = cos(a), sa = sin(a), c = positionGeometry.mul(0.07);
    const local = vec3(c.x.mul(ca), c.y, c.x.mul(sa)), b2 = sd.y.mul(6.283), lr = vec3(local.x.mul(cos(b2)).sub(local.y.mul(sin(b2))), local.x.mul(sin(b2)).add(local.y.mul(cos(b2))), local.z);
    m.positionNode = wrapped.add(lr);
    m.colorNode = mix(vec3(0.16, 0.12, 0.06), vec3(0.22, 0.26, 0.1), sd.x).mul(mix(float(1), float(0.6), U.wet));
    m.normalNode = normalize(transformNormalToView(vec3(sa, 0.6, ca)));
    const leaves = new THREE.Mesh(g, m); leaves.frustumCulled = false; scene.add(leaves);
  }

  // ---- low mist: big soft sheets that drift downwind through the trees and over the grass (high tier)
  const mist = [];
  if (!lo) {
    const mtex = canvasTex(128, (g, S) => { const rr = makeRng(29); g.clearRect(0, 0, S, S); for (let i = 0; i < 40; i++) { const x = S * (0.2 + rr() * 0.6), y = S * (0.35 + rr() * 0.3), rad = S * (0.1 + rr() * 0.2), gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); } });
    for (let i = 0; i < 36; i++) {
      const m = new THREE.SpriteMaterial({ map: mtex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: true });
      const sp = new THREE.Sprite(m); sp.scale.set(16 + r() * 14, 5 + r() * 4, 1); sp.material.rotation = (r() - 0.5) * 0.2;
      sp.userData = { ox: (r() - 0.5) * 120, oz: (r() - 0.5) * 120, h: 0.6 + r() * 1.8, a: 0.35 + r() * 0.65 };
      scene.add(sp); mist.push(sp);
    }
  }

  // ---- environment light for reflections and sky fill: a small image of the current sky, re-filtered when the mood changes
  let pmrem = null, envRT = null, envDirty = true;
  const envScene = new THREE.Scene();
  const envMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
  { const dir = normalize(positionLocal), y = dir.y; envMat.colorNode = mix(mix(vec3(U.fog).mul(0.5), vec3(U.hor), smoothstep(-0.3, 0.0, y)), vec3(U.top).mul(0.5).add(vec3(U.cloud).mul(0.6)), smoothstep(0.0, 0.6, y)).add(vec3(U.sunCol).mul(pow(max(dot(dir, U.sunDir), 0), 8)).mul(U.sunGlow).mul(0.5)); }
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), envMat));

  let mood = MOODS.storm, flash = 0, nextFlash = 5, pulses = [], time0 = 0, boltT = 0;
  const white = new THREE.Color(0xcfd8ff), cFog = new THREE.Color(), flashDir = new THREE.Vector3();

  const windV = new THREE.Vector2(2.4, 1.2);
  const api = {
    /** The simulation's wind (m/s, x and z): what carries scent also bends the grass and slants the rain. */
    setWind(w) { windV.set(w.x, w.z); },
    get wind() { return windV; },
    ground, moodKey: 'storm', flash: false, debugFlash: null,
    /** True while the arena's downloaded assets have not yet replaced the blockout (tests wait on it). */
    dressPending: () => !!(features && features.pending), features,
    get light() { return { storm: 0.7, dusk: 0.75, day: 1 }[api.moodKey]; },
    get mood() { return mood; },
    setMood(key) {
      mood = MOODS[key]; api.moodKey = key;
      U.top.value.setHex(mood.top); U.hor.value.setHex(mood.hor); U.fog.value.setHex(mood.fog); U.cloud.value.setHex(mood.cloud); cFog.setHex(mood.fog);
      U.dens.value = mood.dens; U.low.value = mood.low; U.cov0.value = mood.cov[0]; U.cov1.value = mood.cov[1]; U.sunGlow.value = mood.sunGlow;
      U.sunCol.value.setHex(mood.glow ?? mood.sun[0]); U.wet.value = mood.wet; U.rain.value = mood.rain;
      scene.fog.density = mood.dens; hemi.color.setHex(mood.hemi[0]); hemi.groundColor.setHex(mood.hemi[1]);
      sun.color.setHex(mood.sun[0]); sunDir.set(...mood.dir).normalize(); U.sunDir.value.copy(sunDir);
      grassTint.value.setHex(0x9a9868).multiplyScalar(1 - 0.3 * mood.wet); fernTint.value.setHex(0x9fb07a).multiplyScalar(1 - 0.3 * mood.wet);
      for (const [m, hex, rgh] of wetMats) { m.color.setHex(hex).multiplyScalar(1 - 0.4 * mood.wet); m.roughness = rgh - 0.45 * mood.wet; }
      rim.color.setHex(mood.rim[0]); rim.intensity = mood.rim[1]; rain.visible = mood.rain > 0;
      lampMat.color.setHex(0xffa13a).multiplyScalar(mood.rain ? (lo ? 1 : 5) : key === 'dusk' ? (lo ? 0.8 : 3) : 0.6);
      scene.environmentIntensity = mood.env; envDirty = true;
      nextFlash = 4;
    },
    followLight(x, y, z) { sun.target.position.set(x, y, z); sun.position.set(x, y, z).addScaledVector(lightDir.lengthSq() ? lightDir : sunDir, 120); sun.target.updateMatrixWorld(); rim.target.position.set(x, y, z); rim.position.set(x - sunDir.x * 50, y + 18, z - sunDir.z * 50); rim.target.updateMatrixWorld(); },
    /** The running quality level's knobs (src/view/quality.js PROFILE): instance counts, shadow map and casters, rain, mist,
     *  tree LOD reach. Counts only ever shrink from what was built (the light build has no meadow and fewer of everything). */
    setQuality(P) {
      grass.count = Math.max(1, Math.round(NG * (lo ? 1 : P.grass)));
      if (meadow) { const n = Math.min(NM, P.meadow); meadow.visible = n > 0; meadow.count = Math.max(1, n); meadowBox.value = P.box; }
      ferns.count = Math.max(1, Math.round(NF * (lo ? 1 : P.ferns))); ferns.castShadow = !lo && P.small;
      rocks.castShadow = !lo && P.small;
      for (const m of perim) m.castShadow = !lo && P.far;
      rain.geometry.setDrawRange(0, Math.round(NR * (lo ? 1 : P.rain)) * 6);
      mist.forEach((sp, i) => { sp.visible = i < P.mist; });
      if (!lo) { sun.shadow.mapSize.set(P.shadow, P.shadow); sc2.left = sc2.bottom = -P.extent; sc2.right = sc2.top = P.extent; sc2.updateProjectionMatrix(); }
      if (features && features.setQuality) features.setQuality(P);
    },
    /** Returns true on the frame a lightning strike begins. */
    update(dt, camera, renderer) {
      if (features && features.update) features.update(dt, camera);
      time0 += dt; let struck = false;
      if (renderer && envDirty && !lo) {
        envDirty = false;
        try { if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer); const rt = pmrem.fromScene(envScene, 0.02, 0.1, 100, { size: 64 }); if (envRT) envRT.dispose(); envRT = rt; scene.environment = rt.texture; } catch (e) { console.warn('env', e); }
      }
      if (mood.rain && dt > 0) {
        nextFlash -= dt;
        if (nextFlash <= 0) {
          nextFlash = 7 + r() * 16; pulses = [0, 0.09 + r() * 0.08, 0.3 + r() * 0.2].map((d) => time0 + d); struck = true;
          const a = r() * 6.283, d = 380 + r() * 260; flashDir.set(Math.sin(a), 0.32 + r() * 0.25, Math.cos(a)).normalize();
          makeBolt(camera.position.x + Math.sin(a) * d, camera.position.z + Math.cos(a) * d, camera); boltT = 0.55;
        }
      }
      sky.position.copy(camera.position);
      if (mist.length) {
        const cx = camera.position.x, cz = camera.position.z, W = 120, dens = { storm: 0.6, dusk: 0.5, day: 0.25 }[api.moodKey] ?? 0.4;
        for (const sp of mist) {
          if (!sp.visible) continue;
          const u = sp.userData; u.ox += windV.x * dt * 0.8; u.oz += windV.y * dt * 0.8;
          const x = cx + ((u.ox - cx) % W + W * 1.5) % W - W / 2, z = cz + ((u.oz - cz) % W + W * 1.5) % W - W / 2, d = Math.hypot(x - cx, z - cz);
          sp.position.set(x, terrain.height(x, z) + u.h + sp.scale.y * 0.25, z);
          sp.material.color.copy(U.fog.value).multiplyScalar(1.15 + flash * 0.6);
          const pn = terrain.paddock ? terrain.paddock.placeName(x, z) : '', built = /barn|warehouse|containers|yard|ruins|gatehouse|silo|loft/.test(pn);      // no sheets over the made ground: they read as a pale slab against a wall
          sp.material.opacity = (built ? 0 : 1) * u.a * dens * Math.min(1, Math.max(0, (d - 6) / 10)) * Math.min(1, Math.max(0, (W / 2 - d) / 12));
        }
      }
      U.fogBase.value = Math.min(camera.position.y - 2.5, terrain.height(camera.position.x, camera.position.z) - 0.8);      // ground mist lies on the ground, wherever the eye is
      // plants springing back
      relax(dt);
      while (pulses.length && pulses[0] <= time0) { pulses.shift(); flash = 1; }
      if (api.debugFlash != null) flash = api.debugFlash;
      api.flash = flash > 0.3;
      flash = Math.max(0, flash - dt * 5.5); boltT = Math.max(0, boltT - dt);
      bolt.visible = boltT > 0 && flash > 0.15 && !!bolt.geometry.attributes.position && bolt.geometry.index && bolt.geometry.index.count > 0; boltMat.opacity = Math.min(1, flash * 1.5);
      U.flash.value = flash; U.flashDir.value.copy(flashDir);
      // the strike lights the paddock from where it fell: the key light swings toward the bolt for the flash
      if (flash > 0.02) { lightDir.copy(sunDir).lerp(flashDir, Math.min(1, flash * 1.6)).normalize(); sun.color.setHex(mood.sun[0]).lerp(white, Math.min(1, flash * 1.5)); }
      else if (lightDir.lengthSq()) { lightDir.set(0, 0, 0); sun.color.setHex(mood.sun[0]); }
      hemi.intensity = mood.hemi[2] * (1 + 1.6 * flash); sun.intensity = mood.sun[1] * (1 + 2.2 * flash);
      scene.environmentIntensity = mood.env * (1 + 1.5 * flash);
      k.copy(cFog).lerp(white, flash * 0.55); scene.fog.color.copy(k); scene.background.copy(k);
      U.wind.value.copy(windV).multiplyScalar(1 / 3);
      if (renderer) renderer.toneMappingExposure = mood.exp;
      return struck;
    },
    /** Press plants down around (x, z): k is how hard (a foot 1, a body brushing through 0.5). Returns how much fern was there. */
    trample(x, z, rad, kk) {
      let fern = 0;
      stamp(x, z, rad, kk);
      for (const [G, arr, stride, M] of [[fGrid, fpos, 5, null]]) {
        for (let cx = Math.floor((x - rad) / CELL); cx <= Math.floor((x + rad) / CELL); cx++) for (let cz = Math.floor((z - rad) / CELL); cz <= Math.floor((z + rad) / CELL); cz++) {
          for (const i of G.get(cx * 4096 + cz) || []) {
            const dx = arr[i * stride] - x, dz = arr[i * stride + 1] - z, d = Math.hypot(dx, dz); if (d > rad) continue;
            const f = 0, cur = M;
            fern = Math.max(fern, 1 - d / rad); void f; void cur;
          }
        }
      }
      return fern;
    },
    /** A body moving through the plants (called every few ticks): presses them flat in a wake along its motion. */
    wake(id, x, z, rad) {
      const w = wakes.get(id), now = time0;
      if (w && now > w.t) { const dt = now - w.t, vx = (x - w.x) / dt, vz = (z - w.z) / dt, sp = Math.hypot(vx, vz); if (sp > 0.3 && sp < 40) stamp(x, z, rad, Math.min(0.95, 0.35 + sp * 0.1), vx, vz); }
      wakes.set(id, { x, z, t: now });
    },
    /** The ground was edited near (x, z): move the affected vertices, grass and shading. */
    refresh(x, z, rad) {
      const half = size / 2, i0 = Math.max(0, Math.floor((x - rad + half) / step0)), i1 = Math.min(N, Math.ceil((x + rad + half) / step0));
      const j0 = Math.max(0, Math.floor((z - rad + half) / step0)), j1 = Math.min(N, Math.ceil((z + rad + half) / step0));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) shade(j * (N + 1) + i);
      p.needsUpdate = true; geo.attributes.color.needsUpdate = true; geo.attributes.gd.needsUpdate = true; geo.computeVertexNormals();
      for (let i = 0; i < NG; i++) if (Math.abs(gpos[i * 4] - x) < rad && Math.abs(gpos[i * 4 + 1] - z) < rad) setGrass(i);
      grass.instanceMatrix.needsUpdate = true;
      if (bakeH) bakeH(x - rad, z - rad, x + rad, z + rad);
    },
  };
  api.setMood('storm');
  if (typeof document !== 'undefined' && typeof fetch === 'function') loadAssets();
  return api;
}

/** Weld coincident vertices of a non-indexed position-only geometry. */
function mergeVerts(g) {
  const p = g.attributes.position, map = new Map(), P = [], I = [];
  for (let i = 0; i < p.count; i++) {
    const key = `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
    let j = map.get(key); if (j === undefined) { j = P.length / 3; map.set(key, j); P.push(p.getX(i), p.getY(i), p.getZ(i)); }
    I.push(j);
  }
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); o.setIndex(I); return o;
}
