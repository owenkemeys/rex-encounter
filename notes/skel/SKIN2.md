# Skin pass 2: jaw webs, drumstick, claws, leg colour

Worked in `/home/claude/rex_skel` from 04:07 to about 05:15 UTC by `date` (some early log times below were guesses and run ahead of the clock). No server restart happened.
- Edited only `src/view/rexgeo.js`, `src/view/body.js` and `src/studio.js`. `src/sim/*`, `src/species/*` and `test/studio.py` are unchanged. `test/studio.md` is also unchanged; the new studio options are documented in the header of `src/studio.js`.
- Backups of the originals are in `out/skel/skin2/backup/`; the working tools are in `out/skel/skin2/tools/`.
- No draw calls or vertex attributes were added. One uniform was added (`jawU`). The body check reads 6 of 8 vertex buffers.

## Studio additions (`src/studio.js`)
- `jaw=RAD`: overrides `PS.JAW` after the pose. Values used: 0, 0.3 and 0.85; the roar reaches about 0.83.
- `roar=T`: calls `sim.roar()` at T s, which raises the head and opens the jaw.
- `cam=head|headtq|headeye`: head close-ups fitted to the head's own points, including the opened chin.
  - `headeye` stands 1.7 m high, 5 m from the snout, 26 degrees off the head's line, looking up.
- `cam=leg`: the left leg from the side, from hip to toes.

## 1. Jaw webs (`rexgeo.js` WEB; `body.js` headDetail)
- **Construction.** Behind `WEB.z` = 0.46 head units, just behind the last upper tooth at 0.50, the lip cut stops `inset` inside the narrower of skull and jaw.
  - The wall left from the cheek to the lower jaw is the web.
  - A shallow groove outside it (`thick` 0.08) sets the web back from the cheek's edge.
  - Its vertices share skull and jaw by height over a band of ±0.05 (wider toward the hinge), so opening the jaw stretches it into a sheet.
  - The triangle-drop rule now drops only ahead of `WEB.z`. Behind that, such triangles are the web.
- **Paint.** No baked occlusion on the web (`webM`). The inner face is mouth lining.
  - The back wall of the mouth was tagged skin and showed olive from below; it is now painted lining.
  - In the shader, rest-space creases at the corner fade with `jawU = PS.JAW`. A dark line marks the shut corner.
  - The fog fresnel rim is masked in the face's occluded spots and inside the mouth (`inMouth`). Without that, the shut corner showed a pale seam and the open mouth from below a pale sheet.
- **Fold behind the jaw** (a known fault, visible in `roar` at 4.9 s). Under the mouth, the skin handed over from the neck stations to the jaw within z 0.1-0.3. The deep jaw's back swings back about 0.5 m when it opens, so its skin folded over the throat in a vertical edge.
  - Now, outside the mouth cavity, the hand-over spans z 0-0.7 (`JAWBACK.span`). The edge is gone.

## 2. Drumstick (`LEGSKIN`)
- **Why it read thin.** The mesh was not thin: in the bind pose the shank is 0.9 m deep at the knee and 0.62 m wide mid-shank (`tools/leg_bind_before.txt`).
  - The thigh's lower end and a 0.72 x 0.8 m knee ellipsoid hung over the shank's thick upper third.
- **Thigh.** A rounded mass, with front and back edge masses (cones) converging into a smaller knee.
  - Depth at 0.7 and 0.8 of the femur is now 0.83 and 0.70 m (was 1.30 and 1.22).
- **Shank.** Cone, cnemial crest, a calf behind the upper half, and a tendon down to the heel.
  - Sections: 0.71 x 0.93 at 0.2 of its length, 0.45 x 0.44 at 0.9 (`tools/leg_bind_v1.txt`).
- The metatarsus sections were softened: they showed as rings down the back of the foot.

## 3. Claws
- **Shape.** Shorter visible horn (`claw` 0.26 to 0.21; it was half the toe). Heavier and arched: radii 0.06 to 0.02, reaching `clawOut` 0.09 past the toe tip.
- **Paint.**
  - The horn runs from dark at the base to pale (0xb4a88e) at the tip and along the top, in the toe bone's frame.
  - A dark rim of skin sits behind the base.
  - `scute = -1` marks horn, and `body.js` drops 90% of the hide's relief there on both tiers.

## 4. Leg colour
It was paint and baked occlusion, not normals. A grey-material render (`skin2/tq_grey_now.png`) lights the shank like the body.
- The shank's paint already matched the flank. From the ankle down the paint went dark, and the toes' baked cavity was 0.5.
- LEGLOW is now 0x5a4f3d at 0.5 (was 0x4a4236 at 0.65), and the baked occlusion is halved near the ground.
- Paint albedo, flank 0.079: metatarsus 0.072 (was 0.053), toes 0.062 (was 0.042) (`tools/legpaint_*.txt`).

