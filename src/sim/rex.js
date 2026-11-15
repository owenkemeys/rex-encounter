// Tyrannosaurus motion simulation.
//
// Design: the animal is driven from its intent outward, not from a root at the centre
// of mass with the head corrected afterwards.
//   1. Attention picks a subject; the gaze holds a world-space fixation and re-fixates.
//   2. The head (the sensors and the jaws) has its own world-space goal and dynamics.
//   3. The body is recruited to make that goal comfortable: torso twist and pitch first,
//      then turning on the spot, then travel. A travel goal means "bring the snout here".
//   4. A momentum-limited mass point (speed, yaw rate, jerk-limited) carries the hips.
//   5. Feet step when the body has moved far enough off them, and the pelvis is then
//      posed FROM the feet (height, sway, roll, counter-rotation).
//   6. Neck and tail are solved last: the neck spans chest to the head goal, the tail is
//      a damped chain that lags and counter-swings.
//
// The simulation is a pure fixed-step function of (state, intent, terrain). It owns a
// seeded RNG, touches no globals, no renderer, no clock. Consequences (footfalls) leave
// as events; the view decides what they look and sound like.

import { Vector3 } from 'three';
import { clamp, lerp, sstep, wrap, expK, Spring, makeRng, bearing } from '../math.js';
import { Nav } from './nav.js';

import { TYRANNOSAURUS } from '../species/tyrannosaurus.js';
// joint layouts below are derived from the default species; a second species needs its own layout
export const DIM = TYRANNOSAURUS.dims;

// spine joints: 0..12 tail (0 = tip, 12 = tail base), 13 pelvis, 14..18 back (18 = chest), 19..25 neck (25 = skull pivot)
// skull heading off the chest's (rad): what it aims for, and the hard limit. BODY4: no more than the neck's sideways C and the
// skull's own turn on it can give (species neck: 0.6 + 0.36); was 1.5 / 1.62, which only an S-bent neck could reach
const YAW_GAZE = (TYRANNOSAURUS.neck ? TYRANNOSAURUS.neck.latTotal + TYRANNOSAURUS.neck.skullSame : 1.5), YAW_MAX = YAW_GAZE + 0.06;
export const IDX = { TAIL_BASE: 12, PELVIS: 13, CHEST: 18, NECK0: 19, HEAD: 25 };
export const SPINE_N = 26;
// the neck's rise off the chest's forward line, and the share of it (and of the root turn) taken by each of the first joints
export const NECK_RISE = Math.atan2(0.69, 0.72), NECK_ROOT = [0.45, 0.33, 0.22];
// the pose's own spread of the neck's rise off the shoulders (the skin's bind pose keeps NECK_ROOT): over the first four joints, easing
// out, so the rise is a curve along the neck rather than a turn up straight off the shoulders (out/skel/BODYFIX2.md, SKIN3.md)
const NECK_SPREAD = [0.3, 0.27, 0.22, 0.14, 0.07];
// the neck's shape (BODYFIX3): the head is carried forward of the chest on a neck held out near its length, and the rise is shared
// out along it. hf/hu: head pivot forward of / above the neck's root (chest joint) standing, and what running (R), stalking (S) and
// alertness (A) add; etip: how far the neck's last segment comes into the skull from below its line (rad; etipS added stalking:
// the neck comes down into a low head); str: the chain is never pulled straighter than this share of its length; mx: the head's
// hard reach; restS: stalking, the root's preferred rise is taken out (the first joints stay near level, the fall comes later)
// the neck's sideways range from the species (BODY4): the bend of joint k (0 = root .. N-1) of a neck of N joints, for shape x
const NL = TYRANNOSAURUS.neck || { latJoint: 0.11, latTotal: 0.6, skullSame: 0.36, skullOpp: 0.1, latTau: 0.07, latRate: 1.6 };
const NL_G = 0.7;      // how far the sideways share may lean toward the shoulders or the skull (|x[4]|; 1 would zero one end)
const neckLat = (x, k, N) => x[1] * (1 + clamp(x[4], -NL_G, NL_G) * (2 * k / (N - 1) - 1)) / N;
// the most the whole sideways turn may be with the share leaning g: the total cap, and no joint past its own
const neckLatMax = (g) => Math.min(NL.latTotal, NL.latJoint * DIM.neckN / (1 + Math.min(NL_G, Math.abs(g))));
const NK = { hf: 1.55, hu: 0.55, hfR: 0.08, huR: -0.4, hfS: 0, huS: -0.75, hfA: -0.15, huA: 0.3, etip: 0.08, etipS: -0.25, str: 0.94, mx: 0.955, restS: 1 };
// Pose layout: flat vec3 slots so two poses can be blended (or sent) as plain numbers.
export const PV = { SP: 0, SU: 26, HEAD_P: 52, HEAD_F: 53, HEAD_U: 54, LEG: 55, ARM: 67, COUNT: 73 };
export const LEG = { HIP: 0, KNEE: 1, ANKLE: 2, MTP: 3, TOE_F: 4, TOE_U: 5, SIZE: 6 };
export const PS = { JAW: 0, BREATH: 1, LOAD: 2, PLANTED: 4, BLINK: 6, TOE: 7, SPREAD: 19, LID: 21, LIE: 22, SQUINT: 23, COUNT: 24 };     // TOE: per foot, 3 proximal then 3 distal flexions; LID: eyelids drooping (0 open .. 1 shut, contentment); LIE: lying down (0 standing .. 1 on its belly); SQUINT: eyes screwed up against a light (0 open .. 1 squeezed nearly shut)

export const gait = TYRANNOSAURUS.gait;

const UP = new Vector3(0, 1, 0);
const RMAX = (DIM.femur + DIM.tibia) * 0.985;
// gestures nothing else may cut short: a bellow, and every movement that strikes or holds
const STRIKES = new Set(['roar', 'snap', 'butt', 'seize', 'worry', 'toss', 'swipe', 'strike']);
// lying down: keyframes [u, s] for how far down it is (0 standing .. 1 on its belly) and [u, lean] for the forward lean that
// puts the weight over the feet; a get-up that fails once (an injured leg) has its own
const LIE_K = {
  down: { s: [[0, 0], [0.2, 0.1], [0.78, 0.88], [1, 1]], lean: [[0, 0], [0.15, 0.35], [0.7, 0.25], [1, 0]] },
  up: { s: [[0, 1], [0.3, 0.97], [0.72, 0.12], [1, 0]], lean: [[0, 0], [0.3, 1], [0.62, 0.65], [0.86, 0.1], [1, 0]] },
  upFail: { s: [[0, 1], [0.18, 0.97], [0.32, 0.6], [0.4, 0.64], [0.5, 0.95], [0.62, 0.97], [0.83, 0.12], [1, 0]], lean: [[0, 0], [0.18, 1], [0.34, 0.8], [0.45, 0.3], [0.55, 0.25], [0.66, 1], [0.86, 0.3], [1, 0]] },
};
const keyAt = (K, u) => { if (u <= K[0][0]) return K[0][1]; for (let i = 1; i < K.length; i++) if (u <= K[i][0]) { const [a, va] = K[i - 1], [b, vb] = K[i], w = sstep(0, 1, (u - a) / (b - a)); return va + (vb - va) * w; } return K[K.length - 1][1]; };
// least distance between two segments in the ground plane (a0-a1, b0-b1)
function segGap(ax, az, bx, bz, cx, cz, dx, dz) {
  const pt = (px, pz, x0, z0, x1, z1) => { const ex = x1 - x0, ez = z1 - z0, l2 = ex * ex + ez * ez, u = l2 > 0 ? clamp(((px - x0) * ex + (pz - z0) * ez) / l2, 0, 1) : 0; return Math.hypot(px - x0 - ex * u, pz - z0 - ez * u); };
  const o = (px, pz, qx, qz, rx, rz) => Math.sign((qx - px) * (rz - pz) - (qz - pz) * (rx - px));
  if (o(ax, az, bx, bz, cx, cz) * o(ax, az, bx, bz, dx, dz) < 0 && o(cx, cz, dx, dz, ax, az) * o(cx, cz, dx, dz, bx, bz) < 0) return 0;
  return Math.min(pt(ax, az, cx, cz, dx, dz), pt(bx, bz, cx, cz, dx, dz), pt(cx, cz, ax, az, bx, bz), pt(dx, dz, ax, az, bx, bz));
}
const LIE_H = 1.08;      // hip joint above the ground when lying on its belly
// the reserve for a long run and the turning of a committed chase (species `stamina` overrides; see species/tyrannosaurus.js)
const STAM_DEFAULT = { full: 50, free: 0.12, recover: 35, restV: 3, turn: 1.1, turnAcc: 4.5, brake: 6 };
const STAM = { ...STAM_DEFAULT, ...(TYRANNOSAURUS.stamina || {}) };
// how the hips, back and tail take part in walking and turning; a species overrides any of these in `species.hips`
export const HIPS_DEFAULT = {
  pelvisHold: 0.8,          // in single support the stance foot holds the pelvis against this share of the body's turn
  pelvisLag: 0.35,          // most the pelvis may trail the body heading (rad): the stance hip's rotation range takes it
  pelvisCatch: 9,           // stiffness (rad/s) with which the pelvis catches up when both feet are down
  hipRot: 0.4,              // hip long-axis rotation either way (rad)
  hipAbd: [-0.15, 0.35],    // hip abduction range (rad, + outward); measured, not enforced
  kneeFollow: [0.3, 0.7],   // share of the hip-to-foot yaw taken by the knee plane: swinging, loaded
  backYawMax: 0.85,         // lateral bend pelvis to chest (rad)
  backGaze: [0.42, 0.6],    // share of the gaze's yaw off the body the back bends toward it, and the most it gives
  lumbar: 0.4,              // the pelvis' own turn is taken out over this first share of the back, so the chest does not swing with its steps
  backEven: 0,              // 0: the bend gathers toward the shoulders; 1: spread evenly along the back (a C)
  tailInertia: 0.6,         // the tail root's share of the pelvis' turning acceleration it resists
  tailRootMax: 0.3,         // most the tail root lags or swings off the pelvis' line (rad)
  reorient: { cone: 0.9, coneT: 0.9, snap: 1.5, done: 0.14 },     // standing body turn to what it watches (rad, s)
  footGap: { midline: 0.6 },      // least lateral gap between the foot centres, whatever else: a landing foot keeps to its own side
  footprint: { heel: 0.45, toe: 0.55, r: 0 },      // a foot's print for the overlap rule: heel and toe reach from the landing point (m), half-width
  swingClear: 0.62,         // a swinging foot is carried this far out past the standing one
  sway: [0.62, 0.25],       // share of the support's lateral offset the hips sway over: slow, walking
  list: 0, listWn: 5.5,     // pelvic list in phase with the swing (rad, swing side down) and its spring
  listLoad: 0.075,          // list from the difference in load between the feet (rad per unit; it lags the stride)
  nod: 0,                   // pelvic pitch nod per step (rad, nose down at touchdown)
  kneeOut: 0.1,             // lateral lean of the knee plane (the knees stand out from the hips)
};
// the foot; a species overrides any of these in `species.foot` (see species/tyrannosaurus.js for what each means)
export const FOOT_DEFAULT = {
  toes: [0.56, 0.7, 0.56], split: 0.5, flesh: 1, pad: 0.06,
  heelRise: { start: 0.45, walk: 0.6, slow: 0.45, run: 0.5 }, peel: 0.3,
  splay: { free: 0.22, loaded: 0.4, roll: 0.4 },
  conform: { prox: [-0.4, 0.4], dist: [-0.5, 0.55] }, tiltMax: 0.45, tiltRoll: 0.12,
};

function basis(yaw, pitch, roll, f, l, u) {
  const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
  const sr = Math.sin(roll), cr = Math.cos(roll);
  const ux = -sy * sp, uy = cp, uz = -cy * sp;
  f.set(sy * cp, sp, cy * cp);
  l.set(cy * cr - ux * sr, -uy * sr, -sy * cr - uz * sr);
  u.set(ux * cr + cy * sr, uy * cr, uz * cr - sy * sr);
}

const V = () => new Vector3();
const t0 = V(), t1 = V(), t2 = V(), t3 = V(), t4 = V(), t5 = V(), _tf = V(), _tu = V();

export class Creature {
  constructor(terrain, { x = 0, z = 0, yaw = 0, seed = 1, species = TYRANNOSAURUS } = {}) {
    this.species = species;
    this.H = { ...HIPS_DEFAULT, ...(species.hips || {}) };
    this.FT = { ...FOOT_DEFAULT, ...(species.foot || {}) };
    this.terrain = terrain;
    this.nav = terrain.obstacles ? new Nav(terrain, species.navBody) : null;      // navBody: the radius the route planner keeps clear round its bulk (species)
    this.rand = makeRng(seed);
    this.events = [];
    this.pose = { v: new Float32Array(PV.COUNT * 3), s: new Float32Array(PS.COUNT) };
    this.reset(x, z, yaw);
  }

  reset(x, z, yaw) {
    const T = this.terrain;
    this.t = 0; this.over = 0;
    this.x = x; this.z = z; this.psi = yaw; this.psiV = yaw;
    this.v = 0; this.acc = 0; this.om = 0; this.alpha = 0;
    this.vT = 0; this.omT = 0; this.crashS = null; this.yawKick = null; this.stagT = 0;
    this.groundY = T.height(x, z);
    this.exertion = 0; this.fatigue = 0; this.breathPhase = 0; this.breath = 0;
    this.lowness = 0; this.rho = 0;
    this.reach = null; this.goalId = null; this.reorient = false; this.offAxisT = 0;
    this.pre = null; this.lastStepFoot = null; this.lastAtt = null;
    this.act = null; this.actTimer = 6; this.stalk = 0; this.jawExtra = 0; this.chestDip = new Spring(0); this.armSwing = new Spring(0); this.paceNoise = 0;
    this.ws = { side: 0, timer: 4 };
    this.path = null; this.balF = new Spring(0); this.headAcc = new Vector3(); this.thrust = 1; this.headDetour = 0; this.headPress = 0; this._liftBias = 1; this.headLiftMode = 0; this.headLiftT = 0; this.neckFold = 0; this.headPinned = false; this.headPushV = { x: 0, z: 0 }; this.tailUp = 0; this.tailLat = 0; this.tailSat = 0; this.headBlocked = 0; this.headJam = 0;
    this.ux = 0; this.uz = 0; this.roarEnv = 0; this.blink = 0; this.blinkTimer = 3;
    this.jaw = 0.03; this.jawV = 0; this.jawT = 0.03; this.glareT = 0; this.glareS = 0; this.squint = 0; this.glareSgn = 1;
    // lying down and getting up; eyelids; a hurt foot (`injury` = { foot, sev } is set from outside and survives a reset)
    this.lie = { phase: 'stand', t: 0, dur: 1, fail: false, winced: false }; this.lieS = new Spring(0); this.lieLean = new Spring(0); this.lid = 0; this.lidT = 0; this.wince = null;
    this.injury = this.injury || null; this.wantLie = false; this.relax = 0; this.holdFootReq = false;

    this.feet = [1, -1].map((s) => {
      const w0 = gait.track(0), fx = x + Math.cos(yaw) * s * w0 + Math.sin(yaw) * s * 0.1;
      const fz = z - Math.sin(yaw) * s * w0 + Math.cos(yaw) * s * 0.1;
      const pos = new Vector3(fx, T.height(fx, fz), fz);
      return {
        s, pos, yaw: yaw + s * 0.07, n: T.normal(fx, fz, V()), planted: true, tLand: -10, load: 1,
        gy: pos.y, sw: null, pitch: 0, beta: 0, mtp: pos.clone(), need: 0, target: pos.clone(),
        toeP: [0, 1, 2].map(() => new Spring(0)), toeD: [0, 1, 2].map(() => new Spring(0)), spread: new Spring(0.3), ank: new Spring(0),
      };
    });

    this.py = new Spring(this.groundY + DIM.hipHeight);
    this.pPitch = new Spring(0); this.pRoll = new Spring(0); this.pYaw = new Spring(0);
    // the pelvis' own turn: how far it trails the body heading (`pTurn`, rad) and its yaw rate in the world; the tail root's swing off it
    this.nod = new Spring(0); this.pelPitch = 0; this.pelRoll = 0; this.pTurn = 0; this.pTurnW = 0; this.pTurnA = 0; this.tailRoot = 0; this.tailRootV = 0; this.pStride = 0;
    this.sway = new Spring(0);
    this.twistYaw = new Spring(0); this.twistPitch = new Spring(0.1); this.probeK = 0;
    this.pf = V(); this.pl = V(); this.pu = V(); this.hc = V(); this.pc = V();
    this.chest = { p: V(), f: V(), l: V(), u: V(), yaw };
    this.nb = V(); this.neckEnd = new Vector3(0, 0, 1); this.neckInit = false; this.nbF = { l: 0, f: 2.9, y: 3.8, init: false };
    this.spine = Array.from({ length: SPINE_N }, () => ({ p: V(), u: new Vector3(0, 1, 0) }));

    this.head = {
      pos: new Vector3(x + Math.sin(yaw) * 5, this.groundY + 4.9, z + Math.cos(yaw) * 5), vel: V(),
      yaw, pitch: 0, yawV: 0, pitchV: 0, tilt: new Spring(0), tiltT: 0,
      f: V(), l: V(), u: V(), goal: V(),
    };
    this.headDyn = null; this.neckX = null; this._nxp = null;
    // (the view binds `fix` once at start-up: a reset moves the same Vector3, never a new one, or the eyes read a stale point)
    if (this.fix) this.fix.set(x + Math.sin(yaw) * 40, this.groundY + 4, z + Math.cos(yaw) * 40); else this.fix = new Vector3(x + Math.sin(yaw) * 40, this.groundY + 4, z + Math.cos(yaw) * 40);
    this.hfix = this.fix.clone();      // the head's fixation (held, pursued weakly, refixed in jumps); `fix` is what the eyes look at (the view holds this Vector3)
    this.subject = this.fix.clone();
    this.att = { kind: 'scan', timer: 0, pt: this.fix.clone(), last: 'scan' };
    this.hold = 0.5; this.refr = 0; this.forceRefix = false; this.refixCount = 0;

    const seg = DIM.tailLen / DIM.tailN;
    this.tail = Array.from({ length: DIM.tailN + 1 }, (_, k) => {
      const p = new Vector3(x - Math.sin(yaw) * (0.6 + k * seg), this.groundY + DIM.hipHeight + 0.3, z - Math.cos(yaw) * (0.6 + k * seg));
      return { p, prev: p.clone(), tgt: p.clone() };
    });
    this.px = x; this.pz = z; this.pgy = this.groundY;

    const idle = { goal: null, attention: null, pace: 2 };
    for (let i = 0; i < 240; i++) this.step(1 / 120, idle);
    this.t = 0; this.events.length = 0;
    for (const f of this.feet) f.tLand = -10;
  }

  step(dt, intent) {
    this.t += dt;
    // how worked up it is (BODY4): a rush, a run at something, agitation. Caution shrinks with it: it cuts corners and clips things
    this.arousal = (this.arousal || 0) + ((intent.burst ? 1 : Math.max(sstep(5, 9, intent.pace || 0), intent.agitation || 0)) - (this.arousal || 0)) * expK(dt, 0.4);
    this.chaseK = (this.chaseK || 0) + ((intent.burst ? 1 : sstep(5.5, 9, intent.pace || 0)) - (this.chaseK || 0)) * expK(dt, 0.4);      // a run at something (not mere agitation): this cuts corners
    this._goal(intent);
    this._rest(dt);
    this._acts(dt, intent);
    this._attention(dt, intent);
    this._locomote(dt, intent);
    this._feet(dt);
    this._posture(dt);
    this._toes(dt);
    this._head(dt, intent);
    this._tail(dt);
    this._writePose();
  }

  // ---------------------------------------------------------------- intent
  _goal(intent) {
    const g = intent.goal;
    this.move = null; this.face = null;
    if (g && (g.kind === 'reach' || g.kind === 'approach')) {
      if (g.id !== this.goalId || !this.reach) {
        this.goalId = g.id;
        this.reach = { x: g.x, z: g.z, y: this.terrain.height(g.x, g.z), phase: g.quick ? 'travel' : 'notice', timer: 0.28, stop: g.kind === 'approach' ? g.stop : DIM.reachStop, probe: g.kind === 'reach', hold: g.hold ?? 4.5 };
        if (g.kind === 'reach') { this.att.kind = 'goal'; this.att.timer = 1.8; this.forceRefix = true; }
        this.reorient = false;
      } else if (this.reach.x !== g.x || this.reach.z !== g.z || (g.kind === 'approach' && this.reach.stop !== g.stop)) {     // the goal itself is moving
        const r = this.reach; r.x = g.x; r.z = g.z; r.y = this.terrain.height(g.x, g.z); r.stop = g.kind === 'approach' ? g.stop : DIM.reachStop;
        const dx = g.x - this.x, dz = g.z - this.z, d = Math.hypot(dx, dz) - r.stop;
        if (r.phase === 'investigate' && (d > 0.9 || d < -1.6 || Math.abs(wrap(bearing(dx, dz) - this.psi)) > 0.45)) r.phase = 'travel';
        if (r.phase === 'investigate') r.timer = Math.max(r.timer, 2);
      }
    } else { this.reach = null; this.goalId = null; }
    if (g && g.kind === 'move') this.move = g;
    if (g && g.kind === 'face') this.face = g;
    this.drive = g && g.kind === 'drive' ? g : null;
    this.freeze = intent.freeze ? 1 : 0;
    this.mouthHold = intent.mouth || 0; this.glareT = clamp(intent.glare || 0, 0, 1); this.plantAt = intent.plant || null; this.quickTurn = intent.quickTurn ? 1 : 0;
    this.wantLie = !!intent.lie; this.lidT = clamp(intent.lid || 0, 0, 0.85); this.holdFootReq = !!intent.holdFoot;
    this.relax += ((intent.relax || 0) - this.relax) * expK(1 / 120, 1.2);
    // posture requests from whatever is driving the animal, smoothed so nothing snaps
    const P = this.post || (this.post = { alert: 0, display: 0, agit: 0, hold: 0 });
    const k = expK(1 / 120, 0.5);
    P.alert += ((intent.alert || 0) - P.alert) * k; P.display += ((intent.display || 0) - P.display) * k * 0.7;
    P.agit += ((intent.agitation || 0) - P.agit) * k * 0.5; P.hold += ((intent.breathHold || 0) - P.hold) * k;
  }

  // Small unprompted behaviours while standing: scenting the air or the ground, a head
  // shake, a yawn, a tail flick. Each is a goal for the same head/neck/tail machinery.
  _acts(dt, intent) {
    const R = this.rand, a = this.act;
    this.stalk += ((intent.stalk ? 1 : 0) - this.stalk) * expK(dt, 0.6);
    const idle = !this.reach && !this.drive && !this.move && !this.face && Math.abs(this.v) < 0.1 && !this.reorient && this.feet[0].planted && this.feet[1].planted && this.stalk < 0.3;
    this.blinkTimer -= dt * (1 + 5 * this.glareS); this.blink = Math.max(0, this.blink - dt);
    if (this.blinkTimer <= 0) { this.blink = 0.17; this.blinkTimer = R.range(2.2, 7); }
    this.roarEnv = a && a.kind === 'roar' ? sstep(0, 0.45, a.t) * sstep(a.dur, a.dur - 0.7, a.t) : 0;
    if (a) { a.t += dt; if (a.t >= a.dur || (!idle && !a.forced) || ((intent.look || (intent.attention && this.att.kind === 'player')) && a.pt && !a.forced) /* an idle sniff gives way at once to something it wants to look at */) this.act = null; if (this.act && (this.act.kind === 'snap' || this.act.kind === 'butt' || this.act.kind === 'seize' || this.act.kind === 'strike')) this._snapStep(a); return; }
    if (intent.noIdle) { this.actTimer = Math.max(this.actTimer, 2); return; }
    if (!idle) { this.actTimer = Math.max(this.actTimer, 3); return; }
    this.actTimer -= dt;
    if (this.actTimer > 0) return;
    this.actTimer = R.range(5, 11);
    // (while the brain holds its eyes on something it does not stop to scent the air or the ground: those take the head off it)
    const watching = intent.look || (intent.attention && this.att.kind === 'player'), r = watching ? 0.52 + 0.48 * R() : R(), kind = r < 0.26 ? 'sniffAir' : r < 0.52 ? 'sniffGround' : r < 0.67 ? 'shake' : r < 0.82 ? 'yawn' : 'tailFlick';
    const dur = { sniffAir: 3.4, sniffGround: 4.2, shake: 1.0, yawn: 2.8, tailFlick: 0.7 }[kind];
    const act = this.act = { kind, t: 0, dur, pt: null, sgn: R() < 0.5 ? -1 : 1 };
    if (kind === 'sniffAir') { const b = this.psi + R.range(-0.7, 0.7); act.pt = new Vector3(this.x + Math.sin(b) * 30, this.groundY + 24, this.z + Math.cos(b) * 30); }
    if (kind === 'sniffGround') { const b = this.psi + R.range(-0.45, 0.45), d = DIM.reachStop + 0.2, x = this.x + Math.sin(b) * d, z = this.z + Math.cos(b) * d; act.pt = new Vector3(x, this.terrain.height(x, z) + 0.3, z); }
    if (act.pt) this.forceRefix = true;
  }

  /** A bellow: rears the head, opens the jaws, braces. Can be asked for at any time. */
  roar() {
    if (this.act && this.act.kind === 'roar') return;
    this.act = { kind: 'roar', t: 0, dur: 2.7, pt: null, sgn: 1, forced: true };
    this.events.push({ type: 'roar', x: this.head.pos.x, y: this.head.pos.y, z: this.head.pos.z });
  }

  /** Lying down and getting up: a state the hips, legs, trunk, head and tail all read (`lieS` 0..1, `lieLean`). Going down is a
   *  controlled sink back onto the heels that ends in a settling thump; getting up is a lean forward over the feet and a push,
   *  slower with a hurt leg, which may give way on the first try. Asked for with intent.lie; it only starts standing on both feet. */
  _rest(dt) {
    const L = this.lie, sev = this.injury ? this.injury.sev : 0;
    L.t += dt;
    let K = null, u = 0;
    if (L.phase === 'stand' && this.wantLie && Math.abs(this.v) < 0.3 && this.feet[0].planted && this.feet[1].planted && !(this.act && this.act.forced && STRIKES.has(this.act.kind))) {
      L.phase = 'down'; L.t = 0; L.dur = 3.4 + 0.9 * sev; this.events.push({ type: 'liedown', x: this.x, y: this.groundY, z: this.z });
    } else if (L.phase === 'lying' && !this.wantLie) {
      L.phase = 'up'; L.t = 0; L.fail = sev > 0.45; L.winced = false; L.dur = L.fail ? 4.6 : 2.8 + 0.8 * sev;
      this.events.push({ type: 'getup', x: this.x, y: this.groundY, z: this.z, effort: 0.5 + sev });
    }
    if (L.phase === 'down') {
      K = LIE_K.down; u = L.t / L.dur;
      if (u >= 1) { L.phase = 'lying'; L.t = 0; K = null; this.chestDip.v -= 0.6; this.events.push({ type: 'settle', x: this.x, y: this.groundY, z: this.z, intensity: 1.1 }); }
    } else if (L.phase === 'up') {
      K = L.fail ? LIE_K.upFail : LIE_K.up; u = L.t / L.dur;
      if (this.lieLean.x > 0.5) this.exertion = Math.min(1, this.exertion + dt * 0.12);      // it is hard work
      if (L.fail && !L.winced && u > 0.36) { L.winced = true; this._wince(0.9); this.events.push({ type: 'wince', foot: this.injury ? this.injury.foot : 0, k: 0.9, x: this.x, y: this.groundY, z: this.z }); }
      if (u >= 1) { L.phase = 'stand'; L.t = 0; K = null; }
    }
    const sT = K ? keyAt(K.s, u) : L.phase === 'lying' ? 1 : 0, lT = K ? keyAt(K.lean, u) : 0;
    this.lieS.step(sT, 6, 1, dt); this.lieLean.step(lT, 6, 1, dt);
    if (this.lieS.x < 0) { this.lieS.x = 0; this.lieS.v = Math.max(0, this.lieS.v); } else if (this.lieS.x > 1) { this.lieS.x = 1; this.lieS.v = Math.min(0, this.lieS.v); }
    this.lid += (this.lidT - this.lid) * expK(dt, this.lidT > this.lid ? 0.9 : 0.2);
    if (this.wince) { this.wince.t += dt; if (this.wince.t > 0.7) this.wince = null; }
  }
  get lying() { return this.lie.phase !== 'stand' || this.lieS.x > 0.02; }
  /** A jolt of pain: the body hitches up off the sore leg, the head jerks, the breath catches. */
  _wince(k) {
    this.wince = { t: 0, k }; this.py.v += 0.35 * k; this.pPitch.v += 0.35 * k; this.head.vel.y += 1.0 * k; this.blink = 0.2; this.forceRefix = true;
  }
  /** A foot snatched back from a touch: drawn in toward the body and up, held a moment, and put back where it was. */
  jerkFoot(i, k = 1) {
    const f = this.feet[i]; if (!f || !f.planted || f.jerk) return false;
    f.jerk = { t: 0, dur: 0.95, base: f.pos.clone(), k }; this.blink = 0.2;
    this.events.push({ type: 'jerk', foot: i, x: f.pos.x, y: f.pos.y, z: f.pos.z });
    return true;
  }

