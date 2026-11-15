# Crashes that read (2026-11-15, after the move to GitHub)

Open item 1 in AGENTS.md: "Crashes do not read." What was found and what changed. Nothing here has been seen in motion or heard
by the owner yet; the checks are numbers, still frames from the real page, and rendered audio.

## The finding that explains most of the owner's report

`_crash` counted its 0.45 s gap between knocks in ticks of contact, not on the clock. After the animal's first crash of a
session the counter only moved while the trunk was touching something, so later trunk crashes went unanswered: no lean, no
speed loss, no `contact` event, so no sound, dust or camera kick. The owner ran Head-on first, then Glancing and Corner:
"the sound only played once, in the head on case ... in the other scenarios i couldnt tell that anything happened at all".
`node test/crashread.mjs` runs each crash test twice in one sim; before the fix the second corner and post runs printed
NO KNOCK. Fixed (`C.at`, clock time); `reset()` clears the crash state.

Second: the slide in `_bodyCollide` rebuilt the speed from the velocity taken before `_crash`, so the speed a glancing knock
took was put straight back. A corner clipped at a run was a slow sag from 8.7 to 1.7 m/s over two seconds, not a jolt.

## What the body does now (src/sim/rex.js `_crash`, tunables in species `crash`)

- Head-on (closing > 2.5 m/s, full from 6.5): it reels. Eyes shut on the blow, head thrown up and back (the startle's own
  machinery, flagged `act.crash`, no 'startle' event), a shove back off the surface, then it backs off at 0.4-0.9 m/s for
  0.35-0.7 s, shakes its head, stands a beat, and gathers itself. At 7.4 m/s into the Containers: hips back 1.7 m, snout
  2.6 m back and 1.2 m up; snout within 0.5 m of where it struck for 0.2 s (was 1.1-2.0 s: "its head just butted against it").
- Glancing / corner: a jolt. Speed drops at once (corner at 8.7 m/s: to 5.6) and recovers from there; roll toward the
  surface 0.29 rad (was 0.15), chest drops, head rocked, thrown back off the surface 0.2 s later.
  Cost is no worse: test/corner.mjs chase reaches in 9.5 s (was 10.1), man round the corner falls back 0.87 s (was 0.81).

## Sound (src/view/audio.js `contact`), measured with test/crash_audio.py

| hit at 12 m | before: share above 300 Hz, tone | after |
|---|---|---|
| container, heavy | 0.00, 0.55 at 57 Hz | 0.50, 0.05 |
| container, light | 0.94, 0.72 at 427 Hz | 0.56, 0.07 |
| barn, heavy | 0.16, 0.33 (and 15 dB down) | 0.51, 0.12, level with the others |
| gate (concrete, "good") | 0.56, 0.06 | unchanged |

"Tone" is the share of the tail's energy in its strongest 1/12 octave: noise is about 0.05-0.15. The container was six
ringing oscillators (and three sine partials for a light touch): that is the xylophone. On a phone, which carries little
below 300 Hz, the heavy container hit was only its thin upper partials and the barn was nearly silent. Metal and timber are
now struck noise through broad resonances with their weight in 300-1000 Hz. A heavy routed hit is no longer dropped when the
head-touch bonk of the same moment got in first.

## Feedback (src/main.js, src/view/effects.js)

Camera kick 0.045 -> 0.075 per m/s, cap 0.4 -> 0.65, felt to 36 m (was 28). Dust: `fx.burst`, 6-18 larger particles thrown
off the surface along the contact normal, in place of 3-5 footfall puffs.

## Known, not done

- Head-on at a sprint (11 m/s, review.mjs "sprint 12") drops the hips to 1.6 m for half a second as it reels: one new
  "hips very low" flag in review. It reads as sitting down hard; not looked at in motion.
- It reels off bamboo too (crashread bamboo). Belongs with open item 2 (stems should give way).
- Saltline: stalls unchanged except runner/3 "old" measure 10 -> 22 s (prowl); deaths runner/5 4 -> 6. More crashes register
  now than before, everywhere, because of the first fix.
- Mind test hide_and_throw seed 3: contacts 5 -> 19, same reason.
- The crash tests' camera for Corner is partly behind the container.
