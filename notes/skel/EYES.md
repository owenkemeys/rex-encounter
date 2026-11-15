# EYES investigation

Status: DONE (14 Nov). Fix in; main and studio bundles build. 15 studio renders. No load checks or tests run (machine busy).

## Step 1: how the eyes work now (read 14 Nov)
- Eyeballs: separate `SphereGeometry(EYE.r=0.062)` meshes (one per eye, `MeshPhysicalMaterial`, clearcoat) riding the skull
  bone matrix (`src/view/body.js` RexBody constructor + `update`). Not part of the skin; the skin has a cut socket.
- Iris/pupil: a 256x128 canvas texture (`irisTexture`) mapped equirectangularly; iris disc centred on the ball's +z,
  angular radius ~62 deg (covers almost the whole front hemisphere); pupil 9x12 px = ~13 x 17 deg half-angles; dull brown iris.
- Orbit axis `local`: yaw `EYE.yaw`=0.6 rad (34 deg) outward, 3.4 deg up (`makeRotationX(-0.06)` ). Position from `geo.eye`
  (x found on the skin surface), head space x 0.4, y 0.27, z 0.37 (times headScale 0.9).
- Aim: `body.fix` = `sim.fix` (main.js:82), the simulation's fixation point (Vector3). The attention target is the camera
  position (main.js:533), so the aim height is the player's eye: correct. Each eye computes its own line to `fix` (so
  vergence would be possible) BUT is clamped to the orbit axis: near-side eye <= 0.42 rad (24 deg) off the 34-deg-outward
  axis, far-side eye <= 0.12 rad (7 deg). A target straight ahead is on the inner ("far") side of both eyes, so both pupils
  stay ~27 deg outward of the target: the eyes stare past the player on both sides.
- Smoothing: `E.dir.lerp(d, 0.6)` per frame (fast). Saccades +-2.6 deg x, +-1.4 deg y, shared by both eyes, every 0.35-2 s.
- Mirroring: `sd` = +1 left (x+), -1 right; rotation `makeRotationY(sd*yaw)` and near test `d.x*sd>0`: consistent.
- Lids: lathe shells rotated about the orbit's x axis; upper follows the ball's vertical a little; lower lid fixed at 0.62 rad.
  Brow: scaled sphere over the lid. Lid/brow material plain dark brown.
- Highlight: none of its own; only the key light's clearcoat specular, which depends on light/camera geometry.
- Sim (`src/sim/rex.js` `_attention`, aim ~l.1255): head pivot's forward is aimed at `fix` (yaw limited +-1.5 rad off the
  chest, pitch -1.05..0.8) with small "live" wobble (~1.3 deg yaw, ~1 deg pitch). PS has BLINK, LID, SQUINT; no eye yaw/pitch,
  no pupil size.
- Studio had no target: `body.fix` null, eyes at rest axis (34 deg out).

## Step 2a: measured aim error BEFORE (Node, `out/skel/eyes/aim.mjs old`, saccades off, head free, 5 s settle)
Head aims its forward axis within 0.2-0.7 deg of the player's eye at every range and bearing (the head does all the work,
pitch matches the target's: -31 deg at 4 m, -7 deg at 20 m). The eyes do not:
| D m | per-eye error (both eyes, any bearing 0..+-60) | direction | vergence (actual / needed) |
|---|---|---|---|
| 4 | 34-38 deg | each eye ~34 deg OUTWARD (L aimed left, R aimed right) and ~6-8 deg ABOVE | -56 deg (diverging) / +12 |
| 8 | 31-32 deg | same | -56 / +6 |
| 12 | 30 deg | same | -56 / +4 |
| 20 | 29 deg | same | -56 / +2.4 |
Mean 31.5 deg, max 38.2. Cause: the clamp to the 34-deg-outward orbit axis (7 deg for the "far" side, which a target
straight ahead is for both eyes). Walleyed: both pupils look past the player on either side, slightly over his head.

## Step 3/4 (in progress): first fix applied, builds
- `src/view/rexgeo.js`: new `EYE_AIM` + `eyeAim()` (pure; next to `EYE`): each eye's own line to the fixation point, limits
  outward 57 / inward 17 / up 26 / down 32 deg (head space), resting gaze 15 deg out.
- `src/view/body.js` `RexBody.update`: uses `eyeAim`; saccades halved while fixating.
- `src/studio.js`: `&player=D,B`, `&cam=player|playereyes`, `&oldeyes` (pre-fix aim, for before/after).
- Node after: error 0.0 deg at all 28 cases (sim.fix == player eye when locked), vergence equals the geometric need.

## Renders so far (1280 budget: 3 used)
- `out/skel/eyes/b_8_0_eyes.png` (before, 8 m ahead, cam at player, eyes crop): pupils sit at the OUTER edge of each eye: walleyed, looking past you.
- `out/skel/eyes/a1_8_0_eyes.png` (aim fix only): the pupils are now aimed at the camera (1.1 deg) but are INVISIBLE: the
  forward/inner part of each ball (where a pupil looking at you must be) is hidden behind the skin ahead of the socket; only
  the lateral iris shows in the slit. Second cause: socket geometry blocks the forward view. Working on it (Node raycast).

