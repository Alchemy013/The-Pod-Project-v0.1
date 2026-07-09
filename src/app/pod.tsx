import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Device } from 'react-native-ble-plx';
import { useBluetoothStore } from '@/store/bluetooth.store';
import { useLibraryStore } from '@/store/library.store';
import { usePlayerStore } from '@/store/player.store';
import { podService } from '@/services/bluetooth/BluetoothService';
import { POD_DEVICE_NAME } from '@/services/bluetooth/protocol';
import { pickAudioFiles, uploadFiles, UploadProgress } from '@/services/transfer/UploadService';
import { isPodReachable, openWifiSettings } from '@/services/transfer/WifiService';

interface StorageInfo {
  totalGB: number;
  usedGB: number;
  freeGB: number;
  trackCount: number;
}

interface BatteryInfo {
  percent: number;
  charging: boolean;
  minutesRemaining: number | null;
}

type EqPreset = 'flat' | 'bass' | 'vocal' | 'treble';

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.specRow}>
      <Text style={s.specLabel}>{label}</Text>
      <Text style={s.specValue}>{value}</Text>
    </View>
  );
}

function ConnectedView({ onDisconnect, podIp, podPort }: {
  onDisconnect: () => void;
  podIp: string | null;
  podPort: number;
}) {
  const { fetchLibrary } = useLibraryStore();
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [battery, setBattery] = useState<BatteryInfo | null>(null);
  const [eqPreset, setEqPreset] = useState<EqPreset>('flat');
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadStep, setUploadStep] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  type WifiNetwork = { ssid: string; signal: number; secured: boolean };
  const [wifiStatus, setWifiStatus] = useState<{ ssid: string; ip: string; signal: number } | null>(null);
  const [wifiModal, setWifiModal] = useState(false);
  const [wifiNetworks, setWifiNetworks] = useState<WifiNetwork[]>([]);
  const [scanning, setScanning] = useState(false);
  const [selectedNet, setSelectedNet] = useState<WifiNetwork | null>(null);
  const [wifiPwd, setWifiPwd] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [wifiError, setWifiError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      podService.request({ cmd: 'GET_STORAGE' }, 10000)
        .then(res => { if (res.type === 'STORAGE') setStorage(res); })
        .catch(() => {});
      podService.request({ cmd: 'GET_BATTERY' }, 10000)
        .then(res => { if (res.type === 'BATTERY') setBattery(res); })
        .catch(() => {});
      podService.request({ cmd: 'GET_WIFI_STATUS' }, 8000)
        .then(res => { if (res.type === 'WIFI_STATUS') setWifiStatus(res); })
        .catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, []);

  const handleScanWifi = async () => {
    setScanning(true);
    setWifiNetworks([]);
    setSelectedNet(null);
    setWifiPwd('');
    setWifiError(null);
    setWifiModal(true);
    try {
      const res = await podService.request({ cmd: 'SCAN_WIFI' }, 25000);
      if (res.type === 'WIFI_SCAN') setWifiNetworks(res.networks ?? []);
    } catch {
      setWifiError('Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const handleConnectWifi = async () => {
    if (!selectedNet) return;
    setConnecting(true);
    setWifiError(null);
    try {
      const res = await podService.request(
        { cmd: 'CONNECT_WIFI', ssid: selectedNet.ssid, password: wifiPwd },
        35000,
      );
      if (res.type === 'WIFI_CONNECTED') {
        setWifiStatus({ ssid: res.ssid, ip: res.ip, signal: wifiStatus?.signal ?? 0 });
        setWifiModal(false);
        setSelectedNet(null);
        setWifiPwd('');
      } else {
        setWifiError(res.msg ?? 'Connection failed');
      }
    } catch {
      setWifiError('Connection timed out');
    } finally {
      setConnecting(false);
    }
  };

  const handleEqPreset = async (preset: EqPreset) => {
    setEqPreset(preset);
    podService.request({ cmd: 'SET_EQ', preset }, 10000).catch(() => {});
  };

  const handleUpload = async () => {
    if (!podIp) {
      Alert.alert('Not Connected', 'ThePod is not reachable. Make sure it is powered on.');
      return;
    }
    setUploadError(null);

    setUploadStep('Checking connection…');
    const reachable = await isPodReachable(podIp, podPort);
    setUploadStep(null);

    if (!reachable) {
      Alert.alert(
        'Connect to ThePod Wi-Fi',
        'Your iPhone needs to be on the ThePod Wi-Fi network to transfer music.\n\nSSID: ThePod\nPassword: thepodmusic',
        [
          { text: 'Open Wi-Fi Settings', onPress: openWifiSettings },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }

    const files = await pickAudioFiles();
    if (files.length === 0) return;

    abortRef.current = new AbortController();
    try {
      await uploadFiles(podIp, podPort, files, setUploadProgress, abortRef.current.signal);
      setUploadProgress(null);

      const count = files.length;
      setUploadSuccess(`${count} ${count === 1 ? 'file' : 'files'} added to library`);
      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setUploadSuccess(null), 4000);

      podService.request({ cmd: 'GET_STORAGE' }, 10000)
        .then(res => { if (res.type === 'STORAGE') setStorage(res); })
        .catch(() => {});
      fetchLibrary().catch(() => {});
    } catch (e: any) {
      setUploadProgress(null);
      if (e?.message !== 'Cancelled') setUploadError(e?.message ?? 'Upload failed');
    } finally {
      abortRef.current = null;
    }
  };

  const usedPct = storage ? (storage.usedGB / storage.totalGB) * 100 : 0;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.scrollContent}>
      <Text style={s.screenTitle}>Pod</Text>

      {/* Connection status card */}
      <View style={s.connectedCard}>
        <View style={s.connectedHeader}>
          <View style={s.podIconCircle}>
            <Text style={s.podIconText}>◉</Text>
          </View>
          <View style={s.connectedInfo}>
            <Text style={s.connectedName}>ThePod</Text>
            <View style={s.connectedBadgeRow}>
              <View style={s.greenDot} />
              <Text style={s.connectedBadge}>Connected via Bluetooth</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Hardware specs */}
      <Text style={s.sectionTitle}>Hardware</Text>
      <View style={s.card}>
        <SpecRow label="Device" value="Raspberry Pi Zero 2W" />
        <View style={s.divider} />
        <SpecRow label="Processor" value="ARM Cortex-A53 · 1.0GHz" />
        <View style={s.divider} />
        <SpecRow label="Memory" value="512MB RAM" />
        <View style={s.divider} />
        <SpecRow label="DAC" value="PCM5122 · I2S" />
        <View style={s.divider} />
        <SpecRow label="Output" value="3.5mm Analog" />
        <View style={s.divider} />
        <SpecRow label="Firmware" value="1.0.0" />
      </View>

      {/* WiFi Network */}
      <Text style={s.sectionTitle}>Network</Text>
      <View style={s.card}>
        <View style={s.wifiRow}>
          <View style={s.wifiInfo}>
            <Text style={s.rowTitle}>{wifiStatus?.ssid ?? 'Unknown Network'}</Text>
            <Text style={s.rowSub}>{wifiStatus?.ip ?? 'Getting IP…'}</Text>
          </View>
          <View style={[s.signalBadge, { opacity: wifiStatus ? 1 : 0.3 }]}>
            <Text style={s.signalText}>{wifiStatus ? `${wifiStatus.signal}%` : '—'}</Text>
          </View>
        </View>
        <Pressable style={s.wifiChangeBtn} onPress={handleScanWifi}>
          <Text style={s.wifiChangeBtnText}>Change Network</Text>
        </Pressable>
        <Text style={s.eqNote}>To use iPhone hotspot: enable Personal Hotspot in iPhone Settings first</Text>
      </View>

      {/* WiFi Modal */}
      <Modal visible={wifiModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setWifiModal(false)}>
        <View style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Select Network</Text>
            <Pressable onPress={() => setWifiModal(false)} hitSlop={16}>
              <Text style={s.modalClose}>✕</Text>
            </Pressable>
          </View>

          {scanning ? (
            <View style={s.modalCenter}>
              <ActivityIndicator color={ACCENT} size="large" />
              <Text style={s.rowSub}>Scanning for networks…</Text>
            </View>
          ) : selectedNet ? (
            <View style={s.modalPwdView}>
              <Text style={s.modalNetName}>{selectedNet.ssid}</Text>
              {selectedNet.secured ? (
                <TextInput
                  style={s.pwdInput}
                  placeholder="Password"
                  placeholderTextColor={TEXT_MUTE}
                  secureTextEntry
                  value={wifiPwd}
                  onChangeText={setWifiPwd}
                  autoFocus
                />
              ) : (
                <Text style={s.rowSub}>Open network — no password needed</Text>
              )}
              {wifiError && <Text style={s.uploadErrorText}>{wifiError}</Text>}
              <View style={s.modalBtnRow}>
                <Pressable style={s.modalBackBtn} onPress={() => { setSelectedNet(null); setWifiPwd(''); setWifiError(null); }}>
                  <Text style={s.modalBackText}>Back</Text>
                </Pressable>
                <Pressable
                  style={[s.modalConnectBtn, connecting && { opacity: 0.5 }]}
                  onPress={handleConnectWifi}
                  disabled={connecting}
                >
                  {connecting
                    ? <ActivityIndicator color={BG} size="small" />
                    : <Text style={s.modalConnectText}>Connect</Text>}
                </Pressable>
              </View>
            </View>
          ) : (
            <FlatList
              data={wifiNetworks}
              keyExtractor={item => item.ssid}
              contentContainerStyle={{ paddingBottom: 40 }}
              ListEmptyComponent={<Text style={s.emptySub}>No networks found</Text>}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [s.netRow, pressed && { opacity: 0.6 }]}
                  onPress={() => { setSelectedNet(item); setWifiPwd(''); setWifiError(null); }}
                >
                  <View style={s.netInfo}>
                    <Text style={s.rowTitle}>{item.ssid}</Text>
                    <Text style={s.rowSub}>{item.secured ? 'Secured' : 'Open'}</Text>
                  </View>
                  <Text style={s.netSignal}>{item.signal}%</Text>
                </Pressable>
              )}
            />
          )}
        </View>
      </Modal>

      {/* Spotify Connect */}
      <Text style={s.sectionTitle}>Spotify</Text>
      <View style={s.card}>
        <Text style={s.rowTitle}>Spotify Connect</Text>
        <Text style={s.rowSub}>
          Open Spotify → tap the speaker icon → choose "ThePod" to stream directly to this device.
        </Text>
        <View style={[s.connectedBadgeRow, { marginTop: 12 }]}>
          <View style={s.greenDot} />
          <Text style={s.connectedBadge}>Available as Spotify Connect device</Text>
        </View>
      </View>

      {/* Equalizer */}
      <Text style={s.sectionTitle}>Equalizer</Text>
      <View style={s.card}>
        <View style={s.eqRow}>
          {(['flat', 'bass', 'vocal', 'treble'] as EqPreset[]).map(preset => (
            <Pressable
              key={preset}
              style={[s.eqBtn, eqPreset === preset && s.eqBtnActive]}
              onPress={() => handleEqPreset(preset)}
            >
              <Text style={[s.eqBtnText, eqPreset === preset && s.eqBtnTextActive]}>
                {preset.charAt(0).toUpperCase() + preset.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.eqNote}>Requires one-time EQ setup on ThePod</Text>
      </View>

      {/* Battery */}
      <Text style={s.sectionTitle}>Power</Text>
      <View style={s.card}>
        {battery ? (
          <View style={s.batteryRow}>
            <View style={s.batteryIconWrap}>
              <View style={s.batteryIcon}>
                <View style={[s.batteryFill, { width: `${battery.percent}%` as any }]} />
              </View>
              <View style={s.batteryNub} />
            </View>
            <Text style={s.batteryPct}>{battery.percent}%</Text>
            <Text style={s.batteryStatus}>
              {battery.charging ? 'Charging' : 'On battery'}
            </Text>
          </View>
        ) : (
          <ActivityIndicator color={TEXT_SEC} size="small" />
        )}
      </View>

      {/* Storage */}
      <Text style={s.sectionTitle}>Storage</Text>
      <View style={s.card}>
        {storage ? (
          <>
            <View style={s.storageBar}>
              <View style={[s.storageBarFill, { width: `${usedPct}%` as any }]} />
            </View>
            <Text style={s.storageText}>
              {storage.usedGB} GB used of {storage.totalGB} GB · {storage.trackCount} {storage.trackCount === 1 ? 'track' : 'tracks'}
            </Text>
          </>
        ) : (
          <ActivityIndicator color={TEXT_SEC} size="small" />
        )}
      </View>

      {/* Upload Music */}
      <Text style={s.sectionTitle}>Music</Text>
      <View style={s.card}>
        {uploadStep ? (
          <>
            <ActivityIndicator color={ACCENT} size="small" style={{ marginBottom: 10 }} />
            <Text style={s.uploadStatusText}>{uploadStep}</Text>
          </>
        ) : uploadProgress ? (
          <>
            <View style={s.uploadProgressBar}>
              <View style={[
                s.uploadProgressFill,
                {
                  width: `${uploadProgress.bytesTotal > 0
                    ? Math.round((uploadProgress.bytesSent / uploadProgress.bytesTotal) * 100)
                    : 0}%` as any,
                },
              ]} />
            </View>
            <Text style={s.uploadStatusText}>
              {uploadProgress.index}/{uploadProgress.total} — {uploadProgress.file}
            </Text>
            {uploadProgress.bytesTotal > 0 && (
              <Text style={s.uploadPctText}>
                {Math.round((uploadProgress.bytesSent / uploadProgress.bytesTotal) * 100)}%
              </Text>
            )}
          </>
        ) : uploadSuccess ? (
          <View style={s.uploadSuccessRow}>
            <Text style={s.uploadSuccessText}>✓ {uploadSuccess}</Text>
          </View>
        ) : (
          <Pressable style={s.uploadBtn} onPress={handleUpload}>
            <Text style={s.uploadBtnText}>+ Add Music from Files</Text>
          </Pressable>
        )}
        {uploadError && <Text style={s.uploadErrorText}>{uploadError}</Text>}
      </View>

      {/* Disconnect */}
      <Pressable style={s.disconnectBtn} onPress={onDisconnect}>
        <Text style={s.disconnectText}>Disconnect</Text>
      </Pressable>

      {/* Power off */}
      <Pressable
        style={s.powerBtn}
        onPress={() => {
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
                  onDisconnect();
                },
              },
            ],
          );
        }}
      >
        <Text style={s.powerText}>Power Off Pod</Text>
      </Pressable>
    </ScrollView>
  );
}

