import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const runSubdirectories = [
  'context',
  'steps',
  'handoffs',
  'artifacts',
  'approvals',
  'revision-requests',
  'clarifications',
  'consultations',
  'timeline'
];

export class RunStore {
  constructor({ projectRoot, runsDir } = {}) {
    if (!projectRoot && !runsDir) {
      throw new Error('projectRoot or runsDir is required');
    }

    this.projectRoot = projectRoot ? path.resolve(projectRoot) : null;
    this.runsDir = path.resolve(runsDir ?? path.join(this.projectRoot, 'forge', 'runs'));
  }

  async createRun({ userPrompt, initialRole = 'context-router', contextSnapshot = null, taskSource = null } = {}) {
    if (!userPrompt || userPrompt.trim() === '') {
      throw new Error('userPrompt is required');
    }

    const now = new Date().toISOString();
    const run = {
      run_id: createRunId(),
      status: 'awaiting_role_output',
      user_prompt: userPrompt,
      project_root: this.projectRoot,
      current_role: initialRole,
      role_stack: [],
      step_index: 0,
      ...(taskSource ? { task_source: taskSource } : {}),
      created_at: now,
      updated_at: now
    };

    await this.saveRun(run);
    if (contextSnapshot) {
      run.context_snapshot = await this.saveContextSnapshot(run, contextSnapshot);
      await this.saveRun(run);
    }

    return run;
  }

  async saveRun(run) {
    await this.ensureRunLayout(run.run_id);
    run.updated_at = new Date().toISOString();
    await writeJson(path.join(this.getRunDir(run.run_id), 'run.json'), run);
  }

  async loadRun(runId) {
    return JSON.parse(await readFile(path.join(this.getRunDir(runId), 'run.json'), 'utf8'));
  }

  async saveActiveRunManifest(run, { branch = null } = {}) {
    if (!this.projectRoot) {
      throw new Error('projectRoot is required to save active run manifest');
    }

    const manifest = {
      run_id: run.run_id,
      status: run.status,
      current_role: run.current_role,
      step_index: run.step_index,
      branch,
      run_dir: this.toProjectRelativePath(this.getRunDir(run.run_id)),
      updated_at: new Date().toISOString()
    };
    await writeJson(this.getActiveRunManifestPath(), manifest);
    return manifest;
  }

  async loadActiveRunManifest() {
    return JSON.parse(await readFile(this.getActiveRunManifestPath(), 'utf8'));
  }

  async saveContextSnapshot(run, contextText) {
    const filePath = path.join(this.getRunDir(run.run_id), 'context', 'project-context.md');
    await writeFile(filePath, `${contextText.trim()}\n`, 'utf8');
    return this.toRunRelativePath(run.run_id, filePath);
  }

  async loadContextSnapshot(run) {
    if (!run?.run_id) {
      throw new Error('run with run_id is required');
    }

    const snapshotPath = run.context_snapshot ?? 'context/project-context.md';
    const text = await this.readRunFile(run.run_id, snapshotPath);
    return {
      projectRoot: run.project_root ?? this.projectRoot,
      files: parseContextSnapshotFiles(text),
      source: 'saved-snapshot',
      snapshotPath,
      text
    };
  }

  async saveStepOutput(run, stepOutput) {
    const stepNumber = formatStepNumber(run.step_index);
    const role = stepOutput.role ?? run.current_role ?? 'unknown-role';
    const filePath = path.join(this.getRunDir(run.run_id), 'steps', `${stepNumber}-${role}.json`);
    await writeJson(filePath, stepOutput);
    return filePath;
  }

  async saveHandoff(run, handoff) {
    const stepNumber = formatStepNumber(run.step_index);
    const sourceRole = handoff.source_role ?? run.current_role ?? 'unknown-source';
    const targetRole = handoff.target_role ?? 'unknown-target';
    const filePath = path.join(
      this.getRunDir(run.run_id),
      'handoffs',
      `${stepNumber}-${sourceRole}-to-${targetRole}.json`
    );
    await writeJson(filePath, handoff);
    return filePath;
  }

