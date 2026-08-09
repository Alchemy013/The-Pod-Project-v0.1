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

export const Font = {
  regular: 'SplineSans_400Regular',
  medium: 'SplineSans_500Medium',
  bold: 'SplineSans_600SemiBold',
  heading: 'SplineSans_700Bold',
  /** Numbers, IDs, format readouts. */
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }) as string,
} as const;
