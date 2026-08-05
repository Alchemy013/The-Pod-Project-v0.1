import { StyleSheet, View, ViewProps } from 'react-native';
import { Palette } from '@/constants/theme';

// A "card" here is a ruled section, not a boxed surface — 2px top rule,
// no background, no radius, matching every grouped-row block in the design.
export function Card({ style, ...props }: ViewProps) {
  return <View style={[s.card, style]} {...props} />;
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 24,
    borderTopWidth: 2,
    borderTopColor: Palette.divider,
    paddingTop: 14,
  },
});
