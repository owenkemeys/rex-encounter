import sys; sys.path.insert(0,'/home/claude/rex_patch/out/tools')
from glb import *
import io
from PIL import Image
g,acc,img=load('/home/claude/rex_patch/dist/model/patchrex.glb')
im=np.asarray(Image.open(io.BytesIO(img(1))).resize((1024,1024))).astype(float)
R,G,Bc=im[...,0],im[...,1],im[...,2]
m=(R>150)&(R>G*1.35)&(G>B*1.3 if False else G>Bc*1.4)&(R-Bc>110)
ys,xs=np.nonzero(m); print('orange px',len(xs))
# cluster crude
from collections import defaultdict
cl=defaultdict(list)
for x,y in zip(xs,ys): cl[(x//40,y//40)].append((x,y))
for k,v in sorted(cl.items(), key=lambda kv:-len(kv[1]))[:8]: v=np.array(v); print(k,len(v),v.mean(0).round(1))
p=g['meshes'][0]['primitives'][0]; P=acc(p['attributes']['POSITION']); UV=acc(p['attributes']['TEXCOORD_0']); idx=acc(p['indices']).reshape(-1,3)
print('uv range',UV.min(0),UV.max(0))
px=np.clip((UV*1024).astype(int),0,1023)
on=m[px[:,1],px[:,0]]
print('verts on orange',on.sum())
Q=P[on]; print(Q.round(2)[:40])
for s in (1,-1):
  q=Q[Q[:,0]*s>0]; print('side',s,len(q),'mean',q.mean(0).round(3),'min',q.min(0).round(3),'max',q.max(0).round(3))
np.save('/home/claude/rex_patch/out/tools/eyeverts.npy',Q)