## Step 3b: pupil visibility from the player (Node raycast, `out/skel/eyes/vis.mjs`, skin + lids + brow, 9 points per pupil)
- Aim fixed, socket unchanged: pupil centre hidden at 4-12 m for both eyes (blocked by a skin ridge x~0.44 at z 0.45-0.55, in
  front of the socket: the dark wedge in a1), 31% of pupil points visible overall; upper lid hides the pupil's top.
- + notch cut ahead of the socket (`EYE_NOTCH`, rexgeo.js eye-socket block): skin no longer blocks; 75% visible (lids).
- + lid frame turned to 17 deg out (`EYE_AIM.lidYaw` 0.3, was the orbit's 34): 100% visible at 4/8/12/20 m, 0/+-40 deg (high tier).
- Applied in body.js: lids/brow on `lidLocal` (EYE_AIM.lidYaw); brighter amber iris, pupil 12x14 px (was 9x12); fixed
  view-space catchlight (emissiveNode on a MeshPhysicalNodeMaterial, no new draw call or attribute).
- `out/skel/eyes/a_8_0_eyes.png` (all fixes, 8 m ahead, eyes crop): both pupils now face the camera and are fully visible (render 5).
- `out/skel/eyes/a_4_0.png` (all fixes, 4 m ahead, head lens): both pupils on the camera, catchlights visible; reads as a stare (render 6).
- (render 7, before at 4 m, was cut off by an environment restart)
- `b_4_0.png` (before aim, with the new lids/notch, 4 m): pupils at the outer corners, walleyed (34 deg) (render 8)
- `a_16_0_g62.png` (after, 16 m, game lens 62 deg): each eye is ~3 px; an amber point shows, the pupil cannot be resolved; the stare is carried by the head pose at this range (render 9)
- `a_16_0_eyes.png` / `b_16_0_eyes.png` (16 m, eyes crop; renders 10-11): after, both pupils are round discs (face-on) with a
  catchlight, sitting a little toward the nose in the almond: aimed at you. Before, the pupils are foreshortened into upright
  ovals sitting toward the outer corners: aimed past you. The difference is clear in the crop, small at game lens.
- `a_8_40.png` / `b_8_40.png` (8 m, 40 deg to its left, head lens; renders 12-13): the head turns to face the player; after,
  both pupils sit toward the nose and face the camera; before, both toward the outer corners.
- `a_side.png` (three-quarter head view while staring at a player 8 m ahead; render 14): the pupil sits at the front of the
  ball looking forward, not bulging; the new notch reads as a short crease running forward from the eye's front corner.
  The lids' pale rims look a little plastic (pre-existing colour, untouched).


## Summary: causes (what made the stare read "off")
1. **Walleyed aim (main cause).** The ball was clamped to <=7 deg off its orbit axis, which faces 34 deg outward, for any
   target on the snout side. Staring straight at the player, each pupil pointed ~30 deg outward (29-38 deg) and 4-8 deg above
   him; the two axes diverged by 56 deg instead of converging by 2-12 deg. The head itself aimed within 1 deg of his eye.
2. **The front of the ball was hidden.** A skin ridge just ahead of the socket (head x~0.44, z 0.45-0.55) covered the part of
   the ball that faces forward, so even a correctly aimed pupil was invisible from in front (raycast: centre hidden at 4-12 m).
3. **Lids set for the 34-deg axis** clipped the top of a forward-looking pupil (2 of 9 sample points).
4. **Weak cues:** dull brown iris close in value to the pupil and the brow shade; small pupil; no highlight of its own
   (only the key light's clearcoat glint, which wanders with the lighting).
Not the cause: aim height (the target is the camera position, i.e. the player's eye), head pitch (matches the target's
within 0.5 deg), smoothing (eyes ease at 0.6/frame), left/right mirroring (consistent).

## Aim error: before / after (Node, `node out/skel/eyes/aim.mjs old|new`; 4/8/12/20 m x 0, +-20, +-40, +-60 deg)
| | before | after |
|---|---|---|
| per-eye angle, visual axis vs line to the player's eye | 29-38 deg (mean 31.5), outward and above | 0.0 deg all 56 eye-cases (studio measures 1.1 deg with the residual saccade) |
| vergence | -56 deg (diverging) everywhere | equal to the geometric need: 11-19 deg at 4 m, 6-8 at 8, 4-5 at 12, 2.3-2.7 at 20 |
| pupil visible from the player (`vis.mjs`, 9 points/pupil, skin+lids+brow) | centre hidden at 4-12 m; 31% of points | 100% at 4/8/12/20 m x 0/+-40, high and low tier |
Eye rotation in the orbit while staring ahead: 36-45 deg from the socket axis (15-20 deg from the ball's new resting gaze).

## What changed
- `src/view/rexgeo.js`: `EYE_AIM` and `eyeAim()` next to `EYE` (pure; each eye's own line to the fixation point; limits
  outward 57 / inward 17 / up 26 / down 32 deg; resting gaze 15 deg out; `lidYaw` 0.3). `EYE_NOTCH` + one extra `cut`
  ellipsoid after the eye-socket cut (in the socket loop), opening the socket's front corner forward. (Skin topology near the
  eye changes slightly; no new attributes, no new draw calls.)
- `src/view/body.js`: `RexBody` constructor: per-eye `lidLocal` (lids and brow face 17 deg out); eye material is a
  `MeshPhysicalNodeMaterial` with an `emissiveNode` catchlight fixed in view space (~15 deg up-left of the camera-facing
  point); `irisTexture`: brighter amber iris, pupil 12x14 px (was 9x12). `update`: uses `eyeAim`; saccades halved while fixating
  (+-1.3 x +-0.8 deg). Imports `EYE_AIM, eyeAim`.
- `src/studio.js`: `&player=D,B` (stands and stares at a 1.7 m eye D m from the head at bearing B, look lock + attention;
  `body.fix = sim.fix`, 20 view updates so the balls settle), `&cam=player|playereyes` (camera at that eye, head- or eye-fitted,
  logs per-eye aim error as `eyes`), `&oldeyes` (pre-fix aim only, for before/after). Header documented. `test/studio.py` unchanged.
- Measurement scripts (not tests): `out/skel/eyes/aim.mjs`, `vis.mjs`, `hw.mjs` (skull half-width map round the eye).

## For the motion engine (`src/sim/rex.js`, and one line in `src/main.js`)
1. **Eyes follow `sim.fix`, which can lag the player by up to 0.1 rad (5.7 deg) when attending without a lock**
   (`_attention`: `thr = a.kind === 'path' ? 0.2 : lock ? 0.05 : 0.1`, then a slow `fix.lerp(S, expK(dt, 1.4))`). At 8 m that is
   ~0.8 m beside the player's face while he walks: the head can lag like that, the eyes should not. Either give the view the
   subject itself (`body.fix = sim.subject` in main.js:82 while `att.kind === 'player'` or `look.lock`, else `sim.fix`), or expose
   a separate eye target updated every tick to `S` when the subject is the player. Saccades/refix blinks stay on `fix`.
2. Nothing else needed: the head's forward already meets the player's eye within 1 deg (pitch -31 deg at 4 m), and the eyes now
   cover vergence and small offsets. Optional: with the eyes taking up to ~17 deg, the head could stop a few degrees short of the
   target (snout a little below/aside) for a less robotic stare; not required for the pupils to be seen.

## Images (`out/skel/eyes/`), one line each
- `b_8_0_eyes.png` before, 8 m ahead, eyes crop: pupils at the outer corners, foreshortened: looking past you.
- `a1_8_0_eyes.png` aim fixed only: pupils aimed at the camera but hidden behind the ridge ahead of the socket; only lateral iris shows.
- `a_8_0_eyes.png` all fixes: both pupils round, face-on, with catchlights. Still: a translucent-looking vertical band down each
  side of the snout (skin silhouette fresnel/fog term, not eye-related, not touched).
- `a_4_0.png` / `b_4_0.png` 4 m: after, unmistakably at the camera; before (old aim, new lids) pupils at the outer corners.
  Still: the default `player` lens frames the head low and small; crop to judge.
- `a_16_0_g62.png` 16 m, game lens: eyes ~3 px, an amber point; the pupil cannot be resolved, the head pose carries the stare.
- `a_16_0_eyes.png` / `b_16_0_eyes.png` 16 m crop: after round pupils toward the nose with catchlight; before ovals toward the outer corners.
- `a_8_40.png` / `b_8_40.png` 8 m, 40 deg to its left: head faces the player; after pupils on the camera; before outward.
- `a_side.png` three-quarter head while staring ahead: pupil at the front of the ball, not bulging or cross-eyed; the notch reads as
  a short crease forward of the eye; lid rims a bit pale/plastic (pre-existing).
- `a_8_0_low.png` low tier, 8 m crop: same result as high tier; skin coarser round the socket.

## Unverified
- Not run: load checks, node tests, the game itself, WebGPU backend (studio used WebGL2; the node material is standard TSL).
- Notch effect on the skin elsewhere (only the head round the eye was looked at; the cut is local, radius <= 9 cm).
- A moving player (fix lag, item 1 above), distances under 4 m, extreme head positions (lunge, roar, lying), blink/squint
  with the new lid frame, night lighting (the catchlight is emissive, 0.9, and will glow faintly in darkness), glare per eye.
- Whether the bigger pupil reads well at dusk, and whether the catchlight should dim when the eye is in deep shadow.
