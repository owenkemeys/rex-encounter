// Live tuning, the panel half: the owner tunes by eye and ear, then screencaps the values. The registry (tune(), tuneSet(), the
// stored values) is the rex's own, src/rex/tune.js, re-exported here so the game's files import one place. Persistence in this
// browser is plugged in by src/tunestore.js (main.js imports it first).
import { tuneEntry, tuneChanged, tuneSet, tuneReset, tuneResetAll, tuneCount, tuneStoredCount, tuneSubscribe, tuneGroups, tunePinned, tunePins, tuneTogglePin, tuneFormat, tuneCopyText } from '../rex/tune.js';
export * from '../rex/tune.js';
let hooks = { release: null, enabled: null };
const groups = tuneGroups();
/** The panel is offered when the hash says debug or tune, or when tuned values are already held (the public does not stumble into it). */
export const tuneAvailable = () => { try { if (/debug|tune/.test(location.hash)) return true; } catch {} return tuneStoredCount() > 0; };
const fmtNum = (v) => String(Number(Number(v).toPrecision(6)));
const fmtVal = tuneFormat;

// ------------------------------------------------------------------------------------------------ the panel
let stripSig = null, root = null, listEl = null, badgeEl = null, outEl = null, stripEl = null, searchEl = null, isOpen = false, rows = new Map(), strips = new Map();
const h = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };

