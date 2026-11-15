# Hips, pelvis, back and tail: audit items 1, 2, 6, 3

Implemented in `/home/claude/rex_skel` (22:48 to 00:05, about 1 h 20 min). Every item is in. The sim is still a fixed 120 Hz step, seeded, with no renderer code. `IDX`, `LEG` and `PS` are unchanged.

## Files changed
- `src/sim/rex.js`: the engine. Adds `HIPS_DEFAULT` and `this.H` (species override). The defaults reproduce the old behaviour, so another species without a `hips` block moves as before.
- `src/species/tyrannosaurus.js`: `dims.hipHalf`, `gait.track` and the new `hips` block.
- `test/review.mjs`: one new check, `shanks touch (3D gap m)`. The old checks are untouched (see below).
- `test/dump.mjs`: two new scenarios, `turn120` and `walk90`.
- Notes and tools in `out/skel/` only:
  - `HIPS.md`, `summ.mjs`, `revdiff.py`, `cmp.sh`, `suite.sh`, `revseeds.mjs`, `rev1.mjs`, `siegeseeds.sh`, `siege_dbg.mjs`, `siege_ab.mjs`, `dbg_turn.mjs`, `popcorr.mjs`, `mind7.mjs`, `shot_hips.py`, `views_hips.py`.
  - `measure.mjs` and `rollphase.mjs` now read `sim.yawP` and `pelPitch`/`pelRoll` when present. They add the pelvis rate with one foot down against both feet down, hip rotation and chest-vs-pelvis. `measure_audit.mjs` is the old script.
  - `orig/` is a pristine copy of the tree for before-runs. `dist_hips/` is a build for the renders; `dist/` was not touched. `wip/` is scratch.
- Not touched: `rexgeo.js`, `body.js`, the world-bounds clamp and the route planner. `/home/claude/rex` was not touched either.

## What changed, per item
**1. The pelvis turns by steps** (`_posture`)
- A new state `pTurn` holds how far the pelvis trails the body heading `psi`. It moves as a second-order system.
- With one foot loaded (`hold` = `pelvisHold` x the load difference between the feet), the stance foot holds the pelvis: low stiffness and strong friction against the world. With both feet down it catches up at `pelvisCatch`. It is clamped softly at `pelvisLag`.
- Pelvis yaw is `psi + stride yaw + pTurn` (`this.yawP`).
- The back absorbs `pTurn` exactly, over the first `lumbar` share of its length. The chest, and so the neck base and the head goal, never see the step. My first version let the chest see it, and that made neck pops.
- Fixes this required: the hip-height cap and the swing reach limit now place the hip by the pelvis' own yaw. Without that, leg over-extension went to 0.08 m.
- Near tail contact the hold is released, so a catch-up cannot sweep the tail into a wall.

**2. Hip long-axis rotation** (`_leg`)
- The knee plane rotates about the vertical by `clamp(footYaw - pelvisYaw, ±hipRot)` x `kneeFollow`.
- The follow share is 0.95 when planted and 0.3 in mid-swing. It ramps back up in late swing, so the leg is already turned when the foot lands. Without that ramp, ankle twist only fell to 25°.
- Abduction is not enforced; `hipAbd` is data and measured only.

**6. Trunk and tail, no new bones**
- Back: `backEven` blends the shoulder-heavy `k²(3-2k)` toward linear (a C). `backYawMax` 0.85 replaces the 0.7 clamp.
- `backGaze` raised the back's share of the gaze from 0.42 (cap 0.6) to 0.55 (cap 0.75). The gaze is low-passed (0.3 s) before it bends the back: unfiltered, it doubled idle neck pops.
- Tail root (`_tail`): `tailRoot` is a damped spring. It is driven by `tailInertia` x the pelvis' turning acceleration, plus a 0.2·om trail on the spot. It is clamped at `tailRootMax` (held in line near a wall) and spread over the first three caudal joints.
  - The audit's sign (`-0.2*om`) was the wrong way: a lagging tail has the same sign as the turn in the pelvis frame.
- Standing reorient thresholds come from `hips.reorient`.
- `_sided` keeps one side per caller (`attend`, `face`, `head`, `sense`). A new caller adopts a side another caller already chose.
- The head goal now uses `psi + twist`, as before; the chest yaw is `yawP + backYaw`.

**3. Narrower hips and track, less sway, a pelvis that rocks**
- `hipHalf` 0.5 → 0.36. `track` 0.30 standing / 0.16 walking / 0.10 running (half widths).
- The hard 0.6 m gap is replaced by two rules:
  - `footGap.midline` (0.24): the foot keeps to its own side of the standing foot.
  - A footprint overlap test (`footprint` heel 0.5 / toe 0.55 / r 0.24, new helper `segGap`): two prints, each along its own yaw, may not overlap.
  - So feet side by side or turned on the spot keep a foot's width apart, while feet a stride apart can come near the midline.
  - A simpler side/staggered/heel variant left the ankles 0.2 m apart in pivots. This replaced it rather than adding a third patch.
