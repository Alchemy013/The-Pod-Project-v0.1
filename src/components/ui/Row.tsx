import { ReactNode } from 'react';
import { StyleSheet, Text, TextStyle } from 'react-native';
import { Palette, Font } from '@/constants/theme';

export function RowTitle({ style, children }: { style?: TextStyle; children: ReactNode }) {
  return <Text style={[s.title, style]} numberOfLines={1}>{children}</Text>;
}

export function RowSubtitle({ style, children }: { style?: TextStyle; children: ReactNode }) {
  return <Text style={[s.subtitle, style]} numberOfLines={1}>{children}</Text>;
}

const s = StyleSheet.create({
  title: { color: Palette.text, fontFamily: Font.bold, fontSize: 15 },
  subtitle: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 12, marginTop: 2 },
});
