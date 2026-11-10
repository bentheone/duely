import * as DuelyAlarm from 'duely-alarm';
import { computeClassAlarms } from '@duely/shared';
import { snapshot } from './db/queries';
import { currentSettings, currentTz } from './store';

/** §8.1 JS side: recompute class alarms for the next 7 days and replace the native schedule. */
export async function applyAlarms(): Promise<number> {
  if (!DuelyAlarm.isAvailable) return 0;
  const { alarm } = currentSettings();
  await DuelyAlarm.setOptions({ snoozeMinutes: alarm.snoozeMinutes, ringOnSilent: alarm.ringOnSilent });
  const snap = snapshot();
  const alarms = computeClassAlarms(snap.classSessions, snap.courses, alarm, Date.now(), currentTz());
  await DuelyAlarm.scheduleAlarms(alarms);
  return alarms.length;
}

export interface AlarmPermissionStatus {
  available: boolean;
  fullScreen: boolean;
  exact: boolean;
}

export async function alarmPermissions(): Promise<AlarmPermissionStatus> {
  if (!DuelyAlarm.isAvailable) return { available: false, fullScreen: false, exact: false };
  const [fullScreen, exact] = await Promise.all([DuelyAlarm.canUseFullScreenIntent(), DuelyAlarm.canScheduleExact()]);
  return { available: true, fullScreen, exact };
}

export { DuelyAlarm };
