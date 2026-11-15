#!/usr/bin/env node
// Reads one play session recorded by src/telemetry.js and prints what it was like.
//
// usage: node test/session_report.mjs <file> [--session <sid>]
//   <file>: the session's documents as the host's db list tools return them, one JSON object per line
//           ({ id, data, updatedAt, ... }; a JSON array of such objects also works), from the collections
//           `sessions` (header), `chunks` (timeline + events) and `notes`. Documents of other sessions are ignored
//           (the newest session is used unless --session is given).
//           Or: the text the pause card's "copy session" put on the clipboard (a line starting "DINO-SESSION ").
import fs from 'node:fs';

const args = process.argv.slice(2);
if (!args.length) { console.error('usage: node test/session_report.mjs <file.jsonl|summary.txt> [--session <sid>]'); process.exit(1); }
const file = args[0], want = args.includes('--session') ? args[args.indexOf('--session') + 1] : null;
const raw = fs.readFileSync(file, 'utf8');
const J = (v, d) => { if (v == null) return d; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return d; } };

// ------------------------------------------------------------ load
let H = null, TL = [], EV = [], NOTES = [], warn = [], pasted = false;
const at = raw.indexOf('DINO-SESSION ');
if (at >= 0) {
  pasted = true;
  const P = J(raw.slice(at + 13).trim().split('\n')[0], null); if (!P) { console.error('could not read the pasted session'); process.exit(1); }
  H = P.header; TL = P.tl || []; EV = P.ev || []; NOTES = (P.notes || []).map((n) => ({ ...n, ringF: H.ringF, ring: J(n.ring, []), thoughts: J(n.thoughts, []), events: J(n.events, []), now: J(n.now, null), sounds: J(n.sounds, []) }));
  warn.push('read from a pasted summary: the timeline is coarse, note rings are at 1 Hz, death lead-ups are not included');
} else {
  let docs = [];
  const t = raw.trim();
  if (t.startsWith('[')) docs = J(t, []); else for (const line of t.split('\n')) { if (!line.trim()) continue; const d = J(line, null); if (d) docs.push(d); else warn.push('unreadable line: ' + line.slice(0, 60)); }
  docs = docs.map((d) => (d && d.data !== undefined ? d : { id: d && d.id, data: d && d.kind ? d : null, updatedAt: d && d.updatedAt }));
  for (const d of docs) if (!d.data) warn.push(`document ${d.id} came without data (too large?)`);
  docs = docs.filter((d) => d.data);
  const sids = [...new Set(docs.map((d) => d.data.s).filter(Boolean))].sort();
  const sid = want || sids[sids.length - 1];
  if (sids.length > 1 && !want) warn.push(`file holds ${sids.length} sessions; reporting the newest (${sid}); others: ${sids.slice(0, -1).join(', ')}`);
  const mine = docs.filter((d) => d.data.s === sid);
  H = (mine.find((d) => d.data.kind === 'session') || {}).data || { s: sid };
  const chunks = mine.filter((d) => d.data.kind === 'chunk').map((d) => d.data).sort((a, b) => a.n - b.n);
  for (let i = 0; i < chunks.length; i++) if (chunks[i].n !== i) { warn.push(`chunk ${i} missing`); break; }
  for (const c of chunks) { TL.push(...J(c.tl, [])); EV.push(...J(c.ev, [])); }
  NOTES = mine.filter((d) => d.data.kind === 'note').map((d) => d.data).sort((a, b) => a.k - b.k)
    .map((n) => ({ ...n, ring: J(n.ring, []), thoughts: J(n.thoughts, []), events: J(n.events, []), now: J(n.now, null), sounds: J(n.sounds, []) }));
  if (!H.start) warn.push('no session header document');
}
const TF = H.tlF || ['t', 'px', 'pz', 'yaw', 'pitch', 'spd', 'crouch', 'run', 'torch', 'flares', 'mode', 'rx', 'rz', 'rpsi', 'rv', 'beh', 'phase', 'focus', 'd', 'sees', 'facing', 'stance', 'hunger', 'arousal', 'interest', 'irritation', 'cert', 'fps'];
const RF = H.ringF || ['t', 'px', 'pz', 'yaw', 'spd', 'crouch', 'rx', 'rz', 'rpsi', 'rv', 'beh', 'd', 'sees', 'facing', 'fps'];
const obj = (F, r) => { const o = {}; F.forEach((k, i) => { o[k] = r[i]; }); return o; };
const tl = TL.map((r) => obj(TF, r)).sort((a, b) => a.t - b.t);
EV.sort((a, b) => a[0] - b[0]);
const END = Math.max(H.dur || 0, tl.length ? tl[tl.length - 1].t : 0, EV.length ? EV[EV.length - 1][0] : 0);