  /** Brain-triggered gestures. Each is just a goal for the same head, jaw, neck and body machinery. */
  static get STRIKES() { return STRIKES; }
  gesture(kind, pt, opt) {
    const cur = this.act;
    if (cur && cur.forced && Creature.STRIKES.has(cur.kind) && cur.t < cur.dur * 0.8 && !(opt && opt.over)) return false;
    if (kind === 'orient' && cur && cur.forced && (cur.kind === 'startle' || cur.kind === 'orient') && cur.t < 0.5) return false;
    // the same place again while it is still oriented to it (the stones of one throw, a run of shots): already looking, not a new jerk
    if (kind === 'orient' && pt && cur && cur.kind === 'orient' && cur.pt && cur.t < cur.dur && Math.abs(wrap(bearing(pt.x - this.head.pos.x, pt.z - this.head.pos.z) - bearing(cur.pt.x - this.head.pos.x, cur.pt.z - this.head.pos.z))) < 0.35) return false;
    const dur = { wince: 0.8, rumble: 2.6, huff: 0.9, growl: 2.4, shake: 1.0, snap: 1.25, tilt: 2.2, stomp: 0.6, sniffAir: 3.2, startle: 1.4, tear: 1.5, gulp: 1.2, orient: 1.1, butt: 1.45, seize: 1.3, strike: 0.85, worry: 1.9, toss: 1.5, swipe: 1.9 }[kind];
    this.act = { kind, t: 0, dur, pt: pt ? new Vector3(pt.x, pt.y, pt.z) : null, sgn: opt && opt.sgn ? opt.sgn : this.rand() < 0.5 ? -1 : 1, forced: true, force: opt && opt.force != null ? opt.force : 1 };
    if (kind === 'orient' && pt) { const rel = wrap(bearing(pt.x - this.x, pt.z - this.z) - this.psi); this.twistYaw.v += clamp(rel, -1.6, 1.6) * 0.9; this.forceRefix = true; this.refr = 0; if (Math.abs(rel) > 1.3) this.reorient = true; }
    if (kind === 'swipe') this.forceRefix = true;
    if (kind === 'huff' || kind === 'growl' || kind === 'snap' || kind === 'seize') this.events.push({ type: kind === 'seize' ? 'snap' : kind, x: this.head.pos.x, y: this.head.pos.y, z: this.head.pos.z });
    else if (kind === 'swipe' || kind === 'butt' || kind === 'worry' || kind === 'toss') this.events.push({ type: kind, x: this.head.pos.x, y: this.head.pos.y, z: this.head.pos.z });
    if (kind === 'stomp') this.stompNext = 1;
    if (kind === 'strike') this.events.push({ type: 'strike', x: this.head.pos.x, y: this.head.pos.y, z: this.head.pos.z });
    if (kind === 'wince') { this._wince(opt && opt.force != null ? opt.force : 0.8); this.events.push({ type: 'wince', foot: this.injury ? this.injury.foot : 0, k: this.wince.k, x: this.head.pos.x, y: this.head.pos.y, z: this.head.pos.z }); }
    if (kind === 'rumble') this.events.push({ type: 'rumble', x: this.head.pos.x, y: this.head.pos.y, z: this.head.pos.z });
    if (kind === 'startle' && pt) {
      // flinch: the body drops and recoils away from the source, the head jerks up and back, breath catches
      const dx = this.x - pt.x, dz = this.z - pt.z, d = Math.hypot(dx, dz) || 1, k = Math.min(1, 25 / (d + 10));
      this.pendingShove = { x: dx / d * 1.6 * k, z: dz / d * 1.6 * k, t: 0.12 };
      this.py.v -= 0.9 * k; this.pPitch.v += 0.5 * k; this.head.vel.y += 1.6 * k; this.head.vel.x += dx / d * 1.4 * k; this.head.vel.z += dz / d * 1.4 * k;
      this.twistYaw.v += wrap(bearing(-dx, -dz) - this.psi) * 0.8 * k; this.forceRefix = true; this.blink = 0.2;
      this.events.push({ type: 'startle', x: this.head.pos.x, y: this.head.pos.y, z: this.head.pos.z });
    }
    if (kind === 'sniffAir' && !pt) { const b = this.head.yaw; this.act.pt = new Vector3(this.x + Math.sin(b) * 30, this.groundY + 20, this.z + Math.cos(b) * 30); }
    if (kind === 'sniffAir') this.forceRefix = true;
    return true;
  }

  _snapStep(a) {
    // wind up (head draws back, jaws part), strike (head driven at the target, body lunges), jaws slam, recover
    // the lunge is driven by the legs over a fraction of a second, not teleported
    if (!a.pt) return;
    // the killing strike (mind peril.js): no wind-up at all; the legs drive the whole body in from the first instant
    const t0s = a.kind === 'butt' ? 0.42 : a.kind === 'strike' ? 0 : 0.3, t1s = a.kind === 'butt' ? 0.7 : a.kind === 'strike' ? 0.24 : 0.48, kk = a.kind === 'butt' ? 10 * (0.5 + 0.5 * a.force) : a.kind === 'strike' ? 26 : 13;
    if (a.t > t0s && a.t < t1s) {
      const dx = a.pt.x - this.x, dz = a.pt.z - this.z, d = Math.hypot(dx, dz) || 1;
      // a strike at something already under its chin draws the body back as the head goes down (it does not run over you)
      const sg = a.kind === 'strike' ? clamp((d - DIM.reachStop + 0.6) / 1.2, -0.6, 1) : 1, k = kk * sg / 120;
      // the lunge is driven by the legs: only as hard as the feet on the ground can still carry the hips (_support)
      const head = (this.supRaw ?? Infinity) - Math.abs(this.v) - Math.hypot(this.ux, this.uz), kl = (isFinite(head) ? clamp(head / 1.5, 0, 1) : 1) * clamp((5 - Math.abs(this.v)) / 3, 0, 1);      // (legs already driving a run have little left to lunge with)
      this.ux += (dx / d) * k * kl; this.uz += (dz / d) * k * kl; this.pPitch.v -= (a.kind === 'strike' ? 4.5 : 2.8) / 120;
      // (BODY4) and the body wrenches round toward it, hips and chest, with the head: the neck alone no longer reaches round a
      // man walking past at its side (it used to, by bending into an S)
      if (a.kind === 'strike' || a.kind === 'seize' || a.kind === 'snap') { const rel = wrap(bearing(dx, dz) - this.psi); if (Math.abs(rel) > 0.35) { const w = clamp(rel, -2.6, 2.6) / 120; this.psi += w; this.psiV += w; this.twistYaw.v += clamp(rel, -1.2, 1.2) * 0.35; } }
      // a lunge from two planted feet is carried by a step, like every other movement of the hips: the foot that would go next
      // goes now (a snap at the end of a bluff charge slid the hips a metre over both feet while it braked)
      if (this.feet[0].planted && this.feet[1].planted && k * kl > 0) this.lungeReq = this.t;
    }
    if (!a.clacked && a.t > (a.kind === 'butt' ? 9 : a.kind === 'seize' ? 0.62 : a.kind === 'strike' ? 0.2 : 0.56)) { a.clacked = true; this.events.push({ type: 'clack', x: this.head.pos.x, y: this.head.pos.y, z: this.head.pos.z }); }
  }

  /** An outside push (m/s added to the body). The feet have to catch it. */
  shove(vx, vz) {
    this.pendingShove = { x: vx, z: vz, t: 0.12 };
    const lat = vx * Math.cos(this.psi) - vz * Math.sin(this.psi);
    this.pRoll.v -= 0.5 * lat; this.chestDip.v -= 0.4; this.blink = 0.2; this.forceRefix = true;
  }

  _attention(dt, intent) {
    const a = this.att, R = this.rand, h = this.head;
    const player = intent.attention;
    const travelling = !!this.drive || (this.reach && this.reach.phase !== 'investigate');
    const investigating = this.reach && this.reach.phase === 'investigate';
    a.timer -= dt;
    let dPlayer = Infinity;
    if (player) dPlayer = Math.hypot(player.x - h.pos.x, player.z - h.pos.z);
    // something new to attend to (or it has jumped): it takes the gaze at once
    const lp = this.lastAtt || (this.lastAtt = { x: 0, z: 0, on: false });
    if (player && !investigating && (!lp.on || Math.hypot(player.x - lp.x, player.z - lp.z) > 6)) { a.kind = 'player'; a.timer = R.range(2.5, 5); this.forceRefix = true; }
    lp.on = !!player; if (player) { lp.x = player.x; lp.z = player.z; }

    if (investigating) {
      if (a.kind !== 'goal') { a.kind = 'goal'; this.forceRefix = true; }
      a.timer = 0.5;
    } else if (a.timer <= 0 || (a.kind === 'player' && !player) || (a.kind === 'goal' && !this.reach)) {
      const prev = a.kind;
      if (travelling) {
        if (prev !== 'player' && player && dPlayer < 70 && R() < 0.45) { a.kind = 'player'; a.timer = R.range(0.7, 1.5); }
        else { a.kind = this.reach ? 'goal' : 'path'; a.timer = R.range(1.6, 3.6); }
      } else if (player) {
        if (prev === 'player' && R() < 0.7) { a.kind = 'scan'; a.timer = R.range(0.7, 2.0); }
        else { a.kind = 'player'; a.timer = R.range(2.8, 7.5); }
      } else { a.kind = 'scan'; a.timer = R.range(1.2, 3.6); }
      if (a.kind === 'scan') {
        // with someone about, the glances round stay near them (a look past them, to either side), not off into the blue
        const b = player ? this.chest.yaw + clamp(wrap(bearing(player.x - this.x, player.z - this.z) - this.chest.yaw) + R.range(-0.6, 0.6), -1.1, 1.1) : this.chest.yaw + R.range(-1.1, 1.1), d = R.range(35, 90);
        const sniff = R() < 0.25;
        a.pt.set(this.x + Math.sin(b) * d, this.groundY + (sniff ? R.range(9, 17) : R.range(1.5, 6)), this.z + Math.cos(b) * d);
      }
      this.forceRefix = true;
    }

    const S = this.subject;
    const look = intent.look;
    if (look && a.kind !== 'brain') { a.kind = 'brain'; this.forceRefix = true; }
    if (look) a.timer = 1;
    else if (a.kind === 'brain') a.timer = 0;
    if (look) S.set(look.x, look.y, look.z);
    else if (a.kind === 'player' && player) S.set(player.x, player.y, player.z);
    else if (a.kind === 'goal' && this.reach) {
      // far away, look along the way there; close in, lock onto the spot itself
      S.set(this.reach.x, this.reach.y + 0.25, this.reach.z);
    } else if (a.kind === 'path') {
      if (this.pathLook && (this.move || this.reach)) S.set(this.pathLook.x, this.terrain.height(this.pathLook.x, this.pathLook.z) + 1.2, this.pathLook.z);
      else { const b = this.psi + clamp(this.om * 1.6, -0.9, 0.9); S.set(this.x + Math.sin(b) * 20, this.groundY + 2.4, this.z + Math.cos(b) * 20); }
    } else S.copy(a.pt);
    if (investigating) { S.x += Math.sin(this.t * 1.3) * 0.35; S.z += Math.cos(this.t * 0.9) * 0.3; }   // nosing around the spot
    // a gesture aimed somewhere takes the gaze with it, except idle scenting while the brain holds its eyes on something:
    // a sniff at the sky must never pull the head off what it is watching
    if (this.act && this.act.pt && this.act.kind !== 'snap' && !(look && look.glance) && !(look && look.lock && (this.act.kind === 'sniffAir' || this.act.kind === 'sniffGround' || (this.act.kind === 'orient' && this.act.t > 0.35)))) S.copy(this.act.pt);      // (an orient while its eyes are locked on something is a glance: back after a third of a second)      // a glance (attend.js) wins
    const lock = look && look.lock ? 1 : 0;

    // Fixation: hold a world point, pursue weakly, and jump when the error is too large.
    this.hold -= dt; this.refr -= dt;
    t0.subVectors(this.hfix, h.pos).normalize();
    t1.subVectors(S, h.pos).normalize();
    const err = Math.acos(clamp(t0.dot(t1), -1, 1));
    const thr = a.kind === 'path' ? 0.2 : lock ? 0.05 : 0.1;
    if (this.refr <= 0 && (this.forceRefix || err > thr || (this.hold <= 0 && err > (lock ? 0.012 : 0.025)))) {
      this.hfix.copy(S);
      this.hold = lock ? R.range(1.5, 5) : R.range(0.4, 1.5); this.refr = 0.17; this.forceRefix = false; this.refixCount++;
      if (err > 0.5 && R() < 0.6) this.blink = 0.15;     // big gaze shifts come with a blink
      const curious = (a.kind === 'player' && dPlayer < 30 && R() < 0.3) || (look && look.tilt && R() < 0.5);
      h.tiltT = curious ? R.range(0.12, 0.24) * (R() < 0.5 ? -1 : 1) : R.range(-0.06, 0.06);
    } else {
      this.hfix.lerp(S, expK(dt, lock ? 0.5 : 1.4));
    }

    // the eyes: on a creature (or anything it has locked its look on) they go to where it is now, in small saccade-like steps,
    // so the stare stays on you while the heavy head follows more slowly; otherwise they ride with the head's fixation
    if (a.kind === 'player' || lock) {
      const E = player && Math.hypot(S.x - player.x, S.z - player.z) < 1.5 ? player : S;      // (a person it looks at: his eyes, not the chest the head aims at)
      t0.subVectors(this.fix, h.pos).normalize(); t1.set(E.x, E.y, E.z).sub(h.pos).normalize();
      if (Math.acos(clamp(t0.dot(t1), -1, 1)) > 0.012 || this.refixCount !== this.eyeRefix) { this.fix.set(E.x, E.y, E.z); this.eyeRefix = this.refixCount; }
    }
    else this.fix.copy(this.hfix);

    // Body recruitment while standing: if the subject sits outside the comfortable neck
    // cone for a while, turn the whole animal to face it.
    this.reorientRel = 0;
    if (!travelling && !this.reach && !this.face && !this.move && intent.faceAttention !== false && (a.kind === 'player' || a.kind === 'brain') && (player || look) && !(this.act && this.act.pt)) {
      const rel = this._sided(wrap(bearing(S.x - this.x, S.z - this.z) - this.psi), 'attend');
      const RO = this.H.reorient;      // the neck and chest take what lies inside the cone; the body turns only part of the way
      this.offAxisT = Math.abs(rel) > RO.cone ? this.offAxisT + dt : 0;
      if (this.offAxisT > RO.coneT || Math.abs(rel) > RO.snap) this.reorient = true;
      if (this.reorient && Math.abs(rel) < RO.done) { this.reorient = false; this.offAxisT = 0; }
      this.reorientRel = rel;
    } else if (a.kind !== 'scan') { this.reorient = false; }
  }

  /** A bearing (relative to the body) to something nearly straight behind is taken round one side and kept there: the side the
   *  head is already turned to, else the way the body is already turning. Head and body then go round the same way, so a
   *  subject crossing behind it never sends the skull over one shoulder while the body pivots the other way (the neck used to
   *  end up wound past its limit, the head looking back along its own flank). */
  _sided(rel, who = 'body') {
    // each caller keeps its own choice: one caller passing a small bearing must not clear another's (the face turn used to be
    // reset by the head's call and pick again, starting the wrong way and reversing)
    const B = this.behindSides || (this.behindSides = {});
    // (hysteresis: once a side is chosen it holds until the bearing is well round to the front, below 1.9 rad; between 1.9 and 2.2
    // the raw bearing used to be returned while the choice was kept, so a subject hovering about 2.2 rad off sent the head
    // back and forth across the front)
    if (Math.abs(rel) < 1.9) { B[who] = 0; return rel; }
    if (!B[who] && Math.abs(rel) < 2.2) return rel;
    // well round on the other side now (not just across the line behind), or on the side the body is already turning to (it comes
    // round there): go that way
    if (B[who] && Math.sign(rel) !== B[who] && (Math.abs(rel) < 2.75 || (Math.abs(this.om) > 0.05 && Math.sign(this.om) === Math.sign(rel)))) B[who] = Math.sign(rel);
    if (!B[who]) {
      // the side another caller already chose (head and body go round together), else the head's side, else the turn's
      const other = Object.keys(B).find((k) => k !== who && B[k]), hs = wrap(this.head.yaw - this.chest.yaw);
      // (not straight behind, under ~165 deg, the subject's own side is the way round: a head left on the far side by a gesture
      // used to be kept there, the full neck's turn away from what it watched)
      B[who] = Math.abs(rel) < 2.9 ? Math.sign(rel) : other ? B[other] : Math.abs(hs) > 0.25 ? Math.sign(hs) : Math.abs(this.om) > 0.05 ? Math.sign(this.om) : Math.sign(rel) || 1;
    }
    this.behindSide = B[who];
    return Math.sign(rel) === B[who] ? rel : rel + B[who] * 2 * Math.PI;
  }

  // ---------------------------------------------------------------- momentum
  _locomote(dt, intent) {
    const sev = this.injury ? this.injury.sev : 0;
    const pace = Math.min(clamp(intent.pace ?? DIM.walk, 0.4, DIM.sprint), lerp(DIM.sprint, 1.3, this.stalk), lerp(DIM.sprint, 3.6, sev));      // a hurt foot will not take a run
    const spd = Math.abs(this.v);
    // (going for something with everything it has, quickTurn, it turns harder at low speed and holds a tighter line at speed)
    const omMax = this.quickTurn ? Math.min(STAM.turn, STAM.turnAcc / Math.max(spd, 0.1)) : Math.min(0.52, 3.0 / Math.max(spd, 0.1));
    let vT = 0, omT = 0;
    const r = this.reach;
    if (this.drive) {
      vT = clamp(this.drive.throttle, -0.3, 1) * pace;
      omT = clamp(this.drive.steer, -1, 1) * omMax;
      if (vT > 0.5) {      // driven or not, it does not run into a tree: bend the line round anything ahead
        const L = 4 + 1.6 * spd, ax = this.x + Math.sin(this.psi) * L, az = this.z + Math.cos(this.psi) * L, st = this._avoid({ x: ax, z: az, rem: L });
        const e = wrap(bearing(st.x - this.x, st.z - this.z) - this.psi); omT = clamp(omT + 1.4 * e, -omMax, omMax);
      }
    } else if (r) {
      const dx = r.x - this.x, dz = r.z - this.z, dist = Math.hypot(dx, dz);
      const st = this._avoid(r.phase === 'travel' && dist > r.stop + 1.5 ? this._steer(r.x, r.z) : { x: r.x, z: r.z, rem: dist });
      const e = dist > 0.8 ? wrap(bearing(st.x - this.x, st.z - this.z) - this.psi) : 0;
      const ae = Math.abs(e), d = Math.max(dist, st.rem) - r.stop;
      r.dist = dist;
      if (r.phase === 'notice') { r.timer -= dt; if (r.timer <= 0) r.phase = 'travel'; }
      else if (r.phase === 'travel') {
        const align = 1 - sstep(0.45, 1.75, ae);
        if (d > 0.3) vT = Math.min(pace, Math.sqrt(2 * (this.quickTurn ? STAM.brake : 1.5) * d) + 0.2) * align;      // (going for something that moves, it does not ease off early)
        else if (d < -1.3 && ae < 1.2) vT = Math.max(-1.0, 0.7 * (d + 0.7));
        const want = 1.6 * e;
        omT = clamp(want, -omMax, omMax);
        if (Math.abs(want) > omMax) vT *= lerp(1, 0.62, sstep(1, 3, Math.abs(want) / omMax));
        if (d <= 0.3 && d >= -1.3 && spd < 0.25 && ae < 0.16) { r.phase = 'investigate'; r.timer = r.hold; r.told = false; }
      } else {
        if (ae > 0.3) omT = clamp(1.4 * e, -0.4, 0.4);
        r.timer -= dt;
        if (r.timer <= 0 && !r.told) { r.told = true; this.events.push({ type: 'arrived', id: this.goalId }); if (r.probe) this.reach = null; }
      }
    } else if (this.move) {
      const g = this.move, st = this._avoid(this._steer(g.x, g.z)), dist = Math.hypot(g.x - this.x, g.z - this.z), e = wrap(bearing(st.x - this.x, st.z - this.z) - this.psi), ae = Math.abs(e);
      vT = pace * (1 - sstep(0.6, 1.9, ae)) * (g.last ? Math.min(1, dist / 4) : 1);
      const want = 1.6 * e; omT = clamp(want, -omMax, omMax);
      if (Math.abs(want) > omMax) vT *= lerp(1, 0.62, sstep(1, 3, Math.abs(want) / omMax));
      if (dist < 3.2 && this.lastPassed !== g.id) { this.lastPassed = g.id; this.events.push({ type: 'passed', id: g.id }); }
    } else if (this.face) {
      const g = this.face, e = this._sided(wrap(bearing(g.x - this.x, g.z - this.z) + (g.offset || 0) - this.psi), 'face'), ae = Math.abs(e);
      const fm = this.quickTurn && ae > 0.6 ? 0.85 : lerp(0.5, 0.6, sstep(0.7, 1.5, ae));      // something behind it that matters: it pivots harder; a big turn is stepped round faster
      if (ae > (this.facing ? 0.08 : 0.2)) { this.facing = true; omT = clamp(1.3 * e, -fm, fm); } else this.facing = false;
    } else if (this.reorient) {
      const fm = this.quickTurn && Math.abs(this.reorientRel) > 0.6 ? 0.85 : lerp(0.5, 0.6, sstep(0.7, 1.5, Math.abs(this.reorientRel)));
      omT = clamp(1.3 * this.reorientRel, -fm, fm);
    }
    // a tail swipe: the hips are thrown round so the tail sweeps through the place it was aimed at
    const sw = this.act && this.act.kind === 'swipe' ? this.act : null, swU = sw ? sw.t / sw.dur : 0, swing = sw ? sstep(0.08, 0.25, swU) * (1 - sstep(0.55, 0.8, swU)) : 0;
    if (swing > 0) { omT = lerp(omT, sw.sgn * 1.7, swing); vT *= 1 - swing; }
    // the ground and the animal's own rhythm modulate pace: slower up a slope and down a steep one
    const sl = (this.terrain.height(this.x + Math.sin(this.psi) * 3, this.z + Math.cos(this.psi) * 3) - this.terrain.height(this.x - Math.sin(this.psi) * 3, this.z - Math.cos(this.psi) * 3)) / 6;
    this.slope = sl;
    this.paceNoise += (this.rand.range(-1, 1) - this.paceNoise) * expK(dt, 1.5);
    if (vT > 0) vT *= (1 - clamp(1.8 * sl, 0, 0.35) - clamp(-1.3 * sl - 0.08, 0, 0.25)) * (1 + 0.035 * this.paceNoise);
    vT *= 1 - 0.85 * this.roarEnv;
    // it does not run off a drop it can see, nor charge down a steep bank: the ground ahead along its momentum, out to past where
    // it could stop, is felt stride by stride; the steeper a stretch falls away the slower it will take it (a sheer drop not at
    // all), and it slows now so it could be at that speed by the time it gets there
    if (vT > 0) {
      const T = this.terrain, mx = Math.sin(this.psiV), mz = Math.cos(this.psiV), look = 4 + spd * spd / 5 + 2, brk = 2.5;
      let g0 = T.height(this.x, this.z); const gHere = g0, stepDown = 0.35 * (this.species.dims.hipHeight || 3.2);
      for (let d = 0.75; d <= look; d += 0.75) {
        const g = T.height(this.x + mx * d, this.z + mz * d), grade = (g0 - g) / 0.75; g0 = g;
        if (grade < 0.22) continue;
        // (a step down it can take in its stride is no drop: a bank of a metre is nothing to legs over three metres long; it
        //  had stood dead at a 0.7-1 m bank in the paddock while a man ran off down it. MERGE.md)
        if (gHere - g < stepDown) continue;
        const cap = grade > 0.9 ? 0 : lerp(9, 2.2, clamp((grade - 0.22) / 0.4, 0, 1)), room = Math.max(0, d - (cap > 0 ? 1 : 2.6));
        vT = Math.min(vT, Math.sqrt(cap * cap + 2 * brk * room));
      }
    }
    if (this.headPress > 0.1 && vT > 0) vT = lerp(vT, 0, sstep(0.1, 1, this.headPress));      // head pressed against something: it eases off
    { const C = this.crashS; if (C && C.t < C.dur) { C.t += dt; const u = C.t / C.dur; if (vT > 0) vT = Math.min(vT, lerp(Math.max(0.35 * (C.tan || 0) * (1 - 0.6 * (C.hard || 0)), C.keep || 0), 1, sstep(0, 1, u)) * Math.max(vT, C.from || 0)); } }      // knocked: a moment to gather itself, eased (a glancing blow costs less) (BODY4)
    { const C = this.crashS; if (C && C.t < 0.45 && (C.tan ?? 1) < 0.5 && this.v > 0) this.v = Math.max(0, this.v - 9 * dt); }      // head-on: the legs brace, it does not walk on into what it hit
    { const C = this.crashS; if (C && C.t < C.dur) { const CR = this.species.crash || {};
      if (C.reel > 0.05) { const t0 = 0.12, t1 = t0 + lerp(0.35, 0.7, C.reel), bk = CR.reelBack || [0.4, 0.9];      // gives ground: backwards off it, a step or two
        if (C.t > t0 && C.t < t1) vT = Math.min(vT, -lerp(bk[0], bk[1], C.reel)); else if (C.t >= t1 && C.t < t1 + 0.9 && vT > 0) vT = 0;      // and stands a beat
        if (!C.shook && C.t > t1 - 0.15) { C.shook = true; if (this.gesture('shake', null, { over: true })) this.act.crash = true; } }
      if (C.bounce && C.t > C.bounce.t) { this.ux += C.nx * C.bounce.k; this.uz += C.nz * C.bounce.k; C.bounce = null; } } }      // glancing: thrown back off the surface as the lean comes out
    { const C = this.crashS, B = C && C.blow; if (B) { const CB = (this.species.crash || {}).blow || {}, bt = this.t - C.at, g = B.gl, sg = B.sg;
      // beat 2, the rebound (about 0.2 s): it comes off the surface and over-corrects: the roll swings past upright the other way, the
      // head and neck whip back away from the wall, the tail goes the other way from the hips, and a quick catch step follows
      if (!B.b2 && bt > (CB.t2 ?? 0.2)) { B.b2 = true; const W = this.wallLean; if (W) { W.T = clamp(W.T - sg * (CB.over ?? 0.3) * g, -0.45, 0.45); W.x -= sg * (CB.over ?? 0.3) * g; } this.pRoll.v -= sg * (CB.rollKick ?? 1.2) * g;
        this.head.tilt.v -= sg * (CB.headBack ?? 6) * g; this.head.vel.x += C.nx * (CB.headAway ?? 1.6) * g; this.head.vel.z += C.nz * (CB.headAway ?? 1.6) * g;
        this.twistYaw.v -= sg * (CB.tail ?? 0.9) * g; this.sway.v -= sg * (CB.swayBack ?? 0.9) * g; this.stagT = this.t + (CB.catchIn ?? 0.12); }
      // beat 3, a hard one only (from about 0.6 s): it gathers itself: a snort, and a look back at what it hit (it keeps running throughout)
      if (!B.b3 && g > (CB.gatherFrom ?? 0.5) && bt > (CB.t3 ?? 0.6)) { B.b3 = true; if (this.gesture('huff', B.P, { over: true, force: g })) this.act.crash = true; } } }
    if (this.stagT && this.t >= this.stagT) { this.lungeReq = this.t; this.stagT = 0; }
    if (this.yawKick) { const Y = this.yawKick; Y.t += dt; const w = Y.w * Math.sin(Math.PI * Math.min(1, Y.t / 0.5)); this.psi += w * dt * 2.4; this.psiV += w * dt * 2.4; if (Y.t > 0.5) this.yawKick = null; }
    if ((this.headJam || 0) > 0.35) { vT = Math.min(vT, -0.7); omT *= 0.3; }      // head wedged: it backs out rather than forcing it
    vT *= 1 - 0.6 * (this.avoidK || 0); this.avoidK = 0;      // a hard swerve round rock is taken slower
    if (this.tailLat * omT > 0) omT *= 1 - Math.max(sstep(0.1, 0.45, this.tailSat), sstep(0.05, 0.3, this.tailNear || 0)); else omT *= 1 - 0.8 * sstep(0.1, 0.35, this.tailNear || 0);      // (a tail among things on both sides: any turn is slow)      // a turn that drives the tail, bent as far as it goes, into something is taken slower
    if (this.freeze) { vT = 0; omT *= 0.2; }
    if (this.lying) { vT = 0; omT = 0; }      // lying, or on the way down or up: the legs are not for walking
    // the legs move the body: the hips go only as far and as fast as the feet on the ground can carry them until the next foot
    // is down ahead (_support). What was asked is kept (`vReq`): when the stance cannot give it, that is what makes a foot step.
    this.vReq = vT;
    if (!this.lying) vT = this._support(vT);
    this.vT = vT; this.omT = omT;

    // jerk-limited acceleration: a big animal cannot change its mind instantly
    // a foot on the ground is the only thing that can push or brake; the trailing foot near push-off pushes hardest
    const [FA, FB] = this.feet, onGround = (FA.planted ? 1 : 0) + (FB.planted ? 1 : 0);
    let push = onGround ? 1 : 0.12;
    if (onGround === 1 && spd > 0.5) { const st = FA.planted ? FA : FB, behind = (st.pos.x - this.x) * Math.sin(this.psi) + (st.pos.z - this.z) * Math.cos(this.psi); push *= 1 + 0.45 * clamp(-behind / 1.2, 0, 1); }
    this.thrust += (push - this.thrust) * expK(dt, 0.06);
    let aCmd = clamp((this.freeze ? 3.5 : 2.2) * (vT - this.v) * (intent.burst ? 1.8 : 1), this.freeze ? -4.2 : -3.0, intent.burst ? 4.4 : lerp(1.6, 2.7, sstep(5, 9, Math.abs(this.vReq))));      // (how hard it drives is set by what was asked; the support cap only bounds the target)      // a burst from a crouch: the loaded legs drive harder for a moment
    aCmd = aCmd * this.thrust - (onGround ? 0 : 0.15 * this.v);
    this.acc += (aCmd - this.acc) * expK(dt, 0.22);
    this.v += this.acc * dt;
    if (Math.abs(this.v) < 0.02 && vT === 0) this.v *= 0.9;
    // turning torque also comes through a planted foot; standing still, it pivots on one foot while the other steps round
    const pivot = onGround === 0 ? 0.15 : onGround === 1 ? 1.25 : spd < 0.3 ? 0.45 : 1;
    const alMax = swing > 0 ? lerp(1.1, 7, swing) : this.quickTurn ? 1.5 : (this.tailNear || 0) > 0.05 ? 2.2 : 1.1, alCmd = clamp(4 * (omT - this.om), -alMax, alMax) * (swing > 0 ? Math.max(pivot, 1) : pivot);
    this.alpha += (alCmd - this.alpha) * expK(dt, swing > 0 ? 0.06 : 0.18);
    this.om += this.alpha * dt;
    this.psi += this.om * dt;
    this.psiV += wrap(this.psi - this.psiV) * expK(dt, lerp(0.07, 0.32, sstep(1, 6, spd)));   // velocity lags heading: momentum carries wide, but only at pace

    this.px = this.x; this.pz = this.z; this.pgy = this.groundY;
    this.x += (Math.sin(this.psiV) * this.v + this.ux) * dt;
    this.z += (Math.cos(this.psiV) * this.v + this.uz) * dt;
    const uk = Math.exp(-dt / 0.4); this.ux *= uk; this.uz *= uk;
    if (this.pendingShove) { const P = this.pendingShove, k = Math.min(dt, P.t) / 0.12; this.ux += P.x * k; this.uz += P.z * k; P.t -= dt; if (P.t <= 0) this.pendingShove = null; }
    this._bodyCollide(dt);
    if (this.terrain.rect) { const r = this.terrain.rect; this.x = Math.max(r.x0 - 2, Math.min(r.x1 + 2, this.x)); this.z = Math.max(r.z0 - 2, Math.min(r.z1 + 2, this.z)); }      // a rectangular fence, anywhere
    else if (this.terrain.bound) { const b = this.terrain.bound + 2; this.x = Math.max(-b, Math.min(b, this.x)); this.z = Math.max(-b, Math.min(b, this.z)); }      // a square fence
    else { const lim = this.terrain.arena + 20, rr = Math.hypot(this.x, this.z); if (rr > lim) { this.x *= lim / rr; this.z *= lim / rr; } }
    this.groundY += (this.terrain.height(this.x, this.z) - this.groundY) * expK(dt, 0.25);

    this.exertion = clamp(this.exertion + dt * (0.004 * this.v * this.v - this.exertion / 12), 0, 1);      // breath: seconds
    // fatigue: the long reserve (species `stamina`): a run at its run speed empties it over `full` s, faster above that, and it
    // comes back over `recover` s at a walk or standing. It is what wears a long chase down, and it shows in the breathing
    { const u = Math.abs(this.v) / DIM.run, drain = Math.max(0, u * u - STAM.free) / STAM.full;
      this.fatigue = clamp(this.fatigue + dt * (drain > 0 ? drain : -(Math.abs(this.v) < STAM.restV ? 1 : 0.4) / STAM.recover), 0, 1); }
    this.exertion = Math.max(this.exertion, 0.85 * this.fatigue);
    const PO = this.post || { alert: 0, display: 0, agit: 0, hold: 0 };
    const rate = lerp(0.2, 0.6, this.exertion) * (1 + 0.9 * PO.agit) * (1 - 0.6 * PO.hold) * (1 - 0.4 * this.lieS.x) * (1 - 0.25 * this.relax);
    this.breathPhase = (this.breathPhase + dt * rate) % 1;
    const ph = this.breathPhase, wp = ph < 0.4 ? (ph / 0.4) * 0.5 : 0.5 + ((ph - 0.4) / 0.6) * 0.5;
    this.breath = (0.5 - 0.5 * Math.cos(wp * Math.PI * 2)) * (1 + 1.2 * this.exertion) * (1 - 0.8 * PO.hold) * (1 + 0.5 * PO.agit);
  }

