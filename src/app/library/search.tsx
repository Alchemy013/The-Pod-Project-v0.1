import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/ui/icons';
import { useLibraryStore } from '@/store/library.store';
import { usePlayerStore } from '@/store/player.store';
import { Palette, Font } from '@/constants/theme';
import { AlbumArt } from '@/components/ui/AlbumArt';

const RECENT_KEY = 'thepod_recent_searches';
const MAX_RECENT = 8;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function SearchScreen() {
  const router = useRouter();
  const { songs, albums } = useLibraryStore();
  const { playSong, addToQueue } = usePlayerStore();

  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY).then(raw => { if (raw) setRecent(JSON.parse(raw)); });
  }, []);

  const commitSearch = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    const next = [trimmed, ...recent.filter(r => r.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT);
    setRecent(next);
    AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
  };

  const q = query.trim().toLowerCase();
  const matchedSongs = useMemo(() => {
    if (!q) return [];
    return songs.filter(s => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q) || s.album.toLowerCase().includes(q));
  }, [songs, q]);
  const topAlbum = useMemo(() => {
    if (!q) return null;
    return albums.find(a => a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)) ?? null;
  }, [albums, q]);

  return (
    <View style={s.container}>
      <View style={s.searchRow}>
        <Icon name="search" size={16} color={Palette.text} />
        <TextInput
          style={s.input}
          placeholder="Search"
          placeholderTextColor={Palette.textMuted}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => commitSearch(query)}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        <Pressable onPress={() => router.back()}>
          <Text style={s.cancel}>Cancel</Text>
        </Pressable>
      </View>

      {!q ? (
        <View style={s.section}>
          <Text style={s.sectionLabel}>Recent</Text>
          <View style={s.chips}>
            {recent.map((term) => (
              <Pressable key={term} style={s.chip} onPress={() => setQuery(term)}>
                <Text style={s.chipText}>{term}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <FlatList
          data={matchedSongs}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={topAlbum ? (
            <View style={s.section}>
              <Text style={s.sectionLabel}>Top result</Text>
              <View style={s.topResult}>
                <AlbumArt uri={null} seedKey={topAlbum.id} title={topAlbum.title} size={96} letterScale={0.46} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.topKind}>Album</Text>
                  <Text style={s.topTitle} numberOfLines={1}>{topAlbum.title}</Text>
                  <Text style={s.topSub}>{topAlbum.artist} · {topAlbum.songCount} tracks</Text>
                </View>
              </View>
              <Text style={[s.sectionLabel, { marginTop: 18 }]}>Tracks · {matchedSongs.length}</Text>
            </View>
          ) : (
            <Text style={[s.sectionLabel, { paddingHorizontal: 20 }]}>Tracks · {matchedSongs.length}</Text>
          )}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}
              onPress={() => { commitSearch(query); playSong(item.path); router.push('/playing'); }}
              onLongPress={() => {
                Alert.alert(item.title, item.artist, [
                  { text: 'Add to Queue', onPress: () => { commitSearch(query); addToQueue(item.path); } },
                  { text: 'Cancel', style: 'cancel' },
                ]);
              }}
            >
              <AlbumArt uri={null} seedKey={item.album || item.title} title={item.album || item.title} size={36} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.rowTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={s.rowSub} numberOfLines={1}>{item.album}</Text>
              </View>
              <Text style={s.dur}>{formatTime(item.duration)}</Text>
            </Pressable>
          )}
          contentContainerStyle={{ paddingBottom: 140 }}
          ListEmptyComponent={<Text style={s.empty}>No results</Text>}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg, paddingTop: 64 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingBottom: 10,
    borderBottomWidth: 2, borderBottomColor: Palette.accent,
  },
  input: { flex: 1, color: Palette.text, fontFamily: Font.medium, fontSize: 16, padding: 0 },
  cancel: { color: Palette.textSecondary, fontFamily: Font.heading, fontSize: 11, letterSpacing: 1.0, textTransform: 'uppercase' },

  section: { paddingHorizontal: 20, paddingTop: 20 },
  sectionLabel: { color: Palette.borderFaint, fontFamily: Font.bold, fontSize: 9, letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 10 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  chip: { borderWidth: 2, borderColor: Palette.divider, paddingVertical: 7, paddingHorizontal: 12 },
  chipText: { color: Palette.text, fontFamily: Font.medium, fontSize: 12 },

  topResult: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 14,
    paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: Palette.divider,
  },
  topKind: { color: Palette.textSecondary, fontFamily: Font.bold, fontSize: 9, letterSpacing: 1.0, textTransform: 'uppercase' },
  topTitle: { color: Palette.text, fontFamily: Font.heading, fontSize: 20, letterSpacing: -0.3, marginVertical: 3 },
  topSub: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 12 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Palette.divider,
  },
  rowTitle: { color: Palette.text, fontFamily: Font.medium, fontSize: 14 },
  rowSub: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 11, marginTop: 1 },
  dur: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 11, fontVariant: ['tabular-nums'] },

  empty: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 14, textAlign: 'center', paddingTop: 60 },
});
