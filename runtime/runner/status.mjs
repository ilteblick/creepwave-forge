import { buildRunTimeline } from '../runs/run-timeline-index.mjs';

export async function buildStatus({ run, store }) {
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

export function nextAllowedActions(run) {
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
