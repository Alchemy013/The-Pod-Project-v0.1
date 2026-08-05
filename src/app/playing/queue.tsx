import { useEffect } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/ui/icons';
import { usePlayerStore } from '@/store/player.store';
import { Song } from '@/types/music';
import { Palette, Font } from '@/constants/theme';
import { AlbumArt } from '@/components/ui/AlbumArt';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function NowPlayingBars() {
  const heights = [10, 18, 7, 14];
  return (
    <View style={s.bars}>
      {heights.map((h, i) => <View key={i} style={[s.bar, { height: h }]} />)}
    </View>
  );
}

export default function QueueScreen() {
  // Was a hardcoded paddingTop:64, which only happened to match this
  // phone's inset. Use the real one.
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { queue, queueIndex, playSong, loadQueue, clearQueue, addedSongIds } = usePlayerStore();

  useEffect(() => { loadQueue(); }, []);

  const upcoming = queue.slice(queueIndex + 1);
  const continuing = upcoming.filter((s) => !addedSongIds.has(s.id));
  const addedByYou = upcoming.filter((s) => addedSongIds.has(s.id));
  const minutesLeft = Math.round(upcoming.reduce((sum, s) => sum + s.duration, 0) / 60);
  const current = queue[queueIndex];

  const sections = [
    ...(continuing.length ? [{ title: 'Continuing from the album', data: continuing }] : []),
    ...(addedByYou.length ? [{ title: 'Added by you', data: addedByYou }] : []),
  ];

  return (
    <View style={s.container}>
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <View>
          <Text style={s.metaLine}>{upcoming.length} tracks · {minutesLeft} min left</Text>
          <Text style={s.title}>Up next</Text>
        </View>
        {upcoming.length > 0 && (
          <Pressable onPress={clearQueue}><Text style={s.clear}>Clear</Text></Pressable>
        )}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item, i) => item.id || String(i)}
        ListHeaderComponent={current ? (
          <View style={s.currentRow}>
            <AlbumArt uri={null} seedKey={current.album || current.title} title={current.album || current.title} size={56} />
            <View style={s.info}>
              <Text style={s.nowPlayingLabel}>Now playing</Text>
              <Text style={s.songTitle} numberOfLines={1}>{current.title}</Text>
              <Text style={s.songArtist} numberOfLines={1}>{current.artist}</Text>
            </View>
            <NowPlayingBars />
          </View>
        ) : null}
        renderSectionHeader={({ section }) => <Text style={s.sectionLabel}>{section.title}</Text>}
        renderItem={({ item }: { item: Song }) => (
          <Pressable
            style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}
            onPress={() => { playSong(item.path); router.back(); }}
          >
            <Icon name="drag-handle" size={16} color={Palette.border} />
            <AlbumArt uri={null} seedKey={item.album || item.title} title={item.album || item.title} size={36} />
            <View style={s.info}>
              <Text style={s.rowTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={s.songArtist} numberOfLines={1}>{item.artist}</Text>
            </View>
            <Text style={s.dur}>{formatTime(item.duration)}</Text>
          </Pressable>
        )}
        contentContainerStyle={s.list}
        ListEmptyComponent={<Text style={s.empty}>Nothing queued after this track</Text>}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg },
  header: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 2, borderBottomColor: Palette.divider,
  },
  metaLine: { fontFamily: Font.bold, fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase', color: Palette.textSecondary, marginBottom: 6 },
  title: { fontFamily: Font.heading, fontSize: 40, letterSpacing: -1, color: Palette.text },
  clear: { fontFamily: Font.heading, fontSize: 11, letterSpacing: 1.0, textTransform: 'uppercase', color: Palette.accent, paddingBottom: 4 },

  list: { paddingHorizontal: 20, paddingBottom: 140 },

  currentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 16, borderBottomWidth: 2, borderBottomColor: Palette.divider,
  },
  nowPlayingLabel: { fontFamily: Font.bold, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: Palette.accent, marginBottom: 3 },
  songTitle: { fontFamily: Font.bold, fontSize: 15, color: Palette.text },
  songArtist: { fontFamily: Font.regular, fontSize: 12, color: Palette.textSecondary, marginTop: 1 },

  sectionLabel: {
    fontFamily: Font.bold, fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: Palette.borderFaint,
    backgroundColor: Palette.bg, paddingTop: 18, paddingBottom: 10,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Palette.divider,
  },
  rowTitle: { fontFamily: Font.medium, fontSize: 14, color: Palette.text },
  info: { flex: 1, minWidth: 0 },
  dur: { fontFamily: Font.regular, fontSize: 11, color: Palette.textSecondary, fontVariant: ['tabular-nums'] },

  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 18 },
  bar: { width: 3, backgroundColor: Palette.accent },

  empty: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 14, textAlign: 'center', paddingTop: 60 },
});
