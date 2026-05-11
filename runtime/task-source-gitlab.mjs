import { mergeForgeLabels } from './forge-board-labels.mjs';

const defaultGitLabTimeoutMs = 10000;

async function fetchWithTimeout(fetchImpl, url, options = {}, { operation, timeoutMs = defaultGitLabTimeoutMs } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const operationLabel = operation || 'GitLab API request';
  const requestOptions = {
    ...options,
    signal: options.signal ?? controller.signal
  };

  try {
    return await fetchImpl(url, requestOptions);
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw new Error(`${operationLabel} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchGitLabTask({ config, taskId, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch implementation is required');
  }

  const iid = normalizeGitLabIssueIid(taskId);
  const project = parseGitLabProjectUrl(config.url);
  const issueUrl = `${project.apiBaseUrl}/projects/${project.encodedProjectPath}/issues/${iid}`;
  const notesUrl = `${issueUrl}/notes`;
  const headers = buildHeaders(config);

  const timeoutMs = gitLabRequestTimeoutMs(config);
  const issue = await fetchGitLabIssue(issueUrl, { headers, fetchImpl, iid, timeoutMs });
  const notes = await fetchJson(notesUrl, {
    headers,
    fetchImpl,
    operation: `GET issue #${iid} notes`,
    timeoutMs
  }).catch(() => []);
  const comments = Array.isArray(notes)
    ? notes.filter((note) => !note.system).map(normalizeGitLabNote)
    : [];

  return {
    source: {
      type: 'gitlab',
      url: config.url,
      task_url: issue.web_url ?? null
    },
    id: String(issue.iid ?? iid),
    title: issue.title ?? '',
    description: issue.description ?? '',
    labels: Array.isArray(issue.labels) ? issue.labels : [],
    state: issue.state ?? null,
    author: issue.author?.username ?? null,
    created_at: issue.created_at ?? null,
    updated_at: issue.updated_at ?? null,
    comments
  };
}

export async function syncGitLabTaskLabels({
  config,
  taskId,
  desiredLabels,
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch implementation is required');
  }

  const iid = normalizeGitLabIssueIid(taskId);
  const project = parseGitLabProjectUrl(config.url);
  const headers = buildHeaders(config);
  const issueUrl = `${project.apiBaseUrl}/projects/${project.encodedProjectPath}/issues/${iid}`;
  const timeoutMs = gitLabRequestTimeoutMs(config);
  const issue = await fetchJson(issueUrl, {
    headers,
    fetchImpl,
    operation: `GET issue #${iid}`,
    timeoutMs
  });
  const labels = mergeForgeLabels(issue.labels ?? [], desiredLabels);

  await ensureGitLabLabels({ config, project, labels: desiredLabels, fetchImpl });
  await updateGitLabIssueLabels({ config, project, taskId: iid, labels, fetchImpl });

  return {
    source: 'gitlab',
    task_id: iid,
    labels
  };
}

export async function ensureGitLabLabels({ config, project, labels, fetchImpl = globalThis.fetch } = {}) {
  const labelsUrl = `${project.apiBaseUrl}/projects/${project.encodedProjectPath}/labels`;
  const headers = buildHeaders(config);
  const timeoutMs = gitLabRequestTimeoutMs(config);
  for (const label of labels) {
    const response = await fetchWithTimeout(fetchImpl, labelsUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: label, color: labelColor(label) })
    }, {
      operation: `POST label ${label}`,
      timeoutMs
    });
    if (response.ok || response.status === 409) {
      continue;
    }
    throw new Error(`GitLab label create failed with ${response.status} ${response.statusText}`);
  }
}

export async function updateGitLabIssueLabels({
  config,
  project,
  taskId,
  labels,
  fetchImpl = globalThis.fetch
} = {}) {
  const iid = normalizeGitLabIssueIid(taskId);
  const issueUrl = `${project.apiBaseUrl}/projects/${project.encodedProjectPath}/issues/${iid}`;
  const timeoutMs = gitLabRequestTimeoutMs(config);
  const response = await fetchWithTimeout(fetchImpl, issueUrl, {
    method: 'PUT',
    headers: buildHeaders(config),
    body: JSON.stringify({ labels })
  }, {
    operation: `PUT issue #${iid} labels`,
    timeoutMs
  });
  if (!response.ok) {
    throw new Error(`GitLab issue label update failed with ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export function parseGitLabProjectUrl(projectUrl) {
  const url = new URL(projectUrl);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const gitlabIndex = pathParts.indexOf('gitlab');
  const prefixParts = gitlabIndex >= 0 ? pathParts.slice(0, gitlabIndex + 1) : [];
  const projectParts = gitlabIndex >= 0 ? pathParts.slice(gitlabIndex + 1) : pathParts;
  if (projectParts.length < 2) {
    throw new Error('TASK_SOURCE_URL must point to a GitLab project path');
  }

  const apiPrefix = prefixParts.length > 0 ? `/${prefixParts.join('/')}` : '';
  const projectPath = projectParts.join('/');
  return {
    apiBaseUrl: `${url.origin}${apiPrefix}/api/v4`,
    projectPath,
    encodedProjectPath: encodeURIComponent(projectPath)
  };
}

export function normalizeGitLabIssueIid(taskId) {
  const iid = String(taskId ?? '').trim().replace(/^#/, '');
  if (!/^\d+$/.test(iid)) {
    throw new Error('GitLab task id must be an issue iid like #123 or 123');
  }
  return iid;
}

async function fetchJson(url, { headers, fetchImpl, operation = 'GET GitLab JSON', timeoutMs }) {
  const response = await fetchWithTimeout(fetchImpl, url, { headers }, { operation, timeoutMs });
  if (!response.ok) {
    throw new Error(`GitLab API request failed with ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchGitLabIssue(url, { headers, fetchImpl, iid, timeoutMs }) {
  const response = await fetchWithTimeout(fetchImpl, url, { headers }, { operation: `GET issue #${iid}`, timeoutMs });
  if (response.status === 404) {
    throw new Error(`GitLab task #${iid} was not found`);
  }
  if (!response.ok) {
    throw new Error(`GitLab task #${iid} fetch failed with ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function buildHeaders(config) {
  return {
    'PRIVATE-TOKEN': config.token,
    'Content-Type': 'application/json'
  };
}

function labelColor(label) {
  if (label === 'forge') {
    return '#2563EB';
  }
  if (label.startsWith('forge-role:')) {
    return '#7C3AED';
  }
  return '#0EA5E9';
}

function gitLabRequestTimeoutMs(config) {
  const value = Number(config?.requestTimeoutMs);
  return Number.isFinite(value) && value > 0 ? value : defaultGitLabTimeoutMs;
}

function normalizeGitLabNote(note) {
  return {
    id: String(note.id),
    author: note.author?.username ?? null,
    body: note.body ?? '',
    created_at: note.created_at ?? null
  };
}
