export const terminalStatuses = new Set([
  'needs_clarification',
  'blocked',
  'complete'
]);

export const allowedStatuses = new Set([
  'needs_clarification',
  'handoff_ready',
  'blocked',
  'complete'
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
    'qa-engineer',
    'code-reviewer',
    'handoff-writer'
  ],
  'qa-engineer': [
    'backend-engineer',
    'frontend-engineer',
    'code-reviewer',
    'handoff-writer'
  ],
  'bug-investigator': [
    'backend-engineer',
    'frontend-engineer',
    'qa-engineer',
    'handoff-writer'
  ],
  'code-reviewer': [
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
  return Object.keys(allowedTransitions).sort();
}

export function isKnownRole(role) {
  return Object.prototype.hasOwnProperty.call(allowedTransitions, role);
}

export function isTerminalStatus(status) {
  return terminalStatuses.has(status);
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
