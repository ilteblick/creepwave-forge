import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildRunTimeline,
  buildStepMirrorFiles,
  renderRunReadme,
  writeTimelineMirror
} from '../runtime/runs/run-timeline-index.mjs';

test('buildRunTimeline reads canonical run record buckets through RunStore.listFiles', async () => {
  const calls = [];
  const store = {
    async listFiles(runId, subdirectory, extension = null) {
      calls.push({ runId, subdirectory, extension });
      return [`${subdirectory}/record`];
    }
  };
  const run = { run_id: 'run-001' };

  const timeline = await buildRunTimeline({ run, store });

  assert.deepEqual(calls, [
    { runId: 'run-001', subdirectory: 'steps', extension: '.json' },
    { runId: 'run-001', subdirectory: 'artifacts', extension: null },
    { runId: 'run-001', subdirectory: 'handoffs', extension: '.json' },
    { runId: 'run-001', subdirectory: 'approvals', extension: '.json' },
    { runId: 'run-001', subdirectory: 'revision-requests', extension: null },
    { runId: 'run-001', subdirectory: 'clarifications', extension: null },
    { runId: 'run-001', subdirectory: 'consultations', extension: '.json' }
  ]);
  assert.deepEqual(timeline.files, {
    steps: ['steps/record'],
    artifacts: ['artifacts/record'],
    handoffs: ['handoffs/record'],
    approvals: ['approvals/record'],
    revisionRequests: ['revision-requests/record'],
    clarifications: ['clarifications/record'],
    consultations: ['consultations/record']
  });
});

test('buildRunTimeline groups related files by leading step prefix', async () => {
  const filesByDirectory = new Map([
    ['steps', ['001-context-router.json', '002-business-analyst.json']],
    ['artifacts', ['001-context-router.md', '001-context-router.json', '002-business-analyst.md']],
    ['handoffs', ['001-context-router-to-business-analyst.json']],
    ['approvals', ['001-approved.json']],
    ['revision-requests', ['002-business-analyst.md']],
    ['clarifications', []],
    ['consultations', []]
  ]);
  const store = {
    async listFiles(runId, subdirectory) {
      assert.equal(runId, 'run-001');
      return filesByDirectory.get(subdirectory) ?? [];
    }
  };

  const timeline = await buildRunTimeline({ run: { run_id: 'run-001' }, store });

  assert.deepEqual(timeline.steps, [
    {
      stepNumber: '001',
      stepKey: '001-context-router',
      role: 'context-router',
      files: {
        step: 'steps/001-context-router.json',
        artifacts: [
          'artifacts/001-context-router.json',
          'artifacts/001-context-router.md'
        ],
        handoffs: ['handoffs/001-context-router-to-business-analyst.json'],
        approvals: ['approvals/001-approved.json'],
        revisionRequests: [],
        clarifications: [],
        consultations: []
      }
    },
    {
      stepNumber: '002',
      stepKey: '002-business-analyst',
      role: 'business-analyst',
      files: {
        step: 'steps/002-business-analyst.json',
        artifacts: ['artifacts/002-business-analyst.md'],
        handoffs: [],
        approvals: [],
        revisionRequests: ['revision-requests/002-business-analyst.md'],
        clarifications: [],
        consultations: []
      }
    }
  ]);
});

