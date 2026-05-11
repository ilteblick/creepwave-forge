import assert from 'node:assert/strict';
import test from 'node:test';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { callTool, handleRequest } from '../scripts/forge-mcp-server.mjs';

const execFileAsync = promisify(execFile);

function textOf(result) {
  return result.content[0].text;
}

function extractRunId(text) {
  const match = text.match(/Run ID: ([^\n]+)/);
  assert.ok(match, `Run ID not found in:\n${text}`);
  return match[1].trim();
}

function validRouterStep() {
  return {
    role: 'context-router',
    status: 'handoff_ready',
    artifact_type: 'selected-role',
    artifact: 'Selected Role: business-analyst',
    transition: {
      type: 'handoff',
      target_role: 'business-analyst'
    },
    handoff: {
      source_role: 'context-router',
      target_role: 'business-analyst',
      goal: 'Build from tracker task',
      scope: 'Route to requirements.',
      confirmed: ['Tracker task was loaded.'],
      decisions: [],
      assumptions: [],
      open_questions: [],
      risks: [],
      artifacts: [],
      next_action: 'Draft requirements.'
    }
  };
}

function clarificationStep() {
  return {
    role: 'business-analyst',
    status: 'needs_clarification',
    artifact_type: 'clarification',
    artifact: 'Need export column list.',
    transition: {
      type: 'clarification_request',
      questions: ['Which columns should be exported?']
    },
    handoff: {
      source_role: 'business-analyst',
      target_role: 'business-analyst',
      goal: 'Clarify export scope.',
      scope: 'Requirements clarification.',
      confirmed: [],
      decisions: [],
      assumptions: [],
      open_questions: ['Which columns should be exported?'],
      risks: [],
      artifacts: [],
      next_action: 'Answer clarification questions.'
    }
  };
}

function completeStep() {
  return {
    role: 'business-analyst',
    status: 'complete',
    artifact_type: 'requirements',
    artifact: 'Requirements are already clear and complete.',
    transition: {
      type: 'complete'
    },
    handoff: {
      source_role: 'business-analyst',
      target_role: 'business-analyst',
      goal: 'Finish requirements.',
      scope: 'No further role required.',
      confirmed: ['Requirements complete.'],
      decisions: [],
      assumptions: [],
      open_questions: [],
      risks: [],
      artifacts: [],
      next_action: 'No next action.'
    }
  };
}

test('tools/list exposes forge_run_task', async () => {
  const result = await handleRequest({ method: 'tools/list' });
  const taskTool = result.tools.find((tool) => tool.name === 'forge_run_task');

  assert.ok(taskTool);
  assert.deepEqual(taskTool.inputSchema.required, ['taskId', 'projectPath']);
});

