# Platform clean-up: notes (the report)

Outputs are in `out/platform/`:
- `baseline/`: before any change
- `after/`: the first pass
- `after2/`: after the warehouse fix

The audit re-check is in `AUDIT_STATUS.md`.

The test world is `test/foreign_world.mjs`, a made-up place:
- a rectangle at x 200..290, z -340..-270, with flat ground at y = 12
- structures of unknown kinds (`zorb` twice, at two sizes, `quux` and `plinth9`)
- things of unknown kinds (`gizmo`, `blorp`)
- misleading zone strings

`test/platform.mjs` runs 29 checks on it. All pass now. Run against the old code, 17 fail. Some of those fail only because the
old route grid never reached that world.

## Files changed
- Sim: `src/sim/mind.js`, `thoughts.js`, `nav.js`, and `arena.js` (spawn point only).
- Map: `src/terrain.js`.
- `src/sim/rex.js`: two lines (the route planner's body radius and the rectangle clamp).
- `src/species/tyrannosaurus.js`: one new field, `navBody: 2.6`.
- Tests: `test/platform.mjs` and `test/foreign_world.mjs`.

## What changed, item by item
1. **Audit status.** Much was already fixed before this work:
   - The `pen` and `tower` behaviour gates had already become affordance gates.
   - The voice's name tables were already gone.

   Still open were A6, A14, A15, A20, B2 and B10.
2. **The three Saltline diffs.**
   - **Bounds:** a world can give `T.rect`, a rectangle anywhere. The route grid is centred on that rectangle; without this an
     off-origin world has no walkable cell at all. The body is clamped to it.
   - **Body radius:** the route planner's radius now comes from `species.navBody`. It is still 2.6, so our arena is unchanged,
     and it is not derived from the self model.
   - **Missiles:** a hit from any missile adds to the grudge. The voice says "rock" only once a real stone has come into its
     world.
3. **Raised floors.** `terrain.js` now finds a raised floor from its openings (all of them marked `up`), not from the kind
   `tower`. On our arena this gives the same answer as before at all 1960 points tested.

   On the made-up world, its body and head reach each structure as the geometry says.
4. **Words for places and things.**
   - **Structures with no wall list:** `perceive()` feels round the rim to judge them.
   - **Landmarks:** a standing thing of an unknown kind is called "post", "big thing" or "lump" by its shape, and the word is
     kept per thing.
   - **Objects:** an object of unknown kind is "that thing", no longer "meat".
   - **Zone names:** they produce no words.
5. **Leave and roam goals.**
   - Goals are chosen inside the world's bounds and on ground it can walk to (`_reachGoal`).
   - If the first leave goal comes out short, up to 6 other headings away from you are tried.
   - Lurk, avoid and carry goals, the belief particles and the arena spawn point use the rectangle too.
6. **Noise habituation per kind of sound.** Footstep salience after 60 s of a loud engine is 0.076, against 0.080 with no
   engine.

## The warehouse regression (follow-up)
In the first pass, the siege `warehouse` run got worse:
- body-in-wall ticks: 3668 → 11712
- neck-bend ticks: 26 → 2463

**Cause, found by bisecting with flags.** I reverted one group of changes at a time and ran `siege.mjs warehouse 3 90` each time:
- reverting per-class noise habituation, the roam goal choice or the new leave goal changed nothing
- reverting only the 8 s stuck-walk ending gave exactly the baseline numbers

**What happens.** From 38 s, in every version, the body is wedged in the 8.7 m lane between the warehouse and the containers. It
pivots the long way round into the warehouse wall and creeps at 0.05 m/s. The stuck-walk ending dropped the roam at 46.2 s.
After that the wedged body is in a slightly different pose, and everything it does later from that spot puts different parts of
it into the wall.

**The numbers are very sensitive.** Dropping the walk's goal for 0.25 s, 1 s or 2 s without ending the walk gave 1607/935,
1490/0 and 1490/0 (wall ticks / neck-bend ticks). So the baseline's 3668/26 is not good either. The real problem is the body
getting wedged and settling into the walls, and that is in `rex.js` locomotion and collision, which this work may not edit.

**Two fixes in the mind did not help:**
- backing off for 3 s and then choosing a goal away from the wall: 11805 / 2160
- not roaming again from the spot where it got stuck: 11712 / 2463

**Fix shipped.** I removed the stuck-walk ending (`_stalled`) completely. The goal-choice fix stays. Our arena is now identical
to the baseline.

On the made-up world the longest stand-still in a walk is 14.7 s, against Saltline's 25-37 s. The platform test's limit is now
20 s; it was 12 s.

## Before / after2 on our arena
| test | baseline | after2 |
|---|---|---|
| siege.mjs all 3 90 | exit 0 | byte-identical to the baseline, apart from the run-time line |
| platform.mjs | (old code: 17 FAIL) | all 29 pass |
| thoughts.mjs all 3 --quiet | exit 1, problems 261 (mostly "not the newest"), plus the "one more small thing?" word problem | exit 1, problems 252, plus the same word problem; 1254 thoughts, 478 distinct, repeats 4.1% |

From the first pass (`after/`), which included the stuck-walk ending (removed since), and not re-run since:

| test | baseline | first pass |
|---|---|---|
| attend | non-focus share 23.7% | 24.2% (limit 25%) |
| predator | the same 2 failures | same 2 failures; fed animals slightly more curious |
| active | | no change |
| afford | | no run deeper than 0.5 m into a wall; one more bite from the tower |
| score | | no change, apart from step timing (another agent was using the cores) |

peril was run as `peril.mjs 6`: the full run was too slow and was cut off. It has the same 1 failure; torch deaths went from
5/6 to 6/6.

The known failures named in the brief did not show as described: `afford.mjs` exited 0, and `attend` was under 25%.

## Not done / not verified
- These tests were not re-run after removing the stuck-walk ending: attend, predator, active, afford, peril, score.
- The wedging of the body in narrow lanes (`rex.js`).
- B4 (line of sight), A16-A19, herd.js (a foreign world must set `arena.herd.disabled = true`).
- The route planner's body radius is not derived from the self model.
- Nothing was run in a browser or against Saltline's real world.
