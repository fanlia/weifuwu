/**
 * vdom3 性能基准——量化当前实现（mount/更新/流式场景）
 *
 * 非断言测试（信息性）——输出耗时，定位热点：
 *  - mount 1000 节点（静态树）
 *  - 更新 100 项列表（改 1 项 / 增 10 项 / 删 10 项）
 *  - 流式 token（文本逐 token 更新 200 次）
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from './client/setup.ts'
import { h, mount, patch, stream } from '../ui-dom/vdom3/index.ts'

before(setupJsdom)

test('bench：事件流容量保护（环形 vs 线性 shift——长会话不退化）', async () => {
  const { createEventStream, ev } = await import('../ui-dom/vdom3/events.ts')
  const N = 50000
  const ring = createEventStream(2000)
  const t0 = performance.now()
  for (let i = 0; i < N; i++) ring.emit(ev('node', 'create', `n${i}`, { tag: 'div' }))
  const ringMs = performance.now() - t0
  assert.equal(ring.events().length, 2000, '容量保护（保留最近 2000）')
  const linear: any[] = []
  const t1 = performance.now()
  for (let i = 0; i < N; i++) { linear.push(ev('node', 'create', `n${i}`, { tag: 'div' })); if (linear.length > 2000) linear.shift() }
  const linearMs = performance.now() - t1
  // 信息性（文件约定：非断言——环境/并发干扰下不翻车）
  console.log(`[bench] ring: ${ringMs.toFixed(1)}ms vs linear-shift: ${linearMs.toFixed(1)}ms (${N} emits, cap 2000)`)
})

function time(fn: () => void, iterations = 1): number {
  const t0 = performance.now()
  for (let i = 0; i < iterations; i++) fn()
  return (performance.now() - t0) / iterations
}

test('bench：mount 1000 节点', () => {
  stream.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  // 1000 节点树：10 行 × 100 列 span
  const rows: any[] = []
  for (let r = 0; r < 10; r++) {
    const cells: any[] = []
    for (let c = 0; c < 100; c++) cells.push(h('span', { class: 'cell' }, `r${r}c${c}`))
    rows.push(h('div', { class: 'row' }, cells))
  }
  const tree = h('div', { id: 'grid' }, rows)
  const ms = time(() => { root.innerHTML = ''; mount(tree, root) })
  console.log(`[bench] mount 1000 节点: ${ms.toFixed(2)}ms（${Math.round(1000 / ms)} 节点/ms）`)
  assert.ok(root.querySelectorAll('span').length >= 1000, '1000 节点渲染')
  document.body.removeChild(root)
})

test('bench：列表更新（改 1 项 / 增 10 项 / 删 10 项）', () => {
  stream.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  const mk = (items: Array<{ id: string; v: number }>) =>
    h('ul', {}, items.map((it) => h('li', { key: it.id, 'data-id': it.id }, `v${it.v}`)))
  let items = Array.from({ length: 100 }, (_, i) => ({ id: `i${i}`, v: 0 }))
  const tree = mk(items)
  mount(tree, root)

  // 改 1 项（v 变化——仅该项文本更新）
  const t1 = time(() => {
    const next = items.map((it, i) => (i === 50 ? { ...it, v: it.v + 1 } : it))
    patch(tree, mk(next), root)
    items = next
  })
  console.log(`[bench] 更新 100 项列表（改 1 项）: ${t1.toFixed(3)}ms`)

  // 增 10 项
  const t2 = time(() => {
    const next = [...items, ...Array.from({ length: 10 }, (_, i) => ({ id: `n${i}`, v: 0 }))]
    patch(tree, mk(next), root)
    items = next
  })
  console.log(`[bench] 更新 100 项列表（增 10 项）: ${t2.toFixed(3)}ms`)

  // 删 10 项
  const t3 = time(() => {
    const next = items.slice(0, items.length - 10)
    patch(tree, mk(next), root)
    items = next
  })
  console.log(`[bench] 更新 100 项列表（删 10 项）: ${t3.toFixed(3)}ms`)

  assert.ok(root.querySelectorAll('li').length >= 100, '列表渲染')
  document.body.removeChild(root)
})

test('bench：流式 token（文本逐 token 更新 200 次）', () => {
  stream.reset()
  const root = document.createElement('div')
  document.body.appendChild(root)
  let text = ''
  const tree = h('div', { id: 'stream' }, [text])
  mount(tree, root)

  const ms = time(() => {
    for (let i = 0; i < 200; i++) {
      text += '字'
      const next = h('div', { id: 'stream' }, [text])
      patch(tree, next, root)
    }
  })
  console.log(`[bench] 流式 token（200 次文本更新）: ${ms.toFixed(1)}ms（${(200 / ms).toFixed(0)} 更新/ms）`)
  assert.equal(root.querySelectorAll('[id="stream"]')[0]?.textContent?.length, 200, '流式文本累积')
  document.body.removeChild(root)
})
