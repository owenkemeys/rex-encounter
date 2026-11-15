// The animal's sounds in Saltline, through Saltline's own AudioContext (G.audio.ctx, so its master volume, pause and the
// browser's gesture unlock all apply). Levels follow Dino Hunter's current mix (rex_rc/src/view/audio.js): the everyday voice
// (breath, rumbles, huffs, growls, footfalls, even a display roar) is kept low; full level is kept for the kill.
// Footfalls are synthesised as in Dino Hunter after its 14 Nov fixes: a low body thump (a decaying sine) and the ground's dull
// lowpassed thud, toes settling after the heel, a quiet wet slap on Saltline's wet concrete; NO crunch layer (the `crimp_`
// impacts read as metal banging on every step and were removed in our game). Idle rumbles are quiet, rare, and only from an
// animal that is close and in front of you (our game's fix: a loud rumble from far off and out of frame is an unexplained noise).
// Clips are the page's own files (audio/*.mp3); missing clips are skipped silently.
const CLIPS = { roar: ['creat_roar_05', 'lion_a'], growl: ['creat_grunt_01', 'creat_grunt_04'], huff: ['creat_nose'], breath: ['creat_breath', 'creat_breath_2'],
  rumble: ['creat_grunt_04'], snap: ['bone_2', 'bone_4'], kill: ['monster_roar'], wet: ['squish_1', 'squish_3', 'squish_5'] };