  /** How far the hip over this planted foot can still travel along (dx, dz) before the leg runs out of length (m; below 0 it is
   *  already past). The heel may roll up onto the toes (to `ROLL`) to lend the leg length, as _leg lets it: the leg's own
   *  geometry, not a tuned distance. */
  _room(foot, dx, dz) {
    const FT = this.FT, TL = FT.toes[1], lp3 = TL * FT.split, ld3 = TL - lp3, n = foot.n, p = foot.pos, ROLL = 0.8, R = RMAX * 0.95;
    let fx = Math.sin(foot.yaw), fy = 0, fz = Math.cos(foot.yaw); { const d = fx * n.x + fz * n.z; fx -= n.x * d; fy -= n.y * d; fz -= n.z * d; const l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l; }
    const a2 = Math.max(0, ROLL - FT.peel), up = FT.pad + lp3 * Math.sin(ROLL) + ld3 * Math.sin(a2), fw = TL - lp3 * Math.cos(ROLL) - ld3 * Math.cos(a2);
    const mx = p.x + n.x * up + fx * fw, my = p.y + n.y * up + fy * fw, mz = p.z + n.z * up + fz * fw;
    const ok = this._hipOk, hx0 = ok ? this.hc.x + this.pl.x * foot.s * DIM.hipHalf : this.x, hy = ok ? this.hc.y : this.py.x, hz0 = ok ? this.hc.z + this.pl.z * foot.s * DIM.hipHalf : this.z;
    const over = (d) => {
      const Hx = hx0 + dx * d, Hz = hz0 + dz * d, x = (Hx - p.x) * fx + (hy - p.y) * fy + (Hz - p.z) * fz;
      const th = 1.08 + 0.38 * clamp(x / 1.2, -1.2, 1.6) + 0.5 * ROLL, c = Math.cos(th) * DIM.meta, sn = Math.sin(th) * DIM.meta;
      return Math.hypot(mx - fx * c + n.x * sn - Hx, my - fy * c + n.y * sn - hy, mz - fz * c + n.z * sn - Hz) - R;
    };
    // the reach is an interval along the line: start from the point of it nearest the foot and find its far end
    let lo = clamp((p.x - hx0) * dx + (p.z - hz0) * dz, -2.5, 2.5), hi = lo + 3;
    if (over(lo) > 0) return -over(lo) - 0.2;      // out of reach already: how far short, roughly
    if (over(hi) <= 0) return hi;
    for (let k = 0; k < 10; k++) { const md = (lo + hi) / 2; if (over(md) <= 0) lo = md; else hi = md; }
    return lo;
  }

  /** The body is moved by its legs. Along the way it is travelling (or, from rest, the way it is asked to go) each planted foot
   *  can carry the hips only so far (_room); a new foothold ahead comes when the swinging foot lands or, with no foot in the
   *  air, once the next one has been unloaded and swung through. The speed the legs can deliver is that stance room over the
   *  time until the new foothold, and the body is asked for no more. From rest this is the weight shift and first step before
   *  the body really goes; braking or reversing over one stance foot (or over a foot held up) is the same rule. */
  _support(vT) {
    const [A, B] = this.feet;
    this.supRoom = Infinity; this.supCap = Infinity; this.supT = 0;
    if (!(A.planted && !A.jerk) && !(B.planted && !B.jerk)) return vT;      // in flight: momentum alone
    // the way the hips are actually going: the gait's own speed along its heading plus any lunge or shove
    const spd = Math.abs(this.v), sg = spd > 0.15 ? Math.sign(this.v) : Math.sign(vT) || 1;
    let dx = Math.sin(this.psiV) * sg, dz = Math.cos(this.psiV) * sg;
    { const Vx = Math.sin(this.psiV) * this.v + this.ux, Vz = Math.cos(this.psiV) * this.v + this.uz, Vl = Math.hypot(Vx, Vz); if (Vl > 0.15 && Math.hypot(this.ux, this.uz) > 0.15) { dx = Vx / Vl; dz = Vz / Vl; } }
    for (const f of this.feet) f.room = f.planted && !f.jerk ? this._room(f, dx, dz) : Infinity;
    const sw = !A.planted ? A : !B.planted ? B : null, m = sstep(0.15, 0.7, spd);
    let tr, room;
    if (sw) { tr = Math.max(0, sw.sw.T - sw.sw.t) / Math.max(0.05, sw.sw.rate ?? 1); room = Math.min(A.room, B.room); this.supGo = null; }
    else {      // both down: the one with least room goes next (or the one already unloading); the other must carry the hips while it is swung through
      const go = this.pre ? this.pre.foot : A.room <= B.room ? A : B, stay = go === A ? B : A;
      const dty = gait.duty(spd), Tstep = gait.stepLen(spd) / Math.max(spd, 0.5);
      tr = (this.pre ? this.pre.t : lerp(0.24, 0, m)) + lerp(0.54, clamp((1 - dty) * 2 * Tstep, 0.34, 0.6), m);
      room = stay.room; this.supGo = go;
    }
    // a lunge or a shove (ux, uz) moves the hips over the same feet: what it carries along the way counts against the legs' room
    const ua = Math.max(0, this.ux * dx + this.uz * dz), cap = Math.max(0, room) / Math.max(tr, 0.04);
    this.supRoom = room; this.supRaw = cap; this.supCap = Math.max(0, cap - ua); this.supT = tr; this.supSg = sg; this.supU = ua;
    return sg > 0 ? Math.min(vT, this.supCap) : Math.max(vT, -this.supCap);
  }

  /** The point to head for now on the way to (gx, gz): the next corner of a planned route. */
  /** The whole body against solid things: a hip column (the legs) down to the ground, belly, chest and neck base.
   *  Pushes translate the body; a push on the front of it also turns it, as a nose-on bump would. Speed into a contact is shed
   *  hard but over a few ticks; speed along it is kept, so it slides along a wall. */
  _bodyCollide(dt) {
    const T = this.terrain; if (!T.pushOut) return;
    const sp = this.spine, dx0 = this.x - this.px, dz0 = this.z - this.pz, gy = this.groundY;
    const fx = Math.sin(this.psi), fz = Math.cos(this.psi);
    { const H = this._home || (this._home = { x: 0, z: 0 }); H.x = this.px; H.z = this.pz; }
    const parts = [[IDX.PELVIS, 1.0, gy - 1, 0], [IDX.PELVIS + 2, 1.1, null, 1.2], [IDX.CHEST, 1.05, null, 2.6], [IDX.CHEST + 2, 0.6, null, 3.4]];
    let bx = 0, bz = 0, turn = 0;
    const q = this._cq || (this._cq = { x: 0, z: 0 });
    for (const [j, r, y0, ahead] of parts) {
      const P = sp[j].p; if (!P || !isFinite(P.x)) continue;
      q.x = P.x + dx0 + bx; q.z = P.z + dz0 + bz;
      const lo = y0 ?? P.y - r * 0.9;
      // a trunk never hangs over a built wall: lowering it (a crouch, a turn, a pitch) would put it deep inside in one tick and the
      // push out would throw the whole body sideways (it did, by 30 cm a tick, beside the pen's low walls)
      const [px, pz] = T.pushOut(q, r, lo, P.y + r, 2, true); if (!px && !pz) continue;
      { const m = Math.hypot(px, pz); if (m > (this._hitM || 0)) { this._hitM = m; this._hitJ = j; this._hitR = r; } }
      if (ahead > 0) { const lat = -px * fz + pz * fx; turn += Math.atan2(lat, ahead) * 0.55; bx += px * 0.6; bz += pz * 0.6; }
      else { bx += px; bz += pz; }
    }
    // a head held off a wall pushes back through the neck: whatever the hard limit on the skull had to undo last tick moves the
    // body away and turns it, so the neck never keeps driving the head into what it is touching
    { const hp = this.headPushV, hl = Math.hypot(hp.x, hp.z); if (hl > 0) { const lat = -hp.x * fz + hp.z * fx, k = Math.min(0.7, 0.8 * dt / hl); turn += Math.atan2(lat, 4.5) * 0.4; this.x += hp.x * k; this.z += hp.z * k; hp.x = 0; hp.z = 0; } }
    // the root of the tail is part of the body too: swung into a trunk or a wall it stops the turn, and shoves the hips off it
    for (let k = 1; k <= 5 && T.near; k++) {
      const P = this.tail[k].p, rn = lerp(0.62, 0.14, k / DIM.tailN), CK = this._cBegin();
      this._cSample(P.x + dx0 + bx, P.y, P.z + dz0 + bz, rn, -fx, -fz); if (!this._cEnd()) continue;
      const lat = -CK.px * fz + CK.pz * fx, behind = Math.max(1, (this.x - P.x) * fx + (this.z - P.z) * fz);
      turn -= Math.atan2(lat, behind) * 0.55; bx += CK.px * 0.3; bz += CK.pz * 0.3;
    }
    // (BODY4) and never a trunk left inside something: whatever a world's shapes are (a ring of posts standing for a box pushes a
    // chest that is level with a post along the face, not out of it), if the chest is overlapping a solid thing that the hips are
    // clear of, the body is drawn back along hips -> chest to where the chest would be clear (found by halving), a little a tick
    { const Q = this._cq2 || (this._cq2 = { x: 0, z: 0 }), C = sp[IDX.CHEST].p, hit = (x, z) => { Q.x = x; Q.z = z; const [a, b] = T.pushOut(Q, 0.8, C.y - 0.7, C.y + 0.7, 1, true); return Math.abs(a) + Math.abs(b) > 0.05; };
      const cx = C.x + dx0 + bx, cz = C.z + dz0 + bz, hx = this.x + bx, hz = this.z + bz;
      if (hit(cx, cz) && !hit(hx, hz)) { let lo = 0, hi = 1; for (let it = 0; it < 6; it++) { const m = (lo + hi) / 2; if (hit(hx + (cx - hx) * m, hz + (cz - hz) * m)) hi = m; else lo = m; }
        const back = Math.min((1 - lo) * Math.hypot(cx - hx, cz - hz), 0.08), dl = Math.hypot(cx - hx, cz - hz) || 1; bx -= (cx - hx) / dl * back; bz -= (cz - hz) / dl * back; } }
    if (!bx && !bz && !turn) { this.bump = 0; this._hitM = 0; return; }
    const bl = Math.hypot(bx, bz);
    if (bl > 0) {
      const lim = Math.min(bl, 2.5 * dt + 0.6 * bl), k = lim / bl; this.x += bx * k; this.z += bz * k;
      const nx = bx / bl, nz = bz / bl;
      let Vx = Math.sin(this.psiV) * this.v, Vz = Math.cos(this.psiV) * this.v, vn = Vx * nx + Vz * nz;
      { const v0 = this.v; this._crash(-vn, nx, nz, dt); if (this.v !== v0 && v0) { const r = this.v / v0; Vx *= r; Vz *= r; vn *= r; } }      // (the speed a knock took stays taken: the slide below had put it straight back, so a corner clipped at a run was a slow sag, not a jolt)
      // sliding along it: shoulder or hip held against the surface, and the rub sheds speed (BODY4)
      { const spd = Math.abs(this.v); if (spd > 1.2 && bl > 0.002 && this.crashS && this.crashS.t < this.crashS.dur) {      // (only in the moment after a knock: brushing a wall on an ordinary walk is no rub)
        const tw = -(nx * fz - nz * fx) * -1, toward = -(nx * Math.cos(this.psi) - nz * Math.sin(this.psi)); { const W = this.wallLean || (this.wallLean = { x: 0, T: 0 }); const tl = clamp(toward, -1, 1) * 0.16 * Math.min(1, spd / 4); const CB = this.crashS && this.crashS.blow; if (Math.abs(tl) > Math.abs(W.T) && !(CB && CB.b2 && this.t - this.crashS.at < 0.75)) W.T = tl; }      // (not while it is rebounding off the surface: the over-correction is not to be leaned back in)
        this.v -= Math.sign(this.v) * Math.min(spd, 2.5 * dt); void tw; } }
      if (vn < 0) { Vx -= vn * nx; Vz -= vn * nz; const sp2 = Math.hypot(Vx, Vz); if (sp2 > 0.05 && this.v > 0) { this.psiV += clamp(wrap(bearing(Vx, Vz) - this.psiV), -0.04, 0.04); /* the slide turns in over a few ticks, so a swinging foot's target does not jump */ this.v = Math.max(sp2, Math.abs(this.v) - 30 * dt); } else this.v = Math.sign(this.v) * Math.max(0, Math.abs(this.v) - 30 * dt); this.bump = Math.max(this.bump || 0, -vn); }
    }
    if (turn) { const tr = clamp(turn, -0.6 * dt * 60 * dt * 60, 0.6 * dt * 60 * dt * 60); this.psi += clamp(turn, -0.005, 0.005); this.psiV += clamp(turn, -0.005, 0.005); this.om *= 0.97; void tr; }
  }

  /** Running into something (BODY4): the trunk or the hips meet a solid thing at speed (closing speed `vin` m/s along the outward
   *  normal n). No balance physics: the push-out above keeps it outside; here the body answers the knock. It leans against the
   *  surface (roll toward it, the chest thrown back if it was head-on), takes a stagger step at once, loses speed for a moment
   *  (about a second of ground, more from a run), and says so: a 'contact' event {part: torso|hips, surface, force, x,y,z, nx,nz}
   *  for sound, camera and the mind. A slow lean or slide along a wall is no crash. */
  _crash(vin, nx, nz, dt, partIn) {
    const j = this._hitJ, hm = this._hitM || 0; this._hitM = 0;
    const C = this.crashS || (this.crashS = { t: 9, dur: 0, at: -9 });
    // (the gap between knocks is counted on the clock: it was counted in ticks of contact, so after its first crash the next ones
    //  went unanswered and unheard until the trunk had spent 0.45 s more against things)
    if (!(vin > 1.0) || this.t - C.at < 0.45) return;
    const part = partIn || (j === IDX.PELVIS ? 'hips' : 'torso'), P = partIn ? this.head.pos : this.spine[j === undefined ? IDX.CHEST : j].p, fx = Math.sin(this.psi), fz = Math.cos(this.psi), lx = fz, lz = -fx;
    const toward = -(nx * lx + nz * lz), frontal = clamp(-(nx * fx + nz * fz), 0, 1), k = Math.min(vin, 8);
    // (signs: pRoll +, sway + toward +l; pPitch - pitches the chest forward and down; balF + carries the trunk forward)
    // head-on: the mass carries on a moment (trunk surges and pitches into it, head flung on: the neck takes it), then recoils
    this.balF.v += 0.45 * k * frontal; this.pPitch.v -= 0.16 * k * frontal; this.chestDip.v += 0.2 * k * frontal; { const hv = this.head.vel, vin2 = hv.x * nx + hv.z * nz; if (vin2 < 0) { hv.x -= 1.3 * vin2 * nx; hv.z -= 1.3 * vin2 * nz; } hv.x += nx * 0.12 * k * frontal; hv.z += nz * 0.12 * k * frontal; hv.y += 0.18 * k * frontal; this.head.pitchV += 0.12 * k * frontal; this.headBounceT = this.t; }      // the skull hits and bounces up and back off it (a heavy head on a stiff neck, not a whip)
    // and the hips swing on round the stop, the way it was already turning, else off the side it struck on
    { const sg = Math.abs(this.om) > 0.05 ? Math.sign(this.om) : Math.abs(toward) > 0.05 ? -Math.sign(toward) : (Math.floor(this.t * 7) % 2 ? -1 : 1); this.yawKick = { w: sg * 0.45 * k * frontal / 8, t: 0 }; }
    // glancing: the shoulder and hip are put against it, leaning into the surface while it slides (held below, in _bodyCollide)
    { const W = this.wallLean || (this.wallLean = { x: 0, T: 0 }); W.T = clamp(0.035 * k * toward + Math.sign(toward) * 0.08 * (Math.abs(toward) > 0.3 ? 1 : 0), -0.22, 0.22); } this.sway.v += clamp(0.12 * k * toward, -0.6, 0.6); this.twistYaw.v += 0.12 * k * toward;
    this.ux += nx * 0.05 * k * (0.4 + frontal); this.uz += nz * 0.05 * k * (0.4 + frontal);      // a little recoil off it
    this.stagT = this.t + 0.1 + 0.08 * frontal;      // the stagger: a foot goes as the recoil comes (below, in _locomote)
    C.t = 0; C.dur = clamp(0.5 + 0.1 * k + 0.07 * Math.abs(this.v), 0.5, 1.5); C.at = this.t; C.from = Math.abs(this.v); C.v0 = C.from; C.tan = Math.abs(1 - frontal);
    // knocking a corner at a run throws it off its stride: a share of its speed goes at once and comes back over the recovery
    // (a tight turn round a container at a run costs it about a second against a clean line)
    { const hard = sstep(1, 3, k) * sstep(3, 7, Math.abs(this.v)), loss = 0.65 * hard * Math.max(C.tan, 0.5); this.v *= 1 - loss; C.from *= 1 - 0.5 * loss; C.keep = C.tan > 0.5 ? (1 - loss) / (1 - 0.5 * loss) : 0;      /* (a glancing blow: the jolt is the loss; the recovery starts from what it left) */ C.dur = clamp(C.dur + 0.5 * hard, 0.5, 2.0); C.hard = hard;
      // the hips swing wide off what it struck: the heading is thrown off the line, away from it, and has to be won back
      if (C.tan > 0.3 && hard > 0.05) { const sgA = -Math.sign(toward) || 1; this.yawKick = { w: sgA * 0.9 * hard * C.tan, t: 0 }; this.ux += nx * 0.4 * hard; this.uz += nz * 0.4 * hard; } }
    // What the eye is to see of it (owner 2026-11-15: "its head just butted against it ... in the other scenarios i couldnt tell
    // that anything happened"), each scaled to the knock (species.crash):
    { const CR = this.species.crash || {}, hard = C.hard || 0;
      // head-on, it reels: eyes shut on the blow, the head thrown up and back off what it hit and the body dropped on bent legs
      // (the startle's own machinery), then it gives ground, a step or two backwards, shakes its head and only then gathers itself
      const reel = sstep(CR.reelFrom ?? 2.5, CR.reelFull ?? 6.5, k) * sstep(0.45, 0.8, frontal); C.reel = reel; C.shook = reel < (CR.shakeFrom ?? 0.35); C.nx = nx; C.nz = nz;
      if (k > 2) this.blink = Math.max(this.blink, 0.22 + 0.4 * Math.max(reel, hard));
      if (reel > 0.05) {
        if (this.gesture('startle', { x: P.x - nx * 2, y: P.y, z: P.z - nz * 2 }, { over: true, force: reel })) { this.act.crash = true; this.events.pop(); /* (no 'startle' event: nothing surprised it but the wall, and the contact event speaks for that) */ const S = this.pendingShove; if (S) { const g = 0.5 + 1.1 * reel; S.x = nx * 1.6 * g; S.z = nz * 1.6 * g; } }
        C.dur = Math.max(C.dur, lerp(1.2, 2.4, reel)); this.head.pitchV += 0.5 * reel;
      }
      // glancing, it stumbles: thrown hard against the surface and off it again, the chest dropping over a leg that was not ready,
      // the head rocked toward the side it struck on
      const gl = (CR.stumble ?? 1) * sstep(1, 2.6, k) * sstep(3, 7, C.v0) * sstep(0.25, 0.6, C.tan);
      if (gl > 0.02) { const sg = Math.sign(toward) || 1, W = this.wallLean; W.T = clamp(W.T + sg * 0.2 * gl, -0.4, 0.4);
        this.chestDip.v += 2.4 * gl; this.pPitch.v -= 1.1 * gl; this.py.v -= 1.6 * gl; this.sway.v += sg * 1.0 * gl; this.head.tilt.v += sg * 5 * gl; this.head.vel.y -= 2.0 * gl; C.bounce = { t: 0.22, k: 0.9 * gl }; C.blow = { gl, sg, P: { x: P.x, y: P.y, z: P.z }, b2: false, b3: false }; this.blink = Math.max(this.blink, 0.18 + 0.25 * gl); } else C.blow = null; }
    let kind = 'solid', best = 0; const T = this.terrain;
    if (T.near) for (const c of T.near(P.x, P.z, (this._hitR || 1) + 0.8)) { const g = c.seg; let qx = c.x, qz = c.z; if (g) { const ex = g.bx - g.ax, ez = g.bz - g.az, l2 = ex * ex + ez * ez, u = l2 > 0 ? clamp(((P.x - g.ax) * ex + (P.z - g.az) * ez) / l2, 0, 1) : 0; qx = g.ax + ex * u; qz = g.az + ez * u; } const d = (c.r || 0) + 2 - Math.hypot(P.x - qx, P.z - qz); if (d > best) { best = d; kind = c.kind || 'solid'; } }
    if (!partIn) this.events.push({ type: 'contact', part, surface: kind, force: +vin.toFixed(2), x: P.x, y: P.y, z: P.z, nx, ny: 0, nz });
    void hm;
  }

  /** Last word before the legs: bend the steering point around any rock the body would brush on the way there.
   *  Looks along the current momentum too, since at speed the animal goes where it was going, not where it looks. */
  _avoid(st) {
    const obs = this.terrain.obstacles; if (!obs || !obs.length) return st;
    const spd = Math.abs(this.v), look = 3 + 1.9 * spd;
    let dx = st.x - this.x, dz = st.z - this.z; const L = Math.hypot(dx, dz) || 1e-3;
    const ux = dx / L, uz = dz / L, mvx = Math.sin(this.psiV), mvz = Math.cos(this.psiV);
    let ox = 0, oz = 0;
    for (const o of obs) {
      const cx = o.x - this.x, cz = o.z - this.z, R = o.r + lerp(2.4, 0.3, this.arousal || 0);      // (worked up, it cuts closer)
      if (cx * cx + cz * cz > (look + R) ** 2) continue;
      for (const [ax, az, len, w] of [[ux, uz, Math.min(L, look), 1], [mvx, mvz, look, 0.6 * sstep(1.5, 5, spd)]]) {
        if (w <= 0) continue;
        const tA = clamp(cx * ax + cz * az, 0, len), px = ax * tA - cx, pz = az * tA - cz, d = Math.hypot(px, pz);
        if (d >= R) continue;
        const k = w * (R - d) / R * (1 - 0.5 * tA / Math.max(len, 1e-3));
        const nx = d > 1e-3 ? px / d : -az, nz = d > 1e-3 ? pz / d : ax;      // push sideways, out of the rock's way
        ox += nx * k * (R + 1.5); oz += nz * k * (R + 1.5);
      }
    }
    this.avoidK = Math.max(this.avoidK || 0, clamp(Math.hypot(ox, oz) / look, 0, 1));
    if (!ox && !oz) return st;
    return { x: st.x + ox, z: st.z + oz, rem: st.rem };
  }

  _steer(gx, gz) {
    if (!this.nav) return { x: gx, z: gz, rem: Math.hypot(gx - this.x, gz - this.z) };
    let P = this.path;
    const moved = P ? Math.hypot(P.gx - gx, P.gz - gz) : 1e9;
    if (!P || moved > 6 || (moved > 1.5 && this.t - P.t > 0.6) || this.t - P.t > 4) {
      P = this.path = { gx, gz, t: this.t, pts: this.nav.plan(this.x, this.z, gx, gz) };
      P.pts[P.pts.length - 1] = { x: gx, z: gz };
    } else { P.pts[P.pts.length - 1] = { x: gx, z: gz }; P.gx = gx; P.gz = gz; }
    while (P.pts.length > 1 && (Math.hypot(P.pts[0].x - this.x, P.pts[0].z - this.z) < 4 || this.nav.clear(this.x, this.z, P.pts[1].x, P.pts[1].z, 1.6 + 3 * (this.arousal || 0)))) P.pts.shift();      // (worked up, it takes a line closer past things: the turning room it keeps from them shrinks; BODY4)
    let rem = Math.hypot(P.pts[0].x - this.x, P.pts[0].z - this.z);
    for (let i = 1; i < P.pts.length; i++) rem += Math.hypot(P.pts[i].x - P.pts[i - 1].x, P.pts[i].z - P.pts[i - 1].z);
    // a point a little way along the route: steering at it rounds every corner into a curve
    const along = (L) => { let px = this.x, pz = this.z; for (const q of P.pts) { const d = Math.hypot(q.x - px, q.z - pz); if (d >= L) return { x: px + (q.x - px) * L / d, z: pz + (q.z - pz) * L / d }; L -= d; px = q.x; pz = q.z; } return { x: px, z: pz }; };
    const spd = Math.abs(this.v), c = along(Math.min(rem, 3.5 + 1.1 * spd));
    this.pathLook = along(Math.min(rem, 6 + (2.2 + 0.8 * (this.chaseK || 0)) * spd));
    // (BODY4) running at something, it steers at a point well on round the bend: it cuts the corner and clips it (the crash
    // response then costs it the moment); the line is taken only if it keeps the spine off the solid things (_grazeLine), so it
    // grazes and knocks a corner, it does not ram a face; calm, it keeps to the planned line
    const ka = (this.chaseK || 0) * sstep(3, 6, spd);
    if (ka > 0.01) for (const f of [1, 0.75, 0.5, 0.25]) { const x = c.x + (this.pathLook.x - c.x) * ka * f, z = c.z + (this.pathLook.z - c.z) * ka * f; if (this._grazeLine(x, z, -0.05)) return { x, z, rem }; }
    return { x: c.x, z: c.z, rem };
  }

  /** Whether the straight line from the hips to (x, z) keeps the spine at least `m` m off every solid thing (the world's query). */
  _grazeLine(x, z, m) {
    const T = this.terrain; if (!T.near) return true;
    const d = Math.hypot(x - this.x, z - this.z), n = Math.max(2, Math.ceil(d / 0.6)), gy = this.groundY;
    for (let i = 1; i <= n; i++) { const px = this.x + (x - this.x) * i / n, pz = this.z + (z - this.z) * i / n;
      for (const c of T.near(px, pz, m + 1)) { if ((c.top ?? 99) < gy + 0.6 || (c.bot !== undefined && c.bot > gy + 3)) continue; let qx = c.x, qz = c.z; const g = c.seg; if (g) { const ex = g.bx - g.ax, ez = g.bz - g.az, l2 = ex * ex + ez * ez, u = l2 > 0 ? clamp(((px - g.ax) * ex + (pz - g.az) * ez) / l2, 0, 1) : 0; qx = g.ax + ex * u; qz = g.az + ez * u; } if (Math.hypot(px - qx, pz - qz) - (c.r || 0) < m) return false; } }
    return true;
  }

