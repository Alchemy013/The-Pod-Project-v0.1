import { StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/ui/icons';
import { Pressed } from '@/components/ui/controls';
import { Palette, Font, Type } from '@/constants/theme';

export function NavRow({ label, value, onPress, destructive, last, valueColor, mono }: {
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  last?: boolean;
  valueColor?: string;
  /** Force the monospace face — useful for readouts with no digits in them. */
  mono?: boolean;
}) {
  const interactive = !!onPress;
  // Readouts that carry numbers get the mono face, matching the hi-fi
  // telemetry treatment throughout the design.
  const numeric = mono ?? (value !== undefined && /[0-9]/.test(value));

  const body = (
    <>
      <Text style={[s.label, destructive && s.destructiveLabel]} numberOfLines={1}>{label}</Text>
      <View style={s.right}>
        {value !== undefined && (
          <Text
            style={[s.value, numeric && { fontFamily: Font.mono, fontSize: Type.callout }, valueColor ? { color: valueColor } : undefined]}
            numberOfLines={1}
          >
            {value}
          </Text>
        )}
        {interactive && !destructive && (
          <Icon name="chevron-right" size={14} color={Palette.textMuted} />
        )}
      </View>
    </>
  );

  // A row with no `onPress` is a readout, not a control — it must not be
  // announced as a button and must not react to touch.
  if (!interactive) {
    return <View style={[s.row, !last && s.divider]}>{body}</View>;
  }

  return (
    <Pressed style={[s.row, !last && s.divider]} onPress={onPress} label={label}>
      {body}
    </Pressed>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingVertical: 11,
    gap: 12,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: Palette.rail },
  label: { flex: 1, color: Palette.textSecondary, fontFamily: Font.regular, fontSize: Type.body },
  destructiveLabel: { color: Palette.danger, fontFamily: Font.medium },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  value: { color: Palette.text, fontFamily: Font.medium, fontSize: Type.body, maxWidth: 190 },
});
