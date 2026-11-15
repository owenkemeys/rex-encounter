// The thought stream (src/sim/thoughts.js), read as the player would read the bubble.
//   node test/thoughts.mjs [run|all] [seed] [--quiet]
// Plays the existing scripted encounters (mind.mjs, stim.mjs, siege.mjs, attack.mjs) plus a few of its own (hiding behind
// the same rock, stone decoys, the culvert's two ends), prints every thought with its time and what the animal was doing,
// counts distinct thoughts and the repeat rate, and checks every thought against the live state: its trigger condition
// (recomputed here from the mind's raw state, within the few seconds before it was said), two to five plain words, no
// numbers, no "because". Each run is a child process so the other scripts can be imported unchanged.
import { covers } from './hidecover.mjs';
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';
import { placeWord } from '../src/sim/thoughts.js';

const HERE = fileURLToPath(import.meta.url), dt = 1 / 120, hyp = Math.hypot;
const RUNS = [
  ...['still_open', 'wander_near', 'hide_and_throw', 'run_away', 'approach_it', 'shout_behind'].map((n) => ['mind', n]),
  ...['meat', 'flare', 'herd', 'stones'].map((n) => ['stim', n]),
  ...['shed', 'pen', 'culvert', 'tower', 'cleft'].map((n) => ['siege', n]),
  ...['default', 'stones', 'torch', 'food', 'hungry', 'behind'].map((n) => ['attack', n]),
  ...['hide', 'decoy', 'exit', 'torch', 'follow', 'ignore', 'nearmiss'].map((n) => ['own', n]),
  ...['starving', 'meat', 'stones', 'rival'].map((n) => ['pred', n]),
  ...['wanderer', 'pest', 'runner', 'hider', 'tapper'].map((n) => ['active', n]),
];

