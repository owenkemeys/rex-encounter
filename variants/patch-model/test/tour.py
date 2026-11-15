# Real-render tour of the new content: the UI, structures, ferns, herd, a flare at night.
from PIL import Image
pg.set_viewport_size({'width':1100,'height':620})
pg.evaluate("__dino.applyMood('day'); __dino.advance(2)")
pg.screenshot(path=f'{out}/tour_ui.png')
pg.evaluate("document.body.classList.add('bare')")
ims=[]
def shot(js):
    pg.evaluate("(()=>{const D=__dino,T=D.sim.terrain;"+js+"})()"); pg.screenshot(path=f'{out}/_f.png'); ims.append(Image.open(f'{out}/_f.png').convert('RGB').resize((550,310)))
for k in ['shed','pen','culvert','tower','cleft']:
    shot(f"const S=T.structures.find(s=>s.kind==='{k}'), a=S.yaw+0.7, d={14 if k!='pen' else 22}; D.look(S.cx+Math.sin(a)*d, S.base+{6 if k!='tower' else 8}, S.cz+Math.cos(a)*d, S.cx, S.base+1.5, S.cz)")
shot("const H=D.arena.herd.list[0]; D.look(H.x+9,H.y+3,H.z+9,H.x,H.y+1,H.z)")
shot("const c=T.cover[0]; D.look(c.x+c.r+5,T.height(c.x,c.z)+2.5,c.z+3,c.x,T.height(c.x,c.z)+0.5,c.z)")
shot("const L=T.logs[0]; D.look(L.x+5,T.height(L.x,L.z)+3,L.z+5,L.x,T.height(L.x,L.z),L.z)")
pg.evaluate("__dino.applyMood('storm'); const D=__dino,s=D.sim; D.arena.things.place('flare', s.x+Math.sin(s.psi)*10, s.z+Math.cos(s.psi)*10); D.advance(0.5)")
shot("const s=D.sim; D.look(s.x+Math.sin(s.psi+1)*16, s.groundY+4, s.z+Math.cos(s.psi+1)*16, s.x+Math.sin(s.psi)*6, s.groundY+2, s.z+Math.cos(s.psi)*6)")
W,H=ims[0].size; m=Image.new('RGB',(W*3,H*3))
for i,im in enumerate(ims): m.paste(im,((i%3)*W,(i//3)*H))
m.save(f'{out}/tour.png')
