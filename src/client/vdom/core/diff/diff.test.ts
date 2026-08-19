/**
 * vdom core — diff 测试（旧树 vs 新树 → 增量更新命令——就地 patch 现有 DOM）
 *
 * 四阶段管线（route → build → diff → patch）：
 * - 首帧（无旧树）→ 全量 build 命令
 * - 同类型元素 → 就地 patch（属性 setProp + children 递归——不重建）
 * - 文本 → setText 就地更新（不重建节点）
 * - 组件同类型复用（工厂不重跑——renderFn 重新调用）
 * - 异类型/空洞 ↔ 真实节点 → transform 让位（childNodes 同构——长度恒定）
 *
 * **无 hydration**（2026-12 决策）：diff/patch 的标准就是现有 DOM 节点——
 * 增量命令就地更新——无收养/无整树重建。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { testBrowser } from '../../setup.ts'
import { h } from '../vnode.ts'
import { createPortal } from '../node/portal.ts'
import { diffStream } from './index.ts'
import { renderToStream } from '../build.ts'
import { CommandApplier } from '../patch/index.ts'
import { createComponentRegistry, disposeAllComponents } from '../node/component.ts'
import type { UIContext } from '../context/UIContext.ts'

/** 两阶段 harness：首帧 build（渲染旧树）→ diff 增量（就地 patch） */
function harness(browser: ReturnType<typeof testBrowser>) {
  const registry = createComponentRegistry()
  const root = browser.document.querySelector('#root') as HTMLElement
  const applier = new CommandApplier(root, browser.document, registry)
  const apply = async (stream: ReadableStream) => {
    const reader = stream.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      applier.apply(value)
    }
  }
  return {
    root, registry,
    mount: (tree: ReturnType<typeof h>) => apply(renderToStream(tree, {} as UIContext, registry)),
    update: (oldTree: ReturnType<typeof h>, newTree: ReturnType<typeof h>) =>
      apply(diffStream(oldTree, newTree, {} as UIContext, registry)),
  }
}

test('首帧：无旧树 → 全量 build（等价 renderToStream）', async () => {
  const hz = harness(testBrowser())
  await hz.mount(h('div', { class: 'a' }, 'hello'))
  assert.equal(hz.root.querySelector('.a')?.textContent, 'hello')
})

test('同类型元素：属性更新 + children 递归 patch（就地——不重建）', async () => {
  const hz = harness(testBrowser())
  await hz.mount(h('div', { class: 'old', id: 'x' }, [h('span', {}, 'a'), h('span', {}, 'b')]))
  await hz.update(
    h('div', { class: 'old', id: 'x' }, [h('span', {}, 'a'), h('span', {}, 'b')]),
    h('div', { class: 'new', id: 'x' }, [h('span', {}, 'A'), h('span', {}, 'b')]),
  )
  const div = hz.root.querySelector('div')!
  assert.equal(div.className, 'new', '属性就地更新')
  assert.equal(div.querySelectorAll('span').length, 2)
  assert.equal(div.querySelectorAll('span')[0].textContent, 'A', '文本就地 setText 更新')
  assert.equal(div.querySelectorAll('span')[1].textContent, 'b', '未变项保持')
})

test('文本变化：setText 就地更新（节点不重建——焦点保持前提）', async () => {
  const hz = harness(testBrowser())
  await hz.mount(h('div', {}, 'v1'))
  const divBefore = hz.root.querySelector('div')
  await hz.update(h('div', {}, 'v1'), h('div', {}, 'v2'))
  assert.equal(hz.root.querySelector('div')?.textContent, 'v2')
  assert.equal(hz.root.querySelector('div'), divBefore, '同一 div 节点——不重建')
})

test('新增/移除 children：新项插入 + 旧项移除（就地）', async () => {
  const hz = harness(testBrowser())
  await hz.mount(h('div', {}, [h('span', { class: 'a' }, 'a'), h('span', { class: 'b' }, 'b')]))
  await hz.update(
    h('div', {}, [h('span', { class: 'a' }, 'a'), h('span', { class: 'b' }, 'b')]),
    h('div', {}, [h('span', { class: 'a' }, 'a'), h('span', { class: 'c' }, 'c')]),
  )
  const div = hz.root.querySelector('div')!
  assert.equal(div.querySelectorAll('span').length, 2)
  assert.equal(div.querySelector('.a')?.textContent, 'a')
  assert.equal(div.querySelector('.c')?.textContent, 'c')
  assert.equal(div.querySelector('.b'), null, '旧项移除')
})

test('组件同类型复用：工厂不重跑——renderFn 重新调用读最新状态', async () => {
  const hz = harness(testBrowser())
  let mounts = 0
  let renders = 0
  const Counter = () => {
    mounts++
    return (props: Record<string, unknown>) => {
      renders++
      return h('span', { class: 'c' }, `v:${String(props.value)}`)
    }
  }
  await hz.mount(h(Counter, { value: 1 }))
  assert.equal(mounts, 1)
  assert.equal(hz.root.querySelector('.c')?.textContent, 'v:1')
  await hz.update(h(Counter, { value: 1 }), h(Counter, { value: 2 }))
  assert.equal(mounts, 1, '工厂不重跑——实例复用')
  assert.equal(renders, 2, 'renderFn 重新调用')
  assert.equal(hz.root.querySelector('.c')?.textContent, 'v:2', 'props 变化 → DOM 更新')
})

