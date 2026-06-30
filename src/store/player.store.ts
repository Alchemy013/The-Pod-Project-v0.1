import { create } from 'zustand';
import { NowPlaying, PlaybackState, RepeatMode, Song } from '@/types/music';
import { podService } from '@/services/bluetooth/BluetoothService';

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

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  song: null,
  playbackState: 'stopped',
  position: 0,
  duration: 0,
  volume: 75,
  shuffle: false,
  repeat: 'off',
  queue: [],
  queueIndex: 0,

  play: () => podService.sendCommand({ cmd: 'PLAY' }),
  pause: () => podService.sendCommand({ cmd: 'PAUSE' }),
  next: () => podService.sendCommand({ cmd: 'NEXT' }),
  previous: () => podService.sendCommand({ cmd: 'PREVIOUS' }),
  stop: () => podService.sendCommand({ cmd: 'STOP' }),
  setVolume: (value) => podService.sendCommand({ cmd: 'SET_VOLUME', value }),
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

  applyNowPlaying: (data) => set(data),
  setPosition: (position) => set({ position }),
}));
