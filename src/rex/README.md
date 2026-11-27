# The rex

A simulated, thinking Tyrannosaurus for browser games. It has a body that walks, balances, turns its head and strikes, and a mind that senses, guesses where you are, gets moods and picks what to do. It uses no animation clips: every pose comes from the simulation. This folder is the whole animal. The rest of the repo is the game Rex Encounter, which is one host for it.

**The one rule.** Nothing in `src/rex` imports from the game. Imports stay inside this folder, or they are `three` / `three/webgpu` / `three/tsl`. `node src/rex/test/oneway.mjs` enforces this. The game imports the rex. The rex never imports the game.

## What is here

| Path | What |
|---|---|
| `body/rex.js` | The body (`Creature`, also exported as `RexSim`): gait, balance, head and neck, jaws, tail, collision volumes, crash response, lying down. Fixed 120 Hz step, seeded, deterministic. No renderer, no DOM, no clock. It carries out an **intent** and reports what happened as **events**. |
| `body/nav.js` | Route planning round solids and steep ground (the body owns one, `sim.nav`). |
| `brain/mind.js` | The mind (`Mind`): senses (sight, hearing, smell on the wind), a belief cloud of where the intruder might be, moods, temperament and memory. It scores behaviours, picks one and writes the intent each step. |
| `brain/attend.js`, `appraise.js`, `afford.js`, `peril.js`, `thoughts.js` | Parts of the mind: what it attends to, what it makes of you (prey, rival, threat, curiosity), what it can reach, when it lets fly, and its voice (2–5 word thoughts traceable to real state). |
| `species/tyrannosaurus.js` | Everything that makes this animal this animal, as data: dimensions, gait, senses, temperament, crash response, mind settings. Put tunables here, not in the engine. |
| `skin/rexgeo.js` | The skin as geometry and bone weights, built from the pose layout. Needs only `three` maths. |
| `skin/body.js` | `RexBody`, which draws it: three.js **WebGPU** with TSL node materials. It falls back to WebGL2 inside three's WebGPURenderer, but it cannot run on a classic `WebGLRenderer`. `variants/saltline/src/view/rexbody_gl.js` is a classic-WebGL drawer of the same `rexgeo`. |
| `skin/jawvoice.js` | Opens the jaw to a measured voice level (view only). |
| `terrain-contract.js` | What your world must answer (`T`), `checkTerrain(T)` and `flatTerrain()`. |
| `tune.js` | The tuning registry: dials the files register (`tune(...)`). With no panel and no `tuneStorage`, every value stays at its default. |
| `math.js` | Small helpers: `clamp`, `lerp`, `makeRng`, `bearing`, … |
| `test/` | `smoke.mjs` (the rex alone on flat ground, ~3 s) and `oneway.mjs` (the import rule). `npm run test:rex` runs both. |

## Conventions

Units are metres and seconds, with y up. Heading `sim.psi` is in radians: forward is `(sin psi, cos psi)` in (x, z). The fixed step is `DT = 1/120`. Accumulate real time (cap it at ~0.1 s), step once per slice, and for drawing blend the last two poses by `acc / DT`. All randomness comes from the seeds you pass in, so the same seed and the same inputs give the same animal.

## Putting it in your game

```js
import { Creature } from './rex/body/rex.js';
import { Mind } from './rex/brain/mind.js';
import { flatTerrain, checkTerrain } from './rex/terrain-contract.js';

const T = flatTerrain();                         // or your world, adapted to the contract (terrain-contract.js)
console.assert(checkTerrain(T).length === 0);
const sim = new Creature(T, { x: 0, z: 0, yaw: 0, seed: 3 });
const mind = new Mind(sim, 3);

// every 1/120 s:
const intent = mind.step(DT, { agents, noises, light: 0.8, flash: false, wind: { x: 0, z: -3 } });
sim.step(DT, intent);
for (const e of sim.events) { /* footfall, roar, snap, contact, ... */ } sim.events.length = 0;
for (const e of mind.events) { /* bite, kill, ... */ } mind.events.length = 0;
// draw: sim.pose.v (Float32Array, PV layout) and sim.pose.s (PS layout), exported from body/rex.js
```

**What the mind is given each step (`world`):**
- `agents`: people it can sense, `{ id, x, y (eye height), z, vx, vz, speed, crouch, fx, fz (facing), lamp (boolean, or torch), lx, ly, lz (look), state, observer? / ghost? }`. `state` other than `'free'` means it has hold of them. Pass `[]` when nobody is there.
- `noises`: `{ x, y, z, loud (0..1), kind, you? }`. Walking is about 0.045, sprinting 0.16, crouching 0.012 and a gunshot 1. Kinds the mind knows include `step thud shout whistle bang thunder prey hit`. A noise is the only way it hears anything.
- `light` 0..1, `flash` (lightning) and `wind {x, z}` in m/s.
- Optional: `things` (objects sensed by physical properties rather than name: `{ id, kind, x, y, z, vx?, bright?, hot?, edible?, scent?, missile?, amount?, by? }`), `prey` (animals it may hunt), `hits` (what struck it; set `missile: true` for projectiles) and `touch` (a hand on it).

