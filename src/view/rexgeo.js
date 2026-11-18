// Builds the creature's skin as one continuous surface, in the bind pose of the simulation's
// skeleton. Muscles, skull, jaw, toes and claws are signed-distance primitives blended with
// smooth unions, meshed with surface nets, and skinned to the same joints the simulation
// drives. A sculpted or generated mesh (Meshy, Tripo) can later replace this by being skinned
// to the same bones; nothing in the simulation changes.
//
// Pure geometry: no DOM, no renderer, so it can be built and checked in Node.

import { Vector3, Matrix4, Quaternion } from 'three';
import { PV, LEG, SPINE_N, IDX, PS, DIM, NECK_RISE, NECK_ROOT } from '../sim/rex.js';
import { TYRANNOSAURUS } from '../species/tyrannosaurus.js';
import { tune, tuneGroup } from './tune.js';      // tune

// ------------------------------------------------------------------ head design (head space:
// x left, y up, z forward, origin at the skull pivot where the neck meets the skull)
// the upper tooth row sags (the maxilla is convex below) and steps up a little at the premaxilla, as in the skull
export const mouthY = (z) => -0.13 - 0.17 * (1 - ss(0.0, 1.25, z)) - 0.04 * Math.exp(-(((z - 0.95) / 0.34) ** 2)) + 0.014 * Math.exp(-(((z - 1.5) / 0.1) ** 2));
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const interp = (rows, z) => {
  if (z <= rows[0][0]) return rows[0].slice(1);
  for (let i = 1; i < rows.length; i++) if (z <= rows[i][0]) {
    const a = rows[i - 1], b = rows[i], t = (z - a[0]) / (b[0] - a[0]), u = t * t * (3 - 2 * t);
    return a.slice(1).map((v, k) => v + (b[k + 1] - v) * u);
  }
  return rows[rows.length - 1].slice(1);
};
// [z, half width, top]  (the bottom of the upper skull is the mouth line)
// A tyrannosaur skull is wide and deep behind the eyes (the jaw muscles) and narrows hard into a tall, blunt snout
// (dorsal view is a keyhole: the snout is about a third of the width across the jaw muscles, and narrows hard
// just ahead of the orbits so both eyes see forward past it: about 55 degrees of binocular overlap)
// The top of the skull behind the orbits is narrower than the cheeks below them (front view is a trapezoid: the
// jugals and jaw muscles flare low, the eyes sit tucked in at its upper corners under the brow), and the snout
// stays deep and boxy right to a blunt, near-vertical rostrum.
export const SKULL = [[-0.34, 0.28, 0.26], [-0.12, 0.5, 0.46], [0.12, 0.55, 0.57], [0.34, 0.47, 0.6], [0.56, 0.37, 0.6],
  [0.86, 0.3, 0.57], [1.18, 0.25, 0.535], [1.32, 0.232, 0.52], [1.46, 0.212, 0.47], [1.66, 0.186, 0.4], [1.8, 0.16, 0.34]];
// in plan the snout is a wedge closing to a rounded U at the premaxilla: past SNOUT_U the sections shrink on a
// quarter ellipse (width faster than depth), so the tip is a curved nose, not a cut-off end
const SNOUT_U = 1.56, SNOUT_END = 1.9;
// [z, half width, bottom]  (the top of the jaw is the mouth line)
// a heavy mandible: deep behind (surangular), the dentary still a third of the head's depth at the chin
export const JAW = [[-0.3, 0.39, -0.62], [-0.02, 0.48, -0.86], [0.3, 0.43, -0.8], [0.7, 0.3, -0.68], [1.1, 0.235, -0.59],
  [1.45, 0.2, -0.48], [1.62, 0.165, -0.41], [1.74, 0.105, -0.29]];
export const skullW = (z) => interp(SKULL, z)[0];
export const jawW = (z) => interp(JAW, z)[0];
export const JAW_HINGE = new Vector3(0, -0.34, -0.2);
// the webs of skin at the mouth corners (head units): the lip cut reaches the outer skin only ahead of z (just behind the
// last upper tooth); behind it the cut stops `inset` inside the narrower of skull and jaw, leaving a wall of skin from the
// cheek to the lower jaw. Its vertices share the skull and the jaw by height across a band `band` (half height) wide, so
// as the jaw drops the wall stretches into a taut sheet, inner face mouth lining, outer face cheek (paintRex, body.js)
export const WEB = { z: 0.46, inset: 0.05, band: 0.05, thick: 0.08 };
// SKIN3: the webs are now their own thin sheets (WEBSHEET, appended to the mesh after the surface is built): the lip cut runs
// through the cheek back to the corner (`cut0`), and in it, set `inset` inside the cheek's outer skin, hangs a strip of
// triangles from the upper lip (its top rows sunk in the skull's wall, riding the skull) to the lower lip (its bottom rows sunk
// in the jaw's, riding the jaw); between them the skull-to-jaw weight runs linearly, so as the jaw drops each column of the
// strip is a straight chord, the sheet taut. Two layers `thick` apart (outer face cheek, inner face lining) closed by a rim
// along the free front edge, which is bowed back by `sag` at its middle (a bowstring); `dish` sets the middle of the sheet in
// toward the mouth (concave from outside). z0 is buried in the corner; zU/zL are the free edge's ends on the upper and lower lip.
export const WEBSHEET = { on: true, cut0: 0.14, z0: 0.05, zU: 0.47, zL: 0.43, sag: 0.07, inset: 0.05, dish: 0.06, thick: 0.01, bury: 0.03, nu: [12, 7], nv: [14, 8] };
// under the mouth, outside it, the neck-to-jaw hand-over of the skin's weights runs from z 0 to `span` (head units)
export const JAWBACK = { span: 0.7 };
// the eye sits in the side of the skull about two-thirds back from the snout tip and in the upper third of its depth,
// just under the brow ridge and above the cheek flare, where the skull narrows into the snout, facing forward and out
// (EYE.yaw from straight ahead: with a ~62 degree half field per eye that leaves ~55 degrees seen by both);
// x is found on the surface. Ball about 11 cm across, most of it hidden by the socket and lids.
export const EYE = { x: 0.4, y: 0.27, z: 0.37, r: 0.062, yaw: 0.6 };
// EYES (14 Nov): where the ball looks. The orbit faces 34 degrees out, but the ball's own resting gaze is only ~15 degrees out
// and each eye turns about its own centre toward the fixation point (its own line to it, so the two converge on a near
// target), within: outward 57 degrees, inward 17 degrees past straight ahead (enough to converge on a face 2 m off), up 26,
// down 32 (all head space); `lidYaw`: the lids and brow face 17 degrees out (body.js). The head takes the rest. It used to be clamped to 7 degrees off the 34-degree orbit axis for
// a target on the snout side, so a stare straight at the player left both pupils ~30 degrees outward of him (walleyed).
export const EYE_AIM = { yaw: 0.26, out: 1.0, in: 0.3, up: 0.45, down: 0.55, lidYaw: 0.3 };
// the notch cut ahead of the socket (see the eye socket below): centre dz/dy from the eye, `out` from the skin found there
export const EYE_NOTCH = { dz: 0.09, dy: -0.01, out: -0.06, rx: 0.05, ry: 0.04, rz: 0.09 };
/** Eye direction in head space. `pos` the ball's centre, `sd` +1 left / -1 right, `fixLocal` the fixation point in head
 *  space (or null: the resting gaze); `out` receives the unit direction. Pure, so Node can measure it (out/skel/eyes/aim.mjs). */
export function eyeAim(pos, local, sd, fixLocal, out) {
  const A = EYE_AIM;
  let yaw = sd * A.yaw, pitch = -0.04;
  if (fixLocal) {
    const dx = fixLocal.x - pos.x, dy = fixLocal.y - pos.y, dz = fixLocal.z - pos.z;
    yaw = Math.atan2(dx, dz); pitch = Math.atan2(dy, Math.hypot(dx, dz));
    if (dz < 0) yaw = sd * A.out;      // behind the eyes: turned as far round as it goes on its own side (the head is coming)
    const o = Math.min(A.out, Math.max(-A.in, sd * yaw)); yaw = sd * o;
    pitch = Math.min(A.up, Math.max(-A.down, pitch));
  }
  return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
}

// the head is designed in its own units and drawn at the species' scale, about the skull pivot: the skull bone carries the
// scale, so skin, teeth, eyes and lids (all placed in head space) follow it together
const HEAD_SCALE = new Matrix4().makeScale(TYRANNOSAURUS.dims.headScale ?? 1, TYRANNOSAURUS.dims.headScale ?? 1, TYRANNOSAURUS.dims.headScale ?? 1);

// ------------------------------------------------------------------ trunk cross-sections per spine joint
// [half width, half height, offset along up]
const TRUNK = [];
// The back is low over the hips (the sacral spine stands ~0.3 m over the hip joint and the back's top ~0.9 m: ilium and
// neural spines, not a metre and a half of flesh), the chest is the deepest part, and the belly line rises from it back to
// the groin: deep-chested, narrow in the waist ahead of the thighs, heavy at the hips (out/skel/PROPORTIONS.md)
for (let k = 0; k <= IDX.TAIL_BASE; k++) { const q = Math.pow(k / IDX.TAIL_BASE, 0.85), cf = Math.exp(-(((k - IDX.TAIL_BASE + 1) / 3) ** 2)); TRUNK.push([0.035 + 0.5 * q + 0.09 * cf, 0.045 + 0.64 * q + 0.06 * cf, -0.1 * q - 0.06 * cf]); }
TRUNK.push([0.6, 0.7, -0.3], [0.58, 0.72, -0.34], [0.62, 0.77, -0.41], [0.68, 0.78, -0.44], [0.68, 0.83, -0.49], [0.62, 0.85, -0.51],
  // the neck (SKIN3): its sections hang lower on the joints (top ~0.44 m over them, the back's height over the shoulders; the
  // extra depth goes under, into the throat). Centred high, the deep sections at its foot tilted back with the rising curve
  // stood ~0.9 m over the joints at the shoulders: a hump, which a head-low pose turned into a withers with the neck falling off it
  [0.56, 0.74, -0.3], [0.53, 0.66, -0.22], [0.5, 0.6, -0.16], [0.47, 0.55, -0.11], [0.44, 0.5, -0.07], [0.41, 0.46, -0.04], [0.37, 0.42, 0]);
const TUNE_G = 'Body shape (applies on reload)';      // tune
{ // tune: body shape. The skin is meshed once when the body is built, so these apply on reload (the stored values are applied here, at import, before that).
  const G = 'Body shape (applies on reload)', R = 'reload', rg = (v) => (v >= 0 ? [v * 0.4, v * 2.5 + 0.02] : [v * 2.5 - 0.02, v * 0.4]);      // tune
  tuneGroup(G, { order: 40 });      // tune
  const T = (label, o, k, code, lo, hi, st) => { const r = rg(o[k]); tune(G, label, o, k, lo ?? r[0], hi ?? r[1], st ?? 0.005, null, code, R); };      // tune
  T('Hips: half width (m)', TRUNK[IDX.PELVIS], 0, 'trunk.pelvis.width'); T('Hips: depth (m)', TRUNK[IDX.PELVIS], 1, 'trunk.pelvis.depth'); T('Waist: half width (m)', TRUNK[IDX.TAIL_BASE], 0, 'trunk.waist.width'); T('Waist: depth (m)', TRUNK[IDX.TAIL_BASE], 1, 'trunk.waist.depth');      // tune
  T('Chest: half width (m)', TRUNK[IDX.CHEST], 0, 'trunk.chest.width'); T('Chest: depth (m)', TRUNK[IDX.CHEST], 1, 'trunk.chest.depth'); T('Mid-back: half width (m)', TRUNK[IDX.CHEST - 3], 0, 'trunk.midback.width'); T('Mid-back: depth (m)', TRUNK[IDX.CHEST - 3], 1, 'trunk.midback.depth');      // tune
}

// ------------------------------------------------------------------ SDF primitives
const _q = new Vector3();
function sdEllipsoid(px, py, pz, rx, ry, rz) {
  const k0 = Math.hypot(px / rx, py / ry, pz / rz), k1 = Math.hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}
