import { useEffect, useState, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useBluetoothStore } from '@/store/bluetooth.store';
import { useLibraryStore } from '@/store/library.store';
import { usePlayerStore } from '@/store/player.store';
import { podService } from '@/services/bluetooth/BluetoothService';
import { deleteTrack } from '@/services/transfer/UploadService';
import { isPodReachable } from '@/services/transfer/WifiService';
import { Song, Album, Artist } from '@/types/music';

type LibraryTab = 'songs' | 'albums' | 'artists';

const songArtCache = new Map<string, string | null>();

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function SongRow({ song, isPlaying, onPlay, onDelete }: {
  song: Song; isPlaying: boolean; onPlay: () => void; onDelete: () => void;
}) {
  const cached = songArtCache.get(song.path);
  const artUri = typeof cached === 'string' ? cached : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPlay}
      onLongPress={() => {
        Alert.alert(
          song.title,
          'Remove this track from ThePod?',
          [
            { text: 'Delete', style: 'destructive', onPress: onDelete },
            { text: 'Cancel', style: 'cancel' },
          ],
        );
      }}
    >
      {artUri ? (
        <Image source={{ uri: artUri }} style={styles.artwork} resizeMode="cover" />
      ) : (
        <View style={[styles.artwork, styles.artworkPlaceholder]}>
          {isPlaying && <Text style={styles.playingDot}>▶</Text>}
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

function AlbumCard({ album, onPress }: { album: Album; onPress: () => void }) {
  const firstPath = album.songs[0]?.path;
  const cached = firstPath ? songArtCache.get(firstPath) : undefined;
  const artUri = typeof cached === 'string' ? cached : null;

  return (
    <Pressable style={({ pressed }) => [styles.albumCard, pressed && { opacity: 0.7 }]} onPress={onPress}>
      {artUri ? (
        <Image source={{ uri: artUri }} style={styles.albumArt} resizeMode="cover" />
      ) : (
        <View style={[styles.albumArt, styles.artworkPlaceholder]} />
      )}
      <Text style={styles.albumTitle} numberOfLines={2}>{album.title}</Text>
      <Text style={styles.albumSub} numberOfLines={1}>{album.artist}</Text>
    </Pressable>
  );
}

function ArtistRow({ artist, onPress }: { artist: Artist; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.artistRow, pressed && styles.rowPressed]}
      onPress={onPress}
    >
      <View style={styles.artistBubble}>
        <Text style={styles.artistInitial}>{artist.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.artistInfo}>
        <Text style={styles.artistName} numberOfLines={1}>{artist.name}</Text>
        <Text style={styles.artistSub}>
          {artist.albumCount} {artist.albumCount === 1 ? 'album' : 'albums'} · {artist.songCount} songs
        </Text>
      </View>
    </Pressable>
  );
}

export default function LibraryScreen() {
  const router = useRouter();
  const { connectionState, podIp, podPort } = useBluetoothStore();
  const { songs, albums, artists, isLoading, error, fetchLibrary } = useLibraryStore();
  const { playSong, playAlbum, song: nowPlaying } = usePlayerStore();

  const [artReady, setArtReady] = useState(false);
  const [loadingStep, setLoadingStep] = useState<'songs' | 'artwork'>('songs');
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<LibraryTab>('songs');
  const [artistFilter, setArtistFilter] = useState<Artist | null>(null);

  const isConnected = connectionState === 'connected';

  const filteredSongs = useMemo(() => {
    if (!query.trim()) return songs;
    const q = query.toLowerCase();
    return songs.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.artist.toLowerCase().includes(q) ||
      s.album.toLowerCase().includes(q),
    );
  }, [songs, query]);

  const displayedAlbums = useMemo(() => {
    if (!artistFilter) return albums;
    return albums.filter(a => a.artistId === artistFilter.id);
  }, [albums, artistFilter]);

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

  const handleDelete = async (song: Song) => {
    try {
      await podService.request({ cmd: 'DELETE_TRACK', path: song.path }, 10000);
      songArtCache.delete(song.path);
      await fetchLibrary();
    } catch {
      if (!podIp) { Alert.alert('Error', 'Could not delete track.'); return; }
      const reachable = await isPodReachable(podIp, podPort);
      if (!reachable) { Alert.alert('Error', 'Connect to ThePod Wi-Fi to delete tracks.'); return; }
      try {
        await deleteTrack(podIp, podPort, song.path);
        songArtCache.delete(song.path);
        await fetchLibrary();
      } catch (e: any) {
        Alert.alert('Delete failed', e?.message ?? 'Unknown error');
      }
    }
  };

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
        <ActivityIndicator color={ACCENT} size="large" />
        <Text style={styles.loadingText}>
          {loadingStep === 'songs' ? 'Loading songs…' : 'Loading artwork…'}
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

  const TABS: { key: LibraryTab; label: string }[] = [
    { key: 'songs', label: 'Songs' },
    { key: 'albums', label: 'Albums' },
    { key: 'artists', label: 'Artists' },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {artistFilter ? (
          <>
            <Pressable
              onPress={() => setArtistFilter(null)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
            >
              <Text style={styles.backLink}>← Artists</Text>
            </Pressable>
            <Text style={styles.screenTitle} numberOfLines={1}>{artistFilter.name}</Text>
          </>
        ) : (
          <Text style={styles.screenTitle}>Library</Text>
        )}
      </View>

      {/* Spotify-style outlined filter chips */}
      {!artistFilter && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chipsContent}
        >
          {TABS.map(({ key, label }) => (
            <Pressable
              key={key}
              style={[styles.chip, activeTab === key && styles.chipActive]}
              onPress={() => setActiveTab(key)}
            >
              <Text style={[styles.chipText, activeTab === key && styles.chipTextActive]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Search — songs tab only */}
      {activeTab === 'songs' && !artistFilter && (
        <View style={styles.searchWrap}>
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search songs, artists, albums…"
              placeholderTextColor={TEXT_MUTE}
              value={query}
              onChangeText={setQuery}
              clearButtonMode="while-editing"
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>
      )}

      {/* Songs */}
      {activeTab === 'songs' && !artistFilter && (
        <FlatList
          data={filteredSongs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SongRow
              song={item}
              isPlaying={nowPlaying?.id === item.id}
              onPlay={() => { playSong(item.path); router.navigate('/now-playing'); }}
              onDelete={() => handleDelete(item)}
            />
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.emptySub}>{query ? 'No results' : 'No songs found'}</Text>
          }
        />
      )}

      {/* Albums */}
      {(activeTab === 'albums' || artistFilter) && (
        <FlatList
          data={displayedAlbums}
          keyExtractor={(item) => item.id}
          numColumns={2}
          renderItem={({ item }) => (
            <AlbumCard
              album={item}
              onPress={() => { playAlbum(item.id); router.navigate('/now-playing'); }}
            />
          )}
          contentContainerStyle={styles.albumGrid}
          columnWrapperStyle={styles.albumRow}
          ListEmptyComponent={
            <Text style={styles.emptySub}>No albums found</Text>
          }
        />
      )}

      {/* Artists */}
      {activeTab === 'artists' && !artistFilter && (
        <FlatList
          data={artists}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ArtistRow
              artist={item}
              onPress={() => { setArtistFilter(item); setActiveTab('albums'); }}
            />
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.emptySub}>No artists found</Text>
          }
        />
      )}
    </View>
  );
}

