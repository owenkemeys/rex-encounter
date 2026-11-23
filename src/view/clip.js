// Save the death replay as a video file (the owner: sharing replays is "core to the virality").
// Picture: the CCTV lettering (CAM, mount, PLAYBACK, time stamp) is drawn inside the post pipeline's own canvas (post.js makeCCTVOSD), so the game
// canvas already holds exactly what the player sees. Each rendered frame is copied (drawImage, right after the render call, which is the one moment
// both the WebGL2 and the WebGPU canvas can be read) onto a hidden fixed-size 2D canvas, letterboxed to 1280x720 (720x1280 on a portrait screen),
// with a small caption bug; that canvas is captured at 30 fps. Sound: audio.clipStream() (audio.js, `// clip`) taps the same signal the speakers get,
// after the camera-microphone filter. Nothing here throws into the game loop.
import { tune, tuneGroup } from './tune.js';      // tune
export const CAPT = { size: 1, shadow: 0.85 };      // tune: the caption's size (x) and the strength of its shadow
{ tuneGroup('Clip and closing card', { order: 90 }); tune('Clip and closing card', 'Caption size (x)', CAPT, 'size', 0.4, 3, 0.05, null, 'clip.captionSize'); tune('Clip and closing card', 'Caption shadow strength', CAPT, 'shadow', 0, 1, 0.01, null, 'clip.captionShadow'); }      // tune
export const CLIP_CAPTION = 'rex encounter · alpha';      // burned into a corner of every clip: change it here
import { facts as cardFacts, pick as cardPick, makeTape, note as cardNote, LEN as CARD_LEN } from './closeout.js';      // closeout
import { incidentNo } from '../runs.js';
// clipsound: every candidate names a video AND an audio codec; a stream that has an audio track never gets a video-only type (some browsers then drop the sound).
const MIMES_AV = ['video/mp4;codecs="avc1.640028,mp4a.40.2"', 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs="avc1.640028,opus"', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=h264,opus', 'video/webm;codecs=av1,opus', 'video/mp4', 'video/webm'];      // the last two: container only, the audio track is in the stream so the browser adds its own codec (iOS Safari: mp4 + AAC)
const MIMES_V = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
export const clipMimes = (withAudio) => (withAudio ? MIMES_AV : MIMES_V).filter((m) => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } });
const pad = (n) => String(n).padStart(2, '0');

