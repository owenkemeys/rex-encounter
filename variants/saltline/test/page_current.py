# Saltline Rex with the shared (current) sim, in headless Chrome. Serves variants/saltline/dist, runs ~SECS s of game time with
# rendering off between samples, takes a screenshot of the animal, then provokes a seize/kill to check nothing throws.
#   python3 variants/saltline/test/page_current.py [secs]        writes variants/saltline/out/page_current.json and shots
import sys, json, subprocess, time, os, socket
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..'); D = os.path.join(ROOT, 'dist'); OUT = os.path.join(ROOT, 'out')
os.makedirs(os.path.join(OUT, 'shots'), exist_ok=True)
SECS = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 60
s = socket.socket(); s.bind(('127.0.0.1', 0)); PORT = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['python3', '-m', 'http.server', str(PORT), '-b', '127.0.0.1', '-d', D], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.7)
res = {'samples': [], 'console': [], 'shots': {}}
def log(*a): print(*a, flush=True)
try:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': 960, 'height': 540})
    pg.on('console', lambda m: res['console'].append(m.type + ': ' + m.text[:300] + ' @' + str(m.location.get('url', ''))[:120]) if m.type in ('error', 'warning') or '[saltrex]' in m.text else None)
    pg.on('pageerror', lambda e: res['console'].append('PAGEERROR: ' + str(e)[:500]))
    pg.on('response', lambda r: res['console'].append('HTTP %d: %s' % (r.status, r.url)) if r.status >= 400 else None)
    t0 = time.time()
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?autostart=1&q=low', timeout=180000)
    pg.wait_for_function('window.__ready===true', timeout=300000); log('ready', round(time.time() - t0, 1))
    pg.wait_for_function('window.__rex!==undefined', timeout=120000); log('rex', round(time.time() - t0, 1))
    J = lambda s, *a: pg.evaluate(s, *a)
    J('()=>{__G.player.invulnerable=true}')
    J('''()=>{const G=__G; G.__rf=G.render.frame; G.__frames=0; G.render.frame=(...a)=>{G.__frames++; return G.__rf(...a)};
      window.__ev={}; const A=__rex.arena; const o=A.step.bind(A); A.step=(...a)=>{const r=o(...a); for(const e of A.events){const k=(e.src||'?')+':'+e.type; window.__ev[k]=(window.__ev[k]||0)+1;} return r;};}''')
    time.sleep(8); res['frames_first'] = J('__G.__frames'); log('frames', res['frames_first'])
    J('()=>{__G.render.frame=()=>{}}')
    SAMPLE = '''()=>{const R=__rex,s=R.sim,m=R.mind,p=__G.player,v=R.arena.victim('you'); const h=s.head.pos;
      return {t:+R.stats.t.toFixed(1),d:+Math.hypot(s.x-p.pos.x,s.z-p.pos.z).toFixed(1),rex:[+s.x.toFixed(1),+s.z.toFixed(1)],y:+s.spine[13].p.y.toFixed(2),head:[+h.x.toFixed(1),+h.y.toFixed(1),+h.z.toFixed(1)],
        beh:m.beh&&m.beh.name,seen:m.know.seen,think:m.voice&&m.voice.think,victim:v.state,alive:p.alive,state:__G.game.state,errors:R.stats.errors,steps:R.stats.steps}}'''
    t1 = time.time()
    while time.time() - t1 < SECS:
      time.sleep(2)
      J('()=>{const p=__G.player; if(p.alive) p.health=Math.max(p.health,60)}')
      r = J(SAMPLE); res['samples'].append(r); log(json.dumps(r)[:300])
      # the person walks 3 m a sample (the step events Saltline would emit), and fires once at ~20 s and ~40 s of game time
      J('''(t)=>{const p=__G.player,s=__rex.sim; const dx=p.pos.x-s.x,dz=p.pos.z-s.z,a=Math.atan2(dx,dz)+0.25; const x=s.x+Math.sin(a)*Math.max(10,Math.hypot(dx,dz)), z=s.z+Math.cos(a)*Math.max(10,Math.hypot(dx,dz));
        const ok=!__G.physics.boxes.some(b=>x>b.min.x-0.6&&x<b.max.x+0.6&&z>b.min.z-0.6&&z<b.max.z+0.6&&b.max.y>0.3&&b.min.y<4); if(ok){p.pos.set(x,0,z);} __G.events.emit('player:step',{pos:p.pos,sprint:true,surface:'concrete'});
        if(Math.abs(t-20)<1.1||Math.abs(t-40)<1.1) __G.events.emit('weapon:fire',{origin:p.eye,dir:{x:0,y:0,z:-1}}); }''', r['t'])
    res['thoughts'] = J('(__rex.mind.voice.stream||[]).map(s=>s.t.toFixed(0)+" "+s.text)')
    res['events'] = J('window.__ev'); res['stats'] = J('__rex.stats'); log('events', res['events'])
    # standing spot: free ground r m from the animal, clear line to its chest, then aim at it
    PLACE = '''(a0)=>{const G=__G,s=__rex.sim,V=G.THREE.Vector3,B=G.physics.boxes,h=s.head.pos; let best=null;
      for(let k=0;k<72&&!best;k++){const a=a0+k*0.4363, r=13+(k%5)*1.5, x=s.x+Math.sin(a)*r, z=s.z+Math.cos(a)*r;
        if(B.some(b=>x>b.min.x-1.5&&x<b.max.x+1.5&&z>b.min.z-1.5&&z<b.max.z+1.5&&b.max.y>0.3&&b.min.y<4)) continue;
        if(Math.abs(G.physics.groundHeight(x,2,z))>0.3) continue;
        if(G.physics.lineOfSight({x,y:1.7,z},new V(s.x,1.8,s.z))&&G.physics.lineOfSight({x,y:1.7,z},new V(h.x,h.y,h.z))) best={x,z};}
      if(best){G.player.pos.set(best.x,0,best.z); G.player.vel.set(0,0,0);} return best;}'''
    res['place'] = J(PLACE, 0); log('place', res['place'])
    aim = lambda: J('''()=>{const s=__rex.sim,p=__G.player,h=s.head.pos; p.yaw=Math.atan2(-((s.x+h.x)/2-p.pos.x),-((s.z+h.z)/2-p.pos.z)); p.pitch=Math.atan2(h.y*0.6-p.eye.y, Math.hypot(s.x-p.pos.x,s.z-p.pos.z));}''')
    def shot(name):
      J('()=>{__G.render.frame=(...a)=>{__G.__frames++; return __G.__rf(...a)}}')
      f0 = J('__G.__frames'); ts = time.time()
      while J('__G.__frames') < f0 + 3 and time.time() - ts < 240: aim(); time.sleep(1)
      aim(); time.sleep(1.5)
      pg.screenshot(path=os.path.join(OUT, 'shots', name), timeout=150000); J('()=>{__G.render.frame=()=>{}}')
      res['shots'][name] = {'s': round(time.time() - ts), 'frames': J('__G.__frames') - f0, 'rex': J('(()=>{const s=__rex.sim;return [s.x,s.z,s.head.pos.y]})()')}; log('shot', name, res['shots'][name])
    shot('1_yard.png')
    res['place_b'] = J(PLACE, 2.2); log('place_b', res['place_b']); shot('2_yard_b.png')
    # a kill: the player 5 m in front of its head, mortal; wait for the seize/kill and the respawn flow
    res['place2'] = J('''()=>{const s=__rex.sim,p=__G.player,h=s.head.pos,f=s.head.f; p.invulnerable=false; p.health=100; p.pos.set(h.x+f.x*5,0,h.z+f.z*5); p.vel.set(0,0,0); return [p.pos.x,p.pos.z]}''')
    t2 = time.time(); res['kill'] = []
    while time.time() - t2 < 45:
      time.sleep(2); r = J(SAMPLE); res['kill'].append(r); log('kill?', json.dumps(r)[:260])
      if not r['alive'] or r['victim'] != 'free': 
        time.sleep(4); res['kill'].append(J(SAMPLE)); break
    res['console_end'] = len(res['console']); res['final'] = J(SAMPLE); res['stats2'] = J('__rex.stats'); res['events2'] = J('window.__ev')
    res['elapsed'] = round(time.time() - t0)
    b.close()
finally:
  srv.kill()
open(os.path.join(OUT, 'page_current.json'), 'w').write(json.dumps(res, indent=1))
log('console:'); log('\n'.join(res['console'][:40])); log('final', res.get('final')); log('elapsed', res.get('elapsed'))
