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

export interface NextAlarm {
  id: string;
  triggerAt: number;
  title: string;
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
  isIgnoringBatteryOptimizations(): Promise<boolean>;
  openBatterySettings(): void;
  testAlarm(inSeconds: number): Promise<void>;
  nextAlarm(): Promise<NextAlarm | null>;
  consumeNativeCrash(): Promise<string | null>;
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

/** True when Android battery optimisation will not delay/kill alarms (always true off-Android). */
export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  return native ? native.isIgnoringBatteryOptimizations() : true;
}
export function openBatterySettings(): void {
  native?.openBatterySettings();
}
/** Schedules a real full-screen alarm `inSeconds` from now — for checking the setup. */
export async function testAlarm(inSeconds = 60): Promise<void> {
  await native?.testAlarm(inSeconds);
}
/** Earliest pending alarm (class or test), or null. */
export async function nextAlarm(): Promise<NextAlarm | null> {
  return native ? native.nextAlarm() : null;
}
/** Last uncaught native crash (stack text), cleared once read. */
export async function consumeNativeCrash(): Promise<string | null> {
  return native ? native.consumeNativeCrash() : null;
}
