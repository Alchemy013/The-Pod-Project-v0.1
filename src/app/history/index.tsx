import { useEffect, useMemo } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHistoryStore, PlayEntry } from '@/store/history.store';
import { useLibraryStore } from '@/store/library.store';
import { Palette, Font } from '@/constants/theme';
import { AlbumArt } from '@/components/ui/AlbumArt';

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

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { entries, load } = useHistoryStore();
  const { albums } = useLibraryStore();

  useEffect(() => { load(); }, []);

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
      const latest = a.songs.reduce((max, s) => ((s.dateAdded ?? '') > max ? s.dateAdded ?? '' : max), '');
      return latest && new Date(latest).getFullYear() === thisYear;
    }).length;

    const playedAlbumIds = new Set(entries.map((e) => e.albumId));
    const neverPlayed = albums.filter((a) => !playedAlbumIds.has(a.id)).length;

    return {
      playsThisYear: playsThisYear.length,
      addedThisYear,
      neverPlayed,
      hoursThisYear: Math.round(secondsThisYear / 3600),
    };
  }, [entries, albums]);

  return (
    <View style={[s.container, { paddingTop: insets.top + 20 }]}>
      <SectionList
        sections={sections}
        keyExtractor={(item, i) => `${item.songId}-${item.playedAt}-${i}`}
        ListHeaderComponent={<Text style={s.title}>History</Text>}
        renderSectionHeader={({ section }) => <Text style={s.sectionLabel}>{section.title}</Text>}
        renderItem={({ item }) => (
          <View style={s.row}>
            <Text style={s.time}>{timeLabel(item.playedAt)}</Text>
            <AlbumArt uri={null} seedKey={item.album || item.title} title={item.album || item.title} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.rowTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={s.rowSub} numberOfLines={1}>{item.artist}</Text>
            </View>
          </View>
        )}
        ListFooterComponent={
          <View style={s.statsBlock}>
            <Text style={s.statsLabel}>This year on the Pod</Text>
            <View style={s.statsGrid}>
              <View style={s.statCell}>
                <Text style={s.statValue}>{stats.playsThisYear}</Text>
                <Text style={s.statCaption}>tracks played</Text>
              </View>
              <View style={s.statCell}>
                <Text style={s.statValue}>{stats.addedThisYear}</Text>
                <Text style={s.statCaption}>records added</Text>
              </View>
              <View style={s.statCell}>
                <Text style={[s.statValue, { color: Palette.accent }]}>{stats.neverPlayed}</Text>
                <Text style={s.statCaption}>never played yet</Text>
              </View>
              <View style={s.statCell}>
                <Text style={s.statValue}>{stats.hoursThisYear}h</Text>
                <Text style={s.statCaption}>listening time</Text>
              </View>
            </View>
          </View>
        }
        contentContainerStyle={s.list}
        ListEmptyComponent={<Text style={s.empty}>Nothing played yet — history starts once you play something.</Text>}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg },
  title: { fontFamily: Font.heading, fontSize: 40, letterSpacing: -1, color: Palette.text, paddingHorizontal: 20, marginBottom: 14 },
  list: { paddingBottom: 140 },

  sectionLabel: {
    fontFamily: Font.bold, fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase', color: Palette.textSecondary,
    backgroundColor: Palette.bg, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6,
    borderTopWidth: 2, borderTopColor: Palette.divider,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Palette.divider,
  },
  time: { width: 42, fontFamily: Font.regular, fontSize: 11, color: Palette.textSecondary, fontVariant: ['tabular-nums'] },
  rowTitle: { fontFamily: Font.medium, fontSize: 14, color: Palette.text },
  rowSub: { fontFamily: Font.regular, fontSize: 11, color: Palette.textSecondary, marginTop: 1 },

  statsBlock: { paddingHorizontal: 20, paddingTop: 24, borderTopWidth: 2, borderTopColor: Palette.divider, marginTop: 16 },
  statsLabel: { fontFamily: Font.bold, fontSize: 9, letterSpacing: 1.3, textTransform: 'uppercase', color: Palette.textSecondary, marginBottom: 14 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statCell: { width: '50%', marginBottom: 20 },
  statValue: { fontFamily: Font.heading, fontSize: 30, color: Palette.text, fontVariant: ['tabular-nums'] },
  statCaption: { fontFamily: Font.regular, fontSize: 11, color: Palette.textSecondary, marginTop: 4 },

  empty: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 14, textAlign: 'center', paddingTop: 60, paddingHorizontal: 40 },
});
