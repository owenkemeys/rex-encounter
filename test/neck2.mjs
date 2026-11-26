import { RexSim, IDX } from '../src/rex/body/rex.js';
const flat = {height:()=>0, normal:(x,z,o)=>{o.x=0;o.y=1;o.z=0;return o;}, arena:500, size:1000};
const sim=new RexSim(flat,{seed:3});
for(let i=0;i<240;i++) sim.step(1/120,{goal:null,pace:2,attention:{x:0,y:4,z:60}});
console.log('chest',sim.nb.toArray().map(v=>v.toFixed(2)).join(','),'cf',sim.chest.f.toArray().map(v=>v.toFixed(2)).join(','));
for(let k=IDX.NECK0;k<=IDX.HEAD;k++) console.log(k,sim.spine[k].p.toArray().map(v=>v.toFixed(2)).join(','));
console.log('head',sim.head.pos.toArray().map(v=>v.toFixed(2)).join(','),'f',sim.head.f.toArray().map(v=>v.toFixed(2)).join(','),'goal',sim.head.goal.toArray().map(v=>v.toFixed(2)).join(','),'neckEnd',sim.neckEnd.toArray().map(v=>v.toFixed(2)).join(','));
