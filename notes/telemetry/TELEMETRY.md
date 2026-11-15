# Session telemetry, sounds and notes

Status: done, 2026-11-14. Source: `src/telemetry.js` (new), hooks in `src/main.js` and `src/ui.js` (one line), controls in
`dist/index.html`. Reader: `test/session_report.mjs`. Headless check: `out/telemetry/load.py`. Sample: `out/telemetry/sample/`.
Builds: `npx esbuild src/main.js --bundle --format=esm --minify --outfile=/tmp/app_tel.js`. `dist/app.js` was NOT rebuilt;
the director's build replaces it. Until then the note button in `dist/index.html` is there but does nothing.

## What the director must declare
`capabilities: { db: {}, user: {} }`. Dictation is not used and `claude.use("dictation")` is never called. `user` is not read;
nothing personal is stored. With no `window.claude`, a `null` db, or failing writes, the game runs as before. The session is
kept in memory, and the pause card shows **copy session**.

## The note control (owner's spec)
- **Desktop: `T`** is unbound in the key map (`out/ui/UI.md`). The browser and the frame do not intercept it, and it works
  while the pointer is locked. Pressing it first captures the context (state ring, thoughts, events, sounds, and a
  screenshot taken from the next drawn frame). It then **freezes** time: `S.frozen` holds the simulation, camera, kit and
  pad, and suspends audio, like pause does. No pause card appears and the view is not dimmed. It releases the pointer
  (flagged so this does not pause) and opens a small box at the bottom centre with its field focused. **Enter** or **send**
  saves the note, shows "sent" (or "marked" if empty), unfreezes, and asks for the pointer again from the same gesture. If
  the pointer had been locked and is refused within 1.2 s, the pause card comes up. **Shift+Enter** starts a new line. **Esc**
  discards the note and unfreezes. While the box is open, keys stop at the field, so game keys do nothing. A transparent
  shield swallows clicks on the view. Pointer-lock loss and `visibilitychange` do not raise the pause card. The `T` keydown
  is `preventDefault`ed, so no "t" appears in the box.
- **Touch:** the note button opens the same box (top right, beside "?" and pause, 44 px, inside the safe-area insets). The
  field is 16 px so Safari does not zoom. `visualViewport` keeps the box above the on-screen keyboard.
- **Gamepad:** R3 (button 11) drops a bare mark without freezing.
- **Pause card:** a "note for the developer" field (Enter saves) and "n notes this session". **copy session** appears only
  when the data cannot leave the page.
- The controls list (pause card, Tab/peek) has one line: `T` / `R3` / `note` — "note". The corner chip shows `T` on keyboard.

## What is recorded
One session per page load (id `<UTC start>-<4 random chars>`). Lives are numbered inside it: a life ends at a death and the
next starts at respawn or "start over". Times are seconds since page load.

**Header** (`sessions/<sid>`): `kind:'session', v, s, start, build, device (desktop|touch), vw, vh, dpr, backend, tier, level,
ratio, gpu, seed, settings {sound, vhs, quality, auto, sens, invert, thoughts, debug}, ua, tlF, ringF, updated, dur, lives
[[n, t0, t1, cause]], counts {thoughts, events, notes, marks, deaths, errors}, chunks, bytes, db, tlEvery, flush`.
`build` is `__BUILD__` if set with `--define:__BUILD__='"…"'`, and `2026-11-14` otherwise.

**Timeline** (2 Hz, rows in `tlF` order): `t, px, pz, yaw, pitch, spd, crouch, run, torch, flares, mode, rx, rz, rpsi, rv, beh,
phase, focus, d, sees (1 you / 2 the camera / 0), facing (you within 30° of it), stance, hunger, arousal, interest,
irritation, cert, fps`. Player values are taken from the camera. fps comes from real frame time, because main's dt is
clamped at 0.1 s.

**Ring** (10 Hz, the last 20 s, `ringF`): `t, px, pz, yaw, spd, crouch, rx, rz, rpsi, rv, beh, d, sees, facing, fps`. It is
attached to every note and every death.

