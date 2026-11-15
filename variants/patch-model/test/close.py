from PIL import Image
mood=os.environ.get('MOOD','day')
pg.set_viewport_size({'width':660,'height':420})
pg.evaluate("document.body.classList.add('bare')")
pg.evaluate(f"__dino.setMode('fly');__dino.S.watchMe=false;__dino.applyMood('{mood}');__dino.reachTo(__dino.sim.x+10,__dino.sim.z+40);__dino.advance(6.3)")
ims=[]
def shot(cam):
    pg.evaluate("(()=>{const s=__dino.sim,h=s.head.pos,f=[Math.sin(s.psi),Math.cos(s.psi)],l=[Math.cos(s.psi),-Math.sin(s.psi)],g=s.groundY;const c="+cam+";__dino.look(...c)})()"); pg.screenshot(path=f'{out}/_f.png'); ims.append(Image.open(f'{out}/_f.png').convert('RGB').copy())
shot("[h.x+f[0]*3+l[0]*3.2,h.y+0.3,h.z+f[1]*3+l[1]*3.2,h.x+f[0]*0.6,h.y-0.1,h.z+f[1]*0.6]")      # head 3/4
shot("[h.x-l[0]*4.5+f[0]*0.5,h.y+0.2,h.z-l[1]*4.5+f[1]*0.5,h.x-f[0]*0.8,h.y-0.5,h.z-f[1]*0.8]")   # head+neck other side
shot("[s.x+l[0]*5,g+1.0,s.z+l[1]*5,s.x,g+1.3,s.z]")                                              # legs/feet
shot("[s.x-f[0]*9+l[0]*2.5,g+3.2,s.z-f[1]*9+l[1]*2.5,s.x,g+3,s.z]")                              # from behind
shot("[s.x+f[0]*10-l[0]*1.5,g+1.7,s.z+f[1]*10-l[1]*1.5,s.x,g+3.6,s.z]")                          # front, eye height
shot("[s.x+l[0]*11+f[0]*1,g+2.5,s.z+l[1]*11+f[1]*1,s.x+f[0]*1,g+2.6,s.z+f[1]*1]")                # full side
W,H=ims[0].size; m=Image.new('RGB',(W*3,H*2))
for i,im in enumerate(ims): m.paste(im,((i%3)*W,(i//3)*H))
m.save(f'{out}/close_{mood}.png')
