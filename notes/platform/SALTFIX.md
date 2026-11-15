# Saltline fixes: five faults of the mind in a foreign world

Date 2026-11-14, about 2 h. Nothing published. `src/sim/rex.js` not edited. Raw outputs are in `out/platform/saltfix/`:
- `before.txt`: Saltline on the unchanged tree, with `--log`
- `after.txt`: Saltline on the final tree
- `f1a`, `f2a`, `f3a`, `f3b`: the intermediate runs
- `smoke_fast.txt`, `smoke_full.txt`: the smoke tiers against the baseline

## After the restart (02:19-03:00 UTC): what was re-verified, and what changed
- The tree was intact. `platform.mjs`: all pass. `saltline.mjs`: exit 0, byte-identical table to `after.txt`.
- **Bug found and fixed: `nav.field` could loop forever.**
  - Its Dijkstra stored distances in a Float32Array but compared them against float64 values, so rounding could re-relax cells without end.
  - Every cell is now settled once (Float64Array plus a `done` mask).
  - This is what made `attend` time out (exit 124) in the first full smoke run: its arena `besiege` scenario hung inside a roam goal choice.
  - Fault 3 (goals by route length) was therefore not fully working before this fix.
- With correct walking distances, crouch/3 put its body 0.57 m into a container while turning round in a tight spot (`feign` turning away). Two fixes:
  - `feign` walks to a heading it can walk straight along (`_wayToward`)
  - general: in a tight spot (less than its measured turning room round the trunk's middle), a move/reach/approach goal more than 1.2 rad off its heading makes it back round toward the goal (a three-point turn, `drive` reverse with steer) instead of pivoting
- **Final Saltline (`saltfix/after_fix.txt`): exit 0.**
  - longest hard stall 18 s (opening/5, feign); no body in a box
  - distal tail worst 1.22 m (opening/3)
  - shed: the body now goes in (23 s inside) and kills once
  - door/3: 3 attack starts, no seize
  - door/5: 8 attack starts, no seize. Before the restart door/5 seized and killed. The seize at a person 4 m inside therefore varies run to run and is not verified as fixed.
  - The tables below that are marked "after" are from before the restart (`after.txt`). The final run differs in detail and still passes.
- The full smoke tier was re-run on the final tree (`saltfix/smoke_full2.txt`); see "Arena: full tier". The fast tier was **not** re-run after the restart. Its siege runs are covered by `siege all` in the full tier; its platform and thoughts-mind runs are also in the full tier.

## Results
`node test/saltline.mjs` now **exits 0** at the species default, which is now measured off the body:
- longest hard stand-still 13 s (crouch/3, `leave`); before it was 48 s
- no body in a box

`node test/platform.mjs`: all 29 checks pass. One check was rewritten for the new contract (see fault 1).

### Saltline, before → after (species default, 15 runs)
| measure | before (navBody 2.6) | after (measured: pass 1.32, room 2.63) |
|---|---|---|
| route-grid regions / largest region | 16 / 27% | 9 / 90% (`test/navfrag.mjs`) |
| hard stalls > 20 s | opening/5 48 s, door/3 35 s, noise/3 29 s | none; worst 13 s |
| leave/roam goal distance (logged) | 0-15 m | 16-37 m |
| door/3, door/5: body / head inside the shed | 0/0, 0/2 s | 30/32, 70/71 s |
| door: seizes | none | door/5: one seize and one kill; door/3: 3 attack starts, no seize |
| shed (person 8 m deep in clutter) | besieges 50 s, then roams with a 40 s by-name stall | besieges 23 s, watches the ways out in turn, gives up, roams |
| noise: footsteps heard / person seen | 0 of 186 / never | 14 of 186 / at 7.4 s (quiet: 10 of 186 / 2.0 s) |
| body in a box | 0 | 0 |
| distal tail worst | 1.21 m | 1.08 m |

hungry and runner now run at hunger 0.75, not 0.93 (item 8), so their rows are not comparable:
- first attack at 1-24 s instead of 1-4 s
- appraise and inspect now show up, and seize/feed take a smaller share

## Fault 1: the route planner's body radius
**Cause.** One fixed radius, 2.6 m, was both the wall and the turning room.

**Fix.**
- `nav.js: bodyRoom(sim)` measures the body itself. It builds a throwaway copy of the same species, as `selfModel()` does, on a floor whose `pushOut` only records the trunk's own collision parts, then walks it. No hand-entered size. From that it takes:
  - **pass**: the trunk's half-width (widest reach either side of its line while walking): 1.32 m
  - **room**: the radius the stiff trunk (hips to neck root) sweeps turning about its own middle: 2.63 m
- `Nav.fit()`:
  - a cell closer than **pass** to anything solid is blocked
  - between **pass** and **room** it costs 4 to 13 (a squeeze)
  - beyond **room** the old clearance cost applies unchanged, so open-ground routing on our arena is the same
- `clear()` and the taut-pull already refuse costs over 2.2, so a route only goes through a squeeze when going round is much longer.
- The species' `navBody` is now `null`, meaning measured. A number still forces a fixed radius with no squeeze band, as before; `--navbody=` uses this. `Mind`'s constructor calls `sim.nav.fit(bodyRoom(sim))`.
- Two places where turning room matters also read it:
  - it does not pivot (`face`) where there is less than **room** round the middle of its trunk; the head turns instead (`mind._unstick`)
  - `circle` turns back when the way round ahead is a squeeze or blocked, and stops circling if boxed in both ways

**Unfinished.**
- A body without a Mind (the body-only tests, `navsoak reach`) still plans at 2.6, so `navsoak` is unchanged.
- There is no dead-end cost.

## Fault 2: wedged and not moving
**Fix** (`mind._unstick`, run after every behaviour). It fires when the mind wants to travel (a `move` goal, or a `reach`/`approach` goal more than 3 m past its stop) and the body has gone less than 1.5 m in 4 s. Steps:
1. It backs out with `drive`, throttle -0.35, for up to 5 s or 2.5 m, swinging the tail toward the side the planner rates more open.
2. It marks the spot as a bad way, `nav.sore`: an extra cost of 12 within 3.5 m for 45 s. This is a cost, not a wall, so the planner takes another way if there is one. It then clears the body's path, so the body plans again from where it is.
3. Stuck a second time on the same errand (a third time when after you), it ends the behaviour and records `mem.gaveUp`.

Thoughts: "stuck. back out" / "too tight here" (condition `stuck`) and "can not get through" / "no way through" (condition `gaveup`), added to `thoughts.js` and to the checker in `test/thoughts.mjs`.

**On the arena.**
- The body does get out of the wall: warehouse body-in-wall ticks 3668 → 95.
- The backing itself moves the body very little (0.9 m in 6 s in the warehouse lane). The wedge is in `rex.js` locomotion.
- The back-off length was chosen among 3.5, 5, 6 and 8 s on the warehouse siege:
  - 3.5 s: 375 wall / 570 bend ticks
  - 5 s: 25-95 / 165-278
  - 6 s: 14 / 219
  - 8 s: 758 / 35
- **Warehouse neck-bend ticks rose (26 → 278).** The extra bends are in `search` and `stare` at 55-80 s, with the head against the warehouse wall, after the body is free. The baseline spent that time wedged in the wall instead. Barn and culvert bends fell a lot (see the table below). This breaks the rule that bend ticks must not rise, for one structure.

## Fault 3: goals by route length
**Fix.**
- `nav.field(x, z)`: one Dijkstra sweep gives the walking distance to every cell (a squeeze counts 1.5x).
- `mind._walkField()` caches it for 1 s.
- **leave**: 18 candidate goals, mostly away from what it leaves. Each is scored by:
  - how much further from the belief it ends up (capped at 30)
  - +10 if out of its sight (`los` from the belief)
  - minus the walk beyond 45 m
  - -20 if it ends within 15 m of the belief
  - a goal under 8 m of walk is dropped
- **roam**: up to 10 candidates. It keeps one whose walk is at least 20 m and not over 1.6x the straight line + 6 m.

**Not done:** search's `_peek`, revisit and lurk still use straight lines.

## Fault 4: reach check and besiege planner disagree
**Done.** The `wait` phase now re-plans when nothing changes:
- every 12 s unseen, it watches another way out
- after watching them all once more than there are ways out, it gives the siege up: interest is halved, `mem.gaveUp` is set, and the "can not get through" thought follows
- Shed run: 23 s of besiege, then it leaves.

**Not done.** There is still no single source of truth between `afford()` (`reach` = true) and `senseSpots` (0 spots). Merging them was out of time.

**The door case.** The person is 4 m inside and the doorway is passable. It now walks in: body inside 30 and 70 s. In door/5 it seizes and kills. In door/3 it makes 3 attack starts, comes within 7.1 m, and does not seize. **Not checked:** whether door/3 is the appraisal choosing not to, or a fault.

## Fault 5: a steady loud sound
**Fix** (`mind._perceive`).
- Each sound is matched to a steady source, `mem.steady`: same class (or `src`), within 10 m + 0.15 d of the place.
- Each repeat within 6 s adds 0.035 to its steadiness k; k fades after 10 s of quiet. Seeing you within 8 m of the source resets it to 0.
- Novelty is multiplied by 1 - k². Past k² 0.5 the sound:
  - is background: no belief update, no startle, no orient
  - no longer adds to the general habituation, so a quieter sound near it stands out again
- When k passes 0.7 it records `mem.hush` and ends a search that was going to that sound. Thought: "that noise again" / "just that noise" / "noise. nothing there" (condition `hush`).
- In the noise run the source was hushed at 6.1 s. The thought was not voiced there: it was outranked once the person was seen at 7.4 s.

## Test changes
- `test/saltline.mjs`:
  - the default is the species value (measured)
  - hungry and runner use hunger 0.75
  - a body-in-box failure now prints its time and behaviour
- `test/navfrag.mjs` (new): regions and the squeeze band in Saltline and on the arena.
- `test/platform.mjs`: the radius check accepts a measured radius (equal to `bodyRoom().pass`, between 0.8 and 2.6).
- `test/thoughts.mjs`:
  - new conditions `stuck`, `gaveup`, `hush`
  - the "voice.think is not the newest thought" check now skips ticks where `peril.quiet` holds. By design, the voice is silent then ("gone still before it strikes"). After these changes one run (wander_near, 125.5 s) hit that window, giving 18 false problems.

## Arena: smoke fast tier against the baseline (`smoke_fast.txt`, before the two test fixes above)
Exit codes:
- platform 0 → 1: the old radius check; passes after the test fix
- thoughts_mind 0 → 1: the peril-silence false positive; fixed in the test

Changed numbers:

| number | before → after | verdict |
|---|---|---|
| siege warehouse body-in-wall ticks | 3668 → 95 | better |
| siege warehouse worst wall penetration | 0.38 → 0.12 m | better |
| siege warehouse neck bend (= limit) ticks | 26 → 278 | **worse** |
| siege warehouse head step / head speed | 11.4 → 9.2 cm, 13.7 → 11 m/s | better |
| siege barn body-in-wall ticks | 556 → 57 | better |
| siege barn worst wall penetration | 0.28 → 0.1 m | better |
| siege barn neck bend ticks | 2905 → 274 | better |
| siege barn snout inside / eye line-of-sight ticks | 2904 → 3286, 2681 → 3696 | better (more contact) |
| siege barn snout deepest / closest | 1.64 → 1.69, 2.25 → 2.28 m | neutral |
| siege barn head step / speed | 14.8 → 11.4 cm, 17.8 → 13.7 m/s | better |
| siege culvert neck bend ticks | 696 → 126 | better |
| siege culvert eye line-of-sight ticks | 135 → 15 | worse |
| siege culvert closest snout | 3.66 → 4.13 m | worse (slightly) |
| siege culvert snout deepest | -0.77 → -0.56 m | better |
| siege culvert head step / speed | 13.6 → 10 cm, 16.3 → 12 m/s | better |
| score neck/skull violation ticks | 1133 → 1066 | better |
| platform: longest stand-still in a walk | 14.7 → 7.3 s | better |
| platform: footstep salience with / without engine | 0.076 / 0.109 → 0.087 / 0.063 | better (stands out over the engine) |
| platform: leave/roam goal count, grid open count, spawn drift | 12 → 15, 222 → 248, 286 → 286.1 | neutral |
| thoughts mind: totals | 184 → 181 thoughts, 108 → 112 distinct; intend 21 → 13, sense 46 → 51, body 0 → 3 | neutral |

Siege body-in-wall summed over the three structures: 4243 → 171. Neck bend summed: 3627 → 678. But warehouse bend alone rose.

## Arena: full tier on the final tree (`saltfix/smoke_full2.txt`, run after the restart)
355 numbers changed; the full list is in the file. Earlier `smoke_full.txt` is from before the `field` fix and is superseded.

### Exit codes
- **attend 0 → 1, worse.** The non-focus share is 26.0%, against a 25% limit (baseline 24.2%). The violation kinds are the baseline's plus one `you:feel`. **Not fixed**: no time left.
- thoughts_attack 1 → 0: better.
- Everything else is unchanged:
  - platform, review_mind, score, siege_all, thoughts_mind, afford, active_wanderer, gaze and navsoak_reach exit 0
  - predator_matrix and peril exit 1, as in the baseline

### Siege body-in-wall and neck-bend ticks (baseline → final)
| structure | body-in-wall | neck bend | verdict |
|---|---|---|---|
| warehouse | 3668 → 25 | **26 → 165** | wall better, bend **worse** |
| barn | 556 → 0 | 2905 → 1009 | better |
| tower (both) | 175 → 18 | 597 → 580 | better |
| containers | 122 → 99 | 427 → 388 | better |
| culvert | unchanged | 696 → 126 | better |
| ruins | unchanged | **407 → 665** | **worse** |
| novel-slot | 381 → 230 | **0 → 219** | wall better, bend **worse** |

So siege bend ticks rose for three structures. That breaks the acceptance rule. The extra bends are with the head against walls after the body is no longer wedged (warehouse; ruins and novel-slot were not examined). The cause is in `rex.js`.

### Other tests
- navsoak: no number changed.
- predator, peril: no number changed.
- afford (137 numbers), gaze (67), thoughts and review changed. They are trajectory changes and were not analysed one by one.

## Files changed
- `src/sim/nav.js`: `bodyRoom`, `Nav.fit`, the squeeze band, `sore` marks, `field` (loop fixed after the restart)
- `src/sim/mind.js`:
  - the fit at construction
  - after the restart: the three-point turn in tight spots and `feign` heading choice
  - `_unstick` (stuck recovery, and no pivot without turning room)
  - `_walkField`
  - the leave and roam goal choice
  - circling only where there is room
  - besiege wait rotation and giving up
  - steady-source hearing
- `src/sim/thoughts.js`: the stuck, gaveup and hush thoughts, and their snapshot fields
- `src/species/tyrannosaurus.js`: the `navBody` line only (`null`)
- `test/saltline.mjs`, `test/platform.mjs`, `test/thoughts.mjs`, `test/navfrag.mjs` (new)

## Unfinished or unverified
- attend now fails (26.0% against a 25% limit).
- Siege neck bend rose in warehouse, ruins and novel-slot.
- The fast smoke tier was not re-run after the restart.
- Warehouse neck-bend rise (26 → 278): the head is against the wall after the body gets free; the cause is in `rex.js`.
- No single reach source for `afford` and `senseSpots` (fault 4).
- door/3 not seizing: not diagnosed.
- Body-only runs still plan at 2.6.
- No dead-end cost.
- `_peek`, revisit and lurk goals still use straight-line distance.
- The hush thought did not get voiced in the noise run.
- Saltline runs are one seed per encounter for shed, crouch, noise and quiet; the results are chaotic in detail (see NOTES.md).
- Not run: afford, attend, predator, active, peril and gaze beyond the full smoke tier; anything in a browser.
