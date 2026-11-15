# Draw calls and triangles of one frame (scene + shadow pass, as the renderer counts them) from a few views, with and
# without the paddock's feature meshes (src/view/features.js).  python3 test/shot.py out test/featcost.py '#test-webgl#quality-low'
r = pg.evaluate("""(()=>{const D=__dino,T=D.sim.terrain,F=T.paddock.F,R=D.renderer; D.applyMood('storm'); D.advance(0.3);
 const views=[[10,-5,10,40],[-6,14,-1,60],[40,-48,50,-68],[-40,13,-64,12]];
 const feats=[]; D.scene.traverse(m=>{ if(m.userData&&m.userData.feature) feats.push(m); });
 const frame=()=>{ R.info.autoReset=false; R.info.reset(); D.look(...D._v); const a={calls:R.info.render.drawCalls,tri:R.info.render.triangles}; R.info.autoReset=true; return a; };
 const out=[]; for (const [x,z,tx,tz] of views){ D._v=[F*x,T.height(F*x,F*z)+1.7,F*z,F*tx,T.height(F*tx,F*tz)+1.5,F*tz];
   const on=frame(); feats.forEach(m=>m.visible=false); const off=frame(); feats.forEach(m=>m.visible=true); out.push({view:[x,z],on,off}); }
 const own=feats.map(m=>{const g=m.geometry,n=g.index?g.index.count:(g.attributes.position?g.attributes.position.count:0); return [m.material.type,m.isInstancedMesh?m.count:1,Math.round(n/3*(m.isInstancedMesh?m.count:1)),m.castShadow];});
 return {out,own}})()""")
print(json.dumps(r))
