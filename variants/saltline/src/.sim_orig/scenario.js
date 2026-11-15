// Optional starting situations. The default is the plain sandbox; a scenario only changes the animal's starting state, never
// adds instructions or markers: the situation has to explain itself through what the animal does and says.
//
//   thorn   something is lodged in one foot. It starts lying down nursing it, walks with a real limp (short, careful stance on
//           that foot, weight held off it, a flinch each time it takes weight), lies down to rest it often, and is short-tempered
//           with the pain. Earn enough trust and it will let you work the thorn out with your hand (arena.js); afterwards the
//           gait recovers over a few minutes and it treats you differently for the rest of the session.
// ON HOLD with the bond work (mind.js BOND_ON): no scenario is applied and the hash is ignored until that resumes.
export const SCENARIOS_ON = false;
export const SCENARIOS = {
  sandbox: { title: 'Sandbox' },
  thorn: { title: 'The thorn' },
};

/** Read a scenario name from a URL hash such as '#thorn' or '#seed4-thorn'. */
export const scenarioFromHash = (hash = '') => (SCENARIOS_ON && /(^|[#\-_&])thorn($|[\-_&])/.test(hash) ? 'thorn' : 'sandbox');

/** Put the animal (arena.sim, arena.mind) into the scenario's starting state. Deterministic. */
export function applyScenario(name, arena) {
  const { sim, mind } = arena;
  if (!SCENARIOS_ON || name !== 'thorn') return;
  sim.injury = { foot: 1, sev: 0.85, base: 0.85, thorn: true, pull: 0, healS: 170 };
  mind.hunger = Math.max(mind.hunger, 0.68);
  mind.temper.irritable = Math.min(1, mind.temper.irritable + 0.15); mind.temper.patience = Math.max(0.2, mind.temper.patience - 0.1);
  mind.baseTemper = { ...mind.temper };
  // found lying down, nursing the foot
  sim.lie.phase = 'lying'; sim.lieS.x = 1; sim.lieS.v = 0;
  for (let i = 0; i < 360; i++) sim.step(1 / 120, { goal: null, lie: true, relax: 1, attention: null });
  sim.events.length = 0;
  mind._start('rest', mind._ctx(), 'scenario');
}
