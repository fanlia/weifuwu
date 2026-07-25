/**
 * 技能引擎 — SKILL.md 加载 + Per-Agent 工具注册表
 *
 * 核心概念:
 * - Skill: 一个 SKILL.md 目录，包含元数据 + 工具定义 + handler
 * - SkillRegistry: 每个 AI Agent 持有自己的注册表，实现工具隔离
 *
 * 技能目录结构:
 *   my-skill/
 *   ├── SKILL.md        # 必填: frontmatter + 描述
 *   └── tools.ts        # 必填: 导出 tools[] + createHandlers()
 */

import { readFileSync } from 'node:fs'
import { readdir, access } from 'node:fs/promises'
import { join, isAbsolute, resolve } from 'node:path'
import type { ToolDefinition } from '../ai/types.ts'
import type { Context } from 'weifuwu'

// ── 类型定义 ───────────────────────────────────────────────

export interface SkillMeta {
  name: string
  description: string
  version?: string
}

export interface SkillContext {
  /** 技能目录路径 */
  dir: string
  /** 技能元数据 */
  meta: SkillMeta
  /** 工具定义列表 */
  tools: ToolDefinition[]
  /** 工具 handler 映射 */
  handlers: Record<string, (args: Record<string, unknown>) => unknown | Promise<unknown>>
}

export interface SkillDescriptor {
  meta: SkillMeta
  dir: string
}

// ── SKILL.md 解析 ──────────────────────────────────────────

/**
 * 解析 SKILL.md 的 frontmatter（YAML 风格）
 * 支持: name, description, version, license, compatibility
 */
export function parseSkillFrontmatter(content: string): Record<string, string> {
  const meta: Record<string, string> = {}
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return meta

  const frontmatter = match[1]
  for (const line of frontmatter.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()
    if (key && value) {
      meta[key] = value
    }
  }
  return meta
}

/**
 * 从 frontmatter 构建 SkillMeta
 * 验证 name 和 description 必填
 */
export function buildSkillMeta(raw: Record<string, string>): SkillMeta | null {
  const name = raw.name?.trim()
  const description = raw.description?.trim()

  if (!name || !description) return null

  return {
    name: name.slice(0, 64),
    description: description.slice(0, 1024),
    version: raw.version?.trim(),
  }
}

// ── 技能发现 ───────────────────────────────────────────────

/**
 * 检查目录下是否有合法的 SKILL.md
 */
export async function detectSkill(dir: string): Promise<boolean> {
  try {
    await access(join(dir, 'SKILL.md'))
    return true
  } catch {
    return false
  }
}

/**
 * 扫描目录，发现所有子技能目录（包含 SKILL.md 的目录）
 */
export async function discoverSkills(
  rootDir: string,
): Promise<SkillDescriptor[]> {
  const skills: SkillDescriptor[] = []
  try {
    const entries = await readdir(rootDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillDir = join(rootDir, entry.name)
      if (await detectSkill(skillDir)) {
        const skPath = join(skillDir, 'SKILL.md')
        const content = readFileSync(skPath, 'utf-8')
        const raw = parseSkillFrontmatter(content)
        const meta = buildSkillMeta(raw)
        if (meta) {
          skills.push({ meta, dir: skillDir })
        }
      }
    }
  } catch {
    // 目录不存在或无权访问，返回空列表
  }
  return skills
}

// ── 技能加载 ───────────────────────────────────────────────

/**
 * 从技能目录加载完整的 SkillContext
 * 读取 SKILL.md + 动态导入 tools.ts
 */
export async function loadSkill(
  skillDir: string,
  ctxProvider: () => Context,
): Promise<SkillContext> {
  // 读取 SKILL.md
  const skPath = join(skillDir, 'SKILL.md')
  const skContent = readFileSync(skPath, 'utf-8')
  const raw = parseSkillFrontmatter(skContent)
  const meta = buildSkillMeta(raw)
  if (!meta) {
    throw new Error(`Skill at ${skillDir} 缺少 name 或 description`)
  }

  // 动态导入 tools.ts
  const toolsPath = join(skillDir, 'tools.ts')
  try {
    await access(toolsPath)
  } catch {
    throw new Error(`Skill "${meta.name}" 缺少 tools.ts`)
  }

  // 使用动态 import。注意：需要文件路径是绝对路径或 URL
  const toolsUrl = resolve(toolsPath)
  const toolsModule = await import(toolsUrl)

  const tools: ToolDefinition[] = toolsModule.tools ?? []
  const handlers: Record<string, (args: Record<string, unknown>) => unknown | Promise<unknown>> =
    toolsModule.createHandlers?.(ctxProvider) ?? {}

  if (tools.length === 0) {
    throw new Error(`Skill "${meta.name}" 的 tools.ts 未导出 tools[]`)
  }

  return { dir: skillDir, meta, tools, handlers }
}

// ── SkillRegistry — Per-Agent 工具注册表 ───────────────────

export class SkillRegistry {
  private skills = new Map<string, SkillContext>()
  private agentId: string

  constructor(agentId: string) {
    this.agentId = agentId
  }

  /** 当前 Agent ID */
  getAgentId(): string {
    return this.agentId
  }

  /** 已加载的技能名称列表 */
  getLoadedSkillNames(): string[] {
    return [...this.skills.keys()]
  }

  /** 获取已加载技能的描述列表 */
  getSkillDescriptors(): SkillDescriptor[] {
    return [...this.skills.values()].map(s => ({
      meta: s.meta,
      dir: s.dir,
    }))
  }

  /**
   * 加载一个技能
   * @param skillDir 技能目录路径
   * @param ctxProvider 上下文提供函数
   */
  async loadSkill(skillDir: string, ctxProvider: () => Context): Promise<SkillContext> {
    const skill = await loadSkill(skillDir, ctxProvider)
    this.skills.set(skill.meta.name, skill)
    return skill
  }

  /**
   * 从已注册的 skill context 加载（防止重复加载）
   */
  registerSkill(skill: SkillContext): void {
    this.skills.set(skill.meta.name, skill)
  }

  /**
   * 卸载一个技能
   */
  unloadSkill(name: string): boolean {
    return this.skills.delete(name)
  }

  /**
   * 获取所有已加载技能的 ToolDefinition 列表
   */
  getTools(): ToolDefinition[] {
    const allTools: ToolDefinition[] = []
    for (const skill of this.skills.values()) {
      allTools.push(...skill.tools)
    }
    return allTools
  }

  /**
   * 执行一个 tool call
   * 在所有已加载技能中查找 handler
   */
  async executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    for (const skill of this.skills.values()) {
      const handler = skill.handlers[name]
      if (handler) {
        try {
          const result = await handler(args)
          return typeof result === 'string' ? result : JSON.stringify(result)
        } catch (err) {
          return `Error executing tool "${name}": ${err instanceof Error ? err.message : String(err)}`
        }
      }
    }
    return `Error: tool "${name}" not registered in any loaded skill`
  }

  /**
   * 检查某个 tool 是否已注册
   */
  hasTool(name: string): boolean {
    for (const skill of this.skills.values()) {
      if (skill.handlers[name]) return true
    }
    return false
  }

  /** 清空所有技能 */
  clear(): void {
    this.skills.clear()
  }

  /** 当前技能数 */
  get size(): number {
    return this.skills.size
  }
}
