# Odd loud sounds: investigation and fixes

Owner report: loud odd sounds with no visible cause, just starting the game and standing still, usually as the rex starts looking at you.
I cannot hear. Everything below is from instrumentation (every AudioBufferSource/Oscillator start logged with the audio method, game state and
sim events, plus an AnalyserNode on `audio.out` recording the true output peak every 60 ms). Two headless loads (before, after) with `S.noRender=true`
so the sim runs in real time (a rendered swiftshader run only reached 5 s of sim in 120 s). Scratch files: `out/audio/odd/` (hook.js, run.py,
log_before2.json, log_after.json). Backup of the original: `out/audio/audio.js.orig_odd`. Only `src/view/audio.js` was edited; main.js untouched.

## Caveat on the log
My "peak gain" column is only the chain gain (emitter x bus x master); envelope gains read as 1.0 so it overstates footfalls. The output-analyser peak is the
reliable figure. Sample loudness: node render of each voice (rms of loudest 400 ms): roar .36, growl .36, rumble .31, huff .14, sniff .11, shout .25,
alarm .22, bird .26, thunder near/mid/far .14/.24/.37. Effective voice loudness before = gain x level: growl .55x.33 = .18, roar .42x.26 = .11,
rumble .40x.23-.31 = .09-.12, sniff .65x.09 = .06, huff .6x.12 = .07.

## Before: loud events in 120 s of standing still (sim 117 s)
Output peak over the run: 0.50. Clusters above 0.25 (output peak, cause, game state):
| t (s) | out peak | cause | state |
|---|---|---|---|
| 28.6-31 | .46 | thunder(0.87) (lightning, near bank, gain .85) | rex `search`, 10 m |
| 47 | .33 | thunder(2.27) | search, 16 m |
| 56 | .33 | thunder(1.53) | listen/sniff, 16 m |
| 73-75 | .41 | rex footfalls (weight layer) + sniff voice at 5.3 m (gain .76) | search, 5 m, v 1.26 |
| 78-85 | .50 | footfalls at 2-3 m (weight sine, soft steps i=.28-.42) + sniff at 3.5 m (gain .8) | search, 1.3-5 m |
| 92 | .35 | thunder(2.17) | ambush, 4 m then 26 m |
| 125 | .42 | thunder(2.07) | leave |
Every other sound started: footfalls at 12-30 m (out .1-.25), 13 sniffs (gain .55-.8, `search` state, at 9-30 m), 2 huffs at 27-31 m, far thunder rolls.
No sound was positioned at the origin, no fallback synth doubled a recording (stand-ins are replaced when the recordings arrive; durations show the recordings
were in use), no repeating flicker (act-gestures fired once each), no UI chime, no VHS/mood sound, no opening sound beyond what the sim generates.
Rex never entered a TENSE state (stalk/stare/watch...) for more than ~5 s in this run, so the rumble path did not fire; it is analysed from code (below).

## Causes (file: audio.js, line numbers before the edits are in the backup)
1. Footfall "weight" layer (thump, now line 563): `th = 0.78 * lvl * wk`. My estimate: the decaying sine alone is ~3x the RMS of the old bank footfall
   at equal intensity (0.26*lvl vs 0.086*lvl), with only 1/D falloff, so a walking rex at 15-30 m still thumps every second.
2. Idle voices in `_frame` (now lines ~801-807): a "rumble" (alligator-bellow recording) every 10-24 s in ANY tense state (stalk, stare, watch, ambush, inspect...)
   at distances up to 80 m, with no check that the animal is in view; sniff (alligator-hiss/creature recording) every 2.5-6.5 s up to 45 m, gain up to .8. These
   are exactly "the rex has started looking at you" states and need no visible gesture. This is the most likely owner-reported cause (could not be reproduced
   in the one 120 s run since the rex never stayed tense).
3. `growl` (line 608) gain .55 on a recording normalised to .33: louder than the roar (.11) that the file comments reserve as "kept low".
4. `breath()` ran `_frame` before clearing `this.src` (line 625): voices placed by `_frame` (sniff, rumble, gestures) could be pulled to the position of the last sim
   event of that frame (`_where` uses `src` when its distance is within 3 m of the voice's).
5. `thud` (line 647): `min(1, 0.7 + gain)`: a tiny or distant impact was still 70% before emitter attenuation.
Checked and found fine in the log: stone impact synth (no stone events fired at idle), herd/bird calls (attenuated by emitter distance, only flurry/alarm at 130+ m),
vocal samples for roar/huff/growl (events only at matching gestures), thunder (lightning bolt and sky flash accompany it; left alone).

## Fixes
1. Weight layer: `0.42` (cap .55) and a further fade to 55% between 12 and 60 m.
2. Idle sniff and rumble only when the head is within 10 m or inside the forward cone (dot > 0.3); sniff d<30, gain .5, every 3-8 s; rumble d<45, gain .26,
   every 16-36 s, only after 8 s continuously in a tense state and 6 s since any vocal.
3. growl gain .36.
4. `breath()` clears `src` first.
5. `thud`: `0.3 + 0.7 * clamp(gain, 0, 1)` (full impact still 1.0).

## After (125 s, sim 126 s, the same start; random trajectory differs)
Output peak 0.41 overall (before 0.50); first 70 s natural: 0.39 (before .46). Peaks above .3 in the after run are now all thunder (t 28, 45, 53, 74, 87, 103, 120, 128 s,
every 12-25 s) and one at 74-75 s. Sniffs: 16 in 125 s (gain .42-.7: .7 values were my forced `watch/sniff` window), rumble: 1 in 50 s of forced `watch` (old logic: every 10-24 s at .4),
no growls/roars other than one roar at 31 m from the rex `answer` state (gain .45, a real event).
Forced test (70-100 s `audio.mind` faked as `watch`): rumble fired once at 108.9 s at 34 m, gain .27, after the rex came into the forward cone. My attempt to turn the camera away
did not work (camera yaw moved 0.1 rad only), so "behind you stays silent" is verified by code reading only.

## Could not determine without ears
- Whether thunder is the owner's "odd loud sound": it is the loudest thing left (out .3-.4 every 12-25 s) and comes with a visible flash/bolt only if you face it; I did not change it.
  If it is, lower `thunder` base levels (.85/.65/.45) or lightning rate (world.js, not mine to edit).
- Whether the footfall thump at the new level feels right (judgement: ~-5 dB; sine is mostly felt on laptop speakers).
- Whether sniff/huff (alligator-hiss recordings) read as "odd" in themselves rather than too loud; they are unchanged in character.
- Behaviours not reached in my runs (stare/watch for a long time, growl/worry, strike scream, birds flushed near).
