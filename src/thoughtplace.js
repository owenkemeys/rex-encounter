// Where the animal's thought text goes on screen, as one pure function (no DOM). Used by ui.js (bubbleFrame) and test/thoughtplace.mjs.
// A thought is never projected from a point that is behind the camera or far off screen (that mirrors and flings it about). Instead:
//   head on screen, spot above it free -> above the head; spot over a keep-out -> slid the shortest way (up, then sideways, down last);
//   head off screen or behind -> pinned to the edge in the animal's true direction (side by the signed bearing, top if above), inset,
//   clear of keep-outs, with an arrow angle pointing toward it. Always inside the viewport (minus insets), never over a keep-out.
// Boxes are {x, y, w, h}; circles {cx, cy, r} are accepted as keep-outs. The ease and fade helpers are here too so the test can cover them.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const toBox = (c) => (c.r !== undefined ? { x: c.cx - c.r, y: c.cy - c.r, w: 2 * c.r, h: 2 * c.r } : c);
const hit = (a, b, pad) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
const PAD = 6, EDGE = 8, HYST = 20;

/** Slide `box` (top-left x, y; size w, h) the shortest way (prefer up, then sideways, then down) so it is inside `area` and clear of every keep-out. */
export function clearOf(x, y, w, h, area, keepOut) {
  const ks = keepOut.map(toBox), minX = area.x, maxX = area.x + area.w - w, minY = area.y, maxY = area.y + area.h - h;
  const x0 = clamp(x, minX, Math.max(minX, maxX)), y0 = clamp(y, minY, Math.max(minY, maxY));
  const bad = (cx, cy) => ks.some((k) => hit({ x: cx, y: cy, w, h }, k, PAD));
  if (!bad(x0, y0)) return { x: x0, y: y0, clear: true };
  const xs = [x0], ys = [y0];
  for (const k of ks) { xs.push(k.x - w - PAD, k.x + k.w + PAD); ys.push(k.y - h - PAD, k.y + k.h + PAD); }
  let best = null, bc = Infinity;
  for (const cx0 of xs) for (const cy0 of ys) {
    const cx = clamp(cx0, minX, Math.max(minX, maxX)), cy = clamp(cy0, minY, Math.max(minY, maxY));
    if (bad(cx, cy)) continue;
    const dy = cy - y0, c = Math.abs(cx - x0) * 1.5 + (dy < 0 ? -dy : dy * 3);
    if (c < bc) { bc = c; best = { x: cx, y: cy, clear: true }; }
  }
  return best || { x: x0, y: y0, clear: false };
}

/**
 * anchor: { sx, sy (head in screen px; only used when in front), behind (bool), depth (m, informational), bearing (rad, + = to the right of where the camera faces; +-PI = straight behind) }
 * viewport: { w, h, insets: {top,right,bottom,left} }; keepOut: boxes/circles; size: { w, h }; opts: { wasEdge, side (-1 left / 1 right, last used) }
 * -> { x, y (top-left), mode: 'head' | 'edge', side: -1 | 1 | 0 (0 = top edge or head), edge: 'left'|'right'|'top'|'', angle (rad, 0 = up, + clockwise; for the arrow), clear }
 */
export function placeThought(anchor, viewport, keepOut, size, opts = {}) {
  const I = Object.assign({ top: 0, right: 0, bottom: 0, left: 0 }, viewport.insets), W = viewport.w, H = viewport.h;
  const area = { x: I.left + EDGE, y: I.top + EDGE, w: W - I.left - I.right - 2 * EDGE, h: H - I.top - I.bottom - 2 * EDGE };
  const bw = Math.min(size.w, area.w), bh = Math.min(size.h, area.h);
  const m = opts.wasEdge ? HYST : 0;      // coming back from the edge needs the head 20 px further in, so it does not flicker
  const fin = !anchor.behind && Number.isFinite(anchor.sx) && Number.isFinite(anchor.sy);
  const onScreen = fin && anchor.sx >= area.x + m && anchor.sx <= area.x + area.w - m && anchor.sy >= area.y + m && anchor.sy <= area.y + area.h - m;
  if (onScreen) {
    const p = clearOf(anchor.sx - bw / 2, anchor.sy - bh - 8, bw, bh, area, keepOut);
    return { x: p.x, y: p.y, mode: 'head', side: 0, edge: '', angle: 0, clear: p.clear };
  }
  const b = Number.isFinite(anchor.bearing) ? anchor.bearing : 0, s = Math.sin(b);
  let edge, side = 0;
  if (fin && anchor.sy < area.y && anchor.sx >= area.x && anchor.sx <= area.x + area.w) edge = 'top';        // above the view, in line with it
  else { side = Math.abs(s) > 0.2 || !opts.side ? (s < 0 ? -1 : 1) : opts.side; if (fin && anchor.sx !== W / 2 && Math.abs(s) <= 0.2 && !opts.side) side = anchor.sx < W / 2 ? -1 : 1; edge = side < 0 ? 'left' : 'right'; }
  let x, y;
  if (edge === 'top') { x = clamp(anchor.sx - bw / 2, area.x, area.x + area.w - bw); y = area.y; }
  else { x = side < 0 ? area.x : area.x + area.w - bw; y = I.top + (H - I.top - I.bottom) * 0.45 - bh / 2; }
  const p = clearOf(x, y, bw, bh, area, keepOut);
  let angle;
  if (edge === 'top') angle = 0; else if (fin) angle = Math.atan2(anchor.sx - W / 2, -(anchor.sy - H / 2)); else angle = side < 0 ? -Math.PI / 2 : Math.PI / 2;
  if (edge === 'left' && angle > 0) angle = -Math.PI / 2; if (edge === 'right' && angle < 0) angle = Math.PI / 2;
  return { x: p.x, y: p.y, mode: 'edge', side, edge, angle, clear: p.clear };
}

/** Critically damped follow (smooth time ~0.15 s): state {v}, returns the new position. */
export function damp(cur, target, st, dt, smooth = 0.15) {
  const o = 2 / smooth, x = o * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x), d = cur - target, t = (st.v + o * d) * dt;
  st.v = (st.v - o * t) * e; return target + (d + t) * e;
}
