// Lot B (#lot), the game's side of it (pure sim, no three.js): the parked cars and the two stranded visitors.
//
// Cars are solids the animal can move: each is three round colliders that follow it, sprung in pitch and roll, and it
// skids when struck. A locked car's shock alarm goes off when it is thumped hard (by you with E, by a flare landing on it,
// or by the animal); a car left with its door open has a horn and high beams; the ranger's pickup carries spare flares.
//
// The visitors make their own way out, whatever you do: van, a gap between cars in row B, a gap in row C, the exit. In a
// gap they keep to the end further from the animal; they break for the next cover only when they judge they can reach it
// before the animal reaches them, which mostly means when something else has its attention a long way off. Nothing here
// knows who the player is: the rule is about where the animal is, how fast it could close, and what it is minding.
// Until activate() (the player has looked up from the monitor) they are not offered to the animal at all.
import { clamp } from '../math.js';
import { tune } from '../rex/tune.js';

const SPRING_K = 30, SPRING_C = 5.8;
const SKID_DRAG = 4.2, YAW_DRAG = 5.0;
const ALARM_DUR = 14, ALARM_PULSE = 0.78;
const HORN_DUR = 2.6, BEAMS_DUR = 18;
// run, scurry: m/s. A run is judged safe when the animal is further from its line than margin + rexPace * (time to run it) * k, where k
// is `heed` when the animal is minding them and `unheeded` when it is not; pinned for long (nerveFrom..nerveFull s) they grow
// desperate and k falls toward `rash`. wait: seconds to get their breath in a new gap.
export const KID = { run: 5.0, scurry: 3.0, rexPace: 7.5, margin: 6, heed: 1.0, unheeded: 0.35, rash: 0.3, nerveFrom: 12, nerveFull: 50, wait: [5, 9] };

tune('lot', 'visitor run m/s', KID, 'run', 3, 8, 0.1); tune('lot', 'caution, watched', KID, 'heed', 0.3, 2, 0.05); tune('lot', 'caution, unwatched', KID, 'unheeded', 0.1, 1, 0.05);
tune('lot', 'caution, desperate', KID, 'rash', 0.1, 1, 0.05); tune('lot', 'desperate from s', KID, 'nerveFrom', 0, 120, 1); tune('lot', 'desperate full s', KID, 'nerveFull', 10, 240, 1);

export class LotMode {
  constructor(terrain, lot) {
    this.T = terrain;
    this.lot = lot;
    this.events = [];
    this.cars = lot.cars.map((c) => this._initCar(c));
    this.byId = new Map(this.cars.map((c) => [c.id, c]));
    this.stops = lot.stops;
    this._fresh();
    this._registerColliders();
  }

  _fresh() {
    this.t = 0;
    this.active = false; this.activeAt = -1; this.introDashed = false;
    this.status = 'active';      // 'active' | 'won' (both out) | 'partial' (one out) | 'lost' (neither)
    this.statusAt = 0; this.alarmsTripped = 0; this.flaresGrabbed = 0;
    this.kids = this._initKids();
  }

  _initCar(c) {
    return { ...c, x0: c.x, z0: c.z, yaw0: c.yaw, y: this.T.height(c.x, c.z), pitch: 0, roll: 0, vPitch: 0, vRoll: 0, vx: 0, vz: 0, vYaw: 0, alarmT: 0, alarmAcc: 0, hornT: 0, beamsT: 0, bumpCD: 0, cols: [] };
  }

  _initKids() {
    const s0 = this.stops[0];
    return [0, 1].map((i) => ({
      id: `kid${i + 1}`, name: i === 0 ? 'Visitor A' : 'Visitor B',
      scale: i === 0 ? 0.8 : 0.72, jacket: i === 0 ? 0xe0ad24 : 0x269694,
      stop: 0, state: 'cover',      // 'cover' | 'sprint' | 'escaped' | 'dead'
      x: s0.x + (i === 0 ? -0.5 : 0.5), z: s0.z + (i === 0 ? 0 : 0.7),
      vx: 0, vz: 0, yaw: 0, crouch: true, eye: 0.85, stepT: 0, nerveT: 0, waitT: 1.5, runT: 0, runLen: 0, pinT: 0,
    }));
  }

