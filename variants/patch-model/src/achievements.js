// Achievements: things done while sharing a paddock with a large, intelligent predator.
// Nothing here asks anything of the player or steers the animal: every detector reads simulation state and
// events (arena.events, mind, sim, terrain, the person's body) and the player is simply told, afterwards.
// Every detector tolerates a missing signal (an event the sim does not emit simply never fires).
// Saved progress: localStorage 'dh.achv' ({ v: 2, done: [ids] }); the ids of the old "dares" are kept, and the
// old key 'dh.dares' is read once if there is nothing under the new one.
const hyp = (a, b) => Math.hypot(a, b);

// Each one: a short title and a plain line saying what was done (shown when it is earned). Locked ones are listed by title alone; secret
// ones are only counted. tier orders the list (easy / mid / rare / secret).
export const ACHIEVEMENTS = [
  { id: 'boop', tier: 'easy', title: 'Contact', story: 'Let it nose you without being hurt.' },
  { id: 'moth', tier: 'easy', title: 'Drawn to Light', story: 'Draw it to a flare you threw.' },
  { id: 'steal', tier: 'easy', title: 'Light Fingers', story: 'Take meat from beside its jaws.' },
  { id: 'hand', tier: 'easy', title: 'Fed', story: 'Have it eat meat you brought.' },
  { id: 'bowled', tier: 'easy', title: 'Knocked Down', story: 'Be knocked down by it.' },
  { id: 'roar', tier: 'mid', title: 'Roared At', story: 'Be roared at from close range.' },
  { id: 'stare', tier: 'mid', title: 'Held Gaze', story: 'Hold its gaze until it looks away.' },
  { id: 'ground', tier: 'mid', title: 'Stood Firm', story: 'Make it give ground.' },
  { id: 'tail', tier: 'mid', title: 'Tag', story: 'Touch its tail and get 20 m clear.' },
  { id: 'overlooked', tier: 'mid', title: 'Unseen', story: 'Let it pass close by without seeing you.' },
  { id: 'decoy', tier: 'mid', title: 'Decoy', story: 'Send it after a thrown stone.' },
  { id: 'door', tier: 'mid', title: 'At the Door', story: 'Be in the shed when it looks in.' },
  { id: 'bunker', tier: 'mid', title: 'Siege', story: 'Sit out a siege in the shed.' },
  { id: 'held', tier: 'mid', title: 'Put Down', story: 'Be picked up and set down again.' },
  { id: 'memo', tier: 'mid', title: 'Remembered', story: 'Be found where you hid before.' },
  { id: 'front', tier: 'mid', title: 'Witness', story: 'See it make a kill.' },
  { id: 'ghost', tier: 'rare', title: 'Lost Track', story: 'Stay lost to it for a full minute.' },
  { id: 'dead', tier: 'rare', title: 'Still', story: 'Lie still until it loses interest.' },
  { id: 'slip', tier: 'rare', title: 'Slipped Free', story: 'Break out of its hold.' },
  { id: 'wised', tier: 'rare', title: 'Learned', story: 'Have it see through a decoy.' },
  { id: 'breakout', tier: 'rare', title: 'Breakout', story: 'Slip away from a siege unseen.' },
  { id: 'tossed', tier: 'rare', title: 'Thrown', story: 'Be thrown.' },
  { id: 'menu', tier: 'mid', title: 'Prey', story: 'Be hunted.' },
  { id: 'bribe', tier: 'mid', title: 'Bought Off', story: 'Have it take meat instead of you.' },
  { id: 'perch', tier: 'mid', title: 'Out of Reach', story: 'Stay in its sight where it cannot reach you.' },
  { id: 'spat', tier: 'rare', title: 'Rejected', story: 'Be tasted and let go.' },
  { id: 'died', tier: 'rare', title: 'Killed', story: 'Die.' },
  { id: 'eaten', tier: 'secret', title: 'Eaten', story: 'Be eaten.' },
  { id: 'nose', tier: 'secret', title: 'Under Its Nose', story: 'Take meat it is eating.' },
  { id: 'fullset', tier: 'secret', title: 'Everything', story: 'Be knocked down, pinned, picked up and thrown in one encounter.' },
  { id: 'thunder', tier: 'secret', title: 'Answer', story: 'Hear it roar back at thunder.' },
];
const TIER_ORDER = { easy: 0, mid: 1, rare: 2, secret: 3 };
const CALM = new Set(['stare', 'watch', 'pause', 'inspect', 'listen', 'sniff', 'nudge', 'feign', 'roam', 'revisit', 'search', 'investigate', 'leave', 'backoff']);
const HOT = new Set(['chase', 'snap', 'bluff', 'display', 'stalk', 'hunt']);
const ATTACK = new Set(['butt', 'swipe', 'pin', 'seize', 'toy']);

