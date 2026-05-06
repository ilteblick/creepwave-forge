import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { getKnownRoles } from './transition-policy.mjs';

export function parseFrontmatter(text) {
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

export class SkillRegistry {
  constructor({ root = process.cwd(), baseSkillsDir = path.join(root, 'skills', 'base') } = {}) {
    this.root = root;
    this.baseSkillsDir = baseSkillsDir;
    this.skills = new Map();
  }

  async load() {
    const dirents = await readdir(this.baseSkillsDir, { withFileTypes: true });
    const foundRoles = dirents
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name)
      .sort();

    for (const role of getKnownRoles()) {
      if (!foundRoles.includes(role)) {
        throw new Error(`Missing base skill directory for role: ${role}`);
      }
    }

    for (const role of foundRoles) {
      const skillPath = path.join(this.baseSkillsDir, role, 'SKILL.md');
      const text = await readFile(skillPath, 'utf8');
      const { frontmatter, body } = parseFrontmatter(text);
      if (frontmatter.name !== role) {
        throw new Error(`${role}: frontmatter name must match directory`);
      }

      this.skills.set(role, {
        role,
        path: skillPath,
        description: frontmatter.description ?? '',
        frontmatter,
        body,
        text
      });
    }

    return this;
  }

  get(role) {
    const skill = this.skills.get(role);
    if (!skill) {
      throw new Error(`Skill is not loaded for role: ${role}`);
    }
    return skill;
  }
}

export async function loadSkillRegistry(options = {}) {
  const registry = new SkillRegistry(options);
  return registry.load();
}
