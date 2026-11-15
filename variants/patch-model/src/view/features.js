// The arena's own features, drawn: water (the river, the pond and the channel between them), tall grass and reeds, and the
// BLOCKOUT of every placed solid thing (paddock.js `things`): untextured boxes and cylinders exactly the size of their colliders,
// one instanced draw for the boxes, one for the posts and stems, one for the door leaves (which follow terrain.doors live).
// The asset pass replaces the blockout with dressed models. Also re-spaces the ground mesh so it is fine inside the fence and
// coarse outside it, at the same vertex count. Called once from buildWorld; `update` runs every frame (world.update).
import * as THREE from 'three/webgpu';
import { materialColor, abs as tabs, uniform, vec2, vec3, float, mix, smoothstep, sin, cos, dot, normalize, positionLocal, positionWorld, time, uv, texture, attribute, instanceIndex, hash, mx_noise_float, mx_fractal_noise_float, transformNormalToView, normalWorld, oneMinus, cameraPosition } from 'three/tsl';
import { makeRng } from '../math.js';
import { createArenaAssets, CONTAINER_TINTS } from './arenaassets.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Re-space an N x N PlaneGeometry (already rotated flat): uniform spacing inside +-inner, growing geometrically outside. */
function warpGround(geo, size, inner, outerSegs) {
  const p = geo.attributes.position, N = Math.round(Math.sqrt(p.count)) - 1, half = size / 2, innerSegs = N - 2 * outerSegs, si = 2 * inner / innerSegs;
  // growth factor so outerSegs segments starting at si reach the edge
  let lo = 1, hi = 3; for (let k = 0; k < 60; k++) { const r = (lo + hi) / 2; let s = 0, d = si; for (let i = 0; i < outerSegs; i++) { d *= r; s += d; } if (s > half - inner) hi = r; else lo = r; }
  const r = (lo + hi) / 2, xs = new Float32Array(N + 1);
  for (let i = 0; i <= innerSegs; i++) xs[outerSegs + i] = -inner + i * si;
  let d = si, x = inner; for (let i = 1; i <= outerSegs; i++) { d *= r; x += d; xs[outerSegs + innerSegs + i] = Math.min(half, x); xs[outerSegs - i] = -Math.min(half, x); }
  xs[0] = -half; xs[N] = half;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const k = j * (N + 1) + i; p.setX(k, xs[i]); p.setZ(k, xs[j]); }
  p.needsUpdate = true;
  /** Vertex index range covering [x0, x1] (for anything that wants to reshade a region). */
  geo.userData.indexRange = (a, b) => { let i0 = 0, i1 = N; while (i0 < N && xs[i0 + 1] < a) i0++; while (i1 > 0 && xs[i1 - 1] > b) i1--; return [i0, i1]; };
  geo.userData.spacing = si;
}

function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** A lumpy rock, welded so it shades smooth. */
function rockGeo(detail, seed) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, rr = makeRng(seed), v = new THREE.Vector3();
  const bumps = Array.from({ length: 7 }, () => [new THREE.Vector3(rr() - 0.5, rr() - 0.5, rr() - 0.5).normalize(), rr() * 0.3]);
  const cuts = Array.from({ length: 9 }, () => [new THREE.Vector3(rr() - 0.5, (rr() - 0.5) * 1.2, rr() - 0.5).normalize(), 0.75 + rr() * 0.2]);      // cleavage planes: flat broken faces
  const map = new Map(), P = [], I = [];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const key = `${Math.round(v.x * 1e4)},${Math.round(v.y * 1e4)},${Math.round(v.z * 1e4)}`;
    let j = map.get(key);
    if (j === undefined) { let f = 1; for (const [b, a] of bumps) f += a * Math.max(0, v.dot(b) - 0.35) * 1.5; for (const [n, d] of cuts) { const c = v.dot(n); if (c > 0.05) f = Math.min(f, d / c); } f *= 1 + (rr() - 0.5) * 0.08; j = P.length / 3; map.set(key, j); P.push(v.x * f, v.y * f * 0.8, v.z * f); }
    I.push(j);
  }
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); o.setIndex(I); o.computeVertexNormals(); return o;
}

