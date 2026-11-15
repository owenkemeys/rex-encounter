# SKIN3: jaw webs, neck hump, thigh, detail at range, claws

Worked in `/home/claude/rex` from 11:38 to about 13:50 UTC by `date`. The environment restarted at about 12:35 and lost one render batch; nothing was half-edited.
- I edited only `src/view/rexgeo.js`, `src/view/body.js` and `src/studio.js`. `test/studio.py` is unchanged. Nothing in `src/sim/*`, `src/species/*` or `dist/` was touched.
- Backups of the originals are in `out/skel/skin3/backup/`. Work renders and probes are in `out/skel/skin3/work/`; page-check tools are in `skin3/tools/`; the scratch page is in `skin3/dist/`.
- No draw calls were added. Vertex buffers stay at 6 of 8 (the guard reads 6 for both main and shadow), and no vertex attributes were added.
  - The web sheets are marked by a negative value in the existing `fold` attribute.
  - Their texture coordinates replace `rest` for those vertices only (`geo.restTex`).

## For the motion engine (pose, not skin; I did not edit `src/sim`)
Spine joints are from `work/spine.mjs` (seed 3, flat ground). Pitch is each segment's slope in the sagittal plane, ending at that joint.
- **Stand (t 2):** joints 11-18 are near level (2-8 deg). The neck then turns up abruptly:
  - pitch 22, 44, 59, 58, 50, 38, 21 deg at joints 19-25.
  - Joint 18 is at 3.79 m and the head at 4.81 m: the neck root rises at ~60 deg straight off the shoulders.
- **Walk (t 4.2):** the same kink, smaller: 4 deg at 18, then 33, 44, 48, 37, 26, 14, 2 deg at 19-25. The head is at 4.37 m, 0.8 m over the shoulders.
- **Stalk (t 4.2), the owner's head-low look:** joint 19 is +8 deg, then the neck falls at -13, -26, -32, -27, -12 deg (20-24) and turns up again +14 deg at 25.
  - The head pivot is at 2.78 m, 0.37 m under joint 18 (3.15 m).
  - That is a forced S: up at the root, steeply down mid-neck, nose up at the skull.
- **Suggestion:** spread the neck's rise or fall over joints 19-24 more evenly (no segment over ~35 deg in a walk; in stalk keep 19-21 near level and let the drop start at 22). Keep the head pivot within about ±0.3 m of the shoulder joint height (18) when stalking.
- The skin no longer exaggerates this (see A), but a kinked chain will still show as a bend in the neck.

## 1. Jaw webs as thin sheets (`rexgeo.js` WEBSHEET, `webSheets()`; `body.js` web terms)
- **Geometry.** The lip cut now runs through the cheek back to the corner (`cut0` 0.14 head units). The old thick wall and its groove are gone.
- **Construction.** In the cut, inset 5 cm inside the cheek, hangs a dedicated strip for each corner, inside the same mesh:
  - an outer and an inner layer 1 cm apart, with a rim closing the free edge;
  - its top and bottom rows are buried in the lip walls and ride the skull and the jaw rigidly;
  - between them the jaw weight runs linearly, so each column is a straight chord when open: taut.
  - The middle is dished in 6 cm (concave from outside), with normals tilted to match.
  - The free edge bows back by `sag` (a bowstring) between the last upper tooth (z 0.47) and the lower lip (z 0.43).
- **Paint.** The outer face takes the cheek's averaged colour with its own soft occlusion. The inner face is mouth lining; the rim is cheek mixed with lining.
- **Shader.** The face's lip-gap and corner darkening and the fog-fresnel rim are switched off on the sheets.
  - Shut: two or three creases across the sheet, fading as it opens.
  - Open: the middle is up to 18% paler where it is stretched thinnest.
  - The lip faces over the sheet are shaded.
- **Rounds.** First round: the rim lit up as an ivory ribbon (specular on a forward-facing edge) and the outer colour was 3x too bright. Second round: the colour was fixed and the free edge moved forward, because when shut the slit showed sky where the bowed edge sat behind the old wall's place. I stopped there.

