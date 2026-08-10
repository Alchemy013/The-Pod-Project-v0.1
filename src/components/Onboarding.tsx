import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeIn, interpolateColor, useAnimatedStyle, useSharedValue, withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Motion, Palette, Font, Radius, Type } from '@/constants/theme';
import { PillButton, Pulse } from '@/components/ui/controls';

const MARK = 126;

// Three panels, ending on the Bluetooth explainer. The last one exists so the
// iOS permission sheet arrives with a reason attached rather than cold — that
// prompt is the app's single hardest drop-off point, and it only appears once.
//
// The copy is deliberately **not** a spec sheet. It used to name FLAC, DSD, the
// PCM5122 and the shape of the BLE protocol, none of which mean anything to
// someone opening the app for the first time — and all of which are still there
// to be discovered on Now Playing and the Pod tab, where they land as a reward
// rather than as a wall. This is an invitation; the details can wait.
const STEPS = [
  {
    title: 'Welcome to ThePod',
    body: 'Your own music, on a player built to do one thing properly. No feeds, no accounts, no algorithm.',
  },
  {
    title: 'Your phone is the remote',
    body: 'Browse your collection and pick something. It plays on the Pod, so you can put your phone away and the music keeps going.',
  },
  {
    title: 'Let’s get connected',
    body: 'ThePod uses Bluetooth to find your player and stay in touch with it. That’s the only thing it’s used for.',
  },
] as const;

// Onboarding is seen once, on a screen with nothing else happening, so it sits
// outside the app's usual sub-300ms budget on purpose — the same rule that lets
// marketing and explanatory motion run long. Anywhere you can reach twice in a
// session, this would be far too slow.
const COPY_FADE_MS = 700;

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

        {/* Keyed on step so the copy re-enters on every advance. A plain, slow
            opacity fade — no vertical travel. Entering, so `ease-out`: it
            arrives quickly and settles, rather than creeping in from nothing.
            Nothing here animates layout, so the panel below never shifts. */}
        <Animated.View
          key={step}
          entering={FadeIn.duration(COPY_FADE_MS).easing(Easing.out(Easing.quad))}
          style={s.copy}
        >
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
