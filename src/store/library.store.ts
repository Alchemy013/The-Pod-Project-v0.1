import { create } from 'zustand';
import { Album, Artist, Song } from '@/types/music';
import { podService } from '@/services/bluetooth/BluetoothService';

interface LibraryStore {
  albums: Album[];
  artists: Artist[];
  songs: Song[];
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null;

  fetchLibrary: () => Promise<void>;
  clear: () => void;
}

export const useLibraryStore = create<LibraryStore>((set) => ({
  albums: [],
  artists: [],
  songs: [],
  isLoading: false,
  error: null,
  lastFetched: null,

  fetchLibrary: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await podService.request({ cmd: 'GET_LIBRARY' }, 30000);
      if (response.type === 'LIBRARY') {
        set({
          albums: response.albums,
          artists: response.artists,
          songs: response.songs,
          isLoading: false,
          lastFetched: Date.now(),
        });
      }
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load library',
      });
    }
  },

  clear: () => set({ albums: [], artists: [], songs: [], lastFetched: null }),
}));