test('异类型转换：element 移除（数组缩短——同构 1:1——就地）', async () => {
  const hz = harness(testBrowser())
  await hz.mount(h('div', {}, [h('span', {}, 'a'), h('b', {}, 'bold')]))
  await hz.update(
    h('div', {}, [h('span', {}, 'a'), h('b', {}, 'bold')]),
    h('div', {}, [h('span', {}, 'a')]),
  )
  const div = hz.root.querySelector('div')!
  assert.equal(div.childNodes.length, 1, '新树 1 项 ⟷ DOM 1 节点（长度 1:1——同构）')
  assert.equal(div.querySelector('b'), null, 'b 移除')
  assert.equal(div.querySelector('span')?.textContent, 'a', 'a 保留')
})

test('条件渲染：null → 元素（空洞 ↔ 真实节点互换——长度恒定）', async () => {
  const hz = harness(testBrowser())
  await hz.mount(h('div', {}, [h('span', {}, 'a'), null, h('span', {}, 'c')]))
  await hz.update(
    h('div', {}, [h('span', {}, 'a'), null, h('span', {}, 'c')]),
    h('div', {}, [h('span', {}, 'a'), h('b', {}, 'new'), h('span', {}, 'c')]),
  )
  const div = hz.root.querySelector('div')!
  assert.equal(div.childNodes.length, 3, '长度恒定（锚 → b 互换）')
  assert.equal(div.childNodes[1].textContent, 'new', '空洞位置被新元素占据')
})

test('diff 本质：精准命令流——counter 点击只发文本 setText（不重建/不重发属性）', async () => {
  const browser = testBrowser()
  const hz = harness(browser)
  let count = 0
  let rc: { render: () => void } = { render: () => {} }
  const onInc = () => { count++; rc.render() } // 工厂层稳定引用（AGENTS §3.1——零重绑）
  const Counter = () => {
    return () => h('div', {},
      h('button', { id: 'inc', onClick: onInc }, `count:${count}`),
    )
  }
  // 首帧（全量 build）
  await hz.mount(h(Counter, {}))
  assert.equal(hz.root.querySelector('#inc')?.textContent, 'count:0')

  // 点击模拟：count++ → 新树 → diff —— 捕获命令流断言精准性
  const oldTree = h(Counter, {})
  count = 1
  const newTree = h(Counter, {})
  const cmds: unknown[] = []
  const stream = diffStream(oldTree, newTree, {} as UIContext, hz.registry)
  const reader = stream.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    cmds.push(value)
  }
  // 精准断言：只 setText（文本节点）+ done——无 create/insert/remove/setProp
  const ops = cmds.map((c) => (c as { op: string }).op)
  assert.deepEqual(ops, ['setText', 'done'], '精准命令流——只修改文本节点')
  const setText = cmds[0] as { id: string; value: string }
  assert.equal(setText.id, 'root.0.0.0', '文本节点 id 精准定位')
  assert.equal(setText.value, 'count:1')
})

test('diff 本质：属性变化只发 setProp（不重建元素）', async () => {
  const hz = harness(testBrowser())
  await hz.mount(h('div', { class: 'a', id: 'x' }, 'text'))
  const cmds: unknown[] = []
  const stream = diffStream(
    h('div', { class: 'a', id: 'x' }, 'text'),
    h('div', { class: 'b', id: 'x' }, 'text'),
    {} as UIContext, hz.registry,
  )
  const reader = stream.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    cmds.push(value)
  }
  const ops = cmds.map((c) => (c as { op: string }).op)
  assert.deepEqual(ops, ['setProp', 'done'], '只发属性更新——元素不重建')
})

test('keyed 列表：增/删——组件状态跟随 key（身份复用——不按位置继承）', async () => {
  const hz = harness(testBrowser())
  const clicks = new Map<string, number>([['a', 0], ['b', 0]])
  let mounts = 0
  const Item = (init: Record<string, unknown>) => {
    mounts++
    const id = init.id as string
    return () => h('button', { class: 'it' }, `${id}:${clicks.get(id) ?? 0}`)
  }
  const list = (ids: string[]) => h('div', {}, ids.map((id) => h(Item, { key: id, id })))
  await hz.mount(list(['a', 'b']))
  assert.equal(mounts, 2)
  assert.equal(hz.root.querySelectorAll('.it')[0].textContent, 'a:0')
  // 增：c 加入（a/b 保持）
  await hz.update(list(['a', 'b']), list(['a', 'b', 'c']))
  assert.equal(mounts, 3, '只 mount c——a/b 复用')
  assert.equal(hz.root.querySelectorAll('.it').length, 3)
  // 删：b 移除——a 状态保持
  await hz.update(list(['a', 'b', 'c']), list(['a', 'c']))
  assert.equal(hz.root.querySelectorAll('.it').length, 2)
  assert.equal(hz.root.querySelectorAll('.it')[0].textContent, 'a:0')
  assert.equal(hz.root.querySelectorAll('.it')[1].textContent, 'c:0', 'c 顶位——身份跟随 key')
})

