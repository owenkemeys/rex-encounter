# TUNE: making the prey reflex fair (status: stopped at the 2 h time box; see sections 9-10)

## 1. What fair means, in numbers (targets set before tuning)
- Calm play (standing still at 10-12 m, a slow 1 m/s walk kept at 10 m or more, backing away at a walk whenever it shows a tell):
  death rate under 10% over 3 minutes on the harness's hunger (0.55 rising to ~0.8 by 180 s); close range (still at 6 m) not zero.
- Prey-like play (darting, hopping, hide-and-peek): fatal if kept up, but only after a visible build: the first tell a player can
  read (low creep, locked stare, a warning, the dead-still set) at least ~8 s before the rush in most deaths, with the dead-still
  moment (1.0-1.8 s) last. Going still at the first tell (dartcalm) calls the rush off in at least 70% of episodes.
- Running straight away from 5 m: usually fatal (target > 50%).
- An ordinary first minute (a 3.8 m/s game walk round it, arena.opening on; Saltline's opening): no death caused by the reflex.
- Measured with `node test/commit.mjs fair --fairness` (runs end at the first death; arena seeds 3,5,8,11, made-up world 3,5;
  180 s, run5 60 s, walk38 90 s). "lead" = rush start minus the start of the run of readable tells before it.

## 2. Mechanism (general rules; nothing reads the player, rocks or the map)
- Quickness is judged against its own scale: `prey.quick` x its own run speed (0.6 x 8 = 4.8 m/s), so any game's walk (2.6 or
  3.8 m/s) is not quick and a sprint (6.2-6.4) is. Its "running" bands (c.running) are scaled the same way (0.55 / 0.5 x run).
- Erratic motion: sharp turns at quick speed (as before) and bobbing (`bob`, height jumping up by `bobH`), once per bob.
- Vanishing counts only for a thing that moved out of view (a standing person dropping from view as its eyes or the light change
  no longer counts: that had fixated it for 84 s on a still person on the made-up world), full inside 0.4 x vanishD, fading to 0
  at vanishD, and a slow walk out of view counts `slowHide` of a dash. Showing again counts as a peek only if it shows stopped or
  coming back the way it went (walking on past the far side of a rock is not peeking).
- The rush is gated (`mind._preyGo`): hunger alone (`ap.Hn` >= hungerGo, the appraisal with the reflex left out), or the reflex
  (arousal >= rushK, fixed for at least leadT s, and the thing not calm for calmGrace s), or a sprint away near it. Short of that
  the stalk creeps no nearer than rushD + holdD and holds, low and locked on (a tell); when neither hunger nor the reflex holds it
  (arousal under `off`) the stalk is called off. The dead-still set (1.0-1.8 s) goes back to the stalk if the reason lapses.
  Ambush and shadow springs go through the same gate (they had bypassed it: a slow walker was killed by a sprung ambush with
  arousal 0.3 and no hunger verdict).
- A predatory rush (prowl, pounce) ends in the peril strike (a kill) once inside reach; there is no grab-and-taste fallback,
  so a fed animal's take is a kill, never a catch-and-release.
- A bolt from close in front of its eyes (inside boltD, seen in the first tenth of a second) fills the chase reflex at once;
  inside reach + boltStrike it is the strike at once, else a pounce with a 0.25 s lock that a lagging speed estimate cannot defuse.
- Peril gives no warnings while a chase or rush is under way (a rumble/snap gesture was stalling the rush).
- Hide-and-peek: `prime`: a glimpse where a thing it is worked up about went out of sight is picked up faster.

## 3. Species tunables (src/species/tyrannosaurus.js `mind.prey`; engine defaults and meanings in mind.js MIND_DEFAULT)
New: quick 0.6 (replaces quickV 3.2; `quickV` still overrides in m/s), bob 0.015, bobH 0.3, slowHide 0.5, prime 4, rushK 0.7,
holdD 3, calmGrace 1.5, hungerGo 0.6, leadT 8, boltD 8, boltLock 0.25, boltStrike 2.5. Changed: setT [0.6, 1.1] -> [1.0, 1.8].
Unchanged: dart 0.11, flee 0.22, vanish 0.16, vanishD 40, peek 0.14, small 0.7, calmT 20, goneT 60, on 0.45, off 0.25,
reflexW 0.7, absorb 0.5, pull 0.9, rushD 13. `commit` block unchanged.

