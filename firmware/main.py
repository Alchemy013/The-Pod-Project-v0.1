#!/usr/bin/env python3
"""ThePod firmware entry point. Run with: sudo python3 main.py"""

import sys
import time
from mpd_controller import MPDController
from command_handler import CommandHandler
from gatt_server import start_server


def main():
    print('[ThePod] Starting firmware...')

    mpd = MPDController()

    # Placeholder send_notification — overwritten by ThePodService.__init__
    def _noop(data):
        pass

    handler = CommandHandler(mpd, _noop)

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
