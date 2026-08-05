import { useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/ui/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBluetoothStore } from '@/store/bluetooth.store';
import { useLibraryStore } from '@/store/library.store';
import { usePlayerStore } from '@/store/player.store';
import { podService } from '@/services/bluetooth/BluetoothService';
import { deleteTrack } from '@/services/transfer/UploadService';
import { isPodReachable } from '@/services/transfer/WifiService';
import { Song, Album, Artist } from '@/types/music';
import { Palette, Font } from '@/constants/theme';
import { RowTitle, RowSubtitle } from '@/components/ui/Row';
import { AlbumArt } from '@/components/ui/AlbumArt';

type LibraryTab = 'songs' | 'albums' | 'artists';

const artFetched = new Set<string>();
const albumArtFetched = new Set<string>();

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function SongRow({ song, isPlaying, artUri, onPlay, onAddToQueue, onDelete }: {
  song: Song; isPlaying: boolean; artUri: string | null;
  onPlay: () => void; onAddToQueue: () => void; onDelete: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [s.row, pressed && s.rowPressed]}
      onPress={onPlay}
      onLongPress={() => {
        Alert.alert(song.title, song.artist, [
          { text: 'Add to Queue', onPress: onAddToQueue },
          { text: 'Delete from ThePod', style: 'destructive', onPress: onDelete },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }}
    >
      <AlbumArt uri={artUri} seedKey={song.album || song.title} title={song.album || song.title} size={48} />
      <View style={s.rowInfo}>
        <RowTitle style={isPlaying ? { color: Palette.accent } : undefined}>{song.title}</RowTitle>
        <RowSubtitle>{song.artist}</RowSubtitle>
      </View>
      <Text style={s.duration}>{formatDuration(song.duration)}</Text>
    </Pressable>
  );
}

function AlbumCard({ album, artUri, size, onPress }: {
  album: Album; artUri: string | null; size: number; onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [s.albumCard, pressed && { opacity: 0.65 }]} onPress={onPress}>
      <AlbumArt uri={artUri} seedKey={album.id} title={album.title} size={size} style={{ marginBottom: 8 }} />
      <Text style={s.albumTitle} numberOfLines={2}>{album.title}</Text>
      <Text style={s.albumSub} numberOfLines={1}>{album.artist}</Text>
    </Pressable>
  );
}

function ArtistRow({ artist, onPress }: { artist: Artist; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [s.row, pressed && s.rowPressed]} onPress={onPress}>
      <AlbumArt uri={null} seedKey={artist.id} title={artist.name} size={48} />
      <View style={s.rowInfo}>
        <RowTitle>{artist.name}</RowTitle>
        <RowSubtitle>
          {artist.albumCount} {artist.albumCount === 1 ? 'album' : 'albums'} · {artist.songCount} songs
        </RowSubtitle>
      </View>
      <Icon name="chevron-right" size={12} color={Palette.textMuted} />
    </Pressable>
  );
}

