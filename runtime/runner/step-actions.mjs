import { assertTransitionAllowed } from '../core/transition-policy.mjs';
import { ArtifactStore } from '../runs/artifact-store.mjs';

export function applyApprovedTransition(run, stepOutput) {
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

export async function loadPendingStep({ run, store }) {
  if (!run.pending_step_path) {
    throw new Error(`Run ${run.run_id} has no pending step path`);
  }
  return JSON.parse(await store.readRunFile(run.run_id, run.pending_step_path));
}

export async function loadReferencedArtifacts({ run, store }) {
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

export async function loadTextArtifacts({ run, store, paths }) {
  const artifacts = [];
  for (const artifactPath of paths) {
    artifacts.push({
      path: artifactPath,
      text: await store.readRunFile(run.run_id, artifactPath)
    });
  }
  return artifacts;
}

export function clearPendingApproval(run) {
  delete run.pending_step_path;
  delete run.pending_handoff_path;
}
