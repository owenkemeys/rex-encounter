// Death cam: a ring of the last ~10 s (30 Hz) of the animal's pose and the player's body, kept for a little after the death, and
// the playback of it from a fixed third-person spot. The player is a pill for now. View only: nothing here touches the sim.
import * as THREE from 'three/webgpu';

const HZ = 30, N = 330, AFTER = 2.5, M = 10;      // frames in the ring, seconds kept after the death, floats of player data per frame
const EYE_H = 1.75, R = 0.25, DIST = 10, CAM_H = 2.5, PUSH = 0.82;
const ANGLES = [90, -90, 60, -60, 120, -120, 35, -35, 150, -150].map((d) => d * Math.PI / 180);

export class Replay {
  constructor(scene, terrain, nv, ns) {
    this.terrain = terrain; this.nv = nv; this.ns = ns;
    this.v = new Float32Array(N * nv); this.s = new Float32Array(N * ns); this.m = new Float32Array(N * M);
    this.pose = { v: new Float32Array(nv), s: new Float32Array(ns) };      // what is drawn during playback
    this.n = 0; this.acc = 0; this.death = -1; this.after = 0; this.on = false; this.t = 0;
    this.cam = new THREE.Vector3(); this.aim = new THREE.Vector3(); this.from = new THREE.Vector3();
    const g = new THREE.CapsuleGeometry(R, EYE_H - 2 * R, 4, 12), m = new THREE.MeshStandardMaterial({ color: 0xd9d5cc, roughness: 0.92, metalness: 0 });
    this.pill = new THREE.Mesh(g, m); this.pill.castShadow = true; this.pill.receiveShadow = true; this.pill.visible = false; this.pill.rotation.order = 'YXZ';
    scene.add(this.pill);
  }
  get count() { return Math.min(this.n, N); }
  /** Seconds of recording on hand. */
  get length() { return this.count / HZ; }
  reset() { this.n = 0; this.acc = 0; this.death = -1; this.after = 0; }
  /** Once a frame while the player is on foot. `P` = { x, y, z (feet, or the body when not upright), yaw, eye, lying, hx, hy, hz (animal's head) }. */
  tick(dt, dead, pose, P) {
    if (!dead && this.death >= 0) this.reset();      // a new life: the old tape goes
    if (dead) { this.after += dt; if (this.after > AFTER) return; }
    this.acc += dt;
    for (let w = 0; this.acc >= 1 / HZ && w < 12; w++) {      // a slow frame writes the same moment more than once, so the tape keeps its time
      this.acc -= 1 / HZ;
      const k = this.n % N, o = k * M, m = this.m;
      this.v.set(pose.v, k * this.nv); this.s.set(pose.s, k * this.ns);
      m[o] = P.x; m[o + 1] = P.y; m[o + 2] = P.z; m[o + 3] = P.yaw; m[o + 4] = P.eye; m[o + 5] = P.lying ? 1 : 0; m[o + 6] = P.hx; m[o + 7] = P.hy; m[o + 8] = P.hz;
      if (dead && this.death < 0) this.death = this.n;
      this.n++;
    }
    if (this.acc > 1 / HZ) this.acc = 0;
  }
  /** Begin playback; false if there is nothing worth showing. */
  play() {
    if (this.count < 10 || this.death < 0) return false;
    this.on = true; this.t = 0; this.pill.visible = true;
    const o = (this.death % N) * M, m = this.m, px = m[o], pz = m[o + 2], hx = m[o + 6], hz = m[o + 8];
    this.chooseCam(px, m[o + 1], pz, hx, m[o + 7], hz);
    this.aim.copy(this.anchor);
    return true;
  }
  stop() { this.on = false; this.pill.visible = false; }
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
  /** Advance by dt: pose, pill and camera. False when the tape has run out. */
  update(dt, camera) {
    this.t += dt;
    const f = this.t * HZ, last = this.count - 1;
    if (f >= last) return false;
    const i = Math.floor(f), u = f - i, base = this.n - this.count, a = ((base + i) % N), b = ((base + i + 1) % N);
    const pv = this.pose.v, ps = this.pose.s, nv = this.nv, ns = this.ns, V = this.v, Sx = this.s;
    for (let j = 0; j < nv; j++) pv[j] = V[a * nv + j] + (V[b * nv + j] - V[a * nv + j]) * u;
    for (let j = 0; j < ns; j++) ps[j] = Sx[a * ns + j] + (Sx[b * ns + j] - Sx[a * ns + j]) * u;
    const m = this.m, A = a * M, B = b * M, L = (j) => m[A + j] + (m[B + j] - m[A + j]) * u, T = this.terrain;
    const x = L(0), y = L(1), z = L(2), eye = L(4), p = this.pill;
    if (m[A + 5] > 0.5) {      // down or held: lying on its side where the body is
      p.scale.set(1, 1, 1); p.rotation.set(Math.PI / 2, m[A + 3], 0); p.position.set(x, Math.max(y, T.height(x, z) + R), z);
    } else {      // upright, top at the eye
      const h = Math.max(0.7, eye); p.scale.set(1, h / EYE_H, 1); p.rotation.set(0, 0, 0); p.position.set(x, y + h / 2, z);
    }
    // look at the midpoint of the player and the head, easing so a quick lunge does not whip the view round
    const tx = (x + L(6)) / 2, tz = (z + L(8)) / 2, ty = (y + L(7)) / 2, k = Math.min(1, dt * 4);
    this.aim.x += (tx - this.aim.x) * k; this.aim.y += (ty - this.aim.y) * k; this.aim.z += (tz - this.aim.z) * k;
    const push = 1 - (1 - PUSH) * Math.min(1, this.t * HZ / last), an = this.anchor;
    camera.position.set(an.x + (this.from.x - an.x) * push, this.from.y, an.z + (this.from.z - an.z) * push);
    camera.lookAt(this.aim);
    return true;
  }
}