- `swingClear` 0.5 (was 0.62) and `sway` [0.5, 0.2] (was [0.62, 0.25]).
- List: `list` 0.055 rad, swing side down, `sin(πu)` of the swing, spring `listWn` 14. The lagging load term went from 0.075 to `listLoad` 0.02.
  - Also fixed: the slope-roll term used a swinging foot's lifted height as ground, which tilted the pelvis the wrong way at lift-off. It now uses the landing ground.
- Nod: `nod` 0.026 rad, nose down at touchdown and up mid-swing. It is its own spring and fades along the back. Readable as `sim.pelPitch`.

## Species fields added (`tyrannosaurus.js`, `hips`)
`pelvisHold 0.92, pelvisLag 0.35, pelvisCatch 9, hipRot 0.4, hipAbd [-0.15,0.35], kneeFollow [0.3,0.95], backYawMax 0.85, backEven 1, backGaze [0.55,0.75], tailInertia 0.6, tailRootMax 0.3, reorient {cone 1.1, coneT 0.9, snap 1.5, done 0.4}, footGap {midline 0.24}, footprint {heel 0.5, toe 0.55, r 0.24}, swingClear 0.5, sway [0.5,0.2], list 0.055, listLoad 0.02, listWn 14, nod 0.026`

Plus `dims.hipHalf` 0.36 and `gait.track`. The engine-only default `lumbar` 0.4 is not overridden by the species.

## Key numbers (flat ground, seed 3; `node out/skel/summ.mjs out/skel/before out/skel/after`)
| | before | after |
|---|---|---|
| On the spot 90°: pelvis yaw rate, one foot / both feet down (deg/s) | 25 / 23 (no steps) | 12 / 33 (steps; mid-swing about 4, peaks 76) |
| Body ω max, on the spot | 30 | 30 (unchanged) |
| Walking 90°: pelvis rate, one foot / both feet down | 27 / 28 | 29 / 51 (walking: the 0.35 rad lag saturates) |
| Tail-base to pelvis yaw-rate correlation: spot / walk / circle | 0.95 / 0.89 / 0.86 | 0.61 / 0.73 / 0.62 |
| Tail base max lag behind pelvis, on the spot | 7.7° | 17° |
| Chest-to-pelvis rate correlation, on the spot | 0.44 | 0.16 |
| Ankle twist (knee plane vs foot plane), max: spot / walk 90 / spot 180 | 29 / 32 / 28° | 10.5 / 14 / 10.5° |
| Hip long-axis rotation shown, spot | ±7° | -24..+28° |
| Turn to something behind (spot 180) | went -34° (wrong way, reversed) | 181° one way, no wrong-way start |
| Track width (m) / pace angulation: 1.2, 2.2, 4, 8 m/s | 0.95/113°, 0.80/136°, 0.78/148°, 0.64/162° | 0.44/146°, 0.32/162°, 0.31/167°, 0.24/173° |
| Hip sway (m): 1.2 / 2.2 / 4 m/s | ±0.23 / ±0.12 / ±0.08 | ±0.09 / ±0.04 / ±0.02 |
| Pelvic list at 2.2 m/s | ±3.5°, peaks at double support, about 0 mean in single support | ±4.1°, swing side down, peaks at about 65% of swing (`rollphase.mjs`) |
| Pelvic pitch at 2.2 m/s | -0.6..-0.1° (no stride term) | -2.1..+1.0° (nod per step) |
| Hip abduction used at 2.2 m/s | -6..13° | -7.6..11.6° (slow walk -7.4..8.6°) |
| Standing reorient: start / stop | off by more than 0.9 rad for 0.9 s, or 1.5 at once / stop within 0.14 rad | 1.1 rad for 0.9 s, or 1.5 / stop within 0.4 rad |
| Walking speed, hip height | 2.2, 2.96-3.08 | 2.2, 2.97-3.08 (unchanged) |

## Tests, before → after (`out/skel/before/`, `out/skel/after/`, compare with `out/skel/cmp.sh before after`)
**review.mjs (scripted).**
- Pops: 598 → 619 clusters in total, nearly all `neck7`/`headP` refixation pops of the existing kind. Five-seed sums (`revseeds.txt`) are level: idle 473 → 460, pivots 330 → 325, alone 19 → 22.
- `ridge sculpt` 39 → 53 (leg pops stepping on bumps).
- Leg over-extension is not worse. `hips very low` in stalk: 4 → 19 ticks, 4 cm.
- Neck joint bend over 35°: 577 → 851 ticks over the suite. The worst angle fell from 0.82 to 0.74 rad. Over five seeds: idle 159 → 611, pivots 627 → 783.
  - Run with the old reorient thresholds, idle drops to 44, so this comes from the neck now holding gazes up to 1.1 rad, as asked.
  - The neck spreads that yaw unevenly across its joints. That is the next thing to fix, in the neck, not here.
