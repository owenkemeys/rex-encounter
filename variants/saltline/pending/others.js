// Other creatures: everything that moves in its world and is not the intruder it tracks (`know.target`) or the prey herd.
// A world reports them by physical properties only (no names, no types the mind could special-case):
//   world.creatures = [{ id, x, y, z,          centre of the body (m)
//                        vx, vy, vz,           velocity (m/s)
//                        h, len,               body height and length (m)
//                        ground,               true when standing on the ground, false when it flies or hovers
//                        light,                light it gives off (0..1: a lamp, a glowing eye, a strobe)
//                        loud,                 how loud it is right now (0..1, the noise scale of world.noises)
//                        shiny,                a wet or polished surface that catches the light (what it looks like)
//                        hard }]               what a bite would find (true: a shell, metal; it learns this only by biting)
//   world.hits entries may carry `by: <creature id>`: a missile from that creature that struck it.
// What this module does with them, through paths the mind already has:
//   perception  sight (field of view, line of sight, size, light, motion), hearing (their noise), and blows (the hits).
//   appraisal   per creature and per kind of creature (the kind is what it perceives: size against its own body, flying,
//               glowing, quick), a verdict among food / threat / pest / curious / nothing, read off size, reach, what they have
//               cost it (pain), what biting one taught it, hunger, and habituation.
//   attention   each creature is an item ('other:<id>') with a salience in attend.js's winner-take-all attention.
//   action      a creature it goes for is offered as prey (world.prey, id 'n<id>'), so the mind's own `hunt` (stalk, rush,
//               snap, kill) does it; a darting small thing near its feet trips the same rush at once (the prey reflex); a
//               threat it cannot get at makes it leave; a pest closing in out of reach is warned off (a growl at it).
//   memory      per individual and per kind: hurt, bites, kills, the taste, the reflex chases that came to nothing.
//   voice       news for the thought stream (thoughts.js), naming each by what it perceives ("little quick thing").
// Deterministic: its own random stream; nothing here reads a clock.
import { makeRng, clamp, bearing, wrap } from '../math.js';
import { bodyOf } from './afford.js';

const KEEP = 12;          // s it remembers where an unseen creature was
export class Others {
  constructor(mind, seed = 1) {
    this.m = mind; this.R = makeRng(seed * 4241 + 3);
    this.ind = new Map();     // id -> individual record
    this.kinds = new Map();   // perceived kind -> what it has learnt about that kind
    this.news = [];           // thoughts to raise: { key, kind, pri, texts, cond }
    this.urgeOut = null; this.t = 0; this.offered = new Set(); this.log = [];
    this.selfHurt = 0;        // all recent pain from missiles, anyone's (decays over a minute)
  }
  _self() {
    if (this._body) return this._body;
    let B = null; try { B = bodyOf(this.m.sim.selfModel()); } catch (e) { B = null; }
    return (this._body = { shoulderH: B ? B.shoulderH : 3.1, snoutUp: B ? B.snoutUp : 5.2 });
  }
  /** How it sees a body: a kind key and its name, from properties relative to its own body. */
  perceiveKind(c) {
    const S = this._self(), rel = (c.h || 0.5) / S.shoulderH;
    const size = rel < 0.12 ? 'tiny' : rel < 0.45 ? 'little' : rel < 1.1 ? 'small' : 'big';
    const fly = c.ground === false, sp = Math.hypot(c.vx || 0, c.vz || 0), lit = (c.light || 0) > 0.3;
    const trait = fly ? 'flying' : (c.light || 0) > 0.5 ? 'glowing' : sp > 2.5 ? 'quick' : c.shiny ? 'shiny' : 'odd';
    const key = size + '|' + (fly ? 'fly' : 'ground') + '|' + (lit ? 'lit' : 'dark');
    return { key, name: size + ' ' + trait + ' thing', rel, fly, lit };
  }
  _kind(key) { let k = this.kinds.get(key); if (!k) { k = { hurt: 0, bit: 0, killed: 0, hard: null, chases: 0, idle: 0, met: 0, name: null }; this.kinds.set(key, k); } return k; }
  has(id) { return this.ind.has(id); }
  /** Its name for a creature (the kind's name, fixed when the kind was first met). */
  name(id) { const r = this.ind.get(String(id).replace(/^n/, '')) || this.ind.get(id); return r ? this._kind(r.kind).name : 'that thing'; }
  record(id) { return this.ind.get(id); }
  pos(id) { const r = this.ind.get(id); if (!r || this.m.t - r.lastT > KEEP) return null; return { x: r.x, y: r.y, z: r.z }; }

