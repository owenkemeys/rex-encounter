# Queue (director's notes; newest last)

## Launch when the tuning agent (TUNE2) reports — one Opus agent, rex.js + mind files
1. Owner 2026-11-14 ~19:55: "I haven't actually seen its head poke into enclosed spaces for a long time, nor its eye peer up at windows or anything. It's still having these thoughts ('go in hole', 'careful') but it hasn't actually tried anything for ages." Thought and body disagree: a regression in besiege / head-probe / peer behaviours. Suspects: the one reach judge (`afford.js reachJudge`, FOLLOWUP.md), besiege re-plan and give-up (SALTFIX.md), clearance from the body, the new head carriage (BODYFIX3: head 1.55 m forward, 0.55 m up) changing what the head can reach, commitment margins keeping it off besiege, the feet-limit stopping the close approach. Measure with siege scripts: how often the head actually enters an opening / the eye comes to a window, before (store snapshot of 2026-11-13, `_pristine/rex`) and now.
2. Owner, same message: "it has a tic with its feet where it's unsplaying its toes as if to lift the foot, frequently, and that retract puts them all overlapping the central toe." Sim side: what unloads the foot so often when standing (weight shifts, the freeze 'finish the step or put it back' logic from BODYFIX2, toe splay closing whenever load drops) — splay should close only in real roll-off; standing weight shifts should not ripple the toes. View side (after the leg agent finishes): closed splay must not make the outer toes overlap the middle toe: minimum splay angle vs toe width.

## Design amendments to write into claude/MIND_DESIGN.md (owner, ~19:30–19:45)
- Looking away is an opening: it advances when not watched (it already senses `watched`: mind.js ~831, 28 degree cone, horizontal only); looking away should feel dangerous but sometimes necessary.
- Mouth-on-player rework NOT agreed: hold. Taking things from the player is out (head is the size of his body). Making the player drop what he holds, which then becomes a world object, is in.
- Rocks retired; kit is torch + 3 flares; rocks/meat may return as collectibles. Torch is good as a risky weapon; rock was costless spam.
- Interface overhaul in progress (UI.md).

