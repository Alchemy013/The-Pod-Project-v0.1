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
      {/* Home opens albums in its *own* stack. Pushing to /library/album/<id>
          left the Library tab sitting on that album. */}
      <Stack.Screen name="album/[id]" />
    </Stack>
  );
}