function sdRoundBox(px, py, pz, bx, by, bz, r) {
  const qx = Math.abs(px) - bx, qy = Math.abs(py) - by, qz = Math.abs(pz) - bz;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
function sdCone(px, py, pz, ax, ay, az, bx, by, bz, ra, rb) {   // round cone between two spheres
  const bax = bx - ax, bay = by - ay, baz = bz - az, l2 = bax * bax + bay * bay + baz * baz, rr = ra - rb, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = px - ax, pay = py - ay, paz = pz - az, y = pax * bax + pay * bay + paz * baz, z = y - l2;
  const xx = (pax * l2 - bax * y) ** 2 + (pay * l2 - bay * y) ** 2 + (paz * l2 - baz * y) ** 2, y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * xx;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(xx + z2) * il2 - rb;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(xx + y2) * il2 - ra;
  return (Math.sqrt(xx * a2 * il2) + y * rr) * il2 - ra;
}

/** A primitive lives in its own frame (matrix), knows its bounding radius, its bones and its material tag. */
class Prim {
  constructor(kind, m, args, bones, { k = 0.1, sigma = 0.07, tag = 'skin', op = 'add' } = {}) {
    this.kind = kind; this.inv = new Matrix4().copy(m).invert(); this.m = m; this.args = args; this.bones = bones; this.k = k; this.sigma = sigma; this.tag = tag; this.op = op;
    this.c = new Vector3().setFromMatrixPosition(m); this.rad = 0;
    this.sc = new Vector3().setFromMatrixColumn(m, 0).length();     // a frame in head space carries the head's scale: distances back to metres
  }
  local(x, y, z) { return _q.set(x, y, z).applyMatrix4(this.inv); }
  sd(x, y, z) { return this.sd0(x, y, z) * this.sc; }
  sd0(x, y, z) {
    const p = this.local(x, y, z), a = this.args;
    if (this.kind === 'ell') return sdEllipsoid(p.x, p.y, p.z, a[0], a[1], a[2]);
    if (this.kind === 'box') return sdRoundBox(p.x, p.y, p.z, a[0], a[1], a[2], a[3]);
    if (this.kind === 'tbox') {   // rounded box whose width narrows toward the top (a[4]) and the bottom (a[5])
      const yn = Math.max(-1, Math.min(1, p.y / (a[1] + a[3]))), bx = a[0] * (1 - a[4] * Math.max(yn, 0) - a[5] * Math.max(-yn, 0));
      return sdRoundBox(p.x, p.y, p.z, Math.max(bx, 0.004), a[1], a[2], a[3]);
    }
    if (this.kind === 'vee') {   // a V-bottomed prism: apex line along z at the origin, sides rising `a[0]` per metre out, up to `a[1]`, cut at |x| = a[2], |z| = a[3], one half (a[5])
      const s = a[0], r = a[4], ax = Math.abs(p.x), sm = (u, v) => { const h = Math.max(r - Math.abs(u - v), 0) / r; return Math.max(u, v) + h * h * r * 0.25; };     // its edges rounded over `r`
      return Math.max(sm(sm((s * ax - p.y) / Math.hypot(1, s), ax - a[2]), sm(p.y - a[1], Math.abs(p.z) - a[3])), -a[5] * p.x);     // a[5]: the half on that side of the midline
    }
    if (this.kind === 'cone') return sdCone(p.x, p.y, p.z, 0, 0, 0, 0, a[0], 0, a[1], a[2]);
    if (this.kind === 'slit') {
      // behind the last upper teeth (z < WEB.z) the lip cut stops short of the outer skin: what is left there, a wall from the
      // cheek down to the lower jaw, is the web at each mouth corner (stretched into a sheet by its weights as the jaw opens)
      const lim = WEBSHEET.on ? a[1] : a[1] + (Math.min(skullW(p.z), jawW(p.z)) - WEB.inset - a[1]) * ss(WEB.z + 0.025, WEB.z - 0.025, p.z);
      const m = mouthY(p.z), dy = p.y - m, lip = Math.max(Math.abs(dy) - a[0], WEBSHEET.cut0 - p.z, Math.abs(p.x) - lim);
      // behind the tooth rows the mouth is a cavity: the palate vaults up, the floor sinks into a trough, and both
      // deepen toward the throat, so an open mouth shows a hollow, not two flat plates
      const wi = Math.max(0.03, Math.min(skullW(p.z), jawW(p.z)) - 0.09), u = Math.min(1, Math.abs(p.x) / wi), bowl = 1 - u * u;
      const fr = ss(1.58, 1.3, p.z), th = ss(0.7, 0.05, p.z);
      const up = a[0] + bowl * fr * (0.085 + 0.05 * th), dn = a[0] + bowl * fr * (0.09 + 0.1 * th);
      const cav = Math.max(dy > 0 ? dy - up : -dy - dn, -0.02 - p.z, Math.abs(p.x) - wi);
      // the web stands back from the cheek above it and the jaw below: a shallow groove along the mouth line outside its outer
      // face (`thick` outside the lip cut), so stretched open it is a recessed, concave sheet under the cheek's edge
      const grv = Math.max(Math.abs(dy) - a[0] - 0.012, p.z - WEB.z + 0.02, 0.1 - p.z, Math.min(skullW(p.z), jawW(p.z)) - WEB.inset + WEB.thick - Math.abs(p.x));
      return WEBSHEET.on ? Math.min(lip, cav) : Math.min(lip, cav, grv);
    }
    return 1;
  }
}

const V = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
const frame = (o, X, Y, Z) => new Matrix4().makeBasis(X, Y, Z).setPosition(o);

// LEGDEFORM: the leg's skin frames. The femur and the tibia take their twist from the knee plane (the plane of hip, knee and ankle:
// the sim leans it out by kneeOut and turns it with the hip's long-axis rotation), so the knee is a hinge about one axis shared by
// both frames. They used to take it from the body's forward (squared to each bone): blind to the knee plane, and undefined when a
// bone lies along the body (a femur swung forward in a run, a shank folded back in a crouch), where the frame spun by up to 180 deg.
// The bind skeleton stands at a canonical knee plane (`canon`, rad out from the body's forward about the hip-to-ankle line: the
// middle of what a walk uses), so the shapes, designed in body-forward frames, look as designed at an ordinary stride, and turn
// with the femur's real rotation from there. Helper bones per leg (appended after the others): `twist`, the femur with half its
// long-axis rotation (the thigh's upper half rides it, so the turn spreads down the thigh instead of shearing at the hip); `kmid`
// and `amid`, half way between femur and tibia at the knee and between tibia and metatarsus at the ankle (the outside of each bend
// rides them, so a 120 deg knee blends across two 60 deg steps instead of one, and the front of the knee and the heel keep their
// volume). `kpush`/`apush`: how far (m) each mid bone slides out from the joint as the bend closes past `k0`/`a0` (rad), like a
// kneecap riding the femur and the heel's tendon standing off the ankle.
// LEGDEFORM leg weights (m): `reach` (full within the first, none past the second, from the femur and tibia lines) bounds the
// knee pass; knee and ankle: `z` the band over which a vertex goes from the inside of the bend to the outside (along the knee's
// front / the heel's direction), `w` the half width of the femur-tibia hand-over inside and outside, `mid` and `sig` how much
// of the outside rides the mid bone and over what distance along the limb, `shift` moves the split along the limb; `twist`: the
// share of the femur handed to the twist bone fades from the hip (fraction of the femur) to the given fraction
export const LEGW = { reach: [0.75, 1.0], twist: [0.15, 0.75],
  knee: { z: [-0.12, 0.22], w: [0.1, 0.24], mid: 1.0, sig: 0.2, shift: 0.0 },
  ankle: { reach: [0.5, 0.7], z: [-0.06, 0.14], w: [0.09, 0.14], mid: 1.0, sig: 0.13, shift: 0.02 } };
export const LEGFRAME = { canon: 0.28, kpush: 0.02, k0: 0.6, apush: 0.03, a0: 1.0 };
const _qa = new Quaternion(), _qb = new Quaternion(), _ma = new Matrix4();
const midBone = (m, A, Bm, p, push) => {
  _qa.setFromRotationMatrix(A); _qb.setFromRotationMatrix(Bm); _qa.slerp(_qb, 0.5);
  m.makeRotationFromQuaternion(_qa); const e = m.elements; m.setPosition(p.x + e[8] * push, p.y + e[9] * push, p.z + e[10] * push);
};

/** Bone frames from a pose buffer. The same function poses the bind skeleton and every live frame. `legMode`: 'live' (default:
 *  leg frames from the knee plane), 'bind' (the canonical knee plane: the skin's bind skeleton), 'design' (the old body-forward
 *  frames, in which the bind shapes are placed). */
export function boneMatrices(pose, out, jawAngle = null, legMode = 'live') {
  const v = pose.v, J = (i, t) => t.fromArray(v, i * 3), U = (i, t) => t.fromArray(v, (PV.SU + i) * 3);
  const a = V(), b = V(), c = V(), f = V(), u = V(), l = V();
  let n = 0;
  for (let i = 0; i < SPINE_N; i++) {
    // the chest's own frame faces along the back, not half way up the neck (a central difference there turned the
    // shoulders and the breast with every lift of the neck's root: half of a turn of up to 1.6 rad)
    J(i === IDX.CHEST ? i : Math.min(i + 1, SPINE_N - 1), a); J(Math.max(i - 1, 0), b); f.subVectors(a, b).normalize();
    U(i, u); u.addScaledVector(f, -u.dot(f)).normalize(); l.crossVectors(u, f);
    out[n++].makeBasis(l, u, f).setPosition(J(i, c));
  }
  // skull and jaw
  c.fromArray(v, PV.HEAD_P * 3); f.fromArray(v, PV.HEAD_F * 3).normalize(); u.fromArray(v, PV.HEAD_U * 3);
  u.addScaledVector(f, -u.dot(f)).normalize(); l.crossVectors(u, f);
  const H = out[n++].makeBasis(l, u, f).setPosition(c).multiply(HEAD_SCALE);      // head space is the design's; the species scales it
  const ja = jawAngle ?? pose.s[PS.JAW];
  out[n++].copy(H).multiply(new Matrix4().makeTranslation(JAW_HINGE.x, JAW_HINGE.y, JAW_HINGE.z))
    .multiply(new Matrix4().makeRotationX(ja)).multiply(new Matrix4().makeTranslation(-JAW_HINGE.x, -JAW_HINGE.y, -JAW_HINGE.z));
  // body forward, for limb twist
  J(IDX.PELVIS + 1, a); J(IDX.PELVIS, b); const bf = V().subVectors(a, b).normalize();
  const limb = (m, p0, p1, hint) => {
    const Y = V().subVectors(p1, p0).normalize(), Z = V().copy(hint).addScaledVector(Y, -hint.dot(Y));
    if (Z.lengthSq() < 1e-6) Z.set(0, 1, 0).addScaledVector(Y, -Y.y); Z.normalize();
    const X = V().crossVectors(Y, Z); m.makeBasis(X, Y, Z).setPosition(p0);
  };
  const pel = J(IDX.PELVIS, V()), pl = U(IDX.PELVIS, V()).cross(bf).normalize();
  for (let k = 0; k < 2; k++) {
    const o = (PV.LEG + k * LEG.SIZE) * 3, P = (j) => V().fromArray(v, o + j * 3);
    const hip = P(0), knee = P(1), ank = P(2), mtp = P(3), tf = P(4).normalize(), tu = P(5).normalize();
    // the knee plane: canonical (bind) or the pose's own; its forward is where the knee points
    const ha = V().subVectors(ank, hip).normalize(), lat = V().copy(pl).multiplyScalar(Math.sign(V().subVectors(hip, pel).dot(pl)) || 1);
    const kc = V().copy(bf).addScaledVector(ha, -bf.dot(ha)).normalize(), lc = V().copy(lat).addScaledVector(ha, -lat.dot(ha)).normalize();
    kc.multiplyScalar(Math.cos(LEGFRAME.canon)).addScaledVector(lc, Math.sin(LEGFRAME.canon)).normalize();
    let hK = kc, hW = kc;
    if (legMode === 'design') hK = hW = bf;
    else if (legMode !== 'bind') {
      const kd = V().subVectors(knee, hip); kd.addScaledVector(ha, -kd.dot(ha)); const L = kd.length();
      kd.multiplyScalar(1 / (L || 1)).lerp(kc, 1 - ss(0.04, 0.12, L)).normalize();     // (the sim never straightens the knee past ~20 deg; this only guards)
      hK = kd; hW = V().addVectors(kd, kc).normalize();
    }
    const F = out[n], T = out[n + 1], M = out[n + 2];
    limb(out[n++], hip, knee, hK); limb(out[n++], knee, ank, hK); limb(out[n++], ank, mtp, tf);
    if (out.length >= BONE_COUNT) {
      const x = BONE.twist(k), fe = V().subVectors(knee, hip).normalize(), ti = V().subVectors(ank, knee).normalize(), mt = V().subVectors(mtp, ank).normalize();
      limb(out[x], hip, knee, hW);
      const LF = LEGFRAME, kf = Math.acos(Math.max(-1, Math.min(1, fe.dot(ti)))), af = Math.acos(Math.max(-1, Math.min(1, ti.dot(mt))));
      const live = legMode === 'live';
      midBone(out[x + 1], F, T, knee, live ? LF.kpush * Math.max(0, Math.sin((kf - LF.k0) / 2)) : 0);
      midBone(out[x + 2], T, M, ank, live ? LF.apush * Math.max(0, Math.sin((af - LF.a0) / 2)) : 0);
    }
    const tl = V().crossVectors(tu, tf), sgn = k === 0 ? 1 : -1, S = pose.s, fan = S.length > PS.SPREAD ? S[PS.SPREAD + k] : 0.16 + 0.26 * S[PS.LOAD + k];
    for (let d = 0; d < 3; d++) {
      const ang = (d - 1) * fan * -sgn, g = V().copy(tf).multiplyScalar(Math.cos(ang)).addScaledVector(tl, Math.sin(ang));
      const side = V().crossVectors(tu, g).normalize();
      // proximal phalanx flexes about the toe joint, the distal one about the next joint along
      const cp = S[PS.TOE + k * 6 + d] || 0, cd = S[PS.TOE + k * 6 + 3 + d] || 0;
      const g1 = V().copy(g).multiplyScalar(Math.cos(cp)).addScaledVector(tu, -Math.sin(cp)), u1 = V().copy(tu).multiplyScalar(Math.cos(cp)).addScaledVector(g, Math.sin(cp));
      out[n + d].makeBasis(side, u1, g1).setPosition(mtp);
      const jp = V().copy(mtp).addScaledVector(g1, TOE_LEN[d] * TOE_SPLIT);
      const g2 = V().copy(g1).multiplyScalar(Math.cos(cd)).addScaledVector(u1, -Math.sin(cd)), u2 = V().copy(u1).multiplyScalar(Math.cos(cd)).addScaledVector(g1, Math.sin(cd));
      out[n + 3 + d].makeBasis(side, u2, g2).setPosition(jp);
    }
    n += 6;
  }
  for (let k = 0; k < 2; k++) {
    const o = (PV.ARM + k * 3) * 3, sh = V().fromArray(v, o), el = V().fromArray(v, o + 3), wr = V().fromArray(v, o + 6);
    limb(out[n++], sh, el, bf); limb(out[n++], el, wr, bf);
  }
  if (STATIONS) { neckCurve(v, H, out, n); n += NECKC.N; }
  return n;
}

// ------------------------------------------------------------------ the neck as a curve
// The neck's skin does not ride the vertebrae. Seven 25 cm vertebrae under a skin up to 0.8 m from them, with up to 1.6 rad
// of turn at the chest joint and 0.5 at each joint above, cannot be linear-blend skinned to those joints: whatever the
// weights, a vertex between two frames that differ by a large turn is pulled in toward the chain (the base of the neck
// collapsed to half its section with the head up) or out (4-6x stretch), and every joint shows. Instead a smooth C2 curve
// (uniform cubic B-spline) runs through the chest, the vertebrae and on along the line the neck enters the skull; frames
// are carried along it without twist (rotation-minimising, double reflection) from the chest's frame, and the twist that
// remains between that and the skull is shared out evenly along the neck. NECKC.N stations sampled on it every frame are
// the neck's bones: neighbouring stations differ by a small turn, so the skin follows the curve itself and keeps its
// section and its length, wherever the chain's bends happen to fall. From s = 26 on the curve rides the skull rigidly.
// s is in joint units: s = 17 at the chest's back joint, 25 near the skull pivot, 27 half a metre into the skull.
export const NECKC = { S0: 17, S1: 27, H: 0.4, N: 26 };
// With #neck7 the skin rides the seven neck joints themselves (a game rig: 50 bones), weighted smoothly along the neck's arc length (a
// quadratic B-spline partition of unity over the joints, blending into chest and skull). The curve below is kept as the
// measuring frame (neckFrames: test/neckcheck.mjs) and as the shipped 26-station skin.
const NW = typeof process !== 'undefined' && process.env && process.env.NECK_NW ? +process.env.NECK_NW : 1;
// The shipped skin rides the 26 stations; the 7-joint skin (smooth weights) is kept for development behind '#neck7' in the
// URL (or REX_NECK=joints in Node). See out/merge2/NECK7.md for why it does not hold yet.
const NECK7 = (typeof location !== 'undefined' && /neck7/.test(location.hash)) || (typeof process !== 'undefined' && process.env && process.env.REX_NECK === 'joints');
const STATIONS = !NECK7;
/** the neck curve's NECKC.N frames for a pose (measurement; not bones) */
export function neckFrames(pose) {
  const M = Array.from({ length: BONE_COUNT }, () => new Matrix4()); boneMatrices(pose, M, 0);
  const out = Array.from({ length: NECKC.N }, () => new Matrix4()); neckCurve(pose.v, M[BONE.SKULL], out, 0); return out;
}
const _cp = Array.from({ length: 13 }, () => new Vector3()), _sm = Array.from({ length: 13 }, () => new Vector3()), _cs = new Float32Array(101 * 9);
function neckCurve(v, H, out, n0) {
  const P = _cp, he = H.elements, hf = V(he[8], he[9], he[10]), hu = V(he[4], he[5], he[6]);
  const e = V().copy(hf).multiplyScalar(0.97).addScaledVector(hu, 0.24).normalize();
  for (let i = 0; i < 10; i++) P[i].fromArray(v, (16 + i) * 3);
  for (let k = 1; k <= 3; k++) P[9 + k].copy(P[9]).addScaledVector(e, 0.25 * k);
  // the vertebrae's own bends, spread a little further along (a short local turn becomes a longer gentle one: the skin is a
  // metre across, the vertebrae a quarter metre long)
  for (let pass = 0; pass < 1; pass++) { for (let i = 2; i <= 8; i++) _sm[i].copy(P[i - 1]).add(P[i + 1]).multiplyScalar(0.25).addScaledVector(P[i], 0.5); for (let i = 2; i <= 8; i++) P[i].copy(_sm[i]); }
  const NS = 101, ds = (NECKC.S1 - NECKC.S0) / (NS - 1), C = _cs;
  for (let i = 0; i < NS; i++) {
    const s = NECKC.S0 + i * ds; let k = Math.min(10, Math.max(1, Math.floor(s - 16))); const t = s - 16 - k, t2 = t * t, t3 = t2 * t;
    const a = P[k - 1], b = P[k], c = P[k + 1], d = P[k + 2];
    const w0 = (1 - t) ** 3 / 6, w1 = (3 * t3 - 6 * t2 + 4) / 6, w2 = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, w3 = t3 / 6;
    const g0 = -((1 - t) ** 2) / 2, g1 = (3 * t2 - 4 * t) / 2, g2 = (-3 * t2 + 2 * t + 1) / 2, g3 = t2 / 2;
    for (let q = 0; q < 3; q++) {
      const ax = q === 0 ? 'x' : q === 1 ? 'y' : 'z';
      C[i * 9 + q] = w0 * a[ax] + w1 * b[ax] + w2 * c[ax] + w3 * d[ax];
      C[i * 9 + 3 + q] = g0 * a[ax] + g1 * b[ax] + g2 * c[ax] + g3 * d[ax];
    }
    const l = Math.hypot(C[i * 9 + 3], C[i * 9 + 4], C[i * 9 + 5]) || 1; C[i * 9 + 3] /= l; C[i * 9 + 4] /= l; C[i * 9 + 5] /= l;
  }
  // rotation-minimising frames from the chest's up (double reflection)
  const r = V().fromArray(v, (PV.SU + 17) * 3), t0 = V(C[3], C[4], C[5]); r.addScaledVector(t0, -r.dot(t0)).normalize();
  C[6] = r.x; C[7] = r.y; C[8] = r.z;
  const v1 = V(), rL = V(), tL = V(), ti = V(), tj = V(), ri = V();
  for (let i = 0; i < NS - 1; i++) {
    ti.set(C[i * 9 + 3], C[i * 9 + 4], C[i * 9 + 5]); tj.set(C[i * 9 + 12], C[i * 9 + 13], C[i * 9 + 14]); ri.set(C[i * 9 + 6], C[i * 9 + 7], C[i * 9 + 8]);
    v1.set(C[i * 9 + 9] - C[i * 9], C[i * 9 + 10] - C[i * 9 + 1], C[i * 9 + 11] - C[i * 9 + 2]); const c1 = v1.dot(v1);
    if (c1 < 1e-12) { ri.addScaledVector(tj, -ri.dot(tj)).normalize(); } else {
      rL.copy(ri).addScaledVector(v1, -2 / c1 * v1.dot(ri)); tL.copy(ti).addScaledVector(v1, -2 / c1 * v1.dot(ti));
      const v2 = tL.sub(tj).negate(), c2 = v2.dot(v2); ri.copy(rL); if (c2 > 1e-12) ri.addScaledVector(v2, -2 / c2 * v2.dot(rL));
      ri.addScaledVector(tj, -ri.dot(tj)).normalize();
    }
    C[i * 9 + 15] = ri.x; C[i * 9 + 16] = ri.y; C[i * 9 + 17] = ri.z;
  }
  // the twist left between the carried frame and the skull's (its up squared to the entry line), shared out along the neck
  const iE = Math.round((26 - NECKC.S0) / ds), uE = V().copy(hu).multiplyScalar(0.97).addScaledVector(hf, -0.24).normalize(), tE = V(C[iE * 9 + 3], C[iE * 9 + 4], C[iE * 9 + 5]);
  const rE = V(C[iE * 9 + 6], C[iE * 9 + 7], C[iE * 9 + 8]), phi = Math.atan2(V().crossVectors(rE, uE).dot(tE), rE.dot(uE));
  const T = V(), U = V(), Lf = V(), m = new Matrix4();
  for (let k = 0; k < NECKC.N; k++) {
    const s = NECKC.S0 + k * NECKC.H, x = (s - NECKC.S0) / ds, i = Math.min(NS - 2, Math.floor(x)), f = x - i;
    T.set(C[i * 9 + 3] * (1 - f) + C[i * 9 + 12] * f, C[i * 9 + 4] * (1 - f) + C[i * 9 + 13] * f, C[i * 9 + 5] * (1 - f) + C[i * 9 + 14] * f).normalize();
    U.set(C[i * 9 + 6] * (1 - f) + C[i * 9 + 15] * f, C[i * 9 + 7] * (1 - f) + C[i * 9 + 16] * f, C[i * 9 + 8] * (1 - f) + C[i * 9 + 17] * f);
    U.addScaledVector(T, -U.dot(T)).normalize().applyAxisAngle(T, phi * ss(18, 26, s));
    Lf.crossVectors(U, T);
    out[n0 + k].makeBasis(Lf, U, T).setPosition(C[i * 9] * (1 - f) + C[i * 9 + 9] * f, C[i * 9 + 1] * (1 - f) + C[i * 9 + 10] * f, C[i * 9 + 2] * (1 - f) + C[i * 9 + 11] * f);
  }
  void m;
}
const XB0 = SPINE_N + 2 + 2 * 9 + 4 + (STATIONS ? NECKC.N : 0);     // LEGDEFORM helper bones, after all the others: per leg twist, knee mid, ankle mid
export const BONE_COUNT = XB0 + 6;
export const BONE = { SKULL: SPINE_N, JAW: SPINE_N + 1, leg: (k, j) => SPINE_N + 2 + k * 9 + j, arm: (k, j) => SPINE_N + 20 + k * 2 + j, neck: (k) => SPINE_N + 24 + k,
  twist: (k) => XB0 + k * 3, kmid: (k) => XB0 + k * 3 + 1, amid: (k) => XB0 + k * 3 + 2, X0: XB0 };
// the toes' lengths and the flesh on them are the species' (species.foot); the sim's foot uses the same numbers
const FOOT = TYRANNOSAURUS.foot, TOE_LEN = FOOT.toes, TOE_SPLIT = FOOT.split, TOE_W = FOOT.flesh;
// the leg's flesh: how far the thigh's mass stands out from the hip socket (the femoral head turns in to the socket; the shaft
// and its muscles sit outside it), so that two hip sockets 0.72 m apart still carry two separate drumsticks
// (the lower leg carries an adult's mass: a shank and metatarsus thick enough to read under the body; out/skel/PROPORTIONS.md)
// The thigh is a rounded mass (`thigh`: half sizes out, along, fore-aft, as fractions of the femur for `along`) with a front edge
// (`front`: the quadriceps/iliotibialis, a cone from the hip down to above the knee, radii top and bottom) and a back edge
// (`back`: the flexors), both narrowing into a small knee (`knee`); the shank is a drumstick of its own: a cone (`shank`, radii
// at knee and ankle), a cnemial crest at the top front (`crest`), a calf (gastrocnemius) bulging behind its upper half
// (`calf`) and running down into a tendon that keeps the taper to the ankle (`tendon`, radii)
// the thigh's upper fan over the ilium (SKIN3; `up` over the hip joint, `out` from it sideways, `back` along the body, half sizes
// [out, up, fore-aft], blend k) and the caudofemoral cone's radii at the tail and at the thigh
export const THIGHTOP = { up: 0.18, out: 0.16, back: -0.32, r: [0.32, 0.5, 0.9], k: 0.26, cfR: [0.42, 0.32] };
export const LEGSKIN = { thighOut: 0.3, thigh: [0.46, 0.46, 0.56], thighK: 0.07, front: [0.3, 0.15], back: [0.34, 0.16], taper: [0.34, 0.22], knee: [0.25, 0.18, 0.22],
  shank: [0.36, 0.17], crest: [0.25, 0.2, 0.24], calf: [0.36, 0.36, 0.36], tendon: [0.24, 0.09], meta: [0.205, 0.165], ankle: 0.215 };
// the foot's flesh (m): digit half widths (II, III, IV) and the bone axes' height above the sole (`pad`, = species foot.pad); the
// half height of a phalanx above its axis (`top`) and of a pad (`padH`); how far each digit's base sits from the middle one
// (`base`); distal phalanges carried by the distal bone (`phal`: II 1, III 2, IV 3, plus the claw); the claw's length along
// the digit; the web's reach along the toes and half thickness; the metatarsus' half width and half depth, top and bottom
// [w0, w1, d0, d1]; the ankle's half sizes; the hallux. `coarse`: the phone grid (7 cm) thickens what would fall between cells
// `clawOut`: how far the claw's tip reaches past the sim's toe tip (the toe's bone ends where the sim says; the horn sheath runs on)
// the claw's point (SKIN3, toe distal frame, m): starts `from` along the sheath at height y0 with radius r0, a cubic through
// control points c1 (from the start) and c2 (from the toe's claw end) to `tip` (past that end; height over the sole)
export const CLAWTIP = { on: true, from: 0.3, y0: 0.034, r0: 0.05, c1: [0.09, 0.062], c2: [0.05, 0.03], tip: [0.035, 0.004], seg: [9, 6], ring: [9, 7] };
export const FOOTSKIN = { width: [0.102, 0.114, 0.102], pad: 0.06, top: 0.062, padH: 0.05, knuckle: [0.054, 0.05], base: 0.1, phal: [1, 2, 3], claw: 0.21, clawOut: 0.09, clawFlat: 0.7, web: 0.17, webT: 0.034,
  meta: [0.165, 0.235, 0.16, 0.13], ankle: [0.225, 0.19, 0.18], hallux: { up: 0.26, len: 0.13 }, coarse: 1.25 };
// The pubic boot (owner, 2026-11-17: "the rex model is missing a pubic bone hump between the legs I think?", then "you can surely
// make the keel be in the right exact place ... there are skeletons of this animal to look at for reference"). Placed from
// tyrannosaurid osteology, in fractions of the femur: the pubis is a rod ~0.9 of the femur long, running subvertically down from
// the hip socket and tilted `tilt` forward, ending in a boot ~0.62 of the pubis long, mostly behind the shaft's end (a short toe
// ahead of it), its lower edge near horizontal, a narrow blade (the pubes are fused on the midline); the ischium runs down and back,
// ~0.75 of the femur, to a small tip under the tail base. All distances below are measured from the hip joint's mid point, along the
// pelvis' frame: `fwd` ahead (+) or behind, `drop` below. `soft`: flesh under the bone. `toe`, `heel`: the boot's flat bottom from its
// front toe to its back end, relative to the shaft's end. `w`, `h`: half width and half height of the keel's section.
// `front`, `back`: the distance over which it runs into the belly ahead and up to the tail base behind. `cleft`: half widths (m) between which its blend with other shapes fades to a hard join (it blends with the belly on the midline, not with the thighs); `own`: how far (m) from its own lobes a vertex still belongs to the pelvis alone.
// `seam`: the softness (m) of that join beside the midline (it was 0.004, a hard crease). `rim`: how much of the hide's fog rim (body.js) is left in the occluded space between the thighs.
const FEMUR = TYRANNOSAURUS.dims.femur, PUBIS_LEN = 0.9 * FEMUR, PUBIS_TILT = 12 * Math.PI / 180;
export const PUBIS = { len: PUBIS_LEN, shaftFwd: PUBIS_LEN * Math.sin(PUBIS_TILT), drop: PUBIS_LEN * Math.cos(PUBIS_TILT) + 0.06 + 0.0, boot: 0.62 * PUBIS_LEN, toe: 0.2, heel: 0.59,
  w: 0.06, h: 0.15, front: 0.8, back: 0.35, k: 0.15, sag: 0.05, belly: 0.8, cleft: [0.1, 0.18], seam: 0.04, rim: 0.1, own: [0.09, 0.17],
  isch: { len: 0.75 * FEMUR, ang: 50 * Math.PI / 180, w: 0.09, h: 0.09 },
  // the wedge (owner: "it was actually more of a hoop that even had a void between it and the pelvis"): the pubis is buried in the body wall,
  // the space between its shaft, the belly ahead and the ischium behind is muscle and the floor of the body cavity, so between the legs the trunk
  // is one solid wedge, widest at the hips and narrowing down to the boot. A stack of `n` lobes from `top` to `bottom` (drops below the hip joint,
  // m), half width `wTop` to `wLow`, half height `h`, half length `len` [bottom, top] centred `fwd` ahead of the hip; they belong to the pelvis
  // alone within `own` x the keel's reach (small, so that no thigh skin is taken)
  // the inner thighs' V (`vee`, owner 2026-11-18): its point `drop` below the hip joints, `fwd` ahead of them, its sides rising `slope` per metre out to `half`
  // (inside the thighs) and up to `top`, `len` fore and aft, its edges rounded over `round`; one half a side, `femur` of it on that side's thigh
  vee: { drop: 1.25, slope: 0.55, top: 0.6, half: 0.5, fwd: 0.05, len: 0.6, round: 0.2, k: 0.15, femur: 0.5 },
  wedge: { n: 7, top: -0.3, bottom: -1.02, wTop: 0.55, wLow: 0.09, h: 0.14, len: [0.5, 0.7], fwd: 0.1, own: 0.55 } };
{ const G = TUNE_G, R = 'reload', rg = (v) => (v >= 0 ? [v * 0.4, v * 2.5 + 0.02] : [v * 2.5 - 0.02, v * 0.4]);      // tune
  const T = (label, o, k, code) => { const r = rg(o[k]); tune(G, label, o, k, r[0], r[1], 0.005, null, code, R); };      // tune
  T('Pubic boot: how far it drops (m)', PUBIS, 'drop', 'pubis.drop'); T('Pubic boot: length of the boot (m)', PUBIS, 'boot', 'pubis.boot'); T('Pubic boot: toe (forward point)', PUBIS, 'toe', 'pubis.toe'); T('Pubic boot: heel (rear point)', PUBIS, 'heel', 'pubis.heel');      // tune
  T('Pubic keel: half width (m)', PUBIS, 'w', 'pubis.w'); T('Pubic keel: half height (m)', PUBIS, 'h', 'pubis.h'); T('Pubic keel: runs into the belly over (m)', PUBIS, 'front', 'pubis.front'); T('Pubic keel: runs up to the tail over (m)', PUBIS, 'back', 'pubis.back');      // tune
  T('Pubic keel: seam softness beside the midline (m)', PUBIS, 'seam', 'pubis.seam'); T('Between the thighs: fog rim kept', PUBIS, 'rim', 'pubis.rim');      // tune
  T('Pubic keel: blend softness', PUBIS, 'k', 'pubis.k'); T('Pubic keel: sag', PUBIS, 'sag', 'pubis.sag'); T('Pubic keel: belly fullness', PUBIS, 'belly', 'pubis.belly'); T('Pubic shaft: forward lean (m)', PUBIS, 'shaftFwd', 'pubis.shaftFwd');      // tune
  T('Inner thighs: V slope (rise per m out)', PUBIS.vee, 'slope', 'pubis.vee.slope'); T('Inner thighs: V point below the hips (m)', PUBIS.vee, 'drop', 'pubis.vee.drop'); T('Inner thighs: V half width (m)', PUBIS.vee, 'half', 'pubis.vee.half'); T('Inner thighs: V half length (m)', PUBIS.vee, 'len', 'pubis.vee.len');      // tune
  T('Pubic wedge: half width at the hips (m)', PUBIS.wedge, 'wTop', 'pubis.wedge.wTop'); T('Pubic wedge: half width at the keel (m)', PUBIS.wedge, 'wLow', 'pubis.wedge.wLow'); T('Pubic wedge: half length at the keel (m)', PUBIS.wedge.len, 0, 'pubis.wedge.len0'); T('Pubic wedge: half length at the hips (m)', PUBIS.wedge.len, 1, 'pubis.wedge.len1');      // tune
  T('Ischium: length (m)', PUBIS.isch, 'len', 'pubis.isch.len'); T('Ischium: angle (rad)', PUBIS.isch, 'ang', 'pubis.isch.ang'); T('Ischium: half width (m)', PUBIS.isch, 'w', 'pubis.isch.w'); T('Ischium: half height (m)', PUBIS.isch, 'h', 'pubis.isch.h');      // tune
}      // tune
export const CHESTF = { f0: 0.1, u0: -0.62, r: [0.34, 0.6, 0.5], k: 0.2 };

// ------------------------------------------------------------------ build the primitive set in the bind pose
function buildPrims(pose, B, coarse = false, cell = 0.04) {
  const v = pose.v, P = [], m4 = () => new Matrix4();
  const add = (kind, m, args, bones, opt) => { const p = new Prim(kind, m, args, bones, opt); P.push(p); return p; };
  const J = Array.from({ length: SPINE_N }, (_, i) => V().fromArray(v, i * 3));
  const Uv = Array.from({ length: SPINE_N }, (_, i) => V().fromArray(v, (PV.SU + i) * 3));
  // trunk: dense ellipsoids along a Catmull-Rom spine, from tail tip to skull
  const pt = V(), tg = V(), up = V(), lf = V(); let tUp = null;
  for (let i = 0; i < SPINE_N - 1; i++) {
    const p0 = J[Math.max(i - 1, 0)], p1 = J[i], p2 = J[i + 1], p3 = J[Math.min(i + 2, SPINE_N - 1)];
    const segLen = p1.distanceTo(p2), steps = Math.max(2, Math.ceil(segLen / 0.09));
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      pt.set(0, 0, 0).addScaledVector(p0, -0.5 * t3 + t2 - 0.5 * t).addScaledVector(p1, 1.5 * t3 - 2.5 * t2 + 1).addScaledVector(p2, -1.5 * t3 + 2 * t2 + 0.5 * t).addScaledVector(p3, 0.5 * t3 - 0.5 * t2);
      tg.set(0, 0, 0).addScaledVector(p0, -1.5 * t2 + 2 * t - 0.5).addScaledVector(p1, 4.5 * t2 - 5 * t).addScaledVector(p2, -4.5 * t2 + 4 * t + 0.5).addScaledVector(p3, 1.5 * t2 - t).normalize();
      up.copy(Uv[i]).lerp(Uv[i + 1], t);
      // from the shoulders on, the section's frame is carried along the curve (parallel transport) instead of being the
      // world's up squared to the tangent: where the spine turns up into the neck, that squared-off up swung to point
      // forward, and the chest's deep section (and the belly under it) stood out in front of the neck as a crop
      if (i >= IDX.CHEST - 1) { if (!tUp) tUp = V().copy(up); up.copy(tUp); }
      up.addScaledVector(tg, -up.dot(tg)).normalize(); lf.crossVectors(up, tg);
      if (i >= IDX.CHEST - 1) tUp.copy(up);
      const A = TRUNK[i], Bq = TRUNK[i + 1], w = A[0] + (Bq[0] - A[0]) * t;
      // the foot of the neck: its sections tilt back with the rising curve, so their deep underside swung forward and down
      // ahead of the chest as a round prow (more so with the neck raised). Their lower edge is lifted there (the top kept);
      // the depth under the shoulders comes from the chest's keel, which hangs plumb
      const cut = 0.2 * ss(IDX.CHEST + 0.15, IDX.NECK0 - 0.1, i + t) * ss(IDX.NECK0 + 1.9, IDX.NECK0 + 0.7, i + t);
      const h = A[1] + (Bq[1] - A[1]) * t - cut / 2, yo = A[2] + (Bq[2] - A[2]) * t + cut / 2;
      const c = V().copy(pt).addScaledVector(up, yo);
      const bones = [[i, 1 - t], [i + 1, t]];
      const len = Math.max(0.16, Math.min(w, h) * 0.5);
      add('ell', frame(c, lf, up, tg), [w, h, len], bones, { k: 0.12, sigma: 0.09 });
      if (i >= 4 && i <= IDX.CHEST - 1) {      // dorsal ridge (not on the neck's foot: tilted back with it, it stood up over the shoulders) and the narrower top of the back
        const cr = V().copy(pt).addScaledVector(up, yo + h * 0.72);
        add('ell', frame(cr, lf, up, tg), [w * 0.32, h * 0.32, len], bones, { k: 0.18, sigma: 0.09 });
      }
      if (i >= IDX.PELVIS && i < IDX.CHEST) {  // deep belly under the ribs (it ends at the chest: the neck has none)
        // it swells in front of the thighs, not beside them: so the thigh stands proud of the body wall at the hip
        const bl = 0.62 + 0.38 * ss(IDX.PELVIS + 0.3, IDX.PELVIS + 1.6, i + t), cb = V().copy(pt).addScaledVector(up, yo - h * 0.42 * bl);
        add('ell', frame(cb, lf, up, tg), [w * 0.76 * bl, h * 0.6 * bl, len * 1.4], bones, { k: 0.25, sigma: 0.1 });
      }
      // the throat: a soft fullness under the neck, run densely along its curve, square to it (it was one blob per vertebra
      // hung straight down in world space: beads, and at the foot of the rising neck a crop in front of the chest)
      const at = i + t, fd = ss(IDX.NECK0 - 0.4, IDX.NECK0 + 1.2, at) * ss(IDX.HEAD + 0.2, IDX.HEAD - 1.2, at);
      if (i >= IDX.NECK0 - 1 && fd > 0) add('ell', frame(V().copy(pt).addScaledVector(up, yo - h * 0.42), lf, up, tg), [w * 0.62, h * (0.3 + 0.18 * fd), len], bones, { k: 0.18, sigma: 0.09 });
    }
  }
  // the pubic boot and the ischial bump (PUBIS): midline lobes in the pelvis' frame, hung from the hip joints (their mid point)
  {
    const PB = PUBIS, pu = Uv[IDX.PELVIS], pf = V().subVectors(J[IDX.PELVIS + 1], J[IDX.PELVIS - 1]).normalize(), pl = V().crossVectors(pu, pf).normalize();
    const hm = V().fromArray(v, PV.LEG * 3).add(V().fromArray(v, (PV.LEG + 6) * 3)).multiplyScalar(0.5);
    const pb = [[IDX.PELVIS, 1.6]], tilt = V().copy(pf).addScaledVector(pu, -pf.dot(pu)).normalize();
    const lobe = (fwd, bottom, w, h, len, k, sg) => { const q = add('ell', frame(V().copy(hm).addScaledVector(tilt, fwd).addScaledVector(pu, bottom + h), pl, pu, tilt), [w, h, len], pb, { k, sigma: sg }); q.boot = true; return q; };
    const f1 = PB.shaftFwd + PB.toe, b1 = PB.shaftFwd - PB.heel, step = 0.08, bot = -(PB.drop - PB.sag);   // the flat bottom runs from b1 to f1
    for (let f = b1 - PB.back; f <= f1 + PB.front + 1e-6; f += step) {
      const tf = ss(0, PB.front, f - f1), tb = ss(0, PB.back, b1 - f), t = Math.max(tf, tb), e = 1 - t;
      const up = tf > 0 ? tf * (PB.drop - PB.belly) : tb * 0.55;           // ahead it rises into the belly; behind it rises steeply to the tail base
      lobe(f, bot + up, PB.w * (0.5 + 0.5 * e), PB.h * (0.3 + 0.7 * e), step * 1.1, PB.k, 0.04);
    }
    // the wedge: fills the body between the shaft, the belly and the ischium, so the keel hangs from the pelvis and not in the air
    { const Wd = PB.wedge;
      for (let q = 0; q < Wd.n; q++) { const t = q / (Wd.n - 1), c = Wd.bottom + (Wd.top - Wd.bottom) * t;
        lobe(Wd.fwd, c - Wd.h, Wd.wLow + (Wd.wTop - Wd.wLow) * t, Wd.h, Wd.len[0] + (Wd.len[1] - Wd.len[0]) * t, PB.k, 0.04).ownSc = Wd.own; } }
    // the ischium: down and back from the socket, a small tip under the tail base (two lobes along its line)
    const I = PB.isch;
    for (const q of [0.8, 1]) lobe(-I.len * q * Math.cos(I.ang), -I.len * q * Math.sin(I.ang) * 0.9 + 0.02, I.w, I.h, 0.2, PB.k, 0.12);
    // the inner thighs (owner 2026-11-18, annotated: a broad V, not two deep slots): everything above a V whose point runs along the keel's
    // bottom and whose sides rise to the thighs' inner faces is solid, so the thighs run down and in to the keel
    // One half a side, weighted between the pelvis and that side's femur (like the thigh's top, SKIN3), so the skin shears as the leg swings
    for (let k = 0; k < 2; k++) { const Q = PB.vee, sd = Math.sign(V().fromArray(v, (PV.LEG + k * LEG.SIZE) * 3).sub(hm).dot(pl)) || 1;
      add('vee', frame(V().copy(hm).addScaledVector(pu, -Q.drop).addScaledVector(tilt, Q.fwd), pl, pu, tilt), [Q.slope, Q.top, Q.half, Q.len, Q.round, sd], [[IDX.PELVIS, 1 - Q.femur], [BONE.leg(k, 0), Q.femur]], { k: Q.k, sigma: 0.1 }); }
  }
  // anatomical landmarks: the hip shelf over the ilium, shoulders, throat
  {
    const pel = J[IDX.PELVIS], pu = Uv[IDX.PELVIS], pf = V().subVectors(J[IDX.PELVIS + 1], J[IDX.PELVIS - 1]).normalize(), pl = V().crossVectors(pu, pf);
    for (const sd of [1, -1]) {
      add('ell', frame(V().copy(pel).addScaledVector(pu, 0.4).addScaledVector(pl, sd * 0.3).addScaledVector(pf, 0.1), pl, pu, pf), [0.24, 0.24, 0.85], [[IDX.PELVIS, 0.7], [IDX.PELVIS + 1, 0.3]], { k: 0.25, sigma: 0.1 });
      const ch = J[IDX.CHEST], cu = Uv[IDX.CHEST], cf = V().subVectors(J[IDX.CHEST + 1], J[IDX.CHEST - 1]).normalize(), cl = V().crossVectors(cu, cf);
      add('ell', frame(V().copy(ch).addScaledVector(cu, -0.3).addScaledVector(cl, sd * 0.44).addScaledVector(cf, -0.02), cl, cu, cf), [0.25, 0.44, 0.46], [[IDX.CHEST, 1]], { k: 0.2, sigma: 0.1 });
    }
    // the forequarters: one broad, deep barrel in front of and under the shoulders (coracoids, furcula, pectoral muscle)
    // that the foot of the neck runs down into. Without it the deep base of the rising neck stood out over a narrower
    // chest front in a ledge: from the front a roll with a dark crease under it, and the chest no wider than the neck
    { const ch = J[IDX.CHEST], bf = V().subVectors(J[IDX.CHEST], J[IDX.CHEST - 3]).setY(0).normalize(), bu = V(0, 1, 0), bl = V().crossVectors(bu, bf);
      const at = (f, u) => V().copy(ch).addScaledVector(bf, f).addScaledVector(bu, u);
      CHESTF.f = bf; CHESTF.p = ch;
      add('ell', frame(at(CHESTF.f0, CHESTF.u0), bl, bu, bf), CHESTF.r, [[IDX.CHEST - 1, 0.35], [IDX.CHEST, 0.65]], { k: CHESTF.k, sigma: 0.1 });
    }
  }
  // head
  const H = B[BONE.SKULL], sk = [[BONE.SKULL, 1]], jw = [[BONE.JAW, 1]];
  const inHead = (x, y, z, X = V().set(1, 0, 0), Y = V().set(0, 1, 0), Z = V().set(0, 0, 1)) => m4().copy(H).multiply(frame(V().set(x, y, z), X, Y, Z));
  for (let z = SKULL[0][0]; z <= SNOUT_END - 0.08; z += 0.04) {
    // cross-section: a tall arch, the sides nearly upright and leaning in a little toward a domed top, every edge
    // well rounded (bone under thick skin); toward the tip it closes round in plan and drops a little at the top
    let [w, top] = interp(SKULL, z), bot = mouthY(z) - 0.06;
    const u = Math.max(0, (z - SNOUT_U) / (SNOUT_END - SNOUT_U)), cw = Math.sqrt(Math.max(0, 1 - u * u));
    w *= 0.25 + 0.75 * cw; top = bot + (top - bot) * (0.55 + 0.45 * Math.sqrt(Math.max(0, 1 - u ** 1.6)));
    const hh = (top - bot) / 2, sn = ss(0.5, 1.1, z), r = Math.min(w * (0.42 + 0.3 * sn), hh * 0.72), tp = 0.52 - 0.14 * ss(0.3, 1.0, z);
    add('tbox', inHead(0, (top + bot) / 2, z), [Math.max(w - r, 0.01), Math.max(hh - r, 0.01), 0.02, r, tp, 0], sk, { k: z > 0.7 ? 0.06 : 0.07, sigma: 0.025, tag: 'head' });
  }
  for (let z = JAW[0][0]; z <= JAW[JAW.length - 1][0] + 1e-6; z += 0.04) {
    // the mandible: deep and slab-sided, narrowing to a keel underneath
    const [w, bot] = interp(JAW, z), top = mouthY(z) + 0.06, hh = (top - bot) / 2, r = Math.min(w, hh) * 0.45;
    add('tbox', inHead(0, (top + bot) / 2, z), [Math.max(w - r, 0.01), Math.max(hh - r, 0.01), 0.02, r, 0, 0.45], jw, { k: z < 0.05 ? 0.16 : 0.07, sigma: 0.025, tag: 'jaw' });
  }
  // the nape and throat behind the jaw: one broad soft mass that carries the neck's section into the back of the skull and
  // the jaw muscles (the narrow end of the neck met the wide back of the head in a step: a ring where head met neck)
  add('ell', inHead(0, -0.22, -0.42), [0.38, 0.44, 0.36], [[IDX.HEAD - 1, 0.3], [IDX.HEAD, 0.4], [BONE.SKULL, 0.3]], { k: 0.26, sigma: 0.09 });
  // and under it the throat carried on into the back of the lower jaw (the throat's fullness fades toward the head and the
  // jaw's underside stands lower: a waist under the skull, from the front a pinch)
  add('ell', inHead(0, -0.74, -0.6), [0.34, 0.24, 0.46], [[IDX.HEAD - 2, 0.3], [IDX.HEAD - 1, 0.45], [IDX.HEAD, 0.25]], { k: 0.22, sigma: 0.09 });
  const tilt = (a) => [V(1, 0, 0), V(0, Math.cos(a), Math.sin(a)), V(0, -Math.sin(a), Math.cos(a))];
  for (const sd of [1, -1]) {
    const ex = EYE.x, ey = EYE.y, ez = EYE.z;
    add('ell', inHead(sd * (ex - 0.05), ey + 0.15, ez - 0.13, ...tilt(0.25)), [0.13, 0.1, 0.18], sk, { k: 0.035, sigma: 0.025, tag: 'head' });        // postorbital boss behind and over the eye
    add('ell', inHead(sd * (ex + 0.04), ey + 0.1, ez + 0.04, ...tilt(0.12)), [0.11, 0.062, 0.2], sk, { k: 0.02, sigma: 0.025, tag: 'head' });       // the brow ledge that shades it
    add('ell', inHead(sd * (ex + 0.04), ey - 0.095, ez - 0.02), [0.085, 0.042, 0.15], sk, { k: 0.02, sigma: 0.025, tag: 'head' });                     // the jugal rim under it
    add('ell', inHead(sd * (ex - 0.07), ey + 0.19, ez + 0.2, ...tilt(-0.25)), [0.085, 0.08, 0.13], sk, { k: 0.03, sigma: 0.025, tag: 'head' });       // lacrimal boss ahead of it, rugose
    add('ell', inHead(sd * (ex - 0.15), ey + 0.23, ez + 0.5, ...tilt(-0.12)), [0.05, 0.045, 0.32], sk, { k: 0.035, sigma: 0.025, tag: 'head' });      // the ridge running on from it along the top of the snout
    for (let z = 0.86; z <= 1.62; z += 0.19) add('ell', inHead(sd * 0.1, interp(SKULL, z)[1] - 0.012, z), [0.05, 0.035, 0.15], sk, { k: 0.03, sigma: 0.025, tag: 'head' });   // paired nasal ridges along the flat top
    if (!coarse) for (let z = 0.5; z <= 1.58; z += 0.12) add('ell', inHead(sd * (skullW(z) - 0.006), mouthY(z) + 0.035, z), [0.022, 0.026, 0.1], sk, { k: 0.02, sigma: 0.02, tag: 'head' });   // the lip: a rolled edge over the tooth row
    else for (let z = 0.5; z <= 1.58; z += 0.16) add('ell', inHead(sd * (skullW(z) + 0.004), mouthY(z) + 0.06, z), [0.035, 0.04, 0.13], sk, { k: 0.03, sigma: 0.02, tag: 'head' });   // phones: a coarser lip ledge that the 7 cm grid keeps
    add('ell', inHead(sd * 0.58, -0.1, 0.06), [0.22, 0.22, 0.36], sk, { k: 0.1, sigma: 0.03, tag: 'head' });                                          // jugal flare at the cheek, behind and below the eye
    add('ell', inHead(sd * 0.47, ey - 0.06, ez - 0.34), [0.12, 0.17, 0.24], sk, { k: 0.16, sigma: 0.03, tag: 'head' });                               // postorbital bar and squamosal: the skull is wider behind the eye than at it
    add('ell', inHead(sd * 0.52, 0.08, -0.2), [0.15, 0.2, 0.22], sk, { k: 0.1, sigma: 0.03, tag: 'head' });                                       // adductor mass bulging behind the orbit
    add('ell', inHead(sd * 0.63, -0.07, 0.2), [0.08, 0.08, 0.1], sk, { k: 0.03, sigma: 0.03, tag: 'head' });                                        // jugal horn
    add('ell', inHead(sd * 0.38, -0.62, 0.1), [0.12, 0.2, 0.36], jw, { k: 0.1, sigma: 0.03, tag: 'jaw' });                                          // jaw muscle
    add('ell', inHead(sd * 0.3, -0.52, 0.55), [0.07, 0.1, 0.3], jw, { k: 0.06, sigma: 0.03, tag: 'jaw' });                                          // dentary bulge
  }
  // the mouth. The gap between the lips must be wider than one grid cell, or surface nets weld the lips shut with a
  // web of triangles half on the skull and half on the jaw that stretches into a sheet as the jaw drops (phone grid)
  add('slit', H, [Math.max(0.03, cell * 0.8) / (TYRANNOSAURUS.dims.headScale ?? 1), 0.9], [], { op: 'cut', k: 0.025 });
  for (const sd of [1, -1]) {
    const s1 = add('ell', inHead(sd * EYE.x, EYE.y, EYE.z), [EYE.r * 1.2, EYE.r * 1.0, EYE.r * 1.3], [], { op: 'cut', k: 0.03 });   // eye socket
    s1.surf = { sd, y: EYE.y, z: EYE.z, out: -EYE.r * 0.8, eye: true };
    // EYES: the front corner of the socket opened forward (a shallow notch along the side of the snout), so the front of the
    // ball, where a pupil looking at someone ahead of it sits, is seen from ahead and below: a ridge here used to hide it
    const s5 = add('ell', inHead(sd * EYE.x, EYE.y, EYE.z), [EYE_NOTCH.rx, EYE_NOTCH.ry, EYE_NOTCH.rz], [], { op: 'cut', k: 0.03 });
    s5.surf = { sd, y: EYE.y + EYE_NOTCH.dy, z: EYE.z + EYE_NOTCH.dz, out: EYE_NOTCH.out };
    const s4 = coarse ? null : add('ell', inHead(sd * 0.5, 0.3, 0.12), [0.09, 0.08, 0.1], [], { op: 'cut', k: 0.05 });                               // temporal hollow behind the orbit
    if (s4) s4.surf = { sd, y: 0.32, z: 0.1, out: 0.09 - 0.035 };
    const s2 = add('ell', inHead(sd * 0.3, 0.12, 0.8), [0.14, 0.13, 0.3], [], { op: 'cut', k: 0.1 });                                  // antorbital hollow, shallow
    s2.surf = { sd, y: 0.12, z: 0.8, out: 0.14 - 0.016 };
    const s3 = add('ell', inHead(sd * 0.14, 0.27, 1.72), [coarse ? 0.055 : 0.045, coarse ? 0.048 : 0.04, 0.075], [], { op: 'cut', k: 0.02 });                             // nostril: a recessed opening near the tip, facing forward and out
    s3.surf = { sd, y: 0.27, z: 1.72, out: 0.012, yaw: 0.75, nos: true };
  }
  // legs
  const bodyF = V().subVectors(J[IDX.PELVIS + 1], J[IDX.PELVIS]).normalize();
  for (let k = 0; k < 2; k++) {
    const o = (PV.LEG + k * LEG.SIZE) * 3, Pt = (j) => V().fromArray(v, o + j * 3);
    const hip = Pt(0), knee = Pt(1), ank = Pt(2), mtp = Pt(3), tf = Pt(4).normalize(), tu = Pt(5).normalize();
    const T = B[BONE.leg(k, 0)], S = B[BONE.leg(k, 1)], M = B[BONE.leg(k, 2)];
    const segIn = (Mx, x, y, z) => m4().copy(Mx).multiply(new Matrix4().makeTranslation(x, y, z));
    const lt = hip.distanceTo(knee), ls = knee.distanceTo(ank), lm = ank.distanceTo(mtp);
    // the drumstick: a huge thigh that sweeps up into the flank
    // a separate mass standing out from the flank (a small blend radius leaves a crease where it meets the body),
    // widest a third of the way down, with the quadriceps bulging forward and the flexors behind. Its centre stands out from
    // the socket (`thighOut`, along the bone frame's own lateral axis, whichever side that is for this leg)
    const LS = LEGSKIN, xo = Math.sign(V().setFromMatrixColumn(T, 0).dot(V().subVectors(hip, J[IDX.PELVIS]))) || 1, to = LS.thighOut * xo;
    add('ell', segIn(T, to, lt * 0.3, -0.04), [LS.thigh[0], lt * LS.thigh[1], LS.thigh[2]], [[BONE.leg(k, 0), 1]], { k: LS.thighK, sigma: 0.1 });
    // and it tapers into the knee, so the drumstick is an egg on its narrow end rather than a ball on a stick
    add('cone', segIn(T, to * 0.75, lt * 0.42, -0.03), [lt * 0.5, LS.taper[0], LS.taper[1]], [[BONE.leg(k, 0), 1]], { k: 0.09, sigma: 0.09 });
    // its front and back edges: two long muscle masses, each a cone from high on the thigh to just above the knee, converging
    const edge = (z0, z1, r) => { const a = V(to * 0.9, lt * 0.08, z0), b = V(to * 0.62, lt * 0.86, z1), ax = V().subVectors(b, a), L = ax.length(); ax.normalize();
      const zz = V().crossVectors(V(1, 0, 0), ax).normalize(); return [m4().copy(T).multiply(frame(a, V().crossVectors(ax, zz), ax, zz)), [L, r[0], r[1]]]; };
    { const [mf, af] = edge(0.34, 0.12, LS.front); add('cone', mf, af, [[BONE.leg(k, 0), 1]], { k: 0.1, sigma: 0.09 }); }
    { const [mb, ab] = edge(-0.48, -0.15, LS.back); add('cone', mb, ab, [[BONE.leg(k, 0), 1]], { k: 0.1, sigma: 0.09 }); }
    add('ell', segIn(T, to * 0.6, lt * 0.94, 0.0), [LS.knee[0], lt * LS.knee[1], LS.knee[2]], [[BONE.leg(k, 0), 0.6], [BONE.leg(k, 1), 0.4]], { k: 0.1, sigma: 0.08 });
    // caudofemoralis: the tail muscle that pulls the thigh back
    const cf = V().copy(J[IDX.TAIL_BASE - 2]).addScaledVector(Uv[IDX.TAIL_BASE - 2], -0.35);
    const thighBack = V().copy(hip).lerp(knee, 0.45).addScaledVector(bodyF, -0.25).addScaledVector(V().setFromMatrixColumn(T, 0), to * 0.7);
    const ax = V().subVectors(thighBack, cf), axl = ax.length(); ax.normalize();
    const cz = V().crossVectors(ax, V(0, 1, 0)).normalize(), cy = V().crossVectors(cz, ax);
    add('cone', frame(cf, cz, ax, cy), [axl, THIGHTOP.cfR[0], THIGHTOP.cfR[1]], [[IDX.TAIL_BASE - 2, 0.5], [BONE.leg(k, 0), 0.5]], { k: 0.13, sigma: 0.12 });
    // SKIN3: the thigh's muscles run on up to the hip crest (the ilium stands most of the body's height at the hips): a broad
    // flat mass from the hip joint up to just under the top line, fanned fore and aft along the ilium and set a little back, so
    // the top and back of the thigh blend into the hip and the tail root while its front edge stays a line against the belly.
    // Weighted half to the pelvis, half to the femur, so as the leg swings it shears between them rather than tearing off
    { const pu = Uv[IDX.PELVIS], pl = V().crossVectors(pu, bodyF).normalize(), sd = Math.sign(V().subVectors(hip, J[IDX.PELVIS]).dot(pl)) || 1, TT = THIGHTOP;
      const c = V().copy(hip).addScaledVector(pu, TT.up).addScaledVector(pl, sd * TT.out).addScaledVector(bodyF, TT.back);
      const lz = V().copy(bodyF).addScaledVector(pu, -pu.dot(bodyF)).normalize(), lx = V().crossVectors(pu, lz);
      add('ell', frame(c, lx, pu, lz), TT.r, [[IDX.PELVIS, 0.5], [BONE.leg(k, 0), 0.5]], { k: TT.k, sigma: 0.12 }); }
    // shin with its calf
    add('cone', S, [ls, LS.shank[0], LS.shank[1]], [[BONE.leg(k, 1), 1]], { k: 0.12, sigma: 0.07 });
    add('ell', segIn(S, 0, ls * 0.28, -0.2), [LS.calf[0], ls * LS.calf[1], LS.calf[2]], [[BONE.leg(k, 1), 1]], { k: 0.08, sigma: 0.07 });     // the calf: a drumstick of its own below the knee
    add('ell', segIn(S, 0, ls * 0.12, 0.14), [LS.crest[0], ls * LS.crest[1], LS.crest[2]], [[BONE.leg(k, 1), 1]], { k: 0.1, sigma: 0.07 });     // cnemial crest
    { const a = V(0, ls * 0.45, -0.2), b = V(0, ls * 0.93, -0.11), ax = V().subVectors(b, a), L = ax.length(); ax.normalize(); const zz = V().crossVectors(V(1, 0, 0), ax).normalize();
      add('cone', m4().copy(S).multiply(frame(a, V().crossVectors(ax, zz), ax, zz)), [L, LS.tendon[0], LS.tendon[1]], [[BONE.leg(k, 1), 1]], { k: 0.08, sigma: 0.07 }); }     // the calf's tendon down to the heel
    // ---- ankle, metatarsus and foot (see FOOTSKIN). Frames: the metatarsus' M has y down the bone (ankle to MTP), z forward,
    // x to one side (xm: +1 if x points out of the body); a digit's frame has x to the side it fans toward, y up, z along it.
    // The digits' bone axes run FS.pad (the sim's foot.pad) above the ground under a flat, loaded toe, so the flesh reaches FS.pad below them.
    const FS = FOOTSKIN, cs = coarse ? FS.coarse : 1, bM = [[BONE.leg(k, 2), 1]];
    const xm = Math.sign(V().setFromMatrixColumn(M, 0).dot(V().subVectors(hip, J[IDX.PELVIS]))) || 1;
    const lerp = (a, b, t) => a + (b - a) * t;
    // the ankle: a hinge you can see. The tibia's end flares into two condyles, a bony heel (the backward knee) stands out
    // behind it with the tendons running down from it, and the metatarsus starts narrower below it
    add('ell', segIn(M, 0, 0.02, 0.0), [FS.ankle[0], FS.ankle[1], FS.ankle[2]], [[BONE.leg(k, 1), 0.5], [BONE.leg(k, 2), 0.5]], { k: 0.06, sigma: 0.05 });
    for (const sx of [1, -1]) add('ell', segIn(M, sx * FS.ankle[0] * 0.78, -0.02, 0.02), [0.075, 0.1, 0.11], [[BONE.leg(k, 1), 0.6], [BONE.leg(k, 2), 0.4]], { k: 0.04, sigma: 0.05 });   // condyles
    add('ell', segIn(M, 0, 0.05, -FS.ankle[2] * 0.85), [0.1, 0.13, 0.085], [[BONE.leg(k, 1), 0.35], [BONE.leg(k, 2), 0.65]], { k: 0.04, sigma: 0.05 });   // the heel
    // the shaft: narrow and deep at the top, broadening and flattening toward the MTP (three bones bound together), as
    // a run of sections blended tightly enough to keep a waist below the ankle
    for (let i = 0; i <= 4; i++) { const t = 0.12 + i * 0.19, w = lerp(FS.meta[0], FS.meta[1], t), d = lerp(FS.meta[2], FS.meta[3], t);
      add('ell', segIn(M, 0, lm * t, 0.01), [w * cs, lm * 0.2, d * cs], bM, { k: 0.09, sigma: 0.05 }); }      // (longer and softer than before: at k 0.05 the five read as rings down the back of the foot)
    // the flexor tendons down the back from the heel, and the extensor along the front: lines, not a tube
    add('cone', m4().copy(M).multiply(frame(V(0, 0.12, -FS.meta[2] * 0.95), V(1, 0, 0), V(0, 1, 0.06).normalize(), V(0, -0.06, 1).normalize())), [lm * 0.78, 0.055 * cs, 0.04 * cs], bM, { k: 0.035, sigma: 0.05 });
    if (!coarse) add('cone', m4().copy(M).multiply(frame(V(0, 0.15, FS.meta[2] * 0.8), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1))), [lm * 0.72, 0.035, 0.03], bM, { k: 0.04, sigma: 0.05 });
    // the distal end: the three metatarsal heads side by side, each running into its own digit
    for (let d = 0; d < 3; d++) {
      const D = B[BONE.leg(k, 3 + d)], sgnD = (d - 1) * -(k === 0 ? 1 : -1), xo = sgnD * FS.base;
      const head = V(0, 0, 0).applyMatrix4(m4().copy(D).multiply(new Matrix4().makeTranslation(xo, 0.03, -0.05)));
      const hm = new Matrix4().copy(M); hm.setPosition(head);
      add('ell', hm, [FS.width[d] * 1.05 * cs, 0.1, 0.11 * cs], [[BONE.leg(k, 2), 0.6], [BONE.leg(k, 3 + d), 0.4]], { k: 0.05, sigma: 0.045 });
    }
    // the hallux (digit I): small, high on the inside of the metatarsus, pointing back and down, off the ground
    { const hy = lm - FS.hallux.up, hx = -xm * (FS.meta[1] * 0.7);
      const dir = V(-xm * 0.4, 0.75, -0.7).normalize(), up0 = V(0, -1, 0).addScaledVector(dir, dir.y).normalize(), side = V().crossVectors(up0, dir).normalize();
      const f0 = m4().copy(M).multiply(frame(V(hx, hy, -FS.meta[3] * 0.6), side, dir, V().crossVectors(side, dir)));
      add('cone', f0, [FS.hallux.len, 0.06 * cs, 0.04 * cs], bM, { k: 0.04, sigma: 0.04 });
      const tip = m4().copy(f0).multiply(frame(V(0, FS.hallux.len - 0.01, 0), V(1, 0, 0), V(0, 0.75, -0.66).normalize(), V(0, 0.66, 0.75).normalize()));
      add('cone', tip, [0.1, 0.032 * Math.max(cs, 1.3), 0.008], bM, { k: 0.015, sigma: 0.03, tag: 'claw' }); }
    // the digits (II, III, IV): separate toes, each a run of phalanges with a knuckle over every joint and a fat pad under
    // it, a heavy curved claw, and a web of skin between the bases that stretches when they spread
    const sgL = k === 0 ? 1 : -1;
    for (let d = 0; d < 3; d++) {
      const D = B[BONE.leg(k, 3 + d)], E = B[BONE.leg(k, 6 + d)], len = TOE_LEN[d], lp = len * TOE_SPLIT, ld = len - lp;
      const b1 = [[BONE.leg(k, 3 + d), 1]], b2 = [[BONE.leg(k, 6 + d), 1]], b12 = [[BONE.leg(k, 3 + d), 0.5], [BONE.leg(k, 6 + d), 0.5]];
      const xo = (d - 1) * -sgL * FS.base, w = FS.width[d] * cs, pad = FS.pad, top = FS.top * cs;
      const inD = (x, y, z) => m4().copy(D).multiply(new Matrix4().makeTranslation(x, y, z));
      const inE = (x, y, z) => m4().copy(E).multiply(new Matrix4().makeTranslation(x, y, z));
      // the base offset rides the proximal phalanx only; the distal frame starts at the bone's own joint, so the run is
      // carried over as a lateral shift that dies out along the phalanx (keeps the joint line straight in the bind pose)
      const xAt = (z) => xo * Math.max(0, 1 - z / (lp + ld * 0.3));
      // joints along the digit (from the MTP): the sim's one (z = lp) and, inside the distal bone, the rest of the phalanges
      const nd = FS.phal[d], cl = FS.claw * (d === 1 ? 1 : 0.9), dJ = []; for (let j = 1; j <= nd; j++) dJ.push((ld - cl) * j / (nd + 0.6));
      // proximal phalanx: body, then the pad under the MTP end of the digit
      add('ell', inD(xAt(lp * 0.5), 0.004, lp * 0.5), [w, top, lp * 0.54], b1, { k: 0.035, sigma: 0.04 });
      add('ell', inD(xAt(0.02), -pad + FS.padH, 0.02), [w * 1.08, FS.padH, 0.11], [[BONE.leg(k, 2), 0.25], [BONE.leg(k, 3 + d), 0.75]], { k: 0.04, sigma: 0.04 });
      // the joint between the two bones: knuckle over it, pad under it
      add('ell', inE(xAt(lp), FS.knuckle[0], 0), [w * 0.8, FS.knuckle[1] * cs, 0.06], b12, { k: 0.025, sigma: 0.035 });
      add('ell', inE(xAt(lp), -pad + FS.padH, -0.01), [w * 1.02, FS.padH, 0.085], b12, { k: 0.035, sigma: 0.035 });
      // the distal phalanges, each slimmer, with their own knuckles and pads (rigid on the distal bone)
      let z0 = 0;
      for (let j = 0; j <= nd; j++) {
        const z1 = j < nd ? dJ[j] : ld - cl * 1.12, ww = w * (0.94 - 0.1 * (j / Math.max(1, nd))), hh = top * (0.92 - 0.12 * j / Math.max(1, nd));
        add('ell', inE(xAt(lp + (z0 + z1) / 2), 0.004, (z0 + z1) / 2), [ww, hh, (z1 - z0) * 0.54 + 0.012], b2, { k: 0.025, sigma: 0.035 });
        if (j < nd) {
          add('ell', inE(xAt(lp + z1), FS.knuckle[0] * (hh / top), z1), [ww * 0.8, FS.knuckle[1] * cs * (hh / top), 0.05], b2, { k: 0.02, sigma: 0.035 });
          if (!coarse || j === 0) add('ell', inE(xAt(lp + z1), -pad + FS.padH * 0.9, z1 - 0.01), [ww, FS.padH * 0.9, 0.07], b2, { k: 0.03, sigma: 0.035 });
        }
        z0 = z1;
      }
      // the claw: a heavy, laterally flattened, down-curved sheath in three pieces, its tip at the digit's end on the ground
      // (heavy and arched: a 4 cm grid loses anything under a cell, and a thin tip left a blunt dark cap; the top rises over the
      // base and the horn curves down to a tip that just reaches the ground past the toe's end)
      // (SKIN3: with the hooked point a mesh of its own, the field's sheath stops short inside it: base and the first half only)
      { const zc = ld - cl, xo2 = FS.clawOut, Pz = [[zc - 0.02, 0.026, 0.06], [zc + cl * 0.5, 0.036, 0.056], [zc + cl * 0.95 + xo2 * 0.4, 0.004, 0.042], [ld + xo2, -pad + 0.018, 0.02]];
        if (CLAWTIP.on) { Pz[2] = [zc + cl * 0.72, 0.034, 0.042]; Pz.length = 3; }
        for (let i = 0; i < Pz.length - 1; i++) { const [za, ya, ra] = Pz[i], [zb, yb, rb] = Pz[i + 1], ax = V(0, yb - ya, zb - za), L = ax.length(); ax.normalize();
          const zz = V().crossVectors(V(1, 0, 0), ax).normalize();
          add('cone', m4().copy(E).multiply(frame(V(xAt(lp + za), ya, za), V(coarse ? 1 : FS.clawFlat, 0, 0), ax, zz)), [L, ra * Math.max(cs, coarse ? 1.3 : 1), rb * Math.max(cs, coarse ? 1.3 : 1)], b2, { k: 0.012, sigma: 0.03, tag: 'claw' }); } }
      // SKIN3: the claw's hooked point as a mesh of its own (CLAWTIP), finer than any grid: from inside the sheath's middle a
      // flattened cone curves forward and over to a sharp point hooked down to the ground past the toe's end
      { const zc = ld - cl, C = CLAWTIP, z1 = zc + cl * C.from, zT = ld + FS.clawOut;
        (P.clawTips = P.clawTips || []).push({ E: m4().copy(E), bone: BONE.leg(k, 6 + d), x: xAt(lp + z1), pts: [[z1, C.y0], [z1 + C.c1[0], C.c1[1]], [zT + C.c2[0], C.c2[1]], [zT + C.tip[0], -pad + C.tip[1]]], r0: C.r0 * (d === 1 ? 1 : 0.92), flat: FS.clawFlat }); }
    }
    // the web: a thin sheet of skin between neighbouring toe bases, lower than the toes' tops, riding both
    for (const [a, c] of [[0, 1], [1, 2]]) {
      const Da = B[BONE.leg(k, 3 + a)], Dc = B[BONE.leg(k, 3 + c)], xa = (a - 1) * -sgL * FS.base, xc = (c - 1) * -sgL * FS.base;
      const pa = V(xa * 0.7, -0.012, FS.web).applyMatrix4(Da), pc = V(xc * 0.7, -0.012, FS.web).applyMatrix4(Dc), mid = V().addVectors(pa, pc).multiplyScalar(0.5);
      const ac = V().subVectors(pc, pa), half = ac.length() / 2; ac.normalize();
      const upv = V().setFromMatrixColumn(Da, 1).add(V().setFromMatrixColumn(Dc, 1)).normalize(), fw = V().crossVectors(ac, upv).normalize(), up2 = V().crossVectors(fw, ac);
      add('ell', frame(mid, ac, up2, fw), [half + 0.02, FS.webT * cs, FS.web * 0.9], [[BONE.leg(k, 3 + a), 0.5], [BONE.leg(k, 3 + c), 0.5]], { k: 0.035, sigma: 0.04 });
    }
    void mtp; void tf; void tu; void ank;
  }
  // arms: small but muscular, two clawed fingers
  for (let k = 0; k < 2; k++) {
    const A0 = B[BONE.arm(k, 0)], A1 = B[BONE.arm(k, 1)], o = (PV.ARM + k * 3) * 3;
    const sh = V().fromArray(v, o), el = V().fromArray(v, o + 3), wr = V().fromArray(v, o + 6);
    add('cone', A0, [sh.distanceTo(el), 0.13, 0.09], [[BONE.arm(k, 0), 1]], { k: 0.12, sigma: 0.05 });
    add('cone', A1, [el.distanceTo(wr), 0.085, 0.065], [[BONE.arm(k, 1), 1]], { k: 0.05, sigma: 0.04 });
    for (const sp of [-0.4, 0.25]) {
      const f = m4().copy(A1).multiply(frame(V(0, el.distanceTo(wr), 0), V(Math.cos(sp), 0, Math.sin(sp)), V(0, 1, 0), V(-Math.sin(sp), 0, Math.cos(sp))));
      add('cone', f, [0.17, 0.04, 0.012], [[BONE.arm(k, 1), 1]], { k: 0.02, sigma: 0.03, tag: 'claw' });
    }
  }
  return P;
}