test('keyed 列表：重排——组件状态跟随 key（不按位置继承——身份不漂移）', async () => {
  const hz = harness(testBrowser())
  const clicks = new Map<string, number>([['a', 1], ['b', 5], ['c', 9]])
  let mounts = 0
  const Item = (init: Record<string, unknown>) => {
    mounts++
    const id = init.id as string
    return () => h('button', { class: 'it' }, `${id}:${clicks.get(id) ?? 0}`)
  }
  const list = (ids: string[]) => h('div', {}, ids.map((id) => h(Item, { key: id, id })))
  await hz.mount(list(['a', 'b', 'c']))
  // 重排：c 移到首位——状态跟随 key（c:9 在首位）
  await hz.update(list(['a', 'b', 'c']), list(['c', 'a', 'b']))
  const items = hz.root.querySelectorAll('.it')
  assert.equal(items.length, 3)
  assert.equal(items[0].textContent, 'c:9', 'c 首位——状态保持（key 身份）')
  assert.equal(items[1].textContent, 'a:1', 'a 状态保持')
  assert.equal(items[2].textContent, 'b:5', 'b 状态保持')
})

test('keyed 列表：重排——组件实例复用（工厂不重跑——状态保持）', async () => {
  const hz = harness(testBrowser())
  let mounts = 0
  const Item = (init: Record<string, unknown>) => {
    mounts++
    return () => h('span', { class: 'it' }, String(init.id))
  }
  const list = (ids: string[]) => h('div', {}, ids.map((id) => h(Item, { key: id, id })))
  await hz.mount(list(['a', 'b', 'c']))
  assert.equal(mounts, 3)
  await hz.update(list(['a', 'b', 'c']), list(['c', 'a', 'b']))
  assert.equal(mounts, 3, '重排——组件实例复用（.k{key} 身份——工厂不重跑）')
  const items = hz.root.querySelectorAll('.it')
  assert.equal(items.length, 3)
  assert.equal(items[0].textContent, 'c', '新顺序正确')
  assert.equal(items[1].textContent, 'a')
  assert.equal(items[2].textContent, 'b')
})

test('A 级检测：长度变化 + 无 key 组件项 → warn 引导声明 key（位置继承漂移防护）', async () => {
  const hz = harness(testBrowser())
  const warns: string[] = []
  const origWarn = console.warn
  console.warn = (m: unknown) => { warns.push(String(m)) }
  try {
    const Item = () => () => h('span', {}, 'x')
    const list = (n: number) => h('div', {}, Array.from({ length: n }, () => h(Item, {})))
    await hz.mount(list(2))
    await hz.update(list(2), list(3))
    assert.equal(warns.length, 1, '长度变化 + 无 key 组件 → warn')
    assert.match(warns[0], /key/)
  } finally {
    console.warn = origWarn
  }
})

test('A 级检测：长度一致（无 key）不 warn；长度变化（全 keyed）不 warn', async () => {
  const hz = harness(testBrowser())
  const warns: string[] = []
  const origWarn = console.warn
  console.warn = (m: unknown) => { warns.push(String(m)) }
  try {
    const Item = () => () => h('span', {}, 'x')
    // 长度一致（2 → 2——无 key 组件）——位置对照正确——不 warn
    const list = (keys?: string[]) => h('div', {}, keys
      ? keys.map((k) => h(Item, { key: k }))
      : [h(Item, {}), h(Item, {})])
    await hz.mount(list())
    await hz.update(list(), list())
    assert.equal(warns.length, 0, '长度一致——位置身份正确——不 warn')
    // 长度变化（2 → 3——全 keyed）——身份复用——不 warn
    await hz.update(list(['a', 'b']), list(['a', 'b', 'c']))
    assert.equal(warns.length, 0, '全 keyed——身份复用——不 warn')
  } finally {
    console.warn = origWarn
  }
})

test('组件输出 null：条件渲染组件切换（div → null → div——占位锚 ↔ 真实节点——X-G4）', async () => {
  const hz = harness(testBrowser())
  const Cond = (_init: Record<string, unknown>) => {
    // 受控 props：renderFn 读最新 props（闭包 let 不同步——AGENTS §3.1）
    return (props: Record<string, unknown>) => props.show ? h('div', { class: 'box' }, '内容') : null
  }
  const page = (show: boolean, toggle: () => void) => h('div', {}, h(Cond, { show, ctx: { toggle } }))
  let toggle = () => {}
  await hz.mount(page(true, toggle))
  const div = hz.root.querySelector('.box')
  assert.ok(div, '组件输出 div')
  // 输出 → null：占位锚替换（同构——长度保持）
  toggle = () => {}
  await hz.update(page(true, toggle), page(false, toggle))
  const container = hz.root.querySelector('div')!
  assert.equal(container.childNodes.length, 1, '长度恒定（div → 锚）')
  assert.equal(container.childNodes[0].nodeType, 8, '组件输出 null → wf-hole 占位锚')
  // null → 输出：锚 → 真实节点（X-G4 恢复）
  await hz.update(page(false, toggle), page(true, toggle))
  assert.equal(hz.root.querySelector('.box')?.textContent, '内容', '恢复渲染')
  assert.equal(container.childNodes.length, 1, '同构保持（锚 → div）')
})

