// Arrangements the animal has never been given any code for, built from plain colliders at test time (T.addStructure):
//   slot   a hollow ringed by a rock wall 3.6 m high, the only way in a vertical slot 0.8 m wide (a person fits; a skull does not)
//   under  a slab fallen across two rock walls, 1.35 m clear beneath it, open front and back: you crouch under it
// test/siege.mjs runs them like the structures (`node test/siege.mjs novel <seed> 90`).
const spot = (T, rad) => {
  for (let k = 0; k < 3000; k++) {
    const a = k * 2.399, d = 20 + (k % 60), x = Math.sin(a) * d, z = Math.cos(a) * d;
    if (T.near(x, z, rad).length || T.logs.some((L) => Math.hypot(L.x - x, L.z - z) < L.half + rad)) continue;
    if (T.structures.some((S) => Math.hypot(S.cx - x, S.cz - z) < rad + 10)) continue;
    let g0 = 1e9, g1 = -1e9; for (let i = 0; i < 16; i++) { const h = T.height(x + Math.sin(i) * rad, z + Math.cos(i) * rad); g0 = Math.min(g0, h); g1 = Math.max(g1, h); }
    if (g1 - g0 < 1.6 && !(T.depthAt && T.depthAt(x, z) > 0)) return { x, z, yaw: a * 0.37 };
  }
  throw new Error('no room for a novel arrangement');
};
export const novel = {
  slot: (T) => {
    const p = spot(T, 11), hw = 2.2, hd = 2.2, r = 0.45, H = 3.6;
    return T.addStructure({ kind: 'novel-slot', cx: p.x, cz: p.z, yaw: p.yaw, hw, hd, h: H,
      walls: [[-hw - r, hd + r, -0.4 - r, hd + r, r, H], [0.4 + r, hd + r, hw + r, hd + r, r, H], [hw + r, hd + r, hw + r, -hd - r, r, H], [hw + r, -hd - r, -hw - r, -hd - r, r, H], [-hw - r, -hd - r, -hw - r, hd + r, r, H]],
      openings: [[0, hd + r, 0, 1, 0.8]] });
  },
  under: (T) => {
    const p = spot(T, 11), hw = 1.6, hd = 2.2;
    return T.addStructure({ kind: 'novel-under', cx: p.x, cz: p.z, yaw: p.yaw, hw, hd, h: 1.35, roof: 1.6, extra: { crouch: true },
      walls: [[-hw - 0.4, -hd, -hw - 0.4, hd, 0.4, 1.6], [hw + 0.4, -hd, hw + 0.4, hd, 0.4, 1.6]],
      slabs: [-1.2, -0.4, 0.4, 1.2].map((x) => [x, -hd - 0.3, x, hd + 0.3, 0.55, 1.35, 1.75, 'rock']),
      openings: [[0, hd, 0, 1, 2.8], [0, -hd, 0, -1, 2.8]] });
  },
};
