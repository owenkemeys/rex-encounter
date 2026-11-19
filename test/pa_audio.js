// Browser entry for test/pa_audio.py: the death card's PA chime (as on the card: camera microphone on and held silent), a saved clip's tape load and the chime in a clip (through the clip tap), offline.
import { Audio } from '../src/view/audio.js';
import { makeTerrain } from '../src/terrain.js';
window.renderPA = async (o) => {
  const SR = 48000, tap = o.what !== 'chime', D = o.what === 'tape' ? 1.6 : 4, T = makeTerrain(7), ctx = new OfflineAudioContext(2, SR * D, SR);
  const audio = new Audio({ low: false, clipBase: 'nothere/', clipTimeout: 300 });
  const cam = { position: { x: 0, y: T.height(0, 0) + 1.7, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } };
  const sim = { head: { pos: { x: 30, y: T.height(30, 0) + 3, z: 0 } }, v: 0, breathPhase: 0, exertion: 0, act: null, feet: [] };
  audio.attach({ camera: cam, sim, mind: { beh: { name: 'roam' } }, terrain: T, world: { moodKey: 'day', mood: { wet: 0 } }, tier: 'high' });
  if (tap) { const mk = ctx.createGain.bind(ctx); ctx.createMediaStreamDestination = () => { const g = mk(); g.stream = null; return g; }; }
  audio.resume(ctx); audio.setRain(0); audio.breathL = { nb: ctx.createBiquadFilter(), gn: ctx.createGain(), gc: ctx.createGain() };
  if (o.off) { audio.on = false; audio._applyVol(); }
  await audio.ready(); await audio.tapeIn;
  if (tap) { audio.out.disconnect(); audio._clipTap().dest.connect(ctx.destination); }
  ctx.suspend(0.2).then(() => { if (o.what === 'tape') audio.tapeLoad(); else if (tap) { audio.mic(true, true); if (o.what === 'both') audio.tapeLoad(); audio.chime(false, true, 0.5); } else { audio.mic(true, true); audio.chime(); if (o.twice) audio.chime(); } ctx.resume(); });
  if (o.stopAt) ctx.suspend(o.stopAt).then(() => { audio.restart(); ctx.resume(); });
  const buf = await ctx.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1), m = new Float32Array(L.length); for (let i = 0; i < L.length; i++) m[i] = 0.5 * (L[i] + R[i]);
  let s = ''; const u8 = new Uint8Array(m.buffer); for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s);
};