## A. Hump over the shoulders (skin)
- **Measurement.** On the built mesh (`work/dorsal.mjs`, bind pose), the skin top over the spine was +0.64-0.70 m over the hips and +0.48 m mid-back, but +0.86-0.92 m at the neck foot (2.4-2.8 m ahead of the pelvis). That is the hump. In a head-low pose it becomes withers with the neck falling off them.
- **Cause.** The neck's TRUNK rows (joints 19-21) were centred high: top +0.66 m in a frame that tilts back 45 deg with the rising neck. The dorsal-ridge ellipsoids also ran on to joint 20.
- **Fix.**
  - Neck rows 19-24 hang lower on their joints: top ~0.44 m, with the depth moved under into the throat.
  - The ridge stops at joint 17.
  - The neck foot's underside lift is reduced from 0.36 to 0.2, which fills the throat/chest notch.
- **Result.** The vertical offset is now smooth: +0.47, 0.51, 0.65, 0.70, 0.68 m from 2.2 to 3.0 m. The neck rises, so the vertical figure exceeds the perpendicular one (`dorsal_before.txt` / `dorsal_v1.txt`).
- The back over the hips is unchanged and is the highest point, as wanted.

## B / 2. Thigh up to the hip crest
- **Paint (the pale oval).** Thigh vertices are skinned to the femur and have no spine weight, so they took their countershading from their normal alone: a side-facing thigh came out flank-pale under the dark hip.
  - Above 1.5 m they now take their shade from their height in the pelvis frame, like the body beside them. The colour is continuous over hip and thigh.
- **Geometry.** `THIGHTOP` is a broad flat mass from the hip joint up to just under the back line.
  - It is fanned 0.9 m fore and aft along the ilium, set back 0.32 m, and weighted half pelvis, half femur.
  - The caudofemoral cone is thicker (0.42/0.32), so the tail base is as deep as the thigh.
  - The front crease against the belly is kept.

## 3. Detail at range: the cause and the fix
- **Cause.** There is no normal texture, so mip filtering and anisotropy do not apply. The hide is procedural screen-derivative bump, faded by `fade()` = 1 - smoothstep(0.07, 0.3, px*f):
  - every band began to fade when its cell spanned 14 px, and was gone at 3.3 px;
  - on the high tier the 5 cm pebbles were gone by ~5 m;
  - the layers meant for range (16 cm plates 2 mm deep, 30 cm lumps) were too shallow to shade, and faded across 8-30 m themselves;
  - roughness rose as bands faded;
  - the low tier (the arena renders: headless picks low, at ~50% render scale) had only 8 cm pebbles plus ±8% mottle.
