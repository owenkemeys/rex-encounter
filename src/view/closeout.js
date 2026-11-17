// The closing card at the end of a saved clip: a visitor safety notice from the management of the (fictional) exhibit REX ENCOUNTER, whose headline is a
// piece of advice derived from how the player actually died. Pure: no DOM at import, nothing here touches the sim. Three parts:
//   facts(tape, extra)   what is cheaply known about this death, as booleans and counts (from the replay tape and what the game knew at death)
//   advice(facts, rng, recent)   one sentence, chosen among a table of entries by trigger, weighted to the specific, never one in `recent`
//   drawCard / drawTape  the card on a 2D canvas, and the tape treatment over it (the clip recorder calls these once per frame)
// Facts really used (everything else the owner listed is not available and is not guessed at):
//   tape (src/view/replay.js): the player's track (x y z, state free/air/down/pinned/held/dead, torch), the animal's head and torso positions, taped
//     things (flares, stones, meat), taped events (things hit/impact/ignite, mind bite/tear, sim contact with force), the camera mount label, the terrain.
//   extra (from main.js): cause and motive of death, the death count, seconds survived this life, whether crouching at the end.
//   note(): the player's whistles and shouts, which are noises and not taped events, are noted as they happen (clip.note, called from main.js).
//   derived with the terrain: inside / next to / far from named structures, at a window (inside, with the animal's body outside and its head close), on top.
// NOT available: the animal's thoughts (the owner does not want them), the "through the gap" reason string (derived from geometry instead), day or night
// (the arena is always at dusk: "torch on" stands for it), the player's facing relative to the animal (yaw convention not read; not used).
const HZ = 30, NN = 480, M = 20;      // the tape's rate, ring length and floats per frame (replay.js)
const FREE = 0, AIR = 1, PINNED = 4, HELD = 5;      // figure.js ST codes

// ------------------------------------------------------------------ whistles and shouts (noises, not taped events)
const marks = []; let markLast = -1, lifeCalls = { whistle: 0, shout: 0 };
/** A player noise as it is made. `f` is the tape position now (replay n + acc * 30), used to tell a new life (the tape restarts) and the last 10 s. */
export function note(kind, f) {
  if (kind !== 'whistle' && kind !== 'shout') return;
  if (f < markLast - 5) { marks.length = 0; lifeCalls = { whistle: 0, shout: 0 }; }
  markLast = f; marks.push({ f, kind }); lifeCalls[kind]++; if (marks.length > 60) marks.shift();
}

// ------------------------------------------------------------------ facts
const hyp = Math.hypot;
function off(S, x, z) {      // distance from a point to a structure's footprint (0 inside), and whether inside
  const dx = x - S.cx, dz = z - S.cz, c = Math.cos(S.yaw || 0), s = Math.sin(S.yaw || 0), lx = dx * c - dz * s, lz = dx * s + dz * c;
  const ax = Math.abs(lx) - S.hw, az = Math.abs(lz) - S.hd;
  return { d: hyp(Math.max(ax, 0), Math.max(az, 0)), inside: ax < -0.05 && az < -0.05 };
}
const plain = (S) => String((S && (S.name || S.kind)) || '').replace(/^the\s+/i, '').toLowerCase();

