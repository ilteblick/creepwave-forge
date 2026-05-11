import { readFile } from 'node:fs/promises';
import path from 'node:path';

const requiredKeys = [
  'TASK_SOURCE_TYPE',
  'TASK_SOURCE_URL',
  'TASK_SOURCE_TOKEN'
];

export async function loadTaskSourceConfig({ projectPath, envFile = '.env.forge' } = {}) {
  if (!projectPath || projectPath.trim() === '') {
    throw new Error('projectPath is required');
  }

  const filePath = path.join(projectPath, envFile);
  let envText;
  try {
    envText = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Task source config not found at ${filePath}`);
    }
    throw error;
  }

  const parsed = parseTaskSourceEnv(envText);
  const missing = requiredKeys.filter((key) => !parsed[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Task source config is missing required key(s): ${missing.join(', ')}`);
  }

  return {
    type: parsed.TASK_SOURCE_TYPE.trim().toLowerCase(),
    url: parsed.TASK_SOURCE_URL.trim(),
    token: parsed.TASK_SOURCE_TOKEN.trim(),
    ...(parsed.TASK_SOURCE_REQUEST_TIMEOUT_MS?.trim()
      ? { requestTimeoutMs: parsePositiveInteger(parsed.TASK_SOURCE_REQUEST_TIMEOUT_MS, 'TASK_SOURCE_REQUEST_TIMEOUT_MS') }
      : {})
  };
}

export function parseTaskSourceEnv(envText) {
  const result = {};
  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex < 1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = stripOptionalQuotes(line.slice(separatorIndex + 1).trim());
    result[key] = value;
  }
  return result;
}

export function redactTaskSourceConfig(config) {
  if (!config) {
    return config;
  }
  return {
    ...config,
    token: config.token ? '[redacted]' : config.token
  };
}

function stripOptionalQuotes(value) {
  if (value.length < 2) {
    return value;
  }

  const first = value[0];
  const last = value.at(-1);
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

function parsePositiveInteger(value, key) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }
  return parsed;
}
