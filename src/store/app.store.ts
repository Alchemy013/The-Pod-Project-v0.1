import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { podService } from '@/services/bluetooth/BluetoothService';
import { useBluetoothStore } from '@/store/bluetooth.store';
import { useLibraryStore } from '@/store/library.store';
import { usePlayerStore } from '@/store/player.store';
import { usePodInfoStore } from '@/store/pod.store';
import { useHistoryStore } from '@/store/history.store';
import { useArtStore } from '@/store/art.store';

const ONBOARDED_KEY = 'thepod_onboarded';

/** Everything this app persists is namespaced, so a reset can find it all. */
const KEY_PREFIX = 'thepod_';

interface AppStore {
  /** null while still reading from storage — the splash covers that window. */
  onboarded: boolean | null;
  load: () => Promise<void>;
  completeOnboarding: () => void;
  /** Wipes every trace of local state and returns the app to the intro. */
  reset: () => Promise<void>;
}

export const useAppStore = create<AppStore>((set) => ({
  onboarded: null,

  load: async () => {
    try {
      const v = await AsyncStorage.getItem(ONBOARDED_KEY);
      set({ onboarded: !!v });
    } catch {
      // A failed read must not trap a returning user behind onboarding.
      set({ onboarded: true });
    }
  },

  completeOnboarding: () => {
    set({ onboarded: true });
    AsyncStorage.setItem(ONBOARDED_KEY, '1').catch(() => {});
  },

  reset: async () => {
    // Drop the link first, so nothing lands in a store we're about to clear.
    await podService.cancelPendingConnect();
    try { await podService.disconnect(); } catch {}

    // Enumerate rather than hardcode the key list: a screen that adds a new
    // `thepod_*` key later would otherwise silently survive a reset.
    try {
      const keys = await AsyncStorage.getAllKeys();
      const ours = keys.filter((k) => k.startsWith(KEY_PREFIX));
      if (ours.length) await AsyncStorage.multiRemove(ours);
    } catch {}

    await useArtStore.getState().purgeDisk();
    useLibraryStore.getState().clear();
    usePodInfoStore.getState().clear();
    useHistoryStore.getState().clear();
    usePlayerStore.getState().clear();
    useBluetoothStore.getState().setDisconnected();

    set({ onboarded: false });
  },
}));
