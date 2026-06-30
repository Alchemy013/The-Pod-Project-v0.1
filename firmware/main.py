#!/usr/bin/env python3
"""ThePod firmware entry point. Run with: sudo python3 main.py"""

import sys
import threading
import time
import mpd as mpd_lib
from gi.repository import GLib
from mpd_controller import MPDController
from command_handler import CommandHandler
from gatt_server import start_server
from http_server import start_http_server
from config import MPD_HOST, MPD_PORT


def start_idle_watcher(handler):
    """Background thread: subscribe to MPD player events and push NOW_PLAYING over BLE."""
    def watch():
        client = mpd_lib.MPDClient()
        while True:
            try:
                client.connect(MPD_HOST, MPD_PORT)
                print('[Idle] MPD idle watcher connected')
                while True:
                    # Blocks until MPD emits a player event (song change, play/pause, seek)
                    subsystems = client.idle('player')
                    if 'player' in subsystems:
                        # Schedule push in GLib main loop — BLE operations must stay on that thread
                        GLib.idle_add(lambda: handler._push_now_playing(None) or False)
            except Exception as e:
                print(f'[Idle] Reconnecting after error: {e}')
                try:
                    client.disconnect()
                except Exception:
                    pass
                time.sleep(3)

    t = threading.Thread(target=watch, daemon=True)
    t.start()


def main():
    print('[ThePod] Starting firmware...')

    mpd = MPDController()

    def _noop(data):
        pass

    handler = CommandHandler(mpd, _noop)
    start_http_server(mpd)
    start_idle_watcher(handler)

    try:
        start_server(handler)
    except KeyboardInterrupt:
        print('[ThePod] Shutting down')
        sys.exit(0)
    except Exception as e:
        print(f'[ThePod] Fatal error: {e}')
        sys.exit(1)


if __name__ == '__main__':
    main()
