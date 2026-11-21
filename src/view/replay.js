// Death cam, shot as security-camera footage: a ring of the last ~10 s (30 Hz) of the animal's pose, the player's body and the world things that mattered
// (flares, thrown things, meat, the torch, timed sound events), kept for a little after the death, and the playback of it from a fixed camera mount
// chosen by looking at the whole tape (ptz.js: where it is mounted and how the pan-tilt-zoom head moves). The player is a little figure (figure.js)
// posed from the tape. View only: nothing here touches the sim.
import * as THREE from 'three/webgpu';
import { Figure, ST } from './figure.js';
import { planShots, Ptz, K as PK } from './ptz.js';

const HZ = 30, N = 480, LIVE = 450, AFTER = 2.5, M = 20;      // frames in the ring, seconds kept after the death, floats of player data per frame
const EVMAX = 500, RPT = { show: 12, burst: 0.4 };      // show: the footage's frames a second; burst: a cut or the start is static this long (live, tuning panel)
import { tune, tuneGroup } from './tune.js';      // tune
{ tuneGroup('Kill cam camera', { order: 70 }); tune('Kill cam camera', 'Footage frame rate (per second)', RPT, 'show', 2, 30, 1, null, 'replay.fps'); tune('Kill cam camera', 'Static burst at a cut (s)', RPT, 'burst', 0, 2, 0.05, null, 'replay.burst'); }      // tune      // the footage is shown at 12 frames a second; a cut or the start is a burst of static this long
const sstep = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
const EVF = ['type', 'src', 'x', 'y', 'z', 'kind', 'first', 'loud', 'part', 'force', 'mat', 'surface', 'nx', 'nz', 'speed', 'id', 'intensity', 'yaw', 'amount'];

