// T11: does a crash make a thought? The body is driven into a wall head-on and into a container corner with the mind attached (its intent's goal
// replaced by the scenario's), calm and wound up (irritation 0.8, arousal 0.7). Prints what the voice shows (mind.voice.think, sampled at 20 Hz, as
// runs with how long each stayed up) for 4 s from the knock, and the stream entries. BEFORE=1 turns the new crash handling (mind._onCrash) off.
//   node test/crashthought.mjs [seed]
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
const seed = +(process.argv[2] || 3), dt = 1 / 120;
const SC = { headon: { rex: [-9, 70, -Math.PI / 2], goal: { kind: 'drive', throttle: 1, steer: 0 }, pace: 9 }, corner: { rex: [-21.5, 48, 0], goal: { kind: 'approach', id: 1, x: -46, z: 77, stop: 0.5, quick: true }, pace: 9.5 } };
let bad = 0;
for (const [name, S] of Object.entries(SC)) for (const wound of [false, true]) {
  const T = makeTerrain(7), sim = new Creature(T, { x: S.rex[0], z: S.rex[1], yaw: S.rex[2], seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  A.herd.list.length = 0; A.herd.disabled = true; mind.hunger = 0.3;
  if (process.env.BEFORE) mind._onCrash = () => { };
  const orig = mind.step.bind(mind); mind.step = (d, w) => { const I = orig(d, w); I.goal = S.goal; I.pace = S.pace; return I; };
  let knock = null, runs = [], cur = null, n = 0, hard = 0, reel = 0, minDur = 99, pain0 = 0, wary = false;
  for (let i = 0; i < 14 * 120; i++) {
    const t = i * dt; if (wound) { mind.mood.irritation = Math.max(mind.mood.irritation, 0.8); mind.mood.arousal = Math.max(mind.mood.arousal, 0.7); }
    A.step(dt, { agents: [], noises: [], light: 0.85, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0;
    const C = sim.crashS;
    if (knock === null && mind.mem.crash && mind.mem.crash.t > 0) { knock = mind.mem.crash.t; hard = C.hard; reel = C.reel; pain0 = mind.painSpike; wary = !!mind.wary; }
    if (knock !== null && t - knock <= 4) { const th = mind.voice.think || ''; if (!cur || cur.text !== th) { cur = { text: th, t0: t - knock, t1: t - knock }; runs.push(cur); } else cur.t1 = t - knock; }
  }
  const stream = mind.thinker.stream.filter((e) => knock !== null && e.t >= knock - 0.2 && e.t <= knock + 4).map((e) => `+${(e.t - knock).toFixed(2)} "${e.text}"`);
  const mine = stream.length > 0, up = runs.filter((r) => r.text && r.t0 < 0.6).map((r) => (r.t1 - r.t0).toFixed(1));
  console.log(`${name} ${wound ? 'WOUND UP' : 'calm    '}: knock ${knock === null ? 'NONE' : knock.toFixed(2) + ' s'} reel ${(reel || 0).toFixed(2)} hard ${(hard || 0).toFixed(2)} pain ${pain0.toFixed(2)} wary ${wary}; stream ${stream.join(' ') || '(none)'}; shown ${runs.filter((r) => r.text).map((r) => `+${r.t0.toFixed(2)}..${r.t1.toFixed(2)} "${r.text.slice(0, 30)}"`).join(' | ') || '(nothing)'}`);
  if (!wound && knock !== null && !process.env.BEFORE) { const first = mind.thinker.stream.find((e) => e.t >= knock - 0.01); if (!first || first.t - knock > 0.5 || !/bump|ow|OW|hard|hurt/.test(first.text)) { bad++; console.log('  FAIL: no crash thought within 0.5 s'); } const r0 = runs.find((r) => r.text && r.t0 < 0.6); if (!r0 || r0.t1 - r0.t0 < 1.4) { bad++; console.log('  FAIL: not up for 1.5 s'); } }
}
console.log(bad ? 'crash thought checks FAILED' : 'crash thought checks done');
