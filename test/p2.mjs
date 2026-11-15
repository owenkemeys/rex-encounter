import { makeTerrain } from '../src/terrain.js';
import { RexSim } from '../src/sim/rex.js';
const T=makeTerrain(7); const sim=new RexSim(T,{seed:3}); const dt=1/120;
for(let i=0;i<5*120;i++){ if(i===240) sim.shove(2.6,0); sim.step(dt,{goal:null,pace:2.2,attention:null});
 for(const e of sim.events) if(e.type!=='liftoff') console.log((i*dt).toFixed(2),e.type); sim.events.length=0;
 if(i>=240&&i<400&&i%20===0) console.log((i*dt).toFixed(2),'x',sim.x.toFixed(2),'need',sim.feet.map(f=>f.need.toFixed(2)+(f.planted?'S':'w')).join(' '),'pre',!!sim.pre,'psi',sim.psi.toFixed(2));}
