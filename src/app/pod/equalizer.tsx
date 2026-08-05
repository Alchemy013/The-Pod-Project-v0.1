import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/ui/icons';
import { podService } from '@/services/bluetooth/BluetoothService';
import { usePodInfoStore, EqPreset } from '@/store/pod.store';
import { Palette, Font } from '@/constants/theme';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';

const PRESETS: { key: EqPreset; label: string; description: string }[] = [
  { key: 'flat', label: 'Flat', description: 'No coloration — the source, unaltered' },
  { key: 'bass', label: 'Bass Boost', description: 'Deeper low end for electronic and hip-hop' },
  { key: 'vocal', label: 'Vocal', description: 'Emphasizes mid-range for spoken word and vocals' },
  { key: 'treble', label: 'Treble Boost', description: 'Brighter highs for acoustic and classical' },
];

function PresetRow({ label, description, selected, onPress, last }: {
  label: string; description: string; selected: boolean; onPress: () => void; last?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [s.row, !last && s.divider, pressed && s.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <View style={s.rowText}>
        <Text style={s.label}>{label}</Text>
        <Text style={s.description}>{description}</Text>
      </View>
      {selected && (
        <Icon name="check" size={16} color={Palette.accent} />
      )}
    </Pressable>
  );
}

export default function EqualizerScreen() {
  const { eqPreset, setEqPreset } = usePodInfoStore();

  const handleSelect = (preset: EqPreset) => {
    setEqPreset(preset);
    podService.request({ cmd: 'SET_EQ', preset }, 10000).catch(() => {});
  };

  return (
    <View style={s.container}>
      <SectionHeader>Preset</SectionHeader>
      <Card style={{ padding: 0 }}>
        {PRESETS.map((p, i) => (
          <PresetRow
            key={p.key}
            label={p.label}
            description={p.description}
            selected={eqPreset === p.key}
            onPress={() => handleSelect(p.key)}
            last={i === PRESETS.length - 1}
          />
        ))}
      </Card>
      <Text style={s.note}>Requires one-time EQ setup on ThePod</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg, paddingTop: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: Palette.divider },
  pressed: { opacity: 0.6 },
  rowText: { flex: 1, gap: 2 },
  label: { color: Palette.text, fontFamily: Font.medium, fontSize: 15 },
  description: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 12.5 },
  note: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 12, textAlign: 'center', marginTop: 4, paddingHorizontal: 20 },
});
