# The pause card's "start over" must give exactly what a fresh page load gives (owner: "needs to genuinely restart the scenario to save
# having to do an F5"), in place, without reloading the page (owner: "That's clunky and ugly, just reset"). Plays a bit, dirties the
# state, presses start over and checks the result against a fresh load taken the same way: mid-run, after a second run, and twice in a
# row. Also checks that no navigation happened and that restarts leave nothing behind (listeners, timers, scene objects, GPU resources).
# Usage: npm run build && python3 test/restart.py ["#webgl"]   (Playwright + Chrome, as tools/load_check.py). Exit 0 = pass.
import sys, json, subprocess, time, socket, os
from playwright.sync_api import sync_playwright
hashv = sys.argv[1] if len(sys.argv) > 1 else ''
s = socket.socket(); s.bind(('127.0.0.1', 0)); PORT = s.getsockname()[1]; s.close()
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
srv = subprocess.Popen(['python3', '-m', 'http.server', str(PORT), '-b', '127.0.0.1', '-d', D], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.7)
args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--no-sandbox']
# live listeners, timers and audio contexts, counted from before the game's first line runs
COUNT = """(() => { const C = window.__count = { listeners: 0, intervals: 0, audioContexts: 0 }, seen = new WeakMap();
  const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
  const key = (t, f, o) => t + '|' + !!(o === true || (o && o.capture));
  EventTarget.prototype.addEventListener = function (t, f, o) { if (f) { let m = seen.get(this); if (!m) seen.set(this, m = new Map()); let s = m.get(f); if (!s) m.set(f, s = new Set()); const k = key(t, f, o); if (!s.has(k)) { s.add(k); C.listeners++; } } return add.call(this, t, f, o); };
  EventTarget.prototype.removeEventListener = function (t, f, o) { const s = f && seen.get(this) && seen.get(this).get(f), k = key(t, f, o); if (s && s.delete(k)) C.listeners--; return rem.call(this, t, f, o); };
  const si = window.setInterval, ci = window.clearInterval, live = new Set();
  window.setInterval = function (...a) { const id = si.apply(this, a); live.add(id); C.intervals = live.size; return id; };
  window.clearInterval = function (id) { live.delete(id); C.intervals = live.size; return ci.call(this, id); };
  for (const k of ['AudioContext', 'webkitAudioContext']) { const A = window[k]; if (A) window[k] = class extends A { constructor(...a) { super(...a); C.audioContexts++; } }; }
})()"""
SNAP = """(() => { const R = window.__rex, S = R.S, sim = R.sim, A = R.arena, m = A.mind, V = A.victims.get('you'), T = A.T, st = document.getElementById('start'), b = document.body.classList;
  const tr = R.world.trampleField, d = tr && tr.texture.image.data; let press = 0; if (d) for (let i = 2; i < d.length; i += 4) press += d[i];
  let runs = null; try { runs = JSON.parse(localStorage.getItem('rex.runs') || 'null'); } catch {}
  let objs = 0; R.scene.traverse(() => objs++); const mem = R.renderer.info.memory || {};
  return { started: !!S.started, bodyStarted: b.contains('started'), splash: !!st && getComputedStyle(st).display !== 'none' && !st.hidden,
    paused: !!S.paused, bodyPaused: b.contains('paused'), bodyDead: b.contains('dead'), mode: S.mode, footSince: S.footSince ?? null, dead: !!S.dead, gate: !!S.gate, clock: +S.clock.toFixed(2),
    keys: Object.keys(S).filter((k) => k !== 'thunderAt').sort().join(' '),      /* (a thunderclap on its way is the weather's) */ rexX: +sim.x.toFixed(2), rexZ: +sim.z.toFixed(2), rexT: +sim.t.toFixed(2), mindT: +m.t.toFixed(2),
    wired: A.sim === sim && m.sim === sim && R.audio.sim === sim && R.audio.mind === m && R.director !== null,
    memEnc: m.mem.encounters, memHides: m.mem.hides.length, memHab: Object.keys(m.mem.hab).length, memLastNoise: !!m.mem.lastNoise,
    things: A.things.list.length, herd: A.herd.alive.length, victimLives: V ? (V.lives ?? null) : null, victimDead: V ? !!V.dead : null,
    doors: T.doors.map((x) => x.state + (x.ang === (x.state === 'open' ? x.openYaw : x.closedYaw) ? '' : '~')).join(','),
    torch: !!R.props.torchOn, remains: (R.props.remains || []).length, monitorLive: !!(R.desk && R.desk.isLive), cctv: !!(R.post && R.post.cctv),
    tapeN: R.rec.n, tapeDeath: R.rec.death, kit: JSON.stringify(R.kit), press, runs: runs && runs.total, hash: location.hash,
    leak: { ...window.__count, objs, geometries: mem.geometries ?? null, textures: mem.textures ?? null } }; })()"""
SAME = ('started', 'bodyStarted', 'splash', 'paused', 'bodyPaused', 'bodyDead', 'mode', 'footSince', 'dead', 'gate', 'keys', 'wired', 'memEnc', 'memHides', 'memHab',
        'memLastNoise', 'things', 'herd', 'victimLives', 'victimDead', 'doors', 'torch', 'remains', 'monitorLive', 'cctv', 'tapeN', 'tapeDeath', 'kit', 'hash')
fails = []
def check(name, ok, info=''):
  print(('PASS ' if ok else 'FAIL ') + name + (('  ' + str(info)) if info else ''))
  if not ok: fails.append(name)
