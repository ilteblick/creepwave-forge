import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  commitScopedPaths,
  createAndCheckoutBranch,
  createRunBranchName,
  getCurrentBranch,
  isGitWorktree,
  slugifyBranchSegment
} from '../runtime/git/git-workflow.mjs';

const execFileAsync = promisify(execFile);

test('detects non-git project paths without failing', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'forge-git-'));
  try {
    assert.equal(await isGitWorktree(projectRoot), false);
    assert.equal(await getCurrentBranch(projectRoot), null);
    assert.deepEqual(await commitScopedPaths({
      projectRoot,
      paths: ['forge/active-run.json'],
      message: 'forge: publish state'
    }), {
      committed: false,
      skipped: true,
      reason: 'not_git_worktree'
    });
    assert.deepEqual(await createAndCheckoutBranch({
      projectRoot,
      branch: 'forge/run/build-filters-run-1'
    }), {
      created: false,
      skipped: true,
      reason: 'not_git_worktree'
    });
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('creates and checks out a run branch', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'forge-git-'));
  try {
    await initRepo(projectRoot);
    await git(projectRoot, ['commit', '--allow-empty', '-m', 'initial']);

    const branch = createRunBranchName({
      userPrompt: 'Build filters!',
      runId: '20260510123000-a1b2c3'
    });
    const created = await createAndCheckoutBranch({ projectRoot, branch });

    assert.equal(created.created, true);
    assert.equal(created.branch, 'forge/run/build-filters-20260510123000-a1b2c3');
    assert.equal(await getCurrentBranch(projectRoot), created.branch);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('preserves duplicate branch failures from git', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'forge-git-'));
  try {
    await initRepo(projectRoot);
    await git(projectRoot, ['commit', '--allow-empty', '-m', 'initial']);
    const branch = 'forge/run/build-filters-run-1';

    await createAndCheckoutBranch({ projectRoot, branch });
    await git(projectRoot, ['switch', 'main']);

    await assert.rejects(
      () => createAndCheckoutBranch({ projectRoot, branch }),
      /already exists|fatal/i
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('slugifies prompts into bounded branch-safe segments', () => {
  assert.equal(slugifyBranchSegment('Build filters! API + UI'), 'build-filters-api-ui');
  assert.equal(slugifyBranchSegment(' Привет мир '), 'run');
  assert.equal(slugifyBranchSegment('___'), 'run');
  assert.equal(slugifyBranchSegment('a'.repeat(80)), 'a'.repeat(48));
  assert.equal(
    createRunBranchName({ userPrompt: 'Build filters!', runId: 'run-1' }),
    'forge/run/build-filters-run-1'
  );
});

test('creates task-derived run branch names from explicit slugs', () => {
  assert.equal(
    createRunBranchName({
      userPrompt: 'Route this tracker task through Creepwave Forge.',
      branchSlug: 'task-123-Add export!',
      runId: 'run-1'
    }),
    'forge/run/task-123-add-export-run-1'
  );
  assert.equal(
    createRunBranchName({
      userPrompt: 'Build filters!',
      branchSlug: `task-123-${'a'.repeat(80)}`,
      runId: 'run-1'
    }),
    `forge/run/${'task-123-' + 'a'.repeat(39)}-run-1`
  );
  assert.equal(
    createRunBranchName({
      userPrompt: 'Build filters!',
      runId: 'run-1'
    }),
    'forge/run/build-filters-run-1'
  );
});

test('creates a scoped commit and no-ops when nothing is staged', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'forge-git-'));
  try {
    await initRepo(projectRoot);
    await mkdir(path.join(projectRoot, 'forge'), { recursive: true });
    await writeFile(path.join(projectRoot, 'forge', 'active-run.json'), '{"run_id":"run-1"}\n', 'utf8');

    assert.equal(await isGitWorktree(projectRoot), true);
    assert.equal(await getCurrentBranch(projectRoot), 'main');

    const committed = await commitScopedPaths({
      projectRoot,
      paths: ['forge/active-run.json'],
      message: 'forge: publish state'
    });
    assert.equal(committed.committed, true);
    assert.match(committed.commit, /^[0-9a-f]{7,40}$/);

    const latestMessage = await git(projectRoot, ['log', '-1', '--pretty=%s']);
    assert.equal(latestMessage.trim(), 'forge: publish state');
    const committedFile = await readFile(path.join(projectRoot, 'forge', 'active-run.json'), 'utf8');
    assert.match(committedFile, /run-1/);

    const clean = await commitScopedPaths({
      projectRoot,
      paths: ['forge/active-run.json'],
      message: 'forge: publish state again'
    });
    assert.equal(clean.committed, false);
    assert.equal(clean.reason, 'nothing_to_commit');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

async function initRepo(projectRoot) {
  await git(projectRoot, ['init', '-b', 'main']);
  await git(projectRoot, ['config', 'user.email', 'forge@example.test']);
  await git(projectRoot, ['config', 'user.name', 'Forge Test']);
}

async function git(cwd, args) {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout;
}
