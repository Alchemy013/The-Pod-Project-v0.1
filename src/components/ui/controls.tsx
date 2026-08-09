import { ReactNode, useEffect } from 'react';
import {
  Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, TextStyle, View, ViewStyle,
} from 'react-native';
import Animated, {
  Easing, FadeIn, FadeOut, ReduceMotion, SharedValue, runOnJS, useAnimatedProps,
  useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, type IconName } from '@/components/ui/icons';
import { Motion, Palette, Radius, Font, Type } from '@/constants/theme';
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
  children, onPress, onLongPress, style, scaleTo = 0.97, disabled, label, selected, hitSlop,
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
  /** For bare icon targets whose glyph is smaller than a 44pt touch area. */
  hitSlop?: number;
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
      hitSlop={hitSlop}
      onPressIn={() => { pressed.value = withTiming(1, { duration: Motion.duration.press, easing: Easing.out(Easing.quad) }); }}
      onPressOut={() => { pressed.value = withSpring(0, Motion.spring.press); }}
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
    // Opted back in under reduced motion: this cross-fade reports playback
    // state, so losing it would leave the glyph mid-swap on the app's single
    // most-tapped control.
    p.value = withTiming(playing ? 1 : 0, {
      duration: Motion.duration.glyph, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never,
    });
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
      grabbed.value = withSpring(1, Motion.spring.grab);
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
      grabbed.value = withSpring(0, Motion.spring.grab);
      runOnJS(onCommit)(fraction.value);
      if (onScrubStart) runOnJS(onScrubStart)(false);
    });

  // scaleY, never `height`: a height animation re-runs layout for the track on
  // every frame of the grab spring. An 8px track scaled to 0.5 is pixel-identical
  // to a 4px one and costs nothing but a composite.
  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: 0.5 + grabbed.value * 0.5 }],
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
  const reduced = useReducedMotion();
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

  // Decorative "this is live" ring. Under reduced motion the status dot it sits
  // behind already says the same thing, so it simply doesn't render — a disabled
  // repeat would otherwise strand the ring mid-travel.
  if (reduced) return null;

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
  const reduced = useReducedMotion();
  const scale = useSharedValue(from / BAR_H);
  useEffect(() => {
    // Under reduced motion the three bars hold their opening heights: still a
    // deliberately uneven meter that marks the playing row, with no movement.
    if (reduced) return;
    scale.value = withRepeat(
      withTiming(to / BAR_H, { duration: ms, easing: Easing.inOut(Easing.ease) }), -1, true,
    );
  }, [reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }));
  return (
    <Animated.View
      style={[{ width: 2, height: BAR_H, backgroundColor: color, transformOrigin: 'bottom' }, style]}
    />
  );
}

/**
 * Format mark for a browse row: `24/192` in mono, accent-tinted when the record
 * is better than CD.
 *
 * Deliberately *not* a `SpecBadge`. A badge's filled ground would compete with
 * the row's own press feedback, and a filled accent pill in every other row
 * would break the one-accent-gesture-per-surface rule. This is a text mark, not
 * a control — `accentHi` rather than `accent` keeps it quieter than anything
 * tappable.
 *
 * Callers must render it only when it says something. A mark on every row is
 * wallpaper; a mark on the good copies is a reason to pick one.
 */
export function FormatMark({ spec, hiRes }: { spec: string; hiRes: boolean }) {
  return <Text style={[s.formatMark, hiRes && { color: Palette.accentHi }]}>{spec}</Text>;
}

