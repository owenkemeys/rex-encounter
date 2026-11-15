// A small herd of fast, light bipedal herbivores sharing the paddock. They graze, keep together,
// watch for danger, call an alarm and bolt. A predator that walks openly at them never gets
// close; one that creeps, uses cover and waits can. Deterministic and seeded.
import { makeRng, clamp, lerp, wrap, bearing } from '../math.js';

export const PREY = { hip: 1.35, len: 3.6, run: 10.5, walk: 1.1 };

export class Herd {
  constructor(terrain, seed = 1, n = 7) {
    this.T = terrain; this.R = makeRng(seed * 31 + 7); this.events = []; this.t = 0; this.nextId = 1;
    const R = this.R, a = R() * 6.283, d = R.range(45, 70);
    // they graze where there is grazing (the paddock's open pasture), starting on one well away from the middle; without a
    // designed paddock, anywhere 45-70 m out
    this.pastures = terrain.grazing && terrain.grazing.length ? terrain.grazing : null;
    if (this.pastures) { const far = this.pastures.filter((g) => Math.hypot(g.x, g.z) > 25), L = far.length ? far : this.pastures, g = L[Math.floor(a / 6.2832 * L.length) % L.length]; this.home = { x: g.x, z: g.z, r: g.r }; this.moveAt = 150 + 3 * (d - 45) * 6; }
    else this.home = { x: Math.sin(a) * d, z: Math.cos(a) * d, r: 25 };
    this.list = [];
    const sp = Math.min(8, this.home.r * 0.6);
    for (let i = 0; i < n; i++) this._spawn(this.home.x + R.range(-sp, sp), this.home.z + R.range(-sp, sp));
  }
  _spawn(x, z) {
    const R = this.R;
    const p = { id: this.nextId++, x, z, y: this.T.height(x, z), yaw: R() * 6.283, v: 0, state: 'graze', alert: 0, look: null, t: 0,
      head: 0, headT: 0, nextHead: R.range(1, 5), wander: R() * 6.283, phase: R() * 6.283, fleeT: 0, flee: null, size: R.range(0.88, 1.1),
      nerve: R.range(0.7, 1.3), zig: 0, tail: 0, dead: false, deadT: 0, stamina: 1 };
    this.list.push(p); return p;
  }
  get alive() { return this.list.filter((p) => !p.dead); }

  kill(id) {
    const p = this.list.find((q) => q.id === id); if (!p || p.dead) return null;
    p.dead = true; p.state = 'dead'; p.deadT = this.t; p.v = 0;
    this.events.push({ type: 'killed', id, x: p.x, z: p.z });
    for (const q of this.alive) if (Math.hypot(q.x - p.x, q.z - p.z) < 50) this._bolt(q, { x: p.x, z: p.z }, 1.5);
    return p;
  }
  /** Gone (eaten): a replacement wanders in from far off, later. */
  gone(id) { const i = this.list.findIndex((q) => q.id === id); if (i >= 0) this.list.splice(i, 1); this.pending = (this.pending || 0) + 1; this.respawnAt = this.t + 90; }

  _bolt(p, from, k = 1) {
    if (p.state !== 'flee') this.events.push({ type: 'alarm', id: p.id, x: p.x, z: p.z });
    p.state = 'flee'; p.flee = { x: from.x, z: from.z }; p.fleeT = this.R.range(7, 12) * k; p.alert = 1.4;
  }

