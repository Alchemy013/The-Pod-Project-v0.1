import { useEffect } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { Device } from 'react-native-ble-plx';
import { Icon } from '@/components/ui/icons';
import { useBluetoothStore } from '@/store/bluetooth.store';
import { POD_DEVICE_NAME } from '@/services/bluetooth/protocol';
import { Palette, Font, Radius, Type } from '@/constants/theme';
import { Sheet } from '@/components/ui/Sheet';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Pressed } from '@/components/ui/controls';

type RowState = 'connected' | 'connecting' | 'none';

function DeviceRow({ device, state, onPress }: {
  device: Device;
  state: RowState;
  onPress: () => void;
}) {
  const name = device.name ?? device.localName ?? 'Unknown Device';
  const isPod = name === POD_DEVICE_NAME;

  return (
    <Pressed
      style={s.row}
      label={name}
      selected={state === 'connected'}
      onPress={onPress}
      disabled={state === 'connecting'}
    >
      <View style={s.icon}>
        <View style={[s.iconRing, { borderColor: isPod ? Palette.accent : Palette.textSecondary }]}>
          {isPod && <View style={s.iconDot} />}
        </View>
      </View>
      <View style={s.info}>
        <Text style={[s.name, isPod && s.namePod]} numberOfLines={1}>{name}</Text>
        <Text style={s.status}>
          {state === 'connecting' ? 'Connecting…' : device.id}
        </Text>
      </View>
      {state === 'connected' && (
        <Icon name="check" size={18} color={Palette.accent} />
      )}
      {state === 'connecting' && <ActivityIndicator size="small" color={Palette.textSecondary} />}
    </Pressed>
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
              <SectionHeader>My devices</SectionHeader>
              <DeviceRow device={device} state="connected" onPress={() => handlePress(device)} />
              <View style={{ height: 20 }} />
              <SectionHeader>Other devices</SectionHeader>
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
  subtitle: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: Type.callout },
  error: { color: Palette.danger, fontFamily: Font.regular, fontSize: Type.callout, paddingHorizontal: 20, marginBottom: 10 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 20, marginBottom: 10, padding: 14,
    backgroundColor: Palette.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Palette.rail,
  },
  icon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Palette.control, alignItems: 'center', justifyContent: 'center',
  },
  iconRing: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  iconDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Palette.accent },
  info: { flex: 1, gap: 3 },
  name: { color: Palette.text, fontFamily: Font.medium, fontSize: Type.headline },
  namePod: { fontFamily: Font.heading },
  status: { color: Palette.textMuted, fontFamily: Font.mono, fontSize: Type.micro },
  empty: {
    color: Palette.textSecondary, fontFamily: Font.regular, fontSize: Type.body,
    textAlign: 'center', paddingHorizontal: 30, paddingTop: 40,
  },
});
