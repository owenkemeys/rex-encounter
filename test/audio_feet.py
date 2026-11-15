# Render test/audio_feet.js in headless Chrome and print per segment: peak, loudest-400 ms RMS (dBFS, as HUFF.md), momentary LUFS
# max, band shares, and how alike the steps of a segment are (spread of per-step RMS and spectral centroid).
# usage: python3 test/audio_feet.py [tag] [rain 0|1] [root]
import sys, os, base64, subprocess, time, json, numpy as np
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from audio_analyze import loud, bands
tag = sys.argv[1] if len(sys.argv) > 1 else 'now'; rain = int(sys.argv[2]) if len(sys.argv) > 2 else 0
root = sys.argv[3] if len(sys.argv) > 3 else '/home/claude/rex'; od = '/home/claude/rex/out/audio/feet'; os.makedirs(od, exist_ok=True)
w = f'/tmp/feet_{tag}'; os.makedirs(w, exist_ok=True)
subprocess.run(['npx', 'esbuild', f'{root}/test/audio_feet.js', '--bundle', '--format=esm', f'--outfile={w}/feet.js'], cwd='/home/claude/rex', check=True, capture_output=True)
subprocess.run(['rm', '-rf', f'{w}/audio']); subprocess.run(['cp', '-r', '/home/claude/rex/dist/audio', f'{w}/audio'], check=True)
open(f'{w}/index.html', 'w').write('<!doctype html><script type="module" src="feet.js"></script>')
srv = subprocess.Popen(['python3', '-m', 'http.server', '8767', '-d', w], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.7)
try:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(); logs = []; pg.on('console', lambda m: logs.append(m.text)); pg.on('pageerror', lambda e: logs.append('ERR ' + str(e)))
    pg.goto('http://localhost:8767/index.html'); pg.wait_for_function('window.__ready === true', timeout=30000)
    r = pg.evaluate(f'renderFeet({{ rain: {rain}, mood: "{"storm" if rain else "day"}" }})', )
    if logs: print('\n'.join(logs[:10]))
    b.close()
finally: srv.kill()
pcm = np.frombuffer(base64.b64decode(r['b64']), dtype=np.int16).reshape(-1, 2); sr = r['sr']; x = pcm.astype(np.float64) / 32768
from scipy.io import wavfile
from scipy.signal import butter, sosfilt
HP = butter(4, 100, 'highpass', fs=48000, output='sos'); HP2 = butter(4, 250, 'highpass', fs=48000, output='sos')
wavfile.write(f'{od}/feet_{tag}_r{rain}.wav', sr, pcm)
print('clips', r['clipState'])
calls = r['calls']
print(f"{'segment':18s} {'peak':>6s} {'rms400':>7s} {'M-max':>6s} {'hp100':>6s} {'hp250':>6s} | <60 60-250 .25-2k 2-6k 6k+ | centroid | per-step rms spread dB, centroid spread Hz")
rows = {}
for s in r['segs']:
  y = x[int(s['a'] * sr):int(s['b'] * sr)]; m = y.mean(axis=1)
  win = int(0.4 * sr); e = np.convolve(m * m, np.ones(win) / win, 'valid'); r4 = 10 * np.log10(e.max() + 1e-12)
  mh = sosfilt(HP, m); eh = np.convolve(mh * mh, np.ones(win) / win, 'valid'); r4h = 10 * np.log10(eh.max() + 1e-12)
  m2 = sosfilt(HP2, m); e2 = np.convolve(m2 * m2, np.ones(win) / win, 'valid'); r42 = 10 * np.log10(e2.max() + 1e-12)
  I, S, M = loud(y, sr); bb, c, _, _ = bands(y, sr)
  ts = [cl[0] - s['a'] for cl in calls if s['a'] <= cl[0] < s['b']]; pr, pc = [], []
  for i, t in enumerate(ts):
    z = m[int(t * sr):int((t + 0.3) * sr)]
    if len(z) < 100: continue
    pr.append(10 * np.log10((z * z).mean() + 1e-12)); F = np.abs(np.fft.rfft(z * np.hanning(len(z)))); f = np.fft.rfftfreq(len(z), 1 / sr); pc.append((F * f).sum() / (F.sum() + 1e-12))
  rows[s['name']] = dict(peak=20 * np.log10(np.abs(y).max() + 1e-9), rms400=r4, hp100=r4h, hp250=r42, M=M, bands=[float(v) for v in bb], centroid=float(c))
  print(f"{s['name']:18s} {rows[s['name']]['peak']:6.1f} {r4:7.1f} {M:6.1f} {r4h:6.1f} {r42:6.1f} | " + ' '.join(f'{v*100:4.0f}' for v in bb) + f" | {c:7.0f} | {np.ptp(pr) if pr else 0:4.1f} {np.ptp(pc) if pc else 0:6.0f}")
json.dump(rows, open(f'{od}/feet_{tag}_r{rain}.json', 'w'), indent=1)
