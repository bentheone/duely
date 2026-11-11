import React from 'react';
import { Linking } from 'react-native';
import { FieldRow } from './ui';
import { APP_VERSION, BUILD_NUMBER } from '@/lib/config';
import { checkForUpdate, useUpdates } from '@/lib/updates';
import { useTheme } from '@/lib/theme';

/** Settings → Help: current version; tap to check GitHub for a newer APK (or download it). */
export function UpdateRow() {
  const { c } = useTheme();
  const { available, checking, error, checkedAt } = useUpdates();
  const current = `${APP_VERSION}${BUILD_NUMBER ? ` (${BUILD_NUMBER})` : ''}`;
  const value = checking ? 'Checking…' : available ? `Update · build ${available.build}` : error ? 'Couldn’t check' : checkedAt ? `${current} · latest` : current;
  return (
    <FieldRow
      label="Version"
      value={value}
      valueColor={available ? c.danger : undefined}
      onPress={() => (available ? void Linking.openURL(available.apkUrl) : void checkForUpdate({ force: true }))}
    />
  );
}