// ------------------------------------------------------------------ the neck's bind shape
// The skin is built (and skinned) in a neck pose at the middle of the neck's range: a moderate S, square to the shoulders,
// head level and untwisted. The simulation's first pose is whatever it settled into (seed 1: folded straight up off the
// chest, yawed and the head turned 60 degrees aside), and building the skin there baked that fold into it: the throat lay
// across the base of the neck, and every ordinary pose was a large deformation away from the bind (beads, a ring under the
// head, a crop at the chest). Same forward kinematics as RexSim._neckFK, yaw and twist zero.
export const NECK_BIND = NECK7 ? [-0.14, 0.2, 0.27] : [-0.1, 0.1, 0];     // = the solver's settled shape looking straight ahead at a man (test/necklat.mjs), in the sagittal plane     // root pitch off the shoulders, mean bend per joint, gradient (positive: nose down)
export function neutralNeckPose(pose) {
  const v = Float32Array.from(pose.v), out = { v, s: pose.s }, N = DIM.neckN, L = DIM.neckLen / N, J = (i) => V().fromArray(v, i * 3);
  const c = J(IDX.CHEST), cu = V().fromArray(v, (PV.SU + IDX.CHEST) * 3).normalize(), cf = V().subVectors(c, J(IDX.CHEST - 1));
  cf.addScaledVector(cu, -cf.dot(cu)).normalize();
  const d = V().copy(cf), l = V().crossVectors(cu, d).normalize(), u = V().crossVectors(d, l).normalize();
  const pitch = (a) => { const c1 = Math.cos(a), s1 = Math.sin(a), nd = V().copy(d).multiplyScalar(c1).addScaledVector(u, -s1); u.multiplyScalar(c1).addScaledVector(d, s1); d.copy(nd); };
  const p = V().copy(c), rp = NECK_BIND[0] - NECK_RISE;
  for (let k = 0; k < N; k++) {
    pitch((NECK_ROOT[k] || 0) * rp + (k > 0 ? NECK_BIND[1] + NECK_BIND[2] * (k - N / 2) / (N / 2 - 1) : 0));
    p.addScaledVector(d, L); p.toArray(v, (IDX.NECK0 + k) * 3);
  }
  // the skull: its forward line tipped nose-down from the last vertebra as the solver enters it (f*0.97 + u*0.24 = d)
  const a = Math.atan2(0.24, 0.97), hf = V().copy(d).multiplyScalar(Math.cos(a)).addScaledVector(u, -Math.sin(a)), hu = V().copy(u).multiplyScalar(Math.cos(a)).addScaledVector(d, Math.sin(a));
  for (let k = 1; k <= N; k++) V().copy(cu).lerp(hu, k / N).normalize().toArray(v, (PV.SU + IDX.NECK0 + k - 1) * 3);
  p.toArray(v, PV.HEAD_P * 3); hf.toArray(v, PV.HEAD_F * 3); hu.toArray(v, PV.HEAD_U * 3);
  return out;
}

