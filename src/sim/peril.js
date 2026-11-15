// Will it take me now? One hidden quantity per animal, fed only by its real state, and the honest signs that leak out of it.
//
// Nothing here is scripted or random-for-effect. `P` (pressure) is a sum of what is actually going on:
//   hunger        rising by itself over minutes (mind.hunger)
//   irk           every provocation it has suffered from you (stones that hit, the light in its eyes, shouts close by), each
//                 one adding to it whatever the flinch has habituated to; it fades only slowly
//   close         how near you are (the risk dial): nothing beyond ~16 m, everything inside its reach; and how long you have
//                 spent near it (it grows bolder as it works you out)
//   posture       small and low (crouched, lying) reads as more like prey once it is hungry
//   flight        you running, near, in its sight: the chase reflex
//   crowding      you coming at it inside its personal space; giving ground at a walk eases it
//   handling      you in its jaws or under its foot, struggling
//   tested        the curious/food-uncertain verdicts: it wants to know what you are, with its mouth
//   frustration   misses and bluffs that did not work; a recent kill spends it
//   drift         a slow wander of its own mood
// against `fuse`, this individual's temper, rolled afresh for every life of yours (so each life meets a different fuse), as
// are how many warnings it gives before it goes (0-4 of: fixed stare, low rumble, jaw clap, stamp, head lowered, a lunge that
// stops short) and how long its last tell lasts. The last tell is always the same: it goes completely still, eyes on you, and
// its thoughts stop. Then it strikes (from inside its reach) or rushes you and strikes (from further off). If the pressure
// falls back during the stillness (you backed away slowly, lay down, got out of reach) it lets it go.
//
// Outputs: `stage` ('calm' | 'warn' | 'still' | 'rush' | 'strike'), `quiet` (its thoughts stop), `tells` (log), and the
// intent override `apply(I)`. The strike itself is a body act (rex.js `strike`); the kill is settled by contact (arena.js).
// Players never see P or fuse; tests read them.
import { makeRng, clamp } from '../math.js';
import { bodyOf } from './afford.js';

const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const WARN_KINDS = ['stare', 'rumble', 'clap', 'stamp', 'lower', 'bluff'];
const WARN_AT = [0.62, 0.72, 0.8, 0.88];
const SLOW = new Set(['close', 'hunger', 'posture', 'tested', 'frus', 'drift', 'retreat', 'leaving']);
SLOW.add('curio');      // (the core: curiosity holds the pressure down; out/platform/CORE.md)

export class Peril {
  constructor(mind, seed = 1) {
    this.m = mind; this.seed = seed; this.life = 0; this.P = 0; this.r = 0; this.stage = 'calm'; this.quiet = false;
    this.irk = 0; this.closeT = 0; this.frus = 0; this.drift = 0; this.tells = []; this.strikes = 0; this.kills = 0; this.T = 0;
    this.seen = { stones: 0, glare: 0 }; this.lastStillT = -99; this.parts = {};
    this.roll(null);
  }
  /** A new individual of yours: a new fuse, a new way of warning. Deterministic per animal and life. */
  roll(who) {
    this.life++; this.who = who;
    const R = this.R = makeRng(this.seed * 7919 + this.life * 104729 + 13), g = Math.sqrt(-2 * Math.log(Math.max(R(), 1e-6))) * Math.cos(6.2832 * R());
    this.fuse = clamp(0.9 * Math.exp(0.32 * g), 0.5, 1.7);
    const u = R(), n = u < 0.15 ? 0 : u < 0.4 ? 1 : u < 0.7 ? 2 : u < 0.9 ? 3 : 4;
    const pool = WARN_KINDS.slice(); this.warns = [];
    for (let k = 0; k < n; k++) this.warns.push(pool.splice(Math.floor(R() * pool.length) % pool.length, 1)[0]);
    this.warns.sort((a, b) => WARN_KINDS.indexOf(a) - WARN_KINDS.indexOf(b));      // the milder first
    // irkGain: how much a stone or the light gets to this one (some snap at the third, some take minutes)
    const g2 = Math.sqrt(-2 * Math.log(Math.max(R(), 1e-6))) * Math.cos(6.2832 * R());
    this.stillDur = R.range(0.9, 1.8); this.irkGain = clamp(Math.exp(0.75 * g2), 0.25, 4); this.chaseGain = R.range(0.7, 1.2); this.boldGain = R.range(0.6, 1.4);
    this.given = 0; this.slowS = 0; this.irk *= 0.25; this.closeT = 0; this.frus = 0; this.stage = 'calm'; this.quiet = false; this.cur = null; this.warnLog = [];
  }
  get busy() { return this.stage === 'still' || this.stage === 'rush' || this.stage === 'strike' || this.stage === 'reach'; }
  /** Reach of a strike from where it stands (hips to your body): its standing reach plus a lunge, from its self-model. */
  reach() { const B = bodyOf(this.m.sim.selfModel()); return B.standoff + B.biteReach + 0.9; }

