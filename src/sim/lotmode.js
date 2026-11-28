// Lot B Escape Simulation (pure sim, no Three.js):
// - Reactive parked cars: live colliders, 4-corner spring-damper suspension rock, lateral skid on
//   rex impact, shock-sensor car alarms (triggered by E, flare impact, or rex bump), abandoned
//   open-door horn/high-beams, and spare flares in the Park Ranger SUV.
// - Two stranded kids executing a cover-to-cover escape from the stalled minivan to the exit gate,
//   submitted as real bodied agents into Arena so the rex's real mind spots them when they bolt.
import { clamp } from '../math.js';

const SPRING_K = 30, SPRING_C = 5.8;
const SKID_DRAG = 4.2, YAW_DRAG = 5.0;
const ALARM_DUR = 14, ALARM_PULSE = 0.75;
const HORN_DUR = 2.6, BEAMS_DUR = 18;
const KID_SPEED = 4.7;

export class LotMode {
  constructor(terrain, lot) {
    this.T = terrain;
    this.lot = lot;
    this.events = [];
    this.t = 0;
    this.status = 'active';      // 'active' | 'won' | 'lost' | 'heroic'
    this.statusAt = 0;
    this.alarmsTripped = 0;
    this.flaresGrabbed = 0;
    this.cars = lot.cars.map((c) => this._initCar(c));
    this.byId = new Map(this.cars.map((c) => [c.id, c]));
    this.stops = lot.stops;
    this.kids = this._initKids();
    this._registerColliders();
  }

  _initCar(c) {
    const y0 = this.T.height(c.x, c.z);
    return {
      ...c,
      x0: c.x, z0: c.z, yaw0: c.yaw, y: y0,
      pitch: 0, roll: 0, vPitch: 0, vRoll: 0,
      vx: 0, vz: 0, vYaw: 0,
      alarmT: 0, alarmAcc: 0,
      hornT: 0, beamsT: 0,
      bumpCD: 0,
      cols: [],
    };
  }

  _initKids() {
    const s0 = this.stops[0];
    const side = -this.lot.flip;      // start crouched on the kiosk/safe side of the stalled minivan
    return [0, 1].map((i) => ({
      id: `kid${i + 1}`,
      name: i === 0 ? 'Visitor A' : 'Visitor B',
      scale: i === 0 ? 0.78 : 0.71,
      jacket: i === 0 ? 0xd9a826 : 0x2c8c8a,
      stop: 0,
      state: 'cover',      // 'cover' | 'sprint' | 'escaped' | 'dead'
      x: s0.x + side * (1.5 + i * 0.7),
      z: s0.z + (i === 0 ? -0.6 : 0.7),
      vx: 0, vz: 0, yaw: 0,
      crouch: true, eye: 0.85,
      stepT: 0, waitT: 2.0 + i * 0.45,
      commitT: 0,
    }));
  }

  _carColliderPts(c) {
    const s = Math.sin(c.yaw), co = Math.cos(c.yaw), hl = c.l * 0.34, r = c.w * 0.52;
    return [-hl, 0, hl].map((u) => ({ x: c.x + s * u, z: c.z + co * u, r }));
  }

  _registerColliders() {
    const T = this.T;
    for (const c of this.cars) {
      const pts = this._carColliderPts(c);
      c.cols = pts.map((p) => ({ x: p.x, z: p.z, r: p.r, top: c.y + c.h, kind: 'wall', car: c.id }));
      if (T.addDynamicColliders) T.addDynamicColliders(c.cols);
      else for (const col of c.cols) T.colliders.push(col);
    }
  }

  _syncColliders(c) {
    const pts = this._carColliderPts(c);
    for (let i = 0; i < c.cols.length; i++) {
      c.cols[i].x = pts[i].x;
      c.cols[i].z = pts[i].z;
      c.cols[i].top = c.y + c.h;
    }
    if (this.T.refreshDynamicColliders) this.T.refreshDynamicColliders(c.cols);
  }

