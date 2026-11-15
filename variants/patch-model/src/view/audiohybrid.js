// Hybrid voices: real recordings (dist/audio/*.mp3, see dist/audio/CREDITS.md) layered, pitched down, time-bent and
// blended with the synthesised voices from audiosynth.js, in the manner of film sound design: a big cat and an alligator
// under an elephant's trumpet make a roar that no single animal could. Runs in the same Worker as the synthesis
// (`hybridLib` is stringified, like `synthLib`) and in Node for the offline tests.
//
// Every recipe is (seed, sr, opts) -> { sr, ch: [Float32Array] } like a synth generator, so takes differ with the seed:
// which recording, which part of it, how far down it is pitched, how it glides, what it is layered with. A recipe
// throws 'miss:<clip>' when its main recording has not been supplied; the caller then falls back to the pure synth.
//
// Levels: each recipe is trimmed so its loudness matches the synth voice it replaces (LEVEL below, measured with
// `node test/audio_bank.mjs --level`), so the mix balance between voices, ambience and footfalls is unchanged.
/** What each recipe needs, as clip-name prefixes (any one present is enough); shared with audio.js so it can decide before queuing. */
export const HYB_NEEDS = { roar: ['lion_'], growl: ['camel_'], rumble: ['alli_bell'], huff: ['hsnort_', 'hblow_', 'elblow_'], sniff: ['creat_', 'alli_hiss'], clack: ['bone_', 'wetimp_'], crunch: ['bone_', 'eatcr_'], tear: ['meat_rip_'], gulp: ['squish_', 'wetimp_'], chew: ['chew_', 'squish_'], smack: ['crimp_', 'wetimp_'], thud: ['wetimp_', 'mud_'], footfall: ['mud_', 'crimp_'], shout: ['hey_'] };
export function hybridLib(L) {
  const { gens, util: U } = L;
  const { TAU, rng, clamp, sstep, Biq, filt, normalize, dcBlock, fades, smooth, white, brownGen } = U;
  const clips = Object.create(null);
  const setClip = (name, sr, x) => { clips[name] = { sr, x, dur: x.length / sr }; };
  const has = (n) => !!clips[n];
  const names = (pre) => Object.keys(clips).filter((k) => k.startsWith(pre));
  const need = (...n) => { for (const k of n) if (!clips[k]) throw new Error('miss:' + k); };
  const onsets = Object.create(null);
  /** Where a clip really starts sounding (first sample within 20 dB of its peak), in seconds, less a hair. */
  const onset = (name) => { if (onsets[name] !== undefined) return onsets[name]; const c = clips[name], x = c.x; let pk = 0; for (let i = 0; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i])); let i = 0; while (i < x.length && Math.abs(x[i]) < pk * 0.1) i++; return (onsets[name] = Math.max(0, i / c.sr - 0.002)); };
  const pick = (r, list) => list[Math.floor(r() * list.length)];

  // 4-point Catmull-Rom read of x at fractional position p
  const cubic = (x, p) => {
    const n = x.length, i = Math.floor(p), f = p - i;
    if (i < 1 || i + 2 >= n) { const a = i < 0 ? 0 : i >= n ? n - 1 : i, b = a + 1 >= n ? n - 1 : a + 1; return x[a] + (x[b] - x[a]) * f; }
    const a = x[i - 1], b = x[i], c = x[i + 1], d = x[i + 2];
    return b + 0.5 * f * (c - a + f * (2 * a - 5 * b + 4 * c - d + f * (3 * (b - c) + d - a)));
  };

  /** Mix a stretch of a recording into y: [from, from+len] s of the clip, read `semi` semitones away (pitch and speed together,
   * as with tape), with an optional glide(u) in semitones over the stretch (u 0..1), starting at `at` s. Returns the output length in s. */
  function put(y, sr, name, o = {}) {
    const c = clips[name]; if (!c) return 0;
    const from = clamp(o.from ?? 0, 0, Math.max(0, c.dur - 0.05)), len = Math.min(o.len ?? 1e9, c.dur - from), x = c.x;
    const base = Math.pow(2, (o.semi ?? 0) / 12), gl = o.glide || null, k = c.sr / sr, p0 = from * c.sr, span = len * c.sr;
    let n = 0, p = 0; while (p < span && n < 40 * sr) { p += k * base * (gl ? Math.pow(2, gl(p / span) / 12) : 1); n++; }
    const i0 = Math.floor((o.at ?? 0) * sr); n = Math.min(n, y.length - i0); if (n < 8) return 0;
    const t = new Float32Array(n); p = 0;
    for (let i = 0; i < n; i++) { t[i] = cubic(x, p0 + p); p += k * base * (gl ? Math.pow(2, gl(p / span) / 12) : 1); }
    for (const f of o.f || []) filt(t, f[0], f[1], f[2] ?? 0.7, sr, f[3] || 0);
    const fi = Math.floor((o.fi ?? 0.012) * sr), fo = Math.floor((o.fo ?? 0.06) * sr), g = o.gain ?? 1, env = o.env;
    for (let i = 0; i < n; i++) { let a = g; if (i < fi) a *= 0.5 - 0.5 * Math.cos(Math.PI * i / fi); if (n - 1 - i < fo) a *= 0.5 - 0.5 * Math.cos(Math.PI * (n - 1 - i) / fo); if (env) a *= env(i / n, i / sr); y[i0 + i] += a * t[i]; }
    return n / sr;
  }
  /** A synthesised voice mixed in as a layer (lowpassed, so it supplies the body and the recording the character). */
  function synthLayer(y, sr, kind, seed, o = {}) {
    const s = gens[kind](seed, sr, o.o || {}).ch[0], t = Float32Array.from(s);
    for (const f of o.f || []) filt(t, f[0], f[1], f[2] ?? 0.7, sr, f[3] || 0);
    const i0 = Math.floor((o.at ?? 0) * sr), g = o.gain ?? 1; for (let i = 0; i < t.length && i0 + i < y.length; i++) y[i0 + i] += g * t[i];
  }

  // Loudness of a voice: RMS of its loudest 400 ms (after a 60 Hz high-pass), the nearest cheap thing to the momentary loudness the ear and the tests go by
  function level(x0, sr = 32000) {
    const x = Float32Array.from(x0); filt(x, 'hp', 60, 0.7, sr); const w = Math.floor(0.4 * sr), h = Math.floor(0.05 * sr); let best = 0;
    for (let i = 0; i < Math.max(1, x.length - w + 1); i += h) { let s = 0, m = Math.min(w, x.length - i); for (let j = 0; j < m; j++) s += x[i + j] * x[i + j]; best = Math.max(best, s / w); }
    return Math.sqrt(best);
  }
  /** Soft-knee limiter: untouched below 60% of the ceiling, bent smoothly towards it above, never past it. */
  function limit(y, ceil) { const kn = 0.6 * ceil, w = ceil - kn; for (let i = 0; i < y.length; i++) { const a = Math.abs(y[i]); if (a > kn) y[i] = (y[i] < 0 ? -1 : 1) * (kn + w * Math.tanh((a - kn) / w)); } }
  // Target loudness per voice (the level() of the synth voice it replaces, averaged over seeds), set by `node test/audio_bank.mjs --level`
  const LEVEL = { roar: 0.26, growl: 0.331, rumble: 0.23, huff: 0.07, snort: 0.055, sniff: 0.091, clack: 0.11, crunch: 0.13, shout: 0.262, whistle: 0.2, tear: 0.12, gulp: 0.14, chew: 0.07, smack: 0.12, thud: 0.12, foot_walk: 0.096, foot_run: 0.114 };
  function finish(y, sr, kind, o = {}) {
    dcBlock(y, sr, o.dc ?? 15); const ref = LEVEL[kind], lv = level(y, sr); if (ref && lv > 1e-6) { const k = ref / lv; for (let i = 0; i < y.length; i++) y[i] *= k; }
    limit(y, 0.95); fades(y, sr, 0.003, o.fo ?? 0.08);
    let e = y.length; while (e > 1 && Math.abs(y[e - 1]) < 1e-4) e--; return { sr, ch: [y.subarray(0, Math.min(y.length, e + 8))] };
  }
  /** Harmonic exciter: the part of y under `fc` driven hard into a saturator, its upper harmonics (above `hp`) added back: how a low roar gets a voice. */
  function exciter(y, sr, fc, drive, mix, hp) { const t = Float32Array.from(y); filt(t, 'lp', fc, 0.7, sr); let m = 1e-6; for (let i = 0; i < t.length; i++) m = Math.max(m, Math.abs(t[i])); const d = drive / m; for (let i = 0; i < t.length; i++) t[i] = Math.tanh(t[i] * d); filt(t, 'hp', hp, 0.7, sr); filt(t, 'lp', 5000, 0.7, sr); for (let i = 0; i < y.length; i++) y[i] += mix * 0.35 * t[i]; }
  const sat = (y, d) => { const t = Math.tanh(d); for (let i = 0; i < y.length; i++) y[i] = Math.tanh(y[i] * d) / t; return y; };

  // ---------------------------------------------------------------- recipes
  /** The roar: a lion's, two octaves of tape down, over an alligator's bellow, with an elephant's scream through the middle of it. */
  function roar(seed, sr) {
    const r = rng(seed), lions = names('lion_'); if (!lions.length) throw new Error('miss:lion_');
    const D = r.range(3.3, 4.3), y = new Float32Array(Math.floor((D + 1.2) * sr));
    const L1 = pick(r, lions), L2 = pick(r, lions.length > 1 ? lions.filter((k) => k !== L1) : lions);
    const semi = -r.range(5, 8.5), sag = r.range(1.5, 3.5);
    // 1. the body: a lion roar slowed to a larger animal's, ending a little lower than it began
    const d1 = put(y, sr, L1, { at: 0.02, semi, glide: (u) => 1.8 * Math.exp(-u * 7) - sag * u * u, gain: 0.7, f: [['hp', 42, 0.7]], fi: 0.03, fo: 0.4 });
    // 2. bite: a second lion, only a fifth down, its top end alone, a hair late
    put(y, sr, L2, { at: 0.04 + r() * 0.08, semi: -r.range(2, 5), glide: (u) => -1.5 * u, gain: 1.0, f: [['hp', 250, 0.7], ['lp', 8000, 0.7]], fi: 0.03, fo: 0.3 });
    const L3 = pick(r, lions); put(y, sr, L3, { at: r() * 0.2, semi: -r.range(0, 2.5), gain: 0.28, f: [['hp', 900, 0.7], ['lp', 9000, 0.7]], fi: 0.03, fo: 0.25 });
    // 3. the throat: an alligator's bellow, more than an octave down, for the growl underneath
    const ab = names('alli_bell'); let from = 0;
    if (ab.length) { const a = pick(r, ab); from = r() * Math.max(0, clips[a].dur - 1.9); put(y, sr, a, { at: 0.0, from, len: 1.8, semi: -r.range(11, 17), gain: 0.6, f: [['lp', 900, 0.7], ['hp', 28, 0.7]], fi: 0.12, fo: 0.5 }); }
    // 4. the scream: an elephant's trumpet, down by a fifth or so, pushed in at the peak of the phrase
    if (has('eleph_trumpet')) put(y, sr, 'eleph_trumpet', { at: Math.min(d1 * 0.28, 1.0) * (0.6 + 0.8 * r()), semi: -r.range(3, 6.5), gain: 1.0, f: [['hp', 160, 0.7], ['lp', 6000, 0.7]], fi: 0.08, fo: 0.35 });
    // 5. a great ape's roar and a second lion-sized voice for texture, a little different each time
    const ex = ['gorilla_roar', 'creat_roar_02', 'creat_roar_05'].filter(has); if (ex.length) put(y, sr, pick(r, ex), { at: 0.1 + r() * 0.3, semi: -r.range(7, 13), gain: 0.7, f: [['lp', 3500, 0.7], ['hp', 60, 0.7]], fo: 0.3 });
    // 6. the synthesised roar's chest and breath underneath, so the sub-bass and the exhale stay what they were
    synthLayer(y, sr, 'roar', seed + 5, { gain: 0.4, f: [['lp', 420, 0.7]] });
    // phrase, as the synthesised roar has it: a peak early, a sag, a second push, then a long fall into the breath
    const tPk = r.range(0.4, 0.8), push = tPk + r.range(0.45, 0.7) * (D - tPk), swell = smooth(r, 2.2, sr);
    for (let i = 0; i < y.length; i++) { const t = i / sr; y[i] *= sstep(0, 0.2, t) * (0.4 + 0.6 * Math.exp(-Math.pow((t - tPk) / 0.5, 2)) + 0.45 * Math.exp(-Math.pow((t - push) / 0.35, 2))) * (1 + 0.1 * swell()) * (t > D - 0.9 ? Math.exp(-(t - D + 0.9) / 0.5) : 1); }
    exciter(y, sr, 300, 3.5, 1.3, 280); filt(y, 'lp', 6500, 0.6, sr);
    sat(y, 1.4); return finish(y, sr, 'roar', { fo: 0.12 });
  }

  /** Growl: a camel's groan down into the chest, chopped by a slow throat flutter, with a bear's and a jaguar's under and over it. */
  function growl(seed, sr) {
    if (!names('camel_').length) throw new Error('miss:camel_'); const r = rng(seed), D = r.range(2.1, 2.9), y = new Float32Array(Math.floor((D + 0.8) * sr));
    const cm = pick(r, names('camel_')), c = clips[cm], len = Math.min(1.2, c.dur - 0.4), semi = -r.range(14, 19);
    const ds = (u) => -2.2 * u;
    let t = 0; while (t < D - 0.5) { const l = r.range(0.9, 1.2); put(y, sr, cm, { at: t, from: 0.15 + r() * Math.max(0.01, c.dur - len - 0.3), len, semi, glide: ds, gain: 0.9, f: [['hp', 30, 0.7], ['lp', 1800, 0.7]], fi: 0.25, fo: 0.25 }); t += l * (len / (len * Math.pow(2, -semi / 12))) * 0.0 + len * Math.pow(2, -semi / 12) - 0.3; }
    const bears = names('bear_'); if (bears.length) put(y, sr, pick(r, bears), { at: r() * D * 0.3, semi: -r.range(6, 10), gain: 0.5, f: [['lp', 2500, 0.7], ['hp', 60, 0.7]], fi: 0.1, fo: 0.3 });
    if (has('jaguar_saw')) { const m = r.int(1, 2); for (let k = 0; k < m; k++) put(y, sr, 'jaguar_saw', { at: r.range(0.2, D - 0.9), from: r() < 0.5 ? 0.04 : 0.66, len: 0.45, semi: -r.range(11, 15), gain: 0.45, f: [['lp', 2500, 0.7]], fi: 0.04, fo: 0.15 }); }
    if (has('dog_grunt')) put(y, sr, 'dog_grunt', { at: r.range(0, 0.4), semi: -r.range(9, 13), gain: 0.35, f: [['lp', 2000, 0.7]] });
    synthLayer(y, sr, 'growl', seed + 3, { gain: 0.42, f: [['lp', 600, 0.7]] });
    // throat flutter: the amplitude is chopped at the rate of a big animal's vocal fry, irregularly
    const fl = smooth(r, 3, sr), wob = smooth(r, 0.7, sr); let ph = 0;
    const swells = [], m = r.int(2, 3); for (let k = 0; k < m; k++) swells.push([r.range(0.15, 0.85) * D, r.range(0.25, 0.5), r.range(0.6, 1)]);
    for (let i = 0; i < y.length; i++) { const tt = i / sr; ph += TAU * (19 + 5 * fl() + 3 * wob()) / sr; let a = 0.3; for (const [c0, s, h] of swells) a += h * Math.exp(-((tt - c0) * (tt - c0)) / (2 * s * s)); y[i] *= (0.4 + 0.6 * Math.max(0, Math.sin(ph))) * Math.min(1.2, a) * sstep(0, 0.2, tt) * (1 - sstep(D - 0.35, D + 0.3, tt)); }
    sat(y, 1.8); return finish(y, sr, 'growl', { fo: 0.15 });
  }

  /** Rumble: the bottom of an alligator's bellow (three octaves down) and the sub of a giant monster's roar, with the infrasonic synth under them. */
  function rumble(seed, sr) {
    if (!names('alli_bell').length) throw new Error('miss:alli_bell'); const r = rng(seed), D = r.range(2.8, 3.8), y = new Float32Array(Math.floor((D + 0.6) * sr));
    const ab = names('alli_bell'), a = pick(r, ab), semi = -r.range(21, 25);
    put(y, sr, a, { at: 0.05, from: r() * Math.max(0, clips[a].dur - 0.9), len: 0.8, semi, gain: 1.2, f: [['lp', 500, 0.7], ['hp', 14, 0.7]], fi: 0.4, fo: 0.9 });
    if (has('monster_roar')) put(y, sr, 'monster_roar', { at: r.range(0.1, 0.5), from: r() * 3.5, len: 3, semi: -r.range(2, 6), gain: 0.45, f: [['lp', 300, 0.7]], fi: 0.5, fo: 0.9 });
    put(y, sr, pick(r, ab), { at: r.range(0.6, 1.6), from: r() * 1, len: 0.8, semi: semi + 3, gain: 0.6, f: [['lp', 450, 0.7], ['hp', 14, 0.7]], fi: 0.4, fo: 0.8 });
    synthLayer(y, sr, 'rumble', seed + 9, { gain: 0.65, f: [['lp', 320, 0.7]] });
    const am = smooth(r, 4, sr), pulses = []; for (let k = 0, m = r.int(2, 3); k < m; k++) pulses.push([(k + 0.5 + 0.2 * r.gauss()) * D / m, r.range(0.2, 0.35), r.range(0.6, 1)]);
    for (let i = 0; i < y.length; i++) { const t = i / sr; let pe = 0; for (const [c0, w, h] of pulses) pe += h * Math.exp(-Math.pow((t - c0) / w, 2)); y[i] *= (0.18 + pe) * sstep(0, 0.3, t) * (1 - sstep(D - 0.6, D + 0.3, t)) * (1 + 0.2 * am()); }
    return finish(y, sr, 'rumble', { dc: 8, fo: 0.2 });
  }

  /** Huff: a real exhale, the recording itself as the sound (as the lion is the roar): a horse's nostril snort or an elephant's trunk
   * blow, slowed a few semitones to a larger animal's, with a second breath of another animal low under it for size; a gentle
   * swell and a long release, no saturation. `{ short: true }` is the snort: a shorter, firmer breath, still air and not a hit.
   * Clips: hsnort_* (horse snorts), hblow_* (horse fluttering blows), elblow_* (elephant trunk exhales); see dist/audio/CREDITS.md. */
  const BREATH = () => ['hsnort_', 'hblow_', 'elblow_'].flatMap(names);
  const HUFF_SEMI = { hsnort_1: [3.5, 6.5], hsnort_2: [1, 3], hsnort_4: [2, 4.5], elblow_1: [1, 3], elblow_2: [1, 3] };
  function huff(seed, sr, o = {}) {
    const all = BREATH(); if (!all.length) throw new Error('miss:hsnort_');
    const r = rng(seed), short = !!o.short, y = new Float32Array(Math.floor((short ? 1.0 : 1.7) * sr));
    // the main breath: long huffs from the big snorts and the elephant, snorts from the firmer, fluttering ones
    const pool = (short ? ['hsnort_4', 'hblow_1', 'hblow_3', 'hblow_4', 'hsnort_1', 'hsnort_2'] : ['hsnort_1', 'hsnort_2', 'elblow_1', 'elblow_2', 'hblow_2', 'hblow_4']).filter(has);
    const main = pick(r, pool.length ? pool : all), el = main.startsWith('elblow'), c = clips[main], on = Math.max(0, onset(main) - 0.03);
    // how far down: the bright horse snorts most, the already deep takes (hsnort_2, the elephant) only a little
    const [s0, s1] = HUFF_SEMI[main] || [3, 5.5], semi = -r.range(s0, s1) * (short ? 0.7 : 1), sag = -r.range(0.4, 1.4);   // the breath sags in pitch as the lungs empty
    const len = Math.min(c.dur - on, main === 'hsnort_1' ? 0.66 - on : 9, (short ? r.range(0.42, 0.55) : r.range(0.7, 0.95)) * (el ? 1.25 : 1));   // hsnort_1 has a hoof tick at 0.75 s
    const A = short ? r.range(0.035, 0.055) : r.range(0.07, 0.11);                    // swell time of the breath itself
    const d1 = put(y, sr, main, { at: 0.0, from: on, len, semi, glide: (u) => sag * u, gain: 1.0, f: [['hp', 80, 0.7], ['lp', el ? 2600 : 3600, 0.7]], fi: A, fo: short ? 0.12 : 0.3 });
    // a second, deeper breath from another animal under it: the size, not the character
    const under = all.filter((k) => k !== main && (el ? !k.startsWith('elblow') : true)), u2 = under.length ? pick(r, under) : null;
    if (u2 && r() < (short ? 0.5 : 0.85)) { const o2 = Math.max(0, onset(u2) - 0.02); put(y, sr, u2, { at: r.range(0.005, 0.03), from: o2, len: Math.min(clips[u2].dur - o2, len * 0.9), semi: semi - r.range(4, 7), gain: r.range(0.3, 0.45), f: [['hp', 50, 0.7], ['lp', 900, 0.7]], fi: A * 1.3, fo: 0.25 }); }
    // the synthesised huff only as a faint chest under it (its own attack is hidden by the swell below)
    if (!short) synthLayer(y, sr, 'huff', seed + 1, { gain: 0.12, o: { short }, f: [['lp', 220, 0.7]] });
    // swell and release: up over A (no transient), a held body, a long fall, a little different each time
    const D = d1, rel = D * (short ? r.range(0.45, 0.6) : r.range(0.5, 0.7)), hold = D - rel, w = smooth(r, 6, sr);
    for (let i = 0; i < y.length; i++) { const t = i / sr; y[i] *= sstep(0, A * 1.4, t) * (t < hold ? 1 : Math.pow(1 - sstep(hold, D + 0.05, t), 1.3)) * (1 + 0.08 * w()); }
    return finish(y, sr, short ? 'snort' : 'huff', { fo: 0.06 });
  }

  /** Sniffing: short sharp intakes, each a slice of breath or nose noise at its own pitch, over the synthesised nostril resonance, ending in a snort. */
  function sniff(seed, sr) {
    const srcs = ['creat_breath', 'creat_breath_2', 'creat_nose', 'alli_hiss'].filter(has); if (!srcs.length) throw new Error('miss:breath');
    const r = rng(seed), m = r.int(3, 6), sp = r.range(0.17, 0.27), D = m * sp + 0.9, y = new Float32Array(Math.floor(D * sr));
    let t0 = 0.02;
    for (let k = 0; k < m; k++) {
      const s = pick(r, srcs), c = clips[s], d = r.range(0.09, 0.15), a = (k === 0 ? 0.7 : 1) * r.range(0.6, 1);
      put(y, sr, s, { at: t0, from: onset(s) + r() * Math.max(0, c.dur - onset(s) - 0.2), len: r.range(0.1, 0.17), semi: -r.range(1, 4), gain: 0.85 * a, env: (u) => Math.pow(clamp(u / 0.8, 0, 1), 1.4), f: [['hp', 300, 0.7], ['lp', 2600, 0.7]], fi: 0.03, fo: 0.03 });
      void d; t0 += sp * r.range(0.85, 1.15);
    }
    synthLayer(y, sr, 'sniff', seed + 2, { gain: 0.55 });
    if (r() < 0.2 && BREATH().length) { const s = huff(seed + 77, sr, { short: true }).ch[0], i0 = Math.floor((t0 + 0.05) * sr); for (let i = 0; i < s.length && i0 + i < y.length; i++) y[i0 + i] += 0.3 * s[i]; }      // the closing snort was the 'bang': rare and soft now
    return finish(y, sr, 'sniff', { dc: 20, fo: 0.05 });
  }

  // ---- mouth and body sounds. Everything here is built the way a foley artist would: a low thump for the mass, a wet slap for
  // the soft parts, a hard click for teeth and bone, saliva and air around them, every layer pitched down to the size of the animal.
  /** A pitched-down sine thump (sub weight): from f0 falling to f1, decaying with tau, starting at `at` s. */
  function thump(y, sr, at, f0, f1, tau, g) { const i0 = Math.floor(at * sr); let ph = 0; for (let i = 0; i0 + i < y.length && i < 0.6 * sr; i++) { const t = i / sr; ph += TAU * (f1 + (f0 - f1) * Math.exp(-t / 0.035)) / sr; y[i0 + i] += g * Math.exp(-t / tau) * sstep(0, 0.003, t) * Math.sin(ph); } }
  /** One layer from a randomly chosen clip with the given name prefix(es), if any such clip was supplied. */
  const layer = (y, sr, r, pre, o) => { const l = [].concat(pre).flatMap(names); if (!l.length) return 0; const n = pick(r, l); return put(y, sr, n, { from: onset(n) + (o.skip || 0), ...o }); };
  const AIR = ['creat_breath', 'creat_breath_2', 'alli_hiss', 'creat_nose'];

  /** Jaws shut: air pushed ahead of the closing jaw, a low thump of the skull and mass, a wet clop of the soft mouth, a bright
   * crack of teeth meeting bone (not all at once), spit; each take with its own recordings, depth and timing. */
  function clack(seed, sr) {
    if (!names('bone_').length && !names('wetimp_').length) throw new Error('miss:bone_');
    const r = rng(seed), y = new Float32Array(Math.floor(1.2 * sr)), hit = 0.06, size = r.range(0, 1);
    // 1. air: the jaw shoves it out of the way, rising to the hit, a hard stop at the strike
    const ai = AIR.filter(has); if (ai.length) { const a = pick(r, ai); put(y, sr, a, { at: 0, from: onset(a) + r() * 0.1, len: hit + 0.03, semi: -r.range(2, 6), gain: 0.6, env: (u, t) => Math.pow(clamp(t / hit, 0, 1), 2) * (1 - sstep(hit - 0.002, hit + 0.006, t)), f: [['hp', 260, 0.7], ['lp', 3800, 0.7]], fi: 0.004, fo: 0.004 }); }
    // 2. the mass: sub thump and the soft, wet body of the mouth, an octave down
    thump(y, sr, hit - 0.002, 150 - 40 * size, 46 - 8 * size, 0.07 + 0.05 * size, 0.85);
    layer(y, sr, r, 'wetimp_', { at: hit - 0.005, len: 0.5, semi: -r.range(7, 12), gain: 1.1, f: [['hp', 40, 0.7], ['lp', 1700, 0.7]], fi: 0.001, fo: 0.25 });
    // 3. the clop: a crunchy impact for the flesh and cartilage slamming together, down a fifth
    layer(y, sr, r, ['crimp_', 'wetimp_'], { at: hit - 0.003, len: 0.3, semi: -r.range(3, 8), gain: 0.85, f: [['hp', 110, 0.7], ['lp', 4200, 0.7]], fi: 0.001, fo: 0.12 });
    // 4. teeth: bone cracks, the first sharp, the rest strewn a few ms after as the rows settle on each other
    layer(y, sr, r, 'bone_', { at: hit - 0.002, len: r.range(0.1, 0.16), semi: -r.range(2, 6), gain: 0.65, f: [['hp', 320, 0.7]], fi: 0.0008, fo: 0.07 });
    for (let k = 0, m = r.int(1, 3); k < m; k++) layer(y, sr, r, ['bone_', 'eatcr_'], { at: hit + r.range(0.006, 0.035), len: 0.06, semi: -r.range(0, 5), gain: r.range(0.18, 0.38), f: [['hp', 700, 0.7]], fi: 0.0008, fo: 0.03 });
    // 5. spit: a smear of saliva as the lips part, a hair later
    if (r() < 0.7) layer(y, sr, r, 'squish_', { at: hit + r.range(0.03, 0.09), len: 0.4, semi: -r.range(3, 9), gain: r.range(0.18, 0.4), f: [['hp', 200, 0.7], ['lp', 5000, 0.7]], fi: 0.004, fo: 0.1 });
    // 6. now and then the head recoils and the jaw bounces, a smaller second knock
    if (r() < 0.3) { const t2 = hit + r.range(0.12, 0.2); thump(y, sr, t2, 90, 45, 0.05, 0.25); layer(y, sr, r, 'bone_', { at: t2, len: 0.06, semi: -r.range(4, 8), gain: 0.2, f: [['hp', 300, 0.7]], fi: 0.001, fo: 0.03 }); }
    synthLayer(y, sr, 'clack', seed + 4, { gain: 0.25, f: [['hp', 400, 0.7]] });
    return finish(y, sr, 'clack', { dc: 25, fo: 0.2 });
  }

  /** A bite into a body: the jaws sinking (thump and wet impact), bones and cartilage cracking one after another, meat parting, spit. */
  function crunch(seed, sr) {
    if (!names('bone_').length && !names('eatcr_').length) throw new Error('miss:bone_');
    const r = rng(seed), y = new Float32Array(Math.floor(1.5 * sr)), t0 = 0.03; synthLayer(y, sr, 'crunch', seed + 6, { gain: 0.35 });
    thump(y, sr, t0, 120, 44, 0.09, 0.7);
    layer(y, sr, r, ['crimp_', 'wetimp_'], { at: t0, len: 0.5, semi: -r.range(4, 8), gain: 0.95, f: [['hp', 55, 0.7], ['lp', 4500, 0.7]], fi: 0.001, fo: 0.2 });
    layer(y, sr, r, 'wetimp_', { at: t0, len: 0.6, semi: -r.range(8, 12), gain: 0.7, f: [['lp', 1100, 0.7], ['hp', 35, 0.7]], fi: 0.001, fo: 0.3 });
    let t = t0 + 0.02; for (let k = 0, m = r.int(2, 5); k < m; k++, t += r.range(0.07, 0.2)) {
      const g = k ? r.range(0.4, 0.8) : 1;
      layer(y, sr, r, ['eatcr_', 'bone_'], { at: t, len: r.range(0.12, 0.25), semi: -r.range(3, 9), gain: g * 0.8, f: [['hp', 90, 0.7], ['lp', 6000, 0.7]], fi: 0.001, fo: 0.08 });
      if (r() < 0.6) layer(y, sr, r, 'bone_', { at: t + 0.004, len: 0.14, semi: -r.range(3, 8), gain: g * 0.5, f: [['hp', 150, 0.7]], fi: 0.001, fo: 0.07 });
    }
    layer(y, sr, r, 'meat_rip_', { at: t0 + 0.04, len: 0.6, semi: -r.range(4, 8), gain: 0.4, env: (u) => Math.sin(Math.PI * Math.min(1, u * 1.2)), f: [['hp', 70, 0.7]], fi: 0.01, fo: 0.2 });
    layer(y, sr, r, 'squish_', { at: t0 + r.range(0.08, 0.3), len: 0.5, semi: -r.range(4, 9), gain: r.range(0.25, 0.5), f: [['hp', 150, 0.7], ['lp', 5000, 0.7]], fi: 0.005, fo: 0.15 });
    return finish(y, sr, 'crunch', { dc: 20, fo: 0.2 });
  }

  /** Tearing meat: a recorded rip of meat from a carcass slowed to a larger mouth, grain on grain, with a low shudder of effort and a wet drop. */
  function tear(seed, sr) {
    if (!names('meat_rip_').length) throw new Error('miss:meat_rip_');
    const r = rng(seed), y = new Float32Array(Math.floor(2.2 * sr)), semi = -r.range(2, 6), d = layer(y, sr, r, 'meat_rip_', { at: 0.02, len: 1.05, semi, gain: 1.0, env: (u) => 0.35 + 0.65 * Math.sin(Math.PI * Math.pow(u, 0.7)), f: [['hp', 60, 0.7], ['lp', 7000, 0.7]], fi: 0.02, fo: 0.25 });
    const rip = 0.02 + d * r.range(0.55, 0.7);
    layer(y, sr, r, 'meat_rip_', { at: 0.05 + r() * 0.1, len: 0.8, semi: semi - r.range(4, 8), gain: 0.5, f: [['lp', 1200, 0.7], ['hp', 40, 0.7]], fi: 0.03, fo: 0.3 });
    thump(y, sr, rip, 100, 42, 0.12, 0.45);                                  // the release: the head rocks back
    layer(y, sr, r, ['crimp_', 'eatcr_'], { at: rip, len: 0.3, semi: -r.range(4, 9), gain: 0.5, f: [['hp', 100, 0.7], ['lp', 4500, 0.7]], fi: 0.001, fo: 0.12 });
    layer(y, sr, r, 'squish_', { at: rip + r.range(0.03, 0.12), len: 0.5, semi: -r.range(5, 10), gain: 0.4, f: [['hp', 150, 0.7], ['lp', 4500, 0.7]], fi: 0.004, fo: 0.15 });
    synthLayer(y, sr, 'tear', seed + 8, { gain: 0.3 });
    return finish(y, sr, 'tear', { dc: 20, fo: 0.25 });
  }

  /** Swallowing: a squelch of mouthful slowed to a throat's, a low glunk of muscle, saliva and a bubble of air. */
  function gulp(seed, sr) {
    if (!names('squish_').length && !names('wetimp_').length) throw new Error('miss:squish_');
    const r = rng(seed), y = new Float32Array(Math.floor(1.4 * sr)), go = r.range(0.02, 0.08);
    layer(y, sr, r, 'squish_', { at: go, len: 0.6, semi: -r.range(8, 13), gain: 1.0, f: [['hp', 50, 0.7], ['lp', 2600, 0.7]], fi: 0.01, fo: 0.3 });
    layer(y, sr, r, 'wetimp_', { at: go + 0.03, len: 0.5, semi: -r.range(9, 14), gain: 0.8, f: [['lp', 700, 0.7], ['hp', 30, 0.7]], fi: 0.003, fo: 0.3 });
    thump(y, sr, go + 0.02, r.range(75, 100), 38, 0.14, 0.7);
    layer(y, sr, r, 'squish_', { at: go + r.range(0.25, 0.4), len: 0.4, semi: -r.range(4, 8), gain: 0.35, f: [['hp', 200, 0.7], ['lp', 4000, 0.7]], fi: 0.004, fo: 0.15 });
    synthLayer(y, sr, 'gulp', seed + 5, { gain: 0.5, f: [['lp', 900, 0.7]] });
    return finish(y, sr, 'gulp', { dc: 20, fo: 0.25 });
  }

  /** Chewing and mouth noise when close: wet mastication, tongue and saliva, a click of teeth on something hard now and then. */
  function chew(seed, sr) {
    if (!names('chew_').length && !names('squish_').length) throw new Error('miss:chew_');
    const r = rng(seed), y = new Float32Array(Math.floor(1.5 * sr));
    layer(y, sr, r, 'chew_', { at: 0.0, len: 1.0, semi: -r.range(4, 9), gain: 0.9, env: (u) => Math.sin(Math.PI * Math.min(1, u * 1.1)), f: [['hp', 70, 0.7], ['lp', 4500, 0.7]], fi: 0.03, fo: 0.2, skip: r() * 0.05 });
    for (let k = 0, m = r.int(2, 4); k < m; k++) layer(y, sr, r, 'squish_', { at: r.range(0.05, 0.9), len: 0.35, semi: -r.range(3, 9), gain: r.range(0.2, 0.5), f: [['hp', 150, 0.7], ['lp', 4500, 0.7]], fi: 0.004, fo: 0.12 });
    for (let k = 0, m = r.int(1, 3); k < m; k++) { const t = r.range(0.08, 0.9); thump(y, sr, t, 100, 55, 0.04, 0.25); layer(y, sr, r, ['eatcr_', 'bone_'], { at: t, len: 0.1, semi: -r.range(5, 10), gain: r.range(0.2, 0.45), f: [['hp', 300, 0.7], ['lp', 5000, 0.7]], fi: 0.001, fo: 0.05 }); }
    return finish(y, sr, 'chew', { dc: 20, fo: 0.2 });
  }

  /** A stone (or anything small and hard) on hide: a leathery slap of skin on bone, a duller knock underneath, a bright tick of the stone itself. */
  function smack(seed, sr) {
    if (!names('crimp_').length && !names('wetimp_').length) throw new Error('miss:crimp_');
    const r = rng(seed), y = new Float32Array(Math.floor(0.9 * sr));
    synthLayer(y, sr, 'impact', seed + 2, { o: { kind: 'smack' }, gain: 0.35 });
    layer(y, sr, r, ['crimp_', 'wetimp_'], { at: 0, len: 0.35, semi: -r.range(1, 6), gain: 1.0, f: [['hp', 150, 0.7], ['lp', 4500, 0.7]], fi: 0.0008, fo: 0.12 });
    layer(y, sr, r, 'wetimp_', { at: 0.0, len: 0.4, semi: -r.range(7, 11), gain: 0.55, f: [['lp', 900, 0.7], ['hp', 40, 0.7]], fi: 0.001, fo: 0.2 });
    layer(y, sr, r, 'bone_', { at: 0.0, len: 0.08, semi: r.range(0, 4), gain: 0.3, f: [['hp', 800, 0.7]], fi: 0.0006, fo: 0.04 });
    thump(y, sr, 0.0, 120, 50, 0.06, 0.4);
    return finish(y, sr, 'smack', { dc: 25, fo: 0.15 });
  }

  /** A heavy body landing or being knocked down: sub thump, the wet slam of flesh on ground, ribs and cartilage creaking, a puff of earth. */
  function thudBody(seed, sr, o = {}) {
    if (!names('wetimp_').length && !names('mud_').length) throw new Error('miss:wetimp_');
    const r = rng(seed), y = new Float32Array(Math.floor(1.1 * sr));
    synthLayer(y, sr, 'impact', seed + 3, { o: { kind: 'thud', wet: 1 }, gain: 0.7, f: [['lp', 400, 0.7]] });
    layer(y, sr, r, 'wetimp_', { at: 0, len: 0.6, semi: -r.range(5, 10), gain: 1.0, f: [['hp', 35, 0.7], ['lp', 2200, 0.7]], fi: 0.002, fo: 0.3 });
    layer(y, sr, r, 'mud_', { at: 0.004, len: 0.5, semi: -r.range(3, 8), gain: 0.7, f: [['hp', 60, 0.7], ['lp', 3000, 0.7]], fi: 0.002, fo: 0.2 });
    layer(y, sr, r, ['crimp_', 'bone_'], { at: 0.01, len: 0.4, semi: -r.range(8, 14), gain: 0.6, f: [['lp', 1500, 0.7], ['hp', 50, 0.7]], fi: 0.001, fo: 0.2 });
    if (r() < 0.5) layer(y, sr, r, 'bone_', { at: 0.02 + r() * 0.05, len: 0.2, semi: -r.range(6, 11), gain: 0.35, f: [['hp', 150, 0.7], ['lp', 3000, 0.7]], fi: 0.001, fo: 0.1 });
    thump(y, sr, 0.0, 85, 36, 0.14, 0.7);
    return finish(y, sr, 'thud', { dc: 20, fo: 0.2 });
  }

  /** A footfall: the synthesised sub thump of the weight, with the foot's own sounds on it: a squelch or a crumble of ground,
   * the dry slap of the toes, claws on grit, so that near the foot it is more than a bass drum. */
  function footfall(seed, sr, o = {}) {
    if (!names('mud_').length && !names('crimp_').length) throw new Error('miss:mud_');
    const r = rng(seed), run = o.run ? 1 : 0, y = new Float32Array(Math.floor(1.4 * sr));
    synthLayer(y, sr, 'footfall', seed + 1, { o: { wet: o.wet ? 1 : 0, run }, gain: 0.8 });
    const k = run ? 1.25 : 1;
    if (o.wet) layer(y, sr, r, 'mud_', { at: 0.012, len: 0.6, semi: -r.range(2, 7), gain: 0.85 * k, f: [['hp', 70, 0.7], ['lp', 3800, 0.7]], fi: 0.003, fo: 0.25 });
    else layer(y, sr, r, 'crimp_', { at: 0.01, len: 0.35, semi: -r.range(9, 14), gain: 0.65 * k, f: [['hp', 70, 0.7], ['lp', 2600, 0.7]], fi: 0.002, fo: 0.15 });
    layer(y, sr, r, 'wetimp_', { at: 0.0, len: 0.35, semi: -r.range(10, 15), gain: 0.6 * k, f: [['lp', 800, 0.7], ['hp', 35, 0.7]], fi: 0.002, fo: 0.2 });
    layer(y, sr, r, ['crimp_', 'bone_'], { at: 0.045 + r() * 0.03, len: 0.12, semi: -r.range(5, 11), gain: 0.22 * k, f: [['hp', 500, 0.7], ['lp', 4500, 0.7]], fi: 0.001, fo: 0.06 });      // toes and claws settling
    return finish(y, sr, run ? 'foot_run' : 'foot_walk', { dc: 15, fo: 0.3 });
  }

  /** The player's "hey!": a recorded man's shout, each take at its own pitch (tape speed, so the vowel moves with it), trimmed and
   * leaned on differently; now and then the call is a sharp whistle instead (when those clips are present). */
  function shout(seed, sr) {
    need('hey_1'); const r = rng(seed), wh = names('whistle_'), y = new Float32Array(Math.floor(1.3 * sr));
    if (wh.length && r() < 0.3) {
      const w = pick(r, wh); put(y, sr, w, { at: 0.005, semi: r.range(-2, 3), gain: 1, f: [['hp', 500, 0.7]], fi: 0.003, fo: 0.03 });
      if (r() < 0.4) put(y, sr, pick(r, wh), { at: 0.26 + r() * 0.05, semi: r.range(-1, 4), gain: 0.85, f: [['hp', 500, 0.7]], fi: 0.003, fo: 0.03 });
      return finish(y, sr, 'whistle', { dc: 60, fo: 0.03 });
    }
    const c = clips.hey_1, on = onset('hey_1'), semi = r.range(-2.5, 3.5);
    put(y, sr, 'hey_1', { at: 0.0, from: on, len: c.dur - on, semi, glide: (u) => 1.2 * Math.sin(Math.PI * u) * (seed & 1 ? 1 : -0.6), gain: 1, f: [['hp', 110, 0.7]], fi: 0.002, fo: 0.08 });
    return finish(y, sr, 'shout', { dc: 60, fo: 0.08 });
  }

  const recipes = { roar, growl, rumble, huff, sniff, clack, crunch, tear, gulp, chew, smack, thud: thudBody, footfall, shout };
  return { setClip, has, recipes, level, make: (name, seed, sr, o) => recipes[name](seed, sr, o || {}) };
}