export function buildFeatures(scene, terrain, Q, groundGeo, U) {
  const lo = Q && Q.tier === 'low', PD = terrain.paddock; if (!PD) return null;
  const out = { meshes: [] };
  if (groundGeo) warpGround(groundGeo, terrain.size, 106, lo ? 9 : 12);
  const add = (m, shadow = false) => { m.receiveShadow = true; m.castShadow = shadow; m.userData.feature = true; scene.add(m); out.meshes.push(m); return m; };
  const R = makeRng(PD.seed * 31 + 5), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3(), e = new THREE.Euler();

  // ---- water: the pond's level, and the stream as a ribbon that follows its bed down the gully
  {
    const P = [], I = [], A = [];
    const pond = PD.pond, segs = lo ? 40 : 72, wl = PD.river.wl - 0.02;
    { const c = P.length / 3; P.push(pond.x, wl, pond.z); A.push(1);
      for (let i = 0; i <= segs; i++) { const a = (i / segs) * Math.PI * 2, x0 = pond.x + Math.sin(a), z0 = pond.z + Math.cos(a), rr = pond.R(x0, z0) + 1.0; P.push(pond.x + Math.sin(a) * rr, wl, pond.z + Math.cos(a) * rr); A.push(0); if (i) I.push(c, c + i, c + i + 1); } }
    const strip = (pts, half) => { const b0 = P.length / 3; pts.forEach(([x, z], i) => { P.push(x, wl, z - half, x, wl, z + half); A.push(0.6, 0.6); if (i) { const a = b0 + (i - 1) * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }); };
    { const pts = []; for (let x = -100; x <= 100.01; x += lo ? 4 : 2) pts.push([x, PD.riverZ(x)]); strip(pts, PD.river.half + 0.7); }
    { const z0 = PD.riverZ(91), b0 = P.length / 3; P.push(88.6, wl, z0, 93.4, wl, z0, 88.6, wl, -56, 93.4, wl, -56); A.push(0.4, 0.4, 0.4, 0.4); I.push(b0, b0 + 2, b0 + 1, b0 + 1, b0 + 2, b0 + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('wdeep', new THREE.Float32BufferAttribute(A, 1)); g.setIndex(I);
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(P.length).fill(0).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.08, metalness: 0, side: THREE.DoubleSide });
    const wp = positionWorld.xz, deep = attribute('wdeep', 'float');
    const n1 = mx_noise_float(vec3(wp.mul(0.9), time.mul(0.35))), n2 = lo ? float(0) : mx_noise_float(vec3(wp.mul(3.1).add(vec2(time.mul(0.25), 0)), time.mul(0.6)));
    // peat-dark water, a little lighter where shallow; the sky in it comes from the environment light
    const mud = float(0), md = n1.mul(0.5).add(0.5);
    const waterC = mix(vec3(0.045, 0.05, 0.04), vec3(0.02, 0.028, 0.03), deep.max(0)).mul(float(0.9).add(n1.mul(0.1)));
    m.colorNode = mix(waterC, mix(vec3(0.028, 0.019, 0.011), vec3(0.05, 0.036, 0.022), md), mud).mul(mix(float(1), float(0.8), U.wet));
    m.roughnessNode = mix(float(0.1).add(U.rain.mul(0.16)).add(n2.mul(0.04)), mix(float(0.45), float(0.14), U.wet), mud);
    const rip = lo ? float(0) : mx_noise_float(vec3(wp.mul(7.0), time.mul(2.2))).mul(U.rain).mul(0.06);      // rain on the surface
    const tilt = vec3(n1.mul(0.09).add(n2.mul(0.06)).add(rip), 1, mx_noise_float(vec3(wp.mul(0.9).add(7.3), time.mul(0.35))).mul(0.09).add(rip.mul(0.8))).add(vec3(U.wind.x, 0, U.wind.y).mul(0.02));
    m.normalNode = normalize(transformNormalToView(normalize(tilt)));
    if (lo) {      // phones have no environment map: the sky in the water is put in directly, strongest at grazing angles
      const vd = normalize(cameraPosition.sub(positionWorld)), fres = oneMinus(vd.y.max(0)).pow(4).mul(oneMinus(mud));
      m.emissiveNode = mix(vec3(U.fog), vec3(U.hor), 0.5).mul(fres.mul(0.55).add(0.04)).mul(float(1).add(n1.mul(0.15)));
    }
    add(new THREE.Mesh(g, m));
  }

  // ---- tall grass and reeds: crossed cards of long blades, swaying with the gusts that cross the grass
  {
    const tex = canvasTex(256, (g, S) => {
      const rr = makeRng(37); g.clearRect(0, 0, S, S);
      for (let i = 0; i < 120; i++) {
        const u = rr(), x = S * (0.06 + 0.88 * u), edge = 1 - Math.abs(u - 0.5) * 1.2, hgt = S * (0.45 + rr() * 0.53 * edge), lean = (rr() - 0.5) * 50 + (u - 0.5) * 40, v = 140 + rr() * 100, w = 2 + rr() * 2.2;
        const dry = rr() < 0.55;
        g.fillStyle = dry ? `rgb(${v | 0},${v * 0.88 | 0},${v * 0.55 | 0})` : `rgb(${v * 0.72 | 0},${v * 0.9 | 0},${v * 0.45 | 0})`;
        const tx = x + lean, ty = S - hgt, mx = x + lean * 0.3, my = S - hgt * 0.6;
        g.beginPath(); g.moveTo(x - w / 2, S); g.quadraticCurveTo(mx - w * 0.3, my, tx, ty); g.quadraticCurveTo(mx + w * 0.3, my, x + w / 2, S); g.fill();
        if (rr() < 0.18) { g.fillStyle = `rgb(${120 + rr() * 50 | 0},${100 + rr() * 40 | 0},${70 + rr() * 20 | 0})`; g.beginPath(); g.ellipse(tx, ty + 6, 2.4, 9, lean * 0.01, 0, 7); g.fill(); }
      }
    });
    const cards = [0, Math.PI / 3, (2 * Math.PI) / 3].map((ry) => { const g = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateY(ry); return g; });
    const geo = new THREE.BufferGeometry();
    for (const name of ['position', 'uv']) geo.setAttribute(name, new THREE.Float32BufferAttribute(cards.flatMap((g) => [...g.attributes[name].array]), name === 'uv' ? 2 : 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(12).fill([0, 1, 0]).flat(), 3));
    geo.setIndex(cards.flatMap((g, k) => Array.from(g.index.array, (i) => i + 4 * k)));
    // how many clumps: by patch area, kept off water deeper than a reed's foot, out of the gully walls
    const spots = [];
    const density = lo ? 0.55 : 1.6;
    for (const G of PD.grass) {
      const n = Math.round(Math.PI * G.r * G.r * density * (G.kind === 'reed' ? 1.3 : 1) * 0.35);
      for (let i = 0; i < n; i++) {
        const a = R() * 6.283, d = Math.sqrt(R()) * G.r, x = G.x + Math.sin(a) * d, z = G.z + Math.cos(a) * d;
        if (terrain.depthAt(x, z) > (G.kind === 'reed' ? 0.5 : 0.05) || terrain.slopeAt(x, z) > 0.7) continue;
        const c = terrain.coverAt(x, z); if (c < 0.12 && G.kind !== 'reed') continue;
        spots.push([x, z, G.h * (0.65 + 0.45 * Math.min(1, c * 1.3)) * R.range(0.85, 1.15), G.kind === 'reed' ? 1 : 0]);
      }
    }
    const NGt = spots.length, ip = new Float32Array(NGt * 2);
    const tint = uniform(new THREE.Color(0xc8b98a));
    const m = new THREE.MeshStandardNodeMaterial({ alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
    m.normalNode = normalize(transformNormalToView(vec3(0, 1, 0)));
    const tx = texture(tex, uv()), tip = uv().y, ph = hash(instanceIndex).mul(6.283), ipos = attribute('ipos', 'vec2');
    m.colorNode = tx.rgb.mul(tint).mul(mix(float(0.42), float(1.12), tip)).mul(mix(float(1), float(0.62), U.wet));
    m.opacityNode = tx.a;
    const wd = U.wind.div(U.wind.length().max(0.01)), gust = sin(dot(ipos, wd).mul(0.16).sub(time.mul(U.wind.length().mul(0.55).add(0.6)))).mul(0.5).add(0.5);
    const w = gust.mul(gust).mul(1.2).add(sin(time.mul(1.9).add(ph)).mul(0.15)).add(0.25), amt = positionLocal.y.mul(positionLocal.y).mul(0.06);
    m.positionNode = positionLocal.add(vec3(U.wind.x, 0, U.wind.y).mul(w).mul(amt));
    const im = new THREE.InstancedMesh(geo, m, Math.max(1, NGt)); const col = new THREE.Color();
    spots.forEach(([x, z, h, reed], i) => {
      q.setFromAxisAngle(t.set(0, 1, 0), R() * 6.283); const wdt = reed ? 0.9 : 1.25;
      m4.compose(t.set(x, terrain.height(x, z) - 0.05, z), q, s.set(wdt * h * 0.75, h, wdt * h * 0.75)); im.setMatrixAt(i, m4);
      col.setHSL(reed ? 0.2 + R() * 0.05 : 0.11 + R() * 0.04, reed ? 0.3 : 0.32 + R() * 0.15, 0.42 + R() * 0.16); im.setColorAt(i, col);
      ip[i * 2] = x; ip[i * 2 + 1] = z;
    });
    geo.setAttribute('ipos', new THREE.InstancedBufferAttribute(ip, 2));
    im.frustumCulled = false; add(im, false);
    out.grass = im;
  }

  // ---- blockout: every placed solid thing as an untextured box or cylinder of its collider's size, coloured by material tag
  {
    const MAT = { timber: 0x8a6a48, concrete: 0x9a978e, block: 0x86827a, steel: 0x6f767c, container: 0x8f4a32, fence: 0x55584f, rock: 0x6d665c, wood: 0x7a6248,
      pipe: 0x8c8a84, hay: 0xb59a55, bamboo: 0x86a05a, jungle: 0x4f4636 };
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
    const col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    const boxes = PD.things.filter((t) => ['wall', 'slab', 'deck', 'mast', 'catwalk', 'ladder', 'roof'].includes(t.kind) && t.of !== 'fence');
    const cyls = PD.things.filter((t) => t.kind === 'post' || t.kind === 'trunk');
    const bx = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), mat, Math.max(1, boxes.length));
    boxes.forEach((th, i) => {
      // a wall or slab is a pillar chain of radius w/2 along its run, so it reaches w/2 past each end
      const along = th.kind === 'wall' || th.kind === 'slab' ? th.l + th.w : th.l;
      q.setFromAxisAngle(up, th.yaw); m4.compose(t.set(th.x, th.y, th.z), q, s.set(th.w, th.h, along)); bx.setMatrixAt(i, m4);
      bx.setColorAt(i, col.setHex(MAT[th.mat] || 0x888888).multiplyScalar(th.kind === 'slab' ? 0.85 : 1));
    });
    const cy = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, lo ? 6 : 8, 1).translate(0, 0.5, 0), mat, Math.max(1, cyls.length));
    cyls.forEach((th, i) => {
      const y = th.kind === 'trunk' ? terrain.height(th.x, th.z) - 0.2 : th.y;
      m4.compose(t.set(th.x, y, th.z), q.identity(), s.set(th.r, th.h + (th.kind === 'trunk' ? 0.2 : 0), th.r)); cy.setMatrixAt(i, m4);
      cy.setColorAt(i, col.setHex(MAT[th.mat] || 0x888888));
    });
    const doors = terrain.doors || [], dm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0.5), mat, Math.max(1, doors.length));
    doors.forEach((d, i) => dm.setColorAt(i, col.setHex(d.type === 'shutter' ? 0x6b5038 : d.type === 'big' ? 0x7a5634 : 0x5c4a3a)));
    const setDoors = () => doors.forEach((d, i) => { q.setFromAxisAngle(up, d.ang); m4.compose(t.set(d.hinge[0], d.y0, d.hinge[1]), q, s.set(d.type === 'big' ? 0.16 : 0.08, d.h, d.len)); dm.setMatrixAt(i, m4); });
    setDoors(); dm.instanceMatrix.needsUpdate = true;
    for (const m of [bx, cy, dm]) { m.castShadow = true; m.frustumCulled = false; add(m, true); }
    out.blockMeshes = { bx, cy, dm };
    out.blockout = { boxes: boxes.length, cylinders: cyls.length, doors: doors.length };
    const last = doors.map((d) => d.ang);
    out.update = () => { let ch = false; doors.forEach((d, i) => { if (d.ang !== last[i]) { last[i] = d.ang; ch = true; } }); if (ch) { setDoors(); dm.instanceMatrix.needsUpdate = true; } };
  }

  out.groundZones = groundZones(PD);
  out.interiorShade = interiorShade(interiorRects(PD), U);
  dressArena(scene, terrain, Q, U, out);
  return out;
}

// ======================================================================================== DRESSING
// The blockout replaced by the asset library (arenaassets.js). Every solid thing is drawn from its own collider box (so what you
// see is what stops you), in the library's materials, merged per material; prefabs are used where they fit their colliders
// (containers, silo, ruin columns, the cave roof, rubble, gate) and scaled to them; door leaves follow terrain.doors live.
// Downloaded kinds (trees, bamboo) arrive later: until then the blockout stems stand in. Renderer-agnostic (node materials).

/** Planar UVs in world metres per face (walls: horizontal, y; floors: x, z) on a non-indexed geometry. */
function worldUV(g) {
  g = g.index ? g.toNonIndexed() : g;
  const p = g.attributes.position, n = p.count, uvA = new Float32Array(n * 2), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), f = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    f.subVectors(c, b).cross(a.clone().sub(b)); const ax = Math.abs(f.x), ay = Math.abs(f.y), az = Math.abs(f.z);
    for (let k = 0; k < 3; k++) { const v = k === 0 ? a : k === 1 ? b : c; let u, w; if (ay >= ax && ay >= az) { u = v.x; w = v.z; } else if (ax >= az) { u = v.z; w = v.y; } else { u = v.x; w = v.y; } uvA[(i + k) * 2] = u; uvA[(i + k) * 2 + 1] = w; }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uvA, 2)); return g;
}

/** Interior rects of the roofed shells [cx, cz, yaw, hw, hd, y0, y1]: light inside them is cut (see interiorShade). */
export function interiorRects(PD) {
  const R = [];
  for (const S of PD.structures) if (['barn', 'warehouse', 'gatehouse'].includes(S.id)) R.push([S.cx, S.cz, S.yaw, S.hw - 0.1, S.hd - 0.1, S.base - 1, S.base + (S.roof || S.h) + 0.05]);
  return R;
}

/** What the arena's ground is made of at (x, z): [gravel, concrete, jungle floor, mud], 0..1 each (the ground shader blends them,
 * the grass keeps off all but mud). Concrete: the pads and aprons of the buildings, the ruins' floor; gravel: the service yard;
 * jungle floor: under the jungle and the bamboo (and the game trail); mud: the wet banks of the river and the pond. */
