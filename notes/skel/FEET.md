# Feet and legs: audit items 4 and 5 (legs only), and the leg skin

Done in `/home/claude/rex_skel`, 00:05 to 01:20. All four scope items are in, and the tree works. The sim is still a fixed 120 Hz step, seeded, with no renderer code. `IDX`, `LEG` and `PS` keep their layout. `/home/claude/rex` and the mind files were not touched.

## Files changed
- `src/sim/rex.js`
  - New: `FOOT_DEFAULT` and `this.FT` (overridden by `species.foot`), and `HIPS_DEFAULT.kneeOut`.
  - New method `_toeContact`; `_leg` has a new heel and peel placement; `_toes` has new stance targets.
  - The landing tilt and height rule in `_swing`, and the two-part footprint rule.
  - Ankle offsets scaled by `DIM.meta`; the spread clamp in the pose raised from 0.5 to 0.7.
- `src/species/tyrannosaurus.js`: `dims` (femur, tibia, meta, toe, hipHeight), `gait.track`, `hips.kneeOut`, `hips.footprint`, and the new `foot` block.
- `src/view/rexgeo.js`
  - Toe lengths and flesh now come from `species.foot`.
  - New `LEGSKIN` (exported): the thigh masses sit outside the hip socket; heavier knee, calf, shank and metatarsus; toes 15% wider.
- `test/review.mjs`: a new check, `toes of the two feet touch (gap m)`. It uses the skin's toe math and fires at a gap under 2 x the toe flesh radius. Nothing else in the file changed.
- `out/skel/measure.mjs`
  - Reads toe lengths from the species.
  - Adds per-toe sink, loaded contact and leave order, splay at lift-off and MTP height at lift-off.
  - Adds four rough-ground runs (`roughWalk`, `roughWalkB`, `roughSlow`, `roughBerm`) on the real terrain with obstacles removed. The berm runs are the rough ones.
- Scripts in `out/skel/feet/`:
  - `brief.py`, `lat.mjs` (lateral leg layout), `rev2.mjs`, `ridge_dbg.mjs`, `sink_dbg.mjs`, `tw_dbg.mjs`, `mind_toe_dbg.mjs`, `over_dbg.mjs`.
  - `shot.py` (port 8768, serves `out/skel/dist_feet`), `views1-4.py`.
  - `base/` is a clean copy of the pre-change tree for baseline runs. `p3/` and `pre4/` hold the state before item 4.
- Not touched: `src/view/body.js`, `effects.js` (footprint decal), mind, nav, terrain, arena, `dist/`.

## Species fields added or changed
- `foot`:
  - `toes [0.62, 0.78, 0.62]` (was 0.56/0.70/0.56 in rexgeo), `split 0.5`, `flesh 1.15`, `pad 0.06`.
  - `heelRise {start 0.4, walk 0.82, slow 0.68, run 0.6}`, `peel 0.32`.
  - `splay {free 0.28, loaded 0.57, roll 0.45}`.
  - `conform {prox [-0.45, 0.45], dist [-0.55, 0.6]}`, `tiltMax 0.45`, `tiltRoll 0.12`.
- `dims`: `femur 1.42, tibia 1.30, meta 0.80` (was 1.28 / 1.42 / 0.92); `hipHeight 3.15` (3.12); `toe 0.78`.
- `hips.kneeOut 0.2` (the engine constant was 0.1).
- `hips.footprint {heel 0.5, toe 0.55, r 0.24, fan {a0 0.35, a1 0.62, r 0.36}}`: a narrow heel-to-toe strip plus the toe fan.
- `gait.track`: half width 0.44 standing (was 0.30), 0.19 walking (0.16), with the drop now complete by 1.1 m/s.

## Per item

### 1. Thigh and leg masses (`rexgeo.js`, plus `kneeOut` and `track`)
What changed:
- The four thigh ellipsoids now stand 0.17 m outside the hip socket, along the femur frame's lateral axis.
  - Thigh centres are 0.53 m from the midline (was 0.36).
  - The inner thigh surfaces now leave a gap of about 0.18 m; before, the two thighs overlapped by about 0.22 m.
