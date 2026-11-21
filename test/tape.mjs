// node test/tape.mjs : the share tape round trip. A synthetic 16 s tape at the real sizes (animal pose 219 + 24 floats, player 20) with smooth motion,
// things and sound events; checks every value comes back within 1/1000 and prints the packed size.
import { encodeTape, decodeTape } from '../src/tape.js';

const frames = 480, nv = 219, ns = 24, nm = 20, v = new Float32Array(frames * nv), s = new Float32Array(frames * ns), m = new Float32Array(frames * nm);
for (let f = 0; f < frames; f++) {
  const t = f / 30;
  for (let c = 0; c < nv; c++) v[f * nv + c] = 40 * Math.sin(0.11 * t + c) + Math.sin(3 * t + c * 0.7) * 0.4 + (c % 3 === 1 ? 2 : 0);
  for (let c = 0; c < ns; c++) s[f * ns + c] = 0.5 + 0.5 * Math.sin(2 * t + c);
  for (let c = 0; c < nm; c++) m[f * nm + c] = 30 * Math.cos(0.2 * t + c) + (c === 5 ? 0 : 0.01 * Math.sin(9 * t));
}
const th = Array.from({ length: frames }, (_, f) => (f > 200 ? [{ id: 3, kind: 'flare', x: 1.25, y: 0.1, z: -4.5, spin: f * 0.1, burn: 0.5, amount: 0, rest: f > 260 }] : null));
const ev = [{ f: 12.5, e: { type: 'roar', x: 1, z: 2, loud: 1 } }, { f: 400, e: { type: 'contact', part: 'jaw', force: 3 } }];
const tape = { nv, ns, nm, frames, v, s, m, th, ev, meta: { death: 420, seed: 12345, mood: 'storm', live: false } };

const bytes = await encodeTape(tape), back = await decodeTape(bytes);
let worst = 0;
for (const k of ['v', 's', 'm']) for (let i = 0; i < tape[k].length; i++) worst = Math.max(worst, Math.abs(tape[k][i] - back[k][i]));
const same = JSON.stringify([tape.th, tape.ev, tape.meta]) === JSON.stringify([back.th, back.ev, back.meta]);
console.log(`packed ${(bytes.length / 1024).toFixed(1)} kB for ${frames} frames; raw ${((v.length + s.length + m.length) * 4 / 1024).toFixed(0)} kB; worst error ${worst.toFixed(5)}; things and events ${same ? 'equal' : 'DIFFER'}`);
if (worst > 0.0006 || !same) { console.log('FAIL'); process.exit(1); }
console.log('ok');
