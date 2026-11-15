# COMMIT: commitment and prey fixation in the mind

## 1. The arbitration as found (line numbers of the tree before this work)
- Decisions run at 10 Hz (`mind.js:2131`). Each decision tick an if/else cascade (`mind.js:2142-2214`) takes the FIRST matching
  interrupt, and most branches either call `_choose` (a full re-score of every behaviour) or `_start` a behaviour directly.
- `_choose` (`mind.js:739-861`) re-derives ~25 utilities from scratch out of moods that drift every tick, adds Gumbel noise
  (temperature 0.18-0.38, `:847,853`), +0.25 for the current behaviour (`:852`) and -0.22 for each use among the last four
  (`:851`). There is no goal above the behaviour: "investigate the small thing" is spread over watch / stalk / circle / inspect /
  display / bluff / feign / appraise / test, and the recency penalty actively pushes it from one to the next (A-B-C-A cycling).
- Every behaviour carries a lognormal timer (watch 5-13 s, inspect 10, stalk 16, circle 14, display 7, appraise 8-15; `:1024-1075`);
  when it runs out (`:1706`) the next pick is a fresh noisy re-roll (`:2209`) with nothing carried over except +0.25 stickiness
  for a behaviour that has just ended (none). So it re-decides what it is about every ~7 s (baseline mean dwell 6-9 s on people).
- Reasons that re-roll mid-task, each with the same weight as a real event: a new object noticed (`:2166-2168`, any thrown meat
  or flare; stalk / watch / inspect / appraise / circle / shadow are not in the `busy` list, so a lure while it is engaged with you
  forces a full re-score in which `feed` = 0.3 + (0.25 + 1.5 hunger) sal usually wins: baseline lure pulled in 0.1 s, kept 10-60 s);
  herd in view (`:2169`, 3 % per tick); thunder; every stone hit (`:2159`); sight lost (`:2210`); seen while searching (`:2203,2213`);
  you running (`:2201,2205`); and a random reconsider (`:2212`, 0.2-0.6 % per tick, i.e. every 17-50 s).
- Re-sighting (`:2175-2179`) restarts it in `watch` or `listen` 55-85 % of the time whatever it was doing, and losing sight
  (`:352`, after 0.8-2.5 s) re-rolls into the unseen set (search / stare / ambush / listen / leave): hide-and-peek toggles the
  behaviour at every peek (baseline peek s5: 26 behaviours in 150 s, search/listen/besiege/watch interleaved).
- Unseen and hit: `_start('search')` per stone (`:2163`); with intermittent sight that gives the baseline rocks s5 run of
  `search0 listen0 search0 ...` (27 torn episodes).
- The chase reflex `_preyDrive` (`:110-122`) only sees perceived speed > 4.2 m/s, which is integrated over 0.9 s (`:674`), and
  drains at 1.2/s: half-second darts never register (baseline pd max 0-0.16 on every dart script, 0 pounces).
- What makes you food (`appraise.js:138-145`) is hunger-gated (`need = sstep(0.45, 0.95, hunger)` multiplies everything),
  nothing about darting or hiding counts, and easier food subtracts 0.7 alt need (`:143`): meat on the ground always wins.
- Attention (`attend.js:18,96`): watch / stalk / inspect / appraise absorb only 0.3, so anything over ~0.6 salience
  'interrupts' and moves the focus, independently of what the mind decided.
- Net: utilities re-scored at many unrelated moments, timers that expire every few seconds, a recency term that favours
  switching, no priority between a thrown lump of meat and a blow to the head, and no reflex that says "small, quick, hides" =
  prey. Dithering is the expected output.


## 2. Design (written before coding)
One idea per principle, all numbers in the species file (`mind.commit`, `mind.prey`) with engine defaults in mind.js.
1. **A goal above the behaviour.** `mind.goal = { mode, t0, prog, best }` where mode is what an observer would call its intent:
   `pred` / `curious` / `agon` (about you, seen), `seek` (about you, unseen), `food`, `light`, `herd`, `own` (its own agenda: roam,
   pause, leave, sniff). Behaviours are tactics inside a mode. In `_choose` every candidate of the committed mode gets
   `margin = hold * exp(-(t - prog) / bore) + fixHold * arousal` (other modes about the same target get half of it). Progress
   (closing on the target, sighting it again, an outcome of a test or ritual, eating) resets the clock, so it keeps at what
   is working and gets bored on a tens-of-seconds scale of what is not. The recency penalty no longer pushes it off its mode.
