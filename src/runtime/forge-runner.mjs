import { assertTransitionAllowed, isTerminalStatus } from './transition-policy.mjs';
import { buildStepPrompt } from './prompt-builder.mjs';
import { loadProjectContext } from './project-context-loader.mjs';
import { RunStore } from './run-store.mjs';
import { loadSkillRegistry } from './skill-registry.mjs';
import { loadRuntimeContracts, validateStepOutput } from './step-validator.mjs';

export async function runForge({
  root = process.cwd(),
  userPrompt,
  adapterName = null,
  projectRoot = null,
  initialRole = 'context-router',
  maxSteps = 12,
  invokeRole,
  store = new RunStore({ root })
} = {}) {
  if (!userPrompt || userPrompt.trim() === '') {
    throw new Error('userPrompt is required');
  }
  if (typeof invokeRole !== 'function') {
    throw new Error('invokeRole callback is required');
  }

  const [registry, projectContext, contracts] = await Promise.all([
    loadSkillRegistry({ root }),
    loadProjectContext({ root, adapterName, projectRoot }),
    loadRuntimeContracts({ root })
  ]);

  const run = await store.createRun({ userPrompt, adapterName, projectRoot, initialRole });

  for (let index = 1; index <= maxSteps; index += 1) {
    await executeForgeStep({
      run,
      registry,
      projectContext,
      contracts,
      invokeRole,
      store,
      pauseAfterStep: false
    });

    if (run.current_role === null) {
      return run;
    }
  }

  run.status = 'blocked';
  run.blocked_reason = `Maximum step count exceeded: ${maxSteps}`;
  await store.saveRun(run);
  return run;
}

export async function startForgeRun({
  root = process.cwd(),
  userPrompt,
  adapterName = null,
  projectRoot = null,
  initialRole = 'context-router',
  invokeRole,
  store = new RunStore({ root })
} = {}) {
  if (!userPrompt || userPrompt.trim() === '') {
    throw new Error('userPrompt is required');
  }
  if (typeof invokeRole !== 'function') {
    throw new Error('invokeRole callback is required');
  }

  const run = await store.createRun({ userPrompt, adapterName, projectRoot, initialRole });
  return continueForgeRun({ root, runId: run.run_id, invokeRole, store });
}

export async function continueForgeRun({
  root = process.cwd(),
  runId,
  invokeRole,
  store = new RunStore({ root })
} = {}) {
  if (!runId || runId.trim() === '') {
    throw new Error('runId is required');
  }
  if (typeof invokeRole !== 'function') {
    throw new Error('invokeRole callback is required');
  }

  const run = await store.loadRun(runId);
  if (!run.current_role) {
    return {
      run,
      stepOutput: null,
      alreadyTerminal: true
    };
  }

  const [registry, projectContext, contracts] = await Promise.all([
    loadSkillRegistry({ root }),
    loadProjectContext({ root, adapterName: run.adapter_name, projectRoot: run.project_root }),
    loadRuntimeContracts({ root })
  ]);

  const stepOutput = await executeForgeStep({
    run,
    registry,
    projectContext,
    contracts,
    invokeRole,
    store,
    pauseAfterStep: true
  });

  return {
    run,
    stepOutput,
    alreadyTerminal: false
  };
}

async function executeForgeStep({
  run,
  registry,
  projectContext,
  contracts,
  invokeRole,
  store,
  pauseAfterStep
}) {
  run.step_index += 1;
  const activeRole = run.current_role;
  const activeSkill = registry.get(activeRole);
  const prompt = buildStepPrompt({
    activeSkill,
    projectContext,
    originalUserPrompt: run.user_prompt,
    previousHandoff: run.previous_handoff,
    stepIndex: run.step_index
  });

  const stepOutput = await invokeRole({
    role: activeRole,
    prompt,
    run,
    projectContext,
    previousHandoff: run.previous_handoff
  });

  validateStepOutput(stepOutput, { activeRole, contracts });
  const nextRole = stepOutput.handoff.target_role;
  const isTerminalStep = isTerminalStatus(stepOutput.status);
  if (!isTerminalStep) {
    assertTransitionAllowed(activeRole, nextRole);
  }

  await store.saveStep(run, stepOutput);
  run.previous_handoff = stepOutput.handoff;

  if (isTerminalStep) {
    run.status = stepOutput.status;
    run.current_role = null;
    await store.saveRun(run);
    return stepOutput;
  }

  run.current_role = nextRole;
  run.status = pauseAfterStep ? 'paused' : 'running';
  await store.saveRun(run);
  return stepOutput;
}
