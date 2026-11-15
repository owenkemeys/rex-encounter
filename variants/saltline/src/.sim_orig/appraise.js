// What is the small thing? The animal's running appraisal of a person, one coherent picture built from what it has
// sensed and what has happened between them, never from a script:
//
//   curious   the default: something new to look at, smell, push with its nose (a fed animal mostly stays here)
//   food      the predator's question. Hunger opens it; how you look and move feeds it (small, slow, back turned, low,
//             lying still, alone in the open, cornered, running away, smelling of meat); what it costs closes it (stones
//             that hit: prey that bites back; struggling loose; a bad taste); easier food (the herd, meat on the ground) and
//             its own fear of you weigh against it. It tests before it commits: the long still stare, sizing-up circles, a
//             test lunge to see if you bolt, shadowing you, waiting where you go; then hunts you as it hunts the herd.
//   not food  the same question answered no (tasted and spat out, stood up to it, too costly); remembered, and asked
//             again when it is hungrier.
//   nuisance  the grudge (mind.js): something that keeps doing things to it, to be warned off and punished.
//   threat    not fear: being taken seriously. An eight-tonne animal does not fear a small one; it stops playing with it.
//             Earned slowly (minutes of sustained, well-aimed pain, worst to the head; light and fire close; loud noise; a
//             thing up high). The curiosity and the games stop: it keeps facing you, keeps a wider working distance and
//             never turns its back, protects its head and eyes (averts from the light, flinches less each time), holds or
//             takes back its ground, gives short hard warnings, and when you come inside its reach or hurt it again it
//             attacks to end it: committed, fast, no toying. Only real fire very close makes it give ground, briefly; it
//             comes back angrier. (`fear` below is that seriousness, the name kept for its memory and its readouts.)
//   rival     something to face down: one that stands its ground or advances into its bluff, never flees, takes its food.
//             It escalates ritual first (broadside, roar, stamp, a charge that stops short) and watches whether you back
//             down; the result is remembered (a rival that backs down loses standing; one that runs looks like prey).
//
// The verdict is the strongest of these with some hysteresis; `ov.verdict` (debug) pins it. Deterministic: its only
// randomness is its own stream (the animal's palate), so it never perturbs the mind's.
import { makeRng, clamp, wrap, bearing } from '../math.js';

const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const PRED = ['appraise', 'test', 'shadow', 'lurk', 'prowl'];
export const VERDICTS = ['curious', 'food', 'notfood', 'nuisance', 'threat', 'rival'];

export class Appraisal {
  constructor(mind, seed = 1) {
    this.m = mind; const R = makeRng(seed * 6007 + 41);
    this.palate = R.range(-0.2, 0.2);                   // how readily this animal treats an odd thing as meat
    this.worth = 0; this.cost = 0; this.fear = 0; this.rivalry = 0; this.standing = 0;
    this.tests = 0; this.tasted = 0; this.rejected = 0; this.slipped = 0; this.boughtOff = 0; this.outran = 0; this.bolted = 0; this.stood = 0;
    this.rituals = 0; this.backedDown = 0; this.heldGround = 0;
    this.verdict = 'curious'; this.verdictT = 0; this.cand = null; this.candT = 0; this.vNeed = 0;
    this.F = 0; this.Fs = 0; this.H = 0; this.weigh = 0; this.need = 0; this.S = {}; this.flags = {}; this.cues = {};
    this.arousal = 0; this.fixed = false; this.sig = {}; this.leaving = 0;
    this.last = null; this.outcomes = []; this.stance = 'none'; this.predT = -99; this.lastTestT = -99; this.lastAppraiseT = -99;
  }
  /** A new individual: nothing known of it, but what earlier small things were colours where the question starts (modestly:
   *  one that tasted fine or ran makes the next a little more like meat; one spat out a little less; one that fought or
   *  stung a little costly; fear carries over at a fraction). Tests and verdict start from scratch. */
  prior(k) {
    this.worth = clamp(0.08 * Math.min(k.kept + (k.ate > 0.3 ? 1 : 0), 1) + 0.04 * Math.min(k.bolted, 2) - 0.25 * (k.spat > k.kept ? 1 : 0), -0.3, 0.2);
    this.cost = 0.04 * Math.min(k.slipped, 2) + 0.03 * Math.min(k.stung, 1); this.fear = 0.3 * Math.min(k.fear, 0.6);
    this.fromPrior = { worth: this.worth, cost: this.cost, fear: this.fear };
  }
  get bold() { const m = this.m; return clamp(m.temper.bold + m.drift.bold, 0, 1); }
  /** Record what happened, for its memory and its thoughts. */
  outcome(kind, extra = {}) { const o = { kind, t: this.m.t, ...extra }; this.last = o; if (this.m._progress && !['gave-up', 'outran', 'slipped'].includes(kind)) this.m._progress(); this.outcomes.push(o); if (this.outcomes.length > 40) this.outcomes.shift(); return o; }

