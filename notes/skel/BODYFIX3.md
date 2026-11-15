# BODYFIX3 — motion-engine pass (gaze, tail vs solids, siege walls, neck shape)

Started 2026-11-14 14:20 UTC. Time box 2.5 h (until ~16:50).

## Status log
- 14:20 created notes; reading docs; baseline runs next (out/skel/bodyfix3_before/).
- 14:4x baseline running (script out/skel/bodyfix3_run.sh). review exit 0; review mind exit 0; gaze: beyond-neck 2.72% (all >60: 8.2%; fresh mind.js, not 3.22); saltline EXIT 0 on the fresh mind (crouch/3 body clip 0; distal tail worst 0.62 m in crouch/3; opening stalls 2-7 s, no 20 s stand-still). The crouch/3 failure no longer reproduces with the current mind.js: the tail item is worked anyway (tail vs solids base to tip), judged on siege tail-in-wall and saltline tail worst.
- Probes: out/skel/bodyfix3/neckpitch.mjs (neck segment pitches), out/skel/bodyfix3/gazediag.mjs (gaze.mjs plus a dump of every beyond-neck tick).
- 15:0x item 1 (gaze). Same-mind reference (pre-BODYFIX2 rex.js in /tmp/rexA + current mind): beyond-neck 2.57% vs 2.72% now, so under the current mind the feet change adds only ~0.15 pt; the rest is head/attention behaviour. Standing turn probe (out/skel/bodyfix3/turn.mjs): identical in both trees (first step 1.09 s after a face/look command, 45 deg at 2.25 s). Edits (rex.js): turn from rest starts with a step of the turn-side foot (need +1.05 when |omT|>0.3), big standing turns up to 0.7 rad/s (was 0.5), head turns fast (to 2.5 rad/s) when what it watches is far off its line, an orient under a locked look is a 0.5 s glance, idle sniffs never start/continue while it watches someone, idle scan glances stay near the watched person. Gaze: 2.72 -> 1.15%. Tried "head side follows body turn" for subjects behind: 1.27%, reverted. Saved out/skel/bodyfix3/rex_gaze_v3.js.
- 15:09 item 1 continued. Found and fixed in rex.js: (a) a turn-start bonus that kept stepping the same foot (foot twist 120 ticks in "targets all around"): the +1.05 goes only to a foot that did not step last; (b) stalk pause held the next step while the hips slid 1.08 m over two planted feet (mind seed 3): the pause gives way once double support is spent; (c) stalk swing T*1.3 plus mid-swing hover = 0.87 s off the ground (item 5): T*1.2, hover 0.3 -> ~0.75 s; (d) _sided (which side the head goes round for a subject behind): raw bearing returned between 1.9-2.2 rad while the choice was kept (head swung back and forth across the front); the side was chosen from where the head happened to be even for a subject clearly on the other side; and never revisited while the body turned the subject round on the other side. Now: true side unless straight behind (>2.6 rad), switched when the subject is well round on the other side (<2.4) or the body is turning toward it. Big-turn rate kept at 0.6 rad/s (0.7 not needed). gaze beyond-neck 2.72 -> 1.17% (chaotic: single episodes move it +-0.3). Saved out/skel/bodyfix3/rex_gaze_final.js. Next: neck (item 4).
- 15:14 item 4 (neck) v1 in rex.js (saved out/skel/bodyfix3/rex_neck_v1.js): NK constants block. Found: in-plane the neck fit has 3 shape parameters (root rise, bend, bend slope) for 3 end conditions (head position 2 + entry line 1), so the shape is set by the head target and the entry tip; with the head 0.8-1.0 m above a 1.75 m neck's root and a 0.94 L straightness cap the middle must bend past 45 deg. Changes: head pivot target forward 1.55 / up 0.55 from the chest joint (was 1.18 / 0.72), alert +0.3 up -0.15 fwd (was +0.38/-0.1), stalk -0.75 up (was -1.0 up +0.3 fwd); root rise shared over joints 19-23 (NECK_SPREAD, sim only; the skin bind keeps NECK_ROOT); entry tip 0.24 -> 0.08 (stalk -0.17: the neck comes down into a low head); stalking the root's preferred rise is taken out (REST[0]); straightness cap 0.94 -> 0.955 L, reach 0.965 -> 0.97 L. Pitches (neckpitch.mjs, gaze straight ahead) in out/skel/bodyfix3/neck_before.txt / neck_after.txt.
- 15:30 neck v2 + siege (item 3). Head-in-wall cause found: with the head carried further out, the fast watch turn (2.5 rad/s) outran the neck fit: neck end (where the skull is drawn) lagged the cleared head by up to 0.35 m, inside the wall (containers: neck gap >0.2 m 66 ticks vs 2 on the original). Watch turn now 2.0 rad/s (acc 7): gap >0.2 m 0. Root yaw back on NECK_ROOT's three joints (only the rise is spread over five: spreading the turn too made sideways reach lag). Neck trust region widens to 0.08 rad when the neck lags the head (>0.08 m). Reach caps str 0.94 L (as before), mx 0.955 L. Tried and reverted: head drawn in when turned aside (gap worse). Siege seed 3 now: tower 17, barn 0, warehouse 39, containers 136, ruins 0, gatehouse 0, culvert 0, novel-slot 108, novel-under 0 (before this pass 293/7/93/68/0/15/264/230/0; original rex.js + same mind 68/895/41/197/0/0/0/125/0). Saved rex_v3.js.
- 15:34 item 2 (tail). With the current tree crouch/3 reproduced the failure (tail4/5 0.39 m inside the 7.8 m box at 40 s, search). Cause: in _tail, a segment whose clearing would take it past 2.2x its joint range was not moved at all, so a tail root swung into a wall stayed in it. Now it curls up to 2.6x its range and a clearing beyond that goes as far as the range allows (base to tip, 3.5 cm/tick, no velocity carried). saltline exit 0 (crouch/3 body clip 0; distal tail worst 1.02 m in one 3-sample transient at 33 s, opening/5 0.64). Saved rex_v4.js.
- 15:47 orient glance under a locked look 0.35 s (gaze 1.49 -> 1.31%); running head lower (huR -0.4: burst "hips < 2.2 m" 89 -> 0 ticks in bodyfix2/start.mjs). Start-up times unchanged (out/skel/bodyfix3/start_before.txt / start_after.txt: first lift 0.24 s, 2 m/s walk 1.52 / run 0.98 / burst 0.65 / sprint 0.93 s, identical). Note: "run 8 + interrupt" foot twist 1.08 rad (one foot stepping twice while the other twists) is the same on the original rex.js (twist2.mjs trace), not from this pass. Final rex.js saved as out/skel/bodyfix3/rex_final.js. Starting final runs (bodyfix3_after/).

