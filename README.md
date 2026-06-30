# ThePod

A lossless music player built on a Raspberry Pi 3A+, controlled from iPhone over Bluetooth.

The Pi runs MPD and a BlueZ GATT server. The iOS app connects via BLE and handles playback, library browsing, and album art.

## Hardware

- Raspberry Pi 3A+
- PCM5122 DAC (I2S)
- USB drive or SD card for music

## Stack

**Firmware (Pi):** Python, BlueZ D-Bus, MPD  
**App (iOS):** React Native, Expo, Zustand, react-native-ble-plx

## Setup

### Pi

```bash
# Install dependencies
pip install python-mpd2 dbus-python PyGObject pillow

# Copy firmware
scp -r firmware/ user@pi:~/thepod/firmware/

# Start
cd ~/thepod/firmware && python3 main.py
```

MPD config: point `music_directory` at wherever your files live.

After boot, BLE advertising sometimes needs a nudge:

```bash
sudo btmgmt advertising on
```

### App

```bash
npm install
npx expo start
```

Requires a development build (not Expo Go) for BLE access.

## Protocol

Commands and responses go over BLE as base64-encoded JSON. Large responses (library, album art) are chunked into 430-byte packets and reassembled on the app side.

## License

MIT
