import AppTabs from '@/components/app-tabs';

// expo-router/ui sorts a navigator's routes by route-name *length*
// (`sortRoutes.ts`), not by TabList order, so without an anchor the first — and
// therefore the launch — route is `pod`, and the app opens on settings.
export const unstable_settings = { anchor: 'home' };

export default AppTabs;