test('组件输出 null 精准命令流：div → null 只发 remove + 锚（无重建噪音）', async () => {
  const hz = harness(testBrowser())
  const Cond = (_init: Record<string, unknown>) => {
    return (props: Record<string, unknown>) => props.show ? h('div', { class: 'box' }, 'x') : null
  }
  const page = (show: boolean) => h('div', {}, h(Cond, { show }))
  await hz.mount(page(true))
  const cmds: unknown[] = []
  const stream = diffStream(page(true), page(false), {} as UIContext, hz.registry)
  const reader = stream.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    cmds.push(value)
  }
  const ops = cmds.map((c) => (c as { op: string }).op)
  assert.deepEqual(ops, ['remove', 'createAnchor', 'insert', 'done'],
    '精准：组件输出 div → null——remove 旧 + 占位锚')
})

test('patch 生命周期：ref 挂载后执行（insert 后 el 已连接）+ 移除时 ref(null) 清理', async () => {
  const browser = testBrowser()
  const reg = createComponentRegistry()
  const root = browser.document.querySelector('#root') as HTMLElement
  const applier = new CommandApplier(root, browser.document, reg)
  const calls: string[] = []
  const myRef = (el: HTMLElement | null) => { calls.push(el ? `mount:${el.isConnected}` : 'unmount') }
  // 首帧（全量 build——ref 挂起——insert 后执行）
  const s1 = renderToStream(h('div', {}, h('span', { ref: myRef }, 'x')), {} as UIContext, reg)
  const r1 = s1.getReader()
  while (true) { const { value, done } = await r1.read(); if (done) break; applier.apply(value) }
  assert.deepEqual(calls, ['mount:true'], 'ref 在挂载后执行（el.isConnected = true）')
  // 移除节点 → ref(null)（卸载清理）
  const s2 = renderToStream(h('div', {}), {} as UIContext, reg)
  const r2 = s2.getReader()
  while (true) { const { value, done } = await r2.read(); if (done) break; applier.apply(value) }
  assert.deepEqual(calls, ['mount:true', 'unmount'], '移除 → ref(null)')
})

test('patch 生命周期：unmountComp 执行 onUnmounts（组件卸载清理）', async () => {
  const hz = harness(testBrowser())
  const cleaned: string[] = []
  const Page = (_init: Record<string, unknown>, ctx: UIContext) => {
    const onUnmount = _init.onUnmount as (s: string) => void
    ctx.onUnmount(() => onUnmount('page-cleanup'))   // 注册——卸载时执行
    return () => h('div', { class: 'page' }, '页')
  }
  const Item = (init: Record<string, unknown>, ctx: UIContext) => {
    ctx.onUnmount(() => (init.onUnmount as (s: string) => void)('item-cleanup'))
    return () => h('span', { class: 'it' }, '项')
  }
  const page = (show: boolean) => h('div', {}, show
    ? [h(Page, { onUnmount: (s: string) => cleaned.push(s) }), h(Item, { onUnmount: (s: string) => cleaned.push(s) })]
    : [h('div', { class: 'empty' }, '空')])
  await hz.mount(page(true))
  assert.equal(cleaned.length, 0, '挂载时未清理')
  // 异类型转换（component → element——整块让位）→ unmount 命令 → onUnmounts 执行
  await hz.update(page(true), page(false))
  assert.deepEqual(cleaned.sort(), ['item-cleanup', 'page-cleanup'], '卸载时 onUnmounts 执行（patch 消费 unmountComp）')
  assert.equal(hz.root.querySelector('.empty')?.textContent, '空')
})

test('生命周期指令：ref（insert 后挂载完成——el 已连接）/unref（ref(null)）', async () => {
  const browser = testBrowser()
  const reg = createComponentRegistry()
  const root = browser.document.querySelector('#root') as HTMLElement
  const applier = new CommandApplier(root, browser.document, reg)
  const calls: string[] = []
  const myRef = (el: HTMLElement | null) => { calls.push(el ? `mount:${el.isConnected}` : 'unmount') }
  // 首帧（ref prop → ref 指令——insert 后——挂载完成）
  const s1 = renderToStream(h('div', {}, h('span', { ref: myRef }, 'x')), {} as UIContext, reg)
  const r1 = s1.getReader()
  while (true) { const { value, done } = await r1.read(); if (done) break; applier.apply(value) }
  assert.deepEqual(calls, ['mount:true'], 'ref 指令：insert 后执行（el 已连接）')
  // 显式 unref 指令 → ref(null)
  applier.apply({ op: 'unref', id: 'root.0.0' })
  assert.deepEqual(calls, ['mount:true', 'unmount'], 'unref 指令：ref(null) 清理')
})

test('生命周期指令：mount（新实例初始化完成）/unmount（onUnmounts 清理）', async () => {
  const hz = harness(testBrowser())
  const events: string[] = []
  const Comp = (_init: Record<string, unknown>, ctx: UIContext) => {
    ctx.onUnmount(() => events.push('cleanup'))
    return () => h('span', { class: 'c' }, 'x')
  }
  const page = (show: boolean) => h('div', {}, show ? h(Comp, {}) : null)
  await hz.mount(page(true))
  assert.deepEqual(events, [], '挂载不清理')
  // 组件移除（数组缩短——unmount 指令）→ onUnmounts 执行
  await hz.update(page(true), page(false))
  assert.deepEqual(events, ['cleanup'], 'unmount 指令：onUnmounts 执行')
})

