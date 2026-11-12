import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppState, Platform, StatusBar as RNStatusBar } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Crypto from 'expo-crypto';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import type { ErrorBoundaryProps } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { checkCommunityActivity } from '@/lib/communityActivity';
import { registerBackgroundTasks } from '@/lib/backgroundTasks';
import { useFonts, SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { setUuidRandomSource } from '@duely/shared';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { getDb } from '@/lib/db/client';
import { getTokens, setSignedOutHandler } from '@/lib/api';
import { useApp } from '@/lib/store';
import { onSynced, startSyncTriggers } from '@/lib/sync/engine';
import { autoSaveCommunityPosts } from '@/lib/communityAutoSave';
import { startDerived } from '@/lib/derived';
import { initNotifications, listenToNotificationResponses } from '@/lib/notifications';
import { DuelyAlarm } from '@/lib/alarms';
import { installCrashLogging, safely } from '@/lib/crash';
import { ErrorScreen } from '@/components/ErrorScreen';
import { CrashNotice } from '@/components/CrashNotice';
import { UpdatePrompt } from '@/components/UpdatePrompt';

installCrashLogging();
void SplashScreen.preventAutoHideAsync();
setUuidRandomSource((bytes) => Crypto.getRandomValues(bytes));



function Inner() {
  const { c, scheme } = useTheme();
  const signedIn = useApp((s) => s.signedIn);

  useEffect(() => {
    if (!signedIn) return;
    safely('initNotifications', initNotifications);
    const stops: (() => void)[] = [];
    safely('communityAutoSave', () =>
      stops.push(
        onSynced(() => {
          void autoSaveCommunityPosts();
          void checkCommunityActivity();
        }),
      ),
    );
    safely('backgroundTasks', () => void registerBackgroundTasks().catch(() => undefined));
    safely('startSyncTriggers', () => stops.push(startSyncTriggers()));
    safely('startDerived', () => stops.push(startDerived()));
    safely('notificationResponses', () => stops.push(listenToNotificationResponses()));
    let alarmSub: { remove(): void } | null = null;
    safely('alarmListener', () => {
      alarmSub = DuelyAlarm.addListener('alarmAction', () => undefined);
    });
    safely('consumePendingActions', () => DuelyAlarm.consumePendingActions());
    return () => {
      stops.forEach((s) => s());
      alarmSub?.remove();
    };
  }, [signedIn]);

  // Light icons on the dark theme. Native screens (react-native-screens) and modal sheets reset the
  // system bar appearance on Android, so set it per screen too and re-apply on resume.
  const barStyle = scheme === 'dark' ? 'light' : 'dark';
  useEffect(() => {
    const apply = () => RNStatusBar.setBarStyle(barStyle === 'light' ? 'light-content' : 'dark-content', false);
    apply();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && apply());
    return () => sub.remove();
  }, [barStyle]);

  return (
    <>
      <StatusBar style={barStyle} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
          animation: 'fade_from_bottom',
          ...(Platform.OS === 'android' ? { statusBarStyle: barStyle } : {}),
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="quick-add" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      </Stack>
      <CrashNotice />
      {signedIn ? <UpdatePrompt /> : null}
    </>
  );
}

/** Shows the error instead of closing the app (preview builds too) so it can be screenshotted. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <ErrorScreen error={error} retry={retry} where="root" />;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ SpaceGrotesk_600SemiBold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  const [dbReady, setDbReady] = useState(false);
  const ready = useApp((s) => s.ready);
  const theme = useApp((s) => s.user?.settings.theme ?? 'system');

  useEffect(() => {
    getDb();
    setDbReady(true);
    setSignedOutHandler(() => useApp.getState().set({ signedIn: false }));
    void getTokens().then((t) => useApp.getState().hydrate(!!t));
  }, []);

  useEffect(() => {
    if (fontsLoaded && dbReady && ready) void SplashScreen.hideAsync();
  }, [fontsLoaded, dbReady, ready]);

  if (!fontsLoaded || !dbReady || !ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider preference={theme}>
              <Inner />
            </ThemeProvider>
          </QueryClientProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
