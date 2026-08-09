import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBluetoothStore } from '@/store/bluetooth.store';
import { usePodInfoStore } from '@/store/pod.store';
import { useAppStore } from '@/store/app.store';
import { Palette, Font, Radius } from '@/constants/theme';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { NavRow } from '@/components/ui/NavRow';
import { PillButton } from '@/components/ui/controls';

export default function AboutScreen() {
  const { device, podIp, podPort, firmwareVersion } = useBluetoothStore();
  const { wifiStatus } = usePodInfoStore();
  const reset = useAppStore((s) => s.reset);

  // Destructive and not undoable, so it asks first. No navigation afterwards:
  // clearing the flag drops the whole app back to onboarding at the root gate,
  // which unmounts this screen along with the rest of the tab stack.
  const confirmReset = () => {
    Alert.alert(
      'Reset app?',
      'Forgets this Pod and erases all local data on this iPhone. Your music and the Pod’s own settings are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: () => { reset(); } },
      ],
    );
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} contentInsetAdjustmentBehavior="automatic">
      <View style={s.hero}>
        <View style={s.mark}><Text style={s.markText}>P</Text></View>
        <Text style={s.name}>ThePod</Text>
        <Text style={s.address}>{device?.id ?? 'Not connected'}</Text>
      </View>

      <SectionHeader>Hardware</SectionHeader>
      <Card>
        <NavRow label="Device" value="Raspberry Pi Zero 2 W" />
        <NavRow label="Processor" value="ARM Cortex-A53 · 1.0 GHz" />
        <NavRow label="Memory" value="512 MB RAM" />
        <NavRow label="DAC" value="PCM5122 · I2S" />
        <NavRow label="Output" value="3.5 mm analogue" last />
      </Card>

      <SectionHeader>Software</SectionHeader>
      <Card>
        <NavRow label="Firmware" value={firmwareVersion ?? '—'} />
        <NavRow label="Playback" value="MPD" mono />
        <NavRow label="Protocol" value="JSON / base64 · 430 B chunks" last />
      </Card>

      <SectionHeader>Addresses</SectionHeader>
      <Card>
        <NavRow label="Hostname" value="ThePod.local" mono />
        <NavRow label="Wi-Fi network" value={wifiStatus?.ssid ?? '—'} mono />
        <NavRow label="Transfer server" value={podIp ? `${podIp}:${podPort}` : '—'} last />
      </Card>

      <SectionHeader>Reset</SectionHeader>
      <Text style={s.resetNote}>
        Forgets this Pod, clears play history, cached artwork and every saved preference,
        then starts over from the intro. Nothing on the Pod itself is touched — your music
        and its settings stay exactly as they are.
      </Text>
      <PillButton label="Reset app" variant="danger" onPress={confirmReset} style={s.resetButton} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg },
  content: { paddingBottom: 60 },

  hero: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  mark: {
    width: 72, height: 72, borderRadius: Radius.card, backgroundColor: Palette.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  markText: { fontFamily: Font.heading, fontSize: 40, color: Palette.accentText },
  name: { color: Palette.text, fontFamily: Font.heading, fontSize: 20 },
  address: { color: Palette.textMuted, fontFamily: Font.mono, fontSize: 12 },

  resetNote: {
    color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 13, lineHeight: 20,
    paddingHorizontal: 20, paddingBottom: 14,
  },
  resetButton: { marginHorizontal: 20 },
});
