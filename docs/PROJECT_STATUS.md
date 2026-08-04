# ThePod — Project Status

Read this first, every session. It exists so Claude doesn't have to re-read
the codebase from scratch to get oriented. It's detailed on purpose —
implementation specifics (function names, data shapes, magic numbers) are
included so you can reason about changes without opening every file first.
Still open the actual file before editing it — this doc is orientation, not
a substitute for reading the code you're about to change. Update it whenever
something below goes stale — don't let it rot.

## What this is

A lossless portable music player: Raspberry Pi 3A+ + PCM5122 DAC (I2S) → wired
IEMs. iPhone app is a **controller only** — it never streams or plays audio
itself, it sends BLE commands and renders state the Pi pushes back. Designed
as a shippable consumer product (like a 2026 iPod), not a demo.

Flow: **iPhone App → BLE → Raspberry Pi firmware → MPD → PCM5122 DAC → IEMs**

## Stack

- **App**: React Native + Expo 56 (Expo Router, file-based routing), Zustand,
  react-native-ble-plx, Reanimated + Gesture Handler, react-native-track-player
  (lock screen controls). NativeWind/Tailwind was **removed** (commit
  `a437a6a`) — styling is plain `StyleSheet.create`, PRD mentions of
  NativeWind (in memory) are stale.
- **Firmware (Pi)**: Python + BlueZ over D-Bus (GATT server), MPD (playback),
  ALSA/alsaequal (EQ), raspotify (Spotify Connect), Pillow (album art resize),
  python-mpd2, smbus2 (I2C battery), NetworkManager/`nmcli` (WiFi).
- Expo docs changed a lot for v56 — check `https://docs.expo.dev/versions/v56.0.0/`
  before assuming older API shapes (per `AGENTS.md`).

## Repo layout

```
src/app/                          # expo-router screens
  index.tsx, now-playing.tsx, _layout.tsx
  pod/                             # "Pod" tab: index, battery, storage, equalizer, about, network
src/store/                        # zustand stores
  bluetooth.store.ts, library.store.ts, player.store.ts, pod.store.ts
src/services/bluetooth/
  BluetoothService.ts             # BLE transport singleton (podService)
  protocol.ts                     # UUIDs, PodCommand/PodResponse types, base64 codec
src/services/audio/LockScreenService.ts   # react-native-track-player lock screen sync
src/components/bluetooth/BluetoothSheet.tsx
firmware/
  main.py            # entry point, wires everything together, idle watcher thread
  gatt_server.py      # BlueZ D-Bus GATT service/characteristics + advertising + auto-pair agent
  command_handler.py  # JSON command dispatch table, all business logic, chunked responses
  mpd_controller.py   # thin wrapper over python-mpd2 (thread-safe, auto-reconnect)
  library_manager.py  # builds albums/artists/songs tree from MPD library
  battery.py           # INA219 I2C driver (Waveshare UPS HAT C)
  http_server.py       # plain HTTP server on :8080 for file upload/delete (used by app over WiFi)
  config.py            # UUIDs, ports, paths, chunk size constants — single source of truth
```

## BLE protocol contract (`protocol.ts` / `config.py` — must stay in sync)

UUIDs, base `4fafc201-1fb5-459e-8fcc-c5c9c331900X`:
- `...9001` Service · `...9002` Command (Write, app→Pi) · `...9003` Status
  (Notify, Pi→app) · `...9004` Info (Read) · `...9005` Battery (Read+Notify)

Every command is `{ cmd: '<NAME>', ...args, _id: string }`, JSON, base64-encoded,
written to the Command characteristic. Every response is JSON.parse'd off a
Status-characteristic notify, shape `{ type: '<TYPE>', _id?, ...data }`.

**Commands** (`PodCommand` union in `protocol.ts:11`, dispatch table in
`command_handler.py:41`): `PING`, `PLAY`, `PAUSE`, `NEXT`, `PREVIOUS`, `STOP`,
`SET_VOLUME{value}`, `SET_POSITION{seconds}`, `PLAY_SONG{path}`,
`PLAY_ALBUM{id}`, `PLAY_PLAYLIST{id}`, `SHUFFLE{enabled}`, `REPEAT{mode}`,
`GET_NOW_PLAYING`, `GET_LIBRARY`, `GET_QUEUE`, `GET_BATTERY`, `GET_STORAGE`,
`GET_ALBUM_ART{path,size?}`, `GET_INFO`, `SHUTDOWN`, `DELETE_TRACK{path}`,
`SET_EQ{preset}`, `SCAN_WIFI`, `CONNECT_WIFI{ssid,password}`, `GET_WIFI_STATUS`.

