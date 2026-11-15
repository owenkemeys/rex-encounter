# GPU-side cost per tier: triangles and draw calls of one scene render (post passes counted separately).
r=pg.evaluate("""(()=>{const D=__dino; D.world.debugFlash=0; try{D.advance(1)}catch(e){}
 const s=D.sim,l=[Math.cos(s.psi),-Math.sin(s.psi)],f=[Math.sin(s.psi),Math.cos(s.psi)];
 const R=D.renderer; R.info.autoReset=false; R.info.reset(); R.render(D.scene,D.camera); const a={tri:R.info.render.triangles,calls:R.info.render.drawCalls}; R.info.reset();
 D.look(s.x+f[0]*16+l[0]*9,s.groundY+2.2,s.z+f[1]*16+l[1]*9,s.x,s.groundY+3.4,s.z); const b={tri:R.info.render.triangles,calls:R.info.render.drawCalls}; R.info.autoReset=true;
 return {scene:a, withPost:b};})()""")
print(json.dumps(r))
pg.evaluate("document.body.classList.add('bare')")
pg.screenshot(path=f'{out}/perf_view.png')