## Triangles (skin mesh)
| tier | before | after |
|---|---|---|
| high and medium (4 cm) | 119,740 | 118,900 (-0.7%) |
| low (7.25 cm) | 36,564 | 36,304 |

## Checks
- `npx esbuild src/main.js ...` builds.
- `node test/review.mjs` is identical to before (`skin2/review_before.txt` and `review_after.txt`).
- A plain page load and a `#webgl` load (`skin2/tools/pagecheck.py`, page copy in `skin2/dist`) both reach the running state.
  - Both report WebGL2, low tier, 36,304 tris, body check ok, vertex buffers 6 of 8 (main 6, shadow 6), and 0 console errors.
- The low-tier web was checked once (`skin2/low_open.png`): it is there, with no see-through.
- WebGPU was not exercised.

## Final images (`out/skel/skin2/img/`), with one line each on what is still wrong
- `head_side_closed.png`: the slit no longer runs open to the corner (before, sky showed through: `skin2/base/head_closed.png`). The corner is a dark groove whose upper edge catches a thin highlight.
- `head_side_third.png`: the mouth ends in a skin corner behind the last teeth. At this opening the web is too small to read as a sheet.
- `head_side_wide.png`: there is no see-through. The web reads as a dark cheek wall more than a taut, slightly concave membrane, and its front edge is soft. The jaw's underside has a small notch where the new hand-over ends.
- `head_tq_wide.png`: the mouth is closed at the back and lined in red. The near web is in shadow and hard to read as a separate sheet.
- `head_eye_wide.png` (player view): a deep, dark mouth with no sky through it; the webs read as dark corners. A few stair-step specks remain on the stretched lining at the back.
- `head_roar_side.png`: the hard fold behind the jaw is gone. A shallow kink is left in the jaw's lower outline.
- `leg_side_midstance.png`: the drumstick reads: a thick shank under the knee with a calf behind it, tapering to the ankle. The thigh's back-top mass is a bit lumpy.
- `leg_side_forward.png` (`phase=land`): the shank is heavy and tapered. A small pale patch on the far thigh's inner face is the existing inner-leg paint.
- `leg_side_back.png` (`phase=toeoff`): no bulb at the thigh's lower end; it narrows into the knee. The knee's front is a soft round knob.
- `tq_whole.png`: the shank reads thicker. The lower leg is still darker than the body there, because its side faces away from the key light and lies under the belly's shadow; it is not black, and the claws show pale.
- `front_whole.png`: two legs with drumsticks and pale claw tips. The track is still narrow (that comes from the sim).
- `foot_L_midstance.png`: distinct smooth horn claws, dark where they leave the skin and pale at the tip. From above they read as tapered and only mildly hooked. A one-pixel sliver shows at the outer claw's tip.

## Not done / limits
- After the fourth web round I stopped patching. A web that reads as a thin membrane would need its own surface: a thin sheet a cell or two thick meshes poorly at 4 cm (7 cm on phones), and both faces are stretched linearly between two bones.
  - That gives a flat chord, so a concave sag cannot be made with skull and jaw weights alone.
  - A third bone or a shape key driven by `PS.JAW` would do it, but that needs extra vertex data.
- **Claw hook.** The claw is still a cone run inside the field, and a 2 cm tip is half a grid cell. A strongly hooked, flattened claw needs geometry finer than the grid: a separate claw mesh (a draw call) or a finer local grid around the feet (more triangles).

