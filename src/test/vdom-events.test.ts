/**
 * vdom/events — 统一状态机事件流测试（过程级断言——状态转换序列，而非最终 DOM）
 *
 * 覆盖：
 * - lifecycle 事件序列（fresh→building→built→disposed——节点生命周期可观测）
 * - route 事件序列（idle→navigating→settled）
 * - x2y / keys 转换事件（diff 类型转换 + 数组策略选择）
 * - **append 串位事故断言**：pos INSERT 事件的插入点不得指向本次 diff 已插入的节点
 *   （components-demo 搜索恢复 1→5 实测——修复前 i=2 插到刚插入的 i=1 节点前）
 */

import { test, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { mountCommand } from '../ui-dom/context.ts'
import { patchValue } from '../ui-dom/vdom2/patch.ts'
import { buildVNode } from '../ui-dom/vdom2/build.ts'
import { renderValue } from '../ui-dom/vdom2/render.ts'
import { h } from '../ui-dom/vnode.ts'
import { createRouteController } from '../ui-dom/vdom2/route.ts'
import { createRegistry } from '../ui-dom/vdom2/registry.ts'
import { makeEventCollector, __resetVdomEvents, type VdomEvent } from '../ui-dom/vdom2/events.ts'

before(setupJsdom)
const browser = createClientBrowser()

function fakeCtx() {
  return { ui: { $: {}, dirty: () => {}, render: () => {}, ready: true }, browser }
}

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 30))
}

test('lifecycle 事件：组件挂载 fresh→building→built 序列可观测', async () => {
  __resetVdomEvents()
  const collector = makeEventCollector()
  try {
    const ctx = fakeCtx()
    const container = browser.createElement('div')
    const Comp = async (_i: any) => async () => h('div', { id: 'x' }, 'x')
    await mountCommand(container, h(Comp, {}), ctx)
    await flush()

    const lc = collector.events.filter((e) => e.machine === 'lifecycle')
    const seq = lc.map((e) => `${e.from}--${e.event}-->${e.to}`)
    assert.ok(seq.includes('fresh--BUILD_START-->building'), `应有 fresh→building，实际: ${seq.join(', ')}`)
    assert.ok(seq.includes('building--BUILD_DONE-->built'), `应有 building→built，实际: ${seq.join(', ')}`)
    // 结构化字段：组件名 + nodeId 关联（可按实例追溯）
    const ev = lc.find((e) => e.event === 'BUILD_START')!
    assert.equal(ev.component, 'Comp')
    assert.ok(ev.nodeId, 'BUILD_START 事件应携带 nodeId')
  } finally {
    collector.unsubscribe()
  }
})

test('lifecycle 事件：dispose 后 disposed 状态可观测（diff 移除路径）', async () => {
  __resetVdomEvents()
  const collector = makeEventCollector()
  try {
    const reg = createRegistry()
    const ctx = fakeCtx()
    ctx.__registry = reg
    const container = browser.createElement('div')
    const Comp = async (_i: any) => async () => h('div', { id: 'x' }, 'x')
    const vnode = h(Comp, {})
    await mountCommand(container, vnode, ctx)
    // 移除（patch 到 null）→ dispose
    patchValue(container, container.firstChild, vnode, null, { browser: ctx.browser, registry: reg })
    await flush()

    const disposed = collector.events.filter((e) => e.event === 'DISPOSE' && e.to === 'disposed')
    assert.ok(disposed.length >= 1, `应观测到 DISPOSE→disposed，实际: ${collector.events.map((e) => e.event).join(',')}`)
  } finally {
    collector.unsubscribe()
  }
})

