import { Vector3 } from 'three';
import { makeTerrain } from '../src/terrain.js';
import { RexSim, IDX, DIM } from '../src/rex/body/rex.js';
const T=makeTerrain(7); const dt=1/120;
function run(name, script, secs, seed=3){
  const sim=new RexSim(T,{seed}); sim.over=0; let maxGap=0,gsum=0,gn=0,gbad=0,maxSk=0,maxBend=0,maxBase=0,flight=0,moving=0,maxV=0,falls=[],acts={};
  const a=new Vector3(),b=new Vector3();
  for(let i=0;i<secs*120;i++){ const t=i*dt; sim.step(dt,script(t,sim));
    for(const e of sim.events) if(e.type==='footfall') falls.push(t); sim.events.length=0;
    const sp=sim.spine;
    for(let k=IDX.NECK0;k<IDX.HEAD;k++){ a.subVectors(sp[k].p,sp[k-1].p).normalize(); b.subVectors(sp[k+1].p,sp[k].p).normalize(); maxBend=Math.max(maxBend,Math.acos(Math.min(1,a.dot(b)))); }
    a.subVectors(sp[IDX.HEAD].p,sp[IDX.HEAD-1].p).normalize(); maxSk=Math.max(maxSk,Math.acos(Math.min(1,a.dot(sim.head.f))));
    a.subVectors(sp[IDX.NECK0].p,sp[IDX.CHEST].p).normalize(); maxBase=Math.max(maxBase,Math.acos(Math.min(1,a.dot(sim.chest.f))));
    if(t>2){maxGap=Math.max(maxGap,sim.neckGap); gsum+=sim.neckGap; gn++; if(sim.neckGap>0.15) gbad++;} if(Math.abs(sim.v)>9.5){moving++; if(!sim.feet[0].planted&&!sim.feet[1].planted) flight++;}
    maxV=Math.max(maxV,sim.v); if(sim.act) acts[sim.act.kind]=1;
  }
  const iv=falls.slice(-8).map((t,i,arr)=>i?(t-arr[i-1]).toFixed(2):'').join(' ');
  console.log(`${name}: skull-vs-neck max ${(maxSk*57.3).toFixed(0)}°, neck joint bend max ${(maxBend*57.3).toFixed(0)}°, neck base max ${(maxBase*57.3).toFixed(0)}°, overExt ${sim.over.toFixed(2)}, maxV ${maxV.toFixed(1)}, flight ${(100*flight/Math.max(1,moving)).toFixed(0)}% , gap max ${maxGap.toFixed(2)} mean ${(gsum/gn).toFixed(3)} >15cm ${(100*gbad/gn).toFixed(0)}%, acts ${Object.keys(acts)} last steps ${iv}`);
}
const g=(x,z,id=1)=>({kind:'reach',id,x,z});
run('close goals all around',(t)=>{const k=Math.floor(t/7); const a=k*1.9, d=[2,4,6,3,7,1.5,5][k%7]; return {goal:g(Math.sin(a)*d+ (k>3?8:0),Math.cos(a)*d,k),pace:2.2,attention:null}},70);
run('player orbiting close & fast',(t)=>({goal:null,pace:2,attention:{x:Math.sin(t*0.9)*5,y:T.height(0,0)+1.7+2*Math.sin(t*0.5),z:Math.cos(t*0.9)*5}}),40);
run('player overhead/behind',(t)=>({goal:null,pace:2,faceAttention:false,attention:{x:Math.sin(t*0.4)*3,y:T.height(0,0)+ (t%10<5?9:0.3),z:-4+Math.cos(t*0.4)*3}}),40);
run('sprint',(t)=>({goal:{kind:'drive',throttle:t<14?1:0,steer:0},pace:12,attention:null}),20);
run('stalk',(t)=>({goal:g(0,40),pace:2.2,stalk:true,attention:null}),20);
run('idle 120s',(t)=>({goal:null,pace:2,attention:null}),120,9);
