from PIL import Image
pg.set_viewport_size({'width':640,'height':400})
pg.evaluate("document.body.classList.add('bare')")
N=int(os.environ.get('N','24')); STEP=float(os.environ.get('STEP','3')); T0=float(os.environ.get('T0','0'))
if T0>0: pg.evaluate(f"__dino.advance({T0})")
ims=[];caps=[]
for i in range(N):
    pg.evaluate(f"__dino.advance({STEP})")
    caps.append(pg.evaluate("__dino.director.beat.kind+' '+__dino.sim.mode+' v='+__dino.sim.v.toFixed(1)+' cam='+__dino.director.cam.type"))
    pg.screenshot(path=f'{out}/_f.png'); ims.append(Image.open(f'{out}/_f.png').convert('RGB').copy())
W,H=ims[0].size; COLS=4; rows=(N+COLS-1)//COLS
m=Image.new('RGB',(W*COLS,H*rows))
for i,im in enumerate(ims): m.paste(im,((i%COLS)*W,(i//COLS)*H))
m=m.resize((W*COLS*3//4,H*rows*3//4)); m.save(f"{out}/{os.environ.get('NAME','obs')}.png")
for i,c in enumerate(caps): print(i,c)
print('over',pg.evaluate("__dino.sim.over"))
