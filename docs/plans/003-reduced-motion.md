# 003 — Honour the system Reduce Motion setting

- **Status**: DONE (applied 2026-08-10, `tsc --noEmit` + `expo export --platform ios` clean; NOT yet run on hardware)
- **Commit**: 4f5c7fd
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 4 files, ~30 lines

## Problem

The app has no reduced-motion handling of any kind. Verified:

```
$ grep -rn 'ReducedMotion\|prefers-reduced\|isReduceMotionEnabled\|AccessibilityInfo' src/
$ echo $?
1
```

With iOS **Settings › Accessibility › Motion › Reduce Motion** on, ThePod
animates exactly as much as it does with it off. The two worst offenders are
**infinite** loops that never stop while their screen is visible:

```tsx
/* src/components/ui/controls.tsx:374-377 — current. Pulse runs forever. */
  const p = useSharedValue(0);
  useEffect(() => {
    if (!active) { p.value = 0; return; }
    p.value = withRepeat(withTiming(1, { duration: durationMs, easing: Easing.out(Easing.quad) }), -1, false);
  }, [active, durationMs]);
```

`Pulse` is on screen during pairing (`src/components/PairingScreen.tsx:115`),
throughout onboarding (`src/components/Onboarding.tsx:42`) and on the Pod tab
(`src/app/(tabs)/pod/index.tsx:122`).

```tsx
/* src/components/ui/controls.tsx:416-421 — current. One per playing row, forever. */
  const scale = useSharedValue(from / BAR_H);
  useEffect(() => {
    scale.value = withRepeat(
      withTiming(to / BAR_H, { duration: ms, easing: Easing.inOut(Easing.ease) }), -1, true,
    );
  }, []);
```

`PlayingBars` renders on the currently-playing row in the Library
(`src/app/(tabs)/library/index.tsx:48`), the album screen
(`src/app/(tabs)/library/album/[id].tsx:164`) and the queue
(`src/app/playing/queue.tsx:79`).

Beyond those, every spring and slide in the app runs at full travel: the album
art's swipe and play/pause settle (`src/app/playing/index.tsx:110, 137`), the
tab glyph spring (`src/components/app-tabs.tsx:35`), and the MiniPlayer's
slide-up entrance (`src/components/MiniPlayer.tsx:48`), which moves everything
above it.

## Target

Reduced motion means **fewer and gentler animations, not zero**. Opacity and
colour transitions that aid comprehension stay; position, scale and looping
motion go.

Reanimated 4.3.1 (confirmed installed) provides all three pieces needed:
`ReducedMotionConfig`, the `ReduceMotion` enum (`System | Always | Never`), and
the `useReducedMotion()` hook.

Four changes:

1. **Global switch.** One component in the root layout makes every
   `withTiming` / `withSpring` / `withRepeat` / layout animation in the app
   respect the OS setting:

   ```tsx
   /* target */
   <ReducedMotionConfig mode={ReduceMotion.System} />
   ```

2. **Opt two opacity fades back in**, because the global switch would disable
   them too and they carry information rather than movement — album art arriving
   and the play/pause glyph changing state:

   ```tsx
   /* target */
   withTiming(1, { duration: 260, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never })
   ```

3. **`Pulse` renders nothing** under reduced motion. It is a decorative "this is
   live" ring; the status dot it sits behind already carries that meaning, and a
   disabled `withRepeat` would strand it mid-travel.

4. **`PlayingBars` holds a static, uneven meter** under reduced motion — the
   three bars stay at their `from` heights (3, 11, 6 of 13). The shape still
   marks the playing row; only the movement goes.

5. **`MiniPlayer` fades instead of sliding** under reduced motion — the bar
   changes the height of everything above it, so its entrance is a position
   change, but it must not simply pop.

## Repo conventions to follow

- Reanimated is imported as a named import list from `'react-native-reanimated'`
  at the top of every file that uses it — e.g.
  `src/components/ui/controls.tsx:5-8`. Add the new names to the existing list;
  do not add a second import statement.
- Non-obvious motion decisions carry a short comment explaining the *why*, not
  the *what*. See `src/components/ui/controls.tsx:378-380` for the house style.
- **Exemplar to imitate** for a component that already branches on a boolean and
  passes different animation values: `src/components/app-tabs.tsx:33-37`.

## Steps

1. **`src/app/_layout.tsx`** — add the import (there is no
   `react-native-reanimated` import in this file yet; put it after the
   `react-native-safe-area-context` import on line 4):

   ```tsx
   import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated';
   ```

   Then render it immediately after `<NotificationSync />` on line 138:

   ```tsx
               <NotificationSync />
               {/* Every Reanimated animation in the app now respects
                   Settings › Accessibility › Motion › Reduce Motion. Individual
                   animations opt back in with `reduceMotion: ReduceMotion.Never`
                   where the motion carries information rather than decoration. */}
               <ReducedMotionConfig mode={ReduceMotion.System} />
   ```

2. **`src/components/ui/controls.tsx`** — add `useReducedMotion` and
   `ReduceMotion` to the existing Reanimated import on lines 5-8:

   ```tsx
   import Animated, {
     Easing, ReduceMotion, SharedValue, runOnJS, useAnimatedProps, useAnimatedStyle,
     useReducedMotion, useSharedValue, withRepeat, withSpring, withTiming,
   } from 'react-native-reanimated';
   ```

