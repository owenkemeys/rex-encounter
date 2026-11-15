# Handoff — Dino Hunter / Rex Sandbox (updated 2026-11-15, 15:10 UTC)

You are taking over development of this project from a previous session. This document plus the source store below is everything you need. Also read `claude/MIND_DESIGN.md` (the behavioural design; note the amendments under "Direction" here, not yet written into it), `claude/VISION.md`, `claude/GLOSSARY.md` and the two ADRs in `docs/adr/` (do not edit those three). `saltline-rex.html` in the project is the owner's older single-file copy of the Saltline game with the rex attached.

**What to do first:** restore the source, read "Trees", "State" and "To do" below, then tell the owner in a short message that you are up to speed. One stream was in flight when this was written (body collision, see "Update 09:00" below). Read that section first: it supersedes the older State entries for the arena.

## Restore the source (about three minutes)

- **Dino Hunter source store** — slug `d7c1dac6-e1ab-43d4-b820-ca768d500f52` — https://claude.ai/artifact/TeGnjBPMC1MraiNS9kAdwo

It holds one `tar.gz` archive (27 MB), base64-encoded and split into 43 files, `chunks/part00.json` … `chunks/part42.json`, each `{"i": n, "of": 43, "b64": "…"}`.

1. Load `mcp__claude-artifacts__read_file` (ToolSearch if needed). Call it with the slug and `paths`, four chunk paths per call (eleven calls; the last has three). With `paths` each file is saved to disk and its location printed; the content does not enter your context. Do not use `path` (singular).
2. Copy the 43 saved files into one folder, save the script below as `restore.py` in a different folder, run `python3 -I restore.py <folder> /home/claude`.

```python
import base64, glob, hashlib, io, json, sys, tarfile
src, out = sys.argv[1], sys.argv[2]
js = [json.load(open(p)) for p in glob.glob(src + "/**/*.json", recursive=True)]
js = sorted([j for j in js if isinstance(j, dict) and "b64" in j], key=lambda j: j["i"])
assert len(js) == js[0]["of"], ("missing parts", len(js), js[0]["of"])
data = base64.b64decode("".join(j["b64"] for j in js))
assert hashlib.sha256(data).hexdigest() == "1e1ab5d9e9f80362c3230640dd114ba7822e75eda1677f9579dabd1450b6114a", "checksum mismatch"
tarfile.open(fileobj=io.BytesIO(data)).extractall(out)
print("restored to", out)
```

This snapshot has not been test-restored.

3. After restoring:
   - `cd /home/claude/rex_rc && npm install`, then link it into the other trees: `for t in rex rex_m rex_patch rex_design; do ln -sfn /home/claude/rex_rc/node_modules /home/claude/$t/node_modules; done`.
   - Only `rex_rc/dist` is complete in the snapshot. `rex/dist`, `rex_m/dist`, `rex_design/dist` are absent, and `rex_patch/dist` lacks `assets/` and `audio/`: copy those from `rex_rc/dist` (for `rex_patch` keep its own `index.html`, `app.js` and `model/`).
   - `mkdir -p /home/claude/hotfix && cp /home/claude/hotfix_keep/load.py /home/claude/hotfix/`.
   - Build check in a tree: `npx esbuild src/main.js --bundle --format=esm --minify --outfile=/tmp/app_check.js`. Headless Chrome: `/usr/bin/google-chrome`.
   - The snapshot keeps source, builds and text notes (`*.md`, `*.py`, `*.mjs`, `*.sh` under each `out/`). Screenshots, renders and spectrograms were left out.

To refresh the store: build a file list (source and `dist` of the trees below, text notes under `out/`, no `node_modules`, PNG/WAV, binary dumps, or duplicate `dist` assets), `tar czf -T`, base64, 850 kB JSON chunks written to a NEW folder, `get_artifact`, `publish_files` in patch mode to the same slug; remove surplus chunk files if the count drops; update the checksum and count here. Refresh at every consistent point: the environment restarts several times a day and the account hits a five-hour usage limit.

