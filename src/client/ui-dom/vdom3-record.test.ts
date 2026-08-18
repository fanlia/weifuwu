/**
 * vdom3 record — 录制转测试闭环验证
 *
 * 渲染 → 事件流（录制）→ recordToTest 生成测试代码 → 执行生成代码（回放 + 断言）
 * ——事故转测试：录制即回归，无需手动复现。
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from './setup.ts'
import { h, mount, stream, recordToTest, summarizeEvents } from './vdom3/index.ts'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

before(setupJsdom)

test('record：渲染 → 事件流 → 生成测试 → 执行通过（事故转测试闭环）', async () => {
  stream.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  // 渲染（录制事件流）
  mount(h('div', { id: 'card', class: 'a' }, [
    h('h1', {}, '标题'),
    h('p', {}, ['内容', '段落']),
    h('ul', {}, ['x', 'y'].map((it, i) => h('li', { key: it + i }, it))),
  ]), root)
  const events = stream.events()
  assert.ok(events.length > 10, `录制事件流（${events.length} 条）`)
  const summary = summarizeEvents(events)
  assert.ok(summary.includes('node:create'), '摘要含节点创建')

  // 生成测试代码
  const code = recordToTest(events, 'recorded-card-render')
  assert.ok(code.includes('replay(events, root)'), '生成代码含回放')
  assert.ok(code.includes('node:create'), '生成代码含序列断言')

  // 写盘并执行（真实闭环——生成的测试可跑）
  const tmpFile = join(process.cwd(), 'src', 'client', 'ui-dom', 'recorded-tmp-v3.test.ts')
  const patched = code
    .replace("from './client/setup.ts'", "from './setup.ts'")
    .replace("from './vdom3/index.ts'", "from './vdom3/index.ts'")
    .replace("from '../ui-dom/vdom3/index.ts'", "from './vdom3/index.ts'")
    .replace("from '../ui-dom/vdom3/jsx.ts'", "from './vdom3/jsx.ts'")
  writeFileSync(tmpFile, patched)

  try {
    const env = { ...process.env }
    delete env.NODE_TEST_CONTEXT // 递归检测（测试内再跑 node --test 被拒）
    delete env.NODE_OPTIONS
    const r = spawnSync('node', ['--env-file=.env', '--test', '--test-timeout=8000', tmpFile], { encoding: 'utf8', timeout: 20000, maxBuffer: 10 * 1024 * 1024, env })
    const out = String(r.stdout ?? '') + String(r.stderr ?? '')
    assert.ok(out.includes('pass 1'), '生成的测试执行通过（回放 + 断言）：' + out.slice(-200))
  } finally {
    try { spawnSync('rm', [tmpFile]) } catch { /* ignore */ }
  }
  document.body.removeChild(root)
})