**Response types**: `PONG`, `OK{cmd}`, `ERROR{cmd,msg}`, `NOW_PLAYING{song,
playbackState,position,duration,volume,shuffle,repeat}`, `LIBRARY{albums,
artists,songs}`, `QUEUE{songs,index}`, `BATTERY{percent,charging,
minutesRemaining}`, `STORAGE{totalGB,usedGB,freeGB,trackCount}`,
`ALBUM_ART{path,data}` (base64 JPEG), `CHUNK`/`CHUNK_END{seq,total,data}`,
`INFO{ip,port,name,firmwareVersion}`, `WIFI_STATUS{ssid,ip,signal}`,
`WIFI_SCAN{networks}`, `WIFI_CONNECTED{ssid,ip}`.

**Chunking** (`command_handler.py:83` `_send_large`/`_send_chunked`): payload
is base64'd, if ≤430 chars (`MAX_SAFE_BYTES`, `config.py`) sent as one JSON
notify. Otherwise split into 430-char pieces, wrapped as `CHUNK`/last one
`CHUNK_END`, queued and drained one-per-`GLib.timeout_add` tick (30ms then
15ms) so BLE notify doesn't overrun the iOS ATT MTU (~512 bytes, 430 chars +
~75 byte envelope stays under it). App reassembles in
`BluetoothService.ts:handleResponse` via a `chunkBuffers: Map<id, {parts,
total}>` keyed by `_id`, joins `parts`, re-decodes as the real response, and
recurses through `handleResponse` again.

