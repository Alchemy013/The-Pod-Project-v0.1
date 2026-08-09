import { useEffect } from 'react';
import { Tabs, TabList, TabTrigger, TabSlot } from 'expo-router/ui';
import { usePathname, type Href } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/ui/icons';
import { Motion, Palette, Font, Type } from '@/constants/theme';
import { MiniPlayer } from '@/components/MiniPlayer';

// Search is not a tab: it lives inside Library as a field that filters the list
// you're already looking at, which is one destination instead of two showing
// the same records.
const TABS: { name: string; href: string; label: string; icon: IconName }[] = [
  { name: 'home', href: '/home', label: 'Home', icon: 'tab-home' },
  { name: 'library', href: '/library', label: 'Library', icon: 'tab-library' },
  { name: 'pod', href: '/pod', label: 'Pod', icon: 'tab-pod' },
];

const INACTIVE = '#77777c';

/**
 * Tab glyph that springs as it becomes active. Switching tabs is otherwise an
 * instant swap with nothing acknowledging the touch, which is most of why the
 * app reads as abrupt.
 */
function TabIcon({ icon, label, active }: { icon: IconName; label: string; active: boolean }) {
  const lift = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    lift.value = active
      ? withSpring(1, Motion.spring.tab)
      : withTiming(0, { duration: 160, easing: Easing.out(Easing.quad) });
  }, [active]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + lift.value * 0.12 }, { translateY: -lift.value * 2 }],
  }));

  const color = active ? Palette.accent : INACTIVE;

  return (
    <>
      <Animated.View style={style}>
        <Icon name={icon} size={21} color={color} />
      </Animated.View>
      <Text style={[styles.label, { color, fontFamily: active ? Font.bold : Font.medium }]}>
        {label}
      </Text>
    </>
  );
}

export default function AppTabs() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    // `history`, not the default `firstRoute`: closing Now Playing must return
    // to the tab you opened it from (Library), not to a fixed tab.
    <Tabs style={{ flex: 1 }} options={{ backBehavior: 'history' }}>
      {/* No cross-fade wrapper here. Keying an Animated.View on the active tab
          did fade, but the key change *unmounted the whole tab stack* on every
          switch: lists and their scroll position were rebuilt from scratch and
          mount effects re-ran, so the fade played over a blocked JS thread.
          That was most of the app's stutter. An instant swap is what iOS does
          anyway — the tab glyph spring is the acknowledgement. */}
      <TabSlot />

      {/* Not conditioned on the route any more: Now Playing is a sheet over
          this navigator, so the bar simply sits underneath it. Unmounting the
          bar was a layout pass on the card the sheet scales back. */}
      <MiniPlayer />
      <LinearGradient
        colors={['rgba(10,10,10,0.5)', 'rgba(10,10,10,0.97)']}
        locations={[0, 0.42]}
        style={[styles.bar, { paddingBottom: insets.bottom }]}
      >
        {TABS.map((tab) => (
          <TabTrigger key={tab.name} name={tab.name} style={styles.cell}>
            <TabIcon icon={tab.icon} label={tab.label} active={pathname.startsWith(tab.href)} />
          </TabTrigger>
        ))}
      </LinearGradient>

      <TabList style={{ display: 'none' }}>
        {TABS.map((route) => (
          <TabTrigger key={route.name} name={route.name} href={route.href as Href} />
        ))}
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // Reserve the home-indicator strip: without this the labels sit under it and
  // the indicator line draws through the tab bar.
  bar: { flexDirection: 'row', paddingTop: 11, backgroundColor: Palette.bg },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingBottom: 8 },
  label: { fontSize: Type.micro },
});
