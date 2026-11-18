// All sound, synthesised. src/view/audiosynth.js builds every sound as samples (in a Worker, off the main thread);
// this file plays them through a Web Audio graph: per-source 3D panners (HRTF on the high tier) at the sources' real
// positions, distance and occlusion filtering (walls, roofs, rock and hills between you and it; you being inside),
// convolution reverb from generated impulse responses (open forest outside, small concrete room inside), and a
// glue compressor and limiter on the master. Ambience (rain on several surfaces, wind gusts, ferns, birds, distant
// thunder) runs as looping beds and scheduled one-shots. Buses: ambience, creature, effects; each has a volume slider.
//
// Wiring from main.js: audio.attach({ camera, sim, mind, terrain, world, tier }) once; audio.src = e for each arena
// event before calling a method (its x, y, z place the sound); audio.breath(level, dist) once a frame drives the
// per-frame update. The older method names (thump, roar, huff, growl, clack, ...) keep their signatures.
import { synthLib } from './audiosynth.js';
import { hybridLib, HYB_NEEDS } from './audiohybrid.js';
import { tune, tuneGroup } from './tune.js';      // tune

const TENSE = new Set(['stalk', 'stare', 'watch', 'display', 'circle', 'besiege', 'inspect', 'bluff', 'ambush', 'hunt']);
const SNIFFY = new Set(['sniff', 'trail', 'investigate', 'search', 'revisit', 'inspect']);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };

/** What to synthesise: key, generator, options, takes on the high tier, takes on the low tier, sample rate (0 = default). */
function bankList(low) {
  const T = low ? 12000 : 16000;
  return [
    ['rain_wash', 'rain', { kind: 'wash', len: low ? 4 : 6.1 }, 1, 1], ['rain_leaf', 'rain', { kind: 'leaf', len: low ? 4.4 : 7.3 }, 1, 1], ['rain_ground', 'rain', { kind: 'ground', len: low ? 5.1 : 8.9 }, 1, 1],
    ['rain_roof', 'rain', { kind: 'roof', len: low ? 3.7 : 6.7 }, 1, 1], ['rain_hard', 'rain', { kind: 'hard', len: 5.7 }, 1, 0],
    ['bed_pink', 'bed', { kind: 'pink', len: 4.3 }, 1, 1], ['bed_leaves', 'bed', { kind: 'leaves', len: 5.3 }, 1, 1], ['bed_hiss', 'bed', { kind: 'hiss', len: 3.1 }, 1, 1],
    ['huff', 'huff', {}, 4, 2], ['growl', 'growl', {}, 4, 2], ['clack', 'clack', {}, 4, 2], ['roar', 'roar', {}, 5, 3],
    ['step_wet', 'step', { wet: 1 }, 5, 3], ['step_dry', 'step', { wet: 0 }, 4, 2], ['rustle', 'rustle', {}, 4, 2], ['rustle_wet', 'rustle', { wet: 1 }, 3, 2],
    ['sniff', 'sniff', {}, 4, 2], ['snort', 'huff', { short: true }, 3, 1], ['rumble', 'rumble', {}, 3, 2], ['crunch', 'crunch', {}, 4, 2], ['tear', 'tear', {}, 3, 2], ['gulp', 'gulp', {}, 2, 1], ['chew', 'crunch', {}, 3, 2], ['whoosh', 'whoosh', {}, 3, 1],
    ['smack', 'impact', { kind: 'smack' }, 3, 2], ['thud', 'impact', { kind: 'thud', wet: 1 }, 3, 2],
    ['shout', 'shout', {}, 3, 2], ['ignite', 'ignite', {}, 2, 1], ['alarm', 'alarm', {}, 3, 2], ['flurry', 'flurry', {}, 3, 2], ['bird', 'bird', {}, 10, 5],
    ['thunder_near', 'thunder', { dist: 350 }, 2, 1, T], ['thunder_mid', 'thunder', { dist: 900 }, 2, 1, T], ['thunder_far', 'thunder', { dist: 3000 }, 3, 1, T],
  ];
}
/** Voices that are built from recordings (audiohybrid.js) when the files in audio/ are there, else synthesised: key -> [recipe, options]. */
const HYBRID = { roar: ['roar', {}], growl: ['growl', {}], rumble: ['rumble', {}], huff: ['huff', {}], snort: ['huff', { short: true }], sniff: ['sniff', {}], clack: ['clack', {}], crunch: ['crunch', {}], shout: ['shout', {}],
  tear: ['tear', {}], gulp: ['gulp', {}], chew: ['chew', {}], smack: ['smack', {}], thud: ['thud', {}] };
/** What the first seconds need, in order: the storm bed and the first steps; then the voices and the rest of the first takes; extra takes last. */
const TIER = {
  rain_wash: 0, bed_pink: 0, rain_ground: 0, rain_leaf: 0, step_wet: 0, step_dry: 0, bed_leaves: 0, rustle: 0, rustle_wet: 0,
  rain_roof: 1, bed_hiss: 1, bird: 1, thunder_far: 3, thunder_mid: 3, thunder_near: 3, huff: 1, growl: 1, roar: 2, clack: 1, sniff: 1, rumble: 2, snort: 1, thud: 1, shout: 2, smack: 2, tear: 2, gulp: 2, chew: 2,
};

/** Mouth sounds (the animal's voice, breath, sniffs, huffs, the scream) reach the speakers this long after the analyser that drives the jaw hears them,
 *  so the jaw leads the sound by it (owner: "precede the actual audio by a fraction"). 50 to 90 ms; one named place. */
export const MOUTH_LEAD = 0.09;
/** Jaw follower (see _mouthStep): attack / release time constants (s); the high band (450 Hz to 3.5 kHz) level in dBFS at the mouth emitters' inputs that is silence and that is a full gape, raised to `pow`; the brightness (high band's share of high + low energy) that starts and finishes counting; the low-band (80 to 400 Hz) range for the flutter; the hiss-band range for the nose. */
const MOUTH = { lead: MOUTH_LEAD, atk: 0.04, rel: 0.18, fast: 0.006, slow: 0.04, hiFloorDb: -40, hiFullDb: -20, pow: 2.0, t0: -8.5, t1: -5.5, air: 0.95, a0: -4, a1: 0, loFloorDb: -50, loFullDb: -15, noseFloorDb: -50, noseFullDb: -30 };
/** The band edges (Hz) the jaw follower listens through, the sound trims (1 = as built; the voices carry their own level), and the nodes they steer (tuning panel). */
const BANDS = { loHp: 80, loLp: 400, hiHp: 450, hiLp: 3500, noseHp: 2500 }, BANDF = {}, DLS = [], EMTRIM = {};
const SND = { roar: 0.42, growl: 0.36, huff: 0.32, crunch: 0.8, tear: 0.75, scream: 1, feet: 1, crash: 1, clack: 1, breath: 1 };
{ // tune: jaw-from-voice and the sound levels, all read live (band edges and the lead retune the running nodes)
  const J = 'Jaw from voice', S0 = 'Voice and sound levels', band = () => { for (const [k, v] of Object.entries(BANDF)) { const f = { loHp: 'loHp', loLp: 'loLp', hiHp: 'hiHp', hiLp: 'hiLp', noseHp: 'noseHp' }[k]; if (f) v.frequency.value = BANDS[f]; } };      // tune
  tuneGroup(J, { order: 20 }); tuneGroup(S0, { order: 21 });      // tune
  tune(J, 'Jaw leads the sound by (s)', MOUTH, 'lead', 0, 0.25, 0.005, (v) => { for (const d of DLS) d.delayTime.value = v; }, 'jaw.mouthLead');      // tune
  tune(J, 'Throat band: low edge (Hz)', BANDS, 'loHp', 20, 200, 1, band, 'jaw.band.loHp'); tune(J, 'Throat band: high edge (Hz)', BANDS, 'loLp', 200, 800, 5, band, 'jaw.band.loLp'); tune(J, 'Open-mouth band: low edge (Hz)', BANDS, 'hiHp', 200, 1200, 10, band, 'jaw.band.hiHp'); tune(J, 'Open-mouth band: high edge (Hz)', BANDS, 'hiLp', 1500, 8000, 50, band, 'jaw.band.hiLp'); tune(J, 'Nose hiss band: low edge (Hz)', BANDS, 'noseHp', 1000, 6000, 50, band, 'jaw.band.noseHp');      // tune
  tune(J, 'Silence level of open-mouth band (dB)', MOUTH, 'hiFloorDb', -80, -10, 1, null, 'jaw.hiFloorDb'); tune(J, 'Full-gape level of open-mouth band (dB)', MOUTH, 'hiFullDb', -50, 0, 1, null, 'jaw.hiFullDb'); tune(J, 'Level curve (1 = straight, 2 = quiet sounds barely open)', MOUTH, 'pow', 0.5, 4, 0.05, null, 'jaw.pow');      // tune
  tune(J, 'Brightness where opening starts (dB)', MOUTH, 't0', -20, 0, 0.1, null, 'jaw.tiltStart'); tune(J, 'Brightness where fully counted (dB)', MOUTH, 't1', -20, 5, 0.1, null, 'jaw.tiltFull'); tune(J, 'Breath damping (mouth shut, air through the nose)', MOUTH, 'air', 0, 1, 0.01, null, 'jaw.air'); tune(J, 'Damping starts (dB)', MOUTH, 'a0', -15, 5, 0.1, null, 'jaw.dampStart'); tune(J, 'Damping full (dB)', MOUTH, 'a1', -10, 10, 0.1, null, 'jaw.dampFull');      // tune
  tune(J, 'Opens at (s, smaller = snappier)', MOUTH, 'atk', 0.005, 0.3, 0.005, null, 'jaw.attack'); tune(J, 'Closes over (s, bigger = lazier)', MOUTH, 'rel', 0.02, 0.8, 0.01, null, 'jaw.release');      // tune
  tune(J, 'Tremble: fast follower (s)', MOUTH, 'fast', 0.001, 0.05, 0.001, null, 'jaw.flutterFast'); tune(J, 'Tremble: slow follower (s)', MOUTH, 'slow', 0.01, 0.2, 0.005, null, 'jaw.flutterSlow'); tune(J, 'Throat level: silence (dB)', MOUTH, 'loFloorDb', -80, -20, 1, null, 'jaw.loFloorDb'); tune(J, 'Throat level: full (dB)', MOUTH, 'loFullDb', -40, 0, 1, null, 'jaw.loFullDb');      // tune
  tune(J, 'Nose level: silence (dB)', MOUTH, 'noseFloorDb', -80, -20, 1, null, 'jaw.noseFloorDb'); tune(J, 'Nose level: full (dB)', MOUTH, 'noseFullDb', -60, 0, 1, null, 'jaw.noseFullDb');      // tune
  tune(S0, 'Roar', SND, 'roar', 0, 1.5, 0.01, null, 'snd.roar'); tune(S0, 'Growl', SND, 'growl', 0, 1.5, 0.01, null, 'snd.growl'); tune(S0, 'Huff / snort', SND, 'huff', 0, 1.5, 0.01, null, 'snd.huff'); tune(S0, 'Kill scream (1 = as built)', SND, 'scream', 0, 2, 0.02, null, 'snd.scream');      // tune
  tune(S0, 'Crunch of a bite', SND, 'crunch', 0, 2, 0.02, null, 'snd.crunch'); tune(S0, 'Tearing', SND, 'tear', 0, 2, 0.02, null, 'snd.tear'); tune(S0, 'Teeth clack, dry (1 = as built)', SND, 'clack', 0, 3, 0.02, null, 'snd.clack'); tune(S0, 'Breathing (1 = as built)', SND, 'breath', 0, 4, 0.05, null, 'snd.breath');      // tune
  tune(S0, 'Footfalls (1 = as built)', SND, 'feet', 0, 3, 0.02, (v) => { for (const e of EMTRIM.feet || []) e.in.gain.value = v; }, 'snd.feet'); tune(S0, 'Crash and impact sounds (1 = as built)', SND, 'crash', 0, 3, 0.02, null, 'snd.crash');      // tune
}

/** A place sound comes from: in -> [mouth delay] -> [proximity shelf] -> lowpass (air + occlusion) -> gain (distance) -> panner -> bus, with a reverb send. */
class Emitter {
  constructor(A, { hrtf = false, shelf = false, pan = true, bus, send, ref = 4, mouth = false, trim = null }) {
    const c = A.ctx; this.A = A; this.ref = ref; this.busy = 0; this.pos = { x: 0, y: 0, z: 0 };
    this.in = c.createGain(); let n = this.in;
    if (trim) { this.in.gain.value = SND[trim]; (EMTRIM[trim] || (EMTRIM[trim] = [])).push(this); }      // tune
    if (mouth) { this.dl = c.createDelay(0.5); this.dl.delayTime.value = MOUTH.lead; DLS.push(this.dl); this.in.connect(this.dl); n = this.dl; if (A.mouthTap) this.in.connect(A.mouthTap); }      // jaw-from-voice: the analyser hears `in` now, the room hears it MOUTH_LEAD later (direct path and reverb send both)
    if (shelf) { this.sh = c.createBiquadFilter(); this.sh.type = 'lowshelf'; this.sh.frequency.value = 110; n.connect(this.sh); n = this.sh; }
    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 0.5; this.lp.frequency.value = 18000; n.connect(this.lp);
    this.g = c.createGain(); this.lp.connect(this.g);
    if (pan) { this.p = c.createPanner(); this.p.panningModel = hrtf ? 'HRTF' : 'equalpower'; this.p.distanceModel = 'linear'; this.p.rolloffFactor = 0; this.p.refDistance = 1; this.p.maxDistance = 10000; this.g.connect(this.p); this.p.connect(bus); }
    else this.g.connect(bus);
    this.sg = c.createGain(); this.sg.gain.value = 0; this.lp.connect(this.sg); this.sg.connect(send);
  }
  place(x, y, z, t, tc = 0) {
    this.pos.x = x; this.pos.y = y; this.pos.z = z; const p = this.p; if (!p) return;
    if (p.positionX) { if (tc) { p.positionX.setTargetAtTime(x, t, tc); p.positionY.setTargetAtTime(y, t, tc); p.positionZ.setTargetAtTime(z, t, tc); } else { p.positionX.setValueAtTime(x, t); p.positionY.setValueAtTime(y, t); p.positionZ.setValueAtTime(z, t); } }
    else p.setPosition(x, y, z);
  }
  /** Distance d (m) and occlusion o (0 clear .. ~1 behind a wall) set level, air absorption, muffling and reverb. */
  set(d, o, t, tc = 0) {
    const ref = this.ref, D = Math.max(d, ref);
    const gain = (ref / D) * Math.exp(-d / 450) * (1 - 0.6 * clamp(o, 0, 1));
    const fc = clamp(16000 / (1 + d / 35), 500, 16000) * Math.pow(2, -3.6 * clamp(o, 0, 1.2));
    const snd = this.A.wet * Math.sqrt(ref / D) * Math.exp(-d / 600) * (1 - 0.25 * clamp(o, 0, 1));      // outdoors the tail falls off too, only slower than the direct sound
    const P = (a, v) => (tc ? a.setTargetAtTime(v, t, tc) : a.setValueAtTime(v, t));
    P(this.g.gain, gain); P(this.lp.frequency, Math.max(120, fc)); P(this.sg.gain, snd);
    if (this.sh) P(this.sh.gain, 7 * (1 - sstep(4, 25, d)));
  }
}

const ST0 = () => ({ t: 0, occT: 0, ambT: 0, inside: null, roofed: false, gust: 0.2, gustTo: 0.2, gustNext: 4, birdNext: 3, hush: 0, rollNext: 25, vocal: -9, sniffNext: 3, rumbleNext: 6, act: null, occ: 0, frameT: 0 });

