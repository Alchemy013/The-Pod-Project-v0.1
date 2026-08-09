import { useEffect } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Icon } from '@/components/ui/icons';
import { useLibraryStore } from '@/store/library.store';
import { usePlayerStore } from '@/store/player.store';
import { useBluetoothStore } from '@/store/bluetooth.store';
import { useArtStore, useArt } from '@/store/art.store';
import { podService } from '@/services/bluetooth/BluetoothService';
import { deleteTrack } from '@/services/transfer/UploadService';
import { isPodReachable } from '@/services/transfer/WifiService';
import { Song } from '@/types/music';
import { Palette, Font, Radius } from '@/constants/theme';
import { AlbumArt } from '@/components/ui/AlbumArt';
import { Fab, HeaderWash, IconCircle, PlayingBars, SpecBadge } from '@/components/ui/controls';

const HERO = 204;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** `24/96` style readout — the hi-fi shorthand used across the design. */
function specOf(song: Song | undefined): string | null {
  if (!song?.bitDepth || !song?.sampleRate) return null;
  const khz = song.sampleRate / 1000;
  return `${song.bitDepth}/${Number.isInteger(khz) ? khz : khz.toFixed(1)}`;
}

export default function AlbumScreen() {
  // headerShown:false on this Stack, so reserve the status bar ourselves.
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { albums, fetchLibrary } = useLibraryStore();
  const { playAlbum, playSong, addToQueue, song: nowPlaying, playbackState } = usePlayerStore();
  const { podIp, podPort } = useBluetoothStore();
  const fetchArt = useArtStore((s) => s.fetch);
  const forgetArt = useArtStore((s) => s.forget);

  const album = albums.find((a) => a.id === id);
  const repPath = album?.songs[0]?.path;
  const art = useArt(repPath, 'large');

  useEffect(() => {
    if (repPath) fetchArt(repPath, 'large');
  }, [repPath]);

  if (!album) return null;

  const minutes = Math.round(album.duration / 60);
  const first = album.songs[0];
  const spec = specOf(first);
  const hiRes = album.songs.some((sg) => sg.bitDepth > 16 || sg.sampleRate > 48000);

  const handlePlay = () => { playAlbum(album.id); router.push('/playing'); };
  const handleShuffle = () => {
    podService.sendCommand({ cmd: 'SHUFFLE', enabled: true });
    playAlbum(album.id);
    router.push('/playing');
  };

  // BLE first; the HTTP endpoint is the fallback for when the Pod's GATT
  // handler errors but the phone is on the same network as the Pi.
  const handleDelete = async (song: Song) => {
    const refresh = () => { forgetArt(song.path); return fetchLibrary(); };
    try {
      const res = await podService.request({ cmd: 'DELETE_TRACK', path: song.path }, 10000);
      if (res.type === 'ERROR') throw new Error(res.msg);
      await refresh();
      return;
    } catch {
      if (!podIp || !(await isPodReachable(podIp, podPort))) {
        Alert.alert('Can’t delete', 'ThePod isn’t reachable over Wi-Fi. Try again once both are on the same network.');
        return;
      }
      try {
        await deleteTrack(podIp, podPort, song.path);
        await refresh();
      } catch (e: any) {
        Alert.alert('Delete failed', e?.message ?? 'Unknown error');
      }
    }
  };

  const trackMenu = (song: Song) => {
    Alert.alert(song.title, song.artist, [
      { text: 'Add to Queue', onPress: () => addToQueue(song.path) },
      { text: 'Delete from ThePod', style: 'destructive', onPress: () => handleDelete(song) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={s.container}>
      <HeaderWash seedKey={album.id} height={420} />

      <View style={[s.nav, { paddingTop: insets.top + 2 }]}>
        <IconCircle name="chevron-left" label="Back" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <IconCircle name="download" label="Transfer music" onPress={() => router.push('/pod/storage')} />
      </View>

      <FlatList
        data={album.songs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          <>
            <View style={s.hero}>
              <AlbumArt uri={art} seedKey={album.id} size={HERO} radius={Radius.md} elevated />
              <Text style={s.title}>{album.title}</Text>
              <Text style={s.artist}>{album.artist}</Text>
              <Text style={s.meta}>
                Album{album.year ? ` · ${album.year}` : ''} · {album.songCount} tracks · {minutes} min
              </Text>
            </View>

            <View style={s.actions}>
              <Pressable onPress={handleShuffle} hitSlop={10} accessibilityRole="button" accessibilityLabel="Shuffle album">
                <Icon name="shuffle" size={20} color={Palette.textSecondary} />
              </Pressable>
              <Pressable
                onPress={() => album.songs.forEach((sg) => addToQueue(sg.path))}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Add album to queue"
              >
                <Icon name="plus" size={20} color={Palette.textSecondary} />
              </Pressable>
              <View style={{ flex: 1 }} />
              <Fab size={56} playing={false} onPress={handlePlay} />
            </View>

            {(first?.format || spec) && (
              <View style={s.badges}>
                {!!first?.format && <SpecBadge label={first.format.toUpperCase()} />}
                {!!spec && <SpecBadge label={spec} accent={hiRes} />}
              </View>
            )}
          </>
        }
        renderItem={({ item, index }) => {
          const active = nowPlaying?.id === item.id;
          const trackSpec = specOf(item);
          return (
            <Pressable
              style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}
              onPress={() => { playSong(item.path); router.push('/playing'); }}
              onLongPress={() => trackMenu(item)}
            >
              <Text style={[s.num, active && { color: Palette.accent }]}>{item.trackNumber || index + 1}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.rowTitle, active && { color: Palette.accent }]} numberOfLines={1}>{item.title}</Text>
                <Text style={s.rowSub} numberOfLines={1}>
                  {[item.format?.toUpperCase(), trackSpec].filter(Boolean).join(' · ') || item.artist}
                </Text>
              </View>
              {active && playbackState === 'playing'
                ? <PlayingBars />
                : <Text style={s.dur}>{formatTime(item.duration)}</Text>}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 8 },

  list: { paddingHorizontal: 20, paddingBottom: 150 },

  hero: { alignItems: 'center', gap: 6, paddingTop: 6 },
  title: {
    fontFamily: Font.heading, fontSize: 26, lineHeight: 30, color: Palette.text,
    textAlign: 'center', marginTop: 10,
  },
  artist: { fontFamily: Font.medium, fontSize: 14, color: Palette.text, opacity: 0.85 },
  meta: { fontFamily: Font.mono, fontSize: 11.5, color: 'rgba(255,255,255,0.55)' },

  actions: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingTop: 20, paddingBottom: 10 },
  badges: { flexDirection: 'row', gap: 7, paddingBottom: 8 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 9 },
  num: { width: 18, textAlign: 'right', fontFamily: Font.mono, fontSize: 13, color: Palette.textMuted },
  rowTitle: { fontFamily: Font.medium, fontSize: 15, color: Palette.text },
  rowSub: { fontFamily: Font.regular, fontSize: 12.5, color: Palette.textSecondary, marginTop: 2 },
  dur: { fontFamily: Font.mono, fontSize: 12, color: Palette.textMuted },
});
