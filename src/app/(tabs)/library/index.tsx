import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, FlatList, Keyboard, Pressable, RefreshControl, StyleSheet, Text, TextInput, View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Icon } from '@/components/ui/icons';
import { useLibraryStore } from '@/store/library.store';
import { usePlayerStore } from '@/store/player.store';
import { useArtStore, useArt } from '@/store/art.store';
import { Album, Artist, Song } from '@/types/music';
import { Palette, Font, Radius, Type } from '@/constants/theme';
import { AlbumArt } from '@/components/ui/AlbumArt';
import { EmptyState } from '@/components/ui/EmptyState';
import { Chip, ChipRow, FormatMark, PillButton, Pressed, SkeletonRow, TrackTrailing } from '@/components/ui/controls';
import { isHiResAlbum, isHiResSong, specOf } from '@/utils/format';
import { hueFor, ringColor, tintColor, washColor } from '@/utils/albumColor';

type LibraryTab = 'Songs' | 'Albums' | 'Artists';
const TABS: LibraryTab[] = ['Songs', 'Albums', 'Artists'];

const RECENT_KEY = 'thepod_recent_searches';
const MAX_RECENT = 8;

/** Newest file mtime across an album's tracks — MPD's "recently added" proxy. */
function addedAt(album: Album): string {
  return album.songs.reduce((max, s) => ((s.dateAdded ?? '') > max ? s.dateAdded ?? '' : max), '');
}

function SongRow({ song, active, playing, onPress, onLongPress }: {
  song: Song; active: boolean; playing: boolean; onPress: () => void; onLongPress: () => void;
}) {
  const art = useArt(song.path, 'small');
  const hiResSong = isHiResSong(song);
  const spec = specOf(song);
  return (
    <Pressed style={s.row} onPress={onPress} onLongPress={onLongPress}>
      <AlbumArt uri={art} seedKey={song.albumId || song.album || song.title} size={48} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.rowTitle, active && { color: Palette.accent }]} numberOfLines={1}>{song.title}</Text>
        <View style={s.rowSubLine}>
          <Text style={s.rowSub} numberOfLines={1}>{song.artist} · {song.album}</Text>
          {/* Scarce on purpose: a 16/44.1 row carries nothing extra, so the
              tint reads as "this is the good copy" rather than as decoration. */}
          {hiResSong && !!spec && <FormatMark spec={spec} hiRes />}
        </View>
      </View>
      <TrackTrailing playing={active && playing} duration={song.duration} />
    </Pressed>
  );
}

function AlbumRow({ album, onPress }: { album: Album; onPress: () => void }) {
  const art = useArt(album.songs[0]?.path);
  const spec = specOf(album.songs[0]);
  return (
    <Pressed style={s.row} onPress={onPress}>
      <AlbumArt uri={art} seedKey={album.id} size={52} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.rowTitle} numberOfLines={1}>{album.title}</Text>
        <View style={s.rowSubLine}>
          <Text style={s.rowSub} numberOfLines={1}>Album · {album.artist}</Text>
          {isHiResAlbum(album) && !!spec && <FormatMark spec={spec} hiRes />}
        </View>
      </View>
    </Pressed>
  );
}

