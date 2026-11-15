from PIL import Image
pg.set_viewport_size({'width':560,'height':330})
pg.evaluate("document.body.classList.add('bare');__dino.applyMood('day');__dino.setMind(false);__dino.setMode('fly');__dino.S.pace=2.2;__dino.reachTo(__dino.sim.x+5,__dino.sim.z+60);__dino.advance(5)")
ims=[]
for i in range(12):
    pg.evaluate("__dino.advance(0.12,1/60)")
    pg.evaluate("(()=>{const s=__dino.sim;__dino.look(s.x+Math.cos(s.psi)*12+Math.sin(s.psi)*2,s.groundY+2.0,s.z-Math.sin(s.psi)*12+Math.cos(s.psi)*2,s.x+Math.sin(s.psi)*1.0,s.groundY+2.4,s.z+Math.cos(s.psi)*1.0)})()")
    pg.screenshot(path=f'{out}/_f.png'); ims.append(Image.open(f'{out}/_f.png').convert('RGB').copy())
W,H=ims[0].size; m=Image.new('RGB',(W*4,H*3))
for i,im in enumerate(ims): m.paste(im,((i%4)*W,(i//4)*H))
m.save(f'{out}/walkreal.png')
