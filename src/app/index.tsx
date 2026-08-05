import { Redirect } from 'expo-router';

// The initial URL is "/", and the redesign moved the old src/app/index.tsx to
// src/app/library/index.tsx — leaving nothing to match "/". Expo Router then
// resolves no route, never mounts the root layout, and the app renders blank
// with no error. This is the entry point that sends "/" at the Library tab.
export default function Index() {
  return <Redirect href="/library" />;
}
