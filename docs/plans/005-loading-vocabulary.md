# 005 — Replace the centred spinners with skeletons of the thing that's loading

- **Status**: DONE (applied 2026-08-10; `tsc --noEmit` + `expo export --platform ios` clean, self-checks pass; NOT run on hardware)
- **Commit**: 4f5c7fd
- **Severity**: HIGH
- **Category**: Missed opportunities / Cohesion
- **Estimated scope**: 1 new component, 3 screens. ~150 lines.

## Problem

The app's entire loading vocabulary is `ActivityIndicator`. Every occurrence:

```tsx
/* src/app/(tabs)/library/index.tsx:164-171 — current */
  if (isLoading && songs.length === 0) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={Palette.textSecondary} size="large" />
        <Text style={s.centerText}>Loading the library from the Pod…</Text>
      </View>
    );
  }
```
```tsx
/* src/app/(tabs)/pod/battery.tsx:30 — current */
        <ActivityIndicator color={Palette.textSecondary} size="large" />
```
```tsx
/* src/app/(tabs)/pod/network.tsx:145 — current */
          <ActivityIndicator color={Palette.textSecondary} size="large" />
```

Three problems, in increasing order of importance.

**1. It violates the repo's own rule.** `docs/PROJECT_STATUS.md` § "Code quality
rules" says, verbatim: *"No Android-looking components."* A large spinner
centred on an otherwise empty screen is the canonical Android loading pattern.
iOS shows the *shape of the content* that is arriving.

**2. It throws away the layout.** The app knows exactly what is coming — a list
of rows with a 48pt square, two lines of text and a trailing duration; or a feed
of 142pt shelf cards. Rendering that shape greyed-out means the screen does not
reflow when data lands. The spinner guarantees a full re-layout at the worst
possible moment.

**3. On the path where it matters most, it is the *whole screen* for up to 30
seconds.** `library.store` persists to `thepod_library` and hydrates from disk,
so a warm launch skips this entirely — which means this state is almost
exclusively seen on the **first launch after pairing a Pod**, over a BLE link
that chunks the whole library at ~430 bytes a notify, against a **30 second**
`GET_LIBRARY` timeout. The first thing a new owner sees is a spinner on a black
screen, for possibly half a minute.

The Home feed has the same gap in a quieter form — `home/index.tsx:147-151`
renders the header and wash, then a single centred sentence where four shelves
will be, then everything pops in at once.

## Target

A `Skeleton` primitive plus two composed shapes, all in
`src/components/ui/controls.tsx` alongside the rest of the kit.

### The primitive

```tsx
/**
 * A placeholder block that breathes, for content whose shape we know before its
 * data arrives. Deliberately low-contrast: a skeleton that pulses hard reads as
 * a broken image, and on a near-black ground (#0A0A0A) a very small opacity
 * range is plenty.
 *
 * This is the app's only loading affordance. There is no spinner — the rule is
 * "show the shape of what's coming", because the layout is always known.
 */
export function Skeleton({ width, height, radius = Radius.sm, style }: {
  width: number | `${number}%`;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    p.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true,
    );
  }, [reduced]);

  const animated = useAnimatedStyle(() => ({ opacity: 0.05 + p.value * 0.05 }));

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: Palette.text }, animated, style]}
    />
  );
}
```

Note the reduced-motion branch: under Reduce Motion the block holds at the
`useSharedValue(0)` starting opacity (`0.05`) and simply doesn't breathe. It
must still be **visible**, because it is carrying the "something is coming"
message on its own once the animation is gone. This mirrors how `PlayingBars`
and `Pulse` were handled in plan 003 — see that plan for why a disabled
`withRepeat` cannot be left to strand mid-travel.

### The two composed shapes

```tsx
/** The shape of a track/album row, for a list that hasn't arrived yet. */
export function SkeletonRow({ art = 48 }: { art?: number }) {
  return (
    <View style={s.skelRow}>
      <Skeleton width={art} height={art} radius={Radius.sm} />
      <View style={{ flex: 1, gap: 7 }}>
        <Skeleton width="62%" height={13} radius={Radius.xs} />
        <Skeleton width="40%" height={11} radius={Radius.xs} />
      </View>
      <Skeleton width={26} height={11} radius={Radius.xs} />
    </View>
  );
}

/** The shape of a Home shelf card. */
export function SkeletonCard({ size = 142 }: { size?: number }) {
  return (
    <View style={{ width: size, gap: 8 }}>
      <Skeleton width={size} height={size} radius={Radius.md} />
      <Skeleton width={size * 0.8} height={12} radius={Radius.xs} />
      <Skeleton width={size * 0.5} height={11} radius={Radius.xs} />
    </View>
  );
}
```

with

```tsx
  skelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
```

### Where they go

