// The incident number on the death card and the closing card: runs started by everyone, from a public counter (abacus.jasoncameron.dev,
// no account; only the public page counts). If the counter cannot be reached, this device's own count (localStorage, or memory when storage
// is refused). Four digits; past 9999 the public count moves to a counter for the day, and the device count shows today's runs.
const KEY = 'rex.runs';
let runs = { total: 0, day: '', today: 0 };
try { runs = { ...runs, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch {}

const dayOf = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** A run starts: the first step into the world, and each new life after a death. */
export function countRun(now = new Date()) {
  const day = dayOf(now);
  runs = { total: runs.total + 1, day, today: runs.day === day ? runs.today + 1 : 1 };
  try { localStorage.setItem(KEY, JSON.stringify(runs)); } catch {}
  countGlobal(day);
}

const COUNTER = 'https://abacus.jasoncameron.dev/hit/owenkemeys-rex-encounter/';
let global = 0, daily = false;
function countGlobal(day) {
  if (typeof location === 'undefined' || !(location.hostname === 'rexencounter.com' || location.hostname === 'www.rexencounter.com' || location.hostname.endsWith('github.io'))) return;
  fetch(COUNTER + (daily ? 'runs-' + day : 'runs')).then((r) => r.json()).then((j) => {
    const v = +j.value || 0; if (v > 9999 && !daily) { daily = true; countGlobal(day); } else global = v;
  }).catch(() => {});
}

export const incidentNo = () => String(Math.min(9999, global || (runs.total > 9999 ? runs.today : runs.total))).padStart(4, '0');