export class Audio {
  /** opts (tests): { low, clipBase: where audio/ lives (default 'audio/', next to index.html), clipTimeout } */
  constructor(opts = {}) {
    this.ctx = null; this.on = true; this.clipBase = opts.clipBase; this.clipTimeout = opts.clipTimeout;
    // volumes: master, ambience (rain, thunder, wind, birds), creature (its voice, breath, footfalls), effects (stones, your steps)
    this.vol = { master: 0.8, amb: 0.45, cre: 1, fx: 0.8 };
    // a stored value that is not a finite number in 0..1 (an older format, a hand edit) would throw inside the graph build
    // (setTargetAtTime refuses NaN) and leave the whole context unbuilt: keep only good numbers
    try { const s = JSON.parse(localStorage.getItem('dino.vol') || '{}'); for (const k in this.vol) if (s && typeof s[k] === 'number' && isFinite(s[k])) this.vol[k] = clamp(s[k], 0, 1); } catch {}
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    // iPhone / iPad (iPadOS reports a Mac with touch): the hardware silent switch mutes Web Audio unless a media element plays
    this.ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
    const H = typeof location !== 'undefined' ? location.hash || '' : '';
    // capability first: navigator.audioSession is WebKit-only, and with touch points it is iPhone/iPad (a Mac has none); the user
    // agent only as the last resort (iOS before 16.4). '#audioios' forces the iOS paths on any browser (to exercise them on a desktop).
    this.ios = (typeof navigator !== 'undefined' && 'audioSession' in navigator && navigator.maxTouchPoints > 1) || this.ios || H.includes('audioios');
    this._noStream = H.includes('audiodirect');      // diagnostic: never route through the media-stream element
    this.dbg = { unlocks: 0, last: '', err: '', silent: this.ios ? 'not started' : 'not used (not iOS)', session: '', rebuilds: 0, tone: '', stream: this.ios ? 'not started' : 'not used (not iOS)' };
    this.low = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;
    this.touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    this.bank = {}; this.last = {}; this.queue = []; this.pending = new Map(); this.jid = 0; this.voices = 0;
    this.rainLevel = 0; this.src = null; this.R = Math.random;
    this.wet = 0.3;      // reverb send at the reference distance
    if (opts.low !== undefined) this.low = !!opts.low;
    this._bankStarted = false;
    try { this._startBanks(); } catch (e) { if (typeof console !== 'undefined') console.warn('audio bank', e); }
    if (typeof window !== 'undefined') window.__audio = this;      // handle for tests and the console
  }
  /** The world the sound lives in. tier: 'low' | 'high' (from main's quality detection). */
  /** "Start over" (main.js startOver): the timers of the ambience and the animal's sounds as when the sound first started (wind, far thunder, its breath and sniffs). */
  restart() { if (this.st) this.st = ST0(); }
  attach(o) { Object.assign(this, { cam: o.camera, sim: o.sim, mind: o.mind, terrain: o.terrain, world: o.world }); if (o.tier) { const low = o.tier === 'low'; if (low !== this.low && !this.ctx) { this.low = low; } } }

