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
SR = 48000; LEAD = 90
def env(x, ts):  # 10 ms RMS of the output centred on each time
  return np.array([np.sqrt(np.mean(x[min(len(x) - 1, max(0, int((t - 0.005) * SR))):int((t + 0.005) * SR) + 1] ** 2)) if int((t - 0.005) * SR) < len(x) else 0.0 for t in ts])
def cross(a, b, ts, t0):  # first time the series passes 10 % of its peak, after t0
  th = 0.1 * a.max(); i = np.argmax((a > th) & (ts > t0)); return ts[i] if a.max() > 0 else None
try:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required']); pg = b.new_page()
    pg.on('pageerror', lambda e: print('PAGEERROR', e)); pg.on('console', lambda m: print('console', m.text) if m.type == 'error' else None)
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_function('window.renderJaw!==undefined', timeout=60000)
    print('sound seed | open peak mean | low dB high dB tilt dB | drawn rad  flutter rad | reversals/s | lead(best lag) corr')
    def rev(j, ts):  # direction reversals larger than 15% of the peak, per second of the sound (drawn > 10% of peak)
      pk = j.max()
      if pk < 1e-3: return 0.0
      act = ts[j > 0.1 * pk]; dur = max(0.2, act.max() - act.min()) if len(act) else 0.2
      n = 0; lo = hi = j[0]; d = 0; th = 0.15 * pk
      for v in j:
        if d >= 0:
          hi = max(hi, v)
          if hi - v > th: n += d == 1; d = -1; lo = v
        if d <= 0:
          lo = min(lo, v)
          if v - lo > th: n += d == -1; d = 1; hi = v
      return n / dur
    names = [a for a in sys.argv[2:] if not a.isdigit()] or ['roar', 'scream', 'shout', 'growl', 'rumble', 'huff', 'snort', 'sniff', 'gulp', 'clack', 'crunch']; seeds = [int(a) for a in sys.argv[2:] if a.isdigit()] or [12345, 777, 4242]
    for name in names:
     for seed in seeds:
      r = pg.evaluate('(o)=>window.renderJaw(o)', {'name': name, 'dist': 6, 'seed': seed}); rec = r['rec']; ts = np.array(rec['t']); m = np.array(rec['m']); jw = np.array(rec['jaw'])
      x = np.frombuffer(base64.b64decode(r['wav']), dtype=np.float32); sel = ts > r['start'] - 0.02
      act = m > 0.5 * max(m.max(), 1e-6); dh = np.array(rec['dh']); br = np.array(rec['br'])[(dh > dh.max() - 10) & sel]; brm = br.mean() if len(br) else 0
      fl = np.abs(jw - 0.75 * m).max()
      if os.environ.get('BANDS'):
        seg = x[int(r['start'] * SR):]; F = 4096; W = [np.abs(np.fft.rfft(seg[i:i + F] * np.hanning(F))) ** 2 for i in range(0, len(seg) - F, 2048)]; en = np.array([w.sum() for w in W]); fq = np.fft.rfftfreq(F, 1 / SR)
        keep = [w for w, e in zip(W, en) if e > 0.1 * en.max()]; Pm = np.mean(keep, axis=0) if keep else np.zeros(len(fq)); tot = Pm[(fq >= 80) & (fq < 3500)].sum() or 1
        print('     bands dB re 80-3.5k: ' + ' '.join('%s %.1f' % (n, 10 * np.log10(Pm[(fq >= a) & (fq < b)].sum() / tot + 1e-12)) for n, a, b in (('80-200', 80, 200), ('200-400', 200, 400), ('400-700', 400, 700), ('0.7-1k', 700, 1000), ('1-2k', 1000, 2000), ('2-3.5k', 2000, 3500))))
      best = (-9, 0)
      for L in range(0, 160, 5):
        e2 = env(x, ts + L / 1000); c = np.corrcoef(m, e2)[0, 1] if m.std() > 1e-6 and e2.std() > 1e-9 else float('nan')
        if c > best[0]: best = (c, L)
      print(f'{name:7s} {seed:5d} | {m.max():5.2f} {m[sel].mean():5.2f} | {max(rec["dl"]):6.1f} {max(rec["dh"]):6.1f} {brm:6.2f} | {jw.max():7.3f} {fl:10.3f} | {rev(0.75 * m, ts):6.1f} | {best[1]:4d} ms {best[0]:5.2f}')
    b.close()
finally: srv.kill()