---------------------------------------------------------------------------------------------------------------------------
# Deliverable

All numbers: before = `out/skel/bodyfix3_before/` (tree as found 14:20, current mind.js), after = `out/skel/bodyfix3_after/`.
Same-mind reference = pre-BODYFIX2 rex.js (/tmp/bf2_src_orig) with today's mind.js (/tmp/rexA), used to tell the feet change
from the mind change. The sim is chaotic: one changed tick re-routes whole encounters, so single-run numbers move by
episodes (gaze +-0.3 pt, siege tens to hundreds of ticks per structure).

## 1. Gaze (beyond the neck's reach)
- Cause. Under the current mind the feet change was only a small part: same-mind original rex.js 2.57%, tree as found 2.72%.
  The rest was the body: (a) a turn from rest waited ~1.1 s (twisting over two planted feet until the yaw error forced a
  step; turn.mjs: 45 deg at 2.25 s); (b) `_sided`, which picks the side the head goes round for a subject behind, returned
  the raw bearing between 1.9 and 2.2 rad while keeping its choice (head swung back and forth across the front), picked the
  side from wherever the head happened to be (or from another caller's face goal at a different target), and never revisited
  it while the subject came round on the other side: the head sat at its limit on the wrong side for seconds; (c) the head came
  back from a glance or a blow at the idle 1.25 rad/s; (d) idle sniffs and scan glances took the head off the person it
  was watching; (e) an orient jerk under a locked look held 1.1 s and was re-triggered by attend.js for the same place every
  0.5 s.
- Fix (rex.js): turn from rest starts with a step of the turn-side foot (then the feet alternate); big standing turns 0.6 rad/s
  (was 0.5); `_sided` hysteresis fixed, true side unless nearly straight behind (>2.9 rad), switch when the subject is well
  round (<2.75) or the body is turning toward it; quick head turn (to 2.0 rad/s) toward a watched subject far off the skull's
  line; orient under a lock is a 0.35 s glance and the same place is not re-oriented to while still oriented; no idle
  sniffing while watching someone; idle scan glances stay within ~35 deg of a watched person.
- Numbers (gaze.mjs 3 5 8): beyond-neck 2.72% -> 1.36%; gaze > 60 deg 8.2% -> 4.2%; unreported episodes > 1.5 s 11 -> 4.
  turn.mjs (face 100 deg): first step 1.09 -> 0.24 s, 45 deg 2.25 -> 1.77 s, head within 20 deg 2.66 -> 1.76 s.
- Not done: the mind's "looking at" (mind.js voice.look) is read off the actual head, so it does not over-claim; but see
  "For the mind" below (orients from attend.js are not reported as 'sound').

## 2. Tail against solids / Saltline
- Before: saltline exit 0 on the fresh mind (crouch/3 failure did not occur; the 30 s opening stand-still did not occur:
  stalls 2-8 s). Mid-pass, with the gaze changes, crouch/3 failed again exactly as described (tail4/5 0.39 m inside the 7.8 m
  box during search, x13).
- Cause: in `_tail` a segment whose clearing would take it past 2.2x its joint range was not moved at all, so a tail root
  swung into a wall stayed there.
- Fix: against something a joint may curl to 2.6x its free range, and a clearing beyond that goes as far as the range allows
  (base to tip, at most 3.5 cm a tick, no velocity carried: no pops, the body not moved).
- After: saltline exit 0 (all 15 runs: body clip 0). Distal tail worst: before max 0.62 (crouch/3), after 1.02 (crouch/3,
  one 3-sample transient), 0.87 opening/3, else <= 0.64 (the earlier 1.21 m is not reached). Not done: the standing/turning
  check that keeps the tail base's room (the turn brake on tail contact and the root push exist; no planner-level check added).

## 3. Siege body-in-wall (seed 3, 90 s)
| structure | before (as found) | same-mind original | brief's earlier | after |
|---|---|---|---|---|
| tower (x2) | 293 | 68 | 89 | 17 |
| barn | 7 | 895 | 895 | 0 |
| warehouse | 93 | 41 | 10 | 39 |
| containers | 68 | 197 | 93 | 136 |
| ruins | 0 | 0 | - | 0 |
| gatehouse | 15 | 0 | 0 | 0 |
| culvert | 264 | 0 | 0 | 0 |
| novel-slot | 230 | 125 | 125 | 108 |
| novel-under | 0 | 0 | - | 0 |
- Cause found for head ticks after the neck change: the skull is drawn at the neck's end, and with the head carried further
  out a fast head turn outran the neck fit (gap up to 0.35 m, inside the wall: containers gap > 0.2 m 66 ticks vs 2). Fixed by
  the 2.0 rad/s cap on the watch turn, the root's yaw back on three joints, and a wider trust region when the neck lags.
  Neck/skull limit ticks (siege, all) 6001 -> 2374.
- NOT met against the brief's earlier numbers: warehouse 39 > 10 and containers 136 > 93 (both at or below the same-mind
  original). The causes of the four rises named in the brief were not isolated one by one (the gaze/neck changes re-routed
  every encounter); what remains is head-only, 0.06-0.13 m, in besiege shift/shove/snort and watch.
