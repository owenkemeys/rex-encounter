# EYES2 — in-game eye aim fix

Status: DONE (14 Nov). Fix in body.js only; measured before/after in the real game page (runs 1-3).

## Notes (14 Nov)
- Suspect #1 (from code, to confirm in page): `src/sim/arena.js:67` (`opening`, game start) calls `sim.reset()`, and
  `src/sim/rex.js:177` `reset` does `this.fix = new Vector3(...)`. `src/main.js:82` set `body.fix = sim.fix` ONCE at boot, so
  after the opening the view holds the OLD Vector3 (40 m ahead of the boot spawn, 4 m up) that nothing updates. Studio never
  resets after binding, so it hid this.
- Suspect #2: catchlight `body.js` eyeMat.emissiveNode: a cos^160 spot (~5 deg radius) 15 deg off the camera-facing point;
  pupil half-size ~17x20 deg, so when the eye looks at you the glint sits INSIDE the pupil (owner's complaint).
- Tools (outside the project): /home/claude/eyes2tools/probe.js (in-page measure + staging via arena.step intent override,
  as studio's &player), cap.py (one load: natural start, then 5 staged cases, screenshots). Bundle: out/skel/eyes2/dist.
- Edits made (source, after the "before" bundle was built): body.js top: `RexSim.prototype.reset` wrapper keeping the `fix`
  Vector3 identity (view-side workaround); body.js eyeMat.emissiveNode: glint moved to ~26 deg up, smaller (cos^300),
  0.45, masked off the pupil (normalLocal.z smoothstep 0.93..0.87). Waiting for the "before" capture run.
- CONFIRMED by code path: main.js:79 `OPEN` is null on #test hashes (test-mode natural start measured 0.9 deg per eye,
  sameFix true: out/skel/eyes2/test_natural_before.json) but set in the real game: spawn you (-13,2), rex (15,14) are 30.5 m
  apart (src/paddock.js:80) > 25, so arena.opening (main.js:92, after body.fix was bound at main.js:82) calls sim.reset ->
  new `fix` Vector3. The view's fix is then frozen at (~-21.4, ground+4, ~-2.6) for the whole game. Studio and #test never hit it.
- Running: real page (no hash) before (dist_before) and after (dist), real.py, 5 staged cases each.

## Run 1 (real page, no hash, WebGL2/swiftshader, high tier) — out/skel/eyes2/run1/
- BEFORE (old bundle): `sameFix:false`; body.fix frozen at (-27.4, 4.45, -0.55) all game, sim.fix tracks the player.
  Per-eye error vs the line to the camera (L / R deg): 4 m 45.1/41.9, 8 m 34.6/18.0, 12 m 32.9/17.8, 8 m@30 20.0/24.5.
  Each eye exactly on the frozen point (errBodyFix 0.3-14, the rest is the eyeAim limit). Unequal L/R: the frozen point sits
  off to one side, so one eye reaches it and the other is at its inward limit (owner's "one eye looks at me, the other not").
- AFTER (patch): `sameFix:true`, body.fix == camera. Run 1's staging had a bug (re-placed the player 30 deg off the head's
  *current* forward every 50 ms, so he orbited and the head never caught up): residuals there are not valid. Rerunning
  (run 2) with the player held at a fixed spot.
- run1/rb_4_0.png: grey frame (camera in a fog/fade state at 4 m; not judged).

## Run 2 (real page, player held still at D m, bearing B off the snout at placement; head then turns) — run2/
Angle per eye between its pupil axis and the line to the camera (deg, L / R). "settled" = the same case 2.5 s later (zoom on).
Head = angle between the head's forward and the line to the camera.
| case | BEFORE first / settled | head | AFTER first / settled | head | vergence after settled |
|---|---|---|---|---|---|
| 4 m, 0 | (run1: 45.1 / 41.9) | | 13.2 / 19.0 (head moving) / - | 25.6 | - |
| 8 m, 0 | 31.5 / 38.6 -> 20.9 / 33.3 | 3.6 | 0.7 / 1.3 -> 0.4 / 0.4 | 0.8 | 5.8 (geometric ~6-8) |
| 12 m, 0 | (run1: 32.9 / 17.8) | | 0.8 / 1.1 -> 1.2 / 1.2 | 0.9 | 4.1 |
| 8 m, +30 | 44.6 / 59.4 -> 19.1 / 57.6 | 1.1 | 11.7 / 20.3 -> 1.1 / 1.1 | 1.0 | 5.5 |
| 8 m, -30 | 17.4 / 29.1 -> 23.2 / 31.6 | 1.6 | 4.7 / 1.5 -> 0.8 / 0.8 | 1.3 | 6.2 |
Before: with the head on the player (1-4 deg) the eyes were 19-58 deg off, unequal L/R: aimed at the frozen point.
After, settled: 0.4-1.2 deg every case (target 3). The "first" after-samples (11.7/20.3 at +30, 13/19 at 4 m) were taken
while the head was still turning (head 26-28 deg off): the eyes were 10-15 deg behind their own target in head space
(want 26 deg out, had 15), because the ball's easing was 0.6 PER FRAME and this headless page runs at a few fps. Fixed after
run 2: easing is per second (0.6 at 60 fps, `this._ek`), so at low fps the balls keep up with the turning head. Run 3 checks.

## Cause (file and line)
1. MAIN: `src/sim/rex.js:177` (`reset`: `this.fix = new Vector3(...)`) + `src/sim/arena.js:67` (`opening` calls
   `sim.reset` when the animal is > 25 m from the gate and sim.t < 0.5) + `src/main.js:82` (`body.fix = sim.fix`, bound once,
   BEFORE `arena.opening` at main.js:92). Real-game spawns are 30.5 m apart (`src/paddock.js:80`), so every real game resets
   and the view keeps the boot spawn's fixation (40 m ahead of the original spawn, 4 m up) for the whole game. #test hashes
   (OPEN null) and the studio never reset after binding, which is why the previous fix measured 0 deg there.
2. The 14 Nov catchlight (`body.js` eyeMat.emissiveNode): a view-space spot 15 deg off the camera-facing point, inside the
   pupil (half-size ~17 x 20 deg) of an eye that looks at you: a white blob on the pupil exactly when it stares at you.
3. Minor, low-fps only: per-frame eye easing (body.js `E.dir.lerp(this._d, 0.6)`).
Checked and NOT the cause: bone index (BONE.SKULL used for H and the eyes; 82 bones, matrices from boneMatrices), group
transform (identity, logged), coordinate spaces (fix world -> head space through inverse(H) including headScale; eyes
error vs body.fix 0.3-1.6 deg when settled), left/right sign, aim height (sim.fix == camera position, y = ground + 1.7 + bob).

## What changed (src/view/body.js only)
- Top of file (after imports): `RexSim.prototype.reset` wrapper: keeps the `fix` Vector3 the view holds (copies the new value
  into it). View-side workaround, idempotent (`_keepFix`). Remove it when the motion engine does item 1 below.
- `eyeMat.emissiveNode`: glint now small (cos^300), soft (0.45), ~26 deg up-left of the camera-facing point, and multiplied by
  `smoothstep(0.93, 0.87, normalLocal.z)`, i.e. zero on the pupil disc and its rim in the ball's own frame: it can never sit
  on the pupil. Import `normalLocal`.
- `update`: eye easing per second (`this._ek = 1 - exp(-55 dt)`, 0.6 at 60 fps).
No change to rexgeo.js, studio.js, legs, sim, main, ui, dist.

## For the motion engine (src/sim/rex.js)
`reset()` must not replace `this.fix` (the view holds that Vector3 since boot): `this.fix ? this.fix.set(x + sin(yaw)*40, groundY + 4,
z + cos(yaw)*40) : (this.fix = new Vector3(...))`. Same care for anything else the view may bind. Then the wrapper at the top
of body.js can go. (Alternative: main.js reads `sim.fix` every frame instead of binding once.)

## Highlight decision
Kept, but reduced to a small soft glint on the upper cornea that is masked off the pupil in the ball's frame. In the 8 m
zoomed game captures the eye now reads as amber with a dark centre; before, a white spot sat on it.

## Run 3 — FINAL (real page, all three body.js changes; fa = high tier, fl = #quality-low) — out/skel/eyes2/fa_*, fl_*
(The two page loads ran at the same time on a loaded machine; numbers per eye L / R, deg, vs the line to the camera.)
| case | BEFORE (run 1/2, old build) | AFTER first sample (head err) | AFTER settled 2.5 s later | vergence |
|---|---|---|---|---|
| 4 m, 0 | 45.1 / 41.9 | 0.99 / 0.54 (head 12.5 off) | 0.54 / 0.54 | 13.5 |
| 8 m, 0 | 31.5 / 38.6 -> 20.9 / 33.3 | 1.02 / 1.02 | 1.11 / 1.11 | 5.7 |
| 12 m, 0 | 32.9 / 17.8 | 0.71 / 0.70 | 0.85 / 0.85 | 4.1 |
| 8 m, +30 | 44.6 / 59.4 -> 19.1 / 57.6 | 0.62 / 0.62 (head 5.9 off) | 0.18 / 0.18 | 5.9 |
| 8 m, -30 | 17.4 / 29.1 -> 23.2 / 31.6 | 0.76 / 0.76 (head 5.7 off) | (run 2: 0.78 / 0.78) | 5.2 |
| 8 m, 0, LOW tier | - | 1.29 / 1.26 | 1.03 / 1.03 | 5.8 |
Target (<= 3 deg, converging) met in every case, including while the head is still turning (run 2's 11-20 deg transient
before the per-second easing is gone). Residual ~0.5-1.3 deg = the small fixation saccades (+-1.3 x 0.8 deg) by design.
Natural (unstaged) samples, eyes on their own target (scan/brain, not the player): 0.6-1.6 deg, vergence 1.9-2.5 deg
(neither cross- nor wall-eyed).

## Images (out/skel/eyes2/), one line each
- run2/rb_8_0_z_eyes.png BEFORE, 8 m, game zoom, crop: white glint on the eyes, pupils off toward the outside: not looking at you.
- run2/rb_8_30_z_eyes.png BEFORE, 8 m +30: right-of-screen eye visibly off; glint on the ball.
- run2/ra_8_0_z_eyes.png AFTER (run 2), 8 m: amber eyes, dark pupil centred toward the camera, no white blob.
- fa_8_-30_z_eyes.png AFTER final, 8 m -30 settled: both pupils dark, central, facing the camera.
- fl_8_0_z_eyes.png AFTER final LOW tier, 8 m: same read as high tier.
- fa_12_0_z_eyes.png, fa_8_30_z_eyes.png, fa_8_0_z_eyes.png: same, at 12 m / +30 / 8 m (not individually inspected in detail).
- fa_*_eyes.png without _z (native lens): at 8-12 m each eye is ~4 px; the pupil cannot be resolved at the native lens,
  only with the game's zoom (x3). The stare at the native lens is carried by the head.
- fa_4_0.png, run1/rb_4_0.png: whole frame flat grey at 4 m (some full-screen state of the game this close; not eye-related,
  not investigated): the 4 m case is verified by numbers only, not by image.

## Unverified
- 4 m visually (grey frame). WebGPU backend (all runs WebGL2/swiftshader). A moving player. Night (glint is emissive, 0.45).
- Pupil readability at 8 m without zoom: not possible at ~4 px per eye; with zoom it reads but is small. Did not enlarge the
  pupil (time); consider 12x14 -> 15x17 px in irisTexture if the owner still finds it hard to read.
- Lids/brow poke-through when looking to the side: not specifically inspected beyond the crops above (none seen).
- The sim-prototype wrapper in body.js is a workaround; the real fix is in rex.js reset (see "For the motion engine").
