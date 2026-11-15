# Real renders of the arena blockout at a person's eye height (1.7 m) and from the air.
#   python3 test/shot_arena.py out test/arena_shots.py  ->  out/ar_<name>.png and the sheet out/arena_shots.png
from PIL import Image
pg.set_viewport_size({'width':960,'height':540})
pg.evaluate("__dino.applyMood('day'); document.body.classList.add('bare'); __dino.advance(0.5)")
pre = "const D=__dino,T=D.sim.terrain,H=(x,z)=>T.height(x,z),L=(x,y,z,tx,ty,tz)=>D.look(x,y,z,tx,ty,tz);"
shots = [
 ('spawn_view', "L(-13,H(-13,2)+1.7,2, 15,H(15,14)+2.5,14)"),
 ('barn_from_lawn', "L(20,H(20,35)+1.7,35, 30,4,70)"),
 ('barn_inside', "L(19.5,H(19.5,72.8)+1.7,72.8, 44,2.2,68)"),
 ('loft', "L(45,H(45,64.5)+3+1.7,64.5, 46,3.5,76)"),
 ('yard', "L(-30,H(-30,45)+1.7,45, -48,3,68)"),
 ('ruins', "L(-57,H(-57,21.1)+1.7,21.1, -45,2,28)"),
 ('jungle_edge', "L(-8,H(-8,-25)+1.7,-25, -35,3,-40)"),
 ('bluff_ledge', "L(62,H(62,70)+1.7,70, 75,4,48)"),
 ('river_jetty', "L(30,H(30,-60)+1.7,-60, 18,0,-85)"),
 ('air_sw', "L(-130,95,-130, 0,0,10)"),
 ('air_ne', "L(110,90,150, -5,0,5)"),
 ('air_top', "L(0.1,260,0.2, 0,0,0)"),
]
ims = []
for name, js in shots:
    pg.evaluate("(()=>{" + pre + js + "})()")
    pg.screenshot(path=f'{out}/ar_{name}.png', timeout=240000); ims.append(Image.open(f'{out}/ar_{name}.png').convert('RGB').resize((480, 270)))
W, H = ims[0].size; m = Image.new('RGB', (W * 3, H * 4))
for i, im in enumerate(ims): m.paste(im, ((i % 3) * W, (i // 3) * H))
m.save(f'{out}/arena_shots.png')
print(json.dumps(pg.evaluate("""(()=>{const D=__dino,T=D.sim.terrain; D.look(-13,T.height(-13,2)+1.7,2, 15,2,14);
 const R=D.renderer; R.info.autoReset=false; R.info.reset(); R.render(D.scene,D.camera); const a={tri:R.info.render.triangles,calls:R.info.render.drawCalls}; R.info.autoReset=true; return a})()""")))