- The knee mass is larger and offset outward.
- Shank cone radius 0.38 / 0.21 (was 0.30 / 0.15); calf 0.33 x 0.35 (was 0.25 x 0.29).
- The metatarsus is a 0.205 / 0.165 cone plus a mid-shaft ellipsoid (was 0.15 / 0.12); ankle knob 0.215 (0.17).
- The knee plane leans out (`kneeOut` 0.2): knees sit 0.46 m from the midline walking and 0.52 m slow (was 0.36).
- Walking track half width is 0.19.
- The hip sockets stay 0.72 m apart. The narrow stance was not the main cause; the skin was.

What the renders show:
- From the front the legs read as two thicker, separate columns.
- They still converge toward the feet, and the thighs are hidden behind the deep belly.

### 2. A living foot (`_leg`, `_toeContact`, `_toes`, `_swing`)
- **Stance phase.** `foot.phi` is hip travel since touchdown over 0.92 of the gait's nominal stance travel.
- **Heel rise.** It starts at `heelRise.start` and grows linearly to the speed's lift-off angle. Once the other foot is down, unloading this one (with phi past 0.5) completes it. The old leg-geometry floor and the sore-foot rule are kept.
- **Peel.** Digit III peels proximal to distal:
  - The MTP joint lifts first, and the proximal phalanx turns up about the joint between the phalanges, by beta.
  - `peel` (0.32 rad) later, the distal phalanx turns up about the claw tip, which stays fixed until lift-off.
  - Toes II and IV release their middle joint at beta 0.02-0.2 and their tips at beta 0.12-0.32, then lift clear.
- **Per-toe contact.** Every tick, each toe joint still in contact is solved onto the terrain height under it, within `conform`. Solutions are kept on the anatomical branch, so a segment never folds back under its joint. A joint already off the ground is never allowed below it. The springs chase this solution, and the pose carries the solved angles.
- **Splay.** It opens with load to `loaded` and closes by `roll` x 0.45 as the heel comes up.
  - When the two feet stand close beside each other, the fans close in proportion to the distance between them. Without that the inner toes crossed when standing (see tests).
- **Tilt.** The fixed 0.3 rad tilt cap is replaced.
  - The foot plane pitches with the mean ground under the whole foot, up to `tiltMax` 0.45.
  - It rolls only `tiltRoll` 0.12 about its length: the ankle is a hinge. With full roll, a foot on a side slope leaned its metatarsus 0.36 m into the other leg; that was the ridge shank contact.
  - The toes take up the rest of the slope.
- **Landing height.** The support plane through the ground under the pad, lifted only by what the toes cannot reach.
  - This replaces "highest ground anywhere under the foot", which left the MTP pad floating on slopes; that fault was already in the baseline.
  - It is a construction change, not a patch on top of the fit.

### 3. Bigger feet
- Toes are 0.62 / 0.78 / 0.62 m, about 11% longer, and their flesh is 15% wider.
- The lengths now live in the species file. The sim (`FT.toes`), the skin, `measure.mjs` and the new review check all read them.
- Wider splayed feet needed the two-part footprint and a wider standing track. Without them the toes of the two feet interpenetrated on every standing tick.
- Dust is unchanged (±0.4 m about the MTP).
- The footprint decal (`effects.js`, not mine to edit) is a fixed texture: about 0.84 m long with toes at ±26°. The new foot reaches about 0.78 m plus claws, at up to ±33°. So the decal is about the right length but narrower than the loaded foot.
- The landing obstacle samples (0 / 0.55 / 0.95 m ahead) still cover the longer toes.

### 4. Adult leg proportions (kept; it converged in about 20 minutes)
- Femur 1.42, tibia 1.30, metatarsus 0.80 m: tibia/femur 0.92 (was 1.11), metatarsus/femur 0.56 (was 0.72).
  - This is Brochu-like proportions scaled about 8% above Sue's femur, which fits our animal being 5-10% longer than Sue.
- The audit's absolute lengths (1.32 / 1.15 / 0.68) sum to 3.15 m and cannot carry its proposed 3.3-3.5 m hip joint. So I kept the total limb length (3.52 m against 3.62 m) and the hip height.
- Two hand constants assumed a 0.92 m metatarsus; both now scale with `DIM.meta`:
  - the swing reach check's ankle offset (0.4 / 0.87 m);
  - the hip-height cap's ankle offset (`cx`, `cy`).
- Hip height is 3.15 m standing (3.18 over-extended at a sprint).
- The standing knee is straighter: knee angle max 145° slow, against 136°.
- Not done: the skull and neck, as instructed.

