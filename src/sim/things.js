// Objects in the world the animal can sense and act on: thrown stones, flares, meat, carcasses.
// Thrown things fly ballistically, bounce off the ground and off the animal's body, and come to
// rest. Every impact is a sound with a loudness set by how hard it hit; a hit on the animal is felt.
// Deterministic given the same throws; no renderer here.
import { clamp } from '../math.js';
import { tune } from '../rex/tune.js';      // tune

const G = 9.81;
const KIND = {
  stone: { r: 0.09, e: 0.38, mu: 0.6, loud: 0.42 },
  flare: { r: 0.1, e: 0.2, mu: 0.45, loud: 0.12, burn: 45 },
  meat: { r: 0.22, e: 0.04, mu: 0.25, loud: 0.06, amount: 1 },
  carcass: { r: 0.6, e: 0, mu: 0, loud: 0, amount: 3 },
};
tune('Player', 'Flare burn time (s)', KIND.flare, 'burn', 5, 240, 1, null, 'flare.burn', 'next flare');      // tune

export class Things {
  constructor(terrain) {
    this.T = terrain; this.list = []; this.events = []; this.nextId = 1; this.t = 0;
  }

  /** Launch from (x, y, z) to land near (tx, tz): a lob whose flight time grows with distance. */
  throw(kind, x, y, z, tx, tz, by = 'you', aimY = null) {
    const ty = aimY ?? this.T.height(tx, tz), D = Math.hypot(tx - x, tz - z), T = 0.45 + D * 0.021;
    const k = KIND[kind];
    const o = { id: this.nextId++, kind, x, y, z, vx: (tx - x) / T, vy: (ty - y + 0.5 * G * T * T) / T, vz: (tz - z) / T,
      rest: false, age: 0, from: { x, y, z }, by, bounces: 0, spin: 0, burn: k.burn || 0, amount: k.amount || 0, hitRex: false };
    this.list.push(o);
    if (kind === 'flare') this.events.push({ type: 'ignite', id: o.id, x, y, z });
    return o;
  }
  place(kind, x, z, extra = {}) {
    const k = KIND[kind];
    const o = { id: this.nextId++, kind, x, y: this.T.height(x, z) + k.r, z, vx: 0, vy: 0, vz: 0, rest: true, age: 0, from: { x, y: 0, z }, by: 'world', bounces: 0, spin: 0, burn: k.burn || 0, amount: k.amount || 0, ...extra };
    this.list.push(o); return o;
  }
  remove(id) { const i = this.list.findIndex((o) => o.id === id); if (i >= 0) this.list.splice(i, 1); }
  get(id) { return this.list.find((o) => o.id === id); }

  /** The animal's body as capsules, from the pose: what a stone can strike. */
  _bodySegs(sim) {
    const sp = sim.spine, segs = [];
    const R = (i) => (i <= 12 ? 0.18 + 0.75 * (i / 12) : i <= 18 ? 1.25 : 0.62);
    for (let i = 2; i < 25; i++) segs.push([sp[i].p, sp[i + 1].p, (R(i) + R(i + 1)) / 2, i <= 12 ? 'tail' : i <= 18 ? 'flank' : 'neck']);
    segs.push([sim.head.pos, { x: sim.head.pos.x + sim.head.f.x * 1.5, y: sim.head.pos.y + sim.head.f.y * 1.5, z: sim.head.pos.z + sim.head.f.z * 1.5 }, 0.5, 'head']);
    const v = sim.pose.v;
    for (let k = 0; k < 2; k++) {
      const o = (55 + k * 6) * 3, P = (j) => ({ x: v[o + j * 3], y: v[o + j * 3 + 1], z: v[o + j * 3 + 2] });
      segs.push([P(0), P(1), 0.45, 'thigh'], [P(1), P(2), 0.25, 'leg']);
    }
    return segs;
  }

