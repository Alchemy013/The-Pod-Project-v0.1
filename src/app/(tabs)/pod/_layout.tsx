import { Stack } from 'expo-router';
import { Palette, Font, Type } from '@/constants/theme';

export default function PodLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Palette.bg },
        headerTintColor: Palette.accent,
        headerTitleStyle: { color: Palette.text, fontFamily: Font.bold, fontSize: Type.headline },
        headerShadowVisible: false,
        // The Pod landing screen has headerShown:false and therefore no title,
        // so the back button fell back to printing the route name — "index".
        // 'minimal' is the native-stack way to say chevron only, no label.
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: Palette.bg },
      }}
    >
      {/* The Pod landing screen draws its own washed header. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="network" options={{ title: 'Wi-Fi' }} />
      <Stack.Screen name="equalizer" options={{ title: 'Equaliser' }} />
      <Stack.Screen name="storage" options={{ title: 'Transfer' }} />
      <Stack.Screen name="battery" options={{ title: 'Battery' }} />
      <Stack.Screen name="about" options={{ title: 'About' }} />
    </Stack>
  );
}
