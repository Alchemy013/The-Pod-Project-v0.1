import { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLibraryStore } from '@/store/library.store';
import { useHistoryStore } from '@/store/history.store';
import { useArtStore, useArt } from '@/store/art.store';
import { Album } from '@/types/music';
import { Palette, Font, Radius, Type } from '@/constants/theme';
import { AlbumArt } from '@/components/ui/AlbumArt';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormatMark, HeaderWash, IconCircle, Pressed, SectionTitle, SkeletonCard } from '@/components/ui/controls';
import { isHiResAlbum, specOf } from '@/utils/format';

const SHELF_ART = 142;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Newest file mtime across an album's tracks — MPD's "recently added" proxy. */
function addedAt(album: Album): string {
  return album.songs.reduce((max, s) => ((s.dateAdded ?? '') > max ? s.dateAdded ?? '' : max), '');
}

function ShelfCard({ album, onPress }: { album: Album; onPress: () => void }) {
  const art = useArt(album.songs[0]?.path);
  // Only when it says something. A mark on every card is wallpaper; a mark on
  // the good copies is a reason to pick one.
  const spec = specOf(album.songs[0]);
  return (
    // Large artwork gets a subtler dip than a row — the same 3% on a 142px
    // card would read as the whole shelf lurching.
    <Pressed style={s.shelfCard} onPress={onPress} scaleTo={0.98}>
      <AlbumArt uri={art} seedKey={album.id} size={SHELF_ART} radius={Radius.md} />
      <Text style={s.shelfTitle} numberOfLines={1}>{album.title}</Text>
      <Text style={s.shelfSub} numberOfLines={1}>{album.artist}</Text>
      {isHiResAlbum(album) && !!spec && <FormatMark spec={spec} hiRes />}
    </Pressed>
  );
}

