// One attention system. The thought stream (thoughts.js) and the gaze (mind.js -> intent.look -> rex.js head/eyes) both read
// it, so what it thinks about and where its head goes are the same thing.
//
//   focus       what the current behaviour is about (`you`, `prey:<id>`, `obj:<id>`), or, when the behaviour is about nothing
//               in particular, whatever captured it last (a few seconds). "it" in a thought always means the focus.
//   peripheral  everything else it knows of (you, the prey it has an eye on, food, the last noise), each with a salience read
//               off what that thing is doing now (coming at it, running, close, noisy, striking it).
//   glance      a short gaze shift to a peripheral item, scaled to salience: flick (an eye and a twitch of the head) < tilt (head
//               cocked toward it) < look (head up and round, the activity paused) < interrupt (the activity broken off). The
//               motion engine honours it over whatever the behaviour wants to look at, except while it is handling you.
//   respond()   what a thought about a non-focus item gets: a glance, or (salience below what the activity is worth) a
//               disregard: a flick and a thought that carries the weighing ("small thing. eat first").
// Deterministic: its own random stream, no effect on the mind's.
import { makeRng, clamp } from '../math.js';
import { isBright, isByTarget } from './props.js';

const ATTACKS = ['butt', 'swipe', 'pin', 'seize', 'toy'];
// how much the current activity holds it: a glance needs at least this salience, below half of it the item is disregarded
const ABSORB = { feed: 0.42, hunt: 0.5, besiege: 0.5, chase: 0.85, pounce: 0.9, prowl: 0.7, investigate: 0.35, trail: 0.35, answer: 0.6, bluff: 0.8, snap: 0.9 };
const LEVELS = { flick: 0.35, tilt: 0.7, look: 1.5, interrupt: 2.6 };
// behaviours with nothing particular in view: focus is whatever captured it
const IDLE = new Set(['roam', 'pause', 'sniff', 'leave', 'rest']);
ABSORB.probe = 0.6;      // (the core: asking it with its body holds the head on it; out/platform/CORE.md)

