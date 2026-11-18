# UI rework (player-facing interface)

Status log
- 19:44 UTC started. Read `dist/index.html`, `src/ui.js`, `src/main.js` (all), `src/view/quality.js` (qualityMenu injects a
  "quality" select before the labels holding `#pVHS` and `#sVHS`), tests (they use only `#ovSkel`, `#ovGait`, `#ovSense`, `#view`).
- 19:55 inventory written; "before" screenshots running (`out/ui/shoot.py before <desk|port|land>`, scratch build in `out/ui/before/`).
  Originals of the two JS files backed up as `out/ui/before/ui.js.orig`, `main.js.orig`; `out/ui/before/index.html` is the original markup.
- 20:35 design written; implementation in all three files done, tree builds. First desktop walk run (found: `#test` hashes
  do not run the frame loop, so per-frame UI cannot be checked there; the walker now uses a plain load and `window.__rex`,
  which gained `S`, `arena`, `props`, `ui`, `ov` for that). Before shots were taken with `#test-start` (static frames).
- 20:37 first after-walks at all sizes done; fixes: touch wording, touch control table, pause card tighter (two-column
  controls on wide screens, controls group closed on touch), drawer padding under the corner buttons. Hash checks passed
  (section 7). Final walks running.
- 21:25 final walks done at all sizes (section 7); touch pause groups and the hidden five-tap entry checked separately
  (`tapdbg.py`, `tapdbg2.py`). New life now also resets zoom. Tree builds. Done.

## 1. Inventory (before)

Devices: KB = keyboard + mouse with the pointer locked; KB-free = mouse with the pointer free (paused, lock refused);
T = touch; P = gamepad. "Animal?" = explains or instruments the animal.

### Screens and panels

