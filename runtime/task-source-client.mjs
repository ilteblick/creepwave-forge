import { loadTaskSourceConfig } from './task-source-config.mjs';
import { fetchGitLabTask } from './task-source-gitlab.mjs';

export async function fetchTaskFromSource({ projectPath, taskId, fetchImpl = globalThis.fetch } = {}) {
  if (!taskId || String(taskId).trim() === '') {
    throw new Error('taskId is required');
  }

  const config = await loadTaskSourceConfig({ projectPath });
  if (config.type === 'gitlab') {
    return fetchGitLabTask({
      config,
      taskId: String(taskId).trim(),
      fetchImpl
    });
  }

  throw new Error(`Unsupported task source type "${config.type}"`);
}