  /** threats: [{x, z, speed, stalk, big}] (the animal, people); noises: [{x, z, loud, kind}] */
  step(dt, threats, noises = []) {
    this.t += dt; const R = this.R, T = this.T, A = this.alive;
    if (this.pending && this.t > this.respawnAt) { const a = R() * 6.283; this._spawn(Math.sin(a) * 85, Math.cos(a) * 85); this.pending--; this.respawnAt = this.t + 40; }
    // herd centre
    let cx = 0, cz = 0; for (const p of A) { cx += p.x; cz += p.z; } if (A.length) { cx /= A.length; cz /= A.length; }
    // where they graze: back to the nearest pasture once a flight is over; now and then, quietly, on to another
    if (this.pastures && A.length) {
      const fled = A.some((p) => p.state === 'flee'), calm = !fled && A.every((p) => p.alert < 0.3);
      if (fled) this.scattered = true;
      else if (calm && this.scattered) { this.scattered = false; let b = null, bd = 1e9; for (const g of this.pastures) { const dd = Math.hypot(g.x - cx, g.z - cz); if (dd < bd) { bd = dd; b = g; } } this.home = { x: b.x, z: b.z, r: b.r }; }
      if (calm && this.t > this.moveAt) { this.moveAt = this.t + R.range(180, 360); const o = this.pastures.filter((g) => g.x !== this.home.x || g.z !== this.home.z); if (o.length) { const g = o[Math.floor(R() * o.length) % o.length]; this.home = { x: g.x, z: g.z, r: g.r }; } }
    }
    for (const n of noises) {
      for (const p of A) {
        const d = Math.hypot(n.x - p.x, n.z - p.z), heard = n.loud * 160 - d;
        if (heard > 0 && n.kind !== 'prey') { p.alert = Math.max(p.alert, Math.min(1.6, heard / 60 * p.nerve)); p.look = { x: n.x, z: n.z }; if (n.kind === 'roar' && d < 90) this._bolt(p, n, 1.2); }
      }
    }
    for (const p of this.list) {
      p.y = T.height(p.x, p.z);
      if (p.dead) continue;
      p.t += dt;
      // vigilance: a threat that is close, big and moving openly is noticed fast; one creeping in cover slowly
      let worst = null, ws = 0;
      for (const h of threats) {
        const d = Math.hypot(h.x - p.x, h.z - p.z); if (d > 90) continue;
        const cov = T.coverAt ? T.coverAt(h.x, h.z) : 0, big = h.big ? 1 : 0.45;
        const look = p.head > 0.5 ? 0.45 : 1;       // grazing heads down see less
        // flight distance: tolerated far off, watched in the middle distance, fled from close in or when it comes straight on
        const close = h.vx !== undefined ? clamp(-((h.vx || 0) * (h.x - p.x) + (h.vz || 0) * (h.z - p.z)) / (d || 1) / 2, -1, 1) : 0;
        const s = big * look * (0.3 + 0.7 * clamp(h.speed / 3, 0, 1)) * (h.stalk ? 0.4 : 1) * (1 - 0.6 * cov) * Math.exp(-d / (h.big ? 17 : 11)) * (1 + 0.8 * Math.max(0, close) - 0.5 * Math.max(0, -close)) * p.nerve;
        if (s > ws) { ws = s; worst = { ...h, d }; }
      }
      if (worst) { p.alert = Math.min(1.6, p.alert + ws * dt * 1.6); p.look = { x: worst.x, z: worst.z }; if (worst.d < (worst.big ? (worst.stalk ? 7 * (1 - 0.4 * (T.coverAt ? T.coverAt(worst.x, worst.z) : 0)) : 14) : 5)) p.alert = 1.6; }
      p.alert = Math.max(0, p.alert - dt * (p.state === 'flee' ? 0.04 : 0.12));
      if (p.state !== 'flee' && p.alert > 1 && worst) {
        if (p.react === undefined) p.react = R.range(0.12, p.head > 0.5 ? 1.0 : 0.4);
        p.react -= dt; if (p.react <= 0) { p.react = undefined; this._bolt(p, worst); }
      } else if (p.state === 'flee') p.react = undefined;
      if (p.state === 'flee') {
        for (const q of A) if (q !== p && q.state !== 'flee' && Math.hypot(q.x - p.x, q.z - p.z) < 30 && R() < dt * 6) this._bolt(q, p.flee);   // panic spreads
        p.fleeT -= dt; if (worst && worst.d < 35) { p.fleeT = Math.max(p.fleeT, 2); p.flee = { x: worst.x, z: worst.z }; }
        if (p.fleeT <= 0) { p.state = 'alert'; p.t = 0; }
      } else if (p.state === 'alert' || p.alert > 0.35) {
        if (p.state !== 'alert') { p.state = 'alert'; p.t = 0; }
        if (p.alert < 0.2 && p.t > 4) p.state = 'graze';
      } else p.state = 'graze';

      // where to go
      let hx, hz, vT;
      if (p.state === 'flee') {
        const away = bearing(p.x - p.flee.x, p.z - p.flee.z);
        if (R() < dt * 0.7) p.zig = R.range(-0.7, 0.7);
        const hd = away + p.zig; hx = Math.sin(hd); hz = Math.cos(hd);
        vT = PREY.run * lerp(0.55, 1, p.stamina) * (0.9 + 0.1 * p.nerve);
        p.stamina = Math.max(0, p.stamina - dt / 30);
      } else if (p.state === 'alert') {
        hx = 0; hz = 0; vT = 0;
        if (p.look) { const b = bearing(p.look.x - p.x, p.look.z - p.z); p.yaw += clamp(wrap(b - p.yaw), -1.5 * dt, 1.5 * dt); }
      } else {
        p.stamina = Math.min(1, p.stamina + dt / 40);
        p.wander += R.range(-1, 1) * dt * 0.8;
        hx = Math.sin(p.wander) * 0.8; hz = Math.cos(p.wander) * 0.8;
        const dc = Math.hypot(cx - p.x, cz - p.z); if (dc > 7) { hx += (cx - p.x) / dc * 0.8; hz += (cz - p.z) / dc * 0.8; }
        const dh = Math.hypot(this.home.x - p.x, this.home.z - p.z), hr = this.pastures ? this.home.r * 0.75 : 25, off = dh > hr + 6;
        if (dh > hr) { const k = off ? 1.2 : 0.4; hx += (this.home.x - p.x) / dh * k; hz += (this.home.z - p.z) / dh * k; }
        vT = p.head > 0.5 && !off ? 0 : PREY.walk * (off ? 1.6 : 0.6 + 0.4 * Math.sin(p.t * 0.3 + p.id));      // off the pasture they walk on, heads up
        // grazing: heads go down, and come up to look round
        p.nextHead -= dt; if (p.nextHead <= 0) { p.headT = p.headT > 0.5 ? 0 : 1; p.nextHead = p.headT ? R.range(2, 7) : R.range(1.5, 4); }
      }
      // keep apart, keep off rock, stay inside the fence
      for (const q of A) if (q !== p) { const dx = p.x - q.x, dz = p.z - q.z, d = Math.hypot(dx, dz); if (d < 2.2 && d > 0) { hx += dx / d * (2.2 - d); hz += dz / d * (2.2 - d); } }
      for (const o of T.obstaclesNear ? T.obstaclesNear(p.x, p.z, 4) : T.obstacles) { const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz) - o.r; if (d < 4) { hx += dx / (d + o.r) * (4 - d) * 0.8; hz += dz / (d + o.r) * (4 - d) * 0.8; } }
      const rr = Math.hypot(p.x, p.z); if (rr > T.arena - 10) { hx -= p.x / rr * (rr - T.arena + 10) * 0.3; hz -= p.z / rr * (rr - T.arena + 10) * 0.3; }
      if (Math.hypot(hx, hz) > 0.05) { const b = bearing(hx, hz), turn = p.state === 'flee' ? 3.2 : 1.2; p.yaw += clamp(wrap(b - p.yaw), -turn * dt, turn * dt); }
      p.v += clamp(vT - p.v, -7 * dt, (p.state === 'flee' ? 6.5 : 2) * dt);
      const wade = T.speedFactor ? T.speedFactor(p.x, p.z, 'prey') : 1;
      p.x += Math.sin(p.yaw) * p.v * wade * dt; p.z += Math.cos(p.yaw) * p.v * wade * dt;
      if (T.pushOut) T.pushOut(p, 0.5, p.y, p.y + 2, 2);
      const r2 = Math.hypot(p.x, p.z), lim = T.arena + 8; if (r2 > lim) { p.x *= lim / r2; p.z *= lim / r2; }
      p.head += ((p.state === 'graze' ? p.headT : 0) - p.head) * Math.min(1, dt * 2.5);
      p.phase += dt * (p.v > 0.1 ? 2 * Math.PI * p.v / lerp(1.0, 3.4, clamp(p.v / PREY.run, 0, 1)) : 0);
      p.tail += ((p.state === 'alert' ? Math.sin(p.t * 9) * 0.3 : 0) - p.tail) * Math.min(1, dt * 6);
    }
  }
  snapshot() { return this.alive.map((p) => ({ id: p.id, x: p.x, y: p.y + PREY.hip, z: p.z, vx: Math.sin(p.yaw) * p.v, vz: Math.cos(p.yaw) * p.v, speed: p.v, state: p.state })); }
}
