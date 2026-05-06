import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { runForge } from '../src/runtime/forge-runner.mjs';
import { buildStepPrompt } from '../src/runtime/prompt-builder.mjs';
import { RunStore } from '../src/runtime/run-store.mjs';
import { loadSkillRegistry } from '../src/runtime/skill-registry.mjs';
import { assertTransitionAllowed } from '../src/runtime/transition-policy.mjs';
import { loadRuntimeContracts, validateStepOutput } from '../src/runtime/step-validator.mjs';

const root = process.cwd();

const weatherPrompt = 'Make a weather forecast for the main cities of Russia. Show the current forecast as a visual element on a map. Show 10 days of weather history on the map. Store everything in my own database.';

function makeHandoff({ sourceRole, targetRole, goal = weatherPrompt, openQuestions = [] }) {
  return {
    source_role: sourceRole,
    target_role: targetRole,
    goal,
    scope: 'Route and clarify the weather map feature before implementation.',
    confirmed: [
      'The user wants current forecast data shown on a map.',
      'The user wants weather history for 10 days.',
      'The user wants weather data stored in their own database.'
    ],
    decisions: [],
    assumptions: [],
    open_questions: openQuestions,
    risks: [
      'Provider choice affects API contracts, cost, rate limits, and historical data availability.'
    ],
    artifacts: [],
    next_action: openQuestions.length > 0
      ? 'Ask the user to resolve blocking product and data-source questions before architecture or implementation.'
      : 'Prepare role-specific requirements for the next runtime step.'
  };
}

function makeStepOutput({ role, status, artifactType, artifact, targetRole, openQuestions = [] }) {
  return {
    role,
    status,
    artifact_type: artifactType,
    artifact,
    handoff: makeHandoff({
      sourceRole: role,
      targetRole,
      openQuestions
    })
  };
}

async function testPromptBuilderUsesOnlyActiveSkill() {
  const registry = await loadSkillRegistry({ root });
  const businessAnalyst = registry.get('business-analyst');
  const prompt = buildStepPrompt({
    activeSkill: businessAnalyst,
    projectContext: { text: 'Project context stub.' },
    originalUserPrompt: weatherPrompt,
    previousHandoff: null,
    stepIndex: 1
  });

  assert.match(prompt, /# Active Role\nbusiness-analyst/);
  assert.match(prompt, /# Business Analyst/);
  assert.doesNotMatch(prompt, /# Backend Engineer/);
  assert.doesNotMatch(prompt, /# Frontend Engineer/);
  assert.doesNotMatch(prompt, /# QA Engineer/);
}

async function testWeatherRunStopsAtBusinessClarification() {
  const runsDir = await mkdtemp(path.join(os.tmpdir(), 'creepwave-forge-runtime-'));
  const store = new RunStore({ root, runsDir });
  const invokedRoles = [];

  try {
    const run = await runForge({
      root,
      userPrompt: weatherPrompt,
      store,
      invokeRole: async ({ role, prompt }) => {
        invokedRoles.push(role);
        if (role === 'context-router') {
          assert.doesNotMatch(prompt, /# Backend Engineer/);
          return makeStepOutput({
            role,
            status: 'handoff_ready',
            artifactType: 'selected-role',
            artifact: 'Selected Role: business-analyst\nReason: The request is broad and product-shaped.',
            targetRole: 'business-analyst'
          });
        }

        if (role === 'business-analyst') {
          assert.doesNotMatch(prompt, /# Backend Engineer/);
          return makeStepOutput({
            role,
            status: 'needs_clarification',
            artifactType: 'clarification',
            artifact: [
              'Clarification Needed',
              '- Which cities count as main cities of Russia?',
              '- Which weather provider or API should be used?',
              '- Does 10 days of history mean provider historical data or locally accumulated history?',
              '- Which database should store forecasts and history?',
              '- How often should forecast data refresh?'
            ].join('\n'),
            targetRole: 'business-analyst',
            openQuestions: [
              'Which cities count as main cities of Russia?',
              'Which weather provider or API should be used?',
              'Does 10 days of history mean provider historical data or locally accumulated history?',
              'Which database should store forecasts and history?',
              'How often should forecast data refresh?'
            ]
          });
        }

        throw new Error(`Unexpected role invocation: ${role}`);
      }
    });

    assert.deepEqual(invokedRoles, ['context-router', 'business-analyst']);
    assert.equal(run.status, 'needs_clarification');
    assert.equal(run.current_role, null);

    const steps = await store.listSteps(run.run_id);
    assert.deepEqual(steps, [
      '001-context-router.json',
      '002-business-analyst.json'
    ]);

    const persistedRun = JSON.parse(await readFile(path.join(runsDir, run.run_id, 'run.json'), 'utf8'));
    assert.equal(persistedRun.status, 'needs_clarification');
  } finally {
    await rm(runsDir, { recursive: true, force: true });
  }
}

async function testTransitionPolicyRejectsInvalidTarget() {
  assert.throws(
    () => assertTransitionAllowed('context-router', 'context-router'),
    /Transition context-router -> context-router is not allowed/
  );
}

async function testRunnerRejectsInvalidTransitionBeforePersistingStep() {
  const runsDir = await mkdtemp(path.join(os.tmpdir(), 'creepwave-forge-runtime-invalid-'));
  const store = new RunStore({ root, runsDir });

  try {
    await assert.rejects(
      () => runForge({
        root,
        userPrompt: weatherPrompt,
        store,
        invokeRole: async ({ role }) => makeStepOutput({
          role,
          status: 'handoff_ready',
          artifactType: 'selected-role',
          artifact: 'Invalidly routes context-router back to itself.',
          targetRole: 'context-router'
        })
      }),
      /Transition context-router -> context-router is not allowed/
    );

    const runDirs = await readdir(runsDir);
    assert.equal(runDirs.length, 1);
    const steps = await store.listSteps(runDirs[0]);
    assert.deepEqual(steps, []);
  } finally {
    await rm(runsDir, { recursive: true, force: true });
  }
}

async function testStepOutputValidationRejectsRoleBleed() {
  const contracts = await loadRuntimeContracts({ root });
  const output = makeStepOutput({
    role: 'frontend-engineer',
    status: 'handoff_ready',
    artifactType: 'frontend-summary',
    artifact: 'Frontend work was attempted from the wrong active role.',
    targetRole: 'qa-engineer'
  });

  assert.throws(
    () => validateStepOutput(output, { activeRole: 'business-analyst', contracts }),
    /does not match active role/
  );
}

await testPromptBuilderUsesOnlyActiveSkill();
await testWeatherRunStopsAtBusinessClarification();
await testTransitionPolicyRejectsInvalidTarget();
await testRunnerRejectsInvalidTransitionBeforePersistingStep();
await testStepOutputValidationRejectsRoleBleed();

console.log('Runtime validation passed: prompt isolation, weather clarification stop, transition policy, and step validation.');