## Numbers, before → after (flat ground, seed 3, 2.2 m/s unless stated; `feet_before/measure2.json`, `feet_after/measure.json`)
| | before | after |
|---|---|---|
| Heel rise starts (beta > 3°), share of stance | 0.90 (1.2 m/s: never) | 0.56 (1.2: 0.55, 4.0: 0.59, 8.0: 0.59) |
| Heel rise at lift-off | 9.7° (1.2: 1.4°, 4.0: 16.6°) | 41.5° (1.2: 37.4°, 4.0: 35.3°, 8.0: 27.4°) |
| MTP height at lift-off | 0.18 m | 0.47 m |
| Toe tips leave (II, III, IV), share of stance | 0.97 / 0.97 / 0.97 (all at once) | 0.71 / 0.99 / 0.71 (III last) |
| Half splay in stance (min..max), at lift-off | 18.6..22.1°, 21.8° | 16.7..32.8°, 16.7° |
| Loaded toe joints, axis height above ground (all toes, p10-p90), flat | tips 0.03-0.07, middle joints 0.06-0.08 | 0.060 (exact contact) |
| Same on the berm | tips p90 0.37-0.48 m, middle joints p90 0.32-0.38 m | tips p90 0.06-0.08, middle joints p90 0.07-0.13 |
| Loaded MTP pad above ground, berm side slope (`roughSlow`) | 0.30 m | 0.11 m |
| Lowest toe axis while planted (berm) | 0.017 m | 0.06 m (none below pad height) |
| Foot length, MTP to digit III claw tip / hip height | 0.70 / 3.12 = 0.22 | 0.78 / 3.15 = 0.25 |
| Outer claw tips apart (bones), max | 0.42 m | 0.67 m (about 0.95 m with flesh) |
| Leg segments femur / tibia / metatarsus | 1.28 / 1.42 / 0.92 | 1.42 / 1.30 / 0.80 |
| Thigh mass centres from midline / knee from midline (walking) | 0.36 / 0.36 m | 0.53 / 0.46 m |
| Track width / pace angulation, 1.2 / 2.2 / 4.0 m/s | 0.44 / 146°, 0.32 / 162°, 0.31 / 167° | 0.53 / 139°, 0.38 / 158°, 0.37 / 165° |
| Hip abduction used, walking / walking 90° turn | -7.6..11.6° / -12.7..31.9° | -3.7..17.4° / -10.9..40.0° |
| Knee plane vs foot plane (ankle twist), straight / turn on the spot | 0..9.9° / 0..10.5° | 5.7..15.8° / 0..16.2° |

## Tests (`out/skel/feet_before/` vs `out/skel/feet_after/`; `out/skel/cmp.sh feet_before feet_after`)
The baseline `gaze` was re-run from the clean copy, because my first edits landed during its run. The toe-contact baseline is in `feet_before/review_toes.txt` and `review_mind_toes.txt`, run in the clean copy with the new check.

**review (scripted)**
- Pops: idle 94→87, jog 53→35, ridge 53→47, lure 65→61; stalk 19→27, sprint 48→49, the rest within ±3.
- Shanks touch: 2 → 0. Hips very low (stalk): 19 → 0. No over-extension, either before or after.
- Ankle-gap "legs pass through": far fewer (idle 1567→28, pivots 834→28, lure 248→73).
- Toes of the two feet touch, ticks / worst:
  - idle 1801 / 0.06 → 180 / 0.01;
  - targets 75 / 0.02 → 21 / 0.08 (deeper);
  - pivots 260 / 0.05 → 73 / 0.01;
  - lure 81 / 0.07 → 38 / 0.04;
  - new in run 8 (47 / 0.01), stalk (1471 / 0.01) and shove (60 / 0.08).

**review mind**
- Toe contact is lower in every seed:
  - seed 3: 288 / 0.03 → 30 / 0.05;
  - seed 7: 188 / 0.06 → 46 / 0.06;
  - seed 11: 2392 / 0.12 → 91 / 0.02.
- Seed 7 over-extension: 58 / 0.50 → 52 / 0.31 (the existing hard-brake case).
- New in seed 7: `knee bends backward`, 3 ticks, 0.02 m, at the same hard brake (t = 74.7 s).
- Seed 3 neck bends: 79 → 695 ticks. The mind runs diverge chaotically as soon as stepping changes, so this is not attributable to the feet.

