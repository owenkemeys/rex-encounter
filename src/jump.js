// The on-foot jump, as plain numbers (no DOM, no renderer, so test/jump.mjs can import it).
// A person's jump, not a game hop: about half a metre standing, seventy centimetres off a run, gravity 9.8, the run carried through
// the air with almost no steering, a beat of cooldown after landing so it cannot become bunny-hopping.
export const G = 9.8;
export const APEX_STAND = 0.5, APEX_RUN = 0.7;      // metres, off the ground; standing or walking, and at a full run
export const WALK = 2.6, RUN = 6.2;                 // m/s on foot (main.js)
export const COOLDOWN = 0.35;                       // s after landing before the next take-off
export const CLEAR_MAX = 0.45;                      // m: feet only count as this high for collision, so nothing over about half a metre is cleared
export const AIR_CONTROL = 0.3;                     // per second: how fast steering pulls the carried velocity towards the stick
export const GROUND_MIN = 0.6;                      // no take-off wading or in mud (terrain.speedFactor below this)
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const newJump = () => ({ air: false, h: 0, vy: 0, vx: 0, vz: 0, t: 0, cool: 0 });
export const apexFor = (speed) => APEX_STAND + (APEX_RUN - APEX_STAND) * clamp01((speed - WALK) / (RUN - WALK));
export const airTime = (apex) => 2 * Math.sqrt(2 * apex / G);
/** Take off with the ground velocity (vx, vz) carried. Returns false when not allowed. */
export function takeoff(J, vx, vz, ok = true) {
  if (!ok || J.air || J.cool > 0) return false;
  J.vy = Math.sqrt(2 * G * apexFor(Math.hypot(vx, vz))); J.vx = vx; J.vz = vz; J.h = 0; J.t = 0; J.air = true; return true;
}
/** Advance dt. Returns { speed } (downward, m/s) on the step that lands, else null. */
export function stepJump(J, dt) {
  if (J.cool > 0) J.cool = Math.max(0, J.cool - dt);
  if (!J.air) return null;
  J.h += J.vy * dt - 0.5 * G * dt * dt; J.vy -= G * dt; J.t += dt;
  if (J.h <= 0 && J.vy < 0) { const speed = -J.vy; J.h = 0; J.vy = 0; J.air = false; J.cool = COOLDOWN; return { speed }; }
  return null;
}
/** Steer the carried velocity a very little towards the wanted one. */
export function steer(J, wx, wz, dt) { const k = Math.min(1, dt * AIR_CONTROL); J.vx += (wx - J.vx) * k; J.vz += (wz - J.vz) * k; }
export const reset = (J) => { J.air = false; J.h = 0; J.vy = 0; J.cool = 0; };