  async saveApproval(run, approvalInput) {
    const approval = {
      run_id: run.run_id,
      step_index: run.step_index,
      action: approvalInput.action,
      ...(approvalInput.note !== undefined ? { note: approvalInput.note } : {}),
      ...(approvalInput.instructions !== undefined ? { instructions: approvalInput.instructions } : {}),
      created_at: new Date().toISOString()
    };
    const filePath = path.join(
      this.getRunDir(run.run_id),
      'approvals',
      `${formatStepNumber(run.step_index)}-${approval.action}.json`
    );
    await writeJson(filePath, approval);
    return filePath;
  }

  async saveRevisionRequest(run, instructions) {
    if (!instructions || instructions.trim() === '') {
      throw new Error('instructions are required');
    }

    const filePath = path.join(
      this.getRunDir(run.run_id),
      'revision-requests',
      `${formatStepNumber(run.step_index)}-${run.current_role}.md`
    );
    const text = [
      '# Revision Request',
      '',
      `Run ID: ${run.run_id}`,
      `Step: ${run.step_index}`,
      `Role: ${run.current_role}`,
      `Created: ${new Date().toISOString()}`,
      '',
      instructions.trim(),
      ''
    ].join('\n');
    await writeFile(filePath, text, 'utf8');
    return filePath;
  }

  async saveClarification(runId, answersText) {
    if (!answersText || answersText.trim() === '') {
      throw new Error('answersText is required');
    }

    const files = await this.listFiles(runId, 'clarifications', '.md');
    const fileName = `${String(files.length + 1).padStart(3, '0')}-user-answer.md`;
    const filePath = path.join(this.getRunDir(runId), 'clarifications', fileName);
    const text = [
      '# User Clarification',
      '',
      answersText.trim(),
      ''
    ].join('\n');
    await writeFile(filePath, text, 'utf8');
    return filePath;
  }

  async saveConsultation(run, consultation, kind = 'request') {
    const filePath = path.join(
      this.getRunDir(run.run_id),
      'consultations',
      `${formatStepNumber(run.step_index)}-${kind}.json`
    );
    await writeJson(filePath, consultation);
    return filePath;
  }

  async listStepFiles(runId) {
    return this.listFiles(runId, 'steps', '.json');
  }

  async listFiles(runId, subdirectory, extension = null) {
    const dirPath = path.join(this.getRunDir(runId), subdirectory);
    const files = await readdir(dirPath).catch(() => []);
    return files
      .filter((file) => !extension || file.endsWith(extension))
      .sort();
  }

  async readRunFile(runId, relativePath) {
    return readFile(path.join(this.getRunDir(runId), relativePath), 'utf8');
  }

  async ensureRunLayout(runId) {
    const runDir = this.getRunDir(runId);
    await mkdir(runDir, { recursive: true });
    await Promise.all(runSubdirectories.map((directory) => (
      mkdir(path.join(runDir, directory), { recursive: true })
    )));
  }

  getRunDir(runId) {
    return path.join(this.runsDir, runId);
  }

  getActiveRunManifestPath() {
    if (!this.projectRoot) {
      throw new Error('projectRoot is required to resolve active run manifest path');
    }
    return path.join(this.projectRoot, 'forge', 'active-run.json');
  }

  toRunRelativePath(runId, filePath) {
    return path.relative(this.getRunDir(runId), filePath).replace(/\\/g, '/');
  }

  toProjectRelativePath(filePath) {
    if (!this.projectRoot) {
      throw new Error('projectRoot is required to create project-relative paths');
    }
    return path.relative(this.projectRoot, filePath).replace(/\\/g, '/');
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function formatStepNumber(stepIndex) {
  return String(stepIndex).padStart(3, '0');
}

function createRunId() {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8);
  return `${timestamp}-${random}`;
}

function parseContextSnapshotFiles(text) {
  const files = [];
  const headingPattern = /^# Project Agent File: (.+)$/gm;
  const matches = [...text.matchAll(headingPattern)];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const nextMatch = matches[index + 1];
    const blockStart = match.index + match[0].length;
    const blockEnd = nextMatch?.index ?? text.length;
    const block = text.slice(blockStart, blockEnd).trim();
    const sourceMatch = block.match(/^Source: (.+)$/m);
    const body = block
      .replace(/^Source: .+$/m, '')
      .replace(/^---$/gm, '')
      .trim();

    files.push({
      path: sourceMatch?.[1]?.trim() ?? match[1].trim(),
      relativePath: match[1].trim(),
      text: body
    });
  }

  return files;
}
