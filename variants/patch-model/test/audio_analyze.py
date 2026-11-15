# Loudness and spectral analysis of WAVs: integrated / max short-term (3 s) / max momentary (400 ms) loudness in LUFS
# (ITU-R BS.1770 K-weighting), true-ish peak, DC, band balance, spectral centroid, and spectrogram sheets.
# usage: python3 test/audio_analyze.py <dir or wav...> [--png sheet.png] [--filter substr]
import sys, os, glob, numpy as np
from scipy.io import wavfile
from scipy import signal

def kweight(x, sr):
    # BS.1770 pre-filter (high shelf) + RLB high-pass, designed for any sample rate via bilinear of the analog prototypes
    f0, G, Q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    K = np.tan(np.pi * f0 / sr); Vh = 10 ** (G / 20); Vb = Vh ** 0.4996667741545416
    a0 = 1 + K / Q + K * K
    b = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0]
    a = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    y = signal.lfilter(b, a, x, axis=0)
    f0, Q = 38.13547087602444, 0.5003270373238773
    K = np.tan(np.pi * f0 / sr)
    a = [1, 2 * (K * K - 1) / (1 + K / Q + K * K), (1 - K / Q + K * K) / (1 + K / Q + K * K)]
    return signal.lfilter([1, -2, 1], a, y, axis=0)

def loud(x, sr):
    if x.ndim == 1: x = x[:, None]
    y = kweight(x, sr)
    def blocks(T, step):
        n, h = int(T * sr), int(step * sr); out = []
        for s in range(0, max(1, len(y) - n + 1), h):
            ms = np.mean(y[s:s + n] ** 2, axis=0).sum(); out.append(ms)
        return np.array(out)
    m = blocks(0.4, 0.1)
    lk = -0.691 + 10 * np.log10(m + 1e-12)
    g = m[lk > -70]
    if len(g) == 0: return -99, -99, -99
    rel = -0.691 + 10 * np.log10(g.mean()) - 10
    g2 = g[(-0.691 + 10 * np.log10(g)) > rel]
    I = -0.691 + 10 * np.log10(g2.mean())
    st = blocks(3, 0.5) if len(y) > 3 * sr else blocks(len(y) / sr, 1)
    return I, -0.691 + 10 * np.log10(st.max() + 1e-12), lk.max()

def read(p):
    sr, x = wavfile.read(p); x = x.astype(np.float64) / (32768 if x.dtype == np.int16 else 1)
    return sr, x

def bands(x, sr):
    m = x if x.ndim == 1 else x.mean(1)
    f, P = signal.welch(m, sr, nperseg=4096)
    tot = P.sum() + 1e-20
    edges = [(0, 60), (60, 250), (250, 2000), (2000, 6000), (6000, sr / 2)]
    b = [P[(f >= a) & (f < c)].sum() / tot for a, c in edges]
    cen = (f * P).sum() / tot
    # harsh resonance: the largest narrow peak over the smoothed spectrum, above 150 Hz
    Pd = 10 * np.log10(P + 1e-20); sm = np.convolve(Pd, np.ones(31) / 31, mode='same'); k = f > 150
    res = (Pd - sm)[k].max(); fres = f[k][np.argmax((Pd - sm)[k])]
    return b, cen, res, fres

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    png = sys.argv[sys.argv.index('--png') + 1] if '--png' in sys.argv else None
    flt = sys.argv[sys.argv.index('--filter') + 1] if '--filter' in sys.argv else None
    if png in args: args.remove(png)
    if flt in args: args.remove(flt)
    files = []
    for a in args: files += sorted(glob.glob(os.path.join(a, '*.wav'))) if os.path.isdir(a) else [a]
    if flt: files = [f for f in files if flt in f]
    print(f"{'file':28s} {'LUFS-I':>7s} {'ST-max':>7s} {'M-max':>7s} {'peak':>6s} {'dc':>8s} | <60  60-250 .25-2k 2-6k 6k+ | centroid  res(dB@Hz)")
    for p in files:
        sr, x = read(p); I, S, M = loud(x, sr); b, c, res, fr = bands(x, sr)
        pk = 20 * np.log10(np.abs(x).max() + 1e-12); dc = x.mean()
        print(f"{os.path.basename(p)[:28]:28s} {I:7.1f} {S:7.1f} {M:7.1f} {pk:6.1f} {dc:8.1e} | " + ' '.join(f'{v*100:4.0f}' for v in b) + f" | {c:7.0f}  {res:4.1f}@{fr:.0f}")
    if png:
        import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
        n = len(files); cols = 3 if n > 4 else n; rows = (n + cols - 1) // cols
        fig, axs = plt.subplots(rows, cols, figsize=(5.2 * cols, 2.6 * rows), squeeze=False)
        for ax, p in zip(axs.flat, files):
            sr, x = read(p); m = x if x.ndim == 1 else x.mean(1)
            f, t, S = signal.spectrogram(m, sr, nperseg=1024, noverlap=896)
            ax.pcolormesh(t, f, 10 * np.log10(S + 1e-14), shading='auto', vmin=10 * np.log10(S.max() + 1e-14) - 80, cmap='magma')
            ax.set_yscale('symlog', linthresh=200); ax.set_ylim(15, min(sr / 2, 12000)); ax.set_title(os.path.basename(p), fontsize=8)
            env = np.sqrt(np.convolve(m ** 2, np.ones(int(sr * 0.01)) / int(sr * 0.01), mode='same')); ax2 = ax.twinx(); ax2.plot(np.arange(len(m)) / sr, 20 * np.log10(env + 1e-6), 'c', lw=0.6); ax2.set_ylim(-70, 0)
        for ax in list(axs.flat)[n:]: ax.axis('off')
        plt.tight_layout(); plt.savefig(png, dpi=70)

if __name__ == '__main__': main()
