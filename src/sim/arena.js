// The shared simulation of the paddock: the animal's body and mind, the objects in the world and
// the prey herd, stepped together at a fixed rate with their consequences routed between them
// (a footfall stamps out a flare, a bite takes meat, a kill leaves a carcass, an impact is a sound).
// People's bodies are here too (victim.js): what the animal does to them physically (a butt or a tail that connects, jaws
// that close on them, a foot put down on them) is decided by contact between the simulated body and theirs, not by the mind.
// A person can also reach out a hand (`agent.hand`): resting on the animal's snout or on its sore foot it is a touch the mind
// answers (lets you, or warns you off); held long enough on a lodged thorn while it allows it, it pulls the thorn out. Meat can be
// held out in the hand (`offer`) for it to take, and meat it is eating can be taken away (`take`).
// Network-agnostic: inputs are throws, struggles, hands and the people's states; outputs are events for the view.
import { Things } from './things.js';
import { Herd } from './herd.js';
import { Victim } from './victim.js';
import { clamp } from '../math.js';
import { tune } from '../rex/tune.js';      // tune

// What is left of someone it killed to eat: gone in this many mouthfuls (owner 2026-11-15: "the meat resource the body represents
// should be depleted pretty quickly, a bite or two. in a long play session the rex is distracted for a long time eating the body
// and its boring"). It was about forty mouthfuls, two minutes and more.
const REMAINS = 2.2, REMAINS_MOUTHFULS = 2;
const EAT = { mouthfuls: REMAINS_MOUTHFULS, amount: REMAINS };      // tune: how long it eats (read live)
tune('Mind: hunger, killing, curiosity', 'How many mouthfuls the remains last', EAT, 'mouthfuls', 1, 12, 0.5, null, 'arena.remainsMouthfuls');      // tune
tune('Mind: hunger, killing, curiosity', 'How much there is to eat of a person', EAT, 'amount', 0.5, 8, 0.1, null, 'arena.remainsAmount', 'next kill');      // tune

