import '@/global.css';

// Modernist — dark, zero-radius, Archivo throughout, one accent doing all the pointing.
export const Palette = {
  bg: '#0A0A0A',
  divider: '#2d2b2b',
  border: '#444141',
  borderFaint: '#605d5d',
  text: '#f8f4f4',
  textSecondary: '#9b9797',
  textMuted: '#605d5d',
  accent: '#ec3013',
  accentText: '#ffffff',
  danger: '#FF453A',
  warning: '#FFD60A',
} as const;

// Design has zero border radius everywhere — kept as a single knob so any
// leftover Radius.* usage stays flat without touching every call site.
export const Radius = {
  sm: 0,
  md: 0,
  lg: 0,
  pill: 0,
} as const;

export const Font = {
  regular: 'Archivo_400Regular',
  medium: 'Archivo_600SemiBold',
  bold: 'Archivo_700Bold',
  heading: 'Archivo_800ExtraBold',
} as const;
