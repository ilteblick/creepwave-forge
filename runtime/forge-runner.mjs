import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { loadRuntimeContracts } from './core/contract-loader.mjs';
import { loadProjectContext } from './project-context-loader.mjs';
import { RunStore } from './runs/run-store.mjs';
import { ArtifactStore, addArtifactToHandoff } from './runs/artifact-store.mjs';
import { buildRolePacket } from './core/prompt-builder.mjs';
import { loadSkillRegistry } from './core/skill-registry.mjs';
import { validateStepOutput } from './core/step-validator.mjs';
import { assertTransitionAllowed } from './core/transition-policy.mjs';
import { fetchTaskFromSource } from './tasks/task-source-client.mjs';
import { preflightTaskLabelSync, syncTaskLabels } from './tasks/task-label-sync.mjs';
import { buildTaskPrompt } from './tasks/task-prompt-builder.mjs';
import { buildRunTimeline, renderRunReadme, writeTimelineMirror } from './runs/run-timeline-index.mjs';
import {
  commitScopedPaths,
  createAndCheckoutBranch,
  createRunBranchName,
  getCurrentBranch
} from './git-workflow.mjs';

export async function startRun({
  projectPath,
  userPrompt,
  branchSlug,
  taskSource = null,
  fetchImpl = globalThis.fetch,
  store = storeForProject(projectPath)
} = {}) {
  const projectContext = await loadProjectContext({ projectPath });
  const registry = await loadSkillRegistry();
  const run = await store.createRun({
    userPrompt,
    initialRole: 'context-router',
    contextSnapshot: projectContext.text,
    taskSource
  });
  const gitBranch = await createRunBranch({ run, store, branchSlug });
  const savedProjectContext = await store.loadContextSnapshot(run);
  const rolePacket = buildRolePacket({
    run,
    registry,
    projectContext: savedProjectContext
  });
  await refreshRunReadme({ run, store });
  await refreshActiveRunManifest({ run, store });
  const gitCommit = await commitRunState({
    run,
    store,
    message: `forge: start run ${run.run_id}`
  });
  const labelSync = await syncLabelsForRun({ projectPath, run, fetchImpl, store });

  return {
    run,
    rolePacket,
    gitBranch,
    gitCommit,
    labelSync,
    runDir: store.getRunDir(run.run_id)
  };
}

export async function startRunFromTask({
  projectPath,
  taskId,
  fetchImpl = globalThis.fetch,
  store = storeForProject(projectPath)
} = {}) {
  const sourceTask = await fetchTaskFromSource({ projectPath, taskId, fetchImpl });
  assertForgeTaskLabel(sourceTask);
  await preflightTaskLabelSync({ projectPath, taskId: sourceTask.id ?? taskId, fetchImpl });
  const result = await startRun({
    projectPath,
    userPrompt: buildTaskPrompt(sourceTask),
    branchSlug: taskBranchSlug(sourceTask),
    taskSource: taskSourceMetadata(sourceTask),
    fetchImpl,
    store
  });

  return {
    ...result,
    sourceTask
  };
}

export async function continueRun({
  projectPath,
  runId,
  fetchImpl = globalThis.fetch,
  store = storeForProject(projectPath)
} = {}) {
  runId = await resolveRunId({ runId, store });
  const run = await store.loadRun(runId);

  if (run.status === 'awaiting_role_acceptance' && run.current_role) {
    run.status = 'awaiting_role_output';
    await store.saveRun(run);
    const { labelSync, gitCommit } = await persistTransferState({
      projectPath,
      run,
      fetchImpl,
      store,
      message: `forge: start ${run.current_role} for ${run.run_id}`
    });
    return {
      run,
      rolePacket: await buildPacketForRun({ run, store }),
      status: await buildStatus({ run, store }),
      gitCommit,
      labelSync,
      runDir: store.getRunDir(runId)
    };
  }

  const status = await buildStatus({ run, store });

  if (run.status !== 'awaiting_role_output' || !run.current_role) {
    return {
      run,
      rolePacket: null,
      status,
      runDir: store.getRunDir(runId)
    };
  }

  return {
    run,
    rolePacket: await buildPacketForRun({ run, store }),
    status,
    runDir: store.getRunDir(runId)
  };
}