  /** Ten times a second, from the mind's context. */
  step(d, c) {
    const m = this.m, K = m.know, a = K.target, M = m.mood, sim = m.sim, A = m.ap;
    this.T += d;
    if (a && a.who && a.who !== this.who && !a.dead) this.roll(a.who);
    // provocations: each one, however used to it the flinch has become, feeds it
    const ds = m.wrongs.stones - this.seen.stones, dg = m.wrongs.glare - this.seen.glare;
    this.seen.stones = m.wrongs.stones; this.seen.glare = m.wrongs.glare;
    if (ds > 0) this.irk += 0.055 * ds * this.irkGain;
    if (dg > 0) this.irk += 0.016 * dg * this.irkGain;
    this.irk = Math.max(0, this.irk - d * this.irk / 600);
    this.frus = Math.max(0, this.frus - d / 90);
    this.drift += (this.R.range(-1, 1) * 0.6 - this.drift * 0.08) * d * 0.25; this.drift = clamp(this.drift, -0.12, 0.12);
    const opening = m.opening && m.t < m.opening.until && this.irk < 0.05 && m.grudge < 0.05;
    if (!a || !K.seen && !(c.cert > 0.6 && c.beliefD < 8) || a.dead || a.id === 'observer' || a.ghost) { this.P = 0; this.r = 0; this._calm(); return; }
    const dist = c.d ?? 99, near = sstep(16, 3.5, dist), st = a.state || 'free';
    if (st === 'free') this.rFree = this.r; else this.rFree = this.rFree ?? 0;      // how near it was to deciding while you were still free to read it
    if (dist < 12) this.closeT += d; else this.closeT = Math.max(0, this.closeT - d * 0.5);
    const hunger = 0.55 * sstep(0.4, 1, m.hunger);
    const P = this.parts = {
      close: 0.28 * near + 0.3 * near * sstep(20, 150, this.closeT) * this.boldGain,
      hunger: hunger * (0.35 + 0.65 * near),
      irk: Math.min(1.4, this.irk) * (0.55 + 0.45 * near) + 0.12 * M.irritation * near,
      posture: (a.crouch || st === 'down' ? 0.12 : 0) * sstep(0.45, 0.8, m.hunger) * near,
      flight: c.running ? 0.5 * this.chaseGain * c.running * sstep(28, 8, dist) : 0,
      crowd: 0.22 * (c.approach || 0) * sstep(9, 4, dist),
      // giving ground at a walk (not running: that is flight) is the one thing that eases it
      retreat: -0.35 * near * (c.running || st !== 'free' ? 0 : clamp((((a.vx || 0) * (a.x - sim.x) + (a.vz || 0) * (a.z - sim.z)) / (dist || 1)) / 1.0, 0, 1)),
      // a thing giving ground steadily at a walk is leaving, not prey (appraise.js `leaving`): at any distance, not only close
      leaving: -m.cfg.peril.leave * (A.leaving || 0) * (1 - sstep(0.88, 1, m.hunger)),
      handling: (st === 'held' || st === 'pinned') && this.rFree > 0.72 ? 0.2 + 0.2 * (a.struggle || 0) + (m.beh && m.beh.motive === 'prey' ? 0.4 : 0) : 0,
      tested: (A.verdict === 'curious' || A.verdict === 'food' ? 0.08 : 0) * near + (A.verdict === 'food' ? 0.3 * near : 0) + (A.verdict === 'nuisance' ? 0.1 : 0),
      frus: 0.2 * Math.min(1, this.frus),
      drift: this.drift * near,
      // curiosity about it (appraise.js `curio`): while it is high, the thing is looked at and asked, not eaten
      curio: m.cfg.core && m.cfg.core.on ? -m.cfg.core.curPeril * (A.curio || 0) * sstep(40, 12, dist) * clamp(1.5 - 2.5 * this.irk, 0, 1) : 0,      // (curiosity does not hold off anger: gone by irk 0.6)
    };
    // the slow causes climb no faster than `rise` (fuse shares per s), so its warnings come in turn and there is time to read
    // them; they fall at once. The fast ones (you running, crowding, stones, a struggle) act at once
    let slow = 0, sum = 0; for (const k in P) { if (SLOW.has(k)) slow += P[k]; else sum += P[k]; }
    let rise = m.cfg.peril.rise * this.fuse * d;
    // not watched: the opening a predator takes (a turned back more than a look away)
    if (m.cfg.core && m.cfg.core.on && st === 'free' && !c.watched) rise *= m.cfg.core.unwRise * (A.cues && A.cues.back ? 1.5 : 1);
    this.slowS = slow > (this.slowS ?? 0) ? Math.min(slow, (this.slowS ?? 0) + rise) : slow;
    sum += this.slowS;
    if (m.killedT !== undefined && m.t - m.killedT < 60) sum -= 0.4;
    // what it cannot get at, it cannot take: walled off, or out of any reach (besieging is another matter: besiege.js)
    if (c.walled && !(c.aff && c.aff.reach)) sum = Math.min(sum, this.fuse * 0.7);
    if (opening) sum = Math.min(sum, this.fuse * 0.5);
    this.P = sum; this.r = sum / this.fuse;
    this._stage(d, c, a, dist);
  }
  _calm() { if (this.stage === 'reach') { const tg = this.m.know.target; if (tg && !tg.dead) this.m.ap.balk('cover'); this._endReach('cover'); return; }
    if (this.stage !== 'calm' && this.stage !== 'strike') { this.stage = 'calm'; this.quiet = false; this.cur = null; } }
  _tell(kind, extra = {}) { const e = { kind, t: this.m.t, r: +this.r.toFixed(2), life: this.life, ...extra }; this.tells.push(e); if (this.tells.length > 400) this.tells.shift(); this.m.events.push({ type: 'tell', kind }); return e; }

