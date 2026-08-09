# Design & motion plans

Two passes over ThePod at commit `4f5c7fd` (branch `fresh`), 2026-08-10, using
the `improve-animations` skill:

- **001–003** — the motion audit. Applied.
- **004–008** — a design audit that followed it, once the motion layer was
  clean enough that the remaining roughness was clearly *design*, not animation.
  008 applied; 004–007 are written and waiting.

Each plan is self-contained: exact file paths, current code verbatim, exact
target values, and a feel check. An executor with no context can run one without
reading the others.

## Motion pass

| # | Plan | Severity | Category | Files | Status |
| --- | --- | --- | --- | --- | --- |
| 001 | [Route the transport controls and the two `opacity: 0.6` rows through `Pressed`](001-press-feedback-through-pressed.md) | HIGH | Physicality / Cohesion | 4→9 | **DONE** |
| 002 | [Take the `Scrubber` grab feedback off layout properties](002-scrubber-grab-off-layout-props.md) | MEDIUM | Performance | 1 | **DONE** |
| 003 | [Honour the system Reduce Motion setting](003-reduced-motion.md) | MEDIUM | Accessibility | 4 | **DONE** |

All three were applied on **2026-08-10** against `4f5c7fd`, in that order.
`npx tsc --noEmit` exits 0 and `npx expo export --platform ios` bundles clean.

### Also landed with the motion pass

The audit's two lowest-priority items, implemented directly rather than
written up, since each was a handful of lines:

- **Motion tokens** (`Motion` in `src/constants/theme.ts`). The five hand-typed
  spring configs are now named by role — `press`, `grab`, `tab`, `swipe`,
  `settle` — plus the six durations that were reused across files. The values
  are unchanged and deliberately still differ from each other; this is a naming
  pass, not a consolidation, so a sixth spring can't be pasted in without
  someone noticing it duplicates a role. `grep -rn "damping:" src/` now returns
  hits only in `theme.ts`.
- **The four missed opportunities** from the audit:
  1. `TrackTrailing` (`controls.tsx`) — the level meter and the duration now
     cross-fade in a fixed-width box instead of hard-swapping and shoving the
     row's text sideways. It absorbed two byte-identical copies of `formatTime`
     and two identical `dur` styles from `library/index.tsx` and
     `library/album/[id].tsx`.
  2. The Onboarding pager dot stretches into the active pill (`Onboarding.tsx`),
     with a comment explaining why this is the one sanctioned place in the app
     that animates `width`.
  3. The Library's A–Z ↔ Recently-added toggle is in the list's key, so the
     reorder re-enters rather than teleporting.
  4. The Now Playing swipe fires on **distance or velocity**
     (`SWIPE_PX = 70`, `SWIPE_VELOCITY = 110` px/s). A fast flick that covered
     60px used to do nothing at all.

## Design pass

| # | Plan | Severity | Category | Files | Status |
| --- | --- | --- | --- | --- | --- |
| 004 | [Give the app a type scale, and make the radius scale mean something](004-type-and-radius-scale.md) | HIGH | Cohesion / tokens | 24 | **DONE** |
| 005 | [Replace the centred spinners with skeletons](005-loading-vocabulary.md) | HIGH | Missed opportunity | 5 | **DONE** |
| 006 | [One empty state, with a way out of it](006-one-empty-state.md) | MEDIUM | Cohesion | 5 | **DONE** |
| 007 | [Put the format where you browse](007-hi-res-where-you-browse.md) | MEDIUM | Missed opportunity | 7 | **DONE** |
| 008 | [Three doors to one room in the Home header](008-home-header-three-doors.md) | LOW | IA | 1 | **DONE** |

All five applied on **2026-08-10**, in the order below. `tsc --noEmit` exits 0,
`expo export --platform ios` bundles clean, and both `src/utils/*.test.ts`
self-checks pass.

⚠️ **004 in particular cannot be signed off from the diff.** It moved twelve of
the app's twenty-four font sizes, by up to 3pt. Its "Eye check" list is the real
verification and it is still outstanding.

Each plan records what actually happened under a "Deviations found during
execution" heading where reality differed from the write-up. The two worth
knowing: `ErrorBoundary` is exempt from the tokens on purpose, and the radius
finding was far smaller than its literal count implied — only 8 of 17 literals
were genuine rounded rectangles, the rest being circles whose radius is half
their own size.

### What the design audit measured

Not impressions — counts, so the plans argue from evidence:

| Finding | Measurement |
| --- | --- |
| No type scale | **24 distinct `fontSize` values**, six of them half-point (`14` *and* `14.5`, both in quantity) |
| `Radius` defined but bypassed | 6 tokens used in 15 places, against **17 distinct hardcoded `borderRadius` literals** |
| No loading vocabulary | Loading is `ActivityIndicator size="large"` — the canonical Android pattern, against this repo's own *"No Android-looking components"* rule |
| Empty states unshared | `EmptyState.tsx` exists and **nothing imports it**; six screens hand-rolled an `empty` style instead, two of them character-identical |
| Hi-res invisible where it matters | The product's core claim appears on 2 screens; the predicate is written out **3 times** and never rendered on a browse row |
| Home header | `/pod` reachable from the avatar, a gear, **and** a tab — three doors, one room |

### Execution order used, and why

