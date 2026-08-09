# ThePod — Project Status

Read this first, every session. It exists so Claude doesn't have to re-read
the codebase from scratch to get oriented. It's detailed on purpose —
implementation specifics (function names, data shapes, magic numbers) are
included so you can reason about changes without opening every file first.
Still open the actual file before editing it — this doc is orientation, not
a substitute for reading the code you're about to change. Update it whenever
something below goes stale — don't let it rot.

Last full code read: **2026-08-08** (against uncommitted work on branch
`fresh`, HEAD `9e61406`). Verified that day by `tsc --noEmit` and a full
`expo export --platform ios` bundle, **not** on hardware. Last hardware run was
2026-08-05: native Release build on an iPhone 16 Pro (no Metro), Pod discovered
and connected over BLE, firmware deployed to the Pi.

⚠️ **The "Modernist" visual language described in older revisions of this doc is
gone.** The app was redesigned again — to the **v2 "feed-led" language** sourced
from the Claude Design project *Mobile app design system* (`ThePod App v2`).
Spline Sans, rounded surfaces, colour wash, four tabs Home/Search/Library/Pod.
Anything below that says Archivo, zero-radius, or "rules instead of cards" has
been corrected; if you find a leftover, it's a doc bug, trust `theme.ts`.

⚠️ **`ThePod_Project_Specification_v0.1.pdf` (in the design bundle) describes a
different, future device**: Prototype 2 on an **ESP32-S3**, and it states the
Raspberry Pi platform "is not carried forward in any form". Everything in this
repo — firmware, MPD, BLE protocol — is Prototype 1, which that spec marks
complete. Don't treat the PDF as a description of this codebase; its §8 BLE
protocol is a *proposal* that does not match `protocol.ts`, and its §9.1 still
says NativeWind, which was removed in `a437a6a`.

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
src/app/                          # expo-router screens
  index.tsx                       # Redirect to /home — src/app MUST have an index route
  _layout.tsx                     # fonts, splash, ErrorBoundary, BLE notification sync,
                                  #   gates Onboarding vs PairingScreen vs the root Stack
  (tabs)/                         # the 3 tabs; a group, so hrefs stay /home /library /pod
    _layout.tsx                   #   re-exports AppTabs + `unstable_settings.anchor`
    home/       _layout.tsx, index.tsx (the feed), history.tsx
    library/    _layout.tsx, index.tsx (Songs/Albums/Artists + search), album/[id].tsx
    pod/        _layout.tsx (native Stack w/ headers), index, network, equalizer,
                storage, battery, about
  playing/    _layout.tsx, index.tsx (Now Playing), queue.tsx
                                  #   NOT a tab — presented as a modal sheet over (tabs)
src/components/
  app-tabs.tsx                    # custom tab bar via expo-router/ui (Tabs/TabTrigger/TabSlot)
  MiniPlayer.tsx                  # above the tab bar, always mounted
  PairingScreen.tsx               # full-screen scan/connect flow when disconnected
  Onboarding.tsx                  # 3-panel first-run intro, gated on thepod_onboarded
  ErrorBoundary.tsx               # release builds have no red-box; this shows the stack
  ui/  controls.tsx (the v2 kit), icons.tsx (inline SVG), AlbumArt.tsx,
       Card, NavRow, Row, SectionHeader, Sheet, EmptyState (unused)
  bluetooth/BluetoothSheet.tsx
src/store/                        # zustand stores
  bluetooth.store.ts, library.store.ts, player.store.ts, pod.store.ts,
  history.store.ts                # local-only play history (AsyncStorage)
  art.store.ts                    # album-art cache (memory + disk) + BLE prefetch
  app.store.ts                    # onboarding flag + the global "Reset app"
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

## What goes in the repo (and what never does)

`.gitignore` is the enforcement; this is the *why*, so a judgement call about a
new file has an answer. When in doubt: **if a clean checkout plus
`npm install` can regenerate it, it does not belong in git.**

**Committed:**

| Path | Note |
|---|---|
| `src/` | app source |
| `firmware/*.py`, `*.sh`, `requirements.txt` | deployed to the Pi by hand — see Deploy |
| `plugins/` | config plugins; `withPodDeploymentTarget.js` is required to build iOS |
| `assets/` | incl. `audio/silence_long.wav` (4.6MB) — **runtime-required**, the lock-screen session depends on it, don't "clean it up" |
| `docs/`, `README.md` | |
| `app.json`, `package.json`, `package-lock.json`, `tsconfig.json` | lockfile committed on purpose — builds must be reproducible |

**Never committed:**

| Path | Why |
|---|---|
| `/ios`, `/android` | generated. `npx expo prebuild` rebuilds them; committing them means every dependency bump lands as an unreviewable native diff |
| `node_modules/`, `.expo/`, `dist/`, `web-build/`, `expo-env.d.ts` | generated |
| `firmware/__pycache__/`, `brag-output/` | generated |
| `.claude/`, `CLAUDE.md`, `AGENTS.md` | dev tooling, not the project |
| `*.jks` `*.p8` `*.p12` `*.key` `*.mobileprovision` `*.pem` | **signing material — a leak here is unrecoverable, you re-key** |
| `.env*.local` | secrets |
| `Design.pdf`, `Design2.pdf` | multi-MB binaries, and a *superseded* direction (the v2 language came from the Claude Design project, not these). Binaries are near-impossible to remove from history later — keep design sources out of git |

