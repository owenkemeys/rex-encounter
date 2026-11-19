// The player-facing interface: which panels show (remembered), the mind readout, the thoughts above the animal's head,
// achievements (dares: a toast when one is done, the list in the pause card and the drawer, the next one on the death card), the
// opening invitation, the pause card, injury and the end card, the take action and the photo key.
import * as THREE from 'three/webgpu';
import { Achievements } from './achievements.js';
import { clamp, renew } from './math.js';
import { placeThought, clearOf, damp } from './thoughtplace.js';
import { touchLayout } from './touchlayout.js';
import { tuneInstall, tuneOpen, tuneAvailable, tuneShowStrip } from './view/tune.js';      // tune

const $ = (id) => document.getElementById(id);
// thoughts: always (default) / when watched (read at range by keeping it in view) / near only / never
const DEFAULTS = { panel: false, mind: false, thoughts: 'near', tele: false, bare: false, v: 2 };
const THOUGHTS = [['always', 'always, at any distance'], ['watched', 'when you keep it in view'], ['near', 'only when close'], ['never', 'never']];
const BOX = { mind: 'uMind', tele: 'uTele' };
// plain names for every behaviour, for the diagnostic readout
const NAMES = {
  besiege: 'Working the way in', investigate: 'Investigating', trail: 'Following a scent', feed: 'Feeding', hunt: 'Hunting the herd', answer: 'Answering thunder', roam: 'Wandering', pause: 'Standing', listen: 'Frozen, listening', sniff: 'Scenting', search: 'Searching for you', stare: 'Staring', ambush: 'Waiting, motionless', leave: 'Moving off', watch: 'Watching you', stalk: 'Stalking', circle: 'Circling', inspect: 'Inspecting you', display: 'Threat display', bluff: 'Bluff charge', chase: 'Chasing', snap: 'Snapping', feign: 'Feigning disinterest', backoff: 'Giving ground', nudge: 'Nudging you', revisit: 'Coming back',
  appraise: 'Sizing you up', test: 'Testing you (a lunge that stops short)', shadow: 'Shadowing you, out of sight', lurk: 'Lying in wait for you', prowl: 'Hunting you', avoid: 'Keeping away from you', butt: 'Head-butting', swipe: 'Tail swipe', pin: 'Pinning you down', seize: 'Seizing you in its jaws', toy: 'Playing with you', guard: 'Standing its ground', pounce: 'Pouncing on you',
};
const STANCE = { curious: 'curious about you', wary: 'wary of you', predatory: 'sees you as food', angry: 'angry with you', afraid: 'afraid of you', rival: 'sees a rival', attacking: 'attacking you', dominant: 'facing you down', guarded: 'holding its ground', yielding: 'giving way to you', none: '' };
const CAUSE = { bite: 'it bit you', bitten: 'it bit you', jaws: 'it bit you', seize: 'it bit you', shake: 'it shook you', shaken: 'it shook you', crush: 'it crushed you', crushed: 'it crushed you', stamp: 'it stamped on you', stamped: 'it stamped on you', pin: 'it crushed you under its foot', pinned: 'it crushed you under its foot', toss: 'it threw you', tossed: 'it threw you', thrown: 'it threw you', fall: 'the fall', landed: 'the fall', butt: 'its head hit you', swipe: 'its tail hit you', tail: 'its tail hit you', eaten: 'it ate you', eat: 'it ate you', fed: 'it ate you' };
const bar = (id, v) => { $(id).style.width = Math.round(clamp(v, 0, 1) * 100) + '%'; };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dur = (s) => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return m ? `${m} min ${s % 60} s` : `${s} s`; };
/** THE KIT SWITCH. What the player carries at the start of every life. Stones and meat are retired for now (their mechanics,
 *  world objects, animal reactions and sounds stay in the code; the debug drawer can still throw them): set stones / meat to
 *  a count above 0 to bring one back into the hand, the item cycle, the controls list and the first-time tips. */
export const KIT = { torch: true, flares: 3, stones: 0, meat: 0 };
// The control scheme: few verbs, one place each, the same verbs on every device. One hand holds one thing (flare, and
// whatever else the KIT switch gives) and one button uses it; one contextual button does whatever makes sense where you stand; one call button (tap a
// whistle, hold a shout). The table below is the whole of it: the pause card and the Tab/View peek show it, and each verb
// is taught once, by a short prompt, the first time it matters (see teach).
// One name per verb, used on every device: walk, run, crouch, look, zoom, flare, call, torch, the contextual verb itself, pause, controls.
const KEYS = {
  kb: { move: 'W A S D', run: 'Shift', crouch: 'C', jump: 'Space', look: 'mouse', zoom: 'right mouse / Z', use: 'click', items: 'wheel / 1 2 3', call: 'Q', act: 'E', torch: 'F', note: 'T', clip: 'R', pause: 'Esc', peek: 'Tab', again: 'Enter', struggle: 'W A S D' },
  pad: { move: 'left stick', run: 'L3', crouch: 'B', jump: 'A', look: 'right stick', zoom: 'LT', use: 'RT', items: 'LB / RB', call: 'X', act: 'D-pad up', torch: 'Y', note: 'R3', clip: 'pause card', pause: 'Start', peek: 'View', again: 'A', struggle: 'left stick' },
  touch: { move: 'left stick', run: 'stick to the rim', crouch: 'crouch', jump: 'jump', look: 'right stick', zoom: 'zoom', use: 'flare', items: 'item', call: 'call', act: 'pop-up button', torch: 'torch', note: 'note', clip: 'clip', pause: '\u2016', peek: '?', again: '', struggle: 'jump, or waggle a stick' },
};
const itemNames = () => [KIT.flares > 0 && 'flare', KIT.stones > 0 && 'stone', KIT.meat > 0 && 'meat'].filter(Boolean);
const useName = () => (itemNames().length > 1 ? 'throw what is in hand' : 'throw a ' + itemNames()[0]);
const CTL = () => [['move', 'walk'], ['run', 'run'], ['crouch', 'crouch'], ['jump', 'jump'], ['look', 'look'], ['zoom', 'zoom'], itemNames().length && ['use', useName()], itemNames().length > 1 && ['items', 'change item'], ['call', 'call <i>(hold: shout)</i>'], ['act', 'climb, doors <i>(when shown)</i>'], KIT.torch && ['torch', 'torch'], ['note', 'note'], ['clip', 'save a clip of the last 15 s'], ['pause', 'pause']].filter(Boolean);
// the start card: only what a first-time player needs
const CTL_START = () => [['move', 'walk'], ['look', 'look'], itemNames().length && ['use', useName()], ['call', 'call <i>(hold: shout)</i>'], KIT.torch && ['torch', 'torch'], ['pause', 'pause']].filter(Boolean);
// first-time prompts, in the order they tend to matter; each is shown once (remembered), then never again
// A tip comes back (at most SHOW times) until the player has done the thing DONE times; then never again.
const TEACH = {
  use: '{use} to throw a flare', call: '{call} to call. hold it to shout', items: '{items} to change what is in hand',
  crouch: '{crouch} to crouch', zoom: 'hold {zoom} to zoom', run: 'hold {run} to run', torch: '{torch} for the torch', peek: 'hold {peek} for the controls',
  struggle: 'work {struggle} hard to get free',
};
const TEACH_TOUCH = { use: 'tap {use} to throw one', call: 'tap {call} to call. hold it to shout', zoom: 'tap {zoom} to look closer', crouch: 'tap {crouch} to crouch', torch: 'tap {torch} for the torch', run: 'push the left stick to the rim to run', peek: 'tap {peek} for the controls', struggle: 'mash jump to struggle' };
const DONE = 2, SHOW = 3;

