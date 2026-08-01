import { useEffect, useRef, useState } from 'react';
import {
  FlatList, Pressable,
  ScrollView, StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withTiming, Easing, runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassView } from 'expo-glass-effect';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { usePlayerStore } from '@/store/player.store';
import { useBluetoothStore } from '@/store/bluetooth.store';
import { podService } from '@/services/bluetooth/BluetoothService';
import { fetchLyrics, LyricLine } from '@/services/lyrics/LyricsService';
import { Palette, Radius } from '@/constants/theme';
import { EmptyState } from '@/components/ui/EmptyState';
import { Sheet } from '@/components/ui/Sheet';

type LyricsState = 'idle' | 'loading' | 'found' | 'not_found' | 'error';

const BG = Palette.bg;
const SURFACE = Palette.surface;
const SURFACE_HIGH = Palette.surfaceHigh;
const TEXT = Palette.text;
const TEXT_SEC = Palette.textSecondary;
const TEXT_MUTE = Palette.textMuted;
const GREEN = Palette.accent;

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

  const artOpacity = useSharedValue(0);
  const artFadeStyle = useAnimatedStyle(() => ({ opacity: artOpacity.value }));

  const swipe = Gesture.Pan().onEnd((e) => {
    if (Math.abs(e.translationX) > 70 && Math.abs(e.translationY) < 80) {
      if (e.translationX < 0) runOnJS(next)(); else runOnJS(previous)();
    } else if (e.translationY > 90 && Math.abs(e.translationX) < 60) {
      runOnJS(router.back)();
    }
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
    if (!isConnected) return;
    refresh();
  }, [isConnected]);

  useEffect(() => { setLocalVolume(volume); }, [volume]);

  useEffect(() => {
    artOpacity.value = withTiming(artUri ? 1 : 0, { duration: 250, easing: Easing.out(Easing.cubic) });
  }, [artUri]);

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
    return <EmptyState icon="◎" title="Not Connected" subtitle="Connect to your Pod in the Pod tab" />;
  }

  const qualityParts: string[] = [];
  if (song?.format) qualityParts.push(song.format.toUpperCase());
  if (song?.bitDepth && song.bitDepth > 0) qualityParts.push(`${song.bitDepth}-BIT`);
  if (song?.sampleRate && song.sampleRate > 0) qualityParts.push(formatSampleRate(song.sampleRate));

  return (
    <View style={s.container}>
      <LinearGradient
        colors={[SURFACE_HIGH, BG]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Top bar — actions only, minimal */}
      <View style={s.topBar}>
        <View style={s.topBarLeft} />
        <GlassView style={s.topBarRight} glassEffectStyle="clear">
          {lyricsState !== 'idle' && (
            <Pressable
              onPress={() => setShowLyrics(v => !v)}
              hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
              style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={showLyrics ? 'Hide lyrics' : 'Show lyrics'}
            >
              <SymbolView
                name="quote.bubble"
                style={s.actionIcon}
                type="monochrome"
                tintColor={showLyrics ? TEXT : lyricsState === 'found' ? TEXT_SEC : TEXT_MUTE}
              />
            </Pressable>
          )}
          <Pressable
            onPress={() => { loadQueue(); setShowQueue(true); }}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Show queue"
          >
            <SymbolView name="list.bullet" style={s.actionIcon} type="monochrome" tintColor={TEXT_SEC} />
          </Pressable>
        </GlassView>
      </View>

      {/* Artwork — Spotify full-width */}
      <GestureDetector gesture={swipe}>
      <Animated.View style={[{ width: artSize, height: artSize, alignSelf: 'center', marginBottom: 28, borderRadius: Radius.md, overflow: 'hidden' }, artStyle]}>
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
          <>
            <View style={[StyleSheet.absoluteFill, s.artPlaceholder]}>
              <Text style={s.artPlaceholderIcon}>♫</Text>
            </View>
            {artUri && (
              <Animated.Image
                source={{ uri: artUri }}
                style={[StyleSheet.absoluteFill, artFadeStyle]}
                resizeMode="cover"
              />
            )}
          </>
        )}
      </Animated.View>
      </GestureDetector>

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

      {/* Skip ±15 row — directly under the timeline */}
      <View style={s.skipRow}>
        <Pressable
          onPress={() => seek(Math.max(0, displayPosition - 15))}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Skip back 15 seconds"
        >
          <SymbolView name="gobackward.15" style={s.skipIcon} type="monochrome" tintColor={TEXT_MUTE} />
        </Pressable>
        <Pressable
          onPress={() => seek(Math.min(duration, displayPosition + 15))}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Skip forward 15 seconds"
        >
          <SymbolView name="goforward.15" style={s.skipIcon} type="monochrome" tintColor={TEXT_MUTE} />
        </Pressable>
      </View>

      {/* Transport — shuffle | ⏮ | ▶circle | ⏭ | repeat */}
      <View style={s.transport}>
        <Pressable
          onPress={toggleShuffle}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Shuffle"
          accessibilityState={{ selected: shuffle }}
        >
          <SymbolView name="shuffle" style={s.transportIcon} type="monochrome"
            tintColor={shuffle ? GREEN : TEXT_SEC} />
          {shuffle && <View style={s.activeDot} />}
        </Pressable>

        <Pressable
          onPress={previous}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Previous track"
        >
          <SymbolView name="backward.fill" style={s.transportIcon} type="monochrome" tintColor={TEXT} />
        </Pressable>

        <Pressable
          onPress={isPlaying ? pause : play}
          style={({ pressed }) => [s.playCircle, pressed && { transform: [{ scale: 0.94 }] }]}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        >
          <SymbolView
            name={isPlaying ? 'pause.fill' : 'play.fill'}
            style={s.playIcon}
            type="monochrome"
            tintColor={BG}
          />
        </Pressable>

        <Pressable
          onPress={next}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Next track"
        >
          <SymbolView name="forward.fill" style={s.transportIcon} type="monochrome" tintColor={TEXT} />
        </Pressable>

        <Pressable
          onPress={cycleRepeat}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`Repeat: ${repeat}`}
          accessibilityState={{ selected: repeat !== 'off' }}
        >
          <SymbolView
            name={repeat === 'one' ? 'repeat.1' : 'repeat'}
            style={s.transportIcon}
            type="monochrome"
            tintColor={repeat !== 'off' ? GREEN : TEXT_SEC}
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

      {/* Queue sheet */}
      <Sheet visible={showQueue} onClose={() => setShowQueue(false)} title="Queue">
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
                        ? <SymbolView name="speaker.wave.2.fill" style={{ width: 14, height: 14 }} type="monochrome" tintColor={GREEN} />
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
      </Sheet>
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
  topBarRight: {
    flexDirection: 'row', alignItems: 'center', gap: 20,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.pill,
  },
  actionIcon: { width: 22, height: 22 },

  artPlaceholder: { backgroundColor: SURFACE_HIGH, alignItems: 'center', justifyContent: 'center' },
  artPlaceholderIcon: { color: TEXT_MUTE, fontSize: 52 },

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
  seekFill: { height: 4, backgroundColor: TEXT, borderRadius: 2, position: 'absolute', left: 0, top: 0 },
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
    backgroundColor: TEXT,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10,
  },
  playIcon: { width: 30, height: 30 },
  activeDot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: GREEN, alignSelf: 'center', marginTop: 4,
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
});

const q = StyleSheet.create({
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
