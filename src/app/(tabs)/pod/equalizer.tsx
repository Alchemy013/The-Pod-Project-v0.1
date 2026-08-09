import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { podService } from '@/services/bluetooth/BluetoothService';
import { usePodInfoStore, EqPreset } from '@/store/pod.store';
import { Palette, Font, Radius } from '@/constants/theme';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { NavRow } from '@/components/ui/NavRow';
import { Chip, ChipRow } from '@/components/ui/controls';

const BANDS = ['31', '63', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];

// Mirrors EQ_PRESETS in firmware/command_handler.py, which drives alsaequal
// through `amixer -D equal` — 0-100 per band with 50 as flat. Kept here so the
// curve on screen is the curve the Pi actually applies; change both together.
const CURVES: Record<EqPreset, number[]> = {
  flat: [50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
  bass: [72, 67, 60, 54, 48, 46, 46, 46, 46, 46],
  vocal: [38, 40, 43, 50, 63, 68, 63, 54, 48, 46],
  treble: [46, 46, 46, 46, 46, 48, 54, 62, 70, 76],
};

const PRESETS: { key: EqPreset; label: string; description: string }[] = [
  { key: 'flat', label: 'Flat', description: 'No colouration — the source, unaltered.' },
  { key: 'bass', label: 'Bass', description: 'Deeper low end for electronic and hip-hop.' },
  { key: 'vocal', label: 'Vocal', description: 'Lifted mid-range for spoken word and voices.' },
  { key: 'treble', label: 'Treble', description: 'Brighter highs for acoustic and classical.' },
];

const TRACK_H = 150;

export default function EqualizerScreen() {
  const { eqPreset, setEqPreset } = usePodInfoStore();
  const curve = CURVES[eqPreset];
  const active = PRESETS.find((p) => p.key === eqPreset)!;

  const select = (preset: EqPreset) => {
    setEqPreset(preset);
    podService.request({ cmd: 'SET_EQ', preset }, 10000).catch(() => {});
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} contentInsetAdjustmentBehavior="automatic">
      <ChipRow>
        {PRESETS.map((p) => (
          <Chip key={p.key} label={p.label} on={eqPreset === p.key} onPress={() => select(p.key)} />
        ))}
      </ChipRow>

      <View style={s.graph}>
        {curve.map((value, i) => {
          const offset = (value - 50) / 50; // −1 … +1 around the centre line
          const half = TRACK_H / 2;
          const barH = Math.max(2, Math.abs(offset) * half);
          return (
            <View key={BANDS[i]} style={s.band}>
              <Text style={[s.bandValue, offset === 0 && { color: Palette.textMuted }]}>
                {offset > 0 ? `+${value - 50}` : value - 50}
              </Text>
              <View style={s.track}>
                <View style={s.centreLine} />
                <View
                  style={[
                    s.fill,
                    offset >= 0
                      ? { bottom: half, height: barH }
                      : { top: half, height: barH },
                  ]}
                />
                {/* Clamped so a full-scale band keeps the knob inside the
                    track instead of half-clipped by the rounded ends. */}
                <View style={[s.knob, { bottom: Math.min(TRACK_H - 10, Math.max(0, half + offset * half - 5)) }]} />
              </View>
              <Text style={s.bandLabel}>{BANDS[i]}</Text>
            </View>
          );
        })}
      </View>

      <Text style={s.activeNote}>{active.description}</Text>

      <SectionHeader>Signal path</SectionHeader>
      <Card>
        <NavRow label="Applied at" value="MPD → alsaequal" mono />
        <NavRow label="Bands" value="10 · 31 Hz – 16 kHz" />
        <NavRow label="Then" value="PCM5122 over I2S" mono last />
      </Card>

      <Text style={s.note}>
        EQ runs on the Pi before the DAC, so it applies to everything the Pod plays. Presets are the only curves the
        firmware exposes — per-band control would need a new command on the Pi.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg },
  content: { paddingTop: 12, paddingBottom: 60 },

  graph: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 4,
    marginHorizontal: 20, marginTop: 18, padding: 14,
    backgroundColor: Palette.surface, borderRadius: Radius.card,
  },
  band: { flex: 1, alignItems: 'center', gap: 8 },
  bandValue: { fontFamily: Font.mono, fontSize: 10, color: Palette.accent },
  track: {
    width: 18, height: TRACK_H, borderRadius: 9, backgroundColor: '#0E0E10',
    borderWidth: 1, borderColor: Palette.rail, overflow: 'hidden',
  },
  centreLine: { position: 'absolute', left: 0, right: 0, top: '50%', height: 1, backgroundColor: Palette.control },
  fill: { position: 'absolute', left: 3, right: 3, borderRadius: 6, backgroundColor: Palette.accent, opacity: 0.22 },
  knob: {
    position: 'absolute', left: 2, right: 2, height: 10, borderRadius: 5,
    backgroundColor: Palette.accent,
  },
  bandLabel: { fontFamily: Font.mono, fontSize: 9.5, color: Palette.textSecondary },

  activeNote: {
    fontFamily: Font.regular, fontSize: 13, color: Palette.textSecondary,
    paddingHorizontal: 20, paddingTop: 14,
  },
  note: {
    fontFamily: Font.regular, fontSize: 12, lineHeight: 18, color: Palette.textMuted,
    paddingHorizontal: 20, paddingTop: 18,
  },
});
