import { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Motion, Radius } from '@/constants/theme';
import { hueFor, ringColor, tintColor, washColor } from '@/utils/albumColor';

type Props = {
  uri?: string | null;
  /** Stable seed for the hue — album id where there is one, else the title. */
  seedKey: string;
  size: number;
  radius?: number;
  /** Hero art (album header, player) sits on a drop shadow. */
  elevated?: boolean;
  style?: object;
};

/**
 * The single art component: a hue-washed gradient block with a concentric
 * ring, and the real artwork layered on top once it arrives over BLE. There is
 * never an empty grey square, and late art fades in without a layout shift.
 */
export const AlbumArt = memo(function AlbumArt({ uri, seedKey, size, radius = Radius.sm, elevated, style }: Props) {
  const hue = hueFor(seedKey);
  const ring = size * 0.32;
  const dot = size * 0.08;

  // The cover is held fully transparent until the decode completes, so a
  // partially-painted image can never be shown over the hue block. Driving the
  // fade off `onLoad` rather than expo-image's own `transition` matters: that
  // one begins as soon as the first bytes land, which is exactly the
  // half-drawn state we're avoiding.
  const [loaded, setLoaded] = useState(false);
  const opacity = useSharedValue(0);

  // A recycled row can hand this component a new uri, so the reveal has to
  // reset — otherwise the previous cover stays visible under the new one.
  useEffect(() => { setLoaded(false); opacity.value = 0; }, [uri]);

  useEffect(() => {
    if (loaded) {
      // Opted back in: this is an opacity reveal, not movement, and without it
      // late-arriving artwork pops in over the hue block.
      opacity.value = withTiming(1, {
        duration: Motion.duration.reveal, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never,
      });
    }
  }, [loaded]);

  const coverStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    // Shadow lives on the wrapper: the gradient clips its children
    // (overflow:hidden for the artwork corners), which would clip the shadow
    // too if they were the same view.
    <View style={[{ width: size, height: size }, elevated && s.elevated, style]}>
      <LinearGradient
        colors={[washColor(hue), tintColor(hue)]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: ring,
            height: ring,
            borderRadius: ring / 2,
            borderWidth: Math.max(2, size * 0.02),
            borderColor: ringColor(hue),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: ringColor(hue) }} />
        </View>

        {uri ? (
          <Animated.View style={[StyleSheet.absoluteFill, coverStyle]} pointerEvents="none">
            <Image
              source={{ uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              // No `transition` here on purpose — see the note above.
              onLoad={() => setLoaded(true)}
            />
          </Animated.View>
        ) : null}
      </LinearGradient>
    </View>
  );
// Every prop is a primitive, so this holds cheaply — and it keeps the gradient,
// the ring and the decoded image out of re-renders driven by anything else on
// the screen: a search keystroke, a list re-render, the once-a-second position
// tick behind the player artwork.
});

const s = StyleSheet.create({
  elevated: {
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 20 },
  },
});
