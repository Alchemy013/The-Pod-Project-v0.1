import { create } from 'zustand';
import { NowPlaying, PlaybackState, RepeatMode, Song } from '@/types/music';
import { podService } from '@/services/bluetooth/BluetoothService';
import { updateLockScreen } from '@/services/audio/LockScreenService';
import { useHistoryStore } from '@/store/history.store';

interface PlayerStore extends NowPlaying {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  stop: () => Promise<void>;
  setVolume: (value: number) => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  playSong: (path: string) => Promise<void>;
  playAlbum: (id: string) => Promise<void>;
  playPlaylist: (id: string) => Promise<void>;
  toggleShuffle: () => Promise<void>;
  cycleRepeat: () => Promise<void>;
  refresh: () => Promise<void>;
  loadQueue: () => Promise<void>;
  clearQueue: () => Promise<void>;
  /** Resets local playback state. Does not touch what the Pod is doing. */
  clear: () => void;
  addToQueue: (path: string) => Promise<void>;
  addedSongIds: Set<string>;
  applyNowPlaying: (data: {
    song: Song | null;
    playbackState: PlaybackState;
    position: number;
    duration: number;
    volume: number;
    shuffle: boolean;
    repeat: RepeatMode;
  }) => void;
  setPosition: (position: number) => void;
}

const REPEAT_CYCLE: RepeatMode[] = ['off', 'one', 'all'];

// Volume curve: quadratic with 15% MPD ceiling.
// Prevents ear damage at max and gives fine control at low values.
// UI 0-100 → MPD 0-15:  mpd = (ui/100)^2 * 15
// MPD 0-15 → UI 0-100:  ui = sqrt(mpd/15) * 100
const VOL_MAX = 15;
const uiToMpd = (ui: number) => Math.round(Math.pow(ui / 100, 2) * VOL_MAX);
const mpdToUi = (mpd: number) => Math.round(Math.sqrt(Math.max(0, mpd) / VOL_MAX) * 100);

const INITIAL = {
  song: null,
  playbackState: 'stopped' as const,
  position: 0,
  duration: 0,
  volume: 50,
  shuffle: false,
  repeat: 'off' as RepeatMode,
  queue: [],
  queueIndex: 0,
  addedSongIds: new Set<string>(),
};

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  ...INITIAL,

  clear: () => set({ ...INITIAL, addedSongIds: new Set<string>() }),

  play: () => podService.sendCommand({ cmd: 'PLAY' }),
  pause: () => podService.sendCommand({ cmd: 'PAUSE' }),
  next: () => podService.sendCommand({ cmd: 'NEXT' }),
  previous: () => podService.sendCommand({ cmd: 'PREVIOUS' }),
  stop: () => podService.sendCommand({ cmd: 'STOP' }),
  setVolume: (value) => podService.sendCommand({ cmd: 'SET_VOLUME', value: uiToMpd(value) }),
  seek: (seconds) => podService.sendCommand({ cmd: 'SET_POSITION', seconds }),
  playSong: (path) => podService.sendCommand({ cmd: 'PLAY_SONG', path }),
  playAlbum: (id) => podService.sendCommand({ cmd: 'PLAY_ALBUM', id }),
  playPlaylist: (id) => podService.sendCommand({ cmd: 'PLAY_PLAYLIST', id }),

  toggleShuffle: () => {
    const enabled = !get().shuffle;
    return podService.sendCommand({ cmd: 'SHUFFLE', enabled });
  },

  cycleRepeat: () => {
    const current = get().repeat;
    const next = REPEAT_CYCLE[(REPEAT_CYCLE.indexOf(current) + 1) % REPEAT_CYCLE.length];
    return podService.sendCommand({ cmd: 'REPEAT', mode: next });
  },

  refresh: async () => {
    const response = await podService.request({ cmd: 'GET_NOW_PLAYING' });
    if (response.type === 'NOW_PLAYING') {
      get().applyNowPlaying(response);
    }
  },

  loadQueue: async () => {
    const response = await podService.request({ cmd: 'GET_QUEUE' }, 15000);
    if (response.type === 'QUEUE') {
      set({ queue: response.songs ?? [], queueIndex: response.index ?? 0 });
    }
  },

  clearQueue: async () => {
    const response = await podService.request({ cmd: 'CLEAR_QUEUE' }, 10000);
    if (response.type === 'OK') await get().loadQueue();
  },

  // "Added by you" provenance is session-only — MPD's queue has no concept of
  // how a track got there, so we track ids we explicitly appended ourselves.
  addToQueue: async (path) => {
    const response = await podService.request({ cmd: 'ADD_TO_QUEUE', path }, 10000);
    if (response.type !== 'OK') return;
    await get().loadQueue();
    const added = get().queue.find((s) => s.path === path);
    if (added) set((state) => ({ addedSongIds: new Set(state.addedSongIds).add(added.id) }));
  },

  applyNowPlaying: (data) => {
    const previousSongId = get().song?.id;
    if (data.song && data.song.id !== previousSongId) {
      useHistoryStore.getState().logPlay(data.song);
    }
    set({ ...data, volume: mpdToUi(data.volume) });
    updateLockScreen({
      title: data.song?.title ?? 'ThePod',
      artist: data.song?.artist ?? '',
      album: data.song?.album ?? '',
      duration: data.duration,
      position: data.position,
      isPlaying: data.playbackState === 'playing',
    }).catch(() => {});
  },
  setPosition: (position) => set({ position }),
}));
