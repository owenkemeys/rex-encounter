// Counts the mind's wedged-body recoveries (mem.stuck) and give-ups (mem.gaveUp) in any single-process test, by watching the
// mind after each step; prints the tally at exit, by behaviour, with the nearest solid to the hips at the moment.
//   node test/stuckcount.mjs <test script> [its args...]     e.g. node test/stuckcount.mjs test/saltline.mjs
import { Mind } from '../src/sim/mind.js';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const T = { stuck: [], gaveup: [] }, step = Mind.prototype.step;
Mind.prototype.step = function (...a) {
  const ps = this.mem.stuck && this.mem.stuck.t, pg = this.mem.gaveUp && this.mem.gaveUp.t, r = step.apply(this, a);
  const near = () => { let m = 99; if (this.T.near) for (const o of this.T.near(this.sim.x, this.sim.z, 20)) m = Math.min(m, Math.hypot(o.x - this.sim.x, o.z - this.sim.z) - o.r); return Math.max(0, m).toFixed(1); };
  if (this.mem.stuck && this.mem.stuck.t !== ps) T.stuck.push(`${this.t.toFixed(1)}s ${this.beh ? this.beh.name : '-'} n${this.mem.stuck.n} solid ${near()}m`);
  if (this.mem.gaveUp && this.mem.gaveUp.t !== pg) T.gaveup.push(`${this.t.toFixed(1)}s ${this.mem.gaveUp.beh} solid ${near()}m`);
  return r;
};
const script = process.argv[2]; process.argv.splice(2, 1);
process.on('exit', (c) => { console.log(`\nSTUCKCOUNT stuck ${T.stuck.length}, gaveup ${T.gaveup.length} (exit ${c})`); for (const k of ['stuck', 'gaveup']) for (const e of T[k]) console.log(`  ${k} ${e}`); });
await import(pathToFileURL(path.resolve(script)).href);
