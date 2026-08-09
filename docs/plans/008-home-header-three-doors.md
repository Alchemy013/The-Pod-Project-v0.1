# 008 — Three doors to one room in the Home header

- **Status**: DONE (applied 2026-08-10; `tsc --noEmit` + `expo export --platform ios` clean, not run on hardware)
- **Commit**: 4f5c7fd
- **Severity**: LOW
- **Category**: Information architecture
- **Estimated scope**: 1 file, ~4 lines. Trivial diff, real finding.

## Problem

The Home header carries four elements, and **two of them navigate to exactly the
same route** — which is also already a tab in the tab bar directly below.

```tsx
/* src/app/(tabs)/home/index.tsx:126-133 — current */
      <View style={[s.header, { paddingTop: insets.top + 4 }]}>
        <Pressed style={s.avatar} onPress={() => router.push('/pod')} scaleTo={0.92}>
          <Text style={s.avatarText}>P</Text>
        </Pressed>
        <Text style={s.greeting}>{greeting()}</Text>
        <IconCircle name="download" label="Transfer music" onPress={() => router.push('/pod/storage')} />
        <IconCircle name="settings" label="Pod settings" onPress={() => router.push('/pod')} />
      </View>
```

`/pod` is reachable from the avatar, from the gear, and from the Pod tab — three
affordances, one destination, all visible simultaneously on the landing screen.

The gear is the one to lose:

- The **tab** is the canonical route to Pod and is always on screen.
- The **avatar** is the conventional top-left "this device / this account"
  affordance and reads as a brand mark; removing its tap would make it dead
  decoration.
- The **gear** duplicates both and is the least discoverable of the three.

`download` → `/pod/storage` **stays**. It is not a duplicate: it is a
*sub*-screen, two taps away otherwise (Pod tab → Storage), and it is the action
a new owner with an empty Pod needs most. Plan 006's empty state routes to the
same place for the same reason.

## Target

```tsx
      <View style={[s.header, { paddingTop: insets.top + 4 }]}>
        <Pressed style={s.avatar} onPress={() => router.push('/pod')} scaleTo={0.92} label="Pod settings">
          <Text style={s.avatarText}>P</Text>
        </Pressed>
        <Text style={s.greeting}>{greeting()}</Text>
        {/* No settings gear: `/pod` is already the avatar *and* a tab. The
            download stays because /pod/storage is a sub-screen — two taps
            otherwise — and it's what an empty Pod needs first. */}
        <IconCircle name="download" label="Transfer music" onPress={() => router.push('/pod/storage')} />
      </View>
```

Note the avatar gains `label="Pod settings"`, inheriting the accessibility label
the gear was carrying. Without it the avatar announces as an unlabelled button
containing the letter "P".

## Repo conventions to follow

- `Pressed` maps its `label` prop to `accessibilityLabel` — see
  `src/components/ui/controls.tsx`. Never pass `accessibilityLabel` directly.
- **Exemplar**: `src/components/MiniPlayer.tsx:60-67`, a `Pressed` with a `label`
  and a tuned `scaleTo`.

## Steps

1. Delete the `settings` `IconCircle` line from `src/app/(tabs)/home/index.tsx`.
2. Add `label="Pod settings"` to the avatar `Pressed`.
3. Add the comment so the next person doesn't "restore" the gear.

## Boundaries

- Do NOT remove the `download` `IconCircle`.
- Do NOT make the avatar non-interactive.
- Do NOT change the Pod tab, `app-tabs.tsx`, or any route.
- Do NOT restyle the header — the remaining three elements keep their existing
  `gap: 12` and flex behaviour.

## Deliberately not in this plan

**Making the avatar carry Pod status** — a battery ring around the `P`, so it
earns its place by being informative rather than merely being a second door.
It's the better design answer and it was considered. It is excluded because it
is a *data* change, not a layout one: `pod.store`'s battery is currently fetched
by the Battery screen, which polls every 20s, so putting a live ring on Home
means introducing a battery poll on the app's landing screen — a decision about
BLE traffic and power, not about a header. Worth doing on its own terms, with
that tradeoff stated, rather than smuggled in behind a tidy-up.

## Verification

- **Mechanical**: `npx tsc --noEmit` → 0. `npx expo export --platform ios` → 0.
  `grep -n "'/pod'" src/app/\(tabs\)/home/index.tsx` → exactly one hit.
- **Feel check**:
  - The Home header reads: `P` mark, greeting, one download button. No gear.
  - Tapping `P` opens the Pod tab.
  - Tapping download opens Pod › Storage directly.
  - With VoiceOver on, the `P` mark announces as "Pod settings, button" — not as
    "P, button".
  - The greeting still takes the free space and truncates rather than pushing
    the download button off the edge (test with a long greeting by temporarily
    returning a longer string from `greeting()`).
- **Done when**: one control in the Home header routes to `/pod`, and it is
  labelled.
