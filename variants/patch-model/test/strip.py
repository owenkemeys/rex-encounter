# args via env: SCEN (js setting up), N frames, STEP seconds, CAM js expr returning [px,py,pz,tx,ty,tz]
from PIL import Image
scen=os.environ['SCEN']; N=int(os.environ.get('N','12')); STEP=float(os.environ.get('STEP','0.15')); CAM=os.environ['CAM']; name=os.environ.get('NAME','strip'); COLS=int(os.environ.get('COLS','4'))
pg.set_viewport_size({'width':640,'height':400})
pg.evaluate("document.body.classList.add('bare')")
pg.evaluate("__dino.setMode('fly')")
pg.evaluate(scen)
ims=[]
for i in range(N):
    pg.evaluate(f"__dino.advance({STEP})")
    pg.evaluate("(()=>{const s=__dino.sim;const c="+CAM+";__dino.look(...c)})()")
    pg.screenshot(path=f'{out}/_f.png'); ims.append(Image.open(f'{out}/_f.png').convert('RGB').copy())
W,H=ims[0].size; rows=(N+COLS-1)//COLS
m=Image.new('RGB',(W*COLS,H*rows))
for i,im in enumerate(ims): m.paste(im,((i%COLS)*W,(i//COLS)*H))
m.save(f'{out}/{name}.png')
print(pg.evaluate("JSON.stringify({v:__dino.sim.v,mode:__dino.sim.mode,over:__dino.sim.over})"))
