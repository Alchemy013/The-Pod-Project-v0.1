import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Icon } from '@/components/ui/icons';
import { useRouter } from 'expo-router';
import { usePlayerStore } from '@/store/player.store';
import { Palette, Font } from '@/constants/theme';
import { AlbumArt } from '@/components/ui/AlbumArt';

export function MiniPlayer() {
  const router = useRouter();
  const { song, playbackState, play, pause, next } = usePlayerStore();

  if (!song) return null;

  return (
    <Pressable style={styles.row} onPress={() => router.navigate('/playing')}>
      <AlbumArt uri={null} seedKey={song.album ?? song.title} title={song.album ?? song.title} size={44} />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{song.title}</Text>
        <Text style={styles.artist} numberOfLines={1}>{song.artist}</Text>
      </View>
      <Pressable
        hitSlop={10}
        onPress={(e) => { e.stopPropagation(); playbackState === 'playing' ? pause() : play(); }}
      >
        <Icon
          name={playbackState === 'playing' ? 'pause' : 'play'}
          size={22}
          color={Palette.text}
        />
      </Pressable>
      <Pressable hitSlop={10} onPress={(e) => { e.stopPropagation(); next(); }}>
        <Icon name="next" size={22} color={Palette.text} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Palette.bg,
    borderTopWidth: 2,
    borderTopColor: Palette.divider,
  },
  info: { flex: 1, minWidth: 0 },
  title: { fontFamily: Font.bold, fontSize: 13, color: Palette.text },
  artist: { fontFamily: Font.regular, fontSize: 11, color: Palette.textSecondary, marginTop: 1 },
});
