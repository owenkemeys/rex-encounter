# Eye-height renders per zone (+ the rex at 10 and 30 m) and whole-frame cost.
#   PORT=8833 [PHONE=1] MOOD=storm|day TAG=x [ONLY=a,b] python3 test/shotp.py out/arena_dress2 test/dress2_shots.py '#test-webgl[-quality-low]'
mood=os.environ.get('MOOD','storm'); tag=os.environ.get('TAG',mood); only=os.environ.get('ONLY','')
pg.evaluate(f"__dino.applyMood('{mood}'); document.body.classList.add('bare'); __dino.advance(0.5)")
if pg.evaluate("!!__dino.world.dressPending"): pg.wait_for_function("__dino.world.dressPending()===false", timeout=120000)
pg.evaluate("__dino.advance(0.2)")
pre = "const D=__dino,T=D.sim.terrain,H=(x,z)=>T.height(x,z);"
shots = [
 ('lawn', -13,2, 15,2.5,14),
 ('barn_in', 16,72, 40,2.2,68),
 ('barn_out', 22,48, 30,4,70),
 ('yard', -30,45, -48,3,68),
 ('jungle_edge', -8,-25, -35,3,-40),
 ('jungle_in', -50,-38, -62,3,-52),
 ('ruins', -45,24, -58,2,20),
 ('river', 30,-60, 18,0,-85),
]
res={}
def shoot(name, js):
    full=pre+"const R=D.renderer; R.info.autoReset=false; R.info.reset();"+js+"const a={tri:R.info.render.triangles,calls:R.info.render.drawCalls}; R.info.autoReset=true; return a;"
    pg.evaluate("(()=>{"+full+"})()"); a=pg.evaluate("(()=>{"+full+"})()"); res[name]=a
    pg.screenshot(path=f'{out}/{tag}_{name}.png')
for name,x,z,tx,ty,tz in shots:
    if only and name not in only.split(','): continue
    shoot(name, f"D.look({x},H({x},{z})+1.7,{z},{tx},{ty},{tz});")
for d in (10,30):
    if only and f'rex{d}' not in only.split(','): continue
    shoot(f'rex{d}', f"const sx=D.sim.x,sz=D.sim.z,cx=sx-{d}*0.8,cz=sz-{d}*0.6; D.look(cx,H(cx,cz)+1.7,cz,sx,H(sx,sz)+2.2,sz);")
print(json.dumps(res)); open(f'{out}/{tag}_cost.json','w').write(json.dumps(res))
if not only or 'barn_rex' in only.split(','):      # the rex just outside the barn's south wall, seen from inside through the boards
    pg.evaluate("(()=>{const D=__dino; D.sim.reset(28, 59.0, 1.57); D.advance(0.2);})()")
    shoot('barn_rex', "D.look(31,H(31,68.5)+1.7,68.5,28,2.6,58);")
    print(json.dumps(res)); open(f'{out}/{tag}_cost.json','w').write(json.dumps(res))