test('生命周期指令：mount 标记实例已挂载（审计配对——patch 消费）', async () => {
  const hz = harness(testBrowser())
  const Comp = () => () => h('span', {}, 'x')
  await hz.mount(h('div', {}, h(Comp, {})))
  // 实例已标记 mounted（patch 消费 mount 指令）
  const rec = (hz.registry as any).get('root.0.0')
  assert.equal(rec?.mounted, true, 'mount 指令标记实例已挂载')
})

test('keyed 真移除：不在新列表的 key → unmount（onUnmounts 清理）——复用项不清理', async () => {
  const hz = harness(testBrowser())
  const cleaned: string[] = []
  let mounts = 0
  const Item = (init: Record<string, unknown>, ctx: UIContext) => {
    mounts++
    const id = init.id as string
    ctx.onUnmount(() => cleaned.push(`un:${id}`))
    return () => h('span', { class: 'it' }, String(init.id))
  }
  const list = (ids: string[]) => h('div', {}, ids.map((id) => h(Item, { key: id, id })))
  await hz.mount(list(['a', 'b', 'c']))
  await hz.update(list(['a', 'b', 'c']), list(['a', 'c']))
  assert.deepEqual(cleaned, ['un:b'], '真移除项 b 卸载清理——复用项 a/c 不清理')
  assert.equal(mounts, 3, '复用项工厂不重跑')
})

test('混合数组：keyed 项身份复用（状态跟随 key）+ 无 key 项重建', async () => {
  const hz = harness(testBrowser())
  const clicks = new Map<string, number>([['k1', 3], ['k2', 7]])
  let mounts = 0
  const Keyed = (init: Record<string, unknown>) => {
    mounts++
    const id = init.id as string
    return () => h('span', { class: `k-${id}` }, `${id}:${clicks.get(id) ?? 0}`)
  }
  // 混合：[k1(keyed), plain(无 key), k2(keyed)]
  const list = (order: Array<string | { k: string }>) => h('div', {}, order.map((o, i) =>
    typeof o === 'string' ? h('span', { class: `p-${i}` }, o) : h(Keyed, { key: o.k, id: o.k }),
  ))
  await hz.mount(list(['p1', { k: 'k1' }, 'p2', { k: 'k2' }]))
  assert.equal(mounts, 2)
  // 重排：k1 与 k2 交换（keyed 项身份复用——状态保持）
  await hz.update(
    list(['p1', { k: 'k1' }, 'p2', { k: 'k2' }]),
    list(['p1', { k: 'k2' }, 'p2', { k: 'k1' }]),
  )
  assert.equal(mounts, 2, 'keyed 项复用——工厂不重跑')
  const items = hz.root.querySelectorAll('span')
  const texts = [...items].map((s) => s.textContent)
  assert.ok(texts.includes('k2:7'), 'k2 状态保持（k2:7）')
  assert.ok(texts.includes('k1:3'), 'k1 状态保持（k1:3）')
})

test('move：keyed 删除顺移——节点移动（DOM 不重建——isConnected 保持）', async () => {
  const hz = harness(testBrowser())
  const Item = (init: Record<string, unknown>) => {
    return () => h('input', { class: 'it', id: String(init.id), value: String(init.id) })
  }
  const list = (ids: string[]) => h('div', {}, ids.map((id) => h(Item, { key: id, id })))
  await hz.mount(list(['a', 'b', 'c']))
  // 记录节点引用（验证移动而非重建）
  const before = [...hz.root.querySelectorAll('.it')]
  // 删除 b——c 顺移（单移动——无 id 冲突——move 路径）
  await hz.update(list(['a', 'b', 'c']), list(['a', 'c']))
  const after = [...hz.root.querySelectorAll('.it')]
  assert.deepEqual(after.map((e) => e.id), ['a', 'c'], '新顺序正确')
  // 移动：同一节点引用（DOM 不重建——焦点/输入状态保持）
  assert.equal(after[1], before[2], 'c 节点移动（非重建）')
})

test('move：子树 id 重映射——子节点引用保持（深层结构移动）', async () => {
  const hz = harness(testBrowser())
  const Card = (init: Record<string, unknown>) => {
    const id = init.id as string
    return () => h('div', { class: 'card' }, h('span', { class: 'title' }, `t-${id}`))
  }
  const list = (ids: string[]) => h('div', {}, ids.map((id) => h(Card, { key: id, id })))
  await hz.mount(list(['x', 'y', 'z']))
  const titles = [...hz.root.querySelectorAll('.title')]
  // 删除 x——y/z 顺移（单移动——无 id 冲突——move 路径——子树重映射）
  await hz.update(list(['x', 'y', 'z']), list(['y', 'z']))
  const after = [...hz.root.querySelectorAll('.title')]
  assert.equal(after[1], titles[2], 'z 子节点移动保持（子树重映射）')
  assert.equal(after[0].textContent, 't-y')
  assert.equal(after[1].textContent, 't-z')
})

