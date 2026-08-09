import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/ui/icons';
import { useBluetoothStore } from '@/store/bluetooth.store';
import { useLibraryStore } from '@/store/library.store';
import { usePodInfoStore } from '@/store/pod.store';
import { pickAudioFiles, uploadFiles, UploadFile, UploadProgress } from '@/services/transfer/UploadService';
import { isPodReachable, openWifiSettings } from '@/services/transfer/WifiService';
import { Palette, Font, Radius, Type } from '@/constants/theme';
import { PillButton } from '@/components/ui/controls';

type FileState = 'queued' | 'active' | 'done';

type Row = { name: string; mb: number; pct: number; state: FileState };

const MB = 1024 * 1024;

export default function TransferScreen() {
  const { podIp, podPort } = useBluetoothStore();
  const { fetchLibrary } = useLibraryStore();
  const { storage, refreshStorage } = usePodInfoStore();

  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { refreshStorage(); }, []);

  // The upload loop reports (index, bytesSent, bytesTotal); everything before
  // the active index has finished and everything after is still queued.
  const applyProgress = (p: UploadProgress) => {
    const pct = p.bytesTotal > 0 ? Math.min(100, Math.round((p.bytesSent / p.bytesTotal) * 100)) : 0;
    setRows((prev) =>
      prev.map((row, i) => {
        if (i < p.index - 1) return { ...row, pct: 100, state: 'done' };
        if (i === p.index - 1) return { ...row, pct, state: pct >= 100 ? 'done' : 'active' };
        return row;
      }),
    );
  };

  const start = async (files: UploadFile[]) => {
    setRows(files.map((f, i) => ({
      name: f.name,
      mb: f.size / MB,
      pct: 0,
      state: i === 0 ? 'active' : 'queued',
    })));
    setBusy(true);
    setError(null);
    abortRef.current = new AbortController();
    try {
      await uploadFiles(podIp!, podPort, files, applyProgress, abortRef.current.signal);
      setRows((prev) => prev.map((r) => ({ ...r, pct: 100, state: 'done' })));
      refreshStorage();
      fetchLibrary().catch(() => {});
    } catch (e: any) {
      if (e?.message !== 'Cancelled') setError(e?.message ?? 'Upload failed');
      else setRows([]);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const handleAdd = async () => {
    if (!podIp) {
      Alert.alert('No address for the Pod', 'Reconnect over Bluetooth so the app can learn the Pod’s Wi-Fi address.');
      return;
    }
    setError(null);
    setStep('Checking the Pod is reachable…');
    const reachable = await isPodReachable(podIp, podPort);
    setStep(null);

    if (!reachable) {
      Alert.alert(
        'Pod not reachable',
        `Files transfer over Wi-Fi, not Bluetooth. Put this iPhone on the same network as ThePod (it answers at ThePod.local, currently ${podIp}) and try again.`,
        [
          { text: 'Open Wi-Fi settings', onPress: openWifiSettings },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }

    const files = await pickAudioFiles();
    if (files.length > 0) start(files);
  };

  const done = rows.filter((r) => r.state === 'done').length;
  const overall = rows.length ? rows.reduce((sum, r) => sum + r.pct, 0) / rows.length : 0;
  const usedPct = storage ? Math.min(100, (storage.usedGB / storage.totalGB) * 100) : 0;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} contentInsetAdjustmentBehavior="automatic">
      <View style={s.card}>
        <View style={s.cardHead}>
          <Text style={s.cardTitle}>
            {rows.length ? `${done} of ${rows.length} complete` : 'Nothing transferring'}
          </Text>
          {!!storage && <Text style={s.mono}>{storage.freeGB} GB free</Text>}
        </View>
        <View style={s.bar}>
          <View style={[s.barFill, { width: `${rows.length ? overall : usedPct}%` }]} />
        </View>
        <Text style={s.caption}>
          {rows.length
            ? 'Wi-Fi direct to the Pod. Leave this screen open until it finishes.'
            : storage
              ? `${storage.usedGB} GB used of ${storage.totalGB} GB · ${storage.trackCount} tracks`
              : 'Reading storage from the Pod…'}
        </Text>
      </View>

      {rows.map((row, i) => (
        <View key={`${row.name}-${i}`} style={s.row}>
          <View style={[s.rowIcon, {
            backgroundColor: row.state === 'done' ? '#0F1F12' : row.state === 'active' ? Palette.accentWash : Palette.rail,
          }]}>
            <Icon
              name={row.state === 'done' ? 'check' : 'download'}
              size={15}
              color={row.state === 'done' ? Palette.success : row.state === 'active' ? Palette.accent : Palette.inactive}
              strokeWidth={2.5}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
            <Text
              style={[s.rowName, row.state === 'queued' && { color: Palette.textSecondary }]}
              numberOfLines={1}
            >
              {row.name}
            </Text>
            {row.state === 'active' ? (
              <View style={s.rowBar}><View style={[s.rowBarFill, { width: `${row.pct}%` }]} /></View>
            ) : (
              <Text style={s.mono}>{row.mb.toFixed(1)} MB · {row.state === 'done' ? 'Done' : 'Queued'}</Text>
            )}
          </View>
          {row.state === 'active' && <Text style={[s.mono, { color: Palette.accent }]}>{row.pct}%</Text>}
        </View>
      ))}

      {!!error && <Text style={s.error}>{error}</Text>}
      {!!step && <Text style={s.caption}>{step}</Text>}

      <View style={s.actions}>
        {busy ? (
          <PillButton label="Cancel transfer" variant="danger" onPress={() => abortRef.current?.abort()} />
        ) : (
          <>
            <PillButton label="Add music from Files" variant="accent" onPress={handleAdd} />
            {rows.length > 0 && <PillButton label="Clear list" onPress={() => setRows([])} />}
          </>
        )}
      </View>

      <Text style={s.note}>
        Control travels over Bluetooth; audio files go over Wi-Fi to the Pod’s built-in server, which re-scans the
        library once a file lands.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg },
  content: { padding: 20, paddingBottom: 60 },

  card: { backgroundColor: Palette.surface, borderRadius: Radius.card, padding: 16, gap: 10, marginBottom: 18 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  cardTitle: { fontFamily: Font.heading, fontSize: Type.headline, color: Palette.text },
  bar: { height: 8, borderRadius: 4, backgroundColor: Palette.control, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: Palette.accent },
  caption: { fontFamily: Font.regular, fontSize: Type.caption, color: Palette.textMuted },
  mono: { fontFamily: Font.mono, fontSize: Type.micro, color: Palette.textMuted },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Palette.rail },
  rowIcon: { width: 34, height: 34, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  rowName: { fontFamily: Font.medium, fontSize: Type.callout, color: Palette.text },
  rowBar: { height: 3, borderRadius: 2, backgroundColor: Palette.control, overflow: 'hidden' },
  rowBarFill: { height: 3, backgroundColor: Palette.accent },

  actions: { gap: 10, paddingTop: 22 },
  error: { fontFamily: Font.regular, fontSize: Type.callout, color: Palette.danger, paddingTop: 12 },
  note: { fontFamily: Font.regular, fontSize: Type.caption, lineHeight: 18, color: Palette.textMuted, paddingTop: 20 },
});
