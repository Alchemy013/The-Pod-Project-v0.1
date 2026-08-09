import { ReactNode, useEffect } from 'react';
import {
  Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, TextStyle, View, ViewStyle,
} from 'react-native';
import Animated, {
  Easing, SharedValue, runOnJS, useAnimatedProps, useAnimatedStyle,
  useSharedValue, withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, type IconName } from '@/components/ui/icons';
import { Palette, Radius, Font } from '@/constants/theme';
import { hueFor, washColor } from '@/utils/albumColor';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/**
 * A Pressable that physically responds to touch: it dips in scale and opacity
 * on press-in and springs back on release. This is the app's single source of
 * tap feedback — rows, cards and tiles all route through it, so the whole app
 * reacts the same way instead of some surfaces feeling dead.
 *
 * Spring rather than timing on the way back: a release should overshoot very
 * slightly, which is what makes it read as a physical button rather than a
 * fading rectangle.
 */
export function Pressed({
  children, onPress, onLongPress, style, scaleTo = 0.97, disabled, label, selected,
}: {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Large tiles want a subtler dip than small rows. */
  scaleTo?: number;
  disabled?: boolean;
  label?: string;
  selected?: boolean;
}) {
  const pressed = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - scaleTo) }],
    // A shallow dip. At 0.35 the whole row visibly flickered on every tap,
    // which reads as a glitch rather than as feedback.
    opacity: 1 - pressed.value * 0.14,
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      // Without this every row you touch on the way into a scroll flashes its
      // press state before the ScrollView steals the gesture. 55ms is below the
      // threshold where a real tap feels delayed, and long enough that a flick
      // never lights anything up.
      unstable_pressDelay={55}
      onPressIn={() => { pressed.value = withTiming(1, { duration: 70, easing: Easing.out(Easing.quad) }); }}
      onPressOut={() => { pressed.value = withSpring(0, { damping: 18, stiffness: 420, mass: 0.45 }); }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Pill filter. One accent-filled when on, rail-grey otherwise. */
export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressed
      style={[s.chip, { backgroundColor: on ? Palette.accent : Palette.rail }]}
      onPress={onPress}
      scaleTo={0.94}
      label={label}
      selected={on}
    >
      <Text style={[s.chipText, { color: on ? Palette.accentText : '#d6d6d8', fontFamily: on ? Font.bold : Font.medium }]}>
        {label}
      </Text>
    </Pressed>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // A horizontal ScrollView still stretches on the *cross* axis, so inside
      // a column parent it silently claims every leftover pixel of height —
      // which is what wedged a ~350px hole between the chips and the list.
      // It must be told to size to its content.
      style={s.chipScroll}
      contentContainerStyle={s.chipRow}
    >
      {children}
    </ScrollView>
  );
}

/**
 * The one accent gesture per surface: a circular orange play/pause control.
 * Everything else on the screen stays monochrome.
 *
 * The two glyphs are stacked and cross-faded rather than swapped, because a
 * hard swap on the single most-tapped control in the app is the one place a
 * missing transition is unmissable. Each one also scales through the change,
 * so the outgoing glyph shrinks away instead of just dissolving.
 */
export function Fab({ size, playing, onPress }: { size: number; playing: boolean; onPress: () => void }) {
  const p = useSharedValue(playing ? 1 : 0);
  useEffect(() => {
    p.value = withTiming(playing ? 1 : 0, { duration: 190, easing: Easing.out(Easing.cubic) });
  }, [playing]);

  const playStyle = useAnimatedStyle(() => ({
    opacity: 1 - p.value,
    transform: [{ scale: 1 - p.value * 0.35 }],
  }));
  const pauseStyle = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ scale: 0.65 + p.value * 0.35 }],
  }));

  return (
    <Pressed
      onPress={onPress}
      label={playing ? 'Pause' : 'Play'}
      // The one accent control on the surface, so it gets the most pronounced
      // press of anything in the app.
      scaleTo={0.9}
      style={[s.fab, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, s.center, playStyle]} pointerEvents="none">
        {/* Nudge the play triangle so it reads optically centred in the circle. */}
        <Icon name="play" size={size * 0.42} color={Palette.accentText} style={{ marginLeft: size * 0.04 }} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, s.center, pauseStyle]} pointerEvents="none">
        <Icon name="pause" size={size * 0.42} color={Palette.accentText} />
      </Animated.View>
    </Pressed>
  );
}

