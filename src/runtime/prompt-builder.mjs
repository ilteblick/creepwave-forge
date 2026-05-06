const factoryRules = `# Creepwave Forge Runtime Rules

You are executing exactly one Creepwave Forge role for this step.

Rules:
- Use only the active role instructions included below.
- Do not perform work owned by downstream roles.
- Return one valid Runtime Step Output object.
- Include a handoff object compatible with contracts/handoff.schema.json.
- Use status "needs_clarification" when missing information can change scope, data, permissions, integrations, or core behavior.
- Use status "handoff_ready" only when the next role can act from the handoff.
- Use status "complete" only when no next role is needed.
`;

export function buildStepPrompt({
  activeSkill,
  projectContext,
  originalUserPrompt,
  previousHandoff = null,
  stepIndex = 1
}) {
  if (!activeSkill?.role || !activeSkill?.text) {
    throw new Error('activeSkill with role and text is required');
  }
  if (!originalUserPrompt || originalUserPrompt.trim() === '') {
    throw new Error('originalUserPrompt is required');
  }

  const handoffText = previousHandoff
    ? JSON.stringify(previousHandoff, null, 2)
    : 'None. This is the first role step for the run.';

  return [
    factoryRules,
    `# Step\n${stepIndex}`,
    `# Active Role\n${activeSkill.role}`,
    `# Active Skill Instructions\n${activeSkill.text}`,
    `# Project Context\n${projectContext?.text ?? 'No project context provided.'}`,
    `# Original User Prompt\n${originalUserPrompt}`,
    `# Incoming Handoff\n${handoffText}`,
    `# Required Output\nReturn JSON only, with this shape: role, status, artifact_type, artifact, handoff.`
  ].join('\n\n');
}
