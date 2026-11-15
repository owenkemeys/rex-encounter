// Headless stand-ins for Saltline's NPCs (robot hounds and gull drones), close to the original game's numbers
// (ref/saltline_orig.html: hound hp 140, 0.72 m stand height + turret, runs 4.5 m/s, lunges 9.5 m/s at 3 m, bursts of 4 x 5 dmg;
// gull hp 45, radius 0.9, hovers 4-8 m up, up to 8 m/s, bursts of 3 bolts x 7 dmg, a lens glow and a strobe).
// In Saltline their AI targets only the player; here a scenario can point them at the animal (`hostile`) to test harassment.
// Produces world.creatures (physical properties only, the contract in src/sim/others.js), noises and hits.
import { makeRng } from '../src/math.js';

export class Npcs {
  constructor(T, list, seed = 1) {
    this.T = T; this.R = makeRng(seed * 977 + 5); this.list = []; this.kills = []; this.shots = 0; this.hitsOnRex = 0; this.t = 0;
    for (const s of list) this.add(s);
  }
  add(s) {
    const n = { id: String(this.list.length + 1), type: s.type, x: s.x, z: s.z, y: s.type === 'gull' ? (s.alt ?? 6) : 0.55, vx: 0, vy: 0, vz: 0, alive: true, hp: s.type === 'gull' ? 45 : 140,
      mode: s.mode || 'idle', hostile: !!s.hostile, ang: this.R() * 6.283, alt: s.alt ?? 6, cool: 1 + this.R() * 2, burst: 0, bT: 0, dash: 0, dashT: 3 + this.R() * 3, stepAcc: 0, r: s.r ?? 12, home: { x: s.x, z: s.z } };
    this.list.push(n); return n;
  }
  _free(x, z, y0, y1, r = 0.45) {
    for (const q of this.T.boxes) if (!q.relief && x > q.x0 - r && x < q.x1 + r && z > q.z0 - r && z < q.z1 + r && y1 > q.y0 && y0 < (q.top ?? q.y1)) return false;
    const R = this.T.rect; if (R && (x < R.x0 || x > R.x1 || z < R.z0 || z > R.z1)) return false;
    return true;
  }
  step(dt, sim, mind, you, out) {
    this.t += dt; const R = this.R;
    for (const n of this.list) {
      if (!n.alive) continue;
      const dx = sim.x - n.x, dz = sim.z - n.z, d = Math.hypot(dx, dz) || 1;
      let tx = n.x, tz = n.z, sp = 0;
      if (n.type === 'hound') {
        if (n.mode === 'idle') { n.ang += dt * 0.15; tx = n.home.x + Math.sin(n.ang) * 4; tz = n.home.z + Math.cos(n.ang) * 4; sp = 1.5; }
        else {
          // around the animal: hold a ring at r, now and then dash in at its feet and out again (Saltline's lunge speed)
          n.ang += dt * (0.25 + 0.1 * Math.sin(this.t * 0.3 + +n.id));
          n.dashT -= dt;
          if (n.dash > 0) { n.dash -= dt; tx = sim.x + Math.sin(n.ang * 3) * 1.5; tz = sim.z + Math.cos(n.ang * 3) * 1.5; sp = n.dash > 0.6 ? 9.5 : 4.5; if (d < 3) n.dash = Math.min(n.dash, 0.3); if (n.dash <= 0) { n.dashT = 4 + R() * 5; n.ang += 2.2; } }
          else { tx = sim.x + Math.sin(n.ang) * n.r; tz = sim.z + Math.cos(n.ang) * n.r; sp = n.mode === 'harass' ? 4.5 : 2.0; if (n.mode === 'harass' && n.dashT <= 0 && d < 16) n.dash = 1.4; }
        }
        const ddx = tx - n.x, ddz = tz - n.z, dd = Math.hypot(ddx, ddz);
        const vx = dd > 0.2 ? ddx / dd * sp : 0, vz = dd > 0.2 ? ddz / dd * sp : 0;
        let nx = n.x + vx * dt, nz = n.z + vz * dt;
        if (Math.hypot(sim.x - nx, sim.z - nz) < 2.2) { nx = n.x; nz = n.z; }      // never under its body
        if (this._free(nx, nz, 0.05, 0.9)) { n.vx = vx; n.vz = vz; n.x = nx; n.z = nz; }
        else if (this._free(nx, n.z, 0.05, 0.9)) { n.vx = vx; n.vz = 0; n.x = nx; } else if (this._free(n.x, nz, 0.05, 0.9)) { n.vx = 0; n.vz = vz; n.z = nz; } else { n.vx = n.vz = 0; n.ang += 0.5; }
        n.y = this.T.height(n.x, n.z) + 0.55;
        const v = Math.hypot(n.vx, n.vz); n.stepAcc += v * dt / 0.7;
        if (n.stepAcc > 1) { n.stepAcc = 0; out.noises.push({ x: n.x, y: n.y, z: n.z, loud: 0.06, kind: 'clank', src: 'n' + n.id }); }
      } else {
        // a drone: orbits the animal (or its home) at r, alt; now and then comes down and in (within its reach)
        n.ang += dt * 0.35; n.cool -= dt;
        const dip = n.mode !== 'idle' && Math.sin(this.t * 0.11 + +n.id * 2) > 0.8;
        const cx = n.mode === 'idle' ? n.home.x : sim.x, cz = n.mode === 'idle' ? n.home.z : sim.z, rr = dip ? 4.5 : n.r;
        tx = cx + Math.sin(n.ang) * rr; tz = cz + Math.cos(n.ang) * rr; const ty = this.T.height(tx, tz) + (dip ? 4.2 : n.alt);
        const ddx = tx - n.x, ddz = tz - n.z, ddy = ty - n.y, dd = Math.hypot(ddx, ddy, ddz), vm = Math.min(6, dd * 1.5);
        n.vx = dd > 0.05 ? ddx / dd * vm : 0; n.vz = dd > 0.05 ? ddz / dd * vm : 0; n.vy = dd > 0.05 ? ddy / dd * vm : 0;
        const nx = n.x + n.vx * dt, nz = n.z + n.vz * dt, ny = n.y + n.vy * dt;
        if (this._free(nx, nz, ny - 0.3, ny + 0.3, 0.9)) { n.x = nx; n.z = nz; n.y = ny; } else { n.y += 2 * dt; n.vy = 2; }
      }
      // fire at the animal (hostile ones): a burst, each round a hit on the body unless something solid is in the way
      if (n.hostile && n.mode !== 'idle' && d < (n.type === 'gull' ? 30 : 18) && d > 4) {
        n.cool -= dt;
        if (n.cool <= 0 && n.burst <= 0) { n.burst = n.type === 'gull' ? 3 : 4; n.bT = 0; }
        if (n.burst > 0) {
          n.bT -= dt;
          if (n.bT <= 0) {
            n.burst--; n.bT = n.type === 'gull' ? 0.12 : 0.11; this.shots++;
            out.noises.push({ x: n.x, y: n.y, z: n.z, loud: 0.8, kind: 'bang', src: 'n' + n.id });
            const tg = sim.spine[18] ? sim.spine[18].p : { x: sim.x, y: 2.5, z: sim.z };
            if (R() < (n.type === 'gull' ? 0.6 : 0.7) && mind.los(n.x, n.y, n.z, tg.x, tg.y, tg.z)) {
              const ux = tg.x - n.x, uy = tg.y - n.y, uz = tg.z - n.z, ul = Math.hypot(ux, uy, uz) || 1, dmg = n.type === 'gull' ? 7 : 5, k = dmg / 26;
              out.hits.push({ type: 'hit', id: -1, kind: 'bullet', missile: true, part: 'body', x: tg.x, y: tg.y, z: tg.z, vx: ux / ul * 14 * k, vy: uy / ul * 14 * k, vz: uz / ul * 14 * k, speed: 14 * k, from: { x: n.x, z: n.z }, by: n.id, dmg });
              this.hitsOnRex++;
            }
            if (n.burst <= 0) n.cool = 1.8 + R() * 1.4;
          }
        }
      }
    }
  }
  /** world.creatures: physical properties only */
  creatures() {
    return this.list.filter((n) => n.alive).map((n) => n.type === 'hound'
      ? { id: n.id, x: n.x, y: n.y, z: n.z, vx: n.vx, vy: 0, vz: n.vz, h: 0.9, len: 1.0, ground: true, light: 0.2, shiny: true, loud: Math.hypot(n.vx, n.vz) > 3 ? 0.08 : 0.04, hard: true }
      : { id: n.id, x: n.x, y: n.y, z: n.z, vx: n.vx, vy: n.vy, vz: n.vz, h: 0.35, len: 1.0, ground: false, light: 0.8, loud: 0.06, shiny: true, hard: true });
  }
  kill(id) { const n = this.list.find((q) => 'n' + q.id === String(id) || q.id === String(id)); if (n && n.alive) { n.alive = false; this.kills.push({ id: n.id, type: n.type, t: +this.t.toFixed(1) }); return n; } return null; }
}
