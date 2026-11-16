// Saltline Rex (v3): the SHARED animal (../../../src/sim, src/species: no copy here) in Saltline. This file, saltworld.js, pills.js, audio.js and
// view/rexbody_gl.js are the whole host. NOTE: the NPCs are computed as `world.creatures` (below) but the shared sim does not read them yet:
// the 'other creatures' module of v2 is parked in variants/saltline/pending/ until the shared mind has a hook for it (see notes/HOSTING.md).
// Loaded after Saltline has booted (window.__G, window.__ready). Everything it touches in Saltline:
//  - reads G.physics (boxes, bounds, groundHeight, raycast, lineOfSight), G.level (interiorBoxes, zones, groundSurfaceAt),
//    G.ground (puddles, wetness), G.enemies.list (positions, velocities, bodies of the hounds and drones), G.player
//  - listens to G.events (player:step, player:land, weapon:fire, impact, explosion, enemy:fire, enemy:step, thunder)
//  - wraps G.combat.playerShot so a rifle round that meets the animal first stops in it (Saltline's own impact event and FX)
//  - wraps G.enemies.update (the animal steps inside Saltline's gameplay update: paused when Saltline pauses) and G.hud.update
//  - calls G.enemies.alert(point, r) when the animal is loud (footfalls, roars): Saltline's NPCs go to investigate it
//  - applies its kill of an NPC through the NPC's own damage(); its kill of you through G.player.damage (Saltline's death flow)
//  - adds the rex mesh to G.scene; pills to #ui; its sounds to Saltline's AudioContext
// The NPCs are described by physical properties only (world.creatures, contract in pending/others.js): no Saltline names.
import { makeSaltTerrain } from './saltworld.js';
import { Creature } from '../../../src/sim/rex.js';
import { Mind } from '../../../src/sim/mind.js';
import { Arena } from '../../../src/sim/arena.js';
import { RexBodyGL } from './view/rexbody_gl.js';
import { makePills } from './pills.js';
import { RexAudio } from './audio.js';

const G = window.__G, THREE = G.THREE, DT = 1 / 120;
const REX_START = { x: -31, z: 15, yaw: Math.PI };      // open ground south of the player's start (-32, 6), out of the first view

// ---- the world, read off Saltline's physics (as in the old build; see saltworld.js for the mapping)
const P = G.physics, bounds = P.bounds;
const seaY = P.groundHeight(bounds.max.x - 0.2, 0, -100), groundY = P.groundHeight(bounds.min.x + 0.2, 0, -100);
let quayX = bounds.max.x; for (let x = bounds.min.x; x < bounds.max.x; x += 0.25) if (P.groundHeight(x, 0, -100) !== groundY) { quayX = x - 0.25; break; }
const desc = {
  boxes: P.boxes.map((b) => [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z, b.surface, b.tag, b.noNav ? 1 : 0, b.bulletOnly ? 1 : 0, b.playerOnly ? 1 : 0]),
  groundY, seaY, quayX, rect: { x0: bounds.min.x + 0.8, x1: Math.min(bounds.max.x, quayX) - 0.8, z0: bounds.min.z + 0.8, z1: bounds.max.z - 0.8 },
  interiors: (G.level.interiorBoxes || []).map((b) => ({ min: { ...b.min }, max: { ...b.max } })), zones: G.level.zones || [],
  surfaceAt: G.level.groundSurfaceAt ? (x, z) => G.level.groundSurfaceAt(x, z) : null,
  puddleDepth: G.ground && G.ground.puddleDepth ? (x, z) => G.ground.puddleDepth(x, z) : null,
  wetnessAt: G.ground && G.ground.wetnessAt ? (x, z) => G.ground.wetnessAt(x, z) : null,
};
const T = makeSaltTerrain(desc);
const prm = new URLSearchParams(location.search), seed = +(prm.get('rexseed') || (G.params && G.params.rexseed) || 3);
const sim = new Creature(T, { x: REX_START.x, z: REX_START.z, yaw: REX_START.yaw, seed }), mind = new Mind(sim, seed), arena = new Arena(T, sim, mind, seed);
arena.herd.disabled = true;      // Saltline has no prey herd; its NPCs come in as world.creatures
if (prm.get('rexhungry')) { mind.hunger = +prm.get('rexhungry'); mind.ov.hold.hunger = mind.hunger; }      // test lever only

