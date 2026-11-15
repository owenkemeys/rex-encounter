import { RexSim } from '../src/sim/rex.js';
import { buildRexGeometry } from '../src/view/rexgeo.js';
import fs from 'fs';
const flat = {height:()=>0, normal:(x,z,o)=>{o.x=0;o.y=1;o.z=0;return o;}, arena:500, size:1000, addBump(){}, bumps:[]};
const sim = new RexSim(flat,{x:0,z:0,yaw:0,seed:1});
const g = buildRexGeometry(sim.pose, {cell: +(process.argv[2]||0.04)});
console.log(g.stats);
// write an OBJ for a quick look
if(process.argv[3]){ let s=''; for(let i=0;i<g.position.length;i+=3) s+=`v ${g.position[i]} ${g.position[i+1]} ${g.position[i+2]}\n`; for(let i=0;i<g.index.length;i+=3) s+=`f ${g.index[i]+1} ${g.index[i+1]+1} ${g.index[i+2]+1}\n`; fs.writeFileSync(process.argv[3],s); }