/** What is known about this death. Tolerant: any missing piece just leaves its facts false or zero. */
export function facts(tape, extra = {}) {
  const f = { cause: '', motive: '', used: [] }, ex = extra || {};
  f.cause = String(ex.cause || '').toLowerCase(); f.motive = String(ex.motive || '').toLowerCase();
  f.live = !!ex.live; f.deaths = f.live ? Math.max(0, ex.deaths | 0) : Math.max(1, ex.deaths | 0 || 1);      // (live: a clip taken in play, deaths so far) f.lasted = +ex.lasted || 0; f.crouch = !!ex.crouch; f.mount = String(ex.label || (tape && tape.label) || '');
  f.early = f.lasted > 0 && f.lasted < 20; f.long = f.lasted > 240; f.repeat = f.deaths >= (f.live ? 1 : 2); f.many = f.deaths >= 5; f.first = f.deaths === (f.live ? 0 : 1);
  f.used.push('cause', 'motive', 'deaths', 'lasted', 'crouch', 'mount');
  f.thrown = /thrown|tossed|fall|landed/.test(f.cause); f.pinned = /pin/.test(f.cause); f.tail = /tail|swipe/.test(f.cause); f.butt = /butt/.test(f.cause);
  f.held = /crush|bit|shak|eat|seiz/.test(f.cause); f.stamped = /stamp/.test(f.cause);
  let wh = 0, sh = 0; const cutoff = (tape && tape.death >= 0 ? tape.death : tape && f.live ? tape.n - 1 : markLast) - 300;
  for (const k of marks) if (k.f >= cutoff) (k.kind === 'whistle' ? wh++ : sh++);
  f.whistleLast10 = wh; f.shoutLast10 = sh; f.whistleLife = lifeCalls.whistle; f.shoutLife = lifeCalls.shout; f.callsLife = lifeCalls.whistle + lifeCalls.shout;
  f.used.push('whistles/shouts (noted live)');
  if (!tape || !(tape.n > 20) || !(tape.death >= 0 || f.live) || !tape.m) return f;
  const N = tape.N || NN, m = tape.m, T = tape.terrain, D = tape.death >= 0 ? tape.death : tape.n - 1, lo = Math.max(tape.n - N, D - 300, 0), at = (i) => (((i % N) + N) % N) * M;
  const st = (i) => Math.round(m[at(i) + 5]);
  let L = -1; for (let i = D; i >= lo; i--) if (st(i) === FREE) { L = i; break; }      // the last frame on foot
  const P = (i) => ({ x: m[at(i)], y: m[at(i) + 1], z: m[at(i) + 2] }), A = (i) => ({ x: m[at(i) + 17], y: m[at(i) + 18], z: m[at(i) + 19] }), Hd = (i) => ({ x: m[at(i) + 6], y: m[at(i) + 7], z: m[at(i) + 8] });
  const spd = (i, w) => { const a = P(Math.max(lo, i - w)), b = P(i); return hyp(b.x - a.x, b.z - a.z) / (Math.max(1, Math.min(w, i - lo)) / HZ); };
  const aspd = (i, w) => { const a = A(Math.max(lo, i - w)), b = A(i); return hyp(b.x - a.x, b.z - a.z) / (Math.max(1, Math.min(w, i - lo)) / HZ); };
  f.used.push('player track', 'animal torso and head track');
  for (let i = Math.max(lo, D - 30); i <= D; i++) { if (st(i) === AIR) f.air = true; if (st(i) === PINNED) f.pinned = true; }
  if (st(D) === HELD || st(Math.max(lo, D - 3)) === HELD) f.held = true;
  f.air = !!(f.air || f.thrown); f.used.push('player state codes');
  if (L >= 0) {
    const p = P(L), ab = A(L), hd = Hd(L), dist = hyp(ab.x - p.x, ab.z - p.z); f.dist = dist;
    const sp = spd(L, 45), sp2 = spd(L, 60); f.speed = sp;
    f.running = sp > 3.6; f.still = sp2 < 0.6 && !f.running;
    let still = 0; for (let i = L; i > lo + 5; i--) { if (spd(i, 10) < 0.6) still++; else break; } f.stillSecs = still / HZ; f.stoodLong = f.stillSecs >= 5;
    let runN = 0; for (let i = L; i > lo + 5; i--) { if (spd(i, 10) > 3.4) runN++; else break; } f.runSecs = runN / HZ; f.runLong = f.runSecs >= 5;
    const v = { x: P(L).x - P(Math.max(lo, L - 20)).x, z: P(L).z - P(Math.max(lo, L - 20)).z }, vm = hyp(v.x, v.z) || 1, ux = (ab.x - p.x) / (dist || 1), uz = (ab.z - p.z) / (dist || 1), cs = (v.x * ux + v.z * uz) / vm;
    f.straightAt = f.running && cs > 0.8; f.awayFrom = f.running && cs < -0.6 && dist < 40;
    // zigzag: heading changes of more than 50 degrees across half-second legs of the last 5 s
    { let turns = 0, prev = null; for (let i = L - 150; i + 15 <= L; i += 15) { if (i < lo) continue; const a = P(i), b = P(i + 15), dx = b.x - a.x, dz = b.z - a.z; if (hyp(dx, dz) < 0.9) { prev = null; continue; } const h = Math.atan2(dx, dz); if (prev !== null) { let d = h - prev; d -= Math.PI * 2 * Math.round(d / (Math.PI * 2)); if (Math.abs(d) > 0.87) turns++; } prev = h; } f.zig = turns >= 3; f.turns = turns; }
    f.chased = aspd(D, 90) > 6; f.slowApproach = !f.chased && dist < 14 && aspd(D - 30 < lo ? lo : D - 30, 90) < 2.8 && hyp(A(Math.max(lo, L - 150)).x - p.x, A(Math.max(lo, L - 150)).z - p.z) > dist + 3;
    f.used.push('speed, stillness, heading, zigzag, animal speed');
    // where
    let inside = null, nearest = null, nd = 1e9, minD = 1e9;
    for (const S of (T && T.structures) || []) {
      if (!S || !(S.hw > 0)) continue; if (/fence|jetty|rubble|bridge/.test(String(S.kind))) continue;
      const o = off(S, p.x, p.z); if (o.inside && (!S.floor || p.y - (S.base || 0) > 0.5 || true)) { if (!inside || S.hw * S.hd < inside.hw * inside.hd) inside = S; }
      if (o.d < nd) { nd = o.d; nearest = S; } minD = Math.min(minD, o.d);
    }
    f.inside = !!inside; f.insideName = inside ? plain(inside) : ''; f.insideKind = inside ? String(inside.kind) : '';
    f.near = !inside && nd < 6; f.nearName = f.near && nearest ? plain(nearest) : '';
    f.openField = !inside && minD > 14; f.farFromCover = !inside && minD > 30;
    f.onTop = !!(T && T.height && p.y - T.height(p.x, p.z) > 1.5);
    if (inside) { const ao = off(inside, ab.x, ab.z), ho = off(inside, hd.x, hd.z); f.atWindow = !ao.inside && hyp(hd.x - p.x, hd.z - p.z) < 6.5 && (ho.d < 5 || !ho.inside); }
    f.used.push('structures: inside / near / open / on top / at a window');
    f.torch = m[at(L) + 16] > 0.5; f.used.push('torch');
    // things on the tape
    const ids = { flare: new Set(), stone: new Set() }; let meat = false;
    for (let i = lo; i <= Math.min(D, tape.n - 1); i++) { const th = tape.th && tape.th[i % N]; if (!th) continue; for (const q of th) { if (ids[q.kind]) ids[q.kind].add(q.id); if (q.kind === 'meat' && q.amount > 0 && i >= D - 30 && hyp(q.x - p.x, q.z - p.z) < 12) meat = true; } }
    f.flares = ids.flare.size; f.stones = ids.stone.size; f.nearMeat = meat; f.used.push('taped things (flares, stones, meat)');
    // events
    let bites = 0, lastBite = -1, hitFlare = false, hitStone = false, crash = false;
    for (const e of tape.ev || []) { const q = e.e || {}, fr = e.f; if (fr < lo || fr > D + 1) continue;
      if (q.src === 'mind' && (q.type === 'bite' || q.type === 'tear')) { bites++; lastBite = fr; }
      if (q.src === 'things' && q.type === 'hit') { if (q.kind === 'flare') hitFlare = true; else if (q.kind === 'stone') hitStone = true; }
      if (q.src === 'sim' && q.type === 'contact' && (q.force || 0) >= 3 && fr >= D - 120) crash = true; }
    f.flareHit = hitFlare; f.stoneHit = hitStone; f.crashed = crash; f.dining = bites >= 2 && lastBite >= 0; f.nearMeat = f.nearMeat || (f.dining && dist < 25);
    f.used.push('taped events (hits, bites, contacts)');
  }
  return f;
}