/**
 * Read-only text whose content is written from the UI thread.
 *
 * A scrubber has to show a live number, and doing that with `setState` puts a
 * React render on the JS thread for every touch-move — which on Now Playing
 * means repainting the gradient, the artwork and the lyric sheet 60 times a
 * second while your thumb is down. Writing the `text` prop through
 * `useAnimatedProps` keeps the whole drag on the UI thread. `format` must be a
 * worklet.
 */
export function LiveText({ value, format, style }: {
  value: SharedValue<number>;
  format: (v: number) => string;
  style?: StyleProp<TextStyle>;
}) {
  const animatedProps = useAnimatedProps(() => ({ text: format(value.value) }) as any);
  return (
    <AnimatedTextInput
      editable={false}
      // The initial paint comes from here; every later one from animatedProps.
      defaultValue={format(value.value)}
      accessible={false}
      style={[s.liveText, style]}
      animatedProps={animatedProps}
    />
  );
}

/**
 * The app's one draggable track — seek bar and volume bar are the same object
 * with different labels around it.
 *
 * Everything about the drag lives on the UI thread: the caller hands in a
 * `fraction` shared value which this writes to, and reads for its own fill and
 * knob. Nothing here calls `setState`. `onCommit` fires once, on release.
 *
 * Grabbing it thickens the track and grows the knob, the way the iOS system
 * scrubber does — it is the only feedback that tells you the bar has taken
 * your finger, which matters because the fill itself barely moves at first.
 */
export function Scrubber({ fraction, onCommit, onScrubStart, knob = true, liveMs = 0, style }: {
  /** 0–1, owned by the caller so labels can read it without a re-render. */
  fraction: SharedValue<number>;
  onCommit: (fraction: number) => void;
  /** Lets the caller freeze whatever normally writes `fraction` while dragging. */
  onScrubStart?: (dragging: boolean) => void;
  knob?: boolean;
  /**
   * Also fire `onCommit` during the drag, at most this often. Volume wants it
   * (you have to hear the change to aim), seeking does not — a seek per frame
   * would be a BLE write per frame.
   */
  liveMs?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const width = useSharedValue(0);
  const grabbed = useSharedValue(0);
  const lastLive = useSharedValue(0);

  const setFromX = (x: number) => {
    'worklet';
    if (width.value <= 0) return;
    fraction.value = Math.min(Math.max(x / width.value, 0), 1);
  };

  const pan = Gesture.Pan()
    // Respond to a plain tap too: on a 4px-tall bar, requiring travel before
    // anything happens makes it feel like the touch was ignored.
    .minDistance(0)
    .onBegin((e) => {
      grabbed.value = withSpring(1, GRAB_SPRING);
      if (onScrubStart) runOnJS(onScrubStart)(true);
      setFromX(e.x);
    })
    .onUpdate((e) => {
      setFromX(e.x);
      if (liveMs <= 0) return;
      const now = Date.now();
      if (now - lastLive.value < liveMs) return;
      lastLive.value = now;
      runOnJS(onCommit)(fraction.value);
    })
    .onFinalize(() => {
      grabbed.value = withSpring(0, GRAB_SPRING);
      runOnJS(onCommit)(fraction.value);
      if (onScrubStart) runOnJS(onScrubStart)(false);
    });

  const trackStyle = useAnimatedStyle(() => ({
    height: 4 + grabbed.value * 4,
    borderRadius: 2 + grabbed.value * 2,
  }));
  // scaleX from the left edge, never `width`: a percentage width re-runs layout
  // for the track on every frame, which is exactly the judder this replaces.
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(fraction.value, 0.0001) }] }));
  const knobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: fraction.value * width.value },
      { scale: 1 + grabbed.value * 0.5 },
    ],
    opacity: knob ? 1 : 0,
  }));

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[s.scrubHit, style]}
        onLayout={(e) => { width.value = e.nativeEvent.layout.width; }}
      >
        <Animated.View style={[s.scrubTrack, trackStyle]}>
          <Animated.View style={[s.scrubFill, fillStyle]} />
        </Animated.View>
        <Animated.View style={[s.scrubKnob, knobStyle]} pointerEvents="none" />
      </View>
    </GestureDetector>
  );
}

