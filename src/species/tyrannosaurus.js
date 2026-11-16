// Species profile: everything that makes this animal this animal, as data the engine reads.
// The motion engine (sim/rex.js), the mind (sim/mind.js), route planning (sim/nav.js) and the
// skin builder (view/rexgeo.js) take their anatomy, gait, mass, senses and temperament from
// here. A second species is a second profile (and, for a quadruped, a second leg set in `legs`).
import { lerp, sstep } from '../math.js';

export const TYRANNOSAURUS = {
  name: 'Tyrannosaurus rex, adult',
  // skeleton (metres)
  dims: {
    hipHeight: 3.26, hipHalf: 0.41,      // hip joint standing (m; legs nearly straight: hip-ankle 0.97 of the leg's reach); hip sockets 0.82 m apart (0.72 hid one leg behind the other from the front)
    hipMove: 0.09,           // the hips ride this much lower once it moves: the stance leg sweeps through an arc (walking target 3.17)
    // an adult's leg: the shank shorter than the thigh (tibia/femur ~0.9) and a short metatarsus (~0.56 of the femur), carried
    // straighter (was femur 1.28, tibia 1.42, meta 0.92, hip 3.12: a juvenile's long shank)
    femur: 1.42, tibia: 1.3, meta: 0.8, toe: 0.78,      // toe: digit III, MTP joint to claw tip (= foot.toes[1])
    backN: 5, backLen: 2.6, neckN: 7, neckLen: 1.75,      // backLen: pelvis to chest joint (2.85 made the trunk ~15% long against the legs; see out/skel/PROPORTIONS.md)
    // the head: the skin's skull is designed at 1.94 m (premaxilla to the back of the skull, skin) and drawn at `headScale`
    // (1.75 m, 0.137 of the length: Sue's skull is 1.39-1.53 m on a 12.3-12.8 m animal, 0.11-0.12; we lean to the film's big
    // head, and 0.84 (0.127) made the besieging neck push into gaps: out/skel/PROPORTIONS.md).
    // headLen (skull pivot to snout, the sim's reach) follows it: 1.75 at the design size
    headScale: 0.9, headLen: 1.58,
    tailN: 12, tailLen: 6.2,      // (6.6 with the 2.85 m back; the tail is ~0.56 of the length, Sue 12.3 m overall)
    reachStop: 4.33,         // hips stop this far from a point the snout must reach (4.75 with the 1.75 m head and 2.85 m back; less 0.17 head and 0.25 back)
    walk: 2.2, run: 8.0, sprint: 12.0,
  },
  // the reserve for a long run (sim/rex.js): a run at `dims.run` empties it in `full` s (faster above it; nothing below
  // sqrt(free) of run speed), and it refills over `recover` s at a walk or standing. A committed chase turns at up to `turn`
  // rad/s and holds `turnAcc` m/s^2 of turn at speed; it brakes for a moving goal no earlier than `brake` m/s^2 would need
  stamina: { full: 50, free: 0.12, recover: 35, restV: 3, turn: 1.1, turnAcc: 4.5, brake: 6 },
  // the legs that carry it: a biped, so two hind legs off the pelvis that alternate
  legs: [{ side: 1, girdle: 'pelvis' }, { side: -1, girdle: 'pelvis' }],
  support: 'alternate',      // biped rule: lift one only when the other is down (except a sprint's flight phase)
  navBody: null,            // route planning: null = measured off the body (nav.bodyRoom: the trunk's half-width is the hard limit, its turning room a cost); a number forces one fixed radius
  // gait as a function of speed (m/s)
  gait: {
    stepLen: (v) => Math.min(1.05 + 0.42 * v, 3.75) + 0.12 * Math.max(0, v - 6.4),   // hip travel per step
    duty: (v) => lerp(0.68, 0.53, sstep(2.5, 7.5, v)) - 0.11 * sstep(8.5, 12, v),     // stance fraction; under 0.5 both feet leave the ground
    track: (v) => lerp(0.44, 0.19, sstep(0.05, 1.1, v)) - 0.07 * sstep(3, 8, v),        // half trackway width: a narrow track, prints near the midline
  },
  // how the hips, back and tail take part in walking and turning (engine defaults in sim/rex.js HIPS_DEFAULT)
  hips: {
    pelvisHold: 0.92, pelvisLag: 0.35, pelvisCatch: 9,
    lungeSide: 0.35,        // (T12) a snap, seize or butt drives the hips 35% as hard sideways as along the heading (a full side lunge splayed the legs: stance 1.6 m)
    lungeSideStrike: 1,     // the killing strike keeps its full side drive (strikepass timing; see test/lunge.mjs)
    hipRot: 0.4, hipAbd: [-0.15, 0.35], kneeFollow: [0.3, 0.95],
    backYawMax: 0.85, backEven: 1, backGaze: [0.55, 0.75], tailInertia: 0.6, tailRootMax: 0.3,
    reorient: { cone: 0.8, coneT: 0.6, snap: 1.25, done: 0.35 },
    footGap: { midline: 0.24 }, footprint: { heel: 0.5, toe: 0.55, r: 0.24, fan: { a0: 0.35, a1: 0.62, r: 0.36 } }, swingClear: 0.5,
    sway: [0.5, 0.2], list: 0.055, listLoad: 0.02, listWn: 14, nod: 0.026,
    kneeOut: 0.3,            // lateral lean of the knee plane: the knees stand out from the hips, so from the front two legs read as an A over a narrow track (0.1 was the engine's old constant, 0.2 the hips pass)
  },
  // the foot: three weight-bearing toes (II, III, IV) that grip, spread under load and peel off the ground one joint at a time
  foot: {
    toes: [0.62, 0.78, 0.62], split: 0.5,      // digit lengths MTP joint to claw tip (m), the proximal phalanx' share
    flesh: 1.15,                               // skin: width of the toes and pads against the old placeholder
    pad: 0.06,                                 // bone axis above the ground under a flat, loaded toe (m)
    heelRise: { start: 0.4, walk: 0.82, slow: 0.68, run: 0.6 },   // stance fraction where the heel starts up; heel rise (rad) at lift-off: walking, slow, running
    peel: 0.32,                                // the proximal phalanges lead: the distal ones only start up this much (rad) later; II and IV go before III
    splay: { free: 0.28, loaded: 0.57, roll: 0.45, min: 0.24 },   // half splay (rad): unloaded, under full load at mid-stance, and the share it closes in roll-off
    // min: the most closed the fan ever gets (curled in the air, rolling off, beside the other foot). The skin's outer digits
    // (half width ~0.117 m) and the middle one (~0.131 m) stand ~0.1 m apart at their bases (view FOOTSKIN x flesh), so the
    // outer toe (0.62 m) clears the middle one's flesh at the claw only with 0.1 + 0.62 sin(a) >= 0.25: a >= 0.24 rad.
    // (It went to 0.05 in a swing: the outer toes folded over the middle one.)
    conform: { prox: [-0.45, 0.45], dist: [-0.55, 0.6] },   // each toe's two joints follow the ground under it within these (rad, + curls down)
    tiltMax: 0.45, tiltRoll: 0.12,             // the foot plane follows the ground's mean slope under it up to this (rad), but rolls (about its length) only this far; the toes take the rest
  },
  // the neck's sideways range (rad, seen from above; out/skel/BODY4.md). A big theropod's neck bends little to the side: the
  // ten cervicals' facets allow a few degrees each, so the neck is one smooth C (never an S) of at most `latTotal` from the
  // shoulders to the skull, no joint more than `latJoint` (the sim's seven joints each stand for about one and a half
  // vertebrae); the skull turns on the atlas a further `skullSame` the same way as the neck's curve, but against it only
  // `skullOpp`. A head aim past that is the trunk's and the feet's to give. `latTau`: the curve's low-pass (s), so it cannot writhe.
  neck: { latJoint: 0.11, latTotal: 0.6, skullSame: 0.36, skullOpp: 0.1, latTau: 0.07, latRate: 1.6 },
  // where it is going (T1; owner: "natural behavior would be to expect its head to go around the corner as soon as its able"): at a
  // trot or faster, with nothing else claiming the head (no look, no attention, no gesture, not reeling from a blow), the head leads
  // the body to where it is heading: into a turn `turnLead` s ahead of the body, and at the goal as soon as the straight way to it is
  // clear (before that, at the furthest bend or edge of the route it can see, and `peek` of the way on from there toward the goal). Off the body axis by at most `maxYaw` rad (`sprintYaw` flat out,
  // the neck is balance then), eased over `ease` s, turned at up to `rate` rad/s and `acc` rad/s^2; `roll` rad of head bank into the turn at full turn rate.
  gazeLead: { minSpeed: 3.5, fullSpeed: 5.5, start: 0.7, peek: 0.1, turnLead: 0.5, maxYaw: 0.6, sprintYaw: 0.45, ease: 0.18, rate: 2.2, acc: 9, pad: 0.5, roll: 0.07, after: 2.0 },
  // running into things (sim/rex.js _crash). A head-on knock closing faster than `reelFrom` m/s makes it reel (head thrown back,
  // a drop on bent legs), fully from `reelFull`: it then backs off at `reelBack` m/s (least, most) and, from a reel of `shakeFrom`
  // (0..1), shakes its head. `stumble` scales the lurch of a glancing or corner hit at a run.
  crash: { reelFrom: 2.5, reelFull: 6.5, reelBack: [0.4, 0.9], shakeFrom: 0.35, stumble: 1,
    // body blow (glancing / corner), scaled by gl 0..1: t2 s = rebound after the blow (roll over-corrects by `over` rad, head tilt `headBack`, head thrown off the wall `headAway` m/s, tail `tail`, sway `swayBack`, catch step `catchIn` s on); a hard one (gl > gatherFrom) snorts from t3 s
    blow: { t2: 0.2, over: 0.45, rollKick: 1.2, headBack: 6, headAway: 1.6, tail: 0.9, swayBack: 0.9, catchIn: 0.12, gatherFrom: 0.5, t3: 0.6 } },
  // relative masses for balance (the centre of mass is kept over the feet)
  mass: { head: 0.5, neck: 0.35, torso: 4.6, tail: 1.4, torsoF: 1.15 },
  // senses
  senses: {
    sharp: 0.45, mid: 1.1, field: 2.1,         // half-angles (rad): binocular ahead, good to the side, blind behind the head
    sightScale: 55,                            // distance (m) at which picking out a person has fallen to half (keen, forward-facing eyes)
    motionCue: 0.3,                            // movement draws the eye a little more, as for any animal; stillness is not invisibility
    nearField: 7.5,                            // within this, it smells and hears you whatever its eyes are doing
    hearing: 190,                              // metres a loudness-1 sound carries
    smell: 85,                                 // metres downwind it can scent you
  },
  // temperament is drawn per animal from these ranges
  temper: { bold: [0.35, 0.85], patience: [0.35, 0.9], curious: [0.45, 0.95], irritable: [0.25, 0.75], nervy: [0.25, 0.75] },
  // standing distances (hips to a person, m), set by how far the neck and head reach forward
  // the mind: how it commits to a goal and what reads to it as prey (engine defaults and the meaning of each: sim/mind.js MIND_DEFAULT)
  mind: {
    commit: { hold: 0.6, bore: 25, sameTarget: 0.5, fixHold: 0.9, progressD: 1.5, breakSal: 0.5 },
    prey: { quick: 0.6, dart: 0.11, bob: 0.015, bobH: 0.3, flee: 0.22, vanish: 0.16, vanishD: 40, slowHide: 0.5, prime: 4, peek: 0.1, small: 0.7, calmT: 20, goneT: 60, on: 0.45, off: 0.25,
      reflexW: 0.7, absorb: 0.5, pull: 0.9, rushD: 13, setT: [1.0, 1.8], rushK: 0.7, holdD: 3, calmGrace: 1.5, hungerGo: 0.6, hungerLead: 8, leadT: 8, boltD: 8, boltLock: 0.25, boltStrike: 2.5,
      leaveRise: 3, leaveT: 25, leaveDamp: 0.6 },
    // a chase: given up only when it has been losing ground flat out for a while, or the gap is huge (not on a short timer)
    chase: { losingAfter: 4, flat: 0.85, giveUp: 3, lostD: 60, maxT: 45, boltD: 40 },
    // the pressure to strike: its slow causes climb at most `rise` (shares of its fuse per s); a thing leaving at a walk takes `leave` off
    peril: { rise: 0.05, leave: 0.45 },
    // the core (out/platform/CORE.md; meanings in sim/mind.js MIND_DEFAULT.core): food from a first clear look, curiosity that keeps
    // the thing alive while it lasts, the body's questions (sniff, nudge, shove, foot, the slow reach), the opening of a look away
    core: { on: true, claimLook: 2.5, claim: 0.75, first: 0.75, fill: 0.5, habGain: 0.65, habT: 150, habHold: 30, drainT: 90, drainFar: 200, surprise: 0.2,
      curPeril: 1.2, want: 1.1, hunt: 0.8, damp: 0.3, paceU: 2.3, paceG: 1.5, paceW: 0.55, paceFar: 1.5, farD: [8, 20], lookT: 2, glanceT: 1.2, hungryPace: 1.6, inspectD: 6.2,
      rungs: [0.3, 0.48, 0.64, 0.8], pause: [2.5, 4.5], shoveF: 0.2, fed: 0.4, reachT: [3.5, 5], reachFrom: 30, reachPace: 0.9,
      unwRise: 1.6, teeth: 0.2, balkKeep: 0.45, balkHold: 20, balkT: 240, immune: 1 },
  },
  spacing: { personal: 8.6, inspect: [7.8, 9.2], nudge: 6.6, chase: 7.0, bluff: [8, 10.5], stalk: [10, 15] },      // (kept with the 0.42 m shorter reach: standing 0.4 m nearer made gaze worse; see out/skel/PROPORTIONS.md)
};
