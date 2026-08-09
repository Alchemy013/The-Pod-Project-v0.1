import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Album, Artist, Song } from '@/types/music';
import { podService } from '@/services/bluetooth/BluetoothService';

// After album art, the library is the other expensive payload on the BLE link:
// a whole chunked GET_LIBRARY on every single connect. It is written to storage
// on every successful fetch and re-read at launch, so a reconnect (or a cold
// start) renders from disk and asks the Pod for nothing. Refreshes are explicit
// — upload, delete and Retry already call fetchLibrary().
const CACHE_KEY = 'thepod_library';

let fetching = false;
// The read itself, not a boolean: a second caller during the first read has to
// await the same promise, or it would see an empty store and hit BLE anyway.
let hydrating: Promise<void> | null = null;

interface LibraryStore {
  albums: Album[];
  artists: Artist[];
  songs: Song[];
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null;

  /** Reads the cached library into memory. Safe to call more than once. */
  hydrate: () => Promise<void>;
  /** What screens call: disk first, and only ask the Pod if that came up empty. */
  ensureLibrary: () => Promise<void>;
  /** Explicit refresh — always goes to the Pod and rewrites the cache. */
  fetchLibrary: () => Promise<void>;
  clear: () => void;
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  albums: [],
  artists: [],
  songs: [],
  // Starts true so the screens' "empty library → fetch it" effect can't fire a
  // GET_LIBRARY in the window before hydrate() has filled it from disk.
  isLoading: true,
  error: null,
  lastFetched: null,

  hydrate: () => (hydrating ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as Pick<LibraryStore, 'albums' | 'artists' | 'songs' | 'lastFetched'>;
        set({ albums: cached.albums, artists: cached.artists, songs: cached.songs, lastFetched: cached.lastFetched });
      }
    } catch {
      // Unreadable cache is not fatal — it just costs one BLE fetch.
    }
    if (!fetching) set({ isLoading: false });
  })()),

  ensureLibrary: async () => {
    await get().hydrate();
    if (get().songs.length === 0 && !fetching) await get().fetchLibrary();
  },

  fetchLibrary: async () => {
    if (fetching) return;
    fetching = true;
    set({ isLoading: true, error: null });
    try {
      const response = await podService.request({ cmd: 'GET_LIBRARY' }, 30000);
      if (response.type === 'LIBRARY') {
        const next = {
          albums: response.albums,
          artists: response.artists,
          songs: response.songs,
          lastFetched: Date.now(),
        };
        set(next);
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)).catch(() => {});
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load library' });
    } finally {
      // In the finally, not per-branch: a response that isn't LIBRARY used to
      // leave isLoading stuck on, which now means a permanent spinner.
      fetching = false;
      set({ isLoading: false });
    }
  },

  // Memory only — the cached copy surviving a disconnect or a power-off is the
  // whole point, exactly as with the art cache. Reset is the full wipe, and it
  // removes the key itself (prefix sweep) before calling this, so the re-read
  // below correctly finds nothing.
  clear: () => {
    set({ albums: [], artists: [], songs: [], lastFetched: null, error: null, isLoading: true });
    hydrating = null;
    get().hydrate();
  },
}));
