import { labelsForRun } from './forge-board-labels.mjs';
import { loadTaskSourceConfig } from './task-source-config.mjs';
import { syncGitLabTaskLabels } from './task-source-gitlab.mjs';

export async function preflightTaskLabelSync({ projectPath, taskId, fetchImpl = globalThis.fetch } = {}) {
  const config = await loadTaskSourceConfig({ projectPath });
  const desiredLabels = labelsForRun({
    status: 'awaiting_role_output',
    current_role: 'context-router'
  });

  return syncConfiguredTaskLabels({
    config,
    taskId,
    desiredLabels,
    fetchImpl
  });
}

export async function syncTaskLabels({ projectPath, run, fetchImpl = globalThis.fetch } = {}) {
  if (!run?.task_source) {
    return {
      skipped: true,
      reason: 'run is not task-backed'
    };
  }

  const config = await loadTaskSourceConfig({ projectPath });
  const desiredLabels = labelsForRun(run);

  return syncConfiguredTaskLabels({
    config,
    taskId: run.task_source.task_id,
    desiredLabels,
    fetchImpl
  });
}

async function syncConfiguredTaskLabels({ config, taskId, desiredLabels, fetchImpl }) {
  try {
    if (config.type === 'gitlab') {
      const result = await syncGitLabTaskLabels({
        config,
        taskId,
        desiredLabels,
        fetchImpl
      });
      return {
        skipped: false,
        source: 'gitlab',
        task_id: result.task_id,
        desiredLabels,
        appliedLabels: result.labels
      };
    }
  } catch (error) {
    throw new Error(redactToken(error.message, config.token));
  }

  throw new Error(`Unsupported task source type "${config.type}"`);
}

function redactToken(message, token) {
  if (!token) {
    return message;
  }
  return message.split(token).join('[redacted]');
}