  // ---------------------------------------------------------------- feet
  _feet(dt) {
    const T = this.terrain;
    const spd = Math.abs(this.v), m = sstep(0.15, 0.7, spd), dir = this.v >= 0 ? 1 : -1;
    const D = gait.stepLen(spd), dty = gait.duty(spd), w = gait.track(spd);
    const S2 = dty * D, Tstep = D / Math.max(spd, 0.5);
    const vx = Math.sin(this.psiV) * dir, vz = Math.cos(this.psiV) * dir;
    const fx = Math.sin(this.psi), fz = Math.cos(this.psi), lx = fz, lz = -fx;
    const [A, B] = this.feet;

    for (const foot of this.feet) if (!foot.planted) this._swing(foot, dt);

    const mFl = sstep(8.5, 10.5, spd);
    // hip travel over two planted feet since the last landing: the gait's double support carries the hips (2 duty - 1) of a step
    {
      const D2 = this._ds || (this._ds = { d: 0, x: this.x, z: this.z });
      if (A.planted && B.planted) D2.d += Math.hypot(this.x - D2.x, this.z - D2.z); else D2.d = 0;
      D2.x = this.x; D2.z = this.z;
    }
    if (A.planted || B.planted) {
      const wantLin = Math.abs(this.vReq ?? this.vT) > 0.3, wantTurn = Math.abs(this.omT) > 0.12, both = A.planted && B.planted;
      let best = null;
      for (const foot of this.feet) {
        if (!foot.planted) continue;
        const s = foot.s, o = this.feet[foot === A ? 1 : 0];
        const hx = this.x + lx * s * w + fx * s * 0.1 * (1 - m), hz = this.z + lz * s * w + fz * s * 0.1 * (1 - m);
        const rx = foot.pos.x - hx, rz = foot.pos.z - hz;
        const along = rx * vx + rz * vz, lat = Math.abs(rx * vz - rz * vx);
        const lagTol = lerp(0.36, S2, m);
        const nLin = along < 0 ? (-along + Math.min(spd * 0.1, 0.4)) / lagTol : along / lerp(lagTol + 0.4, 2 * lagTol + 1.5, m);     // a foot out in front while moving is about to be walked over, not a problem
        const nLat = lat / lerp(0.34, 0.6, m);
        const nYaw = Math.abs(wrap(foot.yaw - this.psi - s * 0.07)) / lerp(0.36, 0.5, m);
        let need = Math.max(Math.hypot(nLin, nLat), nYaw);
        if (spd < 0.35 && both) {             // initiation: step off first, do not let the body drift away
          if (wantLin) { const sg = Math.sign(this.vReq ?? this.vT); if ((rx * fx + rz * fz) * sg <= ((o.pos.x - this.x) * fx + (o.pos.z - this.z) * fz) * sg) need += 1.05; }      // (a body at rest is set going by a step, never by sliding over both feet)
          else if (wantTurn && Math.sign(this.omT) === s) need += Math.abs(this.omT) > 0.3 && foot !== this.lastStepFoot ? 1.05 : 0.55;      // a real turn from rest starts with a step round (the foot on the turning side opens), not a twist over two planted feet; then the feet alternate
        }
        const uu = Math.hypot(this.ux, this.uz);
        if (uu > 0.15 && (rx * this.ux + rz * this.uz) < ((o.pos.x - this.x) * this.ux + (o.pos.z - this.z) * this.uz)) need += 0.15;   // pushed: the trailing foot goes first
        if (this.pre && this.pre.foot === foot) need += 0.2;      // once a foot has started unloading, commit to it
        if (foot === this.lastStepFoot) need -= 0.08;
        if (this.injury && this.injury.sev > 0.05 && this.feet[this.injury.foot] === foot && both && spd > 0.3) need += 0.45 * this.injury.sev;      // off the sore foot as soon as the other is down
        // the stance cannot carry the body where it is asked to go, or where its own speed takes it, before a new foot could be
        // down: the foot that would go next goes now (from rest this is the first step, at any speed: no slide over two planted feet)
        // and two planted feet carry the hips no further than the gait's double support at this pace: past it the next foot goes
        // (whatever the speed: a gate on low speed let the body slide a metre once it had started moving or backing)
        const dsMax = Math.max(0, 2 * dty - 1) * D + 0.25;
        const lunge = this.t - (this.lungeReq ?? -9) < 0.05;
        foot.forced = both && foot === this.supGo && (lunge || Math.abs(this.vReq ?? this.vT) > this.supCap + 0.05 || (spd + (this.supU || 0)) * this.supT > this.supRoom || this._ds.d > dsMax);
        if (foot.forced) need = Math.max(need, 1.05);
        foot.need = need;
        // (BODY4) how long this foot has wanted to step: a standing animal's settling step waits for an error that persists
        foot.nT = need >= 1 ? (foot.nT || 0) + dt : 0;
        if (!best || need > best.need) best = foot;
      }
      const other = this.feet[best === A ? 1 : 0];
      const since = this.t - Math.max(A.tLand, B.tLand);
      const turnK = sstep(0.1, 0.3, Math.abs(this.om)) * (1 - m);
      if (!this.stalkPause || this.stalkPause.t !== Math.max(A.tLand, B.tLand)) this.stalkPause = { t: Math.max(A.tLand, B.tLand), d: this.rand.range(0.3, 1.3) };
      const dsSpent = this._ds.d > Math.max(0, 2 * dty - 1) * D + 0.25;      // the hips have gone as far over two planted feet as double support takes them
      let dsMin = Math.max(lerp(lerp(0.26, 0.1, turnK), Math.max(0.02, (dty - 0.5) * 2 * Tstep * 0.6), m), this.stalk > 0.5 && !dsSpent ? this.stalkPause.d * (1 - sstep(1.15, 1.8, best.need)) * (1 - sstep(1.3, 2.2, spd)) : 0);   // the deliberate pause gives way when momentum demands a step (or the hips have used up the double support: no slide)
      if (this.injury && this.injury.sev > 0.05 && other === this.feet[this.injury.foot]) dsMin *= 1 - 0.8 * this.injury.sev;      // the sore foot just took the weight: the good one hurries off to take it back
      // at a sprint the trailing foot may leave before the leading one lands: a flight phase
      const ou = other.planted ? 1 : other.sw.t / other.sw.T;
      // (a foot whose leg is about to run out of length goes now, double support or not: it cannot carry the hips any further)
      const spent = other.planted && best === this.supGo && (best.room < (spd + (this.supU || 0)) * 0.1 || this.t - (this.lungeReq ?? -9) < 0.05);
      const spentSoon = other.planted && best === this.supGo && (best.room < (spd + (this.supU || 0)) * 0.35 || this.t - (this.lungeReq ?? -9) < 0.05);      // no time for a weight shift
      const ok = other.planted ? since >= dsMin || spent : (mFl > 0 && ou > lerp(1, 0.5, mFl));
      const inj = this.injury && this.injury.sev > 0.05 ? this.injury : null, bad = inj ? this.feet[inj.foot] : null;
      if (this.lying) { this.pre = null; }
      // a sore foot held up off the ground while it stands
      else if (bad && this.holdFootReq && inj.sev > 0.3 && spd < 0.2 && both && Math.abs(this.omT) < 0.05) this._lift(bad, m, dty, Tstep, spd);
      // (BODY4) standing with nothing asked of the body (no travel, no turn, no lunge, the stance not running out), a foot is only
      // re-set for an error in its place or heading that has lasted (0.4 s; frozen 0.8 s and a larger error): small turn and
      // weight-shift requests while it stands no longer lift a foot again and again
      else if (best.need >= 1 && ok && !(spd < 0.3 && both && !wantLin && !wantTurn && !best.forced && !spent && !spentSoon && Math.abs(this.om) < 0.05 && best.need < 1.6 + (this.freeze ? 1.4 : 0) && (best.nT < (this.freeze ? 0.8 : 0.4) || best.need < (this.freeze ? 1.35 : 1)))) {
        if (this.pre && this.pre.foot === best) { this.pre.t -= spentSoon ? 9 : dt; if (this.pre.t <= 0) this._lift(best, m, dty, Tstep, spd); }
        else { const pt = spentSoon ? 0 : lerp(lerp(0.24, 0.13, turnK), 0, m); if (pt < 0.02) this._lift(best, m, dty, Tstep, spd); else this.pre = { foot: best, t: pt }; }
      } else this.pre = null;
    }

    for (const foot of this.feet) {
      // a sore foot carries as little as it can: some of its share when the other is down too, most of it when it must
      const sore = this.injury && this.feet[this.injury.foot] === foot ? this.injury.sev : 0, oth = this.feet[foot === A ? 1 : 0];
      const tgt = (!foot.planted ? 0 : this.pre && this.pre.foot === foot ? 0.2 : 1) * (1 - sore * (oth.planted ? 0.75 : 0.15));
      if (foot.jerk) {
        const J = foot.jerk; J.t += dt; const a = sstep(0, 0.12, J.t) * (1 - sstep(0.5, 0.9, J.t)) * J.k;
        const hx = this.hc.x - J.base.x, hz = this.hc.z - J.base.z, hl = Math.hypot(hx, hz) || 1;
        foot.pos.set(J.base.x + hx / hl * 0.55 * a, J.base.y + 0.32 * a, J.base.z + hz / hl * 0.55 * a);
        if (J.t >= J.dur || !foot.planted) { if (foot.planted) foot.pos.copy(J.base); foot.jerk = null; }
      }
      foot.load += (tgt - foot.load) * expK(dt, lerp(0.14, 0.07, m));
      if (foot.planted) foot.gy = foot.jerk ? foot.jerk.base.y : foot.pos.y;
    }
    void T;
  }

  _lift(foot, m, dty, Tstep, spd) {
    const other = this.feet[foot.s === 1 ? 1 : 0];
    const base = clamp((1 - dty) * 2 * Tstep, 0.34, 0.6);
    let T = lerp(lerp(0.54, 0.44, sstep(0.1, 0.3, Math.abs(this.om))), base, m);
    T *= 1 + 0.2 * this.stalk;      // a stalking step is slow and high, but at most ~0.75 s off the ground (0.3 here with the hover below made 0.87 s: a foot held up)
    const inj = this.injury && this.injury.sev > 0.05 ? this.injury : null, sore = inj && this.feet[inj.foot] === foot;
    if (inj) T *= sore ? 1 + 0.22 * inj.sev : 1 - 0.38 * inj.sev;      // the sore foot is carried through carefully; the good one is hurried down under the body
    const oLand = other.planted ? other.tLand : this.t + (other.sw.T - other.sw.t);
    if (m > 0.5 && !inj) T = clamp(oLand + Tstep - this.t, 0.8 * T, 1.25 * T);   // pull the two legs toward even spacing (a limp is not even)
    // and never longer than the stance leg can carry the hips meanwhile (_support): the foot comes down before the other runs out
    if (other.planted && isFinite(other.room) && spd > 0.5) T = Math.max(0.28, Math.min(T, Math.max(0, other.room) / (spd + (this.supU || 0))));
    const p0 = foot.mtp.clone().addScaledVector(foot.n, -this.FT.pad);
    foot.sw = { p0, frz0: !!this.freeze, fix: spd < 0.3 && Math.abs(this.vReq ?? this.vT) <= 0.3 && Math.abs(this.omT) <= 0.12 && !foot.forced, yaw0: foot.yaw, n0: foot.n.clone(), t: 0, T, clr: lerp(0.3, 0.5, m) + 0.45 * sstep(3, 8, spd) + 0.4 * this.stalk + (sore ? 0.25 * inj.sev : 0), beta0: foot.beta, p1: foot.pos.clone(), yaw1: foot.yaw, n1: foot.n.clone() };
    foot.planted = false; this.pre = null; this.lastStepFoot = foot;
    foot.pos.copy(p0); foot.pitch = -foot.beta;      // the swing starts exactly where the stance pose left the foot
    this.events.push({ type: 'liftoff', foot: foot.s === 1 ? 0 : 1, x: foot.pos.x, y: foot.pos.y, z: foot.pos.z });
  }

  _swing(foot, dt) {
    const T = this.terrain, sw = foot.sw, s = foot.s;
    const inj = this.injury && this.injury.sev > 0.05 ? this.injury : null, sore = inj && this.feet[inj.foot] === foot;
    // a freeze never leaves a foot hanging: the step in the air is finished, quickly and quietly, to the nearest sound placement
    // (early in the swing back down near where it lifted, later a short step under the body), so it stands frozen on two feet.
    // (It used to hold the foot up for as long as the freeze lasted: an animal stood watching on one leg, knee raised, for
    // seconds; out/skel/BODYFIX2.md.) Only a sore foot is still held up off the ground, and only over a body that stands.
    const still = Math.abs(this.v) < 0.3 && Math.hypot(this.ux, this.uz) < 0.15;
    // (BODY4: only a step that was under way when the freeze came is put back; one lifted while frozen, or to set a foot right
    // while standing, is finished where it was going: putting those back left the error, and the foot lifted again a second later)
    if (this.freeze && !sw.frz) { sw.frz = true; if (!sw.frz0 && !sw.fix && sw.t / sw.T < 0.3 && still && Math.abs(this.om) < 0.12) sw.back = true; }
    const hold = still && sore && this.holdFootReq && !this.lying && Math.abs(this.vT) < 0.05 && sw.t / sw.T > 0.3 && sw.t / sw.T < 0.6;
    // a swing that would come down after the standing leg has run out of length is hurried (_support: the other foot's room)
    const ot0 = this.feet[s === 1 ? 1 : 0], sp0 = Math.abs(this.v) + (this.supU || 0);
    const hurry = ot0.planted && isFinite(ot0.room) && sp0 > 0.5 ? clamp((sw.T - sw.t) / Math.max(0.12, ot0.room / sp0), 1, 1.8) : 1;
    sw.rate = (sw.rate ?? 1) + ((hold ? 0 : Math.max(hurry, this.freeze && still ? 1.5 : 1)) - (sw.rate ?? 1)) * (1 - Math.exp(-dt / 0.12));      // a held foot slows to a stop, it does not snap still
    sw.t += sw.rate * dt * (1 - 0.3 * this.stalk * (1 - Math.abs(sw.t / sw.T - 0.5) * 2));
    const u = Math.min(sw.t / sw.T, 1);
    if (u < 0.8) {
      const tr = sw.T - sw.t;
      const vP = this.v + this.acc * (tr * 0.5 + 0.25), spdP = Math.abs(vP), mP = sstep(0.15, 0.7, spdP);
      const psiTd = this.psi + this.om * tr, hv = this.psiV + this.om * tr * 0.5;
      const trav = Math.max(0, this.v * tr + 0.5 * this.acc * tr * tr) * (this.v >= 0 ? 1 : 0) + (this.v < 0 ? this.v * tr : 0);
      const cx = this.x + Math.sin(hv) * trav + this.ux * 0.55, cz = this.z + Math.cos(hv) * trav + this.uz * 0.55;
      const Dp = gait.stepLen(spdP), dtyP = gait.duty(spdP), wP = gait.track(spdP);
      const stanceT = lerp(lerp(0.6, 0.9, sstep(0.1, 0.3, Math.abs(this.om))), (dtyP * 2 * Dp) / Math.max(spdP, 0.5), mP);
      const psiMs = psiTd + clamp(this.om * stanceT * 0.5, -0.22, 0.22);     // anticipate the turn, but a foot never lands splayed
      const lead = clamp(dtyP * Dp * mP * Math.sign(vP), -1.2, 1.95) * (inj && !sore ? 1 - 0.35 * inj.sev : 1), hl = this.psiV + this.om * tr;     // never reach further than the leg can take weight; a limp takes short steps with the good leg
      const tx = cx + Math.sin(hl) * lead + Math.cos(psiMs) * s * wP + Math.sin(psiTd) * s * 0.1 * (1 - mP);
      const tz = cz + Math.cos(hl) * lead - Math.sin(psiMs) * s * wP + Math.cos(psiTd) * s * 0.1 * (1 - mP);
      // never plant across the standing leg: keep to this foot's own side of it
      const ot = this.feet[s === 1 ? 1 : 0], lxx = Math.cos(psiTd), lzz = -Math.sin(psiTd);
      // how far apart side to side: a foot's width when the two would land beside each other, much less when a stride apart (the
      // prints of a narrow trackway nearly touch the midline; only the shanks need to clear)
      // two rules: the foot stays on its own side of the standing one by at least `footGap.midline` (a narrow trackway, prints near
      // the midline, never across it), and the two footprints (heel to toes, each along its own yaw) never overlap, so feet set down
      // side by side, or one turned in on the spot, keep a foot's width apart while feet a stride apart can come close to the line
      const FG = this.H.footGap, FP = this.H.footprint, sy1 = Math.sin(psiMs), cy1 = Math.cos(psiMs), sy0 = Math.sin(ot.yaw), cy0 = Math.cos(ot.yaw);
      const deficit = (px, pz) => {
        const mid = FG.midline - s * ((px - ot.pos.x) * lxx + (pz - ot.pos.z) * lzz);
        // a print is a narrow heel-to-toe strip (radius r) and, when the species gives one, the toes' fan ahead of it (`fan`: a
        // short strip from a0 to a1 along the foot, radius fr): two prints may not overlap, any part against any part
        const F = FP.fan, qx = px + lxx * s, qz = pz + lzz * s;
        const parts = (x, z, sY, cY) => { const P = [[x - sY * FP.heel, z - cY * FP.heel, x + sY * FP.toe, z + cY * FP.toe, FP.r]]; if (F) P.push([x + sY * F.a0, z + cY * F.a0, x + sY * F.a1, z + cY * F.a1, F.r]); return P; };
        const PO = parts(ot.pos.x, ot.pos.z, sy0, cy0);
        const clr = (sh) => { let m = 9; for (const a of parts(px + lxx * s * sh, pz + lzz * s * sh, sy1, cy1)) for (const b of PO) m = Math.min(m, segGap(a[0], a[1], a[2], a[3], b[0], b[1], b[2], b[3]) - a[4] - b[4]); return m; };
        void qx; void qz;
        let ov = 0; if (clr(0) < 0) { let lo = 0, hi = 1.2; for (let k = 0; k < 8; k++) { const md = (lo + hi) / 2; if (clr(md) < 0) lo = md; else hi = md; } ov = hi; }
        return Math.max(mid, ov);
      };
      const need = deficit(tx, tz);
      let tx2 = need > 0 ? tx + lxx * s * need : tx, tz2 = need > 0 ? tz + lzz * s * need : tz;
      // asked to put a foot down on something (pinning): the step that lands nearest it is placed on it, as far as the leg reaches
      if (this.plantAt) { const P = this.plantAt, dP = Math.hypot(tx2 - P.x, tz2 - P.z), ds = s * ((P.x - ot.pos.x) * lxx + (P.z - ot.pos.z) * lzz); if (dP < 2.2 && ds > 0.45) { tx2 = P.x; tz2 = P.z; } }
      const ffx = Math.sin(psiMs), ffz = Math.cos(psiMs);
      let gy = T.height(tx2, tz2);
      for (const [a, b] of [[0.75, 0], [-0.3, 0], [0.45, 0.28], [0.45, -0.28]]) gy = Math.max(gy, T.height(tx2 + ffx * a + ffz * b, tz2 + ffz * a - ffx * b) - 0.04);
      // never step further than the leg can reach from where the hip will be when this foot lands:
      // the ankle sits ~0.47 metatarsus behind and the pad plus ~0.88 metatarsus above the landing point of a flat foot (0.4 and 0.87 m for a 0.92 m metatarsus)
      {
        const yH = psiTd + (this.pTurn || 0), hx = cx + Math.cos(yH) * s * DIM.hipHalf, hz = cz - Math.sin(yH) * s * DIM.hipHalf, hy = Math.min(this.py.x, this.py.x + (this.py.v || 0) * tr) - 0.04;
        const mB = 0.47 * DIM.meta, ax = tx2 - ffx * mB, az = tz2 - ffz * mB, ay = gy + this.FT.pad + 0.88 * DIM.meta;
        const vert = hy - ay, maxA = Math.sqrt(Math.max(0.1, (RMAX * 0.96) ** 2 - vert * vert));
        const ddx = ax - hx, ddz = az - hz, dd = Math.hypot(ddx, ddz);
        if (dd > maxA) { const k = maxA / dd, nx = hx + ddx * k + ffx * 0.4, nz = hz + ddz * k + ffz * 0.4; sw.p1.set(nx, Math.max(T.height(nx, nz), gy - 0.3), nz); }
        else sw.p1.set(tx2, gy, tz2);
        // the reach limit can pull the foot inward: re-check the side gap against the standing foot last
        const g2 = s * ((sw.p1.x - ot.pos.x) * lxx + (sw.p1.z - ot.pos.z) * lzz), n2 = deficit(sw.p1.x, sw.p1.z); void g2;
        if (n2 > 0) { sw.p1.x += lxx * s * n2; sw.p1.z += lzz * s * n2; sw.p1.y = Math.max(T.height(sw.p1.x, sw.p1.z), sw.p1.y - 0.3); }
      }
      // nor onto a trunk or a stem: a landing that would put the foot or the toes into one is moved aside, off it
      if (T.near) for (let it = 0; it < 2; it++) {
        const CK = this._cBegin();
        for (const [a, rr] of [[0, 0.38], [0.55, 0.3], [0.95, 0.22]]) this._cSample(sw.p1.x + ffx * a, sw.p1.y + 0.25, sw.p1.z + ffz * a, rr, lxx * s, lzz * s);
        if (!this._cEnd() || (!CK.px && !CK.pz)) break;
        sw.p1.x += CK.px * 1.1; sw.p1.z += CK.pz * 1.1; sw.p1.y = Math.max(T.height(sw.p1.x, sw.p1.z), sw.p1.y - 0.3);
      }
      sw.yaw1 = psiMs + s * 0.07;
      // the foot plane is the ground's mean slope under the whole foot (heel pad and the three toe tips), as far as the ankle
      // lets it tilt (`foot.tiltMax`); whatever the ground does under each toe beyond that the toes take up (_leg: conformity)
      {
        const TL = this.FT.toes[1], sy = Math.sin(sw.yaw1 ?? psiMs), cy = Math.cos(sw.yaw1 ?? psiMs), hb = T.height(sw.p1.x - sy * 0.15, sw.p1.z - cy * 0.15);
        const hf = T.height(sw.p1.x + sy * TL, sw.p1.z + cy * TL), hlft = T.height(sw.p1.x + sy * 0.5 * TL + cy * 0.35, sw.p1.z + cy * 0.5 * TL - sy * 0.35), hrt = T.height(sw.p1.x + sy * 0.5 * TL - cy * 0.35, sw.p1.z + cy * 0.5 * TL + sy * 0.35);
        // slope along the foot and across it (left up +): the ankle is a hinge, so the foot pitches with the ground but hardly
        // rolls (`tiltRoll`); the toes on the high and low sides take up the cross-slope by reaching up or down to the ground
        const tr = Math.tan(this.FT.tiltRoll ?? 0.12), gf = (hf - hb) / (TL + 0.15), gl = clamp((hlft - hrt) / 0.7, -tr, tr);
        sw.n1.set(-gf * sy - gl * cy, 1, -gf * cy + gl * sy).normalize();
        const tm = this.FT.tiltMax;
        if (sw.n1.y < Math.cos(tm)) { const hl = Math.hypot(sw.n1.x, sw.n1.z); sw.n1.set(sw.n1.x / hl * Math.sin(tm), Math.cos(tm), sw.n1.z / hl * Math.sin(tm)); }
        // and the foot's height: the support plane through the ground under the MTP pad, raised only as far as needed that no
        // ground under the foot stands more than the toes can bend up to meet (`conform`) above it (the old rule, the highest
        // ground anywhere under the foot, suited a rigid plate and left the pad floating on a slope)
        const h0 = T.height(sw.p1.x, sw.p1.z), ny = sw.n1.y, kx = -sw.n1.x / ny, kz = -sw.n1.z / ny;
        let lift = 0;
        for (const [a, b] of [[TL, 0], [0.75 * TL, 0], [0.5 * TL, 0.35], [0.5 * TL, -0.35], [-0.3, 0], [-0.15, 0.2], [-0.15, -0.2]]) {
          const px = sw.p1.x + sy * a + cy * b, pz = sw.p1.z + cy * a - sy * b;
          lift = Math.max(lift, T.height(px, pz) - (h0 + kx * (px - sw.p1.x) + kz * (pz - sw.p1.z)) - 0.07);
        }
        sw.p1.y = h0 + lift;
      }
      if (sw.back) { sw.p1.set(sw.p0.x, T.height(sw.p0.x, sw.p0.z), sw.p0.z); sw.p1.y = Math.max(sw.p1.y, sw.p0.y - this.FT.pad - 0.05); sw.n1.copy(sw.n0); }      // put back down where it was (turned to the body's heading, which may have moved on)
      foot.target.copy(sw.p1);
      sw.bow = undefined;
    }
    // the foot does not travel on an arc: it peels up first, folds and is carried through, then reaches out and plants
    const fast = sstep(2.5, 6, Math.abs(this.v)), uh = sstep(0.1, 0.9, u), eW = uh * uh * uh * (uh * (uh * 6 - 15) + 10), wR = Math.pow(u, 0.82), eR = wR * wR * (3 - 2 * wR);
    const e = lerp(eW, eR, fast);
    const cl = Math.cos(this.psi), sl = Math.sin(this.psi);
    if (sw.bow === undefined) {      // how far out the swing must bow to pass the standing foot
      const o = this.feet[s === 1 ? 1 : 0], mx = (sw.p0.x + sw.p1.x) / 2, mz = (sw.p0.z + sw.p1.z) / 2;
      const gap = s * ((mx - o.pos.x) * cl - (mz - o.pos.z) * sl);
      sw.bow = clamp(this.H.swingClear - gap, 0.12, 0.6);
      // and round any stem or trunk in the way of the swing: the foot is carried out past it, not through it
      sw.dgx = 0; sw.dgz = 0;
      if (T.near) for (let k = 1; k <= 4; k++) {
        const q = k / 5, CK = this._cBegin(), px = lerp(sw.p0.x, sw.p1.x, q) + cl * s * sw.bow * Math.sin(Math.PI * q), pz = lerp(sw.p0.z, sw.p1.z, q) - sl * s * sw.bow * Math.sin(Math.PI * q);
        this._cSample(px, lerp(sw.p0.y, sw.p1.y, q) + 0.3, pz, 0.45, cl * s, -sl * s);
        if (this._cEnd() && (CK.px || CK.pz)) { const w = 1 / Math.max(0.3, Math.sin(Math.PI * q)); if (Math.hypot(CK.px * w, CK.pz * w) > Math.hypot(sw.dgx, sw.dgz)) { sw.dgx = CK.px * w; sw.dgz = CK.pz * w; } }
      }
      const dl = Math.hypot(sw.dgx, sw.dgz); if (dl > 0.9) { sw.dgx *= 0.9 / dl; sw.dgz *= 0.9 / dl; }
    }
    const circ = s * sw.bow * Math.sin(Math.PI * u);     // the swinging foot bows out around the standing leg
    const dg = Math.sin(Math.PI * u);
    let x = lerp(sw.p0.x, sw.p1.x, e) + cl * circ + (sw.dgx || 0) * dg, z = lerp(sw.p0.z, sw.p1.z, e) - sl * circ + (sw.dgz || 0) * dg;
    // the foot is carried with the body: it reaches out ahead of the hip only as far as the leg is long from where the hip is
    // now (the landing was chosen for where the hip will be; a body still gathering speed gets there later than the foot would)
    if (this._hipOk) {
      const hx = this.hc.x + this.pl.x * s * DIM.hipHalf, hz = this.hc.z + this.pl.z * s * DIM.hipHalf, mB = 0.47 * DIM.meta;
      const ahead = (x - sl * mB - hx) * sl + (z - cl * mB - hz) * cl, side = (x - hx) * cl - (z - hz) * sl;
      const vert = this.py.x - (lerp(sw.p0.y, sw.p1.y, e) + this.FT.pad + 0.88 * DIM.meta), mA2 = (RMAX * 0.97) ** 2 - vert * vert - side * side;
      const mA = Math.sqrt(Math.max(0.04, mA2)), ex0 = ahead - mA, W = 0.15, ex = ex0 <= -W ? 0 : ex0 >= W ? ex0 : (ex0 + W) * (ex0 + W) / (4 * W);      // (eased in: no kink in the foot's path)
      const exk = ex * (1 - sstep(0.82, 1, u));      // (gone by touchdown: the landing itself was placed for where the hip will be)
      if (exk > 0) { x -= sl * exk; z -= cl * exk; }
    }
    const uw = Math.pow(u, lerp(0.72, 0.95, fast)), lift = sw.clr * 16 * uw * uw * (1 - uw) * (1 - uw) * (1 + 0.3 * (1 - fast));
    const y = Math.max(lerp(sw.p0.y, sw.p1.y, e) + lift, T.height(x, z) + 0.35 * lift + 0.02);
    foot.pos.set(x, y, z);
    foot.gy = lerp(sw.p0.y, sw.p1.y, e);
    foot.yaw = sw.yaw0 + wrap(sw.yaw1 - sw.yaw0) * e;
    foot.n.copy(sw.n0).lerp(UP, Math.sin(Math.PI * u) * 0.8).lerp(sw.n1, e).normalize();
    // toes: curled down while the foot is carried, lifted to meet the ground at the end
    const prof = u < 0.6 ? -lerp(0.85, 0.65, fast) * Math.sin((Math.PI * u) / 0.6) * (0.75 + 0.25 * this.stalk) : 0.32 * Math.sin((Math.PI * (u - 0.6)) / 0.4);
    foot.pitch = lerp(-sw.beta0, prof, sstep(0, 0.2, u));
    if (u >= 1) {
      foot.planted = true; foot.tLand = this.t; foot.pos.copy(sw.p1); foot.n.copy(sw.n1); foot.yaw = sw.yaw1;
      foot.pitch = 0; foot.beta = 0; foot.betaS = 0; foot.betaR = 0; foot.sw = null; foot.gy = foot.pos.y; foot.phi = 0;
      const spd = Math.abs(this.v);
      let intensity = clamp(0.42 + 0.075 * spd, 0, 1.4) * (1 - 0.45 * this.stalk) * (this.stompNext ? 2.0 : 1); this.stompNext = 0;
      if (sore) {      // put down gingerly, and still it hurts: a hitch up off it, a jerk of the head
        intensity *= 1 - 0.55 * inj.sev; const k = inj.sev * clamp(0.65 + 0.12 * spd, 0.65, 1.3);
        this._wince(k); this.events.push({ type: 'wince', foot: s === 1 ? 0 : 1, k, x: foot.pos.x, y: foot.pos.y, z: foot.pos.z });
      }
      foot.ank.v -= 2.4 * intensity; foot.spread.v += 2.2 * intensity; for (const q of foot.toeD) q.v -= 3.5 * intensity;     // the ankle gives, the toes slap flat and splay
      this.py.v -= 0.14 * intensity; this.chestDip.v -= 0.3 * intensity; this.pPitch.v -= 0.2 * intensity;      // each footfall nods the whole trunk about the hips; the tail answers this.armSwing.v -= 1.2 * intensity;
      this.events.push({ type: 'footfall', foot: s === 1 ? 0 : 1, x: foot.pos.x, y: foot.pos.y, z: foot.pos.z, yaw: foot.yaw, intensity });
    }
  }

  // ---------------------------------------------------------------- toes and ankle: the parts that make a foot alive
  // Each toe has two joints and its own lag; the ankle folds in the swing, reaches before contact, and gives under load.
  _toes(dt) {
    const fast = sstep(2.5, 6, Math.abs(this.v)), gain = [1.0, 0.72, 1.12];
    for (const foot of this.feet) {
      let ankT, prT, diT, spT, wnA = 15, zA = 0.5;
      if (foot.planted) {
        // the toes follow the ground under each of them and peel off it one joint at a time (_leg works out where that puts
        // them; here they are pulled there with their own lag); the fan opens under load and closes as the heel rolls up
        const b = foot.beta || 0, C = foot.toeC, SP = this.FT.splay;
        ankT = -0.05 * foot.load;
        prT = (d) => C ? C[d] : -0.04 * foot.load;
        diT = (d) => C ? C[3 + d] : -0.85 * b + 0.05;
        // the fan opens with the weight the foot takes once it is down and stays open: an ordinary weight shift (the other foot
        // landing, the body leaning over) does not close it; it closes only in the roll-off before the foot leaves the ground
        // (the heel coming up, b), when it follows the load down (owner: a tic of toes closing as if to lift on a standing foot)
        foot.spL = b > 0.05 ? Math.min(foot.spL ?? foot.load, foot.load) : Math.max(foot.spL ?? 0, foot.load);
        spT = lerp(SP.free, SP.loaded, foot.spL) * (1 - SP.roll * sstep(0.05, 0.6, b));
        // feet set down close beside each other: the toes close up rather than reach into the other foot's (the distance between
        // the two toe fans, 0.45 m ahead of each MTP pad, against what two fully spread fans need side by side). It is the foot
        // being set down that closes up, for both (k squared), decided as it lands and kept for its stance: a planted foot's fan
        // does not answer the other's steps (it did, both ways: the planted toes closed as the other landed beside them and opened
        // as it lifted, at every step)
        const ot = this.feet[foot.s === 1 ? 1 : 0];
        // (if the other then lands into its fan anyway, the planted foot draws its toes in, but slowly: a settling, never a tic)
        { const a = 0.45, d = Math.hypot(foot.pos.x + Math.sin(foot.yaw) * a - ot.pos.x - Math.sin(ot.yaw) * a, foot.pos.z + Math.cos(foot.yaw) * a - ot.pos.z - Math.cos(ot.yaw) * a), k = clamp((d - 0.4) / 0.5, 0.3, 1);
          if (foot.spC === undefined || foot.spC < 0) foot.spC = ot.planted ? Math.max(0.3, k * k) : 1;
          else if (ot.planted && k < foot.spC) foot.spC = Math.max(k, foot.spC - 0.15 * dt); }
        spT *= foot.spC;
        spT = Math.max(spT, SP.min ?? 0);
      } else {
        const sw = foot.sw, u = Math.min(1, sw.t / sw.T);
        const fold = (0.38 + 0.18 * fast) * (1 - 0.65 * sstep(6.5, 11, Math.abs(this.v))) * (1 - 0.4 * this.stalk);      // at a sprint the foot already rides high; folding more would jam the ankle into the hip
        ankT = fold * sstep(0, 0.28, u) * (1 - sstep(0.48, 0.86, u)) - 0.12 * (1 - fast) * sstep(0.8, 1, u);       // tuck, then reach
        const curl = Math.sin(Math.PI * Math.min(1, u / 0.62));
        prT = (d) => 0.25 * curl * gain[d] - 0.08 * sstep(0.7, 1, u);
        diT = (d) => (0.85 + 0.25 * this.stalk) * curl * gain[d] - 0.22 * sstep(0.72, 0.95, u);       // curled in the air, opened to meet the ground
        spT = lerp(this.FT.splay.min ?? 0.05, this.FT.splay.free + 0.06, sstep(0.66, 0.95, u));
        foot.spL = 0; foot.spC = -1;      // (set again from this landing on)
        wnA = 13; zA = 0.6;
      }
      foot.ank.step(ankT, wnA, zA, dt);
      foot.spread.step(spT, 16, 0.45, dt);
      for (let d = 0; d < 3; d++) {
        const lag = 1 - 0.12 * Math.abs(d - 1);       // outer toes trail the middle one
        foot.toeP[d].step(prT(d), 19 * lag, 0.55, dt);
        foot.toeD[d].step(diT(d), 24 * lag, 0.42, dt);
      }
    }
  }