**score --quick**: 20 pass / 3 warn / 4 fail → 21 / 2 / 4, with no new fails.
- `leg_overextension_max` 0.000 → 0.031 (PASS line 0.04). This is item 4: the jog-weave in late swing. With hip height 3.18 the sprint also reached 0.034; at 3.15 the sprint is 0.009.
- `head_in_collider_ticks` 23 → 51 (WARN); this already happened with items 1-3 alone (48). `head_worst_depth` 0.107 → 0.074.
- `joint_acc_p99` 172 → 176; perf 0.56 → 0.58 ms per arena step.

**siege all 3 90**
- leg-in-collider stays 0. Chest-to-head max 1.73 → 1.74 m; both were already over the 1.7 m limit.
- Body-part-in-wall 18491 → 643 ticks. This metric is dominated by one or two long tail-in-wall episodes (see HIPS.md), so I do not claim it improved.

**gaze**: more than 60° off target 6.0% → 6.3%; beyond the neck's reach 3.36% → 2.30%; unreported episodes 19 → 12.

**navsoak reach**: 35/35 and 35/35 arrived in both. Walking 882 / 913 s → 887 / 902 s; stuck 0.63 / 0.75% → 0.76 / 0.65%. It is no slower to act: noise-reaction latency 0.425 s in both.

**face180**: the same in both.

## Images (`out/skel/feet/img/`, 1100x620; 9 of the 10 allowed)
- `f1_front_walk.png` (after item 1): little change at 14 m. The legs are slightly thicker; still close together under the belly.
- `f1_rear_walk.png` (after item 1): two separate legs with the thighs joining the rump, but they still read thin against the tail and hips.
- `f2_foot_planted.png`: **failed**. The foot is buried in grass; my grass toggle missed the grass mesh.
- `f2_foot_toeoff.png`: **failed**. A dust sprite fogs the frame and grass hides the toes.
- An earlier pair of the same two close-ups rendered blank because of a camera-script bug. Those files were overwritten; they are counted in the 9.
- `f3_foot_toeoff_bare.png`, toe-off with grass and dust hidden for this frame only:
  - The near foot is up on its toes, MTP pad well off the ground and claws planted; the far, just-landed foot is flat.
  - But the three toes merge into one broad, mitten-like pad, not three distinct digits, and by toe-off the fan has closed.
- `f2_front_walk.png`: two distinct, thicker legs instead of one stalk (crop comparison in `out/skel/feet/cmp_front2.png`). Still narrow-looking under a much wider body, and the thighs are hidden behind the belly.
- `f2_side_midstride.png`: heavier shank and shorter metatarsus. The thigh still does not read as a drumstick from the side, and the feet are in grass and dust.
- `f2_eye_1p7m_8m.png`: the scale is right. The near leg is a solid column, but the feet are lost in grass and dust, so foot size cannot be judged from here.

## Unfinished or unverified
- **No usable render of a planted, loaded foot.** Spread, conformity and contact are verified by numbers only. With one render left I spent it on the toe-off.
- **Toe shape in the skin.** The three toes blend together (the toe blend radii k 0.05-0.06 against 0.14 m-thick toes, and the pads merge). Separate toes need smaller blend radii between digits, or a cut between them. That is skin work in `rexgeo.js` that I did not start.
- **Thighs from the front and side.** The thigh masses sit inside the belly silhouette, so the "massive drumstick" does not read yet. A thigh that hangs lower and stands further out than the belly would need both the belly's width (`TRUNK`) and the thigh's to change. Not attempted.
- **Ankle twist in straight walking** is now 5.7-15.8° (was 0-9.9°). This is the cost of the knees-out lean, and `hipAbd` 17.4° walking is close to the data's 20°. In a walking 90° turn it reaches 40° (baseline 32°); `hipAbd` is still not enforced.
- **Track.** At 1.2 m/s the track is 0.53 m and pace angulation 139° (baseline 0.44 m and 146°). The toe fan in the footprint rule keeps staggered prints apart at slow pace.
- **Hips on downhill slopes.** On the berm the hips drop lower (minimum 2.18 m, against 2.37 m) because the feet now sit on the slope rather than floating.
- **A swinging toe tip** grazed 0.016 m under a berm bump once.
- **Not re-tuned for the new leg lengths:** the jog-weave late-swing over-extension (0.031 m), the stalk crouch numbers, the lying pose (`LIE_H`) and `reachStop` / `spacing`.
- **Footprint decal**: its fixed texture (`effects.js`) is narrower than the loaded foot.
- `score_baseline.json` was not updated.
