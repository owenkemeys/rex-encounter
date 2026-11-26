// Route-grid fragmentation in Saltline's world and on our arena: open cells, regions, largest region, cells in the squeeze band.
//   node test/navfrag.mjs [--navbody=R]
import fs from 'fs';
import { makeSaltTerrain, saltlineDesc } from './worlds/saltworld.js';
import { Creature } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { bodyRoom } from '../src/rex/body/nav.js';
import { makeTerrain } from '../src/terrain.js';
import { TYRANNOSAURUS } from '../src/rex/species/tyrannosaurus.js';
const a = process.argv.find((s) => s.startsWith('--navbody=')), NB = a ? +a.split('=')[1] : null;
const W = JSON.parse(fs.readFileSync(new URL('./worlds/saltline.json', import.meta.url)));
function frag(T, x, z, label) {
  const nb0 = TYRANNOSAURUS.navBody; if (NB !== null) TYRANNOSAURUS.navBody = NB;
  const sim = new Creature(T, { x, z, seed: 1 }); new Mind(sim, 1); TYRANNOSAURUS.navBody = nb0;
  const nav = sim.nav; nav._fresh();
  const cnt = new Map(); let open = 0, sq = 0;
  for (let k = 0; k < nav.cost.length; k++) if (nav.cost[k] < Infinity) { open++; cnt.set(nav.comp[k], (cnt.get(nav.comp[k]) || 0) + 1); if (nav.cost[k] >= 4) sq++; }
  const big = Math.max(...cnt.values());
  console.log(`${label}: pass ${nav.body.toFixed(2)} room ${nav.room.toFixed(2)} open ${open} regions ${cnt.size} largest ${big} (${(100 * big / open).toFixed(0)}%) cost>=4 ${sq}; start region ${cnt.get(nav.comp[nav.cellOf(x, z)[0] + nav.n * nav.cellOf(x, z)[1]])}`);
  return sim;
}
const sim = frag(makeSaltTerrain(saltlineDesc(W)), -31, 15, 'saltline');
console.log('bodyRoom', JSON.stringify(bodyRoom(sim)));
try { frag(makeTerrain(3), 0, 0, 'arena'); } catch (e) { console.log('arena: ' + e.message); }