function ArtistRow({ artist, onPress }: { artist: Artist; onPress: () => void }) {
  const hue = hueFor(artist.id);
  return (
    <Pressed style={s.row} onPress={onPress}>
      {/* Artists get a circular mark with their initial — visually distinct
          from the square record blocks in the same list. */}
      <LinearGradient
        colors={[washColor(hue), tintColor(hue)]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={s.artistMark}
      >
        <Text style={[s.artistInitial, { color: ringColor(hue) }]}>{artist.name.charAt(0).toUpperCase()}</Text>
      </LinearGradient>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.rowTitle} numberOfLines={1}>{artist.name}</Text>
        <Text style={s.rowSub} numberOfLines={1}>
          Artist · {artist.albumCount} {artist.albumCount === 1 ? 'album' : 'albums'}
        </Text>
      </View>
      <Icon name="chevron-right" size={13} color={Palette.textMuted} />
    </Pressed>
  );
}

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { songs, albums, artists, isLoading, error, ensureLibrary, fetchLibrary } = useLibraryStore();
  const { playSong, addToQueue, song: nowPlaying, playbackState } = usePlayerStore();
  const prefetchLibrary = useArtStore((st) => st.prefetchLibrary);

  const [tab, setTab] = useState<LibraryTab>('Songs');
  const [artistFilter, setArtistFilter] = useState<Artist | null>(null);
  const [sortRecent, setSortRecent] = useState(true);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    ensureLibrary();
    AsyncStorage.getItem(RECENT_KEY).then((raw) => { if (raw) setRecent(JSON.parse(raw)); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (songs.length === 0) return;
    return prefetchLibrary(songs, albums);
  }, [songs.length]);

  const commitSearch = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    const next = [trimmed, ...recent.filter((r) => r.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT);
    setRecent(next);
    AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
  };

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  // "hi-res" is understood as a format filter rather than a substring nothing
  // would ever match — it's the one query users type that isn't a name.
  const hiRes = q === 'hi-res' || q === 'hires';

  const shownSongs = useMemo(() => {
    const base = artistFilter ? songs.filter((sg) => sg.artistId === artistFilter.id) : songs;
    if (!searching) return base;
    if (hiRes) return base.filter(isHiResSong);
    return base.filter((sg) => (sg.title + sg.artist + sg.album + sg.genre).toLowerCase().includes(q));
  }, [songs, artistFilter, q, searching, hiRes]);

  const shownAlbums = useMemo(() => {
    let base = artistFilter ? albums.filter((a) => a.artistId === artistFilter.id) : albums;
    if (searching) {
      base = hiRes
        ? base.filter(isHiResAlbum)
        : base.filter((a) => (a.title + a.artist + a.genre).toLowerCase().includes(q));
    }
    return sortRecent
      ? [...base].sort((a, b) => addedAt(b).localeCompare(addedAt(a)))
      : [...base].sort((a, b) => a.title.localeCompare(b.title));
  }, [albums, artistFilter, sortRecent, q, searching, hiRes]);

  const shownArtists = useMemo(
    () => (searching ? artists.filter((a) => a.name.toLowerCase().includes(q)) : artists),
    [artists, q, searching],
  );

  const playTrack = (song: Song) => {
    commitSearch(query);
    playSong(song.path);
    router.push('/playing');
  };

  const longPressSong = (song: Song) => {
    Alert.alert(song.title, song.artist, [
      { text: 'Add to Queue', onPress: () => addToQueue(song.path) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // Only the *list* waits. The title, search field and chips render immediately
  // and identically to the loaded state, so nothing above the list moves when
  // the data lands — which is the whole reason this isn't a centred spinner.
  // A pull-to-refresh over an already-populated list keeps the list and spins
  // the RefreshControl instead, so this is scoped to a genuinely empty store.
  const awaitingLibrary = isLoading && songs.length === 0;

  if (error) {
    return (
      <View style={s.center}>
        <Text style={s.centerTitle}>Couldn’t load the library</Text>
        <Text style={s.centerText}>{error}</Text>
        <PillButton label="Retry" variant="accent" onPress={fetchLibrary} style={{ paddingHorizontal: 40, marginTop: 8 }} />
      </View>
    );
  }

  // The cached library never goes stale on its own, so pull-to-refresh is how
  // you pick up tracks put on the Pod outside the app.
  const refresh = (
    <RefreshControl refreshing={isLoading} onRefresh={fetchLibrary} tintColor={Palette.textSecondary} />
  );

  // An artist drill-down forces the album view; everything else follows the tab.
  const view: LibraryTab = artistFilter && tab === 'Artists' ? 'Albums' : tab;

  // Two different empties. A search that missed is not the same as an empty
  // Pod, and only one of them has an action worth offering.
  const empty = searching ? (
    <EmptyState
      compact
      icon="search"
      title={`No results for “${query.trim()}”`}
      subtitle="Try an artist, an album, or “hi-res”."
    />
  ) : (
    <EmptyState
      compact
      icon="tab-library"
      title="Nothing on the Pod yet"
      subtitle="Add music from Pod › Storage."
      actionLabel="Add music"
      onAction={() => router.push('/pod/storage')}
    />
  );

  return (
    <View style={[s.container, { paddingTop: insets.top + 2 }]}>
      <View style={s.header}>
        <View style={s.avatar}><Text style={s.avatarText}>P</Text></View>
        <Text style={s.title}>Your Library</Text>
      </View>

      {/* Search is folded into the tab rather than living on its own: it filters
          whichever list you're already looking at, so there's no second place
          to go and no mode to switch into. */}
      <View style={s.fieldWrap}>
        <View style={s.field}>
          <Icon name="search" size={15} color={Palette.textSecondary} strokeWidth={2.5} />
          <TextInput
            ref={inputRef}
            style={s.input}
            placeholder={`Search ${view.toLowerCase()}`}
            placeholderTextColor={Palette.textMuted}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => { commitSearch(query); Keyboard.dismiss(); }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="never"
          />
          {!!query && (
            <Pressable onPress={() => setQuery('')} hitSlop={12} accessibilityLabel="Clear search">
              <Icon name="close" size={16} color={Palette.textSecondary} strokeWidth={2} />
            </Pressable>
          )}
        </View>
      </View>

      {artistFilter ? (
        <View style={s.crumb}>
          <Pressable
            style={s.crumbBack}
            onPress={() => setArtistFilter(null)}
            hitSlop={12}
            accessibilityRole="button"
          >
            <Icon name="chevron-left" size={13} color={Palette.accent} />
            <Text style={s.crumbBackText}>Artists</Text>
          </Pressable>
          <Text style={s.crumbTitle} numberOfLines={1}>{artistFilter.name}</Text>
        </View>
      ) : (
        <ChipRow>
          {TABS.map((t) => <Chip key={t} label={t} on={tab === t} onPress={() => setTab(t)} />)}
        </ChipRow>
      )}

      {!searching && recent.length > 0 && view === 'Songs' && !artistFilter && (
        <ChipRow>
          {recent.slice(0, 5).map((term) => (
            <Chip key={term} label={term} on={false} onPress={() => setQuery(term)} />
          ))}
        </ChipRow>
      )}

      {view === 'Albums' && (
        <Pressable
          style={s.sortRow}
          onPress={() => setSortRecent((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={`Sort: ${sortRecent ? 'recently added' : 'A to Z'}`}
        >
          <Icon name="sort" size={13} color={Palette.textSecondary} strokeWidth={2} />
          <Text style={s.sortText}>{sortRecent ? 'Recently added' : 'A–Z'}</Text>
        </Pressable>
      )}

      {/* Keyed on the visible list so switching tabs cross-fades rather than
          snapping — the lists are the same shape, so a hard swap reads as a glitch.
          `sortRecent` is in the key for the same reason: flipping A–Z ↔ Recently
          added reorders every row at once, and re-entering the list is a far
          cheaper way to make that legible than animating a reorder inside a
          virtualized FlatList. */}
      <Animated.View
        key={view + (artistFilter?.id ?? '') + (sortRecent ? '-recent' : '') + (awaitingLibrary ? '-skel' : '')}
        entering={FadeIn.duration(180)}
        style={{ flex: 1 }}
      >
        {awaitingLibrary ? (
          <View style={s.list}>
            {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
          </View>
        ) : view === 'Songs' ? (
          <FlatList
            data={shownSongs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={s.list}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            refreshControl={refresh}
            renderItem={({ item }) => (
              <SongRow
                song={item}
                active={nowPlaying?.id === item.id}
                playing={playbackState === 'playing'}
                onPress={() => playTrack(item)}
                onLongPress={() => longPressSong(item)}
              />
            )}
            ListEmptyComponent={empty}
          />
        ) : view === 'Albums' ? (
          <FlatList
            data={shownAlbums}
            keyExtractor={(item) => item.id}
            contentContainerStyle={s.list}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            refreshControl={refresh}
            renderItem={({ item }) => (
              <AlbumRow album={item} onPress={() => router.push(`/library/album/${item.id}`)} />
            )}
            ListEmptyComponent={empty}
          />
        ) : (
          <FlatList
            data={shownArtists}
            keyExtractor={(item) => item.id}
            contentContainerStyle={s.list}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            refreshControl={refresh}
            renderItem={({ item }) => <ArtistRow artist={item} onPress={() => setArtistFilter(item)} />}
            ListEmptyComponent={empty}
          />
        )}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg },
  center: { flex: 1, backgroundColor: Palette.bg, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  centerTitle: { color: Palette.text, fontFamily: Font.heading, fontSize: Type.title3 },
  centerText: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: Type.body, textAlign: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 12 },
  avatar: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: Palette.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: Font.heading, fontSize: Type.headline, color: Palette.accentText },
  title: { flex: 1, fontFamily: Font.heading, fontSize: Type.title2, color: Palette.text },

  fieldWrap: { paddingHorizontal: 20, paddingBottom: 12 },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 40,
    paddingHorizontal: 13, borderRadius: Radius.md, backgroundColor: Palette.rail,
  },
  input: { flex: 1, fontFamily: Font.medium, fontSize: Type.headline, color: Palette.text, padding: 0 },

  crumb: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 6 },
  crumbBack: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  crumbBackText: { fontFamily: Font.medium, fontSize: Type.body, color: Palette.accent },
  crumbTitle: { flex: 1, fontFamily: Font.bold, fontSize: Type.headline, color: Palette.text, textAlign: 'right' },

  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 2 },
  sortText: { fontFamily: Font.medium, fontSize: Type.caption, color: Palette.textSecondary },

  list: { paddingHorizontal: 20, paddingBottom: 150, paddingTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 8 },
  rowTitle: { fontFamily: Font.medium, fontSize: Type.headline, color: Palette.text },
  // The artist/album text flexes so the format mark keeps its width and the
  // line truncates rather than wrapping.
  rowSubLine: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 3 },
  rowSub: { flexShrink: 1, fontFamily: Font.regular, fontSize: Type.callout, color: Palette.textSecondary },

  artistMark: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  artistInitial: { fontFamily: Font.bold, fontSize: Type.title3 },

});