  _stage(d, c, a, dist) {
    const m = this.m, sim = m.sim, r = this.r;
    if (this.stage === 'reach') { this._reachStep(d, c, a, dist); return; }
    if (this.stage === 'strike') {
      const act = sim.act; if (!act || act.kind !== 'strike') { this.stage = 'calm'; this.quiet = false; this.frus += 0.6; this.given = 0; }
      return;
    }
    if (this.stage === 'still') {
      this.cur.t += d;
      if (r < 0.82) { this._tell('stood-down'); this.stage = 'calm'; this.quiet = false; this.given = Math.max(0, this.given - 1); return; }
      if (this.cur.t >= this.stillDur) {
        if (dist <= this.reach() || (a.state && a.state !== 'free')) this._strike(a);
        else { this.stage = 'rush'; this.cur = { t: 0 }; }
      }
      return;
    }
    if (this.stage === 'rush') {
      this.cur.t += d;
      if (dist <= this.reach()) { this._strike(a); return; }
      if (this.cur.t > m.cfg.chase.maxT || c.walled || !m.know.seen && this.cur.t > 1.5 || (this.cur.t > 4 && dist > m.cfg.chase.lostD)) { this.stage = 'calm'; this.quiet = false; this.frus += 0.5; this._tell('gave-up'); }
      return;
    }
    // calm / warn: the warnings it has, one per rung as the pressure climbs, re-armed when it falls back
    if (this.cur && this.cur.until && m.t > this.cur.until) this.cur = null;
    while (this.given > 0 && r < WARN_AT[this.given - 1] - 0.12) this.given--;
    // (no warnings while its body is already committed to going for you: a chase or a rush has no room for a rumble or a stamp)
    const B = m.beh, going = !!(B && ((B.name === 'pounce' && B.phase !== 'defused' && B.phase !== 'lost') || (B.name === 'prowl' && (B.phase === 'rush' || B.phase === 'set'))));
    if (this.given < this.warns.length && r >= WARN_AT[this.given] && !this.cur && dist < 30 && !going) {
      const kind = this.warns[this.given++]; this._warn(kind, a, dist); this.stage = 'warn';
    } else if (!this.cur) this.stage = r > 0.6 ? 'warn' : 'calm';
    if (r >= 1 && !(this.cur && this.cur.kind === 'bluff') && this._reachFor(c, a, dist)) { this.beginReach(a, c); return; }
    if (r >= 1 && this.m.cfg.core && this.m.cfg.core.on && !c.running && dist < this.m.cfg.core.reachFrom && (a.state || 'free') !== 'held' && !this._angry()) { this.stage = 'warn'; return; }      // (not yet: the questions again first)
    if (r >= 1 && !(this.cur && this.cur.kind === 'bluff')) {
      this.stage = 'still'; this.quiet = true; this.cur = { kind: 'still', t: 0 }; this.lastStillT = m.t; this._tell('still', { d: +dist.toFixed(1), warned: this.given });
    }
  }
  _warn(kind, a, dist) {
    const m = this.m, sim = m.sim, h = sim.head.pos, gy = (x, z) => m.T.height(x, z);
    this._tell(kind, { d: +dist.toFixed(1) });
    if (kind === 'rumble') sim.gesture('rumble');
    else if (kind === 'clap') { const k = Math.min(1, 2.5 / Math.max(dist, 1)); sim.gesture('snap', { x: h.x + (a.x - h.x) * k, y: h.y - 0.2, z: h.z + (a.z - h.z) * k }); }
    else if (kind === 'stamp') sim.gesture('stomp');
    void gy;
    this.cur = { kind, until: m.t + (kind === 'bluff' ? 1.3 : kind === 'stare' || kind === 'lower' ? 2.2 : 1.0), from: { x: sim.x, z: sim.z }, d0: dist };
  }
  _strike(a) {
    const m = this.m, sim = m.sim, y = a.state && a.state !== 'free' ? m.T.height(a.x, a.z) + 0.3 : a.y - 0.6, L = 0.3;      // it leads a moving target
    if (sim.gesture('strike', { x: a.x + (a.vx || 0) * L, y, z: a.z + (a.vz || 0) * L }, { over: true })) {
      if (m.core) m.core.killHow = this.stage === 'reach' ? 'reach' : (m.beh ? m.beh.name : '-') + '/' + this.stage;
      this.stage = 'strike'; this.quiet = true; this.strikes++; this.cur = null; if (m.core) m.core.reach = false;
      this._tell('strike', { d: +Math.hypot(a.x - sim.x, a.z - sim.z).toFixed(1), held: !!(a.state && a.state !== 'free') });
      m.events.push({ type: 'strike', x: a.x, z: a.z });
    }
  }

