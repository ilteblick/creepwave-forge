import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { allowedStatuses, getKnownRoles } from './transition-policy.mjs';

const knownRoles = new Set(getKnownRoles());

export async function loadRuntimeContracts({ root = process.cwd() } = {}) {
  const contractsDir = path.join(root, 'contracts');
  const [handoffSchema, stepOutputSchema] = await Promise.all([
    readJson(path.join(contractsDir, 'handoff.schema.json')),
    readJson(path.join(contractsDir, 'step-output.schema.json'))
  ]);

  return {
    handoff: {
      schema: handoffSchema,
      requiredFields: handoffSchema.required ?? [],
      roles: handoffSchema.$defs?.role?.enum ?? [],
      artifactTypes: handoffSchema.properties?.artifacts?.items?.properties?.type?.enum ?? []
    },
    stepOutput: {
      schema: stepOutputSchema,
      requiredFields: stepOutputSchema.required ?? [],
      statuses: stepOutputSchema.properties?.status?.enum ?? [],
      artifactTypes: stepOutputSchema.properties?.artifact_type?.enum ?? []
    }
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export function validateStepOutput(stepOutput, { activeRole, contracts } = {}) {
  const errors = [];
  const runtimeContracts = contracts ?? {
    handoff: {
      requiredFields: [
        'source_role',
        'target_role',
        'goal',
        'scope',
        'confirmed',
        'decisions',
        'assumptions',
        'open_questions',
        'risks',
        'artifacts',
        'next_action'
      ],
      roles: [...knownRoles],
      artifactTypes: [
        'requirements',
        'technical-design',
        'ui-ux-handoff',
        'backend-summary',
        'frontend-summary',
        'qa-plan',
        'qa-validation',
        'bug-investigation',
        'review-findings',
        'role-handoff',
        'release-notes',
        'other'
      ]
    },
    stepOutput: {
      requiredFields: ['role', 'status', 'artifact_type', 'artifact', 'handoff'],
      statuses: [...allowedStatuses],
      artifactTypes: [
        'requirements',
        'technical-design',
        'ui-ux-handoff',
        'backend-summary',
        'frontend-summary',
        'qa-plan',
        'qa-validation',
        'bug-investigation',
        'review-findings',
        'role-handoff',
        'release-notes',
        'selected-role',
        'clarification',
        'other'
      ]
    }
  };

  if (typeof stepOutput !== 'object' || stepOutput === null || Array.isArray(stepOutput)) {
    throw new Error('Runtime step output must be an object');
  }

  for (const field of runtimeContracts.stepOutput.requiredFields) {
    if (!(field in stepOutput)) {
      errors.push(`missing step output field "${field}"`);
    }
  }

  if (!runtimeContracts.handoff.roles.includes(stepOutput.role)) {
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

  errors.push(...validateHandoffObject(stepOutput.handoff, runtimeContracts.handoff));

  if (errors.length > 0) {
    throw new Error(`Invalid runtime step output:\n- ${errors.join('\n- ')}`);
  }
}

export function validateHandoffObject(handoff, contract) {
  const errors = [];
  if (typeof handoff !== 'object' || handoff === null || Array.isArray(handoff)) {
    return ['handoff must be an object'];
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
    if (!Array.isArray(handoff[field])) {
      errors.push(`"${field}" must be an array`);
      continue;
    }
    for (const [index, item] of handoff[field].entries()) {
      if (typeof item !== 'string' || item.trim() === '') {
        errors.push(`"${field}[${index}]" must be a non-empty string`);
      }
    }
  }

  if (!Array.isArray(handoff.artifacts)) {
    errors.push('"artifacts" must be an array');
    return errors;
  }

  for (const [index, artifact] of handoff.artifacts.entries()) {
    if (typeof artifact !== 'object' || artifact === null || Array.isArray(artifact)) {
      errors.push(`artifacts[${index}] must be an object`);
      continue;
    }
    for (const field of ['name', 'type', 'summary']) {
      if (typeof artifact[field] !== 'string' || artifact[field].trim() === '') {
        errors.push(`artifacts[${index}].${field} must be a non-empty string`);
      }
    }
    if (!contract.artifactTypes.includes(artifact.type)) {
      errors.push(`artifacts[${index}].type "${artifact.type}" is not allowed`);
    }
  }

  return errors;
}
