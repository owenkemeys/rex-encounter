// Browser entry for test/audio_feet.py: the animal's footfalls (walking and running, near and far) and your own steps on each
// surface, rendered through the real Audio graph in an OfflineAudioContext, with a huff and a roar for reference. Segments are
// 5 s each; the page returns the stereo mix and the segment table.
import { Audio } from '../src/view/audio.js';
import { makeTerrain } from '../src/terrain.js';
window.renderFeet = async (opts = {}) => {
  const SR = 48000;
  const T = makeTerrain(7); T.surfaceAt = () => 'grass'; T.coverAt = () => 0; if (T.wetAt) T.wetAt = () => 0;
  const segs = [
    ['quiet (bed)', 'none', 0], ['rex walk 8 m', 'walk', 8], ['rex walk 15 m', 'walk', 15], ['rex walk 30 m', 'walk', 30],
    ['rex run 6 m', 'run', 6], ['rex run 12 m', 'run', 12], ['rex run 16 m', 'run', 16], ['rex run 30 m', 'run', 30],
    ['huff 12 m', 'huff', 12], ['roar 25 m', 'roar', 25],
    ['you walk grass', 'you', 'grass', 0.22], ['you run grass', 'you', 'grass', 0.55], ['you run forest', 'you', 'forest', 0.55], ['you run track', 'you', 'track', 0.55],
    ['you run wood', 'you', 'wood', 0.55], ['you run rock', 'you', 'rock', 0.55], ['you run mud', 'you', 'mud', 0.55], ['you run marsh', 'you', 'marsh', 0.55],
  ];
  const SEG = 5, D = SEG * segs.length + 1, ctx = new OfflineAudioContext(2, SR * D, SR);
  const audio = new Audio({ low: false, clipBase: 'audio/', clipTimeout: 800 });
  let seed = 4242; audio.R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const L = { x: 0, z: 0 }, gy0 = T.height(0, 0);
  const cam = { position: { x: 0, y: gy0 + 1.7, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } };
  const sim = { head: { pos: { x: 2000, y: 4, z: 2000 } }, v: 0, breathPhase: 0, exertion: 0, act: null, feet: [] };
  const mind = { beh: { name: 'roam' } }, world = { moodKey: opts.mood || 'day', mood: { wet: opts.rain ? 1 : 0 } };
  audio.attach({ camera: cam, sim, mind, terrain: T, world, tier: 'high' });
  audio.resume(ctx); audio.setRain(opts.rain ?? 0);
  await audio.ready();
  const step = 1 / 60, out = segs.map((s, i) => ({ name: s[0], a: 0.5 + i * SEG, b: 0.5 + (i + 1) * SEG - 0.3 })), calls = [];
  let next = 0, foot = 0;
  for (let i = 1; i * step < D - 0.1; i++) {
    const t = i * step;
    ctx.suspend(t).then(() => {
      const k = Math.floor((t - 0.5) / SEG), s = segs[k], u = t - 0.5 - k * SEG;
      sim.head.pos = { x: 2000, y: 4, z: 2000 }; sim.v = 0;
      if (s && (s[1] === 'huff' || s[1] === 'roar') && u > 0.3) sim.head.pos = { x: s[2], y: gy0 + 4.2, z: 0 };
      if (s && u > 0.3 && u < SEG - 0.6) {
        const [, kind, A, g] = s;
        if (kind === 'walk' || kind === 'run') {
          const run = kind === 'run', v = run ? 8 : 3; sim.v = v; sim.exertion = run ? 0.6 : 0.1;
          if (t >= next) { next = t + (run ? 0.45 : 0.85); foot ^= 1; const x = A, z = foot ? 0.6 : -0.6; audio.src = { x, y: T.height(x, z), z, foot }; const d = Math.hypot(x, audio.src.y - cam.position.y, z); const I = 0.42 + 0.075 * v; audio.thump(I, d); calls.push([t, kind, A, +I.toFixed(2)]); }
        } else if (kind === 'huff' || kind === 'roar') {
          sim.head.pos = { x: A, y: gy0 + 4.2, z: 0 };      // (the head emitter follows the head every frame: it stays there for the segment)
          if (!s.done) { s.done = true; audio.src = { ...sim.head.pos }; audio[kind](Math.hypot(A, 2.5)); calls.push([t, kind, A]); }
        } else if (kind === 'you') { if (t >= next) { next = t + (g > 0.4 ? 0.36 : 0.55); audio.step(g, A); calls.push([t, 'you', A, g]); } }
      }
      audio.breath(0, 0);
      ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  const Lc = buf.getChannelData(0), Rc = buf.getChannelData(1), pcm = new Int16Array(Lc.length * 2);
  for (let i = 0; i < Lc.length; i++) { pcm[2 * i] = Math.max(-32767, Math.min(32767, Lc[i] * 32767)); pcm[2 * i + 1] = Math.max(-32767, Math.min(32767, Rc[i] * 32767)); }
  const bytes = new Uint8Array(pcm.buffer); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { b64: btoa(s), sr: SR, segs: out, calls, clipState: audio.clipState };
};
window.__ready = true;
