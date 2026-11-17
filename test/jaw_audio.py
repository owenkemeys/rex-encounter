# The jaw follows the voice: play each mouth sound through the real Audio graph offline, sample audio.mouthOpen every 10 ms next to the rendered output's
# envelope and print, per sound: peak mouthOpen, peak noseOpen, the lead of the jaw's rise over the audible onset (ms; MOUTH_LEAD is 70) and the correlation
# of mouthOpen with the output envelope shifted by the lead. usage: python3 test/jaw_audio.py [outdir]   (needs `npm run build` only for dist/audio)
import sys, os, base64, subprocess, time, socket, numpy as np
from playwright.sync_api import sync_playwright
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/jaw_audio'; os.makedirs(out, exist_ok=True)
subprocess.run(['npx', 'esbuild', 'test/jaw_audio.js', '--bundle', '--format=esm', f'--outfile={out}/jaw.js'], cwd=root, check=True, capture_output=True)
subprocess.run(['rm', '-rf', f'{out}/audio']); subprocess.run(['cp', '-r', f'{root}/dist/audio', f'{out}/audio'], check=True)
open(f'{out}/index.html', 'w').write('<!doctype html><script type="module" src="jaw.js"></script>')
s = socket.socket(); s.bind(('127.0.0.1', 0)); PORT = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['python3', '-m', 'http.server', str(PORT), '-b', '127.0.0.1', '-d', out], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.7)
SR = 48000; LEAD = 70
def env(x, ts):  # 10 ms RMS of the output centred on each time
  return np.array([np.sqrt(np.mean(x[min(len(x) - 1, max(0, int((t - 0.005) * SR))):int((t + 0.005) * SR) + 1] ** 2)) if int((t - 0.005) * SR) < len(x) else 0.0 for t in ts])
def cross(a, b, ts, t0):  # first time the series passes 10 % of its peak, after t0
  th = 0.1 * a.max(); i = np.argmax((a > th) & (ts > t0)); return ts[i] if a.max() > 0 else None
try:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required']); pg = b.new_page()
    pg.on('pageerror', lambda e: print('PAGEERROR', e)); pg.on('console', lambda m: print('console', m.text) if m.type == 'error' else None)
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_function('window.renderJaw!==undefined', timeout=60000)
    print('sound   | peak voice dB, hiss dB | peak mouth  peak nose | lead ms (10% rise)  lead ms (best lag) | corr(mouth, out env shifted)')
    for name in sys.argv[2:] or ['roar', 'scream', 'growl', 'rumble', 'huff', 'snort', 'sniff', 'gulp', 'clack', 'crunch']:
      r = pg.evaluate('(o)=>window.renderJaw(o)', {'name': name, 'dist': 6}); rec = r['rec']; ts = np.array(rec['t']); m = np.array(rec['m']); nz = np.array(rec['n'])
      x = np.frombuffer(base64.b64decode(r['wav']), dtype=np.float32); eo = env(x, ts)
      t0 = r['start'] - 0.01; ta = cross(eo, eo, ts, t0); tm = cross(m, m, ts, t0) if m.max() > 0.02 else None
      lead = (ta - tm) * 1000 if (ta is not None and tm is not None) else float('nan')
      # best lag: shift the output envelope earlier by L, maximise correlation with mouthOpen
      best = (-9, 0)
      for L in range(0, 160, 5):
        e2 = env(x, ts + L / 1000); c = np.corrcoef(m, e2)[0, 1] if m.std() > 1e-6 and e2.std() > 1e-9 else float('nan')
        if c > best[0]: best = (c, L)
      e70 = env(x, ts + LEAD / 1000); c70 = np.corrcoef(m, e70)[0, 1] if m.std() > 1e-6 else float('nan')
      X = np.abs(np.fft.rfft(x[int(0.5 * SR):int(2.5 * SR)])) ** 2; fr = np.fft.rfftfreq(int(2.0 * SR), 1 / SR); sh = [X[(fr >= a) & (fr < b)].sum() / (X[(fr >= 80) & (fr < 3000)].sum() or 1) for a, b in ((80, 150), (150, 400), (400, 3000))]; print('        band share 80-150 / 150-400 / 400-3k: %.2f %.2f %.2f' % tuple(sh))
      print(f'{name:7s} | {max(rec["dv"]):6.1f} {max(rec["dn"]):6.1f} | {m.max():6.2f} {nz.max():9.2f} | {lead:12.0f} {best[1]:18d} | {c70:6.2f}  (best {best[0]:.2f})')
    b.close()
finally: srv.kill()