// ---- the body, in Saltline's scene and renderer (classic WebGLRenderer: see view/rexbody_gl.js)
const lo = (G.quality && G.quality.name) === 'low' || prm.get('q') === 'low';
const body = new RexBodyGL({ tier: lo ? 'low' : 'high', wet: 0.75, fog: G.scene.fog && G.scene.fog.color ? G.scene.fog.color.clone() : undefined });
G.scene.add(body.group); body.fix = sim.fix; body.update(sim.pose);
const audio = new RexAudio(G.audio && G.audio.ctx, G.camera);
const pills = makePills({ THREE, camera: G.camera, sim, mind, arena, root: document.getElementById('ui') || document.body });

// ---- Saltline's NPCs as the animal perceives them: bodies with size, position, velocity, light, noise (no names)
const npc = new Map();      // id -> { size: {h, len}, light, prev }
const _v = new THREE.Vector3();
function npcInfo(e) {
  let I = npc.get(e.id); if (I && I.e === e) return I;
  // its body, measured from its own skeleton (the spread of its bones about its position, plus a hand's breadth of shell): not
  // from its meshes, whose bounds include a drone's searchlight cone; and how many lights it carries (the lamp, strobe and
  // beacon bones Saltline hangs its lights on), as how much light it gives off
  let h = 0.8, len = 1, lights = 0;
  try {
    const B = e.rig && e.rig.bones, g = e.rig && e.rig.group;
    if (B && g) {
      g.updateMatrixWorld(true); let y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const k in B) { const bn = B[k]; if (!bn || !bn.getWorldPosition) continue; bn.getWorldPosition(_v); const lx = _v.x - e.pos.x, lz = _v.z - e.pos.z;
        y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y); x0 = Math.min(x0, lx); x1 = Math.max(x1, lx); z0 = Math.min(z0, lz); z1 = Math.max(z1, lz); if (/lamp|strobe|beacon|light/i.test(k)) lights++; }
      const gy = P.groundHeight(e.pos.x, e.pos.y + 0.5, e.pos.z), feet = Number.isFinite(gy) && e.pos.y - gy < 0.3 ? gy : y0;
      if (y1 > y0 - 1) { h = Math.max(0.2, y1 - feet + 0.12); len = Math.max(0.3, Math.hypot(x1 - x0, z1 - z0) + 0.2); }
    }
  } catch (err) { /* defaults */ }
  I = { e, h, len, light: Math.min(1, 0.2 + 0.18 * lights), prev: null, loud: 0 };
  npc.set(e.id, I); return I;
}
function creatures(dt) {
  const out = [];
  for (const e of G.enemies.list || []) {
    if (!e || !e.alive || e.active === false || !e.pos) continue;
    const I = npcInfo(e), p = e.pos;
    let vx = 0, vy = 0, vz = 0;
    if (e.vel && Number.isFinite(e.vel.x)) { vx = e.vel.x; vy = e.vel.y; vz = e.vel.z; }
    else if (I.prev && dt > 0) { vx = (p.x - I.prev.x) / dt; vy = (p.y - I.prev.y) / dt; vz = (p.z - I.prev.z) / dt; }
    I.prev = { x: p.x, y: p.y, z: p.z };
    const g = P.groundHeight(p.x, p.y + 0.5, p.z), alt = p.y - (Number.isFinite(g) ? g : 0), ground = alt < 1.2;
    // the body's centre: a ground creature's position is its feet; a flyer's is its middle
    out.push({ id: String(e.id), x: p.x, y: ground ? p.y + I.h * 0.55 : p.y, z: p.z, vx, vy, vz, h: I.h, len: I.len, ground, light: I.light, loud: Math.max(0.04, I.loud), shiny: true, hard: true });
    I.loud *= Math.exp(-dt * 3);
  }
  return out;
}

