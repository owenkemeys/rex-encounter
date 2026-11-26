import { makeTerrain } from '../src/terrain.js';
import { RexSim } from '../src/rex/body/rex.js';
const T=makeTerrain(7); const sim=new RexSim(T,{seed:3}); const dt=1/120;
// stimulus appears 150 deg to the left at t=2
const P={x:Math.sin(2.6)*30,y:T.height(0,0)+1,z:Math.cos(2.6)*30};
let out=[];
for(let i=0;i<10*120;i++){const t=i*dt; sim.step(dt,{goal:null,pace:2,attention:t>2?P:null}); sim.events.length=0;
 if(i%30===0&&t>=1.75&&t<7.6) out.push(`t=${t.toFixed(2)} head=${((sim.head.yaw-0)*57.3).toFixed(0)} chest=${(sim.chest.yaw*57.3).toFixed(0)} hips=${(sim.psi*57.3).toFixed(0)} tailTipLat=${(((sim.tail[10].p.x-sim.x)*Math.cos(sim.psi)-(sim.tail[10].p.z-sim.z)*Math.sin(sim.psi))).toFixed(2)} feet=${sim.feet.map(f=>f.planted?'S':'w').join('')}`);}
console.log(out.join('\n'));
// idle
const s2=new RexSim(T,{seed:5}); let o2=[];
for(let i=0;i<40*120;i++){s2.step(dt,{goal:null,pace:2,attention:null}); if(i%360===0) o2.push(`t=${(i*dt).toFixed(0)} breath=${s2.breath.toFixed(2)} sway=${s2.sway.x.toFixed(2)} roll=${(s2.pRoll.x*57.3).toFixed(1)} hipY=${(s2.py.x-s2.groundY).toFixed(3)} headYaw=${(s2.head.yaw*57.3).toFixed(0)} steps=${s2.events.filter(e=>e.type==='footfall').length}`);}
console.log(o2.join('\n'));
