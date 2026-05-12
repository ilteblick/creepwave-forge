import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { preflightTaskLabelSync, syncTaskLabels } from '../runtime/tasks/task-label-sync.mjs';

test('no-ops for runs without task source metadata', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-label-sync-noop-'));
  try {
    const result = await syncTaskLabels({
      projectPath,
      run: {
        status: 'awaiting_role_output',
        current_role: 'context-router'
      },
      fetchImpl: async () => {
        throw new Error('fetch should not be called');
      }
    });

    assert.deepEqual(result, {
      skipped: true,
      reason: 'run is not task-backed'
    });
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('syncs task-backed GitLab run labels', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-label-sync-'));
  const calls = [];
  try {
    await writeFile(path.join(projectPath, '.env.forge'), [
      'TASK_SOURCE_TYPE=gitlab',
      'TASK_SOURCE_URL=https://gitlab.example.local/group/project',
      'TASK_SOURCE_TOKEN=secret-token'
    ].join('\n'));

    const result = await syncTaskLabels({
      projectPath,
      run: {
        status: 'awaiting_role_output',
        current_role: 'context-router',
        task_source: {
          type: 'gitlab',
          task_id: '123',
          source_url: 'https://gitlab.example.local/group/project'
        }
      },
      fetchImpl: async (url, options = {}) => {
        calls.push({ url, options });
        if (url.endsWith('/issues/123') && (!options.method || options.method === 'GET')) {
          return jsonResponse({ labels: ['forge:ready', 'customer'] });
        }
        if (url.endsWith('/labels') && options.method === 'POST') {
          return jsonResponse({ name: JSON.parse(options.body).name }, 201);
        }
        if (url.endsWith('/issues/123') && options.method === 'PUT') {
          return jsonResponse({ labels: JSON.parse(options.body).labels });
        }
        throw new Error(`unexpected url: ${url}`);
      }
    });

    assert.equal(result.skipped, false);
    assert.deepEqual(result.desiredLabels, ['forge', 'forge:running', 'forge-role:context-router']);
    assert.deepEqual(result.appliedLabels, ['customer', 'forge', 'forge:running', 'forge-role:context-router']);
    assert.doesNotMatch(JSON.stringify(result), /secret-token/);
    assert.ok(calls.length > 0);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('syncs waiting role acceptance labels distinctly from active work', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-label-sync-waiting-role-'));
  try {
    await writeFile(path.join(projectPath, '.env.forge'), [
      'TASK_SOURCE_TYPE=gitlab',
      'TASK_SOURCE_URL=https://gitlab.example.local/group/project',
      'TASK_SOURCE_TOKEN=secret-token'
    ].join('\n'));

    const result = await syncTaskLabels({
      projectPath,
      run: {
        status: 'awaiting_role_acceptance',
        current_role: 'business-analyst',
        task_source: {
          type: 'gitlab',
          task_id: '123',
          source_url: 'https://gitlab.example.local/group/project'
        }
      },
      fetchImpl: async (url, options = {}) => {
        if (url.endsWith('/issues/123') && (!options.method || options.method === 'GET')) {
          return jsonResponse({ labels: ['forge:running', 'forge-role:context-router', 'customer'] });
        }
        if (url.endsWith('/labels') && options.method === 'POST') {
          return jsonResponse({ name: JSON.parse(options.body).name }, 201);
        }
        if (url.endsWith('/issues/123') && options.method === 'PUT') {
          return jsonResponse({ labels: JSON.parse(options.body).labels });
        }
        throw new Error(`unexpected url: ${url}`);
      }
    });

    assert.equal(result.skipped, false);
    assert.deepEqual(result.desiredLabels, ['forge', 'forge:waiting-role', 'forge-role:business-analyst']);
    assert.deepEqual(result.appliedLabels, ['customer', 'forge', 'forge:waiting-role', 'forge-role:business-analyst']);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('preflights initial task-backed GitLab labels before run creation', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-label-preflight-'));
  const calls = [];
  try {
    await writeFile(path.join(projectPath, '.env.forge'), [
      'TASK_SOURCE_TYPE=gitlab',
      'TASK_SOURCE_URL=https://gitlab.example.local/group/project',
      'TASK_SOURCE_TOKEN=secret-token'
    ].join('\n'));

    const result = await preflightTaskLabelSync({
      projectPath,
      taskId: '#123',
      fetchImpl: async (url, options = {}) => {
        calls.push({ url, options });
        if (url.endsWith('/issues/123') && (!options.method || options.method === 'GET')) {
          return jsonResponse({ labels: ['forge', 'customer'] });
        }
        if (url.endsWith('/labels') && options.method === 'POST') {
          return jsonResponse({ name: JSON.parse(options.body).name }, 201);
        }
        if (url.endsWith('/issues/123') && options.method === 'PUT') {
          return jsonResponse({ labels: JSON.parse(options.body).labels });
        }
        throw new Error(`unexpected url: ${url}`);
      }
    });

    assert.equal(result.skipped, false);
    assert.equal(result.task_id, '123');
    assert.deepEqual(result.desiredLabels, ['forge', 'forge:running', 'forge-role:context-router']);
    assert.deepEqual(result.appliedLabels, ['customer', 'forge', 'forge:running', 'forge-role:context-router']);
    assert.deepEqual(
      calls.filter((call) => call.options.method === 'POST').map((call) => JSON.parse(call.options.body).name),
      ['forge', 'forge:running', 'forge-role:context-router']
    );
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('redacts token values from sync errors', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-label-sync-error-'));
  try {
    await writeFile(path.join(projectPath, '.env.forge'), [
      'TASK_SOURCE_TYPE=gitlab',
      'TASK_SOURCE_URL=https://gitlab.example.local/group/project',
      'TASK_SOURCE_TOKEN=secret-token'
    ].join('\n'));

    await assert.rejects(
      () => syncTaskLabels({
        projectPath,
        run: {
          status: 'awaiting_role_output',
          current_role: 'context-router',
          task_source: {
            type: 'gitlab',
            task_id: '123',
            source_url: 'https://gitlab.example.local/group/project'
          }
        },
        fetchImpl: async () => {
          throw new Error('request failed for secret-token');
        }
      }),
      (error) => {
        assert.match(error.message, /request failed for \[redacted\]/);
        assert.doesNotMatch(error.message, /secret-token/);
        return true;
      }
    );
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('redacts token values from timed sync errors', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-label-sync-timeout-'));
  try {
    await writeFile(path.join(projectPath, '.env.forge'), [
      'TASK_SOURCE_TYPE=gitlab',
      'TASK_SOURCE_URL=https://gitlab.example.local/group/project',
      'TASK_SOURCE_TOKEN=secret-token',
      'TASK_SOURCE_REQUEST_TIMEOUT_MS=5'
    ].join('\n'));

    await assert.rejects(
      () => syncTaskLabels({
        projectPath,
        run: {
          status: 'awaiting_role_output',
          current_role: 'context-router',
          task_source: {
            type: 'gitlab',
            task_id: '123',
            source_url: 'https://gitlab.example.local/group/project'
          }
        },
        fetchImpl: async (_url, options = {}) => new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('request failed for secret-token'), { name: 'AbortError' }));
          });
        })
      }),
      (error) => {
        assert.match(error.message, /GET issue #123 timed out after 5ms/);
        assert.doesNotMatch(error.message, /secret-token/);
        return true;
      }
    );
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 || status === 201 ? 'OK' : 'Error',
    async json() {
      return body;
    }
  };
}
