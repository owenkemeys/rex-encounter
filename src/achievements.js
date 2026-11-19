// Achievements: dares. Each one names a silly, clip-worthy thing to try with the animal, and is earned when the simulation
// shows it happened. Nothing here steers the animal or asks anything of the sim: every detector reads state and events
// (arena.events, the mind's label and senses, the body's act and head, the person's victim body, the terrain) and tolerates
// a missing signal (an event the sim does not emit simply never fires).
// General rules only: "a structure" is anything solid the body hits, "chasing you" is the mind's label and target, the
// line of sight is the mind's own los(). Nothing knows which arena it is in.
// Saved progress: localStorage 'dh.achv' ({ v: 3, done: [ids] }). Ids saved by the old list (v 2) are not carried over.
const hyp = Math.hypot;

// Each one: a short title and a one-line dare (the same line is shown locked or earned). The list order is the order the
// death card suggests the next one in. `bonus` ones are listed last and never suggested. `again`: flashed every time it
// happens, not only the first.
export const ACHIEVEMENTS = [
  { id: 'stare', title: 'Stare down', dare: 'Stand still while it sniffs you for 5 seconds' },
  { id: 'yeet', title: 'Yeet', dare: 'Get thrown by it' },
  { id: 'rude', title: 'Rude', dare: 'Shout right in its face' },
  { id: 'decoy', title: 'Decoy', dare: 'Get it going for a flare while you run the other way' },
  { id: 'near', title: 'Near miss', dare: 'Get within a metre of its jaws and live', again: true },
  { id: 'corner', title: 'Round the corner', dare: 'Break its line of sight while it chases you' },
  { id: 'matador', title: 'Matador', dare: 'Make it crash into something while it chases you' },
  { id: 'funny', title: 'Funny death', dare: 'Die in mid-air, or right after a dare' },
  { id: 'yeetbig', title: 'Big yeet', dare: 'Get thrown four and a half metres up', bonus: true },
];
// thresholds (all from the sim's own units: metres, seconds)
export const TH = {
  nearJaw: 1.0,       // near miss: closest the jaw line came to the surface of your body (a 0.3 m capsule) during one jaw act; the kill reach is 0.5
  stareSnout: 2.5,    // stare down: its snout tip within this of you
  stareStill: 0.35,   // stare down: you count as still below this speed (m/s)
  stareSecs: 5,
  yeetBig: 4.5,       // big yeet: peak height of your body above the ground while thrown (a playful toss from its jaws peaks at 4.1 to 4.5 m)
  rudeSnout: 3,       // rude: a shout with its snout tip within this of you
  decoyRun: 1.5,      // decoy: you moving away from it at least this fast (m/s)
  decoySecs: 1.5,
  crashForce: 2.5,    // matador: a head contact this hard (closing speed, m/s); any torso or hips knock counts from 1.5
  crashBody: 1.5,
  chaseHold: 1.5,     // matador and corner: it counts as chasing you up to this long after the chase label left
  cornerSecs: 1.0,    // round the corner: its eye to you blocked this long, mid-chase, within 40 m
  cornerRange: 40,
  funnySecs: 2,       // funny death: within this of landing from a throw or knock, or of doing a dare
};
const JAWS = new Set(['strike', 'seize', 'snap']);
const CHASE = new Set(['chase', 'prowl', 'pounce', 'snap', 'bluff', 'stalk']);
const HOT = new Set(['chase', 'snap', 'bluff', 'display', 'stalk', 'prowl', 'pounce', 'butt', 'swipe', 'pin', 'seize', 'toy']);
const THROWN = new Set(['butt', 'tail']);      // knocked flying (a snout poke is a stumble, not a throw)

