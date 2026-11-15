# VERIFY (started 2026-11-14T05:50:00Z)
step1 started in background via out/verify/run1.sh; progress in out/verify/progress.txt. cmp attend.mjs vs old: exit 0
- attend.mjs: cmp exit 0 = identical to /home/claude/rex_mindtree_old/test/attend.mjs (not copied)
- step1 progress: platform exit 0, saltline exit 0, smoke fast exit 0 (full running)

## Step 1 tests
| test | exit | output |
|---|---|---|
| node test/platform.mjs | 0 | out/verify/platform.txt |
| node test/saltline.mjs | 0 | out/verify/saltline.txt |
| smoke --force --against baseline (fast) | 0 | out/verify/smoke_fast.txt |
| smoke --full --force --against baseline | 0 (inner: attend 1, predator_matrix 1, peril 1; documented in smoke.md as known-unreliable, not worse than baseline) | out/verify/smoke_full.txt |
| review.mjs | 0 | out/verify/review.txt |
| review.mjs mind | 0 | out/verify/review_mind.txt |

attend.mjs identical to old copy (cmp exit 0).
Baseline hash aaa066faa57c vs current tree be11bd094470 (src changed since baseline, so diffs below are expected differences, not regressions-by-itself).

### Fast tier changed numbers (verbatim)
```
fast: aaa066faa57c (2026-11-14T05:01) -> be11bd094470
platform.platform.voice_encounter_thoughts_plain_and_true_to_this_world.n1: 22 -> 21
platform.platform.leave_roam_goals_inside_the_bounds.n2: 11 -> 10
platform.platform.leave_roam_never_stands_still_in_a_walk_for_long_saltline_25_37_s.n1: 7.3 -> 7
platform.platform.noise_footsteps_still_heard_over_a_constant_engine.n1: 0.105 -> 0.075
review.review.idle_watching_player_60s.legs_pass_through_each_other_ankle_gap_m.ticks: 28 -> (none)
review.review.idle_watching_player_60s.legs_pass_through_each_other_ankle_gap_m.worst: 0.02 -> (none)
review.review.targets_all_around.legs_pass_through_each_other_ankle_gap_m.ticks: 28 -> (none)
review.review.targets_all_around.legs_pass_through_each_other_ankle_gap_m.worst: 0.02 -> (none)
review.review.jog_4_5.legs_pass_through_each_other_ankle_gap_m.ticks: 24 -> (none)
review.review.jog_4_5.legs_pass_through_each_other_ankle_gap_m.worst: 0.06 -> (none)
review.review.sprint_12.legs_pass_through_each_other_ankle_gap_m.ticks: 13 -> (none)
review.review.sprint_12.legs_pass_through_each_other_ankle_gap_m.worst: 0.03 -> (none)
review.review.pivots.legs_pass_through_each_other_ankle_gap_m.ticks: 26 -> (none)
review.review.pivots.legs_pass_through_each_other_ankle_gap_m.worst: 0.02 -> (none)
review.review.ridge_sculpt.legs_pass_through_each_other_ankle_gap_m.ticks: 8 -> (none)
review.review.ridge_sculpt.legs_pass_through_each_other_ankle_gap_m.worst: 0.06 -> (none)
review.review.lure_dragged.legs_pass_through_each_other_ankle_gap_m.ticks: 8 -> (none)
review.review.lure_dragged.legs_pass_through_each_other_ankle_gap_m.worst: 0.16 -> (none)
review.review.freeze_from_a_run.pop_clusters: (none) -> 14
review.review.freeze_from_a_run.top_pop_acc: (none) -> 1504
score.score.warn: 1 -> 2
score.score.fail: 4 -> 3
siege_warehouse.siege.warehouse.closest_snout_m: 3.06 -> 16.55
siege_warehouse.siege.warehouse.body_in_wall_ticks: 106 -> 10
siege_warehouse.siege.warehouse.worst_wall_pen_m: 0.11 -> 0.05
siege_warehouse.siege.warehouse.snout_deepest_m: 1.11 -> -0.28
siege_warehouse.siege.warehouse.snout_inside_ticks: 1179 -> 0
siege_warehouse.siege.warehouse.eye_los_ticks: 1267 -> 0
siege_warehouse.siege.warehouse.neck_len_max_m: 1.72 -> 1.71
siege_warehouse.siege.warehouse.head_step_max_cm: 16 -> 14.9
siege_warehouse.siege.warehouse.head_speed_max: 19.2 -> 17.9
thoughts_mind.thoughts.kind.want: 46 -> 47
thoughts_mind.thoughts.kind.belief: 26 -> 25
```

