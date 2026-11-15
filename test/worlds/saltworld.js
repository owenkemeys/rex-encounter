// Saltline world adapter (copy of /home/claude/saltrex/src/saltworld.js, updated to the current sim's interface) for the
// standing test test/saltline.mjs. Builds the terrain object (`T`) the Dino Hunter sim reads (contract: src/terrain.js) from a
// plain description, e.g. the JSON dump of Saltline's world in test/worlds/saltline.json (made by saltrex/test/dump.py from
// the original page):
//   desc = { boxes: [[minx,miny,minz,maxx,maxy,maxz,surface,tag,noNav,bulletOnly,playerOnly], ...],   // G.physics.boxes
//            groundY, seaY, quayX, rect: {x0,x1,z0,z1},                                               // the fence the animal keeps to
//            interiors: [{min:{x,y,z}, max:{x,y,z}}],                                                 // G.level.interiorBoxes
//            zones: [{name, min:[x,z], max:[x,z]}] }                                                  // G.level.zones
// Changes against the saltrex copy:
//  - the world's fence is given as `T.rect` (the sim now takes rectangles anywhere); no sim patch needed.
//  - the route planner's body radius is the species' `navBody` (set by the caller, not here).
//  - Saltline's interior volume keeps Saltline's own word: kind 'interior' (no longer 'shed' to please a name table; the sim
//    judges structures by their geometry now).
//  - structure ids are kept apart from the box ids carried on the pillars (`sid`): in the old copy structure 1 and box 1
//    shared the id 1, so the box's pillars counted as the structure's posts.
// Mapping:
//  - flat ground (groundY) up to the quay edge, sea beyond (outside T.rect).
//  - boxes standing on the ground taller than 1.35 m become obstacles + colliders as chains of vertical pillars; stacks merge.
//  - boxes 0.15-1.35 m tall (barriers, crates, pallets) are ground relief rastered at 0.25 m: stepped onto and over.
//  - unsupported boxes up in the air: narrow ones are overhead slabs (bot/top); broad thin ones are sight-blocking roofs.
//  - bulletOnly boxes ignored; playerOnly boxes (the fence) solid for the animal too.
//  - interior volumes are structures whose openings are DERIVED from gaps in the walls at 0.8-1.8 m.
//  - no vegetation (cover 0), no doors, no per-place wind; zone names are given (the voice ignores them).
const PIL = 0.75, CLUTTER = 0.6, RELIEF = 1.35, HC = 0.25;

