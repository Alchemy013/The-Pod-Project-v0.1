import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Song } from '@/types/music';

const HISTORY_KEY = 'thepod_play_history';
const MAX_ENTRIES = 500;

export interface PlayEntry {
  songId: string;
  title: string;
  artist: string;
  album: string;
  albumId: string;
  duration: number;
  playedAt: number; // epoch ms
}

interface HistoryStore {
  entries: PlayEntry[];
  loaded: boolean;
  load: () => Promise<void>;
  logPlay: (song: Song) => Promise<void>;
}

// Local-only, on-device play history: firmware/MPD has no concept of "plays",
// so this logs a track-change event whenever the app observes one. Resets on
// reinstall or when used from a second device — that trade-off was chosen
// over adding a firmware-side history log.
export const useHistoryStore = create<HistoryStore>((set, get) => ({
  entries: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const raw = await AsyncStorage.getItem(HISTORY_KEY);
      set({ entries: raw ? JSON.parse(raw) : [], loaded: true });
    } catch {
      set({ entries: [], loaded: true });
    }
  },

  logPlay: async (song) => {
    await get().load();
    const entry: PlayEntry = {
      songId: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      albumId: song.albumId,
      duration: song.duration,
      playedAt: Date.now(),
    };
    const entries = [entry, ...get().entries].slice(0, MAX_ENTRIES);
    set({ entries });
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(entries)).catch(() => {});
  },
}));
