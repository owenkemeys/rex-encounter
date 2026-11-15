# Head close-ups from where a person stands: front and three-quarter, mouth shut and open, eyes on the camera.
from PIL import Image
W0,H0=int(os.environ.get('W','640')),int(os.environ.get('H','400'))
pg.set_viewport_size({'width':W0,'height':H0})
tag=os.environ.get('TAG','h')
pg.evaluate("document.body.classList.add('bare'); __dino.world.debugFlash=0; __dino.setMind(false)")
pg.evaluate("(()=>{for(let i=0;i<6;i++){try{__dino.advance(0.5);}catch(e){}}})()")
def shot(cam, jaw):
    pg.evaluate("(()=>{const D=__dino,s=D.sim,h=s.head.pos,f=[Math.sin(s.psi),Math.cos(s.psi)],l=[Math.cos(s.psi),-Math.sin(s.psi)],g=s.groundY;const c="+cam+";"
      "const V=s.fix.constructor; D.body.fix=new V(c[0],c[1],c[2]); for(let i=0;i<10;i++){s.pose.s[0]="+str(jaw)+";D.body.update(s.pose);} s.pose.s[0]="+str(jaw)+"; D.look(...c)})()")
    pg.screenshot(path=f'{out}/_h.png'); ims.append(Image.open(f'{out}/_h.png').convert('RGB').copy())
F="[h.x+f[0]*%s+l[0]*%s,g+%s,h.z+f[1]*%s+l[1]*%s,h.x+f[0]*0.9,h.y-0.4,h.z+f[1]*0.9]"
for mood in os.environ.get('MOODS','dusk,storm').split(','):
  ims=[]
  pg.evaluate(f"__dino.applyMood('{mood}')")
  shot(F%(6,0.3,1.7,6,0.3),0.02)       # front, from a standing person, 6 m
  shot(F%(6,0.3,1.7,6,0.3),0.55)       # front, roaring
  shot(F%(3.2,2.6,2.6,3.2,2.6),0.02)   # three-quarter, close
  shot(F%(3.2,2.6,2.6,3.2,2.6),0.55)
  shot(F%(9,-4,1.7,9,-4),0.25)         # three-quarter, 10 m
  shot("[h.x+f[0]*1.1+l[0]*1.3,h.y+0.25,h.z+f[1]*1.1+l[1]*1.3,h.x+l[0]*0.4+f[0]*0.5,h.y+0.4,h.z+l[1]*0.4+f[1]*0.5]",0.02)  # the eye
  w,h=ims[0].size; m=Image.new('RGB',(w*3,h*2))
  for i,im in enumerate(ims): m.paste(im,((i%3)*w,(i//3)*h))
  m.save(f'{out}/{tag}_head_{mood}.png')
pg.evaluate("__dino.body.fix=__dino.sim.fix")