// ---- noises, as the animal can hear them
const pl = G.player, noises = []; let flashT = 0;
const loudStep = (e) => (pl.crouching ? 0.012 : e.sprint ? 0.16 : 0.045) * (e.surface === 'metal' ? 1.5 : 1);
const on = (n, f) => G.events.on(n, (e) => { try { f(e || {}); } catch (err) { console.error('[saltrex] ' + n, err); } });
on('player:step', (e) => { const p = e.pos || pl.pos; noises.push({ x: p.x, y: p.y, z: p.z, loud: loudStep(e), kind: 'step', you: true }); });
on('player:land', () => noises.push({ x: pl.pos.x, y: pl.pos.y, z: pl.pos.z, loud: 0.12, kind: 'thud', you: true }));
on('weapon:fire', (e) => { const o = e.origin || pl.eye; noises.push({ x: o.x, y: o.y, z: o.z, loud: 1, kind: 'shout', you: true }); if (!shotWrapped && e.dir) { const h = rayRex(o, e.dir); if (h) rexHit(o, e.dir, h, 26, 'you'); } });
on('impact', (e) => { if (e.point && !e.rex) noises.push({ x: e.point.x, y: e.point.y, z: e.point.z, loud: 0.3, kind: 'thud' }); });
on('explosion', (e) => { if (e.pos) noises.push({ x: e.pos.x, y: e.pos.y || 0, z: e.pos.z, loud: 1, kind: 'thud' }); });
on('enemy:fire', (e) => {
  const en = e.enemy, p = e.pos || (en && en.pos); if (!p) return;
  noises.push({ x: p.x, y: p.y, z: p.z, loud: 0.8, kind: 'bang', src: en ? 'n' + en.id : 'npc' });
  if (en) npcInfo(en).loud = 0.8;
  // a round aimed at you that the animal's body is in the way of: it hits the animal (crossfire), at the NPC's damage
  if (e.dir && en) { const h = rayRex(p, e.dir); if (h && h.t < 120) { const TU = G.enemies.TUNE && G.enemies.TUNE[en.type]; rexHit(p, e.dir, h, (TU && (TU.boltDamage || TU.shotDamage)) || 6, String(en.id)); } }      // (the damage from Saltline's own tuning table for that NPC)
});
on('enemy:step', (e) => { const p = e.pos; if (p) { noises.push({ x: p.x, y: p.y, z: p.z, loud: e.crash ? 0.25 : 0.06, kind: 'clank', src: e.enemy ? 'n' + e.enemy.id : 'npc' }); if (e.enemy) npcInfo(e.enemy).loud = Math.max(npcInfo(e.enemy).loud, 0.08); } });
on('thunder', () => { flashT = 0.25; noises.push({ x: pl.pos.x + 150, y: 300, z: pl.pos.z, loud: 1, kind: 'thunder' }); });

