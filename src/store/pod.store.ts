import { create } from 'zustand';
import { podService } from '@/services/bluetooth/BluetoothService';

export interface StorageInfo {
  totalGB: number;
  usedGB: number;
  freeGB: number;
  trackCount: number;
}

export interface BatteryInfo {
  percent: number;
  charging: boolean;
  minutesRemaining: number | null;
}

export interface WifiStatus {
  ssid: string;
  ip: string;
  signal: number;
}

export type EqPreset = 'flat' | 'bass' | 'vocal' | 'treble';

interface PodInfoStore {
  storage: StorageInfo | null;
  battery: BatteryInfo | null;
  wifiStatus: WifiStatus | null;
  eqPreset: EqPreset;

  fetchAll: () => void;
  refreshStorage: () => Promise<void>;
  refreshBattery: () => Promise<void>;
  refreshWifiStatus: () => Promise<void>;
  setEqPreset: (preset: EqPreset) => void;
  setWifiStatus: (status: WifiStatus | null) => void;
  clear: () => void;
}

export const usePodInfoStore = create<PodInfoStore>((set, get) => ({
  storage: null,
  battery: null,
  wifiStatus: null,
  eqPreset: 'flat',

  fetchAll: () => {
    get().refreshStorage();
    get().refreshBattery();
    get().refreshWifiStatus();
  },

  refreshStorage: async () => {
    try {
      const res = await podService.request({ cmd: 'GET_STORAGE' }, 10000);
      if (res.type === 'STORAGE') set({ storage: res });
    } catch {}
  },

  refreshBattery: async () => {
    try {
      const res = await podService.request({ cmd: 'GET_BATTERY' }, 10000);
      if (res.type === 'BATTERY') set({ battery: res });
    } catch {}
  },

  refreshWifiStatus: async () => {
    try {
      const res = await podService.request({ cmd: 'GET_WIFI_STATUS' }, 8000);
      if (res.type === 'WIFI_STATUS') set({ wifiStatus: res });
    } catch {}
  },

  setEqPreset: (eqPreset) => set({ eqPreset }),
  setWifiStatus: (wifiStatus) => set({ wifiStatus }),

  clear: () => set({ storage: null, battery: null, wifiStatus: null, eqPreset: 'flat' }),
}));
