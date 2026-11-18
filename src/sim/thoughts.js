// The animal's stream of thought: many small, true fragments, one at a time, in the words a simple animal mind would have
// ("small thing hide inside", "where gone?", "rock noise. trick"). Nothing here is decided and nothing is made up: every
// thought is read off the mind's live state (what it just sensed and how, where it believes you are and how sure, what
// surprised it, what it remembers you doing, how it feels about you, what it is about to do, what distracted it), and is
// only said while that is still true. The richness is in the stream over time, not in any one sentence.
//
//   events   edges in the state (you came into sight, a noise, a blow, a new behaviour or phase, you started running, you went
//            into the shed, its search came up empty...) queue a thought with a priority and a short life
//   musings  when nothing new happens, now and then it voices a standing fact: where it believes you are, how it feels about
//            you, what it expects of you, what it wants. Often when things are lively, rarely when idle.
//   voice    almost all of it is about you and what you just did, in a small set of crude words it keeps reusing (the shed
//            is "box", you are "small thing"), so what you do and what it thinks go back and forth like call and answer.
//   felt     what it feels in its own body (out of breath, legs heavy, the rock hurt its head, made it jump, full, riled,
//            the same thing failing again) only as the consequence of something between you, at the moment it happens,
//            never as idle chatter: a felt state with nothing of you in it is not said.
//   wording  each idea has several phrasings; the noun for you grows with its model of you ("strange thing", "small thing",
//            "sneaky small thing", "it"); a phrasing used in the last minute or two is avoided.
//
// Uses its own random stream: the thoughts never change the simulation. Each entry in `stream` carries the `cond` it was
// raised on (test/thoughts.mjs checks that it held).
import { makeRng, bearing, wrap } from '../math.js';
import { bodyOf } from './afford.js';

// Its own names for the things in its world, from what it perceives of them relative to its own body, never from what we call
// them: a closed thing with a roof is a box (a big one, or a shiny or stone one), walls lower than its back are little walls,
// walls taller than it with no roof are tall walls, a narrow roofed thing lower than its back is a pipe, a floor up on poles is
// high sticks (high floor when it is long), poles under bits of roof are sticks. A structure can also carry perceived
// properties (`perceived`/`props`: enclosed, low, narrow, tall, hole, under, rock). Each thing keeps the name it was first given.
const MAT = { timber: 'wood', wood: 'wood', hay: 'wood', steel: 'shiny', container: 'shiny', fence: 'shiny', glass: 'shiny', concrete: 'stone', rock: 'stone', block: 'stone', pipe: 'stone' };
/** What it perceives of a structure: sizes against its own body (self: bodyOf), roof, walls, poles, what it is made of. */
export function perceive(S, T, self) {
  if (!S || S.hw === undefined) return null;
  const bodyL = self ? self.length : 13, back = self ? self.shoulderH : 3.1, wide = self ? self.width : 2.1;
  const walls = S.walls || [], openings = S.openings || [];
  const posts = T && T.obstacles ? T.obstacles.filter((o) => o.sid === S.id && !o.seg).length : 0;
  let wallH = walls.reduce((m, w) => Math.max(m, w.h), 0), walled = walls.length >= 4;
  // a world that lists no walls: feel round the rim for what stands there (how much of it is solid, and how high)
  if (!walls.length && T && T.near && !(openings.length && openings.every((o) => o.up))) {
    const c = Math.cos(S.yaw || 0), sn = Math.sin(S.yaw || 0), L = 4 * (S.hw + S.hd), n = Math.max(12, Math.ceil(L)), tops = [];
    for (let i = 0; i < n; i++) {
      let u = (i + 0.5) / n * L, lx, lz;
      if (u < 2 * S.hw) { lx = -S.hw + u; lz = -S.hd; } else if ((u -= 2 * S.hw) < 2 * S.hd) { lx = S.hw; lz = -S.hd + u; } else if ((u -= 2 * S.hd) < 2 * S.hw) { lx = S.hw - u; lz = S.hd; } else { u -= 2 * S.hw; lx = -S.hw; lz = S.hd - u; }
      const x = S.cx + lx * c + lz * sn, z = S.cz - lx * sn + lz * c;
      let top = 0; for (const q of T.near(x, z, 0.9)) if (q.bot === undefined && Math.hypot(q.x - x, q.z - z) < q.r + 0.9) top = Math.max(top, q.top - S.base);
      tops.push(top);
    }
    const solid = tops.filter((h) => h > 0.8);
    walled = solid.length > 0.6 * n; wallH = solid.length > 0.25 * n ? solid.sort((a, b) => a - b)[solid.length >> 1] : 0;
  }
  const span = 2 * Math.max(S.hw, S.hd), thin = 2 * Math.min(S.hw, S.hd);
  const raised = (!walls.length && !walled) && openings.length > 0 && openings.some((o) => o.y - S.base > back * 0.9);
  return { roofed: !!S.roof, walled, low: wallH > 0 && wallH < back, tallWalls: wallH > back, big: span > bodyL * 1.2, narrow: thin < wide * 1.5,
    raised, poles: posts >= 4 && !walled && walls.length < 4, mat: MAT[S.mat] || null, height: S.h };
}
export function nameOf(S, P0 = null) {
  if (!S) return 'there';
  const P = S.perceived || S.props || null;
  if (P) {
    if (P.tall && !P.enclosed) return 'high sticks';
    if (P.rock && P.narrow) return 'rock crack';
    if (P.under && (P.narrow || P.hole)) return 'pipe';
    if (P.enclosed) return 'box';
    if (P.low) return 'little walls';
    if (P.narrow) return 'crack';
    if (P.hole) return 'hole thing';
  }
  const Q = P0;
  if (Q) {
    if (Q.raised) return Q.big ? 'high floor' : 'high sticks';
    if (Q.roofed && Q.narrow && Q.height <= 3.1) return 'pipe';
    if (Q.roofed && Q.walled) return Q.mat === 'shiny' || Q.mat === 'stone' ? Q.mat + ' box' : Q.big ? 'big box' : 'box';
    if (Q.roofed && !Q.walled && !Q.poles) return Q.mat === 'stone' ? 'stone hole' : 'hole thing';
    if (Q.poles) return Q.mat === 'stone' ? 'stone sticks' : 'sticks';
    if (Q.tallWalls) return Q.mat === 'shiny' ? 'shiny walls' : 'tall walls';
    if (Q.low) return 'little walls';
  }
  return 'strange place';
}
// the thinker naming right now (its own coined names, kept per thing: see Thinker._name)
let CUR = null;
const nameKey = (k) => (CUR ? CUR._name(k) : 'strange place');
const STRUCT = new Proxy({}, { get: (_, k) => (typeof k === 'string' ? nameKey(k) : undefined) });
const INSIDE = new Proxy({}, { get: (_, k) => (typeof k === 'string' ? (CUR && CUR._raised(k) ? 'up ' : 'in ') + nameKey(k) : undefined) });
const ATTACKS = ['butt', 'swipe', 'pin', 'seize', 'toy'];
// Its own names for the places of the paddock, from what it perceives there (deep water, mud, grass taller than you, trunks too
// close to pass, a ditch, a jumble of rock, ground well above its head), never our names for them. null: open ground.
export function placeWord(T, x, z, from = null) {
  if (!T || !T.placeName) return null;
  const zn = T.placeName(x, z);
  if (from && T.height(x, z) - T.height(from.x, from.z) > 4) return 'up high';
  if (T.depthAt && T.depthAt(x, z) > 0.25) return 'in water';
  if (T.surfaceAt && T.surfaceAt(x, z) === 'mud') return 'in mud';
  if (T.coverHeight && T.coverAt(x, z) > 0.35 && T.coverHeight(x, z) > 1.4) return T.wetAt && T.wetAt(x, z) > 0.3 ? 'in reeds' : 'in tall grass';
  // trunks close round it: in trees; ground well above where it stands: on hill
  let tr = 0; for (const o of (T.obstaclesNear ? T.obstaclesNear(x, z, 6) : [])) if (o.kind === 'tree' && Math.hypot(o.x - x, o.z - z) < 6) tr++;
  if (tr >= 3) return 'in trees';
  if (from && T.height(x, z) - T.height(from.x, from.z) > 2) return 'on hill';
  void zn; return null;
}
// a place it can be 'in', as against a direction it can only be 'that way'
const LOCATIVE = /^(in|by|on|up|at|over|behind|inside)\b/;
const words = (s) => s.split(/\s+/).filter(Boolean).length;
const newModel = () => ({ missT: [], emptyT: [], ran: 0, hid: 0, shouts: 0, stillT: 0, saidStill: false, closeLooks: 0, gave: 0, torchT: [], followT: 0, unwT: 0, backT: 0, awayT: 0 });
// lines the owner approved word for word (2026-11-18) that run past five words, or do once a name stands in for {N}
const LONG_OK = new Set(['it go out sometime. wait by hole', '{N} go away from hole', '{N} in there. know it']);
export class Thinker {
  constructor(mind, seed = 1) {
    this.m = mind; this.R = makeRng(seed * 104729 + 911);
    this.stream = []; this.queue = []; this.used = new Map(); this.keyT = new Map();
    this.prev = null; this.lastEmit = -99; this.lastText = ''; this.lastRef = -99; this.lastMuse = -99;
    this.gap = 2; this.tick = 0;
    // what it has seen you do (tallied from what it perceived at the time)
    this.model = newModel();
    this.rock = false;      // a stone has come into its world (sticky: see _q)
    this.names = new Map();      // its coined name for each thing it has met (by the thing's own id), fixed once given
  }
  /** Its name for a structure (key 's<id>'): coined the first time from what it perceives, then kept. */
  _name(k) {
    const e = this.names.get(k); if (e) return e.name;
    const T = this.m.T, id = +String(k).slice(1), S = (T.structures || []).find((x) => x.id === id) || (T.solids || []).find((x) => x.id === id);
    if (!S) return 'strange place';
    let self = null; try { const M = this.m.sim.selfModel(), B = bodyOf(M); self = { length: (M.tailLen || 6.6) + M.neckLen + M.headLen + 2.9, shoulderH: B.shoulderH, width: B.width }; } catch (e2) { self = null; }
    const P = perceive(S, T, self), name = nameOf(S.perceived ? S : { ...S, perceived: null }, P);
    this.names.set(k, { name, P }); return name;
  }
  /** Its word for a standing thing (an obstacle) that is not a tree: rock when the world says it is rock (kind or material),
   *  else from its shape against its own body (thin: post; taller than its back: big thing; else lump). Kept per thing. */
  _thingWord(o) {
    const W = this.oWords || (this.oWords = new WeakMap()), e = W.get(o); if (e) return e;
    let w;
    if (o.kind === 'rock' || MAT[o.mat] === 'stone' || MAT[o.kind] === 'stone') w = 'rock';
    else { let back = 3.1; try { back = bodyOf(this.m.sim.selfModel()).shoulderH; } catch (e2) { /* default */ } w = o.r < 0.6 ? 'post' : (o.h || 0) > back ? 'big thing' : 'lump'; }
    W.set(o, w); return w;
  }
  _raised(k) { this._name(k); const e = this.names.get(k); return !!(e && e.P && e.P.raised); }

  /** The one it knew is gone: what it had seen that one do, and anything queued about it, go too. */
  forget() { this.model = newModel(); this.names.delete('you'); this.queue = this.queue.filter((c) => c.key === 'kill'); this.lastRef = -99; }

