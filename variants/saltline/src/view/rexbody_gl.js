// The creature's body for a classic THREE.WebGLRenderer (Saltline: Three r180), ported from the current skin
// (/home/claude/rex_rc/src/view/body.js, 14-15 Nov): the same geometry (rexgeo.js: current proportions, legs with their helper
// bones, feet and claws, the corner web sheets, teeth, tongue), the same bone matrices, the same eyes (each ball turned along
// its own line to the gaze target, saccades, lids, brow) and lids. Only the hide's material differs: the WebGPU build's TSL
// node material becomes a MeshStandardMaterial patched with onBeforeCompile (GLSL): vertex paint, painted roughness, wet
// darkening, tubercle and pebble relief from rest-space cell noise (bump by screen derivatives, faded by pixel footprint),
// skin folds where paintRex marks them, a dark lip gap and nostrils, and a fog-coloured rim. Lit, fogged, shadowed and
// tone-mapped by Saltline's renderer like everything else in the yard.
// The gaze target: the integration sets `body.fix` to the sim's LIVE `sim.fix` every frame (see main.js), so a reset of the
// sim (which replaces `sim.fix`) can never leave the eyes on a stale point (the bug body.js works around near its top).
import * as THREE from 'three';
import { RexSim, PS } from '../../../../src/sim/rex.js';
import { buildRexGeometry, paintRex, boneMatrices, BONE_COUNT, BONE, mouthY, EYE, EYE_AIM, eyeAim, WEB, WEBSHEET } from '../../../../src/view/rexgeo.js';

const flat = { height: () => 0, normal: (x, z, o) => { o.x = 0; o.y = 1; o.z = 0; return o; }, arena: 1e4, size: 1e4, addBump() {}, bumps: [] };
export const MAX_VBUF = 16;
export function vertexBufferCount(g) { const s = new Set(); for (const k in g.attributes) { const a = g.attributes[k]; s.add(a.isInterleavedBufferAttribute ? a.data : a); } return s.size; }

const GLSL_NOISE = `
float rx_h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 rx_h33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float rx_noise(vec3 p) {      // value noise, -1..1
  vec3 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(mix(rx_h31(i), rx_h31(i + vec3(1,0,0)), u.x), mix(rx_h31(i + vec3(0,1,0)), rx_h31(i + vec3(1,1,0)), u.x), u.y),
                mix(mix(rx_h31(i + vec3(0,0,1)), rx_h31(i + vec3(1,0,1)), u.x), mix(rx_h31(i + vec3(0,1,1)), rx_h31(i + vec3(1,1,1)), u.x), u.y), u.z);
  return a * 2.0 - 1.0;
}
vec2 rx_worley(vec3 p) {      // F1, F2 of a jittered cell field
  vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z)), o = rx_h33(i + g) * 0.85 + 0.075, r = g + o - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return sqrt(vec2(d1, d2));
}
vec3 rx_bump(vec3 surf_pos, vec3 surf_norm, float h) {      // three's perturbNormalArb, from a height
  vec2 dHdxy = vec2(dFdx(h), dFdy(h));
  vec3 vSigmaX = normalize(dFdx(surf_pos)), vSigmaY = normalize(dFdy(surf_pos)), vN = surf_norm;
  vec3 R1 = cross(vSigmaY, vN), R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}`;

