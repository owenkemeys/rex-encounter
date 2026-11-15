// Automatic reviewer: runs scenarios and reports discontinuities ("pops"), penetrations and joint violations.
import { Vector3 } from 'three';
import { makeTerrain } from '../src/terrain.js';
import { RexSim, IDX, DIM, PV, LEG, SPINE_N, PS } from '../src/sim/rex.js';
import { TYRANNOSAURUS } from '../src/species/tyrannosaurus.js';
import { fidgetWatch } from './fidget.mjs';
const TOES = TYRANNOSAURUS.foot ? TYRANNOSAURUS.foot.toes : [0.56, 0.7, 0.56], TOE_R = 0.12 * (TYRANNOSAURUS.foot ? TYRANNOSAURUS.foot.flesh : 1);
// the toes of one foot as segments (MTP, joint, tip per digit), the skin's toe math (view/rexgeo.js)
function toePts(v, s, k) { const o = (PV.LEG + k * 6) * 3, M = [v[o + 9], v[o + 10], v[o + 11]], f = [v[o + 12], v[o + 13], v[o + 14]], u = [v[o + 15], v[o + 16], v[o + 17]], n = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
  const tf = n(f), tu = n(u), tl = n([tu[1] * tf[2] - tu[2] * tf[1], tu[2] * tf[0] - tu[0] * tf[2], tu[0] * tf[1] - tu[1] * tf[0]]), sg = k ? -1 : 1, fan = s[PS.SPREAD + k], out = [];
  for (let d = 0; d < 3; d++) { const a = (d - 1) * fan * -sg, g = tf.map((x, i) => x * Math.cos(a) + tl[i] * Math.sin(a)), cp = s[PS.TOE + k * 6 + d], cd = s[PS.TOE + k * 6 + 3 + d];
    const g1 = g.map((x, i) => x * Math.cos(cp) - tu[i] * Math.sin(cp)), u1 = tu.map((x, i) => x * Math.cos(cp) + g[i] * Math.sin(cp)), J = M.map((x, i) => x + g1[i] * TOES[d] / 2), g2 = g1.map((x, i) => x * Math.cos(cd) - u1[i] * Math.sin(cd)), Tp = J.map((x, i) => x + g2[i] * TOES[d] / 2);
    out.push([M, J], [J, Tp]); } return out; }
function segSeg(a, b) { let m = 9; for (let i = 0; i <= 6; i++) { const u = i / 6, p = a[0].map((x, q) => x + (a[1][q] - x) * u), d = b[1].map((x, q) => x - b[0][q]), l2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2 || 1e-9, w = Math.max(0, Math.min(1, ((p[0] - b[0][0]) * d[0] + (p[1] - b[0][1]) * d[1] + (p[2] - b[0][2]) * d[2]) / l2)); m = Math.min(m, Math.hypot(p[0] - b[0][0] - d[0] * w, p[1] - b[0][1] - d[1] * w, p[2] - b[0][2] - d[2] * w)); } return m; }
const dt=1/120, SLIDE_TOL=1.0, HANG_TOL=0.8, TIC_SP=0.06, TIC_FL=0.1;      // TIC_*: toe tic check (rad)
// least distance between segments v[a0..a1] and v[b0..b1] (flat pose array offsets), by sampling one and projecting on the other
function segDist(v,a0,a1,b0,b1){ let m=9; const bx=v[b1]-v[b0],by=v[b1+1]-v[b0+1],bz=v[b1+2]-v[b0+2],l2=bx*bx+by*by+bz*bz||1e-9;
  for(let i=0;i<=8;i++){ const u=i/8, px=v[a0]+(v[a1]-v[a0])*u, py=v[a0+1]+(v[a1+1]-v[a0+1])*u, pz=v[a0+2]+(v[a1+2]-v[a0+2])*u;
    const w=Math.max(0,Math.min(1,((px-v[b0])*bx+(py-v[b0+1])*by+(pz-v[b0+2])*bz)/l2)); m=Math.min(m,Math.hypot(px-v[b0]-bx*w,py-v[b0+1]-by*w,pz-v[b0+2]-bz*w)); } return m; }
