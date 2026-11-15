# Studio renders (`test/studio.py`, page `src/studio.js`)
The real skinned animal, real skin material, real sim pose (fixed 120 Hz step, seed 3, flat ground) on a plain matte floor:
hemisphere fill plus one key light with a shadow, no grass, props, dust, fog or post. One full-size PNG per call.

    python3 test/studio.py OUT.png cam=side scen=walk t=4.2
    python3 test/studio.py OUT.png cam=foot_L scen=walk phase=toeoff foot=L

- `scen=` stand | walk (2.2 m/s) | slow (1.2) | jog (4.5) | run (8) | stalk | turn (face 120 deg) | walkturn (walk, steering from 1 s)
- `t=` seconds to advance; or `phase=` midstance | heeloff | toeoff | midswing | land, with `foot=L|R`: after a 2 s warm-up,
  the next time that foot reaches the phase (heel-off: heel rise > 0.12 rad; toe-off: > 0.6 rad; midstance: stance share >= 0.45).
- `cam=` side | front | rear | tq (three-quarter front) | top | eye (1.7 m high, 8 m off, looking at the animal) |
  foot_L | foot_R (low, ~2 m off, from outside; from behind-outside when that foot trails) | hip | knee (left leg) |
  oside | ofront | otop: orthographic at `scale=` px per metre (default 64), 1 m grid behind (5 m lines darker), ground 0.4 m above the bottom edge.
  Every camera is fitted to joint positions of the posed animal (aim and lens from the points' angular extent); none is hard-coded.
- `tier=low` builds the phone mesh (7.25 cm grid) instead of the 4 cm one; `w=`/`h=` image size (default 1280x720);
  `noshadow`; `webgpu` (default is WebGL2: SwiftShader's WebGPU is slower); `seed=`; `fov=` (side/front/rear base lens).
- `--nobuild` skips the esbuild step (the bundle goes to `out/skel/studio/`). It prints one JSON line: pose time, foot
  state for phases, camera, triangle count and milliseconds per stage.
- Cost here (2 cores, SwiftShader, 1280x720): 20-60 s per frame, of which ~6 s builds the skin and 13-50 s is the first
  draw (shader compile plus the software draw; close-ups that fill the frame with skin are slowest). Low tier ~14 s.
- Run ONE at a time. Deterministic: same arguments, same image (Math.random is seeded in the page).
