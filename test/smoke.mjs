// Cached regression check: runs a fixed set of the standalone tests, pulls key numbers out of their output, and caches the
// result under out/smoke/<source-hash>-<tier>.json so "before" is recorded once per source state. See test/smoke.md.
//   node test/smoke.mjs                      fast tier (cached by source hash)
//   node test/smoke.mjs --full               full tier
//   node test/smoke.mjs --force              ignore the cache and run again
//   node test/smoke.mjs --against <hash|baseline>   print only the numbers that differ (runs the current tree if not cached)
//   node test/smoke.mjs --save-baseline      copy the current result to out/smoke/baseline-<tier>.json
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out', 'smoke');
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const arg = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const TIER = has('--full') ? 'full' : 'fast';

// ---------------------------------------------------------------- 1. source hash
function walk(dir) { const r = []; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) r.push(...walk(p)); else if (e.isFile()) r.push(p); } return r; }
function sourceHash() {
  const files = [...walk(path.join(ROOT, 'src/sim')), ...walk(path.join(ROOT, 'src/species')), ...['src/paddock.js', 'src/terrain.js', 'src/math.js'].map((f) => path.join(ROOT, f))]
    .map((f) => path.relative(ROOT, f).split(path.sep).join('/')).sort();
  const h = createHash('sha256');
  for (const f of files) { h.update(f + '\0'); h.update(fs.readFileSync(path.join(ROOT, f))); h.update('\0'); }
  return h.digest('hex').slice(0, 12);
}

