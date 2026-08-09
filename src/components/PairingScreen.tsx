import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Device } from 'react-native-ble-plx';
import { useBluetoothStore } from '@/store/bluetooth.store';
import { POD_DEVICE_NAME } from '@/services/bluetooth/protocol';
import { Palette, Font, Radius } from '@/constants/theme';
import { HeaderWash, PillButton, Pulse } from '@/components/ui/controls';

const SAVED_DEVICE_KEY = 'thepod_device_id';

function rssiColor(rssi: number | null): string {
  if (rssi == null) return Palette.textMuted;
  if (rssi > -60) return Palette.success;
  if (rssi > -75) return Palette.warning;
  return Palette.danger;
}

function DeviceCard({ device, isPod, onPress }: { device: Device; isPod: boolean; onPress: () => void }) {
  const name = device.name ?? device.localName ?? 'Unknown';
  return (
    <Pressable
      style={({ pressed }) => [s.card, { borderColor: isPod ? Palette.accent : Palette.rail }, pressed && { opacity: 0.7 }]}
      onPress={onPress}
    >
      <View style={s.cardIcon}>
        <View style={[s.cardRing, { borderColor: isPod ? Palette.accent : Palette.textSecondary }]}>
          {isPod && <View style={s.cardDot} />}
        </View>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={[s.cardName, isPod && { fontFamily: Font.heading }]} numberOfLines={1}>{name}</Text>
        <Text style={s.cardId} numberOfLines={1}>{device.id}</Text>
      </View>
      <Text style={[s.rssi, { color: rssiColor(device.rssi) }]}>
        {device.rssi != null ? `${device.rssi} dBm` : '—'}
      </Text>
    </Pressable>
  );
}

/**
 * Shown whenever BLE is down. Two moods off the same machinery: "Pair" on a
 * fresh install, and "Lost connection" once a Pod has been paired before —
 * the Pod keeps playing either way, so the copy shouldn't read like a failure.
 */