export class Replay {
  constructor(scene, terrain, nv, ns) {
    this.terrain = terrain; this.nv = nv; this.ns = ns;
    this.v = new Float32Array(N * nv); this.s = new Float32Array(N * ns); this.m = new Float32Array(N * M);
    this.pose = { v: new Float32Array(nv), s: new Float32Array(ns) };      // what is drawn during playback
    this.N = N; this.live = false; this._dm = 0;      // closeout: ring length; live = a clip taken in play (no death in the tape)
    this.n = 0; this.acc = 0; this.death = -1; this.after = 0; this.on = false; this.t = 0; this.s0 = 0;
    this.th = new Array(N).fill(null);      // the things in the world, frame by frame: [{ id, kind, x, y, z, spin, burn, amount }]
    this.ev = [];      // timed sound events: { f (tape frame, fractional), e }
    this.fig = new Figure(scene, terrain);
    this.P = { x: 0, y: 0, z: 0, yaw: 0, eye: 1.7, st: 0, hx: 0, hy: 0, hz: 0, vx: 0, vy: 0, vz: 0, fx: 0, fy: 0, fz: 0, bx: 0, by: 0, bz: 0, pitch: 0, torch: 0 };      // what tick() takes, reused
    this.S = { x: 0, y: 0, z: 0, yaw: 0, eye: 1.7, st: 0, vx: 0, vz: 0, rvx: 0, rvy: 0, rvz: 0, hvx: 0, hvz: 0, fx: 0, fz: 1 };      // what the figure is shown
    this.carry = false; this.bx = 0; this.by = 0; this.bz = 0;
    // playback
    this.F = null; this.nF = 0; this.copied = 0; this.shots = []; this.shot = 0; this.ptz = new Ptz(); this.pf = 0; this.hold = 0; this.cutT = -9; this.aspect = 16 / 9;
    this.things = { list: [] }; this.eye = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() }; this.torchOn = false;
    this.head = new THREE.Vector3(); this.fired = []; this.ei = 0; this.label = ''; this.camNo = 1; this.burst = 0; this.stampMs = 0; this.baseMs = 0; this.cuts = 0;
    this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ');
  }
  get count() { return Math.min(this.n, N); }
  /** Seconds of recording on hand. */
  get length() { return this.count / HZ; }
  reset() { this.n = 0; this.acc = 0; this.death = -1; this.after = 0; this.ev.length = 0; this.th.fill(null); }
  /** A timed sound event (an arena event as the game routes it to the audio calls), for the tape. Call as it happens. */
  event(e) {
    if (this.death >= 0 && this.after > AFTER) return;
    const c = {}; for (const k of EVF) if (e[k] !== undefined) c[k] = e[k];
    this.ev.push({ f: this.n + this.acc * HZ, e: c });
    if (this.ev.length > EVMAX || this.ev[0].f < this.n - N) this.ev = this.ev.filter((x) => x.f >= this.n - N).slice(-EVMAX);
  }
  /** The truth of where the body is, from the sim, into one reused object for tick(). On foot: the player's own feet and view. Otherwise the sim owns the
   *  body (tumbling, in the jaws, under a foot, on the ground) and its position and velocity are recorded as they are, with the head's forward so a held
   *  body can lie across the mouth. After a kill-to-eat the sim marks the victim `gone`, takes it out of the loop and its position freezes where it died;
   *  so then the body is kept in the jaws, following the head, while the head is still on it, and otherwise left on the ground where it fell. */
  body(Y, V, sim, T, torch = false) {
    const P = this.P, hd = sim.head, hp = hd.pos, f = hd.f, K = sim.species.dims.headLen * 0.62;
    P.hx = hp.x; P.hy = hp.y; P.hz = hp.z; P.fx = f.x; P.fy = f.y; P.fz = f.z;
    { const q = sim.spine && sim.spine[15] ? sim.spine[15].p : null; P.bx = q ? q.x : sim.x; P.by = q ? q.y : hp.y - 1; P.bz = q ? q.z : sim.z; P.pitch = Y.pitch || 0; P.torch = torch ? 1 : 0; }      // the animal's torso, where the player looked, the torch
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
  /** Once a frame while the player is on foot. `P` from body(); `list` the sim's things (flares, stones, meat). */
  tick(dt, dead, pose, P, list) {
    if (!dead && this.death >= 0) this.reset();      // a new life: the old tape goes
    if (dead) { this.after += dt; if (this.after > AFTER) return; }
    this.acc += dt;
    for (let w = 0; this.acc >= 1 / HZ && w < 12; w++) {      // a slow frame writes the same moment more than once, so the tape keeps its time
      this.acc -= 1 / HZ;
      const k = this.n % N, o = k * M, m = this.m;
      this.v.set(pose.v, k * this.nv); this.s.set(pose.s, k * this.ns);
      m[o] = P.x; m[o + 1] = P.y; m[o + 2] = P.z; m[o + 3] = P.yaw; m[o + 4] = P.eye; m[o + 5] = P.st; m[o + 6] = P.hx; m[o + 7] = P.hy; m[o + 8] = P.hz;
      m[o + 9] = P.vx; m[o + 10] = P.vy; m[o + 11] = P.vz; m[o + 12] = P.fx; m[o + 13] = P.fy; m[o + 14] = P.fz; m[o + 15] = P.pitch; m[o + 16] = P.torch; m[o + 17] = P.bx; m[o + 18] = P.by; m[o + 19] = P.bz;
      let th = null; if (list && list.length) { th = []; for (const q of list) if (q.kind !== 'carcass' && th.length < 40) th.push({ id: q.id, kind: q.kind, x: q.x, y: q.y, z: q.z, spin: q.spin || 0, burn: q.burn || 0, amount: q.amount || 0, rest: !!q.rest }); }
      this.th[k] = th;
      if (dead && this.death < 0) this.death = this.n;
      this.n++;
    }
    if (this.acc > 1 / HZ) this.acc = 0;
  }
  /** Begin playback; false if there is nothing worth showing. `aspect` the screen's. Chooses the camera mount(s) from the whole tape first. */
  play(aspect = 16 / 9, live = false) {
    this.live = !!live; if (live) return this._playLive(aspect);      // closeout
    if (this.count < 10 || this.death < 0) return false;
    // The tape may still be growing (the tail after the death). Playback counts in absolute frames from s0 and reads up to the live end;
    // while the ring is full the oldest frames are still being overwritten, so start past the ones the tail will take.
    const rest = Math.max(0, Math.ceil((AFTER - this.after) * HZ)) + 2;
    this.s0 = this.n - this.count + (this.n >= N ? rest : 0);
    if (this.n - this.s0 < 10) return false;
    this.on = true; this.t = 0; this.hold = 0; this.fig.reset(); this.fig.visible = true; this.aspect = aspect;
    // the footage as plain arrays for the camera planner (figure feet, animal's head, its torso), padded to the end of the tail by repeating the last frame
    const total = Math.max(this.n - this.s0, this.death - this.s0 + Math.ceil(AFTER * HZ) + 1);
    this.F = new Float32Array(total * PK); this.nF = total; this.copied = this.s0; this._fill();
    this._dm = this.death - this.s0;
    const plan = planShots(this.terrain, this.F, total, this._dm, aspect);
    this.shots = plan.shots; this.shot = 0; this.cuts = plan.shots.length - 1; this.pf = 0;
    this._mount(0);
    this.ei = 0; while (this.ei < this.ev.length && this.ev[this.ei].f < this.s0) this.ei++;
    this.fired.length = 0; this.cutT = 0; this._pose(0, 0); this.baseMs = Date.now() - (this.nF / HZ) * 1000;
    return true;
  }
  /** closeout: a clip taken in play. The tape is not growing (the game is frozen), the last LIVE frames are played, and the camera is planned for the last 3 s instead of a death. */
  _playLive(aspect) {
    if (this.count < 90) return false;
    this.s0 = this.n - Math.min(this.count, LIVE); const total = this.n - this.s0; if (total < 90) return false;
    this.on = true; this.t = 0; this.hold = 0; this.fig.reset(); this.fig.visible = true; this.aspect = aspect;
    this.F = new Float32Array(total * PK); this.nF = total; this.copied = this.s0; this._fill();
    this._dm = total - 1; const plan = planShots(this.terrain, this.F, total, this._dm, aspect);
    this.shots = plan.shots; this.shot = 0; this.cuts = plan.shots.length - 1; this.pf = 0; this._mount(0);
    this.ei = 0; while (this.ei < this.ev.length && this.ev[this.ei].f < this.s0) this.ei++;
    this.fired.length = 0; this.cutT = 0; this._pose(0, 0); this.baseMs = Date.now() - (this.nF / HZ) * 1000; return true;
  }
  /** Seconds the footage will run from its start, and how far it has got (for the recording banner). */
  get duration() { return Math.max(0, (this.n - 1 - this.s0) / HZ); }
  /** Copy tape frames that have appeared since into F (and repeat the newest over the padding). */
  _fill() {
    const m = this.m, F = this.F, last = this.n - 1;
    for (let a = this.copied; a <= last; a++) { const o = (a % N) * M, q = (a - this.s0) * PK; if (q < 0 || q >= F.length) continue; F[q] = m[o]; F[q + 1] = m[o + 1]; F[q + 2] = m[o + 2]; F[q + 3] = m[o + 6]; F[q + 4] = m[o + 7]; F[q + 5] = m[o + 8]; F[q + 6] = m[o + 17]; F[q + 7] = m[o + 18]; F[q + 8] = m[o + 19]; }
    this.copied = last + 1;
    for (let i = last - this.s0 + 1; i < this.nF; i++) if (i > 0) F.copyWithin(i * PK, (i - 1) * PK, i * PK);
  }
  _mount(k) { const sh = this.shots[k]; this.shot = k; this.ptz.mount(sh.m, this.F, sh.f0, this.aspect); this.label = sh.m.label; this.camNo = sh.m.cam; if (k > 0) { this.cutT = this.t; } }
  /** Where the shown frame sits, for a note: seconds from the death, the player's spot and the animal's head. Small, no arrays. */
  info() {
    const f = this.s0 + this.t * HZ, o = (Math.floor(f) % N) * M, m = this.m, r = (v) => Math.round(v * 10) / 10;
    return { replay: true, replayCam: this.label, replayT: r((f - this.death) / HZ), rpx: r(m[o]), rpz: r(m[o + 2]), rhx: r(m[o + 6]), rhz: r(m[o + 8]) };
  }
  stop() { this.on = false; this.fig.visible = false; }
  /** The recorded frames in order, oldest first, as plain data for a share tape (src/tape.js). Null if there is too little. */
  toTape(meta) {
    const a0 = this.n - this.count, frames = this.count; if (frames < 10) return null;
    const v = new Float32Array(frames * this.nv), s = new Float32Array(frames * this.ns), m = new Float32Array(frames * M), th = [];
    for (let f = 0; f < frames; f++) { const k = (a0 + f) % N; v.set(this.v.subarray(k * this.nv, (k + 1) * this.nv), f * this.nv); s.set(this.s.subarray(k * this.ns, (k + 1) * this.ns), f * this.ns); m.set(this.m.subarray(k * M, (k + 1) * M), f * M); th.push(this.th[k]); }
    const ev = this.ev.filter((x) => x.f >= a0).map((x) => ({ f: x.f - a0, e: x.e }));
    return { nv: this.nv, ns: this.ns, nm: M, frames, v, s, m, th, ev, meta: { ...meta, death: this.death >= 0 ? this.death - a0 : -1, live: this.live } };
  }
  /** Load a share tape into the ring as if it had just been recorded and finished: play() then shows it. False if it does not fit this build. */
  fromTape(t) {
    if (t.nv !== this.nv || t.ns !== this.ns || t.nm !== M || t.frames > N) return false;
    this.reset();
    for (let f = 0; f < t.frames; f++) { this.v.set(t.v.subarray(f * t.nv, (f + 1) * t.nv), f * this.nv); this.s.set(t.s.subarray(f * t.ns, (f + 1) * t.ns), f * this.ns); this.m.set(t.m.subarray(f * M, (f + 1) * M), f * M); this.th[f] = t.th[f]; }
    this.n = t.frames; this.death = t.meta.death; this.after = AFTER + 1; this.ev = t.ev.slice(); return true;
  }
  /** The pose of the shown moment (animal pose, figure, recorded things, the head for the audio) at tape time t seconds, `step` seconds since the last shown frame. */
  _pose(t, step) {
    const f = this.s0 + t * HZ, last = this.n - 1, ff = Math.min(f, last - 1e-3), i = Math.floor(ff), u = ff - i, a = i % N, b = (i + 1) % N;
    const pv = this.pose.v, ps = this.pose.s, nv = this.nv, ns = this.ns, V = this.v, Sx = this.s;
    for (let j = 0; j < nv; j++) pv[j] = V[a * nv + j] + (V[b * nv + j] - V[a * nv + j]) * u;
    for (let j = 0; j < ns; j++) ps[j] = Sx[a * ns + j] + (Sx[b * ns + j] - Sx[a * ns + j]) * u;
    const m = this.m, A = a * M, B = b * M, L = (j) => m[A + j] + (m[B + j] - m[A + j]) * u, S = this.S, hz = HZ;
    let dy = m[B + 3] - m[A + 3]; dy -= Math.PI * 2 * Math.round(dy / (Math.PI * 2));
    S.x = L(0); S.y = L(1); S.z = L(2); S.yaw = m[A + 3] + dy * u; S.eye = L(4); S.st = Math.round(m[A + 5]);
    S.vx = (m[B] - m[A]) * hz; S.vz = (m[B + 2] - m[A + 2]) * hz; S.rvx = L(9); S.rvy = L(10); S.rvz = L(11);      // speed from the recorded positions
    S.hvx = (m[B + 6] - m[A + 6]) * hz; S.hvz = (m[B + 8] - m[A + 8]) * hz; S.fx = L(12); S.fz = L(14);
    if (step > 0) this.fig.update(step, S);
    this.head.set(L(6), L(7), L(8));
    // the torch where the player held it (the eye, looking along the recorded view)
    this.torchOn = m[A + 16] > 0.5;
    this._e.set(L(15), S.yaw, 0); this.eye.quaternion.setFromEuler(this._e); this.eye.position.set(S.x, S.y + S.eye, S.z);
    // the world things as they were, positions eased between the two frames
    const ta = this.th[a], tb = this.th[b], out = this.things.list; out.length = 0;
    if (ta) for (const q of ta) { const r = tb && tb.find((w) => w.id === q.id); out.push(r ? { id: q.id, kind: q.kind, x: q.x + (r.x - q.x) * u, y: q.y + (r.y - q.y) * u, z: q.z + (r.z - q.z) * u, spin: q.spin + (r.spin - q.spin) * u, burn: q.burn, amount: q.amount, rest: q.rest } : q); }
    // the sound events that fall in the span just shown
    return f;
  }
  /** Advance by dt: pose, figure, things, sounds due and the camera. False when the tape has run out. The footage is shown at RPT.show frames a second: the picture holds between. */
  update(dt, camera) {
    this.hold += dt;
    if (this.hold < 1 / RPT.show && this.t > 0) { this.burst = Math.max(0, 1 - (this.t - this.cutT) / RPT.burst); return true; }
    const step = this.hold; this.hold = 0;
    const f0 = this.s0 + this.t * HZ; this.t += step;
    const f = this.s0 + this.t * HZ, last = this.n - 1;
    if (f >= last) return false;
    this._fill();
    // sounds that fall between the last shown frame and this one
    this.fired.length = 0; while (this.ei < this.ev.length && this.ev[this.ei].f <= f) { if (this.ev[this.ei].f > f0 - 1e-6 || step <= 0) this.fired.push(this.ev[this.ei].e); this.ei++; }
    this._pose(this.t, step);
    // the pan-tilt-zoom head, a tape frame at a time (so it behaves the same however fast the picture is shown); a cut at the frame the plan says
    const death = this._dm;
    for (let g = this.pf + 1, to = Math.floor(f - this.s0); g <= to; g++) {
      this.pf = g;
      const nx = this.shots[this.shot + 1];
      if (nx && g >= nx.f0) { this._mount(this.shot + 1); this.cutT = this.t; this.ptz.mount(nx.m, this.F, g, this.aspect); continue; }
      this.ptz.step(1 / HZ, this.F, g, this.aspect, sstep(death - 45, death, g));
    }
    const P = this.ptz, m = P.m, c = camera;
    c.position.set(m.x, m.y, m.z); P.fwd(this.v3 || (this.v3 = {})); c.lookAt(m.x + this.v3.x, m.y + this.v3.y, m.z + this.v3.z);
    const fov = P.fov * 180 / Math.PI; if (Math.abs(c.fov - fov) > 1e-3) { c.fov = fov; c.updateProjectionMatrix(); }
    this.burst = Math.max(0, 1 - (this.t - this.cutT) / RPT.burst); this.stampMs = this.baseMs + this.t * 1000;
    return true;
  }
}
