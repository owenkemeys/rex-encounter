import json
r=pg.evaluate("""(()=>{
 const D=__dino, out={}; D.setMode('foot'); D.advance(1);
 const T=(f,n)=>{const a=performance.now(); for(let i=0;i<n;i++) f(); return (performance.now()-a)/n;};
 const W={agents:[{id:'you',x:10,y:2,z:20,vx:0,vz:0,speed:0,crouch:false,fx:0,fz:-1}],noises:[],light:0.6,flash:false,wind:{x:0,z:-3}};
 out.arenaStepMs=T(()=>D.arena.step(1/120,W),1200); D.arena.events.length=0;
 out.bodyUpdateMs=T(()=>D.body.update(D.sim.pose),200);
 D.advance(0.2);
 const a=performance.now(); for(let i=0;i<20;i++){ D.advance(1/30,1/30); } out.frameMsTotal=(performance.now()-a)/20;
 const info=D.renderer.info; out.calls=info.render.calls; out.triangles=info.render.triangles; out.tier=document.querySelector('#rGpu').textContent;
 return out;})()""")
print(json.dumps(r))
