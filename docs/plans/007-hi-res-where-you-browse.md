# 007 — Put the format where you browse, not only where you listen

- **Status**: DONE (applied 2026-08-10; `tsc --noEmit` + `expo export --platform ios` clean, self-checks pass; NOT run on hardware)
- **Commit**: 4f5c7fd
- **Severity**: MEDIUM
- **Category**: Missed opportunities / Cohesion
- **Estimated scope**: 1 shared predicate, 1 small component, 4 screens. ~80 lines.

## Problem

This product's entire thesis is bit-perfect lossless playback into a PCM5122.
The design system has a dedicated palette entry for it —
`accentWash: '#2A100C'`, commented *"Deep accent tint used behind hi-res /
format badges"* — and a `SpecBadge` component with an `accent` variant for
exactly this.

Both appear in precisely **two** places: the Now Playing screen
(`playing/index.tsx:314-319`) and the album header
(`library/album/[id].tsx:136`). Neither is where you are when you're choosing
what to listen to.

The rows you actually browse show nothing:

- `library/index.tsx` `SongRow` — art, title, `artist · album`, duration.
- `library/index.tsx` `AlbumRow` — art, title, `Album · artist`.
- `home/index.tsx` `ShelfCard` — art, title, artist.
- `library/album/[id].tsx` track rows — number, title, `FORMAT · 24/192`… which
  *does* show it, as plain muted text at `Type.caption`, visually identical to
  the artist name.

So the app can tell you a record is 24/192 only after you have committed to
playing it.

### The predicate is written out four times

```tsx
/* src/app/(tabs)/home/index.tsx:27-29 */
function isHiRes(album: Album): boolean {
  return album.songs.some((s) => s.bitDepth > 16 || s.sampleRate > 48000);
}
```
```tsx
/* src/app/(tabs)/library/album/[id].tsx:52 */
  const hiRes = album.songs.some((sg) => sg.bitDepth > 16 || sg.sampleRate > 48000);
```
```tsx
/* src/app/(tabs)/library/index.tsx:123 */
  const isHiRes = (sg: Song) => sg.bitDepth > 16 || sg.sampleRate > 48000;
```

Three copies of one rule (plus the `hi-res`/`hires` search special-case at
`:122` that depends on it). If the definition of hi-res ever changes — and
"greater than CD" is a debatable line — it changes in three places or it becomes
inconsistent silently.

## Target

### 1. One predicate, in `src/utils/format.ts` (new file)

```tsx
import type { Album, Song } from '@/types/music';

/**
 * "Hi-res" means better than CD: more than 16 bits of depth, or a sample rate
 * above 48 kHz. This is the single definition — it drives the Home shelf, the
 * `hi-res` search keyword, the album badge and the row marks, so it must not be
 * re-derived inline anywhere.
 */
export function isHiResSong(song: Song): boolean {
  return song.bitDepth > 16 || song.sampleRate > 48000;
}

export function isHiResAlbum(album: Album): boolean {
  return album.songs.some(isHiResSong);
}

/** `24/192`, or `null` when the firmware didn't report both figures. */
export function specOf(song: Song): string | null {
  if (!song.bitDepth || !song.sampleRate) return null;
  const khz = song.sampleRate / 1000;
  return `${song.bitDepth}/${Number.isInteger(khz) ? khz : khz.toFixed(1)}`;
}
```

`specOf` already exists inline in `library/album/[id].tsx` and in a slightly
different form at `playing/index.tsx:173-174`; both should move to this.

### 2. A small mark, not a second badge

`SpecBadge` is a padded pill — too heavy for a list row, and putting a second
orange thing in a row would break the "one accent gesture per surface" rule.
What a row wants is a **quiet mono tag**:

```tsx
/* src/components/ui/controls.tsx — new */
/**
 * Format mark for a browse row: `24/192` in mono, accent-tinted only when the
 * record is better than CD.
 *
 * Deliberately *not* a `SpecBadge` — a badge's ground would compete with the
 * row's own press feedback, and a filled accent pill in every other row would
 * break the one-accent-per-surface rule. This is a text mark, not a control.
 */
export function FormatMark({ spec, hiRes }: { spec: string; hiRes: boolean }) {
  return (
    <Text style={[s.formatMark, hiRes && { color: Palette.accentHi }]}>{spec}</Text>
  );
}
```
```tsx
  formatMark: { fontFamily: Font.mono, fontSize: Type.micro, color: Palette.textMuted },
```

### 3. Where it goes

