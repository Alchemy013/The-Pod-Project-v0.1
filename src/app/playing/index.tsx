import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withTiming, Easing, runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Icon } from '@/components/ui/icons';
import { usePlayerStore } from '@/store/player.store';
import { podService } from '@/services/bluetooth/BluetoothService';
import { fetchLyrics, LyricLine } from '@/services/lyrics/LyricsService';
import { Palette, Font } from '@/constants/theme';
import { AlbumArt } from '@/components/ui/AlbumArt';

type LyricsState = 'idle' | 'loading' | 'found' | 'not_found' | 'error';
type NowPlayingStyle = 'grid' | 'poster' | 'console';
const STYLE_CYCLE: NowPlayingStyle[] = ['grid', 'poster', 'console'];
const STYLE_KEY = 'thepod_now_playing_style';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function SeekBar({ position, duration, onSeek, trackColor, fillColor }: {
  position: number; duration: number; onSeek: (s: number) => void;
  trackColor?: string; fillColor?: string;
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
        <View style={[s.seekTrack, trackColor ? { backgroundColor: trackColor } : undefined]}>
          <View style={[s.seekFill, { width: `${progress * 100}%` }, fillColor ? { backgroundColor: fillColor } : undefined]} />
          <View style={[s.seekTick, { left: `${progress * 100}%` as any, opacity: dragging ? 1 : 0.9 }, fillColor ? { backgroundColor: fillColor } : undefined]} />
        </View>
      </View>
      <View style={s.seekLabels}>
        <Text style={[s.seekTime, trackColor ? { color: trackColor } : undefined]}>{formatTime(displayPos)}</Text>
        <Text style={[s.seekTime, trackColor ? { color: trackColor } : undefined]}>−{formatTime(Math.max(0, duration - displayPos))}</Text>
      </View>
    </View>
  );
}

