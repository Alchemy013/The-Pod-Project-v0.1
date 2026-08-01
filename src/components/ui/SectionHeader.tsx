import { StyleSheet, Text } from 'react-native';
import { Palette } from '@/constants/theme';

export function SectionHeader({ children }: { children: string }) {
  return <Text style={s.title}>{children}</Text>;
}

const s = StyleSheet.create({
  title: {
    color: Palette.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.0,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
});