## Trees (all under /home/claude)

- **`rex_rc/` — the source of what is live in the arena.** To publish: copy finished files in, `npx esbuild src/main.js --bundle --format=esm --minify --outfile=dist/app.js`, in-game load check, `get_artifact`, publish `dist/app.js` (plus any new files such as audio clips, `audio/manifest.json`, or `index.html` if changed).
- **`rex/` — main working tree, with all notes under `rex/out/`.** Its `src` equals `rex_rc/src`.
- **`rex_m/` — where the behaviour merge was done** (landed; see State). Its `src/sim`, `src/species` and `test` are now in `rex_rc` and `rex`. Its view files and audio are older: do not copy them. Notes `rex_m/out/platform/MERGE.md`.
- **`rex_patch/` — the owner's model experiment** (published; see State). A copy of `rex_rc` from 01:00 UTC on 2026-11-15, so it has the real-recording huff but not the rebuilt sniff, and not the behaviour merge. Notes `rex_patch/out/PATCH.md`.
- **`saltrex/` — Saltline with the current rex.** Finished build in `saltrex/v2` (`dist/` is what is published; rebuild with `sh saltrex/v2/tools/build.sh`). Notes `saltrex/out/BUILD2.md`.
- `rex_design/` (CORE build, superseded), `rex_base/src` (old merge base), `stable/` (old public build's source), `tools/pulse.sh` (liveness check), `hotfix_keep/load.py` (in-game load check), `patchrex/tools/` (Python scripts that parse the model GLB).
- Notes worth reading under `rex/out/`: `QUEUE.md` (director's queue); `platform/` (`COMMIT.md`, `TUNE*.md`, `STUCKFIX.md`, `KIT.md`); `skel/` (`BODYFIX*.md`, `SKIN3.md`, `LEGDEFORM.md`, `EYES*.md`, `JAW.md`); `audio/` (`IOS.md`, `FOOTSTEPS.md`, `ROCKS.md`, `ODDSOUNDS.md`, `HUFF.md` which also covers the sniff); `ui/UI.md`; `telemetry/TELEMETRY.md` and `CAPABILITIES.md`.
- Tests (in each tree's `test/`): `platform.mjs`, `saltline.mjs`, `stuckopen.mjs`, `commit.mjs`, `review.mjs`, `thoughts.mjs`, `gaze.mjs`, `attend.mjs`, `siege.mjs`, `peril.mjs`, `predator.mjs`, `probe.mjs`, `smoke.mjs` (baseline stale), `audio_hybrid.mjs` (renders every voice offline), `audio_pack.py` (the recipe for every audio clip: source URL and cut points), `session_report.mjs` (telemetry). `test/studio.py` + `src/studio.js` render the animal on a plain floor.
- **Studio and Node checks are not enough for anything the player sees: verify in the real game page from the player's camera.** A fix that passed in the studio was wrong in the game.

### In-game load check

Replace `/home/claude/hotfix/dist` with a copy of the tree's `dist`, `timeout 590 python3 hotfix/load.py <name> ""`, read `hotfix/load_<name>.json`: `started` true, `bodyCheck_final.ok` true, console clean apart from "GPU stall due to ReadPixels" warnings; look at the screenshot.

### Publishing rules learned the hard way

- The artifact host serves neither `.bin` nor `.glb`. Binary data ships as JSON with a base64 field (`assets/arena/*.glb.json`, `model/patchrex.geo.json`).
- Keep `<title>Rex Sandbox</title>` in the arena's `dist/index.html` and never pass a title when publishing there. Always `get_artifact` first for the live version.
- **The owner has said: publish to the arena link whenever there is a build worth his input, without asking; always include the link when asking him to test.**

## Published

| What | Link | Slug | Notes |
|---|---|---|---|
| Arena, titled "Rex Sandbox" by the owner | https://claude.ai/artifact/1T2MJBJq2BGUx8ucXpGy5b | `03a22b81-9a58-4628-b7a5-3481e99e75b2` | private; live version `1794755133-9c0a` = `rex_rc`; capabilities `db` + `user` declared, contract 0.2.96 |
| Rex Sandbox: Patch model | https://claude.ai/artifact/QfAaA26RDpCC6P4u43s35H | `bf9659e6-b3d9-4017-a944-4ed9f3f9a290` | private; = `rex_patch/dist` without `patchrex.glb`/`.bin`; no capabilities declared, so no telemetry there |
| Saltline Rex | https://claude.ai/artifact/Dq5y4s6QPAH64DQMAaTEHP | `67e46cfa-7073-4958-88c3-624cd074d4ca` | private; = `saltrex/v2/dist` |
| Source store | https://claude.ai/artifact/TeGnjBPMC1MraiNS9kAdwo | `d7c1dac6-e1ab-43d4-b820-ca768d500f52` | private |
| Old map (stable) | https://claude.ai/artifact/7CMTb6pUePXACjxznLWQd9 | `322c9f12-6a06-4077-a6db-06cc0da9d404` | public; do not touch without asking |

### Telemetry and the note key

The arena build records each play session to the page's database (`src/telemetry.js`). Collections: `sessions/<sid>`, `chunks/<sid>_<n>`, `notes/<sid>_<k>`. In game, **T** freezes the game and opens a comment box; sending saves the note with context (position, rex behaviour and distance, the recent sound log) and unpauses. Read with `mcp__claude-artifacts__db_query` on the arena slug (e.g. collection `notes`, filter on `at`); fields such as `sounds`, `ring`, `thoughts` are JSON strings. Each sound entry is `[t, "snd", voice, method, n, gain, distance]`: look at the sounds just before a note's time. This found two faults in one evening. The owner will not use voice notes.

## Update 15:10 UTC (read first; newest)

**All subagents are stopped: the account's WEEKLY usage limit for Opus was hit at about 15:15 UTC and resets 2026-11-20 14:00 UTC.** Nothing is running and the check-in chain is stopped. Ask the owner how to proceed (wait, use Sonnet agents, or work directly).

Live arena version `1794755133-9c0a` = `rex_rc`. Since the 09:00 update below, also shipped (all in `rex_rc`; details in `rex/out/skel/BODY4.md`, `rex/out/platform/NOTES4.md`):
- Torso and hips crash response (`_crash` in `rex.js`): head-on overshoot, recoil and stagger; glancing lean and slide; a hard head knock stops the whole animal; when running at something it cuts corners and clips them, and a clipped corner costs it about 0.8 s (`test/corner.mjs`). Strike reach and timing restored (`test/striketime.mjs`, `test/strikepass.mjs`: 11 of 12; the miss is a man under its chin).
- Mind: head aims at the opening it can see or reach the target through; crash thought and a beat of surprise (reads `sim.crashS`); null-target guards.
- **Crash tests for the owner:** debug drawer group "Crash tests" (Head-on, Glancing, Corner chase, Again) and `#crash=headon|glancing|corner`. The drawer opens with the backtick key, or the "debug tools (crash tests)" button on the pause card (added because phones and the claude.ai frame have no backtick or URL hash).
- Shipped rex.js = `rex/out/skel/body4/rex_stage3h.js`.

**Unfinished, unverified work on disk:** the body agent had just started the owner's bamboo request. `rex/src/sim/rex.js` and `rex/src/terrain.js` hold partial edits that have never been run (copies in `rex/out/skel/body4/wipB/`). `rex_rc` does not have them. Review or discard them before building from `rex`.

Owner's open requests, newest first (verbatim in `rex/out/QUEUE.md`):
1. Stuck in the bamboo: "I expect bamboo that appears like this to be able to deflect out of its way with effort. There may need to be a trapped/push mode that allows the Rex to impinge its collision volume temporarily when determined, to simulate forcing or squeezing past an obstacle" and "letting its bones bend past limits if it's really determined. Animals squeeze past things all the time." Agreed design: solids carry a "give" from what they already are (thin stems and brush yield; walls do not), slowing it in proportion with rustle events, never stopping it dead; a forced squeeze when determined and the gap is nearly wide enough (volumes compress to a floor, narrow side presented, spine and neck past normal limits a little, slow, scrape events), refusing gaps plainly too small; add "Squeeze" and "Bamboo" buttons to the Crash tests group.
2. His phone slows when the rex is in the bamboo: measure the sim cost of body-volume queries against the stems first; if not that, the view.
3. Under-chin strike miss; tail contact and slap event; gaze time more than 60 degrees off target rose to 5.3%.
4. Three long stalls remain in the Saltline world over 8 seeds (crouch/2, crouch/4, noise/8).
5. Everything in the 09:00 queue below (Patch model follow-up, note screenshots, breath particles, storm, raptor idea).

## Update 09:00 UTC (older)

The owner played all three builds. Saltline: "its fun! the rex handled the strange environment well", surprised by lunges when he thought it was stuck. Patch model: "its good, the head is cartoonishly large, and the eyes arent integrated right, but overall this is a very promising start and its very realistic looking." Arena: 17 in-game notes, recorded verbatim with game state at the end of `rex/out/QUEUE.md`. Everything from those notes below is published in the arena (live version `1794732752-14d5`), verified by Node tests and the in-game load check; nobody has played it since.

Shipped from the notes (details in `rex/out/skel/BODY4.md` and `rex/out/platform/NOTES4.md`):
- Neck: one sideways C-curve only, limits in species data `neck`, body turns when the neck runs out (S-shape 64% of sniff ticks to 0). Leg lifting while frozen fixed. Jaws shut while sniffing.
- Head, snout and jaw are solid against walls for every motion (a final pass on the skull as drawn); contact events `{type:'contact', part, surface, force, x, y, z, normal}` from `rex.js`, routed in `main.js` to `audio.contact` and a camera kick.
- Watched stalk: freezes a few seconds, then comes by cover, arc or openly (`_watchedApproach`). Orienting reflex to any salient object with graded habituation (`_orientObj`). Siege: works each opening, waits out of sight by the exit, ambush on leaving, patience scales with hunger. Thought lines for probing replaced; a thrown object's landing is credited to the object. Null-target guard (`NEEDS_TARGET`). Committed back-offs so it does not rock in tight spaces (Saltline world: no hard failures).
- Footsteps: rex footfalls audible (body thud and ground crack), player step rebuilt per step with no wet sample. Nobody has listened.
- New tests: `necksniff`, `fidget`, `clip`, `watch25`, `flare3`, `hideout`, `audio_feet.js/.py`.

In flight: BODY stream (Opus; `rex/src/sim/rex.js`, species, `body.js`, `rexgeo.js`; notes `rex/out/skel/BODY4.md`). Its `rex/src/sim/rex.js` may be mid-edit; the shipped one is `rex_rc/src/sim/rex.js` (= `rex/out/skel/body4/rex_stage2d.js`). Its remaining work, agreed with the owner:
1. Torso and hips volumes with a crash response: push-out, lean against the surface, stagger step, lost speed (about a second of ground, more at a run), contact event with force. Caution shrinks with `intent.burst` / `intent.pace` / `intent.agitation` so it clips corners when chasing. No balance physics, no falling.
2. Strikes miss a person walking past at 1.4-3 m (the Loft-exit ambush springs and misses) and strike timing is slower since the neck limits (467 ms vs 283 ms in `peril.mjs`).
3. At the Loft doorway the snout sometimes presses on the planks beside the opening instead of entering.
4. Tail: contact and a slap event only. Legs last.
Design agreed for collision (owner): body volumes query the world's existing collision; the snout is a touch organ that feels its way in; the body judges fit by sight from its own size, only for what it looks at; behind the shoulders contact and force only; backing out of a hole it bumps the frame and adjusts.

Queue after that: Patch model follow-up (head too large, eyes not integrated, bring up to date with the arena); note screenshots moved to their own collection (reading notes through `db_query` is very expensive because each holds a base64 screenshot: use a cheap subagent that returns text only); breath particles clipping the snout (owner: not yet); storm atmosphere; raptor-ally idea for Saltline (QUEUE.md); practices from the shared thread (critic agent on filmed play, dev menu).

Check-ins: the pulse message is now one short line and the state lives in `/home/claude/tools/PULSE.md` (owner asked for cheap check-ins).

## State at 03:25 UTC (older; arena entries superseded above)

### 1. Arena (live): behaviour merge landed at 03:21, owner has not played it

The live build is TUNE3 plus phase 1 of MIND_DESIGN (the "core loop"), merged in `rex_m`. What changed for the player: it comes to you sooner (first sniff about 23 s after noticing you, was about 52 s); running from it in the open kills you again, running into cover its body cannot pass saves you; someone who keeps dazzling it with the torch is killed; doing nothing gets you killed in about two minutes after a readable reach of at least 3 s. Verified in Node (`platform`, `stuckopen`, `review`, `thoughts`, `probe` pass) and by the in-game load check; nobody has played it.

Known regressions left in it:
- `predator.mjs` matrix: one check fails. The hunting head is not carried lower than the curious one (2.79 m vs 2.70 m).
- `saltline.mjs`: `quiet/3` stalls 30 s searching (caused by the 2 s "look again" rule); the old `crouch/3` failure now passes.
- `attend.mjs`: 21 thoughts about things get no response (4.8%, limit 3%).
- `peril.mjs 6`: 6 checks fail (was 8).
- Smaller: stone thrower killed only 3/6; looking away gains it less ground from far off than in CORE.
- Not built: the watched "as if occupied" demeanour, fed toying.

To roll back: the previous sim is in `/home/claude/rexbak/pre_merge_sim` on disk only (not in the store); from the store, the previous snapshot is version `1794707998-4b89` of the store artifact.

Also in the live build (owner has heard these): huff and snort built from real horse and elephant exhale recordings with a vapour burst at the nostrils (**owner approves**); sniff built from real horse breaths plus a faint human nose-sniff layer with small wisps drawn into the nostrils (**owner: "better"**). No recording of an animal actually sniffing was found. Mechanism: `_voice()` in `src/view/audio.js` sets `breathCue` (1 huff/snort, −1 sniff); `src/main.js` calls `fx.snort(body.nostril, body.snout, cue)` in `src/view/effects.js`. `SNIFF_RHYTHM` in `audiohybrid.js` is repeated as a literal inside `sniff()` because that runs in a Worker: change both together.

Everything else in the live build: rigid hips and whole-body turning, small rigid feet, knee hinge and helper bones, neck carriage, jaw closed at rest, eyes aim correctly in game, head goes into most enclosed spaces, kit is the torch and three flares, interface overhaul, VHS mode toggle on the splash screen (on by default), iPhone silent-switch workaround (owner has not confirmed), rebuilt footsteps.

### 2. Model experiment: published at 03:19, owner has not seen it

The owner: "i dont want to use its animations at all. i want to see our simulation logic driving this model with adaptations where required." Done as asked: the CC0 Patch T-rex (57,914 triangles, 25 bones) is the default body in that page, driven by our simulation by retargeting (each bone's world matrix = our segment frame × inverse of the same frame on the model's bind skeleton × bind matrix, which cancels its mid-stride bind pose). None of its clips are used. Our eyeballs sit in its sockets. `#rex=ours` in the URL, or the "Generated rex body" checkbox in the debug drawer, switches back (a reload is needed).

- New files: `src/view/patchbody.js`, `src/species/patchrex.js` (its proportions), `src/species/active.js` (picks the species from the URL). One sim line changed: the species import in `src/sim/rex.js` line 23.
- Feet: planted soles drift under 1 cm. Download added: about 3.5 MB (2048 px textures).
- Visible defects: front of the foot sinks up to about 16 cm into the ground during heel roll (its one-piece foot); a thin pink line at the back of the closed mouth; its eyes face sideways so from straight ahead only a glint shows; no eyelids, so no blink or squint; head carried very low in a run; a straight pale edge on the belly; hide a bit blotchy under VHS on the low tier.
- **Platform finding:** the sim is not general. It reads species dimensions once at module load, so species cannot be chosen per animal, and it hard-codes tyrannosaur numbers (lying hip height, tail base, neck shape, arm offsets, eye position in its self-model, metatarsus angles). List in `PATCH.md`.
- Not checked: real WebGPU, real frame time, a phone, the mind and navigation with the new proportions, long sessions.
- If the owner likes it: bring it up to date with `rex_rc` (sniff rebuild, behaviour merge), declare capabilities for telemetry, consider toe bones and eyelids.

### 3. Saltline: published at 01:53, owner has not given feedback

The rex reacts to hounds and drones by physical properties. Known faults: hide flat and plasticky in Saltline's dusk light and teeth thick and pale (the hide shader was rewritten for Saltline's classic renderer); Saltline's NPCs only target the player; it wedges among containers (`pack/8`, `drone/8` stand still about 26 s); it uses the older voice set and the pre-merge behaviour. Ten general changes to the animal's code (new `others.js`, hooks in `mind.js`, `attend.js`, `thoughts.js`) are listed in `saltrex/out/BUILD2.md` and should be upstreamed into the main sim.

## To do

Owner's open feedback first:

1. **Breath particles clip through the snout** (owner, 2026-11-15: "realism of the particle effects: they visibly clip through the snout"). He said not to work on it yet; ask or wait for his go. When picked up: spawn outside the snout surface along the nostril's outward direction; the sniff wisps should end at the nostril, not inside the head; check from the player's camera in game.
2. Collect his reactions to the three builds above and route them.
3. Fix the merge's regressions (State 1), starting with the Saltline `quiet/3` stall and the attend failures.
4. Storm atmosphere is "much lighter and less scary" than a day or two before (owner, 2026-11-14): compare sky, fog, exposure and grade against the 2026-11-13 source (`stable/` or store history). Brief in `rex/out/QUEUE.md`.
5. Write the "Direction" amendments below into `claude/MIND_DESIGN.md`, then phase 2: beliefs/boxes as a general mechanism, general senses and actions (rebuild the flare reaction on properties and prove it with a second object), dropped objects as world objects, builder interface, watched demeanour, fed toying. Upstream Saltline's `others.js`. Make species per-animal (the platform finding above).
6. Practices adopted from a thread the owner shared (how another developer directs agents on a browser game): **(a)** judge audio offline from spectrograms and loudness before he hears it (done for huff and sniff; extend to every voice); **(b)** a critic agent that has never seen the code judges filmed play from the player's camera; **(c)** a large dev menu so he can tune sound levels, behaviour timings and body values while playing, captured by the note key.
7. A sniff head-bob (view side, in `src/view/body.js`, noted in `HUFF.md`) and a real animal sniff recording. **The owner has free ElevenLabs credits and offered to run prompts you write**; real libraries first. First candidates: an animal sniff, wet-mud footsteps.
8. Leftovers: Saltline wedges and hide shading; warehouse head probe; barn body-in-wall ticks; thigh front bulge in a run; pale crack on a folded ankle; jaw web sag; hide-and-peek fixation unreliable; distance detail at 16–30 m; start card says "DINO HUNTER" while the page is "Rex Sandbox" (ask); telemetry lead that rex footsteps may fire at speed 0; the unlock counter counts every gesture (harmless).
9. Real-device checks nobody has done: iPhone sound with the silent switch, touch layout, pointer lock inside the claude.ai frame, gamepad, real WebGPU.
10. Platform packaging (classic-material body, minimal world adapter, "what does it make of my map" report); the "keep it off the kids" scenario.

## Direction (owner)

The product is the **intelligent-animal platform**: a procedural body plus a simple legible brain that creators and hackers can drop into their own games, with the rex as the example and the arena as a testbed. The inspiration is Breath of the Wild's multiplicative gameplay. Everything must be general rules over properties and events, never names or scripts, and robust in worlds never considered.

Amendments to `claude/MIND_DESIGN.md` (rev 2) not yet written into it:
- **Looking away is an opening.** It senses `watched`; it should advance when not watched.
- **The mouth-on-player rework is NOT agreed.** Do not build tasting or holding the player. **Taking things from the player is out. Making him drop what he holds, which becomes a world object, is in.**
- **Kit is the torch and three flares per life**; rocks and meat are retired (code kept behind `KIT` in `src/ui.js`; may return as collectibles).
- It does not remember the player after it kills him.
- He does not want to choose between design options: build one coherent design using judgement, phase by phase.
- Later scenario: "keep it off the kids" (constrained player; on death the camera frames the rex and the kids; it goes straight for them; the failure is theirs).

## What the owner cares about

- Core: "what does the rex think of me": a foreign mind sizing you up. Emergent, never scripted. Thoughts are 2–5 plain lower-case words, each traceable to real state. He loves the "Nim Chimpsky" quality: complex yet basic, earnest, flat verdicts on grim outcomes.
- He wants to feel woefully exposed to a giant predator by default, not only after clowning.
- Jurassic Park T. rex is the body archetype. He likes our generated model and is also interested in the Patch model as a base. Peril: sudden loud instant death, no lingering injury, quick restart.
- Sounds must be organic. Real animal recordings worked (lion roar, horse huff); synthesised or voice-made ones read as bangs and cracks. He loves seeing its breath.
- Do not report achievement text or thought lines to him.
- He plays on a gaming laptop (real WebGPU) and an iPhone 14 in mobile Safari, portrait.
- **Messages to him: short.** A few lines; detail only when he asks. Answer promptly even mid-task. Heartbeat replies are a single full stop.
- His attention must not be the bottleneck. He sends observations and T notes after playing; route each at once and keep the written queue.
- He rejected: lingering injury; UI that explains or instruments the animal; a timid animal; ornate thought text; many extra neck bones; voice notes.

## How to work (owner's rules for a Fable-tier director)

- Direct and converse; hand bounded tasks to subagents (Opus for judgement, Sonnet for rote; never Fable) with concise briefs; review lightly; be cost-conscious. The account's five-hour usage limit is real: the session that wrote this hit it with three Opus agents running.
- **Two streams at once as the norm**, a third only when it touches separate files. More overloaded the two-core machine and let regressions through. One agent per file; give a second stream its own copy of the tree.
- **Check-in chain:** while agents run, a self-rescheduling `send_later` every 20 minutes that runs `tools/pulse.sh <notes files>`, resumes any stopped agent by `SendMessage` to its id, reschedules itself, and replies with a single full stop unless something stopped or finished. Put the agents, live version and next steps in each pulse message so a restarted director can pick up. Stop the chain when nothing is running.
- Briefs that work: the owner's words as the acceptance test; exact files allowed; measure before changing; honest lines on what still looks wrong; notes file first, updated often; say plainly what nobody has seen or heard.
- Every publish gets an in-game load check. Subagents cannot always write files named `REPORT.md`.
- Free-licence audio comes from archive.org (Red Library, CC0), Wikimedia Commons (rate-limits) and OpenGameArt; Freesound, Pixabay and Zapsplat are blocked from the machine. Credits live in `dist/audio/CREDITS.md`.

## Parked by the owner

Trust/touch/petting, hand-feeding, the "thorn" scenario, food conditioning, a retrieval objective, a second species, size-relative threat appraisal for other creature sizes.
