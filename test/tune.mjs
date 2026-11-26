// The tuning registry (src/rex/tune.js; the panel is src/view/tune.js) with the game's browser store (src/tunestore.js), headless: registration from the sim-side files, writing through the registry, reset, the copy text, persistence.
// node test/tune.mjs
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const { browserStore } = await import('../src/tunestore.js');      // as main.js: the store first, then everything that registers
const T = await import('../src/view/tune.js');
const mods = {};
for (const f of ['../src/rex/species/tyrannosaurus.js', '../src/sim/arena.js', '../src/sim/things.js', '../src/view/ptz.js', '../src/rex/skin/jawvoice.js', '../src/rex/skin/rexgeo.js', '../src/view/closeout.js']) { try { mods[f] = await import(f); } catch (e) { fails++; console.log('FAIL import', f, e.message.slice(0, 200)); } }
const { Mind } = await import('../src/rex/brain/mind.js'); const { RexSim } = await import('../src/rex/body/rex.js');
const { TYRANNOSAURUS } = mods['../src/rex/species/tyrannosaurus.js'];
// a Mind registers its dials on its own merged config
{ const { makeTerrain } = await import('../src/terrain.js'); const Tr = makeTerrain(7), sim = new RexSim(Tr, { x: 0, z: 0, psi: 0, seed: 1 }); new Mind(sim, 1); }
const before = T.tuneEntries().length;
console.log('registered headless (with one Mind):', before);
ok(before >= 80, 'at least 80 headless parameters, got ' + before);

// registry basics on a private object
const o = { x: 2, c: 0x112233, b: false }, hits = [];
const e = T.tune('Test group', 'A number', o, 'x', 0, 10, 0.5, (v) => hits.push(v), 'test.x');
const ec = T.tuneColor('Test group', 'A colour', o, 'c', (v) => hits.push(v), 'test.c');
const eb = T.tuneBool('Test group', 'A switch', o, 'b', null, 'test.b');
ok(e.def === 2 && !T.tuneChanged(e), 'default remembered, not changed');
T.tuneSet(e, 7.25); ok(o.x === 7.25 && hits.at(-1) === 7.25 && T.tuneChanged(e), 'set writes the object and calls onChange');
T.tuneSet(ec, 0xff0000); ok(o.c === 0xff0000, 'colour set');
T.tuneSet(eb, true); ok(o.b === true, 'bool set');
const txt = T.tuneCopyText().split('\n');
ok(txt.includes('test.x = 7.25 (was 2)'), 'copy line for a number: ' + txt.join(' | '));
ok(txt.includes('test.c = 0xff0000 (was 0x112233)'), 'copy line for a colour');
ok(txt.includes('test.b = true (was false)'), 'copy line for a bool');
ok(JSON.parse(store['rex.tune.v1']).v['Test group|A number'] === 7.25, 'persisted');
T.tuneReset(e); ok(o.x === 2 && !T.tuneChanged(e) && !T.tuneCopyText().includes('test.x'), 'reset restores the object and drops the line');
ok(!('Test group|A number' in JSON.parse(store['rex.tune.v1'] || '{"v":{}}').v), 'reset forgets the stored value');
T.tuneSet(e, 4); T.tuneResetAll(); ok(o.x === 2 && o.c === 0x112233 && o.b === false && T.tuneCount() === 0 && !('rex.tune.v1' in store), 'reset all');
T.tuneSet(e, 99); ok(o.x === 99, 'values outside the slider range are accepted'); T.tuneSet(e, 'abc'); ok(o.x === 99, 'junk ignored');
// re-registration (a rebuilt object) keeps the default and re-applies the stored value
const o2 = { x: 2 }; T.tune('Test group', 'A number', o2, 'x', 0, 10, 0.5, null, 'test.x'); ok(o2.x === 99 && T.tuneEntry('Test group|A number').def === 2, 're-registering re-applies the stored value and keeps the default');
T.tuneResetAll();
// a real one: the species file's crash block
const E = T.tuneEntries().find((x) => x.code === 'crash.reelFrom'); ok(E && E.obj === TYRANNOSAURUS.crash, 'crash.reelFrom registered on the species object');
const d = TYRANNOSAURUS.crash.reelFrom; T.tuneSet(E, d + 1); ok(TYRANNOSAURUS.crash.reelFrom === d + 1, 'species value moved'); T.tuneReset(E); ok(TYRANNOSAURUS.crash.reelFrom === d, 'species value restored');
const { PTZ } = mods['../src/view/ptz.js']; const P = T.tuneEntries().find((x) => x.code === 'ptz.margin'); T.tuneSet(P, 0.5); ok(PTZ.margin === 0.5, 'ptz margin moved'); T.tuneResetAll();
const co = T.tuneEntries().find((x) => x.code === 'card.seconds'); T.tuneSet(co, 3); ok(mods['../src/view/closeout.js'].LEN === 3, 'closing card length follows (live binding)'); T.tuneResetAll(); ok(mods['../src/view/closeout.js'].LEN === 6.4, 'and back');
// persistence across a fresh load
store['rex.tune.v1'] = JSON.stringify({ v: { 'Test group|Late': 5 }, pin: [] });
const T2 = await import('../src/rex/tune.js?again'); T2.tuneStorage(browserStore); const o3 = { y: 1 }; T2.tune('Test group', 'Late', o3, 'y', 0, 9, 1, null, 'test.y'); ok(o3.y === 5, 'stored value applied at registration'); ok(T2.tuneCount() === 1, 'count');
// without a store (a host that never calls tuneStorage, e.g. Saltline or a Node test): nothing is loaded or saved
{ const T3 = await import('../src/rex/tune.js?bare'); const o4 = { y: 1 }; T3.tune('Test group', 'Late', o4, 'y', 0, 9, 1, null, 'test.y'); ok(o4.y === 1, 'no store: the default stands'); const before3 = store['rex.tune.v1']; T3.tuneSet(T3.tuneEntry('Test group|Late'), 7); ok(o4.y === 7 && store['rex.tune.v1'] === before3, 'no store: set works, nothing written'); }
// every slider's current value lies within its range, steps are positive
let bad = 0; for (const x of T.tuneEntries()) if (x.kind === 'num' && !(x.step > 0 && x.min < x.max && x.obj[x.key] >= x.min - 1e-9 && x.obj[x.key] <= x.max + 1e-9)) { bad++; console.log('range', x.id, x.min, x.obj[x.key], x.max); }
ok(bad === 0, bad + ' parameters outside their own range');
const groups = {}; for (const x of T.tuneEntries()) groups[x.group] = (groups[x.group] || 0) + 1; console.log(groups);
console.log(fails ? 'FAILED ' + fails : 'ok');
process.exit(fails ? 1 : 0);
