import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const agentFileNames = new Set([
  'AGENTS.md',
  'CLAUDE.md'
]);

const excludedDirectoryNames = new Set([
  '.git',
  '.hg',
  '.svn',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'build',
  'out',
  'node_modules'
]);

export async function loadProjectContext({ projectPath } = {}) {
  if (!projectPath || typeof projectPath !== 'string') {
    throw new Error('projectPath is required');
  }

  const projectRoot = path.resolve(projectPath);
  const rootStats = await stat(projectRoot).catch((error) => {
    throw new Error(`Project path cannot be read: ${projectRoot}: ${error.message}`);
  });
  if (!rootStats.isDirectory()) {
    throw new Error(`Project path must be a directory: ${projectRoot}`);
  }

  const files = await discoverAgentFiles(projectRoot);
  const contextFiles = [];

  for (const filePath of files) {
    const text = await readFile(filePath, 'utf8');
    contextFiles.push({
      path: filePath,
      relativePath: toPosix(path.relative(projectRoot, filePath)),
      text
    });
  }

  return {
    projectRoot,
    files: contextFiles,
    source: projectRoot,
    text: formatProjectContext({ projectRoot, files: contextFiles })
  };
}

export async function discoverAgentFiles(projectRoot) {
  const found = [];

  async function walk(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    const sortedEntries = entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of sortedEntries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = toPosix(path.relative(projectRoot, fullPath));

      if (entry.isDirectory()) {
        if (shouldSkipDirectory(entry.name, relativePath)) {
          continue;
        }
        await walk(fullPath);
        continue;
      }

      if (entry.isFile() && agentFileNames.has(entry.name)) {
        found.push(fullPath);
      }
    }
  }

  await walk(projectRoot);
  return found.sort((a, b) => {
    const aRelative = toPosix(path.relative(projectRoot, a));
    const bRelative = toPosix(path.relative(projectRoot, b));
    if (!aRelative.includes('/') && bRelative.includes('/')) return -1;
    if (aRelative.includes('/') && !bRelative.includes('/')) return 1;
    return aRelative.localeCompare(bRelative);
  });
}

function shouldSkipDirectory(name, relativePath) {
  if (excludedDirectoryNames.has(name)) {
    return true;
  }
  return relativePath === 'forge/runs' || relativePath.startsWith('forge/runs/');
}

function formatProjectContext({ projectRoot, files }) {
  const parts = [
    '# Project Root',
    projectRoot
  ];

  if (files.length === 0) {
    parts.push(
      '# Project Agent Files',
      'No project agent files were found. Treat project-specific facts as unknown and preserve them as assumptions or open questions.'
    );
    return parts.join('\n\n');
  }

  for (const file of files) {
    parts.push([
      `# Project Agent File: ${file.relativePath}`,
      `Source: ${file.path}`,
      '',
      file.text.trim()
    ].join('\n'));
  }

  return parts.join('\n\n---\n\n');
}

function toPosix(value) {
  return value.replace(/\\/g, '/');
}