export class Achievements {
  /** ctx: { sim, mind, terrain, things, arena }; opts: { onDone(a, n, total), onAgain(a) } */
  constructor(ctx, opts = {}) {
    this.c = ctx; this.opts = opts; this.done = new Set(); this.t = 0; this.st = {};
    this.load();
    this.reset(false);
  }
  load() {
    try { const raw = JSON.parse(localStorage.getItem('dh.achv') || 'null'); if (raw && raw.v === 3) for (const id of raw.done || []) this.done.add(id); } catch {}
    for (const id of [...this.done]) if (!ACHIEVEMENTS.some((a) => a.id === id)) this.done.delete(id);
  }
  /** A new scenario or life: the detectors' running state starts again. clear: also forget what was earned. */
  reset(clear = true) {
    if (clear) { this.done.clear(); this._save(); }
    this.st = { lastDid: -999, landT: -999, air: null, jaw: null, stareT: 0, stared: false, decoyT: 0, armed: false, chaseT: -999, losT: -999, px: null, pz: null, vx: 0, vz: 0, vState: 'free' };
  }
  _save() { try { localStorage.setItem('dh.achv', JSON.stringify({ v: 3, done: [...this.done] })); } catch {} }
  get count() { return this.done.size; }
  get total() { return ACHIEVEMENTS.length; }
  has(id) { return this.done.has(id); }
  /** The dare happened: earned the first time; the time is kept either way (funny death reads it). */
  did(id) {
    const a = ACHIEVEMENTS.find((x) => x.id === id); if (!a) return false;
    if (id !== 'funny') this.st.lastDid = this.t;
    if (this.done.has(id)) { if (a.again && this.opts.onAgain) this.opts.onAgain(a); return false; }
    this.done.add(id); this._save();
    if (this.opts.onDone) this.opts.onDone(a, this.done.size, ACHIEVEMENTS.length);
    return true;
  }
  /** The next dare to suggest: the first not yet done, in list order (bonus ones never). */
  next() { return ACHIEVEMENTS.find((a) => !a.bonus && !this.done.has(a.id)) || null; }
  /** For the list: every dare in list order, each with whether it is done. */
  listing() { return ACHIEVEMENTS.map((a) => ({ ...a, got: this.done.has(a.id) })); }

  // ---------------------------------------------------------------- events
  /** Offer an event from the arena (call once per event). `you` is the player's position or null. */
  event(e, you) {
    const { mind } = this.c, S = this.st, mine = (x) => !x || x === 'you' || String(x).startsWith('you#');
    if (e.src === 'victim') {
      if (!mine(e.id)) return;
      if (e.type === 'tossed' || (e.type === 'knocked' && THROWN.has(e.by))) { S.air = { peak: 0, thrown: true }; this.did('yeet'); }
      else if (e.type === 'knocked' && !S.air) S.air = { peak: 0, thrown: false };
      if (e.type === 'landed') { S.landT = this.t; if (S.air && S.air.thrown && S.air.peak >= TH.yeetBig) this.did('yeetbig'); S.air = null; }
      if (e.type === 'death') {
        const V = this.c.arena && this.c.arena.victims ? this.c.arena.victims.get('you') : null, was = V && V.state !== 'dead' ? V.state : S.vState;
        if (was === 'air' || this.t - S.landT < TH.funnySecs || this.t - S.lastDid < TH.funnySecs) this.did('funny');
      }
      return;
    }
    // matador: its body knocks into something solid while it is chasing you
    if (e.src === 'sim' && e.type === 'contact' && this.t - S.chaseT < TH.chaseHold) {
      const body = e.part === 'torso' || e.part === 'hips';
      if ((e.force || 0) >= (body ? TH.crashBody : TH.crashForce)) this.did('matador');
    }
    void mind;
  }
  /** A noise the player made ({ kind: 'shout' | 'whistle', x, y, z }). */
  noise(q, you) {
    if (!q || q.kind !== 'shout' || !you) return;
    const tip = this._tip(); if (this._dTip(tip, you) < TH.rudeSnout) this.did('rude');
  }
  _tip() { const { sim } = this.c, h = sim.head.pos, f = sim.head.f, L = sim.species.dims.headLen; return { x: h.x + f.x * L, y: h.y + f.y * L, z: h.z + f.z * L }; }
  // from a point to your body (feet to eye)
  _dTip(p, you) { return hyp(you.x - p.x, Math.max(0, p.y - you.y - 0.1, you.y - 1.7 - p.y), you.z - p.z); }

