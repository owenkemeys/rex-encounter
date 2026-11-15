# Eye-height renders of the dressed arena per zone + whole-frame cost (renderer.info summed over every pass of one frame).
#   PORT=8817 [PHONE=1] [MOOD=storm|day] [TAG=x] python3 test/shotp.py out/arena_dress test/dress_shots.py '#test-webgl[-quality-low]'
import time as _t
mood=os.environ.get('MOOD','storm'); tag=os.environ.get('TAG',mood); only=os.environ.get('ONLY','')
pg.evaluate(f"__dino.applyMood('{mood}'); document.body.classList.add('bare'); __dino.advance(0.5)")
pg.wait_for_function("!window.__dino.world.dressPending || window.__dino.world.dressPending()===false", timeout=120000) if pg.evaluate("!!__dino.world.dressPending") else None
pg.evaluate("__dino.advance(0.2)")
pre = "const D=__dino,T=D.sim.terrain,H=(x,z)=>T.height(x,z);"
shots = [
 ('lawn', -13,2, 15,2.5,14),
 ('rex15', 3,4, 15,2.2,14),
 ('barn_in', 38,66, 14,2.5,72),
 ('barn_out', 22,48, 30,4,70),
 ('yard', -30,45, -48,3,68),
 ('jungle_edge', -8,-25, -35,3,-40),
 ('jungle_in', -50,-38, -62,3,-52),
 ('ruins', -45,24, -58,2,20),
 ('bluff', 60,20, 78,4,22),
 ('river', 30,-60, 18,0,-85),
 ('gate', -2,80, -7,3,99),
]
res={}
for name,x,z,tx,ty,tz in shots:
    if only and name not in only.split(','): continue
    js=pre+f"""const R=D.renderer; R.info.autoReset=false; R.info.reset();
      D.look({x},H({x},{z})+1.7,{z},{tx},{ty},{tz});
      const a={{tri:R.info.render.triangles,calls:R.info.render.drawCalls}}; R.info.autoReset=true; return a;"""
    pg.evaluate("(()=>{"+js+"})()")   # warm (shader compile)
    a=pg.evaluate("(()=>{"+js+"})()")
    res[name]=a
    pg.screenshot(path=f'{out}/{tag}_{name}.png')
print(json.dumps(res))
open(f'{out}/{tag}_cost.json','w').write(json.dumps(res))
