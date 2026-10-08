import Constants from 'expo-constants';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { flushIncidentOutbox } from './incident-outbox';

const taskName = 'ground-control-incident-outbox';
// Headless entry point: no screen must be mounted for this work.
if (!TaskManager.isTaskDefined(taskName)) TaskManager.defineTask(taskName, async () => {
  try {
    await flushIncidentOutbox();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch { return BackgroundTask.BackgroundTaskResult.Failed; }
});
export async function registerIncidentBackground() {
  if (Constants.executionEnvironment === 'storeClient' || !await TaskManager.isAvailableAsync()) return;
  if (await BackgroundTask.getStatusAsync() !== BackgroundTask.BackgroundTaskStatus.Available) return;
  if (!await TaskManager.isTaskRegisteredAsync(taskName)) {
    await BackgroundTask.registerTaskAsync(taskName, { minimumInterval: 15 });
  }
}