export class Achievements {
  /** ctx: { sim, mind, terrain, things, arena }; opts: { onDone(a, n, total) } */
  constructor(ctx, opts = {}) {
    this.c = ctx; this.opts = opts; this.done = new Set(); this.t = 0; this.st = {};
    this.load();
    this.reset(false);
  }
  load() {
    try {
      const raw = localStorage.getItem('dh.achv');
      if (raw) for (const id of JSON.parse(raw).done || []) this.done.add(id);
      else for (const id of JSON.parse(localStorage.getItem('dh.dares') || '[]')) this.done.add(id);
    } catch {}
    for (const id of [...this.done]) if (!ACHIEVEMENTS.some((a) => a.id === id)) this.done.delete(id);
  }
  reset(clear = true) {
    if (clear) { this.done.clear(); this._save(); try { localStorage.removeItem('dh.dares'); } catch {} }
    const m = this.c.mind;
    this.st = {
      tailT: -1, stare: 0, stareGap: 0, stareBroke: 0, lost: 0, wasSeen: false, heldAt: -1, doorT: 0, bootT: 0, groundT: 0,
      moth: 0, over: 0, sgEp: 0, sgLast: -999, brk: 0, lastAtk: -999, lastHandled: -999, last: {},
      decoyArm: -999, decoys: m ? m.mem.decoys : 0, decoyT: m && m.decoyT !== undefined ? m.decoyT : -999, found: m && m.foundAtMemo !== undefined ? m.foundAtMemo : -999,
      lastBusy: 0, px: null, pz: null,
    };
  }
  _save() { try { localStorage.setItem('dh.achv', JSON.stringify({ v: 2, done: [...this.done] })); } catch {} }
  get count() { return this.done.size; }
  get total() { return ACHIEVEMENTS.length; }
  has(id) { return this.done.has(id); }
  complete(id) {
    if (this.done.has(id)) return false;
    const a = ACHIEVEMENTS.find((x) => x.id === id); if (!a) return false;
    this.done.add(id); this._save(); this.st.lastBusy = this.t;
    if (this.opts.onDone) this.opts.onDone(a, this.done.size, ACHIEVEMENTS.length);
    return true;
  }
  /** For the list: earned first (in the order earned), then the rest from easiest; secret ones not yet earned are counted, not named. */
  listing() {
    const earned = [...this.done].map((id) => ACHIEVEMENTS.find((a) => a.id === id)).filter(Boolean);
    const locked = ACHIEVEMENTS.filter((a) => !this.done.has(a.id) && a.tier !== 'secret').sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
    const secrets = ACHIEVEMENTS.filter((a) => !this.done.has(a.id) && a.tier === 'secret').length;
    return { earned, locked, secrets };
  }


