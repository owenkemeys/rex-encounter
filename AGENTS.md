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

Useful URL hashes: `#tune` (tuning sliders), `#debug` (debug drawer, crash tests, gait demos, note box), `#webgl` (force WebGL2), `#perf`, `#quality-low|medium|high`, `#crash=headon|glancing|corner|barn|gate|post|bamboo` (run one crash test after load).
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

## State and open work (handoff written 2026-11-17; read this, then `notes/TODO.md`)

**Where the game lives.** Public page: https://owenkemeys.github.io/rex-encounter/ (the repo is public; `.github/workflows/pages.yml` builds and deploys `dist/` on every push to `main`, about 2 minutes). The owner's own copy with playtest notes: the "Rex Sandbox" artifact on claude.ai (public link; its database rules keep `notes`, `sessions`, `chunks` readable by him only; it declares `db`, `user`, `downloads`). To update that artifact: `npm run build`, then publish `dist/app.js` and `dist/index.html` to it in patch mode with `shared_live: "public"` and its title "Rex Sandbox". Saltline: the "Saltline Rex" artifact gets `variants/saltline/dist/saltrex.js` after `npm run build:saltline`. `main` must always be what both pages run. The game's name is Rex Encounter.

**Rules from the owner, all binding.**
- He designs and playtests; he does not do git, builds or hosting. Do the bookkeeping quietly and keep this repo current so an agent on any platform can continue.
- Short messages. Bring him decisions (question, options, your recommendation), not essays.
- Release rough: "its best to release things janky and let people see iteration over time, rather than striving to perfect before launch". Only three things block a release: it crashes or freezes, it leaks someone's data, or it stops being fun. Say which of your caveats are blockers and which are just rough.
- No slow headless renders (this kind of machine has no GPU): verify with the Node tests and ONE `tools/load_check.py` run, publish, and let him look. Screenshots only when a bug cannot be found otherwise.
- He tunes numbers himself: the tuning panel (`#tune` or `#debug`, key `;`, `src/view/tune.js`) has about 300 live sliders and a "copy changed values" button. When he pastes lines like `storm.dens = 0.0102 (was 0.0115)`, write them into the code's defaults and tell him to press "reset all". Expose any new parameter with `tune(group, label, obj, key, min, max, step)`.
- His words are kept verbatim in `notes/QUEUE.md`; `notes/TODO.md` holds the priority list and every item's status with what is unverified. Update both as you go. Mark an item as yours before working on it.

**What exists now** (built 15-17 November; almost all of it checked by tests only and then played by the owner, whose verdicts are in QUEUE): crash reactions (head-on reel, body-blow sequence, crash thoughts); the animal provokes a passive person (nudge, shove, toss), kills when hungry, reaches through windows; head leads into turns; fast-turn splay fix (`node test/splay.mjs`) with old/current "Gait demos" in the debug tools; jaw driven by the emitted voice; eyelids follow the eye; pubic keel on the model; dark storm restored (owner: "great so far, no need to change"); prop collision; jump; spawns near cover; twin-stick touch layout (`src/touchlayout.js`); sound stops when the page is inactive, with a mute icon; the security-camera death replay with a small human figure, taped flares and sounds, a closing "visitor safety notice" card (`src/view/closeout.js`), recorded by default so SAVE CLIP is instant, and clip-at-any-time (key R); stuck-animal alarm in telemetry; Saltline on the shared sim.

**Next, in the owner's priority order** (reordered by him 2026-11-17; details and his words in `notes/TODO.md` and `notes/QUEUE.md`):
1. Strip out the doors (T21): "high priority because they mostly don't work anyway".
2. Arena design (P6, T2): shrink/re-centre round the Barn, Ruins and Containers; bamboo (cones are ugly, stems should give way). "Arena design is more important" than replay links.
3. Thought text placement: keep it off the touch controls, and make it readable when the rex's head is off screen ("they quickly get weird and unintuitive"). `src/thoughtplace.js`; see TODO for status.
4. Check on a real iPhone what could not be tested: clip sound (fixes in `src/view/clip.js`; each clip logs `[clip] audio`), sound returning after app switch, the touch layout's comfort, portrait.
5. A goal: the "distract it from eating the kids for X minutes" scenario (design agreed in outline in QUEUE/TODO P5; not built).
6. More delightful pseudo-emergent behaviours (P7 has a candidate list).
7. The creature package (T20) and host creatures for Saltline (T16); `notes/HOSTING.md`. Hide or keep the sandbox tools on the public page (owner undecided).
8. Body: slow-turn splay still present below 3.5 m/s (T14/T15), a long strike leaves the trailing foot at full reach, the keel clips the thighs at a run and sinks when lying, heavy brow (T17).
9. LOW: shareable replay LINKS (T23). "much less important now that the video capture is excellent". Do not start without asking him.
Older open items: strike misses a man under its chin; tail has no contact; three long stalls in Saltline; breath particles clip the snout.

Housekeeping: a stale remote branch `crashes-read` can be deleted (fully merged).

## Saving tokens (for AI agents)

- Start a fresh session per task and read this file plus the one note you need. Do not resume day-long sessions.
- Never print big files or test dumps into context; grep, cut and tail.
- Cheap model for rote work, strong model only for body-simulation and mind judgement.
- Playtest notes in the hosted arena's database carry inline screenshots: never read them raw.
- The owner designs and playtests. He does not use git and should never be asked to think about branches, checkouts, builds, merges or pull requests: that bookkeeping is the agent's to do, quietly. Report to him in terms of what he will see and hear in the game.
- He plays by clicking the hosted arena, the "Rex Sandbox" artifact on claude.ai. To give him a build: `npm run build`, then republish only `dist/app.js` (and `dist/index.html` if it changed) to that artifact in patch mode; the assets there stay.
- `main` is what the hosted arena runs. Work on a short branch, run the checks, then merge to `main`, push, delete the branch and republish the arena in the same sitting, so the two never drift. If he rejects a change after playing it, fix forward or revert on `main` and republish. If several agents are working at once, merge through pull requests and rebase before merging.
