import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRolePacket, buildStepPrompt } from '../runtime/core/prompt-builder.mjs';
import { loadSkillRegistry } from '../runtime/core/skill-registry.mjs';

test('loads base skills by role with frontmatter metadata', async () => {
  const registry = await loadSkillRegistry();
  const router = registry.get('context-router');

  assert.equal(router.role, 'context-router');
  assert.match(router.path, /skills[\\/]base[\\/]context-router[\\/]SKILL\.md/);
  assert.match(router.description, /choose the next base role/i);
  assert.match(router.text, /# Context Router/);
});

test('context-router preserves API contract-impact routing guidance', async () => {
  const registry = await loadSkillRegistry();
  const router = registry.get('context-router');

  assert.match(
    router.text,
    /backend controller or endpoint change is consumed by a frontend application or external client/
  );
  assert.match(router.text, /choose `solution-architect` first/);
  assert.match(router.text, /authorization, response\/request shape, URL, HTTP method, permissions, error semantics, or tenant scoping/);
  assert.match(
    router.text,
    /clear backend-only implementation or verification involving APIs[\s\S]+no consumer-facing API contract decision is involved/
  );
});

test('builds role packet prompt with context, artifacts, clarification, revision, and schema instruction', async () => {
  const registry = await loadSkillRegistry();
  const activeSkill = registry.get('business-analyst');
  const prompt = buildStepPrompt({
    activeSkill,
    projectContext: {
      text: '# Project Agent File: AGENTS.md\nSource: /tmp/project/AGENTS.md\n\nProject rules'
    },
    originalUserPrompt: 'Add status filtering',
    previousHandoff: {
      source_role: 'context-router',
      target_role: 'business-analyst',
      goal: 'Add status filtering',
      scope: 'Requirements',
      confirmed: ['User asked for status filtering.'],
      decisions: [],
      assumptions: [],
      open_questions: [],
      risks: [],
      artifacts: [],
      next_action: 'Draft requirements.'
    },
    referencedArtifacts: [
      {
        name: 'Router artifact',
        type: 'selected-role',
        summary: 'Router chose BA.',
        path: 'artifacts/001-context-router.md',
        text: 'Selected Role: business-analyst'
      }
    ],
    clarifications: [
      {
        path: 'clarifications/001-user-answer.md',
        text: 'Use active statuses only.'
      }
    ],
    revisionRequests: [
      {
        path: 'revision-requests/001-business-analyst.md',
        text: 'Rewrite acceptance criteria.'
      }
    ],
    stepIndex: 2
  });

  assert.match(prompt, /# Active Role\nbusiness-analyst/);
  assert.match(prompt, /Project rules/);
  assert.match(prompt, /Add status filtering/);
  assert.match(prompt, /Selected Role: business-analyst/);
  assert.match(prompt, /Use active statuses only/);
  assert.match(prompt, /Rewrite acceptance criteria/);
  assert.match(prompt, /contracts\/step-output\.schema\.json/);
});

test('builds a compact role packet object', async () => {
  const registry = await loadSkillRegistry();
  const packet = buildRolePacket({
    run: {
      run_id: 'run-1',
      step_index: 0,
      current_role: 'context-router',
      user_prompt: 'Build filters',
      role_stack: []
    },
    registry,
    projectContext: {
      projectRoot: '/tmp/project',
      files: [],
      text: 'No project context.'
    }
  });

  assert.equal(packet.active_role, 'context-router');
  assert.equal(packet.required_output.schema, 'contracts/step-output.schema.json');
  assert.match(packet.prompt, /# Active Skill Instructions/);
});
