import { create } from 'zustand';
import { Device } from 'react-native-ble-plx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { podService } from '@/services/bluetooth/BluetoothService';

const SAVED_DEVICE_KEY = 'thepod_device_id';

export type ConnectionState = 'disconnected' | 'scanning' | 'connecting' | 'connected';

interface BluetoothStore {
  connectionState: ConnectionState;
  device: Device | null;
  scannedDevices: Device[];
  error: string | null;
  podIp: string | null;
  podPort: number;
  /** Reported by the Pi's GET_INFO — null until that round-trip lands. */
  firmwareVersion: string | null;

  /** True while iOS is holding a connect open for a Pod that isn't in range. */
  awaitingPod: boolean;

  autoConnect: () => Promise<void>;
  /** Adopt a link the service brought up on its own (iOS state restoration). */
  adoptConnection: () => Promise<void>;
  startScan: () => Promise<void>;
  connect: (deviceId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  setDisconnected: () => void;
}

// BLE is the control plane only; file transfer needs the Pi's current LAN
// address, which is DHCP-assigned and therefore only knowable at connect time.
async function readPodInfo() {
  try {
    const info = await podService.request({ cmd: 'GET_INFO' }, 5000);
    if (info.type === 'INFO') {
      return { podIp: info.ip, podPort: info.port, firmwareVersion: info.firmwareVersion ?? null };
    }
  } catch {
    // Non-fatal: the Pod is connected, only Wi-Fi transfer is unavailable.
  }
  return { podIp: null, podPort: 8080, firmwareVersion: null };
}

export const useBluetoothStore = create<BluetoothStore>((set, get) => ({
  connectionState: 'disconnected',
  device: null,
  scannedDevices: [],
  error: null,
  podIp: null,
  podPort: 8080,
  firmwareVersion: null,
  awaitingPod: false,

  /**
   * Arms the standing reconnect for a Pod that has been paired before. Runs at
   * launch and again on every drop, so once you've connected once the app
   * latches on by itself whenever the Pod is nearby — no scan, no tapping.
   */
  autoConnect: async () => {
    if (get().connectionState !== 'disconnected' || get().awaitingPod) return;
    // Read the saved id *before* touching connectionState. Flipping to
    // 'connecting' and straight back to 'disconnected' on a fresh install
    // re-triggered PairingScreen's scan effect, starting a second overlapping
    // scan whose empty result overwrote the first scan's real devices.
    const savedId = await AsyncStorage.getItem(SAVED_DEVICE_KEY);
    if (!savedId) return;
    if (get().connectionState !== 'disconnected' || get().awaitingPod) return;
    set({ awaitingPod: true, error: null });
    try {
      await podService.connectWhenInRange(savedId);
      const device = podService.connectedDevice;
      if (!device) { set({ awaitingPod: false }); return; }
      set({ connectionState: 'connected', device, awaitingPod: false, ...(await readPodInfo()) });
    } catch {
      // Cancelled (user chose to scan) or the connect genuinely failed.
      set({ awaitingPod: false });
    }
  },

  adoptConnection: async () => {
    const device = podService.connectedDevice;
    if (!device || get().connectionState === 'connected') return;
    // Persist the id: a restored connection may be the first this install has
    // seen if iOS relaunched the app straight into it.
    await AsyncStorage.setItem(SAVED_DEVICE_KEY, device.id).catch(() => {});
    set({ connectionState: 'connected', device, awaitingPod: false, error: null, ...(await readPodInfo()) });
  },

  startScan: async () => {
    if (get().connectionState === 'scanning') return;
    // A standing reconnect holds the radio on one peripheral, so it has to go
    // before a scan can run — otherwise pairing a *different* Pod is impossible.
    await podService.cancelPendingConnect();
    set({ connectionState: 'scanning', error: null, scannedDevices: [], awaitingPod: false });
    try {
      const devices = await podService.scan();
      if (get().connectionState === 'scanning') {
        set({ connectionState: 'disconnected', scannedDevices: devices });
      } else {
        set({ scannedDevices: devices });
      }
    } catch (error) {
      if (get().connectionState === 'scanning') {
        set({
          connectionState: 'disconnected',
          error: error instanceof Error ? error.message : 'Scan failed',
        });
      }
    }
  },

  connect: async (deviceId: string) => {
    if (get().connectionState !== 'disconnected') return;
    await podService.cancelPendingConnect();
    set({ connectionState: 'connecting', error: null, awaitingPod: false });
    try {
      await podService.connect(deviceId);
      const device = podService.connectedDevice;
      await AsyncStorage.setItem(SAVED_DEVICE_KEY, deviceId);
      set({ connectionState: 'connected', device, ...(await readPodInfo()) });
    } catch (error) {
      set({
        connectionState: 'disconnected',
        error: error instanceof Error ? error.message : 'Connection failed',
      });
      throw error;
    }
  },

  // Explicit "Disconnect"/"Power off" from the Pod tab. Forgetting the saved id
  // is what stops the standing reconnect from immediately latching back on —
  // the user asked to be off, so treat it as un-pairing, not as a drop.
  disconnect: async () => {
    await podService.cancelPendingConnect();
    try { await podService.disconnect(); } catch {}
    await AsyncStorage.removeItem(SAVED_DEVICE_KEY);
    set({
      connectionState: 'disconnected', device: null, podIp: null,
      firmwareVersion: null, awaitingPod: false,
    });
  },

  // An *involuntary* drop (out of range, Pod rebooted, status notify died).
  // Re-arm straight away so walking back into range reconnects on its own.
  setDisconnected: () => {
    set({ connectionState: 'disconnected', device: null, podIp: null, firmwareVersion: null });
    get().autoConnect();
  },
}));
