"""A local stand-in for the share server (src/share.js), for testing "share your run" without the real one.
python3 tools/share_mock.py [port]   then set SHARE_API in src/share.js to http://127.0.0.1:<port> and build.
POST /tape (multipart: tape, still, seed) -> {"id"}; GET /tape/<id>; GET /still/<id>.jpg; GET /r/<id> -> preview page that sends people on to the game."""
import email.parser, email.policy, json, os, secrets, sys, tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

GAME = os.environ.get('GAME', 'https://rexencounter.com/')
STORE = tempfile.mkdtemp(prefix='rexshare-')


class H(BaseHTTPRequestHandler):
    def _send(self, code, body=b'', ctype='application/json'):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST')
        self.end_headers()

    def do_POST(self):
        if self.path != '/tape':
            return self._send(404)
        n = int(self.headers.get('Content-Length', 0))
        if n > 1_000_000:
            return self._send(413)
        msg = email.parser.BytesParser(policy=email.policy.HTTP).parsebytes(
            b'Content-Type: ' + self.headers['Content-Type'].encode() + b'\r\n\r\n' + self.rfile.read(n))
        parts = {p.get_param('name', header='content-disposition'): p.get_payload(decode=True) for p in msg.iter_parts()}
        if not parts.get('tape'):
            return self._send(400)
        i = secrets.token_urlsafe(5)
        os.makedirs(f'{STORE}/{i}')
        for k in ('tape', 'still', 'seed'):
            if parts.get(k):
                open(f'{STORE}/{i}/{k}', 'wb').write(parts[k])
        self._send(200, json.dumps({'id': i}).encode())

    def do_GET(self):
        bits = self.path.strip('/').split('/')
        if len(bits) != 2 or not os.path.isdir(f'{STORE}/{bits[1].removesuffix(".jpg")}'):
            return self._send(404)
        kind, i = bits[0], bits[1].removesuffix('.jpg')
        d = f'{STORE}/{i}'
        if kind == 'tape':
            return self._send(200, open(f'{d}/tape', 'rb').read(), 'application/octet-stream')
        if kind == 'still' and os.path.exists(f'{d}/still'):
            return self._send(200, open(f'{d}/still', 'rb').read(), 'image/jpeg')
        if kind == 'r':
            seed = open(f'{d}/seed').read().strip() if os.path.exists(f'{d}/seed') else ''
            to = f'{GAME}#tape={i}' + (f',seed{int(seed)}' if seed.isdigit() else '')
            base = f'http://{self.headers["Host"]}'
            page = f'''<!doctype html><meta charset="utf-8"><title>Rex Encounter</title>
<meta property="og:title" content="Rex Encounter"><meta property="og:description" content="Watch this visitor's last moments, then try the same rex.">
<meta property="og:image" content="{base}/still/{i}.jpg"><meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url={to}"><a href="{to}">watch the tape</a>'''
            return self._send(200, page.encode(), 'text/html; charset=utf-8')
        self._send(404)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8795
    print(f'share mock on http://127.0.0.1:{port}, storing in {STORE}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
