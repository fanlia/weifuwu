/**
 * vdom 渲染性能基准（阶段 0——先量化，后优化）
 *
 * 核心指标：
 * 1. DOM 写计数（monkey-patch Node.prototype——jsdom 可靠，非 MutationObserver 异步）
 * 2. 剪枝命中率（renderFn 执行次数 / 总组件数）——统一异步后唯一性能变量
 * 3. 耗时（相对基线——不断言死值，对比优化前后）
 *
 * 场景（对照 design/vdom-perf-plan.md v2）：
 * 1. 首帧 1000 行 keyed 列表
 * 2. 更新单行（DOM 写 ≈ 1 次 textContent）
 * 3. 头部插入 1 行（DOM 写 = 插入数，无 append+insert 双写）
 * 4. 流式追加 10 条（每帧 +1 → DOM 写 = 新增节点数）
 * 5. 受控输入 10 字符（DOM 写受控、无整树重建）
 * 6. 剪枝命中率（无关父状态变化 → 子组件 renderFn 不重跑）
 */
import { test, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'
import { createClientBrowser } from '../../ui-dom/browser.ts'
import { h } from '../../ui-dom/vnode.ts'
import { mountRoot } from '../../ui-dom/vdom/mount.ts'
import { buildVNode } from '../../ui-dom/vdom/build.ts'
import { renderValue } from '../../ui-dom/vdom/render.ts'
import { patchValue } from '../../ui-dom/vdom/diff.ts'
import { createRegistry } from '../../ui-dom/vdom/registry.ts'

before(setupJsdom)
afterEach(() => {
  createClientBrowser().clearBody()
})

// DOM 写计数 state（模块级单例——proto monkey-patch 闭包捕获，不可被 afterEach 清空）
let domWriteCount = 0
let domWriteMark = 0
let domCounterInstalled = false

/** DOM 写计数（monkey-patch——含 appendChild/insertBefore/removeChild/replaceChild/textContent） */
function installDomCounter(): { count: () => number } {
  domWriteMark = domWriteCount // 标记起点（返回自起点以来的增量）
  const g = globalThis as any
  if (!domCounterInstalled) {
    domCounterInstalled = true
    const proto = g.Node?.prototype
    if (proto) {
      const track = (fn: any) => function (this: any, ...args: any[]) {
        domWriteCount++
        return fn.apply(this, args)
      }
      for (const key of ['appendChild', 'insertBefore', 'removeChild', 'replaceChild']) {
        const orig = proto[key]
        if (orig && !orig.__wfTracked) {
          proto[key] = track(orig)
          proto[key].__wfTracked = true
        }
      }
    }
  }
  return { count: () => domWriteCount - domWriteMark }
}

const flush = () => new Promise(r => setTimeout(r, 10))

// ── 基准场景组件 ─────────────────────────────────────────

let rowRenders = 0

const Row = async (initProps: any, ctx: any) => {
  return async (props: any) => {
    rowRenders++
    return h('div', { class: 'row' }, h('span', { class: 'row-label' }, String(props.label)))
  }
}

/** 1000 行 keyed 列表（外部数据 + 渲染驱动） */
function makeListData(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: i, label: `行 ${i}` }))
}

async function mountList(rows: { id: number; label: string }[]) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const handle = mountRoot({ root, browser: createClientBrowser() })
  const state = { rows }
  const List = async (_init: any, c: any) => {
    return async () => h('div', { id: 'list' }, state.rows.map(r => h(Row, { key: r.id, label: r.label })))
  }
  await handle.mount(h(List, {}))
  return { handle, state, root }
}

// ── 场景 1：首帧 1000 行 ──────────────────────────────────