// ------------------------------------------------------------ helpers
const out = []; const P = (s = '') => out.push(s);
const mmss = (t) => { t = Math.max(0, Math.round(t || 0)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const f0 = (v) => (v == null ? '?' : Math.round(v));
const pct = (n, d) => (d ? Math.round((100 * n) / d) + '%' : '-');
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const runs = (seq) => { const r = []; for (const x of seq) { if (r.length && r[r.length - 1][0] === x) r[r.length - 1][1]++; else r.push([x, 1]); } return r; };
const evText = (e) => {
  const [t, ty, ...a] = e;
  switch (ty) {
    case 'th': return `thinks "${a[2]}" (${a[0] || a[1]})`;
    case 'beh': return `-> ${a[0]}${a[2] ? ' (' + a[2] + ')' : ''}`;
    case 'act': return `you: ${a[0]}${a[1] !== undefined && a[1] !== null && a[0] !== 'whistle' && a[0] !== 'shout' ? ' ' + (a[0] === 'flare' ? '(' + a[1] + ' left)' : a[1] ? 'on' : 'off') : ''}`;
    case 'ev': return `${a[0]} ${a[1]}${a[2] ? ' ' + a[2] : ''}${a[3] ? ' ' + a[3] : ''}${a[4] != null ? ' ' + a[4] : ''}`;
    case 'death': return `DEATH: ${a[0] || '?'}${a[1] ? ' (' + a[1] + ')' : ''}, lasted ${f0(a[2])} s`;
    case 'life': return `new life #${a[0]}`;
    case 'pause': return a[0] ? 'paused' : 'resumed';
    case 'lock': return `pointer lock ${a[0]}`;
    case 'audio': return `audio ${a[0]}: ${a[1]}`;
    case 'note': return `NOTE #${a[0]} (${a[1]})${a[2] ? ': "' + a[2] + '"' : ''}`;
    case 'err': case 'rej': return `${ty === 'err' ? 'ERROR' : 'UNHANDLED REJECTION'}: ${a[0]}${a[1] ? ' @ ' + a[1] : ''}`;
    case 'ctx': return `CONTEXT: ${a.join(' ')}`;
    case 'vis': return `page ${a[0]}`;
    case 'mode': return `mode ${a[0]}`;
    case 'dev': return `device ${a[0]}`;
    case 'set': return `settings ${a[0]}`;
    case 'tel': return `telemetry: ${a.join(' ')}`;
    case 'perf': return `perf ${a[0]} fps, ${a[1]} frames >50 ms, ${a[2]} >100 ms, worst ${a[3]} ms`;
    case 'snd': return `sound ${a[0]}>${a[1]}${a[2] > 1 ? ' x' + a[2] : ''}${a[3] != null ? ' g' + a[3] : ''}${a[4] != null ? ' ' + Math.round(a[4]) + ' m' : ''}`;
    case 'sst': return `(state: it ${a[0]} ${a[1]} m/s at ${f0(a[2])} m, you ${a[3]} m/s, herd moving ${a[4]}, nearest ${f0(a[5])} m${a[6] ? ', gesture ' + a[6] : ''}${a[7] ? ', events ' + a[7] : ''})`;
    case 'freeze': return a[0] ? 'note box opened (frozen)' : 'note box closed';
    case 'clips': return `clips ${a[0]}: ${String(a[1]).split(' ').filter(Boolean).length} in manifest, ${String(a[2]).split(' ').filter(Boolean).length} decoded, ${a[3] ?? 0} failed`;
    case 'start': return `start (build ${a[0]}, ${a[1]}, ${a[2]})`;
    default: return `${ty} ${a.map((x) => (typeof x === 'object' ? '[...]' : x)).join(' ')}`;
  }
};
/** What the rows of a window say: behaviours in order (with seconds), distance, sight, facing, frame rate. */
function digest(rows, F) {
  if (!rows.length) return ['(no state samples)'];
  const o = rows.map((r) => (Array.isArray(r) ? obj(F, r) : r)), span = (o[o.length - 1].t - o[0].t) || 0, dt = o.length > 1 ? span / (o.length - 1) : 0;
  const B = runs(o.map((x) => x.beh || '?')).map(([b, n]) => `${b}${dt ? ' ' + Math.max(1, Math.round(n * dt)) + 's' : ''}`);
  const ds = o.map((x) => x.d).filter((x) => x != null), fps = o.map((x) => x.fps).filter((x) => x != null);
  const sees = o.filter((x) => x.sees === 1).length, facing = o.filter((x) => x.facing === 1).length, crouch = o.filter((x) => x.crouch).length;
  const spd = o.map((x) => x.spd).filter((x) => x != null), maxSpd = spd.length ? Math.max(...spd) : null;
  const a = o[0], z = o[o.length - 1];
  return [
    `its behaviour: ${B.join(' > ')}`,
    `distance ${f0(ds[0])} m -> ${f0(ds[ds.length - 1])} m (closest ${f0(Math.min(...ds))} m); it saw you ${pct(sees, o.length)} of the time; you faced it ${pct(facing, o.length)}`,
    `you: (${f0(a.px)}, ${f0(a.pz)}) -> (${f0(z.px)}, ${f0(z.pz)}), top speed ${maxSpd == null ? '?' : maxSpd.toFixed(1)} m/s${crouch ? ', crouched ' + pct(crouch, o.length) : ''}; it: (${f0(a.rx)}, ${f0(a.rz)}) -> (${f0(z.rx)}, ${f0(z.rz)}), ${z.rv == null ? '' : z.rv.toFixed(1) + ' m/s at the end'}`,
    `frame rate ${fps.length ? Math.round(avg(fps)) + ' fps (min ' + Math.min(...fps) + ')' : '?'}`,
  ];
}
const inWin = (t0, t1, types) => EV.filter((e) => e[0] >= t0 && e[0] <= t1 && (!types || types.includes(e[1])));

// ------------------------------------------------------------ header
P(`SESSION ${H.s || '?'}${pasted ? ' (pasted)' : ''}`);
P(`started ${H.start || '?'} · build ${H.build || '?'} · lasted ${mmss(END)} (last saved ${H.updated || '?'}, by ${H.flush || '?'})`);
P(`device ${H.device || '?'} · viewport ${H.vw}x${H.vh} @${H.dpr} · ${H.backend || '?'} · quality ${H.level || H.tier || '?'} (tier ${H.tier}, ratio ${H.ratio}) · seed ${H.seed}`);
if (H.gpu) P(`gpu ${H.gpu}`);
if (H.settings) P(`settings ${Object.entries(H.settings).map(([k, v]) => k + ' ' + v).join(', ')}`);
if (H.ua) P(`ua ${H.ua}`);
const C = H.counts || {};
P(`counts: ${C.thoughts ?? '?'} thoughts, ${C.events ?? EV.length} events, ${NOTES.length} notes/marks, ${C.deaths ?? 0} deaths, ${C.errors ?? 0} errors · ${H.chunks ?? '?'} chunks, ${H.bytes ? Math.round(H.bytes / 1024) + ' kB' : '?'} stored · db ${H.db || '?'} · timeline every ${H.tlEvery ?? '?'} s`);
if (H.lives && H.lives.length) P(`lives: ${H.lives.map(([n, a, b, c]) => `#${n} ${mmss(a)}-${b == null ? 'end' : mmss(b)}${c ? ' (' + c + ')' : ''}`).join(', ')}`);
for (const w of warn) P(`! ${w}`);

// ------------------------------------------------------------ notes
P(); P(`NOTES AND MARKS (${NOTES.length}): what was happening in the 20 s before each`);
for (const n of NOTES) {
  P(`-- #${n.k} at ${mmss(n.t)} (life ${n.life ?? '?'}) ${n.how}${n.why ? ' [' + n.why + ']' : ''}${n.frozen != null ? ', box open ' + n.frozen + ' s' : ''}: ${n.text ? '"' + n.text + '"' : '(a mark: no words)'}`);
  const s = n.now; if (s) P(`   at that moment: you ${s.mode} at (${f0(s.px)},${f0(s.pz)})${s.crouch ? ' crouched' : ''}${s.torch ? ', torch on' : ''}, ${s.flares ?? '?'} flares; it ${s.beh}${s.phase ? '/' + s.phase : ''} at ${f0(s.d)} m${s.focus ? ', attending to ' + s.focus : ''}${s.stance ? ', ' + s.stance : ''}; it ${s.sees === 1 ? 'sees you' : 'does not see you'}, you ${s.facing ? 'face it' : 'do not face it'}`);
  P('   the 20 s before:'); for (const l of digest(n.ring || [], n.ringF || RF)) P('     ' + l);
  const th = (n.thoughts || []).filter((e) => e && e[0] >= n.t - 20).map((e) => `${mmss(e[0])} "${e[4]}"`);
  if (th.length) P(`     thoughts: ${th.join(' · ')}`);
  const es = inWin(n.t - 20, n.t, ['ev', 'act', 'beh', 'audio', 'lock', 'pause', 'death', 'err', 'rej']).filter((e) => !(e[1] === 'note'));
  const evs = es.length ? es : (n.events || []).filter((e) => e[0] >= n.t - 20);
  if (evs.length) P(`     events: ${evs.map((e) => mmss(e[0]) + ' ' + evText(e)).join(' · ')}`);
  const sn = (n.sounds || []).filter((e) => e && e[0] >= n.t - 20);
  if (sn.length) P(`     sounds: ${sn.map((e) => mmss(e[0]) + ' ' + evText(e).replace('sound ', '')).join(' · ')}`);
  const pf = inWin(n.t - 20, n.t + 10, ['perf']); if (pf.length) P(`     frame rate around it: ${pf.map((e) => e[2] + ' fps').join(', ')}`);
  P(`     screenshot: ${n.shot ? Math.round(n.shot.length / 1024) + ' kB jpeg (data URL in the note document, field "shot")' : 'none' + (n.shotWhy ? ' (' + n.shotWhy + ')' : '')}`);
}

// ------------------------------------------------------------ minute by minute
P(); P('MINUTE BY MINUTE');
for (let m = 0; m * 60 <= END; m++) {
  const t0 = m * 60, t1 = t0 + 60, rows = tl.filter((r) => r.t >= t0 && r.t < t1), es = EV.filter((e) => e[0] >= t0 && e[0] < t1);
  if (!rows.length && !es.length) continue;
  P(`-- ${mmss(t0)}`);
  if (rows.length) {
    const modes = [...new Set(rows.map((r) => r.mode))].join('/'), ds = rows.map((r) => r.d).filter((x) => x != null);
    const a = rows[0], z = rows[rows.length - 1];
    P(`   you (${modes}) (${f0(a.px)},${f0(a.pz)}) -> (${f0(z.px)},${f0(z.pz)}); it (${f0(a.rx)},${f0(a.rz)}) -> (${f0(z.rx)},${f0(z.rz)}); distance ${f0(Math.min(...ds))}-${f0(Math.max(...ds))} m (avg ${f0(avg(ds))}); sees you ${pct(rows.filter((r) => r.sees === 1).length, rows.length)}, you face it ${pct(rows.filter((r) => r.facing === 1).length, rows.length)}`);
    const moods = ['hunger', 'arousal', 'interest', 'irritation'].map((k) => { const v = rows.map((r) => r[k]).filter((x) => x != null); return v.length ? `${k} ${avg(v).toFixed(2)}` : null; }).filter(Boolean);
    const st = runs(rows.map((r) => r.stance).filter(Boolean)).map(([s]) => s);
    if (moods.length || st.length) P(`   mind: ${moods.join(', ')}${st.length ? '; stance ' + st.join(' > ') : ''}`);
  }
  const beh = es.filter((e) => e[1] === 'beh').map((e) => e[2]);
  if (beh.length) P(`   behaviours: ${beh.join(' > ')}`);
  const th = es.filter((e) => e[1] === 'th').map((e) => `${mmss(e[0])} "${e[4]}"`);
  if (th.length) P(`   thoughts: ${th.join(' · ')}`);
  const acts = es.filter((e) => e[1] === 'act').map((e) => `${mmss(e[0])} ${evText(e).replace('you: ', '')}`);
  if (acts.length) P(`   you did: ${acts.join(' · ')}`);
  const other = es.filter((e) => ['ev', 'death', 'life', 'note', 'err', 'rej', 'ctx', 'lock', 'vis', 'pause', 'mode'].includes(e[1])).map((e) => `${mmss(e[0])} ${evText(e)}`);
  for (const x of other) P(`   ${x}`);
  const pf = es.filter((e) => e[1] === 'perf' && !e[7]);
  if (pf.length) P(`   frame rate ${Math.round(avg(pf.map((e) => e[2])))} fps, ${pf.reduce((s, e) => s + e[3], 0)} frames >50 ms, ${pf.reduce((s, e) => s + e[4], 0)} >100 ms`);
}

// ------------------------------------------------------------ deaths
const deaths = EV.filter((e) => e[1] === 'death');
P(); P(`DEATHS (${deaths.length})`);
for (const e of deaths) {
  P(`-- at ${mmss(e[0])}: ${e[2] || '?'}${e[3] ? ' (' + e[3] + ')' : ''}, the life lasted ${f0(e[4])} s`);
  const R = e[5];
  if (R && R.rows) { P('   the 20 s before:'); for (const l of digest(R.rows, R.F || RF)) P('     ' + l); }
  else P('   (no lead-up ring in this record)');
  const th = ((R && R.th) || inWin(e[0] - 20, e[0], ['th'])).filter((x) => x && x[0] >= e[0] - 20); if (th.length) P(`     thoughts: ${th.map((x) => mmss(x[0]) + ' "' + x[4] + '"').join(' · ')}`);
  const es = inWin(e[0] - 20, e[0], ['ev', 'act', 'beh']); if (es.length) P(`     events: ${es.map((x) => mmss(x[0]) + ' ' + evText(x)).join(' · ')}`);
}

// ------------------------------------------------------------ errors
const errs = EV.filter((e) => ['err', 'rej', 'ctx'].includes(e[1]) || (e[1] === 'tel' && /fail/.test(e[2] + ' ' + e[3])));
P(); P(`ERRORS (${errs.length})`);
const byMsg = new Map(); for (const e of errs) { const k = evText(e); const x = byMsg.get(k) || { n: 0, first: e[0] }; x.n++; byMsg.set(k, x); }
for (const [k, x] of byMsg) P(`   ${mmss(x.first)} ${x.n > 1 ? x.n + 'x ' : ''}${k}`);

// ------------------------------------------------------------ performance
const pf = EV.filter((e) => e[1] === 'perf'), live = pf.filter((e) => !e[7]);
P(); P('PERFORMANCE');
if (live.length) {
  const fr = live.reduce((s, e) => s + e[6], 0), worst = live.reduce((a, e) => (e[2] < a[2] ? e : a), live[0]);
  P(`   ${Math.round(avg(live.map((e) => e[2])))} fps on average over ${live.length} windows of 10 s (${fr} frames); ${live.reduce((s, e) => s + e[3], 0)} frames over 50 ms, ${live.reduce((s, e) => s + e[4], 0)} over 100 ms; worst window ${worst[2]} fps at ${mmss(worst[0])} (longest frame ${worst[5]} ms)`);
  const bad = live.filter((e) => e[4] >= 5); if (bad.length) P(`   windows with 5+ frames over 100 ms: ${bad.map((e) => mmss(e[0])).join(', ')}`);
} else P('   no frame-time windows recorded');
const sets = EV.filter((e) => e[1] === 'set'); for (const e of sets) P(`   ${mmss(e[0])} settings now ${e[2]}`);

// ------------------------------------------------------------ sounds
{
  P(); P('SOUNDS');
  const fam = (c) => String(c).replace(/\d+$/, '');
  const S = []; let st = null;
  for (const e of EV) { if (e[1] === 'sst') st = e; else if (e[1] === 'snd') S.push([e, st && Math.abs(st[0] - e[0]) < 6 ? st : null]); }
  const clips = EV.find((e) => e[1] === 'clips');
  if (clips) { const man = String(clips[3]).split(' ').filter(Boolean), got = new Set(String(clips[4]).split(' ').filter(Boolean)), miss = man.filter((x) => !got.has(x));
    P(`   recordings: ${clips[2]}${clips[5] ? ', ' + clips[5] + ' failed' : ''}, ${got.size} of ${man.length} decoded${miss.length ? '; not decoded: ' + miss.join(' ') : ''}`); }
  else P('   recordings: no manifest state recorded');
  if (!S.length) P('   no sounds recorded');
  else {
    const tot = new Map(); for (const [e] of S) { const k = `${e[2]}>${fam(e[3])}`; tot.set(k, (tot.get(k) || 0) + e[4]); }
    P(`   in all (${S.reduce((a, [e]) => a + e[4], 0)} sounds; '-' = the method ran but no buffer/noise/tone primitive was seen: nothing played, or it starts its own source):`);
    P('     ' + [...tot].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · '));
    P('   per minute:');
    for (let m = 0; m * 60 <= END; m++) {
      const M = new Map(); for (const [e] of S) if (e[0] >= m * 60 && e[0] < m * 60 + 60) { const k = `${e[2]}>${fam(e[3])}`; M.set(k, (M.get(k) || 0) + e[4]); }
      if (M.size) P(`     ${mmss(m * 60)} ` + [...M].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · '));
    }
    // loud or frequent sounds while you and the animal were both nearly still
    const lvl = (e) => (e[5] == null ? 0 : e[5] * Math.min(1, 4 / Math.max(4, e[6] ?? 4)));
    const still = S.filter(([e, s]) => s && Math.abs(s[3] ?? 0) < 0.3 && Math.abs(s[5] ?? 0) < 0.3 && !String(e[3]).startsWith('bed:') && (lvl(e) > 0.12 || e[4] >= 3 || /thump|thud|smack|stoneHit|step|clack|crunch/.test(e[2])));
    P(`   loud, frequent or impacts while you and it were both nearly still (${still.length}):`);
    for (const [e, s] of still.slice(0, 60)) P(`     ${mmss(e[0])} ${e[2]}>${e[3]}${e[4] > 1 ? ' x' + e[4] : ''} gain ${e[5] ?? '?'} at ${e[6] == null ? '?' : Math.round(e[6]) + ' m'} (level ~${lvl(e).toFixed(2)})${e[7] ? ' args ' + e[7] : ''} | it ${s[2]}${s[8] ? ' ' + s[8] : ''} at ${f0(s[4])} m; herd moving ${s[6]}, nearest ${f0(s[7])} m${s[9] ? '; events ' + s[9] : ''}${s[10] ? '; rain ' + s[10] : ''}`);
    if (still.length > 60) P(`     ... and ${still.length - 60} more`);
  }
}

// ------------------------------------------------------------ anything odd
P(); P('ANYTHING ODD');
const odd = [];
{ // long silences of thought (while playing: not paused)
  const th = EV.filter((e) => e[1] === 'th').map((e) => e[0]), pz = EV.filter((e) => e[1] === 'pause');
  const pausedAt = (t) => { let p = 0; for (const e of pz) { if (e[0] > t) break; p = e[2]; } return p; };
  const pts = [0, ...th, END];
  for (let i = 1; i < pts.length; i++) if (pts[i] - pts[i - 1] > 90 && !pausedAt((pts[i] + pts[i - 1]) / 2)) odd.push(`no thoughts for ${Math.round(pts[i] - pts[i - 1])} s (${mmss(pts[i - 1])}-${mmss(pts[i])})`);
}
{ // behaviour flicker: A > B > A within 4 s, or 6+ changes in 10 s
  const b = EV.filter((e) => e[1] === 'beh'); let flick = [];
  for (let i = 2; i < b.length; i++) if (b[i][2] === b[i - 2][2] && b[i][0] - b[i - 2][0] < 4) flick.push(`${mmss(b[i - 2][0])} ${b[i - 2][2]}>${b[i - 1][2]}>${b[i][2]}`);
  for (let i = 5; i < b.length; i++) if (b[i][0] - b[i - 5][0] < 10) { flick.push(`${mmss(b[i - 5][0])} six behaviour changes in ${Math.round(b[i][0] - b[i - 5][0])} s`); i += 5; }
  if (flick.length) odd.push(`behaviour flicker (${flick.length}): ${flick.slice(0, 8).join('; ')}${flick.length > 8 ? '; ...' : ''}`);
}
{ // the animal out of the player's sight (not faced, or over 120 m away) for 2+ minutes while on foot
  let s = null;
  for (const r of tl) { const out = r.mode === 'foot' && (r.facing !== 1 || r.d > 120); if (out && s === null) s = r.t; if ((!out || r === tl[tl.length - 1]) && s !== null) { if (r.t - s > 120) odd.push(`you did not have it in view for ${Math.round((r.t - s) / 60)} min (${mmss(s)}-${mmss(r.t)})`); s = null; } }
}
{ // the animal never seeing the player for 3+ minutes on foot
  let s = null;
  for (const r of tl) { const no = r.mode === 'foot' && r.sees !== 1; if (no && s === null) s = r.t; if ((!no || r === tl[tl.length - 1]) && s !== null) { if (r.t - s > 180) odd.push(`it did not see you for ${Math.round((r.t - s) / 60)} min on foot (${mmss(s)}-${mmss(r.t)})`); s = null; } }
}
{ const au = EV.filter((e) => e[1] === 'audio'); if (!au.some((e) => /running/.test(e[3]))) odd.push('audio never ran (no running context recorded)' + (au.length ? `; last: ${au[au.length - 1][3]}` : '')); }
{ const lk = EV.filter((e) => e[1] === 'lock'); const ref = lk.filter((e) => /refused|error/.test(e[2]));
  if (ref.length) odd.push(`pointer lock refused ${ref.length}x (first: ${ref[0][2]})`);
  if (H.device === 'desktop' && !lk.some((e) => e[2] === 'on') && tl.some((r) => r.mode === 'foot')) odd.push('desktop session on foot without pointer lock ever being on'); }
{ const pz = EV.filter((e) => e[1] === 'pause' && e[2] === 1).length; if (END > 120 && pz / (END / 60) > 3) odd.push(`paused ${pz} times (${(pz / (END / 60)).toFixed(1)} per minute)`); }
{ const n = EV.filter((e) => e[1] === 'tel' && /fail/.test(e[2])).length; if (n) odd.push(`${n} db write failures`); }
{ if (deaths.length) { const fast = deaths.filter((e) => e[4] != null && e[4] < 20); if (fast.length) odd.push(`${fast.length} death(s) within 20 s of starting a life`); } }
{ const big = tl.filter((r, i) => i && r.mode === 'foot' && tl[i - 1].mode === 'foot' && r.t - tl[i - 1].t < 2 && Math.hypot(r.rx - tl[i - 1].rx, r.rz - tl[i - 1].rz) > 25); if (big.length) odd.push(`the animal jumped 25+ m between samples ${big.length}x (first at ${mmss(big[0].t)})`); }
{ let st = null; const n = []; for (const e of EV) { if (e[1] === 'sst') st = e; else if (e[1] === 'snd' && st && Math.abs(st[3] ?? 0) < 0.3 && Math.abs(st[5] ?? 0) < 0.3 && /thump|thud|smack|stoneHit|step|clack|crunch/.test(e[2]) && e[0] - st[0] < 6) n.push(e); }
  if (n.length) odd.push(`${n.length} impact/step sounds while you and it were both still (first at ${mmss(n[0][0])}: ${n[0][2]}>${n[0][3]}); see SOUNDS`); }
if (!odd.length) P('   nothing flagged'); else for (const x of odd) P('   - ' + x);

console.log(out.join('\n'));