function groundZones(PD) {
  const pads = []; let barn = null;      // [cx, cz, hw, hd]; the barn's floor is trodden earth and straw (mud), its aprons concrete
  for (const S of PD.structures) {
    if (S.id === 'barn') barn = S, pads.push([S.cx + 5, S.cz + S.hd + 2.2, 3.2, 2.2], [S.cx - 6, S.cz - S.hd - 2.2, 3.2, 2.2]);
    else if (S.id === 'warehouse') pads.push([S.cx, S.cz, S.hw + 0.8, S.hd + 0.8], [S.cx + S.hw + 3.5, S.cz, 3.5, 3.0]);
    else if (S.id === 'gatehouse') pads.push([S.cx, S.cz, S.hw + 1.5, S.hd + 1.5], [S.cx + 11, S.cz + 1, 6.5, 3.5]);
    else if (S.id === 'containers') pads.push([S.cx, S.cz, S.hw + 0.6, S.hd + 0.6]);
    else if (S.id === 'ruins') pads.push([S.cx, S.cz, S.hw + 0.4, S.hd + 0.4]);
    else if (S.id === 'silo') pads.push([S.cx, S.cz, 4.2, 4.2]);
    else if (S.id === 'tower') pads.push([S.cx, S.cz, 2.6, 2.6]);
  }
  return (x, z) => {
    let conc = 0;
    for (const [cx, cz, hw, hd] of pads) { const e = Math.max(Math.abs(x - cx) - hw, Math.abs(z - cz) - hd); if (e < 1.2) conc = Math.max(conc, Math.min(1, (1.2 - e) / 1.2)); }
    const pn = PD.placeName(x, z), yard = pn === 'the yard' || pn === 'the warehouse' || pn === 'the containers' ? 1 : 0;
    const jungle = pn === 'the jungle' || pn === 'the bamboo' || pn === 'the trail' ? 1 : 0;
    const w = PD.wetAt(x, z), mud = PD.depthAt(x, z) > 0.02 ? 0 : Math.min(1, Math.max(0, (w - 0.08) * 3));
    const earth = barn && Math.abs(x - barn.cx) < barn.hw + 0.3 && Math.abs(z - barn.cz) < barn.hd + 0.3 ? 0.8 : 0;
    return [yard * (1 - conc), conc * (1 - earth), jungle, Math.max(earth, mud * (1 - conc))];
  };
}

/** 1 outdoors, falling to a dim ~0.3 inside the roofed shells (barn, warehouse, gatehouse): sky light does not reach in there.
 * A colour multiplier for every surface inside (shell materials, the ground); the light that does come in through the door and
 * window gaps is drawn as soft additive patches and shafts (see dressArena). */
function interiorShade(rects, U) {
  let inside = float(0);
  for (const [cx, cz, , hw, hd, y0, y1] of rects) {
    const dx = tabs(positionWorld.x.sub(cx)), dz = tabs(positionWorld.z.sub(cz));
    const k = smoothstep(hw + 0.05, hw - 0.45, dx).mul(smoothstep(hd + 0.05, hd - 0.45, dz)).mul(smoothstep(y1 + 0.02, y1 - 0.3, positionWorld.y)).mul(smoothstep(y0, y0 + 0.3, positionWorld.y));
    inside = inside.max(k);
  }
  return float(1).sub(inside.mul(mix(float(0.56), float(0.3), U.flash.min(1))));
}