## 4. Before / after (commit.mjs --fairness; before = merged tree as received, after = final src)
### Before
```
FAIRNESS (runs end at the first death)
script    world   | deaths      | t death med (range) | lead med (min) | first tell med | calm episodes called off
still10   arena   | 1/4    25% | 77.9 (77.9-77.9) | 16.9 (16.9) | 93.3 | -
still10   foreign | 0/2     0% | - | - | 133.3 | -
still10   both    | 1/6    17% | 77.9 (77.9-77.9) | 16.9 (16.9) | 93.3 | -
still6    arena   | 1/4    25% | 142.6 (142.6-142.6) | 19.3 (19.3) | 77.5 | -
still6    foreign | 1/2    50% | 170.2 (170.2-170.2) | 6.6 (6.6) | 28.3 | -
still6    both    | 2/6    33% | 170.2 (142.6-170.2) | 19.3 (6.6) | 55.8 | -
slowwalk  arena   | 3/4    75% | 135 (130.5-169) | 6.7 (2.4) | 64.2 | -
slowwalk  foreign | 2/2   100% | 166.2 (157.4-166.2) | 52.3 (0) | 47.9 | -
slowwalk  both    | 5/6    83% | 157.4 (130.5-169) | 6.7 (0) | 47.9 | -
backoff   arena   | 0/4     0% | - | - | 61.4 | -
backoff   foreign | 2/2   100% | 132.1 (87-132.1) | 63.4 (39.7) | 33.9 | -
backoff   both    | 2/6    33% | 132.1 (87-132.1) | 63.4 (39.7) | 33.9 | -
dart      arena   | 3/4    75% | 60.8 (53.3-90.2) | 20.6 (0.9) | 14.5 | -
dart      foreign | 2/2   100% | 42.5 (39.8-42.5) | 13.5 (0) | 13.1 | -
dart      both    | 5/6    83% | 53.3 (39.8-90.2) | 13.5 (0) | 14.5 | -
dartcalm  arena   | 3/4    75% | 78.5 (73.1-92.2) | 1 (0.8) | 12 | 8/16 (rushed 5)
dartcalm  foreign | 1/2    50% | 38.5 (38.5-38.5) | 3.4 (3.4) | 12.2 | 3/7 (rushed 2)
dartcalm  both    | 4/6    67% | 78.5 (38.5-92.2) | 1.1 (0.8) | 12 | 11/23 (rushed 7)
hop       arena   | 3/4    75% | 93.1 (89.9-108) | 1.3 (1) | 12.6 | -
hop       foreign | 1/2    50% | 79.2 (79.2-79.2) | 1.8 (1.8) | 33.6 | -
hop       both    | 4/6    67% | 93.1 (79.2-108) | 1.4 (1) | 12.6 | -
peek      arena   | 1/4    25% | 114.4 (114.4-114.4) | 6.8 (6.8) | 62.9 | -
peek      foreign | 0/2     0% | - | - | 27.4 | -
peek      both    | 1/6    17% | 114.4 (114.4-114.4) | 6.8 (6.8) | 49.6 | -
flee      arena   | 0/4     0% | - | - | 10.3 | -
run5      arena   | 2/4    50% | 54 (24.8-54) | 2.8 (2.3) | 2.5 | -
run5      foreign | 2/2   100% | 40.3 (22.2-40.3) | 1.1 (0.5) | 4.9 | -
run5      both    | 4/6    67% | 40.3 (22.2-54) | 2.3 (0.5) | 3 | -
rocks     arena   | 3/4    75% | 53.6 (44.5-123) | 26.1 (26.1) | 14.9 | -
rocks     foreign | 2/2   100% | 44.4 (32.4-44.4) | 13.6 (8.7) | 29.5 | -
rocks     both    | 5/6    83% | 44.5 (32.4-123) | 26.1 (8.7) | 18.2 | -
walk38    arena   | 3/4    75% | 65.5 (63.5-68) | 0 (0) | 9.3 | -
walk38    foreign | 0/2     0% | - | - | 2.8 | -
walk38    both    | 3/6    50% | 65.5 (63.5-68) | 0 (0) | 2.8 | -
```
### After
```
FAIRNESS (runs end at the first death)
script    world   | deaths      | t death med (range) | lead med (min) | first tell med | calm episodes called off
still10   arena   | 1/4    25% | 77.9 (77.9-77.9) | 16.9 (16.9) | 93.3 | -
still10   foreign | 0/2     0% | - | - | 133.3 | -
still10   both    | 1/6    17% | 77.9 (77.9-77.9) | 16.9 (16.9) | 93.3 | -
still6    arena   | 1/4    25% | 142.6 (142.6-142.6) | 19.3 (19.3) | 77.5 | -
still6    foreign | 0/2     0% | - | - | 28.3 | -
still6    both    | 1/6    17% | 142.6 (142.6-142.6) | 19.3 (19.3) | 55.8 | -
slowwalk  arena   | 1/4    25% | 88.1 (88.1-88.1) | 22.4 (22.4) | 111.7 | -
slowwalk  foreign | 1/2    50% | 156.9 (156.9-156.9) | 35.1 (35.1) | 64 | -
slowwalk  both    | 2/6    33% | 156.9 (88.1-156.9) | 35.1 (22.4) | 85.1 | -
backoff   arena   | 0/4     0% | - | - | 61.4 | -
backoff   foreign | 1/2    50% | 165.9 (165.9-165.9) | 42.3 (42.3) | 70.2 | -
backoff   both    | 1/6    17% | 165.9 (165.9-165.9) | 42.3 (42.3) | 61.4 | -
dart      arena   | 4/4   100% | 34.1 (24.1-37.3) | 17.3 (10.8) | 14.6 | -
dart      foreign | 2/2   100% | 60.9 (33.3-60.9) | 31.3 (14.9) | 20.8 | -
dart      both    | 6/6   100% | 34.1 (24.1-60.9) | 17.3 (10.8) | 14.6 | -
dartcalm  arena   | 1/4    25% | 30.4 (30.4-30.4) | 0 (0) | 12 | 16/19 (rushed 0)
dartcalm  foreign | 2/2   100% | 176.9 (152-176.9) | 56.9 (43.1) | 18.4 | 9/11 (rushed 2)
dartcalm  both    | 3/6    50% | 152 (30.4-176.9) | 43.1 (0) | 12 | 25/30 (rushed 2)
hop       arena   | 4/4   100% | 81 (51.3-92) | 51.7 (9.5) | 25.4 | -
hop       foreign | 2/2   100% | 76.3 (22.3-76.3) | 10.3 (9.1) | 41.2 | -
hop       both    | 6/6   100% | 76.3 (22.3-92) | 31.9 (9.1) | 25.4 | -
peek      arena   | 2/4    50% | 174.9 (170-174.9) | 31.3 (8.8) | 59.4 | -
peek      foreign | 0/2     0% | - | - | 68.1 | -
peek      both    | 2/6    33% | 174.9 (170-174.9) | 31.3 (8.8) | 59.4 | -
flee      arena   | 0/4     0% | - | - | 5.6 | -
run5      arena   | 0/4     0% | - | - | 12.6 | -
run5      foreign | 1/2    50% | 24.4 (24.4-24.4) | 2.7 (2.7) | 12.6 | -
run5      both    | 1/6    17% | 24.4 (24.4-24.4) | 2.7 (2.7) | 12.6 | -
rocks     arena   | 2/4    50% | 46.6 (44.5-46.6) | 26.3 (20.3) | 14.9 | -
rocks     foreign | 2/2   100% | 44.4 (32.4-44.4) | 13.6 (8.7) | 29.5 | -
rocks     both    | 4/6    67% | 44.5 (32.4-46.6) | 20.3 (8.7) | 18.2 | -
walk38    arena   | 0/4     0% | - | - | 2 | -
walk38    foreign | 0/2     0% | - | - | 0.5 | -
walk38    both    | 0/6     0% | - | - | 2 | -
```
Reading it:
- Calm play: still10 1/6 -> 1/6 (17%), still6 2/6 -> 1/6, slowwalk 5/6 -> 2/6 (33%), backoff 2/6 -> 1/6. TARGET (< 10%) NOT MET.
  What is left is the hunger/peril route (hunger 0.55 rising to 0.8 over the 3 minutes; verdict food adds `tested` to peril; the
  walk passes close), not the reflex: none of these deaths had fixation. Close range is not zero (still6 1/6).