2. **Graded interrupts.** Threat-class events break commitment for that decision (`_open`): a blow felt, a loud sound close
   (salience over `breakSal`), fire close, the chase reflex, peril. Mild novelty (an object landing, a re-sighting, a quiet
   sound, the herd in view, a random reconsider) is still weighed, but against the margin, and gets the glance attention already
   gives. A re-sighting while committed to you no longer restarts it in watch/listen.
3. **Prey arousal, a reflex separate from hunger** (`appraise.js`, `ap.arousal`). From what it actually sees of you each tick
   (positions over 0.3 s, not the 0.9 s smoothed speed): burst onsets and sharp turns at speed (darting), moving off fast
   (fleeing), going out of sight close by (vanishing), each scaled by how small you are against its own height; calm, slow or
   still in view drains it (~20 s), out of sight it fades slowly (~60 s) while it still believes where you are. Fixed above
   `on`, released below `off`. Effects: it adds to your worth as food without the hunger gate and cancels the "easier food"
   discount (so you become food: verdict `food`, prowl); it raises the commitment margin (lures fail); attention absorbs more
   (thoughts stay on you); unseen, it watches the spot / goes round (ambush, stare, low search) instead of leaving.
4. **The look and the rush.** Fixated stalking is the existing prowl (low, slow, freezing when watched, eyes locked); I add a
   `set` phase before the rush: a second of dead stillness (the peril `still` tell), then the rush when it is within its rush
   range and squared up to you. Strong signatures still win: anything that beats the margin becomes the new goal.
5. **Pests and bores** come from the same rules: hopping and darting are a prey signature (arousal, then a strike in range);
   a still, calm person drains arousal, gives no progress, and the curious/agonistic margin decays until its own agenda wins,
   which is then itself committed (getting it back takes more than the margin).
6. **Own agenda**: roam / pause / leave are one committed mode, so "it ignores you" lasts.
No special cases for rocks, jumping, meat or the player: everything reads the target's perceived motion, size and visibility.

## 3. What was built
- **Goal layer** (`mind.js`: `MODE_OF`, `goal`, `_margin`, `_open`, `_progress`, `_goalStep`). Every behaviour belongs to a mode
  (pred, curious, agon, seek: about you; food, light, herd, own). `_start` sets `goal` when the mode changes (the peril's
  stillness, reason `still`, is not a change of mind). `_choose` adds the margin to every option of the committed mode (half of
  it to other modes about the same target) and drops most of the recency penalty inside it. Progress: closer to the target than
  its best by `progressD`, re-sighting, an appraisal outcome (`appraise.outcome` calls `_progress`), eating.
- **Graded interrupts** (`step` cascade): opened at once (margin 0 for that choice): a blow that still makes it flinch (the
  flinch already habituates with `steel`), the chase reflex, fire close (`onFire`), a verdict of threat, the prey reflex setting
  in (`alarm` -> immediate re-choice), and a sound over `breakSal`, which now also interrupts while it can see you (attention
  glance at interrupt level, re-choice, and if it is far round behind, the body turns to it for the glance). Mild: a re-sighting
  while it is set on you no longer restarts it in watch/listen; a mild sound while committed is only the orienting glance; a
  habituated blow while you are out of sight is weighed like news instead of forcing a search (this was the rocks dithering).
- **Prey arousal** (`appraise.js` `_signature`, `arousal`, `fixed`, `sig`): darting (burst onsets and sharp turns over 0.3 s of
  what it sees), fleeing, vanishing close in front of it, reappearing where it vanished; scaled by smallness against its own
  head height and damped by fear; drains when you are calm in view, fades slowly out of sight. It adds `reflexW * arousal` to
  your worth as food (no hunger gate), cancels the easier-food discount in proportion, opens the H gate, adds `pull * arousal`
  to prowl when fixed, and out of sight boosts ambush / stare / low search and damps leave / roam.
- **The look and the rush**: prowl gets a `set` phase (dead still, squared up, peril `still` tell, thoughts stop) before the
  rush when within `rushD`; a bolt is answered at once. Aroused searches go round low. Attention absorbs `absorb * arousal` more
  while the focus is you (`attend.js _absorb`), so peripheral things need more to take the head.
- **Thoughts**: three new cues in the existing voice, each on an appraisal flag: `fixed` (ap:fixed), `dart` (ap:quickNow),
  `hidWait` (ap:hidAroused).