function clockText(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/**
 * The trailing slot on a track row: a level meter while this row is the one
 * playing, the track's duration otherwise.
 *
 * The two cross-fade rather than swapping, inside a **fixed-width** box. Both
 * parts matter. A hard swap on a row you are looking at when you press play
 * reads as a glitch; and because a meter and a `3:45` are different widths,
 * without the fixed box the row's title would jump sideways at the same moment.
 * The two states are absolutely positioned so they can overlap mid-fade without
 * pushing each other around.
 */
export function TrackTrailing({ playing, duration }: { playing: boolean; duration: number }) {
  return (
    <View style={s.trailing}>
      {playing ? (
        <Animated.View
          key="bars"
          style={s.trailingItem}
          entering={FadeIn.duration(Motion.duration.fadeIn)}
          exiting={FadeOut.duration(Motion.duration.fadeOut)}
        >
          <PlayingBars />
        </Animated.View>
      ) : (
        <Animated.View
          key="dur"
          style={s.trailingItem}
          entering={FadeIn.duration(Motion.duration.fadeIn)}
          exiting={FadeOut.duration(Motion.duration.fadeOut)}
        >
          <Text style={s.trailingDur}>{clockText(duration)}</Text>
        </Animated.View>
      )}
    </View>
  );
}

/**
 * A placeholder block that breathes, for content whose shape we know before its
 * data arrives.
 *
 * This is the app's only loading affordance — there is no spinner, because the
 * layout is always known ahead of the data and a centred spinner both throws
 * that away and reads as Android. Deliberately low-contrast: on a #0A0A0A
 * ground a 0.05–0.10 white range is plenty, and a skeleton that pulses hard
 * reads as a broken image rather than as pending content.
 */
export function Skeleton({ width, height, radius = Radius.sm, style }: {
  width: number | `${number}%`;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    p.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true,
    );
  }, [reduced]);

  // Under reduced motion this holds at the starting 0.05 and simply doesn't
  // breathe. It must stay *visible* — with the animation gone the block is
  // carrying the "something is coming" message on its own.
  const animated = useAnimatedStyle(() => ({ opacity: 0.05 + p.value * 0.05 }));

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: Palette.text }, animated, style]}
    />
  );
}

/** The shape of a track or album row, for a list that hasn't arrived yet. */
export function SkeletonRow({ art = 48 }: { art?: number }) {
  return (
    <View style={s.skelRow}>
      <Skeleton width={art} height={art} radius={Radius.sm} />
      <View style={{ flex: 1, gap: 7 }}>
        <Skeleton width="62%" height={13} radius={Radius.xs} />
        <Skeleton width="40%" height={11} radius={Radius.xs} />
      </View>
      <Skeleton width={26} height={11} radius={Radius.xs} />
    </View>
  );
}

/** The shape of a Home shelf card. */
export function SkeletonCard({ size = 142 }: { size?: number }) {
  return (
    <View style={{ width: size, gap: 8 }}>
      <Skeleton width={size} height={size} radius={Radius.md} />
      <Skeleton width={size * 0.8} height={12} radius={Radius.xs} />
      <Skeleton width={size * 0.5} height={11} radius={Radius.xs} />
    </View>
  );
}

const s = StyleSheet.create({
  chip: { height: 34, paddingHorizontal: 15, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: Type.callout },
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
  scrubTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
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
  sectionTitle: { fontFamily: Font.heading, fontSize: Type.title3, color: Palette.text },
  sectionAction: { fontFamily: Font.medium, fontSize: Type.caption, color: Palette.textMuted },

  overline: {
    fontFamily: Font.bold, fontSize: Type.micro, letterSpacing: 1, textTransform: 'uppercase',
    color: Palette.textMuted,
  },

  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.sm },
  badgeText: { fontFamily: Font.mono, fontSize: Type.micro, fontWeight: '600' },

  pill: { paddingVertical: 14, borderRadius: Radius.pill, alignItems: 'center' },
  pillText: { fontFamily: Font.bold, fontSize: Type.body },

  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 13 },

  // Wide enough for the longest duration a record realistically carries
  // (`12:34`), so the meter and the clock never resize the row between them.
  trailing: { width: 42, height: 16, alignItems: 'flex-end', justifyContent: 'center' },
  trailingItem: { position: 'absolute', right: 0, alignItems: 'flex-end', justifyContent: 'center' },
  trailingDur: { fontFamily: Font.mono, fontSize: Type.caption, color: Palette.textMuted },

  // Mirrors the `row` geometry used by the Library and album track lists, so a
  // skeleton list and the real list occupy the same space and nothing shifts
  // when the data lands.
  skelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },

  formatMark: { fontFamily: Font.mono, fontSize: Type.micro, color: Palette.textMuted },
});
