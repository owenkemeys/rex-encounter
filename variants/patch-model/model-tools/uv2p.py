import sys; sys.path.insert(0,'/home/claude/rex_patch/out/tools')
from glb import *
g,acc,img=load('/home/claude/rex_patch/dist/model/patchrex.glb')
p=g['meshes'][0]['primitives'][0]; P=acc(p['attributes']['POSITION']); UV=acc(p['attributes']['TEXCOORD_0']); T=acc(p['indices']).reshape(-1,3); Nn=acc(p['attributes']['NORMAL'])
def uv2p(u,v):
    A=UV[T[:,0]];B=UV[T[:,1]];C=UV[T[:,2]]
    v0=B-A; v1=C-A; v2=np.array([u,v])-A
    d=v0[:,0]*v1[:,1]-v1[:,0]*v0[:,1]; d[d==0]=1e-12
    b1=(v2[:,0]*v1[:,1]-v1[:,0]*v2[:,1])/d; b2=(v0[:,0]*v2[:,1]-v2[:,0]*v0[:,1])/d; b0=1-b1-b2
    ok=np.nonzero((b0>=-1e-4)&(b1>=-1e-4)&(b2>=-1e-4))[0]
    out=[]
    for t in ok: out.append((b0[t]*P[T[t,0]]+b1[t]*P[T[t,1]]+b2[t]*P[T[t,2]], b0[t]*Nn[T[t,0]]+b1[t]*Nn[T[t,1]]+b2[t]*Nn[T[t,2]]))
    return out
if __name__=='__main__':
  for (cx,cy) in [(170.1,736.2),(411,674.2)]:
    c=uv2p(cx/1024,cy/1024); print('centre',[(a.round(3),n.round(2)) for a,n in c])
    for r in (10,20,30):
      pts=[]
      for a in np.linspace(0,2*np.pi,12,endpoint=False):
        q=uv2p((cx+r*np.cos(a))/1024,(cy+r*np.sin(a))/1024)
        if q: pts.append(q[0][0])
      pts=np.array(pts); print(' r',r,'px n',len(pts),'mean dist to centre %.3f'%np.linalg.norm(pts-c[0][0],axis=1).mean() if len(c) else '')
