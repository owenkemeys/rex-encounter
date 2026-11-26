// Where tuned values are kept in the browser: one localStorage key. Imported FIRST by main.js, so saved values are plugged into the
// rex's tuning registry (src/rex/tune.js) before any module registers a dial, and every dial starts at its saved value, as it always has.
import { tuneStorage } from './rex/tune.js';
export const KEY = 'rex.tune.v1';
const ls = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };
export const browserStore = {
  load: () => { const s = ls(); return s ? JSON.parse(s.getItem(KEY) || 'null') : null; },
  save: (j) => { const s = ls(); if (!s) return; if (j) s.setItem(KEY, JSON.stringify(j)); else s.removeItem(KEY); },
};
tuneStorage(browserStore);