- chest-to-head max 1.71-1.73 -> 1.73-1.75 m (the head is carried forward at ~0.95 of the neck): over the README's 1.7.

## 4. Neck shape
- Cause: the fit has three in-plane shape parameters (root rise, bend, bend slope) for three end conditions (head position,
  entry line), so the shape is set by the head target. A head 0.8-1.2 m above the chest joint, 1.1-1.4 m forward (chord
  ~0.8 of the neck), the root's 44 deg rest rise on three joints and a 0.24 rad entry tip force the hump.
- Fix (`NK` block in rex.js): head pivot target 1.55 m forward / 0.55 m up from the chest joint standing (was 1.18 / 0.72),
  running -0.4 up +0.08 fwd, alert +0.3 up -0.15 fwd, stalk -0.75 up; root rise shared over joints 19-23 (NECK_SPREAD, sim
  only; root yaw and the skin's bind keep NECK_ROOT); entry tip 0.08 rad (stalk -0.17: the neck comes down into a low head);
  stalking the root's preferred rise is removed (REST[0]).
- Segment pitches, joints 19-25 (deg; neckpitch.mjs, gaze straight ahead), before -> after:
  - stand: 19 41 53 51 43 29 8 -> 19 28 32 30 23 11 -4 (max 53 -> 32; pivot 0.97 -> 0.58 m above j18, 1.38 -> 1.61 fwd)
  - alert: 27 54 69 67 56 37 10 -> 20 38 48 49 41 24 1 (max 69 -> 49)
  - walk: 27 43 50 42 31 17 0 -> 19 25 27 24 16 4 -9 (max 50 -> 27)
  - stalk (walking, 6 s): 9 -10 -22 -29 -25 -11 14 -> 10 1 -6 -12 -15 -17 -14 (pivot -0.30 -> -0.22 m; nose-up hook 25 -> 3 deg)
  - stalk standing: 9 -12 -25 -31 -27 -11 15 -> 12 -4 -15 -21 -23 -20 -9 (pivot -0.35 -> -0.34 m)
  - jog: 28 41 45 36 25 13 1 -> 19 23 25 22 15 4 -7
- Review "neck joint bend > 35 deg" ticks (review mind, all scenarios): 1699 -> 165. Score neck_skull_violation_ticks
  1317 (BODYFIX2) -> 309.
- Reach/standing distances: the snout is ~0.25 m further forward at rest; the species' standing distances were not changed.
  Alert misses its target slightly (49 deg vs ~45).

## 5.
- Scripted stalk 0.87 s step: stalk swing time x1.2 (was x1.3), mid-swing slowing 0.3 (was 0.35): ~0.75 s; review "foot
  hanging while still" 16 ticks -> 0. Also fixed a stalk pause that held the next step while the hips slid 1.08 m over two
  planted feet (mind seed 3): the pause ends once double support is spent.
- Knee bending backward in mind seed 7: not looked at (no such line in today's review output).

## Must-holds
- saltline exit 0, platform exit 0; review "hips slide with no step" 0 (scripted and mind), "foot hanging while still" 0;
  navsoak 35/35 arrived (stuck 5.9 -> 5.6 s); first step 0.24 s and 2 m/s times identical (start_before/after.txt).

## For the mind (not changed here; mind files are being reworked elsewhere)
- attend.js:109 calls `sim.gesture('orient', p)` without setting `mind.orientTo`, so the head jerked to a sound is reported as
  'around' (gaze.mjs counts it as an unreported miss); it also re-fires every 0.5 s for the same place during a charge (the
  body now refuses a repeat while still oriented to it, but the report is the mind's).
- In stones runs `pause` sets a face goal at one thing (the stones) and a locked look at you ~120-150 deg behind, alternating
  with strike approaches: the body cannot both face one and watch the other.
- `circle`/`prowl` stalk phases keep an approach goal with no turn while you are 150-170 deg behind for seconds.

## Tests changed
- None. Scratch probes in out/skel/bodyfix3/: neckpitch.mjs (segment pitches, gaze straight ahead), gazediag.mjs / gazetr.mjs
  (gaze.mjs plus a dump/trace of beyond-neck ticks), turn.mjs (standing turns), twist.mjs / twist2.mjs (foot twist traces),
  neckdbg.mjs, siegedbg.mjs (siege with head-in-wall and neck-gap dump). bodyfix3_run.sh runs the before/after suite.

## Files changed
- src/sim/rex.js only. (src/species/tyrannosaurus.js unchanged; no mind, view, IDX/LEG/PS change.) Original copies:
  out/skel/bodyfix3_before/rex.js.orig, tyrannosaurus.js.orig; final: out/skel/bodyfix3/rex_final.js.

## Unfinished / unverified
- Siege warehouse (39) and containers (136) above the brief's earlier 10/93 (below the same-mind original 41/197).
- chest-to-head max 1.75 m (> 1.7).
- Gaze 1.36% (target ~1%): the remainder is mind-side orients/startles, side switches for subjects crossing behind, and lag.
- Tail: no planner-level "room for the tail base" in standing/turning checks; distal tail transients up to 1.02 m in Saltline.
- Knee backward (seed 7) not examined. Pops in review mind about the same (1069 -> 1103 clusters).
- Only seed 3 for siege, seeds 3/5/8 for gaze; everything single-run.

## Smoke (final tree, hash c7229f1d9355)
- `node test/smoke.mjs --force`: exit 0; all 7 tests exit 0. Score 21 pass / 2 warn / 4 fail (BODYFIX2 final 21/2/4; baseline
  22/1/4): neck_skull_violation_ticks 1317 -> 309 (still FAIL), joint_acc_max 2678 -> 2734 (WARN), leg_overextension 0.077 ->
  0.075 (WARN), joint_acc_p99_mean 181 (FAIL, same), perf FAIL as always.
- `node test/smoke.mjs --full --force`: exit 0; per-test exits identical to BODYFIX2's final (predator_matrix 1, peril 1,
  everything else 0; their checks need more seeds/time than the tier gives). Gaze seed 3: beyond-neck 1.16%.
- 16:10 done.
