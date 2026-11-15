# BODY4 — neck lateral S, standing leg twitch, jaw twitch, head vs walls

Started 2026-11-15 (UTC). Working tree /home/claude/rex. Scratch/output: out/skel/body4/.
Files allowed: src/sim/rex.js, src/species/tyrannosaurus.js, src/view/body.js, src/view/rexgeo.js, test/.

## Status log
- created; reading QUEUE, BODYFIX3, TUNE3, MERGE.

## Needs from the mind
- mind.js:1920 (display): reads `a.x` with know.target null; crashes saltline runner seed 3 with the current rex.js (CRASHDBG=1 node test/saltline.mjs runner prints the stack).
- Search unstick cycle (Saltline noise/3, crouch/2...): the mind flips search 'move' <-> back-off 'drive' every ~1.5 s while hemmed; the body's speed takes ~1 s to reverse, so it rocks in place for 20-60 s. Wanted: hold a back-off until the hips have moved ~1 m or 3 s, and judge progress only after the body had ~1.5 s to get going.
- Arousal: none needed (intent.burst, intent.pace > 6, intent.agitation are used; coordinator).
(none yet)
- Pre-edit copies: out/skel/body4/pre/ (sim, species, view, review.mjs). Runnable pre tree: /tmp/b4pre (may vanish on restart: rebuild by
  copying src+test and dropping pre/sim/rex.js + pre/species in).
- ITEM 1 NECK. Probe: test/necksniff.mjs (person still 14 m ahead; the mind comes on and sniffs at 5.7-7 m; standing probe ticks:
  sniff/read/stop). Measures per tick the top-view bend of each neck joint (root, j1..j6, skull off the last vertebra), S
  (sign reversal along the neck), bulge on both sides of the chord, skull aim off the person, jaw rate/reversals. --orbit w: the
  person walks round it at w rad/s once close; --trace [--every n].
  BEFORE (3,5,8; 190 s standing): max joint 39.7 deg, root 23, skull-off-neck 45, sum|bend| p50 72 p90 144 deg; S along the neck
  63.8% of ticks (with skull 70.6%); both-sides bulge >2 cm 52.8% (worst 14.9 cm). out/skel/body4/necksniff_before.txt.
  CAUSES: (a) the neck's sideways shape was mean+gradient (x4,x5) plus a separate root yaw: any S was allowed, only weighted;
  (b) the probe's head goal was the point at the standoff on the line from the CURRENT HEAD to the person: once there, any point
  was as good, the head drifted out to the side 40-60 deg off the chest while the skull stayed on him -> S; (c) the person's
  keep-out sphere pushed the snout sideways (fed on itself); (d) the sniff "cast" slid the head 0.2 m sideways with the skull
  held on target (only an S can do that).
  FIX (rex.js + species `neck`): sideways shape = one total x[1] shared over all 7 joints by a never-negative profile (lean x[4],
  |x4|<=0.7): structurally one C; species neck.latJoint 0.11 rad/joint, latTotal 0.6 rad; skull on atlas skullSame 0.36 / against
  the curve skullOpp 0.1; low-pass latTau 0.07 s + rate 1.6 rad/s on the curve (catch-up faster when neck lags head > 0.1 m);
  YAW_GAZE = latTotal+skullSame (0.96; was 1.5), YAW_MAX +0.06; probe goal on the line from the neck root; keep-out draws the
  head back toward the neck root; sniff cast = head swing (yaw 0.1 rad, place rotated about the root). Species reorient cone
  0.8 / coneT 0.6 / snap 1.25 / done 0.35 (was 1.1/0.9/1.5/0.4) so the body turns sooner now the neck reaches less.
  AFTER: max joint 1.9, root 1.5, skull-off 10.5, sum|bend| p50 2.1 p90 3.7; S 0.0%; bulge both sides 0.0% (body now faces him).
  Orbit 0.25 rad/s (seeds 3,5): before S 97% / joint 44 deg / aim p50 7 p90 18 max 66; after S 0.9% / joint 7.3 / aim p50 11 p90 27
  max 70 (aim a bit worse: the head no longer reaches round; the existing chest twist oscillation 20<->40 deg at ~1 Hz while
  turning in place is in both trees). necklat.mjs exit 0; necklat_idle C-bulge max 6.0 cm ahead (before 4.3), any pose 12.1 (before 29.0).
- COORDINATOR DIRECTION for item 4 and after (owner-agreed; do items 1-3 first and report them): body = ~12 simple volumes (snout,
  skull, neck x2, chest, belly, hips, tail x3-4) tested via the world's existing collision queries only; snout is a touch organ
  (feels its way in by light contact; no invisible margin); fit judged ahead by sight only for what it looks at; behind the
  shoulders contact+force only; constraints in the body for EVERY motion incl. withdrawal (bump frame, adjust, event for sound;
  never pass through); crash response at speed: push-out along normal, torso lean/roll, stagger step, lost speed (~1 s of
  ground), event {force, part, surface}; caution shrinks with arousal (needs arousal input from mind -> "Needs from the mind");
  tail contact + slap event; legs last; never wedge (saltline.mjs, stuckopen.mjs). Order: head/snout/jaw volumes for all
  motions incl. withdrawal; torso+hips with crash; tail. Report each stage with numbers + in-game screenshots. No balance physics.
