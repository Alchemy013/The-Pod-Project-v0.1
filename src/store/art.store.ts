import { create } from 'zustand';
import { Directory, File, Paths } from 'expo-file-system';
import { Album, Song } from '@/types/music';
import { podService } from '@/services/bluetooth/BluetoothService';

type ArtSize = 'small' | 'medium' | 'large';

// Album art is the single most expensive thing on the BLE link — a few hundred
// chunked notifications per record. Once fetched it is written to the cache
// directory, so a reconnect (or a fresh launch) paints from disk instantly and
// never asks the Pod again. Art for a given file never changes, so there is no
// invalidation problem to solve; the OS reclaims the directory under storage
// pressure, and a miss just re-fetches.
const ART_DIR = new Directory(Paths.cache, 'album-art');

/**
 * 64-bit FNV-1a as two independently-seeded 32-bit passes. Track paths are far
 * too long (and contain `/`) to use as filenames directly, and a single 32-bit
 * hash would collide at roughly 1-in-300 across a few thousand tracks — which
 * would show the wrong cover, silently. Two passes make that vanishingly rare.
 */
function fileKey(path: string, size: ArtSize): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < path.length; i++) {
    const c = path.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x85ebca6b) >>> 0;
  }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}-${size}.jpg`;
}

const key = (path: string, size: ArtSize) => `${size}|${path}`;

// A request already in flight is never issued twice — several screens ask for
// the same art at once.
const inFlight = new Set<string>();

// Filenames present on disk, read once at startup. Kept as a Set so the
// `useArt` selector can stay synchronous: it must answer during render, and
// touching the filesystem there would mean a frame of missing artwork.
const onDisk = new Set<string>();
let hydrated = false;

interface ArtStore {
  art: Record<string, string>;
  /** Reads the on-disk cache into memory. Safe to call more than once. */
  hydrate: () => Promise<void>;
  /** Resolves once the art is cached (or known to be unavailable). */
  fetch: (path: string, size?: ArtSize) => Promise<void>;
  /**
   * Background prefetch for the library feed: row thumbs first, then grid art.
   * Returns a cancel function for the calling effect's cleanup.
   */
  prefetchLibrary: (songs: Song[], albums: Album[]) => () => void;
  forget: (path: string) => void;
  /** In-memory only — the disk cache survives, which is the point of it. */
  clear: () => void;
  /** Full wipe including disk. Used by "Reset app". */
  purgeDisk: () => Promise<void>;
}

const TIMEOUT: Record<ArtSize, number> = { small: 15000, medium: 20000, large: 25000 };

export const useArtStore = create<ArtStore>((set, get) => ({
  art: {},

  hydrate: async () => {
    if (hydrated) return;
    hydrated = true;
    try {
      if (!ART_DIR.exists) {
        ART_DIR.create({ intermediates: true, idempotent: true });
        return;
      }
      for (const entry of ART_DIR.list()) {
        if (entry instanceof File) onDisk.add(entry.name);
      }
    } catch {
      // An unusable cache directory is not fatal — everything still works,
      // it just costs a BLE fetch each time.
    }
  },

  fetch: async (path, size = 'medium') => {
    const k = key(path, size);
    if (get().art[k] || inFlight.has(k)) return;

    // Disk hit: no BLE traffic at all.
    const name = fileKey(path, size);
    if (onDisk.has(name)) {
      const uri = new File(ART_DIR, name).uri;
      set((state) => ({ art: { ...state.art, [k]: uri } }));
      return;
    }

    inFlight.add(k);
    try {
      const res = await podService.request({ cmd: 'GET_ALBUM_ART', path, size }, TIMEOUT[size]);
      if (res.type === 'ALBUM_ART' && res.data) {
        let uri = `data:image/jpeg;base64,${res.data}`;
        try {
          if (!ART_DIR.exists) ART_DIR.create({ intermediates: true, idempotent: true });
          const file = new File(ART_DIR, name);
          file.write(res.data, { encoding: 'base64' });
          onDisk.add(name);
          // Prefer the file URI: expo-image can cache and decode it natively,
          // and it keeps a multi-MB base64 string out of the JS heap.
          uri = file.uri;
        } catch {
          // Disk unavailable — fall back to the in-memory data URI.
        }
        set((state) => ({ art: { ...state.art, [k]: uri } }));
      }
    } catch {
      // No art, or the Pod timed out — the hue block stands in for it.
    } finally {
      inFlight.delete(k);
    }
  },

  // Deliberately sequential: firing one request per song at once floods the
  // BLE link and stalls interactive commands behind a queue of artwork.
  // Disk hits fall straight through, so a warm cache costs one pass and no I/O.
  prefetchLibrary: (songs, albums) => {
    let cancelled = false;
    const run = async () => {
      await get().hydrate();
      for (const song of songs) {
        if (cancelled) break;
        await get().fetch(song.path, 'small');
      }
      for (const album of albums) {
        if (cancelled) break;
        const rep = album.songs[0]?.path;
        if (rep) await get().fetch(rep, 'medium');
      }
    };
    run();
    return () => { cancelled = true; };
  },

  forget: (path) => set((state) => {
    const art = { ...state.art };
    for (const size of ['small', 'medium', 'large'] as ArtSize[]) {
      delete art[key(path, size)];
      const name = fileKey(path, size);
      onDisk.delete(name);
      try { new File(ART_DIR, name).delete(); } catch {}
    }
    return { art };
  }),

  clear: () => { inFlight.clear(); set({ art: {} }); },

  purgeDisk: async () => {
    inFlight.clear();
    onDisk.clear();
    hydrated = false;
    try { if (ART_DIR.exists) ART_DIR.delete(); } catch {}
    set({ art: {} });
  },
}));

/** Read cached art for a path without triggering a fetch. */
export function useArt(path: string | undefined, size: ArtSize = 'medium'): string | null {
  return useArtStore((s) => {
    if (!path) return null;
    // Fall back across sizes so a row thumb shows immediately while the
    // larger version is still being chunked over BLE.
    return s.art[key(path, size)]
      ?? s.art[key(path, 'medium')]
      ?? s.art[key(path, 'large')]
      ?? s.art[key(path, 'small')]
      ?? null;
  });
}
