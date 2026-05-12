import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTaskSourceConfig } from '../runtime/tasks/task-source-config.mjs';
import { fetchGitLabTask } from '../runtime/tasks/task-source-gitlab.mjs';

const enableFlag = process.env.FORGE_LIVE_BOARD_SMOKE;
const projectPath = process.env.FORGE_LIVE_PROJECT_PATH;
const taskId = process.env.FORGE_LIVE_TASK_ID;

function skipReason() {
  if (enableFlag !== '1') {
    return 'Set FORGE_LIVE_BOARD_SMOKE=1, FORGE_LIVE_PROJECT_PATH, and FORGE_LIVE_TASK_ID to run live board smoke.';
  }
  const missing = [
    ['FORGE_LIVE_PROJECT_PATH', projectPath],
    ['FORGE_LIVE_TASK_ID', taskId]
  ].filter(([, value]) => !value?.trim()).map(([key]) => key);

  return missing.length > 0
    ? `Missing live board smoke env: ${missing.join(', ')}.`
    : false;
}

test('live GitLab task source smoke reads a marked task without creating Forge run state', { skip: skipReason() }, async () => {
  const config = await loadTaskSourceConfig({ projectPath });
  assert.equal(config.type, 'gitlab', 'live board smoke currently supports GitLab task sources only');

  const task = await fetchGitLabTask({ config, taskId });

  assert.equal(task.source.type, 'gitlab');
  assert.equal(task.id, String(taskId).replace(/^#/, ''));
  assert.ok(task.title.trim(), 'live smoke task should have a title');
  assert.ok(task.labels.includes('forge'), 'live smoke task must already have the exact forge marker label');
  assert.doesNotMatch(JSON.stringify(task), new RegExp(escapeRegExp(config.token)));
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