- Prey-like: dart 6/6 dead (median 34 s, was 53 s, 5/6) with lead from first readable tell to rush median 17 s, min 10.8 s
  (before: median 13.5, min 0). Hop 6/6 dead, median 76 s, lead median 32 s (before 4/6, lead median 1.4 s). Going still at the
  first tell (dartcalm) calls the rush off in 25/30 episodes (83%; before 11/23, 48%), 2 of 30 rushed during the calm.
  dartcalm deaths 4/6 -> 3/6: the arena one (30 s, lead 0) is a dart resumed from 6.4 m, i.e. a bolt inside its strike reach.
- run5 (walks in to 5 m, then sprints away): 4/6 -> 1/6 dead. The rush is no longer slow to start (strike within ~0.2 s of the
  bolt when inside reach + 2.5 m) but it misses: see Unfinished. TARGET (> 50%) NOT MET.
- walk38 (first minute at a 3.8 m/s game walk round it, opening on): 3/6 -> 0/6 dead (it was fixated by ordinary walking).
- rocks 5/6 -> 4/6 (the peril irk route, unchanged by design). Peek 1/6 -> 2/6 dead, fixation see section 5.
- Note: run5 was rewritten during the work (it now walks in to 5 m before running; the before row used the old script, which
  stood at 5.5 m for 1.5 s while the animal was still startled and backing to its personal distance, ~7.5 m).

