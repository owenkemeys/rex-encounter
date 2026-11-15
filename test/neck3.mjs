import { RexSim, IDX } from '../src/sim/rex.js';
const flat = {height:()=>0, normal:(x,z,o)=>{o.x=0;o.y=1;o.z=0;return o;}, arena:500, size:1000};
const sim=new RexSim(flat,{seed:3}); let mg=0;
for(let i=0;i<1200;i++){ sim.step(1/120,{goal:null,pace:2,attention:{x:Math.sin(i/200)*20,y:4,z:30}}); mg=Math.max(mg,sim.neckGap); }
console.log('max gap',mg.toFixed(3)); for(let k=18;k<=25;k++) console.log(k,sim.spine[k].p.toArray().map(v=>v.toFixed(2)).join(','));
console.log('head',sim.head.pos.toArray().map(v=>v.toFixed(2)).join(','),'f',sim.head.f.toArray().map(v=>v.toFixed(2)).join(','));
