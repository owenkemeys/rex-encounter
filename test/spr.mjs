import { RexSim, DIM } from '../src/sim/rex.js';
const flat = {height:()=>0, normal:(x,z,o)=>{o.x=0;o.y=1;o.z=0;return o;}, arena:900, size:1000};
const sim=new RexSim(flat,{seed:3}); const dt=1/120; let rows=[];
for(let i=0;i<16*120;i++){ sim.over=0; sim.step(dt,{goal:{kind:'drive',throttle:1,steer:0},pace:12,attention:null}); sim.events.length=0;
  if(i>12*120&&i<12*120+110&&i%4===0){ const f=sim.feet; const d=k=>((sim.x-f[k].pos.x)*Math.sin(sim.psi)+(sim.z-f[k].pos.z)*Math.cos(sim.psi)).toFixed(2);
   rows.push(`${(i*dt).toFixed(2)} v=${sim.v.toFixed(1)} hip=${sim.py.x.toFixed(2)} L:${f[0].planted?'S':'w'+(f[0].sw.t/f[0].sw.T).toFixed(2)} dF=${d(0)} y=${f[0].pos.y.toFixed(2)} R:${f[1].planted?'S':'w'+(f[1].sw.t/f[1].sw.T).toFixed(2)} dF=${d(1)} y=${f[1].pos.y.toFixed(2)} over=${sim.over.toFixed(2)}`);} }
console.log(rows.join('\n'));