function skinMaterialGL(wet, lo, E, NOS, jaw, fogColor) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  m.name = 'rexSkin';
  const N = NOS || { x: 0.13, y: 0.24, z: 1.66 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWet = wet; sh.uniforms.uJaw = jaw; sh.uniforms.uFog = { value: new THREE.Color(fogColor) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute vec3 rest; attribute vec3 hp; attribute float rough; attribute float scl; attribute float face; attribute float scute; attribute float fold; attribute float fs;
varying vec3 vRest; varying vec3 vHp; varying float vRough; varying float vScl; varying float vFace; varying float vScute; varying float vFold; varying float vFs; varying vec3 vWN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vRest = rest; vHp = hp; vRough = rough; vScl = scl; vFace = face; vScute = scute; vFold = fold; vFs = fs;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vWN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float uWet; uniform float uJaw; uniform vec3 uFog;
varying vec3 vRest; varying vec3 vHp; varying float vRough; varying float vScl; varying float vFace; varying float vScute; varying float vFold; varying float vFs; varying vec3 vWN;
${GLSL_NOISE}
float rx_mouthY(float z) { return -0.13 - 0.17 * (1.0 - smoothstep(0.0, 1.25, z)) - 0.04 * exp(-pow((z - 0.95) / 0.34, 2.0)) + 0.014 * exp(-pow((z - 1.5) / 0.1, 2.0)); }
float rx_px; float rx_fade(float f) { return 1.0 - smoothstep(0.1, 0.36, rx_px * f); }
float rx_h; float rx_detail; float rx_dark; float rx_body; float rx_rgh; float rx_inMouth; float face0;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  rx_px = length(fwidth(vRest));
  float face = clamp(vFace, 0.0, 1.0), body = 1.0 - face; face0 = face; float foldM = max(vFold, 0.0), web = smoothstep(0.5, 0.9, max(-vFold, 0.0));
  float scute = max(vScute, 0.0), horn = clamp(-vScute, 0.0, 1.0);
  float fB = rx_fade(${lo ? '12.0' : '20.0'}), fN = rx_fade(${lo ? '21.0' : '42.0'}), fF = rx_fade(14.0), fU = rx_fade(3.3), fM = rx_fade(6.0);
  vec2 big = rx_worley(vRest * ${lo ? '12.0' : '20.0'} + 1.7); float fine = rx_worley(vRest * ${lo ? '21.0' : '42.0'} + 3.1).x;
  float und = rx_noise(vRest * 3.3 + 9.0), mottle = rx_noise(vRest * 1.3 + 4.4) + 0.5 * rx_noise(vRest * 3.1 + 1.2) * rx_fade(3.1);
  float rx_patch = smoothstep(-0.25, 0.35, rx_noise(vRest * 0.9 + 7.1));
  float edge = big.y - big.x, tub = smoothstep(0.0, 0.35, edge) * 0.25 + (1.0 - smoothstep(0.0, 0.85, big.x)) * 0.75, prom = clamp(und * 0.5 + 0.75, 0.35, 1.15);
  float peb = 1.0 - smoothstep(0.05, 0.9, fine), plate = smoothstep(0.0, 0.3, edge) * scute;
  float hBody = mix(tub * prom * 0.0062 * fB, peb * 0.0034 * fN, vScl) + peb * 0.0014 * fN * (1.0 - vScl);
  float hFace = mix(peb * 0.0026 * fN, plate * 0.0032 * fB, scute);
  float wob = sin(vRest.x * 9.0 + vRest.y * 7.0) * 1.2 + sin(vRest.z * 4.0 + vRest.y * 5.0) * 1.6 + und * 3.5;
  float folds = smoothstep(-1.0, 0.55, sin(vFs * 62.0 + wob)) * foldM * fF * smoothstep(-0.35, 0.45, und + sin(vRest.z * 6.0 + vRest.x * 5.0) * 0.35);
  // the face's per-pixel forms (head space): the dark lip gap, the nostril pits, the orbit's shade
  float hx = abs(vHp.x), dy = vHp.y - rx_mouthY(vHp.z);
  float gap = smoothstep(${lo ? '0.056, 0.03' : '0.034, 0.018'}, abs(dy)) * smoothstep(${WEBSHEET.cut0.toFixed(3)}, ${(WEBSHEET.cut0 + 0.06).toFixed(3)}, vHp.z) * (1.0 - web);
  float dn = length(vec3(hx - ${N.x.toFixed(3)}, vHp.y - ${N.y.toFixed(3)}, (vHp.z - ${N.z.toFixed(3)}) * 0.7)), pit = smoothstep(0.06, 0.028, dn);
  float de = length(vec3(hx - ${E.x.toFixed(3)}, vHp.y - ${E.y.toFixed(3)}, vHp.z - ${E.z.toFixed(3)})), orbit = smoothstep(0.24, 0.075, de) * 0.6;
  rx_dark = clamp(pit * 0.85 + gap * 0.75 + orbit * 0.45, 0.0, 0.88) * face;
  rx_inMouth = max(gap, web);
  rx_h = (mix(hBody, hFace, face) + folds * 0.0065 * body + und * 0.012 * fU * body + smoothstep(0.55, 1.0, 1.0 - abs(rx_noise(vRest * 2.4 + 5.5))) * 0.02 * body * (1.0 - fN * 0.5)) * (1.0 - 0.9 * horn) - pit * 0.016 * face;
  rx_detail = mix(mix(tub * fB, peb * fN, vScl), peb * fN, face);
  float tint = 0.97 + (rx_detail - 0.5) * mix(0.08, 0.14, face) + mottle * 0.12 * body + (rx_patch - 0.5) * 0.16 * body + und * 0.05 - (1.0 - folds) * foldM * fF * 0.035;
  diffuseColor.rgb *= tint * (1.0 - rx_dark) * 1.3 * mix(1.0, 0.82, uWet);
  rx_rgh = (0.5 - rx_detail) * 0.12 - uWet * 0.2 + (1.0 - mix(mix(fB, fN, vScl), fN, face)) * 0.1 + length(fwidth(vWN)) * 0.6;
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(vRough + rx_rgh, 0.38, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = rx_bump(-vViewPosition, normal, rx_h);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ vec3 Vv = normalize(vViewPosition); float fr = pow(1.0 - clamp(dot(normal, Vv), 0.0, 1.0), 4.0);
  totalEmissiveRadiance += uFog * fr * mix(0.12, 0.35, uWet) * (1.0 - rx_dark) * (1.0 - rx_inMouth);
  // the sky's bounce on the hide (as the WebGPU skin: a modest lift, most on the shadowed underside), so a dark wet animal
  // still reads against a dusk sky
  vec3 nw = normalize(vWN); totalEmissiveRadiance += vColor.rgb * uFog * ((nw.y * 0.5 + 0.5) * 0.2 + clamp(-nw.y, 0.0, 1.0) * 0.22) * (1.0 - rx_dark * face0); }`);
  };
  m.customProgramCacheKey = () => 'rexSkinGL' + (lo ? 'lo' : 'hi');
  return m;
}

export function irisTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = '#2a1d0c'; g.fillRect(0, 0, 256, 128);
  const cx = 64, cy = 64, gr = g.createRadialGradient(cx, cy, 3, cx, cy, 44);
  // EYES: a brighter amber iris (it was a dull brown that merged with the pupil and the lids' shade beyond ~8 m)
  gr.addColorStop(0, '#e2b24c'); gr.addColorStop(0.35, '#c8902f'); gr.addColorStop(0.75, '#8a5a1a'); gr.addColorStop(1, '#2a1a08');
  g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, 44, 0, 7); g.fill();
  g.strokeStyle = 'rgba(60,30,5,0.5)'; g.lineWidth = 1;
  for (let a = 0; a < 6.28; a += 0.12) { g.beginPath(); g.moveTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8); g.lineTo(cx + Math.cos(a + 0.05) * 42, cy + Math.sin(a + 0.05) * 42); g.stroke(); }
  for (let i = 0; i < 260; i++) { const a = Math.random() * 6.283, r0 = 10 + Math.random() * 30; g.fillStyle = Math.random() < 0.5 ? 'rgba(255,200,90,0.25)' : 'rgba(70,35,5,0.3)'; g.fillRect(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, 2, 2); }
  g.strokeStyle = 'rgba(20,10,2,0.9)'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, 43, 0, 7); g.stroke();      // dark limbal ring
  g.fillStyle = '#030202'; g.beginPath(); g.ellipse(cx, cy, 12, 14, 0, 0, 7); g.fill();     // a round pupil (~17 x 20 degrees of the ball): big enough to read at 8-20 m, still a hunter's eye
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Teeth (and, in the lower set, the tongue) from the sockets the skin builder found along each lip line.
// T. rex teeth are thick, recurved cones, barely flattened; ivory crowns stained toward the gum.
export function teethGeometry(sockets, upper, ridge) {
  const parts = [], cols = [], C = (h) => new THREE.Color(h);
  const ROOT = C(0x8a6a50), STAIN = C(0xa48c66), CROWN = C(0xc2ad84), TIP = C(0xe0d3b0), GUMC = C(0x5a4240);      // aged ivory, stained toward the gum
  const base = new THREE.ConeGeometry(1, 1, 10, 6, true); base.rotateX(Math.PI); base.translate(0, -0.5, 0);          // root at y=0, tip at y=-1
  let seed = upper ? 7 : 13; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  void cols;
  // each socket is where the crown leaves this tier's gum (rexgeo samples the built mesh); the root runs on up (or down) into
  // the jaw from there, straight, so the tooth grows out of the skin with no gap and no exposed root, whatever the grid did
  for (const [x0, yS, z0, len00, rad0, nx, nz] of sockets) for (const sd of [1, -1]) {
    const rad = rad0, len = len00 * (0.85 + 0.3 * rnd()), sink = 0.035 + rad * 0.5, Lt = len + sink;
    const t = base.clone(), p = t.attributes.position, a = Math.atan2(-nz, nx * sd), lean = (rnd() - 0.5) * 0.2, out = (rnd() - 0.3) * 0.08;
    const ca = Math.cos(a), sa = Math.sin(a), col = [], bend = 0.24 + 0.1 * rnd();
    for (let i = 0; i < p.count; i++) {
      const f = -p.getY(i), d = f * Lt - sink, fc = Math.max(0, d / len);      // fc: 0 at the gum, 1 at the tip; the buried root is d < 0
      let lx = p.getX(i) * rad * 0.8, lz = p.getZ(i) * rad;
      // full width at and under the gum, a little swelling just out of it, then the taper to the point
      const sw = upper ? (1 + 0.14 * Math.sin(Math.min(1, fc * 1.8) * Math.PI)) * (1 - 0.4 * fc * fc) : (1 + 0.1 * Math.sin(Math.min(1, fc * 1.8) * Math.PI)) * (1 - 0.45 * fc * fc);
      lx *= sw; lz *= sw;
      let wx = lx * ca + lz * sa, wz = -lx * sa + lz * ca;
      wz -= bend * len * fc * fc - (lean + 0.08) * len * fc;    // recurved: bowed forward out of the gum, hooked back toward the throat at the tip
      wx -= sd * ((0.06 + 0.05 - out) * len * fc * fc + 0.05 * len * fc);      // and leaning in toward the midline
      p.setXYZ(i, x0 * sd + wx, upper ? yS + sink - f * Lt : yS - sink + f * Lt, z0 + wz);
      const c = d < 0 ? ROOT.clone() : fc < 0.12 ? STAIN.clone().lerp(CROWN, fc / 0.12) : CROWN.clone().lerp(TIP, (fc - 0.12) / 0.88);
      col.push(c.r, c.g, c.b);
    }
    t.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    if (!upper) { const ix = t.index.array; for (let i = 0; i < ix.length; i += 3) { const k = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = k; } }   // the lower cone is mirrored in y: restore its winding, or its normals point inward and it renders black
    t.computeVertexNormals();
    // inside-out check: each ring's normals must point away from the ring's centre. A bent, mirrored cone can come out
    // wound the wrong way, and then it is lit from inside and reads as a flat paper card; turn any such tooth right side out
    { const nn = t.attributes.normal, row = 11; let out = 0;
      for (let r = 0; r * row < p.count; r++) { let cx = 0, cy = 0, cz = 0; for (let j = 0; j < row; j++) { const i = r * row + j; cx += p.getX(i); cy += p.getY(i); cz += p.getZ(i); }
        cx /= row; cy /= row; cz /= row; for (let j = 0; j < row; j++) { const i = r * row + j; out += (p.getX(i) - cx) * nn.getX(i) + (p.getY(i) - cy) * nn.getY(i) + (p.getZ(i) - cz) * nn.getZ(i); } }
      if (out < 0) { const ix = t.index.array; for (let i = 0; i < ix.length; i += 3) { const k = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = k; } t.computeVertexNormals(); } }
    parts.push(t.toNonIndexed());
  }
  // the gum: one continuous ridge along the row, from the back of one side round the front to the other, half sunk in the
  // jaw's skin and filling out from the tooth line to just inside the lip, so every crown comes out of the same wet gum
  if (ridge && ridge.length > 2) {
    const path = [...ridge.map((r) => [-r[0], r[1], r[2], -r[3], r[4], r[5]]), ...ridge.slice().reverse().slice(1)];
    const R = 10, pos = [], col = [], idx = [], hgt = upper ? 0.012 : 0.011;
    for (let k = 0; k < path.length; k++) {
      const [x, y0, z, nx, nz, ins] = path[k], w = ins * 0.7, y = y0 + (upper ? 1 : -1) * 0.006;      // a low ridge, mostly sunk, flush with the jaw
      for (let j = 0; j < R; j++) {
        const th = (j / R) * Math.PI * 2, cx = Math.cos(th), cy = Math.sin(th);
        pos.push(x + nx * w * cx, y + cy * hgt, z + nz * w * cx);
        const m = Math.sin(x * 61 + z * 37) * Math.sin(z * 83 - x * 29), c = GUMC.clone().multiplyScalar(0.62 + 0.1 * (upper ? -cy : cy) + 0.12 * m); col.push(c.r, c.g, c.b);      // dark, mottled
      }
      if (k > 0) for (let j = 0; j < R; j++) { const a0 = (k - 1) * R + j, a1 = (k - 1) * R + (j + 1) % R, b0 = k * R + j, b1 = k * R + (j + 1) % R; idx.push(a0, b0, a1, a1, b0, b1); }
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); rg.setIndex(idx);
    rg.computeVertexNormals();
    { const nn = rg.attributes.normal, pp = rg.attributes.position; let o = 0; for (let k = 0; k < path.length; k++) for (let j = 0; j < R; j++) { const i = k * R + j; o += (pp.getX(i) - path[k][0]) * nn.getX(i) + (pp.getY(i) - path[k][1]) * nn.getY(i) + (pp.getZ(i) - path[k][2]) * nn.getZ(i); }
      if (o < 0) { const ix = rg.index.array; for (let i = 0; i < ix.length; i += 3) { const q = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = q; } rg.computeVertexNormals(); } }
    parts.push(rg.toNonIndexed());
  }
  const tparts = [];
  if (!upper) {      // a thick, fleshy tongue lies in the trough of the mouth floor and runs back into the throat
    for (const [sx, sy, sz, y, z, hex] of [[0.17, 0.065, 0.5, mouthY(0.85) - 0.1, 0.82, 0x55291f], [0.16, 0.085, 0.32, mouthY(0.35) - 0.17, 0.32, 0x4a2220]]) {
      const t = new THREE.SphereGeometry(1, 14, 8); t.scale(sx, sy, sz); t.translate(0, y, z);
      const col = [], p = t.attributes.position;
      for (let i = 0; i < p.count; i++) { const c = C(hex).multiplyScalar(0.75 + 0.35 * Math.max(0, (p.getY(i) - y) / sy)); col.push(c.r, c.g, c.b); }
      t.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); t.deleteAttribute('uv'); tparts.push(t.toNonIndexed());
    }
  }
  const merge = (parts) => { const g = new THREE.BufferGeometry(), cnt = parts.reduce((s, p) => s + p.attributes.position.count, 0);
    const pos = new Float32Array(cnt * 3), nrm = new Float32Array(cnt * 3), col = new Float32Array(cnt * 3); let o = 0;
    for (const p of parts) { pos.set(p.attributes.position.array, o * 3); nrm.set(p.attributes.normal.array, o * 3); col.set(p.attributes.color.array, o * 3); o += p.attributes.position.count; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g; };
  const g = merge(parts); if (tparts.length) g.userData.tongue = merge(tparts);
  return g;
}


export class RexBodyGL {
  constructor(Q = { tier: 'high' }) {
    const lo = Q.tier === 'low';
    const fogColor = Q.fog || new THREE.Color(0x6a7480);
    this.group = new THREE.Group();
    const bindSim = new RexSim(flat, { x: 0, z: 0, yaw: 0, seed: 1 });
    const geo = buildRexGeometry(bindSim.pose, { cell: lo ? 0.0725 : 0.04 }), paint = paintRex(geo, { lo });
    this.stats = geo.stats;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(geo.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(geo.normal, 3));
    g.setAttribute('color', new THREE.BufferAttribute(paint.color, 3));
    // review aid (LEGDEFORM): '-dbgw' / '&dbgw' in the URL hash colours the skin by its bone weights (each vertex the weighted mix of its
    // bones' colours): spine, tail and pelvis grey, femur red, tibia green, metatarsus blue, proximal toes yellow, distal toes magenta,
    // arms cyan, neck and head pale; the femur's twist bone orange. Hard colour edges are hard weight edges
    if (typeof location !== 'undefined' && location.hash.includes('dbgw')) {
      const n = geo.position.length / 3, c = new Float32Array(n * 3), col = (b) => {
        if (b < BONE.SKULL) return b === 13 ? [0.75, 0.75, 0.75] : [0.42, 0.42, 0.42];
        if (b >= BONE.leg(0, 0) && b < BONE.leg(0, 0) + 18) { const j = (b - BONE.leg(0, 0)) % 9; return j === 0 ? [0.9, 0.08, 0.05] : j === 1 ? [0.1, 0.8, 0.1] : j === 2 ? [0.1, 0.25, 0.95] : j < 6 ? [0.95, 0.9, 0.1] : [0.9, 0.1, 0.9]; }
        if (b >= BONE.arm(0, 0) && b < BONE.arm(0, 0) + 4) return [0.1, 0.85, 0.9];
        if (BONE.twist && (b === BONE.twist(0) || b === BONE.twist(1))) return [1.0, 0.55, 0.0];
        return [0.85, 0.82, 0.75]; };
      for (let i = 0; i < n; i++) for (let q = 0; q < 4; q++) { const w = geo.skinWeight[i * 4 + q]; if (!(w > 0)) continue; const k = col(geo.skinIndex[i * 4 + q]); for (let e = 0; e < 3; e++) c[i * 3 + e] += w * k[e] * k[e]; }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    // The hide's own per-vertex data rides ONE interleaved vertex buffer. WebGPU allows only 8 vertex buffers per pipeline
    // (the default limit), and as 13 separate attributes the skin needed 12 (its shadow pass 11): on real WebGPU both
    // pipelines failed validation and the body vanished, leaving the eyes and teeth. WebGL2 (16 attributes) never noticed.
    // Now: position, normal, color, this, skinIndex, skinWeight = 6 buffers. The attribute names are unchanged.
    {
      const n = geo.position.length / 3, S = 12, a = new Float32Array(n * S), P = geo.restTex || geo.position, H = geo.headPos;
      const one = [paint.rough, paint.scl, paint.face, paint.scute, paint.fold, paint.fs];
      for (let i = 0; i < n; i++) {
        const o = i * S;
        a[o] = P[i * 3]; a[o + 1] = P[i * 3 + 1]; a[o + 2] = P[i * 3 + 2];
        a[o + 3] = H[i * 3]; a[o + 4] = H[i * 3 + 1]; a[o + 5] = H[i * 3 + 2];
        for (let k = 0; k < 6; k++) a[o + 6 + k] = one[k][i];
      }
      const ib = new THREE.InterleavedBuffer(a, S);
      g.setAttribute('rest', new THREE.InterleavedBufferAttribute(ib, 3, 0));
      g.setAttribute('hp', new THREE.InterleavedBufferAttribute(ib, 3, 3));
      ['rough', 'scl', 'face', 'scute', 'fold', 'fs'].forEach((k, j) => g.setAttribute(k, new THREE.InterleavedBufferAttribute(ib, 1, 6 + j)));
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(geo.skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(geo.skinWeight, 4));
    // WebGPU's default limit is 8 vertex buffers per pipeline; the skin (and its shadow pass, a subset) must stay within it on
    // every tier. Upper bound: every distinct buffer behind the geometry's attributes (interleaved views share one)
    this.vbufStatic = vertexBufferCount(g);
    if (this.vbufStatic > MAX_VBUF) console.error(`[body check] the T. rex skin geometry needs ${this.vbufStatic} vertex buffers (WebGPU allows ${MAX_VBUF}): ${Object.keys(g.attributes).join(',')}`);
    g.setIndex(new THREE.BufferAttribute(geo.index, 1));
    this.wet = { value: Q.wet ?? 0.7 }; this.jawU = { value: 0 };      // the jaw's opening (PS.JAW): the corner webs' creases smooth out as it opens
    this.bones = Array.from({ length: BONE_COUNT }, () => { const b = new THREE.Bone(); b.matrixAutoUpdate = false; this.group.add(b); return b; });
    const inv = geo.bind.map((m) => m.clone().invert());
    this.skeleton = new THREE.Skeleton(this.bones, inv);
    // review aid: '-dbggrey' in the URL hash renders the hide as plain grey (pure geometry), '-dbgnrm' as geometry normals
    const skinMat = skinMaterialGL(this.wet, lo, geo.eye || EYE, geo.nostril, this.jawU, fogColor);
    this.mesh = new THREE.SkinnedMesh(g, skinMat);
    this.mesh.bind(this.skeleton, new THREE.Matrix4());
    this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
    this.mats = Array.from({ length: BONE_COUNT }, () => new THREE.Matrix4());

    // teeth on the skull and jaw, eyes in their sockets
    // teeth, eyes and lids are lit like the hide: the same lights, fog and received shadow (they used to cast but not
    // receive, so they glowed in the shade of the head and under the torch), and enamel no glossier than wet skin
    const toothMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0 });      // a little sheen runs down each crown and shows it is round
    const mk = (geom, mat) => { const m = new THREE.Mesh(geom, mat); m.matrixAutoUpdate = false; m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; this.group.add(m); return m; };
    this.upperTeeth = mk(teethGeometry(geo.teeth.upper, true, geo.teeth.ridge && geo.teeth.ridge.upper), toothMat);
    this.lowerTeeth = mk(teethGeometry(geo.teeth.lower, false, geo.teeth.ridge && geo.teeth.ridge.lower), toothMat);
    const tongueG = this.lowerTeeth.geometry.userData.tongue;
    if (tongueG) { this.tongue = mk(tongueG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, color: 0x9a8a88 })); this.tongue.castShadow = false; }
    // teeth receive the head's shadow but cast none: cones a few cm across are below a shadow texel and only shadow-acne each other
    this.upperTeeth.castShadow = false; this.lowerTeeth.castShadow = false;
    const EY = geo.eye || { x: EYE.x, y: EYE.y, z: EYE.z, r: EYE.r };
    const eyeMat = new THREE.MeshPhysicalMaterial({ map: irisTexture(), roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.06 });
    // EYES2: a small, soft glint fixed in view space ~27 deg up and a little left of where the ball faces the camera (on the
    // upper cornea, above a pupil turned toward you), and masked off the pupil disc and its rim in the ball's own frame
    // (normalLocal.z: the pupil is the ball's +z, half-size ~17 x 20 deg), so it can never sit on the pupil whichever way the
    // eye turns. (14 Nov's glint sat 15 deg off, inside a pupil looking at you, and hid it.)
    // (the WebGPU skin's view-space glint mask is a node; here the clearcoat's own highlight is the glint)
    const lidMat = new THREE.MeshStandardMaterial({ color: 0x4d4430, roughness: 0.85 });
    // eyelids: a thick, scaly shell over the top and another under the ball, each with a rolled rim; they swing
    // about the eye's horizontal axis to open, blink, droop and squint, leaving an almond opening between them
    const r = EYE.r, Rl = r * 1.16, prof = [];
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; prof.push(new THREE.Vector2(Math.max(0.002, Rl * Math.sin(a)), Rl * Math.cos(a))); }
    prof.push(new THREE.Vector2(Rl + r * 0.06, -r * 0.12), new THREE.Vector2(Rl - r * 0.06, -r * 0.27), new THREE.Vector2(Rl - r * 0.3, -r * 0.16), new THREE.Vector2(Rl - r * 0.34, r * 0.1));
    prof.reverse();     // the lathe faces outward when the profile runs bottom to top
    const upperLid = new THREE.LatheGeometry(prof, 18), lowerLid = upperLid.clone().rotateZ(Math.PI);
    const browG = new THREE.SphereGeometry(1, 12, 8);
    this.eyes = [1, -1].map((sd) => {
      const e = mk(new THREE.SphereGeometry(EYE.r, 20, 14), eyeMat);
      const lid = mk(upperLid, lidMat), lidLo = mk(lowerLid, lidMat), brow = mk(browG, lidMat);
      // the orbit faces forward and out (EYE.yaw, ~34 degrees): each eye sees ~62 degrees either side of its axis,
      // so the two fields overlap by ~55 degrees straight ahead, as in the skull
      const local = new THREE.Matrix4().makeRotationY(sd * (EYE.yaw ?? 0.6)).multiply(new THREE.Matrix4().makeRotationX(-0.06)).setPosition(sd * EY.x, EY.y, EY.z);
      const rest = new THREE.Vector3(0, 0, 1).applyMatrix4(new THREE.Matrix4().extractRotation(local));
      // EYES: the lids and brow face 17 degrees out (EYE_AIM.lidYaw), not the orbit's 34, so their opening is widest where the
      // ball looks when it stares ahead (at 34 the upper lid's rim cut off the top of a pupil turned toward someone in front)
      const lidLocal = new THREE.Matrix4().makeRotationY(sd * EYE_AIM.lidYaw).multiply(new THREE.Matrix4().makeRotationX(-0.06)).setPosition(sd * EY.x, EY.y, EY.z);
      return { e, lid, lidLo, brow, local, lidLocal, sd, cu: 0, cl: 0, sq: 0, rest, dir: rest.clone(), pos: new THREE.Vector3(), sac: new THREE.Vector3() };
    });
    this.glareEye = null;     // optional per-eye dazzle from the mind ({1: left, -1: right}, 0..1): the lids follow each eye separately
    this.glare = 0;     // optional outside drive for the squint (0..1), on top of the pose's SQUINT
    this._t = new THREE.Matrix4(); this._hi = new THREE.Matrix4(); this._d = new THREE.Vector3(); this._o = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0); this._lm = new THREE.Matrix4();
    this.fix = null; this._sacT = 0; this._sacV = new THREE.Vector3(); this.nostril = new THREE.Vector3(); this.snout = new THREE.Vector3(0, 0, 1);
  }

  setWet(k) { this.wet.value = k; }

  update(pose) {
    boneMatrices(pose, this.mats);
    for (let i = 0; i < BONE_COUNT; i++) { const b = this.bones[i]; b.matrix.copy(this.mats[i]); b.matrixWorldNeedsUpdate = true; }
    const H = this.mats[BONE.SKULL], Jm = this.mats[BONE.JAW];
    this.upperTeeth.matrix.copy(H); this.upperTeeth.matrixWorldNeedsUpdate = true;
    this.lowerTeeth.matrix.copy(Jm); this.lowerTeeth.matrixWorldNeedsUpdate = true;
    if (this.tongue) { this.tongue.matrix.copy(Jm); this.tongue.matrixWorldNeedsUpdate = true; }
    this.nostril.set(0, 0.22, 1.74).applyMatrix4(H); this.snout.set(0, -0.35, 1).normalize().transformDirection(H);
    this.jawU.value = pose.s[PS.JAW] || 0;
    const S = pose.s, blink = S[PS.BLINK] > 0.5 ? 1 : 0, rd = (i) => (i !== undefined && S.length > i ? S[i] || 0 : 0);
    const squint0 = Math.min(1, Math.max(rd(PS.SQUINT), this.glare || 0)), droop = rd(PS.LID);
    this._hi.copy(H).invert();
    // saccades: every so often both eyes jump a little (a few degrees) and hold; between jumps they are still
    const now = performance.now() / 1000;
    if (now > this._sacT) { this._sacT = now + 0.35 + Math.random() * 1.6; this._sacV.set((Math.random() - 0.5) * 0.09, (Math.random() - 0.5) * 0.05, 0); }
    this._ek = 1 - Math.exp(-55 * Math.min(0.25, Math.max(0, now - (this._eT ?? now - 1 / 60)))); this._eT = now;
    const GE = this.glareEye, gmax = GE ? Math.max(GE[1] || 0, GE[-1] || 0) : 0;
    for (const E of this.eyes) {
      // the pose's squint is shared; while a beam dazzles, the lit eye screws shut and the shaded one only partly
      const squint = gmax > 0.05 ? squint0 * (0.45 + 0.55 * Math.min(1, (GE[E.sd] || 0) / gmax)) : squint0;
      // EYES (14 Nov): each ball turns about its own centre along its own line to the fixation point (so the two converge
      // on a near face), within EYE_AIM's limits; the head does the rest (rexgeo.js eyeAim). The old clamp to 7 degrees off
      // the 34-degree-outward orbit left both pupils ~30 degrees outward of a player it stared at.
      E.pos.setFromMatrixPosition(E.local);
      eyeAim(E.pos, E.local, E.sd, this.fix ? (this._fl || (this._fl = new THREE.Vector3())).copy(this.fix).applyMatrix4(this._hi) : null, this._d);
      // fixating, the saccades are small (+-1.3 x +-0.8 degrees): a stare that wanders by more reads as looking past you
      this._d.x += this._sacV.x * (this.fix ? 0.5 : 1); this._d.y += this._sacV.y * (this.fix ? 0.5 : 1); this._d.normalize();
      E.dir.lerp(this._d, this._ek).normalize();      // EYES2: per second, not per frame (0.6 at 60 fps): at a few fps a turning head left the balls 10+ deg behind
      this._t.lookAt(E.dir, this._o, this._up).setPosition(E.pos);
      E.e.matrix.copy(H).multiply(this._t); E.e.matrixWorldNeedsUpdate = true;
      // lids: blink shuts both; a squint screws them nearly shut and pulls the brow down; contentment droops the upper
      const tu = Math.max(blink, 0.82 * squint, 0.7 * droop), tl = Math.max(blink, 0.6 * squint, 0.25 * droop);
      E.cu += (tu - E.cu) * (tu > E.cu ? 0.6 : 0.35); E.cl += (tl - E.cl) * (tl > E.cl ? 0.6 : 0.35); E.sq += (squint - E.sq) * 0.25;
      const look = Math.max(-0.12, Math.min(0.12, E.dir.y - E.rest.y));     // the upper lid follows the ball up and down a little
      this._t.makeRotationX(-0.5 + 0.7 * E.cu - look * 1.2);
      E.lid.matrix.copy(H).multiply(E.lidLocal).multiply(this._t); E.lid.matrixWorldNeedsUpdate = true;
      this._t.makeRotationX(0.62 - 0.7 * E.cl - look * 0.6);
      E.lidLo.matrix.copy(H).multiply(E.lidLocal).multiply(this._t); E.lidLo.matrixWorldNeedsUpdate = true;
      // the brow: a heavy pad over the lid that comes down and forward when it squints
      const r = EYE.r;
      this._lm.makeRotationX(0.25 + 0.3 * E.sq).scale(this._o.set(r * 1.5, r * 0.5, r * 1.3)).setPosition(0, r * (1.12 - 0.42 * E.sq), r * (-0.3 + 0.42 * E.sq));
      E.brow.matrix.copy(H).multiply(E.lidLocal).multiply(this._lm); E.brow.matrixWorldNeedsUpdate = true; this._o.set(0, 0, 0);
    }
  }
}
