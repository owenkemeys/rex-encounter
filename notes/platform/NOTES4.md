# NOTES4 — mind/thought/footstep fixes (stalled stalk, flare reuse, barn peril, thought text, footsteps)

Read this first if you take over. Pre-edit copy of src+test: out/platform/notes4/pre/ and a runnable copy at /tmp/n4_before
(may vanish on restart: recreate with `cp -r out/platform/notes4/pre/{src,test} /tmp/n4_before/ && ln -s /home/claude/rex/node_modules /tmp/n4_before/`).
Raw outputs: out/platform/notes4/. Baseline check chain (b_*.txt, b_progress.txt) started 2026-11-15 ~(early) on /tmp/n4_before
with out/platform/notes4/chain.sh <root> <prefix>.

## Steps
- [x] 0 read context; baseline chain started (b_*)
- [x] 1 stalled stalk   (new test: test/watch25.mjs) DONE 04:25, awaiting regression chain
- [x] 2 flare on reuse  (new test: test/flare3.mjs) DONE 04:50
- [x] 4 thought text DONE 04:52 (thoughts all 3: 0 problems, 1260 thoughts, 3.7%; before 0 / 1407 / 3.8%)
- [ ] 3 peril inside structure
- [ ] 5 footsteps

## Item 1 findings
- Repro: `HUNGER=0.78 node test/watch25.mjs 6 120 25 --dart` (darts until the prey reflex fixes, then stands watching at ~22 m).
  BEFORE (pre tree): closes<15 m after 74,74,84,73,74,74 s (median 74); longest still spell beyond 15 m 71 s median (max 81); 0/6 dead.
  Default hunger (opening 0.5): closes 5,20,21,22,19,43 s (median 21); still spell median 16 s, max 40.
- Cause A (bug): prowl stalk phase at b.t > 30 with go.go and d > rushD+6 goes to 'set', whose rule sends it back to 'stalk'
  when d > rushD+6: ping-pong every tick, frozen at ~21 m until the prowl times out (70 s).
