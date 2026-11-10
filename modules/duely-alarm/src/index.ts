import { Platform } from 'react-native';
import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

export interface AlarmInput {
  id: string;
  triggerAt: number;
  title: string;
  subtitle: string;
  color: string;
}

export interface AlarmActionEvent {
  id: string;
  action: 'stop' | 'snooze';
}

export interface AlarmOptions {
  snoozeMinutes: number;
  ringOnSilent: boolean;
}

interface NativeAlarm {
  scheduleAlarms(alarms: AlarmInput[]): Promise<void>;
  cancelAll(): Promise<void>;
  setOptions(opts: AlarmOptions): Promise<void>;
  canUseFullScreenIntent(): Promise<boolean>;
  openFullScreenIntentSettings(): void;
  canScheduleExact(): Promise<boolean>;
  openExactAlarmSettings(): void;
  consumePendingActions(): Promise<AlarmActionEvent[]>;
  addListener(event: 'alarmAction', cb: (e: AlarmActionEvent) => void): EventSubscription;
}

// Null on iOS / web / Expo Go — every call becomes a safe no-op.
const native = Platform.OS === 'android' ? requireOptionalNativeModule<NativeAlarm>('DuelyAlarm') : null;

export const isAvailable = !!native;

/** Replaces all scheduled class alarms (§8.1). */
export async function scheduleAlarms(alarms: AlarmInput[]): Promise<void> {
  await native?.scheduleAlarms(alarms);
}
export async function cancelAll(): Promise<void> {
  await native?.cancelAll();
}
export async function setOptions(opts: AlarmOptions): Promise<void> {
  await native?.setOptions(opts);
}
export async function canUseFullScreenIntent(): Promise<boolean> {
  return native ? native.canUseFullScreenIntent() : false;
}
export function openFullScreenIntentSettings(): void {
  native?.openFullScreenIntentSettings();
}
export async function canScheduleExact(): Promise<boolean> {
  return native ? native.canScheduleExact() : false;
}
export function openExactAlarmSettings(): void {
  native?.openExactAlarmSettings();
}
/** Actions taken on the alarm screen while JS wasn't running. */
export async function consumePendingActions(): Promise<AlarmActionEvent[]> {
  return native ? native.consumePendingActions() : [];
}
export function addListener(
  event: 'alarmAction',
  cb: (e: AlarmActionEvent) => void,
): { remove(): void } {
  if (!native) return { remove() {} };
  return native.addListener(event, cb);
}
