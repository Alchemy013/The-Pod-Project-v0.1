# ThePod — What This Project Is

## The pitch

ThePod is a dedicated, lossless portable music player — the kind of product
that stopped existing when phones absorbed the iPod. It's a **physical
hardware product**, hand-built around a Raspberry Pi and a proper DAC
instead of a phone's compressed streaming pipeline, and controlled entirely
from a custom iPhone app over Bluetooth. The phone never plays or streams a
single byte of audio — it's a remote control. The music lives and plays
entirely on the device.

**This is a product being sold as a complete package**: the assembled
electronics (Pi Zero 2W + PCM5122 DAC + UPS HAT), in an enclosure, with
cables — ready to use out of the box, not a kit the buyer assembles
themselves. The companion iPhone app is part of that package. Sales
channel and pricing aren't finalized yet, but the product itself — hardware
and software — is built and working.

**Flow:** iPhone app → Bluetooth (BLE) → Raspberry Pi firmware → MPD →
PCM5122 DAC → wired IEMs (buyer's own — not bundled).

This is designed and built as if it were a real, shippable consumer
product — not a weekend hack. Every screen, every protocol decision, every
line of firmware, and the physical enclosure itself are held to "would this
survive being in someone's pocket every day, and would I be comfortable
selling it to a stranger."

## Why it exists

Phones killed the dedicated music player, but they also made every playback
path go through a compressed streaming service, shared Bluetooth codecs, and
a dozen other apps competing for the same silicon. ThePod exists to answer:
what if you had a single-purpose device again — one that only plays your
music, in the format you actually own it in, through real hardware chosen
for that one job — but controlled with the polish of a modern app instead of
a scroll wheel?

## Hardware — what's in the box

- **Raspberry Pi Zero 2W** — the brain. Runs Linux, MPD, and a custom
  Bluetooth GATT server.
- **Waveshare PCM5122 DAC (I2S)** — converts digital audio to analog properly,
  instead of relying on a phone's onboard (compressed-audio-optimized) output.
- **Waveshare UPS HAT (C)** with an INA219 fuel gauge — real battery
  percentage and charge state, read over I2C, so it works untethered like an
  actual portable device.
- **Enclosure** — the Pi, DAC, and UPS HAT stacked and assembled inside a
  case, not a bare board rattling around in a pocket.
- **Cables/accessories** included for charging and setup.
- **USB-C** — charging and file transfer (drag music onto it like a USB
  drive; the firmware auto-indexes new files).
- **Wired IEMs are bring-your-own** — not bundled. No Bluetooth audio codec
  in the signal path to the ears either way; Bluetooth is only used for
  *control*, never audio.

Every unit ships assembled and ready to pair with the app — there is no
soldering, flashing, or configuration step for the buyer.

## Software

- **iPhone app** — React Native + Expo, file-based routing (Expo Router),
  Zustand for state, `react-native-ble-plx` for Bluetooth, Reanimated +
  Gesture Handler for the interactions, `react-native-track-player` for lock
  screen / Control Center integration. Visual language: dark, glass, rounded,
  Apple Music / iPod Classic / Nothing / Sony Walkman inspired — deliberately
  polished enough that the first reaction is "this looks like Spotify,"
  before the reveal that it's controlling a Raspberry Pi.
- **Pi firmware** — Python. A custom BlueZ GATT server (no phone pairing
  prompt required — an auto-accept pairing agent handles that), MPD for
  actual playback and queue/library management, ALSA + alsaequal for a
  real 10-band EQ, and a small HTTP server for file upload/delete over WiFi.

## What it actually does today

- Scans for and connects to the Pi over Bluetooth with no manual pairing step
- Browses your library by Songs / Albums / Artists, with real album art
  pulled straight out of the audio files (FLAC embedded art, ID3 tags, or
  folder images)
- Full transport control — play, pause, skip, seek, shuffle, repeat, volume
  (curved so it doesn't blast your ears at the top of the slider)
- A queue you can view and jump around in, mid-playback
- Lock screen / Control Center playback controls, synced live from the Pi
- Playlist playback
- A 10-band EQ with Flat / Bass / Vocal / Treble presets, actually applied at
  the ALSA level, not a fake UI toggle
- Live battery percentage and charge state, storage used/free, and track
  count — read directly off the hardware
- In-app WiFi network management (scan, connect, view current network) —
  used only for file transfer, never for audio playback
- A "Power Off" button that cleanly shuts down the Pi from the app
- Delete tracks from the library, from either the app or a manual HTTP call

## What makes it a real product, not a demo

- **The phone never streams audio.** Every design decision reinforces this:
  BLE is a low-bandwidth control channel (commands and small JSON state
  updates), not an audio path. Large payloads — a full library listing,
  album art — are deliberately chunked to survive BLE's small packet size,
  which is the kind of unglamorous correctness work a real product needs and
  a demo skips.
- **No mock data, no fake Bluetooth, no placeholder screens.** Every screen
  in the app is wired to a real command and a real response from the Pi.
- **Lossless, format-aware.** The Now Playing screen shows the real sample
  rate and bit depth MPD is currently outputting (e.g. "FLAC · 24-BIT ·
  96 kHz"), not a static badge.
- **It survives being unplugged.** Auto-pause on Bluetooth disconnect, MPD
  auto-reconnect if it hiccups, the GATT server auto-advertises on boot with
  no manual step required (this used to require a manual `btmgmt` command
  after every boot — that's been fixed at the D-Bus level).

## The bigger idea

ThePod treats the phone as what it actually is well-suited to be: a fast,
beautiful, always-with-you remote control — and puts the parts that matter
for sound quality (the DAC, the storage, the playback engine) into a small,
purpose-built piece of hardware that does one job. It's an argument, made in
hardware and software, that convenience and audio quality don't have to be
the same trade-off phones forced them into.

## Where the business stands

Product (hardware + app) is built and working. Sales channel and pricing
are not decided yet — update this section once those are locked in.
