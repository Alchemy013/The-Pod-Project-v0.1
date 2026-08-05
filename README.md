# ThePod

A lossless music player built on a Raspberry Pi, controlled from iPhone over Bluetooth.

The Pi runs MPD and a BlueZ GATT server. The iOS app connects via BLE and handles playback, library browsing, search, queue, history, and album art. The phone never plays audio — it's a remote control.

## Hardware

- Raspberry Pi Zero 2 W (512MB)
- PCM5122 DAC (I2S)
- Waveshare UPS HAT (C) — INA219 battery reading over I2C
- USB drive or SD card for music

Confirmed on hardware 2026-08-05: `/proc/device-tree/model` reports
`Raspberry Pi Zero 2 W Rev 1.0`. Earlier revisions of this file said "Pi 3A+";
that was wrong.

## Stack

**Firmware (Pi):** Python, BlueZ D-Bus, MPD, alsaequal, NetworkManager  
**App (iOS):** React Native, Expo 56, Expo Router, Zustand, react-native-ble-plx, react-native-track-player

## Setup

### Pi

```bash
# Install dependencies
pip install python-mpd2 dbus-python PyGObject pillow smbus2

# Copy firmware — must land in the firmware/ subdirectory; the systemd unit's
# WorkingDirectory is /home/<user>/thepod/firmware
scp firmware/*.py user@pi:~/thepod/firmware/

# Start
cd ~/thepod/firmware && python3 main.py
```

MPD config: point `music_directory` at wherever your files live (the firmware
default is `/var/lib/mpd/music`). For EQ, run `firmware/setup_eq.sh` once to
install alsaequal and configure the `equal` ALSA device.

BLE advertising is registered over D-Bus at startup — no `btmgmt` nudge needed.

### App

```bash
npm install
npx expo run:ios
```

Requires a development build (not Expo Go) for BLE access.

## Protocol

Commands and responses go over BLE as base64-encoded JSON, matched by a
client-generated `_id`. Large responses (library, album art) are chunked into
430-byte packets and reassembled on the app side. File upload/delete goes over
plain HTTP on port 8080 instead — the app learns the Pi's current IP by asking
for it over BLE (`GET_INFO`).

See `docs/PROJECT_STATUS.md` for the full protocol contract and architecture.

## License

MIT