  // ------------------------------------------------------------------ the reach (out/platform/CORE.md)
  /** Whether the pressure on this thing ends in the slow open-mouthed reach rather than the dead-still moment and the strike:
   *  the core is on, the thing is not running (running is the chase reflex's), it is inside `core.reachFrom` and its body
   *  can get to it. */
  _reachFor(c, a, dist) {
    // (hunger reaches; anger does not: a thing it has a grudge against, that keeps provoking it, gets the old stillness and rush)
    const C = this.m.cfg.core; return !!(C && C.on && !c.running && dist < C.reachFrom && !c.walled && (a.state || 'free') !== 'held' && this.reachReady() && !this._angry());
  }
  /** The last question: the jaws open and the head comes slowly for it over `core.reachT` s. It can be called off by what
   *  changes its state (light in the eye, fire, a loud noise close, the thing out of its head's way, the thing backing off
   *  early enough, a new thing that fills its curiosity), except what it has learnt to expect: that it comes on through. */
  beginReach(a, c) {
    const m = this.m, C = m.cfg.core; if (!C || !C.on || this.stage === 'reach' || this.stage === 'strike') return false;
    const ready = ['light', 'fire', 'loud', 'cover', 'back'].filter((k) => (m.ap.balks[k] || 0) >= C.immune * 0.5);
    this.stage = 'reach'; this.quiet = false; this.cur = { kind: 'reach', t: 0, dur: this.R.range(...C.reachT), d0: c.d ?? 99, dMin: c.d ?? 99, ready, r0: this.r };
    this._tell('reach', { d: +(c.d ?? 99).toFixed(1), ready: ready.join(',') });
    if (m.core) { m.core.reach = true; m.core.killHow = null; m.core.probes.push({ t: +m.t.toFixed(1), kind: 'reach', r: +this.r.toFixed(2) }); }
    return true;
  }
  _reachStep(d, c, a, dist) {
    const m = this.m, C = m.cfg.core, R = this.cur, A = m.ap, t = m.t;
    R.t += d; R.dMin = Math.min(R.dMin, dist);
    if (c.running) { this._endReach(null); return; }      // it runs: the chase reflex's (pounce, the bolt strike), not a reach
    // what calls it off (each a kind, so it can be learnt): light in its eyes, fire close, a loud noise close, the thing where
    // its head cannot go, the thing backing steadily off; a new act that fills its curiosity lowers the pressure itself
    const why = m.glare > 0.5 ? 'light' : t - (A.firedT ?? -99) < 1 ? 'fire' : t - (A.shoutT ?? -99) < 0.5 && dist < 14 ? 'loud' : c.walled || (c.aff && !c.aff.body && !c.aff.reach) ? 'cover'
      : dist > R.dMin + 2.5 && (A.leaving || 0) > 0.3 && R.t < R.dur * 0.75 ? 'back' : null;
    if (why) {
      if (R.ready.includes(why) && why === 'back') {
        // backing off again, as it has learnt this one does: it does not follow at the reach's walk, it goes (the rush and the
        // strike; a reach a man can walk away from every time was no danger at all to one who keeps his distance. MERGE.md)
        this.pressedT = t; this._tell('pressed', { why }); if (m.core) m.core.reach = false; this.stage = 'rush'; this.quiet = true; this.cur = { t: 0, from: 'reach' }; return;
      }
      if (R.ready.includes(why) && why !== 'cover') { if (t - (this.pressedT ?? -99) > 2) { this.pressedT = t; this._tell('pressed', { why }); R.t += 0.8; this.slowS += C.teeth; } }      // it was ready for that: it comes on through it
      else { A.balk(why); this.slowS *= C.balkKeep; this._tell('balked', { why }); this._endReach(why); if (m.core) m.core.rung = 1; return; }
    }
    if (this.r < Math.min(0.7, R.r0 - 0.15)) { this._tell('stood-down'); this._endReach('calm'); return; }
    if (R.t >= R.dur && dist <= this.reach()) { this._strike(a); return; }
    if (R.t > R.dur + 8) { this._tell('gave-up'); this._endReach('far'); }
  }
  /** Provoked (stones, the light held on it: `irk`, or the mind's grudge): its pressure is anger, not appetite. */
  _angry() { return this.irk > 0.3 || this.m.grudge > 0.3; }
  /** Not straight after a counter worked: it starts its questions again first (`core.balkHold`). */
  reachReady() { const L = this.lastReachEnd, C = this.m.cfg.core; return !(L && L.why && L.why !== 'calm' && L.why !== 'far' && this.m.t - L.t < C.balkHold); }
  _endReach(why) { this.stage = 'calm'; this.quiet = false; this.cur = null; this.given = 0; if (this.m.core) this.m.core.reach = false; this.lastReachEnd = { t: this.m.t, why };
    const b = this.m.beh; if (b && b.reason === 'still' && b.name === 'pause') b.dur = Math.min(b.dur, b.t + 1.5); }      // (it stops, and thinks again)
  /** An act of the thing it attends to (appraise.js `act`): one it was ready for during the reach, the moment it starts, is
   *  its cue (it closes during the wind-up). */
  onAct(kind) { if (this.stage === 'reach' && this.cur && this.cur.ready.includes(kind)) { this.cur.t += 0.6; this.pressedT = this.m.t; this.slowS += this.m.cfg.core.teeth; } }
  onKill() { this.kills++; this.frus = 0; this.stage = 'calm'; this.quiet = false; this.irk *= 0.3; this.closeT = 0; this.given = 0; }

