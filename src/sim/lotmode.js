// Lot B (#lot), pure sim (no three.js): reactive cars (tramplable/crushable low cars, shovable/flippable SUVs & vans,
// car-to-car domino impacts) and the two stranded visitors (one carrying a flashlight) making their way to the exit.
import { clamp } from '../math.js';
import { tune } from '../rex/tune.js';

const SPRING_K = 18, SPRING_C = 3.8;
const FLIP_K = 22, FLIP_C = 4.6;
const SKID_DRAG = 3.6, YAW_DRAG = 4.4;
const ALARM_DUR = 14, ALARM_PULSE = 0.78;
const HORN_DUR = 2.6, BEAMS_DUR = 18;
// Visitor pacing: 3 stops (stalled van -> row B cover gap -> lit exit). Shorter nerve times keep the lot tense.
export const KID = { run: 5.2, scurry: 3.1, rexPace: 7.5, margin: 6, heed: 1.0, unheeded: 0.36, rash: 0.3, nerveFrom: 10, nerveFull: 40, wait: [3.5, 6.5] };

tune('lot', 'visitor run m/s', KID, 'run', 3, 8, 0.1);
tune('lot', 'caution, watched', KID, 'heed', 0.3, 2, 0.05);
tune('lot', 'caution, unwatched', KID, 'unheeded', 0.1, 1, 0.05);
tune('lot', 'caution, desperate', KID, 'rash', 0.1, 1, 0.05);
tune('lot', 'desperate from s', KID, 'nerveFrom', 0, 120, 1);
tune('lot', 'desperate full s', KID, 'nerveFull', 10, 240, 1);

export class LotMode {
  constructor(terrain, lot) {
    this.T = terrain;
    this.lot = lot;
    this.events = [];
    this.cars = lot.cars.map((c) => this._initCar(c));
    this.byId = new Map(this.cars.map((c) => [c.id, c]));
    this.stops = lot.stops;
    this._navVerAt = -10;
    this._fresh();
    this._registerColliders();
    if (this.T.addHeightMod) this.T.addHeightMod((x, z, h) => this._carHeightAt(x, z, h));
  }

  _groundY(x, z) { return this.T.base ? this.T.base(x, z) : 0; }

  _fresh() {
    this.t = 0;
    this.active = false; this.activeAt = -1; this.introDashed = false;
    this.status = 'active';      // 'active' | 'won' | 'partial' | 'lost'
    this.statusAt = 0; this.alarmsTripped = 0; this.flaresGrabbed = 0;
    this.carsCrushed = 0; this.carsFlipped = 0;
    this.droppedTorch = null;
    this.kids = this._initKids();
  }

  _initCar(c) {
    const y = this._groundY(c.x, c.z);
    return {
      ...c, x0: c.x, z0: c.z, yaw0: c.yaw, y,
      pitch: 0, roll: 0, vPitch: 0, vRoll: 0,
      vx: 0, vz: 0, vYaw: 0,
      alarmT: 0, alarmAcc: 0, hornT: 0, beamsT: 0, bumpCD: 0, footCD: 0,
      crush: 0, crushTilt: 0, glassBroken: false, headDead: false,
      flipped: 0,      // 0 upright, +1 right side (+PI/2), -1 left side (-PI/2), +2/-2 roof (±PI)
      tramplable: !!c.low,
      navX: c.x, navZ: c.z, navDirty: false,
      cols: [], navBlock: null,
    };
  }

  _initKids() {
    const s0 = this.stops[0];
    return [0, 1].map((i) => ({
      id: `kid${i + 1}`, name: i === 0 ? 'Visitor A' : 'Visitor B',
      scale: i === 0 ? 0.82 : 0.74, jacket: i === 0 ? 0xf0be2e : 0x2cb0a8,
      hasTorch: i === 0,
      torchAim: { yaw: 0, pitch: -0.25, active: true, low: true },
      stop: 0, state: 'cover',      // 'cover' | 'sprint' | 'escaped' | 'dead'
      x: s0.x + (i === 0 ? -0.5 : 0.5), z: s0.z + (i === 0 ? 0 : 0.7),
      vx: 0, vz: 0, yaw: 0, crouch: true, eye: 0.85, stepT: 0, nerveT: 0, waitT: 1.4, runT: 0, runLen: 0, pinT: 0,
    }));
  }

