import { getKnownRoles } from '../core/transition-policy.mjs';

export const forgeMarkerLabel = 'forge';

export const forgeStatusLabels = [
  'forge:ready',
  'forge:running',
  'forge:waiting-role',
  'forge:waiting-approval',
  'forge:needs-input',
  'forge:blocked',
  'forge:done',
  'forge:failed'
];

export const forgeRoleLabels = getKnownRoles()
  .map((role) => `forge-role:${role}`)
  .sort();

const runStatusToLabel = new Map([
  ['created', 'forge:running'],
  ['awaiting_role_output', 'forge:running'],
  ['awaiting_role_acceptance', 'forge:waiting-role'],
  ['awaiting_approval', 'forge:waiting-approval'],
  ['needs_clarification', 'forge:needs-input'],
  ['revision_requested', 'forge:running'],
  ['paused', 'forge:blocked'],
  ['blocked', 'forge:blocked'],
  ['complete', 'forge:done']
]);

export function statusLabelForRunStatus(status) {
  return runStatusToLabel.get(status) ?? 'forge:failed';
}

export function roleLabelForRole(role) {
  return role ? `forge-role:${role}` : null;
}

export function labelsForRun(run) {
  const labels = [
    forgeMarkerLabel,
    statusLabelForRunStatus(run?.status)
  ];
  const roleLabel = roleLabelForRole(run?.current_role);
  if (roleLabel) {
    labels.push(roleLabel);
  }
  return labels;
}

export function isForgeOwnedLabel(label) {
  return label === forgeMarkerLabel
    || forgeStatusLabels.includes(label)
    || forgeRoleLabels.includes(label);
}

export function mergeForgeLabels(currentLabels = [], desiredLabels = []) {
  return uniqueLabels([
    ...currentLabels.filter((label) => !isForgeOwnedLabel(label)),
    ...desiredLabels
  ]);
}

function uniqueLabels(labels) {
  return [...new Set(labels.filter((label) => typeof label === 'string' && label.trim() !== ''))];
}
