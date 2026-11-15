import sys; sys.path.insert(0,'/home/claude/rex_patch/out/tools')
from glb import *
g,acc,img=load('/home/claude/rex_patch/dist/model/patchrex.glb')
W,par=nodes_world(g); N=g['nodes']; sk=g['skins'][0]; js=sk['joints']
IBM=acc(sk['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
print('skin skeleton root', sk.get('skeleton'), 'mesh nodes', [(i,n.get('name'),n.get('skin')) for i,n in enumerate(N) if 'mesh' in n])
for i,n in enumerate(N):
  if 'mesh' in n: print('mesh node world\n',W[i].round(3), 'parent', par.get(i))
for k,j in enumerate(js):
  M=W[j]; err=np.abs(M@IBM[k]-np.eye(4)).max()
  print(k,N[j]['name'], 'ibm*world err %.4f'%err, 'R=',np.round(M[:3,:3],2).tolist())
p=g['meshes'][0]['primitives'][0]; P=acc(p['attributes']['POSITION']); Wt=acc(p['attributes']['WEIGHTS_0']).astype(float); J=acc(p['attributes']['JOINTS_0'])
print('weights dtype', g['accessors'][p['attributes']['WEIGHTS_0']]['componentType'], 'joints dtype', g['accessors'][p['attributes']['JOINTS_0']]['componentType'], Wt.max())
dom=J[np.arange(len(J)),Wt.argmax(1)]
for k,j in enumerate(js):
  m=dom==k
  if m.sum(): print(k,N[j]['name'],m.sum(),'min',P[m].min(0).round(2),'max',P[m].max(0).round(2),'mean',P[m].mean(0).round(2))
print('material', g['materials'])
print('textures', g['textures'], g.get('samplers'))
print('images', [(i.get('mimeType'), g['bufferViews'][i['bufferView']]['byteLength']) for i in g['images']])
print('accessor attrs', {k: g['accessors'][v]['componentType'] for k,v in p['attributes'].items()}, 'idx', g['accessors'][p['indices']]['componentType'])
