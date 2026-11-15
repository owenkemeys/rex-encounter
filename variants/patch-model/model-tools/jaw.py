import sys; sys.path.insert(0,'/home/claude/rex_patch/out/tools')
from glb import *
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
g,acc,img=load('/home/claude/rex_patch/dist/model/patchrex.glb')
p=g['meshes'][0]['primitives'][0]; P=acc(p['attributes']['POSITION']).astype(float); Wt=acc(p['attributes']['WEIGHTS_0']).astype(float); J=acc(p['attributes']['JOINTS_0'])
wj=np.zeros(len(P)); 
for c in range(4): wj+=Wt[:,c]*(J[:,c]==6)
wh=np.zeros(len(P))
for c in range(4): wh+=Wt[:,c]*(J[:,c]==5)
hinge=np.array([0,4.15,3.9])
sel=(P[:,2]>3.2)&(np.abs(P[:,0])<0.9)
fig,ax=plt.subplots(2,3,figsize=(18,9)); ax=ax.ravel()
for i,a in enumerate([0,0.2,0.3,0.35,0.4,0.5]):
    c,s=np.cos(-a),np.sin(-a)  # rotate about x by -a (closing)
    Q=P-hinge; y=Q[:,1]*c-Q[:,2]*s; z=Q[:,1]*s+Q[:,2]*c
    R=P.copy(); R[:,1]=hinge[1]+y; R[:,2]=hinge[2]+z
    X=P*(1-wj)[:,None]+R*wj[:,None]
    m=sel&(np.abs(P[:,0])<0.25)
    ax[i].scatter(X[m,2],X[m,1],s=0.5,c=wj[m],cmap='coolwarm'); ax[i].set_aspect('equal'); ax[i].set_title('close %.2f'%a); ax[i].set_xlim(3.2,6.2); ax[i].set_ylim(3.2,5.8)
plt.savefig('/home/claude/rex_patch/out/tools/jaw.png',dpi=60)
