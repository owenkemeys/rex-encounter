# Rex Encounter: cheat sheet for whoever works here next

Read this first. It is short on purpose. `CLAUDE.md` points here.

## What this is

An intelligent-animal platform for browser games: a procedurally simulated body plus a simple, legible mind, with a Tyrannosaurus as the example animal and an arena as the testbed. No animation clips anywhere: every pose comes from the simulation.

The rule that matters most: **general rules over properties and events, never names or scripts.** The animal must behave sensibly in a world it was not written for (`variants/saltline` is the proof). If a fix only works because it knows it is in our arena, or because the thing is the player, it is the wrong fix.

Owner's intent lives in `docs/VISION.md` (the game) and `docs/MIND_DESIGN.md` (the mind). Vocabulary: `docs/GLOSSARY.md`. Hard decisions: `docs/adr/`.

## Run it

```
npm i
npm start            # builds dist/app.js, serves dist/ on http://localhost:8080
```

Useful URL hashes: `#debug` (debug drawer), `#webgl` (force WebGL2), `#perf`, `#quality-low|medium|high`, `#crash=headon|glancing|corner|barn|gate|post|bamboo` (run one crash test after load).
In play: backtick opens the debug drawer; the pause card has a "debug tools" button for phones.

`dist/app.js` is build output and is not committed. Everything else in `dist/` (page, audio, assets) is source.

## Layout

| Path | What |
|---|---|
| `src/sim/rex.js` | The body. Deterministic, fixed 120 Hz, seeded, no renderer. Gait, balance, head and neck, jaws, tail, collision volumes, crash response (`_crash`). Emits events (`contact`, footfalls, ...). |
| `src/sim/mind.js` + `attend.js`, `appraise.js`, `afford.js`, `peril.js`, `thoughts.js` | The mind. Senses, belief about where things are, moods, picks a behaviour, writes an **intent**. The body carries the intent out. Thought lines are 2 to 5 plain words traceable to real state. |
| `src/sim/nav.js` | Route planning round solids and steep ground. |
| `src/sim/arena.js` | Steps body, mind, thrown things and the herd together. |
| `src/species/tyrannosaurus.js` | Everything species-specific: dimensions, gait, senses, temperament, tunables. Put tunables here, not in the engine. |
| `src/terrain.js`, `src/paddock.js` | The world and its collision. Walls are chains of pillars on the obstacle list. |
| `src/view/` | Three.js drawing (WebGPU with WebGL2 fallback): `body.js`, `rexgeo.js` (skin), `effects.js`, `audio.js` (+ `audiohybrid.js`), world. View never changes sim state. |
| `src/main.js`, `src/ui.js`, `dist/index.html` | The app, input, debug drawer, pause card, crash tests (`CRASH` table in `main.js`). |
| `test/` | Headless Node checks (`node test/<name>.mjs`) and Playwright capture scripts. Some capture scripts still carry absolute `/home/claude/...` paths from the machine they were written on. |
| `tools/load_check.py` | In-browser smoke test: `python3 tools/load_check.py <name> "<hash>"` after a build; writes `/tmp/load_<name>.json`. Needs Playwright and Chrome. |
| `variants/saltline` | The same animal dropped into someone else's game. Own copy of the sim. `npm run build:saltline`. |
| `variants/patch-model` | Experiment: our simulation driving a CC0 rigged model (its own animations unused). Head too large, eyes not integrated, behind the main tree. |
| `wip/bamboo-squeeze` | **Unfinished, never run.** Partial edits toward yielding obstacles and forced squeeze. Review or discard. |
| `notes/` | Working notes from every work stream. `notes/QUEUE.md` is the owner's requests, verbatim, newest last. `notes/skel/BODY4.md` (body) and `notes/platform/NOTES4.md` (mind) are the latest. |
| `docs/HANDOFF-claude-project.md` | Older, longer handoff. Its parts about restoring from a "source store" are obsolete: this repository is the master now. |

It is one app, not yet packages. The seams are already clean enough to split later: `src/sim` + `src/species` have no renderer or DOM dependencies, and a host world only has to supply the terrain queries and feed agents and noises (see how `variants/saltline` does it).

## Before you ship a change

1. Run the Node tests that cover what you touched. Body: `test/review.mjs`, `test/corner.mjs`, `test/striketime.mjs`, `test/strikepass.mjs`, `test/crashread.mjs` (each crash test twice: knock, speed lost, how far it comes back off the thing). Crash sounds: `python3 test/crash_audio.py` (renders each, prints level, share above 300 Hz, tonality). Mind: `test/mind.mjs all <seed>`, `test/commit.mjs`, `test/platform.mjs`, `test/saltline.mjs`.
2. Build and run `tools/load_check.py`; console must be clean.
3. A body change that helps the arena can stall the animal in Saltline. Check both.
4. Say plainly what was verified by test and what nobody has seen or heard. The owner playtests by eye and ear; most things here have only ever been checked by numbers.

