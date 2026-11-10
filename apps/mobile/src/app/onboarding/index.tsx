import React, { useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import { Gap, PillButton, Screen, T } from '@/components/ui';
import { signInWithGoogle } from '@/lib/auth';
import { syncNow } from '@/lib/sync/engine';
import { snapshot } from '@/lib/db/queries';
import { useApp } from '@/lib/store';
import { AnimatedLogo } from '@/components/AnimatedLogo';
import { useTheme } from '@/lib/theme';
import { RequestAccessSheet } from '@/features/RequestAccess';
import { classifySignInError } from '@/features/signInErrors';

/** One question per screen (§11.3 onboarding): Sign in with Google. */
export default function Welcome() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intro, setIntro] = useState(false);
  // Shown after any failed/cancelled attempt: non-testers often just see Google's "Access blocked" page.
  const [tried, setTried] = useState(false);
  const [ask, setAsk] = useState<{ open: boolean; reason?: string | null }>({ open: false });
  const { scheme } = useTheme();
  const { width } = useWindowDimensions();

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const auth = await signInWithGoogle();
      if (!auth) {
        setTried(true);
        return;
      }
      await syncNow();
      const returning = auth.google.calendarsConfigured && snapshot().courses.length > 0;
      if (returning) {
        useApp.getState().setOnboarded(true);
        router.replace('/today');
      } else {
        router.replace('/onboarding/calendars');
      }
    } catch (e) {
      setTried(true);
      const v = classifySignInError(e);
      if (v.kind === 'cancelled') return;
      if (v.kind === 'denied') {
        setAsk({ open: true, reason: v.detail });
        return;
      }
      setError(v.message);
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
      {intro && (tried || error) ? (
        <Pressable accessibilityRole="button" onPress={() => setAsk({ open: true })} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'center' }}>
          <T v="small" tone="muted">
            Can’t sign in? <T v="small">Request access</T>
          </T>
        </Pressable>
      ) : null}
      <RequestAccessSheet visible={ask.open} reason={ask.reason} onClose={() => setAsk({ open: false })} />
    </Screen>
  );
}