- **Fix (both tiers).**
  - The fade window is now 0.1-0.36.
  - A patch field marks where scales run large: on the high tier a 9 cm cell field shows there; on the low tier the pebbles deepen.
  - A ridged-noise network of soft rounded folds ~40 cm apart, stronger in the fold zones (neck base, armpit, groin, joints). It is shading, not lines.
  - Stronger mid plates.
  - Tonal break-up (mottle, patches, fold valleys) grows as `near` (the fine scales' visibility) falls.
  - Each layer keeps its own footprint fade.
- **Cost.** About 3 noise evaluations more per pixel on the low tier and 4 on the high tier.

## 4. Claws
- `CLAWTIP`: on the three main toes of each foot, a hooked point mesh of its own.
  - It is a flattened tube along a cubic, from inside the sheath's middle, over and down to a sharp tip past the toe end, rigid on the distal toe bone.
  - The field's sheath now stops inside it.
- 9 × 9 segments per claw on the high tier, 6 × 7 on the low tier.

## Triangles (skin mesh)
| tier | before (SKIN2) | after | surface | claw points | webs |
|---|---|---|---|---|---|
| high and medium (4 cm) | 118,900 | 121,564 (+2.2%) | 119,104 | 972 | 1,488 |
| low (7.25 cm) | 36,304 | 37,384 (+3.0%) | 36,348 | 504 | 532 |

The surface itself changed slightly from the open corner cut, the neck and the thigh fan.

## Checks
- `npx esbuild src/main.js ...` builds.
- Plain load and `#webgl` load use the scratch page `out/skel/skin3/dist` with the new `app.js`; `dist/` is untouched. Tools: `skin3/tools/load.py`; results in `skin3/load/`.
  - Both reach the started state on WebGL2, low tier, with 37,384 tris.
  - Body check ok (stage done). Vertex buffers: geometry 6, main 6, shadow 6, of 8. 0 console errors.
- **Not tested:** real WebGPU (SwiftShader only here). The node changes use only ops already in the material, and the guard counts 6 buffers, but a real WebGPU pipeline compile was not seen.
- **Not run:** `review.mjs` and the other Node tests, since other agents own those runs. The geometry has no NaNs and index bounds are fine (`work/geostat.mjs`).

## Final images (`out/skel/skin3/img/`), with one honest line each
- `head_side_closed.png`: a shut corner with the folded sheet in the slit. The sheet reads as a striped strip rather than soft creases, and a little sky still shows between the last teeth (some was there before, `/tmp` baseline).
- `head_side_third.png`: a recessed skin panel behind the teeth with a dark-red edge. At this opening it is small, and the edge reads more than the sheet.
- `head_side_wide.png`: the best view. A recessed sheet spans the corner with a curved red-lined free edge and lining behind it. It still reads somewhat as a flat panel, and the concavity is weak.
- `head_tq_wide.png`: the far web shows its lining face and edge. The near web is seen edge-on and is hard to read as a sheet.
- `head_eye_wide.png` (player view): both webs show as dark panels with a red edge line. There is a pale grey patch on the far cheek beside the far web (sky or rim light; not traced).
- `head_roar_side.png`, `head_roar_tq.png`: the roar pose works with no tearing. In three-quarter view the near web is again a dark wall more than a membrane.
- `head_side_wide_low.png` (low tier): the sheets are present and there is no see-through. Coarser.
- `body_side_stand.png`, `body_side_walk_mid.png`, `body_oside_stalk.png`, `body_oside_walk.png`: no hump.
  - The back runs level into a thick neck in stalk.
  - The throat is fuller, but a shallow waist remains under the jaw in walk.
  - The stand/walk neck still turns up steeply at its root (pose, see above).
- `thigh_hip_midstance.png`, `thigh_hip_forward.png`, `thigh_hip_back.png`:
  - The thigh rises into the hip, its colour matches the body, and the front crease holds.
  - Its back edge is still a sharp curved ridge with a highlight, where the fan meets the caudofemoral mass.
  - There is a small lump at the top of the hip where the fan meets the old hip shelf.
- `foot_L_midstance.png`: clearly hooked, pointed claws on the three main toes. Where the point leaves the field sheath the paint boundary is jagged, and the tips sit just off the ground.
- `dist_04m.png`: full scale relief with folds. Unchanged in character from before.
- `dist_08m.png`: soft folds on the neck and flank, patchy scale tone and plates. No longer smooth brown.
- `dist_16m.png`: tonal patches and broad folds are visible but soft. Still smoother than ideal.
- `dist_30m.png`: some tonal break-up survives. At this size it is mostly the paint's countershading.
- `dist_08m_low.png` (low tier): the folds and patches carry on phones. The underside still reads flat and box-like (not addressed).
- `arena_day_20m.png` (the real page, low tier, ~50% render scale, compare `out/verify/img/arena_day_20m.png`):
  - visible tonal break-up and soft folds on neck, flank and tail;
  - the thigh is the body's colour and blends into the hip;
  - the neck flows from the back.
  - Single still frames cannot show shimmer; motion was not checked.

## Unfinished / unverified
- **Webs.** Two rounds are done, and I stopped. What is in the way:
  - the strip is skinned by linear blending between two bones, so each column is a straight chord and the concavity has to be baked into rest x, where it barely shows;
  - with its edge bowed back, the shut mouth leaves a short open slit ahead of it;
  - a membrane whose sag and fold depend on the opening needs a jaw-driven vertex offset (`PS.JAW` in a `positionNode` after skinning, in head space), which I did not attempt.
- **Thigh.** The back edge ridge is left after two rounds. The fan and the caudofemoral cone meet at a small blend radius; the next try would be one combined primitive.
- **Range detail.** Shimmer in motion is not verified, and real-GPU cost is not measured.
- **Pose.** The neck S is in the sim (above).
- **Owner messages.** Both arrived before the restart: owner_shot_1114 and owner_skeleton_overlay_1114.

## Files changed
- `src/view/rexgeo.js`: WEBSHEET, webSheets, CLAWTIP, clawTipMesh, THIGHTOP, neck rows, ridge/cut, thigh paint, web paint.
- `src/view/body.js`: web terms, range layers, `restTex`.
- `src/studio.js`: `cam=dist&d=`.

## Log
- 11:38 created file; reading context.
- 11:55 backups of the four editable files in out/skel/skin3/backup/. Read studio, SKIN2, body.js, rexgeo build/paint. Baseline images = SKIN2's img set + out/verify arena.
  Distance-blur diagnosis (from code, before any render): there is no normal *texture*; the hide relief is procedural bump
  (screen-derivative) faded by `fade()` = 1 - smoothstep(0.07, 0.3, px*f): a band starts fading when its cell spans 14 px
  and is gone at 3.3 px. Arena renders were low tier at ~50 % render scale (VERIFY.md), which only has the 8 cm pebbles
  (gone by ~3 m there) plus a +-8 % tonal mottle. High tier: 5 cm pebbles gone by ~5 m; the layers meant for range (16 cm
  plates, 0.002 m deep; 30 cm lumps) are too shallow to shade and fade through 8-30 m themselves. Roughness also rises as
  bands fade (lost variance), flattening the specular. Next: jaw web strip.
- 11:52 web sheet v1-v6 (work/w*): strip built; rims read as pale ribbons (specular on forward rim); outer colour fixed to darkened cheek average. Coordinator added tasks A (neck hump) and B (thigh up to spine), +30 min.
- 11:55 A: spine joints 13..25 printed (work/spine.mjs); bind-pose dorsal offsets measured (work/dorsal.mjs, dorsal_before.txt): back +0.48 m over the joints, but +0.86-0.92 m at the neck foot (2.4-2.8 m ahead of the pelvis). Cause in skin: neck rows 19-21 centred high (top +0.66 in a frame tilted back 45 deg) plus the dorsal-ridge ellipsoids running on to joint 20. Fix v1: neck rows lowered (top ~0.44 perpendicular, depth moved under), ridge stops at joint 17, neck-foot underside lift 0.36->0.2. Now 0.65-0.70 vertical (rising neck), smooth (dorsal_v1.txt).
- 12:00 B: thigh paint was pale because thigh vertices (femur-skinned, no spine weight) took their countershade from their normal only; now from height in the pelvis frame above 1.5 m. Geometry: THIGHTOP fan over the ilium (pelvis/femur half weights) + thicker caudofemoral cone. b1_hipmid: colour continuous, top blends; back edge still a curve -> v2 fan further back.
- 12:09 task 3: fade window 0.07-0.3 -> 0.1-0.36; new range layers (patch field, ridged soft folds ~40 cm, 9 cm coarse scales in patches, stronger mid plates and mottle as fine detail fades). v1 too subtle (d1), v2 visible at 8 m (d2), v3 pushes far weight.
- 12:14 task 4: CLAWTIP hooked point meshes (cubic, flattened tube, rigid on distal toe bone), field sheath shortened inside them. c2_foot: clearly hooked and pointed; base seam jagged in paint. Next: web closed/third/roar, finals.
- 12:18 web: closed mouth showed sky through the slit where the bowed free edge sat behind WEB.z (the old wall had blocked it); free edge moved forward (zU 0.47, zL 0.43, sag 0.07). Rendering finals.
- 12:32 finals rendered into img/: head set (closed, third, wide side/tq/eye, roar side/tq), body sides (stand, walk mid, oside stalk/walk), thigh hip views (mid/forward/back), foot. Environment restart ~12:35 killed the distance-final batch.
- 13:33 resumed: tree builds, geometry intact (high 121,564 tris = 119,104 surface + 972 claw points + 1,488 webs; low 37,384 = 36,348 + 504 + 532). Both coordinator messages (owner shot, skeleton overlay) had arrived before the restart. Next: distance finals one at a time, low tier, arena 20 m, page loads.
- 13:36 dist_04/08/16 done.
- 13:37 dist_30, low-tier dist_08 and head wide rendered.
- 13:41 arena 20 m rendered from scratch dist (out/skel/skin3/dist, low tier in headless). Next: page loads.
- 13:48 page checks passed; deliverable written.
