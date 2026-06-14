import { readFile, glob } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { SkillDef, SkillRegistry } from './types.ts'

const SEARCH_DIRS = [
  (ws: string) => `${ws}/.opencode/skills`,
  (ws: string) => `${ws}/.claude/skills`,
  (ws: string) => `${ws}/.agents/skills`,
]

const GLOBAL_DIRS = [
  `${homedir()}/.config/opencode/skills`,
  `${homedir()}/.claude/skills`,
  `${homedir()}/.agents/skills`,
]

export async function parseSkillFile(filePath: string): Promise<SkillDef | null> {
  try {
    const raw = await readFile(filePath, 'utf-8')

    const frontmatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
    if (!frontmatch) return null

    const frontmatter = parseYaml(frontmatch[1]) as Record<string, unknown>
    const content = frontmatch[2].trim()

    const name = frontmatter.name
    const description = frontmatter.description
    if (typeof name !== 'string' || typeof description !== 'string') return null

    return {
      name,
      description,
      content,
      license: typeof frontmatter.license === 'string' ? frontmatter.license : undefined,
      compatibility:
        typeof frontmatter.compatibility === 'string' ? frontmatter.compatibility : undefined,
      path: filePath,
    }
  } catch {
    return null
  }
}

async function scanDir(dir: string): Promise<SkillDef[]> {
  try {
    const files: SkillDef[] = []
    for await (const entry of glob('*/SKILL.md', { cwd: dir })) {
      const skill = await parseSkillFile(resolve(dir, entry))
      if (skill) files.push(skill)
    }
    return files
  } catch {
    return []
  }
}

export async function discoverSkills(workspace: string): Promise<SkillDef[]> {
  const skills: SkillDef[] = []

  for (const dirFn of SEARCH_DIRS) {
    skills.push(...(await scanDir(dirFn(workspace))))
  }

  for (const dir of GLOBAL_DIRS) {
    skills.push(...(await scanDir(dir)))
  }

  return skills
}

export function buildSkillRegistry(discovered: SkillDef[], manual: SkillDef[]): SkillRegistry {
  const map = new Map<string, SkillDef>()

  for (const s of manual) {
    map.set(s.name, s)
  }

  for (const s of discovered) {
    if (!map.has(s.name)) {
      map.set(s.name, s)
    }
  }

  const all = [...map.values()]

  return {
    all,
    get(name: string): SkillDef | undefined {
      return map.get(name)
    },
    list(): SkillDef[] {
      return all
    },
  }
}
