# smoke: cached before/after regression check

    node test/smoke.mjs [--full]         run the tier (fast default); if this source hash is already cached, print the cache instead
    node test/smoke.mjs --force          run again even if cached
    node test/smoke.mjs --against <hash|baseline>   only differing numbers as `test.number: before -> after`; runs the
                                         current tree first if not cached; exit 1 if any test's exit code got worse
    node test/smoke.mjs --save-baseline  copy the current result to out/smoke/baseline-<tier>.json
Usage: save a baseline on a clean tree once; after a change run `--against baseline` (add --full for the full tier).
Hash: first 12 hex of SHA-256 over path+contents of the rex's sim files (src/rex/**/*.js but not src/rex/skin), src/sim/**, src/paddock.js, src/terrain.js, src/math.js.
Cache: `out/smoke/<hash>-<tier>.json` {hash,tier,when,results:{test:{exit,seconds,numbers}}}, raw output in `out/smoke/<hash>-<tier>/<test>.txt`.
One child process at a time (cwd out/smoke/cwd), timeout 3 x measured time (min 60 s; timeout = exit 124).

## Tiers (measured with another agent on the other core, so up to 2x slower than alone)
- Fast, 182 s: platform 38; review 17; score --quick 31; siege warehouse, barn, culvert (seed 3, 90 s) 8/13/11; thoughts mind 3 --quiet 64.
- Full, 749 s: platform 37; review mind 39 (includes the default review); score --quick 38; siege all 3 90 75; thoughts mind 68 + attack 55;
  attend 148; afford all 3 20 (20 s, not 180) 69; predator matrix --seeds 3 --secs 120 43; active wanderer --seeds 3 --secs 120 31;
  peril 2 60 stand3,stand8,approach,attentive,run5,runpast4,hide 52; gaze 3 43; navsoak reach 53.
- Cut from full for time: thoughts stim/own/pred/active/siege, rocks and torch in peril, score without --quick, gaze seeds 5 and 8.

## Numbers extracted (each test has its own extractor; none fell back to exit code + output hash)
platform: each check 1/0 plus its parenthesised numbers, passed, total. review: per scenario pop clusters, top pop acc, per issue ticks and worst.
score: every graded value and its status, totals. siege: per structure body-in-wall ticks, worst depth, closest snout, snout depth, eye line-of-sight
ticks, neck limit and bend ticks, leg-in-collider ticks, chest-to-head max (neck length), head step and speed (the two towers are tower, tower#1).
thoughts: per run thoughts, distinct, repeats, about-you %, problems, plus SUMMARY. attend: per-line numbers, TOTAL incl. non-focus %, violation kinds.
afford: per place and verdict aff letters, seized, knocked, hurt, health, snout, wall max, behaviour seconds, thought kinds. predator, peril: per row
numbers and each CHECK 1/0. active: per run deaths, first hunt, knocked, stance %. gaze: nine columns per behaviour. navsoak: per terrain
reach/blocked/cut-off %, arrived, stuck s.

## Excluded as noisy (NOISY in smoke.mjs)
Two `--force` fast runs on an unchanged tree differed in one number: `score.perf.ms_per_arena_step` (0.654 vs 0.538), excluded with its status.
`seconds` is never compared. All else in the fast tier was identical; platform, score, thoughts mind and review matched across fast and full.

## Unreliable
- Exit 1 on this tree for thoughts attack (voice.think "not the newest thought" problems), predator matrix and peril (their checks need more seeds
  or time than the trimmed tiers give); only a worse exit code is flagged for them, their numbers are still compared.
- afford, attend, navsoak ran once in full; active, predator, gaze, peril were rerun once and diffed (see report). thoughts.mjs runs two child
  processes, so smoke pins it to one core with taskset. In thoughts, siege:shed/pen/cleft print 0 thoughts (not in these tiers).
- score.mjs writes out/score.json relative to cwd, hence the scratch cwd; my first probe run rewrote it, restored from out/smoke/score.json.orig.
- The cache key is the source hash only: edits to tests or to smoke.mjs do not invalidate it (use --force).
