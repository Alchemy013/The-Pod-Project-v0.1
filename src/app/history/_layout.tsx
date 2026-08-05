import { Stack } from 'expo-router';
import { Palette } from '@/constants/theme';

export default function HistoryLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Palette.bg },
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
