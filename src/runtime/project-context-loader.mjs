import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function loadProjectContext({ root = process.cwd(), adapterName, projectRoot } = {}) {
  const contextParts = [];

  if (!adapterName) {
    contextParts.push('No project adapter was selected. Treat project-specific facts as unknown and preserve them as assumptions or open questions.');
  } else {
    const adapterPath = path.join(root, 'adapters', adapterName, 'adapter.yaml');
    const text = await readFile(adapterPath, 'utf8');
    contextParts.push(`# Adapter: ${adapterName}\nSource: ${adapterPath}\n\n${text}`);
    contextParts.push(...await loadAdapterSkillSummaries({ root, adapterName }));
  }

  if (projectRoot) {
    contextParts.push(...await loadProjectRootContext(projectRoot));
  }

  return {
    adapterName: adapterName ?? null,
    projectRoot: projectRoot ?? null,
    source: projectRoot ?? (adapterName ? path.join(root, 'adapters', adapterName, 'adapter.yaml') : 'none'),
    text: contextParts.join('\n\n---\n\n')
  };
}

async function loadAdapterSkillSummaries({ root, adapterName }) {
  const skillNames = [
    'project-context',
    'project-architecture',
    'project-contracts',
    'project-quality',
    'project-runtime'
  ];
  const parts = [];

  for (const skillName of skillNames) {
    const skillPath = path.join(root, 'adapters', adapterName, 'skills', skillName, 'SKILL.md');
    const text = await readFile(skillPath, 'utf8').catch(() => null);
    if (text) {
      parts.push(`# Adapter Skill: ${skillName}\nSource: ${skillPath}\n\n${text}`);
    }
  }

  return parts;
}

async function loadProjectRootContext(projectRoot) {
  const files = [
    'AGENTS.md',
    path.join('amtdl-cargo-tracking-reforged', 'AGENTS.md'),
    path.join('amtdl-cargo-tracking-reforged-front', 'AGENTS.md')
  ];
  const parts = [`# Project Root\n${projectRoot}`];

  for (const file of files) {
    const filePath = path.join(projectRoot, file);
    const text = await readFile(filePath, 'utf8').catch(() => null);
    if (text) {
      parts.push(`# Project File: ${file}\nSource: ${filePath}\n\n${text}`);
    }
  }

  return parts;
}
