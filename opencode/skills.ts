import { readFileSync, existsSync } from 'node:fs'
import { readdirSync } from 'node:fs'
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

export function parseSkillFile(filePath: string): SkillDef | null {
  try {
    const raw = readFileSync(filePath, 'utf-8')

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
      compatibility: typeof frontmatter.compatibility === 'string' ? frontmatter.compatibility : undefined,
      path: filePath,
    }
  } catch {
    return null
  }
}

function scanDir(dir: string): SkillDef[] {
  try {
    if (!existsSync(dir)) return []
    const entries = readdirSync(dir, { withFileTypes: true })
    const skills: SkillDef[] = []
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillFile = resolve(dir, entry.name, 'SKILL.md')
        if (existsSync(skillFile)) {
          const skill = parseSkillFile(skillFile)
          if (skill) skills.push(skill)
        }
      }
    }
    return skills
  } catch {
    return []
  }
}

export function discoverSkills(workspace: string): SkillDef[] {
  const skills: SkillDef[] = []

  for (const dirFn of SEARCH_DIRS) {
    skills.push(...scanDir(dirFn(workspace)))
  }

  for (const dir of GLOBAL_DIRS) {
    skills.push(...scanDir(dir))
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
