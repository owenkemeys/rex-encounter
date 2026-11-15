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

1. **Crashes: reworked 2026-11-15, awaiting the owner's eye and ear** (`notes/skel/CRASHREAD.md`). Later crashes in a session were being ignored (cooldown bug), which was most of "nothing happened". Head-on now reels (head thrown back, backs off, shakes); glancing and corner hits are a jolt; container and barn sounds rebuilt as struck noise that a phone can carry; kick and dust stronger. Checked by `test/crashread.mjs`, `test/crash_audio.py` and still frames only. Left: a sprint head-on sits very low; it reels off bamboo.
2. **Bamboo and squeezing.** Thin stems should give way with effort; a determined animal should force a nearly-wide-enough gap (volumes compress, narrow side first, spine a little past limits, slow, scraping) and refuse plainly impossible ones. Phone slows when it is in the bamboo: measure sim cost first. Owner watched the bamboo test: it got stuck, then unstuck, and the skeleton's poses were tortured on the way.
3. Strike misses a man under its chin. Tail has no contact or slap. Gaze more than 60 degrees off target 5.3% of the time.
4. Three long stalls remain in Saltline over 8 seeds.
5. More watchable set-piece scenarios like the crash tests (owner liked them).
6. Patch-model follow-up. Breath particles clip the snout (owner: not yet). Storm atmosphere. Raptor-sized ally idea for Saltline.

## Saving tokens (for AI agents)

- Start a fresh session per task and read this file plus the one note you need. Do not resume day-long sessions.
- Never print big files or test dumps into context; grep, cut and tail.
- Cheap model for rote work, strong model only for body-simulation and mind judgement.
- Playtest notes in the hosted arena's database carry inline screenshots: never read them raw.