- Nothing reads the map, rocks, meat, jumping or "the player": all of it reads the target's perceived positions, height and
  visibility and the mind's own state; `a.size` (height) is honoured if a world supplies it.

## 4. Species fields added (`src/species/tyrannosaurus.js` `mind`, defaults and meanings in `mind.js MIND_DEFAULT`)
`commit: { hold 0.6, bore 25 s, sameTarget 0.5, fixHold 0.9, progressD 1.5 m, breakSal 0.5 }`
`prey: { quickV 3.2 m/s, dart 0.11, flee 0.22/s, vanish 0.16, vanishD 40 m, peek 0.14, small 0.7, calmT 20 s, goneT 60 s,
on 0.45, off 0.25, reflexW 0.7, absorb 0.5, pull 0.9, rushD 13 m, setT [0.6, 1.1] s }`

## 5. Files changed
- `src/sim/mind.js`, `src/sim/appraise.js`, `src/sim/attend.js`, `src/sim/thoughts.js`, `src/species/tyrannosaurus.js` (`mind` block only)
- also in mind.js, outside the brief's topic: a null guard in `_start('feed')` for a pre-existing crash (section 7)
- `test/commit.mjs` (new). Not changed: `afford.js`, `peril.js`, `rex.js`, `nav.js`, `src/view/*`, other tests.

## 6. Measurement (`test/commit.mjs`) and results
Scripts (person at real speeds, footstep noises): still (25 m, in the open), walkpast (1.3 m/s to and fro ~20 m off), dart
(0.3-0.7 s sprints, 1-2 s pauses, kept at 10-15 m), flee (sprints away inside 40 m), peek (behind a large box; every 4-7 s steps
out sideways until there is a clear line to its head, ~2 s, back), hidden (behind it, crouched), rocks (a stone every 4 s,
kept at 10-15 m), hop (hops at 2.2 Hz, 3.2 m/s, 8-14 m), lure (dart + meat thrown 10 m to his side while it is fixated on him
(engaged, in the old tree)), flare (same with a flare 12 m beside the animal), food_dart (a carcass 12 m in front of it, dart),
herd_dart (the herd 40 m off, dart), threat (dart; a crash 7 m behind it at 22 s and 38 s, a flare onto the ground 4 m from it at
30 s). Arena seeds 3 and 5, the made-up world seed 3 (8 scripts), 150 s, hunger 0.55 rising (0.7 for food/herd). A run ends
at the first death. BEFORE = the pristine tree (`/tmp/cw/before_tree`, src as found) with the same harness.
Columns: mode changes/min; mode dwell (time-weighted: how long the goal it is on at a random moment lasts); vacillations (back
to a mode left < 15 s before); torn = vacillations + journeys abandoned within 8 s with < 1.5 m progress; agree = share of
samples (focus not idle) with gaze on the focus, body within 0.8 rad of it and the newest thought (< 8 s) about it or itself;
fixed s; strikes (peril); first death s. Full tables: `out/platform/commit/report_final.txt`, raw: `BEFORE.json`, `FINAL.json`.

