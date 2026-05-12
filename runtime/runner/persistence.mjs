import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  commitScopedPaths,
  createAndCheckoutBranch,
  createRunBranchName,
  getCurrentBranch
} from '../git/git-workflow.mjs';
import { buildRunTimeline, renderRunReadme, writeTimelineMirror } from '../runs/run-timeline-index.mjs';

export async function refreshRunReadme({ run, store }) {
  const runDir = store.getRunDir(run.run_id);
  const timeline = await buildRunTimeline({ run, store });
  const markdown = renderRunReadme({ run, timeline, runDir });
  await writeFile(path.join(runDir, 'README.md'), markdown, 'utf8');
  await writeTimelineMirror({ run, store, timeline });
}

export async function refreshActiveRunManifest({ run, store }) {
  await store.saveActiveRunManifest(run, {
    branch: await getCurrentBranch(store.projectRoot)
  });
}

export async function createRunBranch({ run, store, branchSlug }) {
  const branch = createRunBranchName({
    userPrompt: run.user_prompt,
    branchSlug,
    runId: run.run_id
  });

  return createAndCheckoutBranch({
    projectRoot: store.projectRoot,
    branch
  });
}

export async function commitRunState({ run, store, message }) {
  return commitScopedPaths({
    projectRoot: store.projectRoot,
    paths: runStateCommitPaths(run),
    message
  });
}

export async function persistTransferState({
  projectPath,
  run,
  fetchImpl,
  store,
  message,
  syncLabelsForRun
}) {
  await refreshRunReadme({ run, store });
  await refreshActiveRunManifest({ run, store });
  const labelSync = await syncLabelsForRun({ projectPath, run, fetchImpl, store });
  const gitCommit = await commitRunState({
    run,
    store,
    message
  });

  return {
    labelSync,
    gitCommit
  };
}

export function runStateCommitPaths(run) {
  return [
    'forge/active-run.json',
    `forge/runs/${run.run_id}`
  ];
}