  reset() {
    this.t = 0; this.events.length = 0; this.status = 'active'; this.statusAt = 0;
    this.alarmsTripped = 0; this.flaresGrabbed = 0;
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i], src = this.lot.cars[i];
      c.x = c.x0; c.z = c.z0; c.yaw = c.yaw0; c.y = this.T.height(c.x, c.z);
      c.pitch = c.roll = c.vPitch = c.vRoll = c.vx = c.vz = c.vYaw = 0;
      c.alarmT = c.alarmAcc = c.hornT = c.beamsT = c.bumpCD = 0;
      c.alarmLeft = src.alarmLeft; c.flaresLeft = src.flaresLeft || 0;
      c.hazards = src.hazards; c.lightsOn = src.lightsOn;
      this._syncColliders(c);
    }
    this.kids = this._initKids();
  }

  /** Rock a car on its suspension and optionally shove it sideways. */
  impactCar(c, ix, iz, strength, byRex = false) {
    const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
    const along = ix * s + iz * co, across = ix * co - iz * s;
    c.vPitch = clamp(c.vPitch + along * 0.55 * strength, -2.4, 2.4);
    c.vRoll = clamp(c.vRoll + across * 0.85 * strength, -2.8, 2.8);
    if (byRex && strength > 0.7) {
      const push = clamp((strength - 0.6) * 2.1, 0, 5.2);
      c.vx += ix * push;
      c.vz += iz * push;
      c.vYaw += (across * 0.25) * clamp(strength * 0.5, 0, 1.4);
      this.events.push({ src: 'lot', type: 'carCrunch', id: c.id, x: c.x, y: c.y + 0.9, z: c.z, strength });
    }
  }

  tripAlarm(c, noises, byPlayer = false) {
    if (c.alarmT > 1 || c.alarmLeft <= 0) return false;
    c.alarmLeft--;
    c.alarmT = ALARM_DUR;
    c.alarmAcc = 0;
    c.hazards = true;
    this.alarmsTripped++;
    this.impactCar(c, 0.3, 0.4, 0.65, false);
    noises.push({ x: c.x, y: c.y + 1.1, z: c.z, loud: 0.9, kind: 'alarm', you: byPlayer });
    this.events.push({ src: 'lot', type: 'carAlarm', id: c.id, x: c.x, y: c.y + 1.1, z: c.z });
    return true;
  }

  blastHorn(c, noises) {
    c.hornT = HORN_DUR;
    c.beamsT = BEAMS_DUR;
    c.lightsOn = true;
    this.impactCar(c, 0, 0.25, 0.35, false);
    noises.push({ x: c.x, y: c.y + 1.1, z: c.z, loud: 0.95, kind: 'horn', you: true });
    this.events.push({ src: 'lot', type: 'carHorn', id: c.id, x: c.x, y: c.y + 1.1, z: c.z });
    return true;
  }

  /** Contextual interact prompt (E) near a car, or null. */
  interactable(you) {
    let best = null, bd = 3.2;
    for (const c of this.cars) {
      const d = Math.hypot(c.x - you.x, c.z - you.z) - Math.max(c.w, c.l) * 0.38;
      if (d > bd) continue;
      if (c.hasFlares && c.flaresLeft > 0) { bd = d; best = { car: c, label: 'grab spare flares', action: 'flares' }; }
      else if (c.openDoor) { bd = d; best = { car: c, label: 'blast horn & lights', action: 'horn' }; }
      else if (c.locked && c.alarmLeft > 0 && c.alarmT <= 0.5) { bd = d; best = { car: c, label: 'trip car alarm', action: 'alarm' }; }
    }
    return best;
  }

  interact(you, kit, noises) {
    const hit = this.interactable(you);
    if (!hit) return null;
    if (hit.action === 'flares') {
      const take = Math.min(hit.car.flaresLeft, Math.max(1, (kit.flare.max || 3) - kit.flare.n));
      hit.car.flaresLeft = Math.max(0, hit.car.flaresLeft - take);
      kit.flare.n = Math.min(Math.max(kit.flare.max, 3), kit.flare.n + take);
      this.flaresGrabbed += take;
      this.events.push({ src: 'lot', type: 'flaresGrabbed', count: take, x: hit.car.x, y: hit.car.y + 1.1, z: hit.car.z });
      return hit.label;
    }
    if (hit.action === 'horn') { this.blastHorn(hit.car, noises); return hit.label; }
    if (hit.action === 'alarm') { this.tripAlarm(hit.car, noises, true); return hit.label; }
    return null;
  }

  /** Active kids formatted as Arena agents so the rex's real mind senses and hunts them. */
  extraAgents() {
    const out = [];
    for (const k of this.kids) {
      if (k.state === 'escaped' || k.state === 'dead') continue;
      const g = this.T.height(k.x, k.z);
      out.push({
        id: k.id,
        x: k.x, y: g + k.eye, z: k.z,
        vx: k.vx, vz: k.vz,
        speed: Math.hypot(k.vx, k.vz),
        crouch: k.crouch,
        fx: Math.sin(k.yaw), fz: Math.cos(k.yaw),
        torch: false,
      });
    }
    return out;
  }

  /** Bright light cues from active alarms / high beams (uses mind's general `bright` property). */
  extraLights() {
    const out = [];
    for (const c of this.cars) {
      if (c.alarmT > 0 || c.beamsT > 0) {
        const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
        out.push({
          id: `carlight.${c.id}`, kind: 'carlight',
          x: c.x + s * (c.l * 0.5), y: c.y + 0.85, z: c.z + co * (c.l * 0.5),
          speed: 0, rest: true,
          bright: c.beamsT > 0 ? 1.0 : (Math.floor(this.t * 4) % 2 === 0 ? 0.85 : 0.2),
          hot: false, edible: false, missile: false, scent: 0, amount: 0, by: 'world',
        });
      }
    }
    return out;
  }

  /** Point on the far side of a cover stop relative to the rex. */
  _coverPoint(stop, rex, idx) {
    if (stop.kind === 'exit') return { x: stop.x, z: stop.z };
    const car = this.byId.get(stop.carId);
    const cx = car ? car.x : stop.x, cz = car ? car.z : stop.z;
    const dx = cx - rex.x, dz = cz - rex.z, d = Math.hypot(dx, dz) || 1;
    const nx = dx / d, nz = dz / d;
    const px = -nz, pz = nx;
    const off = (idx === 0 ? -0.65 : 0.65);
    return { x: cx + nx * 2.1 + px * off, z: cz + nz * 2.1 + pz * off };
  }

  step(dt, sim, mind, arena, things, noises, playerDead = false) {
    this.t += dt;
    const bound = this.lot.fence - 2.6;

    // 1. Cars: suspension springs, skid physics, alarms, rex & flare impacts
    const head = sim.head.pos, chest = sim.spine[18].p, rexSp = Math.abs(sim.v);
    for (const c of this.cars) {
      if (c.bumpCD > 0) c.bumpCD -= dt;
      // Spring-damper suspension
      c.vPitch += (-SPRING_K * c.pitch - SPRING_C * c.vPitch) * dt;
      c.vRoll += (-SPRING_K * c.roll - SPRING_C * c.vRoll) * dt;
      c.pitch = clamp(c.pitch + c.vPitch * dt, -0.24, 0.24);
      c.roll = clamp(c.roll + c.vRoll * dt, -0.32, 0.32);

      // Lateral skid & yaw decay
      if (Math.abs(c.vx) > 0.02 || Math.abs(c.vz) > 0.02 || Math.abs(c.vYaw) > 0.01) {
        c.x = clamp(c.x + c.vx * dt, -bound, bound);
        c.z = clamp(c.z + c.vz * dt, -bound, bound);
        c.yaw += c.vYaw * dt;
        const damp = Math.exp(-SKID_DRAG * dt);
        c.vx *= damp; c.vz *= damp; c.vYaw *= Math.exp(-YAW_DRAG * dt);
        c.y = this.T.height(c.x, c.z);
        this._syncColliders(c);
      }

      // Alarm pulse
      if (c.alarmT > 0) {
        c.alarmT = Math.max(0, c.alarmT - dt);
        c.alarmAcc += dt;
        if (c.alarmAcc >= ALARM_PULSE) {
          c.alarmAcc -= ALARM_PULSE;
          noises.push({ x: c.x, y: c.y + 1.1, z: c.z, loud: 0.85, kind: 'alarm' });
          this.events.push({ src: 'lot', type: 'carAlarm', id: c.id, x: c.x, y: c.y + 1.1, z: c.z });
        }
        if (c.alarmT === 0 && c.role !== 'start' && c.role !== 'ranger') c.hazards = false;
      }
      if (c.hornT > 0) c.hornT = Math.max(0, c.hornT - dt);
      if (c.beamsT > 0) c.beamsT = Math.max(0, c.beamsT - dt);

      // Rex contact with car (head sniffing/nudging or torso bumping)
      if (c.bumpCD <= 0) {
        const dHead = Math.hypot(head.x - c.x, head.z - c.z);
        const dChest = Math.hypot(chest.x - c.x, chest.z - c.z);
        const hitR = Math.max(c.w, c.l) * 0.56;
        if (dHead < hitR + 0.55 && head.y < c.y + c.h + 0.9) {
          const dx = c.x - head.x, dz = c.z - head.z, dl = Math.hypot(dx, dz) || 1;
          const str = clamp(0.45 + rexSp * 0.25 + (sim.act && /^(butt|strike)$/.test(sim.act.kind) ? 1.1 : 0), 0.4, 2.2);
          this.impactCar(c, dx / dl, dz / dl, str, true);
          c.bumpCD = 0.55;
          if (c.locked && c.alarmLeft > 0 && str > 0.65) this.tripAlarm(c, noises, false);
        } else if (dChest < hitR + 1.1) {
          const dx = c.x - chest.x, dz = c.z - chest.z, dl = Math.hypot(dx, dz) || 1;
          const str = clamp(0.75 + rexSp * 0.35, 0.7, 2.5);
          this.impactCar(c, dx / dl, dz / dl, str, true);
          c.bumpCD = 0.6;
          if (c.locked && c.alarmLeft > 0) this.tripAlarm(c, noises, false);
        }
      }

      // Flare hitting or landing right on a locked car trips its alarm
      if (things && c.locked && c.alarmLeft > 0 && c.alarmT <= 0.5) {
        for (const o of things.list) {
          if (o.kind === 'flare' && o.burn > 0 && Math.hypot(o.x - c.x, o.z - c.z) < Math.max(c.w, c.l) * 0.52 && o.y < c.y + c.h + 0.7) {
            this.tripAlarm(c, noises, true);
            break;
          }
        }
      }
    }

    // 2. Kids cover-to-cover escape AI
    let escaped = 0, dead = 0;
    const rexFwdX = Math.sin(sim.psi), rexFwdZ = Math.cos(sim.psi);
    const activeAlarm = this.cars.some((c) => c.alarmT > 0 || c.hornT > 0);
    for (let i = 0; i < this.kids.length; i++) {
      const k = this.kids[i];
      const v = arena.victims.get(k.id);
      if (v && v.dead && k.state !== 'dead') {
        k.state = 'dead'; k.vx = k.vz = 0;
        this.events.push({ src: 'lot', type: 'kidLost', id: k.id, name: k.name, x: k.x, z: k.z });
      }
      if (k.state === 'escaped') { escaped++; continue; }
      if (k.state === 'dead') { dead++; continue; }

      // Keep synced with Arena victim if knocked/held
      if (v && !v.free) { k.x = v.x; k.z = v.z; k.vx = v.vx; k.vz = v.vz; continue; }

      const dRex = Math.hypot(sim.x - k.x, sim.z - k.z);
      const toKidX = (k.x - sim.x) / (dRex || 1), toKidZ = (k.z - sim.z) / (dRex || 1);
      const rexFacingKid = rexFwdX * toKidX + rexFwdZ * toKidZ;
      const rexDistracted = (mind.know && mind.know.target && mind.know.target.id === 'you') || activeAlarm || rexFacingKid < 0.25;

      if (k.state === 'cover') {
        const curStop = this.stops[k.stop];
        const cp = this._coverPoint(curStop, sim, i);
        const dx = cp.x - k.x, dz = cp.z - k.z, d = Math.hypot(dx, dz);
        if (d > 0.35) {
          const sp = Math.min(2.2, d * 3.5);
          k.vx = (dx / d) * sp; k.vz = (dz / d) * sp;
          k.x += k.vx * dt; k.z += k.vz * dt;
          k.yaw = Math.atan2(k.vx, k.vz);
        } else { k.vx = k.vz = 0; k.yaw = Math.atan2(sim.x - k.x, sim.z - k.z); }
        k.crouch = true; k.eye = 0.88;
        if (k.waitT > 0) k.waitT -= dt;

        // Check if safe enough to bolt to next stop
        const nextStop = this.stops[k.stop + 1];
        if (nextStop && k.waitT <= 0) {
          const midX = (k.x + nextStop.x) * 0.5, midZ = (k.z + nextStop.z) * 0.5;
          const dMid = Math.hypot(sim.x - midX, sim.z - midZ);
          const safeFar = dRex > 22 && dMid > 17;
          const safeDistracted = rexDistracted && dRex > 14 && dMid > 13;
          if (safeFar || safeDistracted) {
            k.state = 'sprint';
            k.commitT = 0;
          }
        }
      } else if (k.state === 'sprint') {
        k.commitT += dt;
        const tgt = this.stops[k.stop + 1];
        const tp = this._coverPoint(tgt, sim, i);
        const dx = tp.x - k.x, dz = tp.z - k.z, d = Math.hypot(dx, dz);
        // Panic retreat only if rex cuts directly in front early in the sprint
        if (dRex < 9.5 && k.commitT < 1.2 && d > 8) {
          k.state = 'cover'; k.waitT = 2.5; continue;
        }
        const sp = KID_SPEED;
        k.vx = (dx / (d || 1)) * sp; k.vz = (dz / (d || 1)) * sp;
        k.x += k.vx * dt; k.z += k.vz * dt;
        const p = { x: k.x, z: k.z };
        this.T.pushOut(p, 0.35, this.T.height(k.x, k.z) + 0.1, this.T.height(k.x, k.z) + 1.4, 2);
        k.x = p.x; k.z = p.z;
        k.yaw = Math.atan2(k.vx, k.vz);
        k.crouch = false; k.eye = 1.32;
        k.stepT += dt;
        if (k.stepT >= 0.45) {
          k.stepT = 0;
          noises.push({ x: k.x, y: this.T.height(k.x, k.z) + 0.2, z: k.z, loud: 0.32, kind: 'step' });
        }
        if (d < 1.6) {
          k.stop++;
          if (this.stops[k.stop].kind === 'exit') {
            k.state = 'escaped'; k.vx = k.vz = 0;
            escaped++;
            this.events.push({ src: 'lot', type: 'kidEscaped', id: k.id, name: k.name, escaped, total: this.kids.length, x: k.x, z: k.z });
          } else {
            k.state = 'cover'; k.waitT = 1.8 + i * 0.5;
          }
        }
      }
    }

    // 3. Mission outcome check
    if (this.status === 'active') {
      if (dead > 0) {
        this.status = 'lost'; this.statusAt = this.t;
        this.events.push({ src: 'lot', type: 'lotLost', escaped, dead });
      } else if (escaped === this.kids.length) {
        this.status = playerDead ? 'heroic' : 'won'; this.statusAt = this.t;
        this.events.push({ src: 'lot', type: 'lotWon', heroic: playerDead, elapsed: this.t, alarmsTripped: this.alarmsTripped });
      }
    }
  }
}