  /** The body's share: stillness, the stare, the lowered head, the short lunge, the rush. */
  apply(I, c) {
    const m = this.m, a = m.know.target; if (!a) return I;
    const eye = { x: a.x, y: a.y - 0.3, z: a.z, lock: true };
    if (this.stage === 'reach') {
      // slow and direct, the head low at its level, the jaws opening as it comes; ready for the light, its head turned from it
      const C = m.cfg.core, R = this.cur, u = Math.min(1, R.t / R.dur), sim = m.sim, st = a.state || 'free', gy = m.T.height(a.x, a.z);
      const tgt = { x: a.x, y: st === 'free' ? a.y - 0.4 : gy + 0.35, z: a.z };
      I.goal = { kind: 'approach', id: 'reach', x: a.x, z: a.z, stop: Math.max(3.2, this.reach() - 1.6), hold: 30 }; I.pace = C.reachPace; I.noIdle = true; I.quickTurn = true;
      I.probe = { ...tgt, k: 1, standoff: 1.6 - 1.4 * u }; I.mouth = 0.08 + 0.5 * u; I.low = 0.7; I.breathHold = 0.3; I.alert = 1; I.freeze = false; I.relax = 0;
      I.look = R.ready.includes('light') && a.torch ? { x: a.x + sim.head.l.x * 3, y: a.y, z: a.z + sim.head.l.z * 3, lock: false } : { ...eye };
      return I;
    }
    if (this.stage === 'strike' && (a.speed || 0) > 1.5) {
      // striking at something on the move: the body keeps driving after it and the jaws keep tracking it
      const act = m.sim.act; if (act && act.kind === 'strike' && act.pt && act.t < 0.4) { act.pt.x = a.x + (a.vx || 0) * 0.3; act.pt.z = a.z + (a.vz || 0) * 0.3; }
      I.goal = { kind: 'approach', id: 'peril', x: a.x + (a.vx || 0) * 0.4, z: a.z + (a.vz || 0) * 0.4, stop: 1, quick: true }; I.pace = 10.5; I.burst = true; I.look = eye; I.noIdle = true; I.freeze = false; I.quickTurn = true;
    } else if (this.stage === 'still' || this.stage === 'strike') {
      I.goal = this.stage === 'still' && Math.abs(((Math.atan2(a.x - m.sim.x, a.z - m.sim.z) - m.sim.psi + 9.42) % 6.283) - 3.14) > 0.5 ? { kind: 'face', x: a.x, z: a.z } : null;
      I.freeze = true; I.breathHold = 1; I.alert = 1; I.noIdle = true; I.look = eye; I.relax = 0; I.quickTurn = true; I.pace = 0.4;
    } else if (this.stage === 'rush') {
      I.goal = { kind: 'approach', id: 'peril', x: a.x, z: a.z, stop: 2, quick: true }; I.pace = 10.5; I.burst = this.cur.t < 2; I.quickTurn = true; I.look = eye; I.noIdle = true; I.freeze = false;
    } else if (this.cur && this.cur.kind) {
      const k = this.cur.kind;
      if (k === 'stare' || k === 'lower') { const off = Math.abs(((Math.atan2(a.x - m.sim.x, a.z - m.sim.z) - m.sim.psi + 9.42) % 6.283) - 3.14); I.goal = off > 0.5 ? { kind: 'face', x: a.x, z: a.z } : null; I.freeze = !I.goal; I.look = eye; I.breathHold = 0.9; I.alert = 1; I.noIdle = true; if (k === 'lower') I.stalk = true; }
      else if (k === 'bluff') { const D = this.cur.d0, stop = Math.max(this.reach() + 1.2, D - 3.5); I.goal = { kind: 'approach', id: 'bluff', x: a.x, z: a.z, stop, quick: true }; I.pace = 7; I.burst = true; I.look = eye; I.noIdle = true; }
    }
    // between its warnings, the pressure itself shows, and grows with it: the eyes locked on you, the head carried lower and the
    // body set a little lower, the breath held, its ease gone. (The warn stage was the mind's alone: in a calm-play death it
    // stood 14 s in an ordinary watch, head up, and only its stare and four huffs showed.) What it does is left as it is.
    // (not over the core's questions: their sniffing, cocked head and reading pauses are a body of their own, and the pressure is
    //  held at 'warn' for as long as they go on; the warn body had held its breath through its sniffing. MERGE.md)
    const asking = m.beh && m.beh.name === 'probe' && !m.beh.done;
    if (this.stage === 'warn' && !(this.cur && this.cur.kind === 'bluff')) {
      const k = sstep(0.55, 0.85, this.r);
      if (!I.look || !I.look.lock) I.look = eye;
      // (not the alert carriage: that lifts the head; this one comes down and forward)
      I.low = Math.max(I.low || 0, 0.6 * k); I.relax = 0; I.noIdle = true;
      if (!asking) { I.breathHold = Math.max(I.breathHold || 0, 0.35 + 0.55 * k); I.alert = Math.min(I.alert ?? 0.3, 0.3); I.agitation = Math.max(I.agitation || 0, 0.35 * k); }
    }
    void c;
    return I;
  }
}
