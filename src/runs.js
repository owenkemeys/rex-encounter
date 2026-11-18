// The incident number on the death card and the closing card: runs started on this device (localStorage, or memory when storage is refused).
// Four digits; past 9999 it shows today's run count instead.
const KEY = 'rex.runs';
let runs = { total: 0, day: '', today: 0 };
try { runs = { ...runs, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch {}

const dayOf = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** A run starts: the first step into the world, and each new life after a death. */
export function countRun(now = new Date()) {
  const day = dayOf(now);
  runs = { total: runs.total + 1, day, today: runs.day === day ? runs.today + 1 : 1 };
  try { localStorage.setItem(KEY, JSON.stringify(runs)); } catch {}
}

export const incidentNo = () => String(Math.min(9999, runs.total > 9999 ? runs.today : runs.total)).padStart(4, '0');
