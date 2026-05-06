import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function loadProjectContext({ root = process.cwd(), adapterName } = {}) {
  if (!adapterName) {
    return {
      adapterName: null,
      source: 'none',
      text: 'No project adapter was selected. Treat project-specific facts as unknown and preserve them as assumptions or open questions.'
    };
  }

  const adapterPath = path.join(root, 'adapters', adapterName, 'adapter.yaml');
  const text = await readFile(adapterPath, 'utf8');

  return {
    adapterName,
    source: adapterPath,
    text
  };
}
