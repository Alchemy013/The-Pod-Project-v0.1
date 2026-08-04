import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBluetoothStore } from '@/store/bluetooth.store';
import { useLibraryStore } from '@/store/library.store';
import { usePodInfoStore } from '@/store/pod.store';
import { pickAudioFiles, uploadFiles, UploadProgress } from '@/services/transfer/UploadService';
import { isPodReachable, openWifiSettings } from '@/services/transfer/WifiService';
import { Palette, Radius } from '@/constants/theme';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';

export default function StorageScreen() {
  const { podIp, podPort } = useBluetoothStore();
  const { fetchLibrary } = useLibraryStore();
  const { storage, refreshStorage } = usePodInfoStore();

  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadStep, setUploadStep] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    refreshStorage();
  }, []);

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

      refreshStorage();
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
    <ScrollView style={s.container} contentContainerStyle={s.content} contentInsetAdjustmentBehavior="automatic">
      <SectionHeader>Storage</SectionHeader>
      <Card>
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
          <ActivityIndicator color={Palette.textSecondary} size="small" />
        )}
      </Card>

      <SectionHeader>Music</SectionHeader>
      <Card>
        {uploadStep ? (
          <>
            <ActivityIndicator color={Palette.textSecondary} size="small" style={{ marginBottom: 10 }} />
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
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Palette.bg },
  content: { paddingTop: 8, paddingBottom: 60 },

  storageBar: { height: 4, backgroundColor: Palette.surfaceHigh, borderRadius: 2, marginBottom: 10, overflow: 'hidden' },
  storageBarFill: { height: 4, backgroundColor: Palette.textSecondary, borderRadius: 2 },
  storageText: { color: Palette.textSecondary, fontSize: 13 },

  uploadBtn: { paddingVertical: 12, alignItems: 'center', backgroundColor: Palette.surfaceHigh, borderRadius: Radius.md },
  uploadBtnText: { color: Palette.text, fontSize: 15, fontWeight: '600' },
  uploadStatusText: { color: Palette.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 2 },
  uploadPctText: { color: Palette.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 4 },
  uploadProgressBar: { height: 4, backgroundColor: Palette.surfaceHigh, borderRadius: 2, marginBottom: 8, overflow: 'hidden' },
  uploadProgressFill: { height: 4, backgroundColor: Palette.textSecondary, borderRadius: 2 },
  uploadSuccessRow: { paddingVertical: 10, alignItems: 'center' },
  uploadSuccessText: { color: Palette.accent, fontSize: 14, fontWeight: '600' },
  uploadErrorText: { color: Palette.danger, fontSize: 13, marginTop: 8, textAlign: 'center' },
});
