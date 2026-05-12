import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const timelineBuckets = [
  { key: 'steps', groupKey: 'step', subdirectory: 'steps', extension: '.json', multiple: false },
  { key: 'artifacts', groupKey: 'artifacts', subdirectory: 'artifacts', extension: null, multiple: true },
  { key: 'handoffs', groupKey: 'handoffs', subdirectory: 'handoffs', extension: '.json', multiple: true },
  { key: 'approvals', groupKey: 'approvals', subdirectory: 'approvals', extension: '.json', multiple: true },
  {
    key: 'revisionRequests',
    groupKey: 'revisionRequests',
    subdirectory: 'revision-requests',
    extension: null,
    multiple: true
  },
  { key: 'clarifications', groupKey: 'clarifications', subdirectory: 'clarifications', extension: null, multiple: true },
  { key: 'consultations', groupKey: 'consultations', subdirectory: 'consultations', extension: '.json', multiple: true }
];

export async function buildRunTimeline({ run, store } = {}) {
  if (!run?.run_id) {
    throw new Error('run with run_id is required');
  }
  if (!store?.listFiles) {
    throw new Error('store with listFiles is required');
  }

  const files = {};
  for (const bucket of timelineBuckets) {
    files[bucket.key] = await store.listFiles(
      run.run_id,
      bucket.subdirectory,
      bucket.extension
    );
  }

  return {
    runId: run.run_id,
    files,
    steps: groupTimelineSteps(files)
  };
}

export function renderRunReadme({ run, timeline, runDir } = {}) {
  if (!run?.run_id) {
    throw new Error('run with run_id is required');
  }
  if (!timeline?.steps) {
    throw new Error('timeline with steps is required');
  }

  return [
    `# Forge Run ${run.run_id}`,
    '',
    `Prompt: ${run.user_prompt ?? ''}`,
    `Status: ${run.status ?? ''}`,
    `Current Role: ${run.current_role ?? 'none'}`,
    `Created: ${run.created_at ?? ''}`,
    `Updated: ${run.updated_at ?? ''}`,
    `Run Directory: ${runDir ?? ''}`,
    '',
    '## Timeline',
    '',
    '| Step | Role | Step Output | Artifacts | Handoffs | Approvals | Revisions | Clarifications | Consultations |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...timeline.steps.map(renderStepRow),
    ''
  ].join('\n');
}

export async function writeTimelineMirror({ run, store, timeline } = {}) {
  if (!run?.run_id) {
    throw new Error('run with run_id is required');
  }
  if (!store?.getRunDir || !store?.toRunRelativePath || !store?.readRunFile) {
    throw new Error('store with getRunDir, toRunRelativePath, and readRunFile is required');
  }
  if (!timeline?.steps) {
    throw new Error('timeline with steps is required');
  }

  const manifestPaths = [];
  const runDir = store.getRunDir(run.run_id);
  for (const step of timeline.steps) {
    const stepDirectory = path.join(runDir, 'timeline', step.stepKey);
    await mkdir(stepDirectory, { recursive: true });
    const mirrorFiles = buildStepMirrorFiles(step);
    for (const mirrorFile of mirrorFiles) {
      const sourceText = await store.readRunFile(run.run_id, mirrorFile.sourcePath);
      await writeFile(path.join(stepDirectory, mirrorFile.fileName), sourceText, 'utf8');
    }
    await writeFile(path.join(stepDirectory, 'README.md'), renderStepReadme({ step, mirrorFiles }), 'utf8');
    const manifestPath = path.join(stepDirectory, 'manifest.json');
    await writeFile(manifestPath, `${JSON.stringify(toManifest(step), null, 2)}\n`, 'utf8');
    manifestPaths.push(store.toRunRelativePath(run.run_id, manifestPath));
  }
  return manifestPaths;
}

export function renderStepReadme({ step, mirrorFiles = buildStepMirrorFiles(step) } = {}) {
  if (!step?.stepNumber) {
    throw new Error('timeline step with stepNumber is required');
  }

  return [
    `# Step ${step.stepNumber}: ${step.role ?? 'unknown-role'}`,
    '',
    `Step Key: ${step.stepKey ?? step.stepNumber}`,
    `Has Approval: ${step.files.approvals.length > 0 ? 'yes' : 'no'}`,
    `Has Revision Request: ${step.files.revisionRequests.length > 0 ? 'yes' : 'no'}`,
    `Has Clarification: ${step.files.clarifications.length > 0 ? 'yes' : 'no'}`,
    '',
    '## Files',
    '',
    '| Mirror File | Kind | Canonical Source |',
    '| --- | --- | --- |',
    ...mirrorFiles.map(renderMirrorFileRow),
    ''
  ].join('\n');
}

export function buildStepMirrorFiles(step) {
  if (!step?.files) {
    throw new Error('timeline step with files is required');
  }

  return withUniqueMirrorFileNames([
    ...(step.files.step ? [{
      kind: 'step',
      fileName: 'step.json',
      sourcePath: step.files.step
    }] : []),
    ...mirrorArtifactFiles(step.files.artifacts),
    ...mirrorPathList(step.files.handoffs, 'handoff', 'handoff.json'),
    ...mirrorPathList(step.files.approvals, 'approval', 'approval.json'),
    ...mirrorPathList(step.files.revisionRequests, 'revision-request', 'revision-request.md'),
    ...mirrorPathList(step.files.clarifications, 'clarification', 'clarification.md'),
    ...mirrorPathList(step.files.consultations, 'consultation', 'consultation.json')
  ]);
}

