# Whole-body proportions of the T. rex (skin envelope)

Worked in `/home/claude/rex_skel`, 02:32 to about 04:10, with a server restart at about 03:24. The working log is in
`out/skel/props/log.md`. The tools, scripts, test outputs (`t1/`) and images are in `out/skel/props/`.
`IDX`, `LEG` and `PS` are unchanged. No vertex attributes or draw calls were added; the vertex-buffer check still reads 6 of 8.

## Method
- `out/skel/props/envelope.mjs` builds the real skin (as `RexBody` does), poses it at a sim pose and skins it on the CPU.
  It measures the envelope in the body frame and works without a browser (about 7 s).
  `dump=NAME` writes the posed mesh; `sil.py NAME --ref OLD` draws orthographic side, front and top silhouettes on a 0.5 m
  grid, with the old outline in red. Before and after silhouettes: `props/final_stand_sil.png`, `props/final_walk_sil.png`.
- The "before" numbers come from `props/before_tree/`: a copy of `src` with the original 4 files restored.
- Studio: new orthographic `cam=oside|ofront|otop` (`scale=` px/m, default 64, 1 m grid, ground 0.4 m above the bottom edge).
  The page logs an `ortho` record, so pixels convert to metres.

## Ratio table (standing, t = 6 s, idle; walk = mid-swing at 2.2 m/s)
Hip height (H) is the hip joint. "est." marks my own estimates from the cited bones, not published ratios.
| quantity | reference | before | after |
|---|---|---|---|
| total length | Sue 12.3-12.8 m [W1]; Paul ~11.5 [P] | 13.22 | 12.38 |
| femur + tibia + MT III | Sue 3.26 m [D20] | 3.52 | 3.52 (unchanged) |
| length / leg sum | Sue 3.77-3.93 | 3.75 | 3.52 |
| hip joint H / length | 0.23-0.25 est. (joint ≈ 0.9-0.95 of the leg sum); "3.66-3.96 m at the hips" [W1] read as top of hips: 0.29-0.31 | 0.238 (walk 0.236) | 0.264 (walk 0.252) |
| top of hips / length | 0.29-0.31 [W1] | 0.335 | 0.342 |
| back top above hip joint | +0.7-0.8 m est. (ilium 1.46 m long [P]) | +1.28 | +0.97 |
| skull / length | Sue 1.39-1.53 m [W1][P], 0.11-0.12; leaning to film | 0.147 (1.94 m) | 0.140 (1.73 m) |
| shoulder-to-hip / length | not found; ~0.20-0.22 est. | 0.232 (3.06 m) | 0.232 (2.87 m) |
| tail (hip to tip) / length | 0.55-0.58 [H11 via AUDIT] | 0.552 | 0.557 |
| belly clearance / H | 0.62-0.68 est. (pubic boot level); 0.70 leaning to film | 0.628 (walk 0.60) | 0.701 (walk 0.65) |
| depth at hip / H (trunk only) | ~0.55 est. | 0.66 | 0.52 |
| depth at mid-chest / H | 0.60-0.68 est. (last dorsal 0.78 m tall, longest rib 1.46 m [P]) | 0.78 | 0.59 |
| width at hips incl. thighs / H | not found | 0.70 | 0.72 |
| width at chest / H | not found | 0.48 | 0.47 |
| knee / H | ~0.57 est. (femur ~22° from vertical) | 0.585 | 0.583 |
| ankle / H | ~0.22 est. | 0.214 | 0.207 |
| foot length / H (skin, heel to claw) | print 86 cm on 11.4 m [W3] → ~0.94 m at our size, 0.29 H | 1.14 m, 0.36 | 1.23 m, 0.38 |
| foot width / H | print 64 cm [W3] → ~0.70 m, 0.21 H | 0.65 m, 0.206 | 0.70 m, 0.214 |
| thigh fore-aft / femur | not found (includes caudofemoralis) | 1.24 | 1.24 |
| hip-socket spacing | 0.6-0.8 est. (AUDIT) | 0.72 | 0.82 |
| leg gap from front, knee / mid-shank (walk) | narrow track | 0.39 / 0.11 | 0.43 / 0.07 |
| arm root height (stand) | high on the chest | 3.16 (hand at 2.46, chest bottom 2.32) | 3.40 (hand 2.72) |

