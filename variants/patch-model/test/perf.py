import json
pg.set_viewport_size({'width':800,'height':450})
t0=pg.evaluate("performance.now()")
r=pg.evaluate("""(()=>{
 const D=__dino, out={};
 const T=(f,n)=>{const a=performance.now(); for(let i=0;i<n;i++) f(); return (performance.now()-a)/n;};
 const I={goal:null,pace:2,attention:null};
 out.simStepMs=T(()=>D.sim.step(1/120,{goal:{kind:'drive',throttle:1,steer:0.3},pace:4}),600);
 out.mindStepMs=T(()=>D.mind.step(1/120,{agents:[{id:'you',x:10,y:2,z:20,vx:0,vz:0,speed:0,crouch:false,fx:0,fz:-1}],noises:[],light:0.6,flash:false,wind:{x:0,z:-3}}),1200);
 out.bodyUpdateMs=T(()=>D.body.update(D.sim.pose),300);
 D.advance(1);
 const info=D.renderer.info; out.render=JSON.parse(JSON.stringify(info.render)); out.memory=JSON.parse(JSON.stringify(info.memory));
 out.bodyStats=D.body.stats;
 return out;})()""")
print(json.dumps(r,indent=0))
