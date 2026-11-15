# Footfalls: notes

## What it was
`Audio.thump(intensity, dist)` (src/view/audio.js) played ONE pre-rendered take from 4 banks (`foot_{walk,run}_{wet,dry}`, 4-5 takes each, built by audiohybrid.js `footfall` from recordings or by audiosynth.js `footfall`). Bank choice: run if speed>5 or intensity>0.95; wet if `_wetGround()` = rain>0.3 OR mood.wet>0.3. Gain 0.9*g, g=(intensity/0.8)^1.2, +-1.5 dB, pitch +-4%. Same pitch/level family for both feet. Takes are 1.25-1.4 s long.
Each wet take = synth sub thump + `mud_*` sample slowed by 2-7 semitones (0.6 s window, so up to ~1.2 s of slowed mud) + `wetimp_*` (slowed 10-15 semitones, a wet slam) + synth squelch, bubbles, and a "suction as the foot comes out" burst 0.5-0.7 s after the plant. Dry take still carried the `wetimp_` slam layer.

## Cause of the complaint
1. The default mood is "Storm at dusk" (rain=1, wet=1). `_wetGround()` is global weather, not the ground under the foot, so EVERY step on dry grass played the wet take: slowed mud, wetimp and the suction tail.
2. Repetition: only 4-5 takes, random pick with only "not the same twice" (no shuffle bag), pitch +-4%, level +-1.5 dB, no left/right difference, tail of 1.2 s+ that dominates between steps at a steady stride (a long identical-feeling suck every ~1 s).
3. Surface/gait ignored (surfaceAt/wetAt never consulted); stalk steps were just quieter copies.
Judgement from code and durations; I could not listen.

## New design (all in `thump`, synthesised at play time; foot_* banks removed from bankList/HYBRID/TIER so they are no longer rendered)
Wetness comes from the foot position: `terrain.surfaceAt` (water 1, mud 1, marsh 0.85) else `terrain.wetAt` scaled to max 0.35. Rain only "damps" (darker, slightly softer scuff), it never makes a squelch.
Layers (all into the foot's Emitter, so distance gain, air-absorption low-pass, occlusion and reverb send still apply: far steps are a dull thud):
- Weight, every surface: sine falling ~52-66 Hz -> 25-31 Hz over 80 ms (+15% pitch running), decay tau ~0.17 s walk, ~0.10 s run, +wet; a 92-132 Hz knock (audible on small speakers); low-passed noise thud 260-360 Hz; a second softer "toe settle" thump 60-95 ms later (35 ms running). Peak ~0.55 at walking intensity (old take ~0.64), but with far less mid energy.
- Surface (only inside ~60 m, quadratic fade): dry/grass = band-passed noise scuff 70-140 ms plus, when present, a 0.10-0.15 s snip of `crimp_*` (rate 0.8-1.05, hp 300, lp ~2.8k); forest duller (lp 2k); gravel/rock brighter plus 2-4 grit ticks; wet (marsh/mud/wetAt>0.3) = `squish_*`/`mud_*` snip, 0.16-0.26 s, hard fade, rate ~1.05 (pitched UP, not down), gain scaled by wetness, NO suction tail; water = bandpass splash plus a short squish.
- Gait: soft stalk step (intensity<0.4): weight x(0.3+intensity), tau 0.09 s, no toe settle, longer softer (30 ms attack) scuff 200 ms. Walk heavier and longer; run tighter (shorter decay, higher pitch, short toe gap).
Variation: shuffle bags (`_bagPick`) for squish/mud and for crimp, never same twice across refills; per-layer level +-2.5 dB (knock/thump +-2.5 dB), thump pitch +-8%, snip rate +-8-9%, surface layer start offset 4-16 ms after the thump, left foot x0.955 / right x1.045 on thump, knock and filter centres, per-foot emitter pan as before.
Samples used: `crimp_1,3,4,5` (dry), `squish_1-6` and `mud_2,5,8,11,14,17` (wet only). `wetimp_*`, `bone_*` no longer in footfalls. Fern rustle at the foot unchanged except it follows rain damp.
Player steps (`step()`), `rustle()`, roars, etc. untouched. iOS unlock/_wake/media-element code untouched. No changes to main.js or other files.

## Not verified by ear
Levels (thump vs speaker rolloff below ~60 Hz), whether crimp snips sound like scuff rather than crinkle, squish-snip realism, the 60 m surface fade, and whether the soft-stalk threshold (0.4) matches how often the AI stalks. Tune constants in `thump` (0.78 thump gain, 0.15-0.3 surface gains).
## Files
src/view/audio.js (original copy: out/audio/audio.js.orig)
