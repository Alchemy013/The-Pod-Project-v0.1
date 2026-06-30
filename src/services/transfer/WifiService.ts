import { Linking, Platform } from 'react-native';

// Try the iOS Settings Wi-Fi page. The URL works on most iOS versions.
const WIFI_SETTINGS_URL = 'App-Prefs:root=WIFI';

export async function isPodReachable(ip: string, port: number): Promise<boolean> {
  if (Platform.OS !== 'ios') return true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`http://${ip}:${port}/ping`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function openWifiSettings(): Promise<void> {
  // canOpenURL always returns false for App-Prefs: unless the scheme is whitelisted,
  // so skip the check and call openURL directly — it works on iOS 14+.
  try {
    await Linking.openURL(WIFI_SETTINGS_URL);
  } catch {
    // Fallback for older iOS where App-Prefs: is blocked
    await Linking.openURL('prefs:root=WIFI');
  }
}
