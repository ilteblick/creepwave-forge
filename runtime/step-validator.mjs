import { loadRuntimeContracts } from './contract-loader.mjs';

export async function validateStepOutputWithLoadedContracts(stepOutput, options = {}) {
  const contracts = await loadRuntimeContracts(options);
  return validateStepOutput(stepOutput, { ...options, contracts });
}

export function validateStepOutput(stepOutput, { activeRole, contracts } = {}) {
  const runtimeContracts = requireContracts(contracts);
  const errors = [];

  if (!isPlainObject(stepOutput)) {
    throw new Error('Runtime step output must be an object');
  }

  for (const field of runtimeContracts.stepOutput.requiredFields) {
    if (!(field in stepOutput)) {
      errors.push(`missing step output field "${field}"`);
    }
  }

  if (!runtimeContracts.stepOutput.roles.includes(stepOutput.role)) {
    errors.push(`invalid step role "${stepOutput.role}"`);
  }
  if (activeRole && stepOutput.role !== activeRole) {
    errors.push(`step role "${stepOutput.role}" does not match active role "${activeRole}"`);
  }
  if (!runtimeContracts.stepOutput.statuses.includes(stepOutput.status)) {
    errors.push(`invalid status "${stepOutput.status}"`);
  }
  if (!runtimeContracts.stepOutput.artifactTypes.includes(stepOutput.artifact_type)) {
    errors.push(`invalid artifact_type "${stepOutput.artifact_type}"`);
  }
  if (typeof stepOutput.artifact !== 'string' || stepOutput.artifact.trim() === '') {
    errors.push('"artifact" must be a non-empty string');
  }

  errors.push(...validateTransitionObject(stepOutput.transition, stepOutput, runtimeContracts.stepOutput));
  errors.push(...collectValidationErrors(() => validateHandoffObject(stepOutput.handoff, runtimeContracts.handoff)));

  if (errors.length > 0) {
    throw new Error(`Invalid runtime step output:\n- ${errors.join('\n- ')}`);
  }
}

