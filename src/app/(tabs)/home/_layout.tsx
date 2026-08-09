import { Stack } from 'expo-router';
import { Palette } from '@/constants/theme';

export default function HomeLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Palette.bg },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="history" />
    </Stack>
  );
}