  _carColliderPts(c) {
    const s = Math.sin(c.yaw), co = Math.cos(c.yaw), hl = c.l * 0.34, r = c.w * 0.5;
    return [-hl, 0, hl].map((u) => ({ x: c.x + s * u, z: c.z + co * u, r }));
  }

  _carTop(c) {
    if (c.flipped === 1 || c.flipped === -1) return c.y + c.w * 0.52;
    if (c.flipped === 2 || c.flipped === -2) return c.y + c.h * 0.62;
    return c.y + c.h * (1 - 0.34 * c.crush);
  }

  _registerColliders() {
    for (const c of this.cars) {
      const top = this._carTop(c);
      c.cols = this._carColliderPts(c).map((p) => ({ x: p.x, z: p.z, r: p.r, top, kind: 'car', trample: c.tramplable, car: c.id }));
      this.T.addDynamicColliders(c.cols);
      if (!c.tramplable && this.T.navBlocks) {
        c.navBlock = { x: c.x, z: c.z, r: Math.max(c.w, c.l * 0.55) * 0.48 };
        this.T.navBlocks.push(c.navBlock);
      }
    }
    this.T.ver++;
  }

  _syncColliders(c, bumpNav = false) {
    const pts = this._carColliderPts(c), top = this._carTop(c);
    for (let i = 0; i < c.cols.length; i++) {
      c.cols[i].x = pts[i].x; c.cols[i].z = pts[i].z; c.cols[i].top = top; c.cols[i].trample = c.tramplable;
    }
    this.T.refreshDynamicColliders(c.cols, false);
    if (c.navBlock) {
      c.navBlock.x = c.x; c.navBlock.z = c.z;
      c.navBlock.r = c.tramplable ? 0 : Math.max(c.w, c.l * 0.55) * 0.48;
    }
    if (bumpNav && this.t - this._navVerAt > 0.6) { this.T.ver++; this._navVerAt = this.t; }
  }

  // Smooth elevated ramp over tramplable cars (sedans, hatches, and overturned wrecks) so the rex's real feet
  // climb onto the hood, cave in the roof, and stride cleanly over the car using the exact terrain.height() path.
  _carHeightAt(x, z, baseH) {
    let best = baseH;
    for (const c of this.cars) {
      if (!c.tramplable || Math.abs(c.vRoll) > 2.4) continue;
      const dx = x - c.x, dz = z - c.z, hl = c.l * 0.5, hw = c.w * 0.5;
      const rad = hl + 0.95;
      if (dx * dx + dz * dz > rad * rad) continue;
      const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
      const lx = dx * co - dz * s, lz = dx * s + dz * co;
      const aw = hw + 0.48, al = hl + 0.68;
      if (Math.abs(lx) >= aw || Math.abs(lz) >= al) continue;
      // Smooth ramp across apron edges so finite-difference slope stays below Nav's MAXSLOPE (0.62)
      const fx = clamp(1 - Math.max(0, Math.abs(lx) - hw * 0.55) / (aw - hw * 0.55), 0, 1);
      const fz = clamp(1 - Math.max(0, Math.abs(lz) - hl * 0.55) / (al - hl * 0.55), 0, 1);
      const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
      const cabin = Math.abs(lz) < hl * 0.42 ? 1 : clamp(1 - (Math.abs(lz) - hl * 0.42) / (hl * 0.45), 0, 1);
      let topH;
      if (c.flipped !== 0) topH = 0.78 * (1 - 0.15 * c.crush);
      else topH = (0.68 + 0.36 * cabin) * (1 - 0.34 * c.crush);
      const h = c.y + topH * sx * sz;
      if (h > best) best = h;
    }
    return best;
  }

  /** The player has looked up from the monitor: the visitors are in the world from now on. */
  activate() { if (!this.active) { this.active = true; this.activeAt = this.t; } }