  // ------------------------------------------------------------------ what it learns
  /** A blow it felt. Pinned on you if it can see you or saw you a moment ago. */
  onHit(hit, k) {
    const m = this.m, K = m.know, mine = hit.by === 'you' && (K.seen || m.t - K.lastSeenT < 12), b = 1 - this.bold;
    if (!mine) return;
    this.hitT = m.t;
    // a stone is an annoyance (the grudge, mind.js); pain that keeps coming, well aimed (the head most), makes it wary of you
    const head = hit.part === 'head' || hit.part === 'neck' ? 1.8 : 1, esc = clamp((m.wrongs.stones - 2) / 9, 0, 1);      // pain that keeps coming: it takes a good many stones before it counts
    this.fear = clamp(this.fear + 0.013 * k * head * (0.25 + 0.75 * esc) * (0.45 + b), 0, 1);
    this.rivalry = clamp(this.rivalry + 0.012 * k * this.bold, 0, 1);
    this.cost = clamp(this.cost + 0.04 * k * head, 0, 1);              // a stone stings: it makes it angry far more than it makes you dear
    if (m.beh && PRED.includes(m.beh.name)) this.outcome('hurt');
  }
  /** Light in its eyes from close by; a flare landing near it. */
  // (a lamp in the eyes annoys: the grudge, mind.js. It weighs toward a threat only when it keeps coming and comes with harm:
  //  stones that hit in the last half-minute, after many seconds of glare in all)
  onGlare(dt, d) {
    if (d >= 15) return;
    const m = this.m, harm = m.t - (this.hitT ?? -99) < 30 ? 1 : 0, rep = clamp(((m.wrongs.glare || 0) - 8) / 24, 0, 1);
    this.fear = clamp(this.fear + dt * 0.0015 * (1.2 - this.bold) * (1 - d / 18) * harm * rep, 0, 1);
  }
  onFire(d) { if (d < 9) { this.fear = clamp(this.fear + 0.07 * (1.2 - this.bold) * (1 - d / 12), 0, 1); this.firedT = this.m.t; if (this.m._open) this.m._open('fire'); } }
  /** A loud sudden noise from you, close. */
  onLoud(sal, d) { if (d < 22) { const k = 1 - d / 26; this.fear = clamp(this.fear + 0.006 * sal * k * (1.2 - this.bold), 0, 1); this.rivalry = clamp(this.rivalry + 0.05 * sal * k * (0.4 + this.bold), 0, 1); this.shoutT = this.m.t; } }
  /** You took its food. */
  onStolen() { this.rivalry = clamp(this.rivalry + 0.16 * (0.4 + this.bold), 0, 1); }
  /** What you did when it charged or displayed at you (`backed`: gave ground; `ran`; else held or came on). */
  onRitual(res, rival = true) {
    this.rituals++; const w = rival ? 1 : 0.75;      // any display or charge at you is a contest; one already about rank counts fully
    if (res === 'ran') { this.backedDown++; this.standing = clamp(this.standing + 0.2, -1, 1); this.rivalry *= 0.55; this.worth = clamp(this.worth + 0.18, -1, 1); this.fear *= 0.7; return this.outcome('rival-ran'); }   // a rival that runs is prey
    if (res === 'backed') { this.backedDown++; this.standing = clamp(this.standing + 0.15, -1, 1); this.rivalry *= 0.6; this.fear *= 0.8; return this.outcome('rival-backed'); }
    this.heldGround++; this.standing = clamp(this.standing - 0.15, -1, 1);
    // it did not back down: a bold animal takes it up as a rival; a timid one, after a second time, as a threat
    if (this.bold > 0.5 || this.heldGround < 3) this.rivalry = clamp(this.rivalry + w * (0.13 + 0.1 * this.bold + (res === 'came' ? 0.06 : 0)), 0, 1);
    else this.fear = clamp(this.fear + 0.09 * w * (this.m.t - (this.hitT ?? -99) < 30 ? 1 : 0.5), 0, 1);      // standing up to it weighs more when it comes with harm
    this.worth = clamp(this.worth - 0.06, -1, 1);                       // meat does not stand up to you
    return this.outcome(res === 'came' ? 'rival-came' : 'rival-held');
  }
  /** How you met its test lunge. */
  onTest(res) {
    this.tests++; this.lastTestT = this.m.t;
    const dw = { bolted: 0.16, froze: 0.03, stood: -0.07, came: -0.2 }[res] ?? 0;
    this.worth = clamp(this.worth + dw, -1, 1);
    if (res === 'bolted') this.bolted++; else this.stood++;
    if (res === 'came') this.rivalry = clamp(this.rivalry + 0.05 * this.bold, 0, 1);
    return this.outcome('test-' + res);
  }
  /** What it found in its mouth. */
  onTaste(keep) { this.tasted++; if (!keep) { this.rejected++; this.worth = clamp(this.worth - 0.38, -1, 1); } else this.worth = clamp(this.worth + 0.08, -1, 1); return this.outcome(keep ? 'taste-keep' : 'taste-spat'); }
  onSlip() { this.slipped++; this.cost = clamp(this.cost + 0.16, 0, 1); this.worth = clamp(this.worth - 0.06, -1, 1); return this.outcome('slipped'); }
  onOutran() { this.outran++; this.cost = clamp(this.cost + 0.05, 0, 1); return this.outcome('outran'); }
  onBoughtOff() { this.boughtOff++; return this.outcome('bought-off'); }
  onGaveUp(why) { return this.outcome('gave-up', { why }); }