  // ---------------------------------------------------------------- per frame
  /** you: { x, y (eye), z, fx, fy, fz (look direction) } when on foot, else null. */
  update(dt, you) {
    this.t += dt; const { sim, mind, terrain, arena } = this.c, S = this.st, K = mind.know, label = mind.label;
    const V = arena && arena.victims ? arena.victims.get('you') : null, free = !V || V.state === 'free';
    const onYou = !!(K.target && (K.target.id === 'you' || String(K.target.id).startsWith('you')));
    if (CHASE.has(label) && onYou) S.chaseT = this.t;
    // thrown: the peak height of the body above the ground while in the air
    if (V && V.state === 'air' && S.air && terrain.height) S.air.peak = Math.max(S.air.peak, V.y - terrain.height(V.x, V.z));
    if (V && V.state !== 'dead') S.vState = V.state;

    // near miss: one jaw act (strike, seize, snap) passes within TH.nearJaw of your body and you are still free when it ends
    const act = sim.act, jawAct = act && JAWS.has(act.kind) ? act : null;
    if (S.jaw && S.jaw.act !== jawAct) {
      const J = S.jaw; S.jaw = null;
      if (J.min - 0.3 <= TH.nearJaw && !J.act.hit && free && !(V && V.dead)) this.did('near');
    }
    if (jawAct && you && free) {
      const h = sim.head, L = sim.species.dims.headLen, y0 = you.y - 1.7, y1 = you.y; let best = 99;
      for (let k = 0; k <= 4; k++) { const s = (0.1 + 0.9 * k / 4) * L, x = h.pos.x + h.f.x * s, y = h.pos.y + h.f.y * s - 0.3, z = h.pos.z + h.f.z * s; best = Math.min(best, hyp(x - you.x, Math.min(Math.max(y, y0), y1) - y, z - you.z)); }
      if (!S.jaw) S.jaw = { act: jawAct, min: best }; else S.jaw.min = Math.min(S.jaw.min, best);
    } else if (jawAct && !S.jaw) S.jaw = { act: jawAct, min: 99 };

    if (!you) { S.stareT = 0; S.decoyT = 0; S.armed = false; S.px = null; return; }
    const dRex = hyp(you.x - sim.x, you.z - sim.z), tip = this._tip(), dTip = this._dTip(tip, you), k = Math.min(1, dt * 8);
    if (S.px !== null && dt > 0) { S.vx += ((you.x - S.px) / dt - S.vx) * k; S.vz += ((you.z - S.pz) / dt - S.vz) * k; } S.px = you.x; S.pz = you.z;
    const spd = hyp(S.vx, S.vz), awaySpd = dRex > 0.1 ? (S.vx * (you.x - sim.x) + S.vz * (you.z - sim.z)) / dRex : 0;

    // stare down: you keep still (on your feet, or lying where it put you and not struggling) while its snout is at you and it
    // is not attacking; being in the air pauses the count; anything else (moving, held, pinned, an attack) ends it. Once per visit of its snout.
    { const still = (free && spd < TH.stareStill) || (V && (V.state === 'down' || V.state === 'rising') && V.struggle < 0.12), up = V && V.state === 'air';
      if (up) { /* paused */ } else if (still && dTip < TH.stareSnout && onYou && !HOT.has(label)) { S.stareT += dt; if (S.stareT >= TH.stareSecs && !S.stared) { S.stared = true; this.did('stare'); } }
      else { S.stareT = 0; if (dTip > TH.stareSnout + 2) S.stared = false; } }

    // decoy: it goes for a flare you threw while you move away from it
    { const f = mind.focus, fo = f && f.kind === 'flare' && this.c.things ? this.c.things.get(f.id) : null, on = label === 'investigate' && fo && fo.by === 'you';
      if (on && free && awaySpd > TH.decoyRun) { S.decoyT += dt; if (S.decoyT >= TH.decoySecs && S.decoyT - dt < TH.decoySecs) this.did('decoy'); }
      else if (!on) S.decoyT = 0; }

    // round the corner: chasing you, it had you in sight, then its eye's line to you is blocked for TH.cornerSecs
    if (free && this.t - S.chaseT < TH.chaseHold && dRex < TH.cornerRange && mind.los) {
      const h = sim.head.pos;
      if (mind.los(h.x, h.y, h.z, you.x, you.y - 0.3, you.z)) { S.losT = this.t; S.armed = true; }
      else if (S.armed && this.t - S.losT >= TH.cornerSecs) { S.armed = false; this.did('corner'); }
    } else S.armed = false;
  }
}