// ------------------------------------------------------------------ what is true, tick by tick (read here, not from thoughts.js)
function facts(m) {
  const K = m.know, a = K.target, c = m.ctx || {}, b = m.beh, n = m.mem.lastNoise;
  return {
    t: m.t, seen: !!(K.seen && a), x: a ? a.x : 0, z: a ? a.z : 0, sx: m.sum.x, sz: m.sum.z, cert: m.sum.cert, d: c.d ?? 99,
    running: c.running || 0, approach: c.approach || 0, watched: !!c.watched, encl: c.enclosed ? c.enclosed.kind : null,
    crouch: !!(a && a.crouch), torch: !!(a && a.torch), speed: a ? a.speed : 0, state: a && K.seen ? a.state || 'free' : null, still: a ? a.still || 0 : 0, struggle: a ? a.struggle || 0 : 0,
    noiseT: n ? n.t : -99, nx: n ? n.x : 0, nz: n ? n.z : 0, hitAt: m.hitAt, hitBy: m.lastHit ? m.lastHit.by : null, scent: m.scent, glare: m.glare,
    focus: m.focus ? m.focus.kind : null, prey: !!m.prey, thunderT: m.thunder ? m.thunder.t : -99, stoneT: m.mem.stoneSeen ? m.mem.stoneSeen.t : -99,
    decoyT: m.decoyT ?? -99, decoys: m.mem.decoys, fooled: m.mem.fooled, foundAtMemo: m.foundAtMemo ?? -99, lastSeenT: K.lastSeenT,
    beh: b ? b.name : null, phase: b ? b.phase : null, memo: !!(b && b.memo), traced: !!(b && b.traced), fromSound: !!(b && b.fromSound), memoWait: !!(b && b.memoWait), cut: !!(b && b.cut), landed: !!(b && b.landed), missed: !!(b && b.missed),
    wrongK: m.lastWrong ? m.lastWrong.kind : null, wrongT: m.lastWrong ? m.lastWrong.t : -99, stones: m.wrongs.stones, glareW: m.wrongs.glare, foodW: m.wrongs.food,
    grudge: m.grudge, interest: m.mood.interest, arousal: m.mood.arousal, irritation: m.mood.irritation, boredom: m.mood.boredom, hunger: m.hunger, fatigue: m.sim.exertion,
    closeTime: m.closeTime || 0, motives: K.seen && a ? m._motives(c) : { anger: 0, prey: 0, play: 0 }, sneaky: m.mem.decoys >= 1 || m.mem.spots.some((p) => p.n >= 2), enc: m.mem.encounters,
    via: K.seen ? K.via : null, gait: K.seen ? K.gait || null : null, stepT: m.mem.steps ? m.mem.steps.t : -99, stepFast: !!(m.mem.steps && m.mem.steps.fast), killedT: m.killedT ?? -99, flinchT: m.lastFlinch ?? -99, met: m.kind ? m.kind.met : 0, why: m.ap && m.ap.flags ? m.ap.flags.why : null,
    place: K.seen && a ? placeWord(m.T, a.x, a.z, m.sim) : null, wade: m.T.depthAt ? m.T.depthAt(m.sim.x, m.sim.z) : 0, noReachT: m.mem.noReach ? m.mem.noReach.t : -99, stuckT: m.mem.stuck ? m.mem.stuck.t : -99, gaveT: m.mem.gaveUp ? m.mem.gaveUp.t : -99, hushT: m.mem.hush ? m.mem.hush.t : -99,
    calm: !!(m.wind && m.T.windAt && (() => { const w = m.T.windAt(m.sim.x, m.sim.z, m.wind); return Math.hypot(m.wind.x, m.wind.z) > 1 && Math.hypot(w.x, w.z) < 0.45 * Math.hypot(m.wind.x, m.wind.z); })()),
    meaty: a && K.seen ? a.meaty || 0 : 0, rv: Math.abs(m.sim.v), rx: m.sim.x, rz: m.sim.z,
    radial: a ? ((a.vx || 0) * (a.x - m.sim.x) + (a.vz || 0) * (a.z - m.sim.z)) / (hyp(a.x - m.sim.x, a.z - m.sim.z) || 1) : 0, behind: a ? Math.abs(Math.atan2(Math.sin(Math.atan2(a.x - m.sim.x, a.z - m.sim.z) - m.sim.psi), Math.cos(Math.atan2(a.x - m.sim.x, a.z - m.sim.z) - m.sim.psi))) > 1.8 : false,
    ap: m.ap ? { ...m.ap.flags } : {}, apo: m.ap && m.ap.last ? m.ap.last.kind : null, apoT: m.ap && m.ap.last ? m.ap.last.t : -99, rival: !!(b && b.rival),
  };
}
// one atom of a condition, against one tick (W = the window, i = index of that tick in it, H = running tallies)
const ATOM = {
  seen: (f) => f.seen, memo: (f) => f.t - f.foundAtMemo < 2,
  wrong: (f, W, i) => f.seen && i > 0 && !W[i - 1].seen && W[i - 1].cert > 0.3 && hyp(W[i - 1].sx - f.x, W[i - 1].sz - f.z) > 15,
  right: (f, W, i) => f.seen && i > 0 && !W[i - 1].seen && W[i - 1].cert > 0.3 && hyp(W[i - 1].sx - f.x, W[i - 1].sz - f.z) < 8,
  heard: (f) => f.t - f.noiseT < 3.5, 'seen-elsewhere': (f) => f.seen && hyp(f.nx - f.x, f.nz - f.z) > 10,
  memory: (f, W, i, H) => f.stones > 0 || f.glareW > 1 || f.foodW > 0.5 || H.ran > 0 || H.hid > 0 || f.sneaky || H.shouts > 0 || H.lostOnce,
  lost: (f, W) => !f.seen && W.some((g) => g.seen), running: (f) => f.running > 0, approach: (f) => f.approach > 0.3, crouch: (f) => f.crouch, watched: (f) => f.watched, torch: (f) => f.torch,
  dull: (f) => f.interest < 0.35,
  walking: (f) => f.speed > 0.3, silent: (f) => !f.seen && f.t - f.noiseT > 8,
  inside: (f) => !!f.encl, outside: (f, W) => !f.encl && W.some((g) => g.encl), still: (f) => f.speed < 0.5,
  struggle: (f) => f.struggle > 0.15, limp: (f) => f.still > 2, thunder: (f) => f.t - f.thunderT < 4, scent: (f) => f.scent > 0.05, prey: (f) => f.prey, stone: (f) => f.t - f.stoneT < 3,
  hit: (f) => f.t - f.hitAt < 4, unseen: (f) => !f.seen, glare: (f) => f.glare > 0.3, decoy: (f) => f.t - f.decoyT < 4,
  'learnt-decoy': (f, W) => W.some((g) => g.decoys < f.decoys), 'search-empty': (f, W) => !f.seen && W.some((g) => g.fooled < f.fooled - 0.05),
  traced: (f) => f.traced, rival: (f) => f.rival, sound: (f) => f.fromSound, cut: (f) => f.beh === 'chase' && f.cut, landed: (f) => f.landed, missed: (f) => f.missed,
  eye: (f) => f.via === 'sight', near: (f) => f.seen && f.via === 'near', hearrun: (f) => f.gait === 'run', fast: (f) => f.stepFast && f.t - f.stepT < 3, kill: (f) => f.t - f.killedT < 6,
  newcomer: (f) => f.met >= 2 && f.enc <= 1, fed: (f) => f.hunger < 0.5,
  noreach: (f) => f.t - f.noReachT < 5, stuck: (f) => f.t - f.stuckT < 5, gaveup: (f) => f.t - f.gaveT < 5, hush: (f) => f.t - f.hushT < 5, curious: (f) => f.interest > 0.28, close: (f) => f.d < 20, grudge: (f) => f.grudge > 0.25, stones: (f) => f.stones > 0, calm: (f) => f.closeTime > 25,
  follow: (f) => f.seen && f.speed > 0.5 && f.rv > 0.4 && f.behind && f.d < 32, unwatched: (f) => f.seen && !f.watched, retreat: (f) => f.radial > 0.5 && f.watched, leaving: (f) => f.radial > 0.8 && !f.watched,
  meaty: (f) => f.meaty > 0.25, torchoff: (f, W) => !f.torch && W.some((g) => g.torch), blink: (f, W, i, H) => !f.torch && H.torchOn.filter((x) => f.t - x < 18).length >= 2, uptower: (f) => f.encl === 'tower',
  nearmiss: (f) => hyp(f.nx - f.rx, f.nz - f.rz) < 8.5 && f.t - f.noiseT < 3.5,
  ran: (f, W, i, H) => H.ran >= 2, sneaky: (f) => f.sneaky, irritated: (f) => f.irritation > 0.3, hunger: (f) => f.hunger > 0.65, tired: (f) => f.fatigue > 0.5, flinch: (f) => f.t - f.flinchT < 3.5, riled: (f) => Math.min(f.t - f.wrongT, f.t - f.hitAt) < 14, again: (f, W, i, H) => H.missT.filter((x) => f.t - x < 95).length >= 2 || H.emptyT.filter((x) => f.t - x < 95).length >= 2, bored: (f) => f.boredom > 0.5,
};
function holds(cond, W, H) {
  const [head, rest] = cond.split(':');
  const one = (f, i) => {
    if (head === 'beh') { const [nm, ...mods] = rest.split('+'); return f.beh === nm && mods.every((k) => k === 'memo' ? f.memo : ATOM[k](f, W, i, H)); }
    if (head === 'phase') { const [nm, ph] = rest.split('/'); return f.beh === nm && f.phase === ph; }
    if (head === 'state') return f.state === rest || (rest === 'free' && !f.seen);
    if (head === 'focus') return rest === 'food' ? f.focus === 'meat' || f.focus === 'carcass' : f.focus === rest;
    if (head === 'belief') return !f.seen && (rest === 'sure' ? f.cert > 0.4 : rest === 'maybe' ? f.cert > 0.15 : f.cert < 0.3);
    if (head === 'motive') return f.motives[rest] > (rest === 'anger' ? 0.3 : rest === 'prey' ? 0.2 : 0.25);
    if (head === 'wrong') return f.wrongK === rest && f.t - f.wrongT < 4;
    if (head === 'ap') return rest.split('+').every((k) => !!f.ap[k]);
    if (head === 'why') return f.why === rest;
    if (head === 'place') return f.seen && f.place === rest;
    if (head === 'self') return rest === 'wade' ? f.wade > 0.3 : rest === 'calm' ? f.calm : false;
    if (head === 'apo') return f.apo === rest && f.t - f.apoT < 5;
    if (cond === 'besiege+memo') return f.beh === 'besiege' && f.memoWait;
    if (cond === 'chase+cut') return ATOM.cut(f);
    return cond.split('+').every((k) => { if (!ATOM[k]) throw new Error('no check for ' + k + ' in ' + cond); return ATOM[k](f, W, i, H); });
  };
  return W.some((f, i) => one(f, i));
}
// words that claim something about the world: the run so far must contain it (landmarks like "behind rock" are places, not claims)
const LEX = [
  [/\brock\b/, (f, H) => H.rock], [/\bmeat\b|\beat\b|food|belly|chew|hungry/, (f, H) => H.food || f.hunger > 0.45 || H.ap], [/light|bright/, (f, H) => H.light],
  [/\b(box|pipe|walls|sticks|high floor)\b/, (f, H) => H.struct], [/sky/, (f, H) => H.sky], [/smell/, (f, H) => H.smell || H.near || f.beh === 'sniff' || f.beh === 'trail' || f.ap.blood],
  [/\bmouth\b|\bkick\b|wriggle|under foot/, (f, H) => H.handled], [/blood|bleed|limp|dead/, (f, H) => H.hurt || f.t - f.killedT < 30 || ['down', 'held', 'pinned', 'dead'].includes(f.state)], [/\bfly\b/, (f, H) => H.fly],
];
// its own felt states (tiredness, fullness, boredom, its body in the place), as against thoughts about you
const FELT = /^(muse:(tired|hunger|bored|idle|eat)|wade|calm|spent|winded|full|riled)$/;
const NUM = /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|many|few)\b/i, ABSTRACT = /\b(because|therefore|so that|reason|think that|idea|danger|threat|territory|safe)\b/i;