  // ---------------------------------------------------------------- generation
  // Order of work (the first seconds must not be thin): IRs, then the storm bed and first steps (tier 0), then one take of the
  // voices and everything else (tier 1, 2), then extra takes. Voices come from recordings (audio/*.mp3, fetched and decoded off
  // the main thread, never blocking the first sound) blended with synthesis; where a file or the decode is missing, the same
  // voice is synthesised instead. Work is spread over up to three Workers.
  _startBanks() {
    if (this._bankStarted) return; this._bankStarted = true;
    const low = this.low, SR = low ? 22050 : 32000; this.t0 = (typeof performance !== 'undefined' ? performance.now() : 0); this.tReady = {}; this.clipState = 'idle'; this.clips = {}; this.synthed = {};
    for (const [key, kind, o, nh, nl, sr] of bankList(low)) {
      this.bank[key] = []; if (HYBRID[key]) { this.synthSpec ||= {}; this.synthSpec[key] = { key, kind, o, n: low ? nl : nh, sr: sr || SR }; continue; }      // voices wait for their recordings
      const n = low ? nl : nh; for (let s = 0; s < n; s++) this.queue.push({ key, kind, o, seed: this._seed(key, s), sr: sr || SR, s, tier: TIER[key] ?? 2 });
    }
    this._sortQ();
    try {
      if (typeof Worker === 'undefined' || typeof Blob === 'undefined') throw 0;
      const code = `const L=(${synthLib.toString()})();const H=(${hybridLib.toString()})(L);onmessage=(e)=>{const d=e.data;if(d.clip){H.setClip(d.clip,d.sr,d.x);return;}let r;try{r=d.kind==='hyb'?H.make(d.o.name,d.seed,d.sr,d.o):L.make(d.kind,d.seed,d.sr,d.o);}catch(err){postMessage({id:d.id,err:String(err&&err.message||err)});return;}postMessage({id:d.id,sr:r.sr,ch:r.ch},r.ch.map((c)=>c.buffer));};`;
      const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), nw = low ? 1 : Math.max(1, Math.min(3, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2) - 1));
      this.workers = [];
      for (let k = 0; k < nw; k++) { const w = new Worker(url); w.busy = 0; w.onmessage = (e) => this._got(e.data, w); w.onerror = () => { this._dropWorker(w); }; this.workers.push(w); }
    } catch { this.workers = []; }
    this._pump(); this._loadClips();
    // if the recordings are not here soon, do not leave the voices silent: synthesise them (dropped again if the recordings arrive)
    if (typeof setTimeout !== 'undefined') this._fbTimer = setTimeout(() => { if (this.clipState === 'idle' || this.clipState === 'loading') this._synthVoices(true); }, this.clipTimeout ?? 4000);
  }
  _seed(key, s) { return (key.length * 7919 + s * 104729 + 17) | 0; }
  _sortQ() { this.queue.sort((a, b) => (a.s ? 10 + a.s * 4 + a.tier : a.tier) - (b.s ? 10 + b.s * 4 + b.tier : b.tier) || a.s - b.s); }
  _dropWorker(w) { this.workers = this.workers.filter((x) => x !== w); for (const [id, j] of this.pending) if (j.w === w) { this.pending.delete(id); this.queue.unshift(j); } if (!this.workers.length) this.workers = []; this._pump(); }
  /** Queue the synthesised version of every voice (used when recordings are missing, late, or a recipe could not be built). */
  _synthVoices(late) {
    for (const k in this.synthSpec || {}) this._synthVoice(k, late);
  }
  _synthVoice(k, late = false) {
    const sp = this.synthSpec && this.synthSpec[k]; if (!sp || this.synthed[k] || (this.hybOk && this.hybOk[k])) return; this.synthed[k] = true;
    for (let s = 0; s < sp.n; s++) this.queue.push({ key: k, kind: sp.kind, o: sp.o, seed: this._seed(k, s), sr: sp.sr, s, tier: TIER[k] ?? 1, late }); this._sortQ(); this._pump();
  }
  /** Fetch audio/manifest.json and the clips it lists, decode them (off the main thread) and hand them to the generators. */
  async _loadClips() {
    if (this._clipsStarted) return; this._clipsStarted = true;
    const base = this.clipBase ?? 'audio/';
    try {
      if (typeof fetch === 'undefined') throw new Error('no fetch');
      this.clipState = 'loading';
      const man = await (await fetch(base + 'manifest.json')).json(); if (!man || !man.clips) throw new Error('bad manifest');
      const AC = (typeof OfflineAudioContext !== 'undefined' && OfflineAudioContext) || (typeof webkitOfflineAudioContext !== 'undefined' && webkitOfflineAudioContext); if (!AC) throw new Error('no decode');
      const dsr = this.low ? 22050 : (man.sr || 32000), dctx = new AC(1, 1, dsr), names = Object.keys(man.clips), got = {}; let fails = 0;
      const dec = (ab) => new Promise((res, rej) => { const p = dctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
      let next = 0; const lane = async () => { while (next < names.length) { const n = names[next++]; try { const r = await fetch(base + man.clips[n].f); if (!r.ok) throw new Error(String(r.status)); const b = await dec(await r.arrayBuffer()); const x = new Float32Array(b.getChannelData(0)); got[n] = { sr: b.sampleRate, x }; } catch { fails++; } } };
      await Promise.all([lane(), lane(), lane(), lane()]);
      this.clips = got; this.clipFails = fails; this.clipManifest = man;
      const have = Object.keys(got); if (!have.length) throw new Error('no clips');
      for (const n of have) { if (this.workers && this.workers.length) for (const w of this.workers) w.postMessage({ clip: n, sr: got[n].sr, x: got[n].x.slice() }); else { this.lib ||= synthLib(); this.hyb ||= hybridLib(this.lib); this.hyb.setClip(n, got[n].sr, got[n].x); } }
      this.clipState = 'ok'; this.hybOk = {};
      for (const k in this.synthSpec) {
        const sp = this.synthSpec[k], [recipe, ro] = HYBRID[k], need = HYB_NEEDS[recipe] || [];
        if (!need.some((p) => have.some((h) => h.startsWith(p)))) { this._synthVoice(k); continue; }
        this.hybOk[k] = true; const n = Math.max(sp.n, this.low ? 2 : 4);
        for (let s = 0; s < n; s++) this.queue.push({ key: k, kind: 'hyb', o: { name: recipe, ...ro }, seed: this._seed(k, s) + 31, sr: sp.sr, s, tier: TIER[k] ?? 1, hyb: true });
      }
      this._sortQ(); this._pump();
    } catch (err) { this.clipState = 'failed'; this._synthVoices(); }
    if (this._readyFn && !this.queue.length && !this.inflight) { const f = this._readyFn; this._readyFn = null; f(); }
  }
  _pump() {
    if (this.workers && this.workers.length) {
      for (const w of this.workers) while (w.busy < 1 && this.queue.length) { const j = this.queue.shift(), id = ++this.jid; j.t0 = performance.now(); j.w = w; this.pending.set(id, j); this.inflight++; w.busy++; w.postMessage({ id, kind: j.kind, seed: j.seed, sr: j.sr, o: j.o }); }
    } else if (this.queue.length && !this._timer) {
      // no Worker: one sound per idle slice on the main thread
      this._timer = setTimeout(() => { this._timer = null; const j = this.queue.shift(); if (!j) return; this.lib ||= synthLib(); this.hyb ||= hybridLib(this.lib); this._run(j); this._pump(); }, 30);
    }
    this._tiers();
    if (!this.queue.length && !this.inflight && this._readyFn && this.clipState !== 'loading' && this.clipState !== 'idle') { const f = this._readyFn; this._readyFn = null; f(); }
  }
  _run(j) {
    try { const r = j.kind === 'hyb' ? this.hyb.make(j.o.name, j.seed, j.sr, j.o) : this.lib.make(j.kind, j.seed, j.sr, j.o); this._store(j, r); } catch (err) { this._failed(j); }
  }
  _failed(j) { if (j.hyb && !this.synthed[j.key]) { if (this.hybOk) this.hybOk[j.key] = false; this._synthVoice(j.key); } }
  _got(d, w) {
    const j = this.pending.get(d.id); this.pending.delete(d.id); this.inflight--; if (w) w.busy = Math.max(0, w.busy - 1);
    if (j) (this.genLog ||= []).push([j.key + (j.hyb ? '*' : ''), Math.round(performance.now() - j.t0)]);
    if (j) { if (d.err) { (this.genErr ||= []).push([j.key, d.err]); this._failed(j); } else this._store(j, d); } this._pump();
  }
  /** Notes when each tier of the work was finished, in ms since the start (this.tReady), for the tests and the console. */
  _tiers() {
    if (this.clipState === 'idle' || this.clipState === 'loading') { if (this.tReady[0] === undefined && !this.queue.some((j) => j.tier === 0) && !this._pendingTier(0)) this.tReady[0] = Math.round(performance.now() - this.t0); return; }
    for (const t of [0, 1, 2, 3]) if (this.tReady[t] === undefined && !this.queue.some((j) => !j.s && j.tier <= t) && !this._pendingTier(t, true)) this.tReady[t] = Math.round(performance.now() - this.t0);
    if (this.tReady.all === undefined && !this.queue.length && !this.inflight) this.tReady.all = Math.round(performance.now() - this.t0);
  }
  _pendingTier(t, firstOnly) { for (const j of this.pending.values()) if (j.tier <= t && (!firstOnly || !j.s)) return true; return false; }
  _store(j, r) {
    if (j.ir) { if (this.ctx) { const b = this._toBuf(r); if (b) j.ir.buffer = b; } return; }
    const L = (this.bank[j.key] ||= []);
    if (j.hyb) { if (!L.hybrid) { L.length = 0; L.hybrid = true; this.last[j.key] = -1; } }      // recordings arrived: the synthesised stand-ins go
    else if (L.hybrid) return;
    L.push({ sr: r.sr, ch: r.ch, buf: null }); this._allBuf = false;
    if (j.key.startsWith('rain_') || j.key.startsWith('bed_')) this._bedsDirty = true;
  }
  /** Resolves when everything queued so far has been generated (tests). */
  ready() { return new Promise((res) => { if (!this.queue.length && !this.inflight && this.clipState !== 'loading' && this.clipState !== 'idle') res(); else this._readyFn = res; }); }
  _toBuf(r) {
    const put = (b, ch) => ch.forEach((c, i) => b.copyToChannel ? b.copyToChannel(c, i) : b.getChannelData(i).set(c));
    try { const b = this.ctx.createBuffer(r.ch.length, r.ch[0].length, r.sr); put(b, r.ch); return b; } catch {}
    try {      // a WebKit that refuses low buffer rates: resample to the context's own rate
      const to = this.ctx.sampleRate, k = r.sr / to, n = Math.max(1, Math.floor(r.ch[0].length / k)), b = this.ctx.createBuffer(r.ch.length, n, to);
      put(b, r.ch.map((c) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * k, j = Math.floor(x), f = x - j; o[i] = c[j] * (1 - f) + (c[Math.min(j + 1, c.length - 1)]) * f; } return o; })); return b;
    } catch { return null; }
  }
  _buf(key, avoid = true) {
    const L = this.bank[key]; if (!L || !L.length) return null;
    let i = Math.floor(this.R() * L.length); if (avoid && L.length > 1 && i === this.last[key]) i = (i + 1 + Math.floor(this.R() * (L.length - 1))) % L.length;
    this.last[key] = i; const v = L[i]; if (!v.buf) { v.buf = this._toBuf(v); v.ch = null; } return v.buf;
  }

  // ---------------------------------------------------------------- graph
  setVolume(k, v) { this.vol[k] = v; try { localStorage.setItem('dino.vol', JSON.stringify(this.vol)); } catch {} this._applyVol(); }
  _applyVol() {
    if (!this.ctx) return; const t = this.ctx.currentTime, P = (a, v) => a.setTargetAtTime(v, t, 0.05);
    P(this.master.gain, this.on && !this._away ? this.vol.master : 0);      // _away: the page is not in front (away())
    P(this.busAmb.gain, this.vol.amb); P(this.busCre.gain, this.vol.cre); P(this.busFx.gain, this.vol.fx);
    P(this.sendAmb.gain, this.vol.amb); P(this.sendCre.gain, this.vol.cre); P(this.sendFx.gain, this.vol.fx);
  }
  /** The page is not the one in front (tab hidden, window blurred, page frozen or hidden by pagehide): fade the master out, then suspend the
   *  context (a suspended context also stops the iOS media elements' feed). grace: ms to wait before suspending (a blur may be a
   *  momentary prompt; back() inside it cancels). The game's own mute and volumes are untouched: _applyVol keeps the master at 0 while away. */
  away(grace = 120, tc = 0.03) {
    const c = this.ctx; if (!c || this.offline) return;
    this._away = true; clearTimeout(this._susT);
    try { const g = this.master.gain, t = c.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(0, t, tc); } catch {}
    this._susT = setTimeout(() => { this._susT = 0; if (!this._away) return; try { if (this._silentEl && !this._silentEl.paused) this._silentEl.pause(); if (this._streamEl && !this._streamEl.paused) this._streamEl.pause(); } catch {} try { if (c.state === 'running') c.suspend(); } catch {} }, grace);
  }
  /** The page is back in front: fade the master back to its set volume (about 0.2 s) and, if allowed (not paused by the game), ask the
   *  context to run. A resume without a gesture may be refused (iOS): the gesture path (needsUnlock) restores it at the next tap. */
  back(wake = true) {
    const c = this.ctx; if (!c || this.offline) return;
    clearTimeout(this._susT); this._susT = 0; if (!this._away) return; this._away = false;
    try { const g = this.master.gain, t = c.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(this.on ? this.vol.master : 0, t, 0.07); } catch {}
    if (wake && c.state !== 'running') this._wake();
  }
  /** Resume a suspended or interrupted context; must be reached from inside a gesture (touchend / pointerup / click) to work on iOS. */
  _wake() {
    const c = this.ctx; if (!c) return;
    try { const p = c.resume(); if (p && p.then) p.then(() => { this.dbg.last = 'resume ok -> ' + c.state; }, (e) => { this.dbg.err = 'resume: ' + this._etext(e); }); } catch (e) { this.dbg.err = 'resume threw: ' + this._etext(e); }
  }
  _etext(e) { return e ? (e.name || 'Error') + (e.message ? ' ' + e.message : '') : '?'; }
  /** One silent sample through the destination: older iOS only unlocks on a source started inside the gesture. Cheap; done on every unlock. */
  _blip() { try { const c = this.ctx, b = c.createBuffer(1, 1, c.sampleRate), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch {} }
  /** The silent switch. Web Audio on iOS plays in the 'ambient' audio-session category, which the hardware ring/silent switch mutes.
   *  navigator.audioSession.type = 'playback' lifts that, but WebKit IGNORES it (silently: no throw, the getter keeps saying 'auto') in a
   *  frame without microphone permission, which is exactly how the host frames this page (DOMAudioSession::setType checks the
   *  microphone permissions policy). So on iOS a looping silent <audio playsinline> is always played as well, started inside the
   *  gesture: a playing media element moves the page to the playback category. Safe to call on every gesture. */
  _unlockHelpers() {
    const N = typeof navigator !== 'undefined' ? navigator : null;
    try { if (N && N.audioSession) { if (N.audioSession.type !== 'playback') N.audioSession.type = 'playback'; this.dbg.session = 'type reads ' + N.audioSession.type + (N.audioSession.type === 'playback' ? '' : ' (ignored: no mic permission in this frame?)'); } else this.dbg.session = 'absent'; }
    catch (e) { this.dbg.session = 'threw ' + this._etext(e); }
    if (!this.ios && !this._forceSilent) return;
    if (!this._silentEl) {
      try {
        const n = 4000, v = new DataView(new ArrayBuffer(44 + n * 2)), W = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };      // 0.5 s of silence, 8 kHz mono 16-bit
        W(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); W(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); W(36, 'data'); v.setUint32(40, n * 2, true);
        let bin = ''; const u = new Uint8Array(v.buffer); for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
        const el = document.createElement('audio'); el.src = 'data:audio/wav;base64,' + btoa(bin); el.loop = true; el.setAttribute('playsinline', ''); el.setAttribute('webkit-playsinline', ''); el.preload = 'auto'; el.setAttribute('aria-hidden', 'true'); el.setAttribute('x-webkit-airplay', 'deny'); el.style.display = 'none';
        el.addEventListener('playing', () => { this.dbg.silent = 'playing'; });
        el.addEventListener('pause', () => { this.dbg.silent = 'paused'; });
        el.addEventListener('error', () => { this.dbg.silent = 'error ' + (el.error ? el.error.code : '?'); });
        document.body.appendChild(el); this._silentEl = el;
      } catch (e) { this.dbg.silent = 'could not make: ' + this._etext(e); return; }
    }
    const el = this._silentEl;
    if (el.paused && !this._streamPlaying) {
      this.dbg.silent = 'play() asked';
      try { const p = el.play(); if (p && p.then) p.then(() => { this.dbg.silent = 'playing'; }, (e) => { this.dbg.silent = 'play() refused: ' + this._etext(e); }); }
      catch (e) { this.dbg.silent = 'play() threw: ' + this._etext(e); }
    }
  }
  /** Is anything still to unlock? (main.js asks on every gesture; when false a gesture costs nothing.) On iOS that includes a
   *  media element playing (the stream or the silent loop), since without one the silent switch mutes everything. */
  needsUnlock() {
    if (this.offline) return false;
    if (!this.ctx || this.ctx.state !== 'running') return true;
    if (!this.ios) return false;
    if (this.msd && !this._streamPlaying) return true;
    return !this._streamPlaying && !(this._silentEl && !this._silentEl.paused);
  }
  _wantStream() { return this.ios && !this._noStream; }
  /** iOS line (b): the master, out of a MediaStreamAudioDestinationNode, played by an <audio playsinline> element, so what is heard is
   *  media-element playback (the category the silent switch does not mute). play() is called here, inside the gesture. When it is
   *  confirmed playing (promise resolved and its clock moving) the direct feed to ctx.destination is cut; if play() is refused,
   *  stalls, or the element stops later, the direct feed is restored at once. */
  _startStream() {
    if (!this.msd || this.offline || typeof document === 'undefined') return;
    let el = this._streamEl;
    if (!el) {
      el = document.createElement('audio'); el.setAttribute('playsinline', ''); el.setAttribute('webkit-playsinline', ''); el.setAttribute('aria-hidden', 'true'); el.setAttribute('x-webkit-airplay', 'deny'); el.style.display = 'none';
      try { el.srcObject = this.msd.stream; } catch (e) { this.dbg.stream = 'srcObject refused: ' + this._etext(e); this.msd = null; return; }
      for (const ev of ['pause', 'emptied', 'error', 'ended']) el.addEventListener(ev, () => { if (this._streamEl !== el) return; this._streamPlaying = false; this.dbg.stream = 'stopped (' + ev + ')'; this._directOn(); });
      document.body.appendChild(el); this._streamEl = el;
    }
    if (this._streamPlaying && !el.paused) return;
    const ask = (this._streamAsk || 0) + 1; this._streamAsk = ask; this.dbg.stream = 'play() asked';
    const ok = () => {
      if (this._streamAsk !== ask || el.paused) return;
      const t0 = el.currentTime; this.dbg.stream = 'play() resolved, checking clock';
      setTimeout(() => {
        if (this._streamAsk !== ask || el.paused) return;
        if (el.currentTime > t0) { this._streamPlaying = true; this.dbg.stream = 'playing (carrying the sound)'; this._directOff(); }
        else { this.dbg.stream = 'play() resolved but clock not moving: direct kept'; this._directOn(); }
      }, 400);
    };
    try { const p = el.play(); if (p && p.then) p.then(ok, (e) => { if (this._streamAsk === ask) { this.dbg.stream = 'play() refused: ' + this._etext(e); this._directOn(); } }); else ok(); }
    catch (e) { this.dbg.stream = 'play() threw: ' + this._etext(e); this._directOn(); }
    clearTimeout(this._streamDog);
    this._streamDog = setTimeout(() => { if (this._streamAsk === ask && !this._streamPlaying && /asked|checking/.test(this.dbg.stream)) { this.dbg.stream += ' (stalled 2.5 s): direct kept'; this._directOn(); } }, 2500);
  }
  _directOff() { if (this._direct && this.out && this.ctx) { try { this.out.disconnect(this.ctx.destination); this._direct = false; } catch {} } }
  _directOn() { if (!this._direct && this.out && this.ctx && this.ctx.state !== 'closed') { try { this.out.connect(this.ctx.destination); this._direct = true; } catch {} } }
  // replay: the security camera's microphone. on: what reaches the speakers goes through a thin band (about 300 Hz to 3.2 kHz) and a little quieter; mute holds it silent (the replay is paused).
  mic(on, mute) {
    const c = this.ctx; if (!c || !this.out) return;
    try {
      if (on && !this._mic) {
        const hp = c.createBiquadFilter(), lp = c.createBiquadFilter(), g = c.createGain(); hp.type = 'highpass'; hp.frequency.value = 300; lp.type = 'lowpass'; lp.frequency.value = 3200; g.gain.value = 0.6;
        if (this._direct) this.out.disconnect(c.destination);
        this.out.connect(hp); hp.connect(lp); lp.connect(g); g.connect(c.destination); this._mic = { hp, g };
      } else if (!on && this._mic) { const m = this._mic; this._mic = null; this.out.disconnect(m.hp); m.g.disconnect(); if (this._direct) this.out.connect(c.destination); }
      if (this._mic) this._mic.g.gain.setTargetAtTime(mute ? 0 : 0.6, c.currentTime, 0.03);
    } catch (e) { this._mic = null; this._directOn(); }
    this._clipMic(on, mute);      // replay: the recording's own copy of the camera microphone (never rebuilt, so the recording cannot lose its feed)
  }
  _clipMic(on, mute) { this._tapOn = !!on; this._tapMute = !!mute; const T = this._tap; if (!T || !this.ctx) return; try { const t = this.ctx.currentTime; T.dry.gain.setTargetAtTime(on ? 0 : 1, t, 0.03); T.wet.gain.setTargetAtTime(on ? (mute ? 0 : 0.6) : 0, t, 0.03); } catch {} }      // clip
  /** clip: one long-lived tap per context. It listens BEFORE the player's volume and mute (this.lim, ahead of this.master) so a muted or quiet player still gets
   *  a clip, and before the tab-hide fade of the master. Camera microphone copy (band-pass, x0.6) while the replay is on, then make-up gain, a gentle compressor
   *  and a -1 dB limiter so the track sits at a steady level. Null without Web Audio or before the graph exists. */
  _clipTap() {      // clip
    const c = this.ctx; if (!c || !c.createMediaStreamDestination || !this.lim) return null;
    if (this._tap && this._tap.ctx === c && this._tap.src === this.lim) return this._tap;
    try {
      const T = { ctx: c, src: this.lim, peak: 0 };
      T.inp = c.createGain(); T.dry = c.createGain(); T.wet = c.createGain(); T.dry.gain.value = this._tapOn ? 0 : 1; T.wet.gain.value = this._tapOn ? (this._tapMute ? 0 : 0.6) : 0;
      const hp = c.createBiquadFilter(), lp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300; lp.type = 'lowpass'; lp.frequency.value = 3200;
      T.mk = c.createGain(); T.mk.gain.value = 1.6;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
      const lim = c.createDynamicsCompressor(); lim.threshold.value = -1; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.1;
      T.an = c.createAnalyser(); T.an.fftSize = 2048; T.buf = new Float32Array(T.an.fftSize); T.dest = c.createMediaStreamDestination();
      this.lim.connect(T.inp); T.inp.connect(T.dry); T.inp.connect(hp); hp.connect(lp); lp.connect(T.wet); T.dry.connect(T.mk); T.wet.connect(T.mk);
      T.mk.connect(comp); comp.connect(lim); lim.connect(T.an); lim.connect(T.dest);
      this._tap = T; return T;
    } catch { this._tap = null; return null; }
  }
  /** clip: a MediaStream (one audio track, live for the life of the context) of the game's mix, for src/view/clip.js. Also tries to wake a suspended context. Null without Web Audio. */
  clipStream() {      // clip
    const T = this._clipTap(); if (!T) return null;
    try { if (this.ctx.state !== 'running') this._wake(); } catch {}
    return T.dest.stream;
  }
  /** clip: peak level (dB, -Infinity for silence) since the last call with reset; sampled from the tap's analyser. */
  clipLevel(reset) {      // clip
    const T = this._tap; if (!T) return -Infinity;
    try { T.an.getFloatTimeDomainData(T.buf); let m = 0; for (let i = 0; i < T.buf.length; i++) { const v = Math.abs(T.buf[i]); if (v > m) m = v; } if (m > T.peak) T.peak = m; } catch {}
    const r = T.peak > 0 ? 20 * Math.log10(T.peak) : -Infinity; if (reset) T.peak = 0; return r;
  }
  /** Which path the player is hearing, in words (for the #audio readout). */
  carrier() {
    if (!this.ctx) return 'none: no audio context yet (tap to start)';
    if (this.ctx.state !== 'running') return 'none: context ' + this.ctx.state;
    if (this._streamPlaying && !this._direct) return 'media-stream <audio> element (b): should ignore the silent switch';
    if (this.ios && this._silentEl && !this._silentEl.paused) return 'direct Web Audio + silent-loop element (c) playing: should ignore the silent switch';
    if (this.ios) return 'direct Web Audio only: FOLLOWS THE SILENT SWITCH (b and c both off)';
    return 'direct Web Audio (desktop path)';
  }
  /** Close a context that will not come back and start clean (still inside the gesture). Buffers are kept: an AudioBuffer is not tied to a context. */
  _rebuild() {
    const old = this.ctx; this.dbg.rebuilds++;
    try { if (this._streamEl) { const el = this._streamEl; this._streamEl = null; el.pause(); el.srcObject = null; el.remove(); } } catch {}
    this.msd = null; this._streamPlaying = false; this._direct = true; this.out = null; this._tap = null;      // clip: the tap belonged to the closed context
    try { old.onstatechange = null; const p = old.close(); if (p && p.catch) p.catch(() => {}); } catch {}
    this.ctx = null; this.layers = {}; this.breathL = null; this.hissL = null; this.voices = 0; this.st = null;
    this.queue = this.queue.filter((j) => !j.ir);
  }
  /** A loud beep through the game's own master (mix -> compressors -> master volume -> out), unlocking first: '#audio' test button. */
  testTone() {
    Audio.prototype.resume.call(this);
    const c = this.ctx; if (!c) { this.dbg.tone = 'no context: ' + (this.dbg.err || '?'); return; }
    try {
      const t = c.currentTime + 0.03, o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.02); g.gain.setValueAtTime(0.6, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g); g.connect(this.mix || this.out || c.destination); o.start(t); o.stop(t + 0.65); o.onended = () => { try { o.disconnect(); g.disconnect(); } catch {} };
      this.dbg.tone = 'beep sent at ' + new Date().toLocaleTimeString() + ' via ' + this.carrier();
    } catch (e) { this.dbg.tone = 'beep failed: ' + this._etext(e); }
  }
  /** The #audio readout, plain text. */
  debugText() {
    const c = this.ctx, N = typeof navigator !== 'undefined' ? navigator : {}, el = this._silentEl, d = this.dbg;
    let hyb = 0, syn = 0; for (const k in this.bank) { const L = this.bank[k]; if (L && L.length) { if (L.hybrid) hyb++; else syn++; } }
    const lines = [
      'CARRIER: ' + this.carrier(),
      'context: ' + (c ? c.state + ' @ ' + c.sampleRate + ' Hz' + (c.baseLatency !== undefined ? ', base latency ' + Math.round(c.baseLatency * 1000) + ' ms' : '') + (c.outputLatency ? ', output ' + Math.round(c.outputLatency * 1000) + ' ms' : '') : 'none') + (this.offline ? ' (offline)' : ''),
      'ios paths: ' + (this.ios ? 'on' : 'off') + (this._noStream ? ' (stream disabled by #audiodirect)' : '') + ' · direct feed ' + (this._direct ? 'connected' : 'cut'),
      '(a) audioSession: ' + ('audioSession' in N ? 'exists, type ' + (N.audioSession && N.audioSession.type) : 'absent') + (d.session ? ' · ' + d.session : ''),
      '(b) stream element: ' + d.stream + (this._streamEl ? ' · paused ' + this._streamEl.paused + ', t ' + this._streamEl.currentTime.toFixed(1) : ''),
      '(c) silent loop: ' + d.silent + (el ? ' · paused ' + el.paused + ', t ' + el.currentTime.toFixed(1) : ''),
      'recordings: ' + (this.clipState || '?') + ', decoded ' + Object.keys(this.clips || {}).length + ', failed ' + (this.clipFails || 0) + ' · voice banks from recordings ' + hyb + ', synthesised ' + syn + ' · gen errors ' + ((this.genErr && this.genErr.length) || 0),
      'volume: sound ' + (this.on ? 'on' : 'OFF') + ' · master setting ' + this.vol.master + ' · master gain now ' + (this.master ? this.master.gain.value.toFixed(2) : '-') + ' · amb ' + this.vol.amb + ' cre ' + this.vol.cre + ' fx ' + this.vol.fx + ' · tier ' + (this.low ? 'low' : 'high'),
      'unlock: ' + d.unlocks + ' gestures · last: ' + (d.last || '-') + ' · rebuilds ' + d.rebuilds + (d.err ? ' · error: ' + d.err : ''),
      'test tone: ' + (d.tone || '-'),
    ];
    return lines.join('\n');
  }
  /** Start (or un-suspend) the context. A context may be passed in (tests render through an OfflineAudioContext).
   *  The one unlock: must run synchronously inside a gesture (click / touchend / pointerup / keydown), no await or timer before it.
   *  Each call: the silent-switch helpers, then create or resume the context, then a one-sample source. If a context will not leave
   *  'suspended' / 'interrupted' over two gestures (a known iOS failure after a call, a lock or an app switch), it is closed and
   *  rebuilt, inside the gesture. */
  resume(ctxIn) {
    if (!ctxIn) this._unlockHelpers();
    if (this.ctx) {
      if (this.offline) return;
      const st = this.ctx.state; this.dbg.unlocks++;
      if (st === 'running') { this._stuck = 0; this.dbg.last = 'running'; this._startStream(); return; }
      const now = typeof performance !== 'undefined' ? performance.now() : 0;
      if (st === 'closed' || (this._stuck >= 2 && now - this._stuckAt > 600)) { this.dbg.last = 'rebuilding (was ' + st + ')'; this._rebuild(); }
      else { if (!this._stuck || now - this._stuckAt > 600) { this._stuck = (this._stuck || 0) + 1; this._stuckAt = now; } this.dbg.last = 'resume asked from ' + st; this._wake(); this._blip(); this._startStream(); return; }
      if (this.ctx) return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; this.ctx = ctxIn || new AC({ latencyHint: 'interactive' }); this.offline = !!ctxIn;
      if (!this.offline) {
        // created inside the gesture, so it may start running; resume it in the same call, and play one silent sample
        this._wake(); this._blip(); this._stuck = 0; this.dbg.last = 'created (' + this.ctx.state + ')';
        const c = this.ctx;
        c.onstatechange = () => { if (this.ctx !== c) return; if (c.state === 'running') this._stuck = 0; this.dbg.last = 'state -> ' + c.state; };
        if (!this._visHooked && typeof document !== 'undefined') {
          this._visHooked = true;
          // leaving: stop the silent loop (no lock-screen player for a paused game). Back: try a resume (allowed on some versions
          // without a gesture); whatever is still off is re-armed by the next gesture through needsUnlock().
          document.addEventListener('visibilitychange', () => { if (document.hidden) { try { if (this._silentEl && !this._silentEl.paused) this._silentEl.pause(); if (this._streamEl && !this._streamEl.paused) this._streamEl.pause(); } catch {} } });
          if (typeof window !== 'undefined') window.addEventListener('pageshow', (e) => { if (e.persisted && this.ctx && this.ctx.state !== 'running') this._wake(); });
        }
      }
      const c = this.ctx, low = this.low;
      // master: mix -> rumble filter -> [phone bass harmonics] -> glue compressor -> limiter -> volume -> out
      this.mix = c.createGain(); this.mix.gain.value = 0.9;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 22; hp.Q.value = 0.7; this.mix.connect(hp);
      const glue = c.createDynamicsCompressor(); glue.threshold.value = -20; glue.knee.value = 10; glue.ratio.value = 3; glue.attack.value = 0.012; glue.release.value = 0.28;
      const lim = c.createDynamicsCompressor(); lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
      hp.connect(glue);
      if (this.touch) {
        // small speakers cannot move air below ~120 Hz: add harmonics of the low end so the weight is still heard
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 110; const ws = c.createWaveShaper(); const cv = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = (i / 511.5 - 1) * 4; cv[i] = Math.tanh(x) * 0.6 + 0.25 * Math.abs(Math.tanh(x)); } ws.curve = cv;
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 170; bp.Q.value = 0.8; const g = c.createGain(); g.gain.value = 0.6;
        hp.connect(lp); lp.connect(ws); ws.connect(bp); bp.connect(g); g.connect(glue);
      }
      glue.connect(lim); this.master = c.createGain(); lim.connect(this.master); this.glue = glue; this.lim = lim;
      // out: the last node, which the chimes in ui.js also use. It feeds the speakers directly, and on iOS also a media-stream element
      // (see _startStream); once that element is confirmed playing, the direct feed is cut so nothing is doubled.
      this.out = c.createGain(); this.master.connect(this.out); this.out.connect(c.destination); this._direct = true;
      if (!this.offline && this._wantStream() && c.createMediaStreamDestination) { try { this.msd = c.createMediaStreamDestination(); this.out.connect(this.msd); } catch (e) { this.msd = null; this.dbg.stream = 'no stream node: ' + this._etext(e); } }
      const bus = () => { const g = c.createGain(); g.connect(this.mix); return g; };
      this.busAmb = bus(); this.busCre = bus(); this.busFx = bus();
      // reverb: per-bus sends (so the sliders scale the wet too) into an outdoor and an indoor convolver, crossfaded by where you are
      this.revIn = c.createGain();
      const send = () => { const g = c.createGain(); g.connect(this.revIn); return g; };
      this.sendAmb = send(); this.sendCre = send(); this.sendFx = send();
      const sr = c.sampleRate;
      this.convOut = c.createConvolver(); this.convOut.normalize = false; this.gOut = c.createGain(); this.revIn.connect(this.convOut); this.convOut.connect(this.gOut); this.gOut.connect(this.mix);
      this.queue.push({ ir: this.convOut, kind: 'ir', key: 'ir_out', seed: 5, sr, o: { kind: 'out', rt: low ? 1.0 : 1.8 }, tier: -1, s: 0 });
      if (!low) { this.convIn = c.createConvolver(); this.convIn.normalize = false; this.gIn = c.createGain(); this.gIn.gain.value = 0; this.revIn.connect(this.convIn); this.convIn.connect(this.gIn); this.gIn.connect(this.mix); this.queue.push({ ir: this.convIn, kind: 'ir', key: 'ir_in', seed: 9, sr, o: { kind: 'in', rt: 0.6 }, tier: -1, s: 0 }); }
      this._applyVol();
      // places: the head (voice, breath, sniffing), each foot, a small pool for everything else, and you
      const hr = !low;
      // jaw-from-voice: everything the mouth or nose makes goes into the `mouth` emitters (head: voice, breath, sniffs; selfMouth: the scream); their input is tapped
      // by two analysers (voice band, hiss band) and reaches the room MOUTH_LEAD later. headHit is the head as a thing that bumps (contact, bite impacts): not delayed, not tapped.
      this.mouthTap = c.createGain(); this.mouthTap.gain.value = 1;
      const an = (nm, hpF, lpF) => { const A = c.createAnalyser(); A.fftSize = 1024; let n = this.mouthTap; for (const [ty, f] of [['highpass', hpF], ['lowpass', lpF]]) { if (!f) continue; const b = c.createBiquadFilter(); b.type = ty; b.frequency.value = f; b.Q.value = 0.7; BANDF[nm + (ty === 'highpass' ? 'Hp' : 'Lp')] = b; n.connect(b); n = b; } n.connect(A); return A; };
      this.anL = an('lo', BANDS.loHp, BANDS.loLp); this.anH = an('hi', BANDS.hiHp, BANDS.hiLp); this.anN = an('nose', BANDS.noseHp, 0);      // low band (the throat), high band (what an open mouth lets out), hiss band (the nose)
      this._M = { t: null, bL: new Float32Array(1024), bH: new Float32Array(1024), bN: new Float32Array(1024), v: 0, n: 0, lf: 0, ls: 0, sL: 0, sH: 0, dbL: -120, dbH: -120, dbN: -120, bright: 0 }; this.mouthOpen = 0; this.mouthFast = 0; this.mouthFlutter = 0; this.noseOpen = 0;
      this.head = new Emitter(this, { hrtf: hr, shelf: hr, bus: this.busCre, send: this.sendCre, ref: 5, mouth: true });
      this.headHit = new Emitter(this, { hrtf: hr, shelf: hr, bus: this.busCre, send: this.sendCre, ref: 5 });
      this.feet = [0, 1].map(() => new Emitter(this, { hrtf: hr, shelf: hr, bus: this.busCre, send: this.sendCre, ref: 4, trim: 'feet' }));
      this.pool = Array.from({ length: low ? 3 : 6 }, () => new Emitter(this, { hrtf: false, bus: this.busFx, send: this.sendFx, ref: 2.5 }));
      this.creaturePool = Array.from({ length: low ? 1 : 2 }, () => new Emitter(this, { hrtf: hr, bus: this.busCre, send: this.sendCre, ref: 4 }));
      this.ambPool = Array.from({ length: low ? 2 : 4 }, () => new Emitter(this, { hrtf: false, bus: this.busAmb, send: this.sendAmb, ref: 3 }));
      this.self = new Emitter(this, { pan: false, bus: this.busFx, send: this.sendFx, ref: 1 }); this.self.set(1, 0, c.currentTime);
      this.selfMouth = new Emitter(this, { pan: false, bus: this.busFx, send: this.sendFx, ref: 1, mouth: true }); this.selfMouth.set(1, 0, c.currentTime);
      // ambience: everything outdoors goes through one lowpass that closes when you are under a roof
      this.ambOut = c.createGain(); this.ambLP = c.createBiquadFilter(); this.ambLP.type = 'lowpass'; this.ambLP.frequency.value = 18000; this.ambLP.Q.value = 0.5;
      this.ambOut.connect(this.ambLP); this.ambLP.connect(this.busAmb);
      this.layers = {}; this._bedsDirty = true;
      this.st = ST0();
      this._sortQ(); this._pump();
      if (!this.offline) this._startStream();      // still inside the gesture
    } catch (err) { this.dbg.err = 'build: ' + this._etext(err); try { if (this.ctx && !this.offline) this.ctx.close(); } catch {} this.ctx = null; if (typeof console !== 'undefined') console.warn('audio off', err); }
  }
  _ok() { return this.ctx && this.on && (this.offline || this.ctx.state === 'running'); }
  /** A looping layer, decorrelated into stereo by playing the mono loop twice from different points. */
  _bed(name, key, dest, stereo = true) {
    if (this.layers[name]) return this.layers[name]; if (this._made) return null; const b = this._buf(key, false); if (!b) return null; this._made = true;
    const c = this.ctx, g = c.createGain(); g.gain.value = 0; const L = { g, srcs: [] };
    if (stereo) {
      const m = c.createChannelMerger(2);
      for (let k = 0; k < 2; k++) { const s = c.createBufferSource(); s.buffer = b; s.loop = true; s.connect(m, 0, k); s.start(c.currentTime, (k * 0.47 + this.R() * 0.2) * b.duration); L.srcs.push(s); }
      m.connect(g);
    } else { const s = c.createBufferSource(); s.buffer = b; s.loop = true; s.connect(g); s.start(c.currentTime, this.R() * b.duration); L.srcs.push(s); }
    if (dest) g.connect(dest);
    return (this.layers[name] = L);
  }
  _beds() {
    // one new layer per frame, so starting the beds never costs a frame much
    const c = this.ctx, low = this.low; this._made = false;
    for (const k of ['wash', 'leaf', 'ground', 'hard']) if (!low || k !== 'hard') this._bed(k, 'rain_' + k, this.ambOut);
    this._bed('roof', 'rain_roof', this.busAmb);
    if (!this._made && !this.layers.wind && this.bank.bed_pink?.length) { this._made = true;
      // wind: two band-passed noise streams, left and right, swept by the gusts; leaves hiss on top in the strong ones
      const m = c.createChannelMerger(2), g = c.createGain(); g.gain.value = 0; const W = { g, bp: [], srcs: [] };
      for (let k = 0; k < (low ? 1 : 2); k++) { const s = c.createBufferSource(); s.buffer = this._buf('bed_pink', false); s.loop = true; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9; f.frequency.value = 300; s.connect(f); if (low) { f.connect(m, 0, 0); f.connect(m, 0, 1); } else f.connect(m, 0, k); s.start(c.currentTime, this.R() * 4); W.bp.push(f); W.srcs.push(s); }
      m.connect(g); g.connect(this.ambOut); this.layers.wind = W;
    }
    this._bed('leaves', 'bed_leaves', this.ambOut);
    if (!this.hissL) { this.hissL = this._bed('hiss', 'bed_hiss', this.busFx, false); if (this.hissL) this.hiss(this.hissLevel || 0); }
    if (!this._made && !this.breathL && this.bank.bed_pink?.length) { this._made = true;
      // breath: noise through a nasal band and a chest band, levels follow the animal's breathing
      const s = c.createBufferSource(); s.buffer = this._buf('bed_pink', false); s.loop = true; s.start(c.currentTime, 1.3);
      const nb = c.createBiquadFilter(); nb.type = 'bandpass'; nb.Q.value = 1.1; nb.frequency.value = 600;
      const cb = c.createBiquadFilter(); cb.type = 'lowpass'; cb.frequency.value = 180;
      const gn = c.createGain(), gc = c.createGain(); gn.gain.value = 0; gc.gain.value = 0;
      s.connect(nb); nb.connect(gn); gn.connect(this.head.in); s.connect(cb); cb.connect(gc); gc.connect(this.head.in);
      this.breathL = { nb, gn, gc };
    }
    this._bedsDirty = this._made;
  }

  // ---------------------------------------------------------------- placing and playing
  _L() { const p = this.cam ? this.cam.position : null; return p ? { x: p.x, y: p.y, z: p.z } : { x: 0, y: 1.7, z: 0 }; }
  /** Where an event's sound comes from: the event's own position when it matches the distance given, else the head. */
  _where(dist, prefer = 'head') {
    const L = this._L(), e = this.src;
    if (e && e.x !== undefined) { const d = Math.hypot(e.x - L.x, (e.y ?? L.y) - L.y, e.z - L.z); if (dist === undefined || Math.abs(d - dist) < 3) return { x: e.x, y: e.y ?? L.y, z: e.z }; }
    if (prefer === 'head' && this.sim) { const h = this.sim.head.pos; return { x: h.x, y: h.y, z: h.z }; }
    const a = this.R() * 6.283, d = dist || 5; return { x: L.x + Math.sin(a) * d, y: L.y, z: L.z + Math.cos(a) * d };
  }
  /** How much is between a and b: walls, a roof, rock outcrops, the ground itself. 0 is clear; 1 is behind a wall. */
  occlusion(a, b) {
    const T = this.terrain; if (!T) return 0;
    let o = 0; const dx = b.x - a.x, dz = b.z - a.z;
    for (const S of T.structures || []) {
      for (const w of S.walls) {
        const ex = w.bx - w.ax, ez = w.bz - w.az, den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue;
        const t = ((w.ax - a.x) * ez - (w.az - a.z) * ex) / den, u = ((w.ax - a.x) * dz - (w.az - a.z) * dx) / den;
        if (t <= 0 || t >= 1 || u < 0 || u > 1) continue;
        const y = a.y + (b.y - a.y) * t, top = S.base + w.h;
        o += y < top ? (S.kind === 'pen' ? 0.45 : S.kind === 'tower' ? 0 : 1.0) : y < top + 1.5 ? 0.15 : 0;
      }
    }
    if (T.roofBlocks && T.roofBlocks(a.x, a.y, a.z, b.x, b.y, b.z)) o += 0.6;
    const L = Math.hypot(dx, dz) || 1;
    for (const ob of T.obstacles || []) {
      if (ob.kind === 'wall') continue;
      const t = clamp(((ob.x - a.x) * dx + (ob.z - a.z) * dz) / (L * L), 0, 1), px = a.x + dx * t - ob.x, pz = a.z + dz * t - ob.z;
      if (px * px + pz * pz > ob.r * ob.r || t < 0.02 || t > 0.98) continue;
      if (ob.kind === 'tree') { o += 0.06; continue; }
      const y = a.y + (b.y - a.y) * t; if (y < T.height(ob.x, ob.z) + ob.h * 0.8) o += 0.4;
    }
    for (let k = 1; k < 6; k++) { const t = k / 6, x = a.x + dx * t, z = a.z + dz * t; if (T.height(x, z) > a.y + (b.y - a.y) * t + 0.3) { o += 0.5; break; } }
    return Math.min(1.2, o);
  }
  _place(em, p, at) { const L = this._L(), d = Math.hypot(p.x - L.x, p.y - L.y, p.z - L.z); em.place(p.x, p.y, p.z, at); em.set(d, this.occlusion(L, p), at); return d; }
  _free(list, dur) { const t = this.ctx.currentTime; let best = list[0]; for (const e of list) { if (e.busy <= t) { best = e; break; } if (e.busy < best.busy) best = e; } best.busy = t + dur; return best; }
  /** Play one take of `key` into `dest` (an Emitter or a node) at time `at`. */
  _play(key, dest, at, gain = 1, rate = 1, prio = 1, offset = 0) {
    if (!this._ok()) return null;
    const cap = this.low ? 14 : 32; if (this.voices >= cap && prio < 2) return null;
    const b = this._buf(key); if (!b) return null;
    const c = this.ctx, s = c.createBufferSource(), g = c.createGain(); s.buffer = b; s.playbackRate.value = rate; g.gain.value = gain;
    s.connect(g); g.connect(dest.in || dest); this.voices++;
    s.onended = () => { this.voices--; try { s.disconnect(); g.disconnect(); } catch {} };
    s.start(Math.max(c.currentTime, at), offset); return b.duration / rate;
  }
  _jit(k = 0.03) { return 1 + (this.R() * 2 - 1) * k; }
  _db(k = 1.5) { return Math.pow(10, ((this.R() * 2 - 1) * k) / 20); }
  _arrive(d) { return this.ctx.currentTime + Math.min(d / 343, 1.5); }
  _wetGround() { return this.rainLevel > 0.3 || (this.world && this.world.mood && this.world.mood.wet > 0.3); }

  // ---------------------------------------------------------------- the animal
  /** A one-shot AudioBuffer from a decoded recording (cached), or null when the file is not there. */
  _clipBuf(name) {
    const C = (this._cb ||= {}); if (name in C) return C[name]; const r = this.clips && this.clips[name]; if (!r) return null;
    try { const b = this.ctx.createBuffer(1, r.x.length, r.sr); b.getChannelData(0).set(r.x); return (C[name] = b); } catch { return (C[name] = null); }
  }
  _clipNames(prefix) { return this.clips ? Object.keys(this.clips).filter((n) => n.startsWith(prefix)).sort() : []; }
  /** Shuffle bag: every item once before any repeats, and never the same one twice running across a refill. */
  _bagPick(key, list) {
    if (!list.length) return null; const B = (this._bags ||= {}), q = (B[key] ||= { bag: [], last: -1 });
    if (!q.bag.length) { q.bag = list.map((_, i) => i); for (let i = q.bag.length - 1; i > 0; i--) { const j = Math.floor(this.R() * (i + 1)); [q.bag[i], q.bag[j]] = [q.bag[j], q.bag[i]]; } if (q.bag.length > 1 && q.bag[q.bag.length - 1] === q.last) q.bag.unshift(q.bag.pop()); }
    q.last = q.bag.pop(); return list[q.last];
  }
  _noise() { if (this._nb) return this._nb; const c = this.ctx, n = Math.floor(c.sampleRate * 1.5), b = c.createBuffer(1, n, c.sampleRate), x = b.getChannelData(0); for (let i = 0; i < n; i++) x[i] = Math.random() * 2 - 1; return (this._nb = b); }
  /** How wet the ground is under a foot, 0..1: standing water, mud and marsh are wet; ordinary ground is not, however hard it rains
   *  (rain only dampens: `damp`). Wet is what earns a squelch, so it is never a property of the weather alone. */
  _groundAt(x, z) {
    const T = this.terrain; let surf = 'grass', wet = 0;
    if (T && T.surfaceAt) { try { surf = T.surfaceAt(x, z); } catch {} }
    if (surf === 'water') wet = 1; else if (surf === 'mud') wet = 1; else if (surf === 'marsh') wet = 0.85;
    else if (T && T.wetAt) { const w = T.wetAt(x, z); wet = 0.35 * sstep(0.2, 0.35, w); }
    return { surf, wet, damp: clamp(this.rainLevel || 0, 0, 1) };
  }
  /** One short noise burst through a filter: the dry scuff, grit, the lip of a splash. */
  _burst(dest, at, dur, type, f, q, gain, atk = 0.004) {
    const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); s.buffer = this._noise(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    s.connect(fl); fl.connect(g); g.connect(dest); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(gain, at + atk); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.start(at, this.R() * 1.0, dur + 0.02); this.voices++; s.onended = () => { this.voices--; try { s.disconnect(); fl.disconnect(); g.disconnect(); } catch {} };
  }
  /** A trimmed piece of a recording: first `len` s only, filtered, with a quick fade so no tail is left ('suck' lives in the tails). */
  _snip(name, dest, at, len, rate, gain, hp, lp, off = 0) {
    const b = this._clipBuf(name); if (!b) return false; const c = this.ctx, s = c.createBufferSource(), g = c.createGain(), h = c.createBiquadFilter(), l = c.createBiquadFilter();
    s.buffer = b; s.playbackRate.value = rate; h.type = 'highpass'; h.frequency.value = hp; l.type = 'lowpass'; l.frequency.value = lp; s.connect(h); h.connect(l); l.connect(g); g.connect(dest);
    const L = Math.min(len, (b.duration - off) / rate); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(gain, at + 0.004); g.gain.setValueAtTime(gain, at + L * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, at + L);
    s.start(at, off, L * rate + 0.02); this.voices++; s.onended = () => { this.voices--; try { s.disconnect(); h.disconnect(); l.disconnect(); g.disconnect(); } catch {} }; return true;
  }
  /** A footfall. intensity ~0.6 walking, ~1 running, ~2 stamping, below ~0.4 a stalking step. Layers (see out/audio/FOOTSTEPS.md):
   *  weight (sub thump + knock, on every ground), surface (dry scuff / grit, or a SHORT squelch only on wet ground), toe settle; each varied. */
  thump(intensity, dist) {
    if (!this._ok()) return;
    const p = this._where(dist, 'foot'), e = this.src, L = this._L(), d = Math.hypot(p.x - L.x, p.y - L.y, p.z - L.z);
    const speed = this.sim ? Math.abs(this.sim.v) : 0, run = clamp((Math.max(speed / 7, intensity) - 0.55) / 0.45, 0, 1), soft = intensity < 0.4, stomp = intensity > 1.5;
    const foot = e && e.foot !== undefined ? e.foot & 1 : (this._fi = (this._fi || 0) ^ 1), em = this.feet[foot], at = this._arrive(d);
    this._place(em, p, at);
    const c = this.ctx, R = this.R, G = this._groundAt(p.x, p.z), t0 = Math.max(c.currentTime, at), side = foot ? 1.045 : 0.955;
    const cap = this.low ? 14 : 32, room = this.voices < cap - 3;
    const lvl = Math.min(1.5, Math.pow(Math.max(intensity, 0.1) / 0.8, 1.2)), wetK = Math.max(G.wet, 0), dull = 1 - 0.3 * Math.max(wetK, 0.5 * G.damp);
    const near = 1 - sstep(8, 60, d), dest = em.in;
    // 1. weight: a falling sine (felt) plus a low knock (audible on small speakers); a stalking step puts little weight down
    // (NOTES4: a run at you was heard only below 100 Hz, at the level of the rain/bird bed above 250 Hz: the weight now grows with
    //  pace and nearness, and carries an audible body thud and ground crack, not just a sub that small speakers drop)
    const prox = 1 - sstep(5, 45, d), wk = soft ? 0.3 + intensity : 1, th = Math.min(0.75, (0.42 + 0.18 * run) * lvl * wk * this._db(2.5)) * (1 - 0.45 * sstep(12, 60, d)) * (0.36 + 0.64 * sstep(4, 20, d));      // (less close: a run at 6 m had sat on the master limiter, -2.2 dBFS)      // (was 0.78 flat, then min(0.55, 0.42 lvl): out/audio/ODDSOUNDS.md)
    const o = c.createOscillator(), og = c.createGain(), fA = (52 + R() * 14) * (1 + 0.15 * run) * side * this._jit(0.08), fB = (25 + R() * 6) * side;
    const tau = (soft ? 0.09 : 0.22 - 0.09 * run + 0.03 * wetK) * this._jit(0.12);
    o.frequency.setValueAtTime(fA, t0); o.frequency.exponentialRampToValueAtTime(fB, t0 + 0.08);
    og.gain.setValueAtTime(0.0001, t0); og.gain.linearRampToValueAtTime(0.32 * th, t0 + 0.006); og.gain.setTargetAtTime(0.0001, t0 + 0.006, tau * 0.75);      // (0.5: the sub was 84-92% of the energy and drove the bus compressor, ducking what speakers play)
    o.connect(og); og.connect(dest); o.start(t0); o.stop(t0 + tau * 6 + 0.1); this.voices++; o.onended = () => { this.voices--; try { o.disconnect(); og.disconnect(); } catch {} };
    const ko = c.createOscillator(), kg = c.createGain(); ko.frequency.value = (92 + R() * 40) * side * this._jit(0.08); kg.gain.setValueAtTime(0.0001, t0); kg.gain.linearRampToValueAtTime((0.22 + 0.25 * run * prox) * th * dull, t0 + 0.004); kg.gain.setTargetAtTime(0.0001, t0 + 0.004, 0.035 * (1 + 0.2 * R()));
    ko.connect(kg); kg.connect(dest); ko.start(t0); ko.stop(t0 + 0.4); ko.onended = () => { try { ko.disconnect(); kg.disconnect(); } catch {} };
    this._burst(dest, t0, 0.07 + 0.03 * (1 - run), 'lowpass', (260 + R() * 100) * (1 + 0.4 * run) * dull, 0.7, 0.55 * th, 0.003);      // the soil's dull thud
    if (!soft) {
      // the body of the blow, where small speakers and headphones have it (150-450 Hz), and the ground cracking under a running
      // foot: both rise with pace and nearness (a walk far off stays a soft thud; a run at you is heard and felt)
      const bk = (1.6 + 4.5 * run) * (0.45 + 0.55 * prox);      // (a band of noise carries little power: these gains are large)
      this._burst(dest, t0 + 0.002, 0.11 + 0.05 * (1 - run), 'bandpass', (200 + R() * 90) * side * dull, 0.8, 0.4 * bk * th, 0.004);
      // (most of the body as a short falling tone, not noise: a noise band that loud peaked on the master limiter at 6-12 m)
      const bo = c.createOscillator(), bg = c.createGain(), bf = (210 + R() * 60) * side * this._jit(0.06); bo.frequency.setValueAtTime(bf, t0); bo.frequency.exponentialRampToValueAtTime(bf * 0.62, t0 + 0.09);
      bg.gain.setValueAtTime(0.0001, t0); bg.gain.linearRampToValueAtTime(0.07 * bk * th * dull, t0 + 0.005); bg.gain.setTargetAtTime(0.0001, t0 + 0.005, 0.045 + 0.02 * (1 - run));
      bo.connect(bg); bg.connect(dest); bo.start(t0); bo.stop(t0 + 0.45); bo.onended = () => { try { bo.disconnect(); bg.disconnect(); } catch {} };
      if (run > 0.2 && room) this._burst(dest, t0 + 0.004, 0.05 + 0.02 * R(), 'bandpass', (650 + R() * 350) * side * dull, 1.1, 0.9 * run * prox * th * this._db(2), 0.004);
    }
    if (!soft && room) this._burst(dest, t0 + (run ? 0.035 : 0.06 + R() * 0.035), 0.06, 'lowpass', 180 * dull, 0.7, 0.2 * th, 0.003);      // toes settle after the heel
    // 2. surface, near enough to hear: dry scuff / grit on dry ground, a short squelch only on wet
    const sk = near * near;
    if (sk > 0.03 && room) {
      const ts = t0 + 0.004 + R() * 0.012, sg = this._db(2.5) * lvl * (soft ? 0.7 : 1);
      if (G.surf === 'water') { this._burst(dest, ts, 0.16, 'bandpass', 1400 * side, 0.8, 0.2 * sg * sk, 0.01); const sq = this._bagPick('wet', this._clipNames('squish_')); if (sq) this._snip(sq, dest, ts + 0.01, 0.2, 1.1 * this._jit(0.08), 0.5 * sg * sk, 150, 3500); }
      else if (wetK > 0.3) {
        const sq = this._bagPick('wet', [...this._clipNames('squish_'), ...this._clipNames('mud_')]);
        if (sq) this._snip(sq, dest, ts + 0.01, 0.16 + 0.1 * wetK, 1.05 * this._jit(0.09) * (1 + 0.1 * run), 0.5 * wetK * sg * sk, 140, 3600);
        else this._burst(dest, ts, 0.14, 'bandpass', 800 * side * this._jit(0.1), 1.6, 0.18 * wetK * sg * sk, 0.01);
        this._burst(dest, ts, 0.07, 'lowpass', 900, 0.7, 0.2 * wetK * sg * sk, 0.004);
      } else {
        const hard = G.surf === 'rock' || G.surf === 'gravel', leaf = G.surf === 'forest', len = soft ? 0.2 : 0.09 + 0.05 * (1 - run);
        const lp = (hard ? 4800 : leaf ? 2000 : 2800) * side * this._jit(0.1) * (1 - 0.3 * G.damp);
        this._burst(dest, ts + (soft ? 0.02 : 0), len, 'bandpass', (hard ? 2200 : 1100) * side * this._jit(0.12), 0.9, (hard ? 0.2 : soft ? 0.2 : 0.15) * sg * sk, soft ? 0.03 : 0.005);
        const cr = null;      // the `crimp_` takes are break/crunch impacts: on every dry step they read as metal banging and scuffling (owner, 2026-11-14); the noise burst above is the dry scuff
        if (cr && !soft) this._snip(cr, dest, ts + 0.006, 0.1 + 0.05 * (1 - run), (0.8 + R() * 0.25) * (hard ? 1.2 : 1), 0.3 * sg * sk * (leaf ? 1.2 : 1), 300, lp, R() * 0.15);
        if (hard) for (let k = 0, m = 2 + Math.floor(R() * 3); k < m; k++) this._burst(dest, ts + 0.01 + R() * 0.12, 0.012, 'highpass', 2500 + R() * 2500, 0.7, (0.05 + 0.1 * R()) * sg * sk, 0.001);      // grit
      }
    }
    // ferns at the foot
    const T = this.terrain; if (T && T.coverAt && room) { const cv = T.coverAt(p.x, p.z); if (cv > 0.25) this._play(G.damp > 0.3 ? 'rustle_wet' : 'rustle', em, at + 0.02, 0.5 * cv * this._db(2), 0.55 * this._jit(0.08), 1); }
  }
  _voice(key, dist, gain = 1, rate = 1, pre = 0, prio = 2) {
    if (key === 'huff' || key === 'snort' || key === 'sniff') this.breathCue = key === 'sniff' ? -1 : 1;      // -1: a sniff (effects.snort draws its inhales on SNIFF_RHYTHM)
    if (!this._ok()) return;
    const p = this._where(dist, 'head'), L = this._L(), d = Math.hypot(p.x - L.x, p.y - L.y, p.z - L.z), h = this.sim ? this.sim.head.pos : null;
    const near = !h || Math.hypot(p.x - h.x, p.y - h.y, p.z - h.z) < 3, em = near ? (key === 'crunch' || key === 'tear' ? this.headHit : this.head) : this._free(this.creaturePool, 3);      // crunch and tear are flesh and bone giving way, not a voice: no jaw drive
    const at = Math.max(this.ctx.currentTime, this._arrive(d) - pre);
    if (near) { em.place(p.x, p.y, p.z, at); em.set(d, this.st.occ, at); } else this._place(em, p, at);
    this.st.vocal = this.ctx.currentTime;
    return this._play(key, em, at, gain, rate, prio);
  }
  // Dynamic range does the work: its everyday voice (breath, rumbles, huffs, footfalls, even a display roar) is kept low, and
  // full volume is reserved for one sound, the scream at the instant it commits to a kill (scream(), from the strike).
  roar(dist) { this._voice('roar', dist, SND.roar * this._db(1), this._jit(0.035)); this.st.hush = this.ctx ? this.ctx.currentTime + 25 : 0; }
  huff(dist) { this._voice('huff', dist, SND.huff * this._db(2), this._jit(0.05)); }
  growl(dist) { this._voice('growl', dist, SND.growl * this._db(1.5), this._jit(0.04)); }
  /** The killing strike: the bank's roar, close, dry and at full level, over the recorded monster roar (manifest
   *  `monster_roar`, its first seconds); nothing else it does is this loud. */
  scream() {
    if (!this._ok()) return; const c = this.ctx, t = c.currentTime;
    this._play('roar', this.selfMouth, t, 1.5 * SND.scream, 1.04, 3);
    const m = this.clips && this.clips.monster_roar;
    if (m) {
      if (!this._scrBuf) { const n = Math.min(m.x.length, Math.round(m.sr * 2.4)), b = c.createBuffer(1, n, m.sr), y = b.getChannelData(0), f = m.sr * 0.25; for (let i = 0; i < n; i++) y[i] = m.x[i] * Math.min(1, (n - i) / f, i / 64); this._scrBuf = b; }
      const s = c.createBufferSource(), g = c.createGain(); s.buffer = this._scrBuf; g.gain.value = 1.4 * SND.scream; s.connect(g); g.connect(this.selfMouth.in); s.start(t);
    }
    this.st.vocal = t; this.st.hush = t + 25;
  }
  /** Jaws shut, on air or on anything: teeth and bone, hard and dry (owner 2026-11-15: the bite "sounds like wet mud"; the old
   *  hybrid `clack` voice layered wetimp_/squish_ recordings, an octave down, under the teeth). Now: a puff of air pushed ahead of
   *  the jaw, a sharp broadband crack, the weight of skull and mouth in 300-1500 Hz through broad low-Q resonances (no held pitch),
   *  a short hollow of the mouth cavity, a bone_ recording snipped to its first moments and a tick or two of teeth settling.
   *  Nothing wet or squelching; the bite that lands has its own crunch/tear. `force` (0..1, default 0.6) scales weight and level. */
  clack(dist, force = 0.6) {
    if (!this._ok()) return; const F = clamp(force, 0.1, 1);
    const p = this._where(dist, 'head'), L = this._L(), d = Math.hypot(p.x - L.x, p.y - L.y, p.z - L.z), h = this.sim ? this.sim.head.pos : null;
    const near = !h || Math.hypot(p.x - h.x, p.y - h.y, p.z - h.z) < 3, em = near ? this.headHit : this._free(this.creaturePool, 3);      // teeth meeting: an impact, so neither delayed nor opening the jaw (it is the jaw closing)
    const at = Math.max(this.ctx.currentTime + 0.06, this._arrive(d)), dest = em.in || em, R = this.R, side = this._jit(0.06), G = 2 * SND.clack * (0.7 + 0.5 * F) * this._db(1.5);
    if (near) { em.place(p.x, p.y, p.z, at); em.set(d, this.st.occ, at); } else this._place(em, p, at);
    this.st.vocal = this.ctx.currentTime; const room = this.voices < (this.low ? 14 : 32) - 6;
    const B = (dt, dur, type, f, q, g, atk = 0.002) => this._burst(dest, at + dt, dur, type, f, q, g, atk);
    B(-0.05, 0.055, 'bandpass', 1700 * side, 0.6, 0.22 * G, 0.045);                                  // air shoved ahead of the closing jaw, cut off by the hit
    B(0, 0.012, 'highpass', 1800, 0.7, 1.0 * G, 0.0008);                                              // the crack: teeth meeting
    B(0, 0.035, 'bandpass', 2600 * side, 0.9, 0.7 * G, 0.001);
    B(0.001, 0.06, 'bandpass', 520 * side * (1.1 - 0.2 * F), 0.8, (1.4 + 0.8 * F) * G, 0.0015);       // skull and jaw mass, where a phone can say it
    B(0.001, 0.08, 'bandpass', 880 * side, 0.9, 1.6 * G, 0.0015);
    B(0.002, 0.05, 'bandpass', 1350 * side, 1.0, 1.0 * G, 0.0015);
    B(0.004, 0.11, 'bandpass', 400 * side, 2.2, 1.0 * G * (0.6 + 0.6 * F), 0.003);                    // the mouth as a hollow box, short, broad
    B(0.004, 0.08, 'bandpass', 760 * side, 2.2, 0.8 * G, 0.003);
    if (room) { const k = 1 + Math.floor(R() * 2); for (let i = 0; i < k; i++) B(0.006 + 0.03 * R(), 0.012, 'highpass', 2500 + 2500 * R(), 0.7, (0.3 + 0.3 * R()) * G, 0.0008); }   // the rows settle on each other
    const bn = this._clipNames('bone_'); if (bn.length && room) this._snip(this._bagPick('clackbone', bn), dest, at, 0.12, 0.92 + 0.2 * R(), 0.9 * G, 300, 6000);
  }
  crunch(dist) { this._voice('crunch', dist, SND.crunch * this._db(2), this._jit(0.06)); }
  tear(dist) { this._voice('tear', dist, SND.tear * this._db(2), this._jit(0.06)); }
  /** Breath: called every frame (level = chest expansion, dist = to the head). Also runs the per-frame update. */
  breath(level, dist) { this.src = null; this._frame(level, dist); }      // the per-frame voices (sniff, rumble, gestures) are placed at the head, never at the last event main.js set

  // ---------------------------------------------------------------- the world and you
  setRain(k) { this.rainLevel = k; }
  hiss(level) { this.hissLevel = level; if (this.hissL && this.ctx) this.hissL.g.gain.setTargetAtTime(this.on ? level * 1.2 : 0, this.ctx.currentTime, 0.1); }
  /** Thunder, `delay` seconds after the flash: the delay says how far, which says how it sounds. */
  thunder(delay, gain = 1) {
    if (!this._ok()) return;
    const c = this.ctx, key = delay < 1.3 ? 'thunder_near' : delay < 2.4 ? 'thunder_mid' : 'thunder_far', b = this._buf(key); if (!b) return;
    const s = c.createBufferSource(); s.buffer = b; s.playbackRate.value = this._jit(0.05);
    const pan = c.createStereoPanner ? c.createStereoPanner() : null, g = c.createGain(), lv = { thunder_near: 0.85, thunder_mid: 0.65, thunder_far: 0.45 }[key] * gain * this._db(2);
    g.gain.value = lv; const sg = c.createGain(); sg.gain.value = 0.35 * lv;
    if (pan) { pan.pan.value = (this.R() * 2 - 1) * 0.6; s.connect(pan); pan.connect(g); } else s.connect(g);
    g.connect(this.ambOut); g.connect(sg); sg.connect(this.sendAmb);
    this.voices++; s.onended = () => { this.voices--; try { s.disconnect(); g.disconnect(); sg.disconnect(); } catch {} };
    s.start(c.currentTime + delay); this.st.hush = Math.max(this.st.hush, c.currentTime + delay + 8);
  }
  _at(dist) { return this.ctx.currentTime + Math.min(dist / 343, 1); }
  _fx(key, dist, gain, rate = this._jit(0.05), pool = this.pool, prefer = 'any') {
    if (!this._ok()) return; const p = this._where(dist, prefer), L = this._L(), d = Math.hypot(p.x - L.x, p.y - L.y, p.z - L.z), em = this._free(pool, 1.5), at = this._arrive(d);
    this._place(em, p, at); this._play(key, em, at, gain, rate, 1);
  }
  thud(gain = 1) { this._fx('thud', undefined, (0.3 + 0.7 * clamp(gain, 0, 1)) * this._db(2), this._jit(0.08)); }      // (was min(1, 0.7 + gain): a far or tiny impact was still 70%)
  /** What a thrown stone struck, from where the sim says it struck (terrain only: the sim's impact event carries no material).
   *  Off the ground and next to an obstacle: a trunk (timber), a rock outcrop (rock), or a structure wall/post (its `mat` tag from paddock.js:
   *  timber, steel, container, concrete/block). On the ground: water, mud/marsh, gravel, rock, a structure's floor, else earth. */
  _hitSurface(x, y, z) {
    const T = this.terrain, out = { m: 'ground' }; if (!T || !T.height) return out;
    const MAT = { timber: 'timber', wood: 'timber', steel: 'steel', container: 'container', concrete: 'concrete', block: 'concrete', brick: 'concrete', stone: 'concrete', hay: 'soft' };
    try {
      if (y - T.height(x, z) > 0.3 && T.obstaclesNear) {
        let best = null, bd = 0.7;
        for (const o of T.obstaclesNear(x, z, 3)) { const top = o.top ?? T.height(o.x, o.z) + o.h; if (y > top + 0.4) continue; const gap = Math.abs(Math.hypot(x - o.x, z - o.z) - o.r); if (gap < bd) { bd = gap; best = o; } }
        if (best) {
          if (best.kind === 'tree') return { m: 'timber', tree: 1 };
          if (best.kind === 'wall') {
            const S = (T.structures || []).concat(T.solids || []).find((s) => s.id === best.sid); let mat = S && S.mat, sg = best.seg;
            if (S && S.walls && sg) { const w = S.walls.find((q) => q.ax === sg.ax && q.az === sg.az && q.bx === sg.bx && q.bz === sg.bz); if (w && w.mat) mat = w.mat; }
            return { m: MAT[mat] || 'concrete' };
          }
          return { m: 'rock' };
        }
      }
      const sf = T.surfaceAt ? T.surfaceAt(x, z) : 'grass';
      if (sf === 'water') return { m: 'water' }; if (sf === 'mud' || sf === 'marsh') return { m: 'mud' };
      const S = T.insideStructure && T.insideStructure(x, z, y); if (S) return { m: S.mat === 'timber' || S.mat === 'hay' ? 'ground' : 'concrete', floor: 1 };
      if (sf === 'rock') return { m: 'rock', ground: 1 }; if (sf === 'gravel') return { m: 'gravel', ground: 1 };
      if (sf === 'forest') return { m: 'ground', leaf: 1 };
    } catch {}
    return out;
  }
  /** A decaying sine (a body mode): from f0 falling to f1 over the first 40 ms, then ringing out with time constant tau. Never left running. */
  _tone(dest, at, f0, f1, tau, gain, atk = 0.002) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(f0, at); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + 0.04);
    g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(gain, at + atk); g.gain.setTargetAtTime(0.0001, at + atk, tau);
    o.connect(g); g.connect(dest); o.start(at); o.stop(at + atk + tau * 6 + 0.02); this.voices++; o.onended = () => { this.voices--; try { o.disconnect(); g.disconnect(); } catch {} };
  }
  /** A stone landing (see out/audio/ROCKS.md). Synthesised per hit from what it struck and how fast: a noise click on every hit, then a short body that
   *  depends on the material (thud / clack / knock / clang with rattle / plop / splat), then, on hard ground, a few quiet skitter ticks.
   *  `ev` is the sim's impact event ({ x, y, z, speed, first }); a stone hitting the animal is a different event (`smack`). */
  stoneHit(dist, ev) {
    if (!this._ok()) return;
    const e = ev || this.src, p = this._where(dist, 'any'), L = this._L(), d = Math.hypot(p.x - L.x, p.y - L.y, p.z - L.z), em = this._free(this.pool, 1.2), at = this._arrive(d);
    this._place(em, p, at);
    const c = this.ctx, R = this.R, dest = em.in, t0 = Math.max(c.currentTime, at), S = this._hitSurface(p.x, p.y, p.z), m = S.m;
    const spd = e && e.speed !== undefined ? e.speed : 6, v = clamp((spd - 1.1) / 11, 0, 1), damp = clamp(this.rainLevel || 0, 0, 1);
    const lv = 0.6 * (0.18 + 0.82 * Math.pow(v, 0.8)) * this._db(2.5), br = (0.7 + 0.5 * v) * (1 - 0.2 * damp) * this._jit(0.12), far = 1 - 0.6 * sstep(20, 110, d), pv = this._jit(0.1);
    const room = this.voices < (this.low ? 14 : 32) - 4, B = (dur, type, f, q, g, atk = 0.002, dt = 0) => this._burst(dest, t0 + dt, dur, type, f, q, g, atk);
    const clip = (pre, len, rate, g, hp, lp, dt = 0) => { const n = this._bagPick('stone_' + pre, this._clipNames(pre)); if (n) this._snip(n, dest, t0 + dt, len, rate, g, hp, lp, R() * 0.02); };
    // the click: a few ms of broadband noise on every hit; softer and duller on soft ground, brighter on stone, and fading with distance
    const hardM = m === 'rock' || m === 'concrete' || m === 'gravel', metal = m === 'steel' || m === 'container', soft = m === 'ground' || m === 'mud' || m === 'water' || m === 'soft';
    if (m !== 'water' && m !== 'mud') B(0.006 + 0.004 * R(), 'highpass', (soft ? 1800 : hardM ? 3200 : 2400) * br * far * pv, 0.7, lv * (soft ? 0.14 : 0.35) * far, 0.0008);
    if (m === 'ground' || m === 'soft') {
      // a dull thud: low-passed noise burst and a very short low thump, no ring
      B(0.05 + 0.03 * R(), 'lowpass', (320 + 160 * R()) * br * pv * (m === 'soft' ? 0.7 : 1), 0.7, lv * 0.9, 0.003);
      this._tone(dest, t0, (105 + 30 * R()) * pv, 48 * pv, 0.016 + 0.006 * R(), lv * 0.75, 0.002);
      if (S.leaf || (m === 'ground' && R() < 0.35)) clip('crimp_', 0.07, 0.9 + 0.3 * R(), lv * 0.2 * far, 400, 2200, 0.004);
    } else if (m === 'rock' || m === 'concrete' || m === 'gravel') {
      // a hard clack: band-passed noise, 1.5-4 kHz, gone in 15-35 ms; a second, offset band so it is not one pitch; a little body underneath
      const cf = (m === 'concrete' ? 1500 + 1500 * R() : 2000 + 2000 * R()) * br * far * pv;
      B(m === 'concrete' ? 0.035 : 0.022, 'bandpass', cf, 1.1 + R() * 0.6, lv * 1.0, 0.0012);
      B(0.015 + 0.01 * R(), 'bandpass', cf * (1.55 + 0.5 * R()), 1.3, lv * 0.55, 0.001, 0.0015 + 0.003 * R());
      B(0.03, 'lowpass', 700 * pv, 0.7, lv * 0.35, 0.002);
      if (m === 'concrete') this._tone(dest, t0, (150 + 60 * R()) * pv, 100 * pv, 0.012, lv * 0.3, 0.002);
      if (m === 'gravel' && room) for (let k = 0, n = 2 + Math.floor(R() * 3); k < n; k++) B(0.012, 'highpass', 2500 + R() * 2500, 0.7, lv * (0.1 + 0.15 * R()) * far, 0.001, 0.01 + R() * 0.1);
      if (m === 'rock' && v > 0.45 && room) clip('bone_', 0.045, 1.5 + 0.5 * R(), lv * 0.16 * far, 900, 4500);
    } else if (m === 'timber') {
      // a woody knock: three inharmonic modes at a few hundred Hz, heavily damped (tau 8-20 ms, gone well inside 80 ms), over a noisy tick
      const f0 = (S.tree ? 130 : 210) * (1 + 0.5 * R()) * pv;
      this._tone(dest, t0, f0 * 1.06, f0, 0.018, lv * 0.7, 0.0015); this._tone(dest, t0, f0 * (2.32 + 0.2 * R()), f0 * (2.32 + 0.2 * R()) * 0.97, 0.012, lv * 0.4, 0.001);
      if (room) this._tone(dest, t0, f0 * (3.85 + 0.3 * R()), f0 * 3.7, 0.008, lv * 0.22, 0.001);
      B(0.03, 'bandpass', 900 * br * pv, 1.0, lv * 0.45, 0.002); if (v > 0.45 && room) clip('bone_', 0.05, 1.1 + 0.4 * R(), lv * 0.14 * far, 500, 3000);
    } else if (metal) {
      // a clang: inharmonic modes, each doubled with a slight detune (beating), ringing 0.1-0.25 s, plus a rattle of the sheet; never one clean tone
      const cont = m === 'container', f0 = (cont ? 150 + 90 * R() : 380 + 260 * R()) * pv, tau = (cont ? 0.12 + 0.1 * R() : 0.05 + 0.06 * R()) * (0.6 + 0.5 * v), n = this.low || !room ? 3 : 5;
      const ratio = [1, 1.59 + 0.1 * R(), 2.14 + 0.15 * R(), 2.76 + 0.2 * R(), 3.61 + 0.25 * R()], amp = [1, 0.7, 0.5, 0.35, 0.22];
      for (let k = 0; k < n; k++) { const f = Math.min(f0 * ratio[k], 3200), t = tau / (1 + 0.45 * k), g = lv * 0.5 * amp[k] * (k > 1 ? far : 1); this._tone(dest, t0, f, f * 0.995, t, g, 0.001); if (k < 3 && !this.low && room) this._tone(dest, t0, f * (1.007 + 0.012 * R()), f * 1.003, t * 0.9, g * 0.7, 0.001); }
      B(0.04, 'bandpass', 3200 * br * far * pv, 0.9, lv * 0.45, 0.001);
      if (room) for (let k = 0, nr = 3 + Math.floor(R() * 3 + 2 * v); k < nr; k++) B(0.01 + 0.012 * R(), 'bandpass', (2200 + R() * 2600) * far, 1.5, lv * (0.14 - 0.016 * k) * far, 0.001, 0.015 + k * (0.02 + 0.015 * R()));
    } else if (m === 'water') {
      // a plop: a rising bubble tone, the lip of the splash, a little low body; no click
      const bf = (320 + 380 * R()) * pv;
      const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(bf, t0); o.frequency.exponentialRampToValueAtTime(bf * 2.3, t0 + 0.04); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(lv * 0.5, t0 + 0.004); g.gain.setTargetAtTime(0.0001, t0 + 0.004, 0.02);
      o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + 0.2); this.voices++; o.onended = () => { this.voices--; try { o.disconnect(); g.disconnect(); } catch {} };
      B(0.12 + 0.1 * v, 'bandpass', 1400 * br * pv, 0.7, lv * 0.45, 0.008); B(0.08, 'lowpass', 400, 0.7, lv * 0.5, 0.004);
      if (room && v > 0.3) this._tone(dest, t0 + 0.05 + 0.04 * R(), bf * 1.4, bf * 2.6, 0.015, lv * 0.2, 0.003);
    } else if (m === 'mud') {
      // a splat: a short wet snip (squish/mud recording), a low-passed slap and a very short low thump; nothing rings
      B(0.09, 'bandpass', 750 * pv, 1.2, lv * 0.45, 0.006); B(0.07, 'lowpass', 500, 0.7, lv * 0.8, 0.003);
      this._tone(dest, t0, 90 * pv, 45, 0.02, lv * 0.6, 0.002);
      const sq = this._bagPick('stone_wet', [...this._clipNames('squish_'), ...this._clipNames('mud_')]); if (sq) this._snip(sq, dest, t0 + 0.004, 0.12 + 0.06 * v, (1.0 + 0.2 * R()) * pv, lv * 0.4 * far, 150, 3200, R() * 0.1);
    }
    // skitter: a first strike on hard ground leaves one to three quieter little hops at shortening intervals (the sim adds its own later bounces)
    if (e && e.first && room && spd > 3 && hardM && (S.ground || S.floor)) {
      const n = spd > 10 ? 3 : spd > 6 ? 2 : 1; let tt = 0.07 + 0.05 * R(), g = 0.4;
      for (let k = 0; k < n; k++) { const f = (m === 'concrete' ? 1800 : 2600 + 1200 * R()) * br * far * this._jit(0.2); B(0.012 + 0.008 * R(), 'bandpass', f, 1.2, lv * g * 0.5 * far, 0.001, tt); tt += (0.07 + 0.04 * R()) * Math.pow(0.7, k + 1); g *= 0.6; }
    }
  }
  smack(dist) { this._fx('smack', dist, 0.9 * this._db(2), this._jit(0.08)); }
  alarm(dist) { this._fx('alarm', dist, 0.5 * this._db(2), this._jit(0.06), this.ambPool); }
  flurry(dist) { this._fx('flurry', dist, 0.6 * this._db(2), this._jit(0.08), this.ambPool); this.st && (this.st.hush = Math.max(this.st.hush, this.ctx.currentTime + 15)); }
  /** Your footstep; `surface` is terrain.surfaceAt under you (water and mud splash, gravel and rock are brighter, forest floor duller). */
  // (NOTES4: was the `step_wet` bank take, a resonant band and four bubbles normalised loud, on EVERY step whenever it rained, at
  //  up to full gain running: 13 dB over a running animal at 12 m above 100 Hz, and "cartoonish sucking mud". Now built per step:
  //  a short dull footfall; the surface only colours it; a small soft squelch only on mud, marsh or water, and not on every step.)
  step(gain, surface = 'grass') {
    if (!this._ok()) return;
    const c = this.ctx, R = this.R, dest = this.self.in || this.self, t0 = c.currentTime + 0.003, g = clamp(Math.pow(Math.max(gain, 0) / 0.55, 0.6), 0.2, 1.2);      // (a walk ~5 dB under a run, not 8: still heard over a quiet bed)
    const foot = (this._sf = (this._sf || 0) ^ 1), side = foot ? 1.04 : 0.96, damp = clamp(this.rainLevel || 0, 0, 1);
    const wet = surface === 'water' ? 1 : surface === 'mud' ? 0.8 : surface === 'marsh' ? 0.6 : 0, hard = surface === 'rock' || surface === 'gravel', wood = surface === 'wood';
    const L = 0.42 * g * this._db(2.5), dark = 1 - 0.25 * damp;
    // heel then toe: two dull low-passed bursts, the second softer; wood boards give a short hollow knock instead of soil
    this._burst(dest, t0, 0.06 + 0.02 * R(), 'lowpass', (wood ? 420 : 300 + R() * 80) * side * dark, 0.7, L, 0.003);
    this._burst(dest, t0 + 0.03 + 0.02 * R(), 0.045, 'lowpass', (wood ? 380 : 260) * side * dark, 0.7, 0.45 * L * this._db(2), 0.003);
    if (wood) this._burst(dest, t0 + 0.001, 0.05, 'bandpass', (190 + R() * 50) * side, 4, 0.7 * L, 0.002);
    // the surface, quietly: litter and grass a soft scuff, track and stone a little grit, nothing wet on dry ground however it rains
    const sf = hard ? [2600, 1.0, 0.22] : wood ? [1500, 1.2, 0.12] : surface === 'forest' ? [900, 0.9, 0.2] : surface === 'track' ? [1800, 1.0, 0.18] : [1200, 0.9, 0.16];
    if (!wet || surface === 'marsh') this._burst(dest, t0 + 0.004 + 0.01 * R(), 0.05 + 0.04 * R(), 'bandpass', sf[0] * side * this._jit(0.15) * dark, sf[1], sf[2] * L * this._db(3), 0.006);
    if (hard && R() < 0.6) this._burst(dest, t0 + 0.01 + 0.04 * R(), 0.01, 'highpass', 3000 + 2000 * R(), 0.7, 0.08 * L, 0.001);
    // wet ground: at most a small, soft, low squelch on some steps (no bubbles, no resonant band, no suck as the foot comes out)
    if (wet && R() < 0.35 + 0.5 * wet) this._burst(dest, t0 + 0.012 + 0.015 * R(), 0.07 + 0.04 * R(), 'bandpass', (450 + R() * 250) * side, 1.2, 0.3 * wet * L * this._db(3), 0.012);
    if (surface === 'water') this._burst(dest, t0 + 0.005, 0.12, 'bandpass', 1300 * side * this._jit(0.1), 0.8, 0.35 * L, 0.008);
  }
  rustle(gain) { if (!this._ok()) return; this._play(this._wetGround() ? 'rustle_wet' : 'rustle', this.self, this.ctx.currentTime, Math.min(1, gain * 2.2) * this._db(2), this._jit(0.1), 0); }
  ignite() { if (!this._ok()) return; this._play('ignite', this.self, this.ctx.currentTime, 0.6, this._jit(0.05)); }
  /** You shouting. (Was a beep.) */
  ping() { if (!this._ok()) return; this._play('shout', this.self, this.ctx.currentTime, 0.4 * this._db(1), this._jit(0.04), 2); }

  // ---------------------------------------------------------------- per frame
  _listener(t) {
    const cam = this.cam, Lr = this.ctx.listener; if (!cam) return;
    const p = cam.position, q = cam.quaternion;
    // camera forward is -z, up is +y, rotated by the quaternion
    const fx = -2 * (q.x * q.z + q.w * q.y), fy = -2 * (q.y * q.z - q.w * q.x), fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
    const ux = 2 * (q.x * q.y - q.w * q.z), uy = 1 - 2 * (q.x * q.x + q.z * q.z), uz = 2 * (q.y * q.z + q.w * q.x);
    if (Lr.positionX) { const tc = 0.02; Lr.positionX.setTargetAtTime(p.x, t, tc); Lr.positionY.setTargetAtTime(p.y, t, tc); Lr.positionZ.setTargetAtTime(p.z, t, tc); Lr.forwardX.setTargetAtTime(fx, t, tc); Lr.forwardY.setTargetAtTime(fy, t, tc); Lr.forwardZ.setTargetAtTime(fz, t, tc); Lr.upX.setTargetAtTime(ux, t, tc); Lr.upY.setTargetAtTime(uy, t, tc); Lr.upZ.setTargetAtTime(uz, t, tc); }
    else { Lr.setPosition(p.x, p.y, p.z); Lr.setOrientation(fx, fy, fz, ux, uy, uz); }
  }
  /** Its head (snout, skull, jaw) meeting something solid (rex.js event {type:'contact', part, surface, force (closing m/s), x,y,z}).
   *  What it sounds like comes from what the thing is made of (the structure there: timber/hay a hollow knock, steel/container a
   *  short dull clang, concrete/block/rock a hard click), how hard from the closing speed: a feel along a wall is a soft scrape. */
  contact(e = {}, dist) {
    if (!this._ok()) return; if (e.type === 'contact') { const big = e.part === 'torso' || e.part === 'hips' || (e.force ?? 0) > 2.5; if (this.ctx.currentTime - (this._contactT ?? -9) < 0.15 && !(big && !this._contactBig)) return; this._contactT = this.ctx.currentTime; this._contactBig = big; }
    const h = this.sim && this.sim.head ? this.sim.head.pos : null, x = e.x ?? (h ? h.x : 0), y = e.y ?? (h ? h.y : 0), z = e.z ?? (h ? h.z : 0);
    const L = this._L(), d = dist ?? Math.hypot(x - L.x, y - L.y, z - L.z), T = this.terrain;
    let mat = e.mat || null; if (!mat && T) { let bd = 1e9; for (const S of T.structures || []) { const dd = Math.hypot(S.cx - x, S.cz - z) - Math.max(S.hw, S.hd); if (dd < bd && dd < 3) { bd = dd; mat = S.mat; } } }
    const kind = /steel|container|fence|glass/.test(mat || '') ? 'metal' : /concrete|block|rock|pipe|stone/.test(mat || '') || e.surface === 'rock' ? 'hard' : mat ? 'wood' : 'soft';
    const f = clamp((e.force ?? 0.4) / 1.5, 0.12, 1), em = this.headHit, at = Math.max(this.ctx.currentTime, this._arrive(d)), c = this.ctx, R = this.R, dest = em.in;
    em.place(x, y, z, at); em.set(d, this.st.occ, at);
    const g = (0.15 + 0.55 * f) * SND.crash * this._db(2), side = this._jit(0.06);
    // a hard hit, or any hit of the trunk or hips: the weight of the animal landing on the thing (owner 2026-11-15: the crash was "a
    // humorous light bonk like a wooden spoon tapping a saucepan, not at all appropriate for a multi ton animal crashing into a
    // shipping container"). A low body boom always; then what the thing itself does: a container booms and rattles, boards crack.
    const trunk = e.part === 'torso' || e.part === 'hips', hv = e.force ?? 0;
    if (trunk || hv > 2.5) {
      const F = clamp((hv + (trunk ? 2.5 : 0)) / 9, 0.2, 1), G = (0.55 + 0.9 * F) * SND.crash * this._db(2);
      this._burst(dest, at, 0.42, 'lowpass', 78 * side, 0.8, 1.9 * G, 0.008);                 // the mass arriving
      this._burst(dest, at + 0.004, 0.16, 'lowpass', 210 * side, 0.7, 1.3 * G, 0.004);        // flesh and bone on it
      this._burst(dest, at + 0.01, 0.09, 'bandpass', 620 * side, 0.9, 0.5 * G, 0.003);
      // (owner 2026-11-15, on a phone: "still some xylophone sounding ones ... the timber one inaudible". Measured, test/crash_audio.py:
      //  the container was six ringing oscillators with nothing above 300 Hz but their thin upper partials, the barn all below
      //  300 Hz and 15 dB down. Now every material is struck noise, never a held pitch, with its weight in 300-1000 Hz where a
      //  small speaker can carry it.)
      if (kind === 'metal' || kind === 'wood') this._burst(dest, at + 0.002, 0.2, 'bandpass', 340 * side, 0.7, 1.5 * G, 0.004);        // the weight, where a phone can say it (concrete is left as it was: "the concrete one is good")
      const J = () => 0.88 + 0.24 * R();
      if (kind === 'metal') {
        // a steel box: wide dead booms (struck noise through broad resonances: no pitch to pick out), the slap of the panel,
        // then loose doors and lock rods chattering
        for (const [fq, q, len, k2] of [[66, 2.2, 0.6, 1.5], [104, 2.4, 0.5, 1.2], [168, 2.2, 0.42, 1.2], [270, 2, 0.34, 1.5], [430, 1.8, 0.26, 1.5], [690, 1.6, 0.2, 1.1]]) this._burst(dest, at + 0.003, len, 'bandpass', fq * side * J(), q, k2 * G, 0.005);
        this._burst(dest, at, 0.07, 'bandpass', 1150 * side, 0.5, 1.0 * G, 0.002);
        for (let i = 0; i < 5; i++) this._burst(dest, at + 0.05 + 0.09 * i * (0.7 + 0.6 * R()), 0.05 + 0.04 * R(), 'bandpass', (1300 + 2200 * R()) * side, 1, 0.42 * G * (1 - i / 6), 0.002);
      } else if (kind === 'wood') {
        // a timber wall: the hollow boom of the building, the whack and crack of boards taking it, splinters, a creak as it settles
        this._burst(dest, at, 0.26, 'bandpass', (140 + R() * 40) * side, 2, 2.4 * G, 0.004);
        this._burst(dest, at, 0.11, 'bandpass', 470 * side * J(), 1.1, 3.2 * G, 0.002);
        this._burst(dest, at + 0.004, 0.07, 'bandpass', 950 * side * J(), 0.9, 2.4 * G, 0.002);
        for (let i = 0; i < 6; i++) this._burst(dest, at + 0.012 + R() * 0.22, 0.03 + 0.03 * R(), 'bandpass', (1300 + R() * 1900) * side, 1.4, 1.3 * G * (1 - i / 9), 0.001);      // boards cracking
        this._burst(dest, at + 0.14, 0.3, 'bandpass', 620 * side * J(), 2.5, 0.5 * G, 0.06);
      } else {
        this._burst(dest, at, 0.05, 'bandpass', 1900 * side, 1.1, 0.4 * G, 0.002);
        this._burst(dest, at + 0.05, 0.3, 'bandpass', 900 * side, 0.5, 0.18 * G, 0.03);       // grit and rubble settling
      }
      if (F > 0.45 && this.ctx.currentTime - (this._gruntT ?? -9) > 1.2) { this._gruntT = this.ctx.currentTime; try { this._voice('snort', d, 0.55 * F * this._db(2), this._jit(0.06), 0.12, 2); } catch {} }      // the breath knocked out of it
      return;
    }
    if (f < 0.25) { this._burst(dest, at, 0.18, 'bandpass', (kind === 'metal' ? 2200 : kind === 'hard' ? 1800 : 900) * side, 0.9, 0.25 * g, 0.03); return; }      // a soft scrape along it
    this._burst(dest, at, 0.08, 'lowpass', (kind === 'wood' ? 450 : 300) * side, 0.7, 0.9 * g, 0.003);
    if (kind === 'wood') this._burst(dest, at + 0.002, 0.07, 'bandpass', (170 + R() * 60) * side, 5, 1.6 * g, 0.002);      // hollow boards
    if (kind === 'hard') this._burst(dest, at, 0.025, 'bandpass', 2400 * side, 1.2, 0.5 * g, 0.001);
    if (kind === 'metal') { this._burst(dest, at, 0.12, 'bandpass', 430 * side * (0.85 + 0.3 * R()), 2.2, 1.3 * g, 0.003); this._burst(dest, at + 0.002, 0.07, 'bandpass', 1200 * side * (0.85 + 0.3 * R()), 1.8, 0.6 * g, 0.002); }      // a dull clank (it was three sine partials: a chime)
  }
  /** jaw-from-voice: how far a mouth is open is carried by the sound's spectrum, not its loudness. A shut or nearly shut mouth gives a dark, throaty sound (growl,
   *  rumble: little above ~450 Hz); an open one lets the upper band out (roar, scream). So `mouthOpen` = level of the high band (450 Hz to 3.5 kHz) x a ramp on the
   *  tilt (high over low band, dB, smoothed 80 ms) x a damping where the tilt is flat or rising (breath: noise through the nose, mouth shut), followed 40 ms up and
   *  180 ms down so it does not chatter at a roar's tremolo. `mouthFlutter`: the low band's fast variation, the tremble of a dark sound (capped in jawvoice.js).
   *  `noseOpen`: hiss-band energy while the mouth is shut. All 0 when sound is off or the context is not running. */
  _mouthStep() {
    const M = this._M, c = this.ctx; if (!M || !this.anL) return;
    if (!this._ok()) { this.mouthOpen = this.mouthFast = this.mouthFlutter = this.noseOpen = 0; M.v = M.n = M.lf = M.ls = M.sL = M.sH = 0; M.t = null; return; }
    const t = c.currentTime, dt = M.t === null ? 1 / 60 : t - M.t; if (dt < 0.002) return; M.t = t; const k = (tau) => 1 - Math.exp(-Math.min(dt, 0.1) / tau);
    const rms = (an, buf) => { an.getFloatTimeDomainData(buf); let e = 0; for (let i = 0; i < buf.length; i++) e += buf[i] * buf[i]; return Math.sqrt(e / buf.length); };
    const lvl = (r, lo, hi) => clamp((20 * Math.log10(r + 1e-9) - lo) / (hi - lo), 0, 1);
    const rL = rms(this.anL, M.bL), rH = rms(this.anH, M.bH), rN = rms(this.anN, M.bN), eL = rL * rL, eH = rH * rH; M.sL += (eL - M.sL) * k(0.08); M.sH += (eH - M.sH) * k(0.08); const bright = 10 * Math.log10((M.sH + 1e-12) / (M.sL + 1e-12));      // bright: the tilt, dB of the high band over the low
    const x = Math.pow(lvl(rH, MOUTH.hiFloorDb, MOUTH.hiFullDb), MOUTH.pow) * sstep(MOUTH.t0, MOUTH.t1, bright) * (1 - MOUTH.air * sstep(MOUTH.a0, MOUTH.a1, bright)), xn = lvl(rN, MOUTH.noseFloorDb, MOUTH.noseFullDb), xl = lvl(rL, MOUTH.loFloorDb, MOUTH.loFullDb);
    M.dbL = 20 * Math.log10(rL + 1e-9); M.dbH = 20 * Math.log10(rH + 1e-9); M.dbN = 20 * Math.log10(rN + 1e-9); M.bright = bright;      // (raw levels, for test/jaw_audio.py)
    M.v += (x - M.v) * k(x > M.v ? MOUTH.atk : MOUTH.rel); M.n += (xn * (1 - M.v) - M.n) * k(xn > M.n ? MOUTH.atk : MOUTH.rel);
    M.lf += (xl - M.lf) * k(MOUTH.fast); M.ls += (xl - M.ls) * k(MOUTH.slow);
    this.mouthOpen = M.v; this.mouthFlutter = (M.lf - M.ls); this.mouthFast = clamp(M.v + this.mouthFlutter, 0, 1); this.noseOpen = M.n;
  }
  _frame() {
    if (!this.ctx || !this.st) return;
    this._mouthStep();
    const c = this.ctx, t = c.currentTime, S = this.st, dt = clamp(t - S.t, 0, 0.25); S.t = t;
    // a new touch of its head on something solid (rex.js resets headTouch.kn at each contact event): heard even where nothing routes
    // the event here; one routed through contact(e) in the same moment is not doubled
    { const C = this.sim && this.sim.headTouch; if (C && typeof C.kn === 'number') { if (C.kn < (this._ckn ?? 99) - 0.02 && t - (this._contactT ?? -9) > 0.2) { this._contactT = t; this._contactBig = false; this.contact({ force: clamp((this.sim.headPress || 0) * 0.5, 0.2, 2), part: C.part }); } this._ckn = C.kn; } }
    if (this._bedsDirty) this._beds();
    else if (!this._allBuf) { this._allBuf = true; conv: for (const k in this.bank) for (const v of this.bank[k]) if (!v.buf) { v.buf = this._toBuf(v); v.ch = null; this._allBuf = false; break conv; } }
    S.frameT += dt; if (S.frameT < (this.low ? 1 / 20 : 1 / 40)) return; const fdt = S.frameT; S.frameT = 0;
    this._listener(t);
    const sim = this.sim, L = this._L(), on = this.on, R = this.R;
    if (sim) {
      // the head follows the animal; occlusion for it is refreshed a few times a second
      const h = sim.head.pos, d = Math.hypot(h.x - L.x, h.y - L.y, h.z - L.z);
      S.occT -= fdt; if (S.occT <= 0) { S.occT = this.low ? 0.25 : 0.12; S.occ = this.occlusion(L, h); }
      this.head.place(h.x, h.y, h.z, t, 0.03); this.head.set(d, S.occ, t, 0.06);
      // breathing: air in (higher, quieter) for the first 40% of the cycle, out (lower, fuller) for the rest
      if (this.breathL) {
        const ph = sim.breathPhase || 0, ex = sim.exertion || 0, inh = ph < 0.4, flow = inh ? Math.sin(Math.PI * ph / 0.4) : Math.sin(Math.PI * (ph - 0.4) / 0.6);
        const a = on ? 0.09 * SND.breath * (1 + 1.6 * ex) * Math.pow(flow, 1.5) * (inh ? 0.55 : 1) : 0, B = this.breathL;
        B.gn.gain.setTargetAtTime(a, t, 0.04); B.gc.gain.setTargetAtTime(inh ? 0.3 * a : 1.2 * a, t, 0.05); B.nb.frequency.setTargetAtTime(inh ? 1050 : 520, t, 0.08);
      }
      // gestures the body makes that the events do not voice
      const act = sim.act;
      if (act && act !== S.act && on) {
        if (act.kind === 'strike') this.scream();
        else if (act.kind === 'rumble') this._voice('rumble', d, 0.45 * this._db(2), this._jit(0.06), 0, 2);
        else if (act.kind === 'sniffAir') this._voice('sniff', d, 0.7, this._jit(0.05), 0, 1);
        else if (act.kind === 'gulp') this._voice('gulp', d, 0.6, this._jit(0.06), 0, 1);
        else if (act.kind === 'startle' && act.crash) { /* reeling off what it ran into: contact() has already knocked the breath out of it */ }
        else if (act.kind === 'startle') this._voice('snort', d, 0.8, this._jit(0.06), 0, 1);
        else if (act.kind === 'shake') this._voice('whoosh', d, 0.7, this._jit(0.1) * 0.8, 0, 1);
      }
      S.act = act;
      // close mouth detail while it feeds: chewing, tongue and saliva, now and then (only audible near; the distance filter does the rest)
      if (on && d < 28 && this.mind && (this.mind.label === 'feed' || (this.mind.beh && this.mind.beh.name === 'feed'))) { S.chewNext = (S.chewNext ?? 0) - fdt; if (S.chewNext <= 0) { S.chewNext = 0.7 + R() * 1.3; if (t - S.vocal > 0.5) this._voice('chew', d, 0.7 * this._db(2), this._jit(0.07), 0, 1); } }
      const bn = this.mind && this.mind.beh ? this.mind.beh.name : null;
      // idle voices (sniffing, the low rumble of a watching animal) belong to something you can see: in front of you, or close. Behind you, or far off and
      // out of frame, they are an unexplained noise (this was a loud bellow-recording rumble every 10-24 s from up to 80 m in any tense state: out/audio/ODDSOUNDS.md)
      const q = this.cam ? this.cam.quaternion : null, hd = Math.max(d, 1e-3);
      const seen = d < 10 || !q || ((-2 * (q.x * q.z + q.w * q.y)) * (h.x - L.x) + (-2 * (q.y * q.z - q.w * q.x)) * (h.y - L.y) - (1 - 2 * (q.x * q.x + q.y * q.y)) * (h.z - L.z)) / hd > 0.3;
      S.tenseT = bn && TENSE.has(bn) ? (S.tenseT || 0) + fdt : 0;
      if (bn && SNIFFY.has(bn) && d < 18 && seen) { S.sniffNext -= fdt; if (S.sniffNext <= 0) { S.sniffNext = 9 + R() * 10; if (t - S.vocal > 1.5) this._voice('sniff', d, 0.17 * this._db(2), this._jit(0.05), 0, 1); } }      // owner 2026-11-15: at 0.5 every 3-8 s from 13 m it read as 'scratching then a metallic bang' with no visible cause
      if (bn && TENSE.has(bn) && d < 45 && seen && S.tenseT > 8) { S.rumbleNext -= fdt; if (S.rumbleNext <= 0) { S.rumbleNext = 16 + R() * 20; if (t - S.vocal > 6) this._voice('rumble', d, 0.26 * this._db(2), this._jit(0.06), 0, 1); } }
    }
    // ambience, ten times a second
    S.ambT -= fdt;
    if (S.ambT <= 0) {
      S.ambT = 0.1; const T = this.terrain, inS = T && T.insideStructure ? T.insideStructure(L.x, L.z, L.y) : null, roofed = !!(inS && (inS.roof || inS.kind === 'cleft'));
      S.inside = inS; S.roofed = roofed;
      const r = on ? this.rainLevel : 0, cover = T && T.coverAt ? T.coverAt(L.x, L.z) : 0;
      let hard = 0; if (T) for (const s of T.structures || []) { const dd = Math.hypot(s.cx - L.x, s.cz - L.z) - Math.max(s.hw, s.hd); hard = Math.max(hard, 1 - sstep(1, 12, dd)); }
      const Ly = this.layers, P = (l, v) => { if (l) l.g.gain.setTargetAtTime(v, t, 0.5); };
      // rain was too loud before: the wash is a soft bed; detail comes from the near layers
      P(Ly.wash, 0.10 * r); P(Ly.leaf, 0.06 * r * (0.5 + cover)); P(Ly.ground, 0.07 * r); P(Ly.hard, 0.06 * r * hard);
      P(Ly.roof, roofed && inS.kind !== 'cleft' ? 0.3 * r : 0);
      this.ambLP.frequency.setTargetAtTime(roofed ? 700 : inS && inS.kind !== 'tower' ? 6000 : 18000, t, 0.15);
      if (this.gIn) { this.gIn.gain.setTargetAtTime(roofed ? 0.8 : 0, t, 0.2); this.gOut.gain.setTargetAtTime(roofed ? 0.3 : 1, t, 0.2); }
      // wind: a gust every few seconds, harder in the storm
      const storm = this.world ? this.world.moodKey === 'storm' : r > 0.5;
      S.gustNext -= 0.1; if (S.gustNext <= 0) { const big = R() < 0.5; S.gustTo = big ? (0.5 + 0.5 * R()) * (storm ? 1 : 0.6) : 0.12 + 0.15 * R(); S.gustNext = big ? 1.5 + R() * 3 : 3 + R() * 7; }
      S.gust += (S.gustTo - S.gust) * (S.gustTo > S.gust ? 0.08 : 0.04);
      const W = Ly.wind, gu = S.gust;
      if (W) { W.g.gain.setTargetAtTime(on ? (storm ? 0.09 : 0.07) * (0.25 + gu) : 0, t, 0.3); W.bp.forEach((f, k) => f.frequency.setTargetAtTime(170 + 520 * gu + 60 * k, t, 0.4)); }
      P(Ly.leaves, on ? (storm ? 0.07 : 0.06) * gu * gu * (0.4 + cover) : 0);
      // birds, when nothing has frightened them; few in the rain
      const mood = this.world ? this.world.moodKey : 'storm';
      S.birdNext -= 0.1;
      if (S.birdNext <= 0) {
        S.birdNext = mood === 'storm' ? 10 + R() * 20 : mood === 'dusk' ? 3 + R() * 7 : 2 + R() * 5;
        if (t > S.hush && on && !roofed) { const a = R() * 6.283, dd = 18 + R() * 60, p = { x: L.x + Math.sin(a) * dd, y: L.y + 5 + R() * 10, z: L.z + Math.cos(a) * dd }, em = this._free(this.ambPool, 2); this._place(em, p, t); this._play('bird', em, t, (mood === 'storm' ? 0.35 : 0.6) * this._db(3), this._jit(0.12), 0); }
      }
      // far-off thunder that comes with no flash you can see
      if (storm && r > 0.5) { S.rollNext -= 0.1; if (S.rollNext <= 0) { S.rollNext = 25 + R() * 45; this.thunder(3 + R(), 0.5); } }
    }
  }
}
