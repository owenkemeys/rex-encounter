import { makeTerrain } from '../src/terrain.js';
import { RexSim, PV } from '../src/sim/rex.js';
const T=makeTerrain(7), sim=new RexSim(T,{seed:3}), dt=1/120, g=(x,z,id)=>({kind:'reach',id,x,z});
const o=(PV.LEG+6)*3; let p1=null,p2=null;
for(let i=0;i<13.05*120;i++){ const t=i*dt; const k=Math.floor(t/9), a=k*2.3; sim.step(dt,{goal:g(Math.sin(a)*(8+k*3),Math.cos(a)*(8+k*3),k),pace:2.2,attention:null}); sim.events.length=0;
 const v=sim.pose.v, f=sim.feet[1]; const c=[v[o+6],v[o+7],v[o+8]];
 if(p2&&t>12.85){ const acc=Math.hypot(...c.map((x,j)=>x-2*p1[j]+p2[j]))/(dt*dt); console.log(t.toFixed(3),f.planted?'S':'w'+(f.sw.t/f.sw.T).toFixed(2),'ankle',c.map(x=>x.toFixed(3)).join(','),'acc',acc.toFixed(0),'beta',f.beta.toFixed(2),'hip',(sim.py.x-sim.groundY).toFixed(3),'over',sim.over.toFixed(2),'mode',sim.mode,'path',sim.path?sim.path.pts.length:0); }
 p2=p1;p1=c; }
