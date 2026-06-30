import os
import socket
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs, unquote
from config import MUSIC_DIR, HTTP_PORT

ALLOWED_EXTENSIONS = {'.flac', '.mp3', '.aac', '.wav', '.aiff', '.ogg', '.opus', '.m4a', '.alac'}
UPLOAD_SUBDIR = 'Uploads'


def get_local_ip() -> str:
    # Prefer wlan0 IP directly — works whether Pi is a hotspot or on a home network
    try:
        import subprocess
        result = subprocess.run(['ip', 'addr', 'show', 'wlan0'],
                                capture_output=True, text=True, timeout=3)
        for line in result.stdout.splitlines():
            line = line.strip()
            if line.startswith('inet ') and not line.startswith('inet 127.'):
                return line.split()[1].split('/')[0]
    except Exception:
        pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'


class UploadHandler(BaseHTTPRequestHandler):
    mpd = None

    def log_message(self, fmt, *args):
        print(f'[HTTP] {fmt % args}')

    def do_GET(self):
        if self.path == '/ping':
            self._respond(200, 'pong')
        else:
            self._respond(404, 'Not Found')

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path != '/delete':
            self._respond(404, 'Not Found')
            return

        params = parse_qs(parsed.query)
        raw_path = params.get('path', [''])[0]
        if not raw_path:
            self._respond(400, 'Missing path')
            return

        rel_path = unquote(raw_path)
        music_root = os.path.realpath(MUSIC_DIR)
        resolved = os.path.realpath(os.path.join(music_root, rel_path))
        if not resolved.startswith(music_root + os.sep):
            self._respond(400, 'Invalid path')
            return

        try:
            os.remove(resolved)
            if self.mpd:
                try:
                    self.mpd.update()
                except Exception:
                    pass
            print(f'[HTTP] Deleted: {resolved}')
            self._respond(200, 'deleted')
        except FileNotFoundError:
            self._respond(404, 'Not Found')
        except Exception as e:
            self._respond(500, str(e))

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != '/upload':
            self._respond(404, 'Not Found')
            return

        params = parse_qs(parsed.query)
        raw_name = params.get('filename', [''])[0]
        if not raw_name:
            self._respond(400, 'Missing filename')
            return

        filename = os.path.basename(unquote(raw_name))
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            self._respond(400, f'Unsupported format: {ext}')
            return

        upload_dir = os.path.join(MUSIC_DIR, UPLOAD_SUBDIR)
        os.makedirs(upload_dir, exist_ok=True)
        dest = os.path.join(upload_dir, filename)

        length = int(self.headers.get('Content-Length', 0))
        try:
            with open(dest, 'wb') as f:
                remaining = length
                while remaining > 0:
                    chunk = self.rfile.read(min(65536, remaining))
                    if not chunk:
                        break
                    f.write(chunk)
                    remaining -= len(chunk)
        except Exception as e:
            print(f'[HTTP] Write error: {e}')
            self._respond(500, str(e))
            return

        if self.mpd:
            try:
                self.mpd.update()
            except Exception:
                pass

        print(f'[HTTP] Saved: {dest}')
        self._respond(200, filename)

    def _respond(self, code: int, body: str):
        b = body.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(b)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(b)


def start_http_server(mpd_controller) -> HTTPServer:
    UploadHandler.mpd = mpd_controller
    server = HTTPServer(('0.0.0.0', HTTP_PORT), UploadHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f'[HTTP] Upload server listening on port {HTTP_PORT}')
    return server
