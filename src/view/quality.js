// Quality: tiers chosen by measured frame time, not by what kind of device it is.
//
// Two decisions, kept apart:
//  - the BUILD (what geometry and shader detail the world is made with): 'low' (the light build phones have always had,
//    cheap shaders, no meadow, no environment map) or 'full'. Fixed for the session; chosen from cheap hints (touch +
//    small screen, a software renderer) or from what an earlier session on this GPU measured.
//  - the LEVEL (low / medium / high): everything that can change while running: grass and meadow instance counts and
//    reach, ferns, rain and mist, shadow map size, extent and casters, post stack (bloom, grade, MSAA), tree LOD reach,
//    and the band the render resolution may move in. Chosen by measurement.
// Two loops: dynamic resolution (fast inner loop, every ~0.6 s) trades pixels to hold the frame rate inside the level's
// band; the level (slow outer loop) steps down only when resolution has nothing left to give and frames are still long,
// and steps up only after a long quiet spell at the top of the band, with a growing back-off after any step down, so
// there is never a storm of popping. While the start card is up (the opening shot) both loops run faster, so the level
// is settled before you step in. What was settled is remembered per GPU for the next load.
//
// A manual Quality setting (auto / low / medium / high) lives in the pause menu and start card and is remembered; the
// #quality-low / -medium / -high hashes force one. #perf shows an overlay a tester can read off and copy (see report()).

import * as THREE from 'three/webgpu';

export const LEVELS = ['low', 'medium', 'high'];
const dpr = () => (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

/** What each level costs. ratio: renderer pixel ratio band (times CSS px); maxPx: cap on rendered pixels (big screens);
 *  grass/ferns/rain: fraction of the built instance count; meadow: near-eye grass clumps and the size of the box they
 *  fill (density = count / box^2); shadow: map size, half-extent of the sun's frustum (m), small and far casters;
 *  post: MSAA samples on the scene pass, bloom, grade; treeNear: metres within which jungle trees are full models. */
export const PROFILE = {
  low: { ratio: [0.5, 1.25], start: 1.25, maxPx: 0.75e6, grass: 0.3, meadow: 0, box: 40, ferns: 0.6, rain: 0.17, mist: 0, shadow: 1024, extent: 22, small: false, far: false, msaa: 0, bloom: false, grade: false, treeNear: 12 },
  medium: { ratio: [0.55, 1.0], start: 0.9, maxPx: 1.3e6, grass: 0.55, meadow: 12000, box: 44, ferns: 0.8, rain: 0.45, mist: 12, shadow: 1024, extent: 26, small: false, far: false, msaa: 0, bloom: false, grade: true, treeNear: 26 },
  high: { ratio: [0.6, 1.5], start: 1.5, maxPx: 3.8e6, grass: 1, meadow: 44000, box: 66, ferns: 1, rain: 1, mist: 36, shadow: 2048, extent: 30, small: true, far: true, msaa: 4, bloom: true, grade: true, treeNear: 42 },
};

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} },
  json(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
};

/** Cheap hints: the GPU's name (WEBGL_debug_renderer_info on a throwaway context), cores, memory, screen, touch. */
export function gpuHints() {
  let gpu = '', vendor = '';
  try {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      const e = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
      vendor = String(e ? gl.getParameter(e.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR) || '');
      const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    }
  } catch {}
  const s = (gpu + ' ' + vendor).toLowerCase();
  const cls = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/.test(s) ? 'software'
    : /nvidia|geforce|quadro|rtx|gtx|radeon rx|radeon pro|radeon r9|radeon hd [789]\d{3}|firepro|arc\(tm\) a|arc a\d/.test(s) ? 'discrete'
    : /apple m\d|apple gpu|apple/.test(s) ? 'apple'
    : /intel|uhd|iris|hd graphics|mali|adreno|powervr|radeon\(tm\) graphics|radeon graphics|vega \d+ graphics|radeon vega/.test(s) ? 'integrated'
    : 'unknown';
  const touch = typeof matchMedia === 'function' && (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1);
  const small = Math.min(screen.width, screen.height) < 820;
  return { gpu: gpu || 'unknown', cls, touch, phone: touch && small, cores: navigator.hardwareConcurrency || 0, mem: navigator.deviceMemory || 0, dpr: dpr() };
}

