import { makeTerrain } from '../src/terrain.js';
import { RexSim, PV } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
const T=makeTerrain(7), sim=new RexSim(T,{seed:7}), mind=new Mind(sim,7), dt=1/120;
const me={id:'you',x:6,y:0,z:26,vx:0,vz:0,speed:0,crouch:false,fx:0,fz:-1};
const o=(PV.LEG+6)*3;
for(let i=0;i<79.2*120;i++){ const t=i*dt; const px=me.x,pz=me.z;
 if(t>20&&t<40){me.x+=Math.sin(t*0.3)*0.02;me.z-=0.012;} if(t>70&&t<78){me.x+=0.045;me.z+=0.02;}
 me.y=T.height(me.x,me.z)+1.7; me.vx=(me.x-px)*120; me.vz=(me.z-pz)*120; me.speed=Math.hypot(me.vx,me.vz);
 const I=mind.step(dt,{agents:[me],noises:t>50&&t<50.01?[{x:me.x-20,y:0,z:me.z,loud:0.4,kind:'stone'}]:[],light:0.8,flash:false,wind:{x:0,z:-3}}); sim.step(dt,I); sim.events.length=0;
 if(t>79.05){ const v=sim.pose.v,f=sim.feet[1]; console.log(t.toFixed(3),f.planted?'S':'w'+(f.sw.t/f.sw.T).toFixed(2),'knee',[v[o+3],v[o+4],v[o+5]].map(x=>x.toFixed(3)).join(','),'ankle',[v[o+6],v[o+7],v[o+8]].map(x=>x.toFixed(3)).join(','),'hipY',v[o+1].toFixed(3),'freeze',sim.freeze,'rate',f.sw?f.sw.rate?.toFixed(2):'-','beh',mind.label); } }
