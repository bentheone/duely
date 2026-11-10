import React, { useCallback, useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { formatHHMM, formatShortDate } from '@duely/shared';
import { useTz } from '@/lib/store';
import * as Notifications from 'expo-notifications';
import { Check } from 'lucide-react-native';
import { RowView, SmallButton, T } from '@/components/ui';
import { DuelyAlarm, alarmPermissions } from '@/lib/alarms';
import { requestNotificationPermission } from '@/lib/notifications';
import { useTheme } from '@/lib/theme';
import { recordCrash } from '@/lib/crash';

interface Status {
  notifications: boolean;
  exact: boolean;
  fullScreen: boolean;
  battery: boolean;
  native: boolean;
}

export function usePermissionStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const refresh = useCallback(async () => {
    try {
      const [n, a, battery] = await Promise.all([Notifications.getPermissionsAsync(), alarmPermissions(), DuelyAlarm.isIgnoringBatteryOptimizations()]);
      setStatus({ notifications: n.granted, exact: a.exact, fullScreen: a.fullScreen, battery, native: a.available });
    } catch (e) {
      recordCrash('permission status', e);
      setStatus({ notifications: false, exact: false, fullScreen: false, battery: false, native: false });
    }
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
    { key: 'b', label: 'Battery: unrestricted', ok: status.battery, fix: () => DuelyAlarm.openBatterySettings() },
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
          {r.ok ? (
            <Check size={20} color={c.text} accessibilityLabel="Allowed" />
          ) : (
            <SmallButton
              title="Allow"
              onPress={() => {
                try {
                  Promise.resolve(r.fix() as unknown).catch((e: unknown) => recordCrash(`allow ${r.label}`, e));
                } catch (e) {
                  recordCrash(`allow ${r.label}`, e);
                }
              }}
            />
          )}
        </RowView>
      ))}
    </View>
  );
}

/** "Next alarm" line + "Test alarm in 1 minute" — lets the owner verify alarms without waiting for class. */
export function AlarmCheck() {
  const [next, setNext] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState(false);
  const tz = useTz();
  const load = useCallback(async () => {
    try {
      const n = await DuelyAlarm.nextAlarm();
      setNext(n ? `${n.title} · ${formatShortDate(n.triggerAt, tz)} ${formatHHMM(n.triggerAt, tz)}` : null);
    } catch (e) {
      recordCrash('next alarm', e);
    }
  }, [tz]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!DuelyAlarm.isAvailable) return null;
  return (
    <View style={{ gap: 8, marginTop: 8 }}>
      <T v="small" tone="muted">
        {next ? `Next alarm: ${next}` : 'No alarms scheduled'}
      </T>
      <SmallButton
        title={scheduled ? 'Rings in 1 minute — lock the phone' : 'Test alarm in 1 minute'}
        onPress={async () => {
          try {
            await DuelyAlarm.testAlarm(60);
            setScheduled(true);
            await load();
          } catch (e) {
            recordCrash('test alarm', e);
          }
        }}
      />
    </View>
  );
}
