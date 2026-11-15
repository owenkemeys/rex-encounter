# Rex skeleton and gait audit (Jurassic Park archetype)

Audit only. Nothing under `src/`, `dist/` or `test/` was changed. Scripts and data are in `out/skel/`:
`measure.mjs` (all motion numbers, writes `measure.json`), `props.mjs` (standing proportions), `rollphase.mjs` (pelvis by stride phase), `face180.mjs` (turn to something behind), `views.py` + `shot_slow.py` (renders; `shot_slow.py` is `test/shot.py` with port 8766 and longer timeouts). Motion runs use flat ground with obstacles removed, seed 3, 120 Hz.

## 1. Proportions: reference, ours, ratio

Our total length is estimated from the standing pose: tail tip to snout tip of the skin skull (`SKULL` reaches z = 1.9 m ahead of the skull bone in `rexgeo.js:32-36`).

| Quantity | Reference (adult T. rex / JP) | Ours | Ours / ref |
|---|---|---|---|
| Total length | Sue 12.3-12.8 m [W1]; four big adults 11-12 m [H11]; JP animatronic 12 m (40 ft) [W2] | ~13.1 m (tail tip -7.61 m, snout ~+5.5 m from hips) | ~1.05-1.10 |
| Hip height (hip joint) | Sue 3.66-3.96 m (mount) [W1]; Bellatoripes track-maker 2.3-2.9 m [M14] | 3.10 m standing, 2.96-3.08 walking | ~0.80-0.85 of Sue |
| Femur | ~1.3 m for the four big adults [H11]; 1.28-1.43 m by specimen [B18] | 1.28 | ~1.0 |
| Tibia | shorter than femur in adults; tibia/femur ~0.85-0.95 (**estimate**, not verified) | 1.42 (tibia/femur 1.11) | ~1.15-1.3 (too long) |
| Metatarsus | ~0.5 of femur, ~0.65 m (**estimate**, not verified) | 0.92 (0.72 of femur) | ~1.4 (too long) |
| Femur+tibia+metatarsus | "limb length" 3-3.3 m [H11] | 3.62 | ~1.1-1.2 |
| Foot (track) length | Bellatoripes 52-67 cm [M14] (smaller animal); Tyrannosauripus ~86 cm, single track ~1 m [W3] | MTP to middle claw 0.70 m (`TOE_LEN` 0.7, `rexgeo.js:239`); sim `toe` 0.72; with heel pad ~0.85 m | ~1.0 |
| Foot width | Bellatoripes 51-56 cm, nearly as wide as long [M14]; Tyrannosauripus about 2/3 as wide as long [K] | outer claw tips 0.36-0.42 m apart, ~0.55-0.6 m with toe flesh | ~0.8-0.9 |
| Total toe divarication (II to IV) | 51-80 degrees [M14] | 37-44 degrees in stance (2 x `spread` 0.32-0.38 rad) | ~0.6-0.75 |
| Hip-joint spacing | not found; estimate 0.6-0.8 m (**estimate**) | 1.00 m (`hipHalf` 0.5) | wide |
| Skull length | Sue 1.39-1.53 m [W1][B18] | sim `headLen` 1.75; skin 2.24 m occiput to snout | 1.15-1.6 (long) |
| Neck (arc) | not found; ~1.2-1.5 m (**estimate**), ~10-12% of length | 1.75 m, 13% | ~1.2 |
| Trunk (hip to shoulder) | not found; gleno-acetabular ~2.5-3 m (**estimate**) [H11 discusses it but values were in image tables] | 2.84 m (back chord), 22% | ~1.0 |
| Tail (hip to tip) | ~7 m, ~55-58% of length [H11] | 7.61 m, 58% | ~1.0-1.1 |
| Preferred walking speed | 1.28 m/s (0.8-1.64) [V21] | `walk` 2.2 m/s | 1.7 |
| Trackway | pace angulation near 180 degrees, prints overlap the midline, toes rotated 5-12 degrees inward [M14] | pace angulation 113 deg (1.2 m/s), 136 deg (2.2), 148 deg (4.0); feet 0.8-0.95 m apart | very wide |