  _carColliderPts(c) {
    const s = Math.sin(c.yaw), co = Math.cos(c.yaw), hl = c.l * 0.34, r = c.w * 0.5;
    return [-hl, 0, hl].map((u) => ({ x: c.x + s * u, z: c.z + co * u, r }));
  }

  _registerColliders() {
    for (const c of this.cars) {
      c.cols = this._carColliderPts(c).map((p) => ({ x: p.x, z: p.z, r: p.r, top: c.y + c.h, kind: 'wall', car: c.id }));
      this.T.addDynamicColliders(c.cols);
    }
  }

  _syncColliders(c) {
    const pts = this._carColliderPts(c);
    for (let i = 0; i < c.cols.length; i++) { c.cols[i].x = pts[i].x; c.cols[i].z = pts[i].z; c.cols[i].top = c.y + c.h; }
    this.T.refreshDynamicColliders(c.cols);
  }

  /** The player has looked up from the monitor: the visitors are in the world from now on. */
  activate() { if (!this.active) { this.active = true; this.activeAt = this.t; } }

  reset() {
    this.events.length = 0;
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i], src = this.lot.cars[i];
      c.x = c.x0; c.z = c.z0; c.yaw = c.yaw0; c.y = this.T.height(c.x, c.z);
      c.pitch = c.roll = c.vPitch = c.vRoll = c.vx = c.vz = c.vYaw = 0;
      c.alarmT = c.alarmAcc = c.hornT = c.beamsT = c.bumpCD = 0;
      c.alarmLeft = src.alarmLeft; c.flaresLeft = src.flaresLeft || 0; c.hazards = src.hazards; c.lightsOn = src.lightsOn;
      this._syncColliders(c);
    }
    this._fresh();
  }

  /** A blow on car c along (ix, iz), unit; strength about 0.3 (a slap) to 2.5 (the animal at a run). */
  impactCar(c, ix, iz, strength, byRex = false) {
    const s = Math.sin(c.yaw), co = Math.cos(c.yaw), along = ix * s + iz * co, across = ix * co - iz * s;
    c.vPitch = clamp(c.vPitch + along * 0.55 * strength, -2.4, 2.4);
    c.vRoll = clamp(c.vRoll + across * 0.85 * strength, -2.8, 2.8);
    if (byRex && strength > 0.7) {
      const push = clamp((strength - 0.6) * 2.2, 0, 5.4);
      c.vx += ix * push; c.vz += iz * push; c.vYaw += across * 0.24 * clamp(strength * 0.5, 0, 1.3);
      this.events.push({ src: 'lot', type: 'carCrunch', id: c.id, x: c.x, y: c.y + 0.9, z: c.z, strength });
    }
  }

  tripAlarm(c, noises, byPlayer = false) {
    if (c.alarmT > 1 || c.alarmLeft <= 0) return false;
    c.alarmLeft--; c.alarmT = ALARM_DUR; c.alarmAcc = 0; c.hazards = true; this.alarmsTripped++;
    this.impactCar(c, 0.3, 0.4, 0.65, false);
    noises.push({ x: c.x, y: c.y + 1.1, z: c.z, loud: 0.9, kind: 'alarm', you: byPlayer });
    this.events.push({ src: 'lot', type: 'carAlarm', id: c.id, x: c.x, y: c.y + 1.1, z: c.z });
    return true;
  }

  blastHorn(c, noises) {
    c.hornT = HORN_DUR; c.beamsT = BEAMS_DUR;
    this.impactCar(c, 0, 0.25, 0.35, false);
    noises.push({ x: c.x, y: c.y + 1.1, z: c.z, loud: 0.95, kind: 'horn', you: true });
    this.events.push({ src: 'lot', type: 'carHorn', id: c.id, x: c.x, y: c.y + 1.1, z: c.z });
    return true;
  }

  interactable(you) {      // the car within reach; flares and a horn are chosen ahead of a plain thump when two cars are in reach
    let best = null, bs = 1e9;
    for (const c of this.cars) {
      const d = this._distToCar(c, you.x, you.z);
      if (d > 1.5) continue;
      const hit = c.hasFlares && c.flaresLeft > 0 ? { car: c, label: 'take the spare flares', action: 'flares' } : c.openDoor ? { car: c, label: 'sound the horn', action: 'horn' } : c.locked && c.alarmLeft > 0 && c.alarmT <= 0.5 ? { car: c, label: 'thump the car', action: 'alarm' } : null;
      if (!hit) continue;
      const sc = d + (hit.action === 'alarm' ? 1 : 0);
      if (sc < bs) { bs = sc; best = hit; }
    }
    return best;
  }

  _distToCar(c, x, z) { let d = 1e9; for (const p of c.cols) d = Math.min(d, Math.hypot(p.x - x, p.z - z) - p.r); return d; }

  interact(you, kit, noises) {
    const hit = this.interactable(you);
    if (!hit) return null;
    const c = hit.car;
    if (hit.action === 'flares') {
      const room = Math.max(0, (kit.flare.max || 3) - kit.flare.n), take = Math.min(c.flaresLeft, room);
      if (take <= 0) return null;
      c.flaresLeft -= take; kit.flare.n += take; this.flaresGrabbed += take;
      this.events.push({ src: 'lot', type: 'flaresGrabbed', count: take, x: c.x, y: c.y + 1.1, z: c.z });
    } else if (hit.action === 'horn') this.blastHorn(c, noises);
    else this.tripAlarm(c, noises, true);
    return hit.label;
  }

  /** The visitors, as agents for the animal's senses (none until the player has looked up). */
  extraAgents() {
    if (!this.active) return [];
    const out = [];
    for (const k of this.kids) {
      if (k.state === 'escaped' || k.state === 'dead') continue;
      out.push({ id: k.id, x: k.x, y: this.T.height(k.x, k.z) + k.eye, z: k.z, vx: k.vx, vz: k.vz, speed: Math.hypot(k.vx, k.vz), crouch: k.crouch, fx: Math.sin(k.yaw), fz: Math.cos(k.yaw), torch: false });
    }
    return out;
  }

  /** Lit things for its eyes: a car flashing its alarm, or on high beam. */
  extraLights() {
    const out = [];
    for (const c of this.cars) {
      if (!(c.alarmT > 0 || c.beamsT > 0)) continue;
      const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
      out.push({ id: `carlight.${c.id}`, kind: 'carlight', x: c.x + s * c.l * 0.5, y: c.y + 0.85, z: c.z + co * c.l * 0.5, speed: 0, rest: true, bright: c.beamsT > 0 ? 1.0 : (Math.floor(this.t * 4) % 2 === 0 ? 0.85 : 0.2), hot: false, edible: false, missile: false, scent: 0, amount: 0, by: 'world' });
    }
    return out;
  }

  // where visitor i hides at a stop, given where the animal is; `leaving` picks the end nearer the next stop
  _coverPoint(stop, next, sim, i, leaving) {
    if (stop.kind !== 'lane') return { x: stop.x + (i ? 0.5 : -0.5), z: stop.z + (i ? 0.7 : 0) };
    const lo = stop.z0 + 0.7, hi = stop.z1 - 0.7, mid = (lo + hi) / 2;
    let end;
    if (leaving && next) end = (next.z ?? next.z0) > mid ? hi : lo;
    else end = sim.z > mid ? lo : hi;
    return { x: stop.x, z: end + (end === lo ? 1 : -1) * i * 0.9 };
  }

  // where a run to `stop` ends: the near end of a gap, or the point itself
  _entry(stop, from, i) {
    if (stop.kind !== 'lane') return { x: stop.x + (i ? 0.6 : -0.6), z: stop.z };
    return { x: stop.x, z: Math.abs(from.z - stop.z0) < Math.abs(from.z - stop.z1) ? stop.z0 + 0.4 : stop.z1 - 0.4 };
  }

  _carsStep(dt, sim, arena, things, noises) {
    const bound = this.lot.fence - 2.6;
    // what the animal struck this step: each contact is passed to the car it was on
    const hits = [];
    for (const e of arena.events) if (e.src === 'sim' && e.type === 'contact') hits.push(e);
    const moving = Math.abs(sim.v);
    for (const c of this.cars) {
      if (c.bumpCD > 0) c.bumpCD -= dt;
      c.vPitch += (-SPRING_K * c.pitch - SPRING_C * c.vPitch) * dt;
      c.vRoll += (-SPRING_K * c.roll - SPRING_C * c.vRoll) * dt;
      c.pitch = clamp(c.pitch + c.vPitch * dt, -0.24, 0.24);
      c.roll = clamp(c.roll + c.vRoll * dt, -0.32, 0.32);
      if (Math.abs(c.vx) > 0.02 || Math.abs(c.vz) > 0.02 || Math.abs(c.vYaw) > 0.01) {
        c.x = clamp(c.x + c.vx * dt, -bound, bound); c.z = clamp(c.z + c.vz * dt, -bound, bound); c.yaw += c.vYaw * dt;
        const damp = Math.exp(-SKID_DRAG * dt);
        c.vx *= damp; c.vz *= damp; c.vYaw *= Math.exp(-YAW_DRAG * dt);
        c.y = this.T.height(c.x, c.z);
        this._syncColliders(c);
      }
      if (c.alarmT > 0) {
        c.alarmT = Math.max(0, c.alarmT - dt); c.alarmAcc += dt;
        if (c.alarmAcc >= ALARM_PULSE) {
          c.alarmAcc -= ALARM_PULSE;
          noises.push({ x: c.x, y: c.y + 1.1, z: c.z, loud: 0.85, kind: 'alarm' });
          this.events.push({ src: 'lot', type: 'carAlarm', id: c.id, x: c.x, y: c.y + 1.1, z: c.z });
        }
        if (c.alarmT === 0) c.hazards = !!this.lot.cars.find((s) => s.id === c.id).hazards;
      }
      if (c.hornT > 0) c.hornT = Math.max(0, c.hornT - dt);
      if (c.beamsT > 0) c.beamsT = Math.max(0, c.beamsT - dt);

      if (c.bumpCD <= 0) {
        // a body contact on this car, or the head pressed against it (the head does not always report one)
        let hit = null;
        for (const e of hits) if (this._distToCar(c, e.x, e.z) < 0.9) { hit = { x: e.x, z: e.z, str: clamp(0.5 + (e.force || 0) * 0.3 + moving * 0.12, 0.5, 2.6) }; break; }
        if (!hit) { const H = sim.head.pos; if (H.y < c.y + c.h + 0.5 && this._distToCar(c, H.x, H.z) < 0.35) hit = { x: H.x, z: H.z, str: clamp(0.45 + moving * 0.25 + (sim.act && /^(butt|strike)$/.test(sim.act.kind) ? 1.1 : 0), 0.4, 2.2) }; }
        if (hit) {
          const dx = c.x - hit.x, dz = c.z - hit.z, dl = Math.hypot(dx, dz) || 1;
          this.impactCar(c, dx / dl, dz / dl, hit.str, true);
          c.bumpCD = 0.5;
          if (c.locked && hit.str > 1.0) this.tripAlarm(c, noises, false);
        }
      }
      if (things && c.locked && c.alarmLeft > 0 && c.alarmT <= 0.5) {
        for (const o of things.list) if (o.kind === 'flare' && o.burn > 0 && o.y < c.y + c.h + 0.7 && this._distToCar(c, o.x, o.z) < 0.3) { this.tripAlarm(c, noises, true); break; }
      }
    }
  }

  // Could visitor k get from where it stands to p before the animal gets to it? `heeded`: the animal is minding the visitors.
  _clearRun(k, p, sim, heeded) {
    const rash = clamp((k.pinT - KID.nerveFrom) / (KID.nerveFull - KID.nerveFrom), 0, 1), f0 = heeded ? KID.heed : KID.unheeded, f = f0 + (Math.min(f0, KID.rash) - f0) * rash;
    const dx = p.x - k.x, dz = p.z - k.z, len = Math.hypot(dx, dz) || 1e-6;
    const u = clamp(((sim.x - k.x) * dx + (sim.z - k.z) * dz) / (len * len), 0, 1);
    const near = Math.hypot(sim.x - (k.x + dx * u), sim.z - (k.z + dz * u));      // how close its line of run passes to the animal
    return near > KID.margin + KID.rexPace * (len / KID.run) * f;
  }

  step(dt, sim, mind, arena, things, noises, playerDead = false) {
    this.t += dt;
    this._carsStep(dt, sim, arena, things, noises);
    const T = this.T;

    if (!this.active) {      // before the player is in the world: crouched by the van, watching the animal
      for (const k of this.kids) { k.vx = k.vz = 0; k.crouch = true; k.eye = 0.85; k.yaw = Math.atan2(sim.x - k.x, sim.z - k.z); }
      return;
    }

    // the opening: a moment after the player looks up, with the animal at the kiosk window, they break from the van for
    // the first gap. It is the commotion that turns the animal's head, and it shows what they are trying to do.
    if (!this.introDashed && this.t - this.activeAt >= 1.2) {
      this.introDashed = true;
      for (const k of this.kids) if (k.state === 'cover' && k.stop === 0) this._go(k);
      const van = this.byId.get(this.stops[0].carId); if (van) this.tripAlarm(van, noises, false);      // a door slammed on the way out: the van's alarm
    }

    const tg = mind.know && mind.know.seen && mind.know.target, onKids = !!(tg && typeof tg.id === 'string' && tg.id.startsWith('kid'));
    const fwdX = Math.sin(sim.psi), fwdZ = Math.cos(sim.psi);
    const drawn = this.cars.some((c) => (c.alarmT > 0 || c.hornT > 0) && Math.hypot(c.x - sim.x, c.z - sim.z) < 16);      // it is at a car that is making a row
    let escaped = 0, dead = 0;
    for (let i = 0; i < this.kids.length; i++) {
      const k = this.kids[i], v = arena.victims.get(k.id);
      if (v && v.dead && k.state !== 'dead') { k.state = 'dead'; k.vx = k.vz = 0; this.events.push({ src: 'lot', type: 'kidLost', id: k.id, name: k.name, x: k.x, z: k.z }); }
      if (k.state === 'escaped') { escaped++; continue; }
      if (k.state === 'dead') { dead++; continue; }
      if (v && !v.free) { k.x = v.x; k.z = v.z; k.vx = v.vx; k.vz = v.vz; continue; }      // in its jaws, or thrown

      const dRex = Math.hypot(sim.x - k.x, sim.z - k.z), facing = (fwdX * (k.x - sim.x) + fwdZ * (k.z - sim.z)) / (dRex || 1);
      const heeded = !drawn && (onKids || (facing > 0.5 && dRex < 30));
      const stop = this.stops[k.stop], next = this.stops[k.stop + 1];

      if (k.state === 'cover') {
        const ready = !heeded && dRex > 20;      // not watched: up at the end they will leave from
        const cp = this._coverPoint(stop, next, sim, i, ready);
        const dx = cp.x - k.x, dz = cp.z - k.z, d = Math.hypot(dx, dz);
        if (d > 0.25) { const sp = Math.min(KID.scurry, d * 4); k.vx = dx / d * sp; k.vz = dz / d * sp; k.x += k.vx * dt; k.z += k.vz * dt; k.yaw = Math.atan2(k.vx, k.vz); }
        else { k.vx = k.vz = 0; k.yaw = ready && next ? Math.atan2(next.x - k.x, (next.z ?? next.z0) - k.z) : Math.atan2(sim.x - k.x, sim.z - k.z); }
        k.crouch = !(ready && d < 0.6); k.eye = k.crouch ? 0.88 : 1.3;
        if (k.waitT > 0) k.waitT -= dt;
        // close by and not otherwise occupied, it hears them: a scuffed shoe, a breath
        if (dRex < 12 && !drawn) { k.nerveT += dt; if (k.nerveT >= 2.4) { k.nerveT = 0; noises.push({ x: k.x, y: T.height(k.x, k.z) + 0.8, z: k.z, loud: 0.36, kind: 'step' }); } } else k.nerveT = 0;
        if (next && k.waitT <= 0) {
          k.pinT += dt;
          const rash = k.pinT > KID.nerveFrom && dRex > 12;      // desperate: they will go from wherever they are in the gap
          if ((ready || rash) && (d < 0.6 || rash) && this._clearRun(k, this._entry(next, k, i), sim, heeded)) this._go(k);
        }
      } else {      // sprint
        k.runT += dt;
        const tp = this._entry(next, k, i), dx = tp.x - k.x, dz = tp.z - k.z, d = Math.hypot(dx, dz);
        // it has turned on them and they have barely started: back into the gap
        if (k.stop > 0 && facing > 0.6 && dRex < 15 && k.runLen - d < k.runLen * 0.35 && !this._clearRun(k, tp, sim, true)) { k.state = 'cover'; k.waitT = 3; k.pinT = Math.max(0, k.pinT - 15); this.events.push({ src: 'lot', type: 'kidBack', id: k.id, x: k.x, z: k.z }); continue; }
        k.vx = dx / (d || 1) * KID.run; k.vz = dz / (d || 1) * KID.run;
        k.x += k.vx * dt; k.z += k.vz * dt;
        const g = T.height(k.x, k.z), p = { x: k.x, z: k.z };
        T.pushOut(p, 0.3, g + 0.1, g + 1.4, 2); k.x = p.x; k.z = p.z;
        k.yaw = Math.atan2(k.vx, k.vz); k.crouch = false; k.eye = 1.32;
        k.stepT += dt;
        if (k.stepT >= 0.3) { k.stepT = 0; const wet = T.depthAt && T.depthAt(k.x, k.z) > 0.04; noises.push({ x: k.x, y: g + 0.2, z: k.z, loud: wet ? 0.6 : 0.4, kind: wet ? 'splash' : 'step' }); }
        if (d < 0.6) {
          k.stop++;
          if (this.stops[k.stop].kind === 'exit') { k.state = 'escaped'; k.vx = k.vz = 0; escaped++; this.events.push({ src: 'lot', type: 'kidEscaped', id: k.id, name: k.name, x: k.x, z: k.z }); }
          else { k.state = 'cover'; k.waitT = KID.wait[0] + (KID.wait[1] - KID.wait[0]) * ((i * 0.618 + k.stop * 0.37) % 1); }
        }
      }
    }

    if (this.status === 'active' && escaped + dead === this.kids.length) {
      this.status = escaped === this.kids.length ? 'won' : escaped > 0 ? 'partial' : 'lost';
      this.statusAt = this.t;
      this.events.push({ src: 'lot', type: 'lotDone', status: this.status, escaped, dead, playerDead, elapsed: this.t - this.activeAt });
    }
  }

  _go(k) {
    const next = this.stops[k.stop + 1]; if (!next) return;
    const tp = this._entry(next, k, 0);
    k.state = 'sprint'; k.runT = 0; k.pinT = 0; k.runLen = Math.hypot(tp.x - k.x, tp.z - k.z);
    this.events.push({ src: 'lot', type: 'kidGo', id: k.id, x: k.x, z: k.z, to: k.stop + 1 });
  }
}
