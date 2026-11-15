import { makeTerrain } from '../src/terrain.js';
import { RexSim, DIM } from '../src/sim/rex.js';
const T = makeTerrain(7);
function run(name, script, secs){
  const sim = new RexSim(T,{x:0,z:0,yaw:0,seed:3});
  const dt=1/120; const falls=[]; let maxV=0, minY=9,maxY=0, maxBeta=0, slip=0;
  const last=[null,null]; sim.over=0;
  const log=[];
  for(let i=0;i<secs*120;i++){
    const t=i*dt; const intent=script(t,sim);
    const before=sim.feet.map(f=>f.planted?f.pos.clone():null);
    sim.step(dt,intent);
    sim.feet.forEach((f,k)=>{ if(f.planted&&before[k]) slip=Math.max(slip,f.pos.distanceTo(before[k])); maxBeta=Math.max(maxBeta,f.beta);});
    for(const e of sim.events){ if(e.type==='footfall') falls.push({t:+t.toFixed(3),f:e.foot,x:e.x,z:e.z,i:+e.intensity.toFixed(2)}); if(e.type==='arrived') log.push('arrived@'+t.toFixed(2)); }
    sim.events.length=0;
    maxV=Math.max(maxV,Math.abs(sim.v)); const hy=sim.py.x-sim.groundY; minY=Math.min(minY,hy); maxY=Math.max(maxY,hy);
    if(i%120===0) log.push(`t=${t.toFixed(0)} v=${sim.v.toFixed(2)} om=${sim.om.toFixed(2)} psi=${(sim.psi*57.3).toFixed(0)} pos=(${sim.x.toFixed(1)},${sim.z.toFixed(1)}) mode=${sim.mode} hipH=${hy.toFixed(2)} headY=${(sim.head.pos.y-sim.groundY).toFixed(2)} att=${sim.att.kind} low=${sim.lowness.toFixed(2)}`);
  }
  console.log('\n== '+name); console.log(log.join('\n'));
  const iv=[]; for(let i=1;i<falls.length;i++) iv.push(+(falls[i].t-falls[i-1].t).toFixed(2));
  const sl=[]; for(let i=1;i<falls.length;i++) sl.push(+Math.hypot(falls[i].x-falls[i-1].x,falls[i].z-falls[i-1].z).toFixed(2));
  console.log('footfalls',falls.length,'sides',falls.map(f=>f.f).join(''));
  console.log('intervals',iv.join(' ')); console.log('steplen',sl.join(' '));
  console.log(`maxV=${maxV.toFixed(2)} hipH=[${minY.toFixed(2)},${maxY.toFixed(2)}] maxHeelLift=${maxBeta.toFixed(2)} overExt=${sim.over.toFixed(3)} slip=${slip.toFixed(4)} refix=${sim.refixCount}`);
  return sim;
}
const P={x:6,y:0,z:-20}; P.y=T.height(P.x,P.z)+1.7;
run('walk to 40m ahead',(t)=>({goal:{kind:'reach',id:1,x:0,z:45},pace:2.2,attention:P}),32);
run('run to 80m',(t)=>({goal:{kind:'reach',id:1,x:10,z:85},pace:8,attention:P}),24);
run('target behind (pivot then walk)',(t)=>({goal:{kind:'reach',id:1,x:3,z:-30},pace:2.2,attention:null}),26);
run('run then click behind',(t)=>({goal:t<8?{kind:'reach',id:1,x:0,z:90}:{kind:'reach',id:2,x:-20,z:0},pace:8,attention:null}),30);
run('idle watching player circling',(t)=>({goal:null,pace:2,attention:{x:Math.sin(t*0.25)*14,y:T.height(0,0)+1.7,z:Math.cos(t*0.25)*14}}),30);
run('drive: throttle + steer',(t)=>({goal:{kind:'drive',throttle:t<12?1:0,steer:t>4&&t<9?1:0},pace:5,attention:null}),18);
run('too close target',(t)=>({goal:{kind:'reach',id:1,x:0.5,z:2.5},pace:2.2,attention:null}),16);