**Library** (`src/app/(tabs)/library/index.tsx:164-171`) — replace the centred
spinner block with eight skeleton rows under the real header, so the chips,
title and search field stay put and only the list region fills in:

```tsx
  if (isLoading && songs.length === 0) {
    return (
      <View style={[s.container, { paddingTop: insets.top + 2 }]}>
        {/* header / field / chips exactly as in the loaded branch */}
        <View style={s.list}>
          {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
        </View>
      </View>
    );
  }
```

**Home** (`src/app/(tabs)/home/index.tsx:147-151`) — while `isLoading` and there
are no albums, render one shelf of `SkeletonCard`s under a real `SectionTitle`
rather than a sentence.

**Pod › Battery** (`src/app/(tabs)/pod/battery.tsx:30`) — the readout is a big
number plus rows; use one `Skeleton width={140} height={40}` where the
percentage goes and `SkeletonRow`s for the rows beneath.

**Pod › Network** (`src/app/(tabs)/pod/network.tsx:145`) — this one is the
**exception: keep the spinner.** A Wi-Fi scan has no known result shape (0 to 30
networks, unknown names), and it is a user-initiated action with a button that
just entered a busy state. A skeleton would promise rows that may never exist.
Leave it, and record why in a comment so a later sweep doesn't "finish the job".

## Repo conventions to follow

- Primitives live in `src/components/ui/controls.tsx` and are exported from
  there; screens import from `@/components/ui/controls`. Don't create a new file.
- Every animated component in this repo that loops must branch on
  `useReducedMotion()` — see `Pulse` and `Bar` in `controls.tsx`, and plan 003.
- Animate `opacity`/`transform` only. A skeleton must never animate `width`.
- **Exemplar to imitate**: `Bar` in `src/components/ui/controls.tsx` — a small
  looping component with a reduced-motion early return and a comment saying what
  it holds at when the loop is off.

## Steps

1. Add `Skeleton`, `SkeletonRow` and `SkeletonCard` to
   `src/components/ui/controls.tsx`, with the `skelRow` style. `Radius`,
   `Palette`, `useReducedMotion`, `withRepeat`, `Easing` are all already
   imported in that file.
2. `src/app/(tabs)/library/index.tsx` — replace the loading branch. The header,
   search field and chip row must render identically to the loaded state; only
   the list area becomes skeletons. This is the point of the change.
3. `src/app/(tabs)/home/index.tsx` — replace the `isLoading` half of the
   `albums.length === 0` message with a skeleton shelf. Keep the *empty* half
   (`'Nothing on the Pod yet…'`) as text — see plan 006, which owns it.
4. `src/app/(tabs)/pod/battery.tsx` — replace the spinner.
5. `src/app/(tabs)/pod/network.tsx` — leave the spinner, add the comment.
6. Remove now-unused `ActivityIndicator` imports from any file that no longer
   uses one. `BluetoothSheet.tsx` still uses two inline ones (rows and the scan
   header) — those are correct and stay.

## Boundaries

- Do NOT add a skeleton to `PairingScreen`. It already has `Pulse` plus explicit
  copy ("Connecting to ThePod…"), which is the right affordance for a state with
  no content shape at all.
- Do NOT touch the pull-to-refresh path. `library/index.tsx` deliberately keeps
  the populated list and spins only the `RefreshControl`; that is already right,
  and the comment at `:160-161` says so.
- Do NOT animate anything but `opacity` in the skeleton.
- Do NOT add a shimmer/gradient sweep. It needs a masked gradient per block, and
  on a list of eight rows that is real per-frame cost for decoration. A slow
  opacity breath reads as "loading" perfectly well on a black ground.
- Do NOT add dependencies.

## Verification

- **Mechanical**: `npx tsc --noEmit` → 0. `npx expo export --platform ios` → 0.
  `grep -rn 'size="large"' src/` → only `pod/network.tsx`.
- **Feel check** — the honest way to see this is a cold first-run, which is also
  the hardest to stage. To force it without re-pairing: **Pod › About › Reset
  app**, which sweeps every `thepod_*` key including `thepod_library`, then
  pair again. Confirm:
  - Library shows its real header, search field and chips immediately, with
    eight breathing rows below — the header must **not** move when the data
    lands.
  - The breath is subtle. Stand back from the phone: it should read as "pending",
    not as a strobing list.
  - Home shows a skeleton shelf, and when albums arrive the shelf title stays
    put.
  - Battery shows a block where the percentage goes, not a spinner.
  - Wi-Fi scan still shows a spinner (this is correct).
  - Enable Reduce Motion, relaunch, repeat: the skeletons must still be
    **visible and static** — not invisible, not mid-fade.
- **Done when**: no full-screen `ActivityIndicator` remains outside the Wi-Fi
  scan, and no screen's header or chrome moves at the moment its data arrives.
