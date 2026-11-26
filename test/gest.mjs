import { makeTerrain } from '../src/terrain.js';
import { RexSim } from '../src/rex/body/rex.js';
const T=makeTerrain(7); const sim=new RexSim(T,{seed:3}); const dt=1/120; const ev={};
const P={x:2,y:T.height(2,12)+1.7,z:12};
for(let i=0;i<20*120;i++){ const t=i*dt;
  if(i===120) sim.gesture('huff'); if(i===360) sim.gesture('growl'); if(i===720) sim.gesture('snap',P); if(i===960) sim.gesture('tilt'); if(i===1200) sim.gesture('shake'); if(i===1500) sim.gesture('stomp');
  sim.step(dt,{goal: t>15?{kind:'approach',id:3,x:P.x,z:P.z,stop:9}:t>12?{kind:'face',x:-20,z:0,offset:1.5}:null,pace:2,look:P,lock:true,alert:t>2.5&&t<5?1:0,display:t>5&&t<9?1:0,agitation:t>5&&t<11?1:0,breathHold:t>2.5&&t<5?1:0,noIdle:true});
  for(const e of sim.events) ev[e.type]=(ev[e.type]||0)+1; sim.events.length=0;
  if(i%120===0) console.log(t.toFixed(0),sim.mode,'jaw',sim.pose.s[0].toFixed(2),'headY',(sim.head.pos.y-sim.groundY).toFixed(2),'psi',(sim.psi*57).toFixed(0),'act',sim.act?sim.act.kind:'-');
}
console.log(ev);
