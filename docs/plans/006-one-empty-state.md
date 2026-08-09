# 006 — One empty state, with a way out of it

- **Status**: DONE (applied 2026-08-10; `tsc --noEmit` + `expo export --platform ios` clean, self-checks pass; NOT run on hardware)
- **Commit**: 4f5c7fd
- **Severity**: MEDIUM
- **Category**: Cohesion / Missed opportunities
- **Estimated scope**: 1 component rewritten, 4 screens. ~90 lines.

## Problem

### There is an `EmptyState` component. Nothing imports it.

`src/components/ui/EmptyState.tsx` exists in full and is listed under "Known
dead code" in `docs/PROJECT_STATUS.md`:

```tsx
/* src/components/ui/EmptyState.tsx — current, unused */
export function EmptyState({ icon, title, subtitle }: {
  icon?: string;
  title: string;
  subtitle?: string;
}) {
```

It also could not be adopted as written: `icon?: string` is rendered as
`<Text style={s.icon}>` at `fontSize: 40`, i.e. an emoji or a text glyph. The
design language is explicit that icons are hand-authored inline SVG in
`ui/icons.tsx` and that there are **no emoji** — so this component encodes the
wrong idea of what an icon is.

### Meanwhile, six screens each rolled their own

```
$ grep -rn "empty:" src/
src/app/(tabs)/home/index.tsx:185
src/app/(tabs)/home/history.tsx:151
src/app/(tabs)/library/index.tsx:366
src/app/playing/queue.tsx:124
src/components/PairingScreen.tsx:226
src/components/bluetooth/BluetoothSheet.tsx:135
```

Two of them are literally the same declaration with a different top pad:

```tsx
/* library/index.tsx:366 */
empty: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 14, textAlign: 'center', paddingTop: 70 },
/* queue.tsx:124 */
empty: { color: Palette.textSecondary, fontFamily: Font.regular, fontSize: 14, textAlign: 'center', paddingTop: 60 },
```

### And none of them offer a way out

Every empty state in the app is a **sentence**. The most consequential one:

```tsx
/* src/app/(tabs)/home/index.tsx:147-151 — current */
        {albums.length === 0 && (
          <Text style={s.empty}>
            {isLoading ? 'Loading the library from the Pod…' : 'Nothing on the Pod yet — add music from Pod › Storage.'}
          </Text>
        )}
```

A new owner with an empty Pod is told, in prose, to navigate to Pod › Storage.
The app *has* that screen, the upload flow works end to end, and the empty state
declines to take them there. That is the single highest-intent moment in the
product — someone who just bought a music player and has no music on it — and it
is answered with a sentence and no button.

## Target

Rewrite `EmptyState` to the design language, with an optional action, and adopt
it in the four content screens.

```tsx
/* src/components/ui/EmptyState.tsx — target, complete file */
import { StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from '@/components/ui/icons';
import { PillButton } from '@/components/ui/controls';
import { Palette, Font, Radius, Type } from '@/constants/theme';

/**
 * The app's one empty state.
 *
 * Two rules it exists to enforce. The icon is an `IconName` from the inline-SVG
 * set, never a string glyph or emoji — the previous version of this component
 * took `icon?: string` and rendered it as 40pt text, which is why it was never
 * adopted. And an empty state that the user can *act* on gets a button: telling
 * someone in prose to go to Pod › Storage when we could put them there is the
 * kind of thing that reads as unfinished.
 */
export function EmptyState({ icon, title, subtitle, actionLabel, onAction, compact }: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Sits inside a list rather than owning the screen — no vertical centring. */
  compact?: boolean;
}) {
  return (
    <View style={[s.wrap, compact ? s.compact : s.full]}>
      {icon && (
        <View style={s.mark}>
          <Icon name={icon} size={22} color={Palette.textMuted} />
        </View>
      )}
      <Text style={s.title}>{title}</Text>
      {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <PillButton label={actionLabel} onPress={onAction} variant="accent" style={s.action} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: 36, gap: 10 },
  full: { flex: 1, justifyContent: 'center' },
  compact: { paddingTop: 64 },
  mark: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Palette.rail, alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  title: { color: Palette.text, fontFamily: Font.bold, fontSize: Type.title3, textAlign: 'center' },
  subtitle: {
    color: Palette.textSecondary, fontFamily: Font.regular, fontSize: Type.body,
    lineHeight: 21, textAlign: 'center',
  },
  action: { alignSelf: 'stretch', marginTop: 12 },
});
```

### Adoption, with the copy to use

