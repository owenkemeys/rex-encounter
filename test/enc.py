from PIL import Image
fps=float(os.environ.get('FPS','2')); secs=float(os.environ.get('SECS','40')); name=os.environ.get('NAME','enc'); mood=os.environ.get('MOOD','day')
pg.set_viewport_size({'width':480,'height':300})
pg.evaluate(f"__dino.applyMood('{mood}')")
pg.evaluate("document.body.classList.add('bare')")
pg.evaluate("__dino.setMode('foot')")
# stand 26 m in front of it, crouched beside nothing, facing it; keep facing it
pg.evaluate("(()=>{const s=__dino.sim,Y=__dino.S.you,a=s.psi+0.3;Y.x=s.x+Math.sin(a)*"+os.environ.get("DIST","20")+";Y.z=s.z+Math.cos(a)*"+os.environ.get("DIST","20")+";})()")
ims=[];labels=[]
for i in range(int(fps*secs)):
    pg.evaluate("(()=>{const s=__dino.sim,Y=__dino.S.you;Y.yaw=Math.atan2(-(s.head.pos.x-Y.x),-(s.head.pos.z-Y.z));Y.pitch=Math.atan2(s.head.pos.y-1.7-__dino.camera.position.y+1.7,Math.hypot(s.head.pos.x-Y.x,s.head.pos.z-Y.z))*0.8;})()")
    pg.evaluate(f"__dino.advance({1/fps},{1/30})")
    pg.screenshot(path=f'{out}/_f.png'); ims.append(Image.open(f'{out}/_f.png').convert('RGB').copy())
    labels.append(pg.evaluate("__dino.mind.label+' | '+__dino.mind.thought"))
W,H=ims[0].size; cols=6; rows=(len(ims)+cols-1)//cols; m=Image.new('RGB',(W*cols,H*rows))
for i,im in enumerate(ims): m.paste(im,((i%cols)*W,(i//cols)*H))
m=m.resize((1980,int(1980*m.height/m.width))); m.save(f'{out}/{name}.png')
prev=None
for i,l in enumerate(labels):
    if l!=prev: print(f"{i/fps:5.1f}s {l}"); prev=l