⚠️ **Before this repo is ever made public or shared:** `docs/PROJECT_STATUS.md`
contains the Pi's SSH password in plaintext (`sshpass -p '13root'`, several
occurrences) and it is **already in committed history**, so deleting the line
is not enough — it needs a history rewrite *and* a password change on the Pi.
Fine while the repo is private; a blocker the moment it isn't.

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
  - Loads 4 Spline Sans weights via `useFonts`; **3s timeout fallback** so a
    stuck/rejected font promise can't permanently blank the app, then
    `SplashScreen.hideAsync()`. `ready` also waits on the `thepod_onboarded`
    read, so the splash covers it rather than onboarding flashing over an
    already-set-up app. A failed read is treated as "already seen" — a storage
    error must never trap a returning user behind onboarding.
  - `TrackPlayer.registerPlaybackService(...)` at module scope (required by
    RNTP — must run before the player is set up).
  - Wraps everything in `GestureHandlerRootView` → `ErrorBoundary` →
    `SafeAreaProvider` → `ThemeProvider(DarkTheme)`.
  - **Three-way gate**, in order: `<Onboarding />` if `thepod_onboarded` is
    unset, else `<AppTabs />` if `connectionState === 'connected'`, else
    `<PairingScreen />`. There is no "browse while disconnected" mode — losing
    BLE returns you to pairing. Onboarding sits *outside* the connection gate
    on purpose: it must be able to run before any BLE call, because the iOS
    permission prompt is fired by `PairingScreen`'s scan and the last panel
    exists to give that prompt a reason. This is safe because `autoConnect()`
    returns early when no device id is saved, so a fresh install touches no BLE
    API until onboarding is dismissed.
  - `<NotificationSync />` (renders null) calls `autoConnect()` +
    `setupLockScreen()` once, subscribes `podService.onDisconnect` →
    `setDisconnected()`, and pipes unsolicited `NOW_PLAYING` notifications into
    `player.applyNowPlaying`. **This is the single wiring point for the Pi's
    idle-watcher push** — the doc-level "wired up elsewhere" is here.
  - When connected it renders a **root `<Stack>`** with exactly two screens:
    `(tabs)` and `playing` (`presentation: 'modal'`). Now Playing is therefore
    a card **over** the tab navigator, not a member of it — see the
    tab-route-order entry under "Solved" for why that distinction is load-bearing
    and not a stylistic choice.
- **`src/app/(tabs)/_layout.tsx`** is a two-line file that re-exports
  `AppTabs` — it exists to own **`export const unstable_settings = { anchor:
  'home' }`**, which must live in the route file, not in the component. Deleting
  it silently moves the launch tab to Pod.
- **`components/PairingScreen.tsx`** has **two modes off one saved value**
  (`thepod_device_id`), and the distinction is the whole UX:
  - **No Pod paired** → the device picker: scan, list, tap to adopt. This is
    the *only* time a list is shown.
  - **A Pod paired** → a status screen with no list at all. It reads
    "Connecting to ThePod…" and the standing reconnect does the work, so
    reopening the app just connects. When the link is down (e.g. the user
    disconnected from iOS Settings) the single CTA is "Connect to ThePod".
  Until the saved id has been read the mode is `null` and neither renders —
  committing early would flash a device picker at someone who owns a Pod.
  "Pair a different Pod" is a quiet text link, not a second button; the point
  of the paired mode is that the common case offers no choices.
- **`components/app-tabs.tsx`**: tab bar is hand-built on `expo-router/ui`
  (`Tabs`/`TabSlot`/`TabTrigger`), not the standard `<Tabs>` navigator. The
  real `<TabList>` is rendered with `display:'none'` purely to register the
  three routes; the visible bar is a plain `View` of `TabTrigger`s above it, so
  active state comes from `usePathname().startsWith(href)`. `MiniPlayer` sits
  between `TabSlot` and the bar and is **always mounted** — the sheet covers it,
  so unmounting it only cost a layout pass on the card behind the sheet.
  `options={{ backBehavior: 'history' }}`: the default `firstRoute` sends every
  cross-tab back to one fixed tab.
- Each tab has its own `Stack`, all with `headerShown:false` (screens draw
  their own titles) except `pod/_layout.tsx`, which uses real native headers
  with `headerLargeTitleEnabled` on the index. Search is **inside Library**, not
  a tab.

### Screens

- **`home/index.tsx`** — the v2 feed, and the app's landing route. A
  `HeaderWash` seeded off the first quick-pick, a greeting that keys off the
  clock, a 2×2 grid of quick picks, then horizontal shelves: Recently played,
  More from *artist*, Recently added, Hi-res on the Pod. Two things to know:
  - **"Recently played" is the local play log projected onto the library.** The
    Pod has no play history of its own (see `history.store`), so this is the
    app's own record, not the device's.
  - **"More from *artist*" is deliberately not a recommendation.** It's
    same-artist albums off the last thing played — the honest version of a
    recommendation shelf with no listening model behind it. Don't dress it up.
  - Art prefetch is kicked off here once via `art.store.prefetchLibrary`.
- **`home/history.tsx`**: `SectionList` grouped Today/Yesterday/weekday/date,
  plus a "This year on the Pod" stat block (plays, records added, never-played
  albums, listening hours) computed from history × library. Reached from the
  Recently-played shelf's "See all", not from a tab.
