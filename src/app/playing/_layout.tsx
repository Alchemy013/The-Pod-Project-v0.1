import { Stack } from 'expo-router';
import { Palette } from '@/constants/theme';

export default function PlayingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Palette.bg },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="queue" />
    </Stack>
  );
}
