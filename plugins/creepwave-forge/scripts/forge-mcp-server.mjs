import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { continueForgeRun, startForgeRun } from '../../../src/runtime/forge-runner.mjs';
import { invokeHeuristicRole } from '../../../src/runtime/heuristic-invoker.mjs';
import { RunStore } from '../../../src/runtime/run-store.mjs';

const serverInfo = {
  name: 'creepwave-forge',
  version: '0.1.0'
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const forgeRoot = path.resolve(scriptDir, '..', '..', '..');
const defaultProjectRoot = process.env.TRACKING_REFORGED_PROJECT_ROOT || 'C:\\projects\\tracking-reforged';
const defaultAdapterName = process.env.CREEPWAVE_FORGE_ADAPTER || 'Tracking-reforged';
const store = new RunStore({ root: forgeRoot });

const tools = [
  {
    name: 'forge_run',
    description: 'Start a Creepwave Forge run and execute exactly one visible step. Uses Tracking-reforged context by default.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['prompt'],
      properties: {
        prompt: {
          type: 'string',
          description: 'The original user task to route through Forge.'
        },
        projectPath: {
          type: 'string',
          description: 'Absolute project root path. Defaults to C:\\projects\\tracking-reforged.'
        },
        adapterName: {
          type: 'string',
          description: 'Forge adapter name. Defaults to Tracking-reforged.'
        },
      }
    }
  },
  {
    name: 'forge_continue',
    description: 'Execute exactly one next step for a paused Creepwave Forge run.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['runId'],
      properties: {
        runId: {
          type: 'string',
          description: 'Run id returned by forge_run.'
        }
      }
    }
  },
  {
    name: 'forge_status',
    description: 'Read a persisted Creepwave Forge run and display its step trace.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['runId'],
      properties: {
        runId: {
          type: 'string',
          description: 'Run id returned by forge_run.'
        }
      }
    }
  }
];

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  if (!line.trim()) return;

  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    writeError(null, -32700, `Invalid JSON: ${error.message}`);
    return;
  }

  if (message.method?.startsWith('notifications/')) {
    return;
  }

  try {
    const result = await handleRequest(message);
    if ('id' in message) {
      writeResult(message.id, result);
    }
  } catch (error) {
    writeError(message.id ?? null, -32000, error.message);
  }
});

async function handleRequest(message) {
  switch (message.method) {
    case 'initialize':
      return {
        protocolVersion: message.params?.protocolVersion || '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo
      };
    case 'tools/list':
      return { tools };
    case 'tools/call':
      return callTool(message.params?.name, message.params?.arguments ?? {});
    default:
      throw new Error(`Unsupported method: ${message.method}`);
  }
}

