import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const baseSkillsDir = path.join(root, 'skills', 'base');
const contractsDir = path.join(root, 'contracts');
const fixturesDir = path.join(root, 'tests', 'fixtures');

const requiredSkillSections = [
  'Purpose',
  'Workflow',
  'Gotchas'
];

const expectedArtifactsByRole = {
  'backend-engineer': ['Backend Implementation Summary', 'Backend Plan'],
  'bug-investigator': ['Bug Investigation Report', 'Investigation Blocked'],
  'business-analyst': ['Requirements Draft', 'Clarification Needed'],
  'code-reviewer': ['Review Findings'],
  'context-router': ['Selected Role', 'Reason', 'Context Passed', 'Conflict/Error'],
  'frontend-engineer': ['Frontend Implementation Summary', 'Frontend Plan'],
  'handoff-writer': ['Role Handoff', 'Clarification Needed'],
  'qa-engineer': ['QA Plan', 'QA Validation Summary'],
  'solution-architect': ['Technical Design', 'Clarification Needed'],
  'ui-ux-designer': ['UI/UX Design Handoff', 'Clarification Needed']
};

const requiredFlows = [
  ['business-analyst', 'Requirements Draft', 'solution-architect'],
  ['business-analyst', 'Requirements Draft', 'ui-ux-designer'],
  ['solution-architect', 'Technical Design', 'backend-engineer'],
  ['solution-architect', 'Technical Design', 'frontend-engineer'],
  ['solution-architect', 'Technical Design', 'qa-engineer'],
  ['ui-ux-designer', 'UI/UX Design Handoff', 'frontend-engineer'],
  ['backend-engineer', 'Backend Implementation Summary', 'frontend-engineer'],
  ['backend-engineer', 'Backend Implementation Summary', 'qa-engineer'],
  ['frontend-engineer', 'Frontend Implementation Summary', 'qa-engineer'],
  ['bug-investigator', 'Bug Investigation Report', 'backend-engineer'],
  ['bug-investigator', 'Bug Investigation Report', 'frontend-engineer'],
  ['code-reviewer', 'Review Findings', 'backend-engineer'],
  ['code-reviewer', 'Review Findings', 'frontend-engineer'],
  ['qa-engineer', 'QA Validation Summary', 'handoff-writer']
];

const failures = [];

function fail(message) {
  failures.push(message);
}

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const frontmatter = {};
  if (!match) {
    return { frontmatter, body: text };
  }

  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([^:]+):\s*(.*)$/);
    if (!field) continue;
    let value = field[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    frontmatter[field[1].trim()] = value;
  }

  return {
    frontmatter,
    body: text.slice(match[0].length)
  };
}