**Events** (`[t, type, ...]`):
- `th` key, kind, text: every thought in `mind.voice.stream`.
- `beh` name, motive/phase, reason.
- `act`: flare (count left), torch on/off, whistle, shout, crouch, climb, door, note cancelled.
- `ev` src, type, id, cause/kind, amount: sim events from victim, mind bite/tear/nudge, herd killed/alarm, things hit/stamped,
  and rex roar/growl/clack/worry/butt/swipe/toss/huff. Repeats are rate-limited.
- `death` cause, motive, lasted, {F, rows, th}.
- `life` n; `pause` 1/0; `freeze` 1/0; `mode`; `dev`; `lock` on/off/error/refused text; `vis` hidden/visible/pagehide.
- `audio` carrier/context/unlock: the `#audio` readout lines, logged whenever they change (polled every 2 s).
- `set` settings JSON when changed.
- `perf` fps, frames >50 ms, frames >100 ms, worst ms, frames, paused: one per 10 s window.
- `err`/`rej` message, first stack line: from page load on.
- `ctx` WebGL context lost/restored, WebGPU device lost.
- `note` k, how, text; `tel` db state and write failures; `start`.

**Sounds** (owner's request). `src/view/audio.js` is not edited. On start-up, every method of the Audio prototype is wrapped
on the instance. Public methods (roar, huff, growl, scream, clack, crunch, tear, thunder, thud, stoneHit, smack, alarm,
flurry, step, rustle, ignite, ping, thump) set the context. `breath` → `_frame` is the context `frame`, which covers
gestures, sniff, chew, birds and the beds. The primitives that start a source are logged under that context: `_play` (key,
gain, emitter distance), `_snip` (`clip:<name>`), `_burst` (`noise:<filter><Hz>`), `_tone`, and `_bed` (first start of
each loop). Also logged: `ui.whistle` and the achievement ding.
- `['snd', context, clip, count, maxGain, minDist, contextArgs]`: repeats within 1 s are coalesced (5 s once the session
  passes 1.5 MB). A clip of `-` means the method ran but started no wrapped primitive. Either nothing played, or the method
  starts its own source, as thunder does.
- `['sst', beh, rexSpeed, distance, yourSpeed, herdMoving, herdNearest, rexGesture (sim.act), recentSimEvents (incl.
  footfalls), rain, hiss, ctxState]`: logged once per window that had a sound.
- `['clips', state, manifestNames, decodedNames, fails]`: logged once.

**Notes** (`notes/<sid>_<k>`): `kind:'note', s, k, t (when T was pressed), at, how (typed|mark), text, why
(key|button|pad|pause), frozen (seconds the box was open), life, ringF, ring, thoughts (last 6), events (last 15, without
thoughts and sounds), sounds (last 20 snd plus any not yet flushed), now (full timeline row), shot (320 px JPEG data URL, 0.5
quality, about 5–7 kB), shotWhy`. A cancelled box uses up its `k`, so numbers can skip.

## Storage
Flat collections, so the host's list tools reach everything:
- `sessions/<sid>`: about 1.2 kB, rewritten on every flush.
- `chunks/<sid>_<n>`: `{kind:'chunk', s, n, t0, t1, every, tl, ev}`. It is rewritten while it grows and sealed at 60 kB of
  JSON; then `<n+1>` starts.
- `notes/<sid>_<k>`: about 10–14 kB. Above 90 kB the screenshot is dropped first.

`tl`, `ev`, `ring`, `thoughts`, `events`, `sounds` and `now` are stored as JSON strings, in case the db forbids arrays inside
arrays. Flushes happen every 25 s, on pause, death, note, `visibilitychange`→hidden, `pagehide` and WebGPU loss, and early
when a chunk grows fast. Each document has one write in flight at a time, and only the latest pending data is written. A
write is skipped if nothing changed, and a write that takes more than 15 s counts as failed. Size cap: above 1 MB, 1.5 MB and
2 MB in total, the timeline drops to 1 s, 2 s and 5 s, and sounds go to 5 s windows. Notes, events and errors are never
dropped. **copy session** puts a single `DINO-SESSION {header, ev, tl (≤400 rows), notes (rings at 1 Hz)}` line on the
clipboard, using `navigator.clipboard` from the click and falling back to `execCommand('copy')`. Errors are caught.

## Reading a session
`node test/session_report.mjs <file> [--session <sid>]`. The file holds one JSON object per line (`{id, data, updatedAt}`, as
the list tools return them, from `sessions`, `chunks` and `notes`), or a JSON array of them, or the pasted `DINO-SESSION`
text. The report has these sections:
- header;
- **notes and marks, each with the 20 s before it**: behaviours with durations, distance, sight, facing, player and animal
  movement, fps, thoughts, events, sounds, and whether there is a screenshot;
- minute by minute: positions, distance, sight %, mind scalars, behaviours, thoughts, player actions, events;
- deaths with their lead-up;
- errors;
- performance;
- **sounds**: whether the recordings decoded, totals, per minute, and every loud, frequent or impact sound while the player
  and the animal were both nearly still, with the herd, the rex's gesture and the latest sim events;
- anything odd: thought gaps over 90 s, behaviour flicker, the animal out of view for 2+ min or not seeing you for 3+ min,
  audio never running, pointer lock refused or never on, frequent pauses, db failures, quick deaths, the animal jumping
  25+ m, impact sounds while still.

The sample is in `sample/`: `session.jsonl` (6 documents written by the real recorder through the stub db), `report.txt`,
`pasted_summary.txt` → `report_pasted.txt`, and `note_*.jpg` (the thumbnails).

## Checks done (headless Chrome, SwiftShader WebGL2, about 2 s per frame on this shared machine)
- Build OK. `python3 load.py plain|notel|stub [secs]` serves a scratch copy of dist with `/tmp/app_tel.js`.
- **plain** (no `window.claude`): starts and runs 30 s with no console errors (only the game's own GL ReadPixels warnings,
  which also appear with telemetry off). No telemetry UI is visible except the note button. T then Enter gives a bare mark
  (kept in memory).
- **stub** (`window.claude.use` with an in-memory db injected before load):
  - T froze the sim clock for 4 s, showed no pause card and focused the box.
  - Typing `wasd q f c e t 1 2 …` changed nothing (position, torch, flares, crouch, held keys) and went into the box.
  - Enter saved the note, relocked the pointer and time resumed.
  - Esc cancelled. An empty send gave a mark.
  - A forced death (`victim.die`) was recorded with its ring, followed by respawn as life 2 and a typed note on the pause card.
  - 46 writes, 0 overlapping writes on one document, largest 28 kB.
- Cost: `tel.frame` averaged about 0.1 ms per frame (max 1.5–4.4 ms). Average frame time with telemetry on vs `#notel` was
  2048 vs 2026 ms (noise). The screenshot readback forces a GPU sync: up to 2 s on SwiftShader. It happens only for a note,
  inside the frozen frame, so it does not show; the gamepad mark is the exception.

## Not verified
- The real host `db`: its API shape (`collection().doc().set()`, which is used), rate limits, and whether string-encoded
  arrays read well in the list tools.
- The iPhone: the box above the keyboard (`visualViewport`), the 44 px button among Safari's bars, and focus on tap.
- Real pointer-lock refusal → pause-card fallback (headless always granted the lock, including from Esc).
- WebGPU thumbnails (the canvas may read blank; then `shotWhy:'blank'` and no image). Only WebGL2 was exercised.
- The sound log against the owner's "metal banging / scuffling". It runs, but headless audio is not his. In the sample,
  `thump` noise layers appear while the rex's speed is 0 (`sim:footfall` while standing), and `step>step_wet` appears while
  the player is still. These are candidates to check in his first real session.
