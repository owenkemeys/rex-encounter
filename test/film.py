# Motion viewer. usage: film.py dump.json out_prefix [fps] [view]
# Produces <prefix>_film.png (flip-book in reading order), <prefix>_strobe.png (overlaid poses + joint paths), <prefix>_trace.png (full-rate curves)
import json, sys, math
from PIL import Image, ImageDraw
d=json.load(open(sys.argv[1])); pre=sys.argv[2]; fps=float(sys.argv[3]) if len(sys.argv)>3 else 12; view=sys.argv[4] if len(sys.argv)>4 else 'side'
F=d['frames']; IDX=d['IDX']; N=len(F[0]['p'])//3
PROF=[0.03+0.45*(k/12)**0.9 for k in range(13)]+[0.64,0.7,0.73,0.71,0.65,0.57,0.52,0.47,0.43,0.4,0.37,0.35,0.34]
HPROF=[0.04+0.64*(k/12)**0.9 for k in range(13)]+[0.9,0.99,1.03,1.0,0.92,0.82,0.74,0.66,0.59,0.53,0.48,0.45,0.43]
def proj(f, pt, ref=None):
    r=ref or f; ps=F[0]['psi'] if view=='top' else r['psi']; s,c=math.sin(ps),math.cos(ps); dx,dz=pt[0]-r['x'],pt[2]-r['z']
    if view=='side': return (dx*s+dz*c, pt[1]-r['gy'])
    if view=='front': return (dx*c-dz*s, pt[1]-r['gy'])
    return (dx*c-dz*s, dx*s+dz*c)   # top: left is +x on page-left? (x = left offset, y = forward)
def P3(arr,i): return arr[i*3:i*3+3]
def draw_pose(dr, f, ox, oy, sc, ref=None, alpha=255, ground=True, light=False):
    T=lambda pt:(ox+proj(f,pt,ref)[0]*sc*(-1 if view=='top' else 1), oy-proj(f,pt,ref)[1]*sc)
    col=(40,40,40,alpha); 
    if ground and view=='side' and ref is None:
        g=f['gl']; pts=[(ox+dd*sc, oy-(g[i]-f['gy'])*sc) for i,dd in enumerate([-8,-6,-4,-2,0,2,4,6,8,10])]; dr.line(pts,fill=(150,120,80,255),width=2)
    if ground and d.get('cols'):      # solid things: footprints from above; from the side, those within 2.5 m of the body's plane
        r0=ref or f; s0,c0=math.sin(r0['psi'] if view!='top' else F[0]['psi']),math.cos(r0['psi'] if view!='top' else F[0]['psi'])
        for (x,z,r,bot,top) in d['cols']:
            if view=='top':
                q=proj(f,[x,0,z],ref); X,Y=ox-q[0]*sc,oy-q[1]*sc; dr.ellipse([X-r*sc,Y-r*sc,X+r*sc,Y+r*sc],outline=(150,140,120,255) if bot is None else (120,160,190,255))
            else:
                lat=(x-r0['x'])*c0-(z-r0['z'])*s0
                if abs(lat)>r+1.4: continue
                q=proj(f,[x,0,z],ref); X=ox+q[0]*sc; y0=(bot if bot is not None else -9)-r0['gy']; y1=top-r0['gy']
                dr.rectangle([X-r*sc,oy-y1*sc,X+r*sc,oy-max(y0,-0.3)*sc],fill=(205,198,185,255) if bot is None else (190,210,225,255))
    prof=PROF if view=='top' else HPROF
    # far leg first, body, near leg
    def leg(k,c):
        L=f['l'][k*18:k*18+18]; hip,knee,ank,mtp=P3(L,0),P3(L,1),P3(L,2),P3(L,3); tf=P3(L,4)
        toe=[mtp[i]+tf[i]*0.62 for i in range(3)]
        dr.line([T(hip),T(knee)],fill=c,width=max(2,int(0.55*sc))); dr.line([T(knee),T(ank)],fill=c,width=max(2,int(0.3*sc))); dr.line([T(ank),T(mtp)],fill=c,width=max(2,int(0.17*sc))); dr.line([T(mtp),T(toe)],fill=c,width=max(2,int(0.12*sc)))
    leg(1,(150,60,60,alpha) if not light else (200,150,150,alpha))
    if not light:
        for i in range(N-1):
            a,b=T(P3(f['p'],i)),T(P3(f['p'],i+1)); dr.line([a,b],fill=col,width=max(2,int(prof[i]*2*sc*0.92)))
            r=prof[i+1]*sc*0.92; dr.ellipse([b[0]-r,b[1]-r,b[0]+r,b[1]+r],fill=col)
    else:
        dr.line([T(P3(f['p'],i)) for i in range(N)],fill=(90,90,90,alpha),width=1)
    hp,hf,hu=P3(f['h'],0),P3(f['h'],1),P3(f['h'],2)
    tip=[hp[i]+hf[i]*1.5+hu[i]*0.12 for i in range(3)]; ja=f['jaw']
    jt=[hp[i]+hf[i]*1.4*math.cos(ja)-hu[i]*(0.25+1.4*math.sin(ja)) for i in range(3)]
    hc=(30,90,150,alpha)
    dr.line([T(hp),T(tip)],fill=hc,width=max(2,int((0.55 if not light else 0.1)*sc))); dr.line([T([hp[i]-hu[i]*0.2 for i in range(3)]),T(jt)],fill=(20,60,110,alpha),width=max(2,int((0.22 if not light else 0.08)*sc)))
    leg(0,(60,120,60,alpha) if not light else (150,200,150,alpha))
    A=f['a'][0:9]; dr.line([T(P3(A,0)),T(P3(A,1)),T(P3(A,2))],fill=(0,0,0,alpha),width=2)