// ------------------------------------------------------------------ the advice table
const E = [];      // { id, w, when, t: [phrasings] }
const add = (id, w, when, t) => E.push({ id, w, when, t });
// calls
add('whistle', 10, (f) => f.whistleLast10 > 0, ['Please do not whistle at the exhibit.', 'Whistling is not an approved means of greeting the exhibit.', 'Guests are asked to refrain from whistling. The exhibit hears everything.', 'The exhibit has not asked for your attention, and does not need whistling.']);
add('shout', 10, (f) => f.shoutLast10 > 0, ['Guests are asked to use their indoor voices at all times.', 'Raised voices are discouraged within the exhibit\'s hearing.', 'Please do not shout at the exhibit. It is aware of you.', 'The exhibit does not respond well to being addressed loudly.']);
add('calls', 8, (f) => f.callsLife >= 4, ['Guests are reminded that the exhibit comes when called. Once is plenty.', 'The exhibit answers all calls. Please call sparingly.', 'Guests who call the exhibit are asked to be sure of what they are calling.']);
add('whistle+still', 11, (f) => f.whistleLast10 > 0 && f.still, ['Whistling and then waiting is not a recognised procedure.', 'Please do not whistle at the exhibit and then stand where you are.']);
add('shout+run', 11, (f) => f.shoutLast10 > 0 && f.running, ['Guests may shout or run, but are asked to choose one.', 'Raised voices and running are separate activities. They are not improved by combining them.']);
// thrown things
add('flares', 7, (f) => f.flares >= 1, ['Flares are not to be thrown at the exhibit.', 'Pyrotechnics are reserved for authorised personnel and celebrations.', 'Guests are asked not to light things in the exhibit\'s direction.']);
add('flarehit', 10, (f) => f.flareHit, ['The exhibit is not to be struck with burning objects. It has opinions about this.', 'Please do not throw fire at the exhibit. It has not been shown to help.', 'Hot objects are not permitted in the exhibit\'s face.']);
add('flares-many', 8, (f) => f.flares >= 3, ['More flares do not make a better argument.', 'Guests are reminded that the exhibit is not impressed by quantity.']);
add('stones', 7, (f) => f.stones >= 1, ['Objects are not to be thrown at the exhibit.', 'Rocks are for admiring from a distance.', 'The exhibit does not play fetch.']);
add('torch', 6, (f) => f.torch, ['Torches attract attention after dark.', 'Guests carrying lights are reminded that the exhibit can see them too.', 'Illumination is provided by the management. Personal lighting is not recommended.']);
// moving
add('still', 7, (f) => f.still && f.openField, ['Standing perfectly still is not recognised as a safety measure.', 'Guests are reminded that stillness has not been shown to help.', 'Waiting for the exhibit to leave is not an approved procedure.']);
add('still-any', 5, (f) => f.still, ['Guests are asked to keep moving. The exhibit will be.', 'Guests who stop to admire the exhibit are asked to do so from further away.']);
add('stood-long', 8, (f) => f.stoodLong, ['Waiting for the exhibit to leave has not been shown to work.', 'Patience is a virtue. It is not a plan.']);
add('run', 5, (f) => f.running, ['Running is discouraged. So is standing still.', 'Guests are asked to walk. The exhibit will not.', 'Please do not run. The exhibit takes it as an invitation.']);
add('run-long', 7, (f) => f.runLong, ['Guests are thanked for the exercise. The exhibit appreciated it too.', 'Please pace yourself. The exhibit will not.']);
add('run-at', 9, (f) => f.straightAt, ['Guests are asked to move away from the exhibit, not toward it.', 'The exit is not in the exhibit\'s direction.', 'The exhibit is that way. The exit is the other way.']);
add('run-away', 5, (f) => f.awayFrom, ['Guests are reminded that the exhibit is faster. This is not a criticism of guests.', 'Running away is a popular choice. It is not a recommended one.']);
add('zig', 6, (f) => f.zig, ['Zigzagging is a recognised technique. Results vary.', 'Guests who change direction are thanked for the effort.']);
add('crouch', 6, (f) => f.crouch, ['Making oneself small is not recognised as a safety measure.', 'Crouching has not been shown to make guests less interesting.', 'Guests are reminded that being low is not the same as being hidden.']);
add('crouch-open', 9, (f) => f.crouch && f.openField, ['Crouching in the open is not considered hiding.', 'Guests are asked to hide behind things, not next to them.']);
add('open', 4, (f) => f.openField, ['The open grass is not a place of safety.', 'Guests are encouraged to remain near something solid.', 'Cover is available. It is not where the guest was.']);
add('open-far', 6, (f) => f.farFromCover, ['Guests are reminded that the lawn offers no cover whatsoever.', 'Open ground is not a place of safety. The management regrets the lack of alternatives.']);
add('open-run', 7, (f) => f.openField && f.running, ['Running across open ground is discouraged. So is open ground.', 'Running is easier with something to run to. Guests are asked to arrange this beforehand.']);
// places
const place = (id, name, w, t) => add(id, w, (f) => new RegExp(name).test(f.insideName) || new RegExp(name).test(f.nearName), t);
place('barn', 'barn', 8, ['Guests are reminded that the barn is not a place of safety.', 'The barn is a barn. It is not a shelter.', 'The management does not describe the barn as a refuge.']);
place('silo', 'silo', 8, ['Guests are reminded that the silo is not a place of safety.', 'The silo is for storage. Guests are not stored.']);
place('warehouse', 'warehouse', 8, ['The warehouse is not a place of safety, and has no staff.', 'Guests are reminded that a large building is, to the exhibit, a large door.']);
place('containers', 'container', 8, ['The containers are not a place of safety. They are containers.', 'Guests are reminded that a gap between two containers is also a gap.']);
place('ruins', 'ruin', 8, ['Guests are reminded that ruins are ruins for a reason.', 'The ruins are not a place of safety. They have been through this before.']);
place('gatehouse', 'gatehouse', 8, ['The gatehouse is not a gate. The management regrets any confusion.', 'Guests are reminded that the gatehouse is not a place of safety.']);
place('tower', 'tower|loft', 8, ['Guests are reminded that the tower is not a place of safety. It has been tried.', 'Elevated positions are for viewing only.']);
place('cave', 'cave|culvert', 8, ['Tunnels, caves and culverts are not places of safety. They have only one way out.', 'Guests are asked not to enter narrow places. The exhibit does not enter them either. It waits.']);
add('inside', 5, (f) => f.inside, ['Guests are reminded that buildings are for visiting, not for hiding.', 'Walls are provided for the comfort of guests and for no other purpose.', 'Doors and walls are advisory.']);
add('window', 10, (f) => f.atWindow, ['Windows are for looking through, in one direction only.', 'Guests are asked to stand back from windows. The exhibit will not.', 'Openings work both ways.', 'Guests are reminded that a window is a very small door.']);
add('next-to', 4, (f) => f.near, ['Standing next to a building is not the same as being inside one.', 'Guests are asked to keep a respectful distance from walls, and from the thing on the other side of walls.']);
add('top', 8, (f) => f.onTop, ['Please do not climb. The exhibit has already considered this.', 'Guests on raised platforms are reminded that the exhibit has a neck.', 'Height is not a deterrent.']);
// state at the end
add('air', 8, (f) => f.air, ['Flying is not available at this exhibit.', 'Rides are not offered at this exhibit.', 'Please keep both feet on the ground. The management cannot arrange this for you.']);
add('held', 6, (f) => f.held, ['Guests are asked not to accept lifts from the exhibit.', 'Guests must not be carried through the exhibit.', 'The exhibit\'s mouth is not an attraction.']);
add('pinned', 8, (f) => f.pinned, ['Guests are asked to stay out from underfoot.', 'Please watch where you stand. The exhibit does not.', 'Guests are asked to mind the exhibit\'s feet. The exhibit does not mind guests\'.']);
add('tail', 8, (f) => f.tail, ['Guests are asked to watch the whole exhibit, including the back.', 'The exhibit has two ends. Guests are asked to respect both.']);
add('butt', 7, (f) => f.butt, ['Guests are reminded that the exhibit\'s head is not to be stood in front of.', 'Please do not stand where the exhibit is looking. It will arrive.']);
add('crash', 8, (f) => f.crashed, ['The exhibit does not always stop for walls, or for guests behind them.', 'The exhibit is not always careful. This should not be mistaken for a lack of intent.']);
add('dining', 9, (f) => f.dining, ['The exhibit should not be approached while it is dining.', 'Guests are asked to give the exhibit privacy at mealtimes.', 'Interrupting the exhibit at lunch is not recommended.']);
add('meat', 8, (f) => f.nearMeat, ['Please do not feed the exhibit. This includes yourself.', 'Food left near the exhibit is not guest property.', 'Guests are asked not to stand near the exhibit\'s meals.']);
add('chased', 4, (f) => f.chased, ['Guests are reminded that the exhibit is quicker than it appears. It appears quick.', 'Please allow the exhibit right of way.']);
add('slow', 6, (f) => f.slowApproach, ['A calm exhibit is not necessarily a safe one.', 'The exhibit may approach at its own pace. Guests have no such option.', 'Guests are reminded that the exhibit is not always in a hurry.']);
// the life
add('early', 8, (f) => f.early, ['The exhibit is open on arrival. Guests are not required to hurry.', 'Guests are asked to read the signs before entering. This is one.', 'Orientation is available at the entrance. It was not used.']);
add('long', 6, (f) => f.long, ['Guests are thanked for their patience. It has been noted.', 'Extended visits are welcome. The exhibit also keeps long hours.']);
add('repeat', 6, (f) => f.repeat, ['Guests who have visited before are asked to recall what happened last time.', 'Returning guests are thanked. Previous advice still applies.', 'Guests are reminded that last time was also instructive.']);
add('many', 9, (f) => f.many, ['The management admires your commitment. The exhibit has not changed.', 'No loyalty programme exists. It is felt that none is needed.', 'Frequent visitors are reminded that the exhibit is equally keen every time.']);
// a living visitor (a clip taken in play): nobody has died, so these say nothing of it
add('live-pet', 3, (f) => f.live, ['Guests are reminded that the exhibit is not a petting attraction.', 'Visitors still on the premises are asked to reconsider.', 'The management notes that you are still with us, and thanks you for your continued attendance.']);
add('live-leave', 3, (f) => f.live, ['Guests are encouraged to leave while the visit is still going well.', 'Please do not become complacent.', 'Guests who have not yet been noticed are asked to remain unnoticed.']);
add('live-stay', 3, (f) => f.live, ['A pleasant visit is not the same as a safe one.', 'The exhibit is currently between guests. The management would like to keep it that way.', 'Guests are advised that the exit is behind them, and that so, in due course, is the exhibit.']);
add('first', 3, (f) => f.first, ['First-time visitors are encouraged to read these notices. This is one.', 'First-time guests are welcomed, and asked to read the rest of the signs.']);
// generic fallbacks, always eligible
const GEN = [
  ['Please keep hands, arms and all other parts inside the guest area.', 'Guests are asked to keep to the marked paths. There are no marked paths.'],
  ['The exhibit is not a petting zoo.', 'Guests are reminded that the exhibit is living, and is aware of this.'],
  ['Guests are asked to follow the instructions of staff. There are no staff.', 'The management accepts no responsibility for anything that happens within sight of the exhibit.'],
  ['Photography is encouraged. Proximity is not.', 'Guests are asked not to tap on the glass. There is no glass.'],
  ['The fence is for the exhibit\'s benefit. Guests are asked to respect it.', 'Guests are reminded that the exhibit has right of way, always.'],
  ['The management would like to remind guests that the exhibit is real.', 'Guests are reminded that the exhibit is, in every sense, the main attraction.'],
  ['Please enjoy the exhibit responsibly.', 'Guests are asked to enjoy the exhibit at a distance of their choosing, which should be larger.'],
];
GEN.forEach((t, i) => add('general' + (i + 1), 0.45, () => true, t));

