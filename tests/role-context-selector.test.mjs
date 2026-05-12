import assert from 'node:assert/strict';
import test from 'node:test';

import { selectRoleContext } from '../runtime/core/role-context-selector.mjs';

function projectContext() {
  return {
    projectRoot: '/tmp/project',
    source: 'saved-snapshot',
    snapshotPath: 'context/project-context.md',
    text: [
      '# Project Root',
      '/tmp/project',
      '',
      '# Project Agent File: AGENTS.md',
      'Source: /tmp/project/AGENTS.md',
      '',
      'Root rules',
      '',
      '# Project Agent File: apps/api/AGENTS.md',
      'Source: /tmp/project/apps/api/AGENTS.md',
      '',
      'API rules',
      '',
      '# Project Agent File: apps/web/AGENTS.md',
      'Source: /tmp/project/apps/web/AGENTS.md',
      '',
      'Web rules'
    ].join('\n'),
    files: [
      {
        path: '/tmp/project/AGENTS.md',
        relativePath: 'AGENTS.md',
        text: 'Root rules'
      },
      {
        path: '/tmp/project/apps/api/AGENTS.md',
        relativePath: 'apps/api/AGENTS.md',
        text: 'API rules'
      },
      {
        path: '/tmp/project/apps/web/AGENTS.md',
        relativePath: 'apps/web/AGENTS.md',
        text: 'Web rules'
      }
    ]
  };
}

test('context-router receives the full project context', () => {
  const selected = selectRoleContext({
    projectContext: projectContext(),
    activeRole: 'context-router'
  });

  assert.equal(selected.filtered, false);
  assert.equal(selected.files.length, 3);
  assert.match(selected.text, /API rules/);
  assert.match(selected.text, /Web rules/);
});

test('backend-engineer receives root and backend context only', () => {
  const selected = selectRoleContext({
    projectContext: projectContext(),
    activeRole: 'backend-engineer'
  });

  assert.equal(selected.filtered, true);
  assert.deepEqual(
    selected.files.map((file) => file.relativePath),
    ['AGENTS.md', 'apps/api/AGENTS.md']
  );
  assert.match(selected.text, /Root rules/);
  assert.match(selected.text, /API rules/);
  assert.doesNotMatch(selected.text, /Web rules/);
});

test('frontend-engineer receives root and frontend context only', () => {
  const selected = selectRoleContext({
    projectContext: projectContext(),
    activeRole: 'frontend-engineer'
  });

  assert.equal(selected.filtered, true);
  assert.deepEqual(
    selected.files.map((file) => file.relativePath),
    ['AGENTS.md', 'apps/web/AGENTS.md']
  );
  assert.match(selected.text, /Root rules/);
  assert.match(selected.text, /Web rules/);
  assert.doesNotMatch(selected.text, /API rules/);
});

test('empty context preserves explicit empty-context text', () => {
  const selected = selectRoleContext({
    projectContext: {
      projectRoot: '/tmp/project',
      files: [],
      text: 'No project agent files were found.'
    },
    activeRole: 'backend-engineer'
  });

  assert.equal(selected.filtered, false);
  assert.deepEqual(selected.files, []);
  assert.match(selected.text, /No project agent files were found/);
});
