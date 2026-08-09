import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/icons';
import { useBluetoothStore } from '@/store/bluetooth.store';
import { useLibraryStore } from '@/store/library.store';
import { usePlayerStore } from '@/store/player.store';
import { useArtStore } from '@/store/art.store';
import { usePodInfoStore, EqPreset } from '@/store/pod.store';
import { podService } from '@/services/bluetooth/BluetoothService';
import { Palette, Font, Radius } from '@/constants/theme';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { NavRow } from '@/components/ui/NavRow';
import { HeaderWash, IconCircle, PillButton, Pulse } from '@/components/ui/controls';
import { BluetoothSheet } from '@/components/bluetooth/BluetoothSheet';

const EQ_LABELS: Record<EqPreset, string> = {
  flat: 'Flat',
  bass: 'Bass Boost',
  vocal: 'Vocal',
  treble: 'Treble Boost',
};

const RSSI_POLL_MS = 15000;

function SignalBars({ level }: { level: number }) {
  return (
    <View style={s.signal}>
      {[6, 10, 14, 18].map((h, i) => (
        <View
          key={i}
          style={{ width: 3, height: h, borderRadius: 1, backgroundColor: i < level ? Palette.success : Palette.control }}
        />
      ))}
    </View>
  );
}

// rssi ranges roughly -100 (far) to -30 (touching) — bucket into 4 bars.
const barsFor = (rssi: number | null) =>
  rssi == null ? 0 : Math.max(0, Math.min(4, Math.round((rssi + 100) / 17.5)));

