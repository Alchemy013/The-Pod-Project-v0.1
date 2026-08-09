// Run: node src/utils/format.test.ts   (Node strips the types natively)
//
// `isHiResSong` is the single definition of the product's core claim — it gates
// the Home shelf, the `hi-res` search keyword, the album badge and the row
// marks. It used to be written out inline in three files. A test here is what
// stops it drifting back apart.
//
// The `@/types/music` import in format.ts is `import type`, so it is erased
// before Node sees it and the path alias never needs resolving.
import assert from 'node:assert/strict';
import { isHiResAlbum, isHiResSong, specOf } from './format.ts';

const song = (bitDepth: number, sampleRate: number) =>
  ({ bitDepth, sampleRate } as Parameters<typeof isHiResSong>[0]);

// The CD boundary itself is NOT hi-res — 16/44.1 is exactly the line.
assert.equal(isHiResSong(song(16, 44100)), false, '16/44.1 is CD, not hi-res');
assert.equal(isHiResSong(song(16, 48000)), false, '16/48 is still not hi-res');

// Either axis on its own is enough.
assert.equal(isHiResSong(song(24, 44100)), true, 'depth alone qualifies');
assert.equal(isHiResSong(song(16, 96000)), true, 'rate alone qualifies');
assert.equal(isHiResSong(song(24, 192000)), true, '24/192 qualifies');

// An album is hi-res if *any* track is — a single 24-bit bonus track counts.
assert.equal(
  isHiResAlbum({ songs: [song(16, 44100), song(24, 96000)] } as Parameters<typeof isHiResAlbum>[0]),
  true,
  'one hi-res track makes the album hi-res',
);
assert.equal(
  isHiResAlbum({ songs: [song(16, 44100), song(16, 44100)] } as Parameters<typeof isHiResAlbum>[0]),
  false,
  'an all-CD album is not hi-res',
);
assert.equal(
  isHiResAlbum({ songs: [] } as unknown as Parameters<typeof isHiResAlbum>[0]),
  false,
  'an empty album is not hi-res',
);

// Formatting: fractional rates keep one decimal, whole ones gain no `.0`.
assert.equal(specOf(song(16, 44100)), '16/44.1', '44.1 keeps its decimal');
assert.equal(specOf(song(24, 96000)), '24/96', '96 must not render as 96.0');
assert.equal(specOf(song(24, 192000)), '24/192');
assert.equal(specOf(song(16, 48000)), '16/48');
assert.equal(specOf(song(24, 88200)), '24/88.2');

// Older firmware can omit these, and the UI must render nothing rather than
// `undefined/undefined`.
assert.equal(specOf(song(0, 44100)), null, 'missing depth → null');
assert.equal(specOf(song(24, 0)), null, 'missing rate → null');

// The one that actually bit: list rows call `specOf(album.songs[0])`, and with
// `noUncheckedIndexedAccess` off TypeScript types that as `Song` even when the
// array is empty. An unguarded read threw and took out the whole screen.
assert.equal(specOf(undefined), null, 'undefined song → null, must not throw');

console.log('format.ts — all assertions passed');
