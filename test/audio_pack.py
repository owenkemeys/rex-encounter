# Build dist/audio/*.mp3 + manifest.json from the downloaded source recordings (cut, mono, 32 kHz, high-passed, normalised, mp3).
# usage: python3 test/audio_pack.py <srcdir> [clip-name-prefix]   (the prefix limits the run, and the manifest keeps the other entries)      (downloads anything missing into srcdir first; needs ffmpeg with libmp3lame)
# The table below is the single record of where every clip comes from and which part of the source it is; dist/audio/CREDITS.md
# lists the same with licences. Each source's licence was read from the page it is served from (OpenGameArt page, Wikimedia Commons file page).
import sys, os, io, json, subprocess, urllib.request, urllib.parse, time, numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); out = f'{root}/dist/audio'; SR = 32000
src = sys.argv[1] if len(sys.argv) > 1 else '/tmp/audio_src'; os.makedirs(src, exist_ok=True); os.makedirs(out, exist_ok=True)
OGA = 'https://opengameart.org/sites/default/files/'
IA = 'https://archive.org/download/'
CM = lambda t: 'https://commons.wikimedia.org/wiki/Special:FilePath/' + urllib.parse.quote(t.replace(' ', '_'))
# id -> (url, member inside a zip or None)
SRC = {
  'lion':     (CM('Lion raring-sound1TamilNadu178.ogg'), None),
  'eleph':    (CM('Elephant voice - trumpeting.ogg'), None),
  'alli':     (CM('Alligatorbellow1.ogg'), None),
  'allihiss': (CM('Alligatorhiss.ogg'), None),
  'lionw':    (CM('Lionroar.wav'), None),
  'bear':     (OGA + 'bear.zip', 'ogg/bear_02.ogg'),
  'gorilla':  (OGA + 'gorilla.zip', 'ogg/gorilla_roar.ogg'),
  'camel':    (OGA + 'camel.zip', 'ogg/camel_01.ogg'),
  'camel2':   (OGA + 'camel.zip', 'ogg/camel_02.ogg'),
  'jaguar':   (OGA + 'jaguar_saw.zip', 'jaguar_saw.ogg'),
  'dog':      (OGA + 'dog-frieda-grunt-96khz-01.flac', None),
  'c1':       (OGA + '80-CC0-creature-SFX_0.zip', None), 'c2': (OGA + '80-CC0-creature-sfx-2.zip', None),
  'mroar':    (OGA + 'monster_roar.wav', None),
  'deep':     (OGA + 'deep_breaks.zip', None),
  'hey':      (OGA + 'hey_aggressive_mujtaba.wav', None),
  'whistles': (OGA + 'whistles.zip', None),
  # mouth sounds: wet impacts, crunches, meat, squelches, eating (all CC0)
  'wetimp':   (OGA + 'independent_nu_ljudbank-wet_squish_slurp_impacts.7z', None),
  'crimp':    (OGA + 'independent_nu_ljudbank-break_crunch_impact.7z', None),
  'tito':     (OGA + 'crunch_-_tito.zip', None),
  'meat':     (OGA + 'rippingintomeat.mp3', None),
  'feast':    (OGA + 'messyeaters.mp3', None),
  'squish':   (OGA + 'squish_0%d.mp3', None),     # six files, squish_01_0 .. squish_06 (see fetch)
  'mud':      (OGA + '25-CC0-mud-sfx.zip', None),
  # breath: real exhales for the huff/snort (Red Library, USC Cinema sound effects collection, CC0 on archive.org; see CREDITS.md)
  'rl_hsnort': (IA + 'Red_Library_Animals_Horses_1/R13-04-Horse%20Snort.flac', None),
  'rl_hblow':  (IA + 'Red_Library_Animals_Horses_1/R12-57-Horses%20Snorting.flac', None),
  'rl_hloud':  (IA + 'Red_Library_Animals_Horses_2/R13-48-Horse%20Slow%20Approach%20and%20Loud%20Snort.flac', None),
  'rl_hvoc':   (IA + 'Red_Library_Animals_Horses_1/R12-60-Horses%20Snort%20and%20Vocalize.flac', None),
  'rl_hbr':    (IA + 'Red_Library_Animals_Horses_4/R23-49-Horse%20Breathing.flac', None),
  'rl_eleph':  (IA + 'Red_Library_Animals_Misc/R01-33-Elephant%20Snort.flac', None),
  # sniffing: short nasal breaths of a horse (CC0) and three human nose sniffs (OpenGameArt, CC BY 3.0, spookymodem)
  'sniffoga':  (OGA + 'Sniffing.wav', None),
}
# name: (source id, member or None, start s, end s)   (end None = to the end)
CLIPS = {
  'lion_a': ('lion', None, 0.40, 2.30), 'lion_b': ('lion', None, 4.80, 6.60), 'lion_c': ('lion', None, 7.55, 9.0),
  'eleph_trumpet': ('eleph', None, 0.12, None),
  'alli_bell_1': ('alli', None, 1.55, 4.10), 'alli_bell_2': ('alli', None, 7.90, 11.0), 'alli_bell_3': ('alli', None, 14.15, 17.2),
  'alli_hiss': ('allihiss', None, 1.0, 4.4),
  'lgrunt_1': ('lionw', None, 14.6, 19.9),
  'bear_1': ('bear', None, 0, None),
  'gorilla_roar': ('gorilla', None, 0.02, 1.3),
  'camel_1': ('camel', None, 0.08, 3.3), 'camel_2': ('camel2', None, 0.3, 4.6),
  'jaguar_saw': ('jaguar', None, 0.0, None),
  'dog_grunt': ('dog', None, 0, None),
  'creat_roar_02': ('c1', 'roar_02.ogg', 0, None), 'creat_roar_05': ('c2', 'roar_05.ogg', 0, None),
  'creat_grunt_01': ('c1', 'grunt_01.ogg', 0, None), 'creat_grunt_04': ('c1', 'grunt_04.ogg', 0, None),
  'creat_nose': ('c1', 'nose.ogg', 0, None), 'creat_breath': ('c1', 'breath.ogg', 0, None), 'creat_breath_2': ('c2', 'breath_02.ogg', 0, None),
  'monster_roar': ('mroar', None, 0, None),
}
CLIPS['hey_1'] = ('hey', None, 0, None)
for i in (3, 4, 5, 6, 8): CLIPS[f'wetimp_{i}'] = ('wetimp', f'impsplat/impactsplat0{i}.mp3.flac', 0, None)
for i in (1, 3, 4, 5): CLIPS[f'crimp_{i}'] = ('crimp', f'impcrunch/impactcrunch0{i}.mp3.flac', 0, None)
for i in (1, 2, 3, 4, 5, 6, 7): CLIPS[f'eatcr_{i}'] = ('tito', f'crunch.{i}.ogg', 0, None)
for i, a in enumerate((2.8, 14.75, 19.1, 23.4, 26.8), 1): CLIPS[f'meat_rip_{i}'] = ('meat', None, a, a + 1.05)
for i, a in enumerate((2.65, 8.2, 10.7, 12.9), 1): CLIPS[f'chew_{i}'] = ('feast', None, a, a + 1.1)
for i, n in enumerate(['squish_01_0.mp3'] + [f'squish_0{k}.mp3' for k in range(2, 7)], 1): CLIPS[f'squish_{i}'] = ('squish', n, 0, None)
for i in (2, 5, 8, 11, 14, 17): CLIPS[f'mud_{i}'] = ('mud', f'mud_{i:02d}.ogg', 0, None)
for i in (1, 2, 3, 4): CLIPS[f'whistle_{i}'] = ('whistles', f'whistle_{i}.wav', 0, None)
# exhales (cut points = the whole breath, from just before it starts to just after it dies; found with out/audio/huff/events.py)
# (several of these library files repeat one breath; the cuts below are distinct takes, checked by cross-correlation; no hsnort_3:
#  the take at R12-60 3.15 s has a click in it)
CLIPS['hsnort_1'] = ('rl_hsnort', None, 0.86, 1.93); CLIPS['hsnort_2'] = ('rl_hvoc', None, 1.96, 2.71)
CLIPS['hsnort_4'] = ('rl_hloud', None, 9.42, 10.48)
for i, (a, b) in enumerate(((0.58, 1.29), (13.58, 14.35), (4.79, 5.39)), 1): CLIPS[f'hblow_{i}'] = ('rl_hblow', None, a, b)
CLIPS['hblow_4'] = ('rl_hbr', None, 4.37, 5.03)
for i, (a, b) in enumerate(((0.90, 1.49), (1.68, 2.27)), 1): CLIPS[f'elblow_{i}'] = ('rl_eleph', None, a, b)
# sniff: distinct short breaths from R23-49 (not a loop: pairwise xcorr < 0.25), and the three sniffs of the OpenGameArt take
for i, (a, b) in enumerate(((8.01, 8.46), (9.72, 10.23), (11.43, 11.88), (13.25, 13.69), (15.20, 15.71), (17.88, 18.23), (19.15, 19.55), (24.13, 24.60)), 1): CLIPS[f'sniffb_{i}'] = ('rl_hbr', None, a, b)
for i, (a, b) in enumerate(((0.17, 0.74), (0.75, 0.99), (1.19, 1.45)), 1): CLIPS[f'sniffh_{i}'] = ('sniffoga', None, a, b)
for i in (1, 2, 3, 4, 6, 8): CLIPS[f'bone_{i}'] = ('deep', f'Deep Break {i}.wav', 0, 0.55)

