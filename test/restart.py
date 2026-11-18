# The pause card's "start over" must give exactly what a fresh page load gives (owner: "needs to genuinely restart the scenario to save
# having to do an F5"). Plays a bit, dirties the state, presses start over, and checks the new page against a fresh load taken the same way.
# Usage: npm run build && python3 test/restart.py ["#webgl"]   (Playwright + Chrome, as tools/load_check.py). Exit 0 = pass.
import sys, json, subprocess, time, socket, os
from playwright.sync_api import sync_playwright
hashv = sys.argv[1] if len(sys.argv) > 1 else ''
s = socket.socket(); s.bind(('127.0.0.1', 0)); PORT = s.getsockname()[1]; s.close()
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
srv = subprocess.Popen(['python3', '-m', 'http.server', str(PORT), '-b', '127.0.0.1', '-d', D], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.7)
args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--no-sandbox']
SNAP = """(() => { const R = window.__rex, S = R.S, sim = R.sim, m = R.arena.mind, V = R.arena.victims.get('you'), st = document.getElementById('start');
  const tr = R.world.trampleField, d = tr && tr.texture.image.data; let press = 0; if (d) for (let i = 2; i < d.length; i += 4) press += d[i];
  let runs = null; try { runs = JSON.parse(localStorage.getItem('rex.runs') || 'null'); } catch {}
  return { started: !!S.started, bodyStarted: document.body.classList.contains('started'), splash: !!st && getComputedStyle(st).display !== 'none' && !st.hidden,
    mode: S.mode, footSince: S.footSince ?? null, dead: !!S.dead, paused: !!S.paused, gate: !!S.gate, clock: +S.clock.toFixed(2),
    rexX: +sim.x.toFixed(2), rexZ: +sim.z.toFixed(2), rexT: +sim.t.toFixed(2),
    memEnc: m.mem.encounters, memHides: m.mem.hides.length, memRecent: m.mem.recent.length, memHab: Object.keys(m.mem.hab).length, memLastNoise: !!m.mem.lastNoise,
    things: R.arena.things.list.length, herd: R.arena.herd.alive.length, victimLives: V ? (V.lives ?? null) : null, victimDead: V ? !!V.dead : null,
    tapeN: R.rec.n, tapeDeath: R.rec.death, kit: JSON.stringify(R.kit), press, runs: runs && runs.total, hash: location.hash }; })()"""
fails = []
def check(name, ok, info=''):
  print(('PASS ' if ok else 'FAIL ') + name + (('  ' + str(info)) if info else ''))
  if not ok: fails.append(name)
def boot(pg, nav):
  if nav: pg.goto(f'http://127.0.0.1:{PORT}/index.html{hashv}', wait_until='domcontentloaded', timeout=180000)
  pg.wait_for_function('window.__rex !== undefined', timeout=240000)
  pg.wait_for_selector('#startGo', state='visible', timeout=240000)
  time.sleep(3)
  return pg.evaluate(SNAP)
def play(pg, secs):
  pg.evaluate("document.getElementById('startGo').click()"); time.sleep(3)
  pg.keyboard.down('w'); time.sleep(secs); pg.keyboard.up('w')
try:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=args)
    pg = b.new_page(viewport={'width': 960, 'height': 540})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: (errs.append('dialog: ' + d.type), d.dismiss()))      # a "leave site?" prompt would stop the restart
    fresh = boot(pg, True); print('fresh  ', json.dumps(fresh))
    play(pg, 4)
    # dirty what a respawn would carry over: a flare in the world, the animal's memory of you, a hurt
    pg.evaluate("""(() => { const R = window.__rex, m = R.arena.mind; m.mem.encounters += 3; m.mem.hides.push({ x: 1, z: 1 }); m.mem.hab.test = 1;
      try { R.arena.things.add && R.arena.things.add({ kind: 'flare', x: R.sim.x + 4, z: R.sim.z, y: 0 }); } catch {} })()""")
    time.sleep(1)
    played = pg.evaluate(SNAP); print('played ', json.dumps(played))
    check('played: the run started and was counted once', played['started'] and played['mode'] == 'foot' and played['runs'] == 1, played['runs'])
    check('played: state is dirty (memory, tape)', played['memEnc'] >= 3 and played['tapeN'] > 0)
    pg.evaluate("document.getElementById('pauseBtn').click()"); time.sleep(0.5)
    with pg.expect_navigation(timeout=120000):
      pg.evaluate("document.getElementById('pAgain').click()")
    again = boot(pg, False); print('again  ', json.dumps(again))
    for k in ('started', 'bodyStarted', 'splash', 'mode', 'footSince', 'dead', 'gate', 'memEnc', 'memHides', 'memRecent', 'memHab', 'memLastNoise', 'things', 'herd', 'victimLives', 'victimDead', 'tapeN', 'tapeDeath', 'kit', 'hash'):
      check(f'start over == fresh load: {k}', again[k] == fresh[k], f"{again[k]!r} vs {fresh[k]!r}")
    check('start over == fresh load: clock restarted', abs(again['clock'] - fresh['clock']) < 3, f"{again['clock']} vs {fresh['clock']}")
    check('start over == fresh load: animal back at its start', abs(again['rexX'] - fresh['rexX']) + abs(again['rexZ'] - fresh['rexZ']) < 8, f"({again['rexX']},{again['rexZ']}) vs ({fresh['rexX']},{fresh['rexZ']})")
    check('start over == fresh load: trample field clear', again['press'] <= fresh['press'] * 1.5 + 2000, f"{again['press']} vs {fresh['press']}")
    check('start over did not count a run by itself', again['runs'] == 1, again['runs'])
    play(pg, 1)
    after = pg.evaluate(SNAP)
    check('the next run counts once', after['runs'] == 2, after['runs'])
    check('no page errors or prompts', not errs, errs[:3])
    b.close()
finally: srv.kill()
print('RESULT', 'PASS' if not fails else 'FAIL: ' + ', '.join(fails))
sys.exit(1 if fails else 0)
