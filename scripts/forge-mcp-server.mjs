import { createInterface } from 'node:readline';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  answerClarification,
  approveStep,
  continueRun,
  getStatus,
  publishRunState,
  rejectHandoff,
  requestChanges,
  startRun,
  startRunFromTask,
  syncTaskRunLabels,
  submitStep
} from '../runtime/forge-runner.mjs';
import { labelsForRun } from '../runtime/forge-board-labels.mjs';

const serverInfo = {
  name: 'creepwave-forge',
  version: '0.1.0'
};

export const toolDefinitions = [
  {
    name: 'forge_run',
    description: 'Start a Creepwave Forge run for an explicit project path, create a run branch when git is available, and return the first role packet.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['prompt', 'projectPath'],
      properties: {
        prompt: {
          type: 'string',
          description: 'The original user task to route through Forge.'
        },
        projectPath: {
          type: 'string',
          description: 'Absolute project root path for loading project context.'
        }
      }
    }
  },
  {
    name: 'forge_run_task',
    description: 'Start a Creepwave Forge run from a project task source configured in .env.forge, using a task id such as #123.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['taskId', 'projectPath'],
      properties: {
        taskId: {
          type: 'string',
          description: 'Task id in the configured source, for example #123 for GitLab.'
        },
        projectPath: {
          type: 'string',
          description: 'Absolute project root path containing .env.forge and project context.'
        }
      }
    }
  },
  {
    name: 'forge_continue',
    description: 'Return the next active role packet for a Forge run, resolving runId from forge/active-run.json when omitted.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['projectPath'],
      properties: {
        runId: {
          type: 'string',
          description: 'Run id returned by forge_run. Optional when forge/active-run.json exists in the current branch.'
        },
        projectPath: {
          type: 'string',
          description: 'Absolute project root path for the project-scoped run.'
        }
      }
    }
  },
  {
    name: 'forge_submit_step',
    description: 'Validate and persist a Codex-produced Runtime Step Output for the active role, resolving runId from forge/active-run.json when omitted.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['projectPath', 'stepOutput'],
      properties: {
        runId: {
          type: 'string',
          description: 'Run id returned by forge_run. Optional when forge/active-run.json exists in the current branch.'
        },
        projectPath: {
          type: 'string',
          description: 'Absolute project root path for the project-scoped run.'
        },
        stepOutput: {
          type: 'object',
          description: 'Runtime Step Output object produced by Codex.'
        }
      }
    }
  },
  {
    name: 'forge_approve',
    description: 'Human-only approval gate. Use only after the latest user message explicitly approves the pending role output; then accept the output and prepare its transition. Resolves runId from forge/active-run.json when omitted.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['projectPath', 'humanApproval'],
      properties: {
        runId: {
          type: 'string',
          description: 'Run id returned by forge_run. Optional when forge/active-run.json exists in the current branch.'
        },
        projectPath: {
          type: 'string',
          description: 'Absolute project root path for the project-scoped run.'
        },
        humanApproval: {
          type: 'string',
          description: 'Exact human approval text from the latest user message, for example "approve", "approved", "продолжай", or "апрув". Do not invent this value.'
        },
        note: {
          type: 'string',
          description: 'Optional human approval note.'
        }
      }
    }
  },
  {
    name: 'forge_request_changes',
    description: 'Reject a pending role output and request same-role revisions. Resolves runId from forge/active-run.json when omitted.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['projectPath', 'instructions'],
      properties: {
        runId: {
          type: 'string',
          description: 'Run id returned by forge_run. Optional when forge/active-run.json exists in the current branch.'
        },
        projectPath: {
          type: 'string',
          description: 'Absolute project root path for the project-scoped run.'
        },
        instructions: {
          type: 'string',
          description: 'Human revision instructions for the current role.'
        }
      }
    }
  },
  {
    name: 'forge_reject_handoff',
    description: 'Reject an approved handoff before the receiving role starts work, returning the run to the sending role with revision instructions. Resolves runId from forge/active-run.json when omitted.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['projectPath', 'instructions'],
      properties: {
        runId: {
          type: 'string',
          description: 'Run id returned by forge_run. Optional when forge/active-run.json exists in the current branch.'
        },
        projectPath: {
          type: 'string',
          description: 'Absolute project root path for the project-scoped run.'
        },
        instructions: {
          type: 'string',
          description: 'Receiver-side rejection instructions explaining why the accepted handoff is being returned.'
        }
      }
    }
  },
  {
    name: 'forge_answer',
    description: 'Persist user clarification answers and make the run resumable. Resolves runId from forge/active-run.json when omitted.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['projectPath', 'answersText'],
      properties: {
        runId: {
          type: 'string',
          description: 'Run id returned by forge_run. Optional when forge/active-run.json exists in the current branch.'
        },
        projectPath: {
          type: 'string',
          description: 'Absolute project root path for the project-scoped run.'
        },
        answersText: {
          type: 'string',
          description: 'User clarification answers as markdown or plain text.'
        }
      }
    }
  },
  {
    name: 'forge_status',
    description: 'Read a persisted Forge run and display its trace and next allowed action. Resolves runId from forge/active-run.json when omitted.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['projectPath'],
      properties: {
        runId: {
          type: 'string',
          description: 'Run id returned by forge_run. Optional when forge/active-run.json exists in the current branch.'
        },
        projectPath: {
          type: 'string',
          description: 'Absolute project root path for the project-scoped run.'
        }
      }
    }
  },
  {
    name: 'forge_sync_task',
    description: 'Retry tracker label synchronization for an existing task-backed Forge run without advancing workflow state.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['projectPath'],
      properties: {
        runId: {
          type: 'string',
          description: 'Run id returned by forge_run_task. Optional when forge/active-run.json exists in the current branch.'
        },
        projectPath: {
          type: 'string',
          description: 'Absolute project root path for the project-scoped run.'
        }
      }
    }
  },
  {
    name: 'forge_publish',
    description: 'Commit the current Forge run state for git handoff without approving or changing workflow state. Resolves runId from forge/active-run.json when omitted.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['projectPath'],
      properties: {
        runId: {
          type: 'string',
          description: 'Run id returned by forge_run. Optional when forge/active-run.json exists in the current branch.'
        },
        projectPath: {
          type: 'string',
          description: 'Absolute project root path for the project-scoped run.'
        },
        message: {
          type: 'string',
          description: 'Optional git commit message for publishing the current run state.'
        }
      }
    }
  }
];

