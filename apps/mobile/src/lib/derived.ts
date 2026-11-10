import { onDataChange } from './db/repo';
import { applyNotificationPlan } from './notifications';
import { applyAlarms } from './alarms';
import { updateAllWidgets } from '@/widgets/update';
import { prefetchOfflineFiles, processUploadQueue } from './files';

let timer: ReturnType<typeof setTimeout> | null = null;

/** Re-derives OS-side state (notifications, alarms, widgets, file queue) after data changes. */
export function refreshDerived(delay = 1500) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    timer = null;
    const jobs: [string, () => Promise<unknown>][] = [
      ['notifications', applyNotificationPlan],
      ['alarms', applyAlarms],
      ['widgets', updateAllWidgets],
      ['uploads', processUploadQueue],
      ['offline files', prefetchOfflineFiles],
    ];
    for (const [name, job] of jobs) {
      try {
        await job();
      } catch (e) {
        console.warn(`derived ${name} failed`, (e as Error).message);
      }
    }
  }, delay);
}

export function startDerived(): () => void {
  refreshDerived(500);
  return onDataChange(() => refreshDerived());
}
