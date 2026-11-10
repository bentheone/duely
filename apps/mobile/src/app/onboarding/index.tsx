import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { statusCodes } from '@react-native-google-signin/google-signin';
import { Gap, PillButton, Screen, T } from '@/components/ui';
import { signInWithGoogle } from '@/lib/auth';
import { syncNow } from '@/lib/sync/engine';
import { snapshot } from '@/lib/db/queries';
import { useApp } from '@/lib/store';

/** One question per screen (§11.3 onboarding): Sign in with Google. */
export default function Welcome() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <Screen scroll={false} footer={<PillButton title="Sign in with Google" onPress={go} loading={busy} />}>
      <View style={{ flex: 1 }}>
        <Gap h={40} />
        <T v="display">Duely</T>
        <Gap h={12} />
        <T v="body" tone="muted" style={{ fontSize: 17, lineHeight: 25 }}>
          Every assignment, class and exam — on time.
        </T>
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
