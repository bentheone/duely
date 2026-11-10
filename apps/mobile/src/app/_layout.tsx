import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Crypto from 'expo-crypto';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import type { ErrorBoundaryProps } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts, SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { setUuidRandomSource } from '@duely/shared';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { getDb } from '@/lib/db/client';
import { getTokens, setSignedOutHandler } from '@/lib/api';
import { useApp } from '@/lib/store';
import { startSyncTriggers } from '@/lib/sync/engine';
import { startDerived } from '@/lib/derived';
import { initNotifications, listenToNotificationResponses } from '@/lib/notifications';
import { DuelyAlarm } from '@/lib/alarms';
import { installCrashLogging, safely } from '@/lib/crash';
import { ErrorScreen } from '@/components/ErrorScreen';
import { CrashNotice } from '@/components/CrashNotice';

installCrashLogging();
void SplashScreen.preventAutoHideAsync();
setUuidRandomSource((bytes) => Crypto.getRandomValues(bytes));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 60_000 } } });

function Inner() {
  const { c, scheme } = useTheme();
  const signedIn = useApp((s) => s.signedIn);

  useEffect(() => {
    if (!signedIn) return;
    safely('initNotifications', initNotifications);
    const stops: (() => void)[] = [];
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

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'fade_from_bottom' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="quick-add" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      </Stack>
      <CrashNotice />
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