export async function submitStep({
  projectPath,
  runId,
  stepOutput,
  fetchImpl = globalThis.fetch,
  store = storeForProject(projectPath)
} = {}) {
  runId = await resolveRunId({ runId, store });
  const run = await store.loadRun(runId);
  if (run.status !== 'awaiting_role_output') {
    throw new Error(`Run ${runId} is not awaiting role output; current status is ${run.status}`);
  }
  if (!run.current_role) {
    throw new Error(`Run ${runId} has no active role`);
  }

  const contracts = await loadRuntimeContracts();
  validateStepOutput(stepOutput, { activeRole: run.current_role, contracts });

  run.step_index += 1;
  const artifactStore = new ArtifactStore({ runStore: store });
  const artifactRef = await artifactStore.saveRoleArtifact(run, stepOutput);
  const persistedStepOutput = {
    ...stepOutput,
    handoff: addArtifactToHandoff(stepOutput.handoff, artifactRef)
  };
  const stepPath = await store.saveStepOutput(run, persistedStepOutput);
  const handoffPath = await store.saveHandoff(run, persistedStepOutput.handoff);

  run.status = 'awaiting_approval';
  run.pending_step_path = store.toRunRelativePath(run.run_id, stepPath);
  run.pending_handoff_path = store.toRunRelativePath(run.run_id, handoffPath);
  await store.saveRun(run);
  const { labelSync, gitCommit } = await persistTransferState({
    projectPath,
    run,
    fetchImpl,
    store,
    message: `forge: submit step ${String(run.step_index).padStart(3, '0')} for ${run.run_id}`
  });

  return {
    run,
    stepOutput: persistedStepOutput,
    gitCommit,
    labelSync,
    runDir: store.getRunDir(runId)
  };
}

export async function approveStep({
  projectPath,
  runId,
  note = '',
  fetchImpl = globalThis.fetch,
  store = storeForProject(projectPath)
} = {}) {
  runId = await resolveRunId({ runId, store });
  const run = await store.loadRun(runId);
  if (run.status !== 'awaiting_approval') {
    throw new Error(`Run ${runId} is not awaiting approval; current status is ${run.status}`);
  }

  const stepOutput = await loadPendingStep({ run, store });
  await store.saveApproval(run, {
    action: 'approved',
    ...(note ? { note } : {})
  });

  applyApprovedTransition(run, stepOutput);
  clearPendingApproval(run);
  await store.saveRun(run);
  const { labelSync, gitCommit } = await persistTransferState({
    projectPath,
    run,
    fetchImpl,
    store,
    message: `forge: approve step ${String(run.step_index).padStart(3, '0')} for ${run.run_id}`
  });

  const rolePacket = run.status === 'awaiting_role_output'
    ? await buildPacketForRun({ run, store })
    : null;

  return {
    run,
    stepOutput,
    gitCommit,
    labelSync,
    rolePacket,
    runDir: store.getRunDir(runId)
  };
}

export async function requestChanges({
  projectPath,
  runId,
  instructions,
  fetchImpl = globalThis.fetch,
  store = storeForProject(projectPath)
} = {}) {
  runId = await resolveRunId({ runId, store });
  const run = await store.loadRun(runId);
  if (run.status !== 'awaiting_approval') {
    throw new Error(`Run ${runId} is not awaiting approval; current status is ${run.status}`);
  }
  if (!instructions || instructions.trim() === '') {
    throw new Error('instructions are required');
  }

  await store.saveApproval(run, {
    action: 'changes_requested',
    instructions
  });
  const revisionPath = await store.saveRevisionRequest(run, instructions);
  run.revision_request_paths = [
    ...(run.revision_request_paths ?? []),
    store.toRunRelativePath(run.run_id, revisionPath)
  ];
  clearPendingApproval(run);
  run.status = 'awaiting_role_output';
  await store.saveRun(run);
  const { labelSync, gitCommit } = await persistTransferState({
    projectPath,
    run,
    fetchImpl,
    store,
    message: `forge: request changes for step ${String(run.step_index).padStart(3, '0')} in ${run.run_id}`
  });

  return {
    run,
    labelSync,
    gitCommit,
    rolePacket: await buildPacketForRun({ run, store }),
    runDir: store.getRunDir(runId)
  };
}