// ------------------------------------------------------------------ meshing
export function buildRexGeometry(simPose, { cell = 0.04 } = {}) {
  const t0 = Date.now(), bindPose = neutralNeckPose(simPose);
  const B = Array.from({ length: BONE_COUNT }, () => new Matrix4());
  boneMatrices(bindPose, B, 0, 'bind');
  // the shapes are placed in the old body-forward leg frames (as designed and accepted); the skin is bound to the knee-plane frames
  const BD = Array.from({ length: BONE_COUNT }, () => new Matrix4()); boneMatrices(bindPose, BD, 0, 'design');
  const prims = buildPrims(bindPose, BD, cell > 0.06, cell);
  // bounds
  const lo = V().set(Infinity, Infinity, Infinity), hi = V().set(-Infinity, -Infinity, -Infinity);
  for (const p of prims) {
    const a = p.args, r = p.kind === 'cone' ? a[0] + Math.max(a[1], a[2]) : p.kind === 'box' || p.kind === 'tbox' ? Math.hypot(a[0], a[1], a[2]) + a[3] : p.kind === 'slit' ? 0 : p.kind === 'vee' ? Math.hypot(a[1], a[2], a[3]) : Math.max(a[0], a[1], a[2]);
    p.rad = r + p.k + cell * 2;
    if (p.kind === 'cone') p.c.copy(V(0, a[0] / 2, 0).applyMatrix4(p.m)), p.rad = a[0] / 2 + Math.max(a[1], a[2]) + p.k + cell * 2;
    if (p.op === 'add') { lo.min(V().copy(p.c).subScalar(p.rad)); hi.max(V().copy(p.c).addScalar(p.rad)); }
  }
  lo.subScalar(cell * 2); hi.addScalar(cell * 2);
  const nx = Math.ceil((hi.x - lo.x) / cell) + 1, ny = Math.ceil((hi.y - lo.y) / cell) + 1, nz = Math.ceil((hi.z - lo.z) / cell) + 1;
  const N = nx * ny * nz, F = new Float32Array(N).fill(0.5);
  const idx = (i, j, k) => i + nx * (j + ny * k);
  const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  const smax = (a, b, k) => -smin(-a, -b, k);
  const span = (p) => [Math.max(0, Math.floor((p.c.x - p.rad - lo.x) / cell)), Math.min(nx - 1, Math.ceil((p.c.x + p.rad - lo.x) / cell)),
    Math.max(0, Math.floor((p.c.y - p.rad - lo.y) / cell)), Math.min(ny - 1, Math.ceil((p.c.y + p.rad - lo.y) / cell)),
    Math.max(0, Math.floor((p.c.z - p.rad - lo.z) / cell)), Math.min(nz - 1, Math.ceil((p.c.z + p.rad - lo.z) / cell))];
  for (const p of prims) {
    if (p.op === 'cut' || p.boot) continue;
    const [i0, i1, j0, j1, k0, k1] = span(p);
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = p.sd(lo.x + i * cell, lo.y + j * cell, lo.z + k * cell), n = idx(i, j, k);
      F[n] = smin(F[n], Math.max(d, -0.5), p.k);
    }
  }
  // the pubic boot and its wedge are added last, as one shape of their own: its lobes blend smoothly with each other (each one
  // laid straight onto the body with a hard join, the wedge's flanks were a stack of beads with dark pits between them and the
  // thighs), then the whole keel joins the body softly only on the midline (PUBIS.cleft): beside it the thighs' inner faces stay
  // their own smooth slabs
  { const boot = prims.filter((q) => q.boot && q.op !== 'cut');
    if (boot.length) {
      let I0 = nx, I1 = 0, J0 = ny, J1 = 0, K0 = nz, K1 = 0;
      for (const p of boot) { const [i0, i1, j0, j1, k0, k1] = span(p); I0 = Math.min(I0, i0); I1 = Math.max(I1, i1); J0 = Math.min(J0, j0); J1 = Math.max(J1, j1); K0 = Math.min(K0, k0); K1 = Math.max(K1, k1); }
      const bx = I1 - I0 + 1, by = J1 - J0 + 1, bz = K1 - K0 + 1, FB = new Float32Array(bx * by * bz).fill(0.5), bi = (i, j, k) => (i - I0) + bx * ((j - J0) + by * (k - K0));
      for (const p of boot) {
        const [i0, i1, j0, j1, k0, k1] = span(p);
        for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const n = bi(i, j, k); FB[n] = smin(FB[n], Math.max(p.sd(lo.x + i * cell, lo.y + j * cell, lo.z + k * cell), -0.5), p.k); }
      }
      for (let k = K0; k <= K1; k++) for (let j = J0; j <= J1; j++) for (let i = I0; i <= I1; i++) {
        const n = idx(i, j, k); F[n] = smin(F[n], FB[bi(i, j, k)], Math.max(PUBIS.seam, PUBIS.k * (1 - ss(PUBIS.cleft[0], PUBIS.cleft[1], Math.abs(lo.x + i * cell)))));
      }
    }
  }
  // field lookups in head space (bind pose: the jaw is shut, so skull and jaw share the frame)
  const sampleF = (x, y, z) => {
    const fx = (x - lo.x) / cell, fy = (y - lo.y) / cell, fz = (z - lo.z) / cell;
    const i = Math.min(nx - 2, Math.max(0, Math.floor(fx))), j = Math.min(ny - 2, Math.max(0, Math.floor(fy))), k = Math.min(nz - 2, Math.max(0, Math.floor(fz)));
    const u = fx - i, w = fy - j, t = fz - k;
    const c00 = F[idx(i, j, k)] * (1 - u) + F[idx(i + 1, j, k)] * u, c10 = F[idx(i, j + 1, k)] * (1 - u) + F[idx(i + 1, j + 1, k)] * u;
    const c01 = F[idx(i, j, k + 1)] * (1 - u) + F[idx(i + 1, j, k + 1)] * u, c11 = F[idx(i, j + 1, k + 1)] * (1 - u) + F[idx(i + 1, j + 1, k + 1)] * u;
    return (c00 * (1 - w) + c10 * w) * (1 - t) + (c01 * (1 - w) + c11 * w) * t;
  };
  const Hb = B[BONE.SKULL], wq = V(), fH = (x, y, z) => { wq.set(x, y, z).applyMatrix4(Hb); return sampleF(wq.x, wq.y, wq.z); };
  const rayOut = (ox, oy, oz, dx, dz) => {     // distance from an inside point to the skin, along a horizontal head-space direction
    let prev = fH(ox, oy, oz);
    for (let s = 0.008; s < 1.4; s += 0.008) { const f = fH(ox + dx * s, oy, oz + dz * s); if (f > 0 && prev <= 0) return s - 0.008 * f / (f - prev); prev = f; }
    return null;
  };
  // cuts placed against the surface: eye sockets, the antorbital hollow, nostrils
  let eye = null, nostril = { x: 0.15, y: 0.27, z: 1.72 };
  for (const p of prims) if (p.surf) {
    const S = p.surf, xs = rayOut(0, S.y, S.z, 1, 0) ?? EYE.x, x = S.sd * (xs + S.out);
    p.m = new Matrix4().copy(Hb).multiply(new Matrix4().makeTranslation(x, S.y, S.z)); if (S.yaw) p.m.multiply(new Matrix4().makeRotationY(S.sd * S.yaw)); p.inv = new Matrix4().copy(p.m).invert(); p.c.setFromMatrixPosition(p.m);
    if (S.eye && S.sd > 0) eye = { x, y: S.y, z: S.z, r: EYE.r, surf: xs };
    if (S.nos && S.sd > 0) nostril = { x: xs, y: S.y, z: S.z };
  }
  for (const p of prims) {          // cuts (mouth, sockets, nostrils), in head space
    if (p.op !== 'cut') continue;
    const R = p.kind === 'slit' ? 2.2 : 0.3, c = p.kind === 'slit' ? V(0, -0.2, 0.75).applyMatrix4(p.m) : p.c;
    const i0 = Math.max(0, Math.floor((c.x - R - lo.x) / cell)), i1 = Math.min(nx - 1, Math.ceil((c.x + R - lo.x) / cell));
    const j0 = Math.max(0, Math.floor((c.y - R - lo.y) / cell)), j1 = Math.min(ny - 1, Math.ceil((c.y + R - lo.y) / cell));
    const k0 = Math.max(0, Math.floor((c.z - R - lo.z) / cell)), k1 = Math.min(nz - 1, Math.ceil((c.z + R - lo.z) / cell));
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const n = idx(i, j, k); F[n] = smax(F[n], -p.sd(lo.x + i * cell, lo.y + j * cell, lo.z + k * cell), p.k);
    }
  }
  const teeth = { upper: [], lower: [], ridge: { upper: [], lower: [] } };
  if (typeof process !== 'undefined' && process.env && process.env.GEO_PROBE) for (const hpS of process.env.GEO_PROBE.split(';')) {
    const w = V(...hpS.split(',').map(Number)).applyMatrix4(B[BONE.SKULL]); const L = [];
    for (const p of prims) if (p.op === 'add') { const d = p.sd(w.x, w.y, w.z); if (d < 0.15) L.push([d.toFixed(3), p.kind, p.tag, p.args.map((a) => +a.toFixed(2)).join('/'), JSON.stringify(p.bones.map((b) => [b[0], +b[1].toFixed(2)]))]); }
    L.sort((a, b) => a[0] - b[0]); console.log('probe', hpS, L.slice(0, 8)); }
  const tSdf = Date.now() - t0;
  if (typeof process !== "undefined" && process.env && process.env.GEO_DEBUG) { let nn = 0; for (const f of F) if (!(f === f)) nn++; console.log("field NaN", nn); for (const p of prims) { const d = p.sd(p.c.x + 0.05, p.c.y + 0.03, p.c.z); if (!(d === d)) console.log("NaN prim", p.kind, p.tag, p.args, p.bones); } }

  // surface nets
  const cellV = new Int32Array(N).fill(-1), pos = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const co = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const g = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { g[c] = F[idx(i + co[c][0], j + co[c][1], k + co[c][2])]; if (g[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (const [a, b] of E) {
      if ((g[a] < 0) === (g[b] < 0)) continue;
      const t = g[a] / (g[a] - g[b]);
      sx += co[a][0] + (co[b][0] - co[a][0]) * t; sy += co[a][1] + (co[b][1] - co[a][1]) * t; sz += co[a][2] + (co[b][2] - co[a][2]) * t; cnt++;
    }
    cellV[idx(i, j, k)] = pos.length / 3;
    pos.push(lo.x + (i + sx / cnt) * cell, lo.y + (j + sy / cnt) * cell, lo.z + (k + sz / cnt) * cell);
  }
  const tri = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) tri.push(a, d, c, a, c, b); else tri.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const s0 = F[idx(i, j, k)] < 0;
    if (s0 !== (F[idx(i + 1, j, k)] < 0)) quad(cellV[idx(i, j - 1, k - 1)], cellV[idx(i, j, k - 1)], cellV[idx(i, j, k)], cellV[idx(i, j - 1, k)], !s0);
    if (s0 !== (F[idx(i, j + 1, k)] < 0)) quad(cellV[idx(i - 1, j, k - 1)], cellV[idx(i - 1, j, k)], cellV[idx(i, j, k)], cellV[idx(i, j, k - 1)], !s0);
    if (s0 !== (F[idx(i, j, k + 1)] < 0)) quad(cellV[idx(i - 1, j - 1, k)], cellV[idx(i, j - 1, k)], cellV[idx(i, j, k)], cellV[idx(i - 1, j, k)], !s0);
  }
  let nv = pos.length / 3;
  // field sampling (trilinear) for normals and cavity
  const sample = (x, y, z) => {
    const fx = (x - lo.x) / cell, fy = (y - lo.y) / cell, fz = (z - lo.z) / cell;
    const i = Math.min(nx - 2, Math.max(0, Math.floor(fx))), j = Math.min(ny - 2, Math.max(0, Math.floor(fy))), k = Math.min(nz - 2, Math.max(0, Math.floor(fz)));
    const u = fx - i, w = fy - j, t = fz - k;
    const c00 = F[idx(i, j, k)] * (1 - u) + F[idx(i + 1, j, k)] * u, c10 = F[idx(i, j + 1, k)] * (1 - u) + F[idx(i + 1, j + 1, k)] * u;
    const c01 = F[idx(i, j, k + 1)] * (1 - u) + F[idx(i + 1, j, k + 1)] * u, c11 = F[idx(i, j + 1, k + 1)] * (1 - u) + F[idx(i + 1, j + 1, k + 1)] * u;
    return (c00 * (1 - w) + c10 * w) * (1 - t) + (c01 * (1 - w) + c11 * w) * t;
  };
  // one pass of smoothing to take the voxel stair out of the surface, then project back onto it
  let P = new Float32Array(pos), nrm = new Float32Array(nv * 3); const e = cell * 0.5;
  {
    const acc = new Float32Array(nv * 3), cnt = new Uint16Array(nv);
    for (let t = 0; t < tri.length; t += 3) for (let a = 0; a < 3; a++) {
      const i0 = tri[t + a], i1 = tri[t + (a + 1) % 3];
      for (let c = 0; c < 3; c++) { acc[i0 * 3 + c] += P[i1 * 3 + c]; acc[i1 * 3 + c] += P[i0 * 3 + c]; }
      cnt[i0]++; cnt[i1]++;
    }
    for (let i = 0; i < nv; i++) if (cnt[i]) for (let c = 0; c < 3; c++) P[i * 3 + c] = P[i * 3 + c] * 0.5 + 0.5 * acc[i * 3 + c] / cnt[i];
  }
  for (let i = 0; i < nv; i++) {
    let x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    for (let it = 0; it < 2; it++) {
      const gx = sample(x + e, y, z) - sample(x - e, y, z), gy = sample(x, y + e, z) - sample(x, y - e, z), gz = sample(x, y, z + e) - sample(x, y, z - e);
      const gl = Math.hypot(gx, gy, gz) / (2 * e) || 1, d = sample(x, y, z);
      x -= (gx / (2 * e)) / gl * d / gl; y -= (gy / (2 * e)) / gl * d / gl; z -= (gz / (2 * e)) / gl * d / gl;
    }
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
    const gx = sample(x + e, y, z) - sample(x - e, y, z), gy = sample(x, y + e, z) - sample(x, y - e, z), gz = sample(x, y, z + e) - sample(x, y, z - e), gl = Math.hypot(gx, gy, gz) || 1;
    nrm[i * 3] = gx / gl; nrm[i * 3 + 1] = gy / gl; nrm[i * 3 + 2] = gz / gl;
  }

  // skin weights, material tags, cavity
  let skinIndex = new Uint16Array(nv * 4), skinWeight = new Float32Array(nv * 4), tags = new Uint8Array(nv), cavity = new Float32Array(nv);
  const TAG = { skin: 0, head: 1, jaw: 2, claw: 3 }, wb = new Float32Array(BONE_COUNT);
  const Hinv0 = new Matrix4().copy(B[BONE.SKULL]).invert();
  // the neck curve in the bind pose, densely sampled (its stations are the neck's bones, BONE.neck): a vertex's place along
  // it is its curve parameter s; behind the curve's start the chain runs on along the back (joints 15, 16)
  const NK0 = IDX.NECK0, CJ = [], CS = [];
  for (const b of [15, 16]) { CJ.push(V().fromArray(bindPose.v, b * 3)); CS.push(b); }
  { const NF = neckFrames(bindPose); for (let k = 0; k < NECKC.N; k++) { CJ.push(V().setFromMatrixPosition(NF[k])); CS.push(NECKC.S0 + k * NECKC.H); } }
  const cs = new Float32Array(CJ.length), cd = new Float32Array(CJ.length), hk = new Float32Array(NECKC.N);
  const chainParam = (x, y, z) => {
    let best = Infinity;
    for (let c = 0; c < CJ.length - 1; c++) {
      const a = CJ[c], b = CJ[c + 1], ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z, l2 = ex * ex + ey * ey + ez * ez;
      const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey + (z - a.z) * ez) / l2));
      cd[c] = Math.sqrt((a.x + ex * t - x) ** 2 + (a.y + ey * t - y) ** 2 + (a.z + ez * t - z) ** 2); cs[c] = CS[c] + (CS[c + 1] - CS[c]) * t; best = Math.min(best, cd[c]);
    }
    let sw = 0, ss_ = 0;
    for (let c = 0; c < CJ.length - 1; c++) { const w = Math.exp(-(cd[c] - best) / 0.12); sw += w; ss_ += w * cs[c]; }
    return ss_ / sw;
  };
  // LEGDEFORM: the leg's weights by design, not by which primitive is nearest. Within one leg's femur + tibia share (and then its
  // tibia + metatarsus share) a vertex is split by the plane bisecting the joint: sharply on the inside of the bend (the back of
  // the knee, the front of the ankle: the two sides fold into a crease instead of averaging into a collapsed pinch), broadly on
  // the outside, where the mid bone (half the bend) carries the joint's cap. Then the femur's share on the upper thigh is handed
  // to the twist bone. Only near the leg's bones (`reach`), so the belly and the tail keep what they had. See LEGW.
  const LW = LEGW, legW = [0, 1].map((k) => {
    const pos = (b) => V().setFromMatrixPosition(B[BONE.leg(k, b)]), col = (b, c) => V().setFromMatrixColumn(B[BONE.leg(k, b)], c);
    const hip = pos(0), knee = pos(1), ank = pos(2), fe = V().subVectors(knee, hip), lt = fe.length(); fe.normalize();
    const ti = V().subVectors(ank, knee), ls = ti.length(); ti.normalize();
    const mt = col(2, 1).normalize(), kn = V().addVectors(fe, ti).normalize(), an = V().addVectors(ti, mt).normalize();
    const kz = V().addVectors(col(0, 2), col(1, 2)); kz.addScaledVector(kn, -kz.dot(kn)).normalize();      // the knee's front (outside of its bend)
    const az = V().subVectors(ti, mt); az.addScaledVector(an, -az.dot(an)).normalize();                     // the heel (outside of the ankle's bend)
    return { hip, knee, ank, fe, ti, lt, ls, kn, an, kz, az, bF: BONE.leg(k, 0), bT: BONE.leg(k, 1), bM: BONE.leg(k, 2), bW: BONE.twist(k), bK: BONE.kmid(k), bA: BONE.amid(k) };
  });
  const segD = (px, py, pz, a, d, L) => { const t = Math.max(0, Math.min(L, (px - a.x) * d.x + (py - a.y) * d.y + (pz - a.z) * d.z)); return Math.hypot(px - a.x - d.x * t, py - a.y - d.y * t, pz - a.z - d.z * t); };
  const legWeights = (W, o, px, py, pz) => {
    for (const G of legW) {
      // the knee: femur + tibia
      let S = W[o + G.bF] + W[o + G.bT];
      if (S > 1e-4) {
        const r = Math.min(segD(px, py, pz, G.hip, G.fe, G.lt), segD(px, py, pz, G.knee, G.ti, G.ls)), gate = ss(LW.reach[1], LW.reach[0], r);
        const rx = px - G.knee.x, ry = py - G.knee.y, rz = pz - G.knee.z, d = rx * G.kn.x + ry * G.kn.y + rz * G.kn.z, z = rx * G.kz.x + ry * G.kz.y + rz * G.kz.z;
        const out = ss(LW.knee.z[0], LW.knee.z[1], z), wd = LW.knee.w[0] + (LW.knee.w[1] - LW.knee.w[0]) * out, tT = ss(-wd, wd, d - LW.knee.shift);
        const m = LW.knee.mid * out * Math.exp(-((d / LW.knee.sig) ** 2));
        const nF = S * (1 - m) * (1 - tT), nT = S * (1 - m) * tT, nK = S * m;
        W[o + G.bF] += (nF - W[o + G.bF]) * gate; W[o + G.bT] += (nT - W[o + G.bT]) * gate; W[o + G.bK] += nK * gate;
      }
      // the ankle: tibia + metatarsus
      S = W[o + G.bT] + W[o + G.bM];
      if (S > 1e-4) {
        const rx = px - G.ank.x, ry = py - G.ank.y, rz = pz - G.ank.z, r = Math.hypot(rx, ry, rz), gate = ss(LW.ankle.reach[1], LW.ankle.reach[0], r);
        const d = rx * G.an.x + ry * G.an.y + rz * G.an.z, z = rx * G.az.x + ry * G.az.y + rz * G.az.z;
        const out = ss(LW.ankle.z[0], LW.ankle.z[1], z), wd = LW.ankle.w[0] + (LW.ankle.w[1] - LW.ankle.w[0]) * out, tM = ss(-wd, wd, d - LW.ankle.shift);
        const m = LW.ankle.mid * out * Math.exp(-((d / LW.ankle.sig) ** 2));
        const nT = S * (1 - m) * (1 - tM), nM = S * (1 - m) * tM, nA = S * m;
        W[o + G.bT] += (nT - W[o + G.bT]) * gate; W[o + G.bM] += (nM - W[o + G.bM]) * gate; W[o + G.bA] += nA * gate;
      }
      // the thigh's upper half rides the twist bone (half the femur's long-axis turn), handing over to the femur toward the knee
      const wf = W[o + G.bF];
      if (wf > 1e-4) { const t = ((px - G.hip.x) * G.fe.x + (py - G.hip.y) * G.fe.y + (pz - G.hip.z) * G.fe.z) / G.lt, sh = 1 - ss(LW.twist[0], LW.twist[1], t); W[o + G.bW] += wf * sh; W[o + G.bF] = wf * (1 - sh); }
    }
  };
  const bootPrims = prims.filter((q) => q.boot), WD = new Float32Array(nv * BONE_COUNT); let sPar = new Float32Array(nv).fill(-1);
  for (let i = 0; i < nv; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    wb.fill(0); let best = Infinity, tag = 0;
    for (const p of prims) {
      if (p.op === 'cut' || p.c.distanceTo(_q.set(x, y, z)) > p.rad + 0.3) continue;
      const d = p.sd(x, y, z), s = Math.exp(-Math.max(d, 0) / p.sigma);
      for (const [b, w] of p.bones) wb[b] += s * w;
      if (d < best) { best = d; tag = TAG[p.tag]; }
    }
    tags[i] = tag;
    for (let b = 0; b < BONE_COUNT; b++) WD[i * BONE_COUNT + b] = wb[b];
    // where it is along the neck curve: the nearest place on it, but kept within a joint of where its own primitives put it
    // (the chest's front lies right under the jaw, and the nearest point on the chain there is mid-neck)
    { const hsum = wb[BONE.SKULL] + wb[BONE.JAW]; let ws = 0, pm = 0; for (let b = NK0 - 4; b < SPINE_N; b++) { ws += wb[b]; pm += wb[b] * b; }
      _q.set(x, y, z).applyMatrix4(Hinv0);
      if (ws + hsum > 1e-4 && _q.z < 0.6) { pm = (pm + hsum * (SPINE_N + 0.6)) / (ws + hsum); const s0 = chainParam(x, y, z); sPar[i] = pm + Math.max(-0.75, Math.min(0.75, s0 - pm)); } }
    // cavity: how much the field closes in a hand's breadth out along the normal (creases, armpits, under the jaw)
    const nx_ = nrm[i * 3], ny_ = nrm[i * 3 + 1], nz_ = nrm[i * 3 + 2];
    let ao = 0;
    for (const r of [0.08, 0.18, 0.34]) ao += Math.max(0, r - sample(x + nx_ * r, y + ny_ * r, z + nz_ * r)) / r;
    cavity[i] = Math.min(1, ao / 1.6);
  }
  // that place, smoothed over the skin: taken from the nearest point vertex by vertex it jumps by up to a joint between
  // neighbouring vertices far from the curve (the sides of the head behind the jaw muscles, the chest), and a jump in s is a
  // jump in which part of the curve the skin rides: a stretched or crushed triangle at every bend
  { const adj = Array.from({ length: nv }, () => []);
    for (let t = 0; t < tri.length; t += 3) for (let e = 0; e < 3; e++) { const a = tri[t + e], b = tri[t + (e + 1) % 3]; adj[a].push(b); adj[b].push(a); }
    const it = Math.round(40 * (0.0725 / cell) ** 2), tmp = new Float32Array(nv);
    for (let k = 0; k < it; k++) {
      for (let i = 0; i < nv; i++) { tmp[i] = sPar[i]; if (sPar[i] < 0) continue; let m = 0, c = 0; for (const j of adj[i]) if (sPar[j] >= 0) { m += sPar[j]; c++; } if (c) tmp[i] = 0.5 * sPar[i] + 0.5 * m / c; }
      sPar.set(tmp);
    } }
  for (let i = 0; i < nv; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    for (let b = 0; b < BONE_COUNT; b++) wb[b] = WD[i * BONE_COUNT + b];
    // the neck rides the neck curve's stations (see neckCurve), spread by the vertex's place s along it with a quadratic
    // B-spline over neighbouring stations (C1, three stations a vertex); toward the chest it hands over to the chest's own
    // bones, and the curve's last stations, which ride the skull rigidly, are the skull's (or the jaw's, under the mouth)
    { _q.set(x, y, z).applyMatrix4(Hinv0);
      const hsum = wb[BONE.SKULL] + wb[BONE.JAW], jr = hsum > 1e-4 ? wb[BONE.JAW] / hsum : 0;
      let ws = 0; for (let b = NK0 - 4; b < SPINE_N; b++) ws += wb[b];
      if (ws + hsum > 1e-4 && _q.z < 0.6) {
        const s = sPar[i];
        // ahead of the jaw muscles the head is rigid. Under the mouth the hand-over from the neck to the jaw is spread further
        // forward (JAWBACK.span): the jaw's deep back swings back by half a metre as it opens, and over a short hand-over
        // its skin folded over the throat's in a hard edge behind the jaw (worse with the head pitched up)
        const zq = Math.max(_q.z, 0), wq = Math.min(skullW(zq), jawW(zq)) - 0.09;     // (outside the mouth: its floor and the gums stay on the jaw with the teeth)
        const below = ss(mouthY(zq) - 0.02, mouthY(zq) - 0.14, _q.y) * (1 - ss(wq + 0.08, wq, Math.abs(_q.x)) * ss(mouthY(zq) - 0.36, mouthY(zq) - 0.26, _q.y)), zf = 0.3 + (JAWBACK.span - 0.3) * below;
        const r = ss(NK0 - 1.6, NK0 - 0.2, s) * ss(zf, 0.1 - 0.1 * below, _q.z);
        // what stays: the chest's bones and the head's, by (1 - r); the vertebrae's own frames never carry skin
        let move = 0;
        for (let b = NK0; b < SPINE_N; b++) { move += wb[b]; wb[b] = 0; }
        for (let b = NK0 - 4; b < NK0; b++) { move += wb[b] * r; wb[b] *= 1 - r; }
        move += hsum * r; wb[BONE.SKULL] *= 1 - r; wb[BONE.JAW] *= 1 - r;
        if (move > 0 && !STATIONS) {
          // the joints' share: a quadratic B-spline over the joints at integer s (17, 18 the chest's back, 19-25 the neck,
          // 26 the skull): C1 along the arc, at most three joints a vertex, never two that are not neighbours
          const x0 = Math.max(17, Math.min(26, s)); let hs = 0; const kw = [];
          for (let k = Math.floor(x0) - 2; k <= Math.floor(x0) + 3; k++) { const d = Math.abs(x0 - k) / NW, w = NW > 1.01 ? (d < 1 ? 2 / 3 - d * d + d * d * d / 2 : d < 2 ? (2 - d) ** 3 / 6 : 0) : d < 0.5 ? 0.75 - d * d : d < 1.5 ? 0.5 * (1.5 - d) ** 2 : 0; if (w > 0) { kw.push([Math.max(17, Math.min(26, k)), w]); hs += w; } }
          for (const [k, w0] of kw) { const w = move * w0 / hs; if (k >= 26) { wb[BONE.SKULL] += w * (1 - jr); wb[BONE.JAW] += w * jr; } else wb[k] += w; }
        } else if (move > 0) {
          hk.fill(0); let hs = 0;
          const x0 = (Math.max(NECKC.S0, Math.min(NECKC.S1, s)) - NECKC.S0) / NECKC.H;
          for (let k = Math.floor(x0) - 2; k <= Math.floor(x0) + 2; k++) { const d = Math.abs(x0 - k), w = d < 0.5 ? 0.75 - d * d : d < 1.5 ? 0.5 * (1.5 - d) ** 2 : 0; if (w > 0) { hk[Math.max(0, Math.min(NECKC.N - 1, k))] += w; hs += w; } }
          for (let k = 0; k < NECKC.N; k++) {
            const w = move * hk[k] / hs; if (!(w > 0)) continue;
            if (NECKC.S0 + k * NECKC.H >= 26 - 1e-4) { wb[BONE.SKULL] += w * (1 - jr); wb[BONE.JAW] += w * jr; } else wb[BONE.neck(k)] += w;
          }
        }
      } }
    // the mouth line decides skull or jaw: anything below it in front of the hinge rides the jaw,
    // anything above rides the skull, whichever primitive happens to be nearer (the snout tip overhangs the chin)
    { const hs = wb[BONE.SKULL] + wb[BONE.JAW];
      if (hs > 1e-4) {
        _q.set(x, y, z).applyMatrix4(Hinv0); const hz = _q.z, hy = _q.y, m = mouthY(hz);
        if (hz > -0.05 && Math.abs(_q.x) < 0.8 && hy > -1.1 && hy < 0.9) {
          // along the lips (cut apart by the slit) the split is sharp; behind the lip corner the cheek is one sheet of
          // skin over the hinge, so there the split widens into a soft band that shares the gape over many triangles
          // instead of tearing one row of them (the crease and the white speckle at the corner of the mouth)
          const bw = WEBSHEET.on ? 0.02 + 0.08 * ss(WEBSHEET.cut0 + 0.03, WEBSHEET.cut0 - 0.08, hz) : 0.02 + (WEB.band - 0.02) * ss(WEB.z + 0.04, WEB.z - 0.02, hz) + 0.1 * ss(WEB.z, 0.08, hz), rule = ss(m + bw, m - bw, hy), k = Math.min(1, Math.max(0, (hz + 0.05) / 0.3)), cur = wb[BONE.JAW] / hs, jf = cur + (rule - cur) * k;
          wb[BONE.JAW] = hs * jf; wb[BONE.SKULL] = hs * (1 - jf);
        }
      } }
    { let t = 0; for (let b = 0; b < BONE_COUNT; b++) t += wb[b]; t = t || 1; for (let b = 0; b < BONE_COUNT; b++) WD[i * BONE_COUNT + b] = wb[b] / t; }
    legWeights(WD, i * BONE_COUNT, x, y, z);
    // the keel is the pelvis' alone: inside the boot's own shape (a few cm of falloff) all weight is the pelvis', none the legs'
    { let m = 0; for (const p of bootPrims) { if (p.c.distanceTo(_q.set(x, y, z)) > p.rad + 0.3) continue; const sc = p.ownSc ?? 1; m = Math.max(m, 1 - ss(PUBIS.own[0] * sc, PUBIS.own[1] * sc, p.sd(x, y, z))); }
      m *= 1 - ss(PUBIS.cleft[0] + 0.05, PUBIS.cleft[1] + 0.05, Math.abs(x));      // never beside the keel: the thighs' inner faces keep their own weights
      if (m > 0) { const o = i * BONE_COUNT; for (let b = 0; b < BONE_COUNT; b++) WD[o + b] *= 1 - m; WD[o + IDX.PELVIS] += m; } }
    void x; void y; void z;
  }
  // the paint reads the spine's frames (back-to-belly shading, fold coordinates): for it, a neck station's weight is its
  // place on the spine (between the two joints, or the last joint and the skull)
  let paintIndex = new Uint16Array(nv * 4), paintWeight = new Float32Array(nv * 4); const pw4 = new Float32Array(BONE_COUNT);
  if (STATIONS) for (let i = 0; i < nv; i++) {
    const o = i * BONE_COUNT; pw4.fill(0);
    for (let b = 0; b < BONE_COUNT; b++) { const w = WD[o + b]; if (!(w > 0)) continue;
      if (b >= BONE.X0) { const k = Math.floor((b - BONE.X0) / 3), j = (b - BONE.X0) % 3;      // helper bones paint as their parents
        if (j === 0) pw4[BONE.leg(k, 0)] += w; else { pw4[BONE.leg(k, j - 1)] += w / 2; pw4[BONE.leg(k, j)] += w / 2; } continue; }
      if (b < BONE.neck(0)) { pw4[b] += w; continue; }
      const sk = NECKC.S0 + (b - BONE.neck(0)) * NECKC.H, j = Math.floor(sk), f = sk - j, nb = j + 1 >= SPINE_N ? BONE.SKULL : j + 1;
      pw4[Math.min(j, SPINE_N - 1)] += w * (1 - f); pw4[nb] += w * f; }
    const top = []; for (let b = 0; b < BONE_COUNT; b++) if (pw4[b] > 1e-4) top.push([pw4[b], b]);
    top.sort((a, b) => b[0] - a[0]); const sum = top.slice(0, 4).reduce((s, a) => s + a[0], 0) || 1;
    for (let c = 0; c < 4; c++) { const t = top[c]; paintIndex[i * 4 + c] = t ? t[1] : 0; paintWeight[i * 4 + c] = t ? t[0] / sum : 0; }
  }
  for (let i = 0; i < nv; i++) {
    const top = [], o = i * BONE_COUNT;
    for (let b = 0; b < BONE_COUNT; b++) if (WD[o + b] > 1e-4) top.push([WD[o + b], b]);
    top.sort((a, b) => b[0] - a[0]);
    const sum = top.slice(0, 4).reduce((s, a) => s + a[0], 0) || 1;
    for (let c = 0; c < 4; c++) { const t = top[c]; skinIndex[i * 4 + c] = t ? t[1] : 0; skinWeight[i * 4 + c] = t ? t[0] / sum : 0; }
  }
  // the lips must never be joined: a triangle ahead of the mouth corner with one vertex riding the jaw and another the
  // skull becomes a strand across the gape. The slit is cut wider than a cell, but where the grid happens to straddle it
  // surface nets can still weld a cell; such triangles are dropped here (each is only a sliver in the closed mouth)
  { const jwOf = (i) => { let j = 0; for (let c = 0; c < 4; c++) if (skinIndex[i * 4 + c] === BONE.JAW) j += skinWeight[i * 4 + c]; return j; };
    const hz = (i) => _q.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(Hinv0).z;
    let w = 0;
    for (let t = 0; t < tri.length; t += 3) {
      const a = tri[t], b = tri[t + 1], c = tri[t + 2], ja = jwOf(a), jb = jwOf(b), jc = jwOf(c);
      if (Math.max(ja, jb, jc) - Math.min(ja, jb, jc) > 0.6 && Math.min(hz(a), hz(b), hz(c)) > (WEBSHEET.on ? WEBSHEET.cut0 + 0.08 : WEB.z + 0.03)) continue;     // (behind WEB.z such a triangle is the web)
      tri[w++] = a; tri[w++] = b; tri[w++] = c;
    }
    tri.length = w; }
  // head-space coordinates of every vertex, for painting the face
  const Hinv = new Matrix4().copy(B[BONE.SKULL]).invert(); let hp = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) { _q.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(Hinv); hp[i * 3] = _q.x; hp[i * 3 + 1] = _q.y; hp[i * 3 + 2] = _q.z; }
  // tooth sockets, from the finished mesh of this tier (the phone grid moves the lips by centimetres, so nothing is taken
  // from a curve or the field): in head space, walk each jaw's tooth row (sides, then round the front), find the outer skin
  // of the lip just above (upper) or below (lower) the mouth gap, set the row a tooth's width inside it, and drop a vertical
  // ray onto that jaw's own triangles for the gum surface. Each socket is the point where the crown leaves the gum; the
  // root is sunk into the jaw from there (body.js), and a dense run of the same samples makes the gum ridge along the row.
  { const hx = (i) => hp[i * 3], hy = (i) => hp[i * 3 + 1], hz = (i) => hp[i * 3 + 2];
    const jwOf = (i) => { let j = 0; for (let c = 0; c < 4; c++) if (skinIndex[i * 4 + c] === BONE.JAW) j += skinWeight[i * 4 + c]; return j; };
    const T = { upper: [], lower: [] };
    for (let t = 0; t < tri.length; t += 3) {
      const a = tri[t], b = tri[t + 1], c = tri[t + 2], zm = (hz(a) + hz(b) + hz(c)) / 3, ym = (hy(a) + hy(b) + hy(c)) / 3;
      if (zm < 0.25 || Math.abs(ym - mouthY(Math.max(zm, 0))) > 0.3) continue;
      const j = (jwOf(a) + jwOf(b) + jwOf(c)) / 3;
      if (j < 0.2) T.upper.push(a, b, c); else if (j > 0.8) T.lower.push(a, b, c);
    }
    const hits = (L, ox, oy, oz, dx, dy, dz) => {     // every crossing of a ray with a triangle list (Moller-Trumbore), as distances
      const out = [];
      for (let t = 0; t < L.length; t += 3) {
        const a = L[t] * 3, b = L[t + 1] * 3, c = L[t + 2] * 3;
        const e1x = hp[b] - hp[a], e1y = hp[b + 1] - hp[a + 1], e1z = hp[b + 2] - hp[a + 2], e2x = hp[c] - hp[a], e2y = hp[c + 1] - hp[a + 1], e2z = hp[c + 2] - hp[a + 2];
        const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-10) continue;
        const sx = ox - hp[a], sy = oy - hp[a + 1], sz = oz - hp[a + 2], u = (sx * px + sy * py + sz * pz) / det; if (u < 0 || u > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = (dx * qx + dy * qy + dz * qz) / det; if (v < 0 || u + v > 1) continue;
        const d = (e2x * qx + e2y * qy + e2z * qz) / det; if (d > 0) out.push(d);
      }
      return out;
    };
    const gap = Math.max(0.03, cell * 0.8);     // half the mouth slit (as cut above)
    for (const upper of [true, false]) {
      const L = upper ? T.upper : T.lower, sg = upper ? 1 : -1, zf = 1.42;
      const yLip = (z) => mouthY(z) + sg * (gap + 0.02);
      // the outer skin of the lip, along the side and round the front: outermost crossing of a ray from the midline
      const line = [];
      const lipAt = (z0, dx, dz) => { const h = hits(L, 0, yLip(z0), z0, dx, 0, dz); return h.length ? Math.max(...h) : null; };
      for (let z = upper ? 0.5 : 0.6; z < zf; z += 0.02) { const t = lipAt(z, 1, 0); if (t !== null) line.push([t, z, 1, 0]); }
      for (let a = 85; a >= 0; a -= 5) { const r = a * Math.PI / 180, dx = Math.sin(r), dz = Math.cos(r), t = lipAt(zf, dx, dz); if (t !== null) line.push([dx * t, zf + dz * t, dx, dz]); }
      const Ls = [0]; for (let i = 1; i < line.length; i++) Ls.push(Ls[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
      const total = Ls[Ls.length - 1];
      const at = (s) => { let i = 1; while (i < Ls.length - 1 && Ls[i] < s) i++; const f = Math.min(1, Math.max(0, (s - Ls[i - 1]) / Math.max(Ls[i] - Ls[i - 1], 1e-6))), A = line[i - 1], Bq = line[i];
        let nx_ = A[2] + (Bq[2] - A[2]) * f, nz_ = A[3] + (Bq[3] - A[3]) * f; const nl = Math.hypot(nx_, nz_); return [A[0] + (Bq[0] - A[0]) * f, A[1] + (Bq[1] - A[1]) * f, nx_ / nl, nz_ / nl]; };
      // the gum under a point of the row: a vertical ray from inside the mouth gap onto this jaw's skin
      const gumAt = (x, z) => { const h = hits(L, x, mouthY(z), z, 0, sg, 0); return h.length ? mouthY(z) + sg * Math.min(...h) : mouthY(z) + sg * gap; };
      const inset = (rad) => rad * 1.05 + (upper ? 0.016 : 0.022);      // the row sits inside the lip: uppers under its overhang, lowers inside the lower lip
      const n = upper ? 12 : 11, sp = total / (n - 0.5);
      for (let k = 0; k < n; k++) {
        const sArc = total - sp * (k + 0.5) * (k < (upper ? 4 : 2) ? 0.92 : 1) - (k >= (upper ? 4 : 2) ? sp * 0.32 : 0);
        const [ox, oz, nxx, nzz] = at(sArc);
        const front = upper ? 4 : 2, u = (k - front) / Math.max(1, n - front - 1);
        const big = k < front ? 0.55 + 0.07 * k : 0.48 + 0.52 * Math.exp(-(((u - (upper ? 0.3 : 0.25)) / 0.36) ** 2));
        const h1 = hash3(k, upper ? 3 : 7, 11), j = h1 < 0.22 ? 0.5 + h1 : 0.78 + 0.4 * hash3(k, 5, upper ? 2 : 9);
        const rad = (upper ? 0.052 : 0.036) * (0.6 + 0.45 * big), len = (upper ? 0.27 : 0.18) * big * j, ins = inset(rad);      // lowers two-thirds of the uppers, stout
        const px = Math.max(ox - nxx * ins, nxx * 0.02), pz = oz - nzz * ins;
        teeth[upper ? 'upper' : 'lower'].push([px, gumAt(px, pz), pz, len, rad, nxx, nzz]);
      }
      // the gum ridge: the same row, densely, back to the front midline, with the gum height under it and the lip's outer
      // skin beside it (the ridge fills from the tooth line out to just inside the lip, so no gap shows between them)
      const back = Math.max(0, total - sp * (n - 0.5 + 0.5) - sp * 0.32);
      for (let s2 = back; s2 <= total + 1e-6; s2 += 0.03) {
        const [ox, oz, nxx, nzz] = at(Math.min(s2, total)), ins = inset(upper ? 0.04 : 0.032), px = Math.max(ox - nxx * ins, 0), pz = oz - nzz * ins;
        teeth.ridge[upper ? 'upper' : 'lower'].push([px, gumAt(px, pz), pz, nxx, nzz, ins]);
      }
    } }
  const nSurf = nv, tSurf = tri.length / 3;      // (surface, plus the claw points)
  const CT = CLAWTIP.on && prims.clawTips ? clawTipMesh(prims.clawTips, cell > 0.06, nv, tri) : null;
  if (CT) { const cat0 = (a, b) => { const o = new a.constructor(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
    const k = CT.P.length / 3, hp2 = new Float32Array(k * 3);
    for (let i = 0; i < k; i++) { _q.set(CT.P[i * 3], CT.P[i * 3 + 1], CT.P[i * 3 + 2]).applyMatrix4(Hinv); hp2[i * 3] = _q.x; hp2[i * 3 + 1] = _q.y; hp2[i * 3 + 2] = _q.z; }
    P = cat0(P, CT.P); nrm = cat0(nrm, CT.N); skinIndex = cat0(skinIndex, CT.SI); skinWeight = cat0(skinWeight, CT.SW); tags = cat0(tags, new Uint8Array(k).fill(3));
    cavity = cat0(cavity, new Float32Array(k)); hp = cat0(hp, hp2); sPar = cat0(sPar, new Float32Array(k).fill(-1));
    if (STATIONS) { paintIndex = cat0(paintIndex, CT.SI); paintWeight = cat0(paintWeight, CT.SW); }
    nv += k; }
  const tClaw = tri.length / 3 - tSurf;
  const W2 = WEBSHEET.on ? webSheets(B[BONE.SKULL], cell, Math.max(0.03, cell * 0.8) / (TYRANNOSAURUS.dims.headScale ?? 1), nv, tri) : null;
  const cat = (a, b) => { if (!b) return a; const o = new a.constructor(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
  const out = { position: cat(P, W2 && W2.P), normal: cat(nrm, W2 && W2.N), skinIndex: cat(skinIndex, W2 && W2.SI), skinWeight: cat(skinWeight, W2 && W2.SW), tags: cat(tags, W2 && W2.T),
    cavity: cat(cavity, W2 && new Float32Array(W2.T.length)), headPos: cat(hp, W2 && W2.HP), neckS: cat(sPar, W2 && new Float32Array(W2.T.length).fill(-1)), restTex: W2 ? cat(P, W2.R) : null, webU: W2 ? cat(new Float32Array(nv), W2.U) : null };
  const NV = out.position.length / 3;
  return { position: out.position, normal: out.normal, index: new Uint32Array(tri), skinIndex: out.skinIndex, skinWeight: out.skinWeight,
    ...(STATIONS ? { paintIndex: cat(paintIndex, W2 && W2.SI), paintWeight: cat(paintWeight, W2 && W2.SW) } : {}), neckS: out.neckS, tags: out.tags, cavity: out.cavity, headPos: out.headPos, restTex: out.restTex, webU: out.webU, teeth, eye, nostril,
    bind: B, bindPose, stats: { verts: NV, tris: tri.length / 3, surfTris: tSurf, clawTris: tClaw, webTris: tri.length / 3 - tSurf - tClaw, surfVerts: nSurf, grid: [nx, ny, nz], ms: Date.now() - t0, sdfMs: tSdf } };
}

// The claws' hooked points (CLAWTIP): per claw a flattened tube along a cubic in the toe's distal frame, closing to a point,
// rigid on that bone. Appends triangles (indices from `base`); returns positions, normals and weights.
function clawTipMesh(list, lo, base, tri) {
  const C = CLAWTIP, ns = C.seg[lo ? 1 : 0], nr = C.ring[lo ? 1 : 0], P = [], N = [], SI = [], SW = [], q = new Vector3(), n = new Vector3();
  const bz = (p, t) => { const u = 1 - t; return [0, 1].map((c) => u * u * u * p[0][c] + 3 * u * u * t * p[1][c] + 3 * u * t * t * p[2][c] + t * t * t * p[3][c]); };
  for (const c of list) {
    const b0 = base + P.length / 3;
    for (let i = 0; i <= ns; i++) {
      const t = i / ns, [z, y] = bz(c.pts, t), [z2, y2] = bz(c.pts, Math.min(1, t + 0.01)), [z0, y0] = bz(c.pts, Math.max(0, t - 0.01));
      let tz = z2 - z0, ty = y2 - y0; const tl = Math.hypot(tz, ty); tz /= tl; ty /= tl;
      const r = Math.max(0.0012, c.r0 * Math.pow(1 - t, 0.85)), ox = -ty, oy = tz;      // (ox, oy): the curve's normal in the y-z plane, as (z, y)
      for (let j = 0; j < nr; j++) {
        const a = (j / nr) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        // the section: flattened side to side (`flat`), a keel a little sharper underneath
        const lx = ca * r * c.flat * (sa < 0 ? 0.85 : 1), ly = sa * r;
        q.set(c.x + lx, y + ly * oy, z + ly * ox).applyMatrix4(c.E); P.push(q.x, q.y, q.z);
        n.set(ca / c.flat, sa * oy, sa * ox).normalize().transformDirection(c.E); N.push(n.x, n.y, n.z);
        SI.push(c.bone, 0, 0, 0); SW.push(1, 0, 0, 0);
      }
    }
    // winding: outward (checked on the first quad against its normal)
    const id = (i, j) => b0 + i * nr + (j % nr);
    const pv = (k) => [P[(k - base) * 3], P[(k - base) * 3 + 1], P[(k - base) * 3 + 2]];
    const A = pv(id(0, 0)), Bv = pv(id(1, 0)), Cv = pv(id(0, 1)), e1 = [Bv[0] - A[0], Bv[1] - A[1], Bv[2] - A[2]], e2 = [Cv[0] - A[0], Cv[1] - A[1], Cv[2] - A[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], nn = N.slice((id(0, 0) - base) * 3, (id(0, 0) - base) * 3 + 3);
    const flip = cr[0] * nn[0] + cr[1] * nn[1] + cr[2] * nn[2] < 0;
    for (let i = 0; i < ns; i++) for (let j = 0; j < nr; j++) { const a = id(i, j), b = id(i + 1, j), cc = id(i + 1, j + 1), d = id(i, j + 1);
      if (flip) tri.push(a, cc, b, a, d, cc); else tri.push(a, b, cc, a, cc, d); }
  }
  const F = (A, K) => new K(A);
  return { P: F(P, Float32Array), N: F(N, Float32Array), SI: F(SI, Uint16Array), SW: F(SW, Float32Array) };
}

// The corner webs as thin sheets (WEBSHEET): per side an outer and an inner layer of (nu x nv) quads and a rim along the free
// edge, in head space, then into the bind pose by the skull's frame. Rows run from the upper lip (u 0) to the lower (u 1); the
// first and last `bury` (head units) are sunk in the lip walls and ride one bone; between them the jaw's weight runs linearly.
// Appends its triangles to `tri` (indices from `base`). Returns the per-vertex arrays; U is the sheet coordinate for the shader:
// 1 + w (w = jaw weight) on the outer face, 3 + w on the inner, 5 + w on the rim.
function webSheets(Hb, cell, a0, base, tri) {
  const S = WEBSHEET, lo = cell > 0.06, nu = S.nu[lo ? 1 : 0], nvv = S.nv[lo ? 1 : 0], ext = a0 + S.bury, wPart = a0 / ext;
  const P = [], N = [], SI = [], SW = [], T = [], HP = [], R = [], U = [];
  const q = new Vector3(), n = new Vector3();
  const vert = (sd, x, y, z, nx, ny, nz, w, tag, uCode, ry) => {
    HP.push(sd * x, y, z);
    q.set(sd * x, y, z).applyMatrix4(Hb); P.push(q.x, q.y, q.z);
    q.set(sd * x, ry, z).applyMatrix4(Hb); R.push(q.x, q.y, q.z);
    n.set(sd * nx, ny, nz).transformDirection(Hb); N.push(n.x, n.y, n.z);
    SI.push(BONE.SKULL, BONE.JAW, 0, 0); SW.push(1 - w, w, 0, 0); T.push(tag); U.push(uCode + w);
    return base + P.length / 3 - 1;
  };
  // winding: make each triangle face along its intended normal (in head space)
  const face = (a, b, c, want) => {
    const o = (a - base) * 3, p1 = (b - base) * 3, p2 = (c - base) * 3, hp = HP;
    const e1 = [hp[p1] - hp[o], hp[p1 + 1] - hp[o + 1], hp[p1 + 2] - hp[o + 2]], e2 = [hp[p2] - hp[o], hp[p2 + 1] - hp[o + 1], hp[p2 + 2] - hp[o + 2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
    if (cx * want[0] + cy * want[1] + cz * want[2] >= 0) tri.push(a, b, c); else tri.push(a, c, b);
  };
  for (const sd of [1, -1]) {
    const grid = [[], []];
    for (let L = 0; L < 2; L++) for (let j = 0; j <= nvv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nvv, y01 = 1 - 2 * u;                            // +1 at the top of the upper bury, -1 at the bottom
      const w = Math.min(1, Math.max(0, (u - (1 - wPart) / 2) / wPart)), mid = 4 * w * (1 - w);      // jaw weight; 1 at the sheet's middle
      const zE = S.zU + (S.zL - S.zU) * w - S.sag * mid, z = S.z0 + (zE - S.z0) * v;
      const m = mouthY(Math.max(z, 0)), y = m + ext * y01;
      const dish = S.dish * mid * (0.35 + 0.65 * v), x = Math.min(skullW(z), jawW(z)) - S.inset - dish - (L ? S.thick : 0);
      // concave from outside: the upper half faces out and down, the lower out and up
      const ny = -0.8 * (1 - 2 * w) * (S.dish > 0 ? 1 : 0) * (0.35 + 0.65 * v), sg = L ? -1 : 1;
      grid[L].push(vert(sd, x, y, z, sg, ny * sg, 0, w, 4 + L, 1 + 2 * L, m + (y - m) * 3.5));
    }
    const id = (L, i, j) => grid[L][j * (nu + 1) + i];
    for (let L = 0; L < 2; L++) {
      const want = [sd * (L ? -1 : 1), 0, 0];
      for (let j = 0; j < nvv; j++) for (let i = 0; i < nu; i++) { const a = id(L, i, j), b = id(L, i + 1, j), c = id(L, i + 1, j + 1), d = id(L, i, j + 1); face(a, b, c, want); face(a, c, d, want); }
    }
    // the rim: the free edge, its own vertices (normals forward), joining the two layers
    const rim = [[], []];
    for (let L = 0; L < 2; L++) for (let i = 0; i <= nu; i++) { const o = (id(L, i, nvv) - base) * 3, w = U[id(L, i, nvv) - base] - (1 + 2 * L);
      const hx = Math.abs(HP[o]) + (L ? -0.001 : 0.001), hy = HP[o + 1], hz = HP[o + 2] + 0.003, m = mouthY(Math.max(hz, 0));
      rim[L].push(vert(sd, hx, hy, hz, 0.25, 0, 1, w, 6, 5, m + (hy - m) * 3.5)); }
    for (let i = 0; i < nu; i++) { const a = rim[0][i], b = rim[0][i + 1], c = rim[1][i + 1], d = rim[1][i]; face(a, b, c, [0, 0, 1]); face(a, c, d, [0, 0, 1]); }
    // and the rim to each layer's last row (no crack between them)
    for (let L = 0; L < 2; L++) for (let i = 0; i < nu; i++) { const a = id(L, i, nvv), b = id(L, i + 1, nvv), c = rim[L][i + 1], d = rim[L][i]; face(a, b, c, [0, 0, 1]); face(a, c, d, [0, 0, 1]); }
  }
  const F = (A, C) => new C(A);
  return { P: F(P, Float32Array), N: F(N, Float32Array), SI: F(SI, Uint16Array), SW: F(SW, Float32Array), T: F(T, Uint8Array), HP: F(HP, Float32Array), R: F(R, Float32Array), U: F(U, Float32Array) };
}

// ------------------------------------------------------------------ paint: base colour and roughness per vertex
function hash3(i, j, k) { let h = (i * 374761393 + j * 668265263 + k * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise3(x, y, z) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), u = x - i, v = y - j, w = z - k;
  const s = (t) => t * t * (3 - 2 * t), a = s(u), b = s(v), c = s(w);
  const L = (p, q, t) => p + (q - p) * t;
  return L(L(L(hash3(i, j, k), hash3(i + 1, j, k), a), L(hash3(i, j + 1, k), hash3(i + 1, j + 1, k), a), b),
    L(L(hash3(i, j, k + 1), hash3(i + 1, j, k + 1), a), L(hash3(i, j + 1, k + 1), hash3(i + 1, j + 1, k + 1), a), b), c);
}
const fbm = (x, y, z) => 0.5 * vnoise3(x, y, z) + 0.28 * vnoise3(x * 2.1, y * 2.1, z * 2.1) + 0.14 * vnoise3(x * 4.3, y * 4.3, z * 4.3) + 0.08 * vnoise3(x * 8.7, y * 8.7, z * 8.7);
const C = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255].map((c) => Math.pow(c, 2.2));
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function paintRex(g, { lo = false } = {}) {
  const nv = g.position.length / 3, col = new Float32Array(nv * 3), rough = new Float32Array(nv), scl = new Float32Array(nv), face = new Float32Array(nv), scute = new Float32Array(nv);
  // skin folds: where the hide bunches (neck base, throat, armpit, elbow, knee, ankle, groin) a mask, and a coordinate
  // along the bone chain the vertex rides (arc length down the spine into the head, or down a leg or arm), so the creases
  // run across the neck or limb the way skin bunches when it bends, and stay put on the skin under skinning
  const fold = new Float32Array(nv), fs = new Float32Array(nv), rim = new Float32Array(nv).fill(1);
  const PI = g.paintIndex || g.skinIndex, PW = g.paintWeight || g.skinWeight;
  const B = g.bind, bAxis = [], bPos = [], cum = new Float32Array(BONE_COUNT), chain = new Int8Array(BONE_COUNT);
  for (let b = 0; b < BONE_COUNT; b++) {
    const e = B[b].elements, limbY = b >= BONE.leg(0, 0) && ((b - BONE.leg(0, 0)) % 9 < 3 || b >= BONE.arm(0, 0));
    bAxis.push(limbY ? [e[4], e[5], e[6]] : [e[8], e[9], e[10]]); bPos.push([e[12], e[13], e[14]]);
  }
  const dist = (a, b) => Math.hypot(bPos[a][0] - bPos[b][0], bPos[a][1] - bPos[b][1], bPos[a][2] - bPos[b][2]);
  // between the thighs (owner 2026-11-18: "large strange spherical-ish voids carved out of the pubic keel and the thighs"): the
  // walls of the deep space between the legs face across it, so from behind or below they are seen edge-on, and the hide's
  // fog-coloured fresnel rim (body.js, meant for the silhouette against the storm) lit them as pale streaked hollows. That
  // space is occluded, the storm's light cannot reach it: `rim` (0..1, per vertex) takes the rim away there
  const hipA = bPos[BONE.leg(0, 0)], hipB = bPos[BONE.leg(1, 0)], hip0 = [0, 1, 2].map((c) => (hipA[c] + hipB[c]) / 2), hipW = Math.abs(hipA[0] - hipB[0]) / 2;
  const groin = (x, y, z) => ss(hipW * 1.3, hipW * 0.9, Math.abs(x - hip0[0])) * ss(hip0[1] - 0.1, hip0[1] - 0.4, y) * ss(1.4, 1.0, Math.abs(z - hip0[2]));
  for (let b = 1; b < SPINE_N; b++) cum[b] = cum[b - 1] + dist(b, b - 1);
  cum[BONE.SKULL] = cum[SPINE_N - 1] + dist(BONE.SKULL, SPINE_N - 1); cum[BONE.JAW] = cum[BONE.SKULL];
  for (let k = 0; k < 2; k++) {
    for (let j = 0; j < 9; j++) chain[BONE.leg(k, j)] = 1 + k;
    cum[BONE.leg(k, 1)] = dist(BONE.leg(k, 1), BONE.leg(k, 0)); cum[BONE.leg(k, 2)] = cum[BONE.leg(k, 1)] + dist(BONE.leg(k, 2), BONE.leg(k, 1));
    for (let d = 0; d < 3; d++) { cum[BONE.leg(k, 3 + d)] = cum[BONE.leg(k, 2)] + dist(BONE.leg(k, 3 + d), BONE.leg(k, 2)); cum[BONE.leg(k, 6 + d)] = cum[BONE.leg(k, 3 + d)] + dist(BONE.leg(k, 6 + d), BONE.leg(k, 3 + d)); }
    chain[BONE.arm(k, 0)] = chain[BONE.arm(k, 1)] = 3 + k; cum[BONE.arm(k, 1)] = dist(BONE.arm(k, 1), BONE.arm(k, 0));
  }
  const chW = new Float32Array(5), chS = new Float32Array(5);
  const joints = [];     // [bone whose origin is the joint, radius of the bunched skin around it, strength]
  for (let k = 0; k < 2; k++) joints.push([BONE.leg(k, 1), 0.5, 1], [BONE.leg(k, 2), 0.32, 0.8], [BONE.leg(k, 0), 0.75, 0.55], [BONE.arm(k, 0), 0.3, 1], [BONE.arm(k, 1), 0.18, 0.8]);
  // the toes: skin wrinkled across every knuckle (the MTP and the joint between the toe's two bones)
  for (let k = 0; k < 2; k++) for (let d = 0; d < 3; d++) joints.push([BONE.leg(k, 3 + d), 0.13, 0.7], [BONE.leg(k, 6 + d), 0.11, 0.9]);
  joints.push([IDX.NECK0 - 1, 0.6, 0.3], [IDX.NECK0 + 1, 0.45, 0.2]);     // the neck base: faint (strong, they ringed the neck)
  const BACK = C(0x353126), FLANK = C(0x675b43), BELLY = C(0x928770), STRIPE = C(0x26211a), LEGLOW = C(0x5a4f3d), MUZZLE = C(0x39342a), CHIN = C(0x857a62);
  // where a trunk vertex sits between belly (-1) and spine (+1): from its spine bones' frames, not its normal, so the
  // dark of the back comes well down the flank and the pale belly starts low, as a broad gradient that survives range
  const spineH = (i, x, y, z) => { let s = 0, w = 0; for (let c = 0; c < 4; c++) { const b = PI[i * 4 + c], wt = PW[i * 4 + c]; if (b >= SPINE_N || wt <= 0) continue;
    const e = B[b].elements, T = TRUNK[Math.min(b, TRUNK.length - 1)]; s += wt * (((x - e[12]) * e[4] + (y - e[13]) * e[5] + (z - e[14]) * e[6]) - T[2]) / T[1]; w += wt; } return w > 0.5 ? s / w : null; };
  const GUM = C(0x4a1c1a), LIP = C(0x5e5646), CLAW = C(0x383128), CLAWB = C(0x241f19), CLAWM = C(0x4a4236), CLAWP = C(0xb4a88e), SNOUT = C(0x51493b), PALATE = C(0x7a4640), THROAT = C(0x1c0a09);
  for (let i = 0; i < nv; i++) {
    const x = g.position[i * 3], y = g.position[i * 3 + 1], z = g.position[i * 3 + 2];
    const ny = g.normal[i * 3 + 1], tag = g.tags[i];
    const hx = g.headPos[i * 3], hy = g.headPos[i * 3 + 1], hz = g.headPos[i * 3 + 2];
    const n1 = fbm(x * 1.3, y * 1.3, z * 1.3), n2 = 0.62 * vnoise3(x * 2.4 + 7, y * 2.4, z * 2.4) + 0.38 * vnoise3(x * 5.5 + 3, y * 5.5, z * 5.5);    // blotches a hand or more across: per-vertex colour cannot carry finer
    // countershading: dark along the spine, lighter down the flanks, pale belly
    const up = Math.min(1, Math.max(0, (ny + 0.05) / 0.85)), dn = Math.min(1, Math.max(0, (-ny - 0.15) / 0.65));
    const sh = tag === 0 ? spineH(i, x, y, z) : null;
    // (SKIN3) the thigh, skinned to the femur, has no spine weight and took its shade from its normal alone: a side-facing thigh
    // came out flank-pale under the dark of the hip above it, a pale pad on the flank. Above the knee its shade now comes from
    // its height in the pelvis' frame like the body beside it, so the colour runs on over hip and thigh
    let dN = up * up * (3 - 2 * up);
    if (sh === null && tag === 0 && y > 1.5) { const e = B[IDX.PELVIS].elements, T = TRUNK[IDX.PELVIS], shP = (((x - e[12]) * e[4] + (y - e[13]) * e[5] + (z - e[14]) * e[6]) - T[2]) / T[1];
      dN += (Math.max(ss(-0.3, 0.6, shP), 0.5 * up) - dN) * ss(1.5, 2.4, y); }
    const dors = sh === null ? dN : Math.max(ss(-0.3, 0.6, sh), 0.5 * up), vent = sh === null ? dn * dn : Math.max(ss(-0.25, -0.75, sh) * ss(-0.1, -0.7, ny), dn * dn);
    let c = mixc(mixc(FLANK, BACK, dors), BELLY, vent);
    // broad soft mottling, a metre or so across, on the back, flanks and tail (not the belly): tone, not pattern
    const blot = vnoise3(x * 0.85 + 11, y * 0.85, z * 0.85) * 0.65 + vnoise3(x * 1.9 + 4, y * 1.9, z * 1.9) * 0.35;
    if (tag === 0) c = mixc(c, mixc(BACK, STRIPE, 0.4), 0.55 * ss(0.46, 0.7, blot) * (1 - vent)), c = mixc(c, mixc(FLANK, BELLY, 0.3), 0.35 * ss(0.4, 0.2, blot) * (1 - vent));
    // broken transverse bands over the back and tail
    const band = Math.max(0, Math.sin(z * 2.35 + n1 * 3.2) - 0.25) / 0.75;
    c = mixc(c, STRIPE, (0.32 * Math.min(1, Math.max(0, (ny - 0.05) / 0.5)) + 0.28 * (1 - vent)) * band * (tag === 0 ? 1 : 0.4));
    // phones: the coarse value structure has to carry the animal at range on its own (no fine relief survives a small,
    // low-resolution image): the dark of the back reaches further down the flank, the belly and throat are paler, and the
    // big blotches are stronger. Restrained: tone, not pattern
    if (lo) {
      c = mixc(c, BACK, 0.45 * ss(-0.3, 0.55, ny) * (tag === 3 ? 0 : 1));
      c = mixc(c, BELLY, 0.5 * ss(-0.2, -0.75, ny));
      if (tag !== 1 && hz > -1.2 && hz < 1.2 && hy < mouthY(Math.max(hz, 0)) - 0.05) c = mixc(c, BELLY, 0.4 * ss(-0.3, -0.75, ny) * ss(1.2, 0.4, Math.abs(hx)) * ss(-1.2, -0.5, hz));
    }
    // legs get a little darker and greyer toward the ground (not black: at 0.65 of 0x4a4236, with the toes' baked occlusion,
    // the feet painted at half the flank's albedo and rendered near black)
    c = mixc(c, LEGLOW, 0.5 * (1 - Math.min(1, Math.max(0, (y - 0.25) / 1.6))));
    let r = 0.66, webM = 0;
    if (tag === 1 || tag === 2) {
      c = mixc(c, SNOUT, 0.35 * Math.min(1, Math.max(0, (hz - 0.6) / 0.9)) * up);
      // a darker muzzle (top and sides of the snout, down to the lip) and a paler chin and underjaw
      if (tag === 1) c = mixc(c, MUZZLE, 0.8 * ss(0.55, 1.1, hz) * ss(-0.4, 0.2, ny));
      if (tag === 2) c = mixc(c, CHIN, 0.45 * ss(-0.4, -0.8, ny) * ss(-0.2, 0.4, hz));
      const m = mouthY(hz), lipD = Math.abs(hy - m);
      const inside = Math.abs(hx) < (tag === 1 ? skullW(hz) : jawW(hz)) - 0.05;
      if (hz > 0.1 && lipD < 0.075 && !inside) c = mixc(c, LIP, 0.4 * (1 - lipD / 0.075));
      const wi = Math.min(skullW(hz), jawW(hz)) - 0.04;
      // the corner webs (WEB): stretched open they show faces that lay in the closed corner's crease, so the baked occlusion
      // must not darken them; the inner face is mouth lining (less of the throat's dark), the outer face cheek
      webM = ss(WEB.z + 0.05, WEB.z - 0.01, hz) * ss(-0.08, 0.08, hz) * ss(0.12, 0.05, hy - m);
      if (hz > -0.06 && hz < 1.56 && lipD < 0.3 && Math.abs(hx) < wi) {
        // inside the mouth: dark gums along the tooth rows, a paler ridged palate and tongue bed, darkening into the throat
        const u = Math.abs(hx) / wi, ridge = 0.5 + 0.5 * Math.sin(hz * 34);
        c = mixc(GUM, PALATE, ss(0.85, 0.45, u) * (hy > m ? 0.75 + 0.25 * ridge : 0.85));
        c = mixc(c, THROAT, ss(0.55, 0.0, hz) * (1 - 0.6 * webM));
        r = 0.3;
      }
      // the gum: a dark, wet band along the outside of the upper tooth row, under the rolled lip
      const gumD = m - hy;
      if (tag === 1 && hz > 0.3 && hz < 1.62 && gumD > -0.03 && gumD < 0.05 && !inside) { c = mixc(c, GUM, 0.7 * ss(-0.03, 0.0, gumD)); r = Math.min(r, 0.4); }
      const E = g.eye || EYE, ed = Math.hypot(Math.abs(hx) - E.x, hy - E.y, hz - E.z);
      if (ed < 0.32) c = mixc(c, STRIPE, 0.6 * ss(0.32, 0.1, ed) + 0.15 * (ed < 0.2 ? 1 - ed / 0.2 : 0));
      const td = Math.hypot(Math.abs(hx) - 0.5, hy - 0.32, hz - 0.1);           // the temporal hollow behind the orbit
      if (td < 0.2) c = mixc(c, STRIPE, 0.45 * (1 - td / 0.2));
      // fine face scales everywhere on the head; larger scutes along the top of the snout and along the lips
      face[i] = ss(-0.25, 0.05, hz) * (hy > -1.0 ? 1 : 0);
      const tz = interp(SKULL, hz)[1], topS = ss(0.6, 0.85, hz) * ss(1.72, 1.6, hz) * ss(tz - 0.07, tz - 0.02, hy) * ss(0.5, 0.8, ny), lipS = ss(0.4, 0.6, hz) * ss(1.62, 1.5, hz) * ss(0.06, 0.02, Math.abs(hy - m - 0.05)) * (tag === 1 ? 1 : 0);
      const bE = g.eye || EYE, browS = ss(0.16, 0.06, Math.hypot(Math.abs(hx) - bE.x * 0.95, (hy - bE.y - 0.1) * 1.6, (hz - bE.z) * 0.6)) * ss(0.2, 0.6, ny);      // the ridge over each eye
      scute[i] = Math.min(1, topS + lipS + browS);
    }
    // the back of the mouth (behind the jaw muscles' front, nearer the nape's primitives than the head's, so tagged skin):
    // the cavity's back wall and the webs' inner faces there are mouth lining, which shows when the jaw is wide
    if (tag === 0 && hz > -0.14 && hz < 0.3) { const m = mouthY(Math.max(hz, 0)), wi = Math.min(skullW(Math.max(hz, -0.3)), jawW(Math.max(hz, -0.3))) - 0.04;
      if (Math.abs(hy - m) < 0.3 && Math.abs(hx) < wi) { c = mixc(mixc(GUM, PALATE, 0.6), THROAT, 0.7 * ss(0.3, -0.1, hz)); r = 0.3; } }
    // where the claw leaves the toe: a dark rim of skin round its base (claw t in its toe bone's frame, see below)
    const clawT = (() => { const b = g.skinIndex[i * 4], kk = b >= BONE.leg(1, 0) && b < BONE.leg(1, 0) + 9 ? 1 : 0, d = b - BONE.leg(kk, 6);
      if (!(b >= BONE.leg(0, 0) && d >= 0 && d < 3)) return null;
      const e = B[b].elements, zl = (x - e[12]) * e[8] + (y - e[13]) * e[9] + (z - e[14]) * e[10], ld = TOE_LEN[d] * (1 - TOE_SPLIT), cl = FOOTSKIN.claw * (d === 1 ? 1 : 0.9);
      return { t: (zl - (ld - cl)) / (cl + FOOTSKIN.clawOut), nyl: g.normal[i * 3] * e[4] + g.normal[i * 3 + 1] * e[5] + g.normal[i * 3 + 2] * e[6] }; })();
    if (tag === 0 && clawT) c = mixc(c, STRIPE, 0.7 * ss(-0.22, -0.04, clawT.t));
    if (tag === 3) {
      // horn: dark where it leaves the skin, paler toward the tip and along the top (worn), so the claw reads against the
      // ground and its boundary with the toe is clear. Along the claw (t) and up it (nyl) in its toe bone's bind frame
      c = CLAW; r = 0.36;
      if (clawT) { const { t, nyl } = clawT;
        c = mixc(CLAWB, CLAWM, ss(0.12, 0.45, t)); c = mixc(c, CLAWP, Math.max(0.8 * ss(0.55, 0.95, t), 0.5 * ss(0.3, 0.9, nyl) * ss(0.3, 0.75, t)));
        r = 0.36 + 0.12 * ss(0.4, 1, t);
      } else c = CLAWM;
      scute[i] = -1;      // horn: smooth (body.js reads a negative scute as horn and drops the hide's relief there)
    }
    // mottling and cavity occlusion
    const mot = tag === 3 ? 0.95 + 0.1 * n2 : 0.82 + 0.3 * n2 + (lo ? 0.3 : 0.12) * (n1 - 0.5);
    // (the toes and the ankle are all crease to a hand's-breadth probe: their occlusion is halved near the ground)
    const ao = 1 - 0.62 * g.cavity[i] * (1 - 0.8 * webM) * (1 - 0.5 * ss(1.0, 0.3, y));
    rim[i] = tag === 0 ? 1 - (1 - PUBIS.rim) * groin(x, y, z) * ss(0.3, 0.7, g.cavity[i]) : 1;
    rough[i] = r + 0.08 * (n2 - 0.5);
    // scale size (0 = the big pebbles of the back and flanks, 1 = fine): finer down the belly and inner thighs,
    // on the neck toward the head, and on the lower legs and feet
    scl[i] = Math.min(1, Math.max(0.75 * ss(-0.1, -0.7, ny), 0.55 * ss(-0.6, 0.2, hz) * (Math.abs(hx) < 1.2 && hy > -1.3 ? 1 : 0), 0.8 * (1 - Math.min(1, Math.max(0, (y - 0.4) / 1.2)))));
    // fold coordinate from the dominant chain only; where two chains share a vertex (groin, armpit) the coordinates
    // disagree, so the folds fade out there rather than crowd together
    { chW.fill(0); chS.fill(0); let tw = 0;
      for (let c = 0; c < 4; c++) { const w = PW[i * 4 + c]; if (w <= 0) continue; const b = PI[i * 4 + c], A = bAxis[b], q = bPos[b];
        chW[chain[b]] += w; chS[chain[b]] += w * (cum[b] + (x - q[0]) * A[0] + (y - q[1]) * A[1] + (z - q[2]) * A[2]); tw += w; }
      let bc = 0; for (let c = 1; c < 5; c++) if (chW[c] > chW[bc]) bc = c;
      fs[i] = chS[bc] / Math.max(chW[bc], 1e-6); var purity = chW[bc] / Math.max(tw, 1e-6), domChain = bc; }
    // fold mask: creases and pits (cavity), skin around the bending joints, and the throat under the jaw
    { let f = tag === 0 ? 0.8 * ss(0.18, 0.5, g.cavity[i]) : 0;
      if (tag === 0) for (const [b, r, k] of joints) { if (chain[b] !== domChain) continue; const q = bPos[b], d = Math.hypot(x - q[0], y - q[1], z - q[2]); f = Math.max(f, k * ss(r, r * 0.45, d)); }
      if (tag !== 1 && tag !== 3 && hz > -0.9 && hz < 0.75) f = Math.max(f, 0.2 * ss(-0.05, -0.3, hy - mouthY(Math.max(hz, 0))) * ss(0.75, 0.35, hz) * ss(-0.9, -0.4, hz) * ss(1.0, 0.6, Math.abs(hx)));
      fold[i] = Math.min(1, f) * ss(0.6, 0.85, purity); }
    // the insides of the legs and arms a little paler (the skin that sees less sun)
    if (tag === 0 && domChain > 0) { const ins = -g.normal[i * 3] * Math.sign(x); c = mixc(c, BELLY, (domChain <= 2 ? 0.4 * ss(0.3, 1.4, y) : 0.12) * ss(0.0, 0.7, ins)); }      // (the arms, now standing off the chest, read as a pale stick at 0.4)
    // the throat and underside of the neck pale, running back from the chin
    if (tag === 0 && hz > -1.6 && hz < 0.6 && hy < mouthY(Math.max(hz, 0)) - 0.05 && Math.abs(hx) < 1.0) c = mixc(c, CHIN, 0.35 * ss(-0.4, -0.8, ny) * ss(-1.6, -0.6, hz));
    col[i * 3] = c[0] * mot * ao; col[i * 3 + 1] = c[1] * mot * ao; col[i * 3 + 2] = c[2] * mot * ao;
  }
  // the corner web sheets (tags 4 outer, 5 inner, 6 rim; webSheets): the outer face takes the cheek's own colour beside it (the
  // nearest outer cheek vertex, its baked occlusion taken back out: the sheet is not in a crease when it shows), the inner face
  // mouth lining, the rim between them a little paler (the stretched edge). No cavity, face scales, no scutes; the shader finds
  // them by a negative `fold` (= -webU: 1 + jaw weight outer, 3 + inner, 5 + rim) and reads the jaw weight from it.
  if (g.webU) {
    // the cheek's own tone round the corner (outer skin, beside the slit, no creases), averaged: one colour, varied below
    const avg = [0, 0, 0]; let na = 0;
    for (let i = 0; i < nv; i++) { const t = g.tags[i]; if (t !== 1 && t !== 2) continue; const hx = Math.abs(g.headPos[i * 3]), hy = g.headPos[i * 3 + 1], hz = g.headPos[i * 3 + 2], dy = Math.abs(hy - mouthY(Math.max(hz, 0)));
      if (hz > 0.12 && hz < 0.5 && dy > 0.05 && dy < 0.22 && hx > Math.min(skullW(hz), jawW(hz)) - 0.03 && g.cavity[i] < 0.35) { for (let c = 0; c < 3; c++) avg[c] += col[i * 3 + c]; na++; } }
    const CHEEK = na ? avg.map((v) => v / na) : mixc(LIP, FLANK, 0.3);
    const LINING = mixc(GUM, PALATE, 0.55);
    for (let i = 0; i < nv; i++) { const t = g.tags[i]; if (t < 4) continue;
      const hy = g.headPos[i * 3 + 1], hz = g.headPos[i * 3 + 2];
      let c = CHEEK.map((v) => v * 0.62 * (0.88 + 0.24 * vnoise3(hz * 9, hy * 9, 7)));      // (the lip-side average is paler than the cheek the sheet hangs under)
      const w = g.webU[i] - (t === 4 ? 1 : t === 5 ? 3 : 5);
      if (t === 5) c = mixc(LINING, THROAT, 0.25 * (1 - 4 * w * (1 - w))).map((v) => v * (0.9 + 0.1 * vnoise3(hz * 20, hy * 20, 3)));
      // recessed in the corner: darker toward the corner and where it leaves the lips (a soft baked occlusion of its own)
      const mid = 4 * Math.max(0, Math.min(1, w)) * (1 - Math.max(0, Math.min(1, w))), occ = (0.62 + 0.38 * mid) * (0.7 + 0.3 * ss(0.08, 0.3, hz));
      if (t === 4) c = c.map((v) => v * occ);
      if (t === 6) c = mixc(c.map((v) => v * (0.75 + 0.25 * mid)), LINING, 0.3);
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
      rough[i] = t === 5 ? 0.32 : t === 6 ? 0.6 : 0.66; face[i] = 1; scute[i] = 0; scl[i] = 1; fold[i] = -g.webU[i]; fs[i] = 0;
    }
  }
  return { color: col, rough, scl, face, scute, fold, fs, rim };
}
