# One page load: what Saltline's NPC objects carry (for the adapter's size and light measures). Writes out/inspect.json.
import json, subprocess, time, os, socket
from playwright.sync_api import sync_playwright
D=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','dist')
s=socket.socket(); s.bind(('127.0.0.1',0)); PORT=s.getsockname()[1]; s.close()
srv=subprocess.Popen(['python3','-m','http.server',str(PORT),'-b','127.0.0.1','-d',D],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(0.7)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'])
    pg=b.new_page(viewport={'width':640,'height':360}); logs=[]
    pg.on('console',lambda m: logs.append(m.type+': '+m.text[:300]) if m.type=='error' else None)
    pg.on('response', lambda r: logs.append('HTTP %d: %s' % (r.status, r.url)) if r.status >= 400 else None)
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?autostart=1&q=low',timeout=180000)
    pg.wait_for_function('window.__rex!==undefined',timeout=300000)
    pg.evaluate('()=>{__G.render.frame=()=>{}}')
    r=pg.evaluate('''()=>{const G=__G,s=__rex.sim,V=G.THREE.Vector3; G.enemies.spawn('hound',new V(s.x+9,0,s.z+3),{}); G.enemies.spawn('gull',new V(s.x+4,6,s.z-8),{});
      const out={player:Object.keys(G.player).filter(k=>/invul|god|health|yaw|pitch/.test(k)), tune:G.enemies.TUNE?Object.keys(G.enemies.TUNE):null};
      for(const e of G.enemies.list){ if(out[e.type]) continue; const rig=e.rig||{}; const info={keys:Object.keys(e).slice(0,90), rigKeys:Object.keys(rig), bones:rig.bones?Object.keys(rig.bones):null, lens:e.lens?[e.lens.r,e.lens.g,e.lens.b]:null, pos:[e.pos.x,e.pos.y,e.pos.z]};
        const meshes=[]; if(rig.group){rig.group.updateMatrixWorld(true); rig.group.traverse(o=>{if(o.isMesh||o.isLight||o.isPoints){const bb=o.geometry?(o.geometry.computeBoundingBox(),o.geometry.boundingBox):null; const m=o.material||{}; meshes.push([o.type,o.name,m.type,m.name,!!m.transparent,m.blending,m.emissive?m.emissive.getHexString():null,m.emissiveIntensity, bb?+(bb.max.y-bb.min.y).toFixed(2):null, o.visible]);}})}
        info.meshes=meshes.slice(0,40); if(rig.bones){const ys=[]; for(const k in rig.bones){const bn=rig.bones[k]; if(bn&&bn.getWorldPosition){const w=bn.getWorldPosition(new V()); ys.push(k+':'+w.y.toFixed(2));}} info.boneY=ys;}
        out[e.type]=info;}
      return out;}''')
    r['logs']=logs
    open(os.path.join(D,'..','out','inspect.json'),'w').write(json.dumps(r,indent=1)); print(json.dumps(r)[:6000])
    b.close()
finally: srv.kill()
