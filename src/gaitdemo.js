// The gait demos of the debug tools (src/main.js, "Gait demos") and test/gaitdemo.mjs: the situations in which the animal used to splay its
// legs wide and drop its hips for a split second (owner, 2026-11-17), as body-only scripts (no mind, no arena: `sim.step(dt, intent)`), run
// with the gait as it is (`sim.gaitLegacy = false`) or as it was (true; see the Creature constructor). The scripts are the ones in
// test/splay.mjs (arcs, drive + steer) and test/lunge.mjs (T15 cancelled rush, T14 run then stop and turn). DOM-free: node imports it too.
import { DIM, PV } from './sim/rex.js';

const STAND = 0.88, LIMS = { drop: 0.25, stance: 1.5 * STAND, speed: 4 };
// hip height above the feet's ground in a straight run, by speed (test/splay.mjs prints the table; the current gait's)
const BASE = [[2.0, 3.01], [3.5, 2.97], [5.0, 2.92], [6.5, 2.81], [8.0, 2.78], [8.8, 2.78]];
export const baseHip = (v) => { if (v <= BASE[0][0]) return BASE[0][1]; for (let i = 1; i < BASE.length; i++) if (v <= BASE[i][0]) { const u = (v - BASE[i - 1][0]) / (BASE[i][0] - BASE[i - 1][0]); return BASE[i - 1][1] + u * (BASE[i][1] - BASE[i - 1][1]); } return BASE[BASE.length - 1][1]; };

/** What test/splay.mjs measures, per tick: hip height above ground (0.15 s mean), its drop under the straight-run height for the speed, the
 *  stance width (feet apart across the body), and EPISODES (faster than 4 m/s: drop > 0.25 m or stance > 1.5 x standing; one episode until 0.3 s clear). */
export class GaitMeter {
  constructor() { this.buf = []; this.reset(); }
  reset() { this.buf.length = 0; this.hip = 0; this.drop = 0; this.stance = 0; this.speed = 0; this.bad = false; this.episodes = 0; this.worstDrop = -9; this.worstStance = 0; this.anyDrop = -9; this.anyStance = 0; this.lastBad = -9; this.t = 0; }
  tick(sim, t, dt = 1 / 120) {
    const v = sim.pose.v, psi = sim.psi, rx = Math.cos(psi), rz = -Math.sin(psi), spd = Math.abs(sim.v), a = [];
    for (let k = 0; k < 2; k++) { const o = (PV.LEG + k * 6) * 3; a.push([v[o + 6], v[o + 7], v[o + 8]]); }
    this.buf.push(sim.py.x - (sim._dbgH ? sim._dbgH.gY : sim.groundY)); if (this.buf.length > 18) this.buf.shift();
    this.hip = this.buf.reduce((x, y) => x + y, 0) / this.buf.length;
    this.stance = Math.abs((a[0][0] - a[1][0]) * rx + (a[0][2] - a[1][2]) * rz); this.speed = spd; this.drop = baseHip(spd) - this.hip; this.t = t;
    this.bad = spd > LIMS.speed && (this.drop > LIMS.drop || this.stance > LIMS.stance);
    this.anyDrop = Math.max(this.anyDrop, this.drop); this.anyStance = Math.max(this.anyStance, this.stance);
    if (spd > LIMS.speed) { this.worstDrop = Math.max(this.worstDrop, this.drop); this.worstStance = Math.max(this.worstStance, this.stance); }
    if (this.bad) { if (t - this.lastBad > 0.3) this.episodes++; this.lastBad = t; }
  }
}

// where the demos happen: flat open ground (the real map varies under 2 m over the 60 m stretch, under 0.5 m locally; nothing solid within 30 m of any of the paths:
// test/gaitdemo.mjs checks), facing +z; every turn goes toward +x, so the camera stands on the other side
const fwd = (sim, d) => ({ x: sim.x + Math.sin(sim.psi) * d, z: sim.z + Math.cos(sim.psi) * d });
// run at a far point straight ahead; at `tt` s the goal jumps to a point `leg` m off at `beta` from the heading (the turn while still at speed: the
// turn commanded at 3.5 s, as the speed peaks, is the one the old gait splayed in; 4.5 s, with the speed already easing, hardly)
const turn = (beta, tt, leg, pace) => (t, sim, st) => { if (t < tt) return { goal: { kind: 'approach', id: 1, ...fwd(sim, 60), stop: 0.5, quick: true }, pace, burst: t < 3, agitation: 0.8, attention: null };
  if (!st.g) st.g = { x: sim.x + Math.sin(sim.psi + beta) * leg, z: sim.z + Math.cos(sim.psi + beta) * leg };
  return { goal: { kind: 'approach', id: 2, ...st.g, stop: 0.5, quick: true }, pace, agitation: 0.8, attention: null }; };