const PH = []; for (const e of E) { e.ix = []; for (const t of e.t) { e.ix.push(PH.length); PH.push({ id: e.id, text: t }); } }
export const TABLE_STATS = { entries: E.length, phrasings: PH.length };

/** Choose one: { text, index, id }. `recent` holds phrasing indices already shown lately (never repeated). */
export function pick(fx, rng = Math.random, recent = []) {
  const f = fx || {}, rc = new Set(recent || []), pool = [];
  for (const e of E) {
    let ok = false; try { ok = !!e.when(f); } catch { ok = false; } if (!ok) continue;
    const left = e.ix.filter((i) => !rc.has(i)); if (!left.length) continue;
    const used = e.ix.length - left.length, w = Math.pow(e.w, 1.6) * (used ? 0.5 : 1);
    for (const i of left) pool.push({ i, w: w / left.length, id: e.id });
  }
  if (!pool.length) { const i = Math.floor(rng() * PH.length); return { text: PH[i].text, index: i, id: PH[i].id }; }
  let tot = 0; for (const q of pool) tot += q.w; let r = rng() * tot;
  for (const q of pool) { r -= q.w; if (r <= 0) return { text: PH[q.i].text, index: q.i, id: q.id }; }
  const q = pool[pool.length - 1]; return { text: PH[q.i].text, index: q.i, id: q.id };
}
/** The sentence only. The index of the phrasing chosen is left in `advice.lastIndex` for the caller's `recent` list. */
export function advice(fx, rng = Math.random, recent = []) { const r = pick(fx, rng, recent); advice.lastIndex = r.index; return r.text; }
advice.lastIndex = -1;
/** "No. 0047": the session's death count plus a stable-looking offset. */
export const incidentNo = (deaths) => String(40 + Math.max(1, deaths | 0)).padStart(4, '0');