export function makeSaltTerrain(desc) {
  const T = {};
  const G0 = desc.groundY ?? 0, SEA = desc.seaY ?? -1.6, QX = desc.quayX ?? 1e9;
  const R = desc.rect;
  // low props (jersey barriers, crates, pallets, kerbs up to RELIEF) are ground relief for the animal, as fallen trunks are in the
  // paddock: its feet step onto and over them, and the route planner sees them as steps, not walls. Rastered at HC m.
  const rx0 = R ? R.x0 - 4 : -100, rz0 = R ? R.z0 - 4 : -100, nx = Math.ceil(((R ? R.x1 + 4 : 100) - rx0) / HC), nz = Math.ceil(((R ? R.z1 + 4 : 100) - rz0) / HC);
  const relief = new Float32Array(nx * nz);
  const height = (x, z) => { if (x > QX) return SEA; const i = Math.floor((x - rx0) / HC), j = Math.floor((z - rz0) / HC); return G0 + (i >= 0 && j >= 0 && i < nx && j < nz ? relief[i + nx * j] : 0); };
  const normal = (x, z, o) => { const e = 0.35, dx = (height(x + e, z) - height(x - e, z)) / (2 * e), dz = (height(x, z + e) - height(x, z - e)) / (2 * e), inv = 1 / Math.hypot(dx, 1, dz); o.x = -dx * inv; o.y = inv; o.z = -dz * inv; return o; };
  const B = desc.boxes.filter((b) => !b[9]).map((b) => ({ x0: b[0], y0: b[1], z0: b[2], x1: b[3], y1: b[4], z1: b[5], surface: b[6], tag: b[7], playerOnly: !!b[10] }));
  const over = (a, b, m = 0.05) => a.x0 < b.x1 - m && a.x1 > b.x0 + m && a.z0 < b.z1 - m && a.z1 > b.z0 + m;
  for (const b of B) if (b.y0 < 0.5 + G0 && b.y1 - G0 < RELIEF && b.y1 - G0 >= 0.15 && !b.playerOnly) {
    b.relief = true;
    for (let j = Math.max(0, Math.floor((b.z0 - rz0) / HC)); j < Math.min(nz, Math.ceil((b.z1 - rz0) / HC)); j++) for (let i = Math.max(0, Math.floor((b.x0 - rx0) / HC)); i < Math.min(nx, Math.ceil((b.x1 - rx0) / HC)); i++) relief[i + nx * j] = Math.max(relief[i + nx * j], b.y1 - G0);
  }
  const ground = B.filter((b) => !b.relief && b.y0 < 0.5 + G0 && b.y1 - G0 >= CLUTTER);
  const air = B.filter((b) => b.y0 >= 0.5 + G0);
  // stacks: a box resting on a ground box (within 0.15 m of its top) raises that column
  for (const g of ground) g.top = g.y1;
  for (let pass = 0; pass < 4; pass++) for (const a of air) {
    if (a.used) continue;
    for (const g of ground) if (over(a, g, 0.3) && Math.abs(a.y0 - g.top) < 0.15) { g.top = Math.max(g.top, a.y1); a.used = true; }
  }
  const obstacles = [], colliders = [], roofs = [], slabCols = [];
  // a box's footprint as pillars: one chain along a slender box, a chain round the rim of a broad one, plus corner posts
  const pillars = (b, push) => {
    const w = b.x1 - b.x0, d = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const chain = (ax, az, bx, bz, r) => { const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / PIL)); for (let i = 0; i <= n; i++) push(ax + (bx - ax) * i / n, az + (bz - az) * i / n, r); };
    const s = Math.min(w, d);
    if (s <= 3.2) {
      const r = s / 2;
      if (w >= d) chain(b.x0 + r, cz, b.x1 - r, cz, r); else chain(cx, b.z0 + r, cx, b.z1 - r, r);
    } else {
      const r = 0.6;
      chain(b.x0 + r, b.z0 + r, b.x1 - r, b.z0 + r, r); chain(b.x0 + r, b.z1 - r, b.x1 - r, b.z1 - r, r);
      chain(b.x0 + r, b.z0 + r, b.x0 + r, b.z1 - r, r); chain(b.x1 - r, b.z0 + r, b.x1 - r, b.z1 - r, r);
    }
    // corners stick out of the end pillars of a chain: a small post in each
    const c = Math.min(0.35, s / 2);
    if (s > 0.8) for (const [x, z] of [[b.x0 + c, b.z0 + c], [b.x1 - c, b.z0 + c], [b.x0 + c, b.z1 - c], [b.x1 - c, b.z1 - c]]) push(x, z, c);
  };
  let sid = 0;
  for (const g of ground) {
    const id = ++sid, h = g.top - G0, seg = null;
    pillars(g, (x, z, r) => { obstacles.push({ x, z, r, h, top: g.top, kind: 'wall', sid: id, seed: 0, seg, mat: g.surface, box: g }); colliders.push({ x, z, r, top: g.top, kind: 'wall', sid: id, box: g }); });
  }
  for (const a of air) {
    if (a.used) continue;
    const w = a.x1 - a.x0, d = a.z1 - a.z0;
    if (w * d > 20 && a.y1 - a.y0 < 1.5) { roofs.push({ roof: { y: a.y0 }, cx: (a.x0 + a.x1) / 2, cz: (a.z0 + a.z1) / 2, yaw: 0, hw: w / 2, hd: d / 2 }); if (Math.min(w, d) > 6.5) continue; }
    const id = ++sid; pillars(a, (x, z, r) => slabCols.push({ x, z, r, bot: a.y0, top: a.y1, kind: 'wall', sid: id, box: a }));
  }
  colliders.push(...slabCols);
  const CG = 6, cgrid = new Map();
  const gridAdd = (c) => { const i0 = Math.floor((c.x - c.r) / CG), i1 = Math.floor((c.x + c.r) / CG), j0 = Math.floor((c.z - c.r) / CG), j1 = Math.floor((c.z + c.r) / CG); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = i * 8192 + j; (cgrid.get(k) || cgrid.set(k, []).get(k)).push(c); } };
  for (const c of colliders) gridAdd(c);
  const nearOut = [], seen = new Set();
  const near = (x, z, rad) => {
    nearOut.length = 0; seen.clear();
    for (let i = Math.floor((x - rad) / CG); i <= Math.floor((x + rad) / CG); i++) for (let j = Math.floor((z - rad) / CG); j <= Math.floor((z + rad) / CG); j++) {
      const L = cgrid.get(i * 8192 + j); if (!L) continue;
      for (const c of L) if (!seen.has(c) && Math.abs(c.x - x) < c.r + rad && Math.abs(c.z - z) < c.r + rad) { seen.add(c); nearOut.push(c); }
    }
    return nearOut;
  };
  const pushOut = (p, r, y0, y1, iters = 2, wallsFull = false) => {
    let tx = 0, tz = 0;
    for (let it = 0; it < iters; it++) {
      let moved = false;
      for (const c of near(p.x, p.z, r + 0.5)) {
        if (c.bot !== undefined ? (y1 < c.bot || y0 > c.top) : (y0 > c.top && !(wallsFull && c.kind === 'wall'))) continue;
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r; if (d >= m) continue;
        const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0, k = m - d; p.x += nx * k; p.z += nz * k; tx += nx * k; tz += nz * k; moved = true;
      }
      if (!moved) break;
    }
    return [tx, tz];
  };
  const roofBlocks = (ax, ay, az, bx, by, bz) => {
    for (const S of roofs) {
      const y = S.roof.y; if ((ay - y) * (by - y) > 0) continue;
      const t = (y - ay) / (by - ay), x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (Math.abs(x - S.cx) < S.hw && Math.abs(z - S.cz) < S.hd) return true;
    }
    return false;
  };
  const segClear = (ax, ay, az, bx, by, bz, pad = 0) => {
    const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dz), n = Math.max(2, Math.ceil(Math.hypot(L, dy) / 0.5));
    for (let i = 1; i < n; i++) { const t = i / n; if (ay + dy * t < height(ax + dx * t, az + dz * t) + 0.05) return false; }
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, L2 = L * L || 1e-9;
    for (const c of near(mx, mz, L / 2 + pad + 0.5)) {
      let t = ((c.x - ax) * dx + (c.z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(ax + dx * t - c.x, az + dz * t - c.z), m = c.r + pad; if (d >= m) continue;
      const hw = Math.sqrt(m * m - d * d) / (L || 1e-9), t0 = Math.max(0, t - hw), t1 = Math.min(1, t + hw);
      const y0 = ay + dy * t0, y1 = ay + dy * t1, lo = Math.min(y0, y1) - pad, hi = Math.max(y0, y1) + pad;
      if (hi > (c.bot ?? -1e9) && lo < c.top) return false;
    }
    return !roofBlocks(ax, ay, az, bx, by, bz);
  };
  const OG = 8, og = new Map(), ogOut = []; let ogGen = 0;
  for (const o of obstacles) for (let i = Math.floor((o.x - o.r) / OG); i <= Math.floor((o.x + o.r) / OG); i++) for (let j = Math.floor((o.z - o.r) / OG); j <= Math.floor((o.z + o.r) / OG); j++) { const k = i * 4096 + j; (og.get(k) || og.set(k, []).get(k)).push(o); }
  const obstaclesNear = (x, z, rad) => {
    ogOut.length = 0; ogGen++;
    for (let i = Math.floor((x - rad) / OG); i <= Math.floor((x + rad) / OG); i++) for (let j = Math.floor((z - rad) / OG); j <= Math.floor((z + rad) / OG); j++) {
      const L = og.get(i * 4096 + j); if (L) for (const o of L) if (o._og !== ogGen) { o._og = ogGen; ogOut.push(o); }
    }
    return ogOut;
  };
  // interiors (Saltline's interiorBoxes: the shed): structures with openings found from the gaps in their walls at ground level
  const structures = [];
  for (const I of desc.interiors || []) {
    const cx = (I.min.x + I.max.x) / 2, cz = (I.min.z + I.max.z) / 2, hw = (I.max.x - I.min.x) / 2, hd = (I.max.z - I.min.z) / 2;
    const S = { kind: 'interior', key: 'interior' + structures.length, name: 'interior', id: 100000 + structures.length + 1, cx, cz, yaw: 0, hw, hd, h: I.max.y - G0, base: G0, walls: [], openings: [], roof: { y: I.max.y - 0.3 }, derived: true };
    // walk the rim 0.3 m outside the volume; a run of points with no solid between knee and head height within 0.6 m is a way in
    const sides = [[I.min.x, I.min.z, I.max.x, I.min.z, 0, -1], [I.max.x, I.min.z, I.max.x, I.max.z, 1, 0], [I.max.x, I.max.z, I.min.x, I.max.z, 0, 1], [I.min.x, I.max.z, I.min.x, I.min.z, -1, 0]];
    for (const [ax, az, bx, bz, nx, nz] of sides) {
      const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 0.25); let run = null;
      const flush = () => { if (run && run.n * L / n >= 1.0) { const u = (run.a + run.b) / 2 / n, w = (run.b - run.a) * L / n; S.openings.push({ x: ax + (bx - ax) * u, z: az + (bz - az) * u, nx, nz, w, y: G0 + 0.9 }); } run = null; };
      for (let i = 0; i <= n; i++) {
        const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
        let open = true;
        for (const c of near(x, z, 0.8)) { if ((c.bot ?? G0) > G0 + 1.8 || c.top < G0 + 0.8) continue; if (Math.hypot(c.x - x, c.z - z) < c.r + 0.15) { open = false; break; } }
        if (open) { if (!run) run = { a: i, b: i, n: 0 }; run.b = i; run.n++; } else flush();
      }
      flush();
    }
    if (!roofs.some((r) => r.cx === cx && r.cz === cz)) roofs.push({ roof: S.roof, cx, cz, yaw: 0, hw, hd });
    structures.push(S);
  }
  const insideStructure = (x, z, y = null) => {
    for (const S of structures) if (Math.abs(x - S.cx) < S.hw - 0.05 && Math.abs(z - S.cz) < S.hd - 0.05 && (y === null || y < S.roof.y)) return S;
    return null;
  };
  const zones = desc.zones || [];
  const placeName = (x, z) => { if (R && (x < R.x0 || x > R.x1 || z < R.z0 || z > R.z1)) return 'beyond the fence'; for (const Z of zones) if (x >= Z.min[0] && x <= Z.max[0] && z >= Z.min[1] && z <= Z.max[1]) return 'the ' + Z.name; return 'the yard'; };
  const depthAt = (x, z) => (x > QX ? 9 : desc.puddleDepth ? Math.max(0, desc.puddleDepth(x, z)) : 0);
  const slopeAt = (x, z) => { const e = 0.5; return Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e); };
  // the square the sim's code assumes (T.bound) must hold the whole rectangle; T.rect is the real fence (sim diff, NOTES.md)
  const bound = R ? Math.max(Math.abs(R.x0), Math.abs(R.x1), Math.abs(R.z0), Math.abs(R.z1)) : 60;
  Object.assign(T, {
    ver: 0, height, base: height, normal, addBump() {}, bumps: [], obstacles, logs: [], cover: [], coverAt: () => 0, coverHeight: () => 0,
    structures, insideStructure, roofBlocks, roofs, colliders, near, pushOut, segClear, obstaclesNear, size: 2 * bound + 40,
    arena: Math.min(36, bound), bound, rect: R, doors: [], solids: [], things: [], grass: [], landmarks: [], grazing: [],
    slopeAt, waterY: () => (G0), depthAt, wetAt: (x, z) => (desc.wetnessAt ? desc.wetnessAt(x, z) : 0.6), wetness: (x, z) => (desc.wetnessAt ? desc.wetnessAt(x, z) : 0.6),
    surfaceAt: (x, z) => (desc.surfaceAt ? desc.surfaceAt(x, z) : 'concrete'), placeName, speedFactor: () => 1, boxes: B,
  });
  return T;
}

/** Is a point inside any solid box (for the clipping checks): the boxes as Saltline has them, not the pillars. */
export function insideBox(T, x, y, z, m = 0) {
  for (const b of T.boxes) if (x > b.x0 + m && x < b.x1 - m && z > b.z0 + m && z < b.z1 - m && y > b.y0 + m && y < (b.top ?? b.y1) - m && (b.y1 - b.y0 >= 0.6 || b.y0 > 0.5)) return b;
  return null;
}

/** Load the dumped world (JSON) and build T with Saltline's numbers. */
export function saltlineDesc(W) {
  return { boxes: W.boxes, groundY: 0, seaY: -1.6, quayX: 30, rect: { x0: -39.2, x1: 29.2, z0: -29.2, z1: 29.2 }, interiors: W.interior, zones: W.zones };
}
