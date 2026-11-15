# BODYFIX — body-side faults in rex_merged

Started 2026-11-14 ~04:19 UTC. Time box 2 h. Pristine copies of src/ and test/ at /tmp/rexm_src_orig, /tmp/rexm_test_orig.

## Status
- [x] baseline
- [x] 1 foot (held foot fixed; start-up slide not) held up / body slides
- [~] 2 tail (improved) in walls
- [ ] 3 head (not changed)/neck against walls, derived standing distances
- [x] 4 old legs-cross check
- [ ] 5 small review ticks

## Log
### 04:34 baseline (tree hash aaa066faa57c, original fixed-1.75 m head probes)
- platform.mjs exit 0, saltline.mjs exit 0 ("no hard failures"; worst distal-tail depth 1.18 m, opening/8).
- smoke full: exit non-zero at baseline: **attend 1** (no response 17/433 = 3.9% > 3%; non-focus 23.9%), **predator_matrix 1**, **peril 1**. All others 0.
- smoke fast: all 0. score: 20/27 pass, 2 warn, 5 fail (joint_acc_p99, head_in_collider 168, neck_skull 1136, distinct_used, perf).
- Saved as out/skel/bodyfix_baseline0-{full,fast}.json.
- Then test/score.mjs and test/siege.mjs: head probes read `sim.species.dims.headLen` (1.58) instead of fixed 1.75.
- test/review.mjs: new check `hips slide with no step (m)`: horizontal hip travel while no foot is in a progressing swing (a held foot, sw.rate <= 0.5, does not count as stepping); flags past 1.0 m. Calibration on the current tree: scripted scenarios max 0.68-0.87 m (double support), mind seeds 3/7/11 0.83/1.24/1.13 m. (A step-length-relative first version had too little margin: 0.93 of allowance in run 8.)
- 04:47 re-saving smoke full+fast baseline with the head-length probes and the new check (results below).

