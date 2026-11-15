# From inside the shed: the person stands at the back, the animal is set to work at the shed; frames from the person's eye.
# usage: PORT=8797 python3 test/shotp.py out test/shedshot.py
from PIL import Image
pg.set_viewport_size({'width':760,'height':460})
pg.evaluate("document.body.classList.add('bare')")
pg.evaluate("""(()=>{const D=__dino,T=D.arena.T||D.world.terrain||null;})()""")
setup = """(()=>{const D=__dino,S=D.S,sim=D.sim,ar=D.arena,T=sim.terrain,sh=T.structures.find(s=>s.kind==='shed');
 D.setMode('foot'); const Y=S.you; const bx=sh.cx-Math.sin(sh.yaw)*1.4, bz=sh.cz-Math.cos(sh.yaw)*1.4; Y.x=Y.px=bx; Y.z=Y.pz=bz; Y.vx=Y.vz=0;
 const O=sh.openings[0], n=Math.hypot(O.nx,O.nz), N=sim.nav; let sx=0,sz=0;
 for (let k=0;k<48;k++){ const a=k*0.7, d=18+(k%4)*4, x=sh.cx+Math.sin(a)*d, z=sh.cz+Math.cos(a)*d; if (!(N.costAt(x,z)<1.5)) continue; const p=N.plan(x,z,O.x+O.nx/n*3,O.z+O.nz/n*3), e=p[p.length-1]; if (p.length>1||Math.hypot(e.x-x,e.z-z)<30) { sx=x; sz=z; break; } }
 sim.reset(sx, sz, Math.atan2(sh.cx-sx, sh.cz-sz));
 D.mind.ov.force='besiege'; D.mind.ov.omniscient=true; D.applyMood && D.applyMood('day'); return [bx,bz,O.x,O.z];})()"""
info = pg.evaluate(setup); print('you/door', info)
ims=[]
for k, secs in enumerate([30, 8, 5, 5, 5, 5]):
    pg.evaluate(f"__dino.advance({secs})")
    st = pg.evaluate("(()=>{const D=__dino,sh=D.sim.terrain.structures.find(s=>s.kind==='shed'),O=sh.openings[0],Y=D.S.you,g=D.sim.terrain.height(Y.x,Y.z);const h=D.sim.head.pos,f=D.sim.head.f;D.look(Y.x,g+1.55,Y.z,h.x+f.x*1.2,h.y,h.z+f.z*1.2);return [D.mind.label+'/'+(D.mind.beh&&D.mind.beh.phase)+'/'+(D.mind.beh&&D.mind.beh.sub), D.mind.thought, +(h.x+f.x*1.75-O.x).toFixed(2), +(h.z+f.z*1.75-O.z).toFixed(2)]})()")
    print(k, st)
    pg.screenshot(path=f'{out}/_s.png'); ims.append(Image.open(f'{out}/_s.png').convert('RGB').copy())
W,H=ims[0].size; m=Image.new('RGB',(W*3,H*2))
for i,im in enumerate(ims): m.paste(im,((i%3)*W,(i//3)*H))
m.save(f'{out}/shed_inside.png')
