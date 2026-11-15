// Browser entry for test/crash_audio.py: each crash sound (audio.contact) alone through the real Audio graph, offline.
import { Audio } from '../src/view/audio.js';
import { makeTerrain } from '../src/terrain.js';
window.renderHit = async (o) => {
  const SR = 48000, D = 2.5, T = makeTerrain(7), ctx = new OfflineAudioContext(2, SR * D, SR);
  const audio = new Audio({ low: false, clipBase: o.noClips ? 'nothere/' : 'audio/', clipTimeout: 800 });
  let seed = 12345; audio.R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const at = { containers: [-24.7, 70], barn: [30, 62.6], gate: [-7, 91] }[o.where], dist = o.dist || 12;
  const cam = { position: { x: at[0] + dist, y: T.height(at[0] + dist, at[1]) + 1.7, z: at[1] }, quaternion: { x: 0, y: 0, z: 0, w: 1 } };
  const sim = { head: { pos: { x: at[0], y: T.height(at[0], at[1]) + 3, z: at[1] } }, v: 0, breathPhase: 0, exertion: 0, act: null, feet: [] };
  audio.attach({ camera: cam, sim, mind: { beh: { name: 'roam' } }, terrain: T, world: { moodKey: 'day', mood: { wet: 0 } }, tier: 'high' });
  audio.resume(ctx); audio.setRain(0); audio.breathL = { nb: ctx.createBiquadFilter(), gn: ctx.createGain(), gc: ctx.createGain() };
  await audio.ready();
  ctx.suspend(0.5).then(() => { audio.contact({ type: 'contact', part: o.part, surface: 'wall', force: o.force, x: at[0], y: sim.head.pos.y, z: at[1] }, dist); ctx.resume(); });
  for (let i = 1; i * 0.05 < D - 0.1; i++) if (Math.abs(i * 0.05 - 0.5) > 1e-6) ctx.suspend(i * 0.05).then(() => { try { audio._frame && audio._frame(); } catch {} ctx.resume(); });
  const buf = await ctx.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1), m = new Float32Array(L.length); for (let i = 0; i < L.length; i++) m[i] = 0.5 * (L[i] + R[i]);
  let s = ''; const u8 = new Uint8Array(m.buffer); for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s);
};