  // ------------------------------------------------------------------ reading the mind
  _snap() {
    const m = this.m, K = m.know, a = K.target, c = m.ctx || {}, b = m.beh, sim = m.sim;
    CUR = this;
    { const n = m.mem.lastNoise, h = m.lastHit; if (m.mem.stoneSeen || (n && n.kind === 'stone') || (h && h.kind === 'stone') || m.mem.decoys > 0 || (m.kind && m.kind.stung > 0)) this.rock = true; }
    const key = (S) => (S ? 's' + S.id : null);
    const s = {
      t: m.t, seen: !!(K.seen && a), d: c.d ?? 99, running: c.running || 0, approach: c.approach || 0, watched: !!c.watched,
      encl: key(c.enclosed), beliefIn: key(c.beliefIn), up: !!(c.enclosed && c.aff && !c.aff.body && c.aff.rise > 2.5), cert: m.sum.cert, sx: m.sum.x, sz: m.sum.z,
      beh: b ? b.name : null, gen: b ? b.gen : 0, phase: b ? b.phase : null, sub: b ? b.sub : null, landed: !!(b && b.landed), missed: !!(b && b.missed),
      memo: !!(b && b.memo), memoWait: !!(b && b.memoWait), cut: !!(b && b.cut), cutS: b && b.cut && b.cut.S ? key(b.cut.S) : null, reason: b ? b.reason : null,
      noiseT: m.mem.lastNoise ? m.mem.lastNoise.t : -99, hitAt: m.hitAt, scent: m.scent, focusId: m.focus ? m.focus.id : null,
      preyId: m.prey ? m.prey.id : null, thunderT: m.thunder ? m.thunder.t : -99, glare: m.glare, fooled: m.mem.fooled, decoys: m.mem.decoys,
      decoyT: m.decoyT ?? -99, foundAtMemo: m.foundAtMemo ?? -99, stoneId: m.mem.stoneSeen ? m.mem.stoneSeen.id : null,
      wrongT: m.lastWrong ? m.lastWrong.t : -99, wrongKind: m.lastWrong ? m.lastWrong.kind : null, enc: m.mem.encounters,
      lastSeenT: K.lastSeenT, fatigue: sim.exertion, flinchT: m.lastFlinch ?? -99, hunger: m.hunger, irritation: m.mood.irritation, x: a ? a.x : 0, z: a ? a.z : 0,
      speed: a ? a.speed : 0, crouch: !!(a && a.crouch), torch: !!(a && a.torch), state: a && K.seen ? a.state || 'free' : null,
      still: a ? a.still || 0 : 0, struggle: a ? a.struggle || 0 : 0,
      verdict: m.ap ? m.ap.verdict : 'curious', apT: m.ap && m.ap.last ? m.ap.last.t : -99, rival: !!(b && b.rival),
      via: K.seen ? K.via || 'sight' : null, gait: K.seen ? K.gait || null : null, stepT: m.mem.steps ? m.mem.steps.t : -99, stepFast: !!(m.mem.steps && m.mem.steps.fast),
      place: K.seen && a && K.via === 'sight' ? placeWord(m.T, a.x, a.z, sim) : null, wade: m.T.depthAt ? m.T.depthAt(sim.x, sim.z) : 0,
      calm: !!(m.wind && m.T.windAt && Math.hypot(m.wind.x, m.wind.z) > 1 && Math.hypot(...Object.values(m.T.windAt(sim.x, sim.z, m.wind))) < 0.4 * Math.hypot(m.wind.x, m.wind.z)),
      bumpT: m.mem.bump ? m.mem.bump.t : -99, crashT: m.mem.crash ? m.mem.crash.t : -99, waT: m.waT ?? -99, waMode: m.waMode || null, orientT: m.objOrient ? m.objOrient.t : -99,
      noReachT: m.mem.noReach ? m.mem.noReach.t : -99, stuckT: m.mem.stuck ? m.mem.stuck.t : -99, gaveT: m.mem.gaveUp ? m.mem.gaveUp.t : -99,
      hushT: m.mem.hush ? m.mem.hush.t : -99, bumpReach: !!(m.mem.bump && m.mem.bump.reach),
      fIn: m.fev && m.fev.inT !== undefined ? m.fev.inT : -99, fMoved: m.fev && m.fev.movedT !== undefined ? m.fev.movedT : -99, fShort: m.fev && m.fev.shortT !== undefined ? m.fev.shortT : -99,
      fOther: m.fev && m.fev.otherT !== undefined ? m.fev.otherT : -99, fOtherK: m.fev ? m.fev.otherK || null : null, fQuiet: m.fev && m.fev.quietT !== undefined ? m.fev.quietT : -99,
      meaty: a && K.seen ? a.meaty || 0 : 0, rv: Math.abs(sim.v),
      met: m.kind ? m.kind.met : 0, forgotT: m.forgotT ?? -99, killedT: m.killedT ?? -99, limping: !!(a && K.seen && a.limping), blood: !!(m.ap && m.ap.flags.blood), why: m.ap && m.ap.flags ? m.ap.flags.why : null,
    };
    return s;
  }
  /** Where a place is, in its terms: a landmark next to it, else which way it lies from the animal. */
  _where(x, z, { landmark = true } = {}) {
    const m = this.m, T = m.T, sim = m.sim;
    if (landmark) {
      const S = T.insideStructure ? T.insideStructure(x, z) : null; if (S) return INSIDE['s' + S.id] || 'inside';
      let best = null, bd = 1e9; for (const o of T.obstacles) { if (o.kind === 'wall') continue; const d = Math.hypot(o.x - x, o.z - z) - o.r; if (d < bd) { bd = d; best = o; } }
      if (best && bd < (best.kind === 'tree' ? 2.5 : 4.5)) {
        // behind it if the rock is between the animal and the place, else just by it
        const between = Math.hypot(best.x - sim.x, best.z - sim.z) < Math.hypot(x - sim.x, z - sim.z);
        if (best.kind === 'tree') return 'by tree';
        const w = this._thingWord(best);
        return between ? 'behind ' + w : 'by ' + w;
      }
      const pw = placeWord(T, x, z, sim);
      if (pw === 'up high' || pw === 'in water' || pw === 'in tall grass' || pw === 'in reeds' || pw === 'in mud') return pw;
      if (T.coverAt && T.coverAt(x, z) > 0.35) return 'in ferns';
      if (pw) return pw;
    }
    const rel = wrap(bearing(x - sim.x, z - sim.z) - sim.psi), d = Math.hypot(x - sim.x, z - sim.z);
    const dir = Math.abs(rel) < 0.6 ? 'ahead' : Math.abs(rel) > 2.3 ? 'behind me' : 'that way';
    return d > 45 && dir !== 'behind me' ? 'far ' + (dir === 'ahead' ? 'ahead' : 'away') : dir;
  }
  /** The word for you: what it has come to make of you. `it` when it was just thinking about you. */
  _noun(s) {
    const m = this.m, R = this.R;
        if (s.t - this.lastRef < 6 && R() < 0.55) return 'it';
    const base = s.enc <= 1 && m.know.seenTime < 8 ? (s.met >= 2 ? 'new small thing' : 'strange thing') : 'small thing';
    const adj = [];
    if (m.grudge > 0.3) adj.push('bad');
    if (this._sneaky()) adj.push('sneaky');
    if (this.model.shouts >= 2) adj.push('loud');
    if (this.model.ran >= 2) adj.push('fast');
    return adj.length && base === 'small thing' && R() < 0.35 ? adj[Math.floor(R() * adj.length)] + ' ' + base : base;
  }
  _sneaky() { const M = this.m.mem; return M.decoys >= 1 || M.spots.some((p) => p.n >= 2); }

  // ------------------------------------------------------------------ queueing and saying
  /** Queue a thought. texts: phrasings ({N} = the word for you, {W} = a place). */
  _q(key, kind, pri, texts, cond, { ttl = 3, cool = 12, ok = null, W = null } = {}, sub = null) {
    const t = this.m.t;
    // "rock" only once a stone has really come into it (seen flying, heard landing, felt hitting): a world whose missiles are
    // something else gets the other phrasings (or nothing), never a rock that was not there
    if (!this.rock) { texts = texts.filter((x) => !/\brock\b(?! crack)/.test(x)); if (!texts.length) return; }
    if (t - (this.keyT.get(key) ?? -999) < cool || (sub && t - (this.keyT.get(sub) ?? -999) < 50)) return;
    if (sub) this.keyT.set(sub, t);
    const old = this.queue.findIndex((c) => c.key === key); if (old >= 0) this.queue.splice(old, 1);
    const [about, ref] = this._about(key, texts, cond);
    this.queue.push({ key, kind, pri, texts, cond, at: t, ttl, ok, W, cool, about, ref });
  }
  /** What a thought is about (an item of attention: 'you', 'prey:<id>', 'obj:<id>', 'sound', or 'self'), and what "it" in it
   *  refers to (in the phrasings, `it` and {N} are you, except in what it means to do about food, prey or a light). */
  _about(key, texts, cond) {
    const m = this.m, A = m.att, b = m.beh, hasIt = texts.some((x) => /\{N\}|\bit\b/.test(x));
    let about = 'you';
    if (key === 'beh' || key === 'phase') { const f = A ? A._behFocus() : 'you'; about = f === undefined || f === null ? (hasIt ? 'you' : 'self') : f; }
    else if (key === 'focus' || key === 'muse:eat' || key === 'noreach') about = m.focus ? 'obj:' + m.focus.id : b && b.obj != null ? 'obj:' + b.obj : 'self';
    else if (key === 'orient') about = m.objOrient ? 'obj:' + m.objOrient.id : 'self';
    else if (key === 'prey' || key === 'muse:preyM') about = m.prey ? 'prey:' + m.prey.id : 'self';
    else if (key === 'noise') about = cond === 'heard' || cond === 'heard+fast' || cond === 'heard+flinch' ? 'sound' : 'you';
    else if (/^(hit|glare|thunder|wade|calm|full|spent|winded|stuck|gaveup|hush|bump|crash|muse:(hunger|bored|idle|tired))$/.test(key) && !hasIt) about = 'self';
    const ref = (key === 'beh' || key === 'phase') && about !== 'self' ? about : 'you';
    return [about, ref];
  }
  /** Its stable name for an item it is not attending to (never "it"). */
  _nameFor(key, s) {
    if (key === 'you') { const e = this.names.get('you'); if (e) return e.name; const n = s.enc <= 1 && s.met >= 2 ? 'new small thing' : s.enc <= 1 && this.m.know.seenTime < 8 ? 'strange thing' : 'small thing'; if (s.enc > 1 || this.m.know.seenTime >= 8) this.names.set('you', { name: n }); return n; }
    if (key === 'sound') return 'noise';
    const e = this.names.get(key); if (e) return e.name;
    let name = 'that thing';
    if (key.startsWith('prey:')) { const q = (this.m.att && this.m.att.world && (this.m.att.world.prey || []).find((p) => 'prey:' + p.id === key)) || this.m.prey; const sz = q && q.size ? q.size : 1; name = sz > 1.05 ? 'big meat animal' : sz < 0.93 ? 'little meat animal' : 'meat animal'; }
    else if (key.startsWith('obj:')) { const o = this.m.focus && 'obj:' + this.m.focus.id === key ? this.m.focus : null; name = !o ? 'that thing' : o.kind === 'flare' || o.bright ? 'bright thing' : o.kind === 'meat' || o.kind === 'carcass' ? 'meat' : 'that thing'; }
    this.names.set(key, { name }); return name;
  }
  /** Noticed, and not worth leaving what it is doing: the weighing, in its words (no "it": the thing is named). */
  _disTexts(about, s) {
    const X = this._nameFor(about, s), f = this.m.att ? this.m.att.focusKey() : null, b = this.m.beh, n = b ? b.name : '';
    const act = f && f.startsWith('obj:') ? (n === 'investigate' ? ['bright thing first'] : ['eat first', 'meat first', 'keep eating']) : f && f.startsWith('prey:') ? ['hunt first', 'meat first'] : n === 'besiege' ? ['get in first'] : f === 'you' ? ['small thing first', 'watch small thing'] : ['not now'];
    return [...act.map((a) => X + '. ' + a), X + '. not now', 'see ' + X + '. so what'].filter((x) => words(x) <= 5);
  }
  /** A phrasing not used for a minute or two (else the one used longest ago), filled in, at most five words. */
  _render(c, s) {
    const t = this.m.t, R = this.R, fresh = [], stale = [];
    for (const x of c.texts) (t - (this.used.get(x) ?? -999) > 120 ? fresh : stale).push(x);
    for (let i = fresh.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [fresh[i], fresh[j]] = [fresh[j], fresh[i]]; }
    stale.sort((a, b) => (this.used.get(a) ?? -999) - (this.used.get(b) ?? -999));
    const NAME = c.name || null, n0 = NAME || this._noun(s), nouns = NAME ? [NAME] : [n0, n0.split(' ').slice(-2).join(' '), 'it'];
    for (let tpl of c.pri < 0.5 ? fresh : [...fresh, ...stale]) {      // a passing musing is never repeated soon; news may be
      // after a describing word, or where `it` would read wrong, the plain noun
      const plain = /(bad|strange|noisy|was|where|is|want) \{N\}|\{N\} (tall|box|place)/.test(tpl), ns = NAME ? [NAME] : plain ? [/^(strange thing|new small thing)$/.test(n0) && !/(bad|strange) \{N\}/.test(tpl) ? n0 : 'small thing'] : nouns;
      if (NAME && /\b(bad|strange|noisy) \{N\}/.test(tpl)) continue;
      const tpl0 = tpl; tpl = NAME ? tpl.replace(/\bit\b/, '{N}') : tpl;      // name it once; a later `it` in the same thought then means the named thing      // "it" is the focus only: anything else is named
      for (const n of tpl.includes('{N}') ? ns : [null]) {
        const W = c.W || 'there', loc = LOCATIVE.test(W);
        if ((tpl.includes('{L}') && !loc) || (tpl.includes('{D}') && loc)) continue;      // 'it {L}' needs a place ('it in trees'), 'from {D}' a direction ('from that way')
        const out = tpl.replaceAll('{N}', n).replaceAll('{W}', W).replaceAll('{L}', W).replaceAll('{D}', W);      // every occurrence: a second {N} (from `it` named twice) used to be shown raw
        if ((words(out) <= 5 || (LONG_OK.has(tpl0) && words(out) <= 7)) && words(out) >= 2 && !out.includes('{') && out !== this.lastText) return { tpl: tpl0, out, ref: !NAME && tpl.includes('{N}') };
      }
    }
    return null;
  }
  _emit(s) {
    const t = s.t;
    this.queue = this.queue.filter((c) => t - c.at <= c.ttl && (!c.ok || c.ok(s)));
    if (!this.queue.length) return;
    const busy = this._busy(s);
    let best = null; for (const c of this.queue) if (!best || c.pri > best.pri || (c.pri === best.pri && c.at < best.at)) best = c;
    const need = best.pri >= 0.85 ? 0.8 : busy ? this.gap : this.gap * 2.5;
    if (t - this.lastEmit < need) return;
    // one attention (attend.js): a thought about something other than the focus comes with the head going to it, or as a
    // weighing (noticed; what it is doing matters more), or not at all
    const A = this.m.att, about = best.about || 'you';
    // a dismissal is a disregard of its own ("leave it": you are noticed and let be)
    let resp = A ? (best.key === 'muse:ignore' ? A._dis('you') : A.respond(about, best.pri)) : 'focus';
    // (what it has just killed is no thing to weigh and let be: a kill is said as itself, or not at all; as a disregard it came
    //  out as a disregard of whoever stood there next, under the kill's condition)
    if (best.key === 'kill' && resp === 'disregard') resp = 'focus';
    if (resp === 'wait') return;      // stays queued (until its short life runs out)
    this.queue.splice(this.queue.indexOf(best), 1);
    if (resp === 'drop') return;
    const foc = A ? A.focusKey() : about;
    let c = best;
    if (resp === 'disregard') c = best.key === 'muse:ignore' ? { ...best, kind: 'disregard', name: this._nameFor('you', s) } : { ...best, kind: 'disregard', texts: this._disTexts(about, s), name: null };
    else if (best.ref !== foc) c = { ...best, name: this._nameFor(best.ref, s) };
    const r = this._render(c, s); if (!r) return;
    this.used.set(r.tpl, t); this.keyT.set(best.key, t); this.lastEmit = t; this.lastText = r.out; if (r.ref) this.lastRef = t;
    this.gap = 1.7 + 1.3 * this.R();
    this.stream.push({ t: +t.toFixed(2), text: r.out, kind: c.kind, cond: best.cond, key: best.key, about, focus: foc, resp });
    if (this.stream.length > 24) this.stream.shift();
  }
  _busy(s) { const m = this.m; return s.seen || m.mood.arousal > 0.3 || (s.beh && !['roam', 'pause'].includes(s.beh)) || s.t - s.lastSeenT < 30; }

