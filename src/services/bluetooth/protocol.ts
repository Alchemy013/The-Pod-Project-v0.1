import type { Song, Album, Artist, PlaybackState, RepeatMode } from '@/types/music';

export const POD_SERVICE_UUID    = '4fafc201-1fb5-459e-8fcc-c5c9c3319001';
export const POD_COMMAND_UUID    = '4fafc201-1fb5-459e-8fcc-c5c9c3319002';
export const POD_STATUS_UUID     = '4fafc201-1fb5-459e-8fcc-c5c9c3319003';
export const POD_INFO_UUID       = '4fafc201-1fb5-459e-8fcc-c5c9c3319004';
export const POD_BATTERY_UUID    = '4fafc201-1fb5-459e-8fcc-c5c9c3319005';

export const POD_DEVICE_NAME = 'ThePod';

export type PodCommand =
  | { cmd: 'PING' }
  | { cmd: 'PLAY' }
  | { cmd: 'PAUSE' }
  | { cmd: 'NEXT' }
  | { cmd: 'PREVIOUS' }
  | { cmd: 'STOP' }
  | { cmd: 'SET_VOLUME'; value: number }
  | { cmd: 'SET_POSITION'; seconds: number }
  | { cmd: 'PLAY_SONG'; path: string }
  | { cmd: 'PLAY_ALBUM'; id: string }
  | { cmd: 'PLAY_PLAYLIST'; id: string }
  | { cmd: 'SHUFFLE'; enabled: boolean }
  | { cmd: 'REPEAT'; mode: RepeatMode }
  | { cmd: 'GET_NOW_PLAYING' }
  | { cmd: 'GET_LIBRARY' }
  | { cmd: 'GET_QUEUE' }
  | { cmd: 'GET_BATTERY' }
  | { cmd: 'GET_STORAGE' }
  | { cmd: 'GET_ALBUM_ART'; path: string; size?: 'small' | 'large' }
  | { cmd: 'GET_INFO' }
  | { cmd: 'SHUTDOWN' }
  | { cmd: 'DELETE_TRACK'; path: string }
  | { cmd: 'SET_EQ'; preset: 'flat' | 'bass' | 'vocal' | 'treble' }
  | { cmd: 'SCAN_WIFI' }
  | { cmd: 'CONNECT_WIFI'; ssid: string; password: string }
  | { cmd: 'GET_WIFI_STATUS' };

export type PodCommandWithId = PodCommand & { _id: string };

export type PodResponse =
  | { type: 'PONG'; _id?: string }
  | { type: 'OK'; cmd: string; _id?: string }
  | { type: 'ERROR'; cmd: string; msg: string; _id?: string }
  | {
      type: 'NOW_PLAYING';
      _id?: string;
      song: Song | null;
      playbackState: PlaybackState;
      position: number;
      duration: number;
      volume: number;
      shuffle: boolean;
      repeat: RepeatMode;
    }
  | {
      type: 'LIBRARY';
      _id?: string;
      albums: Album[];
      artists: Artist[];
      songs: Song[];
    }
  | { type: 'QUEUE'; _id?: string; songs: Song[]; index: number }
  | { type: 'BATTERY'; _id?: string; percent: number; charging: boolean; minutesRemaining: number | null }
  | { type: 'STORAGE'; _id?: string; totalGB: number; usedGB: number; freeGB: number; trackCount: number }
  | { type: 'ALBUM_ART'; _id?: string; path: string; data: string }
  | { type: 'CHUNK'; _id: string; seq: number; total: number; data: string }
  | { type: 'CHUNK_END'; _id: string; seq: number; total: number; data: string }
  | { type: 'INFO'; _id?: string; ip: string; port: number; name: string; firmwareVersion: string }
  | { type: 'WIFI_STATUS'; _id?: string; ssid: string; ip: string; signal: number }
  | { type: 'WIFI_SCAN'; _id?: string; networks: { ssid: string; signal: number; secured: boolean }[] }
  | { type: 'WIFI_CONNECTED'; _id?: string; ssid: string; ip: string };

function stringToBase64(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToString(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function encodeCommand(command: PodCommandWithId): string {
  return stringToBase64(JSON.stringify(command));
}

export function decodeResponse(base64: string): PodResponse {
  return JSON.parse(base64ToString(base64)) as PodResponse;
}
