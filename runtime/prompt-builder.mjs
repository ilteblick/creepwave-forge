import { selectRoleContext } from './role-context-selector.mjs';

const factoryRules = `# Creepwave Forge Runtime Rules

You are executing exactly one Creepwave Forge role for this step.

Rules:
- Use only the active role instructions included below.
- Do not perform work owned by downstream roles.
- Return one valid Runtime Step Output object.
- Include a transition object that says what kind of transfer this step requests.
- Include a handoff object compatible with contracts/handoff.schema.json.
- Treat referenced artifacts as upstream role outputs; use them as input, but keep the active role instructions authoritative.
- Treat human revision requests as direct feedback for the current role's next attempt.
- Use status "needs_clarification" when missing information can change scope, data, permissions, integrations, or core behavior.
- Use status "handoff_ready" only when the next role can act from the handoff.
- Use status "complete" only when no next role is needed.
- The runtime will pause for human approval after your output; do not ask the human to approve inside the artifact.

Transition types:
- "handoff": transfer ownership to transition.target_role.
- "clarification_request": stop and ask the user; target_role should be the current role so the same role resumes after the answer.
- "consultation_request": ask another role for input without permanently transferring ownership.
- "consultation_response": return input to the role that requested consultation.
- "complete": no next role is needed.
- "blocked": runtime, tool, project, or external constraints prevent safe progress.`;

const requiredOutputContract = `# Required Output

Return JSON only, with this exact Runtime Step Output shape:

{
  "role": "<active role>",
  "status": "<one of: needs_clarification, handoff_ready, blocked, complete>",
  "artifact_type": "<allowed artifact type>",
  "artifact": "<non-empty string artifact body>",
  "transition": { "type": "<transition type>" },
  "handoff": {
    "source_role": "<active role>",
    "target_role": "<known role>",
    "goal": "<non-empty string>",
    "scope": "<non-empty string, not an array>",
    "confirmed": ["<string>"],
    "decisions": ["<string>"],
    "assumptions": ["<string>"],
    "open_questions": ["<string>"],
    "risks": ["<string>"],
    "artifacts": [],
    "next_action": "<non-empty string>"
  }
}

Schema: contracts/step-output.schema.json

For status "handoff_ready", use transition.type "handoff" and include transition.target_role.
For status "needs_clarification", use transition.type "clarification_request" and include transition.questions or handoff.open_questions.
For status "blocked", use transition.type "blocked".
For status "complete", use transition.type "complete".
transition.target_role must match handoff.target_role when target_role is present.`;

export function buildRolePacket({
  run,
  registry,
  projectContext,
  previousHandoff = run.previous_handoff ?? null,
  referencedArtifacts = [],
  clarifications = [],
  revisionRequests = []
}) {
  const activeRole = run.current_role;
  const activeSkill = registry.get(activeRole);
  const stepIndex = run.step_index + 1;
  const roleContext = selectRoleContext({ projectContext, activeRole });
  const prompt = buildStepPrompt({
    activeSkill,
    projectContext,
    roleContext,
    originalUserPrompt: run.user_prompt,
    previousHandoff,
    referencedArtifacts,
    clarifications,
    revisionRequests,
    stepIndex
  });

  return {
    run_id: run.run_id,
    step_index: stepIndex,
    active_role: activeRole,
    active_skill: {
      role: activeSkill.role,
      path: activeSkill.path,
      description: activeSkill.description,
      text: activeSkill.text
    },
    project_context: summarizeProjectContext(projectContext),
    role_context: roleContext,
    original_user_prompt: run.user_prompt,
    previous_handoff: previousHandoff,
    previous_transition: run.previous_transition ?? null,
    role_stack: run.role_stack ?? [],
    referenced_artifacts: referencedArtifacts,
    clarifications,
    revision_requests: revisionRequests,
    required_output: {
      schema: 'contracts/step-output.schema.json',
      active_role: activeRole,
      instruction: 'Codex must execute this role and submit one Runtime Step Output object with role, status, artifact_type, artifact, transition, and handoff.'
    },
    prompt
  };
}

export function buildStepPrompt({
  activeSkill,
  projectContext,
  roleContext = null,
  originalUserPrompt,
  previousHandoff = null,
  referencedArtifacts = [],
  clarifications = [],
  revisionRequests = [],
  stepIndex = 1
}) {
  if (!activeSkill?.role || !activeSkill?.text) {
    throw new Error('activeSkill with role and text is required');
  }
  if (!originalUserPrompt || originalUserPrompt.trim() === '') {
    throw new Error('originalUserPrompt is required');
  }

  return [
    factoryRules,
    `# Step\n${stepIndex}`,
    `# Active Role\n${activeSkill.role}`,
    `# Active Skill Instructions\n${activeSkill.text}`,
    `# Project Context\n${roleContext?.text ?? projectContext?.text ?? 'No project context provided.'}`,
    `# Original User Prompt\n${originalUserPrompt}`,
    `# Incoming Handoff\n${formatJsonOrNone(previousHandoff)}`,
    `# Referenced Artifacts\n${formatArtifacts(referencedArtifacts)}`,
    `# User Clarifications\n${formatTextArtifacts(clarifications, 'No user clarifications.')}`,
    `# Human Revision Requests\n${formatTextArtifacts(revisionRequests, 'No revision requests.')}`,
    requiredOutputContract
  ].join('\n\n');
}

function summarizeProjectContext(projectContext) {
  if (!projectContext) {
    return {
      projectRoot: null,
      files: [],
      source: null,
      snapshotPath: null
    };
  }

  return {
    projectRoot: projectContext.projectRoot ?? null,
    files: (projectContext.files ?? []).map((file) => ({
      path: file.path,
      relativePath: file.relativePath
    })),
    source: projectContext.source ?? null,
    snapshotPath: projectContext.snapshotPath ?? null
  };
}

function formatJsonOrNone(value) {
  return value ? JSON.stringify(value, null, 2) : 'None. This is the first role step for the run.';
}

function formatArtifacts(artifacts) {
  if (!artifacts || artifacts.length === 0) {
    return 'None.';
  }

  return artifacts.map((artifact) => [
    `## ${artifact.path}`,
    `Name: ${artifact.name}`,
    `Type: ${artifact.type}`,
    `Summary: ${artifact.summary}`,
    '',
    artifact.text?.trim() ?? ''
  ].join('\n')).join('\n\n');
}

function formatTextArtifacts(artifacts, emptyText) {
  if (!artifacts || artifacts.length === 0) {
    return emptyText;
  }

  return artifacts.map((artifact) => [
    `## ${artifact.path ?? artifact.file}`,
    artifact.text.trim()
  ].join('\n')).join('\n\n');
}
