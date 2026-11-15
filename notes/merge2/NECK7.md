# Why the 7-joint neck skin collapses (`#neck7`, `REX_NECK=joints` in Node)

## Measured
On the same neckcheck envelope:
- **7 joints, smooth weights** (quadratic B-spline over joints 17–26 along the neck's arc length): 112 of 120 poses fail. Max edge stretch is 8.4 (p99.9 6.4). The smallest section keeps 0.40 of its area, at s 18.6 (the foot of the neck).
- **26 stations:** 2–4 of 120 fail, stretch 3.6, smallest section 0.87.

Widening the falloff (cubic B-spline at 1.2× and 1.5× width) changed nothing (55–56 of 60 fails per tier). Moving the jaw-corner skin toward the skull end made it worse. So the weights are not the problem. The cause is how much each joint turns, compared with how thick the neck is there.

## Diagnosis
- **Joint spacing and turns.** The joints are 0.35 m apart (2.48 m / 7). The solver lets each joint bend up to `BEND` = 0.56 rad. The root turn (up to `ROOT` = 1.0 rad on top of the 0.76 rad rise) is shared 0.45/0.33/0.22 over the first three joints. So joint 19 alone can take about 0.45 × 1.76 ≈ 0.8 rad, plus its own bend.
- **Neck radius at the base.** The skin is 0.6–0.8 m from the chain at the base. On the inside of a bend, linear blend skinning collapses once radius × turn per joint is about the joint spacing: 0.7 × 0.5 ≈ 0.35 m. The base goes past that whenever the head is raised or lowered strongly. That is the 0.40 section at s 18.6, and the notch in `out/merge/phone_side_8m_neckraised.png`.
- **Jaw corners.** The worst stretch is at the back of the lower jaw, at head-space (±0.45, −0.8, 0.15). That skin blends the jaw with joints 23–24, which are 0.8 m away. Any turn of the skull on the last vertebra (up to `SKULL` = 1.05 rad, all in one step from joint 25 to the skull) tears it.
- **Why stations hold.** The curve spreads those same turns over 26 frames 0.1 m apart, and it enters the skull along the skull's own line. Each frame differs from its neighbour by about 0.1 rad.

## What the motion side would need for a standard rig to hold
1. **Even curvature.** No joint should take more than about 1/7 of the total bend. Drop the 0.45/0.33/0.22 root front-loading and have the solver even out the turn between joints (spline-IK behaviour).
2. **Per-joint limits tied to thickness.** Cap each joint at about spacing / skin radius: roughly 0.35–0.4 rad at joints 19–20 (radius 0.8 m), 0.5 rad mid-neck, 0.6 rad near the head (radius about 0.5 m).
3. **Torso participation.** The chest (joints 16–18) should take part of a large neck pitch: about 0.2–0.3 rad of a full head raise, so the base never has to.
4. **The head joint.** Give some of the skull's turn back to joints 24–25, so the skull-to-vertebra step stays under about 0.4 rad.

If the base still pinches after 1–3, the next steps are one helper joint at the base (a twist/volume joint taking half of joint 19's turn) or dual-quaternion skinning on the neck only.
