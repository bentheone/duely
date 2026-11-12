import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { getDb } from './db/client';
import { getTokens } from './api';
import { useApp } from './store';
import { checkCommunityActivity } from './communityActivity';
import { autoSaveCommunityPosts } from './communityAutoSave';

export const COMMUNITY_TASK = 'duely-community-check';

// Must be defined at module load (also in the headless JS context Android starts for the task).
TaskManager.defineTask(COMMUNITY_TASK, async () => {
  try {
    getDb();
    const signedIn = !!(await getTokens());
    if (!signedIn) return BackgroundTask.BackgroundTaskResult.Success;
    if (!useApp.getState().ready) useApp.getState().hydrate(true);
    await autoSaveCommunityPosts(true);
    await checkCommunityActivity(true);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Checks communities every ~30 min while the app is closed (Android decides the exact time). */
export async function registerBackgroundTasks(): Promise<void> {
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
  if (await TaskManager.isTaskRegisteredAsync(COMMUNITY_TASK)) return;
  await BackgroundTask.registerTaskAsync(COMMUNITY_TASK, { minimumInterval: 30 });
}
