# FOLLOWUP (after SALTFIX)

Status: all three tasks done; about 50 min over the 75 min time box (two full smoke runs, the first cut by my own background limit).

## Task 1: attend non-focus share (DONE)
- Baseline tree located: /home/claude/rexbak (smoke hash ffa2bdd5ef46 = baseline). Differs in mind.js, nav.js, thoughts.js, species navBody.
- attend diff baseline -> final (a5deec full): non-focus 92/389 (23.7%) -> 94/362 (26.0%). Numerator +2 (hunt_behind s3 4->6),
  denominator -27: besiege s1 17->0 and s3 22->5 thoughts about things (both 0 non-focus). So the share rose mostly because besiege
  stopped producing on-focus thoughts. Investigating why.
- Trace (test/fu_besiege.mjs, out/platform/followup/bes1_*.txt): in attend's `besiege` scenario the body does not start 24 m off the barn door.
  `new Creature` itself puts it at (87.3, 91.6) instead of (35, 101) in BOTH trees (rex.js, not touched; identical md5). So the scenario
  is "roaming 55-70 m away while you run into the barn". Baseline seed 1: its roam happens to pass where it sees you at 73 m (23.5 s),
  then watch/besiege thoughts (17 about you, all focus). Final tree: the roam goal (fault 3, route-length roam) takes another line;
  it never sees you; 7 idle thoughts, 0 about things. Bisecting by change group next.
- Bisect (out/platform/followup/bisect_attend.txt; variants = final tree with one group reverted, built by followup/bis/mk.mjs):
  - hunt_behind s3 (non-focus 4->6 in the earlier run; 6 (1 disregard) -> 6 (2 disregards) here, +3 thoughts): returns to baseline only when `_unstick` is removed.
  - besiege s1/s3 on-focus thoughts: no single revert restores baseline; reverting `fit` or the roam goal changes them chaotically
    (fit: s1 7, s3 0; roam: 6/9/3). Whether the animal, 55-90 m away, ever sees you is trajectory chance.
- Authoritative baseline is the smoke cache (out/smoke/ffa2bdd5ef46-full/attend.txt): 94/389 = 24.2%. Final tree 94/362 = 26.0%.
  **The numerator (thoughts about something other than the focus) did not change: 94 -> 94.** The whole rise is the denominator.
- Cause: attend's `besiege` scenario put the animal 24 m out from the barn door, i.e. at z = 101, outside the arena fence (bound 99).
  rex.js's spawn then throws the body 0-52 m along the fence depending on yaw (probe: yaw 3.14 -> (87.3, 91.6)). So the scenario was
  "roaming 55-90 m off" and whether it ever saw you was trajectory chance; the last pass's route changes (measured fit, roam goals by
  walk length) changed that chance and lost 32 on-focus thoughts. hunt_behind s3 +1 thought/+1 disregard comes from `_unstick`
  (a disregard is an explicit, correct non-attention). Neither is attention leaving its focus.
- Fix (test only; limit unchanged at 25%): test/attend.mjs besiege spawn backs off from 24 m until 8 m inside the fence (here 16 m),
  so the scenario is the siege it says it is. Original saved at out/platform/followup/attend.mjs.orig.
  - baseline tree, fixed test: 433 thoughts, 397 about things, non-focus 23.7%, no response 11 (followup/attend_fixed_base.txt)
  - final tree, fixed test: 445 thoughts, 408 about things, non-focus 23.0%, no response 12 -> PASS (followup/attend_fixed_now.txt)
  - besiege now 21/25/25 on-focus thoughts per seed, 0 non-focus. New violation kind `you:feel` x1 (no response), within the 3% limit.
- Not done: the spawn-at-fence relocation itself is in rex.js (not mine). The `repeat` mode of attend.mjs (line ~160) has the same 24 m pattern
  (containers, not at the fence here; not changed).

## Task 2: one source of truth for reach (DONE, verifying)
- Shed/door trace (FU=1 node test/saltline.mjs door; added an env-gated trace line to test/saltline.mjs; out/platform/followup/door_trace.txt):
  door/3: verdict `food` from 17 s, hunger 0.93, fear 0, aff BRS (body can come) the whole time. Top utility is prowl 1.58-1.69 from 42 s
  to the end, yet from 61 s to 90 s the behaviour is `pause` at 6.3-7.5 m (one seize/close at 76 s, back to pause). So not appraisal
  choosing not to: something holds `pause` against the winning utility. Looking for it.
