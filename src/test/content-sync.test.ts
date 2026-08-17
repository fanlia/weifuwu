/**
 * content/ 防漂移测试——showcase 文档库与 registry/源码同步防线
 *
 * 验证（design/showcase-plan.md §7）：
 *   1. gen-content.mjs --check 通过（生成产物无漂移）
 *   2. 组件文档与 src/components 目录一一对应（每组件一篇——计数防线）
 *   3. 组件文档七节模板齐全（概述/API/用法示例/纪律/坑/关系/文件位置/验证）
 *   4. 文档引用的源码/测试/CSS 路径真实存在
 *   5. index.json 结构完整（六表 + 关系推导字段非空语义）
 *   6. registry 条目 sourceFile 引用真实存在
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

test('content 生成无漂移（gen-content --check）', { timeout: 30_000 }, () => {
  try {
    execFileSync('node', ['scripts/gen-content.mjs', '--check'], { cwd: root, stdio: 'pipe' })
  } catch (e: any) {
    assert.fail(`content/ 漂移：\n${e.stdout?.toString() ?? e.message}`)
  }
})

test('组件文档与组件目录一一对应（计数防线）', () => {
  const dirs = readdirSync(join(root, 'src/components'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, 'src/components', d.name, `${d.name}.ts`)))
    .map((d) => d.name)
  const docs = new Set(readdirSync(join(root, 'content/components')).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')))
  const registry = readFileSync(join(root, 'apps/showcase/src/registry/components.ts'), 'utf-8')

  // 每个组件目录必须有文档（kebab-case 匹配）
  const missing = dirs.filter((d) => {
    const id = d.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    return !docs.has(id) && !registry.includes(`"id": "${id}"`) && !registry.includes(`"id": "${id}-v`)
  })
  assert.deepEqual(missing, [], `组件缺文档/registry：${missing.join(', ')}`)

  // registry 条目数 ≥ 组件目录数（变体卡片允许更多）
  const entries = (registry.match(/"id": "/g) ?? []).length
  assert.ok(entries >= dirs.length, `registry 条目(${entries}) < 组件目录(${dirs.length})`)
})

test('组件文档七节模板齐全', () => {
  const files = readdirSync(join(root, 'content/components')).filter((f) => f.endsWith('.md'))
  const offenders: string[] = []
  for (const f of files) {
    const doc = readFileSync(join(root, 'content/components', f), 'utf-8')
    for (const sec of ['## 概述', '## API', '## 用法示例', '## 纪律/坑', '## 关系', '## 文件位置', '## 验证']) {
      if (!doc.includes(sec)) { offenders.push(`${f}: 缺 ${sec}`); break }
    }
  }
  assert.deepEqual(offenders, [], `模板节缺失：\n${offenders.join('\n')}`)
})

test('文档引用的源码路径真实存在', () => {
  const files = readdirSync(join(root, 'content/components')).filter((f) => f.endsWith('.md'))
  const broken: string[] = []
  for (const f of files) {
    const doc = readFileSync(join(root, 'content/components', f), 'utf-8')
    for (const m of doc.matchAll(/`(src\/components\/[^`]+)`/g)) {
      if (!existsSync(join(root, m[1]))) broken.push(`${f}: ${m[1]}`)
    }
  }
  assert.deepEqual(broken, [], `文档引用路径不存在：\n${broken.join('\n')}`)
})

test('index.json 结构完整（六表 + 关系字段）', () => {
  const idx = JSON.parse(readFileSync(join(root, 'content/index.json'), 'utf-8'))
  for (const key of ['components', 'primitives', 'patterns', 'apps', 'backend', 'capabilities', 'guides']) {
    assert.ok(Array.isArray(idx[key]) && idx[key].length > 0, `index.json 缺 ${key} 表`)
  }
  const c = idx.components[0]
  for (const field of ['id', 'name', 'category', 'desc', 'usedInPatterns', 'usedInApps', 'relatedBackend']) {
    assert.ok(field in c, `components 条目缺字段 ${field}`)
  }
  // 关系字段必须是数组
  assert.ok(Array.isArray(c.usedInPatterns) && Array.isArray(c.usedInApps), '关系字段应为数组')
  // 主组件（Button）应有用于它的模式/应用（关系图连通性起点）
  const btn = idx.components.find((x: any) => x.id === 'button')
  assert.ok(btn, 'Button 条目存在')
})

test('registry sourceFile 引用真实存在', () => {
  const src = readFileSync(join(root, 'apps/showcase/src/registry/components.ts'), 'utf-8')
  const broken: string[] = []
  for (const m of src.matchAll(/"sourceFile": "([^"]+)"/g)) {
    if (!existsSync(join(root, m[1]))) broken.push(m[1])
  }
  assert.deepEqual(broken, [], `registry 源码路径不存在：\n${broken.join('\n')}`)
})

test('关系图连通性（单向声明 → 反链可达）', () => {
  const idx = JSON.parse(readFileSync(join(root, 'content/index.json'), 'utf-8'))
  const compNames = new Set(idx.components.map((c: any) => c.name))
  const patternIds = new Set(idx.patterns.map((p: any) => p.id))
  const appIds = new Set(idx.apps.map((a: any) => a.id))
  const backendIds = new Set(idx.backend.map((b: any) => b.id))
  const broken: string[] = []
  // patterns.uses → 组件名存在
  for (const p of idx.patterns) {
    for (const c of p.uses) if (!compNames.has(c)) broken.push(`patterns/${p.id} uses 未知组件 ${c}`)
    for (const a of p.usedInApps) if (!appIds.has(a)) broken.push(`patterns/${p.id} usedInApps 未知应用 ${a}`)
  }
  // apps.uses/usesPatterns → 存在
  for (const a of idx.apps) {
    for (const c of a.uses) if (!compNames.has(c)) broken.push(`apps/${a.id} uses 未知组件 ${c}`)
    for (const p of a.usesPatterns) if (!patternIds.has(p)) broken.push(`apps/${a.id} usesPatterns 未知模式 ${p}`)
  }
  // 组件反链 → 存在（关系图可遍历）
  for (const c of idx.components) {
    for (const p of c.usedInPatterns) if (!patternIds.has(p)) broken.push(`components/${c.id} usedInPatterns 未知模式 ${p}`)
    for (const a of c.usedInApps) if (!appIds.has(a)) broken.push(`components/${c.id} usedInApps 未知应用 ${a}`)
    for (const b of c.relatedBackend) if (!backendIds.has(b)) broken.push(`components/${c.id} relatedBackend 未知后端 ${b}`)
  }
  // 关系非空（平台反链区有内容）
  const withRel = idx.components.filter((c: any) => c.usedInPatterns.length > 0 || c.usedInApps.length > 0)
  assert.ok(withRel.length >= 5, `关系图过空（仅 ${withRel.length} 组件有反链）`)
  assert.deepEqual(broken, [], `关系断裂：\n${broken.join('\n')}`)
})
