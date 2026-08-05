# ThePod — Project Status

Read this first, every session. It exists so Claude doesn't have to re-read
the codebase from scratch to get oriented. It's detailed on purpose —
implementation specifics (function names, data shapes, magic numbers) are
included so you can reason about changes without opening every file first.
Still open the actual file before editing it — this doc is orientation, not
a substitute for reading the code you're about to change. Update it whenever
something below goes stale — don't let it rot.

Last full code read: **2026-08-05** (against uncommitted work on branch
`fresh`, HEAD `fa81961`). Same day: verified on real hardware — app installed
as a native Release build on an iPhone 16 Pro (no Metro), Pod discovered and
connected over BLE, firmware deployed to the Pi.

## What this is

A lossless portable music player: Raspberry Pi + PCM5122 DAC (I2S) → wired
IEMs. iPhone app is a **controller only** — it never streams or plays audio
itself, it sends BLE commands and renders state the Pi pushes back. Designed
as a shippable consumer product (like a 2026 iPod), not a demo.

Flow: **iPhone App → BLE → Raspberry Pi firmware → MPD → PCM5122 DAC → IEMs**

**Pi model: Raspberry Pi Zero 2 W (512MB)** — settled on hardware 2026-08-05,
`/proc/device-tree/model` reports `Raspberry Pi Zero 2 W Rev 1.0`. The old
"Pi 3A+" claim in `README.md` was wrong and has been corrected; the About
screen and `docs/PROJECT_OVERVIEW.md` were already right. Don't re-open this.

## Stack

- **App**: React Native 0.85 + React 19.2 + Expo 56 (Expo Router, file-based
  routing), Zustand, react-native-ble-plx, Reanimated 4 + Gesture Handler,
  react-native-track-player (lock screen controls), react-native-svg (all
  icons are hand-authored inline SVG, see `src/components/ui/icons.tsx`),
  expo-image (album art), `@expo-google-fonts/archivo`.
  NativeWind/Tailwind was **removed** (commit `a437a6a`) — styling is plain
  `StyleSheet.create`. PRD/memory mentions of NativeWind are stale.
  `experiments.reactCompiler: true` and `typedRoutes: true` in `app.json`.
- **Firmware (Pi)**: Python + BlueZ over D-Bus (GATT server), MPD (playback),
  ALSA/alsaequal (EQ), Pillow (album art resize), python-mpd2, smbus2 (I2C
  battery), NetworkManager/`nmcli` (WiFi). raspotify/Spotify Connect may still
  be installed on the Pi, but **the app no longer has any Spotify UI** — the
  card was dropped in the redesign (no `spotify` reference anywhere in `src/`).
- **iOS build**: a custom config plugin `plugins/withPodDeploymentTarget.js`
  forces `IPHONEOS_DEPLOYMENT_TARGET = 16.4` on **every** Pods target in
  `post_install`. Needed because react-native-svg's and async-storage's
  resource-bundle podspecs pin an older target that CocoaPods honors ahead of
  the Podfile `platform :ios` line, and `expo-build-properties`'
  `deploymentTarget` doesn't reach per-pod-target build settings. Don't delete
  it; it's idempotent (guards on a `# @generated` marker).
- Expo docs changed a lot for v56 — check `https://docs.expo.dev/versions/v56.0.0/`
  before assuming older API shapes (per `AGENTS.md`).

## Repo layout