**Request/response matching**: every command carries a client-generated `_id`
(`BluetoothService.ts:generateId`, timestamp+random base36). `sendCommand`
fires and forgets; `request()` registers a resolver in
`pendingRequests: Map<id, resolver>` with a timeout (default 10s, `GET_QUEUE`/
`GET_LIBRARY` use 15s/30s from the store callers) and resolves when a
response with matching `_id` arrives. Responses without a matching pending
request (e.g. the idle-watcher's unsolicited `NOW_PLAYING` push) fall through
to `notificationListeners`.

## App-side implementation notes

- **`BluetoothService.ts`** (singleton `podService`, no React dependency):
  - `scan()`: 8s window, `startDeviceScan(null, {allowDuplicates:false})`,
    sorts so a device named `ThePod` (`POD_DEVICE_NAME`) comes first.
  - `connect(deviceId)`: races `_connectInternal` against a 12s timeout;
    guarded by `_isConnecting` so concurrent calls no-op. Internally:
    `connectToDevice({requestMTU:512, timeout:10000})` →
    `discoverAllServicesAndCharacteristics()` → **800ms sleep** (empirically
    needed before the Pi's GATT table is reliably queryable) → subscribes to
    Status notify → registers `onDisconnected` cleanup (clears device,
    subscription, pending requests, chunk buffers, fires
    `disconnectListeners`).
  - `disconnect()`: removes subscription, `cancelDeviceConnection`, swallows
    errors.
  - No retry/backoff logic anywhere in this file — reconnection is driven by
    the store (`bluetooth.store.autoConnect`) on app foreground, not by the
    service itself.
- **`bluetooth.store.ts`**: `connectionState` is
  `disconnected|scanning|connecting|connected`, all transitions guarded by
  checking current state first (prevents overlapping scan/connect calls —
  this is also the fix for the "auto-disconnect right after scan ended" bug,
  see Solved bugs). Persists the last connected device id in AsyncStorage
  (`thepod_device_id`) and `autoConnect()` uses it on app launch. On connect,
  immediately issues `GET_INFO` (5s timeout, swallowed on failure) to learn
  the Pi's current WiFi IP/port for HTTP upload — BLE is control-plane only,
  file transfer goes over `podIp:podPort` (HTTP server in `http_server.py`).
- **`player.store.ts`**: all playback actions are thin `sendCommand`
  fire-and-forget wrappers. **Volume is remapped**: UI shows 0-100, but MPD
  volume is capped to 0-15 (`VOL_MAX`) via a quadratic curve
  (`uiToMpd = round((ui/100)^2 * 15)`, inverse `mpdToUi`) — deliberate, to
  avoid ear-damaging output level and give finer low-volume control; don't
  "fix" this to be linear without understanding why. `applyNowPlaying` is the
  single place that ingests a `NOW_PLAYING` response (from `refresh()` or an
  unsolicited push wired up elsewhere) and also pushes lock-screen metadata
  via `LockScreenService`.
- **`library.store.ts`**: one `GET_LIBRARY` request (30s timeout — full
  library can be large/slow to chunk), flat arrays of albums/artists/songs.
  No pagination; whole library comes back in one (possibly chunked) response.
- **`pod.store.ts`**: storage/battery/wifi status, each independently
  fetchable/failable (`fetchAll` just fires all three, errors swallowed
  per-field). `eqPreset` is local UI state only — actually applying it means
  also calling `podService.sendCommand({cmd:'SET_EQ', preset})` from the
  screen (check `src/app/pod/equalizer.tsx` if touching EQ).
- **`BluetoothSheet.tsx`**: device picker sheet. Tapping the currently
  connected device shows a disconnect confirm alert; tapping any other
  device disconnects current (if any) then connects to the new one.

## Firmware-side implementation notes

- **`main.py`**: builds one `MPDController`, one `CommandHandler`, starts the
  HTTP upload server, starts the idle-watcher thread, then runs the GATT
  server's GLib main loop (blocking, this is the main thread).
  **`start_idle_watcher`**: a dedicated thread holds its own blocking MPD
  connection and calls `client.idle('player')`, which blocks until MPD fires
  a player-subsystem event (track change, play/pause, seek). On event, it
  does `GLib.idle_add(handler._push_now_playing)` — **must** hop onto the
  GLib main loop because D-Bus/BLE notify calls aren't thread-safe from an
  arbitrary thread. Reconnects with a 3s backoff on any error.
- **`gatt_server.py`**: raw BlueZ D-Bus GATT server, no bluezero/other
  wrapper lib. `BaseCharacteristic` implements the `org.bluez.GattCharacteristic1`
  D-Bus interface (`ReadValue`/`WriteValue`/`StartNotify`/`StopNotify`,
  notify via `PropertiesChanged` signal on the `Value` property).
  `CommandCharacteristic.WriteValue` decodes UTF-8 and calls
  `command_handler.handle(raw)` synchronously (on the GLib main-loop thread —
  handlers that spawn work, e.g. `SCAN_WIFI`/`CONNECT_WIFI`, use their own
  `threading.Thread` and marshal replies back via `GLib.idle_add`).
  `AutoPairAgent` registers as `NoInputNoOutput` with `RequestDefaultAgent` —
  this is why the app connects without a pairing prompt. Advertising is
  registered via `LEAdvertisingManager1.RegisterAdvertisement` (D-Bus), not
  `btmgmt` — this was a past bug fix, see Solved bugs, don't revert to
  subprocess/btmgmt. A `PropertiesChanged` signal receiver watches for BLE
  disconnect and calls `mpd.pause_if_playing()` — playback auto-pauses when
  the phone disconnects.
- **`command_handler.py`**: `handle(raw)` parses JSON, looks up `cmd` in a
  dict-based dispatch table, calls `handler(command, req_id)`, catches any
  exception and turns it into an `ERROR` response — no command handler needs
  its own try/except for the "send an error back" path. Path-traversal guards
  (`os.path.realpath` + startswith-root check) are applied independently in
  `_get_album_art` and `_delete_track` — if adding a third file-path-taking
  command, replicate this guard, don't skip it. `_play_song` loads the
  **entire library** into the MPD queue (not just the one song) before
  seeking to the tapped track's index — this is deliberate so NEXT/PREVIOUS/
  shuffle/autoplay work across the whole library rather than stopping after
  one track. `_get_album_art` tries `readpicture` (FLAC embedded art) then
  `albumart` (ID3v2 APIC) then falls back to sibling `cover.jpg`/`folder.jpg`/
  etc. in the song's directory, then resizes with Pillow (80px/q70 "small",
  300px/q75 "large"). EQ presets (`EQ_PRESETS` dict, 10-band) are applied via
  `amixer -D equal set '<band>' '<val>%'` per band — requires `alsaequal`
  installed and an `equal` ALSA device configured (see `firmware/setup_eq.sh`).
  WiFi scan/connect shell out to `nmcli`, run on background threads (network
  ops can block for seconds), reply via `GLib.idle_add`.
- **`mpd_controller.py`**: every MPD call goes through `_cmd()`, which holds a
  `threading.Lock` and retries once after reconnecting on `mpd.ConnectionError`
  — handles MPD restarting/hiccuping without crashing the firmware.
  `pause()` toggles based on current state (no separate resume command from
  MPD's perspective). `clear_queue_and_add`/`play_playlist` bypass `_cmd` and
  take the lock directly since they're multi-step.
- **`library_manager.py`**: `build_library()` walks `mpd.listallinfo()` once
  per call (no caching) and builds `albums`/`artists`/`songs` keyed by
  MD5 hashes: `song_id = md5(file_path)`, `album_id = md5(artist:album)`,
  `artist_id = md5(artist)` — same hashing must be replicated wherever songs
  are formatted ad hoc (see `_format_song` in `command_handler.py`, which
  duplicates this logic for the single-current-song case — if the ID scheme
  changes, update both places).
- **`battery.py`**: direct I2C register access to an INA219 on the Waveshare
  UPS HAT (C), no vendor SDK. Calibration register hardcoded for a 0.1Ω shunt
  (`_CAL = 4096`). Battery percent is a naive linear 3.0V–4.2V→0–100% LiPo
  curve (not a real fuel-gauge curve) — `# ponytail`-grade simplification,
  fine for now, revisit if percent readings feel off near empty/full.
  Charging is inferred from current direction (`current_ma > 50`), not a
  dedicated status pin.
- **`http_server.py`**: plain `http.server`, no auth (LAN-only, discovered
  via BLE `GET_INFO`). `/upload` (POST, `?filename=`) streams body to
  `MUSIC_DIR/Uploads/`, extension allowlist enforced. `/delete` (DELETE,
  `?path=`) removes a file, same realpath traversal guard as firmware's
  `_delete_track`. Both trigger `mpd.update()` after so the library re-scans.
  `get_local_ip()` reads `wlan0`'s address directly via `ip addr show` first
  (works whether the Pi is hotspotting or on a home network), falls back to
  a UDP-connect trick to 8.8.8.8.
- **`config.py`**: single source of truth for UUIDs (must match
  `protocol.ts`), ports, `MUSIC_DIR` (`/var/lib/mpd/music`), and the chunk
  size constants. If you change a UUID or chunk size, change it here, not
  inline elsewhere.

## Current working state (as of 2026-07-09, verify before trusting)

- MPD playback through PCM5122 (via `equal` ALSA device — alsaequal EQ live)
- BlueZ GATT server runs as `thepod.service` (systemd), auto-advertises via
  D-Bus `LEAdvertisingManager1` (no manual `btmgmt` needed anymore)
- BLE connect from app works without pairing confirmation (AutoPairAgent)
- Library load, playback, Now Playing, shuffle/repeat/autoplay all work
- Lock screen controls via react-native-track-player
- Album art working end-to-end (readpicture/albumart/folder-image fallback)
- Delete tracks: BLE `DELETE_TRACK`, falls back to HTTP DELETE
- EQ presets (Flat/Bass/Vocal/Treble) working via `amixer`
- Queue view: sheet modal on Now Playing, `GET_QUEUE`, tap to jump
- Library tabs: Songs / Albums (2-col grid) / Artists (drill into albums)
- WiFi network management UI added to Pod tab (commit `59fecb7`)
- Spotify Connect card added to Pod tab (commit `7fc91b6`) — raspotify,
  device name "ThePod", 320kbps, `plughw:1,0`
- Playlist playback added, volume-reset bug fixed (commit `a437a6a`)

**Networking**: Pi joins home WiFi (`Airtel_Saini Wifi Base_EXT`, autoconnect,
priority 100). The old `ThePod-AP` hotspot is disabled. Pi's home-WiFi IP is
DHCP-assigned (last known `192.168.1.112` — get current IP via BLE `GET_INFO`,
don't assume it's static). File uploads go over home WiFi once the app has
the IP (via `http_server.py` on port 8080); control still goes over BLE.

**SSH**: `sshpass -p '13root' ssh alcehmy@192.168.1.112`

## Deploy

Firmware **must** be copied into the `firmware/` subdirectory on the Pi, not
its parent — the systemd unit's `WorkingDirectory` is
`/home/alcehmy/thepod/firmware` and it runs `python3 -u main.py` from there.
Copying to the parent is a silent no-op (this has burned multiple sessions).

```bash
sshpass -p '13root' scp firmware/*.py alcehmy@192.168.1.112:/home/alcehmy/thepod/firmware/
sshpass -p '13root' ssh alcehmy@192.168.1.112 "sudo systemctl restart thepod"
```

Optionally clear `firmware/__pycache__` on the Pi after deploy.

## Solved — do not re-investigate

- `btmgmt advertising` hang → replaced with D-Bus
  `LEAdvertisingManager1.RegisterAdvertisement()` (`gatt_server.py:start_server`)
- Chunk mismatch on library load → React StrictMode double-mount caused
  double subscription; fixed
- Auto-disconnect right after scan ended → fixed by checking
  `connectionState` before overwriting it (`bluetooth.store.ts`)

## Code quality rules (from the PRD)

- Strict TypeScript, no placeholder/mock/fake implementations
- Every shipped feature must work end-to-end on real hardware
- No Android-looking components — dark, glass, rounded, large type,
  Apple Music / iPod Classic / Nothing / Sony Walkman inspired

## Roadmap (original order, check git log for what's actually done)

BLE Write → BLE Notifications → MPD integration → FLAC playback → Music
library → Album art → Battery & storage → Firmware updates → (now, past
original scope) WiFi management, Spotify Connect, playlists, EQ.