const GRAB_SPRING = { damping: 20, stiffness: 300, mass: 0.5 };

/** Translucent round icon button used on washed headers. */
export function IconCircle({ name, onPress, color, background, size = 36, iconSize = 17, label }: {
  name: IconName;
  onPress: () => void;
  color?: string;
  background?: string;
  size?: number;
  iconSize?: number;
  label?: string;
}) {
  return (
    <Pressed
      onPress={onPress}
      label={label ?? name}
      scaleTo={0.88}
      style={[
        s.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: background ?? 'rgba(0,0,0,0.42)' },
      ]}
    >
      <Icon name={name} size={iconSize} color={color ?? Palette.text} />
    </Pressed>
  );
}

/**
 * Colour wash: the record's hue bleeding out of the top of the canvas.
 * Absolutely positioned and non-interactive, so it sits behind the content.
 */
export function HeaderWash({ seedKey, height }: { seedKey: string; height: number }) {
  const hue = hueFor(seedKey);
  return (
    <LinearGradient
      colors={[washColor(hue), 'rgba(10,10,10,0)']}
      style={[s.wash, { height }]}
      pointerEvents="none"
    />
  );
}

/** Section title in the feed idiom — 19px, with an optional right-hand action. */
export function SectionTitle({ children, action, onAction }: {
  children: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s.sectionTitleRow}>
      <Text style={s.sectionTitle}>{children}</Text>
      {action && (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text style={s.sectionAction}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Small uppercase label above a group of rows. */
export function Overline({ children, style }: { children: string; style?: TextStyle }) {
  return <Text style={[s.overline, style]}>{children}</Text>;
}

/** Monospace format readout — `FLAC`, `24/192`. Accent variant for hi-res. */
export function SpecBadge({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <View style={[s.badge, { backgroundColor: accent ? Palette.accentWash : Palette.rail }]}>
      <Text style={[s.badgeText, { color: accent ? Palette.accentHi : Palette.textSecondary }]}>{label}</Text>
    </View>
  );
}

/** Full-width rounded button. `variant` picks the ground it sits on. */
export function PillButton({ label, onPress, variant = 'outline', style }: {
  label: string;
  onPress: () => void;
  variant?: 'accent' | 'outline' | 'danger';
  style?: ViewStyle;
}) {
  const ground =
    variant === 'accent' ? { backgroundColor: Palette.accent }
    : variant === 'danger' ? { backgroundColor: Palette.dangerWash, borderWidth: 1, borderColor: 'rgba(255,69,58,0.2)' }
    : { borderWidth: 1, borderColor: Palette.inactive };
  const color = variant === 'danger' ? Palette.danger : Palette.text;

  return (
    <Pressed onPress={onPress} label={label} scaleTo={0.96} style={[s.pill, ground, style]}>
      <Text style={[s.pillText, { color }]}>{label}</Text>
    </Pressed>
  );
}

/**
 * Expanding ring that fades as it grows — the design's `v2pulse` keyframe.
 * Sits behind a status dot or the app mark to say "this is live", so it is
 * absolutely positioned and must be given the same geometry as its parent.
 */
export function Pulse({ size, radius, color = Palette.accent, active = true, durationMs = 2600 }: {
  size: number;
  radius: number;
  color?: string;
  active?: boolean;
  durationMs?: number;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (!active) { p.value = 0; return; }
    p.value = withRepeat(withTiming(1, { duration: durationMs, easing: Easing.out(Easing.quad) }), -1, false);
  }, [active, durationMs]);

  // Fully faded by 70% of the travel, matching the keyframe's 70% stop —
  // the ring disappears before it reaches its largest, not at it.
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + p.value }],
    opacity: active ? 0.5 * (1 - Math.min(1, p.value / 0.7)) : 0,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', width: size, height: size, borderRadius: radius, borderWidth: 1, borderColor: color }, style]}
    />
  );
}

