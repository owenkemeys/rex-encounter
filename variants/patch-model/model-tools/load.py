import sys, json, subprocess, time, socket, os
from playwright.sync_api import sync_playwright
name, hashv = sys.argv[1], sys.argv[2]
extra = sys.argv[3:]  # 'xvfb-webgpu'
s=socket.socket(); s.bind(('127.0.0.1',0)); PORT=s.getsockname()[1]; s.close()
D='/home/claude/rex_patch/dist'
srv=subprocess.Popen(['python3','-m','http.server',str(PORT),'-b','127.0.0.1','-d',D],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(0.7)
args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-unsafe-webgpu','--no-sandbox']
res={'name':name,'hash':hashv}
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=args)
    pg=b.new_page(viewport={'width':1280,'height':720})
    logs=[]
    pg.on('console',lambda m: logs.append(m.type+': '+m.text) if m.type in ('error','warning') else None)
    pg.on('pageerror',lambda e: logs.append('PAGEERROR: '+str(e)))
    pg.on('requestfailed',lambda r: logs.append('REQFAILED: '+r.url+' '+str(r.failure)))
    pg.on('response',lambda r: logs.append('HTTP %d: %s'%(r.status,r.url)) if r.status>=400 else None)
    t0=time.time()
    pg.goto(f'http://127.0.0.1:{PORT}/index.html{hashv}',wait_until='domcontentloaded',timeout=180000)
    try: pg.wait_for_selector('#startGo',state='visible',timeout=240000); res['start_card_s']=round(time.time()-t0,1)
    except Exception as e: res['start_card']='not seen: '+str(e)[:100]
    pg.wait_for_function('window.__rex!==undefined',timeout=240000)
    res['backend']=pg.evaluate('String(window.__rex.backend)')
    res['bodyCheck_before']=pg.evaluate('JSON.stringify(window.__bodyCheck||null)')
    try: pg.evaluate("document.getElementById('startGo').click()")
    except Exception as e: res['click']='fail '+str(e)[:100]
    time.sleep(1)
    res['started']=pg.evaluate("document.body.classList.contains('started')")
    time.sleep(20)
    res['bodyCheck']=pg.evaluate('JSON.stringify(window.__bodyCheck||null)')
    res['backend_after']=pg.evaluate('String(window.__rex.backend)')
    res['hash_after']=pg.evaluate('location.hash')
    try: res['perfReport']=pg.evaluate('window.__perfReport?JSON.stringify(window.__perfReport()):null')
    except Exception as e: res['perfReport_err']=str(e)[:200]
    try: res['perf_overlay_text']=pg.evaluate("(()=>{const e=[...document.querySelectorAll('*')].filter(x=>/perf/i.test(x.id+' '+x.className)&&x.innerText&&x.innerText.length>20);return e.map(x=>x.id+'|'+x.innerText).join('\\n---\\n')})()")
    except Exception as e: res['overlay_err']=str(e)[:200]
    pg.screenshot(path=f'/home/claude/rex_patch/out/img/real_{name}.png', timeout=150000)
    try:
      pg.wait_for_function("window.__bodyCheck&&window.__bodyCheck.stage==='done'",timeout=90000)
    except Exception: pass
    res['bodyCheck_final']=pg.evaluate('JSON.stringify(window.__bodyCheck||null)')
    try: res['perfReport_final']=pg.evaluate('window.__perfReport?JSON.stringify(window.__perfReport()):null')
    except Exception as e: res['pr_err']=str(e)[:100]
    b.close()
finally: srv.kill()
res['console']=logs
open(f'/home/claude/rex_patch/out/real_{name}.json','w').write(json.dumps(res,indent=1))
print(json.dumps(res,indent=1)[:4000])