export function PairingScreen() {
  const insets = useSafeAreaInsets();
  const { connectionState, scannedDevices, error, startScan, connect, awaitingPod } = useBluetoothStore();
  const [savedId, setSavedId] = useState<string | null | undefined>(undefined);
  const [browsing, setBrowsing] = useState(false);

  const isScanning = connectionState === 'scanning';
  const isConnecting = connectionState === 'connecting';
  const target = scannedDevices.find((d) => (d.name ?? d.localName) === POD_DEVICE_NAME) ?? scannedDevices[0] ?? null;

  useEffect(() => {
    AsyncStorage.getItem(SAVED_DEVICE_KEY).then(setSavedId).catch(() => setSavedId(null));
  }, []);

  // `undefined` = the saved id hasn't been read yet. Committing to a mode
  // before then would flash a device picker at someone who already owns a Pod,
  // so the picker only appears once we *know* there is nothing paired.
  const paired = savedId === undefined ? null : !!savedId;
  // The device list exists for exactly one job: adopting a Pod for the first
  // time. Once one is paired this screen is a status screen, not a picker —
  // reconnection is automatic and there is nothing to choose.
  const picking = paired === false || browsing;

  // Auto-scan exactly once, and only once the store has settled on
  // 'disconnected' so this never races an in-flight autoConnect. Re-running on
  // every transition to 'disconnected' created an 8s loop: startScan() ends by
  // setting 'disconnected' and begins by clearing scannedDevices, so each scan
  // wiped its own results the instant it finished.
  //
  // Skipped entirely while a standing reconnect is armed: for a Pod that has
  // been paired before, iOS is already waiting on it, and scanning would only
  // cancel that to do the same job worse.
  const hasAutoScanned = useRef(false);
  useEffect(() => {
    if (!picking || hasAutoScanned.current) return;
    if (connectionState !== 'disconnected' || awaitingPod) return;
    hasAutoScanned.current = true;
    startScan();
  }, [picking, connectionState, awaitingPod, startScan]);

  const live = isScanning || awaitingPod || isConnecting;

  const status = isConnecting ? `Connecting to ${POD_DEVICE_NAME}…`
    : awaitingPod ? `Connecting to ${POD_DEVICE_NAME}…`
    : isScanning ? 'Looking for your Pod…'
    : picking ? (scannedDevices.length
        ? `${scannedDevices.length} Pod${scannedDevices.length === 1 ? '' : 's'} found`
        : 'Ready to look')
    : 'Not connected';

  return (
    <View style={[s.container, { paddingTop: insets.top + 10 }]}>
      <HeaderWash seedKey="pod-pairing" height={280} />

      <View style={s.head}>
        <Text style={s.title}>{picking ? 'Find your Pod' : 'Reconnect'}</Text>
        <Text style={s.body}>
          {picking
            ? `Power the Pod on and keep it within a few metres. It advertises as ${POD_DEVICE_NAME}.`
            : 'Playback continues on the Pod itself — the app reconnects as soon as it’s back in range.'}
        </Text>
      </View>

      <View style={s.radar}>
        <View style={s.radarRing}>
          {/* Slower pulse while merely waiting — it's a standing watch, not
              active work, and it shouldn't read as a spinner. */}
          <Pulse
            size={100}
            radius={50}
            active={live}
            durationMs={isScanning || isConnecting ? 1800 : 2600}
          />
          <View style={[s.radarInner, { borderColor: live ? Palette.accent : Palette.textSecondary }]}>
            <View style={[s.radarDot, { backgroundColor: live ? Palette.accent : Palette.textSecondary }]} />
          </View>
        </View>
        <Text style={[s.status, live && { color: Palette.accent }]}>{status}</Text>
      </View>

      {picking ? (
        <FlatList
          data={scannedDevices}
          keyExtractor={(d) => d.id}
          style={{ flex: 1 }}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <DeviceCard
              device={item}
              isPod={(item.name ?? item.localName) === POD_DEVICE_NAME}
              onPress={() => connect(item.id).catch(() => {})}
            />
          )}
          ListEmptyComponent={
            // "None found" would be a lie while waiting — nothing has scanned.
            live ? null : (
              <View style={s.empty}>
                <View style={s.emptyRing} />
                <Text style={s.emptyTitle}>No Pod found</Text>
                <Text style={s.emptyBody}>
                  Make sure ThePod is powered on and nearby. Advertising sometimes needs a nudge after boot.
                </Text>
              </View>
            )
          }
        />
      ) : (
        <View style={{ flex: 1 }} />
      )}

      {!!error && <Text style={s.error}>{error}</Text>}

      <View style={[s.cta, { paddingBottom: insets.bottom + 20 }]}>
        {picking ? (
          <PillButton
            label={isConnecting ? 'Connecting…'
              : isScanning ? 'Looking…'
              : target ? `Connect to ${target.name ?? POD_DEVICE_NAME}`
              : 'Look for a Pod'}
            variant="accent"
            onPress={() => (target && !isScanning ? connect(target.id).catch(() => {}) : startScan())}
          />
        ) : (
          <PillButton
            label={live ? 'Connecting…' : `Connect to ${POD_DEVICE_NAME}`}
            variant={live ? 'outline' : 'accent'}
            onPress={() => { if (!live && savedId) connect(savedId).catch(() => {}); }}
          />
        )}

        {/* Escape hatch for adopting a replacement Pod. Deliberately a quiet
            text link, not a second button — needing it is rare, and the whole
            point of this screen is that the common case has no choices on it. */}
        {paired && !browsing && (
          <Pressable
            style={s.linkBtn}
            onPress={() => { hasAutoScanned.current = false; setBrowsing(true); startScan(); }}
          >
            <Text style={s.linkText}>Pair a different Pod</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg },

  head: { paddingHorizontal: 24, gap: 10 },
  title: { fontFamily: Font.heading, fontSize: 29, lineHeight: 34, color: Palette.text },
  body: { fontFamily: Font.regular, fontSize: 15, lineHeight: 23, color: 'rgba(255,255,255,0.62)', maxWidth: 320 },

  radar: { alignItems: 'center', gap: 14, paddingTop: 26, paddingBottom: 22 },
  radarRing: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center',
  },
  radarInner: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radarDot: { width: 9, height: 9, borderRadius: 5 },
  status: { fontFamily: Font.medium, fontSize: 15, color: Palette.textSecondary },

  list: { paddingHorizontal: 20 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 10,
    backgroundColor: Palette.surface, borderRadius: Radius.lg, borderWidth: 1,
  },
  cardIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Palette.control,
    alignItems: 'center', justifyContent: 'center',
  },
  cardRing: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  cardDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Palette.accent },
  cardName: { fontFamily: Font.medium, fontSize: 15, color: Palette.text },
  cardId: { fontFamily: Font.mono, fontSize: 11, color: Palette.textSecondary },
  rssi: { fontFamily: Font.mono, fontSize: 12 },

  empty: { alignItems: 'center', gap: 9, paddingTop: 30, paddingHorizontal: 20 },
  emptyRing: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderStyle: 'dashed', borderColor: Palette.control },
  emptyTitle: { fontFamily: Font.heading, fontSize: 18, color: Palette.text },
  emptyBody: { fontFamily: Font.regular, fontSize: 14, lineHeight: 21, color: Palette.textSecondary, textAlign: 'center' },

  error: { fontFamily: Font.regular, fontSize: 13, color: Palette.danger, textAlign: 'center', paddingHorizontal: 20 },
  cta: { paddingHorizontal: 20, paddingTop: 14 },
  linkBtn: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  linkText: { fontFamily: Font.medium, fontSize: 14, color: Palette.textSecondary },
});