function QuickTile({ album, onPress }: { album: Album; onPress: () => void }) {
  const art = useArt(album.songs[0]?.path, 'small');
  return (
    <Pressed style={s.quick} onPress={onPress}>
      <AlbumArt uri={art} seedKey={album.id} size={56} radius={0} />
      <Text style={s.quickTitle} numberOfLines={1}>{album.title}</Text>
    </Pressed>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { albums, songs, isLoading, ensureLibrary } = useLibraryStore();
  const { entries, load: loadHistory } = useHistoryStore();
  const prefetchLibrary = useArtStore((s) => s.prefetchLibrary);

  useEffect(() => {
    loadHistory();
    ensureLibrary();
  }, []);

  useEffect(() => {
    if (songs.length === 0) return;
    return prefetchLibrary(songs, albums);
  }, [songs.length]);

  // Stays inside the Home stack. Pushing to `/library/album/<id>` navigated into
  // the Library tab, which then stayed on that album — so tapping Library showed
  // the record you were listening to rather than your library.
  const openAlbum = (id: string) => router.push(`/home/album/${id}`);

  // "Recently played" is the local play log projected onto the library: the
  // Pod has no play history of its own (see history.store).
  const recentlyPlayed = useMemo(() => {
    const byId = new Map(albums.map((a) => [a.id, a]));
    const seen = new Set<string>();
    const out: Album[] = [];
    for (const e of entries) {
      if (seen.has(e.albumId)) continue;
      seen.add(e.albumId);
      const album = byId.get(e.albumId);
      if (album) out.push(album);
      if (out.length === 12) break;
    }
    return out;
  }, [entries, albums]);

  const recentlyAdded = useMemo(
    () => [...albums].sort((a, b) => addedAt(b).localeCompare(addedAt(a))).slice(0, 12),
    [albums],
  );

  const hiRes = useMemo(() => albums.filter(isHiResAlbum).slice(0, 12), [albums]);

  // Same-artist shelf off the last thing played — the honest version of a
  // recommendation shelf with no listening model behind it.
  const moreFromArtist = useMemo(() => {
    const last = entries[0];
    if (!last) return null;
    const more = albums.filter((a) => a.artist === last.artist && a.id !== last.albumId);
    return more.length ? { artist: last.artist, albums: more.slice(0, 12) } : null;
  }, [entries, albums]);

  const quickPicks = (recentlyPlayed.length ? recentlyPlayed : recentlyAdded).slice(0, 4);

  const shelf = (title: string, items: Album[], action?: () => void) =>
    items.length > 0 && (
      <View key={title}>
        <SectionTitle action={action ? 'See all' : undefined} onAction={action}>{title}</SectionTitle>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.shelfScroll}
          contentContainerStyle={s.shelfRow}
        >
          {items.map((a) => <ShelfCard key={a.id} album={a} onPress={() => openAlbum(a.id)} />)}
        </ScrollView>
      </View>
    );

  return (
    <View style={s.container}>
      <HeaderWash seedKey={quickPicks[0]?.id ?? 'thepod'} height={300} />

      <View style={[s.header, { paddingTop: insets.top + 4 }]}>
        <Pressed style={s.avatar} onPress={() => router.push('/pod')} scaleTo={0.92} label="Pod settings">
          <Text style={s.avatarText}>P</Text>
        </Pressed>
        <Text style={s.greeting}>{greeting()}</Text>
        {/* No settings gear: `/pod` is already the avatar *and* a tab, so it had
            three doors to one room. The download stays because /pod/storage is a
            sub-screen — two taps otherwise — and it's what an empty Pod needs
            first. */}
        <IconCircle name="download" label="Transfer music" onPress={() => router.push('/pod/storage')} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* The feed's shape is known before its data, so it draws that rather
            than a sentence — the shelf title stays put and only the cards fill
            in. This is only ever seen on a first launch against an empty
            `thepod_library`; a warm start hydrates from disk. */}
        {albums.length === 0 && isLoading && (
          <View>
            <SectionTitle>Recently added</SectionTitle>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.shelfScroll}
              contentContainerStyle={s.shelfRow}
              scrollEnabled={false}
            >
              {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} size={SHELF_ART} />)}
            </ScrollView>
          </View>
        )}

        {quickPicks.length > 0 && (
          <View style={s.quickGrid}>
            {quickPicks.map((a) => <QuickTile key={a.id} album={a} onPress={() => openAlbum(a.id)} />)}
          </View>
        )}

        {shelf('Recently played', recentlyPlayed, () => router.push('/home/history'))}
        {moreFromArtist && shelf(`More from ${moreFromArtist.artist}`, moreFromArtist.albums)}
        {shelf('Recently added', recentlyAdded, () => router.push('/library'))}
        {shelf('Hi-res on the Pod', hiRes)}

        {/* The highest-intent moment in the product: someone who just set up a
            music player and has no music on it. It gets a button, not prose. */}
        {albums.length === 0 && !isLoading && (
          <EmptyState
            icon="download"
            title="Nothing on the Pod yet"
            subtitle="Add FLAC, ALAC or WAV over Wi-Fi and it’ll show up here."
            actionLabel="Add music"
            onAction={() => router.push('/pod/storage')}
          />
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 16 },
  avatar: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: Palette.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: Font.heading, fontSize: Type.headline, color: Palette.accentText },
  greeting: { flex: 1, fontFamily: Font.heading, fontSize: Type.title2, color: Palette.text },

  scroll: { paddingHorizontal: 20, paddingBottom: 150 },

  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, paddingTop: 8 },
  quick: {
    width: '48%', flexGrow: 1, height: 56, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: Radius.sm, overflow: 'hidden',
  },
  quickTitle: { flex: 1, minWidth: 0, fontFamily: Font.bold, fontSize: Type.caption, color: Palette.text, paddingRight: 8 },

  // Negative margin + matching padding lets the shelf bleed to both screen
  // edges while the rest of the feed stays inside the 20px gutter.
  shelfScroll: { marginHorizontal: -20 },
  shelfRow: { gap: 14, paddingHorizontal: 20 },
  shelfCard: { width: SHELF_ART, gap: 8 },
  shelfTitle: { fontFamily: Font.medium, fontSize: Type.callout, color: Palette.text },
  shelfSub: { fontFamily: Font.regular, fontSize: Type.caption, color: Palette.textSecondary },

});
