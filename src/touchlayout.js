// The touch layout, as one pure function: where every control goes for a viewport (width, height) and its safe-area insets.
// A fixed, symmetric gamepad: the move stick in the bottom-left corner and the look stick in the bottom-right corner (mirror images), buttons on an
// arc round each stick's thumb. Used by main.js to position the page's controls (resize, orientationchange) and by test/touchlayout.mjs.
// No DOM here. Circles are {cx, cy, r}; boxes are {x, y, w, h}.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const GAP = 8, RING = 12, HALO = 20, BAR_H = 44;
const circ = (cx, cy, r) => ({ cx, cy, r });
const box = (x, y, w, h) => ({ x, y, w, h });
const bb = (c) => (c.r !== undefined ? { x: c.cx - c.r, y: c.cy - c.r, w: 2 * c.r, h: 2 * c.r } : c);
/** Do two shapes come closer than `gap`? (circle/circle by distance; anything else by boxes, circle vs box exactly) */
export function tooClose(a, b, gap = GAP) {
  const ca = a.r !== undefined, cb = b.r !== undefined;
  if (ca && cb) return Math.hypot(a.cx - b.cx, a.cy - b.cy) < a.r + b.r + gap;
  if (ca || cb) { const c = ca ? a : b, r = ca ? b : a, nx = clamp(c.cx, r.x, r.x + r.w), ny = clamp(c.cy, r.y, r.y + r.h); return Math.hypot(c.cx - nx, c.cy - ny) < c.r + gap; }
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}
/** Everything, for a viewport. insets: { top, right, bottom, left } (safe area, px). */
export function touchLayout(W, H, insets = {}) {
  const I = { top: insets.top || 0, right: insets.right || 0, bottom: insets.bottom || 0, left: insets.left || 0 };
  const S = Math.min(W, H), margin = Math.max(8, 0.04 * S);
  const base0 = clamp(0.30 * S, 110, 150), btn0 = clamp(56 * S / 390, 48, 64);
  const build = (base, btn, mode) => {
    const r = base / 2 + btn / 2 + RING, k = Math.SQRT1_2;
    const lx = I.left + margin + base / 2, rx = W - I.right - margin - base / 2, cy = H - I.bottom - margin - base / 2;
    const L = circ(lx, cy, base / 2), R = circ(rx, cy, base / 2);
    // arc: JUMP straight above the look stick, FLARE at 45 degrees toward the centre, CROUCH at 90 (level, inner side); LEFT mirrored: TORCH straight
    // above the move stick, CALL at 45 degrees toward the centre. tight (a narrow viewport, the two arcs would meet in the middle): both clusters
    // keep their first button on the arc and put the second in a column above it, CROUCH stays level on the inner side.
    const up = btn + GAP, jump = circ(rx, cy - r, btn / 2), torch = circ(lx, cy - r, btn / 2);
    const flare = mode === 'arc' ? circ(rx - r * k, cy - r * k, btn / 2) : circ(rx, cy - r - up, btn / 2), call = mode === 'arc' ? circ(lx + r * k, cy - r * k, btn / 2) : circ(lx, cy - r - up, btn / 2);
    const crouch = circ(rx - r, cy, btn / 2);
    return { base, btn, r, mode, margin, halo: HALO, knob: base * 0.45, left: L, right: R, buttons: { jump, flare, crouch, torch, call } };
  };
  const inside = (c) => { const b = bb(c); return b.x >= I.left - 0.01 && b.y >= I.top - 0.01 && b.x + b.w <= W - I.right + 0.01 && b.y + b.h <= H - I.bottom + 0.01; };
  const valid = (g) => {
    const all = [g.left, g.right, ...Object.values(g.buttons)];
    for (let i = 0; i < all.length; i++) { if (!inside(all[i])) return false; for (let j = i + 1; j < all.length; j++) if (tooClose(all[i], all[j], all[i].r > g.btn ? RING : GAP) && !(all[i].r > g.btn && all[j].r > g.btn)) return false; }
    return !tooClose(g.left, g.right, GAP);
  };
  // the largest sizes that fit: try the arcs at full size, then tighten the arc, then shrink toward the minimums
  let g = null;
  for (let sc = 1; sc >= 0.5 && !g; sc -= 0.05) {
    const base = Math.max(110, base0 * sc), btn = Math.max(48, btn0 * sc);
    for (const mode of ['arc', 'tight']) { const c = build(base, btn, mode); if (valid(c)) { g = c; break; } }
    if (!g && base === 110 && btn === 48) g = build(base, btn, 'tight');
  }
  if (!g) g = build(110, 48, 'tight');
  const ctl = [g.left, g.right, ...Object.values(g.buttons)];
  // the top bar (help, clip, pause, note) and the mute icon: fixed corners
  const topbar = box(W - I.right - 216, I.top, 216, BAR_H), mute = box(I.left, I.top, BAR_H, BAR_H);
  // the pill (context verb) and, above it, the hint line: centred between the sticks; they climb until a free span at least minW wide exists
  const place = (h, minW, maxW, obstacles, fromY) => {
    for (let y = fromY; y > I.top + BAR_H; y -= 4) {
      let xl = I.left + GAP, xr = W - I.right - GAP;
      for (const o of obstacles) { const b = bb(o); if (b.y < y + h + GAP && b.y + b.h > y - GAP) { if (b.x + b.w / 2 < W / 2) xl = Math.max(xl, b.x + b.w + GAP); else xr = Math.min(xr, b.x - GAP); } }
      const w = Math.min(maxW, xr - xl);
      if (w >= minW) { const cx = clamp(W / 2, xl + w / 2, xr - w / 2); return box(cx - w / 2, y, w, h); }
    }
    return box(W / 2 - minW / 2, I.top + BAR_H + GAP, minW, h);
  };
  const bottom = H - I.bottom - margin;
  const pill = place(BAR_H, 96, 180, ctl, bottom - BAR_H);
  const hint = place(40, 110, 260, [...ctl, pill], pill.y - GAP - 40);
  return { W, H, S, insets: I, ...g, halo: HALO, topbar, mute, pill, hint, controls: ctl };
}