Reading: the legs are long below the knee (tibia and metatarsus) and the femur is normal, which is a juvenile or albertosaur-like build, not the heavy adult JP animal. The hip is low for that leg length because it walks crouched. The skull is long. The feet are about the right length but narrow, with too little toe spread. The hips are wide apart and the trackway is far wider than any tyrannosaurid trackway.

## 2. Motion, measured (from `measure.json`)

### Straight walking
| | slow 1.2 m/s | medium 2.2 | fast 4.0 | run 8.0 |
|---|---|---|---|---|
| Pelvis yaw vs travel (deg) | -6.6..7.6 | +/-9.4 | +/-9.2 | +/-5.5 |
| Pelvis roll (deg) | +/-4.2 | +/-3.5 | +/-2.6 | +/-2.3 |
| Pelvis pitch (deg) | -0.5..0 | -0.6..-0.1 | -1.0..-0.4 | -5.4..-4.7 |
| Chest yaw vs pelvis (deg) | +/-4.5 | +/-4.1 | +/-2.0 | +/-1.5 |
| Tail base yaw vs pelvis (deg) | -5..7 | -7..8 | -7..9 | -5..6 |
| Hip sway (`sway`, m) | +/-0.23 | +/-0.12 | +/-0.08 | +/-0.05 |
| Trackway width (m, centre to centre) | 0.95 | 0.80 | 0.78 | 0.64 |
| Pace angulation (deg) | 113 | 136 | 148 | 162 |
| Hip flexion used (deg) | 8..77 | 4..78 | -1..87 | -27..115 |
| Hip abduction used (deg) | -8..15 | -6..13 | -4..10 | -3..10 |
| Hip long-axis rotation shown (deg) | +/-7.7 | +/-7.4 | +/-7.0 | +/-6.3 |
| Foot yaw vs pelvis, planted (deg) | +/-11 | +/-13 | +/-13 | +/-9.5 |
| Knee-plane vs foot-plane twist (deg) | 0..11 | 0..13 | 0..12 | 0..7 |
| Ankle angle (deg, 180 = straight) | 103..138 | 105..145 | 102..165 | 95..159 |
| Tibia to metatarsus, MTP angle (deg) | 34..77 | 34..83 | 29..81 | 31..86 |
| Stance: toe proximal flexion (deg) | -3.8..-1.5 | -3.6..-1.5 | -3.5..-1.6 | -3.7..-1.6 |
| Stance: toe distal flexion (deg) | -14..7 | -13..7 | -12..7 | -15..7 |
| Stance: half splay (deg) | 18.6..22.1 | 18.6..22.1 | 16.8..22.0 | 16.4..22.1 |
| Swing: half splay (deg) | 1..21 | 1..21 | 1..21 | 1..22 |
| Swing: distal toe curl (deg) | -14..37 | -13..38 | -11..39 | -15..41 |
| Heel (MTP) rise starts at % of stance | none (max 1.4 deg) | 90% | 85% | 71% |
| Heel-to-toe roll duration (s) | 0 | 0.11 | 0.13 | 0.15 |
| Heel lift at lift-off (deg) | 1.1 | 9.0 | 16.3 | 25.5 |
| MTP height at lift-off (m) | 0.08 | 0.17 | 0.26 | 0.37 |
| Stance duration (s) | 1.66 | 1.13 | 0.81 | 0.53 |

By phase at 2.2 m/s (`rollphase.mjs`, 10 bins from left touchdown): the pelvis list is largest at touchdown (+3.3 deg, left hip low), crosses zero at mid single support and is -2.4 deg late in stance. So the list lags the load by about a quarter stride, and its mean over single support is about 0 (+0.09 and +0.02 deg). Pelvic yaw peaks at 9.3 deg in early single support. Hip height varies by 9 cm. Pitch varies by under 0.5 deg.

