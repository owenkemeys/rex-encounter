# Render the jaws-closing sound alone, old voice vs new, at 6 m, in headless Chrome and print what is in it: level, share above 300 Hz,
# tonality (as crash_audio.py), and a "wetness" proxy: share of the energy after the first 40 ms that sits in 100-400 Hz (a slow low
# smear is mud; a dry clack has little left there). usage: python3 test/bite_audio.py [outdir]   (writes /tmp/out/bite_*.wav)
import sys, os, base64, subprocess, time, socket, numpy as np
from playwright.sync_api import sync_playwright
from scipy.io import wavfile
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/bite_audio'; os.makedirs(out, exist_ok=True); os.makedirs('/tmp/out', exist_ok=True)
subprocess.run(['npx', 'esbuild', 'test/bite_audio.js', '--bundle', '--format=esm', f'--outfile={out}/bite.js'], cwd=root, check=True, capture_output=True)
subprocess.run(['rm', '-rf', f'{out}/audio']); subprocess.run(['cp', '-r', f'{root}/dist/audio', f'{out}/audio'], check=True)
open(f'{out}/index.html', 'w').write('<!doctype html><script type="module" src="bite.js"></script>')
s = socket.socket(); s.bind(('127.0.0.1', 0)); PORT = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['python3', '-m', 'http.server', str(PORT), '-b', '127.0.0.1', '-d', out], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.7)
SR = 48000
def db(x): return 10 * np.log10(max(x, 1e-12))
def stats(x):
  X = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2; fr = np.fft.rfftfreq(len(x), 1 / SR); tot = X.sum() or 1e-12
  tail = x[int(0.06 * SR):int(0.7 * SR)]; Tm = np.abs(np.fft.rfft(tail * np.hanning(len(tail)))) ** 2; ft = np.fft.rfftfreq(len(tail), 1 / SR)
  edges = 40 * 2 ** (np.arange(0, 12 * 8) / 12); tb = np.array([Tm[(ft >= a) & (ft < a * 2 ** (1 / 12))].sum() for a in edges]); tone = tb.max() / (tb.sum() or 1e-12)
  w = x[int(0.04 * SR):]; W = np.abs(np.fft.rfft(w)) ** 2; fw = np.fft.rfftfreq(len(w), 1 / SR); wet = W[(fw >= 100) & (fw < 400)].sum() / (W.sum() or 1e-12)
  ph = db(np.mean(x[:int(0.5 * SR)] ** 2)); return ph, np.abs(x).max(), X[fr >= 300].sum() / tot, tone, edges[tb.argmax()], wet
try:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required']); pg = b.new_page()
    pg.on('pageerror', lambda e: print('PAGEERROR', e)); pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_function('window.renderBite!==undefined', timeout=60000)
    res = {}
    print('voice  seed force | rms dB  peak | share>300  tone (Hz) | wet100-400 after 40ms')
    for name, old in (('old', True), ('new', False)):
      for seed, force in ((12345, 0.6), (777, 0.3), (4242, 1.0)):
        x = np.frombuffer(base64.b64decode(pg.evaluate('(o)=>window.renderBite(o)', {'old': old, 'seed': seed, 'force': force, 'dist': 6})), dtype=np.float32)[int(0.45 * SR):int(1.7 * SR)]
        r = stats(x); res[(name, seed)] = x
        print(f'{name:5s} {seed:5d} {force:4.1f} | {r[0]:6.1f} {r[1]:5.2f} | {r[2]:6.2f}  {r[3]:5.2f} ({r[4]:4.0f}) | {r[5]:5.2f}')
    w = lambda n, x: wavfile.write(n, SR, (np.clip(x, -1, 1) * 32767).astype(np.int16)); gap = np.zeros(int(0.7 * SR), np.float32)
    o, n = res[('old', 12345)], res[('new', 12345)]; w('/tmp/out/bite_before.wav', o); w('/tmp/out/bite_after.wav', n)
    w('/tmp/out/bite_old_old_new_new.wav', np.concatenate([o, gap, res[('old', 777)], gap, n, gap, res[('new', 777)]]))
    b.close()
finally: srv.kill()
