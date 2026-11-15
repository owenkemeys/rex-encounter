# Whole-body proportions (in progress)
Started 2026-11-14. Working in /home/claude/rex_skel only. Notes kept here as I go.

## Log
- Looked at legskin side/front/eye/tq: long deep trunk, belly ~knee height, legs read short and thin; arms sit low on the belly; front: legs converge under midline.
- Tools: `out/skel/props/envelope.mjs` (skins the real mesh on the CPU at a sim pose, measures the envelope in the body frame;
  `dump=NAME` writes the posed mesh), `out/skel/props/sil.py NAME [--ref NAME0]` (orthographic side/front/top silhouettes,
  0.5 m grid, hip line; `--ref` overlays an earlier outline in red). ~7 s + 1 s, no browser.
- Before (stand t=6): total 13.2 m, hip joint 3.15, back top over hips 4.43 (+1.28 over joint), over chest 4.77 (+1.62),
  belly 1.98 (0.63 hip), skull (skin) 1.94 m (0.147 L), knee 1.84.
- Finding: leg bones sum (femur+tibia+MT) 3.52 m vs Sue 3.26 m [D20]; total/leg-sum 3.75 vs Sue 3.77-3.93. So body
  LENGTH is not too long for the legs. What is off: the trunk stands far too TALL above the hip (deep back), the skull is ~25%
  long, belly low-ish (skeletal-consistent but not film), feet thin (length fine).
- Change 1 (rexgeo.js): head drawn at species `dims.headScale` 0.84 through the skull bone (skin skull 1.94 -> 1.61 m); Prim.sd
  returns metres in scaled frames. `headLen` 1.75 -> 1.47.
- Change 2 (rexgeo.js TRUNK rows 13-18, tail rows, hip shelf u 0.62->0.40): back top over hips 4.43 -> 4.12, along the back
  4.06-4.14; belly 1.98 -> 2.19 (0.69 hip), deepest under the chest, rising to the groin.
- Species: reachStop 4.75->4.47, spacing each -0.3 (personal 8.3, inspect [7.5,8.9], nudge 6.3, chase 6.7, bluff [7.7,10.2]).
  navBody kept 2.6 (trunk half-width unchanged). Review (t1/review2.txt) vs feet_after: noise-level both ways; sprint neck
  bends 235->6 ticks; idle-watching pops 87->91; stalk gains 8 ticks of toe contact (0.04 m). Baseline check: with headLen
  1.75 the review is identical to feet_after, so all differences come from the head length.
- Change 3 (stance): species `hipHeight` 3.15 -> 3.26 (standing) and new `dims.hipMove` 0.09 read by rex.js crouch
  (`(0.04 + DIM.hipMove) * m`), so the walking target is 3.17 (was 3.11). Plain 3.28 reproduced the earlier agent's
  over-extension (targets 31 ticks 0.12 m, run 2, sprint 4); the split removes all of it.
- Change 4 (rexgeo LEGSKIN/FOOTSKIN, paint): thighOut 0.28->0.34, shank [0.36,0.17]->[0.38,0.21], calf, knee, ankle, metatarsus
  ~+15%, toes width +19%, top +19%, claw 0.24->0.26 long and `clawOut` 0.07 past the sim's toe tip, claw colour 0x2a2520->0x4e463a.
- Change 5: species hips.kneeOut 0.2->0.3; rex.js arm root c.u -0.62->-0.48, c.f 0.1->0.18, c.l 0.5->0.48.
- Review after 3-5 (t1/review_a5.txt) vs feet_after: no over-extension; total pops 594 -> 592; idle-watching toe check 180 ->
  487 ticks but still 0.01 m deep (check radius 0.138 > skin toe half-width 0.114: skins ~4 cm apart); stalk 8 ticks 0.04 and
  shove/roar 9 ticks 0.02 toe contact are new; lure legs-pass-through 73 -> 12 ticks.
- Mind runs (review.mjs mind) differ a lot per seed (chaotic). 8-seed sweep `out/skel/props/mindseeds.mjs ROOT seeds..`
  (seeds 3 5 7 9 11 13 17 21, 100 s each): over-extension ticks / worst: before tree 75 / 0.31 (5 seeds); current tree with
  old stance 101 / 0.56; current tree 108 / 0.37 (6 seeds). Pops 840 / 845 / 830. Neck bends >35deg 3243 / 1619 / 1909.
  `overhook.mjs`: the worst cluster (seed 3) is a SWING foot landing 1.6-1.8 m ahead of the hips while accelerating out of a
  turn (hip 3.10, the same as the old walking height): step placement, not stance. Kept.
- Change 6: species backLen 2.85 -> 2.6 (shoulder-to-hip 3.06 -> ~2.8 m; total 12.92 -> 12.65 m); reachStop 4.22, spacing
  each -0.55 vs original. Arm root at the chest surface (c.l 0.6) with the upper arm angled out (c.l 0.12).
- Review after 6 (t1/review_a6.txt): pops 594 -> 596, neck bends much fewer, sprint 1 tick over-extension at 0.08 (threshold),
  new toe contact stalk 5x0.01, shove/roar 9x0.02; lure legs-pass-through 73 -> 6.