- **`library/index.tsx`** — three chips, **Songs (default) / Albums /
  Artists**, as flat rows. **Search lives here, not in its own tab**: a field
  under the title filters whichever list is showing, so there is one
  destination instead of two showing the same records. `src/app/search/` was
  deleted and the tab bar went from four tabs to three.
  - The matcher special-cases `hi-res`/`hires` as a **format filter** (bit
    depth >16 or sample rate >48 kHz) rather than a substring nothing would
    ever match — it's the one query users type that isn't a name.
  - Recent searches persist in `thepod_recent_searches` (max 8) and surface as
    tappable chips on the Songs tab when the field is empty.
  - A–Z ↔ Recently-added sort toggle over albums (Recent sorts by max
    `dateAdded` across the album's songs). Tapping an artist sets an in-screen
    `artistFilter` and shows their albums behind a breadcrumb — it is **not** a
    route. Artists render as a circular hue mark with their initial, visually
    distinct from the square record blocks in the same list.
- **`library/album/[id].tsx`**: looks the album up in the already-loaded
  library store by id (no fetch); Play / Shuffle (Shuffle sends
  `SHUFFLE{enabled:true}` *then* `PLAY_ALBUM`).
- **`playing/index.tsx`**: **one** layout now — the three switchable
  grid/poster/console styles and the `thepod_now_playing_style` key are gone.
  Full-bleed hue wash behind square art, oversized title, circular accent FAB,
  format badges (`FLAC`, `24/192`, `PCM5122`, `Bit-perfect`) along the bottom.
  - Presented as a **modal sheet** off the root Stack, so the vertical axis
    belongs to the system's interactive dismiss. `insets.top` is 0 in a sheet;
    the nav row pads itself.
  - Seek and volume are both `ui/controls.tsx` **`Scrubber`**s — one component,
    two labels. The caller owns the `fraction` shared value so `LiveText` can
    read it without a re-render, and **nothing in a drag touches the JS
    thread**. Volume passes `liveMs={120}` (you have to hear it to aim); seek
    doesn't, because a live seek is a BLE write per frame.
  - `displayPosition` ticks locally every 1s while playing (BLE only pushes on
    real events); when it reaches `duration` it schedules a `refresh()` 1.5s
    later to pick up the next track. `seekFrac` is driven from it with a **1s
    linear `withTiming`**, so the bar glides between ticks rather than stepping;
    a delta over 2s is a seek or a track change and snaps instead.
  - `scrubbing` / `volScrubbing` refs stop those two effects writing the shared
    value out from under a thumb that is already on the bar.
  - Album art fetched per `song.path` into a `useRef` Map cache with an
    in-flight guard.
  - Lyrics: `fetchLyrics` on song change, cross-fades with the art in the same
    box, auto-scrolls to the active line (`LINE_H = 52`).
  - Pan gesture is **horizontal only** (`activeOffsetX` ±14, `failOffsetY`
    ±18) — the vertical axis must reach the sheet. The art follows at half
    travel and dims as it goes, then springs back; past ±70px it fires
    next/previous.
- **`playing/queue.tsx`**: a **route**, not a sheet modal. Splits upcoming
  tracks into "Continuing from the album" vs "Added by you" using
  `player.addedSongIds`. Clear → `CLEAR_QUEUE`.
- **`components/Onboarding.tsx`**: three panels (records-not-a-stream /
  phone-is-the-remote / Bluetooth permission), pulsing app mark, dot pager,
  Continue → Allow Bluetooth, Skip → Not now. Writes `thepod_onboarded` and
  hands back to the connection gate. The button **does not** request Bluetooth
  itself — dismissing mounts `PairingScreen`, whose scan is what triggers the
  iOS prompt.
- **`pod/*`**: settings-style rows. `index` links out to the sub-screens
  and holds Disconnect + Power Off (`SHUTDOWN`, 5s, then local disconnect +
  clear stores). `battery` polls every 20s. `storage` does the upload flow
  (reachability check → document picker → HTTP upload → refresh storage +
  library). `network` scans/connects Wi-Fi over BLE. `equalizer` sets the
  preset locally **and** sends `SET_EQ`. `about` is static hardware text —
  it hardcodes "Raspberry Pi Zero 2W / 512MB / firmware 1.0.0", which is
  correct as of 2026-08-05 but won't track a hardware change.

### Services & stores

#### Seamless reconnection — how it actually works

The goal is Apple-Watch behaviour: pair once, then it is simply connected
whenever it's nearby, with no scanning, tapping or waiting. Four pieces make
that work, and **removing any one silently degrades it back to cold connects**:

1. **`UIBackgroundModes: ['audio', 'bluetooth-central']`** (`app.json`). Without
   `bluetooth-central` iOS suspends all BLE the moment the app backgrounds.
2. **Core Bluetooth state preservation/restoration** — `BleManager` is
   constructed with `restoreStateIdentifier: 'thepod-ble-central'` and a
   `restoreStateFunction`. iOS then keeps pending connections alive across
   suspension, queues BLE events, and **relaunches the app in the background**
   when one arrives. `restoreStateFunction(null)` = cold start; non-null =
   restored, and `restoredState.connectedPeripherals` are already linked.
   The identifier is keyed on by iOS, so **never change it** — a new value
   orphans the preserved state.
3. **A standing connect with no timeout** (`connectWhenInRange`). CoreBluetooth
   `connect` never times out on its own; it completes whenever the peripheral
   appears. That is the whole reconnect strategy — no scan loop, no polling, no
   backoff, and the radio stays idle while waiting.
4. **Re-arming on every edge**: an involuntary drop (`setDisconnected`),
   Bluetooth being toggled back on (`onBluetoothReady`, which fires immediately
   with the current state and therefore also covers launch), and returning to
   the foreground (`AppState` → `verifyLink()`, re-arm if the link died while
   away).

A restored or background-completed connection has **nothing awaiting a
promise**, which is why `onConnected` / `store.adoptConnection()` exist. A
restored peripheral is live at the link layer but this process holds none of
its state, so `adoptRestored` rediscovers services and re-subscribes the
status notify before treating it as usable.

Known limits, straight from Apple: restoration does **not** happen if the user
force-quits the app from the app switcher, turns Bluetooth off, or denies the
Bluetooth permission.

- **`BluetoothService.ts`** (singleton `podService`, no React dependency):
  - `scan()`: 8s window, **filtered on `[POD_SERVICE_UUID]`** so only Pods are
    ever delivered — an unfiltered scan surfaced every phone/TV/earbud nearby,
    which is noise no user of this app can act on. This depends on the firmware
    putting the 128-bit UUID in the **advertisement** (not the scan response),
    which is what CoreBluetooth matches on; `_adv_payload()` does. The
    name-based sort is now just a tiebreak between Pods.
  - `connect(deviceId)`: races `_connectInternal` against a 12s timeout;
    guarded by `_isConnecting` so concurrent calls no-op. Internally:
    `connectToDevice({requestMTU:512, timeout:10000})` →
    `discoverAllServicesAndCharacteristics()` → subscribes to Status notify →
    registers `onDisconnected` cleanup (clears device, subscription, pending
    requests, chunk buffers, fires `disconnectListeners`) → **`handshake()`**.
  - **`handshake()`** — PINGs until the Pod answers (4 tries × 1.4s),
    re-subscribing the status notify between attempts, and throws if it never
    does. It replaced a fixed 800ms sleep, and it is not optional politeness:
    the Pi drops every notification while its `notifying` flag is False
    (`gatt_server._notify`), so a command answered before iOS's `StartNotify`
    lands gets a reply that goes nowhere. See the first-connect entry under
    "Solved". `adoptRestored` runs it too — more important there, since nothing
    is awaiting a promise to notice a dead link.
  - `disconnect()`: removes subscription, `cancelDeviceConnection`, swallows
    errors.
  - **`connectWhenInRange(deviceId)`** — the standing reconnect. Calls
    `connectToDevice` with **no `timeout`**, which is the whole point:
    CoreBluetooth's connect has no timeout of its own and simply completes
    whenever the peripheral turns up. So "reconnect when nearby" needs no scan
    loop, no polling and no backoff — iOS does the waiting and keeps the radio
    idle, which a repeated scan would not. Don't "fix" this by adding a timer.
  - **`cancelPendingConnect()`** — a standing reconnect holds the radio on one
    peripheral, so it must be dropped before a scan or a connect to a
    *different* Pod can run. Both store actions call it first.
  - **`handleLinkLost()`** — the single teardown path, idempotent, fired both
    by `onDisconnected` and by a **status-notify error**. That second trigger
    matters: the monitor error used to be swallowed, which produced the worst
    failure mode available — the link looks up, the gate lets you into the app,
    and then every request times out against an empty library and a blank
    battery with nothing on screen saying why. If the notify is dead the
    connection is useless; surface it as a disconnect.
- **`bluetooth.store.ts`**: `connectionState` is
  `disconnected|scanning|connecting|connected`, all transitions guarded by
  checking current state first (prevents overlapping scan/connect calls —
  this is also the fix for the "auto-disconnect right after scan ended" bug,
  see Solved bugs). Persists the last connected device id in AsyncStorage
  (`thepod_device_id`). **`autoConnect()` runs at launch *and again on every
  involuntary drop*** — `setDisconnected()` re-arms it — so once you've paired
  once, walking back into range reconnects on its own with no tapping. It sets
  `awaitingPod` (not `connectionState`) while iOS holds the connect open, which
  is what `PairingScreen` renders as "Waiting for ThePod…". The explicit
  Disconnect/Power-off path forgets the saved id, which is precisely what stops
  the standing reconnect from latching straight back on. On connect,
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
  **Persisted to `thepod_library` (AsyncStorage) on every successful fetch and
  re-read at launch** — after album art it's the other expensive payload on the
  link, so a reconnect or cold start renders from disk and asks the Pod for
  nothing. Three pieces make that hold: `isLoading` starts **true** so a screen
  can't fire `GET_LIBRARY` before the disk read lands; `hydrate()` memoizes the
  *promise* (not a boolean) so a second caller mid-read awaits the same read
  instead of seeing an empty store; and screens call **`ensureLibrary()`**
  (disk first, BLE only if the cache came up empty) rather than `fetchLibrary()`
  directly. `fetchLibrary()` is now the *explicit refresh* — upload, delete,
  Retry, and pull-to-refresh on the Library lists. `clear()` is **memory-only**
  (the cached copy surviving a disconnect/power-off is the whole point) and
  immediately re-hydrates; `app.store.reset()` removes the key by prefix sweep
  before calling it, so the re-read correctly finds nothing. Nothing expires the
  cache on its own — music put on the Pod outside the app shows up on a refresh.
- **`art.store.ts`**: album art is the most expensive thing on the BLE link —
  hundreds of chunked notifies per record — so a fetched cover is **written to
  `Paths.cache/album-art/` and reused forever**. A reconnect or a cold launch
  paints from disk and never asks the Pod again. Art for a given file never
  changes, so there is no invalidation problem; the OS may reclaim the
  directory under storage pressure and a miss just re-fetches.
  - Filenames are a **64-bit FNV-1a as two independently-seeded 32-bit passes**.
    Track paths are too long (and contain `/`) to use directly, and a single
    32-bit hash would collide about 1-in-300 across a few thousand tracks —
    which shows the *wrong cover*, silently. Don't reduce it to one pass.
  - `hydrate()` reads the directory listing **once** into an in-memory `Set` so
    the `useArt` selector can stay synchronous — it has to answer during render,
    and touching the filesystem there would cost a frame of missing artwork.
    Called from `_layout.tsx` before anything renders.
  - `clear()` drops memory only (the disk cache surviving is the entire point);
    `purgeDisk()` is the full wipe and is only used by Reset.
- **`app.store.ts`**: holds `onboarded` and the global `reset()`. The flag lives
  in a store rather than `_layout` local state specifically so Pod › About's
  "Reset app" can flip it and drop the whole tab stack back to the intro.
  `reset()` cancels any pending reconnect, disconnects, sweeps every
  `thepod_*` AsyncStorage key, purges the art directory and clears every store.
  Nothing on the Pod is touched — it is a local wipe, not an un-provisioning.
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

### Visual language (v2 — "feed-led, full-bleed, orange")

`src/constants/theme.ts` is a direct port of the `ThePod App v2` design.
Rounded surfaces and elevation steps are **back** (the flat/zero-radius
Modernist pass is gone). Four moves define it, and they're worth keeping
straight because most layout questions answer themselves from them:

1. **Feed, not a list** — Home opens on horizontal shelves, not a table.
2. **Colour wash** — album/playlist/player headers bleed a hue sampled from
   the record into the canvas.
3. **One accent gesture per surface** — a single circular orange play control.
   Everything else stays monochrome. Resist adding a second orange thing.
4. **Four tabs** — Home · Search · Library · Pod.

- `Palette`: `bg #0A0A0A`, `surface #141416`, `rail #1F1F22`,
  `control #2A2A2E`, `inactive #3a3a3e`; `text #ffffff`,
  `textSecondary #a1a1a6`, `textMuted #6b6b70`; `accent #EE3211`,
  `accentHi #FF6B4A`, `accentWash #2A100C` (behind hi-res badges);
  `success/warning/danger` + `dangerWash #2C0A0A`. `divider`/`border`/
  `borderFaint` are kept as **aliases onto the elevation steps** purely so the
  older rule-based screens keep compiling — don't reach for them in new code.
- `Radius`: `xs 5 · sm 7 · md 10 · lg 12 · card 16 · pill 999`. Real values
  now; the "every radius is 0" rule is dead.
- `Font`: **Spline Sans** — `regular` 400 / `medium` 500 / `bold` 600 /
  `heading` 700, plus `mono` (Menlo on iOS) for **every numeric or format
  readout**: durations, RSSI, MTU, `24/192`, MAC addresses. That mono/sans
  split is load-bearing in this design, not decoration.
- `src/components/ui/controls.tsx` is the v2 kit: `Chip`/`ChipRow`, `Fab`,
  `IconCircle`, `HeaderWash`, `SectionTitle`, `Overline`, `SpecBadge`,
  `PillButton`, `Pulse`, `PlayingBars`. Reach here before writing a new
  primitive. The older `ui/Card`, `Row`, `NavRow`, `SectionHeader`, `Sheet`
  survive and are still used by the `pod/*` settings screens.
- `Pulse` (expanding, fading ring) is shared by `PairingScreen`, `pod/index`
  and `Onboarding` — it is absolutely positioned, so pass it the **same
  size/radius as its parent** or it will not sit concentric.
- `utils/albumColor.ts` is the wash engine: `hueFor(key)` hashes an id/title to
  a stable hue, then `ringColor` / `tintColor` / `washColor` derive the
  saturated line, the dark gradient stop and the header wash. One number drives
  the art block, the header gradient and the accent ring, so **no artwork is
  ever required** — real art just layers on top when it arrives. Checked by
  `src/utils/albumColor.test.ts` (`node src/utils/albumColor.test.ts`; excluded
  from the tsc program in `tsconfig.json`).
- Icons are inline SVG in `ui/icons.tsx` (`IconName` union) — no icon font,
  no emoji.
- `ui/AlbumArt.tsx` holds the cover at **zero opacity until `onLoad` fires**,
  then fades it in over 260ms. expo-image's own `transition` prop is
  deliberately unused: it starts as soon as the first bytes decode, which shows
  exactly the half-painted band this is meant to prevent. The reveal resets on
  every `uri` change so a recycled row can't flash the previous cover. It
  layers the real `expo-image` art over the hue block, so
  there is never an empty grey square and art can arrive late.
- AsyncStorage keys in use: `thepod_device_id`, `thepod_play_history`,
  `thepod_recent_searches`, `thepod_onboarded`. **All app keys are namespaced
  `thepod_` on purpose** — `app.store.reset()` enumerates `getAllKeys()` and
  removes by prefix rather than hardcoding a list, so a screen that adds a key
  later can't silently survive a reset. Keep the prefix.
- **Motion**: `ui/controls.tsx` exports `Pressed`, the single source of tap
  feedback — a `Pressable` that dips in scale/opacity on press-in and *springs*
  back on release (spring, not timing, so it overshoots slightly and reads as a
  physical button). `Chip`, `Fab`, `IconCircle` and `PillButton` all route
  through it, and rows/cards use it directly; `scaleTo` is tuned per element
  size because a 3% dip that feels right on a row makes a 142px shelf card
  lurch. The dip is shallow (0.14 opacity) and gated behind
  `unstable_pressDelay={55}`, so touching a row on the way into a scroll never
  lights it up. **Tab switches are an instant swap** — the acknowledgement is
  the springing tab glyph. There *was* a cross-fade, via an `Animated.View`
  keyed on the active tab around `TabSlot`; the key change unmounted the whole
  tab stack on every switch, so lists and scroll position were rebuilt and
  mount effects re-ran while the fade played over a blocked JS thread. Don't
  reintroduce it — a keyed wrapper around `TabSlot` is a remount, not a
  transition. Stacks use `animation: 'slide_from_right'`. Now Playing has **no**
  screen animation of its own — it is a native modal sheet, and the rise and the
  interactive drag-to-dismiss are the presentation, not a transition inside it.
- **State changes get a transition, not a swap.** `Fab` stacks the play and
  pause glyphs and cross-fades + scales between them rather than swapping
  `name`; the art/lyrics toggle is a `FadeIn`/`FadeOut` pair in one box;
  `MiniPlayer` enters on `SlideInDown` and leaves on `SlideOutDown`, because it
  changes the height of everything above it and must never pop.
- **Animation cost rules**, learned the hard way and cheap to keep:
  - Animate `transform`/`opacity`, **never a layout property**. `PlayingBars`
    scales a fixed-height bar (`transformOrigin: 'bottom'`) instead of animating
    `height`; every progress fill in the app — `Scrubber`, `MiniPlayer` — is a
    full-width view with `transformOrigin: 'left'` driven by `scaleX`, **not** a
    percentage `width`, which re-runs layout on every frame.
  - **A drag must never `setState`.** `Scrubber` writes a caller-owned shared
    value and `LiveText` renders the number by writing the `text` prop of a
    read-only `TextInput` through `useAnimatedProps` — so a scrub never enters
    React at all. This replaced responder-based bars that re-rendered Now
    Playing's gradient, artwork and lyric sheet on every touch-move.
  - `AlbumArt` and the lyric sheet are `memo`'d — all-primitive props, and
    `AlbumArt` owns a gradient plus a decoded image in every list row.

### Known dead code (safe to delete, nothing imports it)

`src/features/bluetooth/BluetoothProvider.tsx` (+ `useBluetooth`),
`src/components/ui/EmptyState.tsx`, `Genre`/`Playlist` in `types/music.ts`,
`player.setPosition`, `LockScreenService.teardownLockScreen`.
`playPlaylist`/`PLAY_PLAYLIST` is wired end-to-end but has **no UI caller** —
see the playlist note under Roadmap. (`Radius` is no longer dead — the v2
design uses every value. The `@/global.css` import is gone.)

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
  attempted via `LEAdvertisingManager1.RegisterAdvertisement` (D-Bus), not
  `btmgmt` — this was a past bug fix, see Solved bugs, don't revert to
  subprocess/btmgmt. **That D-Bus call currently always fails on this box**
  (BlueZ 5.82 ext-adv bug, see Solved), so `_advertise_via_mgmt` takes over via
  the legacy `Add Advertising (0x003e)` MGMT opcode on a raw socket that
  `_mgmt_sock` must keep open for the process lifetime. `_set_discoverable`
  runs **after** the agent registration on purpose — bluetoothd re-enables
  `Pairable` when a default agent is installed. A `PropertiesChanged` signal receiver watches for BLE
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

Verified on **2026-08-08** by reading the code, `tsc --noEmit` (clean) and a
full `expo export --platform ios` (bundles clean). The v2 redesign has **not
been run on hardware or on a simulator** — treat every ✳ item as "compiles and
reads right", not "seen working". Anything marked ✳ is new and uncommitted on
branch `fresh`.

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
- ✳ Full visual redesign to the **v2 "feed-led" language** (Spline Sans,
  rounded, colour wash, `#EE3211`) — source is the Claude Design project
  *Mobile app design system*, file `ThePod App v2.dc.html`. This **replaced**
  the short-lived "Modernist" pass; `Design.pdf`/`Design2.pdf` are that older,
  superseded direction
- ✳ **Three** tabs (Home / Library / Pod), custom `expo-router/ui` tab bar,
  MiniPlayer, and an Onboarding → PairingScreen → AppTabs gate
- ✳ Home feed with quick picks and four horizontal shelves; History moved under
  Home
- ✳ Search **merged into Library** as an inline filter; `src/app/search/`
  deleted. Library tabs are Songs (default) / Albums / Artists
- ✳ `art.store.ts` — album-art cache backed by `Paths.cache/album-art/`, so
  covers survive reconnects and cold launches; in-flight guard plus a
  sequential background prefetch (art requests must not flood BLE)
- ✳ `library.store.ts` persists the library to `thepod_library`, so a connect no
  longer re-sends the whole chunked library over BLE; pull-to-refresh on the
  Library lists is the manual refresh
- ✳ `app.store.ts` + **Reset app** (Pod › About) — wipes every `thepod_*` key,
  the art directory and all stores, then returns to onboarding
- ✳ Motion pass: `Pressed` spring feedback on every control, springing tab
  glyphs, stack slide animations, art fade-in on load — plus a smoothness pass
  that killed the tab-switch remount, moved `PlayingBars` off layout animation,
  took the volume drag and the lyric sheet out of the screen's render path, and
  memoised `AlbumArt`
- ✳ PING/PONG handshake gating "connected", which fixes the first connect
  after pairing coming up with no data
- ✳ Seamless BLE reconnection — `bluetooth-central` background mode, Core
  Bluetooth state restoration, a no-timeout standing connect, and re-arming on
  drop / Bluetooth-on / foreground. See "Seamless reconnection" above
- ✳ `ui/controls.tsx` — the shared v2 primitive kit
- ✳ Three-panel first-run Onboarding (`thepod_onboarded`)
- ✳ Queue promoted from sheet to `/playing/queue`, with `CLEAR_QUEUE` /
  `ADD_TO_QUEUE` on both sides and "Added by you" provenance
- ✳ Now Playing reduced to a single layout (the 3-style switcher is gone)
- ✳ `dateAdded` plumbed from MPD `last-modified` → "Recent" album sort
- ✳ App icon is the white-P-on-`#EE3211` mark; splash ground `#0A0A0A`.
  Android's adaptive-icon **foreground is still the Expo default artwork** —
  only its background colour was brought onto brand. iOS is the only built
  platform, so this was left alone deliberately
- ✳ `ErrorBoundary` (both the in-tree one and Expo Router's, exported from
  `_layout.tsx`) + font-load timeout so release builds can't silently blank
- ✳ `plugins/withPodDeploymentTarget.js` to make the iOS Pods build
- **Removed**: the Spotify Connect card is no longer in the app (raspotify may
  still be installed on the Pi; nothing in the app talks to it)

**Networking**: The Pi joins home WiFi on boot (autoconnect, priority 100); the
old `ThePod-AP` hotspot is disabled. The network was `Airtel_Saini Wifi Base_EXT`
as of 2026-08-05 and is **`AlchemyZden` as of 2026-08-09**. Pi's IP is
DHCP-assigned (`192.168.1.28`, unchanged across both dates — but get the current
IP via BLE `GET_INFO`, don't assume it's static). The Pi also answers mDNS as
**`ThePod.local`**, which is the reliable way to reach it without chasing DHCP.
File uploads go over home WiFi once the app has the IP (via `http_server.py` on
port 8080); control still goes over BLE. Note `pod/storage.tsx` still shows a
"connect to ThePod Wi-Fi / password thepodmusic" alert on unreachable, which
refers to the retired hotspot — stale copy.

**The app can move the Pi to a different WiFi network, over BLE — no SSH
needed.** Pod › Network (`src/app/pod/network.tsx`) scans (`SCAN_WIFI`) and
joins (`CONNECT_WIFI{ssid,password}`), which `command_handler.py` executes via
`nmcli` on a background thread. This is the **recovery path when the Pi is
unreachable over IP**: BLE is a completely separate transport, so it keeps
working when SSH/HTTP can't get through, and it's how you get the Pi onto the
same access point as your Mac before deploying. Two constraints that make this
matter more than it looks: the **Pi Zero 2 W radio is 2.4 GHz-only**, so it can
never join a 5 GHz-only AP no matter what the app sends; and being on the same
*subnet* is not enough — see the AP-isolation entry below.

**SSH**: `sshpass -p '13root' ssh alcehmy@ThePod.local`

⚠️ **`No route to host` to the Pi — two different causes, and they look
identical.** Both give instant `EHOSTUNREACH` on SSH/ping to the Pi while the
internet and the router (`192.168.1.1`) work fine. **Run the discriminator
before touching anything** — guessing wrong has now cost two sessions, one in
each direction:

```bash
netstat -rn -f inet | grep 192.168.1     # look for `!` (reject route) on the Pi's IP
dns-sd -t 4 -G v4 ThePod.local           # live mDNS, NOT the dscacheutil cache
```

- **mDNS answers but the route is `!`** → the Pi is alive and its *multicast*
  reaches you, while unicast/ARP does not. That is an **access-point boundary**
  (client isolation, or a separate AP/band bridging only multicast). Being on
  the same subnet and gateway does **not** rule this out — check the actual
  SSID and band on both ends, remembering the Pi is 2.4 GHz-only:
  `system_profiler SPAirPortDataType | grep -A6 "Current Network Information:"`.
  Fix by putting both ends on the same AP — and note you can move *the Pi* from
  the app over BLE (see Networking above) when you can't reach it over IP.
- **No mDNS answer at all, or a mDNS answer with a normal live route** → then
  suspect **macOS Local Network privacy** blocking LAN peer access for the
  calling app. Grant it under System Settings → Privacy & Security → **Local
  Network**. The app to enable is whichever one owns the terminal — for the
  VS Code integrated terminal that's **Visual Studio Code**, not Terminal.app;
  restart it afterwards. **If the app isn't listed at all, this is not your
  problem** — the OS only lists apps it has actually attributed an attempt to,
  so an absent entry means nothing was ever denied.

Also note the Claude Code **sandbox** independently returns `No route to host`
for LAN peers, which masks both causes above. Re-run with the sandbox disabled
before believing any of this diagnosis.

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

On this box the expected line is **`[ADV] Advertisement registered (legacy MGMT
fallback)`**, preceded by `[ADV] D-Bus advertisement failed`. That pair is the
healthy state, not an error — see the BlueZ ext-adv entry under "Solved".
`[ADV] Advertisement registered` (no suffix) means BlueZ's D-Bus path started
working again, which is also fine. The one line that means trouble is
`[ADV] Legacy MGMT advertising ALSO failed`: then the Pod is **invisible to the
app** even though `systemctl is-active` says `active`.

Quick end-to-end check that the radio is actually advertising:

```bash
sshpass -p '13root' ssh alcehmy@ThePod.local "sudo btmgmt info | grep 'current settings'"
```

`advertising` must appear in the list; `bondable` must **not** (that is
`Pairable=False` having taken effect).

**Deployed 2026-08-10**: `gatt_server.py` — BR/EDR `Discoverable`/`Pairable`
off, plus the legacy-MGMT advertising fallback. Verified on hardware across a
cold reboot: `Discoverable=false`, `Pairable=false`, `advertising` set, and the
fallback registering unattended at boot.

**Deployed 2026-08-05**: `command_handler.py`, `mpd_controller.py`,
`library_manager.py` (`CLEAR_QUEUE`, `ADD_TO_QUEUE`, `dateAdded`) and the
`gatt_server.py` advertising fix are on the Pi. Verified with
`grep -c 'CLEAR_QUEUE\|ADD_TO_QUEUE'` → 5 and `grep -c last-modified` → 1.

## Solved — do not re-investigate

- **App launched on Pod › settings, and closing Now Playing landed there too**
  → one root cause, and it is not in this repo's logic. `expo-router/ui`'s
  `Tabs` does **not** use `TabList` order: `triggersToScreens` re-sorts the
  routes through `sortRoutesWithInitial`, whose tiebreak is
  `a.route.length - b.route.length` (`sortRoutes.ts:56`). With tabs
  `home`/`library`/`pod` that makes **`pod` route 0** — which is both the
  navigator's initial route and, under the default `backBehavior: 'firstRoute'`,
  the target of every `goBack()`. Fixed by declaring
  `unstable_settings = { anchor: 'home' }` in `src/app/(tabs)/_layout.tsx` (it
  must be in the *route file*; `Tabs.js` reads `routeNode.initialRouteName` and
  applies it **after** spreading your `options`, so passing `initialRouteName`
  as a prop is silently ignored) and `backBehavior: 'history'` on `<Tabs>`.
  **Adding a tab whose route name is shorter than `home` re-breaks this** unless
  the anchor is kept.
- **Swiping down on Now Playing cut instantly instead of animating away** →
  Now Playing was a *tab*, so `router.back()` was a tab-index change: there is
  no transition to play, and the `slide_from_bottom` on its Stack never ran
  because that stack's index screen is never pushed. Fixed structurally — the
  tabs moved into a `(tabs)` group and `playing` became a
  `presentation: 'modal'` screen on a root `<Stack>`. The rise, the rubber-band
  and the finger-tracking dismiss are all the native sheet's. Don't try to
  re-solve this with a JS-driven translate on a tab; the gesture has to be on
  the UI thread and interruptible, which a tab swap can't be.

- **iOS showed its "ThePod would like to pair" dialog on every connect** →
  nothing in the GATT service needs an encrypted link (every characteristic is
  plain `read`/`write`/`notify`, no `encrypt-*`/`secure-*` flags), so the
  pairing was pure overhead. The source was `gatt_server._set_discoverable`
  leaving the adapter **BR/EDR `Discoverable` + `Pairable`** — a separate path
  from LE advertising, which is the only thing CoreBluetooth sees. Both are now
  `False`; LE advertising via `RegisterAdvertisement` is untouched, and an
  unbonded BLE peripheral still auto-reconnects by identifier. Don't re-enable
  them to "make pairing work" — pairing is what you're trying to avoid.
- **First connect after pairing fetched nothing until you reconnected** → the
  Pi's `_notify` silently drops every notification while `notifying` is False,
  so any command answered before iOS's `StartNotify` reaches BlueZ gets a reply
  that goes into the void. A first-ever connect has no cached GATT database and
  is still negotiating MTU, so the subscription lands late — and the only guard
  was a fixed 800ms sleep, which is a guess, not a check. `connect` now ends in
  a PING/PONG `handshake()` that re-subscribes between attempts and fails the
  connect if the Pod never answers. App-side fix, no firmware deploy needed.
  Don't "simplify" it back to a sleep.
- **App connected but library and battery stayed empty, with no error** → the
  status-notify subscription had failed and `subscribeToStatus` swallowed the
  error, so the link looked up while every request timed out. Now routed to
  `handleLinkLost()`. A dead notify is a dead connection.
- **~350px hole between the Library chips and the list** → `ChipRow` is a
  *horizontal* `ScrollView`, which still stretches on the cross axis, so inside
  a column parent it claimed all remaining height. Fixed with
  `flexGrow: 0, flexShrink: 0`. Any horizontal ScrollView added to a column
  layout needs the same.
- **Back button in Pod sub-screens read "index"** → `pod/index` has
  `headerShown: false` and therefore no title, so native-stack fell back to the
  route name. Fixed with `headerBackButtonDisplayMode: 'minimal'` (chevron
  only) in `pod/_layout.tsx`.

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
  controller has no extended advertising. **This was a real fix but it is no
  longer the reason the D-Bus path fails — see the next entry before you go
  budget-hunting again.**
- **`[ADV] Advertisement error: Failed to register advertisement` on every
  start, for any payload** → not a payload problem at all: it reproduces with a
  completely **empty** advertisement, so don't re-litigate the 31-byte budget.
  BlueZ 5.82 picks the extended-advertising MGMT path and sends
  `Add Extended Advertising Data (0x0055)` with a parameter block **8 bytes
  longer than the lengths it declares** — it writes the 11-byte
  `mgmt_cp_add_advertising` header where kernel 6.18 parses the 3-byte
  `mgmt_cp_add_ext_adv_data` one. The kernel enforces
  `data_len == 3 + adv_data_len + scan_rsp_len` and rejects with
  `Invalid Parameters (0x0d)`. Measured: plen 11 vs 3 (empty), plen 37 vs 29
  (real payload). There is no fixed BlueZ to upgrade to — 5.82 is newest in
  both Debian trixie and archive.raspberrypi.com.
  Fixed in `gatt_server.py` by falling back to the **legacy** `Add Advertising
  (0x003e)` MGMT opcode, which this controller accepts (BCM43430B0 is HCI 4.2
  and has no extended advertising, so nothing is lost). Three traps:
  * The advertising instance is **owned by the MGMT socket** that created it.
    `_mgmt_sock` is held for the process lifetime; closing or GC'ing it stops
    the advertisement. This is also why `btmgmt add-adv` is useless here — the
    instance dies with that process (and `btmgmt add-adv --help` *hangs*).
  * CPython 3.13's `AF_BLUETOOTH` binder accepts only a 1-tuple and hardcodes
    `HCI_CHANNEL_RAW`, so `socket.bind()` cannot reach `HCI_CHANNEL_CONTROL`.
    We bind through `libc` with a packed `sockaddr_hci`.
  * The kernel skips `LE Set Advertising Data` when its cached copy already
    matches, and `hdev->adv_data` survives a power cycle. So a *missing*
    `LE Set Advertising Data` in `btmon` is proof the controller already holds
    your bytes, not proof it was never set. Diagnose with
    `btmon -w` + `pkill -INT btmon` (SIGTERM truncates the buffered tail).
  The D-Bus `RegisterAdvertisement` call is still tried **first**, so a future
  fixed BlueZ is picked up automatically and the fallback simply stops firing.
- **Pod visible in the app at full signal, but every connect times out after
  ~10s with ZERO HCI events on the Pi** → the adapter was not *connectable*, so
  the kernel was advertising **`ADV_SCAN_IND`** (scannable, non-connectable)
  instead of `ADV_IND`, and using a **random** address instead of the public
  one. iOS happily discovers a scannable advertisement and reads its name — the
  device looks completely healthy in the picker, right RSSI and all — but
  `connect()` never emits a CONNECT_IND, so nothing whatsoever reaches the Pi.
  That "no evidence at all" signature is the tell; a real connection attempt
  always produces an `LE Connection Complete`, even a failing one.
  Cause: `connectable` is a **separate MGMT setting** from advertising, and
  bluetoothd only holds it on while it believes something needs it — a
  *registered* D-Bus advertisement or a discoverable adapter. Ours is
  registered behind bluetoothd's back over raw MGMT and `_set_discoverable`
  turns `Discoverable`/`Pairable` off, so bluetoothd concluded nothing needed
  connections and issued `Set Connectable(off)`. Before the pairing change,
  `Discoverable=True` had been holding it on by accident.
  Fixed by `_advertise_via_mgmt` sending `Set Connectable (0x0007)` itself,
  before adding the instance. **Don't rely on `Discoverable=True` to imply
  connectable**, and note that setting it by hand (`btmgmt connectable on`)
  looks like a fix but is wiped by the next `systemctl restart thepod`.
  Check with `btmgmt info | grep 'current settings'` — `connectable` must be
  listed — and confirm the type with
  `btmon` → `LE Set Advertising Parameters` → must read `ADV_IND (0x00)`.
- **`Pairable` read back `True` even though `_set_discoverable` set it False**
  → ordering. bluetoothd turns Pairable back on when a default agent is
  installed, so `_set_discoverable` must run **after**
  `RequestDefaultAgent`, not before. It now does. Verified by
  `busctl get-property … Adapter1 Pairable` → `b false`, and by `bondable`
  disappearing from `btmgmt info` current settings.
- **`sudo btmgmt advertising on` in `setup_eq.sh`** → deleted. It had nothing to
  do with EQ, it hangs on this box, and it enables the legacy `Set Advertising`
  toggle which is mutually exclusive with the per-instance advertising the
  firmware now depends on.
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
- No Android-looking components. **The design language is the v2 feed-led
  one** — Spline Sans, rounded surfaces, colour wash, a single `#EE3211`
  accent used once per surface. This supersedes both the PRD's original
  "dark, glass, rounded" wording *and* the later flat-Modernist pass. The
  authority is `src/constants/theme.ts` + `ThePod App v2.dc.html`.

## Roadmap (original order, check git log for what's actually done)

BLE Write → BLE Notifications → MPD integration → FLAC playback → Music
library → Album art → Battery & storage → Firmware updates → (past original
scope) WiFi management, playlists, EQ, search, history, queue editing.

Not built yet: queue reordering (the drag-handle icon in `playing/queue.tsx` is
decorative), firmware OTA updates.

**Playlist UI — the one v2 screen with no implementation.** The design has a
full playlist screen and Home shelf, and `PLAY_PLAYLIST` already works
end-to-end. What's missing is the read side: there is **no firmware command to
list stored playlists**, so the app has nothing to render. Building it means
adding a `GET_PLAYLISTS` command (MPD `listplaylists` / `listplaylistinfo`) to
`command_handler.py` + `protocol.ts` first. Don't stub it app-side with fake
playlists — that violates the no-placeholder rule at the top of this section.
