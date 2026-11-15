# Leg and foot skin, and the studio renderer

Done in `/home/claude/rex_skel`, 01:16 to about 02:40, with one server restart at about 01:55. Nothing in `src/sim/*` changed. `IDX`, `LEG` and `PS` are unchanged. The species file is unchanged too: one trial was reverted (see Stance). No vertex attributes and no draw calls were added; the vertex buffer guard still reads 6 of 8.

## A. Studio (`test/studio.py`, `src/studio.js`, usage in `test/studio.md`)
- `src/studio.js` is a separate entry point; `main.js` is not touched. It runs the real `RexSim` on flat ground (seed 3, 120 Hz) and builds the real `RexBody`, with the real skin material and teeth/eyes.
  - The scene is a matte grey floor, a hemisphere fill and one key light with a 1024 shadow. There is no grass, props, dust, fog or post effects. `Math.random` is seeded, so the output is deterministic.
- Pose: a named scenario (`stand`, `walk`, `slow`, `jog`, `run`, `stalk`, `turn`, `walkturn`) at `t=`, or `phase=midstance|heeloff|toeoff|midswing|land` with `foot=L|R`.
- Cameras: `side`, `front`, `rear`, `tq`, `top`, `eye` (1.7 m high, 8 m off), `foot_L`, `foot_R` (about 2 m off, from outside; from behind-outside when that foot trails), `hip`, `knee`.
  - Each camera is fitted from the joint positions. The aim and lens come from the angular extent of those points, as seen from the camera.
- Cost per 1280x720 frame here: 22-60 s. About 6 s of that builds the skin; 15-52 s is the first draw (shader compile plus the SwiftShader draw). Close-ups that fill the frame with skin are the slowest. The low tier takes about 14 s.

## B. What changed in the skin (`src/view/rexgeo.js` only; `body.js` unchanged)
1. **Feet** (new exported `FOOTSKIN`).
   - Digits II, III and IV are now separate toes. Their bases sit 9 cm apart across the distal metatarsus, and their flesh is about 18 cm wide, against the old 28 cm.
   - Each digit is a run of phalanges (II 2, III 3, IV 4, plus the claw) with a knuckle over every joint and a fat pad under it. The pads reach the ground: the bone axis is 0.06 m above it, the sim's `foot.pad`.
   - Each digit has a 3-piece, down-curved, laterally flattened claw, with the toe flesh ending behind it.
   - A thin web of skin joins neighbouring toe bases. It is weighted half to each toe's bone, so it stretches when the toes splay.
   - A small hallux sits high on the inside-back of the metatarsus.
   - The paint adds skin folds across each knuckle.
   - Toe flexion and splay drive the toe bones as before. Splay opens the separate digits, and roll-off bends them at the MTP and mid joints.
2. **Ankle and metatarsus.**
   - The ankle has condyles, a bony heel behind it, and tight blends that keep a waist below it.
   - The metatarsus is narrow and deep at the top and broad and flat at the bottom. It ends in three metatarsal heads that run into the toes.
   - A flexor tendon ridge runs down the back and an extensor line down the front.
3. **Thigh and drumstick.**
   - The thigh mass stands 0.28 m outside the socket (was 0.17), against the body wall, with a small blend (k 0.07, was 0.14) so that a crease shows. It is egg-shaped and tapers into the knee through a cone.
   - The caudofemoralis blend into the tail base is tighter (k 0.13, was 0.24).
   - The belly bulge fades out beside the thighs and swells only in front of them, and the trunk is 4 cm narrower at the pelvis.
   - The shank narrows to 0.17 at the ankle (was 0.21), with a firmer calf.
   - Measured in the bind pose, the outer thigh surface now stands at 1.10-1.12 m from the midline, against 0.88 m for the trunk at the hips. Before, it was 1.01-1.04 against 0.92.
4. **Stance.** See below. Nothing was kept.

