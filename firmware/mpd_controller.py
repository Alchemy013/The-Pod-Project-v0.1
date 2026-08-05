import mpd
import threading
import time
from config import MPD_HOST, MPD_PORT


class MPDController:
    def __init__(self):
        self._client = mpd.MPDClient()
        self._lock = threading.Lock()
        self._connected = False
        self._connect()

    def _connect(self):
        try:
            self._client.connect(MPD_HOST, MPD_PORT)
            self._client.timeout = 10
            self._connected = True
            print('[MPD] Connected')
        except Exception as e:
            print(f'[MPD] Connection failed: {e}')
            self._connected = False

    def _ensure_connected(self):
        if not self._connected:
            self._connect()

    def _cmd(self, func, *args):
        with self._lock:
            self._ensure_connected()
            try:
                return func(*args)
            except mpd.ConnectionError:
                self._connect()
                return func(*args)

    def play(self):
        self._cmd(self._client.play)

    def pause(self):
        state = self.get_status().get('state')
        if state == 'pause':
            self._cmd(self._client.play)
        else:
            self._cmd(self._client.pause, 1)

    def stop(self):
        self._cmd(self._client.stop)

    def next(self):
        self._cmd(self._client.next)

    def previous(self):
        self._cmd(self._client.previous)

    def set_volume(self, value: int):
        volume = max(0, min(100, value))
        self._cmd(self._client.setvol, volume)

    def seek(self, seconds: float):
        self._cmd(self._client.seekcur, seconds)

    def play_id(self, song_id: str):
        self._cmd(self._client.playid, song_id)

    def play_at(self, index: int):
        self._cmd(self._client.play, index)

    def get_all_file_paths(self) -> list:
        try:
            entries = self._cmd(self._client.listall) or []
            return [e['file'] for e in entries if 'file' in e]
        except Exception:
            return []

    def set_shuffle(self, enabled: bool):
        self._cmd(self._client.random, 1 if enabled else 0)

    def set_repeat(self, mode: str):
        if mode == 'off':
            self._cmd(self._client.repeat, 0)
            self._cmd(self._client.single, 0)
        elif mode == 'one':
            self._cmd(self._client.repeat, 1)
            self._cmd(self._client.single, 1)
        elif mode == 'all':
            self._cmd(self._client.repeat, 1)
            self._cmd(self._client.single, 0)

    def get_status(self) -> dict:
        try:
            return self._cmd(self._client.status) or {}
        except Exception:
            return {}

    def get_current_song(self) -> dict:
        try:
            return self._cmd(self._client.currentsong) or {}
        except Exception:
            return {}

    def get_queue(self) -> list:
        try:
            return self._cmd(self._client.playlistinfo) or []
        except Exception:
            return []

    def clear_upcoming(self):
        """Delete everything after the current track, leaving playback untouched."""
        with self._lock:
            self._ensure_connected()
            try:
                status = self._client.status()
                current = int(status.get('song', -1))
                length = int(status.get('playlistlength', 0))
            except Exception:
                return
            if current >= 0 and current + 1 < length:
                self._client.delete((current + 1, length))

    def add_to_queue(self, path: str):
        self._cmd(self._client.add, path)

    def clear_queue_and_add(self, files: list):
        with self._lock:
            self._ensure_connected()
            self._client.clear()
            for f in files:
                self._client.add(f)

    def play_playlist(self, name: str):
        with self._lock:
            self._ensure_connected()
            self._client.clear()
            self._client.load(name)
            self._client.play()

    def get_all_songs(self) -> list:
        try:
            return self._cmd(self._client.listallinfo) or []
        except Exception:
            return []

    def get_volume(self) -> int:
        status = self.get_status()
        return max(0, min(100, int(status.get('volume', 75))))

    def update(self):
        self._cmd(self._client.update)

    def pause_if_playing(self):
        try:
            if self.get_status().get('state') == 'play':
                self._cmd(self._client.pause, 1)
        except Exception:
            pass

    def get_album_art(self, uri: str) -> bytes | None:
        # readpicture handles FLAC PICTURE blocks; albumart only handles id3v2 APIC
        try:
            result = self._cmd(self._client.readpicture, uri)
            if result and 'binary' in result:
                return result['binary']
        except Exception:
            pass
        try:
            result = self._cmd(self._client.albumart, uri)
            if result and 'binary' in result:
                return result['binary']
        except Exception:
            pass
        return None