/** The opening guess from hints alone: measurement decides from there. */
function guessLevel(h) {
  if (h.cls === 'software' || h.phone) return 'low';
  if (h.cls === 'discrete') return 'high';
  if (h.cls === 'integrated') return (h.cores && h.cores <= 4) || (h.mem && h.mem <= 4) ? 'low' : 'medium';
  return 'medium';      // apple (could be an Intel Mac or an M-series), unknown: start in the middle, let it climb
}

/** Decide the build and the opening level. Returns the shared Q object every view module reads (Q.tier stays 'low' |
 *  'high' for the modules that only know the old two-way switch: 'low' iff the light build). */
export function detectQuality(test = false) {
  const h = gpuHints();
  // the #test scripts expect the old default (the full build at its top level) unless they ask for one
  const forced = (location.hash.match(/quality-(low|medium|high)/) || [])[1] || (test ? 'high' : null);
  const saved = test ? null : store.get('dh.quality');
  const manual = forced || (LEVELS.includes(saved) ? saved : null);
  const mem = store.json('dh.q.auto');
  const remembered = mem && mem.gpu === h.gpu && LEVELS.includes(mem.level) ? mem.level : null;
  const level = manual || remembered || guessLevel(h);
  // the light build: phones and software renderers, a manual 'low', or a GPU an earlier session settled at 'low'
  const build = manual ? (manual === 'low' ? 'low' : 'full') : (h.phone || h.cls === 'software' || remembered === 'low') ? 'low' : 'full';
  const P = PROFILE[build === 'low' ? 'low' : level];
  const ratio = build === 'low' ? Math.min(P.start, Math.max(1, dpr())) : Math.min(P.start, dpr() * 1.0, P.ratio[1]);
  return { tier: build === 'low' ? 'low' : 'high', build, level: build === 'low' ? 'low' : level, manual, auto: !manual, guess: guessLevel(h), remembered,
    hints: h, touch: h.touch, ratio, maxRatio: build === 'low' ? P.ratio[1] : P.ratio[1], minRatio: build === 'low' ? 0.5 : P.ratio[0], log: [] };
}

/** Whether to start on WebGL2 rather than WebGPU (an earlier session on this GPU found WebGPU slower, or a trial is due). */
export function backendPreference(gpu) {
  const b = store.json('dh.backend');
  if (!b || b.gpu !== gpu) return null;
  return b.use === 'webgl' || b.use === 'trial-webgl' ? 'webgl' : 'webgpu';
}

