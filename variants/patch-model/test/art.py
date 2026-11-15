# Art review sheet: wide observe shots in each mood, a head close-up with the mouth open, a flare at night.
from PIL import Image
W0,H0=int(os.environ.get('W','960')),int(os.environ.get('H','540'))
pg.set_viewport_size({'width':W0,'height':H0})
pg.evaluate("document.body.classList.add('bare'); __dino.world.debugFlash=0")
tag=os.environ.get('TAG','a')
ims=[]
def grab(name):
    pg.screenshot(path=f'{out}/{tag}_{name}.png'); ims.append(Image.open(f'{out}/{tag}_{name}.png').convert('RGB').copy())
def look(cam):
    pg.evaluate("(()=>{const D=__dino,s=D.sim,h=s.head.pos,f=[Math.sin(s.psi),Math.cos(s.psi)],l=[Math.cos(s.psi),-Math.sin(s.psi)],g=s.groundY,T=s.terrain;const c="+cam+";D.look(...c)})()")
pg.evaluate("(()=>{for(let i=0;i<8;i++){try{__dino.advance(0.5);}catch(e){}}})()")
for mood in (os.environ.get('MOODS','storm,dusk,day').split(',')):
    pg.evaluate(f"__dino.applyMood('{mood}'); try{{__dino.advance(0.3)}}catch(e){{}}")
    look("[s.x+f[0]*16+l[0]*9,g+2.2,s.z+f[1]*16+l[1]*9,s.x,g+3.4,s.z]"); grab(mood+'_wide')
    if mood=='storm':
        look("[s.x-f[0]*30+l[0]*24,g+7,s.z-f[1]*30+l[1]*24,s.x+f[0]*10,g+2,s.z+f[1]*10]"); grab('storm_vista')
        pg.evaluate("__dino.world.debugFlash=0.8")
        look("[s.x+f[0]*16+l[0]*9,g+2.2,s.z+f[1]*16+l[1]*9,s.x,g+3.4,s.z]"); grab('storm_flash')
        pg.evaluate("__dino.world.debugFlash=0")
# head, mouth open
pg.evaluate("__dino.applyMood(os_mood='storm')".replace("os_mood=",""))
pg.evaluate("(()=>{const D=__dino; D.sim.roar(); for(let i=0;i<33;i++){try{D.advance(1/60,1/60);}catch(e){}} })()")
look("[h.x+f[0]*3.2+l[0]*2.6,h.y+0.35,h.z+f[1]*3.2+l[1]*2.6,h.x+f[0]*0.7,h.y-0.25,h.z+f[1]*0.7]"); grab('head_open')
look("[h.x+l[0]*3.6+f[0]*0.9,h.y+0.1,h.z+l[1]*3.6+f[1]*0.9,h.x+f[0]*0.9,h.y-0.3,h.z+f[1]*0.9]"); grab('head_side')
# night flare
pg.evaluate("(()=>{const D=__dino,s=D.sim; D.applyMood('storm'); D.arena.things.place('flare', s.x+Math.cos(s.psi)*6+Math.sin(s.psi)*5, s.z-Math.sin(s.psi)*6+Math.cos(s.psi)*5); for(let i=0;i<4;i++){try{D.advance(1/30);}catch(e){}}})()")
pg.evaluate("(()=>{const D=__dino,s=D.sim,F=D.arena.things.list.find(o=>o.kind==='flare'); window.__F=F? [F.x,F.y,F.z]:[s.x,s.groundY,s.z];})()")
look("[s.x+(__F[0]-s.x)*1.8,g+1.7,s.z+(__F[2]-s.z)*1.8,s.x,g+2.4,s.z]"); grab('flare')
pg.evaluate("__dino.props.torchOn=true")
look("[s.x+f[0]*9+l[0]*3,g+1.7,s.z+f[1]*9+l[1]*3,h.x,h.y-0.5,h.z]"); grab('torch')
pg.evaluate("__dino.props.torchOn=false")
r=pg.evaluate("(()=>{const i=__dino.renderer.info.render; return {tri:i.triangles,calls:i.drawCalls||i.calls,backend:__dino.backend}})()")
print(json.dumps(r))
w,h=ims[0].size; cols=3; rows=(len(ims)+cols-1)//cols; m=Image.new('RGB',(w*cols//2,h*rows//2))
for i,im in enumerate(ims): m.paste(im.resize((w//2,h//2)),((i%cols)*w//2,(i//cols)*h//2))
m.save(f'{out}/{tag}_sheet.png')