export async function rejectHandoff({
  projectPath,
  runId,
  instructions,
  fetchImpl = globalThis.fetch,
  store = storeForProject(projectPath)
} = {}) {
  runId = await resolveRunId({ runId, store });
  const run = await store.loadRun(runId);
  if (run.status !== 'awaiting_role_acceptance') {
    throw new Error(`Run ${runId} is not awaiting role acceptance; current status is ${run.status}`);
  }
  if (!instructions || instructions.trim() === '') {
    throw new Error('instructions are required');
  }

  const receiverRole = run.current_role;
  const returnRole = run.previous_handoff?.source_role;
  if (!returnRole) {
    throw new Error(`Run ${runId} has no previous handoff source role to return to`);
  }

  run.current_role = returnRole;
  run.status = 'awaiting_role_output';
  if ((run.role_stack ?? []).at(-1) === returnRole) {
    run.role_stack = run.role_stack.slice(0, -1);
  }
  const revisionPath = await store.saveRevisionRequest(
    run,
    [
      `Receiver role ${receiverRole ?? 'unknown'} rejected the accepted handoff before starting.`,
      '',
      instructions.trim()
    ].join('\n')
  );
  run.revision_request_paths = [
    ...(run.revision_request_paths ?? []),
    store.toRunRelativePath(run.run_id, revisionPath)
  ];
  await store.saveRun(run);
  const { labelSync, gitCommit } = await persistTransferState({
    projectPath,
    run,
    fetchImpl,
    store,
    message: `forge: reject handoff for ${run.run_id}`
  });

  return {
    run,
    labelSync,
    gitCommit,
    rolePacket: await buildPacketForRun({ run, store }),
    runDir: store.getRunDir(runId)
  };
}

export async function answerClarification({
  projectPath,
  runId,
  answersText,
  fetchImpl = globalThis.fetch,
  store = storeForProject(projectPath)
} = {}) {
  runId = await resolveRunId({ runId, store });
  const run = await store.loadRun(runId);
  if (run.status !== 'needs_clarification') {
    throw new Error(`Run ${runId} is not awaiting clarification; current status is ${run.status}`);
  }

  const clarificationPath = await store.saveClarification(runId, answersText);
  run.clarification_paths = [
    ...(run.clarification_paths ?? []),
    store.toRunRelativePath(run.run_id, clarificationPath)
  ];
  run.status = 'awaiting_role_output';
  await store.saveRun(run);
  const { labelSync, gitCommit } = await persistTransferState({
    projectPath,
    run,
    fetchImpl,
    store,
    message: `forge: answer clarification for ${run.run_id}`
  });

  return {
    run,
    labelSync,
    gitCommit,
    rolePacket: await buildPacketForRun({ run, store }),
    runDir: store.getRunDir(runId)
  };
}

export async function getStatus({
  projectPath,
  runId,
  fetchImpl = globalThis.fetch,
  store = storeForProject(projectPath)
} = {}) {
  runId = await resolveRunId({ runId, store });
  const run = await store.loadRun(runId);
  const labelSync = await syncLabelsForRun({ projectPath, run, fetchImpl, store });
  const status = await buildStatus({ run, store });
  return {
    ...status,
    labelSync,
    runDir: store.getRunDir(runId)
  };
}

export async function publishRunState({
  projectPath,
  runId,
  message = null,
  fetchImpl = globalThis.fetch,
  store = storeForProject(projectPath)
} = {}) {
  runId = await resolveRunId({ runId, store });
  const run = await store.loadRun(runId);
  await refreshRunReadme({ run, store });
  await refreshActiveRunManifest({ run, store });
  const gitCommit = await commitRunState({
    run,
    store,
    message: message || `forge: publish run state for ${run.run_id}`
  });
  const status = await buildStatus({ run, store });
  const labelSync = await syncLabelsForRun({ projectPath, run, fetchImpl, store });

  return {
    run,
    status,
    gitCommit,
    labelSync,
    runDir: store.getRunDir(runId)
  };
}

export async function syncTaskRunLabels({
  projectPath,
  runId,
  fetchImpl = globalThis.fetch,
  store = storeForProject(projectPath)
} = {}) {
  runId = await resolveRunId({ runId, store });
  const run = await store.loadRun(runId);
  const labelSync = await syncLabelsForRun({ projectPath, run, fetchImpl, store });

  return {
    run,
    labelSync,
    runDir: store.getRunDir(runId)
  };
}

async function resolveRunId({ runId, store }) {
  if (runId) {
    return runId;
  }

  let manifest;
  try {
    manifest = await store.loadActiveRunManifest();
  } catch (error) {
    throw new Error('Active Forge run could not be resolved from forge/active-run.json in the current branch. Pass runId explicitly or checkout a Forge run branch.');
  }

  await assertActiveManifestBranch(manifest, store);
  if (!manifest.run_id) {
    throw new Error('Active Forge run manifest does not contain run_id');
  }

  return manifest.run_id;
}

async function assertActiveManifestBranch(manifest, store) {
  const currentBranch = await getCurrentBranch(store.projectRoot);
  if (!currentBranch || !manifest.branch) {
    return;
  }
  if (manifest.branch !== currentBranch) {
    throw new Error(`Active Forge run manifest belongs to branch "${manifest.branch}", but current branch is "${currentBranch}"`);
  }
}