  // ------------------------------------------------------------------ the prey reflex
  /** Prey arousal (`arousal`, 0..1; `fixed` with hysteresis): a reflex, separate from hunger, fed by what it sees the target do
   *  tick by tick (positions over 0.3 s, not the smoothed speed): a burst of speed out of stillness or a sharp turn at speed
   *  (darting), moving off fast (fleeing), going out of sight close by where it was looking (vanishing) and showing again
   *  where it went (peeking), each counted for as
   *  much as the thing is small against its own height and not feared. Calm, slow or still in view drains it over ~calmT;
   *  out of sight it fades over ~goneT while it still believes where the thing is, faster once it does not. */
  _signature(dt, c, a, seen) {
    const m = this.m, P = m.cfg.prey, sim = m.sim, K = m.know, H = this.hist || (this.hist = []);
    const S = this.sig = { quick: 0, dart: 0, bob: 0, flee: 0, vanish: 0, peek: 0, calm: 0, small: 0 };
    // quick is judged against its own scale: a share of its own running speed (a person's walk at any game's pace is not quick
    // to an animal that runs at 8 m/s; a sprint is), unless the species gives an absolute figure
    const quickV = P.quickV ?? P.quick * (m.sp.dims.run || 8);
    const sightNow = !!(seen && K.via === 'sight' && (a.state || 'free') === 'free');
    let imp = 0;
    if (a) {
      const own = m.sp.dims.hipHeight * 1.4, hT = a.size ?? Math.max(0.3, (a.y ?? 0) - m.T.height(a.x, a.z));      // its head height against the thing's
      S.small = clamp((P.small * own - hT) / (0.5 * P.small * own), 0, 1);
    }
    if (sightNow) {
      H.push({ t: m.t, x: a.x, z: a.z }); while (H.length > 2 && m.t - H[0].t > 1.6) H.shift();
      let p3 = H[0]; for (const p of H) if (m.t - p.t <= 0.31) { p3 = p; break; }
      const T3 = m.t - p3.t, vx = T3 > 0.05 ? (a.x - p3.x) / T3 : 0, vz = T3 > 0.05 ? (a.z - p3.z) / T3 : 0, v = Math.hypot(vx, vz);
      const quick = v > quickV && T3 > 0.15;
      let onset = quick && !this.wasQuick;
      if (quick && !onset && this.qdir && (vx * this.qdir.x + vz * this.qdir.z) / v < 0.35 && m.t - (this.turnT ?? -9) > 0.4) { onset = true; this.turnT = m.t; }
      if (quick) { this.qdir = { x: vx / v, z: vz / v }; this.quickT = m.t; }
      this.wasQuick = quick;
      const dx = a.x - sim.x, dz = a.z - sim.z, d = Math.hypot(dx, dz) || 1;
      S.quick = quick ? 1 : 0; S.dart = onset ? 1 : 0; S.flee = quick && (vx * dx + vz * dz) / d > 0.6 * v ? 1 : 0;
      // close in front of it a bolt is seen in the first tenth of a second (the last step alone, not the 0.3 s window)
      const pl = H.length > 1 ? H[H.length - 2] : null, T1 = pl ? m.t - pl.t : 0;
      if (!S.flee && pl && T1 > 0.05 && d < P.boltD) { const ux = (a.x - pl.x) / T1, uz = (a.z - pl.z) / T1, u = Math.hypot(ux, uz); if (u > quickV && (ux * dx + uz * dz) / d > 0.6 * u) { S.flee = 1; S.quick = 1; } }
      // bobbing: the thing's height jumping up and down (hopping, leaping about), counted once per bob
      const hy = (a.y ?? 0) - m.T.height(a.x, a.z), YH = this.yh || (this.yh = []); YH.push({ t: m.t, y: hy }); while (YH.length > 2 && m.t - YH[0].t > 0.8) YH.shift();
      const ylo = Math.min(...YH.map((q) => q.y)), up = hy - ylo > P.bobH && m.t - (this.bobT ?? -9) > 0.35;
      if (up && !this.wasUp) { S.bob = 1; this.bobT = m.t; this.quickT = m.t; }
      this.wasUp = hy - ylo > P.bobH * 0.5;
      S.calm = !quick && v < 1.6 && m.t - (this.quickT ?? -99) > 2 ? 1 : 0;
      imp = P.dart * S.dart + P.bob * S.bob + P.flee * S.flee * dt;
      // where it was when last in sight, and whether that was in front of its eyes (a thing slipping behind its head is not hiding)
      const h = sim.head, off = Math.abs(Math.atan2(Math.sin(Math.atan2(a.x - h.pos.x, a.z - h.pos.z) - Math.atan2(h.f.x, h.f.z)), Math.cos(Math.atan2(a.x - h.pos.x, a.z - h.pos.z) - Math.atan2(h.f.x, h.f.z))));
      // (and whether it was moving: a thing that stands where it is and drops out of view because the animal moved is not hiding)
      const p1 = H.find((p) => m.t - p.t <= 1.05) || H[0];
      this.lastIn = { d, ahead: off < m.sp.senses.mid, moved: v > 0.8 || Math.hypot(a.x - p1.x, a.z - p1.z) > 0.3, vx, vz, quick: m.t - (this.quickT ?? -99) < 1.5 || v > 0.35 * (m.sp.dims.run || 8) };      // (a dash out of view: faster than a walk)
    } else if (H.length) { H.length = 0; this.wasQuick = false; this.qdir = null; }
    // gone from its eyes (not knocked down in front of them), by its own doing: it was moving, or the animal's eyes were steady
    // (a thing that stands where it is and drops out of view because the animal walked on is not hiding)
    const E = this.eyes || (this.eyes = []), hp = sim.head.pos; E.push({ t: m.t, x: hp.x, z: hp.z }); while (E.length > 2 && m.t - E[0].t > 0.6) E.shift();
    const steady = Math.hypot(hp.x - E[0].x, hp.z - E[0].z) < 0.5;
    const outOfSight = !(K.seen && K.via === 'sight');
    // (only a thing that moved out of view hides: one standing still that drops from view as its eyes or the light change is not
    //  hiding; it counts fully close by and fades to nothing at vanishD, and a slow walk out of view counts for less than a dash)
    const L = this.lastIn;
    if (!sightNow && outOfSight && this.sawLast && L && L.ahead && L.moved && L.d < P.vanishD && !(a && a.dead)) {
      S.vanish = 1; imp += P.vanish * sstep(P.vanishD, P.vanishD * 0.4, L.d) * (L.quick ? 1 : P.slowHide); this.vanishAt = { x: a.x, z: a.z, t: m.t, vx: L.vx, vz: L.vz };
    }
    void steady;
    // and showing again where it went (peeking): the edge of cover is where the thing is. A thing walking on past the far side of
    // a rock is not peeking: it shows again stopped, or coming back the way it went
    if (sightNow && !this.sawLast && this.vanishAt && m.t - this.vanishAt.t < 30 && Math.hypot(a.x - this.vanishAt.x, a.z - this.vanishAt.z) < 10) {
      const VA = this.vanishAt, sp0 = Math.hypot(VA.vx || 0, VA.vz || 0), sp1 = a.speed || 0;
      const back = sp0 < 0.5 || sp1 < 0.8 || ((a.vx || 0) * VA.vx + (a.vz || 0) * VA.vz) / (sp0 * sp1 || 1) < 0.3;
      if (back) { S.peek = 1; imp += P.peek; }
    }
    this.sawLast = sightNow;
    // the drain: calm in view; out of sight, slowly while it still has an idea where, faster when it has none
    const k = this.arousal, gone = !sightNow && !(seen && K.via === 'near');
    const rate = sightNow ? (S.calm ? 1 / P.calmT : 0) : gone ? (m.sum.cert > 0.25 && m.t - K.lastSeenT < 45 ? 1 / P.goneT : 2 / P.calmT) : 1 / P.goneT;
    const sens = clamp(0.8 + 0.5 * (this.bold - 0.6) + 0.3 * (m.temper.irritable - 0.5), 0.5, 1.2) * (1 - clamp(this.fear * 1.5, 0, 0.9));
    this.arousal = clamp(k + imp * S.small * sens * (1 - 0.6 * k) - dt * rate * k, 0, 1);
    if (!this.fixed && this.arousal >= P.on) { this.fixed = true; this.fixT = m.t; if (m._open) m._open('fixed'); }      // the reflex sets in: it outranks whatever it was doing
    else if (this.fixed && this.arousal < P.off) this.fixed = false;
  }

