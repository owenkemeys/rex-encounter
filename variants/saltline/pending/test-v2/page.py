# The real page in headless Chrome (SwiftShader). Serves v2/dist, loads index.html?autostart=1&q=low, runs ~60 s of game time with
# rendering switched off between samples (SwiftShader takes seconds a frame), then takes three screenshots with rendering on.
#   python3 test/page.py [secs] [--spawn]       (--spawn: if no NPC is within 30 m of the animal at 5 s, ask Saltline's own
#                                                G.enemies.spawn for two hounds and a drone near it: a test lever)
# Writes out/page.json and out/shots/*.png.
import sys, json, subprocess, time, os, socket, math
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..'); D = os.path.join(ROOT, 'dist'); OUT = os.path.join(ROOT, 'out')
SECS = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 60
SPAWN = '--spawn' in sys.argv
NPCONLY = '--npcshot' in sys.argv      # only the NPC shot: two NPCs spawned beside the animal, an observer camera that has both in frame
s = socket.socket(); s.bind(('127.0.0.1', 0)); PORT = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['python3', '-m', 'http.server', str(PORT), '-b', '127.0.0.1', '-d', D], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.7)
res = {'samples': [], 'console': [], 'shots': {}}
def log(*a): print(*a, flush=True)
try:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': 960, 'height': 540})
    pg.on('console', lambda m: res['console'].append(m.type + ': ' + m.text[:500]) if m.type in ('error', 'warning') or '[saltrex]' in m.text or 'body check' in m.text else None)
    pg.on('pageerror', lambda e: res['console'].append('PAGEERROR: ' + str(e)[:500]))
    pg.on('response', lambda r: res['console'].append('HTTP %d: %s' % (r.status, r.url)) if r.status >= 400 else None)
    t0 = time.time()
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?autostart=1&q=low', timeout=180000)
    pg.wait_for_function('window.__ready===true', timeout=300000); res['ready_s'] = round(time.time() - t0, 1); log('ready', res['ready_s'])
    pg.wait_for_function('window.__rex!==undefined', timeout=120000); res['rex_s'] = round(time.time() - t0, 1); log('rex', res['rex_s'])
    J = lambda s, *a: pg.evaluate(s, *a)
    res['title'] = J('document.title')
    J('()=>{__G.player.invulnerable=true}')      # test lever: Saltline's NPCs must not end the run before the shots (the animal's own kill path clears it)
    J('''()=>{const G=__G; G.__rf=G.render.frame; G.__frames=0; G.render.frame=(...a)=>{G.__frames++; return G.__rf(...a)}; G.__on=true;
      window.__trk={clip:0,clipParts:{},samples:0,nan:0,stall:0,lastP:null};
      const R=__rex,T=R.T,sim=R.sim,mind=R.mind;
      const inBox=(x,y,z,m)=>{for(const b of T.boxes) if(!b.relief&&x>b.x0+m&&x<b.x1-m&&z>b.z0+m&&z<b.z1-m&&y>b.y0+m&&y<(b.top??b.y1)-m&&(b.y1-b.y0>=0.6||b.y0>0.5)) return b; return null};
      setInterval(()=>{const K=window.__trk; K.samples++; const parts=[['head',sim.head.pos],...sim.spine.slice(13).map((s,k)=>['spine'+(k+13),s.p]),...sim.feet.map((f,k)=>['foot'+k,f.pos])];
        let any=false; for(const [n,p] of parts){ if(!Number.isFinite(p.x+p.y+p.z)) K.nan++; if(inBox(p.x,p.y,p.z,0.25)){any=true;K.clipParts[n]=(K.clipParts[n]||0)+1;}} if(any)K.clip++;
        const G2=mind.intent&&mind.intent.goal, b=mind.beh, wants=(b&&b.route&&b.route.length&&Math.hypot(b.route[0].x-sim.x,b.route[0].z-sim.z)>4.5)||(G2&&G2.kind==='move'&&Math.hypot(G2.x-sim.x,G2.z-sim.z)>4.5);
        if(!K.lastP||Math.hypot(sim.x-K.lastP.x,sim.z-K.lastP.z)>1.5||!wants) K.lastP={x:sim.x,z:sim.z,t:R.stats.t}; else K.stall=Math.max(K.stall,R.stats.t-K.lastP.t);},250);
    }''')
    # one frame drawn first: the skin's program must compile and link on Saltline's renderer
    time.sleep(8)
    res['frames_first'] = J('__G.__frames')
    res['programs'] = J("""(()=>{const r=__G.render.renderer; return r&&r.info&&r.info.programs? r.info.programs.map(p=>p.name+':'+(p.diagnostics?(p.diagnostics.runnable?'ok':'FAIL'):'ok')).filter(s=>/MeshStandard|MeshPhysical|rex/i.test(s)).slice(0,12):null})()""")
    log('frames drawn', res['frames_first'], res['programs'])
    J('()=>{__G.render.frame=()=>{}}')
    SAMPLE = '''()=>{const R=__rex,s=R.sim,m=R.mind,p=__G.player,v=R.arena.victim('you'),cr=R.creatures(); const g=m.att.glancing('tilt');
      const near=cr.map(c=>({id:c.id,d:+Math.hypot(c.x-s.x,c.z-s.z).toFixed(1),h:+c.h.toFixed(2),ground:c.ground,light:+c.light.toFixed(2)})).sort((a,b)=>a.d-b.d).slice(0,4);
      return {t:+R.stats.t.toFixed(1),d:+Math.hypot(s.x-p.pos.x,s.z-p.pos.z).toFixed(1),rex:[+s.x.toFixed(1),+s.z.toFixed(1)],beh:m.beh&&m.beh.name,att:(g&&g.key)||m.att.focusKey(),seen:m.know.seen,
        think:m.voice&&m.voice.think,victim:v.state,alive:p.alive,hp:p.health,state:__G.game.state,npcs:cr.length,near,others:m.others.summary().filter(o=>!o.gone).slice(0,6).map(o=>o.id+':'+o.name+'='+o.verdict),stats:JSON.parse(JSON.stringify(R.stats))}}'''
    spawned = False
    t1 = time.time()
    while time.time() - t1 < (8 if NPCONLY else SECS):
      time.sleep(2)
      J('()=>{const p=__G.player; if(p.alive) p.health=Math.max(p.health,60)}')
      r = J(SAMPLE); res['samples'].append(r); log(json.dumps(r)[:400])
      if SPAWN and not spawned and r['t'] > 5 and not any(n['d'] < 30 for n in r['near']):
        spawned = True
        res['spawned'] = J('''()=>{const G=__G,s=__rex.sim,V=G.THREE.Vector3,out=[]; try{ out.push(!!G.enemies.spawn('hound',new V(s.x+9,0,s.z+3),{})); out.push(!!G.enemies.spawn('hound',new V(s.x-8,0,s.z+6),{})); out.push(!!G.enemies.spawn('gull',new V(s.x+4,6,s.z-8),{})); }catch(e){out.push(String(e))} return out}''')
        log('spawned', res['spawned'])
    res['track'] = J('window.__trk')
    res['thoughts'] = J('(__rex.mind.voice.stream||[]).map(s=>s.t.toFixed(0)+" "+s.text+" ["+(s.about||"")+"]")')
    res['others'] = J('__rex.mind.others.summary()')
    res['urges'] = J('__rex.mind.others.log')
    # ---- screenshots (rendering on for each; SwiftShader: allow minutes)
    # a standing spot for the player: on open ground (in no box, not under one), r0..r1 from (cx, cz), seeing every target point
    J('''()=>{window.__place=(cx,cz,r0,r1,a0,spread,targets)=>{const G=__G,V=G.THREE.Vector3,B=G.physics.boxes; let best=null;
      // every box (fences, glass, bullet-only ones included) between the eye and the target, by the slab test
      const segBox=(ax,ay,az,bx,by,bz)=>{const d=[bx-ax,by-ay,bz-az],o=[ax,ay,az]; for(const q of B){ if(q.max.y<0.15) continue; let t0=0.02,t1=0.97,ok=true; const mn=[q.min.x,q.min.y,q.min.z],mx=[q.max.x,q.max.y,q.max.z];
        for(let i=0;i<3&&ok;i++){ if(Math.abs(d[i])<1e-9){ if(o[i]<mn[i]||o[i]>mx[i]) ok=false; } else { let u=(mn[i]-o[i])/d[i], w=(mx[i]-o[i])/d[i]; if(u>w){const tt=u;u=w;w=tt;} t0=Math.max(t0,u); t1=Math.min(t1,w); if(t0>t1) ok=false; } }
        if(ok) return true; } return false; };
      for(let k=0;k<72;k++){const a=a0+(((k*37)%72)/72-0.5)*2*spread, r=r0+(r1-r0)*((k*13)%7)/6, x=cx+Math.sin(a)*r, z=cz+Math.cos(a)*r;
        if(B.some(b=>x>b.min.x-0.6&&x<b.max.x+0.6&&z>b.min.z-0.6&&z<b.max.z+0.6&&b.max.y>0.3&&b.min.y<4)) continue;
        if(Math.abs(G.physics.groundHeight(x,2,z))>0.3) continue;
        if(targets.every(t=>!segBox(x,1.7,z,t.x,t.y,t.z))){best={x,z,a};break;}}
      if(best&&!window.__noMove){const p=G.player; p.pos.set(best.x,0,best.z); p.vel.set(0,0,0);} return best;};
      window.__placeOk=(x,z,targets)=>{const B=__G.physics.boxes; const segBox=(ax,ay,az,bx,by,bz)=>{const d=[bx-ax,by-ay,bz-az],o=[ax,ay,az]; for(const q of B){ if(q.max.y<0.15) continue; let t0=0.02,t1=0.97,ok=true; const mn=[q.min.x,q.min.y,q.min.z],mx=[q.max.x,q.max.y,q.max.z];         for(let i=0;i<3&&ok;i++){ if(Math.abs(d[i])<1e-9){ if(o[i]<mn[i]||o[i]>mx[i]) ok=false; } else { let u=(mn[i]-o[i])/d[i], w=(mx[i]-o[i])/d[i]; if(u>w){const tt=u;u=w;w=tt;} t0=Math.max(t0,u); t1=Math.min(t1,w); if(t0>t1) ok=false; } }         if(ok) return true; } return false; }; return !B.some(b=>x>b.min.x-0.6&&x<b.max.x+0.6&&z>b.min.z-0.6&&z<b.max.z+0.6&&b.max.y>0.3&&b.min.y<4)&&targets.every(t=>!segBox(x,1.7,z,t.x,t.y,t.z));};}''')
    def face(tx, ty, tz):
      J(f'''()=>{{const p=__G.player; p.yaw=Math.atan2(-({tx}-p.pos.x),-({tz}-p.pos.z)); p.pitch=Math.atan2({ty}-p.eye.y, Math.hypot({tx}-p.pos.x,{tz}-p.pos.z));}}''')
    def vm(show):      # Saltline's first-person rifle (its own group 'viewmodel-pac9'): hidden for the close-up and the NPC shot only
      return J('''(show)=>{const G=__G,roots=[G.scene,G.camera,G.viewCamera,G.render&&G.render.scene,G.render&&G.render.viewCamera,G.render&&G.render.viewScene].filter(Boolean); let n=0;
        for(const r of roots){ if(r.traverse) r.traverse(o=>{ if(o.name==='viewmodel-pac9'){o.visible=show;n++;} }); } return n}''', show)
    def shot(name, aim, fov=None):
      # (fov: a narrower lens for the close-up, set right before each render so Saltline's own per-frame camera update cannot undo it)
      J('(fov)=>{__G.render.frame=(...a)=>{__G.__frames++; const c=__G.camera; if(fov){c.fov=fov; c.updateProjectionMatrix();} if(window.__camOverride){const o=window.__camOverride(); if(o){c.position.set(o.p[0],o.p[1],o.p[2]); c.up.set(0,1,0); c.lookAt(o.t[0],o.t[1],o.t[2]); c.updateMatrixWorld(true);}} return __G.__rf(...a)}}', fov); f0 = J('__G.__frames'); ts = time.time()
      while J('__G.__frames') < f0 + 3 and time.time() - ts < 240: aim(); time.sleep(1)
      aim(); time.sleep(1.5)
      path = os.path.join(OUT, 'shots', name); pg.screenshot(path=path, timeout=150000); J('()=>{__G.render.frame=()=>{}}')
      res['shots'][name] = {'s': round(time.time() - ts), 'frames': J('__G.__frames') - f0}; log('shot', name, res['shots'][name])
    rex_aim = lambda: J('''()=>{const s=__rex.sim,p=__G.player; const h=s.head.pos; p.yaw=Math.atan2(-((s.x+h.x)/2-p.pos.x),-((s.z+h.z)/2-p.pos.z)); p.pitch=Math.atan2(h.y*0.6-p.eye.y, Math.hypot(s.x-p.pos.x,s.z-p.pos.z));}''')
    # 1. the animal in the yard, from where the player is (moved back to ~18 m if closer or further than 10-35 m)
    res['place1'] = J('''()=>{const s=__rex.sim,p=__G.player,h=s.head.pos; return __place(s.x,s.z,12,20,Math.atan2(p.pos.x-s.x,p.pos.z-s.z),Math.PI,[{x:h.x,y:h.y,z:h.z},{x:s.x,y:2.5,z:s.z},{x:s.x,y:0.8,z:s.z}])}''')
    if not NPCONLY: shot('1_yard.png', rex_aim)
    # 2. close: the player 7 m in front of its head, standing still; a few seconds for it to look; then where its eyes point
    res['place2'] = J('''()=>{const s=__rex.sim,h=s.head.pos,f=s.head.f; return __place(h.x,h.z,7,9.5,Math.atan2(f.x,f.z),0.8,[{x:h.x,y:h.y,z:h.z},{x:h.x,y:h.y-0.6,z:h.z}])}''')
    time.sleep(5)
    eye_aim = lambda: J('''()=>{const s=__rex.sim,p=__G.player,h=s.head.pos; p.yaw=Math.atan2(-(h.x-p.pos.x),-(h.z-p.pos.z)); p.pitch=Math.atan2(h.y-p.eye.y, Math.hypot(h.x-p.pos.x,h.z-p.pos.z));}''')
    res['vm_hidden'] = vm(False)
    if not NPCONLY: shot('2_eyes.png', eye_aim, 24)
    res['eyes'] = J('''()=>{const B=__rex.body,p=__G.player,V=__G.THREE.Vector3,out=[]; for(const E of B.eyes){E.e.updateMatrixWorld(true); const m=E.e.matrixWorld, c=new V().setFromMatrixPosition(m), z=new V().setFromMatrixColumn(m,2).normalize(), to=new V(p.eye.x,p.eye.y,p.eye.z).sub(c).normalize(); out.push(+(Math.acos(Math.max(-1,Math.min(1,z.dot(to))))*57.3).toFixed(1));}
      const fx=__rex.sim.fix, offFix=[]; for(const E of B.eyes){const m=E.e.matrixWorld, c=new V().setFromMatrixPosition(m), z=new V().setFromMatrixColumn(m,2).normalize(), to=new V(fx.x,fx.y,fx.z).sub(c).normalize(); offFix.push(+(Math.acos(Math.max(-1,Math.min(1,z.dot(to))))*57.3).toFixed(1));} return {offDeg:out, offFixDeg:offFix, fixToPlayer:+Math.hypot(fx.x-p.eye.x,fx.y-p.eye.y,fx.z-p.eye.z).toFixed(2), bodyFixIsLive:B.fix===__rex.sim.fix, d:+Math.hypot(__rex.sim.head.pos.x-p.pos.x,__rex.sim.head.pos.z-p.pos.z).toFixed(1), look:__rex.mind.voice&&__rex.mind.voice.look}}''')
    log('eyes', res['eyes'])
    # 3. an NPC and the animal in frame: the nearest live NPC (spawned by Saltline's own spawn if none is within 30 m)
    if NPCONLY:
      res['spawnN'] = J('''()=>{const G=__G,s=__rex.sim,V=G.THREE.Vector3,f=s.head.f,l=Math.hypot(f.x,f.z)||1,fx=f.x/l,fz=f.z/l; try{ G.enemies.spawn('hound',new V(s.x+fx*9-fz*3,0,s.z+fz*9+fx*3),{passive:true}); G.enemies.spawn('gull',new V(s.x+fx*7+fz*3,5,s.z+fz*7-fx*3),{passive:true,hover:5}); return true}catch(e){return String(e)}}''')
      time.sleep(3)
    n = J('''()=>{const s=__rex.sim; let b=null,bd=1e9; for(const e of __G.enemies.list) if(e.alive&&e.active!==false){const d=Math.hypot(e.pos.x-s.x,e.pos.z-s.z); if(d<bd){bd=d;b=e;}} return b?{id:b.id,d:bd}:null}''')
    if not n or n['d'] > 30:
      res['spawn3'] = J('''()=>{const G=__G,s=__rex.sim,V=G.THREE.Vector3; try{const a=G.enemies.spawn('hound',new V(s.x+7,0,s.z+4),{}); const b2=G.enemies.spawn('gull',new V(s.x+3,5,s.z+6),{}); return [!!a,!!b2]}catch(e){return String(e)}}''')
      time.sleep(4)
    J('''()=>{const s=__rex.sim,p=__G.player; let b=null,bd=1e9; for(const e of __G.enemies.list) if(e.alive&&e.active!==false){const d=Math.hypot(e.pos.x-s.x,e.pos.z-s.z)-(e.pos.y>2?30:0); if(d<bd){bd=d;b=e;}}
      window.__npcShot=b; if(!b) return; const mx=(s.x+b.pos.x)/2, mz=(s.z+b.pos.z)/2, dx=b.pos.x-s.x, dz=b.pos.z-s.z; window.__place3=b.pos.y>2?__place(s.x,s.z,14,20,Math.atan2(-dx,-dz),0.7,[{x:s.head.pos.x,y:s.head.pos.y,z:s.head.pos.z},{x:s.x,y:2,z:s.z},{x:b.pos.x,y:b.pos.y,z:b.pos.z}]):__place(b.pos.x,b.pos.z,5,8,Math.atan2(dx,dz),0.9,[{x:s.head.pos.x,y:s.head.pos.y,z:s.head.pos.z},{x:s.x,y:2,z:s.z},{x:b.pos.x,y:b.pos.y+0.5,z:b.pos.z}]);}''')
    res['place3'] = J('window.__place3')
    npc_aim = lambda: J('''()=>{const s=__rex.sim,p=__G.player,b=window.__npcShot; if(!b) return; const w=b.pos.y>2?0.5:0.6, mx=b.pos.x*w+s.head.pos.x*(1-w), my=(b.pos.y+0.5)*w+(b.pos.y>2?s.head.pos.y*0.7:s.head.pos.y)*(1-w), mz=b.pos.z*w+s.head.pos.z*(1-w); p.yaw=Math.atan2(-(mx-p.pos.x),-(mz-p.pos.z)); p.pitch=Math.atan2(my-p.eye.y, Math.hypot(mx-p.pos.x,mz-p.pos.z));}''')
    # NPC shots from the PLAYER's camera: the player is moved to a free spot from which the animal's head and the NPC both project
    # well inside the frame (and nothing solid is between), then aimed at the point between them
    def npc_shot(name, flying):
      ok = J('''(flying)=>{const s=__rex.sim; let b=null,bd=1e9; for(const e of __G.enemies.list) if(e.alive&&e.active!==false&&((e.pos.y>2)===flying)){const d=Math.hypot(e.pos.x-s.x,e.pos.z-s.z); if(d<bd){bd=d;b=e;}}
        window.__npcShot=b; if(!b) return null; const cam=__G.camera.clone(); cam.aspect=960/540; cam.updateProjectionMatrix(); const V=__G.THREE.Vector3; let best=null;
        for(let k=0;k<144&&!best;k++){ const a=k/48*6.283, r=8+(k%6)*2.5, x=(s.x+b.pos.x)/2+Math.sin(a)*r, z=(s.z+b.pos.z)/2+Math.cos(a)*r;
          const mx=(b.pos.x+s.head.pos.x)/2, my=(b.pos.y+0.4+s.head.pos.y*0.75)/2, mz=(b.pos.z+s.head.pos.z)/2; cam.position.set(x,1.7,z); cam.lookAt(mx,my,mz); cam.updateMatrixWorld(true);
          const P=(px,py,pz)=>new V(px,py,pz).project(cam), h=P(s.head.pos.x,s.head.pos.y,s.head.pos.z), n=P(b.pos.x,b.pos.y+0.4,b.pos.z);
          if([h,n].every(v=>Math.abs(v.x)<0.7&&Math.abs(v.y)<0.75&&v.z<1)&&__placeOk(x,z,[{x:s.head.pos.x,y:s.head.pos.y,z:s.head.pos.z},{x:s.x,y:1.5,z:s.z},{x:b.pos.x,y:b.pos.y+0.4,z:b.pos.z}])) best={x,z}; }
        if(best){const p=__G.player; p.pos.set(best.x,0,best.z); p.vel.set(0,0,0);} return best?{x:best.x,z:best.z,type:b.type,d:+bd.toFixed(1)}:{none:true,type:b.type};}''', flying)
      res['place_'+name] = ok; log('place', name, ok)
      aim = lambda: J('''()=>{const s=__rex.sim,p=__G.player,b=window.__npcShot; if(!b) return; const mx=(b.pos.x+s.head.pos.x)/2, my=(b.pos.y+0.4+s.head.pos.y*0.75)/2, mz=(b.pos.z+s.head.pos.z)/2; p.yaw=Math.atan2(-(mx-p.pos.x),-(mz-p.pos.z)); p.pitch=Math.atan2(my-p.eye.y, Math.hypot(mx-p.pos.x,mz-p.pos.z));}''')
      shot(name, aim)
      res['inview_'+name] = J('''()=>{const c=__G.camera,V=__G.THREE.Vector3,s=__rex.sim,b=window.__npcShot; c.updateMatrixWorld(); const pr=(x,y,z)=>{const v=new V(x,y,z).project(c); return [+v.x.toFixed(2),+v.y.toFixed(2)]}; return {rexHead:pr(s.head.pos.x,s.head.pos.y,s.head.pos.z), npc:b?pr(b.pos.x,b.pos.y+0.4,b.pos.z):null}}''')
      log('inview', name, res['inview_'+name])
    vm(True)
    npc_shot('3_hound.png', False)
    npc_shot('4_drone.png', True)
    vm(True)
    res['npc_in_view'] = J('''()=>{const c=__G.camera,V=__G.THREE.Vector3,s=__rex.sim,b=window.__npcShot; c.updateMatrixWorld(); const pr=(x,y,z)=>{const v=new V(x,y,z).project(c); return [+v.x.toFixed(2),+v.y.toFixed(2),+v.z.toFixed(3)]}; return {rexHead:pr(s.head.pos.x,s.head.pos.y,s.head.pos.z), rexHips:pr(s.x,2,s.z), npc:b?pr(b.pos.x,b.pos.y+0.5,b.pos.z):null}}''')
    log('npc_in_view', res['npc_in_view'])
    res['npc_shot'] = J('''()=>{const b=window.__npcShot,s=__rex.sim; return b?{type:b.type,d:+Math.hypot(b.pos.x-s.x,b.pos.z-s.z).toFixed(1),y:+b.pos.y.toFixed(1)}:null}''')
    if not NPCONLY:
      # the rifle: five rounds through Saltline's own G.combat.playerShot (as its weapon calls it) at the animal's chest, each with
      # the weapon:fire event; does the round stop in the animal (an impact on it), and what does the mind make of it?
      res['rifle_before'] = J('({hits:__rex.stats.hits.you, grudge:__rex.mind.grudge, pain:__rex.mind.pain, verdict:__rex.mind.ap.verdict})')
      J('''()=>{window.__imp=[]; __G.events.on('impact',e=>{ if(e&&e.from==='player') window.__imp.push(e.surface+(e.rex?':rex':'')); });}''')
      for k in range(5):
        J('''()=>{const p=__G.player,s=__rex.sim,o=p.eye,t=s.spine[18].p,V=__G.THREE.Vector3; const d=new V(t.x-o.x,t.y-o.y,t.z-o.z).normalize(); const O=new V(o.x,o.y,o.z);
          __G.events.emit('weapon:fire',{origin:O,dir:d}); window.__lastShot=__G.combat.playerShot(O,d,{damage:26,range:300});}''')
        time.sleep(0.6)
      time.sleep(2)
      res['rifle_after'] = J('({hits:__rex.stats.hits.you, grudge:+__rex.mind.grudge.toFixed(2), pain:+__rex.mind.pain.toFixed(2), verdict:__rex.mind.ap.verdict, impacts:window.__imp, beh:__rex.mind.beh&&__rex.mind.beh.name, think:__rex.mind.voice.think, d:+Math.hypot(__rex.sim.x-__G.player.pos.x,__rex.sim.z-__G.player.pos.z).toFixed(1)})')
      log('rifle', res['rifle_before'], res['rifle_after'])
    res['final'] = J(SAMPLE)
    res['elapsed'] = round(time.time() - t0)
    b.close()
finally:
  srv.kill()
open(os.path.join(OUT, 'page_npcshot.json' if NPCONLY else 'page.json'), 'w').write(json.dumps(res, indent=1))
log('console:'); log('\n'.join(res['console'][:40]))
log('track', res.get('track')); log('eyes', res.get('eyes')); log('elapsed', res.get('elapsed'))
