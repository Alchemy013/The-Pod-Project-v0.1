import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useBluetoothStore } from '@/store/bluetooth.store';
import { useLibraryStore } from '@/store/library.store';
import { usePodInfoStore, EqPreset } from '@/store/pod.store';
import { podService } from '@/services/bluetooth/BluetoothService';
import { Palette, Radius } from '@/constants/theme';
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

function ConnectedList({ onOpenBluetooth }: { onOpenBluetooth: () => void }) {
  const router = useRouter();
  const { clear: clearLibrary } = useLibraryStore();
  const { disconnect } = useBluetoothStore();
  const { storage, battery, wifiStatus, eqPreset, fetchAll, clear: clearPodInfo } = usePodInfoStore();

  useEffect(() => {
    fetchAll();
  }, []);

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
            try {
              await podService.request({ cmd: 'SHUTDOWN' }, 5000);
            } catch {}
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
    <ScrollView style={s.container} contentContainerStyle={s.scrollContent} contentInsetAdjustmentBehavior="automatic">
      <Pressable onPress={() => router.push('/pod/about')}>
        <Card style={s.deviceCard}>
          <View style={s.podIconCircle}>
            <Text style={s.podIconText}>◉</Text>
          </View>
          <View style={s.deviceCardInfo}>
            <Text style={s.deviceCardName}>ThePod</Text>
            <View style={s.connectedBadgeRow}>
              <View style={s.greenDot} />
              <Text style={s.connectedBadge}>Connected via Bluetooth</Text>
            </View>
          </View>
        </Card>
      </Pressable>

      <SectionHeader>Devices</SectionHeader>
      <Card style={s.listCard}>
        <NavRow label="Bluetooth" value="ThePod" onPress={onOpenBluetooth} last />
      </Card>

      <SectionHeader>Playback</SectionHeader>
      <Card style={s.listCard}>
        <NavRow label="Equalizer" value={EQ_LABELS[eqPreset]} onPress={() => router.push('/pod/equalizer')} last />
      </Card>

      <SectionHeader>Network</SectionHeader>
      <Card style={s.listCard}>
        <NavRow
          label="Wi-Fi Network"
          value={wifiStatus?.ssid ?? 'Loading…'}
          onPress={() => router.push('/pod/network')}
          last
        />
      </Card>

      <SectionHeader>Storage</SectionHeader>
      <Card style={s.listCard}>
        <NavRow label="Storage & Music" value={storageValue} onPress={() => router.push('/pod/storage')} last />
      </Card>

      <SectionHeader>Power</SectionHeader>
      <Card style={s.listCard}>
        <NavRow label="Battery" value={batteryValue} onPress={() => router.push('/pod/battery')} />
        <NavRow label="Power Off Pod" destructive onPress={handlePowerOff} last />
      </Card>

      <SectionHeader>About</SectionHeader>
      <Card style={s.listCard}>
        <NavRow label="Hardware" value="Pi Zero 2W" onPress={() => router.push('/pod/about')} last />
      </Card>

      <Pressable style={s.disconnectBtn} onPress={handleDisconnect}>
        <Text style={s.disconnectText}>Disconnect</Text>
      </Pressable>
    </ScrollView>
  );
}

function DisconnectedHero({ onOpenBluetooth }: { onOpenBluetooth: () => void }) {
  const { connectionState, error } = useBluetoothStore();
  const isConnecting = connectionState === 'connecting';

  return (
    <View style={s.heroContainer}>
      <View style={s.heroIconCircle}>
        <Text style={s.heroIconText}>◎</Text>
      </View>
      <Text style={s.heroTitle}>Not Connected</Text>
      <Text style={s.heroSub}>Connect to ThePod over Bluetooth to control playback and manage your library.</Text>

      {error && <Text style={s.heroError}>{error}</Text>}

      <Pressable
        style={[s.connectBtn, isConnecting && s.connectBtnDisabled]}
        onPress={onOpenBluetooth}
        disabled={isConnecting}
      >
        {isConnecting
          ? <ActivityIndicator color={Palette.bg} size="small" />
          : <Text style={s.connectBtnText}>Connect to ThePod</Text>}
      </Pressable>
    </View>
  );
}

export default function PodScreen() {
  const isConnected = useBluetoothStore((st) => st.connectionState === 'connected');
  const [showBluetooth, setShowBluetooth] = useState(false);
  const openBluetooth = () => setShowBluetooth(true);

  return (
    <>
      {isConnected ? <ConnectedList onOpenBluetooth={openBluetooth} /> : <DisconnectedHero onOpenBluetooth={openBluetooth} />}
      <BluetoothSheet visible={showBluetooth} onClose={() => setShowBluetooth(false)} />
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg },
  scrollContent: { paddingBottom: 120 },

  listCard: { padding: 0 },

  deviceCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginTop: 8,
  },
  podIconCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Palette.surfaceHigh, alignItems: 'center', justifyContent: 'center',
  },
  podIconText: { fontSize: 22, color: Palette.textSecondary },
  deviceCardInfo: { flex: 1, gap: 4 },
  deviceCardName: { color: Palette.text, fontSize: 17, fontWeight: '700' },
  connectedBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  greenDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Palette.accent },
  connectedBadge: { color: Palette.accent, fontSize: 13, fontWeight: '500' },

  disconnectBtn: {
    marginHorizontal: 20, marginTop: 12, paddingVertical: 14,
    backgroundColor: '#2C0A0A', borderRadius: Radius.lg, alignItems: 'center',
    borderWidth: 1, borderColor: '#FF453A33',
  },
  disconnectText: { color: Palette.danger, fontSize: 16, fontWeight: '600' },

  heroContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  heroIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Palette.surfaceHigh, alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  heroIconText: { fontSize: 32, color: Palette.textMuted },
  heroTitle: { color: Palette.text, fontSize: 20, fontWeight: '700' },
  heroSub: { color: Palette.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 8 },
  heroError: { color: Palette.danger, fontSize: 13, textAlign: 'center', marginBottom: 4 },

  connectBtn: {
    paddingHorizontal: 28, paddingVertical: 14, borderRadius: Radius.pill,
    backgroundColor: Palette.text, alignItems: 'center', justifyContent: 'center',
    minWidth: 200, minHeight: 48,
  },
  connectBtnDisabled: { opacity: 0.6 },
  connectBtnText: { color: Palette.bg, fontSize: 16, fontWeight: '700' },
});