  /** Each perception tick (mind._perceiveWorld): sense, appraise, offer prey, decide urges. Mutates world.prey. */
  perceive(dt, world) {
    const m = this.m, sim = m.sim, h = sim.head, t = m.t, S = this._self(), SN = m.sp.senses;
    this.t = t; this.selfHurt *= 1 - dt / 60;
    const list = world.creatures || [];
    const live = new Set();
    for (const c of list) {
      const id = String(c.id); live.add(id);
      let r = this.ind.get(id);
      const pk = this.perceiveKind(c);
      if (!r) {
        r = { id, kind: pk.key, ev: 0, seen: false, firstT: null, lastT: -99, seenTime: 0, hab: 0, hurt: 0, hurtT: -99, bites: 0, dart: 0, near: 0, verdict: 'nothing', vT: 0, x: c.x, y: c.y, z: c.z, cool: -99, warnT: -99, sal: 0, rel: pk.rel, fly: pk.fly, lit: pk.lit, d: 99 };
        this.ind.set(id, r);
        const K = this._kind(r.kind); if (!K.name) K.name = pk.name;
      }
      // the senses: eyes (field, line of sight), size and light make it stand out; motion draws the eye a little more
      const dx = c.x - h.pos.x, dy = c.y - h.pos.y, dz = c.z - h.pos.z, d3 = Math.hypot(dx, dy, dz) || 1, d = Math.hypot(c.x - sim.x, c.z - sim.z);
      const ang = Math.acos(clamp((dx * h.f.x + dy * h.f.y + dz * h.f.z) / d3, -1, 1));
      const field = ang < SN.sharp ? 1 : ang < SN.mid ? 0.7 : ang < SN.field ? 0.3 : 0;
      const sp = Math.hypot(c.vx || 0, c.vz || 0, c.vy || 0);
      let see = 0;
      if (field && m.ov.senses.sight && m.los(h.pos.x, h.pos.y, h.pos.z, c.x, c.y, c.z)) {
        const size = clamp(0.35 + (c.h || 0.5) * 0.5, 0.3, 1.3), light = Math.max(world.light ?? 0.5, (c.light || 0) * 1.2);
        see = field * size * (0.55 + 0.45 * light) * (1 + 0.5 * clamp(sp / 4, 0, 1)) / (1 + (d3 / ((c.light || 0) > 0.3 ? 60 : 32)) ** 2);
      }
      const heard = m.ov.senses.hearing && (c.loud || 0) * SN.hearing > d ? (c.loud || 0) * (1 - d / ((c.loud || 0) * SN.hearing)) : 0;
      const p = Math.max(see, heard * 0.6, d < 5 ? 0.4 : 0);
      r.ev = clamp(r.ev + p * dt * 4 - dt * 0.3, 0, 2);
      const wasSeen = r.seen;
      if (!r.seen && r.ev > 0.8) { r.seen = true; if (r.firstT === null) { r.firstT = t; this._kind(r.kind).met++; this._met(r); } else this._news(r, 'back'); }
      if (r.seen && p < 0.02 && t - r.lastT > 2.5) r.seen = false;
      if (r.seen || p > 0.02) { r.x = c.x; r.y = c.y; r.z = c.z; r.vx = c.vx || 0; r.vz = c.vz || 0; r.vy = c.vy || 0; r.lastT = t; r.d = d; r.h = c.h; r.ground = c.ground !== false; r.light = c.light || 0; r.hardTrue = !!c.hard; }
      r.see = see; r.heard = heard;
      if (r.seen) r.seenTime += dt;
      // movement read off what it saw: coming at it, darting (fast and close, across or at it), going away
      const toward = d > 0.1 ? -((c.vx || 0) * (c.x - sim.x) + (c.vz || 0) * (c.z - sim.z)) / d : 0;
      r.toward = toward; r.speed = sp;
      const darting = r.seen && see > 0.05 && r.ground !== false && d < 10 && sp > 2.5 && r.rel < 0.45;
      r.dart = darting ? r.dart + dt : Math.max(0, r.dart - dt * 2);
      r.near = r.seen && d < 10 ? r.near + dt : Math.max(0, r.near - dt * 0.5);
      // habituation: a thing seen for a long time that has cost nothing becomes the background
      if (r.seen && t - r.hurtT > 20) r.hab = Math.min(1, r.hab + dt * (r.lit ? 0.012 : 0.02)); else if (t - r.hurtT < 3) r.hab = 0;
      void wasSeen;
    }
    // what it has learnt and what it feels: the verdict, per creature
    const hunger = m.hunger, reach = this.reachY();
    for (const r of this.ind.values()) {
      if (!live.has(r.id)) { if (!r.gone) { r.gone = true; r.seen = false; } continue; }
      const K = this._kind(r.kind), up = r.y - m.T.height(r.x, r.z), inReach = r.ground || up < reach;
      const hard = K.hard === true;      // learnt by biting one
      const edible = r.ground && r.rel > 0.06 && r.rel < 0.6 && !hard;
      const hurtK = r.hurt + 0.35 * K.hurt;
      let v = 'nothing';
      if ((hurtK > 2.5 && !inReach) || hurtK > 6 || (r.rel > 1.1 && r.toward > 1)) v = 'threat';      // costs it more than it can stop, or bigger than it and coming
      else if (hurtK > 0.25 || (r.near > 6 && r.speed > 2 && t - r.hurtT < 60) || (r.near > 10 && r.dart > 0)) v = 'pest';
      else if (edible && hunger > 0.55 && K.chases < 4) v = 'food';
      else if (r.seenTime < 25 && r.hab < 0.6 && (r.lit || r.fly || r.seenTime < 12)) v = 'curious';
      if (v !== r.verdict) { r.prev = r.verdict; r.verdict = v; r.vT = t; if (r.seen) this._news(r, 'verdict:' + v); }
      r.inReach = inReach;
      // salience in the attention: how much it pulls at it now
      const fresh = r.firstT !== null ? Math.exp(-(t - r.firstT) / 30) : 0;
      let s = 0;
      if (r.seen || t - r.lastT < 1.5) {
        s = 0.08 + 0.3 * fresh + 0.25 * clamp(r.light, 0, 1) * (1 - r.hab) + 0.2 * clamp(r.toward / 3, 0, 1) + (r.d < 10 ? 0.2 : r.d < 20 ? 0.08 : 0) + 0.25 * clamp(r.dart, 0, 1)
          + (t - r.hurtT < 3 ? 0.6 : 0) + (r.verdict === 'pest' ? 0.12 : r.verdict === 'threat' ? 0.25 : r.verdict === 'food' ? 0.15 + 0.2 * hunger : 0);
        s *= 1 - 0.7 * r.hab * (r.verdict === 'nothing' || r.verdict === 'curious' ? 1 : 0.3);
      }
      r.sal = clamp(s, 0, 1);
    }
    // prey offered to the mind's hunt: what it is going for, and (hungry) what it would eat
    const b = m.beh, hunting = b && b.name === 'hunt' && String(b.id).startsWith('n') ? String(b.id).slice(1) : null;
    this._urges(dt, world);
    this.offered.clear();
    for (const r of this.ind.values()) {
      if (r.gone || t - r.lastT > 2) continue;
      if (r.id === hunting || (this.urgeOut && this.urgeOut.id === r.id && this.urgeOut.kind === 'hunt') || (r.verdict === 'food' && r.seen) || (r.verdict === 'pest' && r.inReach && r.seen && r.d < 16)) this.offered.add(r.id);
    }
  }
  /** A prey entry for a creature from its record (where it was last sensed). */
  entry(id) { const r = this.ind.get(String(id)); return r ? { id: 'n' + r.id, x: r.x, y: r.y, z: r.z, vx: r.vx || 0, vz: r.vz || 0, speed: r.speed || 0, state: 'graze', size: r.rel / 0.45, name: this._kind(r.kind).name, other: true } : null; }
  /** Every step (mind.step): the creatures it is going for, or would, as prey entries in world.prey (live positions). */
  offer(world) {
    if (!this.offered.size || !world.creatures) return;
    const prey = world.prey || (world.prey = []);
    for (const c of world.creatures) {
      const id = String(c.id); if (!this.offered.has(id)) continue;
      const r = this.ind.get(id), sp = Math.hypot(c.vx || 0, c.vz || 0), d = Math.hypot(c.x - this.m.sim.x, c.z - this.m.sim.z);
      const toward = d > 0.1 ? -((c.vx || 0) * (c.x - this.m.sim.x) + (c.vz || 0) * (c.z - this.m.sim.z)) / d : 0;
      prey.push({ id: 'n' + id, x: c.x, y: c.y, z: c.z, vx: c.vx || 0, vz: c.vz || 0, speed: sp, state: toward < -1.5 ? 'flee' : 'graze', size: r.rel / 0.45, name: this._kind(r.kind).name, other: true });
    }
  }
  /** How high it can get its jaws (above the ground under the thing). */
  reachY() { const S = this._self(); return S.snoutUp + 0.6; }

