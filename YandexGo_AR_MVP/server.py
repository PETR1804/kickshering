"""Local demo server: python server.py --port 8000"""
import argparse, json, time, threading, os
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
states = {}
lock = threading.Lock()
class Handler(SimpleHTTPRequestHandler):
    def api(self):
        return urlparse(self.path).path == '/api/pose'
    def room(self):
        return parse_qs(urlparse(self.path).query).get('room', ['demo'])[0][:80]
    def reply(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def do_GET(self):
        if not self.api(): return super().do_GET()
        with lock: entry = states.get(self.room())
        if not entry or time.monotonic() - entry[0] > 2:
            return self.reply(200, {'ready': False})
        self.reply(200, {'ready': True, **entry[1]})
    def do_POST(self):
        if not self.api(): return self.reply(404, {})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size < 32000: raise ValueError()
            data = json.loads(self.rfile.read(size))
            anchors = data['anchors']
            if not isinstance(anchors, dict) or len(anchors) > 20: raise ValueError()
            for point in anchors.values():
                if not isinstance(point, list) or len(point) != 2: raise ValueError()
                if not all(type(v) in (int, float) and abs(v) < 100 for v in point): raise ValueError()
            with lock:
                now = time.monotonic()
                for key in list(states):
                    if now - states[key][0] > 30: del states[key]
                states[self.room()] = (now, {'anchors': anchors})
            self.reply(200, {'ok': True})
        except (ValueError, KeyError, TypeError): self.reply(400, {'error': 'Invalid pose'})
    def log_message(self, fmt, *args):
        if not self.api(): super().log_message(fmt, *args)
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    os.chdir(Path(__file__).resolve().parent)
    print(f'Laptop: http://localhost:{args.port}/live.html', flush=True)
    print('Phone: HTTPS tunnel URL + /ar.html?live=1', flush=True)
    ThreadingHTTPServer(('0.0.0.0', args.port), Handler).serve_forever()
