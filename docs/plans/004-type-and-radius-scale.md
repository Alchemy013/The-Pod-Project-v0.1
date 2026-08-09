# 004 — Give the app a type scale, and make the radius scale mean something

- **Status**: DONE (applied 2026-08-10; `tsc --noEmit` + `expo export --platform ios` clean, self-checks pass; NOT run on hardware)
- **Commit**: 4f5c7fd
- **Severity**: HIGH
- **Category**: Cohesion & tokens
- **Estimated scope**: `theme.ts` + ~20 stylesheet files. Large but mechanical.
- ⚠️ **This changes how the app looks.** It is not a pure refactor — see
  "Honest warning" below before starting.

## Problem

`src/constants/theme.ts` defines `Palette`, `Radius`, `Font` and (as of
plan 005's sibling work) `Motion`. It does **not** define a type scale, and the
`Radius` scale it does define is bypassed almost everywhere.

### 24 distinct font sizes, including six half-point steps

Measured across `src/`:

```
$ grep -rhoE "fontSize: [0-9.]+" src/ | sort -u | wc -l
24
```

Full distribution, by frequency:

| Size | Uses | | Size | Uses |
| --- | --- | --- | --- | --- |
| 15 | 18 | | 19 | 3 |
| 12 | 16 | | 29 | 2 |
| 14 | 15 | | 17 | 2 |
| 13 | 12 | | 16 | 2 |
| **14.5** | 8 | | **10.5** | 2 |
| **12.5** | 7 | | **9.5** | 1 |
| 11 | 6 | | 74 | 1 |
| 20 | 5 | | 28 | 1 |
| 18 | 5 | | 26 | 1 |
| **11.5** | 5 | | 25 | 1 |
| **13.5** | 4 | | 10 | 1 |
| 40 | 3 | | 22 | 3 |

The half-point sizes are the tell. `14` and `14.5` both exist, in quantity, and
nothing in the codebase says which to reach for. `13`, `13.5`, `12.5` and `12`
are four different sizes doing one job — secondary row text. A designer would
call that four decisions where there should be one; in practice it means every
new screen re-picks sizes by eye against whatever screen it was copied from, and
the drift compounds.

There is no `Type` export to reach for, so this is not carelessness — the
vocabulary does not exist.

### The `Radius` scale is defined and then ignored

`theme.ts:37-45` defines six radii (`xs 5 · sm 7 · md 10 · lg 12 · card 16 ·
pill 999`). It is referenced in 15 places. Meanwhile there are **17 distinct
hardcoded `borderRadius` literals**:

```
$ grep -rhoE "borderRadius: [0-9]+" src/ | sort -u
borderRadius: 1  2  3  4  5  6  8  9  10  16  17  20  23  24  26  30  50
```

Three of those (`5`, `10`, `16`) are the token values, hand-typed. Others (`8`,
`9`, `20`, `23`, `26`, `30`) are near-misses that no rule produced.

**Crucial nuance the executor must not get wrong:** many of these are *circles*,
where the radius is deliberately half the element's size — `Pressed`-wrapped
avatars, `IconCircle`, `Fab`, the `Pulse` ring, the artist initial mark. Those
are **correct** and must not be forced onto the scale. Only rounded *rectangles*
are in scope.

## Target

### 1. A nine-step type scale in `theme.ts`

Derived from the existing usage, so most of the app lands on its nearest current
size. Add to `src/constants/theme.ts`, after `Radius`:

```tsx
/**
 * The type scale. Nine steps, replacing the 24 hand-picked sizes (six of them
 * half-point) that the app grew before this existed.
 *
 * Pick by **role**, not by how big it looks next to the thing above it — that
 * habit is what produced `14` and `14.5` doing the same job in different files.
 * If a new screen seems to need a step that isn't here, it almost certainly
 * wants an existing step in a different weight (`Font.medium` vs `Font.bold`)
 * or colour (`Palette.textSecondary`), not a new size.
 */
export const Type = {
  /** Big numeric readouts only — battery percentage, the About mark. */
  display: 40,
  /** A screen's hero title: album name, now-playing track, onboarding panel. */
  title1: 28,
  /** A screen's own title: "Your Library", the Home greeting. */
  title2: 22,
  /** Section headings inside a screen — the feed's shelf titles. */
  title3: 19,
  /** Row titles and anything that needs to read as the primary line. */
  headline: 15,
  /** Body copy and settings-row labels. */
  body: 14,
  /** The second line of a row; secondary controls. */
  callout: 13,
  /** Sub-text, durations, metadata. */
  caption: 12,
  /** Overlines, badges, spec readouts. The floor — nothing smaller. */
  micro: 11,
} as const;
```

### 2. Mapping table — every current size to its step

Apply this exactly. Where a size maps to a *different* number, that is
intentional; see the honest warning.

| Current | → | Token | Note |
| --- | --- | --- | --- |
| 74 | | *(leave as a literal)* | Onboarding's `P` mark — a graphic, not text |
| 40 | → | `Type.display` | unchanged |
| 29 | → | `Type.title1` | **28**, −1 |
| 28 | → | `Type.title1` | unchanged |
| 26 | → | `Type.title1` | **28**, +2 |
| 25 | → | `Type.title1` | **28**, +3 |
| 22 | → | `Type.title2` | unchanged |
| 20 | → | `Type.title3` | **19**, −1 |
| 19 | → | `Type.title3` | unchanged |
| 18 | → | `Type.title3` | **19**, +1 |
| 17 | → | `Type.headline` | **15**, −2 |
| 16 | → | `Type.headline` | **15**, −1 |
| 15 | → | `Type.headline` | unchanged |
| 14.5 | → | `Type.body` | **14**, −0.5 |
| 14 | → | `Type.body` | unchanged |
| 13.5 | → | `Type.callout` | **13**, −0.5 |
| 13 | → | `Type.callout` | unchanged |
| 12.5 | → | `Type.caption` | **12**, −0.5 |
| 12 | → | `Type.caption` | unchanged |
| 11.5 | → | `Type.micro` | **11**, −0.5 |
| 11 | → | `Type.micro` | unchanged |
| 10.5 | → | `Type.micro` | **11**, +0.5 |
| 10 | → | `Type.micro` | **11**, +1 |
| 9.5 | → | `Type.micro` | **11**, +1.5 |

Two exceptions to apply by hand, because they are art rather than type:

- `src/components/Onboarding.tsx` `markLetter` (74) — leave the literal.
- `src/app/playing/index.tsx` `lyricLine` (18) / `lyricLineActive` (20) — these
  are a *pair* whose whole job is that the active line is bigger than the rest.
  Collapsing both to `title3` would erase the distinction. Use
  `Type.headline` (15) for `lyricLine` and `Type.title3` (19) for
  `lyricLineActive`, and check the result against `LINE_H = 52`.

### 3. Radius: rectangles onto the scale, circles left alone

Convert only where the shape is a **rounded rectangle**:

| Literal | → | Token |
| --- | --- | --- |
| 4, 5, 6 | → | `Radius.xs` (5) |
| 8, 9 | → | `Radius.sm` (7) |
| 10 | → | `Radius.md` (10) |
| 16 | → | `Radius.card` (16) |
| 20, 23, 24, 26, 30 | → | `Radius.pill` (999) *only if the element is a pill* — i.e. its radius is ≥ half its height. Otherwise `Radius.card`. |

**Do NOT convert**, these are circles and their radius must stay tied to the
element's size:

- any `borderRadius: <expr> / 2` (4 sites)
- `borderRadius: 17` on the 34pt avatars (`home/index.tsx:162`,
  `library/index.tsx`) — that is `34 / 2`. Rewrite it as `17` → leave as is, or
  better, express it as half the width so the relationship is visible.
- `borderRadius: 50` and `borderRadius: 30` where the element is a circle or the
  Onboarding mark (a squircle at 126pt — leave it).
- `borderRadius: 1, 2, 3` — these are the scrubber track, the level-meter bars
  and the pager dots, where the radius is half a 2–6pt height. Leave them.

When unsure whether something is a pill or a card, measure: **radius ≥ height/2
means pill.**

## Repo conventions to follow

- Tokens live in `src/constants/theme.ts` as `as const` objects with a doc
  comment explaining how to choose between the values — see `Motion` in that
  file for the house style (it explains the *rule for picking*, not just the
  values).
- Every screen imports from `@/constants/theme`; add `Type` to the existing
  import line, never a second import statement.
- **Exemplar to imitate**: `src/components/ui/controls.tsx` — a file that
  already consumes `Palette`, `Radius`, `Font` and `Motion` from one import and
  hardcodes nothing.

## Steps

1. Add the `Type` export to `src/constants/theme.ts` exactly as written above.
2. Work through the files below **one at a time**, converting `fontSize`
   literals per the mapping table. After each file, re-read its `StyleSheet` and
   sanity-check that no two styles that were different sizes have collapsed into
   the same size *and* the same weight and colour — if they have, the hierarchy
   they encoded is gone, and the fix is a weight change (`Font.medium` →
   `Font.bold`), not a new size. Files, in ascending order of risk:
   - `src/components/ui/` — `NavRow`, `SectionHeader`, `Sheet`, `Card`, `Row`,
     `AlbumArt`, `controls`
   - `src/components/` — `MiniPlayer`, `app-tabs`, `PairingScreen`,
     `Onboarding`, `ErrorBoundary`, `bluetooth/BluetoothSheet`
   - `src/app/(tabs)/pod/` — `index`, `about`, `battery`, `storage`, `network`,
     `equalizer`
   - `src/app/(tabs)/library/` — `index`, `album/[id]`
   - `src/app/(tabs)/home/` — `index`, `history`
   - `src/app/playing/` — `index`, `queue`
3. Sweep `borderRadius` literals per the radius rules. Circles first — identify
   and *skip* them before converting anything.
4. Re-run the measurement and confirm the numbers moved:
   ```
   grep -rhoE "fontSize: [0-9.]+" src/ | sort -u
   ```
   Expect only `74` (the Onboarding mark) to remain as a literal.

## Boundaries

- Do NOT change `lineHeight` values in this pass. They are tuned against the old
  sizes and re-tuning them is a second, separate judgement — note any that now
  look wrong and leave them for a follow-up.
- Do NOT change weights, colours, spacing, or layout. Size and radius only.
- Do NOT introduce a spacing scale. It is deliberately out of scope — see
  "Deliberately not in this plan".
- Do NOT convert circular radii. Re-read the rules above if in any doubt.
- Do NOT add dependencies.
- If a file's sizes don't appear in the mapping table, STOP and report rather
  than inventing a step.

## Honest warning

**This plan changes the rendered appearance of the app.** Twelve of the 24 sizes
move, some by up to 3pt (`25 → 28` on the Now Playing title, `17 → 15`). That is
the entire point of adopting a scale — the sizes that move are the ones that
were never chosen deliberately — but it means:

- This cannot be reviewed by reading the diff alone. It needs eyes on a device.
- Row heights will shift slightly. Anything with a hardcoded height that was
  sized around its text (`NavRow`'s `minHeight: 48`, `s.tb`'s 48×48, the
  `trailing` box's `width: 42`) should be re-checked for clipping.
- If a specific change looks wrong on screen, the answer is **not** to
  reintroduce the literal. It is either to pick a different step, or — if the
  scale genuinely can't express it — to change the scale in `theme.ts` so every
  other user of that step moves with it.

## Deviations found during execution

> Added 2026-08-10, after applying the plan.

**`src/components/ErrorBoundary.tsx` is exempt, and the plan should have said
so.** The sweep converted its two sizes (20 → `title3`, 14 → `body`), which
would have given it an `@/constants/theme` import. That file deliberately
hardcodes everything — `#0A0A0A`, `#ec3013`, `'Menlo'` — because it is the
screen that has to render *after* something else has already failed, so it takes
no dependency it doesn't strictly need. Reverted, with a comment in the file
saying not to tidy it.

**The radius conversion was far smaller than the literal count suggested.** Of
the 17 distinct literals, only **eight sites** were genuine rounded rectangles:

| Site | Was | Now |
| --- | --- | --- |
| `pod/battery.tsx` cell shell | 10 | `Radius.md` |
| `pod/storage.tsx` `rowIcon` | 8 | `Radius.sm` |
| `home/index.tsx` `quick` tile | 8 | `Radius.sm` |
| `library/index.tsx` chip field | 10 | `Radius.md` |
| `Onboarding.tsx` `cta` | 30 | `Radius.pill` |
| `pod/network.tsx` ×2 buttons | 26 | `Radius.pill` |
| `controls.tsx` `pill` | 26 | `Radius.pill` |
| `controls.tsx` `chip` | 17 | `Radius.pill` |

Everything else was a circle or a capsule whose radius is half its own height —
status dots, rings, avatars, the artist mark, progress bars, the EQ track, the
scrubber, the pager dot. Forcing those onto the scale would have visibly broken
them. **The raw literal count badly overstates this finding**; a future audit
should measure "radius vs height" rather than counting distinct values.

## Deliberately not in this plan

**A spacing scale.** The same measurement finds gaps of 2, 3, 5, 6, 8, 9, 10,
11, 12, 13, 14 and 36, and horizontal padding of 20, 24 and 28 — so the raw
count of violations looks similar to type. It is excluded on purpose: spacing
values are far more load-bearing on layout than font sizes (a 2pt change to a
gap can wrap a row or break a grid), the payoff is much less visible than type
cohesion, and combining both would produce a diff nobody can review. Do type and
radius, live with it, and only then decide whether spacing is worth a pass.

## Verification

- **Mechanical**:
  - `npx tsc --noEmit` → exit 0.
  - `npx expo export --platform ios` → exit 0.
  - `grep -rhoE "fontSize: [0-9.]+" src/ | sort -u` → only `fontSize: 74`.
  - `grep -rn "fontSize: Type\." src/ | wc -l` → should be ~120.
- **Eye check** (required — this plan cannot be signed off from the diff):
  - **Now Playing**: the track title (25 → 28) must still fit on one line for a
    long title, and must not collide with the lyrics toggle to its right.
  - **Album screen**: the album title (26 → 28) against its 30pt `lineHeight` —
    watch for clipped descenders.
  - **Pod settings rows**: labels 14.5 → 14 and values 14.5 → 14, inside
    `minHeight: 48`. The mono values (`24/192`, IP addresses) must not wrap.
  - **The tab bar**: labels 10.5 → 11 — check they still fit three across
    without truncating on the narrowest supported device.
  - **Now Playing spec badges**: 11 → 11, unchanged, but they sit next to text
    that moved — confirm the row still centres.
  - **Onboarding**: the `P` mark must be untouched at 74.
  - Scroll the Library with a few hundred tracks and confirm no row clips.
- **Done when**: the app renders with no clipped or wrapped text anywhere in the
  checks above, the only `fontSize` literal left is the Onboarding mark, and
  every `borderRadius` that is not `x / 2` comes from `Radius`.
