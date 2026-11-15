---
status: accepted
---

# Single-player first; keep the simulation network-agnostic

Everything is built to work solo first. Creature behaviour, weapons and world logic are kept free of assumptions that would block later co-op PvE (players versus dinosaurs). PvP is out of scope. We chose not to build netcode now because tuning animation and gunplay feel needs fast iteration, but we avoid shortcuts (global singletons, frame-coupled state) that would make a later multiplayer retrofit very expensive.
