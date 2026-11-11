import React, { useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { UpdateRow } from '@/components/UpdateRow';
import { useQuery } from '@tanstack/react-query';
import { WEEKDAY_LONG, formatHHMM, parseHHMM, zonedTime, type UserSettings } from '@duely/shared';
import { FieldRow, Gap, OptionList, Screen, Sheet, SmallButton, T } from '@/components/ui';
import { pickTime } from '@/components/pickers';
import { AlarmCheck, PermissionRows } from '@/features/Permissions';
import { remindersLabel } from '@/features/fieldOptions';
import { RemindersSheet } from '@/features/RemindersSheet';
import { signOut } from '@/lib/auth';
import { choosePhoneFolder, fetchStorageInfo, mirrorAll, phoneFolderUri } from '@/lib/files';
import { applyAlarms } from '@/lib/alarms';
import { useApp, useSettings, useTz } from '@/lib/store';
import { syncNow } from '@/lib/sync/engine';
import { useTheme } from '@/lib/theme';

type SheetKind = null | 'lead' | 'snooze' | 'weeklyDay' | 'theme' | 'reminders' | 'session';

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 32 }}>
      <T v="small" tone="muted" style={{ marginBottom: 4 }}>
        {title}
      </T>
      {children}
    </View>
  );
}