function renderMirrorFileRow(mirrorFile) {
  return [
    renderPathCell(mirrorFile.fileName),
    mirrorFile.kind,
    renderPathCell(mirrorFile.sourcePath)
  ].map(escapeTableCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |');
}

function groupTimelineSteps(files) {
  const stepsByNumber = new Map();

  for (const bucket of timelineBuckets) {
    for (const fileName of files[bucket.key] ?? []) {
      const stepNumber = leadingStepNumber(fileName);
      if (!stepNumber) {
        continue;
      }

      const entry = getTimelineStep(stepsByNumber, stepNumber);
      const runRelativePath = `${bucket.subdirectory}/${fileName}`;
      if (bucket.multiple) {
        entry.files[bucket.groupKey].push(runRelativePath);
      } else {
        entry.files[bucket.groupKey] = runRelativePath;
        entry.stepKey = stripExtension(fileName);
        entry.role = roleFromStepFile(fileName);
      }
    }
  }

  return [...stepsByNumber.values()]
    .map((entry) => ({
      ...entry,
      files: sortStepFiles(entry.files)
    }))
    .sort((left, right) => left.stepNumber.localeCompare(right.stepNumber));
}

function getTimelineStep(stepsByNumber, stepNumber) {
  if (!stepsByNumber.has(stepNumber)) {
    stepsByNumber.set(stepNumber, {
      stepNumber,
      stepKey: stepNumber,
      role: null,
      files: {
        step: null,
        artifacts: [],
        handoffs: [],
        approvals: [],
        revisionRequests: [],
        clarifications: [],
        consultations: []
      }
    });
  }
  return stepsByNumber.get(stepNumber);
}

function sortStepFiles(files) {
  return {
    ...files,
    artifacts: [...files.artifacts].sort(),
    handoffs: [...files.handoffs].sort(),
    approvals: [...files.approvals].sort(),
    revisionRequests: [...files.revisionRequests].sort(),
    clarifications: [...files.clarifications].sort(),
    consultations: [...files.consultations].sort()
  };
}

function mirrorArtifactFiles(filePaths = []) {
  return filePaths.map((sourcePath) => ({
    kind: 'artifact',
    fileName: artifactMirrorFileName(sourcePath),
    sourcePath
  }));
}

function artifactMirrorFileName(sourcePath) {
  return path.extname(sourcePath) === '.json' ? 'artifact.json' : 'artifact.md';
}

function mirrorPathList(filePaths = [], kind, fileName) {
  return filePaths.map((sourcePath) => ({
    kind,
    fileName,
    sourcePath
  }));
}

function withUniqueMirrorFileNames(mirrorFiles) {
  const seen = new Map();
  return mirrorFiles.map((mirrorFile) => {
    const count = seen.get(mirrorFile.fileName) ?? 0;
    seen.set(mirrorFile.fileName, count + 1);

    if (count === 0) {
      return mirrorFile;
    }

    return {
      ...mirrorFile,
      fileName: appendFileNameSuffix(mirrorFile.fileName, count + 1)
    };
  });
}

function appendFileNameSuffix(fileName, suffixNumber) {
  const extension = path.extname(fileName);
  const baseName = extension ? fileName.slice(0, -extension.length) : fileName;
  return `${baseName}-${suffixNumber}${extension}`;
}

function leadingStepNumber(fileName) {
  return fileName.match(/^(\d{3})-/)?.[1] ?? null;
}

function stripExtension(fileName) {
  return fileName.replace(/\.[^.]+$/, '');
}

function roleFromStepFile(fileName) {
  return stripExtension(fileName).replace(/^\d{3}-/, '');
}

function toManifest(step) {
  return {
    step_number: step.stepNumber,
    role: step.role,
    canonical_paths: {
      step: step.files.step,
      artifacts: step.files.artifacts,
      handoffs: step.files.handoffs,
      approvals: step.files.approvals,
      revision_requests: step.files.revisionRequests,
      clarifications: step.files.clarifications,
      consultations: step.files.consultations
    },
    mirror_files: Object.fromEntries(
      buildStepMirrorFiles(step).map((mirrorFile) => [mirrorFile.fileName, mirrorFile.sourcePath])
    )
  };
}

function renderStepRow(step) {
  return [
    step.stepNumber,
    step.role ?? '',
    renderPathCell(step.files.step),
    renderPathListCell(step.files.artifacts),
    renderPathListCell(step.files.handoffs),
    renderPathListCell(step.files.approvals),
    renderPathListCell(step.files.revisionRequests),
    renderPathListCell(step.files.clarifications),
    renderPathListCell(step.files.consultations)
  ].map(escapeTableCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |');
}

function renderPathCell(filePath) {
  return filePath ? `\`${filePath}\`` : '';
}

function renderPathListCell(filePaths = []) {
  return filePaths.map(renderPathCell).join('<br>');
}

function escapeTableCell(value) {
  return String(value).replaceAll('|', '\\|');
}