  // ---------------------------------------------------------------- events
  /** Offer an event from the arena (call once per event). `you` is the player's position or null. */
  event(e, you) {
    const { sim, mind, things } = this.c, S = this.st, mine = (x) => !x || x === 'you';
    if (e.src === 'victim') {
      if (!mine(e.id)) return;
      S.lastHandled = this.t;
      if (e.type === 'death') this.complete(e.cause === 'eaten' ? 'eaten' : 'died');
      if (e.type === 'knocked') { this.complete('bowled'); S.last.knocked = this.t; }
      else if (e.type === 'pinned') S.last.pinned = this.t;
      else if (e.type === 'seized') { S.heldAt = this.t; S.last.seized = this.t; }
      else if (e.type === 'tossed') { this.complete('tossed'); S.last.tossed = this.t; }
      if (e.type === 'dropped' || e.type === 'slipped' || e.type === 'tossed') { if (S.heldAt >= 0) this.complete('held'); S.heldAt = -1; }
      if (e.type === 'slipped' || e.type === 'wriggled') this.complete('slip');
      const L = S.last; if (L.knocked !== undefined && L.pinned !== undefined && L.seized !== undefined && L.tossed !== undefined && Math.max(L.knocked, L.pinned, L.seized, L.tossed) - Math.min(L.knocked, L.pinned, L.seized, L.tossed) < 180) this.complete('fullset');
      return;
    }
    if ((e.type === 'bite' || e.type === 'tear') && e.src !== 'victim') {
      const o = things.get(e.id);
      if (o && o.kind === 'meat' && o.by === 'you') this.complete('hand');      // thrown, dropped or held out: it took what you brought
    } else if (e.type === 'handfed' && e.src === 'mind') this.complete('hand');
    else if (e.type === 'roar') {
      const near = you ? hyp(you.x - sim.head.pos.x, you.z - sim.head.pos.z) : 99;
      if (mind.label === 'answer' && mind.thunder && mind.t - mind.thunder.t < 12 && near < 90) this.complete('thunder');
      // its own roar (the debug button does not set lastRoar), at you, with you in front of it
      else if (you && mind.lastRoar !== undefined && mind.t - mind.lastRoar < 0.6) {
        const h = sim.head, dx = you.x - h.pos.x, dz = you.z - h.pos.z, d = hyp(dx, dz) || 1, fwd = (h.f.x * dx + h.f.z * dz) / (d * (hyp(h.f.x, h.f.z) || 1));
        if (d < 30 && (fwd > 0.55 || d < 7)) this.complete('roar');
      }
    } else if (e.type === 'nudge' && you && mind.know.target && mind.know.target.id === 'you') this.complete('boop');
    else if (e.type === 'kill' && e.src === 'mind') {
      const d = hyp(e.x - sim.x, e.z - sim.z), d2 = you ? hyp(e.x - you.x, e.z - you.z) : 0;
      if (d < 90 && d2 < 90) this.complete('front');
    } else if (e.type === 'impact' && e.kind === 'stone' && e.first && you) {
      const o = things.get(e.id);
      if (o && o.by === 'you' && !o.hitRex && hyp(e.x - you.x, e.z - you.z) > 12) S.decoyArm = this.t;
    }
  }

  /** The player took a piece of meat (call before it is removed, so what the animal was doing is still readable). */
  took(o) {
    const { sim, mind } = this.c, h = sim.head.pos;
    if (hyp(h.x - o.x, h.z - o.z) < 6 && Math.abs(h.y - o.y) < 6) {
      this.complete('steal');
      if (mind.focus && mind.focus.id === o.id && mind.label === 'feed') this.complete('nose');
    }
  }