## Working with the owner

- He specifies results, not methods. Decide naming and technique yourself.
- Keep messages short. Always give him something to play when asking for his view.
- Do not explain the animal with UI. Not a timid animal. No lingering player injury.
- Push back when the serious version of a request is not worth its cost and offer the cheap approximation.

## Open work (newest first; details in `notes/QUEUE.md`)

Owner's verdict on the crash build (2026-11-15 20:30): head-on "great ... very believable"; remains of the player now go in two mouthfuls (done, `REMAINS_MOUTHFULS` in `src/sim/arena.js`, played by nobody yet). Open, in his order of mention:

1. **Body blows do not sell yet.** Glancing and corner hits are "functional but not selling the illusion" the way the head-on reel does. What exists: `_crash` in `src/sim/rex.js` (the `gl` stumble block: roll, chest dip, hip drop, head tilt, bounce off the surface 0.2 s later; tunable `crash.stumble` in the species file). The head-on works because it is a sequence with a beat (blow, recoil, give ground, shake, stand); the body blow is one lurch and it runs on. Try: a sequence too (thrown onto the far leg, a visible catch step or two, head and tail whipping opposite, a snort, a glance back at what it hit) scaled by `gl`; check with `node test/crashread.mjs corner trace` and frames from the page; keep `test/corner.mjs` cost about where it is (chase reaches in 9.5 s, man falls back 0.87 s). Background: `notes/skel/CRASHREAD.md`.
2. **Death cam (not started).** "upon death an optional death cam replay so you can see from a third person what happened ... we need a character model ... for now just use a simple pill shape." Suggested build: keep a ring of the last ~10 s at 30 Hz of the animal's pose buffers (`sim.pose.v` and `sim.pose.s`, both Float32Array; `body.update(pose)` in `src/main.js` draws from them) plus the player's eye position, yaw, crouch and whether held (`arena.victim('you')`). Add a "watch it back" button to the death card (`#dead` in `dist/index.html`; logic in `src/ui.js` `showDeath`/`retry`). On replay: hide the card, feed recorded poses to `body.update`, draw a capsule (about 1.75 m tall, 0.25 m radius; lying down when held or down) at the recorded player position, camera fixed about 10 m to the side of the line between the two, 2.5 m up, looking at the midpoint, not inside a structure (`terrain.structures`: cx, cz, hw, hd, yaw); tap or any key skips; then the card again. The live sim keeps running underneath, so things other than the animal and the pill show their present state: acceptable for a first version, say so.
3. **At a big window it peers instead of reaching in.** Playtest note (session 20261115T201359Z-65uz, note 2): he stood inside right next to a window at about (-50.3, 60.6); the animal stood 5.7 m off at (-50.5, 54.9) in `besiege`, low, head off to one side, thinking "it still in shiny box". He expects the head to come through the window after him. Windows are meant to admit the head ("a head goes through, never the chest", `src/paddock.js`). Look at `besiege` in `src/sim/mind.js` and how it picks an opening and a head goal; reproduce headless (the mind tests in `test/mind.mjs` show how to script a person) before changing anything.
4. **Bamboo and squeezing.** Thin stems should give way with effort; a determined animal should force a nearly-wide-enough gap (volumes compress, narrow side first, spine a little past limits, slow, scraping) and refuse plainly impossible ones. Phone slows when it is in the bamboo: measure sim cost first. Owner watched the bamboo test: it got stuck, then unstuck, and the skeleton's poses were tortured on the way.
5. Strike misses a man under its chin. Tail has no contact or slap. Gaze more than 60 degrees off target 5.3% of the time.
6. Three long stalls remain in Saltline over 8 seeds.
7. More watchable set-piece scenarios like the crash tests (owner liked them).
8. Patch-model follow-up. Breath particles clip the snout (owner: not yet). Storm atmosphere. Raptor-sized ally idea for Saltline.

## Saving tokens (for AI agents)

- Start a fresh session per task and read this file plus the one note you need. Do not resume day-long sessions.
- Never print big files or test dumps into context; grep, cut and tail.
- Cheap model for rote work, strong model only for body-simulation and mind judgement.
- Playtest notes in the hosted arena's database carry inline screenshots: never read them raw.
- The owner designs and playtests. He does not use git and should never be asked to think about branches, checkouts, builds, merges or pull requests: that bookkeeping is the agent's to do, quietly. Report to him in terms of what he will see and hear in the game.
- He plays by clicking the hosted arena, the "Rex Sandbox" artifact on claude.ai. To give him a build: `npm run build`, then republish only `dist/app.js` (and `dist/index.html` if it changed) to that artifact in patch mode; the assets there stay.
- `main` is what the hosted arena runs. Work on a short branch, run the checks, then merge to `main`, push, delete the branch and republish the arena in the same sitting, so the two never drift. If he rejects a change after playing it, fix forward or revert on `main` and republish. If several agents are working at once, merge through pull requests and rebase before merging.
