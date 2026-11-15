import sys, json, struct
import numpy as np
def load(path):
    f=open(path,'rb').read()
    jl=struct.unpack('<I',f[12:16])[0]; g=json.loads(f[20:20+jl]); bo=20+jl+8; B=f[bo:]
    def acc(i):
        a=g['accessors'][i]; bv=g['bufferViews'][a['bufferView']]
        n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
        dt={5120:'i1',5121:'u1',5122:'i2',5123:'u2',5125:'u4',5126:'f4'}[a['componentType']]
        off=bv.get('byteOffset',0)+a.get('byteOffset',0); st=bv.get('byteStride')
        if st and st!=np.dtype(dt).itemsize*n:
            raw=np.frombuffer(B,dtype='u1',count=st*a['count'],offset=off).reshape(a['count'],st)[:,:np.dtype(dt).itemsize*n].copy()
            return raw.view(dt).reshape(a['count'],n)
        return np.frombuffer(B,dtype=dt,count=a['count']*n,offset=off).reshape(a['count'],n)
    def img(i):
        im=g['images'][i]; bv=g['bufferViews'][im['bufferView']]; o=bv.get('byteOffset',0); return B[o:o+bv['byteLength']]
    return g,acc,img
def nodes_world(g):
    N=g['nodes']; par={}
    for i,n in enumerate(N):
        for c in n.get('children',[]): par[c]=i
    def loc(n):
        M=np.eye(4)
        if 'matrix' in n: return np.array(n['matrix']).reshape(4,4).T
        t=n.get('translation',[0,0,0]); q=n.get('rotation',[0,0,0,1]); s=n.get('scale',[1,1,1]); x,y,z,w=q
        R=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
        M[:3,:3]=R*np.array(s); M[:3,3]=t; return M
    W={}
    def wm(i):
        if i in W: return W[i]
        M=loc(N[i]); M=wm(par[i])@M if i in par else M; W[i]=M; return M
    for i in range(len(N)): wm(i)
    return W,par
