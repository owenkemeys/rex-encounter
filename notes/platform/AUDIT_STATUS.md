# Audit status (out/mind_env_audit.md, sections A and B) against the code as of 2026-11-13, before this clean-up

Status: **open** = still as the audit says; **fixed** = no longer true; **changed** = partly addressed or moved. Line numbers
are for the files *before* the platform clean-up (snapshot of `src/`); "→ item N" = handled in this clean-up (see REPORT.md).

## A. Hard-coded to named places / kinds

| # | status | where now | note |
|---|---|---|---|
| A1 | fixed | thoughts.js:24-62 | `KNOWN` gone. `perceive()` + `nameOf()` coin a name from walls/roof/size/material. Residue: `MAT` (thoughts.js:28) maps material *strings* (timber, steel, glass...) to words; an unknown `mat` gives no material word (safe). |
| A2 | changed | thoughts.js:99-105 | `_name` calls `perceive(S)` itself, so the perceived path is fed (not via `b.shape`). The self numbers there are hard-coded (`width: 2.1`, length formula) rather than `afford.bodyOf`. → item 4 |
| A3 | fixed | thoughts.js:96, 99 | names kept per structure id (`'s'+id`), per Thinker instance; no module-global per kind. (`CUR` is a module-level pointer to the current Thinker: set in `_snap`, harmless while single-threaded.) |
| A4 | fixed | thoughts.js:67, 107 | "up" comes from `perceive().raised`, not from the name string. |
| A5 | fixed | thoughts.js:71-83 | `placeWord` reads depth, mud, cover height, trunks, height difference; the zone string is read and ignored (`void zn`). Unknown zone names cannot produce words. |
| A6 | open | thoughts.js:140-153, 79 | landmarks: `o.kind === 'tree'` → "by tree", any other non-wall kind → "rock"/"behind rock"; walls skipped; "in trees" counts `kind === 'tree'`. → item 4 |
| A7 | fixed | thoughts.js:510, 525-527, 639 | vertical case from `s.up` (afford: not body-reachable, rise > 2.5) and `perceive().raised`, not `encl === 'tower'`. |
| A8 | changed | thoughts.js:390 | "wind gone" is raised by a measured calm (`T.windAt`); "water" by `depthAt`. World-optional, not map-specific. |
| A9 | open | thoughts.js:353-366, 403-406 | "rock" is the only word for a thrown thing (`kind === 'stone'`). |
| A10 | fixed | mind.js:111, 131-136, 683; appraise.js | all close-contact gates read `c.walled = !aff.body` (afford.js geometry against the body). No `'pen'` anywhere in src/sim. |
| A11 | fixed | mind.js:733 | snap allowed when `c.aff.reach` (the head can be threaded to you) and the head is within 4.6 m. |
| A12 | fixed | thoughts.js:490, 426 | besiege narration uses the coined per-id name (`STRUCT[...]`), no table in mind.js. |
| A13 | fixed | appraise.js:128 | `Q.high` = afford says neither body nor head reaches and rise > 2.5, or high ground the planner cannot reach. No kind. |
| A14 | open | terrain.js:107 | `insideStructure` still special-cases `kind === 'tower'` (inside only if `y > base + 3`). → item 3 |
| A15 | open | terrain.js:85 | structures sorted `tower` kinds first. → item 3 |
| A16 | open | mind.js:1001, 1047, 1088 (`_peek`, `_route`, lurk spot) | `kind === 'wall'` skipped, everything else "rock to go round". Harmless for foreign worlds that call everything `wall` (nav plans downstream), not touched. |
| A17 | open | things.js:92 | thrown-object collision: `tree`/`wall` solid, other kinds 0.8 h. Not touched. |
| A18 | open | mind.js:133-141, 477; attend.js:87 | object meaning by thing kind (flare, meat, carcass, stone). Not touched. |
| A19 | open | mind.js:354-377 | noise semantics by kind; one shared `noiseHab` for all sounds (mind.js:374, 395, 520, 562). → item 6 (habituation only) |
| A20 | open | mind.js:943 (leave ±70 box); 922 (roam, disc round origin + fallback ±40 absolute); 1002, 1080-1081, 1848, 1957 (disc round origin) | → item 5 |
| A21 | open | mind.js:58 | compass words, only in the long-form `thought` readout, not in the stream. Harmless. |
| A22 | open | herd.js:11-13, 119, 125 | herd spawns/pastures round the origin. herd.js is outside this clean-up's edit list; a foreign world must disable it (`arena.herd.disabled = true`, as Saltline does). |
| A23 | open | paddock.js | expected (the map itself). |

## B. Generic mechanism, map-specific data

| # | status | where now | note |
|---|---|---|---|
| B1 | open | everywhere | one height per (x, z). |
| B2 | open | mind.js:245, 260-263 (belief), 922, 943, 1002, 1080, 1848, 1957; arena.js:36 (spawn); nav.js:11, 14, 57-58 (grid centred on origin, extent `arena + 14`); rex.js:503-505; herd.js | disc/square centred on (0,0). Saltline's `T.rect` diff not upstream. → items 2 and 5 |
| B3 | open | mind.los 151-165, appraise, things, victim, nav | cylinders; `kind` read (A6, A16, A17). |
| B4 | open | mind.js:151-165 | mind.los still obstacles + roofBlocks, not `segClear` (afford and the head planner use segClear). Not touched (rank 3). |
| B5 | changed | mind ctx 678-683 | inside is still an authored box per structure, but what it may do about you there comes from afford.js. |
| B6 | open | mind, herd, thoughts | cover = baked vegetation field. |
| B7 | changed | thoughts.js:73 (ignored), mind.js:1070 (stored in `mem.noReach.place`, never read) | zone strings no longer reach the voice. |
| B8 | open | — | optional and geometric enough (as audit). |
| B9 | open | arena.js | doors as the only movable barrier (as audit). |
| B10 | open | nav.js:7-8 (`BODY = 2.6`), rex.js:68 | hard-coded planner body radius. → item 2 |
| B11 | changed | mind.js:217, 237 | `lightAt(x, z, world)` adds flares/torch to the global level; still no arbitrary light sources. |
| B12 | open | mind.js:354-377 | planar, unoccluded except a 1.8x bearing blur through structure walls. |
| B13 | open | — | people only. |
| B14 | fixed (model to follow) | rex.js:1608; afford.js `bodyOf` | afford, peril and the head planner read it. thoughts.js still has its own hard-coded copy (A2). |

## After this clean-up (details in REPORT.md)
- now fixed: A6 (landmarks of unknown kinds), A14, A15 (raised floor read off the openings), A20 (leave/roam goals), B2 for
  nav, body clamp, belief, roam/leave/lurk/avoid/carry goals and spawn (when the world gives `T.rect`), B10 (`species.navBody`).
- changed: A9 ("rock" only said once a stone has really come into it), A19 (habituation per sound class; semantics still by
  kind), A2 (thoughts read body numbers from `afford.bodyOf`).
- still open: A16, A17, A18, A21, A22 (herd.js), B1, B3, B4, B6, B9, B11-B13.