**005 → 006 → 007 → 004** — deliberately *not* numeric order.

004 is the highest-severity plan but it went **last**: it rewrites `fontSize` in
24 files, so running it first would have forced every later plan onto a diff that
touched everything. 005–007 each add or move a small number of components, so
004 swept the finished set once instead of chasing a moving target.

One dependency had to be broken to make that work, exactly as anticipated: 006
and 007 write `Type.*` into their new components, so **004's step 1 (the `Type`
export alone) was landed up front** and only its sweep was deferred to the end.

Other dependencies, for the record:

- **006 depended on 005** loosely. Both touch the `albums.length === 0` branch in
  `home/index.tsx` — 005 owns the *loading* half, 006 the *empty* half.
- **007 was independent** — `utils/`, `controls.tsx` and four row components.
- **008 blocked nothing.**

⚠️ **Not run on hardware.** Every plan's *feel check* is still outstanding —
these are motion changes, and motion can be mechanically correct and still feel
wrong. Work through the "Feel check" section of each plan on a device before
treating them as verified.

Files touched: `src/app/_layout.tsx`, `src/app/playing/index.tsx`,
`src/app/playing/queue.tsx`, `src/app/(tabs)/pod/network.tsx`,
`src/app/(tabs)/library/album/[id].tsx`, `src/components/MiniPlayer.tsx`,
`src/components/PairingScreen.tsx`,
`src/components/bluetooth/BluetoothSheet.tsx`,
`src/components/ui/AlbumArt.tsx`, `src/components/ui/NavRow.tsx`,
`src/components/ui/controls.tsx`.

### Deviations from the plans as written

**1. Plan 001's scope was too narrow and had to be widened mid-execution.** It
converted `NavRow` and `QueueRow` while explicitly excluding five other rows and
cards carrying the *identical* `opacity: 0.6` idiom. That left the app with two
press idioms and no statable rule about which surface got which — worse than
either finishing or not starting. A `grep -rn "pressed && " src/` sweep caught
it; the other five (`pod/network.tsx`, `library/album/[id].tsx`,
`PairingScreen.tsx`, `BluetoothSheet.tsx`) were converted on the same pattern.
Full detail in plan 001 under "Scope widened during execution".

The generalisable lesson: **a plan that fixes an *idiom* must fix every instance
of it, or justify each survivor individually.** "The two worst" is only a valid
scope when the rest are genuinely a different case.

**2. `NavRow` gained a branch** that plan 001 specified and that is worth knowing
when reading the diff: a `NavRow` with no `onPress` is a readout (battery
percentage, MTU, IP address), so it renders a plain `View` rather than a
`Pressed`. Routing it through `Pressed` unconditionally would have announced
every telemetry row on the Pod tab as a button to VoiceOver.

### Regression check

One line, and it should stay empty:

```
grep -rn "pressed && " src/
```

## Deliberately not planned

Findings that were considered and consciously left alone. Recorded so a later
audit doesn't spend the time again.

- **A spacing scale.** The same measurement that found 24 font sizes finds gaps
  of 2, 3, 5, 6, 8, 9, 10, 11, 12, 13, 14 and 36, and gutters of 20, 24 and 28.
  Excluded from 004 on purpose: spacing is far more load-bearing on layout than
  type (2pt on a gap can wrap a row), the payoff is much less visible, and
  bundling it would make 004's diff unreviewable. Decide after 004 lands.
- **A battery ring on the Home avatar** — the better answer to 008 than deleting
  the gear, since it makes the avatar informative rather than merely a second
  door. Excluded because it's a *data* decision, not a layout one: it needs a
  battery poll on the app's landing screen, which is a call about BLE traffic
  and power. Written up in 008 under "Deliberately not in this plan".
- **Stagger on list entrances.** AUDIT §7 suggests a 30–80ms stagger for group
  entrances. Rejected here: every list in the app is a virtualized `FlatList`,
  where recycled rows would re-run the entry animation on scroll — the stagger
  would fire again and again on rows the user has already seen.
- **Animating the Library sort reorder properly.** Cross-fading the list (done,
  see above) is the 80% version. A true reorder animation inside a virtualized
  list means measuring and tracking every row; disproportionate to the value.
- **Shimmer sweeps on the skeletons** — see 005's Boundaries. A masked gradient
  per block is real per-frame cost for decoration on a near-black ground.

## What was checked and found correct

Recorded so a later audit doesn't re-litigate it:

- `scaleX` progress fills instead of animated `width` (`controls.tsx:243`,
  `MiniPlayer.tsx:36`).
- `scaleY` level-meter bars instead of animated `height` (`controls.tsx:415-427`).
- The whole scrub drag lives on the UI thread — `LiveText` writes a `TextInput`
  through `useAnimatedProps` rather than `setState` (`controls.tsx:159-175`).
- `AlbumArt` holds the cover at zero opacity until `onLoad`, and resets the
  reveal on `uri` change (`AlbumArt.tsx:35-48`).
- The instant tab swap — the removed cross-fade was a remount, and
  `app-tabs.tsx:66-70` documents why it must not come back.
- The keyed `FadeIn` on the Library list (`library/index.tsx:277`): the three
  lists are different content, so the remount is correct there.
- `unstable_pressDelay={55}` on `Pressed`, and asymmetric press timing (timing
  in, spring out).
