# Quick software render of the dumped head (test/headdump.mjs): views x jaw angle, lambert + rim, teeth as dots.
import json, sys, numpy as np
from PIL import Image
d = json.load(open(sys.argv[1])); out = sys.argv[2]
P = np.array(d['P']).reshape(-1, 3); W = np.array(d['W']).reshape(-1, 2); F = np.array(d['F']).reshape(-1, 3); Tg = np.array(d['T'])
HX, HY, HZ = 0, -0.34, -0.2
def jaw(P, a, w):
    q = P - [HX, HY, HZ]; c, s = np.cos(a), np.sin(a)
    y = q[:, 1] * c - q[:, 2] * s; z = q[:, 1] * s + q[:, 2] * c
    r = np.stack([q[:, 0], y, z], 1) + [HX, HY, HZ]
    return P + (r - P) * w[:, None]
def view(Pw, yaw, pitch, S=360, scale=105, cen=(0, -0.15, 0.6), teeth=None, ja=0):
    cy, sy, cp, sp = np.cos(yaw), np.sin(yaw), np.cos(pitch), np.sin(pitch)
    q = Pw - cen
    x = q[:, 0] * cy - q[:, 2] * sy; z = q[:, 0] * sy + q[:, 2] * cy; y = q[:, 1]
    y2 = y * cp - z * sp; z2 = y * sp + z * cp
    sx = S / 2 + x * scale; syy = S / 2 - y2 * scale
    img = np.full((S, S), 0.15); zb = np.full((S, S), -1e9)
    v0, v1, v2 = F[:, 0], F[:, 1], F[:, 2]
    e1 = np.stack([x[v1] - x[v0], y2[v1] - y2[v0], z2[v1] - z2[v0]], 1); e2 = np.stack([x[v2] - x[v0], y2[v2] - y2[v0], z2[v2] - z2[v0]], 1)
    n = np.cross(e1, e2); n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
    L = np.array([0.4, 0.7, 0.6]); L /= np.linalg.norm(L)
    sh = 0.15 + 0.75 * np.clip(n @ L, 0, 1) + 0.25 * (1 - np.abs(n[:, 2])) ** 3
    tg = Tg[v0]
    for t in range(len(F)):
        if n[t, 2] <= 0: continue
        a, b, c = v0[t], v1[t], v2[t]
        xs = np.array([sx[a], sx[b], sx[c]]); ys = np.array([syy[a], syy[b], syy[c]])
        x0, x1 = int(max(0, np.floor(xs.min()))), int(min(S - 1, np.ceil(xs.max()))); y0, y1 = int(max(0, np.floor(ys.min()))), int(min(S - 1, np.ceil(ys.max())))
        if x1 < x0 or y1 < y0: continue
        X, Y = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        den = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
        if abs(den) < 1e-9: continue
        l0 = ((ys[1] - ys[2]) * (X - xs[2]) + (xs[2] - xs[1]) * (Y - ys[2])) / den; l1 = ((ys[2] - ys[0]) * (X - xs[2]) + (xs[0] - xs[2]) * (Y - ys[2])) / den; l2 = 1 - l0 - l1
        m = (l0 >= -1e-3) & (l1 >= -1e-3) & (l2 >= -1e-3)
        zz = l0 * z2[a] + l1 * z2[b] + l2 * z2[c]
        sub = zb[y0:y1 + 1, x0:x1 + 1]; upd = m & (zz > sub)
        sub[upd] = zz[upd]; img[y0:y1 + 1, x0:x1 + 1][upd] = sh[t] * (0.75 if tg[t] == 2 else 1)
    rgb = np.stack([img] * 3, 2)
    if teeth:
        for row, isjaw in ((teeth.get('upper', []), 0), (teeth.get('lower', []), 1)):
            for T in row:
                p = np.array(T[:3], float)[None]
                if isjaw: p = jaw(p, ja, np.ones(1))
                q = p[0] - cen; xx = q[0] * cy - q[2] * sy; zz = q[0] * sy + q[2] * cy; yy = q[1]
                y2_ = yy * cp - zz * sp; z2_ = yy * sp + zz * cp
                px, py = int(S / 2 + xx * scale), int(S / 2 - y2_ * scale)
                if 0 <= px < S and 0 <= py < S:
                    col = [1, 0.9, 0.3] if not isjaw else [0.3, 0.9, 1]
                    vis = z2_ > zb[py, px] - 0.08
                    rgb[max(0, py - 1):py + 2, max(0, px - 1):px + 2] = col if vis else [0.6, 0.3, 0.3]
    return (np.clip(rgb, 0, 1) * 255).astype(np.uint8)
ims = []
for ja in (0.0, 0.6):
    Pw = jaw(P, ja, W[:, 0])
    for yaw, pitch in ((0, -0.3), (0.8, -0.15), (np.pi / 2, 0.0), (0, 1.45)):
        ims.append(view(Pw, yaw, pitch, teeth=d.get('teeth'), ja=ja))
S = ims[0].shape[0]; m = np.zeros((S * 2, S * 4, 3), np.uint8)
for i, im in enumerate(ims): m[(i // 4) * S:(i // 4 + 1) * S, (i % 4) * S:(i % 4 + 1) * S] = im
Image.fromarray(m).save(out)
# jaw-tip check: vertices in front of z=1.4 below the mouth line should ride the jaw
z = P[:, 2]; y = P[:, 1]
mouth = -0.13 - 0.17 * (1 - np.clip(z / 1.25, 0, 1) ** 2 * (3 - 2 * np.clip(z / 1.25, 0, 1))) - 0.04 * np.exp(-((z - 0.95) / 0.34) ** 2) + 0.014 * np.exp(-((z - 1.5) / 0.1) ** 2)
sel = (z > 1.3) & (y < mouth - 0.05)
print('jaw-tip verts', sel.sum(), 'mean jaw weight', W[sel, 0].mean() if sel.sum() else None, 'min', W[sel, 0].min() if sel.sum() else None)
