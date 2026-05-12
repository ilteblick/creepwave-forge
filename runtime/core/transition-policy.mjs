import { knownRoles } from './skill-registry.mjs';

export const terminalStepStatuses = new Set([
  'needs_clarification',
  'blocked',
  'complete'
]);

export const allowedStepStatuses = new Set([
  'needs_clarification',
  'handoff_ready',
  'blocked',
  'complete'
]);

export const allowedTransitionTypes = new Set([
  'handoff',
  'clarification_request',
  'consultation_request',
  'consultation_response',
  'complete',
  'blocked'
]);

export const allowedTransitions = {
  'context-router': [
    'business-analyst',
    'solution-architect',
    'ui-ux-designer',
    'backend-engineer',
    'frontend-engineer',
    'qa-engineer',
    'bug-investigator',
    'code-reviewer',
    'handoff-writer'
  ],
  'business-analyst': [
    'solution-architect',
    'ui-ux-designer',
    'backend-engineer',
    'frontend-engineer',
    'qa-engineer',
    'handoff-writer'
  ],
  'solution-architect': [
    'business-analyst',
    'ui-ux-designer',
    'backend-engineer',
    'frontend-engineer',
    'qa-engineer',
    'code-reviewer',
    'handoff-writer'
  ],
  'ui-ux-designer': [
    'business-analyst',
    'solution-architect',
    'frontend-engineer',
    'qa-engineer',
    'handoff-writer'
  ],
  'backend-engineer': [
    'business-analyst',
    'solution-architect',
    'frontend-engineer',
    'qa-engineer',
    'code-reviewer',
    'handoff-writer'
  ],
  'frontend-engineer': [
    'business-analyst',
    'solution-architect',
    'backend-engineer',
    'qa-engineer',
    'code-reviewer',
    'handoff-writer'
  ],
  'qa-engineer': [
    'business-analyst',
    'backend-engineer',
    'frontend-engineer',
    'code-reviewer',
    'handoff-writer'
  ],
  'bug-investigator': [
    'business-analyst',
    'solution-architect',
    'backend-engineer',
    'frontend-engineer',
    'qa-engineer',
    'handoff-writer'
  ],
  'code-reviewer': [
    'business-analyst',
    'solution-architect',
    'backend-engineer',
    'frontend-engineer',
    'qa-engineer',
    'handoff-writer'
  ],
  'handoff-writer': [
    'business-analyst',
    'solution-architect',
    'ui-ux-designer',
    'backend-engineer',
    'frontend-engineer',
    'qa-engineer',
    'bug-investigator',
    'code-reviewer'
  ]
};

export function getKnownRoles() {
  return [...knownRoles];
}

export function getAllowedTransitionTypes() {
  return [...allowedTransitionTypes].sort();
}

export function isKnownRole(role) {
  return knownRoles.includes(role);
}

export function isTerminalStepStatus(status) {
  return terminalStepStatuses.has(status);
}

export function assertTransitionAllowed(sourceRole, targetRole) {
  if (!isKnownRole(sourceRole)) {
    throw new Error(`Unknown source role: ${sourceRole}`);
  }
  if (!isKnownRole(targetRole)) {
    throw new Error(`Unknown target role: ${targetRole}`);
  }

  const allowedTargets = allowedTransitions[sourceRole] ?? [];
  if (!allowedTargets.includes(targetRole)) {
    throw new Error(`Transition ${sourceRole} -> ${targetRole} is not allowed`);
  }
}
