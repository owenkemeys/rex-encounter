# Dino Hunter: Vision Brief

Status: living document, produced from a grilling session. Settled items are decisions by the owner; "Open" items are still on the design tree. The glossary (`GLOSSARY.md`) holds vocabulary and `docs/adr/` holds hard-to-reverse decisions; this file holds everything else a builder needs.

## Core fantasy

Combat against enormous, detailed, intimidating dinosaurs where each fight demands attention and skill. Reference points from the owner:

- **Shadow of the Colossus**: the fight with one huge creature is the main event.
- **Horizon Zero Dawn**: the feel of its large setpiece machines when a fight sits at the edge of your capability.
- **Jurassic Park, the T. rex paddock escape scene**: the vibe. Dread and mass, not a power fantasy.

Not the goal: mowing down packs of small enemies.

## Players and controls

- First-person.
- Keyboard and mouse on desktop browsers first. Gamepad is expected later and should not be designed out.
- Single-player first (ADR 0002). Co-op PvE possible later. No PvP.

## Number one priority: organic creature motion

The owner's first concern is that large creatures move naturally and fluidly, with procedural responsiveness, because the creature is the focus of the player's attention and unconvincing motion breaks the illusion immediately. Art direction (skin, feathers, colour) is a separate, later concern.

Inspirations the owner named:

- **Dragontwin** (solo UE5 project by Sidenius): dragon motion driven by physics and procedural systems instead of pre-made animation clips, giving a heavy, natural feel.
- **A recent NVIDIA release on fluid animation**: most likely MotionBricks (SIGGRAPH 2026, real-time neural motion generation that replaces hand-built transitions and animation state machines) or ARDY (real-time text/constraint-driven motion). Both are trained on human motion, so neither drops in for a theropod. Confirm which one the owner meant.

### What the first creature's motion must include

Walk, run, turn and stop with believable inertia; footing and body height that adapt to uneven ground; head and neck that track targets with natural holds and re-fixations; a tail that counterbalances turns and acceleration; idle breathing and weight shift; footfalls that produce consequences (camera shake, ground effects, audio thump) so mass reads.

### Owner's design observation on intent (a hint, not an instruction)

Natural movement should include the creature positioning its whole body *on purpose* so its tools (sensory organs, weapons, body mass and momentum) end up in the right places and on the right trajectories to achieve its goals. Many games put the creature's origin near its centre of gravity and then adjust the skeleton (head position and so on) afterwards to look believable. The owner suspects that is the wrong approach, because it is not how creatures think. The owner does not want to dictate this. It is offered as a possibly fruitful direction for the builder to weigh.

## How the owner works with agents

The owner specifies intended end results, not methodology. Naming conventions and implementation choices are left to the builder (Claude Fable 5.2), who is expected to be inventive as well as careful. Do not ask the owner to decide terminology, rigging pipelines or animation techniques; decide, and explain only if it affects the experience.

## Build approach

- Build **Standalone Elements** one at a time; the owner refines each by taste; later assembly into a game.
- First element: **an adult T. rex in a sandbox** (Jurassic Park-style). Uneven terrain; debug tools for driving it (click-to-walk targets, speed and turn controls, gait and foot-contact overlays); a first-person camera standing on the ground for true scale plus a free-fly camera. No combat or hunting AI in this first element. Gun-feel sandbox comes second.
- Assets: generated with an external service (Meshy or Tripo). Placeholders can stand in until real art is chosen.
- Tech baseline: ADR 0001.

## Combat damage model (tentative)

Horizon-style component targeting is fun and matches how hunters would deal with a real animal, though it may not feel intuitive on a flesh-and-blood creature. The owner is leaning toward it ("perhaps it's the right approach") but has not decided. Shadow of the Colossus-style climbing onto the creature is not discussed yet.

## Experience decisions

- **Shape of a fight (settled):** a single sustained duel with one huge creature, lasting several minutes up to about a quarter of an hour, where the player learns its behaviour. Not a quick kill and not a pack fight. Smaller dinosaurs may exist as scenery or occasional pressure, but the big one is always the point.
- **Creature perception (settled):** the creature does not always know where the player is. It finds the player by sight, sound and smell, so breaking line of sight, staying quiet and the noise of gunfire matter, and a fight can open with the creature hunting the player.
- **How hurting it reads (settled):** wounds are visible on the body and change how the creature moves (limping, guarding an injured side, flinching toward shots, changing tactics). No floating health bar or damage numbers; the player judges progress by watching the animal. This holds whichever damage model sits underneath.
- **Weapon feedback (settled in principle):** how gun effects are conveyed is the target, not which weapons exist. Reference is Helldivers 2, whose weapons feel great across a wide range of types. The weapon roster is not decided.
- **Player fiction (deliberately deferred):** too early. The one stated preference is that the owner is tired of survivor games, and finds hunting an intimidating prey that has a real chance of killing you back a slightly more novel experience.
- **Hit confirmation (settled):** the player learns a shot landed mainly from the creature itself (flinch, blood, limp) plus sound and impact effects. No hit markers or damage numbers. A subtle indicator can be tuned in later if playtesting shows it is needed.
- **Seeing the animal (settled):** fights happen in terrain open enough to see the whole creature move, with cover (trees, rocks, wreckage, mud) as tactical tools. Rain, night and fog create dread without hiding the creature entirely, in the spirit of the Jurassic Park scene. The animation only pays off if the player can see it.
- **Player fragility and what failure costs (deliberately deferred):** the owner finds being taken out unfun, though punishing games such as Elden Ring are popular. An idea floated and not adopted: creature attacks cripple rather than kill, mirroring the creature's wounds. The owner does not want to fixate on this part of the loop yet. The right framing will have to be found by playing, not decided up front.
- **Gameplay loop (deliberately deferred):** beyond "shoot satisfying guns at a big, fascinating, believable dinosaur", the owner does not yet know the loop and does not want to settle it by answering questions. Candidates raised and not chosen: track the animal then fight it; a series of different-species fights; an open expedition. Treat the loop as something to discover while refining the Standalone Elements.

## Open

Weapon roster; player kit and movement; detailed creature behaviour; audio; UI; co-op and gamepad; progression; the deferred loop and failure questions above.