- **Found (door/3, out/platform/followup/door_trace2.txt):** from 61 s peril goes still -> rush (approach, stop 2) repeatedly, but the goal
  seen by the body is `approach/stop 8.6`: mind.js's "too close for comfort: give ground" block runs AFTER peril.apply and fires
  because the behaviour label is `pause` (peril.busy forces `pause`). So whenever the hips come inside personal-1.4 = 7.2 m it backs
  to 8.6 m; strike needs hips <= peril.reach() = 6.25 m. The hips hover 6.3-7.2 m, the rush times out (6 s), frustration, repeat.
  A fault (a gate overriding the strike's approach: the unreachable last metre), not appraisal: verdict food, fear 0, prowl top utility.
- Fix 1 (the fault): mind.js give-ground block now skips while `peril.busy` (still/rush/strike). General: no strike is undone by the
  comfort-distance rule that was written for watch/pause/stare. door rerun (door_trace3.txt): door/3 1 attack start, 1 death (was 3, 0);
  door/5 3 starts, 2 deaths (was 8, 0). minD 3.9 / 3.8 m (was 6.3 / 6.5).
- Fix 2 (single reach source): afford.js `reachJudge()`: the cheap geometric afford() answers first; once the besiege planner
  (nav.senseSpots) has worked the same place out, its answer overrides `reach` for 25 s (0 spots -> no reach; spots -> reach, stance =
  best spot's hips). `body` is not overruled (the planner places heads, not bodies). Places keyed by ground position to 1 m (afford
  used the person's middle, besiege the head: before, they could not even be compared). mind.js `_reach()` holds one judge; `_afford`
  (-> c.aff, read by U.besiege, U.snap, the besiege strike gate, hunt give-up, appraise `high`, thoughts `up`) reads it; besiege asks
  records every finished plan with `judge.plan()`. (A first version also had besiege reuse a recorded plan instead of re-planning;
  that raised siege wall ticks, tower 18 -> 165 and barn 0 -> 26, because a plan made from another standing point was reused; removed.
  Bisect: followup/bis2/, siege tower/barn seed 3 90 s.)
  Not unified: peril.js's strike reach (standoff + bite + 0.9 m from the hips) is a third measure; peril.js is outside my edit list.
- Correction after the first Saltline run: with the planner's "no spot" taken as "no reach", shed/3 lost its kill (the body walked to
  2.5 m, but peril is capped while walled and not reachable). The planner keeps a head 1.55 m off a person (a sensing pose), so 0 spots
  is not the measure of a bite. Now 0 spots removes reach only while the hips are further than a strike (standoff + bite + 0.9 m) away.

## Task 3: verification (DONE)
- platform.mjs: exit 0, all checks pass (followup/platform.txt; run before the correction above, which only changes afford.js's judge).
- saltline.mjs: exit 0, no hard failures (followup/saltline2.txt). vs SALTFIX after_fix.txt: door/3 atts 3->1, deaths 0->1, minD 6.3->3.9;
  door/5 atts 8->3, deaths 0->2, minD 6.5->3.8; shed deaths 1->1, minD 3.5->3.6; deaths over 15 runs 15 -> 17; worst stall 18 s (opening/5,
  unchanged); distal tail worst 1.22 -> 0.65 m.
- smoke fast --force --against baseline: exit 0, every test exit 0 (followup/smoke_fast.txt; hash 8441ce5abf94).

## Files changed
- src/sim/mind.js: import `reachJudge`; `_reach()`; `_afford` reads the judge; besiege asks `judge.planned()` before planning and
  records finished plans with `judge.plan()`; the give-ground ("too close for comfort") block skips while `peril.busy`.
- src/sim/afford.js: `keyOf` (shared cache key), `reachJudge()`.
- test/attend.mjs: besiege spawn kept 8 m inside the fence (original in out/platform/followup/attend.mjs.orig).
- test/saltline.mjs: env `FU=1` per-second trace line (behaviour, aff, verdict, utilities, peril stage, goal). No effect without FU.
- test/fu_besiege.mjs (new): attend's besiege scenario traced per second, `--src=` and `--back=`.
- out/platform/followup/: traces, bisect variants (bis/, mk.mjs), baseline src copy (base/src from /home/claude/rexbak), test outputs.
- smoke full (the run was cut by my own 10 min background limit just before gaze; gaze and navsoak then run by hand in the same cwd,
  raw outputs in out/smoke/8441ce5abf94-full/; no cache json for this hash). Exit codes: all 0 except predator_matrix 1 and peril 1
  (same as SALTFIX final); attend 1 -> 0. gaze, navsoak, peril, platform: output identical to SALTFIX final (a5deec347933).
- Siege, per structure, baseline / SALTFIX final / now: body-in-wall tower 175/18/**165** (x2), barn 556/0/**26**, warehouse 3668/25/25,
  containers 122/99/99, culvert 19/19/19, novel-slot 381/230/230; bend tower 597/580/592, barn 2905/1009/327, culvert 696/126/283,
  others unchanged from SALTFIX final. **Tower and barn wall ticks rose against SALTFIX final** -> bisecting.
- Bisect of the siege rise (final / no give-ground fix / no plan reuse / no judge): tower wall 165/165/18/165, barn 26/26/0/26.
  Cause: the plan reuse. Removed. Now tower 18 / bend 580, barn 0 / bend 1009 = SALTFIX final exactly.
- Saltline on the final tree (followup/saltline3.txt): exit 0, no hard failures. door/3 deaths 1 (minD 4.2, killed in a peril strike, so
  no attack start counted), door/5 3 starts, 2 deaths, shed/3 1 death (minD 3.5). Other rows as in saltline2.txt.

### Final tree: full smoke (hash 57e54a90fe6e; out/platform/followup/smoke_full.txt vs baseline, smoke_full_vs_saltfix.txt vs SALTFIX final)
- `--full --force --against baseline`: exit 0. Exit codes: all 0 except predator_matrix 1 and peril 1 (both 1 in baseline and SALTFIX final).
  attend 1 -> 0 (vs SALTFIX final). 400 numbers differ from baseline (full list in the file).
- Against SALTFIX final, every changed number:
  - siege_all, platform, peril, gaze, navsoak: **no number changed** (siege body-in-wall and bend exactly as SALTFIX final).
  - attend: non-focus 26.0 -> 22.6%, thoughts 411 -> 447, about things 362 -> 407, disregards 18 -> 19; besiege seeds 1/2/3 about-things
    0/20/5 -> 21/25/25 (the test fix); hunt_near s2 non-focus 9 -> 8, no-response 2 -> 1; hunt_near s3 no-response 0 -> 1;
    hunt_behind s1 15->16 thoughts, 13->14 about, it-not-focus 0->1 (n5); s2 16/16 thoughts/about, non-focus 6->7, no-response 1->2,
    it-not-focus 1->0; s3 19->20 thoughts, 16->14 about, non-focus 6->4, no-response 2->1; hunt_noise s3 22->21, 20->19, no-response 0->1.
  - afford (13): gatehouse/threat snout 18.3 -> 7.6 m, guard 8 -> 0 s, besiege 0 -> 9 s; culvert/threat snout 14.9 -> 7.1 m, guard 12 -> 8,
    besiege 4 -> 9; barn_door/food snout 3 -> 3.1; cave/food snout 9 -> 9.5; thought-kind counts (gatehouse want 3->2, belief 1->0,
    feel 0->2; culvert feel 3->4, expect 1->0).
  - active_wanderer: hungry s3 first hunt - -> 18 s, first seize - -> 27 s, death 14 s -> 55 s, predatory 8 -> 35%; starving s3 deaths
    3 -> 2 (14, 57, 70 s -> 14, 107 s), predatory 6 -> 8%; walking samples 177 -> 200, 73 -> 103.
  - predator_matrix: predatory locked 100 -> 99%; s3_hungry approaches prowl and seize 0 -> 1 each.
  - review_mind seed 7 drifts/freezes/runs: pop clusters 115 -> 116, top pop acc 2379 -> 3099.
  - score: warn 2 -> 3, fail 4 -> 3: only perf.ms_per_arena_step 0.644 (FAIL) -> 0.386 (WARN), a timing number smoke treats as noise.
  - thoughts_mind: total 181 -> 182, distinct 112 -> 114 (wander_near 40 -> 41); thoughts_attack: total 203 -> 201, distinct 131 -> 146,
    repeat rate 2 -> 1%, attack_behind 45 -> 37 thoughts.
- Fast tier (`--force --against baseline`, run before the last two corrections): exit 0, all tests exit 0.

## Unverified / not done
- peril.js's strike reach (hips + standoff + bite + 0.9 m) is still its own measure; peril.js is outside my edit list. The judge uses
  the same formula for its "already within a strike" exception, so they agree, but it is two copies of one formula.
- The judge's planner override lasts 25 s per place (1 m grid, same walkable component); the value is not tuned.
- attend.mjs `repeat` mode keeps the 24 m spawn (containers; not at the fence, not checked).
- The spawn-at-fence relocation in rex.js (a body put at the fence is thrown up to 52 m along it) is not addressed.
- The door seize variation is fixed for seeds 3 and 5 only; Saltline runs one or two seeds per encounter.
- The fast tier was not re-run after the last two corrections (plan reuse removed; strike exception); the full tier was.