- ITEM 3 JAW. Probe out/skel/body4/jawlog.mjs (30 s of probe/sniff). Cause: intent.nose added 0.07*max(0,sin 8.5t) to the jaw
  (1.35 Hz pulses 0.058->0.10 rad, fast-closing jaw: a twitch) on top of a 0.05*rho parted mouth. BEFORE: jaw 0.008..0.102 rad,
  80 reversals in 30 s (2.67/s). FIX: nosing jaws shut (no pulse), the probe's parted mouth closes 85% while it scents (noseK,
  0.3 s ease). AFTER: 0.008..0.019 rad, 0 reversals (seeds 3 and 5). Sniffs still read via head pulls + huff gestures + audio.
- ITEM 2 LEG (in progress). Probe test/fidget.mjs (scripted listen/prowl-hold intents, mind runs with a still person at 14.5/36.7
  m, play-like runs with herd: wander / runs). "fidget" = lift-off with < 0.25 m hip travel and < 0.12 rad turn in the next 1.5 s;
  "repeated" = another within 3.5 s. Found (play runs seed 3, prowl/stalk frozen, t 97-99 s): the same foot lifted 3 times 1.1 s
  apart, need 2.2-2.7 (a placement error), omT ~0. CAUSE: under a freeze every swing that started was "put back" where it
  lifted (sw.frz was set on the first swing tick, so a step lifted while already frozen was always put back) -> the error stayed
  -> lifted again. FIX (rex.js _feet/_swing/_lift): put back only a step that was under way when the freeze came and was not a
  settling step; a standing settling step (no travel/turn/lunge asked, stance not running out) needs its error held 0.4 s
  (frozen 0.8 s, need >= 1.35). Before/after full runs -> out/skel/body4/fidget_before.txt / fidget_after.txt.
- review.mjs before/after (out/skel/body4/review_before.txt / review_after.txt): neck pops mostly gone (idle alone 12 -> 1 clusters,
  walk+investigate 26 -> 20 none on the neck). First after-run showed new: stalk headU pop 4516 (skull sideways limit used bearings
  with the head pointing down: now faded out when steep and rate-limited 0.012 rad/tick), foot twisted 0.83 in idle watching and leg
  over-extended 19 ticks in targets-all-round (settling-step gate held steps while the body was slowly turning: the gate now only
  applies when |om| < 0.05 and need < 1.6 (+1.4 frozen)). Recheck: those gone; walk+investigate keeps a 1-episode toe tic at 18.8 s.
- Fidget (before -> after, 4 seeds, 120 s): TOTAL fidget 121 -> 54, repeated 65 -> 10; play runs seed 5 (prowl/stalk frozen, same
  foot every 1.5-2 s, put back) 26/24 -> 1/0. Remaining repeats: the other foot squaring up after a turn. review.mjs now counts
  "same foot lifted again with no move or turn (fidget step)".
- Verification chain: out/skel/body4/suite.sh -> v_*.txt (progress suite_progress.txt). In-game: /home/claude/b4 (dist copy of
  rex_rc + own app.js; shot.py own port; sniff.py player-cam + top shots) -> /home/claude/b4/img.
- (restart 05:1x) suite chain done through stuckopen (exit 0: 0 stuck in open ground); suite2.sh reruns gaze/fidget/necksniff/orbit; gaze baseline on /tmp/b4pre -> gaze_before.txt
- FINAL ITEMS 1-3 VERIFICATION (05:40):
  necksniff 3 seeds after: max joint 1.9 deg, S 0.0% (before 63.8%), bulge both sides 0% (before 52.8%), skull aim p90 55 (before 57).
  orbit after: S 1.0% (before 97.4%), max joint 7.3 (44), aim p50 11 / p90 26 / max 70 (before 7/18/66).
  fidget after: 54 fidget, 9 repeated (before 121/65). review mind fidget (same foot again) 35 -> 1 over 4 seeds; neck bend >35 deg
  14889 -> 1581 ticks; pops per seed 123/146/114/136 -> 80/67/95/72. New in review mind: seed 3 toe splay tic 129 ticks at 7.4 s;
  leg over-extended seed 3 56 (32) and seed 7 28 (0) ticks in the 70-75 s run; seed 7 hips slide 0.03 m. Not chased.
  gaze.mjs: beyond-neck 1.49% -> 0.84%, >60 deg 3.4 -> 3.9%. platform: all pass. stuckopen exit 0 (0 in open ground).
  neckcheck (skin, pre-existing FAIL): 88 -> 78 failing poses; band spacing 0.53 -> 0.63, area 0.75 -> 0.86, edge stretch 7.90 -> 8.38.
  In game (/home/claude/b4/img/sniff_cam_after.png, sniff_top_after.png): probe/sniff at 5.7 m; from above the neck is a straight
  line over 6 shots 1 s apart, no S; player cam: head square on, no sideways writhe. Pre build shots running -> sniff_*_before.png.