- Cause B: stalk behaviour (`case 'stalk'`) and prowl stalk freeze (`hold`) while watched with no limit (stalk dur ~16 s, re-chosen).
- FIX (mind.js): `_watchedApproach` (freeze while watched; patience (6.5-4H)(0.7+0.6 patience)/(1+watchAcc/25) x 0.75^n, 1.2-8 s;
  then 'cover' (a point on the way in out of the watcher's sight), 'arc' (sidestep 0.4-0.7 rad while closing 3-5 m) or 'open'
  (straight in 1.0-1.7 m/s with `_openTell`: head low, loud breath, huff then rumble more often as it nears); each move ends in a
  freeze again). Used by stalk (creep) and prowl stalk phase. Prowl ping-pong fixed (set only from inside rushD+6; beyond, `press`
  = open approach). Thoughts: 'waMode' edge (thoughts.js, cond wa:<mode>, test atom added in thoughts.mjs); prowlM musing no
  longer says "it not see me" while watched.
- AFTER: hungry (0.78) closes 17,11,12,11,11,21 s (median 12; before 74); still spell median 4 s max 5 (before 71/81); dead 5/6
  in 120 s (before 0/6), each after set->rush. Default hunger: closes median 14 s (before 21), still spell median 6 max 14 (before
  16/40), dead 3/6 (before 4/6). First-encounter (no dart) unchanged: 7 s, spell 2 s.
## Item 2 findings
- `node test/flare3.mjs 4 20` BEFORE: flare1 head turned 1/4, flare2 2/4, flare3 2/4; dwell medians 0.0/0.6/6.6 s; left goal 1/4,1/4,2/4.
  The probe locks the look (I.look lock) and absorbs attention (0.6+arousal), so the flare's obj salience (~0.48) never glances.
  There is no orienting reflex for objects (only for sounds, mind.js ~582).

## Needs from the body
(none yet)

## Item 2 fix
- mind.js `_orientObj` (called per object in _perceiveWorld): first sight of a bright / moving / smelly thing always gives an
  att glance (interrupt if novelty > 0.6, else look) + orient gesture; hold lerp(4, 1.2, h/0.8) s, counted from landing; the look
  follows it in flight. Habituation `mem.objHab[sig]` by properties (bright, smelly, moving), +0.4(1-h) per new thing, wears off
  over 240 s. Novelty > 0.6 opens the commitment. U.investigate x (0.3+0.7 nov) + 0.8 max(0,nov-0.5) e^(-t/10). During the beat the
  body faces it if > 0.45 rad round, and a sniff's I.probe pauses (mind.js after att.gaze). attend.js `_glance(key, level, hold)`.
- AFTER (flare3 4 seeds): turned 4/4, 4/4, 4/4 (before 1/4, 2/4, 2/4); dwell 8.0 / 3.6 / 2.0 s (before 0.0 / 0.6 / 6.6); left goal
  3/4, 1/4, 1/4 (before 1/4, 1/4, 2/4). Thoughts: 'orient' edge (known kind: "bright thing again" / "bright thing. so what").
## Item 4
- besiege probe/wait phase lines replaced (thoughts.js _phase): no "head in hole"/"push head in"/"wait by hole".
- noise attribution: mind noise loop sets lastNoise.obj when a thud comes from where a thing it saw flying (3 s) or lying (1 s)
  is; atYou excludes it; thoughts noise branch names the thing ("bright thing land"). Checked: flare dropped 3 m in front of the
  player -> lastNoise.obj set 6/6 seeds.
- After-chain for items 1,2,4: snapshot /tmp/n4_a (copy of src/sim in notes4/snap_a), outputs a_*.txt.

## Restart ~05:05; state at 05:30
- After-chain (items 1,2,4; a_*): platform exit 0, stuckopen exit 0 (0 in open ground; stuck events 8 -> 3), review exit 0 (same
  warnings), commit exit 0, thoughts 0 problems. peril.mjs 6 rerun on live tree (a_peril.txt, in flight at 05:30). Build ok.
- commit.mjs (3 seeds, before -> after): still deaths 3/3 -> 1/3, flee 1/2 -> 0/2, peek 1/3 -> 0/3, food_dart 0/2 -> 2/2.
  Isolation run: /tmp/n4_mix = live tree with PRE mind files (so only the other agent's rex.js changes): flee 3/6, still 5/7,
  food_dart 2/6 (6 seeds). Same scripts on the live tree running (compare).
## Item 5 (footsteps) IN PROGRESS, not finished
- Harness: test/audio_feet.js + test/audio_feet.py (headless Chrome OfflineAudioContext through the real graph); outputs in
  out/audio/feet/ and notes4/feet_*.txt. `python3 test/audio_feet.py <tag> <rain 0|1> [root]`.
- BEFORE (day, 400 ms RMS dBFS; hp250 = above 250 Hz): rex run 12 m total -19.9 but 86% below 60 Hz, hp250 -47.1 (bed -44.7:
  inaudible on small speakers); huff 12 m hp250 -41.7, roar 25 m hp250 -28.8; your run step hp100 -19.4 (13 dB over a running rex
  at 12 m above 100 Hz), peak -2.8; in rain every step is the step_wet bank (resonant band + 4 bubbles).
- audio.js edits so far: thump: weight (0.42+0.18 run), sub sine x0.5, new body thud band 200-290 Hz (gain (1.6+4.5 run)(0.45+0.55
  prox)) and ground crack 650-1000 Hz for runs, knock + 0.25 run prox. step(): rebuilt per step (dull heel/toe low-passed bursts,
  quiet surface scuff, squelch only mud/marsh/water on 35-85% of steps, no bubbles; not driven by rain). Last render with the
  latest gains was interrupted: RERUN `python3 test/audio_feet.py after 0` and tune; target rex run 12 m hp250 >= huff 12 m,
  your run step hp100 ~ -33..-36.
- Needs from main.js (not mine): camera fx.kick per rex footfall should scale with rex speed and 1/distance (felt at < ~15 m
  running), none walking beyond ~20 m.
## Item 3 (barn peril): NOT STARTED.
- 05:45 verification done for 1,2,4: peril.mjs 6 after: 6 FAIL (before 7): torch 4/6 -> 5/6 (passes now), rocks 3/6 -> 2/6,
  run15 2/6 -> 1/6, strike timing 283/233/208 -> 408/358/292 ms (body/strike: rex.js changed by the other agent; not mine, not
  isolated). commit flee/still/food_dart 6 seeds: live 4/6, 5/7, 2/6 vs live-with-pre-mind 3/6, 5/7, 2/6: no loss from mine.
  Reported to coordinator. audio.js (item 5) is mid-tune and unverified: do not ship it (pre copy notes4/pre/src/view/audio.js).

## Item 5 DONE (06:10) - audio.js ready to ship
- Final audio.js: thump body/crack as above; player step pow-0.6 gain curve (walk ~5 dB under run).
- Day (feet_after_day.txt, 400 ms RMS, dBFS): rex run 12 m above 250 Hz -34.0 (before -47.1); bed -44.7; huff 12 m -35.5; roar
  25 m -31.6; your run step on grass above 250 Hz -40.5 (before -26.0), above 100 Hz -39.4 (before -19.4), peak -19.4 (before
  -2.8); walk -47.0 above 100 Hz (before -23.8). Rex run 12 m share 60-250 Hz 37% (before 14%), below 60 Hz 57% (before 86%).
- Storm (feet_after_storm.txt): bed -39.8 above 250 Hz; rex run 12 m -32.9; your steps -37..-38.5 on every surface, no squelch
  layer except mud/marsh/water (the sub in the mud/marsh/huff segments is thunder in the storm bed, present before too).
- Per-step variation: RMS spread 2-8 dB, centroid spread 120-2000 Hz across 4-10 steps (before: one bank take, step_wet in rain).
- Not done: listening; the limiter (-3 dBFS) is touched by a run at 6-12 m (peak -2.2..-2.9).
## For the body agent: an arousal it can read (b)
- No new output needed. rex.js already gets the intent each step: `intent.burst` (true at the start of a rush or chase),
  `intent.pace` (m/s asked; > 6 is a run at something), `intent.agitation` (0..1). For one scalar, read the mind directly:
  `mind.ap.arousal` (0..1, the prey reflex worked up by the target) or `mind.pd.k` (0..1, the chase reflex filling; 1 = launch),
  and `mind.beh.name` in {'pounce','prowl'(phase 'rush'),'chase'} for "chasing now".

## 06:20 resumed: item 3 (barn/loft peril) + footfall peaks (-6 dBFS at 6 m) + wall-contact sound/thought
- owner's spot (46.2,68.5) is inside the Loft, not the barn.
- 06:45 footfall peaks: sub 0.32 th; part of the body thud as a falling 210-270 Hz tone; crack 0.9; whole thump x(0.36+0.64
  sstep(4,20,d)). Day: run 6 m peak -5.3 dBFS (was -2.2), 12 m -6.0 (was -2.9); 12 m above 250 Hz -35.2 (bed -44.7, huff 12 m
  -39.8, your run step -40.2). notes4/feet_after3_day.txt.
- contact sound: audio.js `contact(e, dist)` (material of the nearest structure: wood knock / metal clang / hard click / soft
  scrape below ~0.4 m/s) and a per-frame detector on sim.headTouch.kn (works without main.js). Needs from main.js (not mine):
  route `e.type === 'contact'` to `audio.contact(e, dist)` for the true force; the detector then stands aside (0.15 s).
- bump thought: mind.mem.bump on headTouch.kn reset; thoughts 'bump' ("hard there", "bump! hard"), cond 'bump' (test atom added).
- item 3 starting.
- item 3 test: test/hideout.mjs (walk in in view, stay 300 s, walk out the nearest barn door and away 30 m at 1.6 m/s; barn hide
  (22,66.5) and loft (46.2,68.5) up via the ladder). Pre-item-3 tree: /tmp/n4_pre3 (copy of sim in notes4/pre3). Baseline
  running -> notes4/h_before.txt. Trial s1: barn got away (1 way tried), loft got away (2 tried); on leaving it probes/sniffs him.
- BEFORE (h_before.txt, 4 seeds, old metric): barn caught 2/4 (33-39 s after setting off: by the probe's reach out in the open,
  not at the door), loft 0/4; ways tried barn 1,1,1,1, loft 2,4,5,3; at the door it was mostly 'probe' 2.5-6 m off (sniffs him).
- item 3 edits (mind.js): planner bias away from ways already used (mem.siege.used, 3 min); siege memory mem.siege {id, who, T};
  wait phase beside the way out nearest you, out of the doorway's line, breathing, huff/rumble every 5-10 s, patience x(1+2H);
  besiege dur cap 90+120H; besieged-utility decay /(240(1+2H)); `_siegeAmbush` (came out < 8 s ago, besieged >= 25 s, within
  rushD+5, hungry > 0.45 or H > 0.15 or grudge): prowl 'set' (still tell) then rush; _preyGo amb. Test metric now splits taken
  while hiding / caught leaving (from setting off). bump thought cool 25 s.
- 06:48 URGENT FIX (mind.js, ready to ship with the rest): behaviours about you read know.target every tick; with
  the target gone mid-behaviour (saltline runner/3) display threw on a.x. Now _run ends any behaviour in NEEDS_TARGET (watch, stalk,
  circle, inspect, display, bluff, chase, snap, feign, backoff, nudge, avoid, guard, probe, appraise, test, shadow, prowl, pounce,
  attacks, friendly ones) when there is no target: b.done, look at the belief, thought 'Where did it go?'; the next decision picks.
  Check /tmp/nulltgt.mjs (each behaviour started then run 60 ticks with target null): before 20+ behaviours threw (watch, stalk,
  circle, inspect, display, bluff, chase, snap, nudge, appraise, test, ...), after 0 of 40. saltline runner (3 seeds) no hard
  failures (it did not throw for me on seed 3 before the fix either, on this tree).
- contact event: body emits {type:'contact', part, surface, force, x,y,z, normal}. audio.contact(e, dist) takes it (force -> level,
  surface/structure material -> timbre). main.js does not route it yet (not my file): add
  `else if (e.type === 'contact') audio.contact(e, dist);` in the sim-event branch. Until then audio picks touches off
  sim.headTouch per frame (estimated force from headPress). The mind's bump thought reads sim.headTouch (events never reach it).
- 08:xx item 3 more: wait-at-exit watches ground ways out (a raised floor inside a bigger structure: that structure's doors);
  prowl 'set' no longer stalls turning against a wall (goes after setDur+1.5 s); set strikes when squared (0.5 rad), clear and in
  reach. hideout BEFORE (h_before2): barn caught 2/4 (37-43 s after setting off, by the probe's reach out in the open), loft 0/4;
  snout got in barn 1,1,1,1 / loft 1,2,3,3 places; doors/hatches tried loft 2,4,5,3. AFTER (h_after6): barn 3/4 (3.7, 11, 30 s),
  loft 0/4 but the ambush sprang in 3/4 at 2.5-4.6 m and the strike missed (1.4-2.9 m); snout got in barn 1,2,2,1 / loft 3,2,2,3;
  tried loft 4,3,4,5; taken while hiding 0/8 both. Besiege share of the stay 78-100% (before 47-88%).
## Needs from the body
- strikes on a person walking past at 1.4-3 m miss (peril._strike -> sim.gesture('strike')): too close for the jaws? (hideout loft)
- Regression chain on the item-3 tree started (c_*).
- 08:20 item 3 VERIFIED (chain c_* on snapshot /tmp/n4_c = notes4/snap_c_sim + besiege null-S guard): platform exit 0, stuckopen
  exit 0 (0 in open), review exit 0 (same warnings), commit exit 0, thoughts all 3: 0 problems, 1244 thoughts, 4.5% repeats
  (after 1,2,4: 3.7%); a crash found and fixed on the way (besiege started with no structure read b.S.id: guard). peril.mjs 6:
  5 FAIL (was 6): rocks 2/6 -> 4/6, attentive 2/6 -> 1/6, run15 1/6 -> 2/6, hide 0/6; strike timing 467/417/333 ms (body).
  Build ok. Report sent.
- 08:40 job: search unstick move<->back-off cycle (BODY4 Needs from the mind). Pre tree /tmp/n4_s0 (sim in notes4/s0); saltline before -> notes4/salt_before.txt
- saltline BEFORE (salt_before.txt): HARD crouch/3 stall 50 s, noise/3 59 s, quiet/3 23 s. Cause seen in crouch/3: _unstick's
  three-point turn (goal > 1.2 rad round, tight) re-decided every tick: forward <-> back each ~1.5-2.5 s, rocking.
- Fix (mind.js _unstick/_hemmed): three-point turn commits (back until hips 1 m after >= 1.5 s, or 3 s), then >= 2.5 s forward
  before another; the steer side flips if a back-off did not bring the nose round; a 3rd turn with < 0.4 rad gained marks that
  spot sore and re-plans (a search/roam gives the spot up). _hemmed: only the body's headJam counts (no light headPress).
  Single runs after: noise/3 7 s, quiet/3 3 s, crouch/3 15 s (no hard failures). Full saltline/stuckopen/platform running (s1_*).
- 09:xx AFTER (salt_after.txt, s1 snapshot = notes4/s1_sim): saltline no hard failures, exit 0: crouch/3 15 s, noise/3 7 s,
  quiet/3 3 s (before 50/59/23); others unchanged (max 4 s). stuckopen exit 0 (0 in open ground). platform exit 0 (29 ok).
- 09:30 job: (1) probe/shove aims through planks at the Loft doorway -> aim at an opening; (2) torso/hips crash thought + beat of surprise.
- 10:20 jobs (1)(2) state: mind.js `_viaGap` (core probe head goes via a gap with a clear line to you when blocked; body stands
  off the gap; no gap: head held off), besiege go: looks where it walks / at the gap when the wall is between; besiege probe:
  pressed and no nearer the gap for 2.5 s -> next place. Crash: mind reads sim.crashS (t reset, dur ~ closing speed): mem.crash,
  'crash' thought (cool 20 s), crashBeat (breath caught, alert, slows, huff) except in chase/pounce/rush/handling/attacks.
  probe.mjs: --hide=x,z and 'wall press by gap' column (PRESSBY=1 breakdown). Before (pr_before_*): Loft eye 17/181 snout 21/89
  press 32/36; Barn eye 29/241 snout 21/208 press 37/74. After with 1.5 s: Loft 26/227, 19/131, 31/36; Barn 17/161, 11/113,
  25/42. With 2.5 s (final): Barn 25/192, 16/172, 37/52; Loft rerun pending (killed). Checks were killed: rerunning (p2_*).
- 11:00 jobs (1)(2) DONE. Final (snapshot notes4/p2_sim): Loft (hide 46.2,68.5) eye at opening 29/244 n/s (before 17/181), snout
  in 22/150 (21/89), wall press by a gap 31/36 (32/36: unchanged, mostly the snort at the gap mouth and the head drawing back);
  Barn eye 25/192 (29/241), snout 16/172 (21/208), press 37/52 (37/74). Found+fixed: feed's guard sub read a null target
  (thoughts active:tapper crashed). Checks: platform exit 0, stuckopen exit 0, saltline no hard failures (crouch 15, noise 7,
  quiet 3 s), thoughts all 3: 0 problems, 1233 thoughts, 3.7%. Crash beat/thought not measured (no scripted crash).