### Full tier changed numbers (verbatim)
```
full: aaa066faa57c (2026-11-14T04:49) -> be11bd094470
platform.platform.voice_encounter_thoughts_plain_and_true_to_this_world.n1: 22 -> 21
platform.platform.leave_roam_goals_inside_the_bounds.n2: 11 -> 10
platform.platform.leave_roam_never_stands_still_in_a_walk_for_long_saltline_25_37_s.n1: 7.3 -> 7
platform.platform.noise_footsteps_still_heard_over_a_constant_engine.n1: 0.105 -> 0.075
review_mind.review.idle_watching_player_60s.legs_pass_through_each_other_ankle_gap_m.ticks: 28 -> (none)
review_mind.review.idle_watching_player_60s.legs_pass_through_each_other_ankle_gap_m.worst: 0.02 -> (none)
review_mind.review.targets_all_around.legs_pass_through_each_other_ankle_gap_m.ticks: 28 -> (none)
review_mind.review.targets_all_around.legs_pass_through_each_other_ankle_gap_m.worst: 0.02 -> (none)
review_mind.review.jog_4_5.legs_pass_through_each_other_ankle_gap_m.ticks: 24 -> (none)
review_mind.review.jog_4_5.legs_pass_through_each_other_ankle_gap_m.worst: 0.06 -> (none)
review_mind.review.sprint_12.legs_pass_through_each_other_ankle_gap_m.ticks: 13 -> (none)
review_mind.review.sprint_12.legs_pass_through_each_other_ankle_gap_m.worst: 0.03 -> (none)
review_mind.review.pivots.legs_pass_through_each_other_ankle_gap_m.ticks: 26 -> (none)
review_mind.review.pivots.legs_pass_through_each_other_ankle_gap_m.worst: 0.02 -> (none)
review_mind.review.ridge_sculpt.legs_pass_through_each_other_ankle_gap_m.ticks: 8 -> (none)
review_mind.review.ridge_sculpt.legs_pass_through_each_other_ankle_gap_m.worst: 0.06 -> (none)
review_mind.review.lure_dragged.legs_pass_through_each_other_ankle_gap_m.ticks: 8 -> (none)
review_mind.review.lure_dragged.legs_pass_through_each_other_ankle_gap_m.worst: 0.16 -> (none)
review_mind.review.mind_seed_3_person_drifts_freezes_runs.legs_pass_through_each_other_ankle_gap_m.ticks: 17 -> (none)
review_mind.review.mind_seed_3_person_drifts_freezes_runs.legs_pass_through_each_other_ankle_gap_m.worst: 0.14 -> (none)
review_mind.review.mind_seed_7_person_drifts_freezes_runs.pop_clusters: 108 -> 102
review_mind.review.mind_seed_7_person_drifts_freezes_runs.top_pop_acc: 3773 -> 3788
review_mind.review.mind_seed_7_person_drifts_freezes_runs.hips_slide_with_no_step_m.ticks: 40 -> 116
review_mind.review.mind_seed_7_person_drifts_freezes_runs.hips_slide_with_no_step_m.worst: 0.24 -> 0.04
review_mind.review.mind_seed_7_person_drifts_freezes_runs.toes_of_the_two_feet_touch_gap_m.ticks: 50 -> 41
review_mind.review.mind_seed_7_person_drifts_freezes_runs.legs_pass_through_each_other_ankle_gap_m.ticks: 67 -> (none)
review_mind.review.mind_seed_7_person_drifts_freezes_runs.legs_pass_through_each_other_ankle_gap_m.worst: 0.09 -> (none)
review_mind.review.mind_seed_7_person_drifts_freezes_runs.leg_over_extended_m.ticks: 33 -> 23
review_mind.review.mind_seed_7_person_drifts_freezes_runs.neck_joint_bend_35deg.ticks: 55 -> 101
review_mind.review.mind_seed_7_person_drifts_freezes_runs.neck_joint_bend_35deg.worst: 0.66 -> 0.72
review_mind.review.mind_seed_7_person_drifts_freezes_runs.knee_bends_backward.ticks: 7 -> (none)
review_mind.review.mind_seed_7_person_drifts_freezes_runs.knee_bends_backward.worst: 0.02 -> (none)
review_mind.review.mind_seed_7_person_drifts_freezes_runs.hips_very_low.ticks: 64 -> (none)
review_mind.review.mind_seed_7_person_drifts_freezes_runs.hips_very_low.worst: 0.46 -> (none)
review_mind.review.mind_seed_11_person_drifts_freezes_runs.legs_pass_through_each_other_ankle_gap_m.ticks: 40 -> (none)
review_mind.review.mind_seed_11_person_drifts_freezes_runs.legs_pass_through_each_other_ankle_gap_m.worst: 0.06 -> (none)
review_mind.review.freeze_from_a_run.pop_clusters: (none) -> 14
review_mind.review.freeze_from_a_run.top_pop_acc: (none) -> 1504
score.score.warn: 1 -> 2
score.score.fail: 4 -> 3
siege_all.siege.tower.body_in_wall_ticks: 88 -> 89
siege_all.siege.tower.neck_limit_ticks: 518 -> 520
siege_all.siege.tower.neck_bend_ticks: 518 -> 520
siege_all.siege.tower.neck_len_max_m: 1.72 -> 1.71
siege_all.siege.tower#1.body_in_wall_ticks: 88 -> 89
siege_all.siege.tower#1.neck_limit_ticks: 518 -> 520
siege_all.siege.tower#1.neck_bend_ticks: 518 -> 520
siege_all.siege.tower#1.neck_len_max_m: 1.72 -> 1.71
siege_all.siege.warehouse#3.closest_snout_m: 3.06 -> 16.55
siege_all.siege.warehouse#3.body_in_wall_ticks: 106 -> 10
siege_all.siege.warehouse#3.worst_wall_pen_m: 0.11 -> 0.05
siege_all.siege.warehouse#3.snout_deepest_m: 1.11 -> -0.28
siege_all.siege.warehouse#3.snout_inside_ticks: 1179 -> 0
siege_all.siege.warehouse#3.eye_los_ticks: 1267 -> 0
siege_all.siege.warehouse#3.neck_len_max_m: 1.72 -> 1.71
siege_all.siege.warehouse#3.head_step_max_cm: 16 -> 14.9
siege_all.siege.warehouse#3.head_speed_max: 19.2 -> 17.9
thoughts_mind.thoughts.kind.want: 46 -> 47
thoughts_mind.thoughts.kind.belief: 26 -> 25
attend.attend.hunt_near_seed_2.n1: 10 -> 12
attend.attend.hunt_near_seed_2.n2: 9 -> 11
attend.attend.hunt_near_seed_2.n3: 5 -> 7
attend.attend.hunt_near_seed_2.n4: 0 -> 1
attend.attend.hunt_near_seed_2.n5: 1 -> 0
attend.attend.hunt_near_seed_3.n5: 2 -> 0
attend.attend.hunt_noise_seed_2.n1: 15 -> 12
attend.attend.hunt_noise_seed_2.n2: 13 -> 11
attend.attend.hunt_noise_seed_2.n3: 6 -> 5
attend.attend.hunt_noise_seed_2.n4: 2 -> 1
attend.attend.hunt_noise_seed_3.n1: 20 -> 23
attend.attend.hunt_noise_seed_3.n2: 18 -> 21
attend.attend.hunt_noise_seed_3.n3: 1 -> 3
attend.attend.hunt_noise_seed_3.n4: 0 -> 1
attend.attend.besiege_seed_2.n1: 22 -> 21
attend.attend.besiege_seed_2.n2: 21 -> 20
attend.attend.besiege_seed_2.n5: 1 -> 0
attend.attend.besiege_seed_3.n1: 24 -> 29
attend.attend.besiege_seed_3.n2: 23 -> 27
attend.attend.besiege_seed_3.n5: 1 -> 0
attend.attend.total_thoughts: 433 -> 439
attend.attend.total_about_things: 393 -> 399
attend.attend.no_response: 17 -> 12
attend.attend.non_focus_pct: 23.9 -> 24.3
attend.attend.disregards: 20 -> 21
attend.attend.violation.you_sense: 4 -> 3
attend.attend.violation.prey_world: 2 -> (none)
attend.attend.violation.prey_feel: 1 -> (none)
attend.attend.violation.you_memory: 2 -> 1
afford.afford.containers.curious.snout_m: 7.7 -> 8.2
afford.afford.containers.curious.beh.besiege: 12 -> 11
afford.afford.containers.curious.beh.watch: 5 -> (none)
afford.afford.containers.curious.thoughts.want: 1 -> 2
afford.afford.containers.curious.thoughts.sense: 3 -> 2
afford.afford.containers.curious.thoughts.belief: 2 -> 1
afford.afford.containers.curious.thoughts.expect: 1 -> (none)
afford.afford.containers.food.snout_m: 7.7 -> 8.2
afford.afford.containers.food.beh.besiege: 12 -> 11
afford.afford.containers.food.beh.watch: 5 -> (none)
afford.afford.containers.food.thoughts.want: 1 -> 3
afford.afford.containers.food.thoughts.sense: 3 -> 1
afford.afford.containers.threat.snout_m: 7.7 -> 9.2
afford.afford.containers.threat.beh.besiege: 11 -> 10
afford.afford.ruins_door.curious.wall_max_m: 0.28 -> 0
afford.afford.ruins_door.curious.beh.besiege: 17 -> 16
afford.afford.ruins_door.curious.thoughts.do: 2 -> 1
afford.afford.ruins_door.food.wall_max_m: 0.28 -> 0
afford.afford.ruins_door.food.beh.besiege: 17 -> 16
afford.afford.ruins_door.food.thoughts.do: 2 -> 1
afford.afford.ruins_door.threat.snout_m: 7.7 -> 7.3
afford.afford.ruins_door.threat.wall_max_m: 0.28 -> 0
afford.afford.ruins_door.threat.beh.besiege: 17 -> 16
afford.afford.ruins_door.threat.thoughts.do: 2 -> 1
afford.afford.gatehouse_door.curious.snout_m: 7.5 -> 7.1
afford.afford.gatehouse_door.curious.beh.besiege: 10 -> 12
afford.afford.gatehouse_door.curious.beh.watch: 7 -> 5
afford.afford.gatehouse_door.curious.thoughts.sense: 3 -> 2
afford.afford.gatehouse_door.curious.thoughts.expect: 1 -> (none)
afford.afford.gatehouse_door.food.snout_m: 7.5 -> 7.1
afford.afford.gatehouse_door.food.beh.besiege: 10 -> 12
afford.afford.gatehouse_door.food.beh.watch: 7 -> 5
afford.afford.gatehouse_door.food.thoughts.feel: 3 -> 2
afford.afford.gatehouse_door.threat.snout_m: 9.6 -> 10.4
afford.afford.gatehouse_door.threat.beh.besiege: 8 -> 7
afford.afford.gatehouse_door.threat.thoughts.want: 2 -> 3
afford.afford.gatehouse_door.threat.thoughts.sense: 3 -> 2
afford.afford.containers.curious.beh.listen: (none) -> 6
afford.afford.containers.food.beh.listen: (none) -> 6
afford.afford.ruins_door.curious.beh.watch: (none) -> 1
afford.afford.ruins_door.curious.thoughts.sense: (none) -> 1
afford.afford.ruins_door.food.beh.watch: (none) -> 1
afford.afford.ruins_door.food.thoughts.sense: (none) -> 1
afford.afford.ruins_door.threat.beh.guard: (none) -> 1
afford.afford.ruins_door.threat.thoughts.sense: (none) -> 1
afford.afford.gatehouse_door.curious.thoughts.memory: (none) -> 1
predator_matrix.predator.body.curious.head_m: 3.51 -> 3.52
active_wanderer.active.wanderer.fed.s3.walking_samples: 166 -> 164
active_wanderer.active.wanderer.hungry.s3.deaths: 14s bitten, 87s bitten -> 14s bitten, 57s bitten
active_wanderer.active.wanderer.hungry.s3.first_hunt_s: 68 -> -
active_wanderer.active.wanderer.hungry.s3.pred_pct: 14 -> 6
active_wanderer.active.wanderer.hungry.s3.angry_pct: 0 -> 8
active_wanderer.active.wanderer.hungry.s3.running_while_walking: 1 -> 0
active_wanderer.active.wanderer.hungry.s3.walking_samples: 193 -> 72
active_wanderer.active.wanderer.starving.s3.pred_pct: 14 -> 9
active_wanderer.active.wanderer.starving.s3.walking_samples: 144 -> 106
active_wanderer.active.summary.wanderer_hungry.hunt: 68s (1/1) -> - (0/1)
gaze.gaze.stalk.samples: 3765 -> 3931
gaze.gaze.watch.samples: 3063 -> 2787
gaze.gaze.watch.mean_deg: 4 -> 2
gaze.gaze.watch.p90_deg: 4 -> 3
gaze.gaze.watch.gt60_pct: 0.9 -> 0.3
gaze.gaze.watch.gt120_pct: 0.7 -> 0
gaze.gaze.watch.beyond_neck_pct: 1.6 -> 0.4
gaze.gaze.watch.longest_s: 2.2 -> 0.5
gaze.gaze.watch.eps_gt1_5s: 1 -> 0
gaze.gaze.display.samples: 1246 -> 968
gaze.gaze.inspect.samples: 1064 -> 1539
gaze.gaze.inspect.p90_deg: 6 -> 8
gaze.gaze.feign.samples: 740 -> 667
gaze.gaze.feign.mean_deg: 31 -> 22
gaze.gaze.feign.p90_deg: 65 -> 49
gaze.gaze.feign.gt60_pct: 10.5 -> 5.5
gaze.gaze.feign.gt120_pct: 3.1 -> 0
gaze.gaze.feign.beyond_neck_pct: 7.6 -> 5.2
gaze.gaze.listen.samples: 606 -> 627
gaze.gaze.pause.mean_deg: 9 -> 8
gaze.gaze.pause.p90_deg: 33 -> 32
gaze.gaze.pause.beyond_neck_pct: 5 -> 4
gaze.gaze.pause.longest_s: 0.8 -> 0.5
gaze.gaze.butt.p90_deg: 24 -> 25
gaze.gaze.nudge.mean_deg: 32 -> 33
gaze.gaze.nudge.beyond_neck_pct: 20 -> 18.5
gaze.gaze.nudge.reported_pct: 20 -> 18.5
gaze.gaze.all.ticks: 14946 -> 14981
gaze.gaze.all.gt60_pct: 2.1 -> 1.6
gaze.gaze.all.beyond_neck_pct: 1.24 -> 0.91
gaze.gaze.all.unreported_episodes: 1 -> 0
navsoak_reach.navsoak.terrain7.walking_s: 885 -> 887
navsoak_reach.navsoak.terrain7.stuck_s: 5.6 -> 5.5
navsoak_reach.navsoak.terrain7.on_blocked_s: 4.1 -> 4
navsoak_reach.navsoak.terrain11.walking_s: 906 -> 901
navsoak_reach.navsoak.terrain11.stuck_s: 5.9 -> 5.5
navsoak_reach.navsoak.terrain11.on_blocked_s: 5.2 -> 4.8
```

