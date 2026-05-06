import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { runForge } from '../../../src/runtime/forge-runner.mjs';
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
    description: 'Run a user prompt through the Creepwave Forge step-by-step runtime. Uses Tracking-reforged context by default.',
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
        maxSteps: {
          type: 'integer',
          minimum: 1,
          maximum: 12,
          description: 'Maximum runtime steps. Defaults to 4 for interactive Codex use.'
        }
      }
    }
  },
  {
    name: 'forge_status',
    description: 'Read a persisted Creepwave Forge run by run id.',
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
  if (name === 'forge_status') {
    return toolForgeStatus(args);
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function toolForgeRun(args) {
  const prompt = requireString(args.prompt, 'prompt');
  const projectRoot = args.projectPath || defaultProjectRoot;
  const adapterName = args.adapterName || defaultAdapterName;
  const maxSteps = args.maxSteps ?? 4;

  const invokedRoles = [];
  const run = await runForge({
    root: forgeRoot,
    userPrompt: prompt,
    adapterName,
    projectRoot,
    maxSteps,
    store,
    invokeRole: async (input) => {
      invokedRoles.push(input.role);
      return invokeHeuristicRole(input);
    }
  });

  const steps = await store.listSteps(run.run_id);
  return textResult({
    runId: run.run_id,
    status: run.status,
    adapterName,
    projectRoot,
    invokedRoles,
    steps,
    handoff: run.previous_handoff,
    note: 'This plugin currently uses the deterministic Forge provider. It enforces step isolation and clarification stops, but does not yet call a real LLM provider.'
  });
}

async function toolForgeStatus(args) {
  const runId = requireString(args.runId, 'runId');
  const run = await store.loadRun(runId);
  const steps = await store.listSteps(runId);
  return textResult({ run, steps });
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
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
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
