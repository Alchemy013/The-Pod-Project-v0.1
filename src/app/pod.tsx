import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Device } from 'react-native-ble-plx';
import { useBluetoothStore } from '@/store/bluetooth.store';
import { useLibraryStore } from '@/store/library.store';
import { usePlayerStore } from '@/store/player.store';
import { podService } from '@/services/bluetooth/BluetoothService';
import { POD_DEVICE_NAME } from '@/services/bluetooth/protocol';

interface StorageInfo {
  totalGB: number;
  usedGB: number;
  freeGB: number;
  trackCount: number;
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.specRow}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue}>{value}</Text>
    </View>
  );
}

function ConnectedView({ onDisconnect }: { onDisconnect: () => void }) {
  const [storage, setStorage] = useState<StorageInfo | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      podService.request({ cmd: 'GET_STORAGE' }, 10000)
        .then(res => { if (res.type === 'STORAGE') setStorage(res); })
        .catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, []);

  const usedPct = storage ? (storage.usedGB / storage.totalGB) * 100 : 0;

  return (
    <View style={styles.container}>
      <Text style={styles.screenTitle}>Pod</Text>

      {/* Connection status */}
      <View style={styles.connectedCard}>
        <View style={styles.connectedHeader}>
          <View style={styles.podIconCircle}>
            <Text style={styles.podIconText}>◉</Text>
          </View>
          <View style={styles.connectedInfo}>
            <Text style={styles.connectedName}>ThePod</Text>
            <View style={styles.connectedBadgeRow}>
              <View style={styles.greenDot} />
              <Text style={styles.connectedBadge}>Connected via Bluetooth</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Hardware specs */}
      <Text style={styles.sectionTitle}>Hardware</Text>
      <View style={styles.card}>
        <SpecRow label="Device" value="Raspberry Pi 3A+" />
        <View style={styles.divider} />
        <SpecRow label="Processor" value="ARM Cortex-A53 · 1.4GHz" />
        <View style={styles.divider} />
        <SpecRow label="Memory" value="512MB RAM" />
        <View style={styles.divider} />
        <SpecRow label="DAC" value="PCM5122 · I2S" />
        <View style={styles.divider} />
        <SpecRow label="Output" value="3.5mm Analog" />
        <View style={styles.divider} />
        <SpecRow label="Firmware" value="1.0.0" />
      </View>

      {/* Storage */}
      <Text style={styles.sectionTitle}>Storage</Text>
      <View style={styles.card}>
        {storage ? (
          <>
            <View style={styles.storageBar}>
              <View style={[styles.storageBarFill, { width: `${usedPct}%` as any }]} />
            </View>
            <Text style={styles.storageText}>
              {storage.usedGB} GB used of {storage.totalGB} GB · {storage.trackCount} {storage.trackCount === 1 ? 'track' : 'tracks'}
            </Text>
          </>
        ) : (
          <ActivityIndicator color="#8E8E93" size="small" />
        )}
      </View>

      {/* Disconnect */}
      <Pressable style={styles.disconnectBtn} onPress={onDisconnect}>
        <Text style={styles.disconnectText}>Disconnect</Text>
      </Pressable>
    </View>
  );
}

function SignalBars({ rssi }: { rssi: number | null }) {
  if (rssi === null) return null;
  const color = rssi > -60 ? '#32D74B' : rssi > -75 ? '#FFD60A' : '#FF453A';
  return <Text style={[styles.rssi, { color }]}>{rssi} dBm</Text>;
}

function DeviceRow({ device, isConnected, isConnecting, onPress }: {
  device: Device;
  isConnected: boolean;
  isConnecting: boolean;
  onPress: () => void;
}) {
  const name = device.name ?? device.localName ?? 'Unknown';
  const isPod = name === POD_DEVICE_NAME;

  return (
    <Pressable
      style={[styles.deviceRow, isConnected && styles.deviceRowConnected, isPod && styles.deviceRowPod]}
      onPress={onPress}
      disabled={isConnecting}
    >
      <View style={styles.deviceIcon}>
        <Text style={styles.deviceIconText}>{isPod ? '◉' : '○'}</Text>
      </View>
      <View style={styles.deviceInfo}>
        <Text style={[styles.deviceName, isPod && styles.deviceNamePod]}>{name}</Text>
        <Text style={styles.deviceId} numberOfLines={1}>{device.id}</Text>
        {isConnected && <Text style={styles.connectedBadgeGreen}>● Connected</Text>}
      </View>
      <SignalBars rssi={device.rssi} />
    </Pressable>
  );
}

