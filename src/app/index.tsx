import { Redirect } from 'expo-router';

// The initial URL is "/", and no screen file matches it — Expo Router would
// resolve nothing, never mount the root layout, and render a blank app with no
// error anywhere. src/app must always have an index route; this one points "/"
// at the Home tab.
export default function Index() {
  return <Redirect href="/home" />;
}
