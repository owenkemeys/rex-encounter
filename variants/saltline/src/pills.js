// The thought pills (v2: the same as rex_rc/src/ui.js bubbleFrame in mode "always", set in Saltline's own Barlow Condensed), ported from rex/src/ui.js (bubbleFrame, pushThought, retire) with mode 'always'; the CSS is
// rex/dist/index.html's #bubble rules. Only the wiring (camera, sim, mind, arena) is Saltline's.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export function makePills({ THREE, camera, sim, mind, arena, root }) {
  const css = document.createElement('style');
  css.textContent = `#bubble { --ink: #e8e4da; --body: "Barlow Condensed", "IBM Plex Sans", system-ui, sans-serif; position: fixed; left: 0; top: 0; z-index: 3; pointer-events: none; display: none; width: max-content; max-width: min(78vw, 280px); }
#bubble.on { display: flex; flex-direction: column; align-items: center; gap: 4px; }
#bubble.dock-left.on { align-items: flex-start; } #bubble.dock-right.on { align-items: flex-end; }
#bubble .pill { background: rgba(11,13,15,0.66); color: var(--ink); font: 500 calc(17px * var(--bs, 1))/1.25 var(--body); letter-spacing: 0.03em; text-transform: lowercase; text-align: center; text-wrap: balance; padding: 5px 12px; border-radius: 3px; border-left: 2px solid rgba(141,154,163,0.8); text-shadow: 0 1px 3px rgba(0,0,0,0.6); opacity: 0; max-height: 0; padding-top: 0; padding-bottom: 0; overflow: hidden; transform: translateY(6px); transform-origin: 50% 100%; transition: opacity .45s ease, transform .45s ease, max-height .35s ease, padding .35s ease; }
#bubble .pill.in { opacity: 1; max-height: 5.5em; padding-top: 6px; padding-bottom: 6px; transform: none; }
#bubble .pill.in[data-rank="1"] { opacity: 0.55; transform: scale(0.88); }
#bubble .pill.in[data-rank="2"] { opacity: 0.3; transform: scale(0.78); }
#bubble .pill.gone { opacity: 0 !important; transition-duration: .6s; }
#bcue { display: none; color: var(--ink); opacity: 0.6; line-height: 1; }
#bubble.cue #bcue { display: inline-flex; }
#bcue i { font-style: normal; display: inline-block; font-size: 13px; transition: transform .3s; }
#bpills { display: flex; flex-direction: column; align-items: center; gap: 4px; }
#bubble.dock-left #bpills { align-items: flex-start; } #bubble.dock-right #bpills { align-items: flex-end; }
#bubble.dock-left, #bubble.dock-left #bcue { align-self: flex-start; }
@media (max-width: 640px) { #bubble .pill { font-size: calc(13px * var(--bs, 1)); } }`;
  document.head.appendChild(css);
  const bub = document.createElement('div'); bub.id = 'bubble'; bub.setAttribute('aria-hidden', 'true');
  bub.innerHTML = '<div id="bpills"></div><div id="bcue"><i>&#8593;</i></div>'; root.appendChild(bub);
  const pills = bub.querySelector('#bpills'), cueI = bub.querySelector('#bcue').querySelector('i');
  const flags = { thoughts: 'always' }, S = { mindOn: true, started: true, mode: 'foot', zoom: null };
  const voice = () => mind.voice || { think: '' };
  const pv = new THREE.Vector3(), LIFE = [99, 6.5, 3.2];
  const B = { items: [], text: '', sx: undefined, sy: undefined, vis: false, L: 1, on: 0, off: 0, docked: false, side: 1, mode: '' };
  function crude(t) { t = (t || '').trim().replace(/\s+/g, ' '); if (t.length > 60) { t = t.slice(0, 60); t = t.slice(0, t.lastIndexOf(' ')) + '...'; } return t; }
  function retire(it) { if (it.dead) return; it.dead = true; it.el.classList.add('gone'); setTimeout(() => it.el.remove(), 700); }
  function pushThought(text, now) {
    const el = document.createElement('div'); el.className = 'pill'; el.textContent = text.toLowerCase(); pills.appendChild(el);
    const it = { el, text, at: now }; B.items.push(it); requestAnimationFrame(() => el.classList.add('in'));
    const live = B.items.filter((i) => !i.dead); while (live.length > 3) retire(live.shift());
  }
  function bubbleFrame(now, dt, hidden) {
    const mode = flags.thoughts, on = mode !== 'never' && S.mindOn && S.started && !hidden;
    const raw = on ? crude(voice().think) : '';
    const st = mind.voice && mind.voice.stream, tail = st && st.length ? st[st.length - 1] : null, key = raw && tail ? tail.t + '|' + raw : raw;
    if (raw && key !== B.text) { B.text = key; pushThought(raw, now); }
    if (!raw) B.text = '';
    const live = B.items.filter((i) => !i.dead);
    for (let i = 0; i < live.length; i++) {
      const it = live[i], rank = live.length - 1 - i, cur = rank === 0 && !!raw;
      if (!on || (!cur && (now - it.at > 9 || (rank > 0 && now - it.at > LIFE[Math.min(rank, 2)] + 4)))) { retire(it); continue; }
      if (rank === 0 && !raw && now - it.at > 4) { retire(it); continue; }
      it.el.dataset.rank = Math.min(rank, 2);
    }
    B.items = B.items.filter((i) => !i.dead);
    if (!on || !B.items.length) { bub.classList.remove('on'); B.vis = false; B.sx = undefined; return; }
    camera.updateMatrixWorld();
    const h = sim.head.pos; pv.set(h.x, h.y + 1.3, h.z);
    const d = camera.position.distanceTo(pv);
    pv.applyMatrix4(camera.matrixWorldInverse); const vx = pv.x, vz = pv.z, behind = vz > -0.3;
    pv.set(h.x, h.y + 1.3, h.z); pv.project(camera);
    const V = arena.victims && arena.victims.get('you'), held = V && (V.state === 'held' || V.state === 'pinned');
    const inView = !behind && Math.abs(pv.x) < 0.92 && pv.y < 0.92 && pv.y > -0.9;
    if (inView && !held) { B.on += dt; B.off = 0; } else { B.off += dt; B.on = 0; }
    if (B.docked && !held && B.on > 0.35) B.docked = false;
    else if (!B.docked && (held || B.off > 0.25)) B.docked = true;
    { const target = 1; B.L += (target - B.L) * Math.min(1, dt * 4); }
    if (B.mode !== mode) { B.mode = mode; if (mode === 'always') B.L = 1; }
    bub.style.opacity = (0.22 + 0.78 * B.L).toFixed(3); bub.style.filter = B.L > 0.97 ? '' : `blur(${((1 - B.L) * 3.2).toFixed(2)}px)`;
    bub.style.setProperty('--bs', clamp(1 - (d - 25) / 260, 0.84, 1).toFixed(3));
    const w = window.innerWidth, hh = window.innerHeight, bw = bub.offsetWidth, bh = bub.offsetHeight;
    let x, y, cue = '', side = '';
    if (!B.docked) { x = clamp((pv.x * 0.5 + 0.5) * w, bw / 2 + 8, w - bw / 2 - 8); y = clamp((-pv.y * 0.5 + 0.5) * hh, bh + 8, hh - 8); }
    else if (held) { x = w / 2; y = Math.min(hh * 0.2 + bh, hh - 8); }
    else {
      const m = Math.hypot(vx, vz) || 1; if (Math.abs(vx) / m > 0.2) B.side = vx < 0 ? -1 : 1;
      side = B.side < 0 ? 'dock-left' : 'dock-right';
      x = B.side < 0 ? bw / 2 + 12 : w - bw / 2 - 12; y = clamp(hh * 0.45, bh + 8, hh - 8);
      cue = '1'; cueI.style.transform = `rotate(${Math.atan2(vx, -vz).toFixed(3)}rad)`;
    }
    cueI.style.display = B.docked && !held ? '' : 'none';
    bub.classList.toggle('cue', !!cue); bub.classList.toggle('dock-left', side === 'dock-left'); bub.classList.toggle('dock-right', side === 'dock-right');
    if (B.sx === undefined) { B.sx = x; B.sy = y; }
    const k = 1 - Math.exp(-(dt || 0) * (B.docked ? 7 : 14));
    B.sx += (x - B.sx) * k; B.sy += (y - B.sy) * k;
    bub.style.transform = `translate(${Math.round(B.sx - bw / 2)}px, ${Math.round(B.sy - bh)}px)`;
    bub.classList.add('on'); B.vis = true;
  }
  return { frame: bubbleFrame, el: bub };
}
