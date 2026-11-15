// Render every synthesised sound (several takes each) to out/audio/*.wav and print quick metrics:
// peak, DC, RMS, crest, generation time, and how alike successive takes are (max normalised cross-correlation).
// Then: python3 test/audio_analyze.py out/audio  (loudness, band balance, spectrogram sheets).
import { synthLib } from '../src/view/audiosynth.js';
import fs from 'fs';
const L = synthLib(), SR = +(process.env.SR || 32000), dir = process.argv[2] || 'out/audio';
fs.mkdirSync(dir, { recursive: true });
const only = process.argv[3];
const jobs = [
  ['footfall', 'walk_wet', { wet: 1, run: 0 }], ['footfall', 'run_wet', { wet: 1, run: 1 }], ['footfall', 'walk_dry', { wet: 0, run: 0 }],
  ['roar'], ['growl'], ['rumble'], ['huff'], ['sniff'], ['clack'], ['crunch'], ['tear'], ['gulp'], ['whoosh'],
  ['thunder', 'near', { dist: 350 }, 22050], ['thunder', 'mid', { dist: 900 }, 22050], ['thunder', 'far', { dist: 3000 }, 22050],
  ['rain', 'wash', { kind: 'wash', len: 6 }], ['rain', 'leaf', { kind: 'leaf', len: 6 }], ['rain', 'ground', { kind: 'ground', len: 6 }], ['rain', 'hard', { kind: 'hard', len: 6 }], ['rain', 'roof', { kind: 'roof', len: 6 }],
  ['bed', 'leaves', { kind: 'leaves' }], ['bed', 'hiss', { kind: 'hiss' }], ['ir', 'out', { kind: 'out' }], ['ir', 'in', { kind: 'in' }],
  ['bird'], ['flurry'], ['alarm'], ['impact', 'stone', { kind: 'stone' }], ['impact', 'smack', { kind: 'smack' }], ['impact', 'thud', { kind: 'thud', wet: 1 }],
  ['step', 'wet', { wet: 1 }], ['step', 'dry', { wet: 0 }], ['rustle'], ['ignite'], ['shout'],
];
export function wav(path, sr, chs) {
  const n = chs[0].length, c = chs.length, b = Buffer.alloc(44 + n * c * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * c * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(c, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * c * 2, 28); b.writeUInt16LE(c * 2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * c * 2, 40);
  for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(chs[k][i] * 32767))), 44 + (i * c + k) * 2);
  fs.writeFileSync(path, b);
}
function xcorr(a, b) {      // max normalised cross-correlation over +-50 ms lags, on 4x decimated envelopes of the waveform
  const d = (x) => { const y = new Float32Array(Math.floor(x.length / 4)); for (let i = 0; i < y.length; i++) y[i] = x[i * 4]; return y; };
  const A = d(a), B = d(b), n = Math.min(A.length, B.length), lag = Math.floor(0.05 * SR / 4);
  let ea = 0, eb = 0; for (let i = 0; i < n; i++) { ea += A[i] * A[i]; eb += B[i] * B[i]; }
  let m = 0; for (let l = -lag; l <= lag; l += 2) { let s = 0; for (let i = Math.max(0, -l); i < n && i + l < n; i++) s += A[i] * B[i + l]; m = Math.max(m, Math.abs(s)); }
  return m / Math.sqrt(ea * eb + 1e-12);
}
if (process.argv[1].endsWith('audio_bank.mjs')) {
  console.log('name'.padEnd(20), 'dur', ' peak', '   dc', '  rmsdB', 'crest', '  ms', 'simil');
  for (const [kind, tag, o, sr0] of jobs) {
    const name = kind + (tag ? '_' + tag : ''); if (only && !name.includes(only)) continue;
    const sr = sr0 || SR, takes = [];
    for (let s = 1; s <= 3; s++) {
      const t0 = performance.now(), r = L.make(kind, s * 101, sr, o), ms = performance.now() - t0;
      const y = r.ch[0]; let pk = 0, dc = 0, e = 0; for (const c of r.ch) for (let i = 0; i < c.length; i++) { pk = Math.max(pk, Math.abs(c[i])); dc += c[i]; e += c[i] * c[i]; }
      const N = y.length * r.ch.length, rms = Math.sqrt(e / N);
      takes.push(y); wav(`${dir}/${name}_${s}.wav`, r.sr, r.ch);
      const sim = s > 1 ? xcorr(takes[s - 2], y).toFixed(2) : '';
      console.log(`${name}_${s}`.padEnd(20), (y.length / r.sr).toFixed(2), pk.toFixed(2).padStart(5), (dc / N).toExponential(0).padStart(6), (20 * Math.log10(rms)).toFixed(1).padStart(7), (pk / rms).toFixed(1).padStart(5), ms.toFixed(0).padStart(5), sim);
    }
  }
}