export const AUDIO_FILES = [...new Set(Object.values(CLIPS).flat())];
export class RexAudio {
  constructor(ctx, camera) {
    this.ctx = ctx && ctx.createGain ? ctx : null; this.camera = camera; this.buf = new Map(); this.breathT = 2; this.rumbleNext = 12; this.t = 0; this.lastVocal = -9;
    if (!this.ctx) return;
    this.out = this.ctx.createGain(); this.out.gain.value = 0.85;
    // a gentle glue on its own bus, so a roar over Saltline's gunfire does not clip
    const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    this.out.connect(comp); comp.connect(this.ctx.destination);
    this.noise = this.ctx.createBuffer(1, Math.round(this.ctx.sampleRate * 0.5), this.ctx.sampleRate);
    { const y = this.noise.getChannelData(0); let s = 7; for (let i = 0; i < y.length; i++) { s = (s * 16807) % 2147483647; y[i] = s / 1073741823.5 - 1; } }
    for (const n of AUDIO_FILES) fetch(`audio/${n}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : null)).then((ab) => ab && this.ctx.decodeAudioData(ab)).then((b) => b && this.buf.set(n, b)).catch(() => {});
  }
  _ok() { return this.ctx && this.ctx.state === 'running'; }
  _pan(x, y, z, ref = 6) {
    const p = this.ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = 1.1; p.maxDistance = 200;
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
    p.connect(this.out); return p;
  }
  _dist(x, y, z) { const c = this.camera.position; return Math.hypot(x - c.x, y - c.y, z - c.z); }
  clip(kind, x, y, z, gain = 1, rate = 1) {
    if (!this._ok()) return; const list = CLIPS[kind]; const b = this.buf.get(list[Math.floor(Math.random() * list.length)]); if (!b) return;
    if (this._dist(x, y, z) > 140) return;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate * (0.95 + 0.1 * Math.random());
    const g = this.ctx.createGain(); g.gain.value = gain; s.connect(g); g.connect(this._pan(x, y, z)); s.start();
  }
  _burst(dest, t0, len, type, f, q, gain, att) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + att); g.gain.exponentialRampToValueAtTime(0.0008, t0 + len);
    s.connect(fl); fl.connect(g); g.connect(dest); s.start(t0, Math.random() * 0.3); s.stop(t0 + len + 0.05);
  }
  /** One footfall (intensity ~0.5-1.5): body thump, ground thud, toes settling, a quiet wet slap. No crunch. */
  step(x, y, z, k = 1, wet = 0.8) {
    if (!this._ok()) return; const d = this._dist(x, y, z); if (d > 110) return;
    const c = this.ctx, t0 = c.currentTime + Math.min(0.3, d / 343), dest = this._pan(x, y, z, 9), th = Math.min(1.4, 0.55 + 0.45 * k);
    const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(62, t0); o.frequency.exponentialRampToValueAtTime(34, t0 + 0.32);
    og.gain.setValueAtTime(0, t0); og.gain.linearRampToValueAtTime(0.9 * th, t0 + 0.012); og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.42);
    o.connect(og); og.connect(dest); o.start(t0); o.stop(t0 + 0.45);
    this._burst(dest, t0, 0.09, 'lowpass', 280 + Math.random() * 90, 0.7, 0.5 * th, 0.003);       // the ground's dull thud
    this._burst(dest, t0 + 0.06 + Math.random() * 0.03, 0.06, 'lowpass', 180, 0.7, 0.18 * th, 0.003);      // toes settle after the heel
    if (d < 30 && wet > 0.3) {       // wet concrete: a short slap, quiet, close by only
      const b = this.buf.get(CLIPS.wet[Math.floor(Math.random() * CLIPS.wet.length)]);
      if (b) { const s = c.createBufferSource(); s.buffer = b; s.playbackRate.value = 0.8 + 0.15 * Math.random(); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; const g = c.createGain(); g.gain.value = 0.22 * wet * (1 - d / 30); s.connect(lp); lp.connect(g); g.connect(dest); s.start(t0 + 0.01); s.stop(t0 + 0.3); }
      else this._burst(dest, t0 + 0.01, 0.12, 'bandpass', 850, 1.4, 0.12 * wet, 0.008);
    }
  }
  /** Events from the arena (src sim / mind / arena), as Dino Hunter's view maps them. */
  event(e, sim, ctx = {}) {
    const h = sim.head.pos;
    if (e.src === 'sim' && e.type === 'footfall') { this.step(e.x, e.y ?? 0, e.z, e.intensity ?? 1, ctx.wet ?? 0.8); if (--this.breathT <= 0) { this.breathT = 4 + Math.random() * 4; if (this._dist(h.x, h.y, h.z) < 25) this.clip('breath', h.x, h.y, h.z, 0.28, 0.55); } }
    else if (e.src === 'sim' && e.type === 'roar') { this.clip('roar', h.x, h.y, h.z, 0.42, 0.62); this.lastVocal = this.t; }
    else if (e.src === 'sim' && e.type === 'growl') { this.clip('growl', h.x, h.y, h.z, 0.36, 0.5); this.lastVocal = this.t; }
    else if (e.src === 'sim' && e.type === 'huff') { this.clip('huff', h.x, h.y, h.z, 0.5, 0.6); this.lastVocal = this.t; }
    else if (e.src === 'sim' && (e.type === 'snap' || e.type === 'clack')) this.clip('snap', h.x, h.y, h.z, 0.55, 0.7);
    else if (e.src === 'sim' && e.type === 'rumble') this._rumble(sim, ctx, true);
    else if (e.src === 'sim' && e.type === 'settle') this.step(e.x, e.y ?? 0, e.z, 1.4, ctx.wet ?? 0.8);
  }
  _rumble(sim, ctx, asked) {
    const h = sim.head.pos, c = this.camera, d = this._dist(h.x, h.y, h.z);
    const f = { x: 0, z: -1 }; if (c.getWorldDirection) { const v = c.getWorldDirection(new c.position.constructor()); f.x = v.x; f.z = v.z; }
    const front = ((h.x - c.position.x) * f.x + (h.z - c.position.z) * f.z) / (d || 1) > 0.3;
    if (d < 40 && front && this.t - this.lastVocal > 6) { this.clip('rumble', h.x, h.y, h.z, asked ? 0.26 : 0.18, 0.42); this.lastVocal = this.t; }
  }
  /** Per frame: the rare idle rumble of a watching animal (close, in front of you, tense for a while). */
  frame(dt, sim, ctx = {}) {
    this.t += dt; if (!ctx.tense) { this.rumbleNext = Math.max(this.rumbleNext, 8); return; }
    this.rumbleNext -= dt; if (this.rumbleNext <= 0) { this.rumbleNext = 16 + Math.random() * 20; this._rumble(sim, ctx, false); }
  }
  /** The kill: the one sound at full level. */
  kill(sim) { const h = sim.head.pos; this.clip('kill', h.x, h.y, h.z, 1.4, 0.75); this.clip('roar', h.x, h.y, h.z, 1.0, 0.9); this.lastVocal = this.t; }
}
