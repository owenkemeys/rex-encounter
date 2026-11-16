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
| `variants/saltline` | The same animal dropped into someone else's game, on the shared `src/sim` (no copy since 2026-11-16; NPC perception parked in `pending/`). `npm run build:saltline`; the owner plays it as the "Saltline Rex" artifact (republish `variants/saltline/dist/saltrex.js` there). Putting the animal into another game: `notes/HOSTING.md`. |
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

**Start with `notes/TODO.md`: the owner's latest playtest notes as numbered to-do items with status. Mark an item as yours before working on it.**

Built 2026-11-15 evening by three subagents in parallel, merged and tested together (review, corner, crashread, platform, mind all 3, Saltline: no failures), now in the hosted arena. **Owner has played it (21:45): crash collisions "working pretty well now", window intrusion "kinda works", kill cam "quite funny already" and to become automatic (in progress).**

- **Body blows are a three-beat sequence** (`_crash` and the locomotion block in `src/sim/rex.js`, numbers in the species file under `crash.blow`): blow, rebound off the surface with roll, head and tail swinging the other way and a catch step asked for, then on hard hits a huff as it gathers itself. `test/crashread.mjs` prints "roll into wall ... then away". Open questions: the first lean into the wall measures smaller than before (0.13-0.19 rad at the corner, was about 0.3); the catch step is not confirmed visible.
- **Death cam** (`src/view/replay.js`, wiring in `src/main.js` and `src/ui.js`, "watch it back" on the death card): the last ~10 s from a fixed side camera, the player as a pill. Checked in headless Chrome by key only. Not checked: gamepad, touch and click skip; the camera's avoidance of buildings. Pressed within 2.5 s of dying, the tape ends early. Other things in the scene show their present state, not the past.
- **At a window it comes for you** (`thru` in `besiege`, `src/sim/mind.js`; `node test/window.mjs` reproduces the owner's note at the Warehouse south window): 5 of 6 seeds now seize him, before none. The head only just gets through, because the body stops at the wall and the stance is ~3 m behind the head; it may also kill very fast. Other windows and positions unchecked.
- **Remains of the player go in two mouthfuls** (`REMAINS_MOUTHFULS`, `src/sim/arena.js`).

Still open:

1. **Bamboo and squeezing.** Thin stems should give way with effort; a determined animal should force a nearly-wide-enough gap (volumes compress, narrow side first, spine a little past limits, slow, scraping) and refuse plainly impossible ones. Phone slows when it is in the bamboo: measure sim cost first. Owner watched the bamboo test: it got stuck, then unstuck, and the skeleton's poses were tortured on the way.
2. Strike misses a man under its chin. Tail has no contact or slap. Gaze more than 60 degrees off target 5.3% of the time.
3. Three long stalls remain in Saltline over 8 seeds.
4. More watchable set-piece scenarios like the crash tests (owner liked them).
5. Patch-model follow-up. Breath particles clip the snout (owner: not yet). Storm atmosphere. Raptor-sized ally idea for Saltline.

## Saving tokens (for AI agents)

- Start a fresh session per task and read this file plus the one note you need. Do not resume day-long sessions.
- Never print big files or test dumps into context; grep, cut and tail.
- Cheap model for rote work, strong model only for body-simulation and mind judgement.
- Playtest notes in the hosted arena's database carry inline screenshots: never read them raw.
- The owner designs and playtests. He does not use git and should never be asked to think about branches, checkouts, builds, merges or pull requests: that bookkeeping is the agent's to do, quietly. Report to him in terms of what he will see and hear in the game.
- He plays by clicking the hosted arena, the "Rex Sandbox" artifact on claude.ai. To give him a build: `npm run build`, then republish only `dist/app.js` (and `dist/index.html` if it changed) to that artifact in patch mode; the assets there stay.
- `main` is what the hosted arena runs. Work on a short branch, run the checks, then merge to `main`, push, delete the branch and republish the arena in the same sitting, so the two never drift. If he rejects a change after playing it, fix forward or revert on `main` and republish. If several agents are working at once, merge through pull requests and rebase before merging.
