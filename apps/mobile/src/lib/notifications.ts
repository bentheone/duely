import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import {
  MISSED_PROMPT_LATER_MS,
  parseHHMM,
  planNotifications,
  type PlannedNotification,
} from '@duely/shared';
import { snapshot } from './db/queries';
import { save } from './db/repo';
import { currentSettings, currentTz } from './store';

export const CHANNEL_REMINDERS = 'reminders';
export const CHANNEL_PROMPTS = 'prompts';
export const CHANNEL_COMMUNITY = 'community';
export const CATEGORY_CLASS_END = 'classEnd';
const WEEKLY_ID = 'weekly-review';

let initialized = false;

export async function initNotifications(): Promise<void> {
  if (initialized) return;
  initialized = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_REMINDERS, {
      name: 'Due reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
    await Notifications.setNotificationChannelAsync(CHANNEL_COMMUNITY, {
      name: 'Community posts',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    await Notifications.setNotificationChannelAsync(CHANNEL_PROMPTS, {
      name: 'Missed-assignment checks',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  // §8.2 class-end prompt actions: Add (opens Quick add) / No (logs none) / Later (+2 h).
  await Notifications.setNotificationCategoryAsync(CATEGORY_CLASS_END, [
    { identifier: 'add', buttonTitle: 'Add', options: { opensAppToForeground: true } },
    { identifier: 'no', buttonTitle: 'No', options: { opensAppToForeground: false } },
    { identifier: 'later', buttonTitle: 'Later', options: { opensAppToForeground: false } },
  ]);
}

export async function requestNotificationPermission(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  const r = await Notifications.requestPermissionsAsync();
  return r.granted;
}

function contentFor(n: PlannedNotification): Notifications.NotificationContentInput {
  return {
    title: n.title,
    body: n.body,
    data: { ...n.data, kind: n.kind },
    categoryIdentifier: n.kind === 'classEnd' ? CATEGORY_CLASS_END : undefined,
  };
}

/** Diff-schedules the 30-day plan (§8.2) so unchanged notifications aren't churned. */
export async function applyNotificationPlan(): Promise<void> {
  const snap = snapshot();
  const settings = currentSettings();
  const answered = new Set(snap.missedChecks.filter((m) => m.classSessionId && m.answer !== 'later').map((m) => m.classSessionId!));
  const plan = planNotifications({
    now: Date.now(),
    tz: currentTz(),
    settings,
    courses: snap.courses,
    assignments: snap.assignments,
    exams: snap.exams,
    sessions: snap.sessions,
    classSessions: snap.classSessions,
    answeredClassSessionIds: answered,
    lectures: snap.lectures,
  }).slice(0, 400); // stay well under OS limits
  const wanted = new Map(plan.map((p) => [p.id, p]));
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const have = new Set<string>();
  for (const s of scheduled) {
    if (s.identifier === WEEKLY_ID || s.identifier.startsWith('later-')) continue;
    const w = wanted.get(s.identifier);
    const sameBody = w && s.content.title === w.title && s.content.body === w.body;
    if (!w || !sameBody) await Notifications.cancelScheduledNotificationAsync(s.identifier);
    else have.add(s.identifier);
  }
  for (const p of plan) {
    if (have.has(p.id)) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: p.id,
      content: contentFor(p),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(p.at),
        channelId: p.kind === 'classEnd' ? CHANNEL_PROMPTS : CHANNEL_REMINDERS,
      },
    });
  }
  await scheduleWeekly();
}

async function scheduleWeekly(): Promise<void> {
  const { missedCheck } = currentSettings();
  await Notifications.cancelScheduledNotificationAsync(WEEKLY_ID).catch(() => undefined);
  if (!missedCheck.weekly) return;
  const { h, m } = parseHHMM(missedCheck.weeklyTime);
  await Notifications.scheduleNotificationAsync({
    identifier: WEEKLY_ID,
    content: { title: 'Anything missed?', body: 'Quick weekly check of your courses.', data: { url: 'duely://weekly-check' } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: missedCheck.weeklyDay + 1, // expo: 1 = Sunday
      hour: h,
      minute: m,
      channelId: CHANNEL_PROMPTS,
    },
  });
}

async function handleResponse(r: Notifications.NotificationResponse) {
  const data = (r.notification.request.content.data ?? {}) as Record<string, string>;
  const action = r.actionIdentifier;
  if (data.kind === 'classEnd' && data.courseId) {
    if (action === 'no') {
      save('missedChecks', { courseId: data.courseId, classSessionId: data.classSessionId ?? null, answer: 'none', at: Date.now() });
      await Notifications.dismissNotificationAsync(r.notification.request.identifier);
      return;
    }
    if (action === 'later') {
      save('missedChecks', { courseId: data.courseId, classSessionId: data.classSessionId ?? null, answer: 'later', at: Date.now() });
      await Notifications.dismissNotificationAsync(r.notification.request.identifier);
      await Notifications.scheduleNotificationAsync({
        identifier: `later-${data.classSessionId}-${Date.now()}`,
        content: {
          title: r.notification.request.content.title ?? undefined,
          body: r.notification.request.content.body ?? undefined,
          data: r.notification.request.content.data,
          categoryIdentifier: CATEGORY_CLASS_END,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + MISSED_PROMPT_LATER_MS), channelId: CHANNEL_PROMPTS },
      });
      return;
    }
    router.push({ pathname: '/quick-add', params: { courseId: data.courseId, classSessionId: data.classSessionId ?? '' } });
    return;
  }
  if (data.url) {
    const path = data.url.replace('duely://', '/');
    router.push(path as never);
  }
}

export function listenToNotificationResponses(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((r) => void handleResponse(r));
  // Cold start via a notification tap/action.
  const last = Notifications.getLastNotificationResponse();
  if (last) {
    void handleResponse(last);
    Notifications.clearLastNotificationResponse();
  }
  return () => sub.remove();
}
