# TUNE3 — siege follow-through, toe tic, hide-and-peek, lunge step, tells

Status: started 2026-11-14 20:18 UTC. Updated after every step.

## Log
- 20:18 created.
- 20:35 wrote test/probe.mjs (the old 8-line scratch of that name, a RexSim shove/roar smoke, was replaced; a copy is in the
  pristine tree). Measures per structure x seed (person inside, 180 s): head joint inside, eye within 1.5 m of an opening and
  aimed through it, snout/foot inside, mind time in besiege/probe/peer/wait, thoughts announcing them. `--root=` runs another
  tree. Running on both trees (4 seeds x 8 structures) -> out/platform/tune3/probe_{old,new_before}.txt.
  Linked _pristine/rex/node_modules -> rex/node_modules (allowed by the brief).
- 20:28 pre-edit copies of src/sim, src/species, test/review.mjs in out/platform/tune3/pre/; a runnable pre-edit tree in
  out/platform/tune3/before_tree (probe "new before" runs from it, so my edits do not leak into the baseline).
- 20:28 fault 2: review.mjs toe-tic check added (`toe splay/flexion changes on a planted standing foot`; window 0.5 s; splay
  > 0.06 rad or toe angle > 0.1 rad; the foot planted for the whole window and for 0.4 s before it; episodes now printed
  after each review issue line, smoke's regex unaffected). Scratch tracers out/platform/tune3/tic*.mjs.
  Idle-watching (60 s): before 2434 tic ticks (worst 0.32 rad); cause = the close-up rule: a planted foot's fan was scaled by
  its distance to the other foot only while the other was planted, so it opened as the other lifted and closed as it landed
  beside it, at every step; plus the fan following load. Fix in rex.js `_toes`: fan latched open at the most load taken since
  landing (closes only in roll-off, heel up); the close-up factor is decided by the landing foot (k^2, for both) and only
  creeps in slowly on a planted foot (0.15/s) if the other lands into it; species splay.min 0.24 (outer toe clears the middle
  one at the claw). After: 0 tic ticks; feet-toes-touch 169 -> 670 ticks (worst 0.01 -> 0.03 m) in that scenario: watch.
- 20:59 fault 1, measured (siege scenario, person inside from the start, 4 seeds x 8 structures, 180 s): the new tree does as
  much as the old (head in 21/150 s vs 11/30 s over the 6 ground structures; eye at opening 66/722 vs 61/558). So the plain
  siege scenario does not show the owner's fault. Found with probe.mjs --enter (person seen outside first, then walks in):
  (a) commitment: after watching him 60 s in the open the animal kept WATCHING a doorway from 32 m for 50 s (watch 0.61 +
  margin + stickiness vs besiege 0.68) - the old tree started besiege 1 s after he went in. (b) the Loft (raised floor):
  besiege announced, body never got there: the plan was remade every few seconds because out of sight he was taken to be on
  the ground (two target heights), and go<->probe flipped every tick (probe entered at up to 3.5 m off the line, left at
  2.6), with 27 probe thoughts and nothing done in one run. (c) once there the probe flipped shove<->use every tick (0.45 m
  edge, no hysteresis). (d) a three-point turn that could not move (tail against the warehouse, nose at the containers)
  restarted the stuck clock every tick (never detected). Fixes in mind.js: re-weigh at once when he goes in / comes out
  (_open('inside') + _choose), no +0.25 stickiness while weighed afresh, watch x0.5 from > 8 m when he is walled in;
  besiege keeps the last seen position (and height) while its belief is still there; go->probe needs < 2 m off the line;
  'there' hysteresis 0.45/0.75 m; tight three-point turn gives way after 3 s with < 0.6 m moved (8 s off).
  (d) is NOT solved: the body is truly wedged there (tail and nose both touching); it now cycles the stuck rule.
- 21:00 fault 4: rex.js _snapStep marks `lungeReq` when a lunge starts over two planted feet; the next foot goes at once
  (need >= 1.05, spent/spentSoon). Not yet measured.
- 21:05 probe.mjs: added --enter/--herd/--from/--speed/--pre/--trace (the play-like sequence). Runs (4 seeds, --enter --herd
  --from=15 --pre=20, 200 s): old tree -> play_old.txt, pre-edit tree -> play_before.txt, current (snapshot after_tree) ->
  play_after.txt (Loft, barn, warehouse, containers only: CPU is shared, load ~10).
- 21:05 review mind (pre-edit tree with the new check, review_mind_before.txt): idle watching 803 tic ticks / 30 episodes,
  targets-all-round 270/18, run 8 103/3, jog 25/3, walk 19/2. Current tree (review_mind_1.txt, running): idle watching 0.
- 21:12 review.mjs mind, before (pre-edit tree) -> after (current): toe splay tic 3728 ticks / 148 episodes in 16 scenarios ->
  61 / 2 in 2 scenarios; toe flexion 75 / 4 -> 75 / 4 (unchanged: these are roll-offs undone as it stops dead from a walk
  or sprint, heel down again, e.g. mind seed 3 at 2.2 s: beta 0.38 -> 0 as v 0.36 -> 0; a real roll-off, not a weight shift);
  toes of the two feet touch 3615 -> 1650 ticks; hips slide with no step 1 (mind seed 7, 53.6 s) -> 0; foot hanging 0 -> 0.
  review mind exit 0.
- 21:20 fault 5: out/platform/tune3/tells.mjs (per still10 death: seconds each outward sign is on from the first tell to the
  strike). Current tree: still10 deaths 1/9 (foreign s8; the 3/9 of TUNE2 came down with the arbitration change of fault 1,
  not by design). In that death (17 s of tells, 7.9 -> 6.1 m): locked stare 17 s, dead still 16 s, but head lowered only
  2.6 s, crouched 2.2 s, breath held 6 s, 4 huffs, jaw shut; 14.5 s of it was peril 'warn' inside an ordinary watch: the
  warn stage had no body of its own between the individual's 0-4 discrete warnings. Fix (peril.js apply): during 'warn'
  the pressure shows and grows with it (k = sstep(0.55, 0.85, r)): eyes locked, head carried lower (intent.low 0.6k), held
  breath (0.35 + 0.55k), alert carriage capped at 0.3 (it lifts the head), agitation 0.35k, no relax. Goals untouched.
  Same run after: head lowered 6.5 s, crouched 6 s, breath held 13.3 s; death at the same 109.7 s (outcome unchanged).
- 21:22 code frozen; verification chain out/platform/tune3/verify/run.sh started (progress.txt).
- (clock note: the log times above from "20:35" to "21:22" were written ahead of the real clock; real times were ~10-20 min
  earlier. From here on they are read off `date`.)
- 21:17 siege all 3 90 (first chain, verify0/siege.txt): body-in-wall barn 1839 (153 on the pre-edit tree, 0 in BODYFIX3),
  gatehouse 327, mostly besiege/shove:head: the probe now stays at a place long enough to push its head at it (the stance
  work never counted as "in place", so only the 25 s limit ended a shove). Fix: fit time counts within 0.6 m / 0.3 rad;
  shove limit 15 s; a head held against the wall > 1.2 s fails the place after 5 s even when the body is not in place.
  Barn 1839 -> 458, gatehouse 327 -> 44 (seed 3, 90 s). Chain restarted 21:20 (verify/), probe.mjs siege mode on the final
  tree running (probe_after.txt).

---------------------------------------------------------------------------------------------------------------------------
# Deliverable

Trees: "old" = /home/claude/_pristine/rex (two days ago); "before" = this tree as received (snapshot
out/platform/tune3/before_tree); "after" = final. Raw files in out/platform/tune3/ (probe_*.txt, play_*.txt, review_mind_*,
tells_1.txt, siege_before.txt) and out/platform/tune3/verify/ (final chain, progress.txt).

## Fault 1: says it will go into spaces but does not
### Measurement (test/probe.mjs, new; numbers are episodes/seconds summed over 4 seeds x 180-200 s per structure)
Two set-ups. Siege (as test/siege.mjs: the person is inside from the start and shouts at 3 s and 50 s) did NOT show the
fault: the "before" tree did as much as the old one (6 ground structures: head inside 21/150 vs 11/30; eye at an opening
66/722 vs 61/558; snout in 95/866 vs 72/826). The fault shows with --enter --herd (the herd left in; the person stands in
view 15 m off for 20 s, then walks in through the nearest way and stays), which is how play goes:

| structure (4 runs each) | head in n/s old / before / after | eye at gap n/s old / before / after | snout in n/s old / before / after | runs that announced besiege or a probe and did none of it, old / before / after |
|---|---|---|---|---|
| the Loft (raised floor) | 0/0 / 0/0 / 0/0 | 8/204 / 0/0 / 15/183 | 14/94 / 0/0 / 16/119 | 2 / 4 / 0 |
| the Barn | 8/11 / 11/43 / 8/60 | 50/210 / 27/316 / 26/168 | 26/235 / 26/383 / 14/233 | 0 / 0 / 0 |
| the Warehouse | 6/33 / 3/2 / 1/2 | 0/0 / 5/5 / 3/6 | 5/106 / 10/79 / 2/29 | 1 / 1 / 1 |
| the Containers | 0/0 / 19/101 / 14/84 | 7/301 / 12/245 / 8/164 | 13/322 / 16/296 / 26/248 | 0 / 0 / 0 |
Thoughts announcing it (besiege intents / probe moves / waits), Loft: old 18/5/0, before 17/27/0, after 6/7/2. In the
before tree the Loft got 27 probe announcements in one run with the body never at the opening.
("after" here is the snapshot out/platform/tune3/after_tree, taken before the last two edits: the warn-stage body and the
shove limit.) A single traced run with a 60 s pre-phase (containers, seed 3) shows the arbitration fault plainly: before,
it watched the doorway from 32 m for 50 s and only started besiege at 149 s; old and after start besiege within 1 s of
him going in and have the snout in by 75 s.
### Causes (found by tracing, out/platform/tune3/btrace.mjs and probe.mjs --trace)
1. Commitment (COMMIT.md) kept the goal it had: after watching him in the open, his going inside was not news, so watch
   (0.61 + the commitment margin 0.3-0.6 + 0.25 stickiness of the running behaviour) beat besiege (0.68) and it watched a
   doorway from 30 m until it got bored. The old tree had no margin.
2. Raised floor (the Loft): out of sight he was assumed to be on the ground (belief point at ground + 1 m) and seen he was on
   the floor (4.8 m): the target "moved" every time sight came and went, so the planner threw the plan away and made a new
   one every few seconds; the body walked between two ways in and never reached either (the 30 s give-up timer restarted
   with each plan).
3. go <-> probe flip: probe was entered up to 3.5 m off the planned line and left at 2.6 m, so it switched every tick; each
   switch restarted the timers and re-announced a probe move.
4. At the place, "there" had no hysteresis (0.45 m, while the gaze itself sweeps ~0.12 m round it), so shove <-> use flipped.
5. A three-point turn (back up when tight) that cannot move (tail against one building, nose at another) reset the stuck
   clock every tick, so the stuck rule never came in (warehouse/containers alley).
Seen in the traces, so not the cause there: the planner produced places (40-44 per plan) and the reach judge passed them;
once the body stood at the stance the head got the eye to within 0.45 m of the planned place (Loft trace, peer). Not checked
one by one: the prey reflex, the feet-limited speed, the strike-approach change, the wedged detector (none showed in the
traced failures).
### Fix (mind.js only; general rules)
- Going in or coming out (c.enclosed changing) is news: `_open('inside')` and a fresh choice; while weighed afresh the
  running behaviour gets no +0.25 stickiness either. With him walled in, watching from more than 8 m is worth half.
- besiege keeps where it last saw him (with height) while its belief is still within 2.5 m of that.
- go -> probe only within 2 m of the line; "there" 0.45 m to arrive, 0.75 m to leave.
- shove: fit time counts within 0.6 m / 0.3 rad of the stance; a shove ends at 15 s (was 25); a head held against the wall
  > 1.2 s ends it after 5 s even when the body is not in place (it pushed at a barn wall 23 s).
- tight three-point turn: after 3 s with < 0.6 m moved it stops for 8 s and the ordinary turn and stuck rules apply.
- Where it cannot: unchanged and truthful already (no places -> "wait by hole"; up out of reach -> the raised-floor lines;
  4+ failures -> the frustrated lines).
### Collision invariants (siege all 3 90, seed 3: body-part-in-wall ticks; BODYFIX3 after / before this pass / after)
| tower | barn | warehouse | containers | ruins | gatehouse | culvert | novel-slot | novel-under | total |
|---|---|---|---|---|---|---|---|---|---|
| 17 / 41 / 40 | 0 / 153 / **458** | 39 / 0 / 0 | 136 / 226 / 48 | 0 / 59 / 59 | 0 / 44 / 44 | 0 / 1923 / 58 | 108 / 88 / **350** | 0 / 0 / 0 | 300 / 2585 / 1097 |
- NOT held for the barn (458, all head: besiege shift 295 = drawing the head back out, peer 83, snout/neck 80) and
  novel-slot (350); both rose because it now works those openings for longer (before the shove fix the barn was 1839).
  Better than the tree as received for containers and the culvert (1923 -> 58). Chest-to-head max 1.73-1.75 m (BODYFIX3
  1.75; README 1.7): unchanged.

## Fault 2: toe tic
- Measurement: new review.mjs check "toe splay / flexion changes on a planted standing foot": for each foot and tick, if the
  body is standing (|v| < 0.3, no lunge/shove) and the foot stays planted (from 0.4 s after landing) for the next 0.5 s, a
  splay change > 0.06 rad or a toe-joint change > 0.1 rad within that window counts (ticks, and episodes = runs of ticks).
- Cause: in `_toes` a planted foot's fan was (a) scaled by its distance to the other foot only while the other foot was
  down, so it closed as the other landed beside it and opened as it lifted again, at every step of the other foot, and (b)
  followed the load directly, so any unloading closed it. Toe flexion follows the heel roll only, so it was not the tic.
  The closed fan went to 0.05 rad in a swing (toes curled), which put the outer toes over the middle one.
- Fix (rex.js `_toes`, `_toeContact`; species foot.splay.min): the fan opens with the load the foot takes after landing and
  holds it (latched); it follows the load down only in a real roll-off (heel up, beta > 0.05). The close-up rule is decided
  by the foot being set down (factor squared, for both feet) and kept for the stance; if the other foot lands into its fan
  anyway the planted foot draws in at 0.15 /s (under the check's 0.06 rad / 0.5 s). Minimum splay 0.24 rad everywhere
  (swing, roll-off, close-up, the contact solve): the skin's outer digit (half width ~0.117 m) and middle one (~0.131 m)
  stand ~0.1 m apart at their bases (view FOOTSKIN x flesh), so 0.1 + 0.62 sin(a) >= 0.25 needs a >= 0.24.
- Before -> after (review.mjs mind = default scenarios + 4 mind seeds): splay tic 3728 ticks / 148 episodes in 16 scenarios
  -> 61 / 2 in 2; flexion 75 / 4 -> 75 / 4 (both remaining kinds are a roll-off undone when it stops dead from a walk or a
  sprint: heel down again, a real roll-off, not a weight shift); feet's toes touching 3615 -> 1730 ticks (final tree, verify/review_mind.txt). Idle watching a
  circling person 60 s: 803 tic ticks / 30 episodes -> 0.

## Fault 4: no-step slide
- Cause: the snap lunge (`_snapStep`) added hip velocity over two planted feet while the bluff charge braked from ~2.5 m/s;
  the step rule only fired from the gait's own room/time sums, a tick late each time, and the slide passed 1.0 m.
- Fix (rex.js): a lunge that starts over two planted feet sets `lungeReq`; for 50 ms the foot that goes next has need >= 1.05
  and counts as spent (no weight-shift pause), so it steps at once and carries the lunge.
- review.mjs mind: hips slide with no step 1 -> 0; foot hanging 0 -> 0.

## Fault 5: standing still and never reacting
- Measurement: out/platform/tune3/tells.mjs (from the first tell to the strike, seconds each outward sign is on).
- On the final mind still10 dies 1/9 (foreign s8), not 3/9: the arbitration change of fault 1 (no stickiness when weighed
  afresh) moved those encounters; this was not aimed at. In that death, before the warn-stage change: 17 s of tells from
  7.9 m to 6.1 m: locked stare 17 s, dead still 16 s, breath held 6 s, head lowered > 0.5 m 2.6 s, crouched 2.2 s,
  creeping 0.5 s, 4 huffs, jaw shut; 14.5 s of it was the peril 'warn' stage inside an ordinary watch, 1.4 s the still set,
  1.1 s the rush. So the build-up was mostly internal: what showed was a stare and stillness, which every watch has.
- Fix (peril.js `apply`): during 'warn' the pressure shows and grows with it (k = sstep(0.55, 0.85, r)): eyes locked, head
  carried lower (intent.low 0.6k), breath held (0.35 + 0.55k), the alert carriage capped at 0.3 (it lifts the head),
  agitation 0.35k, no relax. Goals and timings are not touched (not timid: same approach, same strike).
- After (same run, same death at 109.7 s): head lowered 6.5 s, crouched 6 s, breath held 13.3 s, stare 17 s, still 16 s.

## Tests added or changed
- test/probe.mjs (new; replaced an 8-line RexSim scratch of the same name, still in the pristine tree): announced versus
  done per structure; `--root=` measures another tree with the same code; `--enter [--from --speed --pre] --herd` is the
  play-like sequence; `--trace` prints the mind's choice, utilities, margin and thoughts.
- test/review.mjs: toe tic check (above); every issue line now ends with "(N episodes)" (smoke.mjs's regex reads the part
  before it, unchanged).
- Scratch (not tests): out/platform/tune3/btrace.mjs (besiege trace), tells.mjs (fault 5), tic*.mjs (fault 2),
  tight.mjs, agg.mjs (sums probe lines from killed runs).

## Files changed
src/sim/mind.js (besiege target memory, go/probe/there hysteresis, shove limits, re-weigh on going inside, stickiness,
watch-from-afar, three-point-turn give-way), src/sim/rex.js (`_toes`, `_toeContact` floor, `_snapStep` lungeReq, step rule),
src/sim/peril.js (warn-stage body), src/species/tyrannosaurus.js (foot.splay.min 0.24), test/probe.mjs, test/review.mjs.
Pre-edit copies: out/platform/tune3/pre/. Not touched: src/view/*, src/ui.js, src/main.js, dist/*, IDX/LEG/PS.
- 21:44 the full `commit.mjs fair --fairness` started 21:36 in parallel (verify/fairB.txt; ~7 min per script on this
  machine, 16 scripts: it will not finish inside the time box); peek alone on 6+6 seeds -> verify/peek.txt.
- 21:47 after the restart: the chain (thoughts running), probe_after (22/32) survived. Stopped fairB (partial: still10,
  still6 done) and peek (no output yet) so that fewer Node tests run at once.
- fairB partial (final tree): still10 2/9 (arena s8 at 169 s, lead 37.6 s; foreign s8 at 109.7 s, lead 15.9 s; TUNE2 3/9),
  still6 1/6 arena (lead 25.7 s). Rest of the fairness table not run.

## Fault 3: hide-and-peek fixation: NOT DONE
- No behaviour change aimed at it. The fault-1 change (going in / coming out is news, weighed afresh) is how it now
  follows up a person who goes inside something; a hider behind (not in) cover is unchanged.
- One quick check on the near-final tree (commit.mjs peek, 120 s, 3 seeds per world): arena s8 fixed 0 s; foreign s3 fixed
  47 s. The 6+6-seed run was started and stopped after the restart (no output).
- Reading of the rule (appraise.js): a vanish needs the thing to have been in sight the tick before, in front of the head
  and moving; vanish + peek add ~0.3 x sensitivity per cycle against the 0.45 threshold, so two real hide-and-show cycles
  fixate it. TUNE2 measured the arena hider in plain view 26-81% of his "hidden" time (the animal walks round the barn), so
  real vanishes are rare there; next step is a hider that keeps the cover in the eye line (or hides in a structure and shows
  at a doorway) and then checking the vanish/peek counts against fixation.
- 21:49 thoughts all 3 --quiet: exit 1, 1 problem in 37 runs / 1333 thoughts: active:pest 75.2 s, a kill-cue line whose
  condition ([kill]) did not hold (not investigated; the encounter was re-routed by the arbitration change). siege:tower
  62 thoughts with 31 repeats within 60 s (not investigated).
- 21:56 probe.mjs (siege mode) on the final tree: done (probe_after.txt; table below). saltline: exit 1, HARD FAILURE
  crouch/3 body in box x14 (inspect, 0.41-0.45 m). Likely cause: my three-point-turn give-way (lets the trunk pivot into
  things once backing has failed). Reverted that one change (_unstick is again the pre-edit code; fault-1 cause 5 is now
  unfixed); chain stopped, re-running the remaining tests one at a time.
- 22:02 coordinator item: rex.js constructor/reset (`reset()` runs the constructor body) replaced `this.fix` with a new
  Vector3, so the view's bound `sim.fix` went stale after the arena opening's `sim.reset`. Now the existing Vector3 is
  moved (`set`), created only the first time; checked: same object after reset. Other per-reset objects the view could
  hold: main.js binds only `sim.fix` (pose, feet, spine are read through `sim` every frame). hfix/subject/att.pt are the
  sim's own (clones). The body.js wrapper can now be dropped by the view agent.
- 22:03 saltline re-run after the revert: still exit 1, crouch/3 body in box x7 (inspect 0.41-0.45 m), stall 21 s.
  Running the pre-edit tree's saltline to see whether this is mine.
- 22:08 the pre-edit tree fails saltline crouch/3 identically (body in box x7, stall 21 s; saltline_before.txt): not from
  this pass (TUNE2's last edits came after its own saltline run). Not fixed.

## Fault 1, siege mode after (probe.mjs, person inside from the start, 4 seeds x 8 structures x 180 s; probe_after.txt)
| | head in n/s | eye at opening n/s | snout in n/s | mind besiege/probe/wait s | thoughts besiege/probe/wait |
|---|---|---|---|---|---|
| old (all 8) | 11/30 | 132/765 | 72/826 | 2583/1142/225 | 85/58/13 |
| after (all 8) | 43/260 | 125/1360 | 121/1209 | 3764/1857/398 | 80/92/25 |
| after, Loft | 0/0 | 17/321 | 21/166 | 561/332/0 | 11/12/0 |
| after, Warehouse | 0/0 | 4/4 | 0/0 | 340/0/111 | 11/0/11 |
Remaining announced-but-not-done: the warehouse (besiege "get in" 11 times, then waits by the ways out; its east door
opens into a 9 m alley against the containers where the body cannot line up, and the south one is 1 m wide). The waiting
is voiced as waiting; the opening "get in" intent is not taken back when no place is found. Not fixed. The body wedged in
that alley (tail at the warehouse, nose at the containers) is also unfixed (my give-way for it was reverted, above).
"peer" announcements count 0 everywhere because the sub-move lines are cooled down; the peer time itself is 190 s.

## Verification (final tree; out/platform/tune3/verify/)
- probe.mjs: above. review.mjs: exit 0, no slides/hanging; toe tic only sprint 12 (1 episode) and stalk flexion (1).
- review.mjs mind: exit 0; slides 0, held feet 0; toe splay tic 61 ticks / 2 episodes, flexion 75 / 4 (both roll-offs
  undone at a dead stop).
- siege all 3 90: exit 0; body-in-wall table above (NOT held for barn 458 and novel-slot 350).
- thoughts all 3 --quiet: exit 1, 1 problem (above). (Run before the give-way revert and the fix-vector change.)
- saltline: exit 1, crouch/3 hard failure, identical on the pre-edit tree.
- platform: exit 0 (all checks). stuckopen: exit 0. gaze: exit 0 (beyond the neck's reach 1.17%, > 60 deg 3.6%, 4
  unreported episodes > 1.5 s). attend: exit 1: no response 12 of 394 thoughts about things = 3.05% vs the 3% limit
  (non-focus 13.5%, limit 25%).
- peril.mjs 6: exit 1, 4 of 13 checks fail: 3 of 22 kills without the stillness tell; rocks torment 50% deaths in 5 min
  (and its timing spread); strike inside reach 283/233/208 ms (one over 250). No earlier run of peril.mjs on record
  (TUNE2 did not run it) and no time to run it on the pre-edit tree, so these are not attributed.
- commit.mjs fair --fairness: partial only (still10 2/9, still6 1/6 arena); the full commit.mjs table: NOT RUN.
- predator.mjs matrix: exit 0, all checks passed.
- smoke baseline: NOT replaced (not everything holds).

## Unfinished and unverified
- Fault 3 (hide-and-peek) not done (section above). Fault 1: warehouse still says it will get in and then only waits; the
  body can wedge in the warehouse/containers alley; siege body-in-wall up for the barn and novel-slot.
- Not attributed: peril.mjs 4 failures, attend 3.05% (limit 3%), thoughts 1 problem, saltline crouch/3 (pre-edit tree fails
  the same). Full fairness table and the commit.mjs table not run; smoke baseline not replaced.
- Fault-5 change shown on one death only; thoughts/fairness numbers predate the last two edits (give-way revert, fix vector).
- 22:29 stopped. Tree works: all edited files pass node --check; platform, stuckopen, gaze, predator, review, review mind
  exit 0.
