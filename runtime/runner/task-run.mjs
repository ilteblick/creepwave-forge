import { fetchTaskFromSource } from '../tasks/task-source-client.mjs';
import { preflightTaskLabelSync, syncTaskLabels } from '../tasks/task-label-sync.mjs';
import { buildTaskPrompt } from '../tasks/task-prompt-builder.mjs';

export async function prepareTaskRun({ projectPath, taskId, fetchImpl = globalThis.fetch } = {}) {
  const sourceTask = await fetchTaskFromSource({ projectPath, taskId, fetchImpl });
  assertForgeTaskLabel(sourceTask);
  await preflightTaskLabelSync({ projectPath, taskId: sourceTask.id ?? taskId, fetchImpl });

  return {
    sourceTask,
    userPrompt: buildTaskPrompt(sourceTask),
    branchSlug: taskBranchSlug(sourceTask),
    taskSource: taskSourceMetadata(sourceTask)
  };
}

export async function syncLabelsForRun({ projectPath, run, fetchImpl, store }) {
  try {
    const result = await syncTaskLabels({ projectPath, run, fetchImpl });
    if (run.task_source) {
      run.tracker_sync = {
        status: result.skipped ? 'skipped' : 'synced',
        updated_at: new Date().toISOString(),
        ...(result.skipped ? { reason: result.reason } : {}),
        ...(!result.skipped ? {
          source: result.source,
          task_id: result.task_id,
          applied_labels: result.appliedLabels
        } : {})
      };
      await store?.saveRun(run);
    }
    return result;
  } catch (error) {
    if (!run.task_source) {
      throw error;
    }

    const failure = {
      skipped: false,
      failed: true,
      retryable: true,
      source: run.task_source.type,
      task_id: run.task_source.task_id,
      error: error.message
    };
    run.tracker_sync = {
      status: 'failed',
      retryable: true,
      source: failure.source,
      task_id: failure.task_id,
      error: failure.error,
      updated_at: new Date().toISOString()
    };
    await store?.saveRun(run);
    return failure;
  }
}

export function taskSourceMetadata(sourceTask) {
  return {
    type: sourceTask.source?.type ?? 'unknown',
    task_id: String(sourceTask.id ?? ''),
    ...(sourceTask.source?.task_url !== undefined ? { task_url: sourceTask.source.task_url } : {}),
    source_url: sourceTask.source?.url ?? ''
  };
}

export function taskBranchSlug(sourceTask) {
  return `task-${sourceTask?.id ?? 'unknown'}-${sourceTask?.title ?? ''}`;
}

export function assertForgeTaskLabel(sourceTask) {
  if (Array.isArray(sourceTask?.labels) && sourceTask.labels.includes('forge')) {
    return;
  }

  const taskLabel = sourceTask?.id ? ` ${sourceTask.id}` : '';
  throw new Error(`Tracker task${taskLabel} is not marked for Forge. Add the exact "forge" label before starting forge_run_task.`);
}