const BG = '#121212';
const SURFACE = '#181818';
const SURFACE_HIGH = '#282828';
const TEXT = '#FFFFFF';
const TEXT_SEC = '#B3B3B3';
const TEXT_MUTE = '#535353';
const ACCENT = '#A855F7';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG, paddingTop: 60 },
  center: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', gap: 10 },

  header: { paddingHorizontal: 16, marginBottom: 20 },
  backLink: { color: TEXT_SEC, fontSize: 13, fontWeight: '500', marginBottom: 6 },
  screenTitle: { color: TEXT, fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },

  // Spotify-style horizontal chips
  chipsScroll: { marginBottom: 12 },
  chipsContent: { paddingHorizontal: 16, gap: 8, flexDirection: 'row' },
  chip: {
    height: 32, paddingHorizontal: 14, borderRadius: 9999,
    borderWidth: 1, borderColor: '#535353',
    alignItems: 'center', justifyContent: 'center',
  },
  chipActive: { backgroundColor: TEXT, borderColor: TEXT },
  chipText: { color: TEXT, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: BG },

  // Search bar
  searchWrap: { paddingHorizontal: 16, marginBottom: 12 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: SURFACE_HIGH, borderRadius: 6,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  searchIcon: { color: TEXT_SEC, fontSize: 18 },
  searchInput: { flex: 1, color: TEXT, fontSize: 15 },

  // Song rows — Spotify flat, no separators
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, gap: 12,
  },
  rowPressed: { opacity: 0.6 },
  artwork: { width: 48, height: 48, borderRadius: 4, overflow: 'hidden' },
  artworkPlaceholder: { backgroundColor: SURFACE_HIGH, alignItems: 'center', justifyContent: 'center' },
  playingDot: { color: ACCENT, fontSize: 10 },
  rowInfo: { flex: 1, gap: 3 },
  rowTitle: { color: TEXT, fontSize: 14, fontWeight: '400' },
  rowTitleActive: { color: ACCENT },
  rowSub: { color: TEXT_SEC, fontSize: 12 },
  duration: { color: TEXT_MUTE, fontSize: 12, fontVariant: ['tabular-nums'] },

  // Album grid
  albumGrid: { paddingHorizontal: 16, paddingBottom: 100 },
  albumRow: { gap: 16, marginBottom: 24 },
  albumCard: { flex: 1 },
  albumArt: { width: '100%', aspectRatio: 1, borderRadius: 4, marginBottom: 10, backgroundColor: SURFACE_HIGH },
  albumTitle: { color: TEXT, fontSize: 14, fontWeight: '700', marginBottom: 3, lineHeight: 20 },
  albumSub: { color: TEXT_SEC, fontSize: 12 },

  // Artist rows
  artistRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 10, paddingHorizontal: 16,
  },
  artistBubble: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: SURFACE_HIGH, alignItems: 'center', justifyContent: 'center',
  },
  artistInitial: { color: TEXT_SEC, fontSize: 22, fontWeight: '700' },
  artistInfo: { flex: 1 },
  artistName: { color: TEXT, fontSize: 15, fontWeight: '600', marginBottom: 3 },
  artistSub: { color: TEXT_SEC, fontSize: 12 },

  // States
  emptyIcon: { fontSize: 40, color: TEXT_MUTE },
  emptyTitle: { color: TEXT, fontSize: 18, fontWeight: '700' },
  emptySub: { color: TEXT_SEC, fontSize: 14, textAlign: 'center', paddingHorizontal: 40, paddingTop: 48 },
  loadingText: { color: TEXT_SEC, fontSize: 14, marginTop: 16 },
  retryBtn: { marginTop: 16, paddingHorizontal: 28, paddingVertical: 12, backgroundColor: TEXT, borderRadius: 9999 },
  retryText: { color: BG, fontSize: 15, fontWeight: '700' },
});