const rushSeg = (beta, d) => { const seg = [['lock', 0.4], ['stand', 0.3], ['rush', d], ['stand', 0.1], ['rush', d], ['stand', 0.3], ['back', 0.5], ['stand', 3]]; let t0 = 0; return seg.map(([k, L]) => { const o = { k, a: t0, b: t0 + L }; t0 += L; return o; }); };
const RUSH = rushSeg(1.05, 0.3);      // T15: 60 degrees to the side, cancelled after 0.3 s, twice, then a backward step

/** key: { label, start [x, z, yaw], dur (s), at [x, z]: where the first turn happens (the camera is placed from it), intent(t, sim, st) -> the body's intent; t is seconds since the start.
 *  `st` is the run's own scratch object. Corner and hairpin splay in the old gait only when the turn is asked at the speed's peak (about 3.5 s), and the 60-75 degree arcs of test/splay.mjs more than the 90 and 180. */
export const GAIT_DEMOS = {
  corner: { label: 'Wide corner at a run', start: [30, -6, 0], dur: 10, at: [30, 17], intent: turn(Math.PI / 2, 3.5, 25, 9.5) },
  hairpin: { label: 'Hairpin', start: [30, -6, 0], dur: 10, at: [30, 17], intent: turn(3.0, 3.5, 25, 9.5) },
  steer: { label: 'Hard steer', start: [30, -6, 0], dur: 7.5, at: [30, 19], intent: (t) => ({ goal: { kind: 'drive', id: 1, throttle: 1, steer: t > 3.2 && t < 6.2 ? 1 : 0 }, pace: 9.5, burst: t < 3, agitation: 0.8, attention: null }) },
  rush: { label: 'Cancelled rush', start: [30, -6, 0], dur: 9.2, at: [30, -6], intent: (t0, sim, st) => { const t = t0 - 2, tx = 30 + Math.sin(1.05) * 4, tz = -6 + Math.cos(1.05) * 4, L = { x: tx, y: 1.7, z: tz, lock: true }; if (t < 0) return { goal: null, pace: 1, freeze: true };
    const e = RUSH.find((q) => t >= q.a && t < q.b) || { k: 'stand' }, g = { x: tx, z: tz };
    if (e.k === 'lock') return { goal: { kind: 'face', ...g }, pace: 1, stalk: true, quickTurn: true, alert: 1, look: L };
    if (e.k === 'rush') return { goal: { kind: 'approach', id: 7 + Math.round(t * 10), ...g, stop: 2, quick: true }, pace: 9.6, burst: true, agitation: 0.4, quickTurn: true, look: L };
    if (e.k === 'back') return { goal: { kind: 'drive', throttle: -0.35, steer: 0 }, pace: 1, look: L };
    return { goal: null, pace: 1, look: L }; } },
  stop: { label: 'Run, stop, turn', start: [30, -6, 0], dur: 10, at: [30, 14], intent: (t, sim, st) => { const look = { x: 30, y: 1.7, z: 14, lock: true };
    if (t < 3) return { goal: { kind: 'move', id: 1, ...fwd(sim, 80), last: false }, pace: 8, look, noIdle: true };
    if (!st.g) st.g = { x: sim.x + Math.sin(sim.psi + 2.4) * 6, z: sim.z + Math.cos(sim.psi + 2.4) * 6 };
    return { goal: { kind: 'move', id: 2, x: st.g.x, z: st.g.z, last: true }, pace: 2.0, look, noIdle: true }; } },
};
// the camera: low three-quarter front, 12 m from the turn, on the outside of it; it follows half the animal's way from the turn, slowly
export const GAIT_CAM = { off: [-7, 1.4, 9.5], follow: 0.5, tau: 0.8, aimTau: 0.25 };
