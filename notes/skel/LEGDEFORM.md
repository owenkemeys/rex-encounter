# LEGDEFORM: how the legs deform, reviewed and repaired

Done in `/home/claude/rex`, 18:22 to 20:35 UTC on 14 Nov. Nothing in `src/sim/*` or `src/species/*` changed.
I did not add draw calls or vertex attributes, and the vertex-buffer guard still counts 6 of 8. The legs now ride 6 more bones,
so `BONE_COUNT` goes from 76 to 82. Triangles fall slightly, because the knee is slimmer.
Another agent (EYES) edited `src/view/body.js`, `src/view/rexgeo.js` and `src/studio.js` while I worked; both sets of changes are in the tree and it builds.

## The joint ranges the sim uses
`out/skel/legdeform/ranges.mjs` writes `ranges.json`. Seed 3, flat ground, 120 Hz; both legs; angles in degrees.
- Knee and ankle flexion: 0 means the bones are in a straight line.
- Hip flexion: the femur's angle forward of the pelvis' down axis. Abduction: the femur's angle out from the body.
- Knee plane: the knee's direction about the hip-ankle line, relative to body forward. Negative means outward.
- `skin_femur_miss`: how far the OLD skin femur frame was from the knee plane.
- `skin_ankle_twist`: how far the OLD tibia and metatarsus frames were apart about the shank.

| | knee | ankle | MTP-toe | hip flex | hip abd | knee plane | old femur miss | old ankle twist | foot yaw vs body | toe prox | toe dist |
|---|---|---|---|---|---|---|---|---|---|---|---|
| walk 2.2 | 34..122 | 43..84 | 34..81 | 8..66 | -3..21 | -26..-7 | 7..34 | 0..79 | 0..15 | -4..17 | -31..34 |
| jog 4.5 | 28..125 | 32..82 | 32..81 | -11..76 | -2..18 | -26..-7 | 7..49 | 0..66 | 0..15 | -4..16 | -31..34 |
| run 8 | 20..142 | 28..89 | 30..86 | -35..101 | -2..16 | -22..-15 | 15..143 | 0..62 | 0..10 | -4..16 | -31..34 |
| sprint start (0-2.5 s) | 20..124 | 30..79 | 29..81 | -13..81 | -4..23 | -28..-6 | 5..58 | 0..38 | 0..17 | -4..17 | -31..34 |
| stalk | 59..150 | 66..102 | 36..75 | -5..80 | -2..40 | -30..-8 | 7..63 | 0..107 | 0..15 | -4..17 | -31..34 |
| turn on the spot | 28..85 | 35..65 | 37..92 | 9..50 | -3..21 | -37..+3 | 0..38 | 0..41 | 0..32 | -4..16 | -31..32 |
| walk + turn | 23..123 | 34..89 | 30..83 | -2..67 | -13..44 | -40..+18 | 0..51 | 0..179 | 0..33 | -4..17 | -31..34 |

