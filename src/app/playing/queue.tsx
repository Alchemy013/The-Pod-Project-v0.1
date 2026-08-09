import { useEffect } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/ui/icons';
import { usePlayerStore } from '@/store/player.store';
import { useArt } from '@/store/art.store';
import { Song } from '@/types/music';
import { Palette, Font, Type } from '@/constants/theme';
import { AlbumArt } from '@/components/ui/AlbumArt';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderWash, IconCircle, Overline, Pressed, PlayingBars } from '@/components/ui/controls';

function QueueRow({ song, onPress }: { song: Song; onPress: () => void }) {
  const art = useArt(song.path, 'small');
  return (
    <Pressed style={s.row} onPress={onPress} label={song.title}>
      {/* Decorative until the firmware grows a reorder command — it marks the
          row as a queue item rather than promising a drag. */}
      <Icon name="drag-handle" size={15} color={Palette.inactive} strokeWidth={2} />
      <AlbumArt uri={art} seedKey={song.albumId || song.album || song.title} size={42} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.rowTitle} numberOfLines={1}>{song.title}</Text>
        <Text style={s.rowSub} numberOfLines={1}>{song.artist}</Text>
      </View>
    </Pressed>
  );
}

export default function QueueScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { queue, queueIndex, playbackState, shuffle, playSong, loadQueue, clearQueue, toggleShuffle, addedSongIds } =
    usePlayerStore();

  useEffect(() => { loadQueue(); }, []);

  const current = queue[queueIndex];
  const upcoming = queue.slice(queueIndex + 1);
  const continuing = upcoming.filter((sg) => !addedSongIds.has(sg.id));
  const addedByYou = upcoming.filter((sg) => addedSongIds.has(sg.id));
  const currentArt = useArt(current?.path, 'small');

  const sections = [
    ...(continuing.length ? [{ title: 'Up next', data: continuing }] : []),
    ...(addedByYou.length ? [{ title: 'Added by you', data: addedByYou }] : []),
  ];

  return (
    <View style={s.container}>
      <HeaderWash seedKey={current?.albumId || current?.album || 'thepod'} height={240} />

      <View style={[s.nav, { paddingTop: insets.top + 2 }]}>
        <IconCircle name="chevron-left" label="Back" onPress={() => router.back()} />
        <Text style={s.navTitle}>Queue</Text>
        <Pressable
          onPress={toggleShuffle}
          hitSlop={12}
          style={s.navRight}
          accessibilityRole="button"
          accessibilityLabel="Shuffle"
        >
          <Icon name="shuffle" size={19} color={shuffle ? Palette.accent : Palette.textSecondary} />
        </Pressable>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item, i) => item.id || String(i)}
        contentContainerStyle={s.list}
        ListHeaderComponent={current ? (
          <>
            <Overline style={{ paddingBottom: 10 }}>Now playing</Overline>
            <View style={s.currentRow}>
              <AlbumArt uri={currentArt} seedKey={current.albumId || current.album || current.title} size={48} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.currentTitle} numberOfLines={1}>{current.title}</Text>
                <Text style={s.rowSub} numberOfLines={1}>{current.artist}</Text>
              </View>
              {playbackState === 'playing' && <PlayingBars />}
            </View>
          </>
        ) : null}
        renderSectionHeader={({ section }) => (
          <View style={s.sectionRow}>
            <Overline>{section.title}</Overline>
            {section.title === 'Up next' && (
              <Pressable onPress={clearQueue} hitSlop={10} accessibilityRole="button">
                <Text style={s.clear}>Clear</Text>
              </Pressable>
            )}
          </View>
        )}
        renderItem={({ item }) => (
          <QueueRow song={item} onPress={() => { playSong(item.path); router.back(); }} />
        )}
        ListEmptyComponent={
          <EmptyState
            compact
            icon="queue"
            title="Nothing up next"
            subtitle="Play an album and the rest of it queues automatically."
          />
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg },

  nav: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 12 },
  navTitle: { flex: 1, textAlign: 'center', fontFamily: Font.bold, fontSize: Type.headline, color: Palette.text },
  navRight: { width: 36, alignItems: 'center' },

  list: { paddingHorizontal: 20, paddingBottom: 150 },

  currentRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 8 },
  currentTitle: { fontFamily: Font.bold, fontSize: Type.headline, color: Palette.accent },

  sectionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    backgroundColor: Palette.bg, paddingTop: 22, paddingBottom: 6,
  },
  clear: { fontFamily: Font.medium, fontSize: Type.caption, color: Palette.textSecondary },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  rowTitle: { fontFamily: Font.medium, fontSize: Type.body, color: Palette.text },
  rowSub: { fontFamily: Font.regular, fontSize: Type.caption, color: Palette.textSecondary, marginTop: 2 },

});
