# real-render flip-book: observe mode (or scripted) at FPS for SECS, starting T0
from PIL import Image
fps=float(os.environ.get('FPS','8')); secs=float(os.environ.get('SECS','4')); t0=float(os.environ.get('T0','0')); pre=os.environ.get('PRE',''); name=os.environ.get('NAME','flip'); cols=int(os.environ.get('COLS','6'))
pg.set_viewport_size({'width':480,'height':290})
pg.evaluate("document.body.classList.add('bare')")
if pre: pg.evaluate(pre)
if t0>0: pg.evaluate(f"__dino.advance({t0})")
ims=[]; n=int(fps*secs)
for i in range(n):
    pg.evaluate(f"__dino.advance({1/fps},{1/fps/4})"); pg.screenshot(path=f'{out}/_f.png'); ims.append(Image.open(f'{out}/_f.png').convert('RGB').copy())
W,H=ims[0].size; rows=(n+cols-1)//cols; m=Image.new('RGB',(W*cols,H*rows))
for i,im in enumerate(ims): m.paste(im,((i%cols)*W,(i//cols)*H))
m=m.resize((1980,int(1980*m.height/m.width))); m.save(f'{out}/{name}.png'); print(pg.evaluate("__dino.director.beat?__dino.director.beat.kind:''"), pg.evaluate("__dino.sim.mode"))
