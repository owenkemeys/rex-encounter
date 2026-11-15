# usage: python3 shot.py <script.py> [hash]   (runs the game page from /home/claude/rex_patch/dist; the script sees pg, out, logs)
import sys, json, subprocess, time, os, socket
from playwright.sync_api import sync_playwright
script=sys.argv[1]; hashv=sys.argv[2] if len(sys.argv)>2 else '#test-webgl'
out='/home/claude/rex_patch/out/img'
s=socket.socket(); s.bind(('127.0.0.1',0)); PORT=s.getsockname()[1]; s.close()
srv=subprocess.Popen(['python3','-m','http.server',str(PORT),'-b','127.0.0.1','-d','/home/claude/rex_patch/dist'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(0.7)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-unsafe-webgpu','--no-sandbox'])
    pg=b.new_page(viewport={'width':int(os.environ.get('W','960')),'height':int(os.environ.get('H','540'))}); pg.set_default_timeout(240000)
    logs=[]
    pg.on('console',lambda m: logs.append(m.type+': '+m.text))
    pg.on('pageerror',lambda e: logs.append('PAGEERROR: '+str(e)))
    pg.on('response',lambda r: logs.append('HTTP %d: %s'%(r.status,r.url)) if r.status>=400 else None)
    pg.goto(f'http://127.0.0.1:{PORT}/index.html'+hashv)
    try: pg.wait_for_function('window.__dino!==undefined',timeout=180000)
    except Exception as e: print('boot fail',e)
    ns={'pg':pg,'out':out,'os':os,'json':json,'logs':logs,'time':time}
    try: exec(open(script).read(),ns)
    except Exception as e: print('SCRIPT ERROR',str(e)[:500])
    print('\n'.join([l for l in logs if not l.startswith('debug')][:40]))
    b.close()
finally: srv.kill()