const pct = (a, p) => { if (!a.length) return 0; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/**
 * Runs the two loops and the #perf overlay. o: { Q, renderer, world, post, resize, backend() (name), started() (bool),
 * place() (the camera's place name), onBackendTrial(use) }.
 */
export class QualityController {
  constructor(o) {
    Object.assign(this, o);
    this.frames = [];       // { dt, cpu, tris, calls } for the last ~6 s
    this.t = 0; this.resT = 0; this.levelT = 0; this.settleT = 0; this.overT = 0; this.topT = 0; this.ceil = Infinity; this.ceilT = 0;
    this.backoff = {};      // level -> seconds until a step up to it is allowed again
    this.lastUp = null; this.places = new Map(); this.gpuMs = null; this.trial = null;
    this.perf = /(^|[#&-])perf\b/.test(location.hash);
    this.refresh = 1000 / 60;
    if (this.renderer.info) this.renderer.info.autoReset = false;      // summed over the whole frame (shadow, scene, bloom, output), reset in begin()
    this.apply(this.Q.level, 'start');
    if (this.perf) this._overlay();
  }

  get profile() { return PROFILE[this.Q.build === 'low' ? 'low' : this.Q.level]; }

  /** Set a level's knobs on everything (cheap: counts, flags, uniforms; one post shader rebuild when the post stack changes). */
  apply(level, why) {
    const Q = this.Q, prev = Q.level;
    Q.level = Q.build === 'low' ? 'low' : level;
    const P = this.profile;
    Q.minRatio = Q.build === 'low' ? 0.5 : P.ratio[0];
    Q.maxRatio = Q.build === 'low' ? P.ratio[1] : Math.min(P.ratio[1], Math.max(1, dpr()));
    try { this.world && this.world.setQuality && this.world.setQuality(P, Q.build); } catch (e) { console.warn('[quality] world', e); }
    try { this.post && this.post.setQuality && this.post.setQuality(P); } catch (e) { console.warn('[quality] post', e); }
    if (why !== 'start') {
      // step down: keep most of the resolution (the cheaper level pays for it); step up: start low and let the inner loop climb
      const r = prev && LEVELS.indexOf(level) < LEVELS.indexOf(prev) ? Math.min(Q.maxRatio, Q.ratio * 1.1) : Math.min(Q.ratio, P.start * 0.85);
      this.setRatio(r);
      Q.log.push({ t: Math.round(this.t), from: prev, to: Q.level, why, ratio: +Q.ratio.toFixed(2) });
      if (Q.log.length > 12) Q.log.shift();
    } else this.setRatio(Q.ratio);
    this.levelT = 0; this.settleT = 0; this.overT = 0; this.topT = 0; this.frames.length = 0;
  }

  setRatio(r) {
    const Q = this.Q, c = this.renderer.domElement, w = c.clientWidth || 1, h = c.clientHeight || 1;
    const capPx = Math.sqrt(this.profile.maxPx / (w * h));
    r = Math.max(Q.minRatio, Math.min(Q.maxRatio, capPx, r));
    if (Math.abs(r - (this._applied || 0)) < 0.005) { Q.ratio = r; return; }
    Q.ratio = r; this._applied = r; this.renderer.setPixelRatio(r); this.resize();
  }

  /** The manual setting: 'auto' or a level. Remembered. */
  setManual(v) {
    const Q = this.Q;
    if (v === 'auto') { Q.manual = null; Q.auto = true; store.set('dh.quality', null); this.backoff = {}; return; }
    Q.manual = v; Q.auto = false; store.set('dh.quality', v);
    this.apply(v, 'manual');
    this.setRatio(this.profile.start);
  }

  /** Needs a reload to take full effect (the light build cannot show medium or high detail, nor the full build low shaders). */
  needsReload(v) { const Q = this.Q; return v !== 'auto' && (Q.build === 'low') !== (v === 'low'); }

  begin() { this.cpu0 = performance.now(); }

  /** Called once a frame after drawing. dt: seconds since the last frame (rAF). */
  end(dt) {
    const Q = this.Q, info = this.renderer.info, cpu = performance.now() - (this.cpu0 || performance.now());
    const tris = info ? info.render.triangles : 0, calls = info ? info.render.drawCalls : 0;
    if (info) info.reset();
    if (!(dt > 0) || document.hidden) return;
    this.t += dt;
    const ms = dt * 1000;
    if (ms < 250) {      // a hitch longer than that is a tab switch or a GC storm, not the steady cost
      this.frames.push({ ms, cpu, tris, calls, t: this.t });
      while (this.frames.length && this.t - this.frames[0].t > 6) this.frames.shift();
      if (ms > 4 && ms < this.refresh * 0.97) this.refresh = Math.max(1000 / 165, this.refresh * 0.99 + ms * 0.01);      // learns the display's interval (a 120 Hz screen)
      if (this.place) { const k = this.place() || '?'; let p = this.places.get(k); if (!p) this.places.set(k, (p = { ms: [], tris: 0, calls: 0, n: 0, px: 0 })); p.ms.push(ms); if (p.ms.length > 600) p.ms.shift(); p.tris += tris; p.calls += calls; p.n++; p.px += this.renderPx(); }
    }
    if (this.perf && this.renderer.backend && this.renderer.backend.trackTimestamp && !this._gpuBusy) {
      this._gpuBusy = true; this.renderer.resolveTimestampsAsync('render').then((v) => { if (v > 0) this.gpuMs = this.gpuMs == null ? v : this.gpuMs * 0.9 + v * 0.1; }).catch(() => {}).finally(() => { this._gpuBusy = false; });
    }
    if (this.perf && (this._ovT = (this._ovT || 0) + dt) > 0.25) { this._ovT = 0; this._draw(); }
    this._control(dt);
  }

  /** Pixels in the colour target the scene is drawn to. */
  renderPx() { const c = this.renderer.domElement; return c.width * c.height; }

  _control(dt) {
    const Q = this.Q, opening = !this.started();
    this.resT += dt; this.levelT += dt; this.settleT += dt; this.ceilT -= dt;
    for (const k in this.backoff) this.backoff[k] -= dt;
    if (this.settleT < (opening ? 1.0 : 1.5)) return;          // shader compiles after a change: not the steady cost
    const recent = this.frames.filter((f) => this.t - f.t < (opening ? 0.8 : 1.2));
    if (recent.length < 12) return;
    const avg = mean(recent.map((f) => f.ms)), T = Math.max(1000 / 60, this.refresh) * 1.04;      // aim: 60 fps or the display's rate if slower
    const slow = avg > T * 1.15, atVsync = avg < T * 1.03;
    // ---- inner loop: resolution
    if (this.resT > (opening ? 0.4 : 0.6)) {
      if (slow && Q.ratio > Q.minRatio + 1e-3) {
        // GPU-bound frames scale roughly with pixels (ratio^2): step toward the target, never more than 20% at once
        this.setRatio(Q.ratio * Math.max(0.8, Math.min(0.95, Math.sqrt(T / avg)))); this.resT = 0;
        if (this.lastUp && this.t - this.lastUp < 3) { this.ceil = this.lastUpFrom; this.ceilT = 30; }      // the last step up cost too much: stay under it a while
        this.lastUp = null;
      } else if (atVsync && this.resT > (opening ? 1.5 : 4) && Q.ratio < Q.maxRatio - 1e-3) {
        const r = Math.min(Q.ratio * 1.06, this.ceilT > 0 ? this.ceil * 0.999 : Infinity);
        if (r > Q.ratio + 1e-3) { this.lastUpFrom = Q.ratio; this.lastUp = this.t; this.setRatio(r); this.resT = 0; }
      }
    }
    if (!Q.auto) return;
    // ---- outer loop: the level
    const i = LEVELS.indexOf(Q.level), atFloor = Q.ratio <= Q.minRatio + 0.02, atTop = Q.ratio >= Math.min(Q.maxRatio, Math.sqrt(this.profile.maxPx / Math.max(1, this.renderPx() / (Q.ratio * Q.ratio)))) - 0.02;
    this.overT = slow && atFloor ? this.overT + dt : Math.max(0, this.overT - dt * 2);
    this.topT = atVsync && atTop ? this.topT + dt : 0;
    if (i > 0 && this.overT > (opening ? 1.2 : 3) && Q.build !== 'low') {
      const to = LEVELS[i - 1]; this.backoff[Q.level] = Math.max(60, (this.backoffN = (this.backoffN || 30) * 2));
      this.apply(to, `slow ${avg.toFixed(1)}ms at ${Math.round(Q.ratio * 100)}%`); this._remember();
    } else if (i < 2 && Q.build !== 'low' && this.topT > (opening ? 3 : 20) && !(this.backoff[LEVELS[i + 1]] > 0)) {
      const p95 = pct(recent.map((f) => f.ms), 0.95);
      if (p95 < T * 1.3) { this.apply(LEVELS[i + 1], `headroom ${avg.toFixed(1)}ms at ${Math.round(Q.ratio * 100)}%`); this._remember(); }
    } else if (this.levelT > 12 && !this._rememberedAt) { this._remember(); this._rememberedAt = this.t; }
    // ---- the backend: a laptop must not sit on a slow WebGPU path
    if (this.onBackendTrial && this.levelT > 6 && !this._trialDone) {
      const score = i + Q.ratio - (slow ? avg / T - 1 : 0);
      this._trialDone = this.onBackendTrial({ score, slow: slow && i === 0 && atFloor, avg, opening });
    }
  }

  /** Measured overdraw of the scene pass: every surface drawn with one additive count into a small target, read back.
   *  Alpha-tested cards count their whole quad (their fragments run before the discard), and the sky dome counts once,
   *  as it is drawn. Returns fragments per pixel. (#perf: __perfOverdraw() in the console.) */
  async overdraw(scene, camera, scale = 0.25) {
    const R = this.renderer, c = R.domElement, w = Math.max(8, Math.round(c.width * scale)), h = Math.max(8, Math.round(c.height * scale));
    const rt = new THREE.RenderTarget(w, h, { type: THREE.UnsignedByteType });
    const m = this._odMat || (this._odMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(1 / 255, 1 / 255, 1 / 255), fog: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    const keep = { o: scene.overrideMaterial, bg: scene.background, fog: scene.fog, rt: R.getRenderTarget(), cc: R.getClearColor(new THREE.Color()), ca: R.getClearAlpha() };
    scene.overrideMaterial = m; scene.background = null; scene.fog = null;
    try { R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear(); R.render(scene, camera); }
    finally { R.setRenderTarget(keep.rt); scene.overrideMaterial = keep.o; scene.background = keep.bg; scene.fog = keep.fog; R.setClearColor(keep.cc, keep.ca); }
    const px = await R.readRenderTargetPixelsAsync(rt, 0, 0, w, h); rt.dispose();
    let sum = 0; for (let i = 0; i < px.length; i += 4) sum += px[i];
    if (R.info) R.info.reset();
    return sum / (w * h);
  }

  /** Rough fragments shaded per frame for the current level and size: scene x overdraw, shadow map, post passes. */
  shadedPx(overdraw) {
    const P = this.profile, c = this.renderer.domElement, px = c.width * c.height, Q = this.Q;
    const shadow = P.shadow * P.shadow * 1.3;
    const post = Q.build === 'low' ? px : px * ((P.bloom ? 1.25 : 0) + 1);      // bloom: bright pass + 5 blurred mips at half res and down; the output pass
    return { scene: Math.round(px * overdraw), shadow: Math.round(shadow), post: Math.round(post), total: Math.round(px * overdraw + shadow + post), msaa: P.msaa };
  }

  _remember() { if (this.Q.auto) store.set('dh.q.auto', JSON.stringify({ gpu: this.Q.hints.gpu, level: this.Q.level, t: Date.now() })); }

  /** Summary a tester can send back: frame times, the level history, per place. */
  report() {
    const Q = this.Q, f = this.frames, ms = f.map((x) => x.ms), c = this.renderer.domElement;
    const per = {};
    for (const [k, p] of this.places) per[k] = { frames: p.n, avgMs: +mean(p.ms).toFixed(2), p95Ms: +pct(p.ms, 0.95).toFixed(2), tris: Math.round(p.tris / p.n), calls: Math.round(p.calls / p.n), renderMpx: +(p.px / p.n / 1e6).toFixed(2) };
    return {
      backend: this.backend(), gpu: Q.hints.gpu, gpuClass: Q.hints.cls, cores: Q.hints.cores, memGB: Q.hints.mem, dpr: Q.hints.dpr,
      css: `${c.clientWidth}x${c.clientHeight}`, render: `${c.width}x${c.height}`, ratio: +Q.ratio.toFixed(3),
      build: Q.build, level: Q.level, mode: Q.auto ? 'auto' : 'manual', guess: Q.guess, remembered: Q.remembered,
      frameMs: { avg: +mean(ms).toFixed(2), p50: +pct(ms, 0.5).toFixed(2), p95: +pct(ms, 0.95).toFixed(2), p99: +pct(ms, 0.99).toFixed(2) },
      jsMs: { avg: +mean(f.map((x) => x.cpu)).toFixed(2), p95: +pct(f.map((x) => x.cpu), 0.95).toFixed(2) },
      gpuMs: this.gpuMs == null ? null : +this.gpuMs.toFixed(2), refreshMs: +this.refresh.toFixed(2),
      tris: f.length ? f[f.length - 1].tris : 0, calls: f.length ? f[f.length - 1].calls : 0,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null,
      body: typeof window !== 'undefined' && window.__bodyCheck ? (({ ok, stage, visible, tris, calls, pipelineError, fallback, firstFailure, message, vbuf }) => ({ ok, stage, visible, tris, calls, pipelineError, fallback, firstFailure, message, vbuf }))(window.__bodyCheck) : null,
      changes: Q.log, places: per,
    };
  }

  _overlay() {
    const d = document.createElement('div'); d.id = 'perf';
    d.style.cssText = 'position:fixed;right:8px;top:8px;z-index:99;background:rgba(0,0,0,0.72);color:#d8e0c8;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;padding:6px 8px;border-radius:4px;white-space:pre;pointer-events:auto;max-width:46ch';
    const pre = document.createElement('div'); d.appendChild(pre);
    const b = document.createElement('button'); b.textContent = 'copy report'; b.style.cssText = 'margin-top:4px;font:inherit;cursor:pointer';
    b.addEventListener('click', (e) => { e.stopPropagation(); const t = JSON.stringify(this.report(), null, 1); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { b.textContent = 'copied'; }, () => { console.log(t); b.textContent = 'see console'; }); setTimeout(() => { b.textContent = 'copy report'; }, 1500); });
    d.appendChild(b); document.body.appendChild(d); this._pre = pre;
    window.__perfReport = () => this.report();
    window.__perfOverdraw = async () => { const o = await this.overdraw(this.scene, this.camera); return { overdraw: +o.toFixed(2), shaded: this.shadedPx(o) }; };
  }

  _draw() {
    const r = this.report(), Q = this.Q;
    this._pre.textContent = [
      `${r.backend} · ${r.gpuClass} · ${r.gpu.slice(0, 40)}`,
      `level ${r.level} (${r.mode}, build ${r.build}) res ${Math.round(Q.ratio * 100)}% ${r.render}`,
      `frame ${r.frameMs.avg} avg  ${r.frameMs.p95} p95  ${r.frameMs.p99} p99 ms`,
      `js ${r.jsMs.avg} avg ${r.jsMs.p95} p95 ms${r.gpuMs != null ? `  gpu ${r.gpuMs} ms` : ''}`,
      `tris ${(r.tris / 1e3).toFixed(0)}k  calls ${r.calls}${r.heapMB ? `  heap ${r.heapMB} MB` : ''}`,
      r.body ? `body ${r.body.ok == null ? 'checking' : r.body.ok ? 'ok' : 'FAILED'}${r.body.fallback ? ' (FALLBACK material)' : ''} ${r.body.tris} tris${r.body.vbuf ? ` vb ${Math.max(r.body.vbuf.geometry, ...Object.values(r.body.vbuf.passes))}/${r.body.vbuf.max}` : ''}${r.body.ok === false || r.body.fallback ? ` vis=${r.body.visible} err=${(r.body.firstFailure || r.body).pipelineError}` : ''}` : 'body ?',
      ...Q.log.slice(-3).map((l) => `${l.t}s ${l.from}->${l.to} ${l.why}`),
    ].join('\n');
  }
}

/** The Quality select, put into the pause card and the start card next to the existing options. */
export function qualityMenu(ctl) {
  const els = [];
  const make = (before) => {
    if (!before) return;
    // a label, so the start card's click-anywhere-to-begin leaves it alone
    const row = document.createElement('label'); row.className = 'prow';
    const id = 'q' + els.length, lab = document.createElement('span'); lab.textContent = 'quality'; lab.style.cssText = 'font:500 13px var(--display);letter-spacing:0.1em;text-transform:uppercase;color:var(--ink-dim)';
    const sel = document.createElement('select'); sel.id = id;
    for (const v of ['auto', ...LEVELS]) { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); }
    const note = document.createElement('span'); note.className = 'small'; note.style.cssText = 'grid-column:1/-1;font-size:11px;opacity:0.7'; note.hidden = true;
    row.append(lab, sel, note); before.parentNode.insertBefore(row, before); els.push({ sel, note });
    sel.addEventListener('change', () => {
      const v = sel.value; ctl.setManual(v);
      for (const e of els) { e.sel.value = v; e.note.hidden = !ctl.needsReload(v); e.note.textContent = 'full effect after a reload'; }
    });
  };
  const byId = (id) => document.getElementById(id);
  make(byId('pVHS') && byId('pVHS').closest('label'));
  make(byId('sVHS') && byId('sVHS').closest('label'));
  for (const e of els) e.sel.value = ctl.Q.manual || 'auto';
}
