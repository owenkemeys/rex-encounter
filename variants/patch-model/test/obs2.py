from PIL import Image
pg.set_viewport_size({'width':480,'height':300})
pg.evaluate("document.body.classList.add('bare')")
ims=[];labels=[]
for i in range(60):
    pg.evaluate("__dino.advance(1.5,1/30)")
    pg.screenshot(path=f'{out}/_f.png'); ims.append(Image.open(f'{out}/_f.png').convert('RGB').copy())
    labels.append(pg.evaluate("__dino.mind.label+(__dino.mind.know.seen?' [sees camera]':'')+' | '+__dino.mind.thought"))
W,H=ims[0].size; cols=6; rows=10; m=Image.new('RGB',(W*cols,H*rows))
for i,im in enumerate(ims): m.paste(im,((i%cols)*W,(i//cols)*H))
m=m.resize((1980,int(1980*m.height/m.width))); m.save(f'{out}/obs_storm.png')
prev=None
for i,l in enumerate(labels):
    if l!=prev: print(f"{i*1.5:5.1f}s {l}"); prev=l
