import { useEffect, useState, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBluetoothStore } from '@/store/bluetooth.store';
import { useLibraryStore } from '@/store/library.store';
import { usePlayerStore } from '@/store/player.store';
import { podService } from '@/services/bluetooth/BluetoothService';
import { deleteTrack } from '@/services/transfer/UploadService';
import { isPodReachable } from '@/services/transfer/WifiService';
import { Song, Album, Artist } from '@/types/music';
import { Palette, Radius } from '@/constants/theme';
import { EmptyState } from '@/components/ui/EmptyState';
import { RowTitle, RowSubtitle } from '@/components/ui/Row';

type LibraryTab = 'songs' | 'albums' | 'artists';

const artFetched = new Set<string>();
const albumArtFetched = new Set<string>();

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function SongRow({ song, isPlaying, artUri, onPlay, onDelete }: {
  song: Song; isPlaying: boolean; artUri: string | null;
  onPlay: () => void; onDelete: () => void;
}) {
  const fade = useRef(new Animated.Value(artUri ? 1 : 0)).current;

  useEffect(() => {
    if (artUri) {
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    }
  }, [artUri]);

  return (
    <Pressable
      style={({ pressed }) => [s.row, pressed && s.rowPressed]}
      onPress={onPlay}
      onLongPress={() => {
        Alert.alert(song.title, 'Remove this track from ThePod?', [
          { text: 'Delete', style: 'destructive', onPress: onDelete },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }}
    >
      <View style={s.thumb}>
        {artUri ? (
          <Animated.Image
            source={{ uri: artUri }}
            style={[StyleSheet.absoluteFill, { opacity: fade }]}
            resizeMode="cover"
          />
        ) : (
          <View style={s.thumbPlaceholder} />
        )}
      </View>
      <View style={s.rowInfo}>
        <RowTitle style={isPlaying ? { color: Palette.accent } : undefined}>{song.title}</RowTitle>
        <RowSubtitle>{song.artist}</RowSubtitle>
      </View>
      <Text style={s.duration}>{formatDuration(song.duration)}</Text>
    </Pressable>
  );
}

function AlbumCard({ album, artUri, onPress }: {
  album: Album; artUri: string | null; onPress: () => void;
}) {
  const fade = useRef(new Animated.Value(artUri ? 1 : 0)).current;

  useEffect(() => {
    if (artUri) {
      Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    }
  }, [artUri]);

  return (
    <Pressable style={({ pressed }) => [s.albumCard, pressed && { opacity: 0.65 }]} onPress={onPress}>
      <View style={s.albumArt}>
        <View style={s.albumArtPlaceholder} />
        {artUri && (
          <Animated.Image
            source={{ uri: artUri }}
            style={[StyleSheet.absoluteFill, { opacity: fade }]}
            resizeMode="cover"
          />
        )}
      </View>
      <Text style={s.albumTitle} numberOfLines={2}>{album.title}</Text>
      <Text style={s.albumSub} numberOfLines={1}>{album.artist}</Text>
    </Pressable>
  );
}

function ArtistRow({ artist, onPress }: { artist: Artist; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [s.artistRow, pressed && s.rowPressed]}
      onPress={onPress}
    >
      <View style={s.artistBubble}>
        <Text style={s.artistInitial}>{artist.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={s.artistInfo}>
        <RowTitle>{artist.name}</RowTitle>
        <RowSubtitle>
          {artist.albumCount} {artist.albumCount === 1 ? 'album' : 'albums'} · {artist.songCount} songs
        </RowSubtitle>
      </View>
      <SymbolView name="chevron.right" style={s.artistChevron} type="monochrome" tintColor={Palette.textMuted} />
    </Pressable>
  );
}

const TABS: { key: LibraryTab; label: string }[] = [
  { key: 'songs', label: 'Songs' },
  { key: 'albums', label: 'Albums' },
  { key: 'artists', label: 'Artists' },
];

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { connectionState, podIp, podPort } = useBluetoothStore();
  const { songs, albums, artists, isLoading, error, fetchLibrary } = useLibraryStore();
  const { playSong, playAlbum, song: nowPlaying } = usePlayerStore();

  const [artMap, setArtMap] = useState<Record<string, string>>({});
  const [albumArtMap, setAlbumArtMap] = useState<Record<string, string>>({});
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
    if (isConnected && songs.length === 0 && !isLoading) fetchLibrary();
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected || songs.length === 0) return;
    let cancelled = false;

    const fetchSongArt = async () => {
      for (const song of songs) {
        if (cancelled) break;
        if (artFetched.has(song.path)) continue;
        try {
          const res = await podService.request(
            { cmd: 'GET_ALBUM_ART', path: song.path, size: 'small' },
            15000
          );
          artFetched.add(song.path);
          if (!cancelled && res.type === 'ALBUM_ART' && res.data)
            setArtMap(prev => ({ ...prev, [song.path]: `data:image/jpeg;base64,${res.data}` }));
        } catch {}
      }
    };

    const fetchAlbumArt = async () => {
      for (const album of albums) {
        if (cancelled) break;
        const rep = album.songs[0]?.path;
        if (!rep || albumArtFetched.has(rep)) continue;
        try {
          const res = await podService.request({ cmd: 'GET_ALBUM_ART', path: rep }, 20000);
          albumArtFetched.add(rep);
          if (!cancelled && res.type === 'ALBUM_ART' && res.data)
            setAlbumArtMap(prev => ({ ...prev, [rep]: `data:image/jpeg;base64,${res.data}` }));
        } catch {}
      }
    };

    fetchSongArt();
    fetchAlbumArt();

    return () => { cancelled = true; };
  }, [songs.length, isConnected]);

  const handleDelete = async (song: Song) => {
    try {
      await podService.request({ cmd: 'DELETE_TRACK', path: song.path }, 10000);
      artFetched.delete(song.path);
      setArtMap(prev => { const n = { ...prev }; delete n[song.path]; return n; });
      await fetchLibrary();
    } catch {
      if (!podIp) { Alert.alert('Error', 'Could not delete track.'); return; }
      const reachable = await isPodReachable(podIp, podPort);
      if (!reachable) { Alert.alert('Error', 'Connect to ThePod Wi-Fi to delete tracks.'); return; }
      try {
        await deleteTrack(podIp, podPort, song.path);
        artFetched.delete(song.path);
        setArtMap(prev => { const n = { ...prev }; delete n[song.path]; return n; });
        await fetchLibrary();
      } catch (e: any) {
        Alert.alert('Delete failed', e?.message ?? 'Unknown error');
      }
    }
  };

  if (!isConnected) {
    return <EmptyState icon="◎" title="Not Connected" subtitle="Connect to your Pod in the Pod tab" />;
  }

  if (isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={Palette.textSecondary} size="large" />
        <Text style={s.emptySub}>Loading library…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={s.center}>
        <Text style={s.emptyTitle}>Failed to load</Text>
        <Text style={s.emptySub}>{error}</Text>
        <Pressable style={s.retryBtn} onPress={fetchLibrary}>
          <Text style={s.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* Tab bar / breadcrumb */}
      {artistFilter ? (
        <View style={s.breadcrumb}>
          <Pressable
            style={s.backBtn}
            onPress={() => { setArtistFilter(null); setActiveTab('artists'); }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <SymbolView name="chevron.left" style={s.backIcon} type="monochrome" tintColor={Palette.accent} />
            <Text style={s.backText}>Artists</Text>
          </Pressable>
          <Text style={s.breadcrumbTitle} numberOfLines={1}>{artistFilter.name}</Text>
        </View>
      ) : (
        <View style={s.tabBar}>
          {TABS.map(({ key, label }) => (
            <Pressable key={key} style={s.tab} onPress={() => setActiveTab(key)}>
              <Text style={[s.tabLabel, activeTab === key && s.tabLabelActive]}>{label}</Text>
              {activeTab === key && <View style={s.tabIndicator} />}
            </Pressable>
          ))}
        </View>
      )}

      {/* Search — songs tab only */}
      {activeTab === 'songs' && !artistFilter && (
        <View style={s.searchWrap}>
          <SymbolView name="magnifyingglass" style={s.searchIcon} type="monochrome" tintColor={Palette.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Search"
            placeholderTextColor={Palette.textMuted}
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
          style={{ flex: 1 }}
          contentInsetAdjustmentBehavior="never"
          data={filteredSongs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SongRow
              song={item}
              isPlaying={nowPlaying?.id === item.id}
              artUri={artMap[item.path] ?? null}
              onPlay={() => { playSong(item.path); router.navigate('/now-playing'); }}
              onDelete={() => handleDelete(item)}
            />
          )}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            <Text style={s.emptyList}>{query ? 'No results' : 'No songs'}</Text>
          }
        />
      )}

      {/* Albums */}
      {(activeTab === 'albums' || artistFilter) && (
        <FlatList
          style={{ flex: 1 }}
          contentInsetAdjustmentBehavior="never"
          data={displayedAlbums}
          keyExtractor={(item) => item.id}
          numColumns={2}
          renderItem={({ item }) => (
            <AlbumCard
              album={item}
              artUri={albumArtMap[item.songs[0]?.path] ?? null}
              onPress={() => { playAlbum(item.id); router.navigate('/now-playing'); }}
            />
          )}
          contentContainerStyle={s.albumGrid}
          columnWrapperStyle={s.albumRow}
          ListEmptyComponent={
            <Text style={s.emptyList}>No albums</Text>
          }
        />
      )}

      {/* Artists */}
      {activeTab === 'artists' && !artistFilter && (
        <FlatList
          style={{ flex: 1 }}
          contentInsetAdjustmentBehavior="never"
          data={artists}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ArtistRow
              artist={item}
              onPress={() => { setArtistFilter(item); setActiveTab('albums'); }}
            />
          )}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            <Text style={s.emptyList}>No artists</Text>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg },
  center: { flex: 1, backgroundColor: Palette.bg, alignItems: 'center', justifyContent: 'center', gap: 10 },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#272727',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
    position: 'relative',
  },
  tabLabel: { fontSize: 14, fontWeight: '600', color: Palette.textMuted },
  tabLabelActive: { color: Palette.text },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Palette.accent,
    borderRadius: 1,
  },

  // Artist breadcrumb
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#272727',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  backIcon: { width: 9, height: 14 },
  backText: { fontSize: 15, color: Palette.accent, fontWeight: '500' },
  breadcrumbTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: Palette.text, textAlign: 'right' },

  // Search bar
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 2,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  searchIcon: { width: 15, height: 15 },
  searchInput: { flex: 1, color: Palette.text, fontSize: 15 },

  // Song list
  list: { paddingHorizontal: 16, paddingBottom: 120 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  rowPressed: { opacity: 0.5 },
  thumb: {
    width: 48, height: 48, borderRadius: Radius.sm,
    overflow: 'hidden', backgroundColor: Palette.surfaceHigh,
  },
  thumbPlaceholder: { flex: 1, backgroundColor: Palette.surfaceHigh },
  rowInfo: { flex: 1 },
  duration: { color: Palette.textMuted, fontSize: 13, fontVariant: ['tabular-nums'] },

  // Album grid
  albumGrid: { padding: 16, paddingBottom: 120 },
  albumRow: { gap: 12, marginBottom: 20 },
  albumCard: { flex: 1, maxWidth: '50%' },
  albumArt: {
    width: '100%', aspectRatio: 1,
    borderRadius: Radius.sm, marginBottom: 7,
    overflow: 'hidden',
  },
  albumArtPlaceholder: { ...StyleSheet.absoluteFill, backgroundColor: Palette.surfaceHigh },
  albumTitle: { color: Palette.text, fontSize: 13, fontWeight: '700', marginBottom: 2, lineHeight: 17 },
  albumSub: { color: Palette.textSecondary, fontSize: 12 },

  // Artist list
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  artistBubble: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Palette.surfaceHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  artistInitial: { color: Palette.text, fontSize: 18, fontWeight: '700' },
  artistInfo: { flex: 1 },
  artistChevron: { width: 12, height: 12 },

  // Empty / error states
  emptyTitle: { color: Palette.text, fontSize: 17, fontWeight: '700' },
  emptySub: { color: Palette.textSecondary, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  emptyList: { color: Palette.textSecondary, fontSize: 14, textAlign: 'center', paddingTop: 60 },
  retryBtn: { marginTop: 16, paddingHorizontal: 28, paddingVertical: 12, backgroundColor: Palette.text, borderRadius: Radius.pill },
  retryText: { color: Palette.bg, fontSize: 15, fontWeight: '700' },
});