## Working log
- 04:07 started; backups taken. Next: baseline review.mjs, read rexgeo.js/body.js.
- 04:30 studio: jaw=, roar=, cam=head|headtq|headeye added. Baseline head_open in skin2/base: dark smeared corner with see-through holes. Web v1: WEB={z:0.46,inset:0.05,band:0.05} in rexgeo (slit lim, weight band, drop rule).
- 04:45 web v2: paint (webM: no baked AO on web, inner face less throat-dark), body.js jawU uniform (PS.JAW) drives corner creases; gap darkening starts at WEB.z. Side wide open: no see-through, far web's lining visible inside. Build OK.
- 04:58 web v3: tag-0 back wall of the mouth painted lining (was olive skin seen from below); creases outer face only. Remaining: dark stair specks on the stretched back-wall sheet's edges (eye view).
- (clock: real times from `date`; earlier entries' times were guesses) 04:20 closed corner: baseline (base/head_closed.png) shows the slit open to the corner with sky through it; now a dark creased line. Pale seam streaks fixed by masking the fog fresnel with the face darkening and softening crease relief (0.0025).
- 04:40 (real) fold behind the jaw (roar pose, `roar=3 t=4.9`): the jaw's skin behind z 0.3 handed from neck stations to the jaw over only z 0.1-0.3 (head units); the deep jaw's back swings ~0.5 m back as it opens, so its skin folded over the throat's in a vertical edge (w6_roar2). Fix: under the mouth (outside the mouth cavity) the hand-over spans z 0-0.7 (`JAWBACK.span`). First try (fade jaw->skull, JAWBACK.z0/z1) changed nothing (those vertices carry no head weight); kept, harmless. A fin appeared where the mouth-floor exclusion mask met the jaw underside; mask narrowed to the cavity only. Build OK.
- 04:35 legs, diagnosis. Bind-pose sections (`skin2/tools/legprobe.mjs`, `tools/leg_bind_before.txt`): the shank is NOT thin in the mesh (0.9 m deep at the knee, 0.62 wide mid-shank, 0.47 at the ankle). It reads thin because the thigh's lower end (main ellipsoid down to 0.84 of the femur plus a 0.72 x 0.8 m knee ellipsoid) hangs over the upper, thickest third of the shank, so what shows below it is the tapering lower two-thirds. Leg colour (`tools/legpaint.mjs`, before = now): paint albedo flank 0.082, thigh 0.086, shank 0.08-0.10, metatarsus 0.053, toes 0.042, claws 0.019. A grey-material render (`skin2/tq_grey_now.png`) lights the shank like the body, so normals are fine; the dark shank in tq is mostly its shadowed side, and the black from the ankle down is paint (LEGLOW 0x4a4236 at 0.65) plus baked cavity (toes 0.50).
- 04:50 drumstick v1: LEGSKIN thigh [0.46,0.46,0.56] + front/back edge cones converging to a smaller knee [0.3,0.2,0.3] at 0.94; shank cone [0.36,0.17] + calf (0.28, z -0.2) + cnemial crest + calf tendon cone; new studio cam=leg. Bind sections (tools/leg_bind_v1.txt): thigh depth at 0.7/0.8 of femur 0.83/0.70 m (was 1.30/1.22); shank 0.71 x 0.93 at 0.2, 0.45 x 0.44 at 0.9. l1_mid.png: reads as a drumstick.
- 05:00 leg colour v1: LEGLOW 0x4a4236@0.65 -> 0x5a4f3d@0.5, baked cavity halved near the ground. Albedo now metatarsus 0.072 (flank 0.079), toes 0.062 (was 0.053/0.042). Claws v1: heavier arched cones [0.072,0.062,0.044,0.02], clawOut 0.1, horn paint dark base -> pale tip and top (CLAWB/M/P) in the toe bone's frame, no mottling/occlusion darkening.
- 04:35 claws v3: FS.claw 0.26->0.21 (the visible horn was half the toe), clawOut 0.09, arched cones [0.06,0.056,0.042,0.02]; paint dark base (CLAWB) -> mid -> pale tip/top (CLAWP 0xb4a88e), a dark rim of skin behind the base; scute=-1 marks horn and body.js drops 90% of the hide relief there (both tiers). f3_mid.png: distinct smooth horn claws with a clear base boundary; curvature reads only mildly from above. Build next.
- 04:41 checks: build OK; review.mjs identical (skin2/review_before.txt vs review_after.txt); plain page load: WebGL2 low tier 36,272 tris, body check ok, vbuf 6/8 (main and shadow 6), 0 console errors. Triangles high 119,740 -> 118,740, low 36,564 -> 36,272.
  #webgl load: same, 0 errors.
- 04:46 web v4: a shallow groove outside the web's outer face along the mouth line (WEB.thick 0.08), so the stretched sheet stands back under the cheek's edge: side view now shows a distinct recessed sheet with a front edge (g1_open.png vs img/head_side_wide.png before re-render). Pre-groove copy: skin2/rexgeo_pre_groove.js.
- 04:52 eye view: the stretched back of the open mouth went pale pink from below (the fog fresnel rim on a big grazing sheet); body.js headDetail now returns inMouth (hp-based) and the rim is masked inside the mouth (both tiers); the mouth's back wall is painted darker (THROAT 0.7). The eye view now shows a deep dark mouth.
- 04:55 metatarsus sections longer/softer (k 0.05 -> 0.09): the rings down the back of the foot are gone (leg_side_back). Final re-render of all images next.
