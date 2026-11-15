print(pg.evaluate('__dino.backend'))
pg.evaluate("document.body.classList.add('bare')")
pg.evaluate("__dino.setMode('fly')")
i=0
for (cam) in [(14,3,10, 0,3.5,2),(-3,1.7,16,0,4,3),(0,14,-6,0,3,1),(16,1.7,2,0,3,0)]:
    pg.evaluate("([a,b,c,d,e,f])=>{const s=__dino.sim;const h=s.groundY;__dino.look(s.x+a,h+b,s.z+c,s.x+d,h+e,s.z+f)}",list(cam))
    pg.screenshot(path=f'{out}/still{i}.png'); i+=1
