// Small scalar helpers shared by the simulation and the view.
export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
/** Smoothstep that also accepts a > b (falling edge). */
export const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const wrap = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
/** Fraction to move toward a target this tick for a first-order lag with time constant tau. */
export const expK = (dt, tau) => 1 - Math.exp(-dt / tau);

/** Second-order spring toward a moving target (semi-implicit Euler). */
export class Spring {
  constructor(x = 0) { this.x = x; this.v = 0; }
  step(target, wn, zeta, dt) {
    const a = wn * wn * (target - this.x) - 2 * zeta * wn * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

/** Deterministic PRNG (mulberry32). The simulation never calls Math.random. */
export function makeRng(seed) {
  let s = seed >>> 0;
  const f = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a, b) => a + (b - a) * f();
  return f;
}

// Heading convention: yaw 0 faces +Z, positive yaw turns left (toward +X). Y is up.
export const fwdX = (yaw) => Math.sin(yaw);
export const fwdZ = (yaw) => Math.cos(yaw);
export const leftX = (yaw) => Math.cos(yaw);
export const leftZ = (yaw) => -Math.sin(yaw);
export const bearing = (dx, dz) => Math.atan2(dx, dz);