- Mind sweep after 6: over-extension 89 / 0.27 (before 75 / 0.31), pops 832 (840); foot twisted 461 / 1.46 (137 / 0.97): 302
  of them in seed 21 t~74 s, a pivot-into-walk during an approach (turning logic, untouched); knee backward 31 x 0.04 in seed 7
  t~84 s, a strike lunge braking from 3.1 m/s with hips very low (baseline seed 7 had hips-very-low 136 x 0.54). Not chased:
  both are existing logic reached by different encounter paths; kneeOut 0.2 gives the same numbers.
- Change 7: chest/belly ~8% narrower (rows 14-18 widths, belly ellipsoid 0.82->0.76 w); species hipHalf 0.36->0.41 (sockets
  0.82 m apart) with thighOut 0.34->0.30 (thighs' outer surface about where it was, inner thighs and knees apart). Review vs
  step 6 unchanged (t1/review_a8.txt). Arm inner paint 0.4->0.12 (stood-off arms read as pale sticks).
- Studio: cam=oside|ofront|otop (orthographic, `scale` px/m default 64, 1 m grid, ground 0.4 m above the bottom edge; logs `ortho`).
- Build OK (out/skel/props/dist); plain and #webgl page loads: 0 errors, body check ok, vbuf 6/8, low tier 36,600 tris (was 39,400).
- Claw colour settled at 0x383128 (0x4e463a merged into the toes).
- Smoke --force (fast tier, 150 s, all exit 0; t1/smoke.txt). score: head_in_collider 51 (feet_after) -> 166 FAIL, depth
  0.07 -> 0.29: test/score.mjs probes a FIXED 1.75 m head. A copy reading DIM.headLen (out/skel/props/score_headlen.mjs) gives
  0 ticks, 0 depth. test/siege.mjs hard-codes 1.75 too; out/skel/props/siege_headlen.mjs is the copy reading DIM.headLen.
- Siege chest-to-head max 1.71-1.75 (feet_after 1.72-1.74): not worse.
- Siege wall contact, 3 seeds (3,5,7) x all sites, `siegesum.py` (ticks by region / worst m):
  before tree: head 2598 / 0.35, neck 240 / 0.08, tail 414 / 0.20.
  head 0.84 (headLen 1.47): single seed barn 1150 / 0.33 (neck pushes into the gap); with headLen 1.75 back -> 97 / 0.20.
  So head revised to headScale 0.90, headLen 1.58 (skin skull 1.75 m), reachStop 4.33, spacing -0.4 vs original.
  head 0.90, back 2.6: head 863 / 0.24, neck 490 / 0.12, tail 7526 / 0.37 (one warehouse episode, seed 5, 4964 ticks).
  same, back 2.85: head 1817 / 0.17, tail 1776 / 0.38 -> the shorter back brings hips and tail nearer the walls.
- [03:25, after a server restart] Trying tailLen 6.6 -> 6.2 (tail 0.56 of length, total ~12.25 = Sue) for the tail contact.
  tail 6.2 (final): head 1297 / 0.23, tail 1357 / 0.38, neck 0; total 2654 vs 3252 before. Tail contact still above the
  before tree (414 / 0.20), spread over tower, containers, ruins, warehouse episodes. Kept; reported as open.
- Final review (t1/review_final.txt) vs feet_after: pops 594 -> 584; neck bends fewer; new: sprint over-extension 2 ticks 0.09
  (threshold 0.08), toe contact stalk 7x0.03, shove/roar 8x0.02; lure legs-pass-through 73 -> 8.
- Final mind sweep, seeds 3..21 (t1/mindseeds_final.txt): seed 5 FAILS: 942 ticks over-extended up to 3.26 m, knee backward
  ~1000, hips 1.07 m. Cause (peek.mjs/overhook.mjs): braking from an 8 m/s run while the mind sets freeze+stalk; `_swing`
  holds a swinging foot in the air on freeze+stalk (rex.js ~745), the body slides ~6 m with no step, both feet left behind.
  Reverting stance, back, head length, tail, hipHalf or kneeOut one at a time does not remove it; restoring the original
  reachStop/spacing does (different encounter path). Before tree seed 5: 12 ticks 0.10. Extra seeds 23..53: no such
  failure in either tree; over-extension before 33 ticks / 0.34, after 68 / 0.33. Not fixed: foot/freeze logic is out of
  my remit. Flagged for whoever owns the foot logic: a held swing should release (or the body stop) when the body moves.
- spacing restored to the original (personal 8.6 ...): standing 0.4 m nearer made gaze worse and led seed 5 into the freeze
  failure. reachStop stays 4.33 (geometry). Final: mind sweep over-ext 49 / 0.23 (before 75 / 0.31), seed 5 clean, pops 826
  (840); gaze 4.8% / 2.83% / 15 (feet_after 6.3% / 2.30% / 12); navsoak 35/35, stuck 5.9 s (5.8); review pops 584 (594);
  siege 3 seeds unchanged by spacing; stock siege chest-to-head 1.71-1.74 (1.72-1.74). Smoke --force: all exit 0; score
  FAIL on head_in_collider is the fixed 1.75 m probe (score_headlen.mjs: 0 ticks; same 4 fails as feet_after otherwise).