export function createUI(o) {
  const { S, camera, canvas, arena, terrain, act, Q, audio, session } = o;
  let { sim, mind, SEED } = o;
  const OV = mind.ov;
  // the device in use (main.js keeps S.dev live: the last of keyboard/mouse, touch, gamepad used)
  const dev = () => S.dev || (o.pad && o.pad.on ? 'pad' : Q.touch ? 'touch' : 'kb');
  const kb = (k) => `<b>${esc(KEYS[dev()][k])}</b>`;
  const fmtB = (t) => String(t || '').replace(/\{(\w+)\}/g, (_, k) => kb(k));
  // on touch a button named for its verb (crouch, zoom, torch) needs no line of its own: they share one
  const ctlHTML = (list = CTL()) => {
    list = list.filter(([k]) => (k !== 'clip' || (S.clip && S.clip.supported)) && (k !== 'note' || document.body.classList.contains('notes-on')) && !(k === 'zoom' && dev() === 'touch'));      // no zoom button on touch
    const d = dev(), K = KEYS[d], same = d === 'touch' ? list.filter(([k, t]) => K[k] === t) : [];
    const rows = list.filter((r) => !same.includes(r)).map(([k, t]) => `<b>${esc(K[k])}</b><span>${t}</span>`);
    if (same.length) rows.splice(rows.length - 1, 0, `<b>${same.map(([k]) => esc(K[k])).join(' ')}</b><span>as named</span>`);
    return rows.join('') + (K.peek ? `<b>${d === 'touch' ? '' : 'hold '}${esc(K.peek)}</b><span>controls</span>` : '');
  };
  // debug: the sandbox drawer, its keys and the mind readout. Off for players; on for the session after the first backtick, or with #debug
  let debugOn = /debug/.test(location.hash);
  const setDebug = (on) => { debugOn = on; document.body.classList.toggle('debug', on); apply(); };
  // mind probe: pin what it makes of you (appraise.js); "Reset all" puts it back to its own judgement
  if ($('verdict')) { $('verdict').addEventListener('change', (e) => { OV.verdict = e.target.value || null; }); $('ovReset').addEventListener('click', () => { $('verdict').value = ''; OV.verdict = null; }); }
  let flags = { ...DEFAULTS };
  try { const st = JSON.parse(localStorage.getItem('dh.ui') || '{}'); delete st.bubble; delete st.asked; if (st.v !== 2) { delete st.thoughts; st.v = 2; } Object.assign(flags, st); } catch {}
  if (!THOUGHTS.some(([k]) => k === flags.thoughts)) flags.thoughts = 'near';
  if (o.test) flags = { ...DEFAULTS };      // tests start from the default view
  flags.bare = false; flags.panel = false;  // never carried over from an earlier visit (a stray H used to hide everything for good)
  let lastShown = flags.thoughts === 'never' ? 'always' : flags.thoughts;
  for (const sel of document.querySelectorAll('[data-thoughts]')) {
    sel.innerHTML = THOUGHTS.map(([k, t]) => `<option value="${k}">${t}</option>`).join('');
    sel.addEventListener('change', (e) => set('thoughts', e.target.value));
  }

  // ------------------------------------------------------------ panels
  function apply() {
    const b = document.body;
    b.classList.toggle('debug', debugOn); b.classList.toggle('bare', flags.bare); b.classList.toggle('bb', flags.thoughts !== 'never'); b.classList.toggle('tele', flags.tele); b.classList.toggle('menu', flags.panel);
    $('mindcard').style.display = flags.mind && debugOn ? '' : 'none'; b.classList.toggle('tele', flags.tele && debugOn);
    for (const [k, id] of Object.entries(BOX)) $(id).checked = !!flags[k];
    for (const sel of document.querySelectorAll('[data-thoughts]')) sel.value = flags.thoughts;
    $('menuBtn').setAttribute('aria-expanded', String(flags.panel));
    $('panel').toggleAttribute('inert', !flags.panel);
    if (!o.test) try { const { bare, panel, ...keep } = flags; localStorage.setItem('dh.ui', JSON.stringify(keep)); } catch {}
  }
  const set = (k, v) => {
    const was = flags[k]; flags[k] = v === undefined ? !flags[k] : v;
    if (k === 'thoughts' && flags.thoughts !== 'never') lastShown = flags.thoughts;
    if (k === 'panel' && flags.panel !== was && session) { if (flags.panel) session.releasePointer(); }
    apply();
  };
  for (const [k, id] of Object.entries(BOX)) $(id).addEventListener('change', (e) => set(k, e.target.checked));
  $('menuBtn').addEventListener('click', () => set('panel'));
  $('bBare').addEventListener('click', () => { set('panel', false); set('bare', true); });
  $('bPhoto').addEventListener('click', () => { set('panel', false); setTimeout(photo, 350); });
  $('bTake').addEventListener('click', () => act.take());
  $('pSandbox').addEventListener('click', () => { audio.resume(); set('panel', true); if (session) session.setPaused(false); });
  // tune: the live tuning panel (src/view/tune.js), from the sandbox tools, the pause card, or the key ;. The button shows only with #debug or #tune, after the first backtick,
  // or when tuned values are already stored. Opening it lets go of the pointer without pausing; pinned rows stay on screen while playing.
  tuneInstall({ release: () => { if (session && session.releasePointer) session.releasePointer(); }, enabled: () => debugOn });      // tune
  $('bTune').addEventListener('click', () => { audio.resume(); set('panel', false); tuneOpen(true); });      // tune
  $('pTune').addEventListener('click', () => { audio.resume(); if (session) session.setPaused(false); tuneOpen(true); });      // tune
  { const showT = () => { $('pTune').hidden = !(debugOn || tuneAvailable()); }; showT(); setInterval(showT, 1500); if (tuneAvailable()) tuneShowStrip(); }      // tune
  // hidden debug entry for touch: five quick taps on the pause card's title
  { let taps = 0, tapT = 0; $('pTitle').addEventListener('click', () => { const now = performance.now(); taps = now - tapT < 1200 ? taps + 1 : 1; tapT = now; if (taps >= 5) { taps = 0; setDebug(true); } }); }
  // the corner: "?" shows the controls over the game (toggles on touch and with the free pointer); pause is main.js's
  $('helpBtn').addEventListener('click', () => { audio.resume(); peek(!peeking); });
  let sureT = 0;
  $('dReset').addEventListener('click', (e) => {
    const b = e.currentTarget;
    if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'really clear them?'; sureT = setTimeout(() => { delete b.dataset.sure; b.textContent = 'clear achievements'; }, 4000); return; }
    clearTimeout(sureT); delete b.dataset.sure; b.textContent = 'clear achievements'; achv.reset(true); drawList();
  });
  // clicking the world closes the drawer and the controls card
  $('stage').addEventListener('pointerdown', () => { if (flags.panel) set('panel', false); if (peeking && !tabHeld) peek(false); });
  window.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (S.dead) { if (D.shown && (k === 'enter' || k === ' ') && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#dead button:not(#xAgain)'))) { e.preventDefault(); retry(); } return; }      // (closeout: Enter on a focused WATCH AGAIN or SAVE CLIP presses that button)
    if (!S.started || S.paused) return;
    if (k === 'tab') { e.preventDefault(); if (!e.repeat) { tabHeld = true; peek(true); } } else if (k === '`') { if (!debugOn) setDebug(true); set('panel'); } else if (k === 'escape' && flags.panel) set('panel', false);
    else if (k === 'shift') taught('run');
    else if (!debugOn) return;
    else if (k === 'i') set('thoughts', flags.thoughts === 'never' ? lastShown : 'never'); else if (k === 'h') set('bare'); else if (k === 'k') photo();
  });
  window.addEventListener('keyup', (e) => { if (e.key === 'Tab') { tabHeld = false; peek(false); } });
  window.addEventListener('blur', () => { tabHeld = false; peek(false); });
  let peeking = false, tabHeld = false;
  function peek(on) { if (on === peeking) return; peeking = on; if (on) { $('peekKeys').innerHTML = ctlHTML(); taught('peek'); } document.body.classList.toggle('peek', on); }

  // ------------------------------------------------------------ achievements
  // Dares (src/achievements.js). Each one done shows a toast with "n of total"; the pause card and the drawer list them all
  // (done ones ticked, with their line; the rest by title alone), and the death card suggests the next one.
  const item = (a) => `<li class="${a.got ? 'done' : 'lock'}${a.bonus ? ' bonus' : ''}"><b>${esc(a.title)}</b>${a.got ? `<small>${esc(a.dare)}</small>` : ''}</li>`;
  const logHTML = () => achv.listing().map(item).join('');
  function drawList() {
    $('dpanel').innerHTML = logHTML(); $('dpanel').classList.add('tries');
    $('dCount').textContent = `${achv.count} of ${achv.total}`;
  }
  function drawPause() {
    $('pCount').textContent = `${achv.count} of ${achv.total}`;
    $('pLog').innerHTML = logHTML();
    $('pKeys').innerHTML = ctlHTML();
  }
  let toastT = 0, hintT = 0; const queue = []; let toasting = false;
  // the game's own context only (a second one made outside a gesture never starts on iOS, and is one more context to keep alive);
  // chimes go into its last node (audio.out), so on iOS they take the same media-element path as the game. No context yet: silent.
  const ctx = () => { const c = audio.ctx; if (!c || audio.offline || c.state !== 'running') throw 0; return c; };
  const outOf = (c) => audio.out || c.destination;
  function ding() {
    if (!audio.on) return;
    try {
      const c = ctx(), t = c.currentTime, g = c.createGain(), vol = 0.05 * (audio.vol ? audio.vol.master : 1); g.connect(outOf(c));
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      [[392, 0], [587, 0.12]].forEach(([f, d]) => { const os = c.createOscillator(); os.type = 'sine'; os.frequency.value = f; os.connect(g); os.start(t + d); os.stop(t + 1.5); });
    } catch {}
  }
  /** Your whistle, heard from where you stand: two rising notes. */
  function whistle() {
    if (!audio.on || S.paused) return;
    try {
      const c = ctx(), t = c.currentTime, vol = 0.07 * (audio.vol ? audio.vol.master : 1);
      [[0, 1650, 2500, 0.32], [0.42, 1500, 2900, 0.5]].forEach(([d, f0, f1, len]) => {
        const g = c.createGain(), os = c.createOscillator(); os.type = 'sine'; g.connect(outOf(c)); os.connect(g);
        os.frequency.setValueAtTime(f0, t + d); os.frequency.exponentialRampToValueAtTime(f1, t + d + len * 0.7); os.frequency.exponentialRampToValueAtTime(f1 * 0.94, t + d + len);
        g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(vol, t + d + 0.04); g.gain.setValueAtTime(vol, t + d + len - 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + d + len);
        os.start(t + d); os.stop(t + d + len + 0.05);
      });
    } catch {}
    note('you whistle');
  }
  function nextToast() {
    const T = $('toast'), a = queue.shift();
    if (!a) { toasting = false; return; }
    toasting = true;
    $('tN').textContent = a.repeat ? 'again' : `dare done \u00b7 ${a.n} of ${a.total}`; T.querySelector('b').textContent = a.title; T.querySelector('span').textContent = a.repeat ? '' : a.dare;
    T.classList.toggle('hot', !!a.hot); T.classList.toggle('brief', !!a.repeat);
    T.classList.remove('on'); void T.offsetWidth; T.classList.add('on'); if (!a.repeat) ding(); document.body.classList.add('toasting');
    clearTimeout(toastT); toastT = setTimeout(() => { T.classList.remove('on'); document.body.classList.remove('toasting'); setTimeout(nextToast, 500); }, a.repeat ? 1600 : 5200);
  }
  const AC = { sim, mind, terrain, things: arena.things, arena };
  const achv = new Achievements(AC, {
    // a near miss jumps the queue and shows at once: it is about this very moment
    onDone(a, n, total) { const q = { ...a, n, total, hot: !!a.again }; if (q.hot) { queue.unshift(q); clearTimeout(toastT); nextToast(); } else { queue.push(q); if (!toasting) nextToast(); } drawList(); },
    onAgain(a) { if (toasting) return; queue.unshift({ ...a, repeat: true, hot: true }); nextToast(); },
  });
  drawList();
  const youNow = () => {
    if (S.mode !== 'foot' || S.dead) return null;
    const Y = S.you, cp = Math.cos(Y.pitch);
    return { x: Y.x, y: camera.position.y, z: Y.z, fx: -Math.sin(Y.yaw) * cp, fy: Math.sin(Y.pitch), fz: -Math.cos(Y.yaw) * cp };
  };
  // read the sim's events as they are produced, without disturbing the view's own handling of them
  const step = arena.step.bind(arena);
  arena.step = (...a) => {
    const r = step(...a);
    if (arena.events.length) { const y = youNow(); for (const e of arena.events) { achv.event(e, y); if (e.type === 'death' && (!e.id || e.id === 'you')) D.evt = e; } }
    return r;
  };

  act.take = () => {
    if (S.mode !== 'foot' || S.dead) return;
    const Y = S.you; let best = null, bd = 2.4;
    for (const t of arena.things.list) if (t.kind === 'meat' && t.amount > 0) { const d = Math.hypot(t.x - Y.x, t.z - Y.z); if (d < bd) { bd = d; best = t; } }
    if (!best) return; arena.take(best.id, 'you'); if (act.gotMeat) act.gotMeat(); audio.resume(); audio.step && audio.step(0.12);
  };
  // ------------------------------------------------------------ mind readout
  const voice = () => {
    const v = mind.voice, F = mind.focus;
    if (v && (v.think || v.doing)) return { think: v.think || '', want: v.want || '', doing: [NAMES[mind.label] || mind.label, (v.doing || '').replace(/\.$/, '')].filter(Boolean).join(' · '), at: v.lookingAt || '' };
    return { think: mind.thought || '', want: '', doing: NAMES[mind.label] || mind.label || '', at: F ? ({ meat: 'the meat', carcass: 'a carcass', flare: 'the flare' }[F.kind] || F.kind) : (mind.know.seen ? 'you' : '') };
  };
  let lastThink = '';
  function setText(el, text) { const has = !!text; el.hidden = !has; if (el.id) { const k = $('k' + el.id.slice(1)); if (k) k.hidden = !has; } if (has && el.textContent !== text) el.textContent = text; }
  function readout() {
    const V = S.mindOn ? voice() : { think: 'Its mind is off.', want: '', doing: 'Directed', at: '' };
    const t = $('vThink'); if (V.think !== lastThink) { lastThink = V.think; t.textContent = V.think || ' '; t.classList.remove('swap'); void t.offsetWidth; t.classList.add('swap'); }
    $('vDoing').textContent = V.doing; setText($('vWant'), V.want); setText($('vAt'), V.at);
    $('fps').textContent = `${o.backend()} · ${Math.round(S.fps)} fps · ${Q.level || Q.tier}${Q.auto === false ? ' (set)' : ''} ${Math.round(Q.ratio * 100)}% · animal #${SEED}`;
    if (S.mindOn && flags.tele && flags.mind) {
      bar('bAr', mind.mood.arousal); bar('bInt', mind.mood.interest); bar('bIrr', mind.mood.irritation); bar('bHun', mind.hunger); bar('bCert', mind.know.seen ? 1 : mind.sum.cert);
      const B = mind.beh; $('mPhase').textContent = B ? [B.phase, B.sub].filter(Boolean).join(' · ') + (OV.force ? ' (forced)' : OV.freeze ? ' (frozen)' : '') : '';
      const U = mind.lastU, top = U.length ? U[0][1] : 1;
      $('mUtil').innerHTML = U.map(([k, u]) => `<li class="${B && B.name === k ? 'pick' : ''}"><span title="${k}">${esc(NAMES[k] || k)}</span><i style="width:${Math.round(100 * Math.max(0, u) / Math.max(top, 0.01))}%"></i><span>${u.toFixed(2)}</span></li>`).join('');
      const F = mind.focus, P = mind.prey, K = mind.know;
      $('mFocus').innerHTML = [K.seen ? `you, ${mind.ctx && mind.ctx.d ? mind.ctx.d.toFixed(0) : '?'} m${mind.ctx && mind.ctx.enclosed ? ' (inside ' + mind.ctx.enclosed.kind + ')' : ''}` : mind.sum.cert > 0.3 ? `where it thinks you are (${Math.round(mind.sum.cert * 100)}% sure)` : '', F ? `${F.kind} ${F.d ? F.d.toFixed(0) + ' m' : ''} ${F.see > 0.2 ? 'seen' : F.smell > 0.04 ? 'smelt' : ''}` : '', P ? `prey ${P.d.toFixed(0)} m, ${P.state}` : '', mind.scent > 0.08 ? 'your scent on the wind' : '', mind.glare > 0.5 ? 'dazzled by your torch' : ''].filter(Boolean).join('<br>') || '–';
      $('mLog').innerHTML = mind.log.map((l) => `<li>${l.t.toFixed(0).padStart(4)}s ${esc(NAMES[l.name] || l.name)} <span style="opacity:.6">(${l.reason})</span></li>`).join('');
      $('mSees').textContent = S.mode === 'fly' ? 'Free camera: it cannot sense you' : mind.know.seen ? (mind.know.target.id === 'observer' ? 'It has noticed the camera' : 'It can see you') : mind.sum.cert > 0.4 ? 'It thinks it knows where you are' : 'It has not placed you';
      $('mSees').dataset.state = mind.know.seen ? 'seen' : mind.sum.cert > 0.4 ? 'near' : 'none';
      const st = STANCE[mind.stance] || ''; if (st) $('mSees').textContent += ', ' + st;
      const T = mind.temper;
      $('mTemper').textContent = `${T.bold > 0.6 ? 'bold' : T.bold < 0.45 ? 'cautious' : 'steady'}, ${T.patience > 0.65 ? 'patient' : T.patience < 0.5 ? 'restless' : 'even'}, ${T.curious > 0.75 ? 'very curious' : 'curious'}, ${T.irritable > 0.55 ? 'short-tempered' : 'tolerant'}`;
    }
  }

  // ------------------------------------------------------------ its thoughts: a short stream of plain pills above its head
  // The newest thought sits at the bottom, full size; the one or two before it linger above, smaller and dimmer, then fade.
  // Readable at any distance by default: they shrink with distance only down to a legible minimum.
  // When its head is off-screen (or behind you) they dock, steadily, at the screen edge on its side with a small
  // wordless arrow toward it (ahead is up). When it has hold of you they dock at the
  // top centre. Changing state needs a moment of agreement (hysteresis), so nothing flickers.
  // "when you keep it in view": up close always readable; further off they resolve from a faint blur while you keep it in
  // view near the centre, faster when it is looking back at you. "only when close": within ~30 m.
  const bub = $('bubble'), pills = $('bpills'), cueI = $('bcue').querySelector('i');
  const pv = new THREE.Vector3(), LIFE = [99, 6.5, 3.2];
  const B0 = () => ({ items: [], text: '', sx: undefined, sy: undefined, vis: false, L: 1, on: 0, off: 0, docked: false, side: 1, mode: '' }), B = B0();
  function crude(t) { t = (t || '').trim().replace(/\s+/g, ' '); if (t.length > 60) { t = t.slice(0, 60); t = t.slice(0, t.lastIndexOf(' ')) + '...'; } return t; }
  function retire(it) { if (it.dead) return; it.dead = true; it.el.classList.add('gone'); setTimeout(() => it.el.remove(), 700); }
  function pushThought(text, now) {
    const el = document.createElement('div'); el.className = 'pill'; el.textContent = text.toLowerCase(); pills.appendChild(el);
    const it = { el, text, at: now }; B.items.push(it); requestAnimationFrame(() => el.classList.add('in'));
    const live = B.items.filter((i) => !i.dead); while (live.length > 3) retire(live.shift());
  }
  const lookingAtMe = () => { const K = mind.know, v = mind.voice; return !!(K.seen && K.target && (K.target.id === 'you' || K.target.id === 'observer') && v && v.look === 'you'); };
  // the keep-out rectangles for thought text: on touch every control and the top bar (from touchLayout); on desktop the corner buttons
  let TV = null;
  const probe = document.createElement('div'); probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'; document.body.appendChild(probe);
  function thoughtView(w, hh) {
    const touch = document.body.classList.contains('touch'), cs = getComputedStyle(probe), ins = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
    const key = `${w}x${hh}|${touch}|${ins.top},${ins.right},${ins.bottom},${ins.left}`;
    if (TV && TV.key === key) return TV;
    let keep = [];
    if (touch) { const L = touchLayout(w, hh, { top: Math.max(10, ins.top), right: Math.max(10, ins.right), bottom: Math.max(10, ins.bottom), left: Math.max(10, ins.left) }); keep = [...L.controls, L.pill, L.hint, L.topbar, L.mute]; }
    else { const c = $('corner'); if (c) { const r = c.getBoundingClientRect(); if (r.width) keep.push({ x: r.left, y: r.top, w: r.width, h: r.height }); } }
    return (TV = { key, w, h: hh, insets: ins, keep });
  }
  function bubbleFrame(now, dt) {
    const mode = flags.thoughts, on = mode !== 'never' && !flags.bare && S.mindOn && S.started && !(o.post && o.post.cctv);      // never on a security-camera picture (the gatehouse feed, replays)
    const raw = on ? crude(voice().think) : '';
    const st = mind.voice && mind.voice.stream, tail = st && st.length ? st[st.length - 1] : null, key = raw && tail ? tail.t + '|' + raw : raw;
    if (raw && key !== B.text) { B.text = key; pushThought(raw, now); }
    if (!raw) B.text = '';
    const live = B.items.filter((i) => !i.dead);
    for (let i = 0; i < live.length; i++) {
      const it = live[i], rank = live.length - 1 - i, cur = rank === 0 && !!raw;
      if (!on || (!cur && (now - it.at > 9 || (rank > 0 && now - it.at > LIFE[Math.min(rank, 2)] + 4)))) { retire(it); continue; }
      if (rank === 0 && !raw && now - it.at > 4) { retire(it); continue; }
      it.el.dataset.rank = Math.min(rank, 2);
    }
    B.items = B.items.filter((i) => !i.dead);
    if (!on || !B.items.length) { bub.classList.remove('on'); B.vis = false; B.sx = undefined; return; }

    camera.updateMatrixWorld();
    const h = sim.head.pos; pv.set(h.x, h.y + 1.3, h.z);
    const d = camera.position.distanceTo(pv) / ((S.zoom && S.zoom.cur) || 1);      // zoomed in, it reads as if nearer
    pv.applyMatrix4(camera.matrixWorldInverse); const vx = pv.x, vz = pv.z, behind = vz > -0.3;
    pv.set(h.x, h.y + 1.3, h.z); pv.project(camera);
    const V = arena.victims && arena.victims.get('you'), held = S.mode === 'foot' && V && (V.state === 'held' || V.state === 'pinned');
    const inView = !behind && Math.abs(pv.x) < 0.92 && pv.y < 0.92 && pv.y > -0.9;      // (readability only; placement is placeThought's)
    const eyed = lookingAtMe();
    // how readable
    if (mode === 'watched' && d > 30 && !held) {
      const centred = inView && Math.abs(pv.x) < 0.35 && Math.abs(pv.y) < 0.5;
      B.L = clamp(B.L + (centred ? dt / (eyed ? 0.35 : 0.8) : -dt / 1.6), 0, 1);
    } else {
      const target = mode === 'near' && !held ? clamp((42 - d) / 12, 0, 1) : 1;
      B.L += (target - B.L) * Math.min(1, dt * 4);
    }
    if (B.mode !== mode) { B.mode = mode; if (mode === 'always') B.L = 1; }
    if (B.L < 0.03) { bub.classList.remove('on'); B.vis = false; return; }
    if (vhs()) { bub.style.opacity = '1'; bub.style.filter = ''; }      // the camcorder's lettering shows the fade as a failing signal instead
    else { bub.style.opacity = (0.22 + 0.78 * B.L).toFixed(3); bub.style.filter = B.L > 0.97 ? '' : `blur(${((1 - B.L) * 3.2).toFixed(2)}px)`; }
    // size: shrinks with distance to a legible minimum
    bub.style.setProperty('--bs', clamp(1 - (d - 25) / 260, 0.84, 1).toFixed(3));

    const w = window.innerWidth, hh = window.innerHeight, bw = bub.offsetWidth, bh = bub.offsetHeight;
    const vp = thoughtView(w, hh);
    let tx, ty, edge = false, side = 0, angle = 0;
    if (held) {      // it has hold of you: top centre, kept clear of the top bar and controls
      const p = clearOf(w / 2 - bw / 2, hh * 0.2, bw, bh, { x: vp.insets.left + 8, y: vp.insets.top + 8, w: w - vp.insets.left - vp.insets.right - 16, h: hh - vp.insets.top - vp.insets.bottom - 16 }, vp.keep);
      tx = p.x; ty = p.y;
    } else {
      const bearing = Math.atan2(vx, -vz);      // from where the camera faces to the animal; behind is near +-PI
      const r = placeThought({ sx: (pv.x * 0.5 + 0.5) * w, sy: (-pv.y * 0.5 + 0.5) * hh, behind, depth: d, bearing }, vp, vp.keep, { w: bw, h: bh }, { wasEdge: B.docked, side: B.side });
      tx = r.x; ty = r.y; edge = r.mode === 'edge'; side = r.side; angle = r.angle; if (r.side) B.side = r.side;
    }
    // a switch between "on head" and "edge" fades out, jumps, fades in (0.15 s each way), rather than sliding across the screen
    if (B.sx === undefined) { B.sx = tx; B.sy = ty; B.vx = { v: 0 }; B.vy = { v: 0 }; B.fade = 1; B.shown = edge; B.docked = edge; }
    if (edge !== B.shown) { B.fade = Math.max(0, B.fade - (dt || 0) / 0.15); if (B.fade <= 0) { B.shown = edge; B.sx = tx; B.sy = ty; B.vx.v = B.vy.v = 0; } }
    else B.fade = Math.min(1, B.fade + (dt || 0) / 0.15);
    B.docked = B.shown;
    const cue = B.shown && !held, sd = B.shown && !held ? (side < 0 ? 'dock-left' : side > 0 ? 'dock-right' : '') : '';
    cueI.style.transform = `rotate(${angle.toFixed(3)}rad)`;
    bub.classList.toggle('cue', cue); bub.classList.toggle('dock-left', sd === 'dock-left'); bub.classList.toggle('dock-right', sd === 'dock-right');
    B.sx = damp(B.sx, tx, B.vx, dt || 0); B.sy = damp(B.sy, ty, B.vy, dt || 0);
    bub.style.transform = `translate(${Math.round(B.sx)}px, ${Math.round(B.sy)}px)`;
    bub.style.opacity = (parseFloat(bub.style.opacity || '1') * B.fade).toFixed(3);
    bub.classList.add('on'); B.vis = true;
  }

  // ------------------------------------------------------------ VHS: its thoughts as the camcorder's own title lettering
  // While the camcorder look is on (post.vhs), the pills are laid out as usual but not shown; each is drawn into #osd as
  // blocky character-generator type (a low-res raster, hard-edged, black-edged, upscaled by whole pixels) with a little
  // chroma bleed and line jitter. How readable it is (distance, age, fading in or out) is the strength of the signal:
  // a weak one tears sideways line by line, drops lines, smears its colour and fills with snow, then breaks up and is gone.
  const OSD = $('osd'), og = OSD.getContext('2d'), gcache = new Map();
  const vhs = () => !!(o.post && o.post.vhs);
  const hsh = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  // one line per thought, never wrapped: a thought is at most five short words. Raster font, thresholded, so it stays crisp.
  const FS = 10, LH = 12, CW = 6;
  function glyphs(text) {
    let G = gcache.get(text); if (G) return G;
    const line = text.toUpperCase();
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const W = line.length * CW + 4, H = LH + 4;
    const A = mk(W, H), a = A.getContext('2d', { willReadFrequently: true }); a.font = `bold ${FS}px "Courier New", Courier, monospace`; a.textBaseline = 'top'; a.textAlign = 'left'; a.fillStyle = '#fff';      // (read back below: on the CPU, else each new line waits on the GPU)
    for (let i = 0; i < line.length; i++) a.fillText(line[i], 2 + i * CW + (CW - a.measureText(line[i]).width) / 2, 2);      // on the character grid
    const id = a.getImageData(0, 0, W, H), d = id.data, on = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) on[i] = d[i * 4 + 3] > 110 ? 1 : 0;
    const paint = (cv, fn) => { const x = cv.getContext('2d'), im = x.createImageData(W, H), q = im.data; for (let i = 0; i < W * H; i++) { const c = fn(i); if (c) { q[i * 4] = c[0]; q[i * 4 + 1] = c[1]; q[i * 4 + 2] = c[2]; q[i * 4 + 3] = c[3]; } } x.putImageData(im, 0, 0); return cv; };
    const near = (i) => { const x = i % W, y = (i / W) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H && on[Y * W + X]) return true; } return false; };
    G = { W, H,
      white: paint(mk(W, H), (i) => on[i] && [244, 244, 236, 255]),
      edge: paint(mk(W, H), (i) => !on[i] && near(i) && [0, 0, 0, 230]),
      red: paint(mk(W, H), (i) => on[i] && [255, 40, 60, 255]),
      blue: paint(mk(W, H), (i) => on[i] && [30, 120, 255, 255]) };
    if (gcache.size > 80) gcache.delete(gcache.keys().next().value);
    gcache.set(text, G); return G;
  }
  function osdFrame(now) {
    const on = vhs(); document.body.classList.toggle('vhs', on);
    if (!on) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), cw = Math.round(window.innerWidth * dpr), ch = Math.round(window.innerHeight * dpr);
    if (OSD.width !== cw || OSD.height !== ch) { OSD.width = cw; OSD.height = ch; }
    og.clearRect(0, 0, cw, ch); og.imageSmoothingEnabled = false;
    if (!B.vis || !bub.classList.contains('on')) return;
    const k = Math.max(1, Math.round((window.innerWidth > 700 ? 1.5 : 1.2) * dpr)), fr = Math.floor(now * 30);
    // hand-tracked in post: the lettering does not glide with the head. Its anchor is held on a coarse character-cell grid and
    // re-placed only a few times a second, at irregular intervals; now and then a re-placement is a frame late or a cell off, and corrected next time
    const rb = pills.getBoundingClientRect(), cx = CW * k, cy = LH * k, T = (osdFrame.trk = osdFrame.trk || { next: 0, l: 0, b: 0, wrong: false });
    if (now >= T.next || Math.abs(T.l - rb.left * dpr) > cw * 0.5) {
      const late = hsh(fr, 5) < 0.06, off = !T.wrong && hsh(fr, 9) < 0.05;       // a late one waits another beat; a wrong one is one cell out
      if (!late) {
        T.wrong = off; T.l = Math.round(rb.left * dpr / cx) * cx + (off ? cx * (hsh(fr, 3) < 0.5 ? -1 : 1) : 0); T.b = Math.round(rb.bottom * dpr / cy) * cy + (off && hsh(fr, 4) < 0.5 ? cy : 0);
        T.next = now + (off ? 0.12 : 0.18 + hsh(fr, 1) * 0.3);
      } else T.next = now + 0.07;
    }
    const box = { left: T.l / dpr, right: T.l / dpr + rb.width, bottom: T.b / dpr }, al = bub.classList.contains('dock-left') ? 'l' : bub.classList.contains('dock-right') ? 'r' : 'c';
    let y = (box.bottom - 4) * dpr;
    const els = [...pills.children].reverse();
    for (let n = 0; n < els.length; n++) {
      const el = els[n], rank = Math.min(2, +(el.dataset.rank || 0)), base = [1, 0.55, 0.3][rank];
      const vis = clamp(parseFloat(getComputedStyle(el).opacity) / base, 0, 1); if (vis < 0.02) continue;
      // older lines rest dimmer but clean; only a line fading in or out (vis), or a thought read from far off (B.L), breaks up
      const weak = clamp((1 - vis) + (1 - B.L) * 0.5, 0, 1), sig = 1 - weak, rest = [1, 0.78, 0.58][rank];
      const G = glyphs(el.textContent); let kk = k; while (kk > 1 && G.W * kk > cw - 24 * dpr) kk--;
      const w = G.W * kk, h = G.H * kk, kq = kk;
      y -= h; let x0 = al === 'l' ? box.left * dpr : al === 'r' ? box.right * dpr - w : (box.left + box.right) / 2 * dpr - w / 2;
      x0 = Math.round(clamp(x0, 12 * dpr, Math.max(12 * dpr, cw - w - 12 * dpr)) / kq) * kq;
      const seed = fr * 7 + n * 131 + (el.textContent.length * 17);
      const band = (fr * 0.35 + n * 5) % (G.H + 14) - 7, tearAmp = weak * weak * 9;
      const alpha = rest * Math.min(1, vis * 1.6) * (1 - weak * 0.5);
      const smear = 1 + weak * 3;
      for (let r = 0; r < G.H; r++) {
        const drop = hsh(seed + 3, r);
        if (weak > 0.05 && drop < weak * weak * 0.55) continue;           // dropped line (transition only)
        let dx = weak > 0.05 ? ((hsh(seed, r) - 0.5) * (0.5 + weak * 5)) | 0 : 0;
        const db = Math.abs(r - band); if (weak > 0.05 && db < 3) dx += Math.round(tearAmp * (1 - db / 3) * (hsh(fr, n) > 0.5 ? 1 : -1));
        const X = x0 + dx * kq, Y = y + r * kq;
        og.globalAlpha = alpha; og.drawImage(G.edge, 0, r, G.W, 1, X + kq, Y + kq * 0.5, w, kq);
        og.globalAlpha = alpha * (0.10 + weak * 0.5); og.drawImage(G.red, 0, r, G.W, 1, X + Math.round(smear) * kq, Y, w, kq); og.drawImage(G.blue, 0, r, G.W, 1, X - Math.round(smear * 0.6) * kq, Y, w, kq);
        og.globalAlpha = alpha; og.drawImage(G.white, 0, r, G.W, 1, X, Y, w, kq);
      }
      const ns = Math.round(weak * weak * G.W * G.H * 0.12);
      og.fillStyle = '#e8e8e0';
      for (let i = 0; i < ns; i++) { og.globalAlpha = 0.25 + hsh(seed + i, 77) * 0.5 * vis; og.fillRect(x0 + Math.floor(hsh(seed, i + 500) * G.W) * kq, y + Math.floor(hsh(seed + 1, i + 900) * G.H) * kq, kq * (1 + (hsh(i, seed) * 3 | 0)), kq); }
      og.globalAlpha = 1;
      y -= 2 * k;
    }
  }

  // ------------------------------------------------------------ the opening: watch first, then a gentle invitation to step in
  const inv0 = () => ({ stage: 0, t: 0, tipAt: -999, clock: 0, unseen: 0, html: '' }), inv = inv0();
  const IV = $('invite');
  function showInvite(html) { if (inv.html !== html) { IV.innerHTML = html; inv.html = html; } IV.classList.add('on'); }
  function inviteFrame(dt) {
    inv.clock += dt;
    if (!S.started || S.paused || S.dead || flags.panel) { IV.classList.remove('on'); return; }
    inv.t += dt; const d = dev();
    if (inv.stage === 0) { inv.stage = 1; inv.t = 0; }
    if (inv.stage === 1) {
      if (S.mode !== 'observe') { inv.stage = 2; inv.t = 0; IV.classList.remove('on'); return; }
      const at = '';      // (the old open start added ': you step in where the camera stands'; dropped 2026-11-18 so the open start reads as the live page did)
      if (inv.t > 1.5) showInvite(d === 'touch' ? `use the <b>left stick</b> to walk, the <b>right</b> to look${at}.<small>or just watch.</small>`
        : d === 'pad' ? `<b>left stick</b> to walk, <b>right stick</b> to look${at}.<small>or just watch.</small>`
        : `${kb('move')} to walk, or move the <b>mouse</b> to look${at}.<small>or just watch.</small>`);
      return;
    }
    if (S.mode !== 'foot') { IV.classList.remove('on'); return; }
    inv.foot = (inv.foot || 0) + dt;
    // teach: one short prompt at a time, when a verb first matters; it goes as soon as you do it, and comes back (a few
    // times at most) until you have done it twice
    const T = teach, V = arena.victims && arena.victims.get('you'), heldNow = !!(V && !V.free && !V.dead && !S.dead);
    if (heldNow && T.cur !== 'struggle' && ok('struggle')) { T.cur = 'struggle'; T.until = inv.clock + 6; T.count = uses('struggle'); bump('struggle'); }
    if (T.cur) {
      if (uses(T.cur) > T.count || inv.clock > T.until || (T.cur === 'struggle' && !heldNow)) { T.cur = null; T.gap = inv.clock + 5; IV.classList.remove('on'); }
      else showInvite(fmtB((d === 'touch' && TEACH_TOUCH[T.cur]) || TEACH[T.cur]));
    } else if (inv.clock > T.gap) {
      const k = nextLesson(); if (k) { T.cur = k; T.until = inv.clock + 7; T.count = uses(k); bump(k); }
    }
    if (T.cur) return;
    // later: if it is far off and has lost track of you for a while, remind now and then how to call it over (until you have called a few times)
    const far = camera.position.distanceTo(sim.head.pos) > 55;
    inv.unseen = far && !mind.know.seen ? inv.unseen + dt : 0;
    if (inv.unseen > 25 && inv.clock - inv.tipAt > 120 && uses('call') < 4) { inv.tipAt = inv.clock; inv.tipEnd = inv.clock + 6; }
    if (inv.clock < (inv.tipEnd || 0)) showInvite(fmtB('{call} to call it')); else IV.classList.remove('on');
  }
  // what the player has done (uses) and how often each tip has been shown, remembered between visits where storage allows
  const lesson0 = () => ({ cur: null, until: 0, gap: 0, count: 0 }), teach = { used: {}, shown: {}, ...lesson0() };
  try {
    if (!o.test) {
      const st = JSON.parse(localStorage.getItem('dh.teach') || 'null');
      if (st) { Object.assign(teach.used, st.used); Object.assign(teach.shown, st.shown); }
      else for (const k of JSON.parse(localStorage.getItem('dh.taught') || '[]')) teach.used[k] = DONE;      // the older once-only list
    }
  } catch {}
  const save = () => { if (!o.test) try { localStorage.setItem('dh.teach', JSON.stringify({ used: teach.used, shown: teach.shown })); } catch {} };
  const uses = (k) => teach.used[k] || 0;
  const bump = (k) => { teach.shown[k] = (teach.shown[k] || 0) + 1; save(); };
  const ok = (k) => uses(k) < DONE && (teach.shown[k] || 0) < SHOW && !(k === 'use' && !itemNames().length) && !(k === 'items' && itemNames().length < 2) && !(k === 'torch' && !KIT.torch);
  /** The player did it (counts toward retiring its tip and its key chip). */
  function taught(k) { teach.used[k] = uses(k) + 1; if (teach.used[k] <= DONE + 1) save(); }
  function nextLesson() {
    const d = camera.position.distanceTo(sim.head.pos), t = inv.foot;
    const B = mind.beh && mind.beh.name, chased = ['chase', 'pounce', 'prowl', 'bluff', 'test'].includes(B);
    if (ok('run') && chased && d < 45) return 'run';
    if (ok('use') && mind.know.seen && mind.know.target && mind.know.target.id === 'you') return 'use';      // the flare: once it has you in sight, the moment one is worth throwing
    if (ok('call') && t > 8 && (d > 40 || !mind.know.seen)) return 'call';
    if (ok('zoom') && t > 6 && d > 45 && B && inViewNow()) return 'zoom';
    if (ok('crouch') && t > 12 && d < 35) return 'crouch';
    if (ok('items') && uses('use') && t > 20) return 'items';
    if (ok('torch') && t > 40) return 'torch';
    if (ok('peek') && t > 70) return 'peek';
    return null;
  }
  const inViewNow = () => { pv.copy(sim.head.pos).project(camera); return pv.z < 1 && Math.abs(pv.x) < 0.8 && Math.abs(pv.y) < 0.8; };

  // ------------------------------------------------------------ the one contextual action: a prompt (or touch button) only while it is available
  const PR = $('prompt'), TA = $('tAct'); let prWhat = '';
  function promptFrame() {
    const w = S.started && !S.paused && !S.dead && act.interactable ? act.interactable() : null;
    if (w !== prWhat) { prWhat = w; if (w) { PR.innerHTML = `${kb('act')}${esc(w)}`; TA.textContent = w === 'take the meat' ? 'take' : w === 'climb down' ? 'down' : w.replace(/ the door$/, ''); } }      // the verb itself is the name (climb, bar the door)
    PR.classList.toggle('on', !!w); TA.hidden = !w;
  }
  // ------------------------------------------------------------ what you carry, in one place: torch on/off and the flares left
  // Keyboard and pad: a small readout bottom-left, each line with its key until the player has used it twice. Touch: the
  // flare button shows the pips itself and the torch button its pressed state.
  let hudKey = '', hudFlashT = 0;
  const pips = (n, max) => (max > 0 ? '\u25CF'.repeat(Math.max(0, n)) + '\u25CB'.repeat(Math.max(0, max - n)) : '');
  function hudFrame() {
    const K = S.kit, items = S.items || [], cur = items[S.item], c = cur && K[cur], torch = !!(o.props ? o.props.torchOn : document.querySelector('[data-torch][aria-pressed="true"]'));
    const d = dev(), Kd = KEYS[d], n = c ? Math.max(0, Math.floor(c.n)) : 0, max = c ? c.max : 0;
    const key = [d, cur, n, max, torch, uses('use') >= DONE, uses('torch') >= DONE, items.length].join('|');
    if (key === hudKey) return; hudKey = key;
    const ht = $('hTorch'), hf = $('hFlare');
    ht.hidden = !KIT.torch; ht.classList.toggle('on', torch);
    ht.querySelector('.kc').textContent = d === 'touch' || uses('torch') >= DONE ? '' : Kd.torch;
    hf.hidden = !items.length;
    hf.firstChild.textContent = !cur ? '' : n < 1 ? 'no ' + cur + 's ' : cur + 's ';
    hf.classList.toggle('none', n < 1);
    hf.querySelector('.pips').textContent = n > 0 ? pips(n, max) : '';
    hf.querySelector('.kc').textContent = d === 'touch' || uses('use') >= DONE || n < 1 ? '' : Kd.use;
    const ti = $('tItem'); if (ti) { ti.querySelector('.nm').textContent = cur || 'none'; ti.querySelector('.pips').textContent = pips(n, max); ti.setAttribute('aria-label', `${cur || 'none'}, ${n} left`); }
    
  }
  /** What is in hand changed (or ran out): a brief brightening of the readout. */
  function held() {
    hudKey = ''; hudFrame(); const H = $('kitHud'); H.classList.add('flash'); clearTimeout(hudFlashT); hudFlashT = setTimeout(() => H.classList.remove('flash'), 900);
    if ((S.items || []).length > 1) taught('items');
  }
  /** The device changed: redraw every place that names a key or a button. */
  function devChanged() {
    const d = dev(), K = KEYS[d];
    $('sKeys').innerHTML = ctlHTML(CTL_START());
    if (S.paused) $('pKeys').innerHTML = ctlHTML();
    if (peeking) $('peekKeys').innerHTML = ctlHTML();
    $('helpKey').textContent = d === 'touch' ? '' : K.peek; $('pauseKey').textContent = d === 'touch' ? '' : K.pause; try { $('xKeys').textContent = D.shown ? keysLine() : ''; } catch {}
    inv.html = ''; prWhat = null; hudKey = '';
  }
  function note(t) { const H = $('hint'); H.textContent = t; H.classList.add('on'); clearTimeout(hintT); hintT = setTimeout(() => H.classList.remove('on'), 1300); }

  // ------------------------------------------------------------ injury: subtle, at the edges; a flush when a blow lands
  const HU = $('hurt'); let lastH = 1, flashT = 0;
  function hurtFrame(dt) {
    const V = arena.victims && arena.victims.get('you');
    let hp = V && typeof V.health === 'number' ? V.health : null; if (hp !== null && hp > 1.0001) hp /= 100;
    if (hp === null || S.mode !== 'foot') { HU.style.opacity = S.dead && !S.replay ? '0.8' : '0'; lastH = 1; return; }
    hp = clamp(hp, 0, 1);
    if (hp < lastH - 0.03) flashT = 0.35;
    lastH = hp; flashT = Math.max(0, flashT - dt);
    const base = S.dead ? (S.replay ? 0 : 0.8) : clamp((1 - hp) * 0.8, 0, 0.7) * (hp < 0.35 ? 0.85 + 0.15 * Math.sin(inv.clock * 5) : 1);
    HU.classList.toggle('flash', flashT > 0); HU.style.opacity = Math.min(1, base + (flashT > 0 ? 0.35 : 0)).toFixed(3);
  }

  // ------------------------------------------------------------ the end: what happened, in its words; how long you lasted
  const D0 = () => ({ evt: null, at: 0, shown: false, cause: '', auto: false, fade: -9, fadeLen: 0.8 }), D = D0();
  // the cut: a fraction of a second after the jaws close the picture is gone, hard (no fade): black, or with the camcorder look
  // the tape running out into snow and then black. The end card comes up out of that.
  const CUT = document.createElement('div'), CC = document.createElement('canvas'), cg = CC.getContext('2d');
  CUT.style.cssText = 'position:fixed;inset:0;z-index:11;background:#000;display:none;pointer-events:none'; CC.width = 192; CC.height = 108;
  CC.style.cssText = 'width:100%;height:100%;image-rendering:pixelated;display:block'; CUT.appendChild(CC); document.body.appendChild(CUT);
  let snowData = null;
  function cutFrame() {
    if (S.replay) {      // fading in from the black into the replay
      const k = (inv.clock - D.fade) / D.fadeLen;
      CUT.style.display = k < 1 ? 'block' : 'none'; CUT.style.opacity = String(Math.max(0, 1 - k)); CC.style.visibility = 'hidden'; return;
    }
    CUT.style.opacity = '1';
    const on = S.dead && !D.shown && inv.clock - D.at > 0.18;      // (closeout: with the death menu up the scene shows behind it, dimmed)
    CUT.style.display = on ? 'block' : 'none'; if (!on) return;
    const k = inv.clock - D.at - 0.18, snow = vhs() && k < 0.7;
    CC.style.visibility = snow ? 'visible' : 'hidden'; if (!snow) return;
    if (!snowData) snowData = cg.createImageData(CC.width, CC.height);
    const px = snowData.data, a = 1 - k / 0.7;
    for (let i = 0; i < px.length; i += 4) { const v = Math.random() * 255 * a; px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255; }
    cg.putImageData(snowData, 0, 0);
  }
  function deathFrame() {
    const V = arena.victims && arena.victims.get('you');
    if (!S.dead && S.mode === 'foot' && (D.evt || (V && V.dead))) {
      S.dead = true; D.at = inv.clock; D.shown = false; D.auto = false; D.cause = (D.evt && D.evt.cause) || (V && V.cause) || '';
      D.lasted = S.footSince ? (performance.now() - S.footSince) / 1000 : 0;
      S.keys.clear(); if (session) session.releasePointer();
    }
    // owner: "death cam lets make that automatic a second or so after the shocking black screen from the death. fade in from black and auto watch the replay."
    // It starts ~1.2 s after the death while the tape still takes its last 2.5 s; with nothing to play the card comes up as before.
    if (S.dead && !D.shown && !S.replay) {
      if (!D.auto && inv.clock - D.at > 1.2) { D.auto = true; if (!playReplay(0.8, true)) showDeath(); }
      else if (D.auto) showDeath();      // the replay ran out or was skipped
    }
    cutFrame();
  }
  function playReplay(fade, auto) {
    if (!(session && session.canReplay && session.canReplay() && session.replay(!!auto))) return false;
    D.fade = inv.clock; D.fadeLen = fade; return true;
  }
  // closeout: the death menu. A slim panel in the security system's own lettering over the (dimmed) last frame of the footage: one line of facts, one deadpan line of
  // advice (the very sentence the closing card of a saved clip shows: clip.js caches it for this death), and three ranked actions.
  const WORDS = { bite: 'BITTEN', bitten: 'BITTEN', jaws: 'BITTEN', seize: 'BITTEN', shake: 'SHAKEN', shaken: 'SHAKEN', crush: 'CRUSHED', crushed: 'CRUSHED', stamp: 'STAMPED ON', stamped: 'STAMPED ON', pin: 'PINNED', pinned: 'PINNED', toss: 'THROWN', tossed: 'THROWN', thrown: 'THROWN', fall: 'A FALL', landed: 'A FALL', butt: 'HEADBUTTED', swipe: 'TAIL STRIKE', tail: 'TAIL STRIKE', eaten: 'EATEN', eat: 'EATEN', fed: 'EATEN' };
  function keysLine() {
    const d = dev(), a = [['go again', d === 'pad' ? 'A' : 'Enter']]; if (!$('xReplay').hidden) a.push(['watch again', d === 'pad' ? 'X' : 'R']); if (!$('xClip').hidden) a.push(['save clip', d === 'pad' ? 'Y' : 'C']);
    return d === 'touch' ? '' : a.map(([n, k]) => `${k} ${n}`).join(' \u00b7 ');
  }
  function showDeath() {
    D.shown = true; peek(false);
    let L = null; try { L = S.clip && S.clip.lineFor ? S.clip.lineFor() : null; } catch {}
    const cause = typeof D.cause === 'string' && D.cause ? (WORDS[D.cause.toLowerCase()] || D.cause.toUpperCase()) : '';
    $('xFacts').textContent = ['INCIDENT No. ' + (L ? L.no : '0000'), 'VISITOR LASTED ' + dur(D.lasted).toUpperCase(), cause].filter(Boolean).join(' \u00b7 ');
    $('xAdvice').textContent = L ? L.text : '';
    { const n = achv.next(); $('xDare').textContent = n ? `NEXT DARE: ${n.dare}` : ''; $('xDare').hidden = !n; }
    const tape = !!(session && session.canReplay && session.canReplay());
    $('xReplay').hidden = !tape; { const b = $('xClip'); b.hidden = !(tape && session && session.clipOK && session.clipOK()); if (S.clip) S.clip.onState = syncClip; clipBusy = false; syncClip(); }      // (the clip of this death is kept: it was recorded as the replay played)
    $('xKeys').textContent = keysLine();
    document.body.classList.add('dead');
    try { $('xAgain').focus({ preventScroll: true }); } catch {}      // Enter, Space or A goes again
  }
  /** Go again: a new life after a death (the pause card's "start over" is a new scenario instead: main.js startOver). */
  function retry(watch, force) {
    if (!S.dead && !force) return;
    act.respawn();
    const V = arena.victims && arena.victims.get('you');
    if (V) { if (V.dead) V.dead = false; if (typeof V.health === 'number' && V.health <= 0) V.health = V.health > 1 ? 100 : 1; }
    D.evt = null; D.shown = false; D.auto = false; S.dead = false; achv.reset(false); if (S.clip && S.clip.resetLine) S.clip.resetLine(); document.body.classList.remove('dead');
    if (S.zoom) { S.zoom.toggle = false; S.zoom.hold = false; const z = $('tZoom'); if (z) z.setAttribute('aria-pressed', 'false'); }      // a new life starts unzoomed
    if (watch && session) session.setMode('observe');
    if (session) session.lockPointer();
  }
  $('xAgain').addEventListener('click', () => { audio.resume(); retry(false); });
  $('xReplay').addEventListener('click', () => { audio.resume(); playReplay(0.4); });
  // clip: the death replay was recorded as it played (src/view/clip.js, main.js startReplay), so SAVE CLIP hands the file over from the very click. Only when the replay was
  // skipped (no finished clip) does it play the replay and card once more, recorded, with a small tag (main.js startClip).
  let clipBusy = false;
  function syncClip() {
    const b = $('xClip'), sub = $('xClipSub'), c = S.clip; if (!b || !c) return;
    if (!clipBusy) { const fin = c.state === 'finishing'; b.disabled = fin; b.textContent = fin ? 'preparing\u2026' : 'save clip'; }
    if (!sub.classList.contains('show')) { sub.textContent = 'plays the replay once more while recording a video for you'; sub.hidden = b.hidden || !!c.blob || c.state === 'finishing'; }
  }
  /** What came of a hand-over (from the button, or at the end of a re-recording). */
  function clipResult(r) {
    const b = $('xClip'), sub = $('xClipSub'); if (!b) return; r = r || {};
    if (r.ok) { clipBusy = true; b.disabled = false; b.textContent = 'saved'; setTimeout(() => { clipBusy = false; syncClip(); }, 1600); return; }
    clipBusy = false; syncClip();      // declined, or the browser wants a press: the button is usable again
    if (!r.declined && !r.needsPress) { sub.textContent = 'Saving is not available in this view.'; sub.hidden = false; sub.classList.add('show'); setTimeout(() => { sub.classList.remove('show'); syncClip(); }, 4000); }
  }
  function clipClick() {
    const c = S.clip; audio.resume(); if (clipBusy || !c || c.state === 'finishing') return;
    if (c.blob) { clipBusy = true; const b = $('xClip'); b.disabled = true; b.textContent = 'saving\u2026'; c.deliver().then(clipResult, () => clipResult({})); return; }      // (deliver starts in this click: the share sheet needs it)
    if (session && session.clip && session.clip()) { D.fade = inv.clock; D.fadeLen = 0.4; }
  }
  function clipReady() {}
  if ($('xClip')) $('xClip').addEventListener('click', () => { try { clipClick(); } catch {} });
  const deathFocus = () => { try { $('xAgain').focus({ preventScroll: true }); } catch {} };
  // ------------------------------------------------------------ photo: the frame, the bubble, a quiet wordmark
  function compose() {
    const W = canvas.width, H = canvas.height, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), sx = W / canvas.clientWidth;
    g.drawImage(canvas, 0, 0, W, H);
    const v = g.createRadialGradient(W / 2, H * 0.46, H * 0.35, W / 2, H * 0.46, H * 0.95); v.addColorStop(0, 'rgba(6,8,10,0)'); v.addColorStop(1, 'rgba(6,8,10,0.5)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
    if (vhs() && B.vis) g.drawImage(OSD, 0, 0, W, H);      // the camcorder's own lettering, as it is on the tape
    else if (B.vis && bub.classList.contains('on')) {
      const fam = getComputedStyle(bub).fontFamily;
      for (const el of bub.querySelectorAll('.pill')) {
        const op = parseFloat(getComputedStyle(el).opacity); if (!(op > 0.04)) continue;
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el), fs = parseFloat(cs.fontSize) * (r.width / el.offsetWidth || 1) * sx;
        const x = r.left * sx, y = r.top * sx, w = r.width * sx, h = r.height * sx, rad = Math.min(h / 2, 14 * sx);
        g.globalAlpha = op; g.fillStyle = 'rgba(0,0,0,0.62)'; g.beginPath(); g.roundRect(x, y, w, h, rad); g.fill();
        g.font = `${fs}px ${fam}`; g.fillStyle = '#f1eee4'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const words = el.textContent.split(' '), maxW = w - fs * 1.8, lines = []; let cur = '';
        for (const wd of words) { const n = cur ? cur + ' ' + wd : wd; if (cur && g.measureText(n).width > maxW) { lines.push(cur); cur = wd; } else cur = n; }
        if (cur) lines.push(cur); const lh = fs * 1.3, y0 = y + h / 2 - (lines.length - 1) * lh / 2;
        lines.forEach((ln, i) => g.fillText(ln, x + w / 2, y0 + i * lh));
        g.globalAlpha = 1;
      }
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    }
    g.letterSpacing = '0px'; g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 8; g.fillStyle = 'rgba(241,238,228,0.8)'; const f = Math.max(11, W / 90);
    g.font = `500 ${f * 1.15}px "Barlow Condensed", "Arial Narrow", sans-serif`; g.letterSpacing = f * 0.38 + 'px'; g.textAlign = 'right'; g.fillText('REX ENCOUNTER', W - f * 1.8, H - f * 1.8);
    return c;
  }
  let shotReq = false;
  function photo() { shotReq = true; if (o.test) return; }
  function afterRender() {
    if (!shotReq) return; shotReq = false;
    try {
      const c = compose(); o.lastShot = c;
      c.toBlob((b) => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `rex-encounter-${SEED}-${Date.now().toString(36)}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, 'image/png');
      const H = $('hint'); H.textContent = 'Photo saved'; H.classList.add('on'); clearTimeout(hintT); hintT = setTimeout(() => H.classList.remove('on'), 1600);
    } catch (err) { console.warn('photo failed', err); }
  }

  // ------------------------------------------------------------ gamepad d-pad, debug only: up photo, left thoughts, right panel
  let dprev = [0, 0, 0, 0, 0];
  function padKeys() {
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null; if (!gp) return;
    const b = [12, 13, 14, 15, 0].map((i) => (gp.buttons[i] && gp.buttons[i].pressed ? 1 : 0)), dn = (i) => b[i] && !dprev[i];
    if (debugOn && !S.dead && S.started && !S.paused) { if (dn(0)) photo(); if (dn(2)) set('thoughts', flags.thoughts === 'never' ? lastShown : 'never'); if (dn(3)) set('panel'); }      // (A on the end card is main.js's menu navigation)
    dprev = b;
  }

  // ------------------------------------------------------------ per frame
  let acc = 0, pausedOnce = false;
  apply(); devChanged();
  return {
    clipReady, clipResult, deathMenu: showDeath, deathFocus, flags, set, achv, photo, whistle, toggleAll: () => set('bare'), taught, peek, held, note, devChanged,
    get debug() { return debugOn; }, setDebug,
    /** "Start over" (main.js startOver): the new animal and mind, and nothing left of the last scenario on screen: thoughts, tips, the death card. */
    restart(n) {
      ({ sim, mind, SEED } = n); Object.assign(AC, { sim, mind, things: arena.things }); achv.t = 0; achv.reset(false);
      for (const it of B.items) retire(it); renew(B, B0()); bub.classList.remove('on');
      renew(inv, inv0()); IV.classList.remove('on'); Object.assign(teach, lesson0()); renew(D, D0()); CUT.style.display = 'none'; document.body.classList.remove('dead');
      peek(false); set('panel', false); lastThink = ''; prWhat = ''; hudKey = ''; lastH = 1; flashT = 0;
    },
    paused(p) { if (p) { drawPause(); if (!pausedOnce) { pausedOnce = true; $('gKeys').open = dev() !== 'touch'; } } },      // phones: the start card and "?" carry the controls; the settings come first
    get lastShot() { return o.lastShot; },
    /** dt stops while paused; dtReal keeps running (fades, the end card's timing). */
    frame(dt, dtReal = dt) {
      if (!S.dead) achv.update(dt, youNow()); padKeys();
      bubbleFrame(S.nowSec = (S.nowSec || 0) + dt, dt); osdFrame(performance.now() / 1000); promptFrame();
      inviteFrame(dtReal); hurtFrame(dtReal); deathFrame(); hudFrame();
      if (!S.noRender) afterRender();
      acc -= dtReal; if (acc <= 0) { acc = 0.12; readout(); }
    },
  };
}
