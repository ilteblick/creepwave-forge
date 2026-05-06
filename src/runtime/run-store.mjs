import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class RunStore {
  constructor({ root = process.cwd(), runsDir = path.join(root, 'runs') } = {}) {
    this.root = root;
    this.runsDir = runsDir;
  }

  async createRun({ userPrompt, adapterName = null, initialRole = 'context-router' }) {
    const runId = createRunId();
    const run = {
      run_id: runId,
      status: 'running',
      user_prompt: userPrompt,
      adapter_name: adapterName,
      current_role: initialRole,
      step_index: 0,
      previous_handoff: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await this.saveRun(run);
    return run;
  }

  async saveRun(run) {
    const runDir = this.getRunDir(run.run_id);
    await mkdir(path.join(runDir, 'steps'), { recursive: true });
    run.updated_at = new Date().toISOString();
    await writeFile(path.join(runDir, 'run.json'), `${JSON.stringify(run, null, 2)}\n`, 'utf8');
  }

  async loadRun(runId) {
    return JSON.parse(await readFile(path.join(this.getRunDir(runId), 'run.json'), 'utf8'));
  }

  async saveStep(run, stepOutput) {
    const stepNumber = String(run.step_index).padStart(3, '0');
    const stepPath = path.join(this.getRunDir(run.run_id), 'steps', `${stepNumber}-${stepOutput.role}.json`);
    await writeFile(stepPath, `${JSON.stringify(stepOutput, null, 2)}\n`, 'utf8');
    return stepPath;
  }

  async listSteps(runId) {
    const stepsDir = path.join(this.getRunDir(runId), 'steps');
    const files = await readdir(stepsDir).catch(() => []);
    return files.filter((file) => file.endsWith('.json')).sort();
  }

  getRunDir(runId) {
    return path.join(this.runsDir, runId);
  }
}

function createRunId() {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8);
  return `${timestamp}-${random}`;
}
