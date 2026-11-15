# Real renders at the paddock's landmarks from a person's eye height (1.7 m), plus one from the air.
#   python3 test/shot.py out test/landmarks.py [hash]  ->  out/lm_<name>.png and the contact sheet out/landmarks.png
# Shots are written in the layout's design coordinates (Ridge north) and turned into the world by T.paddock.F.
from PIL import Image
pg.set_viewport_size({'width':960,'height':540})
mood = os.environ.get('MOOD', 'day'); tag = os.environ.get('TAG', '')
pg.evaluate(f"__dino.applyMood('{mood}'); document.body.classList.add('bare'); __dino.advance(0.5)")
pre = "const D=__dino,T=D.sim.terrain,F=T.paddock.F,H=(x,z)=>T.height(F*x,F*z),L=(x,y,z,tx,ty,tz)=>D.look(F*x,y,F*z,F*tx,ty,F*tz);"
shots = [
 ('meadow_to_bluff', "L(6,H(6,14)+1.7,14, -1,H(-2,60)+3,60)"),
 ('overlook_down', "L(-1.5,H(-1.5,55.2)+1.7,55.2, 6,H(6,30),30)"),
 ('neck', "L(-2.45,H(-2.45,78.5)+1.7,78.5, -2,H(-2,59)-1,59)"),
 ('slot', "const P=T.paddock,p=P.gully.at(52),q=P.gully.at(64); D.look(p.x,T.height(p.x,p.z)+1.7,p.z, q.x,T.height(q.x,q.z)+1.4,q.z)"),
 ('jam', "const J=T.paddock.jam,a=J.half+3,x=J.x-J.cx*a-J.cz*2,z=J.z-J.cz*a+J.cx*2; D.look(x,T.height(x,z)+1.7,z, J.x,T.height(J.x,J.z)-0.5,J.z)"),
 ('ford', "L(34,H(34,-19)+1.7,-19, 46,H(46,-16),-16)"),
 ('pond', "L(-12,H(-12,-50)+1.7,-50, 4,H(4,-78)+0.5,-78)"),
 ('wood', "L(-40,H(-40,13.5)+1.7,13.5, -64,H(-64,12)+2,12)"),
 ('long_grass', "L(40,H(40,-48)+1.7,-48, 50,H(50,-68)+0.8,-68)"),
 ('crags_cleft', "const S=T.structures.find(s=>s.kind==='cleft'),f=[Math.sin(S.yaw),Math.cos(S.yaw)],x=S.cx+f[0]*16,z=S.cz+f[1]*16; D.look(x,T.height(x,z)+1.7,z, S.cx,S.base+1.5,S.cz)"),
 ('station', "L(60,H(60,-10)+1.7,-10, 77,H(77,10)+1.5,10)"),
 ('air', "L(70,55,-95, -5,0,10)"),
]
ims = []
for name, js in shots:
    pg.evaluate("(()=>{" + pre + js + "})()")
    pg.screenshot(path=f'{out}/lm_{tag}{name}.png'); ims.append(Image.open(f'{out}/lm_{tag}{name}.png').convert('RGB').resize((480, 270)))
W, H = ims[0].size; m = Image.new('RGB', (W * 3, H * 4))
for i, im in enumerate(ims): m.paste(im, ((i % 3) * W, (i // 3) * H))
m.save(f'{out}/landmarks{tag}.png')
# cost of one scene render from the meadow looking over the paddock, and what the paddock's own meshes add
print(json.dumps(pg.evaluate("""(()=>{const D=__dino,T=D.sim.terrain,F=T.paddock.F; D.look(F*10,T.height(F*10,F*-5)+1.7,F*-5, F*10,1,F*40);
 const R=D.renderer; R.info.autoReset=false; R.info.reset(); R.render(D.scene,D.camera); const a={tri:R.info.render.triangles,calls:R.info.render.drawCalls}; R.info.autoReset=true;
 const per=[]; D.scene.traverse(m=>{ if(!m.isMesh) return; const g=m.geometry, t=(g.index?g.index.count:g.attributes.position.count)/3*(m.isInstancedMesh?m.count:1); per.push([m.material&&m.material.type, m.isInstancedMesh?m.count:1, Math.round(t)]); });
 per.sort((x,y)=>y[2]-x[2]); return {scene:a, top:per.slice(0,14), meshes:per.length, trees:T.obstacles.filter(o=>o.kind==='tree').length}})()""")))