/** Three bars pulsing out of phase, marking the row that is currently playing. */
export function PlayingBars({ color = Palette.accent }: { color?: string }) {
  return (
    <View style={s.bars}>
      {BAR_PHASES.map((phase, i) => <Bar key={i} color={color} {...phase} />)}
    </View>
  );
}

// from/to heights and period per bar — deliberately unequal so the three never
// line up, which is what makes it read as a level meter rather than a loader.
const BAR_H = 13;
const BAR_PHASES = [
  { from: 3, to: 12, ms: 900 },
  { from: 11, to: 4, ms: 780 },
  { from: 6, to: 13, ms: 1040 },
];

// Scale, not height: animating `height` re-runs layout on every frame for every
// bar, which is what made the meter judder next to a scrolling list. A bar of
// fixed height scaled from its base is pure compositing.
function Bar({ from, to, ms, color }: { from: number; to: number; ms: number; color: string }) {
  const scale = useSharedValue(from / BAR_H);
  useEffect(() => {
    scale.value = withRepeat(
      withTiming(to / BAR_H, { duration: ms, easing: Easing.inOut(Easing.ease) }), -1, true,
    );
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }));
  return (
    <Animated.View
      style={[{ width: 2, height: BAR_H, backgroundColor: color, transformOrigin: 'bottom' }, style]}
    />
  );
}

const s = StyleSheet.create({
  chip: { height: 34, paddingHorizontal: 15, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 13 },
  chipScroll: { flexGrow: 0, flexShrink: 0 },
  chipRow: { gap: 8, paddingHorizontal: 20, paddingBottom: 6, alignItems: 'center' },

  fab: {
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Palette.accent,
    shadowOpacity: 0.38,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 8 },
  },

  circle: { alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },

  // A TextInput carries platform padding and a baseline offset that a Text
  // does not; zeroing them is what makes it sit where the Text it replaced did.
  liveText: { padding: 0, margin: 0 },

  scrubHit: { height: 26, justifyContent: 'center' },
  scrubTrack: { backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
  scrubFill: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#fff',
    // Anchored left so scaleX grows the fill rightwards from the start of the
    // track rather than out from its middle.
    transformOrigin: 'left',
  },
  scrubKnob: {
    position: 'absolute', left: 0, marginLeft: -6,
    width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff',
  },

  wash: { position: 'absolute', top: 0, left: 0, right: 0 },

  sectionTitleRow: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    paddingTop: 22, paddingBottom: 12,
  },
  sectionTitle: { fontFamily: Font.heading, fontSize: 19, color: Palette.text },
  sectionAction: { fontFamily: Font.medium, fontSize: 12, color: Palette.textMuted },

  overline: {
    fontFamily: Font.bold, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
    color: Palette.textMuted,
  },

  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.sm },
  badgeText: { fontFamily: Font.mono, fontSize: 11, fontWeight: '600' },

  pill: { paddingVertical: 14, borderRadius: 26, alignItems: 'center' },
  pillText: { fontFamily: Font.bold, fontSize: 14.5 },

  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 13 },
});
