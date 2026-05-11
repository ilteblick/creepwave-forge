import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTaskPrompt } from '../runtime/task-prompt-builder.mjs';

test('builds a Forge prompt from normalized task source data', () => {
  const prompt = buildTaskPrompt({
    source: {
      type: 'gitlab',
      url: 'https://gitlab.example.local/group/project',
      task_url: 'https://gitlab.example.local/group/project/-/issues/123'
    },
    id: '123',
    title: 'Add export',
    description: 'Export reports to Excel.',
    labels: ['forge', 'forge:ready'],
    state: 'opened',
    author: 'alice',
    comments: [
      {
        id: '1',
        author: 'bob',
        body: 'Please include current filters.',
        created_at: '2026-05-10T11:30:00.000Z'
      }
    ]
  });

  assert.match(prompt, /Route this tracker task through Creepwave Forge/);
  assert.match(prompt, /Source Type: gitlab/);
  assert.match(prompt, /Task ID: 123/);
  assert.match(prompt, /Title: Add export/);
  assert.match(prompt, /Labels: forge, forge:ready/);
  assert.match(prompt, /Export reports to Excel/);
  assert.match(prompt, /bob/);
  assert.match(prompt, /Please include current filters/);
});

test('does not include token-like fields from task objects', () => {
  const prompt = buildTaskPrompt({
    source: { type: 'gitlab', url: 'https://gitlab.example.local/group/project' },
    id: '123',
    title: 'Add export',
    description: 'Do work.',
    token: 'secret-token',
    labels: [],
    comments: []
  });

  assert.doesNotMatch(prompt, /secret-token/);
  assert.doesNotMatch(prompt, /token/i);
});