| script | modes/min | mode dwell s | vacill. | torn | agree | fixed s | strikes | deaths (t) | first commitment |
|---|---|---|---|---|---|---|---|---|---|
| still | 4.1 -> 3.2 | 21 -> 27 | 1.3 -> 1.3 | 1.3 -> 1.7 | .68 -> .71 | 0 -> 0 | 3.3 -> 0 | 1/3 -> 0/3 | inspect/stalk (same) |
| walkpast | 3.4 -> 2.0 | 26 -> 47 | 1 -> 1 | 1 -> 1.5 | .60 -> .82 | 0 -> 0 | 0 | 0/2 | stalk (same) |
| dart | 5.5 -> 4.8 | 19 -> 20 | 5 -> 0.3 | 5.3 -> 1 | .69 -> .84 | 0 -> 25 | 0 -> 1 | 0/3 -> 3/3 (38 s) | inspect/stalk -> prowl @10-12 s |
| flee | 4.0 -> 2.2 | 21 -> 56 | 3 -> 0.5 | 3 -> 2 | .92 -> .98 | 0 -> 9 | 0 | 0/2 | prowl @2 s; roam (lost him) |
| peek | 1.8 -> 1.9 | 49 -> 56 | 0.7 -> 1 | 3 -> 4 | .41 -> .42 | 0 -> 23 | 0.3 | 1/3 -> 1/3 | fixed + prowl in 1 of 2 runs where it saw him |
| hidden | 0.9 -> 0.9 | 83 -> 81 | 0.3 -> 0.7 | 3.3 -> 1.3 | .18 -> .37 | 0 | 0 | 0/3 | searches/waits the whole run (both) |
| rocks | 2.7 -> 2.1 | 65 -> 64 | 0.3 -> 0 | 7.7 -> 1.7 | .29 -> .42 | 0 | 1.7 -> 0.7 | 2/3 -> 2/3 (43 s) | warn, butt, bite (both) |
| hop | 5.1 -> 2.5 | 20 -> 55 | 3.3 -> 0.3 | 3.7 -> 2.7 | .65 -> .60 | 0 -> 77 | 0 -> 0.7 | 0/3 -> 2/3 (56 s) | inspect -> prowl |
| lure | 1.6 -> 3.8 | 106 -> 23 | 0.7 -> 0 | 0.7 -> 0.3 | .18 -> .74 | 0 -> 26 | 0 -> 1 | 0/3 -> 3/3 (39 s) | feed (lured) -> prowl |
| flare | 6.2 -> 3.1 | 15 -> 24 | 4 -> 0 | 5.5 -> 0 | .43 -> .94 | 0 -> 27 | 0 -> 1 | 0/2 -> 2/2 | investigate -> prowl |
| food_dart | 1.2 -> 6.7 | 112 -> 35 | 1 -> 0.5 | 1.5 -> 1.5 | .06 -> .36 | 0 -> 42 | 0 -> 1 | 0/2 -> 2/2 (55 s) | feed -> prowl @9 s, @74 s |
| herd_dart | 4.4 -> 2.2 | 33 -> 31 | 1 -> 0 | 3 -> 2 | .59 -> .58 | 0 -> 30 | 1 -> 1 | 2/2 -> 2/2 (62 -> 42 s) | herd hunt / inspect -> prowl |
| threat | 5.6 -> 3.7 | 15 -> 23 | 4.3 -> 0.3 | 5 -> 1 | .43 -> .70 | 0 -> 30 | 0.7 -> 1.3 | 2/3 -> 3/3 (42 s) | stalk -> prowl |
| **all** | **3.5 -> 3.0** | **45 -> 42** | **2.0 -> 0.47** | **3.5 -> 1.6** | **.46 -> .64** | | | 8/34 -> 20/34 | |

Lures. Meat while it was set on him: BEFORE (engaged) the first lure pulled it in 2 of 3 runs, at once (0.1 s), for 10-18 s
(feeding until the meat was gone); FINAL (fixated) 0 of 5 lures pulled it. Flare 12 m beside it: BEFORE pulled at once for
21-22 s (3 of 3); FINAL 0 of 2. A flare landing 4 m from it while it stalked (fire close) broke the stalk at once (0 s, 1 of 1;
the other probes fell while it held him in its jaws, where nothing breaks in, by design). Crash 7 m behind: the head snaps
round at 0.1 s in both trees (orient gesture) and turns 1.6-2.4 of 3.0 rad toward it within 6 s (BEFORE 0.1-1.8); the behaviour
was re-weighed at once but the stalk usually won again (the sound has nothing to be done about it). Mean dwell per BEHAVIOUR
fell (10.9 -> 8.1 s) because prowl / set / rush / seize are short tactics inside one goal; switches/min rose for the same reason.
Mode dwell over all scripts is about level because BEFORE's longest dwells were the lured or fed animal ignoring the person
(lure 106 s, food_dart 112 s); on every script about the person it went up.