Toe conformity: in stance the three toes share one ground normal and one heel-lift angle. The proximal phalanges are fixed (-1.5 to -3.8 deg, whatever the ground does), and splay holds at 19-22 deg per side throughout stance. The toe tips stay at bone-axis height 0.07 m (median) on flat ground. Single frames reach 0.18-0.21 m just after touchdown, while the distal springs settle. The digits stay on the ground until lift-off, and then the whole foot leaves at once. **The foot is a rigid plate that tilts up by a few degrees in the last tenth of stance.**

### Turns
Heading change shared over time (deg from start). `face`: turn on the spot to a point 90 deg left. `turn90walk`: full steer at 2.2 m/s until the heading has changed by 90 deg. Columns: root heading psi, pelvis, chest (seg 17-18), neck (19 to 25), tail base (seg 8-12).

| scenario, t (s) | psi | pelvis | chest | neck | tail base |
|---|---|---|---|---|---|
| on spot 0.5 | 2 | 3 | 16 | -11 | 2 |
| on spot 1.5 | 23 | 24 | 39 | 5 | 17 |
| on spot 2.5 | 52 | 54 | 55 | 11 | 47 |
| on spot 3.5 | 80 | 82 | 65 | 28 | 76 |
| on spot 5.0 | 86 | 88 | 69 | 65 | 88 |
| walk 90: 0.5 | 5 | 21 | 34 | -44 | 20 |
| walk 90: 1.0 | 21 | 33 | 59 | -24 | 38 |
| walk 90: 2.0 | 51 | 58 | 90 | 35 | 51 |
| walk 90: 3.0 | 80 | 85 | 121 | 81 | 91 |
| walk 90: 4.5 | 91 | 107 | 98 | 87 | 116 |