test('route 事件：idle→navigating→settled 序列可观测', async () => {
  __resetVdomEvents()
  const collector = makeEventCollector()
  try {
    const ctrl = createRouteController()
    ctrl.navigateStart('/a')
    ctrl.navigateDone('/a')
    const route = collector.events.filter((e) => e.machine === 'route')
    const seq = route.map((e) => `${e.from}--${e.event}-->${e.to}`)
    assert.deepEqual(seq, ['idle--NAVIGATE_START-->navigating', 'navigating--NAVIGATE_DONE-->settled'])
    // payload 携带 path
    assert.equal((route[0].payload as { path?: string }).path, '/a')
    // 非法转换保留状态 + 事件（settled 无 NAVIGATE_ERROR——保留 settled 并发射非法事件）
    ctrl.navigateError('/b', new Error('boom'))
    assert.equal(ctrl.state, 'settled', '非法转换保留原状态')
    const routeAll = collector.events.filter((e) => e.machine === 'route')
    const illegal = routeAll.filter((e) => e.to === '?')
    assert.ok(illegal.length >= 1, '非法转换应发射 to=? 事件')
  } finally {
    collector.unsubscribe()
  }
})

test('x2y / keys 事件：数组 diff 的转换与策略选择可观测', async () => {
  __resetVdomEvents()
  const collector = makeEventCollector()
  try {
    const ctx = fakeCtx()
    const container = browser.createElement('div')
    const prev = h('div', {}, h('div', { id: 'a' }, 'a'))
    await mountCommand(container, prev, ctx)
    const next = h('div', {}, h('div', { id: 'a2' }, 'a2'), h('div', { id: 'b' }, 'b'))
    patchValue(container, container.firstChild, prev, next, { browser: ctx.browser, registry: (ctx as any).__registry })

    const keys = collector.events.filter((e) => e.machine === 'keys')
    assert.ok(keys.some((e) => e.event === 'SELECT' && e.to === 'unkeyed'), '无 key 数组应选 unkeyed 策略')
    const x2ys = collector.events.filter((e) => e.machine === 'x2y')
    assert.ok(x2ys.length >= 2, `应有多次类型转换（native→native + hole→real），实际 ${x2ys.length}`)
  } finally {
    collector.unsubscribe()
  }
})

test('trace 包装：执行细节 TRACE 事件可观测（trace 开启时 collect 收 build/render 摘要）', async () => {
  __resetVdomEvents()
  const { configureVdomTrace } = await import('../ui-dom/vdom2/trace.ts')
  configureVdomTrace({ stages: new Set(['build', 'render']) })
  const collector = makeEventCollector()
  try {
    const ctx = fakeCtx()
    const container = browser.createElement('div')
    const Comp = async (_i: any) => async () => h('div', { id: 'x' }, 'x')
    await mountCommand(container, h(Comp, {}), ctx)
    await flush()

    const traceEvts = collector.events.filter((e) => e.event === 'TRACE')
    assert.ok(traceEvts.length >= 3, `应收集到 build/render 执行细节，实际 ${traceEvts.length}`)
    assert.ok(traceEvts.some((e) => e.machine === 'build' && String(e.payload).includes('native <div>')),
      `build 摘要事件缺失: ${traceEvts.map((e) => e.machine).join(',')}`)
    assert.ok(traceEvts.some((e) => e.machine === 'render' && String(e.payload).includes('native <div>')),
      `render 摘要事件缺失`)
  } finally {
    collector.unsubscribe()
    configureVdomTrace({ stages: new Set([]) }) // 关闭——不影响其他测试输出
  }
})

test('session 贯穿：一次渲染的事件共享同一 session（事件树关联）', async () => {
  __resetVdomEvents()
  const collector = makeEventCollector()
  try {
    const ctx = fakeCtx()
    const container = browser.createElement('div')
    const Comp = async (_i: any) => async () => h('div', { id: 'x' }, 'x')
    // mountCommand 直接 build（不经 renderOne）——用 createRenderer 触发带 session 的渲染
    const reg = createRegistry()
    const { createRenderer } = await import('../ui-dom/vdom2/mount.ts')
    const renderer = createRenderer({ registry: reg, ctx, rootEl: container })
    await renderer.render(['_wf_nonexistent']) // 空跑一次（验证 session 边界）
    // 直接驱动 renderOne 路径：造一个已挂载组件
    const vnode = { type: Comp, props: {}, _id: '_wf_s1', _render: async () => h('div', { id: 'x' }, 'x'), _parentNode: container } as any
    reg.idRegistry.set('_wf_s1', vnode)
    vnode._child = await buildVNode(await vnode._render(), ctx, null, reg)
    const node = renderValue(vnode._child, ctx, ctx.browser)!
    container.appendChild(node)
    vnode._refNode = node
    await renderer.render(['_wf_s1'])

    // 该次渲染的所有事件共享同一 session（非空且一致）
    const sessions = new Set(collector.events.filter((e) => e.event !== 'TRACE').map((e) => e.session).filter(Boolean))
    assert.equal(sessions.size, 1, `一次渲染应共享一个 session，实际 ${[...sessions].join(',')}`)
    assert.ok(sessions.size === 1 && [...sessions][0].startsWith('R'), 'session 格式 R{n}')
  } finally {
    collector.unsubscribe()
  }
})

