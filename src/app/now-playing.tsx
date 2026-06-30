import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import { usePlayerStore } from '@/store/player.store';
import { useBluetoothStore } from '@/store/bluetooth.store';
import { podService } from '@/services/bluetooth/BluetoothService';

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    Math.round((l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))) * 255)
      .toString(16).padStart(2, '0');
  return `#${f(0)}${f(8)}${f(4)}`;
}

function albumColors(name: string | undefined): { bg: string; letter: string } {
  if (!name) return { bg: '#1A1A1A', letter: '#3A3A3A' };
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return { bg: hslToHex(hue, 30, 15), letter: hslToHex(hue, 55, 50) };
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function SeekBar({ position, duration, onSeek }: {
  position: number;
  duration: number;
  onSeek: (s: number) => void;
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
        onResponderRelease={(e) => {
          const pos = clamp(e.nativeEvent.locationX);
          setDragPos(null);
          onSeek(pos);
        }}
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

function TransportButton({ onPress, children, large = false }: {
  onPress: () => void;
  children: React.ReactNode;
  large?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={({ pressed }) => [
        styles.transportBtn,
        large && styles.transportBtnLarge,
        pressed && styles.transportBtnPressed,
      ]}
    >
      {children}
    </Pressable>
  );
}

export default function NowPlayingScreen() {
  const {
    song, playbackState, position, duration, volume,
    shuffle, repeat, play, pause, next, previous,
    seek, setVolume, toggleShuffle, cycleRepeat, refresh,
  } = usePlayerStore();

  const [displayPosition, setDisplayPosition] = useState(position);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setDisplayPosition(position); }, [position]);

  useEffect(() => {
    if (playbackState === 'playing') {
      tickRef.current = setInterval(() => {
        setDisplayPosition((p) => Math.min(p + 1, duration));
      }, 1000);
    } else {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    }
    return () => { if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; } };
  }, [playbackState, duration]);

  const handleSeek = (s: number) => { setDisplayPosition(s); seek(s); };

  const { connectionState } = useBluetoothStore();
  const isConnected = connectionState === 'connected';

  const [localVolume, setLocalVolume] = useState(volume);
  const volumeTrackWidth = useRef(0);
  const volumeDebounce = useRef<ReturnType<typeof setTimeout>>();

  const [artUri, setArtUri] = useState<string | null>(null);
  const artCache = useRef<Map<string, string>>(new Map());
  const artInFlight = useRef<string | null>(null);

  const artworkScale = useSharedValue(0.92);
  const artworkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: artworkScale.value }],
  }));

  useEffect(() => {
    artworkScale.value = withTiming(playbackState === 'playing' ? 1 : 0.92, {
      duration: 400,
      easing: Easing.out(Easing.cubic),
    });
  }, [playbackState]);

  useEffect(() => {
    if (isConnected) refresh();
  }, [isConnected]);

  useEffect(() => {
    setLocalVolume(volume);
  }, [volume]);

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
      .catch(() => { /* no art — placeholder stays */ })
      .finally(() => { artInFlight.current = null; });
  }, [song?.path, isConnected]);

  const handleVolumeChange = (x: number) => {
    const newVol = Math.round(Math.min(Math.max((x / volumeTrackWidth.current) * 100, 0), 100));
    setLocalVolume(newVol);
    clearTimeout(volumeDebounce.current);
    volumeDebounce.current = setTimeout(() => setVolume(newVol), 120);
  };

  const colors = albumColors(song?.album);
  const repeatActive = repeat !== 'off';
  const isPlaying = playbackState === 'playing';

  if (!isConnected) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyIcon}>◎</Text>
        <Text style={styles.emptyTitle}>Not Connected</Text>
        <Text style={styles.emptySub}>Connect to your Pod in the Pod tab</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.screenLabel}>Now Playing</Text>

      {/* Album Art */}
      <Animated.View style={[styles.artworkContainer, artworkStyle]}>
        {artUri ? (
          <Image source={{ uri: artUri }} style={styles.artwork} resizeMode="cover" />
        ) : (
          <View style={[styles.artwork, { backgroundColor: colors.bg }]}>
            <Text style={[styles.artworkLetter, { color: colors.letter }]}>
              {song?.album?.[0]?.toUpperCase() ?? '♪'}
            </Text>
          </View>
        )}
      </Animated.View>

      {/* Song Info */}
      <View style={styles.info}>
        <Text style={styles.songTitle} numberOfLines={1}>
          {song?.title ?? 'Nothing Playing'}
        </Text>
        <Text style={styles.songArtist} numberOfLines={1}>
          {song?.artist ?? '—'}
        </Text>
        <Text style={styles.songAlbum} numberOfLines={1}>
          {song?.album ?? '—'}
        </Text>
      </View>

      {/* Seek */}
      <SeekBar position={displayPosition} duration={duration} onSeek={handleSeek} />

      {/* Transport */}
      <View style={styles.transport}>
        <TransportButton onPress={toggleShuffle}>
          <SymbolView
            name="shuffle"
            style={styles.symbolSm}
            type="monochrome"
            tintColor={shuffle ? '#FFFFFF' : '#48484A'}
          />
        </TransportButton>

        <TransportButton onPress={previous}>
          <SymbolView name="backward.fill" style={styles.symbolSm} type="monochrome" tintColor="#FFFFFF" />
        </TransportButton>

        <TransportButton large onPress={isPlaying ? pause : play}>
          <SymbolView
            name={isPlaying ? 'pause.fill' : 'play.fill'}
            style={styles.symbolLg}
            type="monochrome"
            tintColor="#FFFFFF"
          />
        </TransportButton>

        <TransportButton onPress={next}>
          <SymbolView name="forward.fill" style={styles.symbolSm} type="monochrome" tintColor="#FFFFFF" />
        </TransportButton>

        <TransportButton onPress={cycleRepeat}>
          <SymbolView
            name={repeat === 'one' ? 'repeat.1' : 'repeat'}
            style={styles.symbolSm}
            type="monochrome"
            tintColor={repeatActive ? '#FFFFFF' : '#48484A'}
          />
        </TransportButton>
      </View>

      {/* Volume */}
      <View style={styles.volumeRow}>
        <SymbolView name="speaker.fill" style={styles.symbolVol} type="monochrome" tintColor="#48484A" />
        <View
          style={styles.volumeHitArea}
          onLayout={(e) => { volumeTrackWidth.current = e.nativeEvent.layout.width; }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => handleVolumeChange(e.nativeEvent.locationX)}
          onResponderMove={(e) => handleVolumeChange(e.nativeEvent.locationX)}
          onResponderRelease={(e) => handleVolumeChange(e.nativeEvent.locationX)}
        >
          <View style={styles.volumeTrack}>
            <View style={[styles.volumeFill, { width: `${localVolume}%` }]} />
          </View>
        </View>
        <SymbolView name="speaker.wave.3.fill" style={styles.symbolVol} type="monochrome" tintColor="#48484A" />
      </View>

      {song?.format && (
        <View style={styles.formatBadge}>
          <Text style={styles.formatText}>{song.format.toUpperCase()}</Text>
        </View>
      )}
    </View>
  );
}

