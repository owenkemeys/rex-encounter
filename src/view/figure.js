// The death cam's stand-in for the player: a small person (about 1.75 m) built from primitives and posed from the recorded track only.
// Owner: "The kill cam would be helped a lot by the pill standin being visibly sent flying or in its jaws etc, currently it's way too
// static. It may also be time to swap in a little human character instead of the pill."
// View only. Nothing here reads or changes the sim. Facing is +z in the figure's own frame, x to its left, y up.
// How it works in plain terms: every frame the replay hands over one "sample" (where the body is, which state the sim had it in, its
// speed from the recorded positions, where the animal's head and jaws are). From that we work out a TARGET pose for the state
// (a handful of joint angles + where the pelvis is + which way the body faces). When the state changes we remember what was on screen
// and ease from it to the new target over BLEND seconds, so nothing pops.
import * as THREE from 'three/webgpu';

const BLEND = 0.15;
const L_THIGH = 0.47, L_SHIN = 0.45, FOOT_H = 0.08, L_UP = 0.29, L_FORE = 0.27;      // bone lengths; hip joint to ground is about 1.0 m when straight
const H_STAND = 0.96, HIP_X = 0.09, SHO_X = 0.21, SHO_Y = 0.44;
// state codes as the replay records them
export const ST = { FREE: 0, AIR: 1, DOWN: 2, RISING: 3, PINNED: 4, HELD: 5, DEAD: 6 };
// pose parameters (raw joint rotations in radians) by index
const P_SPINE = 0, P_HEAD = 1, ARM = [2, 6], LEG = [10, 15];      // arm: pitch, out, swing, elbow.  leg: pitch, out, swing, knee, ankle
const NP = 20, sm = (u) => u * u * (3 - 2 * u), cl = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Figure {
  constructor(scene, terrain) {
    this.terrain = terrain;
    const jacket = new THREE.MeshStandardMaterial({ color: 0xa8552e, roughness: 0.9 }), pants = new THREE.MeshStandardMaterial({ color: 0x33383f, roughness: 0.9 }), skin = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.8 });
    const put = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    const grp = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.order = 'YXZ'; parent.add(g); return g; };
    const bone = (parent, len, r0, r1, mat) => { const g = new THREE.CylinderGeometry(r0, r1, len, 10); g.translate(0, -len / 2, 0); return put(parent, g, mat); };      // tapered, hangs down from its joint
    const ball = (parent, r, mat, y = 0) => put(parent, new THREE.SphereGeometry(r, 10, 8), mat, 0, y, 0);
    const root = this.root = grp(scene, 0, 0, 0); root.visible = false; root.rotation.order = 'YXZ';
    const pel = new THREE.CylinderGeometry(0.15, 0.16, 0.22, 12); pel.scale(1.25, 1, 0.8); put(root, pel, pants, 0, 0.03, 0);
    const spine = this.spine = grp(root, 0, 0.1, 0);
    const tor = new THREE.CylinderGeometry(0.17, 0.135, 0.5, 12); tor.scale(1.3, 1, 0.75); tor.translate(0, 0.23, 0); put(spine, tor, jacket);
    const neck = grp(spine, 0, 0.46, 0); bone(neck, -0.1, 0.045, 0.05, skin);
    const head = this.head = grp(neck, 0, 0.1, 0); const hd = ball(head, 0.105, skin, 0.05); hd.scale.set(0.9, 1.1, 1); ball(head, 0.05, skin, 0.03).position.z = 0.07;
    this.arm = [1, -1].map((s) => {
      const sh = grp(spine, s * SHO_X, SHO_Y, 0); ball(sh, 0.065, jacket); bone(sh, L_UP, 0.058, 0.045, jacket);
      const el = grp(sh, 0, -L_UP, 0); ball(el, 0.045, jacket); bone(el, L_FORE, 0.045, 0.036, jacket); const hand = grp(el, 0, -L_FORE, 0); ball(hand, 0.045, skin);
      return { sh, el, side: s };
    });
    this.leg = [1, -1].map((s) => {
      const hp = grp(root, s * HIP_X, 0, 0); ball(hp, 0.09, pants); bone(hp, L_THIGH, 0.085, 0.06, pants);
      const kn = grp(hp, 0, -L_THIGH, 0); ball(kn, 0.06, pants); bone(kn, L_SHIN, 0.058, 0.042, pants);
      const an = grp(kn, 0, -L_SHIN, 0); put(an, new THREE.BoxGeometry(0.1, 0.07, 0.27), pants, 0, -0.035, 0.06);
      return { hp, kn, an, side: s };
    });
    this.tgt = new Float32Array(NP); this.cur = new Float32Array(NP); this.snap = new Float32Array(NP);      // target, shown, shown-at-the-state-change
    this.qT = new THREE.Quaternion(); this.qC = new THREE.Quaternion(); this.qS = new THREE.Quaternion(); this.qA = new THREE.Quaternion(); this.qB = new THREE.Quaternion();
    this.pT = new THREE.Vector3(); this.pS = new THREE.Vector3(); this.off = new THREE.Vector3(); this.m4 = new THREE.Matrix4();
    this.e = new THREE.Euler(0, 0, 0, 'YXZ'); this.vx = new THREE.Vector3(); this.vy = new THREE.Vector3(); this.vz = new THREE.Vector3();
    this.reset();
  }
  set visible(v) { this.root.visible = v; }
  reset() {
    this.st = -1; this.w = 1; this.t = 0; this.phase = 0; this.speed = 0; this.ang = 0; this.ax = 1; this.az = 0; this.fresh = true; this.rise = 0;
    this.hvx = this.hvy = this.hvz = 0; this.pend = [0, 0, 0, 0]; this.sx = this.sz = 0;      // pendulum: angle and rate, along the head's forward and across it
    this.cur.fill(0); this.tgt.fill(0);
  }
  /** Where to put each foot (in the figure's frame, relative to the hip) while walking: the planted foot slides back at ground speed, the other swings. */
  _foot(p, duty, S, lift) {
    p -= Math.floor(p);
    if (p < duty) return [S * (0.5 - p / duty), 0];
    const u = (p - duty) / (1 - duty); return [S * (-0.5 + sm(u)), lift * Math.sin(Math.PI * u)];
  }
  /** Two-bone leg to reach `fwd` ahead of and `up` above the hip: writes thigh, knee and ankle angles. */
  _ik(T, i, fwd, side, drop, bend) {
    let d = Math.hypot(fwd, drop); const R = L_THIGH + L_SHIN - 0.004; if (d > R) d = R; if (d < 0.2) d = 0.2;
    const kneeCos = cl((L_THIGH * L_THIGH + L_SHIN * L_SHIN - d * d) / (2 * L_THIGH * L_SHIN), -1, 1), knee = Math.PI - Math.acos(kneeCos);
    const hip = Math.atan2(fwd, drop) + Math.acos(cl((L_THIGH * L_THIGH + d * d - L_SHIN * L_SHIN) / (2 * L_THIGH * d), -1, 1));
    const o = LEG[i]; T[o] = -hip; T[o + 1] = Math.atan2(side, drop) * 0.6; T[o + 3] = knee + bend; T[o + 4] = hip - knee;      // ankle keeps the foot level
  }
  /** s: one sample of the tape (see Replay.update). dt: seconds of tape since last call. */
  update(dt, s) {
    const g = this.terrain.height(s.x, s.z), T = this.tgt, st = s.st;
    if (st !== this.st) {      // a new state: remember what is on screen and ease from it
      this.snap.set(this.cur); this.qS.copy(this.root.quaternion); this.pS.copy(this.root.position);
      const first = this.st < 0; this.st = st; this.w = first ? 1 : 0; this.t = 0; this.fresh = !first;
      if (st === ST.HELD) { this.hvx = s.hvx; this.hvz = s.hvz; this.pend.fill(0); }
      if (st === ST.AIR) { this.ang = 0; const sp = Math.hypot(s.rvx, s.rvz); if (sp > 0.5) { this.ax = s.rvz / sp; this.az = -s.rvx / sp; } else { this.ax = 1; this.az = 0; } }      // tumble about the axis across the direction of travel
    }
    this.t += dt; this.w = Math.min(1, this.w + dt / BLEND); const t = this.t;
    T.fill(0); const q = this.qT, P = this.pT;
    const sp = this.speed += (Math.min(Math.hypot(s.vx, s.vz), 9) - this.speed) * Math.min(1, dt * 12);
    const yaw = s.yaw + Math.PI;      // the replay records the view's yaw (forward is -sin, -cos); the figure faces +z
    if (st === ST.FREE) {
      const c = cl((1.7 - s.eye) / 0.7, 0, 1), run = cl((sp - 2.2) / 3.5, 0, 1), fy = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
      const vf = s.vx * fy + s.vz * fz, vs = s.vx * fz - s.vz * fy, vm = Math.max(sp, 1e-3);      // speed along the facing and across it
      const duty = cl(0.62 - 0.045 * sp, 0.35, 0.62), moving = cl((sp - 0.15) / 0.5, 0, 1);
      let S = cl(0.3 + 0.12 * sp, 0, 0.8); const freq = Math.max(0.9, sp * duty / Math.max(S, 0.05)); S = sp * duty / freq;      // stride so the planted foot moves at ground speed
      this.phase += dt * freq * moving;
      const H = H_STAND - 0.05 * Math.min(1, sp / 1.5) - 0.1 * run - 0.34 * c, lift = (0.05 + 0.025 * sp) * moving;
      const bob = 0.012 * sp * moving * Math.abs(Math.sin(Math.PI * this.phase * 2));
      let ankleY = H - FOOT_H, fx = [0, 0];
      for (let i = 0; i < 2; i++) {
        const f = this._foot(this.phase + i * 0.5, duty, S, lift); fx[i] = f[0];
        this._ik(T, i, f[0] * vf / vm, f[0] * vs / vm, ankleY - f[1] + bob, 0);
      }
      const A = cl(0.1 + 0.09 * sp, 0, 0.75) * moving;
      for (let i = 0; i < 2; i++) {
        const o = ARM[i], opp = fx[1 - i] / Math.max(S * 0.5, 0.05), a = A * opp;      // the arm on the same side swings against its leg
        T[o] = -a - 0.08; T[o + 1] = 0.12 + 0.04 * (1 - moving); T[o + 3] = -(0.25 + 1.15 * run + 0.3 * Math.max(0, a));
      }
      T[P_SPINE] = 0.32 * run * Math.sign(vf || 1) + 0.3 * c; T[P_HEAD] = -0.5 * T[P_SPINE];
      q.setFromEuler(this.e.set(0, yaw, 0)); P.set(s.x, s.y + H + bob, s.z);
    } else if (st === ST.AIR) {
      const rate = 3 + 0.5 * Math.hypot(s.rvx, s.rvy, s.rvz); this.ang += rate * dt;      // faster blow, faster tumble
      this.qA.setFromAxisAngle(this.vx.set(this.ax, 0, this.az), this.ang); q.setFromEuler(this.e.set(0, yaw, 0)).premultiply(this.qA);
      for (let i = 0; i < 2; i++) {
        const k = i ? 1 : -1, o = ARM[i], l = LEG[i];
        T[o] = 2.6 + 0.7 * Math.sin(t * 11 + i * 2); T[o + 1] = 1.2 * (i ? -1 : 1); T[o + 3] = -0.5 - 0.4 * Math.sin(t * 9 + i);
        T[l] = -0.5 * k + 0.5 * Math.sin(t * 10 + i * 3); T[l + 1] = 0.35 * (i ? -1 : 1); T[l + 3] = 0.6 + 0.5 * Math.sin(t * 8 + i); T[l + 4] = 0.3;
      }
      T[P_HEAD] = -0.3 + 0.3 * Math.sin(t * 7);
      P.set(s.x, Math.max(s.y + 0.55, g + 0.35), s.z);
    } else if (st === ST.HELD) {
      // across the mouth, belly up: long axis along the side axis (across the head's forward), centre of the body at the jaw point
      const fx = s.fx, fz = s.fz, h = Math.hypot(fx, fz) || 1, sx = fz / h, sz = -fx / h;
      this.vy.set(sx, 0.12, sz).normalize(); this.vz.set(0, 1, 0).addScaledVector(this.vy, -this.vy.y).normalize(); this.vx.crossVectors(this.vy, this.vz);
      this.m4.makeBasis(this.vx, this.vy, this.vz); q.setFromRotationMatrix(this.m4);
      this._pendulum(dt, s, fx / h, fz / h, sx, sz);
      const pf = this.pend[0], ps = this.pend[2];
      for (let i = 0; i < 2; i++) {
        const o = ARM[i], l = LEG[i], k = i ? -1 : 1;
        T[o] = Math.PI / 2 + ps * 0.9; T[o + 2] = -pf * 0.9; T[o + 1] = 0.12 * k; T[o + 3] = 0.15;      // limp: hang toward the ground, swing with the head
        T[l] = Math.PI / 2 + ps * 0.9 + 0.05 * k; T[l + 2] = -pf * 0.9; T[l + 1] = 0.08 * k; T[l + 3] = -0.1; T[l + 4] = 0.3;
      }
      T[P_SPINE] = -0.35 + ps * 0.3; T[P_HEAD] = -0.7 + ps * 0.4;
      P.set(s.x, s.y, s.z).addScaledVector(this.vy, -0.3);
    } else {
      // on the ground: down (on the back), rising (pushing up over the rise time), pinned (spread flat under the foot), dead (limp, face down)
      const rise = st === ST.RISING ? sm(cl(t / 0.85, 0, 1)) : 0, face = st === ST.DEAD ? 1 : -1;
      q.setFromEuler(this.e.set(0, yaw, 0));
      if (rise < 1) { this.qB.setFromEuler(this.e.set(face * (Math.PI / 2) * (1 - rise), 0, 0)); q.multiply(this.qB); }
      const pin = st === ST.PINNED ? 1 : 0, wr = pin * 0.06 * Math.sin(t * 9);
      for (let i = 0; i < 2; i++) {
        const k = i ? -1 : 1, o = ARM[i], l = LEG[i];
        T[o] = (-0.2 + 0.1 * k) * (1 - rise); T[o + 1] = (0.55 + 0.7 * pin + 0.15 * k + wr) * (1 - rise) + 0.12 * rise; T[o + 3] = -(0.4 + 0.5 * rise) * (1 - 0.7 * pin);
        T[l] = 0.2 * k * (1 - rise) - 0.3 * rise; T[l + 1] = (0.18 + 0.2 * pin + 0.1 * k) * (1 - rise); T[l + 3] = (0.2 + 0.7 * rise) * (1 - pin); T[l + 4] = 0.2 * (1 - rise);
      }
      T[P_SPINE] = 0.5 * Math.sin(Math.PI * rise); T[P_HEAD] = face * -0.15 * (1 - rise);
      P.set(s.x, Math.max(s.y, g) + 0.14 + (H_STAND - 0.14) * rise, s.z);      // pelvis: on the ground, up to standing as it rises
    }
    // ease from what was on screen to the target, then write the joints
    const w = sm(this.w), cur = this.cur, snap = this.snap;
    for (let i = 0; i < NP; i++) cur[i] = snap[i] + (T[i] - snap[i]) * w;
    if (this.fresh) { this.off.copy(this.pS).sub(P); this.fresh = false; }      // positions blend as an offset that dies away
    const r = this.root; r.position.copy(P).addScaledVector(this.off, 1 - w); r.quaternion.copy(this.qS).slerp(q, w);
    this.spine.rotation.x = cur[P_SPINE]; this.head.rotation.x = cur[P_HEAD];
    for (let i = 0; i < 2; i++) {
      const a = this.arm[i], o = ARM[i], l = this.leg[i], p = LEG[i];
      a.sh.rotation.set(cur[o], cur[o + 2], a.side * cur[o + 1]); a.el.rotation.x = cur[o + 3];
      l.hp.rotation.set(cur[p], cur[p + 2], l.side * cur[p + 1]); l.kn.rotation.x = cur[p + 3]; l.an.rotation.x = cur[p + 4];
    }
  }
  /** Limbs hang under gravity and swing as the head accelerates: a damped pendulum along the head's forward (0,1) and across it (2,3). */
  _pendulum(dt, s, fx, fz, sx, sz) {
    const n = Math.max(1, Math.ceil(dt / 0.02)), h = Math.min(dt, 1 / 15) / n, pd = this.pend;
    const ax = dt > 1e-4 ? (s.hvx - this.hvx) / Math.min(dt, 1 / 15) : 0, ay = dt > 1e-4 ? (s.hvz - this.hvz) / Math.min(dt, 1 / 15) : 0;
    this.hvx = s.hvx; this.hvz = s.hvz;
    const af = cl(ax * fx + ay * fz, -40, 40), as = cl(ax * sx + ay * sz, -40, 40), L = 0.45;
    for (let k = 0; k < n; k++) {
      pd[1] += (-(9.81 / L) * pd[0] - 4 * pd[1] - af / L) * h; pd[0] = cl(pd[0] + pd[1] * h, -1.2, 1.2);
      pd[3] += (-(9.81 / L) * pd[2] - 4 * pd[3] - as / L) * h; pd[2] = cl(pd[2] + pd[3] * h, -1.2, 1.2);
    }
  }
}
