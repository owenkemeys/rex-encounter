# SKIN3 — jaw webs, thigh blend, distance detail, claws

Started 2026-11-14 11:38 UTC. Status: IN PROGRESS (updated per step).

## Log
- 11:38 created file; reading context.
- 11:55 backups of the four editable files in out/skel/skin3/backup/. Read studio, SKIN2, body.js, rexgeo build/paint. Baseline images = SKIN2's img set + out/verify arena.
  Distance-blur diagnosis (from code, before any render): there is no normal *texture*; the hide relief is procedural bump
  (screen-derivative) faded by `fade()` = 1 - smoothstep(0.07, 0.3, px*f): a band starts fading when its cell spans 14 px
  and is gone at 3.3 px. Arena renders were low tier at ~50 % render scale (VERIFY.md), which only has the 8 cm pebbles
  (gone by ~3 m there) plus a +-8 % tonal mottle. High tier: 5 cm pebbles gone by ~5 m; the layers meant for range (16 cm
  plates, 0.002 m deep; 30 cm lumps) are too shallow to shade and fade through 8-30 m themselves. Roughness also rises as
  bands fade (lost variance), flattening the specular. Next: jaw web strip.
- 11:52 web sheet v1-v6 (work/w*): strip built; rims read as pale ribbons (specular on forward rim); outer colour fixed to darkened cheek average. Coordinator added tasks A (neck hump) and B (thigh up to spine), +30 min.
- 11:55 A: spine joints 13..25 printed (work/spine.mjs); bind-pose dorsal offsets measured (work/dorsal.mjs, dorsal_before.txt): back +0.48 m over the joints, but +0.86-0.92 m at the neck foot (2.4-2.8 m ahead of the pelvis). Cause in skin: neck rows 19-21 centred high (top +0.66 in a frame tilted back 45 deg) plus the dorsal-ridge ellipsoids running on to joint 20. Fix v1: neck rows lowered (top ~0.44 perpendicular, depth moved under), ridge stops at joint 17, neck-foot underside lift 0.36->0.2. Now 0.65-0.70 vertical (rising neck), smooth (dorsal_v1.txt).
- 12:00 B: thigh paint was pale because thigh vertices (femur-skinned, no spine weight) took their countershade from their normal only; now from height in the pelvis frame above 1.5 m. Geometry: THIGHTOP fan over the ilium (pelvis/femur half weights) + thicker caudofemoral cone. b1_hipmid: colour continuous, top blends; back edge still a curve -> v2 fan further back.
- 12:09 task 3: fade window 0.07-0.3 -> 0.1-0.36; new range layers (patch field, ridged soft folds ~40 cm, 9 cm coarse scales in patches, stronger mid plates and mottle as fine detail fades). v1 too subtle (d1), v2 visible at 8 m (d2), v3 pushes far weight.
- 12:14 task 4: CLAWTIP hooked point meshes (cubic, flattened tube, rigid on distal toe bone), field sheath shortened inside them. c2_foot: clearly hooked and pointed; base seam jagged in paint. Next: web closed/third/roar, finals.
- 12:18 web: closed mouth showed sky through the slit where the bowed free edge sat behind WEB.z (the old wall had blocked it); free edge moved forward (zU 0.47, zL 0.43, sag 0.07). Rendering finals.
- 12:32 finals rendered into img/: head set (closed, third, wide side/tq/eye, roar side/tq), body sides (stand, walk mid, oside stalk/walk), thigh hip views (mid/forward/back), foot. Environment restart ~12:35 killed the distance-final batch.
- 13:33 resumed: tree builds, geometry intact (high 121,564 tris = 119,104 surface + 972 claw points + 1,488 webs; low 37,384 = 36,348 + 504 + 532). Both coordinator messages (owner shot, skeleton overlay) had arrived before the restart. Next: distance finals one at a time, low tier, arena 20 m, page loads.
- 13:36 dist_04/08/16 done.
- 13:37 dist_30, low-tier dist_08 and head wide rendered.
- 13:41 arena 20 m rendered from scratch dist (out/skel/skin3/dist, low tier in headless). Next: page loads.