**What comes back:**
- The intent, from `mind.step`, which the body carries out (below).
- Events, from `sim.events`: `footfall {foot, x, y, z, intensity}`, `roar`, `huff`, `growl`, `rumble`, `snap`, `clack`, `strike`, `butt`, `swipe`, `worry`, `toss`, `startle`, `wince`, `settle`, `liftoff`, `liedown`, `getup`, `jerk` and `contact {part, surface, force, x, y, z, nx, nz}`. From `mind.events`: `bite`, `tear`, `kill`, `handfed`, …
- Thoughts: `mind.voice.think` (the current line, or `''`) and `mind.voice.stream`.
- For debugging: `mind.beh.name`, `mind.know.seen`, `mind.hunger`, `mind.mood`.

**The game's glue** is `src/sim/arena.js`, which is **not** part of the rex. It adds thrown objects, a prey herd and people's bodies (being knocked down, held in the jaws), and routes events between them. Saltline uses it as-is. A host that wants none of that calls `Mind` and `Creature` directly, as above and as `test/smoke.mjs` does. `notes/HOSTING.md` is the full walkthrough of the Saltline port, and `variants/saltline/src/` is the reference host.

**Drawing it** with three.js: `new RexBody({ tier: 'high' }, { fog, flash })`, where `fog` and `flash` are your TSL uniforms (the rim of fog light on the hide, and lightning). Add `body.group` to your scene. Each frame call `body.update(sim.pose)` and keep `body.fix = sim.fix` (where it is looking). Without WebGPU and TSL, use `skin/rexgeo.js` (`buildRexGeometry`, `paintRex`, `boneMatrices`) with your own material, as Saltline does.

## The body on its own: the intent

The body knows nothing about minds. Anything that writes an intent can drive it: a script, a player, another brain. Every field is optional:

| Field | Meaning |
|---|---|
| `goal` | `{ kind: 'reach', id, x, z }`: bring the snout to the point. `'approach'` (+ `stop`, metres short), `'move'`, `'face'`, `'drive'` (`throttle`, `steer`). `null` stands. |
| `pace` | Wanted speed in m/s (walk ~2.2, run 8+). `burst`: an all-out rush. |
| `attention` | `{x, y, z}` it turns its head and eyes to. Also `look`, `sense`, `nose`, `faceAttention`. |
| posture | `low` (crouch 0..1.5), `stalk`, `alert`, `display`, `agitation`, `relax`, `lie`, `freeze`, `breathHold`, `lid`, `glare`, `mouth` (jaw hold). |
| other | `keepOut` (people it must not step on), `plant`, `quickTurn`, `holdFoot`, `noIdle`, `probe`, `curious`. |

Gestures are asked for directly: `sim.gesture(kind, point?, opts?)` with `wince rumble huff growl shake snap tilt stomp sniffAir startle tear gulp orient butt seize strike worry toss swipe`. Also `sim.roar()`. `node test/sim.mjs` drives the body with plain intents.

## The brain on another animal

`Mind` is built on a `Creature`: `new Mind(sim, seed)`. It is not a separate brain with a socket. It reads the body directly, and the body is what it controls. To try this brain in another animal, the animal must offer what the mind uses.

- **State it reads:** `x z psi v groundY head spine feet act att lie lying lowness exertion fatigue injury blink lid squint nav path terrain species headBlocked headJam headPress headTouch headTouchK gapNear crashS senseKey senseStage`
- **Methods it calls:** `gesture(kind, pt, opts)`, `roar()`, `selfModel()` (where its neck and eyes sit in each posture, found by standing a throwaway body on flat ground), `headRoom()`, `jerkFoot(i, k)`
- **Fields it writes:** `blink`, `act.t` and `path` (5 places in `brain/mind.js`)

`grep -o "sim\.[a-zA-Z_]*" src/rex/brain/*.js | sort -u` gives the live list. From the species profile it reads `temper`, the senses, `dims` (`headLen`, `reachStop`, …) and the `mind` settings.

The behaviours assume a head with jaws and an animal that can butt, swipe its tail, seize and toss. A different kind of animal needs those behaviours trimmed or remapped in `brain/mind.js`. The perception, belief, mood and appraisal machinery carries over as it is.

**Another species.** A second biped built like this one (a smaller theropod, a bigger one) is a new profile in `species/`. Pass it as `new Creature(T, { species })`. **A quadruped is not a profile change: it needs a new skeleton.** The joint layout is fixed for a two-legged theropod: 26 spine joints (tail, back, neck, head), two legs with toes, small arms, the 73-slot `PV` pose and `PS` scalars. `body/rex.js` and `skin/rexgeo.js` are written against that layout. They also take the T. rex's dimensions at load (`DIM`, and `TYRANNOSAURUS` in rexgeo). So a dog, a horse or a lizard means new legs, gait and posture code in the body, and a new skin builder. The mind could stay.

## Tuning dials

The species, mind and skin register dials: `tune(group, label, obj, key, min, max, step)` from `tune.js`. A host that has no tuning panel can ignore them, and the values stay at their defaults. Rex Encounter's panel is `src/view/tune.js`. The game saves changed values in the browser through `src/tunestore.js`, which `main.js` imports first so a saved value is in place before anything reads it. Your own host can plug in storage with `tuneStorage({ load, save })`.

## Checks

- `npm run test:rex`: the import rule plus the flat-world smoke (seconds). Run it first.
- The body: `node test/review.mjs`, `test/corner.mjs`, `test/striketime.mjs`, `test/strikepass.mjs`, `test/crashread.mjs`.
- The mind: `node test/mind.mjs all 3`, `test/commit.mjs`, `test/platform.mjs` (a made-up foreign world), `test/saltline.mjs` (Saltline's world, ~5 min).
- The other `test/` scripts run the rex in the game's own arena (`src/terrain.js`).
