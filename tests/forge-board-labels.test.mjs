import assert from 'node:assert/strict';
import test from 'node:test';

import {
  forgeMarkerLabel,
  forgeRoleLabels,
  forgeStatusLabels,
  isForgeOwnedLabel,
  labelsForRun,
  mergeForgeLabels,
  roleLabelForRole,
  statusLabelForRunStatus
} from '../runtime/tasks/forge-board-labels.mjs';

test('maps run statuses to Forge board status labels', () => {
  assert.equal(statusLabelForRunStatus('created'), 'forge:running');
  assert.equal(statusLabelForRunStatus('awaiting_role_output'), 'forge:running');
  assert.equal(statusLabelForRunStatus('awaiting_role_acceptance'), 'forge:waiting-role');
  assert.equal(statusLabelForRunStatus('awaiting_approval'), 'forge:waiting-approval');
  assert.equal(statusLabelForRunStatus('needs_clarification'), 'forge:needs-input');
  assert.equal(statusLabelForRunStatus('blocked'), 'forge:blocked');
  assert.equal(statusLabelForRunStatus('paused'), 'forge:blocked');
  assert.equal(statusLabelForRunStatus('complete'), 'forge:done');
  assert.equal(statusLabelForRunStatus('unknown'), 'forge:failed');
});

test('creates role labels for every known Forge role', () => {
  assert.equal(roleLabelForRole('context-router'), 'forge-role:context-router');
  assert.equal(roleLabelForRole('business-analyst'), 'forge-role:business-analyst');
  assert.equal(roleLabelForRole('solution-architect'), 'forge-role:solution-architect');
  assert.equal(roleLabelForRole('ui-ux-designer'), 'forge-role:ui-ux-designer');
  assert.equal(roleLabelForRole('backend-engineer'), 'forge-role:backend-engineer');
  assert.equal(roleLabelForRole('frontend-engineer'), 'forge-role:frontend-engineer');
  assert.equal(roleLabelForRole('bug-investigator'), 'forge-role:bug-investigator');
  assert.equal(roleLabelForRole('qa-engineer'), 'forge-role:qa-engineer');
  assert.equal(roleLabelForRole('code-reviewer'), 'forge-role:code-reviewer');
  assert.equal(roleLabelForRole('handoff-writer'), 'forge-role:handoff-writer');
  assert.equal(roleLabelForRole(null), null);
});

test('returns marker, current status, and current role labels for a run', () => {
  assert.deepEqual(labelsForRun({
    status: 'awaiting_approval',
    current_role: 'backend-engineer'
  }), [
    'forge',
    'forge:waiting-approval',
    'forge-role:backend-engineer'
  ]);
});

test('exports the full marker/status/role label vocabulary', () => {
  assert.equal(forgeMarkerLabel, 'forge');
  assert.ok(forgeStatusLabels.includes('forge:ready'));
  assert.ok(forgeStatusLabels.includes('forge:waiting-role'));
  assert.ok(forgeStatusLabels.includes('forge:failed'));
  assert.ok(forgeRoleLabels.includes('forge-role:context-router'));
  assert.ok(forgeRoleLabels.includes('forge-role:handoff-writer'));
});

test('detects Forge-owned labels', () => {
  assert.equal(isForgeOwnedLabel('forge'), true);
  assert.equal(isForgeOwnedLabel('forge:running'), true);
  assert.equal(isForgeOwnedLabel('forge:waiting-role'), true);
  assert.equal(isForgeOwnedLabel('forge:ready'), true);
  assert.equal(isForgeOwnedLabel('forge-role:backend-engineer'), true);
  assert.equal(isForgeOwnedLabel('customer'), false);
  assert.equal(isForgeOwnedLabel('forged'), false);
});

test('merges desired Forge labels while preserving unrelated labels', () => {
  assert.deepEqual(mergeForgeLabels([
    'customer',
    'forge',
    'forge:ready',
    'forge-role:frontend-engineer',
    'priority-high'
  ], [
    'forge',
    'forge:running',
    'forge-role:backend-engineer'
  ]), [
    'customer',
    'priority-high',
    'forge',
    'forge:running',
    'forge-role:backend-engineer'
  ]);
});