export function validateHandoffObject(handoff, contract) {
  const errors = [];
  if (!isPlainObject(handoff)) {
    throw new Error('handoff must be an object');
  }

  for (const field of contract.requiredFields) {
    if (!(field in handoff)) {
      errors.push(`missing handoff field "${field}"`);
    }
  }

  if (!contract.roles.includes(handoff.source_role)) {
    errors.push(`invalid source_role "${handoff.source_role}"`);
  }
  if (!contract.roles.includes(handoff.target_role)) {
    errors.push(`invalid target_role "${handoff.target_role}"`);
  }

  for (const field of ['goal', 'scope', 'next_action']) {
    if (typeof handoff[field] !== 'string' || handoff[field].trim() === '') {
      errors.push(`"${field}" must be a non-empty string`);
    }
  }

  for (const field of ['confirmed', 'decisions', 'assumptions', 'open_questions', 'risks']) {
    errors.push(...validateStringArray(handoff[field], field));
  }

  if (!Array.isArray(handoff.artifacts)) {
    errors.push('"artifacts" must be an array');
  } else {
    for (const [index, artifact] of handoff.artifacts.entries()) {
      errors.push(...collectValidationErrors(
        () => validateArtifactObject(artifact, {
          requiredFields: ['name', 'type', 'summary'],
          roles: contract.roles,
          types: contract.artifactTypes
        }),
        `artifacts[${index}]: `
      ));
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
}

export function validateArtifactObject(artifact, contract) {
  const errors = [];
  if (!isPlainObject(artifact)) {
    throw new Error('artifact must be an object');
  }

  for (const field of contract.requiredFields) {
    if (!(field in artifact)) {
      errors.push(`missing artifact field "${field}"`);
    }
  }

  for (const field of ['name', 'summary']) {
    if (typeof artifact[field] !== 'string' || artifact[field].trim() === '') {
      errors.push(`artifact.${field} must be a non-empty string`);
    }
  }
  if (!contract.types.includes(artifact.type)) {
    errors.push(`artifact.type "${artifact.type}" is not allowed`);
  }
  if (artifact.path !== undefined && (typeof artifact.path !== 'string' || artifact.path.trim() === '')) {
    errors.push('artifact.path must be a non-empty string when provided');
  }
  if (artifact.metadata_path !== undefined && (
    typeof artifact.metadata_path !== 'string' || artifact.metadata_path.trim() === ''
  )) {
    errors.push('artifact.metadata_path must be a non-empty string when provided');
  }
  if (artifact.source_role !== undefined && !contract.roles.includes(artifact.source_role)) {
    errors.push(`artifact.source_role "${artifact.source_role}" is not allowed`);
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
}

export function validateApproval(approval, contract) {
  const errors = [];
  if (!isPlainObject(approval)) {
    throw new Error('approval must be an object');
  }

  for (const field of contract.requiredFields) {
    if (!(field in approval)) {
      errors.push(`missing approval field "${field}"`);
    }
  }

  if (typeof approval.run_id !== 'string' || approval.run_id.trim() === '') {
    errors.push('approval.run_id must be a non-empty string');
  }
  if (!Number.isInteger(approval.step_index) || approval.step_index < 1) {
    errors.push('approval.step_index must be an integer >= 1');
  }
  if (!contract.actions.includes(approval.action)) {
    errors.push(`approval.action "${approval.action}" is not allowed`);
  }
  if (typeof approval.created_at !== 'string' || approval.created_at.trim() === '') {
    errors.push('approval.created_at must be a non-empty string');
  }
  if (approval.action === 'changes_requested' && (
    typeof approval.instructions !== 'string' || approval.instructions.trim() === ''
  )) {
    errors.push('approval.instructions is required for changes_requested');
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
}

export function validateRunState(run, contract) {
  const errors = [];
  if (!isPlainObject(run)) {
    throw new Error('run state must be an object');
  }

  for (const field of contract.requiredFields) {
    if (!(field in run)) {
      errors.push(`missing run field "${field}"`);
    }
  }
  if (!contract.statuses.includes(run.status)) {
    errors.push(`run.status "${run.status}" is not allowed`);
  }
  if (run.current_role !== null && !contract.roles.includes(run.current_role)) {
    errors.push(`run.current_role "${run.current_role}" is not allowed`);
  }
  if (!Array.isArray(run.role_stack) || run.role_stack.some((role) => !contract.roles.includes(role))) {
    errors.push('run.role_stack must contain only known roles');
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
}

export function validateTransitionObject(transition, stepOutput, contract) {
  const errors = [];
  if (!isPlainObject(transition)) {
    return ['transition must be an object'];
  }

  if (!contract.transitionTypes.includes(transition.type)) {
    errors.push(`invalid transition.type "${transition.type}"`);
  }

  const compatibleStatuses = {
    handoff: ['handoff_ready'],
    clarification_request: ['needs_clarification'],
    consultation_request: ['handoff_ready'],
    consultation_response: ['handoff_ready'],
    complete: ['complete'],
    blocked: ['blocked']
  };
  const allowedStatuses = compatibleStatuses[transition.type] ?? [];
  if (allowedStatuses.length > 0 && !allowedStatuses.includes(stepOutput.status)) {
    errors.push(`transition.type "${transition.type}" is not compatible with status "${stepOutput.status}"`);
  }

  if (requiresTargetRole(transition.type) && !transition.target_role) {
    errors.push(`transition.type "${transition.type}" requires target_role`);
  }
  if (transition.target_role && transition.target_role !== stepOutput.handoff?.target_role) {
    errors.push('transition.target_role must match handoff.target_role');
  }

  for (const field of ['target_role', 'return_role']) {
    if (transition[field] !== undefined && !contract.roles.includes(transition[field])) {
      errors.push(`transition.${field} "${transition[field]}" is not a known role`);
    }
  }

  if (transition.type === 'clarification_request') {
    const transitionQuestions = Array.isArray(transition.questions) ? transition.questions : [];
    const handoffQuestions = Array.isArray(stepOutput.handoff?.open_questions) ? stepOutput.handoff.open_questions : [];
    if (transitionQuestions.length === 0 && handoffQuestions.length === 0) {
      errors.push('clarification_request requires transition.questions or handoff.open_questions');
    }
  }
  if (transition.questions !== undefined) {
    errors.push(...validateStringArray(transition.questions, 'transition.questions'));
  }

  return errors;
}

function requireContracts(contracts) {
  if (!contracts) {
    throw new Error('contracts are required');
  }
  return contracts;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateStringArray(value, field) {
  const errors = [];
  if (!Array.isArray(value)) {
    return [`"${field}" must be an array`];
  }
  for (const [index, item] of value.entries()) {
    if (typeof item !== 'string' || item.trim() === '') {
      errors.push(`"${field}[${index}]" must be a non-empty string`);
    }
  }
  return errors;
}

function collectValidationErrors(fn, prefix = '') {
  try {
    fn();
    return [];
  } catch (error) {
    return String(error.message)
      .split('\n')
      .filter(Boolean)
      .map((message) => `${prefix}${message}`);
  }
}

function requiresTargetRole(type) {
  return type === 'handoff'
    || type === 'consultation_request'
    || type === 'consultation_response';
}