## Triangles (skin mesh)
| tier | before | after |
|---|---|---|
| high and medium (4 cm grid) | 130,684 | 129,480 (-0.9%) |
| low / phone (7.25 cm grid) | 39,472 | 39,400 |

The low tier uses thicker toes and claws (`FOOTSKIN.coarse` 1.25) and has fewer pads. In the studio (`tier=low`) its toes still read as three, but coarse.

## Checks
- `npx esbuild src/main.js ...` builds.
- Real page, from a copy in `out/skel/legskin/dist` built from the final tree, checked with `out/skel/legskin/pagecheck.py`. Both a plain load (no hash) and `#webgl` reach the running state with 0 console errors. The body check reports `ok: true`, 39,400 triangles and 6 of 8 vertex buffers. SwiftShader picks the low tier and WebGL2 for both.
  - One `#webgl` attempt timed out in Playwright while the page was waiting for web fonts. The rerun passed.
  - The high-tier mesh is exercised only through the studio.
- `node test/review.mjs` is identical to `out/skel/feet_after/review.txt` (diff empty; `out/skel/legskin/review.txt`).

## Images (`out/skel/legskin/img/`, all on the final geometry), one honest line each
- `foot_L_midstance.png`: three distinct toes with knuckle humps and separate claws, and the web at the base. The claws still read as dark rounded toe-caps more than hooked claws, and the pads are not visible from this height.
- `foot_L_heeloff.png` (taken from behind-outside, because the foot trails): the toes are separate, and the hallux is small and tucked. At heel rise 0.13 rad the bend barely shows. Same claw fault.
- `foot_L_toeoff.png`: the heel is up and the toes are bent at the joints, but at this framing the toes are small in the frame. The camera includes the ankle and the other leg, so it does not read as a foot study.
- `front.png`: one thigh now bulges beside the belly. The legs still read thin and converge to a narrow track under a wide chest (the track is the sim's).
- `rear.png`: the left thigh stands out beside the rump; the right one is hidden by the swung tail. The lower legs read thin.
- `side_midstride.png`: a drumstick that reads, with a crease at belly and tail. The animal still looks short-legged: the deep trunk ends at about 2 m, against a 3.15 m hip.
- `tq.png`: the thigh is visible beside the belly and the feet are separate toes. The near flank is in shade.
- `eye.png`: at 1.7 m and 8 m the thigh and the foot's toes read. The legs still look short against the body.
- `hip_legfwd.png` and `hip_legback.png`: no tearing or sinking at full stride. With the leg back, the thigh's lower end is a rounded bulb over a thinner knee.

## Stance (B.4)
- I tried `dims.hipHeight` 3.15 → 3.28. Review got worse: leg over-extension appeared in targets (31 ticks, 0.12 m), run (2) and sprint (4), with more pops and neck bends. I reverted it (`out/skel/legskin/review_hip328.txt`).
- What would fix the short-legged look: a longer lower leg and a higher hip together (for example tibia 1.38, meta 0.84, hip 3.3, which keeps the leg's extension where it is now). Or a shallower trunk: the belly bottom is at 2.0 m, and a JP-style read needs about 2.2 m. Both are re-tunes, not constant tweaks.

## Unfinished / unverified
- Claws, after two rounds: they still read as dark toe-caps. The obstacle is the construction:
  - the claw must end at the sim's toe tip and is blended into the toe by the same field;
  - the claw paint follows the nearest-primitive tag;
  - at a 4 cm grid a 5-6 cm claw spans only about 3 cells.
  A separate claw mesh would fix it, but that adds a draw call.
- Pads are not checked from below or from ground level.
- The low tier was looked at only once (toe-off).
- WebGPU was not exercised by the studio (SwiftShader).

## Files
- New: `src/studio.js`, `test/studio.py`, `test/studio.md`, `out/skel/legskin/` (images, `pagecheck.py`, page copy, review outputs, `*.before.js` backups).
- Changed: `src/view/rexgeo.js`.
