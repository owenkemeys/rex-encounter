// A person's body while the animal is dealing with it: knocked flying, lying on the ground, pinned under a foot,
// held in the jaws, hurt, killed. While `free` the person moves themselves (the view's input) and this only follows them;
// in every other state this owns their position and suggests a first-person camera that sells it (tumble, being lifted,
// the view from between the teeth, the dark at the end). Struggling (any movement key, mashed) is the only input: it
// wriggles out from under a foot, works loose from the jaws, and gets you up off the ground. Lying still is what makes an
// animal that is not hungry lose interest. Deterministic: positions follow the simulated body; no clock, no randomness.
//
// ---- CONTRACT for the view / UI (arena.victim('you'), read every frame; everything here is plain data) ----------------
//   state      'free' | 'air' | 'down' | 'rising' | 'pinned' | 'held' | 'dead'
//   No attrition (binary outcomes): a shove, a knock-down, a nose, a foot, being held for a moment frighten and displace you but
//   leave nothing behind; a committed strike (peril.js, arena.js contact) kills at once. So these stay constant while alive:
//   health     1 alive, 0 dead.   injury 'none' | 'dead'.   slow 1 (no limp), canSprint true.   bleeding 0.
//   dead       true from the moment of death until respawn; deadT = arena time it happened; lives = 1 + respawns so far
//   cause      why you died: 'eaten' (killed by a hungry animal, which then eats), 'shaken' (worried in the jaws),
//              'crushed' (in its jaws), 'pinned' (crushed under its foot), 'bitten', 'thrown' (the landing after a toss or a
//              blow), 'butt' (its head), 'tail'; null while alive. `lastHurt` = { by, amt, t, motive } of the latest blow.
//   cam        first-person camera suggestion { x, y, z, yaw, pitch, roll, eye, free, mouth, shake, dark }; dark goes to 1
//              over ~2.5 s after death (fade the end card in on it)
//   Events (arena.events, src 'victim'): knocked, landed, seized, pinned, unpinned, wriggled, tossed, dropped, slipped, up,
//              hurt { amt, by, health, injury }, injury { injury } (when the injury word changes), death { cause, motive,
//              by, x, y, z }, respawn { x, z }.
//   who        this life's identity ('you#1', 'you#2'...): reported to the animal as `agent.who`. Each life is a new individual.
//   Respawn: main.js `act.respawn()` (or arena.respawn('you', x, z)) returns you whole at a start point away from the animal,
//              as a new individual: it forgets the dead one's habits, tricks, grudge and verdict and meets you afresh, keeping
//              only a modest prior about small things in general (mind.js `kind`). If it killed you hungry, your body stays behind as
//              something it eats (a things 'carcass' with `of: 'you'`).
// ------------------------------------------------------------------------------------------------------------------------
import { clamp, lerp, wrap, bearing, expK } from '../math.js';

const G = 9.81, EYE = 1.7, LIE = 0.28;

