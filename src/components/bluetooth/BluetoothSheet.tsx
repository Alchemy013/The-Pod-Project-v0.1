import { useEffect } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Device } from 'react-native-ble-plx';
import { SymbolView } from 'expo-symbols';
import { useBluetoothStore } from '@/store/bluetooth.store';
import { POD_DEVICE_NAME } from '@/services/bluetooth/protocol';
import { Palette } from '@/constants/theme';
import { Sheet } from '@/components/ui/Sheet';
import { SectionHeader } from '@/components/ui/SectionHeader';

type RowState = 'connected' | 'connecting' | 'none';

function DeviceRow({ device, state, onPress }: {
  device: Device;
  state: RowState;
  onPress: () => void;
}) {
  const name = device.name ?? device.localName ?? 'Unknown Device';
  const isPod = name === POD_DEVICE_NAME;

  return (
    <Pressable
      style={({ pressed }) => [s.row, pressed && s.pressed]}
      onPress={onPress}
      disabled={state === 'connecting'}
    >
      <View style={s.icon}>
        <Text style={s.iconText}>{isPod ? '◉' : '○'}</Text>
      </View>
      <View style={s.info}>
        <Text style={[s.name, isPod && s.namePod]} numberOfLines={1}>{name}</Text>
        <Text style={s.status}>
          {state === 'connected' ? 'Connected' : state === 'connecting' ? 'Connecting…' : 'Not Connected'}
        </Text>
      </View>
      {state === 'connected' && (
        <SymbolView name="checkmark" style={s.check} type="monochrome" tintColor={Palette.accent} />
      )}
      {state === 'connecting' && <ActivityIndicator size="small" color={Palette.textSecondary} />}
    </Pressable>
  );
}

export function BluetoothSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { connectionState, device, scannedDevices, error, startScan, connect, disconnect } = useBluetoothStore();
  const isScanning = connectionState === 'scanning';
  const isConnecting = connectionState === 'connecting';
  const isConnected = connectionState === 'connected';

  useEffect(() => {
    if (visible && connectionState === 'disconnected') startScan();
  }, [visible]);

  const others = scannedDevices.filter((d) => !(isConnected && device?.id === d.id));

  const handlePress = async (dev: Device) => {
    if (isConnected && device?.id === dev.id) {
      Alert.alert(dev.name ?? dev.localName ?? 'Device', 'Manage this device', [
        { text: 'Disconnect', style: 'destructive', onPress: () => disconnect() },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    if (isConnected) await disconnect();
    connect(dev.id).catch(() => {});
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Bluetooth">
      <View style={s.subtitleRow}>
        {isScanning && <ActivityIndicator size="small" color={Palette.textSecondary} />}
        <Text style={s.subtitle}>{isScanning ? 'Searching…' : 'Nearby devices'}</Text>
      </View>

      {error && <Text style={s.error}>{error}</Text>}

      <FlatList
        style={{ flex: 1 }}
        data={others}
        keyExtractor={(d) => d.id}
        ListHeaderComponent={
          isConnected && device ? (
            <>
              <SectionHeader>My Devices</SectionHeader>
              <DeviceRow device={device} state="connected" onPress={() => handlePress(device)} />
              <View style={{ height: 20 }} />
              <SectionHeader>Other Devices</SectionHeader>
            </>
          ) : null
        }
        renderItem={({ item }) => (
          <DeviceRow
            device={item}
            state={isConnecting ? 'connecting' : 'none'}
            onPress={() => handlePress(item)}
          />
        )}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={
          !isScanning ? (
            <Text style={s.empty}>No devices found. Make sure ThePod is powered on and nearby.</Text>
          ) : null
        }
      />
    </Sheet>
  );
}

const s = StyleSheet.create({
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, marginBottom: 14 },
  subtitle: { color: Palette.textSecondary, fontSize: 13 },
  error: { color: Palette.danger, fontSize: 13, paddingHorizontal: 20, marginBottom: 10 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  pressed: { opacity: 0.6 },
  icon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Palette.surfaceHigh, alignItems: 'center', justifyContent: 'center',
  },
  iconText: { fontSize: 18, color: Palette.textSecondary },
  info: { flex: 1, gap: 2 },
  name: { color: Palette.text, fontSize: 15, fontWeight: '500' },
  namePod: { fontWeight: '700' },
  status: { color: Palette.textMuted, fontSize: 12 },
  check: { width: 18, height: 18 },
  empty: { color: Palette.textSecondary, fontSize: 14, textAlign: 'center', paddingHorizontal: 30, paddingTop: 40 },
});
