import os
import subprocess, time, socket, json
from playwright.sync_api import sync_playwright
s=socket.socket(); s.bind(('127.0.0.1',0)); PORT=s.getsockname()[1]; s.close()
srv=subprocess.Popen(['python3','-m','http.server',str(PORT),'-b','127.0.0.1','-d',os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','dist')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(0.7); out={}
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'])
    pg=b.new_page(viewport={'width':390,'height':780}); errs=[]
    pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.goto(f'http://127.0.0.1:{PORT}/index.html',wait_until='domcontentloaded',timeout=180000)
    pg.wait_for_function("document.getElementById('startGo') && !document.getElementById('startGo').disabled",timeout=240000)
    pg.evaluate("document.getElementById('startGo').click()"); time.sleep(25)
    pg.keyboard.press('Escape'); time.sleep(3)
    out['pauseShown']=pg.evaluate("getComputedStyle(document.getElementById('pause')).display!=='none'")
    out['btn']=pg.evaluate("(()=>{const b=document.getElementById('pDebug');if(!b)return null;const r=b.getBoundingClientRect();return [r.top|0,r.height|0,getComputedStyle(b).display]})()")
    pg.evaluate("document.getElementById('pDebug').scrollIntoView(); document.getElementById('pDebug').click()"); time.sleep(4)
    out['debugClass']=pg.evaluate("document.body.classList.contains('debug')")
    out['crashBtn']=pg.evaluate("(()=>{const b=document.getElementById('cHead');if(!b)return null;const r=b.getBoundingClientRect();return [r.top|0,r.height|0, !!(b.offsetParent)]})()")
    out['bodyClass']=pg.evaluate("document.body.className"); out['errs']=errs[:5]
    pg.screenshot(path='/tmp/dbgbtn.png',timeout=150000)
    b.close()
finally:
  srv.terminate()
print(json.dumps(out))