const NAMES=i=>(i>=PV.SU&&i<PV.SU+SPINE_N)?'up'+(i-PV.SU):i<=IDX.TAIL_BASE?'tail'+i:i===IDX.PELVIS?'pelvis':i<=IDX.CHEST?'back'+(i-IDX.PELVIS):i<SPINE_N?'neck'+(i-IDX.CHEST):i===PV.HEAD_P?'headP':i===PV.HEAD_F?'headF':i===PV.HEAD_U?'headU':i<PV.ARM?['hip','knee','ankle','mtp','toeF','toeU'][(i-PV.LEG)%6]+((i-PV.LEG)/6|0):'arm'+(i-PV.ARM);
export function review(name, script, secs, {seed=3, terrain=makeTerrain(7), quiet=false}={}){
  const sim=new RexSim(terrain,{seed}); sim.over=0;
  const n=sim.pose.v.length/3; let p1=null,p2=null; const pops=[]; const issues={};
  const add=(k,v,t)=>{ const e=issues[k]||(issues[k]={n:0,max:0,t:0,ep:0,last:-9}); e.n++; if(t-e.last>0.6) e.ep++; e.last=t; if(v>e.max){e.max=v;e.t=t;} };
  const a=new Vector3(),b=new Vector3(),c=new Vector3(); const SL={d:0,x:sim.x,z:sim.z,r:0}, HG=[0,0], TB=[[],[]];
  const FW=fidgetWatch(sim);
  for(let i=0;i<secs*120;i++){ const t=i*dt; const intent=script(t,sim); sim.step(dt,intent); FW.tick(t); sim.events.length=0;
    const v=sim.pose.v; const cur=Float32Array.from(v);
    if(p2&&t>0.5){ // acceleration spike per slot (position slots in m/s^2; direction slots in 1/s^2)
      for(let j=0;j<n;j++){ const o=j*3; const ax=(cur[o]-2*p1[o]+p2[o]),ay=(cur[o+1]-2*p1[o+1]+p2[o+1]),az=(cur[o+2]-2*p1[o+2]+p2[o+2]); const acc=Math.hypot(ax,ay,az)/(dt*dt);
        const isDir=(j>=PV.SU&&j<PV.SU+SPINE_N)||j===PV.HEAD_F||j===PV.HEAD_U||((j>=PV.LEG&&j<PV.ARM)&&((j-PV.LEG)%6>=4));
        const lim=isDir?260:(j>=PV.LEG&&j<PV.ARM?900:330);
        if(acc>lim) pops.push({t,j,acc,mode:sim.mode}); } }
    p2=p1; p1=cur;
    // penetrations
    const T=terrain;
    for(let j=0;j<SPINE_N;j++){ const y=v[j*3+1]-T.height(v[j*3],v[j*3+2]); if(y<0.02) add('spine joint under ground '+NAMES(j),-y+0.02,t); }
    for(let k=0;k<2;k++){ const o=(PV.LEG+k*6)*3; for(const [nm,off] of [['knee',1],['ankle',2],['mtp',3]]){ const y=v[o+off*3+1]-T.height(v[o+off*3],v[o+off*3+2]); if(y<-0.02) add(nm+' under ground',-y,t); }
      // knee must bend forward: knee ahead of hip-ankle line along body forward
      a.fromArray(v,o); b.fromArray(v,o+3); c.fromArray(v,o+6); const mid=a.clone().add(c).multiplyScalar(0.5); const f=b.sub(mid).dot(sim.pf); if(f<-0.02) add('knee bends backward',-f,t);
      // toes pointing: toeF vs body forward (foot twisted)
      a.fromArray(v,o+12); a.y=0; a.normalize(); const tw=Math.acos(Math.max(-1,Math.min(1,a.x*Math.sin(sim.psi)+a.z*Math.cos(sim.psi)))); if(tw>0.8&&sim.feet[k].planted) add('foot twisted vs body (rad)',tw,t);
    }
    // legs crossing: the two ankles side by side (fore-aft within 0.5 m) but on swapped sides of each other in the body's frame.
    // (It used to flag any ankle gap under 0.42 m; on the narrow track that fired at every pass with the shins 0.42-0.76 m apart
    // in 3D and never once crossed: out/skel/BODYFIX.md. Contact itself is the 3D check below.)
    { const o0=(PV.LEG+2)*3,o1=(PV.LEG+6+2)*3; const dx=v[o0]-v[o1],dz=v[o0+2]-v[o1+2]; const lat=dx*Math.cos(sim.psi)-dz*Math.sin(sim.psi), fa=dx*Math.sin(sim.psi)+dz*Math.cos(sim.psi); if(Math.abs(fa)<0.5&&lat<0) add('ankles crossed (m)',-lat,t); }
    // shanks touching: least 3D distance between the two lower legs (knee-ankle and ankle-mtp segments of each), against the skin's
    // radii there (shin ~0.15-0.2, metatarsus ~0.13, ankle knob 0.17); unlike the lateral check above it does not depend on the
    // body's heading, so feet a step apart on a narrow track are not counted
    { const seg=(k,j)=>[(PV.LEG+k*6+j)*3,(PV.LEG+k*6+j+1)*3]; let dmin=9;
      for(const j0 of [1,2]) for(const j1 of [1,2]){ const [a0,a1]=seg(0,j0),[b0,b1]=seg(1,j1); dmin=Math.min(dmin,segDist(v,a0,a1,b0,b1)); }
      if(dmin<0.3) add('shanks touch (3D gap m)',0.3-dmin,t); }
    // toes of one foot in the other: least distance between any toe segments of the two feet against twice the toe's flesh radius
    { const A=toePts(v,sim.pose.s,0), B=toePts(v,sim.pose.s,1); let dm=9; for(const a of A) for(const b of B) dm=Math.min(dm,segSeg(a,b)); if(dm<2*TOE_R) add('toes of the two feet touch (gap m)',2*TOE_R-dm,t); }
    // head vs own body: snout tip distance to back/chest joints
    { const h=sim.spine[IDX.HEAD].p; a.copy(h).addScaledVector(sim.head.f,1.3); for(let j=IDX.PELVIS;j<=IDX.CHEST+1;j++){ const d=a.distanceTo(sim.spine[j].p); if(d<0.95) add('snout inside torso',0.95-d,t);} for(let k=0;k<2;k++){ b.fromArray(v,(PV.LEG+k*6+1)*3); if(a.distanceTo(b)<0.5) add('snout inside knee',1,t);} 
      const snY=a.y-T.height(a.x,a.z); if(snY<0.0) add('snout under ground',-snY,t);
      // skull back vs neck: angle
      b.subVectors(sim.spine[IDX.HEAD].p,sim.spine[IDX.HEAD-1].p).normalize(); const sk=Math.acos(Math.min(1,b.dot(sim.head.f))); if(sk>1.2) add('skull vs neck angle',sk,t);
      // head roll sanity
      { const roll=Math.abs(Math.asin(Math.max(-1,Math.min(1,sim.head.l.y)))); if(roll>0.45) add('head rolled (rad)',roll,t); if(sim.head.pos.distanceTo(sim.chest.p)<1.05) add('skull folded onto chest',1,t);} for(let j=IDX.NECK0;j<IDX.HEAD;j++){ a.subVectors(sim.spine[j].p,sim.spine[j-1].p).normalize(); b.subVectors(sim.spine[j+1].p,sim.spine[j].p).normalize(); const an=Math.acos(Math.min(1,a.dot(b))); if(an>0.62) add('neck joint bend >35deg',an,t); }
      // neck stretch: head pose requested vs achieved
      if(sim.neckGap>0.6) add('head goal unreachable gap',sim.neckGap,t); }
    // spine kinks (back & tail)
    for(let j=1;j<IDX.CHEST;j++){ a.subVectors(sim.spine[j].p,sim.spine[j-1].p).normalize(); b.subVectors(sim.spine[j+1].p,sim.spine[j].p).normalize(); const an=Math.acos(Math.min(1,a.dot(b))); if(an>0.5) add('kink at '+NAMES(j),an,t); }
    // the body moving over the ground with no step: horizontal hip travel while no foot is stepping (no foot in a swing that is
    // going forward; a foot held still in the air is not stepping). Only double support, a short stretch in a walk, moves the
    // hips with both feet down; past SLIDE_TOL a foot is held or stuck while the body slides over the ground
    { const stepping=sim.feet.some(f=>!f.planted&&f.sw&&(f.sw.rate??1)>0.5); if(stepping) SL.d=0; else SL.d+=Math.hypot(sim.x-SL.x,sim.z-SL.z);
      SL.x=sim.x; SL.z=sim.z; SL.r=Math.max(SL.r,SL.d); if(SL.d>SLIDE_TOL) add('hips slide with no step (m)',SL.d-SLIDE_TOL,t); }
    // a foot left hanging: off the ground for longer than HANG_TOL while the hips are (nearly) still, in any behaviour (watching,
    // freeze, stalk, listening, feeding...). A step in place takes ~0.5 s; a held foot is the glitch (owner report, BODYFIX2.md)
    for(let k=0;k<2;k++){ const f=sim.feet[k]; if(!f.planted&&Math.abs(sim.v)<0.3&&Math.hypot(sim.ux,sim.uz)<0.15) HG[k]+=dt; else HG[k]=0; if(HG[k]>HANG_TOL) add('foot hanging while still (s)',HG[k],t); }
    // toe tic: a standing animal's planted toes stay spread and still. Each tick keeps every foot's splay and toe angles; half a
    // second later, if that foot stayed planted all along and the body was standing at the start, a splay change of more than
    // TIC_SP rad or a toe flexion change of more than TIC_FL rad inside the window is one tic tick (owner: toes unsplaying as
    // if to lift, then the foot stays down). A foot counts as planted from 0.4 s after it lands (the toes taking the weight as it
    // comes down is the landing, not a tic)
    for(let k=0;k<2;k++){ const f=sim.feet[k], q=TB[k]; const fl=f.toeOut?Array.from(f.toeOut):[0,0,0,0,0,0];
      q.push({t,pl:f.planted&&!f.jerk&&t-f.tLand>0.4,st:Math.abs(sim.v)<0.3&&Math.hypot(sim.ux,sim.uz)<0.15,sp:f.spread.x,fl});
      if(q.length>60){ const w=q.shift(); if(w.st&&w.pl&&q.every(e=>e.pl)){ let dsp=0,dfl=0; for(const e of q){ dsp=Math.max(dsp,Math.abs(e.sp-w.sp)); for(let d=0;d<6;d++) dfl=Math.max(dfl,Math.abs(e.fl[d]-w.fl[d])); }
        if(dsp>TIC_SP) add('toe splay changes on a planted standing foot (rad)',dsp,w.t); if(dfl>TIC_FL) add('toe flexion changes on a planted standing foot (rad)',dfl,w.t); } } }
    if(sim.over>0.08){ add('leg over-extended (m)',sim.over,t); } sim.over=0;
    const hip=sim.py.x-sim.groundY; if(hip<2.2) add('hips very low',2.2-hip,t);
    if(Math.abs(sim.pRoll.x)>0.3) add('roll > 17deg',Math.abs(sim.pRoll.x),t);
  }
  // fidget steps (BODY4, owner: "one leg lifting off the floor repeatedly for no good reason"): a standing lift-off after which
  // the hips moved < 0.25 m and turned < 0.12 rad in 1.5 s, by the same foot as another such within 3.5 s (one settling step
  // after a stop or turn is normal; the same foot again and again is the fault)
  for(let q=0;q<FW.list.length;q++){ const L=FW.list[q]; if(FW.list.some((P,j)=>j<q&&P.foot===L.foot&&L.t-P.t<3.5)) add('same foot lifted again with no move or turn (fidget step)',1,L.t); }
  // summarise pops by cluster
  const cl=[]; for(const p of pops){ const last=cl[cl.length-1]; if(last&&p.t-last.t1<0.05){ last.t1=p.t; if(p.acc>last.acc){last.acc=p.acc;last.j=p.j;} last.js.add(NAMES(p.j)); } else cl.push({t0:p.t,t1:p.t,acc:p.acc,j:p.j,mode:p.mode,js:new Set([NAMES(p.j)])}); }
  const out=[`== ${name}: ${cl.length} pop clusters`];
  cl.sort((x,y)=>y.acc-x.acc); for(const c of cl.slice(0,quiet?3:6)) out.push(`   pop t=${c.t0.toFixed(2)} ${c.mode} worst=${NAMES(c.j)} acc=${c.acc.toFixed(0)} joints=[${[...c.js].slice(0,8)}]`);
  for(const [k,e] of Object.entries(issues)) out.push(`   ! ${k}: ${e.n} ticks, worst ${e.max.toFixed(2)} at t=${e.t.toFixed(2)} (${e.ep} episodes)`);
  if(process.env.SLIDE) out.push(`   (slide: most hip travel with no foot stepping ${SL.r.toFixed(2)} m)`);
  console.log(out.join('\n')); return {cl,issues};
}
const g=(x,z,id=1)=>({kind:'reach',id,x,z});
if(process.argv[1].endsWith('review.mjs')){
 const T=makeTerrain(7); const P=(t)=>({x:Math.sin(t*0.3)*12,y:T.height(0,0)+1.7,z:Math.cos(t*0.3)*12});
 review('idle watching player 60s',t=>({goal:null,pace:2,attention:P(t)}),60);
 review('idle alone 90s',t=>({goal:null,pace:2,attention:null}),90,{seed:9});
 review('walk + investigate',t=>({goal:g(10,40),pace:2.2,attention:P(t)}),34);
 review('targets all around',t=>{const k=Math.floor(t/9);const a=k*2.3;return {goal:g(Math.sin(a)*(8+k*3),Math.cos(a)*(8+k*3),k),pace:2.2,attention:null}},72);
 review('jog 4.5',t=>({goal:{kind:'drive',throttle:t<14?1:0,steer:Math.sin(t*0.7)*0.8},pace:4.5,attention:null}),20);
 review('run 8 + interrupt',t=>({goal:t<9?g(0,95):g(-30,10,2),pace:8,attention:null}),34);
 review('sprint 12',t=>({goal:{kind:'drive',throttle:t<12?1:0,steer:t>6&&t<9?0.6:0},pace:12,attention:null}),20);
 review('stalk',t=>({goal:g(5,38),pace:2.2,stalk:true,attention:{x:5,y:T.height(5,44)+1.7,z:44}}),40);
 // stopped dead from a run, low and still: the mind's freeze with stalk, which holds a swinging foot in the air
 review('freeze from a run',t=>({goal:{kind:'drive',throttle:1,steer:0},pace:8,stalk:t>6,freeze:t>6,attention:null}),12);
 review('pivots',t=>({goal:null,pace:2,attention:{x:Math.sin(Math.floor(t/6)*2.4)*20,y:2,z:Math.cos(Math.floor(t/6)*2.4)*20}}),40);
 { let sh=0; review('shove/roar',(t,sim)=>{ if(t>3&&sh===0){sim.shove(2.8,0);sh=1;} if(t>7&&sh===1){sim.roar();sh=2;} if(t>12&&sh===2){sim.shove(-2,2);sh=3;} return {goal:t>14?g(0,30):null,pace:2.2,attention:null}},24); }
 { const T2=makeTerrain(7); let d=0; review('ridge sculpt',(t,sim)=>{ if(t>4&&!d){d=1; for(let k=-3;k<=3;k++) T2.addBump(sim.x+k*2.4,sim.z+9,1.1,2.4);} return {goal:g(0,60),pace:2.2,attention:null}},30,{terrain:T2}); }
 { let x=0; review('lure dragged',t=>({goal:{kind:'reach',id:5,x:Math.sin(t*0.5)*9,z:9+Math.cos(t*0.37)*7},pace:2.2,attention:null}),40); }
}