# ---- film
step=max(1,round(120/fps)); sel=F[::step]; cols=6 if view!='top' else 6; cw,ch=(330,190) if view!='top' else (300,300); sc=20 if view!='top' else 17
rows=(len(sel)+cols-1)//cols
im=Image.new('RGBA',(cols*cw,rows*ch),(245,243,236,255)); dr=ImageDraw.Draw(im)
for i,f in enumerate(sel):
    cx,cy=(i%cols)*cw,(i//cols)*ch
    dr.rectangle([cx,cy,cx+cw-1,cy+ch-1],outline=(200,200,200,255))
    draw_pose(dr,f,cx+cw*0.5-(1.0*sc if view=='side' else 0),cy+(ch-28 if view!='top' else ch*0.55),sc)
    dr.text((cx+4,cy+3),f"{f['t']:.2f}s {f['mode']} v={f['v']:.1f} {'L' if f['pl'][0] else '-'}{'R' if f['pl'][1] else '-'}",fill=(0,0,0,255))
im.convert('RGB').save(pre+'_film.png')
# ---- strobe: poses overlaid in the world (moving) frame + joint paths
ref=dict(F[0]); 
xs=[proj(f,P3(f['p'],IDX['PELVIS']),ref)[0] for f in F]; span=max(xs)-min(xs)
W=1800; sc2=min(42, (W-500)/max(span+14,1)); H=int(8.2*sc2)+40
im=Image.new('RGBA',(W,H),(245,243,236,255))
ox=240-min(xs)*sc2 if view!='top' else W/2; oy=H-30
nst=max(1,len(F)//(9 if span>6 else 6))
for f in F[::nst]:
    lay=Image.new('RGBA',(W,H),(0,0,0,0)); draw_pose(ImageDraw.Draw(lay),f,ox,oy,sc2,ref=dict(ref,gy=ref['gy']),alpha=70,ground=False); im=Image.alpha_composite(im,lay)
dr=ImageDraw.Draw(im)
def path(getter,c):
    pts=[]
    for f in F:
        q=proj(f,getter(f),ref); pts.append((ox+q[0]*sc2*(-1 if view=='top' else 1),oy-q[1]*sc2))
    dr.line(pts,fill=c,width=2)
path(lambda f:[f['h'][i]+f['h'][3+i]*1.5 for i in range(3)],(30,90,200,255)); path(lambda f:P3(f['h'],0),(120,160,230,255))
path(lambda f:P3(f['p'],IDX['PELVIS']),(0,0,0,255)); path(lambda f:P3(f['p'],0),(160,60,160,255)); path(lambda f:P3(f['p'],IDX['CHEST']),(120,120,120,255))
path(lambda f:f['l'][6:9],(40,150,40,255)); path(lambda f:f['l'][18+6:18+9],(200,60,60,255))
dr.text((6,4),f"{d['name']} strobe ({view}): snout blue, skull lt-blue, hips black, chest grey, tail tip purple, L ankle green, R ankle red",fill=(0,0,0,255))
im.convert('RGB').save(pre+'_strobe.png')
# ---- traces at full rate
chans=[('hip height',lambda f:f['p'][IDX['PELVIS']*3+1]-f['gy']),('skull height',lambda f:f['h'][1]-f['gy']),('head pitch',lambda f:math.asin(max(-1,min(1,f['h'][4])))),('head yaw rel',lambda f:((math.atan2(f['h'][3],f['h'][5])-f['psi']+math.pi)%(2*math.pi))-math.pi),
 ('L ankle h',lambda f:f['l'][7]-f['gy']),('R ankle h',lambda f:f['l'][18+7]-f['gy']),('tail tip lateral',lambda f:proj(f,P3(f['p'],0))[0] if view=='top' else ((f['p'][0]-f['x'])*math.cos(f['psi'])-(f['p'][2]-f['z'])*math.sin(f['psi']))),('speed',lambda f:f['v']),('jaw',lambda f:f['jaw']),('L knee fwd',lambda f:(f['l'][3]-f['x'])*math.sin(f['psi'])+(f['l'][5]-f['z'])*math.cos(f['psi']))]
W,rh=1500,78; im=Image.new('RGB',(W,rh*len(chans)),(255,255,255)); dr=ImageDraw.Draw(im)
for k,(nm,fn) in enumerate(chans):
    ys=[fn(f) for f in F]; lo,hi=min(ys),max(ys); rng=max(hi-lo,1e-3); y0=k*rh
    pts=[(110+(W-120)*i/(len(F)-1), y0+rh-8-(y-lo)/rng*(rh-16)) for i,y in enumerate(ys)]
    dr.line(pts,fill=(20,20,20),width=1); dr.line([(0,y0),(W,y0)],fill=(210,210,210)); dr.text((4,y0+4),f"{nm}\n{lo:.2f}..{hi:.2f}",fill=(0,0,120))
for sx in range(int(F[-1]['t'])+1): x=110+(W-120)*sx/F[-1]['t']; dr.line([(x,0),(x,rh*len(chans))],fill=(225,225,225))
im.save(pre+'_trace.png'); print('ok',len(F),'frames, film',len(sel))
