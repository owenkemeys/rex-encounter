# Before/after of two rendered scenes (out/scene_*.wav from audio_scene.py): per-segment loudness and band balance side by side,
# plus a figure of both spectrograms with the loudness envelope. usage: python3 test/audio_compare.py before.wav after.wav [out.png]
import sys, os, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from audio_analyze import loud, bands, read
from scipy import signal
a, b = sys.argv[1], sys.argv[2]; png = sys.argv[3] if len(sys.argv) > 3 else 'out/scene_compare.png'
segs = [('storm bed, rex far', 1, 10), ('walk-in 70->8 m', 10, 30), ('roar @~20m', 26, 29.5), ('in shed, rex outside', 32.5, 45), ('roar heard from shed', 38, 41), ('feeding @10m + you', 46, 58)]
W = {}
for tag, p in (('before', a), ('after', b)): sr, x = read(p); W[tag] = (sr, x)
print(f"{'segment':22s} {'':7s} {'LUFS-I':>7s} {'M-max':>7s} {'peak':>6s} | <60 60-250 .25-2k 2-6k 6k+ | centroid")
for name, s0, s1 in segs:
    for tag in W:
        sr, x = W[tag]; y = x[int(s0 * sr):int(s1 * sr)]; I, S, M = loud(y, sr); bb, c, _, _ = bands(y, sr)
        print(f'{name:22s} {tag:7s} {I:7.1f} {M:7.1f} {20*np.log10(np.abs(y).max()+1e-9):6.1f} | ' + ' '.join(f'{v*100:4.0f}' for v in bb) + f' | {c:6.0f}')
for tag in W: sr, x = W[tag]; print(tag, 'clipped samples (|x|>=0.9999):', int((np.abs(x) >= 0.9999).sum()), ' peak dBFS', round(20 * np.log10(np.abs(x).max()), 1))
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
fig, axs = plt.subplots(2, 1, figsize=(14, 6), sharex=True)
for ax, tag in zip(axs, W):
    sr, x = W[tag]; m = x.mean(1); f, t, S = signal.spectrogram(m, sr, nperseg=2048, noverlap=1536)
    ax.pcolormesh(t, f, 10 * np.log10(S + 1e-14), shading='auto', vmin=-130, vmax=-50, cmap='magma'); ax.set_yscale('symlog', linthresh=200); ax.set_ylim(20, 10000); ax.set_title(tag, fontsize=9)
    h = int(0.4 * sr); e = np.sqrt(np.convolve(m ** 2, np.ones(h) / h, 'same')); a2 = ax.twinx(); a2.plot(np.arange(len(m)) / sr, 20 * np.log10(e + 1e-6), 'c', lw=0.8); a2.set_ylim(-60, 0)
plt.tight_layout(); plt.savefig(png, dpi=70); print('wrote', png)
