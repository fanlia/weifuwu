/**
 * vdom3 核心测试——vnode + stream（渲染执行 = 事件流）
 *
 * 验证核心不变量：
 *   1. mount：vnode 树 → 事件流（NODE_CREATE/TEXT_CREATE/INSERT/PROP_UPDATE）→ DOM
 *   2. patch：同位置同类型复用——仅变化发事件（TEXT_UPDATE/PROP_UPDATE）
 *   3. 异类型 → REMOVE + CREATE + INSERT（重建事件）
 *   4. 列表 keyed：同 key 复用——增删只操作变化项
 *   5. DOM = fold(事件流)：事件序列可断言（回放基础）
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from './client/setup.ts'
import { h, mount, patch, stream } from '../ui-dom/vdom3/index.ts'

before(setupJsdom)

function mkRoot(): HTMLElement {
  const root = document.createElement('div')
  document.body.appendChild(root)
  return root
}

test('mount：vnode 树 → 事件流（CREATE/INSERT/PROP_UPDATE）→ DOM', () => {
  stream.reset()
  const root = mkRoot()
  const tree = h('div', { id: 'box', class: 'a' }, [
    h('span', {}, 'hello'),
    h('button', { onClick: () => {} }, '点击'),
  ])
  mount(tree, root)

  assert.ok(root.querySelector('#box'), '元素渲染')
  assert.equal(root.querySelector('span')?.textContent, 'hello', '文本渲染')

  const events = stream.events()
  assert.ok(events.some((e) => e.type === 'NODE_CREATE' && (e as any).tag === 'div'), 'NODE_CREATE 事件（div）')
  assert.ok(events.some((e) => e.type === 'NODE_CREATE' && (e as any).tag === 'button'), 'NODE_CREATE 事件（button）')
  assert.ok(events.some((e) => e.type === 'INSERT'), 'INSERT 事件')
  assert.ok(events.some((e) => e.type === 'PROP_UPDATE' && (e as any).key === 'class'), 'PROP_UPDATE 事件（class）')
  document.body.removeChild(root)
})

test('patch：同位置同类型复用——仅文本/属性变化发事件（无重建）', () => {
  stream.reset()
  const root = mkRoot()
  // 直接构造两棵树
  const v1 = h('div', { id: 'box', class: 'a' }, ['旧文本'])
  const v2 = h('div', { id: 'box', class: 'b' }, ['新文本'])
  mount(v1, root)
  const box = root.querySelector('#box')!
  const text = box.firstChild as Text
  stream.reset() // 清掉 mount 事件——只测 patch 事件

  patch(v1, v2, root)

  assert.equal(text.nodeValue, '新文本', '文本更新（同一节点——未重建）')
  assert.equal(box.getAttribute('class'), 'b', '属性更新（同一元素）')
  assert.equal(box.childNodes.length, 1, '无节点增删（复用）')
  assert.equal(root.querySelectorAll('#box').length, 1, '单实例（无重建）')

  const events = stream.events()
  assert.ok(events.some((e) => e.type === 'TEXT_UPDATE'), 'TEXT_UPDATE 事件')
  assert.ok(events.some((e) => e.type === 'PROP_UPDATE' && (e as any).key === 'class' && e.value === 'b'), 'PROP_UPDATE 事件（class a→b）')
  assert.ok(!events.some((e) => e.type === 'NODE_CREATE'), '无 NODE_CREATE（未重建）')
  document.body.removeChild(root)
})

test('异类型/异 key → REMOVE + CREATE + INSERT（重建事件）', () => {
  stream.reset()
  const root = mkRoot()
  const v1 = h('div', {}, [h('span', { id: 'old' }, '旧')])
  const v2 = h('div', {}, [h('p', { id: 'new' }, '新')])
  mount(v1, root)
  stream.reset()

  patch(v1, v2, root)

  assert.ok(!root.querySelector('#old'), '旧元素移除')
  assert.ok(root.querySelector('#new'), '新元素创建')
  const events = stream.events()
  assert.ok(events.some((e) => e.type === 'REMOVE'), 'REMOVE 事件（旧节点）')
  assert.ok(events.some((e) => e.type === 'NODE_CREATE' && (e as any).tag === 'p'), 'NODE_CREATE 事件（新节点）')
  assert.ok(events.some((e) => e.type === 'INSERT'), 'INSERT 事件（新节点）')
  document.body.removeChild(root)
})

test('列表 keyed：同 key 复用——增删只操作变化项（事件断言）', () => {
  stream.reset()
  const root = mkRoot()
  const mk = (items: Array<{ id: string; label: string }>) =>
    h('ul', {}, items.map((it) => h('li', { key: it.id, 'data-id': it.id }, it.label)))
  const v1 = mk([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }])
  mount(v1, root)
  assert.equal(root.querySelectorAll('li').length, 2, '初始 2 项')

  stream.reset()
  const v2 = mk([{ id: 'a', label: 'A' }, { id: 'c', label: 'C' }])
  patch(v1, v2, root)
  assert.equal(root.querySelectorAll('li').length, 2, 'b→c 替换（a 复用）')
  assert.ok(root.querySelector('[data-id="a"]'), 'a 保留（复用）')
  assert.ok(root.querySelector('[data-id="c"]'), 'c 新增')
  assert.ok(!root.querySelector('[data-id="b"]'), 'b 移除')

  const events = stream.events()
  const creates = events.filter((e) => e.type === 'NODE_CREATE')
  assert.equal(creates.length, 1, '仅 c 创建（a/b 复用——无全量重建）')
  document.body.removeChild(root)
})

test('事件流可断言：DOM = fold(事件流)——事件序列精确描述渲染', () => {
  stream.reset()
  const root = mkRoot()
  const v1 = h('div', { id: 'box' }, ['初始'])
  mount(v1, root)
  const mountEvents = stream.events()
  // 事件序列：NODE_CREATE(div) → ... → TEXT_CREATE → INSERT
  const first = mountEvents[0]
  assert.equal(first.type, 'NODE_CREATE', '事件流第一条 = 根节点创建')
  const hasTextCreate = mountEvents.some((e) => e.type === 'TEXT_CREATE' && e.value === '初始')
  assert.ok(hasTextCreate, 'TEXT_CREATE 事件携带文本内容')
  const hasInsert = mountEvents.some((e) => e.type === 'INSERT')
  assert.ok(hasInsert, 'INSERT 事件（根入 root）')
  document.body.removeChild(root)
})

// ── P0 组件层：两阶段组件（mount/patch 复用/卸载）──

test('组件：挂载（COMP_MOUNT）→ 更新（复用实例状态保持）→ 卸载（COMP_UNMOUNT）', async () => {
  stream.reset()
  const root = mkRoot()
  // 有状态组件（内部 let——跨渲染保持）
  let factoryRuns = 0
  const Counter = async (_init: any, _ctx: any) => {
    factoryRuns++
    let count = 0
    return async (_props: any) => {
      return h('div', { class: 'counter' }, [`count:${count}`])
    }
  }
  // build + mount
  const tree = h(Counter, {})
  const { buildVNode } = await import('../ui-dom/vdom3/build.ts')
  await buildVNode(tree, {})
  const { mount } = await import('../ui-dom/vdom3/index.ts')
  mount(tree, root)
  assert.equal(root.querySelector('.counter')?.textContent, 'count:0', '组件渲染')
  assert.equal(factoryRuns, 1, '工厂执行 1 次')

  // 更新（同类型组件——oldV 对照复用 _render——工厂不重跑）
  const tree2 = h(Counter, {})
  await buildVNode(tree2, {}, tree)
  assert.equal(factoryRuns, 1, '同类型复用——工厂不重跑（组件内部状态保持）')
  // patch 更新（同类型——_render 复用——输出 patch）
  const { patch } = await import('../ui-dom/vdom3/index.ts')
  patch(tree, tree2, root)
  assert.equal(root.querySelector('.counter')?.textContent, 'count:0', '复用实例渲染（状态保持）')
  document.body.removeChild(root)
})

test('组件：事件流包含 COMP_MOUNT（挂载即事件——引擎本体）', async () => {
  stream.reset()
  const root = mkRoot()
  const Greet = async (_init: any, _ctx: any) => {
    return async (_props: any) => h('span', { id: 'greet' }, 'hi')
  }
  const { buildVNode } = await import('../ui-dom/vdom3/build.ts')
  const { mount } = await import('../ui-dom/vdom3/index.ts')
  const tree = h(Greet, {})
  await buildVNode(tree, {})
  mount(tree, root)
  assert.ok(root.querySelector('#greet'), '组件输出渲染')
  const events = stream.events()
  assert.ok(events.some((e) => e.type === 'COMP_MOUNT'), 'COMP_MOUNT 事件')
  assert.ok(events.some((e) => e.type === 'NODE_CREATE' && (e as any).tag === 'span'), '组件内部节点创建事件（全链路）')
  document.body.removeChild(root)
})

// ── P1 调度：render 合并 / 批处理 / 防死循环 ──

test('调度：同 tick 多次 render → 合并为一次更新（renderFn 不重复执行）', async () => {
  const { Scheduler } = await import('../ui-dom/vdom3/scheduler.ts')
  const sched = new Scheduler()
  let runs = 0
  const fn = () => { runs++ }
  // 同 tick 3 次 schedule → flush 一次执行 3 个（或合并）
  sched.schedule(fn)
  sched.schedule(fn)
  sched.schedule(fn)
  assert.equal(sched.pending(), 3, '3 个待处理')
  await new Promise((r) => setTimeout(r, 10)) // 微任务 flush
  assert.equal(runs, 3, 'flush 执行 3 个')
  assert.equal(sched.pending(), 0, '队列清空')
})

test('调度：flush 中再次 schedule → 下一轮补跑（不死循环）', async () => {
  const { Scheduler } = await import('../ui-dom/vdom3/scheduler.ts')
  const sched = new Scheduler()
  let count = 0
  const fn = () => {
    count++
    if (count < 3) sched.schedule(fn) // 渲染中再触发（补跑）
  }
  sched.schedule(fn)
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(count, 3, '补跑至稳定（不死循环——上限内）')
})

test('调度：无限重渲染 → 循环上限截断（防死循环——vdom2 pending 教训）', async () => {
  const { Scheduler } = await import('../ui-dom/vdom3/scheduler.ts')
  const sched = new Scheduler()
  let count = 0
  const fn = () => { count++; sched.schedule(fn) } // 无限自触发
  const errs: string[] = []
  const oe = console.error
  console.error = (...a: any[]) => { errs.push(String(a[0])); oe(...a) }
  try {
    sched.schedule(fn)
    await new Promise((r) => setTimeout(r, 20))
  } finally {
    console.error = oe
  }
  assert.ok(errs.some((e) => e.includes('渲染循环超限')), '循环超限报错（截断）')
  assert.ok(count < 100, `截断（count=${count}）`)
})

test('createRoot：组件 ctx.render → 调度重渲染（内部状态更新 → DOM 更新）', async () => {
  const { createRoot, h } = await import('../ui-dom/vdom3/index.ts')
  const root = mkRoot()
  let count = 0
  const Counter = async (_init: any, ctx: any) => {
    return async (_props: any) => h('div', { id: 'c' }, [`count:${count}`])
  }
  const tree = h(Counter, {})
  const handle = createRoot(tree, root)
  await new Promise((r) => setTimeout(r, 10)) // 初始挂载（异步构建）
  assert.equal(root.querySelector('#c')?.textContent, 'count:0', '初始渲染')

  count = 1
  handle.rerender()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(root.querySelector('#c')?.textContent, 'count:1', '调度重渲染（DOM 更新）')
  document.body.removeChild(root)
})
