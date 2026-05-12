import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { callTool, handleRequest } from '../scripts/forge-mcp-server.mjs';

const execFileAsync = promisify(execFile);

function extractRunId(text) {
  const match = text.match(/Run ID: ([^\n]+)/);
  assert.ok(match, `Run ID not found in:\n${text}`);
  return match[1].trim();
}

function textOf(result) {
  return result.content[0].text;
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
      goal: 'Build filters',
      scope: 'Route to requirements.',
      confirmed: ['User asked for filters.'],
      decisions: [],
      assumptions: [],
      open_questions: [],
      risks: [],
      artifacts: [],
      next_action: 'Draft requirements.'
    }
  };
}

test('tools/list exposes Forge tools', async () => {
  const result = await handleRequest({ method: 'tools/list' });
  const names = result.tools.map((tool) => tool.name);

  assert.ok(names.includes('forge_run'));
  assert.ok(names.includes('forge_approve'));
  assert.ok(names.includes('forge_request_changes'));
  assert.ok(names.includes('forge_reject_handoff'));
  assert.ok(names.includes('forge_publish'));
  assert.ok(names.includes('forge_sync_task'));
});

test('forge_approve is documented as a human-only MCP action', async () => {
  const result = await handleRequest({ method: 'tools/list' });
  const approveTool = result.tools.find((tool) => tool.name === 'forge_approve');

  assert.ok(approveTool);
  assert.match(approveTool.description, /Human-only approval gate/);
  assert.deepEqual(approveTool.inputSchema.required, ['projectPath', 'humanApproval']);
  assert.match(approveTool.inputSchema.properties.humanApproval.description, /Do not invent/);
  assert.match(approveTool.inputSchema.properties.runId.description, /Optional/);
});

test('validates required MCP tool arguments', async () => {
  await assert.rejects(
    () => callTool('forge_run', { projectPath: 'C:/tmp' }),
    /prompt must be a non-empty string/
  );
  await assert.rejects(
    () => callTool('forge_submit_step', { projectPath: 'C:/tmp', runId: 'run-1', stepOutput: [] }),
    /stepOutput must be an object/
  );
  await assert.rejects(
    () => callTool('forge_approve', { projectPath: 'C:/tmp', runId: 'run-1' }),
    /humanApproval must be a non-empty string/
  );
  await assert.rejects(
    () => callTool('forge_reject_handoff', { projectPath: 'C:/tmp', runId: 'run-1' }),
    /instructions must be a non-empty string/
  );
  await assert.rejects(
    () => callTool('forge_publish', { projectPath: 'C:/tmp', runId: [] }),
    /runId must be a non-empty string/
  );
});

