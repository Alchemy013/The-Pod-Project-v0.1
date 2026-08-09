import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeOut, runOnJS, useAnimatedStyle, useSharedValue,
  withSpring, withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/ui/icons';
import { usePlayerStore } from '@/store/player.store';
import { useArtStore, useArt } from '@/store/art.store';
import { fetchLyrics, LyricLine } from '@/services/lyrics/LyricsService';
import { Palette, Font, Radius } from '@/constants/theme';
import { AlbumArt } from '@/components/ui/AlbumArt';
import { Fab, IconCircle, LiveText, Scrubber, SpecBadge } from '@/components/ui/controls';
import { hueFor, washColor } from '@/utils/albumColor';

type LyricsState = 'idle' | 'loading' | 'found' | 'not_found' | 'error';

const LINE_H = 52;
const DIM = 'rgba(255,255,255,0.62)';

/** Worklet: the seek labels are written from the UI thread during a drag. */
function clock(seconds: number): string {
  'worklet';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Memoised: the position clock ticks once a second, and without this every tick
 * re-rendered every line of the lyric sheet. Only a change of active line — a
 * few times a minute — should cost anything.
 */
const Lyrics = memo(function Lyrics({ lines, activeIdx }: { lines: LyricLine[]; activeIdx: number }) {
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    if (activeIdx < 0) return;
    ref.current?.scrollTo({ y: Math.max(0, activeIdx * LINE_H - 140), animated: true });
  }, [activeIdx]);

  return (
    <ScrollView ref={ref} style={s.lyricsScroll} showsVerticalScrollIndicator={false}>
      <View style={{ paddingVertical: 24 }}>
        {lines.map((line, i) => (
          <Text key={i} style={[s.lyricLine, i === activeIdx && s.lyricLineActive]}>{line.text}</Text>
        ))}
      </View>
    </ScrollView>
  );
});