export default function PodScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { device, firmwareVersion, disconnect } = useBluetoothStore();
  const { clear: clearLibrary } = useLibraryStore();
  const { clear: clearArt } = useArtStore();
  const { song } = usePlayerStore();
  const { storage, battery, wifiStatus, eqPreset, fetchAll, clear: clearPodInfo } = usePodInfoStore();

  const [showBluetooth, setShowBluetooth] = useState(false);
  const [rssi, setRssi] = useState<number | null>(device?.rssi ?? null);

  useEffect(() => { fetchAll(); }, []);

  // Link quality is only meaningful live, and ble-plx only samples it on
  // demand — the value cached on the Device object is from scan time.
  useEffect(() => {
    if (!device) return;
    let alive = true;
    const read = () => device.readRSSI().then((d) => { if (alive) setRssi(d.rssi); }).catch(() => {});
    read();
    const t = setInterval(read, RSSI_POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [device?.id]);

  const wipeLocalState = () => { clearLibrary(); clearPodInfo(); clearArt(); };

  const handleDisconnect = () => {
    Alert.alert('Disconnect', 'Disconnect from ThePod? Playback continues on the Pod itself.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => { await disconnect(); wipeLocalState(); },
      },
    ]);
  };

  const handlePowerOff = () => {
    Alert.alert(
      'Power off ThePod',
      'This safely shuts down the Raspberry Pi. You’ll need to unplug and replug it to turn it back on.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Power off',
          style: 'destructive',
          onPress: async () => {
            try { await podService.request({ cmd: 'SHUTDOWN' }, 5000); } catch {}
            await disconnect();
            wipeLocalState();
          },
        },
      ],
    );
  };

  const usedPct = storage ? Math.min(100, (storage.usedGB / storage.totalGB) * 100) : 0;
  const khz = song?.sampleRate ? song.sampleRate / 1000 : 0;
  const stream = song?.format
    ? `${song.format.toUpperCase()}${song.bitDepth && khz ? ` ${song.bitDepth}/${Number.isInteger(khz) ? khz : khz.toFixed(1)}` : ''}`
    : 'Idle';

  return (
    <>
      <View style={s.container}>
        <HeaderWash seedKey="pod-connected" height={240} />

        <View style={[s.header, { paddingTop: insets.top + 2 }]}>
          <Text style={s.title}>Pod</Text>
          <IconCircle name="settings" label="Bluetooth devices" background={Palette.rail} onPress={() => setShowBluetooth(true)} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.statusCard}>
            <View style={s.statusIcon}>
              <Pulse size={48} radius={24} color={Palette.success} />
              <View style={[s.statusRing, { borderColor: Palette.success }]}>
                <View style={[s.statusDot, { backgroundColor: Palette.success }]} />
              </View>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.statusName}>ThePod</Text>
              <View style={s.statusLine}>
                <View style={[s.tinyDot, { backgroundColor: Palette.success }]} />
                <Text style={[s.statusText, { color: Palette.success }]}>Connected via Bluetooth</Text>
              </View>
            </View>
            <SignalBars level={barsFor(rssi)} />
          </View>

          <View style={s.telemetry}>
            <Text style={s.mono}>{rssi != null ? `RSSI ${rssi} dBm` : 'RSSI —'}</Text>
            <Text style={s.mono}>{device?.mtu ? `MTU ${device.mtu} B` : 'MTU —'}</Text>
          </View>

          <SectionHeader>Playback engine</SectionHeader>
          <Card>
            <NavRow label="DAC" value="PCM5122 · I2S" />
            <NavRow label="Output" value="3.5 mm analogue" />
            <NavRow label="Equaliser" value={EQ_LABELS[eqPreset]} onPress={() => router.push('/pod/equalizer')} />
            <NavRow label="Stream" value={stream} valueColor={Palette.accentHi} last />
          </Card>

          <SectionHeader>Storage</SectionHeader>
          <Card style={s.storageCard}>
            <View style={s.storageBar}>
              <View style={[s.storageFill, { width: `${usedPct}%` }]} />
            </View>
            <Text style={s.storageText}>
              {storage
                ? `${storage.usedGB} GB used of ${storage.totalGB} GB · ${storage.trackCount} tracks`
                : 'Reading storage from the Pod…'}
            </Text>
            <Pressable style={s.transferRow} onPress={() => router.push('/pod/storage')} accessibilityRole="button">
              <View style={s.transferIcon}><Icon name="download" size={17} color={Palette.accent} /></View>
              <Text style={s.transferLabel}>Add music over Wi-Fi</Text>
              <Icon name="chevron-right" size={14} color={Palette.textMuted} />
            </Pressable>
          </Card>

          <SectionHeader>Network</SectionHeader>
          <Card>
            <NavRow
              label="Wi-Fi"
              value={wifiStatus?.ssid ?? 'Not connected'}
              onPress={() => router.push('/pod/network')}
              last
            />
          </Card>

          <SectionHeader>Hardware</SectionHeader>
          <Card>
            <NavRow
              label="Battery"
              value={battery ? `${battery.percent}%${battery.charging ? ' · charging' : ''}` : '—'}
              valueColor={battery && battery.percent > 20 ? Palette.success : undefined}
              onPress={() => router.push('/pod/battery')}
            />
            <NavRow label="Firmware" value={firmwareVersion ?? '—'} />
            <NavRow label="About this Pod" onPress={() => router.push('/pod/about')} last />
          </Card>

          <View style={s.buttons}>
            <PillButton label="Power off" onPress={handlePowerOff} />
            <PillButton label="Disconnect" variant="danger" onPress={handleDisconnect} />
          </View>
        </ScrollView>
      </View>

      <BluetoothSheet visible={showBluetooth} onClose={() => setShowBluetooth(false)} />
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 14 },
  title: { flex: 1, fontFamily: Font.heading, fontSize: 22, color: Palette.text },

  scroll: { paddingHorizontal: 20, paddingBottom: 150 },

  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16,
    backgroundColor: Palette.surface, borderRadius: Radius.card,
    borderWidth: 1, borderColor: 'rgba(50,215,75,0.4)',
  },
  statusIcon: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: Palette.control,
    alignItems: 'center', justifyContent: 'center',
  },
  statusRing: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusName: { fontFamily: Font.heading, fontSize: 17, color: Palette.text },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tinyDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: Font.medium, fontSize: 13 },
  signal: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 18 },

  telemetry: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, paddingTop: 8 },
  mono: { fontFamily: Font.mono, fontSize: 11.5, color: Palette.textMuted },

  storageCard: { paddingVertical: 16, gap: 9 },
  storageBar: { height: 8, borderRadius: 4, backgroundColor: Palette.control, overflow: 'hidden' },
  storageFill: { height: 8, backgroundColor: Palette.accent },
  storageText: { fontFamily: Font.regular, fontSize: 13, color: Palette.textSecondary },
  transferRow: {
    flexDirection: 'row', alignItems: 'center', gap: 13, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: Palette.rail, marginTop: 4,
  },
  transferIcon: {
    width: 34, height: 34, borderRadius: Radius.sm, backgroundColor: Palette.accentWash,
    alignItems: 'center', justifyContent: 'center',
  },
  transferLabel: { flex: 1, fontFamily: Font.medium, fontSize: 14.5, color: Palette.text },

  buttons: { gap: 10, paddingTop: 26 },
});