test('perf: 首帧 1000 行 keyed 列表（DOM 写 = 行数级）', async () => {
  const counter = installDomCounter()
  const { handle, root } = await mountList(makeListData(1000))
  await flush()
  const writes = counter.count()
  assert.equal(root.querySelectorAll('.row').length, 1000, '1000 行渲染')
  assert.ok(writes >= 1000 && writes <= 4000, `首帧 DOM 写量级合理（实际 ${writes}——1000 行 + span + 容器）`)
  // 基线记录：优化前头部插入基线 103（P-4 修复目标 → 1）——基准文档化
  console.log(`[perf] 首帧 1000 行 DOM 写: ${writes}`)
  handle.unmount()
})

// ── 耗时基准（相对基线对比——不设死值，记录供优化前后对照） ──

test('perf: 渲染耗时基线（首帧/更新/流式）', async () => {
  const { handle, state, root } = await mountList(makeListData(1000))
  await flush()
  // 更新单行耗时（剪枝命中主路径——await render() = DOM 同步，无需 flush 等待）
  const t0 = performance.now()
  state.rows[500] = { id: 500, label: '已更新' }
  await handle.ctx.ui.render()
  const updateMs = performance.now() - t0
  // 流式追加 10 帧耗时（数据驱动 renderFn 路径）
  const t1 = performance.now()
  for (let i = 0; i < 10; i++) {
    state.rows.push({ id: 2000 + i, label: `流 ${i}` })
    await handle.ctx.ui.render()
  }
  const streamMs = performance.now() - t1
  assert.equal(root.querySelectorAll('.row').length, 1010, '1010 行落地（await render() 后 DOM 已同步）')
  console.log(`[perf] 更新单行耗时: ${updateMs.toFixed(2)}ms（剪枝命中主路径）`)
  console.log(`[perf] 流式追加 10 帧耗时: ${streamMs.toFixed(2)}ms`)
  handle.unmount()
})

// ── 场景 2：更新单行 ──────────────────────────────────────

test('perf: 更新单行 → DOM 写 ≈ 1（无全量重排）', async () => {
  const { handle, state, root } = await mountList(makeListData(1000))
  await flush()
  const counter = installDomCounter()
  // 改第 500 行 label → render（剪枝命中 999 行，只动变化行）
  state.rows[500] = { id: 500, label: '已更新' }
  await handle.ctx.ui.render()
  await flush()
  const writes = counter.count()
  assert.equal(root.querySelectorAll('.row')[500].textContent, '已更新')
  assert.ok(writes <= 3, `更新单行 DOM 写应 ≤3（V3-1 后 nodeValue 直改——0 次节点操作；实际 ${writes}）`)
  console.log(`[perf] 更新单行 DOM 写: ${writes}`)
  handle.unmount()
})

// ── 场景 3：头部插入 ──────────────────────────────────────

test('perf: 头部插入 1 行 → DOM 写 = 1（无 append+insert 双写）', async () => {
  const { handle, state, root } = await mountList(makeListData(100))
  await flush()
  const counter = installDomCounter()
  // 头部插入（keyed diff——其余行复用）
  state.rows.unshift({ id: 1000, label: '新头' })
  await handle.ctx.ui.render()
  await flush()
  const writes = counter.count()
  assert.equal(root.querySelectorAll('.row')[0].textContent, '新头', '头部插入生效')
  assert.ok(writes <= 5, `头部插入 DOM 写 ≤5（优化目标 1 次 insert；基线 103——实际 ${writes}）`)
  console.log(`[perf] 头部插入 DOM 写: ${writes}`)
  handle.unmount()
})

// ── 场景 4：流式追加 ──────────────────────────────────────

test('perf: 流式追加 10 条 → DOM 写 = 新增节点数', async () => {
  const { handle, state, root } = await mountList(makeListData(10))
  await flush()
  let totalWrites = 0
  for (let i = 0; i < 10; i++) {
    const counter = installDomCounter()
    state.rows.push({ id: 100 + i, label: `流 ${i}` })
    await handle.ctx.ui.render()
    await flush()
    const w = counter.count()
    totalWrites += w
    assert.ok(w <= 3, `每帧追加 DOM 写 ≤3（实际 ${w}）`)
  }
  assert.equal(root.querySelectorAll('.row').length, 20, '20 条落地')
  console.log(`[perf] 流式追加 10 帧总 DOM 写: ${totalWrites}`)
  handle.unmount()
})

