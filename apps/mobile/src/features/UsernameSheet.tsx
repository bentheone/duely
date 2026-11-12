import React, { useEffect, useState } from 'react';
import { USERNAME_RE, type User } from '@duely/shared';
import { Gap, Input, PillButton, Sheet, SmallButton, T } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useApp } from '@/lib/store';

/** Pick a public @username (shown to colleagues and community members). */
export function UsernameSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const user = useApp((s) => s.user);
  const online = useApp((s) => s.online);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (visible) {
      setValue(user?.username ?? '');
      setError(null);
    }
  }, [visible, user?.username]);

  const clean = value.trim().toLowerCase().replace(/^@/, '');
  const valid = USERNAME_RE.test(clean);

  async function save(username: string | null) {
    setBusy(true);
    setError(null);
    try {
      const u = await api<User>('/me/profile', { method: 'PATCH', body: { username } });
      useApp.getState().setUser(u);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? 'That username is taken.' : e instanceof ApiError ? e.message : 'Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Username">
      <T tone="muted">Classmates see it in communities and in Colleagues.</T>
      <Gap h={12} />
      <Input
        value={value}
        onChangeText={(t) => {
          setValue(t);
          setError(null);
        }}
        placeholder="@yourname"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={21}
        accessibilityLabel="Username"
      />
      <T v="small" tone={error || (clean && !valid) ? 'danger' : 'faint'} style={{ marginTop: 6 }}>
        {error ?? (clean && !valid ? '3–20 letters, numbers, _ or .' : ' ')}
      </T>
      <Gap h={12} />
      <PillButton title="Save" loading={busy} disabled={!valid || !online || clean === user?.username} onPress={() => void save(clean)} />
      {user?.username ? (
        <>
          <Gap h={10} />
          <SmallButton title="Remove username" onPress={() => void save(null)} />
        </>
      ) : null}
    </Sheet>
  );
}
