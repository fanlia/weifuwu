/**
 * 工作空间工具测试
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  createWorkspaceHandlers,
  getWorkspaceToolDefs,
} from '../src/tools/workspace.ts'

describe('Workspace Tools', () => {
  let workspace: string
  let handlers: Record<string, (args: Record<string, unknown>) => Promise<string>>

  before(() => {
    // 创建测试工作空间
    workspace = mkdtempSync(join(tmpdir(), 'ws-test-'))

    // 创建一些测试文件
    mkdirSync(join(workspace, 'src'))
    writeFileSync(join(workspace, 'src', 'hello.ts'), 'console.log("hello")\nconst x = 1\n', 'utf-8')
    writeFileSync(join(workspace, 'src', 'utils.ts'), 'export function add(a: number, b: number) {\n  return a + b\n}\n', 'utf-8')
    writeFileSync(join(workspace, 'README.md'), '# Test Project\n\nThis is a test.\n', 'utf-8')
    mkdirSync(join(workspace, 'sub'))
    writeFileSync(join(workspace, 'sub', 'nested.txt'), 'nested content here', 'utf-8')

    handlers = createWorkspaceHandlers(workspace, true) as any
  })

  after(() => {
    rmSync(workspace, { recursive: true })
  })

  // ── getWorkspaceToolDefs ────────────────────────────────

  describe('getWorkspaceToolDefs', () => {
    it('不启用 bash 时返回 5 个工具', () => {
      const defs = getWorkspaceToolDefs(false)
      assert.equal(defs.length, 5)
      const names = defs.map(d => d.function.name)
      assert.ok(names.includes('read'))
      assert.ok(names.includes('write'))
      assert.ok(names.includes('edit'))
      assert.ok(names.includes('grep'))
      assert.ok(names.includes('list_files'))
      assert.ok(!names.includes('bash'))
    })

    it('启用 bash 时返回 6 个工具', () => {
      const defs = getWorkspaceToolDefs(true)
      assert.equal(defs.length, 6)
      assert.ok(defs.some(d => d.function.name === 'bash'))
    })
  })

  // ── read ────────────────────────────────────────────────

  describe('read', () => {
    it('读取存在的文件', async () => {
      const result = await handlers.read({ path: 'README.md' })
      assert.ok(result.includes('# Test Project'))
    })

    it('读取子目录文件', async () => {
      const result = await handlers.read({ path: 'sub/nested.txt' })
      assert.equal(result, 'nested content here')
    })

    it('路径遍历攻击被拒绝', async () => {
      const result = await handlers.read({ path: '../etc/passwd' })
      assert.ok(result.includes('超出了工作空间范围') || result.includes('失败'))
    })

    it('不存在的文件返回错误', async () => {
      const result = await handlers.read({ path: 'nonexistent.ts' })
      assert.ok(result.includes('失败') || result.includes('ENOENT'))
    })
  })

  // ── write ───────────────────────────────────────────────

  describe('write', () => {
    it('创建新文件', async () => {
      const result = await handlers.write({ path: 'newfile.txt', content: 'hello world' })
      assert.ok(result.includes('已写入'))
      // 验证文件已创建
      const { readFileSync } = await import('node:fs')
      const content = readFileSync(join(workspace, 'newfile.txt'), 'utf-8')
      assert.equal(content, 'hello world')
    })

    it('写入子目录', async () => {
      const result = await handlers.write({ path: 'deep/a/b/c.txt', content: 'deep' })
      assert.ok(result.includes('已写入'))
    })
  })

  // ── edit ────────────────────────────────────────────────

  describe('edit', () => {
    it('替换文本', async () => {
      // 先写入测试文件
      await handlers.write({ path: 'edit_test.txt', content: 'foo bar baz' })

      const result = await handlers.edit({ path: 'edit_test.txt', oldText: 'bar', newText: 'qux' })
      assert.ok(result.includes('已编辑'))

      const { readFileSync } = await import('node:fs')
      const content = readFileSync(join(workspace, 'edit_test.txt'), 'utf-8')
      assert.equal(content, 'foo qux baz')
    })

    it('oldText 不匹配返回提示', async () => {
      const result = await handlers.edit({ path: 'edit_test.txt', oldText: 'nonexistent', newText: 'x' })
      assert.ok(result.includes('未找到匹配'))
    })
  })

  // ── grep ────────────────────────────────────────────────

  describe('grep', () => {
    it('搜索存在的文本', async () => {
      const result = await handlers.grep({ pattern: 'console.log' })
      assert.ok(result.includes('hello.ts'))
    })

    it('搜索不存在的文本返回未找到', async () => {
      const result = await handlers.grep({ pattern: 'xyznonexistent123' })
      assert.ok(result.includes('未找到匹配'))
    })
  })

  // ── list_files ──────────────────────────────────────────

  describe('list_files', () => {
    it('列出根目录', async () => {
      const result = await handlers.list_files({})
      assert.ok(result.includes('README.md'))
      assert.ok(result.includes('src/'))
    })

    it('列出子目录', async () => {
      const result = await handlers.list_files({ path: 'src' })
      assert.ok(result.includes('hello.ts'))
    })
  })

  // ── bash ───────────────────────────────────────────────

  describe('bash', () => {
    it('执行简单命令', async () => {
      const result = await handlers.bash({ command: 'echo hello_workspace' })
      assert.ok(result.includes('hello_workspace'))
    })

    it('高危命令被拒绝', async () => {
      const result = await handlers.bash({ command: 'sudo rm -rf /' })
      assert.ok(!result.includes('Error executing'))
    })
  })
})