// ---- missiles against the animal's body: the sim's own body capsules (things._bodySegs), Saltline's lineOfSight occluding
function rayRex(o, d) {
  const segs = arena.things._bodySegs(sim); let best = null;
  const dl = Math.hypot(d.x, d.y, d.z) || 1, dx = d.x / dl, dy = d.y / dl, dz = d.z / dl;
  for (const [A, B, rad, part] of segs) {
    const ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z, wx = o.x - A.x, wy = o.y - A.y, wz = o.z - A.z;
    const a = ux * ux + uy * uy + uz * uz, b = ux * dx + uy * dy + uz * dz, dd = ux * wx + uy * wy + uz * wz, e = dx * wx + dy * wy + dz * wz;
    const den = a - b * b; let s = den > 1e-9 ? (dd - b * e) / den : 0; s = Math.max(0, Math.min(1, s)); const t = Math.max(0, b * s - e);
    const px = A.x + ux * s - (o.x + dx * t), py = A.y + uy * s - (o.y + dy * t), pz = A.z + uz * s - (o.z + dz * t);
    if (Math.hypot(px, py, pz) < rad && t < 300 && (!best || t < best.t)) best = { t, part };
  }
  if (!best) return null;
  best.x = o.x + dx * best.t; best.y = o.y + dy * best.t; best.z = o.z + dz * best.t; best.dx = dx; best.dy = dy; best.dz = dz;
  if (!P.lineOfSight({ x: o.x, y: o.y, z: o.z }, new THREE.Vector3(best.x, best.y, best.z))) return null;      // a container took it
  return best;
}
// Saltline's damage onto the animal: a rifle round (26) is k = 1, the hardest blow a thrown stone gives; head and neck 1.5x.
// It is never killed here: what a hit does is the mind's (pain, grudge, wariness, retreat; pending/others.js for NPC fire).
function rexHit(o, d, h, dmg, by) {
  const k = (dmg / 26) * (h.part === 'head' || h.part === 'neck' ? 1.5 : 1), sp = 14 * k;
  arena.hits.push({ type: 'hit', id: -1, kind: 'bullet', missile: true, part: h.part, x: h.x, y: h.y, z: h.z, vx: h.dx * sp, vy: h.dy * sp, vz: h.dz * sp, speed: sp, from: { x: o.x, z: o.z }, by, dmg });
  stats.hits[by === 'you' ? 'you' : 'npc']++; stats.dmg += dmg;
}
// the player's rifle: a round that meets the animal before anything else stops in it (Saltline's own impact event and effects)
let shotWrapped = false;
if (G.combat && typeof G.combat.playerShot === 'function') {
  const shot0 = G.combat.playerShot.bind(G.combat); shotWrapped = true;
  G.combat.playerShot = (o, d, opt = {}) => {
    try {
      const h = rayRex(o, d);
      if (h) {
        const rng = opt.range || 300, l = P.raycast(o, d, rng), c = G.enemies.raycast ? G.enemies.raycast(o, d, l ? l.dist : rng) : null;
        if (h.t < Math.min(l ? l.dist : 1e9, c ? c.dist : 1e9)) {
          rexHit(o, d, h, opt.damage ?? 26, 'you');
          const f = { point: new THREE.Vector3(h.x, h.y, h.z), normal: new THREE.Vector3(-h.dx, -h.dy, -h.dz), dist: h.t, surface: 'rubber', enemy: null, dir: d, from: 'player', rex: true };
          G.events.emit('impact', f); return f;
        }
      }
    } catch (err) { console.error('[saltrex] shot', err); }
    return shot0(o, d, opt);
  };
}
const fwd = new THREE.Vector3();
function agents() {
  if (!pl.alive) return [];
  fwd.copy(pl.forward || { x: 0, y: 0, z: -1 }); const fl = Math.hypot(fwd.x, fwd.z) || 1;
  const sp = Math.hypot(pl.vel.x, pl.vel.z);
  return [{ id: 'you', x: pl.pos.x, y: pl.eye.y, z: pl.pos.z, vx: pl.vel.x, vz: pl.vel.z, speed: sp, crouch: !!pl.crouching, fx: fwd.x / fl, fz: fwd.z / fl, torch: false, lx: fwd.x, ly: fwd.y, lz: fwd.z }];
}

