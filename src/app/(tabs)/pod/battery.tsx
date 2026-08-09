import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { usePodInfoStore } from '@/store/pod.store';
import { Palette, Font, Radius } from '@/constants/theme';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { NavRow } from '@/components/ui/NavRow';

const POLL_MS = 20000;

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} h ${m} m` : `${h} h`;
}

export default function BatteryScreen() {
  const { battery, refreshBattery } = usePodInfoStore();

  useEffect(() => {
    refreshBattery();
    const t = setInterval(refreshBattery, POLL_MS);
    return () => clearInterval(t);
  }, []);

  if (!battery) {
    return (
      <View style={s.loading}>
        <ActivityIndicator color={Palette.textSecondary} size="large" />
      </View>
    );
  }

  const low = battery.percent <= 20 && !battery.charging;
  const fillColor = battery.charging ? Palette.success : low ? Palette.danger : Palette.accent;

  return (
    <View style={s.container}>
      <View style={s.hero}>
        <View style={s.batteryRow}>
          <View style={s.shell}>
            <View style={[s.fill, { width: `${battery.percent}%`, backgroundColor: fillColor }]} />
          </View>
          <View style={s.nub} />
        </View>
        <Text style={s.percent}>{battery.percent}%</Text>
        <Text style={s.status}>
          {battery.charging
            ? 'Charging'
            : battery.minutesRemaining != null
              ? `${formatMinutes(battery.minutesRemaining)} remaining`
              : 'On battery'}
        </Text>
      </View>

      <SectionHeader>Details</SectionHeader>
      <Card>
        <NavRow label="State" value={battery.charging ? 'Charging' : 'On battery'} mono />
        <NavRow
          label="Time remaining"
          value={battery.minutesRemaining != null ? formatMinutes(battery.minutesRemaining) : '—'}
        />
        <NavRow label="Gauge" value="INA219 · 3.0–4.2 V" last />
      </Card>

      <Text style={s.note}>
        Percentage is a linear reading of cell voltage rather than a calibrated fuel gauge, so it drifts a little at
        the very top and bottom of the range.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg },
  loading: { flex: 1, backgroundColor: Palette.bg, alignItems: 'center', justifyContent: 'center' },

  hero: { alignItems: 'center', paddingVertical: 34, gap: 8 },
  batteryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  shell: {
    width: 104, height: 46, borderRadius: 10, borderWidth: 3, borderColor: Palette.control,
    padding: 4, overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4 },
  nub: { width: 6, height: 18, borderRadius: 3, backgroundColor: Palette.control, marginLeft: 3 },
  percent: { color: Palette.text, fontFamily: Font.heading, fontSize: 40 },
  status: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 15 },

  note: {
    fontFamily: Font.regular, fontSize: 12, lineHeight: 18, color: Palette.textMuted,
    paddingHorizontal: 20, paddingTop: 8,
  },
});
