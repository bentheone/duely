import React, { useState } from 'react';
import { View } from 'react-native';
import { AccessRequestBodySchema } from '@duely/shared';
import { Gap, Input, PillButton, Sheet, T } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

/**
 * Google only lets listed test users in while the OAuth app is in Testing. Blocked people leave
 * their Gmail; the admin adds them in Google Cloud and Duely emails them when they're in.
 */
export function RequestAccessSheet({ visible, onClose, reason }: { visible: boolean; onClose: () => void; reason?: string | null }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function send() {
    const parsed = AccessRequestBodySchema.safeParse({ email, name: name || undefined });
    if (!parsed.success) {
      setError('Enter the Gmail address you sign in with.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/access-requests', { auth: false, body: parsed.data });
      setSentTo(parsed.data.email);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 429 ? 'Too many tries. Wait a minute.' : 'Couldn’t send. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    onClose();
    // Keep the "sent" state if they reopen; reset only the error.
    setError(null);
  };

  return (
    <Sheet visible={visible} onClose={close} title={sentTo ? 'Request sent' : 'Request access'}>
      {sentTo ? (
        <View>
          <T tone="muted">We’ll email {sentTo} when you’re added. Then sign in again.</T>
          <Gap h={24} />
          <PillButton title="Done" onPress={close} />
        </View>
      ) : (
        <View>
          <T tone="muted">Duely is in testing. Google only lets listed testers sign in. Leave your Gmail and we’ll email you when you’re in.</T>
          {reason ? (
            <T v="small" tone="faint" style={{ marginTop: 8 }}>
              {reason}
            </T>
          ) : null}
          <Gap h={20} />
          <Input
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setError(null);
            }}
            placeholder="you@gmail.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            accessibilityLabel="Gmail address"
            testID="request-email"
          />
          <Gap h={10} />
          <Input value={name} onChangeText={setName} placeholder="Your name (optional)" autoComplete="name" accessibilityLabel="Name" maxLength={80} />
          {error ? (
            <T tone="danger" v="small" style={{ marginTop: 10 }}>
              {error}
            </T>
          ) : null}
          <Gap h={20} />
          <PillButton title="Send request" onPress={send} loading={busy} />
        </View>
      )}
    </Sheet>
  );
}