export default function PodScreen() {
  const { connectionState, device, scannedDevices, error, startScan, connect, disconnect } =
    useBluetoothStore();
  const { fetchLibrary, clear: clearLibrary } = useLibraryStore();
  const { refresh: refreshPlayer } = usePlayerStore();

  const isScanning = connectionState === 'scanning';
  const isConnecting = connectionState === 'connecting';
  const isConnected = connectionState === 'connected';

  const handleDisconnect = () => {
    Alert.alert('Disconnect', 'Disconnect from ThePod?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect', style: 'destructive', onPress: async () => {
          await disconnect();
          clearLibrary();
        },
      },
    ]);
  };

  const handleConnect = async (dev: Device) => {
    try {
      await connect(dev.id);
      await fetchLibrary();
      await refreshPlayer();
    } catch {
    }
  };

  if (isConnected) {
    return <ConnectedView onDisconnect={handleDisconnect} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.screenTitle}>Pod</Text>

      {/* Status */}
      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, {
            backgroundColor: isConnecting ? '#FFD60A' : isScanning ? '#FFD60A' : '#3A3A3C',
          }]} />
          <Text style={styles.statusText}>
            {isConnecting ? 'Connecting…' : isScanning ? 'Scanning…' : 'Not connected'}
          </Text>
        </View>
      </View>

      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Scan control */}
      <View style={styles.scanRow}>
        <Text style={styles.sectionLabel}>
          {isScanning ? 'Scanning for devices…' : `${scannedDevices.length} device${scannedDevices.length !== 1 ? 's' : ''} found`}
        </Text>
        <Pressable
          style={[styles.scanBtn, (isScanning || isConnecting) && styles.scanBtnDisabled]}
          onPress={startScan}
          disabled={isScanning || isConnecting}
        >
          {isScanning
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.scanBtnText}>Scan</Text>}
        </Pressable>
      </View>

      <FlatList
        data={scannedDevices}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <DeviceRow
            device={item}
            isConnected={false}
            isConnecting={isConnecting}
            onPress={() => handleConnect(item)}
          />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !isScanning ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>◎</Text>
              <Text style={styles.emptyText}>No devices found</Text>
              <Text style={styles.emptySub}>Make sure ThePod is powered on and nearby</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const BG = '#0A0A0A';
const SURFACE = '#141414';
const BORDER = '#1E1E1E';
const TEXT = '#FFFFFF';
const TEXT_SEC = '#8E8E93';
const GREEN = '#32D74B';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG, paddingTop: 60 },
  screenTitle: { color: TEXT, fontSize: 32, fontWeight: '700', paddingHorizontal: 20, marginBottom: 20 },

  connectedCard: {
    marginHorizontal: 20, marginBottom: 24,
    backgroundColor: SURFACE, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: GREEN,
  },
  connectedHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  podIconCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#2C2C2E', alignItems: 'center', justifyContent: 'center',
  },
  podIconText: { fontSize: 22, color: GREEN },
  connectedInfo: { flex: 1, gap: 4 },
  connectedName: { color: TEXT, fontSize: 17, fontWeight: '700' },
  connectedBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  greenDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: GREEN },
  connectedBadge: { color: GREEN, fontSize: 13, fontWeight: '500' },

  sectionTitle: { color: TEXT_SEC, fontSize: 12, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: 20, marginBottom: 8 },

  card: {
    marginHorizontal: 20, marginBottom: 24,
    backgroundColor: SURFACE, borderRadius: 16, padding: 16,
  },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  specLabel: { color: TEXT_SEC, fontSize: 15 },
  specValue: { color: TEXT, fontSize: 15, fontWeight: '500' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: BORDER },

  storageBar: { height: 6, backgroundColor: '#2C2C2E', borderRadius: 3, marginBottom: 10, overflow: 'hidden' },
  storageBarFill: { height: 6, backgroundColor: GREEN, borderRadius: 3 },
  storageText: { color: TEXT_SEC, fontSize: 13 },

  disconnectBtn: {
    marginHorizontal: 20, marginTop: 8, paddingVertical: 14,
    backgroundColor: '#2C0A0A', borderRadius: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#FF453A33',
  },
  disconnectText: { color: '#FF453A', fontSize: 16, fontWeight: '600' },

  statusCard: { marginHorizontal: 20, marginBottom: 16, backgroundColor: SURFACE, borderRadius: 14, padding: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: TEXT, fontSize: 15, fontWeight: '500' },

  errorCard: { marginHorizontal: 20, marginBottom: 12, backgroundColor: '#2C0000', borderRadius: 10, padding: 12 },
  errorText: { color: '#FF453A', fontSize: 13 },

  scanRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 },
  sectionLabel: { color: TEXT_SEC, fontSize: 13 },
  scanBtn: { paddingHorizontal: 18, paddingVertical: 8, backgroundColor: '#2C2C2E', borderRadius: 10, minWidth: 64, alignItems: 'center' },
  scanBtnDisabled: { opacity: 0.5 },
  scanBtnText: { color: TEXT, fontSize: 14, fontWeight: '500' },

  list: { paddingHorizontal: 20, paddingBottom: 100 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: SURFACE, borderRadius: 14, padding: 14, marginBottom: 10, gap: 12 },
  deviceRowConnected: { borderWidth: 1, borderColor: GREEN },
  deviceRowPod: { borderWidth: 1, borderColor: '#2C2C2E' },
  deviceIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2C2C2E', alignItems: 'center', justifyContent: 'center' },
  deviceIconText: { fontSize: 18, color: TEXT_SEC },
  deviceInfo: { flex: 1, gap: 3 },
  deviceName: { color: TEXT, fontSize: 15, fontWeight: '500' },
  deviceNamePod: { color: TEXT, fontWeight: '700' },
  deviceId: { color: TEXT_SEC, fontSize: 11 },
  connectedBadgeGreen: { color: GREEN, fontSize: 12, fontWeight: '600', marginTop: 2 },
  rssi: { fontSize: 12, fontWeight: '500' },

  emptyState: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyIcon: { fontSize: 40, color: TEXT_SEC },
  emptyText: { color: TEXT, fontSize: 17, fontWeight: '600' },
  emptySub: { color: TEXT_SEC, fontSize: 14, textAlign: 'center', paddingHorizontal: 20 },
});
