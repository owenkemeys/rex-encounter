# Stone impacts: notes

## What it was
`Audio.stoneHit(dist)` played one of 4 pre-rendered takes of audiosynth.js `impact({kind:'stone'})`, the same for every surface (ground, wall, rock, water, mud), every bounce.
Each take: modal partials at f = 1.8-3.2 kHz, then 1.7f and 2.6f, each a pure decaying sine (tau 4-10 ms), plus ~70% of the time a second "ting" 60-140 ms later at 1.1f and 2f. A noise click only 4 ms long, and a low brown-noise thump.
Why a glockenspiel: a few clean sine partials in the musical 2-8 kHz range that read as a pitch, an inharmonic-bell ratio set that sounds like a struck bar, and a doubled ring. The click was tiny, so the tone dominated. Only 4 takes, so the same "notes" repeated. Judgement from the code; I could not listen.

## New design (synthesised at play time in `stoneHit(dist, ev)`; the 'stone' bank is removed from bankList/TIER so it is no longer rendered)
Material comes from `_hitSurface(x,y,z)`: the sim's impact event has only position, speed and `first`, so I infer it from terrain. Stone more than 0.3 m above `terrain.height` and within 0.7 m of an obstacle (`obstaclesNear`): tree trunk = timber (lower), outcrop = rock, wall/post = the wall's `mat` tag from its structure (`timber`, `steel`, `container`, `concrete`/`block`, `hay` = soft). Otherwise the ground: `surfaceAt` water / mud+marsh / rock / gravel / forest (leaf litter), inside a non-timber structure = concrete floor, else earth.
Every hit: a click (highpass noise 6-10 ms, brighter and louder on stone, quiet on earth, none on water/mud). Level and brightness scale with `ev.speed` (v = (speed-1.1)/11), +-2.5 dB, pitch +-10%, filter +-12%; beyond ~20 m the high layers fade and dull (the Emitter still applies distance gain, air low-pass, occlusion, reverb).
- Earth / hay: low-passed noise thud 320-480 Hz 50-80 ms, a 105 -> 48 Hz thump, tau ~16-22 ms (no ring); on leaf litter or 35% of other hits a 70 ms `crimp_*` snip (low-passed 2.2 kHz, quiet).
- Rock, gravel, concrete: clack = band-passed noise (rock 2-4 kHz, concrete 1.5-3 kHz, 22-35 ms) plus a second band at 1.55-2.05x, offset by 1.5-4.5 ms, plus a small low body; concrete adds a 150-210 Hz knock (12 ms); gravel adds 2-4 grit ticks; hard rock hits (v>0.45) add a 45 ms `bone_*` snip pitched up 1.5-2x, very quiet.
- Timber: three damped inharmonic modes (f0 210-315 Hz, trunk 130-195; ratios 1, ~2.4, ~3.9; tau 18/12/8 ms) plus a 900 Hz noise tick; harder hits add a quiet `bone_*` snip.
- Sheet steel / container: 5 inharmonic modes (ratios 1, ~1.65, ~2.2, ~2.9, ~3.7; capped at 3.2 kHz), first three doubled with 0.7-2% detune (beating), per-mode tau shortening up (sheet 50-110 ms, container 120-220 ms, shorter on soft hits), a 3.2 kHz noise strike and 3-7 band-passed rattle pulses over ~0.15-0.3 s. Fewer modes on low-end devices or when voices are tight.
- Water: a rising bubble tone (320-700 Hz -> x2.3 in 40 ms, tau 20 ms), splash noise 0.12-0.22 s, low body, a second small plop on harder hits.
- Mud / marsh: low-passed slap, 90 Hz thump, band-passed noise, plus a 0.12-0.18 s `squish_*`/`mud_*` snip (shuffle bag).
- Skitter: first strike (`e.first`), speed > 3, on hard ground (rock/gravel/concrete floor): 1-3 quiet ticks (bandpassed noise 12-20 ms) at ~0.07-0.12 s, shrinking ~30% each, each 0.6x the last. The sim already emits real bounce events (speed >= 1.1) which now each get their own full sound, so these ticks only fill in the very fast chatter.
- Animal body: unchanged. A stone striking the animal is the sim's `hit` event, which main.js sends to `audio.smack` (crimp/wetimp hybrid), never to `stoneHit`.
Shuffle bags (`_bagPick`) for crimp, bone and wet snips. Loudness: master 0.6 x (0.18 + 0.82 v^0.8).

## Not verified by ear
Everything. Levels against the footfalls and thrown-stone loudness (constant `0.6` in `stoneHit`); whether the clack bands read as stone rather than hiss; whether the bone_* snips sound like cracking bone (they are quiet, delete the two `clip('bone_'...)` lines if so); the timber and container mode frequencies; whether the steel clang still sounds slightly musical (lower the tau or the detune pairs); the 20-110 m distance fade; wet/muddy realism.
Material inference is a guess in places: wall `mat` is read from paddock.js walls, the "concrete floor inside non-timber structures" rule is an assumption, the barn floor counts as earth, and a stone that hits a wall just above the ground (within 0.3 m) is treated as ground. Rock outcrop vs "structure rock" cannot be told apart. Clean fix: have `things._impact` (src/sim/things.js, not touched) add `mat`/`surf` to the event; `_hitSurface` is the only place to swap.

## Files
src/view/audio.js (new `_hitSurface`, `_tone`, `stoneHit`; 'stone' bank removed; original copy: out/audio/audio.js.orig_rocks)
src/main.js (one line: `audio.stoneHit(at, e)` passes the impact event)
Build check: `npx esbuild src/main.js --bundle --format=esm --minify --outfile=/tmp/app_rocks.js` passes.