function applyApprovedTransition(run, stepOutput) {
  const activeRole = stepOutput.role;
  const transition = stepOutput.transition;
  const targetRole = transition.target_role ?? stepOutput.handoff.target_role;

  run.previous_handoff = stepOutput.handoff;
  run.previous_transition = transition;

  if (transition.type === 'handoff') {
    assertTransitionAllowed(activeRole, targetRole);
    run.current_role = targetRole;
    run.status = 'awaiting_role_acceptance';
    return;
  }

  if (transition.type === 'consultation_request') {
    assertTransitionAllowed(activeRole, targetRole);
    run.role_stack = [
      ...(run.role_stack ?? []),
      activeRole
    ];
    run.current_role = targetRole;
    run.status = 'awaiting_role_acceptance';
    return;
  }

  if (transition.type === 'consultation_response') {
    const expectedReturnRole = (run.role_stack ?? []).at(-1);
    if (!expectedReturnRole) {
      throw new Error(`${activeRole} returned a consultation_response, but no return role is on the run stack`);
    }
    if (targetRole !== expectedReturnRole) {
      throw new Error(`consultation_response target_role "${targetRole}" does not match expected return role "${expectedReturnRole}"`);
    }
    assertTransitionAllowed(activeRole, targetRole);
    run.role_stack = (run.role_stack ?? []).slice(0, -1);
    run.current_role = targetRole;
    run.status = 'awaiting_role_acceptance';
    return;
  }

  if (transition.type === 'clarification_request') {
    run.current_role = activeRole;
    run.status = 'needs_clarification';
    return;
  }

  if (transition.type === 'complete') {
    run.current_role = null;
    run.status = 'complete';
    return;
  }

  if (transition.type === 'blocked') {
    run.current_role = null;
    run.status = 'blocked';
    return;
  }

  throw new Error(`Unsupported transition type: ${transition.type}`);
}

async function buildPacketForRun({ run, store }) {
  const [registry, projectContext] = await Promise.all([
    loadSkillRegistry(),
    store.loadContextSnapshot(run)
  ]);

  return buildRolePacket({
    run,
    registry,
    projectContext,
    referencedArtifacts: await loadReferencedArtifacts({ run, store }),
    clarifications: await loadTextArtifacts({ run, store, paths: run.clarification_paths ?? [] }),
    revisionRequests: await loadTextArtifacts({ run, store, paths: run.revision_request_paths ?? [] })
  });
}

async function loadPendingStep({ run, store }) {
  if (!run.pending_step_path) {
    throw new Error(`Run ${run.run_id} has no pending step path`);
  }
  return JSON.parse(await store.readRunFile(run.run_id, run.pending_step_path));
}

async function loadReferencedArtifacts({ run, store }) {
  const artifacts = run.previous_handoff?.artifacts ?? [];
  const artifactStore = new ArtifactStore({ runStore: store });
  const referenced = [];
  const seen = new Set();

  for (const artifact of artifacts) {
    if (!artifact?.path || seen.has(artifact.path)) {
      continue;
    }
    seen.add(artifact.path);
    let text;
    try {
      text = await artifactStore.loadArtifactText(run.run_id, artifact.path);
    } catch (error) {
      text = `[Artifact could not be loaded: ${error.message}]`;
    }
    referenced.push({
      ...artifact,
      text
    });
  }

  return referenced;
}

async function loadTextArtifacts({ run, store, paths }) {
  const artifacts = [];
  for (const artifactPath of paths) {
    artifacts.push({
      path: artifactPath,
      text: await store.readRunFile(run.run_id, artifactPath)
    });
  }
  return artifacts;
}

async function buildStatus({ run, store }) {
  const timeline = await buildRunTimeline({ run, store });
  return {
    run,
    currentRole: run.current_role,
    status: run.status,
    runSummaryPath: 'README.md',
    timelineStepPaths: timeline.steps.map((step) => `timeline/${step.stepKey}`),
    timelineManifestPaths: timeline.steps.map((step) => `timeline/${step.stepKey}/manifest.json`),
    stepTrace: await store.listStepFiles(run.run_id),
    artifacts: await store.listFiles(run.run_id, 'artifacts'),
    approvals: await store.listFiles(run.run_id, 'approvals'),
    revisions: await store.listFiles(run.run_id, 'revision-requests'),
    clarifications: await store.listFiles(run.run_id, 'clarifications'),
    consultations: await store.listFiles(run.run_id, 'consultations'),
    pendingApproval: run.status === 'awaiting_approval' ? run.pending_step_path : null,
    nextAllowedActions: nextAllowedActions(run)
  };
}

