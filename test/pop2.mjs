import { makeTerrain } from '../src/terrain.js';
import { RexSim, PV, IDX } from '../src/rex/body/rex.js';
const T=makeTerrain(7); const sim=new RexSim(T,{seed:3}); const dt=1/120; let p1,p2,n=0;
for(let i=0;i<9*120;i++){ const t=i*dt; sim.step(dt,{goal:{kind:'drive',throttle:1,steer:Math.sin(t*0.7)*0.8},pace:4.5,attention:null}); sim.events.length=0;
  const c=[sim.py.x,sim.pPitch.x,sim.pRoll.x,sim.pYaw.x,sim.sway.x,sim.x,sim.z,sim.psi,sim.tail[12].p.y,sim.tail[12].p.x,sim.groundY];
  if(p2){ const acc=c.map((v,k)=>Math.abs(v-2*p1[k]+p2[k])/(dt*dt)); const names=['py','pitch','roll','yaw','sway','x','z','psi','tipY','tipX','gY']; const bad=acc.map((a,k)=>a>150?names[k]+'='+a.toFixed(0):'').filter(Boolean); if(bad.length&&n++<12) console.log(t.toFixed(3),sim.mode,bad.join(' '),'feet',sim.feet.map(f=>f.planted?'S':'w'+(f.sw.t/f.sw.T).toFixed(2)).join(' ')); }
  p2=p1;p1=c; }