def fetch(sid):
  if sid == 'squish':
    for i, n in enumerate(['squish_01_0.mp3'] + [f'squish_0{k}.mp3' for k in range(2, 7)], 1):
      fn = f'{src}/{n}'
      if not os.path.exists(fn): open(fn, 'wb').write(urllib.request.urlopen(urllib.request.Request(OGA + n, headers={'User-Agent': 'Mozilla/5.0 audio-pack'}), timeout=90).read())
    return src
  url, member = SRC[sid]; fn = f'{src}/{os.path.basename(urllib.parse.urlparse(url).path)}'
  if not os.path.exists(fn):
    for k in range(6):
      try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 audio-pack'}); open(fn, 'wb').write(urllib.request.urlopen(req, timeout=90).read()); break
      except Exception as e: print('retry', sid, e); time.sleep(15 * (k + 1))
    time.sleep(2)
  if fn.endswith('.7z'):
    d = fn[:-3]
    if not os.path.isdir(d): import py7zr; py7zr.SevenZipFile(fn).extractall(d)
    return d
  if fn.endswith('.zip'):
    d = fn[:-4]
    if not os.path.isdir(d): subprocess.run(['unzip', '-oq', fn, '-d', d], check=True)
    if sid in ('c1', 'c2', 'deep', 'whistles', 'tito', 'mud'): return d
    return f'{d}/{member}'
  return fn
