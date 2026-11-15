// Session telemetry and quick notes: what a play session was like, recorded without the player writing anything down.
// Out-of-band only: it reads the game's state (S, sim, mind, arena, audio) and never changes it, never pauses, never
// touches the pointer or the renderer. Every entry point is wrapped so a fault here can never reach the game; with no
// host (`window.claude` absent) or no `db` it falls back silently (notes stay in memory: "copy session"). See out/telemetry/TELEMETRY.md.
//
// Storage (host `db`, flat collections; nested arrays are stored as JSON strings):
//   sessions/<sid>        header: device, renderer, settings, lives, counts (rewritten on each flush, small)
//   chunks/<sid>_<n>      timeline rows (2 Hz) and the event log, sealed at ~60 kB and continued in <n+1>
//   notes/<sid>_<k>       one per note or mark: text, how, the 20 s state ring at 10 Hz, last thoughts/events, a thumbnail

/* global __BUILD__ */
const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : '2026-11-14';
export const TL_FIELDS = ['t', 'px', 'pz', 'yaw', 'pitch', 'spd', 'crouch', 'run', 'torch', 'flares', 'mode', 'rx', 'rz', 'rpsi', 'rv', 'beh', 'phase', 'focus', 'd', 'sees', 'facing', 'stance', 'hunger', 'arousal', 'interest', 'irritation', 'cert', 'fps'];
export const RING_FIELDS = ['t', 'px', 'pz', 'yaw', 'spd', 'crouch', 'rx', 'rz', 'rpsi', 'rv', 'beh', 'd', 'sees', 'facing', 'fps'];
const RING_N = 200, RING_DT = 0.1;            // 20 s at 10 Hz
const CHUNK_MAX = 60000, NOTE_MAX = 90000;    // bytes of JSON per document (the host lists documents under ~100 kB with data)
const FLUSH_S = 25;

// errors from the very first moment (before the game exists): buffered, then logged into the session
const early = [];
const errLine = (e) => { try { const s = (e && e.stack) || ''; const l = s.split('\n').map((x) => x.trim()).filter(Boolean); return (l[0] && l[0] !== String(e && e.message) ? l[0] : l[1] || '').slice(0, 200); } catch { return ''; } };
let onErr = (x) => { if (early.length < 50) early.push(x); };
try {
  window.addEventListener('error', (ev) => { try { onErr(['err', String((ev && ev.message) || 'error').slice(0, 300), ev && ev.error ? errLine(ev.error) : `${ev.filename || ''}:${ev.lineno || ''}`]); } catch {} });
  window.addEventListener('unhandledrejection', (ev) => { try { const r = ev && ev.reason; onErr(['rej', String((r && r.message) || r).slice(0, 300), errLine(r)]); } catch {} });
} catch {}

const r1 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
const r2 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const safe = (f, d = null) => { try { const v = f(); return v === undefined ? d : v; } catch { return d; } };
const rid = () => Math.random().toString(36).slice(2, 6);

/** A recorder that does nothing (telemetry off, or it could not be made). */
export const NO_TELEMETRY = { frame() {}, afterDraw() {}, flush() {}, notes: 0, off: true };

export function createTelemetry(o) {
  try { return make(o); } catch (e) { try { console.warn('[dino] telemetry off:', e); } catch {} return NO_TELEMETRY; }
}

