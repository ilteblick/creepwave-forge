import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadProjectContext } from '../runtime/context/project-context-loader.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(__dirname, 'fixtures', 'project-context');

test('loads root and nested AGENTS.md files with source paths', async () => {
  const context = await loadProjectContext({ projectPath: fixtureRoot });

  assert.equal(context.projectRoot, fixtureRoot);
  assert.deepEqual(
    context.files.map((file) => file.relativePath),
    [
      'AGENTS.md',
      path.join('apps', 'api', 'AGENTS.md').replace(/\\/g, '/'),
      path.join('apps', 'web', 'AGENTS.md').replace(/\\/g, '/')
    ]
  );
  assert.ok(context.files.every((file) => path.isAbsolute(file.path)));
  assert.match(context.text, /# Project Agent File: AGENTS\.md/);
  assert.match(context.text, /API agent instructions/);
  assert.match(context.text, /Web agent instructions/);
});

test('excludes generated and dependency directories', async () => {
  const context = await loadProjectContext({ projectPath: fixtureRoot });
  const allPaths = context.files.map((file) => file.relativePath);

  assert.ok(!allPaths.includes(path.join('node_modules', 'pkg', 'AGENTS.md').replace(/\\/g, '/')));
  assert.ok(!allPaths.includes(path.join('forge', 'runs', 'run-1', 'AGENTS.md').replace(/\\/g, '/')));
  assert.ok(!allPaths.includes(path.join('dist', 'AGENTS.md').replace(/\\/g, '/')));
});

test('returns explicit empty context when no agent files exist', async () => {
  const emptyRoot = path.join(fixtureRoot, 'empty');
  const context = await loadProjectContext({ projectPath: emptyRoot });

  assert.deepEqual(context.files, []);
  assert.match(context.text, /No project agent files were found/);
});