- NEXT: item 4 per coordinator direction. test/clip.mjs written (spheres on snout/skull/jaw/neck/torso/tail/feet vs terrain.near;
  structures, person inside, Loft at the owner's spot). Pre-tree partial baseline in clip_before.txt (interrupted). Plan: final
  clearance of the DRAWN skull (neck end, after the skull limits rotate it) + jaw spheres in skull(); then torso/hips crash, tail.
- ITEM 4 started: pre-item-4 copies out/skel/body4/pre4/; clip.mjs on current tree -> clip_cur.txt
- ITEM 4 BEFORE (current tree, clip.mjs, partial while running; full in clip_cur.txt): the Loft s3 snout 3043 ticks >2 cm / 0.46 m
  deep, jaw 486/0.35, skull 83/0.22 (besiege/go and probe); s5 snout 2011/0.45, jaw 437/0.35, skull 52/0.31. Feeding Tower s5:
  skull 1007/0.46, neck 249/0.49, torso 297/0.46, tail 396/0.72 (feed/eat under the tower).
- STAGE 2 (rex.js): `_headVol` = skull+snout spheres (as before) + 4 lower-jaw spheres hinged at the back of the skull, swung by
  the gape; used by the head's own wall test (skull()) and by the new `_headFinal` run after _neck: the DRAWN skull (neck end,
  after the neck/atlas limits turned it) is tested and slid out along the surface (<= 0.15 m/iter, 4 iters; the move is carried
  down the neck by (i/N)^1.5), the dynamic head moved with it, closing speed into the surface removed, press to the body
  (headPushV/headPress), and an event {type:'contact', part: snout|skull|jaw, surface: collider kind, force: closing m/s, x,y,z,
  normal} when a touch starts (0.25 s apart) or on a knock > 1.2 m/s. Loft s3 100 s after: snout/skull/jaw/neck 0 ticks.
  probe.mjs (head really goes in?) before/after running -> probe_pre4.txt / probe_s2.txt.
- in-game before/after sniff (pre build: sniff_top_before.png shows the neck hooked/S in 2 of 6 frames; after straight)
- STAGE 2 follow-ups: (a) a thin wall: a head volume past the wall's middle was pushed out the far side (into the room): `_cSample`
  now takes `_cHome` (the neck root for the head) and pushes a part past the middle of a wall run back to the body's side; (b)
  straddling a jamb end-on (snout pushed in, skull out, alternating): after 3 plain pushes, the smallest whole-head move that
  frees it (back / either side / up / mixes, 0.05-0.6 m) is taken. Gatehouse s5 head ticks 130 -> 6, Containers s5 51 -> 0.
  Contact event force = closing speed in the world (head + body). Sprint-into-wall review case: the head now stops at the wall and
  the neck is folded back (review "head goal unreachable gap" 28 ticks, 1.45 m) where before it went through: stage 3 (body crash)
  is the real answer. Side effect fix: chest twist while turning on the spot: aim held in the world while standing + lead terms
  low-passed: chest yaw-rate reversals 24 -> 4 in 25 s (orbit, seeds 3 and 5). Arousal for stage 3: intent.burst, intent.pace
  (> 6 m/s), intent.agitation (coordinator; already passed to rex.js).
- In game stage 2 (/home/claude/b4/img/loft_cam_after.png, loft_out_after.png; build before the thin-wall/jamb follow-ups): the
  Loft, player inside at (46.2,68.5), the animal reset at (53.1,70.3): besiege/probe shove then peer; from the player's camera
  the head fills the doorway, the eye turned in, behind the jambs; from outside the snout rests on the planks at the opening.
- Rerunning everything on the final stage-2 tree: suite3.sh -> s4_*.txt (review, review mind, platform, stuckopen, gaze, orbit,
  necksniff, saltline, clip, probe, fidget). rex.js snapshot out/skel/body4/rex_stage2.js.
