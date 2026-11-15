# TUNE2 — closing faults after the tuning pass

Started 2026-11-14 17:58 UTC. Time box 2.5 h (ends ~20:28 UTC).

## Status log
- 17:58 started; reading TUNE.md, COMMIT.md, BODYFIX3.md.
- 18:05 pre-edit copies of src/sim, src/species, test/{commit,saltline,thoughts}.mjs in out/platform/tune2/pre/. Baseline
  `commit.mjs fair --fairness` (6 arena + 3 made-up seeds per script now) running -> out/platform/tune2/before/fair.txt.
  Found: test/commit.mjs `slowwalk` never walked (its movement code sat after a `//` on the same line): "slow walk" deaths so
  far were a person standing still ~15 m off. Added `--hunger h` (start hunger) to the harness. Trace tool:
  out/platform/tune2/trace.mjs. Hunger rise is the game's own (mind.js +1/700 per s), not the harness's.
- 18:20 baseline done (11.7 min); table in before/fair.txt. Tracing calm deaths.
- 18:35 added appraise 'leaving' (steady walk away = not prey; damps H/Hn/weigh/test/shadow, peril -0.45*leaving); harness: slowwalk now walks, backoff backs the way with room. calm1: backoff 2/9 -> 0/9; slowwalk (really walking now) 2/9; still10/still6 2/9 each unchanged.
- 18:27 peril: slow causes (close, hunger, tested, posture, frus, drift) rise at most 0.05 fuse/s (mind cfg.peril.rise); harness slowwalk turns at the fence. calm2: still10 3/9, still6 2/9, slowwalk 2/9, backoff 0/9. Coordinator added: chase stamina/pursuit work, outranks faults 3-6.
- 18:43 chase: rex.js long-scale fatigue (species stamina: 50 s at run speed, 35 s recovery; breath shows it), committed-chase turning (quickTurn: up to 1.1 rad/s, 4.5 m/s^2), no early braking for a moving goal; mind: chase give-up = losing ground flat out for 3 s+ after 4 s to get going, or gap > 60 m (cfg.chase), pounce/peril rush 45 s limit; strike when the predicted gap at jaw time is in reach. commit.mjs: sprint5/12/25, cover12 + CHASES report. chase0 (before): sprint5 0/9, sprint12 1/9; chase1 (fatigue+give-up): 1/9, 3/9.
- 18:48 chase3: bolt answered at once while moving (no coil when already >3 m/s; prowl bolt range 40 m, cfg.chase.boltD), agon chase bursts. sprint5 arena 6/6 dead (foreign 0/3: never gets a look), sprint12 5/6 arena, 1/3 foreign; sprint25 3/6 arena; cover12 0/9. Next: review.mjs guard.
- 19:04 review.mjs: no hips-slide / foot-hanging lines (0). Fault 3 test: arena cover -> barn (6.5 m walls, roof; warehouse put the hider inside it after the arena clamp), start 30,40; hidVis (share of hidden-crouched samples with a clear line from its head) + vanish/peek counts reported. peek2 (6+6 seeds): fixation arena 0/6, foreign 4/6; arena hidVis 0.26-0.81: the animal walks round the barn and finds him (hider tracks 'behind' at 1.6-4 m/s). Behaviour NOT yet changed. Moving to faults 4, 5.
- 19:17 fault 4: cause = leave picked a way out whose line passed the person (5 m in front, hemmed in Saltline's port); the head keeps off people (I.keepOut), so it stood, backed, retried (21 s). Fix: leave scores -25 for a way passing within 8 m of the one it leaves, and if every way does (and it is within 15 m) it does not leave (leave utility 0 for 20 s). Pre-edit tree + this fix alone: opening/5 stall 21 -> 8 s, no hard failures. Current tree saltline (before this fix) already exit 0 (opening/5 7 s).
- 19:26 fault 5: 'one more small thing?' -> 'yet another small thing?'; a kill cue is never rendered as a disregard (it came out as a disregard of the next person under the kill's condition). Rerun showed a new mismatch in active:wanderer ('it run soon?' [seen+ran]): thoughts counted a run it only heard, or saw already under way, as a run it saw; now only runs it watched start count (heard ones kept apart).
- 19:26 verification chain started: out/platform/tune2/verify/run.sh (progress file there).
- 19:28 chain restarted after a syntax slip in thoughts.js (comment swallowed code; fixed, all files pass node --check).

---------------------------------------------------------------------------------------------------------------------------
# Deliverable (numbers: before = out/platform/tune2/before/fair.txt, tree as received; after = out/platform/tune2/verify/)

## Fault 1: calm play
- What the deaths were (traces, out/platform/tune2/trace.mjs, tells.mjs):
  - still10 arena s8 / foreign s8 and still6 arena s3 / foreign s8: the animal itself walked in to 6.5-8 m (nudge, inspect)
    while the person stood; hunger 0.62-0.75, verdict curious (one flipped to food 1 s before). Peril sum mostly `close` (+closeT
    boldness) and `hunger`; `tested` jumps +0.3 x near the moment the verdict turns to food. Visible tells (stare, lower, rumble,
    clap) 4-36 s before the strike; one (still6 s3) went from first warning (rumble at 10 m) to strike in 4.4 s, because the animal
    walked from 10 to 6 m in those seconds.
  - backoff foreign s5/s8: the "backing" person was at the made-up world's fence and slid sideways along it (radial 0.1 m/s); the
    animal shadowed, test-lunged to 8.7 m and the food verdict + nearness did the rest. Backing straight off gave almost nothing
    (`retreat` term -0.35 x near, ~-0.07 at 12 m).
  - slowwalk: the script never walked (its motion code was commented out by a `//` on the same line): those deaths were a person
    standing still ~11-15 m off. Once fixed, the walker stood against the fence (clamped) in 2 runs, same thing.
  - Harness hunger: starts 0.55, rises at the game's own rate (mind.js +1/700 per s, so 0.81 at 180 s); not the harness's ramp.
    The game's default start is 0.3-0.65. Also run at --hunger 0.45 (verify/fair_h045.txt).
- Fix:
  - appraise.js `leaving` (0..1): a steady walk away (>= ~0.8 m/s away from it, not running, under its quick threshold) for
    ~3 s reads as "leaving, not prey"; it lasts ~25 s after, coming on or running ends it in ~1.5 s. It takes 0.3 off
    vulnerability, `leaveDamp` (0.6) of hunger's verdict (H, Hn) and of the weighing, damps test/shadow/appraise/stalk/inspect/
    nudge by 70% and lowers interest; peril gets `-leave x leaving` (0.45) at any distance. Starvation (hunger > 0.88) overrides.
  - peril.js: the slow causes (close, hunger, tested, posture, frus, drift) climb at most `peril.rise` = 0.05 fuse/s, so the
    warnings come in turn (>= ~8 s from the first warning rung to the dead-still moment); fast causes (running, crowding, stones,
    a struggle) act at once; everything falls at once.
  - mind.js `_preyGo`: hunger alone makes a stalk go only after `hungerLead` (8 s) of stalking (its creep and stare on show).
  - test/commit.mjs: slowwalk walks; walkers and backers take the nearest direction with room instead of sliding on the fence.

## Fault 2 and the owner's chase feedback: running from it
- Where the time went (ctrace.mjs, sprint5 arena s5/s13):
  - Fatigue: mind's `c.fatigue` was rex.js `exertion`, a breath measure with a 12 s time constant that saturates after ~4-5 s at
    8 m/s; prowl rush gives up at 0.95, chase at 0.97, pounce at 0.99, and pace drops above 0.7. So every chase ended 6-10 s in,
    usually while gaining (chase0: gap closing 38 -> 17-21 m, "outran", fatigue 0.96-1.00). This was the owner's "runs out of
    steam".
  - Give-up: "losing" counted any gap more than 4-5 m above its best, so the first seconds (gap growing while it accelerates)
    already counted; the peril rush gave up after 6 s.
  - Start: arbitration dithering after a bolt: listen (frozen 1 s) -> chase (accelerating) -> prowl stalk (pace 1.5: it slowed
    down) -> pounce lock (stood still 1 s) -> pounce rush. ~3 s lost and the speed built up thrown away; the gap grew 9 -> 35 m.
    Also: a committed run turned at 0.52 rad/s at any speed, braked for the moving goal at 1.5 m/s^2 (slowing from far away), and
    struck only inside reach - 1 m for a moving target, so it ran alongside at 7 m without striking.
- Fix:
  - rex.js `fatigue`: a long reserve (species `stamina`): at run speed (8 m/s) it empties in 50 s (faster above, nothing under
    ~2.8 m/s), refills over 35 s at a walk; exertion (the breath) is at least 0.85 x fatigue, so it shows. Mind uses it.
  - Committed chase (intent.quickTurn) turns at up to 1.1 rad/s, 4.5 m/s^2 at speed, and brakes for its moving goal no earlier
    than 6 m/s^2 would need. Prowl rush and agonistic chase set quickTurn; chase bursts its first 1.6 s.
  - mind `_losing`: losing counts only while it is going >= 0.85 x run speed, after 4 s to get going, and the gap is growing
    (smoothed over ~1 s); 3 s + 2 x boldness of that ends it, or a gap over 60 m. Pounce and peril rush limit 45 s. Prowl rush
    also ends when it has not seen you for 1.5 s (breaking line of sight works).
  - `_inStrike`: it strikes when the gap it will have in 0.25 s (at its closing rate) is inside reach - 0.4.
  - A bolt is run after at once: a stalk answers a bolt inside 40 m (was 19), and a pounce from an animal already moving
    (> 3 m/s) skips the 1 s coil.
  - Not done: the strike's own lunge (rex.js `_snapStep`) and first-step acceleration were not changed (acceleration 0 -> 7 m/s
    in ~2 s was not the bottleneck once the dithering went). review.mjs: no slides / hanging feet.

## Fault 3: hide-and-peek
- Test fixed first: on our arena the cover is now the barn (6.5 m walls and a roof, taller than its eyes ~4.5-5 m; the warehouse
  was tried but sits at the arena edge, where the bounds clamp put the hider inside it); animal starts at 30,40. Made-up world
  unchanged (the big zorb, 6.5 m walls, roof). The run reports `hidVis` (share of hidden, crouched samples with a clear line from
  its head to his head) and counts of vanish / peek events. 6 seeds on both worlds (`--fseeds 3,5,8,11,13,17`).
- Finding (peek2.txt): even behind cover taller than its eyes, the hider is in plain view 26-81% of his "hidden" time on the
  arena: the animal walks round the 36 m barn faster than the scripted hider (1.6-4 m/s) can keep it between them. So there are
  0-2 vanish events per arena run and fixation 0/6 arena, 4/6 made-up world. Peek deaths 1/12.
- Behaviour NOT changed (time). What it needs: a hider that keeps the cover between them (the test), or hiding inside a
  structure and peeking from its openings; then check the vanish rule (sig.vanish needs `L.moved`, `L.ahead`) against real
  vanishes.

## Fault 4: Saltline opening/5 stall
- Cause: `leave` picked a way out whose straight line ran past the person standing 5 m in front of it in a tight spot of the port;
  the head keeps off people (I.keepOut), so the body stopped dead in front of him, the unstick logic backed it up and it tried
  again (stall 21 s; thoughts "no way through", "no room. back up").
- Fix (mind.js leave): a way out passing within 8 m of the one it leaves scores -25; if every candidate does and it is within
  15 m, it does not leave (leave utility 0 for 20 s) and does something else. On the pre-edit tree with only this fix:
  opening/5 21 s -> 8 s, no hard failures.

## Fault 5: thoughts
- "one more small thing?" contained a number word: now "yet another small thing?".
- "new small thing. not now" under the kill's condition: the kill cue (queued at the kill, kept through `forget()`) was rendered
  as a disregard of whoever was in focus next (the respawned newcomer). A kill is now never rendered as a disregard.
- New mismatch after the behaviour changes (active:wanderer, "it run soon?" [seen+ran]): thoughts.js counted a run it only
  heard, or saw already under way, toward "it has run twice". Now only runs it watched start count; heard ones kept apart.

## Fault 6: gaze: not worked on (see verify/gaze.txt for the number on this tree).
- 19:34 chain re-ordered (fair at ~20 s/run would take ~48 min): saltline, review, review mind, thoughts, fair (chase scripts capped at 60 s), then the rest. Partial first fair kept as verify/fair_partial_killed.txt.

## Species tunables (src/species/tyrannosaurus.js; engine defaults and meanings in mind.js MIND_DEFAULT / rex.js STAM_DEFAULT)
- New `stamina: { full 50, free 0.12, recover 35, restV 3, turn 1.1, turnAcc 4.5, brake 6 }` (rex.js long fatigue, committed-chase
  turning and braking).
- `mind.prey`: new hungerLead 8, leaveRise 3, leaveT 25, leaveDamp 0.6.
- New `mind.chase: { losingAfter 4, flat 0.85, giveUp 3, lostD 60, maxT 45, boltD 40 }`.
- New `mind.peril: { rise 0.05, leave 0.45 }`.
- Nothing existing changed in value.

## Tests changed
- test/commit.mjs: slowwalk really walks (code was commented out); walkers/backers take the nearest way with room instead of
  sliding on the fence (`roomy`); `--hunger h` start hunger; new FAIR scripts sprint5, sprint12, sprint25 (stand that far from its
  snout, sprint straight away once it has looked 4 s) and cover12 (12 m off, ~4 m from a way in its body cannot pass: the culvert;
  the small zorb's door), capped at 60 s in --fairness; CHASES report (duration, peak speed, gap each second, why it ended);
  hide-and-peek cover on our arena is the barn; hidVis / vanish / peek counts.
- Scratch tools (not tests): out/platform/tune2/trace.mjs, tells.mjs, ctrace.mjs.

## Files changed
src/sim/appraise.js, src/sim/peril.js, src/sim/mind.js, src/sim/rex.js, src/sim/thoughts.js, src/species/tyrannosaurus.js,
test/commit.mjs. Also fixed in mind.js `_ctx`: `c.via`/`c.gait` were never set (commented out after a `//`). Pre-edit copies:
out/platform/tune2/pre/. Not changed: view/*, IDX/LEG/PS, attend.js, nav.js, arena.js.

## Coordinator additions (owner play-testing)
### Jaw hanging half open (rex.js, mind.js)
- Causes (out/skel/JAW.md): display posture added a constant 0.2 x display (11.5 deg) for the whole display, growl held 0.12,
  resting jaw 0.03, panting 0.12 x exertion at any exertion; mind's display utility base 0.15 within 24 m.
- Fix: display posture 0.05 (agitation 0.03 -> 0.01): the mouth opens with the display's own acts (growl, snap, roar, which have
  their own shaped openings) and is nearly shut between; growl 0.07 x its envelope (opens and closes with the sound); rest
  0.008; panting 0.14 x max(0, exertion - 0.5) x breath (only after real exertion, opens with each breath, shut between);
  display base 0.15 -> 0.05. Roar, snap, strike, seize/feeding untouched.
- Note: the fairness run in verify/fair.txt was started 1 minute before the display-base change (0.15 -> 0.05) and the jaw edits
  (the jaw has no effect on the simulation; the display base does, slightly).
### Eyes trailing the player (rex.js only)
- `sim.fix` (the Vector3 the view holds, main.js:82) is now the eyes' target; the head's own fixation (held, pursued weakly,
  jumping) moved to `sim.hfix`, which aims the head as before. On the player, or anything its look is locked on, `fix` is set to
  where the target is now (a person: his eye height) whenever it is more than 0.7 deg off, or at each head refixation: small
  saccade-like steps, so the stare stays on him while the head lags. Otherwise `fix` follows `hfix`.
- 19:56 full fair too slow (an outside headless-browser job, out/skel/legdeform/pagecheck.py, takes about half the CPU); killed; run2.sh: jaw, eyes, fair on the not-yet-measured scripts (4+2 seeds), review mind, gaze.
- Jaw numbers (out/skel/jaw/measure.mjs, 120 s; share of ticks with the jaw at 8-25 deg; bins <3 / 3-10 / 10-20 / >20 deg):
  | run | before 8-25 | after 8-25 | before <3 | after <3 | mean deg before -> after |
  |---|---|---|---|---|---|
  | alone s3 / s11 | 0 / 0 | 0 / 0 | 78.1 / 84.4% | 86.9 / 91.2% | 2.8 / 2.7 -> 1.0 / 0.8 |
  | person still at 12 m s3 / s11 | 0.7 / 21.7% | 0.6 / 1.2% | 90.1 / 36.3% | 98.8 / 96.8% | 2.1 / 6.0 -> 0.7 / 1.8 |
  | person walking about s3 / s11 | 15.0 / 9.0% | 0 / 0.2% | 73.9 / 85.7% | 81.1 / 97.8% | 4.5 / 4.1 -> 1.5 / 0.7 |
  | chase s3 / s11 | 4.3 / 4.5% | 1.1 / 1.4% | 64.9 / 78.5% | 93.3 / 93.8% | 3.3 / 3.0 -> 1.0 / 1.0 |
  Part of the drop is less displaying (display base 0.05); what remains mid-open is startle, strike, snap, yawn (acts).
  Before = out/platform/tune2/jaw_before.txt (this tree before the jaw edits; identical to JAW.md's table), after =
  verify/jaw.txt.
- Eyes (out/platform/tune2/eyes.mjs: a person walking about 15-45 m off, ticks with its attention on him; angle from its head
  between where the eyes aim and his eyes): eyes p50 0.40 / 0.37, p95 0.88 / 0.72, max 1.34 / 0.89 deg (seeds 3 / 11); the head's
  fixation, which is what the eyes followed before: p50 1.05 / 0.78, p95 2.42 / 1.40, max 3.12 / 1.54 deg. Not checked in
  the browser (no view run).

## Results: before / after (`commit.mjs --fairness`; before = before/fair.txt, 6 arena + 3 made-up seeds; after: calm scripts
## = verify/fair_partial_killed.txt (6+3, the final tree minus the jaw/eye/display-base edits; backoff 7 of 9 runs finished),
## the rest = verify/fair_rest.txt (4+2 seeds, final tree minus the display-base change, CPU shared); chase baseline = chase0.txt)
| script | before | after | note |
|---|---|---|---|
| still10 (stands, never reacts) | 2/9 22% | 3/9 33% | leads 9.6-25.8 s; it walked in to 6.5-8 m itself |
| still6 | 2/9 22% | 1/9 11% | lead 9.3 s |
| slowwalk (now really walks) | 3/9 33% (was standing) | 1/9 11% | |
| backoff (backs off at a tell) | 2/9 22% | 0/7 0% | target met |
| dart | 8/9 89% | 6/6 100% | lead median 17 s (min 10.8) |
| dartcalm | 6/9 67% | 3/6 50% | calm called off 19/24 (rushed 2) |
| hop | 9/9 | 6/6 | lead median 31 s |
| peek | 3/9 | 1/12 (new cover, 6+6 seeds) | fixation arena 0/6, made-up 4/6 |
| flee (from ~25 m) | 0/6 | 1/4 | |
| run5 (walks in to 5 m, sprints) | 2/9 22% | 4/6 67% | target > 50%: met |
| rocks | 6/9 | 4/6 | |
| walk38 (opening, game walk) | 0/9 | 0/6 | |
| sprint5 (open, 6.2 m/s) | 0/9 | 3/6 (arena 3/4; made-up 0/2: it never looked at him, so he never ran) | |
| sprint12 | 1/9 | 4/6 (arena 3/4, made-up 1/2) | |
| sprint25 | 0/9 | 3/6 arena, 0/3 made-up (chase3.txt) | a big head start is not safe in the open |
| cover12 (into a way in its body cannot pass) | 0/9 | 0/6 | survival, as wanted |
- Chases (CHASES lines): before, every chase ended 6-10 s in at fatigue 0.96-1.00, mostly while gaining. After: kills at 4-16 s
  into the chase; chases that fail end at "pause"/"search"/"besiege" after a near miss or losing sight, fatigue 0.1-0.3; peak
  speed 9.6-10.5 m/s. After a failed chase it keeps at him (search, ambush, besiege, a second chase; e.g. run5 s8: second chase,
  sprint12 s8: five chases in 60 s).
- Calm-play target (< 10% at 10 m or more): met for backing off at a tell (0/7) and nearly for a slow walk at distance (1/9);
  not for standing still and never reacting (still10 3/9): the animal walks in to 6-8 m, its hunger reaches 0.66-0.75 and it
  takes him after 10-26 s of tells. By the owner's rule (intent shown long enough, backing away would have worked) I left those.
  Not run at the game's lower default hunger (--hunger 0.45 is in the harness; no time).

## Verification (out/platform/tune2/verify/; progress file has exit codes and times)
- saltline.mjs: exit 0, no hard failures; opening/5 stall 7 s (was 21 s); deaths per script: opening 0/0/0, hungry 0/0/0,
  runner 5/7/7, shed 0, door 1/0, crouch 0, noise 0, quiet 0.
- thoughts.mjs all 3 --quiet: 0 problems (37 runs, 1364 thoughts).
- review.mjs: exit 0, no slides or hanging feet. review.mjs mind: exit 0, but ONE tick "hips slide with no step" (just past the
  1.0 m tolerance, mind seed 7 at 53.6 s; repeated after the jaw/eye edits). Must be 0: NOT MET. Traced (out/platform/tune2/
  slide7.mjs): the snap at the end of a bluff charge lunges the hips (ux,uz ~1 m/s) over two planted feet while it brakes from
  2.5 m/s; the snap/bluff code is unchanged, the encounter was re-routed into it. Not fixed (time).
- commit.mjs fair --fairness: run in parts (see Results); the single full run did not fit in the time box with the CPU shared.
- gaze.mjs: exit 0; beyond the neck's reach while attending you 1.15% (was ~1.6%; target ~1%), > 60 deg off 3.7%, 3 unreported
  episodes > 1.5 s. Not worked on directly: the eye/jaw and chase edits moved it.
- NOT RUN (time): platform.mjs, stuckopen.mjs, attend.mjs, peril.mjs 6, predator.mjs matrix, commit.mjs all table, --hunger 0.45,
  smoke.mjs --force / --full. The smoke baseline was NOT replaced (not everything above holds).

## Unfinished and unverified
- review mind: one slide tick (above).
- Hide-and-peek behaviour not made reliable; only the test was fixed (section Fault 3).
- Gaze (fault 6) not worked on; 1.15% now.
- Standing-still calm play still dies 1/9-3/9 over 3 minutes as hunger climbs to ~0.8 (by design reading of the owner's rule).
- sprint5 on the made-up world never starts (the animal never looks at him for 4 s); the cover12 runs prove cover works but
  cover was only 4 m away.
- The strike lunge and first-step acceleration were not changed; kills come from the chase now going on and the predictive strike.
- Fairness after-numbers are from runs taken before the display-utility base change (0.15 -> 0.05) and the jaw/eye edits.
- An outside headless-browser job (out/skel/legdeform/pagecheck.py, not mine) was using about half the CPU from 19:53.

- 20:18 stopped (time box). Tree works at this point: all src files pass node --check; saltline, thoughts, review, gaze exit 0.
