# BODYFIX2 — remaining body-motion faults

Started 2026-11-14 (see log times, UTC). Time box 2 h. Pristine copies: /tmp/bf2_src_orig, /tmp/bf2_test_orig (and out/skel/bodyfix2/orig_*).

## Status
- [x] baseline (fast + full re-saved on the tree as found)
- [x] 1 start-up slide (legs move the body)
- [x] 1b freeze never leaves a foot hanging (coordinator, owner report)
- [ ] neck shape (coordinator): tried, reverted (gaze worse, targets not met); see Neck section and 15:36
- [ ] 2 tail into tall wall (not started: time)
- [ ] 3 tower head tick (not started; numbers below)
- [ ] 4 knee backward seed 7 / toe / sprint ticks

## Log
- 11:38 started fast+full --force --save-baseline (out/skel/bodyfix2/base_{fast,full}.txt)
- 11:45 fast baseline saved (be11bd094470): all 7 exit 0. Full running. Developing in a copy /tmp/rexdev so the baseline run is not disturbed.
- 11:55 full baseline saved (be11bd094470). Non-zero exits: attend 1, predator_matrix 1, peril 1 (as expected); all others 0. Fast: all 0.
- 12:02 fault 1 in progress in /tmp/rexdev (main tree untouched). Probe `out/skel/bodyfix2/start.mjs` (standing starts, brake, reverse, turn-back; times from command). Before: out/skel/bodyfix2/start_before.txt (first lift 0.84-1.42 s after the command, after the body already reached 2 m/s in burst). Construction v1: `_support` (stance room from leg geometry over time to next foothold caps the commanded speed; the deficit steps the foot), start step at once from rest, swing foot carried within reach of the current hip. Tried a gait "trail" limit on stance room: capped sprint at 8 m/s (stance room / swing time equals the current speed by construction, so it could never accelerate); removed.
- 12:22 coordinator added fault 1b (owner report: foot held up while watching). Fault 1 + 1b integrated into the main tree (src/sim/rex.js, test/review.mjs). Probe before/after: out/skel/bodyfix2/start_before.txt, start_after1.txt. Drive authority (max accel) now read off the requested speed (cap had cut run-up acceleration: 6 m/s at 2.85 s vs 2.35 s; now 2.43 s).
- 12:30 fault 1/1b construction complete in main tree (support model + finish-the-step freeze). Two extra pieces were needed beyond v1, both the same rule applied to motion it had not seen: a strike lunge (ux,uz) moving the hips over planted feet (counted against the legs' room; the lunge itself is now only as strong as the support allows) and a foot whose leg is about to run out lifting at once (no double-support wait, no weight shift). Running review/fast smoke.
- 13:34 restart (killed fast smoke at 12:33). rex.js intact (12:26 version with the lunge bound). NOTE: src/sim/mind.js was changed at 12:04 by the mind agent, after the 11:55 smoke baseline: smoke diffs against baseline include that change. My review before/after pairs (review_before_newchecks.txt vs review_after1.txt) both use the 12:04 mind.js.
- 14:20 fault 1/1b settled after sprint fixes (stance reach R 0.95 RMAX, swing hurried when the stance runs out, swing pull fades before touchdown, strike lunge damped at running speed). Fast smoke vs baseline: all exit 0 (out/skel/bodyfix2/f1_fast.txt). Same-mind "before" (src with original rex.js, current mind.js: /tmp/rexB) for review: out/skel/bodyfix2/review_before_samemind.txt; after: review_after1.txt. Concern: siege culvert body-in-wall 0 -> 355 and warehouse 10 -> 110 in the fast tier (seed 3 only; trajectories diverge: the animal now besieges the culvert to 3.4 m where before it stood off at 12 m). Not yet diagnosed.
- 14:20 coordinator added the neck-shape item (SKIN3.md "For the motion engine"); doing it before the tail.
- 14:36 neck: rise spread over joints 19-23 (NECK_SPREAD, sim only; the skin's bind keeps NECK_ROOT) and the skull entry tip following the neck's rise (0.6 rad up for a raised head, ~0 for a low one; was a fixed 0.24). Pitches before/after: out/skel/bodyfix2/neck_before.txt, neck_after.txt.
- 14:42 neck: the raised-head entry tip (0.6) was dropped: it put review neck-bend>35deg ticks 521 (baseline) -> 801. Kept: NECK_SPREAD and an entry tip lowered only for a low head (0.24 down to -0.1): review neck-bend ticks 274. Stalk's nose-up hook at the skull +12 -> +1 deg, largest step between neck segments stand 22->22, walk 24->23, stalk 27->22 deg. Not met: walk segments <= 35 deg (head pivot 0.85 m above joint 18 over a 1.75 m neck needs ~30 deg mean with both ends near level) and stalk pivot within 0.3 m of joint 18 (-0.49 m): both are set by the head's height targets in _head, not by the neck fit; not changed.
- 14:48 tower (siege tower 3 90, same mind): before 68+68 head ticks, after 21+21; culvert 0 -> 355; barn 895 -> 43; warehouse 41 -> 110. Fault 2 (tail) and fault 3 (tower head tick) not started: out of time. Running final full smoke.


## Fault 1: the body slides before the first step (DONE)
- **Cause** (as BODYFIX found): from rest the only stepping push was `_feet`'s initiation bonus (+0.8, gated on speed < 0.35 m/s), so the first lift waited until the body had already drifted; once moving, nothing related the hips' travel to what the planted feet could carry. Same gate let a reversal into backing slide 1.1 m (mind seed 11).
- **Construction** (src/sim/rex.js), one rule: the body is moved by its legs.
  - `_room(foot, dir)`: how far the hip over a planted foot can still travel along the hips' actual direction (gait velocity plus any lunge/shove) before that leg runs out of length, from the leg's own geometry (heel rolled to 0.8 rad, 0.95 of RMAX). No tuned distances.
  - `_support(vT)`: the speed the legs can deliver = room of the foot that will carry / time until a new foothold (remaining swing, or weight shift + swing with both feet down; a held foot never lands, so it gives none). The commanded speed is capped by it (`vReq` keeps what was asked); drive authority (max acceleration) still comes from what was asked.
  - Stepping follows the deficit: with both feet down, the foot to go next goes (need >= 1.05) when the ask exceeds the support, when the body's own speed would overrun the stance before a step could land, or once two planted feet have carried the hips past the gait's own double support ((2 duty - 1) x step). From rest the trailing foot is committed at once (initiation +1.05, not +0.8), so the first thing that happens is the 0.24 s weight shift and the lift. A foot whose leg is about to run out lifts at once (no double-support wait, no weight shift).
  - The swinging foot is carried within the leg's reach of the hip as it is now (fading out before touchdown), is hurried when the stance leg would run out before it lands, and a strike lunge is only as strong as the support allows (and little on top of a run).
  - Braking/held foot and reversals are the same rule (room is along the way the hips actually go).
- **Responsiveness** (out/skel/bodyfix2/start.mjs; s from command; before -> after): first lift walk 1.18->0.24, run 8 1.01->0.24, burst 0.84->0.24, reach 6 1.42->0.53 (0.28 notice phase), sprint 0.98->0.24; brake 0.36->0.04, reverse 0.56->0.07. To 2 m/s: walk 1.49->1.52, run 1.00->0.98, burst 0.66->0.65, reach 1.61->1.61, sprint 0.95->0.93. To 6 m/s: run 2.35->2.45, burst 1.44->1.52, reach 3.80->3.86, sprint 2.22->2.31 (0.06-0.10 s slower to 6 m/s; to 2 m/s unchanged). Longest hip travel with no step: 0.79-1.01 -> 0.47-0.72 m.
- **Mind review** (same mind.js both sides; seeds 3, 5, 7, 11; review_before_samemind.txt -> review_after1.txt): hips slide with no step 7+116 ticks -> 0; leg over-extended worst 0.17/0.09/0.23/0.28 -> 0.11/0.12/0.25/0 m; hips very low 14 -> 0. Worse: foot twisted vs body 72/10/0/0 -> 58/42/0/87 ticks, ankles crossed 0 -> 22 (seed 11), pop clusters up ~10-20% (most are a pre-existing mid-swing neck spike, 300-400 m/s2 in joints 20-25 with a smooth trunk, now crossing the threshold more often because the gait phase moved; not chased).
- **Score --quick** (arena): leg_overextension_max 0.034 -> 0.077 (PASS -> WARN; sprint_12 after its turn), joint_acc_max 1652 -> 2678 (WARN both).

## Fault 1b: a freeze never leaves a foot hanging (DONE)
- **Cause**: `_swing` held a swinging foot in the air (rate -> 0) for as long as freeze + stalk lasted over a still body (the owner's screenshot).
- **Construction**: the hold is gone (I could not make a held foot read as intention, so it is removed; the sore-foot hold for an injury remains). On a freeze mid-step the step is finished, 1.5x faster: early in the swing (u < 0.3, not turning) the foot is put back where it lifted (turned to the current heading), later it completes a short step under the body (the swing target at zero speed). Starting from a freeze therefore starts from two feet.
- **Check** (test/review.mjs): `foot hanging while still (s)`: a foot off the ground longer than 0.8 s while hip speed < 0.3 m/s, any behaviour. Mind seeds 3/5/7/11: 0/233/648/660 ticks (worst 2.7/4.3/6.3 s) -> 0/0/0/0. Scripted: 0 -> 16 ticks, worst 0.87 s, in `stalk` (a deliberate slow stalk step while turning, the foot moving the whole time).

## Neck shape (TRIED, REVERTED at 15:36: numbers below are for the reverted version)
- Pitches (deg, segments ending at joints 11-25), before -> after:
  - stand: 22 44 59 58 50 38 21 -> 18 40 55 60 54 40 21 (largest step 22 -> 22)
  - walk: 28 43 49 41 31 17 0 -> 17 36 47 48 40 23 0 (24 -> 23)
  - stalk: 7 -16 -30 -36 -31 -15 +12 -> 7 -14 -27 -33 -30 -20 +1 (27 -> 22; the nose-up hook at the skull is gone; head pivot -0.46 -> -0.49 m vs joint 18)
- Review neck-bend>35deg ticks: 521 (baseline) -> 274.
- Not met, and why: the shape is set by the fit's end conditions (head position and the skull's entry line), not by how the rise is distributed (three spreads gave nearly the same pitches). With the head pivot 0.85-1.0 m above joint 18, a 1.75 m neck and both ends near level, the middle must exceed 35 deg. Meeting the brief needs a lower head target in _head (or the back sharing the rise), and in stalk a head ~0.2 m higher. A raised-head entry tip (0.6) did flatten the hump but put neck-bend ticks to 801, so it was dropped.

## Tests changed
- test/review.mjs: `foot hanging while still (s)` check (fault 1b); mind seeds now 3, 5, 7, 11 (5 is the standing-start slide seed). Note: adding seed 5 changes the later seeds' runs (the mind seeds share state across runs), so smoke's review_mind numbers for seeds 7 and 11 are not comparable with the baseline's.

## Files changed
- src/sim/rex.js only (`_support`, `_room`, `_feet`, `_lift`, `_swing`, `_snapStep`, `_locomote`, `_posture` windup, `_neck`/`_neckFK`; NECK_SPREAD is internal; NECK_ROOT, IDX, LEG, PS unchanged). No species, mind or view file.
- Scratch: out/skel/bodyfix2/*.mjs (start, trace, mindtr, scoremo, neckpitch, popl, bind, cmpwalk, sw, spk).

## Unfinished / unverified
- Faults 2 (tail into a tall wall), 3 (tower head tick) and 4 not started. Siege seed 3 alone, same mind: tower 68+68 head ticks -> 21+21; barn 895 -> 43; warehouse 41 -> 110; culvert 0 -> 355 (the animal now presses the culvert to 3.4 m instead of standing off at 12 m: trajectory change, not diagnosed).
- mind.js was changed by another agent after the smoke baseline (and again during this pass), so smoke diffs mix both changes; same-mind comparisons were made by swapping rex.js only (/tmp/rexB).
- The sprint probe runs into the arena fence at ~14.9 s in both trees (before 27 over-extended ticks, after 31, worst 1.13 m at the crash).
- 15:14 saltline: opening passes now; crouch/3 fails: tail4/tail5 (proximal tail, counted as body) 0.32 m inside a 7.8 m box at 28.8 s, hips still, inspect phase (the tail root swung into it while it faced round). Tried: tail-root push 0.3->0.6 in _bodyCollide (moved the body: crouch/3 then stalled 42 s in the mind's unstick, a different trajectory); no backing with the tail against something during a reach (72 samples: the tail root stays lodged). Both reverted. Not resolved. Running final full smoke.
- 15:35 final full smoke vs baseline (out/skel/bodyfix2/final_full.txt; mind.js differs from the baseline's): exit codes no worse (attend 1 -> 0; predator_matrix, peril 1 as before). siege_all body-in-wall total 1301 -> 784 (tower 89 -> 21 each, barn 895 -> 10, novel-slot 125 -> 66; worse: warehouse 10 -> 328, containers 93 -> 174, gatehouse 0 -> 65, culvert 0 -> 99). navsoak goals reached, stuck 5.5 -> 5.6/6.0 s. score 22/1/4 -> 21/3/3 (leg over-extension 0.034 -> 0.077 WARN). GAZE WORSE: all >60 deg 1.6 -> 7.5 %, beyond-neck 0.91 -> 3.22 %. Same mind, gaze 3: original rex.js 3.2 % / 0.94 %; fault 1 + 1b without the neck change 6.2 % / 2.53 %; with it 7.5 % / 3.22 %.
- 15:36 the neck change is REVERTED in src/sim/rex.js (it made gaze worse and missed its targets); kept at out/skel/bodyfix2/rex_with_neck.js. The tree now has fault 1 + 1b only. Smoke baseline NOT re-saved (gaze worse, saltline crouch/3 fails, several siege structures worse). platform passes in the full smoke run (exit 0); saltline.mjs crouch/3 fails (see 15:14), opening passes.