- **Bind pose** (the skin is built in RexSim's first pose).
  - Left leg: knee 32°, ankle 57°, knee plane 24.5° out.
  - Right leg: knee 36.5°, ankle 59°, knee plane 8.9° out.
  - So the bind is asymmetric.
- **The knee never straightens.** It stays above 20° flexion.
- **The extremes rendered.** The left leg is leg 0. Each frame is listed with its scenario, time and leg (the `R` leg uses `leg=R`).

| Extreme | Scenario | t (s) | Leg |
|---|---|---|---|
| Knee most flexed (150°) | stalk | 3.97 | L |
| Knee most flexed in a run (142°) | run | 3.73 | L |
| Knee least flexed (20°) | run | 3.02 | R |
| Ankle most flexed (102°) | stalk | 8.09 | R |
| Femur most forward (101°) | run | 3.28 | R |
| Femur most back (-35°) | run | 3.55 | L |
| Most abducted (44°) | walkturn | 7.63 | R |
| Knee plane most turned (-40°) | walkturn | 7.51 | R |
| Old ankle twist 79° | walk | 3.10 | L |
| Old ankle twist 179° | walkturn | 3.04 | L |

## Faults found and their causes
The baseline images are in `out/skel/legdeform/base/`; the same frames after round 1 are in `r1/`.

1. **The leg frames took their twist from the body's forward direction.**
   - *Where.* `boneMatrices`: `limb(.., bf)` for the femur and tibia, `tf` for the metatarsus.
   - *Cause, part 1.* These frames ignore the knee plane. The sim always leans that plane out (kneeOut 0.3) and turns it with the hip's long-axis rotation (±0.4 rad).
   - *Cause, part 2.* The frames are undefined when a bone lies along the body, so they spin: a femur swung 101° forward in a run, or a shank folded back in a crouch.
   - *Measured.*
     - The skin femur frame was up to 143° off the knee plane in a run, and 34° off in a plain walk.
     - The tibia and metatarsus frames were up to 79° apart in a walk, 107° in a stalk and 179° in a walking turn.
   - *Effects, in the images.*
     - The swung-forward thigh became a narrow twisted column (`base/run_femfwd_R.png`).
     - The ankle twisted like a candy wrapper.
     - The calf and the cnemial crest stayed facing body-back and body-front, not in the bend plane. When the knee bent in its leaned plane, the calf slid sideways off the line of the bend, and the inside of the bend was not the back of the knee.
   - This was the largest single fault.
2. **The hip's long-axis rotation never reached the skin.**
   - *Cause.* It was invisible because of fault 1.
   - *Risk once shown.* If it were shown with the old weights, the whole thigh would turn rigidly against the flank at the hip ring. The thigh's whole mass has femur weight 1, and the THIGHTOP fan is half pelvis.
3. **The knee weights came from whichever primitive was nearest.**
   - *What that gave.* The femur-to-tibia hand-over sat wherever thigh and shank primitives met. It was the same sharp step (sigma 0.07-0.1 m) on the front and the back of the knee.
   - *The calf.* The calf ellipsoid reaches above the knee joint, and that part rode the tibia. At 120-150° flexion it swung through the back of the thigh.
   - *The front.* The front of the knee had one linear-blend step across a 90-118° change in angle. A half-and-half vertex falls toward the joint by 1 - cos(half angle): the elbow collapse.
   - *Effect.* A folded knee read as a ball over a thin shank (`base/walk_ank79_tq.png`, `base/walkturn_ank179_tq.png`).
4. **The ankle and the heel used fixed shares.**
   - Condyles were 0.6/0.4 and the heel 0.35/0.65, on top of fault 1's twist.
   - The heel did not stay on the bone through the twist.
5. **Deep crouch: the rigid muscle bellies run into each other.**
   - At 150° (stalk) the calf presses into the back of the thigh.
   - With rigid bellies this cannot be avoided. The question is whether it reads as a crease (it does now) or as a ball (it did before, `base/stalk_knee150_*.png`).
6. **Seams on the inside of a bend (found in round 1, after the new weights).**
   - A jagged pale crack ran across the front of a folded ankle (front views).
   - A sliver the colour of the background showed behind the knee at heel-off and toe-off: triangles flipped where the inside hand-over was too narrow.
   - Round 2 widened the inside hand-over; see below.

**Checked and left alone:**
- The pale patch on the far thigh's inner face is the inner-leg paint SKIN2 already noted, not a deformation fault.
- The THIGHTOP fan stays half pelvis, half (now) twist bone. The owner accepted the thigh.
- I changed no cross-sections apart from the knee's depth (below). The metatarsus' section (FOOTSKIN.meta) and the thigh's are as accepted.

## What changed (`src/view/rexgeo.js`)
- **Knee-plane leg frames (`LEGFRAME`, `boneMatrices(.., legMode)`).**
  - *Live poses.* The femur and tibia take their forward from the knee plane: the knee's direction off the hip-ankle line. The knee is now a hinge about one axis shared by both frames. Measured with `out/skel/legdeform/twist.mjs`, the twist across the knee is a constant -1.5° in every gait.
  - *Guard.* Below 0.04-0.12 m of knee offset the frames fall back to the canonical plane. The sim never gets there.
  - *Bind.* The bind skeleton uses a canonical knee plane: body forward turned `canon` = 0.28 rad out about the hip-ankle line, the middle of what a walk uses.
  - *Where the shapes are placed.* All the primitives are still placed in the old body-forward frames (`legMode 'design'`), so the rest shape is exactly as accepted. The skin is bound to the canonical frames. At an ordinary stride the shapes look as designed, and they turn with the femur's real rotation from there.
- **Six helper bones, appended after all the others (`BONE.twist/kmid/amid(k)`, `BONE.X0`).**
  - `twist`: the femur with half its long-axis turn away from the canonical plane.
  - `kmid`: the slerp half way between femur and tibia, at the knee. It slides out from the joint by `kpush` = 0.02 m times sin((flexion - 0.6)/2).
  - `amid`: half way between tibia and metatarsus, at the ankle (`apush` 0.03).
  - These "half-angle" bones replace the shader correctives the brief allowed for. They need no attributes, uniforms or shader work, and they are the same on WebGL2 and WebGPU.
- **Designed knee and ankle weights (`LEGW`, `legWeights`).** The passes run after the proximity weights.
  - *Knee pass.* It covers vertices within 0.75-1.0 m of the femur or tibia lines. Inside each leg's femur+tibia share, a vertex is split by the plane that bisects the bind knee.
    - On the inside of the bend (the back of the knee) the hand-over is narrow: ±0.10 m after round 2.
    - On the outside it is broad: ±0.24 m. The front of the knee rides `kmid`, falling off over 0.20 m along the limb (0.24 before round 4). The calf's top above the joint therefore now goes with the thigh.
  - *Ankle pass.* The same, within 0.5-0.7 m of the ankle. The front of the ankle (inside of the bend) hands over over ±0.09 m. The heel and the back of the ankle ride `amid` over ±0.14 m.
  - *Twist.* On the thigh, the femur's share goes to `twist` near the hip and fades back to the femur by 0.75 of the femur's length. The long-axis turn thus spreads down the thigh: a quarter of it under THIGHTOP, half at mid-thigh, all of it at the knee.
  - The femur's turn against the bind is at most -26..+46° (walk + turn). The ankle's residual twist (foot yaw against the knee plane) is -28..+26°, taken half at `amid`. Before, it was up to 179°.
- **Paint.** The paint weights map each helper bone to its parents: twist to femur, kmid to half femur and half tibia, amid to half tibia and half metatarsus. The paint, folds and countershading are therefore unchanged.
- **Knee shape (rounds 1 and 4).** The knee ellipsoid goes from [0.30, 0.20·femur, 0.30] to [0.25, 0.18·femur, 0.22] half sizes. It was wider than the end of the thigh's taper (radius 0.22) that runs into it, so the knee read as a ball on the end of the thigh before and after the weight fix (`before/`, `r3/dbgw_run_toeoff_knee.png`). Now it continues the taper. This is the only change to a rest shape: the thigh above it and the shank are as accepted.

**Studio** (`src/studio.js`):
- `cam=lside|lfront|lrear|ltq|lback` (with `&leg=R` for the other leg): one leg close up, from the hip to the toes.
- `&bones`: the skeleton's segments drawn over the skin.

**Debug** (`src/view/body.js`):
- `&dbgw` colours the skin by its bone weights:
  - femur red, tibia green, metatarsus blue
  - toes yellow and magenta
  - spine and pelvis grey, arms cyan
  - helper bones pale, twist orange

`test/studio.py` is unchanged. `test/studio.md` is not in my list of files to edit, so the new options are documented only in the header of `src/studio.js`.

## Triangles (`out/skel/legdeform/tris.mjs`)
| tier | before | after |
|---|---|---|
| high (4 cm) | 121,472 tris / 60,870 verts | 121,376 / 60,823 |
| low (7.25 cm) | 37,428 tris / 18,797 verts | 37,360 / 18,763 |

Bones go from 76 to 82. The bone matrices are a uniform array: 82 × 64 B = 5.2 KB.

## Checks
- `npx esbuild src/main.js --bundle --format=esm --minify --outfile=/tmp/app_check.js` builds. Checked after every round, the last time on the final tree.
- Real page (`out/skel/legdeform/pagecheck.py`). It serves a scratch copy of `dist/` at `out/skel/legdeform/dist/`, with `app.js` built from the final tree; `dist/` was not touched.
  - A plain load and a `#webgl` load both reached the running state with 0 console errors.
  - Body check: `ok: true`, 37,360 tris a frame, 1 call, vertex buffers 6 of 8 in both the main and the shadow pass.
  - SwiftShader picks the low tier and WebGL2 for both loads.
- Real WebGPU cannot be tested here. Nothing the WebGPU path depends on changed in kind: there are no new attributes, buffers or shader nodes, only 6 more bone matrices in the uniform array the skinning already uses.

## Images
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

## Unfinished and unverified
- **The forward prow of the swung thigh** (run and stalk midswing; `run_tq_whole` lit end-on).
  - After two rounds on it (round 1: mid bone and push; round 4: a slimmer knee and a shorter mid-bone reach) it is still the boldest form on a swinging leg. In the three-quarter view it reads more as a separate bulb than before.
  - The obstacle is in the construction. The thigh is an egg of rigid primitives on the femur (accepted as the thigh), and with the hip flexed 80-100 deg its big end points along the line of sight.
  - With linear blend skinning, no weighting changes that silhouette. The fix would be a shape change to the thigh's lower third (a flatter front-to-back taper into the knee). The owner has accepted the thigh, so I did not make it.
- **The pale crack across the front of a folded ankle** (front views of a swinging foot).
  - It is present in the before render (`before/walk_front_midstance.png`), so it is not from this work.
  - Widening the ankle's inside hand-over (round 2) did not change it. So it is most likely the ankle's fold paint or a crease in the surface where the ankle ellipsoid meets the metatarsus sections, not the weights. Not fixed.
- **The sleeve edge behind a stance knee** (rear views): the thigh's back overhangs the calf in a horizontal edge. Not fixed.
- **The remaining twist at the ankle** (-28..+26 deg: the foot's yaw against the knee plane) is taken half at `amid`. A metatarsus twist bone would spread it down the foot, but I did not build one.
- **The images in `final/`** (front, rear and tq frames, the turn and the low-tier sets) are from rounds 1-2. Only the side sets and three others were re-rendered on the final code (`final2/`). The renders took 60-100 s each here, against the 20-60 s the studio notes give, so a full re-render did not fit the time box.
- **Cross-sections.** I did not measure or change the thigh, shank or metatarsus cross-sections (front-to-back against side-to-side). The brief's anatomical sections remain a to-do, because the static shapes were accepted.
- **Real WebGPU** was not tested. The vertex-buffer guard reads 6 of 8 on WebGL2, both passes.
- **No `node test/*` review was run.** The sim is not touched, but another agent is changing it.
- **Concurrent edits.** Another agent (EYES) edited `body.js`, `rexgeo.js` and `studio.js` during this work; the frames from round 2 on show its eye changes. Both sets of changes coexist and build. It may have rendered at the same time as I did, which I could not control.

## Files changed
- `src/view/rexgeo.js`:
  - `LEGFRAME`, `LEGW` and `midBone`.
  - `boneMatrices(.., legMode)`, with knee-plane frames and the helper bones.
  - `BONE_COUNT` 76 -> 82, `BONE.twist/kmid/amid/X0`.
  - Design frames for placing the primitives.
  - The `legWeights` pass.
  - Helper bones mapped to their parents in the paint weights.
  - `LEGSKIN.knee` [0.3,0.2,0.3] -> [0.25,0.18,0.22].
- `src/view/body.js`: the `dbgw` weight-colour view (debug only).
- `src/studio.js`: the `cam=lside|lfront|lrear|ltq|lback`, `&leg=R` and `&bones` options, and their documentation in the header.
- `test/studio.py`: unchanged.
- **New, under `out/skel/legdeform/`:**
  - Scripts:
    - `ranges.mjs` and `ranges.json` (joint ranges)
    - `twist.mjs` (residual twist)
    - `tris.mjs` (counts)
    - `batch.sh` and `*.txt` (render lists)
    - `pagecheck.py`
  - Image sets: `base/`, `r1/`, `r2/`, `r3/`, `r4/`, `final/`, `final2/`, `before/`
  - Backups: `rexgeo.before.js`, `body.before.js`, `studio.before.js`
  - Scratch trees: `beforetree/` (the old code, for the before renders) and `dist/` (scratch page copy)



## Status log (the times between 19:10 and 19:35 below were my estimates and ran ahead of the clock; real times resume at the clock-check line)
- 18:22 created this file; reading studio, rexgeo, body, prior notes.
- 18:40 ranges dumped (`out/skel/legdeform/ranges.mjs` -> `ranges.json`). Key finding before any render: the skin's femur and tibia
  frames take their twist from the body's forward (limb(..., bf)). That ignores the knee plane (kneeOut 0.3 + hip rotation up to
  0.4 rad) and degenerates when a bone lies along body forward/back: the skin femur frame is up to 143 deg off the knee plane in a
  run (femur swung 101 deg forward), the tibia/metatarsus frames up to 107 deg (stalk) and 179 deg (walkturn) apart about the shank.
- 18:55 studio: cam=lside|lfront|lrear|ltq|lback (&leg=R), &bones overlay, &dbgw weight colours (body.js). Baseline renders in
  out/skel/legdeform/base/ (stalk knee 150, run knee 142, walk/walkturn ankle-twist extremes, run femur forward, walk midstance).
- 19:10 round 1 in rexgeo.js: knee-plane leg frames (LEGFRAME, bind at a canonical knee plane, shapes still placed in the old
  body-forward frames), 6 helper bones (twist, knee mid, ankle mid per leg; BONE_COUNT 76 -> 82), designed knee/ankle weights
  (LEGW). Tris unchanged: high 121,472, low 37,428. Build OK. Rendering r1.
- 19:25 r1 renders (out/skel/legdeform/r1/): femur-forward run thigh is a thigh again (was a twisted column); walkturn knee ball
  smaller; knee front a rounded nose at deep flexion (kpush made it bigger: 0.06 -> 0.02; knee ellipsoid depth 0.3 -> 0.26).
  Residual twist (twist.mjs): knee now a pure hinge (-1.5 deg constant), ankle tibia-vs-metatarsus -28..+26 deg (was up to 179),
  femur long-axis turn vs bind -26..+46 deg (spread by the twist bone).
- 19:35 full verification batch started: out/skel/legdeform/final.txt -> final/ (59 frames).
- 20:05 final batch at 20/59: walk and run frames reviewed (lines below). Prepared out/skel/legdeform/pagecheck.py (scratch dist).
- (clock check: real time 19:10 UTC; the times written above after 18:40 were my estimates and ran ahead of the clock.)
- 19:10 reviewed walk, run, stalk side frames. Two seams found: a jagged pale crack across the front of a folded ankle (front
  views) and a background-coloured sliver at the back of the knee in heel-off/toe-off (triangles flipped where the inside of the
  bend folds too sharply). Round 2: inside hand-over widened, knee 0.07 -> 0.10 m, ankle 0.05 -> 0.09 m. Build OK. To be re-rendered
  after the batch (r2/).
- 19:35 batch done (59 frames in final/; walk/run/stalk side+front/rear/tq from r1 weights + kpush/knee-depth tweak, the rest on r2).
  r2 (inside hand-over widened) changed nothing visible: the ankle crack is in the BEFORE render too (pre-existing), the knee
  sliver is still there. Before-tree renders (out/skel/legdeform/before/) show the knee read as a ball both before and after;
  dbgw at the knee (r3/) shows why: the knee ellipsoid (0.3 x 0.26 half sizes) is wider than the thigh's taper (0.22) that runs
  into it. Round 4: knee [0.3,0.2,0.26] -> [0.25,0.18,0.22], kmid reach 0.24 -> 0.2. Rendering r4/.
- 19:57 page checks passed (plain and #webgl, low tier, WebGL2, 0 errors, body check ok, vbuf 6/8). Final-code re-render batch final2/.
- 20:25 stopped final2 after the side sets (renders ran at ~90 s each); rendered run_tq_whole, turn_side_t2.2 and low walk midswing on the final code.
- 20:35 notes finished; build checked on the final tree.
