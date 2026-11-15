import { makeTerrain } from '../src/terrain.js';
import { RexSim, DIM } from '../src/sim/rex.js';
const T = makeTerrain(7);
const flat = {height:()=>0, normal:(x,z,o)=>{o.x=0;o.y=1;o.z=0;return o;}, arena:500, size:1000};
for (const [name,terr,pace] of [['flat walk',flat,2.2],['flat run',flat,8],['hills run',T,8]]){
  const sim=new RexSim(terr,{seed:3}); const dt=1/120; let mn=9,mx=0; sim.over=0; let rows=[];
  for(let i=0;i<14*120;i++){ sim.step(dt,{goal:{kind:'drive',throttle:1,steer:0},pace,attention:null}); sim.events.length=0;
    const hy=sim.py.x-sim.groundY;
    if(i>8*120){ mn=Math.min(mn,hy); mx=Math.max(mx,hy);
      if(i%6===0&&i<8*120+130) rows.push(`${(i*dt).toFixed(2)} hip=${hy.toFixed(2)} L:${sim.feet[0].planted?'S':'w'} dF=${(((sim.x-sim.feet[0].pos.x)*Math.sin(sim.psi)+(sim.z-sim.feet[0].pos.z)*Math.cos(sim.psi))).toFixed(2)} b=${sim.feet[0].beta.toFixed(2)} R:${sim.feet[1].planted?'S':'w'} dF=${(((sim.x-sim.feet[1].pos.x)*Math.sin(sim.psi)+(sim.z-sim.feet[1].pos.z)*Math.cos(sim.psi))).toFixed(2)} b=${sim.feet[1].beta.toFixed(2)} over=${sim.over.toFixed(2)} headY=${(sim.head.pos.y-sim.groundY).toFixed(2)} pitch=${(sim.pPitch.x*57.3).toFixed(1)}`); }
    if(i===8*120) sim.over=0;
  }
  console.log('\n'+name,'hip range',mn.toFixed(2),mx.toFixed(2),'over',sim.over.toFixed(3)); console.log(rows.join('\n'));
}
