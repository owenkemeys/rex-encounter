# Top-down map of the paddock: python3 test/map.py out/map.json out/map.png
import sys, json, numpy as np
from PIL import Image, ImageDraw, ImageFont
d = json.load(open(sys.argv[1])); out = sys.argv[2] if len(sys.argv) > 2 else 'out/map.png'
n, S, R = d['n'], d['S'], d['R']; K = 4                            # px per metre
H = np.array(d['H']).reshape(n, n); D = np.array(d['D']).reshape(n, n); C = np.array(d['C']).reshape(n, n); W = np.array(d['W']).reshape(n, n); Sf = np.array(d['Sf']).reshape(n, n)
gy, gx = np.gradient(H, S)
# hillshade, light from the north-west
L = np.array([-0.6, 0.7, 0.6]); nrm = np.dstack([-gx, np.ones_like(H), gy]); nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
shade = np.clip(nrm @ (L / np.linalg.norm(L)), 0, 1)
h = (H - H.min()) / (np.ptp(H) + 1e-9)
base = np.dstack([0.42 + 0.35 * h, 0.5 + 0.25 * h, 0.3 + 0.2 * h])
slope = np.hypot(gx, gy)
rock = np.clip((slope - 0.62) / 0.6, 0, 1)[..., None]
base = base * (1 - rock) + np.array([0.55, 0.5, 0.47]) * rock
img = base * (0.35 + 0.75 * shade[..., None])
img = np.where((Sf == 5)[..., None], img * np.array([0.75, 0.9, 0.7]), img)          # forest floor
img = np.where((Sf == 6)[..., None], img * 0.7 + np.array([0.6, 0.5, 0.35]) * 0.3, img)      # track
img = np.where((Sf == 1)[..., None], np.array([0.25, 0.18, 0.1]), img)
gr = (W > 1.4)[..., None] * C[..., None]; img = img * (1 - 0.55 * gr) + np.array([0.85, 0.78, 0.4]) * 0.55 * gr     # tall grass and reeds
fe = (W <= 1.4)[..., None] * (W > 0)[..., None] * C[..., None]; img = img * (1 - 0.5 * fe) + np.array([0.15, 0.4, 0.12]) * 0.5 * fe
wa = np.clip(D / 0.8, 0, 1)[..., None] * (D > 0.02)[..., None]; img = img * (1 - 0.3 - 0.6 * wa) + np.array([0.15, 0.35, 0.6]) * (0.3 + 0.6 * wa) * (D > 0.02)[..., None] + img * (0.3 + 0.6 * wa) * (D <= 0.02)[..., None]
# contour lines every 1 m
cont = (np.floor(H) != np.floor(np.roll(H, 1, 0))) | (np.floor(H) != np.floor(np.roll(H, 1, 1)))
img[cont] *= 0.8
im = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).resize((n * K // 2, n * K // 2), Image.BILINEAR)
W2 = im.size[0]; P = lambda x, z: ((x + R) * K, (R - z) * K)
dr = ImageDraw.Draw(im, 'RGBA')
# nav: blocked cells hatched red, open but cut off from the main region magenta
nv = d['nav']; nn = nv['n']
for j in range(nn):
    for i in range(nn):
        v = nv['v'][i + nn * j]
        x0, z0 = -nv['R'] + i * 2, -nv['R'] + j * 2
        if x0 * x0 + z0 * z0 > (d['arena'] + 12) ** 2: continue
        if v == -1: dr.rectangle([*P(x0, z0 + 2), *P(x0 + 2, z0)], fill=(200, 30, 30, 38))
        elif v == 0: dr.rectangle([*P(x0, z0 + 2), *P(x0 + 2, z0)], fill=(230, 0, 230, 90))
for x, z, r, k in d['obstacles']:
    if k == 'tree': dr.ellipse([*P(x - r, z + r), *P(x + r, z - r)], fill=(20, 60, 20, 255)); dr.ellipse([*P(x - 3.5, z + 3.5), *P(x + 3.5, z - 3.5)], outline=(20, 70, 20, 120))
    elif k == 'rock': dr.ellipse([*P(x - r, z + r), *P(x + r, z - r)], outline=(60, 55, 50, 200))
for x, z, r in d['colliders']: dr.ellipse([*P(x - r, z + r), *P(x + r, z - r)], fill=(120, 115, 105, 255), outline=(40, 40, 40, 255))
for x, z, cx, cz, hf, r, br in d['logs']: dr.line([*P(x - cx * hf, z - cz * hf), *P(x + cx * hf, z + cz * hf)], fill=(230, 140, 30, 255) if br else (110, 70, 35, 255), width=max(2, int(2 * r * K)))
for s in d['structures']:
    for w in s['walls']: dr.line([*P(w['ax'], w['az']), *P(w['bx'], w['bz'])], fill=(20, 20, 20, 255), width=max(2, int(w['t'] * K)))
r0 = d['arena']; dr.ellipse([*P(-r0, r0), *P(r0, -r0)], outline=(255, 255, 255, 90)); r1 = r0 + 13; dr.ellipse([*P(-r1, r1), *P(r1, -r1)], outline=(30, 30, 30, 200), width=2)
try: f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 15)
except Exception: f = ImageFont.load_default()
for m in d['landmarks']:
    x, y = P(m['x'], m['z']); dr.text((x + 1, y + 1), m['name'], fill=(0, 0, 0, 200), font=f, anchor='mm'); dr.text((x, y), m['name'], fill=(255, 255, 240, 255), font=f, anchor='mm')
for i in range(-100, 101, 20):
    dr.text(P(i, -R + 2), str(i), fill=(255, 255, 255, 160), font=f); dr.text(P(-R + 1, i), str(i), fill=(255, 255, 255, 160), font=f)
dr.text((10, 10), f"seed {d['seed']}  red: blocked for the animal  magenta: open but cut off  N up", fill=(255, 255, 255, 255), font=f)
im.save(out); print('saved', out, im.size)
