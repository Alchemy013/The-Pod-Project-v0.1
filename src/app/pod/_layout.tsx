import { Stack } from 'expo-router';
import { Palette } from '@/constants/theme';

export default function PodLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Palette.bg },
        headerTintColor: Palette.text,
        headerTitleStyle: { color: Palette.text },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: Palette.bg },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Pod',
          headerLargeTitleEnabled: true,
          headerLargeTitleStyle: { color: Palette.text },
        }}
      />
      <Stack.Screen name="network" options={{ title: 'Wi-Fi Network' }} />
      <Stack.Screen name="equalizer" options={{ title: 'Equalizer' }} />
      <Stack.Screen name="storage" options={{ title: 'Storage & Music' }} />
      <Stack.Screen name="battery" options={{ title: 'Battery' }} />
      <Stack.Screen name="about" options={{ title: 'About' }} />
    </Stack>
  );
}
