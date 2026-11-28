// The parked cars of Lot B, built from numbers: each body is a lofted skin split into lower chassis (sill to beltline)
// and upper glasshouse/roof so a 6-tonne footstep or flip visibly caves the cabin in and shatters the glass with zero
// geometry cloning. A roll pivot wraps chassis + wheels so a hard broadside shove tips the whole car onto its side/roof.
import * as THREE from 'three/webgpu';

function curve(knots, s = 1) {
  return (t) => {
    if (t <= knots[0][0]) return knots[0][1];
    for (let i = 1; i < knots.length; i++) {
      const [t1, v1] = knots[i];
      if (t <= t1) { const [t0, v0] = knots[i - 1]; let k = (t - t0) / (t1 - t0 || 1); k += (k * k * (3 - 2 * k) - k) * s; return v0 + (v1 - v0) * k; }
    }
    return knots[knots.length - 1][1];
  };
}

export const CAR_STYLES = {
  sedan: {
    w: 1.84, l: 4.6, h: 1.43, wheelR: 0.33, axles: [0.19, 0.805], clear: 0.19,
    belt: [[0, 0.86], [0.03, 0.97], [0.17, 1.0], [0.3, 0.95], [0.62, 0.93], [0.7, 0.92], [0.9, 0.84], [0.975, 0.74], [1, 0.62]],
    roof: [[0.15, 0], [0.31, 1], [0.52, 1], [0.58, 0.97], [0.715, 0]],
    wide: [[0, 0.8], [0.04, 0.93], [0.12, 0.99], [0.5, 1], [0.86, 0.98], [0.95, 0.92], [1, 0.76]],
    sill: [[0, 0.44], [0.05, 0.3], [0.1, 0.19], [0.9, 0.19], [0.96, 0.24], [1, 0.34]],
    roofIn: 0.74, pillars: [0.44], glassT: [0.2, 0.69],
  },
  hatch: {
    w: 1.78, l: 4.05, h: 1.5, wheelR: 0.32, axles: [0.175, 0.8], clear: 0.19,
    belt: [[0, 0.8], [0.03, 0.98], [0.3, 0.97], [0.66, 0.95], [0.86, 0.87], [0.97, 0.76], [1, 0.64]],
    roof: [[0.02, 0], [0.13, 0.93], [0.24, 1], [0.5, 1], [0.56, 0.97], [0.7, 0]],
    wide: [[0, 0.84], [0.04, 0.95], [0.12, 1], [0.86, 0.98], [0.95, 0.92], [1, 0.76]],
    sill: [[0, 0.42], [0.05, 0.28], [0.1, 0.19], [0.9, 0.19], [0.96, 0.24], [1, 0.34]],
    roofIn: 0.76, pillars: [0.42], glassT: [0.07, 0.68],
  },
  suv: {
    w: 1.98, l: 4.8, h: 1.76, wheelR: 0.38, axles: [0.185, 0.8], clear: 0.25,
    belt: [[0, 0.92], [0.03, 1.12], [0.3, 1.12], [0.68, 1.1], [0.72, 1.09], [0.92, 1.02], [0.98, 0.9], [1, 0.74]],
    roof: [[0.015, 0], [0.09, 0.95], [0.2, 1], [0.52, 1], [0.58, 0.97], [0.7, 0]],
    wide: [[0, 0.88], [0.04, 0.97], [0.1, 1], [0.88, 0.99], [0.96, 0.94], [1, 0.82]],
    sill: [[0, 0.5], [0.05, 0.34], [0.1, 0.25], [0.9, 0.25], [0.96, 0.3], [1, 0.42]],
    roofIn: 0.8, pillars: [0.27, 0.45], glassT: [0.045, 0.68], rails: true, tallTail: true,
  },
  minivan: {
    w: 2.0, l: 5.05, h: 1.78, wheelR: 0.35, axles: [0.18, 0.79], clear: 0.2,
    belt: [[0, 0.86], [0.03, 1.06], [0.3, 1.04], [0.7, 1.0], [0.78, 0.98], [0.93, 0.86], [0.985, 0.74], [1, 0.62]],
    roof: [[0.01, 0], [0.06, 0.95], [0.16, 1], [0.6, 1], [0.66, 0.96], [0.84, 0]],
    wide: [[0, 0.88], [0.04, 0.97], [0.1, 1], [0.88, 0.98], [0.96, 0.9], [1, 0.76]],
    sill: [[0, 0.44], [0.05, 0.3], [0.1, 0.2], [0.9, 0.2], [0.96, 0.25], [1, 0.36]],
    roofIn: 0.82, pillars: [0.26, 0.48], glassT: [0.035, 0.8], tallTail: true,
  },
  pickup: {
    w: 2.04, l: 5.35, h: 1.84, wheelR: 0.4, axles: [0.2, 0.8], clear: 0.28,
    belt: [[0, 1.0], [0.02, 1.18], [0.36, 1.18], [0.4, 1.16], [0.7, 1.14], [0.74, 1.13], [0.93, 1.08], [0.98, 0.96], [1, 0.8]],
    roof: [[0.385, 0], [0.43, 0.97], [0.48, 1], [0.58, 1], [0.63, 0.97], [0.73, 0]],
    wide: [[0, 0.95], [0.03, 1], [0.9, 1], [0.97, 0.95], [1, 0.86]],
    sill: [[0, 0.56], [0.04, 0.4], [0.08, 0.28], [0.92, 0.28], [0.97, 0.34], [1, 0.46]],
    roofIn: 0.82, pillars: [0.53], glassT: [0.41, 0.71], bed: [0.03, 0.375],
  },
};

