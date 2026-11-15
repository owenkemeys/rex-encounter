// Offline sound synthesis: every sound in the game is built here, sample by sample, from noise, glottal pulses,
// resonators and filters. No Web Audio, no imports, no outer references: `synthLib` is stringified into a Worker
// so the generation runs off the main thread, and the same code runs in Node for the offline tests (test/audio_bank.mjs).
// Each generator is (seed, sr, opts) -> { sr, ch: [Float32Array, ...] }; a different seed gives a different take.
export function synthLib() {
  const TAU = Math.PI * 2;
  const rng = (seed) => {
    let a = (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) >>> 0;
    const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    r.range = (lo, hi) => lo + (hi - lo) * r();
    r.gauss = () => (r() + r() + r() + r() + r() + r() - 3) * 1.4142;
    r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
    return r;
  };
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
  const arr = (sec, sr) => new Float32Array(Math.max(1, Math.ceil(sec * sr)));

  // RBJ biquad with settable coefficients (time-varying when set() is called during a run)
  function Biq() {
    let b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return {
      set(type, f, q, sr, db = 0) {
        f = clamp(f, 5, sr * 0.45); const w = TAU * f / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q), A = Math.pow(10, db / 40);
        let B0, B1, B2, A0, A1, A2;
        if (type === 'lp') { B0 = (1 - cs) / 2; B1 = 1 - cs; B2 = B0; A0 = 1 + al; A1 = -2 * cs; A2 = 1 - al; }
        else if (type === 'hp') { B0 = (1 + cs) / 2; B1 = -(1 + cs); B2 = B0; A0 = 1 + al; A1 = -2 * cs; A2 = 1 - al; }
        else if (type === 'bp') { B0 = al; B1 = 0; B2 = -al; A0 = 1 + al; A1 = -2 * cs; A2 = 1 - al; }
        else if (type === 'pk') { B0 = 1 + al * A; B1 = -2 * cs; B2 = 1 - al * A; A0 = 1 + al / A; A1 = -2 * cs; A2 = 1 - al / A; }
        else { const s = 2 * Math.sqrt(A) * al; B0 = A * ((A + 1) - (A - 1) * cs + s); B1 = 2 * A * ((A - 1) - (A + 1) * cs); B2 = A * ((A + 1) - (A - 1) * cs - s); A0 = (A + 1) + (A - 1) * cs + s; A1 = -2 * ((A - 1) + (A + 1) * cs); A2 = (A + 1) + (A - 1) * cs - s; }      // low shelf
        b0 = B0 / A0; b1 = B1 / A0; b2 = B2 / A0; a1 = A1 / A0; a2 = A2 / A0; return this;
      },
      run(x) { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; },
    };
  }
  const filt = (x, type, f, q, sr, db) => { const b = Biq().set(type, f, q, sr, db); for (let i = 0; i < x.length; i++) x[i] = b.run(x[i]); return x; };
  // noises with roughly unit spread
  const pinkGen = (r) => { let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; return () => { const w = r() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; const p = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926; return p * 0.25; }; };
  const brownGen = (r) => { let b = 0; return () => { b = 0.985 * b + (r() * 2 - 1) * 0.3; return b; }; };
  const white = (r) => () => r() * 2 - 1;
  // smooth random control signal in [-1, 1], changing at about `rate` Hz (cosine-interpolated random points)
  const smooth = (r, rate, sr) => { let a = r() * 2 - 1, b = r() * 2 - 1, p = 0; const dp = rate / sr; return () => { p += dp; if (p >= 1) { p -= 1; a = b; b = r() * 2 - 1; } const u = 0.5 - 0.5 * Math.cos(Math.PI * p); return a + (b - a) * u; }; };
  const normalize = (chs, peak) => { let m = 1e-9; for (const c of chs) for (let i = 0; i < c.length; i++) m = Math.max(m, Math.abs(c[i])); const k = peak / m; for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= k; return chs; };
  const dcBlock = (x, sr, fc = 10) => { const R = Math.exp(-TAU * fc / sr); let px = 0, py = 0; for (let i = 0; i < x.length; i++) { const y = x[i] - px + R * py; px = x[i]; py = y; x[i] = y; } return x; };
  const fades = (x, sr, fi = 0.002, fo = 0.03) => { const a = Math.floor(fi * sr), b = Math.floor(fo * sr), n = x.length; for (let i = 0; i < a && i < n; i++) x[i] *= i / a; for (let i = 0; i < b && i < n; i++) x[n - 1 - i] *= i / b; return x; };
  const out = (sr, ...ch) => ({ sr, ch });
  // damped modes struck at sample i0: modes [[freq, tau, amp], ...]
  const modal = (y, i0, sr, modes, g = 1, r = null) => {
    for (const [f, tau, a] of modes) {
      const n = Math.min(y.length - i0, Math.ceil(tau * 7 * sr)), w = TAU * f / sr, d = Math.exp(-1 / (tau * sr)), ph = r ? r() * TAU : 0;
      let e = a * g; for (let j = 0; j < n; j++) { y[i0 + j] += e * Math.sin(w * j + ph) * Math.min(1, j / 3); e *= d; }
    }
  };
  // a water bubble's ring (Minnaert): a short sine whose pitch rises as it decays; the 'plink' of rain and wet ground
  const bubble = (y, i0, sr, f, tau, a) => {
    const n = Math.min(y.length - i0, Math.ceil(tau * 6 * sr)); let ph = 0;
    for (let j = 0; j < n; j++) { const t = j / sr; ph += TAU * f * (1 + 2.2 * t / (tau * 6)) / sr; y[i0 + j] += a * Math.exp(-t / tau) * Math.sin(ph) * Math.min(1, j / 4); }
  };
  // filtered noise burst with an envelope function env(t) over dur seconds
  const burst = (y, i0, sr, dur, env, filters, gen, g = 1) => {
    const bs = filters.map(([ty, f, q]) => Biq().set(ty, f, q, sr)), n = Math.min(y.length - i0, Math.ceil(dur * sr));
    for (let j = 0; j < n; j++) { let s = gen(); for (const b of bs) s = b.run(s); y[i0 + j] += g * env(j / sr) * s; }
  };

  // Glottal source: Rosenberg pulses with jitter, shimmer and period doubling (sub(i) in 0..1). Returns the flow derivative.
  function glottal(n, sr, f0At, r, o) {
    const d = new Float32Array(n), flow = new Float32Array(n);
    let i = 0, k = 0, prev = 0;
    while (i < n) {
      const s = o.sub ? o.sub(i) : 0;
      let T = (sr / Math.max(8, f0At(i))) * (1 + o.jit * r.gauss() * 0.5);
      T *= k & 1 ? 1 + 0.1 * s : 1 - 0.1 * s;
      const A = Math.max(0.1, 1 + o.shim * r.gauss() * 0.5) * (k & 1 ? 1 - 0.55 * s : 1);
      const oq = o.oq * (1 + 0.05 * r.gauss()), Tp = Math.max(2, T * oq * 0.68), Tn = Math.max(1, T * oq * 0.32);
      for (let j = 0; j < T && i < n; j++, i++) {
        const g = j < Tp ? 0.5 * (1 - Math.cos(Math.PI * j / Tp)) : j < Tp + Tn ? Math.cos(0.5 * Math.PI * (j - Tp) / Tn) : 0;
        flow[i] = g * A; d[i] = flow[i] - prev; prev = flow[i];
      }
      k++;
    }
    normalize([d], 1);
    return { d, flow };
  }
  // parallel formant bank, frequencies updated every 32 samples: fr(i) -> [[f, bw, gain], ...]
  function formants(x, sr, fr) {
    const n = x.length, y = new Float32Array(n); let cur = fr(0); const bs = cur.map(() => Biq());
    for (let i = 0; i < n; i++) {
      if ((i & 31) === 0) { cur = fr(i); for (let k = 0; k < bs.length; k++) bs[k].set('bp', cur[k][0], cur[k][0] / cur[k][1], sr); }
      let s = 0; for (let k = 0; k < bs.length; k++) s += cur[k][2] * bs[k].run(x[i]); y[i] = s;
    }
    return y;
  }
  const softclip = (x, drive) => { let m = 1e-9; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); const k = drive / m, t = Math.tanh(drive); for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * k) / t; return x; };

  // ---------------------------------------------------------------- the animal
  /** One footfall of an 8-tonne biped: sub-bass ground thump (heel, then toes), soil body, and the surface (mud or litter). */
  function footfall(seed, sr, o = {}) {
    const r = rng(seed), wet = o.wet ?? 1, run = o.run ?? 0, D = 1.25, y = arr(D, sr), n = y.length;
    const toeAt = run > 0.5 ? r.range(0.03, 0.05) : r.range(0.055, 0.095);
    for (const [at, k] of [[0, 1], [toeAt, r.range(0.35, 0.5)]]) {
      const i0 = Math.floor(at * sr), fA = r.range(50, 64) * (1 + 0.15 * run), fB = r.range(23, 30), tauF = r.range(0.045, 0.075), tauA = r.range(0.2, 0.3) * (1 - 0.3 * run) * (k < 1 ? 0.6 : 1), ra = r.range(1.5, 1.7);
      let p1 = 0, p2 = 0;
      for (let j = 0; i0 + j < n; j++) {
        const t = j / sr, f = fB + (fA - fB) * Math.exp(-t / tauF); p1 += TAU * f / sr; p2 += TAU * f * ra / sr;
        const a = sstep(0, 0.007, t) * Math.exp(-t / tauA); if (a < 1e-4 && t > 0.05) break;
        y[i0 + j] += k * a * (0.7 * Math.sin(p1) + 0.3 * Math.exp(-t / 0.05) * Math.sin(p2));
      }
      // the soil itself: a short low noise thud and a dull knock
      const br = brownGen(r);
      burst(y, i0, sr, 0.35, (t) => sstep(0, 0.002, t) * Math.exp(-t / (0.04 + 0.02 * (1 - run))), [['lp', r.range(240, 360) * (1 + 0.4 * run), 0.8]], br, 1.7 * k);
      modal(y, i0, sr, [[r.range(90, 130), 0.05, 0.8], [r.range(150, 210), 0.035, 0.9], [r.range(330, 480), 0.018, 0.55], [r.range(800, 1200), 0.006, 0.2 * (1 - 0.6 * wet)]], k * (0.8 + 0.4 * run), r);
    }
    if (wet > 0) {
      // squelch: the foot pressing water and mud out sideways, a bubbling down-sweep, then droplets falling back
      const bp = Biq(), w = white(r), gate = smooth(r, 90, sr), i0 = Math.floor(r.range(0.008, 0.02) * sr), f0 = r.range(1100, 1500);
      for (let j = 0; j < 0.32 * sr && i0 + j < n; j++) {
        const t = j / sr; if ((j & 31) === 0) bp.set('bp', f0 * Math.exp(-t / 0.12) + 320, 2.5, sr);
        y[i0 + j] += wet * 0.55 * (1 + 0.3 * run) * sstep(0, 0.012, t) * Math.exp(-t / 0.07) * (0.55 + 0.45 * gate()) * bp.run(w());
      }
      for (let k = 0, m = r.int(6, 14 + 8 * run); k < m; k++) bubble(y, Math.floor(r.range(0.04, 0.55) * sr), sr, r.range(1200, 3600), r.range(0.003, 0.008), wet * r.range(0.02, 0.09));
      // suction as the foot comes out, about a stride-half later
      const at = Math.floor(r.range(0.5, 0.7) * sr), sb = Biq(); const nw = white(r);
      for (let j = 0; j < 0.25 * sr && at + j < n; j++) { const t = j / sr; if ((j & 31) === 0) sb.set('bp', 420 + 900 * t / 0.25, 3, sr); y[at + j] += wet * 0.12 * sstep(0, 0.06, t) * Math.exp(-Math.max(0, t - 0.06) / 0.05) * sb.run(nw()); }
    }
    if (wet < 1) {
      // dry ground: grit and litter crushed under the foot, now and then a stick snapping
      const dry = 1 - wet;
      for (let k = 0, m = r.int(25, 50 + 30 * run); k < m; k++) { const t = 0.003 + (-Math.log(1 - r() * 0.98)) * 0.05; modal(y, Math.floor(t * sr), sr, [[r.range(1800, 6000), r.range(0.0008, 0.003), r() * r() * 0.25]], dry, r); }
      burst(y, 0, sr, 0.3, (t) => sstep(0, 0.004, t) * Math.exp(-t / 0.07), [['hp', 2200, 0.7]], white(r), dry * 0.07);
      if (r() < 0.3) { const at = Math.floor(r.range(0.015, 0.11) * sr), f = r.range(1300, 2500); modal(y, at, sr, [[f, 0.009, 0.45], [f * 2.31, 0.004, 0.3], [f * 3.9, 0.002, 0.2]], dry, r); }
    }
    dcBlock(y, sr, 12); fades(y, sr, 0.001, 0.08); normalize([y], 0.95 * (0.8 + 0.2 * run));
    return out(sr, y);
  }

  /** The roar: a chaotic low voice through a long tract, mouth opening, a throat rattle, chest sub, and a breath tail. */
  function roar(seed, sr) {
    const r = rng(seed), D = r.range(2.6, 3.2), n = Math.floor(D * sr);
    const tPk = r.range(0.45, 0.8), fS = r.range(34, 44), fP = r.range(72, 98), fE = r.range(50, 64), tEnd = D - r.range(0.6, 0.8);
    const wob = smooth(r, 7, sr), wob2 = smooth(r, 1.3, sr), chaos = smooth(r, 3, sr), f0 = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr; let f;
      if (t < tPk) { const u = t / tPk; f = fS + (fP - fS) * (1 - (1 - u) * (1 - u)); } else if (t < tEnd) { const u = (t - tPk) / (tEnd - tPk); f = fP + (fE - fP) * Math.pow(u, 1.3); } else { const u = (t - tEnd) / (D - tEnd); f = fE * (1 - 0.45 * u); }
      f0[i] = f * (1 + 0.03 * wob() + 0.05 * wob2());
    }
    const subA = new Float32Array(n); for (let i = 0; i < n; i++) subA[i] = clamp(0.2 + 1.2 * (chaos() - 0.1), 0, 0.85);
    const g1 = glottal(n, sr, (i) => f0[i], r, { jit: 0.03, shim: 0.14, oq: 0.62, sub: (i) => subA[i] });
    const ratio = r.range(0.48, 0.56), wob3 = smooth(r, 4, sr), f2 = new Float32Array(n); for (let i = 0; i < n; i++) f2[i] = f0[i] * ratio * (1 + 0.03 * wob3());
    const g2 = glottal(n, sr, (i) => f2[i], r, { jit: 0.05, shim: 0.25, oq: 0.5 });
    const A = new Float32Array(n), swell = smooth(r, 2, sr), br = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / sr; A[i] = Math.pow(sstep(0, 0.32, t), 1.3) * (1 + 0.12 * swell()) * (t > tEnd ? Math.exp(-(t - tEnd) / 0.13) : 1); br[i] = 0.3 + 0.35 * sstep(tEnd - 0.5, tEnd, t) + 0.1 * (1 - sstep(0, 0.2, t)); }
    const w = white(r), exc = new Float32Array(n);
    for (let i = 0; i < n; i++) exc[i] = A[i] * (g1.d[i] + 0.4 * g2.d[i] + w() * br[i] * (0.4 + 2.5 * g1.flow[i]));
    const jaw = smooth(r, 2.5, sr), j = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / sr; j[i] = clamp(sstep(0, 0.42, t) * (0.9 + 0.1 * jaw()) * (1 - 0.6 * sstep(tEnd - 0.25, D, t)), 0, 1); }
    const sc = r.range(0.92, 1.08);
    let y = formants(exc, sr, (i) => { const q = j[i]; return [[(200 + 300 * q) * sc, 110, 1], [(500 + 330 * q) * sc, 140, 1], [(930 + 260 * q) * sc, 180, 0.85], [(1480 + 160 * q) * sc, 240, 0.6], [2350 * sc, 320, 0.4], [3300 * sc, 420, 0.25]]; });
    const lowp = filt(Float32Array.from(exc), 'lp', 160, 0.7, sr); for (let i = 0; i < n; i++) y[i] += 0.45 * lowp[i];
    softclip(y, 2.6);
    // the clipper flattens dynamics; shape the phrase after it: a peak near the pitch peak, a sag, a second push, a fade
    const push = r.range(0.45, 0.75) * (tEnd - tPk) + tPk, sw2 = smooth(r, 3, sr);
    const shp = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / sr; shp[i] = (0.35 + 0.65 * Math.exp(-Math.pow((t - tPk) / 0.45, 2)) + 0.4 * Math.exp(-Math.pow((t - push) / 0.3, 2))) * (1 + 0.18 * sw2()) * (1 - 0.5 * sstep(tEnd - 0.4, tEnd + 0.2, t)); }
    const fr = r.range(22, 30), rw = smooth(r, 3, sr); for (let i = 0; i < n; i++) y[i] *= 1 - 0.2 * (0.5 + 0.5 * Math.sin(TAU * fr * i / sr + 2 * rw()));
    // chest: a sub an octave under the voice, felt more than heard
    let ph = 0; const sub = new Float32Array(n); for (let i = 0; i < n; i++) { ph += TAU * f0[i] * 0.5 / sr; sub[i] = A[i] * Math.sin(ph); } filt(sub, 'lp', 90, 0.7, sr); for (let i = 0; i < n; i++) y[i] = (y[i] + 0.22 * sub[i]) * shp[i];
    // the breath out after it, through the open mouth
    const y2 = new Float32Array(Math.floor((D + 0.5) * sr)); y2.set(y);
    burst(y2, Math.floor((tEnd - 0.05) * sr), sr, 1.1, (t) => sstep(0, 0.1, t) * Math.exp(-Math.max(0, t - 0.1) / 0.28), [['bp', r.range(500, 700), 0.8], ['lp', 2500, 0.7]], white(r), 0.28);
    dcBlock(y2, sr, 15); fades(y2, sr, 0.003, 0.08); normalize([y2], 0.95);
    return out(sr, y2);
  }

  /** Growl: a slow, pulsing vocal fry through a nearly closed mouth, swelling two or three times. */
  function growl(seed, sr) {
    const r = rng(seed), D = r.range(2.0, 2.6), n = Math.floor(D * sr), base = r.range(24, 34), dr = smooth(r, 0.8, sr), wb = smooth(r, 5, sr);
    const f0 = new Float32Array(n); for (let i = 0; i < n; i++) f0[i] = base * (1 + 0.15 * dr() + 0.05 * wb()) * (1 - 0.15 * i / n);
    const g = glottal(n, sr, (i) => f0[i], r, { jit: 0.09, shim: 0.25, oq: 0.38, sub: () => 0.2 });
    const swells = [], m = r.int(2, 3); for (let k = 0; k < m; k++) swells.push([r.range(0.15, 0.9) * D, r.range(0.25, 0.5), r.range(0.6, 1)]);
    const w = white(r), exc = new Float32Array(n), env = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr; let a = 0.25; for (const [c, s, h] of swells) a += h * Math.exp(-((t - c) * (t - c)) / (2 * s * s));
      env[i] = a; exc[i] = (0.5 + 0.5 * Math.min(1, a)) * (g.d[i] + 0.3 * w() * (0.3 + g.flow[i]));
    }
    const sc = r.range(0.9, 1.1);
    const y = formants(exc, sr, () => [[150 * sc, 80, 1], [380 * sc, 110, 0.9], [760 * sc, 160, 0.6], [1250 * sc, 260, 0.35], [2100 * sc, 350, 0.15]]);
    const lowp = filt(Float32Array.from(exc), 'lp', 110, 0.7, sr); for (let i = 0; i < n; i++) y[i] += 0.35 * lowp[i];
    softclip(y, 3.0); for (let i = 0; i < n; i++) { const t = i / sr; y[i] *= env[i] * sstep(0, 0.2, t) * (1 - sstep(D - 0.4, D, t)); } dcBlock(y, sr, 14); fades(y, sr, 0.01, 0.1); normalize([y], 0.9);
    return out(sr, y);
  }

  /** Closed-mouth rumble: an infrasonic boom (fundamental under 25 Hz) with harmonics so small speakers still carry it. */
  function rumble(seed, sr) {
    const r = rng(seed), D = r.range(2.4, 3.6), n = Math.floor(D * sr), f = r.range(17, 24), dr = smooth(r, 0.5, sr), am = smooth(r, 4, sr), y = new Float32Array(n);
    const amps = [], phs = []; for (let k = 1; k <= 12; k++) { amps.push(Math.pow(k, -0.6) * (0.7 + 0.6 * r())); phs.push(r() * TAU); }
    const pulses = []; for (let k = 0, m = r.int(2, 4); k < m; k++) pulses.push([(k + 0.5 + 0.2 * r.gauss()) * D / m, r.range(0.18, 0.3), r.range(0.6, 1)]);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr; ph += TAU * f * (1 + 0.06 * dr()) / sr;
      let s = 0; for (let k = 0; k < 12; k++) s += amps[k] * Math.sin((k + 1) * ph + phs[k]);
      let pe = 0; for (const [c, w, h] of pulses) pe += h * Math.exp(-Math.pow((t - c) / w, 2));
      y[i] = s * (0.05 + pe) * sstep(0, 0.3, t) * (1 - sstep(D - 0.5, D, t)) * (1 + 0.2 * am());
    }
    filt(y, 'lp', 320, 0.6, sr); filt(y, 'pk', 90, 0.8, sr, 6);
    burst(y, 0, sr, D, (t) => sstep(0, 0.5, t) * (1 - sstep(D - 0.8, D, t)), [['bp', 280, 1.2]], white(r), 0.04);
    dcBlock(y, sr, 8); fades(y, sr, 0.02, 0.2); normalize([y], 0.9);
    return out(sr, y);
  }

  /** Huff: a forced blast of air through huge nostrils, with flutter, a chest push, and sometimes a quick breath in first. */
  function huff(seed, sr, o = {}) {
    const r = rng(seed), short = o.short ? 0.55 : 1, D = r.range(0.75, 1.0) * short + 0.15, y = arr(D, sr), n = y.length;
    let at = 0;
    if (!o.short && r() < 0.5) { burst(y, 0, sr, 0.16, (t) => sstep(0, 0.12, t) * (t > 0.13 ? Math.exp(-(t - 0.13) / 0.01) : 1), [['bp', 1400, 1.6]], white(r), 0.12); at = Math.floor(0.2 * sr); }
    const w = white(r), bw = brownGen(r), fl = r.range(28, 45), fd = r.range(0.25, 0.45), sc = r.range(0.85, 1.15), tau = r.range(0.14, 0.22) * short;
    const bs = [Biq(), Biq(), Biq()], lp = Biq().set('lp', 140, 0.7, sr), fls = smooth(r, 20, sr);
    for (let j = 0; at + j < n; j++) {
      const t = j / sr; if ((j & 31) === 0) { const d = 1 - 0.12 * t; bs[0].set('bp', 330 * sc * d, 1.1, sr); bs[1].set('bp', 880 * sc * d, 1.5, sr); bs[2].set('bp', 2100 * sc, 2, sr); }
      const e = sstep(0, 0.022, t) * Math.exp(-t / tau) * (1 + 0.4 * Math.exp(-t / 0.05)), flut = 1 - fd * Math.exp(-t / 0.3) * (0.5 + 0.5 * Math.sin(TAU * fl * t + fls()));
      const s = w(); y[at + j] += e * flut * (bs[0].run(s) + 0.6 * bs[1].run(s) + 0.22 * bs[2].run(s)) + 0.15 * e * lp.run(bw());
    }
    dcBlock(y, sr, 15); fades(y, sr, 0.002, 0.05); normalize([y], o.short ? 0.75 : 0.85);
    return out(sr, y);
  }

  /** Sniffing: a run of short sharp breaths in through the nose, often ending in a snort out. */
  function sniff(seed, sr) {
    const r = rng(seed), m = r.int(3, 6), sp = r.range(0.17, 0.27), D = m * sp + 0.8, y = arr(D, sr);
    let t0 = 0.02; const sc = r.range(0.85, 1.15);
    for (let k = 0; k < m; k++) {
      const d = r.range(0.08, 0.15), a = (k === 0 ? 0.7 : 1) * r.range(0.6, 1), f = r.range(1100, 1700) * sc;
      burst(y, Math.floor(t0 * sr), sr, d + 0.02, (t) => Math.pow(clamp(t / d, 0, 1), 1.5) * (t > d ? Math.exp(-(t - d) / 0.006) : 1), [['bp', f, 1.4], ['hp', 350, 0.7]], white(r), a);
      burst(y, Math.floor(t0 * sr), sr, d + 0.02, (t) => Math.pow(clamp(t / d, 0, 1), 1.2) * (t > d ? Math.exp(-(t - d) / 0.008) : 1), [['bp', 480 * sc, 1]], white(r), 0.5 * a);
      t0 += sp * r.range(0.85, 1.15);
    }
    if (r() < 0.7) { const s = huff(seed + 77, sr, { short: true }).ch[0], i0 = Math.floor((t0 + 0.05) * sr); for (let i = 0; i < s.length && i0 + i < y.length; i++) y[i0 + i] += 1.1 * s[i]; }
    dcBlock(y, sr, 20); fades(y, sr, 0.002, 0.05); normalize([y], 0.7);
    return out(sr, y);
  }

  /** Jaws slamming shut: a short swish, a hard bony clack of teeth meeting (not all at once), the jaw's mass, a wet slap. */
  function clack(seed, sr) {
    const r = rng(seed), D = 0.75, y = arr(D, sr), hit = Math.floor(0.045 * sr);
    burst(y, 0, sr, 0.05, (t) => Math.pow(t / 0.045, 2) * (t > 0.045 ? 0 : 1), [['bp', r.range(600, 900), 1.2]], white(r), 0.25);
    const sc = r.range(0.85, 1.15), modes = [[620 * sc, 0.05, 1], [1180 * sc, 0.035, 0.8], [1930 * sc, 0.024, 0.6], [2870 * sc, 0.017, 0.45], [4150 * sc, 0.011, 0.3]];
    modal(y, hit, sr, modes, 0.6, r);
    for (let k = 0, m = r.int(2, 4); k < m; k++) modal(y, hit + Math.floor(r.range(0.002, 0.014) * sr), sr, modes.map(([f, t, a]) => [f * r.range(0.95, 1.08), t * 0.6, a]), r.range(0.15, 0.35), r);
    burst(y, hit, sr, 0.004, () => 1, [['hp', 3000, 0.7]], white(r), 0.8);
    let ph = 0; for (let j = 0; hit + j < y.length; j++) { const t = j / sr; ph += TAU * (60 + 40 * Math.exp(-t / 0.02)) / sr; y[hit + j] += 0.8 * Math.exp(-t / 0.07) * Math.sin(ph) * sstep(0, 0.002, t); }
    burst(y, hit, sr, 0.3, (t) => Math.exp(-t / 0.05), [['lp', 220, 0.8]], brownGen(r), 0.6);
    burst(y, hit + Math.floor(0.004 * sr), sr, 0.06, (t) => Math.exp(-t / 0.015), [['bp', r.range(1300, 1900), 1.5]], white(r), 0.35);
    dcBlock(y, sr, 20); fades(y, sr, 0.003, 0.08); normalize([y], 0.95);
    return out(sr, y);
  }

  /** A bite into a body: a muffled jaw impact, flesh, then bones cracking one after another, and the wet squeeze. */
  function crunch(seed, sr) {
    const r = rng(seed), D = 0.9, y = arr(D, sr);
    modal(y, 0, sr, [[r.range(330, 420), 0.04, 1], [r.range(700, 820), 0.03, 0.6], [r.range(1200, 1400), 0.02, 0.4]], 0.5, r);
    burst(y, 0, sr, 0.3, (t) => sstep(0, 0.002, t) * Math.exp(-t / 0.05), [['lp', 260, 0.8]], brownGen(r), 0.8);
    const m = r.int(6, 14); let t = 0.02;
    for (let k = 0; k < m; k++) {
      t += -Math.log(1 - r() * 0.95) * 0.035; if (t > 0.6) break;
      const big = r() < 0.2, f = big ? r.range(900, 1500) : r.range(1500, 4200), g = big ? 1 : r.range(0.2, 0.6);
      modal(y, Math.floor(t * sr), sr, [[f, big ? 0.015 : r.range(0.003, 0.009), 1], [f * r.range(1.9, 2.6), 0.004, 0.5]], g, r);
      burst(y, Math.floor(t * sr), sr, 0.003, () => 1, [['hp', 2500, 0.7]], white(r), g * 0.5);
    }
    const bp = Biq(), w = white(r), gate = smooth(r, 60, sr);
    for (let j = 0; j < 0.55 * sr; j++) { const tt = j / sr; if ((j & 31) === 0) bp.set('bp', 700 * Math.exp(-tt / 0.4) + 300, 2.5, sr); y[j] += 0.4 * sstep(0, 0.02, tt) * Math.exp(-tt / 0.2) * Math.max(0, gate()) * bp.run(w()); }
    dcBlock(y, sr, 20); fades(y, sr, 0.001, 0.08); normalize([y], 0.95);
    return out(sr, y);
  }

  /** Tearing meat: flesh stretching (crackle getting denser), the rip, the release; an effort grunt under it. */
  function tear(seed, sr) {
    const r = rng(seed), D = r.range(1.0, 1.4), y = arr(D + 0.4, sr), rip = D * r.range(0.55, 0.7);
    let t = 0.03;
    while (t < rip + 0.08) { const dens = t < rip ? 30 + 260 * Math.pow(t / rip, 2) : 900; t += -Math.log(1 - r() * 0.99) / dens; modal(y, Math.floor(t * sr), sr, [[r.range(700, 2600), r.range(0.0015, 0.004), 1]], r.range(0.05, 0.25) * (t > rip ? 1.6 : 1), r); }
    const bp = Biq(), w = white(r);
    for (let j = 0; j < rip * sr; j++) { const tt = j / sr; if ((j & 31) === 0) bp.set('bp', 600 + 900 * tt / rip, 1.8, sr); y[j] += 0.12 * Math.pow(tt / rip, 1.5) * bp.run(w()); }
    burst(y, Math.floor(rip * sr), sr, 0.25, (tt) => Math.exp(-tt / 0.05), [['bp', 900, 1]], white(r), 0.5);
    burst(y, Math.floor((rip + 0.06) * sr), sr, 0.3, (tt) => sstep(0, 0.003, tt) * Math.exp(-tt / 0.06), [['lp', 220, 0.8]], brownGen(r), 0.6);
    for (let k = 0, m = r.int(3, 7); k < m; k++) bubble(y, Math.floor((rip + r.range(0.1, 0.5)) * sr), sr, r.range(700, 2000), r.range(0.004, 0.01), r.range(0.03, 0.1));
    // effort, low in the throat
    const n = Math.floor(rip * sr), g = glottal(n, sr, () => r.range(28, 34), r, { jit: 0.1, shim: 0.3, oq: 0.4 }), gr = formants(g.d, sr, () => [[160, 90, 1], [420, 140, 0.5]]);
    for (let i = 0; i < n; i++) y[i] += 0.25 * gr[i] * sstep(0, 0.3, i / sr) * (1 - sstep(rip - 0.1, rip, i / sr));
    dcBlock(y, sr, 20); fades(y, sr, 0.002, 0.1); normalize([y], 0.9);
    return out(sr, y);
  }

  /** Swallowing a mouthful: a low glunk and a gurgle. */
  function gulp(seed, sr) {
    const r = rng(seed), y = arr(0.8, sr), gf = r.range(55, 90), go = Math.floor(r.range(0.02, 0.1) * sr);
    let ph = 0; for (let j = 0; j < 0.35 * sr; j++) { const t = j / sr; ph += TAU * (gf + 90 * Math.exp(-t / 0.05)) / sr; y[j + go] += Math.exp(-t / 0.12) * sstep(0, 0.01, t) * Math.sin(ph); }
    for (let k = 0, m = r.int(3, 5); k < m; k++) bubble(y, Math.floor(r.range(0.1, 0.45) * sr), sr, r.range(180, 420), r.range(0.015, 0.03), r.range(0.2, 0.4));
    burst(y, 0, sr, 0.5, (t) => sstep(0, 0.05, t) * Math.exp(-t / 0.15), [['bp', 380, 2.5]], white(r), 0.3);
    dcBlock(y, sr, 20); fades(y, sr, 0.002, 0.05); normalize([y], 0.7);
    return out(sr, y);
  }

  /** The head swung hard through the air: a low whoosh. */
  function whoosh(seed, sr) {
    const r = rng(seed), D = r.range(0.5, 0.8), y = arr(D, sr), bp = Biq(), w = white(r), c = r.range(0.35, 0.6) * D;
    for (let j = 0; j < y.length; j++) { const t = j / sr; if ((j & 31) === 0) bp.set('bp', 250 + 500 * Math.exp(-Math.pow((t - c) / (0.25 * D), 2)), 1.2, sr); y[j] = Math.exp(-Math.pow((t - c) / (0.22 * D), 2)) * bp.run(w()); }
    fades(y, sr, 0.01, 0.05); normalize([y], 0.6);
    return out(sr, y);
  }

  // ---------------------------------------------------------------- the world
  /** Thunder from a tortuous channel: each segment sends an N-wave that arrives when its distance says, filtered by
   * how far it travelled. Nearer channels crack; far ones only roll. Two listening points 30 m apart give stereo. */
  function thunder(seed, sr, o = {}) {
    const r = rng(seed), dn = o.dist ?? 900, segs = [];
    let x = 0, z = dn, h = 0; const dir = r() * TAU;
    for (let k = 0; k < 420 && h < 3500; k++) { const L = r.range(8, 30), a = r() * TAU, up = r.range(0.35, 0.95); x += Math.cos(a) * L * (1 - up) * 1.6; z += Math.sin(a) * L * (1 - up) * 1.6; h += L * up; segs.push([x, z, h, L]); }
    // a few branches inside the cloud, running sideways (the long rolls)
    for (let b = 0, m = r.int(2, 5); b < m; b++) { let [bx, bz, bh] = segs[Math.floor(r.range(0.5, 1) * segs.length - 1)]; const a = r() * TAU; for (let k = 0; k < 120; k++) { const L = r.range(10, 30); bx += Math.cos(a + r.gauss() * 0.5) * L; bz += Math.sin(a + r.gauss() * 0.5) * L; bh += r.gauss() * 4; segs.push([bx, bz, bh, L * 0.6]); } }
    void dir;
    const dist = (s, ex) => Math.hypot(s[0] - ex, s[1], s[2] - 1.7);
    let dmin = 1e9, dmax = 0; for (const s of segs) { const d = dist(s, 0); dmin = Math.min(dmin, d); dmax = Math.max(dmax, d); }
    const D = Math.min(14, (dmax - dmin) / 343 + 3), n = Math.floor(D * sr), chs = [];
    const fc = (d) => 70 + 9000 * Math.exp(-d / 330);
    const nb = 8, edges = []; for (let b = 0; b <= nb; b++) edges.push(dmin + (dmax - dmin + 1) * Math.pow(b / nb, 1.6));
    for (const ex of [-15, 15]) {
      const bands = Array.from({ length: nb }, () => new Float32Array(n)), y = new Float32Array(n);
      const rr = rng(seed * 7 + (ex > 0 ? 1 : 2));
      for (const s of segs) {
        const d = dist(s, ex), t = (d - dmin) / 343 + 0.02, i0 = Math.floor(t * sr); if (i0 >= n) continue;
        let b = 0; while (b < nb - 1 && d > edges[b + 1]) b++;
        const T = (d < dmin + 200 && dmin < 700 ? rr.range(0.0004, 0.002) : rr.range(0.002, 0.012)) * (1 + d / 1200), m = Math.floor(T * sr), a = s[3] / Math.max(50, d) * rr.range(0.5, 1.5), Y = bands[b];
        for (let j = 0; j <= m && i0 + j < n; j++) Y[i0 + j] += a * (1 - 2 * j / m);
      }
      for (let b = 0; b < nb; b++) { const f = fc((edges[b] + edges[b + 1]) / 2), Y = bands[b]; filt(Y, 'lp', f, 0.6, sr); filt(Y, 'lp', f * 1.4, 0.6, sr); for (let i = 0; i < n; i++) y[i] += Y[i]; }
      // ground and forest scatter smear the arrivals into a roll
      const sm = new Float32Array(n), dl = [[0.031, 0.5], [0.077, 0.4], [0.13, 0.33], [0.21, 0.25], [0.34, 0.2], [0.55, 0.14]];
      for (const [dt, g] of dl) { const k = Math.floor(dt * rr.range(0.8, 1.2) * sr); for (let i = k; i < n; i++) sm[i] += g * y[i - k]; }
      for (let i = 0; i < n; i++) y[i] = (y[i] + sm[i]) * (0.35 + 0.65 * Math.exp(-i / sr / 4));
      chs.push(y);
    }
    for (const y of chs) { dcBlock(y, sr, 18); fades(y, sr, 0.003, 1.0); }
    normalize(chs, 0.95);
    return out(sr, ...chs);
  }

  /** A seamless loop: render len + xf seconds with fill(y), then crossfade the tail into the head. */
  function loop(sr, len, xf, fill) {
    const n = Math.floor(len * sr), m = Math.floor(xf * sr), y = new Float32Array(n + m); fill(y);
    for (let i = 0; i < m; i++) { const u = i / m; y[i] = y[i] * Math.sin(u * Math.PI / 2) + y[n + i] * Math.cos(u * Math.PI / 2); }
    return y.subarray(0, n);
  }
  /** Rain layers, each a mono loop: wash (the distant hiss), leaf (ticks on ferns and leaves), ground (wet earth and
   * puddle plinks), hard (splats on concrete and rock nearby), roof (drumming heard from under a roof, with drips). */
  function rain(seed, sr, o = {}) {
    const r = rng(seed), kind = o.kind || 'wash', len = o.len || 6;
    const y = loop(sr, len, 0.5, (y) => {
      const n = y.length;
      if (kind === 'wash') {
        const p = pinkGen(r), lv = smooth(r, 0.3, sr); for (let i = 0; i < n; i++) y[i] = p() * (1 + 0.15 * lv());
        filt(y, 'hp', 450, 0.7, sr); filt(y, 'hp', 300, 0.7, sr); filt(y, 'lp', 7500, 0.7, sr); filt(y, 'pk', 2600, 0.8, sr, 3);
      } else if (kind === 'leaf') {
        const N = Math.floor(n / sr * 260); for (let k = 0; k < N; k++) { const i = Math.floor(r() * n), a = Math.exp(r.gauss() * 0.6) * 0.1, f = r.range(1800, 6500); modal(y, i, sr, [[f, r.range(0.0012, 0.004), a], [f * r.range(1.4, 1.9), 0.0012, a * 0.5]], 1, r); }
        filt(y, 'hp', 900, 0.7, sr);
      } else if (kind === 'ground') {
        const N = Math.floor(n / sr * 170); for (let k = 0; k < N; k++) { const i = Math.floor(r() * n); if (r() < 0.3) bubble(y, i, sr, r.range(900, 3200), r.range(0.003, 0.009), Math.exp(r.gauss() * 0.5) * 0.06); else burst(y, i, sr, 0.012, (t) => Math.exp(-t / 0.003), [['bp', r.range(500, 1600), 1]], white(r), Math.exp(r.gauss() * 0.5) * 0.12); }
        filt(y, 'hp', 250, 0.7, sr);
      } else if (kind === 'hard') {
        const N = Math.floor(n / sr * 220); for (let k = 0; k < N; k++) burst(y, Math.floor(r() * n), sr, 0.008, (t) => Math.exp(-t / 0.0018), [['hp', r.range(1500, 3000), 0.7]], white(r), Math.exp(r.gauss() * 0.5) * 0.15);
      } else if (kind === 'roof') {
        const N = Math.floor(n / sr * 700); for (let k = 0; k < N; k++) { const i = Math.floor(r() * n); y[i] += Math.exp(r.gauss() * 0.5) * 0.2 * (r() < 0.5 ? 1 : -1); }
        const a = Float32Array.from(y), b = Float32Array.from(y); filt(a, 'bp', r.range(160, 220), 4, sr); filt(b, 'bp', r.range(380, 480), 3, sr); filt(y, 'bp', 1100, 0.8, sr);
        for (let i = 0; i < n; i++) y[i] = y[i] * 0.7 + a[i] * 1.2 + b[i] * 0.9;
        const dr = Math.floor(n / sr * 1.6); for (let k = 0; k < dr; k++) bubble(y, Math.floor(r() * n), sr, r.range(700, 1800), r.range(0.008, 0.02), r.range(0.05, 0.15));
      }
    });
    dcBlock(y, sr, 20); normalize([y], 0.7);
    return out(sr, Float32Array.from(y));
  }
  /** Generic loops: 'pink' (breath and wind source), 'brown', 'leaves' (fern and leaf rustle for gusts), 'hiss' (flare sputter). */
  function bed(seed, sr, o = {}) {
    const r = rng(seed), kind = o.kind, len = o.len || 5;
    const y = loop(sr, len, 0.3, (y) => {
      const n = y.length;
      if (kind === 'pink') { const p = pinkGen(r); for (let i = 0; i < n; i++) y[i] = p(); }
      else if (kind === 'brown') { const b = brownGen(r); for (let i = 0; i < n; i++) y[i] = b(); }
      else if (kind === 'leaves') {
        const lv = smooth(r, 1.5, sr), w = white(r); for (let i = 0; i < n; i++) y[i] = w() * 0.03 * (1 + lv());
        for (let k = 0, N = Math.floor(n / sr * 500); k < N; k++) { const i = Math.floor(r() * n); modal(y, i, sr, [[r.range(1500, 6000), r.range(0.0008, 0.003), r() * r() * 0.3]], 1, r); }
        filt(y, 'hp', 1200, 0.7, sr);
      } else if (kind === 'hiss') {
        const w = white(r), sp = smooth(r, 12, sr); for (let i = 0; i < n; i++) y[i] = w() * (0.6 + 0.4 * sp());
        filt(y, 'bp', 4200, 0.7, sr);
        for (let k = 0, N = Math.floor(n / sr * 25); k < N; k++) modal(y, Math.floor(r() * n), sr, [[r.range(1500, 5000), 0.002, r.range(0.2, 0.8)]], 1, r);
      }
    });
    dcBlock(y, sr, 15); normalize([y], 0.7);
    return out(sr, Float32Array.from(y));
  }
  /** Room impulse responses. 'out': open forest (ground bounce, sparse tree scatter, long dark tail). 'in': small concrete room. */
  function ir(seed, sr, o = {}) {
    const r = rng(seed), kind = o.kind || 'out', rt = o.rt || (kind === 'out' ? 1.7 : 0.55), n = Math.floor(rt * 1.1 * sr), chs = [];
    for (let c = 0; c < 2; c++) {
      const y = new Float32Array(n), w = white(r), pre = kind === 'out' ? 0.012 : 0.003;
      const lo = new Float32Array(n), mi = new Float32Array(n), hi = new Float32Array(n);
      for (let i = 0; i < n; i++) { lo[i] = w(); mi[i] = w(); hi[i] = w(); }
      filt(lo, 'lp', 500, 0.7, sr); filt(mi, 'bp', 1500, 0.5, sr); filt(hi, 'hp', 3500, 0.7, sr);
      const [tl, tm, th] = kind === 'out' ? [rt, rt * 0.75, rt * 0.4] : [rt * 0.9, rt, rt * 0.7];
      for (let i = 0; i < n; i++) { const t = i / sr, on = sstep(pre, pre + (kind === 'out' ? 0.06 : 0.015), t); y[i] = on * ((kind === 'out' ? 1.0 : 1.6) * lo[i] * Math.exp(-6.9 * t / tl) + 1.3 * mi[i] * Math.exp(-6.9 * t / tm) + 0.8 * hi[i] * Math.exp(-6.9 * t / th)); }
      if (kind === 'out') { const g = Math.floor(r.range(0.004, 0.007) * sr); y[g] += 3; for (let k = 0; k < 40; k++) { const t = r.range(0.015, 0.25); y[Math.floor(t * sr)] += r.range(-1, 1) * 2.5 * Math.exp(-t / 0.12); } }
      else for (let k = 0; k < 60; k++) { const t = r.range(0.002, 0.04); y[Math.floor(t * sr)] += r.range(-1, 1) * 3; }
      chs.push(y);
    }
    // unity average gain across octave bands (63 Hz .. 8 kHz), so a send of g puts the tail g below the dry sound
    // whatever its spectrum (plain unit energy lets a dark tail boost the lows by 15 dB or more)
    let acc = 0, nb = 0;
    for (let fc = 63; fc <= 8000 && fc < sr * 0.4; fc *= 2) { const b = Float32Array.from(chs[0]); filt(b, 'bp', fc, 1.41, sr); let e = 0; for (let i = 0; i < n; i++) e += b[i] * b[i]; acc += e * sr / (Math.PI * fc / 1.41); nb++; }
    const k = 1 / Math.sqrt(acc / nb); for (const y of chs) for (let i = 0; i < n; i++) y[i] *= k;
    return out(sr, ...chs);
  }

  /** Bird calls: whistled glides, trills, two-note calls and low hoots. */
  function bird(seed, sr) {
    const r = rng(seed), type = r.int(0, 3), notes = [];
    if (type === 0) { const m = r.int(1, 3); let t = 0; for (let k = 0; k < m; k++) { const d = r.range(0.15, 0.4), f = r.range(2000, 3800); notes.push([t, d, f, f * r.range(0.65, 1.35), r.range(6, 12), 0.025]); t += d + r.range(0.05, 0.2); } }
    else if (type === 1) { const m = r.int(8, 20), rate = r.range(14, 24), f = r.range(2600, 5000); for (let k = 0; k < m; k++) notes.push([k / rate, 0.6 / rate, f * (1 + 0.05 * r.gauss()), f * 0.8, 0, 0]); }
    else if (type === 2) { const f = r.range(1800, 3200); notes.push([0, 0.18, f * 1.25, f * 1.3, 0, 0.01], [0.26, 0.3, f, f * 0.7, 0, 0.01]); }
    else { const m = r.int(2, 4), f = r.range(380, 650); for (let k = 0; k < m; k++) notes.push([k * r.range(0.35, 0.5), r.range(0.18, 0.3), f, f * 0.92, 0, 0]); }
    const D = notes.reduce((a, n) => Math.max(a, n[0] + n[1]), 0) + 0.05, y = arr(D, sr);
    for (const [t0, d, fa, fb, vr, vd] of notes) {
      const i0 = Math.floor(t0 * sr), m = Math.floor(d * sr); let ph = 0;
      for (let j = 0; j < m; j++) { const u = j / m, f = (fa + (fb - fa) * u) * (1 + vd * Math.sin(TAU * vr * j / sr)); ph += TAU * f / sr; const e = Math.sin(Math.PI * Math.pow(u, 0.7)) ** 2; y[i0 + j] += e * (Math.sin(ph) + 0.12 * Math.sin(2 * ph) + (type === 3 ? 0.3 * Math.sin(3 * ph) : 0)); }
    }
    if (type === 3) burst(y, 0, sr, D, () => 1, [['bp', 600, 1]], white(r), 0.03);
    fades(y, sr, 0.003, 0.02); normalize([y], 0.6);
    return out(sr, y);
  }
  /** Wings: birds bursting off a branch. */
  function flurry(seed, sr) {
    const r = rng(seed), y = arr(1.2, sr), m = r.int(9, 16); let t = 0.01;
    for (let k = 0; k < m; k++) { burst(y, Math.floor(t * sr), sr, 0.06, (tt) => sstep(0, 0.006, tt) * Math.exp(-tt / 0.018), [['bp', r.range(700, 2200), 0.9]], white(r), r.range(0.5, 1) * (1 - k / (m + 4))); t += r.range(0.03, 0.08) * (1 + k / m); }
    for (let k = 0; k < 2; k++) { const s = bird(seed * 3 + k, sr).ch[0], i0 = Math.floor(r.range(0.05, 0.4) * sr); for (let i = 0; i < s.length && i0 + i < y.length; i++) y[i0 + i] += 0.3 * s[i]; }
    fades(y, sr, 0.002, 0.1); normalize([y], 0.7);
    return out(sr, y);
  }
  /** A prey animal's alarm honk: two nasal notes. */
  function alarm(seed, sr) {
    const r = rng(seed), n = Math.floor(0.55 * sr), f0 = r.range(240, 330), seg = (t) => (t < 0.16 ? f0 * 1.15 : f0 * 0.9);
    const g = glottal(n, sr, (i) => seg(i / sr) * (1 - 0.1 * ((i / sr) % 0.2) / 0.2), r, { jit: 0.02, shim: 0.1, oq: 0.5 });
    for (let i = 0; i < n; i++) { const t = i / sr; g.d[i] *= sstep(0, 0.02, t) * (t < 0.14 ? 1 : t < 0.2 ? 0.15 : 1) * (1 - sstep(0.45, 0.52, t)); }
    const y = formants(g.d, sr, () => [[700, 120, 1], [1300, 160, 0.7], [2500, 250, 0.3]]);
    fades(y, sr, 0.002, 0.04); normalize([y], 0.7);
    return out(sr, y);
  }
  /** Impacts. 'stone' on rock or ground, 'smack' of a stone on hide, 'thud' of something heavy landing. */
  function impact(seed, sr, o = {}) {
    const r = rng(seed), kind = o.kind || 'stone', y = arr(0.5, sr);
    if (kind === 'stone') {
      const f = r.range(1800, 3200); modal(y, 0, sr, [[f, 0.01, 1], [f * 1.7, 0.006, 0.6], [f * 2.6, 0.004, 0.4], [r.range(600, 900), 0.02, 0.4]], 1, r);
      burst(y, 0, sr, 0.004, () => 1, [['hp', 3000, 0.7]], white(r), 0.6);
      if (r() < 0.7) { const at = Math.floor(r.range(0.06, 0.14) * sr); modal(y, at, sr, [[f * 1.1, 0.006, 0.4], [f * 2, 0.004, 0.2]], 1, r); }
      burst(y, 0, sr, 0.15, (t) => Math.exp(-t / 0.03), [['lp', 400, 0.7]], brownGen(r), 0.3);
    } else if (kind === 'smack') {
      const sf = r.range(65, 110);
      burst(y, 0, sr, 0.2, (t) => sstep(0, 0.001, t) * Math.exp(-t / 0.025), [['bp', r.range(500, 900), 0.9]], white(r), 1);
      let ph = 0; for (let j = 0; j < 0.2 * sr; j++) { const t = j / sr; ph += TAU * sf / sr; y[j] += 0.6 * Math.exp(-t / 0.05) * Math.sin(ph); }
      modal(y, 0, sr, [[r.range(1600, 2400), 0.004, 0.4]], 1, r);
    } else {
      burst(y, 0, sr, 0.4, (t) => sstep(0, 0.002, t) * Math.exp(-t / 0.06), [['lp', r.range(150, 260), 0.8]], brownGen(r), 1);
      modal(y, 0, sr, [[r.range(90, 130), 0.06, 0.6], [r.range(300, 450), 0.02, 0.3]], 1, r);
      if (o.wet) for (let k = 0; k < 6; k++) bubble(y, Math.floor(r.range(0.02, 0.25) * sr), sr, r.range(900, 2600), 0.005, 0.05);
    }
    dcBlock(y, sr, 20); fades(y, sr, 0.0005, 0.05); normalize([y], 0.9);
    return out(sr, y);
  }
  /** Your footsteps (wet earth or dry litter) and you pushing through fern. */
  function step(seed, sr, o = {}) {
    const r = rng(seed), wet = o.wet ?? 1, y = arr(0.4, sr);
    burst(y, 0, sr, 0.15, (t) => sstep(0, 0.004, t) * Math.exp(-t / 0.03), [['lp', 300, 0.8]], brownGen(r), 0.8);
    burst(y, Math.floor(0.035 * sr), sr, 0.1, (t) => sstep(0, 0.004, t) * Math.exp(-t / 0.02), [['lp', 400, 0.8]], brownGen(r), 0.4);
    if (wet) { burst(y, 0, sr, 0.18, (t) => sstep(0, 0.01, t) * Math.exp(-t / 0.05), [['bp', r.range(700, 1100), 2.5]], white(r), 0.35 * wet); for (let k = 0; k < 4; k++) bubble(y, Math.floor(r.range(0.02, 0.2) * sr), sr, r.range(1500, 3500), 0.003, 0.04 * wet); }
    else for (let k = 0; k < 30; k++) modal(y, Math.floor((0.005 + r() * r() * 0.12) * sr), sr, [[r.range(2000, 6000), 0.0015, r() * 0.15]], 1, r);
    dcBlock(y, sr, 30); fades(y, sr, 0.001, 0.04); normalize([y], 0.8);
    return out(sr, y);
  }
  function rustle(seed, sr, o = {}) {
    const r = rng(seed), D = r.range(0.35, 0.6), y = arr(D, sr), bp = Biq(), w = white(r), c = r.range(0.3, 0.5) * D;
    for (let j = 0; j < y.length; j++) { const t = j / sr; if ((j & 31) === 0) bp.set('bp', 2500 + 1500 * Math.sin(Math.PI * t / D), 0.8, sr); y[j] = 0.25 * Math.exp(-Math.pow((t - c) / (0.3 * D), 2)) * bp.run(w()); }
    for (let k = 0, m = r.int(40, 80); k < m; k++) { const t = c + r.gauss() * 0.25 * D; if (t > 0 && t < D) modal(y, Math.floor(t * sr), sr, [[r.range(1500, 6000), r.range(0.001, 0.003), r() * 0.3]], 1, r); }
    if (o.wet) for (let k = 0; k < 8; k++) bubble(y, Math.floor(r.range(0.05, D * 0.9) * sr), sr, r.range(1500, 4000), 0.004, 0.06);
    fades(y, sr, 0.005, 0.05); normalize([y], 0.7);
    return out(sr, y);
  }
  function ignite(seed, sr) {
    const r = rng(seed), y = arr(0.7, sr);
    for (let k = 0; k < 40; k++) modal(y, Math.floor(r() * 0.12 * sr), sr, [[r.range(2000, 7000), 0.002, r()]], 0.5, r);
    burst(y, Math.floor(0.08 * sr), sr, 0.6, (t) => sstep(0, 0.03, t) * Math.exp(-t / 0.2), [['bp', 2500, 0.6]], white(r), 0.5);
    burst(y, Math.floor(0.08 * sr), sr, 0.4, (t) => sstep(0, 0.01, t) * Math.exp(-t / 0.08), [['lp', 300, 0.7]], brownGen(r), 0.5);
    fades(y, sr, 0.001, 0.05); normalize([y], 0.8);
    return out(sr, y);
  }
  /** You, shouting "hey!": a pressed male voice gliding from /e/ to /i/, with plenty of breath. */
  function shout(seed, sr) {
    const r = rng(seed), D = r.range(0.42, 0.55), n = Math.floor(D * sr), fb = r.range(150, 175);
    const g = glottal(n, sr, (i) => { const u = i / n; return fb * (1 + 0.25 * Math.sin(Math.PI * Math.min(1, u * 1.4)) - 0.12 * u); }, r, { jit: 0.012, shim: 0.06, oq: 0.5 });
    const w = white(r), x = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / sr, u = i / n; const h = t < 0.07 ? 1 : 0; x[i] = (h ? 0 : 1) * g.d[i] * sstep(0.06, 0.1, t) * (1 - sstep(0.75, 1, u)) + w() * (0.5 * h * sstep(0, 0.03, t) + 0.06); }
    const y = formants(x, sr, (i) => { const u = sstep(0.35, 0.95, i / n); return [[620 - 280 * u, 90, 1], [1800 + 400 * u, 120, 0.7], [2550 + 350 * u, 180, 0.4], [3500, 250, 0.2]]; });
    dcBlock(y, sr, 60); fades(y, sr, 0.003, 0.04); normalize([y], 0.8);
    return out(sr, y);
  }

  const gens = { footfall, roar, growl, rumble, huff, sniff, clack, crunch, tear, gulp, whoosh, thunder, rain, bed, ir, bird, flurry, alarm, impact, step, rustle, ignite, shout };
  // helpers for the hybrid layer (src/view/audiohybrid.js), which runs in the same Worker
  const util = { TAU, rng, clamp, sstep, Biq, filt, normalize, dcBlock, fades, smooth, white, brownGen, pinkGen, softclip, burst, modal, glottal, formants, arr };
  return { gens, util, make: (kind, seed, sr, o) => gens[kind](seed, sr, o || {}) };
}
