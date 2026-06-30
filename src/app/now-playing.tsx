import { useEffect, useRef, useState } from 'react';
import {
  FlatList, Image, Modal, PanResponder, Pressable,
  ScrollView, StyleSheet, Text, View,
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

const BG = '#0A0A0A';
const TEXT = '#FFFFFF';
const TEXT_SEC = '#8E8E93';
const ACCENT = '#FFFFFF';
const SURFACE = '#1C1C1E';

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
  const [dragPos, setDragPos] = useState<number | null>(null);
  const trackWidth = useRef(0);
  const displayPos = dragPos ?? position;
  const progress = duration > 0 ? Math.min(displayPos / duration, 1) : 0;
  const clamp = (x: number) => Math.min(Math.max((x / trackWidth.current) * duration, 0), duration);
  return (
    <View style={styles.seekContainer}>
      <View
        style={styles.seekTrack}
        onLayout={(e) => { trackWidth.current = e.nativeEvent.layout.width; }}
        onStartShouldSetResponder={() => duration > 0}
        onMoveShouldSetResponder={() => duration > 0}
        onResponderGrant={(e) => setDragPos(clamp(e.nativeEvent.locationX))}
        onResponderMove={(e) => setDragPos(clamp(e.nativeEvent.locationX))}
        onResponderRelease={(e) => { const p = clamp(e.nativeEvent.locationX); setDragPos(null); onSeek(p); }}
      >
        <View style={[styles.seekFill, { width: `${progress * 100}%` }]} />
        <View style={[styles.seekThumb, { left: `${progress * 100}%` as any }]} />
      </View>
      <View style={styles.seekLabels}>
        <Text style={styles.seekTime}>{formatTime(displayPos)}</Text>
        <Text style={styles.seekTime}>−{formatTime(Math.max(0, duration - displayPos))}</Text>
      </View>
    </View>
  );
}

function Btn({ onPress, large = false, children }: {
  onPress: () => void; large?: boolean; children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
      style={({ pressed }) => [styles.btn, large && styles.btnLg, pressed && { opacity: 0.4 }]}
    >
      {children}
    </Pressable>
  );
}