  // ------------------------------------------------------------------ the stream
  step() {
    const s = this._snap(), p = this.prev || { ...s, gen: 0, beh: null, phase: null, focusId: null, preyId: null, seen: false, scent: 0, noiseT: -99, thunderT: -99, stoneId: null, hitAt: -999, decoyT: -99, wrongT: -99, glare: 0 };
    this._events(p, s);
    this._coreEvents(s);
    this._muse(s);
    this._emit(s);
    this.prev = s;
  }

  _events(p, s) {
    const m = this.m, t = s.t, q = this._q.bind(this), K = m.know, mo = this.model, sim = m.sim;
    // ---- you, coming into sight
    if (!p.seen && s.seen) {
      const gone = t - p.lastSeenT, dBel = Math.hypot(p.sx - s.x, p.sz - s.z);
      if (s.via === 'near') q('sight', 'sense', 0.95, ['something close!', 'smell something close', 'hear something. close', 'something behind me'], 'near', { cool: 5 });
      else if (s.enc <= 1 && s.met >= 2) q('sight', 'surprise', 0.96, ['another small thing', 'new small thing', 'yet another small thing?', 'other small thing there'], 'seen+newcomer', { cool: 5 });
      else if (s.enc <= 1) q('sight', 'sense', 0.95, ['what is that?', 'something there', 'strange thing there', 'what strange thing?', 'something move there'], 'seen', { cool: 5 });
      else if (t - s.foundAtMemo < 1.5) q('sight', 'memory', 0.97, ['there! same place', 'knew it. same place', 'always hide there'], 'seen+memo', { cool: 5 });
      else if (gone > 4 && p.cert > 0.3 && dBel > 15) q('sight', 'surprise', 0.97, ['not there. it here?!', '{N} here? how?', 'wrong place! it here', 'how it get here?'], 'seen+wrong', { cool: 5 });
      else if (gone > 4 && p.cert > 0.3 && dBel < 8) q('sight', 'belief', 0.95, ['there! knew it', 'knew it', '{N} still there'], 'seen+right', { cool: 5 });
      else if (gone > 4) q('sight', 'sense', 0.95, ['{N} come back', 'there it is', 'see {N} again', 'back again'], 'seen', { cool: 5 });
      else q('sight', 'sense', 0.9, ['there it is', 'see it', 'see it there'], 'seen', { cool: 5 });
      // how it knew before it saw: a scent or a noise just now, from about there
      if (p.scent > 0.08) q('sightHow', 'sense', 0.7, ['smell was {N}', 'smell it. see it'], 'seen', { cool: 30 });
      else if (t - p.noiseT < 3.5 && m.mem.lastNoise && Math.hypot(m.mem.lastNoise.x - s.x, m.mem.lastNoise.z - s.z) < 12) q('sightHow', 'sense', 0.7, ['noise was {N}', 'it make that noise'], 'seen+heard', { cool: 30 });
      // a new one: what the last one was (all it carries over), and the question starting again
      if (s.enc <= 1 && s.met >= 2) {
        const k = m.kind, pr = [];
        if (k.ate > 0.3 || k.kept > 0) pr.push(['ate small thing before', 'last small thing was meat', 'other small thing taste good']);
        else if (k.killed > 0) pr.push(['other small thing dead', 'killed other small thing']);
        if (k.spat > k.kept) pr.push(['other small thing taste bad']);
        if (k.slipped > 0 || k.stung > 0) pr.push(k.stung > 0 ? ['last small thing throw rock'] : ['last small thing fight hard']);
        if (k.bolted > 0) pr.push(['last small thing run']);
        if (pr.length) q('meet', 'memory', 0.8, pr[Math.floor(this.R() * pr.length) % pr.length], 'seen+newcomer', { ttl: 9, cool: 60, ok: (z) => z.seen && z.enc <= 1 });
        q('meetNew', 'belief', 0.72, ['not same small thing', 'same thing? no', 'new small thing', 'what new thing want?'], 'seen+newcomer', { ttl: 12, cool: 60, ok: (z) => z.seen && z.enc <= 1 });
        if (m.hunger < 0.45) q('meetFed', 'feel', 0.6, ['belly full. just look', 'not hungry now', 'full. look only'], 'seen+newcomer+fed', { ttl: 14, cool: 60, ok: (z) => z.seen && z.enc <= 1 && m.hunger < 0.5 });
      }
      // what it remembers of you
      if (s.enc > 1) {
        const mem = [];
        if (m.wrongs.stones > 0) mem.push(['that thing throw rock', 'rock thrower again', '{N} throw rock before']);
        if (m.wrongs.glare > 1) mem.push(['light thing again', 'it shine light before']);
        if (m.wrongs.food > 0.5) mem.push(['it take my meat before']);
        if (mo.ran >= 1) mem.push(['it run last time', '{N} run before']);
        if (mo.hid >= 1 || m.mem.spots.some((q) => q.n >= 2)) mem.push(['it hide before', '{N} like to hide']);
        if (mo.shouts >= 1) mem.push(['loud thing again', 'noisy {N}']);
        if (mem.length) q('recall', 'memory', 0.65, mem[Math.floor(this.R() * mem.length) % mem.length], 'seen+memory', { ttl: 6, cool: 40, ok: (z) => z.seen });
      }
    }
    // ---- you, out of sight
    if (p.seen && !s.seen && !p.encl && s.forgotT <= p.forgotT) {
      const close = p.d < 30, W = this._where(K.last.x, K.last.z);
      const sneak = p.speed > 0.6 || p.crouch;
      if (W.startsWith('behind') || W.startsWith('by') || W === 'in ferns') q('lost', 'belief', 0.9, sneak ? ['{N} go {W}', 'gone {W}', 'it hide {W}'] : ['not see it now', 'lost it {W}', 'it {L}. not see'], 'lost', { W, ok: (z) => !z.seen, cool: 6 });
      else q('lost', 'surprise', close ? 0.92 : 0.85, close ? ['where gone?', 'it gone!', '{N} gone?', 'where it go?'] : ['lost it', 'where gone?', 'not see {N}'], 'lost', { ok: (z) => !z.seen, cool: 6 });
    }
    // ---- what you are doing, seen
    if (s.seen && p.seen) {
      // running: seen (it watched you go fast for a while), or only heard (your feet, close by, out of its sight)
      // (a run it watched start: one it only heard, or saw already under way, is not one it can say it saw)
      if (s.running && !p.running && s.state === 'free' && s.via === 'sight' && p.seen) { mo.ran++; if (s.fatigue > 0.6 && s.approach <= 0.4) q('run', 'feel', 0.85, ['it run. legs tired', 'it run. me tired', 'it run. no breath'], 'seen+running+eye+tired', { ok: (z) => z.seen });
        else q('run', 'sense', 0.85, s.approach > 0.4 ? ['{N} run at me!', 'see it come fast!'] : ['{N} run!', 'see it run away', 'it run. see it'], 'seen+running+eye', { ok: (z) => z.seen }); }
      if (s.gait === 'run' && p.gait !== 'run' && s.via === 'near') { mo.heardRan = (mo.heardRan || 0) + 1; q('run', 'sense', 0.85, ['hear it run', 'feet run. close', 'hear feet. fast'], 'near+hearrun', { ok: (z) => z.seen }); }
      else if (s.gait === 'walk' && !p.gait && s.via === 'near' && s.d < 8) q('hearWalk', 'sense', 0.6, ['hear it. close', 'feet behind me', 'smell it. close'], 'near', { ok: (z) => z.seen && z.via === 'near', cool: 20 });
      if (s.approach > 0.45 && p.approach < 0.3 && s.d < 30 && !s.running && s.via === 'sight') q('approach', 'sense', 0.75, ['{N} come closer', 'it come to me', 'closer. closer'], 'seen+approach', { ok: (z) => z.seen, cool: 15 });
      if (s.place && s.place !== p.place && p.place !== undefined && !s.encl) {
        const W = s.place, hi = W === 'up high' || W === 'on high stone';
        q('place', 'sense', 0.75, hi ? ['{N} go up high', 'it up high', 'it climb up'] : W === 'in water' ? ['{N} go in water', 'it in water', 'it wade'] : ['{N} go {W}', 'it go {W}', 'it {W} now'], 'place:' + W, { W, ok: (z) => z.place === W, cool: 10 }, 'place:' + W);
      }
      if (s.crouch && !p.crouch && s.via === 'sight') q('crouch', 'sense', 0.75, ['{N} go low', 'it get small', 'it get low. hide?'], 'seen+crouch', { ok: (z) => z.seen && z.crouch });
      if (s.watched && !p.watched && s.d < 30) q('watched', 'sense', 0.55, ['it look at me', '{N} watch me', 'it see me'], 'seen+watched', { ok: (z) => z.seen, cool: 25 });
      if (s.torch && !p.torch && s.via === 'sight') q('torch', 'sense', 0.7, ['{N} make light', 'it hold bright thing'], 'seen+torch', { ok: (z) => z.seen });
      if (s.encl && !p.encl) { mo.hid++; q('inside', 'sense', 0.9, s.up ? ['{N} go up high', 'it climb up', 'it up ' + STRUCT[s.encl]] : ['{N} go ' + INSIDE[s.encl], 'it hide ' + INSIDE[s.encl], STRUCT[s.encl] + '. it go in'], 'seen+inside', { ok: (z) => !!z.encl || !z.seen, cool: 8 }); }
      if (!s.encl && p.encl) q('outside', 'sense', 0.85, ['{N} come out', 'out of ' + STRUCT[p.encl] + '!', 'it come out'], 'seen+outside', { ok: (z) => z.seen && !z.encl, cool: 8 });
      // standing there doing nothing
      if (s.speed < 0.3 && s.state === 'free') mo.stillT += s.t - p.t; else { mo.stillT = 0; mo.saidStill = false; }
      if (mo.stillT > 14 && !mo.saidStill) { mo.saidStill = true; q('still', 'sense', 0.5, ['{N} not move', 'it just stand', 'why it stand there?', 'it wait. for what?'], 'seen+still', { ok: (z) => z.seen && z.speed < 0.5, ttl: 5, cool: 40 }); }
    }
    // ---- you, in its jaws or under its foot
    if (s.state && s.state !== p.state) {
      const st = s.state, T = {
        air: ['{N} fly!', 'it fly!', 'up it go'], down: ['it fall down', '{N} down', 'it on ground'], rising: ['it get up', '{N} get up'],
        held: ['got it!', 'in mouth', '{N} in mouth'], pinned: ['under foot', 'got it. under foot'], dead: ['it not move now', 'it stop. dead', 'dead small thing'],
      }[st];
      if (T) q('state', 'body', 0.95, T, 'state:' + st, { ok: (z) => z.state === st, cool: 2 });
      else if (st === 'free' && ['held', 'pinned'].includes(p.state)) q('state', 'body', 0.95, ['it get away!', '{N} out!', 'it slip out'], 'state:free', { ok: (z) => z.state === 'free' || !z.seen, cool: 2 });
    }
    if (s.state && ['held', 'pinned'].includes(s.state) && s.struggle > 0.3 && p.struggle <= 0.3) q('kick', 'body', 0.8, ['it kick', 'it wriggle', 'still fight'], 'struggle', { ok: (z) => z.struggle > 0.15, cool: 6 });
    if (s.state && ['down', 'held', 'pinned'].includes(s.state) && s.still > 3 && p.still <= 3) q('limp', 'body', 0.8, ['not move. dead?', 'it stop moving', 'it go quiet'], 'limp', { ok: (z) => z.still > 2, cool: 10 });
    // ---- sounds
    if (s.noiseT > p.noiseT && m.mem.lastNoise) {
      const n = m.mem.lastNoise, W = this._where(n.x, n.z, { landmark: false }), atYou = s.seen && Math.hypot(n.x - s.x, n.z - s.z) < 6;
      if (n.kind === 'shout') mo.shouts++;
      if (n.kind === 'stone') this.queue = this.queue.filter((c) => c.key !== 'stoneFly');      // it has landed: too late to say it flies
      const ok = (z) => z.t - z.noiseT < 3;
      // a thing it saw thrown or lying there made it: the thought is about that thing, as it saw it (never the thrower's body)
      if (n.obj) { const nm = n.obj.bright ? 'bright thing' : n.obj.smelly ? 'meat' : 'something'; q('noise', 'sense', 0.8, n.obj.sawFly ? [nm + ' land', nm + ' fall there', 'thump. ' + nm] : [nm + ' fall', 'thump. ' + nm + ' there'], 'heard+thing', { ok }); }
      else if (atYou && n.kind === 'whistle') q('noise', 'sense', 0.8, ['it make high noise', '{N} call. why?'], 'heard+seen', { ok });
      else if (atYou && (n.kind === 'step' || n.kind === 'stone')) { /* it can see what made that */ }
      else if (atYou) q('noise', 'sense', 0.8, n.kind === 'shout' ? ['{N} make noise', 'it shout at me', 'loud small thing'] : n.kind === 'thud' ? ['thump! it land', 'it hit ground'] : ['it make noise'], 'heard+seen', { ok });
      else if (n.kind === 'stone' && Math.hypot(n.x - sim.x, n.z - sim.z) < 8 && t - s.hitAt > 3 && (s.seen || s.stoneId)) q('noise', 'sense', 0.88, ['rock miss me', 'rock fall here. miss', 'it throw. miss'], 'heard+nearmiss', { ok });
      else if (n.kind === 'stone' && s.seen && m.mem.stoneSeen && t - m.mem.stoneSeen.t < 4) q('noise', 'sense', 0.85, ['it throw rock {W}', 'rock land {W}. why?', 'it throw. not at me'], 'heard+seen+stone', { W, ok });
      else if (s.seen && Math.hypot(n.x - s.x, n.z - s.z) > 10) q('noise', 'surprise', 0.85, ['noise there. it here', 'noise. but {N} here'], 'heard+seen-elsewhere', { ok });
      else if (Math.abs(s.flinchT - n.t) < 0.3) q('noise', 'feel', 0.92, ['jump! noise {W}?', 'made me jump', 'jump! what noise?', 'whoa! noise {W}'], 'heard+flinch', { W, ok });
      else if (n.kind === 'shout') q('noise', 'sense', 0.9, ['loud noise {W}', 'noise {W}!', 'what noise?', 'shout {W}'], 'heard', { W, ok });
      else if (n.kind === 'whistle') q('noise', 'sense', 0.9, n.hab > 0.5 ? ['high noise again', 'that high noise. again', 'high noise. nothing there'] : ['high noise {W}', 'thin noise {W}', 'what high noise?', 'strange call {W}'], 'heard', { W, ok });
      else if (n.kind === 'step' && n.splash) q('noise', 'sense', 0.88, ['splash {W}', 'water noise {W}', 'something in water'], 'heard', { W, ok });
      else if (n.kind === 'step') q('noise', 'sense', 0.88, n.fast ? ['hear feet run {W}', 'running feet {W}', 'fast feet {W}'] : ['feet {W}', 'step noise {W}', 'hear feet {W}'], n.fast ? 'heard+fast' : 'heard', { W, ok });
      else if (n.kind === 'stone') q('noise', 'sense', 0.88, s.decoys >= 2 ? ['rock noise. again'] : ['click {W}', 'rock noise {W}', 'something drop {W}'], 'heard', { W, ok });
      else q('noise', 'sense', 0.85, ['thump {W}', 'noise {W}', 'what is that noise?'], 'heard', { W, ok });
    }
    if (!s.seen && s.stepT > p.stepT && s.stepFast && !p.stepFast) q('hearRun', 'sense', 0.85, ['hear it run {W}', 'feet run {W}', 'running feet {W}', 'hear run {W}?'], 'heard+fast', { W: this._where(m.mem.steps.x, m.mem.steps.z, { landmark: false }), ok: (z) => z.t - z.stepT < 3, cool: 12 });
    if (s.killedT > p.killedT) q('kill', 'body', 1, m.killEat ? ['got it. meat now', 'it dead. eat', 'small thing meat now'] : m.wrongs.stones > 0 ? ['it stop now', 'no more rock', 'it not move now'] : ['it not move now', 'it stop. dead', 'small thing stop'], 'kill', { cool: 5, ttl: 5, ok: (z) => z.t - z.killedT < 5.5 });      // (said while it is fresh, or not at all: noticed late after a quiet strike it had outlived its condition)
    if (s.thunderT > p.thunderT) q('thunder', 'world', 0.5, ['sky noise', 'sky growl', 'sky make noise', 'sky angry'], 'thunder', { cool: 25, ok: (z) => z.t - z.thunderT < 4 });
    // ---- more of what you do, seen: following it, not looking at it, backing off, walking off, meat on your hands, playing with the light
    if (s.seen && p.seen && s.state === 'free') {
      const dtk = s.t - p.t, a = K.target, dx = s.x - sim.x, dz = s.z - sim.z, dd = Math.hypot(dx, dz) || 1, radial = a ? ((a.vx || 0) * dx + (a.vz || 0) * dz) / dd : 0;
      const behind = Math.abs(wrap(bearing(dx, dz) - sim.psi)) > 1.9, eye = s.via === 'sight' && !s.encl;
      mo.followT = s.speed > 0.6 && s.rv > 0.5 && behind && s.d < 30 ? mo.followT + dtk : Math.max(0, mo.followT - 2 * dtk);
      if (mo.followT > 6) { mo.followT = 0; q('follow', 'sense', 0.7, ['it follow me', '{N} behind me', 'why it follow?', 'it walk after me'], 'seen+follow', { ok: (z) => z.seen, cool: 45 }); }
      mo.unwT = eye && !s.watched && s.d < 30 ? mo.unwT + dtk : Math.min(mo.unwT, 0) + (mo.unwT < 0 ? dtk : 0);
      if (mo.unwT > 12) { mo.unwT = -30; q('unwatched', 'sense', 0.6, ['it not look at me', '{N} look away', 'it not see me?'], 'seen+unwatched', { ok: (z) => z.seen && !z.watched, cool: 60 }); }
      mo.backT = eye && radial > 0.6 && s.watched && !s.running ? mo.backT + dtk : Math.min(mo.backT, 0) + (mo.backT < 0 ? dtk : 0);
      if (mo.backT > 1.5) { mo.backT = -10; q('retreat', 'sense', 0.7, ['it back away', '{N} step back', 'it go back. slow'], 'seen+retreat', { ok: (z) => z.seen, cool: 25 }); }
      mo.awayT = eye && radial > 1 && !s.watched && !s.running && s.d > 12 ? mo.awayT + dtk : Math.min(mo.awayT, 0) + (mo.awayT < 0 ? dtk : 0);
      if (mo.awayT > 4) { mo.awayT = -25; q('leaving', 'sense', 0.6, ['it walk away', '{N} go away', 'it leave?'], 'seen+leaving', { ok: (z) => z.seen, cool: 40 }); }
      if (s.meaty > 0.3 && p.meaty <= 0.3 && s.d < 25) q('meaty', 'sense', 0.75, ['it smell like meat', 'meat smell on it', '{N} smell meat'], 'seen+meaty', { ok: (z) => z.meaty > 0.25, cool: 40 });
      if (s.torch && !p.torch) { mo.torchT.push(t); mo.torchT = mo.torchT.filter((x) => t - x < 14); }
      if (p.torch && !s.torch && eye) { const blink = mo.torchT.filter((x) => t - x < 14).length >= 2; q('torchOff', 'sense', 0.7, blink ? ['light on. light off', 'it play with light', 'light come. light gone'] : ['light gone', 'where light go?', 'it put light out'], blink ? 'seen+blink' : 'seen+torchoff', { ok: (z) => z.seen && !z.torch, cool: 6 }); }
    }
    // ---- its own body in the place
    if (s.wade > 0.45 && p.wade <= 0.45) q('wade', 'body', 0.5, ['water. go slow', 'deep water here', 'wet legs. slow'], 'self:wade', { ok: (z) => z.wade > 0.3, cool: 40 });
    if (s.calm && !p.calm && !s.seen) q('calm', 'world', 0.4, ['no wind here', 'air still here', 'wind gone here'], 'self:calm', { ok: (z) => z.calm, cool: 60 });
    // its body not getting anywhere (mind._unstick): backing out, and giving the errand up
    // a steady noise it has stopped caring about (mind: mem.steady)
    if (s.hushT > (p.hushT ?? -99)) q('hush', 'feel', 0.75, ['that noise again', 'just that noise', 'noise. nothing there'], 'hush', { cool: 30 });
    if (s.crashT > (p.crashT ?? -99) && m.mem.crash) q('crash', 'body', m.mem.crash.hard ? 0.82 : 0.6, m.mem.crash.hard ? ['oof! hit hard', 'bang. hard thing', 'ran into hard thing'] : ['bump. side hit', 'hit something', 'hard. go round'], 'crash', { ok: (z) => z.t - z.crashT < 3, cool: 20 });
    // (its head met the wall round a gap it was bringing it into on purpose: the reach, not a knock; the owner did not want "something hard" there)
    else if (s.bumpT > (p.bumpT ?? -99) && s.bumpReach) q('reachBump', 'body', 0.7, ['tight. push more', 'head not fit'], 'bump+reach', { ok: (z) => z.t - z.bumpT < 3 && z.beh === 'besiege', cool: 25 });
    else if (s.bumpT > (p.bumpT ?? -99)) q('bump', 'body', 0.7, m.mem.bump && m.mem.bump.hard ? ['bump! hard', 'hit hard thing', 'ow. hard there'] : ['bump head. ow', 'hard. go round'], 'bump', { ok: (z) => z.t - z.bumpT < 3, cool: 25 });
    // you in a building it is working its head into (mind: besiege, fev): its attention on you, not on the walls
    if (s.fIn > (p.fIn ?? -99)) q('focusIn', 'belief', 0.86, s.scent > 0.05 ? ['smell it. in box', '{N} in there. know it'] : ['{N} in there. know it'], 'hutIn', { ok: (z) => z.beh === 'besiege', cool: 40, ttl: 4 });
    if (s.fMoved > (p.fMoved ?? -99)) q('focusMoved', 'belief', 0.86, ['it move. other side', '{N} go away from hole'], 'hutMoved', { ok: (z) => z.beh === 'besiege', cool: 12 });
    if (s.fShort > (p.fShort ?? -99)) q('focusShort', 'feel', 0.82, ['head in. not reach', 'hole small. it close. grr'], 'hutShort', { ok: (z) => z.beh === 'besiege', cool: 15 });
    if (s.fOther > (p.fOther ?? -99)) q('focusOther', 'belief', 0.8, s.fOtherK === 'switch' ? ['other hole. go round'] : s.fOtherK === 'watch' ? ['it go out sometime. wait by hole', 'two hole. watch one'] : ['it go out sometime. wait by hole'], 'hutOther', { ok: (z) => z.beh === 'besiege', cool: 12, ttl: 4 });
    if (s.fQuiet > (p.fQuiet ?? -99)) q('focusQuiet', 'belief', 0.72, s.scent > 0.05 ? ['it quiet. still in there', 'not see. smell still'] : ['it quiet. still in there'], 'hutQuiet', { ok: (z) => !z.seen && z.beh === 'besiege', cool: 20 });
    if (s.gaveT > (p.gaveT ?? -99)) q('gaveup', 'feel', 0.85, ['can not get through', 'no way through', 'too tight. give up'], 'gaveup', { cool: 10 });
    else if (s.stuckT > (p.stuckT ?? -99)) q('stuck', 'body', 0.8, ['stuck. back out', 'too tight here', 'no room. back up'], 'stuck', { cool: 10 });
    if (s.noReachT > p.noReachT) q('noreach', 'feel', 0.85, ['can not get in', 'too tight. no way', 'meat in there. can not'], 'noreach', { cool: 10 });
    // ---- smell
    if (s.scent > 0.08 && p.scent <= 0.08 && !s.seen) q('scent', 'sense', 0.8, s.enc > 0 ? ['smell {N}', 'smell {N} on wind', 'smell it. near', 'smell it {W}'] : ['strange smell', 'smell something', 'new smell on wind'], 'scent', { W: this._where(m.sim.x + Math.sin(m.scentDir) * 20, m.sim.z + Math.cos(m.scentDir) * 20, { landmark: false }), ok: (z) => z.scent > 0.05, cool: 20 });
    // ---- things that are not you
    if (s.focusId && s.focusId !== p.focusId && m.focus) {
      const F = m.focus, k = F.kind;
      const gift = k === 'meat' && F.by === 'you' && F.see > 0.2 && (s.seen || t - s.lastSeenT < 6);
      if (gift) { mo.gave++; q('focus', 'world', 0.8, mo.gave >= 2 ? ['it bring meat again', 'more meat from it', 'meat come with it'] : ['meat! from it?', 'it drop meat', 'it throw meat. why?', 'meat fall by it'], 'focus:food', { ok: (z) => !!z.focusId, cool: 15 }); }
      else if (k === 'meat' || k === 'carcass') q('focus', 'world', 0.75, F.see > 0.2 || !(F.smell > 0.02) ? ['meat there', 'meat there!', 'food there'] : ['smell meat', 'meat smell. wind', 'smell meat somewhere'], 'focus:food', { ok: (z) => !!z.focusId, cool: 15 });
      else if (k === 'flare' && !(F.mem && F.mem.nov !== undefined && F.mem.nov <= 0.75)) q('focus', 'world', 0.8, F.mem && F.mem.hab > 0.5 ? ['bright thing again', 'that bright thing'] : ['bright thing!', 'what bright thing?', 'light on ground'], 'focus:flare', { ok: (z) => !!z.focusId, cool: 15 });      // (a kind it knows: the orienting thought below says so)
    }
    if (s.preyId && s.preyId !== p.preyId) q('prey', 'world', 0.6, m.hunger > 0.6 ? ['meat animals!', 'food walk there', 'meat animals. hungry'] : ['meat animals', 'meat animals there'], 'prey', { ok: (z) => !!z.preyId, cool: 30 });
    if (s.stoneId && s.stoneId !== p.stoneId) q('stoneFly', 'sense', 0.8, ['rock fly', 'something fly', 'see rock fly'], 'stone', { cool: 6 });
    // ---- done to it
    if (s.hitAt > p.hitAt) {
      const H = m.lastHit, rock = H && H.kind === 'stone';
      const again = m.wrongs.stones >= 2 && H.by === 'you';
      const pw = H && { head: 'head', neck: 'neck', leg: 'leg', thigh: 'leg', tail: 'tail', flank: 'side' }[H.part];
      // where it hurts, when it is a rock and the place is known: the words for that spot first, the plain ones still in the mix
      const gen = again ? ['ow! again', 'more rock!', 'rock again!', 'again! hurt', 'stop rock!', 'ow! not again', 'ow! that rock', 'rock hurt. again', 'sting! rock'] : rock ? ['ow! rock', 'ow! hurt', 'rock hit me', 'ow! hit me'] : ['ow! hurt', 'something hit me'];
      const spot = pw && rock ? (again ? ['ow! ' + pw + ' again', 'rock again! my ' + pw, pw + ' hurt! again'] : ['ow! my ' + pw, 'rock hit ' + pw, pw + ' hurt! rock', 'ow! sting ' + pw]).filter((x) => t - (this.used.get(x) ?? -999) > 60) : [];
      q('hit', 'feel', 1, spot.length ? spot : gen, 'hit', { cool: 1.5, ok: (z) => z.t - z.hitAt < 2.5 });
      if (s.seen && H && H.by === 'you') q('hitWho', 'belief', 0.9, again ? ['{N} throw again!', 'it not stop', '{N} throw rock!', 'it do that!'] : ['{N} throw rock!', '{N} hit me', 'it do that!'], 'hit+seen', { cool: again ? 14 : 8, ok: (z) => z.t - z.hitAt < 4 });
      else if (!s.seen) q('hitWho', 'belief', 0.88, ['from where?', 'who throw?', 'rock from {D}', 'it hide. throw rock'], 'hit+unseen', { W: this._where(m.startle ? m.startle.x : s.sx, m.startle ? m.startle.z : s.sz, { landmark: false }), cool: 8, ok: (z) => z.t - z.hitAt < 4 && !z.seen });
    }
    if (s.glare > 0.5 && p.glare <= 0.5) q('glare', 'feel', 0.9, ['light in eye!', 'too bright!', 'eyes hurt', 'bright! hurt eyes'], 'glare', { cool: 10, ok: (z) => z.glare > 0.3 });
    if (s.wrongT > p.wrongT && s.wrongKind === 'food' && t - p.wrongT > 5) q('food', 'feel', 0.9, ['{N} at my meat!', 'my meat! go away', 'not your meat'], 'wrong:food', { cool: 10 });
    // ---- tricks it has learnt
    if (s.decoyT > p.decoyT) q('decoy', 'memory', 0.95, m.decoyHow === 'traced' ? ['rock come from there', 'saw rock fly. there', '{N} throw from there'] : ['rock noise. trick', 'not fall for rock', 'rock again. not go', 'trick. not go'], 'decoy', { cool: 6 });
    else if (s.decoys > p.decoys) q('learn', 'memory', 0.85, ['rock noise was trick', 'trick! not there', '{N} trick me'], 'learnt-decoy', { cool: 10 });
    else if (s.fooled > p.fooled + 0.05 && !s.seen && (mo.emptyT = [...mo.emptyT.filter((x) => t - x < 90), t]).length >= 2) q('empty', 'feel', 0.86, ['nothing again. grr', 'empty again! grr', 'not there again'], 'search-empty+again', { ok: (z) => !z.seen, cool: 8 });
    else if (s.fooled > p.fooled + 0.05 && !s.seen) q('empty', 'surprise', 0.85, ['not there', 'nothing there', 'empty there', 'gone from there'], 'search-empty', { ok: (z) => !z.seen, cool: 8 });
    // ---- what it sets out to do
    // the orienting reflex for a thing (mind._orientObj): the head went to it; what it makes of it, by how well it knows the kind
    if (s.orientT > (p.orientT ?? -99) && m.objOrient && m.objOrient.nov <= 0.75) {
      const O = m.objOrient, nm = O.bright ? 'bright thing' : O.smelly ? 'smell thing' : 'that thing';
      q('orient', 'sense', 0.8, O.nov > 0.35 ? [nm + ' again', 'that ' + nm + ' again', nm + '. again?'] : [nm + '. not matter', 'just ' + nm, nm + '. so what', 'that again. leave it'], 'orient:' + O.sig, { ok: (z) => z.t - z.orientT < 4, ttl: 3, cool: 4 });
    }
    // watched while it comes, its patience gone: how it comes now (mind._watchedApproach)
    if (s.waT > (p.waT ?? -99) && s.seen) {
      const T = { cover: ['behind that. closer', 'go where it not see', 'hide. then closer'], arc: ['other side. go', 'go round. closer', 'come from side'], open: m.beh && m.beh.wa && m.beh.wa.why === 'press' ? ['enough wait. go', 'not wait more', 'hungry. go to it'] : ['it see me. so what', 'it look. still go', 'not stop now'] }[s.waMode];
      if (T) q('waMode', 'intend', 0.86, T, 'wa:' + s.waMode, { ok: (z) => z.waMode === s.waMode, ttl: 4, cool: 3 });
    }
    if (s.gen !== p.gen && s.beh) this._intend(s, p);
    else if (s.beh && s.phase !== p.phase) this._phase(s, p);
    if (s.beh === 'chase' && s.cut && !p.cut) q('cut', 'memory', 0.92, s.cutS ? (mo.hid ? ['it run to ' + STRUCT[s.cutS] + ' again', 'get to ' + STRUCT[s.cutS] + ' first', 'know where it go'] : ['it go to ' + STRUCT[s.cutS], 'get to ' + STRUCT[s.cutS] + ' first']) : ['know where it go', 'get there first'], 'chase+cut', { ok: (z) => z.beh === 'chase' });
    if (s.beh === 'besiege' && s.memoWait && !p.memoWait) q('memoWait', 'memory', 0.92, ['it come out here before', 'wait here. it come out', 'this hole. it come here'], 'besiege+memo', { ok: (z) => z.beh === 'besiege', ttl: 5 });
    // ---- what it makes of you (appraise.js)
    this._appraisal(p, s);
    if (s.landed && !p.landed && s.gen === p.gen) q('landed', 'body', 0.85, ['it fall. good', 'hit it!', 'it go down'], 'landed', { cool: 3 });
    if (s.missed && !p.missed && s.gen === p.gen) { mo.missT = [...mo.missT.filter((x) => t - x < 90), t]; q('missed', mo.missT.length >= 2 ? 'feel' : 'body', 0.8, mo.missT.length >= 2 ? ['miss again! grr', 'miss. again. grr', 'it too quick. grr'] : ['missed it', 'miss! where?'], mo.missT.length >= 2 ? 'missed+again' : 'missed', { cool: 3 }); }
    // ---- what it feels, as the consequence of you: winded after running you down, breathless still watching, full, riled
    const RUSH = ['chase', 'pounce', 'prowl', 'hunt', 'bluff', 'test'];
    if (s.gen !== p.gen && RUSH.includes(p.beh) && s.fatigue > 0.5 && !(p.beh === 'pounce' && p.phase === 'lost')) q('spent', 'feel', 0.82, s.seen || t - s.lastSeenT < 5 ? (p.beh === 'hunt' ? ['legs heavy. stop', 'breath gone. stop'] : ['legs heavy. let it go', 'breath gone. it fast', 'too tired. it get away', 'legs heavy. it fast']) : ['legs heavy. stop', 'breath gone. stop', 'too tired now'], 'tired', { ok: (z) => z.fatigue > 0.4, cool: 30, ttl: 3 });
    if (s.seen && s.fatigue > 0.6 && s.rv < 1.5 && p.rv >= 1.5 && t - (this.keyT.get('spent') ?? -99) > 15 && !RUSH.includes(s.beh)) q('winded', 'feel', 0.55, ['breathe hard. watch it', 'puff puff. watch it', 'tired. still watch it'], 'seen+tired', { ok: (z) => z.seen && z.fatigue > 0.45, cool: 45, ttl: 4 });
    if (p.beh === 'feed' && s.beh !== 'feed' && s.hunger < 0.35) q('full', 'feel', 0.7, s.seen ? ['belly full. watch it', 'full now. watch it'] : ['belly full now', 'full. good meat', 'belly heavy. good'], 'fed', { ok: (z) => z.hunger < 0.4, cool: 120, ttl: 5 });
    if (s.seen && s.irritation > 0.55 && p.irritation <= 0.55 && Math.min(t - s.wrongT, t - s.hitAt) < 10) q('riled', 'feel', 0.7, ['{N} make me angry', 'grr. it annoy me', 'enough of it. grr'], 'seen+irritated+riled', { ok: (z) => z.seen && z.irritation > 0.45, cool: 60, ttl: 4 });
  }