- STAGE 2 FINAL (06:50; rex.js = out/skel/body4/rex_stage2_final.js; dist /home/claude/b4/dist rebuilt):
  clip.mjs 8 structures x seeds 3,5 x 120 s, ticks > 2 cm inside / deepest: snout 18841/0.76 -> 9/0.40, skull 12029/0.87 -> 4/0.39,
  jaw 5549/0.59 -> 9/0.27, neck 1755/0.60 -> 625/0.24 (torso/tail/feet unchanged: stage 3/4; the Culvert torso 14400/1.00 in both
  is the measure counting the ground mound over the pipe, not checked further).
  probe.mjs (24 runs, 150 s), pre-item-4 -> stage 2: head in 6/36 s -> 14/87 s; eye at an opening 71/943 -> 78/673; snout in
  96/632 -> 83/462 (part of the old "snout in" was through the planks; Loft eye 198 -> 119 s, snout 133 -> 71 s).
  Chest twist filter settled at 0.32 s: orbit aim p50 10 / p90 24 (was 11/26), chest reversals 24 -> 16 / 25 s.
  Light head contact (< 3 cm slide a tick) is not counted as a press (the mind's _hemmed reads headPress > 0.3 as stuck).
  REGRESSION OPEN: saltline.mjs hard failures: noise/3 stall 43 s (pre-item-4 7 s), crouch/3 8 s now (was 22-33 s in earlier
  stage-2 versions). Cause: the head now meets container corners on search routes -> mind backs off (drive) -> long slow
  reverse / stuck rule cycling (no head contact during the stall itself). With _headFinal off: no failures. Not fixed.
  Also runner/3 "crash": mind.js:1920 reads a.x with know.target null (display case) - mind side, reached via this path.
  review.mjs: sprint 12 into a wall: head stops at the wall, neck folds (head gap 1.72 m, neck bend 0.94, skull-neck 1.30) where
  before it went through: needs stage 3 (body crash). Mind already reads sim.headTouch {kn, part} (mind.js:765).
- SALTLINE STALL WORK (stage 2b, rex.js snapshot out/skel/body4/rex_stage2b.js). Per-seed results are chaotic (a spawn with the head in
  a container differs from tick 0), so judged on 8 seeds x crouch/noise/quiet/shed (SALTSEEDS env added to test/saltline.mjs;
  STALLDBG / STALLFINE / CRASHDBG debug prints too). Stalls > 20 s / mean longest stall:
  pre-item-4 9/32, 17.3 s | stage 2 as reported 19/32 | final pass draw-only 12/32, 17.8 | + reverse rule 13/32, 17.0 |
  + tuck removed 9/32, 14.3 s (salt8_v4.txt).
  Findings: (1) moving the dynamic head out in _headFinal took away the head's own press on the wall, which is what steered the
  body off containers: _headFinal now only puts the DRAWN head right and raises the contact event (no headDyn shift, no velocity
  change, no headPushV/headPress). (2) A "tuck" (head drawn back while travelling in contact) made crouch stalls worse (mean 24.8
  vs 18.4 without): removed. (3) Kept: head jam only counts while travelling if the hips stop advancing against it for 0.8 s
  (headBlockT); asked to reverse with hips not moving for 1 s, the body turns on the spot away from the side its tail presses
  (`_bk`), instead of pushing its rump into the container. (4) The remaining stalls (e.g. noise/3 28 s, pre-item-4 7 s on that
  seed) are the mind's move <-> back-off cycle (~1.5 s period, the body's speed lagging a second behind each flip): see Needs.
- reverse-turn rule removed too (8 seeds without it: 7/32 stalls, mean 12.3 s; with it 9/32, 14.3). Final stage 2c = rex_stage2c.js; chain suite7.sh -> s7_*.txt
- neck joints added to _headFinal (4 iterations, eased into neighbours): clip neck 2482/0.63 -> 1284/0.03 (ticks >2 cm / deepest m); snout 5/0.03, skull 0, jaw 0. Snapshot rex_stage2d.js; chain suite8.sh -> s8_*.txt; 8-seed saltline -> salt8_v5.txt
- STAGE 2d VERIFIED (08:45; rex.js = out/skel/body4/rex_stage2d.js, current mind files as of 08:26):
  saltline.mjs standard: no hard failures (noise/3 stall 7 s, crouch/3 15 s). 8 seeds x crouch/noise/quiet/shed: 4/32 stalls > 20 s,
  mean 11.6 s (pre-item-4 9/32, 17.3 s) (salt8_v5.txt; run on the 08:2x mind).
  clip.mjs ticks > 2 cm / deepest: snout 5/0.03, skull 0/0.01, jaw 0/0.00, neck 1284/0.03 (before item 4: 18841/0.76, 12029/0.87,
  5549/0.59, 1755/0.60). probe.mjs (24 runs): head in 11/60 s, eye at an opening 83/787 s, snout in 71/520 s (pre-item-4 6/36,
  71/943, 96/632; Loft eye 148 s / snout 118 s, pre 198/133). stuckopen ok; review exit 0; review mind exit 0; platform all pass;
  fidget 56/10.
  In game (loft_cam_2d.png / loft_out_2d.png, rebuilt dist): this run it stood in 'shove' with its snout against the planks just
  beside the doorway (the snout tip shows at the jamb from inside); no part through the wall; it did not get the head into the
  doorway in that 4 s window (the stage-2 build earlier did: loft_cam_final.png).