```
src/app/                          # expo-router screens (4 tabs: library/playing/history/pod)
  _layout.tsx                     # fonts, splash, ErrorBoundary, BLE notification sync,
                                  #   gates PairingScreen vs AppTabs on connection state
  library/    _layout.tsx, index.tsx, search.tsx (modal), album/[id].tsx
  playing/    _layout.tsx, index.tsx (Now Playing, 3 styles), queue.tsx
  history/    _layout.tsx, index.tsx
  pod/        _layout.tsx (native Stack w/ headers), index, network, equalizer,
              storage, battery, about
src/components/
  app-tabs.tsx                    # custom tab bar via expo-router/ui (Tabs/TabTrigger/TabSlot)
  MiniPlayer.tsx                  # above the tab bar, hidden on /playing
  PairingScreen.tsx               # full-screen scan/connect flow when disconnected
  ErrorBoundary.tsx               # release builds have no red-box; this shows the stack
  ui/  icons.tsx (inline SVG icon set), AlbumArt.tsx, Card, NavRow, Row,
       SectionHeader, Sheet, EmptyState (unused)
  bluetooth/BluetoothSheet.tsx
src/store/                        # zustand stores
  bluetooth.store.ts, library.store.ts, player.store.ts, pod.store.ts,
  history.store.ts                # local-only play history (AsyncStorage)
src/services/bluetooth/
  BluetoothService.ts             # BLE transport singleton (podService)
  protocol.ts                     # UUIDs, PodCommand/PodResponse types, base64 codec
src/services/audio/
  LockScreenService.ts            # react-native-track-player lock screen sync
  PlaybackService.ts              # RNTP background service: remote events → BLE commands
src/services/lyrics/LyricsService.ts     # lrclib.net synced-lyrics fetch + LRC parser
src/services/transfer/UploadService.ts   # document picker + HTTP upload/delete
src/services/transfer/WifiService.ts     # reachability ping + open iOS Wi-Fi settings
src/utils/albumColor.ts           # stable hashed {bg,fg} + initial for art-less placeholders
src/constants/theme.ts            # Palette / Radius / Font
firmware/
  main.py            # entry point, wires everything together, idle watcher thread
  gatt_server.py      # BlueZ D-Bus GATT service/characteristics + advertising + auto-pair agent
  command_handler.py  # JSON command dispatch table, all business logic, chunked responses
  mpd_controller.py   # thin wrapper over python-mpd2 (thread-safe, auto-reconnect)
  library_manager.py  # builds albums/artists/songs tree from MPD library
  battery.py           # INA219 I2C driver (Waveshare UPS HAT C)
  http_server.py       # plain HTTP server on :8080 for file upload/delete (used by app over WiFi)
  config.py            # UUIDs, ports, paths, chunk size constants — single source of truth
plugins/withPodDeploymentTarget.js   # Podfile post_install deployment-target patch
Design.pdf, Design2.pdf              # design source for the current visual language (untracked)
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
`CLEAR_QUEUE`, `ADD_TO_QUEUE{path}`, `SET_EQ{preset}`, `SCAN_WIFI`,
`CONNECT_WIFI{ssid,password}`, `GET_WIFI_STATUS`.

**Response types**: `PONG`, `OK{cmd}`, `ERROR{cmd,msg}`, `NOW_PLAYING{song,
playbackState,position,duration,volume,shuffle,repeat}`, `LIBRARY{albums,
artists,songs}`, `QUEUE{songs,index}`, `BATTERY{percent,charging,
minutesRemaining}`, `STORAGE{totalGB,usedGB,freeGB,trackCount}`,
`ALBUM_ART{path,data}` (base64 JPEG), `CHUNK`/`CHUNK_END{seq,total,data}`,
`INFO{ip,port,name,firmwareVersion}`, `WIFI_STATUS{ssid,ip,signal}`,
`WIFI_SCAN{networks}`, `WIFI_CONNECTED{ssid,ip}`.

Each `Song` carries `dateAdded` — MPD's per-file `last-modified` (ISO-8601 disk
mtime), used app-side as the "recently added" proxy. Set in **both**
`library_manager.build_library()` and `command_handler._format_song()`; keep
them in sync. It's optional in `types/music.ts` because older firmware omits it.

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
`pendingRequests: Map<id, resolver>` with a timeout (default 10s; callers pass
their own — `GET_LIBRARY` 30s, `GET_ALBUM_ART` 15–20s, `SCAN_WIFI` 25s,
`CONNECT_WIFI` 35s, `GET_QUEUE` 15s, `GET_INFO`/`SHUTDOWN` 5s) and resolves
when a response with matching `_id` arrives. Responses without a matching
pending request (e.g. the idle-watcher's unsolicited `NOW_PLAYING` push) fall
through to `notificationListeners`.

## App-side implementation notes

### Navigation & shell

- **`src/app/_layout.tsx`** is the whole app shell:
  - Loads 4 Archivo weights via `useFonts`; **3s timeout fallback** so a
    stuck/rejected font promise can't permanently blank the app
    (`ready = fontsLoaded || fontError || fontTimedOut`), then
    `SplashScreen.hideAsync()`.
  - `TrackPlayer.registerPlaybackService(...)` at module scope (required by
    RNTP — must run before the player is set up).
  - Wraps everything in `GestureHandlerRootView` → `ErrorBoundary` →
    `SafeAreaProvider` → `ThemeProvider(DarkTheme)`.
  - **Connection gate**: renders `<AppTabs />` only when
    `connectionState === 'connected'`, otherwise `<PairingScreen />`. There is
    no "browse while disconnected" mode — losing BLE returns you to pairing.
  - `<NotificationSync />` (renders null) calls `autoConnect()` +
    `setupLockScreen()` once, subscribes `podService.onDisconnect` →
    `setDisconnected()`, and pipes unsolicited `NOW_PLAYING` notifications into
    `player.applyNowPlaying`. **This is the single wiring point for the Pi's
    idle-watcher push** — the doc-level "wired up elsewhere" is here.
- **`components/app-tabs.tsx`**: tab bar is hand-built on `expo-router/ui`
  (`Tabs`/`TabSlot`/`TabTrigger`), not the standard `<Tabs>` navigator. The
  real `<TabList>` is rendered with `display:'none'` purely to register the
  four routes; the visible bar is a plain `View` of `TabTrigger`s above it, so
  active state comes from `usePathname().startsWith(href)`. `MiniPlayer` sits
  between `TabSlot` and the bar, hidden on `/playing`.
- Each tab has its own `Stack`. `library` and `playing`/`history` use
  `headerShown:false` (screens draw their own big titles); `pod/_layout.tsx`
  uses real native headers with `headerLargeTitleEnabled` on the index.
  `library/search` is `presentation:'modal'`.

### Screens

- **`library/index.tsx`**: three tabs (`albums` default, `songs`, `artists`),
  albums in a 2-col grid (`cardSize = (width - 40 - 2)/2`), A–Z ↔ Recent sort
  toggle (Recent sorts by the max `dateAdded` across an album's songs).
  Tapping an artist sets an in-screen `artistFilter` and switches to the album
  grid with a breadcrumb — it is **not** a route. Album art is prefetched by
  two sequential background loops (`fetchSongArt` small/48px,
  `fetchAlbumArt` large) guarded by **module-level** `Set`s (`artFetched`,
  `albumArtFetched`) so remounts don't refetch; they're deliberately
  sequential to avoid flooding BLE. Long-press a song → Add to Queue / Delete.
- **`library/album/[id].tsx`**: looks the album up in the already-loaded
  library store by id (no fetch); Play / Shuffle (Shuffle sends
  `SHUFFLE{enabled:true}` *then* `PLAY_ALBUM`).
- **`library/search.tsx`**: pure client-side filter over the loaded library
  (title/artist/album substring), one "top result" album, recent searches
  persisted in AsyncStorage (`thepod_recent_searches`, max 8).
- **`playing/index.tsx`** (527 lines, the biggest file): **three switchable
  layouts** — `grid` (default, square art + transport grid), `poster`
  (accent-red full-bleed, oversized title), `console` (compact art + format
  telemetry). Cycled by the `layout` icon, persisted in AsyncStorage
  (`thepod_now_playing_style`). Shared internals:
  - `SeekBar` is a hand-rolled responder-based scrubber (no slider dep):
    tracks width via `onLayout`, drags to a local `dragPos`, commits on release.
  - `displayPosition` ticks locally every 1s while playing (BLE only pushes on
    real events); when it reaches `duration` it schedules a `refresh()` 1.5s
    later to pick up the next track.
  - Volume drag is debounced 120ms before hitting BLE; `localVolume` is the
    optimistic value.
  - Album art fetched per `song.path` into a `useRef` Map cache with an
    in-flight guard.
  - Lyrics: `fetchLyrics` on song change, overlays the art area, auto-scrolls
    to the active line (`LINE_H = 52`). Only the `grid` layout exposes lyrics.
  - Pan gesture: horizontal >70px → next/previous, down >90px → `router.back()`.
- **`playing/queue.tsx`**: now a **route**, not a sheet modal (that's changed
  from earlier revisions). Splits upcoming tracks into "Continuing from the
  album" vs "Added by you" using `player.addedSongIds`. Clear → `CLEAR_QUEUE`.
- **`history/index.tsx`**: `SectionList` grouped by Today/Yesterday/weekday/
  date from `history.store`, plus a "This year on the Pod" stat block (plays,
  records added, never-played albums, listening hours) computed from history ×
  library.
- **`pod/*`**: settings-style ruled rows. `index` links out to the sub-screens
  and holds Disconnect + Power Off (`SHUTDOWN`, 5s, then local disconnect +
  clear stores). `battery` polls every 20s. `storage` does the upload flow
  (reachability check → document picker → HTTP upload → refresh storage +
  library). `network` scans/connects Wi-Fi over BLE. `equalizer` sets the
  preset locally **and** sends `SET_EQ`. `about` is static hardware text —
  it hardcodes "Raspberry Pi Zero 2W / 512MB / firmware 1.0.0", which is
  correct as of 2026-08-05 but won't track a hardware change.

### Services & stores

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
    the store (`bluetooth.store.autoConnect`) on app launch, not by the
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
- **`player.store.ts`**: playback actions are thin `sendCommand`
  fire-and-forget wrappers; queue mutations use `request()` and re-`loadQueue()`
  on `OK`. **Volume is remapped**: UI shows 0-100, but MPD volume is capped to
  0-15 (`VOL_MAX`) via a quadratic curve (`uiToMpd = round((ui/100)^2 * 15)`,
  inverse `mpdToUi`) — deliberate, to avoid ear-damaging output level and give
  finer low-volume control; don't "fix" this to be linear without understanding
  why. `addedSongIds: Set<string>` is **session-only provenance** for the queue
  screen's "Added by you" section — MPD's queue has no notion of how a track
  got there, so the store remembers the ids it appended itself; it is not
  persisted and resets on app restart. `applyNowPlaying` is the single ingest
  point for a `NOW_PLAYING` response (from `refresh()` or the unsolicited push
  wired in `_layout.tsx`): it detects a song-id change and calls
  `history.logPlay`, applies state, and pushes lock-screen metadata.
- **`library.store.ts`**: one `GET_LIBRARY` request (30s timeout — full
  library can be large/slow to chunk), flat arrays of albums/artists/songs.
  No pagination; whole library comes back in one (possibly chunked) response.
- **`history.store.ts`**: local-only play log in AsyncStorage
  (`thepod_play_history`, newest-first, capped at `MAX_ENTRIES = 500`).
  Firmware/MPD have no concept of plays, so a "play" is simply the app
  observing a track-id change in `applyNowPlaying`. Consequences that were
  accepted on purpose: history is per-install, resets on reinstall, and a
  second phone sees a different history. Adding a firmware-side log was
  rejected as too much machinery for the value.
- **`pod.store.ts`**: storage/battery/wifi status, each independently
  fetchable/failable (`fetchAll` just fires all three, errors swallowed
  per-field). `eqPreset` is local UI state only — actually applying it means
  also sending `SET_EQ` (which `src/app/pod/equalizer.tsx` does).
- **`LockScreenService.ts`**: iOS-only. Plays a silent 10-minute WAV
  (`assets/audio/silence_long.wav`) at volume 0 on repeat purely to own the
  Now Playing session, then mirrors MPD state onto it: seeks the silence to
  MPD's position (clamped to `SILENCE_DURATION - 2` to avoid the loop end) and
  writes metadata including the **undocumented iOS-only `elapsedTime`** field
  (maps to `MPNowPlayingInfoPropertyElapsedPlaybackTime`, needed for songs
  longer than the silence track). `teardownLockScreen` exists but is unused.
- **`PlaybackService.ts`**: RNTP background service. Remote play/pause/next/
  previous/seek → optimistic local RNTP call + the matching BLE command; the
  resulting `NOW_PLAYING` push is the real sync.
- **`LyricsService.ts`**: `lrclib.net/api/get`, 8s `AbortController` timeout,
  LRC parser returns sorted `{time,text}`; distinguishes `not_found` (404 or
  no `syncedLyrics`) from `error` so the UI can say "turn cellular data on —
  ThePod WiFi has no internet".
- **`UploadService.ts` / `WifiService.ts`**: document picker (audio MIME
  allowlist, `copyToCacheDirectory:false`) → `FileSystem.createUploadTask`
  BINARY_CONTENT background upload to `http://ip:port/upload?filename=`, with
  per-file progress and abort. Note it imports `expo-file-system/legacy` —
  the modern API is different in SDK 54+; check the v56 docs before migrating.
  `isPodReachable` pings `/ping` with a 2.5s timeout; `openWifiSettings` calls
  `App-Prefs:root=WIFI` directly (`canOpenURL` always returns false for it).
- **`BluetoothSheet.tsx`**: device picker sheet used from the Pod tab. Tapping
  the currently connected device shows a disconnect confirm alert; tapping any
  other device disconnects current (if any) then connects to the new one.
  (First-run/disconnected pairing goes through `PairingScreen`, not this.)

### Visual language (rewritten — "Modernist")

`src/constants/theme.ts` was fully replaced. The old Spotify-green/rounded/
glass look is **gone**; don't reintroduce radii or surface fills.

- `Palette`: `bg #0A0A0A`, `divider #2d2b2b`, `border #444141`,
  `borderFaint #605d5d`, `text #f8f4f4`, `textSecondary #9b9797`,
  `textMuted #605d5d`, `accent #ec3013` (red-orange, the only accent),
  `accentText #ffffff`, plus `danger`/`warning`. The old
  `surface`/`surfaceHigh` keys no longer exist.
- `Radius`: every value is **0**. Kept as a knob only so stray `Radius.*` call
  sites stay flat; nothing currently uses it.
- `Font`: Archivo — `regular` 400 / `medium` 600 / `bold` 700 /
  `heading` 800. Idiom throughout: huge 40px `heading` page titles, and 9–11px
  `bold` uppercase letter-spaced labels for everything secondary.
- Structure is drawn with **rules, not cards**: `ui/Card.tsx` is a 2px top
  rule with no background; `ui/Row`, `ui/NavRow`, `ui/SectionHeader` follow.
- Icons are inline SVG in `ui/icons.tsx` (`IconName` union, ~24 icons incl.
  the four tab glyphs) — no icon font, no emoji.
- `ui/AlbumArt.tsx` is the single art component: a stable hashed
  `{bg, fg}` colour block from `utils/albumColor.ts` with the title's initial,
  and the real `expo-image` art (200ms transition) layered on top once loaded.
  So there is never an empty grey square, and art can arrive late.
- AsyncStorage keys in use: `thepod_device_id`, `thepod_play_history`,
  `thepod_recent_searches`, `thepod_now_playing_style`.

### Known dead code (safe to delete, nothing imports it)

`src/features/bluetooth/BluetoothProvider.tsx` (+ `useBluetooth`),
`src/components/ui/EmptyState.tsx`, `Radius` in `theme.ts`, the
`import '@/global.css'` at the top of `theme.ts` (leftover from NativeWind —
`src/global.css` only defines CSS vars nothing reads), `Genre`/`Playlist` in
`types/music.ts`, `player.setPosition`, `LockScreenService.teardownLockScreen`.
`playPlaylist`/`PLAY_PLAYLIST` is wired end-to-end but has **no UI caller** —
there's no playlist screen yet.

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
  command, replicate this guard, don't skip it. **`_add_to_queue` currently has
  no such guard** (it hands the path straight to MPD, which resolves relative
  to its own music dir — worth tightening if it ever accepts arbitrary input).
  `_play_song` loads the **entire library** into the MPD queue (not just the
  one song) before seeking to the tapped track's index — this is deliberate so
  NEXT/PREVIOUS/shuffle/autoplay work across the whole library rather than
  stopping after one track. `_get_album_art` tries `readpicture` (FLAC
  embedded art) then `albumart` (ID3v2 APIC) then falls back to sibling
  `cover.jpg`/`folder.jpg`/etc. in the song's directory, then resizes with
  Pillow (80px/q70 "small", 300px/q75 "large"). EQ presets (`EQ_PRESETS` dict,
  10-band) are applied via `amixer -D equal set '<band>' '<val>%'` per band —
  requires `alsaequal` installed and an `equal` ALSA device configured (see
  `firmware/setup_eq.sh`). WiFi scan/connect shell out to `nmcli`, run on
  background threads (network ops can block for seconds), reply via
  `GLib.idle_add`.
- **`mpd_controller.py`**: every MPD call goes through `_cmd()`, which holds a
  `threading.Lock` and retries once after reconnecting on `mpd.ConnectionError`
  — handles MPD restarting/hiccuping without crashing the firmware.
  `pause()` toggles based on current state (no separate resume command from
  MPD's perspective). `clear_queue_and_add`/`play_playlist`/`clear_upcoming`
  bypass `_cmd` and take the lock directly since they're multi-step.
  `clear_upcoming()` reads `status()` and deletes the range
  `(current+1, playlistlength)` — i.e. "Clear" on the queue screen wipes what's
  *after* the current track and never interrupts playback. It silently no-ops
  if `status()` fails or nothing is queued ahead.
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

## Current working state

Verified by reading the code on **2026-08-05**; **not** re-verified on
hardware that day (the Pi was unreachable). Anything below marked ✳ is new
and uncommitted on branch `fresh`.

- MPD playback through PCM5122 (via `equal` ALSA device — alsaequal EQ live)
- BlueZ GATT server runs as `thepod.service` (systemd), auto-advertises via
  D-Bus `LEAdvertisingManager1` (no manual `btmgmt` needed anymore)
- BLE connect from app works without pairing confirmation (AutoPairAgent)
- Library load, playback, Now Playing, shuffle/repeat/autoplay all work
- Lock screen controls via react-native-track-player
- Album art working end-to-end (readpicture/albumart/folder-image fallback)
- Delete tracks: BLE `DELETE_TRACK`, falls back to HTTP DELETE
- EQ presets (Flat/Bass/Vocal/Treble) working via `amixer`
- WiFi network management from the Pod tab (commit `59fecb7`)
- Playlist playback command exists (commit `a437a6a`) but has no UI entry point
- ✳ Full visual redesign to the "Modernist" language (Archivo, flat, red-orange
  accent, rule-based layout) — `Design.pdf` / `Design2.pdf` are the source
- ✳ Four tabs (Library / Playing / History / Pod), custom `expo-router/ui` tab
  bar, MiniPlayer, and a `PairingScreen` gate replacing the old single-screen
  entry
- ✳ Library search screen (client-side, recent searches) and album detail route
- ✳ Queue promoted from sheet to `/playing/queue`, with `CLEAR_QUEUE` /
  `ADD_TO_QUEUE` on both sides and "Added by you" provenance
- ✳ History tab + local play log with year stats
- ✳ Now Playing has three switchable layouts (grid / poster / console)
- ✳ `dateAdded` plumbed from MPD `last-modified` → "Recent" album sort
- ✳ `ErrorBoundary` (both the in-tree one and Expo Router's, exported from
  `_layout.tsx`) + font-load timeout so release builds can't silently blank
- ✳ `plugins/withPodDeploymentTarget.js` to make the iOS Pods build
- **Removed**: the Spotify Connect card is no longer in the app (raspotify may
  still be installed on the Pi; nothing in the app talks to it)

**Networking**: Pi joins home WiFi (`Airtel_Saini Wifi Base_EXT`, autoconnect,
priority 100). The old `ThePod-AP` hotspot is disabled. Pi's home-WiFi IP is
DHCP-assigned (`192.168.1.28` on 2026-08-05 — get the current IP via BLE
`GET_INFO`, don't assume it's static). The Pi also answers mDNS as
**`ThePod.local`**, which is the reliable way to reach it without chasing DHCP.
File uploads go over home WiFi once the app has the IP (via `http_server.py` on
port 8080); control still goes over BLE. Note `pod/storage.tsx` still shows a
"connect to ThePod Wi-Fi / password thepodmusic" alert on unreachable, which
refers to the retired hotspot — stale copy.

**SSH**: `sshpass -p '13root' ssh alcehmy@ThePod.local`

⚠️ **macOS Local Network permission gotcha.** If SSH/ping to the Pi returns
`No route to host` while the internet and the router (`192.168.1.1`) work fine,
it is not the network — it's macOS blocking LAN peer access for the calling app.
Grant it under System Settings → Privacy & Security → **Local Network**. This
cost a whole session; it looks exactly like AP client isolation.

## Deploy

Firmware **must** be copied into the `firmware/` subdirectory on the Pi, not
its parent — the systemd unit's `WorkingDirectory` is
`/home/alcehmy/thepod/firmware` and it runs `python3 -u main.py` from there.
Copying to the parent is a silent no-op (this has burned multiple sessions).

```bash
sshpass -p '13root' scp firmware/*.py alcehmy@ThePod.local:/home/alcehmy/thepod/firmware/
sshpass -p '13root' ssh alcehmy@ThePod.local "sudo systemctl restart thepod"
```

Optionally clear `firmware/__pycache__` on the Pi after deploy.

**After every deploy, check the advertisement actually registered**:

```bash
sshpass -p '13root' ssh alcehmy@ThePod.local "sudo journalctl -u thepod -n 8 --no-pager"
```

You want `[ADV] Advertisement registered`. If you see
`[ADV] Advertisement error: org.bluez.Error.Failed`, the Pod is **invisible to
the app** even though `systemctl is-active` says `active` — see the advertising
entry under "Solved".

**Deployed 2026-08-05**: `command_handler.py`, `mpd_controller.py`,
`library_manager.py` (`CLEAR_QUEUE`, `ADD_TO_QUEUE`, `dateAdded`) and the
`gatt_server.py` advertising fix are on the Pi. Verified with
`grep -c 'CLEAR_QUEUE\|ADD_TO_QUEUE'` → 5 and `grep -c last-modified` → 1.

## Solved — do not re-investigate

- `btmgmt advertising` hang → replaced with D-Bus
  `LEAdvertisingManager1.RegisterAdvertisement()` (`gatt_server.py:start_server`)
- Chunk mismatch on library load → React StrictMode double-mount caused
  double subscription; fixed
- Auto-disconnect right after scan ended → fixed by checking
  `connectionState` before overwriting it (`bluetooth.store.ts`)
- iOS build failing on `IPHONEOS_DEPLOYMENT_TARGET` from react-native-svg /
  async-storage resource bundles → `plugins/withPodDeploymentTarget.js`
  (`expo-build-properties` alone does not reach per-pod targets)
- Blank screen on release builds with no diagnostics → `ErrorBoundary` plus the
  3s font-loading timeout in `_layout.tsx`. **Caveat learned 2026-08-05**: the
  in-tree `ErrorBoundary` lives *inside* `RootLayout`, so it structurally cannot
  catch a render error thrown by `RootLayout` itself. `_layout.tsx` now also does
  `export { ErrorBoundary } from 'expo-router'`, which Expo Router mounts
  *above* the layout. Don't assume a blank screen means "no error" — it can also
  mean the error had nowhere to surface.
- **Totally blank app, JS alive, no exception** → there was no route matching
  `/`. The redesign moved `src/app/index.tsx` to `src/app/library/index.tsx`,
  so Expo Router resolved nothing and never mounted the root layout; the screen
  is empty with no error anywhere. `src/app/index.tsx` now `<Redirect href="/library" />`.
  **`src/app` must always have an `index` route.** This is not Release-specific —
  it blanks under Metro too. Fast way to check: dump the route context from a
  built bundle with
  `strings -a main.jsbundle | grep -oE '\./[a-z0-9_/\[\]-]+\.tsx' | sort -u`.
- **Pod discoverable in iOS Settings but not in the app** → BR/EDR
  discoverability (`Discoverable=True`) and LE advertising are *separate paths*;
  CoreBluetooth only sees the latter. `RegisterAdvertisement` was failing because
  the payload was 32 bytes against the 31-byte legacy limit (flags 3 + 128-bit
  ServiceUUIDs 18 + LocalName 8 + tx-power 3). Dropped `Includes: ['tx-power']`
  → 29 bytes. Keep any new advertisement field inside that budget; this
  controller has no extended advertising.
- **Pairing screen stuck on "0 found" while BLE genuinely worked** → two bugs
  stacked. (1) `PairingScreen`'s scan effect re-ran on every transition to
  `'disconnected'`, but `startScan()` *ends* by setting `'disconnected'` and
  *begins* by clearing `scannedDevices`, so each scan wiped its own results
  every 8s — now a one-shot `useRef` guard. (2) `autoConnect()` flipped
  `disconnected → connecting → disconnected` on a fresh install, re-firing that
  effect and starting a second overlapping scan; CoreBluetooth allows one scan
  per manager, so the second stole the callback and resolved empty over the
  real results. `scan()` now shares one in-flight promise.
  Diagnose from the phone: `idevicesyslog -u <udid>` and grep
  `advertisements delivered` — one session per scan, non-zero count.

## Code quality rules (from the PRD)

- Strict TypeScript, no placeholder/mock/fake implementations
- Every shipped feature must work end-to-end on real hardware
- No Android-looking components. **The design language is now flat modernist**
  (zero radius, rules instead of cards, Archivo, single red-orange accent) —
  the PRD's earlier "dark, glass, rounded" wording is superseded by
  `Design.pdf`/`Design2.pdf` and `src/constants/theme.ts`.

## Roadmap (original order, check git log for what's actually done)

BLE Write → BLE Notifications → MPD integration → FLAC playback → Music
library → Album art → Battery & storage → Firmware updates → (past original
scope) WiFi management, playlists, EQ, search, history, queue editing.

Not built yet: playlist UI (the command exists), queue reordering (the
drag-handle icon in `playing/queue.tsx` is decorative), firmware OTA updates.