// ------------------------------------------------------------------ the card
const CREAM = '#f3e9c9', INK = '#1d2a22', AMBER = '#f2a21b', BOX = '#18231c';
const SANS = '"Arial Black", "Helvetica Neue", "IBM Plex Sans", Arial, sans-serif', MONO = '"IBM Plex Mono", "Lucida Console", "Courier New", monospace';
export const CLIP_LINK = '';      // drawn small under the name when set
function wrap(g, text, maxW) {
  const words = text.split(/\s+/), lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (cur && g.measureText(t).width > maxW) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}
const SANS_PLAIN = SANS.replace('"Arial Black", ', '');
/** The biggest heavy size at which the headline fits its box: at most `maxLines` lines, every line inside the width, all lines inside the height. Steps down 2% at a time to `minPx`. */
function fit(g, text, maxW, maxH, maxPx, minPx, maxLines, lh = 1.04) {
  for (let px = Math.round(maxPx); ; px = Math.min(px - 1, Math.round(px * 0.98))) {
    px = Math.max(px, minPx); g.font = `900 ${px}px ${SANS}`; const ls = wrap(g, text, maxW);
    if (ls.length <= maxLines && ls.length * px * lh <= maxH && ls.every((l) => g.measureText(l).width <= maxW)) return { px, ls };
    if (px <= minPx) break;
  }
  g.font = `900 ${minPx}px ${SANS}`; return { px: minPx, ls: wrap(g, text, maxW) };      // (a box too small even for the smallest size: it still draws, at that size)
}
function balance(g, text, maxW, k) {      // the narrowest width that still wraps to k lines: even lines, no stranded word
  let lo = maxW * 0.45, hi = maxW, best = wrap(g, text, maxW);
  for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2, ls = wrap(g, text, mid); if (ls.length <= k && ls.every((l) => g.measureText(l).width <= mid + 0.5)) { best = ls; hi = mid; } else lo = mid; }
  return best;
}
const shrinkTo = (g, txt, weight, fam, px, maxW, minPx) => { let p = px; g.font = `${weight} ${p}px ${fam}`; while (p > minPx && g.measureText(txt).width > maxW) { p -= 1; g.font = `${weight} ${p}px ${fam}`; } return p; };
/** The margin of black round the card, enough for the tape's lettering (shared with makeTape). */
export const cardMargin = (W, H) => Math.round(Math.max(11, 20 * Math.min(W, H) / 720) * 2.1);
/** Draw the flat card on any canvas size. Everything is proportional: `s` is the scale of the designed size (1280x720 wide, 720x1000-ish tall); the headline is fitted by measuring (3 lines wide, 5 tall). Returns { px, ls, tall, s }. */
export function drawCard(g, W, H, line, no, link = CLIP_LINK, live = false) {
  const tall = W / H < 1.15, s = Math.max(0.2, tall ? Math.min(W / 720, H / 1000) : Math.min(W / 1280, H / 720));
  const mg = cardMargin(W, H), x0 = mg, x1 = W - mg, iw = x1 - x0, ch = H - 2 * mg, pad = (tall ? 38 : 52) * s, ix0 = x0 + pad, ix1 = x1 - pad, cw = ix1 - ix0;
  const top = mg + pad * 0.9, bot = H - mg - pad * 0.9;      // the writing area, top to bottom
  g.save(); g.textBaseline = 'alphabetic'; g.fillStyle = '#0c120e'; g.fillRect(0, 0, W, H);
  g.fillStyle = CREAM; g.fillRect(x0, mg, iw, ch);
  g.strokeStyle = INK; g.lineWidth = Math.max(1.5, 3 * s); const ib = 14 * s; g.strokeRect(x0 + ib, mg + ib, iw - 2 * ib, ch - 2 * ib);
  g.fillStyle = INK; g.textAlign = 'left';
  // ---- top: title, the incident line, the rule, the lead-in
  const posted = `posted ${live ? 'ahead of' : 'after'} incident No. ${no}`, mono = Math.max(9, (tall ? 17 : 18) * s);
  const tpx = shrinkTo(g, 'VISITOR SAFETY NOTICE', 900, SANS, (tall ? 40 : 46) * s, cw, 12);
  let y = top + tpx * 0.9; g.font = `900 ${tpx}px ${SANS}`; g.fillText('VISITOR SAFETY NOTICE', ix0, y);
  const titleW = g.measureText('VISITOR SAFETY NOTICE').width; g.font = `500 ${mono}px ${MONO}`;
  if (!tall && titleW + g.measureText(posted).width + 30 * s < cw) { g.textAlign = 'right'; g.fillText(posted, ix1, y); g.textAlign = 'left'; }
  else { const mp = shrinkTo(g, posted, 500, MONO, mono, cw, 8); y += mp * 1.9; g.font = `500 ${mp}px ${MONO}`; g.fillText(posted, ix0, y); }
  y += 22 * s; const rule = Math.max(3, (tall ? 8 : 9) * s); g.fillRect(ix0, y, cw, rule); y += rule;
  const spx = shrinkTo(g, 'The management kindly reminds all guests:', 500, SANS_PLAIN, (tall ? 29 : 31) * s, cw, 11);
  y += spx * 1.15 + 14 * s; g.font = `500 ${spx}px ${SANS_PLAIN}`; g.fillText('The management kindly reminds all guests:', ix0, y);
  const headTop = y + 16 * s;
  // ---- bottom block (measured from the bottom up)
  const sign = 'Thank you for visiting. We hope to see most of you again.';
  let by0;      // top of the bottom block
  if (tall) {
    const bh = 168 * s, npx = shrinkTo(g, 'REX ENCOUNTER', 900, SANS, 58 * s, cw, 14), spx2 = Math.max(10, 25 * s), lh = spx2 * 1.24;
    g.font = `500 ${spx2}px ${SANS_PLAIN}`; const so = wrap(g, sign, cw);
    let yy = bot;
    if (link) { const lp = Math.max(9, 17 * s); g.font = `500 ${lp}px ${MONO}`; g.fillText(link, ix0, yy); yy -= lp * 1.5; }
    g.font = `900 ${npx}px ${SANS}`; g.fillText('REX ENCOUNTER', ix0, yy); yy -= npx * 1.0 + 8 * s;
    g.font = `500 ${spx2}px ${SANS_PLAIN}`; for (let i = so.length - 1; i >= 0; i--) { g.fillText(so[i], ix0, yy); yy -= lh; }
    yy += lh - spx2; const bt = yy - 22 * s - bh; by0 = bt; g.fillStyle = BOX; g.fillRect(ix0, bt, cw, bh);
    const lab = live ? 'INCIDENT STATUS' : 'DAYS SINCE LAST INCIDENT', big = live ? 'PENDING' : '0';
    const lp = shrinkTo(g, lab, 500, MONO, 17 * s, cw * 0.5, 8); g.fillStyle = '#d9cfa8'; g.font = `500 ${lp}px ${MONO}`; g.fillText(lab, ix0 + 24 * s, bt + lp * 2.0);
    const bp = shrinkTo(g, big, 900, SANS, 150 * s, cw - 56 * s, 20); g.fillStyle = AMBER; g.font = `900 ${bp}px ${SANS}`; g.textAlign = 'right'; g.fillText(big, ix1 - 28 * s, bt + bh - 14 * s); g.textAlign = 'left';
  } else {
    const bh = 150 * s, bw = Math.min(380 * s, cw * 0.42), bt = bot - bh; by0 = bt; g.fillStyle = BOX; g.fillRect(ix0, bt, bw, bh);
    const lab = live ? 'INCIDENT STATUS' : 'DAYS SINCE LAST INCIDENT', big = live ? 'PENDING' : '0';
    const lp = shrinkTo(g, lab, 500, MONO, 16 * s, bw - 36 * s, 8); g.fillStyle = '#d9cfa8'; g.font = `500 ${lp}px ${MONO}`; g.fillText(lab, ix0 + 20 * s, bt + lp * 2.1);
    const bp = shrinkTo(g, big, 900, SANS, 118 * s, bw - 40 * s, 14); g.fillStyle = AMBER; g.font = `900 ${bp}px ${SANS}`; g.fillText(big, ix0 + 20 * s, bt + bh - 16 * s);
    const rx = ix0 + bw + 48 * s, rw = ix1 - rx; g.fillStyle = INK;
    const spx2 = Math.max(10, 22 * s); g.font = `500 ${spx2}px ${SANS_PLAIN}`; const so = wrap(g, sign, rw);
    so.forEach((t, i) => g.fillText(t, rx, bt + spx2 * 1.1 + i * spx2 * 1.28));
    const npx = shrinkTo(g, 'REX ENCOUNTER', 900, SANS, 58 * s, rw, 14); g.font = `900 ${npx}px ${SANS}`; g.fillText('REX ENCOUNTER', rx, bt + bh - (link ? 26 * s : 4 * s));
    if (link) { const lp2 = Math.max(9, 17 * s); g.font = `500 ${lp2}px ${MONO}`; g.fillText(link, rx, bt + bh); }
  }
  // ---- the headline: the middle, as big as it will go
  g.fillStyle = INK; const hb = by0 - 24 * s, avail = hb - headTop, maxLines = tall ? 5 : 3;
  const r = fit(g, line, cw, Math.max(10, avail), (tall ? 112 : 108) * s, Math.max(12, 26 * s), maxLines);
  g.font = `900 ${r.px}px ${SANS}`; r.ls = balance(g, line, cw, r.ls.length); g.textAlign = 'left';
  const th = r.ls.length * r.px * 1.04, ty = headTop + Math.max(0, (avail - th) / 2);
  r.ls.forEach((t, i) => g.fillText(t, ix0, ty + r.px * 0.88 + i * r.px * 1.04));
  g.restore(); r.tall = tall; r.s = s; return r;
}

