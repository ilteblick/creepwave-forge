import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertTransitionAllowed,
  getAllowedTransitionTypes,
  getKnownRoles,
  isKnownRole,
  isTerminalStepStatus
} from '../runtime/core/transition-policy.mjs';

test('exposes known roles from the base role set', () => {
  assert.deepEqual(getKnownRoles(), [
    'backend-engineer',
    'bug-investigator',
    'business-analyst',
    'code-reviewer',
    'context-router',
    'frontend-engineer',
    'handoff-writer',
    'qa-engineer',
    'solution-architect',
    'ui-ux-designer'
  ]);
  assert.equal(isKnownRole('context-router'), true);
});

test('allows context-router to route to any downstream base role', () => {
  assert.doesNotThrow(() => assertTransitionAllowed('context-router', 'business-analyst'));
  assert.doesNotThrow(() => assertTransitionAllowed('context-router', 'frontend-engineer'));
  assert.doesNotThrow(() => assertTransitionAllowed('context-router', 'handoff-writer'));
});

test('rejects transitions outside role policy', () => {
  assert.throws(
    () => assertTransitionAllowed('business-analyst', 'bug-investigator'),
    /Transition business-analyst -> bug-investigator is not allowed/
  );
});

test('exposes terminal step statuses and transition types', () => {
  assert.equal(isTerminalStepStatus('complete'), true);
  assert.equal(isTerminalStepStatus('blocked'), true);
  assert.equal(isTerminalStepStatus('needs_clarification'), true);
  assert.equal(isTerminalStepStatus('handoff_ready'), false);
  assert.deepEqual(getAllowedTransitionTypes(), [
    'blocked',
    'clarification_request',
    'complete',
    'consultation_request',
    'consultation_response',
    'handoff'
  ]);
});