- (09:xx) NEXT per coordinator: stage 3 torso/hips crash; strike reach/timing regression (hideout.mjs, peril.mjs); Loft doorway aim; stage 4 tail. main.js now routes 'contact' events to audio.contact + fx.kick (keep event shape).
- STRIKE (item 2 of the coordinator's 4th list). test/striketime.mjs (peril.mjs' timing block alone, plus a person N m aside: arg).
  first motion -> contact at 3/4/5/6 m: pre-session 317/283/233/208 ms; pre-item-4 517/408/358/292; stage 2d 683/467/417/333;
  2 m aside stage 2d: miss/miss/miss (pre-session 417/300/242). Causes: the neck's smoothness weight (WT 3) and lateral low-pass /
  range made the drawn head (where the arena tests the bite) lag the head 0.16-0.26 m; and the head could not turn past 0.96 rad off
  the chest, the body did not turn with the strike. FIX (strike/seize/snap/butt etc., STRIKES acts only): neck fit WT 0.4, trust
  region 0.12, no lateral low-pass, lateral range x1.5 (still one C), skull on atlas x1.4, head yaw limit x1.45; and in the strike
  window the body wrenches toward the target (psi up to 2.6 rad/s, chest twist impulse). After: 400/292/242/233 ms; 2 m aside
  742/375/392; 3 m aside 800/442/342; rush from 7/9 m 875/1383 ms. hideout.mjs (Loft, 6 seeds, stay 90) running: hideout_{pre,pre4,cur}.txt.
- STAGE 3 (rex.js snapshot rex_stage3a.js): `arousal` (step: burst -> 1, else max(sstep(5,9,pace), agitation), 0.4 s ease); _avoid
  clearance o.r + lerp(2.4, 1.1, arousal) (worked up it cuts closer); `_crash(vin, n)` called from _bodyCollide with the closing
  speed into the push-out normal: above 1.0 m/s (0.45 s apart): lean (pRoll toward the surface, sway, chest thrown back if
  head-on, dip), thrown back off it (u += 0.12 k n), stagger (lungeReq: a foot goes at once), lost speed (vT capped at
  lerp(0.15,1,u^2) x its speed for 0.5+0.1k s, k = min(vin,8)), event {type:'contact', part: torso|hips (part that pushed most),
  surface, force, x,y,z, nx,ny,nz}. Tests: out/skel/body4/crash.mjs (review's sprint-12 drive into a wall: snout/wall 10.08 then
  torso/wall 10.76 m/s at 10.4 s, v 10.9 -> 0.4 in 0.45 s); test/corner.mjs (chase round the Containers' NE corner: torso/wall 1.89
  m/s, no volume inside; calm run never reaches - its waypoint is inside the corner, a test artefact). Chain suite9.sh -> s9_*.
- STRIKE on a man walking past (test/strikepass.mjs: 1.6 m/s across in front, lines 1.4/2/3 m off the head's line x 2.5/4 m ahead
  x both ways, strike fired at where he is): pre-session 12/12, pre-item-4 10/12, stage 2d 10/12 (both misses at 1.4 m off, 2.5 m
  ahead: he is under its chin). Strike lateral range raised to x2 and head yaw limit x1.75 in strikes: 11/12. The last miss (R->L,
  1.4 m off, 2.5 m ahead): the head is right over him pitched at its -1.05 rad limit, jaws 0.88 m off (hit at 0.8): not chased.
  A tighter neck fold in strikes did not help: reverted. hideout.mjs Loft (6 seeds, stay 90): caught on leaving pre-session 0/6,
  pre-item-4 2/6, now 1/6 (noisy; the exits are rare events).