test('formats status and resolves project-scoped runs by projectPath', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-mcp-server-'));
  try {
    const started = await callTool('forge_run', {
      projectPath,
      prompt: 'Build filters'
    });
    const runId = extractRunId(textOf(started));

    assert.match(textOf(started), /Step 1: context-router/);
    assert.match(textOf(started), /Run Summary: .*README\.md/);
    assert.match(textOf(started), /Run Files:/);
    assert.match(textOf(started), /"role_context"/);
    assert.match(textOf(started), /"full_context_path": "context\/project-context\.md"/);

    const submitted = await callTool('forge_submit_step', {
      projectPath,
      runId,
      stepOutput: validRouterStep()
    });
    assert.match(textOf(submitted), /Pending Approval/);
    assert.match(textOf(submitted), /Run Summary: .*README\.md/);
    assert.match(textOf(submitted), /forge_approve/);
    assert.match(textOf(submitted), /Stop now and show this pending output to the human/);

    const status = await callTool('forge_status', {
      projectPath,
      runId
    });
    assert.match(textOf(status), /Run Status: awaiting_approval/);
    assert.match(textOf(status), /Run Summary: .*README\.md/);
    assert.match(textOf(status), /## Timeline Step Folders/);
    assert.match(textOf(status), /timeline\/001-context-router/);
    assert.match(textOf(status), /## Timeline Manifests/);
    assert.match(textOf(status), /timeline\/001-context-router\/manifest\.json/);
    assert.match(textOf(status), /Pending Approval: steps\/001-context-router\.json/);
    assert.match(textOf(status), /Human approval is required/);
    assert.match(textOf(status), /## Optional Git Transfer/);
    assert.match(textOf(status), /Use forge_publish/);
    assert.match(textOf(status), /## Step Trace/);
    assert.match(textOf(status), /- 001-context-router\.json/);
    assert.match(textOf(status), /## Artifacts/);
    assert.match(textOf(status), /- 001-context-router\.md/);

    const approved = await callTool('forge_approve', {
      projectPath,
      runId,
      humanApproval: 'Approved.',
      note: 'Approved.'
    });
    assert.match(textOf(approved), /# Forge Handoff Accepted/);
    assert.match(textOf(approved), /Run Status: awaiting_role_acceptance/);
    assert.match(textOf(approved), /Next Role: business-analyst/);
    assert.doesNotMatch(textOf(approved), /Step 2: business-analyst/);
    assert.doesNotMatch(textOf(approved), /"role_context"/);

    const acceptanceStatus = await callTool('forge_status', { projectPath, runId });
    assert.match(textOf(acceptanceStatus), /Run Status: awaiting_role_acceptance/);
    assert.match(textOf(acceptanceStatus), /forge:waiting-role/);
    assert.match(textOf(acceptanceStatus), /must inspect it/);

    const nextRole = await callTool('forge_continue', { projectPath, runId });
    assert.match(textOf(nextRole), /Run Status: awaiting_role_output/);
    assert.match(textOf(nextRole), /Step 2: business-analyst/);
    assert.match(textOf(nextRole), /"role_context"/);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('forge_publish commits pending state without applying approval', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-mcp-server-'));
  try {
    await initRepo(projectPath);
    const started = await callTool('forge_run', {
      projectPath,
      prompt: 'Build filters'
    });
    const runId = extractRunId(textOf(started));
    await callTool('forge_submit_step', {
      projectPath,
      runId,
      stepOutput: validRouterStep()
    });

    const published = await callTool('forge_publish', {
      projectPath,
      runId,
      message: 'forge: publish pending approval'
    });

    assert.match(textOf(published), /# Forge Run Published/);
    assert.match(textOf(published), /Run Status: awaiting_approval/);
    assert.match(textOf(published), /Workflow state was not advanced/);
    assert.match(textOf(published), /Git Commit: [0-9a-f]{40}/);
    assert.equal(await git(projectPath, ['log', '-1', '--pretty=%s']), 'forge: publish pending approval\n');

    const status = await callTool('forge_status', { projectPath, runId });
    assert.match(textOf(status), /Run Status: awaiting_approval/);
    assert.match(textOf(status), /Pending Approval: steps\/001-context-router\.json/);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('forge_reject_handoff returns accepted handoff to sender', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-mcp-reject-'));
  try {
    await initRepo(projectPath);
    const started = await callTool('forge_run', {
      projectPath,
      prompt: 'Build filters'
    });
    const runId = extractRunId(textOf(started));
    await callTool('forge_submit_step', {
      projectPath,
      runId,
      stepOutput: validRouterStep()
    });
    await callTool('forge_approve', {
      projectPath,
      runId,
      humanApproval: 'Approved.'
    });

    const rejected = await callTool('forge_reject_handoff', {
      projectPath,
      runId,
      instructions: 'Business analyst needs a narrower scope.'
    });
    const rejectedText = textOf(rejected);

    assert.match(rejectedText, /# Forge Handoff Rejected/);
    assert.match(rejectedText, /Run Status: awaiting_role_output/);
    assert.match(rejectedText, /Step 2: context-router/);
    assert.match(rejectedText, /"active_role": "context-router"/);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('run-scoped tools resolve omitted runId from active branch manifest', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-mcp-server-'));
  try {
    await initRepo(projectPath);
    const started = await callTool('forge_run', {
      projectPath,
      prompt: 'Build filters'
    });
    const runId = extractRunId(textOf(started));

    const status = await callTool('forge_status', { projectPath });
    assert.match(textOf(status), new RegExp(`Run ID: ${runId}`));
    assert.match(textOf(status), /Run Status: awaiting_role_output/);

    const continued = await callTool('forge_continue', { projectPath });
    assert.match(textOf(continued), new RegExp(`Run ID: ${runId}`));
    assert.match(textOf(continued), /Step 1: context-router/);

    const submitted = await callTool('forge_submit_step', {
      projectPath,
      stepOutput: validRouterStep()
    });
    assert.match(textOf(submitted), /Run Status: awaiting_approval/);

    const published = await callTool('forge_publish', {
      projectPath,
      message: 'forge: publish without run id'
    });
    assert.match(textOf(published), /Run Status: awaiting_approval/);
    assert.match(textOf(published), /Workflow state was not advanced/);

    const approved = await callTool('forge_approve', {
      projectPath,
      humanApproval: 'Approved.'
    });
    assert.match(textOf(approved), new RegExp(`Run ID: ${runId}`));
    assert.match(textOf(approved), /# Forge Handoff Accepted/);
    assert.doesNotMatch(textOf(approved), /Step 2: business-analyst/);

    const nextRole = await callTool('forge_continue', { projectPath });
    assert.match(textOf(nextRole), new RegExp(`Run ID: ${runId}`));
    assert.match(textOf(nextRole), /Step 2: business-analyst/);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('omitted runId fails clearly when active manifest is missing', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-mcp-server-'));
  try {
    await assert.rejects(
      () => callTool('forge_status', { projectPath }),
      /Active Forge run could not be resolved from forge\/active-run\.json/
    );
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('omitted runId fails before mutation when active manifest branch mismatches current branch', async () => {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'forge-mcp-server-'));
  try {
    await initRepo(projectPath);
    const started = await callTool('forge_run', {
      projectPath,
      prompt: 'Build filters'
    });
    const runId = extractRunId(textOf(started));
    await git(projectPath, ['switch', '-c', 'other-branch']);
    await writeFile(
      path.join(projectPath, 'forge', 'active-run.json'),
      `${JSON.stringify({
        run_id: runId,
        status: 'awaiting_role_output',
        current_role: 'context-router',
        step_index: 0,
        branch: `forge/run/build-filters-${runId}`,
        run_dir: `forge/runs/${runId}`,
        updated_at: new Date().toISOString()
      }, null, 2)}\n`,
      'utf8'
    );

    await assert.rejects(
      () => callTool('forge_submit_step', {
        projectPath,
        stepOutput: validRouterStep()
      }),
      /Active Forge run manifest belongs to branch/
    );
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

async function initRepo(projectPath) {
  await git(projectPath, ['init', '-b', 'main']);
  await git(projectPath, ['config', 'user.email', 'forge@example.test']);
  await git(projectPath, ['config', 'user.name', 'Forge Test']);
}

async function git(cwd, args) {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout;
}
