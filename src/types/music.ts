export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId: string;
  artistId: string;
  duration: number;
  trackNumber: number;
  discNumber: number;
  genre: string;
  year: number;
  format: string;
  bitrate: number;
  sampleRate: number;
  bitDepth: number;
  fileSize: number;
  path: string;
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  year: number;
  genre: string;
  songCount: number;
  duration: number;
  songs: Song[];
}

export interface Artist {
  id: string;
  name: string;
  albumCount: number;
  songCount: number;
  albums: Album[];
}

export interface Genre {
  id: string;
  name: string;
  songCount: number;
}

export interface Playlist {
  id: string;
  name: string;
  songCount: number;
  duration: number;
  songs: Song[];
}

export type RepeatMode = 'off' | 'one' | 'all';
export type PlaybackState = 'playing' | 'paused' | 'stopped';

export interface NowPlaying {
  song: Song | null;
  playbackState: PlaybackState;
  position: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  queue: Song[];
  queueIndex: number;
}

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