export class Arena {
  constructor(terrain, sim, mind, seed = 1) {
    this.T = terrain; this.sim = sim; this.mind = mind;
    this.things = new Things(terrain); this.herd = new Herd(terrain, seed);
    this.events = []; this.noises = []; this.hits = []; this.victims = new Map(); this.wade = new Map();
    this.t = 0; this.meatT = new Map(); this.meatSeen = new Set();      // who has handled meat lately: it is on their hands
  }
  /** A person's body, as the animal can handle it (created on first use). */
  victim(id = 'you') { let v = this.victims.get(id); if (!v) { v = new Victim(id); this.victims.set(id, v); } return v; }
  /** A new life for a dead person, at (x, z) or at `spawnPoint`. It is a new individual (`victim.who` changes): the animal
   *  knew the dead one, not this one, and meets it afresh (mind.js `_forget`, `kind`). A second player is the same mechanism. */
  respawn(id = 'you', x = null, z = null) {
    const v = this.victim(id); if (x === null) ({ x, z } = this.spawnPoint());
    v.respawn(x, z, this.T); for (const e of v.events) this.events.push({ src: 'victim', ...e }); v.events.length = 0;
    return { x, z };
  }
  /** A start point: open ground 38-55 m from the animal, as far from it as the paddock allows (deterministic). */
  spawnPoint() {
    const sim = this.sim, T = this.T; let best = null, bs = -1e9;
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * 6.283, r = 38 + 17 * ((k * 7) % 5) / 4, x = sim.x + Math.sin(a) * r, z = sim.z + Math.cos(a) * r;
      if ((T.rect ? x < T.rect.x0 + 10 || x > T.rect.x1 - 10 || z < T.rect.z0 + 10 || z > T.rect.z1 - 10 : Math.hypot(x, z) > T.arena - 10) || T.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 2.5) || (T.insideStructure && T.insideStructure(x, z))) continue;
      const s = Math.hypot(x - sim.x, z - sim.z) - 0.6 * Math.abs(Math.cos(a - sim.psi)) * 20 * (Math.cos(a - sim.psi) > 0 ? 1 : 0);      // not straight in front of it
      if (s > bs) { bs = s; best = { x, z }; }
    }
    return best || { x: sim.x + 45, z: sim.z };
  }
  /** Input: the person struggles (one key press; a held key can call this every tick with a small k). */
  struggle(id = 'you', k = 1) { this.victim(id).input(k); }
  /** Input: hold a piece of meat out in your hand (it stays there while your hand is out, or a few seconds). */
  offer(id = 'you') {
    const a = this._src && this._src.get(id); if (!a) return null;
    if (this.things.list.some((o) => o.hand === id)) return null;
    const h = handPoint(a), o = this.things.place('meat', h.x, h.z, { by: id, hand: id, holdT: 6, amount: 0.3 }); o.y = h.y;
    this.events.push({ src: 'arena', type: 'offer', id, x: h.x, y: h.y, z: h.z });
    return o;
  }
  /** Input: take a piece of meat off the ground (the animal may have been eating it). */
  take(thingId, by = 'you') {
    const o = this.things.get(thingId); if (!o) return false;
    this.things.remove(thingId); this.mind.onTaken(thingId, by, o); if (o.kind === 'meat' || o.kind === 'carcass') this.meatT.set(by, this.t);
    this.events.push({ src: 'arena', type: 'taken', id: thingId, by, x: o.x, y: o.y, z: o.z });
    return true;
  }
  /** One fixed step. world: { agents, noises, light, flash, wind }; intentOverride replaces the mind (directed mode). */
  /** The start of a game: you arrive at `you` {x, z} (the gate's clatter and your first footfalls are heard), and the animal on
   *  the Lawn meets a new small thing: fed enough not to want you, rested, curious. What it does about you is the mind's own
   *  (mind.opening only weighs novelty over the herd it knows and holds back posturing while nothing has provoked it). */
  opening(you, secs = 45, hunger = [0.35, 0.5]) {
    const m = this.mind, sim = this.sim;
    // it stands close enough that its thoughts can be read from the gate (the bubble is legible within ~30 m): moved in along
    // the line between you, so whatever framed it before still frames it
    { const dx = sim.x - you.x, dz = sim.z - you.z, d = Math.hypot(dx, dz), D = 24; if (d > D + 1 && sim.t < 0.5) { const k = D / d; sim.reset(you.x + dx * k, you.z + dz * k, sim.psi); } }
    m.hunger = Math.min(Math.max(m.hunger, hunger[0]), hunger[1]); m.mood.interest = Math.max(m.mood.interest, 0.5); m.mood.boredom = 0.1; m.mood.arousal = Math.max(m.mood.arousal, 0.3);
    m.opening = { t0: m.t, until: m.t + secs, x: you.x, z: you.z };
  }
  step(dt, world, intentOverride = null) {
    const sim = this.sim, mind = this.mind, things = this.things, herd = this.herd;
    // the world first: objects fly and land, the herd moves
    things.step(dt, sim); this.t += dt;
    if (this.T.stepDoors) this.T.stepDoors(dt, sim, this.events);      // doors and shutters: burst open by its head or chest, swung by you
    this._src = new Map(world.agents.map((a) => [a.id, a]));
    // meat thrown, held out or picked up leaves its smell on you for a minute or so (`meaty`, 0..1)
    const held = new Set();
    for (const o of things.list) if (o.kind === 'meat' && o.by && o.by !== 'world') { if (o.hand) held.add(o.hand); if (!this.meatSeen.has(o.id)) { this.meatSeen.add(o.id); this.meatT.set(o.by, this.t); } }
    const meaty = (id) => (held.has(id) ? 1 : this.meatT.has(id) ? 0.7 * clamp(1 - (this.t - this.meatT.get(id)) / 90, 0, 1) : 0);
    const agents = world.agents.filter((a) => !(bodied(a) && this.victims.has(a.id) && this.victims.get(a.id).gone)).map((a) => (bodied(a) ? { ...this.victim(a.id).report(a), meaty: a.meaty ?? meaty(a.id) } : a));
    world = { ...world, agents };
    const threats = [{ x: sim.x, z: sim.z, vx: Math.sin(sim.psiV) * sim.v, vz: Math.cos(sim.psiV) * sim.v, speed: Math.abs(sim.v), stalk: sim.stalk > 0.5, big: true }, ...world.agents.map((a) => ({ x: a.x, z: a.z, vx: a.vx, vz: a.vz, speed: a.speed, stalk: a.crouch, big: false }))];
    if (!herd.disabled) herd.step(dt, threats, [...world.noises, ...this.noises]);
    // wading is loud: a person on their feet moving through water splashes at every stride (heard as a footstep, `splash`)
    if (this.T.depthAt) for (const a of agents) {
      if (!bodied(a) || (a.state && a.state !== 'free') || !(a.speed > 0.4)) { this.wade.delete(a.id); continue; }
      const dep = this.T.depthAt(a.x, a.z); if (dep < 0.1) { this.wade.delete(a.id); continue; }
      let s = (this.wade.get(a.id) ?? 0.6) + a.speed * dt;
      if (s > 0.9) { s = 0; const loud = (a.crouch ? 0.05 : a.speed > 4 ? 0.26 : 0.13) * Math.min(1.3, 0.6 + dep); this.noises.push({ x: a.x, y: this.T.height(a.x, a.z), z: a.z, loud, kind: 'step', splash: true }); this.events.push({ src: 'arena', type: 'splash', id: a.id, x: a.x, z: a.z, depth: dep, loud }); }
      this.wade.set(a.id, s);
    }
    const noises = [...world.noises, ...this.noises]; this.noises = [];
    // meat held out in a hand goes where the hand goes; dropped when the hand is withdrawn
    for (const o of things.list) if (o.hand) {
      const a = this._src.get(o.hand), v = this.victims.get(o.hand);
      if (a && a.hand) o.holdT = Math.max(o.holdT, 0.4);
      o.holdT -= dt;
      if (!a || o.holdT <= 0 || (v && !v.free)) { o.hand = null; o.rest = false; o.vx = o.vz = 0; o.vy = 0; o.bounces = 0; }
      else { const h = handPoint(a); o.x = h.x; o.y = h.y; o.z = h.z; }
    }
    // a hand on the animal: its snout, or a sore foot
    const touch = [], inj = sim.injury;
    for (const a of world.agents) {
      if (!a.hand || !bodied(a) || (a.state && a.state !== 'free')) continue;
      const h = handPoint(a), H = sim.head, L = sim.species.dims.headLen;
      let ds = 99; for (let k = 3; k <= 6; k++) { const u = k / 6 * L; ds = Math.min(ds, Math.hypot(H.pos.x + H.f.x * u - h.x, H.pos.y + H.f.y * u - 0.12 - h.y, H.pos.z + H.f.z * u - h.z)); }
      if (ds < 0.62) { touch.push({ id: a.id, part: 'snout', hand: h }); continue; }
      if (inj && inj.thorn) { const f = sim.feet[inj.foot].pos; if (Math.hypot(f.x - h.x, f.z - h.z) < 1.05 && h.y - f.y < 1.6) touch.push({ id: a.id, part: 'foot', hand: h }); }
    }
    this.touch = touch;
    for (const e of things.events) {
      if (e.type === 'impact') noises.push({ x: e.x, y: e.y, z: e.z, loud: e.loud, kind: e.kind === 'stone' ? 'stone' : 'thud' });
      if (e.type === 'hit') { this.hits.push(e); noises.push({ x: e.x, y: e.y, z: e.z, loud: 0.3, kind: 'hit' }); }
      if (e.type === 'eaten' && e.prey) herd.gone(e.prey);
      this.events.push({ src: 'things', ...e });
    }
    things.events.length = 0;
    for (const e of herd.events) { if (e.type === 'alarm') noises.push({ x: e.x, y: 0, z: e.z, loud: 0.35, kind: 'prey' }); this.events.push({ src: 'herd', ...e }); }
    herd.events.length = 0;
    // the animal
    let intent = intentOverride;
    if (!intent) {
      intent = mind.step(dt, { ...world, noises, things: things.snapshot(), prey: herd.disabled ? [] : herd.snapshot(), hits: this.hits, touch });
      this.hits = [];
      for (const e of mind.events) {
        if (e.type === 'handfed') { const o = things.get(e.id); if (o) { things.remove(e.id); e.x = o.x; e.y = o.y; e.z = o.z; } }
        if (e.type === 'bite' || e.type === 'tear') { const o = things.get(e.id); if (o) { const take = o.of ? Math.max(e.amount, EAT.amount / EAT.mouthfuls) : e.amount; o.amount = Math.max(0, o.amount - take); if (o.amount < 0.05) o.amount = 0; if (o.of && mind.kind) mind.kind.ate += take; } }
        if (e.type === 'kill') { const p = herd.kill(e.id); if (p) things.place('carcass', p.x, p.z, { prey: p.id, yaw: p.yaw }); }
        this.events.push({ src: 'mind', ...e });
      }
      mind.events.length = 0;
    } else this.hits = [];
    // the thorn: worked loose while a hand stays on the foot and the animal bears it; then the foot heals over a few minutes
    if (inj) {
      const t = touch.find((q) => q.part === 'foot');
      if (inj.thorn) {
        inj.sev = inj.base ?? 0.85;
        if (t && mind.allowPull && !intentOverride) inj.pull = (inj.pull || 0) + dt / 2.6; else inj.pull = Math.max(0, (inj.pull || 0) - dt * 0.06);
        if (inj.pull >= 1) {
          inj.thorn = false; inj.pull = 0; inj.outT = 0; const f = sim.feet[inj.foot].pos;
          this.events.push({ src: 'arena', type: 'thorn', by: t ? t.id : null, x: f.x, y: f.y + 0.3, z: f.z });
          this.noises.push({ x: f.x, y: f.y, z: f.z, loud: 0.3, kind: 'yelp' });
          if (!intentOverride) mind.onThorn(t ? t.id : null);
        }
      } else { inj.outT = (inj.outT || 0) + dt; inj.sev = Math.max(0, (inj.base ?? 0.85) * (1 - inj.outT / (inj.healS || 170))); if (inj.sev <= 0.01) sim.injury = null; }
    }
    sim.step(dt, intent);
    // people's bodies: follow the person, or the animal, and settle what touched what
    for (const a of world.agents) {
      if (!bodied(a)) continue;
      const v = this.victim(a.id), src = this._src && this._src.get(a.id);
      v.step(dt, src || a, sim, this.T);
      this._contact(dt, v, intent);
      for (const e of v.events) {
        this.events.push({ src: 'victim', ...e }); if (e.type === 'landed' && e.speed > 3) this.noises.push({ x: e.x, y: e.y, z: e.z, loud: 0.25, kind: 'thud' });
        if (e.type === 'hurt' && e.amt > 0.04) this.noises.push({ x: e.x, y: e.y, z: e.z, loud: 0.2, kind: 'cry' });
        if (e.type === 'death' && !intentOverride) {
          // killed hungry, it eats you: what is left is meat on the ground; otherwise a body lying there
          const eat = e.motive === 'prey' || (mind.hunger > 0.62 && e.motive !== 'play');
          if (eat) { const o = things.place('carcass', e.x, e.z, { of: v.id, amount: EAT.amount }); v.gone = true; this.events.push({ src: 'arena', type: 'remains', id: o.id, of: v.id, x: o.x, y: o.y, z: o.z }); }
          mind.onKill(v.id, e.cause, eat, v.who);
        }
      }
      v.events.length = 0;
    }
    for (const e of sim.events) {
      if (e.type === 'footfall') things.footfall(e.x, e.z);
      if (e.type === 'roar') this.noises.push({ x: e.x ?? sim.x, y: 0, z: e.z ?? sim.z, loud: 1, kind: 'roar' });
      if (e.type === 'wince' && !intentOverride) mind.onPain(e.k || 0.5);
      this.events.push({ src: 'sim', ...e });
    }
    sim.events.length = 0;
    return intent;
  }

  /** Contact between the animal's body and a person's: a butt or a sweeping tail knocks them flying, jaws closing on them
   *  take hold, a foot planted on someone lying down pins them; and what the jaws do with what they hold. */
  _contact(dt, v, intent) {
    const sim = this.sim, act = sim.act, u = act ? act.t / act.dur : 0, h = sim.head, L = sim.species.dims.headLen, T = this.T;
    const standing = v.state === 'free', g = standing ? Math.max(T.height(v.x, v.z), v.y || -1e9) : T.height(v.x, v.z), lying = v.state === 'down' || v.state === 'rising';
    const b = this.mind.beh, motive = b && b.motive ? b.motive : 'anger';      // why it is doing it (mind.js): prey, anger, play
    const y0 = g + 0.05, y1 = g + (standing ? 1.75 : 0.45), rad = standing ? 0.3 : 0.45;
    // distance from a point to the person's body (a vertical capsule)
    const toBody = (x, y, z) => Math.hypot(x - v.x, clamp(y, y0, y1) - y, z - v.z);
    // the committed strike (peril.js): jaws that reach you kill you, whatever state you are in
    if (act && act.kind === 'strike' && !act.hit && !v.dead && v.state !== 'air') {
      let best = 99; for (let k = 0; k <= 4; k++) { const s = (0.1 + 0.9 * k / 4) * L; best = Math.min(best, toBody(h.pos.x + h.f.x * s, h.pos.y + h.f.y * s - 0.3, h.pos.z + h.f.z * s)); }      // the open lower jaw hangs below the skull's line
      if (best < rad + 0.5 || v.state === 'held') {
        act.hit = true; act.hitT = act.t;
        this.events.push({ src: 'arena', type: 'struck', id: v.id, t: act.t, x: v.x, y: v.y, z: v.z });
        v.kill(v.state === 'held' ? 'crushed' : v.state === 'pinned' ? 'pinned' : 'bitten', motive === 'play' ? 'anger' : motive);
        return;
      }
    }
    if (act && (standing || lying) && !act.hit) {
      if (act.kind === 'butt' && u > 0.4 && u < 0.8) {
        let best = 99; for (let k = 0; k <= 4; k++) { const s = (0.35 + 0.65 * k / 4) * L; best = Math.min(best, toBody(h.pos.x + h.f.x * s, h.pos.y + h.f.y * s - 0.1, h.pos.z + h.f.z * s) - lerpR(0.5, 0.25, k / 4)); }
        if (best < rad) {
          const fl = Math.hypot(h.f.x, h.f.z) || 1, F = act.force ?? 1, sp = (standing ? 3.2 : 2.2) + 5.5 * F;
          act.hit = true; if (v.knock(h.f.x / fl * sp + sim.ux * 0.5, (standing ? 2.2 : 1.6) + 2.4 * F, h.f.z / fl * sp + sim.uz * 0.5, 'butt', 0.6 + 0.6 * F)) { v.lastMotive = motive; v.hurt(0.03 + 0.07 * F, 'butt', motive); }
        }
      } else if (act.kind === 'swipe' && u > 0.08 && u < 0.85) {
        const N = sim.tail.length - 1;
        for (let k = 3; k <= N && !act.hit; k++) {
          const n = sim.tail[k], vx = (n.p.x - n.prev.x) / dt, vz = (n.p.z - n.prev.z) / dt, hv = Math.hypot(vx, vz);
          if (hv > 2.5 && toBody(n.p.x, n.p.y, n.p.z) < rad + 0.62 - 0.45 * k / N) { const sp = Math.min(10, hv * 0.8); act.hit = true; if (v.knock(vx / hv * sp, 2 + 0.25 * sp, vz / hv * sp, 'tail', 1.2)) { v.lastMotive = motive; v.hurt(0.04 + 0.006 * sp, 'tail', motive); } }
        }
      }
    }
    if (act && act.kind === 'seize' && u > 0.4 && u < 0.64 && !act.hit && v.state !== 'held' && v.state !== 'air') {
      const s = L - 0.25, tip = toBody(h.pos.x + h.f.x * s, h.pos.y + h.f.y * s - 0.2, h.pos.z + h.f.z * s);
      if (tip < rad + 0.55) { act.hit = true; if (v.state === 'pinned') v.state = 'down'; if (v.seize({ by: 'jaws' })) { v.lastMotive = motive; v.hurt(motive === 'play' ? 0.02 : motive === 'prey' ? 0.12 : 0.08, 'bitten', motive); } }
    }
    // a snout pushed into someone lying there rolls them over (once per push)
    // PROVOKE (marked addition): a snout pushed into someone standing rocks them: a stumble back, a stagger to the ground, no harm
    if (intent && intent.poke && standing && !v.dead && v.poked !== intent.poke) {
      const sn = (s) => toBody(h.pos.x + h.f.x * s, h.pos.y + h.f.y * s - 0.2, h.pos.z + h.f.z * s), d = Math.min(sn(L - 0.1), sn(L * 0.6));
      if (d < rad + 0.45) { v.poked = intent.poke; const fl = Math.hypot(h.f.x, h.f.z) || 1; v.knock(h.f.x / fl * 2.0, 1.3, h.f.z / fl * 2.0, 'snout', 0.35); }
    }
    if (intent && intent.poke && lying && v.poked !== intent.poke) {
      const sn = (s) => toBody(h.pos.x + h.f.x * s, h.pos.y + h.f.y * s - 0.2, h.pos.z + h.f.z * s), d = Math.min(sn(L - 0.1), sn(L * 0.6));
      if (d < rad + 0.35) { v.poked = intent.poke; const fl = Math.hypot(h.f.x, h.f.z) || 1; v.state = 'down'; v.knock(h.f.x / fl * 2.2, 1.6, h.f.z / fl * 2.2, 'snout', 0.5); }
    }
    if (intent && intent.plant && lying) for (let k = 0; k < 2; k++) {
      const f = sim.feet[k]; if (f.planted && sim.t - f.tLand < 0.3 && Math.hypot(f.pos.x - v.x, f.pos.z - v.z) < 1.0) { v.pin(k); break; }
    }
    // what holding you does to you: jaws shaking you, a foot pressing down, teeth that stay closed
    if (v.state === 'held') {
      const shaking = act && act.kind === 'worry', K = motive === 'prey' ? 1 : motive === 'anger' ? 0.7 : 0.15;
      if (shaking) v.hurt(0.13 * K * dt, 'shaken', motive);      // a worry (1.9 s) costs a hunted person ~0.25 of their health, an angry one's ~0.17
      else if (motive === 'prey') v.hurt(0.012 * dt, 'crushed', motive);
    } else if (v.state === 'pinned' && motive !== 'play') v.hurt((0.012 + 0.03 * v.struggle * (motive === 'prey' || motive === 'anger' ? 1 : 0)) * dt, 'pinned', motive);
    if (v.dead && v.grip && !(intent && intent.grip)) v.release(v.vx * 0.5, 0, v.vz * 0.5, 'drop');
    if (v.state === 'held') {
      const wants = intent && intent.grip;
      if (act && act.kind === 'toss' && u > 0.52 && !act.hit) {
        act.hit = true; const sg = act.sgn, sp = 3 + 3.5 * (act.force ?? 1);
        v.release(v.vx * 0.6 + h.l.x * sg * sp, clamp(v.vy * 0.4 + 1.8 + 1.2 * (act.force ?? 1), 1.5, 4.5), v.vz * 0.6 + h.l.z * sg * sp, 'toss');
      } else if (!wants && !(act && act.kind === 'toss')) v.release(v.vx * 0.5, Math.min(v.vy * 0.5, 0.5), v.vz * 0.5, 'drop');
      else if (v.escape >= 1) v.release(v.vx * 0.4 + h.l.x * 1.2, 0.8, v.vz * 0.4 + h.l.z * 1.2, 'slip');
      else if (v.t > 12) v.release(0, 0, 0, 'drop');      // never held for long: only a strike kills
    }
  }
}
const lerpR = (a, b, t) => a + (b - a) * t;
/** Where a person's outstretched hand is: a little in front of them and below the eye, along where they are looking. */
const handPoint = (a) => {
  const lx = a.lx ?? a.fx ?? 0, ly = a.ly ?? -0.2, lz = a.lz ?? a.fz ?? 1, l = Math.hypot(lx, ly, lz) || 1;
  return { x: a.x + lx / l * 0.6, y: a.y - 0.38 + clamp(ly / l, -0.9, 0.5) * 0.6, z: a.z + lz / l * 0.6 };
};
// the observe mode's camera is a watcher, not a body: nothing can lay hold of it
const bodied = (a) => a.id !== 'observer' && !a.ghost;