export class Attention {
  constructor(mind, seed = 1) {
    this.m = mind; this.R = makeRng(seed * 7919 + 17);
    this.focus = null; this.capture = null; this.items = new Map(); this.glance = null; this.world = null;
    this.lastAuto = new Map(); this.lastDis = new Map(); this.log = [];
  }
  /** The key of the current focus (null: nothing in particular). */
  focusKey() { return this.focus; }
  _behFocus() {
    const m = this.m, b = m.beh; if (!b) return null;
    const n = b.name;
    if (n === 'hunt') return 'prey:' + b.id;
    if (n === 'feed' && b.sub === 'guard') return 'you';      // standing over its meal, eyes on you
    if (n === 'feed' || n === 'trail' || n === 'investigate') return b.obj != null ? 'obj:' + b.obj : m.focus ? 'obj:' + m.focus.id : null;
    if (n === 'answer') return 'self';
    if (IDLE.has(n)) return undefined;      // nothing of its own
    return 'you';
  }
  /** Where an item is now (null: nowhere it knows of). */
  pos(key) {
    const m = this.m, W = this.world || {};
    if (!key || key === 'self') return null;
    if (key === 'you') {
      const K = m.know, a = K.target;
      if (K.seen && a) return { x: a.x, y: a.y ?? m.T.height(a.x, a.z) + 1.5, z: a.z };
      if (m.sum && m.sum.cert > 0.1) return { x: m.sum.x, y: m.T.height(m.sum.x, m.sum.z) + 1.2, z: m.sum.z };
      if (K.last) return { x: K.last.x, y: m.T.height(K.last.x, K.last.z) + 1.2, z: K.last.z };
      return null;
    }
    if (key === 'sound') { const n = m.mem.lastNoise; return n ? { x: n.x, y: m.T.height(n.x, n.z) + 1, z: n.z } : null; }
    const [k, id] = key.split(':');
    if (k === 'prey') { const q = (W.prey || []).find((p) => String(p.id) === id) || (m.prey && String(m.prey.id) === id ? m.prey : null); return q ? { x: q.x, y: (q.y ?? m.T.height(q.x, q.z)) + 1, z: q.z } : null; }
    if (k === 'obj') { const o = (W.things || []).find((t) => String(t.id) === id) || (m.focus && String(m.focus.id) === id ? m.focus : null); return o ? { x: o.x, y: (o.y ?? m.T.height(o.x, o.z)) + 0.3, z: o.z } : null; }
    return null;
  }
  /** How strongly an item pulls at it right now (0..1). */
  salience(key) { if (key === this.focus) return 1; const e = this.items.get(key); return e ? e.sal : 0; }
  _absorb() {
    const m = this.m, b = m.beh; if (!b) return 0.2;
    if (ATTACKS.includes(b.name) || m._handling()) return 2;      // nothing takes its head off what it holds
    let a = ABSORB[b.name] ?? (IDLE.has(b.name) ? 0.12 : 0.3);
    if (b.name === 'hunt' && b.phase === 'rush') a = 0.85;
    if (b.name === 'feed' && b.phase === 'go') a = 0.3;
    // aroused by its target (the prey reflex, appraise.js), it is hard to take its eyes off it
    if (this._behFocus() === 'you' && m.ap && m.ap.arousal > 0) a += (m.cfg ? m.cfg.prey.absorb : 0.5) * m.ap.arousal;
    return a;
  }
  /** Each tick: focus, peripheral saliences, and a glance of its own when something jumps out. */
  update(world) {
    const m = this.m, t = m.t, K = m.know, c = m.ctx || {};
    this.world = world;
    let f = this._behFocus();
    if (f === undefined) f = this.capture && t < this.capture.until ? this.capture.key : null;
    else if (f !== null) this.capture = null;
    // a glance that broke off the activity has taken the attention with it, while it lasts
    if (this.glance && this.glance.level === 'interrupt' && t <= this.glance.until) f = this.glance.key;
    this.focus = f;
    // peripheral items and their salience
    const it = new Map();
    if (K.seen && K.target) {
      const d = c.d ?? 99, ap = clamp(c.approach || 0, 0, 1), run = c.running ? 1 : 0, nT = m.mem.lastNoise && Math.hypot(m.mem.lastNoise.x - K.target.x, m.mem.lastNoise.z - K.target.z) < 6 ? t - m.mem.lastNoise.t : 99;
      let s = 0.1 + 0.35 * ap + 0.25 * run * (ap > 0.3 ? 1.4 : 0.6) + (d < 12 ? 0.3 : d < 25 ? 0.15 : 0) + (nT < 2 ? 0.3 : 0) + (t - m.hitAt < 3 && m.lastHit && isByTarget(m.lastHit.by, K.target) ? 0.6 : 0);
      if (m.mem.stoneSeen && t - m.mem.stoneSeen.t < 2) s += 0.3;
      it.set('you', clamp(s, 0, 1));
    } else if (m.sum && m.sum.cert > 0.2 && t - K.lastSeenT < 120) it.set('you', 0.05 + 0.1 * m.sum.cert);
    if (m.prey) it.set('prey:' + m.prey.id, clamp(0.1 + 0.25 * m.hunger + (m.prey.state === 'flee' ? 0.2 : 0), 0, 1));
    if (m.focus && m.focus.id != null) { const br = isBright(m.focus); it.set('obj:' + m.focus.id, clamp(0.15 + 0.35 * m.hunger * (br ? 0.3 : 1) + (br ? 0.25 : 0), 0, 1)); }
    const n = m.mem.lastNoise; if (n && t - n.t < 1.5) it.set('sound', clamp(0.25 + (n.loud || 0.3), 0, 1));
    this.items.clear();
    for (const [k, s] of it) if (k !== f) this.items.set(k, { sal: s });
    // a peripheral thing jumping above what the activity is worth turns the head by itself (no thought needed to look)
    // (a change: it rising past what the activity is worth, or jumping; a steady thing gets the scans, not a glance each time)
    const ab = this._absorb(), prev = this.prevSal || new Map();
    for (const [k, e] of this.items) {
      const p0 = prev.get(k) ?? 0, rose = (e.sal >= ab && p0 < ab) || e.sal - p0 > 0.25;
      if (rose && e.sal >= ab * 0.8 && t - (this.lastAuto.get(k) ?? -99) > 3) { this.lastAuto.set(k, t); this._glance(k, e.sal >= ab + 0.3 ? 'interrupt' : e.sal >= ab ? 'look' : 'tilt'); }
    }
    this.prevSal = new Map([...this.items].map(([k, e]) => [k, e.sal]));
    if (this.glance && t > this.glance.until) this.glance = null;
  }
  _glance(key, level, hold = null) {
    const t = this.m.t, cur = this.glance;
    // (hold: how long this look lasts, when the caller knows: the orienting reflex for a thing, mind._orientObj)
    if (cur && cur.key === key && t < cur.until && LEVELS[cur.level] >= LEVELS[level]) { if (hold !== null) cur.until = Math.max(cur.until, t + hold); return cur; }
    if (cur && cur.key !== key && t < cur.until && LEVELS[cur.level] > LEVELS[level] && cur.level !== 'flick') return null;      // busy looking at something that matters more
    const p = this.pos(key); if (!p) return null;
    this.glance = { key, level, at: t, until: t + (hold !== null ? hold : LEVELS[level] * this.R.range(0.85, 1.25)), x: p.x, y: p.y, z: p.z };
    this.log.push({ t, key, level }); if (this.log.length > 40) this.log.shift();
    // far round: the head snaps round to it (the orienting gesture) rather than drifting
    // (and the mind is told where the head went, as for any orienting turn, so what it says it is looking at is that thing)
    if ((level === 'interrupt' || level === 'look') && this.m.sim.gesture && this._off(p) > 1.0 && this.m.sim.gesture('orient', p)) this.m.orientTo = { x: p.x, y: p.y, z: p.z, t, sal: this.items.get(key)?.sal ?? 0.5, kind: 'glance', key };
    return this.glance;
  }
  /** How far off the head's line a point is (radians, horizontal). */
  _off(p) { const h = this.m.sim.head, a = Math.atan2(p.x - h.pos.x, p.z - h.pos.z) - Math.atan2(h.f.x, h.f.z); return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))); }
  /** A thought about `key` is about to be said with urgency `pri` (0..1): 'focus' (it is the focus, or itself), 'glance' (the
   *  body responds: the head goes to it), 'disregard' (noticed, the activity matters more: a flick and the weighing said), or
   *  'drop' (not worth a thought now). */
  respond(key, pri) {
    const m = this.m, t = m.t;
    if (!key || key === 'self') return 'focus';
    if (key === this.focus) {
      // a thought about the focus brings the eyes back to it; a passing one waits while it is glancing elsewhere
      const g = this.glance;
      if (g && g.key !== key && t <= g.until) { if (pri < 0.85) return 'wait'; if (g.level !== 'interrupt' || t - g.at > 0.6) this.glance = null; }
      const p = this.pos(key);
      if (p && this._off(p) > 1.2 && pri < 0.85) return 'wait';      // its head is elsewhere: the thought waits until it is back
      return 'focus';
    }
    // things it is not attending to are thought about rarely: one now and then, unless it matters
    if (t - (this.lastNF ?? -99) < 5 && pri < 0.85) return 'drop';
    this.lastNF = t;
    if (!this.pos(key)) return key === 'you' ? 'drop' : 'focus';
    const ab = this._absorb(), sal = Math.max(this.salience(key), pri >= 0.9 ? 0.55 : pri >= 0.8 ? 0.4 : pri >= 0.6 ? 0.25 : 0.1);
    if (ab >= 2) return pri >= 0.85 ? this._dis(key) : 'drop';
    // nothing in particular in view: the thing captures it (it becomes the focus) and the head goes to it
    if (this.focus === null && key !== 'sound') { this.capture = { key, until: t + 6 }; this.focus = key; this._glance(key, sal > 0.5 || this._off(this.pos(key)) > 1.2 ? 'look' : 'tilt'); return 'capture'; }
    if (sal >= ab) return this._glance(key, sal >= ab + 0.3 ? 'interrupt' : 'look') ? 'glance' : this._dis(key);
    // a mild pull from something far round: an eye goes to it, the head stays (a disregard), not a turn of the whole head
    if (sal >= ab * 0.6) return this._off(this.pos(key)) < 1.3 && this._glance(key, 'tilt') ? 'glance' : this._dis(key);
    if (pri < 0.5) return 'drop';      // a passing musing about something it is not attending to: not had at all
    return this._dis(key);
  }
  _dis(key) {
    const t = this.m.t;
    if (t - (this.lastDis.get(key) ?? -99) < 10) return 'drop';
    this.lastDis.set(key, t); this._glance(key, 'flick'); return 'disregard';
  }
  /** The gaze target the body must honour now (null: the behaviour's own). */
  gaze() {
    const g = this.glance, m = this.m; if (!g || m.t > g.until) return null;
    const p = this.pos(g.key); if (p) { g.x = p.x; g.y = p.y; g.z = p.z; }
    return { x: g.x, y: g.y, z: g.z, lock: g.level !== 'flick', tilt: g.level === 'tilt', glance: g.level, key: g.key };
  }
  /** Glancing at something other than what the activity is about, at `level` or above. */
  glancing(level = 'tilt') { const g = this.glance; return g && this.m.t <= g.until && LEVELS[g.level] >= LEVELS[level] ? g : null; }
  /** The most salient peripheral item (for divided attention: where scans and glances go). */
  top() { let best = null, bs = 0; for (const [k, e] of this.items) if (e.sal > bs) { bs = e.sal; best = k; } return best ? { key: best, sal: bs, pos: this.pos(best) } : null; }
}
