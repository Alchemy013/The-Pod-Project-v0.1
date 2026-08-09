import type { Album, Song } from '@/types/music';

/**
 * "Hi-res" means better than CD: more than 16 bits of depth, or a sample rate
 * above 48 kHz.
 *
 * This is the single definition. It drives the Home shelf, the `hi-res` search
 * keyword, the album header badge and the row marks — it used to be written out
 * inline in three separate files, which meant the line between CD and hi-res
 * could have drifted apart silently. Don't re-derive it anywhere.
 */
export function isHiResSong(song: Song): boolean {
  return song.bitDepth > 16 || song.sampleRate > 48000;
}

export function isHiResAlbum(album: Album): boolean {
  return album.songs.some(isHiResSong);
}

/**
 * `24/192`, or `null` when the firmware didn't report both figures.
 *
 * Rates that aren't whole kHz keep one decimal (44.1), whole ones don't gain a
 * trailing `.0` (96) — the mono readouts in this design are meant to look like
 * spec sheets, and `96.0` doesn't.
 *
 * Takes `Song | undefined` deliberately. Callers reach for `album.songs[0]`,
 * and `noUncheckedIndexedAccess` is off in this project, so TypeScript types
 * that as `Song` and will not warn when the array is empty. Guarding here is
 * one check instead of one at every call site — and the call sites are list
 * rows, where a throw takes out the whole screen.
 */
export function specOf(song: Song | undefined): string | null {
  if (!song?.bitDepth || !song.sampleRate) return null;
  const khz = song.sampleRate / 1000;
  return `${song.bitDepth}/${Number.isInteger(khz) ? khz : khz.toFixed(1)}`;
}
