// Offline check of the hybrid voices (src/view/audiohybrid.js): loads dist/audio/*.mp3 through ffmpeg, renders takes of each
// recipe to out/audio_h/*.wav next to the synthesised voice it replaces, and prints duration, peak, loudness, time.
//   node test/audio_hybrid.mjs            render + metrics         node test/audio_hybrid.mjs --level   print the synth voices' loudness (for LEVEL)
import { synthLib } from '../src/view/audiosynth.js';
import { hybridLib } from '../src/view/audiohybrid.js';
import { wav } from './audio_bank.mjs';
import { execFileSync } from 'child_process';
import fs from 'fs';
const SR = +(process.env.SR || 32000), dir = 'out/audio_h', ad = process.env.AUDIO || 'dist/audio';
export function loadClips(H, base = ad, sr = SR) {
  const man = JSON.parse(fs.readFileSync(`${base}/manifest.json`));
  for (const [n, c] of Object.entries(man.clips)) { const b = execFileSync('ffmpeg', ['-v', 'error', '-i', `${base}/${c.f}`, '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 }); const u = new Uint8Array(b).slice().buffer; H.setClip(n, sr, new Float32Array(u)); }
  return man;
}
const L = synthLib(), H = hybridLib(L);
const VOICES = [['roar', 'roar', {}], ['growl', 'growl', {}], ['rumble', 'rumble', {}], ['huff', 'huff', {}], ['snort', 'huff', { short: true }], ['sniff', 'sniff', {}], ['clack', 'clack', {}], ['crunch', 'crunch', {}], ['tear', 'tear', {}], ['gulp', 'gulp', {}], ['chew', 'crunch', {}], ['smack', 'impact', { kind: 'smack' }], ['thud', 'impact', { kind: 'thud', wet: 1 }], ['foot_walk', 'footfall', { wet: 1, run: 0 }], ['foot_run', 'footfall', { wet: 1, run: 1 }], ['shout', 'shout', {}]];
const stat = (y) => { let pk = 0, e = 0; for (const v of y) { pk = Math.max(pk, Math.abs(v)); e += v * v; } return { pk, rms: 10 * Math.log10(e / y.length + 1e-12) }; };
if (process.argv[1].endsWith('audio_hybrid.mjs')) {
  loadClips(H);
  if (process.argv.includes('--level')) {
    const o = {}; for (const [k, kind, op] of VOICES) { const ls = []; for (let s = 1; s <= 8; s++) ls.push(H.level(L.make(kind, s * 101, SR, op).ch[0])); o[k] = +(ls.reduce((a, b) => a + b) / ls.length).toFixed(3); } console.log(JSON.stringify(o));
  } else {
    fs.mkdirSync(dir, { recursive: true });
    console.log('voice'.padEnd(10), ' dur  peak  rmsdB  level  ms   | synth: dur peak level');
    for (const [k, kind, op] of VOICES) for (let s = 1; s <= 3; s++) {
      const t0 = performance.now(), r = H.make(k.startsWith('foot') ? 'footfall' : kind === 'impact' ? k : k === 'chew' ? 'chew' : kind, s * 131 + 31, SR, { name: kind, ...op }), ms = performance.now() - t0, y = r.ch[0], st = stat(y);
      const sy = L.make(kind, s * 101, SR, op).ch[0], ss = stat(sy); wav(`${dir}/${k}_h${s}.wav`, r.sr, r.ch); wav(`${dir}/${k}_s${s}.wav`, SR, [sy]);
      console.log(`${k}_${s}`.padEnd(10), (y.length / r.sr).toFixed(2), st.pk.toFixed(2), st.rms.toFixed(1).padStart(6), H.level(y).toFixed(3), ms.toFixed(0).padStart(4), '  |', (sy.length / SR).toFixed(2), ss.pk.toFixed(2), H.level(sy).toFixed(3));
    }
  }
}
