import { StyleSheet, Text } from 'react-native';
import { Palette, Font } from '@/constants/theme';

export function SectionHeader({ children }: { children: string }) {
  return <Text style={s.title}>{children}</Text>;
}

const s = StyleSheet.create({
  title: {
    color: Palette.textSecondary,
    fontFamily: Font.bold,
    fontSize: 9,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
});