test('renderRunReadme includes run metadata and a chronological step table', () => {
  const markdown = renderRunReadme({
    run: {
      run_id: 'run-001',
      user_prompt: 'Build status filters',
      status: 'awaiting_approval',
      current_role: 'business-analyst',
      created_at: '2026-05-10T10:00:00.000Z',
      updated_at: '2026-05-10T10:15:00.000Z'
    },
    runDir: 'C:/tmp/forge/runs/run-001',
    timeline: {
      steps: [
        {
          stepNumber: '001',
          role: 'context-router',
          files: {
            step: 'steps/001-context-router.json',
            artifacts: ['artifacts/001-context-router.md', 'artifacts/001-context-router.json'],
            handoffs: ['handoffs/001-context-router-to-business-analyst.json'],
            approvals: ['approvals/001-approved.json'],
            revisionRequests: [],
            clarifications: [],
            consultations: []
          }
        },
        {
          stepNumber: '002',
          role: 'business-analyst',
          files: {
            step: 'steps/002-business-analyst.json',
            artifacts: [],
            handoffs: [],
            approvals: [],
            revisionRequests: ['revision-requests/002-business-analyst.md'],
            clarifications: [],
            consultations: []
          }
        }
      ]
    }
  });

  assert.match(markdown, /^# Forge Run run-001/m);
  assert.match(markdown, /Prompt: Build status filters/);
  assert.match(markdown, /Status: awaiting_approval/);
  assert.match(markdown, /Current Role: business-analyst/);
  assert.match(markdown, /Run Directory: C:\/tmp\/forge\/runs\/run-001/);
  assert.match(markdown, /\| Step \| Role \| Step Output \| Artifacts \| Handoffs \| Approvals \| Revisions \| Clarifications \| Consultations \|/);
  assert.match(markdown, /\| 001 \| context-router \| `steps\/001-context-router\.json` \| `artifacts\/001-context-router\.md`<br>`artifacts\/001-context-router\.json` \| `handoffs\/001-context-router-to-business-analyst\.json` \| `approvals\/001-approved\.json` \|  \|  \|  \|/);
  assert.match(markdown, /\| 002 \| business-analyst \| `steps\/002-business-analyst\.json` \|  \|  \|  \| `revision-requests\/002-business-analyst\.md` \|  \|  \|/);
});

test('buildStepMirrorFiles maps canonical paths to readable mirror filenames', () => {
  const mirrorFiles = buildStepMirrorFiles({
    files: {
      step: 'steps/001-context-router.json',
      artifacts: ['artifacts/001-context-router.md', 'artifacts/001-context-router.json'],
      handoffs: ['handoffs/001-context-router-to-business-analyst.json'],
      approvals: ['approvals/001-approved.json'],
      revisionRequests: ['revision-requests/001-context-router.md'],
      clarifications: ['clarifications/001-user-answer.md'],
      consultations: ['consultations/001-request.json']
    }
  });

  assert.deepEqual(mirrorFiles, [
    { kind: 'step', fileName: 'step.json', sourcePath: 'steps/001-context-router.json' },
    { kind: 'artifact', fileName: 'artifact.md', sourcePath: 'artifacts/001-context-router.md' },
    { kind: 'artifact', fileName: 'artifact.json', sourcePath: 'artifacts/001-context-router.json' },
    { kind: 'handoff', fileName: 'handoff.json', sourcePath: 'handoffs/001-context-router-to-business-analyst.json' },
    { kind: 'approval', fileName: 'approval.json', sourcePath: 'approvals/001-approved.json' },
    { kind: 'revision-request', fileName: 'revision-request.md', sourcePath: 'revision-requests/001-context-router.md' },
    { kind: 'clarification', fileName: 'clarification.md', sourcePath: 'clarifications/001-user-answer.md' },
    { kind: 'consultation', fileName: 'consultation.json', sourcePath: 'consultations/001-request.json' }
  ]);
});

test('buildStepMirrorFiles appends suffixes for duplicate mirror filenames', () => {
  const mirrorFiles = buildStepMirrorFiles({
    files: {
      step: 'steps/002-business-analyst.json',
      artifacts: [
        'artifacts/002-business-analyst.md',
        'artifacts/002-business-analyst-extra.md',
        'artifacts/002-business-analyst.json'
      ],
      handoffs: [
        'handoffs/002-business-analyst-to-solution-architect.json',
        'handoffs/002-business-analyst-to-qa-engineer.json'
      ],
      approvals: [],
      revisionRequests: [],
      clarifications: [],
      consultations: []
    }
  });

  assert.deepEqual(
    mirrorFiles.map((mirrorFile) => mirrorFile.fileName),
    ['step.json', 'artifact.md', 'artifact-2.md', 'artifact.json', 'handoff.json', 'handoff-2.json']
  );
});

test('writeTimelineMirror writes per-step manifests referencing canonical paths', async () => {
  const runDir = await mkdtemp(path.join(os.tmpdir(), 'forge-timeline-'));
  try {
    const store = {
      getRunDir(runId) {
        assert.equal(runId, 'run-001');
        return runDir;
      },
      toRunRelativePath(runId, filePath) {
        assert.equal(runId, 'run-001');
        return path.relative(runDir, filePath).replace(/\\/g, '/');
      },
      async readRunFile(runId, relativePath) {
        assert.equal(runId, 'run-001');
        return `source:${relativePath}`;
      }
    };
    const manifestPaths = await writeTimelineMirror({
      run: { run_id: 'run-001' },
      store,
      timeline: {
        steps: [
          {
            stepNumber: '001',
            stepKey: '001-context-router',
            role: 'context-router',
            files: {
              step: 'steps/001-context-router.json',
              artifacts: ['artifacts/001-context-router.md', 'artifacts/001-context-router.json'],
              handoffs: ['handoffs/001-context-router-to-business-analyst.json'],
              approvals: ['approvals/001-approved.json'],
              revisionRequests: ['revision-requests/001-context-router.md'],
              clarifications: ['clarifications/001-user-answer.md'],
              consultations: []
            }
          }
        ]
      }
    });

    assert.deepEqual(manifestPaths, ['timeline/001-context-router/manifest.json']);
    const stepFiles = await readdir(path.join(runDir, 'timeline', '001-context-router'));
    assert.ok(stepFiles.includes('README.md'));
    assert.ok(stepFiles.includes('step.json'));
    assert.ok(stepFiles.includes('artifact.md'));
    assert.ok(stepFiles.includes('artifact.json'));
    assert.ok(stepFiles.includes('handoff.json'));
    assert.ok(stepFiles.includes('approval.json'));
    assert.ok(stepFiles.includes('revision-request.md'));
    assert.ok(stepFiles.includes('clarification.md'));
    assert.ok(stepFiles.includes('manifest.json'));
    assert.equal(
      await readFile(path.join(runDir, 'timeline', '001-context-router', 'step.json'), 'utf8'),
      'source:steps/001-context-router.json'
    );
    assert.equal(
      await readFile(path.join(runDir, 'timeline', '001-context-router', 'artifact.md'), 'utf8'),
      'source:artifacts/001-context-router.md'
    );
    assert.equal(
      await readFile(path.join(runDir, 'timeline', '001-context-router', 'artifact.json'), 'utf8'),
      'source:artifacts/001-context-router.json'
    );
    assert.equal(
      await readFile(path.join(runDir, 'timeline', '001-context-router', 'handoff.json'), 'utf8'),
      'source:handoffs/001-context-router-to-business-analyst.json'
    );
    assert.equal(
      await readFile(path.join(runDir, 'timeline', '001-context-router', 'approval.json'), 'utf8'),
      'source:approvals/001-approved.json'
    );
    assert.equal(
      await readFile(path.join(runDir, 'timeline', '001-context-router', 'revision-request.md'), 'utf8'),
      'source:revision-requests/001-context-router.md'
    );
    assert.equal(
      await readFile(path.join(runDir, 'timeline', '001-context-router', 'clarification.md'), 'utf8'),
      'source:clarifications/001-user-answer.md'
    );
    const stepReadme = await readFile(path.join(runDir, 'timeline', '001-context-router', 'README.md'), 'utf8');
    assert.match(stepReadme, /^# Step 001: context-router/m);
    assert.match(stepReadme, /Has Approval: yes/);
    assert.match(stepReadme, /Has Revision Request: yes/);
    assert.match(stepReadme, /Has Clarification: yes/);
    assert.match(stepReadme, /\| `revision-request\.md` \| revision-request \| `revision-requests\/001-context-router\.md` \|/);
    const manifest = JSON.parse(await readFile(path.join(runDir, manifestPaths[0]), 'utf8'));
    assert.deepEqual(manifest, {
      step_number: '001',
      role: 'context-router',
      canonical_paths: {
        step: 'steps/001-context-router.json',
        artifacts: ['artifacts/001-context-router.md', 'artifacts/001-context-router.json'],
        handoffs: ['handoffs/001-context-router-to-business-analyst.json'],
        approvals: ['approvals/001-approved.json'],
        revision_requests: ['revision-requests/001-context-router.md'],
        clarifications: ['clarifications/001-user-answer.md'],
        consultations: []
      },
      mirror_files: {
        'step.json': 'steps/001-context-router.json',
        'artifact.md': 'artifacts/001-context-router.md',
        'artifact.json': 'artifacts/001-context-router.json',
        'handoff.json': 'handoffs/001-context-router-to-business-analyst.json',
        'approval.json': 'approvals/001-approved.json',
        'revision-request.md': 'revision-requests/001-context-router.md',
        'clarification.md': 'clarifications/001-user-answer.md'
      }
    });
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});

test('writeTimelineMirror keeps artifact manifest references on canonical artifact paths', async () => {
  const runDir = await mkdtemp(path.join(os.tmpdir(), 'forge-timeline-'));
  try {
    const store = {
      getRunDir() {
        return runDir;
      },
      toRunRelativePath(runId, filePath) {
        return path.relative(runDir, filePath).replace(/\\/g, '/');
      },
      async readRunFile(runId, relativePath) {
        return `source:${relativePath}`;
      }
    };

    const [manifestPath] = await writeTimelineMirror({
      run: { run_id: 'run-001' },
      store,
      timeline: {
        steps: [
          {
            stepNumber: '004',
            stepKey: '004-backend-engineer',
            role: 'backend-engineer',
            files: {
              step: 'steps/004-backend-engineer.json',
              artifacts: ['artifacts/004-backend-engineer.md', 'artifacts/004-backend-engineer.json'],
              handoffs: [],
              approvals: [],
              revisionRequests: [],
              clarifications: [],
              consultations: []
            }
          }
        ]
      }
    });

    const manifest = JSON.parse(await readFile(path.join(runDir, manifestPath), 'utf8'));
    assert.deepEqual(manifest.canonical_paths.artifacts, [
      'artifacts/004-backend-engineer.md',
      'artifacts/004-backend-engineer.json'
    ]);
    assert.deepEqual(manifest.mirror_files, {
      'step.json': 'steps/004-backend-engineer.json',
      'artifact.md': 'artifacts/004-backend-engineer.md',
      'artifact.json': 'artifacts/004-backend-engineer.json'
    });
    assert.ok(manifest.canonical_paths.artifacts.every((artifactPath) => artifactPath.startsWith('artifacts/')));
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});