function dressArena(scene, terrain, Q, U, out) {
  const lo = Q && Q.tier === 'low', PD = terrain.paddock;
  let lib;
  try { lib = createArenaAssets({ tier: lo ? 'low' : 'high' }); } catch (e) { console.warn('[dress] no asset library', e); return; }
  out.lib = lib;
  for (const key of ['timber', 'deck', 'concrete', 'corrugated', 'darksteel', 'steel', 'shutter', 'hay']) if (lib.materials[key]) lib.materials[key].colorNode = materialColor.mul(out.interiorShade).mul(key === 'timber' ? 1.35 : 1);
  if (lib.materials.corrugated) {      // rust: streaks running down from the fixings and seams, a darker wet foot
    const hcoord = positionWorld.x.add(positionWorld.z), st2 = mx_noise_float(vec3(hcoord.mul(3.1), positionWorld.y.mul(0.18), 1.7)), blot = mx_noise_float(vec3(positionWorld.xz.mul(0.4), positionWorld.y.mul(0.5)));
    const rust = smoothstep(0.15, 0.6, st2.mul(0.7).add(blot.mul(0.5))).mul(0.85);
    lib.materials.corrugated.colorNode = mix(materialColor, vec3(0.32, 0.15, 0.07), rust).mul(out.interiorShade);
    lib.materials.corrugated.roughnessNode = mix(float(0.55), float(0.9), rust);
  }
  const M = lib.materials, up = new THREE.Vector3(0, 1, 0), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3();
  const R = makeRng(PD.seed * 17 + 3);
  const bins = new Map(); let district = 'misc'; const put = (key, g) => { if (key === 'timberV') { key = 'timber'; g.userData.vert = true; } const k2 = key + '|' + (lo ? 'all' : district); (bins.get(k2) || bins.set(k2, []).get(k2)).push(g); };
  const DIST = { barn: 'n', loft: 'n', silo: 'n', warehouse: 'y', containers: 'y', gatehouse: 'g', ruins: 'r', tower: 't', culvert: 's', jetty: 's', cave: 'e', rubble: 'e' };
  // a box standing on (x, y, z), thickness w (local x), height h, length l along local z, turned by yaw
  const box = (key, w, h, l, x, y, z, yaw = 0, rx = 0) => { const g = new THREE.BoxGeometry(w, h, l); g.translate(0, h / 2, 0); if (rx) g.rotateX(rx); g.rotateY(yaw); g.translate(x, y, z); put(key, g); };
  const cyl = (key, r0, r1, h, x, y, z, seg = lo ? 6 : 10) => { const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1); g.translate(x, y + h / 2, z); put(key, g); };
  const beam = (key, a, b, th) => { const d = new THREE.Vector3().subVectors(b, a), L = d.length(); const g = new THREE.BoxGeometry(th, L, th); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d.normalize())); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); put(key, g); };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const S = Object.fromEntries(PD.structures.map((x) => [x.id, x]));
  const T = PD.things, hide = { box: new Set(), cyl: new Set() };
  const groups = [];      // instanced prefab groups added to the scene
  const addGroup = (g, shadow = true) => { if (!g) return null; g.traverse((o) => { if (o.isMesh) { o.castShadow = shadow; o.receiveShadow = true; o.userData.feature = true; } }); scene.add(g); groups.push(g); return g; };

  // ---- shells, from the colliders
  const roofHoles = [];      // [x, z, half-depth, eaves y, floor y] of the barn roof's missing sheets
  for (const th of T) {
    if (th.of === 'fence' || th.kind === 'door' || th.kind === 'trunk') continue;
    const st = S[th.of]; district = DIST[th.of] || 'misc';
    const along = th.kind === 'wall' || th.kind === 'slab' ? th.l + th.w : th.l;
    if (th.of === 'barn') {      // built from the colliders: posts, girts and board-and-gap cladding, trimmed openings, open trusses
      const cy = Math.cos(th.yaw), sy = Math.sin(th.yaw);
      const at = (sAlong, off) => [th.x + sy * sAlong + cy * off, th.z + cy * sAlong - sy * off];      // along local z, across local x
      const pc = (key, w, h, l, sA, off, y, yaw = th.yaw) => { const [x, z] = at(sA, off); box(key, w, h, l, x, y, z, yaw); };
      const lx = (th.x - st.cx) * Math.cos(st.yaw) - (th.z - st.cz) * Math.sin(st.yaw), lz = (th.x - st.cx) * Math.sin(st.yaw) + (th.z - st.cz) * Math.cos(st.yaw);
      const outer = Math.abs(Math.abs(lx) - st.hw) < 0.3 || Math.abs(Math.abs(lz) - st.hd) < 0.3;
      const out1 = Math.sign((th.x - st.cx) * cy - (th.z - st.cz) * sy) || 1;      // which face of the run looks outside
      if (th.kind === 'wall' && outer) {
        const pl = Math.min(0.45, th.h); box('concrete', th.w + 0.06, pl, along + 0.02, th.x, th.y - 0.3, th.z, th.yaw);
        if (th.h > pl) {
          const top = th.y + th.h, nP = Math.max(1, Math.round(along / 3));
          for (let k = 0; k <= nP; k++) pc('timberV', 0.2, th.h - pl + 0.05, 0.2, -along / 2 + 0.1 + (along - 0.2) * k / nP, -out1 * 0.05, th.y + pl - 0.05);      // posts
          for (const gy of [1.35, 3.1, 4.9]) if (gy < th.h - 0.3) pc('timber', 0.08, 0.15, along, 0, -out1 * 0.16, th.y + gy);      // girts inside
          for (let s0 = -along / 2; s0 < along / 2 - 0.05;) {      // boards, with gaps of light between them
            const bw = Math.min(R.range(0.24, 0.33), along / 2 - s0), gp = R() < 0.14 ? R.range(0.04, 0.11) : R.range(0.008, 0.02), c = s0 + bw / 2;
            const miss = R() < 0.035, brk = R() < 0.07, h0 = th.y + pl - 0.08, h1 = top - (th.h > 5 ? R.range(0, 0.08) : 0);
            if (!miss) { const hb = brk ? (h1 - h0) * R.range(0.45, 0.85) : h1 - h0; pc('timberV', 0.035, hb, bw, c, out1 * (th.w / 2 - 0.03) + R.range(-0.01, 0.01), h0); if (brk && h1 - h0 - hb > 0.6) pc('timberV', 0.035, (h1 - h0 - hb) * R.range(0.2, 0.6), bw, c, out1 * (th.w / 2 - 0.03), h1 - (h1 - h0 - hb) * 0.35); }
            s0 += bw + gp;
          }
          pc('timber', 0.06, 0.14, along, 0, out1 * (th.w / 2 + 0.01), th.y + pl - 0.1);      // a sole board over the plinth
        }
      } else if (th.kind === 'wall') {      // inside: stall partitions of horizontal planks on posts
        for (const e of [-1, 1]) pc('timberV', 0.18, th.h + 0.15, 0.18, e * (along / 2 - 0.12), 0, th.y);
        for (let y = 0.08; y < th.h - 0.1;) { const ph = R.range(0.18, 0.26); if (R() > 0.06) pc('timber', 0.06, ph, along - 0.2, 0, R.range(-0.02, 0.02), th.y + y); y += ph + R.range(0.02, 0.07); }
        pc('timber', 0.12, 0.1, along, 0, 0, th.y + th.h);      // a cap rail
      } else if (th.kind === 'slab') {      // a lintel over a door or window: boards above, a header and jambs framing the gap
        for (let s0 = -along / 2; s0 < along / 2 - 0.05;) { const bw = Math.min(R.range(0.24, 0.33), along / 2 - s0); pc('timberV', 0.035, th.h, bw, s0 + bw / 2, out1 * (th.w / 2 - 0.03), th.y); s0 += bw + (R() < 0.15 ? R.range(0.03, 0.08) : 0.012); }
        pc('timber', th.w + 0.08, 0.16, along, 0, 0, th.y - 0.08);
        const g0 = th.w / 4 + 0.08;
        for (const e of [-1, 1]) pc('timberV', th.w + 0.08, th.y - st.base, 0.15, e * (along / 2 - th.w / 2 - g0 + 0.15), 0, st.base);
        if (th.h > 2.5) pc('timber', 0.1, 0.15, along, 0, -out1 * 0.16, th.y + th.h - 1.4);
      } else if (th.kind === 'roof') {      // a pitched corrugated roof on purlins and trusses, a few sheets gone; board-and-gap gables
        const hw = st.hw + 0.5, hd = st.hd + 0.6, rise = 3.2, a = Math.atan2(rise, hd), len = Math.hypot(hd, rise), y0 = th.y;
        for (const sg of [-1, 1]) for (let x = -hw; x < hw - 0.01; x += 1.1) {
          if (R() < 0.07 && Math.abs(x) < hw - 3) { roofHoles.push([th.x + x + 0.55, th.z - sg * hd / 2, hd, y0, st.base]); continue; }      // a sheet blown off: sky and rain through the hole
          const part = R() < 0.06 ? R.range(0.35, 0.7) : 1, L2 = len * part;
          const g = new THREE.BoxGeometry(1.14, 0.05, L2); g.translate(0, 0, (len - L2) / 2 * (R() < 0.5 ? 1 : -1)); g.rotateX(-sg * a); g.translate(th.x + x + 0.55, y0 + rise / 2 + 0.06 + R.range(-0.01, 0.01), th.z - sg * hd / 2); put('corrugated', g);
        }
        box('darksteel', 0.5, 0.14, hw * 2 + 0.05, th.x, y0 + rise, th.z, Math.PI / 2);
        for (const sg of [-1, 1]) for (const f of [0.15, 0.42, 0.7, 0.93]) { const zz = th.z - sg * hd * (1 - f), yy = y0 + rise * f - 0.12; box('timber', 0.1, 0.14, hw * 2, th.x, yy, zz, Math.PI / 2); }      // purlins
        for (const sg of [-1, 1]) for (let z = -st.hd - 0.2; z < st.hd + 0.2;) {      // gables
          const bw = R.range(0.24, 0.32), hz = rise * (1 - Math.abs(z + bw / 2) / hd) - 0.06; if (hz > 0.1 && R() > 0.04) box('timberV', 0.035, hz, bw, th.x + sg * (st.hw + 0.17), y0 - 0.02, th.z + z + bw / 2, 0); z += bw + (R() < 0.15 ? R.range(0.03, 0.1) : 0.012);
        }
        for (let x = -st.hw + 3; x < st.hw - 1; x += 3) {      // trusses: tie, rafters, king post, struts
          const X = th.x + x, ry = rise * st.hd / hd;
          box('timber', 0.18, 0.26, st.hd * 2, X, y0 - 0.26, th.z, 0);
          for (const sg of [-1, 1]) { beam('timber', V(X, y0, th.z + sg * st.hd), V(X, y0 + ry, th.z), 0.18); beam('timber', V(X, y0, th.z + sg * st.hd * 0.05), V(X, y0 + ry * 0.5, th.z + sg * st.hd * 0.5), 0.12); }
          beam('timber', V(X, y0, th.z), V(X, y0 + ry, th.z), 0.16);
        }
      }
      continue;
    }
    if (th.of === 'loft') {
      if (th.kind === 'slab') { box('deck', th.w + 0.18, th.h, along, th.x, th.y, th.z, th.yaw); if (Math.abs(th.z - st.cz) > 6.1) for (const e of [-1, 1]) box('timber', 0.2, th.y - st.base, 0.2, st.cx + e * (st.hw - 0.15), st.base, th.z); }
      else if (th.kind === 'ladder') { for (const sd of [-0.25, 0.25]) box('timber', 0.08, th.h, 0.08, th.x + Math.cos(th.yaw) * 0 + Math.sin(th.yaw) * sd, th.y, th.z + Math.cos(th.yaw) * sd, 0); for (let y = 0.3; y < th.h; y += 0.32) box('timber', 0.06, 0.05, 0.56, th.x, th.y + y, th.z, th.yaw); }
      else if (th.kind === 'catwalk') { box('darksteel', th.w, 0.06, th.l, th.x, th.y, th.z, th.yaw); for (const sd of [-0.5, 0.5]) { const ox = Math.cos(th.yaw) * sd, oz = -Math.sin(th.yaw) * sd; box('darksteel', 0.05, 0.05, th.l, th.x + ox, th.y + 1.0, th.z + oz, th.yaw); } }
      continue;
    }
    if (th.of === 'silo') { if (th.kind === 'ladder') { for (const sd of [-0.25, 0.25]) box('darksteel', 0.06, th.h, 0.06, th.x, th.y, th.z + sd); for (let y = 0.3; y < th.h; y += 0.35) box('darksteel', 0.04, 0.04, 0.5, th.x, th.y + y, th.z, th.yaw); } continue; }
    if (th.of === 'warehouse') {
      if (th.id === 'warehouse.roller') {      // slatted roller door stuck half up, its drum box, guides, dock bumpers and a striped sill
        for (let y = 0; y < th.h - 0.05; y += 0.12) box('shutter', th.w * (y % 0.24 < 0.12 ? 1 : 0.7), 0.11, th.l, th.x, th.y + y, th.z, th.yaw);
        box('darksteel', 0.7, 0.7, th.l + 0.4, th.x + 0.2, th.y + th.h - 0.2, th.z, th.yaw);
        for (const e of [-1, 1]) { box('darksteel', 0.18, th.y + th.h - st.base, 0.12, th.x + 0.2, st.base, th.z + e * (th.l / 2 + 0.06), th.yaw); box('darksteel', 0.3, 0.45, 0.25, th.x + 0.3, st.base + 0.6, th.z + e * (th.l / 2 + 0.45), th.yaw); }
        box('sign', 0.6, 0.04, th.l, th.x + 0.4, st.base + 0.005, th.z, th.yaw); continue; }
      if (th.kind === 'wall') {
        const dado = Math.min(th.h, 1.2), cy = Math.cos(th.yaw), sy = Math.sin(th.yaw), out1 = Math.sign((th.x - st.cx) * cy - (th.z - st.cz) * sy) || 1;
        const outer = Math.abs(Math.abs(th.x - st.cx) - st.hw) < 0.3 || Math.abs(Math.abs(th.z - st.cz) - st.hd) < 0.3;
        const pc = (key, w, h, l, sA, off, y) => box(key, w, h, l, th.x + sy * sA + cy * off, y, th.z + cy * sA - sy * off, th.yaw);
        if (!outer) { box('darksteel', th.w, th.h, along, th.x, th.y, th.z, th.yaw); for (let y = 0.9; y < th.h; y += 1.1) pc('steel', th.w + 0.1, 0.06, along, 0, 0, th.y + y); continue; }      // racks
        box('concrete', th.w + 0.04, dado, along + 0.02, th.x, th.y, th.z, th.yaw);
        if (th.h > dado) {      // sheet panels, overlapped and a little out of true; steel columns and an eaves beam outside
          for (let s0 = -along / 2; s0 < along / 2 - 0.05;) { const bw = Math.min(R.range(0.95, 1.1), along / 2 - s0); if (R() > 0.03) pc('corrugated', 0.05, th.h - dado + 0.02 - R.range(0, 0.15) * (R() < 0.15 ? 1 : 0), bw + 0.04, s0 + bw / 2, out1 * (th.w / 2 - 0.04 + R.range(-0.012, 0.012)), th.y + dado - 0.02); s0 += bw; }
          pc('darksteel', 0.12, th.h - dado, along - 0.1, 0, -out1 * 0.1, th.y + dado);
          const nP = Math.max(1, Math.round(along / 3.3)); for (let k = 0; k <= nP; k++) pc('darksteel', 0.2, th.h + 0.15, 0.14, -along / 2 + 0.1 + (along - 0.2) * k / nP, out1 * (th.w / 2 + 0.08), th.y);
          pc('darksteel', 0.18, 0.22, along, 0, out1 * (th.w / 2 + 0.1), th.y + th.h - 0.1);
        }
      }
      else if (th.kind === 'slab') box(th.y - st.base < 2.4 ? 'concrete' : 'corrugated', th.w, th.h, along, th.x, th.y, th.z, th.yaw);
      else if (th.kind === 'roof') {
        const hw = st.hw + 0.4, hd = st.hd + 0.4, rise = 1.4, a = Math.atan2(rise, hd), len = Math.hypot(hd, rise), y0 = th.y;
        for (const sg of [-1, 1]) { const g = new THREE.BoxGeometry(hw * 2, 0.08, len); g.rotateX(-sg * a); g.translate(th.x, y0 + rise / 2 + 0.05, th.z - sg * hd / 2); put('corrugated', g); }
        for (const sg of [-1, 1]) { const sh = new THREE.Shape(); sh.moveTo(-st.hd, 0); sh.lineTo(st.hd, 0); sh.lineTo(0, rise * st.hd / hd); sh.closePath(); const g = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: false }); g.translate(0, 0, -0.06); g.rotateY(Math.PI / 2); g.translate(th.x + sg * st.hw, y0, th.z); put('corrugated', g); }
        for (let x = -st.hw + 2.5; x < st.hw; x += 5) box('darksteel', 0.25, 0.3, st.hd * 2, th.x + x, y0 - 0.3, th.z, 0);
      }
      continue;
    }
    if (th.of === 'gatehouse') { if (th.kind !== 'roof') box('concrete', th.w, th.h, along, th.x, th.y, th.z, th.yaw); continue; }
    if (th.of === 'containers' || th.of === 'silo' || th.of === 'cave' || th.of === 'rubble') continue;      // prefabs below
    if (th.of === 'ruins') {
      if (th.kind === 'wall') box('concrete', th.w, th.h, along, th.x, th.y, th.z, th.yaw);
      continue;      // posts and roof slabs: prefabs / slabs below
    }
    if (th.of === 'tower') {
      if (th.kind === 'post') { cyl('timberV', th.r, th.r * 0.85, th.h, th.x, th.y, th.z); box('concrete', th.r * 3.2, 0.5, th.r * 3.2, th.x, th.y - 0.3, th.z, st.yaw); }
      else if (th.id === 'tower.mast') {      // X-bracing between the legs (above head height), a rail round the platform
        const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => st.local(i * 1.6, j * 1.6)), b0 = st.base;
        for (let k = 0; k < 4; k++) { const [ax, az] = legs[k], [bx, bz] = legs[(k + 1) % 4];
          for (const [y0, y1] of [[2.4, 4.3], [4.6, 8.0], [8.0, 11.4]]) { beam('timber', V(ax, b0 + y0, az), V(bx, b0 + y1, bz), 0.12); beam('timber', V(bx, b0 + y0, bz), V(ax, b0 + y1, az), 0.12); }
          for (const y of [8.0, 11.4]) beam('timber', V(ax, b0 + y, az), V(bx, b0 + y, bz), 0.14);
          const [cx2, cz2] = st.local(0, 0), e = 1.12; if (k !== 2) beam('timber', V(cx2 + (ax - cx2) * e, b0 + 5.45, cz2 + (az - cz2) * e), V(cx2 + (bx - cx2) * e, b0 + 5.45, cz2 + (bz - cz2) * e), 0.08); beam('timber', V(cx2 + (ax - cx2) * e, b0 + 4.5, cz2 + (az - cz2) * e), V(cx2 + (ax - cx2) * e, b0 + 5.5, cz2 + (az - cz2) * e), 0.08); }
      }
      if (th.id === 'tower.mast') { box('deck', th.w, th.h, th.l, th.x, th.y, th.z, th.yaw); for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const c = Math.cos(th.yaw), sn = Math.sin(th.yaw), lx = i * (th.w / 2 - 0.1), lz = j * (th.l / 2 - 0.1); box('timber', i ? 0.22 : th.w, 0.25, i ? th.l : 0.22, th.x + lx * c + lz * sn, th.y - 0.25, th.z - lx * sn + lz * c, th.yaw); } }
      else { box('darksteel', th.w, th.h, th.l, th.x, th.y, th.z, th.yaw); const ex = th.x + Math.sin(th.yaw) * -2.6, ez = th.z + Math.cos(th.yaw) * -2.6; box('darksteel', 0.03, 3.2, 0.03, ex, th.y - 3.2, ez); box('darksteel', 0.9, 0.9, 0.9, ex, th.y - 4.1, ez, th.yaw); }
      continue;
    }
    if (th.of === 'culvert') continue;      // drawn whole below
    if (th.of === 'jetty') {
      if (th.kind === 'post') { cyl('timberV', th.r, th.r, th.h, th.x, th.y, th.z, 7); if (th.z + 2.6 <= PD.LAYOUT.jetty.z1) box('timber', 0.1, 0.1, 2.6, th.x, th.y + th.h - 0.05, th.z + 1.3, 0); }
      else if (th.kind === 'deck') { box('deck', th.w, th.h, th.l, th.x, th.y, th.z, th.yaw); for (const sd of [-1, 1]) box('timber', 0.12, 0.22, th.l, th.x + sd * (th.w / 2 + 0.1), th.y - 0.12, th.z, th.yaw); for (let z = -th.l / 2 + 0.6; z < th.l / 2; z += 2.6) box('timber', th.w + 0.4, 0.16, 0.14, th.x, th.y - 0.25, th.z + z, th.yaw); }
      continue;
    }
    // anything else keeps a plain box in its material's nearest library material
    box(th.mat === 'rock' ? 'rock' : th.mat === 'steel' ? 'steel' : th.mat === 'concrete' || th.mat === 'block' || th.mat === 'pipe' ? 'concrete' : 'timber', th.w || th.r * 2, th.h, along || th.r * 2, th.x, th.y, th.z, th.yaw || 0);
  }
  // floors: concrete slabs inside the shells, the barn's earth floor stays ground
  for (const id of ['warehouse', 'gatehouse']) { const st = S[id]; district = DIST[id]; box('concrete', st.hw * 2 + 0.2, 0.12, st.hd * 2 + 0.2, st.cx, st.base - 0.06, st.cz, st.yaw + Math.PI / 2 * 0); }
  // the barn's floor: worn boards down the middle, loose straw drifted into the stalls and along the walls
  { const st = S.barn; district = 'n'; box('deck', st.hd * 2 - 0.2, 0.05, st.hw * 2 - 0.2, st.cx, st.base - 0.02, st.cz, st.yaw + Math.PI / 2);
    for (let k = 0; k < (lo ? 10 : 34); k++) { const x = st.cx + R.range(-st.hw + 0.6, st.hw - 0.6), z = st.cz + (R() < 0.5 ? -1 : 1) * R.range(2.5, st.hd - 0.4), w2 = R.range(0.5, 1.3), g = new THREE.CylinderGeometry(w2 * 0.6, w2, R.range(0.03, 0.1), 9, 1); g.scale(1, 1, R.range(0.5, 1)); g.rotateY(R() * 3); g.translate(x, st.base + 0.04, z); put('hay', g); } }
  // the ruins' surviving roof slabs, broken-edged concrete over the columns
  { const st = S.ruins; district = 'r'; for (const [a, b, c, d] of st.roofs) { const cx = (a + c) / 2, cz = (b + d) / 2, x = st.cx + cx * Math.cos(st.yaw) + cz * Math.sin(st.yaw), z = st.cz - cx * Math.sin(st.yaw) + cz * Math.cos(st.yaw); box('concrete', c - a + 0.5, 0.36, d - b + 0.5, x, st.base + 3.6, z, st.yaw); box('concrete', 0.5, 0.45, d - b + 0.5, x - (c - a) / 2 + 0.1, st.base + 3.15, z, st.yaw); } }
  // the culvert: a pipe in two lengths, its crown broken through in mid-river (where the slabs stop), headwalls at each end
  { const st = S.culvert, cv = PD.LAYOUT.culvert, y = st.base; district = 's';
    const ring = (z0, z1, full) => { const sh = new THREE.Shape(); if (full) sh.absarc(0, 0, 1.63, 0, Math.PI * 2, false); else { sh.moveTo(1.63, 0.45); sh.absarc(0, 0, 1.63, 0.28, Math.PI - 0.28, false); } const hole = new THREE.Path(); hole.absarc(0, 0, 1.08, 0, Math.PI * 2, true);
      const g = full ? new THREE.ExtrudeGeometry(Object.assign(sh, { holes: [hole] }), { depth: z1 - z0, bevelEnabled: false, curveSegments: lo ? 8 : 14 }) : null; if (g) { g.translate(0, 0.95, z0); g.rotateY(st.yaw); g.translate(st.cx, y, st.cz); put('concrete', g); } };
    ring(-cv.hd - 0.2, -1.3, true); ring(1.3, cv.hd + 0.2, true);
    for (const sx of [-1, 1]) box('concrete', 0.6, 1.9, 2.6, st.cx + sx * 1.33, y, st.cz, st.yaw);      // the broken middle: only the walls
    for (const e of [-1, 1]) { const sh = new THREE.Shape(); sh.moveTo(-3, -0.6); sh.lineTo(3, -0.6); sh.lineTo(3, 3.0); sh.lineTo(-3, 3.0); sh.closePath(); const hh = new THREE.Path(); hh.absarc(0, 0.95, 1.08, 0, Math.PI * 2, true); sh.holes.push(hh); const g = new THREE.ExtrudeGeometry(sh, { depth: 0.4, bevelEnabled: false, curveSegments: lo ? 8 : 14 }); g.translate(0, 0, e > 0 ? cv.hd + 0.2 : -cv.hd - 0.6); g.rotateY(st.yaw); g.translate(st.cx, y, st.cz); put('concrete', g); }
  }
  // ---- yard lamps: poles with sodium heads and warm pools on the wet ground (additive, no real lights: cheap on every tier)
  {
    district = 'y'; const spots = [[-40, 55], [-67, 53], [-37, 80], [-20, 64], [-50, 84]], P = [], A = [], I = [];
    const headMat = new THREE.MeshBasicNodeMaterial({ fog: false }); headMat.colorNode = vec3(1.0, 0.62, 0.25).mul(mix(float(1.2), float(4.0), U.rain));
    const heads = [];
    for (const [x, z] of spots) {
      const y = terrain.height(x, z); cyl('darksteel', 0.11, 0.07, 6.2, x, y, z, lo ? 5 : 8); box('concrete', 0.5, 0.35, 0.5, x, y - 0.1, z);
      beam('darksteel', V(x, y + 6.0, z), V(x + 0.9, y + 6.2, z + 0.4), 0.07);
      const hg = new THREE.BoxGeometry(0.55, 0.12, 0.3); hg.translate(x + 1.0, y + 6.12, z + 0.45); heads.push(hg);
      const cx = x + 1.0, cz = z + 0.45, b = P.length / 3, Rr = 7.5, n = 16; P.push(cx, terrain.height(cx, cz) + 0.04, cz); A.push(1);
      for (let i = 0; i <= n; i++) { const a = i / n * 6.283, px = cx + Math.sin(a) * Rr, pz = cz + Math.cos(a) * Rr; P.push(px, terrain.height(px, pz) + 0.04, pz); A.push(0); if (i) I.push(b, b + i, b + i + 1); }
    }
    const hm = new THREE.Mesh(mergeGeometries(heads), headMat); hm.userData.feature = true; scene.add(hm);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('glow', new THREE.Float32BufferAttribute(A, 1)); g.setIndex(I);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const gl = attribute('glow', 'float'); m.colorNode = vec3(1.0, 0.55, 0.22).mul(gl.mul(gl).mul(gl)).mul(mix(float(0.05), float(0.32), U.rain).add(U.wet.mul(0.1)));
    const pm = new THREE.Mesh(g, m); pm.renderOrder = 1; pm.userData.feature = true; scene.add(pm);
  }

  // merge per material
  const shells = [];
  for (const [key, list] of bins) {
    const geo = mergeGeometries(list.map((g) => { const vert = g.userData.vert; g = worldUV(g); if (vert) { const u = g.attributes.uv.array; for (let i = 0; i < u.length; i += 2) { const t0 = u[i]; u[i] = u[i + 1] * 0.7; u[i + 1] = t0 * 1.6; } } for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; }), false);
    if (!geo) continue; geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, M[key.split('|')[0].replace('timberV', 'timber')] || M.timber); m.castShadow = m.receiveShadow = true; m.userData.feature = true; scene.add(m); shells.push(m);
  }
  out.shells = shells;

  // ---- prefabs that fit their colliders
  // phones: static prefab copies (not live, not swaying, not tinted per copy) are baked into one mesh per material, not drawn per kind
  const late = new Map();
  const flushLate = () => {
    for (const [, { mat: lm, geos, shadow }] of late) { if (!geos.length) continue; const g = mergeGeometries(geos, false); if (!g) continue; g.computeBoundingSphere(); const m = new THREE.Mesh(g, lm); m.castShadow = shadow; m.receiveShadow = true; m.userData.feature = true; scene.add(m); groups.push(m); }
    late.clear();
  };
  const inst = (kind, mats, opts = {}) => {
    if (lo && !opts.live && !opts.colors) {
      const p = lib.get(kind, opts);
      if (p && p.parts.every((pt) => !pt.material.positionNode)) {
        for (const pt of p.parts) { const sig = Object.keys(pt.geometry.attributes).sort().join(',') + (pt.geometry.index ? 'i' : 'n'), k = pt.material.uuid + '|' + sig; const e = late.get(k) || late.set(k, { mat: pt.material, geos: [], shadow: opts.shadow ?? false }).get(k); for (const m0 of mats) e.geos.push(pt.geometry.clone().applyMatrix4(m0)); }
        return null;
      }
    }
    const g = lib.instanced(kind, mats, opts); if (g && opts.live) g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; }); return addGroup(g, opts.shadow ?? !lo);
  };
  const mat = (x, y, z, yaw, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromAxisAngle(up, yaw), V(sx, sy, sz));
  { // containers: two 40 ft boxes stacked in each wall ring (2.6 x 12.3 x 5.2 outside)
    const st = S.containers, ms = [], cols = [], c = new THREE.Color();
    for (const lx of [-3.8, 0, 3.8]) for (const lev of [0, 1]) { const x = st.cx + lx * Math.cos(st.yaw), z = st.cz - lx * Math.sin(st.yaw); const off = lev ? R.range(-0.25, 0.25) : 0; ms.push(mat(x + Math.sin(st.yaw) * off, st.base + lev * 2.6, z + Math.cos(st.yaw) * off, st.yaw + Math.PI / 2 + (lev ? R.range(-0.012, 0.012) : 0) + (R() < 0.5 ? Math.PI : 0), 1.01, 1.0, 2.6 / 2.44)); cols.push(c.setHex(CONTAINER_TINTS[(ms.length * 3) % CONTAINER_TINTS.length]).clone()); }
    inst('container.40', ms, { colors: cols, shadow: true });
  }
  { const st = S.silo; const g = lib.mesh('barn.silo'); if (g) { g.position.set(st.cx, st.base, st.cz); g.scale.set(3.3 / 3.2, 14 / 15, 3.3 / 3.2); addGroup(g); } }
  { // ruin columns: whole under the slabs, broken where the roof has fallen
    const st = S.ruins, whole = [], broken = [], rub = [];
    for (const th of T) if (th.of === 'ruins' && th.kind === 'post') {
      const dx = th.x - st.cx, dz = th.z - st.cz, lx = dx * Math.cos(st.yaw) - dz * Math.sin(st.yaw), lz = dx * Math.sin(st.yaw) + dz * Math.cos(st.yaw);
      const under = st.roofs.some(([a, b, c, d]) => lx > a - 0.5 && lx < c + 0.5 && lz > b - 0.5 && lz < d + 0.5), sc = th.r * 2 / 0.7;
      if (under) whole.push(mat(th.x, th.y, th.z, 0, sc, th.h / 6.2, sc));
      else { const hk = R() < 0.25 ? R.range(0.12, 0.3) : R.range(0.35, 1.0), m0 = mat(th.x, th.y, th.z, R() * 6.28, sc, th.h / 3.6 * hk, sc); m0.premultiply(new THREE.Matrix4().makeTranslation(-th.x, -th.y, -th.z)).premultiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(R.range(-0.05, 0.05), 0, R.range(-0.05, 0.05)))).premultiply(new THREE.Matrix4().makeTranslation(th.x, th.y, th.z)); broken.push(m0);
        if (R() < 0.6) for (let k = 0; k < 1 + (R() * 3 | 0); k++) { const a = R() * 6.28, d = R.range(0.45, 0.9), w2 = R.range(0.2, 0.45), hh = R.range(0.12, 0.3), g = new THREE.BoxGeometry(w2, hh, w2 * R.range(1, 2)); g.rotateY(R() * 3); g.translate(th.x + Math.sin(a) * d, th.y - 0.05 + hh / 2, th.z + Math.cos(a) * d); rub.push(g); } }
    }
    inst('ruin.column', whole); inst('ruin.column.broken', broken);
    if (rub.length) { const g = mergeGeometries(rub.map((g) => { g = worldUV(g); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; })); const rm = new THREE.Mesh(g, M.concrete); rm.receiveShadow = true; rm.castShadow = !lo; rm.userData.feature = true; scene.add(rm); }
  }
  { // the cave's rock roof: a bluff block, flat underneath at the roof height
    const C = PD.LAYOUT.cave, st = S.cave; const g = lib.mesh('rock.bluff', { seed: 2 }); if (g) { g.position.set((C.x0 + C.x1) / 2 + 0.4, st.base + C.roof - 0.05, (C.z0 + C.z1) / 2); g.scale.set(11.5 / 13.7, 3.2 / 7.3, 12.5 / 11.2); addGroup(g); }
  }
  { // rubble on the brink: boulders the size of their pillars
    const by = [[], [], []]; for (const th of T) if (th.of === 'rubble') by[(R() * 3) | 0].push(mat(th.x, th.y, th.z, R() * 6.28, th.r * 2 / 3.0, th.h / 1.5, th.r * 2 / 2.6));
    if (lo) inst('rock.boulder', by.flat(), { seed: 0 }); else by.forEach((ms, i) => ms.length && inst('rock.boulder', ms, { seed: i }));
  }
  { // the main gate in the north fence beside the gatehouse, shut
    const gz = PD.LAYOUT.fence, gx = 4;
    inst('gate', [mat(gx, -0.3, gz + 1.25, 0)]);
    inst('gate.leaf', [mat(gx - 5, -0.2, gz, 0), mat(gx + 5, -0.2, gz, Math.PI)]);
  }
  // the blockout boxes and posts are no longer needed: the shells and prefabs above cover every one
  if (out.blockMeshes) { out.blockMeshes.bx.visible = false; }

  flushLate();
  // ---- doors and shutters: prefab leaves scaled to their gaps, following terrain.doors
  const doors = terrain.doors || [];
  {
    const sets = { big: [], person: [], shutter: [] };
    doors.forEach((d) => sets[d.type in sets ? d.type : 'person'].push(d));
    const leaf = (d, sw, sh) => { q.setFromAxisAngle(up, d.ang); const r2 = new THREE.Quaternion().setFromAxisAngle(up, -Math.PI / 2); return new THREE.Matrix4().compose(t.set(d.hinge[0], d.y0, d.hinge[1]), q, s.set(1, 1, 1)).multiply(new THREE.Matrix4().compose(V(0, 0, d.len / 2), r2, V(d.len / sw, d.h / sh, 1))); };
    const kinds = { big: ['door.big', 4.1, 6.1], person: ['door.small', 1.1, 2.25] };
    const live = [];
    for (const [type, list] of Object.entries(sets)) {
      if (!list.length) continue;
      let g;
      if (kinds[type]) { const [kind, sw, sh] = kinds[type]; g = inst(kind, list.map((d) => leaf(d, sw, sh)), { live: true }); if (g) live.push([g, list, (d) => leaf(d, sw, sh)]); }
      else {      // shutters: board leaves
        const im = new THREE.InstancedMesh(worldUV(new THREE.BoxGeometry(0.07, 1, 1).translate(0, 0.5, 0.5)), M.deck, list.length); im.frustumCulled = false; im.castShadow = im.receiveShadow = true; scene.add(im);
        const fn = (d) => { q.setFromAxisAngle(up, d.ang); return new THREE.Matrix4().compose(t.set(d.hinge[0], d.y0, d.hinge[1]), q, s.set(1, d.h, d.len)); };
        g = new THREE.Group(); g.add(im); groups.push(g); live.push([g, list, fn]);
      }
    }
    const last = doors.map((d) => d.ang);
    const setAll = () => { for (const [g, list, fn] of live) { g.traverse((o) => { if (!o.isInstancedMesh) return; list.forEach((d, i) => o.setMatrixAt(i, fn(d))); o.instanceMatrix.needsUpdate = true; }); } };
    setAll();
    if (out.blockMeshes) out.blockMeshes.dm.visible = false;
    out.doorUpdate = () => { let ch = false; doors.forEach((d, i) => { if (d.ang !== last[i]) { last[i] = d.ang; ch = true; } }); if (ch) setAll(); };
  }

  // ---- light through the gaps: soft additive patches on the floor and a faint shaft inside every door and window of the dark shells
  {
    const P = [], A = [], I = [];
    const quad = (pts, al) => { const b = P.length / 3; for (const p of pts) P.push(...p); A.push(...al); I.push(b, b + 1, b + 2, b, b + 2, b + 3); };
    const gap = (x, z, nx, nz, w, ys, yt, y0) => {      // (nx, nz) points out; light comes in and down
      const ux = -nz, uz = nx, D = ys > 0.2 ? 3.2 + ys : 5.5, d0 = ys > 0.2 ? 0.4 + ys * 0.6 : 0.2, ww = w * 0.5, wf = w * 0.85, yf = y0 + 0.03;
      const at = (d, u, y) => [x - nx * d + ux * u, y, z - nz * d + uz * u];
      quad([at(d0, -ww, yf), at(d0, ww, yf), at(D, wf, yf), at(D, -wf, yf)], [0.9, 0.9, 0, 0]);      // the patch on the floor
      quad([at(0.25, 0, yt), at(0.25, 0, y0 + Math.max(ys, 0.05)), at(D, 0, yf), at(D * 0.7, 0, yf + 0.6)], [0.2, 0.3, 0, 0]);      // the shaft, edge-on from the door
    };
    for (const id of ['barn', 'warehouse', 'gatehouse']) { const st = S[id]; for (const o of st.openings) if (!o.up) { const l = Math.hypot(o.nx, o.nz) || 1; gap(o.x, o.z, o.nx / l, o.nz / l, o.w, 0, st.base + Math.min(4.5, o.y + 1.8), st.base); } }
    // the barn's windows: each pair of shutter leaves spans one
    const sh = doors.filter((d) => d.type === 'shutter' && d.of === 'barn' && d.id.endsWith('.l'));
    for (const d of sh) { const u = [Math.sin(d.closedYaw), Math.cos(d.closedYaw)], o = [Math.sin(d.openYaw), Math.cos(d.openYaw)], dt = o[0] * u[0] + o[1] * u[1]; let nx = o[0] - dt * u[0], nz = o[1] - dt * u[1]; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      const w = d.len * 2 + 0.04, x = d.hinge[0] + u[0] * w / 2, z = d.hinge[1] + u[1] * w / 2, base = S.barn.base; gap(x, z, nx, nz, w, d.y0 - base, d.y0 + d.h, base); }
    for (const [x, z, hd2, ye, yf] of roofHoles) {      // under a missing roof sheet: a pale strip on the floor and a faint column of rain-light
      const f = yf + 0.04, z0 = z - hd2 * 0.45, z1 = z + hd2 * 0.45;
      quad([[x - 0.9, f, z0], [x, f, z0], [x, f, z1], [x - 0.9, f, z1]], [0, 0.8, 0.8, 0]); quad([[x, f, z0], [x + 0.9, f, z0], [x + 0.9, f, z1], [x, f, z1]], [0.8, 0, 0, 0.8]);
      quad([[x, ye + 1.2, z0], [x, ye + 1.2, z1], [x, f, z1], [x, f, z0]], [0.35, 0.35, 0.05, 0.05]);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('glow', new THREE.Float32BufferAttribute(A, 1)); g.setIndex(I);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const gl = attribute('glow', 'float');
    const dust = mx_noise_float(positionWorld.mul(3.5).add(vec3(time.mul(0.12), time.mul(-0.05), time.mul(0.08)))).mul(0.45).add(mx_noise_float(positionWorld.mul(0.6)).mul(0.25)).add(0.8);      // motes and drifting dust in the light
    m.colorNode = vec3(U.fog).mul(1.2).add(vec3(U.sunCol).mul(0.05)).mul(gl.mul(gl)).mul(float(0.45).add(U.flash.mul(3.0))).mul(dust);
    const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 1; mesh.userData.feature = true; scene.add(mesh); out.gapLight = mesh;
  }

  // ---- stems: the jungle's trees and the bamboo clumps, near ones as full models, far ones as cheap stand-ins, by distance
  const stems = T.filter((th) => th.kind === 'trunk');
  out.pending = true;
  let trees = null;
  let NEAR = lo ? 12 : 42;
  out.setQuality = (P) => { const n = lo ? 12 : P.treeNear; if (n !== NEAR) { NEAR = n; lodAt = null; } };
  const buildTrees = () => {
    const spec = (th) => th.of === 'bamboo' ? 'bamboo' : th.h > 20 ? 'tree.araucaria' : 'tree.palm';
    const kinds = ['tree.palm', 'tree.araucaria', 'bamboo'], by = {};
    // trunk radius of each model at the foot, to scale it to the collider
    const footR = (p) => { let rs = []; for (const part of p.parts) { const a = part.geometry.attributes.position; for (let i = 0; i < a.count; i++) { const y = a.getY(i); if (y > 0.2 && y < 1.2) rs.push(Math.hypot(a.getX(i), a.getZ(i))); } } rs.sort((a, b) => a - b); return rs.length ? rs[Math.floor(rs.length * 0.6)] : 0.3; };
    const far = { // stand-ins: a tapered stem and a low crown in the model's colours (about 40 triangles)
      'tree.palm': (() => { const k = [new THREE.CylinderGeometry(0.16, 0.24, 9, 5, 1).translate(0, 4.5, 0), new THREE.IcosahedronGeometry(1, 0).scale(3.0, 0.9, 3.0).translate(0, 8.7, 0)]; return k; })(),
      'tree.araucaria': (() => [new THREE.CylinderGeometry(0.2, 0.4, 22, 5, 1).translate(0, 11, 0), new THREE.ConeGeometry(4.2, 9, 6, 1).translate(0, 17.5, 0)])(),
      bamboo: (() => [new THREE.CylinderGeometry(0.4, 1.6, 10, 6, 1, true).translate(0, 5, 0)])(),
    };
    const farMat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide });
    for (const kind of kinds) {
      const list = stems.filter((th) => spec(th) === kind); if (!list.length) continue;
      const p = lib.get(kind, { lod: lo ? 1 : 0 }); if (!p) continue;
      const r0 = kind === 'bamboo' ? 3.0 : footR(p), H0 = p.bounds.max.y;
      const ms = list.map((th) => { const sy = th.h / H0, sxz = kind === 'bamboo' ? Math.max(0.16, th.r * 2.2 / (r0 * 2)) : Math.min(sy * 1.3, Math.max(sy * 0.6, th.r / r0)); const g = kind === 'bamboo' ? 1 : R.range(0.85, 1.25), m0 = mat(th.x, terrain.height(th.x, th.z) - 0.35, th.z, R() * 6.28, sxz * g, sy, sxz * g); if (kind !== 'bamboo') m0.premultiply(new THREE.Matrix4().makeTranslation(-th.x, 0, -th.z)).premultiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(R.range(-0.06, 0.06), 0, R.range(-0.06, 0.06)))).premultiply(new THREE.Matrix4().makeTranslation(th.x, 0, th.z)); return m0; });
      const tc = new THREE.Color(), cols = ms.map(() => (kind === 'bamboo' ? tc.setRGB(0.8, 0.85, 0.7) : tc.setRGB(0.62, 0.55, 0.46)).clone().multiplyScalar(R.range(0.75, 1.1)));
      const near = inst(kind, ms, { shadow: !lo, live: true, colors: cols });
      const fg = mergeGeometries(far[kind].map((g, i) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); const c = new THREE.Color(kind === 'bamboo' || i ? 0x2c3a1e : 0x3a3226), n = g.attributes.position.count, ca = new Float32Array(n * 3); for (let j = 0; j < n; j++) c.toArray(ca, j * 3); g.setAttribute('color', new THREE.BufferAttribute(ca, 3)); return g; }), false);
      const fm = [new THREE.InstancedMesh(fg, farMat, ms.length)]; fm[0].frustumCulled = false; fm[0].receiveShadow = true; fm[0].castShadow = false; scene.add(fm[0]);
      const farScale = ms.map((m0, i) => { const th = list[i], sy = th.h / (kind === 'tree.palm' ? 9 : kind === 'bamboo' ? 10 : 22), sxz = kind === 'bamboo' ? Math.max(0.45, th.r * 1.6) : sy * 0.95; return new THREE.Matrix4().compose(new THREE.Vector3().setFromMatrixPosition(m0), new THREE.Quaternion(), V(sxz, sy, sxz)); });
      by[kind] = { list, ms, near, fm, farScale };
    }
    trees = by;
    try { understory(); } catch (e) { console.warn('[dress] understory', e); }
    try { banks(); } catch (e) { console.warn('[dress] banks', e); }
    flushLate();
    if (out.blockMeshes) out.blockMeshes.cy.visible = false;      // stems now drawn; posts were dressed with the shells
    out.pending = false;
    lodAt = null;
  };

  // ---- the jungle's layers: ground ferns, broadleaf plants, tree ferns, hanging vines, fallen logs, a canopy closing overhead
  const understory = () => {
    const inJ = (x, z) => { const n = PD.placeName(x, z); return n === 'the jungle' || n === 'the trail'; };
    const jt = stems.filter((th) => th.of === 'jungle'), G = new Map(), key = (x, z) => Math.floor(x / 4) * 4096 + Math.floor(z / 4);
    for (const th of jt) { const k = key(th.x, th.z); (G.get(k) || G.set(k, []).get(k)).push(th); }
    const clear = (x, z, m) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const th of G.get(key(x + i * 4, z + j * 4)) || []) if (Math.hypot(th.x - x, th.z - z) < th.r + m) return false; return true; };
    const trail = PD.LAYOUT.jungle.trail, trailD = (x, z) => { let m = 1e9; for (let i = 0; i < trail.length - 1; i++) { const [ax, az] = trail[i], [bx, bz] = trail[i + 1], dx = bx - ax, dz = bz - az, t2 = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); m = Math.min(m, Math.hypot(x - ax - dx * t2, z - az - dz * t2)); } return m; };
    const scatter = (n, margin, trailMin, fn) => { const ms = []; for (let k = 0; k < n * 12 && ms.length < n; k++) { const x = R.range(-99, -14), z = R.range(-78, -12); if (!inJ(x, z) || !clear(x, z, margin) || trailD(x, z) < trailMin) continue; ms.push(fn(x, z)); } return ms; };
    const Y = (x, z) => terrain.height(x, z);
    const plant = (kind, n, margin, trailMin, s0, s1) => { if (!lib.has(kind)) return; const ms = scatter(n, margin, trailMin, (x, z) => { const sc = R.range(s0, s1); return mat(x, Y(x, z) - 0.05, z, R() * 6.28, sc, sc * R.range(0.85, 1.2), sc); }); if (ms.length) inst(kind, ms, { shadow: false }); };
    if (lo) {      // phones: ferns and broadleaf as crossed cards in one merged buffer (4 triangles a plant), dense enough to read as undergrowth
      const tex = canvasTex(256, (g, S2) => { const rr = makeRng(73); g.clearRect(0, 0, S2, S2);
        for (let f = 0; f < 9; f++) { const a = -1.25 + f * 0.31 + (rr() - 0.5) * 0.15, L = S2 * (0.55 + rr() * 0.4), x0 = S2 / 2, y0 = S2;
          for (let i = 2; i < 22; i++) { const u = i / 22, x = x0 + Math.sin(a) * L * u, y = y0 - Math.cos(a) * L * u * (1 - 0.25 * u * u), w = (1 - u) * S2 * 0.07 + 3, v = 0.55 + rr() * 0.5;
            g.fillStyle = `rgb(${52 * v | 0},${86 * v | 0},${36 * v | 0})`; for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(x + sd * Math.cos(a) * w * 0.8, y + sd * Math.sin(a) * w * 0.8, w, w * 0.32, a + sd * 0.9, 0, 7); g.fill(); } } } });
      const P2 = [], U2 = [], N2 = [], I2 = [];
      const card = (x, z, sc, rot) => { const y = Y(x, z) - 0.05; for (let c = 0; c < 2; c++) { const a = rot + c * Math.PI / 2, dx = Math.cos(a) * sc * 0.6, dz = Math.sin(a) * sc * 0.6, b = P2.length / 3; P2.push(x - dx, y, z - dz, x + dx, y, z + dz, x + dx, y + sc, z + dz, x - dx, y + sc, z - dz); U2.push(0, 0, 1, 0, 1, 1, 0, 1); N2.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0); I2.push(b, b + 1, b + 2, b, b + 2, b + 3); } };
      scatter(420, 0.3, 1.2, (x, z) => card(x, z, R.range(0.7, 1.5), R() * 3));
      { const st = S.ruins; for (let k = 0; k < 60; k++) { const x = st.cx + R.range(-12.5, 12.5), z = st.cz + R.range(-9.5, 9.5); card(x, z, R.range(0.5, 1.0), R() * 3); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U2, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N2, 3)); g.setIndex(I2); g.computeBoundingSphere();
      const fm = new THREE.MeshStandardNodeMaterial({ alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }); fm.colorNode = texture(tex, uv()).rgb.mul(mix(float(0.9), float(2.0), uv().y)); fm.opacityNode = texture(tex, uv()).a;
      const fmesh = new THREE.Mesh(g, fm); fmesh.receiveShadow = true; fmesh.userData.feature = true; scene.add(fmesh);
    } else plant('fern', 520, 0.35, 1.2, 0.8, 1.6);
    if (!lo) { const st = S.ruins, ms = []; for (let k = 0; k < 70; k++) { const x = st.cx + R.range(-12.5, 12.5), z = st.cz + R.range(-9.5, 9.5), gx = ((x - st.cx + 11) / 2.2) % 1, gz = ((z - st.cz + 8.8) / 2.2) % 1; if (Math.abs(gx - 0.5) < 0.3 && Math.abs(gz - 0.5) < 0.3 && R() < 0.8) continue; const sc = R.range(0.6, 1.2); ms.push(mat(x, Y(x, z) - 0.05, z, R() * 6.28, sc, sc, sc)); } if (ms.length && lib.has('fern')) inst('fern', ms, { shadow: false }); }
    if (!lo) plant('fern.bush', 160, 0.5, 2.0, 0.8, 1.4);
    plant('tree.banana', lo ? 10 : 90, 0.8, 3.0, 0.6, 1.0);
    if (!lo) plant('tree.treefern', 50, 1.0, 3.5, 0.6, 0.9);
    if (lib.has('vine') && !lo) { const ms = []; for (const th of jt) if (R() < (lo ? 0.12 : 0.3)) { const a = R() * 6.28, sc = R.range(0.8, 1.4); ms.push(mat(th.x + Math.sin(a) * th.r * 0.9, Y(th.x, th.z) + R.range(0, 1.5), th.z + Math.cos(a) * th.r * 0.9, a, sc, sc * R.range(1.2, 2.2), sc)); } if (ms.length) inst('vine', ms, { shadow: false }); }
    // fallen logs: lying where no stem stands and off the trail (visual only)
    district = 'j'; const logs = [];
    for (let k = 0; k < 400 && logs.length < (lo ? 10 : 26); k++) {
      const x = R.range(-97, -16), z = R.range(-76, -14), a = R() * 6.28, L = R.range(3, 7), r = R.range(0.25, 0.5), ux = Math.sin(a), uz = Math.cos(a);
      let ok = inJ(x, z) && trailD(x, z) > 3.5; for (let u = -L / 2; ok && u <= L / 2; u += 0.7) ok = clear(x + ux * u, z + uz * u, r + 0.3) && inJ(x + ux * u, z + uz * u);
      if (!ok) continue; logs.push(1);
      const g = new THREE.CylinderGeometry(r * 0.85, r, L, lo ? 6 : 9, 1); g.rotateX(Math.PI / 2); g.rotateY(a); g.translate(x, Math.min(Y(x - ux * L / 2, z - uz * L / 2), Y(x + ux * L / 2, z + uz * L / 2)) + r * 0.6, z);
      logGeos.push(g);
    }
    if (logGeos.length) { const g = mergeGeometries(logGeos.map((g) => { g = worldUV(g); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; })); const lm = new THREE.Mesh(g, M.deck); lm.castShadow = !lo; lm.receiveShadow = true; scene.add(lm); }
    // canopy: broad leafy masses between 10 and 18 m, roughly one per pair of stems, darker beneath
    {
      const tex = canvasTex(256, (g, S2) => { const rr = makeRng(91); g.clearRect(0, 0, S2, S2); for (let i = 0; i < 260; i++) { const x = rr() * S2, y = rr() * S2, a = rr() * 6.28, l = 10 + rr() * 22, v = 0.6 + rr() * 0.5; g.fillStyle = `rgb(${46 * v | 0},${70 * v | 0},${34 * v | 0})`; g.beginPath(); g.ellipse(x, y, l * 0.38, l, a, 0, 7); g.fill(); } });
      const geo = new THREE.IcosahedronGeometry(1, lo ? 0 : 1); geo.scale(1, 0.38, 1);
      const cm = new THREE.MeshStandardNodeMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
      cm.colorNode = texture(tex, uv()).rgb.mul(mix(float(0.45), float(1.1), smoothstep(-0.3, 0.6, normalWorld.y)));
      cm.opacityNode = texture(tex, uv()).a;
      const ms = []; for (const th of jt) if (R() < (lo ? 0.2 : 0.6)) { const sc = R.range(lo ? 4.5 : 3.5, lo ? 7.5 : 6.5), a = R() * 6.28; ms.push(mat(th.x + Math.sin(a) * 2, Y(th.x, th.z) + Math.min(th.h * 0.75, R.range(10, 17)), th.z + Math.cos(a) * 2, R() * 6.28, sc, sc * R.range(0.8, 1.3), sc)); }
      const im = new THREE.InstancedMesh(geo, cm, Math.max(1, ms.length)); ms.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = !lo; im.receiveShadow = false; im.computeBoundingSphere(); im.userData.feature = true; scene.add(im);
    }
  };
  const logGeos = [];

  // ---- banks and berms: stones at the waterline and along the berm crests, so the water's edge and the mounds have form
  const banks = () => {
    const LY = PD.LAYOUT, rv = LY.river, ms = [[], [], []];
    for (let x = -97; x < 97; x += R.range(1.2, 3.2)) {
      if (Math.abs(x - LY.jetty.x) < 3 || Math.abs(x - LY.culvert.x) < 4) continue;
      for (const sd of [-1, 1]) { if (R() < (lo ? 0.7 : 0.35)) continue; const z = PD.riverZ(x) + sd * (rv.half + R.range(-0.4, 1.6)), sc = R.range(0.1, 0.32); ms[(R() * 3) | 0].push(mat(x, terrain.height(x, z) - sc * 0.5, z, R() * 6.28, sc * R.range(0.8, 1.4), sc, sc)); }
    }
    for (let a = 0; a < 6.283; a += R.range(0.12, 0.3)) { const pd = LY.pond, rr = PD.pond.R(pd.x + Math.sin(a), pd.z + Math.cos(a)) + R.range(-0.3, 1.4), x = pd.x + Math.sin(a) * rr, z = pd.z + Math.cos(a) * rr, sc = R.range(0.1, 0.3); if (x < 97) ms[(R() * 3) | 0].push(mat(x, terrain.height(x, z) - sc * 0.5, z, R() * 6.28, sc * 1.2, sc, sc)); }
    for (const [bx, bz, yaw, hl] of LY.berms) for (let u = -hl; u <= hl; u += R.range(1.5, 3.5)) { if (R() < 0.4) continue; const v = R.range(-1.6, 1.6), x = bx + Math.sin(yaw) * u + Math.cos(yaw) * v, z = bz + Math.cos(yaw) * u - Math.sin(yaw) * v, sc = R.range(0.12, 0.3); ms[(R() * 3) | 0].push(mat(x, terrain.height(x, z) - sc * 0.45, z, R() * 6.28, sc * 1.3, sc, sc)); }
    inst('rock.boulder', ms.flat(), { seed: 3, shadow: !lo });
  };
  let lodAt = null;
  const lod = (cam) => {
    if (!trees || !cam) return;
    const cx = cam.position.x, cz = cam.position.z;
    if (lodAt && Math.hypot(cx - lodAt[0], cz - lodAt[1]) < 3) return;
    lodAt = [cx, cz];
    for (const T2 of Object.values(trees)) {
      let n = 0, f = 0; const nearMeshes = []; T2.near.traverse((o) => o.isInstancedMesh && nearMeshes.push(o));
      T2.list.forEach((th, i) => {
        const d = Math.hypot(th.x - cx, th.z - cz);
        if (d < NEAR) { for (const im of nearMeshes) im.setMatrixAt(n, T2.ms[i]); n++; }
        else { for (const im of T2.fm) im.setMatrixAt(f, T2.farScale[i]); f++; }
      });
      for (const im of nearMeshes) { im.count = n; im.instanceMatrix.needsUpdate = true; }
      for (const im of T2.fm) { im.count = f; im.instanceMatrix.needsUpdate = true; }
    }
  };
  lib.ready.then(() => { try { buildTrees(); } catch (e) { console.warn('[dress] trees', e); out.pending = false; } }).catch(() => { out.pending = false; });

  // the blockout's door updater no longer needed (leaves are dressed); chain the frame update
  out.update = (dt, cam) => { if (out.doorUpdate) out.doorUpdate(); lod(cam); if (cam && lib.setWind && U.wind) lib.setWind(Math.min(2, 0.4 + U.wind.value.length() * 0.9), U.wind.value.x || 1, U.wind.value.y || 0.3); };
  out.cost = () => ({ shells: shells.length, groups: groups.length });
}
