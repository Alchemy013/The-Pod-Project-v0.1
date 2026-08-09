# 001 — Route the transport controls and the two `opacity: 0.6` rows through `Pressed`

- **Status**: DONE (applied 2026-08-10, `tsc --noEmit` + `expo export --platform ios` clean; NOT yet run on hardware)
- **Commit**: 4f5c7fd
- **Severity**: HIGH
- **Category**: Physicality & origin / Cohesion & tokens
- **Estimated scope**: 4 files, ~60 lines changed (mostly deletions)

## Problem

`src/components/ui/controls.tsx:18-27` documents `Pressed` as the app's single
source of tap feedback: *"rows, cards and tiles all route through it, so the
whole app reacts the same way instead of some surfaces feeling dead."*

Three places contradict that, and they are among the most-tapped surfaces in the
app.

### 1a — The five transport controls have no press feedback at all

`src/app/playing/index.tsx:281-295` — current:

```tsx
        <View style={s.transport}>
          <Pressable style={s.tb} onPress={toggleShuffle} accessibilityRole="button" accessibilityLabel="Shuffle">
            <Icon name="shuffle" size={20} color={shuffle ? Palette.accent : DIM} />
          </Pressable>
          <Pressable style={s.tb} onPress={previous} accessibilityRole="button" accessibilityLabel="Previous track">
            <Icon name="previous" size={24} color={Palette.text} />
          </Pressable>
          <Fab size={68} playing={isPlaying} onPress={isPlaying ? pause : play} />
          <Pressable style={s.tb} onPress={next} accessibilityRole="button" accessibilityLabel="Next track">
            <Icon name="next" size={24} color={Palette.text} />
          </Pressable>
          <Pressable style={s.tb} onPress={cycleRepeat} accessibilityRole="button" accessibilityLabel={`Repeat: ${repeat}`}>
            <Icon name={repeat === 'one' ? 'repeat-one' : 'repeat'} size={20} color={repeat !== 'off' ? Palette.accent : DIM} />
          </Pressable>
        </View>
```

Four dead 48×48 targets sitting either side of a `Fab` that springs on press.
The inconsistency is visible in a single glance at one row.

The lyrics toggle on the same screen, `src/app/playing/index.tsx:249-258`, has
the same problem:

```tsx
        {lyricsState !== 'idle' && (
          <Pressable
            onPress={() => setShowLyrics((v) => !v)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={showLyrics ? 'Hide lyrics' : 'Show lyrics'}
          >
            <Icon name="quote" size={21} color={showLyrics ? Palette.accent : DIM} />
          </Pressable>
        )}
```

### 1b — A second, contradictory press idiom: an instant `opacity: 0.6` flash

`src/components/ui/NavRow.tsx:21-26` and `:55` — current:

```tsx
    <Pressable
      style={({ pressed }) => [s.row, !last && s.divider, pressed && interactive && s.pressed]}
      onPress={onPress}
      disabled={!interactive}
      accessibilityRole={interactive ? 'button' : undefined}
    >
```
```tsx
  pressed: { opacity: 0.6 },
```

`src/app/playing/queue.tsx:16` — current:

```tsx
    <Pressable style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]} onPress={onPress}>
```

That is a **0.4 opacity dip, applied instantly with no transition and with no
press delay**. `src/components/ui/controls.tsx:44-46` explicitly documents
rejecting a shallower version of exactly this:

```tsx
    // A shallow dip. At 0.35 the whole row visibly flickered on every tap,
    // which reads as a glitch rather than as feedback.
    opacity: 1 - pressed.value * 0.14,
```

`NavRow` renders every row of every Pod settings screen; `QueueRow` renders
every row of the queue. Both are inside scroll views and neither has
`unstable_pressDelay`, so touching one on the way into a scroll flashes it —
the precise problem `controls.tsx:58-61` was written to prevent.

## Target

Every one of these routes through `Pressed`, which already provides:

- press-in: `withTiming(1, { duration: 70, easing: Easing.out(Easing.quad) })`
- release: `withSpring(0, { damping: 18, stiffness: 420, mass: 0.45 })`
- opacity dip of `0.14`, scale dip of `1 - scaleTo`
- `unstable_pressDelay={55}`

`Pressed` needs one new optional prop first, because two of the call sites rely
on `hitSlop` and losing it would shrink a 21px icon to a 21px touch target.

### Target `Pressed` signature

```tsx
// src/components/ui/controls.tsx — target
export function Pressed({
  children, onPress, onLongPress, style, scaleTo = 0.97, disabled, label, selected, hitSlop,
}: {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Large tiles want a subtler dip than small rows. */
  scaleTo?: number;
  disabled?: boolean;
  label?: string;
  selected?: boolean;
  /** For bare icon targets whose glyph is smaller than a 44pt touch area. */
  hitSlop?: number;
}) {
```

and on the `AnimatedPressable`, add exactly one prop alongside the existing ones:

```tsx
      hitSlop={hitSlop}
```

### Target scale values

Pick by element size, matching how the file already tunes `scaleTo` (see
"Repo conventions"):

| Element | `scaleTo` |
| --- | --- |
| Transport buttons (48×48 icon targets) | `0.86` |
| Lyrics toggle (bare 21px icon) | `0.86` |
| `NavRow` (full-width settings row) | `0.97` (the default — omit the prop) |
| `QueueRow` (full-width list row) | `0.97` (the default — omit the prop) |

## Repo conventions to follow

- `Pressed` lives in `src/components/ui/controls.tsx:28`. Import it from
  `@/components/ui/controls`.
- `scaleTo` is tuned per element size, and the file documents why: a 3% dip that
  reads right on a row makes a large tile lurch. Existing exemplars —
  `controls.tsx:135` (`Fab`, `scaleTo={0.9}`), `controls.tsx:283`
  (`IconCircle`, `scaleTo={0.88}`), `controls.tsx:355` (`PillButton`,
  `scaleTo={0.96}`), `MiniPlayer.tsx:61` (`scaleTo={0.985}` on a wide thin bar).
- **Exemplar to imitate**: `src/components/MiniPlayer.tsx:68-75` — a small icon
  target routed through `Pressed` with a `label` and a tuned `scaleTo`:
  ```tsx
          <Pressed
            onPress={() => router.push('/playing/queue')}
            label="Queue"
            scaleTo={0.85}
            style={s.queueHit}
          >
            <Icon name="queue" size={17} color="rgba(255,255,255,0.8)" />
          </Pressed>
  ```
- `Pressed` hardcodes `accessibilityRole="button"` and maps its `label` prop to
  `accessibilityLabel`. So when converting, **delete the explicit
  `accessibilityRole="button"` and move `accessibilityLabel="X"` to
  `label="X"`.** Do not pass `accessibilityLabel` to `Pressed` — it is not a
  prop and will not compile under `strict`.

## Steps

1. **`src/components/ui/controls.tsx`** — add the `hitSlop` passthrough to
   `Pressed` exactly as shown in "Target `Pressed` signature" above: one line in
   the destructured params, one line in the type, one `hitSlop={hitSlop}` prop
   on the `AnimatedPressable` at `controls.tsx:50-64`. Change nothing else in
   this file.

2. **`src/app/playing/index.tsx`** — replace the transport block at lines
   281-295 with:

   ```tsx
        <View style={s.transport}>
          <Pressed style={s.tb} onPress={toggleShuffle} scaleTo={0.86} label="Shuffle">
            <Icon name="shuffle" size={20} color={shuffle ? Palette.accent : DIM} />
          </Pressed>
          <Pressed style={s.tb} onPress={previous} scaleTo={0.86} label="Previous track">
            <Icon name="previous" size={24} color={Palette.text} />
          </Pressed>
          <Fab size={68} playing={isPlaying} onPress={isPlaying ? pause : play} />
          <Pressed style={s.tb} onPress={next} scaleTo={0.86} label="Next track">
            <Icon name="next" size={24} color={Palette.text} />
          </Pressed>
          <Pressed style={s.tb} onPress={cycleRepeat} scaleTo={0.86} label={`Repeat: ${repeat}`}>
            <Icon name={repeat === 'one' ? 'repeat-one' : 'repeat'} size={20} color={repeat !== 'off' ? Palette.accent : DIM} />
          </Pressed>
        </View>
   ```