  // ---------------------------------------------------------------- pelvis and back, posed from the feet
  _posture(dt) {
    const T = this.terrain, [L, R] = this.feet;
    const spd = Math.abs(this.v), m = sstep(0.15, 0.7, spd), mRun = sstep(3.5, 7.5, spd);
    const fx = Math.sin(this.psi), fz = Math.cos(this.psi), lx = fz, lz = -fx;
    const sum = L.load + R.load + 1e-3;
    const latL = (L.pos.x - this.x) * lx + (L.pos.z - this.z) * lz;
    const latR = (R.pos.x - this.x) * lx + (R.pos.z - this.z) * lz;

    // idle weight shift: settle onto one leg, then the other
    const idle = spd < 0.1 && this.vT === 0 && Math.abs(this.omT) < 0.05 && L.planted && R.planted && !(this.post && this.post.alert > 0.4);
    if (idle) {
      this.ws.timer -= dt;
      if (this.ws.timer <= 0) { const o = [-1, 0, 1].filter((k) => k !== this.ws.side); this.ws.side = o[this.rand() < 0.5 ? 0 : 1]; this.ws.timer = this.rand.range(5, 11); }
    } else { this.ws.side = 0; this.ws.timer = this.rand.range(2.5, 5); }
    const inj = this.injury && this.injury.sev > 0.05 ? this.injury : null, goodS = inj ? this.feet[1 - inj.foot].s : 0, sev = inj ? inj.sev : 0;
    if (inj && idle && sev > 0.2) this.ws.side = goodS;      // standing, it rests on the good leg
    const wsS = this.ws.side;
    const lie = clamp(this.lieS.x, 0, 1), lean = this.lieLean.x, wc = this.wince ? this.wince.k * Math.sin(Math.PI * clamp(this.wince.t / 0.45, 0, 1)) : 0;

    const swayT = (((L.load * latL + R.load * latR) / sum) * lerp(this.H.sway[0], this.H.sway[1], sstep(0.3, 3, spd)) + wsS * 0.2) * (1 - lie);
    this.sway.step(swayT, lerp(4.2, 7, m), 1, dt);

    const wl = 0.25 + 0.75 * L.load, wr = 0.25 + 0.75 * R.load;
    const gY = (L.gy * wl + R.gy * wr) / (wl + wr);
    let drop = 0, cap = Infinity;
    const Lv = 3.0;
    for (const foot of this.feet) {
      const u = foot.planted ? 1 : foot.sw.t / foot.sw.T;
      if (u < 0.2) continue;
      const yP = this.yawP ?? this.psi, hx = this.x + lx * this.sway.x + Math.cos(yP) * foot.s * DIM.hipHalf, hz = this.z + lz * this.sway.x - Math.sin(yP) * foot.s * DIM.hipHalf;      // the hip where the pelvis' own turn has put it
      const ddx = hx - foot.pos.x, ddz = hz - foot.pos.z;
      const dF = ddx * fx + ddz * fz, dL = ddx * lx + ddz * lz, d2 = dF * dF + dL * dL;
      if (foot.planted) drop += foot.load * (Lv - Math.sqrt(Math.max(Lv * Lv - d2, 1)));
      const k = sstep(-0.6, 0.6, dF), mk = DIM.meta / 0.92, cx = lerp(-0.75, 0.2, k) * mk, cy = lerp(0.5, 1.3, k) * mk;      // where the ankle is off the foot, scaled to the metatarsus
      const hh = RMAX * RMAX - (dF - cx) * (dF - cx) - dL * dL;
      cap = Math.min(cap, (foot.planted ? foot.pos.y : foot.sw.p1.y) + cy + Math.sqrt(Math.max(hh, 0.2)) + (1 - sstep(0.2, 0.95, u)) * 0.7);
    }
    drop /= sum;
    const windup = 0.14 * clamp(((this.vReq ?? this.vT) - this.v) / 6, 0, 1) * (1 - sstep(0, 2.5, spd));   // gathers itself before a hard start
    const PO = this.post || { alert: 0, display: 0, agit: 0, hold: 0 };
    // startle: a fast drop onto bent legs and a rear-up of the chest, held a beat, then released slowly
    const sa = this.act && this.act.kind === 'startle' ? this.act : null;
    const se = sa ? sstep(0, 0.09, sa.t) * (1 - sstep(0.5, 1.35, sa.t)) : 0; this.startleE = se;
    const crouch = 0.24 * se + 0.24 * PO.display + 0.36 * mRun + 0.5 * Math.min(1, this.lowness) + 0.72 * Math.max(0, this.lowness - 1) + (0.04 + (DIM.hipMove || 0)) * m + 0.26 * this.stalk + windup;
    const mFl = sstep(8.5, 10.5, spd);
    let yT = gY + DIM.hipHeight - crouch - lerp(1, -0.4, mRun) * drop + this.breath * 0.012 + 0.16 * mFl * (1 - Math.min(1, L.load + R.load));
    yT = Math.min(yT, cap - 0.03);
    if (lie > 0) yT = lerp(yT, gY + LIE_H, lie);      // down on its belly, sitting back on its heels
    this.py.step(yT, this.py.x > cap ? 13 : se > 0.05 ? 11 : 7.5, 0.9, dt);
    if (this.py.x > cap + 0.3) { this.py.x -= Math.min(this.py.x - cap - 0.3, 2.2 * dt); if (this.py.v > 0) this.py.v = 0; }     // legs too short for this height: sink, never snap

    const slope = (T.height(this.x + fx * 2.4, this.z + fz * 2.4) - T.height(this.x - fx * 2.4, this.z - fz * 2.4)) / 4.8;
    const pitchT = 0.55 * Math.atan(slope) - clamp(0.035 * this.acc, -0.09, 0.09) - 0.07 * mRun - 0.04 * mFl - 0.13 * this.lowness - 0.05 * this.stalk + 0.07 * this.roarEnv - 0.07 * PO.display + 0.04 * PO.alert + 0.11 * se - 0.2 * lean - 0.04 * lie + 0.12 * wc + (this.act && this.act.kind === 'tear' ? 0.09 * sstep(0.22, 0.45, this.act.t / this.act.dur) * (1 - sstep(0.75, 1, this.act.t / this.act.dur)) : 0);
    this.pPitch.step(pitchT, se > 0.05 ? 9 : 4.5, 0.85, dt);
    const gL = L.planted ? L.gy : L.sw.p1.y, gR = R.planted ? R.gy : R.sw.p1.y;      // (a swinging foot's ground is where it will land, not the height it was lifted from)
    const rollT = clamp(-0.5 * Math.atan((gL - gR) / 1.2), -0.16, 0.16) + this.H.listLoad * (R.load - L.load) * (1 - 0.5 * mRun)
      + clamp((0.55 * this.v * this.om) / 9.81, -0.2, 0.2) - 0.035 * wsS - 0.045 * sev * goodS * (1 - lie);      // a limp leans over the good leg
    // the pelvis works with the stride: the swinging side drops (list) through the swing, and it nods nose-down as each foot takes
    // the weight, nose-up mid-swing
    let listT = 0, nodT = 0;
    { const sw = !L.planted ? L : !R.planted ? R : null, u = sw ? clamp(sw.sw.t / sw.sw.T, 0, 1) : 0;
      if (sw) listT = sw.s * this.H.list * Math.sin(Math.PI * u) * (1 - mRun * 0.5) * (1 - lie);
      nodT = -this.H.nod * (sw ? Math.cos(2 * Math.PI * u) : 1) * m * (1 - lie); }
    // leaning on a wall it struck or slides along (BODY4: _crash, _bodyCollide): a roll toward it, eased in quick and out slow
    { const W = this.wallLean || (this.wallLean = { x: 0, T: 0 }); W.x += (W.T - W.x) * expK(dt, Math.abs(W.T) > Math.abs(W.x) ? 0.12 : 0.45); W.T *= Math.exp(-dt / 0.25); }
    this.pRoll.step(rollT + listT + this.wallLean.x, this.H.listWn, 0.8, dt);
    this.nod.step(nodT, 13, 0.8, dt);
    this.pelRoll = this.pRoll.x; this.pelPitch = this.pPitch.x + this.nod.x;
    const fL = (L.pos.x - this.x) * fx + (L.pos.z - this.z) * fz, fR = (R.pos.x - this.x) * fx + (R.pos.z - this.z) * fz;
    this.pYaw.step(clamp(-0.085 * (fL - fR) * (1 - 0.5 * mRun), -0.18, 0.18) + 0.03 * wsS, 6, 0.85, dt);
    // the pelvis turns by steps: with one foot down it is held by that foot and turns only as far as the stance hip rotates; with
    // both down it catches up with the body heading. `pTurn` is how far it trails the heading; the back takes the difference.
    {
      const H = this.H, hold = H.pelvisHold * clamp(Math.abs(L.load - R.load), 0, 1) * (1 - lie) * (1 - 0.6 * mRun) * (1 - sstep(0.02, 0.25, this.tailNear || 0));      // (the tail against something: the hips turn with the body, no catch-up sweeps it)
      const wn = lerp(H.pelvisCatch, 1.5, hold), e = -this.pTurn, w = this.pTurnW;
      let a = wn * wn * e + 2 * 0.9 * wn * (this.om - w) * (1 - hold) - 24 * w * hold;
      const over = Math.abs(e) - H.pelvisLag; if (over > 0) a += Math.sign(e) * (400 * over + 2 * 20 * Math.max(0, Math.sign(e) * (this.om - w)));
      this.pTurnA = a; this.pTurnW += a * dt;
      this.pTurn = clamp(this.pTurn + (this.pTurnW - this.om) * dt, -H.pelvisLag - 0.08, H.pelvisLag + 0.08);
    }
    this.pStride = this.pYaw.x;
    const yawP = this.psi + this.pYaw.x + this.pTurn; this.yawP = yawP;
    basis(yawP, this.pelPitch, this.pRoll.x, this.pf, this.pl, this.pu);
    // where the mass is, relative to the hips, along the body: head and neck forward, tail back
    const hp = this.head.pos, hdF = (hp.x - this.x) * fx + (hp.z - this.z) * fz, hdY = hp.y - this.py.x;
    const tl = this.tail[Math.floor(DIM.tailN / 3)].p, tlF = (tl.x - this.x) * fx + (tl.z - this.z) * fz;
    const M = this.species.mass, torsoF = M.torsoF;
    const comF = (M.head * hdF + M.neck * hdF * 0.6 + M.torso * torsoF + M.tail * tlF) / (M.head + M.neck + M.torso + M.tail);
    // support: under both feet when both are down, under the one foot otherwise
    const sL = (L.pos.x - this.x) * fx + (L.pos.z - this.z) * fz, sR = (R.pos.x - this.x) * fx + (R.pos.z - this.z) * fz;
    const supF = (sL * L.load + sR * R.load) / (L.load + R.load + 1e-3);
    // standing, the hips slide so the mass sits over the feet; moving, momentum carries it and the feet chase it instead
    const balT = lerp(clamp((supF - comF) * (1 - sstep(0.4, 1.6, spd)), -0.7, 0.5), -0.95, lie);      // lying, the hips have settled back over the heels
    this.balF.step(balT, 3.2, 1, dt);
    this.comF = comF + this.balF.x; this.supF = supF; this.headMoment = M.head * hdF + M.neck * hdF * 0.6;
    void hdY;
    this.hc.set(this.x + lx * this.sway.x + fx * this.balF.x, this.py.x, this.z + lz * this.sway.x + fz * this.balF.x);
    this._hipOk = true;
    this.pc.copy(this.hc).addScaledVector(this.pu, 0.32).addScaledVector(this.pf, 0.05);

    // back: recruited by the gaze (twist toward it, pitch with it), bends into turns
    const gazeRel = clamp(wrap(this.head.yaw - this.psi), -1.7, 1.7);
    // lateral bend of the trunk: recruited by the gaze, leading into a turn, bending round it at speed;
    // the chest is a heavy mass on a flexible back, so it is simulated in the world: it lags the hips' stride wobble and overshoots a stop
    // (BODY4: standing, a turn on the spot comes in bursts, one per step; the chest leads the turn as a whole, not each burst: the
    // lead and turn terms are low-passed there, else the chest swung ahead and back again at every step)
    const stS = 1 - sstep(0.5, 2.0, Math.abs(this.v)), tauL = lerp(0.04, 0.7, stS);
    this.omL = (this.omL ?? this.om) + (this.om - (this.omL ?? this.om)) * expK(dt, tauL); this.omTL = (this.omTL ?? this.omT) + (this.omT - (this.omTL ?? this.omT)) * expK(dt, tauL);
    const lead = clamp(this.omTL * 0.5, -0.28, 0.28) * (1 - 0.6 * mRun);
    const bm = this.H.backYawMax;
    this.gazeBack = (this.gazeBack ?? gazeRel) + (gazeRel - (this.gazeBack ?? gazeRel)) * expK(dt, 0.3);      // the trunk follows the gaze more slowly than the head moves
    const tyT = clamp(clamp(this.H.backGaze[0] * this.gazeBack, -this.H.backGaze[1], this.H.backGaze[1]) - 0.55 * this.pYaw.x + clamp(this.omL * 0.35, -0.25, 0.25) + lead, -bm + 0.04, bm - 0.04);
    // (standing, the chest's aim is held in the world and eased there: the hips' turn in bursts no longer swings it to and fro)
    { const wT = this.psi + tyT; this.chestAimW = this.chestAimW === undefined ? wT : this.chestAimW + wrap(wT - this.chestAimW) * expK(dt, lerp(0.03, 0.32, stS)); }
    const tyTw = clamp(wrap(this.chestAimW - this.psi), -bm + 0.04, bm - 0.04);
    const yawS = yawP - this.pTurn, yr = this.prevYawP === undefined ? 0 : wrap(yawS - this.prevYawP) / dt; this.prevYawP = yawS;
    {
      const tw = this.twistYaw, wn = lerp(4.6, 6.5, mRun), z = lerp(0.95, 0.55, sstep(0.5, 2.5, Math.abs(this.v)));      // (standing, near critical: at 0.55 the chest swung 1.1 rad/s each way at ~0.6 Hz as it turned on the spot; BODY4)
      // damping acts on the bend itself; inertia shows as a kick against the hips' angular acceleration
      const yacc = (yr - (this.prevYr ?? yr)) / dt; this.prevYr = yr;
      tw.v += (wn * wn * (tyTw - tw.x) - 2 * z * wn * tw.v - clamp(yacc, -12, 12) * 0.42) * dt; tw.x += tw.v * dt;
      if (Math.abs(tw.x) > bm) { tw.x = Math.sign(tw.x) * bm; tw.v *= -0.2; }
    }
    // the back takes the pelvis' own turn exactly: the chest (a heavy mass on the back) does not see the pelvis step
    this.backYaw = clamp(this.twistYaw.x - this.pTurn, -bm, bm);
    this.chestDip.step(0, 7, 0.45, dt); this.armSwing.step(0, 9, 0.3, dt);
    const tpT = 0.1 + 0.22 * clamp(this.head.pitch, -0.9, 0.5) - 0.32 * Math.min(1, this.lowness) - 0.12 * Math.max(0, this.lowness - 1) - 0.05 * mRun + this.breath * 0.01 - 0.06 * this.stalk;
    this.twistPitch.step(tpT, 5, 1, dt);
    const sp = this.spine, P0 = IDX.PELVIS, NB = DIM.backN, bs = DIM.backLen / NB;
    sp[P0].p.copy(this.pc); sp[P0].u.copy(this.pu);
    for (let i = 1; i <= NB; i++) {
      const k = i / NB, arch = Math.sin(Math.PI * k) * 0.05;     // a slight dorsal arch, more twist toward the shoulders
      basis(yawP + (this.backYaw + this.pTurn) * lerp(k * k * (3 - 2 * k), k, this.H.backEven) - this.pTurn * Math.min(1, k / this.H.lumbar), this.pPitch.x + this.nod.x * (1 - k) + this.twistPitch.x * k + arch * (0.5 - k) * 2 + this.chestDip.x * 0.5 * k, this.pRoll.x * (1 - 0.5 * k), t0, t1, t2);
      sp[P0 + i].p.copy(sp[P0 + i - 1].p).addScaledVector(t0, bs);
      sp[P0 + i].u.copy(t2);
    }
    const c = this.chest;
    c.p.copy(sp[IDX.CHEST].p); c.f.copy(t0); c.l.copy(t1); c.u.copy(t2); c.yaw = yawP + this.backYaw;
    this.nb.copy(c.p);
  }

  // ---------------------------------------------------------------- contact with solid things
  // A query gathers, per solid thing, the deepest push any sample needs to be clear of it (a wall is its whole run as one
  // smooth slab, so a part sliding along it does not ripple over the pillars; over a low top, lifting clear is the shorter
  // way out); the pushes of different things add. Buffers are reused: no allocation per query.
  _cBegin() {
    const CK = this._ck || (this._ck = { k: new Array(32).fill(null), x: new Float64Array(32), y: new Float64Array(32), z: new Float64Array(32), d: new Float64Array(32), n: 0, px: 0, py: 0, pz: 0, dep: 0 });
    for (let j = 0; j < CK.n; j++) CK.k[j] = null;
    CK.n = 0; CK.px = 0; CK.py = 0; CK.pz = 0; CK.dep = 0; return CK;
  }
  _cSample(x, y, z, rad, fbx, fbz) {
    const CK = this._ck, near = this.terrain.near; if (!near) return;
    const L = near(x, z, rad + 0.6);
    for (let i = 0; i < L.length; i++) {
      const c = L[i]; if (y - rad > c.top || (c.bot !== undefined && y + rad < c.bot)) continue;
      const sg = c.seg; let qx = c.x, qz = c.z;
      let mid = false;
      if (sg) { const ex = sg.bx - sg.ax, ez = sg.bz - sg.az, l2 = ex * ex + ez * ez, u0 = l2 > 0 ? ((x - sg.ax) * ex + (z - sg.az) * ez) / l2 : 0, u = clamp(u0, 0, 1); mid = u0 > 0 && u0 < 1; qx = sg.ax + ex * u; qz = sg.az + ez * u; }
      let dx = x - qx, dz = z - qz; const d = Math.hypot(dx, dz), m = c.r + rad; if (d >= m) continue;
      if (d < 1e-4) { dx = fbx; dz = fbz; } else { dx /= d; dz /= d; }
      // (BODY4) a part that has gone past the middle of a thin wall is still pushed back out on the side its body is on (`_cHome`,
      // the neck's root for the head): pushed the short way it went on through, into the room
      let dd = d; const H = this._cHome;
      if (H && mid && ((H.x - qx) * dx + (H.z - qz) * dz) < 0) { dx = -dx; dz = -dz; dd = -d; }
      const key = sg || c; let j = 0; while (j < CK.n && CK.k[j] !== key) j++;
      if (j === CK.n) { if (j >= 32) continue; CK.k[j] = key; CK.d[j] = 0; CK.n++; }
      // out sideways, or over the top; under an overhead run (a lintel, a pipe's crown) out underneath instead of over
      const p = m - dd, under = c.bot !== undefined && y < (c.bot + c.top) / 2, up = under ? (y + rad) - c.bot + 0.01 : c.top - (y - rad) + 0.01;
      if (up < p * (under ? 1 : this._liftBias)) { if (up > CK.d[j]) { CK.d[j] = up; CK.x[j] = 0; CK.y[j] = under ? -up : up; CK.z[j] = 0; } }
      else if (p > CK.d[j]) { CK.d[j] = p; CK.x[j] = dx * p; CK.y[j] = 0; CK.z[j] = dz * p; }
    }
  }
  _cEnd() {
    const CK = this._ck;
    let dn = 0;
    for (let j = 0; j < CK.n; j++) { CK.px += CK.x[j]; CK.py = Math.max(CK.py, CK.y[j]); dn = Math.min(dn, CK.y[j]); CK.pz += CK.z[j]; if (CK.d[j] > CK.dep) CK.dep = CK.d[j]; }
    if (dn < 0 && CK.py === 0) CK.py = dn;      // pressed down from under something only when nothing also lifts it
    return CK.dep;
  }

