from PIL import Image
pg.set_viewport_size({'width':960,'height':560})
pg.evaluate("document.body.classList.add('bare')")
pg.evaluate("__dino.setMode('fly');__dino.S.watchMe=false")
ims=[]
def shot(cam):
    pg.evaluate("(()=>{const s=__dino.sim;const c="+cam+";__dino.look(...c)})()"); pg.screenshot(path=f'{out}/_f.png'); ims.append(Image.open(f'{out}/_f.png').convert('RGB').copy())
SIDE='[s.x+Math.cos(s.psi)*9+Math.sin(s.psi)*3,s.groundY+2.2,s.z-Math.sin(s.psi)*9+Math.cos(s.psi)*3,s.x+Math.sin(s.psi)*1.5,s.groundY+2.8,s.z+Math.cos(s.psi)*1.5]'
FRONT='[s.x+Math.sin(s.psi+0.5)*9,s.groundY+1.7,s.z+Math.cos(s.psi+0.5)*9,s.head.pos.x,s.head.pos.y-0.6,s.head.pos.z]'
pg.evaluate("__dino.advance(2)"); shot(SIDE)
pg.evaluate("__dino.applyMood('dusk');__dino.reachTo(__dino.sim.x+8,__dino.sim.z+30);__dino.advance(6)"); shot(SIDE)
pg.evaluate("__dino.S.pace=12;__dino.reachTo(60,-40);__dino.advance(9)"); shot(SIDE)
pg.evaluate("__dino.S.goal=null;__dino.advance(4);__dino.sim.roar();__dino.advance(1.3)"); shot(FRONT)
W,H=ims[0].size; m=Image.new('RGB',(W*2,H*2))
for i,im in enumerate(ims): m.paste(im,((i%2)*W,(i//2)*H))
m.save(f'{out}/look.png'); print(pg.evaluate("__dino.sim.mode+' '+__dino.sim.v.toFixed(1)"))
