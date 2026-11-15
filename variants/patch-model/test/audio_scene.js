// Browser entry for test/audio_scene.py: renders a scripted encounter through the real Audio graph in an
// OfflineAudioContext (panners, convolvers, compressor and all) and hands back the stereo mix and markers.
import { Audio } from '../src/view/audio.js';
import { makeTerrain } from '../src/terrain.js';

window.renderScene = async (opts = {}) => {
  const SR = 48000, D = opts.secs || 62, tier = opts.tier || 'high';
  const T = makeTerrain(7), shed = T.structures.find((s) => s.kind === 'shed');
  const ctx = new OfflineAudioContext(2, SR * D, SR);
  const audio = new Audio({ low: tier === 'low', clipBase: opts.noClips ? 'nothere/' : 'audio/', clipTimeout: 800 });
  let seed = 12345; audio.R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const out = { x: shed.cx + 16, z: shed.cz + 4 }, inn = { x: shed.cx, z: shed.cz };
  const cam = { position: { x: out.x, y: T.height(out.x, out.z) + 1.7, z: out.z }, quaternion: { x: 0, y: 0, z: 0, w: 1 } };
  const sim = { head: { pos: { x: 0, y: 0, z: 0 } }, v: 0, breathPhase: 0, exertion: 0, act: null, feet: [] };
  const mind = { beh: { name: 'roam' } }, world = { moodKey: opts.mood || 'storm', mood: { wet: 1 } };
  audio.attach({ camera: cam, sim, mind, terrain: T, world, tier });
  audio.resume(ctx); audio.setRain(opts.rain ?? 1); if (opts.wet !== undefined) audio.wet = opts.wet; if (opts.noBreath) audio.breathL = { nb: ctx.createBiquadFilter(), gn: ctx.createGain(), gc: ctx.createGain() };
  const t0 = performance.now(); await audio.ready(); const genMs = performance.now() - t0;
  // the animal: far away until 10 s, then walks in from 70 m to 8 m by 30 s; listener goes into the shed at 32 s
  const rexAt = (t) => {
    if (t < 10) return { x: out.x + 200, z: out.z + 60, v: 0 };
    if (t < 30) { const u = (t - 10) / 20, d = 70 - 62 * u; return { x: out.x + d, z: out.z + 3, v: 3.1 }; }
    if (t < 45) { const a = (t - 30) * 0.15; return { x: shed.cx + Math.cos(a) * 13, z: shed.cz + Math.sin(a) * 13, v: 2.0 }; }
    return { x: out.x + 10, z: out.z - 2, v: 0 };
  };
  const ev = [
    [14, 'thunder', 1.0], [18, 'huff'], [22, 'growl'], [26, 'roar'], [29, 'clack'], [33.5, 'thunder', 3.0], [38, 'roar'], [41, 'growl'],
    [46.5, 'act', 'sniffAir'], [49, 'crunch'], [50.5, 'tear'], [52, 'act', 'gulp'], [53, 'step'], [53.6, 'step'], [54.2, 'rustle'], [55, 'shout'], [56, 'stone'], [57, 'huff'],
  ];
  const marks = []; let foot = 0, nextStep = 10, frameMs = 0, frames = 0, maxFrame = 0;
  const step = 1 / 30;
  for (let i = 1; i * step < D - 0.1; i++) {
    const t = i * step;
    ctx.suspend(t).then(() => {
      const inside = t >= 32 && t < 45, L = inside ? inn : out; cam.position.x = L.x; cam.position.z = L.z; cam.position.y = (inside ? shed.base : T.height(L.x, L.z)) + 1.7;
      const r = rexAt(t), gy = T.height(r.x, r.z); sim.v = r.v; sim.head.pos = { x: r.x - 1, y: gy + 4.2, z: r.z };
      sim.breathPhase = (t / 3.2) % 1; sim.exertion = r.v > 2.5 ? 0.4 : 0.1;
      mind.beh.name = opts.beh || (t > 45 ? 'feed' : t > 30 ? 'besiege' : 'stalk');
      // footfalls at the gait's rate
      if (!opts.noFoot && r.v > 0 && t >= nextStep) { nextStep = t + 0.85; foot ^= 1; audio.src = { x: r.x + (foot ? 0.6 : -0.6), y: gy, z: r.z, foot }; const d = Math.hypot(audio.src.x - cam.position.x, audio.src.y - cam.position.y, audio.src.z - cam.position.z); audio.thump(0.42 + 0.075 * r.v, d); }
      for (const e of ev) if (!opts.noEv && !e.done && t >= e[0]) {
        e.done = true; marks.push([t, e[1]]);
        const h = sim.head.pos, d = Math.hypot(h.x - cam.position.x, h.y - cam.position.y, h.z - cam.position.z); audio.src = { ...h };
        if (e[1] === 'thunder') audio.thunder(e[2]); else if (e[1] === 'act') sim.act = { kind: e[2] };
        else if (e[1] === 'step') audio.step(0.08); else if (e[1] === 'rustle') audio.rustle(0.14); else if (e[1] === 'shout') audio.ping();
        else if (e[1] === 'stone') { audio.src = { x: cam.position.x + 12, y: cam.position.y - 1.7, z: cam.position.z + 5 }; audio.stoneHit(13); }
        else audio[e[1]](d);
      }
      const a = performance.now(); audio.breath(0, 0); const ms = performance.now() - a; frameMs += ms; frames++; maxFrame = Math.max(maxFrame, ms); if (ms > 4) console.log('slow frame', t.toFixed(2), ms.toFixed(1));
      if (Math.abs(t - 35) < 0.02 || Math.abs(t - 20) < 0.02) console.log('t', t.toFixed(1), 'occ', audio.st.occ.toFixed(2), 'inside', audio.st.inside && audio.st.inside.kind, 'roofed', audio.st.roofed, 'cam', JSON.stringify(cam.position), 'head', JSON.stringify(sim.head.pos));
      ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1), pcm = new Int16Array(L.length * 2);
  let clip = 0; for (let i = 0; i < L.length; i++) { const l = L[i], r = R[i]; if (Math.abs(l) >= 1 || Math.abs(r) >= 1) clip++; pcm[2 * i] = Math.max(-32767, Math.min(32767, l * 32767)); pcm[2 * i + 1] = Math.max(-32767, Math.min(32767, r * 32767)); }
  const bytes = new Uint8Array(pcm.buffer); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  const bk = {}; for (const k in audio.bank) bk[k] = audio.bank[k].length + (audio.bank[k].hybrid ? 'h' : 's');
  return { b64: btoa(s), sr: SR, marks, clip, genMs, tReady: audio.tReady, clipState: audio.clipState, clipFails: audio.clipFails, bank: bk, genLog: audio.genLog, genErr: audio.genErr, frameMsAvg: frameMs / frames, frameMsMax: maxFrame, voices: audio.voices };
};
window.__ready = true;
