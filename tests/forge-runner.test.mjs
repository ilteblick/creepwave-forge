import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  answerClarification,
  approveStep,
  continueRun,
  getStatus,
  requestChanges,
  startRun,
  submitStep
} from '../runtime/forge-runner.mjs';

const execFileAsync = promisify(execFile);

function handoff({ source = 'context-router', target = 'business-analyst', artifacts = [] } = {}) {
  return {
    source_role: source,
    target_role: target,
    goal: 'Build filters',
    scope: 'Route work',
    confirmed: ['User asked for filters.'],
    decisions: [],
    assumptions: [],
    open_questions: [],
    risks: [],
    artifacts,
    next_action: 'Do the next role work.'
  };
}

function stepOutput({ role = 'context-router', target = 'business-analyst', transitionType = 'handoff', status = 'handoff_ready' } = {}) {
  return {
    role,
    status,
    artifact_type: role === 'context-router' ? 'selected-role' : 'requirements',
    artifact: 'Selected Role: business-analyst',
    transition: {
      type: transitionType,
      ...(target ? { target_role: target } : {})
    },
    handoff: handoff({ source: role, target })
  };
}

async function readTimelineStepFile(runDir, stepKey, fileName) {
  return readFile(path.join(runDir, 'timeline', stepKey, fileName), 'utf8');
}