def load(p):
  r = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True)
  return np.frombuffer(r.stdout, dtype=np.float32).astype(np.float64)
only = sys.argv[2] if len(sys.argv) > 2 else ''
man = json.load(open(f'{out}/manifest.json'))['clips'] if only and os.path.exists(f'{out}/manifest.json') else {}; total = 0
for name, (sid, member, a, b) in CLIPS.items():
  if not name.startswith(only): continue
  p = fetch(sid); p = f'{p}/{member}' if member and os.path.isdir(p) else p
  x = load(p); x = x[int(a * SR): int(b * SR) if b else None]
  x = sosfilt(butter(2, 32, 'high', fs=SR, output='sos'), x)
  n = len(x); fi, fo = int(0.004 * SR), int(0.03 * SR); w = np.ones(n); w[:fi] = np.linspace(0, 1, fi); w[-fo:] = np.linspace(1, 0, fo); x = x * w
  x = x / (np.abs(x).max() + 1e-9) * 0.89
  tmp = f'{src}/_t.wav'; wavfile.write(tmp, SR, (x * 32767).astype(np.int16))
  f = f'{name}.mp3'; subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-ac', '1', '-ar', str(SR), '-c:a', 'libmp3lame', '-b:a', '96k', f'{out}/{f}'], check=True)
  sz = os.path.getsize(f'{out}/{f}'); total += sz; man[name] = {'f': f, 'dur': round(n / SR, 3), 'src': sid}
  print(f'{name:16s} {n / SR:5.2f}s {sz / 1024:6.1f} KB')
json.dump({'v': 1, 'sr': SR, 'clips': man}, open(f'{out}/manifest.json', 'w'), indent=1)
print(f'total {total / 1024:.0f} KB in {len(man)} clips')
