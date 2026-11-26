import { makeTerrain } from '../src/terrain.js';
import { RexSim } from '../src/rex/body/rex.js';
const T=makeTerrain(7); const sim=new RexSim(T,{seed:3}); const dt=1/120;
for(let i=0;i<14.3*120;i++){ const t=i*dt; sim.over=0; sim.step(dt,{goal:{kind:'drive',throttle:t<12?1:0,steer:t>6&&t<9?0.6:0},pace:12,attention:null}); sim.events.length=0;
 if(t>12.9&&i%6===0){ const f=sim.feet, d=k=>((sim.x-f[k].pos.x)*Math.sin(sim.psi)+(sim.z-f[k].pos.z)*Math.cos(sim.psi)).toFixed(2);
  console.log(t.toFixed(2),'v',sim.v.toFixed(1),'acc',sim.acc.toFixed(1),'hip',(sim.py.x-sim.groundY).toFixed(2),'gY-terr',(sim.groundY-T.height(sim.x,sim.z)).toFixed(2),'L',f[0].planted?'S':'w'+(f[0].sw.t/f[0].sw.T).toFixed(2),d(0),'need',f[0].need.toFixed(2),'R',f[1].planted?'S':'w'+(f[1].sw.t/f[1].sw.T).toFixed(2),d(1),'need',f[1].need.toFixed(2),'over',sim.over.toFixed(2),'slope',sim.slope.toFixed(2)); } }
