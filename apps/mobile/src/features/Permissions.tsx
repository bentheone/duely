import React, { useCallback, useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Check } from 'lucide-react-native';
import { RowView, SmallButton, T } from '@/components/ui';
import { DuelyAlarm, alarmPermissions } from '@/lib/alarms';
import { requestNotificationPermission } from '@/lib/notifications';
import { useTheme } from '@/lib/theme';

interface Status {
  notifications: boolean;
  exact: boolean;
  fullScreen: boolean;
  native: boolean;
}

export function usePermissionStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const refresh = useCallback(async () => {
    const [n, a] = await Promise.all([Notifications.getPermissionsAsync(), alarmPermissions()]);
    setStatus({ notifications: n.granted, exact: a.exact, fullScreen: a.fullScreen, native: a.available });
  }, []);
  useEffect(() => {
    void refresh();
    // Re-check when returning from system settings.
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void refresh());
    return () => sub.remove();
  }, [refresh]);
  return { status, refresh };
}

/** Permission status with fix buttons (§3.3, §11.3 #11). */
export function PermissionRows() {
  const { c } = useTheme();
  const { status, refresh } = usePermissionStatus();
  if (!status) return null;
  const rows = [
    {
      key: 'n',
      label: 'Notifications',
      ok: status.notifications,
      fix: async () => {
        await requestNotificationPermission();
        await refresh();
      },
    },
    { key: 'e', label: 'Exact alarms', ok: status.exact, fix: () => DuelyAlarm.openExactAlarmSettings() },
    { key: 'f', label: 'Full-screen alarm', ok: status.fullScreen, fix: () => DuelyAlarm.openFullScreenIntentSettings() },
  ];
  return (
    <View style={{ gap: 4 }}>
      {!status.native ? (
        <T v="small" tone="muted">
          Class alarms need the Duely build (not Expo Go).
        </T>
      ) : null}
      {rows.map((r) => (
        <RowView key={r.key} style={{ minHeight: 56, justifyContent: 'space-between' }}>
          <T>{r.label}</T>
          {r.ok ? <Check size={20} color={c.text} accessibilityLabel="Allowed" /> : <SmallButton title="Allow" onPress={() => void r.fix()} />}
        </RowView>
      ))}
    </View>
  );
}