// Mind-driven encounters: the same motion checks, but with the animal making its own decisions
import { Mind } from '../src/sim/mind.js';
if (process.argv[1].endsWith('review.mjs') && process.argv[2] === 'mind') {
  for (const seed of [3, 5, 7, 11]) {      // (5: the standing-start slide of BODYFIX/BODYFIX2)
    const T = makeTerrain(7); let mind = null;
    const me = { id: 'you', x: 6, y: 0, z: 26, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1 };
    review(`mind seed ${seed}: person drifts, freezes, runs`, (t, sim) => {
      if (!mind) mind = new Mind(sim, seed);
      const px = me.x, pz = me.z;
      if (t > 20 && t < 40) { me.x += Math.sin(t * 0.3) * 0.02; me.z -= 0.012; }
      if (t > 70 && t < 78) { me.x += 0.045; me.z += 0.02; }
      me.y = T.height(me.x, me.z) + 1.7; me.vx = (me.x - px) * 120; me.vz = (me.z - pz) * 120; me.speed = Math.hypot(me.vx, me.vz);
      return mind.step(1 / 120, { agents: [me], noises: t > 50 && t < 50.01 ? [{ x: me.x - 20, y: 0, z: me.z, loud: 0.4, kind: 'stone' }] : [], light: 0.8, flash: false, wind: { x: 0, z: -3 } });
    }, 100, { seed, terrain: T, quiet: true });
  }
}
