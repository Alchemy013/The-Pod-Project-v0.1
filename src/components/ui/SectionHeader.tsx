import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Palette, Font } from '@/constants/theme';

/**
 * Section heading in the v2 feed idiom: a 19px title, optionally with a
 * right-hand action. Older screens call this with just a string.
 */
export function SectionHeader({ children, action, onAction }: {
  children: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s.row}>
      <Text style={s.title}>{children}</Text>
      {action && (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text style={s.action}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 22, paddingBottom: 12,
  },
  title: { color: Palette.text, fontFamily: Font.heading, fontSize: 19 },
  action: { color: Palette.textMuted, fontFamily: Font.medium, fontSize: 12 },
});