test('render 调度事件：PARENT 状态（MOUNTED/ROOT/SKIP_BUILDING）可观测', async () => {
  __resetVdomEvents()
  const collector = makeEventCollector()
  try {
    const ctx = fakeCtx()
    const container = browser.createElement('div')
    // 树内组件（_parentNode 有效）→ MOUNTED
    const { createRenderer } = await import('../ui-dom/vdom2/mount.ts')
    const reg = createRegistry()
    const renderer = createRenderer({ registry: reg, ctx, rootEl: container })
    const Inner = async (_i: any) => async () => h('div', { id: 'i' }, 'i')
    const innerV = { type: Inner, props: {}, _id: '_wf_inner', _render: async () => h('div', { id: 'i' }, 'i'), _parentNode: container } as any
    reg.idRegistry.set('_wf_inner', innerV)
    innerV._child = await buildVNode(await innerV._render(), ctx, null, reg)
    const n1 = renderValue(innerV._child, ctx, ctx.browser)!
    container.appendChild(n1)
    innerV._refNode = n1
    await renderer.render(['_wf_inner'])

    const parentEvts = collector.events.filter((e) => e.machine === 'render' && e.event === 'PARENT')
    const mounted = parentEvts.find((e) => e.to === 'MOUNTED')
    assert.ok(mounted, `树内组件应 PARENT=MOUNTED，实际 ${parentEvts.map((e) => e.to).join(',')}`)
    assert.equal(mounted?.component, 'Inner')
    assert.equal(mounted?.nodeId, '_wf_inner')
  } finally {
    collector.unsubscribe()
  }
})

test('append 串位事故断言：pos INSERT 插入点不得指向本次 diff 已插入的节点', async () => {
  __resetVdomEvents()
  const collector = makeEventCollector()
  try {
    const ctx = fakeCtx()
    const container = browser.createElement('div')
    // 旧 1 项 → 新 5 项（components-demo 搜索恢复场景：fix 前 i=2 插到刚插入的 i=1 前）
    const prev = h('div', {}, h('div', { id: 'a' }, 'a'))
    await mountCommand(container, prev, ctx)
    const next = h('div', {},
      h('div', { id: 'a2' }, 'a2'),
      h('div', { id: 'b' }, 'b'),
      h('div', { id: 'c' }, 'c'),
      h('div', { id: 'd' }, 'd'),
      h('div', { id: 'e' }, 'e'),
    )
    patchValue(container, container.firstChild, prev, next, { browser: ctx.browser, registry: (ctx as any).__registry })

    const inserts = collector.events.filter((e) => e.machine === 'pos' && e.event === 'INSERT')
    assert.ok(inserts.length >= 4, `应观测到 4 次尾部新增，实际 ${inserts.length}`)
    // 插入点单调性：任何 INSERT 的锚点不得是之前 INSERT 插入的节点（位置身份按序追加）
    const inserted = new Set<string>()
    for (const ev of inserts) {
      const p = ev.payload as { i: number; insertedBefore: string; node: string }
      if (p.insertedBefore !== 'END') {
        assert.ok(!inserted.has(p.insertedBefore),
          `posHoleReal i=${p.i} 插入点指向已插入节点 ${p.insertedBefore}——append 串位（搜索恢复事故）`)
      }
      inserted.add(p.node)
    }
  } finally {
    collector.unsubscribe()
  }
})
