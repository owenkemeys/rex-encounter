// Browser entry for test/jaw_audio.py: one mouth sound through the real Audio graph, offline, stepping the jaw follower every 10 ms
// (suspend/resume, as crash_audio / bite_audio step their graph). Returns the follower's samples and the rendered output.
import { Audio } from '../src/view/audio.js';
import { jawFromVoice } from '../src/rex/skin/jawvoice.js';
import { makeTerrain } from '../src/terrain.js';
window.renderJaw = async (o) => {
  const SR = 48000, D = o.dur || 3.5, T0 = 0.5, T = makeTerrain(7), ctx = new OfflineAudioContext(2, SR * D, SR), dist = o.dist || 6;
  const audio = new Audio({ low: false, clipBase: 'audio/', clipTimeout: 800 });
  let seed = o.seed || 12345; audio.R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const at = [30, 62.6], cam = { position: { x: at[0] + dist, y: T.height(at[0] + dist, at[1]) + 1.7, z: at[1] }, quaternion: { x: 0, y: 0, z: 0, w: 1 } };
  const sim = { head: { pos: { x: at[0], y: T.height(at[0], at[1]) + 3, z: at[1] } }, v: 0, breathPhase: 0, exertion: 0, act: null, feet: [] };
  audio.attach({ camera: cam, sim, mind: { beh: { name: 'roam' } }, terrain: T, world: { moodKey: 'day', mood: { wet: 0 } }, tier: 'high' });
  audio.resume(ctx); audio.setRain(0); audio.breathL = { nb: ctx.createBiquadFilter(), gn: ctx.createGain(), gc: ctx.createGain() };
  await audio.ready();
  const rec = { t: [], m: [], f: [], n: [], dl: [], dh: [], br: [], jaw: [] }, step = () => { audio._mouthStep(); rec.t.push(ctx.currentTime); rec.m.push(audio.mouthOpen); rec.f.push(audio.mouthFast); rec.n.push(audio.noseOpen); rec.dl.push(audio._M.dbL); rec.dh.push(audio._M.dbH); rec.br.push(audio._M.bright); rec.jaw.push(jawFromVoice(audio.mouthOpen, audio.mouthFast - audio.mouthOpen)); };
  const play = { shout: () => audio._voice('shout', dist, 0.6, 1, 0, 2), roar: () => audio.roar(dist), growl: () => audio.growl(dist), huff: () => audio.huff(dist), clack: () => audio.clack(dist, 0.8), rumble: () => audio._voice('rumble', dist, 0.45, 1, 0, 2), snort: () => audio._voice('snort', dist, 0.8, 1, 0, 1), sniff: () => audio._voice('sniff', dist, 0.7, 1, 0, 1), scream: () => audio.scream(), crunch: () => audio.crunch(dist), gulp: () => audio._voice('gulp', dist, 0.6, 1, 0, 1) }[o.name];
  ctx.suspend(T0).then(() => { play(); step(); ctx.resume(); });
  for (let i = 1; i * 0.01 < D - 0.05; i++) { const t = i * 0.01; if (Math.abs(t - T0) < 0.006) continue; ctx.suspend(t).then(() => { step(); ctx.resume(); }); }
  const buf = await ctx.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1), m = new Float32Array(L.length); for (let i = 0; i < L.length; i++) m[i] = 0.5 * (L[i] + R[i]);
  let s = ''; const u8 = new Uint8Array(m.buffer); for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
  return { rec, wav: btoa(s), start: T0 };
};