export default function NowPlayingScreen() {
  const { width } = useWindowDimensions();
  // This Stack runs headerShown:false, so nothing reserves the status bar area
  // — without this the top bar renders underneath the clock and battery.
  const insets = useSafeAreaInsets();

  const router = useRouter();
  const {
    song, playbackState, position, duration, volume,
    shuffle, repeat,
    play, pause, next, previous,
    seek, setVolume, toggleShuffle, cycleRepeat, refresh,
  } = usePlayerStore();

  const [displayPosition, setDisplayPosition] = useState(position);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [lyricsState, setLyricsState] = useState<LyricsState>('idle');
  const [nowPlayingStyle, setNowPlayingStyle] = useState<NowPlayingStyle>('grid');

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lyricsRef = useRef<ScrollView>(null);
  const LINE_H = 52;

  const [localVolume, setLocalVolume] = useState(volume);
  const volumeTrackWidth = useRef(0);
  const volumeDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [artUri, setArtUri] = useState<string | null>(null);
  // Measured height of the art area in the grid layout (see onLayout below).
  const [artBox, setArtBox] = useState(0);
  const artCache = useRef<Map<string, string>>(new Map());
  const artInFlight = useRef<string | null>(null);

  const artScale = useSharedValue(0.97);
  const artStyle = useAnimatedStyle(() => ({ transform: [{ scale: artScale.value }] }));

  const swipe = Gesture.Pan().onEnd((e) => {
    if (Math.abs(e.translationX) > 70 && Math.abs(e.translationY) < 80) {
      if (e.translationX < 0) runOnJS(next)(); else runOnJS(previous)();
    } else if (e.translationY > 90 && Math.abs(e.translationX) < 60) {
      runOnJS(router.back)();
    }
  });

  useEffect(() => {
    AsyncStorage.getItem(STYLE_KEY).then((v) => {
      if (v === 'poster' || v === 'console' || v === 'grid') setNowPlayingStyle(v);
    });
  }, []);

  const cycleStyle = () => {
    const next = STYLE_CYCLE[(STYLE_CYCLE.indexOf(nowPlayingStyle) + 1) % STYLE_CYCLE.length];
    setNowPlayingStyle(next);
    AsyncStorage.setItem(STYLE_KEY, next).catch(() => {});
  };

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
    } else if (tickRef.current) {
      clearInterval(tickRef.current); tickRef.current = null;
    }
    return () => { if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; } };
  }, [playbackState, duration]);

  useEffect(() => {
    artScale.value = withTiming(playbackState === 'playing' ? 1 : 0.97, {
      duration: 300, easing: Easing.out(Easing.cubic),
    });
  }, [playbackState]);

  useEffect(() => { refresh(); }, []);

  useEffect(() => { setLocalVolume(volume); }, [volume]);

  useEffect(() => {
    const path = song?.path;
    if (!path) { setArtUri(null); return; }
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
  }, [song?.path]);

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
    for (let i = 0; i < lyrics.length; i++) if (lyrics[i].time <= displayPosition) idx = i;
    if (idx >= 0) lyricsRef.current?.scrollTo({ y: Math.max(0, idx * LINE_H - 140), animated: true });
  }, [displayPosition, showLyrics, lyrics]);

  const handleVolumeChange = (x: number) => {
    const v = Math.round(Math.min(Math.max((x / volumeTrackWidth.current) * 100, 0), 100));
    setLocalVolume(v);
    clearTimeout(volumeDebounce.current);
    volumeDebounce.current = setTimeout(() => setVolume(v), 120);
  };

  const isPlaying = playbackState === 'playing';
  let activeLyricIdx = -1;
  for (let i = 0; i < lyrics.length; i++) if (lyrics[i].time <= displayPosition) activeLyricIdx = i;

  const bitDepthRate = song?.bitDepth && song?.sampleRate
    ? `${song.bitDepth} / ${song.sampleRate / 1000} kHz`
    : '—';
  const seedKey = song?.album || song?.title || 'thepod';
  const titleFallback = song?.title ?? 'Nothing Playing';

  const styleToggle = (color: string) => (
    <Pressable onPress={cycleStyle} hitSlop={12}>
      <Icon name="layout" size={20} color={color} />
    </Pressable>
  );

  if (nowPlayingStyle === 'poster') {
    return (
      <View style={[s.container, { backgroundColor: Palette.accent }]}>
        <View style={[s.topBar, { paddingTop: insets.top + 10 }]}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Icon name="chevron-down" size={22} color={Palette.accentText} />
          </Pressable>
          <Text style={[s.topLabel, { color: Palette.accentText, opacity: 0.8 }]} numberOfLines={1}>
            {song?.format ? `${song.format.toUpperCase()}${bitDepthRate !== '—' ? ` ${bitDepthRate}` : ''}` : 'ThePod'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            {styleToggle(Palette.accentText)}
            <Pressable onPress={() => router.push('/playing/queue')} hitSlop={12}>
              <Icon name="queue" size={20} color={Palette.accentText} />
            </Pressable>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <View style={s.posterHead}>
            <Text style={s.posterTrackLabel}>Track {song ? String(song.trackNumber).padStart(2, '0') : '—'}</Text>
            <Text style={s.posterTitle}>{titleFallback}</Text>
            <View style={s.posterArtistRow}>
              <Text style={s.posterArtist}>{song?.artist ?? '—'}</Text>
              <Text style={s.posterAlbum}>{song ? `${song.album} · ${song.year || ''}` : ''}</Text>
            </View>
          </View>

          <View style={s.posterArtRow}>
            <AlbumArt uri={artUri} seedKey={seedKey} title={song?.title || '?'} size={128} letterScale={0.48} />
            <View style={{ flex: 1 }}>
              <SeekBar
                position={displayPosition} duration={duration}
                onSeek={(p) => { setDisplayPosition(p); seek(p); }}
                trackColor="rgba(255,255,255,0.5)" fillColor={Palette.accentText}
              />
            </View>
          </View>
        </ScrollView>

        <View style={s.posterTransport}>
          <Pressable style={s.posterCell} onPress={toggleShuffle}>
            <Icon name="shuffle" size={19} color={shuffle ? Palette.accentText : 'rgba(255,255,255,0.55)'} />
          </Pressable>
          <Pressable style={s.posterCell} onPress={previous}>
            <Icon name="previous" size={22} color={Palette.accentText} />
          </Pressable>
          <Pressable style={[s.posterCell, s.posterPlayCell]} onPress={isPlaying ? pause : play}>
            <Icon name={isPlaying ? 'pause' : 'play'} size={26} color={Palette.accent} />
          </Pressable>
          <Pressable style={s.posterCell} onPress={next}>
            <Icon name="next" size={22} color={Palette.accentText} />
          </Pressable>
          <Pressable style={s.posterCell} onPress={cycleRepeat}>
            <Icon name={repeat === 'one' ? 'repeat-one' : 'repeat'} size={19} color={repeat !== 'off' ? Palette.accentText : 'rgba(255,255,255,0.55)'} />
          </Pressable>
        </View>
      </View>
    );
  }

  if (nowPlayingStyle === 'console') {
    return (
      <View style={s.container}>
        <View style={[s.topBar, { paddingTop: insets.top + 10 }]}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Icon name="chevron-down" size={22} color={Palette.text} />
          </Pressable>
          <Text style={s.topLabel} numberOfLines={1}>Output — PCM5122</Text>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            {styleToggle(Palette.text)}
            <Pressable onPress={() => router.push('/playing/queue')} hitSlop={12}>
              <Icon name="queue" size={20} color={Palette.text} />
            </Pressable>
          </View>
        </View>

        <View style={s.consoleHead}>
          <AlbumArt uri={artUri} seedKey={seedKey} title={song?.title || '?'} size={132} letterScale={0.48} />
          <View style={{ flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
            <Text style={s.consoleTitle} numberOfLines={2}>{titleFallback}</Text>
            <Text style={s.consoleArtist} numberOfLines={1}>{song?.artist ?? '—'}</Text>
            <Text style={s.consoleAlbum} numberOfLines={1}>{song ? `${song.album} · ${song.year || ''}` : ''}</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 20 }}>
          <SeekBar position={displayPosition} duration={duration} onSeek={(p) => { setDisplayPosition(p); seek(p); }} />
        </View>

        <View style={s.transportGrid}>
          <Pressable style={s.transportCell} onPress={toggleShuffle}>
            <Icon name="shuffle" size={19} color={shuffle ? Palette.accent : Palette.textSecondary} />
          </Pressable>
          <Pressable style={[s.transportCell, s.transportBorderL]} onPress={previous}>
            <Icon name="previous" size={20} color={Palette.text} />
          </Pressable>
          <Pressable style={[s.transportCell, s.transportBorderL]} onPress={isPlaying ? pause : play}>
            <Icon name={isPlaying ? 'pause' : 'play'} size={22} color={Palette.text} />
          </Pressable>
          <Pressable style={[s.transportCell, s.transportBorderL]} onPress={next}>
            <Icon name="next" size={20} color={Palette.text} />
          </Pressable>
          <Pressable style={[s.transportCell, s.transportBorderL]} onPress={cycleRepeat}>
            <Icon name={repeat === 'one' ? 'repeat-one' : 'repeat'} size={19} color={repeat !== 'off' ? Palette.accent : Palette.textSecondary} />
          </Pressable>
        </View>

        <View style={s.infoGrid}>
          <View style={[s.infoCell, { borderLeftWidth: 0 }]}>
            <Text style={s.infoLabel}>Format</Text>
            <Text style={s.infoValue}>{song?.format?.toUpperCase() || '—'}</Text>
          </View>
          <View style={[s.infoCell, s.transportBorderL]}>
            <Text style={s.infoLabel}>Depth / rate</Text>
            <Text style={s.infoValue}>{bitDepthRate}</Text>
          </View>
          <View style={[s.infoCell, s.transportBorderL]}>
            <Text style={s.infoLabel}>Bitrate</Text>
            <Text style={s.infoValue}>{song?.bitrate ? `${song.bitrate.toLocaleString()} kbps` : '—'}</Text>
          </View>
        </View>

        <View style={s.volumeRow}>
          <Icon name="speaker" size={14} color={Palette.textMuted} />
          <View
            style={s.volHit}
            onLayout={(e) => { volumeTrackWidth.current = e.nativeEvent.layout.width; }}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={(e) => handleVolumeChange(e.nativeEvent.locationX)}
            onResponderMove={(e) => handleVolumeChange(e.nativeEvent.locationX)}
            onResponderRelease={(e) => handleVolumeChange(e.nativeEvent.locationX)}
          >
            <View style={s.volTrack}><View style={[s.volFill, { width: `${localVolume}%` }]} /></View>
          </View>
          <Text style={s.volValue}>{localVolume}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={[s.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Icon name="chevron-down" size={22} color={Palette.text} />
        </Pressable>
        <Text style={s.topLabel} numberOfLines={1}>Playing from {song?.album || 'ThePod'}</Text>
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
          {lyricsState !== 'idle' && (
            <Pressable onPress={() => setShowLyrics(v => !v)} hitSlop={12}>
              <Icon name="quote" size={20} color={showLyrics ? Palette.accent : Palette.textSecondary} />
            </Pressable>
          )}
          {styleToggle(Palette.text)}
          <Pressable onPress={() => router.push('/playing/queue')} hitSlop={12}>
            <Icon name="queue" size={20} color={Palette.text} />
          </Pressable>
        </View>
      </View>

      <GestureDetector gesture={swipe}>
        {/* flex:1 instead of a hardcoded square: the rows below (info, seek,
            transport, volume, format) are fixed-height, and a full-width square
            art does not fit alongside them once the status bar and tab bar are
            accounted for — the format row was pushed off screen. The art takes
            whatever height is left and stays square within it. */}
        <Animated.View
          style={[{ flex: 1, width, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, artStyle]}
          onLayout={(e) => setArtBox(Math.min(width, e.nativeEvent.layout.height))}
        >
          {showLyrics ? (
            lyricsState === 'loading' ? (
              <View style={s.lyricsBox}><Text style={s.lyricsMeta}>Searching for lyrics…</Text></View>
            ) : lyricsState === 'not_found' ? (
              <View style={s.lyricsBox}><Text style={s.lyricsMeta}>No lyrics found for this track</Text></View>
            ) : lyricsState === 'error' ? (
              <View style={s.lyricsBox}>
                <Text style={s.lyricsMeta}>Couldn't load lyrics</Text>
                <Text style={[s.lyricsMeta, { fontSize: 12, marginTop: 6 }]}>
                  Make sure cellular data is on — ThePod WiFi has no internet
                </Text>
              </View>
            ) : (
              <ScrollView ref={lyricsRef} style={{ flex: 1, backgroundColor: Palette.bg }} showsVerticalScrollIndicator={false}>
                <View style={{ paddingVertical: 32, paddingHorizontal: 16 }}>
                  {lyrics.map((line, i) => (
                    <Text key={i} style={[s.lyricLine, i === activeLyricIdx && s.lyricLineActive]}>{line.text}</Text>
                  ))}
                </View>
              </ScrollView>
            )
          ) : (
            <AlbumArt uri={artUri} seedKey={seedKey} title={song?.title || '?'} size={artBox || width} letterScale={0.64} />
          )}
        </Animated.View>
      </GestureDetector>

      <View style={s.infoBlock}>
        <Text style={s.songTitle} numberOfLines={2}>{titleFallback}</Text>
        <Text style={s.songArtist} numberOfLines={1}>{song ? `${song.artist} — ${song.album}` : '—'}</Text>
        <SeekBar position={displayPosition} duration={duration} onSeek={(p) => { setDisplayPosition(p); seek(p); }} />
      </View>

      <View style={s.transportGrid}>
        <Pressable style={s.transportCell} onPress={toggleShuffle} accessibilityRole="button" accessibilityLabel="Shuffle">
          <Icon name="shuffle" size={20} color={shuffle ? Palette.accent : Palette.textSecondary} />
        </Pressable>
        <Pressable style={[s.transportCell, s.transportBorderL]} onPress={previous} accessibilityRole="button" accessibilityLabel="Previous track">
          <Icon name="previous" size={22} color={Palette.text} />
        </Pressable>
        <Pressable style={[s.transportCell, s.playCell]} onPress={isPlaying ? pause : play} accessibilityRole="button" accessibilityLabel={isPlaying ? 'Pause' : 'Play'}>
          <Icon name={isPlaying ? 'pause' : 'play'} size={26} color={Palette.accentText} />
        </Pressable>
        <Pressable style={[s.transportCell, s.transportBorderL]} onPress={next} accessibilityRole="button" accessibilityLabel="Next track">
          <Icon name="next" size={22} color={Palette.text} />
        </Pressable>
        <Pressable style={[s.transportCell, s.transportBorderL]} onPress={cycleRepeat} accessibilityRole="button" accessibilityLabel={`Repeat: ${repeat}`}>
          <Icon name={repeat === 'one' ? 'repeat-one' : 'repeat'} size={20} color={repeat !== 'off' ? Palette.accent : Palette.textSecondary} />
        </Pressable>
      </View>

      <View style={s.volumeRow}>
        <Icon name="speaker" size={14} color={Palette.textMuted} />
        <View
          style={s.volHit}
          onLayout={(e) => { volumeTrackWidth.current = e.nativeEvent.layout.width; }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => handleVolumeChange(e.nativeEvent.locationX)}
          onResponderMove={(e) => handleVolumeChange(e.nativeEvent.locationX)}
          onResponderRelease={(e) => handleVolumeChange(e.nativeEvent.locationX)}
        >
          <View style={s.volTrack}><View style={[s.volFill, { width: `${localVolume}%` }]} /></View>
        </View>
        <Text style={s.volValue}>{localVolume}</Text>
      </View>

      <View style={s.infoGrid}>
        <View style={[s.infoCell, { borderLeftWidth: 0 }]}>
          <Text style={s.infoLabel}>Format</Text>
          <Text style={s.infoValue}>{song?.format?.toUpperCase() || '—'}</Text>
        </View>
        <View style={[s.infoCell, s.transportBorderL]}>
          <Text style={s.infoLabel}>Depth / rate</Text>
          <Text style={s.infoValue}>{bitDepthRate}</Text>
        </View>
        <View style={[s.infoCell, s.transportBorderL]}>
          <Text style={s.infoLabel}>Bitrate</Text>
          <Text style={s.infoValue}>{song?.bitrate ? `${song.bitrate.toLocaleString()} kbps` : '—'}</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14,
  },
  topLabel: {
    flex: 1, textAlign: 'center', fontFamily: Font.bold, fontSize: 10,
    letterSpacing: 1.3, textTransform: 'uppercase', color: Palette.textSecondary,
  },

  lyricsBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: Palette.bg },
  lyricsMeta: { color: Palette.textMuted, fontFamily: Font.regular, fontSize: 14, textAlign: 'center' },
  lyricLine: { color: Palette.textMuted, fontFamily: Font.medium, fontSize: 18, textAlign: 'center', lineHeight: 52 },
  lyricLineActive: { color: Palette.text, fontFamily: Font.bold, fontSize: 20 },

  infoBlock: { paddingHorizontal: 20, paddingTop: 22 },
  songTitle: { color: Palette.text, fontFamily: Font.heading, fontSize: 26, letterSpacing: -0.4, lineHeight: 30 },
  songArtist: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 14, marginTop: 6, marginBottom: 14 },

  seekContainer: {},
  seekHit: { height: 20, justifyContent: 'center' },
  seekTrack: { height: 2, backgroundColor: Palette.divider, overflow: 'visible' },
  seekFill: { height: 2, backgroundColor: Palette.accent, position: 'absolute', left: 0, top: 0 },
  seekTick: { width: 3, height: 12, backgroundColor: Palette.accent, position: 'absolute', top: -5, marginLeft: -1.5 },
  seekLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  seekTime: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 11, fontVariant: ['tabular-nums'] },

  transportGrid: {
    flexDirection: 'row', marginTop: 12,
    borderTopWidth: 2, borderBottomWidth: 2, borderColor: Palette.divider,
  },
  transportCell: { flex: 1, height: 68, alignItems: 'center', justifyContent: 'center' },
  transportBorderL: { borderLeftWidth: 1, borderLeftColor: Palette.divider },
  playCell: { backgroundColor: Palette.accent },

  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  volHit: { flex: 1, height: 24, justifyContent: 'center' },
  volTrack: { height: 2, backgroundColor: Palette.divider },
  volFill: { height: 2, backgroundColor: Palette.text },
  volValue: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 11, width: 24, textAlign: 'right', fontVariant: ['tabular-nums'] },

  infoGrid: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Palette.divider },
  infoCell: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, borderLeftWidth: 1, borderLeftColor: Palette.divider },
  infoLabel: { color: Palette.textSecondary, fontFamily: Font.bold, fontSize: 9, letterSpacing: 1.0, textTransform: 'uppercase' },
  infoValue: { color: Palette.text, fontFamily: Font.bold, fontSize: 13, marginTop: 3, fontVariant: ['tabular-nums'] },

  // Poster
  posterHead: { paddingHorizontal: 20, paddingTop: 30 },
  posterTrackLabel: { color: 'rgba(255,255,255,0.75)', fontFamily: Font.heading, fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 14 },
  posterTitle: { color: Palette.accentText, fontFamily: Font.heading, fontSize: 48, lineHeight: 46, letterSpacing: -1.5 },
  posterArtistRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    borderTopWidth: 2, borderTopColor: Palette.accentText, marginTop: 24, paddingTop: 12,
  },
  posterArtist: { color: Palette.accentText, fontFamily: Font.bold, fontSize: 16 },
  posterAlbum: { color: 'rgba(255,255,255,0.8)', fontFamily: Font.regular, fontSize: 12 },
  posterArtRow: { paddingHorizontal: 20, marginTop: 30, gap: 20 },
  posterTransport: { flexDirection: 'row', borderTopWidth: 2, borderTopColor: Palette.accentText, marginBottom: 30 },
  posterCell: { flex: 1, height: 62, alignItems: 'center', justifyContent: 'center' },
  posterPlayCell: { backgroundColor: Palette.accentText },

  // Console
  consoleHead: { flexDirection: 'row', gap: 16, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: Palette.divider },
  consoleTitle: { color: Palette.text, fontFamily: Font.heading, fontSize: 20, letterSpacing: -0.3, lineHeight: 24 },
  consoleArtist: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 13, marginTop: 4 },
  consoleAlbum: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 12 },
});