Targets I set from the baseline, and where they landed: vacillation (the owner's "torn") 2.0 -> <= 0.5: 0.47 met. Torn incl.
abandoned journeys 3.5 -> <= 1.5: 1.6, nearly (the remainder is prowl <-> search when a peeker goes out of sight and journeys
cut short by a strike). Agreement 0.46 -> >= 0.6: 0.64 met. Fixation + stalk on darting: 3/3 (dart), with free food 2/2, with
the herd 2/2, hopping 3/3 fixed (2 strikes), met; hide-and-peek: 1 of the 2 runs in which it ever saw the peeker, NOT met
("most seeds"). Calm stillness: 0 s fixed in 3/3, met (it still sizes a still person up when hungry, appraise/test, as before).
Cheap lures on a fixated animal: 0/5, met; strong signature (fire close) takes it: met; a far flare does not (12 m: not strong
enough by the rule; arguably should). Rocks: strike in 2/3 (as before) and the third settles into warn/butt/stand-over without
the old search/listen ping-pong (torn 7.7 -> 1.7), met. Threat within ~1 s: head 0.1 s, fire close 0 s, met; a loud sound
re-weighs but does not by itself make it drop a stalk.

## 7. Must-hold tests (before = pristine copy `/tmp/cw/before_tree`; after = snapshot of the final src; raw in `out/platform/commit/{before,after,after2}/`)
- `platform.mjs`: all pass, before and after (only incidental numbers differ: 24 -> 19 thoughts kept, 11 -> 10 roam goals).
- `stuckopen.mjs`: 0 in open ground (after; 8 stuck/gave-up thoughts, all against something solid).
- `attend.mjs`: non-focus share 22.0 % -> 21.1 % (445 -> 438 thoughts; no response 12 -> 11; violations 12 -> 11). Better, as
  intended: an aroused animal's attention absorbs more, so fewer thoughts stray from the focus.
- `thoughts.mjs all 3 --quiet`: problems 2 -> 6 on the first after-run, all five new ones the same new phrasing of the `fixed`
  cue (the checker reads a word in it as a number); rephrased and re-run on the final src (after2): problems
  0, exit 0 (before: 2 problems, exit 1). `stim:meat` CRASHED in the before tree and the first after-run (pre-existing: `_start('feed')` from `trail` when the meat was gone, focus null);
  guarded in `_start` (after2: no crash). Repeat rate 3.7 % -> 5.1 %, distinct texts 520 -> 488: the fixated animal says fewer, more on-target things.
- `peril.mjs 6`: 4 FAIL -> 2 FAIL. Now passing: "rocks reliably end in death within 5 min" (67 -> 83 %) and "at an unpredictable
  time" (rocks median 233 -> 58 s, 10-90 % 33-243 s): intended, a pest that keeps provoking is dealt with sooner, through the
  same warn / still / strike path. Still failing: "running from close is deadlier than standing" (run5 0 -> 17 %, stand3 33 ->
  17 %: a tie, so still FAIL; moved the intended way) and the strike timing inside reach (267/225/217 ms, unchanged: motion).
  runpast4 deaths 3/6 -> 6/6 (sprinting across its front is now a dart/flee signature: intended). "No kill without the
  stillness tell" 20/20 -> 24/24 (the prowl `set` phase is a stillness tell). stand3 / stand8 / crouch / far20 / attentive / hide /
  torch about the same.
- `predator.mjs matrix`: 1 FAIL -> 4 FAIL. New failures: "fed: mostly curious, almost never predatory" and "fed: never takes
  you" (seed 3 fed: predatory 0 -> 14 %, one prowl + seize, tasted and spat out) and "variety: hungry/starving end in both food
  and not-food" (no run ended on `food`). The scripted person there bolts from a fast rush about half the time, which is a flee
  signature; a fed animal now chases and grabs what bolts, then spits it out. That is the requested reflex separate from hunger
  (the old pounce already did this for sustained running), so the first two shifts are intended; the checks were written for a
  purely hunger-gated appraisal and need the owner's decision. The variety change is a side effect (runs end with the person
  killed, so the last verdict is often the newcomer's `curious`), not intended, not chased.
- `saltline.mjs`: exit 1 -> exit 0 (before: crouch/3 body in box x2 at 28.8 s; after: the same scenario takes another course, so
  this is luck, not a fix). Deaths per run rose in `opening` (0,0,1 -> 1,1,1, first attack 25 -> 13-16 s) and `hungry`
  (1,1,1 -> 1,2,2), fell in `runner` (2,2,3 -> 1,0,2) and `door` (1,1 -> 0,0). The opening rise is the reflex at work on a person
  who moves about in front of it: intended in kind; whether that is too soon for a first meeting is a tuning call (see 8).
- `commit.mjs` is new (section 6).

## 8. Unfinished, unverified, and judgement calls for the owner
- **Lethality.** A person darting at 10-15 m is now taken in 24-56 s (all seeds), hopping in ~56 s (2 of 3). The build-up is
  readable (fixation stare and thoughts, low creep, a 0.6-1.1 s dead-still `set`, then the rush) but fast. `prey.dart`, `prey.on`,
  `prey.rushD` and `setT` in the species file are the dials. Saltline's opening now ends in a death in 3/3 runs.
- **Hide-and-peek** reaches fixation and a stalk in only 1 of the 2 runs in which it ever saw the peeker (target was "most").
  It does keep at the person throughout (waits at the spot, goes round low), never wanders off. Not tuned further for time.
- **A loud sound** re-weighs everything and turns head (and body, if far round) to it at once, but with nothing to act on it
  usually goes back to the stalk; a far flare (12 m) does not pull a fixated animal. Both follow from the rule (the challenger
  must beat the margin); whether a crash should break a stalk outright is the owner's call (`commit.breakSal` only decides what
  counts as loud).
