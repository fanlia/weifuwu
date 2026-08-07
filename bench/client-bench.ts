/**
 * weifuwu/client 渲染基准 — 性能改动回归护栏
 *
 * 用法：node bench/client-bench.ts
 *
 * 场景：大列表渲染/patch、keyed 重排、组件树深度、props 高频更新、三态 skip 命中
 * 输出：每场景中位数 ms + DOM 操作计数（对比基准见 docs/client-optimize.md 验收记录）
 */

import { JSDOM } from 'jsdom'

// ── 最小 jsdom 环境（沿用 src/test/client/setup.ts 的做法） ──
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
})
const win = dom.window as any
const g = globalThis as any
for (const key of Object.getOwnPropertyNames(win)) {
  if (['Object', 'Array', 'Function', 'String', 'Number', 'Boolean', 'Symbol', 'Map', 'Set', 'RegExp', 'Promise', 'Error', 'Date', 'Math', 'JSON', 'BigInt', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect', 'undefined', 'NaN', 'Infinity', 'parseInt', 'parseFloat', 'isNaN', 'isFinite'].includes(key)) continue
  if (typeof g[key] === 'undefined') {
    try { g[key] = win[key] } catch { }
  }
}
const mockMatchMedia = (query: string) => ({
  matches: false, media: query, onchange: null,
  addListener: () => {}, removeListener: () => {},
  addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
})
if (!g.matchMedia) g.matchMedia = mockMatchMedia

// ── 被测渲染器 ──
import { h } from '../src/client/vnode.ts'
import { render, patchValue, mountVNode } from '../src/client/render.ts'
import { createApp } from '../src/client/app.ts'
import type { WfuiContext } from '../src/client/types.ts'

const root = document.getElementById('root')!

// ── 计时工具 ──
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
async function bench(name: string, iters: number, fn: () => void): Promise<number> {
  for (let i = 0; i < 200; i++) fn() // warmup
  const t: number[] = []
  for (let i = 0; i < iters; i++) {
    root.innerHTML = ''
    const t0 = performance.now()
    fn()
    t.push(performance.now() - t0)
  }
  const med = median(t)
  console.log(`  ${name.padEnd(34)} ${med.toFixed(3)} ms/op`)
  return med
}

// ── 场景 1: 大列表初始渲染 ──
function makeRows(n: number, base = 0) {
  return Array.from({ length: n }, (_, i) =>
    h('tr', { key: String(i + base) },
      h('td', { class: 'c' }, `row ${i + base}`),
      h('td', {}, i + base),
      h('td', {}, `group-${(i + base) % 10}`),
    ),
  )
}
const N = 1000
const table = (rows: any[]) => h('table', {}, h('tbody', {}, rows))
const emptyCtx = { ui: { _selfId: '_bench', _selfVNode: null } } as any

await bench('大列表初始渲染 (1000 行)', 50, () => {
  mountVNode(root, table(makeRows(N)), emptyCtx)
})

// ── 场景 2: 大列表全量更新（props 变化） ──
let oldV = table(makeRows(N))
mountVNode(root, oldV, emptyCtx)
await bench('大列表全量更新 (1000 行 class 变)', 30, () => {
  const newRows = Array.from({ length: N }, (_, i) =>
    h('tr', { key: String(i) },
      h('td', { class: 'c' }, `row ${i}`),
      h('td', { class: 'n' }, i),
      h('td', {}, `group-${i % 10}`),
    ),
  )
  const newV = table(newRows)
  patchValue(root, root.firstChild, oldV, newV, emptyCtx)
  oldV = newV
})

// ── 场景 3: keyed 重排（reverse，DOM 移动） ──
oldV = table(makeRows(N))
mountVNode(root, oldV, emptyCtx)
await bench('keyed 重排 (1000 行 reverse)', 30, () => {
  const newRows = makeRows(N).reverse()
  const newV = table(newRows)
  patchValue(root, root.firstChild, oldV, newV, emptyCtx)
  oldV = newV
})

// ── 场景 4: keyed 增删（头插 10 + 删尾 10） ──
oldV = table(makeRows(N))
mountVNode(root, oldV, emptyCtx)
await bench('keyed 头插 10 + 删尾 10', 30, () => {
  const rows = [...makeRows(10, 10000), ...makeRows(N, 0).slice(0, N - 10)]
  const newV = table(rows)
  patchValue(root, root.firstChild, oldV, newV, emptyCtx)
  oldV = newV
})

// ── 场景 5: 组件树深度（20 层嵌套 dirty 重渲染） ──
const Deep: any = (depth: number): any =>
  (init: any, ctx: WfuiContext) => {
    const $ = ctx.ui.$()
    $.v = 0
    return (props: any) =>
      depth === 0
        ? h('div', {}, $.v)
        : h('div', {}, h(Deep(depth - 1), {}))
  }
const deepCtx = { ui: { _selfId: '_bench', _selfVNode: null, $: () => ({ v: 0 }) } } as any
let deepApp: any
{
  const app = createApp()
  deepApp = app
  app.mount('#root', Deep(20), {} as any)
}
await bench('20 层组件树 render() 重渲染', 500, () => {
  (deepApp as any).ctx.ui.render()
})

// ── 场景 6: props 高频更新（单组件 1000 次 render） ──
const Counter: any = (_init: any, ctx: WfuiContext) => {
  let count = 0
  return () => h('div', {}, count)
}
{
  const app = createApp()
  ;(app as any).mount('#root', Counter, {} as any)
  await bench('单组件 1000 次 render()', 100, () => {
    const ui = (app as any).ctx.ui
    for (let i = 0; i < 1000; i++) ui.render()
  })
}

console.log('\n完成。对比基线见 docs/client-optimize.md')
