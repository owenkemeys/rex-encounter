import { makeTerrain } from '../src/terrain.js';
import { RexSim, PV } from '../src/rex/body/rex.js';
const T=makeTerrain(7), sim=new RexSim(T,{seed:3}), dt=1/120;
for(let i=0;i<17.2*120;i++){ const t=i*dt; sim.step(dt,{goal:null,pace:2,attention:{x:Math.sin(Math.floor(t/6)*2.4)*20,y:2,z:Math.cos(Math.floor(t/6)*2.4)*20}}); sim.events.length=0;
 if(t>17.0){ const h=sim.head; console.log(t.toFixed(3),'yaw',h.yaw.toFixed(3),'pitch',h.pitch.toFixed(3),'tilt',h.tilt.x.toFixed(3),'u',[h.u.x,h.u.y,h.u.z].map(v=>v.toFixed(3)).join(','),'f',[h.f.x,h.f.y,h.f.z].map(v=>v.toFixed(2)).join(','),'act',sim.act?sim.act.kind:'-'); } }