  /** What it makes of you: a verdict reached or revised, and what it learnt from testing you. */
  _appraisal(p, s) {
    const m = this.m, q = this._q.bind(this), A = m.ap; if (!A) return;
    if (s.verdict !== p.verdict && p.t > 0 && s.forgotT <= p.forgotT) {
      const v = s.verdict, ok = (z) => z.verdict === v;
      const T = {
        food: A.flags.hungrier && A.prevVerdict === 'notfood' ? [['hungrier now. food', 'hungry. try again', 'now it food'], 'ap:food+hungrier'] : [['small thing. food', 'food. yes', 'it food', 'eat it. yes'], 'ap:food'],
        notfood: [['not food', 'not meat. leave it', 'no. not food', 'small thing not food'], 'ap:notfood'],
        threat: [['no more games', 'enough. it serious', 'not play now', 'it hurt me. no more'], 'ap:threat'],
        rival: [['it want fight?', 'it not back down', 'who bigger here?'], 'ap:rival'],
        nuisance: [['pest. go away', 'it bother me', 'small thing. always there'], 'ap:nuisance'],
        curious: [['not sure now', 'what is it then?'], 'ap:curious'],
      }[v];
      if (T) q('verdict', v === 'curious' ? 'belief' : 'feel', 0.93, T[0], T[1], { ok, cool: 4, ttl: 5 });
    }
    // the prey reflex (appraise.js arousal): what sets it off, that it has locked on, and that a thing gone from sight is waited for
    if (A.fixed && !this.fixSaid && s.seen) { this.fixSaid = true; q('fixed', 'feel', 0.9, ['small. quick. food', 'quick thing. want it', 'small thing. mine'], 'ap:fixed', { ok: () => A.fixed, ttl: 5, cool: 40 }); }
    if (!A.fixed) this.fixSaid = false;
    if (A.flags.quickNow && A.arousal > 0.2 && !A.fixed && s.seen) q('dart', 'sense', 0.75, ['{N} quick', 'it jump about', 'quick. small. there'], 'ap:quickNow', { ok: (z) => z.seen, cool: 10, ttl: 3 });
    if (A.flags.hidAroused && p.seen && !s.seen) q('hidWait', 'expect', 0.88, ['it hide. wait', 'there. it come out', 'wait. watch there'], 'ap:hidAroused', { ok: (z) => !z.seen, cool: 12, ttl: 4 });
    // the lead-up: the contest or the fear building before it settles into a verdict
    if (A.rivalry > 0.3 && !(this.rivalSaid) && s.verdict !== 'rival') { this.rivalSaid = true; q('leadRival', 'feel', 0.8, ['it not scared of me', 'it stare back', 'it stand up to me'], 'ap:rivalish', { ok: () => A.rivalry > 0.3, ttl: 6, cool: 60 }); }
    if (A.rivalry < 0.15) this.rivalSaid = false;
    if (A.fear > 0.3 && !this.fearSaid && s.verdict !== 'threat') { this.fearSaid = true; q('leadFear', 'feel', 0.8, ['that thing hurt me', 'it sting. hard', 'it aim at my head'], 'ap:afraid', { ok: () => A.fear > 0.3, ttl: 6, cool: 60 }); }
    if (A.fear < 0.15) this.fearSaid = false;
    if (s.apT > p.apT && A.last) {
      const k = A.last.kind, T = {
        'test-bolted': ['it run! like meat', 'run? chase it'], 'test-stood': ['it not run', 'it stand. strange'], 'test-came': ['it come at me?', 'it not scared'], 'test-froze': ['it freeze. like meat?', 'it go still'],
        'taste-spat': ['taste wrong. spit', 'bad taste. not meat', 'spit. not food'], 'taste-keep': ['taste good', 'meat. keep it'],
        slipped: ['it fight. hard', 'too much fight', 'slippery thing'], outran: ['too fast. stop', 'it fast. let go'],
        'bought-off': ['meat! better', 'it give meat', 'meat. not small thing'], 'driven-off': ['it come. leave meat'],
        'rival-backed': ['it back off. good', 'it small. it go'], 'rival-ran': ['it run. meat?', 'run away! chase?'], 'rival-held': ['it not back off', 'it stand. hmm'], 'rival-came': ['it come at me!', 'it not scared'],
        hurt: ['it bite back', 'meat that hurt?'], 'gave-up': A.last.why === 'hid' ? ['it hide. lost it'] : ['it see me. stop', 'it see me'],
      }[k];
      if (T) q('apo', 'memory', 0.9, T, 'apo:' + k, { cool: 3, ttl: 4 });
    }
    // (on the appraisal's own flag, which it reads on its decision tick, so the words and the fact agree)
    if (s.beh === 'seize' && s.sub === 'taste' && m.ap.flags.tasting && this.tasteGen !== s.gen) { this.tasteGen = s.gen; q('taste', 'body', 0.85, ['taste it', 'what taste?', 'chew. taste'], 'ap:tasting', { ok: (z) => z.beh === 'seize' && z.sub === 'taste' && !!m.ap.flags.tasting, ttl: 1.5, cool: 5 }); }
  }
  /** A new behaviour: what it means to do, with what it remembers when that is why. */
  _intend(s, p) {
    const m = this.m, q = this._q.bind(this), b = m.beh, n = s.beh, mot = b.motive;
    const on = (z) => z.gen === s.gen;
    const W = (x, z) => this._where(x, z);
    const T = {
      watch: ['watch {N}', 'see what it do', 'watch it'], stalk: ['creep closer', 'stay low. get close', 'get close. quiet'],
      circle: ['go round', 'see other side', 'walk round it'], inspect: ['go closer', 'want smell it', 'look closer'],
      display: ['make big', 'show teeth', 'big. it go away'], bluff: ['scare it', 'run at it!', 'make it run'],
      chase: ['catch it!', 'run! catch it', 'not get away'], snap: ['back off!', 'bite at it', 'too close! bite'],
      feign: ['look away. trick it', 'turn away. it follow?', 'not look. wait'], backoff: ['step back', 'too close', 'back up'],
      nudge: ['push it with nose', 'what it feel like?', 'poke with nose'], leave: ['go away from here', 'nothing more here', 'walk away'],
      roam: ['go walk', 'go somewhere', 'walk. look'], pause: ['just stand', 'stand. breathe', 'stop here'],
      listen: ['stop. listen', 'hear it again?', 'quiet. listen'], sniff: ['sniff air', 'smell something?', 'nose up. smell'],
      search: ['go look', 'find it', 'look {W}', 'go look {W}'], stare: ['stare there', 'it {L}?', 'look {W}. wait'],
      ambush: ['wait. it come out', 'stay still. wait', 'not move. it come'], revisit: ['go back there', 'it was there', 'look where it was'],
      besiege: ['get in', 'find hole. get in', 'get in ' + (STRUCT[s.encl || s.beliefIn] || 'there')], investigate: ['go see bright thing', 'look at bright thing'],
      trail: ['follow smell', 'meat smell. that way', 'nose to meat'], feed: ['eat it', 'meat! eat', 'eat now'], hunt: ['eat meat animal', 'creep to meat animals', 'catch meat animal'],
      answer: ['sky loud. me louder', 'roar at sky'],
      butt: b.lethal ? ['enough. end it', 'finish it'] : ['hit it with head', 'knock it down'], swipe: ['tail hit it', 'swing tail'], pin: ['step on it', 'hold it down'],
      seize: b.lethal ? ['end it now', 'bite. finish it', 'no more. end it'] : mot === 'prey' ? ['bite it. eat', 'eat small thing', 'grab it'] : ['bite it', 'grab it'], toy: ['poke it', 'nose it. play', 'it move?'],
      appraise: b.circle ? ['go round. slow', 'look all sides', 'how big? how slow?'] : ['stare at it', 'still. look long', 'look long. soft thing?'],
      test: ['jump at it. run?', 'make it run?', 'quick at it. see'], shadow: ['follow it. quiet', 'stay behind it', 'quiet. behind it'],
      lurk: ['wait where it come', 'it come here. wait', 'hide. wait for it'], prowl: ['hunt it', 'low. quiet. closer', 'eat it. creep'],
      avoid: ['fire! step back', 'hot. step back', 'fire. go round'],
      guard: b.mode === 'reclaim' ? ['my ground. take back', 'go back. my place', 'walk at it. slow'] : ['face it. stand', 'head up. watch', 'come closer. see', 'stand. not move'],
      pounce: ['it run! get it', 'running thing! get', 'run? catch it!', 'it run. go!'],
    }[n];
    if (!T) return;
    let texts = T, cond = 'beh:' + n, kind = ATTACKS.includes(n) || ['chase', 'bluff', 'snap', 'display', 'pounce'].includes(n) ? 'intend' : 'want', pri = kind === 'intend' ? 0.8 : 0.6, Wp = null;
    if (n === 'search' || n === 'stare') { const at = b.spot && b.spot.behind ? b.spot.behind : b.spot || b.at || { x: s.sx, z: s.sz }; Wp = W(at.x, at.z); }
    if (n === 'search' && b.memo) { texts = ['look where it hide before', 'same hiding place?', 'it hide there before', 'it like hide there']; cond = 'beh:search+memo'; kind = 'memory'; pri = 0.85; }
    if (n === 'search' && b.traced) { texts = ['go where rock come from', 'thrower there. go']; cond = 'beh:search+traced'; kind = 'memory'; pri = 0.85; }
    if (n === 'search' && b.fromSound && !b.traced && !b.memo) { texts = ['see what make noise', 'noise there. go look', 'find noise thing']; cond = 'beh:search+sound'; }
    if (n === 'revisit' && b.memo) { texts = ['go see hiding place', 'it hide there before', 'look at old hiding place']; cond = 'beh:revisit+memo'; kind = 'memory'; pri = 0.8; }
    if (n === 'ambush' || n === 'stare') { if (b.decoy) return; }
    if (n === 'besiege' && (s.up || (!s.encl && s.beliefIn && this._raised(s.beliefIn)))) texts = ['get it down', 'reach it. how?', 'go under ' + STRUCT[s.encl || s.beliefIn]];
    if (ATTACKS.includes(n) && mot === 'anger' && m.wrongs.stones > 0) texts = [...texts, 'make it stop throw', 'no more rock'];
    if (n === 'chase' && this.model.ran >= 2) texts = [...texts, 'it always run'];
    if (n === 'display' && b.rival) { texts = ['show big. it go?', 'who bigger?', 'make big. it go?']; cond = 'beh:display+rival'; }
    if (n === 'bluff' && b.rival) { texts = ['run at it. it go?', 'charge. it back off?']; cond = 'beh:bluff+rival'; }
    // starting the same thing over and over is not news: each restart of a behaviour is voiced less often (doubling)
    const IR = this.intRep || (this.intRep = new Map()), ir = IR.get(n) || { n: 0, t: -999 };
    if (s.t - ir.t > 150) ir.n = 0;
    if (kind !== 'intend' && ir.n > 0 && s.t - ir.t < 15 * 2 ** (ir.n - 1)) return;
    IR.set(n, { n: ir.n + 1, t: s.t });
    q('beh', kind, pri, texts, cond, { W: Wp, ok: on, ttl: 2.5, cool: 0 });
  }
  /** A step within what it is doing. */
  _phase(s, p) {
    const q = this._q.bind(this), n = s.beh, ph = s.phase, on = (z) => z.gen === s.gen && z.phase === ph;
    let T = null; const up = s.up || (!s.encl && !!s.beliefIn && this._raised(s.beliefIn));
    if (n === 'besiege' && up && ph === 'probe') T = ['reach up', 'neck up. stretch', 'snap up at it', 'nose to its feet'];
    else if (n === 'besiege' && up && ph === 'wait') T = ['wait under ' + STRUCT[s.encl || s.beliefIn], 'it must come down', 'look up. wait'];
    else if (n === 'bluff' && ph === 'end') T = ['stop. stare it down', 'it run now?', 'stop here. stare'];
    else if (n === 'feign' && ph === 'wait') T = ['listen behind', 'it come?', 'wait. it follow?'];
    else if (n === 'feign' && ph === 'turn') T = ['turn back!', 'look now!'];
    else if (n === 'besiege' && ph === 'probe') {
      // the same move again is not news: each sub-move is voiced less and less often (cool-down doubling), and what is said
      // comes from what is actually different this time (another way in, nothing found again, frustration building)
      const b = this.m.beh, rk = 'probe:' + (s.sub || 'shove'), R0 = this.rep || (this.rep = new Map()), e = R0.get(rk) || { n: 0, t: -999, k: -1 };
      if (s.t - e.t > 120) e.n = 0;
      const newHole = b && b.si !== e.k, wait = 10 * 2 ** e.n;
      if (s.t - e.t < wait && !newHole) T = null;
      else {
        const tried = b ? b.tried || 0 : 0;
        T = tried >= 4 ? ['nothing. grr', 'no way in. grr', 'still nothing', 'try other side'] : newHole && e.k >= 0 ? ['try other way', 'this side now', 'other gap. try'] :
          // (what it wants or makes out there, not the body's own act: "head in hole" said what its neck did, and wore thin)
          { shove: ['it in there. get it', 'so close. in there', 'want it out', 'get small thing out', 'it in there. reach'], peer: ['see in there?', 'where in there?', 'dark in there', 'it in dark?'], snort: ['it in there. close', 'air from in there', 'it breathe in there?'], snap: ['bite at it!', 'almost. bite', 'get it. bite'], still: ['quiet. it move?', 'it still in there?', 'hear it in there?'] }[s.sub] || ['it in there. get it', 'want it out', 'so close. in there'];
        R0.set(rk, { n: e.n + 1, t: s.t, k: b ? b.si : -1 });
      }
    }
    else if (n === 'besiege' && ph === 'wait') T = ['it must come out', 'wait. it come out', 'it come out soon', 'it out. then get it', 'quiet. it come out'];
    else if (n === 'investigate') T = { look: ['stare at bright thing', 'what is bright?'], sniff: ['sniff bright thing', 'nose to bright thing'], recoil: ['too hot!', 'hot! back'], stomp: ['stamp on it', 'stamp it out'] }[ph];
    else if (n === 'feed' && ph !== 'go' && p.phase === 'go') T = ['meat. mine', 'eat. good meat'];
    else if (n === 'nudge' && ph === 'after') T = ['it not run?', 'what it do now?', 'push it. it stay'];
    else if (ATTACKS.includes(n) && ph === 'strike') T = n === 'swipe' ? ['tail now!'] : n === 'seize' ? ['bite now!', 'grab it!'] : ['now! go', 'hit it!'];
    else if (n === 'hunt' && ph === 'rush') T = ['run! catch it', 'now! run'];
    else if (n === 'prowl' && ph === 'rush') T = ['now! go', 'now! run fast'];
    else if (n === 'test' && ph === 'watch') T = ['stop. it run?', 'watch it now'];
    else if (n === 'pounce' && ph === 'rush') T = ['go! go!', 'now! get it', 'fast! catch it'];
    else if (n === 'pounce' && ph === 'defused') T = ['it stop. why?', 'it stop. hmm', 'it stop running'];
    else if (n === 'pounce' && ph === 'lost' && (this.m.beh.why === 'spent' || s.fatigue > 0.6)) T = ['legs gone. stop', 'breath gone. it fast', 'too tired. stop'];
    else if (n === 'pounce' && ph === 'lost') T = ['it gone. stop', 'lost it. stop', 'can not get it'];
    else if (n === 'lurk' && ph === 'wait') T = ['wait. quiet', 'stay here. not move'];
    const lost = n === 'pounce' && ph === 'lost';
    if (T) q('phase', n === 'besiege' || n === 'investigate' ? 'do' : lost && s.fatigue > 0.6 ? 'feel' : 'intend', lost ? 0.86 : 0.7, T, 'phase:' + n + '/' + ph, { ok: on, ttl: 2.5, cool: 0 });
  }

