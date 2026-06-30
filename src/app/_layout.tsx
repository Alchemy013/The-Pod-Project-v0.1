import { useEffect } from 'react';
import AppTabs from '@/components/app-tabs';
import { DarkTheme, ThemeProvider } from 'expo-router';
import { podService } from '@/services/bluetooth/BluetoothService';
import { usePlayerStore } from '@/store/player.store';
import { useBluetoothStore } from '@/store/bluetooth.store';

function NotificationSync() {
  const applyNowPlaying = usePlayerStore((s) => s.applyNowPlaying);
  const autoConnect = useBluetoothStore((s) => s.autoConnect);
  const setDisconnected = useBluetoothStore((s) => s.setDisconnected);

  useEffect(() => {
    autoConnect();
  }, []);

  useEffect(() => {
    return podService.onDisconnect(() => {
      setDisconnected();
    });
  }, [setDisconnected]);

  useEffect(() => {
    const unsubscribe = podService.onNotification((response) => {
      if (response.type === 'NOW_PLAYING') {
        applyNowPlaying({
          song: response.song,
          playbackState: response.playbackState,
          position: response.position,
          duration: response.duration,
          volume: response.volume,
          shuffle: response.shuffle,
          repeat: response.repeat,
        });
      }
    });
    return unsubscribe;
  }, [applyNowPlaying]);

  return null;
}

export default function RootLayout() {
  return (
    <ThemeProvider value={DarkTheme}>
      <NotificationSync />
      <AppTabs />
    </ThemeProvider>
  );
}