test('forge_run_task fails clearly when .env.forge is missing', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-task-missing-env-'));
  try {
    await assert.rejects(
      () => callTool('forge_run_task', { projectPath, taskId: '#123' }),
      /Task source config not found/
    );
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('forge_run_task fails before side effects when GitLab task is missing', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-task-404-'));
  const originalFetch = globalThis.fetch;
  let labelWriteCount = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (url.endsWith('/issues/404') && (!options.method || options.method === 'GET')) {
      return jsonResponse({}, 404);
    }
    if (url.endsWith('/labels') || options.method === 'PUT') {
      labelWriteCount += 1;
    }
    throw new Error(`unexpected url: ${url}`);
  };

  try {
    await initRepo(projectPath);
    await writeForgeEnv(projectPath);

    await assert.rejects(
      () => callTool('forge_run_task', { projectPath, taskId: '#404' }),
      /GitLab task #404 was not found/
    );

    assert.equal(await currentBranch(projectPath), 'main');
    assert.equal(labelWriteCount, 0);
    await assertMissing(path.join(projectPath, 'forge', 'runs'));
    await assertMissing(path.join(projectPath, 'forge', 'active-run.json'));
  } finally {
    globalThis.fetch = originalFetch;
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('forge_run_task fails before side effects when task lacks forge label', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-task-unmarked-'));
  const originalFetch = globalThis.fetch;
  let labelWriteCount = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (url.endsWith('/issues/123') && (!options.method || options.method === 'GET')) {
      return jsonResponse({
        iid: 123,
        title: 'Add export',
        description: 'Export reports to Excel.',
        web_url: 'https://gitlab.example.local/group/project/-/issues/123',
        labels: ['backend'],
        state: 'opened',
        author: { username: 'alice' }
      });
    }
    if (url.endsWith('/issues/123/notes')) {
      return jsonResponse([]);
    }
    if (url.endsWith('/labels') || options.method === 'PUT') {
      labelWriteCount += 1;
      return jsonResponse({});
    }
    throw new Error(`unexpected url: ${url}`);
  };

  try {
    await initRepo(projectPath);
    await writeForgeEnv(projectPath);

    await assert.rejects(
      () => callTool('forge_run_task', { projectPath, taskId: '#123' }),
      /Tracker task 123 is not marked for Forge/
    );

    assert.equal(await currentBranch(projectPath), 'main');
    assert.equal(labelWriteCount, 0);
    await assertMissing(path.join(projectPath, 'forge', 'runs'));
    await assertMissing(path.join(projectPath, 'forge', 'active-run.json'));
  } finally {
    globalThis.fetch = originalFetch;
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('forge_run_task fails before side effects when GitLab preflight label update times out', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-task-preflight-timeout-'));
  const originalFetch = globalThis.fetch;
  let issueGetCount = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (url.endsWith('/issues/123') && (!options.method || options.method === 'GET')) {
      issueGetCount += 1;
      return jsonResponse({
        iid: 123,
        title: 'Add export',
        description: 'Export reports to Excel.',
        web_url: 'https://gitlab.example.local/group/project/-/issues/123',
        labels: ['forge', 'backend'],
        state: 'opened',
        author: { username: 'alice' }
      });
    }
    if (url.endsWith('/issues/123/notes')) {
      return jsonResponse([]);
    }
    if (url.endsWith('/labels') && options.method === 'POST') {
      return jsonResponse({ name: JSON.parse(options.body).name }, 201);
    }
    if (url.endsWith('/issues/123') && options.method === 'PUT') {
      return neverSettlingFetch(url, options);
    }
    throw new Error(`unexpected url: ${url}`);
  };

  try {
    await initRepo(projectPath);
    await writeForgeEnv(projectPath, ['TASK_SOURCE_REQUEST_TIMEOUT_MS=5']);

    await assert.rejects(
      () => callTool('forge_run_task', { projectPath, taskId: '#123' }),
      /PUT issue #123 labels timed out after 5ms/
    );

    assert.equal(issueGetCount, 2);
    assert.equal(await currentBranch(projectPath), 'main');
    assert.equal(await commitCount(projectPath), '1');
    await assertMissing(path.join(projectPath, 'forge', 'runs'));
    await assertMissing(path.join(projectPath, 'forge', 'active-run.json'));
  } finally {
    globalThis.fetch = originalFetch;
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('forge_run_task starts a run from a mocked GitLab task and status shows board labels', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-task-mcp-'));
  const originalFetch = globalThis.fetch;
  let issueLabels = ['forge', 'forge:ready'];
  globalThis.fetch = async (url, options = {}) => {
    if (url.endsWith('/issues/123') && (!options.method || options.method === 'GET')) {
      return jsonResponse({
        iid: 123,
        title: 'Add export',
        description: 'Export reports to Excel.',
        web_url: 'https://gitlab.example.local/group/project/-/issues/123',
        labels: issueLabels,
        state: 'opened',
        author: { username: 'alice' }
      });
    }
    if (url.endsWith('/labels') && options.method === 'POST') {
      return jsonResponse({ name: JSON.parse(options.body).name }, 201);
    }
    if (url.endsWith('/issues/123') && options.method === 'PUT') {
      issueLabels = JSON.parse(options.body).labels;
      return jsonResponse({ labels: issueLabels });
    }
    if (url.endsWith('/issues/123/notes')) {
      return jsonResponse([]);
    }
    throw new Error(`unexpected url: ${url}`);
  };

  try {
    await writeFile(path.join(projectPath, '.env.forge'), [
      'TASK_SOURCE_TYPE=gitlab',
      'TASK_SOURCE_URL=https://gitlab.example.local/group/project',
      'TASK_SOURCE_TOKEN=secret-token'
    ].join('\n'));

    const started = await callTool('forge_run_task', { projectPath, taskId: '#123' });
    const startedText = textOf(started);
    const runId = extractRunId(startedText);
    const runJson = await readFile(path.join(projectPath, 'forge', 'runs', runId, 'run.json'), 'utf8');
    const activeRunJson = await readFile(path.join(projectPath, 'forge', 'active-run.json'), 'utf8');

    assert.match(startedText, /# Forge Task Run Started/);
    assert.match(startedText, /Source Type: gitlab/);
    assert.match(startedText, /Title: Add export/);
    assert.match(startedText, /Recommended Board Labels/);
    assert.match(startedText, /forge:running/);
    assert.match(startedText, /Tracker Label Sync/);
    assert.doesNotMatch(startedText, /secret-token/);
    assert.match(runJson, /"task_source"/);
    assert.match(runJson, /"task_id": "123"/);
    assert.doesNotMatch(runJson, /secret-token/);
    assert.doesNotMatch(activeRunJson, /secret-token/);
    assert.deepEqual(issueLabels, ['forge', 'forge:running', 'forge-role:context-router']);

    let status = await callTool('forge_status', { projectPath, runId });
    assert.match(textOf(status), /forge:running/);
    assert.match(textOf(status), /forge-role:context-router/);
    assert.deepEqual(issueLabels, ['forge', 'forge:running', 'forge-role:context-router']);

    await callTool('forge_submit_step', { projectPath, runId, stepOutput: validRouterStep() });
    status = await callTool('forge_status', { projectPath, runId });
    assert.match(textOf(status), /forge:waiting-approval/);
    assert.match(textOf(status), /forge-role:context-router/);
    assert.deepEqual(issueLabels, ['forge', 'forge:waiting-approval', 'forge-role:context-router']);

    await callTool('forge_approve', { projectPath, runId, humanApproval: 'approve' });
    assert.deepEqual(issueLabels, ['forge', 'forge:waiting-role', 'forge-role:business-analyst']);
    await callTool('forge_continue', { projectPath, runId });
    assert.deepEqual(issueLabels, ['forge', 'forge:running', 'forge-role:business-analyst']);
    await callTool('forge_submit_step', { projectPath, runId, stepOutput: clarificationStep() });
    assert.deepEqual(issueLabels, ['forge', 'forge:waiting-approval', 'forge-role:business-analyst']);
    await callTool('forge_approve', { projectPath, runId, humanApproval: 'approve' });
    status = await callTool('forge_status', { projectPath, runId });
    assert.match(textOf(status), /forge:needs-input/);
    assert.match(textOf(status), /forge-role:business-analyst/);
    assert.deepEqual(issueLabels, ['forge', 'forge:needs-input', 'forge-role:business-analyst']);

    await callTool('forge_answer', {
      projectPath,
      runId,
      answersText: 'Export all visible columns.'
    });
    assert.deepEqual(issueLabels, ['forge', 'forge:running', 'forge-role:business-analyst']);
    await callTool('forge_submit_step', { projectPath, runId, stepOutput: completeStep() });
    assert.deepEqual(issueLabels, ['forge', 'forge:waiting-approval', 'forge-role:business-analyst']);
    await callTool('forge_approve', { projectPath, runId, humanApproval: 'approve' });
    status = await callTool('forge_status', { projectPath, runId });
    assert.match(textOf(status), /forge:done/);
    assert.deepEqual(issueLabels, ['forge', 'forge:done']);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('forge_run_task creates a git branch from task id and title', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-task-branch-'));
  const originalFetch = globalThis.fetch;
  let issueLabels = ['forge', 'forge:ready'];
  globalThis.fetch = async (url, options = {}) => {
    if (url.endsWith('/issues/123') && (!options.method || options.method === 'GET')) {
      return jsonResponse({
        iid: 123,
        title: 'Add export',
        description: 'Export reports to Excel.',
        web_url: 'https://gitlab.example.local/group/project/-/issues/123',
        labels: issueLabels,
        state: 'opened',
        author: { username: 'alice' }
      });
    }
    if (url.endsWith('/labels') && options.method === 'POST') {
      return jsonResponse({ name: JSON.parse(options.body).name }, 201);
    }
    if (url.endsWith('/issues/123') && options.method === 'PUT') {
      issueLabels = JSON.parse(options.body).labels;
      return jsonResponse({ labels: issueLabels });
    }
    if (url.endsWith('/issues/123/notes')) {
      return jsonResponse([]);
    }
    throw new Error(`unexpected url: ${url}`);
  };

  try {
    await initRepo(projectPath);
    await writeForgeEnv(projectPath);

    const started = await callTool('forge_run_task', { projectPath, taskId: '#123' });
    const runId = extractRunId(textOf(started));
    const committedRunJson = await git(projectPath, ['show', `HEAD:forge/runs/${runId}/run.json`]);

    assert.equal(await currentBranch(projectPath), `forge/run/task-123-add-export-${runId}`);
    assert.match(committedRunJson, /"task_source"/);
    assert.match(committedRunJson, /"task_id": "123"/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('forge_sync_task retries task label sync without advancing workflow state', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-task-sync-retry-'));
  const originalFetch = globalThis.fetch;
  let issueLabels = ['forge', 'forge:ready'];
  globalThis.fetch = async (url, options = {}) => {
    if (url.endsWith('/issues/123') && (!options.method || options.method === 'GET')) {
      return jsonResponse({
        iid: 123,
        title: 'Add export',
        description: 'Export reports to Excel.',
        web_url: 'https://gitlab.example.local/group/project/-/issues/123',
        labels: issueLabels,
        state: 'opened',
        author: { username: 'alice' }
      });
    }
    if (url.endsWith('/labels') && options.method === 'POST') {
      return jsonResponse({ name: JSON.parse(options.body).name }, 201);
    }
    if (url.endsWith('/issues/123') && options.method === 'PUT') {
      issueLabels = JSON.parse(options.body).labels;
      return jsonResponse({ labels: issueLabels });
    }
    if (url.endsWith('/issues/123/notes')) {
      return jsonResponse([]);
    }
    throw new Error(`unexpected url: ${url}`);
  };

  try {
    await writeForgeEnv(projectPath);
    const started = await callTool('forge_run_task', { projectPath, taskId: '#123' });
    const runId = extractRunId(textOf(started));
    issueLabels = ['customer', 'forge:ready'];

    const synced = await callTool('forge_sync_task', { projectPath, runId });
    const syncedText = textOf(synced);
    const runJson = JSON.parse(await readFile(path.join(projectPath, 'forge', 'runs', runId, 'run.json'), 'utf8'));

    assert.match(syncedText, /# Forge Task Labels Synced/);
    assert.match(syncedText, /Workflow state was not advanced/);
    assert.match(syncedText, /Applied Labels: customer, forge, forge:running, forge-role:context-router/);
    assert.equal(runJson.status, 'awaiting_role_output');
    assert.equal(runJson.step_index, 0);
    assert.equal(runJson.tracker_sync.status, 'synced');
    assert.deepEqual(issueLabels, ['customer', 'forge', 'forge:running', 'forge-role:context-router']);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('forge_sync_task reports retryable redacted failures', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-task-sync-retry-fail-'));
  const originalFetch = globalThis.fetch;
  let failSync = false;
  globalThis.fetch = async (url, options = {}) => {
    if (failSync) {
      throw new Error('GitLab rejected secret-token');
    }
    if (url.endsWith('/issues/123') && (!options.method || options.method === 'GET')) {
      return jsonResponse({
        iid: 123,
        title: 'Add export',
        description: 'Export reports to Excel.',
        web_url: 'https://gitlab.example.local/group/project/-/issues/123',
        labels: ['forge'],
        state: 'opened',
        author: { username: 'alice' }
      });
    }
    if (url.endsWith('/labels') && options.method === 'POST') {
      return jsonResponse({ name: JSON.parse(options.body).name }, 201);
    }
    if (url.endsWith('/issues/123') && options.method === 'PUT') {
      return jsonResponse({ labels: JSON.parse(options.body).labels });
    }
    if (url.endsWith('/issues/123/notes')) {
      return jsonResponse([]);
    }
    throw new Error(`unexpected url: ${url}`);
  };

  try {
    await writeForgeEnv(projectPath);
    const started = await callTool('forge_run_task', { projectPath, taskId: '#123' });
    const runId = extractRunId(textOf(started));
    failSync = true;

    const synced = await callTool('forge_sync_task', { projectPath, runId });
    const syncedText = textOf(synced);
    const runJson = JSON.parse(await readFile(path.join(projectPath, 'forge', 'runs', runId, 'run.json'), 'utf8'));

    assert.match(syncedText, /Failed: GitLab rejected \[redacted\]/);
    assert.match(syncedText, /Retryable: yes/);
    assert.doesNotMatch(syncedText, /secret-token/);
    assert.equal(runJson.tracker_sync.status, 'failed');
    assert.match(runJson.tracker_sync.error, /GitLab rejected \[redacted\]/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('forge_status shows done label for completed task runs', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-task-done-'));
  try {
    const started = await callTool('forge_run', {
      projectPath,
      prompt: 'Build export requirements'
    });
    const runId = extractRunId(textOf(started));
    await callTool('forge_submit_step', { projectPath, runId, stepOutput: validRouterStep() });
    await callTool('forge_approve', { projectPath, runId, humanApproval: 'approve' });
    await callTool('forge_continue', { projectPath, runId });
    await callTool('forge_submit_step', { projectPath, runId, stepOutput: completeStep() });
    await callTool('forge_approve', { projectPath, runId, humanApproval: 'approve' });

    const status = await callTool('forge_status', { projectPath, runId });
    assert.match(textOf(status), /forge:done/);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('plain forge_run does not require .env.forge or attempt tracker writes', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-plain-no-sync-'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('fetch should not be called for plain runs');
  };

  try {
    const started = await callTool('forge_run', {
      projectPath,
      prompt: 'Build export requirements'
    });
    const startedText = textOf(started);
    const runId = extractRunId(startedText);

    assert.match(startedText, /Tracker Label Sync/);
    assert.match(startedText, /Skipped: run is not task-backed/);

    const status = await callTool('forge_status', { projectPath, runId });
    assert.match(textOf(status), /Skipped: run is not task-backed/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(projectPath, { recursive: true, force: true });
  }
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

async function writeForgeEnv(projectPath, extraLines = []) {
  await writeFile(path.join(projectPath, '.env.forge'), [
    'TASK_SOURCE_TYPE=gitlab',
    'TASK_SOURCE_URL=https://gitlab.example.local/group/project',
    'TASK_SOURCE_TOKEN=secret-token',
    ...extraLines
  ].join('\n'));
}

async function assertMissing(filePath) {
  await assert.rejects(
    () => access(filePath),
    /ENOENT/
  );
}

async function initRepo(projectPath) {
  await git(projectPath, ['init', '-b', 'main']);
  await git(projectPath, ['config', 'user.email', 'forge@example.test']);
  await git(projectPath, ['config', 'user.name', 'Forge Test']);
  await git(projectPath, ['commit', '--allow-empty', '-m', 'initial']);
}

async function currentBranch(projectPath) {
  return (await git(projectPath, ['branch', '--show-current'])).trim();
}

async function commitCount(projectPath) {
  return (await git(projectPath, ['rev-list', '--count', 'HEAD'])).trim();
}

async function git(cwd, args) {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout;
}

function neverSettlingFetch(_url, options = {}) {
  return new Promise((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    });
  });
}