  /** When nothing new happens: now and then, a standing fact, chosen among those that are true now. */
  /** The core's thoughts (out/platform/CORE.md), each on an appraisal flag (test/thoughts.mjs checks `ap:<flag>`): it has
   *  filed you as food and is in no hurry; you did something new, or the same again; what it means to ask, and what your
   *  answer was; an answer it did not expect; what it was ready for; the reach; what stopped it; the opening a look away gives. */
  _coreEvents(s) {
    // (only while its attention is on that thing: what it thinks of you while it eats is not said as if you were its focus)
    const m = this.m, A = m.ap; if (!A || !A.flags || !s.seen || (m.att && m.att.focusKey() !== 'you')) { this.cprev = A && A.flags ? { ...A.flags } : {}; return; }
    const f = A.flags, p = this.cprev || {}, q = this._q.bind(this), up = (k) => f[k] && !p[k];
    if (up('claimed')) q('claim', 'belief', 0.8, ['small thing. food', 'food. no hurry', 'it food. mine', 'mine. go slow', 'food there. easy'], 'ap:claimed', { ok: (z) => z.seen, cool: 60, ttl: 6 });
    if (up('novelNow')) q('novel', 'surprise', 0.85, ['new thing! what?', 'never see that', 'it do new thing', 'what that?'], 'ap:novelNow', { cool: 6, ttl: 4 });
    if (up('sameNow')) q('same', 'memory', 0.7, ['that again', 'seen that', 'same thing again', 'it do that again'], 'ap:sameNow', { cool: 15, ttl: 4 });
    if (up('curHigh') && f.probing) q('curHigh', 'feel', 0.55, ['strange food', 'what this food?', 'food do strange things', 'want look more'], 'ap:curHigh+probing', { cool: 40, ttl: 5 });
    if (up('curLow') && f.food) q('curLow', 'feel', 0.6, ['nothing new now', 'it do nothing new', 'look enough. food'], 'ap:curLow+food', { cool: 45, ttl: 5 });
    if (up('asking')) q('ask', 'intend', 0.7, ['push it. see', 'what it do now?', 'try it', 'push small thing'], 'ap:asking', { cool: 10, ttl: 3 });
    if (up('ansStill')) q('ansStill', 'belief', 0.75, ['it not run', 'it stay. strange', 'not move. why?'], 'ap:ansStill', { cool: 12, ttl: 4 });
    if (up('ansCame')) q('ansCame', 'surprise', 0.85, ['it come at me!', 'small thing push back', 'it not afraid'], 'ap:ansCame', { cool: 12, ttl: 4 });
    if (up('ansBacked')) q('ansBacked', 'sense', 0.7, ['it go back', 'it go. follow', 'it back away. follow'], 'ap:ansBacked', { cool: 12, ttl: 4 });
    if (up('surprised')) q('surprise', 'surprise', 0.9, ['not same! why?', 'it do other thing', 'not like before'], 'ap:surprised', { cool: 8, ttl: 4 });
    if (up('expected')) q('expected', 'expect', 0.65, ['same as before', 'knew it', 'always do that'], 'ap:expected', { cool: 20, ttl: 4 });
    if (up('ready')) q('ready', 'expect', 0.9, ['it try that again?', 'ready this time', 'not stop me now'], 'ap:ready', { cool: 20, ttl: 3 });
    if (up('reaching')) q('reach', 'intend', 0.95, ['eat now', 'take it now', 'bite. slow', 'open jaws now'], 'ap:reaching', { cool: 6, ttl: 3 });
    if (up('balked')) {
      const k = A.balkKind, T = { light: ['bright! stop', 'eyes hurt. stop'], fire: ['fire! back', 'hot thing. no'], loud: ['loud! stop', 'too loud'], cover: ['can not get it', 'it in there. no'], back: ['it go away. stop', 'too far now'] }[k] || ['stop. not now'];
      q('balk', 'feel', 0.95, T, 'ap:balked', { cool: 4, ttl: 4 });
    }
    if (up('pressed')) q('pressed', 'expect', 0.95, ['not again!', 'knew that. no', 'that not stop me'], 'ap:pressed', { cool: 8, ttl: 3 });
    if (up('unwGo')) q('unwGo', 'intend', 0.75, ['it look away. go', 'not look. closer', 'go now. quiet'], 'ap:unwGo', { cool: 25, ttl: 3 });
    if (up('peckish') && f.food) q('peckish', 'feel', 0.6, ['belly empty', 'hungry more now', 'want eat'], 'ap:peckish', { cool: 90, ttl: 6 });
    this.cprev = { ...f };
  }
  _muse(s) {
    const m = this.m, M = m.mood, R = this.R, busy = this._busy(s), t = s.t;
    if (this.queue.length || t - this.lastEmit < (busy ? 2.6 + 1.5 * R() : 9 + 9 * R()) || t - this.lastMuse < 1 || m._handling()) return;
    this.lastMuse = t;
    const F = [], add = (k, w, texts, cond, o = {}) => { if (t - (this.keyT.get('muse:' + k) ?? -999) > (busy ? 14 : 30)) F.push({ k, w, texts, cond, o }); };
    const c = m.ctx || {}, Mo = s.seen ? m._motives(c) : { anger: 0, prey: 0, play: 0 };
    // where it believes you are, and how sure
    if (!s.seen && s.lastSeenT > -999 && t - s.lastSeenT < 150) {
      const W = s.beliefIn ? INSIDE[s.beliefIn] : this._where(s.sx, s.sz);
      if (s.cert > 0.5) add('belief', 2, ['{N} {L}', 'it {L}. know it', 'still {W}', '{N} still {W}'], 'belief:sure', { W, ok: (z) => !z.seen && z.cert > 0.4 });
      else if (s.cert > 0.22) add('belief', 2, ['maybe {W}', '{W}? maybe', 'it near. somewhere', '{N} {L}?'], 'belief:maybe', { W, ok: (z) => !z.seen && z.cert > 0.15 });
      else add('belief', 1.5, ['where it go?', 'lost it', 'where now?', 'not know where', 'where is {N}?'], 'belief:lost', { ok: (z) => !z.seen && z.cert < 0.3 });
      if (m.beh && m.beh.name === 'ambush') add('expect', 1.5, ['it come out soon', 'wait. it move soon', 'it think I gone'], 'beh:ambush', { ok: (z) => z.beh === 'ambush' });
      if (t - s.noiseT > 10 && ['ambush', 'stare', 'listen', 'besiege'].includes(s.beh)) add('silent', 1, ['hear nothing', 'no sound now', 'all quiet. where?', 'it very quiet'], 'silent', { ok: (z) => !z.seen && z.t - z.noiseT > 8 });
      if (m.beh && m.beh.name === 'besiege') add('expect', 1.5, ['it still in there', 'it come out soon', 'wait. it must come'], 'beh:besiege', { ok: (z) => z.beh === 'besiege' });
    }
    if (s.seen) {
      const W = s.encl ? INSIDE[s.encl] : null;
      if (s.via === 'near') add('near', 2, ['it close. not see', 'smell it. close', 'it here. somewhere', 'hear it close'], 'near', { ok: (z) => z.seen && z.via === 'near' });
      else if (s.via === 'memory') add('near', 1, ['it just there', 'where it go?'], 'seen', { ok: (z) => z.seen });
      else if (W) add('where', 1.5, ['{N} ' + W, 'it still ' + W, 'it hide ' + W], 'seen+inside', { ok: (z) => z.seen && !!z.encl });
      else {
        const Wh = this._where(s.x, s.z), far = s.d > 40, near = s.d < 12;
        add('where', 1, [...(far ? ['{N} far away', 'it far. watch'] : near ? ['{N} right here', 'it close'] : ['see {N} {W}', '{N} {L}']), 'it still there'], 'seen', { W: Wh, ok: (z) => z.seen });
        if (s.crouch) add('doing', 1, ['{N} stay low', 'it low. still see'], 'seen+crouch', { ok: (z) => z.seen && z.crouch });
        else if (s.speed < 0.3) add('doing', 1, ['{N} not move', 'it just stand', 'it stand. watch me'], 'seen+still', { ok: (z) => z.seen && z.speed < 0.5 });
        else if (!s.running) add('doing', 1, ['{N} walk', 'it go somewhere', 'where it go?'], 'seen+walking', { ok: (z) => z.seen && z.speed > 0.3 });
      }
      const weighing = m.ap && (m.ap.flags.weighing || m.stance === 'predatory');      // a predator weighing you up is not idly curious
      if (M.interest > 0.3 && !weighing) add('curious', 1.5, ['what is it?', 'what it do?', 'strange {N}', 'want see more', 'what it want?'], 'seen+curious', { ok: (z) => z.seen });
      if (s.d < 16 && (M.arousal > 0.45 || s.approach > 0.3)) add('wary', 1.5, ['too close', 'careful now', 'watch it close', 'close. careful'], 'seen+close', { ok: (z) => z.seen && z.d < 20 });
      if (m.grudge > 0.3) {
        const W = m.wrongs, g = ['bad {N}', 'that thing bad'];
        if (W.stones > 0) g.push('it hurt me', 'not forget rock', 'rock thrower');
        if (W.glare > 1) g.push('light hurt eyes', 'not forget light');
        if (W.food > 0.5) g.push('it want my meat', 'it come for my meat');
        add('grudge', 1.5, g, 'seen+grudge', { ok: (z) => z.seen });
      }
      if (m.wrongs.stones > 0 && m.grudge > 0.15) add('expectRock', 1, ['it throw rock again?', 'watch for rock'], 'seen+stones', { ok: (z) => z.seen });
      if (Mo.anger > 0.3) add('anger', 1.5, ['make it stop', 'hit it', 'it go away. now'], 'motive:anger', { ok: (z) => z.seen });
      if (Mo.prey > 0.2) add('prey', 1.5, ['{N} meat?', 'eat {N}?', 'small thing. food?'], 'motive:prey', { ok: (z) => z.seen });
      if (Mo.play > 0.25) add('play', 1, ['poke it?', 'push it over?', 'it play?'], 'motive:play', { ok: (z) => z.seen });
      if ((m.closeTime || 0) > 30 && m.grudge < 0.1 && M.irritation < 0.3 && !weighing) add('calm', 1, ['{N} just stand', 'it not do anything', 'it not scared?', 'it stay. why?'], 'seen+calm', { ok: (z) => z.seen });
      if (this.model.ran >= 2 && s.d < 35 && !s.running) add('expectRun', 1, ['it run soon?', 'it run again?'], 'seen+ran', { ok: (z) => z.seen });
      if (this._sneaky() && s.d > 12) add('expectHide', 1, ['it hide soon', 'watch it. sneaky'], 'seen+sneaky', { ok: (z) => z.seen });
      if (M.interest < 0.3 && ['roam', 'pause', 'leave', 'sniff'].includes(s.beh)) add('ignore', 1, ['leave it', 'let it stand', 'it not matter', 'small thing. so what', 'it not come'], 'seen+dull', { ok: (z) => z.seen });
      if (M.irritation > 0.35) add('irritated', 1.2, ['{N} bother me', 'go away', 'grr. go'], 'irritated', { ok: (z) => z.seen });
    }
    // the predator's question, voiced as what it notices about you
    const A = m.ap && m.ap.flags;
    if (A && s.seen && A.weighing && !m._handling()) {
      const pos = [['run', 'it run'], ['down', 'it not move'], ['meat', 'it smell meat'], ['back', 'it show back'], ['cornered', 'no way out'], ['low', 'it low'], ['alone', 'it alone'], ['open', 'it in open'], ['slow', 'it slow'], ['small', 'it small']].filter(([k]) => A[k]);
      const neg = [['bites', 'it bite back'], ['tasteBad', 'it taste bad'], ['slipped', 'it fight hard'], ['stood', 'it not run'], ['herd', 'easier meat there']].filter(([k]) => A[k]);
      const tail = A.food || A.hunt ? ['it food', 'eat it'] : A.notfood ? ['not food'] : ['meat?', 'food?'];
      const texts = [], used = new Set();
      for (let v = 0; v < 3; v++) {
        let parts;
        if (neg.length && !A.food && v === 2) { const n = neg[Math.floor(R() * neg.length)]; parts = [n]; }
        else { const sh = pos.slice(); for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; } parts = sh.slice(0, 1); }
        parts.forEach(([k]) => used.add(k)); texts.push([...parts.map(([, w]) => w), tail[v % tail.length]].join('. '));
      }
      const vk = A.food ? '+food' : A.hunt ? '+hunt' : A.notfood ? '+notfood' : '';
      add('appraise', 3, texts, 'ap:weighing+' + [...used].join('+') + vk, { ok: () => m.ap.flags.weighing && m.know.seen });
    }
    if (s.seen && ['down', 'pinned'].includes(s.state) && s.still > 3) add('lieStill', 1.5, ['{N} lie still', 'it lie there', 'small thing not get up'], 'limp', { ok: (z) => z.still > 2 });
    if (A && s.seen && A.hurt && s.state === 'free') add('hurtYou', 2, ['{N} limp', 'it slow now. hurt', 'it hurt. slow'], 'ap:hurt', { ok: () => m.ap.flags.hurt });
    if (A && s.seen && A.blood) add('blood', 2, ['smell blood', 'blood smell. it', 'it bleed'], 'ap:blood', { ok: () => m.ap.flags.blood });
    if (A && s.seen && A.why) {
      const W = { herd: ['hungry. meat animals easier', 'belly empty. not it', 'eat meat animal. not it'], meat: ['hungry. meat there better', 'eat meat first'], notfood: ['hungry. but it taste bad', 'not that. bad taste'], afraid: ['hungry. but it hurt', 'hungry. first end it'], angry: ['hungry. but it bother me', 'first make it stop', 'it annoy more than hungry'], rival: ['hungry. but it stand up', 'it fight. not food'], fun: ['hungry. but it funny', 'eat later. watch it', 'it more fun than food', 'belly empty. it strange'] }[A.why];
      if (W) add('why', 2.2, W, 'why:' + A.why, { ok: () => m.ap.flags.why === A.why });
    }
    if (A && s.seen && A.threat) add('threatM', 1.5, ['watch it. always', 'my ground. stay', 'come close. see', 'eyes on it', 'not turn my back'], 'ap:threat', { ok: () => m.ap.flags.threat });
    if (A && s.seen && A.rival) add('rivalM', 1.5, ['it stand there. hmm', 'it not go', 'it think it big?'], 'ap:rival', { ok: () => m.ap.flags.rival });
    if (m.beh && m.beh.name === 'prowl') { if (s.seen && s.watched) add('prowlM', 2, ['it see me. go slow', 'stay low. it look', 'it watch. still go'], 'beh:prowl+watched', { ok: (z) => z.beh === 'prowl' && z.watched }); else add('prowlM', 2, ['quiet. go closer', 'stay low. go closer', ...(s.seen ? ['it not see me. closer'] : [])], s.seen ? 'beh:prowl+unwatched' : 'beh:prowl', { ok: (z) => z.beh === 'prowl' && !(z.seen && z.watched) }); }
    if (m.hunger > 0.7 && !(m.beh && m.beh.name === 'feed')) add('hunger', 1, ['so hungry', 'belly empty', 'want meat'], 'hunger', { ok: () => m.hunger > 0.65 });
    // ---- you, seen: up the tower, carrying a light, smelling of meat
    if (s.seen && s.up) add('tall', 2, ['{N} up ' + STRUCT[s.encl], 'it up. can not reach', 'come down!', ...(s.watched ? ['it look down at me'] : [])], 'seen+uptower', { ok: (z) => z.seen && z.up });
    if (s.seen && s.torch && s.via === 'sight') add('torchM', 0.8, ['it carry light', 'light go where it go', 'light move with it'], 'seen+torch', { ok: (z) => z.seen && z.torch });
    if (s.seen && s.meaty > 0.3 && s.d < 25) add('meatyM', 1, ['it smell like meat', 'meat smell. on it'], 'seen+meaty', { ok: (z) => z.meaty > 0.25 });
    if (s.fatigue > 0.6 && s.seen) add('tired', 1, ['legs tired. watch it', 'breathe hard. watch it'], 'seen+tired', { ok: (z) => z.seen && z.fatigue > 0.5 });
    if (m.focus && m.beh && m.beh.name === 'feed' && m.beh.phase !== 'go') add('eat', 1, ['good meat', 'chew. chew', 'meat. mine'], 'beh:feed', { ok: (z) => z.beh === 'feed' });
    if (m.prey && !s.seen) add('preyM', 0.8, ['meat animals there', 'meat animals. watch'], 'prey', { ok: (z) => !!z.preyId });
    if (!s.seen && !m.focus && M.boredom > 0.6 && t - s.lastSeenT > 60) add('bored', 1, ['nothing here', 'all quiet', 'nothing happen'], 'bored', { ok: () => m.mood.boredom > 0.5 });
    if (!busy && !F.length && s.beh) {
      const T = { roam: ['go walk', 'walk. sniff'], pause: ['just stand', 'quiet here'] }[s.beh]; if (T) add('idle', 1, T, 'beh:' + s.beh, { ok: (z) => z.beh === s.beh });
    }
    if (!F.length) return;
    let tot = 0; for (const f of F) tot += f.w; let r = R() * tot, f = F[0]; for (const g of F) { r -= g.w; if (r <= 0) { f = g; break; } }
    const kind = f.k.startsWith('expect') ? 'expect' : ['belief', 'where'].includes(f.k) ? 'belief' : ['doing', 'silent', 'tall', 'torchM', 'meatyM'].includes(f.k) ? 'sense' : ['idle', 'eat'].includes(f.k) ? 'want' : 'feel';
    this._q('muse:' + f.k, kind, 0.3, f.texts, f.cond, { ...f.o, ttl: 2, cool: 0 });
  }
}