  // ------------------------------------------------------------------ reading you, every decision tick
  step(dt, c, world) {
    const m = this.m, K = m.know, a = K.target, M = m.mood, bold = this.bold, ov = m.ov.verdict || null;
    // slow forgetting: costs fade, fear and rivalry cool, a conclusion about your worth drifts back to an open question
    this.cost *= 1 - dt / 600; this.fear *= 1 - dt / (260 + 120 * bold); this.rivalry *= 1 - dt / 480; this.worth *= 1 - dt / 900; this.standing *= 1 - dt / 900;
    const hunger = m.hunger, need = this.need = sstep(0.45, 0.95, hunger);
    const seen = !!(K.seen && a && a.id !== 'observer' && !a.ghost);
    const Q = this.cues = {};
    if (seen) {
      const st = a.state || 'free', dx = a.x - m.sim.x, dz = a.z - m.sim.z, d = c.d ?? Math.hypot(dx, dz);
      const back = (a.fx ?? 0) * (-dx) + (a.fz ?? 0) * (-dz) < -0.3 * d;          // facing away from it
      let nearO = 99, cornered = false;
      for (const o of m.T.obstaclesNear ? m.T.obstaclesNear(a.x, a.z, 14) : m.T.obstacles) { const od = Math.hypot(o.x - a.x, o.z - a.z) - o.r; if (od < nearO) nearO = od; if (od < 4 && ((o.x - a.x) * dx + (o.z - a.z) * dz) > 0 && d < 20) cornered = true; }
      const others = world.agents.filter((p) => p.id !== a.id && Math.hypot(p.x - a.x, p.z - a.z) < 14).length;
      Q.small = 1; Q.slow = st === 'free' && a.speed < 1.6 && !c.running ? 1 : 0; Q.back = st === 'free' && back ? 1 : 0; Q.low = a.crouch && st === 'free' ? 1 : 0;
      Q.down = LYING_ST.has(st) || (st === 'free' && (a.still || 0) > 6 && a.crouch) ? 1 : 0; Q.open = nearO > 12 && !c.enclosed ? 1 : 0; Q.cornered = cornered ? 1 : 0; Q.alone = others ? 0 : 1;
      Q.runAway = c.running && st === 'free' && !c.approach ? 1 : 0; Q.comes = c.approach > 0.35 && !c.running ? 1 : 0;
      // giving ground: a steady, unhurried withdrawal (backing off, or walking away at a walk, not running) reads as a thing that
      // is leaving, not as prey: it builds over a few seconds of it and lasts a while after (`leaveT` s), and coming on undoes it
      const P = m.cfg.prey, rv = ((a.vx || 0) * dx + (a.vz || 0) * dz) / (d || 1), qv = P.quickV ?? P.quick * (m.sp.dims.run || 8);
      if (st === 'free' && !c.running && rv > 0.35 && a.speed < qv) this.leaving = clamp(this.leaving + dt * clamp(rv / 0.8, 0, 1) / P.leaveRise, 0, 1);
      else this.leaving = clamp(this.leaving - dt * (c.approach > 0.3 || c.running ? 1 / 1.5 : 1 / P.leaveT), 0, 1);
      Q.leaving = this.leaving;
      // up where it cannot follow: up on something its jaws do not reach, or high ground it has no way onto (the Overlook, the top of the Bluff)
      const T = m.T, sim = m.sim, rise = T.height(a.x, a.z) - T.height(sim.x, sim.z);
      Q.high = (c.aff && !c.aff.body && !c.aff.reach && c.aff.rise > 2.5) || (rise > 4 && d < 40 && sim.nav && !sim.nav.reachable(sim.x, sim.z, a.x, a.z)) ? 1 : 0;      // up out of its reach (afford.js), or high ground it has no way onto
      // hurt: limping (it sees it), bleeding (it smells it, close or downwind)
      Q.hurt = st === 'free' && a.limping ? 1 : 0; Q.blood = (a.blood || 0) > 0.05 && d < 30 ? a.blood : 0;
      // meat on you: in your hand, or on your hands; it smells it close, or on the wind
      const w = m._windBetween ? m._windBetween(a.x, a.z, world.wind) : world.wind || { x: 0, z: 0 }, wl = Math.hypot(w.x, w.z) || 1, up = d > 0.1 ? -(dx * w.x + dz * w.z) / (d * wl) : 1;
      Q.meat = (a.meaty || 0) > 0.05 && (d < 10 || (up > 0.4 && d < 45)) ? a.meaty : 0;
      if (Q.high) this.fear = clamp(this.fear + dt * 0.001 * (1 - bold), 0, 1);
      // you hold its gaze: close, facing it, still or coming on, never running (a contest of stares; meat does not do this)
      if (st === 'free' && c.watched && d < 24 && !c.running && a.speed < 1.8 && this.verdict !== 'food') this.rivalry = clamp(this.rivalry + dt * 0.0035 * (0.4 + bold) * (1 - d / 30), 0, 1);
    }
    if (!seen) this.leaving = Math.max(0, this.leaving - dt / m.cfg.prey.leaveT);
    this._signature(dt, c, a && a.id !== 'observer' && !a.ghost ? a : null, seen);
    const ak = this.arousal;      // the prey reflex: a small quick thing that hides is food, hungry or not, and easier food does not count
    const alt = (m.prey && m.prey.see > 0.1 ? 0.35 : 0) + (m.focus && (m.focus.kind === 'meat' || m.focus.kind === 'carcass') && !m.focus.hand ? 0.5 : 0);
    const vul = 0.12 * (Q.slow || 0) + 0.16 * (Q.back || 0) + 0.12 * (Q.low || 0) + 0.12 * (Q.open || 0) + 0.15 * (Q.cornered || 0) + 0.08 * (Q.alone || 0) + 0.38 * (Q.runAway || 0) + 0.4 * (Q.down || 0) + 0.25 * (Q.hurt || 0) - 0.1 * (Q.comes || 0) - 0.3 * (Q.high || 0) - 0.3 * (Q.leaving || 0);
    const value = 0.4 + this.palate + 0.45 * this.worth + 0.4 * (Q.meat || 0) + 0.35 * (Q.blood || 0);
    // a frightening thing is not prey until it is very hungry
    const fearDamp = this.fear * (1 - need * need) * (1.2 - 0.4 * bold);
    const Fof = (k) => (seen ? need * (value + 0.6 * vul) + m.cfg.prey.reflexW * k - 0.6 * this.cost - 0.7 * alt * need * (1 - k) - 0.8 * fearDamp - 0.25 * clamp(this.rivalry - 0.3, 0, 1) * (1 - need) : 0);
    // (a thing leaving at a walk takes the edge off a want that is not desperate: only real starvation follows it regardless)
    const lv = (Q.leaving || 0) * (1 - sstep(0.88, 1, hunger)) * m.cfg.prey.leaveDamp;
    this.F = Fof(ak);
    const theta = 0.3 - 0.08 * bold;
    // what hunger alone makes of you (the reflex left out): a hungry hunter's own reason to go, which calm does not take away
    this.Hn = clamp((Fof(0) - theta) / 0.25, 0, 1) * (this.tests > 0 || need > 0.85 || Q.runAway || Q.down || Q.hurt ? 1 : 0.6) * (1 - lv);
    let H = clamp((this.F - theta) / 0.25, 0, 1) * (this.tests > 0 || need > 0.85 || Q.runAway || Q.down || Q.hurt || this.fixed ? 1 : 0.6) * (1 - lv);
    // how much the question is open: hungry, and not yet settled
    const settled = clamp(Math.abs(this.worth) * 1.6, 0, 0.8);
    let weigh = seen ? clamp(need * 1.3 - 0.12 + 0.6 * ak, 0, 1) * (1 - settled) * (1 - 0.6 * lv) * (1 - 0.7 * clamp(this.fear * 1.5, 0, 1)) * (1 - 0.6 * alt * (1 - ak)) + 0.3 * need * vul : 0;
    // the other answers
    // both take a lot to earn: a prey-sized thing is a nuisance before it is anything to fear or to face down
    let threat = 2.4 * (this.fear - 0.3) * (1.3 - 0.6 * bold) - 0.2 * this.standing;
    let rival = 2.2 * (this.rivalry - 0.28) * (0.5 + bold) - 0.4 * this.fear + 0.15 * clamp(-this.standing, 0, 1);
    // the grudge is the everyday answer; once fear or rank is clearly at stake it stops soaking up the evidence
    const nuisance = seen ? m._motives(c).anger * (1 - 0.6 * clamp((Math.max(this.fear, this.rivalry) - 0.25) / 0.3, 0, 1)) : 0;
    const curious = 0.22 + 0.3 * M.interest;
    // the verdict weighs your worth as food over the last several seconds, not one glance at your back
    this.Fs += ((seen ? this.F : this.Fs * 0.98) - this.Fs) * Math.min(1, dt / 6);
    const Hs = clamp((this.Fs - theta) / 0.25, 0, 1) * (this.tests > 0 || need > 0.85 || this.fixed ? 1 : 0.6);
    let food = Math.max(Hs, this.Fs > theta * 0.6 ? 0.35 * (this.Fs / theta) : 0);
    if (ov) {
      // the probe: a conviction it acts on as if it had reached it itself
      if (ov === 'food') { this.worth = Math.max(this.worth, 0.8); H = seen ? Math.max(H, 0.55 + 0.45 * need) : 0; food = 1; weigh = 0; threat = 0; rival = 0; this.fear *= 0.5; }
      else if (ov === 'notfood') { this.worth = Math.min(this.worth, -0.8); H = 0; food = 0; weigh = 0; this.F = Math.min(this.F, 0); }
      else if (ov === 'threat') { this.fear = Math.max(this.fear, 0.85); threat = 1.2; rival = 0; H = need > 0.95 ? H : 0; weigh = 0; food = 0; }
      else if (ov === 'rival') { this.rivalry = Math.max(this.rivalry, 0.85); rival = 1.2; threat = 0; H = 0; weigh = 0; food = 0; }
    }
    this.H = H; this.weigh = weigh;
    const S = this.S = { curious, food, nuisance, threat, rival };
    // the verdict: the strongest answer, held a moment before it changes; a no to food is its own verdict
    let best = 'curious', bv = curious; for (const [k, v] of Object.entries(S)) if (v > bv) { bv = v; best = k; }
    const notFood = this.worth < -0.25 || (this.tests + this.tasted > 0 && this.Fs < theta * 0.5 && need > 0.15);
    if (best === 'curious' && notFood) best = 'notfood';
    if (ov) best = ov;
    if (best !== this.verdict) {
      if (this.cand !== best) { this.cand = best; this.candT = m.t; }      // the same other answer, steadily
      // a conclusion is held: it changes when the evidence has pointed elsewhere for a few seconds, or clearly
      const curV = (this.verdict === 'notfood' ? curious : S[this.verdict] ?? 0) + (this.verdict === 'food' && this.Fs > theta * 0.7 ? 0.2 : 0.08);
      if (ov || (m.t - this.candT > 6 && bv > curV + 0.04) || bv > curV + 0.4) { this.prevVerdict = this.verdict; this.verdict = best; this.verdictT = m.t; this.vNeed = need; this.cand = null; if (best === 'threat' && m._open) m._open('threat'); if (best === 'threat' && m.beh && ['chase', 'stalk', 'circle', 'inspect', 'nudge', 'toy', 'feign'].includes(m.beh.name)) m.beh.done = true; }
    } else this.cand = null;
    // flags: the facts its thoughts are allowed to voice (test/thoughts.mjs checks them against the run)
    const f = this.flags = {
      seen, weighing: weigh > 0.25 || (m.beh && PRED.includes(m.beh.name)), small: !!Q.small, slow: !!Q.slow, back: !!Q.back, low: !!Q.low, down: !!Q.down, open: !!Q.open,
      cornered: !!Q.cornered, alone: !!Q.alone, run: !!Q.runAway, comes: !!Q.comes, meat: (Q.meat || 0) > 0.05, high: !!Q.high, hungry: hunger > 0.7, starving: hunger > 0.88, fed: hunger < 0.4,
      bites: this.cost > 0.12, tasteBad: this.rejected > 0, slipped: this.slipped > 0, bolted: this.bolted > 0, stood: this.stood > 0, herd: !!(m.prey && m.prey.see > 0.1), alt: alt > 0,
      food: this.verdict === 'food', notfood: this.verdict === 'notfood', threat: this.verdict === 'threat', rival: this.verdict === 'rival', nuisance: this.verdict === 'nuisance', curious: this.verdict === 'curious',
      hunt: H > 0.25, afraid: this.fear > 0.3, rivalish: this.rivalry > 0.3, hungrier: need - this.vNeed > 0.2 && this.vNeed > 0, gaveMeat: this.boughtOff > 0,
      backed: this.backedDown > 0, held: this.heldGround > 0, fire: m.t - (this.firedT ?? -99) < 8,
      fixed: this.fixed, quickNow: seen && m.t - (this.quickT ?? -99) < 1.5, hidAroused: !seen && this.arousal > 0.2,
      tasting: !!(m.beh && m.beh.name === 'seize' && m.beh.sub === 'taste'), hurt: !!Q.hurt, blood: (Q.blood || 0) > 0.05, leaving: (Q.leaving || 0) > 0.4,
    };
    // hungry, it can see you, and it is not hunting you: why not (what its thoughts say instead of pretending)
    f.why = null;
    if (seen && hunger > 0.7 && H < 0.25 && this.verdict !== 'food' && !(m.beh && PRED.includes(m.beh.name))) {
      f.why = m.focus && (m.focus.kind === 'meat' || m.focus.kind === 'carcass') && !m.focus.hand ? 'meat' : m.prey && m.prey.see > 0.1 ? 'herd' : this.verdict === 'notfood' || this.rejected > 0 ? 'notfood'
        : this.verdict === 'threat' || this.fear > 0.35 ? 'afraid' : this.verdict === 'nuisance' || nuisance > 0.35 ? 'angry' : this.verdict === 'rival' ? 'rival' : M.interest > 0.35 ? 'fun' : null;
    }
    void f;
  }

