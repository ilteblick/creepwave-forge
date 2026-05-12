export function buildTaskPrompt(task) {
  const source = task.source ?? {};
  const lines = [
    'Route this tracker task through Creepwave Forge.',
    '',
    '## Task Source',
    `Source Type: ${source.type ?? 'unknown'}`,
    `Source URL: ${source.url ?? ''}`,
    `Task URL: ${source.task_url ?? ''}`,
    `Task ID: ${task.id ?? ''}`,
    `Title: ${task.title ?? ''}`,
    `State: ${task.state ?? ''}`,
    `Author: ${task.author ?? ''}`,
    `Labels: ${formatList(task.labels)}`,
    '',
    '## Title',
    task.title ?? '',
    '',
    '## Description',
    task.description ?? '',
    '',
    '## Comments',
    formatComments(task.comments),
    '',
    'Start with context-router and choose the narrowest sufficient next Forge role.'
  ];

  return `${lines.join('\n').trim()}\n`;
}

function formatList(values) {
  return Array.isArray(values) && values.length > 0 ? values.join(', ') : '(none)';
}

function formatComments(comments) {
  if (!Array.isArray(comments) || comments.length === 0) {
    return '(none)';
  }

  return comments.map((comment, index) => [
    `### Comment ${index + 1}`,
    `Author: ${comment.author ?? ''}`,
    `Created: ${comment.created_at ?? ''}`,
    '',
    comment.body ?? ''
  ].join('\n')).join('\n\n');
}
