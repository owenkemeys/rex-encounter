// Dressed-arena asset library: prefab factories by kind, instancing-friendly.
//
//   import { createArenaAssets } from './view/arenaassets.js';
//   const lib = createArenaAssets({ tier: 'low' | 'high', base: 'assets/arena/' });
//   lib.has('barn.wall')            // procedural kinds are available at once
//   await lib.ready;                // GLB packs (trees, rocks, scanned props) + textures
//   const p = lib.get('tree.palm', { lod: 1 });   // { kind, parts: [{ geometry, material }], tris, draws, bounds, sway }
//   const g = lib.instanced('tree.palm', matrices, { lod: 0 }); // THREE.Group of InstancedMesh, one per part
//   const m = lib.mesh('barn.silo');                            // THREE.Group of Mesh (one-offs)
//   lib.setWind(0.8, 1, 0.3);       // foliage sway (strength 0..2, direction xz)
//
// get() returns null for a GLB kind that has not loaded (or failed): keep the blockout for it.
// Geometry and materials are shared and cached: do not dispose them per instance; call lib.dispose().
// Units are metres; every prefab stands on y = 0 with its origin at the footprint centre unless noted.
// Tint instances with InstancedMesh.setColorAt (multiplies the texture): see CONTAINER_TINTS.
// Works on WebGPU and the WebGL2 fallback: all materials are node materials, wind is TSL.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { uniform, vec3, float, sin, cos, time, positionLocal, instanceIndex, hash, max, pow } from 'three/tsl';

export const CONTAINER_TINTS = [0xffffff, 0x8fa0b8, 0x9fb59a, 0xc8b89a, 0xb0b0b0, 0xd9a58f];

const GLB_PACKS = {
  foliage: ['tree.araucaria', 'tree.treefern', 'tree.palm', 'tree.cycad', 'tree.banana', 'tree.horsetail', 'bamboo', 'fern', 'fern.bush', 'vine'],
  rocks: ['rock.face', 'rock.cave', 'rock.basalt', 'rock.mossy', 'rock.log'],
  props: ['prop.barrier', 'prop.crate', 'prop.utilitybox', 'prop.coveredcar', 'prop.jeep', 'prop.truck', 'prop.generator', 'prop.skull', 'prop.ribcage', 'prop.nest'],
};
const SWAY = { 'tree.araucaria': 0.35, 'tree.treefern': 0.8, 'tree.palm': 1, 'tree.cycad': 0.5, 'tree.banana': 1.2, 'tree.horsetail': 0.9, bamboo: 1.1, fern: 1.4, 'fern.bush': 1.4, vine: 1.6, 'rock.mossy': 0, 'prop.nest': 0 };
// rocks pack holds geometry only: these get the shared rock material with box-projected UVs
const ROCK_GEO = new Set(['rock.face', 'rock.cave', 'rock.basalt']);

// --- shared materials ------------------------------------------------------------------------
// key: [texture file, tile metres, fallback colour, tint after load, roughness, metalness, normal map, normal scale]
const MATS = {
  concrete: ['concrete', 2.5, 0x76746e, 0xa4a097, 0.92, 0, 'concrete_n', 0.8],
  corrugated: ['corrugated', 2.2, 0x6a4030, 0xd8d0c8, 0.7, 0.35, 'corrugated_n', 1.2],
  steel: ['steel', 2.0, 0x6e3a2a, 0xffffff, 0.65, 0.4, 'steel_n', 0.8],
  container: ['steel', 3.0, 0x6e3a2a, 0xffffff, 0.6, 0.45, 'corrugated_n', 1.4],
  darksteel: ['steel', 2.0, 0x2c2a28, 0x5a5552, 0.55, 0.6, 'steel_n', 0.6],
  timber: ['timber', 3.0, 0x4a3c30, 0xffffff, 0.88, 0, 'timber_n', 1.0],
  deck: ['timber', 2.0, 0x40342a, 0xd0c4b8, 0.85, 0, 'timber_n', 1.0],
  shutter: ['shutter', 2.0, 0x3a3e48, 0xffffff, 0.6, 0.4, null, 0],
  rock: ['rock', 7.0, 0x4e4a44, 0xffffff, 0.95, 0, 'rock_n', 1.3],
  sign: [null, 1, 0xb08a20, 0, 0.6, 0.2, null, 0],
  hay: [null, 1, 0x5c4c2c, 0, 1, 0, null, 0],
};

function rng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function mtx(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) { return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)); }

// Box-projected UVs in metres (object space): walls get (horizontal, y), floors (x, z).
function boxUV(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position, n = p.count, uv = new Float32Array(n * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), f = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    f.subVectors(c, b).cross(a.clone().sub(b)); const ax = Math.abs(f.x), ay = Math.abs(f.y), az = Math.abs(f.z);
    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? a : k === 1 ? b : c;
      let u, w; if (ay >= ax && ay >= az) { u = v.x; w = v.z; } else if (ax >= az) { u = v.z; w = v.y; } else { u = v.x; w = v.y; }
      uv[(i + k) * 2] = u; uv[(i + k) * 2 + 1] = w;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// Kit: accumulates primitives per material, then merges once per material (one draw per material).
class Kit {
  constructor(lod = 0) { this.lod = lod; this.g = {}; }
  add(mat, geo, m) { if (m) geo.applyMatrix4(m); for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k); (this.g[mat] ||= []).push(geo.index ? geo.toNonIndexed() : geo); return this; }
  box(mat, w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { return this.add(mat, new THREE.BoxGeometry(w, h, d), mtx(x, y, z, rx, ry, rz)); }
  // box standing on its base: y is the bottom
  post(mat, w, h, d, x, y, z, ry = 0) { return this.box(mat, w, h, d, x, y + h / 2, z, 0, ry, 0); }
  cyl(mat, rt, rb, h, seg, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, open = false) { return this.add(mat, new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), mtx(x, y, z, rx, ry, rz)); }
  // chamfered box (hero masses catch a highlight along the edges)
  cbox(mat, w, h, d, b, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    b = Math.min(b, w * 0.3, h * 0.3, d * 0.3);
    const s = new THREE.Shape(); s.moveTo(-w / 2 + b, -h / 2 + b); s.lineTo(w / 2 - b, -h / 2 + b); s.lineTo(w / 2 - b, h / 2 - b); s.lineTo(-w / 2 + b, h / 2 - b); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 1 });
    g.translate(0, 0, -(d - 2 * b) / 2); return this.add(mat, g, mtx(x, y, z, rx, ry, rz));
  }
  // extruded shape (in XY), depth along +Z, then transformed
  shape(mat, shape, depth, m) { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: this.lod ? 8 : 16 }); return this.add(mat, g, m); }
  // a beam between two points with square section
  beam(mat, a, b, t) { const d = new THREE.Vector3().subVectors(b, a), L = d.length(); const g = new THREE.BoxGeometry(t, L, t); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); g.applyQuaternion(q); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return this.add(mat, g); }
  merge(kit, m) { for (const [k, list] of Object.entries(kit.g)) for (const g of list) this.add(k, g.clone(), m); return this; }
  build() {
    const out = [];
    for (const [k, list] of Object.entries(this.g)) {
      const geo = boxUV(mergeGeometries(list, false));
      geo.computeBoundingBox(); geo.computeBoundingSphere(); out.push({ mat: k, geometry: geo });
    }
    return out;
  }
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function rectHole(w, h, holes) { // wall outline (x from -w/2..w/2, y 0..h) with rectangular holes [cx, y0, hw, hh]
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.closePath();
  for (const [cx, y0, hw, hh] of holes) { const p = new THREE.Path(); p.moveTo(cx - hw / 2, y0); p.lineTo(cx - hw / 2, y0 + hh); p.lineTo(cx + hw / 2, y0 + hh); p.lineTo(cx + hw / 2, y0); p.closePath(); s.holes.push(p); }
  return s;
}
// wall along X centred at origin, thickness t centred on z=0 (holes cut by shapes)
function wall(kit, mat, w, h, t, holes = [], m = new THREE.Matrix4()) { kit.shape(mat, rectHole(w, h, holes), t, new THREE.Matrix4().multiplyMatrices(m, mtx(0, 0, -t / 2))); }

