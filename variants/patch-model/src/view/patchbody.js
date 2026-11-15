// PATCHREX: the downloaded CC0 tyrannosaur (dist/model, credits in dist/model/CREDITS.md) as the creature's body, driven by OUR
// simulation. None of the model's animation is used. Its 25 bones and inverse bind matrices are kept (a retarget, not a re-rig):
// each frame every bone gets   world = F(our pose) x inverse(F(model bind)) x bindWorld,   where F is the same segment frame
// (origin, aim, roll reference) built once on the model's bind skeleton and every frame on the sim's joints. The model was rigged
// mid-stride (legs differ, tail bent to one side, jaw open): the delta form cancels that by construction.
// The sim walks an animal of this model's proportions (species/patchrex.js), so the legs need no solve of their own: hip, knee,
// ankle and foot come straight from the sim and the feet land where it plants them. Same interface as view/body.js RexBody.
import * as THREE from 'three/webgpu';
import { texture, uv, vec3, float, mix, uniform, positionWorld, cameraPosition, normalWorld, pow, clamp, dot, normalize, normalView, max, smoothstep, normalLocal } from 'three/tsl';
import { PV, LEG, PS, SPINE_N } from '../sim/rex.js';
import { WEATHER } from './world.js';
import { TYRANNOSAURUS as SPECIES } from '../species/active.js';
import { irisTexture, vertexBufferCount, MAX_VBUF } from './body.js';

const V = () => new THREE.Vector3();
// tunables (read in the retarget below)
export const PATCH = {
  headPitch: 0.0,       // the model skull's forward in its bind, pitched down from level (rad); our head frame's forward maps onto it
  eyeR: 0.072,          // eyeball radius (m): covers the painted iris (~6 cm) inside the dark socket (~17 cm)
  eyeSink: 0.42,        // share of the radius the ball's centre sits under the skin at the painted iris
  eyeAim: { fwd: 0.55, back: 0.25, up: 0.3, down: 0.35, rest: 0.3 },   // ball turn about the socket's axis (rad): toward the snout, back, up, down; resting turn toward the snout
  tone: 1.0,            // colour map multiplier
  jawGain: 1.0,         // the model's jaw angle per unit of the sim's (PS.JAW, rad)
};

async function loadTex(url, srgb) {
  const r = await fetch(url); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const bmp = await createImageBitmap(await r.blob());
  const t = new THREE.Texture(bmp); t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true; return t;
}

/** Fetch the model's data (dist/model/patchrex.*) and build the body. Rejects if anything is missing. */
export async function loadPatchBody(Q = { tier: 'high' }, base = 'model/') {
  const lo = Q.tier === 'low', sz = lo ? 1024 : 2048;
  const [meta, bin, map, mr, nrm] = await Promise.all([
    fetch(base + 'patchrex.json').then((r) => { if (!r.ok) throw new Error('patchrex.json: HTTP ' + r.status); return r.json(); }),
    fetch(base + 'patchrex.geo.json').then((r) => { if (!r.ok) throw new Error('patchrex.geo.json: HTTP ' + r.status); return r.json(); }).then((j) => { const b = atob(j.b64), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; }),
    loadTex(`${base}patchrex_base_${sz}.jpg`, true), loadTex(`${base}patchrex_mr_${sz}.jpg`, false), lo ? null : loadTex(`${base}patchrex_nrm_1024.jpg`, false),
  ]);
  return new PatchBody(Q, meta, bin, { map, mr, nrm });
}

function skinMaterial(T, wet, lo) {
  const m = new THREE.MeshStandardNodeMaterial();
  m.name = 'rexSkin';      // the body self-check (body.js watchBody) and pipeline errors know it by this name
  const col = texture(T.map, uv()).rgb, rgh = texture(T.mr, uv()).g;
  // (the colour map has some light baked into it: left as it is for now; see out/PATCH.md)
  m.colorNode = col.mul(PATCH.tone).mul(mix(float(1), float(0.8), wet));
  m.roughnessNode = clamp(rgh.mul(0.75).add(0.3).sub(wet.mul(0.22)), 0.3, 1);
  m.metalness = 0;
  if (T.nrm) { m.normalMap = T.nrm; m.normalScale = new THREE.Vector2(0.6, 0.6); }
  // as ours: a thin fresnel of fog colour at the silhouette so the wet dark hide still reads against the storm, and the flash
  const V0 = normalize(cameraPosition.sub(positionWorld)), fr = pow(float(1).sub(clamp(dot(normalWorld, V0), 0, 1)), 4);
  m.emissiveNode = vec3(WEATHER.fog).mul(fr).mul(mix(float(0.12), float(0.35), wet)).add(vec3(0.7, 0.75, 0.9).mul(WEATHER.flash).mul(fr).mul(0.3))
    .add(col.mul(vec3(WEATHER.fog)).mul(clamp(normalWorld.y.negate(), 0, 1)).mul(lo ? 0.22 : 0.15));      // sky bounce on the underside
  return m;
}