/** §11.3 #11 Settings. */
export default function Settings() {
  const { c } = useTheme();
  const tz = useTz();
  const s = useSettings();
  const user = useApp((st) => st.user);
  const googleConnected = useApp((st) => st.googleConnected);
  const lastSyncedAt = useApp((st) => st.lastSyncedAt);
  const update = useApp((st) => st.updateSettings);
  const storage = useQuery({ queryKey: ['storage'], queryFn: fetchStorageInfo });
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [folder, setFolder] = useState(phoneFolderUri());

  const patch = (p: Partial<UserSettings>) => {
    update(p);
    void syncNow();
    if (p.alarm) void applyAlarms();
  };
  const timeRow = (label: string, value: string, set: (v: string) => void) => (
    <FieldRow
      label={label}
      value={value}
      onPress={async () => {
        const { h, m } = parseHHMM(value);
        const t = await pickTime(zonedTime(tz, 2026, 1, 1, h, m), tz);
        if (t) set(formatHHMM(t, tz));
      }}
    />
  );
  const toggle = (label: string, value: boolean, set: (v: boolean) => void) => (
    <FieldRow label={label} right={<Switch value={value} onValueChange={set} trackColor={{ true: c.text, false: c.surfaceButton }} thumbColor={c.bg} accessibilityLabel={label} />} />
  );
  const storageLabel = storage.data?.usingOwnerCloudinary
    ? 'Duely Cloudinary'
    : storage.data?.provider === 'cloudinary'
      ? `Cloudinary · ${storage.data.cloudName ?? ''}`
      : storage.data?.provider === 'gdrive'
        ? 'Google Drive'
        : 'Not set';

  return (
    <Screen back>
      <T v="display">Settings</T>
      <Gap h={28} />

      <Group title="Google">
        <FieldRow label="Account" value={user?.email} />
        <FieldRow label="Calendar & Tasks" value={googleConnected ? 'Connected' : 'Not connected'} />
        <FieldRow label="Class timetable" value="Choose" onPress={() => router.push('/settings-calendars')} />
        <FieldRow label="Unmatched classes" value="Review" onPress={() => router.push('/which-course')} />
        <FieldRow
          label="Sync now"
          value={lastSyncedAt ? `Last ${formatHHMM(lastSyncedAt, tz)}` : 'Never'}
          onPress={() => void syncNow({ forceGoogle: true })}
        />
      </Group>

      <Group title="Files">
        <FieldRow label="Storage" value={storageLabel} onPress={() => router.push('/settings-storage')} />
        {storage.data?.provider === 'cloudinary' && !storage.data.pdfDeliveryConfirmed ? (
          <T v="small" tone="danger">
            Enable “Allow delivery of PDF and ZIP files” in Cloudinary → Security.
          </T>
        ) : null}
        <FieldRow
          label="Phone folder"
          value={folder ? 'Documents/Duely' : 'Off'}
          onPress={async () => {
            const uri = await choosePhoneFolder();
            if (uri) {
              setFolder(uri);
              const n = await mirrorAll();
              Alert.alert('Phone folder', `${n} files mirrored.`);
            }
          }}
        />
      </Group>

      <Group title="Class alarm">
        {toggle('Alarm before class', s.alarm.enabled, (v) => patch({ alarm: { ...s.alarm, enabled: v } }))}
        <FieldRow label="Lead time" value={`${s.alarm.leadMinutes} min`} onPress={() => setSheet('lead')} />
        <FieldRow
          label="Which classes"
          value={s.alarm.everyClass ? 'Every class' : 'First class of the day'}
          onPress={() => patch({ alarm: { ...s.alarm, everyClass: !s.alarm.everyClass } })}
        />
        <FieldRow label="Snooze" value={`${s.alarm.snoozeMinutes} min`} onPress={() => setSheet('snooze')} />
        {toggle('Ring on silent', s.alarm.ringOnSilent, (v) => patch({ alarm: { ...s.alarm, ringOnSilent: v } }))}
        <Gap h={8} />
        <PermissionRows />
        <AlarmCheck />
      </Group>

      <Group title="Reminders">
        <FieldRow label="Due reminders" value={remindersLabel(s.reminders.dueOffsets)} onPress={() => setSheet('reminders')} />
        {timeRow('Morning time', s.reminders.morningTime, (v) => patch({ reminders: { ...s.reminders, morningTime: v } }))}
        <FieldRow label="Study session length" value={`${s.sessionDefaultMinutes} min`} onPress={() => setSheet('session')} />
        {timeRow('Day starts', s.workHours.start, (v) => patch({ workHours: { ...s.workHours, start: v } }))}
        {timeRow('Day ends', s.workHours.end, (v) => patch({ workHours: { ...s.workHours, end: v } }))}
      </Group>

      <Group title="Missed assignments">
        {toggle('Ask after each class', s.missedCheck.afterClass, (v) => patch({ missedCheck: { ...s.missedCheck, afterClass: v } }))}
        {toggle('Weekly check', s.missedCheck.weekly, (v) => patch({ missedCheck: { ...s.missedCheck, weekly: v } }))}
        <FieldRow label="Day" value={WEEKDAY_LONG[s.missedCheck.weeklyDay]} onPress={() => setSheet('weeklyDay')} />
        {timeRow('Time', s.missedCheck.weeklyTime, (v) => patch({ missedCheck: { ...s.missedCheck, weeklyTime: v } }))}
        <FieldRow label="Open weekly check" value="›" onPress={() => router.push('/weekly-check')} />
      </Group>

      <Group title="Help">
        <FieldRow label="Send feedback" value="›" onPress={() => router.push('/feedback')} />
        {user?.isAdmin ? <FieldRow label="Admin" value="›" onPress={() => router.push('/admin')} /> : null}
        <UpdateRow />
      </Group>

      <Group title="Appearance">
        <FieldRow label="Theme" value={{ system: 'System', light: 'Light', dark: 'Dark' }[s.theme]} onPress={() => setSheet('theme')} />
      </Group>

      <SmallButton
        title="Sign out"
        onPress={() =>
          Alert.alert('Sign out?', 'Unsynced changes are pushed first. Local data is removed from this phone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Sign out',
              style: 'destructive',
              onPress: async () => {
                await signOut();
                router.replace('/onboarding');
              },
            },
          ])
        }
      />

      <Sheet visible={sheet === 'lead'} onClose={() => setSheet(null)} title="Lead time">
        <OptionList
          options={[10, 15, 20, 30, 45, 60].map((m) => ({ value: String(m), label: `${m} min before` }))}
          value={String(s.alarm.leadMinutes)}
          onSelect={(v) => {
            patch({ alarm: { ...s.alarm, leadMinutes: Number(v) } });
            setSheet(null);
          }}
        />
      </Sheet>
      <Sheet visible={sheet === 'snooze'} onClose={() => setSheet(null)} title="Snooze">
        <OptionList
          options={[3, 5, 10, 15].map((m) => ({ value: String(m), label: `${m} min` }))}
          value={String(s.alarm.snoozeMinutes)}
          onSelect={(v) => {
            patch({ alarm: { ...s.alarm, snoozeMinutes: Number(v) } });
            setSheet(null);
          }}
        />
      </Sheet>
      <Sheet visible={sheet === 'session'} onClose={() => setSheet(null)} title="Session length">
        <OptionList
          options={[45, 60, 90, 120].map((m) => ({ value: String(m), label: `${m} min` }))}
          value={String(s.sessionDefaultMinutes)}
          onSelect={(v) => {
            patch({ sessionDefaultMinutes: Number(v) });
            setSheet(null);
          }}
        />
      </Sheet>
      <Sheet visible={sheet === 'weeklyDay'} onClose={() => setSheet(null)} title="Weekly check day">
        <OptionList
          options={WEEKDAY_LONG.map((d, i) => ({ value: String(i), label: d }))}
          value={String(s.missedCheck.weeklyDay)}
          onSelect={(v) => {
            patch({ missedCheck: { ...s.missedCheck, weeklyDay: Number(v) } });
            setSheet(null);
          }}
        />
      </Sheet>
      <Sheet visible={sheet === 'theme'} onClose={() => setSheet(null)} title="Theme">
        <OptionList
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          value={s.theme}
          onSelect={(v) => {
            patch({ theme: v as UserSettings['theme'] });
            setSheet(null);
          }}
        />
      </Sheet>
      <RemindersSheet
        visible={sheet === 'reminders'}
        onClose={() => setSheet(null)}
        value={s.reminders.dueOffsets}
        defaults={s.reminders.dueOffsets}
        onChange={(v) => patch({ reminders: { ...s.reminders, dueOffsets: v ?? ['P3D', 'P1D', 'MORNING_OF'] } })}
      />
    </Screen>
  );
}
