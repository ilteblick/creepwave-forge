const broadContextRoles = new Set([
  'context-router'
]);

const rolePathSegments = {
  'backend-engineer': ['api', 'backend', 'server', 'service', 'services', 'db', 'database', 'migration', 'migrations', 'runtime'],
  'bug-investigator': ['test', 'tests', 'spec', 'qa', 'quality', 'bug', 'debug', 'runtime', 'logs'],
  'business-analyst': ['docs', 'requirements', 'prd', 'product', 'business', 'workflow'],
  'code-reviewer': ['test', 'tests', 'spec', 'qa', 'quality', 'review', 'contracts', 'runtime'],
  'frontend-engineer': ['web', 'ui', 'frontend', 'client', 'components', 'pages', 'routes'],
  'handoff-writer': ['docs', 'handoff', 'release', 'workflow', 'qa', 'quality'],
  'qa-engineer': ['test', 'tests', 'spec', 'qa', 'quality', 'fixtures', 'workflow'],
  'solution-architect': ['api', 'backend', 'server', 'web', 'ui', 'frontend', 'client', 'contracts', 'runtime', 'architecture', 'docs'],
  'ui-ux-designer': ['web', 'ui', 'ux', 'design', 'frontend', 'client', 'components', 'pages']
};

export function selectRoleContext({ projectContext, activeRole } = {}) {
  if (!projectContext) {
    return {
      text: 'No project context provided.',
      files: [],
      full_context_path: null,
      filtered: false,
      note: 'No project context object was provided.'
    };
  }

  const files = projectContext.files ?? [];
  const fullContextPath = projectContext.snapshotPath ?? projectContext.context_snapshot ?? null;

  if (files.length === 0) {
    return {
      text: projectContext.text ?? 'No project context provided.',
      files: [],
      full_context_path: fullContextPath,
      filtered: false,
      note: 'No project agent files were available for filtering.'
    };
  }

  if (broadContextRoles.has(activeRole)) {
    return {
      text: projectContext.text,
      files,
      full_context_path: fullContextPath,
      filtered: false,
      note: `${activeRole} receives the full context so it can route work correctly.`
    };
  }

  const selectedFiles = selectFilesForRole(files, activeRole);
  return {
    text: formatSelectedContext({
      projectRoot: projectContext.projectRoot,
      files: selectedFiles,
      emptyText: projectContext.text
    }),
    files: selectedFiles,
    full_context_path: fullContextPath,
    filtered: selectedFiles.length < files.length,
    note: selectedFiles.length === files.length
      ? 'All context files were selected for this role.'
      : `Selected ${selectedFiles.length} of ${files.length} context files for ${activeRole}.`
  };
}

function selectFilesForRole(files, activeRole) {
  const selected = [];
  const seen = new Set();

  for (const file of files) {
    if (isRootContextFile(file) || fileMatchesRole(file, activeRole)) {
      const key = file.relativePath ?? file.path;
      if (!seen.has(key)) {
        selected.push(file);
        seen.add(key);
      }
    }
  }

  return selected;
}

function isRootContextFile(file) {
  return !normalizePath(file.relativePath ?? file.path ?? '').includes('/');
}

function fileMatchesRole(file, activeRole) {
  const segments = rolePathSegments[activeRole] ?? [];
  if (segments.length === 0) {
    return false;
  }

  const pathSegments = normalizePath(file.relativePath ?? file.path ?? '')
    .toLowerCase()
    .split('/')
    .filter(Boolean);

  return pathSegments.some((segment) => (
    segments.includes(segment) || segments.some((candidate) => segment.includes(candidate))
  ));
}

function formatSelectedContext({ projectRoot, files, emptyText }) {
  if (files.length === 0) {
    return emptyText ?? 'No project context provided.';
  }

  const parts = [
    '# Project Root',
    projectRoot ?? 'Unknown project root'
  ];

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

function normalizePath(value) {
  return value.replace(/\\/g, '/');
}
