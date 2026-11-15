# Eye tracking: put the fixation point left, right, up, down of the head and photograph the near eye.
from PIL import Image
pg.set_viewport_size({'width':480,'height':300})
pg.evaluate("document.body.classList.add('bare'); __dino.world.debugFlash=0; __dino.applyMood('day'); __dino.setMind(false)")
pg.evaluate("(()=>{for(let i=0;i<4;i++){try{__dino.advance(0.5);}catch(e){}}})()")
ims=[]
for name,off in [('fwd','[f[0]*20,0,f[1]*20]'),('out','[l[0]*20+f[0]*6,0,l[1]*20+f[1]*6]'),('back','[l[0]*8-f[0]*10,0,l[1]*8-f[1]*10]'),('up','[f[0]*8,10,f[1]*8]'),('down','[f[0]*6,-6,f[1]*6]')]:
    pg.evaluate("(()=>{const D=__dino,s=D.sim,h=s.head.pos,H=D.body.mats?null:null,f=[Math.sin(s.psi),Math.cos(s.psi)],l=[Math.cos(s.psi),-Math.sin(s.psi)];const o="+off+";const fx={x:h.x+o[0],y:h.y+o[1],z:h.z+o[2]}; D.body.fix={x:fx.x,y:fx.y,z:fx.z,isVector3:true}; D.body.fix=new D.sim.fix.constructor(fx.x,fx.y,fx.z);"
        "const E=D.body.eyes[0].e; for(let i=0;i<12;i++){D.body.update(D.sim.pose);} D.scene.updateMatrixWorld(); const p=new D.sim.fix.constructor().setFromMatrixPosition(E.matrixWorld); const hf=new D.sim.fix.constructor(); D.camera.position.copy(p).add(new D.sim.fix.constructor(o[0],o[1],o[2]).normalize().multiplyScalar(0.0)); "
        "const c=p.clone().add(new D.sim.fix.constructor(l[0]*0.9+f[0]*0.5,0.15,l[1]*0.9+f[1]*0.5)); D.camera.position.copy(c); D.camera.lookAt(p); D.renderer.render(D.scene,D.camera); D.look(c.x,c.y,c.z,p.x,p.y,p.z);})()")
    pg.screenshot(path=f'{out}/_e.png'); ims.append(Image.open(f'{out}/_e.png').convert('RGB').copy())
pg.evaluate("__dino.body.fix=__dino.sim.fix")
w,h=ims[0].size; m=Image.new('RGB',(w*len(ims),h))
for i,im in enumerate(ims): m.paste(im,(i*w,0))
m.save(f'{out}/eyes.png')