const BG = '#0A0A0A';
const TEXT = '#FFFFFF';
const TEXT_SEC = '#8E8E93';
const ACCENT = '#FFFFFF';
const SURFACE = '#1C1C1E';

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: BG,
    paddingTop: 60, paddingHorizontal: 28, alignItems: 'center',
  },
  center: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', gap: 8 },

  screenLabel: {
    color: TEXT_SEC, fontSize: 12, fontWeight: '600',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 24,
  },

  artworkContainer: { width: 300, height: 300, marginBottom: 32 },
  artwork: {
    width: 300, height: 300, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.7, shadowRadius: 40, elevation: 24,
  },
  artworkLetter: { fontSize: 120, fontWeight: '100' },

  info: { width: '100%', alignItems: 'center', marginBottom: 28, gap: 4 },
  songTitle: { color: TEXT, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  songArtist: { color: TEXT_SEC, fontSize: 17, textAlign: 'center' },
  songAlbum: { color: '#636366', fontSize: 14, textAlign: 'center' },

  seekContainer: { width: '100%', marginBottom: 32 },
  seekTrack: {
    height: 28, justifyContent: 'center',
    marginBottom: 8, position: 'relative',
  },
  seekFill: {
    height: 3, backgroundColor: ACCENT, borderRadius: 1.5,
    position: 'absolute', left: 0, top: '50%',
    transform: [{ translateY: -1.5 }],
  },
  seekThumb: {
    width: 12, height: 12, borderRadius: 6, backgroundColor: ACCENT,
    position: 'absolute', top: '50%', marginLeft: -6,
    transform: [{ translateY: -6 }],
  },
  seekLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  seekTime: { color: TEXT_SEC, fontSize: 12 },

  transport: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 36 },
  transportBtn: { padding: 6, borderRadius: 10 },
  transportBtnLarge: { padding: 10 },
  transportBtnPressed: { opacity: 0.4 },

  symbolSm: { width: 26, height: 26 },
  symbolLg: { width: 38, height: 38 },
  symbolVol: { width: 16, height: 16 },

  volumeRow: { flexDirection: 'row', alignItems: 'center', width: '100%', gap: 12, marginBottom: 24 },
  volumeHitArea: { flex: 1, height: 32, justifyContent: 'center' },
  volumeTrack: { height: 4, backgroundColor: '#2C2C2E', borderRadius: 2 },
  volumeFill: { height: 4, backgroundColor: ACCENT, borderRadius: 2 },

  formatBadge: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: SURFACE, borderRadius: 6 },
  formatText: { color: TEXT_SEC, fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },

  emptyIcon: { fontSize: 40, color: TEXT_SEC },
  emptyTitle: { color: TEXT, fontSize: 17, fontWeight: '600' },
  emptySub: { color: TEXT_SEC, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
});