  _urges(dt, world) {
    const m = this.m, t = m.t; this.urgeOut = null;
    let best = null, bs = 0;
    // more pain than it will stand, from missiles, lately (about ten rifle rounds in a minute): it goes away from where they came from
    if (this.selfHurt > 9 && this.lastFrom && t - this.lastFrom.t < 5 && t - (this.leaveT ?? -99) > 40) { bs = 1.25; best = { id: null, kind: 'leave', reason: 'pain', from: { x: this.lastFrom.x, z: this.lastFrom.z } }; }
    for (const r of this.ind.values()) {
      if (r.gone || !r.seen) continue;
      const K = this._kind(r.kind);
      // the prey reflex: a small thing darting close in front of it, on the ground: it goes at once, fed or not (and less
      // each time the same kind of thing ran rings round it for nothing)
      if (r.dart > (r.d < 5 ? 0.25 : 0.7) && t > r.cool && K.chases < 6) { const s = 1.2 - 0.12 * K.chases; if (s > bs) { bs = s; best = { id: r.id, kind: 'hunt', rush: true, reason: 'prey drive' }; } }
      // a pest it can get at: it goes for it, close in, with a snap
      if (r.verdict === 'pest' && r.inReach && r.d < 14 && t > r.cool) { const s = 0.8 + 0.3 * clamp(r.hurt, 0, 1); if (s > bs) { bs = s; best = { id: r.id, kind: 'hunt', rush: r.d < 11, reason: 'pest' }; } }
      // anything that comes right up to its head, within reach of its jaws, in front of it: a snap at it (unless long since
      // the background, and harmless)
      { const hp = this.m.sim.head.pos, d3 = Math.hypot(r.x - hp.x, r.y - hp.y, r.z - hp.z), front = Math.abs(wrap(bearing(r.x - this.m.sim.x, r.z - this.m.sim.z) - this.m.sim.psi)) < 1.2;
        if (d3 < 3.4 && front && r.inReach && t > r.cool && (r.hab < 0.85 || r.verdict === 'pest')) { const s = 1.0; if (s > bs) { bs = s; best = { id: r.id, kind: 'hunt', rush: true, reason: 'close' }; } } }
      // food, hungry: stalk it
      if (r.verdict === 'food' && r.d < 30 && t > r.cool && this.R() < dt * 0.5) { const s = 0.5 + 0.4 * m.hunger; if (s > bs) { bs = s; best = { id: r.id, kind: 'hunt', rush: false, reason: 'food' }; } }
      // a threat it cannot get at: it goes away from it
      if (r.verdict === 'threat' && r.d < 35 && t - (this.leaveT ?? -99) > 25) { const s = 1.3; if (s > bs) { bs = s; best = { id: r.id, kind: 'leave', reason: 'threat' }; } }
      // a pest closing in that it cannot get at (or has just failed to): warned off, a growl at it
      if ((r.verdict === 'pest' || (r.verdict === 'curious' && r.d < 7)) && r.d < 12 && (!r.inReach || t < r.cool) && t - r.warnT > 7) { r.warnT = t; this.warn = { id: r.id, x: r.x, y: r.y, z: r.z, t }; this._news(r, 'warn'); }
    }
    this.urgeOut = best;
  }
  /** A warning to give now (once): { x, y, z } of the pest, or null. */
  takeWarn() { const w = this.warn; this.warn = null; return w && this.m.t - w.t < 0.3 ? w : null; }
  /** Called by the mind when it is free to act on an urge: what to start (or null). */
  urge() { return this.urgeOut; }
  started(u) {
    if (u.id === null) { this.leaveT = this.m.t; this.news.push({ id: null, what: 'flee', t: this.m.t }); this.log.push({ t: +this.m.t.toFixed(1), id: '-', what: u.kind + ':' + u.reason }); return; }
    const r = this.ind.get(u.id); if (!r) return;
    r.cool = this.m.t + (u.kind === 'leave' ? 25 : u.reason === 'close' ? 5 : 9);
    if (u.kind === 'leave') { this.leaveT = this.m.t; this._news(r, 'leave'); }
    else { if (u.reason === 'prey drive') this._kind(r.kind).chases++; this._news(r, u.reason === 'pest' || u.reason === 'close' ? 'gofor' : u.reason === 'food' ? 'stalk' : 'reflex'); }
    this.log.push({ t: +this.m.t.toFixed(1), id: r.id, what: u.kind + ':' + u.reason });
  }
  /** A missile from a creature struck it (world.hits, by: <id>). k: how hard (0.3..1.2). */
  onHit(hit, k) {
    const id = String(hit.by), r = this.ind.get(id); if (!r) return;
    r.hurt += k * 0.5; r.hurtT = this.m.t; r.hab = 0; this._kind(r.kind).hurt += k * 0.2; this.selfHurt += k;
    if (!r.seen) { r.ev = 1; r.seen = true; }
    this._news(r, 'hurt');
  }
  /** A missile from anyone (you included) struck it: the pain it has taken lately, and where the last ones came from. */
  onSelfHit(hit, k) { this.selfHurt += k; if (hit.from) this.lastFrom = { x: hit.from.x, z: hit.from.z, t: this.m.t }; }
  /** It bit (killed) a creature it hunted: what it learnt from the taste. Returns true when it was not meat. */
  onKill(id) {
    const rid = String(id).replace(/^n/, ''), r = this.ind.get(rid); if (!r) return false;
    const K = this._kind(r.kind); K.killed++; K.bit++; r.bites++;
    if (r.hardTrue) { if (K.hard !== true) { K.hard = true; this._news(r, 'hard'); } else this._news(r, 'killed'); return true; }
    K.hard = false; this._news(r, 'killed'); return false;
  }
  /** A creature it was going for got away or the hunt ended without a kill. */
  ended(id) { const r = this.ind.get(String(id).replace(/^n/, '')); if (r) { r.cool = this.m.t + 8; } }
  _met(r) {
    const K = this._kind(r.kind);
    this._news(r, K.met > 1 ? (K.hurt > 0.3 ? 'meet:bad' : K.hard ? 'meet:hard' : 'meet:again') : 'meet');
  }
  _news(r, what) { this.news.push({ id: r.id, what, t: this.m.t }); if (this.news.length > 20) this.news.shift(); }
  /** Attention items: key -> salience (attend.js). */
  items() { const out = []; for (const r of this.ind.values()) if (!r.gone && r.sal > 0.02) out.push(['other:' + r.id, r.sal]); return out; }
  /** A short summary per creature, for readouts and tests. */
  summary() {
    return [...this.ind.values()].map((r) => ({ id: r.id, name: this._kind(r.kind).name, verdict: r.verdict, seen: r.seen, d: +r.d.toFixed(1), sal: +r.sal.toFixed(2), hurt: +r.hurt.toFixed(2), hab: +r.hab.toFixed(2), gone: !!r.gone }));
  }
}
// (kept for symmetry with the other modules: bearing and wrap are used by callers that aim gestures)
export const aimAt = (sim, p) => wrap(bearing(p.x - sim.x, p.z - sim.z) - sim.psi);
