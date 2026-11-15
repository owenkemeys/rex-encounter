tag=os.environ.get('TAG','p')
pg.evaluate("document.body.classList.add('bare');__dino.applyMood('day');__dino.setMind(false);__dino.advance(2)")
print(pg.evaluate("JSON.stringify({m:window.__rexModel, x:__dino.sim.x, z:__dino.sim.z, psi:__dino.sim.psi})"))
views={'side':"s.x+Math.cos(s.psi)*16,s.groundY+3,s.z-Math.sin(s.psi)*16,s.x,s.groundY+3,s.z",
       'front':"s.x+Math.sin(s.psi)*14+3,s.groundY+3,s.z+Math.cos(s.psi)*14,s.x,s.groundY+3,s.z",
       'back':"s.x-Math.sin(s.psi)*16+4,s.groundY+5,s.z-Math.cos(s.psi)*16,s.x,s.groundY+3,s.z"}
for k,vv in views.items():
    pg.evaluate("(()=>{const s=__dino.sim;__dino.look(%s)})()"%vv)
    pg.screenshot(path=f'{out}/stand_{k}_{tag}.png')
