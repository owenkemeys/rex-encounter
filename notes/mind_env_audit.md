# Mind / environment coupling audit

Scope: `src/sim/{mind,appraise,thoughts,arena,nav,things,herd,victim,rex}.js`, `src/paddock.js`, `src/terrain.js`.
Question: dropped into a city block (streets, cars, glass shopfronts, multi-storey interiors, stairs, crowds, traffic noise, street lights), would the Mind still behave and "think" plausibly?

Short answer: the core machinery travels well. Belief particles, sense-chance model, appraisal cues, the `senseSpots` head-planner, the body self-model and the nav grid are all geometric. They have no names in them. What does not travel:

1. A layer of names (structure kinds, zone names, obstacle kinds) that gates behaviour as well as wording.
2. A world that is a 2.5-D heightfield with a round fence centred on the origin.
3. A short list of perceptual primitives: opaque cylinders, one global light level, one habituation counter for all sound, one tracked intruder, and four thing-kinds.

In a city it would run without crashing. But it would be mute or wrong about places ("strange place", "behind rock" next to a bus). It would treat glass as stone. It would go deaf after a minute of traffic. It could not understand a second floor. It would never get attacks through a shop door, because the only enclosure that allows attacks is a `pen`, and no `pen` exists.

Line numbers are for the current files.

---

## A. Hard-coded to named places / kinds

| # | file:line | what |
|---|---|---|
| A1 | thoughts.js:27 | `KNOWN = {shed, pen, culvert, tower, cleft}`. This is stale even for *this* map: paddock structures are `barn, tower(loft), silo, warehouse, containers, ruins, gatehouse, tower, culvert, cave, rubble, jetty, fence` (paddock.js:196-310). Barn, warehouse, containers, ruins and gatehouse all fall through to "strange place". |
| A2 | thoughts.js:80 | The `perceived` path that should make A1 unnecessary is **never fed**. It reads `b.sense \|\| b.perceived`, but mind.js only ever sets `b.shape` (mind.js:1228, from nav.js:290 `shapeAt`). So `nameOf` always takes the kind-table fallback. This is a bug. |
| A3 | thoughts.js:44-47 | `SEEN` is a module-global Map keyed by `S.kind`. All structures of one kind share one perception, and every Thinker instance shares it. A city has 40 "shop"s, each different. |
| A4 | thoughts.js:42 | `inName` special-cases the name 'high sticks' to produce "up …". |
| A5 | thoughts.js:51-61 | `placeWord` and `PLACE` map zone *strings* ('the jungle', 'the wallow', 'the marsh', 'the gully', 'the boulders', 'the overlook', 'the neck', 'the far bank' …) to words. Half the keys are not in today's ZONES (paddock.js:348). The current ones (barn, yard, containers, berm …) map to null. |
| A6 | thoughts.js:107-117 | `_where` landmark logic is "by tree" / "behind rock" / "by rock" / "in ferns", chosen by `obstacle.kind` ('tree' vs anything-not-'wall'). In a city every bollard, car and lamp post is either `wall` (skipped) or would be called "rock". |
| A7 | thoughts.js:252, 430, 440-442 | `s.encl === 'tower'` → "it climb sticks", "go under high sticks", "wait under sticks". The vertical case is named after one kind, not derived. |
| A8 | thoughts.js:309-310 | "wind gone. trees", "water. slow": world assumptions in the musings (minor). |
| A9 | thoughts.js:323-340, 498, 503 | "rock" is the only throwable it has words for. Tied to things.js `KIND.stone`. |
| A10 | mind.js:105, 128, 131, 137, 717, 727, 1474, 1483, 1497, 1736; appraise.js:201, 228 | `c.enclosed.kind !== 'pen'` gates **all** close-contact behaviour (attacks, appraise/test/shadow/prowl, greet, pounce abort, threat-strike). In a city every doorway or arcade that `insideStructure` reports turns the animal harmless. This is a behavioural cliff hung on one name. |
| A11 | mind.js:685 | `U.snap` is allowed only if `enclosed.kind === 'tower' \|\| 'pen'`. |
| A12 | mind.js:1217 | The besiege narration table `{shed, pen, culvert, tower, cleft}` → 'the shed' etc. Every paddock building except the tower and culvert reads "there". |
| A13 | appraise.js:119-121 | `Q.high` = `enclosed.kind === 'tower'` OR (rise > 4 m AND unreachable). The first clause is kind-bound; the second is the generic one and should be the only one. |
| A14 | terrain.js:107 | `insideStructure` special-cases `kind === 'tower'` (counts as inside only if `y > base + 3`). It is the only vertical notion of "inside". |
| A15 | terrain.js:85 | Structures are sorted so that `tower` kinds come first (an ordering hack for overlapping tower/loft). |
| A16 | mind.js:156, 966-1020 (`_peek`, `_route`), 924, 970, 1011 | Obstacle `kind === 'wall'` is skipped and everything else is "rock to go round" (route offset `o.r + 5`). Buildings are walls, so `_route` and `_peek` ignore them and rely on the nav planner downstream. Cars and bins would be "rock". |
| A17 | things.js:8-13, 91-92 | Thing kinds are a closed table (stone, flare, meat, carcass). Obstacle collision is `tree \|\| wall` solid, otherwise "rock" at 0.85 r. |
| A18 | mind.js:446-461, 133-134, 691-696, 2058-2066 | Object meaning comes from kind: `flare` → investigate (light), `meat \| carcass` → feed/trail, `stone` → decoy/trace. Anything else gets want 0.2 and no behaviour. |
| A19 | mind.js:323-347 | Noise semantics by kind: roar/hit/yelp ignored; thunder → "sky"; prey → herd; whistle has its own habituation; shout feeds appraisal; step → footstep model; splash. Traffic, horns, alarms and glass breaking all fall into "noise {W}". |
| A20 | mind.js:866 | `leave` clamps its goal to the literal box ±70 m. |
| A21 | mind.js:55 | `dirWord` uses compass words (north…). Harmless, but the voice talks in world axes, not in the animal's frame. |
| A22 | arena.js:72, 108 | The herd threat model: `big: true` for the rex, `false` for people; alarm noise kind 'prey'. The herd and its pastures (herd.js:13) assume a grazing world. |
| A23 | paddock.js:1-17, 68-82 | The layout itself: named zones, fixed coordinates (river `riverZ`, fence ±99.5, culvert, jetty …). Expected; listed for completeness. |

