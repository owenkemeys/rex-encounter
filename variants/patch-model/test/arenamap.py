# Top-down map of the arena (north up, 4 px/m): ground shaded by height, water, red where the animal cannot stand (nav), grey
# where it could stand but cannot get to; every placed thing as drawn; doors; openings; reach points (red: its jaws reach you there).
import sys, json, math
from PIL import Image, ImageDraw, ImageFont
d = json.load(open(sys.argv[1])); out = sys.argv[2]
P = 4; R = d['R']; W = int(2 * R * P)
im = Image.new('RGB', (W + 260, W), (30, 30, 30)); px = im.load()
n = d['n']; S = d['S']
for j in range(n):
    for i in range(n):
        k = i + n * j; h = d['H'][k]; dep = d['D'][k]
        if dep > 0.02: c = (40, 70, 110) if dep > 0.3 else (70, 100, 120)
        else: v = max(0, min(255, int(105 + h * 14))); c = (int(v * 0.75), v, int(v * 0.6))
        if d['C'][k] > 0.3: c = (int(c[0] * 0.8), int(c[1] * 0.9), int(c[2] * 0.7))
        for a in range(2):
            for b in range(2): px[i * 2 + a, j * 2 + b] = c
dr = ImageDraw.Draw(im, 'RGBA')
X = lambda x: (x + R) * P; Z = lambda z: (R - z) * P
nv = d['nav']; nn = nv['n']; NR = nv['R']
for j in range(nn):
    for i in range(nn):
        v = nv['v'][i + nn * j]; x = -NR + i * 2; z = -NR + j * 2
        if v == 1 or abs(x + 1) > R or abs(z + 1) > R: continue
        dr.rectangle([X(x), Z(z + 2), X(x + 2), Z(z)], fill=(200, 40, 40, 55) if v == -1 else (90, 90, 90, 90))
MC = {'timber': (150, 110, 70), 'concrete': (190, 185, 175), 'block': (160, 155, 145), 'steel': (120, 130, 140), 'container': (170, 80, 50), 'fence': (230, 220, 60), 'rock': (110, 100, 90), 'wood': (140, 110, 80), 'pipe': (170, 170, 165), 'hay': (200, 170, 90), 'bamboo': (130, 170, 80), 'jungle': (40, 60, 30)}
def rot(th, L):
    s, c = math.sin(th['yaw']), math.cos(th['yaw']); w = th['w'] / 2; l = L / 2
    return [(X(th['x'] + c * a + s * b), Z(th['z'] - s * a + c * b)) for a, b in [(-w, -l), (w, -l), (w, l), (-w, l)]]
for th in d['things']:
    k = th['kind']; col = MC.get(th['mat'], (200, 200, 200))
    if k in ('wall',): dr.polygon(rot(th, th['l'] + th['w']), fill=col + (255,))
    elif k == 'slab': dr.polygon(rot(th, th['l'] + th['w']), outline=col + (200,))
    elif k in ('roof',): dr.polygon(rot(th, th['l']), outline=(90, 80, 70, 160))
    elif k in ('deck', 'catwalk'): dr.polygon(rot(th, th['l']), fill=col + (200,))
    elif k in ('post', 'trunk'): r = max(th['r'] * P, 1.2); dr.ellipse([X(th['x']) - r, Z(th['z']) - r, X(th['x']) + r, Z(th['z']) + r], fill=col + (255,))
for o in d['doors']:
    x, z = o['hinge']; a = o['ang']; dr.line([X(x), Z(z), X(x + math.sin(a) * o['len']), Z(z + math.cos(a) * o['len'])], fill=(255, 255, 255) if o['state'] == 'open' else (255, 120, 0), width=2)
for o in d['openings']:
    l = math.hypot(o['nx'], o['nz']) or 1; dr.line([X(o['x']), Z(o['z']), X(o['x'] + o['nx'] / l * 3), Z(o['z'] + o['nz'] / l * 3)], fill=(80, 220, 255) if not o['up'] else (255, 80, 255), width=2)
if d.get('reach'):
    for nm, x, z, ok in d['reach']['pts']: r = 2.2; dr.ellipse([X(x) - r, Z(z) - r, X(x) + r, Z(z) + r], fill=(255, 40, 40, 230) if ok else (40, 255, 90, 230))
f = ImageFont.load_default()
for m in d['landmarks']: dr.text((X(m['x']) - 20, Z(m['z']) - 6), m['name'].replace('the ', ''), fill=(255, 255, 255), font=f)
sp = d['spawn']
for k, c in (('you', (60, 160, 255)), ('rex', (255, 150, 0))): x, z = sp[k]['x'], sp[k]['z']; dr.ellipse([X(x) - 5, Z(z) - 5, X(x) + 5, Z(z) + 5], fill=c); dr.text((X(x) + 7, Z(z) - 6), k, fill=c, font=f)
y = 10
for t, c in [('ARENA 200 x 200 m, N up, 4 px/m', (255, 255, 255)), ('red tint: animal cannot stand', (220, 80, 80)), ('grey: open but cut off', (150, 150, 150)), ('cyan: openings  magenta: up', (80, 220, 255)), ('white/orange: doors open/shut', (255, 160, 60)), ('dots: reach (red) / safe (green)', (120, 255, 120))]:
    dr.text((W + 10, y), t, fill=c, font=f); y += 16
if d.get('reach'):
    y += 10
    for r in d['reach']['rows']: dr.text((W + 10, y), f"{r['name'][:16]:16s} {100 * r['frac']:3.0f}% of {r['n']}", fill=(230, 230, 230), font=f); y += 14
im.save(out); print('wrote', out)