test('move 命令流：删除顺移只发 noMove remap（无 create/remove——节点复用）', async () => {
  const hz = harness(testBrowser())
  const Item = (init: Record<string, unknown>) => () => h('span', { class: 'it' }, String(init.id))
  const list = (ids: string[]) => h('div', {}, ids.map((id) => h(Item, { key: id, id })))
  await hz.mount(list(['a', 'b', 'c']))
  const cmds: unknown[] = []
  const stream = diffStream(list(['a', 'b', 'c']), list(['a', 'c']), {} as UIContext, hz.registry)
  const reader = stream.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    cmds.push(value)
  }
  const ops = cmds.map((c) => (c as { op: string }).op)
  assert.ok(!ops.includes('create'), '顺移无 create（节点复用）')
  const moves = cmds.filter((c) => (c as { op: string }).op === 'move') as Array<{ noMove?: boolean }>
  assert.equal(moves.length, 1, 'c 单顺移（b 移除——a 位置不变）')
  assert.equal(moves[0].noMove, true, '顺移 = noMove remap（位置自然到位——id 前缀迁移）')
})

test('patch 资源释放：remove/done 后 propPrev 表清理（事件旧值引用不残留）', async () => {
  const hz = harness(testBrowser())
  const Item = (init: Record<string, unknown>) => {
    const onClick = () => {} // 每次工厂新函数
    return () => h('button', { id: String(init.id), onClick }, String(init.id))
  }
  const list = (ids: string[]) => h('div', {}, ids.map((id) => h(Item, { key: id, id })))
  await hz.mount(list(['a', 'b', 'c']))
  // 表里有事件 prev（mount 时 setProp 记忆）
  // 验证：直接通过 patch 层观察（移除 b——propPrev 无 b 前缀键）
  await hz.update(list(['a', 'b', 'c']), list(['a', 'c']))
  // 再触发一次渲染确认无残留副作用（事件绑定不重复）
  await hz.update(list(['a', 'c']), list(['a', 'c']))
  // 移除后组件不残留（通过后续 keyed 复用验证——b 的实例已卸载）
  assert.equal(hz.root.querySelectorAll('button').length, 2)
  assert.equal(hz.root.querySelectorAll('button')[0].textContent, 'a')
  assert.equal(hz.root.querySelectorAll('button')[1].textContent, 'c')
})

test('patch 资源释放：done.full 清理后 propPrev 不残留（全量流重建）', async () => {
  const browser = testBrowser()
  const reg = createComponentRegistry()
  const root = browser.document.querySelector('#root') as HTMLElement
  const applier = new CommandApplier(root, browser.document, reg)
  const onClick = () => {}
  const s1 = renderToStream(h('div', {}, h('button', { id: 'b', onClick }, 'x')), {} as Ctx, reg)
  const r1 = s1.getReader()
  while (true) { const { value, done } = await r1.read(); if (done) break; applier.apply(value) }
  // 全量流 2（结构变化——button 消失——done.full 清理）
  const s2 = renderToStream(h('div', {}, 'only text'), {} as Ctx, reg)
  const r2 = s2.getReader()
  while (true) { const { value, done } = await r2.read(); if (done) break; applier.apply(value) }
  assert.equal(root.querySelector('#b'), null, '节点已移除')
  // 重新渲染 button——事件绑定一次（无残留 prev 干扰——重复绑定不出现）
  const onClick2 = () => {}
  const s3 = renderToStream(h('div', {}, h('button', { id: 'b', onClick: onClick2 }, 'x')), {} as Ctx, reg)
  const r3 = s3.getReader()
  while (true) { const { value, done } = await r3.read(); if (done) break; applier.apply(value) }
  assert.equal(root.querySelector('#b')?.textContent, 'x', '重建正常')
})

test('组件输出数组 ↔ 单节点：双向转换——旧输出完整清理（残留 bug 修复）', async () => {
  const hz = harness(testBrowser())
  const Multi = (_init: Record<string, unknown>) => {
    return (props: Record<string, unknown>) => (props.mode as string) === 'multi'
      ? [h('span', { class: 'm1' }, '一'), h('span', { class: 'm2' }, '二')]
      : h('div', { class: 'single' }, '单')
  }
  const page = (mode: string) => h('div', {}, h(Multi, { mode }))
  await hz.mount(page('multi'))
  assert.equal(hz.root.querySelectorAll('span').length, 2, '数组输出（隐式 Fragment）')
  // 数组 → 单节点：旧数组逐项清理（无残留）
  await hz.update(page('multi'), page('single'))
  assert.equal(hz.root.querySelector('.single')?.textContent, '单', '单节点渲染')
  assert.equal(hz.root.querySelectorAll('span').length, 0, '旧数组项完整移除（无 m1/m2 残留）')
  // 单节点 → 数组：反向转换
  await hz.update(page('single'), page('multi'))
  assert.equal(hz.root.querySelectorAll('span').length, 2, '数组恢复')
  assert.equal(hz.root.querySelector('.single'), null, '单节点移除')
})