| Element | What it does | Reach | Still relevant? | Animal? |
|---|---|---|---|---|
| `#boot` "Waking the animal" | loading text, removed when ready | - | yes | no |
| Start card `#start` | title, lede, start, VHS checkbox, "play fullscreen" checkbox, quality select (injected), small print (esc, tab, gamepad a) | KB-free click anywhere / Enter / Space; T tap; P A or Start (but P cannot reach the checkboxes or quality) | lede OK; **"play fullscreen" checkbox does nothing** (`start()` ignores it by design); small print lists all devices at once | lede says "its thoughts float above its head" (explains the UI, mild) |
| Opening invitation `#invite` | "WASD to walk, or mouse to look: you step in where the camera stands. or just watch it think. Esc pauses." per device | display | yes | no |
| First-time tips (same `#invite`) | one prompt per verb, shown once ever, stored in `dh.taught` | display, per device | yes, but shown once only and gone after a single use (brief asks: fade after a couple of uses) | no |
| Far reminder (same `#invite`) | "it is 85 m away. Q to call it." every 2 min while far and unseen | display | call reminder yes; **the distance figure instruments the animal** | yes (distance) |
| Context prompt `#prompt` | "E climb" / "E open the door" under the centre | KB / P display; hidden on T (T has `#tAct`) | yes | no |
| Held strip `#held` | flashes "FLARE" for 1.4 s when the item changes; otherwise nothing shows how many flares remain | display | partly: **no persistent count of flares, no torch state** anywhere (touch item button shows only the name) | no |
| `#hint` | "you whistle", "Photo saved" | display, bottom 9% (under Safari's bar in portrait) | yes, but misplaced on phone | no |
| Achievement toast `#toast` | title + line + "n of total" + chime | display | yes (existing) | no |
| Thought bubble `#bubble` / `#osd` (VHS) | the animal's thought | display | yes, the one window | (intended) |
| Crosshair | dot in the centre while locked / hover-look / pad | display | yes | no |
| Injury vignette `#hurt`, death cut | edges darken | display | yes | no |
| Controls peek `#peek` | controls table while Tab / View held | KB Tab hold; P View hold; **T: none** | yes; touch has no way to recall controls without pausing | no |
| Mind readout `#mindcard` (+ telemetry bars, options weighed, recent decisions) | diagnostic | toggled in the drawer (`#uMind`, `#uTele`), persisted in `dh.ui` | debug only | **yes, fully** |
| `#fps` | backend, fps, quality, seed | with telemetry | debug only | no |
| Touch: stick, `#tbtns` (item = cycle, Call, Crouch, Zoom, Torch), `#tAct` | move; cycle item; call; crouch; zoom; torch; contextual | T | stick sits 26 px from the bottom: **under Safari's bar in portrait**; **the item button cycles instead of throwing; throwing is a tap on the view (easy to waste one of three flares while looking)**; buttons 76x41 px (below 44) | no |
| `#pauseBtn` | pause | T only (hidden for mouse users) | yes; **no on-screen pause for KB users** | no |
| `#menuBtn` -> `#panel` (the "sandbox" drawer) | development drawer | T: **always visible top-right to every touch player**; KB: backtick; P: d-pad right (opens it but cannot operate it) | development; **leaks to touch players** | **yes** (mind probes, drives, overlays) |
| Pause card `#pause` | Resume, controls table, its thoughts, look speed, quality, VHS, fullscreen, "just watch it", photo, "sandbox tools", achievements count + meter + full list | KB: Esc / P key; KB-free mouse; T: pause button; **P: only A/B resume - nothing else operable** | resume/controls/thoughts/look speed/quality/VHS/fullscreen yes; "just watch it", photo, "sandbox tools" are not pause-screen material; **no sound settings** (they are only in the dev drawer); **no restart**; **no invert** | no |
| Death card `#dead` | "you did not make it", cause, last thoughts, lasted, achievements count, new this life, "try again", "just watch it" | KB-free click, Enter/Space; T tap; P A | yes but busier than "quick, one control" | shows last thoughts (existing) |

### Settings

| Setting | Where | Does it work? | Verdict |
|---|---|---|---|
| its thoughts (always / when watched / near / never) | pause card + drawer (two places) | yes, `dh.ui` | keep, pause only |
| look speed | pause | yes, `dh.sens` | keep (controls group) |
| quality (auto/levels) | start + pause (injected) | yes | keep |
| VHS camcorder look | start + pause | yes, `dh.vhs` | keep in pause (view); off the start card |
| play fullscreen (start) | start | **no-op** | remove |
| fullscreen button | pause | yes where allowed | keep (view) |
| sound on, master/weather/animal/effects volume, ground shake | **drawer only** | yes (volumes in `dino.vol`; sound on not saved) | move to pause; sound on/off also on start |
| mind readout / telemetry / hide all (H) | drawer, keys; `bare` persisted | yes | debug only; "hide all" no longer persisted (a stray H hid the HUD for good) |

### Keys and buttons (before)

| Action | Keyboard | Gamepad | Touch | Shown where |
|---|---|---|---|---|
| walk | WASD / arrows | left stick | stick | invite, peek, pause |
| run | Shift | L3 (toggle) | stick to the rim | tip, peek, pause |
| crouch | C | B | Crouch | tip, peek, pause |
| look | mouse | right stick | drag | peek, pause |
| zoom | right mouse (Z undocumented) | LT | Zoom | tip, peek, pause |
| throw flare | left click | RT | **tap the view** | tip, peek, pause |
| change item | wheel / 1 2 3 | LB / RB | item button | (hidden with one item) |
| call (tap whistle, hold shout) | Q | X | Call | tip, peek, pause |
| contextual (climb, doors, take) | E / Space | A | `#tAct` | `#prompt` |
| torch | F | Y | Torch | tip, peek, pause |
| pause | Esc / P | Start | pause button | invite, start small print |
| controls peek | hold Tab | hold View | none | tip |
| struggle when held | movement keys / Space | left stick | stick | none |
| **sandbox, reachable by any player** | ` drawer, I thoughts, H hide all, K photo, **M turns its mind off**, **O observe**, **V shove**, **B roar**, X clear goal | d-pad up photo, left thoughts, right drawer | drawer button | drawer "Keys" |

## 2. Design (written before coding)

Principles
1. **One device at a time.** The game tracks the last input used (keyboard/mouse, touch, gamepad) as `body[data-dev]`,
   switching live. Every hint, key chip, control list and the start card render for that device only.
2. **Nothing needs a free mouse while playing.** Every in-play verb has a key and a pad button. Pointer-needing things
   (sliders, selects) live only on the pause card, where the pointer is free, and that card is also fully operable by
   keyboard (Tab/arrows/Enter/Esc) and gamepad (d-pad moves focus, left/right changes a value, A activates, B/Start resume).
3. **One obvious pause.** Key: Esc (also P) / Start. On screen: a small pause button top-right on every device, labelled
   with its key on keyboard and pad (clickable whenever the pointer is free; with the pointer locked it is a reminder).
   A sibling "?" button (key: hold Tab / hold View) shows the controls over the game without pausing; on touch it toggles.
4. **Few verbs, one name each, the same everywhere**: walk, run, crouch, look, zoom, flare (throw), call (tap: whistle,
   hold: shout), torch, the contextual verb as itself (climb, open the door...), pause, controls.
5. **The animal is not instrumented.** No distances, no meters. The thought bubble is the window. No new place shows
   achievement names or thought lines (the existing toast and the death card's last words stay; nothing is added).
6. **Dev tools behind the debug entry.** Backtick (desktop) or the `#debug` hash (any device) turns on debug for the
   session: the drawer button appears, the sandbox keys (I H K M O V B X) and pad d-pad bindings work, the pause card
   shows "sandbox tools". Without it an ordinary player can reach none of them. The mind readout shows only in debug.

Screens
- **Start card**: title; one line of premise ("one tyrannosaur, thinking for itself. what will it make of you?"); the
  controls for this device (6 lines max); one big start control labelled for the device (click / tap / press A, and
  Enter); two settings: sound on/off and quality. No VHS, no fullscreen checkbox, no multi-device small print.
- **In play** (desktop/pad): crosshair; bubble; bottom-left a compact kit readout: torch (on/off) and flares as pips
  (3/2/1/none), each with its key chip until the player has used it twice; top-right "?" and pause chips; one tip line
  bottom-centre, shown when a verb first becomes relevant, repeated at most 3 times and retired once done twice; the
  contextual prompt below the centre (key chip + verb).
- **In play (touch)**: stick bottom-left; a 3x2 button cluster bottom-right: flare (shows pips; tap throws), call,
  torch, crouch, zoom (+ change item only if the kit has 2+ items); the contextual button appears above the cluster.
  Portrait: everything lifted 80 px clear of the bottom and 10 px of the top (plus safe-area insets); tips at the top
  under the toast line. Landscape: 12 px + safe area; tips bottom-centre between stick and buttons. A tap on the view no
  longer throws (drag looks; the flare button throws), so a look cannot waste one of three flares. All targets >= 44 px.
- **Pause card**: "Paused"; Resume (largest, focused); Controls (this device; open); Sound (on, master, weather, the
  animal, effects); View (its thoughts, quality, camcorder look, ground shake, fullscreen where allowed); Controls
  options (look speed, invert look); "start over" (a new life); a closed "found n of m" list at the very end (the
  existing achievement log, kept quiet). Gone: just watch it, photo, sandbox tools (debug only).
- **Death card**: cause; its last words (existing); how long you lasted; one button "go again" (Enter/Space, A, tap),
  focused. Gone: achievement count/list, "just watch it".
- Deliberate exception to "nothing else" on the pause card: the closed "found n of m" line, because it is the only place
  the existing achievement log can be read (nothing new is surfaced; delete `#pLogBox` to drop it).
- **Debug drawer**: unchanged contents apart from the sound group (moved to pause) and the duplicate thoughts select;
  "Keys" text updated.

## 3. Removed or moved, and why

| What | Was | Now | Why |
|---|---|---|---|
| "play fullscreen" checkbox | start card | removed | did nothing (`start()` never reads it; fullscreen must be its own gesture) |
| camcorder (VHS) checkbox | start card | pause card, View | a look, not something a first-time player needs before starting |
| multi-device small print ("esc pauses; hold tab...; on a gamepad press a") | start card | replaced by the controls of the device in use | one device at a time |
| "its thoughts float above its head" | start lede | removed | explains the window into the animal; let the player discover it |
| "just watch it" | pause card, death card | removed (the drawer's Observe camera remains, debug) | not a pause/death action; the death card has one control |
| "photo" | pause card | debug drawer (and K in debug) | a downloaded file from a sandboxed frame is unlikely to work there; development use |
| "sandbox tools" | pause card | pause card only in debug | development |
| achievements meter + title row | pause card | one closed "found n of m" line at the end of the pause card | quiet; the log is the same one as before, nothing new surfaced |
| achievements count and "new this time" list | death card | removed | the death card is "quick, one control"; the toast already announced them |
| sound on + four volumes + ground shake | debug drawer only | pause card (Sound; ground shake under View) | players need them; the drawer is debug |
| duplicate "its thoughts" select | drawer + pause | pause only | one place per thing |
| `#menuBtn` (drawer) | always visible to every touch player | only in debug | development |
| sandbox keys I H K M O V B X, pad d-pad up/left/right | live for every player (M turned its mind off, O/V/B/X changed the sim) | only in debug | a stray key changed the game |
| `#held` strip (flashed the item name for 1.4 s) | bottom centre | replaced by `#kitHud` (torch + flare pips, always there) | the player never saw how many flares were left |
| "it is 85 m away" | far reminder | "Q to call it" without the distance; stops after 4 calls | instrumented the animal |
| tap on the view throws (touch) | touch | the flare button throws; the item-cycle button appears only with 2+ items | a look could waste one of three flares |
| mind readout, telemetry, fps | drawer flag, remembered | shown only while debug is on (flags still remembered) | instruments the animal |
| "hide all" remembered between visits | `dh.ui.bare` | not remembered (debug H only) | a stray H hid the HUD for good |

## 4. Key and button map (after)

| Verb (one name) | Keyboard + mouse | Gamepad | Touch |
|---|---|---|---|
| walk | W A S D / arrows | left stick | stick |
| run | hold Shift | L3 (toggle) | stick to the rim |
| crouch | C | B | crouch |
| look | mouse | right stick | drag the view |
| zoom | hold right mouse / Z | hold LT | zoom (toggle) |
| flare (throw) | click | RT | flare (shows the pips) |
| change item (only with 2+ items) | wheel / 1 2 3 | LB / RB | item |
| call (tap whistle, hold shout) | Q | X | call |
| contextual (climb, open the door...) | E / Space | A | the button that appears |
| torch | F | Y | torch |
| struggle when held | mash W A S D / Space | left stick | the stick |
| controls (without pausing) | hold Tab; "?" button when the pointer is free | hold View | ? (toggle) |
| pause / resume | Esc (also P); pause button when the pointer is free | Start (B also resumes) | pause button |
| start | Enter / Space / click | A or Start | tap |
| go again (death) | Enter / Space / click | A | tap |
| cards | Tab / Shift+Tab, arrows on sliders and lists, Space/Enter, Esc resumes | d-pad / left stick up-down moves focus, left-right changes a value, A presses, B resumes | tap |
| debug | ` (backtick) opens the drawer and turns on debug for the session; `#debug` hash | (d-pad in debug) | `#debug` hash, or five quick taps on "Paused" |

## 5. What changed, per screen and device

Start card (all): title; one line of premise; the controls of the device in use (redrawn live when another device is
used: a mouse move, a touch, a gamepad button); one big start control whose label follows the device ("click to begin" /
"tap to begin" / "press A to begin"); sound on/off and quality. Keyboard: Enter/Space start (Tab reaches the two settings,
which keep Space/Enter for themselves). Gamepad: Start begins; d-pad reaches sound and quality, A presses.

In play
- Keyboard/mouse: crosshair; bottom-left kit readout (`#kitHud`: torch lamp, flare pips, each with its key chip until used
  twice); top-right "? Tab" and "|| Esc" chips (clickable whenever the pointer is free; with the pointer locked they are
  reminders and ignore clicks); one tip line bottom-centre; the contextual prompt at 62% height. Holding Tab shows the controls.
- Gamepad: as keyboard, with pad names (RT, Y, View, Start). Pointer lock is not requested for a gamepad player.
- Touch: stick bottom-left; cluster bottom-right (flare with pips, call, torch / crouch, zoom; "item" only with 2+ items);
  the contextual button above the cluster; "?" and pause top-right. Portrait: everything sits 80 px above the bottom edge
  and 10 px below the top (or the safe-area insets if larger); tips at the top under the toast line (hidden while a toast
  shows). Landscape: 12 px margins; tips bottom-centre between stick and cluster. All touch targets 44 px or more.
- Tips (all devices): one at a time, when the verb first matters, worded for the device; each returns at most 3 times and
  retires once the player has done it twice (stored in `dh.teach`; older `dh.taught` counts as done). New: a struggle tip
  the moment the animal has hold of you.

Pause card (all): Paused; resume (focused); controls (open; two columns on wide screens); sound; view; look; start over;
"found n of m" (closed). Keyboard: Esc or P resumes (Esc also from a focused slider), Tab order is resume, groups, start
over, found; arrows move sliders, Space toggles. Gamepad: B or Start resumes; d-pad/left stick moves focus; left/right
changes a slider, list or box; A presses (A on a list steps it). Touch: all controls 44 px; outside the card resumes.

Death card (all): cause, its last words (unchanged), how long you lasted, "go again" with its key (Enter / A), focused.

Debug: backtick (or `#debug`, or five taps on "Paused") turns debug on for the session: drawer button, sandbox keys,
pad d-pad bindings, "sandbox tools" on the pause card, mind readout and telemetry flags.

## 6. Screenshots (`out/ui/shots/`)

Names are `<before|after>_<desk|port|land>_<step>.png`; desk = 1280x720, port = 390x664 (touch, mobile), land = 844x390
(touch, mobile). Steps: `1start`, `2observe` (started, watching), `3play`, `3play_b` (in play a few seconds later),
`3play_keys` / `3play_buttons` (after using every verb), `4help` (Tab held / "?" tapped), `5pause`, `5pause_scrolled`,
`5pause_focus` (desktop, after tabbing), `5pause_look` (a setting changed), `6drawer` (debug drawer), `7dead`,
`8pad_pause` (desktop, pause card driven by a fake gamepad). Extra: `check_<hash>_<size>[_debug].png` for the hash checks,
`after_port_5pause_touch_groups.png`, `after_port_9debug_on.png` (touch pause groups, five-tap debug entry). Each walk's DOM
and game state is in `<which>_<size>.json` (element boxes, focus, small targets, kit/torch/crouch/zoom/pause/dead state).
Before shots used `#test-start` (frames advance only on demand there, so their in-play shots are near-static; the "before"
phone runs also stopped at the death card). After shots use a plain load.

## 7. Verification (after)

Walks (`shoot.py`, plain loads, headless Chrome + SwiftShader, very slow under the machine's load: 1 to 4 fps):
- Desktop keyboard/mouse: Enter starts and the pointer locks (`body.locked`); W steps in; F torch on, C crouch, click throws
  (flares 3 -> 2, readout pips follow), Q call, Z held zooms; the keys M O B V X H I K do nothing without debug (mode stays
  foot, its mind stays on, no drawer); Esc pauses with focus on Resume and the pointer freed; Tab order on the card is
  resume, controls, sound, view, look, start over, found; arrows on the focused look-speed slider change `S.sens`; Esc
  resumes from the slider; backtick opens the drawer and turns debug on; death card shows with "go again" focused; Enter
  goes again (flares back to 3). No console errors (warnings only: pointer-lock re-requests refused by headless Chrome
  after an Esc, which drops the game into its existing hover-look fallback until the next click).
- Gamepad (fake standard-mapping pad injected into `navigator.getGamepads`): Start pauses; d-pad moves focus with a visible
  ring; A toggles the focused group; B resumes. At 1-4 fps some presses were missed (the pad is polled per frame).
- Touch portrait and landscape: tap starts; the stick steps in; torch, flare, crouch, zoom buttons work (flares 3 -> 2,
  torch on, crouch on, zoom on); a tap on the view does not throw; "?" shows the touch controls card; the pause button
  pauses; the look group opens and "invert" toggles (`S.invert` true, landscape); "go again" restarts (flares 3). No
  console errors. Every in-play touch target is 44 px or larger; on the pause card the remaining sub-44 px items are the
  checkbox squares (22 px) whose whole 44 px row is the label, and slider tracks (32 px high, full width).
- Layout boxes, portrait 390x664: corner buttons at y 10-54, stick 460-584, cluster 476-584: nothing in the bottom 80 px
  or the top 10 px. Landscape 844x390: stick 254-378, cluster 270-378, corner 10-54.

Checks (`check.py`): esbuild build OK (`npx esbuild src/main.js --bundle --format=esm --minify --outfile=out/ui/after/app.js`).
- `#webgl` desktop: started, backend WebGL2; backtick opens the drawer; Skeleton ticked -> `ov.skel.visible` true. No console errors.
- `#audio` portrait: started, the audio readout and its "test tone" button present. No console errors.
- `#perf` landscape: started, the perf overlay present. No console errors.
- `#debug` portrait: drawer button shown; tapping it opens the drawer; Skeleton toggles. No console errors.
- Touch pause card (`tapdbg.py`, portrait): pause button pauses; tapping "look" opens it and "invert" toggles (`S.invert`
  true); tapping "sound" opens it and the sound box toggles; "resume" resumes; tap on the view does not throw.
- The five-tap debug entry on "Paused" could not be exercised: headless taps arrived 2.5 to 5 s apart under load (the
  window is 1.2 s between taps). The `#debug` hash and backtick paths are verified.
- The three walks above are the plain loads at each size (each ran several minutes, no console errors).

## 8. Not verified

- A real iPhone (Safari's bars, the claude.ai toolbar, safe-area insets, audio unlock on the new buttons, 44 px feel).
  The 80 px bottom reserve is an assumption from the brief; `env(safe-area-inset-*)` applies only with `viewport-fit=cover`
  (now set) and only if the host iframe passes it through.
- A real gamepad (button mapping, analog stick feel in menus, focus ring on a TV distance).
- Real pointer lock inside the claude.ai iframe (whether the sandbox allows it, and Chrome's one-second refusal after Esc;
  the existing fallback, hover-look, is unchanged). With the pointer free the corner "? / ||" buttons are clickable.
- Fullscreen inside the frame (the button hides itself when `document.fullscreenEnabled` is false).
- Photo download (moved to debug; not tried).
- Visual tuning at real frame rates (tip timing, the flash on the kit readout).