const PAINT_LO = 0, DARK_LO = 1, PAINT_HI = 2, GLASS_HI = 3, HEAD = 4, TAIL = 5;

function loft(st) {
  const hw = st.w / 2, L = st.l, fBelt = curve(st.belt), fRoofK = curve(st.roof), fWide = curve(st.wide), fSill = curve(st.sill);
  const archR = st.wheelR + 0.075, beltY = fBelt(0.5);
  const sillAt = (t) => {
    let y = fSill(t);
    for (const a of st.axles) { const d = (t - a) * L; if (Math.abs(d) < archR) y = Math.max(y, st.wheelR + Math.sqrt(archR * archR - d * d)); }
    return y;
  };
  const ts = new Set();
  for (let i = 0; i <= 44; i++) ts.add(i / 44);
  for (const k of [st.belt, st.roof, st.wide, st.sill]) for (const [t] of k) ts.add(t);
  for (const a of st.axles) for (let i = -6; i <= 6; i++) ts.add(clamp01(a + (i / 6) * archR / L));
  const PW = 0.035;
  for (const p of st.pillars) { ts.add(p - PW / 2); ts.add(p + PW / 2); }
  ts.add(st.glassT[0]); ts.add(st.glassT[1]);
  if (st.bed) { ts.add(st.bed[0]); ts.add(st.bed[1]); }
  const T = [...ts].filter((t) => t >= 0 && t <= 1).sort((a, b) => a - b).filter((t, i, A) => i === 0 || t - A[i - 1] > 1e-4);

  const half = (t) => {
    const belt = fBelt(t), k = fRoofK(t), top = belt + (st.h - belt) * k, wd = hw * fWide(t), sy = Math.min(sillAt(t), belt - 0.12);
    const inBed = st.bed && t > st.bed[0] && t < st.bed[1];
    const rw = wd * (1 - (1 - st.roofIn) * Math.min(1, k * 1.6));
    const crown = 0.035 + 0.02 * k, mid = sy + (belt - sy) * 0.5;
    const deck = inBed ? belt - 0.42 : top + crown;
    return [
      [0, sy + 0.02], [wd * 0.8, sy], [wd * 0.985, sy + 0.07], [wd * 1.0, mid], [wd * 0.985, belt - 0.07], [wd * 0.955, belt],
      [rw * (inBed ? 0.9 : 1), inBed ? belt - 0.02 : top - 0.06 * k], [rw * (inBed ? 0.88 : 0.9), inBed ? deck : top - 0.012 * k], [rw * 0.5, inBed ? deck : top + crown * 0.8], [0, deck],
    ];
  };
  const N = 10, rings = T.map((t) => ({ t, z: (t - 0.5) * L, h: half(t) }));
  const out = [0, 1, 2, 3, 4, 5].map(() => ({ pos: [], idx: [], map: new Map() }));
  const vert = (g, ri, pi, sx) => {
    const key = ri * 64 + pi * 2 + (sx > 0 || rings[ri].h[pi][0] === 0 ? 0 : 1), G = out[g];
    if (!G.map.has(key)) {
      const r = rings[ri], p = r.h[pi];
      const yOff = (g === PAINT_HI || g === GLASS_HI) ? p[1] - beltY : p[1];
      G.map.set(key, G.pos.length / 3); G.pos.push(p[0] * sx, yOff, r.z);
    }
    return G.map.get(key);
  };
  const [g0, g1] = st.glassT;
  const kind = (t, seg) => {
    const k = fRoofK(t), cab = k > 0.05;
    if (seg <= 1) return DARK_LO;
    if (seg === 4 && t > 0.945) return HEAD;
    if ((seg === 4 || (st.tallTail && seg === 5)) && t < 0.04) return TAIL;
    if (seg === 5) {
      if (!cab || t < g0 || t > g1 || k < 0.86) return cab ? PAINT_HI : PAINT_LO;
      for (const p of st.pillars) if (Math.abs(t - p) < PW / 2) return PAINT_HI;
      return GLASS_HI;
    }
    if (seg >= 6 && cab && k > 0.08 && k < 0.93) return seg === 6 ? PAINT_HI : GLASS_HI;
    if (st.bed && seg >= 6 && t > st.bed[0] && t < st.bed[1]) return DARK_LO;
    return seg >= 5 && cab ? PAINT_HI : PAINT_LO;
  };
  for (let i = 0; i < rings.length - 1; i++) {
    const tm = (rings[i].t + rings[i + 1].t) / 2;
    for (let s = 0; s < N - 1; s++) for (const sx of [1, -1]) {
      const g = kind(tm, s), a = vert(g, i, s, sx), b = vert(g, i, s + 1, sx), c = vert(g, i + 1, s + 1, sx), d = vert(g, i + 1, s, sx);
      if (sx > 0) out[g].idx.push(a, b, c, a, c, d); else out[g].idx.push(a, c, b, a, d, c);
    }
  }
  for (const [ri, flip] of [[0, false], [rings.length - 1, true]]) {
    const r = rings[ri], cy = (r.h[0][1] + r.h[N - 1][1]) / 2;
    for (let s = 0; s < N - 1; s++) for (const sx of [1, -1]) {
      const g = s <= 2 ? DARK_LO : PAINT_LO, G = out[g], c = G.pos.length / 3; G.pos.push(0, cy, r.z + (flip ? 0.03 : -0.03));
      const a = vert(g, ri, s, sx), b = vert(g, ri, s + 1, sx);
      if ((sx > 0) !== flip) G.idx.push(c, b, a); else G.idx.push(c, a, b);
    }
  }
  const geo = (G) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3)); g.setIndex(G.idx); g.computeVertexNormals(); return g; };
  return { paintLo: geo(out[PAINT_LO]), darkLo: geo(out[DARK_LO]), paintHi: geo(out[PAINT_HI]), glassHi: geo(out[GLASS_HI]), head: geo(out[HEAD]), tail: geo(out[TAIL]), belt: fBelt, wide: fWide, sill: fSill, beltY };
}
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function merge(parts) {
  const pos = [], nor = [], idx = []; let base = 0;
  for (const { geo, m } of parts) {
    const g = geo.clone(); if (m) g.applyMatrix4(m);
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), ix = g.getIndex();
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); }
    if (ix) for (let i = 0; i < ix.count; i++) idx.push(base + ix.getX(i)); else for (let i = 0; i < p.count; i++) idx.push(base + i);
    base += p.count;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
  return g;
}
const at = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
const boxG = (w, h, d) => new THREE.BoxGeometry(w, h, d);