3. **`src/app/playing/index.tsx`** — replace the lyrics toggle at lines 249-258
   with:

   ```tsx
        {lyricsState !== 'idle' && (
          <Pressed
            onPress={() => setShowLyrics((v) => !v)}
            hitSlop={12}
            scaleTo={0.86}
            label={showLyrics ? 'Hide lyrics' : 'Show lyrics'}
          >
            <Icon name="quote" size={21} color={showLyrics ? Palette.accent : DIM} />
          </Pressed>
        )}
   ```

4. **`src/app/playing/index.tsx`** — add `Pressed` to the existing import from
   `@/components/ui/controls` on line 17:

   ```tsx
   import { Fab, IconCircle, LiveText, Pressed, Scrubber, SpecBadge } from '@/components/ui/controls';
   ```

   Then check whether `Pressable` is still referenced anywhere in the file. After
   steps 2 and 3 it should not be — remove it from the `react-native` import on
   line 2, leaving:

   ```tsx
   import { ScrollView, StyleSheet, Text, View } from 'react-native';
   ```

5. **`src/components/ui/NavRow.tsx`** — a non-interactive `NavRow` (no `onPress`)
   is a read-only telemetry row and must **not** become a button. Branch
   explicitly. Replace lines 1-3 and 20-42 so the file reads:

   ```tsx
   import { StyleSheet, Text, View } from 'react-native';
   import { Icon } from '@/components/ui/icons';
   import { Pressed } from '@/components/ui/controls';
   import { Palette, Font } from '@/constants/theme';
   ```

   ```tsx
     const body = (
       <>
         <Text style={[s.label, destructive && s.destructiveLabel]} numberOfLines={1}>{label}</Text>
         <View style={s.right}>
           {value !== undefined && (
             <Text
               style={[s.value, numeric && { fontFamily: Font.mono, fontSize: 13.5 }, valueColor ? { color: valueColor } : undefined]}
               numberOfLines={1}
             >
               {value}
             </Text>
           )}
           {interactive && !destructive && (
             <Icon name="chevron-right" size={14} color={Palette.textMuted} />
           )}
         </View>
       </>
     );

     // A row with no `onPress` is a readout, not a control — it must not be
     // announced as a button and must not react to touch.
     if (!interactive) {
       return <View style={[s.row, !last && s.divider]}>{body}</View>;
     }

     return (
       <Pressed style={[s.row, !last && s.divider]} onPress={onPress} label={label}>
         {body}
       </Pressed>
     );
   ```

6. **`src/components/ui/NavRow.tsx`** — delete the now-unused `pressed` style
   from the `StyleSheet` (line 55, `pressed: { opacity: 0.6 },`).

7. **`src/app/playing/queue.tsx`** — replace line 16 with:

   ```tsx
       <Pressed style={s.row} onPress={onPress} label={song.title}>
   ```

   and change the matching closing `</Pressable>` on line 25 to `</Pressed>`.
   Add `Pressed` to the existing `@/components/ui/controls` import on line 11:

   ```tsx
   import { HeaderWash, IconCircle, Overline, Pressed, PlayingBars } from '@/components/ui/controls';
   ```

   `Pressable` is still used elsewhere in `queue.tsx` (lines 55 and 87), so
   **leave the `react-native` import alone** in this file.

## Scope widened during execution