export default function NowPlayingScreen() {
  // This Stack runs headerShown:false, so nothing reserves the status bar area.
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const {
    song, playbackState, position, duration, volume, shuffle, repeat,
    play, pause, next, previous, seek, setVolume, toggleShuffle, cycleRepeat, refresh,
  } = usePlayerStore();

  const [displayPosition, setDisplayPosition] = useState(position);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [lyricsState, setLyricsState] = useState<LyricsState>('idle');
  const [artBox, setArtBox] = useState(0);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchArt = useArtStore((st) => st.fetch);
  const artUri = useArt(song?.path, 'large');

  const artScale = useSharedValue(1);
  const artX = useSharedValue(0);
  const artStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: artX.value }, { scale: artScale.value }],
    // Dimming as it leaves says the record is on its way out, so a swipe that
    // doesn't reach the threshold visibly springs *back* rather than just
    // stopping.
    opacity: 1 - Math.min(Math.abs(artX.value) / 320, 0.4),
  }));

  // Seek and volume are read off the UI thread by the scrubbers and their
  // labels; `scrubbing` stops the once-a-second clock from yanking the bar out
  // from under a thumb that is already on it.
  const seekFrac = useSharedValue(0);
  const volFrac = useSharedValue(volume / 100);
  const scrubbing = useRef(false);
  const volScrubbing = useRef(false);

  // Horizontal only. The vertical axis belongs to the sheet: this screen is
  // presented modally now, so a downward drag is the system's interactive
  // dismiss and this gesture must not claim it.
  const swipe = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-18, 18])
    // Half-travel: the art follows the finger but lags it, which is what makes
    // the card feel weighted rather than stuck to the touch.
    .onUpdate((e) => { artX.value = e.translationX * 0.5; })
    .onEnd((e) => {
      if (e.translationX < -70) runOnJS(next)();
      else if (e.translationX > 70) runOnJS(previous)();
    })
    .onFinalize(() => {
      artX.value = withSpring(0, { damping: 17, stiffness: 210, mass: 0.6 });
    });

  useEffect(() => { refresh(); }, []);
  useEffect(() => { setDisplayPosition(position); }, [position]);
  useEffect(() => { if (song?.path) fetchArt(song.path, 'large'); }, [song?.path]);

  // BLE only pushes on real events, so the clock ticks locally between them.
  useEffect(() => {
    if (playbackState === 'playing') {
      tickRef.current = setInterval(() => {
        setDisplayPosition((p) => {
          const n = p + 1;
          if (duration > 0 && n >= duration) setTimeout(() => refresh().catch(() => {}), 1500);
          return Math.min(n, duration);
        });
      }, 1000);
    } else if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    return () => { if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; } };
  }, [playbackState, duration]);

  // Spring, not timing: the record settling back to full size wants a little
  // overshoot, the same as lifting the needle off and dropping it back on.
  useEffect(() => {
    artScale.value = withSpring(playbackState === 'playing' ? 1 : 0.93, {
      damping: 16, stiffness: 140, mass: 0.9,
    });
  }, [playbackState]);

  // The bar glides between ticks instead of stepping once a second: BLE only
  // reports on real events, so the second-by-second motion is ours to draw.
  // A jump bigger than a tick means a seek or a track change — snap for those.
  useEffect(() => {
    if (scrubbing.current || duration <= 0) return;
    const target = Math.min(displayPosition / duration, 1);
    const delta = Math.abs(target - seekFrac.value) * duration;
    seekFrac.value = delta > 2 || playbackState !== 'playing'
      ? target
      : withTiming(target, { duration: 1000, easing: Easing.linear });
  }, [displayPosition, duration, playbackState]);

  useEffect(() => { if (!volScrubbing.current) volFrac.value = volume / 100; }, [volume]);

  useEffect(() => {
    if (!song) { setLyricsState('idle'); setLyrics([]); return; }
    setLyricsState('loading');
    setLyrics([]);
    fetchLyrics(song.title, song.artist, song.album, song.duration).then((result) => {
      if (result.status === 'found') { setLyrics(result.lines); setLyricsState('found'); }
      else if (result.status === 'not_found') setLyricsState('not_found');
      else setLyricsState('error');
    });
  }, [song?.path]);

  let activeLyricIdx = -1;
  for (let i = 0; i < lyrics.length; i++) if (lyrics[i].time <= displayPosition) activeLyricIdx = i;

  const isPlaying = playbackState === 'playing';
  const seed = song?.albumId || song?.album || song?.title || 'thepod';
  const hue = hueFor(seed);
  const khz = song?.sampleRate ? song.sampleRate / 1000 : 0;
  const spec = song?.bitDepth && khz ? `${song.bitDepth}/${Number.isInteger(khz) ? khz : khz.toFixed(1)}` : null;
  const hiRes = !!song && (song.bitDepth > 16 || song.sampleRate > 48000);

  return (
    <LinearGradient
      colors={[washColor(hue), '#121012', Palette.bg]}
      locations={[0, 0.52, 1]}
      style={s.container}
    >
      {/* Presented as a sheet, so `insets.top` is 0 here and the padding is
          the gap under the sheet's own rounded top edge. */}
      <View style={[s.nav, { paddingTop: insets.top + 14 }]}>
        <IconCircle name="chevron-down" label="Close" onPress={() => router.back()} background="rgba(0,0,0,0.28)" iconSize={20} />
        <View style={s.navLabel}>
          <Text style={s.navOverline}>Playing from album</Text>
          <Text style={s.navAlbum} numberOfLines={1}>{song?.album ?? 'ThePod'}</Text>
        </View>
        <IconCircle name="queue" label="Queue" onPress={() => router.push('/playing/queue')} background="rgba(0,0,0,0.28)" />
      </View>

      <GestureDetector gesture={swipe}>
        <View
          style={s.artArea}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setArtBox(Math.floor(Math.min(width, height)));
          }}
        >
          {/* Art and lyrics occupy the same box, so swapping them is a
              cross-fade rather than a hard cut. 200ms out / 240ms in keeps the
              two from being fully absent at the same moment. */}
          {showLyrics ? (
            <Animated.View
              key="lyrics"
              style={s.fill}
              entering={FadeIn.duration(240)}
              exiting={FadeOut.duration(200)}
            >
              {lyricsState === 'found' ? (
                <Lyrics lines={lyrics} activeIdx={activeLyricIdx} />
              ) : (
                <View style={s.lyricsBox}>
                  <Text style={s.lyricsMeta}>
                    {lyricsState === 'loading' ? 'Searching for lyrics…'
                      : lyricsState === 'not_found' ? 'No lyrics found for this track'
                      : 'Couldn’t load lyrics'}
                  </Text>
                  {lyricsState === 'error' && (
                    <Text style={[s.lyricsMeta, { fontSize: 12, marginTop: 6 }]}>
                      Lyrics come from the internet — the Pod’s Wi-Fi has none, so turn cellular data on.
                    </Text>
                  )}
                </View>
              )}
            </Animated.View>
          ) : (
            artBox > 0 && (
              <Animated.View
                key="art"
                style={artStyle}
                entering={FadeIn.duration(240)}
                exiting={FadeOut.duration(200)}
              >
                <AlbumArt uri={artUri} seedKey={seed} size={artBox} radius={Radius.md} elevated />
              </Animated.View>
            )
          )}
        </View>
      </GestureDetector>

      <View style={s.meta}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title} numberOfLines={1}>{song?.title ?? 'Nothing playing'}</Text>
          <Text style={s.artist} numberOfLines={1}>{song?.artist ?? '—'}</Text>
        </View>
        {lyricsState !== 'idle' && (
          <Pressable
            onPress={() => setShowLyrics((v) => !v)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={showLyrics ? 'Hide lyrics' : 'Show lyrics'}
          >
            <Icon name="quote" size={21} color={showLyrics ? Palette.accent : DIM} />
          </Pressable>
        )}
      </View>

      <View style={s.body}>
        <Scrubber
          fraction={seekFrac}
          onScrubStart={(dragging) => { scrubbing.current = dragging; }}
          onCommit={(f) => {
            if (duration <= 0) return;
            const p = Math.round(f * duration);
            setDisplayPosition(p);
            seek(p);
          }}
        />
        <View style={s.seekLabels}>
          <LiveText value={seekFrac} format={(f) => { 'worklet'; return clock(f * duration); }} style={s.seekTime} />
          <LiveText
            value={seekFrac}
            format={(f) => { 'worklet'; return `−${clock(Math.max(0, duration - f * duration))}`; }}
            style={[s.seekTime, { textAlign: 'right' }]}
          />
        </View>

        <View style={s.transport}>
          <Pressable style={s.tb} onPress={toggleShuffle} accessibilityRole="button" accessibilityLabel="Shuffle">
            <Icon name="shuffle" size={20} color={shuffle ? Palette.accent : DIM} />
          </Pressable>
          <Pressable style={s.tb} onPress={previous} accessibilityRole="button" accessibilityLabel="Previous track">
            <Icon name="previous" size={24} color={Palette.text} />
          </Pressable>
          <Fab size={68} playing={isPlaying} onPress={isPlaying ? pause : play} />
          <Pressable style={s.tb} onPress={next} accessibilityRole="button" accessibilityLabel="Next track">
            <Icon name="next" size={24} color={Palette.text} />
          </Pressable>
          <Pressable style={s.tb} onPress={cycleRepeat} accessibilityRole="button" accessibilityLabel={`Repeat: ${repeat}`}>
            <Icon name={repeat === 'one' ? 'repeat-one' : 'repeat'} size={20} color={repeat !== 'off' ? Palette.accent : DIM} />
          </Pressable>
        </View>

        <View style={s.volumeRow}>
          <Icon name="speaker" size={13} color="rgba(255,255,255,0.5)" />
          <Scrubber
            fraction={volFrac}
            knob={false}
            style={{ flex: 1 }}
            liveMs={120}
            onScrubStart={(dragging) => { volScrubbing.current = dragging; }}
            onCommit={(f) => setVolume(Math.round(f * 100))}
          />
          <LiveText
            value={volFrac}
            format={(f) => { 'worklet'; return String(Math.round(f * 100)); }}
            style={s.volValue}
          />
        </View>

        <View style={s.specs}>
          {!!song?.format && <SpecBadge label={song.format.toUpperCase()} />}
          {!!spec && <SpecBadge label={spec} accent={hiRes} />}
          <SpecBadge label="PCM5122" />
          <SpecBadge label="Bit-perfect" />
        </View>
      </View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },

  nav: { flexDirection: 'row', alignItems: 'center', paddingBottom: 14 },
  navLabel: { flex: 1, alignItems: 'center', gap: 2 },
  navOverline: {
    fontFamily: Font.bold, fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.6)',
  },
  navAlbum: { fontFamily: Font.bold, fontSize: 12.5, color: Palette.text },

  artArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  fill: { flex: 1, alignSelf: 'stretch' },

  lyricsScroll: { flex: 1, alignSelf: 'stretch' },
  lyricsBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  lyricsMeta: { color: DIM, fontFamily: Font.regular, fontSize: 14, textAlign: 'center' },
  lyricLine: { color: DIM, fontFamily: Font.medium, fontSize: 18, textAlign: 'center', lineHeight: LINE_H },
  lyricLineActive: { color: Palette.text, fontFamily: Font.heading, fontSize: 20 },

  meta: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingTop: 18, paddingBottom: 14 },
  title: { fontFamily: Font.heading, fontSize: 25, color: Palette.text },
  artist: { fontFamily: Font.regular, fontSize: 15, color: DIM, marginTop: 4 },

  body: { paddingBottom: 22 },

  seekLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  seekTime: { fontFamily: Font.mono, fontSize: 11.5, color: DIM, width: 70 },

  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  tb: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },

  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingBottom: 14 },
  volValue: { fontFamily: Font.mono, fontSize: 11, color: 'rgba(255,255,255,0.5)', width: 24, textAlign: 'right' },

  specs: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
});