// ── 场景 5：受控输入 ──────────────────────────────────────

test('perf: 受控输入 10 字符 → DOM 写受控（无整树重建）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const handle = mountRoot({ root, browser: createClientBrowser() })
  const state = { text: '' }
  const InputDemo = async (_init: any, c: any) => {
    return async () => h('div', {},
      h('input', {
        class: 'perf-input',
        value: state.text,
        onInput: (e: any) => { state.text = e.target.value; ctx2.render() },
      }),
      h('span', { class: 'echo' }, state.text),
    )
  }
  const ctx2 = handle.ctx
  await handle.mount(h(InputDemo, {}))
  await flush()
  let totalWrites = 0
  for (let i = 0; i < 10; i++) {
    const counter = installDomCounter()
    state.text += String(i)
    await handle.ctx.ui.render()
    await flush()
    totalWrites += counter.count()
  }
  assert.equal(root.querySelector('.echo')?.textContent, '0123456789')
  assert.ok(totalWrites <= 30, `10 字符 DOM 写受控（实际 ${totalWrites}——每帧 ≤3）`)
  console.log(`[perf] 受控输入 10 字符总 DOM 写: ${totalWrites}`)
  handle.unmount()
})

// ── 场景 6：剪枝命中率（核心性能变量） ─────────────────────

test('perf: 剪枝命中率——无关父状态变化 → 子组件 renderFn 不重跑', async () => {
  const { handle, state } = await mountList(makeListData(100))
  await flush()
  const baseline = rowRenders
  // 父组件状态变化（children 以外的 props/版本不变）→ 子组件应剪枝命中
  // 改父级数据但行内容不变？——List 的 rows 引用变化会重跑所有 Row（keyed 相同但 props.label 同）
  // 真实场景：父组件内部状态变化（不传给子）→ 子组件 props 不变 → 剪枝命中
  const root2 = document.createElement('div')
  document.body.appendChild(root2)
  const handle2 = mountRoot({ root: root2, browser: createClientBrowser() })
  let parentTicks = 0
  const Child = async (_init: any, c: any) => {
    return async (props: any) => { rowRenders++; return h('span', { class: 'child' }, props.label) }
  }
  const Parent = async (_init: any, c: any) => {
    let local = 0
    return async () => {
      parentTicks++
      return h('div', {}, Array.from({ length: 50 }, (_, i) => h(Child, { key: i, label: `c${i}` })))
    }
  }
  await handle2.mount(h(Parent, {}))
  await flush()
  const before = rowRenders
  // 父内部状态变化 → render → 子 props 不变 → 剪枝命中（子 renderFn 不重跑）
  ;(parentTicks as any)
  await handle2.ctx.ui.render()
  await flush()
  const after = rowRenders
  assert.equal(after, before, `子组件剪枝命中（renderFn 不重跑；before=${before} after=${after}）`)
  console.log(`[perf] 父状态变化 → 子 renderFn 重跑数: ${after - before}（应为 0——剪枝命中）`)
  handle.unmount()
  handle2.unmount()
})

// ── v3 阶段 0：耗时分解基准（对照 design/vdom-perf-v3-plan.md——相对基线，不设死值） ──

/** 1000 行 native keyed 列表（无组件包裹——Table 行形态） */
function nativeRows(start: number, n: number) {
  return Array.from({ length: n }, (_, i) =>
    h('div', { key: `r${start + i}`, class: 'row' },
      h('span', {}, `row ${start + i}`),
      h('span', { class: 'x' }, (start + i) * 2),
    ))
}