// ---- stepping, inside Saltline's gameplay update
const wr = { a: 1.1, s: 2.5 };
const stats = { steps: 0, deaths: 0, firstSeen: null, t: 0, hits: { you: 0, npc: 0 }, dmg: 0, npcKills: 0, alerts: 0, errors: 0 };
let acc = 0, opened = false, wasAlive = true, handled = false, killedApplied = false, alertT = 0;
const prev = { v: new Float32Array(sim.pose.v.length), s: new Float32Array(sim.pose.s.length) }, blend = { v: new Float32Array(sim.pose.v.length), s: new Float32Array(sim.pose.s.length) };
prev.v.set(sim.pose.v); prev.s.set(sim.pose.s);
function rexStep(dt) {
  if (!opened) { arena.opening({ x: pl.pos.x, z: pl.pos.z }); opened = true; prev.v.set(sim.pose.v); prev.s.set(sim.pose.s); }
  const V = arena.victim('you');
  if (pl.alive && !wasAlive) { arena.respawn('you', pl.pos.x, pl.pos.z); killedApplied = false; }      // Saltline's retry: a new individual
  wasAlive = pl.alive;
  acc += Math.min(dt, 0.1); let n = 0;
  const ag = agents(), cr = creatures(Math.min(dt, 0.1));
  while (acc >= DT && n < 14) {
    acc -= DT; n++; stats.steps++; stats.t += DT;
    prev.v.set(sim.pose.v); prev.s.set(sim.pose.s);
    wr.a += (Math.sin(stats.t * 0.013) * 0.5) * DT * 0.02; wr.s = 2 + 1.2 * Math.sin(stats.t * 0.05);
    const wind = { x: Math.sin(wr.a) * wr.s, z: Math.cos(wr.a) * wr.s };
    arena.step(DT, { agents: ag, noises: noises.splice(0), light: 0.55, flash: flashT > 0 ? 1 : 0, wind, creatures: cr });
    flashT -= DT;
    for (const e of arena.events) {
      audio.event(e, sim, { wet: 0.8 });
      // its kill of an NPC: through the NPC's own damage (Saltline's wreck, kill feed and score follow)
      if (e.src === 'mind' && e.type === 'kill' && e.other) {
        const id = String(e.id).slice(1), en = (G.enemies.list || []).find((q) => String(q.id) === id && q.alive);
        if (en && en.damage) { try { en.damage(9999, en.pos.clone(), new THREE.Vector3(Math.sin(sim.psi), 0.3, Math.cos(sim.psi)), 'body'); stats.npcKills++; } catch (err) { console.error('[saltrex] npc kill', err); } }
      }
      // it is loud: Saltline's NPCs within earshot come to see (their own investigate mode)
      if (G.enemies.alert && e.src === 'sim' && ((e.type === 'roar' && true) || (e.type === 'footfall' && (e.intensity ?? 1) > 1.1 && stats.t - alertT > 8))) {
        alertT = stats.t; stats.alerts++; try { G.enemies.alert(new THREE.Vector3(sim.x, groundY + 1.6, sim.z), e.type === 'roar' ? 45 : 22); } catch (err) { /* */ }
      }
    }
    arena.events.length = 0;
  }
  if (n === 14) acc = 0;
  if (mind.know.seen && stats.firstSeen === null) stats.firstSeen = stats.t;
  // your body: while the animal has you, it owns where you are; its kill is your death (Saltline's own death and retry)
  if (V.dead && pl.alive && !killedApplied) { killedApplied = true; stats.deaths++; pl.invulnerable = false; pl.damage(1e4, new THREE.Vector3(sim.head.pos.x, sim.head.pos.y, sim.head.pos.z)); audio.kill(sim); }
  const nowHandled = !V.dead && V.state !== 'free';
  if (nowHandled) { pl.pos.set(V.x, V.y, V.z); pl.vel.set(0, 0, 0); pl.enabled = false; if (G.camera) G.camera.position.set(V.cam.x ?? V.x, (V.cam.y ?? V.y + 1.2), V.cam.z ?? V.z); }
  else if (handled) pl.enabled = true;
  handled = nowHandled;
  // the pose between the last two 120 Hz steps, and the eyes on the sim's LIVE gaze target (never a copy held from boot)
  const a = Math.min(1, acc / DT);
  for (let i = 0; i < blend.v.length; i++) blend.v[i] = prev.v[i] + (sim.pose.v[i] - prev.v[i]) * a;
  for (let i = 0; i < blend.s.length; i++) blend.s[i] = prev.s[i] + (sim.pose.s[i] - prev.s[i]) * a;
  body.fix = sim.fix; body.glareEye = mind.dazzle || null; body.update(blend);
  const bn = mind.beh ? mind.beh.name : '';
  audio.frame(Math.min(dt, 0.1), sim, { tense: mind.know.seen && ['watch', 'stare', 'inspect', 'display', 'appraise', 'stalk', 'circle'].includes(bn) });
}
const enemiesUpdate = G.enemies.update.bind(G.enemies);
G.enemies.update = (dt) => { enemiesUpdate(dt); try { rexStep(dt); } catch (err) { stats.errors++; if (!rexStep.err) { rexStep.err = 1; console.error('[saltrex] step threw: ' + (err && err.stack || err)); } } };
const hudUpdate = G.hud.update.bind(G.hud);
let lastNow = performance.now() / 1000;
G.hud.update = (dt) => { hudUpdate(dt); const now = performance.now() / 1000; try { pills.frame(now, Math.min(0.1, now - lastNow), G.game.state === 'title'); } catch (err) { if (!pills.err) { pills.err = 1; console.error('[saltrex] pills threw', err); } } lastNow = now; };
window.__rex = { sim, mind, arena, T, stats, body, audio, creatures: () => creatures(0), desc: { groundY, seaY, quayX, rect: desc.rect } };
console.log(`[saltrex] v2: rex in the yard: ${T.obstacles.length} pillars from ${desc.boxes.length} boxes, quay at x=${quayX.toFixed(2)}, ${T.structures.length} structure(s); playerShot ${shotWrapped ? 'wrapped' : 'not found (weapon:fire ray only)'}; enemies.alert ${G.enemies.alert ? 'yes' : 'no'}`);
