import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { RunStore } from '../runtime/run-store.mjs';

test('creates project-scoped run layout with context-router as current role', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'forge-run-store-'));
  try {
    const store = new RunStore({ projectRoot });
    const run = await store.createRun({ userPrompt: 'Build status filters' });

    assert.equal(run.current_role, 'context-router');
    assert.equal(run.status, 'awaiting_role_output');
    assert.match(store.getRunDir(run.run_id), /forge[\\/]runs/);

    for (const dir of [
      'context',
      'steps',
      'handoffs',
      'artifacts',
      'approvals',
      'revision-requests',
      'clarifications',
      'consultations',
      'timeline'
    ]) {
      const dirStat = await stat(path.join(store.getRunDir(run.run_id), dir));
      assert.equal(dirStat.isDirectory(), true, `${dir} should exist`);
    }

    const loaded = await store.loadRun(run.run_id);
    assert.equal(loaded.user_prompt, 'Build status filters');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('persists task source metadata during initial run creation', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'forge-run-store-task-'));
  try {
    const store = new RunStore({ projectRoot });
    const taskSource = {
      type: 'gitlab',
      task_id: '123',
      task_url: 'https://gitlab.example.local/group/project/-/issues/123',
      source_url: 'https://gitlab.example.local/group/project'
    };
    const run = await store.createRun({
      userPrompt: 'Build from task',
      taskSource
    });

    const persistedText = await readFile(path.join(store.getRunDir(run.run_id), 'run.json'), 'utf8');
    const persistedRun = JSON.parse(persistedText);

    assert.deepEqual(run.task_source, taskSource);
    assert.deepEqual(persistedRun.task_source, taskSource);
    assert.doesNotMatch(persistedText, /TASK_SOURCE_TOKEN|secret-token/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('persists step, handoff, approval, revision, and clarification records', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'forge-run-store-'));
  try {
    const store = new RunStore({ projectRoot });
    const run = await store.createRun({ userPrompt: 'Build status filters' });
    run.step_index = 1;

    const stepPath = await store.saveStepOutput(run, {
      role: 'context-router',
      status: 'handoff_ready'
    });
    const handoffPath = await store.saveHandoff(run, {
      source_role: 'context-router',
      target_role: 'business-analyst'
    });
    const approvalPath = await store.saveApproval(run, {
      action: 'approved',
      note: 'Looks fine.'
    });
    const revisionPath = await store.saveRevisionRequest(run, 'Tighten the scope.');
    const clarificationPath = await store.saveClarification(run.run_id, 'Use admin users.');

    for (const filePath of [stepPath, handoffPath, approvalPath, revisionPath, clarificationPath]) {
      const text = await readFile(filePath, 'utf8');
      assert.ok(text.trim().length > 0);
    }

    assert.deepEqual(await store.listStepFiles(run.run_id), ['001-context-router.json']);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('loads saved context snapshot as project-context-shaped data', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'forge-run-store-'));
  try {
    const store = new RunStore({ projectRoot });
    const run = await store.createRun({
      userPrompt: 'Build status filters',
      contextSnapshot: [
        '# Project Root',
        projectRoot,
        '',
        '---',
        '',
        '# Project Agent File: AGENTS.md',
        `Source: ${path.join(projectRoot, 'AGENTS.md')}`,
        '',
        'Root rules',
        '',
        '---',
        '',
        '# Project Agent File: apps/api/AGENTS.md',
        `Source: ${path.join(projectRoot, 'apps', 'api', 'AGENTS.md')}`,
        '',
        'API rules'
      ].join('\n')
    });

    const context = await store.loadContextSnapshot(run);

    assert.equal(context.projectRoot, projectRoot);
    assert.equal(context.source, 'saved-snapshot');
    assert.equal(context.snapshotPath, 'context/project-context.md');
    assert.deepEqual(
      context.files.map((file) => file.relativePath),
      ['AGENTS.md', 'apps/api/AGENTS.md']
    );
    assert.match(context.text, /Root rules/);
    assert.match(context.text, /API rules/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('saves and loads active run manifest from the project forge directory', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'forge-run-store-'));
  try {
    const store = new RunStore({ projectRoot });
    const run = await store.createRun({ userPrompt: 'Build status filters' });
    run.step_index = 2;
    run.status = 'awaiting_approval';

    const manifest = await store.saveActiveRunManifest(run, { branch: 'forge/run/status-filters' });
    const loaded = await store.loadActiveRunManifest();

    assert.equal(manifest.run_id, run.run_id);
    assert.equal(manifest.status, 'awaiting_approval');
    assert.equal(manifest.current_role, 'context-router');
    assert.equal(manifest.step_index, 2);
    assert.equal(manifest.branch, 'forge/run/status-filters');
    assert.equal(manifest.run_dir, `forge/runs/${run.run_id}`);
    assert.match(manifest.updated_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(loaded, manifest);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
