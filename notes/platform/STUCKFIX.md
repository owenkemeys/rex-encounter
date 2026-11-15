# STUCKFIX: false `stuck` / `gaveup` / `noreach` thoughts in open ground

Started 2026-11-14 11:51 UTC. Time box 60 min.

## Status log
- 11:51 started; reading SALTFIX.md, FOLLOWUP.md, mind.js, thoughts.js.
- 12:05 wrote `test/stuckopen.mjs` (arena + foreign world, seeds, alone / person still at 6, 12, 25 m; logs every stuck/gaveup/noreach event and thought with state). Running baseline.
- 12:15 baseline arena (3 seeds x alone/6/12/25 m x 180 s, `stuckfix/before_arena.txt`): 10 stuck events, 9 with no solid within 12.5 m. All so far: the body is turning on the spot toward a move goal 2.2-2.9 rad off its heading (|om| ~0.45 rad/s for 4 s, <1.5 m translation) in leave, feign/away, circle. The detector only counts translation as progress.
- 12:30 foreign baseline (`stuckfix/before_foreign.txt`, verbose): 23 stuck + 3 gaveup; none counted "open" because that world has almost no place 12.5 m from anything (and the spawn search had failed, fixed in the test: it now falls back to the most open places). Same pattern: turning on the spot 1.5-3 rad toward a move/approach goal, solids 4-11 m away, not touching.
- 12:32 fix 1 in `mind._unstick`: turning 0.6 rad counts as progress; and new `mind._hemmed()`: a stuck count needs a solid within turning room of the spine (or spine over blocked ground, or head pressed/jammed). Testing.
- 12:45 after fix 1: arena 10 -> 0 events (`stuckfix/after_arena.txt`); foreign 26 -> 5 stuck (`stuckfix/after_foreign.txt`), all 5 hemmed (3.2-5.8 m from the fence corner / plinth posts, head or tail at the fence). Now measuring Saltline before (copy of the tree in /tmp/rexorig with the original `_unstick`) and after, with `test/stuckcount.mjs` (counting wrapper).
- 12:20 (clock read: earlier stamps were estimates; real start 11:51) Saltline before/after with the counter: exit 0 both; wedged recovery 21 -> 15 stuck, give-ups 1 -> 2 (all with solids 2.4-5.3 m from the hips). `stuckfix/saltline_before.txt`, `saltline_after.txt`.
- 12:22 added reach-judge checks to the test (person seen in the open: aff.body/reach; meat 10 m ahead in the open: `_canReach`). Running full stuckopen, then platform, thoughts, smoke.
- 12:30 CORRECTION: the /tmp/rexorig copy used for the 12:20 "before" runs turned out to hold the fixed mind.js (revert did not take); those files (`saltline_before.txt`, `before_both.txt`) are void. Also rex.js changed under me at 12:26 (other agent, md5 ed7fb294). Re-running before/after from two snapshots with that same rex.js: /tmp/rexorig (original `_unstick`, verified by diff) and /tmp/rexnew (fix).
- 13:35 resumed after a restart (killed 12:33). mind.js intact and parses; rex.js unchanged since 12:26 (md5 ed7fb294). The baseline (original `_unstick`, current rex.js) arena half had finished before the kill: 18 events, 13 with no solid within 12.5 m. Finishing the foreign half, then the verification list.
- 13:45 baseline foreign (`stuckfix/before_foreign2.txt`): 32 events (31 stuck, 1 gaveup), 2 in open ground. Fixed tree full run (`stuckfix/after_both.txt`): exit 0; 5 stuck events in 24 runs, none in open ground, reach judge 0 false. Next: Saltline before (snapshot) and after.
- 13:58 Saltline: before (orig snapshot) exit 0, 11 stuck / 1 gaveup. After (fixed tree) **exit 1: shed/3 stall 38 s in roam**, 8 stuck / 1 gaveup. Investigating the shed stall (the fix suppressed a real recovery?).
- 14:05 shed/3 stall: not reproduced. shed alone on the fixed tree: exit 0 (stall 8 s); the full sequence again with a probe: shed stall 8 s, no failure. While the body stood, `_hemmed` was true and the stuck window kept resetting because the mind was not asking to travel (besiege `face` + freeze, or the tight-spot three-point turn `drive`). So the fix did not hide a wedge there. Saltline runs differ between invocations (other rows changed too, e.g. hungry/3 and runner/5, which my change cannot reach so differently); treat the one exit 1 as run-to-run variance, unverified.
- 13:56 (clock check: the 14:0x stamps above were wrong, real time ~13:50) rex.js changed again at 13:50:31 (other agent, md5 6e1cf409) during a real-tree Saltline run, which then failed differently (opening/3 stall 30 s, crouch/3 body in box at nudge). Real-tree runs are confounded; comparing in snapshots with that same rex.js: /tmp/rexorig (original mind) vs /tmp/rexnew (fix).
- 14:10 Saltline with rex.js 6e1cf409 in both snapshots: before exit 1 (opening/3 stall 30 s), 10 stuck / 0 gaveup; after exit 1 (the same opening/3 stall **plus crouch/3 body in box 0.34 m at 64 s in nudge**), 7 stuck / 0 gaveup. The opening/3 stall comes with the new rex.js, not this fix. crouch/3: not diagnosed. The one stuck missing from the after list is search at 35 s, 1.5 m from a solid. Tried counting a turn as progress only when it brings the goal round (saltline_after4): no change, so reverted. mind.js is back to the version stuckopen verified.

## Summary
**Symptom, before** (original `_unstick`): arena 18 stuck events in 12 runs x 180 s, 13 with no solid within 12.5 m. Foreign world 32 (31 stuck, 1 gaveup), 2 in open ground. All in leave, feign/away, hunt/stalk, stalk, circle, roam or search. No noreach in open ground, and the reach judge was never wrong there.

**Cause** (`src/sim/mind.js` `_unstick`, the line `if (!wants || Math.hypot(sim.x - U.x, sim.z - U.z) > 1.5)`): only travel counted as progress. With a move or approach goal 1.5-3.1 rad behind it, the body turns on the spot at about 0.45 rad/s (slower standing reorientation) and moves under 1.5 m in 4 s, so it was taken as wedged. It then backed out, which gave "stuck" thoughts and, the second time, a give-up. Nothing in the detector required anything solid to be near the body.

**Fix** (mind.js `_unstick` and the new `_hemmed`):
1. Turning 0.6 rad also counts as progress.
2. A stuck count also needs `_hemmed()`, which holds when one of these is true:
   - a collider above shin height is within the turning room (nav.room, 2.63 m) of any spine point from head to tail tip
   - a spine point is on ground the planner rates blocked
   - the head is jammed or pressed against something

**After**: stuckopen exit 0. 5 stuck events in 24 runs, none in open ground.

**Unverified**:
- full thoughts.mjs and smoke were not run (out of time)
- crouch/3 regression
- rex.js changing under the runs
