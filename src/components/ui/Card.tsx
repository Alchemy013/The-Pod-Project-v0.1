import { StyleSheet, View, ViewProps } from 'react-native';
import { Palette, Radius } from '@/constants/theme';

export function Card({ style, ...props }: ViewProps) {
  return <View style={[s.card, style]} {...props} />;
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: 16,
  },
});