  reset() {
    this.events.length = 0;
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i], src = this.lot.cars[i];
      c.x = c.x0; c.z = c.z0; c.yaw = c.yaw0; c.y = this._groundY(c.x, c.z);
      c.pitch = c.roll = c.vPitch = c.vRoll = c.vx = c.vz = c.vYaw = 0;
      c.alarmT = c.alarmAcc = c.hornT = c.beamsT = c.bumpCD = c.footCD = 0;
      c.crush = 0; c.crushTilt = 0; c.glassBroken = false; c.headDead = false;
      c.flipped = 0; c.tramplable = !!src.low; c.navX = c.x; c.navZ = c.z; c.navDirty = false;
      c.alarmLeft = src.alarmLeft; c.flaresLeft = src.flaresLeft || 0; c.hazards = src.hazards; c.lightsOn = src.lightsOn;
      this._syncColliders(c, false);
    }
    this.T.ver++;
    this._fresh();
  }

  /** Apply an impact on car c along unit (ix, iz); strength ~0.3 (slap) to 3.0 (running ram / headbutt). */
  impactCar(c, ix, iz, strength, byRex = false, noises = null) {
    const s = Math.sin(c.yaw), co = Math.cos(c.yaw), along = ix * s + iz * co, across = ix * co - iz * s;
    c.vPitch = clamp(c.vPitch + along * 0.62 * strength, -2.8, 2.8);
    // Broadside hits drive roll hard enough to tip/flip a car onto its side or roof
    const rollGain = byRex ? 2.35 : 0.75;
    c.vRoll = clamp(c.vRoll + across * rollGain * strength, -8.5, 8.5);
    if (byRex && strength > 0.55) {
      const push = clamp((strength - 0.45) * 3.1, 0, 7.6);
      c.vx += ix * push; c.vz += iz * push;
      c.vYaw += across * 0.42 * clamp(strength * 0.65, 0, 1.8);
      if (strength > 1.25) {
        const wasCrushed = c.crush >= 0.45;
        c.crush = Math.min(1, c.crush + clamp((strength - 1.0) * 0.28, 0.1, 0.45));
        if (!c.crushTilt) c.crushTilt = (across >= 0 ? 1 : -1) * 0.08;
        c.glassBroken = true;
        if (strength > 1.6) c.headDead = true;
        if (!wasCrushed && c.crush >= 0.45) this.carsCrushed++;
      }
      this.events.push({ src: 'lot', type: 'carCrunch', id: c.id, x: c.x, y: c.y + 0.9, z: c.z, strength });
      if (noises && strength > 1.0) noises.push({ x: c.x, y: c.y + 1.0, z: c.z, loud: clamp(0.45 + strength * 0.2, 0.5, 0.9), kind: 'bang' });
    }
  }

  /** Step a rex foot down onto a tramplable car: caves the roof in, shatters glass, rocks springs, crunches. */
  trampleCar(c, fx, fz, vx, vz, noises) {
    const dx = fx - c.x, dz = fz - c.z, s = Math.sin(c.yaw), co = Math.cos(c.yaw);
    const lx = dx * co - dz * s, lz = dx * s + dz * co;
    const wasCrushed = c.crush >= 0.45;
    c.crush = Math.min(1, c.crush + 0.42);
    if (!wasCrushed && c.crush >= 0.45) this.carsCrushed++;
    c.crushTilt = clamp(c.crushTilt + (lx >= 0 ? -0.05 : 0.05), -0.14, 0.14);
    c.glassBroken = true;
    if (c.crush > 0.6) c.headDead = true;
    c.vPitch = clamp(c.vPitch + (lz >= 0 ? 1 : -1) * 1.6, -2.6, 2.6);
    c.vRoll = clamp(c.vRoll + (lx >= 0 ? -1 : 1) * 1.9, -3.2, 3.2);
    c.vx += vx * 0.22; c.vz += vz * 0.22;
    c.vYaw += (lx * vz - lz * vx) * 0.03;
    this.events.push({ src: 'lot', type: 'carCrunch', id: c.id, x: fx, y: c.y + 1.0, z: fz, strength: 1.9 });
    if (noises) noises.push({ x: c.x, y: c.y + 1.0, z: c.z, loud: 0.72, kind: 'bang' });
    // Stomping a car trips its alarm on first crunch, or kills a blaring alarm once crushed flat
    if (c.crush >= 0.85 && c.alarmT > 0) { c.alarmT = 0; c.alarmLeft = 0; }
    else if (c.locked && c.alarmLeft > 0 && c.alarmT <= 0.5 && noises) this.tripAlarm(c, noises, false);
    this._syncColliders(c, false);
  }

  tripAlarm(c, noises, byPlayer = false) {
    if (c.alarmT > 1 || c.alarmLeft <= 0 || c.crush >= 0.85) return false;
    c.alarmLeft--; c.alarmT = ALARM_DUR; c.alarmAcc = 0; c.hazards = true; this.alarmsTripped++;
    this.impactCar(c, 0.3, 0.4, 0.55, false);
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

  interactable(you) {
    let best = null, bs = 1e9;
    for (const c of this.cars) {
      const d = this._distToCar(c, you.x, you.z);
      if (d > 1.55) continue;
      const hit = c.hasFlares && c.flaresLeft > 0 ? { car: c, label: 'take the spare flares', action: 'flares' }
        : c.openDoor && c.flipped === 0 ? { car: c, label: 'sound the horn', action: 'horn' }
        : c.locked && c.alarmLeft > 0 && c.alarmT <= 0.5 && c.crush < 0.85 ? { car: c, label: 'thump the car', action: 'alarm' }
        : null;
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
      // Visitor A's flashlight is shielded low behind cover while hiding, and swings up bright when sprinting!
      const torch = !!(k.hasTorch && k.state === 'sprint');
      out.push({ id: k.id, x: k.x, y: this._groundY(k.x, k.z) + k.eye, z: k.z, vx: k.vx, vz: k.vz, speed: Math.hypot(k.vx, k.vz), crouch: k.crouch, fx: Math.sin(k.yaw), fz: Math.cos(k.yaw), torch });
    }
    return out;
  }

  /** Lit things for the animal's eyes: flashing alarms and high beams. */
  extraLights() {
    const out = [];
    for (const c of this.cars) {
      if (!(c.alarmT > 0 || c.beamsT > 0)) continue;
      const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
      out.push({ id: `carlight.${c.id}`, kind: 'carlight', x: c.x + s * c.l * 0.5, y: c.y + 0.85, z: c.z + co * c.l * 0.5, speed: 0, rest: true, bright: c.beamsT > 0 ? 1.0 : (Math.floor(this.t * 4) % 2 === 0 ? 0.85 : 0.2), hot: false, edible: false, missile: false, scent: 0, amount: 0, by: 'world' });
    }
    return out;
  }

  _coverPoint(stop, next, sim, i, leaving) {
    if (stop.kind !== 'lane') return { x: stop.x + (i ? 0.55 : -0.55), z: stop.z + (i ? 0.65 : 0) };
    const lo = stop.z0 + 0.6, hi = stop.z1 - 0.6, mid = (lo + hi) / 2;
    let end;
    if (leaving && next) end = (next.z ?? next.z0) > mid ? hi : lo;
    else end = sim.z > mid ? lo : hi;
    return { x: stop.x, z: end + (end === lo ? 1 : -1) * i * 0.85 };
  }

  _entry(stop, from, i) {
    if (stop.kind !== 'lane') return { x: stop.x + (i ? 0.55 : -0.55), z: stop.z };
    return { x: stop.x, z: Math.abs(from.z - stop.z0) < Math.abs(from.z - stop.z1) ? stop.z0 + 0.4 : stop.z1 - 0.4 };
  }

  _carDomino(c, noises) {
    const cr = Math.max(c.l, c.w) * 0.52;
    for (const o of this.cars) {
      if (o === c) continue;
      const dx = o.x - c.x, dz = o.z - c.z, maxD = cr + Math.max(o.l, o.w) * 0.52;
      if (dx * dx + dz * dz > maxD * maxD) continue;
      // Check closest collider pair
      let minD = 1e9, nx = 0, nz = 0, overlap = 0;
      for (const a of c.cols) for (const b of o.cols) {
        const px = b.x - a.x, pz = b.z - a.z, d = Math.hypot(px, pz), m = a.r + b.r;
        if (d < m && d < minD) { minD = d; overlap = m - d; nx = d > 1e-4 ? px / d : 1; nz = d > 1e-4 ? pz / d : 0; }
      }
      if (overlap <= 0) continue;
      // Separate and exchange momentum (real car-to-car domino shunt)
      c.x -= nx * overlap * 0.45; c.z -= nz * overlap * 0.45;
      o.x += nx * overlap * 0.55; o.z += nz * overlap * 0.55;
      const rvx = c.vx - o.vx, rvz = c.vz - o.vz, vn = rvx * nx + rvz * nz;
      if (vn > 0.25) {
        const j = vn * 0.72;
        c.vx -= nx * j * 0.55; c.vz -= nz * j * 0.55;
        o.vx += nx * j * 0.85; o.vz += nz * j * 0.85;
        const sO = Math.sin(o.yaw), coO = Math.cos(o.yaw), acrossO = nx * coO - nz * sO;
        o.vYaw += acrossO * j * 0.14;
        o.vRoll = clamp(o.vRoll + acrossO * j * 0.45, -5.5, 5.5);
        o.vPitch = clamp(o.vPitch + (nx * sO + nz * coO) * j * 0.25, -2.5, 2.5);
        if (vn > 1.2) {
          this.events.push({ src: 'lot', type: 'carCrunch', id: o.id, x: (c.x + o.x) / 2, y: o.y + 0.85, z: (c.z + o.z) / 2, strength: clamp(vn * 0.45, 0.7, 2.2) });
          if (o.locked && vn > 1.6) this.tripAlarm(o, noises, false);
        }
      }
      this._syncColliders(o, false);
    }
  }

  _carsStep(dt, sim, arena, things, noises) {
    const bound = this.lot.fence - 2.6;
    const hits = [];
    for (const e of arena.events) if (e.src === 'sim' && e.type === 'contact') hits.push(e);
    const moving = Math.abs(sim.v);
    const rvx = Math.sin(sim.psiV ?? sim.psi) * sim.v, rvz = Math.cos(sim.psiV ?? sim.psi) * sim.v;
    const acting = !!(sim.act && /^(butt|strike|snap|seize|swipe)$/.test(sim.act.kind));
    const tailMid = sim.tail && sim.tail[4] ? sim.tail[4].p : null;
    const chest = sim.spine && sim.spine[18] ? sim.spine[18].p : null;

    for (const c of this.cars) {
      if (c.bumpCD > 0) c.bumpCD -= dt;
      if (c.footCD > 0) c.footCD -= dt;

      // Pitch spring
      c.vPitch += (-SPRING_K * c.pitch - SPRING_C * c.vPitch) * dt;
      c.pitch = clamp(c.pitch + c.vPitch * dt, -0.32, 0.32);

      // Roll dynamics: upright spring below tipping point (~30 deg), gravity tips onto side (±PI/2) or roof (±PI) past it
      if (c.flipped === 0) {
        if (Math.abs(c.roll) > 0.52) {
          c.flipped = c.roll > 0 ? 1 : -1;
          c.tramplable = true;
          c.glassBroken = true;
          c.headDead = true;
          c.crush = Math.max(c.crush, 0.38);
          this.carsFlipped++;
          this.events.push({ src: 'lot', type: 'carFlip', id: c.id, x: c.x, y: c.y + 1.0, z: c.z, strength: 2.4 });
          noises.push({ x: c.x, y: c.y + 1.0, z: c.z, loud: 0.92, kind: 'bang' });
          if (c.locked && c.alarmLeft > 0) this.tripAlarm(c, noises, false);
          this._syncColliders(c, true);
        } else {
          c.vRoll += (-SPRING_K * c.roll - SPRING_C * c.vRoll) * dt;
        }
      } else {
        // Already tipping onto side or roof
        if (Math.abs(c.flipped) === 1 && Math.abs(c.roll) > 1.72 && Math.sign(c.vRoll) === Math.sign(c.roll) && Math.abs(c.vRoll) > 1.8) {
          c.flipped = c.roll > 0 ? 2 : -2;      // enough momentum to roll all the way onto its roof
        }
        const tgt = Math.abs(c.flipped) === 2 ? Math.sign(c.flipped) * Math.PI : Math.sign(c.flipped) * (Math.PI / 2);
        c.vRoll += (FLIP_K * (tgt - c.roll) - FLIP_C * c.vRoll) * dt;
      }
      c.roll = clamp(c.roll + c.vRoll * dt, -Math.PI - 0.18, Math.PI + 0.18);

      // Skid & domino collisions
      if (Math.abs(c.vx) > 0.02 || Math.abs(c.vz) > 0.02 || Math.abs(c.vYaw) > 0.01) {
        c.x = clamp(c.x + c.vx * dt, -bound, bound);
        c.z = clamp(c.z + c.vz * dt, -bound, bound);
        c.yaw += c.vYaw * dt;
        const damp = Math.exp(-SKID_DRAG * dt);
        c.vx *= damp; c.vz *= damp; c.vYaw *= Math.exp(-YAW_DRAG * dt);
        c.y = this._groundY(c.x, c.z);
        this._syncColliders(c, false);
        this._carDomino(c, noises);
        if (Math.hypot(c.x - c.navX, c.z - c.navZ) > 0.7) c.navDirty = true;
      } else if (c.navDirty) {
        c.navDirty = false; c.navX = c.x; c.navZ = c.z;
        this._syncColliders(c, true);      // rebuild nav grid only once a moved tall car comes to rest
      }

      // Alarms, horns, high beams
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

      // 1. Rex feet trampling / crushing low cars (and overturned wrecks)
      if (c.tramplable && c.footCD <= 0 && sim.feet) {
        const s = Math.sin(c.yaw), co = Math.cos(c.yaw), hw = c.w * 0.5 + 0.42, hl = c.l * 0.5 + 0.42;
        for (const f of sim.feet) {
          if (!f.planted) continue;
          const dx = f.pos.x - c.x, dz = f.pos.z - c.z;
          const lx = dx * co - dz * s, lz = dx * s + dz * co;
          if (Math.abs(lx) < hw && Math.abs(lz) < hl) {
            this.trampleCar(c, f.pos.x, f.pos.z, rvx, rvz, noises);
            c.footCD = 0.42;
            break;
          }
        }
      }

      // 2. Rex body, snout/headbutt, chest barge, and tail-whip impacts
      if (c.bumpCD <= 0) {
        let hit = null;
        for (const e of hits) {
          if (this._distToCar(c, e.x, e.z) < 1.0) { hit = { x: e.x, z: e.z, str: clamp(0.8 + (e.force || 0) * 0.35 + moving * 0.22, 0.7, 3.0) }; break; }
        }
        if (!hit && sim.head) {
          const H = sim.head.pos;
          if (H.y < c.y + c.h + 0.75 && this._distToCar(c, H.x, H.z) < (acting ? 1.15 : 0.45)) {
            hit = { x: H.x, z: H.z, str: clamp(0.75 + moving * 0.28 + (acting ? 1.65 : 0), 0.6, 3.0) };
          }
        }
        if (!hit && !c.tramplable && moving > 0.8) {
          // Tall car in the rex's path: chest or hips shove it aside rather than snagging endlessly
          const px = chest ? chest.x : sim.x, pz = chest ? chest.z : sim.z;
          if (this._distToCar(c, px, pz) < 1.35) {
            hit = { x: px, z: pz, str: clamp(0.9 + moving * 0.32, 0.9, 2.9) };
          }
        }
        if (!hit && tailMid && Math.abs(sim.om) > 0.35 && tailMid.y < c.y + c.h + 0.7 && this._distToCar(c, tailMid.x, tailMid.z) < 0.85) {
          hit = { x: tailMid.x, z: tailMid.z, str: clamp(0.85 + Math.abs(sim.om) * 1.1, 0.8, 2.3) };
        }
        if (hit) {
          const dx = c.x - hit.x, dz = c.z - hit.z, dl = Math.hypot(dx, dz) || 1;
          this.impactCar(c, dx / dl, dz / dl, hit.str, true, noises);
          c.bumpCD = 0.36;
          if (c.locked && hit.str > 0.9) this.tripAlarm(c, noises, false);
        }
      }

      // 3. Burning flare landing on a locked car trips its alarm
      if (things && c.locked && c.alarmLeft > 0 && c.alarmT <= 0.5) {
        for (const o of things.list) {
          if (o.kind === 'flare' && o.burn > 0 && o.y < c.y + c.h + 0.7 && this._distToCar(c, o.x, o.z) < 0.35) {
            this.tripAlarm(c, noises, true); break;
          }
        }
      }
    }
  }

  _clearRun(k, p, sim, heeded) {
    const rash = clamp((k.pinT - KID.nerveFrom) / (KID.nerveFull - KID.nerveFrom), 0, 1);
    const f0 = heeded ? KID.heed : KID.unheeded, f = f0 + (Math.min(f0, KID.rash) - f0) * rash;
    const dx = p.x - k.x, dz = p.z - k.z, len = Math.hypot(dx, dz) || 1e-6;
    const u = clamp(((sim.x - k.x) * dx + (sim.z - k.z) * dz) / (len * len), 0, 1);
    const near = Math.hypot(sim.x - (k.x + dx * u), sim.z - (k.z + dz * u));
    return near > KID.margin + KID.rexPace * (len / KID.run) * f;
  }

  step(dt, sim, mind, arena, things, noises, playerDead = false) {
    this.t += dt;
    this._carsStep(dt, sim, arena, things, noises);
    const T = this.T;

    if (!this.active) {
      // On the start CCTV feed: crouched by the stalled minivan, Visitor A sweeping their flashlight nervously between rex & exit
      const ex = this.lot.evac;
      for (const k of this.kids) {
        k.vx = k.vz = 0; k.crouch = true; k.eye = 0.85;
        k.yaw = Math.atan2(sim.x - k.x, sim.z - k.z);
        if (k.hasTorch) {
          const toExit = Math.atan2(ex.x - k.x, ex.z - k.z), toRex = Math.atan2(sim.x - k.x, sim.z - k.z);
          const sw = 0.5 + 0.5 * Math.sin(this.t * 1.15);
          k.torchAim = { yaw: toExit * sw + toRex * (1 - sw), pitch: -0.18 + 0.06 * Math.sin(this.t * 2.3), active: true, low: false };
        }
      }
      return;
    }

    // Opening beat: ~1.2 s after looking up from the monitor, they break from the stalled van for row B with a brief
    // panic horn/slam that turns the rex's head toward them without keeping it stuck at the van for 14 seconds.
    if (!this.introDashed && this.t - this.activeAt >= 1.2) {
      this.introDashed = true;
      for (const k of this.kids) if (k.state === 'cover' && k.stop === 0) this._go(k);
      const van = this.byId.get(this.stops[0].carId);
      if (van) {
        van.hornT = 1.6;
        this.impactCar(van, 0.3, 0.3, 0.5, false);
        noises.push({ x: van.x, y: van.y + 1.1, z: van.z, loud: 0.92, kind: 'horn' });
        this.events.push({ src: 'lot', type: 'carHorn', id: van.id, x: van.x, y: van.y + 1.1, z: van.z });
      }
    }

    const tg = mind.know && mind.know.seen && mind.know.target, onKids = !!(tg && typeof tg.id === 'string' && tg.id.startsWith('kid'));
    const fwdX = Math.sin(sim.psi), fwdZ = Math.cos(sim.psi);
    const drawn = this.cars.some((c) => (c.alarmT > 0 || c.hornT > 0) && Math.hypot(c.x - sim.x, c.z - sim.z) < 16);
    let escaped = 0, dead = 0;
    for (let i = 0; i < this.kids.length; i++) {
      const k = this.kids[i], v = arena.victims.get(k.id);
      if (v && v.dead && k.state !== 'dead') {
        k.state = 'dead'; k.vx = k.vz = 0;
        if (k.hasTorch && !this.droppedTorch) {
          this.droppedTorch = { x: k.x, y: this._groundY(k.x, k.z) + 0.06, z: k.z, yaw: k.yaw + 0.6 };
          k.torchAim.active = false;
        }
        this.events.push({ src: 'lot', type: 'kidLost', id: k.id, name: k.name, x: k.x, z: k.z });
      }
      if (k.state === 'escaped') { escaped++; continue; }
      if (k.state === 'dead') { dead++; continue; }
      if (v && !v.free) { k.x = v.x; k.z = v.z; k.vx = v.vx; k.vz = v.vz; if (k.hasTorch) k.torchAim.active = false; continue; }

      const dRex = Math.hypot(sim.x - k.x, sim.z - k.z), facing = (fwdX * (k.x - sim.x) + fwdZ * (k.z - sim.z)) / (dRex || 1);
      const heeded = !drawn && (onKids || (facing > 0.5 && dRex < 26));
      const stop = this.stops[k.stop], next = this.stops[k.stop + 1];

      if (k.state === 'cover') {
        const ready = !heeded && dRex > 18;
        const cp = this._coverPoint(stop, next, sim, i, ready);
        const dx = cp.x - k.x, dz = cp.z - k.z, d = Math.hypot(dx, dz);
        if (d > 0.25) { const sp = Math.min(KID.scurry, d * 4); k.vx = dx / d * sp; k.vz = dz / d * sp; k.x += k.vx * dt; k.z += k.vz * dt; k.yaw = Math.atan2(k.vx, k.vz); }
        else { k.vx = k.vz = 0; k.yaw = ready && next ? Math.atan2(next.x - k.x, (next.z ?? next.z0) - k.z) : Math.atan2(sim.x - k.x, sim.z - k.z); }
        k.crouch = !(ready && d < 0.6); k.eye = k.crouch ? 0.88 : 1.3;
        if (k.hasTorch) {
          // Shielded low beam on the wet asphalt/fender in cover so the player can always locate them without UI
          const aimTo = next ? Math.atan2(next.x - k.x, (next.z ?? next.z0) - k.z) : k.yaw;
          k.torchAim = { yaw: aimTo + Math.sin(this.t * 1.9) * 0.28, pitch: ready ? -0.32 : -0.56, active: true, low: true };
        }
        if (k.waitT > 0) k.waitT -= dt;
        if (dRex < 11 && !drawn) { k.nerveT += dt; if (k.nerveT >= 2.2) { k.nerveT = 0; noises.push({ x: k.x, y: this._groundY(k.x, k.z) + 0.8, z: k.z, loud: 0.38, kind: 'step' }); } } else k.nerveT = 0;
        if (next && k.waitT <= 0) {
          k.pinT += dt;
          const rash = k.pinT > KID.nerveFrom && dRex > 11;
          if ((ready || rash) && (d < 0.6 || rash) && this._clearRun(k, this._entry(next, k, i), sim, heeded)) this._go(k);
        }
      } else {
        k.runT += dt;
        const tp = this._entry(next, k, i), dx = tp.x - k.x, dz = tp.z - k.z, d = Math.hypot(dx, dz);
        if (k.stop > 0 && facing > 0.6 && dRex < 14 && k.runLen - d < k.runLen * 0.35 && !this._clearRun(k, tp, sim, true)) {
          k.state = 'cover'; k.waitT = 2.6; k.pinT = Math.max(0, k.pinT - 12);
          this.events.push({ src: 'lot', type: 'kidBack', id: k.id, x: k.x, z: k.z });
          continue;
        }
        k.vx = dx / (d || 1) * KID.run; k.vz = dz / (d || 1) * KID.run;
        k.x += k.vx * dt; k.z += k.vz * dt;
        const g = this._groundY(k.x, k.z), p = { x: k.x, z: k.z };
        T.pushOut(p, 0.3, g + 0.1, g + 1.4, 2); k.x = p.x; k.z = p.z;
        k.yaw = Math.atan2(k.vx, k.vz); k.crouch = false; k.eye = 1.32;
        if (k.hasTorch) {
          // Bright forward bouncing beam while sprinting across the aisle toward the next cover or the exit
          k.torchAim = { yaw: k.yaw + Math.sin(this.t * 11) * 0.14, pitch: -0.14 + Math.sin(this.t * 22) * 0.08, active: true, low: false };
        }
        k.stepT += dt;
        if (k.stepT >= 0.3) { k.stepT = 0; const wet = T.depthAt && T.depthAt(k.x, k.z) > 0.04; noises.push({ x: k.x, y: g + 0.2, z: k.z, loud: wet ? 0.6 : 0.4, kind: wet ? 'splash' : 'step' }); }
        if (d < 0.7) {
          k.stop++;
          if (this.stops[k.stop].kind === 'exit') {
            k.state = 'escaped'; k.vx = k.vz = 0; escaped++;
            if (k.hasTorch) k.torchAim.active = false;
            this.events.push({ src: 'lot', type: 'kidEscaped', id: k.id, name: k.name, x: k.x, z: k.z });
          } else {
            k.state = 'cover'; k.waitT = KID.wait[0] + (KID.wait[1] - KID.wait[0]) * ((i * 0.618 + k.stop * 0.37) % 1);
          }
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
