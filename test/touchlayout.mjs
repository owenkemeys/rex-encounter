// node test/touchlayout.mjs: the touch layout's geometry for many viewports (src/touchlayout.js)
import { touchLayout, tooClose } from '../src/touchlayout.js';
const sizes = [[844, 390], [390, 844], [390, 460], [430, 932], [932, 430], [768, 1024], [1024, 768], [320, 568]];
const insetsFor = (W, H) => (W > H ? [{}, { left: 47, right: 47, bottom: 21 }] : [{}, { top: 47, bottom: 34 }]);
let bad = 0; const fail = (m) => { bad++; console.log('FAIL', m); };
for (const [W, H] of sizes) for (const I of insetsFor(W, H)) {
  const L = touchLayout(W, H, I), tag = `${W}x${H} ${JSON.stringify(I)}`, ins = L.insets, B = L.buttons;
  const named = { stickL: L.left, stickR: L.right, ...B, pill: L.pill, hint: L.hint, topbar: L.topbar, mute: L.mute }, ks = Object.keys(named);
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
    const a = named[ks[i]], b = named[ks[j]], isBtn = (k) => k in B, isStick = (k) => k.startsWith('stick');
    const gap = (isBtn(ks[i]) && isStick(ks[j])) || (isStick(ks[i]) && isBtn(ks[j])) ? 12 : 8;
    if (tooClose(a, b, gap)) fail(`${tag}: ${ks[i]} and ${ks[j]} overlap or are closer than ${gap}`);
  }
  for (const k of ks) { const c = named[k], bx = c.r !== undefined ? { x: c.cx - c.r, y: c.cy - c.r, w: 2 * c.r, h: 2 * c.r } : c; if (bx.x < ins.left - 0.01 || bx.y < ins.top - 0.01 || bx.x + bx.w > W - ins.right + 0.01 || bx.y + bx.h > H - ins.bottom + 0.01) fail(`${tag}: ${k} outside the viewport`); }
  // mirror images: same size, same distance from side edge and bottom edge (insets included)
  if (L.left.r !== L.right.r) fail(`${tag}: stick sizes differ`);
  if (Math.abs((L.left.cx - ins.left) - (W - ins.right - L.right.cx)) > 0.01 || Math.abs(L.left.cy - L.right.cy) > 0.01) fail(`${tag}: sticks are not mirrored`);
  if (Math.abs(L.left.cy - (H - ins.bottom - L.margin - L.left.r)) > 0.01) fail(`${tag}: stick not at the bottom margin`);
  const rs = Object.values(B).map((c) => c.r); if (rs.some((r) => r !== rs[0]) || rs[0] * 2 < 48) fail(`${tag}: button sizes differ or under 48`);
  if (L.base < 110 || L.base > 150 || Math.abs(L.knob - 0.45 * L.base) > 0.01) fail(`${tag}: base or knob size`);
  // buttons at the stated radius from their stick (the tight layout's CROUCH is the one exception, above FLARE)
  const rad = (c, s) => Math.hypot(c.cx - s.cx, c.cy - s.cy), want = L.base / 2 + L.btn / 2 + 12;
  for (const [k, st] of [['jump', L.right], ['crouch', L.right], ['torch', L.left]]) if (Math.abs(rad(B[k], st) - want) > 0.01) fail(`${tag}: ${k} radius`);
  if (L.mode === 'arc') { if (Math.abs(rad(B.flare, L.right) - want) > 0.01) fail(`${tag}: flare radius`); if (Math.abs(rad(B.call, L.left) - want) > 0.01) fail(`${tag}: call radius`); }
  if (!(B.jump.cx === L.right.cx && B.jump.cy < L.right.cy)) fail(`${tag}: jump not straight above the look stick`);
  if (!(B.torch.cx === L.left.cx && B.torch.cy < L.left.cy)) fail(`${tag}: torch not straight above the move stick`);
  if (L.pill.y < L.topbar.y + L.topbar.h) fail(`${tag}: pill under the top bar`);
}
const show = (W, H) => { const L = touchLayout(W, H, {}), f = (c) => c.r !== undefined ? `c(${c.cx.toFixed(0)},${c.cy.toFixed(0)} r${c.r.toFixed(0)})` : `[${c.x.toFixed(0)},${c.y.toFixed(0)} ${c.w.toFixed(0)}x${c.h.toFixed(0)}]`;
  console.log(`${W}x${H} mode ${L.mode} base ${L.base.toFixed(0)} btn ${L.btn.toFixed(0)} knob ${L.knob.toFixed(0)} margin ${L.margin.toFixed(1)}`); console.log('  stickL', f(L.left), 'stickR', f(L.right)); for (const k in L.buttons) console.log('  ' + k, f(L.buttons[k])); console.log('  pill', f(L.pill), 'hint', f(L.hint), 'topbar', f(L.topbar), 'mute', f(L.mute)); };
show(390, 460); show(844, 390);
console.log(bad ? bad + ' touch layout checks FAILED' : 'all touch layout checks passed'); process.exit(bad ? 1 : 0);