  // ---------------------------------------------------------------- per frame
  /** you: { x, y, z, fx, fy, fz (look direction) } when on foot, else null. */
  update(dt, you) {
    this.t += dt; const { sim, mind, terrain, arena } = this.c, S = this.st, h = sim.head.pos, K = mind.know, label = mind.label;
    const V = arena && arena.victims ? arena.victims.get('you') : null, free = !V || V.state === 'free';
    if (ATTACK.has(label)) S.lastAtk = this.t;
    // what it made of you (appraise.js): weighed up as food, tasted and refused, bought off with meat
    const ap = mind.ap;
    if (ap) {
      if (ap.last && ap.last !== S.apLast) { S.apLast = ap.last; if (ap.last.kind === 'taste-spat') this.complete('spat'); }
      if (S.bought === undefined) S.bought = ap.boughtOff; else if (ap.boughtOff > S.bought) { S.bought = ap.boughtOff; this.complete('bribe'); }
      if (mind.stance === 'predatory' && K.seen && K.target && K.target.id === 'you') { S.menuT = (S.menuT || 0) + dt; if (S.menuT > 6) this.complete('menu'); } else S.menuT = 0;
    }
    if (K.seen && K.target && K.target.id === 'you') S.wasSeen = true;

    // what it has learnt of your tricks: read straight from its memory
    if (mind.mem.decoys > S.decoys) { if (this.t - S.decoyArm < 60) this.complete('decoy'); S.decoys = mind.mem.decoys; }
    if (mind.decoyT !== undefined && mind.decoyT !== S.decoyT) { S.decoyT = mind.decoyT; if (mind.decoyHow === 'traced' || mind.decoyHow === 'ignored') this.complete('wised'); }
    if (mind.foundAtMemo !== undefined && mind.foundAtMemo !== S.found) { S.found = mind.foundAtMemo; if (mind.t - mind.foundAtMemo < 5) this.complete('memo'); }

    if (!you) { S.stare = 0; S.tailT = -1; S.moth = 0; S.over = 0; return; }
    const dRex = hyp(you.x - sim.x, you.z - sim.z), L = sim.species.dims.headLen, hf = sim.head.f;
    const tip = { x: h.x + hf.x * L, y: h.y + hf.y * L, z: h.z + hf.z * L };       // the end of its snout
    const dTip = Math.hypot(you.x - tip.x, Math.max(0, tip.y - you.y - 0.1, you.y - 1.7 - tip.y), you.z - tip.z);      // from the snout to your body (feet to eye)
    S.px = you.x; S.pz = you.z;

    // tag: touch the tail (capsule chain along the spine), then be 20 m clear
    if (!this.done.has('tail')) {
      let near = 99;
      for (let i = 1; i < 11; i++) {
        const a = sim.spine[i].p, b = sim.spine[i + 1].p, rad = 0.18 + 0.75 * (i / 12), ax = b.x - a.x, az = b.z - a.z, L2 = ax * ax + az * az || 1;
        const t = Math.max(0, Math.min(1, ((you.x - a.x) * ax + (you.z - a.z) * az) / L2)), y = a.y + (b.y - a.y) * t;
        if (y > you.y - 2.6 && y < you.y + 1.55) near = Math.min(near, hyp(you.x - (a.x + ax * t), you.z - (a.z + az * t)) - rad);
      }
      if (near < 0.75 && S.tailT < 0) S.tailT = this.t;
      if (S.tailT >= 0) { if (dRex > 20) this.complete('tail'); else if (this.t - S.tailT > 40) S.tailT = -1; }
    }

    // staring contest: mutual gaze; won when it breaks off first (or nobody blinks for 25 s)
    if (!this.done.has('stare')) {
      const dx = h.x - you.x, dy = h.y - you.y, dz = h.z - you.z, d = Math.hypot(dx, dy, dz) || 1;
      const mine = (you.fx * dx + you.fy * dy + you.fz * dz) / d, hf = sim.head.f, its = -(hf.x * dx + hf.y * dy + hf.z * dz) / d;
      const mutual = K.seen && K.target && K.target.id === 'you' && d < 45 && mine > 0.985 && !HOT.has(label);
      const itLooks = its > 0.9;
      if (mutual && itLooks) { S.stare += dt; S.stareGap = 0; S.stareBroke = 0; if (S.stare > 25) this.complete('stare'); }
      else if (S.stare > 5 && mine > 0.97 && !itLooks) { S.stareBroke += dt; if (S.stareBroke > 0.6) { this.complete('stare'); S.stare = 0; } }
      else { S.stareGap += dt; if (S.stareGap > 1.2) { S.stare = 0; S.stareBroke = 0; } }
    }

    // ghost: it saw you once; now it has lost you for a full minute
    if (!this.done.has('ghost') && S.wasSeen) {
      const wrong = mind.sum.cert < 0.35 || hyp(mind.sum.x - you.x, mind.sum.z - you.z) > 15;      // no idea, or sure of the wrong place
      if (!K.seen && wrong && dRex > 12) { S.lost += dt; if (S.lost > 60) this.complete('ghost'); }
      else if (K.seen) S.lost = 0; else S.lost = Math.max(0, S.lost - dt * 0.5);
    }

    // inside a structure: the shed's door, a siege sat out, a siege left behind
    const sh = terrain.insideStructure ? terrain.insideStructure(you.x, you.z, you.y) : null;
    if (!this.done.has('door')) {
      if (sh && sh.kind === 'shed') {
        const o = sh.openings[0], dd = o ? Math.hypot(tip.x - o.x, tip.z - o.z) : 99, inside = terrain.insideStructure(tip.x, tip.z, tip.y);
        if ((dd < 1.2 || (inside && inside.id === sh.id)) && tip.y < sh.base + sh.h + 0.5) { S.doorT += dt; if (S.doorT > 0.5) this.complete('door'); } else S.doorT = Math.max(0, S.doorT - dt);
      } else S.doorT = 0;
    }
    if (sh && label === 'besiege' && free) { S.sgEp += dt; S.sgLast = this.t; if (S.sgEp > 45) this.complete('bunker'); }
    else if (this.t - S.sgLast > 90) S.sgEp = 0;
    if (!this.done.has('breakout') && S.sgEp >= 30 && !sh && free && this.t - S.sgLast < 90) {
      if (dRex > 25 && !K.seen && (mind.sum.cert < 0.5 || hyp(mind.sum.x - you.x, mind.sum.z - you.z) > 15)) { S.brk += dt; if (S.brk > 4) this.complete('breakout'); } else S.brk = Math.max(0, S.brk - dt);
    } else if (sh) S.brk = 0;

    // stand your ground: it backs off while you are close and it knows you
    if (!this.done.has('ground')) {
      if (label === 'backoff' && K.seen && dRex < 25) { S.groundT += dt; if (S.groundT > 1.5) this.complete('ground'); } else S.groundT = Math.max(0, S.groundT - dt);
    }

    // boop: its snout against you, and it is not angry
    if (!this.done.has('boop')) {
      if (dTip < 0.7 && !HOT.has(label) && !ATTACK.has(label) && free) { S.bootT += dt; if (S.bootT > 1.5) this.complete('boop'); } else S.bootT = Math.max(0, S.bootT - dt);
    }

    // moth: it goes to look at a flare you threw
    if (!this.done.has('moth')) {
      const f = mind.focus, fo = f && f.kind === 'flare' ? this.c.things.get(f.id) : null;
      if (label === 'investigate' && fo && fo.by === 'you') { S.moth += dt; if (S.moth > 3) this.complete('moth'); } else S.moth = Math.max(0, S.moth - dt);
    }

    // up where it cannot follow, in plain view of it
    if (!this.done.has('perch') && free && K.seen && dRex < 30 && sim.nav && terrain.height(you.x, you.z) - terrain.height(sim.x, sim.z) > 4 && !sim.nav.reachable(sim.x, sim.z, you.x, you.z)) { S.perchT = (S.perchT || 0) + dt; if (S.perchT > 8) this.complete('perch'); } else S.perchT = 0;

    // walked past: right beside you, moving, and it does not see you (not for being walled in)
    if (!this.done.has('overlooked')) {
      if (!sh && !K.seen && mind.sum.cert < 0.5 && dRex < 7 && Math.abs(sim.v) > 1.0 && free) { S.over += dt; if (S.over > 2.5) this.complete('overlooked'); } else S.over = Math.max(0, S.over - dt * 2);
    }

    // playing dead: you were handled, it had been at you, and now you lie still and it has lost interest
    if (!this.done.has('dead') && V && (V.state === 'down' || V.state === 'rising')) {
      if (V.still > 7 && this.t - S.lastAtk > 4 && this.t - S.lastAtk < 120 && this.t - S.lastHandled < 120 && dRex < 40) this.complete('dead');
    }
  }

}
