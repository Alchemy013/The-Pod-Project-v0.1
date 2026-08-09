import { StyleSheet, View, ViewProps } from 'react-native';
import { Palette, Radius } from '@/constants/theme';

// v2 groups rows on a raised surface with a 16px radius, not on a bare rule.
export function Card({ style, ...props }: ViewProps) {
  return <View style={[s.card, style]} {...props} />;
}

const s = StyleSheet.create({
  card: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.card,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
});
