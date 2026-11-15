import sys, json, subprocess, time, os
PORT=os.environ.get('PORT','8791')
from playwright.sync_api import sync_playwright
out=sys.argv[1]; script=sys.argv[2]; hashv=sys.argv[3] if len(sys.argv)>3 else '#test-webgl'
srv=subprocess.Popen(['python3','-m','http.server',PORT,'-d',os.environ.get('DIST','/home/claude/rex/dist')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(0.7)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-unsafe-webgpu','--no-sandbox'])
    pg=b.new_page(viewport={'width':1100,'height':620}) if not os.environ.get('PHONE') else b.new_page(viewport={'width':780,'height':360},device_scale_factor=3,has_touch=True,is_mobile=True)
    pg.set_default_timeout(240000); logs=[]
    pg.on('console',lambda m: logs.append(m.type+': '+m.text))
    pg.on('pageerror',lambda e: logs.append('PAGEERROR: '+str(e)))
    pg.goto('http://localhost:'+PORT+'/index.html'+hashv, timeout=180000, wait_until='commit')
    try: pg.wait_for_function('window.__dino!==undefined',timeout=int(os.environ.get('BOOT','240000')))
    except Exception as e: print('boot fail',e)
    ns={'pg':pg,'out':out,'os':os,'json':json,'logs':logs}
    exec(open(script).read(),ns)
    print('\n'.join(logs[:25]))
    b.close()
finally: srv.kill()
