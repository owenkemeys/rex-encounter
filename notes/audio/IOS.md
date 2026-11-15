# iOS "no sound": the ring/silent switch

**None of this has been tested on a real iPhone.** The cause comes from the owner's report and from reading WebKit's source. The fix was only checked in headless desktop Chrome, which cannot reproduce iOS audio sessions.

## Cause (confirmed by the owner)
- Ring position: sound plays.
- Silent position: the game is mute.
- Safari's speaker icon still shows while it is mute. So the context is running, but the output is muted by the switch.

## Why the old workaround failed
Old `src/view/audio.js`, lines 216-233, the old `_unlockHelpers`:

1. **Line 220** set `navigator.audioSession.type = 'playback'`.
   - In WebKit, `DOMAudioSession::setType` returns early, with no error, when the frame lacks microphone permission. The getter then keeps returning `'auto'`.
   - claude.ai's cross-origin iframe has no microphone permission, so this line did nothing.
   - Source: https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/audiosession/DOMAudioSession.cpp (fetched 2026-11-14), where `setType` checks `PermissionsPolicy::Feature::Microphone`.
   - This was introduced by "Limit DOMAudioSession to third-party iframes having microphone access" (bug 249577): https://lists.webkit.org/pipermail/webkit-changes/2023-January/280658.html
2. **Line 221** only created the looping silent `<audio>` when `navigator.audioSession` did not exist.
   - Safari on iOS 17 and later has that property, so on the owner's phone the silent element was never created and never played.
3. **Result:** nothing moved Web Audio out of the default "ambient" category, and the silent switch mutes ambient audio.
   - That this is how ambient behaves, and that `audioSession` "playback" fixes it only where it applies: https://bugs.webkit.org/show_bug.cgi?id=237322 (WebKit engineer's comment, 2024-09-25) and https://bugs.webkit.org/show_bug.cgi?id=264473
