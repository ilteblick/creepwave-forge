import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  loadTaskSourceConfig,
  parseTaskSourceEnv,
  redactTaskSourceConfig
} from '../runtime/tasks/task-source-config.mjs';

test('parses simple .env.forge content', () => {
  const parsed = parseTaskSourceEnv([
    '# Forge task source',
    'TASK_SOURCE_TYPE=gitlab',
    'TASK_SOURCE_URL=https://gitlab.example.local/group/project',
    'TASK_SOURCE_TOKEN=secret-token',
    '',
    'EXTRA=value=with=equals'
  ].join('\n'));

  assert.equal(parsed.TASK_SOURCE_TYPE, 'gitlab');
  assert.equal(parsed.TASK_SOURCE_URL, 'https://gitlab.example.local/group/project');
  assert.equal(parsed.TASK_SOURCE_TOKEN, 'secret-token');
  assert.equal(parsed.EXTRA, 'value=with=equals');
});

test('loads required task source config from project .env.forge', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-env-'));
  try {
    await writeFile(path.join(projectPath, '.env.forge'), [
      'TASK_SOURCE_TYPE=gitlab',
      'TASK_SOURCE_URL=https://gitlab.example.local/group/project',
      'TASK_SOURCE_TOKEN=secret-token'
    ].join('\n'));

    const config = await loadTaskSourceConfig({ projectPath });

    assert.deepEqual(config, {
      type: 'gitlab',
      url: 'https://gitlab.example.local/group/project',
      token: 'secret-token'
    });
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('reports missing .env.forge clearly', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-env-missing-'));
  try {
    await assert.rejects(
      () => loadTaskSourceConfig({ projectPath }),
      /Task source config not found/
    );
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('reports missing required keys without leaking token values', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-env-invalid-'));
  try {
    await writeFile(path.join(projectPath, '.env.forge'), [
      'TASK_SOURCE_TYPE=gitlab',
      'TASK_SOURCE_TOKEN=super-secret'
    ].join('\n'));

    await assert.rejects(
      () => loadTaskSourceConfig({ projectPath }),
      (error) => {
        assert.match(error.message, /TASK_SOURCE_URL/);
        assert.doesNotMatch(error.message, /super-secret/);
        return true;
      }
    );
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('redacts token from diagnostic config', () => {
  assert.deepEqual(redactTaskSourceConfig({
    type: 'gitlab',
    url: 'https://gitlab.example.local/group/project',
    token: 'secret-token'
  }), {
    type: 'gitlab',
    url: 'https://gitlab.example.local/group/project',
    token: '[redacted]'
  });
});