export function clipSupported() {
  try { return typeof MediaRecorder === 'function' && typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'; } catch { return false; }
}

export function createClip({ getCanvas, audio, tape, extra, onCard }) {      // closeout: `tape` the Replay, `extra` () => what the game knew at death (see closeout.js), `onCard(live)` the closing card is up
  // Recording is by default (the owner): the automatic death replay is recorded as it plays, so the clip is finished when the menu comes up. `tagged` recordings
  // (a clip taken in play, SAVE CLIP after a skipped replay) show a small "recording" tag on screen; none ever shows anything in the video.
  const C = { active: false, state: 'idle', blob: null, name: '', mime: '', dl: null, error: '', frames: 0, tagged: false, wantSave: false, autoOff: false, guarded: false, onState: null };
  let closing = false, ct = 0, tp = null, ov = null, overlayG = null, recent = [], cardInfo = null, ovKey = '', ovTp = null;
  let rec = null, cv = null, g = null, W = 1280, H = 720, chunks = [], stream = null, cancelled = false, done = null;
  const base = clipSupported();
  // the hand-over paths, checked once now: the Claude artifact's downloads capability (asked now, it may take a while to answer: 3 s), the share sheet (files), a plain download link
  const claudeHas = (() => { try { return !!(window.claude && typeof window.claude.use === 'function'); } catch { return false; } })();
  const shareOK = (() => { try { const f = new File([new Blob(['x'], { type: 'video/webm' })], 'a.webm', { type: 'video/webm' }); return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [f] })); } catch { return false; } })();
  const linkOK = (() => { try { if (window.self === window.top) return true; void window.top.location.href; return true; } catch { return false; } })();      // a page in a foreign frame cannot be trusted to allow a download
  let dlDone = !claudeHas;
  if (claudeHas) { try { Promise.race([Promise.resolve(window.claude.use('downloads')), new Promise((r) => setTimeout(() => r(null), 3000))]).then((d) => { C.dl = d || null; dlDone = true; emit(); }, () => { dlDone = true; emit(); }); } catch { dlDone = true; } }
  /** Could any hand-over path possibly work in this view? No: no recording, no SAVE CLIP button. */
  C.paths = () => !!(C.dl || (claudeHas && !dlDone) || shareOK || linkOK);
  Object.defineProperty(C, 'supported', { get: () => base && C.paths() });
  function emit() { try { C.onState && C.onState(); } catch {} }
  C.canShare = () => { try { return !!(C.file && navigator.canShare && navigator.canShare({ files: [C.file] })); } catch { return false; } };
  C.hasDownloads = () => !!C.dl;
  C.hasClip = () => !!C.blob || C.state === 'finishing';      // a finished (or finishing) clip of this death exists
  C.canRecord = () => C.supported && !C.autoOff;
  function pick(withAudio) { const l = clipMimes(withAudio); return l.length ? l[0] : ''; }      // '' = let the browser choose (it includes audio when the stream has it)
  const stamp = () => { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; };
  // guard (low-end machines): the frame time of the game while it plays is kept (C.tick, from main.js, only while the replay is not on); if the replay's
  // frame time, averaged over 90 frames of footage, is more than double that AND slower than 22 fps, the recording is stopped and thrown away, and no more
  // are made by default this session. (Not measurable on the build machine: unverified on a phone.) Recordings asked for by the player are not guarded.
  let ema = 0, gsum = 0, gn = 0, lastF = 0, baseMs = 0;
  C.tick = (dt) => { if (C.active || dt <= 0 || dt > 0.25) return; ema = ema ? ema * 0.98 + dt * 1000 * 0.02 : dt * 1000; };
  /** Begin recording (call right after the replay has started). Returns true if recording runs. `tagged`: show the small on-screen tag (a recording the player asked for). */
  C.start = (live = false, tagged = false) => {
    if (C.active || !C.supported) return false;
    C.live = !!live; C.tagged = !!tagged; C.t0 = performance.now(); baseMs = Math.max(8, ema || 16.7); gsum = gn = 0; lastF = 0;
    C.len = (tape && tape.duration || 0) + CARD_LEN;      // the video's length as it plays (wall-clock time on a slow machine is longer)
    try {
      const src = getCanvas(); if (!src) return false;
      const portrait = src.clientHeight > src.clientWidth; W = portrait ? 720 : 1280; H = portrait ? 1280 : 720;
      cv = document.createElement('canvas'); cv.width = W; cv.height = H; g = cv.getContext('2d', { alpha: false });
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      stream = cv.captureStream(30);
      // clipsound: the audio track goes in BEFORE the recorder exists (a track added after start() is ignored). A CLONE: teardown stops the clone, never the tap's own track.
      let as = null; try { as = audio && audio.clipStream ? audio.clipStream() : null; } catch {}
      if (as) for (const t of as.getAudioTracks()) { try { if (t.readyState === 'live') stream.addTrack(t.clone()); } catch {} }
      try { if (audio && audio.ctx && audio.ctx.state !== 'running') audio.ctx.resume(); } catch {}      // clipsound: the recorder starts anyway (the track is already in it, so nothing is lost; a context that wakes late only leaves the first frames quiet)
      const withAudio = stream.getAudioTracks().length > 0; C.audioInfo = { hasAudioTrack: withAudio, peakDb: -Infinity, ctxState: audio && audio.ctx ? audio.ctx.state : 'none' };
      try { audio && audio.clipLevel && audio.clipLevel(true); } catch {}
      C.mime = pick(withAudio); const opt = { videoBitsPerSecond: 4e6, audioBitsPerSecond: 128e3 }; if (C.mime) opt.mimeType = C.mime;
      try { rec = new MediaRecorder(stream, opt); } catch (e1) { if (!opt.mimeType) throw e1; delete opt.mimeType; rec = new MediaRecorder(stream, opt); }      // clipsound: a type the browser would not take: let it choose (iOS: mp4)
      C.mime = rec.mimeType || opt.mimeType || '';
      chunks = []; cancelled = false; C.blob = null; C.file = null; C.frames = 0; C.error = '';
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      done = new Promise((res) => { rec.onstop = () => res(); rec.onerror = () => res(); });
      rec.start(1000); try { audio && audio.tapeLoad && audio.tapeLoad(); } catch {} meter(true); C.active = true; C.state = 'recording'; tag(C.tagged); emit();
      return true;
    } catch (e) { C.error = String(e && e.message || e); C.active = false; C.state = 'idle'; try { rec && rec.state !== 'inactive' && rec.stop(); } catch {} rec = null; return false; }
  };
  // clipsound: self-check. The peak of the tap while recording; read at finish. Nothing shows to the player; window.__rex.clip.audioInfo holds it.
  let mt = null;
  function meter(on) {
    try { clearInterval(mt); mt = null; if (on && audio && audio.clipLevel) mt = setInterval(() => { try { const p = audio.clipLevel(false); if (C.audioInfo) { if (p > C.audioInfo.peakDb) C.audioInfo.peakDb = p; const st = audio.ctx && audio.ctx.state; if (st && st !== 'running') { C.audioInfo.suspect = true; C.audioInfo.ctxState = st; try { audio.ctx.resume(); } catch {} } } } catch {} }, 40); } catch {}
  }
  /** The tape is held (T, the note box): the recorder waits too. */
  C.pause = (on) => { try { if (!rec) return; if (on && rec.state === 'recording') rec.pause(); else if (!on && rec.state === 'paused') { rec.resume(); lastF = 0; } } catch {} };
  /** Copy the game canvas onto the clip canvas. Call straight after the render call, every frame while recording or while the card is on. */
  C.frame = () => {
    if (closing) { drawClose(); return; }      // closeout
    if (!C.active || !g) return;
    if (!C.tagged && rec && rec.state === 'recording') {      // the guard
      const now = performance.now(); if (lastF) { const d = now - lastF; if (d < 500) { gsum += d; gn++; } } lastF = now;
      if (gn >= 90) { const avg = gsum / gn; gsum = gn = 0; if (avg > 2 * baseMs && avg > 45) { C.autoOff = true; C.guarded = true; C.cancel(); return; } }
    }
    try {
      const src = getCanvas(), sw = src.width, sh = src.height; if (!sw || !sh) return;
      const k = Math.min(W / sw, H / sh), dw = Math.round(sw * k), dh = Math.round(sh * k), dx = (W - dw) >> 1, dy = (H - dh) >> 1;
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.drawImage(src, 0, 0, sw, sh, dx, dy, dw, dh);
      // the caption bug in the overlay's own style (bold monospace, soft shadow, light grey-green), bottom right, sized like the date stamp on the left
      const cw = src.clientWidth || sw, ch = src.clientHeight || sh, sc = dh / ch, fs = Math.round(Math.max(12, Math.min(18, Math.min(cw, ch) * 0.034)) * sc * CAPT.size), m = Math.max(12, Math.min(cw, ch) * 0.035) * sc;
      g.font = `bold ${fs}px "Lucida Console", "Courier New", monospace`; g.textBaseline = 'top'; g.textAlign = 'right';
      const x = dx + dw - m, y = dy + dh - m - fs; g.fillStyle = `rgba(0,0,0,${CAPT.shadow})`; g.fillText(CLIP_CAPTION, x + 1, y + 1); g.fillStyle = 'rgba(236,244,236,1)'; g.fillText(CLIP_CAPTION, x, y);
      C.frames++;
    } catch (e) { C.error = String(e && e.message || e); }
  };

  // ---- closeout: when the tape has ended the closing card (src/view/closeout.js, CARD_SECONDS) is shown, and recorded when a recording runs, then the file is finished
  C.note = (kind) => { try { if (tape) cardNote(kind, tape.n + tape.acc * 30); } catch {} };      // whistles and shouts (noises, not taped events)
  try { const r = JSON.parse(localStorage.getItem('rex.closeout.recent') || '[]'); if (Array.isArray(r)) recent = r.filter((x) => Number.isInteger(x)).slice(-8); } catch {}
  function remember(i) { recent.push(i); if (recent.length > 8) recent.shift(); try { localStorage.setItem('rex.closeout.recent', JSON.stringify(recent)); } catch {} }
  function chooseLine(live) {
    let fx = {}; try { const ex = extra ? extra() : {}; fx = cardFacts(tape, { ...ex, live: !!live, deaths: live ? Math.max(0, (ex.deaths | 0) - 1) : ex.deaths }); } catch {}
    let r; try { r = cardPick(fx, Math.random, recent); } catch { r = { text: 'Please enjoy the exhibit responsibly.', index: -1, id: 'x' }; }
    if (r.index >= 0) remember(r.index);
    return { text: r.text, id: r.id, no: incidentNo(), facts: fx, live: !!live, story: live ? '' : fx.story || '' };
  }
  let deathLine = null;
  /** The advice line for this death, chosen once so the death menu and the closing card agree. */
  C.lineFor = () => deathLine || (deathLine = chooseLine(false));
  C.resetLine = () => { deathLine = null; C.wantSave = false; C.discard(); C.dropCard(); };      // a new life: nothing of the old death stays
  C.closing = () => closing;
  /** Called every frame from main.js once the tape is over (recording or not): true while the card is still on, false when it is time to finish. */
  C.card = (dt) => {
    if (!closing) {
      closing = true; ct = 0; cardInfo = C.live ? chooseLine(true) : C.lineFor(); C.cardInfo = cardInfo;
      tp = null; if (C.active && g) { try { tp = makeTape(W, H, cardInfo.text, cardInfo.no, undefined, C.live, cardInfo.story); } catch (e) { C.error = String(e && e.message || e); } }
      try { ov = document.createElement('canvas'); ov.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;background:#000;z-index:11;pointer-events:auto'; document.body.appendChild(ov); overlayG = ov.getContext('2d'); ovKey = ''; } catch { ov = null; }      // the player's own view of the card, laid out for the window (not the recording's size)
      try { audio && audio.mic && audio.mic(true, true, 0.08); } catch {}      // the world goes quiet, on the speakers and in the recording: the card is silent but for the PA chime
      try { onCard && onCard(C.live); } catch {}
    }
    ct += Math.min(dt, 0.1);
    return ct < CARD_LEN;
  };
  function drawClose() {
    if (!cardInfo) return;
    try {
      const stamp = (tape && tape.stampMs ? tape.stampMs : Date.now()) + ct * 1000;
      if (tp && g && C.active) tp.frame(g, ct, stamp);
      if (overlayG && ov) {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5); let w = Math.max(200, Math.round(window.innerWidth * dpr)), h = Math.max(200, Math.round(window.innerHeight * dpr)); const k = Math.min(1, 1600 / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
        if (ovKey !== w + 'x' + h) { ovKey = w + 'x' + h; ov.width = w; ov.height = h; ovTp = makeTape(w, h, cardInfo.text, cardInfo.no, undefined, C.live, cardInfo.story); }
        ovTp.frame(overlayG, ct, stamp);
      }
      C.frames++;
    } catch (e) { C.error = String(e && e.message || e); }
  }
  /** Under the death menu the card stays up as the tape's last frame, paused and dimmed so the menu over it reads. */
  C.dim = (on) => { document.body.classList.toggle('notice', !!(on && ov)); if (ov) ov.style.filter = on ? 'brightness(0.3)' : ''; };
  /** Take the card off the screen (a new replay, a new life, back to the game). */
  C.dropCard = () => { document.body.classList.remove('notice'); closing = false; ct = 0; tp = null; ovTp = null; cardInfo = null; C.live = false; if (ov) { try { ov.remove(); } catch {} } ov = null; overlayG = null; ovKey = ''; };
  /** For checking the look without a death: the card as it is at tape time t, drawn on a fresh canvas of the given size. */
  C.previewCard = (w, h, line, t = 2, no = '0047', story = '') => { const c = document.createElement('canvas'); c.width = w; c.height = h; makeTape(w, h, line, no, undefined, false, story).frame(c.getContext('2d'), t, Date.now()); return c; };

  // ---- on screen only, never in the video: the small "recording" tag (recordings the player asked for) and, after a clip taken in play, the one small prompt
  const MONOF = "'IBM Plex Mono','Lucida Console','Courier New',monospace";
  function ensureStyle() { if (!document.getElementById('clipStyle')) { const st = document.createElement('style'); st.id = 'clipStyle'; st.textContent = '@keyframes clipblink{0%,55%{opacity:1}56%,100%{opacity:.15}} #clipReady button{font:inherit;cursor:pointer}'; document.head.appendChild(st); } }
  let tg = null;
  function tag(on) {
    try {
      if (!on) { if (tg) { tg.remove(); tg = null; } return; }
      if (tg) return; ensureStyle();
      tg = document.createElement('div'); tg.id = 'clipTag';
      tg.style.cssText = `position:fixed;top:calc(env(safe-area-inset-top,0px) + 10px);right:calc(env(safe-area-inset-right,0px) + 12px);z-index:60;pointer-events:none;display:flex;align-items:center;gap:6px;font:700 12px/1 ${MONOF};letter-spacing:.08em;color:#ecf4ec;opacity:.8;text-shadow:0 1px 2px #000`;
      tg.innerHTML = '<i style="width:8px;height:8px;border-radius:50%;background:#ff3b30;animation:clipblink 1s steps(1) infinite"></i><span>recording</span>';
      document.body.appendChild(tg);
    } catch {}
  }
  let rp = null, rpKey = null;
  C.panelOpen = () => !!rp;
  /** A clip taken in play has been made: one small prompt over the closing card, SAVE CLIP and back to the game. `onClose(saved)` when it is dismissed. */
  C.openReady = (onClose) => {
    try {
      if (rp) return; if (!C.blob) { if (onClose) onClose(false); return; }
      ensureStyle();
      rp = document.createElement('div'); rp.id = 'clipReady';
      rp.style.cssText = `position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 28px);transform:translateX(-50%);z-index:70;width:min(420px,calc(100vw - 24px));box-sizing:border-box;display:flex;flex-wrap:wrap;gap:10px;padding:10px 12px;background:rgba(10,14,11,.9);border:1px solid rgba(236,244,236,.35);color:#ecf4ec;font:700 13px ${MONOF};letter-spacing:.08em;text-shadow:0 1px 2px #000;pointer-events:auto`;
      rp.innerHTML = `<button id="cpGo" style="flex:1.4;min-height:46px;font-weight:900;letter-spacing:.1em;background:#f05a3c;border:0;color:#1b1410;text-transform:uppercase">save clip</button><button id="cpBack" style="flex:1;min-height:46px;background:transparent;border:1px solid rgba(236,244,236,.5);color:inherit">back to the game</button><div id="cpSt" style="flex-basis:100%;min-height:15px;text-align:center;font-weight:500;font-size:12px;opacity:.85"></div>`;
      document.body.appendChild(rp);
      const go = rp.querySelector('#cpGo'), back = rp.querySelector('#cpBack'), st = rp.querySelector('#cpSt'); let busy = false, saved = false;
      const close = () => { if (!rp) return; try { rp.remove(); } catch {} rp = null; C.dropCard(); if (rpKey) { window.removeEventListener('keydown', rpKey, true); window.removeEventListener('keyup', rpKey, true); rpKey = null; } if (onClose) { try { onClose(saved); } catch {} } };
      go.addEventListener('click', async () => {
        if (busy) return; busy = true; go.disabled = true; st.textContent = 'saving...';
        const r = await C.deliver(); busy = false; go.disabled = false;
        if (r.ok) { saved = true; st.textContent = 'saved'; setTimeout(close, 1000); }
        else if (r.declined) { st.textContent = 'not saved'; try { go.focus(); } catch {} }
        else { st.textContent = 'Saving is not available in this view.'; }
      });
      back.addEventListener('click', close);
      rpKey = (e) => { if (e.type === 'keyup') { e.stopImmediatePropagation(); return; } if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); close(); return; } e.stopImmediatePropagation(); if (e.key === 'Enter') { e.preventDefault(); if (!e.repeat) go.click(); } else if (e.key !== ' ' && e.key !== 'Tab') e.preventDefault(); };
      window.addEventListener('keydown', rpKey, true); window.addEventListener('keyup', rpKey, true);
      try { go.focus({ preventScroll: true }); } catch {}
    } catch (e) { C.error = String(e && e.message || e); rp = null; if (onClose) onClose(false); }
  };
  /** The pad: A saves, B goes back. */
  C.panelPad = (a, b) => { if (!rp) return false; if (b) { const x = rp.querySelector('#cpBack'); x && x.click(); } else if (a) { rp.querySelector('#cpGo').click(); } return true; };
  let gen = 0;      // bumped whenever a recording is thrown away, so a finish still in flight does not publish it
  function teardown() { meter(false); tag(false); C.active = false; tp = null; try { if (stream) for (const t of stream.getTracks()) t.stop(); } catch {} stream = null; cv = null; g = null; rec = null; }
  /** The card is over (or the tape, with no card): finish the file in the background. Resolves true when C.blob is ready; C.state is 'finishing' meanwhile. */
  C.finish = async () => {
    if (!C.active) return false;
    const my = gen; C.state = 'finishing'; emit();
    const r = rec;
    try { if (!closing) C.frame(); if (r && r.state !== 'inactive') r.stop(); await Promise.race([done, new Promise((res) => setTimeout(res, 4000))]); } catch {}
    if (my !== gen) return false;      // cancelled or discarded meanwhile
    teardown();
    if (cancelled || !chunks.length) { C.state = 'idle'; emit(); return false; }
    const base = ((chunks[0] && chunks[0].type) || C.mime || 'video/webm').split(';')[0] || 'video/webm', ext = /mp4/.test(base) ? 'mp4' : 'webm';      // clipsound: the type the recorder really produced, so an mp4 is never named .webm
    C.blob = new Blob(chunks, { type: base }); C.name = `rex-encounter-${stamp()}.${ext}`;
    try { C.file = new File([C.blob], C.name, { type: base }); } catch { C.file = null; }
    chunks = []; C.state = 'ready';
    try { const a = C.audioInfo; if (a) { try { const p = audio.clipLevel(true); if (p > a.peakDb) a.peakDb = p; } catch {} a.mime = C.mime; a.bytes = C.blob.size; a.silent = !a.hasAudioTrack || a.peakDb < -60; console.info('[clip] audio ' + JSON.stringify({ hasAudioTrack: a.hasAudioTrack, peakDb: Math.round(a.peakDb * 10) / 10, ctx: a.ctxState, mime: a.mime, bytes: a.bytes })); } } catch {}
    // clipsound: an automatic recording that came out silent although the tape held sounds (a context that was not running: phones) is dropped quietly; SAVE CLIP then records it again with a real gesture behind it
    try { const a = C.audioInfo; if (a && a.silent && !C.tagged && !C.live && tape && tape.ev && tape.ev.some((x) => x.f >= (tape.s0 || 0))) { C.silentDropped = true; a.dropped = true; C.blob = null; C.file = null; C.state = 'idle'; emit(); return false; } } catch {}
    emit(); return true;
  };
  /** Escape, a skipped replay, a lost tab, the frame-time guard: throw the recording away. (The card on screen is not touched: C.dropCard.) */
  C.cancel = () => {
    if (!C.active) return; cancelled = true; gen++; C.state = 'idle';
    try { if (rec && rec.state !== 'inactive') rec.stop(); } catch {}
    teardown(); chunks = []; emit();
  };
  C.discard = () => { gen++; C.blob = null; C.file = null; if (!C.active) C.state = 'idle'; emit(); };
  /** Hand the file over. Call from the click on the button, with nothing awaited before it. Resolves { ok, declined, needsPress, how }; never rejects.
   *  `auto`: not from a click (at the end of a re-recording): the share sheet is only tried while the browser still counts the original click, else { needsPress }. */
  C.deliver = async (auto = false) => {
    const blob = C.blob, name = C.name; if (!blob) return { ok: false };
    const iosLike = (() => { try { return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); } catch { return false; } })();
    const viaShare = async () => {
      try {
        if (C.file && navigator.canShare && navigator.canShare({ files: [C.file] }) && navigator.share) {
          if (auto && !(navigator.userActivation && navigator.userActivation.isActive)) return { ok: false, needsPress: true };
          await navigator.share({ files: [C.file], title: 'Rex Encounter' }); return { ok: true, how: 'share' };
        }
      } catch (e) { if (e && e.name === 'AbortError') return { ok: false, declined: true }; }
      return null;
    };
    if (iosLike) { const r = await viaShare(); if (r) return r; }      // clipsound: on a phone the share sheet comes first (called before anything is awaited, inside the tap)
    // (a) the Claude artifact's downloads capability
    if (C.dl) { try { await C.dl.save({ filename: name, data: blob }); return { ok: true, how: 'claude' }; } catch (e) { if (e && e.code === 'declined') return { ok: false, declined: true }; } }
    // (b) the system share sheet (needs the user gesture this was called from)
    if (!iosLike) { const r = await viaShare(); if (r) return r; }
    // (c) a plain download link
    if (linkOK) try {
      const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.style.display = 'none'; document.body.appendChild(a); a.click();
      setTimeout(() => { try { a.remove(); URL.revokeObjectURL(url); } catch {} }, 30000); return { ok: true, how: 'link' };
    } catch {}
    return { ok: false };
  };
  return C;
}
