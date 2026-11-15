Final code (`out/skel/legdeform/final2/`, 960x720). The left (near) leg; one honest line each.

**Walk, side** (`final2/walk_side_*.png`):
- `land`: the forward leg is long and smooth from thigh to foot, the knee a soft bend. The trailing leg behind it is fine.
- `midstance`: the knee reads as a knee, no longer a ball, and the shank is thick under it. A small light notch remains in the crease behind the knee.
- `heeloff`: the thigh tapers into the knee with a crease behind it, and the heel stands clear of the bone line. Clean.
- `toeoff`: the stance leg folds with a crease behind the knee and the calf tucked under. Nothing pinches.
- `midswing`: the swinging knee is a rounded prow (the thigh's end, swung forward), narrower than before round 4. It is still the boldest form on the leg.
- `lateswing` (right foot at heel-off): the left leg reaches forward with a smooth knee and the ankle opening. Clean.

**Run, side** (`final2/run_side_*.png`):
- `land`: the leg is stretched forward and smooth, with no crease at the front of the knee. Clean.
- `midstance`: a compact knee and a full shank; the notch behind the knee is small and dark (it was a pale sliver before round 4).
- `heeloff`: a deep crease behind the knee and a strong calf. It reads as muscle.
- `toeoff`: about as before. The knee is rounder than in a walk but no longer a separate ball (compare `before/run_side_toeoff.png`).
- `midswing`: the femur is swung about 90 deg forward. The thigh's end is a big rounded prow, and the shank under it looks thin from the side because its calf is behind it. This is the thigh's accepted mass seen end-on, not a deformation fault, but it is the frame most likely to still look odd.
- `lateswing`: the same prow, smaller. The rest of the leg is clean.

**Stalk, side** (`final2/stalk_side_*.png`):
- `land`: a crouched leg with a smooth knee. The far leg behind it is clean.
- `midstance`: a deeply bent knee reads as a knee over a thick shank. The calf of the far, swinging leg shows behind.
- `heeloff`: the crease behind the knee is deep, and the swinging foot is tucked. Clean.
- `toeoff`: both legs are clean, with a firm crease behind each knee.
- `midswing` (knee about 150 deg): the thigh's end is a long prow pointing forward, and the calf and the thigh's back meet in a crease beneath it. It reads as a folded leg, no longer as a ball, but the prow is the largest form in the frame.
- `lateswing`: the same forward prow, with the shank under it angled back, so it looks thinner than it is. Clean at the knee and the ankle.

**Final code, others:**
- `final2/turn_side_t2.2.png`: the stance leg is clean, and the calf is behind the shank in the turned knee plane.
- `final2/run_tq_whole.png`: the swung thigh's end is still a pale rounded bulb, lit end-on. It is slightly smaller than in round 1 but more separate from the thigh than in `before/run_tq_whole.png`. This is the one view where the change reads worse.
- `final2/low_walk_midswing_lside.png` (low tier): matches the high tier. The swinging knee is a rounded prow and the stance leg is clean.

**Earlier rounds** (`out/skel/legdeform/final/`). These frames are from the round 1/2 weights, with the old knee ellipsoid at 0.30 x 0.26.
The knee in them is a little bigger and rounder than the final one. The deformation scheme is the same.
- *Walk.*
  - `walk_front_midstance`, `walk_front_toeoff`, `walk_front_midswing`: the legs are straight-sided with the knee in line. The folded ankle of the swinging foot shows a jagged pale crack across its front (see Unfinished; it is in the before render too).
  - `walk_rear_midstance`, `walk_rear_toeoff`, `walk_rear_midswing`: the calves read from behind and the heels stay on the bone. On the stance leg the thigh's back overhangs the calf in a horizontal edge, like a sleeve.
  - `walk_tq_whole`: fine, but the near leg is in shade.
- *Run.*
  - `run_front_midstance`, `run_front_midswing`: clean, and the swinging shank is narrow. `run_front_toeoff` is useless: the body blocks the view (the fitted camera ends up behind the hip).
  - `run_rear_*`: the swinging ankle and heel are knobbly but on the bone.
  - `run_tq_whole`: the swung thigh's end is a pale rounded bulb, lit end-on, more separate from the thigh than in `before/run_tq_whole.png`. Its final-code re-render is `final2/run_tq_whole.png`, if it finished.
- *Stalk.*
  - `stalk_front_*`: the lowered head hides most of the legs, so these are of little use.
  - `stalk_rear_midswing`: the same sleeve edge behind the stance knee.
  - `stalk_tq_whole`: the swung thigh is a long rounded prow.
- *Turn on the spot.*
  - `turn_side_t1.0..t3.0`: the legs stay coherent through the step-round. The knee plane turns, and the calf stays behind the shank in the bend (before, it stayed body-back). A pale streak on the far shank is the inner-leg paint.
  - `turn_front_t*`, `turn_rear_t*`: the cameras are oblique because the body is mid-turn. Knees and shanks are clean, and the ankles show a waist above the foot, not a candy-wrapper.
  - `turn_tq_whole`: the animal is small in the frame. Nothing odd at that size.
- *Low tier.* `low_walk_midstance_lside`, `low_walk_midswing_lside`, `low_run_toeoff_lside`, `low_stalk_midswing_lfront`, `low_walk_midswing_tq`: it builds and deforms like the high tier. The 7 cm grid rounds the knee a little more.
- *Weights.* `dbgw_walk_midswing`, `dbgw_stalk_knee150`: the weights as designed. The femur is red and the twist bone orange over the upper thigh. The knee cap's mid bone is pale, the tibia green, the metatarsus blue with the pale ankle mid at the heel.

**Comparisons.**
- `base/` holds the before-fix extremes: the twisted column thigh in `run_femfwd_R` and the knee balls in `walk_ank79_tq` and `walkturn_ank179_tq`. `r1/` holds the same extremes after round 1.
- `before/` holds the old code on today's tree, rendered from `out/skel/legdeform/beforetree/`, against `final/` and `final2/`.
- `r3/dbgw_run_toeoff_knee.png` is the knee-ball diagnosis.
- `r4/` holds the round 4 knee.
