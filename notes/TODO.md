# To do, from the owner's playtest notes

Each item is the owner's note verbatim with the state recorded at that moment, then what is known. Pick one, say in the
status line that you have it, and wait for his verdict after he plays the result. Newest batch first.
His standing verdicts (2026-11-15 21:45): head-on crashes "great"; "crash collision stuff is working pretty well now.
window intrusion kinda works"; the kill cam "is quite funny already".

## Batch of 2026-11-15 21:47-21:59 UTC (sessions 20261115T214343Z-9vrm and 20261115T215107Z-xr5v)

### T1. Head does not lead into a turn or round a corner
Status: built 2026-11-15, awaiting the owner. `_travelGaze` in rex.js, numbers in species `gazeLead`; only when it means to run and nothing else has the head. `node test/gazelead.mjs`: head now leads the body onto the goal by 0.3 s at the corner (before: never got there) and 0.8 s on open ground. Unseen. Left at a walk on purpose: fixing the head on the way ahead at a walk cost Saltline crouch/3 ten seconds of searching.
"this test has highlighted that the rex's gaze or attention is theoretically around the corner but its head is looking dead ahead of its run direction. i noticed this because when it gets around the corner its head is still facing ahead even though its goal, theoretically, is whatever was around the corner that it was trying to reach. unless this is an artefact of the test setup only? natural behavior would be to expect its head to go around the corner as soon as its able, and it hits its shoulder because it misjudged its ability to clear the corner in its excitement"
Where: the Corner crash test (debug drawer). Known: the crash tests run with `attention: null` on purpose (main.js, "in a crash
test it is not to know of you"), so part of this is the test; but nothing makes the head lead toward where the body is going.

### T2. Bamboo: cones are ugly, and it gets trapped
Status: open (also "Bamboo and squeezing" in AGENTS.md).
"the bamboo situation still sucks, these cone standins are so ugly and not representative, and bamboo stalks should bend out the way of the rex (or the rex is able to move past them with force even if they dont literally bend) the impression here is that its just trapped in a silly video game collision type of way"
Where: animal at (-90.2, 44), stopped, after "bump! hard". Two parts: how bamboo looks (cones), and that stems block like walls.
Note: since the crash work it also reels off bamboo as if off a wall (test/crashread.mjs bamboo).

### T3. Creeping with its head sideways in besiege; eyelids look sad from the side
Status: head built 2026-11-15, awaiting the owner; eyelids open. When it sees him the head turns to him instead of lying along the gap (`node test/barn.mjs all 90`: head off his line 12% of seen time, was 52%, from the side he stood; from the south-east start still 40%, not fixed). Unseen.
"why is it creeping with its head sideways like this? its weird. also its eyelid configuration when seen from the side makes it look sad or something. it works well from the front though"
Where: he at (25.5, 76.4) (the Barn, "big box"), animal at (19.8, 81.2), besiege/probe, 7.5 m, seeing him.
Known: besiege's eye spots cock the head (`eye` +/-1) at a low crouch; see the window work in mind.js (`thru`).

### T4. At the barn it snaps but cannot or will not get him; bite sounds like wet mud
Status: built 2026-11-15, awaiting the owner. Reach: the strike was gated on the skull's distance, so it bit 1.5-2.6 m short; now a `closing` state steps up until the snout is in reach, then one strike (barn.mjs: seized in median 12 s, was 19; but 39 s vs 19 s from the south-east start: worse there). Sound: a snap on air was wet-impact clips pitched down (the `clack` hybrid voice); now a dry synthesised clack in audio.js `clack` (`python3 test/bite_audio.py`), about 10 dB quieter by rms than the old one, may need level. A bite that lands also gets this clack plus its crunch. Unheard, unseen.
"it made biting sound effects (which sound like wet mud or something) but doesnt seem able or interested in getting me, which is suprising and detracts from the experience. i expected it to be tearing me to shreds in this situation already."
Where: he at (24.4, 76.5), animal at (26.9, 81.0), besiege/probe, 5.2 m, seeing him, hunger 0.81, thoughts "no way there",
"try other way". About 50 s later it seized him (T5).

### T5. Is it failing to kill me or toying with me? (design)
Status: open, needs a design proposal for the owner, not a code fix.
"oh it did immediately pick me up after that i guess. as a player thats fun but its not clear whether its trying to kill me and failing, due to lack of skill or bug, or if its just toying with me. need to think about how to clue the player in to the situation in the most fun way."

### T6. A splayed pose while pursuing, seen in the kill cam; could not leave a note during it
Status: T fixed 2026-11-15 (T opens the note box in the kill cam and on the death card, the replay holds while typing, the note stores `replay`, `replayT` and positions). The pose is open: no data until he marks it in a replay.
"the last death scene, in the kill cam replay i saw the rex made a weird splaying pose whilst pursuing me. i dont know if you can get that from the telemetry from this note which is immediatley after respawn. i couldnt leave a note during kill cam because pressing the T key just exited kill cam."
Known: that note was taken after respawn (animal feeding at (29.6, 59)), so it does not hold the pursuit. Session
20261115T215107Z-xr5v, life 2 to 3 at about t = 467 s: the `chunks` collection has the 2 Hz timeline of the chase.
Useful first step: let a note taken during the kill cam store the replay time, and have test/review.mjs-style pose checks run
over a recorded tape.

## Also from the owner, 2026-11-15 late

### T7. Death cam automatic
Status: built 2026-11-15, awaiting the owner. About 1.2 s after death it fades in from black over 0.8 s into the replay; any key, click or button except T brings up the death card, which has "restart replay". Checked by keyboard and mouse in headless Chrome; touch and gamepad unverified. The live mind's thought text still shows during the replay.

### T8. Shareable moments (design only, do NOT build yet)
"deaths and encounters can be funny viral moments, we already have the ability to re run scenarios for the death cam and the testing, can we make moments shareable with a link? its like a richer form of just screencapping a video. do not build this, just think about it"
Status: thinking only; see the orchestrator's reply of 2026-11-15 in the owner's chat. Sketch: a moment is the replay tape (poses, player track) plus scene state, stored server-side under a short id, opened by a plain #name link; richer than video because the viewer can move the camera, scrub, see what it was thinking, and step into the same moment to try to survive it.

## Batch of 2026-11-15 23:09-23:15 UTC (session 20261115T230319Z-dlmq) and the owner's message with it

### T9. Kill cam stand-in is too static; time for a little human figure
Status: built 2026-11-16, awaiting the owner. `src/view/figure.js`: a 1.77 m person from primitives (jacket, trousers, skin), walk/run with planted feet, crouch, tumbling in the air, limp across the jaws, down/rising/pinned/dead. The tape now records the victim's state, position and velocity and follows the body after death (in the jaws while the head is on it, else where it fell). Seen in headless screenshots: running, in the air, held, lying. Not seen: pinned, rising, a natural (unforced) attack. The animal often hides the figure from the fixed camera: the camera choice is the next thing to improve.
"The kill cam would be helped a lot by the pill standin being visibly sent flying or in its jaws etc, currently it's way too static. It may also be time to swap in a little human character instead of the pill. It's VERY entertaining seeing your own past movements but the perspective does highlight gaps in the sim now."

### T10. It picks him up again and again and never kills: no longer threatening
Status: built 2026-11-16, awaiting the owner. Supersedes the question in T5. Cause: holding never hurt him and nothing in the hold delivered a killing bite; each timed-out hold lowered his worth until "not meat". Now (`resolute` in the hold decision, mind.js): very hungry (> 0.75) and unafraid kills on the first seize about 3 s after it (6/6 seeds, `node test/seizeend.mjs`); hunger 0.6 drops once then kills; hunger 0.3 always lets go, and every release says why ("not hungry. play", "scared. let go", "enough. go away"). Anger-motive seizes at hunger 0.6 now kill too. Unplayed.
"its picked me up like 4 times now but chosen not to kill me each time, its becoming non threatening feeling"
Where: he at (-45, 67.2), animal at (-39.9, 66), seize/hold, hunger 0.89, stance predatory; seized "through the gap" (the Warehouse window work).

### T11. A thought when it crashes and hurts itself
Status: built 2026-11-16, awaiting the owner. Cause: the crash thought was queued behind the thought stream (up to 3 s late, 20 s cooldown, overwritten). Now `_onCrash` in mind.js speaks within a tick and holds 1.8 s: "bump", "ow. hard thing", "OW. head hurt", then "careful now"; wound up (irritation > 0.45, or frustration > 0.5, or arousal > 0.6 in a chase) it says "not care" / "no stop" or nothing. A hard knock also caps its pace at 2.4 m/s within 8 m of the spot for 20 s (not checked for stalls beyond Saltline passing). `node test/crashthought.mjs`. Unplayed.
"it needs to have a thought when it crashes into something and hurts itself. not having one is jarring. if its frustrated and getting wound up it may start ignoring the pain signals though."
Known: the mind has `onCrash` / `crashBeat` (mind.js ~l.790) and thoughts like "bump! hard", "something hard" do appear in the stream; the note says in play it reads as no thought.

### T12. "weird lunge pose just happened"
Status: partly built 2026-11-16, awaiting the owner; nobody knows this is the pose he saw. Found with `node test/lunge.mjs` (body driven directly): a snap/seize/butt at a target off to one side drove the hips about 1 m sideways over planted feet (stance 1.9 m against 0.9 standing). The sideways part of that lunge is now scaled by `hips.lungeSide` 0.35 (stance 1.27 m). Open: a long strike leaves the trailing foot at full reach for about 0.5 s (hips 1.9 m past it); proposal: shorten `dsMin` for a foot in great need, or cap the strike's reach. Mind-driven runs showed nothing clearly bad, and they end at the kill, so post-strike poses go unrecorded.
Where: he at (-2.9, -23.6), animal at (-6.2, -25.3), heading -4.47, prowl phase `set`, 3.7 m apart, hunger 1. See also T6 (a splayed pose while pursuing).

### Reference: three-nanite (https://github.com/apekshik/three-nanite), suggested by the owner
Looked at 2026-11-15. Nanite-style cluster level of detail for three.js: an offline tool cuts a GLB into 128-triangle clusters and the runtime picks detail per frame. Static, opaque, rigid meshes only (no skinning, no morphs), one material per asset, WebGL2 with `WEBGL_multi_draw` (not Firefox), three 0.186+, MIT, experimental (2 commits; "an experiment that works, not a production engine feature"). Not usable for the animal (its body is deformed every frame). It could matter later for very detailed static scenery (scanned rock, ruins, dense props) if the arena's triangle count becomes the limit; today the arena is far below that, and our first renderer is WebGPU (docs/adr/0001), where this library is not the supported path. Park it.