export async function handleRequest(message) {
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
      return { tools: toolDefinitions };
    case 'tools/call':
      return callTool(message.params?.name, message.params?.arguments ?? {});
    default:
      throw new Error(`Unsupported method: ${message.method}`);
  }
}

export async function callTool(name, args = {}) {
  if (!toolDefinitions.some((tool) => tool.name === name)) {
    throw new Error(`Unknown tool: ${name}`);
  }

  if (name === 'forge_run') {
    const result = await startRun({
      projectPath: requireString(args.projectPath, 'projectPath'),
      userPrompt: requireString(args.prompt, 'prompt')
    });
    return textResult(formatRolePacketResult('Forge Run Started', result));
  }

  if (name === 'forge_run_task') {
    const result = await startRunFromTask({
      projectPath: requireString(args.projectPath, 'projectPath'),
      taskId: requireString(args.taskId, 'taskId')
    });
    return textResult(formatTaskRolePacketResult('Forge Task Run Started', result));
  }

  if (name === 'forge_continue') {
    const result = await continueRun({
      projectPath: requireString(args.projectPath, 'projectPath'),
      runId: optionalString(args.runId, 'runId')
    });
    return textResult(result.rolePacket
      ? formatRolePacketResult('Forge Role Packet', result)
      : formatStatusResult(result.status ?? await getStatus({
        projectPath: args.projectPath,
        runId: optionalString(args.runId, 'runId')
      })));
  }

  if (name === 'forge_submit_step') {
    const result = await submitStep({
      projectPath: requireString(args.projectPath, 'projectPath'),
      runId: optionalString(args.runId, 'runId'),
      stepOutput: requireObject(args.stepOutput, 'stepOutput')
    });
    return textResult(formatSubmitResult(result));
  }

  if (name === 'forge_approve') {
    const humanApproval = requireString(args.humanApproval, 'humanApproval');
    const result = await approveStep({
      projectPath: requireString(args.projectPath, 'projectPath'),
      runId: optionalString(args.runId, 'runId'),
      note: args.note ?? humanApproval
    });
    if (result.rolePacket) {
      return textResult(formatRolePacketResult('Forge Role Packet', result));
    }
    return textResult(result.run.status === 'awaiting_role_acceptance'
      ? formatAcceptedHandoffResult(result)
      : formatTerminalTransitionResult(result));
  }

  if (name === 'forge_request_changes') {
    const result = await requestChanges({
      projectPath: requireString(args.projectPath, 'projectPath'),
      runId: optionalString(args.runId, 'runId'),
      instructions: requireString(args.instructions, 'instructions')
    });
    return textResult(formatRolePacketResult('Forge Changes Requested', result));
  }

  if (name === 'forge_reject_handoff') {
    const result = await rejectHandoff({
      projectPath: requireString(args.projectPath, 'projectPath'),
      runId: optionalString(args.runId, 'runId'),
      instructions: requireString(args.instructions, 'instructions')
    });
    return textResult(formatRolePacketResult('Forge Handoff Rejected', result));
  }

  if (name === 'forge_answer') {
    const result = await answerClarification({
      projectPath: requireString(args.projectPath, 'projectPath'),
      runId: optionalString(args.runId, 'runId'),
      answersText: requireString(args.answersText, 'answersText')
    });
    return textResult(formatRolePacketResult('Forge Clarification Answered', result));
  }

  if (name === 'forge_status') {
    const status = await getStatus({
      projectPath: requireString(args.projectPath, 'projectPath'),
      runId: optionalString(args.runId, 'runId')
    });
    return textResult(formatStatusResult(status));
  }

  if (name === 'forge_sync_task') {
    const result = await syncTaskRunLabels({
      projectPath: requireString(args.projectPath, 'projectPath'),
      runId: optionalString(args.runId, 'runId')
    });
    return textResult(formatSyncTaskResult(result));
  }

  if (name === 'forge_publish') {
    const result = await publishRunState({
      projectPath: requireString(args.projectPath, 'projectPath'),
      runId: optionalString(args.runId, 'runId'),
      message: args.message ?? null
    });
    return textResult(formatPublishResult(result));
  }

  throw new Error(`Unhandled tool: ${name}`);
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

function requireString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function optionalString(value, field) {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireString(value, field);
}

function requireObject(value, field) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value;
}

