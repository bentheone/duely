import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@/lib/theme';

export default function OnboardingLayout() {
  const { c, scheme } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.bg },
        animation: 'slide_from_right',
        ...(Platform.OS === 'android' ? { statusBarStyle: scheme === 'dark' ? 'light' : 'dark' } : {}),
      }}
    />
  );
}