def settle(pg):
  pg.wait_for_selector('#startGo', state='visible', timeout=240000)
  pg.wait_for_function('window.__rex && window.__rex.S.clock > 1.5', timeout=60000)      # past the opening's scripted sounds (0.25 s, 0.9 s)
  return pg.evaluate(SNAP)
def play(pg, secs):
  pg.evaluate("document.getElementById('startGo').click()"); time.sleep(3)
  pg.keyboard.down('w'); time.sleep(secs); pg.keyboard.up('w')
def dirty(pg):
  # what a fresh start must not carry over: its memory of you, a flare in the world, a door worked, the torch on, a flare used
  pg.evaluate("""(() => { const R = window.__rex, A = R.arena, m = A.mind, T = A.T; m.mem.encounters += 3; m.mem.hides.push({ x: 1, z: 1 }); m.mem.hab.test = 1;
    A.things.place('flare', R.sim.x + 4, R.sim.z); T.useDoor(T.doors.filter((d) => d.gap === T.doors[0].gap), A.events); R.props.torchOn = true; R.kit.flare.n -= 1; })()""")
  time.sleep(1)
def start_over(pg):
  pg.evaluate("document.getElementById('pauseBtn').click()"); time.sleep(0.5)
  pg.evaluate("document.getElementById('pAgain').click()")
  return settle(pg)
def same(label, got, fresh):
  for k in SAME: check(f'{label} == fresh load: {k}', got[k] == fresh[k], f"{got[k]!r} vs {fresh[k]!r}")
  for k in ('clock', 'rexT', 'mindT'): check(f'{label} == fresh load: {k} restarted', abs(got[k] - fresh[k]) < 3, f"{got[k]} vs {fresh[k]}")
  check(f'{label} == fresh load: animal back at its start', abs(got['rexX'] - fresh['rexX']) + abs(got['rexZ'] - fresh['rexZ']) < 8, f"({got['rexX']},{got['rexZ']}) vs ({fresh['rexX']},{fresh['rexZ']})")
  check(f'{label} == fresh load: trample field clear', got['press'] <= fresh['press'] * 1.5 + 2000, f"{got['press']} vs {fresh['press']}")
  check(f'{label}: scene objects as at a fresh load', got['leak']['objs'] == fresh['leak']['objs'], f"{got['leak']['objs']} vs {fresh['leak']['objs']}")
  check(f'{label}: one audio context', got['leak']['audioContexts'] <= 1, got['leak']['audioContexts'])
def no_growth(label, got, before, keys=('listeners', 'intervals', 'geometries', 'textures')):
  # the first plays create some things once (input listeners, the GPU's first flare, remains and shaders); after that a restart must add none
  L, B = got['leak'], before['leak']
  for k in keys: check(f'{label}: nothing left behind: {k}', L[k] is None or L[k] <= B[k], f"{L[k]} vs {B[k]}")
try:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=args)
    pg = b.new_page(viewport={'width': 960, 'height': 540})
    pg.add_init_script(COUNT)
    errs, navs = [], []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: (errs.append('dialog: ' + d.type), d.dismiss()))
    pg.on('framenavigated', lambda f: navs.append(f.url) if f == pg.main_frame else None)
    pg.goto(f'http://127.0.0.1:{PORT}/index.html{hashv}', wait_until='domcontentloaded', timeout=180000)
    pg.wait_for_function('window.__rex !== undefined', timeout=240000)
    fresh = settle(pg); print('fresh  ', json.dumps(fresh))
    pg.evaluate("window.__samePage = 1")
    # 1: mid-run, the animal near and the state dirty
    play(pg, 4); dirty(pg)
    played = pg.evaluate(SNAP); print('played ', json.dumps(played))
    check('played: the run started and was counted once', played['started'] and played['mode'] == 'foot' and played['runs'] == 1, played['runs'])
    check('played: state is dirty (memory, tape, door, torch, flare)', played['memEnc'] >= 3 and played['tapeN'] > 0 and played['doors'] != fresh['doors'] and played['torch'] and played['things'] > 0)
    again = start_over(pg); print('again  ', json.dumps(again))
    same('start over mid-run', again, fresh)
    check('start over did not count a run by itself', again['runs'] == 1, again['runs'])
    # 2: a second run counts once, and its start over is as clean
    play(pg, 2)
    after = pg.evaluate(SNAP)
    check('the next run counts once', after['runs'] == 2, after['runs'])
    dirty(pg)
    again2 = start_over(pg); print('again2 ', json.dumps(again2))
    same('second start over', again2, fresh)
    no_growth('second start over', again2, again, ('listeners', 'intervals'))
    # 3: twice in a row, straight from the feed (begun, not stepped out)
    pg.evaluate("document.getElementById('startGo').click()"); time.sleep(1)
    again3 = start_over(pg); print('again3 ', json.dumps(again3))
    same('start over twice in a row', again3, fresh)
    no_growth('start over twice in a row', again3, again2)
    print('leaks  ', [x['leak'] for x in (fresh, again, again2, again3)])
    check('runs not counted by restarts', again3['runs'] == 2, again3['runs'])
    check('no page load: same page throughout', pg.evaluate("window.__samePage === 1") and len(navs) == 1, navs)
    check('no page errors or prompts', not errs, errs[:3])
    b.close()
finally: srv.kill()
print('RESULT', 'PASS' if not fails else 'FAIL: ' + ', '.join(fails))
sys.exit(1 if fails else 0)
