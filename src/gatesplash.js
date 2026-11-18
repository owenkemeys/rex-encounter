// The gatehouse start's splash (main.js GATE, test/gatehouse.mjs). Owner: "the rex should spawn sniffing around the hut. the gag is that
// you're watching it sniff around you from outside but dont realise it at first." The guard is in the hut all along, and does not sit
// still: a shifted foot, the chair, a mug set down. Those are ordinary sounds from the hut, and what carries outside is what comes out of
// its open east window, so that is where they are put (kind 'step', not marked as yours, so the animal is given them before it can sense
// you). It does what it does with any sound it cannot place: comes in from the paddock to see (it starts 38 m off, paddock.js), works
// round the walls, and the window the sound came from is the first place its snout gets to (test/gatehouse.mjs). No tether, no script: while it is near the hut the guard's noises stop counting (it is already there); when it
// strays they carry out to it again. Sim-side only (no renderer), so the Node test runs the same rule.
import { makeRng } from './math.js';

export const FIDGET = { far: 6, gap: 4, loud: 0.55 };      // heard when it is more than `far` m from the guard; about every `gap` s (±30%)

export function gateFidget(G, terrain, seed) {
  const R = makeRng(seed + 9), y = terrain.height(G.guard.x, G.guard.z) + 0.9;
  let next = 1.5;
  return {
    /** Sim time t (s) and the animal; a noise to add this step, or null. */
    tick(t, sim) {
      if (t < next) return null;
      next = t + FIDGET.gap * (0.7 + R() * 0.6);
      if (Math.hypot(sim.x - G.guard.x, sim.z - G.guard.z) <= FIDGET.far) return null;
      return { x: G.window.x + 0.4, y, z: G.window.z + (R() - 0.5) * 0.8, loud: FIDGET.loud, kind: 'step' };
    },
  };
}
