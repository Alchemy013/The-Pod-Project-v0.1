import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBluetoothStore } from '@/store/bluetooth.store';
import { useLibraryStore } from '@/store/library.store';
import { usePodInfoStore, EqPreset } from '@/store/pod.store';
import { podService } from '@/services/bluetooth/BluetoothService';
import { Palette, Font } from '@/constants/theme';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { NavRow } from '@/components/ui/NavRow';
import { BluetoothSheet } from '@/components/bluetooth/BluetoothSheet';

const EQ_LABELS: Record<EqPreset, string> = {
  flat: 'Flat',
  bass: 'Bass Boost',
  vocal: 'Vocal',
  treble: 'Treble Boost',
};

export default function PodScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { clear: clearLibrary } = useLibraryStore();
  const { disconnect } = useBluetoothStore();
  const { storage, battery, wifiStatus, eqPreset, fetchAll, clear: clearPodInfo } = usePodInfoStore();
  const [showBluetooth, setShowBluetooth] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const handleDisconnect = () => {
    Alert.alert('Disconnect', 'Disconnect from ThePod?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect', style: 'destructive', onPress: async () => {
          await disconnect();
          clearLibrary();
          clearPodInfo();
        },
      },
    ]);
  };

  const handlePowerOff = () => {
    Alert.alert(
      'Power Off ThePod',
      'This will safely shut down the Raspberry Pi. You will need to physically unplug and replug it to turn it back on.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Power Off', style: 'destructive', onPress: async () => {
            try { await podService.request({ cmd: 'SHUTDOWN' }, 5000); } catch {}
            await disconnect();
            clearLibrary();
            clearPodInfo();
          },
        },
      ],
    );
  };

  const storageValue = storage ? `${storage.usedGB}/${storage.totalGB} GB` : '—';
  const batteryValue = battery ? `${battery.percent}%` : '—';

  return (
    <>
    <ScrollView style={s.container} contentContainerStyle={[s.scrollContent, { paddingTop: insets.top + 20 }]}>
      <View style={s.header}>
        <View style={s.titleRow}>
          <Text style={s.title}>ThePod</Text>
          <View style={s.accentDot} />
        </View>
        <Text style={s.connectedBadge}>Connected via Bluetooth</Text>
      </View>

      <SectionHeader>Devices</SectionHeader>
      <Card>
        <NavRow label="Bluetooth" value="ThePod" onPress={() => setShowBluetooth(true)} last />
      </Card>

      <SectionHeader>Playback</SectionHeader>
      <Card>
        <NavRow label="Equalizer" value={EQ_LABELS[eqPreset]} onPress={() => router.push('/pod/equalizer')} last />
      </Card>

      <SectionHeader>Network</SectionHeader>
      <Card>
        <NavRow label="Wi-Fi Network" value={wifiStatus?.ssid ?? 'Loading…'} onPress={() => router.push('/pod/network')} last />
      </Card>

      <SectionHeader>Storage</SectionHeader>
      <Card>
        <NavRow label="Storage & Music" value={storageValue} onPress={() => router.push('/pod/storage')} last />
      </Card>

      <SectionHeader>Power</SectionHeader>
      <Card>
        <NavRow label="Battery" value={batteryValue} onPress={() => router.push('/pod/battery')} />
        <NavRow label="Power Off Pod" destructive onPress={handlePowerOff} last />
      </Card>

      <SectionHeader>About</SectionHeader>
      <Card>
        <NavRow label="Hardware" onPress={() => router.push('/pod/about')} last />
      </Card>

      <Pressable style={s.disconnectBtn} onPress={handleDisconnect}>
        <Text style={s.disconnectText}>Disconnect</Text>
      </Pressable>
    </ScrollView>
    <BluetoothSheet visible={showBluetooth} onClose={() => setShowBluetooth(false)} />
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg },
  scrollContent: { paddingBottom: 140 },

  header: { paddingHorizontal: 20, marginBottom: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  title: { fontFamily: Font.heading, fontSize: 40, letterSpacing: -1, color: Palette.text },
  accentDot: { width: 10, height: 10, backgroundColor: Palette.accent },
  connectedBadge: { fontFamily: Font.bold, fontSize: 13, color: Palette.accent, marginTop: 6 },

  disconnectBtn: {
    marginHorizontal: 20, marginTop: 22, padding: 14,
    borderWidth: 2, borderColor: Palette.border, alignItems: 'center',
  },
  disconnectText: { color: Palette.text, fontFamily: Font.heading, fontSize: 13, letterSpacing: 1.0, textTransform: 'uppercase' },
});