| Surface | Placement |
| --- | --- |
| `library/index.tsx` `SongRow` | Second line becomes `artist · album` with the mark appended after it, only when `isHiResSong` — a mark on *every* row is noise, and the point is to make the good ones findable. |
| `library/album/[id].tsx` track rows | Already renders `FORMAT · 24/192` as plain muted text — wrap the spec half in `FormatMark` so hi-res tracks tint. |
| `home/index.tsx` `ShelfCard` | A single mark under the artist line when `isHiResAlbum`. |
| `library/index.tsx` `AlbumRow` | Same, appended to the `Album · artist` line. |

**The rule to hold onto: the mark appears only when it says something.** A
16/44.1 row shows nothing extra. That way the tint means "this is the good copy"
rather than becoming wallpaper.

## Repo conventions to follow

- Mono face for every numeric or format readout — `Font.mono`. That split is
  described in `docs/PROJECT_STATUS.md` as *"load-bearing in this design, not
  decoration"*.
- `Palette.accentHi` (`#FF6B4A`) is the softer accent already used for hi-res
  text inside `SpecBadge`; use it, not `Palette.accent`, so the row mark stays
  quieter than an actual control.
- Shared pure helpers live in `src/utils/` — see `src/utils/albumColor.ts`,
  which is the model: small, pure, and with a co-located test.
- **Exemplar to imitate**: `SpecBadge` in `controls.tsx` for the accent/muted
  branch, and `albumColor.ts` for how a util module is documented.

## Steps

1. Create `src/utils/format.ts` with the three functions above.
2. `src/app/(tabs)/home/index.tsx` — delete the local `isHiRes` (lines 27-29),
   import `isHiResAlbum`, update the `hiRes` memo at `:94`.
3. `src/app/(tabs)/library/index.tsx` — delete the local `isHiRes` at `:123`,
   import `isHiResSong`, and update the four call sites in the filter memos
   (`:128`, `:136`).
4. `src/app/(tabs)/library/album/[id].tsx` — delete the local `hiRes` derivation
   at `:52` and the local `specOf`, import both.
5. `src/app/playing/index.tsx` — replace the inline `khz`/`spec`/`hiRes`
   derivation (`:173-175`) with `specOf` / `isHiResSong`. **Check the output is
   identical** — the existing code and `specOf` must produce the same string for
   44.1, 48, 96 and 192 kHz.
6. Add `FormatMark` and its style to `src/components/ui/controls.tsx`.
7. Add the mark at the four surfaces in the table above.
8. Add a small self-check next to the util, in the style of
   `src/utils/albumColor.test.ts` (run with `node`, excluded from the tsc
   program via `tsconfig.json`) covering: 16/44100 → not hi-res; 24/44100 →
   hi-res; 16/96000 → hi-res; `specOf` formatting for 44.1 (one decimal) vs 96
   (integer, no decimal); and missing fields → `null`.

## Boundaries

- Do NOT show the mark on non-hi-res rows in the Library or Home. The whole
  value is that it is scarce.
- Do NOT change `SpecBadge` or the Now Playing badge row — that surface is
  already correct and is the one place a full badge belongs.
- Do NOT add a hi-res filter chip to the Library. The `hi-res` search keyword
  already covers it (`library/index.tsx:122`) and a fourth chip would crowd
  Songs/Albums/Artists.
- Do NOT change the definition of hi-res while moving it. `> 16 bit` or
  `> 48 kHz` is what the app means today; centralising it and redefining it in
  one step would make the change unreviewable.
- Do NOT add dependencies.

## Verification

- **Mechanical**: `npx tsc --noEmit` → 0. `node src/utils/format.test.ts` → no
  assertion failures. `npx expo export --platform ios` → 0. Then
  `grep -rn "bitDepth > 16" src/` → **one** hit, in `src/utils/format.ts`.
- **Feel check**, on a Pod carrying both CD-rate and hi-res material:
  - Library › Songs: hi-res rows carry a tinted `24/192`; 16/44.1 rows carry
    nothing extra. Scroll fast — the marks should read as occasional
    highlights, not as a column.
  - The mark must not push the title or duration around, and must truncate the
    `artist · album` line rather than wrapping it.
  - Home: the "Hi-res on the Pod" shelf cards carry the mark; cards on
    "Recently added" carry it only when they earn it.
  - Now Playing: the badge row is **unchanged** — same strings as before the
    refactor. Check a 44.1 kHz track specifically, since that's the one that
    exercises the `toFixed(1)` branch.
  - Search `hi-res` in the Library and confirm the filter still works (it now
    runs through the shared predicate).
- **Done when**: one definition of hi-res exists in the codebase, the format is
  visible while browsing, and Now Playing renders exactly the strings it did
  before.