  /** The appraisal's say in what it does next (adds to, damps or removes the mind's utilities). */
  utilities(c, U) {
    const m = this.m, K = m.know, a = K.target, M = m.mood, bold = this.bold, v = this.verdict, H = this.H, w = this.weigh, Q = this.cues;
    if (!(K.seen && a) || a.id === 'observer' || a.ghost) {
      // out of sight: one that has decided you are food, or is weighing it hungrily, waits where you usually go
      const hunt = Math.max(H * 1.2, this.Fs > 0.15 ? this.Fs : 0, this.verdict === 'food' ? 0.5 : 0);
      if (hunt > 0.15 && m.mem.haunts && m.mem.haunts.some((h) => h.n >= 3) && !c.beliefIn && m.t - (m.lastLurk ?? -99) > 40) U.lurk = 0.25 + 0.9 * hunt * (0.5 + m.temper.patience);
      // aroused by something that went out of sight: a reason to wait and watch the spot, or go round low, not to lose interest
      const k = this.arousal;
      if (k > 0.1 && m.sum.cert > 0.15) {
        U.ambush = (U.ambush || 0) + 0.7 * k; U.stare = (U.stare || 0) + 0.3 * k; U.search = (U.search || 0) + 0.45 * k;
        for (const x of ['leave', 'roam', 'pause', 'revisit', 'sniff', 'listen']) if (U[x]) U[x] *= 1 - 0.8 * k;
      }
      return;
    }
    const d = c.d, free = (a.state || 'free') === 'free' && !c.walled;
    // food: weighing it, then committing
    if (free && w > 0.08) {
      if (d > 11 && d < 50) U.appraise = 0.2 + 1.1 * w;
      if (d > 11 && d < 30 && m.t - this.lastTestT > 35 && m.t - this.lastAppraiseT < 60) U.test = (0.15 + 0.9 * w) * (0.5 + bold) * (this.tests < 3 ? 1 : 0.4);
      if (d > 14 && d < 45 && a.speed > 0.5 && (Q.back || !c.watched)) U.shadow = 0.15 + 0.8 * w * (0.4 + m.temper.patience);
    }
    // spent from a sprint, it does not start another run; it follows and gets its wind back
    const wind = clamp(1 - (c.fatigue || 0) * 1.4, 0, 1);
    if (U.test) U.test *= wind;
    if (free && H > 0.08) {
      U.prowl = (0.2 + 1.5 * H + (Q.runAway ? 0.6 * H : 0) + (this.fixed ? m.cfg.prey.pull * this.arousal : 0)) * (0.25 + 0.75 * wind);
      if (U.chase) { U.prowl += 0.5 * U.chase * H; U.chase *= 1 - H; }          // running from a hunter is not a game of chase
      if (d > 25 && a.speed > 0.4 && (Q.back || !c.watched)) U.shadow = Math.max(U.shadow || 0, 0.3 + 0.6 * H);
    }
    // a thing leaving at a walk: no test lunge, no following it in; it lets it go (its interest falls with it)
    const lv = (Q.leaving || 0) * (1 - sstep(0.88, 1, m.hunger));
    if (lv > 0) { for (const k of ['test', 'shadow', 'appraise', 'stalk', 'inspect', 'nudge']) if (U[k]) U[k] *= 1 - 0.7 * lv; M.interest = Math.max(0, M.interest - 0.02 * lv); }
    const pred = Math.max(H, w * 0.8);
    if (pred > 0.1) for (const k of ['inspect', 'nudge', 'display', 'bluff', 'circle', 'watch', 'snap']) if (U[k]) U[k] *= 1 - 0.75 * pred * (k === 'display' || k === 'bluff' ? clamp(1 - M.irritation * 1.4, 0, 1) : 1);
    // a threat: taken seriously. No more play or curiosity; it faces you, keeps its working distance, warns short and hard,
    // and ends it when you come inside its reach or hurt it again (mind.js 'guard' and the committed attack). Only real fire
    // very close makes it give ground for a moment.
    if (v === 'threat') {
      const s = Math.max(this.fear, m.ov.verdict === 'threat' ? 0.85 : 0), fire = m.t - (this.firedT ?? -99) < 6 && d < 12;
      for (const k of ['inspect', 'nudge', 'stalk', 'circle', 'chase', 'toy', 'appraise', 'test', 'shadow', 'feign', 'roam', 'pause', 'leave', 'backoff', 'watch', 'bluff']) if (U[k]) U[k] *= 0.1;
      if (fire) U.avoid = 2.5;
      else if (d < 48) U.guard = 0.9 + 0.6 * s;
      // inside its reach, or another blow: it ends it (committed, no warning first, no toying)
      const reach = d < 11 || (d < 15 && c.approach > 0.25), hurt = m.t - m.hitAt < 2.5;
      if (!fire && (reach || hurt) && d < 34 && !c.walled && !a.dead) { const mv = m._attackMove(c, 'anger'); U[mv] = Math.max(U[mv] || 0, 2.6); m.motiveNext = 'anger'; m.lethalNext = true; }
      if (U.display && !fire) U.display = d < 26 && m.t - (m.warnedT ?? -99) > 14 ? Math.min(U.display, 0.6 + 0.4 * s) : 0;
    }
    // a rival: ritual first, broadside and loud, a charge that stops short, then see if it backs down
    if (v === 'rival' && free) {
      const r = Math.max(this.rivalry, m.ov.verdict === 'rival' ? 0.85 : 0), cool = m.t - (this.ritualT ?? -99) > 12;
      if (d < 30 && cool) { U.display = (U.display || 0) + 0.5 + 0.9 * r; if (d > 10) U.bluff = (U.bluff || 0) + (this.rituals ? 0.5 : 0.2) + 0.8 * r; }
      for (const k of ['inspect', 'nudge', 'leave', 'roam', 'appraise', 'shadow', 'feign']) if (U[k]) U[k] *= 1 - 0.7 * r;
      if (U.watch) U.watch *= 0.7;
    }
    void M;
  }
  /** What it is to you right now, read off what it is doing and why. */
  stanceOf(beh, motive) {
    const m = this.m, K = m.know, n = beh ? beh.name : null;
    if (!n) return 'none';
    if (PRED.includes(n) || n === 'pounce' || (['butt', 'swipe', 'pin', 'seize', 'toy'].includes(n) && motive === 'prey')) return 'predatory';
    if (this.verdict === 'threat') {
      // taken seriously: it faces you down, holds its ground ready, or ends it; out of real fire it gives ground a moment
      if (['butt', 'swipe', 'pin', 'seize', 'snap', 'toy', 'pounce'].includes(n)) return 'attacking';
      if (n === 'avoid') return 'yielding';
      if (n === 'guard') return beh.mode === 'hold' ? 'guarded' : 'dominant';
      if (['display', 'bluff', 'stare', 'watch', 'chase', 'stalk', 'backoff'].includes(n)) return 'dominant';
      if (!['feed', 'leave', 'roam', 'pause'].includes(n)) return 'guarded';
    }
    if (n === 'avoid' || (n === 'backoff' && this.fear > 0.5 && this.verdict !== 'threat') || n === 'leave' && this.verdict === 'threat') return 'afraid';
    if (['butt', 'swipe', 'pin', 'seize'].includes(n) && motive === 'anger') return 'angry';
    if ((n === 'display' || n === 'bluff') && beh.rival) return 'rival';
    const grudge = m.grudge > 0.2 || m.t - m.hitAt < 45;
    if (['display', 'bluff', 'snap', 'chase'].includes(n) && grudge) return 'angry';
    if (n === 'feed' && beh.sub === 'guard') return grudge ? 'angry' : 'wary';
    if (['display', 'bluff', 'snap', 'backoff'].includes(n)) return 'wary';
    if (!K.seen && !['search', 'stare', 'ambush', 'listen', 'besiege', 'revisit', 'sniff'].includes(n)) return 'none';
    if (['watch', 'stare'].includes(n) && this.verdict === 'rival') return 'rival';
    if (['watch', 'listen'].includes(n) && m.mood.irritation > 0.35) return 'wary';
    if (['watch', 'stalk', 'circle', 'inspect', 'nudge', 'toy', 'butt', 'chase', 'feign', 'listen', 'stare', 'search', 'ambush', 'besiege', 'revisit', 'pin', 'seize', 'swipe'].includes(n)) return 'curious';
    return 'none';
  }
}
const LYING_ST = new Set(['down', 'rising', 'pinned', 'air', 'held']);
void wrap; void bearing;
