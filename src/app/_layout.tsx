import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary as AppErrorBoundary } from '@/components/ErrorBoundary';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import TrackPlayer from 'react-native-track-player';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  SplineSans_400Regular,
  SplineSans_500Medium,
  SplineSans_600SemiBold,
  SplineSans_700Bold,
} from '@expo-google-fonts/spline-sans';
import { podService } from '@/services/bluetooth/BluetoothService';
import { usePlayerStore } from '@/store/player.store';
import { useArtStore } from '@/store/art.store';
import { useLibraryStore } from '@/store/library.store';
import { useBluetoothStore } from '@/store/bluetooth.store';
import { setupLockScreen } from '@/services/audio/LockScreenService';
import { PairingScreen } from '@/components/PairingScreen';
import { Onboarding } from '@/components/Onboarding';
import { useAppStore } from '@/store/app.store';
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
  const adoptConnection = useBluetoothStore((s) => s.adoptConnection);
  const setDisconnected = useBluetoothStore((s) => s.setDisconnected);

  useEffect(() => {
    // Read the on-disk art cache before anything renders, so a reconnect
    // paints covers from disk instead of re-fetching them over BLE.
    useArtStore.getState().hydrate();
    useLibraryStore.getState().hydrate();
    setupLockScreen();
  }, []);

  useEffect(() => {
    return podService.onDisconnect(() => {
      setDisconnected();
    });
  }, [setDisconnected]);

  // A link the app didn't ask for: iOS restored one after terminating us, or a
  // standing reconnect completed while backgrounded. Nothing is awaiting a
  // promise in those cases, so the store has to be told.
  useEffect(() => podService.onConnected(() => { adoptConnection(); }), [adoptConnection]);

  // Arm the standing reconnect as soon as the radio is usable, and again every
  // time it comes back (Bluetooth toggled, Airplane mode, Control Centre).
  // `onStateChange(..., true)` emits the current state immediately, so this
  // also covers the normal launch path — hence no separate autoConnect above.
  useEffect(() => podService.onBluetoothReady(() => { autoConnect(); }), [autoConnect]);

  // Returning to the foreground is the moment a stale link is most likely and
  // least excusable, so confirm it and re-arm if it died while we were away.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      podService.verifyLink().then((alive) => { if (!alive) autoConnect(); });
    });
    return () => sub.remove();
  }, [autoConnect]);

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
    SplineSans_400Regular,
    SplineSans_500Medium,
    SplineSans_600SemiBold,
    SplineSans_700Bold,
  });
  // A stuck/rejected font-loading promise must never permanently blank the
  // app — fall through to system fonts after a short grace period instead.
  const [fontTimedOut, setFontTimedOut] = useState(false);

  // null while the flag is still being read. Folded into `ready` so the splash
  // covers the read instead of onboarding flashing over an already-set-up app.
  // Held in a store rather than local state so "Reset app" (Pod › About) can
  // flip it and drop the whole tab stack back to the intro.
  const onboarded = useAppStore((s) => s.onboarded);
  const loadOnboarded = useAppStore((s) => s.load);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const ready = (fontsLoaded || !!fontError || fontTimedOut) && onboarded !== null;

  const connectionState = useBluetoothStore((s) => s.connectionState);
  const isConnected = connectionState === 'connected';

  useEffect(() => {
    const t = setTimeout(() => setFontTimedOut(true), 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => { loadOnboarded(); }, [loadOnboarded]);

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
            {!onboarded ? <Onboarding onDone={completeOnboarding} />
              : !isConnected ? <PairingScreen />
              : (
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Palette.bg } }}>
                  <Stack.Screen name="(tabs)" />
                  {/* Now Playing is a card presented *over* the tabs, not a tab.
                      As a tab it was a plain index swap, so closing it cut
                      instantly with nothing to animate. The native sheet brings
                      the interactive drag-to-dismiss with it — the drag tracks
                      the finger on the UI thread and rubber-bands back if you
                      don't clear the threshold, which is the Apple Music feel
                      and is not something a JS-driven translate can match. */}
                  <Stack.Screen name="playing" options={{ presentation: 'modal' }} />
                </Stack>
              )}
          </ThemeProvider>
        </SafeAreaProvider>
      </AppErrorBoundary>
    </GestureHandlerRootView>
  );
}