const styleCache = new Map();
function styleGeo(kind) {
  if (styleCache.has(kind)) return styleCache.get(kind);
  const st = CAR_STYLES[kind], L = st.l, hw = st.w / 2, sk = loft(st);
  const zOf = (t) => (t - 0.5) * L, noseY = sk.belt(1);
  const darkLo = [{ geo: sk.darkLo }], gA = st.glassT[1], beltA = sk.belt(gA - 0.03);
  for (const sx of [-1, 1]) darkLo.push({ geo: boxG(0.2, 0.12, 0.1), m: at(sx * (hw + 0.07), beltA + 0.09, zOf(gA - 0.035), 0, sx * -0.25, 0) });
  darkLo.push({ geo: boxG(st.w * 0.34, 0.07, 0.05), m: at(0, noseY - 0.09, L / 2 + 0.012) });
  const seams = kind === 'pickup' ? [0.44, 0.6] : st.pillars.length > 1 ? [st.pillars[0], st.pillars[1], gA - 0.02] : [st.pillars[0] - 0.17, st.pillars[0], gA - 0.02];
  for (const t of seams) for (const sx of [-1, 1]) darkLo.push({ geo: boxG(0.012, sk.belt(t) - st.clear - 0.16, 0.022), m: at(sx * (hw * sk.wide(t) + 0.001), (sk.belt(t) + st.clear + 0.1) / 2, zOf(t)) });
  const glassHi = [{ geo: sk.glassHi }];
  if (st.rails) for (const sx of [-1, 1]) glassHi.push({ geo: boxG(0.05, 0.05, L * 0.4), m: at(sx * hw * st.roofIn * 0.84, st.h + 0.045 - sk.beltY, zOf(0.34)) });

  const nW = hw * sk.wide(0.985), tall = kind === 'suv' || kind === 'pickup' || kind === 'minivan';
  const head = [{ geo: sk.head }], tail = [{ geo: sk.tail }], haz = [], plate = [];
  const nose1 = hw * sk.wide(1), tail0 = hw * sk.wide(0), sN = sk.sill(1), sT = sk.sill(0), tY = sk.belt(0);
  for (const sx of [-1, 1]) {
    head.push({ geo: boxG(nose1 * 0.5, tall ? 0.13 : 0.1, 0.06), m: at(sx * nose1 * 0.68, noseY - (tall ? 0.1 : 0.085), L / 2 + 0.012) });
    haz.push({ geo: boxG(0.12, 0.07, 0.05), m: at(sx * nose1 * 0.8, sN + 0.07, L / 2 + 0.012) });
    haz.push({ geo: boxG(0.1, 0.07, 0.05), m: at(sx * tail0 * 0.82, sT + 0.06, -L / 2 - 0.012) });
    tail.push({ geo: boxG(tail0 * 0.42, 0.1, 0.05), m: at(sx * tail0 * 0.72, tY - 0.09, -L / 2 - 0.012) });
  }
  plate.push({ geo: boxG(0.44, 0.11, 0.03), m: at(0, (sT + tY) / 2 - 0.03, -L / 2 - 0.03) });
  plate.push({ geo: boxG(0.44, 0.11, 0.03), m: at(0, sN + 0.09, L / 2 + 0.03) });

  const tyre = [], rim = [], ty = new THREE.CylinderGeometry(st.wheelR, st.wheelR, 0.23, 16), rm = new THREE.CylinderGeometry(st.wheelR * 0.62, st.wheelR * 0.55, 0.05, 10), hub = new THREE.CylinderGeometry(st.wheelR * 0.2, st.wheelR * 0.2, 0.07, 8);
  for (const a of st.axles) for (const sx of [-1, 1]) {
    const x = sx * (hw - 0.135);
    tyre.push({ geo: ty, m: at(x, st.wheelR, zOf(a), 0, 0, Math.PI / 2) });
    rim.push({ geo: rm, m: at(x + sx * 0.1, st.wheelR, zOf(a), 0, 0, sx * -Math.PI / 2) });
    rim.push({ geo: hub, m: at(x + sx * 0.105, st.wheelR, zOf(a), 0, 0, Math.PI / 2) });
  }
  for (const a of st.axles) tyre.push({ geo: boxG(st.w * 0.7, 0.1, 0.1), m: at(0, st.wheelR, zOf(a)) });
  const out = { st, beltY: sk.beltY, paintLo: sk.paintLo, darkLo: merge(darkLo), paintHi: sk.paintHi, glassHi: merge(glassHi), head: merge(head), tail: merge(tail), haz: merge(haz), tyre: merge(tyre), rim: merge([...rim, ...plate]), noseY, lampX: nW - 0.2 };
  styleCache.set(kind, out);
  return out;
}

