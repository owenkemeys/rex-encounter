# TUNE — fairness tuning of the commitment/prey-reflex mind

Status: step 0 started (backup of pre-edit files in out/platform/tune/pre/).

## Log
- step 0: created this file, backed up mind files.
- step 1 (re-measure): `node test/commit.mjs all --quiet --save tune_before` on the merged tree done: out/platform/tune/before_commit.txt
  (deaths: dart 3/3 at 53/90/40 s, hop 2/4, rocks 4/4, lure 4/4, flare 2/2, threat 4/4, walkpast 1/2 (135 s), still 0/3 but foreign
  still fixated 84 s on a person standing still: vanish counted for a still person).
- step 1b: test/commit.mjs extended: FAIR scripts (still10 still6 slowwalk backoff dartcalm run5 walk38) and `--fairness` report;
  fairness baseline on the merged tree running -> out/platform/tune/fair_before.txt
- step 1c: fairness baseline done (out/platform/tune/fair_before.txt): slowwalk 5/6 deaths, still10 1/6, still6 2/6, dartcalm 4/6
  (calm calls off 11/23), run5 4/6 (strike lands; aim not the problem), walk38 3/6 deaths in the first 70 s (a 3.8 m/s walk is "quick").
- step 2 (in progress): edits made: appraise._signature (quick relative to own run speed; bob; vanish needs movement, distance
  falloff, slow walk counts half; peek needs stop/reversal), ap.Hn (hunger-only hunt drive), mind prowl gated by _preyGo
  (rushK / hungerGo / bolt; holds at rushD+holdD; called off when the reflex drains), prowl and pounce rushes end in the peril
  strike (no grab fallback), c.running scaled to own run speed; attend glance sets mind.orientTo (task 5a).
- step 2b: hungerGo 0.35 -> 0.6 (slow walkers were killed by hunger-only stalks at hunger 0.73); close bolt (flee signature inside
  boltD 10 m, seen within 0.1 s) fills the chase reflex at once; inside reach+boltStrike it is the peril strike at once, else a
  pounce with a 0.25 s lock that a lagging speed estimate cannot defuse; peril gives no warnings while a chase/rush is under way.
  run5 now walks in to 5 m before running. FINDING: from 5-6 m the strike launches within ~0.2 s but misses a sprinting person
  (jaws close 0.2 s after launch, reach ~6.3 m, body 0->8 m/s in ~2 s, exertion saturates in ~5 s at 8 m/s): the limit is the
  body (rex.js, not mine), not the aim.
- step 2c: ambush/shadow springs gated by _preyGo; leadT 8 s min fixation before a reflex rush; boltD 10->8; bob 0.03->0.015
- step 3 (peek): peek/hidden start moved to play distance (rex ~20 m from the cover's near face; was 42-45 m from the hiding
  place, beyond vanishD, where it saw 0-2 glimpses in 150 s); sight priming (`prime`): evidence of a thing showing where it went
  out of sight builds (1 + prime*arousal) times faster; a dash out of view (> 0.35 run speed) counts fully. Traced: at close range
  the animal's head (4-5 m up) sees over/around the containers for long stretches, so the "hider" is mostly in view: the vanish
  events are few. Not solved in the time box (see Unfinished).
- step 5: pause with you in view turns its body to you when you are > 1.2 rad round; peril stare/lower faces you when > 0.5 rad off (was: frozen with the head straining behind)
- step 4: test/predator.mjs matrix: the two hunger-only fed checks rewritten (fed + a person who never bolts: mostly curious,
  no predatory, never takes or kills; fed: no catch-and-release). Grab removed at source: prowl and pounce rushes end in the peril
  strike (a kill) and never in a seize, so a fed animal's take is a kill.
- step 6: verification chain started -> out/platform/tune/verify/*.txt
