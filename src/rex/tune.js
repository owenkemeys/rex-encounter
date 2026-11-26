// Live tuning, the registry half: tune(group, label, obj, key, min, max, step, onChange?, code?, note?) registers obj[key] as a dial.
// The rex's files register their dials here (species, mind, skin); a host that has no tuning panel can ignore all of it: every value
// stays at its default, and registering costs next to nothing. The panel that edits the dials is the game's (src/view/tune.js).
// The default is the value at registration. Changed values are kept in a store; where the store is saved is the host's business:
// tuneStorage({ load, save }) plugs in persistence (the game's src/tunestore.js keeps them in localStorage), and saved values are
// re-applied at registration, so they are in place before anything first reads them. Without tuneStorage nothing is saved or loaded.
// note: 'reload' or 'spawn' marks a parameter that only takes effect later (shown on its row).
const reg = new Map();          // id -> entry
const groups = new Map();       // name -> { order, open, items: [] }
const listeners = new Set();
let store = {}, pins = new Set();      // store: { id: value } of changed values, pins: Set of ids
let backend = null;                    // { load() -> { v, pin } | null, save({ v, pin } | null) }

const save = () => { if (!backend) return; try { backend.save(!Object.keys(store).length && !pins.size ? null : { v: store, pin: [...pins] }); } catch {} };
const emit = () => { for (const f of listeners) try { f(); } catch {} };

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const eq = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)) : a === b);
const apply = (e, v) => { try { e.obj[e.key] = v; if (e.onChange) e.onChange(v); } catch {} };

/** Plug in where changed values are kept ({ load, save }). Loads at once and re-applies to dials already registered; call it before
 *  the rex's modules are imported (the game does it in its first import) so a saved value is in place before anything reads it. */
export function tuneStorage(b) {
  backend = b || null; store = {}; pins = new Set();
  try { const j = backend && backend.load(); if (j) { if (j.v && typeof j.v === 'object') store = j.v; if (Array.isArray(j.pin)) pins = new Set(j.pin); } } catch {}
  for (const e of reg.values()) if (e.id in store) apply(e, store[e.id]);
  emit();
}

function add(kind, group, label, obj, key, min, max, step, onChange, code, note) {
  const id = group + '|' + label, prev = reg.get(id);
  const e = prev || { id, group, label, kind, min, max, step, def: obj[key], onChange: null, code: '', note: '' };
  e.obj = obj; e.key = key; e.onChange = onChange || null; e.code = code || (slug(group) + '.' + key); e.note = note || ''; e.kind = kind;
  if (!prev) {
    e.min = min; e.max = max; e.step = step;
    reg.set(id, e);
    let g = groups.get(group); if (!g) groups.set(group, g = { order: 100 + groups.size, open: false, items: [] });
    g.items.push(e);
  }
  if (id in store) apply(e, store[id]);
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
  if (eq(v, e.def)) delete store[e.id]; else store[e.id] = v;
  save(); emit();
}
export const tuneReset = (e) => { if (typeof e === 'string') e = reg.get(e); if (e) tuneSet(e, e.def); };
export function tuneResetAll() {
  for (const e of reg.values()) if (tuneChanged(e)) apply(e, e.def);
  store = {}; save(); emit();
}
/** How many values are changed from their defaults (counts stored values for parameters not registered yet). */
export const tuneCount = () => Math.max(Object.keys(store).length, [...reg.values()].filter(tuneChanged).length);
/** How many changed values the store holds (registered or not). */
export const tuneStoredCount = () => Object.keys(store).length;
export const tuneSubscribe = (f) => { listeners.add(f); return () => listeners.delete(f); };
/** The groups, by name: { order, open, items }. For the panel. */
export const tuneGroups = () => groups;
/** Pins: dials starred to stay on screen (kept with the stored values). */
export const tunePinned = (id) => pins.has(id);
export const tunePins = () => [...pins];
export function tuneTogglePin(id) { if (pins.has(id)) pins.delete(id); else pins.add(id); save(); emit(); }

const fmtNum = (v) => String(Number(Number(v).toPrecision(6)));
/** A value as the panel and the copy text show it. */
export const tuneFormat = (e, v) => (e.kind === 'color' ? '0x' + (v >>> 0).toString(16).padStart(6, '0') : e.kind === 'bool' ? String(!!v) : fmtNum(v));
/** One line per changed value: `storm.fogDensity = 0.0102 (was 0.0115)`. */
export function tuneCopyText() {
  return [...reg.values()].filter(tuneChanged).map((e) => `${e.code} = ${tuneFormat(e, e.obj[e.key])} (was ${tuneFormat(e, e.def)})` + (e.note ? ` [${e.note}]` : '')).join('\n');
}