const TABS: { key: LibraryTab; label: string }[] = [
  { key: 'albums', label: 'Albums' },
  { key: 'songs', label: 'Songs' },
  { key: 'artists', label: 'Artists' },
];

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { podIp, podPort } = useBluetoothStore();
  const { songs, albums, artists, isLoading, error, fetchLibrary } = useLibraryStore();
  const { playSong, addToQueue, song: nowPlaying } = usePlayerStore();
  const { width } = useWindowDimensions();

  const [artMap, setArtMap] = useState<Record<string, string>>({});
  const [albumArtMap, setAlbumArtMap] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<LibraryTab>('albums');
  const [artistFilter, setArtistFilter] = useState<Artist | null>(null);
  const [sortRecent, setSortRecent] = useState(false);

  const cardSize = (width - 20 * 2 - 2) / 2;

  const displayedAlbums = useMemo(() => {
    const base = artistFilter ? albums.filter(a => a.artistId === artistFilter.id) : albums;
    if (!sortRecent) return base;
    const latestAdded = (a: Album) =>
      a.songs.reduce((max, s) => ((s.dateAdded ?? '') > max ? s.dateAdded ?? '' : max), '');
    return [...base].sort((a, b) => latestAdded(b).localeCompare(latestAdded(a)));
  }, [albums, artistFilter, sortRecent]);

  useEffect(() => {
    if (songs.length === 0 && !isLoading) fetchLibrary();
  }, []);

  useEffect(() => {
    if (songs.length === 0) return;
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
          // 'medium', not 'large': this loop prefetches art for every album in
          // the library sequentially over BLE, so payload size sets how long
          // the whole grid takes to fill in.
          const res = await podService.request({ cmd: 'GET_ALBUM_ART', path: rep, size: 'medium' }, 20000);
          albumArtFetched.add(rep);
          if (!cancelled && res.type === 'ALBUM_ART' && res.data)
            setAlbumArtMap(prev => ({ ...prev, [rep]: `data:image/jpeg;base64,${res.data}` }));
        } catch {}
      }
    };

    fetchSongArt();
    fetchAlbumArt();

    return () => { cancelled = true; };
  }, [songs.length]);

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
    <View style={[s.container, { paddingTop: insets.top + 20 }]}>
      {artistFilter ? (
        <View style={s.breadcrumb}>
          <Pressable
            style={s.backBtn}
            onPress={() => { setArtistFilter(null); setActiveTab('artists'); }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Icon name="chevron-left" size={14} color={Palette.accent} />
            <Text style={s.backText}>Artists</Text>
          </Pressable>
          <Text style={s.breadcrumbTitle} numberOfLines={1}>{artistFilter.name}</Text>
        </View>
      ) : (
        <>
          <View style={s.header}>
            <Text style={s.metaLine}>{songs.length.toLocaleString()} tracks · Pod connected</Text>
            <Text style={s.title}>Library</Text>
          </View>

          <Pressable style={s.searchRow} onPress={() => router.push('/library/search')}>
            <Icon name="search" size={16} color={Palette.textSecondary} />
            <Text style={s.searchLabel}>Search {songs.length.toLocaleString()} tracks</Text>
          </Pressable>

          <View style={s.tabBar}>
            {TABS.map(({ key, label }) => (
              <Pressable key={key} style={s.tab} onPress={() => setActiveTab(key)}>
                <Text style={[s.tabLabel, activeTab === key && s.tabLabelActive]}>{label}</Text>
              </Pressable>
            ))}
            {activeTab === 'albums' && !artistFilter && (
              <Pressable style={s.sortToggle} onPress={() => setSortRecent(v => !v)}>
                <Text style={s.sortToggleText}>{sortRecent ? 'Recent' : 'A–Z'}</Text>
              </Pressable>
            )}
          </View>
        </>
      )}

      {activeTab === 'songs' && !artistFilter && (
        <FlatList
          style={{ flex: 1 }}
          data={songs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SongRow
              song={item}
              isPlaying={nowPlaying?.id === item.id}
              artUri={artMap[item.path] ?? null}
              onPlay={() => { playSong(item.path); router.navigate('/playing'); }}
              onAddToQueue={() => addToQueue(item.path)}
              onDelete={() => handleDelete(item)}
            />
          )}
          contentContainerStyle={s.list}
          ListEmptyComponent={<Text style={s.emptyList}>No songs</Text>}
        />
      )}

      {(activeTab === 'albums' || artistFilter) && (
        <FlatList
          style={{ flex: 1 }}
          data={displayedAlbums}
          keyExtractor={(item) => item.id}
          numColumns={2}
          renderItem={({ item }) => (
            <AlbumCard
              album={item}
              artUri={albumArtMap[item.songs[0]?.path] ?? null}
              size={cardSize}
              onPress={() => router.push(`/library/album/${item.id}`)}
            />
          )}
          contentContainerStyle={s.albumGrid}
          columnWrapperStyle={s.albumRow}
          ListEmptyComponent={<Text style={s.emptyList}>No albums</Text>}
        />
      )}

      {activeTab === 'artists' && !artistFilter && (
        <FlatList
          style={{ flex: 1 }}
          data={artists}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ArtistRow artist={item} onPress={() => { setArtistFilter(item); setActiveTab('albums'); }} />
          )}
          contentContainerStyle={s.list}
          ListEmptyComponent={<Text style={s.emptyList}>No artists</Text>}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg },
  center: { flex: 1, backgroundColor: Palette.bg, alignItems: 'center', justifyContent: 'center', gap: 10 },

  header: { paddingHorizontal: 20 },
  metaLine: {
    fontFamily: Font.bold, fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase',
    color: Palette.textSecondary, marginBottom: 6,
  },
  title: { fontFamily: Font.heading, fontSize: 40, letterSpacing: -1, color: Palette.text, marginBottom: 16 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 20, paddingBottom: 10, marginBottom: 14,
    borderBottomWidth: 2, borderBottomColor: Palette.divider,
  },
  searchLabel: { fontFamily: Font.regular, fontSize: 14, color: Palette.textSecondary },

  tabBar: { flexDirection: 'row', gap: 20, paddingHorizontal: 20, marginBottom: 14 },
  tab: { paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabLabel: {
    fontFamily: Font.bold, fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase',
    color: Palette.textSecondary,
  },
  tabLabelActive: { color: Palette.text, borderBottomColor: Palette.accent },
  sortToggle: { marginLeft: 'auto', paddingBottom: 6 },
  sortToggleText: {
    fontFamily: Font.bold, fontSize: 10, letterSpacing: 1.0, textTransform: 'uppercase',
    color: Palette.textSecondary,
  },

  breadcrumb: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 10,
    borderBottomWidth: 2, borderBottomColor: Palette.divider, marginBottom: 4,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  backText: { fontFamily: Font.medium, fontSize: 15, color: Palette.accent },
  breadcrumbTitle: { flex: 1, fontFamily: Font.bold, fontSize: 16, color: Palette.text, textAlign: 'right' },

  list: { paddingHorizontal: 20, paddingBottom: 140 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 14, borderBottomWidth: 1, borderBottomColor: Palette.divider },
  rowPressed: { opacity: 0.5 },
  rowInfo: { flex: 1 },
  duration: { color: Palette.textMuted, fontFamily: Font.regular, fontSize: 12, fontVariant: ['tabular-nums'] },

  albumGrid: { paddingHorizontal: 20, paddingBottom: 140, paddingTop: 4 },
  albumRow: { gap: 2, marginBottom: 20 },
  albumCard: { flex: 1, maxWidth: '50%' },
  albumTitle: { color: Palette.text, fontFamily: Font.bold, fontSize: 13, marginBottom: 2, lineHeight: 17 },
  albumSub: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 11 },

  emptyTitle: { color: Palette.text, fontFamily: Font.bold, fontSize: 17 },
  emptySub: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  emptyList: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 14, textAlign: 'center', paddingTop: 60 },
  retryBtn: { marginTop: 16, paddingHorizontal: 28, paddingVertical: 12, backgroundColor: Palette.accent },
  retryText: { color: Palette.accentText, fontFamily: Font.bold, fontSize: 15 },
});
