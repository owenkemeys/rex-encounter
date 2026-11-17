// node test/closeout.mjs : the closing card's advice. Varied synthetic fact sets, 10 draws each; repetition with the recent list; robustness on empty facts.
import { advice, pick, facts, incidentNo, TABLE_STATS } from '../src/view/closeout.js';
let seed = 12345; const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const sets = {
  'whistled, then stood still in the open': { whistleLast10: 2, still: true, openField: true, deaths: 2 },
  'shouted and ran': { shoutLast10: 1, running: true, openField: true },
  'flare hit it': { flares: 2, flareHit: true, running: true },
  'stones thrown': { stones: 3, stoneHit: true },
  'torch on': { torch: true, still: true },
  'ran straight at it': { running: true, straightAt: true, openField: true },
  'crouched in the open': { crouch: true, still: true, openField: true, farFromCover: true },
  'inside the barn': { inside: true, insideName: 'barn', deaths: 3 },
  'at a window of the warehouse': { inside: true, insideName: 'warehouse', atWindow: true },
  'on the tower': { onTop: true, nearName: 'feeding tower', near: true },
  'thrown through the air': { air: true, thrown: true, cause: 'thrown', running: true },
  'dining when approached': { dining: true, nearMeat: true, slowApproach: true },
  'it crashed into a wall first': { crashed: true, inside: true, insideName: 'containers' },
  'died within seconds of spawning': { early: true, deaths: 1, first: true },
  'LIVE clip, still in the open': { live: true, still: true, openField: true },
  'LIVE clip, visited before, whistled': { live: true, repeat: true, deaths: 3, whistleLast10: 1 },
  'twelfth visit, long life': { many: true, repeat: true, deaths: 12, long: true, runLong: true, zig: true },
};
let bad = 0;
for (const [name, f] of Object.entries(sets)) {
  const recent = [], out = new Map();
  for (let i = 0; i < 10; i++) { const r = pick(f, rng, recent); recent.push(r.index); if (recent.length > 8) recent.shift(); out.set(r.text, (out.get(r.text) || 0) + 1); }
  console.log(`\n# ${name}`); for (const [t, n] of out) console.log(`  ${n > 1 ? n + 'x ' : ''}${t}`);
}
// repetition: the common case, ran in the open, nothing else; 30 consecutive draws with the recent list (last 8) active
{ const f = { running: true, openField: true, deaths: 4 }, recent = [], seen = new Set(), seq = [];
  for (let i = 0; i < 30; i++) { const r = pick(f, rng, recent); if (recent.includes(r.index)) { console.log('REPEAT WITHIN RECENT', r.text); bad++; } recent.push(r.index); if (recent.length > 8) recent.shift(); seen.add(r.text); seq.push(r.text); }
  console.log(`\nran in the open: ${seen.size} distinct lines in 30 draws`); if (seen.size < 6) { console.log('FAIL: fewer than 6'); bad++; } }
// robustness
for (const f of [{}, undefined, null, { whistleLast10: NaN }]) for (let i = 0; i < 50; i++) { try { const s = advice(f, rng, []); if (typeof s !== 'string' || !s) throw new Error('empty'); } catch (e) { console.log('THROWS', e.message); bad++; } }
{ const s = advice({}, rng, Array.from({ length: 500 }, (_, i) => i)); if (typeof s !== 'string' || !s) bad++; }   // everything "recent": still answers
// facts on a missing tape
for (const t of [null, {}, { n: 5, death: 2, m: new Float32Array(10) }]) { try { facts(t, {}); } catch (e) { console.log('facts THROWS', e.message); bad++; } }
for (const s of [advice({ whistleLast10: 1 }, rng, [])]) if (/!/.test(s)) bad++;
// house style: no exclamation marks, nothing says dead / death / kill
{ const all = new Set(); for (let i = 0; i < 4000; i++) { const f = {}; for (const k of ['running', 'still', 'openField', 'inside', 'crouch', 'air', 'held', 'dining', 'many', 'early']) f[k] = rng() < 0.4; all.add(advice(f, rng, [])); }
  for (const s of all) if (/[!]|dead|death|die|kill|\bdied\b|eaten/i.test(s)) { console.log('STYLE', s); bad++; } }
console.log(`\ntable: ${TABLE_STATS.entries} entries, ${TABLE_STATS.phrasings} phrasings; incident for death 7: No. ${incidentNo(7)}`);
console.log(bad ? `\nFAILED (${bad})` : '\nok'); process.exit(bad ? 1 : 0);
