# Putting the animal into another game

**Start with `src/rex/README.md`** (2026-11-26): the animal now lives in `src/rex/` (body, brain, species, skin), imports nothing from the game, and the terrain contract this note asks for below is `src/rex/terrain-contract.js` (`flatTerrain()`, `checkTerrain()`), with a flat-world smoke test in `src/rex/test/smoke.mjs`. The paths below are from before the move: `src/sim/rex.js` is now `src/rex/body/rex.js`, `src/sim/mind.js` is `src/rex/brain/mind.js`, `src/species/` is `src/rex/species/`, `src/view/body.js` and `rexgeo.js` are in `src/rex/skin/`. This note stays as the record of the Saltline port.

For an AI agent that has never seen this repo. Written 2026-11-16 while porting `variants/saltline` onto the shared sim.
Reference host: `variants/saltline/src/` (main.js, saltworld.js, audio.js, pills.js, view/rexbody_gl.js). Reference headless host: `test/saltline.mjs` + `test/worlds/saltworld.js`.

## What the animal is made of

- **Body** `src/sim/rex.js`, class `Creature`. Deterministic, fixed 120 Hz, no renderer. Gait, balance, head, neck, jaws, tail, collision volumes, crash response. No animation clips: every pose is simulated.
- **Mind** `src/sim/mind.js` (+ attend, appraise, afford, peril, thoughts, nav). Senses, belief, moods; picks a behaviour and writes an intent the body carries out. Produces thought lines (`mind.voice.think`, `mind.voice.stream`).
- **Arena** `src/sim/arena.js`: the glue that steps body + mind + people + thrown things together. Hosts call this, not Creature and Mind separately.
- **Species** `src/species/tyrannosaurus.js`: dimensions, gait, senses, temperament, tunables (`navBody` etc.).
- **Optional view**: `src/view/rexgeo.js` (skin geometry, renderer-independent, imports only `three` maths) and a body class that draws it: `src/view/body.js` (three/webgpu) or `variants/saltline/src/view/rexbody_gl.js` (classic WebGLRenderer, r180). **Optional audio**: `src/view/audio.js` (our arena's) or `variants/saltline/src/audio.js` (small, Web Audio only). Sim and species import only `three` (Vector3) and `src/math.js`.

## The contract

Units: metres, seconds, y up. Heading `sim.psi` (radians): forward = (sin psi, cos psi) in (x, z). Fixed step `DT = 1/120`: accumulate real dt (cap ~0.1 s, max ~14 steps a frame), call step per slice, then blend the last two poses by `acc/DT` for drawing.

Construct (see main.js):
```js
const T = makeTerrain(...);                       // your world, below
const sim = new Creature(T, { x, z, yaw, seed });
const mind = new Mind(sim, seed);
const arena = new Arena(T, sim, mind, seed);
arena.herd.disabled = true;                       // the arena's own prey herd; a foreign host has none
arena.opening({ x: px, z: pz });                  // once, when play starts: where the person is
```
Each 120 Hz step: `arena.step(DT, { agents, noises, light, flash, wind })`, then drain `arena.events` (set `.length = 0`).
- `agents`: people it can sense. `{ id:'you', x, y (eye height), z, vx, vz, speed, crouch, fx, fz (facing, unit), torch:false, lx, ly, lz (look dir) }`. Dead player: pass `[]`.
- `noises`: array you build and drain each step. `{ x, y, z, loud (0..1), kind, you?:true, src? }`. Scale seen working: walking 0.045, sprinting 0.16, crouched 0.012, a rifle shot 1. Kinds used: step thud shout bang clank thunder. Noises are how it hears; no noise, no hearing.
- `light` 0..1 ambient (0.55 used for rainy dusk), `flash` 0/1 (lightning), `wind {x,z}` m/s.
- People: `arena.victim(id)` is the body of a person it can seize. When `V.state !== 'free'` it owns the person: read `V.x, V.y, V.z, V.cam` and move your player there; `V.dead` means killed, apply your own death flow; `arena.respawn(id, x, z)` after a retry (new individual). Struggle input: `arena.struggle(id, k)`. Meat: `arena.offer(id)` (ours only).
- Missiles that hit it: push `arena.hits.push({ type:'hit', id:-1, kind:'bullet', missile:true, part, x,y,z, vx,vy,vz, speed, from:{x,z}, by, dmg })`. Find `part` yourself by ray against `arena.things._bodySegs(sim)` (capsules `[A,B,radius,part]`); main.js `rayRex` does this. It is never killed by hits; the mind reacts.
- Other creatures: `world.creatures` is NOT read by the shared sim today (see below).

What comes back:
- **Pose**: `sim.pose.v` (Float32Array 73) and `sim.pose.s` (24), indexed by `PV` and `PS` exported from rex.js. Hand the pair to the body view (`body.update({v, s})`), set `body.fix = sim.fix` every frame (live gaze target), optional `body.glareEye = mind.dazzle`. Without our view you must skin it yourself from `PV`: spine positions `SP..SP+25` and up vectors `SU..`, head point/forward/up, 2 legs x `LEG.SIZE` (hip, knee, ankle, mtp, toe fwd/up) vec3 slots, arm; `PS` has jaw, breath, load, planted, blink, toes, lid, lie, squint. `rexgeo.js` `boneMatrices` is the only decoder of this; read it.
- **Events** `arena.events`, each `{ src:'sim'|'mind'|'arena'|'victim', type, ... }`: sim: footfall (x,y,z,intensity), roar, huff, rumble, snap/clack, settle, liftoff, startle, contact (part torso|hips|head, surface, force m/s, x,y,z, nx,nz: a crash against a solid), wince; mind: kill (id, other), nudge, tell; arena: remains, offer, taken; victim: knocked, hurt, landed. Route footfall/roar/huff/contact to sound, `mind kill` to your damage.
- **Thoughts**: `mind.voice.think` (current 2-5 word line, '' when quiet) and `mind.voice.stream` (`{t, text}` list). Pills in `variants/saltline/src/pills.js`.
- Handy for debugging: `mind.beh.name`, `mind.know.seen`, `mind.hunger`.

## What your world (`T`) must answer

Minimal host, proven by running 20 s with a flat Proxy terrain (the list is what crashed when absent):
`height(x,z)->y`, `normal(x,z,out)` (fill `out.x/y/z`, return it), `obstacles:[]` (pillars `{x,z,r,h,top,kind,sid}`), `obstaclesNear(x,z,rad)->[]`, `near(x,z,rad)->[]` (colliders `{x,z,r,top,bot?,kind}`; `bot` makes a slab), `pushOut(p,r,y0,y1,iters,wallsFull)->[tx,tz]` (push p.x/p.z out of colliders, return total shove), `segClear(ax,ay,az,bx,by,bz,pad)->bool` (sight and path ray free of ground and solids), `roofBlocks(ax,ay,az,bx,by,bz)->bool`, `structures:[]`, `insideStructure(x,z,y)->struct|null`, `doors:[]`, `stepDoors(...)` (no-op), `rect:{x0,x1,z0,z1}` (the fence it keeps to), `bound` (a square half-size that must contain the rect), `arena` (radius it treats as home; ~36), `size`, `grazing:[]`, `coverAt(x,z)->0..1`, `coverHeight(x,z)->m`, `windAt(x,z)->{x,z}`, `wetAt(x,z)->0..1`, `depthAt(x,z)->water depth m`, `surfaceAt(x,z)->'concrete'|...`, `placeName(x,z)->string`, `speedFactor(x,z)->1`, `addBump(){}`, `bumps:[]`. `ver` (change counter) is optional. Flat ground with no solids is a valid answer for every query; `test/worlds/saltworld.js` shows a full one (boxes -> chains of pillars at 0.75 m, low boxes -> ground relief rastered at 0.25 m, interiors -> structures with openings found from wall gaps).
A structure is `{kind, id, cx, cz, yaw, hw, hd, h, base, walls, openings:[{x,z,nx,nz,w,y}], roof:{y}}`. Wall thickness in your world must become pillars of r >= 0.35 or the animal walks through.

## Checking it headless

`node test/saltline.mjs [all|opening,shed,...] [--secs=S]` (about 5 min, prints a table, "no hard failures" or exit 1). It builds the world from `test/worlds/saltline.json` (dump of `G.physics.boxes`, `G.level.interiorBoxes`, `G.level.zones`; schema in saltworld.js header) and plays scripted encounters, failing on NaN, body deeper than 0.25 m inside a box, or a 20 s stall with a route. To test another game: dump its colliders to such a JSON, write a `makeTerrain(desc)` beside saltworld.js, copy the test's scenario table. In a page, `variants/saltline/test/page_current.py` loads the game headless, samples `window.__rex` for 60 s, takes screenshots. Expose `{sim, mind, arena, T, stats, body}` on a global to make this possible.

## What made this port harder than it should be

1. **The variant forked the sim and also patched it.** The copy had a Saltline-only module (`others.js`, NPCs as "creatures") wired into mind.js, attend.js and thoughts.js at 20 marked hook points. Removing the copy removes that feature (parked in `variants/saltline/pending/`, hook list in `saltrex-hooks.txt`). Suggest: an official extension point on Mind (`mind.addSense(module)`: perceive, offer prey, urge, news) so foreign-world perception lives in the host.
2. **The terrain contract exists only as a 27-name list found by deleting names until it stopped throwing.** No file states it, and `src/terrain.js` is our world. Suggest: `src/sim/terrain-contract.js` with JSDoc signatures plus `flatTerrain()` returning a valid minimal world, and a startup check that names missing members.
3. **Arena concepts leak.** `Arena` requires `herd`, `things`, `opening`, `spawnPoint`, prey, `paddock`-style `T.arena`/`T.bound`/`T.size` (a square, though Saltline is a rectangle: the adapter computes bound = max |edge| and a separate `rect`). Suggest: split Arena into a host-facing `Encounter` (agents, noises, victims, hits, events) and our arena extras.
4. **Pose layout is implicit.** `PV`/`PS` give offsets but the slot meaning (vec3 each; spine positions vs up vectors; leg slots) is only decodable from `rexgeo.boneMatrices`. Suggest: one comment block or a `describePose()` and a tiny reference skinner for hosts with their own rigs.
5. **Three viewers, one decoder.** `view/body.js` (WebGPU, TSL) cannot run on a classic WebGLRenderer, so Saltline keeps `rexbody_gl.js`, a second 350-line body class whose hide shader duplicates ours. New 'contact' events had no audio route in the host. Suggest: one body class with a material hook; document event types in one list (this file's list was assembled by grepping `type:`).
6. **Names and constants leak.** `T.placeName` feeds the voice, `surfaceAt` strings feed sound, `arena` 36 and `navBody` come from our paddock; the host sets `arena.herd.disabled` and `sim` start pose by hand. Suggest: all host-facing knobs in one `hostConfig` object passed to the constructor.
7. **Duplicate adapters.** `test/worlds/saltworld.js` and `variants/saltline/src/saltworld.js` are byte-identical copies (the test cannot import the variant without editing test/). Suggest: the test imports the variant's adapter.
8. **Units and signs are folklore.** psi forward = (sin, cos), `lx/ly/lz` look vectors, noise `loud` scale, `y` of agents meaning eye height: found by reading main.js and 3000-line mind.js. Suggest: put them in the contract file.
9. **No host smoke test shipped.** The 5-minute `test/saltline.mjs` is the only check and needs a world dump; a 20 s flat-world smoke (like the probe above) should live in `test/` and run first.
10. **Old page tests depended on the forked module** (`mind.others.summary()`); they are in `variants/saltline/pending/test-v2/`.
