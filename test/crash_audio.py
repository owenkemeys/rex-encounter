# Render each crash sound alone (test/crash_audio.js) in headless Chrome and say what is in it: level, how much of it a phone
# speaker can carry (above 300 Hz), and how much it rings on one pitch (the "xylophone" check: share of the tail's energy in its
# strongest 1/12-octave band; noise is ~0.05-0.15, a clean tone > 0.5). usage: python3 test/crash_audio.py [outdir]
import sys, os, base64, subprocess, time, socket, numpy as np
from playwright.sync_api import sync_playwright
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/crash_audio'; os.makedirs(out, exist_ok=True)
subprocess.run(['npx', 'esbuild', 'test/crash_audio.js', '--bundle', '--format=esm', f'--outfile={out}/hit.js'], cwd=root, check=True, capture_output=True)
subprocess.run(['rm', '-rf', f'{out}/audio']); subprocess.run(['cp', '-r', f'{root}/dist/audio', f'{out}/audio'], check=True)
open(f'{out}/index.html', 'w').write('<!doctype html><script type="module" src="hit.js"></script>')
s = socket.socket(); s.bind(('127.0.0.1', 0)); PORT = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['python3', '-m', 'http.server', str(PORT), '-b', '127.0.0.1', '-d', out], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.7)
CASES = [(w, p, f) for w in ('containers', 'barn', 'gate') for (p, f) in (('snout', 7.5), ('torso', 2.3), ('snout', 1.0))]
def db(x): return 10 * np.log10(max(x, 1e-12))
try:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required']); pg = b.new_page()
    pg.on('pageerror', lambda e: print('PAGEERROR', e))
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_function('window.renderHit!==undefined', timeout=60000)
    print('where      part  force |  rms dB  peak | <150  150-300  300-1k  1k-4k  >4k (dB) | phone share | tone')
    for (w, part, f) in CASES:
      x = np.frombuffer(base64.b64decode(pg.evaluate('(o)=>window.renderHit(o)', {'where': w, 'part': part, 'force': f})), dtype=np.float32)[int(0.5 * 48000):int(1.7 * 48000)]
      X = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2; fr = np.fft.rfftfreq(len(x), 1 / 48000); tot = X.sum() or 1e-12
      bands = [X[(fr >= a) & (fr < c)].sum() for a, c in ((20, 150), (150, 300), (300, 1000), (1000, 4000), (4000, 24000))]
      tail = x[int(0.06 * 48000):int(0.7 * 48000)]; Tm = np.abs(np.fft.rfft(tail * np.hanning(len(tail)))) ** 2; ft = np.fft.rfftfreq(len(tail), 1 / 48000)
      edges = 40 * 2 ** (np.arange(0, 12 * 8) / 12); tb = np.array([Tm[(ft >= a) & (ft < a * 2 ** (1 / 12))].sum() for a in edges]); tone = tb.max() / (tb.sum() or 1e-12); tf = edges[tb.argmax()]
      print(f"{w:10s} {part:5s} {f:4.1f}  | {db(np.mean(x[:int(0.5*48000)]**2)):6.1f} {np.abs(x).max():5.2f} | " + ' '.join(f'{db(v / tot):6.1f}' for v in bands) + f" | {sum(bands[2:]) / tot:5.2f} | {tone:.2f} @ {tf:.0f} Hz")
      from scipy.io import wavfile; wavfile.write(f'{out}/{w}_{part}_{f}.wav', 48000, (np.clip(x, -1, 1) * 32767).astype(np.int16))
    b.close()
finally: srv.kill()
