// Observe mode: the animal runs on its own mind. The director only decides where the camera
// stands, and now and then makes a small disturbance when nothing has happened for a while.
// The camera is a person standing still: the animal can discover it, come to inspect it,
// nudge it, snap at it. That is the point of watching from the ground.
import { makeRng, clamp, expK, bearing } from './math.js';

export class Director {
  constructor(terrain, seed = 21) {
    this.terrain = terrain; this.R = makeRng(seed);
    this.cam = { x: 0, y: 2, z: 30, lx: 0, ly: 3, lz: 0, cut: true, since: 0, occl: 0, fov: 40, yaw: 0 };
    this.quiet = 0; this.nextPoke = 30; this.noises = []; this.caption = '';
  }

  _spot(sim, mind) {
    // a place to stand: in front of or beside the animal, 22–38 m off, preferably near cover
    const R = this.R, T = this.terrain;
    let best = null, bs = -1e9;
    for (let k = 0; k < 24; k++) {
      const a = sim.psi + R.range(-1.6, 1.6), d = R.range(22, 38);
      let x = sim.x + Math.sin(a) * d, z = sim.z + Math.cos(a) * d;
      const r = Math.hypot(x, z); if (r > T.arena - 6) { x *= (T.arena - 6) / r; z *= (T.arena - 6) / r; }
      if (T.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 1.5) || (T.insideStructure && T.insideStructure(x, z))) continue;
      const y = T.height(x, z) + 1.7;
      let score = mind.los(x, y, z, sim.head.pos.x, sim.head.pos.y, sim.head.pos.z) ? 2 : -3;
      score += Math.cos(a - sim.psi) * 0.6 + R() * 0.8;
      if (score > bs) { bs = score; best = { x, z, y }; }
    }
    return best || { x: sim.x + 25, z: sim.z, y: T.height(sim.x + 25, sim.z) + 1.7 };
  }

  update(dt, sim, mind, camera) {
    const c = this.cam, R = this.R;
    dt = Math.max(0, dt || 0);
    // a framing gone bad (non-finite look point or lens) is re-established from scratch rather than eased from
    if (![c.lx, c.ly, c.lz, c.fov].every(Number.isFinite) || c.fov < 1 || c.fov > 179) { c.lx = sim.x; c.ly = sim.py.x; c.lz = sim.z; c.fov = 40; c.cut = true; }
    c.since += dt;
    const d = Math.hypot(sim.x - c.x, sim.z - c.z);
    const visible = mind.los(c.x, c.y, c.z, sim.head.pos.x, sim.head.pos.y, sim.head.pos.z) || mind.los(c.x, c.y, c.z, sim.x, sim.py.x, sim.z);
    c.occl = visible ? 0 : c.occl + dt;
    const engaged = mind.know.seen && mind.know.target && mind.know.target.id === 'observer';
    // move the camera only when the animal is lost from view, far away, or the shot has gone stale and nothing is happening to it
    // tooClose (a host's fixed cameras, main.js GATE): the animal right under the camera fills the shot; another mount is asked for
    if (!this.pinned && (c.cut || c.occl > 4 || d > 70 || (!engaged && c.since > 40 && R() < dt * 0.1) || (this.tooClose && this.mount && d < this.tooClose && c.since > 2))) {      // pinned: the open start's watcher is you, standing still
      const s = (this.mount && this.mount(sim, mind)) || this._spot(sim, mind); c.x = s.x; c.z = s.z; c.y = s.y; c.cut = true; c.since = 0; c.occl = 0; c.mount = this.mount ? s : null;      // mount: a host's fixed cameras (main.js GATE)
    }
    // disturbances: a stone falls somewhere near it after a quiet spell
    const calm = ['roam', 'pause', 'sniff'].includes(mind.label) && !mind.know.seen;
    this.quiet = calm ? this.quiet + dt : 0;
    this.noises.length = 0;
    if (this.quiet > this.nextPoke) {
      this.quiet = 0; this.nextPoke = R.range(25, 55);
      const a = R() * 6.283, dd = R.range(18, 40), r = R();
      // a stone falling somewhere, meat left upwind for it to find, or a flare burning in the grass
      if (r < 0.5) this.noises.push({ x: sim.x + Math.sin(a) * dd, y: 0, z: sim.z + Math.cos(a) * dd, loud: R.range(0.25, 0.45), kind: 'stone' });
      else this.drop = { kind: r < 0.78 ? 'meat' : 'flare', a, d: r < 0.78 ? R.range(50, 85) : R.range(20, 32) };
    }
    // framing: a long lens that keeps the animal's head and body in shot (or a mount's fixed look point, e.g. Lot B kids cam)
    const h = sim.head.pos, k = c.cut ? 1 : expK(dt, 0.35), lk = c.mount && c.mount.look;
    const gx = lk ? lk.x : sim.x * 0.4 + h.x * 0.6, gy = lk ? lk.y : sim.py.x * 0.45 + h.y * 0.55, gz = lk ? lk.z : sim.z * 0.4 + h.z * 0.6;
    c.lx += (gx - c.lx) * k; c.ly += (gy - c.ly) * k; c.lz += (gz - c.lz) * k;
    camera.position.set(c.x, c.y, c.z);
    camera.lookAt(c.lx, c.ly, c.lz);
    const dist = Math.hypot(c.lx - c.x, c.ly - c.y, c.lz - c.z);
    const fov = clamp(2 * Math.atan(6.5 / dist) * 57.3, 18, 70);
    c.fov += (fov - c.fov) * (c.cut ? 1 : expK(dt, 0.8)); camera.fov = c.fov; camera.updateProjectionMatrix();
    c.yaw = bearing(c.lx - c.x, c.lz - c.z);
    c.cut = false;
  }

  /** The camera as a person the animal may notice. */
  agent() {
    const c = this.cam;
    return { id: 'observer', x: c.x, y: c.y, z: c.z, vx: 0, vz: 0, speed: 0, crouch: false, fx: Math.sin(c.yaw), fz: Math.cos(c.yaw) };
  }
}