function formatRolePacketResult(title, { run, rolePacket, runDir, labelSync }) {
  const lines = [
    `# ${title}`,
    '',
    `Run ID: ${run.run_id}`,
    `Run Status: ${run.status}`,
    `Current Role: ${run.current_role ?? 'none'}`,
    `Run Summary: ${runSummaryPath(runDir)}`,
    `Run Files: ${runDir}`,
    '',
    `## Step ${rolePacket.step_index}: ${rolePacket.active_role}`,
    '',
    '### Role Packet',
    '',
    '```json',
    JSON.stringify(rolePacketSummary(rolePacket), null, 2),
    '```',
    '',
    '### Role Prompt',
    '',
    rolePacket.prompt,
    ''
  ];

  lines.push(...formatLabelSyncSection(labelSync), '');

  lines.push(
    '### Required Next Action',
    '',
    `Execute ${rolePacket.active_role}, then call forge_submit_step with runId "${run.run_id}".`
  );

  return lines.join('\n');
}

function formatTaskRolePacketResult(title, result) {
  return [
    formatRolePacketResult(title, result),
    '',
    '## Source Task',
    '',
    ...formatSourceTaskSummary(result.sourceTask),
    '',
    '## Recommended Board Labels',
    '',
    ...labelsForRun(result.run).map((label) => `- ${label}`)
  ].join('\n');
}

function formatSubmitResult({ run, stepOutput, labelSync, runDir }) {
  const lines = [
    '# Forge Step Submitted',
    '',
    `Run ID: ${run.run_id}`,
    `Run Status: ${run.status}`,
    `Current Role: ${run.current_role ?? 'none'}`,
    `Run Summary: ${runSummaryPath(runDir)}`,
    `Run Files: ${runDir}`,
    '',
    `Step Status: ${stepOutput.status}`,
    `Artifact Type: ${stepOutput.artifact_type}`,
    `Transition Type: ${stepOutput.transition?.type ?? 'none'}`,
    '',
    '### Pending Approval',
    '',
    'The role output has been persisted. The transition has not been applied.',
    '',
    'Stop now and show this pending output to the human. Do not call forge_approve yourself.',
    ''
  ];

  lines.push(...formatLabelSyncSection(labelSync), '');

  lines.push(
    'Human-only next actions:',
    '- forge_approve, only when the latest user message explicitly approves this pending output',
    '- forge_request_changes, only when the latest user message asks for revisions',
    '',
    '### Handoff Contract',
    '',
    '```json',
    JSON.stringify(stepOutput.handoff, null, 2),
    '```'
  );

  return lines.join('\n');
}

