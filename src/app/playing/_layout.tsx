import { Stack } from 'expo-router';
import { Palette } from '@/constants/theme';

export default function PlayingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Palette.bg },
        animation: 'slide_from_right',
      }}
    >
      {/* No animation on `index`: this whole stack is the content of a modal
          sheet, so the rise-from-the-bottom is the sheet's presentation, not a
          screen transition inside it. */}
      <Stack.Screen name="index" />
      <Stack.Screen name="queue" />
    </Stack>
  );
}
