import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useBluetoothStore } from '@/store/bluetooth.store';
import { useLibraryStore } from '@/store/library.store';
import { usePlayerStore } from '@/store/player.store';
import { podService } from '@/services/bluetooth/BluetoothService';
import { Song } from '@/types/music';

const songArtCache = new Map<string, string | null>();

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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function SongRow({ song, isPlaying, onPlay }: {
  song: Song; isPlaying: boolean; onPlay: () => void;
}) {
  const cached = songArtCache.get(song.path);
  const artUri = typeof cached === 'string' ? cached : null;
  const colors = albumColors(song.album);

  return (
    <Pressable style={[styles.row, isPlaying && styles.rowActive]} onPress={onPlay}>
      {artUri ? (
        <Image source={{ uri: artUri }} style={styles.artwork} resizeMode="cover" />
      ) : (
        <View style={[styles.artwork, { backgroundColor: colors.bg }]}>
          {isPlaying
            ? <Text style={styles.playingIndicator}>▶</Text>
            : <Text style={[styles.artworkInitial, { color: colors.letter }]}>
                {song.album?.[0]?.toUpperCase() ?? '♪'}
              </Text>}
        </View>
      )}
      <View style={styles.rowInfo}>
        <Text style={[styles.rowTitle, isPlaying && styles.rowTitleActive]} numberOfLines={1}>
          {song.title}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>{song.artist}</Text>
      </View>
      <Text style={styles.duration}>{formatDuration(song.duration)}</Text>
    </Pressable>
  );
}

export default function LibraryScreen() {
  const router = useRouter();
  const { connectionState } = useBluetoothStore();
  const { songs, isLoading, error, fetchLibrary } = useLibraryStore();
  const { playSong, song: nowPlaying } = usePlayerStore();
  const [artReady, setArtReady] = useState(false);
  const [loadingStep, setLoadingStep] = useState<'songs' | 'artwork'>('songs');

  const isConnected = connectionState === 'connected';

  useEffect(() => {
    if (isConnected && songs.length === 0 && !isLoading) {
      setArtReady(false);
      setLoadingStep('songs');
      fetchLibrary();
    }
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected || songs.length === 0) return;

    const allCached = songs.every(s => songArtCache.has(s.path));
    if (allCached) { setArtReady(true); return; }

    setArtReady(false);
    setLoadingStep('artwork');

    let pending = songs.length;
    const done = () => { if (--pending === 0) setArtReady(true); };

    songs.forEach(song => {
      if (songArtCache.has(song.path)) { done(); return; }
      songArtCache.set(song.path, null);
      podService.request({ cmd: 'GET_ALBUM_ART', path: song.path, size: 'small' }, 15000)
        .then(res => {
          if (res.type === 'ALBUM_ART' && res.data) {
            songArtCache.set(song.path, `data:image/jpeg;base64,${res.data}`);
          }
        })
        .catch(() => {})
        .finally(done);
    });
  }, [songs.length, isConnected]);

  if (!isConnected) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyIcon}>◎</Text>
        <Text style={styles.emptyTitle}>Not Connected</Text>
        <Text style={styles.emptySub}>Connect to your Pod in the Pod tab</Text>
      </View>
    );
  }

  if (isLoading || !artReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" size="large" />
        <Text style={styles.loadingText}>
          {loadingStep === 'songs' ? 'Loading songs...' : 'Loading artwork...'}
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Failed to load library</Text>
        <Text style={styles.emptySub}>{error}</Text>
        <Pressable style={styles.retryBtn} onPress={fetchLibrary}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.screenTitle}>Songs</Text>
      <FlatList
        data={songs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SongRow
            song={item}
            isPlaying={nowPlaying?.id === item.id}
            onPlay={() => { playSong(item.path); router.navigate('/now-playing'); }}
          />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptySub}>No songs found</Text>}
      />
    </View>
  );
}

const BG = '#0A0A0A';
const SURFACE = '#141414';
const BORDER = '#1E1E1E';
const TEXT = '#FFFFFF';
const TEXT_SEC = '#8E8E93';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG, paddingTop: 60 },
  center: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', gap: 8 },
  screenTitle: { color: TEXT, fontSize: 32, fontWeight: '700', paddingHorizontal: 20, marginBottom: 16 },

  list: { paddingHorizontal: 20, paddingBottom: 100 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  rowActive: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8 },
  artwork: { width: 44, height: 44, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginRight: 12, overflow: 'hidden' },
  artworkInitial: { fontSize: 18, fontWeight: '600' },
  playingIndicator: { color: TEXT, fontSize: 11 },
  rowInfo: { flex: 1, gap: 2, marginRight: 8 },
  rowTitle: { color: TEXT, fontSize: 15, fontWeight: '500' },
  rowTitleActive: { color: '#FFFFFF' },
  rowSub: { color: TEXT_SEC, fontSize: 13 },
  duration: { color: TEXT_SEC, fontSize: 13, flexShrink: 0 },

  emptyIcon: { fontSize: 40, color: TEXT_SEC },
  emptyTitle: { color: TEXT, fontSize: 17, fontWeight: '600' },
  emptySub: { color: TEXT_SEC, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  loadingText: { color: TEXT_SEC, fontSize: 14, marginTop: 12 },
  retryBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: SURFACE, borderRadius: 10 },
  retryText: { color: TEXT, fontSize: 15, fontWeight: '500' },
});