## 5. Hide-and-peek (task 3): NOT made reliable
Fixation per run (fixT > 0): before 4/6 (old harness start, hiding place 42-45 m off), after 2/6 (made-up world 2/2, arena 0/4;
peek and hidden now start at play distance, ~33 m). Traced: on the arena the animal's head (4-5 m up) sees the crouched person
over or round the container stack for 53-129 s of 180, so there are few true vanish/reappear events; the new rules (a vanish
must be a movement, a reappearance must stop or come back) also count fewer. Waiting on the spot / going round low / flushing
are the existing ambush / stare / low search; not re-checked. Needs: a cover test the head cannot see over, or vanish counted
on line-of-sight from the head rather than on the knowledge state; I ran out of the time box.

## 6. Tests changed
- test/commit.mjs: FAIR scripts (still10, still6, slowwalk, backoff, dartcalm, run5, walk38), `--fairness` report (death rate,
  time to death, lead from first readable tell to rush, calm episodes called off), `tellNow`/`rushNow` exported, `o.trace`/`o.every`
  hook, peek/hidden start at play distance (reason above), slowwalk keeps >= ~10 m (it had walked its line to 6 m of the animal).
- test/predator.mjs matrix: the two fed checks rewritten (section 2/step 4 in the log): fed + a person who never bolts: mostly
  curious, < 8% predatory, never takes or kills; fed: no catch-and-release.

## 7. Files changed
src/sim/mind.js, src/sim/appraise.js, src/sim/attend.js, src/sim/peril.js, src/species/tyrannosaurus.js (mind.prey only),
test/commit.mjs, test/predator.mjs. Not changed: rex.js, nav.js, view/*, thoughts.js, afford.js. Pre-edit copies:
out/platform/tune/pre/; final copies: out/platform/tune/final_src/.

## 8. Task 5 (mind faults)
- attend.js `_glance` now sets mind.orientTo (with the glanced key) when it fires the orient gesture; mind._speak names an
  orient by what was glanced at (sound, food/light, prey, you).
- pause: with you in view and > 1.2 rad round, the body turns to you; peril stare/lower: faces you when > 0.5 rad off.
- gaze.mjs beyond-reach share 1.65% -> 1.57% (target ~1%: NOT MET). Remaining: pause 6.8% (mostly peril still/strike gesture
  points and behind-body during the strike), display 4.5% (broadside), circle 2.3%.

## 9. Verification (out/platform/tune/verify/*.txt; chain script out/platform/tune/verify/run.sh, run sequentially)
- commit.mjs --fairness (final): section 4, exit 0.
- predator.mjs matrix: 2 FAIL (was 4). Both rewritten fed checks pass (fed + calm person: 0-8% predatory, no take, no kill;
  no catch-and-release anywhere). Still failing: "starving clearly more predatory than fed, every seed" (s8 starving 0%, s3 6%,
  s5 5%: a starving animal now kills within seconds of a rush, and stance after the death is 'none', so the share is tiny) and
  "variety" (every hungry/starving run ends 'curious': the run ends on the respawned newcomer after a kill). Both also fail in
  out/platform/baseline/predator.txt (older baseline), so they are measurement-shaped as much as behaviour; NOT fixed.
- gaze.mjs (final src, run by hand before the chain): beyond-reach 1.57%, 2 unreported episodes > 1.5 s.
- Still running / not verified when I stopped: saltline (deaths per script), platform, stuckopen, commit.mjs all, thoughts all 3,
  attend, peril 6, smoke --force, smoke --full --force. Their outputs land in out/platform/tune/verify/ if the chain survives.

## 10. Unfinished and unverified
- Calm play death rate 17-33% over 3 min (target < 10%) via the hunger/peril route at hunger rising to 0.8; candidates: peril
  `tested` term (verdict food adds 0.38 near), hunger term, or the harness's rising hunger. Not tuned.
- Running from 5 m: 1/6 fatal (target usually). The strike fires within ~0.2 s of a close bolt but jaws close 0.2 s after
  launch with ~6.3 m reach, and the body accelerates 0->8 m/s in ~2 s with exertion saturating in ~5 s at 8 m/s: a 6.2 m/s
  sprinter outruns it. The fix is in the body (rex.js reach/acceleration/endurance), outside my files; aim is not the problem.
- Hide-and-peek not reliable (section 5).
- gaze beyond-reach 1.57% (target ~1%).
- Saltline opening: not yet measured on the final tree (walk38, the arena analogue with opening on, is 0/6 deaths in 90 s).
- Thoughts: no new thought cues were added; the stall thought 'The pull goes out of it.' and 'Holding low, eyes on you.' are
  this.thought (debug narration), not the thought stream. Not checked with thoughts.mjs (pending in the chain).
- Log of steps: out/platform/tune/log.md.