async function refreshRunReadme({ run, store }) {
  const runDir = store.getRunDir(run.run_id);
  const timeline = await buildRunTimeline({ run, store });
  const markdown = renderRunReadme({ run, timeline, runDir });
  await writeFile(path.join(runDir, 'README.md'), markdown, 'utf8');
  await writeTimelineMirror({ run, store, timeline });
}

async function refreshActiveRunManifest({ run, store }) {
  await store.saveActiveRunManifest(run, {
    branch: await getCurrentBranch(store.projectRoot)
  });
}

async function createRunBranch({ run, store, branchSlug }) {
  const branch = createRunBranchName({
    userPrompt: run.user_prompt,
    branchSlug,
    runId: run.run_id
  });

  return createAndCheckoutBranch({
    projectRoot: store.projectRoot,
    branch
  });
}

async function commitRunState({ run, store, message }) {
  return commitScopedPaths({
    projectRoot: store.projectRoot,
    paths: runStateCommitPaths(run),
    message
  });
}

async function persistTransferState({ projectPath, run, fetchImpl, store, message }) {
  await refreshRunReadme({ run, store });
  await refreshActiveRunManifest({ run, store });
  const labelSync = await syncLabelsForRun({ projectPath, run, fetchImpl, store });
  const gitCommit = await commitRunState({
    run,
    store,
    message
  });

  return {
    labelSync,
    gitCommit
  };
}

function runStateCommitPaths(run) {
  return [
    'forge/active-run.json',
    `forge/runs/${run.run_id}`
  ];
}

async function syncLabelsForRun({ projectPath, run, fetchImpl, store }) {
  try {
    const result = await syncTaskLabels({ projectPath, run, fetchImpl });
    if (run.task_source) {
      run.tracker_sync = {
        status: result.skipped ? 'skipped' : 'synced',
        updated_at: new Date().toISOString(),
        ...(result.skipped ? { reason: result.reason } : {}),
        ...(!result.skipped ? {
          source: result.source,
          task_id: result.task_id,
          applied_labels: result.appliedLabels
        } : {})
      };
      await store?.saveRun(run);
    }
    return result;
  } catch (error) {
    if (!run.task_source) {
      throw error;
    }

    const failure = {
      skipped: false,
      failed: true,
      retryable: true,
      source: run.task_source.type,
      task_id: run.task_source.task_id,
      error: error.message
    };
    run.tracker_sync = {
      status: 'failed',
      retryable: true,
      source: failure.source,
      task_id: failure.task_id,
      error: failure.error,
      updated_at: new Date().toISOString()
    };
    await store?.saveRun(run);
    return failure;
  }
}

function nextAllowedActions(run) {
  if (run.status === 'awaiting_role_output') {
    return ['forge_continue', 'forge_submit_step'];
  }
  if (run.status === 'awaiting_role_acceptance') {
    return ['forge_continue', 'forge_reject_handoff'];
  }
  if (run.status === 'awaiting_approval') {
    return ['forge_approve', 'forge_request_changes'];
  }
  if (run.status === 'needs_clarification') {
    return ['forge_answer'];
  }
  return [];
}

function clearPendingApproval(run) {
  delete run.pending_step_path;
  delete run.pending_handoff_path;
}

function taskSourceMetadata(sourceTask) {
  return {
    type: sourceTask.source?.type ?? 'unknown',
    task_id: String(sourceTask.id ?? ''),
    ...(sourceTask.source?.task_url !== undefined ? { task_url: sourceTask.source.task_url } : {}),
    source_url: sourceTask.source?.url ?? ''
  };
}

function taskBranchSlug(sourceTask) {
  return `task-${sourceTask?.id ?? 'unknown'}-${sourceTask?.title ?? ''}`;
}

function assertForgeTaskLabel(sourceTask) {
  if (Array.isArray(sourceTask?.labels) && sourceTask.labels.includes('forge')) {
    return;
  }

  const taskLabel = sourceTask?.id ? ` ${sourceTask.id}` : '';
  throw new Error(`Tracker task${taskLabel} is not marked for Forge. Add the exact "forge" label before starting forge_run_task.`);
}

function storeForProject(projectPath) {
  if (!projectPath || typeof projectPath !== 'string') {
    throw new Error('projectPath is required');
  }
  return new RunStore({ projectRoot: projectPath });
}