function make(o) {
  const { S, sim, mind, arena, act, audio, camera, canvas, Q, ui, props, post } = o;
  const $ = (id) => document.getElementById(id);
  const T0 = performance.now(), now = () => (performance.now() - T0) / 1000, tt = () => r1(now());
  const startISO = new Date().toISOString();
  const sid = startISO.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z') + '-' + rid();

  // ------------------------------------------------------------ host capabilities (all optional, never awaited by the game)
  let db = null, dbState = 'pending';
  const host = safe(() => window.claude && typeof window.claude.use === 'function' ? window.claude : null);
  const use = (name) => { try { return Promise.resolve(host.use(name)).catch(() => null); } catch { return Promise.resolve(null); } };
  const timed = (p, ms) => Promise.race([p, new Promise((res) => setTimeout(() => res(null), ms))]);
  if (host) {
    timed(use('db'), 12000).then((d) => { db = d || null; dbState = db ? 'ok' : 'none'; log('tel', 'db', dbState); copyVis(); if (db) flush('db'); });
  } else { dbState = 'none'; }

  // ------------------------------------------------------------ the record
  const ev = [];              // event log of the current chunk: [t, type, ...]
  let tl = [];                // timeline rows of the current chunk
  const sealed = [];          // earlier chunks, kept in memory for "copy session": { n, t0, t1, tl, ev }
  let chunkN = 0, chunkT0 = 0, tlEvery = 0.5, tlAt = 0, ringAt = 0;
  const ring = new Array(RING_N); let ringI = 0, ringLen = 0;
  const notes = [];           // { k, t, how, text, ... }
  const lives = [[1, 0, null, null]];
  const counts = { thoughts: 0, events: 0, notes: 0, marks: 0, deaths: 0, errors: 0 };
  const recent = [];          // the last 30 events (any chunk), for notes
  const thoughts = [];        // the last 8 thoughts, for notes
  const log = (type, ...a) => {
    try {
      const e = [tt(), type, ...a]; ev.push(e); counts.events++;
      if (type !== 'perf' && type !== 'snd' && type !== 'sst') { recent.push(e); if (recent.length > 30) recent.shift(); }
      return e;
    } catch { return null; }
  };
  onErr = (x) => { counts.errors++; if (counts.errors <= 200) log(x[0], x[1], x[2]); };
  for (const x of early) onErr(x); early.length = 0;

  const settings = () => ({
    sound: safe(() => !!audio.on), vhs: safe(() => !!(post && post.vhs)), quality: safe(() => Q.level || Q.tier), auto: safe(() => Q.auto !== false),
    sens: r2(safe(() => S.sens)), invert: safe(() => !!S.invert), thoughts: safe(() => ui.flags.thoughts), debug: safe(() => !!ui.debug),
  });
  const header = () => ({
    kind: 'session', v: 1, s: sid, start: startISO, build: BUILD, device: safe(() => (Q.touch ? 'touch' : 'desktop')),
    vw: safe(() => window.innerWidth), vh: safe(() => window.innerHeight), dpr: r2(safe(() => window.devicePixelRatio)),
    backend: safe(() => o.backend()), tier: safe(() => Q.tier), level: safe(() => Q.level), ratio: r2(safe(() => Q.ratio)), gpu: safe(() => String(Q.hints.gpu || '').slice(0, 120)),
    seed: safe(() => o.SEED), settings: settings(), ua: safe(() => navigator.userAgent.slice(0, 300)),
    tlF: TL_FIELDS, ringF: RING_FIELDS, updated: new Date().toISOString(), dur: tt(), lives, counts, chunks: chunkN + 1, bytes: total(), db: dbState, tlEvery,
  });

  // ------------------------------------------------------------ sampling
  const fwd = () => { const m = camera.matrixWorld.elements; return [-m[8], -m[9], -m[10]]; };
  let lastPos = null;
  function state() {
    const c = camera.position, f = fwd(), yaw = Math.atan2(f[0], f[2]), pitch = Math.asin(Math.max(-1, Math.min(1, f[1])));
    const dx = sim.x - c.x, dz = sim.z - c.z, d = Math.hypot(dx, dz) || 1, hl = Math.hypot(f[0], f[2]) || 1;
    const facing = (f[0] * dx + f[2] * dz) / (hl * d) > 0.866 ? 1 : 0;
    const K = safe(() => mind.know), sees = K && K.seen && K.target && K.target.id === 'you' ? 1 : K && K.seen ? 2 : 0;      // 2: sees the camera (observe)
    const B = safe(() => mind.beh), beh = (B && B.name) || safe(() => mind.label) || '';
    const stick = safe(() => Math.hypot(S.stick.x, S.stick.y), 0);
    return { px: r1(c.x), pz: r1(c.z), yaw: r2(yaw), pitch: r2(pitch), crouch: S.crouchToggle || safe(() => S.you.crouch) ? 1 : 0,
      run: safe(() => S.keys.has('shift'), false) || stick > 0.95 ? 1 : 0, torch: safe(() => (props.torchOn ? 1 : 0), 0), flares: safe(() => S.kit.flare.n, null),
      mode: S.mode, rx: r1(sim.x), rz: r1(sim.z), rpsi: r2(sim.psi), rv: r1(sim.v), beh, phase: safe(() => B.phase || '', ''),
      focus: safe(() => mind.focus.kind, ''), d: r1(d), sees, facing, stance: safe(() => mind.stance, ''),
      hunger: r2(safe(() => mind.hunger)), arousal: r2(safe(() => mind.mood.arousal)), interest: r2(safe(() => mind.mood.interest)),
      irritation: r2(safe(() => mind.mood.irritation)), cert: r2(safe(() => mind.sum.cert)), fps: Math.round(1 / Math.max(fdt, 1e-3)) };
  }
  function sample(t) {
    const s = state();
    if (lastPos) s.spd = r1(Math.hypot(s.px - lastPos[0], s.pz - lastPos[1]) / Math.max(0.05, t - lastPos[2])); else s.spd = 0;
    lastPos = [s.px, s.pz, t]; lastSpd = s.spd;
    ring[ringI] = [r1(t), s.px, s.pz, s.yaw, s.spd, s.crouch, s.rx, s.rz, s.rpsi, s.rv, s.beh, s.d, s.sees, s.facing, s.fps];
    ringI = (ringI + 1) % RING_N; ringLen = Math.min(RING_N, ringLen + 1);
    if (t >= tlAt) { tlAt = t + tlEvery; tl.push(TL_FIELDS.map((k) => (k === 't' ? r1(t) : s[k] ?? null))); }
  }
  const ringCopy = () => { const out = [], nw = ring[(ringI - 1 + RING_N) % RING_N], t0 = (nw ? nw[0] : now()) - 20; for (let i = 0; i < ringLen; i++) { const r = ring[(ringI - ringLen + i + RING_N) % RING_N]; if (r && r[0] >= t0) out.push(r); } return out; };      // the 20 s before the newest row (paused or frozen: before the pause); fewer rows when frames are slow

  // ------------------------------------------------------------ what happens: polled each frame (cheap compares), and wrapped calls
  const seenTh = new WeakSet(); let lastBeh = null, lastPaused = false, lastDead = false, lastMode = S.mode, lastCrouch = false, lastLock = '', lastDev = S.dev, lastSet = '', deathEvt = null, lifeT0 = 0, lastAudio = {}, audioAt = 0;
  function poll(t) {
    sndPoll(t);
    // thoughts (the stream the pills show; newest last)
    const st = safe(() => mind.voice.stream);
    if (st && st.length) for (let i = Math.max(0, st.length - 3); i < st.length; i++) {
      const x = st[i]; if (!x || seenTh.has(x)) continue; seenTh.add(x); counts.thoughts++;
      const e = log('th', String(x.key || ''), String(x.kind || ''), String(x.text || '').slice(0, 120)); thoughts.push(e); if (thoughts.length > 8) thoughts.shift();
    }
    const B = safe(() => mind.beh), beh = (B && B.name) || safe(() => mind.label) || '';
    if (beh !== lastBeh) { const L = safe(() => mind.log[mind.log.length - 1]); log('beh', beh, safe(() => B.motive || B.phase || '', ''), L && L.name === beh ? String(L.reason || '').slice(0, 80) : ''); lastBeh = beh; }
    if (S.paused !== lastPaused) { lastPaused = S.paused; log('pause', S.paused ? 1 : 0); if (S.paused) { flush('pause'); pauseCard(); } else saveTyped(); }
    if (S.mode !== lastMode) { lastMode = S.mode; log('mode', S.mode); }
    const cr = !!S.crouchToggle; if (cr !== lastCrouch) { lastCrouch = cr; log('act', 'crouch', cr ? 1 : 0); }
    if (S.dev !== lastDev) { lastDev = S.dev; log('dev', String(S.dev)); }
    const lk = safe(() => S.lock.last, ''); if (lk && lk !== lastLock) { lastLock = lk; if (/refused/.test(lk)) log('lock', lk.slice(0, 160)); }
    if (!!S.dead !== lastDead) {
      lastDead = !!S.dead;
      if (S.dead) {
        const V = safe(() => arena.victim('you')), cause = (deathEvt && (deathEvt.cause || deathEvt.by)) || safe(() => V.cause) || '';
        counts.deaths++; const L = lives[lives.length - 1]; L[2] = r1(t); L[3] = String(cause);
        log('death', String(cause), safe(() => String(deathEvt.motive || ''), ''), r1(t - lifeT0), { F: RING_FIELDS, rows: ringCopy(), th: thoughts.slice(-6) });
        deathEvt = null; flush('death');
      }
    }
    if (t >= audioAt) {      // the #audio readout's first line, and the unlock line, whenever they change; plus settings
      audioAt = t + 2;
      const txt = safe(() => audio.debugText(), ''); if (txt) {
        const lines = txt.split('\n'), first = lines[0] || '', ctxl = lines.find((l) => l.startsWith('context:')) || '', un = lines.find((l) => l.startsWith('unlock:')) || '';
        for (const [k, v] of [['carrier', first], ['context', ctxl.replace(/,.*$/, '')], ['unlock', un.replace(/ · rebuilds.*$/, '')]]) if (v && lastAudio[k] !== v) { lastAudio[k] = v; log('audio', k, v.slice(0, 200)); }
      }
      const sj = JSON.stringify(settings()); if (sj !== lastSet) { if (lastSet) log('set', sj); lastSet = sj; }
    }
  }
  // sim events (the same tap ui.js uses: read them as the step produces them)
  const KEEP = { victim: 1, mind: { bite: 1, tear: 1, nudge: 1 }, herd: { killed: 1, alarm: 1 }, things: { hit: 1, stamped: 1 } };
  const REX = { roar: 1, growl: 1, clack: 1, worry: 1, butt: 1, swipe: 1, toss: 1, huff: 1 };
  const last = {}, recentSim = [];
  const step = arena.step.bind(arena);
  arena.step = (...a) => {
    const r = step(...a);
    try {
      for (const e of arena.events) {
        if (!e) continue;
        recentSim.push([now(), (e.src || 'rex') + ':' + e.type]); if (recentSim.length > 40) recentSim.shift();
        if (e.type === 'footfall') continue;
        if (e.type === 'death' && (!e.id || e.id === 'you')) deathEvt = e;
        const k = e.src ? KEEP[e.src] : null, keep = e.src ? k === 1 || (k && k[e.type]) : REX[e.type];
        if (!keep || e.type === 'wriggled') continue;
        const key = (e.src || 'rex') + e.type + (e.id || ''), t = now(); if (last[key] && t - last[key] < (e.type === 'huff' || e.type === 'alarm' ? 3 : 0.5)) continue; last[key] = t;
        log('ev', e.src || 'rex', e.type, e.id || '', String(e.cause || e.by || e.kind || '').slice(0, 30), r2(e.amt ?? e.health ?? e.speed ?? null));
      }
    } catch {}
    return r;
  };
  // the player's verbs
  const wrap = (name, fn) => { const f = act[name]; if (typeof f !== 'function') return; act[name] = function (...a) { const before = safe(() => S.kit.flare.n); const r = f.apply(this, a); try { fn(before, a); } catch {} return r; }; };
  wrap('throwFlare', (b) => { if (safe(() => S.kit.flare.n) < b) log('act', 'flare', safe(() => S.kit.flare.n)); });
  wrap('torch', () => log('act', 'torch', safe(() => (props.torchOn ? 1 : 0))));
  wrap('whistle', () => log('act', 'whistle'));
  wrap('shout', () => log('act', 'shout'));
  wrap('interact', () => {});
  wrap('climb', () => log('act', 'climb', safe(() => (S.you.up ? 1 : 0))));
  wrap('door', () => log('act', 'door'));
  wrap('respawn', () => { lives.push([lives.length + 1, tt(), null, null]); lifeT0 = now(); log('life', lives.length); });
  // pointer lock, visibility, context loss
  document.addEventListener('pointerlockchange', () => { try { log('lock', document.pointerLockElement ? 'on' : 'off'); } catch {} });
  document.addEventListener('pointerlockerror', () => { try { log('lock', 'error'); } catch {} });
  document.addEventListener('visibilitychange', () => { try { log('vis', document.hidden ? 'hidden' : 'visible'); if (document.hidden) flush('hidden'); } catch {} });
  window.addEventListener('pagehide', () => { try { log('vis', 'pagehide'); flush('pagehide'); } catch {} });
  try { canvas.addEventListener('webglcontextlost', () => log('ctx', 'webgl context lost')); canvas.addEventListener('webglcontextrestored', () => log('ctx', 'webgl context restored')); } catch {}
  try { const dev = o.renderer && o.renderer.backend && o.renderer.backend.device; if (dev && dev.lost) dev.lost.then((i) => { log('ctx', 'webgpu device lost', String((i && (i.reason + ' ' + i.message)) || '').slice(0, 200)); flush('lost'); }); } catch {}
  // frame-time windows: 10 s each
  const W = { t0: 0, n: 0, sum: 0, s50: 0, s100: 0, max: 0 };
  function perf(t, dt) {
    if (dt > 0) { W.n++; W.sum += dt; if (dt > 0.05) W.s50++; if (dt > 0.1) W.s100++; if (dt > W.max) W.max = dt; }
    if (t - W.t0 >= 10) { if (W.n) log('perf', r1(W.n / Math.max(W.sum, 1e-3)), W.s50, W.s100, Math.round(W.max * 1000), W.n, S.paused ? 1 : 0); W.t0 = t; W.n = W.sum = W.s50 = W.s100 = W.max = 0; }
  }

  // ------------------------------------------------------------ every sound the game starts
  // The audio object's methods are wrapped on this instance (src/view/audio.js is not touched). Public methods (roar, thump,
  // step, thud, stoneHit, flurry, thunder...) set the context: who asked for the sound and with what (distance, gain). The
  // primitives that actually start a source (_play, _snip, _burst, _tone, and _bed for the looping beds) are logged under that
  // context with their clip or filter and gain; the distance is the emitter's (or the last _place in the call). The per-frame
  // updater (breath -> _frame: the animal's gestures, chewing) is a context of its own, 'frame'. Repeats within a window
  // (1 s; 5 s once the session is large) are coalesced into one entry with a count. Each window that had a sound also logs
  // the state ('sst'): its behaviour, speed and gesture, the distance, your speed, the herd, the latest sim events, rain/hiss.
  //   ['snd', context, clip, count, maxGain, minDist, contextArgs]
  //   ['sst', beh, rexSpeed, distance, yourSpeed, herdMoving, herdNearest, rexGesture, recentSimEvents, rain, hiss, ctxState]
  const recentSnd = [];
  let sndCount = 0, sctx = '', sargs = '', sD = null, sFired = false, sWinT = 0, sWin = 1;
  const SB = new Map(), cr = (a) => a.slice(0, 4).map((x) => (typeof x === 'number' ? r2(x) : typeof x === 'string' ? x.slice(0, 24) : x && typeof x === 'object' ? (x.type || x.kind || 'obj') : x === undefined ? null : String(x).slice(0, 12))).join(',');
  const L = () => safe(() => audio._L(), null);
  function sndHit(clip, gain, dest) {
    sndCount++; sFired = true;
    let d = sD; const p = dest && dest.pos, l = p && L(); if (l) d = Math.hypot(p.x - l.x, p.y - l.y, p.z - l.z);
    const k = (sctx || '?') + '|' + clip; let b = SB.get(k);
    if (!b) SB.set(k, (b = { t: now(), ctx: sctx || '?', clip, n: 0, g: 0, d: null, a: sargs }));
    b.n++; if (typeof gain === 'number' && gain > b.g) b.g = gain; if (typeof d === 'number' && (b.d === null || d < b.d)) b.d = d;
  }
  function sndFlush(t) {
    if (!SB.size) return;
    const herd = safe(() => arena.herd.alive, []) || [], c = camera.position; let mv = 0, nd = null;
    for (const h of herd) { if (Math.abs(h.v || 0) > 0.3) mv++; const dd = Math.hypot(h.x - c.x, h.z - c.z); if (nd === null || dd < nd) nd = dd; }
    const rs = [...new Set(recentSim.filter((x) => x[0] > t - sWin - 0.5).map((x) => x[1]))].slice(-8).join(' ');
    log('sst', safe(() => (mind.beh && mind.beh.name) || mind.label, ''), r1(safe(() => sim.v)), r1(Math.hypot(sim.x - c.x, sim.z - c.z)), r1(lastPos ? lastSpd : null), mv, r1(nd),
      safe(() => (sim.act && sim.act.kind) || '', ''), rs, r2(safe(() => audio.rainLevel)), r2(safe(() => audio.hissLevel)), safe(() => audio.ctx.state, 'none'));
    for (const b of SB.values()) { const e = log('snd', b.ctx, b.clip, b.n, r2(b.g), r1(b.d), b.a); if (e) { e[0] = r1(b.t); recentSnd.push(e); } }
    while (recentSnd.length > 40) recentSnd.shift();
    SB.clear();
  }
  try {
    const proto = Object.getPrototypeOf(audio), names = Object.getOwnPropertyNames(proto).filter((n) => { const d = Object.getOwnPropertyDescriptor(proto, n); return d && typeof d.value === 'function'; });      // methods only (not own fields like R, not getters)
    const SKIP = new Set(['constructor', 'attach', 'resume', 'debugText', 'carrier', 'setVolume', 'ready', 'needsUnlock', 'testTone', 'occlusion', 'hiss', 'setRain', 'breath']);
    const fnOf = (n) => { try { return typeof audio[n] === 'function' ? audio[n] : null; } catch { return null; } };
    const ctxWrap = (n, label, logEmpty) => {
      const f = fnOf(n); if (!f) return;
      audio[n] = function (...a) {
        const pc = sctx, pa = sargs, pd = sD, pf = sFired; sctx = label || n; sargs = label ? '' : cr(a); sD = typeof a[0] === 'number' && n !== 'thump' ? a[0] : typeof a[1] === 'number' ? a[1] : null; sFired = false;
        try { return f.apply(this, a); } finally { try { if (logEmpty && !sFired) sndHit('-', null, null); } catch {} sctx = pc; sargs = pa; sD = pd; sFired = pf || sFired; }
      };
    };
    for (const n of names) if (!n.startsWith('_') && !SKIP.has(n)) ctxWrap(n, null, true);      // public: the sound's reason; '-' = asked, nothing started
    ctxWrap('breath', 'frame', false);                                                         // the per-frame voices
    const leaf = (n, pick) => { const f = fnOf(n); if (!f) return; audio[n] = function (...a) { const r = f.apply(this, a); try { const x = pick(a, r); if (x) sndHit(x[0], x[1], x[2]); } catch {} return r; }; };
    leaf('_play', (a, r) => (r ? [String(a[0]), a[3] ?? 1, a[1]] : null));
    leaf('_snip', (a, r) => (r ? ['clip:' + a[0], a[5], null] : null));
    leaf('_burst', (a) => ['noise:' + a[3] + Math.round(a[4] || 0), a[6], null]);
    leaf('_tone', (a) => ['tone:' + Math.round(a[2] || 0), a[5], null]);
    leaf('_bed', (a, r) => (r && !(audio.__bedSeen ||= new Set()).has(a[0]) ? (audio.__bedSeen.add(a[0]), ['bed:' + a[1], null, null]) : null));
    { const f = fnOf('_place'); if (f) audio._place = function (...a) { const d = f.apply(this, a); if (typeof d === 'number') sD = d; return d; }; }
    // the ui's own chimes (whistle, achievement ding) go straight to the context: the whistle via ui.whistle, the ding via the count
    const uw = ui && ui.whistle; if (typeof uw === 'function') ui.whistle = function (...a) { const pc = sctx; sctx = 'ui.whistle'; try { sndHit('chime:whistle', 0.07, null); return uw.apply(this, a); } finally { sctx = pc; } };
  } catch (e) { log('tel', 'sound wrap failed', String(e).slice(0, 100)); }
  let achvN = safe(() => ui.achv.count, 0), clipsLogged = false, lastSpd = 0;
  function sndPoll(t) {
    const an = safe(() => ui.achv.count, achvN); if (an > achvN) { const pc = sctx; sctx = 'ui.ding'; sndHit('chime:ding', 0.05, null); sctx = pc; } achvN = an;
    if (!clipsLogged && t > 1) {
      const st = safe(() => audio.clipState, ''); if (st && st !== 'loading' && st !== 'idle') {
        clipsLogged = true; const man = safe(() => Object.keys(audio.clipManifest.clips), []) || [], got = safe(() => Object.keys(audio.clips), []) || [];
        log('clips', st, man.join(' '), got.join(' '), safe(() => audio.clipFails, null));
      }
    }
    if (t - sWinT >= sWin) { sndFlush(t); sWinT = t; sWin = total() > 1.5e6 ? 5 : 1; }
  }

  // ------------------------------------------------------------ storage
  const sizes = new Map(), wr = new Map();
  function total() { let n = 0; for (const v of sizes.values()) n += v; return n; }
  let dbFail = 0;
  function put(col, id, data, json) {
    sizes.set(col + '/' + id, json.length);
    if (!db) return;
    let w = wr.get(col + '/' + id); if (!w) wr.set(col + '/' + id, (w = { busy: false, next: null, last: '' }));
    if (json === w.last && !w.busy) return;      // only on change
    w.next = { data, json }; if (!w.busy) pump(col, id, w);
  }
  function pump(col, id, w) {
    const { data, json } = w.next; w.next = null; w.busy = true;
    let p; try { p = db.collection(col).doc(id).set(data); } catch (e) { p = Promise.reject(e); }
    timed(Promise.resolve(p).then(() => true), 15000).then((ok) => { if (ok) { w.last = json; } else throw new Error('timeout'); })
      .catch((e) => { dbFail++; if (dbFail <= 5) log('tel', 'write failed', col, String((e && (e.code || e.message)) || e).slice(0, 120)); copyVis(); })
      .finally(() => { w.busy = false; if (w.next) pump(col, id, w); });
  }
  function chunkDoc() { return { kind: 'chunk', s: sid, n: chunkN, t0: chunkT0, t1: tt(), every: tlEvery, tl: JSON.stringify(tl), ev: JSON.stringify(ev) }; }
  function flush(why) {
    try {
      let doc = chunkDoc(), json = JSON.stringify(doc);
      if (json.length > CHUNK_MAX && (tl.length || ev.length)) {      // seal this one and start the next
        put('chunks', sid + '_' + chunkN, doc, json); sealed.push({ n: chunkN, t0: chunkT0, t1: doc.t1, tl, ev: ev.slice() });
        chunkN++; chunkT0 = doc.t1; tl = []; ev.length = 0; doc = chunkDoc(); json = JSON.stringify(doc);
      }
      put('chunks', sid + '_' + chunkN, doc, json);
      // the session's total: keep it near 2 MB by sampling the timeline less often (never by dropping notes, events or errors)
      const b = total(); tlEvery = b > 2e6 ? 5 : b > 1.5e6 ? 2 : b > 1e6 ? 1 : 0.5;
      const h = header(); h.flush = why; put('sessions', sid, h, JSON.stringify(h));
    } catch {}
  }
  setInterval(() => flush('timer'), FLUSH_S * 1000);
  // a chunk that grows fast (many events) is sealed early, between timer flushes
  let sizeAt = 0;

  // ------------------------------------------------------------ notes
  let shotWant = null, noteK = 0;
  function newNote(how) {
    const t = tt(), k = ++noteK;
    const n = { kind: 'note', s: sid, k, t, at: new Date().toISOString(), how, text: '', life: lives.length, ringF: RING_FIELDS, ring: ringCopy(),
      thoughts: thoughts.slice(-6), events: recent.slice(-15).filter((e) => e[1] !== 'th'), now: safe(() => state()), sounds: [...recentSnd.slice(-20), ...[...SB.values()].map((b) => [r1(b.t), 'snd', b.ctx, b.clip, b.n, r2(b.g), r1(b.d), b.a])], shot: null, shotWhy: 'pending', why: '' };
    Object.assign(n, safe(() => o.replayInfo && o.replayInfo()) || {});      // taken in the death cam: where in the tape (replay, replayT, positions)
    shotWant = n; return n;
  }
  function saveNote(n) {
    try {
      if (!n.saved) { n.saved = true; notes.push(n); counts[n.how === 'mark' ? 'marks' : 'notes']++; log('note', n.k, n.how, n.text.slice(0, 300)); }
      const doc = { ...n, ring: JSON.stringify(n.ring), thoughts: JSON.stringify(n.thoughts), events: JSON.stringify(n.events), now: JSON.stringify(n.now), sounds: JSON.stringify(n.sounds) }; delete doc.saved;
      let json = JSON.stringify(doc); if (json.length > NOTE_MAX) { doc.shot = null; doc.shotWhy = 'too big'; json = JSON.stringify(doc); }
      put('notes', sid + '_' + n.k, doc, json); flush('note'); countLine();
    } catch {}
  }
  function grab() {
    const n = shotWant; shotWant = null; if (!n) return;
    try {
      const c = canvas, w = 320, h = Math.max(1, Math.round((320 * c.height) / Math.max(1, c.width)));
      if (!c.width || !c.height) { n.shotWhy = 'no canvas'; return; }
      const t = document.createElement('canvas'); t.width = w; t.height = h; const g = t.getContext('2d', { willReadFrequently: true });
      g.drawImage(c, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data; let lit = 0;
      for (let i = 0; i < d.length; i += 4 * 61) if (d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] > 12) lit++;
      if (lit < 4) { n.shotWhy = 'blank'; return; }
      n.shot = t.toDataURL('image/jpeg', 0.5); n.shotWhy = '';
    } catch (e) { n.shotWhy = 'error ' + ((e && e.name) || ''); }
    if (n.saved) saveNote(n);
  }
  const hint = (t) => { try { ui.note(t); } catch {} };
  /** A mark: the moment, with the 20 s before it, at once; the game neither pauses nor lets go of the pointer. */
  function mark(why = '') { const n = newNote('mark'); n.why = why; setTimeout(() => saveNote(n), 120); hint('marked'); return n; }
  function typed(text) { text = String(text || '').trim(); if (!text) return; const n = newNote('typed'); n.text = text.slice(0, 1000); setTimeout(() => saveNote(n), 120); }
  // ------------------------------------------------------------ the note box: T (or the note button) freezes the game where it is, without
  // the pause card, and opens a small comment box; send (Enter, or the button) saves the note with the context taken at the
  // key press, unfreezes and asks for the pointer again from that same gesture; Esc discards it and unfreezes. An empty send
  // saves a bare mark. Gamepad: R3 drops a bare mark without freezing.
  const NOTE_KEY = 't';
  const box = $('noteBox'), ta = $('noteTa'), send = $('noteSend'), shield = $('noteShield');
  let open = null;
  function openBox(why) {
    if (open || !box || !ta) { if (!box || !ta) mark(why); return; }
    const n = newNote('typed'); n.why = why;      // the context, first: before anything else changes
    if (!o.freeze || !o.freeze(true)) { mark(why); return; }
    open = { n, t: performance.now() }; log('freeze', 1); ta.value = ''; box.hidden = false; if (shield) shield.hidden = false; place();
    try { ta.focus({ preventScroll: true }); } catch {}      // inside the key press or tap: iOS shows its keyboard only then
  }
  function closeBox(save) {
    const O = open; if (!O) return; open = null;
    const text = ta.value.replace(/\s+$/, '').slice(0, 2000); box.hidden = true; if (shield) shield.hidden = true;
    try { ta.blur(); } catch {}
    if (save) { const n = O.n; n.text = text.trim(); n.how = n.text ? 'typed' : 'mark'; n.frozen = r1((performance.now() - O.t) / 1000); saveNote(n); hint(n.text ? 'sent' : 'marked'); }
    else { if (shotWant === O.n) shotWant = null; log('act', 'note cancelled'); }
    log('freeze', 0); try { o.freeze(false); } catch {}      // unfreeze; main.js asks for the pointer from this same gesture
  }
  // keep the box above the on-screen keyboard (iOS: the visual viewport shrinks, the layout one does not)
  function place() {
    try {
      const vv = window.visualViewport; if (!box) return;
      const kb = vv ? Math.max(0, window.innerHeight - (vv.height + vv.offsetTop)) : 0;
      box.style.bottom = kb > 40 ? `${Math.round(kb + 10)}px` : '';
    } catch {}
  }
  try { if (window.visualViewport) { window.visualViewport.addEventListener('resize', () => { if (open) place(); }); window.visualViewport.addEventListener('scroll', () => { if (open) place(); }); } } catch {}
  if (ta) ta.addEventListener('keydown', (e) => {
    try {
      e.stopPropagation();      // nothing typed here reaches the game (main.js and ui.js listen on window)
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); closeBox(true); }
      else if (e.key === 'Escape') { e.preventDefault(); closeBox(false); }
    } catch {}
  });
  if (ta) ta.addEventListener('keyup', (e) => e.stopPropagation());
  if (ta) ta.addEventListener('input', () => { try { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; } catch {} });
  if (send) { send.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); }); send.addEventListener('click', (e) => { e.stopPropagation(); closeBox(true); }); }
  if (shield) for (const ev of ['pointerdown', 'pointerup', 'click', 'wheel']) shield.addEventListener(ev, (e) => { e.stopPropagation(); if (ev === 'pointerdown') { e.preventDefault(); try { ta.focus({ preventScroll: true }); } catch {} } }, { passive: false });
  window.addEventListener('keydown', (e) => {
    try {
      if (!S.started || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.target && e.target.closest && e.target.closest('input, select, textarea')) return;
      if (e.key.toLowerCase() !== NOTE_KEY || S.paused || S.frozen) return;      // (open while dead too: the death cam and the card)
      e.preventDefault();      // the letter must not land in the box it opens
      openBox('key');
    } catch {}
  });
  // the note button (top-right, with ? and pause): the same box, on every device
  const btn = $('noteBtn');
  if (btn) {
    btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
    btn.addEventListener('click', (e) => { try { e.stopPropagation(); if (!S.paused) openBox('button'); } catch {} });
  }
  // gamepad R3 (button 11): a bare mark
  let padPrev = false;
  function padPoll() {
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null; if (!gp) { padPrev = false; return; }
    const b = !!(gp.buttons[11] && gp.buttons[11].pressed); if (b && !padPrev && S.started && !S.paused && !S.dead && !S.frozen) mark('pad'); padPrev = b;
  }
  // the pause card: a one-line note, the count, and (only when the data cannot leave the page) "copy session"
  const pIn = $('pNote'), pCount = $('pNotes'), pCopy = $('pCopy');
  function countLine() { if (pCount) { const n = notes.length; pCount.textContent = n ? `${n} note${n === 1 ? '' : 's'} this session` : ''; } }
  function saveTyped() { if (pIn && pIn.value.trim()) { typed(pIn.value); pIn.value = ''; } }
  function pauseCard() { countLine(); copyVis(); }
  if (pIn) pIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveTyped(); if (pCount) pCount.textContent = 'saved'; setTimeout(countLine, 1400); } });
  function copyVis() { if (pCopy) pCopy.hidden = !(dbState === 'none' || dbFail > 0); }
  if (pCopy) pCopy.addEventListener('click', () => {
    const txt = summary(); const done = (m) => { pCopy.textContent = m; setTimeout(() => { pCopy.textContent = 'copy session'; }, 2000); };
    const fallback = () => { try { const ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); done(ok ? 'copied' : 'copy refused'); } catch { done('copy refused'); } };
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => done('copied'), fallback); else fallback(); } catch { fallback(); }
  });
  copyVis(); countLine();
  /** The session as one pasteable line: header, every event (death rings left out), a coarse timeline, the notes without rings. */
  function summary() {
    try {
      const all = [...sealed.flatMap((c) => c.ev), ...ev].map((e) => (e[1] === 'death' ? e.slice(0, 5) : e));
      const rows = [...sealed.flatMap((c) => c.tl), ...tl], step = Math.max(1, Math.round(rows.length / 400));
      const ns = notes.map((n) => ({ k: n.k, t: n.t, replay: n.replay, replayT: n.replayT, rpx: n.rpx, rpz: n.rpz, rhx: n.rhx, rhz: n.rhz, how: n.how, text: n.text, why: n.why, now: n.now, thoughts: n.thoughts, sounds: n.sounds, ring: n.ring.filter((_, i) => i % 10 === 0) }));
      return 'DINO-SESSION ' + JSON.stringify({ header: header(), ev: all, tl: rows.filter((_, i) => i % step === 0), notes: ns });
    } catch (e) { return 'DINO-SESSION failed ' + e; }
  }

  // ------------------------------------------------------------ per frame (main.js): cheap
  let lastF = 0, fdt = 1 / 60;      // real frame time, smoothed (the game's S.fps is built from a clamped step)
  log('start', BUILD, safe(() => o.backend()), safe(() => Q.level || Q.tier));
  const api = {
    sid, get notes() { return notes.length; }, flush, summary, mark, typed, openBox, get open() { return !!open; }, get db() { return dbState; }, get rate() { return tlEvery; },
    frame(dtReal) {
      try {
        const t = now(), dt = lastF ? t - lastF : 0; perf(t, dt); lastF = t; if (dt > 0) fdt += (Math.min(dt, 2) - fdt) * 0.1; poll(t);      // real frame time (main's dt is clamped at 0.1 s)
        padPoll();
        if (!S.paused && !S.frozen && t >= ringAt) { ringAt = t + RING_DT; sample(t); }
        if (++sizeAt > 600) { sizeAt = 0; if (JSON.stringify(ev).length + tl.length * 150 > CHUNK_MAX) flush('size'); }
      } catch {}
    },
    /** Right after the frame is drawn: the only moment the canvas can be read without preserveDrawingBuffer. */
    afterDraw() { if (shotWant) grab(); },
    /** Debug/test handles (read only). */
    _peek: () => ({ ev: ev.length, tl: tl.length, chunks: chunkN, notes: notes.length, bytes: total(), db: dbState, snd: sndCount }),
  };
  return api;
}
