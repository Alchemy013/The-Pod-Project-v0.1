import { useEffect, useRef, useState } from 'react';
import {
  FlatList, Image, Modal, PanResponder, Pressable,
  ScrollView, StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withTiming, Easing,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { usePlayerStore } from '@/store/player.store';
import { useBluetoothStore } from '@/store/bluetooth.store';
import { podService } from '@/services/bluetooth/BluetoothService';
import { fetchLyrics, LyricLine } from '@/services/lyrics/LyricsService';

type LyricsState = 'idle' | 'loading' | 'found' | 'not_found' | 'error';

const BG = '#121212';
const SURFACE = '#181818';
const SURFACE_HIGH = '#282828';
const TEXT = '#FFFFFF';
const TEXT_SEC = '#B3B3B3';
const TEXT_MUTE = '#535353';
const ACCENT = '#A855F7';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatSampleRate(sr: number): string {
  const k = sr / 1000;
  return k % 1 === 0 ? `${k} kHz` : `${k.toFixed(1)} kHz`;
}

function SeekBar({ position, duration, onSeek }: {
  position: number; duration: number; onSeek: (s: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [dragPos, setDragPos] = useState<number | null>(null);
  const trackWidth = useRef(0);
  const displayPos = dragPos ?? position;
  const progress = duration > 0 ? Math.min(displayPos / duration, 1) : 0;
  const clamp = (x: number) => Math.min(Math.max((x / trackWidth.current) * duration, 0), duration);

  return (
    <View style={s.seekContainer}>
      <View
        style={s.seekHit}
        onLayout={(e) => { trackWidth.current = e.nativeEvent.layout.width; }}
        onStartShouldSetResponder={() => duration > 0}
        onMoveShouldSetResponder={() => duration > 0}
        onResponderGrant={(e) => { setDragging(true); setDragPos(clamp(e.nativeEvent.locationX)); }}
        onResponderMove={(e) => setDragPos(clamp(e.nativeEvent.locationX))}
        onResponderRelease={(e) => {
          const p = clamp(e.nativeEvent.locationX);
          setDragging(false);
          setDragPos(null);
          onSeek(p);
        }}
      >
        <View style={s.seekTrack}>
          <View style={[s.seekFill, { width: `${progress * 100}%` }]} />
          <View style={[s.seekThumb, { left: `${progress * 100}%` as any, opacity: dragging ? 1 : 0 }]} />
        </View>
      </View>
      <View style={s.seekLabels}>
        <Text style={s.seekTime}>{formatTime(displayPos)}</Text>
        <Text style={s.seekTime}>−{formatTime(Math.max(0, duration - displayPos))}</Text>
      </View>
    </View>
  );
}

export default function NowPlayingScreen() {
  const { width } = useWindowDimensions();
  const artSize = width - 64;

  const router = useRouter();
  const {
    song, playbackState, position, duration, volume,
    shuffle, repeat, queue, queueIndex,
    play, pause, next, previous, playSong,
    seek, setVolume, toggleShuffle, cycleRepeat, refresh, loadQueue,
  } = usePlayerStore();

  const [displayPosition, setDisplayPosition] = useState(position);
  const [showQueue, setShowQueue] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [lyricsState, setLyricsState] = useState<LyricsState>('idle');

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lyricsRef = useRef<ScrollView>(null);
  const LINE_H = 52;

  const { connectionState } = useBluetoothStore();
  const isConnected = connectionState === 'connected';

  const [localVolume, setLocalVolume] = useState(volume);
  const volumeTrackWidth = useRef(0);
  const volumeDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [artUri, setArtUri] = useState<string | null>(null);
  const artCache = useRef<Map<string, string>>(new Map());
  const artInFlight = useRef<string | null>(null);

  const artScale = useSharedValue(0.93);
  const artStyle = useAnimatedStyle(() => ({
    transform: [{ scale: artScale.value }],
  }));

  const swipe = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gs) =>
      (Math.abs(gs.dx) > 25 && Math.abs(gs.dy) < Math.abs(gs.dx) * 1.5) ||
      (gs.dy > 30 && Math.abs(gs.dx) < 50),
    onPanResponderRelease: (_, gs) => {
      if (Math.abs(gs.dx) > 70 && Math.abs(gs.dy) < 80) {
        if (gs.dx < 0) next(); else previous();
      } else if (gs.dy > 90 && Math.abs(gs.dx) < 60) {
        router.back();
      }
    },
  });

  useEffect(() => { setDisplayPosition(position); }, [position]);

  useEffect(() => {
    if (playbackState === 'playing') {
      tickRef.current = setInterval(() => {
        setDisplayPosition((p) => {
          const n = p + 1;
          if (duration > 0 && n >= duration) {
            setTimeout(() => refresh().catch(() => {}), 1500);
          }
          return Math.min(n, duration);
        });
      }, 1000);
    } else {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    }
    return () => { if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; } };
  }, [playbackState, duration]);

  useEffect(() => {
    artScale.value = withTiming(playbackState === 'playing' ? 1 : 0.93, {
      duration: 300, easing: Easing.out(Easing.cubic),
    });
  }, [playbackState]);

  useEffect(() => {
    if (isConnected) refresh();
  }, [isConnected]);

  useEffect(() => { setLocalVolume(volume); }, [volume]);

  useEffect(() => {
    const path = song?.path;
    if (!path || !isConnected) { setArtUri(null); return; }
    const cached = artCache.current.get(path);
    if (cached) { setArtUri(cached); return; }
    if (artInFlight.current === path) return;
    artInFlight.current = path;
    setArtUri(null);
    podService.request({ cmd: 'GET_ALBUM_ART', path }, 20000)
      .then((res) => {
        if (res.type === 'ALBUM_ART' && res.data) {
          const uri = `data:image/jpeg;base64,${res.data}`;
          artCache.current.set(path, uri);
          setArtUri(uri);
        }
      })
      .catch(() => {})
      .finally(() => { artInFlight.current = null; });
  }, [song?.path, isConnected]);

  useEffect(() => {
    if (!song) { setLyricsState('idle'); setLyrics([]); return; }
    setLyricsState('loading');
    setLyrics([]);
    fetchLyrics(song.title, song.artist, song.album, song.duration)
      .then(result => {
        if (result.status === 'found') { setLyrics(result.lines); setLyricsState('found'); }
        else if (result.status === 'not_found') setLyricsState('not_found');
        else setLyricsState('error');
      });
  }, [song?.path]);

  useEffect(() => {
    if (!showLyrics || lyrics.length === 0) return;
    let idx = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= displayPosition) idx = i;
    }
    if (idx >= 0) {
      lyricsRef.current?.scrollTo({ y: Math.max(0, idx * LINE_H - 140), animated: true });
    }
  }, [displayPosition, showLyrics, lyrics]);

  const handleVolumeChange = (x: number) => {
    const v = Math.round(Math.min(Math.max((x / volumeTrackWidth.current) * 100, 0), 100));
    setLocalVolume(v);
    clearTimeout(volumeDebounce.current);
    volumeDebounce.current = setTimeout(() => setVolume(v), 120);
  };

  const isPlaying = playbackState === 'playing';
  let activeLyricIdx = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].time <= displayPosition) activeLyricIdx = i;
  }

  if (!isConnected) {
    return (
      <View style={s.center}>
        <Text style={s.emptyIcon}>◎</Text>
        <Text style={s.emptyTitle}>Not Connected</Text>
        <Text style={s.emptySub}>Connect to your Pod in the Pod tab</Text>
      </View>
    );
  }

  const qualityParts: string[] = [];
  if (song?.format) qualityParts.push(song.format.toUpperCase());
  if (song?.bitDepth && song.bitDepth > 0) qualityParts.push(`${song.bitDepth}-BIT`);
  if (song?.sampleRate && song.sampleRate > 0) qualityParts.push(formatSampleRate(song.sampleRate));

  return (
    <View style={s.container}>
      {/* Top bar — actions only, minimal */}
      <View style={s.topBar}>
        <View style={s.topBarLeft} />
        <View style={s.topBarRight}>
          {lyricsState !== 'idle' && (
            <Pressable
              onPress={() => setShowLyrics(v => !v)}
              hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
              style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
            >
              <SymbolView
                name="quote.bubble"
                style={s.actionIcon}
                type="monochrome"
                tintColor={showLyrics ? ACCENT : lyricsState === 'found' ? TEXT_SEC : TEXT_MUTE}
              />
            </Pressable>
          )}
          <Pressable
            onPress={() => { loadQueue(); setShowQueue(true); }}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
          >
            <SymbolView name="list.bullet" style={s.actionIcon} type="monochrome" tintColor={TEXT_SEC} />
          </Pressable>
        </View>
      </View>

      {/* Artwork — Spotify full-width */}
      <Animated.View style={[{ width: artSize, height: artSize, alignSelf: 'center', marginBottom: 28, borderRadius: 8, overflow: 'hidden' }, artStyle]} {...swipe.panHandlers}>
        {showLyrics ? (
          lyricsState === 'loading' ? (
            <View style={[s.lyricsBox, { width: artSize, height: artSize }]}>
              <Text style={s.lyricsMeta}>Searching for lyrics…</Text>
            </View>
          ) : lyricsState === 'not_found' ? (
            <View style={[s.lyricsBox, { width: artSize, height: artSize }]}>
              <Text style={s.lyricsMeta}>No lyrics found for this track</Text>
            </View>
          ) : lyricsState === 'error' ? (
            <View style={[s.lyricsBox, { width: artSize, height: artSize }]}>
              <Text style={s.lyricsMeta}>Couldn't load lyrics</Text>
              <Text style={[s.lyricsMeta, { fontSize: 12, marginTop: 6 }]}>
                Make sure cellular data is on — ThePod WiFi has no internet
              </Text>
            </View>
          ) : (
            <ScrollView ref={lyricsRef} style={{ flex: 1, backgroundColor: SURFACE }} showsVerticalScrollIndicator={false}>
              <View style={{ paddingVertical: 32, paddingHorizontal: 16 }}>
                {lyrics.map((line, i) => (
                  <Text key={i} style={[s.lyricLine, i === activeLyricIdx && s.lyricLineActive]}>
                    {line.text}
                  </Text>
                ))}
              </View>
            </ScrollView>
          )
        ) : (
          artUri
            ? <Image source={{ uri: artUri }} style={{ width: artSize, height: artSize }} resizeMode="cover" />
            : <View style={[{ width: artSize, height: artSize }, s.artPlaceholder]} />
        )}
      </Animated.View>

      {/* Song info row — title + artist left, heart right */}
      <View style={s.infoRow}>
        <View style={s.infoText}>
          <Text style={s.songTitle} numberOfLines={1}>{song?.title ?? 'Nothing Playing'}</Text>
          <Text style={s.songArtist} numberOfLines={1}>{song?.artist ?? '—'}</Text>
        </View>
        {qualityParts.length > 0 && (
          <View style={s.qualityBadge}>
            <Text style={s.qualityText}>{qualityParts[0]}</Text>
          </View>
        )}
      </View>

      {/* Seek bar */}
      <SeekBar
        position={displayPosition}
        duration={duration}
        onSeek={(p) => { setDisplayPosition(p); seek(p); }}
      />

      {/* Transport — Spotify layout: shuffle | ⏮ | ▶circle | ⏭ | repeat */}
      <View style={s.transport}>
        <Pressable
          onPress={toggleShuffle}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
        >
          <SymbolView name="shuffle" style={s.transportIcon} type="monochrome"
            tintColor={shuffle ? ACCENT : TEXT_SEC} />
          {shuffle && <View style={s.activeDot} />}
        </Pressable>

        <Pressable
          onPress={previous}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
        >
          <SymbolView name="backward.fill" style={s.transportIcon} type="monochrome" tintColor={TEXT} />
        </Pressable>

        {/* Spotify-style circular play button */}
        <Pressable
          onPress={isPlaying ? pause : play}
          style={({ pressed }) => [s.playCircle, pressed && { transform: [{ scale: 0.94 }] }]}
        >
          <SymbolView
            name={isPlaying ? 'pause.fill' : 'play.fill'}
            style={s.playIcon}
            type="monochrome"
            tintColor="#FFFFFF"
          />
        </Pressable>

        <Pressable
          onPress={next}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
        >
          <SymbolView name="forward.fill" style={s.transportIcon} type="monochrome" tintColor={TEXT} />
        </Pressable>

        <Pressable
          onPress={cycleRepeat}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
        >
          <SymbolView
            name={repeat === 'one' ? 'repeat.1' : 'repeat'}
            style={s.transportIcon}
            type="monochrome"
            tintColor={repeat !== 'off' ? ACCENT : TEXT_SEC}
          />
          {repeat !== 'off' && <View style={s.activeDot} />}
        </Pressable>
      </View>

      {/* Volume */}
      <View style={s.volumeRow}>
        <SymbolView name="speaker.fill" style={s.volIcon} type="monochrome" tintColor={TEXT_MUTE} />
        <View
          style={s.volHit}
          onLayout={(e) => { volumeTrackWidth.current = e.nativeEvent.layout.width; }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => handleVolumeChange(e.nativeEvent.locationX)}
          onResponderMove={(e) => handleVolumeChange(e.nativeEvent.locationX)}
          onResponderRelease={(e) => handleVolumeChange(e.nativeEvent.locationX)}
        >
          <View style={s.volTrack}>
            <View style={[s.volFill, { width: `${localVolume}%` }]} />
          </View>
        </View>
        <SymbolView name="speaker.wave.3.fill" style={s.volIcon} type="monochrome" tintColor={TEXT_MUTE} />
      </View>

      {/* Skip ±15 row */}
      <View style={s.skipRow}>
        <Pressable
          onPress={() => seek(Math.max(0, displayPosition - 15))}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
        >
          <SymbolView name="gobackward.15" style={s.skipIcon} type="monochrome" tintColor={TEXT_MUTE} />
        </Pressable>
        <Pressable
          onPress={() => seek(Math.min(duration, displayPosition + 15))}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
        >
          <SymbolView name="goforward.15" style={s.skipIcon} type="monochrome" tintColor={TEXT_MUTE} />
        </Pressable>
      </View>

      {/* Queue modal */}
      <Modal visible={showQueue} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowQueue(false)}>
        <View style={q.sheet}>
          <View style={q.handle} />
          <View style={q.titleRow}>
            <Text style={q.sheetTitle}>Queue</Text>
            <Pressable
              onPress={() => setShowQueue(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
            >
              <SymbolView name="xmark.circle.fill" style={{ width: 24, height: 24 }} type="monochrome" tintColor={TEXT_MUTE} />
            </Pressable>
          </View>
          {queue.length === 0 ? (
            <View style={q.empty}><Text style={q.emptyText}>Queue is empty</Text></View>
          ) : (
            <FlatList
              data={queue}
              keyExtractor={(item, i) => item.id || String(i)}
              getItemLayout={(_, i) => ({ length: 64, offset: 64 * i, index: i })}
              initialScrollIndex={Math.max(0, queueIndex - 2)}
              renderItem={({ item, index }) => {
                const active = index === queueIndex;
                return (
                  <Pressable
                    style={({ pressed }) => [q.row, active && q.rowActive, pressed && { opacity: 0.6 }]}
                    onPress={() => { playSong(item.path); setShowQueue(false); }}
                  >
                    <View style={q.indexCol}>
                      {active
                        ? <SymbolView name="speaker.wave.2.fill" style={{ width: 14, height: 14 }} type="monochrome" tintColor={ACCENT} />
                        : <Text style={q.indexText}>{index + 1}</Text>}
                    </View>
                    <View style={q.songInfo}>
                      <Text style={[q.songTitle, active && q.songTitleActive]} numberOfLines={1}>{item.title}</Text>
                      <Text style={q.songArtist} numberOfLines={1}>{item.artist}</Text>
                    </View>
                    <Text style={q.dur}>{formatTime(item.duration)}</Text>
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: BG,
    paddingTop: 52, paddingHorizontal: 32,
  },
  center: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', gap: 10 },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  topBarLeft: { flex: 1 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  actionIcon: { width: 22, height: 22 },

  artPlaceholder: { backgroundColor: SURFACE_HIGH },

  lyricsBox: { backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center', padding: 24 },
  lyricsMeta: { color: TEXT_MUTE, fontSize: 14, textAlign: 'center' },
  lyricLine: { color: TEXT_MUTE, fontSize: 18, fontWeight: '500', textAlign: 'center', lineHeight: 52 },
  lyricLineActive: { color: TEXT, fontSize: 20, fontWeight: '700' },

  // Info row
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  infoText: { flex: 1 },
  songTitle: { color: TEXT, fontSize: 22, fontWeight: '700', marginBottom: 4, letterSpacing: -0.3 },
  songArtist: { color: TEXT_SEC, fontSize: 15, fontWeight: '400' },
  qualityBadge: {
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: SURFACE_HIGH, borderRadius: 4,
  },
  qualityText: { color: TEXT_MUTE, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  // Seek
  seekContainer: { marginBottom: 24 },
  seekHit: { height: 20, justifyContent: 'center', marginBottom: 6 },
  seekTrack: { height: 4, backgroundColor: '#535353', borderRadius: 2, overflow: 'visible' },
  seekFill: { height: 4, backgroundColor: ACCENT, borderRadius: 2, position: 'absolute', left: 0, top: 0 },
  seekThumb: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: TEXT,
    position: 'absolute', top: -5, marginLeft: -7,
  },
  seekLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  seekTime: { color: TEXT_MUTE, fontSize: 11, fontVariant: ['tabular-nums'] },

  // Transport
  transport: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 28,
  },
  transportIcon: { width: 26, height: 26 },
  playCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: ACCENT,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: ACCENT, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 20,
  },
  playIcon: { width: 30, height: 30 },
  activeDot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: ACCENT, alignSelf: 'center', marginTop: 4,
  },

  // Skip buttons
  skipRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginBottom: 24, paddingHorizontal: 8,
  },
  skipIcon: { width: 20, height: 20 },

  // Volume
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  volHit: { flex: 1, height: 28, justifyContent: 'center' },
  volTrack: { height: 4, backgroundColor: '#535353', borderRadius: 2 },
  volFill: { height: 4, backgroundColor: TEXT, borderRadius: 2 },
  volIcon: { width: 16, height: 16 },

  emptyIcon: { fontSize: 40, color: TEXT_MUTE },
  emptyTitle: { color: TEXT, fontSize: 18, fontWeight: '700' },
  emptySub: { color: TEXT_SEC, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
});

const q = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: '#121212', paddingTop: 12 },
  handle: { width: 36, height: 4, backgroundColor: SURFACE_HIGH, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 8 },
  sheetTitle: { color: TEXT, fontSize: 18, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: TEXT_MUTE, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', height: 64, paddingHorizontal: 20, gap: 14 },
  rowActive: { backgroundColor: SURFACE },
  indexCol: { width: 24, alignItems: 'center' },
  indexText: { color: TEXT_MUTE, fontSize: 13, fontVariant: ['tabular-nums'] },
  songInfo: { flex: 1 },
  songTitle: { color: TEXT_SEC, fontSize: 15, fontWeight: '400' },
  songTitleActive: { color: TEXT, fontWeight: '600' },
  songArtist: { color: TEXT_MUTE, fontSize: 12, marginTop: 2 },
  dur: { color: TEXT_MUTE, fontSize: 12, fontVariant: ['tabular-nums'] },
});