  step(dt, sim) {
    this.t += dt;
    const T = this.T;
    let segs = null;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i], k = KIND[o.kind];
      o.age += dt;
      if (o.kind === 'flare' && o.burn > 0) { o.burn -= dt; if (o.burn <= 0) this.events.push({ type: 'burnout', id: o.id, x: o.x, y: o.y, z: o.z }); }
      if (o.hand) continue;      // held in someone's hand: the arena carries it
      if (o.rest) {
        o.y = T.height(o.x, o.z) + k.r;
        if (o.kind === 'stone' && o.age > 120) this.list.splice(i, 1);
        else if (o.kind === 'flare' && o.burn <= 0 && o.age > 90) this.list.splice(i, 1);
        else if ((o.kind === 'meat' || o.kind === 'carcass') && o.amount <= 0 && o.age > 5) { this.list.splice(i, 1); this.events.push({ type: 'eaten', id: o.id, kind: o.kind, x: o.x, z: o.z, prey: o.prey }); }
        continue;
      }
      o.vy -= G * dt; o.vx *= 1 - 0.01 * dt; o.vz *= 1 - 0.01 * dt;
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt; o.spin += dt * Math.hypot(o.vx, o.vz) * 3;
      // the animal's body
      if (!o.hitRex || o.age - o.hitRex > 0.3) {
        segs = segs || this._bodySegs(sim);
        for (const [A, B, rad, part] of segs) {
          const ax = B.x - A.x, ay = B.y - A.y, az = B.z - A.z, L2 = ax * ax + ay * ay + az * az || 1;
          const t = clamp(((o.x - A.x) * ax + (o.y - A.y) * ay + (o.z - A.z) * az) / L2, 0, 1);
          const cx = A.x + ax * t, cy = A.y + ay * t, cz = A.z + az * t, dx = o.x - cx, dy = o.y - cy, dz = o.z - cz, d = Math.hypot(dx, dy, dz);
          if (d < rad + k.r) {
            const nx = dx / (d || 1), ny = dy / (d || 1), nz = dz / (d || 1), vn = o.vx * nx + o.vy * ny + o.vz * nz;
            if (vn < 0) {
              const speed = Math.hypot(o.vx, o.vy, o.vz);
              this.events.push({ type: 'hit', id: o.id, kind: o.kind, part, x: o.x, y: o.y, z: o.z, vx: o.vx, vy: o.vy, vz: o.vz, speed, from: o.from, by: o.by });
              o.vx -= 1.4 * vn * nx; o.vy -= 1.4 * vn * ny; o.vz -= 1.4 * vn * nz; o.vx *= 0.5; o.vy *= 0.5; o.vz *= 0.5;
              o.hitRex = o.age;
            }
            o.x = cx + nx * (rad + k.r); o.y = cy + ny * (rad + k.r); o.z = cz + nz * (rad + k.r);
            break;
          }
        }
      }
      // rock outcrops and trunks
      for (const ob of T.obstacles) {
        const solid = ob.kind === 'tree' || ob.kind === 'wall', dx = o.x - ob.x, dz = o.z - ob.z, d = Math.hypot(dx, dz), top = T.height(ob.x, ob.z) + ob.h * (solid ? 1 : 0.8);
        if (d < ob.r * (solid ? 1.05 : 0.85) && o.y < top) {
          const nx = dx / (d || 1), nz = dz / (d || 1), vn = o.vx * nx + o.vz * nz;
          if (vn < 0) { this._impact(o, -vn, k); o.vx -= (1 + k.e) * vn * nx; o.vz -= (1 + k.e) * vn * nz; }
          o.x = ob.x + nx * ob.r * (solid ? 1.05 : 0.85); o.z = ob.z + nz * ob.r * (solid ? 1.05 : 0.85);
        }
      }
      // the ground
      const gy = T.height(o.x, o.z) + k.r;
      if (o.y < gy) {
        const n = T.normal(o.x, o.z, { x: 0, y: 1, z: 0 }), vn = o.vx * n.x + o.vy * n.y + o.vz * n.z;
        o.y = gy;
        if (vn < 0) {
          this._impact(o, -vn, k);
          o.vx -= (1 + k.e) * vn * n.x; o.vy -= (1 + k.e) * vn * n.y; o.vz -= (1 + k.e) * vn * n.z;
          const f = 1 - k.mu * Math.min(1, 3 / (1 + o.bounces)); o.vx *= f; o.vz *= f;     // first touch skids, later ones roll
          o.bounces++;
        }
        // resting: friction and slope roll until it is barely moving
        o.vx += n.x * G * dt * 0.6; o.vz += n.z * G * dt * 0.6;
        o.vx *= 1 - Math.min(1, 3.5 * dt); o.vz *= 1 - Math.min(1, 3.5 * dt);
        if (Math.hypot(o.vx, o.vy, o.vz) < 0.35 && o.bounces > 0) { o.rest = true; o.vx = o.vy = o.vz = 0; }
      }
    }
  }
  _impact(o, speed, k) {
    if (speed < 1.1) return;
    const loud = k.loud * clamp(speed / 9, 0.15, 1.2);
    this.events.push({ type: 'impact', id: o.id, kind: o.kind, x: o.x, y: o.y, z: o.z, speed, loud, first: o.bounces === 0 });
  }

  /** A footfall can stamp out a flare. */
  footfall(x, z) {
    for (const o of this.list) if (o.kind === 'flare' && o.burn > 0 && o.rest && Math.hypot(o.x - x, o.z - z) < 0.9) { o.burn = 0; this.events.push({ type: 'stamped', id: o.id, x: o.x, y: o.y, z: o.z }); }
  }

  /** What the mind gets: positions and the properties it can sense. */
  snapshot() {
    return this.list.map((o) => {
      const lit = o.kind === 'flare' && o.burn > 0;
      const edible = o.kind === 'meat' || o.kind === 'carcass';
      return {
        id: o.id, kind: o.kind, x: o.x, y: o.y, z: o.z, speed: Math.hypot(o.vx, o.vy, o.vz), rest: o.rest,
        bright: lit ? clamp(o.burn / 4, 0, 1) : 0, hot: lit, edible, missile: o.kind === 'stone',
        scent: edible ? Math.min(1, 0.35 + 0.65 * o.amount / 2) * (o.amount > 0 ? 1 : 0) : 0, amount: o.amount,
        by: o.by, hand: o.hand || null, vx: o.vx, vz: o.vz,
      };
    });
  }
}
