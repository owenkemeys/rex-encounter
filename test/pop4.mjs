import { makeTerrain } from '../src/terrain.js';
import { RexSim, PV, DIM } from '../src/rex/body/rex.js';
const T=makeTerrain(7), sim=new RexSim(T,{seed:3}), dt=1/120, g=(x,z,id)=>({kind:'reach',id,x,z});
const o=(PV.LEG+6)*3;
for(let i=0;i<12.96*120;i++){ const t=i*dt; const k=Math.floor(t/9), a=k*2.3; sim.step(dt,{goal:g(Math.sin(a)*(8+k*3),Math.cos(a)*(8+k*3),k),pace:2.2,attention:null}); sim.events.length=0;
 const v=sim.pose.v, f=sim.feet[1];
 if(t>12.4 && i%3==0){ const hip=[v[o],v[o+1],v[o+2]], ank=[v[o+6],v[o+7],v[o+8]]; const tgt=f.planted?f.pos:f.sw.p1;
  console.log(t.toFixed(3), f.planted?'S':'w'+(f.sw.t/f.sw.T).toFixed(2), 'hip-ank', Math.hypot(hip[0]-ank[0],hip[1]-ank[1],hip[2]-ank[2]).toFixed(2), 'hip->target horiz', Math.hypot(hip[0]-tgt.x,hip[2]-tgt.z).toFixed(2),'vert',(hip[1]-tgt.y).toFixed(2), 'v',sim.v.toFixed(2),'om',sim.om.toFixed(2),'psi',sim.psi.toFixed(2),'yawFoot',f.yaw.toFixed(2)); }
}
