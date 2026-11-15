// Something to hide behind, for the scripted people: a rock where the place has rocks; in the Arena (no rocks) the nearest
// solid part of a structure (a wall pillar, a column or a tower leg) that stands at least `minR` from the origin.
export function covers(T, { minR = 0, maxR = 1e9, minSize = 1.2 } = {}) {
  const hyp = Math.hypot, rocks = T.obstacles.filter((o) => !o.kind && o.r > minSize && hyp(o.x, o.z) > minR && hyp(o.x, o.z) < maxR);
  if (rocks.length) return rocks;
  const parts = T.obstacles.filter((o) => o.kind === 'wall' && hyp(o.x, o.z) > minR);
  const inR = parts.filter((o) => hyp(o.x, o.z) < maxR);
  return (inR.length ? inR : parts).map((o) => ({ x: o.x, z: o.z, r: Math.max(o.r, 0.6), kind: 'wall' }));
}