| Screen | icon | title | subtitle | action |
| --- | --- | --- | --- | --- |
| `home/index.tsx` (no albums, not loading) | `download` | `Nothing on the Pod yet` | `Add FLAC, ALAC or WAV over Wi-Fi and it'll show up here.` | **`Add music` → `router.push('/pod/storage')`** |
| `library/index.tsx` (`ListEmptyComponent`, no query) | `tab-library` | `Nothing on the Pod yet` | `Add music from Pod › Storage.` | `Add music` → `/pod/storage` |
| `library/index.tsx` (`ListEmptyComponent`, with a query) | `search` | `No results for "<query>"` | `Try an artist, an album, or `hi-res`.` | — |
| `playing/queue.tsx` (nothing upcoming) | `queue` | `Nothing up next` | `Play an album and the rest of it queues automatically.` | — |

Use `compact` for the two `ListEmptyComponent` cases (they sit inside a
`FlatList` that already has a header above it) and full for Home.

Check each `IconName` exists in `src/components/ui/icons.tsx` before using it;
substitute the nearest one that does rather than adding new SVG in this plan.

## Repo conventions to follow

- `PillButton` is the app's full-width button (`controls.tsx`), and `variant`
  picks its ground. `accent` is correct here — an empty state's action is the
  single thing to do on the screen, which is exactly the "one accent gesture per
  surface" rule.
- Copy in this app is plain and lowercase-after-the-first-word, never shouty and
  never exclamatory. Match `PairingScreen`'s tone — *"The Pod keeps playing
  either way"* — not marketing voice.
- **Exemplar to imitate**: `src/components/PairingScreen.tsx`'s empty block —
  centred, an icon mark, a title, a muted subtitle.

## Steps

1. Rewrite `src/components/ui/EmptyState.tsx` with the target above. Verify
   every `IconName` used exists in `ui/icons.tsx`.
2. `src/app/(tabs)/home/index.tsx` — replace the `albums.length === 0` text
   block. Keep the `isLoading` branch delegating to plan 005's skeletons; this
   plan owns only the genuinely-empty case. Delete the now-unused `s.empty`.
3. `src/app/(tabs)/library/index.tsx` — replace both `ListEmptyComponent` uses
   (`<Text style={s.empty}>{empty}</Text>`), branching on whether `q` is set for
   the two different messages. Delete `s.empty` and the `empty` string variable
   it fed.
4. `src/app/playing/queue.tsx` — same treatment; delete its `s.empty`.
5. Leave `home/history.tsx`, `PairingScreen.tsx` and `BluetoothSheet.tsx` alone —
   see Boundaries.
6. Remove `EmptyState` from the "Known dead code" list in
   `docs/PROJECT_STATUS.md`, since it will no longer be dead.

## Boundaries

- Do NOT convert `PairingScreen.tsx:226` or `BluetoothSheet.tsx:135`. Those are
  *scanning* states inside a device picker, not empty content — they say "still
  looking", and they sit under a live `Pulse`/spinner that carries the meaning.
  Different problem, different affordance.
- Do NOT convert `home/history.tsx:151` in this pass. History's empty state is
  genuinely different — it is empty because you haven't listened yet, and the
  honest action there is "go play something", which is a navigation decision
  worth making separately.
- Do NOT add new SVG icons. Use what `ui/icons.tsx` already has.
- Do NOT add an illustration, mascot or artwork. The visual language is a hue
  block and a mono readout; a drawn illustration would be the only one in the
  app.
- Do NOT add dependencies.

## Verification

- **Mechanical**: `npx tsc --noEmit` → 0. `npx expo export --platform ios` → 0.
  `grep -rn "empty:" src/` → three left (`history`, `PairingScreen`,
  `BluetoothSheet`), all deliberate.
- **Feel check**:
  - With a Pod that has no music (or after **Pod › About › Reset app** and a
    re-pair against an empty `Uploads/`), Home must show the icon mark, the
    title, the subtitle and an **Add music** button — and the button must land
    on Pod › Storage.
  - Search Library for a nonsense string: the empty state must quote the query
    back and must **not** offer the "Add music" button (there is music; the
    search just missed).
  - Open the Queue while a single track plays with nothing after it: the
    "Nothing up next" state should sit under the header, not float in the middle
    of the screen — that is what `compact` is for.
  - Check the empty state against a long query string — it must wrap, not clip.
- **Done when**: every content-empty screen in the app uses `EmptyState`, the
  Home empty state offers a working route to the upload flow, and the three
  deliberately-excluded states above still look as they did.
