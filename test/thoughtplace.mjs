// node test/thoughtplace.mjs: thought placement never hits a control, stays inside the viewport, and pins to the true side when off screen or behind
import { touchLayout } from '../src/touchlayout.js';
import { placeThought, damp } from '../src/thoughtplace.js';
let bad = 0; const fail = (m) => { if (bad++ < 20) console.log('FAIL', m); };
const bb = (c) => (c.r !== undefined ? { x: c.cx - c.r, y: c.cy - c.r, w: 2 * c.r, h: 2 * c.r } : c);
const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
let n = 0;
for (const [W, H, I] of [[844, 390, { left: 47, right: 47, bottom: 21, top: 10 }], [390, 844, { top: 47, bottom: 34, left: 10, right: 10 }], [844, 390, { top: 10, left: 10, right: 10, bottom: 10 }]]) {
  const L = touchLayout(W, H, I), keep = [...L.controls, L.pill, L.hint, L.topbar, L.mute].map(bb), vp = { w: W, h: H, insets: L.insets };
  for (const size of [{ w: 120, h: 34 }, { w: 220, h: 90 }]) {
    const chk = (r, tag) => {
      n++; const bx = { x: r.x, y: r.y, w: size.w, h: size.h };
      if (bx.x < L.insets.left - 0.01 || bx.y < L.insets.top - 0.01 || bx.x + bx.w > W - L.insets.right + 0.01 || bx.y + bx.h > H - L.insets.bottom + 0.01) fail(`${W}x${H} ${tag}: outside viewport ${JSON.stringify(bx)}`);
      for (const k of keep) if (hit(bx, k)) fail(`${W}x${H} ${tag}: hits keep-out ${JSON.stringify(k)} ${JSON.stringify(bx)}`);
    };
    for (let sx = -300; sx <= W + 300; sx += 41) for (let sy = -300; sy <= H + 300; sy += 37) {
      const b = Math.atan2(sx - W / 2, 400), r = placeThought({ sx, sy, behind: false, depth: 10, bearing: b }, vp, keep, size);
      chk(r, `anchor ${sx},${sy}`);
      if (r.mode === 'edge' && sx < 0 && sy > 0 && sy < H && r.edge !== 'left') fail(`${W}x${H}: left of screen went to ${r.edge}`);
    }
    for (const [name, bearing, want] of [['behind-left', -2.6, 'left'], ['behind-right', 2.6, 'right'], ['behind-left-near', -Math.PI + 0.3, 'left'], ['behind-right-near', Math.PI - 0.3, 'right']]) {
      for (const [sx, sy] of [[W / 2, H / 2], [10, 10], [W - 10, H - 10], [-5000, 9000]]) {
        const r = placeThought({ sx, sy, behind: true, depth: 2, bearing }, vp, keep, size); chk(r, name);
        if (r.mode !== 'edge' || r.edge !== want) fail(`${W}x${H} ${name}: edge ${r.edge}`);
        else if (want === 'left' ? r.x > L.insets.left + 8 + 0.01 : r.x + size.w < W - L.insets.right - 8 - 0.01) fail(`${W}x${H} ${name}: not at the ${want} edge (${r.x})`);
      }
    }
  }
}
// a head in the middle of the view with free space above stays above the head
{ const keep = [], r = placeThought({ sx: 400, sy: 250, behind: false, depth: 9, bearing: 0 }, { w: 844, h: 390, insets: {} }, keep, { w: 100, h: 30 }); if (r.mode !== 'head' || Math.abs(r.x - 350) > 0.01 || r.y + 30 > 250) fail('free head not above the head'); }
// hysteresis: a head 10 px inside the edge stays "edge" once there, but is "head" when it was already on
{ const vp = { w: 844, h: 390, insets: {} }, a = { sx: 18, sy: 200, behind: false, depth: 9, bearing: -0.8 };
  if (placeThought(a, vp, [], { w: 80, h: 30 }, { wasEdge: true }).mode !== 'edge' || placeThought(a, vp, [], { w: 80, h: 30 }, { wasEdge: false }).mode !== 'head') fail('edge hysteresis'); }
// ease: settles within ~0.15 s * a few, no overshoot
{ let x = 0; const st = { v: 0 }; let mx = 0; for (let i = 0; i < 60; i++) { x = damp(x, 100, st, 1 / 60); mx = Math.max(mx, x); } if (mx > 100.01 || Math.abs(x - 100) > 1) fail(`damp ${x} ${mx}`); }
console.log(bad ? `${bad} FAILED` : `thought placement ok (${n} placements)`); process.exit(bad ? 1 : 0);