// --- procedural prefabs -------------------------------------------------------------------------
const BARN = { L: 40, W: 24, eave: 7, pitch: 0.42 }; // 40 x 24 m, ~24 deg roof
const P = {};
// timber siding wall section, 8 m long, on a concrete plinth. variant 'door' cuts a 1.2 x 2.3 opening (door.small fits)
P['barn.wall'] = (k, o) => {
  const L = 8, H = BARN.eave, door = o.variant === 'door';
  k.cbox('concrete', L, 0.8, 0.45, 0.04, 0, 0.4, 0);
  wall(k, 'timber', L, H - 0.8, 0.16, door ? [[0, 0, 1.3, 2.35]] : [[2, 3.6, 1.4, 1.0]], mtx(0, 0.8, 0));
  for (const x of [-L / 2 + 0.15, 0, L / 2 - 0.15]) if (!(door && x === 0)) k.post('timber', 0.3, H - 0.8, 0.3, x, 0.8, 0.12);
  k.box('timber', L, 0.3, 0.36, 0, H - 0.15, 0); // top plate
  if (k.lod === 0) { k.box('timber', L, 0.12, 0.22, 0, 3.6, 0.18); if (!door) { k.box('timber', 1.6, 0.12, 0.24, 2, 3.54, 0.1); k.box('darksteel', 1.4, 1.0, 0.04, 2, 4.1, -0.02); } }
  if (door) { k.post('timber', 0.14, 2.45, 0.24, -0.72, 0.8, 0); k.post('timber', 0.14, 2.45, 0.24, 0.72, 0.8, 0); k.box('timber', 1.58, 0.16, 0.24, 0, 3.27, 0); }
};
// gable end wall, 24 m wide (along X), big-door opening 8 x 6 at centre, triangle above the eave with loft hatch
P['barn.gable'] = (k) => {
  const W = BARN.W, H = BARN.eave, R = W / 2 * BARN.pitch;
  k.cbox('concrete', W, 0.8, 0.45, 0.04, 0, 0.4, 0);
  const s = new THREE.Shape(); s.moveTo(-W / 2, 0); s.lineTo(-4.05, 0); s.lineTo(-4.05, 6.05); s.lineTo(4.05, 6.05); s.lineTo(4.05, 0); s.lineTo(W / 2, 0); s.lineTo(W / 2, H - 0.8); s.lineTo(0, H - 0.8 + R); s.lineTo(-W / 2, H - 0.8); s.closePath();
  const hatch = new THREE.Path(); hatch.moveTo(-1.2, H + 0.2 - 0.8); hatch.lineTo(-1.2, H + 2.2 - 0.8); hatch.lineTo(1.2, H + 2.2 - 0.8); hatch.lineTo(1.2, H + 0.2 - 0.8); hatch.closePath(); s.holes.push(hatch);
  k.shape('timber', s, 0.16, mtx(0, 0.8, -0.08));
  for (const x of [-W / 2 + 0.15, -8, -4.2, 4.2, 8, W / 2 - 0.15]) k.post('timber', 0.32, H - 0.8, 0.32, x, 0.8, 0.12);
  k.box('timber', 8.7, 0.45, 0.4, 0, 6.85, 0.1); // door header
  k.box('darksteel', 16.4, 0.14, 0.12, 0, 6.85, 0.42); // sliding door track (doors slide out to +-8)
  k.box('timber', 0.35, 0.35, 2.4, 0, H + R - 0.4, 1.1); // hay hood beam
  if (k.lod === 0) { k.cyl('darksteel', 0.12, 0.12, 0.1, 8, 0, H + R - 0.65, 2.1, Math.PI / 2); k.box('darksteel', 0.03, 2.4, 0.03, 0, H + R - 1.9, 2.1); k.box('timber', 2.7, 0.18, 0.24, 0, H + 2.3, 0.1); k.box('timber', 2.7, 0.18, 0.24, 0, H + 0.1, 0.1); }
};
// roof bay, 8 m along X, spans the 24 m width with 0.7 m overhang; ridge at origin x, eave height y
P['barn.roof'] = (k) => {
  const L = 8, W = BARN.W, H = BARN.eave, a = Math.atan(BARN.pitch), half = W / 2 + 0.7, len = half / Math.cos(a);
  for (const sgn of [-1, 1]) {
    k.box('corrugated', L + 0.02, 0.07, len, 0, H + (W / 2 * BARN.pitch) - (half / 2) * Math.tan(a) + 0.35, sgn * half / 2, sgn * a);
    for (let i = 0; i < 4; i++) { const zz = sgn * (1.5 + i * 3); k.box('timber', L, 0.2, 0.12, 0, H + (W / 2 - Math.abs(zz)) * BARN.pitch + 0.18, zz, sgn * a); } // purlins
  }
  k.box('darksteel', L + 0.02, 0.12, 0.6, 0, H + W / 2 * BARN.pitch + 0.39, 0); // ridge cap
  // truss at the bay start: tie beam + rafters + king post
  k.box('timber', 0.22, 0.3, W, -L / 2 + 0.11, H - 0.15, 0);
  for (const sgn of [-1, 1]) k.beam('timber', V(-L / 2 + 0.11, H, sgn * W / 2), V(-L / 2 + 0.11, H + W / 2 * BARN.pitch, 0), 0.24);
  k.post('timber', 0.2, W / 2 * BARN.pitch, 0.2, -L / 2 + 0.11, H, 0);
  if (k.lod === 0) for (const sgn of [-1, 1]) k.beam('timber', V(-L / 2 + 0.11, H, sgn * 3), V(-L / 2 + 0.11, H + (W / 2 - 6) * BARN.pitch * 0.9, sgn * 6.5), 0.16);
};
// hayloft: 12 m (X) x 24 m (Z) deck at 3.6 m on beams and posts, rail along the open edge (+X), ladder
P['barn.loft'] = (k) => {
  const D = 12, W = BARN.W, Y = 3.6;
  k.box('deck', D, 0.12, W - 0.4, 0, Y, 0);
  for (let z = -W / 2 + 1.5; z < W / 2; z += 3) k.box('timber', D, 0.32, 0.2, 0, Y - 0.22, z);
  k.box('timber', 0.3, 0.4, W - 0.4, D / 2 - 0.15, Y - 0.26, 0);
  for (let z = -W / 2 + 2; z <= W / 2 - 2; z += 5) k.post('timber', 0.3, Y - 0.4, 0.3, D / 2 - 0.15, 0, z);
  k.box('timber', 0.12, 0.12, W - 0.4, D / 2 - 0.1, Y + 1.05, 0); k.box('timber', 0.08, 0.1, W - 0.4, D / 2 - 0.1, Y + 0.55, 0);
  for (let z = -W / 2 + 1; z <= W / 2 - 1; z += 2) if (Math.abs(z - 3) > 1.2) k.post('timber', 0.1, 1.1, 0.1, D / 2 - 0.1, Y, z);
  // ladder at z=3 up the open edge
  k.beam('timber', V(D / 2 + 1.3, 0, 2.6), V(D / 2 + 0.05, Y + 0.9, 2.6), 0.09); k.beam('timber', V(D / 2 + 1.3, 0, 3.4), V(D / 2 + 0.05, Y + 0.9, 3.4), 0.09);
  for (let i = 1; i < 12; i++) { const t = i / 12; k.box('timber', 0.06, 0.06, 0.8, D / 2 + 1.3 - 1.25 * t, (Y + 0.9) * t, 3); }
  if (k.lod === 0) { const r = rng(7); for (let i = 0; i < 16; i++) k.box('hay', 1.0, 0.45, 0.5, -D / 2 + 1 + r() * (D - 4), Y + 0.29 + 0.45 * Math.floor(r() * 2), -W / 2 + 1 + r() * (W - 2), 0, r() * 0.3, 0); }
};
// silo: concrete stave silo, r 3.2 m, 15 m to the eave, steel dome, hoops and ladder cage
P['barn.silo'] = (k) => {
  const r = 3.2, H = 15, s = k.lod ? 14 : 24;
  k.cyl('concrete', r, r, H, s, 0, H / 2, 0);
  k.add('steel', new THREE.SphereGeometry(r + 0.05, s, k.lod ? 4 : 7, 0, Math.PI * 2, 0, Math.PI / 2), mtx(0, H, 0, 0, 0, 0, 1, 0.55, 1));
  k.cyl('darksteel', r + 0.12, r + 0.12, 0.2, s, 0, H, 0);
  if (k.lod === 0) for (let y = 1.5; y < H; y += 1.6) k.cyl('darksteel', r + 0.04, r + 0.04, 0.06, s, 0, y, 0, 0, 0, 0, true);
  for (const dx of [-0.25, 0.25]) k.post('darksteel', 0.05, H + 1.2, 0.05, dx, 0, r + 0.35);
  for (let y = 0.3; y < H + 1; y += 0.4) k.box('darksteel', 0.5, 0.03, 0.03, 0, y, r + 0.35);
  if (k.lod === 0) for (let y = 3; y < H + 1; y += 1.2) k.cyl('darksteel', 0.45, 0.45, 0.04, 10, 0, y, r + 0.5, 0, 0, 0, true);
  k.box('darksteel', 1.4, 1.4, 0.2, 0, H - 2, r + 0.1); // loading hatch
};
// big sliding barn door leaf 4.1 x 6.1 m (two cover the 8 m opening). origin bottom centre, hangs from the track
P['door.big'] = (k) => {
  const w = 4.1, h = 6.1;
  k.box('timber', w, h, 0.1, 0, h / 2, 0);
  for (const y of [0.15, h / 2, h - 0.15]) k.box('timber', w, 0.24, 0.07, 0, y, 0.08);
  for (const x of [-w / 2 + 0.12, w / 2 - 0.12]) k.box('timber', 0.24, h, 0.07, x, h / 2, 0.08);
  for (const [y0, y1] of [[0.25, h / 2 - 0.1], [h / 2 + 0.1, h - 0.25]]) k.beam('timber', V(-w / 2 + 0.25, y0, 0.09), V(w / 2 - 0.25, y1, 0.09), 0.17);
  for (const x of [-1.4, 1.4]) { k.box('darksteel', 0.12, 0.6, 0.04, x, h + 0.15, 0.06); k.cyl('darksteel', 0.12, 0.12, 0.06, 10, x, h + 0.42, 0.1, Math.PI / 2); }
  if (k.lod === 0) k.box('darksteel', 0.08, 0.5, 0.08, w / 2 - 0.4, 2.5, 0.16);
};
// personnel door 1.1 x 2.25 m with frame. origin bottom centre of the leaf at its hinge-less centre
P['door.small'] = (k) => {
  k.box('timber', 1.1, 2.25, 0.06, 0, 1.125, 0);
  k.box('timber', 1.1, 0.14, 0.05, 0, 0.3, 0.05); k.box('timber', 1.1, 0.14, 0.05, 0, 1.9, 0.05); k.beam('timber', V(-0.45, 0.35, 0.05), V(0.45, 1.85, 0.05), 0.12);
  k.box('darksteel', 0.12, 0.04, 0.06, 0.42, 1.05, 0.06);
  for (const y of [0.4, 1.85]) k.box('darksteel', 0.35, 0.05, 0.02, -0.4, y, 0.04);
};
// whole barn (no doors, no silo): 40 (X) x 24 (Z), gables at x = +-20 facing out; big openings on both gables
P['barn'] = (k) => {
  const L = BARN.L, W = BARN.W, sub = (n, o) => { const kk = new Kit(k.lod); P[n](kk, o || {}); return kk; };
  const wl = sub('barn.wall'), wd = sub('barn.wall', { variant: 'door' }), gb = sub('barn.gable'), rf = sub('barn.roof'), lf = sub('barn.loft');
  for (let i = 0; i < 5; i++) { const x = -L / 2 + 4 + i * 8; k.merge(i === 2 ? wd : wl, mtx(x, 0, W / 2)); k.merge(i === 3 ? wd : wl, mtx(x, 0, -W / 2, 0, Math.PI)); k.merge(rf, mtx(x, 0, 0)); }
  k.merge(gb, mtx(L / 2, 0, 0, 0, Math.PI / 2)); k.merge(gb, mtx(-L / 2, 0, 0, 0, -Math.PI / 2));
  k.merge(rf, mtx(L / 2 + 4 - 0.2, 0, 0, 0, Math.PI)); // closing truss at the far end
  k.merge(lf, mtx(-L / 2 + 6.1, 0, 0));
  k.box('concrete', L, 0.1, W, 0, 0.05, 0); // slab
};
// warehouse: 30 (X) x 18 (Z) x 8 m, concrete dado + corrugated cladding, roller-door opening 6 x 5 on +Z, side doors
P['warehouse'] = (k) => {
  const L = 30, W = 18, H = 8, rise = 1.6, dado = 2.4;
  const front = [[0, 0, 6.1, 5.1], [10, 0, 1.25, 2.3]], back = [[-8, 0, 1.25, 2.3]];
  for (const [z, ry, holes] of [[W / 2, 0, front], [-W / 2, Math.PI, back]]) {
    wall(k, 'concrete', L, dado, 0.3, holes.filter(h => h[1] < dado), mtx(0, 0, z, 0, ry));
    wall(k, 'corrugated', L, H - dado, 0.12, holes.filter(h => h[1] + h[3] > dado).map(([cx, y0, hw, hh]) => [cx, Math.max(0, y0 - dado), hw, y0 + hh - dado]), mtx(0, dado, z, 0, ry));
  }
  for (const sgn of [-1, 1]) {
    wall(k, 'concrete', W, dado, 0.3, [], mtx(sgn * L / 2, 0, 0, 0, Math.PI / 2));
    const s = new THREE.Shape(); s.moveTo(-W / 2, 0); s.lineTo(W / 2, 0); s.lineTo(W / 2, H - dado); s.lineTo(0, H - dado + rise); s.lineTo(-W / 2, H - dado); s.closePath();
    k.shape('corrugated', s, 0.12, new THREE.Matrix4().multiplyMatrices(mtx(sgn * L / 2, dado, 0, 0, Math.PI / 2), mtx(0, 0, -0.06)));
    const a = Math.atan(rise / (W / 2)), half = W / 2 + 0.5;
    k.box('corrugated', L + 0.8, 0.08, half / Math.cos(a), 0, H + rise - half / 2 * Math.tan(a) + 0.12, sgn * half / 2, sgn * a);
  }
  k.box('darksteel', L + 0.8, 0.14, 0.5, 0, H + rise + 0.16, 0);
  for (let x = -L / 2 + 0.3; x <= L / 2; x += 6) { // portal frames
    const xx = Math.min(x, L / 2 - 0.3);
    for (const sgn of [-1, 1]) { k.post('darksteel', 0.3, H, 0.3, xx, 0, sgn * (W / 2 - 0.35)); k.beam('darksteel', V(xx, H - 0.2, sgn * (W / 2 - 0.35)), V(xx, H + rise - 0.3, 0), 0.3); }
  }
  // roller-door frame and canopy
  k.box('darksteel', 6.6, 0.5, 0.5, 0, 5.4, W / 2 + 0.3); k.post('darksteel', 0.18, 5.1, 0.18, -3.15, 0, W / 2 + 0.2); k.post('darksteel', 0.18, 5.1, 0.18, 3.15, 0, W / 2 + 0.2);
  k.box('concrete', L, 0.12, W, 0, 0.06, 0);
  if (k.lod === 0) { k.box('corrugated', 2.2, 0.06, 1.2, 10, 2.9, W / 2 + 0.6, 0.12); k.box('concrete', 6.6, 0.18, 2.5, 0, 0.09, W / 2 + 1.2); }
};
// roller shutter 6.2 x 5.2 m with drum housing. origin bottom centre; scale Y (0..1) on the curtain part to open
P['door.roller'] = (k) => {
  k.box('shutter', 6.2, 5.0, 0.06, 0, 2.5, 0);
  k.box('darksteel', 6.2, 0.12, 0.1, 0, 0.06, 0.02);
  k.cyl('darksteel', 0.32, 0.32, 6.4, 12, 0, 5.2, -0.15, 0, 0, Math.PI / 2);
};
// ISO 20 ft container 6.06 x 2.59 x 2.44 (long axis X). variant '40' = 12.19 m. door end at +X
P['container'] = (k, o) => {
  const L = o.variant === '40' ? 12.19 : 6.06, H = 2.59, W = 2.44, c = 0.16;
  k.box('container', L - 0.12, H - 0.24, W - 0.08, 0, H / 2, 0);
  for (const x of [-L / 2 + c / 2, L / 2 - c / 2]) for (const z of [-W / 2 + c / 2, W / 2 - c / 2]) k.post('darksteel', c, H, c, x, 0, z);
  for (const y of [0.08, H - 0.08]) for (const z of [-W / 2 + 0.07, W / 2 - 0.07]) k.box('container', L, 0.16, 0.14, 0, y, z);
  for (const y of [0.08, H - 0.08]) for (const x of [-L / 2 + 0.07, L / 2 - 0.07]) k.box('container', 0.14, 0.16, W, x, y, 0);
  k.box('container', 0.05, H - 0.3, W - 0.3, L / 2 - 0.04, H / 2, 0); // doors
  for (let x = -L / 2 + 0.45; x < L / 2 - 0.3; x += 0.42) for (const z of [-W / 2 + 0.01, W / 2 - 0.01]) k.box('container', 0.13, H - 0.36, 0.05, x, H / 2, z);      // the corrugation, as ribs
  for (let z = -W / 2 + 0.35; z < W / 2 - 0.2; z += 0.42) k.box('container', 0.05, H - 0.36, 0.13, -L / 2 + 0.01, H / 2, z);
  k.box('darksteel', 0.07, H - 0.3, 0.03, L / 2 - 0.01, H / 2, 0);      // the doors' meeting line
  for (const z of [-0.85, -0.35, 0.35, 0.85]) { k.box('darksteel', 0.06, H - 0.3, 0.05, L / 2 + 0.02, H / 2, z); for (const y of [0.9, 1.7]) k.box('darksteel', 0.1, 0.08, 0.1, L / 2 + 0.04, y, z); }      // locking bars and their keepers
  if (k.lod === 0) { for (const z of [-0.85, -0.35, 0.35, 0.85]) k.cyl('darksteel', 0.025, 0.025, H - 0.3, 6, L / 2 + 0.02, H / 2, z); k.box('darksteel', 0.03, H - 0.3, 0.02, L / 2 - 0.01, H / 2, 0); }
};
// feeding tower: 4-leg steel lattice, 9 m deck, corrugated cab, crane jib with a hanging cage. origin at legs' centre
P['tower'] = (k) => {
  const S = 2.2, Y = 9;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.beam('darksteel', V(sx * S * 1.25, 0, sz * S * 1.25), V(sx * S, Y, sz * S), 0.24);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cbox('concrete', 0.9, 0.5, 0.9, 0.05, sx * S * 1.25, 0.2, sz * S * 1.25);
  for (let i = 0; i < 3; i++) { const y0 = i * 3, y1 = y0 + 3, f0 = 1.25 - 0.25 * y0 / Y, f1 = 1.25 - 0.25 * y1 / Y;
    for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) { k.beam('darksteel', V(ax * S * f0, y0, az * S * f0), V(bx * S * f1, y1, bz * S * f1), 0.09); k.beam('darksteel', V(ax * S * f1, y1, az * S * f1), V(bx * S * f1, y1, bz * S * f1), 0.12); } }
  k.box('deck', S * 2 + 1.2, 0.16, S * 2 + 1.2, 0, Y + 0.08, 0);
  const e = S + 0.6; for (const [x, z, w, d] of [[0, e, 2 * e, 0.06], [0, -e, 2 * e, 0.06], [e, 0, 0.06, 2 * e], [-e, 0, 0.06, 2 * e]]) { k.box('darksteel', w, 0.06, d, x, Y + 1.1, z); k.box('darksteel', w, 0.05, d, x, Y + 0.6, z); }
  for (const x of [-e, 0, e]) for (const z of [-e, e]) { k.post('darksteel', 0.07, 1.1, 0.07, x, Y, z); k.post('darksteel', 0.07, 1.1, 0.07, z, Y, x); }
  k.post('corrugated', 2.4, 2.3, 2.0, -0.8, Y + 0.16, -0.9); k.box('corrugated', 2.8, 0.08, 2.4, -0.8, Y + 2.5, -0.9, 0.08);
  k.box('darksteel', 1.0, 0.7, 0.04, -0.8, Y + 1.5, 0.12);
  k.post('darksteel', 0.35, 4.5, 0.35, 1.2, Y, 1.2); k.beam('darksteel', V(1.2, Y + 4.3, 1.2), V(7.5, Y + 3.8, 1.2), 0.28); k.beam('darksteel', V(1.2, Y + 2.2, 1.2), V(5, Y + 3.95, 1.2), 0.14);
  k.box('darksteel', 0.03, 4.4, 0.03, 7.3, Y + 1.6, 1.2);
  k.post('darksteel', 1.3, 1.3, 1.3, 7.3, Y - 1.2, 1.2); // cage (meat crate)
  for (let i = 0; i < 7; i++) { const y = 0.8 + i * 1.2; k.box('darksteel', 0.5, 0.03, 0.03, S * 1.18 - (y / Y) * S * 0.25, y, 0); }
};
// perimeter fence panel 6 m long (post at x=0, cables to x=6), 6 m high, 11 cables, outrigger; the next panel's post closes it
P['fence.panel'] = (k, o) => {
  const L = 6, H = 6;
  k.cbox('concrete', 0.8, 0.6, 0.8, 0.05, 0, 0.25, 0);
  k.post('darksteel', 0.32, H, 0.22, 0, 0.5, 0);
  k.beam('darksteel', V(0, H + 0.4, 0), V(0, H + 1.3, -0.8), 0.14);
  for (let i = 0; i < 11; i++) { const y = 0.9 + i * 0.5; k.box('darksteel', L, 0.03, 0.03, L / 2, y, 0.14); if (k.lod === 0) k.cyl('concrete', 0.05, 0.05, 0.14, 6, 0.1, y, 0.14, Math.PI / 2); }
  for (let i = 0; i < 2; i++) k.beam('darksteel', V(0, H + 0.6 + i * 0.4, -0.25 - i * 0.4), V(L, H + 0.6 + i * 0.4, -0.25 - i * 0.4), 0.03);
  if (o.variant === 'sign' || k.lod === 0) { k.box('sign', 0.9, 0.6, 0.02, 1.2, 1.9, 0.22); }
};
// main gate frame: two 2.4 m timber-clad pylons, 11 m high, header beam; opening 10 m wide x 9 m high (along X)
P['gate'] = (k) => {
  for (const sx of [-1, 1]) {
    k.cbox('concrete', 3.2, 2.0, 3.2, 0.12, sx * 6.2, 1.0, 0);
    for (const dx of [-0.75, 0, 0.75]) for (const dz of [-0.75, 0, 0.75]) if (Math.abs(dx) + Math.abs(dz) > 0) k.cyl('timber', 0.42, 0.45, 9.5, k.lod ? 6 : 9, sx * 6.2 + dx, 2 + 4.75, dz);
    k.cyl('timber', 0.5, 0.5, 9.8, 8, sx * 6.2, 2 + 4.9, 0);
    for (const y of [3.2, 10.5]) k.cbox('darksteel', 2.6, 0.3, 2.6, 0.03, sx * 6.2, y, 0);
  }
  k.cbox('timber', 15.6, 1.6, 1.6, 0.1, 0, 10.2, 0);
  k.box('darksteel', 15.8, 0.25, 1.7, 0, 9.4, 0); k.box('darksteel', 15.8, 0.25, 1.7, 0, 11.0, 0);
  if (k.lod === 0) for (const sx of [-1, 1]) { k.cyl('darksteel', 0.15, 0.25, 0.9, 8, sx * 7.1, 12.0, 0); k.cyl('darksteel', 0.35, 0.15, 0.4, 8, sx * 7.1, 12.6, 0); }
};
// one gate leaf 5 x 8.5 m, hinge at x=0, swings about Y; leaf extends to +X
P['gate.leaf'] = (k) => {
  const w = 5, h = 8.5;
  for (let i = 0; i < 10; i++) k.cyl('timber', 0.22, 0.24, h, k.lod ? 6 : 8, 0.25 + i * 0.5, h / 2 + 0.2, 0);
  for (const y of [1.2, h / 2, h - 0.8]) k.box('darksteel', w + 0.1, 0.3, 0.6, w / 2, y, 0);
  k.beam('darksteel', V(0.3, 1.2, 0.3), V(w - 0.2, h - 0.8, 0.3), 0.18);
  k.post('darksteel', 0.3, h + 0.4, 0.3, 0, 0, 0);
};
// gatehouse: 4.5 x 3.5 m concrete booth, 3 m walls, corrugated roof, window + door openings
P['gatehouse'] = (k) => {
  const w = 4.5, d = 3.5, h = 3;
  wall(k, 'concrete', w, h, 0.22, [[0.5, 1.0, 2.4, 1.1]], mtx(0, 0, d / 2));
  wall(k, 'concrete', w, h, 0.22, [], mtx(0, 0, -d / 2, 0, Math.PI));
  wall(k, 'concrete', d - 0.22, h, 0.22, [[0, 0, 1.0, 2.2]], mtx(w / 2 - 0.11, 0, 0, 0, Math.PI / 2));
  wall(k, 'concrete', d - 0.22, h, 0.22, [[0, 1.0, 1.6, 1.0]], mtx(-w / 2 + 0.11, 0, 0, 0, -Math.PI / 2));
  k.box('corrugated', w + 1.2, 0.08, d + 1.0, 0, h + 0.2, 0, 0.1);
  k.box('concrete', w, 0.1, d, 0, 0.05, 0);
  k.box('concrete', 3, 0.08, 0.5, 0.5, 1.0, d / 2 + 0.2);
  // boom barrier
  k.cbox('darksteel', 0.5, 1.0, 0.5, 0.04, w / 2 + 1.0, 0.5, d / 2 + 1.0); k.box('sign', 0.12, 0.12, 6.0, w / 2 + 1.0, 1.0, d / 2 + 4.0);
};
// jetty bay 2.4 m wide x 8 m long (along Z), deck top at y=0.5, piles to y=-2.5. variant 'rail' adds handrails (boardwalk)
P['jetty'] = (k, o) => {
  const W = 2.4, L = 8, Y = 0.5;
  for (let z = -L / 2 + 0.11; z < L / 2; z += 0.23) k.box('deck', W, 0.06, 0.205, 0, Y - 0.03, z, 0, (Math.sin(z * 9) * 0.01));
  for (const x of [-0.9, 0.9]) k.box('timber', 0.12, 0.24, L, x, Y - 0.18, 0);
  for (const z of [-L / 2 + 0.2, 0, L / 2 - 0.2]) { k.box('timber', W + 0.2, 0.22, 0.14, 0, Y - 0.38, z); for (const x of [-1.2, 1.2]) k.cyl('timber', 0.14, 0.16, 3.6, k.lod ? 6 : 8, x, Y - 1.6 + (o.variant === 'rail' ? 0 : 0.2), z); }
  if (o.variant === 'rail') for (const x of [-1.2, 1.2]) { k.box('timber', 0.09, 0.12, L, x, Y + 0.95, 0); k.box('timber', 0.06, 0.08, L, x, Y + 0.5, 0); for (const z of [-L / 2 + 0.2, 0, L / 2 - 0.2]) k.post('timber', 0.11, 1.05, 0.11, x, Y - 0.1, z); }
  else if (k.lod === 0) { k.cyl('darksteel', 0.12, 0.14, 0.35, 8, 0.9, Y + 0.17, L / 2 - 0.4); }
};
// culvert: 2.4 m bore concrete pipe, 10 m long along Z, invert at y=0; headwall + wing walls at each end
P['culvert'] = (k) => {
  const ri = 1.2, ro = 1.45, L = 10, cy = ri, seg = k.lod ? 12 : 20;
  const ring = new THREE.Shape(); ring.absarc(0, 0, ro, 0, Math.PI * 2, false); const hole = new THREE.Path(); hole.absarc(0, 0, ri, 0, Math.PI * 2, true); ring.holes.push(hole);
  k.add('concrete', new THREE.ExtrudeGeometry(ring, { depth: L, bevelEnabled: false, curveSegments: seg / 2 }), mtx(0, cy, -L / 2));
  for (const sz of [-1, 1]) {
    const s = new THREE.Shape(); s.moveTo(-3, -0.4); s.lineTo(3, -0.4); s.lineTo(3, 3.4); s.lineTo(-3, 3.4); s.closePath();
    const h = new THREE.Path(); h.absarc(0, cy, ri, 0, Math.PI * 2, true); s.holes.push(h);
    k.shape('concrete', s, 0.45, mtx(0, 0, sz * (L / 2) - (sz > 0 ? 0 : 0.45)));
    k.cbox('concrete', 6.4, 0.3, 0.6, 0.04, 0, 3.5, sz * (L / 2 - 0.05));
    for (const sx of [-1, 1]) { const ww = new THREE.Shape(); ww.moveTo(0, -0.4); ww.lineTo(3.2, -0.4); ww.lineTo(3.2, 0.6); ww.lineTo(0, 3.4); ww.closePath(); const dx = sx * 0.5, dz = sz * 0.87; k.shape('concrete', ww, 0.35, mtx(sx * 2.85, 0, sz * L / 2, 0, Math.atan2(-dz, dx), 0)); }
  }
  k.box('concrete', 2.0, 0.06, L + 1, 0, 0.03, 0); // silt floor
};
// visitor-centre ruins
P['ruin.column'] = (k, o) => {
  const broken = o.variant === 'broken', H = broken ? 3.4 : 6.2, r = rng(broken ? 11 : 3);
  k.cbox('concrete', 0.7, H, 0.7, 0.04, 0, H / 2, 0);
  k.cbox('concrete', 1.1, 0.5, 1.1, 0.05, 0, 0.25, 0);
  if (!broken) k.cbox('concrete', 1.3, 0.45, 1.3, 0.06, 0, H - 0.22, 0);
  else { for (let i = 0; i < 5; i++) k.add('concrete', new THREE.TetrahedronGeometry(0.28 + r() * 0.18, 0), mtx((r() - 0.5) * 0.4, H + 0.05, (r() - 0.5) * 0.4, r() * 3, r() * 3, r() * 3, 1, 0.7, 1));
    if (k.lod === 0) for (let i = 0; i < 4; i++) k.beam('darksteel', V((i % 2 - 0.5) * 0.4, H - 0.3, (Math.floor(i / 2) - 0.5) * 0.4), V((i % 2 - 0.5) * 0.4 + (r() - 0.5) * 0.5, H + 0.6 + r() * 0.6, (Math.floor(i / 2) - 0.5) * 0.4 + (r() - 0.5) * 0.5), 0.035); }
};
function jagged(w, d, seed, rough) { // rectangle outline with one or two broken edges
  const r = rng(seed), s = new THREE.Shape(), pts = [];
  const edge = (x0, y0, x1, y1, broken) => { const n = broken ? 7 : 1; for (let i = 0; i < n; i++) { const t = i / n; const j = broken && i > 0 ? (r() - 0.5) * rough : 0; const nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny); pts.push([x0 + (x1 - x0) * t + nx / l * j - Math.abs(nx / l) * (broken ? rough * 0.4 : 0) * Math.sign(nx), y0 + (y1 - y0) * t + ny / l * j - Math.abs(ny / l) * (broken ? rough * 0.4 : 0) * Math.sign(ny)]); } };
  edge(-w / 2, -d / 2, w / 2, -d / 2, false); edge(w / 2, -d / 2, w / 2, d / 2, true); edge(w / 2, d / 2, -w / 2, d / 2, r() > 0.5); edge(-w / 2, d / 2, -w / 2, -d / 2, false);
  s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); return s;
}
// floor slab 6 x 6 x 0.35 with broken edge (+X), downstand beams; origin at slab underside centre
P['ruin.slab'] = (k, o) => {
  const seed = 5 + (o.seed | 0), s = jagged(6, 6, seed, 1.0);
  k.shape('concrete', s, 0.35, mtx(0, 0, 0, -Math.PI / 2));
  k.box('concrete', 0.5, 0.5, 6, -2.6, -0.25, 0); k.box('concrete', 4.5, 0.5, 0.45, -0.6, -0.25, -2.8);
  if (k.lod === 0) { const r = rng(seed); for (let i = 0; i < 9; i++) { const z = -2.6 + i * 0.6; k.beam('darksteel', V(2.2, 0.17, z), V(3.1 + r() * 0.5, 0.2 + (r() - 0.6) * 0.5, z + (r() - 0.5) * 0.3), 0.03); } }
};
// wall panel 6 x 4 x 0.3 with window hole and a broken top; origin bottom centre
P['ruin.wall'] = (k, o) => {
  const r = rng(9 + (o.seed | 0)), s = new THREE.Shape(); s.moveTo(-3, 0); s.lineTo(3, 0);
  for (let i = 0; i <= 8; i++) s.lineTo(3 - i * 0.75, 4 - (i > 1 && i < 7 ? r() * 1.6 : r() * 0.3) - (i > 4 ? 0.8 : 0));
  s.closePath(); const h = new THREE.Path(); h.moveTo(-1.8, 1.0); h.lineTo(-1.8, 2.4); h.lineTo(-0.4, 2.4); h.lineTo(-0.4, 1.0); h.closePath(); s.holes.push(h);
  k.shape('concrete', s, 0.3, mtx(0, 0, -0.15));
  k.box('concrete', 6.2, 0.35, 0.45, 0, 0.17, 0);
};
// --- procedural dressing
P['prop.drum'] = (k) => { const s = k.lod ? 10 : 16; k.cyl('steel', 0.29, 0.29, 0.86, s, 0, 0.44, 0); k.cyl('darksteel', 0.3, 0.3, 0.04, s, 0, 0.3, 0, 0, 0, 0, true); k.cyl('darksteel', 0.3, 0.3, 0.04, s, 0, 0.6, 0, 0, 0, 0, true); };
P['prop.pallet'] = (k) => { for (let i = 0; i < 7; i++) k.box('deck', 0.1, 0.022, 1.2, -0.5 + i * 0.167, 0.133, 0); for (const z of [-0.55, 0, 0.55]) k.box('timber', 1.0, 0.1, 0.1, 0, 0.07, z); };
P['prop.lamp'] = (k) => { k.cbox('concrete', 0.6, 0.5, 0.6, 0.04, 0, 0.25, 0); k.cyl('darksteel', 0.07, 0.1, 7, 8, 0, 3.5, 0); k.beam('darksteel', V(0, 6.8, 0), V(1.4, 7.1, 0), 0.07); k.box('darksteel', 0.6, 0.14, 0.3, 1.5, 7.05, 0); };
P['prop.sign'] = (k) => { for (const x of [-0.7, 0.7]) k.post('darksteel', 0.06, 2.6, 0.06, x, 0, 0); k.box('sign', 1.8, 1.1, 0.03, 0, 2.0, 0.04); };
P['prop.hay'] = (k) => { const r = rng(4); for (let i = 0; i < 6; i++) k.box('hay', 1.2, 0.5, 0.5, (i % 3) * 1.25 - 1.25 + r() * 0.1, 0.25 + Math.floor(i / 3) * 0.5, r() * 0.1, 0, r() * 0.08, 0); };
// procedural boulders / bluff blocks (rock material); variant = seed
function rockGeo(seed, detail, sx, sy, sz, rough) {
  const g = new THREE.IcosahedronGeometry(1, detail); const r = rng(seed); const p = g.attributes.position; const v = new THREE.Vector3();
  const ph = [r() * 6, r() * 6, r() * 6];
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 1 + rough * (0.5 * Math.sin(v.x * 3.1 + ph[0]) * Math.sin(v.y * 2.7 + ph[1]) + 0.35 * Math.sin(v.z * 5.3 + v.x * 4.1 + ph[2]) + 0.15 * Math.sin(v.y * 11 + v.z * 9));
    v.multiplyScalar(n); v.y = Math.max(v.y, -0.35 - 0.1 * Math.sin(v.x * 4)); if (v.y > 0.55) v.y = 0.55 + (v.y - 0.55) * 0.4; p.setXYZ(i, v.x * sx, (v.y + 0.35) * sy, v.z * sz); }
  g.deleteAttribute('normal'); g.deleteAttribute('uv'); const m = mergeVerts(g); m.computeVertexNormals(); return m;
}
function mergeVerts(g) { // icosahedron is non-indexed: index by position so normals smooth
  const p = g.attributes.position, map = new Map(), idx = [], pos = [];
  for (let i = 0; i < p.count; i++) { const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`; let j = map.get(key); if (j === undefined) { j = pos.length / 3; map.set(key, j); pos.push(p.getX(i), p.getY(i), p.getZ(i)); } idx.push(j); }
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setIndex(idx); return o;
}
P['rock.boulder'] = (k, o) => { const g = rockGeo(13 + (o.seed | 0) * 7, k.lod ? 1 : 2, 1.6, 1.3, 1.3, 0.35); k.add('rock', g); };
P['rock.bluff'] = (k, o) => { const g = rockGeo(29 + (o.seed | 0) * 7, k.lod ? 2 : 3, 7, 6, 4.5, 0.42); k.add('rock', g); };

export const ARENA_KINDS = [...Object.keys(P), 'container.40', 'boardwalk', 'fence.post', ...Object.values(GLB_PACKS).flat()];
const ALIAS = { 'container.40': ['container', { variant: '40' }], boardwalk: ['jetty', { variant: 'rail' }], 'barn.wall.door': ['barn.wall', { variant: 'door' }], 'ruin.column.broken': ['ruin.column', { variant: 'broken' }] };

// meshopt-quantized GLB meshes carry their dequantization in the node matrix: bake it into float attributes
function bakeNode(o) {
  const src = o.geometry, geo = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(src.attributes)) {
    const n = a.count, s = a.itemSize, arr = new Float32Array(n * s);
    for (let i = 0; i < n; i++) for (let c = 0; c < s; c++) arr[i * s + c] = a.getComponent(i, c);
    geo.setAttribute(name, new THREE.BufferAttribute(arr, s));
  }
  if (src.index) geo.setIndex(src.index.clone());
  geo.applyMatrix4(o.matrixWorld); if (geo.attributes.normal) geo.normalizeNormals();
  return geo;
}
// --- library ------------------------------------------------------------------------------------
export function createArenaAssets({ tier = 'high', base = 'assets/arena/', renderer = null } = {}) {
  const lo = tier === 'low';
  const wind = { strength: uniform(1), dir: uniform(new THREE.Vector2(1, 0.3).normalize()) };
  const texLoader = new THREE.TextureLoader();
  const texCache = new Map();
  const loadTex = (name, srgb) => {
    if (!texCache.has(name)) texCache.set(name, new Promise((res) => texLoader.load(new URL(`${base}tex/${name}.webp`, document.baseURI).href, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = lo ? 1 : 4; res(t);
    }, undefined, () => res(null))));
    return texCache.get(name);
  };
  const mats = {}, texJobs = [];
  for (const [key, [tex, tile, fb, tint, rough, metal, nrm, ns]] of Object.entries(MATS)) {
    const m = new THREE.MeshStandardNodeMaterial({ color: fb, roughness: rough, metalness: metal });
    m.name = 'arena.' + key; mats[key] = m;
    if (tex) texJobs.push(loadTex(tex, true).then((t) => { if (!t) return; const c = t.clone(); c.repeat.set(1 / tile, 1 / tile); c.needsUpdate = true; m.map = c; m.color.set(tint); m.needsUpdate = true; }));
    if (nrm && !lo) texJobs.push(loadTex(nrm, false).then((t) => { if (!t) return; const c = t.clone(); c.repeat.set(1 / tile, 1 / tile); c.needsUpdate = true; m.normalMap = c; m.normalScale.set(ns, ns); m.needsUpdate = true; }));
  }
  // vertex-coloured materials: foliage (with sway) and static
  const swayMats = new Map();
  function swayMaterial(amount) {
    const key = amount.toFixed(2); if (swayMats.has(key)) return swayMats.get(key);
    const m = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, side: THREE.DoubleSide });
    m.name = 'arena.foliage.' + key;
    if (amount > 0) {
      const ph = hash(instanceIndex).mul(6.283);
      const y = max(positionLocal.y, 0);
      const bend = pow(y.mul(0.16), 1.6).mul(0.09 * amount).mul(wind.strength);
      const t = time.mul(1.3).add(ph);
      const gust = sin(t).mul(0.6).add(sin(t.mul(2.3).add(positionLocal.x.mul(0.5))).mul(0.25)).add(0.35);
      const flutter = sin(time.mul(6.0).add(positionLocal.x.mul(3.1)).add(positionLocal.z.mul(2.3)).add(ph)).mul(0.015 * amount).mul(wind.strength).mul(y.mul(0.3).min(1));
      m.positionNode = positionLocal.add(vec3(wind.dir.x.mul(gust).mul(bend), flutter, wind.dir.y.mul(gust).mul(bend).add(flutter)));
    }
    swayMats.set(key, m); return m;
  }
  const vcolStatic = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.05 }); vcolStatic.name = 'arena.vcol';

  const cache = new Map(), glbKinds = new Map(); // kind -> [lod0 parts, lod1 parts]
  function prefab(kind, opts = {}) {
    const lod = opts.lod ?? (lo ? 1 : 0);
    const variant = opts.variant ?? '', seed = opts.seed ?? 0;
    const key = `${kind}|${lod}|${variant}|${seed}`; if (cache.has(key)) return cache.get(key);
    let out = null;
    if (ALIAS[kind]) return prefab(ALIAS[kind][0], { ...opts, ...ALIAS[kind][1] });
    if (kind === 'fence.post') { const k = new Kit(lod); k.cbox('concrete', 0.8, 0.6, 0.8, 0.05, 0, 0.25, 0); k.post('darksteel', 0.32, 6, 0.22, 0, 0.5, 0); k.beam('darksteel', V(0, 6.4, 0), V(0, 7.3, -0.8), 0.14); out = finish(kind, k.build().map((p) => ({ geometry: p.geometry, material: mats[p.mat] }))); }
    else if (P[kind]) { const k = new Kit(lod); P[kind](k, { variant, seed }); out = finish(kind, k.build().map((p) => ({ geometry: p.geometry, material: mats[p.mat] }))); }
    else if (glbKinds.has(kind)) { const l = glbKinds.get(kind); out = l[Math.min(lod, l.length - 1)]; }
    if (out) cache.set(key, out);
    return out;
  }
  function finish(kind, parts) {
    let tris = 0; const box = new THREE.Box3();
    for (const p of parts) { const g = p.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; g.computeBoundingBox(); box.union(g.boundingBox); }
    return { kind, parts, tris: Math.round(tris), draws: parts.length, bounds: box, sway: parts.some((p) => !!p.material.positionNode) };
  }
  // GLB packs
  const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const scanMats = new Map();
  function scanMaterial(src) {
    if (scanMats.has(src)) return scanMats.get(src);
    const m = new THREE.MeshStandardNodeMaterial({ map: src.map, normalMap: lo ? null : src.normalMap, roughness: 0.85, metalness: 0, color: 0xb8b4ac });
    if (m.map) { m.map.anisotropy = lo ? 1 : 4; m.map.colorSpace = THREE.SRGBColorSpace; }
    m.name = 'arena.scan.' + (src.name || ''); scanMats.set(src, m); return m;
  }
  const packJobs = Object.keys(GLB_PACKS).map((pack) => fetch(new URL(`${base}${pack}.glb.json`, document.baseURI).href).then((r) => { if (!r.ok) throw new Error(`${pack}.glb.json ${r.status}`); return r.json(); }).then((j) => { const bin = atob(j.b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return gltf.parseAsync(u8.buffer, new URL(base, document.baseURI).href); }).then((g) => {
    const byKind = {};
    g.scene.updateMatrixWorld(true);
    g.scene.traverse((o) => { if (!o.isMesh) return; const [k0, l] = o.name.split('@'); const kind = k0.replace(/~/g, '.'); (byKind[kind] ||= [])[+l] = o; });
    for (const [kind, lods] of Object.entries(byKind)) {
      glbKinds.set(kind, lods.map((o) => {
        const geo = bakeNode(o); let mat;
        if (ROCK_GEO.has(kind)) { const g2 = boxUV(geo); g2.computeVertexNormals(); return finish(kind, [{ geometry: g2, material: mats.rock }]); }
        if (geo.attributes.color) mat = pack === 'foliage' || kind === 'rock.mossy' || kind === 'prop.nest' ? swayMaterial(SWAY[kind] ?? 0) : vcolStatic;
        else mat = scanMaterial(o.material);
        return finish(kind, [{ geometry: geo, material: mat }]);
      }));
    }
  }).catch((e) => console.warn('[arenaassets] pack failed', pack, e)));

  const lib = {
    tier, materials: mats, wind,
    ready: Promise.all([...packJobs, ...texJobs]).then(() => lib),
    kinds: () => [...new Set([...Object.keys(P), ...Object.keys(ALIAS), 'fence.post', ...glbKinds.keys()])],
    has: (kind) => !!(P[kind] || ALIAS[kind] || kind === 'fence.post' || glbKinds.has(kind)),
    get: prefab,
    setWind(strength, dx = 1, dz = 0.3) { wind.strength.value = strength; wind.dir.value.set(dx, dz).normalize(); },
    swayMaterial,
    mesh(kind, opts = {}) {
      const p = prefab(kind, opts); if (!p) return null; const g = new THREE.Group(); g.name = kind;
      for (const part of p.parts) { const m = new THREE.Mesh(part.geometry, part.material); m.castShadow = opts.castShadow ?? true; m.receiveShadow = true; g.add(m); }
      return g;
    },
    instanced(kind, matrices, opts = {}) {
      const p = prefab(kind, opts); if (!p) return null; const g = new THREE.Group(); g.name = kind + '*' + matrices.length;
      for (const part of p.parts) {
        const im = new THREE.InstancedMesh(part.geometry, part.material, matrices.length);
        matrices.forEach((m, i) => im.setMatrixAt(i, m)); if (opts.colors) opts.colors.forEach((c, i) => im.setColorAt(i, c));
        im.castShadow = opts.castShadow ?? true; im.receiveShadow = true; im.computeBoundingSphere(); g.add(im);
      }
      return g;
    },
    dispose() { for (const p of cache.values()) for (const part of p.parts) part.geometry.dispose(); for (const m of [...Object.values(mats), ...swayMats.values(), ...scanMats.values(), vcolStatic]) m.dispose(); cache.clear(); },
  };
  return lib;
}