test('starts with context-router and submitStep waits for approval before handoff', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-runner-'));
  try {
    const started = await startRun({ projectPath, userPrompt: 'Build filters' });
    assert.equal(started.run.current_role, 'context-router');
    assert.equal(started.rolePacket.active_role, 'context-router');
    assert.equal(started.rolePacket.project_context.source, 'saved-snapshot');
    assert.equal(started.rolePacket.role_context.full_context_path, 'context/project-context.md');
    let runReadme = await readFile(path.join(started.runDir, 'README.md'), 'utf8');
    assert.match(runReadme, /# Forge Run /);
    assert.match(runReadme, /Prompt: Build filters/);
    assert.match(runReadme, /Status: awaiting_role_output/);

    const submitted = await submitStep({
      projectPath,
      runId: started.run.run_id,
      stepOutput: stepOutput()
    });

    assert.equal(submitted.run.status, 'awaiting_approval');
    assert.equal(submitted.run.current_role, 'context-router');
    runReadme = await readFile(path.join(started.runDir, 'README.md'), 'utf8');
    assert.match(runReadme, /Status: awaiting_approval/);
    assert.match(runReadme, /`steps\/001-context-router\.json`/);
    assert.match(runReadme, /`artifacts\/001-context-router\.md`/);
    const manifest = JSON.parse(await readFile(
      path.join(started.runDir, 'timeline', '001-context-router', 'manifest.json'),
      'utf8'
    ));
    assert.equal(manifest.canonical_paths.step, 'steps/001-context-router.json');
    assert.deepEqual(manifest.canonical_paths.artifacts, [
      'artifacts/001-context-router.json',
      'artifacts/001-context-router.md'
    ]);
    assert.match(
      await readTimelineStepFile(started.runDir, '001-context-router', 'step.json'),
      /"role": "context-router"/
    );
    assert.match(
      await readTimelineStepFile(started.runDir, '001-context-router', 'artifact.md'),
      /Selected Role: business-analyst/
    );

    const approved = await approveStep({ projectPath, runId: started.run.run_id, note: 'Approved.' });
    assert.equal(approved.run.status, 'awaiting_role_acceptance');
    assert.equal(approved.run.current_role, 'business-analyst');
    assert.equal(approved.rolePacket, null);
    runReadme = await readFile(path.join(started.runDir, 'README.md'), 'utf8');
    assert.match(runReadme, /Current Role: business-analyst/);
    assert.match(runReadme, /Status: awaiting_role_acceptance/);
    assert.match(runReadme, /`approvals\/001-approved\.json`/);
    assert.match(
      await readTimelineStepFile(started.runDir, '001-context-router', 'approval.json'),
      /"action": "approved"/
    );

    const continued = await continueRun({ projectPath, runId: started.run.run_id });
    assert.equal(continued.run.status, 'awaiting_role_output');
    assert.equal(continued.rolePacket.active_role, 'business-analyst');
    runReadme = await readFile(path.join(started.runDir, 'README.md'), 'utf8');
    assert.match(runReadme, /Status: awaiting_role_output/);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('continued role packets use saved context snapshot when project files change', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-runner-'));
  try {
    await writeFile(path.join(projectPath, 'AGENTS.md'), 'Original project rules', 'utf8');
    const started = await startRun({ projectPath, userPrompt: 'Build filters' });
    await writeFile(path.join(projectPath, 'AGENTS.md'), 'Changed project rules', 'utf8');

    await submitStep({
      projectPath,
      runId: started.run.run_id,
      stepOutput: stepOutput()
    });
    await approveStep({ projectPath, runId: started.run.run_id, note: 'Approved.' });
    const continued = await continueRun({ projectPath, runId: started.run.run_id });

    assert.equal(continued.rolePacket.project_context.source, 'saved-snapshot');
    assert.equal(continued.rolePacket.role_context.full_context_path, 'context/project-context.md');
    assert.deepEqual(
      continued.rolePacket.role_context.files.map((file) => file.relativePath),
      ['AGENTS.md']
    );
    assert.match(continued.rolePacket.prompt, /Original project rules/);
    assert.doesNotMatch(continued.rolePacket.prompt, /Changed project rules/);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('requestChanges keeps the same active role and includes revision feedback', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-runner-'));
  try {
    const started = await startRun({ projectPath, userPrompt: 'Build filters' });
    await submitStep({ projectPath, runId: started.run.run_id, stepOutput: stepOutput() });
    const revised = await requestChanges({
      projectPath,
      runId: started.run.run_id,
      instructions: 'Choose the analyst explicitly.'
    });

    assert.equal(revised.run.status, 'awaiting_role_output');
    assert.equal(revised.run.current_role, 'context-router');
    assert.match(revised.rolePacket.prompt, /Choose the analyst explicitly/);
    const runReadme = await readFile(path.join(started.runDir, 'README.md'), 'utf8');
    assert.match(runReadme, /`approvals\/001-changes_requested\.json`/);
    assert.match(runReadme, /`revision-requests\/001-context-router\.md`/);
    assert.match(
      await readTimelineStepFile(started.runDir, '001-context-router', 'approval.json'),
      /"action": "changes_requested"/
    );
    assert.match(
      await readTimelineStepFile(started.runDir, '001-context-router', 'revision-request.md'),
      /Choose the analyst explicitly/
    );
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('answerClarification resumes the same role', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-runner-'));
  try {
    const started = await startRun({ projectPath, userPrompt: 'Build filters' });
    await submitStep({
      projectPath,
      runId: started.run.run_id,
      stepOutput: {
        ...stepOutput({ role: 'context-router', target: 'context-router', transitionType: 'clarification_request', status: 'needs_clarification' }),
        transition: {
          type: 'clarification_request',
          questions: ['Which area?']
        },
        handoff: {
          ...handoff({ source: 'context-router', target: 'context-router' }),
          open_questions: ['Which area?']
        }
      }
    });
    const approved = await approveStep({ projectPath, runId: started.run.run_id });
    assert.equal(approved.run.status, 'needs_clarification');
    assert.equal(approved.rolePacket, null);

    const answered = await answerClarification({
      projectPath,
      runId: started.run.run_id,
      answersText: 'Use frontend filters.'
    });

    assert.equal(answered.run.status, 'awaiting_role_output');
    assert.equal(answered.run.current_role, 'context-router');
    assert.match(answered.rolePacket.prompt, /Use frontend filters/);
    const runReadme = await readFile(path.join(started.runDir, 'README.md'), 'utf8');
    assert.match(runReadme, /Status: awaiting_role_output/);
    assert.match(runReadme, /`clarifications\/001-user-answer\.md`/);
    assert.match(
      await readTimelineStepFile(started.runDir, '001-context-router', 'clarification.md'),
      /Use frontend filters/
    );
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('consultation request and response return to the requester', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-runner-'));
  try {
    const started = await startRun({ projectPath, userPrompt: 'Build filters' });
    await submitStep({ projectPath, runId: started.run.run_id, stepOutput: stepOutput() });
    await approveStep({ projectPath, runId: started.run.run_id });
    await continueRun({ projectPath, runId: started.run.run_id });

    await submitStep({
      projectPath,
      runId: started.run.run_id,
      stepOutput: stepOutput({
        role: 'business-analyst',
        target: 'solution-architect',
        transitionType: 'consultation_request'
      })
    });
    const consultation = await approveStep({ projectPath, runId: started.run.run_id });
    assert.deepEqual(consultation.run.role_stack, ['business-analyst']);
    assert.equal(consultation.run.current_role, 'solution-architect');
    assert.equal(consultation.run.status, 'awaiting_role_acceptance');
    await continueRun({ projectPath, runId: started.run.run_id });

    await submitStep({
      projectPath,
      runId: started.run.run_id,
      stepOutput: stepOutput({
        role: 'solution-architect',
        target: 'business-analyst',
        transitionType: 'consultation_response'
      })
    });
    const returned = await approveStep({ projectPath, runId: started.run.run_id });
    assert.deepEqual(returned.run.role_stack, []);
    assert.equal(returned.run.current_role, 'business-analyst');
    assert.equal(returned.run.status, 'awaiting_role_acceptance');
    const resumed = await continueRun({ projectPath, runId: started.run.run_id });
    assert.equal(resumed.run.status, 'awaiting_role_output');
    assert.equal(resumed.rolePacket.active_role, 'business-analyst');
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('terminal completion clears current role and status reports next action', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-runner-'));
  try {
    const started = await startRun({ projectPath, userPrompt: 'Build filters' });
    await submitStep({
      projectPath,
      runId: started.run.run_id,
      stepOutput: {
        ...stepOutput({ role: 'context-router', target: 'context-router', transitionType: 'complete', status: 'complete' }),
        transition: {
          type: 'complete'
        },
        handoff: handoff({ source: 'context-router', target: 'context-router' })
      }
    });
    const completed = await approveStep({ projectPath, runId: started.run.run_id });
    const status = await getStatus({ projectPath, runId: started.run.run_id });

    assert.equal(completed.run.status, 'complete');
    assert.equal(completed.run.current_role, null);
    assert.equal(completed.rolePacket, null);
    assert.equal(status.runSummaryPath, 'README.md');
    assert.deepEqual(status.timelineStepPaths, ['timeline/001-context-router']);
    assert.deepEqual(status.timelineManifestPaths, ['timeline/001-context-router/manifest.json']);
    assert.equal(status.nextAllowedActions.length, 0);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('blocked approval clears current role without waiting for role acceptance', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-runner-'));
  try {
    const started = await startRun({ projectPath, userPrompt: 'Build filters' });
    await submitStep({
      projectPath,
      runId: started.run.run_id,
      stepOutput: {
        ...stepOutput({ role: 'context-router', target: 'context-router', transitionType: 'blocked', status: 'blocked' }),
        transition: {
          type: 'blocked',
          reason: 'External dependency unavailable.'
        },
        handoff: {
          ...handoff({ source: 'context-router', target: 'context-router' }),
          risks: ['External dependency unavailable.']
        }
      }
    });

    const blocked = await approveStep({ projectPath, runId: started.run.run_id });
    const status = await getStatus({ projectPath, runId: started.run.run_id });

    assert.equal(blocked.run.status, 'blocked');
    assert.equal(blocked.run.current_role, null);
    assert.equal(blocked.rolePacket, null);
    assert.deepEqual(status.nextAllowedActions, []);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('role acceptance waits for continue without allowing submit', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-runner-'));
  try {
    const started = await startRun({ projectPath, userPrompt: 'Build filters' });
    const run = {
      ...started.run,
      status: 'awaiting_role_acceptance',
      current_role: 'business-analyst'
    };
    await writeFile(path.join(started.runDir, 'run.json'), `${JSON.stringify(run, null, 2)}\n`, 'utf8');

    const status = await getStatus({ projectPath, runId: started.run.run_id });

    assert.deepEqual(status.nextAllowedActions, ['forge_continue', 'forge_reject_handoff']);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('approveStep commits forge state in git worktrees', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-runner-'));
  try {
    await initRepo(projectPath);
    const started = await startRun({ projectPath, userPrompt: 'Build filters' });
    await submitStep({
      projectPath,
      runId: started.run.run_id,
      stepOutput: stepOutput()
    });

    const approved = await approveStep({ projectPath, runId: started.run.run_id, note: 'Approved.' });

    assert.equal(approved.gitCommit.committed, true);
    assert.equal(approved.run.status, 'awaiting_role_acceptance');
    assert.equal(approved.rolePacket, null);
    assert.match(approved.gitCommit.commit, /^[0-9a-f]{7,40}$/);
    assert.equal(await git(projectPath, ['log', '-1', '--pretty=%s']), `forge: approve step 001 for ${started.run.run_id}\n`);
    assert.match(await git(projectPath, ['show', '--name-only', '--pretty=', 'HEAD']), /forge\/active-run\.json/);
    assert.match(await git(projectPath, ['show', '--name-only', '--pretty=', 'HEAD']), new RegExp(`forge/runs/${started.run.run_id}/run\\.json`));

    const continued = await continueRun({ projectPath, runId: started.run.run_id });
    const manifest = JSON.parse(await readFile(path.join(projectPath, 'forge', 'active-run.json'), 'utf8'));
    assert.equal(continued.gitCommit.committed, true);
    assert.match(continued.gitCommit.commit, /^[0-9a-f]{7,40}$/);
    assert.equal(await git(projectPath, ['log', '-1', '--pretty=%s']), `forge: start business-analyst for ${started.run.run_id}\n`);
    assert.equal(continued.run.status, 'awaiting_role_output');
    assert.equal(continued.rolePacket.active_role, 'business-analyst');
    assert.equal(manifest.status, 'awaiting_role_output');
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('startRun creates a run branch, active manifest, and initial commit in git worktrees', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-runner-'));
  try {
    await initRepo(projectPath);
    const started = await startRun({ projectPath, userPrompt: 'Build filters' });
    const branch = await git(projectPath, ['branch', '--show-current']);
    const manifest = JSON.parse(await readFile(path.join(projectPath, 'forge', 'active-run.json'), 'utf8'));

    assert.equal(branch.trim(), `forge/run/build-filters-${started.run.run_id}`);
    assert.equal(started.gitBranch.created, true);
    assert.equal(started.gitBranch.branch, branch.trim());
    assert.equal(started.gitCommit.committed, true);
    assert.equal(manifest.run_id, started.run.run_id);
    assert.equal(manifest.branch, branch.trim());
    assert.equal(manifest.status, 'awaiting_role_output');
    assert.equal(manifest.run_dir, `forge/runs/${started.run.run_id}`);
    assert.equal(await git(projectPath, ['log', '-1', '--pretty=%s']), `forge: start run ${started.run.run_id}\n`);
    assert.match(await git(projectPath, ['show', '--name-only', '--pretty=', 'HEAD']), /forge\/active-run\.json/);
    assert.match(await git(projectPath, ['show', '--name-only', '--pretty=', 'HEAD']), new RegExp(`forge/runs/${started.run.run_id}/run\\.json`));
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('task-backed start persists retryable tracker sync failures after initial commit', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-runner-tracker-fail-'));
  try {
    await initRepo(projectPath);
    await writeFile(path.join(projectPath, '.env.forge'), [
      'TASK_SOURCE_TYPE=gitlab',
      'TASK_SOURCE_URL=https://gitlab.example.local/group/project',
      'TASK_SOURCE_TOKEN=secret-token'
    ].join('\n'));

    const started = await startRun({
      projectPath,
      userPrompt: 'Build filters',
      taskSource: {
        type: 'gitlab',
        task_id: '123',
        source_url: 'https://gitlab.example.local/group/project'
      },
      fetchImpl: async () => {
        throw new Error('GitLab is down for secret-token');
      }
    });
    const persistedRun = JSON.parse(await readFile(path.join(started.runDir, 'run.json'), 'utf8'));

    assert.equal(started.gitCommit.committed, true);
    assert.equal(started.labelSync.failed, true);
    assert.equal(started.labelSync.retryable, true);
    assert.match(started.labelSync.error, /GitLab is down for \[redacted\]/);
    assert.doesNotMatch(JSON.stringify(started.labelSync), /secret-token/);
    assert.deepEqual(persistedRun.tracker_sync, started.run.tracker_sync);
    assert.equal(persistedRun.tracker_sync.status, 'failed');
    assert.equal(await commitCount(projectPath), 1);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('submitStep, requestChanges, and answerClarification commit transfer state', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-runner-'));
  try {
    await initRepo(projectPath);
    const started = await startRun({ projectPath, userPrompt: 'Build filters' });
    const commitsAfterStart = await commitCount(projectPath);
    const submitted = await submitStep({ projectPath, runId: started.run.run_id, stepOutput: stepOutput() });
    assert.equal(submitted.gitCommit.committed, true);
    const commitsAfterSubmit = await commitCount(projectPath);
    assert.equal(commitsAfterSubmit, commitsAfterStart + 1);
    const revised = await requestChanges({
      projectPath,
      runId: started.run.run_id,
      instructions: 'Choose the analyst explicitly.'
    });
    assert.equal(revised.gitCommit.committed, true);
    const commitsAfterRevision = await commitCount(projectPath);
    assert.equal(commitsAfterRevision, commitsAfterSubmit + 1);

    const clarificationSubmitted = await submitStep({
      projectPath,
      runId: started.run.run_id,
      stepOutput: {
        ...stepOutput({ role: 'context-router', target: 'context-router', transitionType: 'clarification_request', status: 'needs_clarification' }),
        transition: {
          type: 'clarification_request',
          questions: ['Which area?']
        },
        handoff: {
          ...handoff({ source: 'context-router', target: 'context-router' }),
          open_questions: ['Which area?']
        }
      }
    });
    assert.equal(clarificationSubmitted.gitCommit.committed, true);
    await approveStep({ projectPath, runId: started.run.run_id });
    const commitsAfterApproval = await commitCount(projectPath);
    assert.equal(commitsAfterApproval, commitsAfterStart + 4);

    const answered = await answerClarification({
      projectPath,
      runId: started.run.run_id,
      answersText: 'Use frontend filters.'
    });
    assert.equal(answered.gitCommit.committed, true);
    assert.equal(await commitCount(projectPath), commitsAfterApproval + 1);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('transfer state commits are skipped outside git worktrees', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-runner-non-git-'));
  try {
    const started = await startRun({ projectPath, userPrompt: 'Build filters' });
    const submitted = await submitStep({ projectPath, runId: started.run.run_id, stepOutput: stepOutput() });
    assert.equal(submitted.gitCommit.skipped, true);
    assert.equal(submitted.gitCommit.reason, 'not_git_worktree');

    const revised = await requestChanges({
      projectPath,
      runId: started.run.run_id,
      instructions: 'Choose the analyst explicitly.'
    });
    assert.equal(revised.gitCommit.skipped, true);
    assert.equal(revised.gitCommit.reason, 'not_git_worktree');

    const handoffSubmitted = await submitStep({ projectPath, runId: started.run.run_id, stepOutput: stepOutput() });
    assert.equal(handoffSubmitted.gitCommit.skipped, true);
    await approveStep({ projectPath, runId: started.run.run_id });
    const continued = await continueRun({ projectPath, runId: started.run.run_id });
    assert.equal(continued.gitCommit.skipped, true);
    assert.equal(continued.gitCommit.reason, 'not_git_worktree');

    await submitStep({
      projectPath,
      runId: started.run.run_id,
      stepOutput: {
        ...stepOutput({ role: 'business-analyst', target: 'business-analyst', transitionType: 'clarification_request', status: 'needs_clarification' }),
        transition: {
          type: 'clarification_request',
          questions: ['Which area?']
        },
        handoff: {
          ...handoff({ source: 'business-analyst', target: 'business-analyst' }),
          open_questions: ['Which area?']
        }
      }
    });
    await approveStep({ projectPath, runId: started.run.run_id });
    const answered = await answerClarification({
      projectPath,
      runId: started.run.run_id,
      answersText: 'Use frontend filters.'
    });
    assert.equal(answered.gitCommit.skipped, true);
    assert.equal(answered.gitCommit.reason, 'not_git_worktree');
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

async function initRepo(projectPath) {
  await git(projectPath, ['init', '-b', 'main']);
  await git(projectPath, ['config', 'user.email', 'forge@example.test']);
  await git(projectPath, ['config', 'user.name', 'Forge Test']);
}

async function commitCount(projectPath) {
  const result = await git(projectPath, ['rev-list', '--count', 'HEAD'], { reject: false });
  return result.trim() === '' ? 0 : Number(result.trim());
}

async function git(cwd, args, { reject = true } = {}) {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd });
    return stdout;
  } catch (error) {
    if (reject) {
      throw error;
    }
    return error.stdout ?? '';
  }
}
