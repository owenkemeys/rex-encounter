// Save the death replay as a video file (the owner: sharing replays is "core to the virality").
// Picture: the CCTV lettering (CAM, mount, PLAYBACK, time stamp) is drawn inside the post pipeline's own canvas (post.js makeCCTVOSD), so the game
// canvas already holds exactly what the player sees. Each rendered frame is copied (drawImage, right after the render call, which is the one moment
// both the WebGL2 and the WebGPU canvas can be read) onto a hidden fixed-size 2D canvas, letterboxed to 1280x720 (720x1280 on a portrait screen),
// with a small caption bug; that canvas is captured at 30 fps. Sound: audio.clipStream() (audio.js, `// clip`) taps the same signal the speakers get,
// after the camera-microphone filter. Nothing here throws into the game loop.
export const CLIP_CAPTION = 'rex encounter · alpha';      // burned into a corner of every clip: change it here
import { facts as cardFacts, pick as cardPick, incidentNo, makeTape, note as cardNote, LEN as CARD_LEN } from './closeout.js';      // closeout
const MIMES = ['video/mp4;codecs=avc1,mp4a', 'video/webm;codecs=vp9,opus', 'video/webm'];
const pad = (n) => String(n).padStart(2, '0');

export function clipSupported() {
  try { return typeof MediaRecorder === 'function' && typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'; } catch { return false; }
}

export function createClip({ getCanvas, audio, tape, extra }) {      // closeout: `tape` the Replay, `extra` () => what the game knew at death (see closeout.js)
  const C = { active: false, state: 'idle', blob: null, name: '', mime: '', dl: null, error: '', frames: 0 };
  let closing = false, ct = 0, tp = null, ov = null, overlayG = null, recent = [], cardInfo = null, ovKey = '', ovTp = null;
  let rec = null, cv = null, g = null, W = 1280, H = 720, chunks = [], stream = null, cancelled = false, done = null;
  C.supported = clipSupported();
  C.canShare = () => { try { return !!(C.file && navigator.canShare && navigator.canShare({ files: [C.file] })); } catch { return false; } };
  C.hasDownloads = () => !!C.dl;
  function pick() { for (const m of MIMES) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch {} } return ''; }
  const stamp = () => { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; };
  /** Begin recording (call right after the replay has started). Returns true if recording runs. */
  C.start = (live = false) => {
    if (C.active || !C.supported) return false;
    C.live = !!live; C.t0 = performance.now();
    C.len = (tape && tape.duration || 0) + CARD_LEN;      // the video's length as it plays (wall-clock time on a slow machine is longer)
    try {
      const src = getCanvas(); if (!src) return false;
      const portrait = src.clientHeight > src.clientWidth; W = portrait ? 720 : 1280; H = portrait ? 1280 : 720;
      cv = document.createElement('canvas'); cv.width = W; cv.height = H; g = cv.getContext('2d', { alpha: false });
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      stream = cv.captureStream(30);
      let as = null; try { as = audio && audio.clipStream ? audio.clipStream() : null; } catch {}
      if (as) for (const t of as.getAudioTracks()) stream.addTrack(t);
      C.mime = pick(); const opt = { videoBitsPerSecond: 4e6, audioBitsPerSecond: 128e3 }; if (C.mime) opt.mimeType = C.mime;
      rec = new MediaRecorder(stream, opt); C.mime = rec.mimeType || C.mime || 'video/webm';
      chunks = []; cancelled = false; C.blob = null; C.file = null; C.frames = 0; C.error = '';
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      done = new Promise((res) => { rec.onstop = () => res(); rec.onerror = () => res(); });
      rec.start(1000); C.active = true; C.state = 'recording'; banner(true);
      // the Claude artifact's downloads capability, asked now (it may take a while to answer: give it 1.5 s and remember what came back)
      C.dl = null; try { if (window.claude && typeof window.claude.use === 'function') Promise.race([Promise.resolve(window.claude.use('downloads')), new Promise((r) => setTimeout(() => r(null), 1500))]).then((d) => { C.dl = d || null; }, () => {}); } catch {}
      return true;
    } catch (e) { C.error = String(e && e.message || e); C.active = false; C.state = 'idle'; try { rec && rec.state !== 'inactive' && rec.stop(); } catch {} rec = null; return false; }
  };
  /** Copy the game canvas onto the clip canvas. Call straight after the render call, every frame while active. */
  C.frame = () => {
    if (!C.active || !g) return;
    banner(false);
    if (closing) { drawClose(); return; }      // closeout
    try {
      const src = getCanvas(), sw = src.width, sh = src.height; if (!sw || !sh) return;
      const k = Math.min(W / sw, H / sh), dw = Math.round(sw * k), dh = Math.round(sh * k), dx = (W - dw) >> 1, dy = (H - dh) >> 1;
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.drawImage(src, 0, 0, sw, sh, dx, dy, dw, dh);
      // the caption bug in the overlay's own style (bold monospace, soft shadow, light grey-green), bottom right, sized like the date stamp on the left
      const cw = src.clientWidth || sw, ch = src.clientHeight || sh, sc = dh / ch, fs = Math.round(Math.max(12, Math.min(18, Math.min(cw, ch) * 0.034)) * sc), m = Math.max(12, Math.min(cw, ch) * 0.035) * sc;
      g.font = `bold ${fs}px "Lucida Console", "Courier New", monospace`; g.textBaseline = 'top'; g.textAlign = 'right';
      const x = dx + dw - m, y = dy + dh - m - fs; g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillText(CLIP_CAPTION, x + 1, y + 1); g.fillStyle = 'rgba(236,244,236,1)'; g.fillText(CLIP_CAPTION, x, y);
      C.frames++;
    } catch (e) { C.error = String(e && e.message || e); }
  };

  // ---- closeout: when the tape has ended, about 3.2 s of the closing card (src/view/closeout.js) are recorded and shown, then the file is finished
  C.note = (kind) => { try { if (tape) cardNote(kind, tape.n + tape.acc * 30); } catch {} };      // whistles and shouts (noises, not taped events)
  try { const r = JSON.parse(localStorage.getItem('rex.closeout.recent') || '[]'); if (Array.isArray(r)) recent = r.filter((x) => Number.isInteger(x)).slice(-8); } catch {}
  function remember(i) { recent.push(i); if (recent.length > 8) recent.shift(); try { localStorage.setItem('rex.closeout.recent', JSON.stringify(recent)); } catch {} }
  function chooseLine(live) {
    let fx = {}; try { const ex = extra ? extra() : {}; fx = cardFacts(tape, { ...ex, live: !!live, deaths: live ? Math.max(0, (ex.deaths | 0) - 1) : ex.deaths }); } catch {}
    let r; try { r = cardPick(fx, Math.random, recent); } catch { r = { text: 'Please enjoy the exhibit responsibly.', index: -1, id: 'x' }; }
    if (r.index >= 0) remember(r.index);
    return { text: r.text, id: r.id, no: incidentNo(live ? (fx.deaths || 0) + 1 : fx.deaths || 1), facts: fx, live: !!live };
  }
  let deathLine = null;
  /** The advice line for this death, chosen once so the death menu and the closing card agree. */
  C.lineFor = () => deathLine || (deathLine = chooseLine(false));
  C.resetLine = () => { deathLine = null; };
  C.closing = () => closing;
  /** Called every frame from main.js while the tape is over and a recording runs: true while the card is still on, false when it is time to finish. */
  C.card = (dt) => {
    if (!C.active || !g) return false;
    if (!closing) {
      closing = true; ct = 0; cardInfo = C.live ? chooseLine(true) : C.lineFor(); C.cardInfo = cardInfo;
      try { tp = makeTape(W, H, cardInfo.text, cardInfo.no, undefined, C.live); } catch (e) { C.error = String(e && e.message || e); closing = false; return false; }
      try { ov = document.createElement('canvas'); ov.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;background:#000;z-index:40;pointer-events:auto'; document.body.appendChild(ov); overlayG = ov.getContext('2d'); ovKey = ''; } catch { ov = null; }      // the player's own view of the card, laid out for the window (not the recording's size)
      try { const m = audio && audio._mic, c = audio && audio.ctx; if (m && c) m.g.gain.setTargetAtTime(0, c.currentTime, 0.3); } catch {}      // the taped ambience fades; the rest is silence
    }
    ct += Math.min(dt, 0.1);
    return ct < CARD_LEN;
  };
  function drawClose() {
    if (!tp) return;
    try {
      const stamp = (tape && tape.stampMs ? tape.stampMs : Date.now()) + ct * 1000;
      tp.frame(g, ct, stamp);
      if (overlayG && ov) {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5); let w = Math.max(200, Math.round(window.innerWidth * dpr)), h = Math.max(200, Math.round(window.innerHeight * dpr)); const k = Math.min(1, 1600 / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
        if (ovKey !== w + 'x' + h) { ovKey = w + 'x' + h; ov.width = w; ov.height = h; ovTp = makeTape(w, h, cardInfo.text, cardInfo.no, undefined, C.live); }
        ovTp.frame(overlayG, ct, stamp);
      }
      C.frames++;
    } catch (e) { C.error = String(e && e.message || e); }
  }
  /** For checking the look without a death: the card as it is at tape time t, drawn on a fresh canvas of the given size. */
  C.previewCard = (w, h, line, t = 2, no = '0047') => { const c = document.createElement('canvas'); c.width = w; c.height = h; makeTape(w, h, line, no).frame(c.getContext('2d'), t, Date.now()); return c; };

  // ---- the recording banner (on screen only, never in the video) and the "your clip is ready" panel
  const MONOF = "'IBM Plex Mono','Lucida Console','Courier New',monospace";
  let bn = null, bnT = 0;
  function banner(force, hide) {
    try {
      if (hide) { if (bn) { bn.remove(); bn = null; } return; }
      if (!C.active) return;
      if (!bn) {
        if (!document.getElementById('clipStyle')) { const st = document.createElement('style'); st.id = 'clipStyle'; st.textContent = '@keyframes clipblink{0%,55%{opacity:1}56%,100%{opacity:.15}} #clipRec button,#clipReady button{font:inherit;cursor:pointer}'; document.head.appendChild(st); }
        bn = document.createElement('div'); bn.id = 'clipRec';
        bn.style.cssText = `position:fixed;top:calc(env(safe-area-inset-top,0px) + 52px);left:50%;transform:translateX(-50%);z-index:60;width:min(420px,calc(100vw - 24px));box-sizing:border-box;padding:10px 14px 9px;background:rgba(10,14,11,.88);border:1px solid rgba(255,90,70,.55);color:#ecf4ec;font:700 14px/1.2 ${MONOF};letter-spacing:.06em;text-shadow:0 1px 2px #000;pointer-events:auto`;
        const coarse = (() => { try { return matchMedia('(pointer:coarse)').matches; } catch { return false; } })();
        bn.innerHTML = `<div style="display:flex;align-items:center;gap:10px"><i style="width:13px;height:13px;border-radius:50%;background:#ff3b30;box-shadow:0 0 8px #ff3b30;animation:clipblink 1s steps(1) infinite"></i><span>RECORDING YOUR CLIP</span></div><div style="height:6px;margin:9px 0 7px;background:rgba(255,255,255,.16)"><div id="clipBar" style="height:100%;width:0;background:#ff5a47"></div></div><div style="display:flex;justify-content:space-between;align-items:center;font-weight:500;font-size:12px;opacity:.9"><span id="clipLeft">&nbsp;</span><button id="clipCancel" style="background:none;border:1px solid rgba(236,244,236,.4);color:inherit;padding:${coarse ? '8px 14px' : '2px 8px'};letter-spacing:.06em">${coarse ? 'tap to cancel' : 'Esc to cancel'}</button></div>`;
        document.body.appendChild(bn);
        bn.querySelector('#clipCancel').addEventListener('click', (e) => { e.stopPropagation(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
      }
      const now = performance.now(); if (!force && now - bnT < 120) return; bnT = now;
      const dur = (tape && tape.duration || 0) + CARD_LEN, el = closing ? (tape && tape.duration || 0) + ct : (tape && tape.t || 0), left = Math.max(0, dur - el);
      const bar = bn.querySelector('#clipBar'), lt = bn.querySelector('#clipLeft'); if (bar) bar.style.width = Math.min(100, Math.max(0, el / dur * 100)).toFixed(1) + '%'; if (lt) lt.textContent = Math.ceil(left) + ' s left';
    } catch {}
  }
  let rp = null, rpKey = null;
  C.panelOpen = () => !!rp;
  /** The clip has been made: a centred panel over the closing card. `onClose(saved)` when it is dismissed (saved, or back). */
  C.openReady = (onClose) => {
    try {
      if (rp) return; const blob = C.blob; if (!blob) { if (onClose) onClose(false); return; }
      const dl = C.hasDownloads(), share = !dl && C.canShare(), mb = (blob.size / 1048576).toFixed(1), secs = Math.round(C.len || 0);
      rp = document.createElement('div'); rp.id = 'clipReady';
      rp.style.cssText = `position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;background:rgba(0,0,0,.35);font-family:${MONOF};pointer-events:auto`;
      rp.innerHTML = `<div style="width:min(440px,100%);box-sizing:border-box;padding:22px 22px 18px;background:rgba(10,14,11,.94);border:1px solid rgba(236,244,236,.35);color:#ecf4ec;text-align:center"><div style="font:900 22px/1.15 ${MONOF};letter-spacing:.08em">YOUR CLIP IS READY</div><div id="cpMeta" style="margin:8px 0 18px;font-size:13px;opacity:.75">${mb} MB &middot; ${secs} s</div><button id="cpGo" style="width:100%;min-height:52px;font:900 17px ${MONOF};letter-spacing:.1em;background:#f05a3c;border:0;color:#1b1410">${share ? 'SHARE CLIP' : 'DOWNLOAD CLIP'}</button><div id="cpSt" style="min-height:18px;margin:12px 0 4px;font-size:12px;opacity:.85">&nbsp;</div><button id="cpBack" style="background:none;border:0;color:#ecf4ec;opacity:.7;text-decoration:underline;padding:8px 14px;font-size:13px">back</button></div>`;
      document.body.appendChild(rp);
      const go = rp.querySelector('#cpGo'), back = rp.querySelector('#cpBack'), st = rp.querySelector('#cpSt'); let busy = false, saved = false;
      const close = () => { if (!rp) return; try { rp.remove(); } catch {} rp = null; if (ov) { try { ov.remove(); } catch {} ov = null; overlayG = null; } if (rpKey) { window.removeEventListener('keydown', rpKey, true); window.removeEventListener('keyup', rpKey, true); rpKey = null; } if (onClose) { try { onClose(saved); } catch {} } };
      C._closeReady = close;
      go.addEventListener('click', async () => {
        if (busy) return; busy = true; go.disabled = true; st.textContent = 'saving...';
        const r = await C.deliver(); busy = false; go.disabled = false;
        if (r.ok) { saved = true; st.textContent = 'saved'; setTimeout(close, 1100); }
        else if (r.declined) { st.textContent = 'not saved. Press the button to try again.'; try { go.focus(); } catch {} }
        else { st.textContent = 'Saving is not available in this view.'; }
      });
      back.addEventListener('click', close);
      rpKey = (e) => { if (e.type === 'keyup') { e.stopImmediatePropagation(); return; } if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); close(); return; } e.stopImmediatePropagation(); if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Tab') e.preventDefault(); };
      window.addEventListener('keydown', rpKey, true); window.addEventListener('keyup', rpKey, true);
      try { go.focus({ preventScroll: true }); } catch {}
    } catch (e) { C.error = String(e && e.message || e); rp = null; if (onClose) onClose(false); }
  };
  /** The pad: A presses the focused button of the ready panel, B goes back. */
  C.panelPad = (a, b) => { if (!rp) return false; if (b) { const x = rp.querySelector('#cpBack'); x && x.click(); } else if (a) { const f = document.activeElement; (f && rp.contains(f) ? f : rp.querySelector('#cpGo')).click(); } return true; };
  function teardown(keepOv) { closing = false; tp = null; ovTp = null; banner(true, true); if (ov && !keepOv) { try { ov.remove(); } catch {} ov = null; overlayG = null; } C.active = false; try { if (stream) for (const t of stream.getTracks()) t.stop(); } catch {} stream = null; cv = null; g = null; }
  /** The tape ran out: finish the file. Resolves true when C.blob is ready. */
  C.finish = async () => {
    if (!C.active) return false;
    C.state = 'finishing';
    try { if (!closing) C.frame(); if (rec.state !== 'inactive') rec.stop(); await Promise.race([done, new Promise((r) => setTimeout(r, 4000))]); } catch {}
    teardown(true);
    if (cancelled || !chunks.length) { if (ov) { try { ov.remove(); } catch {} ov = null; } C.state = 'idle'; return false; }
    const base = C.mime.split(';')[0] || 'video/webm', ext = /mp4/.test(base) ? 'mp4' : 'webm';
    C.blob = new Blob(chunks, { type: base }); C.name = `rex-encounter-${stamp()}.${ext}`;
    try { C.file = new File([C.blob], C.name, { type: base }); } catch { C.file = null; }
    chunks = []; C.state = 'ready'; return true;
  };
  /** Escape, a lost tab, a new life: throw the recording away. */
  C.cancel = () => {
    if (!C.active) return; cancelled = true; C.state = 'idle';
    try { if (rec && rec.state !== 'inactive') rec.stop(); } catch {}
    teardown(); chunks = [];
  };
  C.discard = () => { C.blob = null; C.file = null; C.state = 'idle'; };
  /** Hand the file over. Call from the click on the card's button. Resolves { ok, declined, how }; never rejects. */
  C.deliver = async () => {
    const blob = C.blob, name = C.name; if (!blob) return { ok: false };
    // (a) the Claude artifact's downloads capability
    if (C.dl) { try { await C.dl.save({ filename: name, data: blob }); return { ok: true, how: 'claude' }; } catch (e) { if (e && e.code === 'declined') return { ok: false, declined: true }; } }
    // (b) the system share sheet (needs the user gesture this was called from)
    try { if (C.file && navigator.canShare && navigator.canShare({ files: [C.file] }) && navigator.share) { await navigator.share({ files: [C.file], title: 'Rex Encounter' }); return { ok: true, how: 'share' }; } } catch (e) { if (e && e.name === 'AbortError') return { ok: false, declined: true }; }
    // (c) a plain download link
    try {
      const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.style.display = 'none'; document.body.appendChild(a); a.click();
      setTimeout(() => { try { a.remove(); URL.revokeObjectURL(url); } catch {} }, 30000); return { ok: true, how: 'link' };
    } catch {}
    return { ok: false };
  };
  return C;
}
