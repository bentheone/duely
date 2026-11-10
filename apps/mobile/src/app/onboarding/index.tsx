import React, { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import { statusCodes } from '@react-native-google-signin/google-signin';
import { Gap, PillButton, Screen, T } from '@/components/ui';
import { signInWithGoogle } from '@/lib/auth';
import { syncNow } from '@/lib/sync/engine';
import { snapshot } from '@/lib/db/queries';
import { useApp } from '@/lib/store';
import { AnimatedLogo } from '@/components/AnimatedLogo';
import { useTheme } from '@/lib/theme';

/** One question per screen (§11.3 onboarding): Sign in with Google. */
export default function Welcome() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intro, setIntro] = useState(false);
  const { scheme } = useTheme();
  const { width } = useWindowDimensions();

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const auth = await signInWithGoogle();
      if (!auth) return;
      await syncNow();
      const returning = auth.google.calendarsConfigured && snapshot().courses.length > 0;
      if (returning) {
        useApp.getState().setOnboarded(true);
        router.replace('/today');
      } else {
        router.replace('/onboarding/calendars');
      }
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== statusCodes.SIGN_IN_CANCELLED) setError((e as Error).message || 'Sign-in failed. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      scroll={false}
      footer={
        intro ? (
          <Animated.View entering={FadeInDown.duration(420)}>
            <PillButton title="Sign in with Google" onPress={go} loading={busy} />
          </Animated.View>
        ) : (
          <View style={{ height: 56 }} />
        )
      }
    >
      <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 80 }}>
        <AnimatedLogo width={Math.min(width - 56, 240)} dark={scheme === 'dark'} onDone={() => setIntro(true)} />
        <Gap h={20} />
        {intro ? (
          <Animated.View entering={FadeIn.duration(500)}>
            <T v="body" tone="muted" style={{ fontSize: 17, lineHeight: 25 }}>
              Every assignment, class and exam — on time.
            </T>
          </Animated.View>
        ) : (
          <View style={{ height: 25 }} />
        )}
        {error ? (
          <>
            <Gap h={24} />
            <T tone="danger">{error}</T>
          </>
        ) : null}
      </View>
    </Screen>
  );
}
