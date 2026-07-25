/**
 * Skills 引擎测试
 */

import { describe, it, before, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  parseSkillFrontmatter,
  buildSkillMeta,
  detectSkill,
  discoverSkills,
  loadSkill,
  SkillRegistry,
} from '../src/services/skills.ts'
import type { ToolDefinition } from '../src/ai/types.ts'

// ── 工具函数 ───────────────────────────────────────────────

function createTempSkillDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'skill-test-'))
  return dir
}

function writeSkill(dir: string, frontmatter: Record<string, string>, body: string = ''): void {
  const fmLines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`)
  const content = `---\n${fmLines.join('\n')}\n---\n\n${body}`
  writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8')
}

function writeTools(dir: string, tools: ToolDefinition[], handlerCode: string): void {
  const code = `
import type { ToolDefinition } from '../../../src/ai/types.ts'

export const tools: ToolDefinition[] = ${JSON.stringify(tools, null, 2)}

export function createHandlers(_ctxProvider: any) {
  return ${handlerCode}
}
`
  writeFileSync(join(dir, 'tools.ts'), code, 'utf-8')
}

describe('Skills Engine', () => {

  // ── SKILL.md 解析 ─────────────────────────────────────

  describe('parseSkillFrontmatter', () => {
    it('解析有效 frontmatter', () => {
      const md = `---
name: test-skill
description: A test skill
version: 1.0.0
---

# Test`
      const meta = parseSkillFrontmatter(md)
      assert.equal(meta.name, 'test-skill')
      assert.equal(meta.description, 'A test skill')
      assert.equal(meta.version, '1.0.0')
    })

    it('无 frontmatter 返回空对象', () => {
      const md = '# Just a heading\n\nSome text'
      const meta = parseSkillFrontmatter(md)
      assert.deepEqual(meta, {})
    })

    it('空内容返回空对象', () => {
      const meta = parseSkillFrontmatter('')
      assert.deepEqual(meta, {})
    })

    it('缺少冒号的行被跳过', () => {
      const md = `---
name: test
description: A test
invalid line without colon
---

# Test`
      const meta = parseSkillFrontmatter(md)
      assert.equal(meta.name, 'test')
      assert.equal(meta.description, 'A test')
      assert.equal(meta['invalid line without colon'], undefined)
    })
  })

  // ── buildSkillMeta ──────────────────────────────────────

  describe('buildSkillMeta', () => {
    it('有效的 name 和 description', () => {
      const meta = buildSkillMeta({ name: 'my-skill', description: 'Does something' })
      assert.ok(meta)
      assert.equal(meta!.name, 'my-skill')
      assert.equal(meta!.description, 'Does something')
    })

    it('缺少 name 返回 null', () => {
      const meta = buildSkillMeta({ description: 'Something' })
      assert.equal(meta, null)
    })

    it('缺少 description 返回 null', () => {
      const meta = buildSkillMeta({ name: 'my-skill' })
      assert.equal(meta, null)
    })

    it('name 超过 64 字符被截断', () => {
      const longName = 'a'.repeat(100)
      const meta = buildSkillMeta({ name: longName, description: 'test' })
      assert.ok(meta)
      assert.equal(meta!.name.length, 64)
    })
  })

  // ── detectSkill ─────────────────────────────────────────

  describe('detectSkill', () => {
    it('存在 SKILL.md 返回 true', async () => {
      const dir = createTempSkillDir()
      writeFileSync(join(dir, 'SKILL.md'), '---\nname: test\n---', 'utf-8')
      assert.equal(await detectSkill(dir), true)
      rmSync(dir, { recursive: true })
    })

    it('不存在 SKILL.md 返回 false', async () => {
      const dir = createTempSkillDir()
      writeFileSync(join(dir, 'readme.txt'), 'hello', 'utf-8')
      assert.equal(await detectSkill(dir), false)
      rmSync(dir, { recursive: true })
    })

    it('目录不存在返回 false', async () => {
      assert.equal(await detectSkill('/nonexistent/path'), false)
    })
  })

  // ── discoverSkills ──────────────────────────────────────

  describe('discoverSkills', () => {
    it('扫描出所有含 SKILL.md 的子目录', async () => {
      const root = createTempSkillDir()
      const s1 = join(root, 'skill-a'); mkdirSync(s1)
      writeSkill(s1, { name: 'skill-a', description: 'Skill A' })
      const s2 = join(root, 'skill-b'); mkdirSync(s2)
      writeSkill(s2, { name: 'skill-b', description: 'Skill B' })
      // 无 SKILL.md 的目录应被忽略
      mkdirSync(join(root, 'not-a-skill'))

      const skills = await discoverSkills(root)
      assert.equal(skills.length, 2)
      assert.ok(skills.some(s => s.meta.name === 'skill-a'))
      assert.ok(skills.some(s => s.meta.name === 'skill-b'))
      rmSync(root, { recursive: true })
    })

    it('目录不存在返回空列表', async () => {
      const skills = await discoverSkills('/nonexistent/path')
      assert.deepEqual(skills, [])
    })
  })

  // ── SKillRegistry ──────────────────────────────────────

  describe('SkillRegistry', () => {
    it('空注册表 getTools 返回空列表', () => {
      const reg = new SkillRegistry('agent-1')
      assert.deepEqual(reg.getTools(), [])
      assert.equal(reg.size, 0)
    })

    it('注册技能后 getTools 返回工具定义', () => {
      const reg = new SkillRegistry('agent-1')
      reg.registerSkill({
        dir: '/tmp/test',
        meta: { name: 'test', description: 'Test' },
        tools: [
          {
            type: 'function',
            function: { name: 'hello', description: 'Say hello', parameters: {} },
          },
        ],
        handlers: {
          hello: async (_args) => 'Hello!',
        },
      })

      assert.equal(reg.size, 1)
      assert.equal(reg.getTools().length, 1)
      assert.equal(reg.getTools()[0].function.name, 'hello')
      assert.ok(reg.hasTool('hello'))
    })

    it('executeTool 执行正确的 handler', async () => {
      const reg = new SkillRegistry('agent-2')
      reg.registerSkill({
        dir: '/tmp/test',
        meta: { name: 'test', description: 'Test' },
        tools: [
          {
            type: 'function',
            function: { name: 'greet', description: 'Greet', parameters: { type: 'object', properties: { name: { type: 'string' } } } },
          },
        ],
        handlers: {
          greet: async (args) => `Hello, ${args.name ?? 'world'}!`,
        },
      })

      const result = await reg.executeTool('greet', { name: 'Alice' })
      assert.equal(result, 'Hello, Alice!')
    })

    it('executeTool 不存在的 tool 返回错误', async () => {
      const reg = new SkillRegistry('agent-3')
      const result = await reg.executeTool('nonexistent', {})
      assert.ok(result.includes('not registered'))
    })

    it('unloadSkill 移除技能', () => {
      const reg = new SkillRegistry('agent-4')
      reg.registerSkill({
        dir: '/tmp/test',
        meta: { name: 'test', description: 'Test' },
        tools: [],
        handlers: {},
      })
      assert.equal(reg.size, 1)
      reg.unloadSkill('test')
      assert.equal(reg.size, 0)
    })

    it('clear 清空所有技能', () => {
      const reg = new SkillRegistry('agent-5')
      reg.registerSkill({
        dir: '/tmp/a', meta: { name: 'a', description: 'A' }, tools: [], handlers: {},
      })
      reg.registerSkill({
        dir: '/tmp/b', meta: { name: 'b', description: 'B' }, tools: [], handlers: {},
      })
      assert.equal(reg.size, 2)
      reg.clear()
      assert.equal(reg.size, 0)
    })

    it('getLoadedSkillNames 返回技能名列表', () => {
      const reg = new SkillRegistry('agent-6')
      reg.registerSkill({
        dir: '/tmp/a', meta: { name: 'skill-x', description: 'X' }, tools: [], handlers: {},
      })
      reg.registerSkill({
        dir: '/tmp/b', meta: { name: 'skill-y', description: 'Y' }, tools: [], handlers: {},
      })
      const names = reg.getLoadedSkillNames()
      assert.ok(names.includes('skill-x'))
      assert.ok(names.includes('skill-y'))
      assert.equal(names.length, 2)
    })

    it('两个 Agent 技能互不干扰', () => {
      const regA = new SkillRegistry('agent-a')
      const regB = new SkillRegistry('agent-b')

      regA.registerSkill({
        dir: '/tmp/a', meta: { name: 'skill-a-only', description: 'Only A' }, tools: [
          { type: 'function', function: { name: 'tool_a', description: 'A', parameters: {} } },
        ], handlers: { tool_a: async () => 'from A' },
      })

      assert.equal(regA.getTools().length, 1)
      assert.equal(regB.getTools().length, 0)
      assert.ok(!regB.hasTool('tool_a'))
    })
  })

  // ── loadSkill（集成测试） ──────────────────────────────

  describe('loadSkill', () => {
    it('从有效技能目录加载', async () => {
      const dir = createTempSkillDir()
      writeSkill(dir, { name: 'test-skill', description: 'A test skill' })
      writeTools(dir, [
        { type: 'function', function: { name: 'ping', description: 'Ping', parameters: {} } },
      ], `{ ping: async (_args) => 'pong' }`)

      const skill = await loadSkill(dir, () => ({} as any))
      assert.equal(skill.meta.name, 'test-skill')
      assert.equal(skill.tools.length, 1)
      assert.equal(skill.tools[0].function.name, 'ping')
      assert.ok(skill.handlers.ping)

      const result = await skill.handlers.ping({})
      assert.equal(result, 'pong')

      rmSync(dir, { recursive: true })
    })

    it('缺少 tools.ts 抛出错误', async () => {
      const dir = createTempSkillDir()
      writeSkill(dir, { name: 'no-tools', description: 'Missing tools.ts' })

      await assert.rejects(
        () => loadSkill(dir, () => ({} as any)),
        /缺少 tools\.ts/,
      )
      rmSync(dir, { recursive: true })
    })

    it('SKILL.md 缺少 description 抛出错误', async () => {
      const dir = createTempSkillDir()
      writeFileSync(join(dir, 'SKILL.md'), '---\nname: no-desc\n---', 'utf-8')
      writeTools(dir, [
        { type: 'function', function: { name: 'test', description: 'Test', parameters: {} } },
      ], `{ test: async () => 'ok' }`)

      await assert.rejects(
        () => loadSkill(dir, () => ({} as any)),
        /缺少 name 或 description/,
      )
      rmSync(dir, { recursive: true })
    })
  })
})