What I measured, against the brief's guesses:
- The leg bones are not short for the body. Bone for bone, the body was not too long either: length over leg sum was 3.75, against Sue's 3.77-3.93.
- The big error was height: the trunk stood 1.28-1.62 m above the hip joint, and the chest was 0.78 H deep. The skull was 25-40% long.
- The shoulder-to-hip distance has no published value I could get (the Hutchinson 2011 tables sit behind a captcha), so I shortened it by 9% as an estimate.
- The film lean is in three places: the belly (0.70), the head (0.14 of the length, against Sue's 0.11-0.12) and the thighs.

## What changed and where
- `src/view/rexgeo.js`
  - TRUNK rows 13-18: the back is lower and the chest deepest. The belly line rises to the groin, and the trunk is narrower ahead of the thighs.
  - Tail rows are a little shallower. The ilium shelf is lowered (pu 0.62 → 0.40). The belly ellipsoid width is 0.82 → 0.76.
  - The head is drawn at the species `headScale`, through the skull bone matrix, so skin, teeth, eyes and lids scale together. `Prim.sd` returns metres in scaled frames, and the mouth slit's gap is kept at least one grid cell.
  - Legs: `thighOut` 0.28 → 0.30 (with wider sockets), and shank, calf, knee, ankle and metatarsus are about 10-18% thicker.
  - Toes are about 19% wider and taller. The claw is longer, reaches `clawOut` 0.07 m past the sim's toe tip, and is a mid-dark horn colour (0x383128).
  - Arm inner paint 0.4 → 0.12.
- `src/sim/rex.js`
  - The crouch reads the species `hipMove` (`(0.04 + DIM.hipMove) * m`).
  - Arm root: c.l 0.5 → 0.6, c.u -0.62 → -0.48, c.f 0.1 → 0.18; the upper arm angles out 0.12. Nothing else changed.
- `src/studio.js`: the orthographic cameras, and a `fov` log fix for them.

## Species fields changed (`src/species/tyrannosaurus.js`)
- `hipHeight` 3.15 → 3.26 (standing); new `hipMove` 0.09 (the walking target is 3.17, was 3.11).
  - The plain 3.28 tried before reproduced the over-extension; this split removes it.
- `hipHalf` 0.36 → 0.41.
- `backLen` 2.85 → 2.6.
- `tailLen` 6.6 → 6.2.
- New `headScale` 0.9 (skin skull 1.94 → 1.75 m); `headLen` 1.75 → 1.58.
- Derived from dimensions: `reachStop` 4.75 → 4.33 (the head is 0.17 m shorter and the back 0.25 m shorter).
- `spacing`: deliberately kept. Shrinking it by 0.4 m with the reach made gaze worse. It also led mind seed 5 into a freeze failure (below).
- `navBody` kept at 2.6: the trunk half-width did not grow.
- `hips.kneeOut` 0.2 → 0.3.
- Rejected: `headScale` 0.84 / `headLen` 1.47. The besieging neck pushed into gaps (barn: 1150 wall ticks at 0.33 m, against 124).

## Tests (raw outputs in `out/skel/props/t1/`; comparison is against `out/skel/feet_after/`)
- `review.mjs`: total pops 594 → 584, and neck bends are much fewer.
  - New: sprint over-extension, 2 ticks at 0.09 m (threshold 0.08).
  - New: toe contact in stalk (7 ticks, 0.03 m) and shove/roar (8 ticks, 0.02 m).
  - Better: lure "legs pass through" 73 → 8 ticks.
- `review.mjs mind` is chaotic per seed, so I swept 8 seeds (`mindseeds.mjs`):
  - Over-extension: 49 ticks / worst 0.23 m, against 75 / 0.31 before. Pops 826 against 840.
  - 8 more seeds (23-53): over-extension 68 / 0.33, against 33 / 0.34.
- Smoke `--force`: every test exits 0.
  - score `head_in_collider` FAILS (166 ticks), but `test/score.mjs` (and `test/siege.mjs`) probe a fixed 1.75 m head.
  - A copy that reads `DIM.headLen` (`props/score_headlen.mjs`) gives 0 ticks. Otherwise it has the same 4 fails as feet_after (neck/skull violations 1609 → 1142).
  - I did not edit `test/`. Those two probes should read `DIM.headLen`.
- siege: chest-to-head max 1.71-1.74 m (feet_after 1.72-1.74).
  - Wall contact over 3 seeds × all sites (`siege_headlen.mjs`): head 2598 → 1297 ticks, neck 240 → 0, tail 414 → 1357 (worst 0.20 → 0.38 m).
  - The tail rise follows the shorter back: the hips stand nearer the walls.
- gaze: off-target 6.3% → 4.8%; beyond the neck's reach 2.30% → 2.83%; unreported episodes 12 → 15.
- navsoak: 35/35 goals reached, stuck 5.8 → 5.9 s.
- Build passes. Plain and `#webgl` page loads both run with 0 console errors, body check ok, 6/8 vertex buffers, low tier 36,564 triangles (was 39,400). The high tier is 119,740 (was 129,480).

## Images (`out/skel/props/img/`), one honest line each
- `oside_stand.png` (64 px/m, 1 m grid): the back is level at about 4.2 m, the belly at 2.3 m, the head is in proportion and the arm is on the chest. The neck base still rises in a steep hump behind the head.
- `ofront_stand.png`: two separate legs, with thighs beside a narrower belly. The feet look small from the front, and the open-mouthed idle head hides the neck.
- `side_midstride.png`: lower back, higher belly, shorter head. Under the perspective side camera it still reads long and low, with a thin-looking lower leg in swing.
- `front.png` (mid-swing): the stance leg reads, but the swing leg and far thigh still hide behind the belly. The narrow track puts the shanks 7 cm apart.
- `tq.png`: the arms are visible on the chest and the near leg is strong. The flank is in shade, and the far leg is hidden.
- `eye.png` (1.7 m, 8 m): leg shows below the belly and both legs read. The body is still the dominant mass, which may be right for the animal.
- `foot_L_midstance.png`: the toes are thicker and the middle claw tapers past the toe. The claws still don't read as distinct hooked sheaths.

## Unfinished / unverified
- **A foot-logic failure that my distances first exposed.** Seed 5 with the reduced `spacing` braked from 8 m/s while the mind set freeze+stalk.
  - `_swing` (rex.js ~745) holds a swinging foot in the air on freeze+stalk. The body slid about 6 m with no step and the hips sank to 1.07 m (942 over-extended ticks, up to 3.26 m).
  - The final `spacing` avoids that path, but the rule is still there: a held swing should release when the body moves. That is foot logic, outside my remit.
- Tail wall contact in siege is higher than before (above).
- Reference ratios are partly estimates. No gleno-acetabular distance, hip-socket spacing, tibia or MT III per specimen was retrieved (the PMC tables are behind a captcha). The film animal has no published proportions.
- The mind's own head-model constants (`mind.js` eye offsets; `selfModel` eye `{0.55, 0.4, 0.42}`) are in design head units and are now about 10% off. I left them alone: they are mind files.
- Claws: still not distinct (see above). WebGPU was not exercised. The low tier was only checked via page load.

## Sources
- [W1] Sue: https://en.wikipedia.org/wiki/Sue_(dinosaur)
- [W3] Tyrannosauripus: https://en.wikipedia.org/wiki/Tyrannosauripus
- [D20] Dececchi et al. 2020, PLoS ONE 15:e0223698, Table 1 (hindlimb sum; via https://core.ac.uk/download/515935595.pdf)
- [P] G. S. Paul, Sue/Stan measurements from Brochu 2003: https://gspaulscienceofnonreligion.substack.com/p/the-science-of-dinosaurs-yet-more
- Femur by specimen (secondary): https://psdinosaurs.blogspot.com/2018/11
- [H11] Hutchinson et al. 2011, as cited in `AUDIT.md`
