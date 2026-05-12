import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { fetchTaskFromSource } from '../runtime/tasks/task-source-client.mjs';

test('rejects unsupported task source types clearly', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-source-client-'));
  try {
    await writeFile(path.join(projectPath, '.env.forge'), [
      'TASK_SOURCE_TYPE=jira',
      'TASK_SOURCE_URL=https://jira.example.local/projects/ABC',
      'TASK_SOURCE_TOKEN=secret-token'
    ].join('\n'));

    await assert.rejects(
      () => fetchTaskFromSource({ projectPath, taskId: 'ABC-123' }),
      /Unsupported task source type "jira"/
    );
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});
