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

  autoConnect: async () => {
    if (get().connectionState !== 'disconnected') return;
    set({ connectionState: 'connecting', error: null });
    const savedId = await AsyncStorage.getItem(SAVED_DEVICE_KEY);
    if (!savedId) {
      set({ connectionState: 'disconnected' });
      return;
    }
    try {
      await podService.connect(savedId);
      const device = podService.connectedDevice;
      set({ connectionState: 'connected', device });
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
    set({ connectionState: 'connecting', error: null });
    try {
      await podService.connect(deviceId);
      const device = podService.connectedDevice;
      await AsyncStorage.setItem(SAVED_DEVICE_KEY, deviceId);
      set({ connectionState: 'connected', device });
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
    set({ connectionState: 'disconnected', device: null });
  },

  setDisconnected: () => set({ connectionState: 'disconnected', device: null }),
}));
