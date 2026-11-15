# Preprocess the CC0 GLB into the game's own files: dist/model/patchrex.bin (+ .json) and downscaled textures.
import sys, io, json; sys.path.insert(0,'/home/claude/rex_patch/out/tools')
from glb import *
from uv2p import uv2p
from PIL import Image
SRC='/home/claude/rex_patch/dist/model/patchrex.glb'; OUT='/home/claude/rex_patch/dist/model/'
g,acc,img=load(SRC)
W,par=nodes_world(g); N=g['nodes']; sk=g['skins'][0]; js=sk['joints']
pr=g['meshes'][0]['primitives'][0]; A=pr['attributes']
P=acc(A['POSITION']).astype('<f4'); NR=acc(A['NORMAL']).astype('<f4'); UV=acc(A['TEXCOORD_0']).astype('<f4')
J=acc(A['JOINTS_0']).astype('<u2'); WT=acc(A['WEIGHTS_0']).astype('<f4'); IX=acc(pr['indices']).astype('<u2').ravel()
WT=WT/WT.sum(1,keepdims=True)
names=[N[j]['name'] for j in js]; jid={j:k for k,j in enumerate(js)}
parents=[jid.get(par.get(j),-1) for j in js]
bind=[W[j].T.ravel().tolist() for j in js]   # column-major
pos={names[k]:W[j][:3,3] for k,j in enumerate(js)}
def wsum(b):
    k=names.index(b); return sum(WT[:,c]*(J[:,c]==k) for c in range(4))
L={}
# eyes: painted iris centres (1k texel coords) -> surface point and normal
for nm,(cx,cy) in {'eyeL':(170.1,736.2),'eyeR':(411,674.2)}.items():
    (pt,nn),=uv2p(cx/1024,cy/1024)[:1]; L[nm]={'p':pt.tolist(),'n':(nn/np.linalg.norm(nn)).tolist()}
# tail tip, forearm tips (leaf ends)
L['tailTip']=P[np.argmin(P[:,2])].tolist()
for s in 'LR':
    w=wsum('forearm_'+s); m=w>0.6; q=P[m]; d=np.linalg.norm(q-pos['forearm_'+s],axis=1); L['hand_'+s]=q[np.argsort(-d)[:20]].mean(0).tolist()
    w=wsum('hpaw_'+s); m=w>0.6; q=P[m]; h=pos['hpaw_'+s]
    rel=q-h; fwd=rel[:,2]>np.percentile(rel[:,2],90); f=rel[fwd].mean(0); f[1]=0; f/=np.linalg.norm(f); L['footF_'+s]=f.tolist()
    sole=np.nonzero(m)[0][np.argsort(P[m][:,1])[:40]]; L['sole_'+s]=sole.tolist(); L['soleY_'+s]=float(P[sole,1].mean())
    L['toeTip_'+s]=float((rel@f).max())
# snout: front top of the upper jaw on the midline
wh=wsum('head'); m=(wh>0.6)&(np.abs(P[:,0])<0.12)&(P[:,2]>5.6); q=P[m]
L['snoutTop']=q[np.argmax(q[:,1])].tolist(); L['snoutTip']=P[(wh>0.5)][np.argmax(P[(wh>0.5)][:,2])].tolist()
L['jawOpen']=0.38; L['jawHinge']=pos['jaw'].tolist()
print(json.dumps(L,indent=0)[:1500])
# geometry blob: pos f32x3, nrm f32x3, uv f32x2, skinIndex u16x4, skinWeight f32x4, index u16
parts=[('position',P),('normal',NR),('uv',UV),('skinIndex',J),('skinWeight',WT),('index',IX)]
off=0; layout={}; blob=b''
for k,a in parts:
    b=np.ascontiguousarray(a).tobytes(); pad=(-len(b))%4; layout[k]={'offset':off,'count':int(a.size),'type':str(a.dtype)}; blob+=b+b'\0'*pad; off+=len(b)+pad
open(OUT+'patchrex.bin','wb').write(blob)
json.dump({'verts':len(P),'tris':len(IX)//3,'layout':layout,'names':names,'parents':parents,'bind':bind,'landmarks':L},open(OUT+'patchrex.json','w'))
# textures: base colour and roughness at 2048 (1024 for phones), the weak normal map at 1024
src={'base':1,'nrm':0,'mr':2}
for k,i in src.items():
    im=Image.open(io.BytesIO(img(i))).convert('RGB')
    if k=='mr':
        a=np.asarray(im); print('MR channels mean/min/max', a.reshape(-1,3).mean(0).round(1), a.reshape(-1,3).min(0), a.reshape(-1,3).max(0))
    for sz in ((2048,1024) if k!='nrm' else (1024,)):
        im.resize((sz,sz),Image.LANCZOS).save(OUT+'patchrex_%s_%d.jpg'%(k,sz),quality=88 if k=='base' else 85,optimize=True)
import os
for f in sorted(os.listdir(OUT)): print(f, os.path.getsize(OUT+f))
