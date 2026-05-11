import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const defaultSlugMaxLength = 48;

export async function isGitWorktree(projectRoot) {
  const result = await git(projectRoot, ['rev-parse', '--is-inside-work-tree'], { reject: false });
  return result.code === 0 && result.stdout.trim() === 'true';
}

export async function getCurrentBranch(projectRoot) {
  if (!await isGitWorktree(projectRoot)) {
    return null;
  }

  const result = await git(projectRoot, ['branch', '--show-current'], { reject: false });
  if (result.code !== 0) {
    return null;
  }

  return result.stdout.trim() || 'HEAD';
}

export async function createAndCheckoutBranch({ projectRoot, branch }) {
  if (!projectRoot || typeof projectRoot !== 'string') {
    throw new Error('projectRoot is required');
  }
  if (!branch || typeof branch !== 'string') {
    throw new Error('branch is required');
  }

  if (!await isGitWorktree(projectRoot)) {
    return {
      created: false,
      skipped: true,
      reason: 'not_git_worktree'
    };
  }

  await validateBranchName(projectRoot, branch);
  await git(projectRoot, ['switch', '-c', branch]);

  return {
    created: true,
    skipped: false,
    branch
  };
}

export function createRunBranchName({ userPrompt, runId, branchSlug }) {
  if (!runId || typeof runId !== 'string') {
    throw new Error('runId is required');
  }

  return `forge/run/${slugifyBranchSegment(branchSlug ?? userPrompt)}-${runId}`;
}

export function slugifyBranchSegment(value, { maxLength = defaultSlugMaxLength } = {}) {
  const slug = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, maxLength)
    .replace(/-+$/g, '');

  return slug || 'run';
}

export async function commitScopedPaths({ projectRoot, paths, message }) {
  if (!projectRoot || typeof projectRoot !== 'string') {
    throw new Error('projectRoot is required');
  }
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('paths must be a non-empty array');
  }
  if (!message || typeof message !== 'string') {
    throw new Error('message is required');
  }

  if (!await isGitWorktree(projectRoot)) {
    return {
      committed: false,
      skipped: true,
      reason: 'not_git_worktree'
    };
  }

  await git(projectRoot, ['add', '--', ...paths]);

  const diff = await git(projectRoot, ['diff', '--cached', '--quiet'], { reject: false });
  if (diff.code === 0) {
    return {
      committed: false,
      skipped: true,
      reason: 'nothing_to_commit'
    };
  }
  if (diff.code !== 1) {
    throw new Error(`git diff --cached failed: ${diff.stderr.trim() || diff.stdout.trim()}`);
  }

  await git(projectRoot, ['commit', '-m', message]);
  const commit = await git(projectRoot, ['rev-parse', 'HEAD']);

  return {
    committed: true,
    skipped: false,
    commit: commit.stdout.trim()
  };
}

async function validateBranchName(projectRoot, branch) {
  const result = await git(projectRoot, ['check-ref-format', '--branch', branch], { reject: false });
  if (result.code !== 0) {
    throw new Error(`Invalid git branch name "${branch}": ${result.stderr.trim() || result.stdout.trim()}`);
  }
}

async function git(cwd, args, { reject = true } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, { cwd });
    return {
      code: 0,
      stdout,
      stderr
    };
  } catch (error) {
    if (reject) {
      throw error;
    }

    return {
      code: error.code ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? error.message
    };
  }
}
