// The animal's mind. It never reads where the player is: it reads what it can sense.
//
//   senses   keen forward-facing sight (distance, light, cover and posture decide what it picks out;
//            movement only draws the eye a little more), torchlight and flares give you away,
//            hearing (with a rough sense of where a sound came from), smell carried on the wind,
//            and lines of sight blocked by ground and rock.
//   belief   a cloud of possible positions for "the intruder". Sight collapses it, sounds and
//            scents pull it, and NOT seeing anything where it is looking erodes it, so what
//            survives is behind cover. A thrown stone moves it just as well as a footstep.
//   mood     arousal, interest, irritation, boredom and fatigue, drifting continuously, on top
//            of a temperament drawn once per animal (bold, patient, curious, irritable, nervy).
//   memory   habituation to noises that led nowhere, a sense of having been fooled, the places
//            where the intruder was found after hiding.
//   action   many candidate behaviours scored against all of that, chosen with noise and
//            commitment, each one a small procedural routine with irregular timing. Nothing is
//            a fixed response; the same provocation can get a stare, a feint or a charge.
//
//   grudge   what you did to it (stones that hit, a lamp in its eyes, going for its food) builds a grudge; with
//            hunger and, after long close acquaintance, a bold curiosity, that is what can turn into laying hold of
//            you: a head-butt or a tail swipe that knocks you down, a foot put on you, your body picked up in the
//            jaws, carried, shaken, tossed or dropped. It warns first; it escalates only if you keep on; it loses
//            interest in something lying limp. Whether a blow lands is decided by the bodies (arena.js), not here.
//   voice    what it is thinking (`voice`): a stream of small true thoughts (thoughts.js, `voice.stream`, newest in
//            `voice.think`), plus what it wants, what it is doing and what it is looking at, read off the same live state.
//   bond     the other direction: how you have treated it over the session (fed it, stayed calm near it, let it nose you; or
//            hit it, blinded it, stole from it) is a hidden `bond.trust` it acts on, never shown as a number: it lets you
//            closer, carries itself loosely, sniffs you without tensing, lies down near you, follows you, lets you touch its
//            snout (leaning in, eyes half shut, a low rumble) or warns you off if it is too soon. A wrong done after it had come
//            to trust you is a betrayal: it costs more and leaves a scar that slows trust for a long time.
//   pain     a hurt foot (`sim.injury`, the thorn scenario) makes it short-tempered, lame and lie down to rest it; if it trusts
//            you enough it may let you pull the thorn out (`pull`), and is lastingly different toward you afterwards.
//   cunning  it learns your habits: the places you hide (checked first next time), the way you come out of a structure
//            (waited at), the refuge you run for (cut off), and stones thrown to send it the wrong way (ignored, or traced
//            back along their flight to the thrower).
//
// Deterministic and seeded; reads a world snapshot, writes an intent and gestures. Several
// agents can be passed in (co-op); it attends to the one it finds most interesting.

import { Peril } from './peril.js';
import { makeRng, clamp, lerp, wrap, bearing, expK } from '../math.js';
import { Attention } from './attend.js';
import { Thinker } from './thoughts.js';
import { Appraisal, PRED } from './appraise.js';
import { reachJudge } from './afford.js';
import { bodyRoom } from './nav.js';

// ON HOLD: the bond (trust, petting, hand-feeding) and the thorn scenario (pain, limp, lying down, tending, pulling the thorn).
// The code is kept but switched off here: trust never grows, the friendly behaviours (greet, follow, pet, pull, rest, tend,
// relief) are never chosen and a hand on the animal is ignored. Set true to resume that work (see also scenario.js, arena.js
// thorn/touch/offer, rex.js lie/injury, test/trust.mjs).
export const BOND_ON = false;
const NP = 180;
const lognormal = (R, median, spread) => median * Math.exp(spread * Math.sqrt(-2 * Math.log(Math.max(R(), 1e-6))) * Math.cos(2 * Math.PI * R()));
const pick = (R, arr) => arr[Math.floor(R() * arr.length) % arr.length];
const ATTACKS = ['butt', 'swipe', 'pin', 'seize', 'toy'];
const FRIENDLY = ['greet', 'follow', 'pet', 'pull', 'rest', 'tend', 'relief'];
const LYING = new Set(['down', 'rising', 'pinned', 'air', 'held', 'dead']);
const whoOf = (a) => a.who ?? a.id;
const R_ = (R, [a, b]) => R.range(a, b);
// What each behaviour is for, as an observer would read it: the level at which it commits (see `goal`). Modes about you:
// pred (sizing you up as food, stalking, rushing), curious (looking, sniffing, circling), agon (warning you off, facing you
// down), seek (you out of sight: searching, waiting, watching where you went). Others: food, light, herd, own (its own agenda).
const MODE_OF = { stalk: 'pred', prowl: 'pred', appraise: 'pred', test: 'pred', shadow: 'pred', lurk: 'pred', pounce: 'pred', seize: 'pred',
  inspect: 'curious', circle: 'curious', nudge: 'curious', watch: 'curious', feign: 'curious', toy: 'curious', greet: 'curious', follow: 'curious', pet: 'curious', pull: 'curious',
  display: 'agon', bluff: 'agon', snap: 'agon', chase: 'agon', butt: 'agon', swipe: 'agon', pin: 'agon', backoff: 'agon', guard: 'agon', avoid: 'agon',
  search: 'seek', stare: 'seek', ambush: 'seek', listen: 'seek', besiege: 'seek', revisit: 'seek',
  feed: 'food', trail: 'food', investigate: 'light', hunt: 'herd' };
MODE_OF.probe = 'curious';      // (the core: coming to it and asking with its body, out/platform/CORE.md)
const modeOf = (name) => MODE_OF[name] || 'own';
// behaviours that are about you and read where you are every tick (mind._run ends them when there is no you)
const NEEDS_TARGET = new Set(['watch', 'stalk', 'circle', 'inspect', 'display', 'bluff', 'chase', 'snap', 'feign', 'backoff', 'nudge', 'avoid', 'guard', 'probe', 'appraise', 'test', 'shadow', 'prowl', 'pounce', 'butt', 'swipe', 'pin', 'seize', 'toy', 'greet', 'follow', 'pet', 'pull', 'relief']);
const ABOUT_YOU = new Set(['pred', 'curious', 'agon', 'seek']);
/** Engine defaults for how a mind commits and what reads as prey; a species overrides any of them (species.mind). */
export const MIND_DEFAULT = {
  commit: {
    hold: 0.6,          // the margin a goal starts with: another goal must beat it by this much
    bore: 25,           // s: the margin decays over this time without progress toward the goal (a few tens of seconds to bore it)
    sameTarget: 0.5,    // share of the margin a different mode about the same target gets (stalking you -> searching for you)
    fixHold: 0.9,       // extra margin per unit of prey arousal, while the goal is about that target
    progressD: 1.5,     // m closer to the target than its best so far counts as progress
    breakSal: 0.5,      // a sound at least this salient breaks commitment at once (a blow, fire close, the chase reflex always do)
  },
  prey: {
    quick: 0.6,         // a quick movement: over this share of its own running speed (dims.run) over 0.3 s (`quickV`, m/s, overrides)
    dart: 0.11,         // arousal per burst onset or sharp turn at speed
    bob: 0.015,         // arousal per bob (its height jumping up by over `bobH` m: hopping, leaping about)
    bobH: 0.3,          // m
    flee: 0.22,         // arousal per second of moving off fast
    vanish: 0.16,       // arousal for going out of sight close by
    vanishD: 40,        // m: out of sight further off than this is not vanishing (full effect inside 0.4 of it)
    slowHide: 0.5,      // share a slow walk out of view counts for, against a dash out of view
    prime: 4,           // how much quicker (per unit of arousal) it picks out a thing showing again where it went out of sight
    peek: 0.14,         // arousal for showing again, within 30 s, near where it went out of sight
    small: 0.7,         // a thing up to this share of its own height reads as small (full effect at half of that)
    calmT: 20,          // s: time constant of the drain while the target is in view, slow and calm
    goneT: 60,          // s: time constant of the fade while it is out of sight but believed close
    on: 0.45, off: 0.25,// fixation sets in above `on`, lets go below `off`
    reflexW: 0.7,       // how much arousal adds to your worth as food (not gated by hunger)
    absorb: 0.5,        // how much more attention is held by the target per unit of arousal
    pull: 0.9,          // how much fixation adds to stalking it (on top of what it is worth as food): a reflex outranks easier food
    rushD: 13,          // m: it rushes from a stalk when this close and squared up
    setT: [1.0, 1.8],   // s: the dead-still moment before the rush (the last tell)
    rushK: 0.7,         // prey arousal it takes to go from a stalk (fixation alone, `on`, is the stalk and the stare: the tells)
    holdD: 3,           // m: short of that, it creeps no nearer than rushD + holdD, and holds there, low, eyes locked
    calmGrace: 1.5,     // s: a thing calm this long in view no longer counts as worked up enough to rush (the reflex drains on)
    hungerGo: 0.6,      // hunger's own verdict (ap.Hn) that makes it go without the reflex
    hungerLead: 8,      // s: of stalking (low creep, locked stare: the tells) before hunger alone makes it go
    leadT: 8,           // s: fixed on you at least this long before the reflex alone makes it go (its tells come first)
    boltD: 8,           // m: a thing bolting from this close in front of its eyes is chased at once (the chase reflex, no build-up)
    boltLock: 0.25,     // s: the head-snap before that chase (the lock-on is shorter the closer the bolt)
    boltStrike: 2.5,    // m: bolting from within its strike reach plus this, in front of it, gets the strike at once (no chase)
    leaveRise: 3,       // s: of a steady walk away (at least ~0.8 m/s away from it, not running) to read the thing as leaving, not prey
    leaveT: 25,         // s: how long that reading lasts once it stops withdrawing (coming on or running ends it in ~1.5 s)
    leaveDamp: 0.6,     // share of hunger's want (and its weighing) a leaving thing takes off, short of starving
  },
};
// (the chase block: how long it keeps after a thing that runs)
MIND_DEFAULT.chase = {
  losingAfter: 4,     // s into a run before a growing gap counts against it (it is still getting up to speed)
  flat: 0.85,         // ...and only while it is going at least this share of its run speed
  giveUp: 3,          // s of losing ground flat out (plus 2 x boldness) before it gives a chase up
  lostD: 60,          // m: a gap this wide ends any chase
  maxT: 45,           // s: the longest a reflex chase (pounce) goes on
  boltD: 40,          // m: a thing it is stalking that bolts inside this is run after at once
};
// (the peril block: how the pressure to strike, peril.js, may move)
MIND_DEFAULT.peril = {
  rise: 0.05,         // per s: the most the slow part of the pressure (nearness, hunger, the food question, its own drift) may climb, as a
                      // share of its fuse: from its first warning rung (0.62) to the dead-still moment takes ~8 s at least. Fast causes
                      // (you running, crowding it, stones, a struggle in its jaws) are not slowed
  leave: 0.45,        // how much a thing leaving at a walk (appraise.js `leaving`) takes off the pressure, at any distance
};
// (the core block: food from the start, curiosity that keeps it alive, asking with the body, the opening a look away gives,
//  expectations with teeth; out/platform/CORE.md. appraise.js `_curio`, peril.js `reach`, mind.js `_runProbe`)
MIND_DEFAULT.core = {
  on: true,
  claimLook: 2.5,     // s of a clear look before a small thing alone (and not frightening) is filed as food
  claim: 0.75,        // how strongly (the verdict 'food' against 'curious', 0.22-0.52)
  first: 0.75,        // the curiosity reserve a never-met individual starts with
  fill: 0.5,          // reserve a never-seen kind of act fills (less each time it has seen that kind)
  habGain: 0.65,      // habituation per repeat of a kind of act
  habT: 150,          // s: habituation to a kind wears off over this
  habHold: 30,        // s: ...once the thing has not done that kind of thing for this long (kept up, it does not wear off)
  drainT: 90,         // s: the reserve runs down over this while it is close (inside 15 m) and looking
  drainFar: 200,      // ...and over this further off
  surprise: 0.2,      // reserve an answer it did not expect fills
  curPeril: 1.2,      // pressure (peril.js) a full reserve holds off
  want: 1.1,          // the pull of going to it and asking (utility), plus `hunt` x its hunger's verdict
  hunt: 0.8,
  damp: 0.3,          // what the old ways of being about it (inspect, watch, stalk, appraise...) keep beside it
  paceU: 2.3, paceG: 1.5, paceW: 0.55,   // m/s coming in: unwatched (back turned or looking away), a glance away, watched
  paceFar: 1.5,       // m/s watched while still far off (beyond `farD[1]`, easing to paceW by `farD[0]`): it sets off and walks straight
  farD: [8, 20],      //   in at an ordinary walk; being watched slows it only once it is close (out/platform/MERGE.md)
  lookT: 2,           // s: while it has a small thing in view and is only watching or about its own business, it weighs it again this often
  glanceT: 1.2,       // s: looking away longer than this is a turned look, not a glance
  hungryPace: 1.6,    // pace x this at full hunger (it does not hurry, but a hungry one comes on)
  inspectD: 6.2,      // m, hips to the thing, for the close look (its head at the thing)
  rungs: [0.3, 0.48, 0.64, 0.8],   // pressure (peril r) for the nudge, the shove, the foot, the reach
  pause: [2.5, 4.5],  // s reading the answer to a probe (x1.4 watched, x0.7 not)
  shoveF: 0.2,        // force of the shove (knocks a person down, no harm)
  fed: 0.4,           // hunger under which it toys: probes up to the shove, never the reach
  reachT: [3.5, 5],   // s: the open-mouthed reach, from its start to the bite (readable, counterable)
  reachFrom: 30,      // m: the pressure on a thing that is not running inside this ends in the reach (not the rush)
  reachPace: 0.9,     // m/s while reaching
  unwRise: 1.6,       // the slow pressure climbs this much faster while it is not watched (x1.5 again back turned)
  teeth: 0.2,         // pressure added at once when a remembered counter is tried again (it was waiting for it)
  balkKeep: 0.45,     // share of the slow pressure kept after a counter works
  balkHold: 20,       // s after a counter worked before it reaches again (it starts its questions again from the nudge)
  balkT: 240,         // s: what it has learnt about a counter fades over this
  immune: 1,          // a counter that has balked it this many times does not balk it again (it comes on through it)
};
const mergeCfg = (D, S) => { const o = {}; for (const k in D) o[k] = { ...D[k], ...((S && S[k]) || {}) }; return o; };
const dirWord = (a) => ['north', 'north-west', 'west', 'south-west', 'south', 'south-east', 'east', 'north-east'][((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];

export class Mind {
  constructor(sim, seed = 1) {
    this.sim = sim; this.T = sim.terrain; this.R = makeRng(seed * 7919 + 17);
    const R = this.R;
    this.sp = sim.species;
    this.temper = Object.fromEntries(Object.entries(this.sp.temper).map(([k, [a, b]]) => [k, R.range(a, b)]));
    this.mood = { arousal: 0.12, interest: 0, irritation: 0, boredom: 0.35 };
    this.drift = { bold: 0, curious: 0, patience: 0 };
    this.mem = { noiseHab: 0, hab: {}, fooled: 0, hides: [], encounters: 0, lastNoise: null, recent: [] };
    this.p = Array.from({ length: NP }, () => this._randomParticle());
    this.know = { seen: false, ev: 0, thr: 1, lost: 0, lastSeenT: -999, last: { x: 0, z: 0, y: 0 }, target: null, seenTime: 0, firstSight: true };
    this.sum = { x: 0, z: 0, spread: 99, cert: 0 };
    this.beh = null; this.t = 0; this.acc = 0; this.thought = 'Settling.'; this.label = 'idle';
    this.scent = 0; this.scentDir = 0; this.startle = null; this.intent = {};
    this.gen = 1; this.events = [];
    // appetite, the object it is interested in, the prey it is tracking, how recently it was struck
    this.hunger = R.range(0.3, 0.65); this.focus = null; this.objMem = {}; this.prey = null; this.hitAt = -999; this.glare = 0;
    // probe controls (debug panel): what it notices, which senses work, drives held fixed, a forced behaviour, frozen choices
    this.ov = { notice: { you: true, sounds: true, food: true, flares: true, prey: true }, senses: { sight: true, hearing: true, smell: true }, omniscient: false, hold: {}, force: null, freeze: false, verdict: null };      // verdict: null (it decides) | 'food' | 'notfood' | 'threat' | 'rival'
    this.log = []; this.lastU = []; this.baseTemper = { ...this.temper };
    // what you did to it, and what it did about it
    this.grudge = 0; this.wrongs = { stones: 0, glare: 0, food: 0 }; this.lastWrong = null; this.warnedT = -999; this.grudgeAtWarn = 0;
    this.attacks = 0; this.lastAttack = -999; this.grudgeAtAct = 0; this.motive = null; this.orientTo = null;
    this.voice = { think: '', want: 'WANT: REST.', doing: 'STAND.', lookingAt: 'NOTHING.', look: 'around', at: 0, stream: [] };
    this.att = new Attention(this, seed);      // one attention: what it thinks about and where its head goes
    this.thinker = new Thinker(this, seed); this.voice.stream = this.thinker.stream;      // its own random stream: thinking never changes the simulation
    // the bond: what it has learnt of you, never shown as a number (see the header)
    this.bond = { trust: 0, scar: 0, fed: 0, handFed: 0, petted: 0, wrongs: 0, betrayals: 0, saved: false, lastGood: null, lastBad: null, listened: 0 };
    this.pain = 0; this.painSpike = 0; this.touch = null; this.allowPull = false; this.lastGreet = -999; this.lastFollow = -999;
    this.mem.spots = []; this.mem.exits = {}; this.mem.decoys = 0; this.mem.stoneSeen = null; this.mem.inside = null; this.mem.vanish = [];
    // what it makes of you (appraise.js): curious, food, not food, nuisance, threat, rival; and where you tend to be
    this.ap = new Appraisal(this, seed); this.mem.haunts = []; this.stance = 'none';
    this.peril = new Peril(this, seed);      // will it take you now? (peril.js: hidden, drifting, fed by its real state)
    // who: which individual its picture of "the small thing" is of (a person's identity, `agent.who`, new with every life).
    // What it knows of that one (where, habits, tricks, grudge, verdict, bond) belongs to it alone and goes when it is gone
    // (`_forget`); what it has learnt of small things in general (`kind`) stays as a modest prior for the next one.
    this.seed = seed; this.who = null; this.deadWho = null;
    this.kind = { met: 0, killed: 0, ate: 0, kept: 0, spat: 0, slipped: 0, bolted: 0, stood: 0, stung: 0, fear: 0 };
    // prey drive: a reflex, not a verdict. Something small running in its sight builds `pd.k`; at 1 it locks on and goes
    // (`pounce`), whatever it thought of you and however fed it is (see `_preyDrive`).
    this.pd = { k: 0, lastT: -99, n: 0 };
    // commitment (see MIND_DEFAULT): the goal its behaviours serve, held until done, blocked, beaten by a clear margin or broken by
    // something that matters at once (`openT`)
    this.cfg = mergeCfg(MIND_DEFAULT, this.sp.mind); this.goal = null; this.openT = -99;
    // the route planner takes its body's own measure (what the trunk can pass, where it can turn): nav.bodyRoom
    if (sim.nav && sim.nav.fit) sim.nav.fit(bodyRoom(sim));
  }
  /** How readily this animal's chase reflex fires (temperament: bold and short-tempered quicker, patient slower), 0.25..1. */
  get pdSens() { const T = this.temper; return clamp(0.55 + 0.7 * (T.bold - 0.6) + 0.5 * (T.irritable - 0.5) - 0.4 * (T.patience - 0.6), 0.25, 1); }
  /** The chase reflex, every decision tick. Sustained running it can see (or, less, running feet heard close by) fills it over
   *  ~1.2-2.4 s of perceived running (perceived speed itself takes most of a second to build: a tap of the key is nothing; a
   *  walk never counts); stopping, or getting out of sight, drains it fast. Returns true when it should launch now. */
  _preyDrive(dt, c) {
    const K = this.know, a = K.target, P = this.pd, sens = this.pdSens * (1 - 0.5 * clamp(this.ap.fear, 0, 1));
    let rate = 0;
    if (K.seen && a && a.id !== 'observer' && !a.ghost && !a.dead && (a.state || 'free') === 'free' && !c.walled) {
      if (K.via === 'sight' && a.speed > 4.2 && c.d < 30 + 25 * sens) rate = clamp((a.speed - 3.6) / 2.6, 0.3, 1.2) * (c.d < 30 ? 1 : 0.7);
      else if (K.via === 'near' && K.gait === 'run' && c.d < 16) rate = 0.4;
    }
    P.k = rate > 0 ? Math.min(1, P.k + dt * rate / lerp(2.4, 1.2, sens)) : Math.max(0, P.k - dt * 1.2);
    // a bolt from close in front of its eyes (the prey signature's flight, appraise.js) needs no build-up: it goes at once
    P.close = !!(K.seen && K.via === 'sight' && a && (a.state || 'free') === 'free' && !c.walled && this.ap.sig && this.ap.sig.flee && c.d < this.cfg.prey.boltD);
    // food that bolts (out/platform/MERGE.md): a thing it has filed as food that runs from it, seen or heard close, inside the
    // chase range, is gone after at once, however curious it was about it: curiosity is for food that stays
    const asked = !!(this.core && this.core.who === this.who && this.t - (this.core.askT ?? -99) < 3);      // (a thing it was on its way to ask, or asking, just now)
    P.food = !!(K.seen && a && (K.via === 'sight' || K.via === 'near') && (a.state || 'free') === 'free' && !c.walled && c.running >= 1 && (this.ap.verdict === 'food' || asked) && c.d < this.cfg.chase.boltD);
    if (P.close || P.food) P.k = 1;
    if (P.k < 1 || (this.t - P.lastT < 20 - 8 * sens && !(P.close && this.t - P.lastT > 4) && !(P.food && this.t - P.lastT > 1)) || this.ov.freeze || this._handling()) return false;
    const b = this.beh; if (b && !b.done && (b.name === 'pounce' || ATTACKS.includes(b.name))) return false;
    const sim = this.sim; if (sim.nav && sim.nav.reachable && !sim.nav.reachable(sim.x, sim.z, a.x, a.z)) return false;      // ground it cannot get onto
    return true;
  }
  /** Whether a stalk about you is going anywhere (prowl): `go` when hunger alone has decided (ap.Hn over `hungerGo`), or the
   *  prey reflex is over `rushK` and the thing has not been calm for `calmGrace` s; `bolt` when it is sprinting off near it;
   *  `off` when neither hunger nor the reflex holds it any longer (the reflex drained below `off`). */
  _preyGo(dt, b, c) {
    const PY = this.cfg.prey, ap = this.ap, calm = ap.sig && ap.sig.calm;
    b.calmT = calm ? (b.calmT || 0) + dt : 0;
    // (hunger too goes only after its creep and stare have been on show for `hungerLead` s of this stalk)
    const hungry = (ap.Hn || 0) >= PY.hungerGo && (b.t || 0) >= PY.hungerLead, bolt = c.running >= 1 && c.seen;
    // (the reflex goes only after it has been fixed on you for `leadT` s: long enough for its stare and creep to be read)
    const keen = ap.arousal >= PY.rushK && b.calmT < PY.calmGrace && ap.fixed && this.t - (ap.fixT ?? this.t) >= PY.leadT;
    const amb = !!(b.ambush && (b.t || 0) < 12);      // (it was waiting for this one to come out: _siegeAmbush)
    return { go: hungry || keen || bolt || amb, bolt, off: !hungry && !bolt && ap.arousal < PY.off && (ap.H || 0) < 0.3 };
  }
  /** Being watched while it closes on a thing (stalk, prowl): it freezes (the tell), but only for so long. Its patience runs
   *  down the hungrier it is and the longer it has been watched in this encounter (`watchAcc`), and is shorter each time it has
   *  frozen in this approach; when it runs out it changes how it comes, never whether: 'cover' (a place on the way in the
   *  watcher cannot see, if there is one), 'arc' (a sidestep that changes the angle while it closes), or 'open' (straight in,
   *  slow and deliberate, with a rising tell). Each move ends in a freeze again if it is still watched. `press` forces 'open'.
   *  Returns { hold, mode, goal, pace } (goal null: the caller's own approach). */
  _watchedApproach(dt, b, c, a, press = false) {
    const W = b.wa || (b.wa = { held: 0, mode: 'hold', modeT: 0, n: 0, pat: null, side: this.R() < 0.5 ? 1 : -1 }), sim = this.sim, R = this.R;
    const lt = this.watchAccT ?? this.t; this.watchAcc = (this.watchAcc || 0) * Math.exp(-(this.t - lt) / 90); this.watchAccT = this.t;
    if (c.watched) this.watchAcc += dt;
    W.modeT += dt;
    const patience = () => clamp((6.5 - 4 * this.hunger) * (0.7 + 0.6 * this.temper.patience) / (1 + this.watchAcc / 25) * Math.pow(0.75, W.n), 1.2, 8);
    if (!c.watched && !press) { if (W.mode === 'hold') W.held = 0; if (W.mode !== 'open' || W.modeT > 3) { W.mode = 'creep'; W.modeT = 0; } return { hold: false, mode: W.mode, goal: null }; }
    if (press && W.mode !== 'open') { W.mode = 'open'; W.modeT = 0; W.why = 'press'; W.lastMode = 'open'; this.waT = this.t; this.waMode = 'open'; }
    if (W.mode === 'creep') { W.mode = 'hold'; W.modeT = 0; W.held = 0; W.pat = patience(); }
    if (W.mode === 'hold') {
      W.held += dt; if (W.pat === null) W.pat = patience();
      if (W.held < W.pat) return { hold: true, mode: 'hold', goal: null };
      // patience gone: a new way of coming, picked from what the ground offers and what it is
      W.n++; W.held = 0; W.modeT = 0; W.why = 'patience';
      const d = c.d, b0 = bearing(sim.x - a.x, sim.z - a.z), ey = (a.y ?? this.T.height(a.x, a.z) + 1.6), hy = sim.head.pos.y - this.T.height(sim.x, sim.z);
      let cov = null;
      for (const off of [0.45, -0.45, 0.8, -0.8, 1.1, -1.1]) for (const r of [d - 4, d - 7]) {
        if (r < 8) continue;
        const x = a.x + Math.sin(b0 + off) * r, z = a.z + Math.cos(b0 + off) * r;
        if (sim.nav && sim.nav.costAt && sim.nav.costAt(x, z) > 2) continue;
        if (!this.los(a.x, ey, a.z, x, this.T.height(x, z) + hy, z)) { cov = { x, z }; break; }
      }
      const boldness = this.temper.bold + 0.5 * this.hunger;
      if (cov) { W.mode = 'cover'; W.to = cov; }
      else if (W.lastMode !== 'open' && R() < 0.25 + 0.35 * boldness + 0.15 * (W.n - 1)) W.mode = 'open';
      else {
        W.mode = 'arc'; W.side = W.lastMode === 'arc' ? -W.side : W.side;
        const off = W.side * R.range(0.4, 0.7), r = Math.max(9, d - R.range(3, 5));
        W.to = { x: a.x + Math.sin(b0 + off) * r, z: a.z + Math.cos(b0 + off) * r };
        if (sim.nav && sim.nav.costAt && sim.nav.costAt(W.to.x, W.to.z) > 2) { W.side = -W.side; W.to = { x: a.x + Math.sin(b0 - off) * r, z: a.z + Math.cos(b0 - off) * r }; }
      }
      W.lastMode = W.mode; W.since = this.t; this.waT = this.t; this.waMode = W.mode;
    }
    if (W.mode === 'cover' || W.mode === 'arc') {
      const dd = Math.hypot(W.to.x - sim.x, W.to.z - sim.z);
      if (dd < 1.5 || W.modeT > (W.mode === 'cover' ? 10 : 6)) { W.mode = 'hold'; W.modeT = 0; W.held = 0; W.pat = patience(); return { hold: true, mode: 'hold', goal: null }; }
      return { hold: false, mode: W.mode, goal: { kind: 'move', id: b.gen * 10 + 3 + W.n, x: W.to.x, z: W.to.z }, pace: W.mode === 'cover' ? 1.9 : 1.6 };
    }
    // open: straight in, slow and deliberate, with a rising tell; after a while it stops again (unless pressed on)
    if (!press && W.modeT > 7 + 3 * this.hunger) { W.mode = 'hold'; W.modeT = 0; W.held = 0; W.pat = patience(); return { hold: true, mode: 'hold', goal: null }; }
    return { hold: false, mode: 'open', goal: null, pace: lerp(1.0, 1.7, this.hunger) };
  }
  /** You come out of a place it has besieged a while, close to it: if it wants you (hungry, or set on you as food, or riled), it
   *  goes for you from where it is, after its dead-still set (the readable last moment). A fed, idle one only comes to see. */
  _siegeAmbush(c) {
    const G = this.mem.siege, PY = this.cfg.prey;
    if (!G || G.who !== this.who || this.t - G.t > 20 || G.T < 25 || c.d > PY.rushD + 5 || this._handling()) return false;
    if (!(this.hunger > 0.45 || (this.ap.H || 0) > 0.15 || this.grudge > 0.3) || this.ap.verdict === 'threat' || !this.canStart('prowl')) return false;
    this._open('ambush'); this._start('prowl', c, 'ambush');
    const b = this.beh; b.ambush = true; b.phase = 'set'; b.at = 0; b.setDur = this.R.range(...PY.setT); this.peril.lastStillT = this.t; this.peril._tell('still', { d: +c.d.toFixed(1), prowl: true });
    this.ambushT = this.t; return true;
  }
  /** Its head going to you (I.probe) when the straight line from its head to you is blocked (planks, a wall): it goes to a gap
   *  instead, the one on the way through which there is a clear line to you (sight or reach), among the ways into whatever you
   *  are in (and into what that is inside); the body comes round to stand off that gap. With no such gap, the head holds off the
   *  wall rather than pressing into it. (NOTES4: at the Loft doorway the shove pressed its snout on the planks beside the gap.) */
  _viaGap(b, I) {
    const P = I.probe, sim = this.sim, T = this.T, h = sim.head.pos; if (!T.segClear) return;
    if (T.segClear(h.x, h.y, h.z, P.x, P.y, P.z, 0.12)) { b.gap = null; return; }
    if (!b.gap || this.t - b.gap.t > 0.6) {
      const Ss = []; const inS = T.insideStructure ? T.insideStructure(P.x, P.z, P.y) : null; if (inS) Ss.push(inS);
      for (const q of T.structures || []) if (!Ss.includes(q) && q.openings && Math.hypot(q.cx - P.x, q.cz - P.z) < Math.max(q.hw, q.hd) + 3) Ss.push(q);
      let best = null, bs = 1e9;
      for (const S of Ss) for (const O of S.openings || []) {
        const nl = Math.hypot(O.nx, O.nz) || 1, nx = O.nx / nl, nz = O.nz / nl, oy = O.up ? O.y : clamp(P.y, (O.y ?? S.base + 1) - 0.6, (O.y ?? S.base + 1) + 1.2);
        const Q = { x: O.x - nx * 0.2, y: oy, z: O.z - nz * 0.2 };      // (just inside the gap)
        if (!T.segClear(Q.x, Q.y, Q.z, P.x, P.y, P.z, 0.05)) continue;      // no line to you from this gap
        const sc = Math.hypot(Q.x - h.x, Q.z - h.z) + Math.hypot(P.x - Q.x, P.y - Q.y, P.z - Q.z);
        if (sc < bs) { bs = sc; best = { ...Q, nx, nz }; }
      }
      b.gap = { t: this.t, Q: best };
    }
    const G = b.gap.Q;
    if (!G) { I.probe = { ...P, k: (P.k || 1) * 0.3, standoff: Math.max(P.standoff || 0, 2.0) }; return; }      // nowhere through: it holds its head off the wall
    // the head to the gap, pressed a little through it toward you; the body round to stand off it, outside
    const dx = P.x - G.x, dy = P.y - G.y, dz = P.z - G.z, dl = Math.hypot(dx, dy, dz) || 1, k = Math.min(0.8, dl);
    I.probe = { x: G.x + dx / dl * k, y: G.y + dy / dl * k, z: G.z + dz / dl * k, k: P.k ?? 1, standoff: Math.min(P.standoff ?? 0, 0.3) };
    if (I.goal && (I.goal.kind === 'approach' || I.goal.kind === 'move')) { const RS = this.sp.dims.reachStop || 4; I.goal = { ...I.goal, x: G.x + G.nx * (RS + 0.5), z: G.z + G.nz * (RS + 0.5), stop: 0.8 }; }
    I.look = { x: P.x, y: P.y, z: P.z, lock: true };
  }
  /** Ways in it has had its head at in a siege of this place (kept ~3 min): the planner tries elsewhere first. */
  _siegeUsed(S) { const G = this.mem.siege; return G && G.id === S.id && G.used ? G.used.filter((u) => this.t - u.t < 180) : []; }
  _siegeUse(S, E) { const G = this.mem.siege; if (G && G.id === S.id) { (G.used || (G.used = [])).push({ x: E.x, z: E.z, t: this.t }); if (G.used.length > 20) G.used.shift(); } }
  /** Coming on openly while watched: head carried low, eyes locked, breathing out loud, a huff and then a rumble more often the
   *  nearer it gets (the tell rises with the closing, not with a timer). */
  _openTell(dt, b, c, I) {
    const W = b.wa || (b.wa = {}), k = clamp((25 - c.d) / 15, 0, 1), a = this.know.target;
    I.alert = Math.max(I.alert || 0, 0.4 + 0.5 * k); I.breathHold = 0; I.agitation = Math.max(I.agitation || 0, 0.15 + 0.35 * k); I.low = Math.max(I.low || 0, 0.6);
    W.tellT = (W.tellT ?? 0.6) - dt;
    if (W.tellT <= 0 && a) { W.tellT = lerp(3.5, 1.4, k) * this.R.range(0.8, 1.2); this.sim.gesture(k > 0.45 && this.R() < 0.55 ? 'rumble' : 'huff', { x: a.x, y: a.y ?? 1.5, z: a.z }); }
  }
  /** In striking range of a thing it is running down: where the gap will be when the jaws get there (~0.25 s, at the rate it is
   *  closing) is inside its reach. */
  _inStrike(b, c) { return c.d - 0.25 * Math.max(0, b.cr || 0) < this.peril.reach() - 0.4; }
  /** A chase it is losing: the gap growing (over ~1 s) while it is already running flat out, after it has had `losingAfter` s
   *  to get going (a big body takes a few seconds to reach its run, and the gap grows meanwhile: that is no reason to stop).
   *  Returns the seconds it has been losing; `chase.giveUp` (+ boldness) of that, or the gap past `lostD`, ends it. */
  _losing(dt, b, c) {
    const CH = this.cfg.chase, sim = this.sim, run = this.sp.dims.run || 8, t0 = b.at ?? 0;
    b.cr = b.dPrev === undefined ? 0 : b.cr + ((b.dPrev - c.d) / Math.max(dt, 1e-3) - b.cr) * Math.min(1, dt / 1.0); b.dPrev = c.d;
    if (c.d < b.best - 0.5) b.best = c.d;
    const flat = Math.abs(sim.v) > CH.flat * run && b.t - t0 > CH.losingAfter;
    b.losing = flat && b.cr < -0.4 ? b.losing + dt : Math.max(0, b.losing - dt);
    return b.losing > CH.giveUp + 2 * this.temper.bold || c.d > CH.lostD;
  }
  /** How much it has come to trust you, as a 0..1 ease (nothing below about 0.2, all of it by about 0.75). */
  get tame() { const x = clamp((this.bond.trust - 0.2) / 0.55, 0, 1); return x * x * (3 - 2 * x); }
  static get BEHAVIOURS() { return ['roam', 'pause', 'listen', 'sniff', 'search', 'stare', 'ambush', 'leave', 'watch', 'stalk', 'circle', 'inspect', 'display', 'bluff', 'chase', 'snap', 'feign', 'backoff', 'nudge', 'revisit', 'besiege', 'investigate', 'trail', 'feed', 'hunt', 'answer', ...PRED, 'avoid', 'guard', 'pounce', 'probe', ...ATTACKS, ...(BOND_ON ? FRIENDLY : [])]; }
  /** Temperament presets for probing: null restores the animal's own. */
  setTemper(preset) {
    const P = { bold: { bold: 0.9, patience: 0.5, curious: 0.8, irritable: 0.6, nervy: 0.2 }, timid: { bold: 0.3, patience: 0.6, curious: 0.5, irritable: 0.25, nervy: 0.8 }, patient: { bold: 0.6, patience: 0.95, curious: 0.7, irritable: 0.3, nervy: 0.3 }, hot: { bold: 0.85, patience: 0.35, curious: 0.5, irritable: 0.9, nervy: 0.5 }, curious: { bold: 0.6, patience: 0.6, curious: 0.98, irritable: 0.3, nervy: 0.35 } };
    this.temper = preset && P[preset] ? { ...P[preset] } : { ...this.baseTemper };
  }
  /** Whether a behaviour has what it needs to run right now. */
  canStart(name) {
    const K = this.know, c = this.ctx || this._ctx();
    if (!BOND_ON && FRIENDLY.includes(name)) return false;
    if (['watch', 'stalk', 'circle', 'inspect', 'display', 'bluff', 'chase', 'snap', 'feign', 'backoff', 'nudge', 'avoid', 'guard'].includes(name)) return !!(K.seen && K.target);
    if (name === 'probe') return !!(K.seen && K.target && K.target.id !== 'observer' && !K.target.ghost && !c.walled && this.cfg.core.on);
    if (['appraise', 'test', 'shadow', 'prowl'].includes(name)) return !!(K.seen && K.target && K.target.id !== 'observer' && !K.target.ghost && !c.walled);
    if (name === 'lurk') return !!(this.mem.haunts && this.mem.haunts.length);
    if (name === 'pounce') return !!(K.seen && K.target && !K.target.dead && K.target.id !== 'observer' && !K.target.ghost);
    if (ATTACKS.includes(name)) return !!(K.seen && K.target && !K.target.dead && !c.walled);
    if (name === 'besiege') return !!(c.enclosed || c.beliefIn);
    if (name === 'feed' || name === 'trail') return !!(this.focus && (this.focus.kind === 'meat' || this.focus.kind === 'carcass'));
    if (name === 'investigate') return !!(this.focus && this.focus.kind === 'flare');
    if (name === 'hunt') return !!this.prey;
    if (name === 'answer') return !!this.thunder;
    if (name === 'greet' || name === 'follow') return !!(K.seen && K.target && K.target.id !== 'observer' && !K.target.ghost && !c.walled);
    if (name === 'pet') return !!(this.touch && this.touch.part === 'snout' && K.target);
    if (name === 'pull') return !!(this.touch && this.touch.part === 'foot' && K.target);
    if (name === 'tend') return !!(this.sim.injury && this.sim.injury.sev > 0.1);
    if (name === 'relief') return !!K.target;
    return true;
  }

  // ---------------------------------------------------------------------- senses
  los(ax, ay, az, bx, by, bz) {
    const T = this.T, n = Math.max(6, Math.ceil(Math.hypot(bx - ax, bz - az) / 4));
    for (let i = 1; i < n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      if (y < T.height(x, z) + 0.15) return false;
    }
    // only what stands near the line (the arena has thousands of stems and wall pillars): the same answer, far less work
    for (const o of T.obstaclesNear ? T.obstaclesNear((ax + bx) / 2, (az + bz) / 2, Math.hypot(bx - ax, bz - az) / 2 + 3.5) : T.obstacles || []) {
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = clamp(((o.x - ax) * dx + (o.z - az) * dz) / L2, 0, 1);
      const cx = ax + dx * t, cz = az + dz * t;
      if (Math.hypot(o.x - cx, o.z - cz) < o.r * (o.kind === 'wall' ? 1.05 : 0.9) && ay + (by - ay) * t < T.height(o.x, o.z) + o.h) return false;
    }
    if (T.roofBlocks && T.roofBlocks(ax, ay, az, bx, by, bz)) return false;
    return true;
  }

  /** How likely the animal is to pick this agent out in one tenth of a second. */
  seeChance(a, world) { const s = this.senseParts(a, world); return Math.max(s.eye, s.near); }
  /** What it gets of an agent, by sense: `eye` (sight), `near` (heard and smelt close by, whatever its eyes are doing). */
  senseParts(a, world) { const near = this._nearChance(a), eye = this._eyeChance(a, world); return { eye, near }; }
  _nearChance(a) {
    if (this.ov.omniscient) return 0;
    if (!(this.ov.senses.smell || this.ov.senses.hearing)) return 0;
    const d = Math.hypot(a.x - this.sim.head.pos.x, a.z - this.sim.head.pos.z), NF = this.sp.senses.nearField;
    // walls between muffle it: inside something it is not in, you are heard and smelt only from close by (at an opening)
    const T = this.T, SI = T.insideStructure ? T.insideStructure(a.x, a.z, a.y) : null, hp = this.sim.head.pos, me = SI && T.insideStructure(hp.x, hp.z, hp.y);
    if (SI && !(me && me.id === SI.id) && SI.openings && SI.openings.length) {
      // through a wall nothing carries: only by way of an opening (the path round through the nearest door), and muffled
      const via = Math.min(...SI.openings.map((o) => Math.hypot(o.x - hp.x, o.z - hp.z) + Math.hypot(o.x - a.x, o.z - a.z))), nf = NF * 0.75;
      return via < nf ? 0.6 * (1 - via / nf) + 0.1 : 0;
    }
    return d < NF ? 0.6 * (1 - d / NF) + 0.15 : 0;
  }
  /** One eye (sd 1 or -1: the head's l side or the other): where it is, and where it looks (forward and out). */
  _eyePos(sd) { const h = this.sim.head; return { x: h.pos.x + h.f.x * 0.42 + h.l.x * sd * 0.55 + h.u.x * 0.4, y: h.pos.y + h.f.y * 0.42 + h.l.y * sd * 0.55 + h.u.y * 0.4, z: h.pos.z + h.f.z * 0.42 + h.l.z * sd * 0.55 + h.u.z * 0.4 }; }
  _eyeAxis(sd) { const h = this.sim.head, x = h.f.x * 0.8 + h.l.x * sd * 0.6, y = h.f.y * 0.8 + h.l.y * sd * 0.6, z = h.f.z * 0.8 + h.l.z * sd * 0.6, n = Math.hypot(x, y, z) || 1; return { x: x / n, y: y / n, z: z / n }; }
  /** How much each eye gets of a point (0..1): inside that eye's field, not dazzled, lids not shut (the pose: drowsy lids and
   *  the squint the body is making; a shut eye is a blind eye). The better eye counts. */
  eyeAcuity(x, y, z) {
    const DZ = this.dazzle || { 1: 0, [-1]: 0 }, sim = this.sim, shut = Math.max((sim.lid || 0) > 0.6 ? sim.lid : 0, 0.7 * (sim.squint || 0)), per = {};
    for (const sd of [1, -1]) {
      const E = this._eyePos(sd), o = this._eyeAxis(sd), dx = x - E.x, dy = y - E.y, dz = z - E.z, d = Math.hypot(dx, dy, dz) || 1, ang = Math.acos(clamp((dx * o.x + dy * o.y + dz * o.z) / d, -1, 1));
      const inField = ang < 1.25 ? 1 : ang < 1.6 ? (1.6 - ang) / 0.35 : 0;
      per[sd] = inField * Math.max(0, 1 - 1.15 * DZ[sd]) * (1 - shut);      // a fully dazzled eye sees nothing
    }
    this.lastAcuity = per;
    return Math.max(per[1], per[-1]);
  }
  _eyeChance(a, world) {
    if (this.ov.omniscient) return 1;
    if (!this.ov.senses.sight) return 0;
    return this._eyeRaw(a, world) * this.eyeAcuity(a.x, a.y, a.z);
  }
  _eyeRaw(a, world) {
    const h = this.sim.head, dx = a.x - h.pos.x, dy = a.y - h.pos.y, dz = a.z - h.pos.z, d = Math.hypot(dx, dy, dz);
    if (d > 150) return 0;
    const SN = this.sp.senses, near = 0;
    const cosA = (dx * h.f.x + dy * h.f.y + dz * h.f.z) / d, ang = Math.acos(clamp(cosA, -1, 1));
    // forward-facing eyes: binocular and sharpest ahead, still good to the side, blind behind
    const field = ang < SN.sharp ? 1 : ang < SN.mid ? lerp(1, 0.55, (ang - SN.sharp) / (SN.mid - SN.sharp)) : ang < SN.field ? lerp(0.55, 0.15, (ang - SN.mid) / (SN.field - SN.mid)) : 0;
    if (field <= 0) return near;
    if (!this.los(h.pos.x, h.pos.y, h.pos.z, a.x, a.y, a.z)) return near;
    const motion = clamp(a.speed / 2, 0, 1), cov = this._coverFor(a.x, a.z, a.crouch, d);
    // what makes a person hard to pick out: low light, distance, a low outline, and something in front of them
    const outline = (1 - SN.motionCue) + SN.motionCue * motion;
    const hide = (a.crouch ? 0.55 : 1) * (1 - 0.85 * cov) * (1 - 0.35 * cov * (1 - motion));
    const light = Math.max(world.flash ? 1 : world.light, this.lightAt(a.x, a.z, world));
    let p = field * outline * hide * light / (1 + (d / SN.sightScale) ** 2);
    if (a.torch) p = Math.max(p, field * 0.9 / (1 + (d / (SN.sightScale * 2.2)) ** 2));      // a lamp in the dark is the most visible thing there is
    return clamp(Math.max(near, p), 0, 1);
  }
  /** How well what grows at (x, z) hides a person there (0..1): ferns (~1 m) hide someone crouching and only half hide someone
   *  standing; tall grass and reeds hide either. From close by it looks down into it and sees through. */
  _coverFor(x, z, crouch, d = 30) {
    const T = this.T, c = T.coverAt ? T.coverAt(x, z) : 0; if (c <= 0) return 0;
    const h = T.coverHeight ? T.coverHeight(x, z) : 1, tall = clamp(h / (crouch ? 1.0 : 1.7), 0, 1);
    return c * (crouch ? tall : 0.35 + 0.65 * tall ** 3) * clamp((d - 3) / 9, 0.25, 1);
  }
  /** The wind as it blows where it stands (terrain.windAt), and between it and a place (the mean of the two ends). */
  _windHere(w) { const T = this.T; return T.windAt ? T.windAt(this.sim.x, this.sim.z, w || { x: 0, z: 0 }, this._wh || (this._wh = { x: 0, z: 0 })) : w || { x: 0, z: 0 }; }
  _windBetween(x, z, w) {
    const T = this.T; if (!T.windAt) return w || { x: 0, z: 0 };
    const a = this._windHere(w), b = T.windAt(x, z, w || { x: 0, z: 0 }, this._wt || (this._wt = { x: 0, z: 0 })), o = this._wb || (this._wb = { x: 0, z: 0 });
    o.x = (a.x + b.x) / 2; o.z = (a.z + b.z) / 2; return o;
  }
  /** Extra light at a place: a burning flare lights everything round it. */
  lightAt(x, z, world) {
    let L = 0;
    for (const t of world.things || []) if (t.bright > 0) { const d = Math.hypot(t.x - x, t.z - z); L = Math.max(L, t.bright * clamp(1.3 - d / 14, 0, 1)); }
    return L;
  }

  // ---------------------------------------------------------------------- belief
  // ---------------------------------------------------------------------- the world's bounds
  // A world may give its fence as a rectangle anywhere (`T.rect` {x0, x1, z0, z1}); without one it is the old round paddock
  // round the origin (radius `T.arena`), and every use below keeps exactly its old reckoning.
  /** Inside the bounds, at least m in from the edge. */
  _inB(x, z, m) { const r = this.T.rect; return r ? x > r.x0 + m && x < r.x1 - m && z > r.z0 + m && z < r.z1 - m : Math.hypot(x, z) < this.T.arena - m; }
  /** The nearest point at least m in from the edge (the middle, if the bounds are narrower than that). */
  _clampB(x, z, m) {
    const r = this.T.rect;
    if (r) { const c = (v, a, b) => (a + m > b - m ? (a + b) / 2 : clamp(v, a + m, b - m)); return [c(x, r.x0, r.x1), c(z, r.z0, r.z1)]; }
    const d = Math.hypot(x, z), lim = this.T.arena - m; return d > lim ? [x * lim / d, z * lim / d] : [x, z];
  }
  /** The middle of the bounds and their half-sizes. */
  _midB() { const r = this.T.rect; return r ? { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, hx: (r.x1 - r.x0) / 2, hz: (r.z1 - r.z0) / 2 } : { x: 0, z: 0, hx: this.T.arena, hz: this.T.arena }; }
  /** Walking distances from where it stands (nav.field), kept for a moment (several goals are scored at once). */
  _walkField() {
    const nav = this.sim.nav; if (!nav || !nav.field) return null;
    const W = this._wf; if (W && this.t - W.t < 1 && Math.hypot(W.x - this.sim.x, W.z - this.sim.z) < 2) return W.F;
    const F = nav.field(this.sim.x, this.sim.z); this._wf = { t: this.t, x: this.sim.x, z: this.sim.z, F }; return F;
  }
  /** A goal it can walk to: (x, z) itself when its body can get there from where it stands, else the nearest place that it can. */
  _reachGoal(x, z) {
    const nav = this.sim.nav; if (!nav || !nav.reachable || nav.reachable(this.sim.x, this.sim.z, x, z)) return [x, z];
    return nav.nearestOpen(x, z, [this.sim.x, this.sim.z]);
  }

  _randomParticle() {
    const R = this.R, a = R() * Math.PI * 2, r0 = Math.sqrt(R()), B = this.T.rect;
    if (B) { const M = this._midB(), u = Math.sin(a) * r0, v = Math.cos(a) * r0; return { x: M.x + u * Math.max(1, M.hx - 5), z: M.z + v * Math.max(1, M.hz - 5), w: 1 / NP, hd: R() * 6.283, sp: R.range(0, 2.2) }; }
    const r = r0 * (this.T.arena - 5);
    return { x: Math.sin(a) * r, z: Math.cos(a) * r, w: 1 / NP, hd: R() * 6.283, sp: R.range(0, 2.2) };
  }
  _seed(x, z, sigma, frac, vx = 0, vz = 0) {
    const R = this.R, P = this.p, n = Math.floor(NP * frac);
    P.sort((a, b) => a.w - b.w);
    for (let i = 0; i < n; i++) {
      const p = P[i], g1 = Math.sqrt(-2 * Math.log(Math.max(R(), 1e-6))), g2 = R() * 6.283;
      p.x = x + Math.cos(g2) * g1 * sigma; p.z = z + Math.sin(g2) * g1 * sigma; p.w = 1 / NP;
      p.hd = Math.hypot(vx, vz) > 0.3 ? bearing(vx, vz) + R.range(-0.6, 0.6) : R() * 6.283; p.sp = Math.hypot(vx, vz) > 0.3 ? Math.hypot(vx, vz) * R.range(0.5, 1.2) : R.range(0, 1.6);
    }
    this._norm();
  }
  _norm() { let s = 0; for (const p of this.p) s += p.w; for (const p of this.p) p.w /= s || 1; }
  _beliefStep(dt, world) {
    const R = this.R, P = this.p, h = this.sim.head, lim = this.T.arena + 8, light = world.flash ? 1 : world.light;
    const near = this.T.obstaclesNear;
    for (const p of P) {             // the intruder may have moved
      p.hd += R.range(-0.7, 0.7) * dt * 3; p.x += Math.sin(p.hd) * p.sp * dt; p.z += Math.cos(p.hd) * p.sp * dt;
      if (this.T.rect) { if (!this._inB(p.x, p.z, -8)) { [p.x, p.z] = this._clampB(p.x, p.z, -8); p.hd += Math.PI; } }
      else { const r = Math.hypot(p.x, p.z); if (r > lim) { p.x *= lim / r; p.z *= lim / r; p.hd += Math.PI; } }
      for (const o of near ? near(p.x, p.z, 0) : this.T.obstacles) { const d = Math.hypot(p.x - o.x, p.z - o.z); if (d < o.r) { p.x = o.x + (p.x - o.x) / (d || 1) * o.r; p.z = o.z + (p.z - o.z) / (d || 1) * o.r; } }
    }
    if (!this.know.seen) {           // looking at a place and not seeing anything there is evidence too
      for (const p of P) {
        const y = this.T.height(p.x, p.z) + 1.2, dx = p.x - h.pos.x, dy = y - h.pos.y, dz = p.z - h.pos.z, d = Math.hypot(dx, dy, dz);
        if (d > 80) continue;
        const ang = Math.acos(clamp((dx * h.f.x + dy * h.f.y + dz * h.f.z) / d, -1, 1));
        if (ang > 1.1) continue;
        const q = 0.32 * (ang < this.sp.senses.sharp ? 1 : 0.5) * light * (1 - 0.85 * this._coverFor(p.x, p.z, true, d)) / (1 + (d / this.sp.senses.sightScale) ** 2);     // ferns could still hide someone crouching
        if (q > 0.01 && this.los(h.pos.x, h.pos.y, h.pos.z, p.x, y, p.z)) p.w *= 1 - q;
      }
      this._norm();
    }
    let neff = 0; for (const p of P) neff += p.w * p.w; neff = 1 / neff;
    if (neff < NP * 0.45) {          // resample
      const out = [], step = 1 / NP; let u = R() * step, c = P[0].w, i = 0;
      for (let k = 0; k < NP; k++) { while (u > c && i < NP - 1) { i++; c += P[i].w; } const s = P[i]; out.push({ x: s.x + R.range(-0.8, 0.8), z: s.z + R.range(-0.8, 0.8), w: step, hd: s.hd + R.range(-0.4, 0.4), sp: s.sp }); u += step; }
      this.p = out;
      for (let k = 0; k < 3; k++) this.p[Math.floor(R() * NP)] = this._randomParticle();     // never be entirely sure
      this._norm();
    }
    // the densest place: where it would go and look
    let best = null, bw = -1;
    for (let k = 0; k < 36; k++) {
      const c = this.p[Math.floor(R() * NP)]; let w = 0;
      for (const p of this.p) if ((p.x - c.x) ** 2 + (p.z - c.z) ** 2 < 49) w += p.w;
      if (w > bw) { bw = w; best = c; }
    }
    let sx = 0, sz = 0, sw = 0;
    for (const p of this.p) if ((p.x - best.x) ** 2 + (p.z - best.z) ** 2 < 100) { sx += p.x * p.w; sz += p.z * p.w; sw += p.w; }
    this.sum.x = sx / sw; this.sum.z = sz / sw; this.sum.cert = bw;
  }

  // ---------------------------------------------------------------------- perception and mood
  _perceive(dt, world) {
    // the one it knew is dead and no longer there (eaten, or the body gone): nothing left of it to look for
    if (this.who && this.deadWho === this.who && !world.agents.some((q) => whoOf(q) === this.who)) this._forget('dead');
    const K = this.know, M = this.mood, R = this.R, sim = this.sim, h = sim.head;
    // pick the agent it is most likely to see (co-op: whoever is most visible or already tracked)
    let best = null, bp = 0;
    const agentsSeen = this.ov.notice.you ? world.agents : [];
    for (const a of agentsSeen) { const p = this.seeChance(a, world) * (K.target && whoOf(K.target) === whoOf(a) ? 1.6 : 1); if (p > bp || !best) { bp = p; best = a; } }
    const a = best;
    if (!a && K.seen) { K.lost += dt; if (K.lost > 0.5) { K.seen = false; K.via = null; if (K.target) this._onLost(K.target); } }      // gone from the world (eaten, or nobody there)
    if (a) {
      const sp = this.senseParts(a, world), p = Math.max(sp.eye, sp.near);
      if (!K.seen) {
        // (eyes set on where a thing it is worked up about went out of sight pick up the least glimpse of it there: the cat at the hole)
        const VA = this.ap.vanishAt, prime = VA && this.t - VA.t < 30 && Math.hypot(a.x - VA.x, a.z - VA.z) < 10 ? this.cfg.prey.prime * this.ap.arousal : 0;
        K.ev = Math.max(0, K.ev + p * dt * (3 + 5 * M.arousal) * (1 + prime) - dt * 0.12);
        if (K.ev > K.thr) {
          this._meet(a);
          K.seen = true; K.lost = 0; K.ev = 0; K.thr = R.range(0.7, 1.7); K.seenSince = this.t;
          K.via = sp.eye > 0.02 ? 'sight' : 'near'; this._track(0, a, K.via, true);
          this._onSight(a, world);
        }
      } else {
        if (p < 0.02) K.lost += dt; else K.lost = 0;
        if (K.lost > lerp(0.8, 2.5, this.temper.patience)) { K.seen = false; K.via = null; this._onLost(K.target || a); }
      }
      if (K.seen) {
        // what reaches it this tick, and by which sense: its eyes; its nose and ears close by (where you are, and only what
        // your feet say of how fast); or nothing (the moment after you went out of sight: where you were, going the way you went)
        K.via = sp.eye > 0.02 ? 'sight' : sp.near > 0.02 ? 'near' : 'memory';
        if (K.via === 'sight') K.lastEyeT = this.t;
        this._track(dt, a, K.via);
        const g = K.target;
        K.last = { x: g.x, y: g.y, z: g.z }; K.lastSeenT = this.t; K.seenTime += dt;
        if (K.via !== 'memory') for (const q of this.p) { q.x = g.x + R.range(-0.8, 0.8); q.z = g.z + R.range(-0.8, 0.8); q.w = 1 / NP; q.hd = bearing(g.vx, g.vz) + R.range(-0.5, 0.5); q.sp = g.speed * R.range(0.3, 1.1); }
        const dd = Math.hypot(g.x - sim.x, g.z - sim.z), toward = clamp(-(g.vx * (g.x - sim.x) + g.vz * (g.z - sim.z)) / (dd || 1), 0, 4);
        const fresh = Math.exp(-(this.t - K.seenSince) / 40), novelty = clamp(g.speed / 3, 0, 1) * 0.6 + toward * 0.25 + (dd < 10 ? 0.3 * fresh : 0);
        this.closeTime = dd < 12 ? (this.closeTime || 0) + dt : Math.max(0, (this.closeTime || 0) - dt * 0.5);
        M.interest = clamp(M.interest + dt * (0.05 * novelty - (this.t - K.seenSince > 15 ? 0.012 : 0)), 0, 1);
        M.arousal = clamp(M.arousal + dt * 0.04 * (novelty - 0.15), 0, 1);
        if (dd < 10) M.irritation = Math.min(1, M.irritation + dt * (0.03 * toward + 0.002) * (0.5 + this.temper.irritable) * (1 - 0.85 * this.tame) * (1 + this.pain));
      }
      // smell: the intruder upwind of it, close enough
      const dx = a.x - sim.x, dz = a.z - sim.z, d = Math.hypot(dx, dz), w = this._windBetween(a.x, a.z, world.wind);
      const up = d > 0.1 ? (-(dx * w.x + dz * w.z) / d) / (Math.hypot(w.x, w.z) || 1) : 0;
      const SM = this.ov.senses.smell ? this.sp.senses.smell : 0, sc = up > 0.55 && d < SM ? (1 - d / SM) * (up - 0.55) / 0.45 * Math.hypot(w.x, w.z) / 4 : 0;
      this.scent += (sc - this.scent) * expK(dt, 4);
      if (this.scent > 0.08 && !K.seen) {
        const wh = this._windHere(world.wind); this.scentDir = bearing(-wh.x, -wh.z);      // it turns into the wind where it stands
        M.interest = Math.min(1, M.interest + this.scent * dt * 0.25);
        if (R() < dt * 0.6) for (const p of this.p) { const pd = Math.hypot(p.x - sim.x, p.z - sim.z), pa = bearing(p.x - sim.x, p.z - sim.z); if (Math.cos(pa - this.scentDir) < 0.75 || pd > SM + 5) p.w *= 0.55; }
      }
    }
    // sounds
    for (const n of (this.ov.senses.hearing && this.ov.notice.sounds ? world.noises : [])) {
      const d = Math.hypot(n.x - h.pos.x, n.z - h.pos.z), range = n.loud * this.sp.senses.hearing;
      if (n.kind === 'roar' || n.kind === 'hit' || n.kind === 'yelp') continue;          // its own voice, and a blow it already felt
      if (n.kind === 'thunder') { this.thunder = { x: n.x, z: n.z, t: this.t }; M.arousal = Math.min(1, M.arousal + 0.05); continue; }
      if (n.kind === 'prey') { if (d < range) { this.preyHeard = { x: n.x, z: n.z, t: this.t }; M.arousal = Math.min(1, M.arousal + 0.1); } continue; }
      if (d > range) continue;
      // habituation is per kind of sound (or per source, when the world names one: n.src): a sound that keeps coming dulls itself
      // fully and every other sound only half as much, so a constant background noise does not deafen it to footsteps
      const cls = n.src || n.kind || 'noise', Hb = this.mem.hab || (this.mem.hab = {});
      // a sound that keeps coming from the same place, of the same kind, with nothing ever found there (steady: per place and kind,
      // or per source) fades right out: it becomes the background. It then no longer dulls other sounds either, so a quieter
      // sound near it stands out against it again. Finding you by it (seen near it) makes it news again.
      const SD = this.mem.steady || (this.mem.steady = []);
      let st = SD.find((q) => q.cls === cls && Math.hypot(q.x - n.x, q.z - n.z) < 10 + 0.15 * d);
      if (!st) { st = { cls, kind: n.kind, x: n.x, z: n.z, k: 0, t: this.t, n: 0 }; SD.push(st); if (SD.length > 12) SD.shift(); }
      else { if (this.t - st.t < 6) st.k = Math.min(1, st.k + 0.035); st.x += (n.x - st.x) * 0.2; st.z += (n.z - st.z) * 0.2; st.t = this.t; }
      st.n++;
      if (st.k > 0.7 && !st.hushed) {
        st.hushed = true; this.mem.hush = { t: this.t, kind: n.kind, x: st.x, z: st.z };
        const bb = this.beh; if (bb && bb.name === 'search' && bb.fromSound && bb.soundKind === n.kind) { bb.done = true; this.startle = null; }      // going to it is pointless
      }
      const bg = st.k * st.k;
      const loudHere = n.loud * (1 - d / range), novelty = (1 - 0.75 * Math.max(Hb[cls] || 0, 0.5 * this.mem.noiseHab)) * (1 - bg);
      if (bg > 0.5) continue;      // the background: not news, not where you are, and it does not dull anything else
      // a whistle: a thin, strange call that carries right across the paddock; worth going to see, until it learns it
      // comes to nothing (its own habituation, which wears off over a minute or two)
      const wh = n.kind === 'whistle' ? this.mem.whistleHab || 0 : 0;
      let sal = loudHere * novelty * (0.6 + 0.8 * this.temper.nervy) * (1 + M.arousal) * (1 + 0.8 * this.ap.fear);
      if (n.kind === 'whistle') { sal = Math.max(sal, 0.32 * (0.5 + 0.5 * (1 - d / range))) * (1 - 0.85 * wh); this.mem.whistleHab = Math.min(1, wh + 0.3); this.mem.whistleT = this.t; }
      // where it thinks the sound came from: right direction, rough distance
      const muff = this.T.insideStructure && this.T.insideStructure(n.x, n.z) && !this.T.insideStructure(h.pos.x, h.pos.z) ? 1.8 : 1;      // through walls: blurred
      const err = (0.08 + 0.12 * (1 - loudHere)) * muff, ang = bearing(n.x - h.pos.x, n.z - h.pos.z) + R.range(-1, 1) * err, dist = d * R.range(1 - err * 2, 1 + err * 2);
      const ex = h.pos.x + Math.sin(ang) * dist, ez = h.pos.z + Math.cos(ang) * dist;
      // once fooled, a lone sound is weighed against what it already believed
      const trust = 1 - 0.6 * this.mem.fooled;
      for (const p of this.p) { const pd2 = (p.x - ex) ** 2 + (p.z - ez) ** 2, s = 3 + d * 0.12; p.w *= (1 - trust) + trust * (0.05 + Math.exp(-pd2 / (2 * s * s))); }
      this._seed(ex, ez, 3 + d * 0.1, 0.35 * trust);
      M.arousal = Math.min(1, M.arousal + sal * 0.6); M.interest = Math.min(1, M.interest + sal * 0.35);
      if (n.kind === 'shout' && this.know.seen && this.know.target && Math.hypot(n.x - this.know.target.x, n.z - this.know.target.z) < 5) this.ap.onLoud(sal, Math.hypot(n.x - sim.x, n.z - sim.z));
      if ((n.kind === 'shout' || n.kind === 'whistle') && this.know.seen && this.know.target && Math.hypot(n.x - this.know.target.x, n.z - this.know.target.z) < 5) { this.ap.act(n.kind === 'shout' ? 'loud' : 'call'); this.ap.shoutT = this.t; }
      if (n.kind === 'shove') M.irritation = Math.min(1, M.irritation + 0.35 * (0.5 + this.temper.irritable));
      { const inc = n.kind === 'step' ? 0.05 : n.kind === 'whistle' ? 0.04 : 0.18; this.mem.noiseHab = Math.min(1, this.mem.noiseHab + inc * (1 - bg)); Hb[cls] = Math.min(1, (Hb[cls] || 0) + inc); }
      const fast = n.kind === 'step' && n.loud > (n.splash ? 0.2 : 0.1);      // a splash is loud for the water, not for the pace
      // what made it, as far as it knows: a thing it saw flying, or lying there, where the sound came from, is what landed (a
      // thrown thing's thump is that thing's, not the thrower's body), with what it saw of it (bright, smelly)
      let obj = null;
      if (n.kind === 'thud') for (const id in this.objMem) { const q = this.objMem[id]; if (q.x !== undefined && Math.hypot(q.x - n.x, q.z - n.z) < 2.5 && (this.t - (q.flySeenT ?? -99) < 3 || this.t - (q.lastSeenT ?? -99) < 1)) { obj = { id: +id || id, bright: !!q.bright, smelly: !!q.smelly, sawFly: this.t - (q.flySeenT ?? -99) < 3 }; break; } }
      this.mem.lastNoise = { x: ex, z: ez, t: this.t, sal, kind: n.kind, hab: wh, fast, splash: !!n.splash, d, obj };
      if (n.kind === 'step') this.mem.steps = { x: ex, z: ez, t: this.t, fast, splash: !!n.splash, d };      // footfalls: running ones carry
      if (sal > 0.12 && !(n.kind === 'whistle' && wh > 0.7) && (!this.startle || sal > this.startle.sal)) this.startle = { x: ex, z: ez, y: this.T.height(ex, ez) + 1, sal, kind: n.kind };
      // the orienting reflex: a sound that matters snaps the head round to it at once, whatever it was doing; what to do
      // about it is decided after (a held strike or a mouthful is not dropped for it)
      const atYou = !obj && this.know.seen && this.know.target && Math.hypot(n.x - this.know.target.x, n.z - this.know.target.z) < 4;      // the thud of you landing is you, not news (a thing it saw land there is that thing)
      if (sal > 0.07 && !atYou && !this._handling() && !(sim.gapNear > 0.05 || sim.headBlocked > 0) && (!this.orientTo || this.t - this.orientTo.t > 0.6 || sal > this.orientTo.sal * 1.5)) {
        const pt = { x: ex, y: this.T.height(ex, ez) + 1.4, z: ez };
        if (sim.gesture('orient', pt)) this.orientTo = { ...pt, t: this.t, sal, kind: n.kind };
      }
      if (sal > 0.38 && d < 40 && this.t - (this.lastFlinch ?? -99) > 6) { this.lastFlinch = this.t; this.sim.gesture('startle', { x: n.x, y: n.y, z: n.z }); }
    }
    this._perceiveWorld(dt, world);
    // mood drifts
    const P = this.temper.patience;
    M.arousal += (0.1 + 0.12 * M.irritation - M.arousal) * expK(dt, 20 + 30 * P);
    M.interest *= 1 - dt / (45 + 90 * P) * (K.seen ? 0.2 : 1);
    M.irritation *= 1 - dt / 120;
    M.boredom = clamp(M.boredom + dt * (K.seen || this.startle ? -0.05 : 0.006), 0, 1);
    if (this.mem.steady) for (const q of this.mem.steady) { if (this.t - q.t > 10) q.k *= 1 - dt / 20; if (q.k < 0.3) q.hushed = false; if (K.seen && K.target && Math.hypot(K.target.x - q.x, K.target.z - q.z) < 8) { q.k = 0; q.hushed = false; } }
    this.mem.noiseHab *= 1 - dt / 150; if (this.mem.hab) for (const k in this.mem.hab) this.mem.hab[k] *= 1 - dt / 150; this.mem.fooled *= 1 - dt / 400; if (this.mem.whistleHab) this.mem.whistleHab *= 1 - dt / 75;
    for (const [k, v] of Object.entries(this.ov.hold)) { if (v === null || v === undefined) continue; if (k === 'hunger') this.hunger = v; else M[k] = v; }
    for (const k of ['bold', 'curious', 'patience']) this.drift[k] = clamp(this.drift[k] + R.range(-1, 1) * dt * 0.01 - this.drift[k] * dt * 0.003, -0.15, 0.15);
    this._bondStep(dt);
  }

  // ---------------------------------------------------------------------- the bond
  /** Something you did that it will hold against you. Done after it had come to trust you, it is a betrayal. */
  _wrong(kind, amt) {
    const B = this.bond, fresh = !B.lastBad || this.t - B.lastBad.t > 15;
    if (fresh && B.trust > 0.3) {
      B.betrayals++; B.betrayedT = this.t; B.scar = Math.min(1, B.scar + 0.3 + 0.4 * B.trust);
      this.grudge = Math.min(1, this.grudge + 0.3 * B.trust); this.mood.irritation = Math.min(1, this.mood.irritation + 0.3 * B.trust);
    }
    B.trust = Math.max(B.saved && B.betrayals < 2 ? 0.3 : 0, B.trust - amt * (1 + 1.5 * B.trust));
    if (fresh) B.wrongs++;
    B.lastBad = { kind, t: this.t };
  }
  /** Something you did that it will remember well; a scar from an old betrayal makes it slow to believe. */
  _good(kind, amt) {
    if (!BOND_ON) return;
    const B = this.bond; B.trust = Math.min(1, B.trust + amt * (1 - 0.75 * B.scar) * (B.saved ? 1.4 : 1));
    if (!B.lastGood || B.lastGood.kind !== kind || this.t - B.lastGood.t > 1) B.lastGood = { kind, t: this.t };
  }
  _bondStep(dt) {
    if (!BOND_ON) return;
    const B = this.bond, K = this.know, a = K.target, M = this.mood;
    B.scar *= 1 - dt / 1500;
    if (!K.seen || !a || a.id === 'observer' || a.ghost) { if (!K.seen) B.trust *= 1 - dt / 2400; return; }
    // quiet company: you near it, not running at it or away, nothing done to it lately
    const d = Math.hypot(a.x - this.sim.x, a.z - this.sim.z);
    const calm = a.speed < 2.2 && this.glare < 0.3 && (!B.lastBad || this.t - B.lastBad.t > 30) && M.irritation < 0.45 && (a.state || 'free') === 'free' && !(this.beh && ATTACKS.includes(this.beh.name));
    if (calm && d < 22) this._good('calm', dt * 0.0032 * (1 - d / 22) * (a.crouch || a.speed < 0.3 ? 1.35 : 1));
    if (this.petting) { this._good('pet', dt * 0.012); B.petted += dt; }
  }
  /** A jolt from the sore foot (the body reports it). */
  onPain(k) { this.painSpike = Math.min(1, this.painSpike + 0.25 * k); }
  /** Someone took the meat it was eating or about to eat. */
  onTaken(id, by, at) {
    const mine = (this.focus && this.focus.id === id) || (this.beh && this.beh.obj === id);
    if (!mine) return;
    const K = this.know, saw = K.seen && K.target && K.target.id === by, d = Math.hypot(at.x - this.sim.x, at.z - this.sim.z);
    if (saw || d < 14) { this._wrong('steal', 0.2); this.grudge = Math.min(1, this.grudge + 0.15); this.mood.irritation = Math.min(1, this.mood.irritation + 0.35); this.lastWrong = { kind: 'steal', t: this.t }; this.wrongs.food += 1; this.ap.onStolen(); }
    this.focus = null;
  }
  /** It has killed you (arena.js): the anger is spent; if it was hungry, there is meat now. It remembers. */
  onKill(id, cause, eat, who = null) {
    this.kills = (this.kills || 0) + 1; this.killedT = this.t; this.killCause = cause; this.killEat = eat;
    this.kind.killed++; if (who && who === this.who) this.deadWho = who;
    this.grudge *= 0.35; this.mood.irritation *= 0.4; this.mood.arousal = Math.min(1, this.mood.arousal + 0.2); this.peril.onKill();
    this.ap.outcome(eat ? 'killed-eat' : 'killed');
    if (this.beh && ATTACKS.includes(this.beh.name)) { if (this.beh.contact) this._vent(this.beh); this.beh.done = true; }
    void id;
  }
  /** The thorn is out: a jolt of pain, then relief, and something it does not forget. */
  onThorn(by) {
    const B = this.bond; B.saved = true; B.savedT = this.t; B.trust = Math.min(1, Math.max(B.trust + 0.35, 0.72)); B.scar *= 0.3;
    this.grudge *= 0.2; this.mood.irritation *= 0.3; this.painSpike = 1; this.allowPull = false;
    this.sim.gesture('wince', null, { force: 1.2, over: true });
    this.beh && (this.beh.done = true); this._start('relief', this.ctx || this._ctx(), 'thorn out');
    void by;
  }

  /** The orienting reflex for things (general over what a thing is like: bright, moving, smelly; never what it is called): a
   *  thing that newly shows (comes into sight flying or lying there, lights up) always turns the head and eyes to it, for a beat
   *  of attention, whatever it is doing (short of having hold of you). What it has learnt of that kind of thing (`mem.objHab`,
   *  by its properties; it wears off over minutes) only shortens how long the look holds (4 s new, ~1.2 s well known) and
   *  whether it leaves what it was doing for it (investigate is weighed with the novelty; a new kind breaks its commitment).
   *  While the thing flies the look follows it; the hold is counted from where it comes to rest. */
  _orientObj(dt, t, m, see) {
    if (see < 0.2 && !m.oriented) return;
    const sig = [t.bright > 0 ? 'bright' : '', (t.scent || 0) > 0.2 ? 'smelly' : ''].filter(Boolean).join('+') || (!t.rest ? 'moving' : 'thing');
    const OH = this.mem.objHab || (this.mem.objHab = {}), A = this.att, key = 'obj:' + t.id;
    const hab = (s) => { const e = OH[s]; return e ? e.h * Math.exp(-(this.t - e.t) / 240) : 0; };
    if (!m.oriented && see >= 0.2 && (t.bright > 0 || !t.rest || (t.scent || 0) > 0.2)) {
      // first sight: the head goes to it now; what it knows of the kind decides how long it stays there
      const h0 = hab(sig), nov = 1 - h0, hold = lerp(4, 1.2, clamp(h0 / 0.8, 0, 1)) * this.R.range(0.85, 1.15);
      m.oriented = true; m.nov = nov; m.sig = sig; m.holdS = hold; m.orientT = this.t;
      OH[sig] = { h: h0 + 0.4 * (1 - h0), t: this.t, n: (OH[sig] ? OH[sig].n : 0) + 1 };
      this.objOrient = { id: t.id, t: this.t, nov, hold, sig, bright: t.bright > 0, smelly: (t.scent || 0) > 0.2, flying: !t.rest, landed: false };
      if (!this._handling() && A) { const p = A.pos(key) || { x: t.x, y: t.y, z: t.z }; A._glance(key, nov > 0.6 ? 'interrupt' : 'look', t.rest ? hold : hold + 1.5); if (A._off(p) > 0.5) this.sim.gesture('orient', p); }
      if (nov > 0.6) this._open('novel');      // a kind of thing it has never seen breaks off what it was set on: it is weighed afresh
      return;
    }
    // in flight the look follows it; where it lands the look holds for the beat (from the landing)
    if (m.oriented && this.objOrient && this.objOrient.id === t.id && !this.objOrient.landed && this.t - m.orientT < 6) {
      if (t.rest) { this.objOrient.landed = true; this.objOrient.landT = this.t; if (A && !this._handling()) { const p = A.pos(key); A._glance(key, m.nov > 0.6 ? 'interrupt' : 'look', m.holdS); if (p && A._off(p) > 0.5) this.sim.gesture('orient', p); } }
      else if (A && A.glance && A.glance.key === key) A.glance.until = Math.max(A.glance.until, this.t + 0.4);
    }
  }
  /** A knock of its body (rex.js crashS: `reel` head-on, `hard` a blow at speed, else a clip). T11 (the owner: "it needs to have a thought
   *  when it crashes into something and hurts itself. not having one is jarring. if its frustrated and getting wound up it may start
   *  ignoring the pain signals though"): the thought used to come only from thoughts.js 'crash', at 0.6 to 0.82 priority, so it waited for
   *  the stream's gap (1.7 to 3 s, 2.5 times that when idle), could be weighed away by attention, was limited to one in 20 s, and was
   *  pushed out by the next behaviour's thought. Now each knock says one thing at once, held 1.8 s, scaled to it; a hard one is felt
   *  (pain, a little care near the place); wound up (irritation above 0.45, or frustration above 0.5, or aroused above 0.6 on a chase)
   *  it brushes it off: nothing, or a dismissal, and no pain, no care. */
  _onCrash(C, k) {
    const M = this.mood, t = this.t, bn = this.beh ? this.beh.name : '', chasing = ['chase', 'pounce', 'hunt', 'bluff', 'seize'].includes(bn) || (bn === 'prowl' && this.beh.phase === 'rush');
    const lvl = C.reel > 0.5 ? 'reel' : C.hard > 0.5 || k >= 2.5 ? 'hard' : 'light', wound = M.irritation > 0.45 || this.peril.frus > 0.5 || (M.arousal > 0.6 && chasing);
    this.thinker.keyT.set('crash', t); this.thinker.keyT.set('bump', t);      // (thoughts.js 'crash' would say it a second time, late)
    if (wound) { if (lvl !== 'light' && this.thinker.R() < 0.6) this._say('crash', ['no. stop', 'not care', 'no stop. go']); return; }
    if (lvl === 'light') { this._say('crash', ['bump', 'bump. side', 'bump. ok']); return; }
    this.onPain(lvl === 'reel' ? 1.6 : 1);      // (painSpike: it feeds irritation as it fades)
    this.wary = { x: this.sim.x, z: this.sim.z, until: t + 20 };
    this._say('crash', lvl === 'reel' ? ['OW. head hurt', 'OW. head. hurt', 'ow! head hurt'] : ['ow. hard thing', 'ow. that hurt', 'ow. hard thing there']);
    if (lvl === 'reel') this.crashAfter = { at: t + Math.max(1.9, C.dur) };      // and, once the head has stopped ringing, a word of care
  }
  /** Objects, prey, blows and light: everything that is not the intruder. */
  _perceiveWorld(dt, world) {
    const sim = this.sim, h = sim.head, M = this.mood, R = this.R, SN = this.sp.senses, w = world.wind || { x: 0, z: 0 }, wl = Math.hypot(w.x, w.z) || 1;
    this.hunger = Math.min(1, this.hunger + dt / 700);
    // its body ran into something (rex.js crashS: t goes back to 0 at each crash, dur grows with the closing speed; the
    // 'contact' event itself goes to the view, not here): felt, a beat of surprise, remembered for a thought
    { const C = sim.crashS; if (C && typeof C.t === 'number') { if (C.t < (this._crashT0 ?? 99) - 0.01 && C.dur > 0) { const k = clamp((C.dur - 0.5) / 0.1, 1, 9); this.mem.crash = { t: this.t, k, hard: k >= 2.5 }; if (k >= 2) this.crashBeat = { t: this.t, until: this.t + Math.min(1.4, 0.5 + 0.12 * k), k }; this._onCrash(C, k); } this._crashT0 = C.t; } }
    // its head met something solid (rex.js: headTouch.kn goes back to 0 at each new touch): felt, remembered for a moment (a thought)
    { const C = sim.headTouch; if (C && typeof C.kn === 'number') { if (C.kn < (this._bumpKn ?? 99) - 0.005 && this.t - (this.mem.bump ? this.mem.bump.t : -99) > 1) this.mem.bump = { t: this.t, part: C.part, hard: (sim.headPress || 0) > 1.5 }; this._bumpKn = C.kn; } }
    const eyeTo = (x, y, z) => {
      const dx = x - h.pos.x, dy = y - h.pos.y, dz = z - h.pos.z, d = Math.hypot(dx, dy, dz) || 1, ang = Math.acos(clamp((dx * h.f.x + dy * h.f.y + dz * h.f.z) / d, -1, 1));
      const field = ang < SN.sharp ? 1 : ang < SN.mid ? 0.7 : ang < SN.field ? 0.3 : 0;
      return { d, field: field && this.los(h.pos.x, h.pos.y, h.pos.z, x, y + 0.2, z) ? field : 0 };
    };
    const smellOf = (x, z, range) => {
      const dx = x - sim.x, dz = z - sim.z, d = Math.hypot(dx, dz); if (d < 6) return 1; if (d > range) return 0;
      const wb = this._windBetween(x, z, w), wbl = Math.hypot(wb.x, wb.z) || 1e-6;      // the wind as it is there and here
      const up = -(dx * wb.x + dz * wb.z) / (d * wbl);           // 1 when the wind blows straight from it to the animal
      return up > 0.35 ? (1 - d / range) * (up - 0.35) / 0.65 * Math.min(1.4, wbl / 3) : 0;
    };
    // objects
    let best = null, bs = 0;
    const OV = this.ov;
    for (const t of world.things || []) {
      if (t.kind === 'stone') {
        // a stone seen in flight: once it has learnt what stones are for, it can trace one back to whoever threw it
        if (!t.rest && t.vx !== undefined && OV.senses.sight) { const e = eyeTo(t.x, t.y, t.z); if (e.field > 0 && e.d < 45) this.mem.stoneSeen = { id: t.id, x: t.x, z: t.z, vx: t.vx, vz: t.vz, t: this.t }; }
        continue;
      }
      if ((t.kind === 'flare' && !OV.notice.flares) || ((t.kind === 'meat' || t.kind === 'carcass') && !OV.notice.food)) continue;
      const m = this.objMem[t.id] || (this.objMem[t.id] = { hab: 0, seen: 0, smelt: 0, kind: t.kind });
      const e = eyeTo(t.x, t.y, t.z), light = Math.max(world.light, t.bright);
      let see = (OV.senses.sight ? 1 : 0) * e.field * (t.bright > 0 ? 1.2 / (1 + (e.d / 140) ** 2) : (t.kind === 'carcass' ? 0.9 : 0.4) * light / (1 + (e.d / 25) ** 2));
      if (!t.rest) see = Math.max(see, e.field * 0.8 / (1 + (e.d / 40) ** 2));         // something flying through the air
      const smell = t.scent > 0 && OV.senses.smell ? smellOf(t.x, t.z, 260 * t.scent) * t.scent : 0;
      m.seen = Math.max(see > 0.25 ? 1 : 0, m.seen - dt * 0.05); m.smelt += (smell - m.smelt) * Math.min(1, dt * 0.8);
      if (t.kind === 'flare' && t.bright > 0 && e.d < 30) m.hab = Math.min(1, m.hab + dt * 0.006);
      if (t.kind === 'flare' && t.bright > 0 && (t.by === 'you' || (this.know.target && t.by === this.know.target.id)) && !m.fire && Math.hypot(t.x - sim.x, t.z - sim.z) < 9) { m.fire = true; this.ap.onFire(Math.hypot(t.x - sim.x, t.z - sim.z)); }
      // what it saw of it, for knowing what made a sound there (a thing seen flying or lying there is what landed: not you)
      if (see > 0.15) { m.lastSeenT = this.t; if (!t.rest) m.flySeenT = this.t; }
      m.x = t.x; m.z = t.z; m.bright = t.bright > 0; m.smelly = (t.scent || 0) > 0.2;
      this._orientObj(dt, t, m, see);
      const food = t.kind === 'meat' || t.kind === 'carcass', want = food ? 0.35 + 1.2 * this.hunger : t.bright > 0 ? 0.9 : 0.2;
      const sal = Math.max(see, smell * 2.2, m.seen * 0.6) * want * (1 - m.hab) * (t.kind === 'flare' && t.bright <= 0 ? 0.25 : 1);
      t.d = e.d; t.see = see; t.smell = m.smelt; t.mem = m;
      if (sal > bs) { bs = sal; best = t; }
    }
    if (best && bs > 0.12) {
      if (!this.focus || this.focus.id !== best.id) { if (!this.focus || bs > (this.focus.sal || 0) * 1.3) this.focus = { ...best, sal: bs, since: this.t, newFocus: true }; }
      else Object.assign(this.focus, best, { sal: bs });
    } else if (this.focus && !(world.things || []).some((t) => t.id === this.focus.id)) this.focus = null;
    else if (this.focus) this.focus.sal *= 1 - dt * 0.5;
    if (this.focus && this.focus.sal < 0.05) this.focus = null;
    if (this.focus && ((this.focus.kind === 'flare' && !OV.notice.flares) || ((this.focus.kind === 'meat' || this.focus.kind === 'carcass') && !OV.notice.food))) this.focus = null;
    // prey
    let pb = null, pbs = 0;
    for (const q of OV.notice.prey && OV.senses.sight ? world.prey || [] : []) {
      const e = eyeTo(q.x, q.y, q.z), see = e.field * (0.6 + 0.4 * clamp(q.speed / 3, 0, 1)) * Math.max(world.light, 0.4) / (1 + (e.d / 60) ** 2);
      if (see > pbs) { pbs = see; pb = { ...q, d: Math.hypot(q.x - sim.x, q.z - sim.z), see }; }
    }
    if (!OV.notice.prey) this.prey = null;
    else if (pb && pbs > 0.18) this.prey = { ...pb, seenT: this.t };
    else if (this.prey && this.t - this.prey.seenT > 8) this.prey = null;
    else if (this.prey) { const q = (world.prey || []).find((x) => x.id === this.prey.id); if (!q) this.prey = null; }
    // being struck: a flinch, anger, and a fair idea of where it came from
    for (const hit of world.hits || []) {
      const k = clamp(hit.speed / 14, 0.3, 1.2);
      this.hitAt = this.t; this.lastHit = { ...hit, k };
      if (hit.by === 'you' && (hit.kind === 'stone' || hit.missile)) {      // anything you send at it that hits (a stone, or any missile a world reports)
         this.grudge = Math.min(1, this.grudge + 0.2 * k * (0.6 + this.temper.irritable)); this.wrongs.stones++; if (hit.kind !== 'stone') this.wrongs.missiles = (this.wrongs.missiles || 0) + 1; this.lastWrong = { kind: 'stones', t: this.t }; this._wrong('stones', 0.12 * k); }
      this.ap.onHit(hit, k);
      M.irritation = Math.min(1, M.irritation + 0.3 * k * (0.5 + this.temper.irritable)); M.arousal = Math.min(1, M.arousal + 0.45 * k);
      this.mem.noiseHab = 0; this.mem.hab = {}; this.mem.fooled *= 0.5;
      const back = bearing(-hit.vx, -hit.vz) + R.range(-0.25, 0.25), dist = Math.hypot(hit.from.x - hit.x, hit.from.z - hit.z) * R.range(0.7, 1.3);
      const ex = hit.x + Math.sin(back) * dist, ez = hit.z + Math.cos(back) * dist;
      if (!this.know.seen) this._seed(ex, ez, 4 + dist * 0.15, 0.7);
      this.startle = { x: ex, z: ez, y: this.T.height(ex, ez) + 1.5, sal: 0.9, kind: 'hit' };
      if (hit.by === 'you') this.steel = (this.steel || 0) + (this.ap.verdict === 'threat' ? 1 : 0.6);      // it has learned what a stone is: it flinches less each time
      if (this.t - (this.lastFlinch ?? -99) > 1.5 + 2.5 * (this.steel || 0)) { this.lastFlinch = this.t; sim.gesture('startle', { x: hit.x - hit.vx * 0.3, y: hit.y, z: hit.z - hit.vz * 0.3 }); }
      this.hitNow = true;
    }
    // a lamp shone in its eyes
    // per eye: the beam on that eye (aimed at it, the eye turned towards it, nothing between): dazzled fast, recovering over a
    // couple of seconds after (an afterimage); a dazzled eye sees little (_eyeChance), and the lids show it (rex squint)
    const DZ = this.dazzle || (this.dazzle = { 1: 0, [-1]: 0 }), lit = { 1: 0, [-1]: 0 };
    for (const a of world.agents) if (a.torch) for (const sd of [1, -1]) {
      const E = this._eyePos(sd), dx = E.x - a.x, dy = E.y - a.y, dz = E.z - a.z, d = Math.hypot(dx, dy, dz) || 1;
      const aim = (dx * a.lx + dy * a.ly + dz * a.lz) / d, o = this._eyeAxis(sd), face = -(dx * o.x + dy * o.y + dz * o.z) / d, faceH = -(dx * h.f.x + dy * h.f.y + dz * h.f.z) / d;
      if (d < 55 && aim > 0.985 && faceH > 0.4 && face > Math.cos(1.25) && this.los(E.x, E.y, E.z, a.x, a.y, a.z)) { lit[sd] = 1; this.glareD = d; this.beamFrom = { x: a.x, z: a.z, t: this.t }; }
    }
    for (const sd of [1, -1]) DZ[sd] += (lit[sd] - DZ[sd]) * Math.min(1, dt * (lit[sd] > DZ[sd] ? 4 : 0.6));
    const gl = Math.max(lit[1], lit[-1]);
    // the beam is a pointer: it comes from where you are (believed there, seen or not); and each time it is a little less of a shock
    if (gl && this.beamFrom && !this.know.seen) this._seed(this.beamFrom.x, this.beamFrom.z, 1.5, 0.25);
    if (gl && this.glare < 0.3 && !this.glareOn) { this.glareOn = true; this.steel = (this.steel || 0) + 0.4; } else if (!gl && this.glare < 0.1) this.glareOn = false;
    this.glare += (gl - this.glare) * Math.min(1, dt * 3);
    // both eyes dazzled and you close, where it last had you: it snaps blind at that place, angry
    if (DZ[1] > 0.7 && DZ[-1] > 0.7 && this.sum.cert > 0.2 && Math.hypot(this.sum.x - h.pos.x, this.sum.z - h.pos.z) < 6 && M.irritation > 0.35 && this.t - (this.lastSnap ?? -99) > 4 && R() < dt * 0.8) {
      sim.gesture('snap', { x: this.sum.x, y: this.T.height(this.sum.x, this.sum.z) + 1.2, z: this.sum.z }); this.lastSnap = this.t; this.blindSnaps = (this.blindSnaps || 0) + 1;
    }
    if (this.glare > 0.5 && this.know.seen) { M.irritation = Math.min(1, M.irritation + dt * 0.08 * (0.5 + this.temper.irritable)); sim.blink = Math.max(sim.blink, R() < dt * 4 ? 0.15 : 0); this.grudge = Math.min(1, this.grudge + dt * 0.035 * (0.5 + this.temper.irritable)); this.wrongs.glare += dt; this.lastWrong = { kind: 'glare', t: this.t }; this._wrong('glare', dt * 0.05); this.ap.onGlare(dt, this.glareD ?? 99); }
    // going for its food: someone at the meat it is eating or guarding
    // (meat held out in your hand is yours to give, and a friend may come near its meal)
    if (this.beh && this.beh.name === 'feed' && this.focus && !this.focus.hand && this.bond.trust < 0.6 && this.know.seen && this.know.target) { const a = this.know.target, d = Math.hypot(a.x - this.focus.x, a.z - this.focus.z); if (d < 4.5) { this._wrong('food', dt * 0.03); this.grudge = Math.min(1, this.grudge + dt * 0.12 * (0.6 + this.temper.irritable)); this.wrongs.food += dt; this.lastWrong = { kind: 'food', t: this.t }; M.irritation = Math.min(1, M.irritation + dt * 0.1); } }
    this.grudge *= 1 - dt / 300;
    // a sore foot: a dull ache that the body's jolts sharpen, and a shorter temper for it
    const inj = sim.injury;
    this.painSpike *= 1 - dt / 2.5; this.pain = clamp((inj ? 0.75 * inj.sev : 0) + this.painSpike, 0, 1);
    if (this.pain > 0.05) M.irritation = Math.min(1, M.irritation + dt * 0.0035 * this.pain * (1 - 0.6 * this.tame));
    if (this.touch && this.touch.t !== this.t && !this.touch.fresh) this.touch = null;
  }

  _onSight(a) {
    const M = this.mood, K = this.know;
    if (this.mem.lastNoise && this.t - this.mem.lastNoise.t < 25) { this.mem.noiseHab *= 0.3; if (this.mem.hab) for (const k in this.mem.hab) this.mem.hab[k] *= 0.3; }   // noises meant something after all
    if (K.lastSeenT > -999 && this.t - K.lastSeenT > 6) {
      this.mem.hides.push({ x: K.last.x, z: K.last.z, found: { x: a.x, z: a.z } }), this.mem.hides.length > 6 && this.mem.hides.shift();
      // a hiding place: where it found you after losing you. The same place twice is a habit
      const sp = this.mem.spots.find((q) => Math.hypot(q.x - a.x, q.z - a.z) < 8);
      if (sp) { sp.n++; sp.x += (a.x - sp.x) * 0.3; sp.z += (a.z - sp.z) * 0.3; sp.t = this.t; sp.miss = 0; } else { this.mem.spots.push({ x: a.x, z: a.z, n: 1, t: this.t, miss: 0 }); if (this.mem.spots.length > 6) this.mem.spots.sort((p, q) => q.n - p.n).pop(); }
      if (this.beh && this.beh.memo && Math.hypot(this.beh.memo.x - a.x, this.beh.memo.z - a.z) < 10) { this.foundAtMemo = this.t; }
    }
    // a stone that sent it the wrong way: you turned up somewhere else
    if (this.beh && this.beh.name === 'search' && this.beh.soundKind === 'stone' && this.startle && Math.hypot(this.startle.x - a.x, this.startle.z - a.z) > 10) { this.mem.decoys++; this.lastDecoy = this.t; }
    M.arousal = Math.min(1, M.arousal + 0.25 + (K.firstSight ? 0.2 : 0)); M.interest = Math.min(1, M.interest + 0.3);
    this.mem.encounters++;
    this.startle = null;
    this.sighted = { first: K.firstSight, d: Math.hypot(a.x - this.sim.x, a.z - this.sim.z) };
    if (this.sighted.d < 14 && this.t - (this.lastFlinch ?? -99) > 6) { this.lastFlinch = this.t; this.sim.gesture('startle', a); }      // something right there that it had not seen
    K.firstSight = false;
  }
  /** The individual it knew is gone: everything about that one goes with it (where it is, where it hid, how it came out, the
   *  tricks it played, the grudge, the verdict, the bond). What stays is what one small thing taught it about small things:
   *  folded into `kind`, it colours the next appraisal a little and no more. Its own moods, hunger and the world stay. */
  _forget(why) {
    const A = this.ap, k = this.kind, wasHunting = this.beh && !['feed', 'investigate', 'trail', 'hunt', 'roam', 'pause', 'answer', 'leave'].includes(this.beh.name);
    k.kept += A.tasted - A.rejected; k.spat += A.rejected; k.slipped += A.slipped; k.bolted += A.bolted; k.stood += A.stood; k.stung += this.wrongs.stones > 0 ? 1 : 0;
    k.fear = Math.max(k.fear * 0.5, A.fear);
    this.who = null; this.deadWho = null; this.forgotT = this.t; this.forgotWhy = why;
    this.know = { seen: false, ev: 0, thr: this.R.range(0.7, 1.7), lost: 0, lastSeenT: -999, last: { x: 0, z: 0, y: 0 }, target: null, seenTime: 0, firstSight: true };
    this.p = Array.from({ length: NP }, () => this._randomParticle()); this._norm();
    const M = this.mem;
    Object.assign(M, { fooled: 0, hides: [], encounters: 0, spots: [], exits: {}, decoys: 0, stoneSeen: null, inside: null, vanish: [], haunts: [], steps: null, refuges: {}, lastExit: null });
    this.grudge = 0; this.wrongs = { stones: 0, glare: 0, food: 0 }; this.lastWrong = null; this.warnedT = -999; this.grudgeAtWarn = 0; this.grudgeAtAct = 0; this.steel = 0;
    this.attacks = 0; this.lastAttack = -999; this.motive = null; this.motiveNext = null; this.closeTime = 0; this.sighted = null; this.foundAtMemo = -99; this.lastDecoy = -99; this.decoyT = -99;
    this.bond = { trust: 0, scar: 0, fed: 0, handFed: 0, petted: 0, wrongs: 0, betrayals: 0, saved: false, lastGood: null, lastBad: null, listened: 0 };
    this.mood.irritation *= 0.3; this.mood.interest *= 0.3;
    this.ap = new Appraisal(this, this.seed); this.ap.prior(k); this.stance = 'none';
    this.thinker.forget();
    if (wasHunting) this.beh.done = true;      // whatever it was doing about that one is over
  }
  /** Sensing someone it has no picture of: a new individual to make sense of from the start. (One picture at a time: while the
   *  one it knows is still about, someone else is taken for it; a second player needs a picture per individual.) */
  _meet(a) {
    const w = whoOf(a);
    if (a.id === 'observer' || a.ghost || this.who === w || (this.who && w !== this.who && this.deadWho !== this.who)) return;
    if (this.who) this._forget('other');
    this.who = w; this.kind.met++; this.know.firstSight = true; this.metT = this.t;
  }
  _onLost(a) {
    const K = this.know;
    this.mem.vanish.push({ x: a.x, z: a.z, t: this.t }); if (this.mem.vanish.length > 8) this.mem.vanish.shift();
    // keep the belief where it was, moving the way it was going
    this._seed(a.x, a.z, 2, 1, a.vx, a.vz);
    K.lostAt = this.t;
  }

  /** Its picture of you (`know.target`), kept from what its senses actually deliver. Speed and heading are never read off
   *  you at once: by eye they build up over about a second of watching (a tap of a key is not a run); close by but unseen it
   *  knows where you are and only what your footsteps say (`hear run`, `hear walk`); out of sense it carries on the last picture. */
  _track(dt, a, via, fresh = false) {
    const K = this.know, old = K.target && whoOf(K.target) === whoOf(a) ? K.target : null, free = (a.state || 'free') === 'free';
    const pv = K.pv && !fresh && old ? K.pv : (K.pv = { vx: 0, vz: 0 });
    const steps = this.mem.steps && this.t - this.mem.steps.t < 1.7 && Math.hypot(this.mem.steps.x - a.x, this.mem.steps.z - a.z) < 6 + 0.12 * Math.hypot(a.x - this.sim.x, a.z - this.sim.z) ? this.mem.steps : null;
    if (via === 'sight' || !free) {
      // watched: the eyes integrate motion; a body being thrown about is felt and seen as it is
      const k = free ? 1 - Math.exp(-dt / 0.9) : 1; pv.vx += (a.vx - pv.vx) * k; pv.vz += (a.vz - pv.vz) * k;
      K.target = { ...a, vx: pv.vx, vz: pv.vz, speed: Math.hypot(pv.vx, pv.vz), via };
      K.gait = null;
    } else if (via === 'near') {
      // heard and smelt, not seen: where you are, near enough; how fast only from your feet, which way only roughly
      const want = steps ? (steps.fast ? 4.6 : 1.6) : 0, sp0 = Math.hypot(pv.vx, pv.vz), sp1 = sp0 + (want - sp0) * (1 - Math.exp(-dt / (steps ? 0.4 : 1.5)));
      const hd = sp0 > 0.2 ? Math.atan2(pv.vx, pv.vz) : (old ? Math.atan2(a.x - old.x, a.z - old.z) : 0);
      pv.vx = Math.sin(hd) * sp1; pv.vz = Math.cos(hd) * sp1;
      K.target = { ...(old || a), id: a.id, x: a.x, y: a.y, z: a.z, state: a.state, struggle: a.struggle, still: a.still, escape: a.escape, handled: a.handled, hurt: a.hurt, blood: a.blood, dead: a.dead, meaty: a.meaty, vx: pv.vx, vz: pv.vz, speed: sp1, via };
      K.gait = steps ? (steps.fast ? 'run' : 'walk') : null;
    } else if (old) {
      // nothing reaches it: you are where it last had you, carried on the way you were going
      K.target = { ...old, x: old.x + pv.vx * dt, z: old.z + pv.vz * dt, via };
    } else K.target = { ...a, vx: 0, vz: 0, speed: 0, via };
  }
  /** Where you tend to be: places it has seen you more than once (what an ambush is built on). */
  _haunts(dt, c) {
    const a = this.know.target; this.hauntT = (this.hauntT || 0) + dt;
    if (this.hauntT < 2 || !c.seen || !a || a.id === 'observer' || a.ghost || (a.state && a.state !== 'free') || c.enclosed) return;
    this.hauntT = 0;
    const H = this.mem.haunts, h = H.find((q) => Math.hypot(q.x - a.x, q.z - a.z) < 10);
    if (h) { if (this.t - h.t > 8) h.n++; h.x += (a.x - h.x) * 0.15; h.z += (a.z - h.z) * 0.15; h.t = this.t; }
    else { H.push({ x: a.x, z: a.z, n: 1, t: this.t }); if (H.length > 8) { H.sort((p, q) => q.n - p.n || q.t - p.t); H.pop(); } }
  }
  /** Where you go in and come out: a structure you went into is a refuge; the opening you came out of, where to wait. */
  _habits(c) {
    const K = this.know, a = K.target, M = this.mem;
    if (!a || a.id === 'observer' || a.ghost) return;
    if (c.seen && c.enclosed) {
      if (!M.inside || M.inside.S.id !== c.enclosed.id || this.t - M.inside.t > 20) { (M.refuges || (M.refuges = {}))[c.enclosed.id] = ((M.refuges || {})[c.enclosed.id] || 0) + 1; }
      M.inside = { S: c.enclosed, t: this.t };
    } else if (c.seen && M.inside && this.t - M.inside.t < 90) {
      const S = M.inside.S, d = Math.hypot(a.x - S.cx, a.z - S.cz);
      if (d < 30 && S.openings && S.openings.length) {
        let bi = 0, bd = 1e9; S.openings.forEach((o, i) => { const dd = Math.hypot(o.x - a.x, o.z - a.z); if (dd < bd) { bd = dd; bi = i; } });
        const ex = M.exits[S.id] || (M.exits[S.id] = []); ex[bi] = (ex[bi] || 0) + 1; M.lastExit = { id: S.id, i: bi, t: this.t };
      }
      M.inside = null;
    }
  }

  // ---------------------------------------------------------------------- behaviour selection
  _ctx() {
    const K = this.know, sim = this.sim, a = K.target;
    const c = { seen: K.seen, since: this.t - K.lastSeenT, cert: this.sum.cert };
    if (a) {
      const dx = a.x - sim.x, dz = a.z - sim.z;
      c.d = Math.hypot(dx, dz); c.dHead = Math.hypot(a.x - sim.head.pos.x, a.y - sim.head.pos.y, a.z - sim.head.pos.z);
      const vr = this.sp.dims.run || 8; c.speed = a.speed; c.running = a.speed > 0.55 * vr ? 1 : a.speed > 0.5 * vr ? 0.4 : 0;      // running, judged by its own scale (8 m/s: 4.4 and 4.0)
      c.via = K.via; c.gait = K.gait || null;
      c.approach = clamp(-(a.vx * dx + a.vz * dz) / (c.d || 1) / 2.5, 0, 1);
      if (a.state && a.state !== 'free') { c.running = 0; c.approach = 0; }      // flying through the air or carried is not running away
      c.watched = c.d > 0 ? clamp(((-dx) * a.fx + (-dz) * a.fz) / c.d, -1, 1) > 0.88 : false;
    }
    c.beliefD = Math.hypot(this.sum.x - sim.x, this.sum.z - sim.z);
    const T = this.T; c.enclosed = a && T.insideStructure ? T.insideStructure(a.x, a.z, a.y) : null;
    c.beliefIn = T.insideStructure && !c.seen && this.sum.cert > 0.3 ? T.insideStructure(this.sum.x, this.sum.z) : null;
    // what it can do about you where you are, from the geometry and its own body (afford.js): walk up to you, get its head to
    // you, see you; walled = somewhere its body cannot come (inside something, or up on something)
    c.aff = this._afford(a, c);
    c.walled = !!(a && !c.aff.body);
    c.fatigue = sim.fatigue ?? sim.exertion;      // the long reserve (rex.js), not the breath of the last few seconds
    c.state = a ? a.state || 'free' : null;
    return c;
  }

  _choose(c, reason) {
    const M = this.mood, Tm = this.temper, R = this.R;
    const bold = Tm.bold + this.drift.bold, cur = Tm.curious + this.drift.curious, pat = Tm.patience + this.drift.patience;
    const U = {};
    if (c.seen) {
      const close = c.d < 14, mid = c.d >= 14 && c.d < 34;
      U.chase = c.running * (0.5 + M.interest) * (0.6 + bold) * (1 - c.fatigue) * (c.d < 50 ? 1 : 0.2) * 1.4;
      U.snap = c.dHead < 4.2 ? 0.05 + 1.1 * M.irritation * M.arousal + 0.7 * c.approach - 0.6 * (this.t - (this.lastSnap ?? -99) < 25 ? 1 : 0) : 0;
      U.inspect = c.d < 32 ? cur * (0.75 - 0.5 * M.irritation) * (1 - c.running) : 0;
      U.watch = 0.35 + 0.4 * pat + (c.d > 34 ? 0.25 : 0) - 0.2 * M.arousal;
      U.stalk = c.d > 13 ? (0.3 + 0.5 * bold) * (0.4 + M.interest) : 0;
      U.circle = (mid || close) && c.d > 9 ? 0.4 * cur + 0.15 : 0;
      U.display = c.d < 24 ? 0.05 + 0.85 * M.irritation + 0.5 * c.approach + 0.2 * M.arousal : 0;
      U.bluff = c.d > 10 && c.d < 32 ? (0.6 * M.irritation + 0.3 * bold) * (0.3 + M.arousal) : 0;
      U.feign = c.d > 10 && c.d < 45 ? 0.22 * pat + 0.08 * Math.min(this.mem.encounters, 4) : 0;
      U.backoff = c.d < 10 ? c.approach * (1 - bold) * 0.9 : 0;
      const ct = this.closeTime || 0, stale = clamp((ct - 20) / 60, 0, 1);
      if (c.d < 12) {
        U.watch -= 0.35 * stale; U.display -= 0.4 * stale; U.inspect -= 0.3 * stale;
        U.nudge = (0.15 + 0.6 * stale) * cur * (1 - c.running) * (this.t - (this.lastNudge ?? -99) > 40 ? 1 : 0);
        U.leave = 0.1 + 0.75 * stale * (1 - 0.5 * M.irritation);
        if (this.t - (this.mem.noLeaveT ?? -99) < 20) U.leave = 0;      // (no way out but past you, a moment ago)
        U.snap += 0.35 * stale * M.irritation;
      }
      if (M.interest < 0.45) { U.roam = 0.7 * (0.45 - M.interest) / 0.45 + 0.3 * M.boredom; U.pause = 0.25 + 0.4 * (0.45 - M.interest); }
    } else if (M.interest > 0.12 || this.scent > 0.08) {
      U.search = 0.35 + 0.8 * c.cert * cur + 0.2 * M.interest;
      U.listen = c.since < 12 ? 0.35 * Tm.nervy + 0.15 : 0.1;
      U.sniff = 0.2 + 1.6 * this.scent;
      U.ambush = (0.15 + 0.5 * pat) * (c.since < 90 ? 1 : 0.3) * (0.5 + this.mem.fooled + 0.2 * Math.min(this.mem.encounters, 3));
      U.stare = 0.22 + 0.2 * c.cert;
      U.leave = M.interest < 0.3 ? 0.5 * (1 - pat) : 0;
      if (this.t - (this.mem.noLeaveT ?? -99) < 20) U.leave = 0;
    } else {
      U.roam = 0.45 + 0.8 * M.boredom;
      U.revisit = this.mem.encounters > 0 && this.t - this.know.lastSeenT > 50 ? 0.25 + 0.35 * cur : 0;
      U.pause = 0.45 * (1 - M.boredom) + 0.6 * c.fatigue;
      U.sniff = 0.15 + 1.2 * this.scent;
    }
    // the intruder is somewhere it cannot follow: work the openings instead of walking into walls
    // (what it can do there is read off the geometry and its body, afford.js: if its body can come to you, you are not walled)
    if (c.seen && c.walled) {
      for (const k of ['chase', 'inspect', 'nudge', 'bluff', 'snap']) delete U[k];
      if (U.stalk) U.stalk *= 0.2;
      if (U.watch && c.d > 8) U.watch *= 0.5;      // you shut in among walls: watching the outside of them from afar tells it little; it goes to the ways in (it stood 50 s at 30 m)
      const jd = this._jawDrive(c).v;
      U.besiege = c.enclosed || c.aff.reach ? (0.55 + 0.6 * M.interest + 0.5 * M.irritation + (c.aff.reach ? 0.9 * jd : 0)) * (1 - clamp((this.mem.besieged || 0) / (240 * (1 + 2 * this.hunger)), 0, 0.8)) * (c.aff.reach || c.aff.see ? 1 : 0.5 + 0.7 * jd) : 0;
      if (c.aff.reach) U.snap = c.dHead < 4.6 ? 0.3 + 0.8 * M.irritation : 0;
    } else if (!c.seen && c.beliefIn) { U.besiege = 0.4 + 0.9 * c.cert; if (U.search) U.search *= 0.3; }
    // things that are not the intruder: food, a strange light, prey; and anger after being struck
    const F = this.focus, hungry = this.hunger, anger = clamp(1 - (this.t - this.hitAt) / 45, 0, 1);
    const threat = c.seen && c.d < 16 ? 1 : 0;
    if (F) {
      const food = F.kind === 'meat' || F.kind === 'carcass';
      if (food) {
        const near = (F.see > 0.2 || F.d < 20);
        if (near) U.feed = (0.25 + 1.5 * hungry) * F.sal * (1 - 0.5 * threat * (1 - bold)) + 0.3;
        else if (F.smell > 0.04) U.trail = (0.3 + 1.2 * hungry) * Math.min(1, F.sal * 1.6) + 0.15;
      } else if (F.kind === 'flare' && F.bright > 0) {
        // new things are interesting for a while; a kind of thing it knows well (_orientObj: the novelty it had when it first
        // showed) gets the look, and much less of a pull off what it is doing
        const nov = F.mem && F.mem.nov !== undefined ? F.mem.nov : 1;
        U.investigate = (F.sal * (0.5 + cur) * (1 - 0.6 * M.irritation) * (1 - 0.5 * threat) + 0.15 + 0.45 * cur * Math.exp(-(this.t - (F.since || 0)) / 25)) * (0.3 + 0.7 * nov) + 0.8 * Math.max(0, nov - 0.5) * Math.exp(-(this.t - (F.since || 0)) / 10);
      }
    }
    const P = this.prey;
    if (P && P.see > 0.1 && c.fatigue < 0.7 && (P.state !== 'flee' || P.d < 25)) U.hunt = (0.15 + 1.3 * hungry) * (0.5 + 0.5 * bold) * (1 - 0.7 * threat) * (P.d < 80 ? 1 : 0.3);
    // a first meeting (arena.opening): a new small thing on its ground is more interesting than the herd it knows; unprovoked, it
    // does not posture yet, it goes to see and sizes you up
    const OP = this.opening;
    if (OP && this.t < OP.until && this.grudge < 0.05 && anger <= 0) {
      if (U.hunt) U.hunt *= 0.15; for (const k of ['bluff', 'display', 'feign', 'roam', 'pause', 'leave', 'backoff']) if (U[k]) U[k] *= 0.25;
      if (c.seen) { U.inspect = (U.inspect || 0) + 0.45; U.circle = (U.circle || 0) + 0.15; U.watch = (U.watch || 0) * (c.d > 26 ? 0.5 : 1); }
      else U.search = (U.search || 0) + 0.5;
    }
    if (this.thunder && this.t - this.thunder.t < 3 && this.t - (this.lastRoar ?? -99) > 60) U.answer = 0.25 * (bold + M.irritation) * (1 - threat);
    if (anger > 0) {
      if (c.seen) { U.bluff = (U.bluff || 0) + 0.7 * anger; U.display = (U.display || 0) + 0.3 * anger; U.chase = (U.chase || 0) + 0.5 * anger * (c.d < 40 ? 1 : 0); U.watch -= 0.3 * anger; }
      else { U.search = (U.search || 0) + 0.6 * anger; U.roam = (U.roam || 0) * (1 - anger); U.pause = (U.pause || 0) * (1 - anger); }
    }
    // a sore foot: short-tempered, and in no state to run anything down
    const pain = this.pain, inj = this.sim.injury;
    if (pain > 0.05) {
      if (c.seen && c.d < 22) { U.display = (U.display || 0) + 0.45 * pain * (1 - this.tame); U.snap = (U.snap || 0) + (c.dHead < 4.4 ? 0.3 * pain : 0); }
      for (const k of ['chase', 'hunt', 'stalk', 'bluff', 'roam']) if (U[k]) U[k] *= 1 - 0.65 * pain;
    }
    // the bond: a creature that trusts you lets you closer and does not warn you off; it comes over to you, follows you,
    // lies down near you
    const tame = this.tame;
    if (c.seen && tame > 0) {
      for (const k of ['display', 'bluff', 'backoff', 'stalk', 'snap']) if (U[k]) U[k] *= 1 - 0.85 * tame * (anger > 0.3 ? 0.3 : 1);
      if (U.nudge) U.nudge *= 1 - tame; if (U.chase) U.chase *= 1 - 0.75 * tame; if (U.leave) U.leave *= 1 - 0.7 * tame; if (U.circle) U.circle *= 1 - 0.6 * tame; if (U.inspect) U.inspect *= 1 - 0.5 * tame;
      const free = (c.state || 'free') === 'free' && !c.walled;
      if (free && tame > 0.12 && c.d < 40 && this.t - this.lastGreet > 45 - 25 * tame) U.greet = (0.25 + 1.2 * tame) * (1 - M.irritation);
      if (free && tame > 0.45 && c.d > 11 && c.d < 55 && (c.speed > 0.7 || c.d > 20) && this.t - this.lastFollow > 15) U.follow = 0.3 + 1.1 * tame * (c.speed > 0.7 ? 1 : 0.5);
    }
    // rest: tired, hurt, or simply at ease near someone it trusts; never with a threat close by
    const threatN = c.seen && c.d < 22 ? 1 - tame : 0;
    const rest = (0.08 * M.boredom + 0.55 * Math.max(0, c.fatigue - 0.3) + 1.1 * pain + (c.seen && c.d < 20 ? 0.5 * tame * tame : 0)) * (1 - threatN * (pain > 0.3 && c.d > 13 ? 0.4 : 1)) - 0.6 * M.irritation * (1 - pain) - (anger > 0 ? 1 : 0);
    if (BOND_ON && rest > 0.05 && M.arousal < 0.7) U.rest = rest;
    if (BOND_ON && inj && inj.sev > 0.1 && pain > 0.3 && !(c.seen && c.d < 12 && tame < 0.3)) U.tend = 0.2 + 0.45 * pain;
    // laying hold of you: only for a reason (a grudge, real hunger, a long bold curiosity), and an angry one warns first
    if (c.seen && !c.walled && this.know.target && this.know.target.id !== 'observer' && !this.know.target.ghost && !this.know.target.dead) {
      const Mo = this._motives(c), mk = Mo.anger >= Mo.prey && Mo.anger >= Mo.play ? 'anger' : Mo.prey >= Mo.play ? 'prey' : 'play', ms = Mo[mk];
      const warned = this.t - this.warnedT < 45, again = this.grudge - this.grudgeAtAct > 0.18;
      const cool = again ? 1 : clamp((this.t - this.lastAttack - 15) / 35, 0, 1), near = c.d < 14 ? 1 : c.d < 24 ? 0.55 : 0;
      const lying = c.state && LYING.has(c.state);
      const drive = (mk === 'anger' && !warned && !lying ? 0.25 : 1) * ms * cool * near;
      if (mk === 'anger' && !warned && ms > 0.15 && c.d < 30) { U.display = (U.display || 0) + 0.7 * ms; U.bluff = (U.bluff || 0) + 0.55 * ms; }
      if (drive > 0.06 && !(mk === 'prey' && !lying)) { const mv = this._attackMove(c, mk); U[mv] = Math.max(U[mv] || 0, 0.15 + 1.4 * drive); this.motiveNext = mk; }
    }
    // what it makes of you: weighing you as food, hunting you, keeping away from you, facing you down
    this.ap.utilities(c, U);
    // a first meeting, still unprovoked (nothing thrown, shone or shouted at it): no posturing and no blows yet
    if (OP && this.t < OP.until && this.grudge < 0.05 && anger <= 0 && M.irritation < 0.35) for (const k of ['bluff', 'snap', 'display', 'chase', 'pounce', 'hunt', 'feign', 'leave', ...ATTACKS]) if (U[k]) U[k] = 0;
    // vary: recently used behaviours are less likely, the current one is sticky, choice is noisy; and what it has set out to do
    // holds: every way of going on with the goal gets the commitment margin (half of it for another way of being about the same
    // target), so a different goal has to be clearly better, not just better this tenth of a second
    const temp = 0.18 + 0.2 * Tm.nervy, G = this.goal, mg = this._margin(), gYou = G && ABOUT_YOU.has(G.mode);
    let bestK = null, bestV = -Infinity;
    for (const [k, u] of Object.entries(U)) {
      if (u <= 0) continue;
      const md = modeOf(k);
      let v = u - 0.22 * this.mem.recent.filter((r) => r === k).length * (G && md === G.mode ? 0.3 : 1);
      if (G && mg > 0) v += md === G.mode ? mg : gYou && ABOUT_YOU.has(md) ? mg * this.cfg.commit.sameTarget : 0;
      if (this.beh && this.beh.name === k && !this.beh.done && this.t - this.openT >= 0.15) v += 0.25;      // (weighed afresh: no stickiness either)
      v += -Math.log(-Math.log(Math.max(R(), 1e-9))) * temp;        // Gumbel noise
      if (v > bestV) { bestV = v; bestK = k; }
    }
    if (!bestK) bestK = c.seen ? 'watch' : 'pause';
    this.lastU = Object.entries(U).filter(([, u]) => u > 0).sort((p, q) => q[1] - p[1]).slice(0, 6).map(([k, u]) => [k, +u.toFixed(2)]);
    if (this.ov.force && this.canStart(this.ov.force)) bestK = this.ov.force;
    if (this.beh && this.beh.name === bestK && !this.beh.done) return;
    this._start(bestK, c, reason);
  }

  /** How far ahead another goal must be to take over from the current one now: the commitment margin, decaying with time
   *  spent on the goal without progress, plus the hold prey arousal gives a goal about you; nothing while something that
   *  matters at once has just happened (`openT`). */
  _margin() {
    const G = this.goal, C = this.cfg.commit; if (!G || this.t - this.openT < 0.15) return 0;
    return C.hold * Math.exp(-(this.t - G.prog) / C.bore) + (ABOUT_YOU.has(G.mode) ? C.fixHold * (this.ap.arousal || 0) : 0);
  }
  /** Something that matters at once (a blow, a loud sound close, fire, the chase reflex): whatever it was set on is weighed afresh. */
  _open(why) { this.openT = this.t; this.openWhy = why; if (why === 'fire' || why === 'fixed' || why === 'threat') this.alarm = why; }
  /** Getting somewhere with the goal: closer to what it is about, or an outcome (a test, a ritual answered, a bite). */
  _progress() { if (this.goal) this.goal.prog = this.t; }
  _goalStep(c) {
    const G = this.goal; if (!G) return;
    const C = this.cfg.commit, F = this.focus;
    const d = ABOUT_YOU.has(G.mode) ? (c.seen ? c.d : c.beliefD) : G.mode === 'food' || G.mode === 'light' ? (F ? F.d : null) : G.mode === 'herd' ? (this.prey ? this.prey.d : null) : null;
    if (d !== null && d !== undefined && Number.isFinite(d)) { if (G.best === null || d < G.best - C.progressD) { G.best = d; G.prog = this.t; } }
    if (G.mode === 'food' && this.beh && this.beh.name === 'feed' && this.beh.phase !== 'go') G.prog = this.t;      // eating is getting somewhere
    if (G.seen === false && c.seen && ABOUT_YOU.has(G.mode)) G.prog = this.t;       // found you again
    G.seen = !!c.seen;
  }

  /** Why it might lay hold of you, each 0..1. */
  _motives(c) {
    const Tm = this.temper, M = this.mood, bold = Tm.bold + this.drift.bold, cur = Tm.curious + this.drift.curious;
    const anger = clamp(Math.max(0, this.grudge - 0.13) * (0.55 + Tm.irritable) * (0.55 + bold) * 1.6 + (this.grudge > 0.2 ? 0.3 * M.irritation : 0), 0, 1);      // one stone is a nuisance; it takes a second to make it a grudge
    // food: what the appraisal (appraise.js) has come to; on its feet you are hunted (prowl), lying there you are tasted
    const prey = (1 - 0.9 * this.tame) * this.ap.H * (c.d < 30 ? 1 : 0.3);
    // toying with you only comes after a long, close, uneventful acquaintance in which it has already tested you with its nose
    const stale = clamp(((this.closeTime || 0) - 70) / 80, 0, 1);
    const play = stale * cur * bold * (1 - M.irritation) * (this.lastNudge > -99 ? 1 : 0) * 1.3 * (1 - this.tame);      // a friend is not a toy
    return { anger, prey, play };
  }
  /** How much it wants its jaws on you now, and why (the strongest of: a grudge, you as food, you as a threat to be ended). */
  _jawDrive(c) {
    const Mo = this._motives(c), thr = this.ap && this.ap.verdict === 'threat' ? 0.4 + 0.6 * Math.max(this.ap.fear || 0, this.ov.verdict === 'threat' ? 0.85 : 0) : 0;
    const prey = Math.max(Mo.prey, this.ap && this.ap.verdict === 'food' ? 0.5 * (this.ap.H || 0) + 0.3 : 0);
    return thr >= Mo.anger && thr >= prey ? { k: 'anger', v: thr } : Mo.anger >= prey ? { k: 'anger', v: Mo.anger } : { k: 'prey', v: prey };
  }
  /** The one judge of what its body or head can get at (afford.js reachJudge): the gates read it through c.aff, the besiege
   *  planner asks it before planning and tells it what it found. */
  _reach() { return this._affC || (this._affC = reachJudge()); }
  /** What it can do about you where you are (afford.js): open ground needs no working out. */
  _afford(a, c) {
    const OPEN = { body: true, reach: true, see: true };
    if (!a || a.ghost || a.id === 'observer') return OPEN;
    const T = this.T, sim = this.sim, g = T.height(a.x, a.z), feet = (a.y ?? g + 1.7) - (a.crouch ? 1.0 : 1.7), raised = feet - g > 1.5;
    if (!c.enclosed && !raised) return OPEN;
    const st = a.state || 'free', P = { x: a.x, y: st !== 'free' ? Math.max(g, feet) + 0.3 : feet + (a.crouch ? 0.5 : 0.9), z: a.z };
    return this._reach()(T, sim.nav, sim.selfModel(), { x: sim.x, z: sim.z }, P, this.t);
  }
  /** Which move fits the motive and where you are: on the ground you get a foot, jaws or a nose; standing behind it,
   *  the tail; in front, the head. Each grip it has already used on you makes the next one rougher. */
  _attackMove(c, motive) {
    const a = this.know.target, sim = this.sim, st = c.state || 'free';
    if (LYING.has(st)) return motive === 'prey' ? 'seize' : motive === 'anger' ? (this.attacks > 1 && this.R() < 0.5 ? 'seize' : 'pin') : 'toy';
    const rel = Math.abs(wrap(bearing(a.x - sim.x, a.z - sim.z) - sim.psi));
    if (rel > 1.85 && c.d < 8.5 && motive !== 'prey') return 'swipe';
    if (motive === 'prey') return 'seize';
    if (motive === 'anger') return this.attacks >= 2 && this.R() < 0.55 ? 'seize' : 'butt';
    return 'butt';
  }
  /** Busy with you physically: nothing else may take its head away (not a sound, not a glance). */
  _handling() {
    const b = this.beh, a = this.know.target;
    if (!b || !ATTACKS.includes(b.name)) return false;
    return b.phase === 'strike' || b.phase === 'hold' || b.phase === 'swing' || (a && (a.state === 'held' || a.state === 'pinned'));
  }
  /** The end of a sequence of laying hold: it has said what it had to say. */
  _vent(b) {
    if (b.vented) return; b.vented = true;
    this.lastAttack = this.t; this.attacks++;
    if (b.motive === 'anger') { this.grudge *= 0.55; this.mood.irritation *= 0.6; }
    if (b.motive === 'play') this.mood.interest *= 0.7;
    this.grudgeAtAct = this.grudge;
  }

  /** A mouthful of meat you gave it: remembered in your favour if it knew you were about (more when you stayed close). */
  _fedBy(o, amt) {
    if (o.by !== 'you' || this.t - this.know.lastSeenT > 60) return;
    const a = this.know.target, near = a && Math.hypot(a.x - this.sim.x, a.z - this.sim.z) < 14 ? 1.8 : 1;
    this._good('fed', amt * (o.hand ? 1 : near) * (0.5 + this.hunger));
    this.bond.fed += amt; if (o.hand) this.bond.handFed++;
  }
  /** Will it let you touch its snout now? */
  _permitTouch() {
    const B = this.bond, need = (this.sim.lying ? 0.33 : 0.42) - (B.saved ? 0.12 : 0);
    return B.trust > need && this.mood.irritation < 0.4 + 0.2 * this.tame && this.grudge < 0.25 && this.pain < 0.9;
  }
  /** How much handling of its sore foot it will bear right now. */
  _tolerance() {
    const B = this.bond, M = this.mood;
    return 1.25 * B.trust + (this.sim.lying ? 0.12 : -0.12) + 0.25 * this.sim.lid - 0.7 * M.irritation - 0.8 * this.grudge - 0.25 * this.painSpike + (B.saved ? 0.2 : 0);
  }
  /** Its personal space, which shrinks as it comes to trust you. */
  _personal() { return this.sp.spacing.personal - 2.8 * this.tame; }
  /** The place you have been found hiding more than once, if there is one worth checking (near what it believes, or it has no idea). */
  _usualSpot(near) {
    let best = null;
    for (const s of this.mem.spots) {
      if (s.n < 2 || (s.miss || 0) >= s.n || this.t - (s.checkedT ?? -999) < 45) continue;
      const d = near ? Math.hypot(s.x - near.x, s.z - near.z) : 0;
      if ((this.sum.cert < 0.55 || d < 28) && (!best || s.n - 0.02 * d > best.n - 0.02 * (near ? Math.hypot(best.x - near.x, best.z - near.z) : 0))) best = s;
    }
    return best;
  }
  /** You are running for a structure you got away into before: the way in, if you are heading for it. */
  _refugeAhead(a) {
    if (!a || a.speed < 2.5 || !this.T.structures) return null;
    for (const S of this.T.structures) {
      if (!(this.mem.refuges && this.mem.refuges[S.id])) continue;
      for (const O of S.openings || []) {
        const dx = O.x - a.x, dz = O.z - a.z, d = Math.hypot(dx, dz);
        if (d < 4 || d > 35) continue;
        if ((dx * a.vx + dz * a.vz) / (d * (a.speed || 1)) > 0.75) { const nl = Math.hypot(O.nx, O.nz) || 1; return { x: O.x + O.nx / nl * 3.5, z: O.z + O.nz / nl * 3.5, S }; }
      }
    }
    return null;
  }

  _start(name, c, reason) {
    const R = this.R, sim = this.sim, K = this.know, T = this.temper;
    // whatever idle scenting or yawning the head was doing ends with the decision (a stale sniff at the sky must not outlive it)
    if (sim.act && ['sniffAir', 'sniffGround', 'yawn', 'shake', 'tilt'].includes(sim.act.kind) && !['roam', 'pause', 'sniff', 'trail'].includes(name)) sim.act.t = Math.max(sim.act.t, sim.act.dur - 0.3);
    if (this.beh && ATTACKS.includes(this.beh.name) && this.beh.contact && !this.beh.vented) this._vent(this.beh);
    if (['display', 'bluff', 'snap'].includes(name) && K.seen) { this.warnedT = this.t; this.grudgeAtWarn = this.grudge; }
    this.mem.recent.push(name); if (this.mem.recent.length > 4) this.mem.recent.shift();
    // the goal: a behaviour of another mode is a new goal (going still before a strike is not a change of mind)
    { const md = modeOf(name); if (reason !== 'still' && (!this.goal || this.goal.mode !== md)) this.goal = { mode: md, t0: this.t, prog: this.t, best: null, seen: !!K.seen, from: this.goal ? this.goal.mode : null }; }
    const b = { name, t: 0, done: false, gen: this.gen++, reason };
    this.log.unshift({ t: this.t, name, reason }); if (this.log.length > 8) this.log.pop();
    const a = K.target;
    switch (name) {
      case 'roam': {
        let x = 0, z = 0;
        const Hd = null;      // (a threat does not drive it off its ground)
        for (let k = 0; k < 12; k++) { const ang = sim.psi + R.range(-1.6, 1.6), d = R.range(25, 60); x = sim.x + Math.sin(ang) * d; z = sim.z + Math.cos(ang) * d; if (this._inB(x, z, 15) && !(Hd && Math.hypot(x - Hd.x, z - Hd.z) < 30 && k < 11)) break; const Mb = this._midB(); x = Mb.x + R.range(-40, 40) * Math.min(1, Math.max(0, Mb.hx - 15) / 40); z = Mb.z + R.range(-40, 40) * Math.min(1, Math.max(0, Mb.hz - 15) / 40); }
        [x, z] = this._reachGoal(x, z);      // somewhere its body can get to from here
        // and not a long way round to somewhere near: of a few such places, one whose walk is not much longer than the line to it
        { const F = this._walkField(); if (F) { let best = null; for (let k = 0; k < 10; k++) {
          let px = x, pz = z; if (k) { const ang = sim.psi + R.range(-2.2, 2.2), d = R.range(20, 50); [px, pz] = this._reachGoal(...this._clampB(sim.x + Math.sin(ang) * d, sim.z + Math.cos(ang) * d, 6)); }
          const L = F.len(px, pz), D = Math.hypot(px - sim.x, pz - sim.z); if (!Number.isFinite(L)) continue;
          const sc = Math.min(L, 45) - 1.5 * Math.max(0, L - 1.6 * D - 6) - (L < 12 ? 20 : 0); if (!best || sc > best.sc) best = { x: px, z: pz, sc };
          if (k === 0 && L >= 20 && L < 1.6 * D + 6) break; }
          if (best) { x = best.x; z = best.z; } } }
        b.route = this._route(sim.x, sim.z, x, z); b.pace = R.range(1.3, 2.3); b.dur = 60; break;
      }
      case 'pause': b.dur = lognormal(R, 7, 0.55); break;
      case 'listen': b.dur = lognormal(R, 3.5 + 3 * T.patience, 0.6); b.at = this.startle || { x: this.sum.x, z: this.sum.z, y: this.T.height(this.sum.x, this.sum.z) + 1 }; b.next = R.range(0.8, 2); break;
      case 'sniff': b.dur = R.range(3.5, 7); b.turned = false; break;
      case 'search': {
        const useSound = this.startle && this.R() < 0.85 - 0.5 * this.mem.fooled; let s = useSound ? this.startle : { x: this.sum.x, z: this.sum.z }; b.fromSound = !!useSound; b.soundKind = useSound ? this.startle.kind : null;
        // no fresh sound to go on, and you have a habit: look in your usual hiding place first
        const hab = !useSound ? this._usualSpot(s) : null;
        if (hab) { s = hab; hab.checkedT = this.t; b.memo = hab; this._seed(hab.x, hab.z, 3, 0.3); }
        // a sound or a hunch from inside something is not knowing you are in there: unless it is fairly sure (or it is your
        // habit) it goes to the nearest way in to find out, nose and eyes first; besieging comes when the evidence does
        { const SI = this.T.insideStructure && this.T.insideStructure(s.x, s.z);
          if (SI && (hab || this.sum.cert > 0.45 || c.seen)) { this.beh = b; this.label = name; return this._start('besiege', { ...c, beliefIn: SI }, reason); }
          if (SI && SI.openings && SI.openings.length) { let O = SI.openings[0], bd = 1e9; for (const o of SI.openings) { const dd = Math.hypot(o.x - sim.x, o.z - sim.z); if (dd < bd) { bd = dd; O = o; } } const nl = Math.hypot(O.nx, O.nz) || 1; s = { x: O.x + O.nx / nl * 3, z: O.z + O.nz / nl * 3 }; b.atShelter = SI.id; } }
        b.spot = this._peek(s.x, s.z); b.route = this._route(sim.x, sim.z, b.spot.x, b.spot.z); b.pace = R.range(1.5, 2.6) * (this.startle && this.startle.sal > 0.4 ? 1.4 : 1);
        b.dur = 50; b.low = R() < 0.5 || this.ap.fixed; break;      // aroused by it, it goes round low
      }
      case 'stare': b.dur = lognormal(R, 6, 0.6); b.at = { x: this.sum.x, z: this.sum.z }; break;
      case 'ambush': b.dur = lognormal(R, 14 + 16 * T.patience, 0.45); b.at = { x: this.sum.x, z: this.sum.z }; break;
      case 'leave': {
        // leaving means ending up far from what it leaves, and better out of its sight: places all round (mostly away from it),
        // scored by how much further from it they are, whether a wall stands between, and how long the walk there really is
        // (a goal 30 m off by a 150 m detour, or 5 m off, is no leaving at all)
        const away = bearing(sim.x - this.sum.x, sim.z - this.sum.z), Mb = this._midB(), mB = this.T.rect ? clamp(0.1 * Math.min(Mb.hx, Mb.hz), 3, 20) : 0, F = this._walkField();
        const d0 = Math.hypot(sim.x - this.sum.x, sim.z - this.sum.z), ey = (x, z) => this.T.height(x, z) + 2.5, by = this.T.height(this.sum.x, this.sum.z) + 1.5;
        let best = null;
        for (let k = 0; k < 18; k++) {
          const ang = away + (k < 12 ? R.range(-1.4, 1.4) : R.range(-3.1, 3.1)), dd = R.range(22, 50);
          let x = sim.x + Math.sin(ang) * dd, z = sim.z + Math.cos(ang) * dd;
          if (this.T.rect) [x, z] = this._clampB(x, z, mB); else { x = clamp(x, -70, 70); z = clamp(z, -70, 70); }
          [x, z] = this._reachGoal(x, z);
          const L = F ? F.len(x, z) : Math.hypot(x - sim.x, z - sim.z); if (!Number.isFinite(L) || L < 8) continue;
          const far = Math.hypot(x - this.sum.x, z - this.sum.z), hid = !this.los(x, ey(x, z), z, this.sum.x, by, this.sum.z);
          // (nor is a way out that walks it past the one it leaves, within its head's length: its head keeps off people, so a line
          //  through you stops it dead in front of you; Saltline opening/5 stood 21 s so)
          const sx = x - sim.x, sz = z - sim.z, sl = sx * sx + sz * sz || 1, u = clamp(((this.sum.x - sim.x) * sx + (this.sum.z - sim.z) * sz) / sl, 0, 1);
          const past = Math.hypot(sim.x + sx * u - this.sum.x, sim.z + sz * u - this.sum.z);
          const sc = Math.min(far - d0, 30) + (hid ? 10 : 0) - 0.25 * Math.max(0, L - 45) + (far < 15 ? -20 : 0) - (past < 8 ? 25 : 0);
          if (!best || sc > best.sc) best = { x, z, sc, past };
        }
        if (!best) { const p = this._wayToward(away, 25); best = { x: p.x, z: p.z }; }
        // every way out goes past the one it would leave (hemmed in, you in the gap): it does not leave yet
        if (best.past !== undefined && best.past < 8 && d0 < 15) { b.done = true; this.mem.noLeaveT = this.t; break; }
        b.route = this._route(sim.x, sim.z, best.x, best.z); b.pace = 1.6; b.dur = 40; b.lookBack = R.range(4, 10); break;
      }
      case 'watch': b.dur = lognormal(R, 5 + 8 * T.patience, 0.65); b.next = R.range(1.5, 4); break;
      case 'stalk': b.dur = lognormal(R, 16, 0.4); b.stop = R.range(...this.sp.spacing.stalk); b.creep = R() < 0.65; break;
      case 'circle': b.dur = lognormal(R, 14, 0.4); b.r = clamp(c.d ?? 18, 11, 24); b.dir = R() < 0.5 ? -1 : 1; b.ang = a ? bearing(sim.x - a.x, sim.z - a.z) : 0; break;
      case 'inspect': b.dur = lognormal(R, 10, 0.4); b.stop = R.range(...this.sp.spacing.inspect) - 2 * this.tame; b.next = R.range(1, 3); break;
      case 'display': b.dur = lognormal(R, 7, 0.35); b.side = R() < 0.55 ? (R() < 0.5 ? 1.25 : -1.25) : 0; b.next = R.range(0.6, 1.8); b.roared = false; b.d0 = c.d;
        if (this.ap.verdict === 'rival') { b.rival = true; b.side = b.side || (R() < 0.5 ? 1.3 : -1.3); this.ap.ritualT = this.t; } break;
      case 'bluff': b.dur = 9; b.stop = R.range(...this.sp.spacing.bluff); b.phase = 'charge'; if (this.ap.verdict === 'rival') { b.rival = true; this.ap.ritualT = this.t; } break;
      case 'chase': b.dur = 40; b.best = 1e9; b.losing = 0; break;
      case 'snap': b.dur = 1.6; b.fired = false; break;
      case 'feign': { const ang = (a ? bearing(sim.x - a.x, sim.z - a.z) : sim.psi) + R.range(-0.9, 0.9), d = R.range(9, 16), w = this._wayToward(ang, d); b.route = [{ x: w.x, z: w.z }]; /* a heading it can walk straight along, if there is one */ b.dur = 26; b.phase = 'away'; b.glance = R.range(2, 5); break; }
      case 'backoff': b.dur = R.range(1.8, 3.5); break;
      case 'nudge': b.dur = 9; b.phase = 'close'; this.lastNudge = this.t; break;
      case 'besiege': {
        const S = c.enclosed || c.beliefIn || (a && this.T.insideStructure(a.x, a.z, a.y)) || this.T.insideStructure(this.sum.x, this.sum.z);
        if (!S) { b.dur = 0; b.done = true; break; }
        const ref = c.seen && a ? a : { x: sim.x, z: sim.z };
        b.S = S; b.order = S.openings.map((o, i) => [Math.hypot(o.x - ref.x, o.z - ref.z) + (c.seen ? 0 : 0.3 * Math.hypot(o.x - sim.x, o.z - sim.z)), i]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
        b.k = 0; b.phase = 'plan'; b.dur = 150; b.next = R.range(1, 2.5); b.tried = 0; b.avoid = []; b.spots = null; b.pg = null; b.si = 0;
        // the way you came out of here last time: where it will wait for you
        const ex = this.mem.exits[S.id]; if (ex && S.openings.length) { let bi = -1, bn = 0; ex.forEach((n, i) => { if (n > bn) { bn = n; bi = i; } }); if (bi >= 0) b.exitK = b.order.indexOf(bi); }
        break;
      }
      case 'investigate': b.obj = this.focus.id; b.dur = lognormal(R, 28, 0.3); b.stand = R.range(3.6, 5.2); b.phase = 'go'; b.next = R.range(1, 2.5); b.stomp = R() < 0.25 + 0.45 * T.bold; break;
      case 'trail': b.obj = this.focus.id; b.dur = 120; b.leg = 0; b.zig = R() < 0.5 ? -1 : 1; b.lost = 0; b.sniffT = R.range(4, 8); break;
      case 'feed': if (!this.focus) { b.dur = 0; b.done = true; break; }      // (the meat went while it was trailing it: nothing to feed on)
        if (this.focus.by === 'you' && (this.stance === 'predatory' || this.t - this.ap.predT < 8)) this.ap.onBoughtOff();
        b.obj = this.focus.id; b.dur = 240; b.phase = 'go'; b.next = 0; b.sub = null; b.scanT = R.range(5, 10); break;
      case 'hunt': b.id = this.prey.id; b.dur = 90; b.phase = 'stalk'; b.best = 1e9; b.losing = 0; b.snapped = false; break;
      case 'answer': b.dur = R.range(4, 6); b.at = { ...this.thunder }; b.roared = false; break;
      case 'butt': case 'swipe': case 'pin': case 'seize': case 'toy': {
        if (this.ov.force === name || !this.motiveNext) { const Mo = this._motives(c); this.motiveNext = name === 'toy' ? 'play' : Mo.prey > Mo.anger && Mo.prey > Mo.play ? 'prey' : Mo.play > Mo.anger ? 'play' : 'anger'; }
        b.motive = this.motiveNext; this.motive = b.motive; this.motiveNext = null; b.phase = name === 'swipe' ? 'set' : 'close'; b.dur = name === 'toy' ? 30 : name === 'seize' ? 60 : 25; b.next = 0; b.tries = 0;
        b.force = b.motive === 'play' ? 0.2 : b.motive === 'anger' ? clamp(0.55 + 0.45 * this.grudge + 0.15 * this.attacks, 0, 1) : 0.75;
        b.lethal = !!(this.lethalNext && b.motive === 'anger' && this.ap.verdict === 'threat'); this.lethalNext = false;      // to end it, not to make a point
        if (b.lethal) { b.force = 1; b.dur += 15; }
        if (name === 'seize' && c.state === 'held') { b.phase = 'hold'; b.holdAt = 0; }
        if (name === 'pin' && c.state === 'pinned') { b.phase = 'hold'; b.at = 0; }
        if (name === 'toy') this.lastNudge = this.t;
        break;
      }
      case 'greet': b.dur = 30; b.len = lognormal(R, 8, 0.3); b.next = R.range(0.6, 1.4); this.lastGreet = this.t; break;
      case 'follow': b.dur = 90; this.lastFollow = this.t; b.stillT = 0; b.lookT = R.range(3, 7); break;
      case 'rest': b.dur = lognormal(R, this.pain > 0.3 ? 55 : 35, 0.3); b.next = R.range(3, 7); b.dozeT = R.range(8, 16); b.tendT = this.pain > 0.3 ? R.range(2, 6) : 1e9; break;
      case 'tend': b.dur = lognormal(R, 9, 0.3); b.next = 0.5; break;
      case 'pet': b.dur = 60; b.permit = this._permitTouch(); b.next = R.range(0.8, 1.5); b.lastTouch = 0; b.hand = this.touch ? { ...this.touch.hand } : { x: a.x, y: a.y - 0.4, z: a.z }; if (b.permit) this.bond.touches = (this.bond.touches || 0) + 1; else this.bond.refusals = (this.bond.refusals || 0) + 1; break;
      case 'pull': b.dur = 90; b.next = 0.6; b.lastTouch = 0; break;
      case 'relief': b.dur = 16; b.phase = 'jolt'; break;
      case 'appraise': {
        // the long still stare, or slow sizing-up circles, head low and silent
        b.dur = lognormal(R, 8 + 7 * T.patience, 0.35); b.circle = c.d > 12 && c.d < 32 && R() < 0.45; b.r = clamp(c.d ?? 18, 13, 26); b.dir = R() < 0.5 ? -1 : 1; b.ang = a ? bearing(sim.x - a.x, sim.z - a.z) : 0;
        this.ap.lastAppraiseT = this.t; break;
      }
      case 'test': b.phase = 'rush'; b.stop = R.range(7.5, 9.5); b.dur = 14; b.ran = 0; break;
      case 'shadow': b.dur = lognormal(R, 30, 0.3); b.gap = R.range(16, 24); b.caught = 0; b.was = false; break;
      case 'lurk': {
        // an honest ambush: downwind of a place you keep coming back to, behind something if there is anything
        const H = this.mem.haunts.slice().sort((p, q) => q.n - p.n)[0], w = this.T.windAt ? this.T.windAt(H.x, H.z, this.wind || { x: 0, z: -1 }) : this.wind || { x: 0, z: -1 }, wl = Math.hypot(w.x, w.z) || 1;
        let sx = H.x + w.x / wl * 15, sz = H.z + w.z / wl * 15, bd = 1e9;
        for (const o of this.T.obstacles) { if (o.kind === 'wall') continue; const dd = Math.hypot(o.x - sx, o.z - sz); if (dd < 12 && dd < bd && Math.hypot(o.x - H.x, o.z - H.z) > o.r + 8) { bd = dd; const u = Math.hypot(o.x - H.x, o.z - H.z) || 1; sx = o.x + (o.x - H.x) / u * (o.r + 3.5); sz = o.z + (o.z - H.z) / u * (o.r + 3.5); } }
        [sx, sz] = this._clampB(sx, sz, 10);
        b.haunt = H; b.spot = { x: sx, z: sz }; b.route = this._route(sim.x, sim.z, sx, sz); b.phase = 'go'; b.dur = 90; this.lastLurk = this.t; break;
      }
      case 'pounce': {
        const P = this.pd, a = this.know.target; P.lastT = this.t; P.k = 0; P.n++;
        b.phase = 'lock'; b.lockDur = P.close || P.food || Math.abs(this.sim.v) > 3 ? this.cfg.prey.boltLock : lerp(1.0, 0.7, this.pdSens); b.close = P.close || P.food; b.peak = 0; b.dur = this.cfg.chase.maxT; b.best = 1e9; b.losing = 0; b.blind = 0; b.still = 0;      // (already on the move, it does not stop to coil)
        if (a) this.sim.gesture('orient', { x: a.x, y: a.y, z: a.z });      // the head snaps round
        break;
      }
      case 'prowl': b.phase = 'stalk'; b.dur = 70; b.best = 1e9; b.losing = 0; break;
      case 'probe': b.phase = 'come'; b.dur = 90; b.next = R.range(1.5, 3); b.at = 0; this._core(); break;
      // real fire close: it gives ground, briefly, facing you; and comes back angrier
      case 'avoid': b.dur = R.range(4, 6.5); b.R = 15; b.far = 0; this.grudge = Math.min(1, this.grudge + 0.2); this.mood.irritation = Math.min(1, this.mood.irritation + 0.25); break;
      // a threat, taken seriously: facing you, at its working distance, ready
      case 'guard': b.dur = lognormal(R, 14, 0.3); b.W = 13 + 6 * clamp(Math.max(this.ap.fear, this.ov.verdict === 'threat' ? 0.85 : 0), 0, 1); b.mode = 'hold'; b.growlT = -99; break;
      case 'revisit': {
        // back where it last saw you, or, if you have a habit, to the place you usually hide
        const sp = this._usualSpot(); if (sp) { sp.checkedT = this.t; b.memo = sp; }
        const k = sp || this.know.last; b.spot = this._peek(k.x, k.z); b.route = this._route(sim.x, sim.z, b.spot.x, b.spot.z); b.pace = R.range(1.4, 2); b.dur = 60; this._seed(k.x, k.z, 6, 0.5); this.mood.interest = Math.max(this.mood.interest, 0.25); break;
      }
    }
    b.dur = Math.min(b.dur, name === 'besiege' ? 90 + 120 * this.hunger : 90);      // (a hungry one keeps at a hiding place longer)
    this.beh = b;
    this.label = name;
  }

  /** Where a warning snap closes: just short of the face, never through it. */
  /** Where the target will be when it can be reached: aim there, not at where it is now. */
  _intercept(a, speed) {
    const sim = this.sim, dx = a.x - sim.x, dz = a.z - sim.z, d = Math.hypot(dx, dz);
    const t = clamp(d / Math.max(speed, 3), 0, 2.8);
    return { x: a.x + a.vx * t, z: a.z + a.vz * t };
  }

  /** Distance from the tip of the snout to a point. */
  _tip(x, y, z) { const h = this.sim.head, L = this.sp.dims.headLen; return Math.hypot(h.pos.x + h.f.x * L - x, h.pos.y + h.f.y * L - y, h.pos.z + h.f.z * L - z); }

  _snapPoint(a) {
    const h = this.sim.head.pos, dx = a.x - h.x, dy = a.y - h.y, dz = a.z - h.z, d = Math.hypot(dx, dy, dz) || 1, k = Math.max(0, d - 0.9) / d;
    return { x: h.x + dx * k, y: h.y + dy * k, z: h.z + dz * k };
  }

  /** A place from which to look at (x, z): if rock hides it, go round to the side. */
  _peek(x, z) {
    const sim = this.sim;
    for (const o of this.T.obstacles) {
      if (o.kind === 'wall') continue;
      const dx = x - sim.x, dz = z - sim.z, L2 = dx * dx + dz * dz || 1, t = clamp(((o.x - sim.x) * dx + (o.z - sim.z) * dz) / L2, 0, 1);
      if (Math.hypot(o.x - (sim.x + dx * t), o.z - (sim.z + dz * t)) < o.r + 1 && Math.hypot(x - o.x, z - o.z) < o.r + 9) {
        const sideA = bearing(x - o.x, z - o.z) + (this.R() < 0.5 ? 1 : -1) * 1.15;
        return { x: o.x + Math.sin(sideA) * (o.r + 6.5), z: o.z + Math.cos(sideA) * (o.r + 6.5), behind: { x, z } };
      }
    }
    return { x, z };
  }
  /** Whether its head can get to (x, z): the nearest ground its body can stand on (nav) is reachable and within a neck's reach.
   *  Cached per object for a couple of seconds. */
  _canReach(o) {
    const nav = this.sim.nav; if (!nav || !nav.nearestOpen) return true;
    const m = this.objMem[o.id] || (this.objMem[o.id] = { hab: 0, seen: 0, smelt: 0, kind: o.kind });
    if (m.reachT !== undefined && this.t - m.reachT < 2 && Math.hypot(m.reachX - o.x, m.reachZ - o.z) < 1) return m.reach;
    const [nx, nz] = nav.nearestOpen(o.x, o.z, [this.sim.x, this.sim.z]);
    m.reach = Math.hypot(nx - o.x, nz - o.z) < this.sp.dims.reachStop + 2 && nav.reachable(this.sim.x, this.sim.z, nx, nz) && Math.abs(this.T.height(o.x, o.z) - this.T.height(nx, nz)) < 3;
    m.reachT = this.t; m.reachX = o.x; m.reachZ = o.z; return m.reach;
  }
  /** Food it cannot get at: it stops wanting it (for a long while) and remembers why. */
  _noReach(o) {
    const m = this.objMem[o.id]; if (m) m.hab = Math.max(m.hab, 0.92);
    if (this.focus && this.focus.id === o.id) this.focus = null;
    this.mem.noReach = { id: o.id, x: o.x, z: o.z, t: this.t, place: this.T.placeName ? this.T.placeName(o.x, o.z) : null };
    this.thought = 'It cannot get in there. It gives the meat up.';
  }
  /** A point dist ahead along heading hd, or the nearest heading to it (up to 70 degrees either way) whose point its body can
   *  reach; `open` false when none can. */
  _wayToward(hd, dist) {
    const sim = this.sim, nav = sim.nav, at = (a) => ({ x: sim.x + Math.sin(a) * dist, z: sim.z + Math.cos(a) * dist });
    if (!nav) return { ...at(hd), open: true };
    const A = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2];
    // a straight walk if there is one; else somewhere it can get to the long way round (and then it holds that course)
    for (const da of A) { const p = at(hd + da); if (this._inB(p.x, p.z, 4) && nav.costAt(p.x, p.z) < Infinity && nav.clear(sim.x, sim.z, p.x, p.z)) return { ...p, open: true, hd: hd + da }; }
    for (const da of A) { const p = at(hd + da); if (this._inB(p.x, p.z, 4) && nav.costAt(p.x, p.z) < Infinity && nav.reachable(sim.x, sim.z, p.x, p.z)) return { ...p, open: true, round: true, hd: hd + da }; }
    return { ...at(hd), open: false, hd };
  }
  /** A path that walks round rock instead of through it. */
  _route(x0, z0, x1, z1) {
    const pts = [];
    for (const o of this.T.obstacles) {
      if (o.kind === 'wall') continue;
      const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1, t = clamp(((o.x - x0) * dx + (o.z - z0) * dz) / L2, 0, 1);
      const cx = x0 + dx * t, cz = z0 + dz * t, dd = Math.hypot(o.x - cx, o.z - cz);
      if (dd < o.r + 3.2 && t > 0.02 && t < 0.98) {
        const nx = (cx - o.x) / (dd || 1), nz = (cz - o.z) / (dd || 1), off = o.r + 5;
        pts.push({ t, x: o.x + (dd > 0.1 ? nx : -dz / Math.sqrt(L2)) * off, z: o.z + (dd > 0.1 ? nz : dx / Math.sqrt(L2)) * off });
      }
    }
    pts.sort((a, b) => a.t - b.t);
    return [...pts.map(({ x, z }) => ({ x, z })), { x: x1, z: z1, last: true }];
  }
  _follow(b, pace, extra = {}) {
    if (!b.route || !b.route.length) return null;
    const w = b.route[0];
    if (Math.hypot(w.x - this.sim.x, w.z - this.sim.z) < (w.last ? 3.5 : 4.5)) { b.route.shift(); if (!b.route.length) return null; }
    const n = b.route[0];
    return { kind: 'move', id: b.gen * 100 + b.route.length, x: n.x, z: n.z, last: !!n.last, ...extra };
  }

  // ---------------------------------------------------------------------- running a behaviour
  _run(dt, c, world) {
    const b = this.beh, R = this.R, sim = this.sim, K = this.know, a = K.target, M = this.mood;
    b.t += dt;
    const I = { pace: 2.2 };
    const eye = a ? { x: a.x, y: a.y, z: a.z } : null;
    const bel = { x: this.sum.x, y: this.T.height(this.sum.x, this.sum.z) + 1.2, z: this.sum.z };
    const gest = (k, pt) => { if (sim.gesture(k, pt)) { /* noted by events */ } };
    // a behaviour about you with no you any more (forgotten, a new life, gone from its picture between decisions): it ends here,
    // and the next decision picks what to do; the body only looks where it last believed you were (NOTES4: display read a.x of
    // null and threw, saltline runner/3)
    if (!a && NEEDS_TARGET.has(b.name)) { b.done = true; I.look = this.sum && this.sum.cert > 0.1 ? { ...bel } : null; this.thought = 'Where did it go?'; return I; }
    switch (b.name) {
      case 'roam': {
        I.goal = this._follow(b); I.pace = b.pace;
        this.thought = K.seen ? 'It has seen you. For now it is ignoring you.' : 'Wandering, nothing on its mind.';
        if (!I.goal) b.done = true;
        if (R() < dt * 0.04 && !K.seen) gest('sniffAir');
        break;
      }
      case 'pause': {
        this.thought = K.seen ? 'Standing. It knows you are there.' : 'Standing, breathing, letting the paddock settle.';
        // standing with you in view and its eyes on you: the body comes round to you rather than the head straining back past its reach
        if (K.seen && a && Math.abs(wrap(bearing(a.x - sim.x, a.z - sim.z) - sim.psi)) > 1.2) I.goal = { kind: 'face', x: a.x, z: a.z };
        break;
      }
      case 'listen': {
        I.freeze = true; I.alert = 1; I.breathHold = 1; I.noIdle = true;
        b.next -= dt;
        if (b.next < 0) { b.next = lognormal(R, 1.4, 0.5); b.jx = R.range(-4, 4); b.jz = R.range(-4, 4); if (R() < 0.25) gest('tilt'); }
        if (b.reason === 'sight' && K.seen && a) b.at = { x: a.x, y: a.y - 0.5, z: a.z };      // frozen at the sight of you: the eyes stay on you, not on where you were
        I.look = { x: b.at.x + (b.jx || 0), y: (b.at.y ?? 1) + 0.5, z: b.at.z + (b.jz || 0), lock: true };
        // a sound behind it: turn to face it first, then freeze
        if (Math.abs(wrap(bearing(b.at.x - sim.x, b.at.z - sim.z) - sim.psi)) > 1.2) { I.goal = { kind: 'face', x: b.at.x, z: b.at.z }; I.freeze = false; I.quickTurn = true; }
        this.thought = `Heard something to the ${dirWord(bearing(b.at.x - sim.x, b.at.z - sim.z))}. Frozen, listening.`;
        if (b.t > b.dur * 0.85 && !b.huffed && R() < 0.5) { b.huffed = true; gest(R() < 0.6 ? 'huff' : 'sniffAir'); }
        break;
      }
      case 'sniff': {
        I.noIdle = true; I.alert = 0.4;
        if (!b.sn) { b.sn = true; const d = this.scent > 0.05 ? this.scentDir : sim.head.yaw; gest('sniffAir', { x: sim.x + Math.sin(d) * 30, y: sim.groundY + 18, z: sim.z + Math.cos(d) * 30 }); }
        if (b.t > 3.4 && this.scent > 0.05 && !b.turned) { b.turned = true; }
        if (b.turned) I.goal = { kind: 'face', x: sim.x + Math.sin(this.scentDir) * 30, z: sim.z + Math.cos(this.scentDir) * 30 };
        this.thought = this.scent > 0.05 ? `A scent on the wind from the ${dirWord(this.scentDir)}.` : 'Scenting the air.';
        break;
      }
      case 'search': {
        const s = b.spot;
        if (b.route && b.route.length) { I.goal = this._follow(b); I.pace = b.pace; I.stalk = b.low; }
        else { I.goal = { kind: 'reach', id: b.gen, x: (s.behind || s).x, z: (s.behind || s).z, hold: R.range(3, 6) }; I.pace = 1.6; if (!b.at) b.at = this.t; }
        I.look = s.behind ? { x: s.behind.x, y: this.T.height(s.behind.x, s.behind.z) + 1, z: s.behind.z } : undefined;
        I.noIdle = true;
        if (b.at && this.t - b.at > 7) { b.done = true; this.mem.fooled = Math.min(1, this.mem.fooled + 0.12); this.startle = null; if (b.fromSound && b.soundKind === 'stone') { this.mem.decoys++; this.lastDecoy = this.t; } if (b.memo) b.memo.miss = (b.memo.miss || 0) + 1; }
        this.thought = b.memo ? 'Checking the place you hid last time.' : b.traced ? 'It saw where the stone came from. Going there.' : s.behind ? 'Going round the rock to see what is behind it.' : (b.fromSound ? `Going to see what made that sound, to the ${dirWord(bearing(s.x - sim.x, s.z - sim.z))}.` : `Going to where it thinks you are, to the ${dirWord(bearing(s.x - sim.x, s.z - sim.z))}.`);
        break;
      }
      case 'stare': I.look = { ...bel, lock: true }; I.alert = 0.6; I.breathHold = 0.6; I.noIdle = true; this.thought = 'Staring at the place you might be.'; break;
      case 'ambush': {
        I.look = { ...bel, lock: true }; I.freeze = true; I.breathHold = 0.9; I.alert = 0.3; I.noIdle = true;
        if (Math.abs(wrap(bearing(bel.x - sim.x, bel.z - sim.z) - sim.psi)) > 0.5) I.goal = { kind: 'face', x: bel.x, z: bel.z };
        this.thought = 'Gone completely still, watching for you.';
        if (b.t > b.dur - 1 && !b.h) { b.h = true; gest('huff'); }
        break;
      }
      case 'leave': {
        I.goal = this._follow(b); I.pace = b.pace;
        if (b.t > b.lookBack && b.t < b.lookBack + 2.5) I.look = { ...bel, lock: true };      // a look back over the shoulder
        this.thought = 'Losing interest.';
        if (!I.goal) { b.done = true; M.interest *= 0.5; }
        break;
      }
      case 'watch': {
        I.look = { ...eye, lock: true, tilt: true }; I.noIdle = true; I.breathHold = 0.5; I.alert = 0.35;
        if (Math.abs(wrap(bearing(a.x - sim.x, a.z - sim.z) - sim.psi)) > 0.7) I.goal = { kind: 'face', x: a.x, z: a.z };
        I.quickTurn = true;
        b.next -= dt;
        if (b.next < 0) { b.next = lognormal(R, 3.5, 0.6); const r = R(); gest(r < 0.35 ? 'huff' : r < 0.6 ? 'tilt' : r < 0.7 && M.irritation > 0.3 ? 'growl' : 'huff'); }
        this.thought = c.d < 20 ? 'Watching you. Close.' : 'Watching you.';
        break;
      }
      case 'stalk': {
        // (watched, it stops: then, as its patience goes, it comes another way: _watchedApproach)
        const WA = b.creep ? this._watchedApproach(dt, b, c, a) : { hold: false, mode: 'creep', goal: null }, hold = WA.hold;
        const ip = this._intercept(a, 1.3); I.goal = WA.goal || { kind: 'approach', id: b.gen, x: ip.x, z: ip.z, stop: b.stop, quick: true }; I.pace = WA.pace || 1.3; I.stalk = WA.mode !== 'open'; I.noIdle = true;
        I.look = { ...eye, lock: true }; I.freeze = hold; I.breathHold = hold ? 0.8 : 0.3; I.quickTurn = true;
        if (WA.mode === 'open') this._openTell(dt, b, c, I);
        this.thought = hold ? 'Stopped. You are looking at it.' : WA.mode === 'open' ? 'Coming on in plain sight, slow.' : WA.mode === 'cover' ? 'Going in behind cover.' : WA.mode === 'arc' ? 'Moving round to come from another side.' : b.creep ? 'Creeping closer while you look away.' : 'Stalking you, head low.';
        if (c.d < b.stop + 0.8) b.done = true;
        break;
      }
      case 'circle': {
        b.ang += b.dir * dt * (1.7 / b.r);
        let tx = a.x + Math.sin(b.ang) * b.r, tz = a.z + Math.cos(b.ang) * b.r;
        // it circles where there is room to: the way round ahead blocked or tight (its own turning room), it turns back the other
        // way; boxed in both ways, it stops circling
        if (sim.nav && sim.nav.costAt(tx + Math.sin(b.ang + b.dir * 1.57) * 4, tz + Math.cos(b.ang + b.dir * 1.57) * 4) >= 4) {
          if (this.t - (b.flipT ?? -99) < 4) b.done = true;
          b.flipT = this.t; b.dir = -b.dir; b.ang += b.dir * 0.2; tx = a.x + Math.sin(b.ang) * b.r; tz = a.z + Math.cos(b.ang) * b.r;
        }
        I.goal = { kind: 'move', id: b.gen, x: tx + Math.sin(b.ang + b.dir * 1.57) * 4, z: tz + Math.cos(b.ang + b.dir * 1.57) * 4 }; I.pace = 1.7;
        I.look = { ...eye, lock: true }; I.noIdle = true; I.agitation = 0.15;
        this.thought = 'Circling you, keeping its eyes on you.';
        break;
      }
      case 'inspect': {
        I.goal = { kind: 'approach', id: b.gen, x: a.x, z: a.z, stop: b.stop, hold: 30 }; I.pace = 1.2;
        I.look = { ...eye, lock: true }; I.noIdle = true; I.probe = { ...eye, k: c.d < b.stop + 2 ? 0.8 : 0, standoff: 2.2 }; I.quickTurn = true;
        if (c.d < b.stop + 1.5) {
          b.next -= dt;
          if (b.next < 0) { b.next = lognormal(R, 2.2, 0.5); gest(R() < 0.6 ? 'huff' : 'tilt'); }
        }
        if (this.tame > 0.2) { I.relax = this.tame; }
        this.thought = c.d < b.stop + 2 ? 'Its face is right in front of yours, breathing on you.' : 'Coming closer to get a look at you.';
        break;
      }
      case 'display': {
        I.goal = { kind: 'face', x: a.x, z: a.z, offset: b.side }; I.display = 1; I.agitation = 0.9; I.noIdle = true; I.quickTurn = true;
        if (b.rival && !b.roared && b.t > b.dur * 0.45 && this.t - (this.lastRoar ?? -99) > 30) { b.roared = true; sim.roar(); this.lastRoar = this.t; }
        if (b.t + dt >= b.dur && !b.judged && c.seen) { b.judged = true; this.ap.onRitual(c.running && c.d > b.d0 ? 'ran' : c.d > b.d0 + 2 ? 'backed' : c.d < b.d0 - 1.5 ? 'came' : 'held', !!b.rival); }
        I.look = { ...eye, lock: true };
        b.next -= dt;
        if (b.next < 0) { b.next = lognormal(R, 2.4, 0.4); gest(R() < 0.7 ? 'growl' : 'stomp'); }
        if (!b.roared && b.t > b.dur * 0.7) { b.roared = true; if (this.t - (this.lastRoar ?? -99) > 45 && R() < 0.15 + 0.45 * M.irritation) { sim.roar(); this.lastRoar = this.t; } }
        this.thought = b.side ? 'Turning side-on to show you how big it is.' : 'Head down, jaws parted, rumbling at you.';
        break;
      }
      case 'bluff': {
        if (b.phase === 'charge') {
          I.goal = { kind: 'approach', id: b.gen, x: a.x, z: a.z, stop: b.stop, quick: true }; I.pace = R.range(7, 9); I.agitation = 1; I.display = 0.4;
          I.look = { ...eye, lock: true }; I.noIdle = true;
          if (c.d < b.stop + 1.2 && Math.abs(sim.v) < 2.5) { b.phase = 'end'; b.endT = b.t; gest('stomp'); if (R() < 0.6 && this.t - (this.lastRoar ?? -99) > 45) { sim.roar(); this.lastRoar = this.t; } else gest('snap', this._snapPoint(a)); }
          this.thought = 'Charging!';
        } else {
          I.look = { ...eye, lock: true }; I.display = 0.8; I.agitation = 0.6; I.freeze = true; this.thought = 'Stopped short. Daring you.';
          if (b.dEnd === undefined) b.dEnd = c.d;
          if (b.t - b.endT > 3.5 && !b.judged) { b.done = true; b.judged = true; if (c.seen) this.ap.onRitual(c.running && c.d > b.dEnd ? 'ran' : c.d > b.dEnd + 2 ? 'backed' : c.d < b.dEnd - 1.5 ? 'came' : 'held', !!b.rival); }      // did it back down?
        }
        break;
      }
      case 'chase': {
        let ip = this._intercept(a, Math.abs(sim.v) + 2);
        // you are running for the place you got away into before: it knows, and goes for the way in instead
        const cut = this._refugeAhead(a); b.cut = cut;
        if (cut) ip = { x: cut.x, z: cut.z };
        I.goal = { kind: 'approach', id: b.gen + (cut ? 1 : 0), x: ip.x, z: ip.z, stop: cut ? 1.5 : this.sp.spacing.chase, quick: true }; I.pace = 9.6 - 3.5 * Math.max(0, c.fatigue - 0.75); I.agitation = 0.8; I.noIdle = true; I.burst = b.t < 1.6; I.quickTurn = true;
        I.look = { ...eye, lock: true };
        if (c.dHead < 4.4 && !b.snapped) { b.snapped = true; gest('snap', this._snapPoint(a)); b.after = b.t; this.lastSnap = this.t; }
        if (b.snapped && b.t - b.after > 1.6) b.snapped = false;
        if (!c.running && c.d < 12 && b.t > 3) b.done = true;
        // it keeps on while it is closing; a chase it is losing it abandons
        if (this._losing(dt, b, c) || c.fatigue > 0.97) b.done = true;
        this.thought = b.cut ? 'Cutting you off: it knows where you are running.' : 'Running you down.';
        break;
      }
      case 'snap': {
        I.look = { ...eye, lock: true }; I.noIdle = true; I.agitation = 1;
        if (!b.fired) { b.fired = true; gest('snap', this._snapPoint(a)); M.irritation *= 0.6; M.arousal *= 0.85; this.lastSnap = this.t; }
        if (b.t > b.dur) b.done = true;
        this.thought = 'Snapped at you.';
        break;
      }
      case 'feign': {
        if (b.phase === 'away') {
          I.goal = this._follow(b); I.pace = 1.5;
          if (b.t > b.glance && b.t < b.glance + 1.2) I.look = { ...eye };
          this.thought = 'Turning away, as if it has lost interest.';
          if (!I.goal) { b.phase = 'wait'; b.waitT = b.t; b.waitFor = lognormal(R, 3, 0.5); }
        } else if (b.phase === 'wait') {
          I.freeze = true; I.breathHold = 1; I.alert = 0.5; I.noIdle = true; this.thought = 'Stopped. Listening behind it.';
          if (b.t - b.waitT > b.waitFor) { b.phase = 'turn'; b.turnT = b.t; }
        } else {
          I.goal = { kind: 'face', x: a.x, z: a.z }; I.look = { ...eye, lock: true }; I.noIdle = true; I.alert = 0.6;
          this.thought = 'Spun back round to check on you.';
          if (b.t - b.turnT > 3) b.done = true;
        }
        break;
      }
      case 'nudge': {
        // the snout comes right up to you and pushes; a test of what you are
        const touch = c.dHead < 2.6;
        I.goal = { kind: 'approach', id: b.gen, x: a.x, z: a.z, stop: this.sp.spacing.nudge, hold: 30 }; I.pace = 1.0; I.noIdle = true;
        I.look = { ...eye, lock: true }; I.probe = { ...eye, k: b.phase === 'close' ? 1 : 0.2, standoff: b.phase === 'close' ? -0.15 : 2.5 };
        if (b.phase === 'close' && (touch || b.t > 6)) { b.phase = 'after'; b.at = b.t; this.events.push({ type: 'nudge', x: a.x, z: a.z, dx: Math.sin(sim.head.yaw), dz: Math.cos(sim.head.yaw) }); sim.gesture('huff'); }
        if (b.phase === 'after' && b.t - b.at > 2.5) b.done = true;
        this.thought = b.phase === 'close' ? 'Pushing its snout right up against you.' : 'It nudged you. Now it waits to see what you do.';
        break;
      }
      case 'revisit': {
        I.goal = this._follow(b); I.pace = b.pace;
        if (!I.goal) { b.done = true; this.startle = null; }
        this.thought = 'Coming back to where it last saw you.';
        break;
      }
      case 'besiege': {
        // Getting its senses on you: no knowledge of doors, windows or pipes here. It asks the planner (nav.senseSpots) where an
        // eye or its nostrils could have a clear line to where it believes you are, and how to stand and crouch to get them
        // there, then works through those places: walks to the stance, brings the head in along the planned axis, looks or
        // breathes, and moves on to the next when a place fails (the head will not go, or nothing is there) or has been used.
        const S = b.S; if (!S) { b.done = true; break; }      // (nowhere to besiege: _start ended it)
        this.mem.besieged = (this.mem.besieged || 0) + dt;
        { const G = this.mem.siege && this.mem.siege.id === S.id && this.mem.siege.who === this.who && this.t - this.mem.siege.t < 90 ? this.mem.siege : (this.mem.siege = { id: S.id, who: this.who, T: 0, used: (this.mem.siege && this.mem.siege.id === S.id ? this.mem.siege.used : []) }); G.T += dt; G.t = this.t; }
        if (c.seen && (!c.enclosed || !c.walled) && !(b.strikeAt !== undefined && b.t - b.strikeAt < 1.6)) { b.done = true; break; }          // it came out, or its body can get at you after all
        const inS = this.T.insideStructure(this.sum.x, this.sum.z);
        // where it believes you are: what it sees; out of sight, where it last saw you if its belief is still there (it was taken
        // to be on the ground whenever you dropped from view, so a person up on a raised floor flipped between two heights and the
        // plan was thrown away and made again every few seconds, the body walking between two ways in and never reaching one)
        if (c.seen && a) b.seenP = { x: a.x, y: a.y, z: a.z };
        const P = c.seen && a ? { x: a.x, y: a.y, z: a.z } : b.seenP && Math.hypot(this.sum.x - b.seenP.x, this.sum.z - b.seenP.z) < 2.5 ? { ...b.seenP } : inS === S ? { x: this.sum.x, y: this.T.height(this.sum.x, this.sum.z) + 1.0, z: this.sum.z } : { x: S.cx, y: this.T.height(S.cx, S.cz) + 1.0, z: S.cz };
        const name = S.name || 'there';      // naming only (the readout's name, not the animal's)
        I.noIdle = true; I.look = { ...P, lock: true };
        // (re)plan when there is no plan, the target has moved, or the places are used up; the search is spread over ticks
        const moved = b.planP && Math.hypot(P.x - b.planP.x, P.y - b.planP.y, P.z - b.planP.z) > 1.3;
        if (!b.pg && (!b.spots || moved || b.si >= b.spots.length) && b.phase !== 'wait') {
          b.planP = { ...P }; const gP = this.T.height(P.x, P.z);      // (it keeps its head off a person: a spot nearer than that is no spot)
const used = this._siegeUsed(S);      // (ways in it has already had its head at, here: the next try is somewhere else first)
b.pg = sim.nav ? sim.nav.senseGen(sim.selfModel(), P, { x: sim.x, z: sim.z }, { avoid: b.avoid, keep: [{ x: P.x, z: P.z, y0: Math.min(P.y, gP + 0.85), y1: Math.max(P.y, gP + 1.7), r: 1.55 }], bias: (E) => { let k = 0; for (const U of used) { const dd = Math.hypot(U.x - E.x, U.z - E.z); if (dd < 3.5) k += 1.6 * (1 - dd / 3.5); } return k; } }) : null;
          if (!b.pg) { b.phase = 'wait'; b.at = b.t; }
        }
        if (b.pg) { for (let i = 0; i < 2; i++) { const r = b.pg.next(); if (r.done) { b.spots = r.value; b.si = 0; b.pg = null; this._reach().plan(this.T, sim.nav, { x: sim.x, z: sim.z }, b.planP, b.spots, this.t); b.planned = (b.planned || 0) + 1; if (b.phase !== 'wait') { b.phase = b.spots.length ? 'go' : 'wait'; b.at = b.t; } break; } } }
        const sp = b.spots && b.si < b.spots.length ? b.spots[b.si] : null;
        if (sp) b.shape = sp.shape;      // what the way in looks like, for the thoughts (low, narrow, roofed, under...)
        // before the body moves off, a head that is in among things comes back out the way it went in (along the planned axis, or
        // straight back along the skull), however it got there
        const withdraw = () => {
          if (sim.headRoom(0.5) <= 0) return;
          const h = sim.head, d = sp && sim.senseKey === sp.key ? sp.d : { x: h.f.x, y: h.f.y, z: h.f.z }, bk = sp ? Math.max(1.2, sp.back) : 1.5;
          b.wd = { H: { x: h.pos.x - d.x * bk, y: h.pos.y - d.y * bk + 0.15, z: h.pos.z - d.z * bk }, d, low: sim.lowness, back: 0.3, key: 'w' + b.t.toFixed(2), until: b.t + 8, from: b.t, best: 99 };
        };
        const fail = (w) => { withdraw(); if (sp) { b.avoid.push({ ...sp.E, s: sp.eye, w }); this._siegeUse(S, sp.E); } b.lined = false; b.si++; b.tried++; b.sub = 'shift'; const nx = b.spots && b.spots[b.si]; b.phase = nx && Math.hypot(nx.B.x - sim.x, nx.B.z - sim.z) < 1.0 ? 'probe' : 'go'; b.at = b.t; b.fitT = 0; };
        if (b.wd && b.phase !== 'wait') {
          // first the head comes back out the way it went in, the body still; only then does it move off
          // (when the neck has drawn back all it can and the head is still in, the body backs a step straight out behind it)
          const h = sim.head.pos, W = b.wd, dW = Math.hypot(h.x - W.H.x, h.y - W.H.y, h.z - W.H.z);
          if (dW < W.best - 0.02) { W.best = dW; W.bestT = b.t; }
          const stall = b.t - (W.bestT ?? W.from) > 0.8;
          I.goal = stall ? { kind: 'drive', throttle: -0.35, steer: 0 } : { kind: 'face', x: sim.x + Math.sin(sim.psi) * 10, z: sim.z + Math.cos(sim.psi) * 10 }; I.pace = 1.0;
          I.sense = { H: W.H, d: W.d, eye: 0, low: W.low, back: W.back, k: 1, key: W.key };
          this.thought = 'Drawing its head back out.';
          if (dW < 0.5 || sim.headRoom(0.45) <= 0 || b.t > W.until) b.wd = null;
        } else if (b.phase === 'plan' || (b.pg && !sp)) {
          I.goal = { kind: 'face', x: P.x, z: P.z };
          this.thought = `You are in ${name}. It looks for a way to get its head to you.`;
        } else if (b.phase === 'go' && sp) {
          // lining up, back far enough for the head to come down clear: an approach to a point far ahead along the planned
          // heading, stopping short of it, ends on that line facing along it
          // (first to a point on the planned line a few strides behind the lining-up stance; the last metres are stance work)
          // (a big biped cannot park sideways: it only has to get near the start of the line, whatever its heading; the stance
          // work below turns it onto the line and walks it in, as a driver follows a lane)
          const fx = Math.sin(sp.yaw), fz = Math.cos(sp.yaw), bk = { x: sp.B.x - fx * (sp.back + 2.5), z: sp.B.z - fz * (sp.back + 2.5) };
          const efB = (sp.B.x - fx * sp.back - sim.x) * fx + (sp.B.z - fz * sp.back - sim.z) * fz;      // how far behind the lining-up stance, along the line
          I.goal = { kind: 'move', id: b.gen * 1000 + b.si, x: bk.x, z: bk.z, last: true }; I.pace = c.seen ? 2.0 : 1.6;
          // (walking round to the next way in, its eyes go to that gap when the wall is between it and you: a head turned at you
          //  through the planks dragged its snout along them, NOTES4)
          { const hp = sim.head.pos; if (this.T.segClear && !this.T.segClear(hp.x, hp.y, hp.z, P.x, P.y, P.z, 0.12)) I.look = Math.hypot(bk.x - sim.x, bk.z - sim.z) > 3 ? { x: bk.x + Math.sin(sp.yaw) * 6, y: hp.y, z: bk.z + Math.cos(sp.yaw) * 6, lock: true } : { x: sp.E.x, y: sp.E.y, z: sp.E.z, lock: true }; }      // (on the way: where it walks; at the stance: the gap)
          const dB = Math.hypot(bk.x - sim.x, bk.z - sim.z);
          this.thought = b.sub === 'shift' ? 'Shifting its feet, trying another angle.' : b.si === 0 && b.tried === 0 ? `You are in ${name}. It goes to where it can get its head to you.` : `Going round ${name} to another way in.`;
          const elB = Math.abs((sp.B.x - sim.x) * fz - (sp.B.z - sim.z) * fx);      // off the line sideways (the stance work below sends it back round past 2.6 m: it entered at up to 3.5 and flipped between the two every tick)
          if (dB < 3.5 && efB > -0.5 && elB < 2.0) { b.phase = 'probe'; b.at = b.t; b.fitT = 0; b.sub = 'shove'; b.adj = false; b.lined = false; }
          if (b.t - b.at > 30) fail(3);
        } else if (b.phase === 'probe' && sp) {
          // stand where planned, facing along the plan; bring the head in; then use it
          // the head is brought down and lined up on the way in first, from a step back; then the body steps in behind it
          if (sim.senseStage === 0 && sim.senseKey === sp.key) b.lined = true;
          // stance work: creep along the planned heading to the stance (the lining-up one until the head is on its axis), turning
          // onto the heading and drifting across onto the line as it goes; a little left over the neck takes up
          // it follows the line like a lane: aims at a point on it a couple of metres ahead of itself (so the lateral error closes as it
          // walks), turns on the spot first when that point is well off its heading, and only backs up straight
          const fx = Math.sin(sp.yaw), fz = Math.cos(sp.yaw), bb = b.lined ? 0 : sp.back, tx = sp.B.x - fx * bb, tz = sp.B.z - fz * bb, ex = tx - sim.x, ez = tz - sim.z;
          const ef = ex * fx + ez * fz, el = ex * fz - ez * fx, ey = wrap(sp.yaw - sim.psi);
          const Ld = clamp(ef, 0, 2.2), lkx = tx - fx * (ef - Ld), lkz = tz - fz * (ef - Ld);
          const want = ef > 0.25 && Math.hypot(lkx - sim.x, lkz - sim.z) > 0.6 ? bearing(lkx - sim.x, lkz - sim.z) : sp.yaw, err = wrap(want - sim.psi);
          const thr = Math.abs(err) > 0.45 ? 0 : ef > 0.1 ? clamp(0.7 * ef, 0.18, 0.7) * (1 - Math.abs(err)) : ef < -0.1 ? clamp(0.7 * ef, -0.4, -0.15) : 0;
          if (Math.abs(el) > 2.6 || ef < -3.5 || ef > 7) { b.phase = 'go'; b.at = b.t; }      // well off the line: round again to the start of it
          I.goal = { kind: 'drive', throttle: thr, steer: clamp(1.6 * err, -0.6, 0.6) }; I.pace = 1.0;      // (turning on the spot slowly: a tail sweeps a wide arc)
          const h = sim.head, f = h.f, l = h.l, u = h.u, s = sp.eye;
          const sx = s ? h.pos.x + f.x * 0.42 + l.x * s * 0.55 + u.x * 0.4 : h.pos.x + f.x * this.sp.dims.headLen, sy = s ? h.pos.y + f.y * 0.42 + l.y * s * 0.55 + u.y * 0.4 : h.pos.y + f.y * this.sp.dims.headLen, sz = s ? h.pos.z + f.z * 0.42 + l.z * s * 0.55 + u.z * 0.4 : h.pos.z + f.z * this.sp.dims.headLen;
          const off = Math.hypot(sx - sp.E.x, sy - sp.E.y, sz - sp.E.z), there = off < (b.thereT ? 0.75 : 0.45);      // (once there it stays there through the gaze's own sweep; it flipped between pushing in and using the place every tick)
          // searching once there: the head works a little round the planned place, the gaze sweeping
          const sw = there ? Math.sin((b.t - b.at) * 0.9) : 0, lx = -sp.d.z, lz = sp.d.x, ll = Math.hypot(lx, lz) || 1;
          // (the owner at the barn, "why is it creeping with its head sideways like this?": with you in sight it looks squarely at you, no cocked eye, the
          //  head's line turned toward you from the planned one as far as the gap allows; the one-eyed peer is for looking into a gap for someone it cannot see)
          let dX = sp.d.x, dZ = sp.d.z; if (c.seen && a) { const hz = Math.hypot(sp.d.x, sp.d.z) || 1, yp = Math.atan2(sp.d.x, sp.d.z), yy = yp + clamp(wrap(Math.atan2(a.x - sp.H.x, a.z - sp.H.z) - yp), -0.5, 0.5); dX = Math.sin(yy) * hz; dZ = Math.cos(yy) * hz; }
          I.sense = { H: { x: sp.H.x + lx / ll * 0.12 * sw, y: sp.H.y + 0.05 * Math.sin((b.t - b.at) * 1.3), z: sp.H.z + lz / ll * 0.12 * sw }, d: { x: dX + lx / ll * 0.18 * sw, y: sp.d.y, z: dZ + lz / ll * 0.18 * sw }, eye: c.seen && a ? 0 : s, low: sp.low, back: sp.back, k: 1, key: sp.key };
          I.alert = 0.6;
          // the owner, at a big window he stood beside: "this peering behavior is odd, its low and its head is off to the side, why? i would be
          // expecting it to get its head through this giant window im standing right next to and try to get me this way". The places
          // are eye places (a head kept off a person), so a hungry one with you in the gap's line and in reach did not strike from one
          // until its eye was on the place, which it seldom was, and a reach verdict gone stale shut the strike off; now the line
          // through the gap to you, the head near the gap and you in reach are the test, and the strike goes at your head height
          const jd = c.seen && a && !a.dead ? this._jawDrive(c) : { v: 0 };
          const thru = jd.v > 0.2 && c.seen && a && c.dHead < 4.8 && off < 2.2 && (a.state || 'free') === 'free' && !!this.T.segClear && this.T.segClear(sp.E.x, sp.E.y, sp.E.z, a.x, Math.max(a.y - 0.65, sp.E.y - 0.3), a.z, 0.15);
          if (!there && !thru && !(b.strikeAt !== undefined && b.t - b.strikeAt < 1.4)) {
            if (Math.abs(ef) < 0.6 && Math.abs(ey) < 0.3) b.fitT += dt; b.sub = 'shove';      // (the head's time counts once the body is (nearly) in place)
            this.thought = s ? 'Lowering its head and turning it, bringing one eye to the gap.' : 'Bringing its snout down to the gap.';
            // (the head held against the wall for over a second is a way that will not take it, wherever the body stands: it had
            //  pushed its head at a barn wall for 23 s while the stance work never counted as in place)
            // (pressed on something and getting no nearer to the gap for 1.5 s: the head is on the planks beside it, not in it; this
            //  way will not take it: the next place. It had pressed a wall by a gap for up to 15 s, NOTES4)
            const pressing = (sim.headTouchK || 0) > 0 || (sim.headPress || 0) > 0.3;
            if (!pressing || off < (b.pressBest ?? 99) - 0.15) { b.pressBest = off; b.pressT = b.t; }
            if (pressing && b.t - (b.pressT ?? b.t) > 2.5) { b.pressBest = undefined; b.pressT = undefined; if (R() < 0.5) gest('huff'); fail(4); }
            else if (b.fitT > 6 || b.t - b.at > 15 || (sim.headBlocked > 1.2 && (b.fitT > 2 || b.t - b.at > 5))) { if (R() < 0.5) gest('huff'); fail(4); }
          } else {
            if (!b.thereT) { b.thereT = b.t; b.hold = lognormal(R, c.seen ? 6 : 4.5, 0.3); if (!s) gest('huff', { x: P.x, y: P.y, z: P.z }); }
            // its head is in to you: if it wants you (hungry for you, a grudge, a threat to be ended), the jaws go for you from
            // here (the contact decides, arena._contact); held, it pulls you out the way its head came in
            if (b.strikeAt !== undefined && b.t - b.strikeAt < 1.4) {
              const st = a ? a.state || 'free' : 'free';
              if (st === 'held') { b.done = true; this.motiveNext = b.motive; this._start('seize', { ...c, state: 'held' }, 'through the gap'); return this._run(0, this.ctx || c, world); }
              const torso = { x: a.x, y: st === 'free' ? Math.max(a.y - 0.65, sp.E.y - 0.3) : this.T.height(a.x, a.z) + 0.3, z: a.z };
              I.sense = null; I.probe = { ...torso, k: 1, standoff: 0.2 }; I.grip = true; I.mouth = 0.18;
              // (the neck alone does not carry the head through a gap from the lining-up stance: the body steps up to the wall behind it while you are still out of the jaws' reach, its own collision stopping it there)
              I.goal = { kind: 'drive', throttle: st === 'free' && c.dHead > 0.9 && !(sim.headBlocked > 0.3) ? clamp(0.3 * (c.dHead - 0.8), 0, 0.3) : 0, steer: st === 'free' ? clamp(1.6 * wrap(bearing(a.x - sim.x, a.z - sim.z) - sim.psi), -0.5, 0.5) : 0 };
              b.sub = 'strike'; this.attacking = true;
              this.thought = 'Its jaws go in after you.';
              break;
            }
            // (the owner at the barn: "it made biting sounds but doesn't seem able to get me": it struck from where the snout was 1.5 to 2 m short of
            //  him, over and over, the body standing 5 m off the wall. Through a gap it closes up first, the body stepping up behind the head, and only
            //  bites when the jaws can reach; a body that will not come on any nearer, or a way that does not take it, is given up for the next place)
            const tipD = a ? Math.hypot(sim.head.pos.x + sim.head.f.x * this.sp.dims.headLen - a.x, sim.head.pos.y + sim.head.f.y * this.sp.dims.headLen - (a.y - 0.4), sim.head.pos.z + sim.head.f.z * this.sp.dims.headLen - a.z) : 99;
            const closing = (thru || c.aff.reach) && tipD > 1.5 && !(b.strikeAt !== undefined && b.t - b.strikeAt < 1.4);
            if (closing) {
              if (b.closeT === undefined || tipD < (b.closeBest ?? 99) - 0.1) { b.closeBest = tipD; b.closeT = b.t; }
              I.goal = { kind: 'drive', throttle: sim.headBlocked > 0.3 ? 0 : clamp(0.5 * (tipD - 1.0), 0.25, 0.6), steer: clamp(1.6 * wrap(bearing(a.x - sim.x, a.z - sim.z) - sim.psi), -0.5, 0.5) }; I.pace = 1.0;
              b.sub = 'close'; this.thought = 'Stepping up to the gap, snout in, closing on you.';
              if (b.t - b.closeT > 5) { b.closeT = undefined; b.closeBest = undefined; fail(4); }
              break;
            }
            if (jd.v > 0.2 && (c.aff.reach || thru) && c.dHead < 4.8 && b.t - (b.strikeAt ?? -99) > 3.5 + 3 * R()) {
              const st = a.state || 'free', torso = { x: a.x, y: st === 'free' ? Math.max(a.y - 0.65, sp.E.y - 0.3) : this.T.height(a.x, a.z) + 0.3, z: a.z };
              b.motive = jd.k; this.motive = jd.k; b.strikeAt = b.t; b.strikes = (b.strikes || 0) + 1; gest('seize', torso, { over: true }); break;
            }
            b.sub = c.seen && c.dHead < 4.8 && M.irritation > 0.3 && R() < dt * 0.3 ? 'snap' : s ? 'peer' : 'snort';
            if (b.sub === 'snap') { gest('snap', this._snapPoint(a)); this.lastSnap = this.t; }
            if (!s) I.nose = true;
            I.breathHold = s ? 1 : 0;
            const sees = this.T.segClear ? this.T.segClear(sx, sy, sz, P.x, P.y, P.z, 0.02) : false; b.sees = s ? sees : false;
            const what = b.shape ? (b.shape.under && b.shape.low ? 'the low hole' : b.shape.narrow ? 'the narrow gap' : !b.shape.roofed ? 'over the top' : 'the gap') : 'the gap';
            this.thought = s ? (sees ? `One eye at ${what}, looking straight at where you are.` : `One eye at ${what}, searching the dark in there.`) : what === 'over the top' ? 'Its head comes over the wall at you.' : `Snout in ${what}, breathing you in.`;
            if (b.t - b.thereT > b.hold) {
              // used: the next place, preferring the other sense (an eye after the nose, the nose after an eye)
              withdraw(); b.thereT = 0; this._siegeUse(S, sp.E); b.si++; b.tried++;
              b.lined = false;
          const nx = b.spots && b.spots.slice(b.si).findIndex((q) => q.eye !== sp.eye && Math.hypot(q.E.x - sp.E.x, q.E.z - sp.E.z) < 3);
              if (nx > 0) b.si += nx;
              b.avoid.push({ ...sp.E, s: sp.eye, w: 1.5 });
              const nq = b.spots && b.spots[b.si]; b.phase = nq && Math.hypot(nq.B.x - sim.x, nq.B.z - sim.z) < 1.0 ? 'probe' : 'go'; b.at = b.t; b.fitT = 0; b.sub = 'shift';
            }
          }
          if (b.tried >= 7 && !c.seen) { b.phase = 'wait'; b.at = b.t; b.k = b.exitK !== undefined && b.exitK >= 0 ? b.exitK : 0; b.memoWait = b.exitK !== undefined && b.exitK >= 0; }
        } else if (b.phase !== 'wait') { b.phase = 'wait'; b.at = b.t; b.k = 0; }
        if (b.phase === 'wait') {
          // the oldest trick: stand back from the way out, and wait
          // (NOTES4: it had stood 9 m straight out in front of a door, in full view of it, and given each up in ~25 s: now it waits
          //  close beside the way out nearest where it believes you are, out of the line through it, where you will hear its breath;
          //  the hungrier it is the longer it waits)
          // (ways out a small thing walks out by: ground-level ones; a raised floor inside something bigger is left through that
          //  thing's ways out, so those are the ones to watch)
          if (b.waitO === undefined || b.waitFor0 !== b.k) {
            b.waitFor0 = b.k; let ops = S.openings.filter((o) => !o.up);
            if (!ops.length) { const C = (this.T.structures || []).find((q) => q !== S && q.openings && q.openings.some((o) => !o.up) && Math.abs((S.cx - q.cx) * Math.cos(q.yaw || 0) - (S.cz - q.cz) * Math.sin(q.yaw || 0)) < q.hw && Math.abs((S.cx - q.cx) * Math.sin(q.yaw || 0) + (S.cz - q.cz) * Math.cos(q.yaw || 0)) < q.hd); ops = C ? C.openings.filter((o) => !o.up) : S.openings; }
            const ord = ops.map((o) => [Math.hypot(o.x - P.x, o.z - P.z), o]).sort((p, q) => p[0] - q[0]).map((p) => p[1]); b.waitOp = ord[b.k % ord.length]; b.waitO = b.k; b.wspot = null;
          }
          const O = b.waitOp || { x: S.cx, z: S.cz, nx: 1, nz: 0, y: S.base + 1 }, nl = Math.hypot(O.nx, O.nz) || 1, onx = O.nx / nl, onz = O.nz / nl;
          if (!b.wspot) {
            // either side along the wall, a few metres out: the side the doorway cannot see, that its body can stand on
            let best = null, bs = -1e9;
            for (const sd of [1, -1]) for (const [al, ou] of [[5, 3.2], [6.5, 4], [4, 5]]) {
              const x = O.x + onx * ou - onz * sd * al, z = O.z + onz * ou + onx * sd * al;
              if (sim.nav && sim.nav.costAt && sim.nav.costAt(x, z) > 2.5) continue;
              const ix = O.x - onx * 1.5, iz = O.z - onz * 1.5, hid = !this.los(ix, (O.y ?? S.base + 1) + 0.6, iz, x, this.T.height(x, z) + 3.6, z);
              const sc = (hid ? 2 : 0) - 0.1 * Math.hypot(x - sim.x, z - sim.z) * 0.1 - 0.2 * Math.abs(al - 5);
              if (sc > bs) { bs = sc; best = { x, z, hid }; }
            }
            b.wspot = best || { x: O.x + onx * 9, z: O.z + onz * 9, hid: false };
          }
          const wx = b.wspot.x, wz = b.wspot.z, there = Math.hypot(wx - sim.x, wz - sim.z) < 2;
          I.goal = !there ? { kind: 'move', id: b.gen * 10 + 9, x: wx, z: wz, last: true } : { kind: 'face', x: O.x + onx * 1.5, z: O.z + onz * 1.5 };
          I.look = { x: O.x + onx * 1.2, y: O.y, z: O.z + onz * 1.2, lock: true }; I.freeze = there; I.breathHold = 0.15; I.pace = 1.5; I.low = there ? 0.5 : 0;
          b.lurking = there && b.wspot.hid;
          if (there) { b.puffT = (b.puffT ?? R.range(3, 6)) - dt; if (b.puffT < 0) { b.puffT = R.range(5, 10); gest(this.hunger > 0.6 && R() < 0.5 ? 'rumble' : 'huff', { x: O.x, y: O.y, z: O.z }); } }
          this.thought = b.memoWait ? `Waiting where you came out of ${name} last time.` : `Waiting by the way out of ${name}. It knows you have to come out.`;
          if ((c.seen && b.t - b.at > 3) || (b.t - b.at > 10 && !(b.spots && b.spots.length) && (b.planned || 0) < 4)) { b.phase = 'plan'; b.spots = null; b.pg = null; b.at = b.t; }      // you in sight again, or it has moved and may find a way now: back to work
          // nothing changes for a while: another way out to watch; after watching them all for nothing, it gives it up
          const pat = 1 + 2 * this.hunger;      // (hunger makes it patient)
          if (!c.seen && b.t - (b.waitK ?? b.at) > 12 * pat && S.openings.length > 1) { b.waitK = b.t; b.k++; b.waited = (b.waited || 0) + 1; if (b.waited >= S.openings.length + 1) { b.done = true; M.interest *= 0.5; this.mem.gaveUp = { t: this.t, x: P.x, z: P.z, beh: 'besiege' }; } }
          if (b.t - b.at > (b.waitFor || (b.waitFor = lognormal(R, b.memoWait ? 40 : 25, 0.3) * pat))) { b.done = true; M.interest *= 0.7; }
        }
        break;
      }
      case 'investigate': {
        const o = (world.things || []).find((t) => t.id === b.obj);
        if (!o || o.bright <= 0) { b.done = true; this.thought = 'The light has gone out.'; break; }
        const d = Math.hypot(o.x - sim.x, o.z - sim.z), snout = this._tip(o.x, o.y, o.z), RS = this.sp.dims.reachStop;
        const at = { x: o.x, y: o.y, z: o.z };
        I.look = { ...at, lock: true, tilt: true }; I.noIdle = true; I.alert = 0.5;
        if (b.phase === 'go') {
          I.goal = { kind: 'approach', id: b.gen, x: o.x, z: o.z, stop: RS + b.stand, hold: 30 }; I.pace = 1.3; I.stalk = d < 15 + RS;
          this.thought = 'A light on the ground. Going to look at it.';
          if (d < RS + b.stand + 1.2 && Math.abs(sim.v) < 0.6) { b.phase = 'look'; b.at = b.t; }
        } else if (b.phase === 'look') {
          I.breathHold = 0.6; this.thought = 'Staring at the flare. It does not know what it is.';
          b.next -= dt; if (b.next < 0) { b.next = lognormal(R, 2, 0.5); gest(R() < 0.5 ? 'tilt' : 'huff'); }
          if (b.t - b.at > lognormal(R, 4, 0.3)) { b.phase = 'sniff'; b.at = b.t; }
        } else if (b.phase === 'sniff') {
          I.probe = { ...at, k: 1, standoff: 0.8 }; I.goal = { kind: 'reach', id: b.gen + 1, x: o.x, z: o.z, hold: 30 }; I.pace = 0.8;
          this.thought = 'Reaching its snout down to the flare, smelling it.';
          if (snout < 1.25) { b.phase = 'recoil'; b.at = b.t; gest('startle', at); this.objMem[o.id].hab = Math.max(this.objMem[o.id].hab, 0.6); }
          if (b.t - b.at > 7) { b.phase = 'recoil'; b.at = b.t; }
        } else if (b.phase === 'recoil') {
          I.goal = { kind: 'drive', throttle: b.t - b.at < 1.2 ? -0.3 : 0, steer: 0 }; I.pace = 2; this.thought = 'Too hot. It jerks its head back.';
          if (b.t - b.at > 2.2) { b.phase = b.stomp ? 'stomp' : 'leave'; b.at = b.t; if (!b.stomp) gest('huff'); }
        } else if (b.phase === 'stomp') {
          I.goal = { kind: 'move', id: b.gen + 2, x: o.x, z: o.z, last: true }; I.pace = 1.4; I.look = { ...at, lock: true };
          this.thought = 'Walking straight over it.';
          if (d < 1.2 || b.t - b.at > 8) { b.phase = 'leave'; b.at = b.t; gest('stomp'); }
        } else { I.look = undefined; this.thought = 'Losing interest in the light.'; this.objMem[o.id].hab = Math.max(this.objMem[o.id].hab, 0.85); if (b.t - b.at > 1.5) b.done = true; }
        break;
      }
      case 'trail': {
        const o = (world.things || []).find((t) => t.id === b.obj), w = this._windHere(world.wind || { x: 0, z: 1 });      // the wind where it stands
        if (!o) { b.done = true; break; }
        const sm = (this.objMem[o.id] || { smelt: 0 }).smelt, d = Math.hypot(o.x - sim.x, o.z - sim.z), seeIt = this.focus && this.focus.id === o.id ? this.focus.see || 0 : 0;
        // follow the scent upwind, casting from side to side across the plume to stay in it
        b.leg -= dt;
        if (b.leg <= 0) { b.zig = -b.zig; b.leg = lognormal(R, 4.5, 0.35); b.head = bearing(-w.x, -w.z) + b.zig * R.range(0.35, 0.75) * (sm > 0.15 ? 0.6 : 1.3); b.way = null; }
        // the way upwind as the ground allows (nav): the heading it wants, else the nearest to it that its body can take
        if (!b.way || b.t - b.wayT > 1.5) { b.way = this._wayToward(b.head ?? bearing(-w.x, -w.z), 14); b.wayT = b.t; if (b.way.round) { b.leg = Math.max(b.leg, 4); b.head = b.way.hd; } }
        b.blocked = b.way.open ? 0 : (b.blocked || 0) + dt;
        I.goal = { kind: 'move', id: b.gen * 10 + (b.zig > 0 ? 1 : 2), x: b.way.x, z: b.way.z }; I.pace = 1.6 + 0.6 * this.hunger;
        const ahead = { x: sim.x + Math.sin(sim.psi) * 6, z: sim.z + Math.cos(sim.psi) * 6 };
        I.probe = { x: ahead.x, y: this.T.height(ahead.x, ahead.z) + 0.3, z: ahead.z, k: 0.55, standoff: 0.5 }; I.noIdle = true;
        b.sniffT -= dt; if (b.sniffT < 0) { b.sniffT = lognormal(R, 7, 0.4); gest('sniffAir', { x: sim.x + Math.sin(bearing(-w.x, -w.z)) * 30, y: sim.groundY + 14, z: sim.z + Math.cos(bearing(-w.x, -w.z)) * 30 }); }
        b.lost = sm < 0.02 ? b.lost + dt : 0;
        this.thought = sm > 0.1 ? `Meat on the wind. Following it upwind, ${dirWord(bearing(-w.x, -w.z))}.` : 'It has lost the scent. Casting about for it.';
        if (b.lost > 12) { b.done = true; this.mem.fooled = Math.min(1, this.mem.fooled + 0.05); }
        // the scent leads in where it cannot go (between trunks, up rock): it stands at the edge a while, then gives it up
        if (b.blocked > 5 || ((d < 20 || seeIt > 0.25) && !this._canReach(o))) { b.done = true; this._noReach(o); break; }
        if (d < 20 || seeIt > 0.25) { b.done = true; this._start('feed', c, 'found it'); return this._run(0, c, world); }
        break;
      }
      case 'feed': {
        const o = (world.things || []).find((t) => t.id === b.obj);
        if (!o || o.amount <= 0) { b.done = true; this.thought = 'Nothing left.'; this.focus = null; break; }
        const at = { x: o.x, y: o.y, z: o.z }, d = Math.hypot(o.x - sim.x, o.z - sim.z), snout = this._tip(o.x, o.y, o.z), RS = this.sp.dims.reachStop;
        I.noIdle = true;
        // guarding: you close by, or coming at it fast (attend.js: a glance that interrupts the meal)
        const gl = this.att.glancing('tilt'), fast = K.seen && c.d < 30 && (c.approach || 0) > 0.4 && c.running;
        const guard = K.seen && (c.d < 14 || fast || (gl && gl.key === 'you' && gl.level === 'interrupt')) && !o.hand && this.tame < 0.6;
        if (guard && this.ap.verdict === 'threat' && this.t - (this.ap.firedT ?? -99) < 6 && b.phase !== 'go') { b.done = true; this.ap.outcome('driven-off'); this._start('avoid', c, 'driven off'); return this._run(0, c, world); }      // it will not stand over its meal with you there
        if (o.hand) {
          // held out in your hand: it has to come to you for it. Wary, it lunges and snatches; trusting, it takes it softly
          const soft = this.bond.trust > 0.25, RSh = RS - 0.3;
          I.look = { ...at, lock: true }; I.relax = soft ? 0.6 : 0; I.alert = soft ? 0.2 : 0.7;
          if (d > RSh + 1.4 && !b.took) { I.goal = { kind: 'approach', id: b.gen + 2, x: o.x, z: o.z, stop: RSh, hold: 30, quick: d > 20 }; I.pace = d > 20 ? 2.2 : soft ? 0.9 : 1.6; if (d < 14) I.probe = { ...at, k: 0.4, standoff: 1.2 }; this.thought = soft ? 'Coming for the meat in your hand. Slowly.' : 'Eyes on the meat in your hand.'; }
          else if (!b.took) {
            I.goal = { kind: 'face', x: o.x, z: o.z }; b.hn = (b.hn || 0) + dt;
            if (soft) { I.probe = { ...at, k: 1, standoff: lerp(0.9, -0.05, clamp(b.hn / 2.5, 0, 1)) }; I.mouth = snout < 1.0 ? 0.3 : 0; this.thought = 'Taking it from your hand, gently.'; if (snout < 0.55 || b.hn > 5) { b.took = b.t; this.events.push({ type: 'handfed', id: o.id, gentle: true }); this._fedBy(o, 0.11); gest('gulp'); } }
            else { I.probe = { ...at, k: 1, standoff: 1.0 }; if (snout < 2.4 || b.hn > 3) { b.took = b.t; gest('snap', at); this.events.push({ type: 'handfed', id: o.id, gentle: false }); this._fedBy(o, 0.05); } this.thought = 'Snatches the meat out of your hand!'; }
          } else if (b.t - b.took > 1.8) { b.done = true; this.focus = null; }
          break;
        }
        if (b.phase === 'go' && b.t > 1 && !this._canReach(o)) { b.done = true; this._noReach(o); break; }      // in among the trunks or up on rock
        if (b.phase === 'go') {
          I.goal = d > RS + 6 ? { kind: 'approach', id: b.gen, x: o.x, z: o.z, stop: RS + 3, quick: true } : { kind: 'reach', id: b.gen + 1, x: o.x, z: o.z, hold: 300 }; I.pace = d > 25 ? 2.6 : 1.4; I.look = { ...at, lock: true };
          this.thought = 'Food. Going to it.';
          if (d < RS + 1.2 && Math.abs(sim.v) < 0.8) { b.phase = 'eat'; b.next = 0.3; }
        } else if (guard && b.sub !== 'guard' && (!b.guardT || this.t - b.guardT > 8)) {
          b.sub = 'guard'; b.at = b.t; b.guardT = this.t; gest('growl');
        } else if (b.sub === 'guard' && !a) { b.sub = null;      // (nobody to stand over its food against any more: back to eating)
        } else if (b.sub === 'guard') {
          I.look = { ...eye, lock: true }; I.display = 0.7; I.agitation = 0.5; I.goal = { kind: 'face', x: a.x, z: a.z };
          this.thought = 'Standing over its food, rumbling at you. It is not sharing.';
          if (b.t - b.at > lognormal(R, 4, 0.3)) { b.sub = null; if (c.d < 9 && R() < 0.5) gest('snap', this._snapPoint(a)); }
        } else {
          // the meal: bite, tear, swallow; and every so often the head comes up to look round
          // divided attention: something else pulling at it (attend.js) makes the meal come in bursts, the head up more often
          // and the looks going to that thing; a glance pauses the chewing (no new mouthful while the head is up)
          const top = this.att.top(), pull = top ? top.sal : 0;
          if (!this.att.glancing('look')) b.next -= dt;
          b.scanT -= dt * (1 + 3 * pull);
          if (b.scanT < 0 && b.sub !== 'scan') { b.sub = 'scan'; b.at = b.t; b.scanDur = lognormal(R, 2.6, 0.4); b.scanDir = sim.psi + R.range(-1.6, 1.6); b.scanAt = top && top.pos && (pull > 0.15 || R() < 0.5) ? top.pos : null; }
          if (gl) { I.probe = { ...at, k: 0.15, standoff: 0.0 }; I.alert = 0.5; }
          if (b.sub === 'scan') {
            const lk = b.scanAt || (K.seen ? eye : bel); I.look = lk && (b.scanAt || R() < 0.5) ? { ...lk } : { x: sim.x + Math.sin(b.scanDir) * 30, y: sim.groundY + 3, z: sim.z + Math.cos(b.scanDir) * 30 };
            I.alert = 0.6; this.thought = 'Head up from the meat, chewing, looking round.';
            if (b.t - b.at > b.scanDur) { b.sub = null; b.scanT = lognormal(R, 9, 0.4); }
          } else {
            const busyMouth = sim.act && (sim.act.kind === 'tear' || sim.act.kind === 'gulp' || sim.act.kind === 'snap');
            I.goal = { kind: 'reach', id: b.gen + 1, x: o.x, z: o.z, hold: 300 }; I.probe = { ...at, k: gl ? 0.15 : busyMouth ? 0.25 : 1, standoff: 0.0 }; I.look = busyMouth ? undefined : { ...at, lock: true };
            if (b.next < 0) {
              const r = R();
              // a meal is a rhythm, not a loop: bites and tears, a swallow every few mouthfuls, the odd pause to chew
              b.mouth = b.mouth || 0;
              if (snout < 1.6 && b.mouth < 3 && r < 0.4) { b.sub = 'bite'; gest('snap', at); this.events.push({ type: 'bite', id: o.id, x: o.x, y: o.y, z: o.z, amount: 0.06 }); this.hunger = Math.max(0, this.hunger - 0.04); b.mouth++; b.next = lognormal(R, 1.4, 0.3); this._fedBy(o, 0.006); }
              else if (snout < 2.0 && b.mouth < 3) { b.sub = 'tear'; gest('tear', at); this.events.push({ type: 'tear', id: o.id, x: o.x, y: o.y, z: o.z, amount: 0.05 }); this.hunger = Math.max(0, this.hunger - 0.03); b.mouth++; b.next = lognormal(R, 1.7, 0.25); this._fedBy(o, 0.005); }
              else if (b.mouth > 0) { b.sub = 'gulp'; gest('gulp'); b.mouth = 0; b.next = lognormal(R, 1.6, 0.3); }
              else { b.sub = 'nose'; b.next = lognormal(R, 1.2, 0.4); }
            }
            this.thought = b.sub === 'tear' ? 'Bites down and wrenches back, tearing a piece off.' : b.sub === 'gulp' ? 'Head up, tossing it back to swallow.' : b.sub === 'nose' ? 'Nosing the meat into place.' : 'Feeding.';
          }
        }
        break;
      }
      case 'hunt': {
        const q = (world.prey || []).find((p) => p.id === b.id);
        if (!q) { b.done = true; break; }
        const d = Math.hypot(q.x - sim.x, q.z - sim.z), at = { x: q.x, y: q.y, z: q.z };
        I.look = { ...at, lock: true }; I.noIdle = true;
        if (b.phase === 'stalk') {
          // low and slow; freeze when they look up
          const watching = q.state === 'alert';
          I.goal = { kind: 'approach', id: b.gen, x: q.x, z: q.z, stop: 4, quick: true }; I.pace = 1.3; I.stalk = true; I.freeze = watching; I.breathHold = watching ? 0.9 : 0.3;
          this.thought = watching ? 'Frozen mid-stride. One of them is looking this way.' : 'Creeping up on the herd, head low.';
          if (q.state === 'flee' && d >= 30) { b.done = true; this.thought = 'They have seen it. It stops and watches them go.'; }
          if (d < 11 || (q.state === 'flee' && d < 22)) { b.phase = 'rush'; b.at = b.t; }
        } else {
          const ip = this._intercept(q, Math.abs(sim.v) + 2);
          I.goal = { kind: 'approach', id: b.gen + 1, x: ip.x, z: ip.z, stop: 2, quick: true }; I.pace = 9.6 - 3.5 * Math.max(0, c.fatigue - 0.7); I.agitation = 0.6; I.burst = b.t - b.at < 1.6;
          this.thought = 'Charging into the herd!';
          const hp = sim.head.pos, sd = Math.hypot(q.x - hp.x, q.z - hp.z);
          if (sd < 4.6 && !b.snapped) { b.snapped = true; b.snapT = b.t; gest('snap', { x: q.x + q.vx * 0.3, y: q.y, z: q.z + q.vz * 0.3 }); }
          if (b.snapped && b.t - b.snapT > 0.5 && b.t - b.snapT < 0.68) {
            const tip = { x: hp.x + sim.head.f.x * 1.5, y: hp.y + sim.head.f.y * 1.5, z: hp.z + sim.head.f.z * 1.5 };
            if (Math.hypot(tip.x - q.x, tip.y - q.y, tip.z - q.z) < 1.7) { this.events.push({ type: 'kill', id: q.id, x: q.x, z: q.z }); b.done = true; this.hunger = Math.max(0, this.hunger - 0.15); this.thought = 'Caught one.'; break; }
          }
          if (b.snapped && b.t - b.snapT > 1.4) b.snapped = false;
          if (d < b.best - 0.5) { b.best = d; b.losing = 0; } else if (d > b.best + 4) b.losing += dt;
          if (b.losing > 2 + 2 * this.temper.bold || c.fatigue > 0.95) { b.done = true; this.thought = 'Too fast for it. It gives up, blowing.'; gest('huff'); }
        }
        break;
      }
      case 'answer': {
        I.look = { x: b.at.x, y: sim.groundY + 40, z: b.at.z, lock: true }; I.noIdle = true; I.alert = 0.8;
        this.thought = 'Thunder. It lifts its head toward the sky.';
        if (!b.roared && b.t > 1.6) { b.roared = true; if (R() < 0.6) { sim.roar(); this.lastRoar = this.t; this.thought = 'It roars back at the storm.'; } else gest('huff'); }
        break;
      }
      case 'butt': case 'swipe': case 'pin': case 'seize': case 'toy': this._runAttack(dt, b, c, I, eye, world); break;
      case 'pounce': {
        // the chase reflex: lock on (head round, body coiled, dead still), then a flat-out rush; a grab at the end, whether it
        // is hungry (it means to eat) or not (it has it, and then does not quite know what to do with it)
        if (!a) { b.done = true; break; }
        I.look = { ...eye, lock: true }; I.noIdle = true;
        if (K.via !== 'sight') b.blind += dt; else b.blind = 0;
        if (b.phase === 'lock') {
          if (!b.toldStill) { b.toldStill = true; this.peril.lastStillT = this.t; this.peril._tell('still', { d: +c.d.toFixed(1), chase: true }); }      // the lock-on is the stillness tell
          I.goal = { kind: 'face', x: a.x, z: a.z }; I.stalk = true; I.breathHold = 1; I.alert = 1; I.quickTurn = true;
          this.thought = 'Head snapped round. Coiled, dead still, locked on the running thing.';
          // you stopping dead is plain to see: the speed it was watching falls away (its perceived speed lags, so judge the drop)
          b.peak = Math.max(b.peak, a.speed); b.still = a.speed < Math.max(1.5, 0.62 * b.peak) ? b.still + dt : 0;
          if (((b.still > 0.1 || b.blind > 0.35) && !b.close) || !K.seen || c.walled) { b.phase = 'defused'; b.at = b.t; }      // (a bolt from close: it is already going)
          else if (b.t > b.lockDur) { b.phase = 'rush'; b.at = b.t; }
        } else if (b.phase === 'rush') {
          const ip = this._intercept(a, Math.abs(sim.v) + 2);
          I.goal = { kind: 'approach', id: b.gen + 1, x: ip.x, z: ip.z, stop: 2, quick: true }; I.pace = 10.5 - 3 * Math.max(0, c.fatigue - 0.85); I.burst = b.t - b.at < 2; I.agitation = 0.4; I.quickTurn = true;
          this.thought = 'Flat out after you. It did not decide this.';
          // the chase reflex ends in the killing strike once you are in its reach (the lock-on was the tell; stopping dead defuses it)
          if (this._inStrike(b, c) && K.seen && (a.state || 'free') === 'free' && b.toldStill) { this.peril._strike(a); if (this.peril.stage === 'strike') { b.done = true; break; } }
          // (no grab short of that: a chase that catches you is a kill, never a catch-and-release)
          const lose = this._losing(dt, b, c), blocked = sim.nav && sim.nav.reachable && !sim.nav.reachable(sim.x, sim.z, a.x, a.z);
          if (b.blind > 1.5 || blocked || c.walled || lose || c.fatigue > 0.99 || b.t > b.dur) { b.phase = 'lost'; b.at = b.t; b.why = blocked || c.enclosed ? 'blocked' : b.blind > 1.5 ? 'gone' : c.fatigue > 0.99 ? 'spent' : b.t > b.dur ? 'long' : 'outran'; }
        } else {
          // defused before it went, or lost after: it stands there, breathing, staring where you are
          I.goal = { kind: 'face', x: a.x, z: a.z }; I.alert = 0.8; I.freeze = b.t - b.at < 1;
          this.thought = b.phase === 'defused' ? 'It stopped. The pull goes out of it; it stares.' : 'Lost it. It pulls up, blowing.';
          if (b.t - b.at > 1.8) b.done = true;
        }
        break;
      }
      case 'guard': {
        // a threat: square to you, head up and eyes on you, at its working distance; it takes back ground, never gives it,
        // warns short and hard, and comes for you the moment you are inside its reach or hurt it again
        const W = b.W, hurt = this.t - this.hitAt < 2.5 && this.lastHit && this.lastHit.by === 'you';
        I.look = { ...eye, lock: true }; I.alert = 0.9; I.quickTurn = true; I.noIdle = true; I.display = 0.35; I.breathHold = 0.3;
        if (((c.d < 11 || (c.d < W - 2 && c.approach > 0.25)) || hurt) && c.d < 34 && !c.walled && !a.dead) {
          b.done = true; this.motiveNext = 'anger'; this.lethalNext = true; this._start(this._attackMove(c, 'anger'), c, hurt ? 'hurt again' : 'inside its reach'); return this._run(0, c, world);
        }
        if (c.d > W + 7) { b.mode = 'reclaim'; I.goal = { kind: 'approach', id: b.gen, x: a.x, z: a.z, stop: W, quick: true }; I.pace = 2.3; this.thought = 'Taking its ground back, eyes on you.'; }
        else { b.mode = 'hold'; I.goal = { kind: 'face', x: a.x, z: a.z }; I.freeze = c.d > 12; this.thought = 'Square to you, head up. Not moving.'; }
        if (c.d < W + 6 && b.t - b.growlT > 7 && (c.approach > 0.1 || b.t - b.growlT > 12)) { b.growlT = b.t; gest('growl'); this.warnedT = this.t; }
        if (!c.seen) b.done = true;
        break;
      }
      case 'appraise': case 'test': case 'shadow': case 'lurk': case 'prowl': case 'avoid': { const r = this._runPred(dt, b, c, I, eye, world); if (r) return r; break; }
      case 'probe': this._runProbe(dt, b, c, I, eye); if (I.probe && !b.done) this._viaGap(b, I); break;
      case 'greet': case 'follow': case 'rest': case 'tend': case 'pet': case 'pull': case 'relief': this._runFriendly(dt, b, c, I, eye); break;
      case 'backoff': {
        I.goal = { kind: 'drive', throttle: -0.3, steer: 0 }; I.pace = 3; I.display = 0.7; I.look = { ...eye, lock: true }; I.noIdle = true;
        if (b.t < 0.2) gest('growl');
        this.thought = 'Giving ground, but not turning its back.';
        break;
      }
    }
    if (b.t > b.dur) b.done = true;
    return I;
  }

  /** The other direction from laying hold: coming over to you, following you, lying down, nursing a sore foot, being touched. */
  _runFriendly(dt, b, c, I, eye) {
    const R = this.R, sim = this.sim, K = this.know, a = K.target, M = this.mood, tame = this.tame, gest = (k, pt, o) => sim.gesture(k, pt, o);
    const inj = sim.injury, sore = inj ? sim.feet[inj.foot] : null, footAt = sore ? { x: sore.pos.x, y: sore.pos.y + 0.35, z: sore.pos.z } : null;
    switch (b.name) {
      case 'greet': {
        // ambling over and breathing you in, head low, nothing tense about it
        const RS = this.sp.dims.reachStop, stop = Math.max(RS + 0.3, this.sp.spacing.nudge - 1.5 * tame);
        I.goal = { kind: 'approach', id: b.gen, x: a.x, z: a.z, stop, hold: 30 }; I.pace = 1.1; I.noIdle = true;
        I.look = { ...eye, lock: true }; I.relax = 0.5 + 0.5 * tame; I.alert = 0.15 * (1 - tame);
        const close = c.d < stop + 1.4;
        if (close) {
          if (b.at === undefined) b.at = b.t;
          I.probe = { x: a.x, y: a.y - 0.45, z: a.z, k: 0.9, standoff: 0.3 + 0.6 * (1 - tame) }; I.nose = b.t - b.at < 4;
          b.next -= dt; if (b.next < 0) { b.next = lognormal(R, 2, 0.4); gest(R() < 0.7 ? 'huff' : 'tilt'); }
          if (tame > 0.6 && b.t - b.at > 3) I.lid = 0.3;
        }
        if (c.running || (a.state || 'free') !== 'free') { b.done = true; b.spooked = true; }
        if (b.at !== undefined && b.t - b.at > b.len) { b.done = true; if (!b.spooked && (!this.bond.lastBad || this.t - this.bond.lastBad.t > b.t)) this._good('nosed', 0.035); }
        if (b.t > 25 && b.at === undefined) b.done = true;
        this.thought = close ? 'Breathing you in, slow and easy.' : 'Ambling over to you, unhurried.';
        break;
      }
      case 'follow': {
        const gap = lerp(13, 8, tame), moving = a.speed > 0.6;
        b.stillT = moving ? 0 : b.stillT + dt;
        I.goal = c.d > gap ? { kind: 'approach', id: b.gen, x: a.x, z: a.z, stop: gap - 1, quick: true } : { kind: 'face', x: a.x, z: a.z };
        I.pace = clamp(a.speed * 1.15 + (c.d > gap + 8 ? 1.4 : 0), 1.0, 4.2); I.relax = 0.6 * tame;
        b.lookT -= dt; if (b.lookT < 0) { b.lookT = lognormal(R, 5, 0.4); b.glance = b.t; b.gdir = sim.psi + R.range(-1.2, 1.2); }
        I.look = b.t - (b.glance ?? -9) < 1.6 ? { x: sim.x + Math.sin(b.gdir) * 25, y: sim.groundY + 3, z: sim.z + Math.cos(b.gdir) * 25 } : { ...eye, lock: c.d < 25 };
        if (b.stillT > 7) b.done = true;
        this.thought = moving ? 'Following you, a little way behind.' : 'You stopped. It stops too.';
        break;
      }
      case 'rest': {
        // down on its belly; it watches you if it does not trust you, dozes if it does; a sore foot gets nursed
        I.lie = true; I.noIdle = !sim.lying;
        const quiet = !K.seen || tame > 0.45 || (this.pain > 0.3 && c.d > 14), lying = sim.lie.phase === 'lying';
        I.relax = quiet ? 0.7 + 0.3 * tame : 0.2;
        if (K.seen && a && !quiet && c.d < this._personal() + 5) { b.done = true; b.disturbed = true; this.thought = 'Too close. It heaves itself up.'; break; }
        if (lying) {
          b.next -= dt; b.dozeT -= dt; b.tendT -= dt;
          if (b.next < 0) { b.next = lognormal(R, 6, 0.5); b.gaze = R() < 0.3 ? null : sim.psi + R.range(-1.4, 1.4); }
          if (K.seen && a && (!quiet || R() < 0.5 || c.d < 12)) { I.look = { ...eye, lock: !quiet }; I.alert = quiet ? 0 : 0.4; }
          else if (b.gaze != null) I.look = { x: sim.x + Math.sin(b.gaze) * 30, y: sim.groundY + 1.5, z: sim.z + Math.cos(b.gaze) * 30 };
          if (b.tendT < 0 && footAt) { b.tending = b.t; b.tendT = lognormal(R, 12, 0.4); }
          if (b.tending !== undefined && b.t - b.tending < 4.5 && footAt) { I.look = { ...footAt, lock: true }; I.probe = { ...footAt, k: 0.7, standoff: 0.3 }; I.nose = true; }
          const dozing = b.dozeT < 0 && quiet && (!this.startle || this.startle.handled) && !(b.tending !== undefined && b.t - b.tending < 4.5);
          if (dozing) { I.lid = 0.75; I.look = undefined; if (!b.dozed) { b.dozed = true; } }
          b.dozing = dozing;
        }
        this.thought = !lying ? (sim.lie.phase === 'up' ? 'Getting up. It is hard work.' : 'Lowering itself onto its belly.') : b.dozing ? 'Dozing, eyes half shut.' : b.tending !== undefined && b.t - b.tending < 4.5 ? 'Nosing at its sore foot.' : K.seen && !quiet ? 'Lying down, but watching you.' : 'Lying down, resting.';
        break;
      }
      case 'tend': {
        // standing on the good leg, the sore foot held up off the ground; or, lying, nosing at it
        if (sim.lying) { I.lie = true; if (footAt) { I.look = { ...footAt, lock: true }; I.probe = { ...footAt, k: 0.7, standoff: 0.3 }; } I.nose = true; I.relax = 0.6; }
        else { I.holdFoot = true; I.freeze = true; if (footAt) I.look = { ...footAt, lock: true }; I.nose = b.t > 1.5; I.alert = 0.2; }
        b.next -= dt; if (b.next < 0) { b.next = lognormal(R, 2.5, 0.4); if (R() < 0.4) gest('huff'); }
        this.thought = sim.lying ? 'Nosing at its sore foot.' : 'Holding its sore foot up off the ground, looking at it.';
        break;
      }
      case 'pet': {
        // a hand on its snout: it leans into it, eyes half closing, rumbling; or, too soon, it pulls back and growls
        const T = this.touch && this.touch.part === 'snout' ? this.touch : null; if (T) { b.lastTouch = b.t; b.hand = { ...T.hand }; }
        I.noIdle = true; I.lie = sim.lying && sim.lie.phase !== 'up'; I.look = { ...eye, lock: true };
        if (b.permit) {
          I.goal = sim.lying ? null : { kind: 'face', x: a.x, z: a.z }; I.probe = { ...b.hand, k: 1, standoff: T ? -0.25 : 0.4 }; I.relax = 1; I.alert = 0; I.breathHold = 0;
          I.lid = b.t > 1.2 && T ? 0.6 : 0.15; this.petting = !!T;
          b.next -= dt; if (T && b.next < 0) { b.next = lognormal(R, 2.8, 0.3); gest('rumble'); }
          this.thought = T ? 'Leaning into your hand, eyes half shut, rumbling.' : 'You took your hand away. It waits.';
          if (b.t - b.lastTouch > 2.2) b.done = true;
        } else {
          // too soon: the head comes back and away from the hand, a growl; leave your hand there and it snaps
          I.goal = sim.lying ? null : { kind: 'drive', throttle: b.t < 0.9 ? -0.3 : 0, steer: 0 }; I.display = 0.5; I.agitation = 0.4; I.alert = 0.8;
          I.probe = { ...b.hand, k: 0.6, standoff: 2.6 };
          if (!b.growled) { b.growled = true; gest('growl'); this.warnedT = this.t; this.grudgeAtWarn = this.grudge; M.irritation = Math.min(1, M.irritation + 0.1); }
          if (T && b.t > 1.4 && !b.snapped) { b.snapped = true; gest('snap', this._snapPoint(a)); this.lastSnap = this.t; M.irritation = Math.min(1, M.irritation + 0.25); this._wrong('touch', 0.04); this.lastWrong = { kind: 'touch', t: this.t }; }
          if (!T && !b.snapped && !b.credited && b.t - b.lastTouch > 0.5) { b.credited = true; this._good('listened', 0.015); this.bond.listened++; }      // you took it away when told: noted
          this.thought = b.snapped ? 'It snapped at your hand.' : 'It pulls its head back from your hand, growling. Too soon.';
          if (b.t - b.lastTouch > 2.5 && b.t > 2.5) b.done = true;
        }
        break;
      }
      case 'pull': {
        // you have hold of the sore foot. It bears it as long as it trusts you and the pain allows; it tells you when to stop
        const T = this.touch && this.touch.part === 'foot' ? this.touch : null; if (T) b.lastTouch = b.t;
        I.noIdle = true; I.lie = sim.lying && sim.lie.phase !== 'up'; I.freeze = true; I.goal = null;
        I.look = (b.t % 3.2) < 2.2 || !footAt ? { ...eye, lock: true } : { ...footAt, lock: true };
        const tol = this._tolerance();
        if (b.verdict === undefined) {
          b.verdict = tol > 0.3 ? 'allow' : 'refuse';
          if (b.verdict === 'refuse') { if (inj) sim.jerkFoot(inj.foot, 1); gest('growl'); this.warnedT = this.t; this.bond.refusals = (this.bond.refusals || 0) + 1; M.irritation = Math.min(1, M.irritation + 0.15); b.refT = b.t; }
          if (tol < -0.05) { b.done = true; this.motiveNext = 'anger'; this.grudge = Math.min(1, this.grudge + 0.15); this._wrong('pull', 0.05); this._start('snap', c, 'foot touched'); return; }
        }
        if (b.verdict === 'allow') {
          const warned = b.warnT !== undefined;
          this.allowPull = !!T && !warned;
          I.breathHold = 0.5; I.alert = 0.55; I.relax = 0.3 * tame;
          if (T && !warned) { M.irritation = Math.min(1, M.irritation + dt * 0.08 * (1 - 0.5 * tame)); this.painSpike = Math.min(1, this.painSpike + dt * 0.12); }
          b.next -= dt; if (T && !warned && b.next < 0) { b.next = lognormal(R, 1.2, 0.3); gest('huff'); if (R() < 0.35 && inj) gest('wince', null, { force: 0.5 }); }
          if (T && !warned && M.irritation > 0.45 + 0.25 * tame) { b.warnT = b.t; gest('growl'); this.warnedT = this.t; }      // that is enough for now
          if (warned) {
            if (!T) { if (!b.credited) { b.credited = true; this._good('listened', 0.02); this.bond.listened++; } M.irritation *= 1 - dt * 0.5; if (b.t - b.warnT > 2.5 && M.irritation < 0.4 + 0.2 * tame) { b.warnT = undefined; b.credited = false; } }     // you let go when told: it settles, and you may try again
            else if (b.t - b.warnT > 1.5) {      // you did not listen
              if (inj) sim.jerkFoot(inj.foot, 1.2); this._wrong('pull', 0.06); M.irritation = Math.min(1, M.irritation + 0.2); b.verdict = 'refuse'; b.refT = b.t; b.warnT = undefined;
              gest('snap', this._snapPoint(a)); this.lastSnap = this.t; this.lastWrong = { kind: 'pull', t: this.t };
              if (this._tolerance() < 0.05) { b.done = true; this.motiveNext = 'anger'; this.grudge = Math.min(1, this.grudge + 0.2); }
            }
          }
          this.thought = !T ? 'You let go of its foot. It watches you.' : warned ? 'A growl: that is enough for now.' : 'It lets you work at its foot, watching you, breathing hard.';
        } else {
          this.allowPull = false; I.display = 0.4; I.alert = 0.8;
          if (T && b.t - b.refT > 1.3 && !b.snapped) { b.snapped = true; gest('snap', this._snapPoint(a)); this.lastSnap = this.t; this._wrong('pull', 0.05); }
          if (!T && b.t - b.lastTouch > 0.6 && !b.credited) { b.credited = true; if (!b.snapped) { this._good('listened', 0.015); this.bond.listened++; } }
          this.thought = b.snapped ? 'It snapped at you over its foot.' : 'It snatches its foot away from you, growling.';
        }
        if (b.t - b.lastTouch > 3) { b.done = true; this.allowPull = false; }
        break;
      }
      case 'relief': {
        // the thorn is out: up on its feet, a long look at you, the foot tried on the ground, and then it comes to you
        I.lie = false; I.noIdle = true; I.look = { ...eye, lock: true }; I.relax = 0.4;
        if (b.phase === 'jolt') { if (b.t > 0.5) { b.phase = 'up'; } }
        else if (b.phase === 'up') { if (!sim.lying) { b.phase = 'look'; b.at = b.t; } }
        else if (b.phase === 'look') { I.goal = { kind: 'face', x: a.x, z: a.z }; I.breathHold = 0.6; if (b.t - b.at > 4) { b.phase = 'try'; b.at = b.t; gest('stomp'); } }
        else if (b.phase === 'try') { I.goal = null; if (footAt) I.look = { ...footAt, lock: true }; if (b.t - b.at > 2.5) { b.done = true; this.lastGreet = -999; this._start('greet', c, 'thorn out'); return; } }
        this.thought = b.phase === 'look' ? 'Standing, staring at you. The pain is gone.' : b.phase === 'try' ? 'Putting its weight on the foot. It holds.' : 'The thorn is out! It lurches up.';
        break;
      }
    }
  }

  /** Laying hold of you. Every phase only asks the body for something (close in, strike at a point, plant a foot here,
   *  keep the jaws shut, shake, toss); whether it connects is up to the bodies, and what it does next is decided on what it
   *  can see and feel of you: knocked down or not, struggling or limp, got up, got away. */
  /** The predator's question, asked and answered with the body: quiet, low, patient, the eyes never leaving you.
   *  None of these make a sound: no huff, no growl, no tilt of the head. Also keeping away from a thing it fears. */
  // ---------------------------------------------------------------------- the core (out/platform/CORE.md)
  /** What it has going with the one it is attending to (per individual): how far up its questions it has gone (`rung`), what
   *  that one answered to each (`answers`: what it now expects), the probes it has made, whether its jaws are reaching. */
  _core() {
    const w = this.who; if (!this.core || this.core.who !== w) this.core = { who: w, rung: 0, probes: [], answers: {}, reach: false, unwT: 0, killHow: null, surpriseT: -99, expectT: -99, unwGo: false };
    return this.core;
  }
  /** Coming to it and asking with its body. Slow and direct, faster while it is not watched (a glance away less than a turned
   *  look); at arm's length the head comes down to it: sniffing, cocked, breathing on it. Then one question at a time, each
   *  answered before the next, as far up as the pressure (peril.js r, which curiosity holds down and hunger drives up) goes:
   *  sniff, a nudge of the snout, a shove that puts it down, a foot set down beside it, and last the slow open-mouthed reach
   *  (peril.js `beginReach`). Each answer changes what it believes; an answer other than the one it got last time at that step
   *  stops it to think again. Nothing here knows what the thing is: it reads the target's perceived state. */
  _runProbe(dt, b, c, I, eye) {
    const C = this.cfg.core, sim = this.sim, a = this.know.target, R = this.R, K = this._core(), ap = this.ap;
    K.askT = this.t;
    if (!a || !c.seen || c.walled || a.dead) { b.done = true; return; }
    const st = a.state || 'free', lying = LYING.has(st), gy = this.T.height(a.x, a.z), ss = (e0, e1, x) => { const u = clamp((x - e0) / (e1 - e0), 0, 1); return u * u * (3 - 2 * u); };
    if (c.running && st === 'free') { b.done = true; return; }      // running: the prey reflex is the answer (pounce, the bolt strike)
    // watched or not: a glance away, a turned look, a back turned
    K.unwT = c.watched ? 0 : K.unwT + dt;
    const back = !!(ap.cues && ap.cues.back), turned = !c.watched && (K.unwT > C.glanceT || back);
    // (watched, it comes on slowly, but only as slowly as the pressure lets it: being watched does not stop hunger)
    const pW = lerp(C.paceW, Math.max(C.paceW, C.paceFar ?? C.paceW), ss(C.farD ? C.farD[0] : 99, C.farD ? C.farD[1] : 100, c.d));      // (watched from far, an ordinary walk)
    const pace = (c.watched ? pW + (C.paceU - pW) * 0.8 * clamp(this.peril.r, 0, 1) : turned ? Math.max(C.paceU, pW) : Math.max(C.paceG, pW)) * (1 + (C.hungryPace - 1) * ss(0.4, 0.95, this.hunger));
    const head = { x: a.x, y: lying ? gy + 0.4 : a.y - 0.25, z: a.z }, torso = { x: a.x, y: lying ? gy + 0.3 : a.y - 0.65, z: a.z };
    I.look = { ...eye, lock: true }; I.noIdle = true; I.quickTurn = true;
    K.unwGo = turned && c.d > C.inspectD + 1.5 && b.phase === 'come';
    const log = (kind) => { K.probes.push({ t: +this.t.toFixed(1), kind, r: +this.peril.r.toFixed(2) }); K.lastProbeT = this.t; if (K.probes.length > 60) K.probes.shift(); };
    const pauseLen = () => R.range(...C.pause) * (c.watched ? 1.4 : turned ? 0.6 : 0.9);
    const read = () => { b.phase = 'read'; b.at = b.t; b.len = pauseLen(); b.d0 = c.d; b.ans = { came: false, backed: false, light: false, fire: false, loud: false, down: false }; b.f0 = ap.firedT ?? -99; b.s0 = ap.shoutT ?? -99; };
    switch (b.phase) {
      case 'come': {
        const off = b.side ? { x: Math.cos(sim.psi) * 4 * b.side, z: -Math.sin(sim.psi) * 4 * b.side } : { x: 0, z: 0 };
        I.goal = { kind: 'approach', id: b.gen + (b.side ? 7 : 0), x: a.x + off.x, z: a.z + off.z, stop: C.inspectD, hold: 30 }; I.pace = pace; I.low = c.d < 20 ? 0.55 : 0.25;
        if (c.d < C.inspectD + 1.0) { b.phase = 'sniff'; b.at = b.t; b.len = pauseLen() + 1.5; b.side = 0; log('sniff'); }
        this.thought = c.watched ? 'Coming on slowly while you watch it.' : 'You looked away: it comes on.';
        break;
      }
      case 'sniff': {
        I.goal = { kind: 'approach', id: b.gen, x: a.x, z: a.z, stop: C.inspectD - 0.4, hold: 30 }; I.pace = 0.8;
        I.probe = { ...head, k: 1, standoff: 0.7 }; I.nose = true; I.low = 0.8; I.breathHold = 0;
        // (the cocked head and the huffs are curiosity's: once hunger has it, it sniffs in silence)
        b.next -= dt; if (b.next < 0) { b.next = lognormal(R, 2.0, 0.4); if (this.stance !== 'predatory') sim.gesture(R() < 0.55 ? 'tilt' : 'huff'); }
        if (c.d > C.inspectD + 4) { b.phase = 'come'; break; }
        if (b.t - b.at > b.len) { this._ask(b, c, K); }
        this.thought = 'Its head down at you, sniffing, cocked to one side.';
        break;
      }
      case 'nudge': {
        I.goal = { kind: 'approach', id: b.gen, x: a.x, z: a.z, stop: this.sp.spacing.nudge, hold: 30 }; I.pace = 0.9;
        I.probe = { ...torso, k: 1, standoff: -0.15 }; I.low = 0.6;
        if (c.dHead < 2.6 || b.t - b.at > 5) { this.events.push({ type: 'nudge', x: a.x, z: a.z, dx: Math.sin(sim.head.yaw), dz: Math.cos(sim.head.yaw) }); sim.gesture('huff'); log('nudge'); read(); }
        this.thought = 'Pushing its snout into you.';
        break;
      }
      case 'shove': {
        I.goal = { kind: 'approach', id: b.gen, x: a.x, z: a.z, stop: lying ? 4.4 : 4.9, quick: true }; I.pace = 1.2; I.probe = { ...torso, k: 0.5, standoff: 2.0 };
        const facing = Math.abs(wrap(bearing(a.x - sim.x, a.z - sim.z) - sim.psi)) < 0.4;
        if (!b.fired && ((c.d < (lying ? 4.9 : 6.2) && facing) || b.t - b.at > 6)) { b.fired = true; b.firedAt = b.t; b.motive = 'play'; this.motive = 'play'; sim.gesture('butt', torso, { force: C.shoveF, over: true }); log('shove'); }
        if (b.fired && b.t - b.firedAt > 1.5) { b.fired = false; read(); }
        this.thought = 'Shoving you with its head, to see what you do.';
        break;
      }
      case 'foot': {
        // a foot raised and set down beside it, on its own side
        const ux = (sim.x - a.x) / (c.d || 1), uz = (sim.z - a.z) / (c.d || 1), sd = b.fs || (b.fs = R() < 0.5 ? -1 : 1);
        const px = a.x + ux * 1.1 - uz * sd * 0.9, pz = a.z + uz * 1.1 + ux * sd * 0.9;
        I.goal = { kind: 'approach', id: b.gen, x: px, z: pz, stop: 1.8, hold: 30 }; I.pace = 0.8; I.plant = { x: px, z: pz }; I.probe = { ...head, k: 0.8, standoff: 1.2 }; I.low = 0.5;
        if (!b.logged) { b.logged = true; log('foot'); }
        if (b.t - b.at > 4) read();
        this.thought = 'Setting a foot down right beside you.';
        break;
      }
      case 'read': {
        // holding still with its head at the thing's level, reading the answer
        I.goal = c.d > C.inspectD + 3 ? { kind: 'approach', id: b.gen, x: a.x, z: a.z, stop: C.inspectD, hold: 30 } : null; I.pace = pace;
        I.probe = { ...head, k: 0.7, standoff: 1.3 }; I.breathHold = 0.6; I.low = 0.6; I.alert = 0.6;
        const A = b.ans; if (c.approach > 0.35 && !lying) A.came = true; if (st !== 'free') A.down = true; if (a.torch && this.glare > 0.3) A.light = true; if ((ap.firedT ?? -99) > b.f0) A.fire = true; if ((ap.shoutT ?? -99) > b.s0) A.loud = true;
        if (b.t - b.at > b.len) this._answer(b, c, K);
        this.thought = 'Holding still, watching what you do now.';
        break;
      }
      case 'stop': {
        // the answer was not the one it expected: it stops and thinks again
        I.goal = null; I.freeze = true; I.probe = { ...head, k: 0.5, standoff: 1.8 }; I.alert = 0.8;
        if (!b.tilted) { b.tilted = true; sim.gesture('tilt'); }
        if (b.t - b.at > 2.2) { b.tilted = false; b.phase = c.d > C.inspectD + 1.5 ? 'come' : 'sniff'; b.at = b.t; b.len = pauseLen(); }
        this.thought = 'Not what it expected. It stops to think.';
        break;
      }
      case 'wary': {
        // it came at it, or hurt it: back off a few steps, then come in another way
        I.goal = { kind: 'drive', throttle: -0.45, steer: 0 }; I.pace = 1.2; I.alert = 1; I.probe = { ...head, k: 0.3, standoff: 2.5 };
        if (b.t - b.at > 2.5) { b.phase = 'come'; b.side = R() < 0.5 ? -1 : 1; }
        this.thought = 'Stepping back from you, watchful.';
        break;
      }
    }
    if (b.t > 85) b.done = true;
  }
  /** The next question: as far up the steps as the pressure goes (`core.rungs` against peril.r), one step at a time; fed, no
   *  further than the shove; lying there, no shove or foot. The last step is the reach (peril.js). */
  _ask(b, c, K) {
    const C = this.cfg.core, r = this.peril.r, a = this.know.target, lying = LYING.has(a.state || 'free');
    const want = C.rungs.filter((x) => r >= x).length, cap = this.hunger < C.fed ? 2 : 4;
    let next = Math.min(want, K.rung + 1, cap); if (next < K.rung) next = Math.max(want, K.rung - 1);
    if (lying && (next === 2 || next === 3)) next = 1;
    K.rung = next; b.at = b.t; b.fs = 0; b.logged = false;
    if (next === 4) { if (this.peril.reachReady() && this.peril.beginReach(a, c)) { b.done = true; return; } next = 3; K.rung = 3; }
    b.phase = ['sniff', 'nudge', 'shove', 'foot'][next]; b.len = R_(this.R, C.pause);
    if (next === 0) this.core.probes.push({ t: +this.t.toFixed(1), kind: 'sniff', r: +r.toFixed(2) });
  }
  /** What the answer was, what it now believes and what it does about it. An answer other than the one it got at this step
   *  before stops it (and is itself new: curiosity); the same one is what it expected. */
  _answer(b, c, K) {
    const ap = this.ap, A = b.ans, R = this.R;
    // (what it has had enough of is no answer: a light, a fire or a noise it is used to reads as doing nothing)
    const used = (k) => (ap.hab[k] || 0) > 0.6, A2 = { fire: A.fire && !used('fire'), light: A.light && !used('light'), loud: A.loud && !used('loud') };
    const ans = A2.fire ? 'fire' : A2.light ? 'light' : A2.loud ? 'loud' : A.came ? 'came' : A.down ? 'fell' : c.d > b.d0 + 1.0 ? 'backed' : 'still';
    const prev = K.answers[K.rung];
    K.answers[K.rung] = ans; K.lastAns = { ans, t: this.t, rung: K.rung };
    ap.outcome('probe-' + ans);
    if (prev && prev !== ans) { K.surpriseT = this.t; ap.act('surprise'); b.phase = 'stop'; b.at = b.t; return; }
    if (prev === ans) K.expectT = this.t;
    if (ans === 'came') { ap.cost = clamp(ap.cost + 0.06, 0, 1); K.rung = Math.max(0, K.rung - 1); b.phase = 'wary'; b.at = b.t; return; }
    if (ans === 'backed') { b.phase = 'come'; return; }
    this._ask(b, c, K); void R;
  }
  /** Something it remembers this one doing to it before (an answer at the step it is on, that worked: light, fire, a loud noise,
   *  getting behind something, backing off) is what it is ready for: true when it is. */
  _expects(kind) { const K = this._core(); return Object.values(K.answers).includes(kind) || (this.ap.balks && (this.ap.balks[kind] || 0) >= 0.5); }

  _runPred(dt, b, c, I, eye, world) {
    const R = this.R, sim = this.sim, K = this.know, a = K.target, ap = this.ap;
    I.noIdle = true;
    switch (b.name) {
      case 'appraise': {
        I.look = { ...eye, lock: true }; I.stalk = true; I.breathHold = 0.75; I.alert = 0.35;
        if (b.circle && b.t > 2.5) {
          b.ang += b.dir * dt * (1.25 / b.r);
          const tx = a.x + Math.sin(b.ang) * b.r, tz = a.z + Math.cos(b.ang) * b.r;
          I.goal = { kind: 'move', id: b.gen, x: tx + Math.sin(b.ang + b.dir * 1.57) * 4, z: tz + Math.cos(b.ang + b.dir * 1.57) * 4 }; I.pace = 1.25;
          this.thought = 'Circling slowly, head low, sizing you up.';
        } else {
          if (Math.abs(wrap(bearing(a.x - sim.x, a.z - sim.z) - sim.psi)) > 0.35) I.goal = { kind: 'face', x: a.x, z: a.z }; else I.freeze = true;
          this.thought = 'Utterly still, staring at you. Weighing you up.';
        }
        if (c.running && ap.cues.runAway && ap.H > 0.05) b.done = true;          // running settles it
        break;
      }
      case 'test': {
        I.look = { ...eye, lock: true }; I.stalk = true;
        if (b.phase === 'rush') {
          // a sudden silent lunge that stops short: what do you do?
          I.goal = { kind: 'approach', id: b.gen, x: a.x, z: a.z, stop: b.stop, quick: true }; I.pace = 6.5; I.burst = b.t < 1; I.stalk = false;
          this.thought = 'A sudden lunge at you, silent. Will you run?';
          if (c.d < b.stop + 1.5 || b.t > 5) { b.phase = 'watch'; b.at = b.t; b.dW = c.d; }
        } else {
          I.goal = { kind: 'face', x: a.x, z: a.z }; I.freeze = true; I.breathHold = 1; I.alert = 0.5;
          if (c.running && ap.cues.runAway) b.ran += dt;
          this.thought = 'Stopped dead. Watching what you do.';
          if (b.t - b.at > 2.6 && !b.result) {
            const res = b.ran > 0.4 ? 'bolted' : c.approach > 0.3 || c.d < b.dW - 1.5 ? 'came' : (a.speed < 0.4 ? 'froze' : 'stood');
            ap.onTest(res); b.done = true; b.result = res;
          }
        }
        break;
      }
      case 'shadow': {
        // following you where you cannot see it: behind you, and on the downwind side
        const fl = Math.hypot(a.fx ?? 0, a.fz ?? 0) || 1, w = this.T.windAt ? this.T.windAt(a.x, a.z, this.wind || { x: 0, z: 0 }) : this.wind || { x: 0, z: 0 }, wl = Math.hypot(w.x, w.z) || 1;
        let ox = -(a.fx ?? 0) / fl * 0.65 + w.x / wl * 0.35, oz = -(a.fz ?? 0) / fl * 0.65 + w.z / wl * 0.35; const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
        const tx = a.x + ox * b.gap, tz = a.z + oz * b.gap;
        I.look = { ...eye, lock: true }; I.stalk = true; I.breathHold = 0.5; I.alert = 0.3;
        if (c.watched) { I.freeze = true; I.breathHold = 1; if (!b.was) b.caught++; this.thought = 'You turned. It freezes where it is.'; }
        else { I.goal = { kind: 'move', id: b.gen * 10 + (b.caught % 10), x: tx, z: tz }; I.pace = clamp(a.speed * 1.25 + (Math.hypot(tx - sim.x, tz - sim.z) > 10 ? 1 : 0), 1.1, 4.5); if (I.pace > 1.6) I.stalk = false; this.thought = 'Following you, silent, where you cannot see it.'; }
        b.was = c.watched;
        if (b.caught >= 3 && !b.done) { b.done = true; ap.onGaveUp('seen'); }
        if (ap.H > 0.3 && c.d < 17 && !c.watched) { b.done = true; this._start('prowl', c, 'from behind'); if (this._preyGo(0, this.beh, c).go) { this.beh.phase = 'rush'; this.beh.at = 0; } return this._run(0, c, world); }
        break;
      }
      case 'lurk': {
        const H = b.haunt, at = { x: H.x, y: this.T.height(H.x, H.z) + 1.2, z: H.z };
        if (b.phase === 'go') {
          I.goal = this._follow(b); I.pace = 1.9; I.stalk = true;
          this.thought = 'Going quietly to where you often come.';
          if (!I.goal) { b.phase = 'wait'; b.at = b.t; }
        } else {
          I.look = { ...at, lock: true }; I.freeze = Math.abs(wrap(bearing(H.x - sim.x, H.z - sim.z) - sim.psi)) < 0.5; I.breathHold = 0.9; I.alert = 0.4; I.stalk = true;
          if (!I.freeze) I.goal = { kind: 'face', x: H.x, z: H.z };
          this.thought = 'Lying in wait, downwind of your usual place.';
          if (b.t - b.at > 60) { b.done = true; H.n = Math.max(1, H.n - 1); }
        }
        break;
      }
      case 'prowl': {
        I.look = { ...eye, lock: true };
        if (b.phase === 'stalk') {
          // as it creeps up on the herd: low and slow; still whenever you look its way
          // whether it means to go: hunger that has made up its mind (Hn), or the reflex worked up past `rushK` by a thing still
          // acting like prey; a bolt from close is answered at once. Short of that it creeps no nearer than its rush range plus
          // `holdD` and holds there, low, eyes locked (the tell), and a calm thing lets the reflex drain away: it is called off
          const PY = this.cfg.prey, go = this._preyGo(dt, b, c);
          // watched, it freezes mid-stride; its patience gone, it comes another way (_watchedApproach). Once it means to go and has
          // stalked long enough, being watched no longer stops it: it comes on openly to its rush range (it had stood frozen at
          // 21 m, going from 'set' back to 'stalk' every tick, because 'set' is only for inside the rush range)
          const press = go.go && b.t > 30 && c.d >= PY.rushD;
          const WA = c.d > 10 ? this._watchedApproach(dt, b, c, a, press) : { hold: false, mode: 'creep', goal: null }, hold = WA.hold, ip = this._intercept(a, 1.4);
          I.goal = WA.goal || { kind: 'approach', id: b.gen, x: ip.x, z: ip.z, stop: 0.5, quick: true }; I.pace = WA.pace || 1.5; I.stalk = WA.mode !== 'open'; I.freeze = hold; I.breathHold = hold ? 0.9 : 0.4; I.alert = 0.3;
          if (WA.mode === 'open') this._openTell(dt, b, c, I);
          this.thought = hold ? 'Frozen mid-stride. You are looking.' : WA.mode === 'open' ? 'Coming on in plain sight, slow.' : WA.mode === 'cover' ? 'Going in behind cover.' : WA.mode === 'arc' ? 'Moving round to come from another side.' : 'Creeping up on you, low and silent.';
          if (!go.go && c.d < PY.rushD + PY.holdD + 1) {
            // at the edge of its rush range, not yet meaning to go: it holds there, low, eyes locked; watched that long, it shifts
            // round you at that range (the angle changes; it is not giving up the pressure)
            const W = b.wa; if (W && (W.mode === 'arc' || W.mode === 'cover') && W.to) { /* the sidestep goes on */ }
            else { I.goal = { kind: 'face', x: a.x, z: a.z }; I.freeze = Math.abs(wrap(bearing(a.x - sim.x, a.z - sim.z) - sim.psi)) < 0.3; I.breathHold = 0.9; this.thought = 'Holding low, eyes on you.'; if (W && W.mode === 'open') { W.mode = 'hold'; W.modeT = 0; W.held = 0; W.pat = null; } }
          }
          if (go.off) { b.done = true; ap.onGaveUp('calm'); this.thought = 'The pull goes out of it.'; break; }
          // close enough to cover the ground before you can react (its own rush range), or you bolting: it goes; from a creep it
          // first sets itself, dead still and squared up (the tell); a bolt it answers at once
          if (go.go && (c.d < PY.rushD || (go.bolt && c.d < this.cfg.chase.boltD) || (b.t > 30 && c.d < PY.rushD + 6)) && c.fatigue < 0.45) {
            if (go.bolt) { b.phase = 'rush'; b.at = b.t; }
            else { b.phase = 'set'; b.at = b.t; b.setDur = R.range(...PY.setT); this.peril.lastStillT = this.t; this.peril._tell('still', { d: +c.d.toFixed(1), prowl: true }); }
          }
        } else if (b.phase === 'set') {
          I.goal = Math.abs(wrap(bearing(a.x - sim.x, a.z - sim.z) - sim.psi)) > 0.3 ? { kind: 'face', x: a.x, z: a.z } : null; I.freeze = !I.goal; I.stalk = true; I.breathHold = 1; I.alert = 1; I.quickTurn = true;
          this.thought = 'Dead still, set to go.';
          const go = this._preyGo(dt, b, c);
          // (sprung from waiting at a way out: no squaring up, the rush turns as it goes; walking past inside its reach, the strike)
          const sq = b.ambush || !I.goal || b.t - b.at > b.setDur + 1.5;      // (it had stood 15 s in 'set', turning against a wall, while he walked away)
          if (b.t - b.at > b.setDur && c.d < this.peril.reach() && K.seen && (a.state || 'free') === 'free' && Math.abs(wrap(bearing(a.x - sim.x, a.z - sim.z) - sim.psi)) < 0.5 && this.los(sim.head.pos.x, sim.head.pos.y, sim.head.pos.z, a.x, a.y, a.z)) { this.peril._strike(a); if (this.peril.stage === 'strike') { b.done = true; break; } }
          if (go.bolt || (b.t - b.at > b.setDur && sq && go.go)) { b.phase = 'rush'; b.at = b.t; }
          else if (!go.go || c.d > this.cfg.prey.rushD + 6) { b.phase = 'stalk'; if (!go.go) this.peril._tell('stood-down', { prowl: true }); }
        } else {
          const ip = this._intercept(a, Math.abs(sim.v) + 2);
          I.goal = { kind: 'approach', id: b.gen + 1, x: ip.x, z: ip.z, stop: 2, quick: true }; I.pace = 9.6 - 3.5 * Math.max(0, c.fatigue - 0.7); I.burst = b.t - (b.at || 0) < 1.6; I.stalk = false; I.agitation = 0.3; I.quickTurn = true;      // (a stalking gait is capped at a creep in rex.js: a rush is not stalking)
          this.thought = 'Rushing you, jaws open.';
          // the rush ends in the killing strike (peril.js) once you are inside its reach: a predator's catch is a kill
          if (this._inStrike(b, c) && K.seen && (a.state || 'free') === 'free') { this.peril._strike(a); if (this.peril.stage === 'strike') { b.done = true; break; } }
          if ((this._losing(dt, b, c) || c.fatigue > 0.95 || (K.via !== 'sight' && this.t - K.lastSeenT > 1.5)) && !b.done) { b.done = true; ap.onOutran(); this.thought = 'Too fast. It gives up, blowing.'; }
        }
        if (c.walled && !b.done) { b.done = true; if (!c.aff.reach) ap.onGaveUp('hid'); }      // its body cannot come where you are (its head may: besiege)
        break;
      }
      case 'avoid': {
        // keeping its distance from a thing it fears, facing it: it gives ground rather than turn its back
        I.look = { ...eye, lock: true }; I.alert = 0.85; I.agitation = 0.35; I.quickTurn = true;
        if (c.d < 11) { I.goal = { kind: 'drive', throttle: -0.35, steer: 0 }; I.pace = 2.5; this.thought = 'Backing away from you, head up.'; }
        else if (c.d < b.R) {
          const u = c.d || 1, tx = sim.x + (sim.x - a.x) / u * (b.R - c.d + 6), tz = sim.z + (sim.z - a.z) / u * (b.R - c.d + 6);
          const [gx, gz] = this.T.rect ? this._clampB(tx, tz, 12) : [clamp(tx, -this.T.arena + 12, this.T.arena - 12), clamp(tz, -this.T.arena + 12, this.T.arena - 12)];
          I.goal = { kind: 'move', id: b.gen, x: gx, z: gz }; I.pace = 1.7;
          this.thought = 'Moving off, looking back at you.';
        } else { I.goal = { kind: 'face', x: a.x, z: a.z }; I.freeze = true; this.thought = 'Out of the fire. Watching you.'; }
        b.far = c.d > b.R + 4 ? b.far + dt : 0;
        if (b.far > 2) b.done = true;
        break;
      }
    }
    void R;
    return null;
  }

  _runAttack(dt, b, c, I, eye, world) {
    const R = this.R, sim = this.sim, a = this.know.target, M = this.mood, st = a.state || 'free', lying = LYING.has(st) && st !== 'held';
    const gest = (k, pt, o) => sim.gesture(k, pt, o);
    const torso = { x: a.x, y: st === 'free' ? a.y - 0.65 : this.T.height(a.x, a.z) + 0.3, z: a.z };
    const rel = wrap(bearing(a.x - sim.x, a.z - sim.z) - sim.psi), facing = Math.abs(rel) < 0.35;
    I.noIdle = true; I.quickTurn = true; I.look = { ...eye, lock: true }; this.attacking = true;
    const angry = b.motive === 'anger', prey = b.motive === 'prey', play = b.motive === 'play';
    const end = (next) => { b.done = true; if (b.contact) this._vent(b); if (next) { this._start(next, c, 'after'); } };
    if (st === 'dead' && !(b.name === 'seize' && b.phase === 'hold')) { end(); return; }
    switch (b.name) {
      case 'butt': {
        if (b.phase === 'close') {
          I.goal = { kind: 'approach', id: b.gen, x: a.x, z: a.z, stop: lying ? 4.4 : 4.9, quick: true }; I.pace = play ? 1.4 : b.lethal ? 4.2 : angry ? 3.4 : 2.4;
          I.display = angry ? 0.5 : 0; I.agitation = angry ? 0.6 : 0.1; I.stalk = prey;
          if (c.d < 10) I.probe = { ...torso, k: 0.45, standoff: 2.2 };
          if (b.t > 0.2 && !b.growled && angry) { b.growled = true; gest('growl'); }
          if (c.d < (lying ? 4.9 : 6.2) && facing && (sim.v < 1.6 || c.d < 5.4) && !(sim.act && sim.act.forced && sim.act.kind === 'growl' && sim.act.t < 0.6)) { b.phase = 'strike'; b.at = b.t; gest('butt', torso, { force: b.force, over: true }); b.contact = true; }
          if (b.t > 14 || c.d > 30) end();
        } else if (b.phase === 'strike') {
          I.goal = { kind: 'face', x: a.x, z: a.z }; I.probe = { ...torso, k: 0.8, standoff: 0.6 }; I.agitation = 0.8;
          if (b.t - b.at > 1.45) { b.phase = 'after'; b.at = b.t; b.landed = st !== 'free'; if (b.landed && angry) gest('growl'); else if (!b.landed) gest('huff'); }
        } else {
          I.goal = { kind: 'face', x: a.x, z: a.z }; I.display = angry && b.landed ? 0.7 : 0; I.alert = 0.7; I.breathHold = 0.4;
          if (b.t - b.at > (b.landed ? (b.lethal ? 0.8 : 2.6) : 1.6)) { if (b.landed && b.lethal && lying) { b.done = true; this._vent(b); this.motiveNext = 'anger'; this.lethalNext = true; this._start('seize', c, 'to end it'); } else if (b.landed && angry && lying && this.grudge > 0.4 && R() < 0.6) { b.done = true; this._vent(b); this.motiveNext = 'anger'; this._start('pin', c, 'follow-up'); } else end(); }
        }
        break;
      }
      case 'swipe': {
        if (b.phase === 'set') {
          // a look back over the shoulder at you, then the hips are thrown round so the tail comes through where you stand
          I.goal = null; I.freeze = true;
          if (b.t > 0.35) { b.sgn = Math.sign(wrap(bearing(a.x - sim.x, a.z - sim.z) - (sim.psi + Math.PI))) || 1; gest('swipe', null, { sgn: b.sgn, over: true }); b.phase = 'swing'; b.at = b.t; b.contact = true; }
        } else if (b.phase === 'swing') {
          I.goal = null; I.agitation = 0.9;
          if (b.t - b.at > 1.8) { b.phase = 'after'; b.at = b.t; b.landed = st !== 'free'; }
        } else {
          I.goal = { kind: 'face', x: a.x, z: a.z }; I.alert = 0.8; I.display = b.landed ? 0.5 : 0.2;
          if (b.t - b.at > (b.lethal ? 1.2 : 2.8)) { if (b.landed && b.lethal && lying) { b.done = true; this._vent(b); this.motiveNext = 'anger'; this.lethalNext = true; this._start('seize', c, 'to end it'); } else if (b.landed && angry && lying && this.grudge > 0.4 && R() < 0.5) { b.done = true; this._vent(b); this.motiveNext = 'anger'; this._start('pin', c, 'follow-up'); } else end(); }
        }
        break;
      }
      case 'pin': {
        if (st === 'free' && b.phase !== 'off') { end(); break; }        // you got up first
        if (b.phase === 'close') {
          I.goal = { kind: 'approach', id: b.gen, x: a.x, z: a.z, stop: 1.2, quick: true }; I.pace = angry ? 2.2 : 1.6; I.plant = { x: a.x, z: a.z };
          I.probe = { ...torso, k: c.d < 9 ? 0.6 : 0, standoff: 1.4 }; I.display = angry ? 0.3 : 0;
          if (st === 'pinned') { b.phase = 'hold'; b.at = b.t; b.contact = true; gest(angry ? 'growl' : 'huff', torso); b.holdFor = lognormal(R, angry ? 9 : 6, 0.3); b.next = R.range(1.5, 3); }
          if (b.t > 12) { b.done = true; this._start(play ? 'toy' : 'seize', c, 'could not pin'); }
        } else if (b.phase === 'hold') {
          I.freeze = true; I.plant = { x: a.x, z: a.z }; I.probe = { ...torso, k: 0.9, standoff: 0.5 }; I.breathHold = 0.3; I.alert = 0.5;
          b.next -= dt;
          if (b.next < 0) { b.next = lognormal(R, 2.2, 0.4); gest(angry && a.struggle > 0.2 ? 'growl' : R() < 0.6 ? 'huff' : 'tilt', torso); }
          if (st !== 'pinned') { b.phase = 'after'; b.at = b.t; b.escaped = true; break; }
          // what it does about you under its foot: struggling feeds an angry or hungry animal; limp, you bore it
          if (b.lethal && b.t - b.at > 1) { b.phase = 'off'; b.next2 = 'seize'; b.at = b.t; }
          else if (a.struggle > 0.45 && (prey || (angry && this.attacks >= 1)) && b.t - b.at > 2) { b.phase = 'off'; b.next2 = 'seize'; b.at = b.t; }
          else if (a.still > 3.5 && b.t - b.at > 3) { b.phase = 'off'; b.next2 = 'leave'; b.at = b.t; b.bored = true; }
          else if (b.t - b.at > b.holdFor) { b.phase = 'off'; b.next2 = play ? 'toy' : null; b.at = b.t; }
        } else if (b.phase === 'off') {
          I.goal = { kind: 'drive', throttle: -0.3, steer: 0 }; I.pace = 1.2; I.probe = { ...torso, k: 0.4, standoff: 1.5 };
          if (st !== 'pinned' && b.t - b.at > 0.6) { if (b.next2 === 'seize' && lying) { b.done = true; this._vent(b); this.motiveNext = b.motive; this.lethalNext = b.lethal; this._start('seize', c, 'struggling'); } else end(b.next2); }
          if (b.t - b.at > 4) end(b.next2);
        } else {
          I.goal = { kind: 'face', x: a.x, z: a.z }; I.alert = 0.8;
          if (b.t - b.at > 1.5) { if (angry && this.R() < 0.5 && lying) { b.done = true; this._vent(b); this.motiveNext = b.motive; this._start('pin', c, 'got out'); } else end(); }
        }
        break;
      }
      case 'seize': {
        if (b.phase === 'close') {
          I.goal = { kind: 'approach', id: b.gen, x: a.x, z: a.z, stop: lying ? b.reachL ?? 5.0 : b.reachS ?? 5.6, quick: true }; I.pace = prey ? (c.d > 12 ? 3.5 : 2) : b.lethal ? 3.8 : angry ? 3 : 1.6; I.stalk = prey && c.d > 9;
          // food that is getting away is run down, not walked up to
          if (prey && !lying && c.speed > 1.5) { const ip = this._intercept(a, Math.abs(sim.v) + 2); I.goal = { kind: 'approach', id: b.gen + 1, x: ip.x, z: ip.z, stop: 1.5, quick: true }; I.pace = 9.6 - 3.5 * Math.max(0, c.fatigue - 0.7); I.stalk = false; }
          if (c.d < 10) I.probe = { ...torso, k: 0.6, standoff: 1.4 };
          // a hunter strikes on the run at something running from it; otherwise it stops and reaches
          const onRun = prey && !lying && Math.abs(rel) < 0.3 && c.d < (b.reachS ?? 5.6) + 1.2 + 0.25 * Math.max(0, sim.v);
          if ((c.d < (lying ? b.reachL ?? 5.0 : b.reachS ?? 5.6) + 0.5 && facing && sim.v < 1.3) || onRun) { b.phase = 'strike'; b.at = b.t; gest('seize', torso, { over: true }); b.contact = true; b.tries++; }
          if (b.t > 16 || c.d > 30) end();
        } else if (b.phase === 'strike') {
          I.goal = { kind: 'face', x: a.x, z: a.z }; I.probe = { ...torso, k: 1, standoff: 0.2 }; I.grip = true; I.mouth = 0.18;
          if (st === 'held') { b.phase = 'hold'; b.at = b.t; b.holdAt = this.t; b.sub = 'lift'; b.subAt = b.t; b.next = R.range(1, 1.6); b.shakes = 0; this.mood.arousal = Math.min(1, M.arousal + 0.2); }
          else if (b.t - b.at > 1.3) {
            // missed: it learns how far its jaws really reach, backs up a little if it overran, and may try once more
            const tipD = Math.hypot(sim.head.pos.x + sim.head.f.x * 1.5 - a.x, sim.head.pos.z + sim.head.f.z * 1.5 - a.z), over = c.d < 4.2;
            if (lying) b.reachL = clamp((b.reachL ?? 5.0) + (over ? 0.6 : -Math.min(0.8, tipD * 0.6)), 3.8, 6); else b.reachS = clamp((b.reachS ?? 5.6) + (over ? 0.6 : -Math.min(0.8, tipD * 0.6)), 4.2, 6.5);
            if (b.tries < 2 && c.d < 10 && !play) { b.phase = 'close'; } else { b.phase = 'after'; b.at = b.t; b.missed = true; gest('huff'); }
          }
        } else if (b.phase === 'hold') {
          I.grip = true; I.mouth = 0.18; this.holding = true;
          // what is in its mouth is not something to look at: the eyes go ahead, where it is going or holding its head
          const far = { x: sim.x + Math.sin(sim.psi) * 25, y: sim.groundY + 3.5, z: sim.z + Math.cos(sim.psi) * 25 }; I.look = { ...far, lock: true }; I.attention = null;
          if (st !== 'held') { b.phase = 'after'; b.at = b.t; b.gone = st; if (prey && !b.dropping && b.sub !== 'toss' && st !== 'dead') this.ap.onSlip(); break; }      // tossed, dropped, or you worked loose
          const held = b.t - b.at, limp = a.still > 2.2;
          const ahead = { x: sim.x + Math.sin(sim.psi) * 7, z: sim.z + Math.cos(sim.psi) * 7 };
          const up = (y, k) => ({ x: sim.x + Math.sin(sim.psi) * 7.2, y: sim.groundY + y, z: sim.z + Math.cos(sim.psi) * 7.2, k, standoff: 0 });
          if (b.sub === 'lift') { I.probe = up(5.6, 1); I.freeze = true; }
          else if (b.sub === 'carry') {
            if (!b.route) { const ang = sim.psi + R.range(-1.3, 1.3), dd = R.range(14, 26); let x = sim.x + Math.sin(ang) * dd, z = sim.z + Math.cos(ang) * dd; [x, z] = this._clampB(x, z, 12); b.route = this._route(sim.x, sim.z, x, z); }
            I.goal = this._follow(b); I.pace = 2.4; I.probe = up(5, 0.7);
            if (!I.goal) b.next = Math.min(b.next, 0);
          } else if (b.sub === 'worry' || b.sub === 'toss') { I.freeze = true; I.agitation = 1; }
          else if (b.sub === 'hold') { I.freeze = true; I.probe = up(4.6, 0.7); I.alert = 0.6; }
          else if (b.sub === 'taste') { I.freeze = true; I.probe = up(4.4, 0.7); I.mouth = 0.14 + 0.08 * Math.abs(Math.sin(b.t * 7)); I.breathHold = 0.6; }      // mouthing you
          b.next -= dt;
          if (b.next < 0 && !b.dropping && !(sim.act && (sim.act.kind === 'worry' || sim.act.kind === 'toss') && sim.act.t < sim.act.dur * 0.9)) {
            // the decision, every second or two, on what it feels in its mouth
            let nx;
            const fight = a.struggle > 0.35 || a.escape > 0.45;
            // T10 (the owner: "its picked me up like 4 times now but chosen not to kill me each time, its becoming non threatening
            // feeling"): nothing in a hold ever hurt him (his health does not wear down; only a committed `strike` kills, arena.js), and
            // the hold ended by the arena's 12 s limit, which counted as a slip against him (appraise.js onSlip: cost up, worth down), so
            // the 3rd or 4th taste came out "not meat". A hungry animal that has him that is not afraid finishes it: one shake, then the bite
            // (very hungry, the first time; hungry above half, once he is known meat and known harmless: handled before). Fed and playing,
            // or afraid, it still lets go, and says why.
            const known = (a.handled || 0) > 1, resolute = b.lethal || (!play && this.ap.fear < 0.35 && (prey && this.hunger > 0.75 || known && this.hunger > 0.5));
            if (resolute) nx = b.shakes < 1 ? 'worry' : 'kill';
            else if (prey && b.sub === 'taste' && !b.tasted) {
              // what it found in its mouth: worth keeping, or not meat after all
              const ap = this.ap, ovv = this.ov.verdict;
              // (a kicking mouthful is what prey does: it hardly counts against it; blood in the mouth counts for it)
              const keep = ovv === 'food' ? true : ovv === 'notfood' ? false : ap.need + 0.5 * ap.worth + 0.35 * (ap.cues.meat || 0) + 0.3 * (a.blood || 0) + ap.palate - ap.cost - (fight ? 0.08 : 0) - 0.4 * ap.fear * (1 - ap.need) > 0.66;
              b.tasted = true; b.kept = keep; ap.onTaste(keep); if (!keep) { b.spat = true; nx = 'drop'; }
            }
            if (nx) { /* decided by the taste */ }
            else if (prey && !b.tasted && held > 0.8) nx = 'taste';
            else if (prey && b.kept) nx = fight || b.shakes < 1 || b.carried ? 'worry' : 'carry';      // food it means to keep: it kills it
            else if (limp && held > 3) nx = prey && this.hunger > 0.85 && !b.carried ? 'carry' : 'drop';
            else if (fight && (prey || angry) && b.shakes < 2) nx = 'worry';
            else if (fight && b.shakes >= 2) nx = angry || play ? 'toss' : 'drop';
            else if (angry && b.shakes >= 1 && held > 4) nx = R() < 0.6 ? 'toss' : 'drop';
            else if (play && held > 2.5) nx = R() < 0.5 ? 'toss' : 'drop';
            else if (prey && !b.carried && held > 1.5) nx = 'carry';
            else if (prey && b.carried && b.shakes === 0) nx = 'worry';
            else if (held > 14) nx = angry ? 'toss' : 'drop';
            else nx = b.sub === 'lift' ? (angry ? 'worry' : 'hold') : R() < 0.5 ? 'hold' : angry ? 'worry' : 'hold';
            if (angry && fight && b.shakes < 3 && this.attacks >= 3 && nx === 'toss') nx = 'worry';      // it has had enough of you
            b.sub = nx; b.subAt = b.t; b.next = { worry: 2.0, toss: 1.6, kill: 1.0, drop: 0.6, carry: lognormal(R, 7, 0.3), hold: lognormal(R, 1.8, 0.4), lift: 1.2, taste: 1.8 }[nx];
            if (nx === 'worry') { gest('worry', null, { force: angry ? 1 : 0.8, over: true }); b.shakes++; }
            if (nx === 'toss') gest('toss', null, { sgn: R() < 0.5 ? 1 : -1, force: angry ? 1 : 0.55, over: true });
            if (nx === 'carry') { b.carried = true; b.route = null; }
            if (nx === 'kill') gest('strike', { x: a.x, y: a.y, z: a.z }, { over: true });      // the jaws close for good (arena.js: a strike on a held person kills)
            if (nx === 'drop') {
              b.dropping = true;
              // a release is a choice, and says so
              if (!b.spat) this._say('letgo', play ? (this.hunger < 0.5 ? ['not hungry. play', 'not hungry. just play', 'play. not eat'] : ['play. drop it', 'just play. drop']) : this.ap.fear >= 0.35 ? ['bad thing. let go', 'scared. let go', 'no. drop it'] : angry ? ['enough. go away', 'enough. drop it'] : this.hunger < 0.5 ? ['not hungry. drop it', 'not hungry. let go'] : ['not worth it. drop', 'drop it. not now']);
            }
          }
          if (b.dropping) {
            // putting you down: the head comes down first, then the jaws open
            b.dropT = (b.dropT || 0) + dt; I.freeze = true; I.probe = { x: ahead.x, y: sim.groundY + 0.6, z: ahead.z, k: 1, standoff: 1.2 };
            if (a.y - this.T.height(a.x, a.z) < 1.4 || b.dropT > 1.6) { I.grip = false; I.mouth = 0.5; }
          }
          if (held > 30) I.grip = false;        // it never keeps hold for ever
        } else {
          // after: what is left of you, on the ground
          I.goal = { kind: 'face', x: a.x, z: a.z }; I.alert = 0.6; I.probe = lying ? { ...torso, k: 0.5, standoff: 1.8 } : undefined;
          if (b.spat && !b.shook && b.t - b.at > 0.3) { b.shook = true; gest('shake', null, { over: true }); }      // the taste of you, shaken out of its mouth
          if (b.t - b.at > (b.missed ? 1.4 : 2.6)) { if (b.spat) { end('leave'); } else if (b.lethal && lying && (b.again || 0) < 2) { b.done = true; this._vent(b); this.motiveNext = 'anger'; this.lethalNext = true; const again = (b.again || 0) + 1; this._start('seize', c, 'to end it'); this.beh.again = again; } else if (lying && a.still > 1.5 && !angry && R() < 0.6) { b.done = true; this._vent(b); this.motiveNext = 'play'; this._start('toy', c, 'after'); } else end(); }
        }
        break;
      }
      case 'toy': {
        // nosing at a small thing on the ground: poke it, pick it up, wait to see what it does
        const RS = this.sp.dims.reachStop;
        if (b.phase === 'close') {
          I.goal = { kind: 'approach', id: b.gen, x: a.x, z: a.z, stop: RS - 0.2, quick: true }; I.pace = 1.4; I.probe = { ...torso, k: c.d < 10 ? 0.7 : 0, standoff: 1.4 };
          if (c.d < RS + 0.8 && Math.abs(sim.v) < 0.6) { b.phase = 'nose'; b.at = b.t; b.next = R.range(0.8, 1.6); }
          if (b.t > 15) end();
        } else if (b.phase === 'nose') {
          I.goal = { kind: 'face', x: a.x, z: a.z }; I.probe = { ...torso, k: 1, standoff: 0.25 }; I.breathHold = 0.2;
          b.next -= dt; if (b.next < 0) { b.next = lognormal(R, 1.5, 0.4); gest('huff', torso); }
          if (b.t - b.at > lognormal(R, 2.6, 0.2)) { b.phase = 'pick'; b.at = b.t; b.pick = !lying ? 'butt' : R() < 0.5 ? 'poke' : R() < 0.6 && this.temper.bold > 0.5 ? 'seize' : 'wait'; if (b.pick === 'butt') { gest('butt', torso, { force: 0.15, over: true }); b.contact = true; } if (b.pick === 'poke') { b.contact = true; gest('huff', torso); } if (b.pick === 'seize') { b.done = true; b.contact = true; this._vent(b); this.motiveNext = 'play'; this._start('seize', c, 'toying'); break; } }
        } else if (b.phase === 'pick') {
          I.goal = { kind: 'face', x: a.x, z: a.z }; I.probe = { ...torso, k: 1, standoff: b.pick === 'poke' ? -0.5 : b.pick === 'butt' ? 0.4 : 1.2 }; I.alert = 0.6;
          if (b.pick === 'poke') I.poke = b.gen * 10 + 1;      // the snout shoved into you: rolls you over if it gets there
          if (b.t - b.at > (b.pick === 'butt' ? 1.5 : 1)) { b.phase = 'wait'; b.at = b.t; b.waitFor = lognormal(R, 3.5, 0.3); }
        } else {
          // waiting: head low over you, watching for a twitch
          I.goal = { kind: 'face', x: a.x, z: a.z }; I.probe = { ...torso, k: 0.7, standoff: 1.6 }; I.freeze = true; I.breathHold = 0.6; I.alert = 0.7;
          if (a.still > 4.5 && b.t - b.at > 3) { b.bored = true; end('leave'); this.mood.interest *= 0.5; break; }      // limp: nothing to play with
          if (st === 'free' && c.d > 9) { end(); break; }
          if (b.t - b.at > b.waitFor) { if (a.struggle > 0.2 || st === 'rising' || st === 'free') { b.phase = 'nose'; b.at = b.t; b.next = 0.4; } else if (b.t > 22) end('leave'); else { b.phase = 'nose'; b.at = b.t; b.next = 0.6; } }
        }
        break;
      }
    }
  }

  // ---------------------------------------------------------------------- the loop
  step(dt, world) {
    this.t += dt; this.acc += dt;
    if (world.noises.length) (this.heard || (this.heard = [])).push(...world.noises);
    if (world.hits && world.hits.length) (this.felt || (this.felt = [])).push(...world.hits);
    if (BOND_ON && world.touch && world.touch.length) this.touchNow = { ...world.touch[0], t: this.t };
    if (this.acc >= 0.1) {
      const d = this.acc; this.acc = 0;
      this.touch = this.touchNow && this.t - this.touchNow.t < 0.2 ? this.touchNow : null;
      const newTouch = !!this.touch && !this.touchWas; this.touchWas = !!this.touch;
      this._perceive(d, { ...world, noises: this.heard || [], hits: this.felt || [] }); this.heard = []; this.felt = [];
      this._beliefStep(d, world);
      const c = this._ctx(); this.ctx = c;
      this._habits(c);
      this.wind = world.wind;
      this.ap.step(d, c, world); this._haunts(d, c);
      this.peril.step(d, c);
      this._goalStep(c);
      const b = this.beh;
      const pdGo = this._preyDrive(d, c);
      { const enc = !!(c.enclosed || c.beliefIn); if (this._encW && !c.enclosed && (c.seen || !c.beliefIn)) this.cameOutT = this.t; this._encW = !!c.enclosed || (!c.seen && enc && this._encW); }      // (when you last came out of somewhere)
      // things that interrupt whatever it is doing
      let reason = null;
      if (this.peril.busy) {
        // it has stopped weighing anything else: whatever it was doing is over (except what its jaws or foot hold)
        this.hitNow = false; this.sighted = null; if (this.focus) this.focus.newFocus = false; if (this.startle) this.startle.handled = true;
        if (b && !this._handling() && b.name !== 'pause') { b.done = true; this._start('pause', c, 'still'); }
      } else if (this.ov.freeze && b) { if (b.done) this._start(this.canStart(b.name) ? b.name : 'pause', c, 'frozen'); }
      else if (this._handling() && b && !b.done) { this.hitNow = false; this.sighted = null; if (this.focus) this.focus.newFocus = false; }      // its hands, so to speak, are full
      else {
      const F = this.focus, busy = b && ['pounce', 'feed', 'hunt', 'chase', 'snap', 'bluff', 'investigate', 'trail', 'besiege', 'pet', 'pull', 'relief', 'prowl', 'test', ...ATTACKS].includes(b.name);
      // a quiet noise does not get a resting animal up, if it is at ease (it only looks)
      if (this.startle && !this.startle.handled && b && b.name === 'rest' && !b.done && this.startle.sal < 0.25 + 0.3 * (this.tame + this.pain)) this.startle.handled = true;
      const touchy = this.touch && b && !(b.name === 'pet' && this.touch.part === 'snout') && !(b.name === 'pull' && this.touch.part === 'foot') && !(b.name === 'feed' && this.focus && this.focus.hand) && !(ATTACKS.includes(b.name) && !b.done) && b.name !== 'relief' && (newTouch || b.done || ['pet', 'pull'].includes(b.name));
      if (pdGo && this.pd.close && c.d < this.peril.reach() + this.cfg.prey.boltStrike && Math.abs(wrap(bearing(this.know.target.x - this.sim.x, this.know.target.z - this.sim.z) - this.sim.psi)) < 1.0 && this.peril.stage !== 'strike') {
        // bolting from inside (or just outside) the reach of its jaws, in front of it: the strike comes at once, aimed ahead of you
        reason = 'bolt'; this.hitNow = false; this.sighted = null; this._open(reason); this.pd.k = 0; this.pd.lastT = this.t; this.peril._strike(this.know.target);
        if (this.peril.stage !== 'strike') this._start('pounce', c, 'prey drive');
      } else if (pdGo) {
        reason = 'prey drive'; this.hitNow = false; this.sighted = null; this._open(reason); this._start('pounce', c, reason);      // something ran: it goes, before it thinks
      } else if (this.hitNow) {
        // a blow that still makes it flinch matters at once: whatever it was set on is weighed afresh (one it has learnt to take
        // without flinching is weighed against what it is doing, like any other news)
        this.hitNow = false; reason = 'hit'; if (this.t - (this.lastFlinch ?? -99) < 0.15) this._open(reason);
        if (b && ATTACKS.includes(b.name) && !b.done && c.seen) { /* already doing something about you */ }
        else if (c.seen || this.t - this.openT > 0.05) this._choose(c, reason);      // a blow it no longer flinches at is weighed like other news
        else if (!(b && b.name === 'feed' && this.R() < 0.5)) { this._start('search', c, reason); this.beh.pace = 2.8; this.beh.low = false; }
      } else if (this.alarm) {
        reason = this.alarm; this.alarm = null; this._choose(c, reason);      // fire close, a verdict of threat, the prey reflex setting in
      } else if (c.seen && !c.enclosed && this.t - (this.cameOutT ?? -99) < 8 && (this.ambushT ?? -99) < this.cameOutT && !(b && (b.name === 'pounce' || b.name === 'prowl' || ATTACKS.includes(b.name))) && this._siegeAmbush(c)) {
        // out of the place it has been working at, close to where it waited: it was ready for this (the dead-still set, then the rush)
        reason = 'ambush'; this.enclWas = !!c.enclosed;
      } else if (!!c.enclosed !== !!this.enclWas && ((this.enclWas = !!c.enclosed), true) && !(b && ATTACKS.includes(b.name) && !b.done)) {      // (coming out too: the assignment's value had made it fire only on going in)
        // you went in under or behind something: what it was set on (watching you in the open, stalking you) is weighed afresh, so
        // getting at you where you are now can take over (the commitment margin had kept it watching a doorway from 30 m)
        reason = 'inside'; this._open(reason); this._choose(c, reason);
      } else if (this.startle && !this.startle.handled && this.startle.sal >= this.cfg.commit.breakSal && c.seen && this.know.target && Math.hypot(this.startle.x - this.know.target.x, this.startle.z - this.know.target.z) > 6) {
        // a loud sound close by from somewhere else while it has you in view: the head goes to it and it weighs everything afresh
        reason = 'sound'; this.startle.handled = true; this._open(reason); this.att._glance('sound', 'interrupt'); this._choose(c, reason);
      } else if (touchy) {
        reason = 'touched'; this._start(this.touch.part === 'foot' ? 'pull' : 'pet', c, reason);
      } else if (F && F.newFocus) {
        F.newFocus = false; this.glance = { x: F.x, y: F.y, z: F.z, until: this.t + this.R.range(1.5, 3.2) };       // whatever it decides, it looks first
        if (!busy || b.done || (b.name === 'trail' && F.see > 0.25)) this._choose(c, 'noticed');
      } else if (this.cfg.core.on && c.seen && b && !b.done && ['watch', 'roam', 'pause', 'stare', 'listen', 'sniff', 'circle', 'inspect'].includes(b.name) && this.ap.sig && (this.ap.sig.small || 0) >= 0.5 && this.t - (this.lookAgainT ?? -99) > this.cfg.core.lookT) {
        // a small thing in view while it only watches it or goes about its own business: it is weighed again every few seconds
        // (the core's going to it and asking need not wait for some other news; it had stood watching a man 10 s, MERGE.md)
        this.lookAgainT = this.t; this._choose(c, 'look again');
      } else if (this.prey && !busy && this.hunger > 0.45 && this.R() < 0.03) {
        this._choose(c, 'prey');
      } else if (this.thunder && this.t - this.thunder.t < 0.15 && !busy) {
        this._choose(c, 'thunder');
      } else if (this.sighted && b && !b.done && FRIENDLY.includes(b.name) && (this.tame > 0.3 || b.name !== 'rest' || (this.pain > 0.3 && c.d > 14))) {
        this.sighted = null;      // it has seen you; it carries on (lying there, it just watches)
      } else if (this.sighted && b && !b.done && this.goal && ABOUT_YOU.has(this.goal.mode) && ABOUT_YOU.has(modeOf(b.name))) {
        // seeing you again while it is set on you is not news: it goes on (from searching, it picks how to go on)
        this.sighted = null; this._progress(); if (modeOf(b.name) === 'seek') this._choose(c, 'sight');
      } else if (this.sighted) {
        const s = this.sighted; this.sighted = null; reason = 'sight';
        // a new sighting often gets a moment of absolute stillness first
        if (this.R() < 0.55 + 0.3 * this.temper.nervy && !(c.running && this.R() < 0.6)) { this._start(this.R() < 0.6 ? 'watch' : 'listen', c, 'sight'); if (this.beh.name === 'listen') this.beh.at = { ...this.know.last, y: this.know.last.y }; }
        else this._choose(c, reason);
        void s;
      } else if (this.startle && !this.startle.handled && this.startle.sal < this.cfg.commit.breakSal && b && !b.done && this.goal && this.goal.mode !== 'seek' && this._margin() > 0.15) {
        this.startle.handled = true;      // a mild sound while it is set on something: the head went to it (orient), the body stays on task
      } else if (this.startle && !this.startle.handled && !c.seen && (!b || !['listen', 'search', 'chase', 'bluff', 'snap', 'feed', 'hunt', 'investigate', 'trail'].includes(b.name) || this.startle.sal > (b && b.name === 'feed' ? 0.75 : 0.5))) {
        const st = this.startle; reason = 'sound'; st.handled = true; if (st.sal >= this.cfg.commit.breakSal) this._open(reason);
        const r = this.R(), ss = this.mem.stoneSeen && this.t - this.mem.stoneSeen.t < 3 ? this.mem.stoneSeen : null;
        if (st.kind === 'stone' && this.mem.decoys >= 1 && ss) {
          // it saw that stone fly: whoever threw it is back along its flight, not where it fell
          const vh = Math.hypot(ss.vx, ss.vz) || 1, D = clamp(0.45 * vh / Math.max(0.1, 1 - 0.021 * vh), 6, 45) * this.R.range(0.8, 1.2), ox = ss.x - ss.vx / vh * D, oz = ss.z - ss.vz / vh * D;
          this._seed(ox, oz, 4, 0.7); this.startle = { x: ox, z: oz, y: this.T.height(ox, oz) + 1, sal: 0.6, kind: 'traced' }; this.mem.stoneSeen = null;
          this._start('search', c, 'traced'); this.beh.traced = true; this.beh.fromSound = true; this.beh.soundKind = 'traced'; this.decoyT = this.t; this.decoyHow = 'traced';
        } else if (st.kind === 'stone' && this.mem.decoys >= 2) {
          // another stone landing somewhere: it has fallen for that before
          this.startle = null; this._start(r < 0.5 ? 'stare' : 'ambush', c, 'decoy'); this.beh.decoy = true; this.decoyT = this.t; this.decoyHow = 'ignored';
        } else if (r < 0.45 + 0.3 * this.temper.nervy) this._start('listen', c, reason);
        else if (r < 0.85 || this.mem.fooled < 0.4) this._start('search', c, reason);
        else this._start('ambush', c, reason);
        this.startle = this.beh.name === 'search' ? st : null;
        if (this.beh.name === 'listen') this.startle = st, this.beh.onDone = 'search';
      } else if (c.seen && b && b.name === 'lurk' && !b.done) {
        // the ambush springs: you came by where it was waiting
        if (c.d < 26 && (this.ap.H > 0.05 || this.ap.weigh > 0.3) && this.canStart('prowl')) { this._start('prowl', c, 'ambush'); if (this._preyGo(0, this.beh, c).go) { this.beh.phase = 'rush'; this.beh.at = 0; } }      // (it springs only if it means to go: else it stalks from there)
        else this._choose(c, 'seen');
      } else if (c.seen && b && c.running && this.ap.H > 0.12 && this.ap.cues.runAway && !['prowl', 'chase', ...ATTACKS].includes(b.name) && !busy && !(['appraise', 'shadow', 'test'].includes(b.name) && b.t < 4)) {
        this._choose(c, 'running');      // something running away from a hungry predator
      } else if (c.seen && b && ['search', 'stare', 'ambush', 'sniff', 'revisit'].includes(b.name)) {
        this._choose(c, 'seen');
      } else if (c.seen && b && c.running && b.name !== 'chase' && b.name !== 'pounce' && this.R() < 0.05 * (0.5 + this.temper.bold)) {
        this._choose(c, 'running');
      } else if (!b || b.done) {
        if (b && b.onDone === 'search' && !c.seen && this.R() < 0.7) this._start('search', c, 'after listening');
        else this._choose(c, 'next');
      } else if (!c.seen && b && ['watch', 'stalk', 'circle', 'inspect', 'display', 'chase', 'bluff', 'snap', 'backoff', 'greet', 'follow', 'appraise', 'test', 'shadow', 'prowl', 'avoid', 'guard', ...ATTACKS].includes(b.name)) {
        this._choose(c, 'lost');
      } else if (!busy && this.R() < (this.beh && ['roam', 'pause', 'watch', 'stare'].includes(this.beh.name) ? 0.006 : 0.002)) this._choose(c, 'reconsider');
      if (c.seen && this.beh && this.beh.name === 'search') this._choose(c, 'seen');
      }
      if (this.ov.force && this.beh && this.beh.name !== this.ov.force && this.canStart(this.ov.force)) this._start(this.ov.force, c, 'forced');
    }
    if (!this.beh) this._choose(this._ctx(), 'start');
    if (this.acc === 0 && this.beh) { this.stance = this.ap.stanceOf(this.beh, this.beh.motive); this.ap.stance = this.stance; if (this.stance === 'predatory') this.ap.predT = this.t; }
    this.attacking = false; this.holding = false; this.petting = false; this.allowPull = false;
    this.att.update(world);
    const I = this._run(dt, this.ctx || this._ctx(), world);
    if (this.peril.stage !== 'calm') { this.peril.apply(I, this.ctx); if (this.peril.busy || (this.peril.cur && this.peril.cur.kind === 'stare')) this.attacking = true; }
    // at ease with you: whatever it is doing, it carries itself loosely (no braced stillness, no held breath)
    const bn = this.beh ? this.beh.name : '';
    if (this.know.seen && this.tame > 0.25 && I.relax === undefined && !['display', 'bluff', 'chase', 'snap', 'backoff', 'hunt', 'besiege', ...ATTACKS].includes(bn)) { I.relax = 0.7 * this.tame; I.alert = (I.alert || 0) * (1 - this.tame); I.breathHold = (I.breathHold || 0) * (1 - 0.7 * this.tame); }
    const handling = this._handling();
    if (this.glare > 0.05) I.glare = this.glare / (1 + 0.15 * Math.min(this.steel || 0, 10));      // the body screws up its eyes and turns its head from the light
    if (this.glare > 0.5 && I.look && this.know.target && !handling) { const DZ = this.dazzle || { 1: 0, [-1]: 0 }, h = this.sim.head, sg = DZ[1] > DZ[-1] + 0.2 ? 1 : DZ[-1] > DZ[1] + 0.2 ? -1 : 1;      // turns the dazzled eye from it, the other eye onto it
      I.look = { ...I.look, x: I.look.x + h.l.x * sg * 3, z: I.look.z + h.l.z * sg * 3, lock: false }; }     // squinting away from the beam
    if (this.glance && this.t < this.glance.until && !(I.look && I.look.lock) && !handling) I.look = { x: this.glance.x, y: this.glance.y, z: this.glance.z, lock: true };
    // a glance (attend.js): honoured over the behaviour's own look, except while it has hold of you
    { const AG = this.att.gaze(); if (AG && !handling && !this.attacking) I.look = AG; }
    // a sound that broke off what it was doing, from far round behind it: the body turns to it too, while the glance lasts
    { const GL = this.att.glancing('interrupt'); if (GL && GL.key === 'sound' && !handling && !this.attacking && !this.peril.busy && Math.abs(wrap(bearing(GL.x - this.sim.x, GL.z - this.sim.z) - this.sim.psi)) > 1.2) { I.goal = { kind: 'face', x: GL.x, z: GL.z }; I.quickTurn = true; I.freeze = false; I.stalk = false; } }
    // a hard knock of its body against something: a beat of surprise (breath caught, a jolt of alertness, the head up, no
    // stalking crouch), then on with whatever it was doing (its goal is not changed; a rush or a grip is not interrupted)
    { const CB = this.crashBeat; if (CB && this.t < CB.until && !handling && !this.attacking && !(this.beh && ['pounce', 'chase'].includes(this.beh.name)) && !(this.beh && this.beh.name === 'prowl' && this.beh.phase === 'rush')) {
        I.breathHold = Math.max(I.breathHold || 0, 0.7); I.alert = Math.max(I.alert || 0, 0.8); I.stalk = false; I.low = 0; I.pace = Math.min(I.pace || 2, 0.6);
        if (!CB.huffed && this.t > CB.until - 0.2) { CB.huffed = true; this.sim.gesture('huff'); } } }
    // after a head-on knock: a word of care once the shake is over; and for a while, a little slower near the place it happened
    { const CA = this.crashAfter; if (CA && this.t >= CA.at) { this.crashAfter = null; this._say('crash', ['careful now', 'careful. slow', 'slow. careful']); }
      const W = this.wary; if (W && this.t < W.until && !handling && !this.attacking && !this.peril.busy && !(this.beh && ['pounce', 'chase', 'hunt', 'bluff', 'prowl'].includes(this.beh.name)) && Math.hypot(this.sim.x - W.x, this.sim.z - W.z) < 8) I.pace = Math.min(I.pace || 2.4, 2.4); }
    // a thing that has just shown (the orienting reflex, _orientObj): for the beat the look lasts, the body comes round to it too
    // when it is far round (the neck alone cannot bring the eyes onto it while it walks on); then it goes on with what it was doing
    { const g = this.att.glance, OO = this.objOrient;
      if (g && OO && g.key === 'obj:' + OO.id && this.t <= g.until && (g.level === 'look' || g.level === 'interrupt') && !handling && !this.attacking && !this.peril.busy && true) {
        if (I.probe) { I.probe = null; I.nose = false; }      // (a sniff at you pauses for the beat: its head goes to the thing)
        if (Math.abs(wrap(bearing(g.x - this.sim.x, g.z - this.sim.z) - this.sim.psi)) > 0.45) { I.goal = { kind: 'face', x: g.x, z: g.z }; I.quickTurn = true; I.freeze = false; } } }
    if (!I.look && this.know.seen && this.know.target) I.attention = this.know.target;
    const snapping = this.beh && (this.beh.name === 'snap' || this.beh.name === 'chase' || this.beh.name === 'bluff');
    // the head keeps off people, except one it is laying hold of
    const near = bn === 'pet' || bn === 'pull' || (bn === 'feed' && this.focus && this.focus.hand) ? 0.42 : bn === 'greet' ? 0.6 : null;
    I.keepOut = world.agents.filter((p) => !(this.attacking && this.know.target && p.id === this.know.target.id) && p.state !== 'held').map((p) => ({ x: p.x, y: p.y, z: p.z, r: snapping ? 0.75 : near ?? (bn === 'nudge' ? 0.55 : LYING.has(p.state) ? 0.6 : 1.5) }));
    const tgt = this.know.target, dNow = tgt ? Math.hypot(tgt.x - this.sim.x, tgt.z - this.sim.z) : 99;
    if (tgt && dNow < this._personal() - 1.4 && !this.peril.busy && this.beh && ['watch', 'display', 'stare', 'circle', 'feign', 'pause', 'ambush', 'listen', 'inspect'].includes(this.beh.name)) {
      // too close for comfort: give ground until the head, not the chest, is what faces you
      I.goal = { kind: 'approach', id: 'space', x: tgt.x, z: tgt.z, stop: this.sp.spacing.personal, quick: true }; I.pace = 1.2; I.freeze = false;
    }
    this._unstick(dt, I);
    this.intent = I;
    const set = this.beh && this.beh.name === 'prowl' && this.beh.phase === 'set';
    if (this.acc === 0 && !this.peril.quiet && !set) this.thinker.step();      // gone still before it strikes: its thoughts stop
    if (this.acc === 0 || !this.voice.at) this._speak();
    return I;
  }

  /** Not getting anywhere: it means to travel (a move goal, or a reach or approach goal well beyond where it would stop), its
   *  body has neither gone 1.5 m nor turned 0.6 rad in 4 s (turning on the spot toward the goal is progress: a big body turns
   *  round slowly), and something solid is against or right beside it (`_hemmed`). In order: back out along its own line (out of contact with whatever holds it; the body backs,
   *  the mind only asks), then plan again from where it is with that spot marked as a bad way (nav.sore, for a while); stuck a
   *  second time on the same errand, it gives the errand up and says so. Nothing here knows what it is stuck on. */
  _unstick(dt, I) {
    const sim = this.sim, b = this.beh, nav = sim.nav, g = I.goal, U = this.stuck || (this.stuck = { x: sim.x, z: sim.z, psi: sim.psi, t: this.t, n: 0, gen: -1, phase: null });
    if (nav && nav.sore) nav.sore = nav.sore.filter((m) => m.until > this.t);
    // turning on the spot needs its turning room (nav.room, measured off its own trunk) clear round the middle of the trunk: with
    // less, it does not pivot to face something; its head turns instead (the neck would swing into what is beside it)
    // (the same for a goal that lies well round to one side: in a tight spot it backs round toward it, a three-point turn, instead
    // of pivoting the trunk into what is beside it)
    if (g && g.x !== undefined && nav && nav.room > nav.body && this.T.near && !this.attacking && !this._handling()) {
      const err = wrap(bearing(g.x - sim.x, g.z - sim.z) - sim.psi), turnK = g.kind === 'face' ? 0 : Math.abs(err) > 1.2 ? 1 : -1;
      if (turnK >= 0) {
        const mx = sim.x + Math.sin(sim.psi) * 1.2, mz = sim.z + Math.cos(sim.psi) * 1.2, gy = sim.groundY;
        let tight = false; for (const o of this.T.near(mx, mz, nav.room + 0.5)) if ((o.top ?? 99) > gy + 1 && (o.bot ?? -99) < gy + 4 && Math.hypot(o.x - mx, o.z - mz) - o.r < nav.room - 0.3) { tight = true; break; }
        // (hysteresis, NOTES4 / BODY4: this flipped forward <-> back every ~1.5 s while hemmed, the body's speed a second behind each
        //  flip, and it rocked in place 20-60 s. A three-point turn, once begun, backs until the hips have gone ~1 m or 3 s; then it
        //  drives on for at least 2.5 s before it may back again, and the next back-off swings the other way)
        const TP = U.tp || (U.tp = { until: -99, fwdUntil: -99, x: 0, z: 0, steer: 0, lastEnd: -99 });
        if (TP.active) {
          if (this.t >= TP.until || this.attacking || (Math.hypot(sim.x - TP.x, sim.z - TP.z) > 1.0 && this.t > TP.until - 1.5)) {
            // the back-off is over: did it bring the nose round? (backing the wrong way round, the next one steers the other way)
            if (Math.abs(err) > Math.abs(TP.err0) - 0.1) TP.flip = !TP.flip;
            TP.active = false; TP.fwdUntil = this.t + 2.5; TP.lastEnd = this.t;
          }
          else { I.goal = { kind: 'drive', throttle: -0.35, steer: TP.steer }; I.pace = 2; I.freeze = false; U.x = sim.x; U.z = sim.z; U.psi = sim.psi; U.t = this.t; return; }
        }
        if (tight && turnK === 0) { if (!I.look) I.look = { x: g.x, y: this.T.height(g.x, g.z) + 1.5, z: g.z }; I.goal = null; }
        else if (tight && this.t >= TP.fwdUntil) {
          // (the side that brings its nose round toward the goal; tried that way once already with no gain in heading, the other)
          const sd = err > 0 ? 0.6 : -0.6, again = this.t - TP.lastEnd < 10;
          if (!again) { TP.flip = false; TP.n = 0; TP.errFirst = err; }
          TP.n = (TP.n || 0) + 1;
          // a third turn with nothing gained since the first: this is no place to turn round; the way is marked bad and the body
          // plans another from here (a search gives that spot up)
          if (TP.n >= 3 && Math.abs(err) > Math.abs(TP.errFirst) - 0.4) {
            if (nav) { (nav.sore || (nav.sore = [])).push({ x: g.x, z: g.z, r: 4, c: 12, until: this.t + 45 }); sim.path = null; }
            TP.n = 0; TP.lastEnd = -99; this.mem.stuck = { t: this.t, x: sim.x, z: sim.z, n: 1 };
            if (b && ['search', 'roam', 'revisit', 'leave', 'trail', 'investigate', 'sniff'].includes(b.name)) { b.done = true; this.mem.gaveUp = { t: this.t, x: g.x, z: g.z, beh: b.name }; }
            TP.fwdUntil = this.t + 4; return;
          }
          TP.steer = TP.flip ? -sd : sd; TP.err0 = err;
          TP.until = this.t + 3; TP.x = sim.x; TP.z = sim.z; TP.active = true;
          I.goal = { kind: 'drive', throttle: -0.35, steer: TP.steer }; I.pace = 2; U.x = sim.x; U.z = sim.z; U.psi = sim.psi; U.t = this.t; return;
        }
      }
    }
    if (!b || b.gen !== U.gen) { U.gen = b ? b.gen : -1; U.n = 0; if (U.phase) U.phase = null; U.x = sim.x; U.z = sim.z; U.psi = sim.psi; U.t = this.t; }
    if (U.phase === 'back') {
      const moved = Math.hypot(sim.x - U.bx, sim.z - U.bz);
      if (this.t - U.bt < 5 && moved < 2.5 && !this.attacking && !this._handling()) { I.goal = { kind: 'drive', throttle: -0.35, steer: U.steer }; I.pace = 2.5; I.freeze = false; I.noIdle = true; return; }
      // out: the way it was trying is marked as a bad one for a while, and the body plans afresh from here
      U.phase = null; U.x = sim.x; U.z = sim.z; U.psi = sim.psi; U.t = this.t;
      if (nav) { (nav.sore || (nav.sore = [])).push({ x: U.sx, z: U.sz, r: 3.5, c: 12, until: this.t + 45 }); sim.path = null; }
      return;
    }
    const stop = !g ? -1 : g.kind === 'approach' ? g.stop || 0 : g.kind === 'reach' ? this.sp.dims.reachStop : g.kind === 'move' ? 0 : -1;
    const wants = stop >= 0 && Math.hypot(g.x - sim.x, g.z - sim.z) > stop + 3 && !I.freeze && !this.attacking && !this._handling();
    if (!wants || Math.hypot(sim.x - U.x, sim.z - U.z) > 1.5 || Math.abs(wrap(sim.psi - U.psi)) > 0.6) { U.x = sim.x; U.z = sim.z; U.psi = sim.psi; U.t = this.t; return; }
    if (this.t - U.t < 4) return;
    // slow, but nothing holds it: not wedged (a slow start, a slow turn); it keeps going and the window starts again
    if (!this._hemmed()) { U.x = sim.x; U.z = sim.z; U.psi = sim.psi; U.t = this.t; return; }
    U.n++; U.sx = sim.x + Math.sin(sim.psi) * 2; U.sz = sim.z + Math.cos(sim.psi) * 2;
    this.mem.stuck = { t: this.t, x: sim.x, z: sim.z, n: U.n };
    if (U.n >= 3 || (U.n >= 2 && b && !['besiege', 'hunt', 'prowl', 'chase', 'pounce'].includes(b.name))) {
      // the second time on one errand (third, when it is after you): it gives it up
      this.mem.gaveUp = { t: this.t, x: g.x, z: g.z, beh: b ? b.name : null }; if (b) b.done = true; U.n = 0; U.x = sim.x; U.z = sim.z; U.psi = sim.psi; U.t = this.t;
      return;
    }
    // back out, turning the tail toward the side with more room (the planner's cost either side of it, 3 m back)
    const bx = -Math.sin(sim.psi), bz = -Math.cos(sim.psi), lx = Math.cos(sim.psi), lz = -Math.sin(sim.psi);
    const side = nav ? nav.costAt(sim.x + (bx + lx) * 3, sim.z + (bz + lz) * 3) - nav.costAt(sim.x + (bx - lx) * 3, sim.z + (bz - lz) * 3) : 0;
    U.phase = 'back'; U.bt = this.t; U.bx = sim.x; U.bz = sim.z; U.steer = !Number.isFinite(side) ? (side > 0 ? 0.5 : -0.5) : Math.abs(side) < 0.5 ? 0 : side > 0 ? 0.5 : -0.5;
    I.goal = { kind: 'drive', throttle: -0.35, steer: U.steer }; I.pace = 2.5; I.noIdle = true;
  }

  /** Something solid against its body or hemming it in: a collider (anything standing higher than its shins) within its
   *  turning room (nav.room, measured off its own trunk; at least the trunk's half-width + 1 m) of its spine, head to tail tip;
   *  or part of the spine over ground the planner rates no way at all (inside rock or wall, too steep, past the world's edge);
   *  or the head pressed or wedged against something (the body's own feel of it). Without any of these, a body that is slow to
   *  get going is not stuck. */
  _hemmed() {
    const sim = this.sim, nav = sim.nav, T = this.T, gy = sim.groundY, pad = nav ? Math.max(nav.room, nav.body + 1) : 2.6;
    // (the body yields its head itself and reports a jam only once the hips have not advanced for 0.8 s: a light or brief touch of
    //  the head while travelling is not being hemmed; only a jam, or a hard press that lasts, is)
    if ((sim.headJam || 0) > 0.2) return true;
    const pts = []; for (let k = 0; k < sim.spine.length; k += 3) pts.push(sim.spine[k].p); pts.push(sim.spine[sim.spine.length - 1].p); if (sim.head && sim.head.pos) pts.push(sim.head.pos);
    for (const p of pts) {
      if (nav && nav.cost) { nav._fresh(); const [i, j] = nav.cellOf(p.x, p.z), c = nav.cost[i + nav.n * j]; if (c === Infinity) return true; }
      if (T.near) for (const o of T.near(p.x, p.z, pad + 2)) if ((o.top ?? 99) > gy + 0.5 && Math.hypot(o.x - p.x, o.z - p.z) - o.r < pad) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------- voice
  /** Say one short thing now, as itself (a choice at a seize, a knock): one of `texts`, not word for word what it said last
   *  (nor what it used lately), at once, and kept up for `hold` s: nothing else in the stream may replace it before then
   *  (thoughts.js: a news thought may follow `0.8 s` after the last, any other 1.7 s or more). */
  _say(key, texts, hold = 1.6, kind = 'body') {
    const th = this.thinker, t = this.t, used = th.used; if (!th || !texts.length) return null;
    const fresh = texts.filter((x) => t - (used.get(x) ?? -999) > 40 && x !== th.lastText), pool = fresh.length ? fresh : texts.filter((x) => x !== th.lastText), L = pool.length ? pool : texts;
    const out = fresh.length ? L[Math.floor(th.R() * L.length)] : L.slice().sort((a, b) => (used.get(a) ?? -999) - (used.get(b) ?? -999))[0];
    used.set(out, t); th.keyT.set(key, t); th.lastText = out; th.lastEmit = t + Math.max(0, hold - 0.8); th.gap = Math.max(th.gap, hold + 0.2);
    th.queue = th.queue.filter((c) => c.pri >= 0.85 ? false : c.pri > 0.5);
    th.stream.push({ t: +t.toFixed(2), text: out, kind, cond: key, key, about: 'self', focus: 'self', resp: 'focus' }); if (th.stream.length > 24) th.stream.shift();
    return out;
  }
  /** What it is thinking, in its own words: short, blunt, read straight off the live state. Nothing here is decided;
   *  it only says what the belief, the senses, the moods, the behaviour and the gaze already are. */
  _speak() {
    const K = this.know, a = K.target, b = this.beh, sim = this.sim, h = sim.head, c = this.ctx || {}, M = this.mood, t = this.t;
    const st = a && K.seen ? a.state || 'free' : null, nm = b ? b.name : 'pause', ph = b ? b.phase : null, sub = b ? b.sub : null;
    const S = this.T.structures || [], encl = c.enclosed;
    // looking at: whatever the head is actually pointed at, matched against what it knows of
    const cands = [];
    if (K.seen && a) cands.push(['you', st === 'held' ? 'YOU. IN MOUTH.' : 'YOU.', a]);
    if (!K.seen && this.sum.cert > 0.2) cands.push(['belief', 'WHERE YOU MAYBE.', { x: this.sum.x, y: this.T.height(this.sum.x, this.sum.z) + 1.2, z: this.sum.z }]);
    // (an orienting turn: to a sound, or to whatever attention glanced at (attend.js), named as what it turned to)
    const OT = this.orientTo, OK = OT && OT.key ? OT.key.split(':')[0] : null;
    const OL = !OT ? null : OK === 'obj' ? (this.focus && this.focus.kind === 'flare' ? ['light', 'BRIGHT THING.'] : ['food', 'MEAT.']) : OK === 'prey' ? ['prey', 'MEAT ANIMALS.'] : OK === 'you' ? [K.seen ? 'you' : 'belief', K.seen ? 'YOU.' : 'WHERE YOU MAYBE.'] : ['sound', OT.kind === 'shout' ? 'LOUD NOISE.' : 'NOISE.'];
    if (OT && t - OT.t < 4) cands.push([OL[0], OL[1], OT]);
    else if (this.mem.lastNoise && t - this.mem.lastNoise.t < 6) cands.push(['sound', 'NOISE PLACE.', { ...this.mem.lastNoise, y: this.T.height(this.mem.lastNoise.x, this.mem.lastNoise.z) + 1 }]);
    if (this.focus) cands.push([this.focus.kind === 'flare' ? 'light' : 'food', this.focus.kind === 'flare' ? 'BRIGHT THING.' : 'MEAT.', this.focus]);
    if (this.prey) cands.push(['prey', 'MEAT ANIMALS.', this.prey]);
    if (this.thunder && t - this.thunder.t < 8) cands.push(['sky', 'SKY.', { x: this.thunder.x, y: sim.groundY + 40, z: this.thunder.z }]);
    const IL = this.intent && this.intent.look;
    if (sim.injury && IL && b && ['rest', 'tend', 'pull', 'relief'].includes(b.name)) { const f = sim.feet[sim.injury.foot].pos; cands.push(['foot', 'MY FOOT.', { x: f.x, y: f.y + 0.35, z: f.z }]); }
    if (b && b.name === 'pet' && b.hand) cands.push(['hand', 'SMALL THING HAND.', b.hand]);
    if (IL && b) { const k = { listen: ['sound', 'WHERE NOISE WAS.'], stare: ['belief', 'WHERE YOU MAYBE.'], ambush: ['belief', 'WHERE YOU MAYBE.'], search: ['belief', 'BEHIND THAT.'], investigate: ['light', 'BRIGHT THING.'], feed: ['food', 'MEAT.'], hunt: ['prey', 'MEAT ANIMAL.'], answer: ['sky', 'SKY.'], besiege: ['hole', 'HOLE.'], leave: ['you', 'YOU.'], lurk: ['belief', 'WHERE YOU COME.'] }[b.name]; if (k && !(k[0] === 'sound' && K.seen && b.reason === 'sight')) cands.push([k[0], k[1], IL]); }
    let look = null, lw = 'NOTHING.', best = 9;
    for (const [k, w, p] of cands) {
      const dx = p.x - h.pos.x, dy = (p.y ?? h.pos.y) - h.pos.y - (k === 'you' ? 0.5 : 0), dz = p.z - h.pos.z, d = Math.hypot(dx, dy, dz) || 1, ang = Math.acos(clamp((dx * h.f.x + dy * h.f.y + dz * h.f.z) / d, -1, 1));
      const tol = 0.42 + Math.atan(1.3 / d);      // something big and close fills more of the view
      if (ang < tol && ang - tol < best) { best = ang - tol; look = k; lw = w; }
    }
    if (!look) {
      if (h.f.y > 0.42) { look = 'sky'; lw = 'SKY.'; }
      else if (h.f.y < -0.55) { look = 'ground'; lw = 'GROUND.'; }
      else if (Math.abs(sim.v) > 0.6 && (sim.att.kind === 'path' || sim.att.kind === 'goal')) { look = 'path'; lw = 'WHERE GOING.'; }
      else { look = 'around'; lw = 'NOTHING. LOOK AROUND.'; }
    }
    // think: the newest thought of the stream (thoughts.js), held for a few seconds, then nothing until the next
    const TS = this.thinker.stream, last = TS[TS.length - 1];
    const think = this.peril.quiet ? '' : last && t - last.t < (K.seen || M.arousal > 0.3 ? 6 : 8) ? last.text : '';
    // want: what the behaviour is for
    const mot = b && b.motive;
    const W = { roam: 'WALK.', pause: M.boredom > 0.6 ? 'NOTHING.' : 'REST.', listen: 'HEAR IT AGAIN.', sniff: 'SMELL IT.', search: 'FIND IT.', stare: 'SEE IT MOVE.', ambush: 'IT COME OUT.', leave: 'GO AWAY FROM HERE.', watch: 'SEE WHAT IT DO.', stalk: 'GET CLOSE. NOT SEEN.', circle: 'SEE OTHER SIDE.', inspect: 'SMELL IT.', display: 'IT GO AWAY.', bluff: 'SCARE IT.', chase: 'CATCH IT.', snap: 'IT BACK OFF.', feign: 'TRICK IT.', backoff: 'SPACE.', nudge: 'KNOW WHAT IT IS.', revisit: 'SEE IF IT BACK.', besiege: 'GET IN.', investigate: 'KNOW BRIGHT THING.', trail: 'FIND MEAT.', feed: sub === 'guard' ? 'MY MEAT. NOT YOURS.' : 'EAT.', hunt: 'EAT ONE.', answer: 'BE LOUDER THAN SKY.', appraise: 'KNOW IF FOOD.', test: 'SEE IF IT RUN.', shadow: 'FOLLOW. NOT SEEN.', lurk: 'IT COME HERE.', prowl: 'EAT IT.', avoid: 'KEEP AWAY FROM IT.' };
    Object.assign(W, { greet: 'SMELL SMALL THING.', follow: 'GO WHERE IT GO.', rest: this.pain > 0.3 ? 'REST FOOT.' : 'REST.', tend: 'FOOT STOP HURT.', pet: b && b.permit ? 'MORE.' : 'NOT TOUCH ME.', pull: b && b.verdict === 'refuse' ? 'NOT TOUCH FOOT.' : 'FOOT STOP HURT.', relief: 'KNOW SMALL THING.' });
    let want = W[nm] || 'REST.';
    if (ATTACKS.includes(nm)) want = mot === 'anger' ? (this.wrongs.stones > 0 && this.lastWrong && this.lastWrong.kind === 'stones' ? 'MAKE IT STOP THROW.' : 'HURT SMALL THING.') : mot === 'prey' ? (st === 'held' && a.still > 2 ? 'EAT IT? NOT SURE.' : 'EAT IT.') : 'PLAY WITH IT.';
    if (b && b.bored) want = 'SOMETHING ELSE.';
    if (nm === 'leave' && this.log[1] && ATTACKS.includes(this.log[1].name)) want = 'SOMETHING ELSE. NOT FUN.';
    // doing: the phase of it, as it is right now
    const hold = { kill: 'BITE DOWN!', lift: 'HOLD. LIFT UP.', carry: 'CARRY IT.', worry: 'SHAKE IT!', toss: 'THROW IT!', drop: 'DROP IT.', hold: 'HOLD. FEEL IT.' };
    const D = {
      roam: 'WALK.', pause: 'STAND.', listen: 'FREEZE. LISTEN.', sniff: 'SNIFF AIR.', search: 'GO LOOK.', stare: 'STARE.', ambush: 'NOT MOVE. WAIT.', leave: 'WALK AWAY.',
      watch: 'WATCH.', stalk: b && b.creep && c.watched ? 'STOP. IT LOOK.' : 'CREEP.', circle: 'GO ROUND.', inspect: c.d < 10 ? 'SNIFF IT.' : 'GO CLOSER.', display: 'SHOW BIG. GROWL.', bluff: ph === 'charge' ? 'RUN AT IT!' : 'STOP. STARE.', chase: 'RUN!', snap: 'BITE AIR.',
      feign: ph === 'away' ? 'TURN AWAY. PRETEND.' : ph === 'wait' ? 'LISTEN BEHIND.' : 'SPIN ROUND!', backoff: 'STEP BACK.', nudge: ph === 'close' ? 'PUSH WITH NOSE.' : 'WAIT. SEE.', revisit: 'GO BACK THERE.',
      besiege: ph === 'probe' ? ({ shove: 'PUSH HEAD IN.', peer: 'LOOK IN. ONE EYE.', snort: 'SNORT IN HOLE.', shift: 'MOVE FEET.', still: 'STILL. LISTEN.', snap: 'BITE IN HOLE.' }[sub] || 'PUSH HEAD IN.') : ph === 'wait' ? 'WAIT BY HOLE.' : 'GO TO HOLE.',
      investigate: { go: 'GO TO BRIGHT THING.', look: 'STARE AT IT.', sniff: 'SNIFF IT.', recoil: 'HOT! PULL BACK.', stomp: 'STAMP ON IT.' }[ph] || 'WALK AWAY.', trail: 'FOLLOW SMELL.', feed: ph === 'go' ? 'GO TO MEAT.' : sub === 'guard' ? 'GROWL. GUARD.' : sub === 'scan' ? 'CHEW. LOOK ROUND.' : sub === 'tear' ? 'BITE. PULL.' : sub === 'gulp' ? 'SWALLOW.' : 'EAT.',
      hunt: ph === 'stalk' ? 'CREEP UP.' : 'RUN IN!', answer: 'ROAR AT SKY.',
      appraise: b && b.circle && b.t > 2.5 ? 'GO ROUND. SLOW.' : 'STARE. STILL.', test: ph === 'rush' ? 'LUNGE!' : 'STOP. WATCH IT.', shadow: c.watched ? 'FREEZE.' : 'FOLLOW. QUIET.', lurk: ph === 'go' ? 'GO THERE. QUIET.' : 'WAIT. NOT MOVE.',
      prowl: ph === 'stalk' ? (c.watched ? 'FREEZE.' : 'CREEP. LOW.') : 'RUN IN!', avoid: c.d < 11 ? 'STEP BACK.' : 'GO AWAY. LOOK BACK.',
      butt: ph === 'close' ? 'GO AT IT. HEAD DOWN.' : ph === 'strike' ? 'HIT WITH HEAD!' : b && b.landed ? 'IT FALL. GOOD.' : 'MISS.',
      swipe: ph === 'set' ? 'LOOK BACK.' : ph === 'swing' ? 'SWING TAIL!' : b && b.landed ? 'IT FALL. GOOD.' : 'MISS.',
      pin: ph === 'close' ? 'STEP ON IT.' : ph === 'hold' ? (a && a.struggle > 0.3 ? 'PRESS DOWN.' : 'STAND ON IT.') : ph === 'off' ? 'LIFT FOOT.' : 'IT GET OUT.',
      seize: ph === 'close' ? 'GO BITE.' : ph === 'strike' ? 'GRAB!' : ph === 'hold' ? (sub === 'taste' ? 'TASTE IT.' : hold[sub] || 'HOLD.') : b && b.missed ? 'MISS.' : 'LOOK AT IT.',
      toy: ph === 'close' ? 'GO SNIFF IT.' : ph === 'nose' ? 'SNIFF IT. HUFF.' : ph === 'pick' ? 'POKE IT.' : 'WAIT. IT MOVE?',
      greet: b && b.at !== undefined ? 'SNIFF IT. SLOW.' : 'WALK TO IT.', follow: a && a.speed > 0.6 ? 'FOLLOW.' : 'STOP. WAIT.',
      rest: sim.lie.phase === 'down' ? 'LIE DOWN.' : sim.lie.phase === 'up' ? 'GET UP. HARD.' : b && b.dozing ? 'EYES SHUT.' : b && b.tending !== undefined && b.t - b.tending < 4.5 ? 'LICK FOOT.' : K.seen ? 'LIE. WATCH.' : 'LIE.',
      tend: sim.lying ? 'LICK FOOT.' : 'HOLD FOOT UP.',
      pet: b && b.permit ? (this.touch ? 'LEAN IN. RUMBLE.' : 'WAIT.') : b && b.snapped ? 'BITE AIR.' : 'PULL BACK. GROWL.',
      pull: b && b.verdict === 'refuse' ? (b.snapped ? 'BITE AIR.' : 'PULL FOOT AWAY.') : b && b.warnT !== undefined ? 'GROWL. STOP.' : 'LET IT. BREATHE.',
      relief: ph === 'look' ? 'STARE.' : ph === 'try' ? 'STAND ON FOOT.' : 'GET UP.',
    };
    const doing = D[nm] || 'STAND.';
    if (ATTACKS.includes(nm) && mot === 'prey' && sub === 'taste') want = 'KNOW IF FOOD.';
    if (ATTACKS.includes(nm) && mot === 'prey' && b.spat) want = 'NOT FOOD. SPIT.';
    const v = this.voice, nv = { think, want: 'WANT: ' + want, doing, lookingAt: lw, look };
    v.stance = this.stance; v.verdict = this.ap.verdict;      // what you are to it (appraise.js), for readouts
    // for the thought bubble: whether it is aware of you and how (sight; heard/smelt close by; just lost), whether its eyes are
    // on you right now, how far it takes you to be and how sure it is of where you are
    const tg = K.target, bd = K.seen && tg ? Math.hypot(tg.x - h.pos.x, tg.z - h.pos.z) : this.sum.cert > 0.15 ? Math.hypot(this.sum.x - h.pos.x, this.sum.z - h.pos.z) : null;
    v.aware = { seen: !!K.seen, via: K.seen ? K.via || 'sight' : this.mem.steps && t - this.mem.steps.t < 3 ? 'sound' : this.scent > 0.08 ? 'smell' : null, looking: look === 'you', d: bd === null ? null : +bd.toFixed(1), sure: K.seen ? (K.via === 'sight' ? 1 : K.via === 'near' ? 0.7 : 0.5) : +clamp(this.sum.cert, 0, 1).toFixed(2), gait: K.gait || null, hunting: this.stance === 'predatory' };
    if (nv.think !== v.think || nv.want !== v.want || nv.doing !== v.doing || nv.lookingAt !== v.lookingAt) { Object.assign(v, nv); v.at = t || 1e-6; }
  }
}