- `legs pass through each other (ankle gap m)`: new, many ticks, worst 0.24.
  - I think this threshold is wrong for the intended motion. It flags any two ankles less than 0.42 m apart sideways, in the body's frame, when less than 0.5 m apart fore and aft. On a narrow track, staggered ankles and feet toed in on a pivot trip it without touching.
  - I left it as it was and added a 3D check, `shanks touch` (the least distance between the two shin and metatarsus segments against the skin radii, under 0.3 m). It reports 2 ticks at 3 cm, in ridge sculpt only; 0 in the baseline.
  - Before the footprint rule it reported 50-175 ticks per scenario, so it does catch real contact.
- `foot twisted`: 5 ticks in pivots over five seeds (0 → 5), worst 0.82 against a threshold of 0.8.

**review.mjs mind.** Mind-driven runs go chaotic, so the counts are noisy. Seed 7 alone gave over-extension of 0.17-0.44 m at a hard brake from a run, depending on the run; it was 0.23 at baseline.

**score.mjs --quick.** 21 pass / 2 warn → 20 / 3, with no new fails.
- `head_worst_depth` 0.070 → 0.107 (WARN), `head_in_collider_ticks` 10 → 23, `neck_skull_violation_ticks` 1133 → 1586.
- Leg over-extension 0.001 → 0.000. `joint_acc_max` 2653 → 2345.

**siege.mjs all 3 90.**
- Chest-to-head max 1.73 m (baseline 1.74). Both already exceed the 1.7 m limit before my changes.
- leg-in-collider 0 → 0.
- body-part-in-wall: the warehouse has 15553 ticks of mid-tail inside a wall (baseline 3668).
  - This is an existing failure: it stands still with its tail in the wall, and the tail root and pelvis state are 0 at those moments.
  - Over 8 seeds of the warehouse: current 22221 ticks, original 10683, current with no pelvis hold 9929. Each total comes from one or two long episodes, and the medians are similar.
  - Not proven better or worse. Treat it as an open risk.
- 3-seed totals: original 5096 / 3065 / 3385, current 18491 / 1567 / 6113.

**gaze.mjs.** Off-target by more than 60° while seeing you: 10.8% → 6.0%. Beyond the neck's reach: 3.42% → 3.31%. Unreported episodes over 1.5 s: 15 → 19 (behaviour mix differs).

**navsoak.mjs reach.** 35/35 and 35/35 arrived; stuck 0.63% and 0.75% (baseline 0.74% and 0.61%).

**face180.** One-way 180° turn (was -9° then reversed).

## Images
**Flip-books** (`test/dump.mjs` + `test/film.py`): `out/skel/film/m_{walk,turn120,walk90}_{top,side}_{film,strobe,trace}.png`.
- In the 120° on-the-spot top view the head leads, then the chest; the pelvis steps, and the tail swings out into a C and straightens about a second after the body stops.
- The straight-walk strobe shows the ankles close to the midline and a nearly straight hip path.
- The tail tip still swings about 1 m each way in a straight walk. It did before too (tail tip vs pelvis -21..24° before and after).

**Renders** (`out/skel/hips/`, 1100x620, `python3 out/skel/shot_hips.py out/skel/hips out/skel/views_hips.py`):
- `h_side_midstride.png`: walking with the left foot in swing. Legs are under the body. The thigh hardly reads as a drumstick from the side; it was the same before.
- `h_front_walk.png`: the feet are closer together than in the audit's `v_front.png` and nearly in line. At 14 m I see no visible break or merge between thighs and belly, but the hip region reads narrow and the thighs do not bulge outward.
- `h_rear_midturn.png`: **not mid-turn.** My trigger for the turn did not fire (ω was 0 when the shot was taken), so this is a rear view of a straight walk. It shows the legs close together and the tail held off to one side in a stiff curve, as the audit saw. I had used my four renders and did not redo it.
- `h_eye_1p7m_8m.png`: the animal fills the frame from about 8 m at 1.7 m eye height, with the belly dominant and the legs emerging from under it. The thigh-to-belly join is soft, with no visible seam or intersection. The thighs are not distinguishable as separate masses at all, which is a skin matter: `rexgeo.js` centres the 0.47 m-wide thigh ellipsoid on the femur, so with hips 0.72 m apart the two thigh masses overlap under the body.

## Unfinished or unverified
- The skin was not adapted. The thigh masses should move outward of the hip socket (about 0.14 m) so the drumsticks keep their silhouette with the narrower pelvis. I have not checked inner-thigh interpenetration close up.
- No rear mid-turn render, so the hips "working" over the planted leg is verified only in the numbers and the flip-books.
- The increase in neck-bend ticks: the neck needs a more even yaw spread before it can take 1.1 rad gazes cleanly.
- Tail in walls in the warehouse siege: existing, heavy-tailed, not settled.
- The `legs pass through each other` threshold needs a decision: replace it with the 3D shank check, or make it relative to `footprint`.
- In the walking 90° turn the pelvis still overshoots to 108°, as before. The stride yaw and the heading controller do this; I did not touch them.
- `hipAbd` is not enforced. The final runs stay inside it on straight walks (-7.6° at the most), but an intermediate run reached -10.6°, so turns may exceed the -8.6° floor.
- `score_baseline.json` was not updated.
