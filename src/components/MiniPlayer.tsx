import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeOut, SlideInDown, SlideOutDown, useAnimatedStyle,
  useReducedMotion, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/ui/icons';
import { usePlayerStore } from '@/store/player.store';
import { useArt } from '@/store/art.store';
import { Motion, Palette, Font, Radius, Type } from '@/constants/theme';
import { AlbumArt } from '@/components/ui/AlbumArt';
import { Fab, Pressed } from '@/components/ui/controls';
import { hueFor, tintColor, washColor } from '@/utils/albumColor';

export function MiniPlayer() {
  const { song, playbackState, position, duration, play, pause } = usePlayerStore();
  const router = useRouter();
  // Hook order has to be stable, so the art lookup happens before the early
  // return and simply gets `undefined` when nothing is playing.
  const art = useArt(song?.path, 'small');
  const reduced = useReducedMotion();

  const progress = duration > 0 ? Math.min(position / duration, 1) : 0;
  const fill = useSharedValue(0);

  // Position arrives in one-second jumps from the Pod, so the bar is told to
  // cover the next second linearly rather than stepping on each update. A
  // bigger jump than that is a seek or a track change and lands immediately.
  useEffect(() => {
    const stepping = Math.abs(progress - fill.value) * duration <= 2 && playbackState === 'playing';
    fill.value = stepping
      ? withTiming(progress, { duration: Motion.duration.tick, easing: Easing.linear })
      : progress;
  }, [progress, duration, playbackState]);

  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(fill.value, 0.0001) }] }));

  if (!song) return null;

  const seed = song.albumId || song.album || song.title;
  const hue = hueFor(seed);
  const isPlaying = playbackState === 'playing';

  return (
    // Slides up with the first track instead of appearing under your thumb,
    // and slides back out when playback is cleared — the bar changes the height
    // of everything above it, so it must never just pop.
    <Animated.View
      entering={reduced ? FadeIn.duration(200) : SlideInDown.duration(320)}
      exiting={reduced ? FadeOut.duration(160) : SlideOutDown.duration(240)}
    >
      <LinearGradient
        colors={[washColor(hue), tintColor(hue)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={s.wrap}
      >
        <Pressed
          style={s.row}
          onPress={() => router.navigate('/playing')}
          label="Open now playing"
          // Barely a dip: this is a wide, thin bar sitting on the tab bar, and
          // the same 3% a row gets reads as the whole shelf flexing.
          scaleTo={0.985}
        >
          <AlbumArt uri={art} seedKey={seed} size={38} />
          <View style={s.info}>
            <Text style={s.title} numberOfLines={1}>{song.title}</Text>
            <Text style={s.artist} numberOfLines={1}>{song.artist}</Text>
          </View>
          <Pressed
            onPress={() => router.push('/playing/queue')}
            label="Queue"
            scaleTo={0.85}
            style={s.queueHit}
          >
            <Icon name="queue" size={17} color="rgba(255,255,255,0.8)" />
          </Pressed>
          <Fab size={34} playing={isPlaying} onPress={isPlaying ? pause : play} />
        </Pressed>
        <View style={s.track}>
          <Animated.View style={[s.fill, fillStyle]} />
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    marginHorizontal: 8,
    marginBottom: 2,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 10, paddingVertical: 8 },
  info: { flex: 1, minWidth: 0 },
  title: { fontFamily: Font.bold, fontSize: Type.callout, color: Palette.text },
  artist: { fontFamily: Font.regular, fontSize: Type.micro, color: 'rgba(255,255,255,0.65)', marginTop: 1 },
  queueHit: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  track: { height: 2, backgroundColor: 'rgba(255,255,255,0.14)' },
  // Full-width and scaled from the left, so advancing the bar costs no layout.
  fill: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#fff', transformOrigin: 'left',
  },
});