function SignalBars({ rssi }: { rssi: number | null }) {
  if (rssi === null) return null;
  const color = rssi > -60 ? GREEN : rssi > -75 ? '#FFD60A' : '#FF453A';
  return <Text style={[s.rssi, { color }]}>{rssi} dBm</Text>;
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
      style={[s.deviceRow, isConnected && s.deviceRowConnected, isPod && s.deviceRowPod]}
      onPress={onPress}
      disabled={isConnecting}
    >
      <View style={s.deviceIcon}>
        <Text style={s.deviceIconText}>{isPod ? '◉' : '○'}</Text>
      </View>
      <View style={s.deviceInfo}>
        <Text style={[s.deviceName, isPod && s.deviceNamePod]}>{name}</Text>
        <Text style={s.deviceId} numberOfLines={1}>{device.id}</Text>
        {isConnected && <Text style={s.connectedBadgeGreen}>● Connected</Text>}
      </View>
      <SignalBars rssi={device.rssi} />
    </Pressable>
  );
}

export default function PodScreen() {
  const { connectionState, device, scannedDevices, error, podIp, podPort, startScan, connect, disconnect } =
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
    return <ConnectedView onDisconnect={handleDisconnect} podIp={podIp} podPort={podPort} />;
  }

  return (
    <SafeAreaView style={s.container}>
      <Text style={s.screenTitle}>Pod</Text>

      {/* Status */}
      <View style={s.statusCard}>
        <View style={s.statusRow}>
          <View style={[s.statusDot, {
            backgroundColor: isConnecting ? '#FFD60A' : isScanning ? ACCENT : TEXT_MUTE,
          }]} />
          <Text style={s.statusText}>
            {isConnecting ? 'Connecting…' : isScanning ? 'Scanning…' : 'Not connected'}
          </Text>
        </View>
      </View>

      {error && (
        <View style={s.errorCard}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      {/* Scan control */}
      <View style={s.scanRow}>
        <Text style={s.sectionLabel}>
          {isScanning ? 'Scanning for devices…' : `${scannedDevices.length} device${scannedDevices.length !== 1 ? 's' : ''} found`}
        </Text>
        <Pressable
          style={[s.scanBtn, (isScanning || isConnecting) && s.scanBtnDisabled]}
          onPress={startScan}
          disabled={isScanning || isConnecting}
        >
          {isScanning
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.scanBtnText}>Scan</Text>}
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
        contentContainerStyle={s.list}
        ListEmptyComponent={
          !isScanning ? (
            <View style={s.emptyState}>
              <Text style={s.emptyIcon}>◎</Text>
              <Text style={s.emptyText}>No devices found</Text>
              <Text style={s.emptySub}>Make sure ThePod is powered on and nearby</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const BG = '#121212';
const SURFACE = '#181818';
const SURFACE_HIGH = '#282828';
const TEXT = '#FFFFFF';
const TEXT_SEC = '#B3B3B3';
const TEXT_MUTE = '#535353';
const GREEN = '#32D74B';
const ACCENT = '#A855F7';

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scrollContent: { paddingTop: 60, paddingBottom: 120 },
  screenTitle: { color: TEXT, fontSize: 32, fontWeight: '800', letterSpacing: -0.5, paddingHorizontal: 20, marginBottom: 20, paddingTop: 16 },

  connectedCard: {
    marginHorizontal: 20, marginBottom: 24,
    backgroundColor: SURFACE, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: ACCENT,
  },
  connectedHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  podIconCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: SURFACE_HIGH, alignItems: 'center', justifyContent: 'center',
  },
  podIconText: { fontSize: 22, color: ACCENT },
  connectedInfo: { flex: 1, gap: 4 },
  connectedName: { color: TEXT, fontSize: 17, fontWeight: '700' },
  connectedBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  greenDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: GREEN },
  connectedBadge: { color: GREEN, fontSize: 13, fontWeight: '500' },

  sectionTitle: {
    color: TEXT_SEC, fontSize: 11, fontWeight: '600',
    letterSpacing: 1.0, textTransform: 'uppercase',
    paddingHorizontal: 20, marginBottom: 8,
  },

  card: {
    marginHorizontal: 20, marginBottom: 24,
    backgroundColor: SURFACE, borderRadius: 12, padding: 16,
  },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  specLabel: { color: TEXT_SEC, fontSize: 15 },
  specValue: { color: TEXT, fontSize: 15, fontWeight: '500' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: SURFACE_HIGH },

  eqRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  eqBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center', backgroundColor: SURFACE_HIGH },
  eqBtnActive: { backgroundColor: ACCENT },
  eqBtnText: { color: TEXT_SEC, fontSize: 13, fontWeight: '600' },
  eqBtnTextActive: { color: TEXT },
  eqNote: { color: TEXT_MUTE, fontSize: 11, textAlign: 'center' },

  batteryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  batteryIconWrap: { flexDirection: 'row', alignItems: 'center' },
  batteryIcon: {
    width: 36, height: 18, borderRadius: 4,
    borderWidth: 1.5, borderColor: TEXT_SEC,
    padding: 2, overflow: 'hidden',
  },
  batteryFill: { height: '100%', backgroundColor: ACCENT, borderRadius: 2 },
  batteryNub: { width: 3, height: 8, backgroundColor: TEXT_SEC, borderRadius: 1, marginLeft: 2 },
  batteryPct: { color: TEXT, fontSize: 15, fontWeight: '600' },
  batteryStatus: { color: TEXT_SEC, fontSize: 13 },

  storageBar: { height: 4, backgroundColor: SURFACE_HIGH, borderRadius: 2, marginBottom: 10, overflow: 'hidden' },
  storageBarFill: { height: 4, backgroundColor: ACCENT, borderRadius: 2 },
  storageText: { color: TEXT_SEC, fontSize: 13 },

  uploadBtn: { paddingVertical: 12, alignItems: 'center' },
  uploadBtnText: { color: TEXT, fontSize: 15, fontWeight: '500' },
  uploadStatusText: { color: TEXT_SEC, fontSize: 13, textAlign: 'center', marginTop: 2 },
  uploadPctText: { color: TEXT_MUTE, fontSize: 11, textAlign: 'center', marginTop: 4 },
  uploadProgressBar: { height: 4, backgroundColor: SURFACE_HIGH, borderRadius: 2, marginBottom: 8, overflow: 'hidden' },
  uploadProgressFill: { height: 4, backgroundColor: ACCENT, borderRadius: 2 },
  uploadSuccessRow: { paddingVertical: 10, alignItems: 'center' },
  uploadSuccessText: { color: ACCENT, fontSize: 14, fontWeight: '600' },
  uploadErrorText: { color: '#FF453A', fontSize: 13, marginTop: 8, textAlign: 'center' },

  disconnectBtn: {
    marginHorizontal: 20, marginTop: 8, paddingVertical: 14,
    backgroundColor: '#2C0A0A', borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: '#FF453A33',
  },
  disconnectText: { color: '#FF453A', fontSize: 16, fontWeight: '600' },
  powerBtn: {
    marginHorizontal: 20, marginTop: 10, marginBottom: 8, paddingVertical: 14,
    borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: SURFACE_HIGH,
  },
  powerText: { color: TEXT_MUTE, fontSize: 15, fontWeight: '500' },

  statusCard: { marginHorizontal: 20, marginBottom: 16, backgroundColor: SURFACE, borderRadius: 12, padding: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: TEXT, fontSize: 15, fontWeight: '500' },

  errorCard: { marginHorizontal: 20, marginBottom: 12, backgroundColor: '#2C0000', borderRadius: 10, padding: 12 },
  errorText: { color: '#FF453A', fontSize: 13 },

  scanRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 },
  sectionLabel: { color: TEXT_SEC, fontSize: 13 },
  scanBtn: { paddingHorizontal: 18, paddingVertical: 8, backgroundColor: SURFACE_HIGH, borderRadius: 8, minWidth: 64, alignItems: 'center' },
  scanBtnDisabled: { opacity: 0.4 },
  scanBtnText: { color: TEXT, fontSize: 14, fontWeight: '500' },

  list: { paddingHorizontal: 20, paddingBottom: 100 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: SURFACE, borderRadius: 12, padding: 14, marginBottom: 8, gap: 12 },
  deviceRowConnected: { borderWidth: 1, borderColor: GREEN },
  deviceRowPod: { borderWidth: 1, borderColor: ACCENT },
  deviceIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: SURFACE_HIGH, alignItems: 'center', justifyContent: 'center' },
  deviceIconText: { fontSize: 18, color: TEXT_SEC },
  deviceInfo: { flex: 1, gap: 3 },
  deviceName: { color: TEXT, fontSize: 15, fontWeight: '500' },
  deviceNamePod: { color: TEXT, fontWeight: '700' },
  deviceId: { color: TEXT_MUTE, fontSize: 11 },
  connectedBadgeGreen: { color: GREEN, fontSize: 12, fontWeight: '600', marginTop: 2 },
  rssi: { fontSize: 12, fontWeight: '500' },

  emptyState: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyIcon: { fontSize: 40, color: TEXT_MUTE },
  emptyText: { color: TEXT, fontSize: 17, fontWeight: '600' },
  emptySub: { color: TEXT_SEC, fontSize: 14, textAlign: 'center', paddingHorizontal: 20, paddingTop: 40 },

  // WiFi section
  wifiRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  wifiInfo: { flex: 1 },
  signalBadge: { backgroundColor: SURFACE_HIGH, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  signalText: { color: TEXT_SEC, fontSize: 12, fontWeight: '600' },
  wifiChangeBtn: {
    paddingVertical: 10, borderRadius: 8,
    borderWidth: 1, borderColor: SURFACE_HIGH,
    alignItems: 'center', marginBottom: 10,
  },
  wifiChangeBtnText: { color: TEXT, fontSize: 14, fontWeight: '500' },

  // WiFi modal
  modalContainer: { flex: 1, backgroundColor: BG },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE_HIGH,
  },
  modalTitle: { color: TEXT, fontSize: 20, fontWeight: '700' },
  modalClose: { color: TEXT_SEC, fontSize: 18, fontWeight: '600' },
  modalCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  netRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE_HIGH,
  },
  netInfo: { flex: 1 },
  netSignal: { color: TEXT_MUTE, fontSize: 13 },

  // Password screen
  modalPwdView: { padding: 24, gap: 16 },
  modalNetName: { color: TEXT, fontSize: 20, fontWeight: '700', marginBottom: 4 },
  pwdInput: {
    backgroundColor: SURFACE_HIGH, borderRadius: 8, paddingHorizontal: 14,
    paddingVertical: 12, color: TEXT, fontSize: 16,
  },
  modalBtnRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBackBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 8,
    borderWidth: 1, borderColor: SURFACE_HIGH, alignItems: 'center',
  },
  modalBackText: { color: TEXT_SEC, fontSize: 15, fontWeight: '500' },
  modalConnectBtn: {
    flex: 2, paddingVertical: 13, borderRadius: 8,
    backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center',
    minHeight: 46,
  },
  modalConnectText: { color: TEXT, fontSize: 15, fontWeight: '700' },
});