const p2 = (n) => String(n).padStart(2, '0');
function noiseInto(g, nc, ng, W, H, a, rng) {      // a small noise canvas, scaled over the picture
  const id = ng.getImageData(0, 0, nc.width, nc.height), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const v = rng() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } ng.putImageData(id, 0, 0);
  g.save(); g.globalAlpha = a; g.imageSmoothingEnabled = true; g.drawImage(nc, 0, 0, W, H); g.restore();
}
/** The tape treatment: makes a drawer for a W x H canvas. `ctx.frame(g, t, stampMs, rng)`: t seconds into the closeout (0 to LEN). Legibility first. */
export let CARD_SECONDS = 6.4, STATIC = 0.25;      // the closing card is held for CARD_SECONDS in the recording (the owner: twice the first 3.2 s)
export let LEN = CARD_SECONDS;
import { tune, tuneGroup } from './tune.js';      // tune
const CARDT = { seconds: CARD_SECONDS, stat: STATIC };      // tune: live copies; the exported lets follow them
{ const G = 'Clip and closing card'; tuneGroup(G, { order: 90 });      // tune
  tune(G, 'Closing card length (s)', CARDT, 'seconds', 1, 15, 0.1, (v) => { CARD_SECONDS = LEN = v; }, 'card.seconds'); tune(G, 'Static transition into the card (s)', CARDT, 'stat', 0, 2, 0.05, (v) => { STATIC = v; }, 'card.static'); }      // tune