- **Second creature / distraction.** Measured only with the herd (it ignores the herd once fixated on the person). The mind
  still keeps one picture of "the small thing"; a second person is taken for the same one, so the paddock-scene rule (become
  the more compelling target) is implemented for objects and the herd but cannot be tested between two people yet.
- `predator.mjs matrix` fed checks and `peril.mjs` "running from close is deadlier" need the owner's reading (section 7).
- Threat probes mostly fell while it held the person in its jaws (nothing breaks in there, by design), so the probe has few samples.
- Thoughts: new cue phrasings were checked only by `thoughts.mjs` (conditions and word rules), not read in context by a person.
- Not run: `review.mjs`, `score.mjs`, `gaze.mjs`, `active.mjs`, `siege.mjs`; motion untouched, but gaze/attention shifts would
  show in `gaze.mjs`.
- The after-snapshot for the must-hold tests differs from the final src in two places made after it: the rephrased thought
  and the `feed` null guard. Neither changes the simulation (thoughts use their own random stream; the guard only acts where
  the old code crashed); `thoughts.mjs` was re-run on the final src (after2).
- Scratch copies used (not part of the deliverable): `/tmp/cw/before_tree` (pristine src), `/tmp/cw/after_tree`, `/tmp/cw/after2_tree`.

Status log (updated after every step; newest last)
- 14:00 started; reading code.
- 14:03 read mind.js (_choose, step interrupt cascade, _run), appraise.js, attend.js, peril.js, species; writing test/commit.mjs next.
- 14:06 test/commit.mjs written (13 scripts, arena seeds 3,5 + foreign seed 3, 150 s); baseline running -> out/platform/commit/baseline.txt
- 14:13 baseline commit.mjs done (out/platform/commit/baseline.{txt,json}); must-hold "before" tests running -> out/platform/commit/before/
- 14:18 step A (goal + margin + graded interrupts) and B (prey arousal) coded; before-tests rerunning from a pristine copy /tmp/cw/before_tree (first runner would have picked up edited src)
- 14:45 before-tests done (out/platform/commit/before/); running commit.mjs on A+B (v1)
- 14:53 v1 measured (out/platform/commit/v1.*): lures resisted, dart/hop -> food verdict + prowl + kills; but food_dart unchanged, loud sounds not interrupting when it sees you, rocks still vacillate. v2 = alarm re-choice (fire/threat/fixation onset), loud sound interrupt while seen, blow opens only if it flinched, reflex pull on prowl. Harness now stops at first death; baseline re-measured from pristine tree as base2
- 15:04 v2 measured: fixation + prowl on dart/hop/food/herd/lure in all seeds; lures mostly resisted; rocks still vacillate (unseen hit bypass), threat head-turn weak. v3: unseen hit weighed unless it flinched; interrupting sound far round turns the body; harness merges seek/peril-stillness into the goal they serve, dwell time-weighted
- 15:13 v3 measured (rocks fixed: modeAB 7.3->0; threat 0.3 returns). Peek script fixed (it now steps out until there is a clear line of sight; before, peeks rarely cleared the container). Added 'peek' (reappearing where it vanished) to the signature. Running v4 and base3 (pristine tree, same final harness).
- 15:24 src frozen; must-hold 'after' tests running from a snapshot /tmp/cw/after_tree -> out/platform/commit/after/. v4 + base3 (pristine, final harness) measured; lure/flare/threat re-measured as base3b/v4b (probes moved earlier, lures thrown while fixated)
- 15:30 vanish now only counts when the thing moved or the animal's eyes were steady (a still person dropping out of view because the animal walked, or a person knocked down, had been counted). src frozen; FINAL commit.mjs + must-hold 'after' running from /tmp/cw/after_tree
- 15:55 must-hold after: platform ok, stuckopen ok, attend 22.0->21.1%, predator 1->4 FAIL (fed reflex), saltline exit 1->0, thoughts problems 2->6 (5 x one new phrasing flagged for a number word; rephrased) + pre-existing stim:meat crash (guarded in _start feed); thoughts re-running as after2
- 16:12 thoughts re-run on final src: problems 0, no crash; platform re-run on final src: all pass. Done.