export class Victim {
  constructor(id) {
    this.id = id; this.state = 'free'; this.t = 0; this.x = 0; this.y = 0; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0;
    this.pulse = 0; this.struggle = 0; this.still = 0; this.escape = 0; this.events = []; this.grip = null; this.foot = -1;
    this.cam = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, eye: EYE, free: true, mouth: 0, shake: 0, dark: 0 };
    this.spin = { yaw: 0, pitch: 0, roll: 0 }; this.lying = 0; this.handled = 0; this.lastBy = null;
    this.health = 1; this.injury = 'none'; this.slow = 1; this.canSprint = true; this.bleeding = 0; this.dead = false; this.deadT = null; this.cause = null; this.lastHurt = null; this.lives = 1; this.clock = 0; this.gone = false; this.who = id + '#1';
  }
  get free() { return this.state === 'free'; }
  /** The person pushes, kicks, scrambles: one press of a movement key (or a held key, once per tick at a fraction). */
  input(k = 1) { if (!this.dead) this.pulse += k; }
  /** A blow, a bite, a crushing weight: `by` names what did it (the cause of death if it kills). */
  /** A blow that does not kill: it frightens and displaces (the knock, the pin, the grip do that), and leaves no lasting
   *  penalty. Reported (`hurt` event, amt) so the view can flash and thump; nothing accumulates. */
  hurt(amt, by, motive = null) {
    if (this.dead || !(amt > 0)) return;
    this.lastHurt = { by, amt, t: this.clock, motive };
    if (amt > 0.02) this.events.push({ type: 'hurt', id: this.id, amt, by, health: 1, injury: 'none', x: this.x, y: this.y, z: this.z });
  }
  /** The committed strike: dead at once. */
  kill(by, motive = null) { if (this.dead) return; this.lastHurt = { by, amt: 1, t: this.clock, motive }; this.die(by, motive); }
  die(cause, motive = null) {
    if (this.dead) return;
    this.dead = true; this.deadT = this.clock; this.cause = cause; this.health = 0; this.struggle = 0; this.pulse = 0;
    this.events.push({ type: 'death', id: this.id, cause, motive, by: this.lastHurt ? this.lastHurt.by : cause, x: this.x, y: this.y, z: this.z });
    this._to('dead');
  }
  /** A new life at (x, z): whole, on your feet, and a new individual (`who`). */
  respawn(x, z, T) {
    this.dead = false; this.deadT = null; this.cause = null; this.health = 1; this.bleeding = 0; this.lastHurt = null; this.grip = null; this.foot = -1; this.gone = false;
    this.x = x; this.z = z; this.y = T ? T.height(x, z) : this.y; this.vx = this.vy = this.vz = 0; this.struggle = 0; this.still = 0; this.escape = 0; this.slide = null; this.lives++; this.who = this.id + '#' + this.lives;
    const C = this.cam; C.roll = 0; C.dark = 0; C.mouth = 0; C.shake = 0; C.eye = EYE; C.free = true;
    this._to('free'); this.events.push({ type: 'respawn', id: this.id, x, z });
  }
  _to(state) { if (state === this.state) return; this.events.push({ type: 'victim', from: this.state, to: state, id: this.id, x: this.x, y: this.y, z: this.z }); this.state = state; this.t = 0; this.escape = 0; }

  /** Thrown or struck: the body leaves the ground with this velocity and tumbles. */
  knock(vx, vy, vz, by = 'body', spin = 1) {
    if (this.state === 'held' || this.state === 'pinned' || this.dead) return false;
    this.vx = vx; this.vy = Math.max(vy, 1.2); this.vz = vz; this.lastBy = by;
    const sp = Math.hypot(vx, vz) || 1;
    this.spin = { yaw: (vx * this.cam.z - vz * this.cam.x > 0 ? 1 : -1) * 0.8 * spin, pitch: -2.5 * spin * clamp(sp / 6, 0.4, 1.4), roll: (vx > 0 ? 1 : -1) * 3.2 * spin * clamp(sp / 6, 0.4, 1.3) };
    this.events.push({ type: 'knocked', id: this.id, by, speed: Math.hypot(vx, vy, vz), x: this.x, y: this.y, z: this.z });
    this._to('air'); this.handled++;
    return true;
  }
  seize(grip) { if (this.state === 'held' || this.dead) return false; this.grip = grip; this.foot = -1; this._to('held'); this.handled++; this.events.push({ type: 'seized', id: this.id, x: this.x, y: this.y, z: this.z }); return true; }
  pin(foot) { if (this.dead || this.state !== 'down' && this.state !== 'rising') return false; this.foot = foot; this._to('pinned'); this.handled++; this.events.push({ type: 'pinned', id: this.id, x: this.x, y: this.y, z: this.z }); return true; }
  /** Let go from the jaws with the head's velocity (a drop) or more (a toss). */
  release(vx, vy, vz, how = 'drop') {
    if (this.dead && this.grip) { this.grip = null; this.vx = vx; this.vz = vz; return true; }
    if (this.state !== 'held') return false;
    this.grip = null; this.vx = vx; this.vy = vy; this.vz = vz;
    const sp = Math.hypot(vx, vy, vz);
    this.spin = { yaw: 0.6 * Math.sign(vx || 1), pitch: -1.5 - 0.25 * sp, roll: (vz > 0 ? 1 : -1) * (1.5 + 0.35 * sp) };
    this.events.push({ type: how === 'toss' ? 'tossed' : how === 'slip' ? 'slipped' : 'dropped', id: this.id, speed: sp, x: this.x, y: this.y, z: this.z });
    this._to('air'); return true;
  }

  /** One fixed step. `agent` is the person as the view moves them (used while free); `sim` is the animal's body. */
  step(dt, agent, sim, T) {
    this.t += dt; this.clock += dt;
    // healing: slowly, once nothing has hurt you for a while and nothing has hold of you; bite wounds stop bleeding
    if (!this.dead) {
      this.health = 1; this.bleeding = 0; this.injury = 'none'; this.slow = 1; this.canSprint = true;
    } else { this.injury = 'dead'; this.slow = 0; this.canSprint = false; }
    // struggling: presses become a 0..1 effort that decays; lying still is counted
    this.struggle = clamp(this.struggle + this.pulse * 0.2 - this.struggle * dt * 1.6, 0, 1); this.pulse = 0;
    const moving = this.state === 'free' && agent && agent.speed > 0.25;
    this.still = this.struggle > 0.12 || moving ? 0 : this.still + dt;
    const C = this.cam, ground = (x, z) => T.height(x, z);
    switch (this.state) {
      case 'free': {
        if (agent) { this.x = agent.x; this.z = agent.z; this.y = agent.y - (agent.crouch ? 1.0 : EYE); this.vx = agent.vx || 0; this.vz = agent.vz || 0; this.vy = 0; C.x = agent.x; C.y = agent.y; C.z = agent.z; }
        C.free = true; C.roll = 0; C.mouth = 0; C.shake = 0; C.dark = 0; C.eye = EYE; this.lying = Math.max(0, this.lying - dt * 2);
        break;
      }
      case 'air': {
        this.vy -= G * dt; this.vx *= 1 - 0.05 * dt; this.vz *= 1 - 0.05 * dt;
        this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
        for (const o of T.obstacles || []) { const dx = this.x - o.x, dz = this.z - o.z, d = Math.hypot(dx, dz); if (d < o.r + 0.3 && this.y < ground(o.x, o.z) + o.h) { const nx = dx / (d || 1), nz = dz / (d || 1), vn = this.vx * nx + this.vz * nz; this.x = o.x + nx * (o.r + 0.3); this.z = o.z + nz * (o.r + 0.3); if (vn < 0) { this.vx -= 1.4 * vn * nx; this.vz -= 1.4 * vn * nz; } } }
        const g = ground(this.x, this.z);
        C.roll += this.spin.roll * dt; C.pitch += this.spin.pitch * dt; C.yaw += this.spin.yaw * dt;
        C.eye = 0.9; C.free = false; C.shake = Math.max(C.shake, 0.4); C.mouth = Math.max(0, C.mouth - dt * 3); C.dark = 0;
        this.lying = Math.min(1, this.lying + dt * 2);
        if (this.y <= g && this.vy < 0) {
          const sp = Math.hypot(this.vx, this.vy, this.vz);
          this.y = g; this.events.push({ type: 'landed', id: this.id, speed: sp, x: this.x, y: g, z: this.z });
          // a hard landing hurts: thrown down from the jaws, or sent flying by a blow
          if (sp > 5) this.hurt(Math.min(0.24, (sp - 5) * 0.035), 'thrown', this.lastMotive);
          if (this.dead) { this.y = g; this.vx = this.vy = this.vz = 0; break; }
          // a body bounces a little and slides; the tumble stops in a jumble
          if (-this.vy > 4.5 && this.t > 0.15) { this.vy = -this.vy * 0.22; this.vx *= 0.55; this.vz *= 0.55; this.spin.roll *= 0.5; this.spin.pitch *= -0.4; }
          else { this.vy = 0; this._to('down'); this.slide = { vx: this.vx * 0.5, vz: this.vz * 0.5 }; C.shake = 1; }
        }
        break;
      }
      case 'down': case 'rising': case 'pinned': {
        if (this.slide) { this.x += this.slide.vx * dt; this.z += this.slide.vz * dt; const k = Math.exp(-dt * 4); this.slide.vx *= k; this.slide.vz *= k; if (Math.hypot(this.slide.vx, this.slide.vz) < 0.05) this.slide = null; }
        if (this.state === 'pinned') {
          const f = sim.feet[this.foot];
          // a foot that lifts, or walks off, lets you go
          if (!f || !f.planted || Math.hypot(f.pos.x - this.x, f.pos.z - this.z) > 1.4) { this.events.push({ type: 'unpinned', id: this.id, x: this.x, y: this.y, z: this.z }); this.foot = -1; this._to('down'); break; }
          // wriggling out takes effort, more the harder it is pressing (frozen above you)
          this.escape += this.struggle * dt * (sim.freeze ? 0.3 : 0.55);
          C.shake = Math.max(C.shake * Math.exp(-dt * 3), 0.25 * this.struggle);
          if (this.escape >= 1 || this.t > 4.5) {
            const dx = this.x - f.pos.x, dz = this.z - f.pos.z, d = Math.hypot(dx, dz) || 1;
            this.slide = { vx: dx / d * 2.4, vz: dz / d * 2.4 };
            this.events.push({ type: 'wriggled', id: this.id, x: this.x, y: this.y, z: this.z }); this.foot = -1; this._to('down'); break;
          }
        } else if (this.state === 'down') {
          // up again: struggle once you have your wits back; while the animal is right over you it takes longer
          if (this.struggle > 0.15 && this.t > 0.7) this._to('rising');
        } else {
          if (this.t > 0.85) { this._to('free'); this.events.push({ type: 'up', id: this.id, x: this.x, y: this.y, z: this.z }); }
        }
        this.y = ground(this.x, this.z);
        const up = this.state === 'rising' ? clamp(this.t / 0.85, 0, 1) : 0, eu = up * up * (3 - 2 * up);
        C.eye = lerp(LIE, EYE, eu); C.free = true;
        // the camera rights itself as you come round: a tilt that eases off, a look up at what is over you
        C.roll += (lerp(this.state === 'pinned' ? 0.25 : 0.45 * Math.sign(C.roll || 1), 0, eu) - C.roll) * expK(dt, 0.35);
        // your eyes go to the animal: at once after a fall, and all the time while it stands over you
        const tgt = this.state === 'pinned' ? sim.spine[18].p : sim.head.pos, dx = tgt.x - this.x, dy = tgt.y - (this.y + C.eye), dz = tgt.z - this.z;
        const wy = Math.atan2(-dx, -dz), wp = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.6, 1.3), k = this.state === 'pinned' || this.t < 1.2 ? expK(dt, 0.25) : 0;
        C.yaw = wrap(C.yaw); C.pitch = wrap(C.pitch); C.yaw += wrap(wy - C.yaw) * k; C.pitch += (wp - C.pitch) * k;
        this.lying = 1 - eu; C.mouth = 0; C.dark = 0;
        C.shake *= Math.exp(-dt * 2.5);
        break;
      }
      case 'dead': {
        // the end: carried a moment longer if the jaws still have you, else where you fell; the light goes
        if (this.grip && sim) { const h = sim.head, L = sim.species.dims.headLen; this.x = h.pos.x + h.f.x * L * 0.62; this.z = h.pos.z + h.f.z * L * 0.62; this.y = Math.max(h.pos.y + h.f.y * L * 0.62 - 0.5, ground(this.x, this.z)); }
        else if (this.y > ground(this.x, this.z) + 0.05) { this.vy -= G * dt; this.y = Math.max(ground(this.x, this.z), this.y + this.vy * dt); this.x += this.vx * dt; this.z += this.vz * dt; if (this.y <= ground(this.x, this.z)) { this.vx = this.vz = this.vy = 0; } }
        else this.y = ground(this.x, this.z);
        C.free = false; C.mouth = Math.max(0, C.mouth - dt); C.shake *= Math.exp(-dt * 2); C.eye = this.grip ? 0 : LIE * 0.7;
        C.dark = Math.min(1, C.dark + dt / 2.5); C.roll += ((this.grip ? 1.2 : 0.6) - C.roll) * expK(dt, 1.5); this.lying = 1;
        if (!this.grip) { C.x = this.x; C.z = this.z; C.y = this.y + C.eye; } else { C.x = this.x; C.z = this.z; C.y = this.y + 0.4; }
        break;
      }
      case 'held': {
        // in the jaws, crosswise: where the teeth meet, a little below the line of the skull
        const h = sim.head, L = sim.species.dims.headLen, gx = h.pos.x + h.f.x * L * 0.62 - h.u.x * 0.22, gy = h.pos.y + h.f.y * L * 0.62 - h.u.y * 0.22, gz = h.pos.z + h.f.z * L * 0.62 - h.u.z * 0.22;
        const px = this.x, py = this.y, pz = this.z;
        this.x = gx; this.y = Math.max(gy - 0.3, ground(gx, gz) - 0.05); this.z = gz;
        if (this.t > dt) { this.vx = (this.x - px) / dt; this.vy = (this.y - py) / dt; this.vz = (this.z - pz) / dt; }
        // working loose: it is easier when the jaws are only carrying than when they are clamping and shaking
        const shaking = sim.act && (sim.act.kind === 'worry' || sim.act.kind === 'toss');
        this.escape = shaking ? Math.max(0, this.escape - dt * 0.45) : this.escape + this.struggle * dt * 0.42;      // between shakes, a fighter can work loose
        // the view from between the teeth: your head sticks out of one side of the mouth, looking out along it
        const side = 1, ox = h.l.x * side, oy = h.l.y * side, oz = h.l.z * side;
        C.x = gx + ox * 0.45 + h.u.x * 0.1; C.y = gy + oy * 0.45 + h.u.y * 0.1; C.z = gz + oz * 0.45 + h.u.z * 0.1;
        const lx = ox * 0.75 + h.f.x * 0.45 - h.u.x * 0.45, ly = oy * 0.75 + h.f.y * 0.45 - h.u.y * 0.45, lz = oz * 0.75 + h.f.z * 0.45 - h.u.z * 0.45;
        C.yaw = Math.atan2(-lx, -lz); C.pitch = Math.atan2(ly, Math.hypot(lx, lz)); C.roll = -Math.asin(clamp(h.u.y < 0 ? 0 : h.l.y, -1, 1)) * 0.5 + 0.9 + 0.3 * (sim.head.tilt ? sim.head.tilt.x : 0);
        C.eye = 0; C.free = false; C.mouth = 1; C.dark = 0.55; C.shake = shaking ? 1 : 0.2 + 0.2 * this.struggle;
        this.lying = 1;
        break;
      }
    }
    if (this.state !== 'held' && this.state !== 'air' && this.state !== 'dead') { C.x = this.x; C.z = this.z; C.y = this.y + C.eye; }
    if (this.state === 'air') { C.x = this.x; C.z = this.z; C.y = this.y + 0.5; }
  }
  /** What the animal can feel and see of you, merged into the agent the mind reads. */
  report(agent) {
    const a = agent ? { ...agent } : { id: this.id, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1 };
    if (this.state === 'dead') { a.x = this.x; a.z = this.z; a.y = this.y + 0.2; a.vx = a.vz = 0; a.speed = 0; a.crouch = true; a.torch = false; }
    else if (this.state !== 'free') {
      a.x = this.x; a.z = this.z; a.y = this.y + (this.state === 'held' ? 0 : this.state === 'air' ? 0.4 : this.state === 'rising' ? this.cam.eye * 0.6 : 0.25);
      a.vx = this.vx; a.vz = this.vz; a.speed = this.state === 'held' ? 0.6 * this.struggle : this.state === 'air' ? Math.hypot(this.vx, this.vz) : this.state === 'rising' ? 1 : 1.5 * this.struggle; a.crouch = true; a.torch = this.state === 'rising' ? a.torch : false;
    }
    a.who = this.who; a.state = this.state; a.struggle = this.struggle; a.still = this.dead ? 999 : this.still; a.escape = this.escape; a.handled = this.handled;
    a.hurt = 0; a.blood = 0; a.dead = this.dead; a.limping = false;
    return a;
  }
}
void bearing;
/** The word for how hurt you are. */
export const injuryOf = (h) => (h <= 0 ? 'dead' : h < 0.15 ? 'dying' : h < 0.35 ? 'wounded' : h < 0.6 ? 'hurt' : h < 0.85 ? 'bruised' : 'none');
