import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { ArtifactStore, addArtifactToHandoff } from '../runtime/artifact-store.mjs';
import { RunStore } from '../runtime/run-store.mjs';

test('persists role artifact markdown and metadata', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'forge-artifact-store-'));
  try {
    const runStore = new RunStore({ projectRoot });
    const artifactStore = new ArtifactStore({ runStore });
    const run = await runStore.createRun({ userPrompt: 'Build filters' });
    run.step_index = 1;

    const artifactRef = await artifactStore.saveRoleArtifact(run, {
      role: 'business-analyst',
      status: 'handoff_ready',
      artifact_type: 'requirements',
      artifact: 'Requirements Draft\n\n- Filter by status.'
    });

    assert.equal(artifactRef.type, 'requirements');
    assert.equal(artifactRef.source_role, 'business-analyst');
    assert.equal(artifactRef.path, 'artifacts/001-business-analyst.md');
    assert.equal(artifactRef.metadata_path, 'artifacts/001-business-analyst.json');

    const markdown = await readFile(path.join(runStore.getRunDir(run.run_id), artifactRef.path), 'utf8');
    const metadata = JSON.parse(await readFile(path.join(runStore.getRunDir(run.run_id), artifactRef.metadata_path), 'utf8'));

    assert.match(markdown, /# business-analyst Artifact/);
    assert.match(markdown, /Filter by status/);
    assert.equal(metadata.type, 'requirements');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('adds artifact references to outgoing handoff without duplicates', () => {
  const handoff = {
    artifacts: [
      {
        name: 'Existing',
        type: 'requirements',
        summary: 'Existing artifact.',
        path: 'artifacts/001-business-analyst.md'
      }
    ]
  };
  const artifact = {
    name: 'business-analyst runtime artifact',
    type: 'requirements',
    summary: 'Runtime artifact produced by business-analyst.',
    path: 'artifacts/001-business-analyst.md'
  };

  const updated = addArtifactToHandoff(handoff, artifact);

  assert.equal(updated.artifacts.length, 1);
  assert.equal(updated.artifacts[0].name, 'Existing');
});
