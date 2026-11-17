// Live tuning: a registry of parameters plus the panel that edits them (the owner tunes by eye and ear, then screencaps the values).
// A parameter lives where the game reads it: tune(group, label, obj, key, min, max, step, onChange?, code?, note?) registers obj[key]; the slider writes
// straight into that object, and onChange(v) pushes it anywhere else it must go (a uniform, a light, a rebuilt mesh). Registration is a plain function
// call with no DOM, so the sim files can register too (a no-op in cost in Node and the Saltline build). The default is the value at registration.
// Values the owner changed persist in localStorage (one key) and are re-applied at registration, so they are back before the game first reads them.
// note: 'reload' or 'spawn' marks a parameter that only takes effect later (shown on its row).
const KEY = 'rex.tune.v1';
const reg = new Map();          // id -> entry
const groups = new Map();       // name -> { order, open, items: [] }
const listeners = new Set();
let store = null, pins = null;  // store: { id: value } of changed values, pins: Set of ids
let hooks = { release: null, enabled: null };

const ls = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };
const load = () => {
  if (store) return;
  store = {}; pins = new Set();
  try { const s = ls(), j = s && JSON.parse(s.getItem(KEY) || 'null'); if (j) { if (j.v && typeof j.v === 'object') store = j.v; if (Array.isArray(j.pin)) pins = new Set(j.pin); } } catch {}
};
const save = () => { try { const s = ls(); if (!s) return; if (!Object.keys(store).length && !pins.size) s.removeItem(KEY); else s.setItem(KEY, JSON.stringify({ v: store, pin: [...pins] })); } catch {} };
const emit = () => { for (const f of listeners) try { f(); } catch {} };

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const eq = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)) : a === b);

function add(kind, group, label, obj, key, min, max, step, onChange, code, note) {
  load();
  const id = group + '|' + label, prev = reg.get(id);
  const e = prev || { id, group, label, kind, min, max, step, def: obj[key], onChange: null, code: '', note: '' };
  e.obj = obj; e.key = key; e.onChange = onChange || null; e.code = code || (slug(group) + '.' + key); e.note = note || ''; e.kind = kind;
  if (!prev) {
    e.min = min; e.max = max; e.step = step;
    reg.set(id, e);
    let g = groups.get(group); if (!g) groups.set(group, g = { order: 100 + groups.size, open: false, items: [] });
    g.items.push(e);
  }
  if (id in store) { const v = store[id]; try { obj[key] = v; if (e.onChange) e.onChange(v); } catch {} }
  return e;
}
/** A number: obj[key] between min and max in steps of step. */
export function tune(group, label, obj, key, min, max, step, onChange, code, note) { return add('num', group, label, obj, key, min, max, step, onChange, code, note); }
/** A colour held as a 0xRRGGBB number. */
export function tuneColor(group, label, obj, key, onChange, code, note) { return add('color', group, label, obj, key, 0, 0xffffff, 1, onChange, code, note); }
/** A switch. */
export function tuneBool(group, label, obj, key, onChange, code, note) { return add('bool', group, label, obj, key, 0, 1, 1, onChange, code, note); }
/** Group display options: order (smaller first), open (expanded at first). */
export function tuneGroup(name, opts = {}) {
  let g = groups.get(name); if (!g) groups.set(name, g = { order: 100 + groups.size, open: false, items: [] });
  if (opts.order != null) g.order = opts.order; if (opts.open != null) g.open = !!opts.open;
}

export const tuneEntries = () => [...reg.values()];
export const tuneEntry = (id) => reg.get(id);
export const tuneValue = (e) => e.obj[e.key];
export const tuneChanged = (e) => !eq(e.obj[e.key], e.def);
export function tuneSet(e, v) {
  if (typeof e === 'string') e = reg.get(e); if (!e) return;
  if (e.kind === 'bool') v = !!v; else { v = +v; if (!Number.isFinite(v)) return; }
  e.obj[e.key] = v; try { if (e.onChange) e.onChange(v); } catch (err) { console.warn('tune', e.id, err); }
  load(); if (eq(v, e.def)) delete store[e.id]; else store[e.id] = v;
  save(); emit();
}
export const tuneReset = (e) => { if (typeof e === 'string') e = reg.get(e); if (e) tuneSet(e, e.def); };
export function tuneResetAll() {
  load(); for (const e of reg.values()) if (tuneChanged(e)) { e.obj[e.key] = e.def; try { if (e.onChange) e.onChange(e.def); } catch {} }
  store = {}; save(); emit();
}
/** How many values are changed from their defaults (counts stored values for parameters not registered yet). */
export const tuneCount = () => { load(); return Math.max(Object.keys(store).length, [...reg.values()].filter(tuneChanged).length); };
export const tuneSubscribe = (f) => { listeners.add(f); return () => listeners.delete(f); };
/** The panel is offered when the hash says debug or tune, or when tuned values are already held (the public does not stumble into it). */
export const tuneAvailable = () => { try { if (/debug|tune/.test(location.hash)) return true; } catch {} load(); return Object.keys(store).length > 0; };

const fmtNum = (v) => String(Number(Number(v).toPrecision(6)));
const fmtVal = (e, v) => (e.kind === 'color' ? '0x' + (v >>> 0).toString(16).padStart(6, '0') : e.kind === 'bool' ? String(!!v) : fmtNum(v));
/** One line per changed value: `storm.fogDensity = 0.0102 (was 0.0115)`. */
export function tuneCopyText() {
  return [...reg.values()].filter(tuneChanged).map((e) => `${e.code} = ${fmtVal(e, e.obj[e.key])} (was ${fmtVal(e, e.def)})` + (e.note ? ` [${e.note}]` : '')).join('\n');
}

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
  pin.addEventListener('click', () => { load(); if (pins.has(e.id)) pins.delete(e.id); else pins.add(e.id); save(); emit(); });
  ctl.append(rst, pin); row.append(top, ctl);
  function paint() {
    const v = e.obj[e.key], ch = tuneChanged(e);
    row.classList.toggle('changed', ch); rst.disabled = !ch; pin.classList.toggle('on', pins.has(e.id)); pin.setAttribute('aria-pressed', String(pins.has(e.id)));
    if (e.kind === 'num') { if (document.activeElement !== slider) slider.value = v; if (document.activeElement !== num) num.value = fmtNum(v); }
    else if (e.kind === 'color') { slider.value = '#' + (v >>> 0).toString(16).padStart(6, '0'); if (document.activeElement !== num) num.value = fmtVal(e, v); }
    else sw.checked = !!v;
  }
  return { row, paint };
}

function refresh() {
  if (!root) return;
  load();
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
  load();
  const list = [...pins].map((id) => reg.get(id)).filter(Boolean), sig = list.map((e) => e.id).join('\n');
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
  build(); listeners.add(refresh); refresh();
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
