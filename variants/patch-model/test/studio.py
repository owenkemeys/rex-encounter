#!/usr/bin/env python3
"""Studio render: one full-size PNG of the real skinned animal on a plain floor. See test/studio.md.
   python3 test/studio.py OUT.png cam=side scen=walk t=4.2
   python3 test/studio.py OUT.png cam=foot_L scen=walk phase=toeoff foot=L
Options are passed through to the page hash (src/studio.js). --nobuild skips the esbuild step."""
import sys, os, subprocess, time, json, socket
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'out', 'skel', 'studio')
args = [a for a in sys.argv[1:] if not a.startswith('--')]
flags = [a for a in sys.argv[1:] if a.startswith('--')]
out = os.path.abspath(args[0]); opts = args[1:]
os.makedirs(DIST, exist_ok=True); os.makedirs(os.path.dirname(out), exist_ok=True)
t0 = time.time()
if '--nobuild' not in flags or not os.path.exists(os.path.join(DIST, 'studio.js')):
    subprocess.run(['npx', 'esbuild', 'src/studio.js', '--bundle', '--format=esm', '--minify', '--outfile=' + os.path.join(DIST, 'studio.js'), '--log-level=warning'], cwd=ROOT, check=True)
with open(os.path.join(DIST, 'index.html'), 'w') as f:
    f.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>studio</title><style>html,body{margin:0;background:#9fa0a3}canvas{display:block}</style></head>'
            '<body><canvas id="view"></canvas><script type="module" src="studio.js"></script></body></html>')
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['python3', '-m', 'http.server', str(port), '-b', '127.0.0.1', '-d', DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.6)
W = H = None
for o in opts:
    if o.startswith('w='): W = int(o[2:])
    if o.startswith('h='): H = int(o[2:])
W = W or 1280; H = H or 720
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--no-sandbox'])
        pg = b.new_page(viewport={'width': W, 'height': H})
        logs = []
        pg.on('console', lambda m: logs.append(m.type + ': ' + m.text))
        pg.on('pageerror', lambda e: logs.append('PAGEERROR: ' + str(e)))
        pg.goto(f'http://127.0.0.1:{port}/index.html#' + '&'.join(opts), timeout=300000)
        pg.wait_for_function('window.__studio && window.__studio.done', timeout=600000, polling=500)
        st = pg.evaluate('window.__studio')
        pg.locator('#view').screenshot(path=out)
        b.close()
finally:
    srv.kill()
st['info']['wall_s'] = round(time.time() - t0, 1)
print(json.dumps(st['info']))
if st.get('error'): print('ERROR', st['error'])
for l in logs:
    if l.startswith(('error', 'PAGEERROR', 'warning')): print(l[:300])
