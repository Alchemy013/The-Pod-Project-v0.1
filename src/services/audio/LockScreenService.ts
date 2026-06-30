import TrackPlayer, { Capability, RepeatMode } from 'react-native-track-player';
import { Platform } from 'react-native';

// 10-minute silence track — long enough to seek to any normal song position
// without the loop resetting the displayed elapsed time every second
const SILENCE_DURATION = 600;

let ready = false;

export async function setupLockScreen(): Promise<void> {
  if (ready || Platform.OS !== 'ios') return;
  try {
    await TrackPlayer.setupPlayer({ autoHandleInterruptions: true });

    await TrackPlayer.updateOptions({
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
      ],
      compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
    });

    await TrackPlayer.add({
      id: 'silence',
      url: require('../../../assets/audio/silence_long.wav'),
      title: 'ThePod',
      artist: '',
      duration: SILENCE_DURATION,
    });

    await TrackPlayer.setRepeatMode(RepeatMode.Queue);
    await TrackPlayer.setVolume(0);
    await TrackPlayer.play();

    ready = true;
  } catch (e) {
    console.warn('[LockScreen] setup failed:', e);
  }
}

export async function updateLockScreen(info: {
  title: string;
  artist: string;
  album: string;
  artwork?: string;
  duration: number;
  position: number;
  isPlaying: boolean;
}): Promise<void> {
  if (!ready || Platform.OS !== 'ios') return;
  try {
    // Seek the silent track to match MPD position so RNTP's internal elapsed time stays in sync.
    // Clamp to SILENCE_DURATION - 2 to avoid triggering the loop-end.
    const seekPos = Math.min(info.position, SILENCE_DURATION - 2);
    await TrackPlayer.seekTo(seekPos);

    // elapsedTime is an undocumented iOS-only field that maps to
    // MPNowPlayingInfoPropertyElapsedPlaybackTime — needed for songs longer than SILENCE_DURATION
    await (TrackPlayer.updateNowPlayingMetadata as (m: Record<string, unknown>) => Promise<void>)({
      title: info.title || 'ThePod',
      artist: info.artist,
      album: info.album,
      artwork: info.artwork,
      duration: info.duration,
      elapsedTime: info.position,
    });

    // Mirror MPD play/pause state so Control Center shows the correct button
    if (info.isPlaying) {
      await TrackPlayer.play();
    } else {
      await TrackPlayer.pause();
    }
  } catch {}
}

export async function teardownLockScreen(): Promise<void> {
  if (!ready) return;
  try {
    await TrackPlayer.reset();
    ready = false;
  } catch {}
}