> Added 2026-08-10, after applying the plan as written.
>
> The boundary below ("don't convert the other bare `Pressable`s") turned out to
> be wrong, and following it left the codebase in a worse state than either
> finishing or not starting: `NavRow` and `QueueRow` were fixed while **five
> other rows and cards kept the identical `opacity: 0.6` flash**, so the app had
> two press idioms *and* no rule you could state about which surface got which.
>
> The sweep that caught it:
>
> ```
> $ grep -rn "pressed && \|opacity: 0.6" src/
> ```
>
> These five were converted too, on the same pattern:
>
> | Site | `label` | Note |
> | --- | --- | --- |
> | `src/app/(tabs)/pod/network.tsx:155` | `item.ssid` | Wi-Fi scan result row |
> | `src/app/(tabs)/library/album/[id].tsx:151` | `item.title` | Track row; keeps its `onLongPress` |
> | `src/components/PairingScreen.tsx:23` | `name` | Device card — was `opacity: 0.7` |
> | `src/components/bluetooth/BluetoothSheet.tsx:22` | `name` | Also gained `selected={state === 'connected'}`; keeps `disabled` |
>
> `BluetoothSheet`'s now-dead `pressed: { opacity: 0.6 }` style was deleted, as
> were the newly-unused `Pressable` imports in `BluetoothSheet.tsx`.
>
> The lesson for future plans: a plan that fixes an *idiom* has to fix every
> instance of it or explicitly justify each survivor. Scoping by "the two worst"
> is only valid when the rest are genuinely different, which these were not.

## Boundaries

- Do NOT convert the remaining bare `Pressable`s — `pod/index.tsx:160`,
  `library/index.tsx:229,238,264`, `Onboarding.tsx`, `Sheet.tsx`,
  `SectionHeader.tsx`, `queue.tsx:55,87`, `network.tsx:115,118,139`,
  `album/[id].tsx:124,127`. These are **hitSlop'd bare icon or text targets, not
  rows or cards** — they never carried a `pressed` style, so there is no second
  idiom to unify. Leave them.
- Do NOT change `Pressed`'s timing, spring config, `unstable_pressDelay`, or
  opacity dip. The only edit to `controls.tsx` is the `hitSlop` passthrough.
- Do NOT change layout, spacing, colours, icon sizes, or the `s.tb` / `s.row`
  styles.
- Do NOT add dependencies.
- If a step's "current" code does not match what you find, STOP and report
  instead of improvising.

## Verification

- **Mechanical**: `npx tsc --noEmit` — must exit 0 with no new errors. Then
  `grep -rn "opacity: 0.6" src/components/ui/NavRow.tsx src/app/playing/queue.tsx`
  must return nothing.
- **Feel check**: run the app on a device (`npx expo run:ios --configuration Release`),
  play a track, open Now Playing, and confirm:
  - Pressing **previous / next / shuffle / repeat** dips and springs back, the
    same way the orange play button next to them does. Before this change they
    did nothing at all.
  - The dip is **subtle** — the icons should not flicker or strobe. If a press
    reads as a flash rather than a push, `scaleTo` is wrong, not the opacity.
  - Tapping **next** twice quickly does not restart the animation from zero
    (`Pressed` uses a spring, which retargets from the current value).
  - Open **Pod › Battery**. Scroll the settings list by starting the drag *on a
    row*. The row must **not** flash before the scroll takes over — this is the
    `unstable_pressDelay={55}` you just inherited.
  - In Pod › Battery, the read-only rows (ones with no chevron) must not
    respond to touch at all, and VoiceOver must not announce them as buttons.
  - Open the **Queue** from the MiniPlayer and press a row: same dip-and-spring
    as a Library row, not the old hard 40% flash.
- **Done when**: no `Pressable` with an `opacity: 0.6` pressed-style remains in
  `NavRow.tsx` or `queue.tsx`, the five Now Playing transport controls visibly
  respond to touch, and `tsc --noEmit` is clean.
