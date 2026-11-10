import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { FeedbackBodySchema, type FeedbackKind } from '@duely/shared';
import { Gap, Input, PillButton, Screen, Segmented, T } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useApp } from '@/lib/store';

/** Feedback form (reached from the profile page). Goes to the admin dashboard. */
export default function FeedbackScreen() {
  const online = useApp((s) => s.online);
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    const body = FeedbackBodySchema.safeParse({
      kind,
      message,
      appVersion: Constants.expoConfig?.version,
      device: `${Platform.OS} ${String(Platform.Version)}`,
    });
    if (!body.success) {
      setError('Write a few words first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/feedback', { body: body.data });
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Couldn’t send. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Screen back footer={<PillButton title="Done" onPress={() => router.back()} />}>
        <T v="display">Thanks</T>
        <Gap h={12} />
        <T tone="muted">Your feedback was sent.</T>
      </Screen>
    );
  }

  return (
    <Screen back footer={<PillButton title="Send" onPress={send} loading={busy} disabled={!online || message.trim().length < 3} />}>
      <T v="display">Feedback</T>
      <Gap h={8} />
      <T tone="muted">Found a bug or have an idea? Tell us.</T>
      <Gap h={24} />
      <Segmented
        options={[
          { value: 'bug', label: 'Bug' },
          { value: 'idea', label: 'Idea' },
          { value: 'other', label: 'Other' },
        ]}
        value={kind}
        onChange={setKind}
      />
      <Gap h={16} />
      <Input
        value={message}
        onChangeText={(t) => {
          setMessage(t);
          setError(null);
        }}
        placeholder={kind === 'bug' ? 'What happened? What did you expect?' : kind === 'idea' ? 'What would make Duely better?' : 'Your message'}
        multiline
        textAlignVertical="top"
        maxLength={4000}
        style={{ minHeight: 160, paddingTop: 14 }}
        accessibilityLabel="Feedback message"
      />
      <View style={{ minHeight: 24, marginTop: 8 }}>
        {error ? (
          <T v="small" tone="danger">
            {error}
          </T>
        ) : !online ? (
          <T v="small" tone="muted">
            You’re offline — send when you’re back online.
          </T>
        ) : null}
      </View>
    </Screen>
  );
}