function formatTerminalTransitionResult({ run, stepOutput, labelSync, runDir }) {
  return [
    '# Forge Terminal Transition Applied',
    '',
    `Run ID: ${run.run_id}`,
    `Run Status: ${run.status}`,
    `Current Role: ${run.current_role ?? 'none'}`,
    `Run Summary: ${runSummaryPath(runDir)}`,
    `Run Files: ${runDir}`,
    '',
    `Applied Transition: ${stepOutput.transition?.type ?? 'none'}`,
    '',
    ...formatLabelSyncSection(labelSync),
    '',
    'No active role packet is available because the run is terminal or waiting for clarification.'
  ].join('\n');
}

function formatAcceptedHandoffResult({ run, stepOutput, labelSync, runDir }) {
  return [
    '# Forge Handoff Accepted',
    '',
    `Run ID: ${run.run_id}`,
    `Run Status: ${run.status}`,
    `Current Role: ${run.current_role ?? 'none'}`,
    `Run Summary: ${runSummaryPath(runDir)}`,
    `Run Files: ${runDir}`,
    '',
    `Accepted Transition: ${stepOutput.transition?.type ?? 'none'}`,
    `Next Role: ${run.current_role ?? 'none'}`,
    '',
    ...formatLabelSyncSection(labelSync),
    '',
    '### Required Next Action',
    '',
    `The previous role output is approved. The next role must inspect the accepted handoff, then call forge_continue with runId "${run.run_id}" to start its role packet.`
  ].join('\n');
}

function formatStatusResult(status) {
  const lines = [
    '# Forge Run Status',
    '',
    `Run ID: ${status.run.run_id}`,
    `Run Status: ${status.status}`,
    `Current Role: ${status.currentRole ?? 'none'}`,
    `Run Summary: ${runSummaryPath(status.runDir, status.runSummaryPath)}`,
    `Run Files: ${status.runDir}`,
    `Pending Approval: ${status.pendingApproval ?? 'none'}`,
    '',
    '## Recommended Board Labels',
    '',
    ...labelsForRun(status.run).map((label) => `- ${label}`),
    '',
    ...formatLabelSyncSection(status.labelSync),
    '',
    '## Next Allowed Actions',
    ''
  ];

  if (status.nextAllowedActions.length === 0) {
    lines.push('None.');
  } else if (status.status === 'awaiting_approval') {
    lines.push('Human approval is required. Stop and wait for the user to explicitly choose one of:');
    for (const action of status.nextAllowedActions) {
      lines.push(`- ${action}`);
    }
  } else if (status.status === 'awaiting_role_acceptance') {
    lines.push(`The handoff has been approved. ${status.currentRole ?? 'The next role'} must inspect it and choose:`);
    for (const action of status.nextAllowedActions) {
      lines.push(`- ${action}`);
    }
  } else {
    for (const action of status.nextAllowedActions) {
      lines.push(`- ${action}`);
    }
  }

  if (status.timelineStepPaths?.length > 0) {
    lines.push('', '## Timeline Step Folders', '');
    for (const stepPath of status.timelineStepPaths) {
      lines.push(`- ${stepPath}`);
    }
  }

  if (status.timelineManifestPaths?.length > 0) {
    lines.push('', '## Timeline Manifests', '');
    for (const manifestPath of status.timelineManifestPaths) {
      lines.push(`- ${manifestPath}`);
    }
  }

  lines.push('', '## Step Trace', '');
  if (status.stepTrace.length === 0) {
    lines.push('No steps recorded.');
  } else {
    for (const step of status.stepTrace) {
      lines.push(`- ${step}`);
    }
  }

  lines.push('', '## Artifacts', '');
  if (status.artifacts.length === 0) {
    lines.push('No artifacts recorded.');
  } else {
    for (const artifact of status.artifacts) {
      lines.push(`- ${artifact}`);
    }
  }

  if (status.revisions.length > 0) {
    lines.push('', '## Revision Requests', '');
    for (const revision of status.revisions) {
      lines.push(`- ${revision}`);
    }
  }

  if (status.clarifications.length > 0) {
    lines.push('', '## Clarifications', '');
    for (const clarification of status.clarifications) {
      lines.push(`- ${clarification}`);
    }
  }

  if (canPublishStatus(status.status)) {
    lines.push(
      '',
      '## Optional Git Transfer',
      '',
      'Use forge_publish to commit the current run state for handoff without approving or changing workflow state.'
    );
  }

  return lines.join('\n');
}