4. **Ruled out as the cause:** `play()` being refused for lack of `allow="autoplay"`.
   - Safari does not implement that iframe attribute at all (https://caniuse.com/mdn-html_elements_iframe_allow_autoplay); playback is allowed by the user's gesture alone.
   - The old `data:` WAV (800 samples) was also valid. The element simply never ran.
5. The silent-element workaround itself is widely used: https://www.audjust.com/blog/unmute-web-audio-on-ios (2024) and https://bugs.webkit.org/show_bug.cgi?id=237322 (comment from 2022). https://portfolio-2024-b6r.pages.dev/blog/web-audio-ios-unmute (Nov 2025) covers the `audioSession` route.

## Other faults, ranked by how likely they are to matter on his phone
1. **(The cause, above.)** The silent switch was never worked around inside the frame.
2. **The context can stay stuck in `interrupted` or `suspended`** after a call, a lock or an app switch (iOS 17+).
   - WebKit bugs: https://bugs.webkit.org/show_bug.cgi?id=273511 and https://bugs.webkit.org/show_bug.cgi?id=263627
   - The old code only called `resume()`, and its `onstatechange` set `_wantWake`, which nothing ever read.
   - Fixed: see "What changed".
3. **The chime in `ui.js` (old line 124) created a second AudioContext outside a gesture.**
   - It never starts on iOS, and the game and the chimes could end up on different contexts.
   - Fixed: the chimes now use only the game's context, through `audio.out`.
4. **A non-numeric value in the saved `dino.vol` setting would throw (NaN) while the audio graph was being built**, leaving no context at all.
   - Fixed: stored volumes are now cleaned on load (`audio.js` line 81).
   - A stored master volume of 0 would also silence the game. The readout now shows the saved setting and the live gain.
5. **Checked and found sound:**
   - **The start control.** It is a `click` on `#startGo`/`#start`, which iOS counts as a gesture. The context is created and resumed synchronously inside it, with no `await` first.
   - **mp3 decoding.** It uses the callback and promise forms together. If every file fails, the synthesised voices take over; if one voice fails, that voice falls back on its own.
   - **Sample rate.** Buffers fall back to resampling if a rate is refused.
   - **The "Sound on" checkbox.** It is not saved, so it cannot have turned sound off.

## What changed
All in `src/view/audio.js` unless stated.

- **iOS detection (line 89).** First by capability: `audioSession` exists and the device has touch points, which means iPhone or iPad. The user-agent string (line 85) is only the last resort.
  - `#audioios` forces the iOS paths on any browser.
  - `#audiodirect` turns off path (b), for comparing.
- **`resume()` (line 355) is now the single unlock.** It runs synchronously inside the gesture, and each call does the following:
  1. **(a)** Sets `audioSession.type = 'playback'`, then reads it back and records the value.
  2. **(c)** Starts the looping silent `<audio>` element (0.5 s WAV from a `data:` URI, `playsinline`, attached to the page, AirPlay off). It now always runs on iOS, whether or not `audioSession` exists.
  3. Creates or resumes the context, then plays a one-sample buffer.
  4. **(b)** `_startStream` (line 276): the game's output also feeds a `MediaStreamAudioDestinationNode`, played by an `<audio playsinline>` element through `srcObject`, with `play()` called inside the gesture.
     - The direct connection to the speakers is cut only after `play()` succeeds *and* the element's clock is seen moving 400 ms later.
     - If `play()` is refused, stalls for 2.5 s, or the element stops later, the direct connection is restored immediately.
  5. If the context is still not running after two gestures more than 600 ms apart, it is closed and rebuilt inside the gesture (`_rebuild`, line 313). The decoded sound buffers are kept.
- **Re-arming.**
  - In `main.js` (line 310), every touchend, pointerup, click and keydown calls `resume()` while `needsUnlock()` (line 264) is true. That covers: no context yet, a context that is not running, or on iOS no media element playing. The same check runs on `visibilitychange` and `pageshow`.
  - When the page is hidden, both media elements are paused, so a paused game leaves no player on the lock screen. The next tap restarts them.
- **New output node.** Everything now ends in an `out` node (line 397); `ui.js` connects its chimes there too.
- **Desktop is unchanged.** No media elements are made, the direct connection stays, and no latency is added. Checked headless with `#audio`: "direct Web Audio (desktop path)", no `<audio>` elements.

## Which of a/b/c should work on his phone
- **(a) will not.** WebKit ignores it in this frame. The readout should show "type reads auto (ignored...)".
- **(c) is the one I expect to work.** It is the long-established workaround, and it simply never ran on his phone before. A playing media element moves the page's audio session to the playback category, which the switch does not mute.
- **(b) is less proven.** Whether WebKit treats an element fed by a MediaStream as ordinary playback is not documented anywhere I found.
  - If it plays, it also sets the playback category.
  - Two risks:
    - The element route may add delay, perhaps tens to a couple of hundred milliseconds. I could not measure this.
    - iOS might allow only one media element to play at a time. If so, the stream element (started second) wins, and the silent loop is not restarted while the stream plays.
  - **If (b) makes things worse** (silent even with the switch on, or late sound), open the game with `#audiodirect` to compare. That would mean (b) should be removed.

## The `#audio` readout
Add `#audio` (or `#audioios` / `#audiodirect`) to the URL. A small plain-text box appears top-left with a **test tone** button, which plays a loud 880 Hz beep through the game's master, unlocking first. Without the hash nothing is shown. The lines:

- **CARRIER.** Which path is carrying sound. This is the line to read first:
  - `media-stream <audio> element (b)`: path (b) is carrying the sound.
  - `direct Web Audio + silent-loop element (c) playing`: path (c) is doing the work.
  - `direct Web Audio only: FOLLOWS THE SILENT SWITCH`: neither (b) nor (c) is working.
  - `none: context ...`: the context is not running.
- **context.** State, sample rate and latencies.
- **ios paths / direct feed.** Whether the iOS paths are on and whether the direct connection is connected or cut.
- **(a), (b), (c).** Each line shows the status or error text: "play() refused: NotAllowedError ...", "stalled", "playing", and so on, plus the element's paused flag and clock.
- **recordings.** Decoded and failed counts; how many voices come from recordings and how many are synthesised.
- **volume.** Whether Sound is on, the saved master setting and the live master gain.
- **unlock.** Number of gestures, the last result, rebuilds, and the last error.
- **test tone.** When the beep was sent and which path it took.

**How to read it on the phone with the switch on silent:**
- CARRIER says (b) or (c), but the test tone is not heard: that path does not lift the switch in this frame. Report which one.
- The (b) or (c) line shows a refusal: the error text says why.

## Checks run
- `npx esbuild src/main.js --bundle --format=esm --minify --outfile=/tmp/app_audio.js` builds.
- One headless Chrome load of a scratch `dist/` copy at `/tmp/rexscratch`:
  - **No hash:** no console errors, no readout, context running.
  - **`#audio`:** readout shown, desktop path, no errors.
  - **`#audioios`:** both elements created, `play()` pending in headless (no audio output there), direct connection correctly kept.
- `dist/app.js` was not written; `dist/index.html` is unchanged.
