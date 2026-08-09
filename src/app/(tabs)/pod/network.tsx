import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { podService } from '@/services/bluetooth/BluetoothService';
import { usePodInfoStore } from '@/store/pod.store';
import { Palette, Font, Radius, Type } from '@/constants/theme';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { RowTitle, RowSubtitle } from '@/components/ui/Row';
import { PillButton, Pressed } from '@/components/ui/controls';

type WifiNetwork = { ssid: string; signal: number; secured: boolean };

export default function NetworkScreen() {
  const { wifiStatus, refreshWifiStatus, setWifiStatus } = usePodInfoStore();

  const [browsing, setBrowsing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [selectedNet, setSelectedNet] = useState<WifiNetwork | null>(null);
  const [wifiPwd, setWifiPwd] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [wifiError, setWifiError] = useState<string | null>(null);

  useEffect(() => {
    refreshWifiStatus();
  }, []);

  const handleScan = async () => {
    setBrowsing(true);
    setScanning(true);
    setNetworks([]);
    setSelectedNet(null);
    setWifiPwd('');
    setWifiError(null);
    try {
      const res = await podService.request({ cmd: 'SCAN_WIFI' }, 25000);
      if (res.type === 'WIFI_SCAN') setNetworks(res.networks ?? []);
    } catch {
      setWifiError('Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const handleConnect = async () => {
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
        setBrowsing(false);
        setSelectedNet(null);
        setWifiPwd('');
      } else {
        setWifiError(res.type === 'ERROR' ? res.msg : 'Connection failed');
      }
    } catch {
      setWifiError('Connection timed out');
    } finally {
      setConnecting(false);
    }
  };

  if (!browsing) {
    return (
      <View style={s.container}>
        <SectionHeader>Current network</SectionHeader>
        <Card>
          <View style={s.statusRow}>
            <View style={s.statusInfo}>
              <RowTitle>{wifiStatus?.ssid ?? 'Unknown Network'}</RowTitle>
              <RowSubtitle>{wifiStatus?.ip ?? 'Getting IP…'}</RowSubtitle>
            </View>
            <View style={[s.signalBadge, { opacity: wifiStatus ? 1 : 0.3 }]}>
              <Text style={s.signalText}>{wifiStatus ? `${wifiStatus.signal}%` : '—'}</Text>
            </View>
          </View>
        </Card>

        <View style={s.buttons}>
          <PillButton label="Scan for networks" variant="accent" onPress={handleScan} />
        </View>
        <Text style={s.note}>
          The Pod also answers as ThePod.local, so file transfer keeps working when its address changes. To use an
          iPhone hotspot, turn on Personal Hotspot first, then scan.
        </Text>
      </View>
    );
  }

  if (selectedNet) {
    return (
      <View style={s.pwdContainer}>
        <Text style={s.pwdNetName}>{selectedNet.ssid}</Text>
        {selectedNet.secured ? (
          <TextInput
            style={s.pwdInput}
            placeholder="Password"
            placeholderTextColor={Palette.textMuted}
            secureTextEntry
            value={wifiPwd}
            onChangeText={setWifiPwd}
            autoFocus
          />
        ) : (
          <RowSubtitle>Open network — no password needed</RowSubtitle>
        )}
        {wifiError && <Text style={s.errorText}>{wifiError}</Text>}
        <View style={s.pwdBtnRow}>
          <Pressable style={s.backBtn} onPress={() => { setSelectedNet(null); setWifiPwd(''); setWifiError(null); }}>
            <Text style={s.backBtnText}>Back</Text>
          </Pressable>
          <Pressable
            style={[s.connectBtn, connecting && { opacity: 0.5 }]}
            onPress={handleConnect}
            disabled={connecting}
            accessibilityRole="button"
            accessibilityLabel="Connect"
            accessibilityState={{ disabled: connecting }}
          >
            {connecting
              ? <ActivityIndicator color={Palette.bg} size="small" />
              : <Text style={s.connectBtnText}>Connect</Text>}
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.listHeaderRow}>
        <Text style={s.listHeaderTitle}>Networks</Text>
        <Pressable onPress={() => setBrowsing(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={s.cancelText}>Cancel</Text>
        </Pressable>
      </View>
      {scanning ? (
        <View style={s.center}>
          {/* The one place a spinner is right, and it stays. A Wi-Fi scan has no
              known result shape — 0 to 30 networks with unknown names — so a
              skeleton would promise rows that may never exist. Everywhere else
              in the app, loading is a `Skeleton` of the thing that's coming. */}
          <ActivityIndicator color={Palette.textSecondary} size="large" />
          <RowSubtitle>Scanning for networks…</RowSubtitle>
        </View>
      ) : (
        <FlatList
          data={networks}
          keyExtractor={(item) => item.ssid}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={<Text style={s.emptySub}>No networks found</Text>}
          renderItem={({ item }) => (
            <Pressed
              style={s.netRow}
              label={item.ssid}
              onPress={() => { setSelectedNet(item); setWifiPwd(''); setWifiError(null); }}
            >
              <View style={s.netInfo}>
                <RowTitle>{item.ssid}</RowTitle>
                <RowSubtitle>{item.secured ? 'Secured' : 'Open'}</RowSubtitle>
              </View>
              <Text style={s.netSignal}>{item.signal}%</Text>
            </Pressed>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg, paddingTop: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },

  listHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 10,
  },
  listHeaderTitle: { color: Palette.text, fontFamily: Font.heading, fontSize: Type.title3 },
  cancelText: { color: Palette.accent, fontFamily: Font.medium, fontSize: Type.headline },

  statusRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  statusInfo: { flex: 1 },
  signalBadge: {
    backgroundColor: Palette.rail, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 5,
  },
  signalText: { color: Palette.textSecondary, fontFamily: Font.mono, fontSize: Type.caption },

  buttons: { paddingHorizontal: 20, paddingTop: 18 },
  note: {
    color: Palette.textMuted, fontFamily: Font.regular, fontSize: Type.caption, lineHeight: 18,
    paddingHorizontal: 20, paddingTop: 16,
  },

  netRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginBottom: 8, padding: 14,
    backgroundColor: Palette.surface, borderRadius: Radius.lg,
  },
  netInfo: { flex: 1 },
  netSignal: { color: Palette.textSecondary, fontFamily: Font.mono, fontSize: Type.caption },
  emptySub: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: Type.body, textAlign: 'center', paddingHorizontal: 20, paddingTop: 40 },

  pwdContainer: { flex: 1, backgroundColor: Palette.bg, padding: 24, gap: 16 },
  pwdNetName: { color: Palette.text, fontFamily: Font.heading, fontSize: Type.title3, marginBottom: 4 },
  pwdInput: {
    backgroundColor: Palette.surface, borderRadius: Radius.md, paddingHorizontal: 14,
    paddingVertical: 13, color: Palette.text, fontFamily: Font.regular, fontSize: Type.headline,
  },
  errorText: { color: Palette.danger, fontFamily: Font.regular, fontSize: Type.callout, marginTop: 8, textAlign: 'center' },
  pwdBtnRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  backBtn: {
    flex: 1, paddingVertical: 14, borderRadius: Radius.pill,
    borderWidth: 1, borderColor: Palette.inactive, alignItems: 'center',
  },
  backBtnText: { color: Palette.textSecondary, fontFamily: Font.bold, fontSize: Type.body },
  connectBtn: {
    flex: 2, paddingVertical: 14, borderRadius: Radius.pill,
    backgroundColor: Palette.accent, alignItems: 'center', justifyContent: 'center', minHeight: 48,
  },
  connectBtnText: { color: Palette.accentText, fontFamily: Font.bold, fontSize: Type.body },
});
