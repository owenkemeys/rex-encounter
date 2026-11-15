import json
pg.evaluate("__dino.setMode('foot'); __dino.advance(3)")
pg.screenshot(path=f'{out}/phone.png')
r=pg.evaluate("(()=>{__dino.advance(0.2); const i=__dino.renderer.info.render; return {tri:i.triangles,calls:i.drawCalls,verts:__dino.body.stats.verts,ms:__dino.body.stats.ms}})()")
print(json.dumps(r))
