import { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
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
      style={[styles.row, isPlaying && styles.rowActive]}
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
          {isPlaying && <Text style={styles.playingIndicator}>▶</Text>}
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
    <Pressable style={({ pressed }) => [styles.albumCard, pressed && { opacity: 0.65 }]} onPress={onPress}>
      {artUri ? (
        <Image source={{ uri: artUri }} style={styles.albumArt} resizeMode="cover" />
      ) : (
        <View style={[styles.albumArt, styles.artworkPlaceholder]} />
      )}
      <Text style={styles.albumTitle} numberOfLines={2}>{album.title}</Text>
      <Text style={styles.albumSub} numberOfLines={1}>{album.artist}</Text>
      <Text style={styles.albumCount}>{album.songCount} {album.songCount === 1 ? 'song' : 'songs'}</Text>
    </Pressable>
  );
}

function ArtistRow({ artist, onPress }: { artist: Artist; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.artistRow, pressed && { opacity: 0.6 }]}
      onPress={onPress}
    >
      <View style={styles.artistBubble}>
        <Text style={styles.artistInitial}>{artist.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.artistInfo}>
        <Text style={styles.artistName} numberOfLines={1}>{artist.name}</Text>
        <Text style={styles.artistSub}>{artist.albumCount} {artist.albumCount === 1 ? 'album' : 'albums'} · {artist.songCount} songs</Text>
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
          <View style={styles.headerBack}>
            <Pressable
              onPress={() => setArtistFilter(null)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={({ pressed }) => [{ opacity: pressed ? 0.4 : 1 }]}
            >
              <Text style={styles.backText}>← Artists</Text>
            </Pressable>
            <Text style={styles.screenTitle} numberOfLines={1}>{artistFilter.name}</Text>
          </View>
        ) : (
          <Text style={styles.screenTitle}>Library</Text>
        )}
      </View>

      {/* Tab switcher */}
      {!artistFilter && (
        <View style={styles.tabBar}>
          {TABS.map(({ key, label }) => (
            <Pressable
              key={key}
              style={[styles.tab, activeTab === key && styles.tabActive]}
              onPress={() => setActiveTab(key)}
            >
              <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Search bar */}
      {activeTab === 'songs' && !artistFilter && (
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search songs, artists, albums…"
            placeholderTextColor="#4A3F6B"
            value={query}
            onChangeText={setQuery}
            clearButtonMode="while-editing"
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
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

const BG = '#080010';
const SURFACE = '#110820';
const BORDER = '#2E1F50';
const TEXT = '#FFFFFF';
const TEXT_SEC = '#9B94B3';
const ACCENT = '#A855F7';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG, paddingTop: 60 },
  center: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', gap: 8 },

  header: { paddingHorizontal: 20, marginBottom: 16 },
  headerBack: { gap: 4 },
  backText: { color: TEXT_SEC, fontSize: 13, fontWeight: '500' },
  screenTitle: { color: TEXT, fontSize: 32, fontWeight: '700' },

  tabBar: {
    flexDirection: 'row', marginHorizontal: 20, marginBottom: 14,
    backgroundColor: SURFACE, borderRadius: 12, padding: 3,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: ACCENT },
  tabText: { color: TEXT_SEC, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: TEXT },

  searchWrap: { paddingHorizontal: 20, marginBottom: 12 },
  searchInput: {
    backgroundColor: SURFACE, color: TEXT, fontSize: 15,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: BORDER,
  },

  list: { paddingHorizontal: 20, paddingBottom: 100 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  rowActive: { backgroundColor: 'rgba(168, 85, 247, 0.1)', borderRadius: 8 },
  artwork: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 12, overflow: 'hidden' },
  artworkPlaceholder: { backgroundColor: '#1E1030' },
  playingIndicator: { color: ACCENT, fontSize: 11 },
  rowInfo: { flex: 1, gap: 2, marginRight: 8 },
  rowTitle: { color: TEXT, fontSize: 15, fontWeight: '500' },
  rowTitleActive: { color: ACCENT },
  rowSub: { color: TEXT_SEC, fontSize: 13 },
  duration: { color: TEXT_SEC, fontSize: 13, flexShrink: 0 },

  albumGrid: { paddingHorizontal: 12, paddingBottom: 100 },
  albumRow: { justifyContent: 'space-between', marginBottom: 4 },
  albumCard: { width: '48%', marginHorizontal: 4, marginBottom: 20 },
  albumArt: { width: '100%', aspectRatio: 1, borderRadius: 12, marginBottom: 8, backgroundColor: '#1E1030' },
  albumTitle: { color: TEXT, fontSize: 14, fontWeight: '600', marginBottom: 2 },
  albumSub: { color: TEXT_SEC, fontSize: 12, marginBottom: 2 },
  albumCount: { color: '#4A3F6B', fontSize: 11 },

  artistRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 10, paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth, borderColor: BORDER,
  },
  artistBubble: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#1E1030', alignItems: 'center', justifyContent: 'center',
  },
  artistInitial: { color: ACCENT, fontSize: 18, fontWeight: '700' },
  artistInfo: { flex: 1 },
  artistName: { color: TEXT, fontSize: 15, fontWeight: '500', marginBottom: 2 },
  artistSub: { color: TEXT_SEC, fontSize: 13 },

  emptyIcon: { fontSize: 40, color: TEXT_SEC },
  emptyTitle: { color: TEXT, fontSize: 17, fontWeight: '600' },
  emptySub: { color: TEXT_SEC, fontSize: 14, textAlign: 'center', paddingHorizontal: 40, paddingTop: 40 },
  loadingText: { color: TEXT_SEC, fontSize: 14, marginTop: 12 },
  retryBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: SURFACE, borderRadius: 10 },
  retryText: { color: TEXT, fontSize: 15, fontWeight: '500' },
});
