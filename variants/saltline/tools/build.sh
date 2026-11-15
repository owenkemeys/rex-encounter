#!/bin/sh
# Build v2/dist/: Saltline's page with its title set to "Saltline Rex" and one loader script appended, the rex bundle, the
# clips it uses, credits. Run from anywhere: sh variants/saltline/tools/build.sh (after npm i at the repo root)
set -e; cd "$(dirname "$0")/.."
ESB="$(cd ../.. && pwd)/node_modules/.bin/esbuild"
mkdir -p dist/audio
$ESB src/main.js --bundle --format=iife --alias:three=./src/three-shim.cjs --minify --outfile=dist/saltrex.js --log-level=warning
for n in $(node -e "import('./src/audio.js').then(m=>console.log(m.AUDIO_FILES.join(' ')))"); do cp ../../dist/audio/$n.mp3 dist/audio/; done
cp ../../dist/audio/CREDITS.md dist/audio/CREDITS.md
python3 - <<'PY'
import re
src=open('ref/saltline_orig.html').read()
n=len(re.findall(r'<title>[^<]*</title>',src)); assert n==1, n
src=re.sub(r'<title>[^<]*</title>','<title>Saltline Rex</title>',src)
loader='''<script>/* Saltline Rex: Dino Hunter's T. rex in Saltline. Waits for Saltline's boot, then loads the animal (saltrex.js). */
(function(){var t=setInterval(function(){if(window.__ready&&window.__G&&window.__G.enemies){clearInterval(t);var s=document.createElement('script');s.src='saltrex.js';document.body.appendChild(s);}},100);})();</script>
'''
assert src.rstrip().endswith('</script>')
open('dist/index.html','w').write(src.rstrip()+'\n'+loader)
PY
ls -la dist dist/audio