  // ---------------------------------------------------------------- head and neck
  _head(dt, intent) {
    const PO = this.post || { alert: 0, display: 0, agit: 0, hold: 0 };
    const h = this.head, c = this.chest, T = this.terrain;
    // the head's own dynamics run on its dynamic state (where its muscles are taking it); the skull is shown where its neck ends
    if (this.headDyn) h.pos.copy(this.headDyn);
    const spd = Math.abs(this.v), mRun = sstep(3.5, 7.5, spd);
    const fx = Math.sin(this.psi), fz = Math.cos(this.psi), lx = fz, lz = -fx;
    // solid things: the skull and snout cannot pass through walls, rock or trunks, and the animal knows the size of its head.
    // `skull` measures a skull at P facing f against everything nearby (a wall is its whole run as one smooth slab, so a head
    // sliding along it does not ripple over the pillars); per solid thing the deepest sample counts, and the pushes add, so a
    // tapered snout in a doorway is pressed straight back out rather than bounced from jamb to jamb.
    const near = T.near, CK = this._cBegin(), sample = (x, y, z, rad) => this._cSample(x, y, z, rad, -h.f.x, -h.f.z);
    const skull = (Px, Py, Pz, f, inflate) => {
      this._cBegin(); if (!near) return 0;
      this._cHome = this.nb;
      this._headVol(Px, Py, Pz, f, h.u, this.jaw, (x, y, z, r) => sample(x, y, z, r + inflate));      // skull, snout and the lower jaw (BODY4)
      this._cHome = null; return this._cEnd();
    };
    const clear = (P, f, iters) => { let mx = 0, my = 0, mz = 0; for (let it = 0; it < iters && skull(P.x, P.y, P.z, f, 0) > 0; it++) { P.x += CK.px; P.y += CK.py; P.z += CK.pz; mx += CK.px; my += CK.py; mz += CK.pz; } return Math.hypot(mx, my, mz); };

    // neck base as the head "feels" it: gait bob and sway filtered out, in the travelling frame
    const nl = (this.nb.x - this.x) * lx + (this.nb.z - this.z) * lz;
    const nf = (this.nb.x - this.x) * fx + (this.nb.z - this.z) * fz;
    const ny = this.nb.y - this.groundY;
    const F = this.nbF;
    if (!F.init) { F.l = nl; F.f = nf; F.y = ny; F.init = true; }
    const stab = intent.look && intent.look.lock ? 1 : 0.35 * Math.min(1, spd / 2);
    F.l += (nl - F.l) * expK(dt, lerp(0.45, 0.9, stab)); F.f += (nf - F.f) * expK(dt, 0.25); F.y += (ny - F.y) * expK(dt, lerp(0.22, 0.6, stab));
    // stabilised, not frozen: part of the stride still comes through (more when it is relaxed than when its eyes are locked on
    // something), and the head's own lag and settle (its slightly under-damped spring, below) carry it on a beat behind
    const lockK = intent.look && intent.look.lock ? 1 : 0, res = lerp(0.42, 0.2, lockK) * (1 - 0.5 * this.stalk);
    this.headLock = (this.headLock ?? lockK) + (lockK - (this.headLock ?? lockK)) * expK(dt, 0.4);
    t5.set(this.x + lx * (F.l + res * (nl - F.l)) + fx * (F.f + res * 0.5 * (nf - F.f)), this.groundY + F.y + res * 0.6 * (ny - F.y), this.z + lz * (F.l + res * (nl - F.l)) + fz * (F.f + res * 0.5 * (nf - F.f)));

    // carry the head with the travelling frame so its own dynamics only see relative motion
    h.pos.x += this.x - this.px; h.pos.z += this.z - this.pz; h.pos.y += this.groundY - this.pgy;
    // and with what of the stride the neck lets through (in phase with the shoulders: the neck carries it there directly)
    {
      const rl = res * (nl - F.l), rf = res * 0.5 * (nf - F.f), ry = res * 0.6 * (ny - F.y), RP = this.headRes || (this.headRes = { l: rl, f: rf, y: ry });
      const dl = rl - RP.l, df = rf - RP.f;
      h.pos.x += lx * dl + fx * df; h.pos.z += lz * dl + fz * df; h.pos.y += ry - RP.y;
      RP.l = rl; RP.f = rf; RP.y = ry;
    }

    // aim
    t0.subVectors(this.hfix, h.pos);
    const dYaw = bearing(t0.x, t0.z), dPitch = Math.atan2(t0.y, Math.hypot(t0.x, t0.z));
    const YG = YAW_GAZE * (this.act && STRIKES.has(this.act.kind) ? 1.75 : 1), YM = YG + 0.06;      // (BODY4: a strike may wring more turn out of neck and atlas, once)
    let desYaw = c.yaw + clamp(this._sided(wrap(dYaw - c.yaw), 'head'), -YG, YG), desPitch = clamp(dPitch, -1.05, 0.8);
    {
      // a living head is never quite still: slow small corrections round the aim (never a tremor), the stride's pitch nod
      const tt = this.t, live = lerp(1, 0.4, this.headLock) * (1 - 0.7 * this.freeze) * (1 - 0.6 * (this.post ? this.post.hold : 0));
      desYaw += live * (0.022 * Math.sin(tt * 0.71 + 0.4) + 0.013 * Math.sin(tt * 1.37 + 2.1) + 0.006 * Math.sin(tt * 2.9));
      desPitch += live * (0.018 * Math.sin(tt * 0.53 + 1.2) + 0.01 * Math.sin(tt * 1.61)) + 0.9 * res * (ny - F.y);
    }
    // a sensor brought to something (intent.sense, planned by nav.senseSpots): the skull takes the planned heading once the
    // head is on its way in, so the eye or the nostrils face the target through whatever gap the plan found
    const sn = intent.sense && intent.sense.k > 0 ? intent.sense : null;
    if (sn) {
      const w = this.senseOn || 0, sy = c.yaw + clamp(this._sided(wrap(bearing(sn.d.x, sn.d.z) - c.yaw), 'sense'), -YAW_GAZE, YAW_GAZE);
      desYaw = desYaw + wrap(sy - desYaw) * w; desPitch = lerp(desPitch, clamp(Math.asin(clamp(sn.d.y, -1, 1)), -1.05, 0.8), w);
    }
    const act = this.act, env = act ? sstep(0, 0.6, act.t) * sstep(act.dur, act.dur - 0.6, act.t) : 0;
    desYaw += 0.1 * Math.sin(this.t * 2.1) * (this._sniffK || 0);      // scenting: the slow side-to-side cast (the head's place swings with it, below)
    if (act && act.kind === 'yawn') desPitch += 0.3 * env;
    const roar = this.roarEnv; desPitch = lerp(desPitch, Math.min(desPitch + 0.25, 0.45), roar);
    const gk = act && act.forced ? act.kind : '', gu = act ? act.t / act.dur : 0;
    if (gk === 'snap') { if (gu < 0.3) desPitch += 0.25 * sstep(0, 0.3, gu); }
    if (gk === 'growl') desPitch -= 0.12 * env;
    if (gk === 'gulp') desPitch += 0.35 * sstep(0, 0.25, gu) * (1 - sstep(0.8, 1, gu));
    if (gk === 'tear') desPitch += gu > 0.22 ? 0.3 * sstep(0.22, 0.45, gu) * (1 - sstep(0.75, 1, gu)) : -0.25;
    const se = this.startleE || 0;
    if (gk === 'startle') desPitch += 0.32 * se * (1 - sstep(0.25, 0.6, act.t));
    // the skull turns like the heavy thing it is: bounded angular acceleration and rate; a snap is the exception
    if (gk === 'worry') desYaw += 0.55 * act.force * Math.sin(act.t * 17) * sstep(0, 0.2, gu) * (1 - sstep(0.8, 1, gu));
    if (gk === 'toss') { desPitch += gu < 0.38 ? -0.35 * sstep(0, 0.38, gu) : 0.75 * sstep(0.38, 0.6, gu) * (1 - sstep(0.85, 1, gu)); desYaw += act.sgn * 0.7 * sstep(0.38, 0.62, gu) * (1 - sstep(0.85, 1, gu)); }
    if (gk === 'butt' && gu > 0.3 && gu < 0.75) desPitch -= 0.3;
    // a light in its eyes: the eyes screw up, it blinks often, and the head is turned down and aside out of the beam (the side
    // it first turned to, kept while it lasts); the first moment of it is a flinch
    {
      const gT = this.glareT, g0 = this.glareS;
      this.glareS += (gT - g0) * expK(dt, gT > g0 ? 0.1 : 0.7);
      if (g0 < 0.35 && this.glareS >= 0.35) { this.glareSgn = wrap(this.hfix ? bearing(this.hfix.x - h.pos.x, this.hfix.z - h.pos.z) - c.yaw : 0) > 0 ? -1 : 1; h.vel.y += 0.5; h.vel.addScaledVector(h.f, -0.9); h.pitchV -= 0.5; this.blink = 0.2; }
      this.squint += (clamp(1.15 * this.glareS, 0, 1) * (0.88 + 0.12 * Math.sin(this.t * 1.7)) - this.squint) * expK(dt, 0.08);
      const g = this.glareS * (gk && STRIKES.has(gk) ? 0.3 : 1);
      desPitch -= 0.28 * g; desYaw += this.glareSgn * 0.55 * g;
    }
    // the skull turns like the heavy thing it is: bounded angular acceleration and rate; a strike, a shake or a jerk toward a sound is the exception
    const fast = act && act.forced && (act.kind === 'strike' || act.kind === 'snap' || act.kind === 'shake' || act.kind === 'butt' || act.kind === 'seize' || act.kind === 'worry' || act.kind === 'toss') ? 1 : gk === 'orient' ? 1 - sstep(0.45, 0.9, act.t) : gk === 'startle' && act.t < 0.7 ? 0.7 : 0;
    // something it is watching far off the skull's line is brought back with a quick head turn, not the slow drift of an idle
    // look round (a head left out to the side after a glance or a blow used to take 1.5 s to come back to what it watched)
    const watchK = (intent.look || (this.att.kind === 'player' && intent.attention)) ? sstep(0.35, 1.0, Math.abs(wrap(desYaw - h.yaw))) : 0;
    const wn = lerp(lerp(6.5, 8.5, watchK), 13, fast), z = 0.9, maxRate = lerp(lerp(1.25, 2.0, watchK), 3.4, fast), maxAcc = lerp(lerp(4.2, 7, watchK), 20, fast);
    // the yaw error is taken through the front of the animal, never round the back: a subject that crosses behind it from one
    // side to the other must not send the skull the short way round past its own shoulder (it used to, and ended up facing
    // backwards, 180 degrees off what it was watching)
    // (the skull's aim is free inside its own range: the neck is solved to enter the skull along the skull's line, so there is no
    // chord-to-skull limit to respect here; the old one lifted the nose whenever the head was out to the side)
    this.pitchFloor = 0;
    const yawErr = clamp(desYaw - c.yaw, -YG, YG) - clamp(wrap(h.yaw - c.yaw), -2.2, 2.2);
    const ay = clamp(wn * wn * yawErr - 2 * z * wn * h.yawV, -maxAcc, maxAcc), ap = clamp(wn * wn * (desPitch - h.pitch) - 2 * z * wn * h.pitchV, -maxAcc, maxAcc);
    const y0 = h.yaw, p0 = h.pitch;
    h.yawV = clamp(h.yawV + ay * dt, -maxRate, maxRate); h.yaw += h.yawV * dt;
    h.pitchV = clamp(h.pitchV + ap * dt, -maxRate * 0.8, maxRate * 0.8); h.pitch += h.pitchV * dt;
    // nor does it turn into what it touches: a turn that would sweep the skull deeper into something is held there
    if (near && skull(h.pos.x, h.pos.y, h.pos.z, h.f, 0.04) > 0) {
      const F = this._fq || (this._fq = new Vector3()), Lq = this._lq || (this._lq = new Vector3()), Uq = this._uq || (this._uq = new Vector3()), Q = this._qq || (this._qq = new Vector3());
      const press = (f) => { Q.copy(h.pos); return clear(Q, f, 3); }, m0 = press(h.f);
      basis(h.yaw, p0, h.tilt.x, F, Lq, Uq); if (press(F) > m0 + 1e-4) { h.yaw = y0; h.yawV *= 0.5; }
      basis(y0, h.pitch, h.tilt.x, F, Lq, Uq); if (press(F) > m0 + 1e-4) { h.pitch = p0; h.pitchV *= 0.5; }
    }
    // the anatomical limit, whatever asked for more (a body pivoting under a held gaze, a strike, a shake): the skull never turns
    // further than YAW_MAX off the chest; past that the gaze is carried by the trunk and feet (reorient, above) or not at all
    { const rr = wrap(h.yaw - c.yaw); if (Math.abs(rr) > YM) { h.yaw -= rr - Math.sign(rr) * YM; if (h.yawV * rr > 0) h.yawV = 0; } }
    h.tilt.step(act && act.kind === 'shake' ? 0.34 * Math.sin(act.t * 21) * (1 - act.t / act.dur) : h.tiltT + this.glareSgn * 0.16 * this.glareS + 0.05 * Math.sin(this.t * 31) * roar + (act && act.kind === 'yawn' ? 0.12 * act.sgn * env : 0), act && act.kind === 'shake' ? 30 : 7, 0.8, dt);
    this.jawExtra = act && act.kind === 'yawn' ? 0.8 * Math.pow(Math.sin(Math.PI * act.t / act.dur), 2) : act && act.kind === 'sniffAir' ? 0.06 * env : 0.8 * roar * (0.93 + 0.07 * Math.sin(this.t * 2.6));      // the bellow's gape swells with the breath; it does not chatter
    if (gk === 'strike') this.jawExtra = act.t < 0.1 ? sstep(0, 0.1, act.t) : act.t < 0.2 ? 1.0 : act.t < 0.24 ? lerp(1.0, 0.1, (act.t - 0.2) / 0.04) : 0.1;
    if (gk === 'seize') this.jawExtra = gu < 0.3 ? 0.9 * sstep(0.05, 0.3, gu) : gu < 0.46 ? 1.0 : gu < 0.52 ? lerp(1.0, 0.16, (gu - 0.46) / 0.06) : 0.16;
    if (gk === 'butt') this.jawExtra = 0;
    if (gk === 'orient') this.jawExtra += 0.08 * env;
    if (gk === 'snap') this.jawExtra = gu < 0.26 ? 0.55 * sstep(0.05, 0.26, gu) : gu < 0.43 ? 1.0 : gu < 0.47 ? lerp(1.0, -0.03, (gu - 0.43) / 0.04) : 0;
    if (gk === 'growl') this.jawExtra = 0.07 * env * (0.85 + 0.15 * Math.sin(this.t * 3.1));      // lips drawn, the jaw parted a little with the sound and closed again (env)
    if (gk === 'rumble') { this.jawExtra = 0; desPitch -= 0.05 * env; }      // a low rumble in the chest, jaws shut
    if (gk === 'wince') desPitch += 0.18 * Math.sin(Math.PI * Math.min(1, gu * 1.6));
    // (a display is a posture: the mouth opens with its sounds and snaps, its acts above, and is all but shut between them; a
    //  fixed half gape for the length of a display read as a jaw hanging open)
    this.jawExtra += 0.05 * PO.display + 0.01 * PO.agit;
    if (gk === 'tilt') h.tiltT = act.sgn * 0.28 * env;
    if (sn && sn.eye) h.tiltT = lerp(h.tiltT, sn.eye * 0.22, this.senseOn || 0);      // one eye turned in: the head rolls a little toward it
    if (this.mouthHold > 0) this.jawExtra = Math.max(this.jawExtra, gk === 'seize' && gu < 0.52 ? 0 : this.mouthHold);      // something held between the teeth keeps them apart
    if (gk === 'worry') h.tiltT = 0.3 * act.force * Math.sin(act.t * 17 + 0.6) * (1 - sstep(0.75, 1, gu));
    basis(h.yaw, h.pitch, h.tilt.x, h.f, h.l, h.u);

    // where the head wants to be
    const gazeRel = clamp(wrap(h.yaw - c.yaw), -1.7, 1.7);
    const sp = Math.sin(h.pitch);
    // the head is carried forward of the chest on a neck held out at near its length (chord ~0.92 of it), so the neck's rise is
    // a long even curve; a head perched close above the shoulders (1.18 forward, 0.72 up: a chord of 0.79 of the neck) made the
    // chain buckle into an S, 60 deg at the root (SKIN3.md). Stalking, the head comes down to about shoulder height in front.
    const hf = NK.hf + NK.hfR * mRun - 0.3 * Math.max(0, sp) + NK.hfS * this.stalk;
    const hu = NK.hu + NK.huR * mRun + 0.6 * sp * (sp > 0 ? 1 : 0.5) + this.breath * 0.02 + NK.huS * this.stalk;
    const lie = clamp(this.lieS.x, 0, 1), lean = this.lieLean.x;
    // relaxed, the head is carried low; lying relaxed it comes down toward the ground; getting up it is thrown forward and down as a counterweight
    const hfP = hf + 0.38 * PO.display + NK.hfA * PO.alert + 0.75 * lean, huP = hu + NK.huA * PO.alert - 0.7 * PO.display - 0.3 * this.relax * (1 - PO.alert) - 0.75 * lie * this.relax * (1 - PO.alert) - 0.3 * lean;
    const swingK = gk === 'orient' ? sstep(0, 0.15, act.t) * (1 - sstep(0.7, 1.1, act.t)) : 0, gzR = lerp(gazeRel, clamp(wrap(desYaw - c.yaw), -1.7, 1.7), swingK), yawH = this.psi + this.twistYaw.x + clamp(Math.sign(gzR) * Math.max(Math.abs(lerp(0.5, 0.8, swingK) * gzR), Math.abs(gzR) - 0.6), -lerp(0.95, 1.1, swingK), lerp(0.95, 1.1, swingK));      // (the head goes far enough out to the side that the skull stays within its turn off the neck's line)      // jerked round toward a sound, the neck swings out ahead of the skull
    const G = h.goal.set(t5.x + Math.sin(yawH) * hfP, t5.y + huP, t5.z + Math.cos(yawH) * hfP);
    G.y += 0.3 * roar; G.x += h.f.x * 0.25 * roar; G.z += h.f.z * 0.25 * roar;
    if (gk === 'huff') { const k = Math.sin(Math.PI * Math.min(1, gu * 2.2)) * (gu < 0.45 ? 1 : 0); G.addScaledVector(h.f, 0.18 * k); G.y += 0.08 * k; }
    if (gk === 'growl') { G.y -= 0.25 * env; G.addScaledVector(h.f, 0.12 * env); }
    let wpBoost = 1;
    if (gk === 'tear' && act.pt) {
      // bite down into it, then wrench back and up with the whole neck, worrying it side to side
      const u = gu;
      if (u < 0.22) { G.lerp(act.pt, sstep(0, 0.22, u)); G.y = Math.max(G.y, act.pt.y + 0.25); wpBoost = 1.6; }
      else { const k = sstep(0.22, 0.45, u) * (1 - sstep(0.75, 1, u)); t1.subVectors(G, act.pt); G.copy(act.pt).addScaledVector(h.f, -0.85 * k); G.y += 0.25 + 0.75 * k; G.addScaledVector(h.l, 0.22 * Math.sin(u * 26) * k * sstep(0.45, 0.55, u)); wpBoost = 1.9; }
      this.jawExtra += u < 0.18 ? 0.45 * sstep(0, 0.12, u) : 0.04;
    }
    if (gk === 'gulp') {
      // head up, and two quick tosses to get it down
      const toss = Math.max(0, Math.sin(Math.PI * clamp((gu - 0.25) / 0.2, 0, 1))) + Math.max(0, Math.sin(Math.PI * clamp((gu - 0.55) / 0.2, 0, 1)));
      G.y += 0.7 * sstep(0, 0.25, gu) * (1 - sstep(0.8, 1, gu)) + 0.35 * toss; G.addScaledVector(h.f, 0.25 * toss); wpBoost = 1.5;
      this.jawExtra += 0.12 * toss;
    }
    if (gk === 'startle') { G.y += 0.55 * se; G.addScaledVector(h.f, -0.6 * se); this.jawExtra += 0.22 * se; if (act.t < 0.4) wpBoost = 1.9; }
    if (gk === 'snap' && act.pt) {
      if (gu < 0.28) { G.addScaledVector(h.f, -0.45 * sstep(0, 0.28, gu)); G.y += 0.25 * sstep(0, 0.28, gu); }
      else if (gu < 0.62) {
        t1.copy(act.pt); t2.subVectors(t1, h.pos); const dd = t2.length(); t2.multiplyScalar(1 / Math.max(dd, 1e-3));
        t3.copy(t1).addScaledVector(t2, -(DIM.headLen - 0.15)); G.copy(t3); wpBoost = 2.3;
      }
    }
    if (gk === 'butt' && act.pt) {
      // head down and drawn back, then driven forward through the target with the whole body behind it, jaws shut
      if (gu < 0.42) { G.addScaledVector(h.f, -0.5 * sstep(0, 0.42, gu)); G.lerp(act.pt, 0.35 * sstep(0, 0.42, gu)); G.y = lerp(G.y, act.pt.y + 0.9, 0.5 * sstep(0, 0.42, gu)); wpBoost = 1.6; }
      else if (gu < 0.72) { t1.copy(act.pt); t2.subVectors(t1, h.pos); t2.y = 0; const dd = t2.length(); t2.multiplyScalar(1 / Math.max(dd, 1e-3)); G.copy(t1).addScaledVector(t2, 0.9 - DIM.headLen * 0.55); G.y = act.pt.y + 0.55; wpBoost = 2.2; }
    }
    if (gk === 'seize' && act.pt) {
      if (gu < 0.3) { G.addScaledVector(h.f, -0.35 * sstep(0, 0.3, gu)); G.y += 0.2 * sstep(0, 0.3, gu); }
      else if (gu < 0.62) { t1.copy(act.pt); t2.subVectors(t1, h.pos); const dd = t2.length(); t2.multiplyScalar(1 / Math.max(dd, 1e-3)); G.copy(t1).addScaledVector(t2, -(DIM.headLen - 0.35)); wpBoost = 2.2; }
    }
    if (gk === 'strike' && act.pt && gu < 0.55) {
      // straight at you from where the head already is: jaws to the target, a bite's length short of the skull
      t1.copy(act.pt); t2.subVectors(t1, h.pos); const dd = t2.length(); t2.multiplyScalar(1 / Math.max(dd, 1e-3)); const under = sstep(DIM.reachStop, DIM.reachStop - 1.5, Math.hypot(t1.x - this.x, t1.z - this.z)); G.copy(t1).addScaledVector(t2, -(DIM.headLen - 0.4) * (1 - 0.7 * under)); G.y -= 1.0 * under; wpBoost = 6 + 3.5 * under;
    }
    if (gk === 'worry') { const k = sstep(0, 0.2, gu) * (1 - sstep(0.8, 1, gu)); G.addScaledVector(h.l, 0.75 * act.force * Math.sin(act.t * 17) * k); G.y += 0.25 * k; wpBoost = 2.1; }
    if (gk === 'toss') {
      if (gu < 0.38) { const k = sstep(0, 0.38, gu); G.y -= 0.7 * k; G.addScaledVector(h.f, -0.3 * k); G.addScaledVector(h.l, -act.sgn * 0.5 * k); wpBoost = 1.5; }
      else { const k = sstep(0.38, 0.6, gu) * (1 - sstep(0.8, 1, gu)); G.y += 1.3 * k; G.addScaledVector(h.f, 0.3 * k); G.addScaledVector(h.l, act.sgn * 1.1 * k); wpBoost = 2.4; }
    }
    if (gk === 'orient' && act.t < 0.5) wpBoost = 1.5;
    if (this.glareS > 0.02) { G.addScaledVector(h.f, -0.35 * this.glareS); G.y -= 0.15 * this.glareS; }      // drawn back and down from the light
    const neutralY = G.y;

    // bring the sensors to the subject: fully for a spot being investigated, partly for a nearby intruder
    let rhoT = 0, lowT = 0, sniff = 0;
    const r = this.reach;
    const probe = (px, py, pz, k, standoff, lowGain) => {
      // (on the line from the neck's root, not from where the head happens to be: from the head, any point at the standoff was as
      // good as any other once the head got there, so the head drifted out to one side and the neck bent into an S to keep the
      // skull on the target; BODY4)
      t1.set(px, py, pz); t2.subVectors(t1, this.nb).normalize();
      t3.copy(t1).addScaledVector(t2, -standoff);
      rhoT = k; lowT = lowGain * k * clamp((neutralY - t3.y) / 2.6, 0, 1);
      G.lerp(t3, k);
    };
    const pr = intent.probe;
    if (pr && pr.k > 0) probe(pr.x, pr.y, pr.z, pr.k, DIM.headLen + (pr.standoff ?? 2), 0.7);
    else if (r && r.phase !== 'notice' && r.probe) {
      const k = sstep(DIM.reachStop + 2.6, DIM.reachStop + 0.4, r.dist ?? 99) * (this.att.kind === 'goal' ? 1 : 0.3);
      if (k > 0) { probe(r.x, r.y + 0.3, r.z, k, DIM.headLen + 0.25, 1); if (r.phase === 'investigate') sniff = 1; }
    } else if (act && act.kind === 'sniffGround') { probe(act.pt.x, act.pt.y, act.pt.z, env, DIM.headLen + 0.25, 1); sniff = env; }
    else if (!this.drive && this.att.kind === 'player' && intent.attention && intent.curious !== false && !(act && act.pt)) {
      const d = this.subject.distanceTo(h.pos), k = 0.5 * sstep(26, 9, d);
      if (k > 0) probe(this.subject.x, this.subject.y, this.subject.z, k, DIM.headLen + 3.2, 0.6);
    }
    if (sn) {
      // the planned head position H, entered along the planned direction d: if the straight way from here to H is not clear the
      // head goes first to the staging point on that axis outside, and from there straight in
      // the staging point: as far back along the axis as the neck still reaches comfortably (never folded onto the shoulders)
      const H = sn.H, d = sn.d; let sb = 0.25, dev = 1e9;
      for (let bb = sn.back || 1.2; bb > 0.2; bb -= 0.15) {
        const L = Math.hypot(H.x - d.x * bb - this.nb.x, H.y - d.y * bb - this.nb.y, H.z - d.z * bb - this.nb.z), e = Math.max(0, 0.76 * DIM.neckLen - L, L - 0.92 * DIM.neckLen);
        if (e < dev - 1e-3) { dev = e; sb = bb; } if (e === 0) break;      // furthest back that the neck reaches comfortably, else the nearest to it
      }
      const Sx = H.x - d.x * sb, Sy = H.y - d.y * sb, Sz = H.z - d.z * sb;
      const pathOK = (ax, ay, az, bx, by, bz) => { const n = Math.min(12, Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) / 0.15)); for (let i = 1; i <= n; i++) { const u = i / n; if (skull(ax + (bx - ax) * u, ay + (by - ay) * u, az + (bz - az) * u, d, 0) > 0.03) return false; } return true; };
      const offAxis = Math.hypot(h.pos.x - Sx, h.pos.y - Sy, h.pos.z - Sz);
      if (this.senseStage === undefined || this.senseKey !== sn.key) { this.senseStage = 1; this.senseKey = sn.key; }
      if (this.senseStage && (offAxis < 0.45 || pathOK(h.pos.x, h.pos.y, h.pos.z, H.x, H.y, H.z))) this.senseStage = 0;
      else if (!this.senseStage && !pathOK(h.pos.x, h.pos.y, h.pos.z, H.x, H.y, H.z) && offAxis > 0.6) this.senseStage = 1;
      t3.set(this.senseStage ? Sx : H.x, this.senseStage ? Sy : H.y, this.senseStage ? Sz : H.z);
      if (this.dbg) this.dbg.T = [t3.x, t3.y, t3.z, sb];
      G.lerp(t3, sn.k); rhoT = Math.max(rhoT, sn.k); lowT = Math.max(lowT, sn.low || 0);
      this.senseOn = (this.senseOn || 0) + ((this.senseStage ? 0.6 : 1) * sn.k - (this.senseOn || 0)) * expK(dt, 0.3);
    } else { this.senseOn = 0; this.senseStage = undefined; }
    if (intent.low) lowT = Math.max(lowT, intent.low);
    if (act && act.kind === 'sniffAir') sniff = env;
    // nosing at something: quick pulls of breath through the nostrils, the jaws shut (BODY4: the jaws used to work open and shut
    // 0.04 rad at 1.35 Hz on top of a probe's parted mouth, which read as a twitch; a scenting animal keeps its mouth closed)
    if (intent.nose) sniff = Math.max(sniff, 1);
    this.noseK = (this.noseK || 0) + ((intent.nose ? 1 : 0) - (this.noseK || 0)) * expK(dt, 0.3);
    if (sniff > 0) {       // scenting: quick shallow pulls of the snout, with a slow side-to-side cast
      G.y += 0.035 * Math.sin(this.t * 19) * sniff;
      // (the cast is a slow swing of the whole head and neck about the shoulders, the skull turning with it (desYaw, from last
      // tick's sniff): it used to slide the head sideways with the skull held on the target, which the neck could only follow as an S)
      const ca = 0.5 * 0.1 * Math.sin(this.t * 2.1) * sniff, cc = Math.cos(ca), cs = Math.sin(ca), gx = G.x - this.nb.x, gz = G.z - this.nb.z;
      G.x = this.nb.x + gx * cc + gz * cs; G.z = this.nb.z - gx * cs + gz * cc;
    }
    this._sniffK = sniff;
    this.rho += (rhoT - this.rho) * expK(dt, 0.4);
    // it does not rise out of a crouch with its head in under something: the head has to come out first
    if (lowT < this.lowness && (this.headPinned || this.headRoom(0.3) > 0)) lowT = this.lowness;
    this.lowness += (lowT - this.lowness) * expK(dt, 0.55);

    t5.copy(c.f).multiplyScalar(0.72).addScaledVector(c.u, 0.69).normalize();     // the axis the neck leaves the shoulders on
    const shell = (p, step = 0) => {
      const ox = p.x, oy = p.y, oz = p.z;
      t4.subVectors(p, this.nb); const len = t4.length();
      t4.multiplyScalar(1 / Math.max(len, 1e-4));
      const cs = clamp(t4.dot(t5), -1, 1), LIMC = 1.12;      // cannot fold back over the shoulders or under the chest
      if (cs < Math.cos(LIMC)) {
        t3.copy(t4).addScaledVector(t5, -cs); if (t3.lengthSq() < 1e-8) t3.copy(c.u).addScaledVector(t5, -c.u.dot(t5));
        t3.normalize(); t4.copy(t5).multiplyScalar(Math.cos(LIMC)).addScaledVector(t3, Math.sin(LIMC));
      }
      p.copy(this.nb).addScaledVector(t4, clamp(len, lerp(0.8, 0.7, this.neckFold) * DIM.neckLen, NK.mx * DIM.neckLen));      // held off something, the neck folds back further
      if (step > 0 && len < lerp(0.8, 0.7, this.neckFold) * DIM.neckLen && cs >= Math.cos(LIMC)) { const mx = p.x - ox, my = p.y - oy, mz = p.z - oz, ml = Math.hypot(mx, my, mz); if (ml > step) { const k = step / ml; p.set(ox + mx * k, oy + my * k, oz + mz * k); } }      // and unfolds again gently (only ever the unfolding: reach and the cone are never eased)
    };
    const keep = intent.keepOut || [];
    const clearHead = (P, gain = 1) => {
      for (const K of keep) for (const [f, u] of [[1.75, 0.1], [0.9, -0.6], [0, 0], [1.2, -0.3]]) {
        const px = P.x + h.f.x * f + h.u.x * u, py = P.y + h.f.y * f + h.u.y * u, pz = P.z + h.f.z * f + h.u.z * u;
        const dx = px - K.x, dy = py - K.y, dz = pz - K.z, d = Math.hypot(dx, dy, dz);
        // (drawn back toward the neck's root, not shoved sideways off the person: the sideways shove fed on itself, the skull aimed
        // past him, the snout went by on that side and was pushed further out, until the neck stood in an S; BODY4)
        if (d < K.r) { const bx = this.nb.x - P.x, by = this.nb.y - P.y, bz = this.nb.z - P.z, bl = Math.hypot(bx, by, bz) || 1, k = (K.r - d) * gain / bl; P.x += bx * k; P.y += by * k + 0.15 * (K.r - d) * gain; P.z += bz * k; }
      }
    };
    clearHead(G);
    shell(G);
    // the head is half a tonne on the end of a neck: forces are bounded, lifting is harder than letting it drop,
    // and a head reaching far forward sags under its own weight
    const reach = Math.hypot(G.x - this.nb.x, G.z - this.nb.z);
    G.y -= 0.16 * Math.max(0, reach - 1.25) * (1 - PO.alert);
    {
      // the goal is a place the head can be, and can get to from where it is: where the straight way there is blocked, it aims
      // only as far as it can go, and draws back toward its shoulders, out of a gap or off a wall, before it swings round
      t1.copy(G); clear(t1, h.f, 4);
      const dx = t1.x - h.pos.x, dy = t1.y - h.pos.y, dz = t1.z - h.pos.z, dd = Math.hypot(dx, dy, dz), n = Math.min(10, Math.ceil(dd / 0.2));
      let fr = 1;
      for (let i = 1; i <= n; i++) { const u = i / n; if (skull(h.pos.x + dx * u, h.pos.y + dy * u, h.pos.z + dz * u, h.f, 0) > 0.02) { fr = (i - 1) / n; break; } }
      this.headDetour += ((fr < 1 ? 1 - 0.7 * fr : 0) - this.headDetour) * expK(dt, 0.12);
      if (fr < 1) G.set(h.pos.x + dx * fr, h.pos.y + dy * fr, h.pos.z + dz * fr); else G.copy(t1);
      if (this.dbg) { this.dbg.fr = fr; this.dbg.G = [G.x, G.y, G.z]; this.dbg.t1 = [t1.x, t1.y, t1.z]; }
      const bk = this.headDetour;
      if (bk > 0.01) {
        const bx = this.nb.x - h.pos.x, bz = this.nb.z - h.pos.z, bl = Math.hypot(bx, bz) || 1;
        const fl = Math.hypot(c.f.x, c.f.z) || 1, fwd = () => ((G.x - this.nb.x) * c.f.x + (G.z - this.nb.z) * c.f.z) / fl, ff0 = fwd();
        G.x += bx / bl * 0.8 * bk; G.z += bz / bl * 0.8 * bk; G.y += 0.25 * bk;
        // but the drawing back never takes it back over the shoulders: a head drawn up above the neck's root has the skull forced
        // (by the neck's own limit) to point at the sky
        { const ff1 = fwd(), want = Math.max(ff1, Math.min(ff0, 1.0)), slow = (intent.look && intent.look.lock ? 1 : 0) * (1 - sstep(0.8, 1.6, spd)); if (want > ff1 && slow > 0) { const k = (want - ff1) / fl * slow; G.x += c.f.x * k; G.z += c.f.z * k; } }      // (standing still, where it happens; on the move the body carries the head past)
        clear(G, h.f, 4);
      }
    }
    const wp = 4.6 * wpBoost, aMax = 6.5 * wpBoost * wpBoost;
    const zh = gk === 'strike' && gu < 0.55 ? 0.7 : 1.55;      // slightly under-damped: a heavy head carries on a little and settles back
    let ax = wp * wp * (G.x - h.pos.x) - zh * wp * h.vel.x, ayv = wp * wp * (G.y - h.pos.y) - zh * wp * h.vel.y, az = wp * wp * (G.z - h.pos.z) - zh * wp * h.vel.z;
    const ah = Math.hypot(ax, az); if (ah > aMax) { ax *= aMax / ah; az *= aMax / ah; }
    ayv = clamp(ayv, -aMax * 1.4, aMax * 0.6);
    // near a hard edge it slows: the speed it may still close on it falls away with the room left
    if (skull(h.pos.x, h.pos.y, h.pos.z, h.f, 0.35) > 0) {
      const pl = Math.hypot(CK.px, CK.py, CK.pz) || 1, nx = CK.px / pl, ny = CK.py / pl, nz = CK.pz / pl, room = Math.max(0, 0.35 - CK.dep);
      const vin = -(h.vel.x * nx + h.vel.y * ny + h.vel.z * nz), vmax = 0.15 + Math.sqrt(2 * 4 * room);
      const an = ax * nx + ayv * ny + az * nz;      // positive: away from it
      let an2 = an < 0 ? an * sstep(0, 0.35, room) : an;      // a pull toward it fades as the room goes
      if (vin > vmax) an2 = Math.max(an2, Math.min((vin - vmax) / 0.05, 14));      // excess closing speed shed over a few ticks
      ax += nx * (an2 - an); ayv += ny * (an2 - an); az += nz * (an2 - an);
    }
    h.vel.x += ax * dt; h.vel.y += ayv * dt; h.vel.z += az * dt;
    // reaction: what the neck does to the head, the head does back to the shoulders
    this.headAcc.set(ax, ayv, az);
    const lat = ax * lx + az * lz, lon = ax * fx + az * fz;
    this.twistYaw.v -= 0.012 * lat * dt * 60 * dt; this.chestDip.v += 0.02 * ayv * dt; this.pRoll.v += 0.006 * lat * dt; this.sway.v -= 0.02 * lat * dt; this.balF.v -= 0.025 * lon * dt;
    h.pos.addScaledVector(h.vel, dt);
    { const bx = h.pos.x, by = h.pos.y, bz = h.pos.z; clearHead(h.pos, 0.12); if (h.pos.x !== bx || h.pos.y !== by || h.pos.z !== bz) { h.vel.multiplyScalar(0.96); } }
    shell(h.pos, this.neckFold > 0.05 ? lerp(0.08, 0.012, sstep(0.05, 0.4, this.neckFold)) : 0);
    const floor = T.height(h.pos.x, h.pos.z) + lerp(lerp(0.55, 0.32, clamp(this.rho, 0, 1)), 0.36, lie * this.relax) + Math.max(0, -Math.sin(h.pitch)) * (DIM.headLen + lerp(0.1, -0.12, clamp(this.rho, 0, 1)));
    if (h.pos.y < floor) { h.pos.y = floor; if (h.vel.y < 0) h.vel.y = 0; shell(h.pos); }
    {
      // and last a hard limit on the skull itself: whatever moved it (its own swing, the neck's reach as the body turns), it ends
      // the tick outside. Speed into the contact is lost; what is left of the press tells the body to stop turning or back out.
      this._liftBias = this.headLiftMode > 0 ? 3 : this.headLiftMode < 0 ? 0.25 : 1;      // a contact keeps the way out it started with: no flipping between over and aside
      // wall and neck are solved together, a few rounds of each, so the head slides to a place that suits both where there
      // is one; the neck's reach always has the last word (below)
      const bx = h.pos.x, by = h.pos.y, bz = h.pos.z, mn = 0.69 * DIM.neckLen, mxl = NK.mx * DIM.neckLen;
      const reachOK = () => { t4.subVectors(h.pos, this.nb); const ln = t4.length(); if (ln > 1e-4 && (ln < mn || ln > mxl)) h.pos.copy(this.nb).addScaledVector(t4, clamp(ln, mn, mxl) / ln); };
      for (let it = 0; it < 3; it++) { if (clear(h.pos, h.f, 4) === 0) break; reachOK(); }
      let cx = h.pos.x - bx, cy = h.pos.y - by, cz = h.pos.z - bz, mv = Math.hypot(cx, cy, cz);
      if (mv > 0.04) { const k = 0.04 / mv; cx *= k; cy *= k; cz *= k; mv = 0.04; h.pos.set(bx + cx, by + cy, bz + cz); reachOK(); }      // a contact is never a jump: a few cm a tick at most
      this.headPushV.x = cx; this.headPushV.z = cz;
      if (mv > 0) {
        const nx = cx / mv, ny = cy / mv, nz = cz / mv, vn = h.vel.x * nx + h.vel.y * ny + h.vel.z * nz;
        if (vn < 0) { h.vel.x -= vn * nx; h.vel.y -= vn * ny; h.vel.z -= vn * nz; }
        this.headBlocked = (this.headBlocked || 0) + dt;
      } else this.headBlocked = 0;
      // the neck has the last word: the head is never further from the shoulders than the neck reaches, never folded onto
      // the chest, never outside the cone. Where that and the wall disagree the head stays attached, and the press above
      // (headPushV, headPress) makes the body yield instead.
      reachOK();
      { const cs = t4.copy(h.pos).sub(this.nb).normalize().dot(t5); if (cs < Math.cos(1.12)) shell(h.pos); }
      const hv = h.vel.length(); if (hv > 12) h.vel.multiplyScalar(12 / hv);      // and a skull never flies
      // still touching after that: the neck cannot take it, so the body gives way (backs off, stops turning)
      this.headPinned = skull(h.pos.x, h.pos.y, h.pos.z, h.f, 0) > 0.02;
      this.headPress += (mv / dt - this.headPress) * expK(dt, 0.1);
      this._liftBias = 1;
      { const mh = Math.hypot(h.pos.x - bx, h.pos.z - bz), my = h.pos.y - by; this.headLiftT = mv > 0 ? 0 : this.headLiftT + dt; if (mv > 0) this.headLiftMode = my > mh ? 1 : -1; else if (this.headLiftT > 0.25) this.headLiftMode = 0; }
      this.neckFold += ((mv > 0.004 ? 1 : 0) - this.neckFold) * expK(dt, mv > 0.004 ? 0.12 : 0.8);
      // (BODY4) travelling, a head that meets something yields (it is slid off, tucked, the body steered by the press): that alone is
      // not being wedged. Only when the body itself stops advancing against it for a while does the head count as jammed; else a
      // container corner brushed on a route sent it backing off and into the stuck rule (Saltline noise/3 stood 43 s)
      const fwd = (this.vReq ?? this.vT) > 0.3, prog = fwd && this.v > 0.3;
      this.headBlockT = fwd && !prog && (this.headPinned || this.headPress > 0.6) ? (this.headBlockT || 0) + dt : 0;
      const jamOK = !fwd || this.headBlockT > 0.8;
      this.headJam = !jamOK ? Math.max(0, (this.headJam || 0) - 2 * dt) : this.headPinned ? Math.max(0.4, (this.headJam || 0) + dt) : this.headPress > 0.6 ? (this.headJam || 0) + dt : Math.max(0, (this.headJam || 0) - 2 * dt);
      // the head held back behind something tall for long (a trunk between it and what it is watching): drawn up over its own
      // shoulders the skull can only point at the sky, so the body backs off a step to get its head past instead
      this.headStuckT = this.headDetour > 0.8 && !sn && intent.look && intent.look.lock && Math.abs(this.v) < 0.5 ? (this.headStuckT || 0) + dt : 0;
      if (this.headStuckT > 0.8) this.headJam = Math.max(this.headJam, 0.5);
    }
    this._jaw(dt);
    this._dt = dt; this._neck(dt);
    this._headFinal(dt);
  }

  /** The head's solid volumes (BODY4): spheres along the skull and snout (as the head's own wall test always had them) and along
   *  the lower jaw, hinged low at the back of the skull and swung down by the gape. cb(x, y, z, r, part). */
  _headVol(Px, Py, Pz, f, u, jaw, cb) {
    const HL = DIM.headLen;
    for (let k = 0; k <= 5; k++) { const s = k / 5 * HL; cb(Px + f.x * s, Py + f.y * s - 0.12, Pz + f.z * s, lerp(0.5, 0.2, k / 5), k >= 3 ? 'snout' : 'skull'); }
    const j = Math.max(0, jaw || 0), c = Math.cos(j), sn = Math.sin(j), dx = f.x * c - u.x * sn, dy = f.y * c - u.y * sn, dz = f.z * c - u.z * sn;
    const jx = Px + f.x * 0.3 - u.x * 0.3, jy = Py + f.y * 0.3 - u.y * 0.3, jz = Pz + f.z * 0.3 - u.z * 0.3;
    for (let k = 1; k <= 4; k++) { const s = k / 4 * (HL - 0.35); cb(jx + dx * s, jy + dy * s, jz + dz * s, 0.2 - 0.06 * k / 4, 'jaw'); }
  }

  /** The head as it is DRAWN (BODY4): the skull sits at the end of the neck, turned by the neck's and the atlas' limits after the
   *  head's own wall test ran on where its muscles were taking it, so it could end a tick up to a quarter metre off that and
   *  turned into a wall. Last of all, the drawn skull, snout and jaw are tested against solid things and slid out along the
   *  surface (the neck carries the move, more toward the head), whatever the motion: reaching in, looking round, backing out.
   *  A touch that starts, or a hard knock, is told as an event (part, surface, closing speed) for sound and the mind; the press
   *  goes to the body as the head's other presses do, and the head's own state starts the next tick outside. */
  _headFinal(dt) {
    const T = this.terrain; if (!T.near) return;
    const h = this.head, N = DIM.neckN, sp = this.spine, hd = sp[IDX.HEAD].p;
    let mx = 0, my = 0, mz = 0;
    this._cHome = this.nb;
    for (let it = 0; it < 4; it++) {
      const CK = this._cBegin();
      this._headVol(hd.x, hd.y, hd.z, h.f, h.u, this.jaw, (x, y, z, r) => this._cSample(x, y, z, r, -h.f.x, -h.f.z));
      const dep0 = this._cEnd();
      if (dep0 < 0.004) break;
      let px = CK.px, py = CK.py, pz = CK.pz;
      if (it === 3) {
        // the plain push has not freed it (straddling the end of a jamb end-on, the snout is pushed in while the skull is pushed
        // out): the smallest move that frees the whole head, from a few ways: back toward the shoulders, to either side, up
        const D = (ox, oy, oz) => { this._cBegin(); this._headVol(hd.x + ox, hd.y + oy, hd.z + oz, h.f, h.u, this.jaw, (x, y, z, r) => this._cSample(x, y, z, r, -h.f.x, -h.f.z)); return this._cEnd(); };
        const bx = this.nb.x - hd.x, bz = this.nb.z - hd.z, bl = Math.hypot(bx, bz) || 1, lx = h.l.x, lz = h.l.z, ll = Math.hypot(lx, lz) || 1;
        const dirs = [[bx / bl, 0, bz / bl], [lx / ll, 0, lz / ll], [-lx / ll, 0, -lz / ll], [0, 1, 0], [(bx / bl + lx / ll) * 0.7, 0, (bz / bl + lz / ll) * 0.7], [(bx / bl - lx / ll) * 0.7, 0, (bz / bl - lz / ll) * 0.7], [bx / bl * 0.7, 0.7, bz / bl * 0.7]];
        let found = null;
        for (let k = 1; k <= 12 && !found; k++) { const a = 0.05 * k; for (const d of dirs) if (D(d[0] * a, d[1] * a, d[2] * a) < 0.01) { found = [d[0] * a, d[1] * a, d[2] * a]; break; } }
        if (found) { px = found[0]; py = found[1]; pz = found[2]; }
      } const pl = Math.hypot(px, py, pz), cap = it === 3 ? 0.6 : 0.15; if (pl > cap) { px *= cap / pl; py *= cap / pl; pz *= cap / pl; }
      for (let i = 1; i <= N; i++) { const w = Math.pow(i / N, 1.5), q = sp[IDX.NECK0 + i - 1].p; q.x += px * w; q.y += py * w; q.z += pz * w; }
      mx += px; my += py; mz += pz;
    }
    // and the neck itself, joint by joint (it is solved to the head's dynamic state, which may stand in a wall a moment): each
    // vertebra is slid out on the body's side, the move eased into its neighbours so the neck stays a smooth line
    for (let it = 0; it < 4; it++) {
      let any = false; const mvs = this._nmv || (this._nmv = Array.from({ length: N }, () => [0, 0, 0]));
      for (let i = 1; i < N; i++) { const q = sp[IDX.NECK0 + i - 1].p, r = lerp(0.55, 0.4, (i - 1) / (N - 2)), CK = this._cBegin(); this._cSample(q.x, q.y, q.z, r, -h.f.x, -h.f.z); const dep = this._cEnd(); const M = mvs[i]; M[0] = M[1] = M[2] = 0; if (dep > 0.004) { any = true; const pl = Math.hypot(CK.px, CK.py, CK.pz), k = pl > 0.2 ? 0.2 / pl : 1; M[0] = CK.px * k; M[1] = CK.py * k; M[2] = CK.pz * k; } }
      if (!any) break;
      for (let i = 1; i < N; i++) { const a = mvs[i - 1] || [0, 0, 0], b = mvs[i], c = i + 1 < N ? mvs[i + 1] : [0, 0, 0], q = sp[IDX.NECK0 + i - 1].p; for (let d = 0; d < 3; d++) { const m = Math.abs(b[d]) >= Math.max(Math.abs(a[d]), Math.abs(c[d])) ? b[d] : (b[d] + 0.5 * (a[d] + c[d])) / 2; q.setComponent(d, q.getComponent(d) + m); } }
      mvs[0][0] = mvs[0][1] = mvs[0][2] = 0;
    }
    this._cHome = null;
    h.pos.copy(hd);
    const mv = Math.hypot(mx, my, mz), C = this.headTouch || (this.headTouch = { on: false, off: 9, part: '', kn: 9 }); C.kn += dt;
    if (mv > 0) {
      const nx = mx / mv, ny = my / mv, nz = mz / mv;
      const vn = h.vel.x * nx + h.vel.y * ny + h.vel.z * nz, bv = this.v * (Math.sin(this.psi) * nx + Math.cos(this.psi) * nz), vw = vn + bv;      // the speed it closed on the surface with (its own, and the body's carrying it)
      // (this pass only puts the DRAWN head right and tells of the touch: the head's own state, its press on the body and the body's
      // giving way stay with the head's wall test above. Moving the dynamic head out here too took away the press that steers the
      // body off a wall, and Saltline's searches stalled against containers: 19 stalls in 32 runs against 9; BODY4)
      // what touched, and what it touched: the deepest of the head's volumes and the solid it is in
      if (!C.on && C.off > 0.25 || -vw > 1.2 && C.kn > 0.3) {
        let best = 0, part = 'snout', kind = 'solid', bx = hd.x, by = hd.y, bz = hd.z;
        this._headVol(hd.x - mx, hd.y - my, hd.z - mz, h.f, h.u, this.jaw, (x, y, z, r, pt) => {
          for (const c of T.near(x, z, r + 0.6)) { if (y - r > c.top || (c.bot !== undefined && y + r < c.bot)) continue; let qx = c.x, qz = c.z; const g = c.seg; if (g) { const ex = g.bx - g.ax, ez = g.bz - g.az, l2 = ex * ex + ez * ez, u = l2 > 0 ? clamp(((x - g.ax) * ex + (z - g.az) * ez) / l2, 0, 1) : 0; qx = g.ax + ex * u; qz = g.az + ez * u; }
            const d = c.r + r - Math.hypot(x - qx, z - qz); if (d > best) { best = d; part = pt; kind = c.kind || 'solid'; bx = x; by = y; bz = z; } } });
        this.events.push({ type: 'contact', part, surface: kind, force: +Math.max(0, -vw).toFixed(2), x: bx, y: by, z: bz, nx, ny, nz }); C.kn = 0;
        // a hard knock of the head on something is a knock of the whole animal: the neck is stiff, the body takes it at once (else the
        // trunk ran on another metre into a head held at the wall and the neck curled up under it, a rubber neck; BODY4)
        if (-vw > 2.5) { const hl = Math.hypot(nx, nz) || 1, bodyIn = this.v * (Math.sin(this.psi) * nx + Math.cos(this.psi) * nz) / hl; if (bodyIn < -1) { this._crash(-bodyIn, nx / hl, nz / hl, dt, part); const keep = clamp(1 + 0.92 * bodyIn / Math.max(Math.abs(this.v), 1e-3), 0.08, 1); this.v *= keep; } }
        C.part = part;
      }
      C.on = true; C.off = 0;
    } else { C.off += dt; if (C.off > 0.1) C.on = false; }
    this.headTouchK = C.on ? 1 : 0;
  }

  // The lower jaw is a heavy bone hung on strong muscles, not a flap: whatever gape is asked for (`jawT`), it is driven there by
  // muscle with bounded force. The closers are far stronger than the openers, so it shuts fast and hard and opens slower and
  // controlled; both are damped to critical so it never flutters; the teeth meeting is a hard stop. What the muscles do to the
  // jaw they do back to the skull: it lifts a little as the jaw drops and nods into a hard bite.
  _jaw(dt) {
    // shut at rest; panting only after real exertion, small, opening with each breath and closing between breaths
    const T = 0.008 + 0.14 * Math.max(0, this.exertion - 0.5) * Math.min(this.breath, 1) + 0.05 * this.rho * (1 - 0.85 * (this.noseK || 0)) + this.jawExtra;      // (the probe's parted mouth closes while it scents)
    this.jawT = T;
    const e = T - this.jaw, closing = e < 0;
    const wn = closing ? 30 : 11, z = closing ? 1 : 1.1, aMax = closing ? 700 : 45 + 30 * this.roarEnv;
    const a = clamp(wn * wn * e - 2 * z * wn * this.jawV, -aMax, aMax);
    const v0 = this.jawV;
    this.jawV += a * dt; this.jaw += this.jawV * dt;
    if (this.jaw < -0.035) { this.jaw = -0.035; if (this.jawV < 0) this.jawV = 0; }      // teeth meet
    const dv = this.jawV - v0, h = this.head;
    h.pitchV += 0.045 * dv;      // reaction on the skull
  }

  // Neck: a chain of DIM.neckN rigid vertebrae of fixed length from the chest to the back of the skull, solved each tick to
  // put its end at the head and enter the skull along the skull's own line (the neck rises into the occiput from behind and a
  // little below: the skull is carried on its end, not levered by it). Its shape is six numbers: the turn of the first vertebra
  // off the shoulders (pitch, yaw) and a linear profile of bend along the neck in each plane (mean and gradient), so it is
  // always one smooth S or C, never a kink. A damped Gauss-Newton step from last tick's shape fits it (deterministic,
  // continuous). Every bend is held inside the joint's range and the bones never change length; where the head asked for a
  // place the neck cannot put it, the head goes where the neck ends (the head is always on its neck), and the press shows up as
  // the head's own correction, which the body answers as it does any other press.
  _neckFK(x, out, dirs) {
    const N = DIM.neckN, l = DIM.neckLen / N, c = this.chest, B0 = this.nb;
    // the frame the neck leaves the shoulders in: the chest's own; the neck's rise off it (0.76 rad up, its forward-up axis)
    // and the root turn are shared over the first three joints as an arc (NECK_ROOT): all of it at the first joint was a
    // kink of 0.4-1.7 rad at the thickest part of the animal, which no skin can follow
    let dx = c.f.x, dy = c.f.y, dz = c.f.z, dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
    let lx = c.l.x, ly = c.l.y, lz = c.l.z; { const k = lx * dx + ly * dy + lz * dz; lx -= dx * k; ly -= dy * k; lz -= dz * k; const n = Math.hypot(lx, ly, lz) || 1; lx /= n; ly /= n; lz /= n; }
    let ux = dy * lz - dz * ly, uy = dz * lx - dx * lz, uz = dx * ly - dy * lx;
    const turn = (yw, pt) => {      // yaw about u (toward l), then pitch about l (positive: nose down)
      if (yw) { const c1 = Math.cos(yw), s1 = Math.sin(yw), ndx = dx * c1 + lx * s1, ndy = dy * c1 + ly * s1, ndz = dz * c1 + lz * s1; lx = lx * c1 - dx * s1; ly = ly * c1 - dy * s1; lz = lz * c1 - dz * s1; dx = ndx; dy = ndy; dz = ndz; }
      if (pt) { const c1 = Math.cos(pt), s1 = Math.sin(pt), ndx = dx * c1 - ux * s1, ndy = dy * c1 - uy * s1, ndz = dz * c1 - uz * s1; ux = ux * c1 + dx * s1; uy = uy * c1 + dy * s1; uz = uz * c1 + dz * s1; dx = ndx; dy = ndy; dz = ndz; }
    };
    const rp = x[0] - NECK_RISE;
    let px = B0.x, py = B0.y, pz = B0.z;
    for (let k = 0; k < N; k++) {
      const wp = NECK_SPREAD[k] || 0;      // the rise over five joints (the sim's own share: the skin's bind keeps NECK_ROOT)
      // sideways: one C only (BODY4). x[1] is the whole neck's sideways turn, shared over all seven joints by a profile that is
      // never negative (x[4] leans it toward the shoulders or the skull), so the bends along the neck never change sign: no S
      const ly = neckLat(x, k, N);
      if (k > 0) { const s = (k - (N / 2)) / (N / 2 - 1); turn(ly, x[2] + x[3] * s + wp * rp); } else turn(ly, wp * rp);
      px += dx * l; py += dy * l; pz += dz * l;
      if (out) out[k].set(px, py, pz);
      if (dirs) { dirs[0] = dx; dirs[1] = dy; dirs[2] = dz; }
    }
    return [px, py, pz, dx, dy, dz];
  }
  _neck() {
    const sp = this.spine, N = DIM.neckN, c = this.chest, h = this.head, BEND = 0.56, ROOT = 1.0, SKULL = 1.05;
    const X = this.neckX || (this.neckX = [0, 0, 0.12, 0.15, 0, 0]);
    // the line the neck must enter the skull on: the skull's forward line tipped a little up (the occiput sits above the last vertebra)
    // the occiput sits above the last vertebra and the neck meets the skull from below (tip 0.6, was 0.24): the skull's line
    // finishes the neck's rise instead of forcing the neck to arch up and then fall back level into it (SKIN3.md, BODYFIX2.md)
    // As much as the neck rises: a head held low takes the neck in level (no nose-up hook at the end of a falling neck)
    const ETIP = NK.etip + NK.etipS * this.stalk; let ex = h.f.x + h.u.x * ETIP, ey = h.f.y + h.u.y * ETIP, ez = h.f.z + h.u.z * ETIP; { const n = Math.hypot(ex, ey, ez); ex /= n; ey /= n; ez /= n; }
    const SK = this.act && STRIKES.has(this.act.kind) ? 1 : 0, P = h.pos, WP = 3.0, WD = 1.6, WL = 2.5, WT = SK ? 0.4 : 3, XP = this._nxp || (this._nxp = X.slice());      // WT: the shape moves on smoothly from last tick's
    const REST = [NK.restS * NECK_RISE * this.stalk, 0, 0.12, 0.15, 0, 0], WR = this._nwr || (this._nwr = [0.35, 0.35, 0.1, 0.2, 0.4, 1.2]);
    // with the head about straight ahead (its place and its facing within ~10 deg of the chest's forward line, as at rest and in
    // idle) a sideways bend along the neck costs thirty times more (and the root's yaw ten): the chain's slack goes into the vertical S only, never a
    // sideways bulge; whatever little yaw is wanted is taken at the root, spread over three joints
    { const fx = c.f.x, fz = c.f.z, fl = Math.hypot(fx, fz) || 1, ax = P.x - this.nb.x, az = P.z - this.nb.z, al = Math.hypot(ax, az) || 1, hl = Math.hypot(h.f.x, h.f.z) || 1;
      const sp = Math.abs(fx * az - fz * ax) / (fl * al), sf = Math.abs(fx * h.f.z - fz * h.f.x) / (fl * hl), k = 1 + 30 * sstep(0.26, 0.17, Math.max(sp, sf));
      WR[1] = 0.2 * (1 + (k - 1) / 3); WR[4] = 0.5; WR[5] = 2; }      // (BODY4: x[1] is the whole sideways C, x[4] its lean, x[5] unused)      // the turn off the shoulders costs more than bending along the neck: the bend is shared out (the rest was a quarter radian of yaw to one side: a standing lateral S). A sideways bend along the neck costs four to six times one up and down: the head's yaw is taken at the root (spread over three joints), and slack goes into the vertical S, not a sideways bulge
    const M = 6, R = 3 + 3 + M + (N - 1) + 1 + M + 1 + 1;
    const res = (x, r) => {
      const e = this._neckFK(x, null, null);
      r[0] = WP * (e[0] - P.x); r[1] = WP * (e[1] - P.y); r[2] = WP * (e[2] - P.z);
      r[3] = WD * (e[3] - ex); r[4] = WD * (e[4] - ey); r[5] = WD * (e[5] - ez);
      for (let i = 0; i < M; i++) r[6 + i] = WR[i] * (x[i] - REST[i]);
      for (let k = 1; k < N; k++) { const s = (k - N / 2) / (N / 2 - 1), b = Math.hypot(x[2] + x[3] * s, neckLat(x, k, N)); r[6 + M + k - 1] = WL * Math.max(0, b - BEND + 0.12) ** 2 / 0.1; }
      r[6 + M + N - 1] = WL * Math.max(0, Math.hypot(x[0], neckLat(x, 0, N)) - ROOT + 0.15) ** 2 / 0.1;      // ranges as smooth walls (no kink for the fit to jump at)
      r[R - 2] = WL * Math.max(0, Math.abs(x[1]) - neckLatMax(x[4]) * (1 + 1.0 * SK) + 0.04) ** 2 / 0.02;      // the sideways range (species neck.latTotal / latJoint)
      for (let i = 0; i < M; i++) r[6 + M + N + i] = WT * (x[i] - XP[i]);
      r[R - 1] = WL * Math.max(0, Math.hypot(e[0] - this.nb.x, e[1] - this.nb.y, e[2] - this.nb.z) - NK.str * DIM.neckLen) ** 2 / 0.05;      // never pulled straight
    };
    const r0 = this._nr0 || (this._nr0 = new Float64Array(R)), r1 = this._nr1 || (this._nr1 = new Float64Array(R)), J = this._nJ || (this._nJ = new Float64Array(R * M));
    const A = new Float64Array(M * M), g = new Float64Array(M), xt = X.slice();
    for (let it = 0; it < 10; it++) {
      res(X, r0);
      for (let j = 0; j < M; j++) { xt[j] = X[j] + 1e-4; res(xt, r1); xt[j] = X[j]; for (let i = 0; i < R; i++) J[i * M + j] = (r1[i] - r0[i]) / 1e-4; }
      for (let a = 0; a < M; a++) { let sg = 0; for (let i = 0; i < R; i++) sg += J[i * M + a] * r0[i]; g[a] = -sg; for (let b = 0; b <= a; b++) { let sa = 0; for (let i = 0; i < R; i++) sa += J[i * M + a] * J[i * M + b]; A[a * M + b] = A[b * M + a] = sa; } A[a * M + a] += 1e-3 + 0.25 * A[a * M + a]; /* well damped: no overshoot at a range wall, no chatter */ }
      // solve A d = g (symmetric positive definite: Cholesky)
      for (let a = 0; a < M; a++) { for (let b = 0; b < a; b++) { let s = A[a * M + b]; for (let k = 0; k < b; k++) s -= A[a * M + k] * A[b * M + k]; A[a * M + b] = s / A[b * M + b]; } let s = A[a * M + a]; for (let k = 0; k < a; k++) s -= A[a * M + k] * A[a * M + k]; A[a * M + a] = Math.sqrt(Math.max(s, 1e-12)); }
      for (let a = 0; a < M; a++) { let s = g[a]; for (let k = 0; k < a; k++) s -= A[a * M + k] * g[k]; g[a] = s / A[a * M + a]; }
      for (let a = M - 1; a >= 0; a--) { let s = g[a]; for (let k = a + 1; k < M; k++) s -= A[k * M + a] * g[k]; g[a] = s / A[a * M + a]; }
      let dn = 0; for (let a = 0; a < M; a++) dn = Math.max(dn, Math.abs(g[a]));
      const k = dn > 0.3 ? 0.3 / dn : 1; for (let a = 0; a < M; a++) X[a] += g[a] * k;
      if (dn < 1e-5) break;
    }
    // a trust region per tick: the shape moves on continuously (at most ~0.045 rad a parameter a tick), never leaps between fits
    // (falling behind the head, the shape may move on faster: a skull drawn at a neck end that lags it stood in walls)
    { const tr = SK ? 0.12 : lerp(0.045, 0.08, sstep(0.08, 0.25, this.neckGap || 0)); for (let a = 0; a < M; a++) X[a] = XP[a] + clamp(X[a] - XP[a], -tr, tr); }
    // the sideways curve is low-passed and rate-limited (BODY4): a heavy neck sweeps, it does not writhe after every small move of
    // the head (falling well behind the head, it may catch up faster, as above)
    { const dtn = this._dt || 1 / 120, gk = Math.max(SK, sstep(0.1, 0.3, this.neckGap || 0)), tau = lerp(NL.latTau, 0.025, gk), rate = lerp(NL.latRate, 3.2, gk) * dtn;
      X[1] = XP[1] + clamp((X[1] - XP[1]) * expK(dtn, tau), -rate, rate); X[4] = XP[4] + clamp((X[4] - XP[4]) * expK(dtn, tau * 2), -rate, rate); X[5] = 0; }
    // the hard ranges: a bend that the fit left a little past its joint's range is brought inside it
    { X[4] = clamp(X[4], -NL_G, NL_G); const lm = neckLatMax(X[4]) * (1 + 1.0 * SK); X[1] = clamp(X[1], -lm, lm);      // sideways: inside its range, one C
      const b0 = Math.abs(X[0]), y0 = Math.abs(neckLat(X, 0, N)); if (Math.hypot(b0, y0) > ROOT) X[0] = Math.sign(X[0]) * Math.sqrt(Math.max(0, ROOT * ROOT - y0 * y0));
      for (const s of [-1, 1]) { const bp = X[2] + X[3] * s, by = neckLat(X, s < 0 ? 1 : N - 1, N), b = Math.hypot(bp, by); if (b > BEND) { const q = Math.sqrt(Math.max(0, BEND * BEND - by * by)) / Math.max(Math.abs(bp), 1e-6); X[2] += (bp * q - bp) / 2; X[3] += s * (bp * q - bp) / 2; } } }
    const pts = this._nk || (this._nk = Array.from({ length: N }, () => new Vector3())), dir = this._nd || (this._nd = [0, 0, 1]);
    this._neckFK(X, pts, dir);
    // the head is where its neck ends
    this.neckGap = pts[N - 1].distanceTo(h.pos);
    for (let i = 0; i < M; i++) XP[i] = X[i];
    // the head's dynamic state is kept apart from the skull: the neck follows it within its own rate and range, and only what
    // the neck cannot give (beyond a small play) is taken back off the dynamic head, gently, with its speed into the refusal
    const D = this.headDyn || (this.headDyn = new Vector3().copy(h.pos));
    D.copy(h.pos);
    if (this.neckGap > 1e-4) {
      const gx = (D.x - pts[N - 1].x) / this.neckGap, gy = (D.y - pts[N - 1].y) / this.neckGap, gz = (D.z - pts[N - 1].z) / this.neckGap, vn = h.vel.x * gx + h.vel.y * gy + h.vel.z * gz, w = sstep(0.02, 0.12, this.neckGap);
      if (vn > 0) { h.vel.x -= w * vn * gx; h.vel.y -= w * vn * gy; h.vel.z -= w * vn * gz; }
      const back = this.neckGap * w * Math.min(1, 6 * this._dt);
      D.x -= gx * back; D.y -= gy * back; D.z -= gz * back;
    }
    h.pos.copy(pts[N - 1]);
    for (let i = 1; i <= N; i++) { const j = sp[IDX.NECK0 + i - 1]; j.p.copy(pts[i - 1]); j.u.copy(c.u).lerp(h.u, i / N).normalize(); }
    this.neckEnd.set(dir[0], dir[1], dir[2]);
    // the joint at the back of the skull: the skull keeps within SKULL of the last vertebra's line. The fit enters the skull along
    // its own line, so this only acts where the head was asked for something its neck cannot give; then the skull is turned the
    // shortest way back inside its range (it does not choose a side: no preference for the sky)
    { const e = this.neckEnd, off2 = Math.acos(clamp(e.dot(h.f), -1, 1));
      if (off2 > SKULL) {
        t3.crossVectors(h.f, e); if (t3.lengthSq() < 1e-8) t3.copy(c.l); t3.normalize();
        const ang = off2 - SKULL, ca = Math.cos(ang), sa = Math.sin(ang);
        for (const vec of [h.f, h.u, h.l]) { const d = t3.dot(vec); t4.crossVectors(t3, vec); vec.multiplyScalar(ca).addScaledVector(t4, sa).addScaledVector(t3, d * (1 - ca)); }
        if (Math.abs(h.f.y) < 0.85) h.yaw += wrap(bearing(h.f.x, h.f.z) - h.yaw);
        h.pitch = clamp(Math.asin(clamp(h.f.y, -1, 1)), -1.05, 0.85);
      } }
    // the skull's sideways turn on the atlas (BODY4): with the neck's curve up to skullSame, against it only skullOpp (a neck bent
    // one way and the skull turned back the other is the S seen from above); a neck held straight lets the skull turn either way
    { const e = this.neckEnd, eh = Math.hypot(e.x, e.z), fh = Math.hypot(h.f.x, h.f.z);
      if (eh > 0.45 && fh > 0.45) {
        const rel = wrap(bearing(h.f.x, h.f.z) - bearing(e.x, e.z)), th = X[1], opp = th * rel < 0 ? sstep(0.04, 0.16, Math.abs(th)) : 0;
        const lim = lerp(NL.skullSame, NL.skullOpp, opp) * (1 + 0.4 * SK);      // (a strike may turn the skull further on the atlas)
        if (Math.abs(rel) > lim) {
          // (about the vertical; faded out as skull or neck end turn steep, where a bearing means little, and never more than a
          // small turn a tick: it is a range the head is eased back into, never a jump)
          const ang = clamp(-(rel - Math.sign(rel) * lim) * sstep(0.45, 0.75, Math.min(eh, fh)), -0.012, 0.012), ca = Math.cos(ang), sa = Math.sin(ang);
          for (const vec of [h.f, h.u, h.l]) { const vx = vec.x * ca + vec.z * sa, vz = -vec.x * sa + vec.z * ca; vec.x = vx; vec.z = vz; }
          h.yaw += ang; if (h.yawV * ang < 0) h.yawV *= 0.5;
        }
      } }
  }

  // ---------------------------------------------------------------- tail
  _tail(dt) {
    const T = this.terrain, N = DIM.tailN, seg = DIM.tailLen / N, [L, R] = this.feet;
    const spd = Math.abs(this.v), m = sstep(0.15, 0.7, spd), mRun = sstep(3.5, 7.5, spd);
    const gazeRel = clamp(wrap(this.head.yaw - this.psi), -1.7, 1.7);
    const yawTot = clamp(0.55 * this.om, -0.5, 0.5) + 0.15 * (L.load - R.load) * m * (1 - 0.4 * sstep(4, 9, spd)) - 0.8 * this.pYaw.x - 0.12 * gazeRel
      + (0.07 * Math.sin(this.t * 0.37 + 1) + 0.045 * Math.sin(this.t * 0.83)) * (1 - 0.7 * this.stalk) * (1 - 0.8 * (this.post ? this.post.alert : 0))
      + (this.act && this.act.kind === 'tailFlick' ? 0.45 * this.act.sgn * Math.sin((this.act.t / this.act.dur) * Math.PI * 2) : 0)
      - (this.act && this.act.kind === 'swipe' ? 0.5 * this.act.sgn * sstep(0.05, 0.3, this.act.t / this.act.dur) * (1 - sstep(0.6, 0.95, this.act.t / this.act.dur)) : 0)
      + (this.post ? this.post.agit * (0.32 * Math.sin(this.t * 3.1) + 0.14 * Math.sin(this.t * 7.3 + 1.3)) * (0.6 + 0.4 * Math.sin(this.t * 0.37)) : 0);
    const PO = this.post || { alert: 0, display: 0, agit: 0, hold: 0 };
    // the tail feels what it brushes and is bent round it: contacts a little ahead of the tail (from where it lay last tick,
    // further ahead the faster it is swinging) add bend to the joints between the root and the contact, so the curve it
    // follows wraps past a trunk or lies along a wall; each joint's extra bend is bounded and rate-limited, so it never whips
    const B = this.tailBend || (this.tailBend = new Float64Array(N + 1)), Bd = this._tbd || (this._tbd = new Float64Array(N + 1));
    Bd.fill(0);
    let best = 0, dUp = 0, latB = 0, back = 0;
    // a wall the tail points straight into pushes it back along itself, which no sideways bend answers (the tip stood 0.9 m
    // inside a container in Saltline, the hips 6 m off it): that push is turned into a curl to one side, the side it already
    // leans to (kept while the contact lasts, so it never flips), so the tail lies along the wall instead of into it
    const side = this.tailSide || (this.tailSide = { s: 0, t: -9 });
    if (T.near) for (let k = 1; k <= N; k++) {
      const P = this.tail[k].p, rn = lerp(0.62, 0.14, k / N) + 0.3 + 0.25 * Math.abs(this.om) * k * seg + 0.15 * spd, CK = this._cBegin();
      this._cSample(P.x, P.y, P.z, rn, this.pl.x, this.pl.z); if (!this._cEnd()) continue;
      let lat = CK.px * this.pl.x + CK.pz * this.pl.z;
      const ax = Math.max(0, CK.px * this.pf.x + CK.pz * this.pf.z);      // pushed back toward the hips (forward along the body)
      if (ax > Math.abs(lat)) {
        if (this.t - side.t > 0.5 || !side.s) { let sb = 0; for (let i = 1; i <= N; i++) sb += B[i]; side.s = Math.sign(Math.abs(lat) > 0.02 ? lat : sb || yawTot || 1); }
        side.t = this.t; lat += side.s * (ax - Math.abs(lat)); back = Math.max(back, ax);
      }
      const c = lat / (seg * k * (k + 1) / 2);
      for (let i = 1; i <= k; i++) Bd[i] += c;
      if (CK.dep > best) { best = CK.dep; latB = lat; dUp = CK.py / (k * seg); }
    }
    let bmax = 0, bsum = 0;
    for (let i = 1; i <= N; i++) {
      const tg = clamp(B[i] + Bd[i] * expK(dt, 0.06), -0.2, 0.2) * (1 - expK(dt, best > 0 ? 6 : 1.2));
      const rl = (0.35 + 0.12 * spd) * dt; B[i] += clamp(tg - B[i], -rl, rl); bmax = Math.max(bmax, Math.abs(B[i])); bsum += B[i];
    }
    { const cap = lerp(0.9, 1.6, sstep(0, 0.3, back)); if (Math.abs(bsum) > cap) { const k = cap / Math.abs(bsum); for (let i = 1; i <= N; i++) B[i] *= k; } }      // it curls only so far round (further against a wall it points into: it lies along it)
    this.tailUp += clamp(clamp(this.tailUp + dUp * expK(dt, 0.06), 0, 0.6) * (1 - expK(dt, best > 0 ? 6 : 1.6)) - this.tailUp, -0.6 * dt, 0.6 * dt);
    this.tailLat = best > 0 ? Math.sign(latB) : 0; this.tailSat = bmax / 0.2; this.tailNear = best; this.tailBack = back;      // (felt ahead of the swing: the turn brakes on it)
    // the tail root is heavy: it resists the pelvis' turning acceleration, lags, then follows; turning on the spot it trails a little
    {
      const H = this.H, wn = 3.2, z = 0.6, tgt = 0.2 * this.om * (1 - m);      // (+ = swung toward the pelvis' left: what a tail left behind by a left turn looks like)
      this.tailRootV += (wn * wn * (tgt - this.tailRoot) - 2 * z * wn * this.tailRootV + H.tailInertia * clamp(this.pTurnA, -40, 40)) * dt;
      this.tailRoot += this.tailRootV * dt;
      const rm = H.tailRootMax * (1 - 0.8 * sstep(0.02, 0.25, this.tailNear || 0));      // against something, the root is held in line
      if (Math.abs(this.tailRoot) > rm) { this.tailRoot = Math.sign(this.tailRoot) * Math.max(rm, Math.abs(this.tailRoot) - 0.6 * dt); if (this.tailRootV * this.tailRoot > 0) this.tailRootV *= 0.3; }
    }
    const base = this.tail[0];
    base.p.copy(this.pc).addScaledVector(this.pf, -0.6).addScaledVector(this.pu, -0.05);
    base.tgt.copy(base.p);
    const dxr = this.x - this.px, dzr = this.z - this.pz, dyr = this.groundY - this.pgy;
    const ax = Math.sin(this.psi) * this.acc, az = Math.cos(this.psi) * this.acc;
    let pitch = 0, bend = 0;
    for (let k = 1; k <= N; k++) {
      const q = k / N, node = this.tail[k];
      pitch += (this.act && this.act.kind === 'swipe' ? -0.07 * sstep(0, 0.2, this.act.t / this.act.dur) * (1 - sstep(0.7, 1, this.act.t / this.act.dur)) : 0) + (k <= 5 ? -0.03 : 0.024) * (1 - 0.7 * mRun) + 0.01 * this.lowness + 0.004 * clamp((this.headMoment || 0) - 2.2, -1, 2) + (k <= 6 ? 0.012 : -0.006) * PO.display + (k > 2 ? 0.03 * clamp(this.lieS.x, 0, 1) + 0.004 * this.relax : 0);      // lying, the tail lies along the ground
      // tail muscles hold it near level in the world whatever the pelvis is doing
      const pw = pitch + this.pPitch.x * 0.65 * Math.min(1, k / 4) + this.tailUp * Math.min(1, k / 3);
      bend += B[k];
      const yw = yawTot * Math.pow(q, 1.3) * 1.6 + bend + this.tailRoot * Math.min(1, k / 3), cp = Math.cos(pw);
      t0.copy(this.pf).multiplyScalar(-Math.cos(yw) * cp).addScaledVector(this.pl, Math.sin(yw) * cp).addScaledVector(this.pu, Math.sin(pw));
      node.tgt.copy(this.tail[k - 1].tgt).addScaledVector(t0, seg);
      // simulate in the travelling frame; acceleration and rotation are what the tail feels
      node.p.x += dxr; node.p.z += dzr; node.p.y += dyr; node.prev.x += dxr; node.prev.z += dzr; node.prev.y += dyr;
      const wn = lerp(20, 5.5, Math.pow(q, 0.7)), zeta = 0.55;
      const vx = (node.p.x - node.prev.x) / dt, vy = (node.p.y - node.prev.y) / dt, vz = (node.p.z - node.prev.z) / dt;
      const nx = node.p.x + vx * dt + (wn * wn * (node.tgt.x - node.p.x) - 2 * zeta * wn * vx - ax * 0.22 * q) * dt * dt;
      const ny = node.p.y + vy * dt + (wn * wn * (node.tgt.y - node.p.y) - 2 * zeta * wn * vy) * dt * dt;
      const nz = node.p.z + vz * dt + (wn * wn * (node.tgt.z - node.p.z) - 2 * zeta * wn * vz - az * 0.22 * q) * dt * dt;
      node.prev.copy(node.p); node.p.set(nx, ny, nz);
      const prevP = this.tail[k - 1].p;
      t1.subVectors(node.p, prevP).normalize();
      // each caudal joint only bends so far off the one before it; the limit pushes back softly so it never chatters
      if (k === 1) t2.copy(this.pf).multiplyScalar(-1).addScaledVector(this.pu, -0.03).normalize(); else t2.subVectors(prevP, this.tail[k - 2].p).normalize();
      const lim = k === 1 ? 0.24 : 0.19, cs = clamp(t1.dot(t2), -1, 1);
      t4.copy(node.p);
      if (cs < Math.cos(lim)) { t3.copy(t1).addScaledVector(t2, -cs).normalize(); t3.multiplyScalar(Math.sin(lim)).addScaledVector(t2, Math.cos(lim)); t1.lerp(t3, 0.35).normalize(); }
      node.p.copy(prevP).addScaledVector(t1, seg);
      node.prev.add(t4.sub(node.p).multiplyScalar(-0.85));      // constraint moves carry (almost) no velocity
      if (T.near) {      // what the bend did not keep clear is eased out a little each tick, turning the segment about its root within its limit
        const CK = this._cBegin(); this._cSample(node.p.x, node.p.y, node.p.z, lerp(0.62, 0.14, q), this.pl.x, this.pl.z);
        if (this._cEnd() > 0) {
          const cl = Math.hypot(CK.px, CK.py, CK.pz), ks = Math.min(1, 0.035 / cl);
          t1.set(node.p.x + CK.px * ks - prevP.x, node.p.y + CK.py * ks - prevP.y, node.p.z + CK.pz * ks - prevP.z).normalize();
          // against something the joint may curl further than it swings freely (to 2.6 times its range); a clearing that would need
          // more goes as far as that allows (it used to be dropped altogether, so a tail root swung into a wall stayed in it)
          const cmax = Math.cos(lim * 2.6), cd = t1.dot(t2);
          if (cd < cmax) { t3.copy(t1).addScaledVector(t2, -cd); if (t3.lengthSq() > 1e-10) { t3.normalize(); t1.copy(t2).multiplyScalar(cmax).addScaledVector(t3, Math.sqrt(1 - cmax * cmax)); } else t1.copy(t2); }
          t4.copy(node.p); node.p.copy(prevP).addScaledVector(t1, seg); node.prev.add(t4.sub(node.p).multiplyScalar(-0.85));
        }
      }
      const floor = T.height(node.p.x, node.p.z) + lerp(0.5, 0.08, q) + 0.05;
      if (node.p.y < floor) node.p.y = floor;
    }
    for (let k = 0; k <= N; k++) { const j = this.spine[IDX.TAIL_BASE - k]; j.p.copy(this.tail[k].p); j.u.copy(this.pu); }
  }

  // ---------------------------------------------------------------- limbs and pose buffer
  _leg(i, H, out) {
    const foot = this.feet[i], n = foot.n, s = foot.s;
    const f0 = t0.set(Math.sin(foot.yaw), 0, Math.cos(foot.yaw)); f0.addScaledVector(n, -f0.dot(n)).normalize();
    const x = (H.x - foot.pos.x) * f0.x + (H.y - foot.pos.y) * f0.y + (H.z - foot.pos.z) * f0.z;
    const theta = 1.08 + 0.38 * clamp(x / 1.2, -1.2, 1.6), lie = clamp(this.lieS.x, 0, 1);
    const sore = this.injury && this.injury.foot === i ? this.injury.sev : 0;
    const mtp = foot.mtp, ankle = t1;
    // digit III peels off the ground proximal to distal: first the MTP joint lifts and the proximal phalanx turns up about the
    // next joint (by `beta`), then, `peel` later, the distal phalanx turns up about the claw tip, which stays put to the end
    const FT = this.FT, TL = FT.toes[1], lp3 = TL * FT.split, ld3 = TL - lp3, pad = FT.pad;
    const place = (beta, lift) => {
      const a1 = lift, a2 = Math.max(0, lift - FT.peel);
      mtp.copy(foot.pos).addScaledVector(n, pad + lp3 * Math.sin(a1) + ld3 * Math.sin(a2)).addScaledVector(f0, TL - lp3 * Math.cos(a1) - ld3 * Math.cos(a2));
      const th = lerp(theta + 0.5 * beta + foot.ank.x, 0.13, lie);      // lying, the metatarsus lies flat with the ankle on the ground behind it
      ankle.copy(mtp).addScaledVector(f0, -Math.cos(th) * DIM.meta).addScaledVector(n, Math.sin(th) * DIM.meta);
      return ankle.distanceTo(H);
    };
    let p;
    if (foot.planted) {
      // heel peels off as the hip passes over and ahead; eased, so a foot that lands under the hip rolls rather than snaps
      // stance phase: the share of this stance's hip travel done (from speed, so a slowing animal's stance stretches); from
      // `heelRise.start` on the heel comes up, reaching the speed's lift-off angle as the stance ends. Unloading the foot
      // (the other has landed and this one is next to go) brings it the rest of the way
      const spd = Math.abs(this.v), HR = FT.heelRise, Dg = gait.stepLen(spd), dty = gait.duty(spd);
      foot.phi = (foot.phi ?? 0) + (1 / 120) * spd / Math.max(0.3, 0.92 * dty * 2 * Dg);      // (the hip travels ~0.92 of the gait's nominal stance distance before the foot is lifted)
      const bMax = (spd < 2.2 ? lerp(HR.slow, HR.walk, sstep(1.0, 2.2, spd)) : lerp(HR.walk, HR.run, sstep(2.2, 8, spd))) * sstep(0.25, 0.9, spd);
      const roll = Math.max(sstep(HR.start, 1.02, foot.phi), (this.feet[1 - i].planted ? sstep(0.85, 0.3, foot.load) * sstep(0.4, 0.6, foot.phi) : 0));
      const bT = Math.max(bMax * roll, 0.6 * sstep(0.5, 1.6, x), 0.42 * sore * (1 - sstep(0.3, 1.2, Math.abs(this.v)))) * (1 - lie);      // a sore foot stands on its toes, the pad held off the ground
      foot.betaS = (foot.betaS ?? 0) + (bT - (foot.betaS ?? 0)) * (1 - Math.exp(-(1 / 120) / 0.07));
      let beta = foot.betaS;
      if (place(beta, beta) > RMAX) {       // and rolls further onto the toes if the leg needs the length
        let lo = beta, hi = 1.2;
        for (let k = 0; k < 9; k++) { const mid = (lo + hi) / 2; if (place(mid, mid) > RMAX) lo = mid; else hi = mid; }
        beta = hi;
      }
      // rolling onto the toes takes a moment; whatever length is still missing the leg absorbs
      foot.betaR = (foot.betaR ?? beta) + (beta - (foot.betaR ?? beta)) * (1 - Math.exp(-(1 / 120) / 0.05)); beta = foot.betaR; place(beta, beta);
      foot.beta = beta; p = -beta;
    } else { p = foot.pitch; place(Math.max(0, -p), 0); }
    const d = ankle.distanceTo(H);
    if (d - RMAX > this.over) this.over = d - RMAX;
    if (d > RMAX) { t2.subVectors(ankle, H).multiplyScalar(RMAX / d - 1); ankle.add(t2); mtp.add(t2); }
    // two-bone solve, knee forward
    const a = DIM.femur, b = DIM.tibia;
    t2.subVectors(ankle, H); const dd = clamp(t2.length(), Math.abs(a - b) + 0.02, a + b - 0.005); t2.normalize();
    const cosA = clamp((a * a + dd * dd - b * b) / (2 * a * dd), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    // the knee plane follows the foot: the femur rotates about its long axis by (a share of) the yaw between pelvis and foot, within
    // the hip's range, so a body turning over a planted foot shows at the hip and the ankle stays a hinge
    const Hh = this.H, rel = wrap(foot.yaw - s * 0.07 - (this.yawP ?? this.psi)), rot = clamp(rel, -Hh.hipRot, Hh.hipRot) * (foot.planted ? Hh.kneeFollow[1] : lerp(Hh.kneeFollow[0], Hh.kneeFollow[1], Math.max(1 - sstep(0, 0.3, foot.sw.t / foot.sw.T), sstep(0.55, 0.95, foot.sw.t / foot.sw.T)))) * (1 - lie);      // swinging, it turns to set the foot down
    const cr = Math.cos(rot), sr = Math.sin(rot); foot.hipRot = rot;
    const ko = Hh.kneeOut + (0.4 - Hh.kneeOut) * lie;
    t3.copy(this.pf).multiplyScalar(cr).addScaledVector(this.pl, sr + s * ko * cr).addScaledVector(this.pf, -s * ko * sr).addScaledVector(this.pu, 0.15);      // folded under it, the knees splay a little
    t3.addScaledVector(t2, -t3.dot(t2));
    // the knee keeps its direction from one moment to the next; it never flips when the leg folds tight
    if (!foot.kneeDir) foot.kneeDir = t3.clone().normalize();
    const conf = Math.min(1, t3.length() * 3);
    t3.normalize().lerp(foot.kneeDir, 1 - 0.5 * conf); t3.addScaledVector(t2, -t3.dot(t2)).normalize();
    foot.kneeDir.copy(t3);
    const v = this.pose.v; let o = (PV.LEG + i * LEG.SIZE) * 3;
    v[o] = H.x; v[o + 1] = H.y; v[o + 2] = H.z; o += 3;
    v[o] = H.x + t2.x * a * cosA + t3.x * a * sinA; v[o + 1] = H.y + t2.y * a * cosA + t3.y * a * sinA; v[o + 2] = H.z + t2.z * a * cosA + t3.z * a * sinA; o += 3;
    v[o] = ankle.x; v[o + 1] = ankle.y; v[o + 2] = ankle.z; o += 3;
    v[o] = mtp.x; v[o + 1] = mtp.y; v[o + 2] = mtp.z; o += 3;
    const cp = Math.cos(p), sp = Math.sin(p);
    v[o] = f0.x * cp + n.x * sp; v[o + 1] = f0.y * cp + n.y * sp; v[o + 2] = f0.z * cp + n.z * sp; o += 3;
    v[o] = n.x * cp - f0.x * sp; v[o + 1] = n.y * cp - f0.y * sp; v[o + 2] = n.z * cp - f0.z * sp;
    this._toeContact(foot, i, f0, n, p, lie);
    void out;
  }

  // Per-toe contact. The skin draws each digit from the MTP joint along TOE_F turned by the fan (about TOE_U), its proximal
  // phalanx flexed by toeP and the distal one by toeD (+ curls down). Planted, each toe joint that is still in contact (the
  // peel releases MTP, then the joint between the phalanges, then the tip; II and IV go before III) is set on the ground
  // under it, within the joint's range; a joint already off the ground is free but never below it. The springs in _toes
  // chase this solution (toeC), and the pose carries the solved angles (toeOut).
  _toeContact(foot, i, f0, n, p, lie) {
    const FT = this.FT, T = this.terrain, sgn = foot.s, mtp = foot.mtp, pad = FT.pad, CF = FT.conform;
    const cp = Math.cos(p), sp = Math.sin(p);
    const tf = _tf.set(f0.x * cp + n.x * sp, f0.y * cp + n.y * sp, f0.z * cp + n.z * sp), tu = _tu.set(n.x * cp - f0.x * sp, n.y * cp - f0.y * sp, n.z * cp - f0.z * sp);
    const tlx = tu.y * tf.z - tu.z * tf.y, tly = tu.z * tf.x - tu.x * tf.z, tlz = tu.x * tf.y - tu.y * tf.x;
    const fan = clamp(foot.spread.x, FT.splay.min ?? 0.02, 0.7), b = foot.planted ? foot.beta || 0 : 0, a2 = Math.max(0, b - FT.peel);
    const C = foot.toeC || (foot.toeC = new Float64Array(6)), O = foot.toeOut || (foot.toeOut = new Float64Array(6));
    // solve A cos x + B sin x = Cc for x (the segment's end at height Cc above its joint), on the anatomical branch: the root
    // whose segment still points forward of its joint (hx, hz: the digit's forward in the ground plane; ex, ez: the segment's
    // direction is ex cos x - fx sin x horizontally); nearest x0 if both do. Null when the height is out of reach
    const solve = (A, B, Cc, x0, ex, ez, fx, fz, hx, hz) => {
      const R = Math.hypot(A, B); if (R < 1e-6) return null; const q = clamp(Cc / R, -1, 1), ph = Math.atan2(B, A), w = Math.acos(q);
      const r1 = x0 + wrap(ph + w - x0), r2 = x0 + wrap(ph - w - x0), fw = (x) => (ex * Math.cos(x) - fx * Math.sin(x)) * hx + (ez * Math.cos(x) - fz * Math.sin(x)) * hz > 0;
      const f1 = fw(r1), f2 = fw(r2); if (f1 !== f2) return f1 ? r1 : r2; return Math.abs(r1 - x0) < Math.abs(r2 - x0) ? r1 : r2;
    };
    let off = 0;
    for (let d = 0; d < 3; d++) {
      const len = FT.toes[d], lp = len * FT.split, ld = len - lp, ang = (d - 1) * fan * -sgn, ca = Math.cos(ang), sa = Math.sin(ang);
      const gx = tf.x * ca + tlx * sa, gy = tf.y * ca + tly * sa, gz = tf.z * ca + tlz * sa, hl = Math.hypot(gx, gz) || 1, hx = gx / hl, hz = gz / hl;
      // contact of the joint between the phalanges (wJ) and of the tip (wT): III keeps its tip down to the end
      const outer = d !== 1, wJ = foot.planted ? (outer ? 1 - sstep(0.02, 0.2, b) : 1 - sstep(0, 0.12, a2)) * (1 - lie) : 0;
      const wT = foot.planted ? (outer ? 1 - sstep(0.12, 0.32, b) : 1) * (1 - lie) : 0;
      // where the springs have the toe: free pose
      let c1 = foot.toeP[d].x, c2 = foot.toeD[d].x;
      // the peel pose, where a toe goes once released: each follows III's proximal pitch, its distal phalanx turned up by what
      // III's tip still holds, the claws of II and IV curled a little (they lift clear: shorter, and fanned out of the line)
      if (foot.planted) { c1 = outer ? 0.03 * foot.load : 0; c2 = -(b - a2) + (outer ? 0.08 - 0.3 * sstep(0.1, 0.4, b) : 0); }
      // proximal: the joint between the phalanges onto the ground under it
      const jy = (x) => mtp.y + lp * (gy * Math.cos(x) - tu.y * Math.sin(x));
      const jxz = (x) => [mtp.x + lp * (gx * Math.cos(x) - tu.x * Math.sin(x)), mtp.z + lp * (gz * Math.cos(x) - tu.z * Math.sin(x))];
      let [jx, jz] = jxz(c1), gJ = T.height(jx, jz) + pad;
      const S1 = (Cc, x0) => solve(lp * gy, -lp * tu.y, Cc, x0, gx, gz, tu.x, tu.z, hx, hz);
      if (wJ > 0) { const x = S1(gJ - mtp.y, c1); if (x !== null) { const r = S1(T.height(...jxz(x)) + pad - mtp.y, x); c1 = lerp(c1, r ?? x, wJ); } }
      c1 = clamp(c1, CF.prox[0], CF.prox[1]);
      [jx, jz] = jxz(c1); gJ = T.height(jx, jz) + pad;
      if (jy(c1) < gJ) { const x = S1(gJ - mtp.y, c1); if (x !== null) c1 = Math.min(c1, x); }      // never into the ground
      const Jy = jy(c1), c1c = Math.cos(c1), c1s = Math.sin(c1);
      const g1x = gx * c1c - tu.x * c1s, g1y = gy * c1c - tu.y * c1s, g1z = gz * c1c - tu.z * c1s, u1x = tu.x * c1c + gx * c1s, u1y = tu.y * c1c + gy * c1s, u1z = tu.z * c1c + gz * c1s;
      // distal: the tip onto the ground under it
      const txz = (x) => [jx + ld * (g1x * Math.cos(x) - u1x * Math.sin(x)), jz + ld * (g1z * Math.cos(x) - u1z * Math.sin(x))];
      let gT = T.height(...txz(c2)) + pad;
      const S2 = (Cc, x0) => solve(ld * g1y, -ld * u1y, Cc, x0, g1x, g1z, u1x, u1z, hx, hz);
      if (wT > 0) { const x = S2(gT - Jy, c2); if (x !== null) { const r = S2(T.height(...txz(x)) + pad - Jy, x); c2 = lerp(c2, r ?? x, wT); } }
      c2 = clamp(c2, CF.dist[0], CF.dist[1]);
      gT = T.height(...txz(c2)) + pad;
      const ty = (x) => Jy + ld * (g1y * Math.cos(x) - u1y * Math.sin(x));
      if (ty(c2) < gT) { const x = S2(gT - Jy, c2); if (x !== null) c2 = Math.min(c2, x); }
      off = Math.max(off, ty(c2) - gT);
      O[d] = c1; O[3 + d] = c2; C[d] = c1; C[3 + d] = c2;
      if (foot.planted) { foot.toeP[d].x = c1; foot.toeD[d].x = c2; }
    }
    foot.toesOff = off;
  }

  _writePose() {
    const v = this.pose.v, s = this.pose.s, c = this.chest, h = this.head;
    for (let i = 0; i < SPINE_N; i++) {
      const j = this.spine[i];
      v[i * 3] = j.p.x; v[i * 3 + 1] = j.p.y; v[i * 3 + 2] = j.p.z;
      const o = (PV.SU + i) * 3; v[o] = j.u.x; v[o + 1] = j.u.y; v[o + 2] = j.u.z;
    }
    const hp = h.pos;
    let o = PV.HEAD_P * 3; v[o] = hp.x; v[o + 1] = hp.y; v[o + 2] = hp.z;
    o = PV.HEAD_F * 3; v[o] = h.f.x; v[o + 1] = h.f.y; v[o + 2] = h.f.z;
    o = PV.HEAD_U * 3; v[o] = h.u.x; v[o + 1] = h.u.y; v[o + 2] = h.u.z;
    for (let i = 0; i < 2; i++) {
      const sgn = i === 0 ? 1 : -1;
      t4.copy(this.hc).addScaledVector(this.pl, sgn * DIM.hipHalf);
      this._leg(i, t5.copy(t4));
      // arms hang from the chest
      const sh = t4.copy(c.p).addScaledVector(c.l, sgn * 0.6).addScaledVector(c.u, -0.48).addScaledVector(c.f, 0.18);      // high on the chest, just behind the foot of the neck, at its surface
      o = (PV.ARM + i * 3) * 3; v[o] = sh.x; v[o + 1] = sh.y; v[o + 2] = sh.z;
      t3.copy(c.f).multiplyScalar(-0.2).addScaledVector(c.u, -0.3).addScaledVector(c.l, sgn * 0.12).normalize();      // the upper arm hangs down and back, a little out from the chest wall
      sh.addScaledVector(t3, 0.5); v[o + 3] = sh.x; v[o + 4] = sh.y; v[o + 5] = sh.z;
      t3.copy(c.f).multiplyScalar(0.3).addScaledVector(c.u, -0.16 - 0.03 * this.breath + this.armSwing.x).normalize();
      sh.addScaledVector(t3, 0.45); v[o + 6] = sh.x; v[o + 7] = sh.y; v[o + 8] = sh.z;
      for (let j = 0; j < 3; j++) { const q = o + j * 3, g = this.terrain.height(v[q], v[q + 2]) + 0.12; if (v[q + 1] < g) v[q + 1] = g; }      // lying on its chest, the little arms rest on the ground
    }
    s[PS.JAW] = this.jaw;
    s[PS.BREATH] = this.breath - 0.8 * this.roarEnv;
    s[PS.BLINK] = this.blink > 0 ? 1 : 0;
    s[PS.LOAD] = this.feet[0].load; s[PS.LOAD + 1] = this.feet[1].load;
    for (let k = 0; k < 2; k++) { const f = this.feet[k], O = f.toeOut; for (let d = 0; d < 3; d++) { s[PS.TOE + k * 6 + d] = O ? O[d] : f.toeP[d].x; s[PS.TOE + k * 6 + 3 + d] = O ? O[3 + d] : f.toeD[d].x; } s[PS.SPREAD + k] = clamp(f.spread.x, 0.02, 0.7); }
    s[PS.PLANTED] = this.feet[0].planted ? 1 : 0; s[PS.PLANTED + 1] = this.feet[1].planted ? 1 : 0;
    s[PS.LID] = this.lid; s[PS.LIE] = clamp(this.lieS.x, 0, 1); s[PS.SQUINT] = clamp(this.squint, 0, 1);
  }

  /** How deep the skull would be in solid things were it `inflate` fatter (0: clear by at least that much): what it feels of
   *  the room round its head. */
  headRoom(inflate = 0) {
    const h = this.head; if (!this.terrain.near) return 0;
    this._cBegin();
    for (let k = 0; k <= 5; k++) { const u = k / 5 * DIM.headLen; this._cSample(h.pos.x + h.f.x * u, h.pos.y + h.f.y * u - 0.12, h.pos.z + h.f.z * u, lerp(0.5, 0.2, k / 5) + inflate, -h.f.x, -h.f.z); }
    return this._cEnd();
  }

  /** What the animal knows of its own body, for planning where to put it (nav.senseSpots): for each depth of crouch (`low`),
   *  where the root of the neck sits ahead of the hips and above the ground, and how far up the neck leaves the shoulders.
   *  Found once per species by standing a throwaway body on flat ground in each posture: no hand-entered numbers. */
  selfModel() {
    const sp = this.species, cache = Creature._self || (Creature._self = new Map());
    if (cache.has(sp)) return cache.get(sp);
    const flat = { height: () => 0, base: () => 0, normal: (x, z, o) => o.set(0, 1, 0), size: 400, arena: 1e9 };
    const out = [], b = new Creature(flat, { species: sp, seed: 1 });
    for (const low of [0, 0.5, 1, 1.25, 1.5]) {
      for (let i = 0; i < 150; i++) { b.step(1 / 120, { goal: null, pace: 2, attention: null, low }); b.events.length = 0; }
      const c = b.chest, ay = c.f.y * 0.72 + c.u.y * 0.69, al = Math.hypot(c.f.x * 0.72 + c.u.x * 0.69, ay, c.f.z * 0.72 + c.u.z * 0.69);
      out.push({ low, f: (b.nb.x - b.x) * Math.sin(b.psi) + (b.nb.z - b.z) * Math.cos(b.psi), y: b.nb.y, elev: Math.asin(ay / al), hip: b.py.x });
    }
    const model = { postures: out, neckLen: DIM.neckLen, headLen: DIM.headLen, tailLen: DIM.tailLen, reach: [0.78, 0.87], cone: 1.0, eye: { x: 0.55, y: 0.4, z: 0.42 }, yawMax: YAW_GAZE };
    cache.set(sp, model); return model;
  }

  /** One-word description of what the legs are doing, for the debug readout. */
  get mode() {
    const spd = Math.abs(this.v), swinging = !this.feet[0].planted || !this.feet[1].planted;
    if (this.lie.phase !== 'stand') return { down: 'lie down', lying: 'lying', up: 'get up' }[this.lie.phase];
    if (this.reach && this.reach.phase === 'investigate' && !swinging) return this.reach.probe ? 'investigate' : 'hold';
    if (spd < 0.25) return swinging ? (Math.abs(this.om) > 0.08 ? 'pivot' : 'step') : 'stand';
    if (this.acc < -1.2) return 'brake';
    if (this.v < 0) return 'back up';
    if (this.stalk > 0.5) return 'stalk';
    return spd < 3.2 ? 'walk' : spd < 6 ? 'jog' : spd < 9.6 ? 'run' : 'sprint';
  }
}

export const RexSim = Creature;
