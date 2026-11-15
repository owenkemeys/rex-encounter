# Render the scripted encounter (test/audio_scene.js) through the real Web Audio graph in headless Chrome, save
# out/scene_<tier>.wav, and print loudness per segment. usage: python3 test/audio_scene.py [high|low] [storm|day]
import sys, os, json, base64, subprocess, time, numpy as np
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from audio_analyze import loud, bands
tier = sys.argv[1] if len(sys.argv) > 1 else 'high'; mood = sys.argv[2] if len(sys.argv) > 2 else 'storm'; extra = sys.argv[3] if len(sys.argv) > 3 else ''      # e.g. ', noClips: 1' renders the pure-synthesis fallback
tag = os.environ.get('TAG', '')
root = '/home/claude/rex'; os.makedirs(f'{root}/out/at', exist_ok=True)
subprocess.run(['npx', 'esbuild', 'test/audio_scene.js', '--bundle', '--format=esm', '--outfile=out/at/scene.js'], cwd=root, check=True, capture_output=True)
subprocess.run(['rm', '-rf', f'{root}/out/at/audio']); subprocess.run(['cp', '-r', os.environ.get('AUDIO_DIR', f'{root}/dist/audio'), f'{root}/out/at/audio'], check=True)
open(f'{root}/out/at/index.html', 'w').write('<!doctype html><script type="module" src="scene.js"></script>')
srv = subprocess.Popen(['python3', '-m', 'http.server', '8766', '-d', f'{root}/out/at'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.7)
try:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(); logs = []; pg.on('console', lambda m: logs.append(m.text)); pg.on('pageerror', lambda e: logs.append('ERR ' + str(e)))
    pg.goto('http://localhost:8766/index.html'); pg.wait_for_function('window.__ready === true', timeout=30000)
    r = pg.evaluate(f'renderScene({{ tier: "{tier}", mood: "{mood}", rain: {0 if mood == "day" else 1} {extra} }})')
    print('\n'.join(logs[:10])); b.close()
finally: srv.kill()
pcm = np.frombuffer(base64.b64decode(r['b64']), dtype=np.int16).reshape(-1, 2); sr = r['sr']
from scipy.io import wavfile
path = f'{root}/out/scene_{tier}_{mood}{"_x" if extra else ""}{tag}.wav'; wavfile.write(path, sr, pcm)
x = pcm.astype(np.float64) / 32768
print('clips', r['clipState'], 'fails', r['clipFails'], '| ready (ms since start; 0=storm bed+steps, 1=every voice + first steps/foot/bird, 2=rest of first takes, 3=thunder, all=extra takes):', r['tReady'])
import collections
agg = collections.defaultdict(lambda: [0, 0]);
for k, ms in (r.get('genLog') or []): agg[k][0] += ms; agg[k][1] += 1
print('gen ms by key (total/takes):', ' '.join(f'{k}:{v[0]}/{v[1]}' for k, v in sorted(agg.items(), key=lambda kv: -kv[1][0])[:14]), '| sum', sum(v[0] for v in agg.values()))
json.dump({'genLog': r.get('genLog'), 'tReady': r['tReady']}, open(f'{root}/out/scene_genlog_{tier}{"_x" if extra else ""}.json', 'w'))
print('worker errors', r.get('genErr'))
print('bank', ' '.join(f'{k}:{v}' for k, v in r['bank'].items() if v.endswith('h') or k in ('roar','huff','growl')))
print(f"gen {r['genMs']:.0f} ms  frame avg {r['frameMsAvg']:.3f} ms max {r['frameMsMax']:.2f} ms  clipped samples {r['clip']}  voices left {r['voices']}")
print('marks', ' '.join(f'{t:.1f}:{k}' for t, k in r['marks']))
segs = [('storm bed, rex far', 1, 10), ('walk-in 70->8 m', 10, 30), ('roar @~20m', 26, 29.5), ('in shed, rex outside', 32.5, 45), ('roar heard from shed', 38, 41), ('feeding @10m + you', 46, 58)]
print(f"{'segment':26s} {'LUFS-I':>7s} {'ST-max':>7s} {'M-max':>7s} {'peak':>6s} | <60 60-250 .25-2k 2-6k 6k+ | centroid  L/R corr")
for name, a, bnd in segs:
  y = x[int(a * sr):int(bnd * sr)]; I, S, M = loud(y, sr); bb, c, _, _ = bands(y, sr)
  corr = np.corrcoef(y[:, 0], y[:, 1])[0, 1]
  print(f'{name:26s} {I:7.1f} {S:7.1f} {M:7.1f} {20*np.log10(np.abs(y).max()+1e-9):6.1f} | ' + ' '.join(f'{v*100:4.0f}' for v in bb) + f' | {c:7.0f}  {corr:5.2f}')
I, S, M = loud(x, sr); print(f"{'whole':26s} {I:7.1f} {S:7.1f} {M:7.1f}")
