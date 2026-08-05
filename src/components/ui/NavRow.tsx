import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/ui/icons';
import { Palette, Font } from '@/constants/theme';

export function NavRow({ label, value, onPress, destructive, last, valueColor }: {
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  last?: boolean;
  valueColor?: string;
}) {
  const interactive = !!onPress;
  return (
    <Pressable
      style={({ pressed }) => [s.row, !last && s.divider, pressed && interactive && s.pressed]}
      onPress={onPress}
      disabled={!interactive}
      accessibilityRole={interactive ? 'button' : undefined}
    >
      <Text style={[s.label, destructive && s.destructiveLabel]} numberOfLines={1}>{label}</Text>
      <View style={s.right}>
        {value !== undefined && (
          <Text style={[s.value, valueColor ? { color: valueColor } : undefined]} numberOfLines={1}>
            {value}
          </Text>
        )}
        {interactive && !destructive && (
          <Icon name="chevron-right" size={14} color={Palette.textMuted} />
        )}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 46,
    paddingHorizontal: 16,
    gap: 12,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: Palette.divider,
  },
  pressed: { opacity: 0.6 },
  label: { flex: 1, color: Palette.text, fontFamily: Font.medium, fontSize: 14 },
  destructiveLabel: { color: Palette.danger },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  value: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 14, maxWidth: 170 },
});
