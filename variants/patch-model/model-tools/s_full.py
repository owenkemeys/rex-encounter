# full acceptance run in #test pages: shots + foot-plant numbers + body.update timing
tag=os.environ.get('TAG','p')
def shot(name, cam):
    pg.evaluate("(()=>{const s=__dino.sim,v=s.pose.v,H=[v[156],v[157],v[158]],F=[v[159],v[160],v[161]],L=[F[2],0,-F[0]];__dino.look(...(%s))})()"%cam)
    pg.screenshot(path=f'{out}/{name}_{tag}.png')
pg.evaluate("document.body.classList.add('bare');__dino.setMind(false);__dino.post&&__dino.post.setVHS&&__dino.post.setVHS(false);__dino.setMode('fly')")
# metrics: wrap body.update
pg.evaluate("""(()=>{
 const b=__dino.body, sim=__dino.sim, T=sim.terrain, M=window.__M={phase:'idle',t:[],nan:0,ph:{}};
 const patch=!!b.isPatch, g=b.mesh.geometry, P=g.attributes.position, SI=g.attributes.skinIndex, SW=g.attributes.skinWeight;
 const soles=patch?[b.LM.sole_L,b.LM.sole_R]:null, inv=b.skeleton.boneInverses;
 const up=b.update.bind(b), st=[{},{}];
 const sk=(i,o)=>{let x=0,y=0,z=0;const px=P.getX(i),py=P.getY(i),pz=P.getZ(i);for(let c=0;c<4;c++){const w=SW.getComponent(i,c);if(!w)continue;const k=SI.getComponent(i,c);const m=b.W[k].clone().multiply(inv[k]).elements;x+=w*(m[0]*px+m[4]*py+m[8]*pz+m[12]);y+=w*(m[1]*px+m[5]*py+m[9]*pz+m[13]);z+=w*(m[2]*px+m[6]*py+m[10]*pz+m[14]);}o[0]=x;o[1]=y;o[2]=z;return o;};
 b.update=function(pose){const t0=performance.now();up(pose);M.t.push(performance.now()-t0);if(M.t.length>4000)M.t.shift();
  if(!patch)return; for(const W of b.W) for(const e of W.elements) if(!Number.isFinite(e)) {M.nan++;break;}
  const R=M.ph[M.phase]||(M.ph[M.phase]={drift:[0,0],hmin:[9,9],hmax:[-9,-9],hmean:[0,0],n:[0,0],plantN:[0,0]});
  for(let k=0;k<2;k++){const planted=pose.s[4+k]>0.5, f=sim.feet[k]; if(!planted){st[k]={};continue;}
   let cx=0,cz=0,lo=1e9; const o=[0,0,0]; for(const i of soles[k]){sk(i,o);cx+=o[0];cz+=o[2];lo=Math.min(lo,o[1]-T.height(o[0],o[2]));}
   cx/=soles[k].length;cz/=soles[k].length;
   if(st[k].x===undefined){st[k]={x:cx,z:cz,land:f.tLand};R.plantN[k]++;} else if(st[k].land!==f.tLand){st[k]={x:cx,z:cz,land:f.tLand};R.plantN[k]++;}
   const d=Math.hypot(cx-st[k].x,cz-st[k].z); if(f.betaS<0.05) R.drift[k]=Math.max(R.drift[k],d);      // drift while flat (before the heel rises)
   R.hmin[k]=Math.min(R.hmin[k],lo);R.hmax[k]=Math.max(R.hmax[k],lo);R.hmean[k]+=lo;R.n[k]++;}};
})()""")
pg.evaluate("__dino.advance(2)")

SIDE="[s.x+Math.cos(s.psi)*16,s.groundY+3,s.z-Math.sin(s.psi)*16,s.x+Math.sin(s.psi)*0.8,s.groundY+2.8,s.z+Math.cos(s.psi)*0.8]"
shot('tail', "[s.x-Math.sin(s.psi)*13+Math.cos(s.psi)*5,s.groundY+5.5,s.z-Math.cos(s.psi)*13-Math.sin(s.psi)*5,s.x-Math.sin(s.psi)*2,s.groundY+3,s.z-Math.cos(s.psi)*2]")
HEADSIDE="[H[0]+F[0]*1.1+L[0]*5,H[1]-0.2,H[2]+F[2]*1.1+L[2]*5,H[0]+F[0]*1.1,H[1]-0.4,H[2]+F[2]*1.1]"
pg.evaluate("__dino.sim.pose.s[0]=0.02"); shot('jaw_closed', HEADSIDE)
pg.evaluate("__dino.sim.pose.s[0]=0.75"); shot('jaw_open', HEADSIDE)
pg.evaluate("__dino.sim.pose.s[0]=0.03")
# eyes: the camera 5 m in front of the snout and a little to its left, the eyes told to fix on it
EYE="[H[0]+F[0]*4.2+L[0]*1.8,H[1]+0.6,H[2]+F[2]*4.2+L[2]*1.8,H[0]+F[0]*0.9,H[1]+0.35,H[2]+F[2]*0.9]"
for i in range(2):
    pg.evaluate("(()=>{const s=__dino.sim,v=s.pose.v,H=[v[156],v[157],v[158]],F=[v[159],v[160],v[161]],L=[F[2],0,-F[0]];const c=%s;s.fix.set(c[0],c[1],c[2])})()"%EYE)
    shot('eyes', EYE); time.sleep(0.3)
