import { Stack } from 'expo-router';
import { Palette } from '@/constants/theme';

export default function LibraryLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Palette.bg },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="album/[id]" />
      <Stack.Screen name="search" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
