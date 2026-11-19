# Render the death card's PA chime and a saved clip's tape load (test/pa_audio.js) in headless Chrome: level, and the pitch of each bong
# (the third must sag and wobble); the tape load must be the recording (dist/audio/tape_load.mp3). Also: silent with sound off, one chime when called twice, cut by start over;
# in a clip: the first bong 0.5 s after it is asked for, under the limiter with the tape load on top.
# usage: python3 test/pa_audio.py [outdir]   (writes pa_chime.wav, tape_load.wav)
SR = 48000
import sys, os, base64, subprocess, time, socket, numpy as np
from playwright.sync_api import sync_playwright
import wave
def wav(path, x):
  w = wave.open(path, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes()); w.close()
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/pa_audio'; os.makedirs(out, exist_ok=True)
subprocess.run(['npx', 'esbuild', 'test/pa_audio.js', '--bundle', '--format=esm', f'--outfile={out}/pa.js'], cwd=root, check=True, capture_output=True)
os.makedirs(f'{out}/nothere', exist_ok=True); import shutil; shutil.copy(f'{root}/dist/audio/tape_load.mp3', f'{out}/nothere/tape_load.mp3')      # the tape recording only (no manifest: the voices stay synthesised)
open(f'{out}/index.html', 'w').write('<!doctype html><script type="module" src="pa.js"></script>')
s = socket.socket(); s.bind(('127.0.0.1', 0)); PORT = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['python3', '-m', 'http.server', str(PORT), '-b', '127.0.0.1', '-d', out], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.7)
def db(x): return 20 * np.log10(max(x, 1e-9))
def rms(x): return float(np.sqrt(np.mean(x ** 2))) if len(x) else 0
def pitch(x, lo, hi):      # strongest FFT peak in [lo, hi] Hz, 40 ms frames
  w = int(0.04 * SR); f = np.fft.rfftfreq(w * 4, 1 / SR); band = (f >= lo) & (f <= hi); r = []
  for i in range(0, len(x) - w, w // 2):
    seg = x[i:i + w]; X = np.abs(np.fft.rfft(seg * np.hanning(w), w * 4)); r.append((i / SR, f[band][X[band].argmax()] if rms(seg) > 1e-3 else None, db(rms(seg))))
  return r
fail = 0
try:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required']); pg = b.new_page()
    pg.on('pageerror', lambda e: print('PAGEERROR', e))
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'); pg.wait_for_function('window.renderPA!==undefined', timeout=60000)
    R = lambda **o: np.frombuffer(base64.b64decode(pg.evaluate('(o)=>window.renderPA(o)', o)), dtype=np.float32).copy()
    c = R(what='chime'); t = R(what='tape')
    wav(f'{out}/pa_chime.wav', c); wav(f'{out}/tape_load.wav', t)
    print(f'chime: peak {db(np.abs(c).max()):.1f} dBFS, rms over 0.2-3.2 s {db(rms(c[int(0.2*SR):int(3.2*SR)])):.1f} dBFS')
    for k, (a, z, lo, hi) in enumerate([(0.25, 0.85, 400, 600), (0.85, 1.45, 560, 760), (1.45, 3.4, 150, 900)]):
      tr = [(round(tt + a, 2), round(fq), round(L)) for tt, fq, L in pitch(c[int(a * SR):int(z * SR)], lo, hi) if fq]
      fs = [fq for _, fq, _ in tr]; print(f'  bong {k + 1}: {min(fs) if fs else "-"}-{max(fs) if fs else "-"} Hz over {len(fs)} frames'); 
      if k == 2: print('   ', ' '.join(f'{tt}:{fq}' for tt, fq, _ in tr[::2]))
    print(f'tape: peak {db(np.abs(t).max()):.1f} dBFS, rms 0.2-0.9 s {db(rms(t[int(0.2*SR):int(0.9*SR)])):.1f} dBFS, sound until {np.nonzero(np.abs(t) > 1e-3)[0][-1] / SR if np.abs(t).max() > 1e-3 else 0:.2f} s')
    ref = np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', f'{root}/dist/audio/tape_load.mp3', '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True, check=True).stdout, dtype=np.float32)
    seg = t[int(0.2 * SR):int(0.2 * SR) + len(ref) + int(0.1 * SR)]; xc = np.correlate(seg, ref[:int(0.5 * SR)], 'valid'); lag = int(np.argmax(np.abs(xc)))
    a = seg[lag:lag + int(0.5 * SR)]; r0 = ref[:len(a)]; corr = float(np.dot(a, r0) / (np.linalg.norm(a) * np.linalg.norm(r0) + 1e-12))
    print(f'tape vs tape_load.mp3: correlation {corr:.2f} at {0.2 + lag / SR:.3f} s'); fail |= corr < 0.8
    off = R(what='chime', off=True); print(f'sound off: peak {db(np.abs(off).max()):.1f} dBFS'); fail |= np.abs(off).max() > 1e-4
    two = R(what='chime', twice=True); print(f'called twice: peak {db(np.abs(two).max()):.1f} dBFS (once: {db(np.abs(c).max()):.1f})'); fail |= np.abs(two).max() > np.abs(c).max() * 1.05
    cut = R(what='chime', stopAt=0.9); print(f'start over at 0.9 s: rms after 1.0 s {db(rms(cut[int(1.0*SR):])):.1f} dBFS'); fail |= rms(cut[int(1.0 * SR):]) > 1e-4
    fail |= np.abs(c).max() < 0.01 or np.abs(t).max() < 0.01
    k = R(what='clip'); on = np.nonzero(np.abs(k) > 0.01)[0]; at = on[0] / SR - 0.2 if len(on) else -1
    print(f'chime in a clip: first bong {at:.3f} s after asked, peak {db(np.abs(k).max()):.1f} dBFS'); fail |= abs(at - 0.5) > 0.02 or np.abs(k).max() < 0.05
    bt = R(what='both'); print(f'chime with the tape load: peak {db(np.abs(bt).max()):.1f} dBFS'); fail |= np.abs(bt).max() > 0.99
    b.close()
finally: srv.kill()
print('FAIL' if fail else 'ok'); sys.exit(1 if fail else 0)
