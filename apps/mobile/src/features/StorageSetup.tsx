import React, { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { StorageInfo } from '@duely/shared';
import { Checkbox, Gap, Input, OptionList, PillButton, Screen, T } from '@/components/ui';
import { api } from '@/lib/api';
import { grantDriveScope } from '@/lib/auth';
import { fetchStorageInfo } from '@/lib/files';
import { useTheme } from '@/lib/theme';

type Choice = 'owner' | 'cloudinary' | 'gdrive';

/** Storage choice (§2, §3.6): Cloudinary (own credentials, or owner's) or Google Drive. */
export function StorageSetup({ onDone, back }: { onDone: () => void; back?: boolean }) {
  const { c } = useTheme();
  const q = useQuery({ queryKey: ['storage'], queryFn: fetchStorageInfo });
  const info = q.data;
  const [choice, setChoice] = useState<Choice | null>(null);
  const [cloudName, setCloudName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [pdfOk, setPdfOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current: Choice | null = choice ?? (info?.usingOwnerCloudinary ? 'owner' : info?.provider === 'gdrive' ? 'gdrive' : info?.provider === 'cloudinary' ? 'cloudinary' : null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (current === 'owner') {
        await api<StorageInfo>('/storage', { method: 'PUT', body: { provider: 'cloudinary', useOwner: true, pdfDeliveryConfirmed: true } });
      } else if (current === 'gdrive') {
        const ok = await grantDriveScope();
        if (!ok) throw new Error('Google Drive access wasn’t granted.');
        await api<StorageInfo>('/storage', { method: 'PUT', body: { provider: 'gdrive' } });
      } else if (current === 'cloudinary') {
        await api<StorageInfo>('/storage', {
          method: 'PUT',
          body: { provider: 'cloudinary', cloudinary: { cloudName: cloudName.trim(), apiKey: apiKey.trim(), apiSecret: apiSecret.trim() }, pdfDeliveryConfirmed: pdfOk },
        });
      }
      await fetchStorageInfo();
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const options: { value: Choice; label: string; hint?: string }[] = [
    ...(info?.usingOwnerCloudinary ? [{ value: 'owner' as const, label: 'Duely Cloudinary', hint: 'Owner account' }] : []),
    { value: 'cloudinary', label: 'My Cloudinary', hint: 'Use your own credentials' },
    { value: 'gdrive', label: 'Google Drive', hint: 'A “Duely” folder in your Drive' },
  ];
  const cloudinaryValid = cloudName.trim() && apiKey.trim() && apiSecret.trim() && pdfOk;

  return (
    <Screen
      back={back}
      footer={
        <View style={{ gap: 10 }}>
          <PillButton title="Save" onPress={save} loading={busy} disabled={!current || (current === 'cloudinary' && !cloudinaryValid)} />
          {!back ? (
            <Pressable accessibilityRole="button" onPress={onDone} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <T tone="muted">Later</T>
            </Pressable>
          ) : null}
        </View>
      }
    >
      <T v="display">Files</T>
      <Gap h={8} />
      <T tone="muted">Where should handouts and submissions live?</T>
      <Gap h={24} />
      <OptionList options={options} value={current} onSelect={setChoice} />
      {current === 'cloudinary' ? (
        <View style={{ gap: 12, marginTop: 16 }}>
          <Input placeholder="Cloud name" autoCapitalize="none" value={cloudName} onChangeText={setCloudName} accessibilityLabel="Cloud name" />
          <Input placeholder="API key" autoCapitalize="none" value={apiKey} onChangeText={setApiKey} accessibilityLabel="API key" />
          <Input placeholder="API secret" autoCapitalize="none" secureTextEntry value={apiSecret} onChangeText={setApiSecret} accessibilityLabel="API secret" />
          <T v="small" tone="muted">The secret is encrypted on the server and never stored on this phone.</T>
          <Gap h={4} />
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <Checkbox checked={pdfOk} onToggle={() => setPdfOk(!pdfOk)} label="PDF delivery enabled" />
            <View style={{ flex: 1 }}>
              <T>I enabled “Allow delivery of PDF and ZIP files”</T>
              <T v="small" tone="muted">
                New Cloudinary accounts block PDFs. Settings → Security → turn it on, then save.
              </T>
              <Pressable onPress={() => void Linking.openURL('https://console.cloudinary.com/settings/security')} style={{ minHeight: 44, justifyContent: 'center' }}>
                <T v="small" color={c.suggestion}>Open Cloudinary security settings</T>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
      {current === 'gdrive' ? (
        <T v="small" tone="muted" style={{ marginTop: 12 }}>
          Google will ask for access to files Duely creates — nothing else in your Drive.
        </T>
      ) : null}
      {error ? (
        <T tone="danger" style={{ marginTop: 16 }}>
          {error}
        </T>
      ) : null}
    </Screen>
  );
}