## Step 2 build
out/verify/dist/app.js 1,871,529 bytes (1.8 MB) vs dist/app.js 1,844,403 bytes (built 04:16): +27,126 bytes (+1.5%). dist/ untouched.

## Step 3 load checks (out/verify/dist, 1280x720, SwiftShader headless, start card dismissed via #startGo click, 20 s run; script out/verify/tools/load.py; raw JSON out/verify/load_*.json; screenshots out/verify/img/load_*.png)
All three: backend WebGL2 (SwiftShader/ANGLE Vulkan, gpuClass software), body check (window.__bodyCheck) ok=true visible=true tris=36304 (reached "done" by frame 30; at the 20 s mark it still read stage "waiting" in #webgl and #perf because software frames run ~10 fps, it reached done later within the 90 s wait; plain was done at 20 s).
Console errors: none, no PAGEERROR, no failed requests, no HTTP >=400, in any of the three.
Console warnings (identical in all three, 4 lines): "[.WebGL-0x...]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels" (x3, the 4th ends "(this message will no longer repeat)"); SwiftShader driver message, not game code.
- (a) plain URL (no hash): started=true; screenshot out/verify/img/load_plain.png: animal body visible.
- (b) #webgl: started=true; screenshot out/verify/img/load_webgl.png: animal body visible.
- (c) #perf: started=true; screenshot out/verify/img/load_perf.png: see below. Readout (page overlay, at 20 s): "WebGL2 · software · ANGLE (Google, Vulkan ... SwiftShader" / level low (auto, build low) res 58% 739x415 / frame 100 avg 100 p95 100 p99 ms / js 60.71 avg 183.5 p95 ms / tris 287k calls 93 heap 101 MB / body checking 0 tris vb 6/8. Later __perfReport(): res 50% 640x360, frame 100 ms (the 0.1 s dt clamp, ~10 fps), js avg 46.15 p95 183.5, tris 286315, calls 88, heap 105 MB, body ok visible tris 36304 calls 1, gpuMs null. Numbers are software-rendering numbers, not representative of real GPUs.

WebGPU: attempted #webgpu load (adapter exists in headless and xvfb: vendor google, arch swiftshader), but src/main.js:35 rejects software/fallback adapters and restarts on WebGL2. Result: backend WebGL2, no console errors, same 4 SwiftShader warnings, body ok visible. This did NOT run on WebGPU; no true WebGPU check was done (no GPU). Studio images are WebGL2 too (studio default).

## Step 4 studio (batch out/verify/tools/studio_batch.sh, log out/verify/studio_log.txt; running in background, restart-safe)
Timing derived with a read-only node probe of the sim (flat ground, seed 3, same as studio): same-foot landing period at walk 2.2 m/s is 1.8 s (foot0 lands 4.367 s, 6.167 s) -> 6 frames at t=4.37+0.3k. turn120 (studio scen=turn, same goal as dump.mjs turn120, 120 deg) starts 0.5 s and settles at psi 2.094 by ~6.4 s -> 6 frames at 0.5,1.68,2.86,4.04,5.22,6.4. walk90: NOT a studio scenario (only walkturn: steer=1 continuously from 1 s). dump.mjs walk90 stops steering when heading change >= 1.42 rad, at 4.058 s, and settles at 1.579 rad; studio walkturn is identical to walk90 up to 4.058 s only, so the 4 walk90 frames are t=1.0,2.0,3.0,4.05 (heading 0 to ~1.39 rad, the steering phase; the coast to 90.5 deg is not shown). Jaw: studio has no named jaw states; used &jaw= override in rad on scen=stand t=3: wide open = 0.8 rad (the sim's roar/yawn gape peak, jawExtra 0.8), a third = 0.27 rad. foot_L uses scen=walk phase=... foot=L.

### Step 4 result: all 34 studio renders rc=0, all 1280x720 single PNGs, backend WebGL2 (not WebGPU), in out/verify/img/
Studio console: each run printed one "error: Failed to load resource: the server responded with a status of 404 (File not found)" (not identified; the studio page is a bare index.html, most likely /favicon.ico) plus SwiftShader "GPU stall due to ReadPixels" warnings. The game load checks had no 404s.
Frame instants (studio pose time, s; sim steps at 120 Hz so each is +0.005 of the request):
- walk_side_01..06 (cam=side, scen=walk, t=4.37,4.67,4.97,5.27,5.57,5.87): one stride (1.8 s) of straight walking at 2.2 m/s, 0.3 s apart, starting at the first foot (foot 0) landing (4.367 s).
- walk_front_01..06: the same six instants, cam=front.
- turn120_otop_01..06 (cam=otop, scale 64 px/m, scen=turn; t=0.5,1.68,2.86,4.04,5.22,6.4): on-the-spot turn to 120 deg (2.094 rad), first frame at turn start, last at settled heading.
- turn120_tq_01..06: same six instants, cam=tq (three-quarter front).
- walk90_top_01..04 (cam=top, scen=walkturn, t=1.0,2.0,3.0,4.05): walking with steering on; see limitation above (steering phase only, heading ~0 to ~80 deg of 90; not the literal walk90 scenario).
- eye_midstride (cam=eye, scen=walk, t=5.27): mid-stride (midpoint between the 4.367 and 6.167 landings of foot 0).
- foot_L_midstance / foot_L_heeloff / foot_L_toeoff (cam=foot_L, scen=walk, foot=L): pose times 3.067 / 3.275 / 3.583 s (phi 0.45 / 0.64 / 0.91, heel angle 0 / 0.13 / 0.6 rad).
- headeye_jaw_wide (cam=headeye, scen=stand, t=3, jaw=0.8 rad); headtq_jaw_third (cam=headtq, scen=stand, t=3, jaw=0.27 rad). "Wide" and "a third" are my reading of the sim's gape peak (0.8 rad, roar/yawn); the sim has no stated maximum gape constant.
Limitations: no named walk90 scenario in studio (see above); jaw is a numeric override rather than a sim behaviour.

## Step 5 arena renders (real page out/verify/dist, #test-webgl, 1280x720, via out/verify/tools/shot_arena_v.py = test/shot_arena.py pointed at the scratch dist + out/verify/tools/arena_v.py; first try worked)
Day mood (applyMood('day')), mode fly, 3 s advanced, animal idle-walking (speed ~2.1 m/s at the moment of the shot, sim frozen while shooting). Camera 1.7 m above terrain at the animal's left side (perpendicular to its heading), looking at a point 2.0 m above ground at the animal's sim position; lens fov 62.
- img/arena_day_08m.png: horizontal distance camera to animal position 8.0 m (to head 9.7 m)
- img/arena_day_20m.png: 20.0 m (to head 21.3 m)
Note: an earlier attempt with the camera in front of the animal put the head only ~3 m from the camera at "8 m" (sim position is near the hips); I discarded it and used the side position so the 8/20 m figures hold for both body and head. Console during the arena runs: warnings only (AudioContext not allowed to start before a gesture; "[dino] pointer lock: refused"; GL stall ReadPixels), no errors.

## Skipped / failed
- True WebGPU load check: not possible (software adapter only, game rejects it), see Step 3.
- walk90 exact scenario: not in studio (approximated, see Step 4).
- No file under src/ and nothing in dist/ changed; scratch tools in out/verify/tools/.
- Other: smoke exit 1 for attend, predator_matrix, peril inside the full tier (known, per test/smoke.md); the full-tier baseline hash differs from the current tree (aaa066faa57c vs be11bd094470).
