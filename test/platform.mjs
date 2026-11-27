// Platform checks: the mind in a world that is not our arena (test/foreign_world.mjs: a rectangle far from the origin,
// structures and things of kinds the code has never heard of, made-up zone names). One check per clean-up item
// (out/platform/REPORT.md). Prints one line per check and exits 1 if any fails.
//   node test/platform.mjs [bounds|missile|props|gates|voice|leave|noise|tower|all]
import { makeForeign, RECT, STRUCTS, inRect } from './foreign_world.mjs';
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
import { placeWord, perceive, nameOf } from '../src/rex/brain/thoughts.js';
import { TYRANNOSAURUS } from '../src/rex/species/tyrannosaurus.js';
import { bodyRoom } from '../src/rex/body/nav.js';

const which = process.argv[2] || 'all', dt = 1 / 120;
let fails = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? '  (' + info + ')' : ''}`); if (!ok) fails++; };
const person = (x, z, y = null, T = null) => ({ id: 'you', x, z, y: y ?? (T ? T.height(x, z) + 1.65 : 13.65), vx: 0, vz: 0, speed: 0, crouch: false, fx: 1, fz: 0, lx: 1, ly: 0, lz: 0 });
function setup(seed = 3, x = 245, z = -305, yaw = 0) {
  const T = makeForeign(), sim = new Creature(T, { x, z, yaw, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  A.herd.disabled = true;      // a world with no prey animals (herd.js keeps its pastures round the origin)
  return { T, sim, mind, A };
}
const run = (S, secs, world = () => ({}), each = null) => {
  for (let i = 0; i < secs * 120; i++) {
    const w = world(i * dt) || {};
    S.A.step(dt, { agents: w.agents || [], noises: w.noises || [], hits: w.hits || [], light: 0.6, flash: 0, wind: { x: 1, z: 0.4 } });
    S.A.events.length = 0;
    if (each) each(i * dt);
  }
};
const WORDS_BAD = /\b(frobnicator|zarg|gully|meadow|shed|tower|pen|culvert|cleft|barn|zorb|quux|plinth9|gizmo|blorp|plastoid|unobtainium|driftwood|strange place)\b/;

// ---- item 2: rectangular bounds, the planner over the world wherever it lies, its body radius from the species
if (which === 'all' || which === 'bounds') {
  const S = setup();
  const nav = S.sim.nav;
  let open = 0, tot = 0; for (let x = RECT.x0 + 6; x < RECT.x1 - 6; x += 4) for (let z = RECT.z0 + 6; z < RECT.z1 - 6; z += 4) { tot++; if (nav.costAt(x, z) < Infinity) open++; }
  check('bounds: route grid covers the off-origin rectangle', open > 0.6 * tot, `${open}/${tot} cells open`);
  check('bounds: far corner reachable from the middle', nav.reachable(245, -305, 284, -276) && nav.reachable(245, -305, 206, -334));
  check('bounds: nothing outside the rectangle is walkable', nav.costAt(RECT.x1 + 6, -305) === Infinity && nav.costAt(245, RECT.z0 - 6) === Infinity);
  { const want = typeof TYRANNOSAURUS.navBody === 'number' ? TYRANNOSAURUS.navBody : bodyRoom(S.sim).pass;      // a number is a fixed radius; else measured off the body
    check('bounds: planner body radius from the species (or measured off its body)', Math.abs(nav.body - want) < 1e-9 && nav.body > 0.8 && nav.body < 2.6, `navBody ${TYRANNOSAURUS.navBody}, pass ${nav.body.toFixed(2)}, room ${nav.room.toFixed(2)}`); }
  const S2 = setup(5, 286, -300, Math.PI / 2); let out = 0;
  run(S2, 4, () => ({}), () => { if (S2.sim.x > RECT.x1 + 2.05 || S2.sim.x < RECT.x0 - 2.05) out++; });
  check('bounds: body kept to the rectangle, not pulled to the origin', out === 0 && Math.hypot(S2.sim.x - 286, S2.sim.z + 300) < 20, `at ${S2.sim.x.toFixed(1)},${S2.sim.z.toFixed(1)}`);
  const ps = S.mind.p.filter((p) => !inRect(p.x, p.z, -8.5)).length;
  check('bounds: belief particles start inside the world', ps === 0, `${ps} outside`);
}

// ---- item 2: a grudge from any missile that hits it, and no rock in its words when there was none
if (which === 'all' || which === 'missile') {
  const S = setup(3, 245, -305);
  const you = person(245, -290);
  let hitDone = false;
  run(S, 20, (t) => {
    const w = { agents: [you] };
    if (t > 6 && !hitDone) { hitDone = true; S.A.hits.push({ type: 'hit', kind: 'bullet', missile: true, by: 'you', part: 'chest', speed: 300, x: S.sim.x, y: 14, z: S.sim.z, vx: 0, vy: 0, vz: -300, from: { x: you.x, z: you.z } }); }      // as a foreign world reports a shot that hit (cf. Saltline)
    return w;
  });
  check('missile: a hit that is not a stone gives a grudge', S.mind.grudge > 0.05, `grudge ${S.mind.grudge.toFixed(2)}`);
  const rocks = S.mind.voice.stream.filter((e) => /\brock\b/.test(e.text));
  check('missile: no "rock" in its thoughts when no stone came', rocks.length === 0, rocks.map((e) => e.text).join(' | '));
}

// ---- item 2b: physical properties drive food, bright/hot objects, lights and non-'you' agent ids without arena names
if (which === 'all' || which === 'props') {
  // Open lane around x=228, z=-308..-293 (clear of BOXES and STRUCTS in foreign_world.mjs):
  // Foreign glowing/hot object ("ember") focuses, allows investigate, and triggers fire wariness;
  // foreign agent id ("visitor-7") with `light: true` builds grudge on missile hit without being named "you"
  const S1 = setup(3, 228, -308, 0);
  const visitor = { ...person(228, -295), id: 'visitor-7', light: true, lx: 0, ly: 0, lz: -1 };
  const ember = { id: 701, kind: 'ember', x: 228, y: S1.T.height(228, -301) + 0.1, z: -301, rest: true, bright: 0.9, hot: true, by: 'visitor-7' };
  let sawEmber = false, canInvestigate = false, hitSent = false;
  for (let i = 0; i < 8 * 120; i++) {
    const t = i * dt;
    const hits = t >= 2 && !hitSent && S1.mind.know.seen && (i % 12 === 0)
      ? (hitSent = true, [{ type: 'hit', kind: 'dart', missile: true, by: 'visitor-7', part: 'flank', speed: 18, x: S1.sim.x, y: 14, z: S1.sim.z, vx: 0, vy: 0, vz: -18, from: { x: visitor.x, z: visitor.z } }])
      : [];
    const intent = S1.mind.step(dt, { agents: [visitor], things: [ember], noises: [], hits, light: 0.5, flash: false, wind: { x: 0, z: -2 } });
    S1.sim.step(dt, intent); S1.sim.events.length = 0; S1.mind.events.length = 0;
    if (S1.mind.focus && S1.mind.focus.id === 701) { sawEmber = true; if (S1.mind.canStart('investigate')) canInvestigate = true; }
  }
  check('props: bright/hot foreign object ("ember") focuses and allows investigate', sawEmber && canInvestigate);
  check('props: hot foreign object close by triggers fire fear without kind "flare"', (S1.mind.ap.firedT ?? -99) > 0);
  check('props: non-"you" agent id ("visitor-7") builds grudge on missile hit', S1.mind.grudge > 0.05, `grudge ${S1.mind.grudge.toFixed(2)}`);

  // Foreign edible object ("ration") triggers focus and feed/trail eligibility without kind "meat"
  const S2 = setup(3, 228, -308, 0); S2.mind.hunger = 0.85;
  const ration = { id: 702, kind: 'ration', x: 228, y: S2.T.height(228, -301) + 0.1, z: -301, rest: true, edible: true, scent: 0.8, amount: 1, by: 'world' };
  let sawRation = false, canFeed = false;
  for (let i = 0; i < 5 * 120; i++) {
    const intent = S2.mind.step(dt, { agents: [], things: [ration], noises: [], hits: [], light: 0.8, flash: false, wind: { x: 0, z: -2 } });
    S2.sim.step(dt, intent); S2.sim.events.length = 0; S2.mind.events.length = 0;
    if (S2.mind.focus && S2.mind.focus.id === 702) { sawRation = true; if (S2.mind.canStart('feed')) canFeed = true; }
  }
  check('props: edible foreign object ("ration") focuses and allows feed', sawRation && canFeed);
}

// ---- item 3: whether it can get at you in or on a structure comes from geometry against its body, not the structure's kind
if (which === 'all' || which === 'gates') {
  const T0 = makeForeign(), byKind = (k, i = 0) => T0.structures.filter((S) => S.kind === k)[i];
  const cases = [
    // [label, structure, person offset from centre (local x, z), y above base, expect body, expect reach, the animal's side]
    ['small closed thing, by its narrow door', byKind('zorb', 0), [0, -2.9], 1.65, false, true, -1],
    ['big closed thing, inside', byKind('zorb', 1), [0, 2], 1.65, true, true, 1],
    ['low walls, inside by a wall', byKind('quux'), [0, 4.0], 1.65, true, true, 1],
    ['floor up on posts, on it', byKind('plinth9'), [0, 0], 4.6 + 1.65, false, null, -1],
  ];
  for (const [label, St, [lx, lz], up, wantBody, wantReach, side] of cases) {
    const S = setup(3, St.cx, St.cz + side * (St.hd + 9), side > 0 ? Math.PI : 0), you = person(St.cx + lx, St.cz + lz, St.base + up);
    S.mind.ov.omniscient = true;      // what it can do about you there, not whether it has spotted you yet
    run(S, 3, () => ({ agents: [you] }));
    const c = S.mind._ctx(), aff = c.aff;
    const ok = c.enclosed && c.enclosed.id === St.id && aff.body === wantBody && (wantReach === null || aff.reach === wantReach);
    check(`gates: ${label}`, ok, `inside ${c.enclosed ? c.enclosed.kind : '-'}, body ${aff.body}, reach ${aff.reach}, walled ${c.walled}, seize ${S.mind.canStart('seize')}, besiege ${S.mind.canStart('besiege')}`);
    if (!wantBody) check(`gates: ${label}: no contact moves, besiege open`, !S.mind.canStart('seize') && S.mind.canStart('besiege'));
    if (wantBody) check(`gates: ${label}: contact moves open`, S.mind.canStart('seize') && !c.walled);
  }
}

// ---- item 4: places and things in its words, without name tables, kept per structure / thing
if (which === 'all' || which === 'voice') {
  const S = setup(3);
  const th = S.mind.thinker || S.mind.th || Object.values(S.mind).find((v) => v && typeof v._name === 'function');
  const names = S.T.structures.map((St) => [St.kind, th._name('s' + St.id)]);
  check('voice: every unknown structure gets a word', names.every(([, n]) => n && n !== 'strange place' && n !== 'there'), names.map(([k, n]) => `${k}=${n}`).join(', '));
  check('voice: kept per structure, not per kind (two zorbs, two sizes)', names[0][1] !== names[1][1]);
  check('voice: kept once chosen', S.T.structures.every((St, i) => th._name('s' + St.id) === names[i][1]));
  check('voice: words are 1-2 plain words, none of the world\'s names', names.every(([, n]) => n.split(' ').length <= 2 && !WORDS_BAD.test(n)));
  // a world that lists no walls: what stands round the rim is felt
  const St = { ...S.T.structures[0], walls: [], id: 99 };
  const P = perceive(St, S.T, { length: 13, shoulderH: 3.1, width: 2.1 });
  check('voice: no wall list, closed and roofed felt from the rim', nameOf({ ...St, perceived: null }, P) === 'box', JSON.stringify({ walled: P.walled, roofed: P.roofed }));
  // zone strings are never said
  let bad = 0; for (let x = RECT.x0; x < RECT.x1; x += 3) for (let z = RECT.z0; z < RECT.z1; z += 3) { const w = placeWord(S.T, x, z, S.sim); if (w && WORDS_BAD.test(w)) bad++; }
  check('voice: made-up zone names produce no words', bad === 0);
  // landmarks of unknown kinds: a word from their shape, never "rock" (nothing here is rock)
  const wPost = th._where(255.5, -305.8), wLump = th._where(238, -308.5);
  check('voice: unknown standing things named by shape', /post/.test(wPost) && /big thing|lump/.test(wLump) && !/rock/.test(wPost + wLump), `"${wPost}", "${wLump}"`);
  // an encounter: every thought 2-5 words, nothing from the world's names
  const you = person(232, -284);
  let k = 0;
  run(S, 90, (t) => { if (t > 20 && t < 60) { you.x = 232 + 6 * Math.sin(t / 5); you.z = -287 + 3 * Math.cos(t / 4); you.speed = 1.3; } else you.speed = 0; return { agents: [you], noises: t > 30 && (k++ % 70 === 0) ? [{ x: you.x, y: 12, z: you.z, loud: 0.045, kind: 'step' }] : [] }; });
  const st = S.mind.voice.stream, badT = st.filter((e) => { const n = e.text.replace(/[.!?,]/g, ' ').split(/\s+/).filter(Boolean).length; return n < 2 || n > 5 || WORDS_BAD.test(e.text) || /\brock\b/.test(e.text); });
  check('voice: encounter thoughts plain and true to this world', st.length > 3 && badT.length === 0, `${st.length} kept, bad: ${badT.map((e) => e.text).join(' | ')}`);
}

// ---- item 5: leave and roam goals inside the actual bounds and reachable; no long stalls
if (which === 'all' || which === 'leave') {
  let worst = 0, outside = 0, leaves = 0, goalsOut = 0;
  for (const [seed, x, z, ux, uz] of [[3, 207, -333, 240, -300], [5, 283, -277, 250, -300], [8, 208, -276, 240, -310], [11, 282, -333, 250, -300]]) {
    const S = setup(seed, x, z, 0), you = person(ux, uz);
    let lp = { x: S.sim.x, z: S.sim.z, t: 0 };
    run(S, 150, (t) => ({ agents: t < 25 ? [you] : [] }), (t) => {
      const b = S.mind.beh; if (!inRect(S.sim.x, S.sim.z, -2.1)) outside++;
      if (b && (b.name === 'leave' || b.name === 'roam') && b.t < dt * 1.5) { leaves++; const g = b.route && b.route[b.route.length - 1]; if (g && !inRect(g.x, g.z, 1)) goalsOut++; }
      if (Math.hypot(S.sim.x - lp.x, S.sim.z - lp.z) > 1.5 || !b || !(b.name === 'leave' || b.name === 'roam')) lp = { x: S.sim.x, z: S.sim.z, t };
      else worst = Math.max(worst, t - lp.t);
    });
  }
  check('leave/roam: goals inside the bounds', goalsOut === 0, `${goalsOut} of ${leaves} outside`);
  check('leave/roam: never stands still in a walk for long (Saltline: 25-37 s)', worst < 20, `longest ${worst.toFixed(1)} s`);
  check('leave/roam: body stays in the world', outside === 0, `${outside} ticks outside`);
}

// ---- item 6: a constant background sound does not deafen it to footsteps
if (which === 'all' || which === 'noise') {
  const sal = (bg) => {
    const S = setup(3, 245, -305, 0); let got = null;
    run(S, 62, (t) => {
      const n = []; if (bg && Math.round(t * 120) % 60 === 0) n.push({ x: 262, y: 12, z: -295, loud: 0.5, kind: 'engine' });
      if (Math.round(t * 120) === 61 * 120) n.push({ x: 245, y: 12, z: -297, loud: 0.16, kind: 'step' });
      return { noises: n };
    }, (t) => { const L = S.mind.mem.lastNoise; if (got === null && t > 61 && L && L.kind === 'step') got = L.sal; });
    return got ?? 0;
  };
  const quiet = sal(false), loud = sal(true);
  check('noise: footsteps still heard over a constant engine', loud > 0.45 * quiet, `step salience ${loud.toFixed(3)} with engine vs ${quiet.toFixed(3)} without`);
}

// ---- item 3 (our arena): raised floors found from the openings give the same "inside" as the old tower rule
if (which === 'all' || which === 'tower') {
  const T = makeTerrain(3), raised = T.structures.filter((S) => S.floor !== undefined);
  let diff = 0, n = 0;
  for (const S of T.structures) for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) for (const dy of [null, 1.7, 3.2, 4.7, 6.1]) {
    const x = S.cx + i * S.hw / 3.2, z = S.cz + j * S.hd / 3.2, y = dy === null ? null : S.base + dy, got = T.insideStructure(x, z, y);
    // the old rule, by name
    let old = null; for (const Q of T.structures) { const dx = x - Q.cx, dz = z - Q.cz, lx = dx * Math.cos(Q.yaw) - dz * Math.sin(Q.yaw), lz = dx * Math.sin(Q.yaw) + dz * Math.cos(Q.yaw); if (Math.abs(lx) < Q.hw - 0.05 && Math.abs(lz) < Q.hd - 0.05) { if (Q.kind === 'tower') { if (y !== null && y > Q.base + 3) { old = Q; break; } } else { old = Q; break; } } }
    n++; if ((got && got.id) !== (old && old.id)) diff++;
  }
  check('tower: raised floors read off the openings (our arena)', raised.length === 2 && diff === 0, `${raised.map((S) => S.kind + ' ' + (S.floor - S.base).toFixed(1)).join(', ')}; ${diff}/${n} points differ from the old rule`);
}
console.log(fails ? `${fails} check(s) failed` : 'all platform checks passed');
process.exit(fails ? 1 : 0);
