import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown, interpolateColor, useAnimatedStyle, useSharedValue, withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Motion, Palette, Font, Radius, Type } from '@/constants/theme';
import { PillButton, Pulse } from '@/components/ui/controls';

const MARK = 126;

// Three panels, ending on the Bluetooth explainer. The last one exists so the
// iOS permission sheet arrives with a reason attached rather than cold — that
// prompt is the app's single hardest drop-off point, and it only appears once.
const STEPS = [
  {
    title: 'Your records, not a stream',
    body: 'The library lives on the Pod. Bit-perfect FLAC and DSD go straight into the PCM5122 — nothing re-encoded, nothing phoned home.',
  },
  {
    title: 'The phone is the remote',
    body: 'Commands and artwork travel as chunked JSON over Bluetooth LE. Audio never leaves the DAC, so the link dropping never stops the music.',
  },
  {
    title: 'Bluetooth permission',
    body: 'ThePod needs Bluetooth to find and control your device. It never uses location data and nothing leaves your network.',
  },
] as const;

const DOT_ON = 22;
const DOT_OFF = 6;

/**
 * Pager dot that stretches into the active pill instead of teleporting into it.
 *
 * This is the one place in the app that animates `width`, and it's deliberate:
 * there are three of them, they move once per tap, and this screen is shown
 * exactly once per install. The usual fix — a fixed-width slot with `scaleX` —
 * would leave 22pt gaps between the two inactive dots and change the design.
 * Don't read this as licence to animate layout in a list or under a finger.
 */
function Dot({ active }: { active: boolean }) {
  const on = useSharedValue(active ? 1 : 0);
  useEffect(() => { on.value = withSpring(active ? 1 : 0, Motion.spring.tab); }, [active]);

  const style = useAnimatedStyle(() => ({
    width: DOT_OFF + on.value * (DOT_ON - DOT_OFF),
    backgroundColor: interpolateColor(on.value, [0, 1], ['rgba(255,255,255,0.22)', Palette.accent]),
  }));

  return <Animated.View style={[s.dot, style]} />;
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;

  return (
    <LinearGradient
      colors={['#3d1109', '#150807', Palette.bg]}
      locations={[0, 0.4, 1]}
      style={[s.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}
    >
      <View style={s.body}>
        <View style={s.mark}>
          <Pulse size={MARK} radius={30} />
          <Text style={s.markLetter}>P</Text>
        </View>

        {/* Keyed on step so the copy re-enters on every advance. */}
        <Animated.View key={step} entering={FadeInDown.duration(300)} style={s.copy}>
          <Text style={s.title}>{STEPS[step].title}</Text>
          <Text style={s.text}>{STEPS[step].body}</Text>
        </Animated.View>
      </View>

      <View style={s.dots}>
        {STEPS.map((_, i) => <Dot key={i} active={i === step} />)}
      </View>

      {/* The button never asks for Bluetooth itself — dismissing onboarding
          mounts PairingScreen, and its scan is what triggers the iOS prompt. */}
      <PillButton
        label={last ? 'Allow Bluetooth' : 'Continue'}
        variant="accent"
        onPress={() => (last ? onDone() : setStep((n) => n + 1))}
        style={s.cta}
      />
      <Pressable onPress={onDone} hitSlop={8} accessibilityRole="button">
        <Text style={s.skip}>{last ? 'Not now' : 'Skip'}</Text>
      </Pressable>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 28 },

  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 36 },
  mark: {
    width: MARK, height: MARK, borderRadius: 30, backgroundColor: Palette.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Palette.accent, shadowOpacity: 0.32, shadowRadius: 30, shadowOffset: { width: 0, height: 26 },
  },
  markLetter: { fontFamily: Font.heading, fontSize: 74, lineHeight: 82, color: Palette.accentText },

  copy: { gap: 13, alignItems: 'center' },
  title: { fontFamily: Font.heading, fontSize: Type.title1, lineHeight: 33, color: Palette.text, textAlign: 'center' },
  text: {
    fontFamily: Font.regular, fontSize: Type.headline, lineHeight: 24,
    color: 'rgba(255,255,255,0.62)', textAlign: 'center',
  },

  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: 24 },
  dot: { height: 6, borderRadius: 3 },

  cta: { paddingVertical: 17, borderRadius: Radius.pill, marginBottom: 10 },
  skip: {
    fontFamily: Font.medium, fontSize: Type.body, color: 'rgba(255,255,255,0.5)',
    textAlign: 'center', paddingVertical: 8,
  },
});