3. **`src/components/ui/controls.tsx`** — in `Fab`, line 117 currently reads:

   ```tsx
       p.value = withTiming(playing ? 1 : 0, { duration: 190, easing: Easing.out(Easing.cubic) });
   ```

   Replace with:

   ```tsx
       // Opted back in under reduced motion: this cross-fade reports playback
       // state, so losing it would leave the glyph mid-swap on the app's single
       // most-tapped control.
       p.value = withTiming(playing ? 1 : 0, {
         duration: 190, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never,
       });
   ```

4. **`src/components/ui/controls.tsx`** — in `Pulse` (lines 366-392), add the
   hook and an early return. Insert `const reduced = useReducedMotion();` as the
   first line of the function body, then place the early return **after** the
   existing `useSharedValue`, `useEffect` and `useAnimatedStyle` calls and
   **before** the `return (` of the JSX, so hook order stays stable:

   ```tsx
     // Decorative "this is live" ring. Under reduced motion the status dot it
     // sits behind already says the same thing, so it simply doesn't render —
     // a disabled repeat would otherwise strand the ring mid-travel.
     if (reduced) return null;
   ```

5. **`src/components/ui/controls.tsx`** — in `Bar` (lines 415-428), replace the
   effect at lines 416-421 with:

   ```tsx
     const reduced = useReducedMotion();
     const scale = useSharedValue(from / BAR_H);
     useEffect(() => {
       // Under reduced motion the three bars hold their opening heights: still a
       // deliberately uneven meter that marks the playing row, with no movement.
       if (reduced) return;
       scale.value = withRepeat(
         withTiming(to / BAR_H, { duration: ms, easing: Easing.inOut(Easing.ease) }), -1, true,
       );
     }, [reduced]);
   ```

6. **`src/components/ui/AlbumArt.tsx`** — add `ReduceMotion` to the Reanimated
   import on line 3, then replace line 44:

   ```tsx
         opacity.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) });
   ```

   with:

   ```tsx
         // Opted back in: this is an opacity reveal, not movement, and without it
         // late-arriving artwork pops in over the hue block.
         opacity.value = withTiming(1, {
           duration: 260, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never,
         });
   ```

7. **`src/components/MiniPlayer.tsx`** — add `FadeIn`, `FadeOut` and
   `useReducedMotion` to the Reanimated import on lines 3-5:

   ```tsx
   import Animated, {
     Easing, FadeIn, FadeOut, SlideInDown, SlideOutDown, useAnimatedStyle,
     useReducedMotion, useSharedValue, withTiming,
   } from 'react-native-reanimated';
   ```

   Add `const reduced = useReducedMotion();` next to the other hooks (after
   `const art = useArt(...)` on line 21), and replace line 48:

   ```tsx
       <Animated.View entering={SlideInDown.duration(320)} exiting={SlideOutDown.duration(240)}>
   ```

   with:

   ```tsx
       <Animated.View
         entering={reduced ? FadeIn.duration(200) : SlideInDown.duration(320)}
         exiting={reduced ? FadeOut.duration(160) : SlideOutDown.duration(240)}
       >
   ```

## Boundaries

- Do NOT add per-animation `reduceMotion` overrides anywhere other than the two
  named in steps 3 and 6. Everything else should be governed by the global
  config.
- Do NOT change any duration, easing, spring config, or `withRepeat` argument
  other than as written above.
- Do NOT touch the seek/volume progress glide (`playing/index.tsx:149-151`,
  `MiniPlayer.tsx:31-33`). Letting the bar step once a second under reduced
  motion is the correct behaviour, not a regression.
- Do NOT add dependencies — `react-native-reanimated@4.3.1` already exports all
  three APIs used here.
- If a quoted "current" line does not match what you find, STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit` — exit 0. Then
  `grep -rn 'useReducedMotion\|ReducedMotionConfig' src/` must show hits in
  `_layout.tsx`, `controls.tsx` (×2), and `MiniPlayer.tsx`.
- **Feel check** — note first that `useReducedMotion()` reads the setting **at
  app start and does not re-render on change**, so the app must be fully
  relaunched after each toggle. Toggle iOS Settings › Accessibility › Motion ›
  Reduce Motion **on**, relaunch, then confirm:
  - **Pairing screen**: no expanding ring around the mark. The status dot is
    still there.
  - **Library**, playing a track: the three bars on the playing row are
    **visible but frozen** at uneven heights. They must not vanish, and must not
    all sit at the same height.
  - **Album artwork still fades in** when it arrives over BLE — it must not pop.
  - **Play/pause**: the orange button still cross-fades between the two glyphs.
    It must never show both or neither.
  - **MiniPlayer**: starting the first track fades the bar in rather than
    sliding it up.
  - **Tab switching**: the tab glyph changes colour but does not spring.
  - **Now Playing**: swiping the artwork sideways still changes track, but the
    art does not travel or spring back.
  - Then toggle Reduce Motion **off**, relaunch, and confirm every animation is
    back exactly as it was — especially the pulse ring and the level meter.
- **Done when**: with Reduce Motion on, nothing on any screen loops or moves
  under its own power, while artwork reveal and the play/pause glyph change
  still animate; and with it off, behaviour is byte-for-byte the previous
  experience.
