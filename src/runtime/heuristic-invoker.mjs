export async function invokeHeuristicRole({ role, run }) {
  const prompt = run.user_prompt;

  if (role === 'context-router') {
    const targetRole = selectInitialRole(prompt);
    return makeStepOutput({
      role,
      status: 'handoff_ready',
      artifactType: 'selected-role',
      artifact: `Selected Role: ${targetRole}\nReason: ${selectionReason(prompt, targetRole)}`,
      targetRole,
      prompt
    });
  }

  if (role === 'business-analyst') {
    const openQuestions = buildBusinessQuestions(prompt);
    if (openQuestions.length > 0) {
      return makeStepOutput({
        role,
        status: 'needs_clarification',
        artifactType: 'clarification',
        artifact: [
          'Clarification Needed',
          ...openQuestions.map((question) => `- ${question}`)
        ].join('\n'),
        targetRole: role,
        prompt,
        openQuestions,
        nextAction: 'Ask the user to answer the blocking questions before routing to architecture, design, or implementation.'
      });
    }

    return makeStepOutput({
      role,
      status: 'handoff_ready',
      artifactType: 'requirements',
      artifact: 'Requirements Draft can proceed with safe assumptions.',
      targetRole: 'solution-architect',
      prompt
    });
  }

  return makeStepOutput({
    role,
    status: 'blocked',
    artifactType: 'other',
    artifact: `Heuristic provider does not execute ${role}. Connect a real LLM provider for this role.`,
    targetRole: role,
    prompt,
    risks: ['A real model provider is required to produce role-specific artifacts beyond deterministic routing and BA clarification.'],
    nextAction: 'Connect an invokeRole provider that calls the model with the active role prompt.'
  });
}

function selectInitialRole(prompt) {
  const normalized = prompt.toLowerCase();
  if (/(review|ревью|pr|pull request|diff)/i.test(prompt)) return 'code-reviewer';
  if (/(bug|ошибк|падает|failing|stack trace|traceback|flaky)/i.test(prompt)) return 'bug-investigator';
  if (/(test plan|qa|тест[- ]?план|провер)/i.test(prompt)) return 'qa-engineer';
  if (/(backend|api|endpoint|database|db|бд|сервер|миграц|auth|permission)/i.test(prompt) && !touchesUi(normalized)) {
    return 'backend-engineer';
  }
  if (touchesUi(normalized) && !touchesBackend(normalized)) {
    return 'frontend-engineer';
  }
  if (isProductShaped(prompt)) return 'business-analyst';
  if (touchesUi(normalized) && touchesBackend(normalized)) return 'solution-architect';
  return 'business-analyst';
}

function selectionReason(prompt, targetRole) {
  if (targetRole === 'business-analyst') {
    return 'The request is product-shaped, cross-layer, and has unresolved decisions that can change scope.';
  }
  if (targetRole === 'solution-architect') {
    return 'The request crosses UI, API, data, or rollout boundaries.';
  }
  return `The request appears narrow enough for ${targetRole}.`;
}

function buildBusinessQuestions(prompt) {
  const questions = [];
  const normalized = prompt.toLowerCase();

  if (/(основн|main).*(город|cities)|город.*росси|cities.*russia/i.test(prompt)) {
    questions.push('Which cities count as the main cities of Russia?');
  }
  if (/(weather|погод|forecast|прогноз)/i.test(prompt)) {
    questions.push('Which weather provider or API should be used?');
  }
  if (/(history|истори).*(10|десять)|10.*(history|истори)/i.test(prompt)) {
    questions.push('Does 10 days of weather history mean historical provider data or locally accumulated history after launch?');
  }
  if (/(database|db|бд|баз.*данн|store|хран)/i.test(prompt)) {
    questions.push('Which database should store forecast and history data?');
  }
  if (/(forecast|прогноз|current|текущ)/i.test(prompt)) {
    questions.push('How often should current forecast data refresh?');
  }
  if (touchesUi(normalized)) {
    questions.push('Which map provider and UI constraints should be used for the forecast visualization?');
  }

  return dedupe(questions);
}

function isProductShaped(prompt) {
  return /(сделай|хочу|need|add|create|build|добавь|реализуй)/i.test(prompt) && touchesBackend(prompt.toLowerCase()) && touchesUi(prompt.toLowerCase());
}

function touchesUi(normalized) {
  return /(ui|frontend|front|map|карт|visual|визуал|screen|экран|page|страниц|component|компонент|table|таблиц|форма)/i.test(normalized);
}

function touchesBackend(normalized) {
  return /(backend|api|database|db|бд|баз.*данн|хран|store|server|сервер|endpoint|data|данн|integration|интеграц)/i.test(normalized);
}

function dedupe(values) {
  return [...new Set(values)];
}

function makeStepOutput({
  role,
  status,
  artifactType,
  artifact,
  targetRole,
  prompt,
  openQuestions = [],
  risks = ['The deterministic provider is only a routing and clarification fallback.'],
  nextAction = 'Proceed to the selected next role.'
}) {
  return {
    role,
    status,
    artifact_type: artifactType,
    artifact,
    handoff: {
      source_role: role,
      target_role: targetRole,
      goal: prompt,
      scope: 'Step-by-step Forge orchestration for the submitted user task.',
      confirmed: ['Original user prompt was received by the Forge runtime.'],
      decisions: [],
      assumptions: ['A real model provider is not connected; deterministic fallback was used.'],
      open_questions: openQuestions,
      risks,
      artifacts: [],
      next_action: nextAction
    }
  };
}