### Fault 1 investigation
- The PROPORTIONS seed-5 held-foot slide (spacing - 0.4) does not reproduce on the merged tree (`out/skel/bodyfix/slide.mjs`, SHRINK=0.4): the mind no longer drives that path. The rule is still there: `_swing` holds a swinging foot on freeze+stalk regardless of body speed.
- The new check finds a second form of the same fault on every tree: from a standstill into a prowl (seed 5, 70.9-71.8 s) both feet stay planted while the body accelerates to 3.3 m/s and travels 1.25 m; the hips sink to 2.45 m. Cause: the initiation bonus in `_feet` (`need += 0.8` for the trailing foot) applies only while spd < 0.35, so it vanishes as soon as the body moves, before any foot has lifted; above that, `lagTol` grows with speed so `need` stays < 1.
- 04:50 full baseline re-saved (hash aaa066faa57c, probes fixed): same exit codes (attend, predator_matrix, peril = 1; rest 0). score 22/27 pass, 1 warn, 4 fail; head_in_collider 168 -> 0 PASS with the true head length.
  siege all 3 90 at this baseline, body-in-wall / neck-bend ticks: tower 88/518 (x2), barn 895/2110, warehouse 106/0, containers 93/1605, ruins 0/66, gatehouse 0/167, culvert 0/174, novel-slot 125/68, novel-under 0/117.
  (These are not the SALTFIX table's numbers: that table was for the pre-merge tree.)
- 04:52 server restart killed the fast re-save mid-run; re-running it. /tmp scratch survived.
- 05:01 fast baseline re-saved (all exit 0). Applying fault-1 fix.
- 05:08 fault 1 code in (hold only over a still body; double-support travel rule; swing timed for the landing pace). Running fast smoke vs baseline.

## Fault 1: a foot held up leaves the body sliding (DONE for the held foot; start-up slide found, NOT fixed)
- **Cause.** `_swing` held a swinging foot in the air (sw.rate -> 0) whenever freeze && stalk > 0.4 in mid-swing, without asking whether the body was still moving. Freeze sets vT = 0 and brakes at up to 4.2 m/s2 on the one planted foot, so from a run the hips travel on for metres over a planted foot that never lifts, and the foot in the air never lands.
- **Reproduced** deterministically with a scripted scenario (`out/skel/bodyfix/frz.mjs`; also added to review.mjs as `freeze from a run`: pace 8, freeze+stalk at 6 s). Original code: from 8 m/s at six onsets, hips slide 4.0-4.7 m with no step, 600+ ticks over-extended (worst 3.1 m), hips 1.2-1.3 m too low; from 4 m/s 2 of 6 onsets slide 1.3-1.4 m. Fixed code: 0 slide ticks, 0 over-extension, 0 hips-low in all 12 (most no-step travel 0.79/0.86 m = normal double support).
- **Fix** (rex.js `_swing`): a foot is held only over a still body (|v| < 0.3 m/s and shove velocity < 0.15). While the body moves the step completes; once stopped the next step can still be held. Applies to the sore-foot hold too.
- **Check** (review.mjs): `hips slide with no step (m)`: hip travel while no foot is in a progressing swing, flagged past 1.0 m. review.mjs only reports (exit code unchanged by issues).
- **Found, not fixed: the start-up slide.** Setting off hard from a stand (mind seed 5, 70.9-71.8 s; seed 7 74.9 s; seed 11 48.7 s) both feet stay down for 1.1-1.25 m while the body reaches 3 m/s. Cause: `_feet`'s initiation bonus (need += 0.8) is gated on spd < 0.35 and vanishes before the first lift; `lagTol` grows with speed so need stays < 1. Tried (1) a double-support travel limit (lift the trailing foot once double support has carried the hips past the gait's own double-support stretch): slide 1.25 -> 0.64 m but the stance leg then over-extended (score leg_overextension_max 0.034 -> 0.050 WARN; review sprint 2 -> 6 ticks); (2) plus a swing timed for the landing pace: sprint hips very low 100 ticks, score 0.072. Two patches each moved the fault into over-extension, so I stopped (the construction question: from a stand the body's acceleration outruns any first step; the right fix is probably to limit double-support thrust until the first foot is up, in `_locomote`). Both removed; only the hold fix is in.
- fast smoke vs baseline after fault 1: exit 0; only change is the new review scenario's numbers (out/skel/bodyfix/f1_fast.txt).

## Fault 2: tail in walls (IMPROVED, not eliminated)
- **Cause** (traced with `TAILDBG=1 node test/saltline.mjs opening`, an env-gated trace line added to saltline.mjs): the deep cases are the tail pointing *straight into* a tall wall behind the hips (opening/3 40.6 s: heading -z, hips 5.9 m from a 5.2 m-high container face, tail 6.2 m; tip 0.95 m inside while standing still). `_tail`'s contact bend uses only the push component along the pelvis' left axis; a wall the tail points into pushes it back along its own length, so the bend was ~0.02 rad/joint and nothing else acted (no lift either: the wall is too tall). The per-node ease-out turns a segment about its parent toward the push, which for an axial push is no turn at all.
- **Fix** (rex.js `_tail`, one construction): an axial push (toward the hips, larger than its sideways part) is turned into a sideways curl of the same size, to the side the tail already leans (sideways part, else its bend, else yawTot), kept while the contact lasts (0.5 s memory) so it never flips; and the "curls only so far round" cap rises from 0.9 to 1.6 rad with such a contact, so it can lie along the wall. Bends stay rate-limited and per-joint bounded (+-0.2), so no pops. The tail does not move or steer the body (an attempt to stop backing when the tail touched behind caused a 26 s stall in opening/5 and was removed).
- **Numbers.** Saltline distal-tail samples in box (15 runs): 307 -> 133, worst 1.18 -> 1.21 m (the worst is now one case, crouch/3: hips 5 m from a 5.5 m wall at an angle, tail fully curled and still reaching it; a geometric limit unless the body moves or the tail lifts 2 m). Excluding crouch: 246 -> 31, worst 1.18 -> 0.46.
  Siege all, seeds 1/2/3, 90 s (`out/skel/bodyfix/tailprobe.mjs`, siege's own joint measure): tail-in-wall ticks 360/433/54 = 847, worst 0.32 m -> 231/213/0 = 444, worst 0.17 m. Tip acceleration max unchanged in size (<= 840 m/s2 before and after).

## Fault 4: the old `legs pass through each other` check (REPLACED)
- Evidence (env-gated stats, scripted review + mind seeds 3/7/11 on the current tree): at every tick it fired (8-70 per scenario), the ankles' sideways gap was 0.26-0.42 m, they were **never on swapped sides** (0 of ~400 ticks), and the 3D shin/metatarsus gap was 0.42-0.76 m (median 0.44-0.70) against the 3D check's 0.30 m contact line. It measured a gap the new 0.38 m walking track (2 x gait.track) makes normal, not a crossing.
- Change (review.mjs): it now flags `ankles crossed (m)`: ankles fore-aft within 0.5 m and on swapped sides (worst = how far across). Contact stays with `shanks touch (3D gap m)`. The old issue's numbers disappear from smoke diffs by design.
- 05:32 running full smoke vs baseline, then platform and saltline (final tree).

## Fault 3: head and neck against walls (NOT CHANGED; premise re-measured)
- The rises quoted (warehouse 26 -> 165, ruins 407 -> 665, novel-slot 0 -> 219) are SALTFIX's numbers on the pre-merge tree. On this merged tree, siege all seed 3 90 s at baseline gives neck-bend ticks warehouse 0, ruins 66, novel-slot 68; the large ones are barn 2110 and containers 1605. I did not get to a diagnosis or a neck change in the time box; `/home/claude/rex/out/merge2/NECK7.md` was not read.
- `reachStop` is already derived from head + back (4.33 m, PROPORTIONS.md). `spacing`: deriving it as "old value minus the 0.42 m shorter reach" is the -0.4 m variant PROPORTIONS.md measured: gaze got worse (the "beyond reach" share is an angle off the chest, and standing closer makes the same sideways offset a larger angle), and it sent mind seed 5 into the held-foot slide, which fault 1 has now fixed. So the gaze rise does not argue for nearer standing; I left `spacing` as fixed numbers. Unverified on this tree: a gaze run with the -0.4 m spacing after the fault-1 fix.

## Final tree (05:50): verification
- `node test/smoke.mjs --full --force --against baseline` (out/skel/bodyfix/final_full.txt): exit 0; exit codes identical to baseline (attend, predator_matrix, peril 1; all else 0). 181 numbers differ.
  - siege body-in-wall: warehouse 106 -> 10; tower and tower#1 88 -> 89 (+1 head tick each: a strict rise of 1 tick, below anything I can call a change, but it is a rise); barn 895, containers 93, novel-slot 125, others 0: unchanged. Total 1395 -> 1301.
  - siege neck-bend: tower 518 -> 520, rest unchanged.
  - gaze beyond-the-neck share 1.24% -> 0.91%. score unchanged (22 pass / 1 warn / 4 fail; leg over-extension 0.034). attend no-response 17 -> 12.
  - navsoak: goals reached as before; stuck 5.6/5.9 -> 5.5/5.5 s.
  - active wanderer hungry s3: the one hunt label moved (68 s -> none) while its second death came sooner (87 -> 57 s); chaotic single seed, not slower to act in the sense of reaction.
- fast tier after fault 2 (bodyfix/f2_fast.txt): exit 0; warehouse body-in-wall 106 -> 10, but the warehouse siege (seed 3) diverged at 60 s into listen/ambush instead of besieging (snout inside 1179 -> 0 ticks): a chaotic trajectory change from the tail no longer resting in the wall at 50 s; not investigated across seeds.
- platform.mjs exit 0, saltline.mjs exit 0, no hard failures (tail 133 samples, worst 1.21 m in crouch/3).
- **Smoke baseline NOT re-saved**: the tower +1 tick breaks "body-in-wall does not rise" taken literally.

## Tests changed
- test/score.mjs, test/siege.mjs: the head probes read `sim.species.dims.headLen` (1.58 m) instead of a fixed 1.75 m. score head_in_collider 168 -> 0 ticks at baseline.
- test/review.mjs: new `hips slide with no step (m)` check (fault 1); new scripted scenario `freeze from a run`; the old ankle-gap check replaced by `ankles crossed (m)` (fault 4); env-gated stats line (SLIDE=1).
- test/saltline.mjs: env-gated `TAILDBG=1` trace of deep distal-tail samples (no output or number change otherwise).

## Files changed
- src/sim/rex.js: `_swing` (hold only over a still body); `_tail` (axial contacts curl to a side, larger curl cap with such a contact, `tailBack`). Nothing else; no IDX/LEG/PS change. No mind file and no species field changed; no src/view file touched.
- tests above. Scratch tools: out/skel/bodyfix/{slide,frz,tailprobe,rev1}.mjs. Pristine copies: /tmp/rexm_src_orig, /tmp/rexm_test_orig; original baselines: out/skel/bodyfix_baseline0-{full,fast}.json.

## Unfinished / unverified
- Start-up slide (fault 1, second form): found and diagnosed, not fixed (two patches moved it into over-extension; probably wants a double-support thrust limit in `_locomote`). The new check reports it at baseline in mind seeds 7 (40 ticks, 0.24 m) and 11 (21 ticks, 0.13 m).
- Tail: crouch/3 residual (1.21 m) where the hips stand closer to a tall wall than the curled tail clears; no lift-over-low-wall case was found to test the lift path.
- Fault 3 neck: not diagnosed or changed; spacing not derived (reasoning above, no new gaze run).
- Fault 5 (knee backward in mind seed 7, toe and sprint ticks): not started.
- review.mjs reports issues but does not exit non-zero on them, so "fails" means "is reported".
