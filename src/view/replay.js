// Death cam: a ring of the last ~10 s (30 Hz) of the animal's pose and the player's body, kept for a little after the death, and
// the playback of it from a fixed third-person spot. The player is a little figure (figure.js) posed from the tape. View only: nothing here touches the sim.
import * as THREE from 'three/webgpu';
import { Figure, ST } from './figure.js';

const HZ = 30, N = 330, AFTER = 2.5, M = 16;      // frames in the ring, seconds kept after the death, floats of player data per frame
const DIST = 10, CAM_H = 2.5, PUSH = 0.82;
const ANGLES = [90, -90, 60, -60, 120, -120, 35, -35, 150, -150].map((d) => d * Math.PI / 180);

export class Replay {
  constructor(scene, terrain, nv, ns) {
    this.terrain = terrain; this.nv = nv; this.ns = ns;
    this.v = new Float32Array(N * nv); this.s = new Float32Array(N * ns); this.m = new Float32Array(N * M);
    this.pose = { v: new Float32Array(nv), s: new Float32Array(ns) };      // what is drawn during playback
    this.n = 0; this.acc = 0; this.death = -1; this.after = 0; this.on = false; this.t = 0; this.s0 = 0;
    this.cam = new THREE.Vector3(); this.aim = new THREE.Vector3(); this.from = new THREE.Vector3();
    this.fig = new Figure(scene, terrain);
    this.P = { x: 0, y: 0, z: 0, yaw: 0, eye: 1.7, st: 0, hx: 0, hy: 0, hz: 0, vx: 0, vy: 0, vz: 0, fx: 0, fy: 0, fz: 0 };      // what tick() takes, reused
    this.S = { x: 0, y: 0, z: 0, yaw: 0, eye: 1.7, st: 0, vx: 0, vz: 0, rvx: 0, rvy: 0, rvz: 0, hvx: 0, hvz: 0, fx: 0, fz: 1 };      // what the figure is shown
    this.carry = false; this.bx = 0; this.by = 0; this.bz = 0;
  }
  get count() { return Math.min(this.n, N); }
  /** Seconds of recording on hand. */
  get length() { return this.count / HZ; }
  reset() { this.n = 0; this.acc = 0; this.death = -1; this.after = 0; }
  /** The truth of where the body is, from the sim, into one reused object for tick(). On foot: the player's own feet and view. Otherwise the sim owns the
   *  body (tumbling, in the jaws, under a foot, on the ground) and its position and velocity are recorded as they are, with the head's forward so a held
   *  body can lie across the mouth. After a kill-to-eat the sim marks the victim `gone`, takes it out of the loop and its position freezes where it died;
   *  so then the body is kept in the jaws, following the head, while the head is still on it, and otherwise left on the ground where it fell. */
  body(Y, V, sim, T) {
    const P = this.P, hd = sim.head, hp = hd.pos, f = hd.f, K = sim.species.dims.headLen * 0.62;
    P.hx = hp.x; P.hy = hp.y; P.hz = hp.z; P.fx = f.x; P.fy = f.y; P.fz = f.z;
    if (V.free) { P.st = ST.FREE; P.x = Y.x; P.y = Y.up ? Y.up.base + Y.up.h : T.height(Y.x, Y.z); P.z = Y.z; P.yaw = Y.yaw; P.eye = Y.eye; P.vx = Y.vx; P.vy = 0; P.vz = Y.vz; this.carry = false; return P; }
    const code = { air: ST.AIR, down: ST.DOWN, rising: ST.RISING, pinned: ST.PINNED, held: ST.HELD, dead: ST.DEAD }[V.state] ?? ST.DOWN;
    P.st = V.dead && V.grip ? ST.HELD : code; P.x = V.x; P.y = V.y; P.z = V.z; P.yaw = V.cam.yaw; P.eye = Y.eye; P.vx = V.vx; P.vy = V.vy; P.vz = V.vz;
    if (!V.dead) this.carry = false; else if (V.grip) this.carry = true;
    if (V.gone) {
      const mx = hp.x + f.x * K, my = Math.max(hp.y + f.y * K - 0.5, T.height(hp.x + f.x * K, hp.z + f.z * K)), mz = hp.z + f.z * K;
      if (this.carry && Math.hypot(mx - this.bx, my - this.by, mz - this.bz) < 1.3) { P.st = ST.HELD; P.x = mx; P.y = my; P.z = mz; }      // still in the jaws
      else { this.carry = false; P.st = ST.DEAD; P.y = T.height(P.x, P.z); P.vx = P.vy = P.vz = 0; }
    }
    this.bx = P.x; this.by = P.y; this.bz = P.z; return P;
  }
  /** Once a frame while the player is on foot. `P` from body(). */
  tick(dt, dead, pose, P) {
    if (!dead && this.death >= 0) this.reset();      // a new life: the old tape goes
    if (dead) { this.after += dt; if (this.after > AFTER) return; }
    this.acc += dt;
    for (let w = 0; this.acc >= 1 / HZ && w < 12; w++) {      // a slow frame writes the same moment more than once, so the tape keeps its time
      this.acc -= 1 / HZ;
      const k = this.n % N, o = k * M, m = this.m;
      this.v.set(pose.v, k * this.nv); this.s.set(pose.s, k * this.ns);
      m[o] = P.x; m[o + 1] = P.y; m[o + 2] = P.z; m[o + 3] = P.yaw; m[o + 4] = P.eye; m[o + 5] = P.st; m[o + 6] = P.hx; m[o + 7] = P.hy; m[o + 8] = P.hz;
      m[o + 9] = P.vx; m[o + 10] = P.vy; m[o + 11] = P.vz; m[o + 12] = P.fx; m[o + 13] = P.fy; m[o + 14] = P.fz;
      if (dead && this.death < 0) this.death = this.n;
      this.n++;
    }
    if (this.acc > 1 / HZ) this.acc = 0;
  }
  /** Begin playback; false if there is nothing worth showing. */
  play() {
    if (this.count < 10 || this.death < 0) return false;
    // The tape may still be growing (the tail after the death). Playback counts in absolute frames from s0 and reads up to the live end;
    // while the ring is full the oldest frames are still being overwritten, so start past the ones the tail will take.
    const rest = Math.max(0, Math.ceil((AFTER - this.after) * HZ)) + 2;
    this.s0 = this.n - this.count + (this.n >= N ? rest : 0);
    if (this.n - this.s0 < 10) return false;
    this.on = true; this.t = 0; this.fig.reset(); this.fig.visible = true;
    const o = (this.death % N) * M, m = this.m, px = m[o], pz = m[o + 2], hx = m[o + 6], hz = m[o + 8];
    this.chooseCam(px, m[o + 1], pz, hx, m[o + 7], hz);
    this.aim.copy(this.anchor);
    return true;
  }
  /** Where the shown frame sits, for a note: seconds from the death, the player's spot and the animal's head. Small, no arrays. */
  info() {
    const f = this.s0 + this.t * HZ, o = (Math.floor(f) % N) * M, m = this.m, r = (v) => Math.round(v * 10) / 10;
    return { replay: true, replayT: r((f - this.death) / HZ), rpx: r(m[o]), rpz: r(m[o + 2]), rhx: r(m[o + 6]), rhz: r(m[o + 8]) };
  }
  stop() { this.on = false; this.fig.visible = false; }
  /** A spot ~10 m from the midpoint of the player and the head, across the line between them, in the clear. First that works, else the first. */
  chooseCam(px, py, pz, hx, hy, hz) {
    const T = this.terrain, mx = (px + hx) / 2, mz = (pz + hz) / 2;
    let dx = hx - px, dz = hz - pz; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    const lim = (T.arena || 1e9) - 3, st = T.structures || [];
    const inside = (S, x, z, pad) => { const a = x - S.cx, b = z - S.cz, c = Math.cos(S.yaw), s = Math.sin(S.yaw); return Math.abs(a * c - b * s) < S.hw + pad && Math.abs(a * s + b * c) < S.hd + pad; };
    const mine = st.filter((S) => inside(S, px, pz, 0));      // standing in one: it does not count against the view
    const clear = (x, z) => {
      if (Math.hypot(x, z) > lim) return false;
      for (const S of st) if (inside(S, x, z, 1)) return false;
      for (let i = 1; i < 24; i++) { const u = i / 24, sx = x + (px - x) * u, sz = z + (pz - z) * u; for (const S of st) if (!mine.includes(S) && inside(S, sx, sz, 0.3)) return false; }
      return true;
    };
    let first = null, hit = null;
    for (const a of ANGLES) {
      const x = mx + (Math.cos(a) * dx + Math.sin(a) * -dz) * DIST, z = mz + (Math.cos(a) * dz + Math.sin(a) * dx) * DIST;
      if (!first) first = [x, z];
      if (clear(x, z)) { hit = [x, z]; break; }
    }
    const [x, z] = hit || first;
    this.from.set(x, T.height(x, z) + CAM_H, z); this.cam.copy(this.from);
    this.anchor = new THREE.Vector3(mx, T.height(mx, mz) + 1.2, mz);
  }
  /** Advance by dt: pose, figure and camera. False when the tape has run out. */
  update(dt, camera) {
    this.t += dt;
    const f = this.s0 + this.t * HZ, last = this.n - 1;
    if (f >= last) return false;
    const i = Math.floor(f), u = f - i, a = i % N, b = (i + 1) % N;
    const pv = this.pose.v, ps = this.pose.s, nv = this.nv, ns = this.ns, V = this.v, Sx = this.s;
    for (let j = 0; j < nv; j++) pv[j] = V[a * nv + j] + (V[b * nv + j] - V[a * nv + j]) * u;
    for (let j = 0; j < ns; j++) ps[j] = Sx[a * ns + j] + (Sx[b * ns + j] - Sx[a * ns + j]) * u;
    const m = this.m, A = a * M, B = b * M, L = (j) => m[A + j] + (m[B + j] - m[A + j]) * u, T = this.terrain;
    const x = L(0), y = L(1), z = L(2), S = this.S, hz = HZ;
    let dy = m[B + 3] - m[A + 3]; dy -= Math.PI * 2 * Math.round(dy / (Math.PI * 2));
    S.x = x; S.y = y; S.z = z; S.yaw = m[A + 3] + dy * u; S.eye = L(4); S.st = Math.round(m[A + 5]);
    S.vx = (m[B] - m[A]) * hz; S.vz = (m[B + 2] - m[A + 2]) * hz; S.rvx = L(9); S.rvy = L(10); S.rvz = L(11);      // speed from the recorded positions
    S.hvx = (m[B + 6] - m[A + 6]) * hz; S.hvz = (m[B + 8] - m[A + 8]) * hz; S.fx = L(12); S.fz = L(14);
    if (dt > 0) this.fig.update(dt, S);
    // look at the midpoint of the player and the head, easing so a quick lunge does not whip the view round
    const tx = (x + L(6)) / 2, tz = (z + L(8)) / 2, ty = (y + L(7)) / 2, k = Math.min(1, dt * 4);
    this.aim.x += (tx - this.aim.x) * k; this.aim.y += (ty - this.aim.y) * k; this.aim.z += (tz - this.aim.z) * k;
    const push = 1 - (1 - PUSH) * Math.min(1, this.t * HZ / Math.max(1, last - this.s0)), an = this.anchor;
    camera.position.set(an.x + (this.from.x - an.x) * push, this.from.y, an.z + (this.from.z - an.z) * push);
    camera.lookAt(this.aim);
    return true;
  }
}
