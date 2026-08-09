import { useEffect, useMemo } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHistoryStore, PlayEntry } from '@/store/history.store';
import { useLibraryStore } from '@/store/library.store';
import { useArt } from '@/store/art.store';
import { Palette, Font, Radius } from '@/constants/theme';
import { AlbumArt } from '@/components/ui/AlbumArt';
import { IconCircle, Overline } from '@/components/ui/controls';

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function HistoryRow({ entry, path }: { entry: PlayEntry; path?: string }) {
  const art = useArt(path, 'small');
  return (
    <View style={s.row}>
      <Text style={s.time}>{timeLabel(entry.playedAt)}</Text>
      <AlbumArt uri={art} seedKey={entry.albumId || entry.album || entry.title} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.rowTitle} numberOfLines={1}>{entry.title}</Text>
        <Text style={s.rowSub} numberOfLines={1}>{entry.artist}</Text>
      </View>
    </View>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { entries, load } = useHistoryStore();
  const { albums } = useLibraryStore();

  useEffect(() => { load(); }, []);

  // One representative track path per album, so a history row can show the
  // same artwork the rest of the app already fetched.
  const artPathByAlbum = useMemo(
    () => new Map(albums.map((a) => [a.id, a.songs[0]?.path])),
    [albums],
  );

  const sections = useMemo(() => {
    const groups: { title: string; data: PlayEntry[] }[] = [];
    for (const entry of entries) {
      const title = dayLabel(entry.playedAt);
      const last = groups[groups.length - 1];
      if (last && last.title === title) last.data.push(entry);
      else groups.push({ title, data: [entry] });
    }
    return groups;
  }, [entries]);

  const stats = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const playsThisYear = entries.filter((e) => new Date(e.playedAt).getFullYear() === thisYear);
    const secondsThisYear = playsThisYear.reduce((sum, e) => sum + e.duration, 0);

    const addedThisYear = albums.filter((a) => {
      const latest = a.songs.reduce((max, sg) => ((sg.dateAdded ?? '') > max ? sg.dateAdded ?? '' : max), '');
      return latest && new Date(latest).getFullYear() === thisYear;
    }).length;

    const playedAlbumIds = new Set(entries.map((e) => e.albumId));

    return {
      playsThisYear: playsThisYear.length,
      addedThisYear,
      neverPlayed: albums.filter((a) => !playedAlbumIds.has(a.id)).length,
      hoursThisYear: Math.round(secondsThisYear / 3600),
    };
  }, [entries, albums]);

  return (
    <View style={s.container}>
      <View style={[s.nav, { paddingTop: insets.top + 2 }]}>
        <IconCircle name="chevron-left" label="Back" onPress={() => router.back()} background={Palette.rail} />
        <Text style={s.navTitle}>History</Text>
        <View style={{ width: 36 }} />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item, i) => `${item.songId}-${item.playedAt}-${i}`}
        renderSectionHeader={({ section }) => <Overline style={s.sectionLabel}>{section.title}</Overline>}
        renderItem={({ item }) => <HistoryRow entry={item} path={artPathByAlbum.get(item.albumId)} />}
        ListFooterComponent={
          <View style={s.statsBlock}>
            <Overline>This year on the Pod</Overline>
            <View style={s.statsGrid}>
              {([
                [String(stats.playsThisYear), 'tracks played', Palette.text],
                [String(stats.addedThisYear), 'records added', Palette.text],
                [String(stats.neverPlayed), 'never played yet', Palette.accent],
                [`${stats.hoursThisYear}h`, 'listening time', Palette.text],
              ] as const).map(([value, caption, color]) => (
                <View key={caption} style={s.statCell}>
                  <Text style={[s.statValue, { color }]}>{value}</Text>
                  <Text style={s.statCaption}>{caption}</Text>
                </View>
              ))}
            </View>
          </View>
        }
        contentContainerStyle={s.list}
        ListEmptyComponent={
          <Text style={s.empty}>Nothing played yet — history starts once you play something.</Text>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg },
  nav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, gap: 10 },
  navTitle: { flex: 1, textAlign: 'center', fontFamily: Font.bold, fontSize: 15, color: Palette.text },

  list: { paddingHorizontal: 20, paddingBottom: 150 },

  sectionLabel: { backgroundColor: Palette.bg, paddingTop: 20, paddingBottom: 8 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 9 },
  time: { width: 44, fontFamily: Font.mono, fontSize: 11, color: Palette.textMuted },
  rowTitle: { fontFamily: Font.medium, fontSize: 14.5, color: Palette.text },
  rowSub: { fontFamily: Font.regular, fontSize: 12.5, color: Palette.textSecondary, marginTop: 1 },

  statsBlock: {
    marginTop: 24, padding: 18, borderRadius: Radius.card, backgroundColor: Palette.surface, gap: 14,
  },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statCell: { width: '50%', marginBottom: 16 },
  statValue: { fontFamily: Font.heading, fontSize: 28, fontVariant: ['tabular-nums'] },
  statCaption: { fontFamily: Font.regular, fontSize: 12, color: Palette.textSecondary, marginTop: 3 },

  empty: {
    color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 14, lineHeight: 21,
    textAlign: 'center', paddingTop: 70, paddingHorizontal: 30,
  },
});