function makeRow(e, compact) {
  const row = h('div', 'tr' + (compact ? ' tc' : '')), top = h('div', 'tl'), lab = h('span', 'tn', e.label);
  top.appendChild(lab);
  if (!compact) { const cd = h('small', 'tcode', e.code + (e.note ? (/^(reload|spawn)/.test(e.note) ? ' · applies on ' : ' · ') + e.note : '')); top.appendChild(cd); }
  const ctl = h('div', 'tctl'); let slider = null, num = null, sw = null;
  const rst = h('button', 'trst', '↺'); rst.type = 'button'; rst.title = 'reset to default'; rst.setAttribute('aria-label', 'reset ' + e.label);
  const pin = h('button', 'tpin', '★'); pin.type = 'button'; pin.title = 'pin to the strip'; pin.setAttribute('aria-label', 'pin ' + e.label);
  if (e.kind === 'num') {
    slider = h('input'); slider.type = 'range'; slider.min = e.min; slider.max = e.max; slider.step = e.step; slider.setAttribute('aria-label', e.label);
    num = h('input', 'tnum'); num.type = 'text'; num.inputMode = 'decimal'; num.autocomplete = 'off'; num.setAttribute('aria-label', e.label + ' value');
    slider.addEventListener('input', () => tuneSet(e, slider.value));
    const commit = () => { const v = parseFloat(num.value.replace(',', '.')); if (Number.isFinite(v)) tuneSet(e, v); else paint(); };
    num.addEventListener('change', commit); num.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { commit(); num.blur(); } });
    ctl.append(slider, num);
  } else if (e.kind === 'color') {
    slider = h('input'); slider.type = 'color'; slider.setAttribute('aria-label', e.label);
    num = h('input', 'tnum'); num.type = 'text'; num.autocomplete = 'off'; num.setAttribute('aria-label', e.label + ' hex');
    slider.addEventListener('input', () => tuneSet(e, parseInt(slider.value.slice(1), 16)));
    num.addEventListener('change', () => { const m = /^(?:#|0x)?([0-9a-f]{6})$/i.exec(num.value.trim()); if (m) tuneSet(e, parseInt(m[1], 16)); else paint(); });
    ctl.append(slider, num);
  } else {
    sw = h('input'); sw.type = 'checkbox'; sw.setAttribute('aria-label', e.label); sw.addEventListener('change', () => tuneSet(e, sw.checked)); ctl.append(sw);
  }
  rst.addEventListener('click', () => tuneReset(e));
  pin.addEventListener('click', () => tuneTogglePin(e.id));
  ctl.append(rst, pin); row.append(top, ctl);
  function paint() {
    const v = e.obj[e.key], ch = tuneChanged(e);
    row.classList.toggle('changed', ch); rst.disabled = !ch; pin.classList.toggle('on', tunePinned(e.id)); pin.setAttribute('aria-pressed', String(tunePinned(e.id)));
    if (e.kind === 'num') { if (document.activeElement !== slider) slider.value = v; if (document.activeElement !== num) num.value = fmtNum(v); }
    else if (e.kind === 'color') { slider.value = '#' + (v >>> 0).toString(16).padStart(6, '0'); if (document.activeElement !== num) num.value = fmtVal(e, v); }
    else sw.checked = !!v;
  }
  return { row, paint };
}

function refresh() {
  if (!root) return;
  const n = tuneCount(); badgeEl.textContent = 'tuned: ' + n + ' value' + (n === 1 ? '' : 's'); badgeEl.classList.toggle('on', n > 0);
  for (const r of rows.values()) r.paint();
  for (const [g, el] of groupEls) { const ch = groups.get(g).items.filter(tuneChanged).length; el.querySelector('.tgc').textContent = ch ? ch + ' changed' : groups.get(g).items.length; el.classList.toggle('hasch', ch > 0); }
  buildStrip();
}
const groupEls = new Map();
function build() {
  listEl.textContent = ''; rows.clear(); groupEls.clear();
  const names = [...groups.keys()].sort((a, b) => groups.get(a).order - groups.get(b).order);
  for (const name of names) {
    const g = groups.get(name); if (!g.items.length) continue;
    const d = h('details', 'tg'), s = h('summary'); s.append(h('span', 'tgn', name), h('span', 'tgc', String(g.items.length))); d.append(s); d.open = g.open;
    for (const e of g.items) { const r = makeRow(e, false); rows.set(e.id, r); d.append(r.row); }
    listEl.append(d); groupEls.set(name, d);
  }
  filter();
}
function filter() {
  const q = searchEl.value.trim().toLowerCase();
  for (const [name, d] of groupEls) {
    let any = false;
    for (const e of groups.get(name).items) { const hit = !q || (e.label + ' ' + e.code + ' ' + name).toLowerCase().includes(q); rows.get(e.id).row.hidden = !hit; any = any || hit; }
    d.hidden = !any; if (q) d.open = any;
  }
}
function buildStrip() {
  if (!stripEl) return;
  const list = tunePins().map((id) => tuneEntry(id)).filter(Boolean), sig = list.map((e) => e.id).join('\n');
  if (sig === stripSig) { for (const r of strips.values()) r.paint(); return; }      // (only repaint while a value moves: rebuilding would drop the slider being dragged)
  stripSig = sig; stripEl.textContent = ''; strips.clear();
  stripEl.hidden = !list.length;
  for (const e of list) { const r = makeRow(e, true); strips.set(e.id, r); stripEl.append(r.row); r.paint(); }
}
function mount() {
  if (root || typeof document === 'undefined') return;
  root = document.getElementById('tunePanel') || document.body.appendChild(h('section')); root.id = 'tunePanel'; root.hidden = !isOpen; root.setAttribute('aria-label', 'Tuning');
  const head = h('div', 'tt'), title = h('b', '', 'tuning'), close = h('button', '', 'close'); close.type = 'button'; close.addEventListener('click', () => tuneOpen(false));
  badgeEl = h('span', 'tbadge'); head.append(title, badgeEl, close);
  searchEl = h('input', 'tsearch'); searchEl.type = 'search'; searchEl.placeholder = 'search (e.g. fog, roar, jaw)'; searchEl.autocomplete = 'off'; searchEl.setAttribute('aria-label', 'search parameters');
  searchEl.addEventListener('input', filter);
  const bar = h('div', 'tbar'), copy = h('button', '', 'copy changed values'), rall = h('button', '', 'reset all');
  copy.type = rall.type = 'button';
  copy.addEventListener('click', async () => {
    const text = tuneCopyText() || '(nothing changed)'; outEl.hidden = false; outEl.value = text; outEl.focus(); outEl.select();
    try { await navigator.clipboard.writeText(text); copy.textContent = 'copied'; } catch { copy.textContent = 'select and copy below'; }
    setTimeout(() => { copy.textContent = 'copy changed values'; }, 2200);
  });
  rall.addEventListener('click', () => { if (!tuneCount() || confirm('Put every tuned value back to its default?')) tuneResetAll(); });
  bar.append(copy, rall);
  outEl = h('textarea', 'tout'); outEl.hidden = true; outEl.readOnly = true; outEl.rows = 6; outEl.setAttribute('aria-label', 'changed values');
  const hint = h('p', 'thint', 'Star a row to keep it on screen while you play. Some rows say they apply on reload or next spawn.');
  listEl = h('div', 'tlist');
  const box = h('div', 'tbox'); box.append(head, searchEl, bar, outEl, hint, listEl); root.append(box);
  for (const ev of ['keydown', 'keyup', 'keypress', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'wheel', 'contextmenu']) root.addEventListener(ev, (e) => e.stopPropagation());
  stripEl = document.getElementById('tuneStrip') || document.body.appendChild(h('div')); stripEl.id = 'tuneStrip'; stripEl.hidden = true;
  for (const ev of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'wheel']) stripEl.addEventListener(ev, (e) => e.stopPropagation());
  build(); tuneSubscribe(refresh); refresh();
}
export function tuneOpen(on = !isOpen) {
  if (typeof document === 'undefined') return;
  mount(); if (!root) return;
  on = !!on; if (on === isOpen) return; isOpen = on; root.hidden = !on; document.body.classList.toggle('tuning', on);
  if (on) { build(); refresh(); try { if (hooks.release) hooks.release(); else if (document.pointerLockElement) document.exitPointerLock(); } catch {} }
  else if (document.activeElement && root.contains(document.activeElement)) document.activeElement.blur();
}
export const tuneIsOpen = () => isOpen;
/** Wire the panel into the app: release() lets go of the pointer lock without pausing; the key ; opens it when it is free to. */
export function tuneInstall(o = {}) {
  hooks = Object.assign(hooks, o);
  if (typeof window === 'undefined') return;
  window.addEventListener('keydown', (e) => {
    if (e.key !== ';' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.target && e.target.closest && e.target.closest('input, select, textarea')) return;
    if (!(tuneAvailable() || (hooks.enabled && hooks.enabled()))) return;
    e.preventDefault(); tuneOpen();
  });
  if (tuneAvailable()) { const go = () => { mount(); refresh(); }; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go(); }
}
export function tuneShowStrip() { if (typeof document !== 'undefined') { mount(); refresh(); } }
