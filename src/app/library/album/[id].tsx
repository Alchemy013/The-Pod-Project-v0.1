import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Icon } from '@/components/ui/icons';
import { useLibraryStore } from '@/store/library.store';
import { usePlayerStore } from '@/store/player.store';
import { podService } from '@/services/bluetooth/BluetoothService';
import { Song } from '@/types/music';
import { Palette, Font } from '@/constants/theme';
import { AlbumArt } from '@/components/ui/AlbumArt';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AlbumScreen() {
  // headerShown:false on this Stack, so reserve the status bar ourselves.
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { albums } = useLibraryStore();
  const { playAlbum, playSong, addToQueue, song: nowPlaying } = usePlayerStore();
  const [artUri, setArtUri] = useState<string | null>(null);

  const album = albums.find(a => a.id === id);

  useEffect(() => {
    const rep = album?.songs[0]?.path;
    if (!rep) return;
    podService.request({ cmd: 'GET_ALBUM_ART', path: rep }, 20000)
      .then(res => { if (res.type === 'ALBUM_ART' && res.data) setArtUri(`data:image/jpeg;base64,${res.data}`); })
      .catch(() => {});
  }, [album?.id]);

  if (!album) return null;

  const minutes = Math.round(album.duration / 60);

  const handleShuffle = () => {
    podService.sendCommand({ cmd: 'SHUFFLE', enabled: true });
    playAlbum(album.id);
    router.push('/playing');
  };

  const handlePlay = () => {
    playAlbum(album.id);
    router.push('/playing');
  };

  return (
    <View style={s.container}>
      <FlatList
        data={album.songs}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            <View style={s.topBar}>
              <Pressable onPress={() => router.back()} hitSlop={12}>
                <Icon name="chevron-down" size={22} color={Palette.text} />
              </Pressable>
            </View>
            <AlbumArt uri={artUri} seedKey={album.id} title={album.title} size={230} letterScale={0.65} />
            <View style={[s.header, { paddingTop: insets.top + 12 }]}>
              <Text style={s.title} numberOfLines={2}>{album.title}</Text>
              <Text style={s.artist}>{album.artist}</Text>
              <Text style={s.meta}>
                {album.year ? `${album.year} · ` : ''}{album.songCount} tracks · {minutes} min
              </Text>
              <View style={s.actionRow}>
                <Pressable style={s.playBtn} onPress={handlePlay}>
                  <Text style={s.playBtnText}>Play</Text>
                  <Icon name="play" size={14} color={Palette.accentText} />
                </Pressable>
                <Pressable style={s.shuffleBtn} onPress={handleShuffle}>
                  <Text style={s.shuffleBtnText}>Shuffle</Text>
                  <Icon name="shuffle" size={14} color={Palette.text} />
                </Pressable>
              </View>
            </View>
          </>
        }
        renderItem={({ item, index }) => {
          const active = nowPlaying?.id === item.id;
          return (
            <Pressable
              style={({ pressed }) => [s.row, active && s.rowActive, pressed && { opacity: 0.6 }]}
              onPress={() => { playSong(item.path); router.push('/playing'); }}
              onLongPress={() => {
                Alert.alert(item.title, item.artist, [
                  { text: 'Add to Queue', onPress: () => addToQueue(item.path) },
                  { text: 'Cancel', style: 'cancel' },
                ]);
              }}
            >
              {active ? (
                <Icon name="play" size={12} color={Palette.accent} />
              ) : (
                <Text style={s.trackNum}>{index + 1}</Text>
              )}
              <Text style={[s.trackTitle, active && s.trackTitleActive]} numberOfLines={1}>{item.title}</Text>
              <Text style={[s.trackDur, active && s.trackDurActive]}>{formatTime(item.duration)}</Text>
            </Pressable>
          );
        }}
        contentContainerStyle={{ paddingBottom: 140 }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg },
  topBar: { position: 'absolute', top: 14, left: 20, zIndex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 18 },
  title: { color: Palette.text, fontFamily: Font.heading, fontSize: 30, letterSpacing: -0.4, lineHeight: 34 },
  artist: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 15, marginTop: 4, marginBottom: 10 },
  meta: {
    color: Palette.textSecondary, fontFamily: Font.bold, fontSize: 10, letterSpacing: 1.0, textTransform: 'uppercase',
    borderBottomWidth: 2, borderBottomColor: Palette.divider, paddingBottom: 14,
  },
  actionRow: { flexDirection: 'row', gap: 2, marginTop: 14, marginBottom: 6 },
  playBtn: { flex: 1, backgroundColor: Palette.accent, paddingVertical: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  playBtnText: { color: Palette.accentText, fontFamily: Font.heading, fontSize: 12, letterSpacing: 1.0, textTransform: 'uppercase' },
  shuffleBtn: { flex: 1, borderWidth: 2, borderColor: Palette.border, paddingVertical: 11, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shuffleBtnText: { color: Palette.text, fontFamily: Font.heading, fontSize: 12, letterSpacing: 1.0, textTransform: 'uppercase' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: Palette.divider,
  },
  rowActive: { backgroundColor: 'rgba(236,48,19,0.07)', borderLeftWidth: 3, borderLeftColor: Palette.accent, paddingLeft: 17 },
  trackNum: { width: 16, textAlign: 'center', color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 12, fontVariant: ['tabular-nums'] },
  trackTitle: { flex: 1, color: Palette.text, fontFamily: Font.medium, fontSize: 15 },
  trackTitleActive: { color: Palette.accent, fontFamily: Font.bold },
  trackDur: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 12, fontVariant: ['tabular-nums'] },
  trackDurActive: { color: Palette.accent },
});
