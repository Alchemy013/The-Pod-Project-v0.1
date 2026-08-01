import { ReactNode } from 'react';
import { StyleSheet, Text, TextStyle } from 'react-native';
import { Palette } from '@/constants/theme';

export function RowTitle({ style, children }: { style?: TextStyle; children: ReactNode }) {
  return <Text style={[s.title, style]} numberOfLines={1}>{children}</Text>;
}

export function RowSubtitle({ style, children }: { style?: TextStyle; children: ReactNode }) {
  return <Text style={[s.subtitle, style]} numberOfLines={1}>{children}</Text>;
}

const s = StyleSheet.create({
  title: { color: Palette.text, fontSize: 15, fontWeight: '600' },
  subtitle: { color: Palette.textSecondary, fontSize: 13, marginTop: 2 },
});