export function makeTape(W, H, line, no, link = CLIP_LINK, live = false) {
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const card = mk(), cg = card.getContext('2d'); drawCard(cg, W, H, line, no, link, live);
  const tint = (col) => { const c = mk(), g = c.getContext('2d'); g.drawImage(card, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = col; g.fillRect(0, 0, W, H); return c; };
  const red = tint('#ff4a4a'), cyan = tint('#4affff');
  const scan = mk(), sg = scan.getContext('2d'); sg.fillStyle = 'rgba(0,0,0,0.16)'; for (let y = 0; y < H; y += 3) sg.fillRect(0, y, W, 1);
  const nc = document.createElement('canvas'); nc.width = Math.round(W / 6); nc.height = Math.round(H / 6); const ng = nc.getContext('2d');
  const sc = Math.min(W, H) / 720, fs = Math.round(Math.max(11, 20 * sc)), cm = cardMargin(W, H);
  const BAND = 0.9, B0 = 1.25;      // the tracking band passes once, from B0 over BAND seconds
  return {
    card, line, no,
    frame(g, t, stampMs, rng = Math.random) {
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      const T = Math.max(0, t);
      if (T < STATIC) {      // the transition: tape static with the picture rolling, the card coming up through it
        const k = T / STATIC, roll = Math.floor(((1 - k) * (1 - k) * H * 1.3 + T * 700)) % H;
        g.globalAlpha = Math.min(1, k * 1.6); g.drawImage(card, 0, 0, W, H - roll, 0, roll, W, H - roll); g.drawImage(card, 0, H - roll, W, roll, 0, 0, W, roll); g.globalAlpha = 1;
        noiseInto(g, nc, ng, W, H, 0.9 * (1 - k * 0.7), rng);
        g.fillStyle = `rgba(255,255,255,${0.25 * (1 - k)})`; g.fillRect(0, (roll + H * 0.02) % H, W, 5 + 12 * (1 - k));
      } else {
        const bandY = ((T - B0) / BAND) * (H + 160) - 80, inBand = T >= B0 && T <= B0 + BAND, ST = 4;
        for (let y = 0; y < H; y += ST) {
          let dx = Math.sin(y * 0.021 + T * 5.3) * 1.3 + Math.sin(y * 0.173 + T * 31) * 0.5; if (rng() < 0.012) dx += (rng() - 0.5) * 12;
          if (inBand) { const d = (y - bandY) / 70; if (Math.abs(d) < 1) dx += Math.sin(y * 0.4 + T * 60) * 16 * (1 - Math.abs(d)) + (1 - Math.abs(d)) * 12; }
          g.drawImage(card, 0, y, W, ST, Math.round(dx), y, W, ST);
        }
        g.save(); g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.38; g.drawImage(red, 2.5 + Math.sin(T * 7) * 0.6, 0); g.drawImage(cyan, -2.5, 0); g.restore();
        g.globalAlpha = 0.55; g.drawImage(card, 0, 0); g.globalAlpha = 1;      // the sharp copy keeps the text legible over the colour bleed
        if (inBand) { const gr = g.createLinearGradient(0, bandY - 40, 0, bandY + 40); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, bandY - 40, W, 80); noiseInto(g, nc, ng, W, H, 0.05, rng); }
        noiseInto(g, nc, ng, W, H, 0.07, rng);
        g.drawImage(scan, 0, 0);
        const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.35)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
      }
      // the lettering, in the footage's style (post.js makeCCTVOSD): bold monospace, soft shadow, light grey-green. Over the cream it needs the dark plate.
      g.font = `bold ${fs}px "Lucida Console", "Courier New", monospace`; g.textBaseline = 'top';
      const d = new Date(stampMs || Date.now()), blink = Math.floor(T * 2) % 2 === 0, ts = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}  ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
      const tag = (blink ? '▶' : ' ') + ' PLAYBACK  ·  END OF RECORDING';
      const plate = (s, x, y, al) => { g.textAlign = al; const w = g.measureText(s).width, px = al === 'left' ? x : al === 'right' ? x - w : x - w / 2; g.fillStyle = 'rgba(12,18,14,0.78)'; g.fillRect(px - 8, y - 4, w + 16, fs + 8); g.fillStyle = 'rgba(236,244,236,1)'; g.fillText(s, x, y); };
      if (T >= STATIC * 0.5) { plate(tag, W / 2, (cm - fs) / 2, 'center'); plate(ts, Math.max(10, cm * 0.4), H - (cm + fs) / 2, 'left'); }
      g.restore();
    },
  };
}
