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

  autoConnect: () => Promise<void>;
  startScan: () => Promise<void>;
  connect: (deviceId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  setDisconnected: () => void;
}

export const useBluetoothStore = create<BluetoothStore>((set, get) => ({
  connectionState: 'disconnected',
  device: null,
  scannedDevices: [],
  error: null,
  podIp: null,
  podPort: 8080,

  autoConnect: async () => {
    if (get().connectionState !== 'disconnected') return;
    // Read the saved id *before* touching connectionState. Flipping to
    // 'connecting' and straight back to 'disconnected' on a fresh install
    // re-triggered PairingScreen's scan effect, starting a second overlapping
    // scan whose empty result overwrote the first scan's real devices.
    const savedId = await AsyncStorage.getItem(SAVED_DEVICE_KEY);
    if (!savedId) return;
    if (get().connectionState !== 'disconnected') return;
    set({ connectionState: 'connecting', error: null });
    try {
      await podService.connect(savedId);
      const device = podService.connectedDevice;
      let podIp: string | null = null;
      let podPort = 8080;
      try {
        const info = await podService.request({ cmd: 'GET_INFO' }, 5000);
        if (info.type === 'INFO') { podIp = info.ip; podPort = info.port; }
      } catch {}
      set({ connectionState: 'connected', device, podIp, podPort });
    } catch {
      set({ connectionState: 'disconnected' });
    }
  },

  startScan: async () => {
    if (get().connectionState === 'scanning') return;
    set({ connectionState: 'scanning', error: null, scannedDevices: [] });
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
    set({ connectionState: 'connecting', error: null });
    try {
      await podService.connect(deviceId);
      const device = podService.connectedDevice;
      await AsyncStorage.setItem(SAVED_DEVICE_KEY, deviceId);

      let podIp: string | null = null;
      let podPort = 8080;
      try {
        const info = await podService.request({ cmd: 'GET_INFO' }, 5000);
        if (info.type === 'INFO') { podIp = info.ip; podPort = info.port; }
      } catch {}

      set({ connectionState: 'connected', device, podIp, podPort });
    } catch (error) {
      set({
        connectionState: 'disconnected',
        error: error instanceof Error ? error.message : 'Connection failed',
      });
      throw error;
    }
  },

  disconnect: async () => {
    try { await podService.disconnect(); } catch {}
    await AsyncStorage.removeItem(SAVED_DEVICE_KEY);
    set({ connectionState: 'disconnected', device: null, podIp: null });
  },

  setDisconnected: () => set({ connectionState: 'disconnected', device: null, podIp: null }),
}));