export default function NowPlayingScreen() {
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
  const LINE_H = 48;

  const { connectionState } = useBluetoothStore();
  const isConnected = connectionState === 'connected';

  const [localVolume, setLocalVolume] = useState(volume);
  const volumeTrackWidth = useRef(0);
  const volumeDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [artUri, setArtUri] = useState<string | null>(null);
  const artCache = useRef<Map<string, string>>(new Map());
  const artInFlight = useRef<string | null>(null);

  const artScale = useSharedValue(0.92);
  const artStyle = useAnimatedStyle(() => ({
    transform: [{ scale: artScale.value }],
  }));

  // Swipe left/right → skip, swipe down → back
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
    artScale.value = withTiming(playbackState === 'playing' ? 1 : 0.92, {
      duration: 400, easing: Easing.out(Easing.cubic),
    });
  }, [playbackState]);

  useEffect(() => {
    if (isConnected) refresh();
  }, [isConnected]);

  useEffect(() => { setLocalVolume(volume); }, [volume]);

  // Fetch album art
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

  // Fetch lyrics on song change
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

  // Auto-scroll lyrics to current line
  useEffect(() => {
    if (!showLyrics || lyrics.length === 0) return;
    let idx = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= displayPosition) idx = i;
    }
    if (idx >= 0) {
      lyricsRef.current?.scrollTo({ y: Math.max(0, idx * LINE_H - 120), animated: true });
    }
  }, [displayPosition, showLyrics, lyrics]);

  const handleVolumeChange = (x: number) => {
    const v = Math.round(Math.min(Math.max((x / volumeTrackWidth.current) * 100, 0), 100));
    setLocalVolume(v);
    clearTimeout(volumeDebounce.current);
    volumeDebounce.current = setTimeout(() => setVolume(v), 120);
  };

  const isPlaying = playbackState === 'playing';
  // Active lyric index
  let activeLyricIdx = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].time <= displayPosition) activeLyricIdx = i;
  }

  if (!isConnected) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyIcon}>◎</Text>
        <Text style={styles.emptyTitle}>Not Connected</Text>
        <Text style={styles.emptySub}>Connect to your Pod in the Pod tab</Text>
      </View>
    );
  }

  const qualityParts: string[] = [];
  if (song?.format) qualityParts.push(song.format.toUpperCase());
  if (song?.bitDepth && song.bitDepth > 0) qualityParts.push(`${song.bitDepth}-BIT`);
  if (song?.sampleRate && song.sampleRate > 0) qualityParts.push(formatSampleRate(song.sampleRate));

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.screenLabel}>Now Playing</Text>
        <View style={styles.headerActions}>
          {lyricsState !== 'idle' && (
            <Pressable
              onPress={() => setShowLyrics(v => !v)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={({ pressed }) => [{ opacity: pressed ? 0.4 : 1 }]}
            >
              <SymbolView
                name="quote.bubble"
                style={styles.symSm}
                type="monochrome"
                tintColor={showLyrics ? ACCENT : lyricsState === 'found' ? '#8E8E93' : '#3A3A3C'}
              />
            </Pressable>
          )}
          <Pressable
            onPress={() => { loadQueue(); setShowQueue(true); }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={({ pressed }) => [{ opacity: pressed ? 0.4 : 1 }]}
          >
            <SymbolView name="list.bullet" style={styles.symSm} type="monochrome" tintColor="#8E8E93" />
          </Pressable>
        </View>
      </View>

      {/* Artwork / Lyrics */}
      <Animated.View style={[styles.artworkWrap, artStyle]} {...swipe.panHandlers}>
        {showLyrics ? (
          lyricsState === 'loading' ? (
            <View style={styles.lyricsCenter}>
              <Text style={styles.lyricsMeta}>Searching for lyrics…</Text>
            </View>
          ) : lyricsState === 'not_found' ? (
            <View style={styles.lyricsCenter}>
              <Text style={styles.lyricsMeta}>No lyrics found for this track</Text>
            </View>
          ) : lyricsState === 'error' ? (
            <View style={styles.lyricsCenter}>
              <Text style={styles.lyricsMeta}>Couldn't load lyrics</Text>
              <Text style={[styles.lyricsMeta, { fontSize: 12, marginTop: 6 }]}>
                Make sure cellular data is on — ThePod WiFi has no internet
              </Text>
            </View>
          ) : (
            <ScrollView ref={lyricsRef} style={styles.lyricsScroll} showsVerticalScrollIndicator={false}>
              <View style={{ paddingVertical: 24 }}>
                {lyrics.map((line, i) => (
                  <Text key={i} style={[styles.lyricLine, i === activeLyricIdx && styles.lyricLineActive]}>
                    {line.text}
                  </Text>
                ))}
              </View>
            </ScrollView>
          )
        ) : (
          <>
            {artUri ? (
              <Image source={{ uri: artUri }} style={styles.artwork} resizeMode="cover" />
            ) : (
              <View style={[styles.artwork, styles.artworkPlaceholder]} />
            )}
          </>
        )}
      </Animated.View>

      {/* Song Info + Quality Badge */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{song?.title ?? 'Nothing Playing'}</Text>
        <Text style={styles.artist} numberOfLines={1}>{song?.artist ?? '—'}</Text>
        <Text style={styles.album} numberOfLines={1}>{song?.album ?? '—'}</Text>
        {qualityParts.length > 0 && (
          <View style={styles.qualityBadge}>
            <Text style={styles.qualityText}>{qualityParts.join(' · ')}</Text>
          </View>
        )}
      </View>

      {/* Seek */}
      <SeekBar position={displayPosition} duration={duration} onSeek={(s) => { setDisplayPosition(s); seek(s); }} />

      {/* Transport: shuffle | prev | −15 | play | +15 | next | repeat */}
      <View style={styles.transport}>
        <Btn onPress={toggleShuffle}>
          <SymbolView name="shuffle" style={styles.symSm} type="monochrome" tintColor={shuffle ? ACCENT : '#48484A'} />
        </Btn>
        <Btn onPress={previous}>
          <SymbolView name="backward.fill" style={styles.symSm} type="monochrome" tintColor={ACCENT} />
        </Btn>
        <Btn onPress={() => seek(Math.max(0, displayPosition - 15))}>
          <SymbolView name="gobackward.15" style={styles.symSm} type="monochrome" tintColor={ACCENT} />
        </Btn>
        <Btn large onPress={isPlaying ? pause : play}>
          <SymbolView name={isPlaying ? 'pause.fill' : 'play.fill'} style={styles.symLg} type="monochrome" tintColor={ACCENT} />
        </Btn>
        <Btn onPress={() => seek(Math.min(duration, displayPosition + 15))}>
          <SymbolView name="goforward.15" style={styles.symSm} type="monochrome" tintColor={ACCENT} />
        </Btn>
        <Btn onPress={next}>
          <SymbolView name="forward.fill" style={styles.symSm} type="monochrome" tintColor={ACCENT} />
        </Btn>
        <Btn onPress={cycleRepeat}>
          <SymbolView name={repeat === 'one' ? 'repeat.1' : 'repeat'} style={styles.symSm} type="monochrome" tintColor={repeat !== 'off' ? ACCENT : '#48484A'} />
        </Btn>
      </View>

      {/* Volume */}
      <View style={styles.volumeRow}>
        <SymbolView name="speaker.fill" style={styles.symVol} type="monochrome" tintColor="#48484A" />
        <View
          style={styles.volHit}
          onLayout={(e) => { volumeTrackWidth.current = e.nativeEvent.layout.width; }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => handleVolumeChange(e.nativeEvent.locationX)}
          onResponderMove={(e) => handleVolumeChange(e.nativeEvent.locationX)}
          onResponderRelease={(e) => handleVolumeChange(e.nativeEvent.locationX)}
        >
          <View style={styles.volTrack}>
            <View style={[styles.volFill, { width: `${localVolume}%` }]} />
          </View>
        </View>
        <SymbolView name="speaker.wave.3.fill" style={styles.symVol} type="monochrome" tintColor="#48484A" />
      </View>

      {/* Queue Modal */}
      <Modal visible={showQueue} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowQueue(false)}>
        <View style={qStyles.sheet}>
          <View style={qStyles.handle} />
          <View style={qStyles.titleRow}>
            <Text style={qStyles.sheetTitle}>Queue</Text>
            <Pressable onPress={() => setShowQueue(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
              <SymbolView name="xmark.circle.fill" style={{ width: 24, height: 24 }} type="monochrome" tintColor="#48484A" />
            </Pressable>
          </View>
          {queue.length === 0 ? (
            <View style={qStyles.empty}><Text style={qStyles.emptyText}>Queue is empty</Text></View>
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
                    style={({ pressed }) => [qStyles.row, active && qStyles.rowActive, pressed && { opacity: 0.6 }]}
                    onPress={() => { playSong(item.path); setShowQueue(false); }}
                  >
                    <View style={qStyles.indexCol}>
                      {active
                        ? <SymbolView name="speaker.wave.2.fill" style={{ width: 14, height: 14 }} type="monochrome" tintColor="#FFFFFF" />
                        : <Text style={qStyles.indexText}>{index + 1}</Text>}
                    </View>
                    <View style={qStyles.songInfo}>
                      <Text style={[qStyles.songTitle, active && qStyles.songTitleActive]} numberOfLines={1}>{item.title}</Text>
                      <Text style={qStyles.songArtist} numberOfLines={1}>{item.artist}</Text>
                    </View>
                    <Text style={qStyles.dur}>{formatTime(item.duration)}</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG, paddingTop: 60, paddingHorizontal: 28, alignItems: 'center' },
  center: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', gap: 8 },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 20 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  screenLabel: { color: TEXT_SEC, fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },

  artworkWrap: { width: 300, height: 300, marginBottom: 28, borderRadius: 16, overflow: 'hidden' },
  artwork: { width: 300, height: 300, borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 24 }, shadowOpacity: 0.7, shadowRadius: 40, elevation: 24 },
  artworkPlaceholder: { backgroundColor: '#2C2C2E' },

  lyricsScroll: { flex: 1, width: '100%' },
  lyricsCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  lyricsMeta: { color: '#48484A', fontSize: 14, textAlign: 'center' },
  lyricLine: { color: '#48484A', fontSize: 17, fontWeight: '500', textAlign: 'center', lineHeight: 48, paddingHorizontal: 8 },
  lyricLineActive: { color: ACCENT, fontSize: 18, fontWeight: '700' },

  info: { width: '100%', alignItems: 'center', marginBottom: 20, gap: 3 },
  title: { color: TEXT, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  artist: { color: TEXT_SEC, fontSize: 16, textAlign: 'center' },
  album: { color: '#636366', fontSize: 13, textAlign: 'center' },
  qualityBadge: { marginTop: 6, flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 4, backgroundColor: SURFACE, borderRadius: 6 },
  qualityText: { color: '#636366', fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },

  seekContainer: { width: '100%', marginBottom: 24 },
  seekTrack: { height: 28, justifyContent: 'center', marginBottom: 6, position: 'relative' },
  seekFill: { height: 3, backgroundColor: ACCENT, borderRadius: 1.5, position: 'absolute', left: 0, top: '50%', transform: [{ translateY: -1.5 }] },
  seekThumb: { width: 12, height: 12, borderRadius: 6, backgroundColor: ACCENT, position: 'absolute', top: '50%', marginLeft: -6, transform: [{ translateY: -6 }] },
  seekLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  seekTime: { color: TEXT_SEC, fontSize: 12 },

  transport: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 32 },
  btn: { padding: 6, borderRadius: 10 },
  btnLg: { padding: 10 },

  symSm: { width: 24, height: 24 },
  symLg: { width: 36, height: 36 },
  symVol: { width: 16, height: 16 },

  volumeRow: { flexDirection: 'row', alignItems: 'center', width: '100%', gap: 12 },
  volHit: { flex: 1, height: 32, justifyContent: 'center' },
  volTrack: { height: 4, backgroundColor: '#2C2C2E', borderRadius: 2 },
  volFill: { height: 4, backgroundColor: ACCENT, borderRadius: 2 },

  emptyIcon: { fontSize: 40, color: TEXT_SEC },
  emptyTitle: { color: TEXT, fontSize: 17, fontWeight: '600' },
  emptySub: { color: TEXT_SEC, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
});

const qStyles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: '#111111', paddingTop: 12 },
  handle: { width: 36, height: 4, backgroundColor: '#3A3A3C', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 8 },
  sheetTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#636366', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', height: 64, paddingHorizontal: 20, gap: 14 },
  rowActive: { backgroundColor: '#1C1C1E' },
  indexCol: { width: 24, alignItems: 'center' },
  indexText: { color: '#48484A', fontSize: 13, fontVariant: ['tabular-nums'] },
  songInfo: { flex: 1 },
  songTitle: { color: '#8E8E93', fontSize: 15, fontWeight: '500' },
  songTitleActive: { color: '#FFFFFF' },
  songArtist: { color: '#48484A', fontSize: 13, marginTop: 2 },
  dur: { color: '#48484A', fontSize: 13, fontVariant: ['tabular-nums'] },
});
