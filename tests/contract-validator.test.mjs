import assert from 'node:assert/strict';
import test from 'node:test';

import { loadRuntimeContracts } from '../runtime/contract-loader.mjs';
import {
  validateApproval,
  validateArtifactObject,
  validateHandoffObject,
  validateRunState,
  validateStepOutput
} from '../runtime/step-validator.mjs';

const contracts = await loadRuntimeContracts();

function validArtifact(overrides = {}) {
  return {
    name: 'Requirements',
    type: 'requirements',
    summary: 'Requirements artifact.',
    path: 'artifacts/001-business-analyst.md',
    ...overrides
  };
}

function validHandoff(overrides = {}) {
  return {
    source_role: 'business-analyst',
    target_role: 'solution-architect',
    goal: 'Add order status filtering.',
    scope: 'Requirements to architecture transfer.',
    confirmed: ['The user requested status filtering.'],
    decisions: ['Keep the existing orders list.'],
    assumptions: ['Order statuses already exist.'],
    open_questions: [],
    risks: ['Filtering must preserve permissions.'],
    artifacts: [validArtifact()],
    next_action: 'Design the API and data changes.',
    ...overrides
  };
}

function validStepOutput(overrides = {}) {
  return {
    role: 'business-analyst',
    status: 'handoff_ready',
    artifact_type: 'requirements',
    artifact: 'Requirements Draft\n\n- Add status filtering.',
    transition: {
      type: 'handoff',
      target_role: 'solution-architect'
    },
    handoff: validHandoff(),
    ...overrides
  };
}

test('loads runtime contracts and exposes role and artifact enums', () => {
  assert.ok(contracts.handoff.requiredFields.includes('source_role'));
  assert.ok(contracts.stepOutput.statuses.includes('handoff_ready'));
  assert.ok(contracts.artifact.types.includes('requirements'));
  assert.ok(contracts.runState.statuses.includes('awaiting_approval'));
  assert.ok(contracts.runState.statuses.includes('awaiting_role_acceptance'));
  assert.ok(contracts.runState.schema.properties.task_source);
  assert.ok(contracts.runState.schema.properties.tracker_sync);
});

test('validates a correct runtime step output', () => {
  assert.doesNotThrow(() => validateStepOutput(validStepOutput(), { activeRole: 'business-analyst', contracts }));
});

test('rejects missing required handoff fields', () => {
  const handoff = validHandoff();
  delete handoff.next_action;

  assert.throws(
    () => validateHandoffObject(handoff, contracts.handoff),
    /missing handoff field "next_action"/
  );
});

test('rejects unknown roles', () => {
  assert.throws(
    () => validateStepOutput(validStepOutput({ role: 'designer' }), { activeRole: 'business-analyst', contracts }),
    /invalid step role "designer"/
  );
});

test('rejects invalid artifact types', () => {
  assert.throws(
    () => validateArtifactObject(validArtifact({ type: 'wireframe' }), contracts.artifact),
    /artifact.type "wireframe" is not allowed/
  );
});

test('rejects transition target mismatches', () => {
  assert.throws(
    () => validateStepOutput(
      validStepOutput({
        transition: {
          type: 'handoff',
          target_role: 'frontend-engineer'
        }
      }),
      { activeRole: 'business-analyst', contracts }
    ),
    /transition.target_role must match handoff.target_role/
  );
});

test('rejects malformed approval records', () => {
  assert.throws(
    () => validateApproval({
      run_id: 'run-1',
      step_index: 1,
      action: 'maybe',
      created_at: new Date().toISOString()
    }, contracts.approval),
    /approval.action "maybe" is not allowed/
  );
});

test('accepts optional non-secret task source metadata on run state', () => {
  assert.doesNotThrow(() => validateRunState({
    run_id: 'run-1',
    status: 'awaiting_role_acceptance',
    user_prompt: 'Build from issue',
    project_root: 'C:/project',
    current_role: 'business-analyst',
    role_stack: [],
    step_index: 0,
    task_source: {
      type: 'gitlab',
      task_id: '123',
      task_url: 'https://gitlab.example/group/project/-/issues/123',
      source_url: 'https://gitlab.example/group/project'
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }, contracts.runState));
});

test('accepts optional tracker sync metadata on run state', () => {
  assert.doesNotThrow(() => validateRunState({
    run_id: 'run-1',
    status: 'awaiting_role_output',
    user_prompt: 'Build from issue',
    project_root: 'C:/project',
    current_role: 'context-router',
    role_stack: [],
    step_index: 0,
    tracker_sync: {
      status: 'failed',
      retryable: true,
      source: 'gitlab',
      task_id: '123',
      error: 'PUT issue #123 labels timed out after 10000ms',
      updated_at: new Date().toISOString()
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }, contracts.runState));
});
