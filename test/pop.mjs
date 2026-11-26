import { makeTerrain } from '../src/terrain.js';
import { RexSim, PV } from '../src/rex/body/rex.js';
const T=makeTerrain(7); const sim=new RexSim(T,{seed:3}); const dt=1/120;
const o=(PV.LEG)*3; let prev=null;
for(let i=0;i<4*120;i++){ const t=i*dt; sim.step(dt,{goal:{kind:'reach',id:1,x:10,z:40},pace:2.2,attention:null}); sim.events.length=0;
  const v=sim.pose.v, f=sim.feet[0];
  const row=`${t.toFixed(3)} ${f.planted?'S':'w'+(f.sw.t/f.sw.T).toFixed(3)} beta=${f.beta.toFixed(3)} pitch=${f.pitch.toFixed(3)} mtp=(${v[o+9].toFixed(3)},${v[o+10].toFixed(3)},${v[o+11].toFixed(3)}) toeF=(${v[o+12].toFixed(3)},${v[o+13].toFixed(3)},${v[o+14].toFixed(3)}) ankle.y=${v[o+7].toFixed(3)} knee=(${v[o+3].toFixed(2)},${v[o+4].toFixed(2)},${v[o+5].toFixed(2)})`;
  if(t>2.05&&t<2.2) console.log(row);
}
