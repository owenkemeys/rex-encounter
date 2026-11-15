import sys, json, subprocess, time, os
from playwright.sync_api import sync_playwright
out=sys.argv[1]; script=sys.argv[2]; hashv=sys.argv[3] if len(sys.argv)>3 else '#test-webgl'
srv=subprocess.Popen(['python3','-m','http.server','8791','-d','/home/claude/rex/dist'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(0.7)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-unsafe-webgpu','--no-sandbox'])
    pg=b.new_page(viewport={'width':1100,'height':620}) if not os.environ.get('PHONE') else b.new_page(viewport={'width':780,'height':360},device_scale_factor=3,has_touch=True,is_mobile=True)
    logs=[]
    pg.on('console',lambda m: logs.append(m.type+': '+m.text))
    pg.on('pageerror',lambda e: logs.append('PAGEERROR: '+str(e)))
    pg.goto('http://localhost:8791/index.html'+hashv,timeout=180000)
    try: pg.wait_for_function('window.__dino!==undefined',timeout=180000)
    except Exception as e: print('boot fail',e)
    ns={'pg':pg,'out':out,'os':os,'json':json,'logs':logs}
    exec(open(script).read(),ns)
    print('\n'.join(logs[:25]))
    b.close()
finally: srv.kill()
