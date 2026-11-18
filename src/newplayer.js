// '#newplayer': play exactly like a first visit. Wipes what this browser remembers of past play (tips shown and verbs done, the touch
// hint, the run count behind the incident number, achievements, the closing lines lately shown), keeps the settings (sound, look speed,
// VHS, ...), then takes itself out of the URL so a reload or "start over" does not wipe again. Imported first by main.js: it must run
// before runs.js and ui.js read storage.
const FIRST_TIME = ['dh.teach', 'dh.taught', 'dh.thint', 'rex.runs', 'dh.achv', 'dh.dares', 'rex.closeout.recent'];
if (typeof location !== 'undefined' && /newplayer/.test(location.hash)) {
  for (const k of FIRST_TIME) try { localStorage.removeItem(k); } catch {}
  const h = location.hash.replace(/[#&]?newplayer/, '').replace(/^[#&]+/, '');
  try { history.replaceState(null, '', location.pathname + location.search + (h ? '#' + h : '')); } catch {}
  console.info('[newplayer] first-visit state wiped: ' + FIRST_TIME.join(', '));
}