EYE2="[H[0]+L[0]*4+F[0]*1.5,H[1]+0.5,H[2]+L[2]*4+F[2]*1.5,H[0]+F[0]*0.9,H[1]+0.35,H[2]+F[2]*0.9]"
pg.evaluate("(()=>{const s=__dino.sim,v=s.pose.v,H=[v[156],v[157],v[158]],F=[v[159],v[160],v[161]],L=[F[2],0,-F[0]];const c=%s;s.fix.set(c[0],c[1],c[2])})()"%EYE2)
shot('eyes_side', EYE2); shot('eyes_side', EYE2)
# walk
pg.evaluate("__M.phase='walkup';__dino.S.pace=2.2;__dino.reachTo(__dino.sim.x+Math.sin(__dino.sim.psi)*70,__dino.sim.z+Math.cos(__dino.sim.psi)*70);__dino.advance(4,1/60);__M.phase='walk';__dino.advance(6,1/60)")
shot('walk_side', SIDE)
shot('feet', "[s.x+Math.cos(s.psi)*5+Math.sin(s.psi)*2.5,s.groundY+1.0,s.z-Math.sin(s.psi)*5+Math.cos(s.psi)*2.5,s.x+Math.sin(s.psi)*0.5,s.groundY+0.4,s.z+Math.cos(s.psi)*0.5]")
pg.evaluate("__dino.advance(0.4,1/60)")
shot('walk_side2', SIDE)
# turn: a goal behind and to the left
pg.evaluate("__M.phase='turn';const s=__dino.sim;__dino.reachTo(s.x-Math.sin(s.psi)*30+Math.cos(s.psi)*25,s.z-Math.cos(s.psi)*30-Math.sin(s.psi)*25);__dino.advance(2.2,1/60)")
shot('turn', "[s.x+Math.cos(s.psi)*12+Math.sin(s.psi)*9,s.groundY+3.5,s.z-Math.sin(s.psi)*12+Math.cos(s.psi)*9,s.x,s.groundY+2.6,s.z]")
# run
pg.evaluate("__M.phase='runup';__dino.S.pace=8;const s=__dino.sim;__dino.reachTo(s.x+Math.sin(s.psi)*90,s.z+Math.cos(s.psi)*90);__dino.advance(3,1/60);__M.phase='run';__dino.advance(4,1/60)")
print('speed', pg.evaluate("__dino.sim.v"))
shot('run_side', "[s.x+Math.cos(s.psi)*18,s.groundY+3,s.z-Math.sin(s.psi)*18,s.x+Math.sin(s.psi)*1.5,s.groundY+2.8,s.z+Math.cos(s.psi)*1.5]")
pg.evaluate("__dino.advance(0.25,1/60)")
shot('run_side2', "[s.x+Math.cos(s.psi)*18,s.groundY+3,s.z-Math.sin(s.psi)*18,s.x+Math.sin(s.psi)*1.5,s.groundY+2.8,s.z+Math.cos(s.psi)*1.5]")
r=pg.evaluate("(()=>{const M=__M,t=M.t.slice().sort((a,b)=>a-b);const o={nan:M.nan,updMs:{mean:t.reduce((a,b)=>a+b,0)/t.length,p50:t[t.length>>1],p95:t[Math.floor(t.length*0.95)],n:t.length},ph:{}};for(const k in M.ph){const R=M.ph[k];o.ph[k]={driftFlat_cm:R.drift.map(x=>+(x*100).toFixed(1)),soleH_cm:{min:R.hmin.map(x=>+(x*100).toFixed(1)),max:R.hmax.map(x=>+(x*100).toFixed(1)),mean:R.hmean.map((x,i)=>+(100*x/Math.max(1,R.n[i])).toFixed(1))},plants:R.plantN}}return JSON.stringify(o)})()")
print('METRICS', r)
open(f'{out}/metrics_{tag}.json','w').write(r)
