# Real-render flip-book of one foot through a stride, camera locked beside the ankle.
from PIL import Image
pg.set_viewport_size({'width':420,'height':300})
pg.evaluate("document.body.classList.add('bare')")
pg.evaluate("__dino.setMode('fly');__dino.S.watchMe=false;__dino.applyMood('day');__dino.reachTo(__dino.sim.x+10,__dino.sim.z+60);__dino.advance(5)")
fps=float(os.environ.get('FPS','15')); n=int(os.environ.get('N','24'))
ims=[]
for i in range(n):
    pg.evaluate(f"__dino.advance({1/fps},{1/60})")
    pg.evaluate("(()=>{const s=__dino.sim,f=[Math.sin(s.psi),Math.cos(s.psi)],l=[Math.cos(s.psi),-Math.sin(s.psi)],g=s.groundY;__dino.look(s.x+l[0]*2.6-f[0]*0.2,g+0.75,s.z+l[1]*2.6-f[1]*0.2,s.x+f[0]*0.3+l[0]*0.4,g+0.45,s.z+f[1]*0.3+l[1]*0.4)})()")
    pg.screenshot(path=f'{out}/_f.png'); ims.append(Image.open(f'{out}/_f.png').convert('RGB').copy())
W,H=ims[0].size; cols=4; rows=(n+cols-1)//cols; m=Image.new('RGB',(W*cols,H*rows))
for i,im in enumerate(ims): m.paste(im,((i%cols)*W,(i//cols)*H))
m.save(f'{out}/foot.png')