function hasHeading(body, heading) {
  return new RegExp(`^## ${escapeRegExp(heading)}\\s*$`, 'm').test(body);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractMentionedRoles(body, roles) {
  const found = new Set();
  for (const role of roles) {
    const pattern = new RegExp(`\\\`${escapeRegExp(role)}\\\``, 'g');
    if (pattern.test(body)) {
      found.add(role);
    }
  }
  return found;
}

function extractJsonBlocks(markdown) {
  return [...markdown.matchAll(/```json\s*([\s\S]*?)```/g)].map((match) => match[1].trim());
}

function extractFixtureRoles(markdown) {
  return [...markdown.matchAll(/^\d+\.\s+`([^`]+)`/gm)].map((match) => match[1]);
}

function readHandoffContract(schema) {
  const roles = schema?.$defs?.role?.enum ?? [];
  const requiredFields = schema?.required ?? [];
  const artifactTypes = schema?.properties?.artifacts?.items?.properties?.type?.enum ?? [];

  if (roles.length === 0) {
    fail('handoff.schema.json: role enum is missing or empty');
  }
  if (requiredFields.length === 0) {
    fail('handoff.schema.json: required fields are missing or empty');
  }
  if (artifactTypes.length === 0) {
    fail('handoff.schema.json: artifact type enum is missing or empty');
  }

  return {
    roles,
    requiredFields,
    artifactTypes
  };
}

function validateHandoffObject(object, sourceFile, contract) {
  for (const field of contract.requiredFields) {
    if (!(field in object)) {
      fail(`${sourceFile}: missing handoff field "${field}"`);
    }
  }

  if (!contract.roles.includes(object.source_role)) {
    fail(`${sourceFile}: invalid source_role "${object.source_role}"`);
  }
  if (!contract.roles.includes(object.target_role)) {
    fail(`${sourceFile}: invalid target_role "${object.target_role}"`);
  }

  for (const field of ['goal', 'scope', 'next_action']) {
    if (typeof object[field] !== 'string' || object[field].trim() === '') {
      fail(`${sourceFile}: "${field}" must be a non-empty string`);
    }
  }

  for (const field of ['confirmed', 'decisions', 'assumptions', 'open_questions', 'risks']) {
    if (!Array.isArray(object[field])) {
      fail(`${sourceFile}: "${field}" must be an array`);
      continue;
    }
    for (const [index, item] of object[field].entries()) {
      if (typeof item !== 'string' || item.trim() === '') {
        fail(`${sourceFile}: "${field}[${index}]" must be a non-empty string`);
      }
    }
  }

  if (!Array.isArray(object.artifacts)) {
    fail(`${sourceFile}: "artifacts" must be an array`);
    return;
  }

  for (const [index, artifact] of object.artifacts.entries()) {
    if (typeof artifact !== 'object' || artifact === null || Array.isArray(artifact)) {
      fail(`${sourceFile}: artifacts[${index}] must be an object`);
      continue;
    }
    for (const field of ['name', 'type', 'summary']) {
      if (typeof artifact[field] !== 'string' || artifact[field].trim() === '') {
        fail(`${sourceFile}: artifacts[${index}].${field} must be a non-empty string`);
      }
    }
    if (!contract.artifactTypes.includes(artifact.type)) {
      fail(`${sourceFile}: artifacts[${index}].type "${artifact.type}" is not allowed`);
    }
  }
}

async function main() {
  const schemaPath = path.join(contractsDir, 'handoff.schema.json');
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const contract = readHandoffContract(schema);

  const skillDirents = await readdir(baseSkillsDir, { withFileTypes: true });
  const skillDirs = skillDirents
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .sort();

  if (skillDirs.length !== contract.roles.length) {
    fail(`Expected ${contract.roles.length} base skills from handoff schema, found ${skillDirs.length}`);
  }

  for (const role of contract.roles) {
    if (!skillDirs.includes(role)) {
      fail(`Missing base skill: ${role}`);
    }
  }

  const skillBodies = new Map();

  for (const role of skillDirs) {
    const skillDir = path.join(baseSkillsDir, role);
    const skillPath = path.join(skillDir, 'SKILL.md');
    const agentPath = path.join(skillDir, 'agents', 'openai.yaml');
    const text = await readFile(skillPath, 'utf8');
    const { frontmatter, body } = parseFrontmatter(text);
    skillBodies.set(role, body);

    if (frontmatter.name !== role) {
      fail(`${role}: frontmatter name must match directory`);
    }
    if (!frontmatter.description) {
      fail(`${role}: missing description`);
    }
    if (frontmatter.description && frontmatter.description.length > 320) {
      fail(`${role}: description is too long (${frontmatter.description.length})`);
    }

    for (const heading of requiredSkillSections) {
      if (!hasHeading(body, heading)) {
        fail(`${role}: missing ## ${heading}`);
      }
    }

    if (!hasHeading(body, 'Handoff Contract')) {
      fail(`${role}: missing ## Handoff Contract`);
    }

    for (const artifact of expectedArtifactsByRole[role] ?? []) {
      if (!body.includes(artifact)) {
        fail(`${role}: missing expected artifact "${artifact}"`);
      }
    }

    const mentionedRoles = extractMentionedRoles(body, contract.roles);
    for (const mentionedRole of mentionedRoles) {
      if (!contract.roles.includes(mentionedRole)) {
        fail(`${role}: mentions unknown role "${mentionedRole}"`);
      }
    }

    const agentText = await readFile(agentPath, 'utf8').catch(() => '');
    if (!agentText.includes('interface:') || !agentText.includes('display_name:') || !agentText.includes('default_prompt:')) {
      fail(`${role}: agents/openai.yaml missing interface/display_name/default_prompt`);
    }
  }

  for (const [from, artifact, to] of requiredFlows) {
    const sourceBody = skillBodies.get(from) ?? '';
    const targetBody = skillBodies.get(to) ?? '';
    if (!sourceBody.includes(artifact)) {
      fail(`Flow ${from} -> ${to}: source does not produce "${artifact}"`);
    }
    if (!/handoff|requirements|implementation summaries|implementation details|changed contracts|bug reports|review|findings|design handoff|architecture\/design|contracts/i.test(targetBody)) {
      fail(`Flow ${from} -> ${to}: target does not appear to accept upstream context`);
    }
  }

  const examplesDir = path.join(contractsDir, 'examples');
  const exampleFiles = (await readdir(examplesDir)).filter((file) => file.endsWith('.md'));
  if (exampleFiles.length === 0) {
    fail('contracts/examples: no markdown examples found');
  }

  for (const file of exampleFiles) {
    const filePath = path.join(examplesDir, file);
    const markdown = await readFile(filePath, 'utf8');
    const blocks = extractJsonBlocks(markdown);
    if (blocks.length === 0) {
      fail(`${file}: no json handoff example found`);
    }
    for (const block of blocks) {
      let object;
      try {
        object = JSON.parse(block);
      } catch (error) {
        fail(`${file}: invalid JSON block: ${error.message}`);
        continue;
      }
      validateHandoffObject(object, file, contract);
    }
  }

  const fixtureFiles = (await readdir(fixturesDir)).filter((file) => file.endsWith('.md'));
  if (fixtureFiles.length === 0) {
    fail('tests/fixtures: no markdown fixtures found');
  }

  for (const file of fixtureFiles) {
    const filePath = path.join(fixturesDir, file);
    const markdown = await readFile(filePath, 'utf8');
    const fixtureRoles = extractFixtureRoles(markdown);
    if (fixtureRoles.length < 2) {
      fail(`${file}: expected role path must include at least two numbered role entries`);
    }
    for (const role of fixtureRoles) {
      if (!contract.roles.includes(role)) {
        fail(`${file}: fixture references unknown role "${role}"`);
      }
      if (!expectedArtifactsByRole[role]) {
        fail(`${file}: fixture role "${role}" has no expected artifact mapping`);
      }
    }
    if (!markdown.includes('contracts/handoff.schema.json')) {
      fail(`${file}: fixture must reference contracts/handoff.schema.json`);
    }
  }

  if (failures.length > 0) {
    console.error('Skill validation failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`Skill validation passed: ${skillDirs.length} base skills, ${requiredFlows.length} role flows, ${exampleFiles.length} handoff examples, ${fixtureFiles.length} fixtures.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