function formatPublishResult({ run, gitCommit, labelSync, runDir }) {
  const lines = [
    '# Forge Run Published',
    '',
    `Run ID: ${run.run_id}`,
    `Run Status: ${run.status}`,
    `Current Role: ${run.current_role ?? 'none'}`,
    `Run Summary: ${runSummaryPath(runDir)}`,
    `Run Files: ${runDir}`,
    '',
    'Workflow state was not advanced.'
  ];

  lines.push('', ...formatLabelSyncSection(labelSync));

  if (gitCommit.committed) {
    lines.push('', `Git Commit: ${gitCommit.commit}`);
  } else {
    lines.push('', `Git Commit: skipped (${gitCommit.reason})`);
  }

  return lines.join('\n');
}

function formatSyncTaskResult({ run, labelSync, runDir }) {
  return [
    '# Forge Task Labels Synced',
    '',
    `Run ID: ${run.run_id}`,
    `Run Status: ${run.status}`,
    `Current Role: ${run.current_role ?? 'none'}`,
    `Run Summary: ${runSummaryPath(runDir)}`,
    `Run Files: ${runDir}`,
    '',
    ...formatLabelSyncSection(labelSync),
    '',
    'Workflow state was not advanced.'
  ].join('\n');
}

function formatLabelSyncSection(labelSync) {
  if (!labelSync) {
    return [
      '## Tracker Label Sync',
      '',
      'Not available.'
    ];
  }
  if (labelSync.skipped) {
    return [
      '## Tracker Label Sync',
      '',
      `Skipped: ${labelSync.reason}`
    ];
  }
  if (labelSync.failed) {
    return [
      '## Tracker Label Sync',
      '',
      `Failed: ${labelSync.error}`,
      `Retryable: ${labelSync.retryable ? 'yes' : 'no'}`,
      ...(labelSync.source ? [`Source: ${labelSync.source}`] : []),
      ...(labelSync.task_id ? [`Task ID: ${labelSync.task_id}`] : [])
    ];
  }

  return [
    '## Tracker Label Sync',
    '',
    `Source: ${labelSync.source}`,
    `Task ID: ${labelSync.task_id}`,
    `Desired Labels: ${labelSync.desiredLabels.join(', ')}`,
    `Applied Labels: ${labelSync.appliedLabels.join(', ')}`
  ];
}

function canPublishStatus(status) {
  return ['awaiting_approval', 'needs_clarification', 'revision_requested'].includes(status);
}

function formatSourceTaskSummary(task) {
  return [
    `Source Type: ${task.source?.type ?? 'unknown'}`,
    `Task ID: ${task.id ?? ''}`,
    `Task URL: ${task.source?.task_url ?? task.source?.url ?? ''}`,
    `Title: ${task.title ?? ''}`,
    `Labels: ${Array.isArray(task.labels) && task.labels.length > 0 ? task.labels.join(', ') : '(none)'}`,
    `Comments: ${Array.isArray(task.comments) ? task.comments.length : 0}`
  ];
}

function runSummaryPath(runDir, relativePath = 'README.md') {
  return path.join(runDir, relativePath);
}

function rolePacketSummary(rolePacket) {
  return {
    run_id: rolePacket.run_id,
    step_index: rolePacket.step_index,
    active_role: rolePacket.active_role,
    active_skill: {
      role: rolePacket.active_skill.role,
      path: rolePacket.active_skill.path,
      description: rolePacket.active_skill.description
    },
    original_user_prompt: rolePacket.original_user_prompt,
    previous_handoff: rolePacket.previous_handoff,
    previous_transition: rolePacket.previous_transition,
    role_stack: rolePacket.role_stack,
    project_context: rolePacket.project_context,
    role_context: {
      files: rolePacket.role_context.files.map((file) => file.relativePath ?? file.path),
      full_context_path: rolePacket.role_context.full_context_path,
      filtered: rolePacket.role_context.filtered,
      note: rolePacket.role_context.note
    },
    referenced_artifacts: rolePacket.referenced_artifacts.map((artifact) => artifact.path),
    clarifications: rolePacket.clarifications.map((artifact) => artifact.path),
    revision_requests: rolePacket.revision_requests.map((artifact) => artifact.path),
    required_output: rolePacket.required_output
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

function startServer() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  let stdinClosed = false;
  let pendingRequests = 0;

  rl.on('line', async (line) => {
    if (!line.trim()) return;

    pendingRequests += 1;
    try {
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
    } finally {
      pendingRequests -= 1;
      if (stdinClosed && pendingRequests === 0) {
        process.exit(0);
      }
    }
  });

  rl.on('close', () => {
    stdinClosed = true;
    if (pendingRequests === 0) {
      process.exit(0);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
