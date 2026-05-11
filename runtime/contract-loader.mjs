import { readFile } from 'node:fs/promises';
import path from 'node:path';

const contractFiles = {
  artifact: 'artifact.schema.json',
  handoff: 'handoff.schema.json',
  stepOutput: 'step-output.schema.json',
  approval: 'approval.schema.json',
  runState: 'run-state.schema.json'
};

export async function loadRuntimeContracts({ root = process.cwd() } = {}) {
  const contractsDir = path.join(root, 'contracts');
  const [artifactSchema, handoffSchema, stepOutputSchema, approvalSchema, runStateSchema] = await Promise.all([
    readJson(path.join(contractsDir, contractFiles.artifact)),
    readJson(path.join(contractsDir, contractFiles.handoff)),
    readJson(path.join(contractsDir, contractFiles.stepOutput)),
    readJson(path.join(contractsDir, contractFiles.approval)),
    readJson(path.join(contractsDir, contractFiles.runState))
  ]);

  const roles = handoffSchema.$defs?.role?.enum ?? [];
  const artifactTypes = artifactSchema.$defs?.artifactType?.enum ?? [];

  return {
    root,
    contractsDir,
    artifact: {
      schema: artifactSchema,
      requiredFields: artifactSchema.required ?? [],
      roles,
      types: artifactTypes
    },
    handoff: {
      schema: handoffSchema,
      requiredFields: handoffSchema.required ?? [],
      roles,
      artifactTypes
    },
    stepOutput: {
      schema: stepOutputSchema,
      requiredFields: stepOutputSchema.required ?? [],
      roles,
      statuses: stepOutputSchema.properties?.status?.enum ?? [],
      artifactTypes,
      transitionTypes: stepOutputSchema.properties?.transition?.properties?.type?.enum ?? []
    },
    approval: {
      schema: approvalSchema,
      requiredFields: approvalSchema.required ?? [],
      actions: approvalSchema.properties?.action?.enum ?? []
    },
    runState: {
      schema: runStateSchema,
      requiredFields: runStateSchema.required ?? [],
      roles,
      statuses: runStateSchema.properties?.status?.enum ?? []
    }
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}
