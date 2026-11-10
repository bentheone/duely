import React, { useContext, useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { recordCrash } from '@/lib/crash';
import { useTheme } from '@/lib/theme';
import { Gap, PillButton, SmallButton, T } from './ui';

/** Route error boundary UI: shows the error instead of the app closing (expo-router `ErrorBoundary`). */
export function ErrorScreen({ error, retry, where }: { error: Error; retry: () => Promise<void>; where: string }) {
  const { c } = useTheme();
  // Root boundary renders outside SafeAreaProvider, so read the context with a fallback.
  const insets = useContext(SafeAreaInsetsContext) ?? { top: 24, bottom: 0, left: 0, right: 0 };
  useEffect(() => {
    recordCrash(where, error);
  }, [error, where]);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 48, paddingHorizontal: 28, paddingBottom: insets.bottom + 24 }}>
      <T v="title">Something went wrong</T>
      <Gap h={12} />
      <T tone="muted">Your data is safe on this phone.</T>
      <Gap h={20} />
      <ScrollView style={{ flex: 1 }}>
        <T v="small" tone="faint" selectable>
          {error.message}
          {'\n\n'}
          {error.stack?.split('\n').slice(0, 8).join('\n')}
        </T>
      </ScrollView>
      <Gap h={16} />
      <PillButton title="Try again" onPress={() => void retry()} />
      <Gap h={8} />
      <SmallButton title="Go to Today" onPress={() => router.replace('/')} />
    </View>
  );
}
