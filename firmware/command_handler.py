import json
import subprocess
import base64 as b64
from gi.repository import GLib
from config import MAX_CHUNK_BYTES, MAX_SAFE_BYTES, HTTP_PORT
from mpd_controller import MPDController
from library_manager import build_library
from http_server import get_local_ip

EQ_BANDS = [
    '00. 31 Hz', '01. 63 Hz', '02. 125 Hz', '03. 250 Hz', '04. 500 Hz',
    '05. 1 kHz', '06. 2 kHz', '07. 4 kHz', '08. 8 kHz', '09. 16 kHz',
]

EQ_PRESETS = {
    'flat':   [50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
    'bass':   [72, 67, 60, 54, 48, 46, 46, 46, 46, 46],
    'vocal':  [38, 40, 43, 50, 63, 68, 63, 54, 48, 46],
    'treble': [46, 46, 46, 46, 46, 48, 54, 62, 70, 76],
}


class CommandHandler:
    def __init__(self, mpd: MPDController, send_notification):
        self.mpd = mpd
        self._send = send_notification  # callable(json_dict)
        self._chunk_queue: list = []

    def handle(self, raw: str):
        try:
            command = json.loads(raw)
        except json.JSONDecodeError:
            print(f'[CMD] Invalid JSON: {raw}')
            return

        cmd = command.get('cmd')
        req_id = command.get('_id')

        print(f'[CMD] {cmd}')

        handler = {
            'PING': self._ping,
            'PLAY': self._play,
            'PAUSE': self._pause,
            'STOP': self._stop,
            'NEXT': self._next,
            'PREVIOUS': self._previous,
            'SET_VOLUME': self._set_volume,
            'SET_POSITION': self._set_position,
            'PLAY_SONG': self._play_song,
            'PLAY_ALBUM': self._play_album,
            'PLAY_PLAYLIST': self._play_playlist,
            'SHUFFLE': self._shuffle,
            'REPEAT': self._repeat,
            'GET_NOW_PLAYING': self._get_now_playing,
            'GET_LIBRARY': self._get_library,
            'GET_QUEUE': self._get_queue,
            'GET_BATTERY': self._get_battery,
            'GET_STORAGE': self._get_storage,
            'GET_ALBUM_ART': self._get_album_art,
            'GET_INFO': self._get_info,
            'SHUTDOWN': self._shutdown,
            'DELETE_TRACK': self._delete_track,
            'SET_EQ': self._set_eq,
            'SCAN_WIFI': self._scan_wifi,
            'CONNECT_WIFI': self._connect_wifi,
            'GET_WIFI_STATUS': self._get_wifi_status,
        }.get(cmd)

        if handler is None:
            self._send_small({'type': 'ERROR', 'cmd': cmd, 'msg': f'Unknown command: {cmd}', '_id': req_id})
            return

        try:
            handler(command, req_id)
        except Exception as e:
            print(f'[CMD] Error handling {cmd}: {e}')
            self._send_small({'type': 'ERROR', 'cmd': cmd, 'msg': str(e), '_id': req_id})

    def _send_small(self, data: dict):
        self._send(data)

    def _send_large(self, data: dict):
        payload = json.dumps(data)
        req_id = data.get('_id') or 'push'
        self._send_chunked(payload, req_id)

    def _send_chunked(self, payload: str, req_id: str):
        encoded = b64.b64encode(payload.encode('utf-8')).decode('ascii')

        if len(encoded) <= MAX_SAFE_BYTES:
            self._send(json.loads(payload))
            return

        chunks = [encoded[i:i + MAX_CHUNK_BYTES] for i in range(0, len(encoded), MAX_CHUNK_BYTES)]
        total = len(chunks)
        print(f'[CMD] Chunking {req_id} → {total} packets ({len(encoded)} chars)')

        packets = [
            {
                'type': 'CHUNK_END' if i == total - 1 else 'CHUNK',
                '_id': req_id,
                'seq': i + 1,
                'total': total,
                'data': chunk_data,
            }
            for i, chunk_data in enumerate(chunks)
        ]
        was_empty = not self._chunk_queue
        self._chunk_queue.extend(packets)
        if was_empty:
            GLib.timeout_add(30, self._drain_chunk_queue)

    def _drain_chunk_queue(self):
        if not self._chunk_queue:
            return False
        chunk = self._chunk_queue.pop(0)
        print(f'[CHUNK] Sending seq={chunk.get("seq")}/{chunk.get("total")} id={chunk.get("_id")} size={len(str(chunk))}')
        self._send(chunk)
        if self._chunk_queue:
            GLib.timeout_add(15, self._drain_chunk_queue)
        return False

    def _ping(self, cmd, req_id):
        self._send_small({'type': 'PONG', '_id': req_id})

    def _play(self, cmd, req_id):
        self.mpd.play()
        self._send_small({'type': 'OK', 'cmd': 'PLAY', '_id': req_id})
        self._push_now_playing(None)

    def _pause(self, cmd, req_id):
        self.mpd.pause()
        self._send_small({'type': 'OK', 'cmd': 'PAUSE', '_id': req_id})
        self._push_now_playing(None)

    def _stop(self, cmd, req_id):
        self.mpd.stop()
        self._send_small({'type': 'OK', 'cmd': 'STOP', '_id': req_id})

    def _next(self, cmd, req_id):
        self.mpd.next()
        self._send_small({'type': 'OK', 'cmd': 'NEXT', '_id': req_id})
        self._push_now_playing(None)

    def _previous(self, cmd, req_id):
        self.mpd.previous()
        self._send_small({'type': 'OK', 'cmd': 'PREVIOUS', '_id': req_id})
        self._push_now_playing(None)

    def _set_volume(self, cmd, req_id):
        self.mpd.set_volume(int(cmd.get('value', 75)))
        self._send_small({'type': 'OK', 'cmd': 'SET_VOLUME', '_id': req_id})

    def _set_position(self, cmd, req_id):
        self.mpd.seek(float(cmd.get('seconds', 0)))
        self._send_small({'type': 'OK', 'cmd': 'SET_POSITION', '_id': req_id})

    def _play_song(self, cmd, req_id):
        path = cmd.get('path', '')
        if not path:
            self._send_small({'type': 'ERROR', 'cmd': 'PLAY_SONG', 'msg': 'No path', '_id': req_id})
            return
        # Populate the full library into the MPD queue so autoplay and shuffle work
        all_files = self.mpd.get_all_file_paths()
        if not all_files:
            all_files = [path]
        self.mpd.clear_queue_and_add(all_files)
        try:
            idx = all_files.index(path)
            self.mpd.play_at(idx)
        except (ValueError, Exception):
            self.mpd.play()
        self._push_now_playing(req_id)

    def _play_album(self, cmd, req_id):
        library = build_library(self.mpd)
        album_id = cmd.get('id')
        album = next((a for a in library['albums'] if a['id'] == album_id), None)
        if not album:
            self._send_small({'type': 'ERROR', 'cmd': 'PLAY_ALBUM', 'msg': 'Album not found', '_id': req_id})
            return
        files = [s['path'] for s in album['songs']]
        self.mpd.clear_queue_and_add(files)
        self.mpd.play()
        self._push_now_playing(req_id)

    def _play_playlist(self, cmd, req_id):
        self._send_small({'type': 'ERROR', 'cmd': 'PLAY_PLAYLIST', 'msg': 'Not implemented', '_id': req_id})

    def _shuffle(self, cmd, req_id):
        self.mpd.set_shuffle(bool(cmd.get('enabled', False)))
        self._send_small({'type': 'OK', 'cmd': 'SHUFFLE', '_id': req_id})
        self._push_now_playing(None)

    def _repeat(self, cmd, req_id):
        self.mpd.set_repeat(cmd.get('mode', 'off'))
        self._send_small({'type': 'OK', 'cmd': 'REPEAT', '_id': req_id})
        self._push_now_playing(None)

    def _get_now_playing(self, cmd, req_id):
        self._push_now_playing(req_id)

    def _get_library(self, cmd, req_id):
        library = build_library(self.mpd)
        self._send_large({'type': 'LIBRARY', '_id': req_id, **library})

    def _get_queue(self, cmd, req_id):
        queue_raw = self.mpd.get_queue()
        status = self.mpd.get_status()
        songs = [self._format_song(s) for s in queue_raw if 'file' in s]
        self._send_large({'type': 'QUEUE', '_id': req_id, 'songs': songs, 'index': int(status.get('song', 0))})

    def _get_battery(self, cmd, req_id):
        from battery import get_battery_info
        info = get_battery_info()
        if info:
            self._send_small({
                'type': 'BATTERY',
                '_id': req_id,
                'percent': info['percent'],
                'charging': info['charging'],
                'voltage': info['voltage'],
                'currentMa': info['current_ma'],
                'minutesRemaining': None,
            })
        else:
            self._send_small({'type': 'BATTERY', '_id': req_id, 'percent': -1, 'charging': False, 'minutesRemaining': None})

    def _get_album_art(self, cmd, req_id):
        import io
        import os
        from config import MUSIC_DIR
        path = cmd.get('path', '')
        if not path:
            self._send_small({'type': 'ERROR', 'cmd': 'GET_ALBUM_ART', 'msg': 'No path', '_id': req_id})
            return

        music_root = os.path.realpath(MUSIC_DIR)
        resolved = os.path.realpath(os.path.join(music_root, path))
        if not resolved.startswith(music_root + os.sep) and resolved != music_root:
            self._send_small({'type': 'ERROR', 'cmd': 'GET_ALBUM_ART', 'msg': 'Invalid path', '_id': req_id})
            return

        art_bytes = self.mpd.get_album_art(path)

        if not art_bytes:
            song_dir = os.path.dirname(resolved)
            for name in ('cover.jpg', 'Cover.jpg', 'folder.jpg', 'album.jpg', 'front.jpg', 'cover.jpeg'):
                cover_path = os.path.join(song_dir, name)
                if os.path.exists(cover_path):
                    with open(cover_path, 'rb') as f:
                        art_bytes = f.read()
                    break

        if not art_bytes:
            self._send_small({'type': 'ERROR', 'cmd': 'GET_ALBUM_ART', 'msg': 'No art', '_id': req_id})
            return

        try:
            from PIL import Image
            size = cmd.get('size', 'large')
            px = 80 if size == 'small' else 300
            quality = 70 if size == 'small' else 75
            img = Image.open(io.BytesIO(art_bytes)).convert('RGB')
            img.thumbnail((px, px), Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format='JPEG', quality=quality, optimize=True)
            art_bytes = buf.getvalue()
        except ImportError:
            pass
        except Exception as e:
            print(f'[CMD] Album art resize failed: {e}')

        art_b64 = b64.b64encode(art_bytes).decode('ascii')
        self._send_large({'type': 'ALBUM_ART', '_id': req_id, 'path': path, 'data': art_b64})

    def _get_storage(self, cmd, req_id):
        import shutil
        from config import MUSIC_DIR
        try:
            usage = shutil.disk_usage(MUSIC_DIR)
            gb = 1024 ** 3
            library = build_library(self.mpd)
            self._send_small({
                'type': 'STORAGE',
                '_id': req_id,
                'totalGB': round(usage.total / gb, 1),
                'usedGB': round(usage.used / gb, 1),
                'freeGB': round(usage.free / gb, 1),
                'trackCount': len(library['songs']),
            })
        except Exception as e:
            self._send_small({'type': 'ERROR', 'cmd': 'GET_STORAGE', 'msg': str(e), '_id': req_id})

    def _shutdown(self, cmd, req_id):
        import subprocess
        self._send_small({'type': 'OK', 'cmd': 'SHUTDOWN', '_id': req_id})
        # Small delay so the BLE response has time to transmit before the process dies
        GLib.timeout_add(800, lambda: subprocess.Popen(['sudo', 'shutdown', '-h', 'now']) and False)

    def _delete_track(self, cmd, req_id):
        import os
        from config import MUSIC_DIR
        path = cmd.get('path', '')
        if not path:
            self._send_small({'type': 'ERROR', 'cmd': 'DELETE_TRACK', 'msg': 'No path', '_id': req_id})
            return
        music_root = os.path.realpath(MUSIC_DIR)
        resolved = os.path.realpath(os.path.join(music_root, path))
        if not resolved.startswith(music_root + os.sep):
            self._send_small({'type': 'ERROR', 'cmd': 'DELETE_TRACK', 'msg': 'Invalid path', '_id': req_id})
            return
        try:
            os.remove(resolved)
            self.mpd.update()
            self._send_small({'type': 'OK', 'cmd': 'DELETE_TRACK', '_id': req_id})
        except FileNotFoundError:
            self._send_small({'type': 'ERROR', 'cmd': 'DELETE_TRACK', 'msg': 'File not found', '_id': req_id})
        except Exception as e:
            self._send_small({'type': 'ERROR', 'cmd': 'DELETE_TRACK', 'msg': str(e), '_id': req_id})

    def _set_eq(self, cmd, req_id):
        preset = cmd.get('preset', 'flat')
        values = EQ_PRESETS.get(preset, EQ_PRESETS['flat'])
        try:
            for band, val in zip(EQ_BANDS, values):
                subprocess.run(
                    ['amixer', '-D', 'equal', 'set', band, f'{val}%'],
                    capture_output=True, timeout=2,
                )
            self._send_small({'type': 'OK', 'cmd': 'SET_EQ', 'preset': preset, '_id': req_id})
        except Exception as e:
            self._send_small({'type': 'ERROR', 'cmd': 'SET_EQ', 'msg': str(e), '_id': req_id})

    def _get_info(self, cmd, req_id):
        self._send_small({
            'type': 'INFO',
            '_id': req_id,
            'ip': get_local_ip(),
            'port': HTTP_PORT,
            'name': 'ThePod',
            'firmwareVersion': '1.0.0',
        })

    def _scan_wifi(self, cmd, req_id):
        import re, threading

        def do_scan():
            try:
                r = subprocess.run(
                    ['nmcli', '--terse', '--fields', 'SSID,SIGNAL,SECURITY',
                     'dev', 'wifi', 'list', '--rescan', 'yes'],
                    capture_output=True, text=True, timeout=20,
                )
                networks = []
                seen = set()
                for line in r.stdout.strip().split('\n'):
                    if not line:
                        continue
                    parts = re.split(r'(?<!\\):', line)
                    ssid = parts[0].replace('\\:', ':').strip() if parts else ''
                    if not ssid or ssid in seen:
                        continue
                    seen.add(ssid)
                    try:
                        signal = int(parts[1]) if len(parts) > 1 else 0
                    except ValueError:
                        signal = 0
                    secured = len(parts) > 2 and parts[2].strip() not in ('--', '')
                    networks.append({'ssid': ssid, 'signal': signal, 'secured': secured})
                networks.sort(key=lambda x: x['signal'], reverse=True)
                GLib.idle_add(lambda: self._send_small(
                    {'type': 'WIFI_SCAN', '_id': req_id, 'networks': networks}
                ) or False)
            except Exception as e:
                GLib.idle_add(lambda: self._send_small(
                    {'type': 'ERROR', 'cmd': 'SCAN_WIFI', 'msg': str(e), '_id': req_id}
                ) or False)

        threading.Thread(target=do_scan, daemon=True).start()

    def _connect_wifi(self, cmd, req_id):
        import re, threading, time

        ssid = cmd.get('ssid', '').strip()
        password = cmd.get('password', '').strip()
        if not ssid:
            self._send_small({'type': 'ERROR', 'cmd': 'CONNECT_WIFI', 'msg': 'No SSID', '_id': req_id})
            return

        def do_connect():
            try:
                # Try existing saved profile first
                r = subprocess.run(['nmcli', 'con', 'up', ssid],
                                   capture_output=True, text=True, timeout=30)
                if r.returncode != 0:
                    args = ['nmcli', 'dev', 'wifi', 'connect', ssid]
                    if password:
                        args += ['password', password]
                    r = subprocess.run(args, capture_output=True, text=True, timeout=30)

                if r.returncode == 0:
                    time.sleep(3)  # wait for DHCP
                    ip = get_local_ip()
                    GLib.idle_add(lambda: self._send_small(
                        {'type': 'WIFI_CONNECTED', '_id': req_id, 'ssid': ssid, 'ip': ip}
                    ) or False)
                else:
                    err = (r.stderr.strip() or r.stdout.strip() or 'Connection failed').split('\n')[0]
                    GLib.idle_add(lambda: self._send_small(
                        {'type': 'ERROR', 'cmd': 'CONNECT_WIFI', 'msg': err, '_id': req_id}
                    ) or False)
            except subprocess.TimeoutExpired:
                GLib.idle_add(lambda: self._send_small(
                    {'type': 'ERROR', 'cmd': 'CONNECT_WIFI', 'msg': 'Connection timed out', '_id': req_id}
                ) or False)
            except Exception as e:
                GLib.idle_add(lambda: self._send_small(
                    {'type': 'ERROR', 'cmd': 'CONNECT_WIFI', 'msg': str(e), '_id': req_id}
                ) or False)

        threading.Thread(target=do_connect, daemon=True).start()

    def _get_wifi_status(self, cmd, req_id):
        import re
        try:
            r = subprocess.run(
                ['nmcli', '--terse', '--fields', 'ACTIVE,SSID,SIGNAL', 'dev', 'wifi'],
                capture_output=True, text=True, timeout=5,
            )
            ssid = ''
            signal = 0
            for line in r.stdout.strip().split('\n'):
                parts = re.split(r'(?<!\\):', line)
                if parts and parts[0] == 'yes':
                    ssid = parts[1].replace('\\:', ':').strip() if len(parts) > 1 else ''
                    try:
                        signal = int(parts[2]) if len(parts) > 2 else 0
                    except ValueError:
                        signal = 0
                    break
            ip = get_local_ip()
            self._send_small({'type': 'WIFI_STATUS', '_id': req_id, 'ssid': ssid, 'ip': ip, 'signal': signal})
        except Exception as e:
            self._send_small({'type': 'ERROR', 'cmd': 'GET_WIFI_STATUS', 'msg': str(e), '_id': req_id})

    def _push_now_playing(self, req_id):
        status = self.mpd.get_status()
        current = self.mpd.get_current_song()

        state_map = {'play': 'playing', 'pause': 'paused', 'stop': 'stopped'}
        playback_state = state_map.get(status.get('state', 'stop'), 'stopped')

        elapsed = float(status.get('elapsed', 0))
        duration = float(status.get('duration', 0))

        repeat_raw = (int(status.get('repeat', 0)), int(status.get('single', 0)))
        if repeat_raw == (1, 1):
            repeat = 'one'
        elif repeat_raw == (1, 0):
            repeat = 'all'
        else:
            repeat = 'off'

        song = self._format_song(current) if current else None

        # Inject live audio format from MPD status (e.g. "96000:24:2")
        if song:
            audio = status.get('audio', '')
            parts = audio.split(':') if audio else []
            try:
                song['sampleRate'] = int(parts[0]) if len(parts) > 0 else 0
                song['bitDepth'] = int(parts[1]) if len(parts) > 1 else 0
            except (ValueError, IndexError):
                pass

        self._send_large({
            'type': 'NOW_PLAYING',
            '_id': req_id,
            'song': song,
            'playbackState': playback_state,
            'position': elapsed,
            'duration': duration,
            'volume': self.mpd.get_volume(),
            'shuffle': status.get('random', '0') == '1',
            'repeat': repeat,
        })

    def _format_song(self, raw: dict) -> dict:
        import os
        import hashlib
        file_path = raw.get('file', '')
        title = raw.get('title', os.path.splitext(os.path.basename(file_path))[0])
        artist = raw.get('artist', 'Unknown Artist')
        album = raw.get('album', 'Unknown Album')
        artist_id = hashlib.md5(artist.encode()).hexdigest()
        album_id = hashlib.md5(f'{artist}:{album}'.encode()).hexdigest()
        song_id = hashlib.md5(file_path.encode()).hexdigest()
        try:
            duration = float(raw.get('duration', raw.get('time', 0)))
        except (TypeError, ValueError):
            duration = 0.0
        return {
            'id': song_id,
            'title': title,
            'artist': artist,
            'album': album,
            'albumId': album_id,
            'artistId': artist_id,
            'duration': duration,
            'trackNumber': int(raw.get('track', '0').split('/')[0]) if raw.get('track') else 0,
            'discNumber': int(raw.get('disc', '1').split('/')[0]) if raw.get('disc') else 1,
            'genre': raw.get('genre', ''),
            'year': int(raw.get('date', '0')[:4]) if raw.get('date') else 0,
            'format': os.path.splitext(file_path)[1].lstrip('.').lower(),
            'bitrate': int(raw.get('bitrate', 0)),
            'sampleRate': 0,
            'bitDepth': 0,
            'fileSize': 0,
            'path': file_path,
        }