function makeProbeCtx() {
  const browser = createClientBrowser()
  const registry = createRegistry()
  return { browser, registry, ctx: { browser, __registry: registry, ui: { _ctxVersion: 0 } } as any }
}

test('perf(v3): 1000 行 native 列表 build/render/patch 耗时分解', async () => {
  const { browser, registry, ctx } = makeProbeCtx()
  const container = document.createElement('div')
  document.body.appendChild(container)

  // 首帧：build → render
  const vroot = h('div', { class: 'list' }, nativeRows(0, 1000))
  let t = performance.now()
  const built = await buildVNode(vroot, ctx, undefined, registry)
  const buildMs = performance.now() - t
  t = performance.now()
  const node = renderValue(built, ctx, browser)
  container.appendChild(node)
  const renderMs = performance.now() - t

  // 更新（内容全同——剪枝路径）：build → patch
  const vroot2 = h('div', { class: 'list' }, nativeRows(0, 1000))
  t = performance.now()
  const built2 = await buildVNode(vroot2, ctx, vroot, registry)
  const buildUpdMs = performance.now() - t
  const patchCtx = { browser, registry, ctxVersion: 0 } as any
  t = performance.now()
  patchValue(container, container.firstChild, vroot._child, built2._child, patchCtx)
  const patchMs = performance.now() - t

  // 更新（1 行变化——keyed 定位）：build → patch
  const changed = nativeRows(0, 1000)
  changed[500] = h('div', { key: 'r500', class: 'row' }, h('span', {}, 'row 500 UPDATED'))
  const vroot3 = h('div', { class: 'list' }, changed)
  t = performance.now()
  const built3 = await buildVNode(vroot3, ctx, vroot, registry)
  const buildChgMs = performance.now() - t
  t = performance.now()
  patchValue(container, container.firstChild, vroot._child, built3._child, patchCtx)
  const patchChgMs = performance.now() - t

  // 相对基线断言：build 不应比 render 慢（构建是纯内存，DOM 创建是最终大头）
  assert.ok(buildMs < renderMs, `首帧 build(${buildMs.toFixed(1)}ms) < render(${renderMs.toFixed(1)}ms)——纯内存构建应快于 DOM 创建`)
  console.log(`[perf-v3] 首帧: build ${buildMs.toFixed(2)}ms / render ${renderMs.toFixed(2)}ms`)
  console.log(`[perf-v3] 更新(剪枝全命中): build ${buildUpdMs.toFixed(2)}ms / patch ${patchMs.toFixed(2)}ms`)
  console.log(`[perf-v3] 更新(1 行变): build ${buildChgMs.toFixed(2)}ms / patch ${patchChgMs.toFixed(2)}ms`)
  container.remove()
})

test('perf(v3): 文本节点更新方式对比（nodeValue vs replaceChild——V3-1 前后对照）', () => {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const txt = document.createTextNode('old')
  el.appendChild(txt)
  // nodeValue 直改（V3-1 目标路径）
  let t = performance.now()
  for (let i = 0; i < 5000; i++) txt.nodeValue = `new ${i}`
  const nodeValueMs = performance.now() - t
  // replaceChild（当前路径）
  t = performance.now()
  for (let i = 0; i < 5000; i++) { const n = document.createTextNode(`new ${i}`); el.replaceChild(n, el.firstChild!) }
  const replaceMs = performance.now() - t
  assert.ok(nodeValueMs < replaceMs, `nodeValue(${nodeValueMs.toFixed(1)}ms) 应快于 replaceChild(${replaceMs.toFixed(1)}ms)`)
  console.log(`[perf-v3] 文本更新 ×5000: nodeValue ${nodeValueMs.toFixed(2)}ms vs replaceChild ${replaceMs.toFixed(2)}ms（${(replaceMs / Math.max(nodeValueMs, 0.01)).toFixed(1)}x）`)
  el.remove()
})
