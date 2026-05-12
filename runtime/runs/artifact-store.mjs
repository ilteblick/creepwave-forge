import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class ArtifactStore {
  constructor({ runStore } = {}) {
    if (!runStore) {
      throw new Error('runStore is required');
    }
    this.runStore = runStore;
  }

  async saveRoleArtifact(run, stepOutput) {
    if (!stepOutput?.artifact || typeof stepOutput.artifact !== 'string') {
      throw new Error('stepOutput.artifact must be a string');
    }

    const role = stepOutput.role ?? run.current_role;
    const artifactType = stepOutput.artifact_type ?? 'other';
    const stepNumber = String(run.step_index).padStart(3, '0');
    const baseName = `${stepNumber}-${role}`;
    const runDir = this.runStore.getRunDir(run.run_id);
    const markdownPath = path.join(runDir, 'artifacts', `${baseName}.md`);
    const metadataPath = path.join(runDir, 'artifacts', `${baseName}.json`);

    await mkdir(path.dirname(markdownPath), { recursive: true });

    const artifactRef = {
      name: `${role} runtime artifact`,
      type: artifactType,
      summary: `Runtime artifact produced by ${role}.`,
      path: this.runStore.toRunRelativePath(run.run_id, markdownPath),
      metadata_path: this.runStore.toRunRelativePath(run.run_id, metadataPath),
      source_role: role,
      created_at: new Date().toISOString()
    };

    const markdown = [
      `# ${role} Artifact`,
      '',
      `Role: ${role}`,
      `Status: ${stepOutput.status}`,
      `Artifact Type: ${artifactType}`,
      `Transition Type: ${stepOutput.transition?.type ?? 'none'}`,
      '',
      '## Artifact',
      '',
      stepOutput.artifact.trim(),
      ''
    ].join('\n');

    await writeFile(markdownPath, markdown, 'utf8');
    await writeFile(metadataPath, `${JSON.stringify(artifactRef, null, 2)}\n`, 'utf8');
    return artifactRef;
  }

  async loadArtifactText(runId, artifactPath) {
    const safePath = normalizeArtifactPath(artifactPath);
    return readFile(path.join(this.runStore.getRunDir(runId), safePath), 'utf8');
  }
}

export function addArtifactToHandoff(handoff, artifact) {
  const artifacts = dedupeArtifacts([
    ...(handoff.artifacts ?? []),
    artifact
  ]);
  return {
    ...handoff,
    artifacts
  };
}

export function dedupeArtifacts(artifacts) {
  const seen = new Set();
  return artifacts.filter((artifact) => {
    const key = artifact.path || `${artifact.name}:${artifact.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeArtifactPath(artifactPath) {
  if (typeof artifactPath !== 'string' || artifactPath.trim() === '') {
    throw new Error('artifactPath must be a non-empty string');
  }

  const normalized = artifactPath.replace(/\\/g, '/');
  if (!normalized.startsWith('artifacts/')) {
    throw new Error(`Only artifact paths under artifacts/ can be loaded: ${artifactPath}`);
  }

  const relativePath = path.normalize(normalized);
  if (
    path.isAbsolute(relativePath)
    || relativePath.startsWith('..')
    || relativePath.includes(`..${path.sep}`)
  ) {
    throw new Error(`Unsafe artifact path: ${artifactPath}`);
  }

  return relativePath;
}