## Saltline build (owner, 2026-11-14 ~22:10): "I would like to test the current rex in Saltline soon, as that environment is much more challenging and varied, especially if it reacts to the other NPCs."
Launch as the second stream as soon as TUNE3 lands (use the merged sim). One Opus agent, working in /home/claude/saltrex (see saltrex/NOTES.md, out/STANDING.md; adapter updated copy at rex/test/worlds/saltworld.js; owner's single-file reference `saltline-rex.html` in the project, copy at /home/claude/ref_saltline). Needs: current sim + current skin/eyes/legs (the old port used a classic-material body: check what the Saltline renderer needs; the body must render there), current audio where sensible, the player's kit there is Saltline's own (guns): gunfire as loud noise + missiles that hurt; hounds and drones fed to the mind as creatures/things with physical properties (size against its own, speed, noise, light, whether they attack it) so the general rules (prey reflex, threat, nuisance, curiosity, commitment) apply to them: no names. Verify with test/saltline.mjs + an in-game load check; publish as a NEW private artifact (not the arena link), give the owner the link.

## Owner 2026-11-14 ~22:35: "in the last day or so, the storm visual atmosphere is much lighter and less scary."
Small investigation (Sonnet or Opus, view files): compare storm mood rendering between /home/claude/_pristine/rex (2026-11-13) and now: sky, fog, exposure/tone mapping, GRADE.storm in src/view/post.js, light intensities, VHS mode now on by default (does the VHS pass lift blacks/brighten?), quality-tier default from the interface overhaul, body/skin material changes that needed more light. In-game screenshots old vs new at the same camera; restore the darker, more threatening storm.

## Owner 2026-11-15 ~02:00: breath particles clip through the snout
"the huffs and sniffs are better. main comment is realism of the particle effects: they visibly clip through the snout. dont work on that yet". TODO (not started): spawn vapour outside the snout surface along the nostril's outward direction; sniff wisps end at the nostril, not inside the head; check from the player's camera in game. Code: fx.snort / fx.breath in src/view/effects.js, body.nostril / body.snout.
Handoff refreshed 02:00 UTC (store 41 chunks, checksum fe79e667...). Saltline Rex published: https://claude.ai/artifact/Dq5y4s6QPAH64DQMAaTEHP

## Owner play notes, 2026-11-15 03:46-04:02 UTC, arena build 1794712881-dfef (session 20261115T034623Z-j93s; T notes k=1..17)
Also said in chat: Saltline "its fun! the rex handled the strange environment well", surprised by lunges when he thought it was stuck. Patch model: "its good, the head is cartoonishly large, and the eyes arent integrated right, but overall this is a very promising start and its very realistic looking."
GOOD (keep): k4 "the hunting reflex and increased speed when not looking is really good. very intense sprints away from danger, very fun"; k9 "this exchange is charming" (stalk at 25 m, thoughts small thing meat? / stay low. go closer / it see me. stop); k11 "oh it came when i looked away! thats good. if there was an objective in my game that was leading me to need to look away, that would work well"; k13 "that sprint segment was really fucking tense holy crap"; k1,k17 huff sound and breath effects good.
BODY:
- k1,k3 neck: "writhing, serpentine... discordance about how much the neck can writhe relative to the body"; "it can move its neck laterally way way too much, forming an S shape from above... looks snakelike from the front" (during probe/sniff at 5.7 m, rex standing).
- k2 "sort of twitching its jaws in a way that might be an affectation but might be a bug" (probe/sniff, 5.7 m).
- k6,k7 "one leg lifting off the floor repeatedly for no good reason" (beh listen, d 14.5); "leg still twitching in a new location and pose" (prowl/stalk, d 36.7).
- k14 "nose clipped through the wall. its very important that body parts cant clip into solid objects and that it can manouver its body around objects well, even if we have to make the sim more complex to do it. its part of making the creature believable beyond just in an open field." (besiege/probe at the barn, player (46.2,68.5), rex (53.1,70.3), thought "head in hole").
BEHAVIOUR:
- k10 "but now im expecting it to come at me and its not, so the intimidation is dropping" (stalk, stood at 25.5 m for ~20 s while watched, thought "it see me. stop").
- k15 flare ignored on reuse: "disappointing my trick didnt work, pleasant surprise that its smart enough to see through a ploy, but overall leaves a slightly negative feeling... maybe it should still be drawn to it instinctively as a bright/moving object but not be fixated on it? quickly decide it can be ignored".
- k16 "theres no peril being in this barn at all".
THOUGHT TEXT:
- k8 "\"head in hole\" is not a great message, it always annoys me".
- k12 "\"thump small thing land\" is not appropriate for this moment of a flare landing" (thought key `noise`: "thump! small thing land").
SOUND:
- k5 "not having any apparent sound effects on the rex footsteps is sort of weird at this point" (rex thumps logged at gain 0.06-0.3 from 12-16 m during a run: too quiet to notice).
- k16 "the sucking mud sound effect again, sounds cartoonish" (player `step_wet`).
TOOLING: each note stores a base64 screenshot (`shot`) and a long `ring`, so reading 13 notes through db_query cost a great deal of context. Move screenshots to a separate collection (e.g. `shots/<sid>_<k>`) and keep notes small; read notes via a cheap subagent until then.

## Owner idea to explore later (2026-11-15 ~04:40): raptor ally in Saltline
"saltlines' tight map made me imagine a scaled down Rex in there as a raptor, perhaps as a tenuous ally like an attack dog". Touches two parked/known items: a second species / size-relative appraisal (parked), and the platform finding that the sim reads species dimensions once at load and hard-codes tyrannosaur numbers (PATCH.md). Needs: per-animal species, a small-body gait, a relationship to the player that is not prey (tenuous: can turn), reacting to Saltline NPCs as targets.

## Owner, 2026-11-15 ~14:06 UTC playtest (build with crash response; phone)
T note (session 20261115T135634Z-g5lf, t=611.9; rex at (-90.1,80.4) in the bamboo, beh prowl/stalk, d 38 m): "It's gotten stuck in the bamboo. As a player I expect bamboo that appears like this to be able to deflect out of its way with effort. There may need to be a trapped/push mode that allows the Rex to impinge its collision volume temporarily when determined, to simulate forcing or squeezing past an obstacle. Also noticing that on my phone performance gets slow when it's in the bamboo"
Chat: "similarly maybe the solution is letting its bones bend past limits if it's really determined. Animals squeeze past things all the time." and "It's hard for me to test the crashing behavior, baiting it to run at me and being able to get to the right place is difficult, can you set up something simple so I can observe the behavior in action repeatably?"

## Owner, 2026-11-15 ~15:20 UTC, after using the crash tests
"the crash tests framing is enjoyable in its own way by the way, predefined scenarios we can just watch the rex in!" (idea: more watchable predefined scenarios).
"the sound only played once, in the head on case, and it was a humorous light bonk like a wooden spoon tapping a saucepan, not at all appropriate for a multi ton animal crashing into a shipping container. i expected to see it flinch and react to the crash, its head just butted against it. head on will be rare, but it suggests a shortage in the simulation. in the other scenarios i couldnt tell that anything happened at all to the rex, it was just running next to the wall or around the corner. that's good for keeping the rex pursuing you, but i expected there to be visible and audible signs if a crash has occurred."
Director did directly (15:30, unheard, unseen): audio.contact heavy branch for trunk/hip hits or force > 2.5 (low boom, body thud, container resonance + rattle / boards / grit, a knocked-out breath), camera kick out to 28 m, dust puffs at the contact (main.js). NOT done, needs the body stream: a visible flinch and reaction on a head-on hit (head recoil, eyes, stagger back, shake it off), and visible signs on glancing/corner hits (bigger lean, stumble, shoulder drag, speed dip the eye can read); check whether glancing/corner emit contact events at all in the crash tests.
"separate thing, the source store concept needs to be configured such that i can port the work outside of a Claude project... we can put it all in a private thing on github if that's helpful." -> GitHub private repo: owner to create/connect; director pushes trees + a cheat sheet.

## Owner, 2026-11-15 ~16:00 UTC, after the new crash tests
"the metal sounds are improved in some cases but there are still some xylophone sounding ones. the concrete one is good. the timber one inaudible. the camera shake and other feedback effects are okay but perhaps a little weak right now. the bamboo it did go in and get itself stuck and then unstuck, although the skeletal poses got a bit tortured along the way."
Decision: GitHub (owenkemeys/rex-encounter) is the master; new per-feature chats with individual agents, perhaps on other platforms.

## Owner, 2026-11-15 ~20:30 UTC, after playing the crash build
"the crashes are much better, the head on is great with its associated reactions- very believable and adds to realism. the body blows are functional but not selling the illusion just yet in the same way as the head crashes."
"im thinking that upon death an optional death cam replay so you can see from a third person what happened might be fun. thsi means we need a character model, which has been missing for a while - for now just use a simple pill shape."
"additionally, when the player dies, the meat resource the body represents should be depleted pretty quickly, a bite or two. in a long play session the rex is distracted for a long time eating the body and itsboring"
Playtest note (session 20261115T201359Z-65uz, note 2; he at -50.3, 60.6 inside the "shiny box", rex 5.7 m off, besiege): "this peering behavior is odd, its low and its head is off to the side, why? i would be expecting it to get its head through this giant window im standing right next to and try to get me this way"
Also: "i also dont want to have to think about branches and worktrees and so on, I'm not a github guy. i design experiences and playtest them. the bookkeeping is for agents to execute with best practices."

## Owner, 2026-11-15 ~21:45 UTC, after playing the death cam / window / body blow build
"the kill cam is quite funny already, even with just the pill player stand in, seeing your stupid frantic actions from third person just before your untimely demise."
"left some notes for you ingame to pick up and action next. put them as todo items in the repo so other agents can help later and pick what makes sense for you to fix."
"note that crash collision stuff is working pretty well now. window intrusion kinda works."
"death cam lets make that automatic a second or so after the shocking black screen from the death. fade in from black and auto watch the replay. pressing any key (except t) brings up the usual death/respawn menu, with restart replay button."
"whilst its working, thinking for you: deaths and encounters can be funny viral moments, we already have the ability to re run scenarios for the death cam and the testing, can we make moments shareable with a link? its like a richer form of just screencapping a video. do not build this, just think about it"

## Owner, 2026-11-15 ~23:30 UTC, after the automatic death cam build
"https://github.com/apekshik/three-nanite Might be useful."
"I left some new notes from this play experience. The kill cam would be helped a lot by the pill standin being visibly sent flying or in its jaws etc, currently it's way too static. It may also be time to swap in a little human character instead of the pill. It's VERY entertaining seeing your own past movements but the perspective does highlight gaps in the sim now."

## Owner, 2026-11-16 ~01:00 UTC, after the human figure / kills-when-hungry build
"left some notes. this is very funny, although the replay incites you to clown around more now, but let's not try and "solve" that just yet."
"is the saltline version ready to run?"

## Owner, 2026-11-16 ~01:40 UTC
"i saw very few crash related thoughts ever."
"when i asked about saltline i meant "with the current rex". that's something I'd like to test."
"the idea is this rex might get dropped into many other games and scenarios that other people make, so it sounds like maybe some of the code architecture might not quite be suiting that just yet? what's it gonna take to make that happen? it doesnt have to be perfect or seamless, everyone playing with it will be using agents to help just like our own collaboration, but still if we can make it easier somehow we may as well"

## Owner, 2026-11-16 ~02:00 UTC, on the eyelids (T3)
"the sad eyelids are to do with the axis that the eyelids pivot around. that axis is fixed relative to skull, in a way that produces a good parted effect from dead ahead, but strange from side. the eyelid rotation axis should be a child of the eyeball's look direction, so that the widest parting of the lids is always around the pupil. or at least something closer to this, with some damping and weighting factor for realism rather than 1:1 tracking. this is my diagnosis from observation only, and may be wrong or an incomplete fix."

## Owner, 2026-11-16, after the eyelid build
"the eye is an improvement already, thanks."
"the saltline rex seemed to have some different sound effects (huffing,sniffing) and lost the visual telltales for the same. that's a shame and ought all to be part of the portability package. the user expects to have exactly the same creature functionality in whatever environment they drop it into."
"when it vocalises, can the jaw opening be driven by the sound files in some way so the overall effect all ties together more?"
"the kill cam needs to properly recreate flares, sounds, and other such interactions so it is faithful to what the player did and saw in their game - or if that is too expensive to achieve, then we can change the style or framing somehow so that players dont expect it (maybe even more security cam style)"
Then, on the plan: "the doors currently are janky and i dont ever use them, we can strip them out"
"security cam framing: okay do it, with a different VHS style to sell that its no longer a bodycam type recording. and applies even when VHS mode is off. BUT it needs to always be funny to watch, so the angle, distance, zoom etc need to all just work."
"i'd like to see the jaw animation first and it should be procedural based on emitted sound effect, not hand crafted, to allow future flexibility. I am sure you can find a way to handle the need to precede the actual audio by a fraction."
"the kill cam update can come in the same build, please. these two are visible changes that affect the fun immediately."
"the creature package stuff can be just articulated on the to do list for a future agent." "the stuck alarm is up to you" "bamboo can stay on the to-do list."

## Owner, 2026-11-16 (while the jaw and CCTV kill cam were being built)
"another thing for the to-do list is the "send this to a friend" for your death tape"
"this also suggests that recording a shareable tape at any time (say last X seconds of gameplay) would be very viral and fun, not just on death!"

## Owner, 2026-11-16/17, after the jaw + security-cam build
"this is really really good fun now. the kill cams are hysterical, the crude little human and its animations really add to it. I want to post this publicly soon as a rough alpha. put all this on the priority hit list for other agents to deliver on:"
"* we need people to be able to share their replays easily because thats core to the virality. if you're halfway there with that already, you can finish it this session"
"* i'd like to think about possibilities for other easy to implement, delightful, surprising, psuedo-emergent behaviors - it stamping on the flare is a great one"
"* make sure all game world props have appropriate collision - i noticed light poles and the bridge at the barn dont have collision to the rex"
"* i expect spacebar/gamepad A to be a jump button in this sort of FPS environment"
"* lets talk about the scenario, because lack of goal bothered one of my playtesters, even though most players just enjoy clowning around with the rex. i like the "distract it from eating the kids for X minutes" scenario idea"
"* the arena and/or spawn position i find to be overly big and boring, i end up dashing over to the ruins or the barn from the start point most times because that gives opportunities for fooling around with the rex. the bamboo LODs as cones are terrible. i have no idea if the arena has anything else in other areas because i never go to it. thoughts?"
"* the rex model is missing a pubic bone hump between the legs I think?"

## Owner, 2026-11-17
"the growl noises are getting fully-open flapping jaws, which isnt right at all. i would expect that to be closed and barely twitching. need to refine the procedural animator."
"please help me stay on track that its best to release things janky and let people see iteration over time, rather than striving to perfect before launch"

## Owner, 2026-11-17
"touch controls players need a way to run, dont have one currently."
"save video clip is okay and maybe helpful, but shareable link is good in other ways."
"the link is only shared to trusted playtesters currently. im happy to host it somewhere else or in some other way for the public alpha release as you advise. i dont know anything about that stuff though."
"youve given me two very long messages that i cant reply to everything in. come to me with clear decisions i need to make"
