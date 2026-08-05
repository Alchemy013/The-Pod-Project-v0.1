import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { usePodInfoStore } from '@/store/pod.store';
import { Palette, Font } from '@/constants/theme';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { NavRow } from '@/components/ui/NavRow';

const POLL_MS = 20000;

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
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

  return (
    <View style={s.container}>
      <View style={s.hero}>
        <View style={s.batteryIconWrap}>
          <View style={s.batteryIcon}>
            <View style={[s.batteryFill, { width: `${battery.percent}%` as any }]} />
          </View>
          <View style={s.batteryNub} />
        </View>
        <Text style={s.percent}>{battery.percent}%</Text>
        <Text style={s.status}>
          {battery.charging ? 'Charging' : 'On Battery'}
          {!battery.charging && battery.minutesRemaining != null
            ? ` — ${formatMinutes(battery.minutesRemaining)} remaining`
            : ''}
        </Text>
      </View>

      <SectionHeader>Details</SectionHeader>
      <Card style={{ padding: 0 }}>
        <NavRow label="State" value={battery.charging ? 'Charging' : 'On Battery'} />
        <NavRow
          label="Time Remaining"
          value={battery.minutesRemaining != null ? formatMinutes(battery.minutesRemaining) : '—'}
          last
        />
      </Card>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg },
  loading: { flex: 1, backgroundColor: Palette.bg, alignItems: 'center', justifyContent: 'center' },

  hero: { alignItems: 'center', paddingVertical: 36, gap: 10 },
  batteryIconWrap: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  batteryIcon: {
    width: 90, height: 42,
    borderWidth: 3, borderColor: Palette.textSecondary,
    padding: 4, overflow: 'hidden',
  },
  batteryFill: { height: '100%', backgroundColor: Palette.accent },
  batteryNub: { width: 6, height: 18, backgroundColor: Palette.textSecondary, marginLeft: 3 },
  percent: { color: Palette.text, fontFamily: Font.heading, fontSize: 40, letterSpacing: -0.5 },
  status: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 15 },
});