## B. Generic mechanism, map-specific data (the de-facto data contract)

What a new map must supply today (terrain object `T`), and how each item is used:

| # | API | consumer (file:line) | contract / caveat |
|---|---|---|---|
| B1 | `T.height(x,z)`, `T.normal` | everywhere (rex feet, nav, LOS, belief, things) | **One height per (x,z).** A multi-storey interior or a stair over a void cannot be expressed. |
| B2 | `T.arena` (radius, centred on origin), `T.bound` (square half-size) | mind.js:215, 230, 849, 925, 1003-1004, 1745, 1854; arena.js:36; herd.js:119, 125; nav.js:11, 14; rex.js:495-496 | The world must be a disc or square **centred on (0,0)**. Belief particles, roam goals, herd, spawn and nav extent all derive from it. |
| B3 | `T.obstacles[] {x,z,r,h,kind}`, `T.obstaclesNear` | mind.los :153-156, belief push-out :232, appraise cornered/open :114, herd :118, things :91, victim :115, nav build :19 | Vertical cylinders from the ground up to `h`. No overhangs and no material. `kind` is read (A6, A16). |
| B4 | `T.colliders`, `T.near`, `T.segClear`, `T.pushOut` (with `bot`/`top` slabs) | nav.senseSpotsGen :150-256, rex headRoom :1575, mind besiege :1293 | Fully geometric: the best part of the design. **But mind.los (:146-160) does not use segClear.** It uses obstacles + roofBlocks, so slabs and overhangs block the head planner but not the eyes. Two LOS models that disagree. |
| B5 | `T.structures[] {id,kind,cx,cz,yaw,hw,hd,base,openings[{x,z,nx,nz,w,y}],roof}`, `T.insideStructure(x,z,y)`, `T.roofBlocks` | mind ctx :636-637, habits :607-620, refuge :823-833, search→besiege :860, besiege :879-886, :1312; thoughts | Inside means an oriented **box test**. Openings are hand-authored, not derived. A city block of 30 rooms on 4 floors needs 120 boxes and vertical disambiguation, which only `tower` has. |
| B6 | `T.coverAt`, `T.coverHeight` | mind._coverFor :194-198, belief :241, herd :72/:79, thoughts | Cover = baked vegetation density. Cars, bins, kiosks and shop counters are not cover unless baked into this field. |
| B7 | `T.placeName(x,z)` | thoughts.placeWord, mind._noReach :993 | Zone strings: the thought voice depends on the exact strings (A5). |
| B8 | `T.windAt`, `T.depthAt`, `T.surfaceAt`, `T.speedFactor`, `T.wetAt` | smell :308-312, thoughts calm/wade, nav cost :33, arena wade :75, herd :122 | Optional and geometric enough. A street canyon wind field would plug in. |
| B9 | `T.doors`, `T.stepDoors` | arena :64 | Doors burst by head/chest contact. This is the only "breakable/movable barrier" mechanism. Good seed for an affordance model. |
| B10 | `nav` (2 m grid, `BODY = 2.6`, `MAXSLOPE`, `FOOTDROP`; `reachable`, `nearestOpen`, `clear`, `plan`, `senseGen`) | mind :112, :981-1004, :1223, :1482 | Body-derived and generic. **2-D grid on one surface** (B1), extent from B2. Body constants are hard-coded in nav.js:7 rather than taken from `selfModel`. |
| B11 | `world.light` (scalar), `world.flash`, `things[].bright` | mind :187, :230, :221-225, :453 | One global ambient level plus flares (radius 14 m). Street lights, shopfront glow and headlights cannot exist. |
| B12 | `world.noises[] {x,z,loud,kind}` | mind :321-347 | Planar distance, linear falloff, no occlusion, no reverberation. |
| B13 | `world.agents[]` | mind :286-288, appraise :115 | People only, as reported by victim.js. |
| B14 | `sim.selfModel()` (rex.js:1585) | nav.senseSpots | Fully derived from the body, with no hand-entered numbers. This is the model that the rest should follow. |