// a segment frame: origin o, axis Z along `dir`, X the hinge/side reference squared to it, Y = Z x X; the Z column scaled by `s`
function segFrame(m, o, dir, side, s = 1) {
  const Z = V().copy(dir).normalize(), X = V().copy(side).addScaledVector(Z, -side.dot(Z));
  if (X.lengthSq() < 1e-8) X.set(1, 0, 0).addScaledVector(Z, -Z.x); X.normalize();
  const Y = V().crossVectors(Z, X);
  return m.makeBasis(X, Y, Z.multiplyScalar(s)).setPosition(o);
}
// a frame from forward and up: Z forward, Y up squared to it, X = Y x Z (x left when z is forward and y up)
function fuFrame(m, o, f, u) {
  const Z = V().copy(f).normalize(), Y = V().copy(u).addScaledVector(Z, -u.dot(Z));
  if (Y.lengthSq() < 1e-8) Y.set(0, 1, 0).addScaledVector(Z, -Z.y); Y.normalize();
  return m.makeBasis(V().crossVectors(Y, Z), Y, Z).setPosition(o);
}

export class PatchBody {
  constructor(Q, meta, bin, T) {
    const lo = Q.tier === 'low';
    this.isPatch = true; this.group = new THREE.Group();
    const L = meta.layout, arr = (k, C) => new C(bin, L[k].offset, L[k].count);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr('position', Float32Array), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(arr('normal', Float32Array), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(arr('uv', Float32Array), 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(arr('skinIndex', Uint16Array), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(arr('skinWeight', Float32Array), 4));
    g.setIndex(new THREE.BufferAttribute(arr('index', Uint16Array), 1));
    this.vbufStatic = vertexBufferCount(g);
    if (this.vbufStatic > MAX_VBUF) console.error(`[body check] the patch rex geometry needs ${this.vbufStatic} vertex buffers (WebGPU allows ${MAX_VBUF})`);
    this.stats = { verts: meta.verts, tris: meta.tris, bones: meta.names.length };
    this.wet = uniform(0);
    const names = meta.names, NB = names.length, id = (n) => names.indexOf(n);
    this.B = Object.fromEntries(names.map((n, i) => [n, i]));
    this.bindW = meta.bind.map((a) => new THREE.Matrix4().fromArray(a));
    const inv = this.bindW.map((m) => m.clone().invert());
    this.bones = names.map(() => { const b = new THREE.Bone(); b.matrixAutoUpdate = false; this.group.add(b); return b; });
    this.skeleton = new THREE.Skeleton(this.bones, inv);
    this.mesh = new THREE.SkinnedMesh(g, skinMaterial(T, this.wet, lo));
    this.mesh.bind(this.skeleton, new THREE.Matrix4());
    this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
    this.W = names.map(() => new THREE.Matrix4());      // current bone world matrices
    const P = (n) => V().setFromMatrixPosition(this.bindW[id(n)]), LM = meta.landmarks, v3 = (a) => new THREE.Vector3(...a);
    this.LM = LM;

    // ---------- the spine as one chain, tail tip to skull pivot, mapped section by section onto ours (sim joints 0..25:
    // 0 tail tip, 13 pelvis, 18 chest, 25 skull pivot) by arc length within each section
    const chain = [{ p: v3(LM.tailTip) }, ...['tail6', 'tail5', 'tail4', 'tail3', 'tail2', 'tail1', 'pelvis', 'spine1', 'chest', 'neck1', 'neck2', 'head'].map((n) => ({ n, p: P(n) }))];
    const anchors = { 0: 0, 7: 13, 9: 18, 12: 25 };      // chain index -> sim joint
    let s = 0; chain.forEach((c, i) => { if (i) s += c.p.distanceTo(chain[i - 1].p); c.s = s; });
    const aIdx = Object.keys(anchors).map(Number);
    chain.forEach((c, i) => {
      let k = 0; while (k < aIdx.length - 2 && i > aIdx[k + 1]) k++;
      const i0 = aIdx[k], i1 = aIdx[k + 1]; c.sec = [anchors[i0], anchors[i1]]; c.frac = (c.s - chain[i0].s) / (chain[i1].s - chain[i0].s);
    });
    // tangent along the chain toward the head (central differences); bind up is world up
    this.spineBones = [];
    chain.forEach((c, i) => {
      if (!c.n || c.n === 'head') return;
      const a = chain[Math.max(0, i - 1)].p, b = chain[Math.min(chain.length - 1, i + 1)].p, t = V().subVectors(b, a);
      const F = fuFrame(new THREE.Matrix4(), c.p, t, V().set(0, 1, 0));
      this.spineBones.push({ k: id(c.n), sec: c.sec, frac: c.frac, D: F.invert().multiply(this.bindW[id(c.n)]) });
    });
    // ---------- the head: our head frame (HEAD_P, HEAD_F, HEAD_U) onto the model's skull, level (PATCH.headPitch) at its pivot
    const hp = PATCH.headPitch;
    this.Hb = fuFrame(new THREE.Matrix4(), P('head'), V().set(0, -Math.sin(hp), Math.cos(hp)), V().set(0, 1, 0));
    this.HbInv = this.Hb.clone().invert();
    this.Dhead = this.HbInv.clone().multiply(this.bindW[id('head')]);
    // the jaw turns about its own joint, about the skull's side axis, from the model's open bind (LM.jawOpen rad) to ours
    this.jawHinge = P('jaw'); this.jawOpen = LM.jawOpen;
    // ---------- legs: hip-knee-ankle hinge plane from the sim; the model's foot bone origin stands `lift` over the sim's MTP
    this.legs = [['L', 0], ['R', 1]].map(([sd, k]) => {
      const hip = P('thigh_' + sd), knee = P('shin_' + sd), ank = P('metatarsus_' + sd), paw = P('hpaw_' + sd);
      const hinge = V().crossVectors(V().subVectors(knee, hip), V().subVectors(ank, knee)).normalize();
      const lift = paw.y - LM['soleY_' + sd] - 0.06;      // foot.pad: the sim's MTP line over the sole
      const mk = (o, e) => segFrame(new THREE.Matrix4(), o, V().subVectors(e, o), hinge);
      const f = v3(LM['footF_' + sd]);
      // the sim rolls the foot about its claw tip, TL ahead of the MTP: set the model's own toe reach on that tip
      const back = LM['toeTip_' + sd] - SPECIES.foot.toes[1];
      return { k, sd, lift, back, ids: ['thigh_', 'shin_', 'metatarsus_', 'hpaw_'].map((n) => id(n + sd)),
        len: [hip.distanceTo(knee), knee.distanceTo(ank), ank.distanceTo(paw)],
        D: [mk(hip, knee), mk(knee, ank), mk(ank, paw), fuFrame(new THREE.Matrix4(), paw, f, V().set(0, 1, 0))].map((F, j) => F.invert().multiply(this.bindW[id(['thigh_', 'shin_', 'metatarsus_', 'hpaw_'][j] + sd)])) };
    });
    // ---------- arms: ride the chest; the forearm turns with the sim's forearm (its pitch in the chest frame against the rest)
    this.arms = ['L', 'R'].map((sd, k) => ({ k, up: id('upperarm_' + sd), fo: id('forearm_' + sd), elbow: P('forearm_' + sd) }));
    // ---------- eyes: OUR eyeballs in the painted sockets, riding the skull (head-frame space below)
    this._hl = new THREE.Matrix4();
    const eyeMat = new THREE.MeshPhysicalNodeMaterial({ map: irisTexture(), roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.06 });
    // the same small glint as ours, held off the pupil (body.js EYES2)
    eyeMat.emissiveNode = vec3(1, 0.97, 0.9).mul(pow(max(dot(normalView, normalize(vec3(-0.15, 0.42, 0.9))), 0), 300).mul(0.45)).mul(smoothstep(0.93, 0.87, normalLocal.z));
    const r = PATCH.eyeR, eg = new THREE.SphereGeometry(r, 24, 16);
    this.eyes = [['eyeL', 1], ['eyeR', -1]].map(([n, sd]) => {
      const e = new THREE.Mesh(eg, eyeMat); e.matrixAutoUpdate = false; e.frustumCulled = false; e.castShadow = false; e.receiveShadow = true; this.group.add(e);
      const pw = v3(LM[n].p), nw = v3(LM[n].n).normalize(), c = pw.addScaledVector(nw, -r * PATCH.eyeSink);
      const pos = c.applyMatrix4(this.HbInv), ax = nw.transformDirection(this.HbInv);      // centre and socket axis in head space
      return { e, sd, pos, ax, dir: ax.clone(), yaw0: Math.atan2(ax.x, ax.z), pitch0: Math.asin(Math.max(-1, Math.min(1, ax.y))) };
    });
    this.glareEye = null; this.glare = 0; this.fix = null;
    this.nostril = V(); this.snout = V().set(0, 0, 1);
    this.noseLocal = v3([0, LM.snoutTop[1] - 0.16, LM.snoutTop[2] + 0.2]).applyMatrix4(this.HbInv);
    this._sacT = 0; this._sacV = V();
    this._m = new THREE.Matrix4(); this._m2 = new THREE.Matrix4(); this._H = new THREE.Matrix4(); this._q = new THREE.Quaternion();
    this._J = Array.from({ length: SPINE_N }, V); this._U = Array.from({ length: SPINE_N }, V); this._T = Array.from({ length: SPINE_N }, V); this._S = new Float64Array(SPINE_N);
  }

  setWet(k) { this.wet.value = k; }

  update(pose) {
    const v = pose.v, S = pose.s, W = this.W, J = this._J, U = this._U, T = this._T, Sa = this._S;
    // ---------- spine: positions, ups, tangents (toward the head) and arc length of the sim's 26 joints
    for (let i = 0; i < SPINE_N; i++) { J[i].fromArray(v, i * 3); U[i].fromArray(v, (PV.SU + i) * 3); }
    for (let i = 0; i < SPINE_N; i++) { T[i].subVectors(J[Math.min(SPINE_N - 1, i + 1)], J[Math.max(0, i - 1)]).normalize(); Sa[i] = i ? Sa[i - 1] + J[i].distanceTo(J[i - 1]) : 0; }
    const p = V(), t = V(), u = V();
    for (const b of this.spineBones) {
      const [a0, a1] = b.sec, s = Sa[a0] + b.frac * (Sa[a1] - Sa[a0]);
      let i = a0; while (i < a1 - 1 && Sa[i + 1] < s) i++;
      const f = Math.min(1, Math.max(0, (s - Sa[i]) / Math.max(1e-6, Sa[i + 1] - Sa[i])));
      p.lerpVectors(J[i], J[i + 1], f); t.lerpVectors(T[i], T[i + 1], f); u.lerpVectors(U[i], U[i + 1], f);
      fuFrame(W[b.k], p, t, u).multiply(b.D);
    }
    // ---------- head and jaw
    const H = fuFrame(this._H, V().fromArray(v, PV.HEAD_P * 3), V().fromArray(v, PV.HEAD_F * 3), V().fromArray(v, PV.HEAD_U * 3));
    const B = this.B; W[B.head].copy(H).multiply(this.Dhead);
    const ja = (S[PS.JAW] || 0) * PATCH.jawGain - this.jawOpen, hg = this.jawHinge;
    this._m.makeTranslation(hg.x, hg.y, hg.z).multiply(this._m2.makeRotationX(ja)).multiply(new THREE.Matrix4().makeTranslation(-hg.x, -hg.y, -hg.z));
    W[B.jaw].copy(H).multiply(this.HbInv).multiply(this._m).multiply(this.bindW[B.jaw]);
    // ---------- legs, straight from the sim's joints
    for (const Lg of this.legs) {
      const o = (PV.LEG + Lg.k * LEG.SIZE) * 3, J3 = (j) => V().fromArray(v, o + j * 3);
      const hip = J3(LEG.HIP), knee = J3(LEG.KNEE), ank = J3(LEG.ANKLE), mtp = J3(LEG.MTP), tf = J3(LEG.TOE_F).normalize(), tu = J3(LEG.TOE_U).normalize();
      const paw = mtp.clone().addScaledVector(tu, Lg.lift).addScaledVector(tf, -Lg.back);
      const hinge = V().crossVectors(V().subVectors(knee, hip), V().subVectors(ank, knee)); if (hinge.lengthSq() < 1e-8) hinge.crossVectors(tf, tu); hinge.normalize();
      const seg = (j, a, b) => segFrame(W[Lg.ids[j]], a, V().subVectors(b, a), hinge, a.distanceTo(b) / Lg.len[j]).multiply(Lg.D[j]);
      seg(0, hip, knee); seg(1, knee, ank); seg(2, ank, paw);
      fuFrame(W[Lg.ids[3]], paw, tf, tu).multiply(Lg.D[3]);
    }
    // ---------- arms: rigid on the chest, the forearm pitched by the sim's forearm swing
    const Dc = this._m.copy(W[B.chest]).multiply(this._m2.copy(this.bindW[B.chest]).invert());
    for (const A of this.arms) {
      W[A.up].copy(Dc).multiply(this.bindW[A.up]);
      const o = (PV.ARM + A.k * 3) * 3, el = V().fromArray(v, o + 3), wr = V().fromArray(v, o + 6), d = V().subVectors(wr, el).normalize();
      const cf = V().setFromMatrixColumn(W[B.chest], 2).normalize(), cu = V().setFromMatrixColumn(W[B.chest], 1).normalize();
      const pitch = Math.atan2(d.dot(cu), d.dot(cf)) - Math.atan2(-0.16, 0.3);      // the sim's rest forearm: 0.3 forward, 0.16 down
      const e = A.elbow, R = new THREE.Matrix4().makeTranslation(e.x, e.y, e.z).multiply(new THREE.Matrix4().makeRotationX(-pitch)).multiply(new THREE.Matrix4().makeTranslation(-e.x, -e.y, -e.z));
      W[A.fo].copy(Dc).multiply(R).multiply(this.bindW[A.fo]);
    }
    for (let i = 0; i < this.bones.length; i++) { const b = this.bones[i]; b.matrix.copy(W[i]); b.matrixWorldNeedsUpdate = true; }
    // ---------- breath and sound leave from the nostrils, along the snout
    this.nostril.copy(this.noseLocal).applyMatrix4(H); this.snout.set(0, -0.35, 1).normalize().transformDirection(H);
    // ---------- eyes
    const now = performance.now() / 1000;
    if (now > this._sacT) { this._sacT = now + 0.35 + Math.random() * 1.6; this._sacV.set((Math.random() - 0.5) * 0.09, (Math.random() - 0.5) * 0.05, 0); }
    const ek = 1 - Math.exp(-55 * Math.min(0.25, Math.max(0, now - (this._eT ?? now - 1 / 60)))); this._eT = now;
    const Hi = this._hl.copy(H).invert(), fl = this.fix ? V().copy(this.fix).applyMatrix4(Hi) : null, A = PATCH.eyeAim, d = V();
    for (const E of this.eyes) {
      // yaw/pitch of the wanted gaze in head space, held within a cone about the socket's own axis (a side-facing eye can turn
      // toward the snout by A.fwd, back by A.back): the skull does the rest of the looking
      let yaw = E.yaw0 - E.sd * A.rest, pitch = E.pitch0;
      if (fl) { const dx = fl.x - E.pos.x, dy = fl.y - E.pos.y, dz = fl.z - E.pos.z; yaw = Math.atan2(dx, dz); pitch = Math.atan2(dy, Math.hypot(dx, dz)); }
      let rel = (yaw - E.yaw0) * E.sd; rel = Math.atan2(Math.sin(rel), Math.cos(rel));      // + toward the back, - toward the snout
      rel = Math.max(-A.fwd, Math.min(A.back, rel)); yaw = E.yaw0 + E.sd * rel;
      pitch = Math.max(E.pitch0 - A.down, Math.min(E.pitch0 + A.up, pitch));
      yaw += this._sacV.x * (fl ? 0.5 : 1); pitch += this._sacV.y * (fl ? 0.5 : 1);
      d.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      E.dir.lerp(d, ek).normalize();
      this._m.lookAt(E.dir, V(), V().set(0, 1, 0)).setPosition(E.pos);
      E.e.matrix.copy(H).multiply(this._m); E.e.matrixWorldNeedsUpdate = true;
    }
    // (no lids yet: the model has none to blink; PS.BLINK / SQUINT / LID are not shown)
    void S;
  }
}
