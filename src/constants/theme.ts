import { Platform } from 'react-native';

// v2 — feed-led, full-bleed, orange. Sourced from "ThePod App v2" in the
// Claude Design project (Mobile app design system). Near-black base, warmer
// elevation steps, one accent (#EE3211) doing all the pointing, Spline Sans
// for text and a monospace face for hi-fi readouts.
export const Palette = {
  bg: '#0A0A0A',
  surface: '#141416',
  rail: '#1F1F22',
  control: '#2A2A2E',
  inactive: '#3a3a3e',

  text: '#ffffff',
  textSecondary: '#a1a1a6',
  textMuted: '#6b6b70',

  accent: '#EE3211',
  accentHi: '#FF6B4A',
  accentText: '#ffffff',
  /** Deep accent tint used behind hi-res / format badges. */
  accentWash: '#2A100C',

  success: '#32D74B',
  warning: '#FFD60A',
  danger: '#FF453A',
  /** Destructive button ground (Disconnect / Forget). */
  dangerWash: '#2C0A0A',

  // Kept so the older rule-based screens keep compiling; both map onto the
  // v2 elevation steps rather than the retired grey rules.
  divider: '#1F1F22',
  border: '#2A2A2E',
  borderFaint: '#3a3a3e',
} as const;

export const Radius = {
  xs: 5,
  sm: 7,
  md: 10,
  lg: 12,
  card: 16,
  /** Buttons and chips are fully rounded — half the element height. */
  pill: 999,
} as const;

/**
 * The type scale. Nine steps, replacing the 24 hand-picked sizes — six of them
 * half-point — that the app grew before this existed.
 *
 * Pick by **role**, not by how big it looks next to the thing above it. That
 * habit is what produced `14` and `14.5` doing the same job in different files.
 * If a new screen seems to need a step that isn't here, it almost certainly
 * wants an existing step in a different weight (`Font.medium` vs `Font.bold`)
 * or colour (`Palette.textSecondary`), not a new size.
 */
export const Type = {
  /** Big numeric readouts only — battery percentage, the About mark. */
  display: 40,
  /** A screen's hero title: album name, now-playing track, onboarding panel. */
  title1: 28,
  /** A screen's own title: "Your Library", the Home greeting. */
  title2: 22,
  /** Section headings inside a screen — the feed's shelf titles. */
  title3: 19,
  /** Row titles and anything that needs to read as the primary line. */
  headline: 15,
  /** Body copy and settings-row labels. */
  body: 14,
  /** The second line of a row; secondary controls. */
  callout: 13,
  /** Sub-text, durations, metadata. */
  caption: 12,
  /** Overlines, badges, spec readouts. The floor — nothing smaller. */
  micro: 11,
} as const;

/**
 * Named motion. The five springs are **deliberately different** — this is not a
 * consolidation, it's a naming pass, so a sixth one can't get copy-pasted in
 * without someone noticing it duplicates an existing role.
 *
 * Read them as a scale of weight. `press` is the lightest and snaps back almost
 * without overshoot; `settle` is the heaviest and visibly rocks into place. The
 * rule when adding a control: pick the spring whose *role* matches, don't invent
 * a triple that happens to look right on the one screen you're testing.
 */
export const Motion = {
  spring: {
    /** `Pressed` releasing. Fast, near-critically damped — feedback, not a bounce. */
    press: { damping: 18, stiffness: 420, mass: 0.45 },
    /** Scrubber thickening under a finger and relaxing after it. */
    grab: { damping: 20, stiffness: 300, mass: 0.5 },
    /** Tab glyph becoming active. The most overshoot in the app, on purpose —
     *  a tab switch is otherwise an instant swap with nothing acknowledging it. */
    tab: { damping: 12, stiffness: 260, mass: 0.5 },
    /** Album art returning after a swipe that didn't clear the threshold. */
    swipe: { damping: 17, stiffness: 210, mass: 0.6 },
    /** Album art resizing on play/pause — the slowest, like a needle settling. */
    settle: { damping: 16, stiffness: 140, mass: 0.9 },
  },
  duration: {
    /** Press-in dip. Deliberately shorter than the release spring. */
    press: 70,
    /** Icon swapping to another icon in place. */
    glyph: 190,
    /** The outgoing half of a cross-fade — shorter than `fadeIn`, so the two
     *  are never fully absent at the same moment. */
    fadeOut: 200,
    /** The incoming half of a cross-fade. */
    fadeIn: 240,
    /** Art or content revealing once it has decoded. */
    reveal: 260,
    /** One second of local playback clock. The Pod only pushes position on real
     *  events, so progress is drawn between them at exactly this rate. */
    tick: 1000,
  },
} as const;

export const Font = {
  regular: 'SplineSans_400Regular',
  medium: 'SplineSans_500Medium',
  bold: 'SplineSans_600SemiBold',
  heading: 'SplineSans_700Bold',
  /** Numbers, IDs, format readouts. */
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }) as string,
} as const;