## C. Missing concepts a varied world needs

| # | concept | current state | consequence in a city |
|---|---|---|---|
| C1 | **Affordances from geometry × body** (can-fit, can-reach, can-break, can-climb, can-see-through) | Exists piecemeal: nav (fit/slope), `_canReach` (:981), senseSpots (head fit), `shapeAt` (width/height/roofed/under), doors (break). Not unified, not exposed to appraisal or voice. | It cannot reason "doorway too narrow for my body, wide enough for my head", "shopfront glass: can break", "car: can push". |
| C2 | **Vertical reasoning / multi-level space** | Heightfield (B1), 2-D particles, 2-D memories (spots, haunts, exits), one `tower` hack. | Floors collapse onto each other. A person on floor 2 counts as "inside" and "here". Stairs are just slope. Q.high misfires. |
| C3 | **Transparent vs opaque occluders** | Every occluder is opaque (mind.los, segClear, roofBlocks). `mat` tags exist in paddock.js:31 but are dropped in terrain.js colliders. | Glass shopfronts hide people completely and are unbreakable walls. Plausibility needs: see through, smell/hear not through, bump/charge into, break. |
| C4 | **Sound propagation** | Planar, unoccluded, global habituation `mem.noiseHab` (:343), no ambient floor. | Constant traffic saturates `noiseHab`, so it ignores footsteps (wrong). It needs per-source-class habituation, signal-over-ambient masking, and occlusion by walls. |
| C5 | **Moving non-agent objects (vehicles)** | Things are ballistic stones/meat. Obstacles are static (doors aside). Threat/prey are agents or herd. | Cars are invisible to the senses, nav and appraisal. No startle, no chase-or-ignore, no "big moving thing" category. |
| C6 | **Crowds / many agents / target selection** | One belief cloud (`NP = 180`, :46), one `know.target`, picked by `seeChance × 1.6` stickiness (:286-288). The `who` model and appraisal are one at a time. | It flips between whoever is most visible, and the belief collapses to the latest. No "the one that threw", no group appraisal, no singling out the slow or isolated one (apart from the `alone` cue, :115). |
| C7 | **Novelty / neophobia toward unknown object classes** | Unknown thing kinds get `want 0.2`, no fear. Novelty exists only for the intruder (:300) and for noises. | Parked cars, a fountain, a neon sign: no wariness, no investigation curve, no habituation per class. |
| C8 | **Light/sound sources of unknown kind** | Brightness only via flares. Noise kind is an enum. | Street lights do not light anyone. A car alarm is "noise"; there is no "it keeps going, nothing there, ignore". |
| C9 | **Learned place memory** (about places, not about one person's habits) | `spots`, `haunts`, `exits`, `refuges` are wiped in `_forget` (:548). `kind` keeps only person-type stats. | It never learns "that doorway is too small for me", "that alley leads to the courtyard". |
| C10 | **Naming unknown things in the voice** | `nameOf` has a perceived-props path that is unwired (A2). Otherwise "strange place" / "there". | It needs a compositional descriptor from perceived properties (see the proposal below). |
| C11 | **Scale-relative appraisal** | `Q.small = 1` constant (appraise.js:116). Q.open = no obstacle within 12 m (:117). | In a city Q.open is never true, so one vulnerability cue is always lost. Size is never compared, so a horse, a car or a child all read as "small thing". |
| C12 | **Ground surface semantics** | `surfaceAt` 'mud' only, `depthAt` water. | Asphalt vs grass vs glass shards vs stairs: footing, noise of steps and stealth all go unmodelled. |

---

## Proposed minimal architecture change: a Percept / Affordance interface

Principle (already true of `selfModel` and `senseSpots`): **the world describes geometry and physical properties. The mind derives meaning from them relative to its own body. Names never cross the interface.**

### 1. `WorldSense` (implemented by each map; replaces direct `T.*` reads in mind/appraise/thoughts)

```
ray(a, b, channel)        -> { clear: bool, through: [{mat, transmit}] }   // channel: 'sight' | 'sound' | 'scent'
ground(x, z, yHint)       -> { y, normal, surface: {hard, soft, wet, depth, loudness} }   // multi-level: nearest walkable surface at/under yHint
spaceAt(p)                -> { region: id, enclosed: 0..1, roofH, openSky: bool, level: int }   // replaces insideStructure + placeName
openings(region)          -> [{ p, n, width, height, sill, lintel, connects: [regionA, regionB] }]  // derived (portal extraction), not authored
objects(near p, r)        -> [{ id, p, v, size: {w,h,l}, mass, mat, bright, sound, scent, moving: bool, agentLike: bool }]
lightAt(p)                -> lux (ambient + sources, any kind)
ambientSound(p)           -> { level, band }   // the noise floor, for masking
bounds()                  -> polygon / AABB (no origin assumption)
```

Colliders carry `{bot, top, mat, transmit:{sight, sound, scent}, strength}`. Glass is `{sight: 0.9, sound: 0.2, scent: 0, strength: low}`.

### 2. `Affordances` (mind side, pure functions of WorldSense × `selfModel`)

```
fits(opening|gap)   -> 'body' | 'head' | 'none'       (width/height vs body, neck, skull radii)
reach(p)            -> 'jaws' | 'stretch' | 'none'    (generalises _canReach, Q.high)
breakable(collider) -> cost                            (strength vs mass x speed; doors become one case)
climbable(dz, slope)-> bool                            (nav already knows; expose it)
cover(p, for size)  -> 0..1                            (any occluder between eye and p, plus vegetation)
scale(obj)          -> size ratio to self              (feeds Q.small, threat, curiosity)
```

Behaviour gates become affordance gates. `!(enclosed && kind !== 'pen')` becomes "target is behind something my head cannot pass", i.e. `fits(opening) !== 'none' || reach(target) !== 'none'`. `Q.high` becomes `reach(target) === 'none' && target.y - self.y > 4`. Besiege works on `openings(region)`.

### 3. The voice: compositional names from percepts (fixes A1-A9, C10)

A tiny generator maps perceived properties to the animal's lexicon. Rules are evaluated in order and cached per object id or region id, not per kind:

- **Space:** `enclosed > 0.7 & roofed` → "box". If it is huge relative to self → "big box", which is a cave or a building. `!roofed & walls low` → "little walls". `under & narrow` → "pipe". `level > own level` → "up box" / "up high".
- **Object:** a size-ratio word ("small" / "big" / "bigger than me") + material word (`mat` → "shiny" for glass/metal, "stone", "wood", "soft") + motion word ("moving", "loud") + "thing". So a car → "big shiny thing"; a moving car → "big loud thing"; a parked van → "big box thing"; glass → "shiny wall" (it learns "see through. not go through").
- **Landmark (`_where`):** nearest salient object → "by {object word}" / "behind {object word}".
- **Unknowns stay honest:** if no rule fires, the word is "strange thing", and the first meeting queues a surprise thought.
- **Once it has a word, it keeps it:** the word is fixed after first naming. `objMem[id].word` makes the vocabulary consistent and lets it learn ("shiny wall. hit head").

### 4. Smallest set of supporting mechanism changes

- **Per-class habituation and masking:** `noiseHab[kind | sourceId]`, salience = loud − ambient.
- **Novelty per object class:** `objMem` gains `{firstT, cls}`. Salience = novelty × (size ratio) → investigate / avoid curve.
- **Multiple tracks:** N belief clouds (one per `who`, small N), with target selection by appraisal utility rather than by visibility.
- **3-D storage:** particles and memories carry `y` (or `region`/`level`).

---

## Ranked recommendations (value for plausibility ÷ effort)

| rank | change | value | effort | notes |
|---|---|---|---|---|
| 1 | Wire `b.shape` into thoughts `SEEN` and key it by `S.id`, not kind (A2, A3) | med | **tiny** | Fixes "strange place" for every paddock building today. |
| 2 | Replace the `kind !== 'pen'` gates with an affordance test (`fits`/`reach`) (A10, A11, A13) | **high** | low | Removes the behavioural cliff. Needed for any new map. |
| 3 | Unify LOS on `segClear` + collider `transmit` (B4, C3) | high | low-med | Gives glass; ends the eyes-vs-head disagreement. |
| 4 | Per-class noise habituation + ambient masking (C4) | high (city) | low | Without it traffic makes it deaf. |
| 5 | Compositional naming from percepts for structures, objects and landmarks (A1, A5-A7, A12, C10) | high (voice) | med | Removes every name table. |
| 6 | Scale-relative appraisal: `Q.small` from size ratio; `Q.open` from `cover`/openness (C11) | med | low | |
| 7 | Bounds as polygon; drop origin/circle assumptions (B2, A20) | med | low | Mechanical refactor. |
| 8 | Moving objects in `objects()` + novelty/neophobia per class (C5, C7, C8) | high (city) | med | Cars, carts, alarms. |
| 9 | Light field `lightAt` with arbitrary sources (B11) | med | low-med | Street lights, shop glow, headlights. |
| 10 | Multi-track belief + target selection (C6) | high (crowds) | med-high | |
| 11 | Place memory that survives `_forget` (C9) | med | med | Keyed by region/opening id. |
| 12 | Multi-level ground + 3-D nav/particles (B1, C2) | **very high** for interiors | **high** | The one deep change. Heightfield → layered nav (per-level grids joined by stairs/ramps as portals). Until then, keep the rex outdoors and model interiors only as regions it probes into (which besiege already does well). |

Bottom line: items 1-7 are days of work and would make the mind behave sensibly in any single-level outdoor map, including streets with shopfronts it can peer and break into. Items 8-11 make it believable in a busy city. Item 12 is the real cost, and you only need it if the animal itself must go upstairs.
