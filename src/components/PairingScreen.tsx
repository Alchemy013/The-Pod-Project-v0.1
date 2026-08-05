import { useEffect, useRef } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Device } from 'react-native-ble-plx';
import { useBluetoothStore } from '@/store/bluetooth.store';
import { POD_DEVICE_NAME } from '@/services/bluetooth/protocol';
import { Palette, Font } from '@/constants/theme';

// rssi typically ranges roughly -100 (far) to -30 (close) — bucket into 4 signal bars.
function signalBars(rssi: number | null): number {
  if (rssi == null) return 0;
  return Math.max(0, Math.min(4, Math.round((rssi + 100) / 17.5)));
}

function SignalBars({ level, active }: { level: number; active: boolean }) {
  const heights = [5, 9, 13, 16];
  const color = active ? Palette.accent : Palette.borderFaint;
  return (
    <View style={s.signalBars}>
      {heights.map((h, i) => (
        <View key={i} style={[s.signalBar, { height: h, backgroundColor: i < level ? color : Palette.divider }]} />
      ))}
    </View>
  );
}

function DeviceRow({ device, isTarget, onPress }: { device: Device; isTarget: boolean; onPress: () => void }) {
  const name = device.name ?? device.localName ?? 'Unknown';
  return (
    <Pressable
      style={[s.deviceRow, isTarget && s.deviceRowTarget]}
      onPress={onPress}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.deviceName, !isTarget && s.deviceNameMuted]} numberOfLines={1}>{name}</Text>
        <Text style={s.deviceId}>{device.id}</Text>
      </View>
      <SignalBars level={signalBars(device.rssi)} active={isTarget} />
    </Pressable>
  );
}

export function PairingScreen() {
  const insets = useSafeAreaInsets();
  const { connectionState, scannedDevices, error, startScan, connect } = useBluetoothStore();
  const isScanning = connectionState === 'scanning';
  const isConnecting = connectionState === 'connecting';

  const target = scannedDevices.find(d => (d.name ?? d.localName) === POD_DEVICE_NAME) ?? scannedDevices[0] ?? null;

  // Auto-scan exactly once, and only once the store has settled on
  // 'disconnected' so this never races an in-flight autoConnect. Re-running on
  // every transition to 'disconnected' created an 8s loop: startScan() ends by
  // setting 'disconnected' and begins by clearing scannedDevices, so each scan
  // wiped its own results the instant it finished. Retries go through the
  // "Scan again" button.
  const hasAutoScanned = useRef(false);
  useEffect(() => {
    if (hasAutoScanned.current) return;
    if (connectionState !== 'disconnected') return;
    hasAutoScanned.current = true;
    startScan();
  }, [connectionState, startScan]);

  return (
    <View style={[s.container, { paddingTop: insets.top + 20 }]}>
      <Text style={s.step}>{isConnecting ? 'Connecting' : 'Step 02 / 02'}</Text>
      <Text style={s.title}>Find your{'\n'}Pod</Text>
      <Text style={s.subtitle}>
        Power the Pod on and keep it within a few metres. It advertises as{' '}
        <Text style={{ color: Palette.text, fontFamily: Font.medium }}>{POD_DEVICE_NAME}</Text>.
      </Text>

      <View style={s.radarWrap}>
        <View style={s.radarRing1}>
          <View style={s.radarRing2}>
            <View style={s.radarRing3}>
              <View style={s.radarDot} />
            </View>
          </View>
        </View>
      </View>

      <View style={s.listHeader}>
        <Text style={s.listLabel}>
          {isScanning ? `Scanning · ${scannedDevices.length} found` : `${scannedDevices.length} found`}
        </Text>
        {isScanning ? (
          <ActivityIndicator size="small" color={Palette.textSecondary} />
        ) : (
          <Pressable onPress={startScan}><Text style={s.stopText}>Scan again</Text></Pressable>
        )}
      </View>

      <FlatList
        data={scannedDevices}
        keyExtractor={(d) => d.id}
        style={{ flex: 1 }}
        renderItem={({ item }) => (
          <DeviceRow device={item} isTarget={item.id === target?.id} onPress={() => connect(item.id).catch(() => {})} />
        )}
        ListEmptyComponent={!isScanning ? <Text style={s.empty}>No devices found nearby.</Text> : null}
      />

      {error && <Text style={s.error}>{error}</Text>}

      {target && (
        <Pressable
          style={[s.cta, isConnecting && { opacity: 0.6 }]}
          onPress={() => connect(target.id).catch(() => {})}
          disabled={isConnecting}
        >
          <Text style={s.ctaText}>{isConnecting ? 'Connecting…' : `Connect to ${POD_DEVICE_NAME}`}</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg, paddingHorizontal: 20 },
  step: { color: Palette.accent, fontFamily: Font.heading, fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 10 },
  title: { color: Palette.text, fontFamily: Font.heading, fontSize: 40, letterSpacing: -1, lineHeight: 39 },
  subtitle: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 14, lineHeight: 21, marginTop: 14, maxWidth: 280 },

  radarWrap: { alignItems: 'center', justifyContent: 'center', height: 160, marginVertical: 20 },
  radarRing1: { width: 150, height: 150, borderWidth: 2, borderColor: Palette.divider, alignItems: 'center', justifyContent: 'center' },
  radarRing2: { width: 100, height: 100, borderWidth: 2, borderColor: Palette.border, alignItems: 'center', justifyContent: 'center' },
  radarRing3: { width: 50, height: 50, borderWidth: 2, borderColor: Palette.accent, alignItems: 'center', justifyContent: 'center' },
  radarDot: { width: 10, height: 10, backgroundColor: Palette.accent },

  listHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: Palette.divider,
  },
  listLabel: { color: Palette.textSecondary, fontFamily: Font.bold, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' },
  stopText: { color: Palette.accent, fontFamily: Font.heading, fontSize: 10, letterSpacing: 1.0, textTransform: 'uppercase' },

  deviceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Palette.divider,
  },
  deviceRowTarget: { borderLeftWidth: 3, borderLeftColor: Palette.accent, paddingLeft: 11, marginLeft: -14 },
  deviceName: { color: Palette.text, fontFamily: Font.heading, fontSize: 16 },
  deviceNameMuted: { color: Palette.textSecondary, fontFamily: Font.medium },
  deviceId: { color: Palette.borderFaint, fontFamily: Font.regular, fontSize: 11, marginTop: 2, fontVariant: ['tabular-nums'] },
  signalBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 16 },
  signalBar: { width: 4 },

  empty: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 14, textAlign: 'center', paddingTop: 30 },
  error: { color: Palette.danger, fontFamily: Font.regular, fontSize: 13, textAlign: 'center', marginTop: 10 },

  cta: { backgroundColor: Palette.accent, padding: 16, alignItems: 'center', marginBottom: 30, marginTop: 14 },
  ctaText: { color: Palette.accentText, fontFamily: Font.heading, fontSize: 13, letterSpacing: 1.0, textTransform: 'uppercase' },
});