- **Pelvis = root heading.** In every turn the pelvis follows psi to within the +/-10 deg stride yaw. On the spot it rotates at a steady 30 deg/s (max) for 3 s while the feet step round it. The pelvis turns continuously in single support, double support and swing alike.
- **The tail base is locked to the pelvis.** The yaw-rate correlation between pelvis and tail base is 0.95 on the spot and 0.89 walking. The tail base lags the pelvis by at most 8 deg; only the tail tip lags (18-25 deg).
- **The chest leads, but the same as the pelvis.** The chest leads the pelvis by up to 36 deg walking and 17 deg on the spot (twist up to 40 deg, hard clamp 40 deg at `rex.js:912`). In the tight circle (2.2 m/s, radius ~4.2 m) the chest sits a constant 35-40 deg into the turn.
- **The legs do not rotate at the hip.** Planted-foot yaw vs pelvis reaches -33..+18 deg on the spot and -26..+20 deg in the walking turn. The femur-tibia plane follows the pelvis (+/-8 deg), so up to 29-39 deg of twist appears between the knee plane and the foot plane, at the ankle. The ankle is a hinge in reality.
- **Overshoot.** In the walking 90-deg turn the pelvis overshoots to 107 deg and the tail base to 116 deg before settling back to 91 deg (the yaw controller plus the tail's lag).
- **Wrong-way start.** Turning on the spot to a point behind (`face180.mjs`) first turns the wrong way (-9 deg) for about 1.5 s, then reverses and goes round (2 reversals). In the 3 s warm-up variant in `measure.mjs` it turned +39 deg, then reversed and ended at -36 deg after 10 s.

## 3. Diagnosis

### Fault 1: "rigid hips, turns the whole body"
1. **One heading drives the pelvis.** `_locomote` integrates a single yaw `psi` (`rex.js:491-496`, `omMax` at `:405`). `_posture` sets the pelvis to `yawP = psi + pYaw` (`:882`), where `pYaw` is only a small stride term clamped to +/-0.18 rad (`:880`). Nothing lets the pelvis stay with the stance foot and catch up in steps, so the pelvis spins smoothly over planted feet. That reads as the whole trunk turning as one block.
2. **The back bends only at its front end.** The back is posed from `yawP` with one twist value distributed as `k*k*(3-2k)` (`:921`). The pelvis end of the back therefore never bends relative to the hips: the first back joints take about 10% of the twist and the last about 100%. The twist target (`:905`) is gaze plus a turn lead, clamped to 0.66 rad. It is a chest-swing, not a flexible trunk.
3. **The tail base is rigidly framed on the pelvis.** The tail targets are built in the pelvis basis `pf/pl/pu` (`:1476`). The bend `yawTot*q^1.3*1.6` (`:1475`) is near zero at the base. The `-0.8*pYaw` counter-term (`:1436`) only cancels stride yaw. There is no counter-swing of the tail to the trunk's turn, and no tail inertia at the root, so tail plus pelvis plus back move as one piece about the hips.
4. **The hip has no long-axis rotation.** The knee direction is the pelvis forward axis plus a small outward bias (`:1545`). The foot lands aligned to the heading anticipated at mid-stance (`sw.yaw1 = psiMs + s*0.07`, `:739`, with `psiMs` clamped to +/-0.22 rad of anticipation at `:706`). When the body turns over a planted foot, the mismatch cannot appear as femoral rotation (the visible "hip working"). It is absorbed at the ankle as a non-anatomical twist (29-39 deg measured).
5. **Standing, it turns the whole body to anything it watches.** If the subject is more than 0.9 rad off-axis for 0.9 s, or more than 1.5 rad off at once, the whole animal reorients, and it keeps turning until the subject is within 0.14 rad (8 deg) (`:383-385`). The neck could hold up to `YAW_GAZE` 1.5 rad (`:28`). So the trunk takes nearly the whole gaze change instead of the neck and chest.
6. **The `_sided` choice is shared state.** `behindSide` (`:394-397`) is reset whenever any caller (attention `:382`, face `:442`, head `:1011`, `:1022`) passes a bearing under 1.9 rad. The face turn can then pick the other side on its next call. That gives the wrong-way start and reversal above, which is extra whole-body rotation for nothing.
7. **The pelvis barely rocks.** List is +/-3.5 deg, but it comes from smoothed load difference (`:876`, spring `wn` 5.5 at `:878`), so it peaks at double support and averages 0 in single support. Pitch has no stride term at all, only a footfall impulse (`:784`), so it moves under 0.5 deg. Hip vertical is 9 cm. The "pelvis visibly working" of the JP walk (hip on the stance side up, swing side dropping and swinging forward, a nod per step) is missing. The pelvis yaws but does not list or pitch with the steps.
8. **The wide track forces sway.** Track half-width is 0.58 to 0.40 m (`tyrannosaurus.js:25`), hips are 1.0 m apart (`hipHalf` 0.5), and feet may never come closer than 0.6 m laterally (`rex.js:712`, `:729`). The hips must therefore sway +/-0.12-0.23 m over each foot (`:841`). That side-to-side shuttle of the whole trunk adds to the "whole body moves" impression.

### Fault 2: "small, rigid feet"
1. **The foot is one plate.** Planted, all three toes share one normal and one lift angle `beta` (`_leg`, `rex.js:1517-1536`). `place()` pivots the whole digit about the claw tip (`:1518`). The proximal phalanges are held at -0.04 rad (`:798`), and the distal ones only counter-rotate by `-0.85*beta` (`:799`). Per-toe ground contact is never solved: there is no conformity to uneven ground, no toe taking load before another, no proximal-to-distal peel. The bird reference has toes flat after contact, then rolling up and forward from proximal to distal, with digit III pivoting on its claw [FG14].
2. **The heel-up comes late and is tiny.** The heel target is `0.6*sstep(0.5, 1.6, x)` (`:1526`), where x is how far the hip is ahead of the foot. With a 0.72-0.92 m metatarsus and crouched posture, x reaches 0.5 m only at the very end of stance. Heel rise starts at 85-90% of stance, lasts 0.11-0.13 s and reaches 9-16 deg at walking speeds (1 deg at 1.2 m/s). The JP rex and large birds show the metatarsus peeling up through the second half of stance.
3. **The splay is small and constant.** Stance splay targets `0.14 + 0.24*load` (`:800`), so it holds at 19-22 deg half-angle (37-44 deg total) against 51-80 deg total in tyrannosaurid tracks [M14]. It does not change through stance. The landing slap (`:783`) adds a brief pulse only.
4. **The foot is narrow, and the ankle carries the turn.** Toe lengths are 0.56/0.7/0.56 m (`rexgeo.js:239`) with the small fan above, so the outer claws are about 0.4 m apart and the footprint is about 0.6 m wide against a long 0.85 m foot. Reference prints are nearly as wide as long. Because the hip cannot rotate (Fault 1, item 4), the ankle twists the foot plane under a fixed shin in turns. That reads as a stiff foot skidding round.
5. **The ground tilt is capped.** The foot normal is lerped 45% toward vertical and capped at 0.3 rad (`:741-742`), "toes and pads take up the rest", but nothing does take it up (item 1).
6. **The metatarsus is long and steep.** The long, steep metatarsus (`theta` around 62 deg, `:1514`) puts more of the leg's visual length in the ankle-to-MTP segment and makes the toes look short beside it.

## 4. Ranked proposal

1. **Let the pelvis turn by steps (engine).**
   - What changes: split "body heading" `psi` (path and momentum, unchanged) from "pelvis yaw". During single support the pelvis yaw is pinned to the stance foot, rotating only through stance-leg hip rotation, limited to about +/-0.35 rad. In double support it relaxes toward `psi + stride yaw`. In practice `pYaw` gets a turn term: `pYaw` target = stride term + `clamp(yawStanceFoot - psi - s*0.07, ...)`, blended by stance load, with a higher clamp than 0.18. The back gets the remainder (item 2).
   - Visible result: the hips turn in steps, the trunk screws round over the planted leg, and the turn reads as walking round rather than spinning.
   - Disturbs: foot `need` uses `foot.yaw - psi` (`rex.js:626`), which should become relative to pelvis yaw. `review.mjs` pops and limit checks may flag the new yaw rates. `score.mjs` baseline needs updating. Skin untouched.
   - Effort: 1 day. Risk: medium (step triggering is tuned to `psi`).
2. **Give the hip long-axis rotation and abduction, and keep the ankle a hinge (engine).**
   - What changes: in `_leg` (`:1545`), set the knee direction from the foot yaw (the planted foot's forward) blended with the pelvis forward, about 70/30 in stance and pelvis-led in swing. The femur then rotates about its axis by the pelvis-to-foot yaw difference, and the knee plane matches the foot plane. Limits go in species data: hip rotation +/-0.4 rad, abduction -0.15..0.35 rad (bird models allow +/-45 deg [O15]).
   - Visible result: the thighs visibly swing in and out as it turns, the hips "work", and no twisted ankles.
   - Disturbs: `rexgeo.js` limb frames already use the leg points, so it should follow. Check thigh skin at strong rotation. `review.mjs` leg-crossing check.
   - Effort: half a day. Risk: low to medium.
3. **Narrow the track and the hips to the reference, then reduce the sway (species data plus one engine constant).**
   - What changes: `hipHalf` 0.5 to about 0.36. `track(v)` to about 0.30 standing, 0.16 walking, 0.10 running (half widths), giving pace angulation of about 160-170 deg. Make the hard 0.6 m minimum lateral gap (`rex.js:712`, `:729`) a species value of about 0.25 m, checked against foot width rather than centres. Lower the sway gain at `:841`, because hips now sit nearly over the feet. Add a pelvic list term in phase with single support: the swing-side hip drops 2-4 deg mid-swing, with less lag (`wn` about 9). Add a stride pitch term: a nod of 1-2 deg, twice per stride.
   - Visible result: the narrow, heavy, rolling JP walk, with feet nearly on the midline, the pelvis rocking, and the trunk not shuttling sideways.
   - Disturbs: swing bow-out (`:753`) and the leg-crossing checks in `review.mjs`. Belly and leg skin clearance in `rexgeo.js` (thighs closer together). `navsoak`/`siege` are unaffected except for footprint placement near walls.
   - Effort: half a day. Risk: medium (leg crossing on tight turns).
4. **Toe-by-toe stance and an earlier, larger heel roll (engine, constants in species).**
   - What changes, solve per toe:
     - Each digit's proximal and distal joint angles come from the ground under its own tip (a terrain sample per toe) while planted, within limits.
     - The heel (MTP) rise starts at about 50% of stance: `bT` uses stance phase, not hip offset. It reaches 35-50 deg at lift-off at walking speed, with the MTP joint hyperextending while the phalanges stay flat and then peel from proximal to distal. Digit III leaves last, pivoting on its claw.
     - Splay rises with load to about 30-35 deg half-angle at mid-stance, then closes during roll-off. That is the convergence on withdrawal in [FG14].
     - Remove the 0.3 rad tilt cap in favour of toe conformity.
   - Visible result: a living, gripping foot, and feet that read bigger because they spread and roll.
   - Disturbs: `PS.TOE`/`PS.SPREAD` keep their layout (only values change). The skin in `rexgeo.js:136-152` already reads them. Footprint and dust events (`view/footfall*`) use `foot.pos`.
   - Effort: 1-1.5 days. Risk: low to medium.
5. **Adult proportions (species data).**
   - What changes: femur 1.32, tibia 1.15, metatarsus 0.68 (verify against Brochu 2003), and a straighter leg so hip height is about 3.3-3.5 m. Skull `headLen` and the skin `SKULL` profile shortened to about 1.45-1.5 m. Neck about 1.4 m. Toes lengthened about 10% and widened (`TOE_LEN` to the species file).
   - Visible result: the heavy, short-shanked, big-footed adult silhouette of the film.
   - Disturbs: `RMAX`, reach limits, `cap`, crouch constants tuned to current lengths. `spacing` and `reachStop` in species. Neck tests (`siege.mjs` chest-to-head limit 1.7 m). Skin skull geometry, eyes, jaw hinge. `score.mjs` baseline.
   - Effort: 1-2 days with retuning. Risk: medium to high (many constants assume the current leg).
6. **Trunk participation without new bones (engine).**
   - What changes:
     - Distribute the back's yaw evenly. Replace `k*k*(3-2k)` with roughly linear and add a small opposite yaw at the pelvis end, so the back is a smooth C, not a hinge at the shoulders.
     - Make the tail root take inertia: counter-swing about 0.3 x pelvis yaw acceleration at joints 12-9, and an added `-0.2*om` at the base during on-spot turns, so the tail lags and then follows.
     - Raise the reorient thresholds (`:383-385`) so the neck and chest take gazes up to about 1.1 rad, and stop the body turn at about 0.4 rad rather than 0.14.
     - Give `_sided` one `behindSide` per caller.
   - Visible result: head and chest look, the body follows partially, the tail swings late, and there are no wrong-way starts.
   - Disturbs: gaze tests (`gaze.mjs`), mind behaviours that assume the body faces the subject (`appraise`, `avoid`), and `thoughts.mjs` conditions about facing.
   - Effort: half a day. Risk: low to medium.
7. **Speed calibration (species).** Default `walk` 2.2 to about 1.4 m/s [V21]. Effort: trivial. Risk: behaviour timings in mind tests.

Not proposed: extra spine or neck bones. Every fault above is in how existing joints are driven (one heading, one twist value, a plate foot), as with the neck in `NECK7.md`. One optional joint: a separate pelvis-to-back "lumbar" yaw split (item 6) can be done with the existing joints 13-14.

Where fixes live: proportions, track, hip spacing, minimum foot gap, joint limits, splay, heel-roll timing, toe lengths (move `TOE_LEN` out of `rexgeo.js`) and walking speed belong in `species/tyrannosaurus.js`. Stepwise pelvis yaw, hip rotation, per-toe contact, back distribution and tail inertia are engine (`sim/rex.js`), parameterised by species numbers.

## 5. Images
Real renders, not flip-books: `out/skel/v_*.png`, each a single 1100x620 image, day mood, observe mode. The animal is walking to a goal. Made with `python3 out/skel/shot_slow.py out/skel out/skel/views.py` (SwiftShader, 50-125 s per frame).
- `v_side_midstride.png`: side view, left foot mid-swing, while it turns toward its goal. Shows the crouched, long-shanked legs, thin metatarsus and small feet under a big body, and the head carried high.
- `v_front.png`: front view. Shows the narrow-looking feet and thin lower legs under a deep chest. Width faults are clearer in the numbers than at this distance.
- `v_rear.png`: from behind, during the turn. The tail is swung far to one side as one stiff curve from the hips. The thin legs and small feet are visible.
- `v_eye_1p7m_6m.png`: player eye height 1.7 m at about 6.5 m. The animal has its head up, so the frame is mostly belly and throat. Shows the scale at player height, but not well framed.
- `v_foot_planted.png`: close view of the loaded, planted left foot. The three toes lie as one flat, fairly short plate; there is little visible splay and no individual toe conformity.
- `v_foot_toeoff.png`: the same foot late in stance (beta 0.13 rad, about 7 deg). The near foot is mostly hidden by grass and dust. What shows is a foot still nearly flat at the end of stance. Weak image; the numbers in section 2 carry this point.

## 6. Not verified
- Sue's tibia and metatarsus lengths, hip-socket spacing, neck and trunk lengths: the primary tables (Brochu 2003; Hutchinson et al. 2011 Tables 2-7) were behind image tables or captcha. The values above marked **estimate** are mine.
- The JP rex's own hip height, foot size and gait: only the animatronic's 12 m length, 6.1 m height and 4,100 kg weight were found [W2]. The walking shots are CGI by ILM. No published kinematic numbers.
- T. rex pelvic yaw, roll and list amplitudes: not measured for any non-avian theropod. Bird data say most motion is flexion/extension but non-sagittal hip abduction and knee and ankle rotation are significant [R07]. Numeric pelvis amplitudes for ostrich or emu were not retrieved.
- Toe conformity on rough ground was not measured (flat-ground runs only). Toe tip heights are from the skin's toe math replicated in `measure.mjs`, not from the rendered mesh.
- Hip "long-axis rotation" is measured as the femur-tibia plane against the pelvis lateral axis, an approximation.

## Sources
- [W1] Wikipedia, Sue (dinosaur): https://en.wikipedia.org/wiki/Sue_(dinosaur)
- [W2] Wikipedia, Rexy (Jurassic Park animatronic: 6.1 m tall, 12 m long, 4,100 kg): https://en.wikipedia.org/wiki/Rexy
- [W3] Wikipedia, Tyrannosauripus: https://en.wikipedia.org/wiki/Tyrannosauripus
- [K] KU Ichnology, Tyrannosauripus: https://ichnology.ku.edu/vertebrate_traces/dinosaurtracks/tyrannosauripus.html
- [H11] Hutchinson et al. 2011, PLoS ONE 6:e26037: https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0026037
- [B18] Femur lengths by specimen, compiled from Brochu 2003 and others (blog, secondary): https://psdinosaurs.blogspot.com/2018/11
- [M14] McCrea et al. 2014, "A 'Terror of Tyrannosaurs'", PLoS ONE 9:e103613: https://ucl.scienceopen.com/document_file/a46161cc-74c3-41c1-a829-07aad49f1cf2/PubMedCentral/a46161cc-74c3-41c1-a829-07aad49f1cf2.pdf
- [V21] van Bijlert et al. 2021, tail natural frequency and walking speed (news summary): https://www.sci.news/paleontology/tyrannosaurus-rex-walking-speed-09578.html
- [FG14] Falkingham & Gatesy 2014, PNAS, guineafowl toe motion: https://cs.brown.edu/courses/cs137/2015/readings/Gatesy_XROMM_DEM_PNAS14.pdf
- [R07] Rubenson et al. 2007, ostrich 3D joint kinematics (abstract): https://pure.psu.edu/en/publications/running-in-ostriches-struthio-camelus-three-dimensional-joint-axe/
- [O15] Ostrich musculoskeletal model joint ranges, PeerJ 3:e1001: https://peerj.com/articles/1001
