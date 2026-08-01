import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Palette } from '@/constants/theme';

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={Palette.bg}
      indicatorColor={Palette.text}
      labelStyle={{ selected: { color: Palette.text }, default: { color: Palette.textSecondary } }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="music.note.list" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="now-playing">
        <NativeTabs.Trigger.Label>Now Playing</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="waveform" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="pod">
        <NativeTabs.Trigger.Label>Pod</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="antenna.radiowaves.left.and.right" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
