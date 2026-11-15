# To do, from the owner's playtest notes

Each item is the owner's note verbatim with the state recorded at that moment, then what is known. Pick one, say in the
status line that you have it, and wait for his verdict after he plays the result. Newest batch first.
His standing verdicts (2026-11-15 21:45): head-on crashes "great"; "crash collision stuff is working pretty well now.
window intrusion kinda works"; the kill cam "is quite funny already".

## Batch of 2026-11-15 21:47-21:59 UTC (sessions 20261115T214343Z-9vrm and 20261115T215107Z-xr5v)

### T1. Head does not lead into a turn or round a corner
Status: in progress (2026-11-15, body agent).
"this test has highlighted that the rex's gaze or attention is theoretically around the corner but its head is looking dead ahead of its run direction. i noticed this because when it gets around the corner its head is still facing ahead even though its goal, theoretically, is whatever was around the corner that it was trying to reach. unless this is an artefact of the test setup only? natural behavior would be to expect its head to go around the corner as soon as its able, and it hits its shoulder because it misjudged its ability to clear the corner in its excitement"
Where: the Corner crash test (debug drawer). Known: the crash tests run with `attention: null` on purpose (main.js, "in a crash
test it is not to know of you"), so part of this is the test; but nothing makes the head lead toward where the body is going.

### T2. Bamboo: cones are ugly, and it gets trapped
Status: open (also "Bamboo and squeezing" in AGENTS.md).
"the bamboo situation still sucks, these cone standins are so ugly and not representative, and bamboo stalks should bend out the way of the rex (or the rex is able to move past them with force even if they dont literally bend) the impression here is that its just trapped in a silly video game collision type of way"
Where: animal at (-90.2, 44), stopped, after "bump! hard". Two parts: how bamboo looks (cones), and that stems block like walls.
Note: since the crash work it also reels off bamboo as if off a wall (test/crashread.mjs bamboo).

### T3. Creeping with its head sideways in besiege; eyelids look sad from the side
Status: in progress (2026-11-15, mind agent) for the head; eyelids open.
"why is it creeping with its head sideways like this? its weird. also its eyelid configuration when seen from the side makes it look sad or something. it works well from the front though"
Where: he at (25.5, 76.4) (the Barn, "big box"), animal at (19.8, 81.2), besiege/probe, 7.5 m, seeing him.
Known: besiege's eye spots cock the head (`eye` +/-1) at a low crouch; see the window work in mind.js (`thru`).

### T4. At the barn it snaps but cannot or will not get him; bite sounds like wet mud
Status: in progress (2026-11-15, mind agent for the reach; audio agent for the sound).
"it made biting sound effects (which sound like wet mud or something) but doesnt seem able or interested in getting me, which is suprising and detracts from the experience. i expected it to be tearing me to shreds in this situation already."
Where: he at (24.4, 76.5), animal at (26.9, 81.0), besiege/probe, 5.2 m, seeing him, hunger 0.81, thoughts "no way there",
"try other way". About 50 s later it seized him (T5).

### T5. Is it failing to kill me or toying with me? (design)
Status: open, needs a design proposal for the owner, not a code fix.
"oh it did immediately pick me up after that i guess. as a player thats fun but its not clear whether its trying to kill me and failing, due to lack of skill or bug, or if its just toying with me. need to think about how to clue the player in to the situation in the most fun way."

### T6. A splayed pose while pursuing, seen in the kill cam; could not leave a note during it
Status: the T key in the kill cam is being fixed (2026-11-15, death cam agent). The pose is open: no data.
"the last death scene, in the kill cam replay i saw the rex made a weird splaying pose whilst pursuing me. i dont know if you can get that from the telemetry from this note which is immediatley after respawn. i couldnt leave a note during kill cam because pressing the T key just exited kill cam."
Known: that note was taken after respawn (animal feeding at (29.6, 59)), so it does not hold the pursuit. Session
20261115T215107Z-xr5v, life 2 to 3 at about t = 467 s: the `chunks` collection has the 2 Hz timeline of the chase.
Useful first step: let a note taken during the kill cam store the replay time, and have test/review.mjs-style pose checks run
over a recorded tape.
