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
    loadProjectContext({ root, adapterName }),
    loadRuntimeContracts({ root })
  ]);

  const run = await store.createRun({ userPrompt, adapterName, initialRole });

  for (let index = 1; index <= maxSteps; index += 1) {
    run.step_index = index;
    const activeRole = run.current_role;
    const activeSkill = registry.get(activeRole);
    const prompt = buildStepPrompt({
      activeSkill,
      projectContext,
      originalUserPrompt: userPrompt,
      previousHandoff: run.previous_handoff,
      stepIndex: index
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
      return run;
    }

    run.current_role = nextRole;
    await store.saveRun(run);
  }

  run.status = 'blocked';
  run.blocked_reason = `Maximum step count exceeded: ${maxSteps}`;
  await store.saveRun(run);
  return run;
}
