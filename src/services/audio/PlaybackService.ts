import TrackPlayer, { Event } from 'react-native-track-player';
import { usePlayerStore } from '@/store/player.store';

// Runs in background — forwards lock screen / Control Center commands to the Pi via BLE.
// Optimistically update RNTP state first so the button responds instantly;
// the BLE round-trip and resulting NOW_PLAYING notification do the true sync.
module.exports = async function () {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    TrackPlayer.play().catch(() => {});
    usePlayerStore.getState().play().catch(() => {});
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    TrackPlayer.pause().catch(() => {});
    usePlayerStore.getState().pause().catch(() => {});
  });

  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    usePlayerStore.getState().next().catch(() => {});
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    usePlayerStore.getState().previous().catch(() => {});
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => {
    usePlayerStore.getState().seek(position).catch(() => {});
  });
};
