import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchGitLabTask,
  parseGitLabProjectUrl,
  normalizeGitLabIssueIid,
  syncGitLabTaskLabels
} from '../runtime/tasks/task-source-gitlab.mjs';

test('parses root-hosted GitLab project URLs', () => {
  assert.deepEqual(parseGitLabProjectUrl('https://gitlab.example.local/group/sub/project'), {
    apiBaseUrl: 'https://gitlab.example.local/api/v4',
    projectPath: 'group/sub/project',
    encodedProjectPath: 'group%2Fsub%2Fproject'
  });
});

test('parses GitLab project URLs hosted under a prefix', () => {
  assert.deepEqual(parseGitLabProjectUrl('https://company.local/gitlab/group/project'), {
    apiBaseUrl: 'https://company.local/gitlab/api/v4',
    projectPath: 'group/project',
    encodedProjectPath: 'group%2Fproject'
  });
});

test('normalizes GitLab issue iid input', () => {
  assert.equal(normalizeGitLabIssueIid('#123'), '123');
  assert.equal(normalizeGitLabIssueIid('123'), '123');
  assert.throws(() => normalizeGitLabIssueIid('ABC-123'), /GitLab task id must be an issue iid/);
});

test('fetches GitLab issue and notes without leaking token', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/issues/123')) {
      return jsonResponse({
        iid: 123,
        title: 'Add export',
        description: 'Export reports to Excel.',
        web_url: 'https://gitlab.example.local/group/project/-/issues/123',
        labels: ['forge', 'forge:ready'],
        state: 'opened',
        author: { username: 'alice' },
        created_at: '2026-05-10T10:00:00.000Z',
        updated_at: '2026-05-10T11:00:00.000Z'
      });
    }
    if (url.endsWith('/issues/123/notes')) {
      return jsonResponse([
        {
          id: 1,
          body: 'Please include current filters.',
          author: { username: 'bob' },
          created_at: '2026-05-10T11:30:00.000Z',
          system: false
        },
        {
          id: 2,
          body: 'changed label',
          author: { username: 'system' },
          created_at: '2026-05-10T11:40:00.000Z',
          system: true
        }
      ]);
    }
    throw new Error(`unexpected url: ${url}`);
  };

  const task = await fetchGitLabTask({
    config: {
      type: 'gitlab',
      url: 'https://gitlab.example.local/group/project',
      token: 'secret-token'
    },
    taskId: '#123',
    fetchImpl
  });

  assert.equal(task.source.type, 'gitlab');
  assert.equal(task.id, '123');
  assert.equal(task.title, 'Add export');
  assert.deepEqual(task.labels, ['forge', 'forge:ready']);
  assert.equal(task.comments.length, 1);
  assert.equal(task.comments[0].body, 'Please include current filters.');
  assert.equal(calls[0].options.headers['PRIVATE-TOKEN'], 'secret-token');
  assert.doesNotMatch(JSON.stringify(task), /secret-token/);
});

test('syncs GitLab labels by creating missing labels and preserving unrelated labels', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/issues/123') && (!options.method || options.method === 'GET')) {
      return jsonResponse({
        iid: 123,
        labels: ['customer', 'forge:ready', 'forge-role:frontend-engineer']
      });
    }
    if (url.endsWith('/labels') && options.method === 'POST') {
      return jsonResponse({ name: JSON.parse(options.body).name }, 201);
    }
    if (url.endsWith('/issues/123') && options.method === 'PUT') {
      return jsonResponse({
        labels: JSON.parse(options.body).labels
      });
    }
    throw new Error(`unexpected url: ${url}`);
  };

  const result = await syncGitLabTaskLabels({
    config: {
      type: 'gitlab',
      url: 'https://gitlab.example.local/group/project',
      token: 'secret-token'
    },
    taskId: '123',
    desiredLabels: ['forge', 'forge:running', 'forge-role:backend-engineer'],
    fetchImpl
  });

  assert.deepEqual(result.labels, ['customer', 'forge', 'forge:running', 'forge-role:backend-engineer']);
  assert.deepEqual(
    calls.filter((call) => call.options.method === 'POST').map((call) => JSON.parse(call.options.body).name),
    ['forge', 'forge:running', 'forge-role:backend-engineer']
  );
  const updateCall = calls.find((call) => call.options.method === 'PUT');
  assert.deepEqual(JSON.parse(updateCall.options.body).labels, result.labels);
  assert.doesNotMatch(JSON.stringify(result), /secret-token/);
});

test('ignores already-existing GitLab label create conflicts', async () => {
  const fetchImpl = async (url, options = {}) => {
    if (url.endsWith('/issues/123') && (!options.method || options.method === 'GET')) {
      return jsonResponse({ iid: 123, labels: [] });
    }
    if (url.endsWith('/labels') && options.method === 'POST') {
      return jsonResponse({ message: 'Label already exists' }, 409);
    }
    if (url.endsWith('/issues/123') && options.method === 'PUT') {
      return jsonResponse({ labels: JSON.parse(options.body).labels });
    }
    throw new Error(`unexpected url: ${url}`);
  };

  const result = await syncGitLabTaskLabels({
    config: {
      type: 'gitlab',
      url: 'https://gitlab.example.local/group/project',
      token: 'secret-token'
    },
    taskId: '#123',
    desiredLabels: ['forge'],
    fetchImpl
  });

  assert.deepEqual(result.labels, ['forge']);
});

test('times out GitLab issue fetches with operation context', async () => {
  await assert.rejects(
    () => fetchGitLabTask({
      config: {
        type: 'gitlab',
        url: 'https://gitlab.example.local/group/project',
        token: 'secret-token',
        requestTimeoutMs: 5
      },
      taskId: '#123',
      fetchImpl: neverSettlingFetch
    }),
    /GET issue #123 timed out after 5ms/
  );
});

test('times out GitLab label updates with operation context', async () => {
  const fetchImpl = async (url, options = {}) => {
    if (url.endsWith('/issues/123') && (!options.method || options.method === 'GET')) {
      return jsonResponse({ iid: 123, labels: ['forge'] });
    }
    if (url.endsWith('/labels') && options.method === 'POST') {
      return jsonResponse({ name: JSON.parse(options.body).name }, 201);
    }
    if (url.endsWith('/issues/123') && options.method === 'PUT') {
      return neverSettlingFetch(url, options);
    }
    throw new Error(`unexpected url: ${url}`);
  };

  await assert.rejects(
    () => syncGitLabTaskLabels({
      config: {
        type: 'gitlab',
        url: 'https://gitlab.example.local/group/project',
        token: 'secret-token',
        requestTimeoutMs: 5
      },
      taskId: '#123',
      desiredLabels: ['forge', 'forge:running'],
      fetchImpl
    }),
    /PUT issue #123 labels timed out after 5ms/
  );
});

test('preserves GitLab HTTP error messages under timeout wrapper', async () => {
  await assert.rejects(
    () => fetchGitLabTask({
      config: {
        type: 'gitlab',
        url: 'https://gitlab.example.local/group/project',
        token: 'secret-token',
        requestTimeoutMs: 5
      },
      taskId: '#404',
      fetchImpl: async () => jsonResponse({}, 404)
    }),
    /GitLab task #404 was not found/
  );
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    async json() {
      return body;
    }
  };
}

function neverSettlingFetch(_url, options = {}) {
  return new Promise((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    });
  });
}