export function makeBeamTex(rgb = '255,240,196', peak = 0.28) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 64; const g = c.getContext('2d');
  // ConeGeometry UVs run v=1 at the apex (lamp) down to v=0 at the open rim: fade cleanly to zero before the rim
  const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, `rgba(${rgb},${peak})`);
  gr.addColorStop(0.28, `rgba(${rgb},${(peak * 0.55).toFixed(3)})`);
  gr.addColorStop(0.68, `rgba(${rgb},${(peak * 0.14).toFixed(3)})`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const MATS = {};
function mats() {
  if (!MATS.glass) {
    MATS.glass = new THREE.MeshStandardMaterial({ color: 0x0b1116, roughness: 0.08, metalness: 0.6 });
    MATS.brokenGlass = new THREE.MeshStandardMaterial({ color: 0x627078, roughness: 0.82, metalness: 0.08, emissive: 0x1a2228, emissiveIntensity: 0.22 });
    MATS.tyre = new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.95 });
    MATS.rim = new THREE.MeshStandardMaterial({ color: 0x8d949b, roughness: 0.35, metalness: 0.7 });
    MATS.beam = new THREE.MeshBasicMaterial({ map: makeBeamTex('255,238,194', 0.22), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  }
  return MATS;
}

export function buildCar(spec, lo = false) {
  const G = styleGeo(spec.kind), st = G.st, M = mats();
  const root = new THREE.Group();
  // rollPivot sits at the car's centre of mass so tipping/flipping rolls chassis + wheels together onto side/roof
  const rollY = st.h * 0.46;
  const rollPivot = new THREE.Group(); rollPivot.position.y = rollY; root.add(rollPivot);
  const frame = new THREE.Group(); frame.position.y = -rollY; rollPivot.add(frame);
  const body = new THREE.Group(); frame.add(body);
  const upper = new THREE.Group(); upper.position.y = G.beltY; body.add(upper);

  const paint = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.3, metalness: 0.25 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xe9eee6, emissive: 0xffe9b8, emissiveIntensity: 0.04, roughness: 0.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x5a0d0d, emissive: 0xff1a12, emissiveIntensity: 0.04, roughness: 0.3 });
  const hazMat = new THREE.MeshStandardMaterial({ color: 0x8a4a10, emissive: 0xff8a00, emissiveIntensity: 0.03, roughness: 0.3 });
  const add = (geo, mat, parent = body, shadow = false) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow && !lo; m.receiveShadow = true; parent.add(m); return m; };

  add(G.paintLo, paint, body, true); add(G.darkLo, M.glass, body);
  add(G.head, headMat, body); add(G.tail, tailMat, body); add(G.haz, hazMat, body);
  add(G.paintHi, paint, upper, true);
  const glassMesh = add(G.glassHi, M.glass, upper);
  add(G.tyre, M.tyre, frame); add(G.rim, M.rim, frame);

  const extras = {};
  if (spec.livery === 'ranger') {
    const stripe = new THREE.MeshStandardMaterial({ color: 0xd9c56a, roughness: 0.5 }), hw = st.w / 2;
    for (const sx of [-1, 1]) add(boxG(0.012, 0.11, st.l * 0.78), stripe, body).position.set(sx * (hw + 0.004), st.clear + 0.5, 0);
    extras.barMat = new THREE.MeshStandardMaterial({ color: 0x664410, emissive: 0xffa218, emissiveIntensity: 2.2 });
    add(boxG(st.w * 0.56, 0.1, 0.2), extras.barMat, upper).position.set(0, st.h + 0.09 - G.beltY, (0.55 - 0.5) * st.l);
  }
  if (spec.flareBox) {
    const tg = add(boxG(st.w * 0.86, 0.05, 0.55), paint, body); tg.position.set(0, st.clear + 0.6, -st.l / 2 - 0.26);
    extras.flareBox = add(boxG(0.5, 0.2, 0.3), new THREE.MeshStandardMaterial({ color: 0xc8261c, emissive: 0xff2a14, emissiveIntensity: 1.4 }), body);
    extras.flareBox.position.set(0, st.clear + 0.74, -st.l / 2 - 0.26);
  }
  if (spec.openDoor) {
    const hw = st.w / 2, zf = (st.glassT[1] - 0.06 - 0.5) * st.l, dl = st.l * 0.2, pivot = new THREE.Group();
    pivot.position.set(hw - 0.02, 0, zf); pivot.rotation.y = 1.05;
    add(boxG(0.06, 0.62, dl), paint, pivot).position.set(0, st.clear + 0.42, -dl / 2);
    add(boxG(0.03, 0.36, dl * 0.8), M.glass, pivot).position.set(0, st.clear + 0.92, -dl / 2);
    body.add(pivot);
    extras.dome = add(boxG(st.w * 0.5, 0.03, 0.5), new THREE.MeshStandardMaterial({ color: 0x66583a, emissive: 0xffd9a0, emissiveIntensity: 1.8 }), upper);
    extras.dome.position.set(0, st.h - 0.2 - G.beltY, zf - 0.6);
  }

  const beams = new THREE.Group(); beams.visible = false;
  if (spec.beams) {
    const cone = new THREE.ConeGeometry(1.5, 8.5, 10, 1, true); cone.translate(0, -4.25, 0); cone.rotateX(-Math.PI / 2);
    for (const sx of [-1, 1]) { const c = new THREE.Mesh(cone, M.beam); c.position.set(sx * G.lampX, G.noseY - 0.05, st.l / 2); c.rotation.x = 0.06; beams.add(c); }
    body.add(beams);
  }
  return { root, rollPivot, rollY, body, upper, beltY: G.beltY, glassMesh, mats: M, paint, headMat, tailMat, hazMat, beams, extras, style: st, brokenSet: false };
}