async function callTool(name, args) {
  if (name === 'forge_run') {
    return toolForgeRun(args);
  }
  if (name === 'forge_continue') {
    return toolForgeContinue(args);
  }
  if (name === 'forge_status') {
    return toolForgeStatus(args);
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function toolForgeRun(args) {
  const prompt = requireString(args.prompt, 'prompt');
  const projectRoot = args.projectPath || defaultProjectRoot;
  const adapterName = args.adapterName || defaultAdapterName;

  const result = await startForgeRun({
    root: forgeRoot,
    userPrompt: prompt,
    adapterName,
    projectRoot,
    store,
    invokeRole: invokeHeuristicRole
  });

  const stepTrace = await store.listStepOutputs(result.run.run_id);
  return textResult(formatStepResult({
    title: 'Forge Run Started',
    run: result.run,
    stepOutput: result.stepOutput,
    stepTrace,
    adapterName,
    projectRoot
  }));
}

async function toolForgeContinue(args) {
  const runId = requireString(args.runId, 'runId');
  const result = await continueForgeRun({
    root: forgeRoot,
    runId,
    store,
    invokeRole: invokeHeuristicRole
  });

  const stepTrace = await store.listStepOutputs(runId);
  if (result.alreadyTerminal) {
    return textResult(formatRunStatus({ run: result.run, stepTrace }));
  }

  return textResult(formatStepResult({
    title: 'Forge Step Continued',
    run: result.run,
    stepOutput: result.stepOutput,
    stepTrace,
    adapterName: result.run.adapter_name,
    projectRoot: result.run.project_root
  }));
}

async function toolForgeStatus(args) {
  const runId = requireString(args.runId, 'runId');
  const run = await store.loadRun(runId);
  const stepTrace = await store.listStepOutputs(runId);
  return textResult(formatRunStatus({ run, stepTrace }));
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function textResult(payload) {
  return {
    content: [
      {
        type: 'text',
        text: payload
      }
    ]
  };
}

function formatStepResult({ title, run, stepOutput, stepTrace, adapterName, projectRoot }) {
  const handoff = stepOutput.handoff;
  const lines = [
    `# ${title}`,
    '',
    `Run ID: ${run.run_id}`,
    `Run Status: ${run.status}`,
    `Adapter: ${adapterName ?? 'none'}`,
    `Project: ${projectRoot ?? 'none'}`,
    '',
    `## Step ${run.step_index}: ${stepOutput.role}`,
    '',
    `Active Skill: ${stepOutput.role}`,
    `Step Status: ${stepOutput.status}`,
    `Artifact Type: ${stepOutput.artifact_type}`,
    '',
    '### Skill Decision / Artifact',
    '',
    stepOutput.artifact,
    '',
    '### Handoff Contract',
    '',
    '```json',
    JSON.stringify(handoff, null, 2),
    '```',
    '',
    '### Transfer Summary',
    '',
    `source_role: ${handoff.source_role}`,
    `target_role: ${handoff.target_role}`,
    `next_action: ${handoff.next_action}`,
    ''
  ];

  if (handoff.open_questions.length > 0) {
    lines.push('### Open Questions', '');
    for (const question of handoff.open_questions) {
      lines.push(`- ${question}`);
    }
    lines.push('');
  }

  lines.push('### Trace So Far', '');
  for (const step of stepTrace) {
    lines.push(`- ${step.file}: ${step.output.role} -> ${step.output.handoff.target_role} (${step.output.status})`);
  }
  lines.push('');

  if (run.current_role) {
    lines.push('### Next Step', '');
    lines.push(`Next active skill: ${run.current_role}`);
    lines.push(`Next tool: forge_continue with runId "${run.run_id}"`);
  } else {
    lines.push('### Terminal State', '');
    lines.push(`Run stopped with status: ${run.status}`);
  }

  lines.push('', 'Note: deterministic provider is active; runtime step isolation is enforced, but full role artifacts still need a real LLM provider.');
  return lines.join('\n');
}

function formatRunStatus({ run, stepTrace }) {
  const lines = [
    '# Forge Run Status',
    '',
    `Run ID: ${run.run_id}`,
    `Run Status: ${run.status}`,
    `Current Role: ${run.current_role ?? 'none'}`,
    `Adapter: ${run.adapter_name ?? 'none'}`,
    `Project: ${run.project_root ?? 'none'}`,
    '',
    '## Step Trace',
    ''
  ];

  if (stepTrace.length === 0) {
    lines.push('No steps have been recorded yet.');
  }

  for (const step of stepTrace) {
    lines.push(`### ${step.file}`);
    lines.push('');
    lines.push(`Active Skill: ${step.output.role}`);
    lines.push(`Step Status: ${step.output.status}`);
    lines.push(`Artifact Type: ${step.output.artifact_type}`);
    lines.push('');
    lines.push('Skill Decision / Artifact:');
    lines.push(step.output.artifact);
    lines.push('');
    lines.push('Handoff Contract:');
    lines.push('```json');
    lines.push(JSON.stringify(step.output.handoff, null, 2));
    lines.push('```');
    lines.push('');
  }

  if (run.current_role) {
    lines.push(`Next tool: forge_continue with runId "${run.run_id}"`);
  }

  return lines.join('\n');
}

function writeResult(id, result) {
  writeMessage({
    jsonrpc: '2.0',
    id,
    result
  });
}

function writeError(id, code, message) {
  writeMessage({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message
    }
  });
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