// ---------------------------------------------------------------- 4. extraction
const slug = (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const NUM = /[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi;
const nums = (s) => (s.match(NUM) || []).map(Number);
const sha = (s) => createHash('sha256').update(s).digest('hex');
// Generic: one entry per output line, keyed by the line's label (its first `words` words, or the text before the first ':'),
// numbers named n1, n2, ... in order. Duplicate labels get #2, #3. Only used where the line format is fixed.
function lineNumbers(out, prefix, { words = 3, skip = null, colon = false } = {}) {
  const res = {}, seen = {};
  for (const raw of out.split('\n')) {
    const line = raw.trim(); if (!line || (skip && skip.test(line))) continue;
    let label = line.split(/\s+/).slice(0, words).join(' ');
    if (colon) { const c = line.indexOf(':'); if (c > 0 && c < 60) label = line.slice(0, c); }
    const ns = nums(line.slice(label.length));
    if (!ns.length) continue;
    let k = prefix + '.' + slug(label); seen[k] = (seen[k] || 0) + 1; if (seen[k] > 1) k += '#' + seen[k];
    ns.forEach((v, i) => { res[k + '.n' + (i + 1)] = v; });
  }
  return res;
}
const EX = {
  platform(out) {
    const r = {}; let ok = 0, total = 0;
    for (const l of out.split('\n')) {
      const m = l.match(/^(ok  |FAIL) (.*?)(?:  \((.*)\))?$/); if (!m) continue; total++; if (m[1] === 'ok  ') ok++;
      const k = 'platform.' + slug(m[2]).slice(0, 70); r[k] = m[1] === 'ok  ' ? 1 : 0; if (m[3]) nums(m[3]).forEach((v, i) => { r[k + '.n' + (i + 1)] = v; });
    }
    r['platform.passed'] = ok; r['platform.total'] = total; return r;
  },
  review(out) {      // `review.mjs mind` prints the default scenarios and then the mind-driven ones
    const r = {}; let cur = null;
    for (const l of out.split('\n')) {
      let m = l.match(/^== (.*): (\d+) pop clusters/); if (m) { cur = 'review.' + slug(m[1]); r[cur + '.pop_clusters'] = +m[2]; continue; }
      if (!cur) continue;
      m = l.match(/^\s+pop t=[\d.]+ .*? worst=\S+ acc=(\d+)/); if (m) { if (r[cur + '.top_pop_acc'] === undefined) r[cur + '.top_pop_acc'] = +m[1]; continue; }
      m = l.match(/^\s+! (.*): (\d+) ticks, worst ([\d.]+)/); if (m) { const k = cur + '.' + slug(m[1]); r[k + '.ticks'] = +m[2]; r[k + '.worst'] = +m[3]; }
    }
    return r;
  },
  score(out) {
    const r = {};
    for (const l of out.split('\n')) {
      let m = l.match(/^(\S.*?)\s{2,}(-?[\d.]+|ERR)\s+(?:<=|>=|-)\S*\s+(PASS|WARN|FAIL)\b/);
      if (m) { const k = 'score.' + m[1].replace(/\s*\(.*?\)\s*$/, '').trim(); r[k] = m[2] === 'ERR' ? 'ERR' : +m[2]; r[k + '.status'] = m[3]; continue; }
      m = l.match(/^SCORE: (\d+)\/(\d+) pass, (\d+) warn, (\d+) fail/); if (m) { r['score.pass'] = +m[1]; r['score.total'] = +m[2]; r['score.warn'] = +m[3]; r['score.fail'] = +m[4]; }
    }
    return r;
  },
  siege(out) {      // per structure (two share a kind, so the index is part of the key)
    const r = {}; let k = null, idx = -1;
    for (const l of out.split('\n')) {
      let m = l.match(/^== (\S+) \(inside: (\w+)\)/); if (m) { idx++; k = 'siege.' + m[1] + (idx ? '#' + idx : ''); continue; }
      if (!k) continue;
      if ((m = l.match(/closest snout to you ([\d.]+) m, body-part-in-wall ticks (\d+), worst ([\d.]+) m/))) { r[k + '.closest_snout_m'] = +m[1]; r[k + '.body_in_wall_ticks'] = +m[2]; r[k + '.worst_wall_pen_m'] = +m[3]; }
      else if ((m = l.match(/snout deepest inside (-?[\d.]+) m \(ticks inside (\d+)\), eye within 6 m with line of sight to you (\d+) ticks/))) { r[k + '.snout_deepest_m'] = +m[1]; r[k + '.snout_inside_ticks'] = +m[2]; r[k + '.eye_los_ticks'] = +m[3]; }
      else if ((m = l.match(/neck\/skull limit ticks (\d+)\/\d+ (\{.*?\})/))) { r[k + '.neck_limit_ticks'] = +m[1]; let b = 0; try { b = JSON.parse(m[2]).bend || 0; } catch (e) { /* none */ } r[k + '.neck_bend_ticks'] = b; const lc = l.match(/leg-in-collider ticks (\d+)/); if (lc) r[k + '.leg_in_collider_ticks'] = +lc[1]; }
      else if ((m = l.match(/chest-to-head max ([\d.]+) m, head step max ([\d.]+) cm\/tick \(head speed max ([\d.]+) m\/s\)/))) { r[k + '.neck_len_max_m'] = +m[1]; r[k + '.head_step_max_cm'] = +m[2]; r[k + '.head_speed_max'] = +m[3]; }
    }
    r['siege.structures'] = idx + 1; return r;
  },
  thoughts(out) {
    const r = {};
    for (const l of out.split('\n')) {
      let m = l.match(/^\s+(\S+:\S+)\s+(\d+) thoughts in (\d+) s .*?, (\d+) distinct, repeats within 60 s (\d+), about you (\d+)%(?:, PROBLEMS (\d+))?/);
      if (m) { const k = 'thoughts.' + slug(m[1]); r[k + '.thoughts'] = +m[2]; r[k + '.secs'] = +m[3]; r[k + '.distinct'] = +m[4]; r[k + '.repeats'] = +m[5]; r[k + '.about_you_pct'] = +m[6]; r[k + '.problems'] = +(m[7] || 0); continue; }
      m = l.match(/^SUMMARY: (\d+) runs, (\d+) thoughts, (\d+) distinct texts overall, repeat rate \(same text within 60 s\) ([\d.]+)%, by kind (\{.*?\}), problems (\d+)/);
      if (m) { r['thoughts.runs'] = +m[1]; r['thoughts.total'] = +m[2]; r['thoughts.distinct_total'] = +m[3]; r['thoughts.repeat_rate_pct'] = +m[4]; r['thoughts.problems'] = +m[6]; try { for (const [a, b] of Object.entries(JSON.parse(m[5]))) r['thoughts.kind.' + a] = b; } catch (e) { /* none */ } }
      if (/CRASHED/.test(l)) r['thoughts.crashed.' + slug(l)] = 1;
    }
    return r;
  },
  attend(out) {
    const r = lineNumbers(out, 'attend', { colon: true, skip: /^(TOTAL|violation)/ });
    const t = out.match(/^TOTAL (\d+) thoughts, (\d+) about things: no response (\d+), "it" not the focus (\d+), non-focus share ([\d.]+)% \(disregards (\d+)\)/m);
    if (t) { r['attend.total_thoughts'] = +t[1]; r['attend.total_about_things'] = +t[2]; r['attend.no_response'] = +t[3]; r['attend.it_not_focus'] = +t[4]; r['attend.non_focus_pct'] = +t[5]; r['attend.disregards'] = +t[6]; }
    const v = out.match(/^violation kinds (\{.*\})/m); if (v) try { for (const [a, b] of Object.entries(JSON.parse(v[1]))) r['attend.violation.' + slug(a)] = b; } catch (e) { /* none */ }
    return r;
  },
};
const generic = (prefix, o) => (out) => lineNumbers(out, prefix, o);

// numbers inside `name {"a":1,"b":2}` groups on a line -> prefix.name.a
function jsonGroups(line, prefix, r) {
  for (const m of line.matchAll(/(\w+) (\{[^{}]*\})/g)) { try { for (const [a, b] of Object.entries(JSON.parse(m[2]))) if (typeof b === 'number') r[prefix + '.' + m[1] + '.' + slug(a)] = b; } catch (e) { /* not json */ } }
}
const dashNum = (s) => (/^\s*-?\s*s?$/.test(s) ? null : +s.replace(/s$/, ''));
Object.assign(EX, {
  gaze(out) {      // one row per behaviour: samples mean p90 >60 >120 up>35 beyondNeck>45 reported longest eps>1.5s
    const r = {}, cols = ['samples', 'mean_deg', 'p90_deg', 'gt60_pct', 'gt120_pct', 'up35_pct', 'beyond_neck_pct', 'reported_pct', 'longest_s', 'eps_gt1_5s'];
    for (const l of out.split('\n')) {
      let m = l.match(/^(\w+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)s\s+(\d+)/);
      if (m) { cols.forEach((c, i) => { r['gaze.' + m[1] + '.' + c] = +m[i + 2]; }); continue; }
      m = l.match(/^ALL seen ticks: (\d+), gaze > 60 deg off target: ([\d.]+)%; attending you and > 45 deg beyond the neck's reach: ([\d.]+)%; unreported episodes > 1.5 s while attending you .*?: (\d+)/);
      if (m) { r['gaze.all.ticks'] = +m[1]; r['gaze.all.gt60_pct'] = +m[2]; r['gaze.all.beyond_neck_pct'] = +m[3]; r['gaze.all.unreported_episodes'] = +m[4]; }
    }
    return r;
  },
  navsoak(out) {      // per terrain: the reach fraction line and the summary line (the per-landmark lines are left out)
    const r = {}; let t = null;
    for (const l of out.split('\n')) {
      let m = l.match(/^== reach \(terrain (\d+)\): animal can reach ([\d.]+)% of the paddock; ([\d.]+)% blocked \(.*?\), ([\d.]+)% open but cut off/);
      if (m) { t = 'navsoak.terrain' + m[1]; r[t + '.reach_pct'] = +m[2]; r[t + '.blocked_pct'] = +m[3]; r[t + '.cut_off_pct'] = +m[4]; continue; }
      m = l.match(/reach summary: (\d+)\/(\d+) arrived, (\d+)s walking, stuck ([\d.]+)s total \(([\d.]+)%\), longest stuck ([\d.]+)s, on blocked cells ([\d.]+)s/);
      if (m && t) { r[t + '.arrived'] = +m[1]; r[t + '.goals'] = +m[2]; r[t + '.walking_s'] = +m[3]; r[t + '.stuck_s'] = +m[4]; r[t + '.longest_stuck_s'] = +m[6]; r[t + '.on_blocked_s'] = +m[7]; }
      m = l.match(/^\s+(the .*?)\s+-> \(.*?\) (arrived|NOT ARRIVED) in/); if (m && t && m[2] !== 'arrived') r[t + '.not_arrived.' + slug(m[1])] = 1;
    }
    return r;
  },
  afford(out) {
    const r = {};
    for (const l of out.split('\n')) {
      let m = l.match(/^(\S+)\s+(curious|food|threat)\s+aff (\S+) \| (.*?) \| seized (\d+) knocked (\d+) hurt (.*?) health ([\d.]+).*?\| snout ([\d.]+) m \| wall max ([\d.]+) m, through (\d+)/);
      if (m) { const k = 'afford.' + slug(m[1]) + '.' + m[2]; r[k + '.aff'] = m[3]; r[k + '.seized'] = +m[5]; r[k + '.knocked'] = +m[6]; r[k + '.hurt'] = m[7].trim(); r[k + '.health'] = +m[8]; r[k + '.snout_m'] = +m[9]; r[k + '.wall_max_m'] = +m[10]; r[k + '.through'] = +m[11];
        for (const b of m[4].matchAll(/(\w[\w/]*) (\d+)s/g)) r[k + '.beh.' + b[1]] = +b[2]; jsonGroups(l, k, r); continue; }
      m = l.match(/^\s+(\S+)\s+aff (\S+)\s+hurt under: (.*?)\s+body-in-wall (\d+)/); if (m) { const k = 'afford.' + slug(m[1]); r[k + '.summary_aff'] = m[2]; r[k + '.hurt_under'] = m[3]; r[k + '.body_in_wall'] = +m[4]; }
    }
    return r;
  },
  predator(out) {
    const r = {};
    for (const l of out.split('\n')) {
      let m = l.match(/^(s\d+ \S+)\s+curio\s+(\d+)%\s+wary\s+(\d+)%\s+preda\s+(\d+)%\s+angry\s+(\d+)%\s+afrai\s+(\d+)%\s+rival\s+(\d+)%/);
      if (m) { const k = 'predator.' + slug(m[1]); ['curious', 'wary', 'predatory', 'angry', 'afraid', 'rival'].forEach((c, i) => { r[k + '.' + c + '_pct'] = +m[i + 2]; }); jsonGroups(l, k, r); const v = l.match(/verdicts (.*)$/); if (v) r[k + '.verdicts'] = v[1].trim(); continue; }
      m = l.match(/^  (\w+)\s+(\d+)s\s+gaze\s+(\d+) deg\s+locked\s+(\d+)%\s+head ([\d.]+) m/); if (m) { const k = 'predator.body.' + m[1]; r[k + '.secs'] = +m[2]; r[k + '.gaze_deg'] = +m[3]; r[k + '.locked_pct'] = +m[4]; r[k + '.head_m'] = +m[5]; continue; }
      m = l.match(/^  (ok  |FAIL) (.*)$/); if (m) { r['predator.check.' + slug(m[2]).slice(0, 60)] = m[1] === 'ok  ' ? 1 : 0; continue; }
    }
    return r;
  },
  active(out) {
    const r = {};
    for (const l of out.split('\n')) {
      let m = l.match(/^(\w+)\s+(\w+)\s+s(\d+): deaths (.*?) \| first hunt\s+(\S+)s seize\s+(\S+)s contact\s+(\S+)s \| knocked (\d+) seized (\d+) worst health ([\d.]+) hurt (\d+)s \| stones (\d+) hit (\d+) \| pred (\d+)% angry (\d+)%/);
      if (!m) { const q = l.match(/^  (\w+ \w+)\s+deaths ([\d.]+)\/run (\{.*?\}) \| hunt (.*?) seize (.*?) \| knocked ([\d.]+)\/run \| hurt (\d+) s\/run/); if (q) { const k = 'active.summary.' + slug(q[1]); r[k + '.deaths_per_run'] = +q[2]; r[k + '.causes'] = q[3]; r[k + '.hunt'] = q[4].trim(); r[k + '.seize'] = q[5].trim(); r[k + '.knocked_per_run'] = +q[6]; r[k + '.hurt_s_per_run'] = +q[7]; } continue; }
      if (m) { const k = 'active.' + m[1] + '.' + m[2] + '.s' + m[3]; r[k + '.deaths'] = m[4].trim(); r[k + '.first_hunt_s'] = m[5]; r[k + '.first_seize_s'] = m[6]; r[k + '.knocked'] = +m[8]; r[k + '.seized'] = +m[9]; r[k + '.worst_health'] = +m[10]; r[k + '.hurt_s'] = +m[11]; r[k + '.stones'] = +m[12]; r[k + '.pred_pct'] = +m[14]; r[k + '.angry_pct'] = +m[15];
        const w = l.match(/while walking: (\d+)\/(\d+)/); if (w) { r[k + '.running_while_walking'] = +w[1]; r[k + '.walking_samples'] = +w[2]; } }
    }
    return r;
  },
});

Object.assign(EX, {
  peril(out) {
    const r = {};
    for (const l of out.split('\n')) {
      let m = l.match(/^(\w+)\s+died\s+(\d+)\/(\d+)\s+time-to-death median\s+(\S+) s \(10-90%: (\S+)\)\s+warnings before kill (\S+)\s+still-tell (\d+)\/(\d+)\s+causes (.*)$/);
      if (m) { const k = 'peril.' + m[1]; r[k + '.died'] = +m[2]; r[k + '.lives'] = +m[3]; r[k + '.median_death_s'] = m[4]; r[k + '.spread'] = m[5]; r[k + '.warnings'] = m[6]; r[k + '.still_tell_ok'] = +m[7]; r[k + '.still_tell_n'] = +m[8]; r[k + '.causes'] = m[9].trim(); continue; }
      m = l.match(/^strike, first motion to contact: (.*?)  \(reach ([\d.]+) m\)/); if (m) { r['peril.strike'] = m[1]; r['peril.reach_m'] = +m[2]; continue; }
      m = l.match(/^  (ok  |FAIL) (.*)$/); if (m) r['peril.check.' + slug(m[2]).slice(0, 60)] = m[1] === 'ok  ' ? 1 : 0;
    }
    return r;
  },
});
//__GENERIC__

// ---------------------------------------------------------------- 2. tiers
// est = seconds measured here (two cores, another agent on one); the timeout is 3 x est, at least 60 s.
// Every number whose key matches NOISY is left out of --against (varies with machine load; found by running the fast tier twice).
const NOISY = [      // filled in from the two --force fast runs; see smoke.md
  /^score\.perf\./,
];

const T = (name, args, tiers, est, extract, more = {}) => ({ name, args, tiers, est, extract, ...more });
const TESTS = [
  // fast: motion quality (review + score), a siege run incl. the warehouse, the thought stream, platform
  T('platform', ['platform.mjs'], ['fast', 'full'], 32, EX.platform),
  T('review', ['review.mjs'], ['fast'], 16, EX.review),
  T('review_mind', ['review.mjs', 'mind'], ['full'], 25, EX.review),      // the default scenarios plus the mind-driven ones
  T('score', ['score.mjs', '--quick'], ['fast', 'full'], 30, EX.score),
  T('siege_warehouse', ['siege.mjs', 'warehouse', '3', '90'], ['fast'], 10, EX.siege),
  T('siege_barn', ['siege.mjs', 'barn', '3', '90'], ['fast'], 10, EX.siege),
  T('siege_culvert', ['siege.mjs', 'culvert', '3', '90'], ['fast'], 10, EX.siege),
  T('siege_all', ['siege.mjs', 'all', '3', '90'], ['full'], 65, EX.siege),
  T('thoughts_mind', ['thoughts.mjs', 'mind', '3', '--quiet'], ['fast', 'full'], 90, EX.thoughts, { pin: true }),
  T('thoughts_attack', ['thoughts.mjs', 'attack', '3', '--quiet'], ['full'], 90, EX.thoughts, { pin: true }),
  T('attend', ['attend.mjs'], ['full'], 115, EX.attend),
  T('afford', ['afford.mjs', 'all', '3', '20'], ['full'], 70, EX.afford),
  T('predator_matrix', ['predator.mjs', 'matrix', '--seeds', '3', '--secs', '120'], ['full'], 46, EX.predator),
  T('active_wanderer', ['active.mjs', 'wanderer', '--seeds', '3', '--secs', '120'], ['full'], 36, EX.active),
  T('peril', ['peril.mjs', '2', '60', 'stand3,stand8,approach,attentive,run5,runpast4,hide'], ['full'], 58, EX.peril),
  T('gaze', ['gaze.mjs', '3'], ['full'], 35, EX.gaze),
  T('navsoak_reach', ['navsoak.mjs', 'reach'], ['full'], 53, EX.navsoak),
];


// ---------------------------------------------------------------- 3. run
function runTest(t) {
  const cwd = path.join(OUT, 'cwd'); fs.mkdirSync(cwd, { recursive: true });      // scratch cwd: score.mjs writes out/score.json relative to it, not into the project
  const script = path.join(ROOT, 'test', t.args[0]);
  let cmd = process.execPath, a = [script, ...t.args.slice(1)];
  if (t.pin && fs.existsSync('/usr/bin/taskset')) { a = ['-c', '0', cmd, ...a]; cmd = '/usr/bin/taskset'; }      // thoughts.mjs runs its cases in two child processes; pinning keeps it to one core
  const t0 = process.hrtime.bigint();
  const r = spawnSync(cmd, a, { cwd, encoding: 'utf8', timeout: Math.max(60, t.est * 3) * 1000, maxBuffer: 1 << 28 });
  const seconds = +(Number(process.hrtime.bigint() - t0) / 1e9).toFixed(1);
  const timedOut = !!(r.error && r.error.code === 'ETIMEDOUT');
  const exit = timedOut ? 124 : r.status === null ? 128 : r.status;
  return { exit, seconds, out: (r.stdout || '') + (r.stderr ? '\n--- stderr ---\n' + r.stderr : ''), timedOut };
}
function runTier(hash) {
  const dir = path.join(OUT, `${hash}-${TIER}`); fs.mkdirSync(dir, { recursive: true });
  const results = {};
  for (const t of TESTS.filter((x) => x.tiers.includes(TIER))) {
    process.stderr.write(`[smoke] ${t.name} ... `);
    const r = runTest(t);
    fs.writeFileSync(path.join(dir, t.name + '.txt'), r.out);
    let numbers;
    try { numbers = t.extract ? t.extract(r.out) : {}; } catch (e) { numbers = {}; }
    if (!t.extract || !Object.keys(numbers).length) numbers = { exit: r.exit, output_sha256: sha(r.out).slice(0, 16) };      // not extractable: exit code + hash of the output
    results[t.name] = { exit: r.exit, seconds: r.seconds, numbers, ...(r.timedOut ? { timedOut: true } : {}) };
    process.stderr.write(`exit ${r.exit}, ${r.seconds}s, ${Object.keys(numbers).length} numbers\n`);
  }
  const res = { hash, tier: TIER, when: new Date().toISOString(), results };
  fs.writeFileSync(path.join(OUT, `${hash}-${TIER}.json`), JSON.stringify(res, null, 1));
  return res;
}

// ---------------------------------------------------------------- 6. compare
const isNoisy = (k) => NOISY.some((re) => re.test(k));
function compare(before, after) {
  let worse = false; const lines = [];
  const names = [...new Set([...Object.keys(before.results), ...Object.keys(after.results)])];
  for (const n of names) {
    const b = before.results[n], a = after.results[n];
    if (!b || !a) { lines.push(`${n}: ${b ? 'missing in current run' : 'new test (not in ' + before.hash + ')'}`); continue; }
    if (b.exit !== a.exit) { const w = b.exit === 0 || (a.exit !== 0 && a.exit > b.exit); lines.push(`${n}.exit: ${b.exit} -> ${a.exit}${w ? '   WORSE' : ''}`); if (w) worse = true; }
    for (const k of [...new Set([...Object.keys(b.numbers), ...Object.keys(a.numbers)])]) {
      if (isNoisy(k) || (k === 'exit' && b.exit === a.exit)) continue;
      const x = b.numbers[k], y = a.numbers[k];
      if (x !== y) lines.push(`${n}.${k}: ${x === undefined ? '(none)' : x} -> ${y === undefined ? '(none)' : y}`);
    }
  }
  return { worse, lines };
}

// ---------------------------------------------------------------- main
fs.mkdirSync(OUT, { recursive: true });
const hash = sourceHash();
const cacheFile = path.join(OUT, `${hash}-${TIER}.json`);
const against = arg('--against');
let cur;
if (fs.existsSync(cacheFile) && !has('--force')) { cur = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); if (!against) { console.log(`cached: ${path.relative(ROOT, cacheFile)} (use --force to run again)`); } }
else { cur = runTier(hash); }
if (against) {
  const bf = against === 'baseline' ? path.join(OUT, `baseline-${TIER}.json`) : path.join(OUT, `${against}-${TIER}.json`);
  if (!fs.existsSync(bf)) { console.error(`no ${path.relative(ROOT, bf)}`); process.exit(2); }
  const before = JSON.parse(fs.readFileSync(bf, 'utf8')), { worse, lines } = compare(before, cur);
  console.log(`${TIER}: ${before.hash} (${before.when.slice(0, 16)}) -> ${cur.hash}`);
  console.log(lines.length ? lines.join('\n') : 'no differences');
  process.exit(worse ? 1 : 0);
}
if (has('--save-baseline')) { fs.copyFileSync(cacheFile, path.join(OUT, `baseline-${TIER}.json`)); console.log(`baseline saved: out/smoke/baseline-${TIER}.json (${hash})`); }
console.log(`${TIER} ${hash} ${cur.when}`);
for (const [n, r] of Object.entries(cur.results)) console.log(`  ${n.padEnd(14)} exit ${r.exit} ${String(r.seconds).padStart(6)}s  ${Object.keys(r.numbers).length} numbers`);
console.log(`  total ${Object.values(cur.results).reduce((s, r) => s + r.seconds, 0).toFixed(0)} s`);
