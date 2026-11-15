tag=os.environ.get('TAG','p')
pg.evaluate("document.body.classList.add('bare');__dino.setMind(false);__dino.post&&__dino.post.setVHS&&__dino.post.setVHS(false);__dino.advance(2)")
views={'side':"s.x+Math.cos(s.psi)*13,s.groundY+3,s.z-Math.sin(s.psi)*13,s.x+Math.sin(s.psi)*0.5,s.groundY+3,s.z+Math.cos(s.psi)*0.5",
       'head':"s.x+Math.sin(s.psi)*7+Math.cos(s.psi)*4,s.groundY+5,s.z+Math.cos(s.psi)*7-Math.sin(s.psi)*4,s.x+Math.sin(s.psi)*4,s.groundY+4.8,s.z+Math.cos(s.psi)*4",
       'feet':"s.x+Math.cos(s.psi)*5+Math.sin(s.psi)*3,s.groundY+1.2,s.z-Math.sin(s.psi)*5+Math.cos(s.psi)*3,s.x,s.groundY+0.4,s.z"}
for k,vv in views.items():
    pg.evaluate("(()=>{const s=__dino.sim;__dino.look(%s)})()"%vv)
    pg.screenshot(path=f'{out}/close_{k}_{tag}.png')
