# 002 — Take the `Scrubber` grab feedback off layout properties

- **Status**: DONE (applied 2026-08-10, `tsc --noEmit` + `expo export --platform ios` clean; NOT yet run on hardware)
- **Commit**: 4f5c7fd
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: 1 file, ~8 lines

## Problem

`src/components/ui/controls.tsx:237-240` animates `height` and `borderRadius` —
both layout properties — every time the seek or volume bar is grabbed and again
when it is released:

```tsx
  /* src/components/ui/controls.tsx:237-240 — current */
  const trackStyle = useAnimatedStyle(() => ({
    height: 4 + grabbed.value * 4,
    borderRadius: 2 + grabbed.value * 2,
  }));
```

`grabbed` is driven by `withSpring(1, GRAB_SPRING)` on `onBegin` and
`withSpring(0, GRAB_SPRING)` on `onFinalize` (`controls.tsx:219, 232`), with
`GRAB_SPRING = { damping: 20, stiffness: 300, mass: 0.5 }` (`controls.tsx:267`).
That is roughly 400ms of per-frame layout passes on grab and another 400ms on
release.

It happens on Now Playing (`src/app/playing/index.tsx:262` seek,
`:299` volume), which is also holding a three-stop `LinearGradient`
(`playing/index.tsx:178-182`), decoded album artwork, and the lyric sheet.

This is the same class of mistake the file elsewhere goes out of its way to
avoid, twice:

```tsx
/* src/components/ui/controls.tsx:412-414 — the rule this violates */
// Scale, not height: animating `height` re-runs layout on every frame for every
// bar, which is what made the meter judder next to a scrolling list. A bar of
// fixed height scaled from its base is pure compositing.
```
```tsx
/* src/components/ui/controls.tsx:241-243 — the rule this violates, again */
  // scaleX from the left edge, never `width`: a percentage width re-runs layout
  // for the track on every frame, which is exactly the judder this replaces.
```

## Target

Give the track a **fixed** 8px height and radius 4 in the `StyleSheet`, and
animate `scaleY` from `0.5` to `1` instead. This is a pure compositing
operation — no layout, no paint.

The visual result is identical. A rounded rect 8px tall with radius 4, scaled to
`scaleY: 0.5`, renders as a 4px-tall bar with 4×2 elliptical corners — which is
what a 4px-tall bar with radius 2 already looks like at this size.

```tsx
/* src/components/ui/controls.tsx — target, replacing lines 237-240 */
  // scaleY, never `height`: a height animation re-runs layout for the track on
  // every frame of the grab spring. An 8px track scaled to 0.5 is pixel-identical
  // to a 4px one and costs nothing but a composite.
  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: 0.5 + grabbed.value * 0.5 }],
  }));
```

```tsx
/* src/components/ui/controls.tsx — target, replacing the `scrubTrack` style */
  scrubTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
```

The default `transformOrigin` is centre, which is correct here: the track is
vertically centred inside `scrubHit` (`height: 26, justifyContent: 'center'`,
`controls.tsx:453`), so it must grow from its middle, exactly as the height
animation did.

## Repo conventions to follow

- Animated styles live in `useAnimatedStyle` next to the component; static
  geometry lives in the `StyleSheet` at the bottom of `controls.tsx` (line 430
  onward).
- The codebase's stated rule is: animate `transform` and `opacity` only, and
  leave a comment saying why when replacing a layout animation.
- **Exemplars to imitate**, both in the same file:
  - `src/components/ui/controls.tsx:415-427` (`Bar`) — fixed `height: BAR_H`
    in the style, `scaleY` in the animated style, `transformOrigin: 'bottom'`.
  - `src/components/ui/controls.tsx:243` (`fillStyle`) — `scaleX` on a
    full-size view rather than an animated `width`.

## Steps

1. **`src/components/ui/controls.tsx`** — replace `trackStyle` at lines 237-240
   with the target block above, including the comment.

2. **`src/components/ui/controls.tsx`** — replace the `scrubTrack` entry in the
   `StyleSheet` (line 454) with the target line above. It currently reads:

   ```tsx
     scrubTrack: { backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
   ```

   Note that the track has **no** height in the stylesheet today — its entire
   height comes from the animated style. After this change the stylesheet owns
   the height and the animated style only scales it.

3. Change nothing else. `fillStyle`, `knobStyle`, `GRAB_SPRING`, the gesture,
   and `scrubKnob` are all correct as they stand.

## Boundaries

- Do NOT touch the pan gesture, `setFromX`, `liveMs` throttling, or `onCommit`.
- Do NOT touch `knobStyle` — the knob is absolutely positioned in `scrubHit`,
  not inside the track, so it is unaffected by the track's scale.
- Do NOT change `GRAB_SPRING`'s values or the `0.5` knob growth factor.
- Do NOT add dependencies.
- If lines 237-240 or line 454 do not match the "current" code quoted above,
  STOP and report instead of improvising.

## Verification

- **Mechanical**: `npx tsc --noEmit` — exit 0. Then
  `grep -n "height: 4 + grabbed" src/components/ui/controls.tsx` must return
  nothing.
- **Feel check**: run on a device, open Now Playing on a playing track, and
  confirm:
  - Putting a finger on the **seek bar** thickens the track and grows the knob,
    exactly as before — the bar must not appear to jump, shift vertically, or
    change its centre line.
  - The thickened bar's rounded ends still read as rounded, not as square
    corners or as a stretched pill.
  - The same on the **volume bar**, which has `knob={false}` — the track alone
    should thicken.
  - Drag the seek bar back and forth continuously for several seconds while the
    lyric sheet is showing (tap the quote icon first). The drag must stay
    smooth; this is the case the change is for.
  - Release and immediately re-grab. The spring should retarget from its current
    thickness, never snap to 4px first.
- **Done when**: the seek and volume bars behave identically to before by eye,
  no `height` or `borderRadius` appears in any `useAnimatedStyle` in
  `controls.tsx`, and `tsc --noEmit` is clean.