- Loft doorway (item 3): tried a probe 'slide along the obstacle to a clear line' (intent.probe only): probe.mjs Loft/Barn numbers identical with and without (it never engaged: the besiege head work goes through intent.sense / the mind's shove targets). Removed. The in-game 'snout on the planks beside the door' was the mind's shove aimed at the man through the wall; Loft eye-at-opening 148 s / snout-in 118 s per 3x150 s. Not fixed.
- stage 3b snapshot rex_stage3b.js (stage 3 + strike); chain suite10.sh -> s10_*.txt
- STAGE 3b VERIFIED (09:25; rex_stage3b.js = src/sim/rex.js): saltline standard no hard failures; 8 seeds 4/32 stalls > 20 s,
  mean 11.0 s (pre-item-4 9/32, 17.3); stuckopen ok; platform all pass; review exit 0 (sprint 12: head gap 0.80 for 42 ticks at
  the wall, was 1.72); review mind exit 0 (no fidget, no slide); clip snout 5/0.03 skull 0 jaw 0 neck 1238/0.03; gaze beyond-neck
  1.17%, > 60 deg 3.8%; strike 367/292/242/233 ms; strikepass 11/12; corner chase torso/wall 1.89 m/s, nothing inside; fidget 61/10.
  In game (/home/claude/b4/img/stage3.png): mind off, a 7.7 m/s run at the Containers: crash at the corner (v 7.5 -> 1.3 -> 0.1 in
  0.2 s), body stopped against the container face, head thrown up, tail up; nothing through it. Strike at the player 3 m ahead /
  2 m aside from his camera: jaws on the camera at 0.1 s, struck at 0.2 s (killed, red screen).
- NOT DONE: stage 4 (tail contact + slap); Loft doorway aim (above).
- STAGE 3c (rex_stage3c.js): crash reshaped to read as mass. Head-on: trunk surges on (balF +0.45k), pitches forward (pPitch -0.16k),
  chest dips, head flung on; hips swing on round (yawKick, half-sine 0.5 s, the way it was turning else off the struck side);
  recoil 0.05k(0.4+frontal) off the normal; the stagger step 0.1-0.18 s later (stagT -> lungeReq). Glancing: roll and sway into
  the surface (+0.12k toward), and while sliding along it > 1.2 m/s: roll held toward it (2.2 rad/s^2 x share) and 2.5 m/s^2 rub;
  recovery cap eased (smoothstep), a glancing blow costs less (floor 0.15 + 0.45 x tangential share).
  Signs measured (/tmp/rollsign.mjs): pRoll +/sway + toward +l; pPitch - chest forward/down; balF + trunk forward.
  Worked-up caution for walls/containers: walls ARE in terrain.obstacles (so _avoid's arousal clearance applies: now
  o.r + lerp(2.4, 0.3, arousal)); and the route: _steer, aroused and > 3-6 m/s, steers at the far look point (6 + (2.2+0.8a) v
  along the route) blended by arousal, if the straight line to it keeps the spine >= -0.05 m off solids (_grazeLine: the trunk
  grazes, never rams the face: a looser line rammed the east face early and lost 3 s); route shortcut tolerance 1.6 + 3a.
  test/corner.mjs fixed (one goal, a man at (-46,77) beyond the corner): chase clips the NE corner, torso/wall 3.42 m/s, reached
  8.5 s (no clip version 9.2 s: the shorter line pays for the knock); calm 1.7 m clear, 18.3 s.
  Oblique trace: v 8.3 -> 7.2 at the knock, slides on along the face shedding to 5.5 m/s over 0.5 s, roll -0.15 rad (toward the
  container), hips toward it. Head-on (sprint 12): v 11.2 -> 0 over 0.55 s, trunk surge balF 0.38, pitch forward to -0.21 then
  back to +0.04 (recoil), hips swing psi +0.2 rad, stagger step at 10.82 s, then backs off.
- STAGE 3d (rex_stage3d.js; after 3c): corner cutting for chases tried (steer at the far look point when the straight line keeps
  the spine >= m off solids; m swept 0.55 .. -0.1): only at m <= -0.05 does the chase clip the NE corner (torso/wall 3.42, reached
  8.5 s); but it gave Saltline runner/3 a hard failure (chest 0.47 m in a box, standing, in lurk: the Saltline adapter's pushOut
  uses circle samples, so a chest past the ring is pushed further in). Removed (with _grazeLine, chaseK); also reverted the
  arousal lookahead terms. Kept: aroused _avoid clearance o.r + lerp(2.4, 0.3) (walls are in obstacles) and route shortcut tol
  1.6 + 3a. corner.mjs chase now passes 1.6-2.3 m clear (the nav planner's room keeps it off): NOT clipping.
  The slide rub (2.5 m/s^2 + lean) ran in every contact and made Saltline crouch/3 stall 24 s: now only within a crash's recovery.
  Lean: a roll TARGET offset `wallLean` (pRoll's spring target; impulses on pRoll.v were eaten by the spring): crash 0.035k*toward
  (+0.08 if toward > 0.3), up to 0.22 rad; held while sliding (0.16 x toward x min(1, v/4)); eases in 0.12 s, out 0.45 s, decays 0.25 s.
  Oblique test (/tmp/obl.mjs, run along the Containers' east face at 1.8 m in 20 m): torso/wall 1.64 at 8.1 m/s, slides on at
  7.4-7.8, roll to -0.13 rad toward the face over 0.3 s and back over 0.5 s. No RNG in _crash (side by time parity).
  Saltline crouch/runner/noise: no hard failures (crouch/3 15 s, noise/3 7 s). Chain suite12.sh -> s12_*.
- STATE (11:30): src/sim/rex.js == out/skel/body4/rex_stage3d.js (uncommitted vs live rex_stage3b.js): crash reshape (overshoot
  balF/pPitch/head fling, hips yawKick, recoil, delayed stagger stagT, wallLean roll target, rub only during a crash's recovery,
  eased cap with glancing floor), arousal avoid clearance o.r + lerp(2.4, 0.3), route shortcut tol 1.6 + 3a. crashS keeps
  {t, dur, cool, from, tan} (the mind reads t and dur).
- STAGE 3d VERIFIED (chain s12_*, mind files as of ~10:3x): saltline standard no hard failures; 8 seeds 1/32 stalls > 20 s, mean
  9.8 s, no body-in-box; stuckopen ok; platform all pass; review exit 0 (sprint 12: skull folded onto chest 1 tick, head gap
  0.74 x 25 ticks, neck bend > 35 deg 57 ticks at the wall); review mind exit 0; clip snout/skull/jaw 0, neck 346/0.03; strike
  367/292/242/233 ms, strikepass 11/12; gaze 1.23% / 3.9%; fidget 59/9; probe ALL head 9/42 s, eye 67/701, snout 64/440 (the
  mind's new opening aim changed during the chain: not comparable).
  In game, player's camera (/home/claude/b4/img/crash_oblique.png, crash_headon.png; 0.1 s apart from the knock):
  oblique (run along the east face at 8.8 m/s, glancing): it slides on along the container, 8.8 -> 6.3 m/s over 0.4 s, trunk and
  hip against the face, legs scrabbling, dust; the lean (0.13 rad) is hard to see from behind. Head-on (7.7 m/s at the face): the
  head and neck fold down and round against the container as the trunk carries on, then it recoils (v -0.6 at 0.2 s).
- STAGE 3e (rex_stage3e.js, terrain_stage3e.js, saltworld_stage3e.js; coordinator allowed editing src/terrain.js and
  test/worlds/saltworld.js): both pushOut take `home` ({x,z}, where the body comes from; rex passes last tick's hips): a box
  (Saltline's c.box) is left by its face on the home side (exits away from home cost +50), a wall run's (c.seg) push is taken
  on home's side of the line when the point is past its middle, a post is left on home's side. Other callers (player, herd) pass
  no home: unchanged. Corner cutting restored (chaseK from burst/pace > 5.5-9, steer at the far look point if the line keeps the
  spine >= -0.05 m off solids). Saltline runner/crouch/noise: no hard failures, runner/3 no body in box.
  corner.mjs: chase clips the NE corner (torso/wall 2.1 m/s at 4.0 s), reached 9.2 s; cautious (no cut) 9.3 s; a cut kept 0.35 m
  off 9.6 s; calm 1.7 m clear, 18.3 s. The turn itself dominates the time (it slows to ~3 m/s round the bend whatever the line);
  the knock costs little on this line, not a second.
  Knocking at a run: speed loss 0.4 x sstep(1,3,k) x sstep(4,8,v) x tangential share at once; recovery 0.5 + 0.1k + 0.07v s,
  floor 0.35 x tangential share.
  Head-on (item 2, rubber neck): a hard head knock (> 2.5 m/s closing) is a knock of the whole body: _crash(part head), body speed
  cut to <= 8% at once, legs brace (v -9 m/s^2 for 0.45 s after a frontal crash), recovery cap from 0 for frontal hits; the skull
  bounces (velocity into the wall reflected x0.3, up 0.18k, pitch up). /tmp/fold.mjs (sprint 12): min head-chest 1.18 -> 1.46 m,
  under 1.6 m for 0.77 -> 0.31 s, max neck joint bend 0.72 -> 0.51 rad; review 'sprint 12' now clean (no skull folded, no head
  gap, no neck bend flags). Chain suite13.sh -> s13_*; in game crash3.log -> crash_oblique.png (now the corner chase), crash_headon.png.
- STAGE 3f/3g (13:xx). Home-side push-out in the worlds proved fragile: pushing the trunk toward last tick's hips, Saltline still
  left a chest in a box in other seeds (shed/2 under an overhang, runner/2 feeding, crouch/8 at spawn by a box corner), each
  passing with either the new adapter or the new rex alone but not both (a ring of 0.6 m posts standing for a box pushes a chest
  that is level with a post ALONG the face). What holds instead, in rex.js `_bodyCollide`: a world-agnostic guard: if the chest
  (r 0.8) overlaps a solid thing the hips are clear of, the body is drawn back along hips -> chest to where the chest clears
  (6 halvings of an overlap test with the world's own pushOut), <= 0.08 m a tick. rex no longer passes `home` to pushOut (the
  `home` parameter stays in src/terrain.js and test/worlds/saltworld.js, used by nobody now; Saltline's box mode is disabled with
  `false &&`). _cSample's home flip back to wall runs only (posts too made the spawn case worse).
  Saltline 8 seeds x crouch/noise/quiet/shed/runner (40 runs, s16_salt8.txt): no body in box; stalls > 20 s 3/40 (crouch/2 24,
  crouch/4 25, noise/8 38), mean 9.4 s. corner.mjs: chase clips the NE corner (torso/wall 3.79 m/s), reached 8.8 s (cautious, no
  cut: 9.3 s), calm 1.7 m clear. Head-on fold (/tmp/fold.mjs): min head-chest 1.49 m, under 1.6 m 0.28 s, neck bend max 0.50;
  review sprint 12 clean. Snapshots rex/saltworld/terrain_stage3g.js; chain suite17.sh -> s17_*; in game crash4.log.
- (12:45, after restart) UNCOMMITTED vs live (rex_stage3d.js): src/sim/rex.js = rex_stage3g.js: chaseK + corner-cutting steering
  (_grazeLine), crash speed loss at a run, frontal brace and recovery from 0, head knock = body crash (part head, speed cut),
  skull bounce instead of fling, chest-inside guard in _bodyCollide, _cSample home flip for wall runs only (as live). The home
  push-out edits in src/terrain.js and test/worlds/saltworld.js were unused by rex now: both REVERTED to live/pre-edit copies.
- STAGE 3g VERIFIED (13:20; src/sim/rex.js == rex_stage3g.js; src/terrain.js and test/worlds/saltworld.js back to live):
  saltline standard no hard failures; 8 seeds x 5 scenarios (40 runs, s18_salt8): no body in box, stalls > 20 s 3/40 (crouch/2 24,
  crouch/4 25, noise/8 38), mean 9.4 s; stuckopen ok; platform all pass; review exit 0 (sprint 12 clean); review mind exit 0; clip
  snout/skull/jaw 0, neck 346/0.03; strike 367/292/242/233 ms, strikepass 11/12; gaze 1.17% / 5.3% (> 60 deg, was 3.9-4.9);
  fidget 53/7; corner chase clips (torso/wall 3.79) reached 8.8 s vs cautious 9.3 s, calm 1.7 m clear.
  In game (crash_oblique.png = corner chase, crash_headon.png): the chase sweeps round the NE corner with the trunk and hip against
  the corner, legs scrabbling, dust; head-on: the head stops and is held up, no curl, the body brakes and recoils.
- NOT DONE: under-chin strike miss (11/12), stage 4 tail contact + slap.
- (13:3x) NEXT: make the corner knock cost ~1 s vs the no-contact line (coordinator); then under-chin strike, tail, gaze >60 deg rise.
- STAGE 3h (rex_stage3h.js): the corner knock costs: hard = sstep(1,3,k) x sstep(3,7,v); speed loss 0.65 x hard x max(tan, 0.5)
  at once; recovery + 0.5 hard s (to 2.0), floor 0.35 tan (1 - 0.6 hard); glancing: hips swing wide off it (yawKick away from
  the surface, peak 0.9 hard tan rad/s half-sine 0.5 s, plus a 0.4 hard push off). A light brush (k ~1.5) gets hard ~0.16.
  corner.mjs: chase cutting + clip 10.1 s (torso/wall 3.79) vs the no-contact line 9.3 s (+0.8 s); before this 8.8 s (the clip
  was a gain of 0.5 s). Calm unchanged (1.7 m clear, 18.3 s). Added to corner.mjs: a man running up the east side and round the NE
  corner, the rex chasing from 13 m: fell back 5.0 m (0.81 s of his running) with cutting/clip vs 6.5 m without cutting, but the
  no-cut run also struck the container's side early (torso 3.76 at 2.8 s): this measure is not clean; the static-target one is.
- STAGE 3h VERIFIED (14:10): saltline standard no hard failures; 8 seeds x 5 scenarios no body in box, stalls > 20 s 3/40 (same
  three as 3g), mean 9.2 s; stuckopen ok; review sprint 12 clean. In game (crash_oblique.png, 6 frames 0.2 s apart over 1 s from
  the knock, player's camera at (-18.5,79.5)): it clips the NE corner at 8.1 m/s and is carried on north past it, body and tail
  swinging wide, speed 8.1 -> 5.0 over 1 s, instead of turning in tight: it has to come round again.
- (14:2x) NEXT: (A) crash tests in the debug drawer + #crash= hash (main.js, ui.js, dist/index.html allowed); (B) yielding obstacles / squeeze.
- (A) CRASH TESTS DONE (15:0x): src/main.js (CRASH table, crashTest, crashTick in frame, buttons cHead/cGlance/cCorner/cAgain,
  #crash=headon|glancing|corner 3 s after start) + dist/index.html ("Crash tests" group after Body tests; title kept). Mind off
  and a scripted run (drive or approach at 9-9.5 m/s) at the Containers; player placed side-on 10-15 m off facing the impact; mind
  back on after 6.5-7.5 s (~3 s after the knock). Verified in the real page: phone portrait 390x780 touch (menu -> group -> tap
  Head-on: knock at 3.0 s at 7.7 m/s; crashui_drawer.png, crashui_phone.png), desktop buttons Glancing / Corner chase / Again
  (each knocks at ~4-4.8 s), #crash=corner from the hash (placed after start, knock at ~4.5 s, mind back at 7.5 s). Rex nearest
  the player after the knock ~10 m (glancing).
- (15:1x) (B) started: bamboo / yielding obstacles / squeeze.
- (director, 15:20) The agent was cut off by the account's WEEKLY usage limit (Opus; resets Nov 20 14:00 UTC) just after starting (B). Its partial, UNVERIFIED (B) edits are in src/sim/rex.js and src/terrain.js, saved as out/skel/body4/wipB/rex_wipB.js and terrain_wipB.js. Live is rex_rc = rex_stage3h.js with the unmodified terrain.js. Whoever continues: review the wipB diffs against rex_stage3h.js and rex_rc/src/terrain.js first; nothing in them has been run.