// ------------------------------------------------------------------ child: run one encounter with the stream tapped
async function child(src, name, seed) {
  const out = { lines: [], thoughts: [], bad: [] }, log = console.log;
  const tap = new WeakMap();
  const orig = Mind.prototype.step;
  Mind.prototype.step = function (d, world) {
    const I = orig.call(this, d, world);
    let S = tap.get(this); if (!S) { S = { W: [], n: 0, lastLab: '', H: { ran: 0, hid: 0, shouts: 0, lostOnce: false, torchOn: [], missT: [], emptyT: [] }, prev: null }; tap.set(this, S); }
    if (this.acc === 0) {
      const f = facts(this), p = S.prev; S.prev = f;
      if (p) { if (f.seen && p.seen && f.running && !p.running && f.state === 'free') S.H.ran++; if (f.seen && p.seen && f.encl && !p.encl) S.H.hid++; if (f.noiseT > p.noiseT && this.mem.lastNoise.kind === 'shout') S.H.shouts++; if (p.seen && !f.seen) S.H.lostOnce = true;
        if (f.torch && !p.torch) S.H.torchOn.push(f.t);
        if (f.missed && !p.missed) S.H.missT.push(f.t); if (f.fooled > p.fooled + 0.05) S.H.emptyT.push(f.t);
        if (f.meaty > 0.25) S.H.food = S.H.smell = true; }
      const H = S.H, nk = this.mem.lastNoise && this.mem.lastNoise.t === this.t ? this.mem.lastNoise.kind : null;
      H.rock ||= nk === 'stone' || f.stones > 0 || f.t - f.stoneT < 1 || f.t - f.hitAt < 1; H.food ||= !!f.focus && f.focus !== 'flare' || f.prey; H.light ||= f.focus === 'flare' || f.torch || f.glare > 0.3;
      H.struct ||= !!f.encl || !!(this.ctx && this.ctx.beliefIn) || f.beh === 'besiege'; H.sky ||= f.t - f.thunderT < 5; H.smell ||= f.scent > 0.05 || !!(this.focus && this.focus.smell > 0.02);
      H.ap ||= !!(f.ap.weighing || f.ap.food || f.ap.notfood || f.ap.tasting || f.apo);
      H.handled ||= ['held', 'pinned'].includes(f.state); H.hurt ||= !!(f.ap.hurt || f.ap.blood) || f.state === 'dead'; H.near ||= f.via === 'near'; H.fly ||= f.state === 'air' || f.t - f.stoneT < 2 || (this.focus && !this.focus.rest);
      S.W.push(f); while (S.W.length && f.t - S.W[0].t > 3.6) S.W.shift();
      const lab = this.label + (this.beh && this.beh.phase ? '/' + this.beh.phase : '');
      if (lab !== S.lastLab) { S.lastLab = lab; out.lines.push({ t: +this.t.toFixed(1), beh: lab, d: f.seen ? Math.round(f.d) : null }); }
      const st = this.thinker.stream; let fresh = 0; for (let k = st.length - 1; k >= 0 && st[k] !== S.lastEntry; k--) fresh++;
      for (const e of st.slice(st.length - fresh)) {
        const ok = holds(e.cond, S.W, S.H), w = e.text.split(/\s+/).length, claim = e.text.replace(/(behind|by) rock|they smell me|rock crack|want smell|want new smell|smell nothing new|look for meat|meat\?$|taste wind/g, '');
        for (const [re, P] of LEX) if (re.test(claim) && !P(f, S.H)) out.bad.push(`${e.t}s "${e.text}" claims ${re} with nothing in the run behind it`);
        const th = { t: e.t, text: e.text, kind: e.kind, key: e.key, cond: e.cond, ok, words: w, beh: lab, think: null };
        out.thoughts.push(th);
        if (!ok) out.bad.push(`${e.t}s "${e.text}" [${e.cond}] condition did not hold`);
        if (w < 2 || w > 5) out.bad.push(`${e.t}s "${e.text}" has ${w} words`);
        if (NUM.test(e.text) || ABSTRACT.test(e.text)) out.bad.push(`${e.t}s "${e.text}" has a number or an abstract word`);
      }
      if (st.length) S.lastEntry = st[st.length - 1];
      if (st.length && !(this.peril && this.peril.quiet) && this.voice.think !== st[st.length - 1].text && this.t - st[st.length - 1].t < 1) out.bad.push(`${this.t.toFixed(1)}s voice.think "${this.voice.think}" is not the newest thought`);
    }
    return I;
  };
  console.log = () => {};
  let lastMind = null; const o2 = Mind.prototype.step; Mind.prototype.step = function (d, w) { lastMind = this; return o2.call(this, d, w); };
  try {
    if (src === 'mind') { const { play } = await import('./mind.mjs'); const [fn, secs] = MIND[name]; play(name, fn, secs, { seed, rexAt: name === 'hide_and_throw' ? { x: 0, z: 0, yaw: -2.7 } : undefined, verbose: false }); }
    else if (src === 'attack') { const { attackRun } = await import('./attack.mjs'); attackRun(name, seed, { quiet: true }); }
    else if (src === 'stim') { process.argv = [process.argv[0], 'stim.mjs', name, String(seed)]; await import('./stim.mjs'); }
    else if (src === 'siege') { process.argv = [process.argv[0], 'siege.mjs', name, String(seed), '120']; await import('./siege.mjs'); }
    else if (src === 'pred') { const { run } = await import('./predator.mjs'); run(seed, { starving: 0.92, meat: 0.95, stones: 0.62, rival: 0.62 }[name], { secs: 110, stones: name === 'stones' ? 7 : 0, meat: name === 'meat', hold: name !== 'meat', verdict: name === 'rival' ? 'rival' : null }); }
    else if (src === 'active') { const { activeRun } = await import('./active.mjs'); activeRun(name, seed, name === 'pest' ? 0.62 : name === 'wanderer' ? 0.8 : 0.92, { secs: 120 }); }
    else ownRun(name, seed);
  } finally { console.log = log; }
  out.secs = lastMind ? lastMind.t : 0;
  console.log('@@' + JSON.stringify(out));
}
// the scripted people of test/mind.mjs (copied: that file keeps them inside its command-line block)
const MIND = {
  still_open: [(s) => { s.me.x = 0; s.me.z = 34; s.face = 'rex'; }, 150],
  wander_near: [(s) => { s.me.x = Math.sin(s.t * 0.05) * 30; s.me.z = 20 + Math.cos(s.t * 0.07) * 15; s.face = null; }, 150],
  hide_and_throw: [(s, dt) => {
    const o = s.T.obstacles.reduce((b, q) => Math.hypot(q.x, q.z) < Math.hypot(b.x, b.z) ? q : b);
    if (s.t < 1e-6) { s.ox = o.x; s.oz = o.z; const u = Math.hypot(o.x, o.z); s.hx = o.x + o.x / u * (o.r + 1); s.hz = o.z + o.z / u * (o.r + 1); s.me.x = o.x + o.z / u * 16; s.me.z = o.z - o.x / u * 16; }
    if (s.t > 4 && s.t < 30) { const dx = s.hx - s.me.x, dz = s.hz - s.me.z, d = Math.hypot(dx, dz); if (d > 0.3) { s.me.x += dx / d * dt * 1.4; s.me.z += dz / d * dt * 1.4; } }
    s.me.crouch = s.t > 18; s.face = 'rex';
    for (const T of [50, 85, 120, 150]) if (Math.abs(s.t - T) < 1e-6) { const a = Math.atan2(s.ox, s.oz) + (T % 2 ? 1.6 : -1.6); s.noises.push({ x: s.ox + Math.sin(a) * 30, y: 0, z: s.oz + Math.cos(a) * 30, loud: 0.35, kind: 'stone' }); }
  }, 170],
  run_away: [(s, dt) => { if (s.t < 1) { s.me.x = 0; s.me.z = 22; } if (s.t > 12 && s.t < 30) { s.me.z += dt * 5.5; s.me.x += dt * 2; } s.face = s.t > 12 && s.t < 30 ? null : 'rex'; }, 60],
  approach_it: [(s, dt) => { if (s.t < 1) { s.me.x = 3; s.me.z = 40; } if (s.t > 5 && Math.hypot(s.me.x - s.sim.x, s.me.z - s.sim.z) > 9) { const d = Math.hypot(s.sim.x - s.me.x, s.sim.z - s.me.z); s.me.x += (s.sim.x - s.me.x) / d * dt * 1.3; s.me.z += (s.sim.z - s.me.z) / d * dt * 1.3; } s.face = 'rex'; }, 120],
  shout_behind: [(s) => { s.me.x = 0; s.me.z = -45; s.face = 'rex'; if (Math.abs(s.t - 10) < 1e-3) s.noises.push({ x: 0, y: 0, z: -45, loud: 0.6, kind: 'shout' }); }, 90],
};
// ------------------------------------------------------------------ encounters of its own: habits it can learn
const walkTo = (P, x, z, sp) => { const dx = x - P.x, dz = z - P.z, d = hyp(dx, dz); if (d > 0.05) { const k = Math.min(d, sp * dt) / d; P.x += dx * k; P.z += dz * k; } return d; };
const OWN = {
  // seen in the open, then hides behind the same rock, again and again (does it check there first?)
  hide: { secs: 300, at: [0, 30], script(t, P, { sim, mind, T, mem }) {
    if (!mem.rock) { mem.rock = covers(T, { minR: 15, maxR: 45, minSize: 1.5 }).sort((a, b) => hyp(a.x, a.z) - hyp(b.x, b.z))[0]; mem.phase = 'show'; mem.at = 0; }
    const R = mem.rock, away = Math.atan2(R.x - sim.x, R.z - sim.z);
    if (mem.phase === 'show') { const o = mem.open || (mem.open = { x: R.x + Math.sin(away + 2.2) * 22, z: R.z + Math.cos(away + 2.2) * 22 }); walkTo(P, o.x, o.z, 1.4); P.crouch = false; if (mind.know.seen && t - mem.at > 8) { mem.phase = 'run'; mem.at = t; mem.h = { x: R.x + Math.sin(away) * (R.r + 1.2), z: R.z + Math.cos(away) * (R.r + 1.2) }; } }
    else if (mem.phase === 'run') { if (walkTo(P, mem.h.x, mem.h.z, 4.5) < 0.5) { mem.phase = 'hide'; mem.at = t; } }
    else { P.crouch = true; if ((mind.know.seen && t - mem.at > 3) || t - mem.at > 60) { mem.phase = 'show'; mem.at = t; mem.open = null; } }
    return {};
  } },
  // crouched behind a rock, a stone thrown off to one side every 25 s
  decoy: { secs: 240, at: [0, 0], script(t, P, { sim, mind, T, mem }) {
    if (!mem.init) { mem.init = true; const R = covers(T, { minR: 20, maxR: 50, minSize: 1.5 })[0]; const a = Math.atan2(R.x, R.z); P.x = R.x + Math.sin(a) * (R.r + 1); P.z = R.z + Math.cos(a) * (R.r + 1); mem.n = 0; }
    P.crouch = true;
    if (t > 8 && Math.floor((t - 8) / 25) !== Math.floor((t - 8 - dt) / 25) && !mind.know.seen) { const a = Math.atan2(sim.x - P.x, sim.z - P.z) + (mem.n % 2 ? 1.1 : -1.1); mem.n++; return { stone: { x: P.x + Math.sin(a) * 18, z: P.z + Math.cos(a) * 18 } }; }
    return {};
  } },
  // into the culvert by one end, out of the other, and round again
  exit: { secs: 300, at: [0, 0], script(t, P, { mind, T, mem }) {
    if (!mem.S) { mem.S = T.structures.find((s) => s.kind === 'culvert'); const [A0, B0] = mem.S.openings; mem.A = A0; mem.B = B0; const nl = hyp(A0.nx, A0.nz); P.x = A0.x + A0.nx / nl * 20; P.z = A0.z + A0.nz / nl * 20; mem.phase = 'show'; mem.at = 0; mem.k = 0; }
    const S = mem.S, A0 = mem.A, B0 = mem.B, na = hyp(A0.nx, A0.nz), nb = hyp(B0.nx, B0.nz);
    P.crouch = mem.phase === 'in';
    if (mem.phase === 'show') { walkTo(P, A0.x + A0.nx / na * 18, A0.z + A0.nz / na * 18, 1.5); if (mind.know.seen && t - mem.at > 6) mem.phase = 'enter'; }
    else if (mem.phase === 'enter') { if (walkTo(P, mem.k ? S.cx : A0.x, mem.k ? S.cz : A0.z, 4) < 0.3) { if (mem.k) { mem.phase = 'in'; mem.at = t; mem.k = 0; } else mem.k = 1; } }
    else if (mem.phase === 'in') { if (t - mem.at > 30) mem.phase = 'out'; }
    else if (mem.phase === 'out') { if (walkTo(P, mem.k ? B0.x + B0.nx / nb * 25 : B0.x, mem.k ? B0.z + B0.nz / nb * 25 : B0.z, 4) < 0.3) { if (mem.k) { mem.phase = 'away'; mem.at = t; mem.k = 0; } else mem.k = 1; } }
    else if (t - mem.at > 15) { mem.phase = 'show'; mem.at = t; }
    return {};
  } },
};
Object.assign(OWN, {
  // stands in view and plays with the torch (pointed at the ground, not in its eyes): on, off, on, off, then leaves it on, then off
  torch: { secs: 120, at: [4, 26], script(t, P) { P.torch = (t > 15 && t < 17) || (t > 19 && t < 21) || (t > 23 && t < 25) || (t > 45 && t < 80); P.lx = 0; P.ly = -1; P.lz = 0; return {}; } },
  // walks along behind it wherever it goes, 12 m back
  follow: { secs: 200, at: [0, -20], script(t, P, { sim }) { const bx = sim.x - Math.sin(sim.psi) * 13, bz = sim.z - Math.cos(sim.psi) * 13; if (hyp(bx - P.x, bz - P.z) > 2) walkTo(P, bx, bz, 2.6); return {}; } },
  // stands with its back to it, then backs away facing it, then turns and walks off, then comes back with meat on its hands and drops meat twice
  ignore: { secs: 240, at: [3, 20], script(t, P, { sim, mem }) {
    const dx = sim.x - P.x, dz = sim.z - P.z, d = hyp(dx, dz) || 1;
    if (t < 50) mem.face = -1; else if (t < 62) { mem.face = 1; walkTo(P, P.x - dx / d * 9, P.z - dz / d * 9, 1.2); } else if (t < 85) { mem.face = -1; walkTo(P, P.x - dx / d * 9, P.z - dz / d * 9, 1.6); } else mem.face = 1;
    if (t >= 85 && t < 130 && d > 16) walkTo(P, sim.x, sim.z, 1.5);
    const out = {}; for (const T of [100, 150]) if (Math.abs(t - T) < dt / 2) out.meat = { x: P.x + dx / d * 6, z: P.z + dz / d * 6 };
    return out;
  }, face: true },
  // in plain view, lobs stones that land a few metres from it
  nearmiss: { secs: 150, at: [0, 24], script(t, P, { sim }) { if (t > 10 && Math.floor((t - 10) / 22) !== Math.floor((t - 10 - dt) / 22)) { const a = Math.atan2(P.x - sim.x, P.z - sim.z) + 1.3; return { stone: { x: sim.x + Math.sin(a) * 5, z: sim.z + Math.cos(a) * 5 } }; } return {}; } },
});
function ownRun(name, seed) {
  const S = OWN[name], T = makeTerrain(7), sim = new Creature(T, { x: 0, z: 0, yaw: 0, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  A.herd.disabled = !S.herd;
  const P = { id: 'you', x: S.at[0], z: S.at[1], y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1, torch: false, lx: 0, ly: 0, lz: 1 }, ctx = { sim, mind, T, A, mem: {} }, V = A.victim('you');
  for (let i = 0; i < S.secs * 120; i++) {
    const t = i * dt, px = P.x, pz = P.z;
    const act = V.free ? S.script(t, P, ctx) || {} : {};
    if (!V.free) { if (i % 20 === 0) A.struggle('you', 1); if (V.handled) { P.x = V.x; P.z = V.z; } }
    P.y = T.height(P.x, P.z) + (P.crouch ? 1.0 : 1.7);
    const fl = hyp(sim.x - P.x, sim.z - P.z) || 1, fs = ctx.mem.face || 1; P.fx = fs * (sim.x - P.x) / fl; P.fz = fs * (sim.z - P.z) / fl;
    if (act.stone) A.things.throw('stone', P.x, P.y, P.z, act.stone.x, act.stone.z, 'you');
    if (act.meat) A.things.throw('meat', P.x, P.y, P.z, act.meat.x, act.meat.z, 'you');
    P.vx = (P.x - px) / dt; P.vz = (P.z - pz) / dt; P.speed = V.free ? hyp(P.vx, P.vz) : 0;
    A.step(dt, { agents: P.gone ? [] : [P], noises: [], light: 0.85, flash: false, wind: { x: 0, z: -2 }, ...(act.world || {}) }); A.events.length = 0;
  }
}

// ------------------------------------------------------------------ parent: run them all, print, judge
if (process.argv[2] === '--child') await child(process.argv[3], process.argv[4], +process.argv[5]);
else {
  const which = process.argv[2] || 'all', seed = +(process.argv[3] || 3), quiet = process.argv.includes('--quiet');
  const runs = RUNS.filter(([s, n]) => which === 'all' || which === n || which === s + ':' + n || which === s);
  let total = 0, bad = 0, rep = 0; const allText = new Map(), kinds = {};
  // the runs are independent child processes: run them side by side (one per core), report in order
  const go = ([src, name]) => new Promise((res) => { const p = spawn(process.execPath, [HERE, '--child', src, name, String(seed)]); let out = '', err = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d)); p.on('close', () => res({ stdout: out, stderr: err })); });
  const results = new Array(runs.length); let next = 0;
  await Promise.all(Array.from({ length: Math.max(2, availableParallelism()) }, async () => { while (next < runs.length) { const k = next++; results[k] = await go(runs[k]); } }));
  for (const [ri, [src, name]] of runs.entries()) {
    const r = results[ri];
    const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
    if (!line) { console.log(`== ${src}:${name} CRASHED\n${(r.stderr || '').slice(0, 1500)}`); bad++; continue; }
    const o = JSON.parse(line.slice(2)), T = o.thoughts, secs = o.secs;
    const texts = T.map((x) => x.text), uniq = new Set(texts), seenAt = new Map(); let reps = 0;
    for (const x of T) { const p = seenAt.get(x.text); if (p !== undefined && x.t - p < 60) reps++; seenAt.set(x.text, x.t); allText.set(x.text, (allText.get(x.text) || 0) + 1); kinds[x.kind] = (kinds[x.kind] || 0) + 1; }
    total += T.length; rep += reps; bad += o.bad.length;
    if (!quiet) {
      console.log(`\n== ${src}:${name} (seed ${seed})`);
      // the transcript: behaviour changes (dim) interleaved with the thoughts
      const ev = [...o.lines.map((l) => ({ t: l.t, s: `            · ${l.beh}${l.d !== null ? ' (' + l.d + ' m)' : ''}` })), ...T.map((x) => ({ t: x.t, s: `   "${x.text}"`.padEnd(34) + ` ${x.kind}${x.ok ? '' : '  <-- CONDITION FAILED'}` }))].sort((a, b) => a.t - b.t);
      for (const e of ev) console.log(`${e.t.toFixed(1).padStart(6)}s ${e.s}`);
    }
    const felt = T.filter((x) => FELT.test(x.key || '')).length;
    console.log(`   ${(src + ':' + name).padEnd(20)} ${T.length} thoughts in ${secs.toFixed(0)} s (${(10 * T.length / Math.max(1, secs)).toFixed(1)} per 10 s), ${uniq.size} distinct, repeats within 60 s ${reps}, about you ${(100 * (1 - felt / Math.max(1, T.length))).toFixed(0)}%${o.bad.length ? ', PROBLEMS ' + o.bad.length : ''}`);
    for (const b of o.bad.slice(0, 8)) console.log('     ! ' + b);
  }
  console.log(`\nSUMMARY: ${runs.length} runs, ${total} thoughts, ${allText.size} distinct texts overall, repeat rate (same text within 60 s) ${(100 * rep / Math.max(1, total)).toFixed(1)}%, by kind ${JSON.stringify(kinds)}, problems ${bad}`);
  if (bad) process.exitCode = 1;
}
