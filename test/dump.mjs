// Dump a scenario's motion for the film/trace renderer: node test/dump.mjs <scenario> <secs> <out.json>
import { makeTerrain } from '../src/terrain.js';
import { RexSim, IDX, PV, SPINE_N } from '../src/rex/body/rex.js';
import fs from 'fs';
const T=makeTerrain(7); const g=(x,z,id=1)=>({kind:'reach',id,x,z});
const st={};
const SC={
 turnplace:t=>({goal:null,pace:2,attention:{x:Math.sin(Math.floor(t/5)*2.4)*20,y:2,z:Math.cos(Math.floor(t/5)*2.4)*20}}),
 walk:t=>({goal:{kind:'drive',throttle:1,steer:0},pace:2.2,attention:null}),
 jog:t=>({goal:{kind:'drive',throttle:1,steer:0},pace:4.5,attention:null}),
 run:t=>({goal:{kind:'drive',throttle:1,steer:0},pace:8,attention:null}),
 sprint:t=>({goal:{kind:'drive',throttle:1,steer:0},pace:12,attention:null}),
 stalk:t=>({goal:{kind:'drive',throttle:1,steer:0},pace:2.2,stalk:true,attention:null}),
 stalkfreeze:t=>({goal:{kind:'drive',throttle:1,steer:0},pace:1.3,stalk:true,freeze:(t%4)>2.6,attention:null}),
 startstop:t=>({goal:{kind:'drive',throttle:t>1&&t<7?1:0,steer:0},pace:t<4?2.2:8,attention:null}),
 reach:t=>({goal:t>1?g(4,24):null,pace:2.2,attention:null}),
 behind:t=>({goal:t>1?g(-6,-22):null,pace:2.2,attention:null}),
 noise:t=>({goal:null,pace:2.2,attention:t>1?{x:-18,y:T.height(-18,-14)+1,z:-14}:null}),
 idle:t=>({goal:null,pace:2.2,attention:null}),
 watch:t=>({goal:null,pace:2.2,attention:{x:Math.sin(t*0.35)*11,y:T.height(0,0)+1.7,z:Math.cos(t*0.35)*11}}),
 weave:t=>({goal:{kind:'drive',throttle:1,steer:Math.sin(t*0.9)},pace:4.6,attention:null}),
 roar:(t,s)=>{ if(t>1.5&&!st.r){st.r=1;s.roar();} return {goal:null,pace:2,attention:{x:10,y:T.height(10,14)+1.7,z:14}}; },
 startle:(t,s)=>{ if(t>2.0&&!st.st){st.st=1;s.gesture('startle',{x:s.x+8,y:2,z:s.z+14});} return {goal:null,pace:2,noIdle:true,look:t>2.15?{x:s.x+8,y:2,z:s.z+14,lock:true}:undefined,alert:t>2.1?1:0,breathHold:t>2.1?1:0}; },
 shove:(t,s)=>{ if(t>1.5&&!st.s){st.s=1;s.shove(2.8,0);} return {goal:null,pace:2,attention:null}; },
 ridge:(t,s)=>{ if(t>0.5&&!st.b){st.b=1; for(let k=-3;k<=3;k++) T.addBump(s.x+k*2.4,s.z+11,1.1,2.4);} return {goal:{kind:'drive',throttle:1,steer:0},pace:2.2,attention:null}; },
 lure:t=>({goal:{kind:'reach',id:5,x:Math.sin(t*0.5)*9,z:9+Math.cos(t*0.37)*7},pace:2.2,attention:null}),
 come:t=>({goal:t>1?g(0,23.4):null,pace:2.2,attention:{x:0,y:T.height(0,28)+1.7,z:28}}),
 turn120:t=>({goal:t>0.5?{kind:'face',x:Math.sin(2.094)*40,z:Math.cos(2.094)*40}:null,pace:2,attention:null,faceAttention:false}),
 walk90:(t,s)=>{ if(t>1&&st.p0===undefined) st.p0=s.psi; if(st.p0!==undefined&&Math.abs(s.psi-st.p0)>=Math.PI/2-0.15) st.done=1; return {goal:{kind:'drive',throttle:1,steer:t>1&&!st.done?1:0},pace:2.2,attention:null}; },
};
const [,, name='walk', secs='6', out='out/dump.json', warm='0', seed='3']=process.argv;
const sim=new RexSim(T,{seed:+seed}); const dt=1/120, fn=SC[name]; const frames=[];
const W=+warm*120;
for(let i=0;i<W+ +secs*120;i++){ const t=i*dt; sim.step(dt,fn(t,sim)); sim.events.length=0;
  if(i>=W){ const v=sim.pose.v; frames.push({t:+(t-+warm).toFixed(4), x:sim.x,z:sim.z,psi:sim.psi,gy:sim.groundY,v:sim.v, p:Array.from(v.subarray(0,SPINE_N*3),n=>+n.toFixed(3)), h:[...v.subarray(PV.HEAD_P*3,PV.HEAD_P*3+9)].map(n=>+n.toFixed(3)), l:[...v.subarray(PV.LEG*3,PV.LEG*3+36)].map(n=>+n.toFixed(3)), a:[...v.subarray(PV.ARM*3,PV.ARM*3+18)].map(n=>+n.toFixed(3)), jaw:+sim.pose.s[0].toFixed(3), pl:[sim.feet[0].planted?1:0,sim.feet[1].planted?1:0], fix:[sim.fix.x,sim.fix.y,sim.fix.z].map(n=>+n.toFixed(2)), mode:sim.mode,
     gl:[-8,-6,-4,-2,0,2,4,6,8,10].map(d=>+T.height(sim.x+Math.sin(sim.psi)*d,sim.z+Math.cos(sim.psi)*d).toFixed(3)) }); }
}
fs.writeFileSync(out,JSON.stringify({name,IDX,frames}));