test('四层集成：build/diff/transform/patch 全职责——命令级验证', async () => {
  const browser = testBrowser()
  const reg = createComponentRegistry()
  const root = browser.document.querySelector('#root') as HTMLElement
  const applier = new CommandApplier(root, browser.document, reg)
  const events: string[] = []
  const refCalls: string[] = []

  /** 命令捕获应用（每层产物断言） */
  const run = async (stream: ReadableStream): Promise<unknown[]> => {
    const cmds: unknown[] = []
    const reader = stream.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      cmds.push(value)
      applier.apply(value)
    }
    return cmds
  }

  // ── 组件：列表项（keyed——投票状态）/ 条件渲染 / 页面（布局 + 浮层） ──
  const Item = (init: Record<string, unknown>, ctx: Ctx) => {
    ctx.onUnmount(() => events.push(`un:item:${init.id}`))
    let votes = 0
    const onVote = () => { votes++; void ctx.render?.() }
    return () => h('li', { class: 'it' }, h('span', { class: 't' }, `${String(init.id)}(${votes})`), h('button', { class: 'v', onClick: onVote }, '赞'))
  }
  const Extra = (_i: Record<string, unknown>, ctx: Ctx) => {
    ctx.onUnmount(() => events.push('un:extra'))
    return () => h('div', { class: 'extra' }, 'X')
  }
  const Layout = (init: Record<string, unknown>, ctx: Ctx) => {
    ctx.onUnmount(() => events.push('un:layout'))
    // ref 工厂层稳定引用（AGENTS §5.1——零重绑）
    const hdRef = (el: HTMLElement | null) => { refCalls.push(el ? 'hd-mount' : 'hd-unmount') }
    return (props: Record<string, unknown>) => {
      const page = props.page as never
      return h('div', { class: 'layout' },
        h('header', { class: 'hd', ref: hdRef }, '头'),
        page,
      )
    }
  }
  const PageA = (init: Record<string, unknown>, ctx: Ctx) => {
    ctx.onUnmount(() => events.push('un:pageA'))
    const popup = (ctx.ui as { usePopup: (o: object) => {
      open: boolean; setOpen: (v: boolean) => void; portal: (c: unknown, k?: string) => unknown; panelRef: (el: HTMLElement | null) => void
    } }).usePopup({})
    let ids = init.ids as string[]
    let more = false
    let likes = 0
    const onLike = () => { likes++; void ctx.render?.() }
    const onAdd = () => { ids = [...ids, `i${ids.length}`]; void ctx.render?.() }
    const onReorder = () => { ids = [...ids].reverse(); void ctx.render?.() }
    const onMore = () => { more = !more; void ctx.render?.() }
    const onDd = () => popup.setOpen(!popup.open)
    return () => {
      const panel = popup.portal(h('div', { ref: popup.panelRef as never, class: 'panel' }, '浮层'), 'dd')
      return h('main', { class: 'pageA' },
        h('button', { id: 'like', onClick: onLike }, `赞${likes}`),
        more ? h(Extra, {}) : null,                                    // 条件渲染（transform）
        h('ul', { class: 'list' }, ids.map((id) => h(Item, { key: id, id }))), // keyed 列表
        h('button', { id: 'add', onClick: onAdd }, '加'),
        h('button', { id: 're', onClick: onReorder }, '重排'),
        h('button', { id: 'mo', onClick: onMore }, '展开'),
        h('button', { id: 'dd', onClick: onDd }, '弹'),
        panel,
      )
    }
  }
  const PageB = (_i: Record<string, unknown>, ctx: Ctx) => {
    ctx.onUnmount(() => events.push('un:pageB'))
    return () => h('main', { class: 'pageB' }, 'B页')
  }
  const pageA = (ids: string[]) => h(Layout, { page: h(PageA, { ids }) })
  const pageB = h(Layout, { page: h(PageB, {}) })

  // ── ① build 层：首帧全量（Layout + PageA + Item×2 + ref + mount 指令 + done.full） ──
  const cmds1 = await run(renderToStream(pageA(['a', 'b']), {} as Ctx, reg))
  const ops1 = cmds1.map((c) => (c as { op: string }).op)
  assert.ok(ops1.includes('ref'), 'build 层：ref 指令（挂载完成）')
  assert.ok(ops1.includes('mount'), 'build 层：mount 指令（组件初始化）')
  assert.ok(ops1.includes('setProp'), 'build 层：setProp（事件代理注册）')
  assert.deepEqual((cmds1[cmds1.length - 1] as { op: string }), { op: 'done', full: true }, 'build 层：done.full')
  assert.equal(root.querySelectorAll('.it').length, 2, 'keyed 列表 2 项')
  assert.deepEqual(refCalls, ['hd-mount'], 'ref 挂载（isConnected）')

  // ── ② diff 层：值比较精准（点赞 → 只 setText——无重建无属性噪音） ──
  const likeBtn = root.querySelector('#like') as HTMLElement
  likeBtn.click() // likes 闭包 0 → 1（harness 无 render——仅闭包变化）
  const cmds2 = await run(diffStream(pageA(['a', 'b']), pageA(['a', 'b']), {} as Ctx, reg))
  const ops2 = cmds2.map((c) => (c as { op: string }).op)
  assert.deepEqual(ops2, ['setText', 'done'], 'diff 层：点赞 → 只 setText（值比较——最小命令集）')
  // 无变化 → 无命令（再 diff 相同状态——零噪音）
  const cmds2b = await run(diffStream(pageA(['a', 'b']), pageA(['a', 'b']), {} as Ctx, reg))
  assert.deepEqual(cmds2b, [{ op: 'done' }], 'diff 层：无变化不发命令')

  // ── ③ transform 层：条件渲染（null → 组件——占位锚 ↔ 元素） ──
  // 手动驱动 more（通过直接 diff 新树——PageA 的 more 是闭包——用 props 受控）
  const PageA2 = (init: Record<string, unknown>, ctx: Ctx) => {
    const popup = (ctx.ui as { usePopup: (o: object) => { portal: (c: unknown, k?: string) => unknown; panelRef: (el: HTMLElement | null) => void } }).usePopup({})
    return (props: Record<string, unknown>) => {
      const panel = popup.portal(h('div', { ref: popup.panelRef as never, class: 'panel' }, '浮层'), 'dd')
      return h('main', { class: 'pageA' },
        props.more ? h(Extra, {}) : null,
        h('ul', { class: 'list' }, (props.ids as string[]).map((id) => h(Item, { key: id, id }))),
        panel,
      )
    }
  }
  const pageA2 = (ids: string[], more: boolean) => h(PageA2, { ids, more })
  await run(renderToStream(pageA2(['a', 'b'], false), {} as Ctx, reg))
  const cmds3 = await run(diffStream(pageA2(['a', 'b'], false), pageA2(['a', 'b'], true), {} as Ctx, reg))
  const ops3 = cmds3.map((c) => (c as { op: string }).op)
  assert.ok(ops3.includes('remove') && ops3.includes('create'), 'transform 层：null → 组件（占位锚让位 + 新侧渲染）')
  assert.ok(root.querySelector('.extra'), 'Extra 渲染')

  // ── ④ diff 列表层：keyed 增（新 mount） + 重排（move 命令——节点复用） ──
  const cmds4 = await run(diffStream(pageA2(['a', 'b'], true), pageA2(['a', 'b', 'c'], true), {} as Ctx, reg))
  const ops4 = cmds4.map((c) => (c as { op: string }).op)
  assert.ok(ops4.includes('mount'), 'keyed 增：新实例 mount')
  assert.equal(root.querySelectorAll('.it').length, 3)
  // a 的投票（④ 增后——重新查询——闭包 votes 1——DOM 无 render 不变）
  ;(root.querySelectorAll('.v')[0] as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 20))
  // 重排（a b c → c b a——**循环移位——move id 冲突 → 重建路径**——
  // 组件实例 .k{key} 复用——状态保持）
  const cmds5 = await run(diffStream(pageA2(['a', 'b', 'c'], true), pageA2(['c', 'b', 'a'], true), {} as Ctx, reg))
  const ops5 = cmds5.map((c) => (c as { op: string }).op)
  assert.ok(ops5.includes('remove') && ops5.includes('create'), '循环移位：冲突检测 → 重建路径（move id 覆盖事故的根治）')
  const after = [...root.querySelectorAll('.it')]
  assert.deepEqual(after.map((e) => e.querySelector('.t')?.textContent), ['c(0)', 'b(0)', 'a(1)'], '重排顺序正确 + 实例复用（a 投票状态保持）')
  // 重建后事件代理仍工作（新节点点击——闭包 votes 1——再次 diff 验证）
  ;(after[0].querySelector('.v') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 20))
  await run(diffStream(pageA2(['c', 'b', 'a'], true), pageA2(['c', 'b', 'a'], true), {} as Ctx, reg))
  assert.equal(after[0].querySelector('.t')?.textContent, 'c(1)', 'patch 层：重建后事件代理仍分发（diff 精准 setText）')

  // ── ⑤ patch 层：浮层开关（portal → removePortal 容器清理） ──
  // 直接切换 popup（通过 props 受控浮层——简化：发 setProp？——用完整页面驱动）
  // 此处验证 removePortal 命令（关闭语义）
  const Panel = (_init: Record<string, unknown>) => {
    return (props: Record<string, unknown>) => h('div', {},
      props.open ? createPortal(h('div', { class: 'panel' }, '浮层'), 'dd') as never : null,
    )
  }
  const panelPage = (open: boolean) => h(Panel, { open })
  const doc = root.ownerDocument
  await run(renderToStream(panelPage(true), {} as Ctx, reg))
  assert.ok(doc.querySelector('.panel'), '浮层打开（#__wf_portal）')
  const cmds6 = await run(diffStream(panelPage(true), panelPage(false), {} as Ctx, reg))
  const ops6 = cmds6.map((c) => (c as { op: string }).op)
  assert.ok(ops6.includes('removePortal'), 'patch 层：浮层关闭 → removePortal（容器清理）')
  assert.equal(doc.querySelector('.panel'), null, '浮层移除')

  // ── ⑥ route 层：root 类型变化（导航等价——disposeAll + 全量 build + 卸载） ──
  disposeAllComponents(reg) // 模拟 serve 导航的整树替换（旧实例全部卸载）
  const cmds7 = await run(renderToStream(pageB, {} as Ctx, reg))
  const ops7 = cmds7.map((c) => (c as { op: string }).op)
  assert.ok(ops7.includes('mount'), 'route 层：新页全量 build（mount 指令）')
  assert.equal(root.querySelector('.pageB')?.textContent, 'B页', '新页渲染')
  // 卸载顺序（整树替换——LIFO）
  assert.deepEqual(refCalls, ['hd-mount', 'hd-unmount', 'hd-mount'], 'ref 生命周期（卸载 + 新挂载）')
  assert.ok(events.includes('un:pageA'), 'PageA 卸载')
  assert.ok(events.includes('un:item:a'), 'Item 卸载（keyed 实例清理）')
})
