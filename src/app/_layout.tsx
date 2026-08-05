import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppTabs from '@/components/app-tabs';
import { ErrorBoundary as AppErrorBoundary } from '@/components/ErrorBoundary';
import { DarkTheme, ThemeProvider } from 'expo-router';
import TrackPlayer from 'react-native-track-player';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Archivo_400Regular,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
} from '@expo-google-fonts/archivo';
import { podService } from '@/services/bluetooth/BluetoothService';
import { usePlayerStore } from '@/store/player.store';
import { useBluetoothStore } from '@/store/bluetooth.store';
import { setupLockScreen } from '@/services/audio/LockScreenService';
import { PairingScreen } from '@/components/PairingScreen';
import { Palette } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

// Expo Router renders this above the root layout, so it catches render errors
// that the in-tree ErrorBoundary below cannot (it lives inside the component
// that would be throwing). Without it a render error is a silent blank screen.
export { ErrorBoundary } from 'expo-router';

TrackPlayer.registerPlaybackService(() => require('@/services/audio/PlaybackService'));

function NotificationSync() {
  const applyNowPlaying = usePlayerStore((s) => s.applyNowPlaying);
  const autoConnect = useBluetoothStore((s) => s.autoConnect);
  const setDisconnected = useBluetoothStore((s) => s.setDisconnected);

  useEffect(() => {
    autoConnect();
    setupLockScreen();
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
  const [fontsLoaded, fontError] = useFonts({
    Archivo_400Regular,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
  });
  // A stuck/rejected font-loading promise must never permanently blank the
  // app — fall through to system fonts after a short grace period instead.
  const [fontTimedOut, setFontTimedOut] = useState(false);
  const ready = fontsLoaded || !!fontError || fontTimedOut;

  const connectionState = useBluetoothStore((s) => s.connectionState);
  const isConnected = connectionState === 'connected';

  useEffect(() => {
    const t = setTimeout(() => setFontTimedOut(true), 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <AppErrorBoundary>
        <SafeAreaProvider>
          <ThemeProvider value={DarkTheme}>
            <NotificationSync />
            {isConnected ? <AppTabs /> : <PairingScreen />}
          </ThemeProvider>
        </SafeAreaProvider>
      </AppErrorBoundary>
    </GestureHandlerRootView>
  );
}
