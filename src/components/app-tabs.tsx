import { Tabs, TabList, TabTrigger, TabSlot } from 'expo-router/ui';
import { usePathname, type Href } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/ui/icons';
import { Palette, Font } from '@/constants/theme';
import { MiniPlayer } from '@/components/MiniPlayer';

const TABS: { name: string; href: string; label: string; icon: IconName }[] = [
  { name: 'library', href: '/library', label: 'Library', icon: 'tab-library' },
  { name: 'playing', href: '/playing', label: 'Playing', icon: 'tab-playing' },
  { name: 'history', href: '/history', label: 'History', icon: 'tab-history' },
  { name: 'pod', href: '/pod', label: 'Pod', icon: 'tab-pod' },
];

export default function AppTabs() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const hideMiniPlayer = pathname.startsWith('/playing');

  return (
    <Tabs style={{ flex: 1 }}>
      <TabSlot />
      {!hideMiniPlayer && <MiniPlayer />}

      {/* Reserve the home-indicator strip: without this the labels sit under
          it and the indicator line draws through the tab bar. */}
      <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          const color = active ? Palette.accent : Palette.borderFaint;
          return (
            <TabTrigger
              key={tab.name}
              name={tab.name}
              style={[styles.cell, { borderTopColor: active ? Palette.accent : Palette.divider }]}
            >
              <Icon name={tab.icon} size={20} color={color} />
              <Text style={[styles.label, { color }]}>{tab.label}</Text>
            </TabTrigger>
          );
        })}
      </View>

      <TabList style={{ display: 'none' }}>
        {TABS.map((tab) => (
          <TabTrigger key={tab.name} name={tab.name} href={tab.href as Href} />
        ))}
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: Palette.bg },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingTop: 10,
    paddingBottom: 8,
    borderTopWidth: 2,
  },
  label: {
    fontFamily: Font.heading,
    fontSize: 9,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
});
