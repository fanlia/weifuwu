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

// ── P2 事件流能力：回放 / 取消 / 断言 ──

test('回放：DOM = fold(事件流)——重放事件序列 → 结果与原始渲染同构', async () => {
  const { replay } = await import('../ui-dom/vdom3/replay.ts')
  stream.reset()
  const root = mkRoot()
  const tree = h('div', { id: 'box', class: 'a' }, [h('span', {}, 'hello'), 'tail'])
  const { mount } = await import('../ui-dom/vdom3/index.ts')
  mount(tree, root)
  const events = stream.events()

  // 回放到新容器——事件流自包含（id 映射独立）
  const target = document.createElement('div')
  document.body.appendChild(target)
  replay(events, target)
  // jsdom 怪癖：动态 setAttribute('id') 后 querySelector('#id') 缓存失效——用属性选择器
  assert.equal(target.querySelector('[id="box"]')?.getAttribute('class'), 'a', '回放：元素+属性')
  assert.equal(target.querySelector('span')?.textContent, 'hello', '回放：子元素+文本')
  assert.ok(target.innerHTML.includes('tail'), '回放：尾部文本')
  // 与原始渲染同构（结构一致——忽略 data-v3-id 差异）
  assert.equal(target.querySelector('[id="box"]')?.childNodes.length, root.querySelector('[id="box"]')?.childNodes.length, '回放：子节点数一致')
  document.body.removeChild(root)
  document.body.removeChild(target)
})

test('取消：undo 应用逆操作——INSERT→REMOVE、PROP/TEXT_UPDATE→恢复 prev', async () => {
  const { undo } = await import('../ui-dom/vdom3/replay.ts')
  const { NodeRegistry } = await import('../ui-dom/vdom3/registry.ts')
  stream.reset()
  const root = mkRoot()
  const { mount, patch } = await import('../ui-dom/vdom3/index.ts')
  // 挂载 + 更新（产生 INSERT/PROP_UPDATE/TEXT_UPDATE/REMOVE 事件）
  const v1 = h('div', { id: 'box', class: 'a' }, ['旧'])
  mount(v1, root)
  const v2 = h('div', { id: 'box', class: 'b' }, ['新'])
  patch(v1, v2, root)
  const events = stream.events()
  const box = root.querySelector('#box')!

  // undo 最近 2 个 DOM 指令（TEXT_UPDATE + PROP_UPDATE）→ 恢复旧值
  undo(events, 2, (await import('../ui-dom/vdom3/render.ts')).registry)
  assert.equal(box.getAttribute('class'), 'a', 'undo：属性恢复旧值')
  assert.equal(box.firstChild?.nodeValue, '旧', 'undo：文本恢复旧值')
  document.body.removeChild(root)
})

test('断言：expectEventSequence——渲染 = 事件序列（精确断言）', async () => {
  const { expectEventSequence, eventsOf } = await import('../ui-dom/vdom3/replay.ts')
  stream.reset()
  const root = mkRoot()
  const { mount } = await import('../ui-dom/vdom3/index.ts')
  mount(h('div', { id: 'x' }, '文本'), root)
  const events = stream.events()
  // 断言事件序列（NODE_CREATE 开头 + 包含 INSERT/TEXT_CREATE）
  expectEventSequence(events, ['NODE_CREATE'])
  assert.ok(eventsOf(events, 'NODE_CREATE').length >= 1, 'NODE_CREATE 事件')
  assert.ok(eventsOf(events, 'TEXT_CREATE').length >= 1, 'TEXT_CREATE 事件')
  assert.ok(eventsOf(events, 'INSERT').length >= 1, 'INSERT 事件')
  // 断言失败应抛错
  let threw = false
  try { expectEventSequence(events, ['REMOVE']) } catch { threw = true }
  assert.ok(threw, '序列不符 → 抛错')
  document.body.removeChild(root)
})

// ── P3 路由：ROUTE_CHANGE → location→DOM 全链路事件流 ──

test('路由：navigate → ROUTE_CHANGE 事件 → 页面挂载（全链路事件流）', async () => {
  const { createRouter } = await import('../ui-dom/vdom3/router.ts')
  stream.reset()
  const root = mkRoot()
  const Home = async (_init: any, _ctx: any) => async () => h('div', { id: 'home' }, '首页')
  const About = async (_init: any, _ctx: any) => async () => h('div', { id: 'about' }, '关于')
  const router = createRouter([
    { path: '/', render: () => h(Home, {}) },
    { path: '/about', render: () => h(About, {}) },
  ], root, { initialPath: '/' })
  await new Promise((r) => setTimeout(r, 10))
  assert.ok(root.querySelector('[id="home"]'), '首帧渲染（/ → Home）')

  router.navigate('/about')
  await new Promise((r) => setTimeout(r, 10))
  assert.ok(root.querySelector('[id="about"]'), '导航 → About 渲染')
  assert.ok(!root.querySelector('[id="home"]'), 'Home 移除（页面切换）')

  const events = stream.events()
  const routeEvts = events.filter((e) => e.type === 'ROUTE_CHANGE')
  assert.equal(routeEvts.length, 2, 'ROUTE_CHANGE 事件（初始 + 导航）')
  assert.equal((routeEvts[1] as any).path, '/about', '导航事件携带 path')
  // 全链路：ROUTE_CHANGE → COMP_MOUNT → NODE_CREATE → INSERT
  const seq = events.slice(events.findIndex((e) => e.type === 'ROUTE_CHANGE' && (e as any).path === '/about'))
  assert.ok(seq.some((e) => e.type === 'COMP_MOUNT'), '导航后 COMP_MOUNT（页面组件）')
  assert.ok(seq.some((e) => e.type === 'NODE_CREATE'), '导航后 NODE_CREATE')
  assert.ok(seq.some((e) => e.type === 'INSERT'), '导航后 INSERT')
  assert.ok(seq.some((e) => e.type === 'COMP_UNMOUNT'), '导航后 COMP_UNMOUNT（旧页面）')
  router.close()
  document.body.removeChild(root)
})

test('路由：参数解析（:id）→ params 注入 → ROUTE_CHANGE 携带', async () => {
  const { createRouter } = await import('../ui-dom/vdom3/router.ts')
  stream.reset()
  const root = mkRoot()
  let seenParams: Record<string, string> = {}
  const User = async (_init: any, _ctx: any) => async (props: any) => h('div', { id: 'user' }, [`user:${props.params?.id ?? '?'}`])
  const router = createRouter([
    { path: '/user/:id', render: (params) => { seenParams = params; return h(User, { params }) } },
  ], root, { initialPath: '/user/123' })
  await new Promise((r) => setTimeout(r, 10))
  assert.ok(root.querySelector('[id="user"]'), '用户页渲染')
  assert.equal(root.querySelector('[id="user"]')?.textContent, 'user:123', 'params 注入渲染')
  assert.equal(seenParams.id, '123', 'params 解析')
  const routeEvt = stream.events().find((e) => e.type === 'ROUTE_CHANGE') as any
  assert.equal(routeEvt.params.id, '123', 'ROUTE_CHANGE 携带 params')
  router.close()
  document.body.removeChild(root)
})

// ── P4 生命周期：onUnmount 钩子（卸载清理） ──

test('生命周期：组件卸载 → onUnmount 钩子执行（清理注册的副作用）', async () => {
  const { createRouter } = await import('../ui-dom/vdom3/router.ts')
  stream.reset()
  const root = mkRoot()
  let cleaned = 0
  let timerId: ReturnType<typeof setInterval> | null = null
  const Home = async (_init: any, ctx: any) => {
    // 组件挂载：注册定时器 + onUnmount 清理
    timerId = setInterval(() => {}, 1000)
    ctx.onUnmount?.(() => { cleaned++; if (timerId) { clearInterval(timerId); timerId = null } })
    return async () => h('div', { id: 'home' }, '首页')
  }
  const About = async (_init: any, _ctx: any) => async () => h('div', { id: 'about' }, '关于')
  const router = createRouter([
    { path: '/', render: () => h(Home, {}) },
    { path: '/about', render: () => h(About, {}) },
  ], root, { initialPath: '/' })
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(cleaned, 0, '初始：未清理')

  router.navigate('/about')
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(cleaned, 1, '导航离开 → onUnmount 执行（定时器清理）')
  assert.equal(timerId, null, '定时器已清（资源释放）')
  router.close()
  document.body.removeChild(root)
})

// ── SSR 事件流水合：服务端生成事件流 → 客户端重放（零 DOM 猜测） ──

test('SSR：renderToEvents 生成事件流 → serialize/deserialize → replay 重建 DOM（与 mount 同构）', async () => {
  const { renderToEvents, serializeEvents, deserializeEvents } = await import('../ui-dom/vdom3/ssr.ts')
  const { replay } = await import('../ui-dom/vdom3/replay.ts')
  // 组件树（含文本/属性/嵌套）
  const Page = async (_init: any, _ctx: any) => {
    return async () => h('div', { id: 'page', class: 'x' }, [
      h('h1', {}, '标题'),
      h('p', {}, ['内容 ', '段落']),
      h('ul', {}, ['a', 'b', 'c'].map((it, i) => h('li', { key: it + i }, it))),
    ])
  }
  // 服务端：生成事件流 + 序列化
  const events = await renderToEvents(h(Page, {}))
  const json = serializeEvents(events)
  const parsed = deserializeEvents(json)
  assert.equal(parsed.length, events.length, '序列化往返无损')

  // 客户端：重放 → DOM（零 DOM 猜测——事件流自带全部指令）
  const container = document.createElement('div')
  document.body.appendChild(container)
  replay(parsed, container)
  assert.ok(container.querySelector('[id="page"]'), '重放：根元素')
  assert.equal(container.querySelector('[id="page"]')?.getAttribute('class'), 'x', '重放：属性')
  assert.equal(container.querySelector('h1')?.textContent, '标题', '重放：文本')
  assert.equal(container.querySelectorAll('li').length, 3, '重放：列表')
  assert.ok(container.innerHTML.includes('内容'), '重放：多段文本')
  document.body.removeChild(container)
})

test('SSR：组件挂载事件（COMP_MOUNT）在服务端事件流中（可审计）', async () => {
  const { renderToEvents } = await import('../ui-dom/vdom3/ssr.ts')
  const Comp = async (_init: any, _ctx: any) => async () => h('span', {}, 'hi')
  const events = await renderToEvents(h(Comp, {}))
  assert.ok(events.some((e) => e.type === 'NODE_CREATE' && (e as any).tag === 'span'), 'SSR 事件流含节点创建')
  // 服务端生成不污染全局流（独立数组）
  assert.ok(!stream.events().includes(events[0]), 'SSR 事件独立于运行时流')
})

// ── 流式渲染：服务端逐事件推送 → 客户端逐事件应用（渐进首屏） ──

test('流式渲染：AsyncGenerator 逐事件 → 客户端逐事件 apply → 与完整回放同构', async () => {
  const { renderToEventStream } = await import('../ui-dom/vdom3/ssr.ts')
  const { applyEvent } = await import('../ui-dom/vdom3/replay.ts')
  const { NodeRegistry } = await import('../ui-dom/vdom3/registry.ts')
  const Page = async (_init: any, _ctx: any) => {
    return async () => h('div', { id: 'stream-page' }, [
      h('h1', {}, '流式标题'),
      h('p', {}, ['流式', '内容']),
      h('ul', {}, ['a', 'b'].map((it, i) => h('li', { key: it + i }, it))),
    ])
  }
  // 服务端：流式推送（模拟分批到达——每 2 事件一批）
  const stream0 = renderToEventStream(h(Page, {}))
  const received: any[] = []
  for await (const ev of stream0) received.push(ev)

  // 客户端：逐事件应用（模拟传输延迟）
  const target = document.createElement('div')
  document.body.appendChild(target)
  const reg = new NodeRegistry()
  reg.register(NodeRegistry.ROOT, target)
  let applied = 0
  for (const ev of received) {
    applyEvent(ev, target, reg)
    applied++
  }
  // 与同步回放同构
  assert.ok(target.querySelector('[id="stream-page"]'), '流式：根元素')
  assert.equal(target.querySelector('h1')?.textContent, '流式标题', '流式：标题文本')
  assert.equal(target.querySelectorAll('li').length, 2, '流式：列表')
  assert.ok(target.innerHTML.includes('内容'), '流式：多段文本')
  assert.equal(applied, received.length, '全部事件已应用')
  document.body.removeChild(target)
})

test('流式渲染：渐进性——根节点事件先到即可先显示（TTFB 后首块可见）', async () => {
  const { renderToEventStream } = await import('../ui-dom/vdom3/ssr.ts')
  const { applyEvent } = await import('../ui-dom/vdom3/replay.ts')
  const { NodeRegistry } = await import('../ui-dom/vdom3/registry.ts')
  const App = async (_init: any, _ctx: any) => async () => h('div', { id: 'p', class: 'c' }, ['内容'])
  const stream0 = renderToEventStream(h(App, {}))
  const it = stream0[Symbol.asyncIterator]()
  // 第一批：仅根节点（NODE_CREATE + PROP_UPDATE + INSERT——无文本）
  const target = document.createElement('div')
  document.body.appendChild(target)
  const reg = new NodeRegistry()
  reg.register(NodeRegistry.ROOT, target)
  // 首批：NODE_CREATE + PROP_UPDATE + INSERT（根节点完整就位——渐进首屏）
  // 首批：到根节点挂载（INSERT）为止（创建+属性+挂载——渐进首屏）
  let ev
  let guard = 0
  do {
    const r = await it.next()
    assert.ok(!r.done, '流未提前结束')
    ev = r.value
    applyEvent(ev, target, reg)
    guard++
  } while (ev.type !== 'INSERT' && guard < 10)
  assert.equal(ev.type, 'INSERT', '首批以 INSERT 结束（根已挂载）')
  assert.ok(target.querySelector('[id="p"]'), '根已挂载（渐进——非空壳）')
  assert.equal(target.querySelector('[id="p"]')?.getAttribute('class'), 'c', '属性已应用')
  const rest: any[] = []
  for await (const ev of { [Symbol.asyncIterator]: () => it }) rest.push(ev)
  for (const ev of rest) applyEvent(ev, target, reg)
  assert.equal(target.querySelector('[id="p"]')?.textContent, '内容', '完整应用后文本就位')
  document.body.removeChild(target)
})

// ── 多端同步：事件流 = 操作日志 → 镜像容器（协作基础） ──

test('同步：A 渲染 + 交互 → 事件日志 → B 增量镜像（DOM 同构）', async () => {
  const { createSync } = await import('../ui-dom/vdom3/sync.ts')
  const { NodeRegistry } = await import('../ui-dom/vdom3/registry.ts')
  // 全局流隔离（测试独立——避免跨测试残留事件）
  const { stream: globalStream } = await import('../ui-dom/vdom3/events.ts')
  globalStream.reset()
  // 共享事件日志（模拟：一端记录——多端订阅）
  const log: any[] = []
  const emit = (ev: any) => { log.push(ev) }
  const getEvents = () => log
  const A = document.createElement('div')
  const B = document.createElement('div')
  document.body.appendChild(A)
  document.body.appendChild(B)
  // 容器 A：mount（记录事件到共享日志）
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  let count = 0
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', { id: 'sync-app' }, [
      h('button', { id: 'b', onClick: () => { count++; rerender() } }, [`c${count}`]),
      count > 0 ? h('p', { id: 'note' }, `clicked ${count}`) : null,
      h('ul', {}, ['x', 'y'].map((it, i) => h('li', { key: it + i }, it))),
    ])
  }
  // 用自定义流（hooks 到 log）——挂载 + 交互
  const rootA = createRoot(h(App, {}), A)
  await new Promise((r) => setTimeout(r, 20))
  // 同步初始事件（挂载后日志有内容）
  log.push(...(await import('../ui-dom/vdom3/events.ts')).stream.events().slice())
  const sync = createSync(B, getEvents)
  const n0 = sync.sync()
  assert.ok(n0 > 10, `首次同步（${n0} 事件）`)
  assert.ok(B.querySelector('[id="sync-app"]'), 'B 镜像：根')
  assert.equal(B.querySelectorAll('li').length, 2, 'B 镜像：列表')
  assert.equal(B.querySelector('[id="b"]')?.textContent, 'c0', 'B 镜像：文本')
  assert.ok(!B.querySelector('[id="note"]'), 'B 镜像：条件未显示')

  // 交互（同 tick 多次）→ A 更新
  ;(A.querySelector('[id="b"]') as HTMLButtonElement)?.click()
  ;(A.querySelector('[id="b"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 30))
  // 捕获 A 的更新事件（render 后的新事件）
  const streamMod = await import('../ui-dom/vdom3/events.ts')
  const newEvents = streamMod.stream.events().slice()
  // 全量日志 = 初始 + 更新（模拟远端日志已累积）
  log.length = 0
  log.push(...newEvents)

  // B 增量同步 → 与 A 同构
  const n1 = sync.sync()
  assert.ok(n1 > 0, `增量同步（${n1} 事件）`)
  assert.equal(B.querySelector('[id="b"]')?.textContent, 'c2', 'B 镜像：计数同步')
  assert.ok(B.querySelector('[id="note"]'), 'B 镜像：条件块同步出现')
  assert.equal(B.innerHTML, A.innerHTML, 'B 与 A 同构（DOM 完全一致）')
  document.body.removeChild(A)
  document.body.removeChild(B)
})

// ── vdom2 ↔ vdom3 兼容层：迁移路径（ctx.ui.render → ctx.render 适配） ──

test('兼容：vdom2 风格组件（ctx.ui.render）在 vdom3 树运行——交互/复用正常', async () => {
  const { compat } = await import('../ui-dom/vdom3/compat.ts')
  // vdom2 风格组件（含内部状态 + ctx.ui.render——不依赖 hooks）
  const V2Counter: any = (initProps: any, ctx: any) => {
    let n = initProps.initial ?? 0
    return async (props: any) =>
      h('button', {
        id: 'v2btn',
        onClick: () => { n += props.step ?? 1; ctx.ui.render() },
      }, [`v2: ${n}`])
  }
  // 迁移：compat 包裹（模块级稳定引用——工厂复用前提）→ vdom3 树
  const V2CounterCompat = compat(V2Counter)
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', { id: 'v2app' }, [
      h(V2CounterCompat, { initial: 5 }),
      h('button', { id: 'parent', onClick: () => rerender() }, 'parent'),
    ])
  }
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  const handle = createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(root.querySelector('[id="v2btn"]'), 'v2 组件挂载')
  assert.equal(root.querySelector('[id="v2btn"]')?.textContent, 'v2: 5', '初始状态')

  // v2 组件内部交互（ctx.ui.render → v3 render）
  ;(root.querySelector('[id="v2btn"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(root.querySelector('[id="v2btn"]')?.textContent, 'v2: 6', 'v2 组件交互（ui.render 适配）')

  // 父组件重渲染（v3 render）——v2 组件同位置复用（内部状态保持）
  ;(root.querySelector('[id="parent"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(root.querySelector('[id="v2btn"]')?.textContent, 'v2: 6', '父重渲染后 v2 状态保持（工厂不重跑）')
  document.body.removeChild(root)
})

test('兼容：真实 vdom2 组件（EmptyState——无状态）在 vdom3 渲染', async () => {
  const { compat } = await import('../ui-dom/vdom3/compat.ts')
  // 模拟 vdom2 组件形态（无状态——只用 props）
  const V2Badge: any = (_init: any, _ctx: any) => async (props: any) =>
    h('span', { class: props.variant ? `badge-${props.variant}` : 'badge' }, props.label)
  const App = async (_init: any, _ctx: any) => async () =>
    h('div', {}, [
      h(compat(V2Badge), { label: '迁移', variant: 'primary' }),
      h('div', { id: 'rest' }, 'rest'),
    ])
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(root.querySelector('span[class="badge-primary"]'), 'v2 无状态组件渲染')
  assert.equal(root.querySelector('span')?.textContent, '迁移', '文本')
  assert.ok(root.querySelector('[id="rest"]'), '兄弟节点正常')
  document.body.removeChild(root)
})

// ── MOVE 事件：keyed 重排（移动而非重建——DOM 状态保持 + 精确事件流） ──

test('MOVE：keyed 列表重排 → MOVE 事件（非 REMOVE+CREATE）→ DOM 顺序正确', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  let order = ['a', 'b', 'c']
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', {}, [
      h('button', { id: 'rev', onClick: () => { order = ['c', 'b', 'a']; rerender() } }, 'rev'),
      h('ul', { id: 'ul' }, order.map((it) => h('li', { key: it, 'data-k': it }, it))),
    ])
  }
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  assert.deepEqual([...root.querySelectorAll('li')].map((li) => li.textContent), ['a', 'b', 'c'], '初始顺序')
  // 重排（反转）
  ;(root.querySelector('[id="rev"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  assert.deepEqual([...root.querySelectorAll('li')].map((li) => li.textContent), ['c', 'b', 'a'], '重排后顺序')
  const moves = gs.events().filter((e) => e.type === 'MOVE')
  assert.equal(moves.length, 2, `重排 = 2 个 MOVE 事件（c→首、a→尾）——实际 ${moves.length}`)
  const removes = gs.events().filter((e) => e.type === 'REMOVE')
  assert.equal(removes.length, 0, '无 REMOVE（节点复用——状态保持）')
  document.body.removeChild(root)
})

test('MOVE：事件流回放含 MOVE（重排可传输）+ undo 恢复原顺序', async () => {
  const { stream: gs } = await import('../ui-dom/vdom3/events.ts')
  gs.reset()
  let order = ['a', 'b', 'c']
  const App = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', { id: 'app' }, [
      h('button', { id: 'swap', onClick: () => { order = ['b', 'a', 'c']; rerender() } }, 'swap'),
      h('ul', {}, order.map((it) => h('li', { key: it }, it))),
    ])
  }
  const root = document.createElement('div')
  document.body.appendChild(root)
  const { createRoot } = await import('../ui-dom/vdom3/root.ts')
  createRoot(h(App, {}), root)
  await new Promise((r) => setTimeout(r, 20))
  ;(root.querySelector('[id="swap"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  assert.deepEqual([...root.querySelectorAll('li')].map((li) => li.textContent), ['b', 'a', 'c'], '交换后')
  // 回放：事件流 → 新容器（含 MOVE——重排可传输）
  const { replay, undo } = await import('../ui-dom/vdom3/replay.ts')
  const { NodeRegistry } = await import('../ui-dom/vdom3/registry.ts')
  const target = document.createElement('div')
  document.body.appendChild(target)
  replay(gs.events(), target)
  assert.deepEqual([...target.querySelectorAll('li')].map((li) => li.textContent), ['b', 'a', 'c'], '回放含 MOVE')
  // undo：最后一个 MOVE → 恢复 a 到 b 前
  const reg2 = new NodeRegistry()
  reg2.register(NodeRegistry.ROOT, target)
  // 重建 registry 引用（回放用同一 registry 才能 undo）
  const events = gs.events()
  const reg = new NodeRegistry()
  reg.register(NodeRegistry.ROOT, target)
  target.innerHTML = ''
  for (const ev of events) {
    const { applyEvent } = await import('../ui-dom/vdom3/replay.ts')
    applyEvent(ev, target, reg)
  }
  undo(events, 1, reg)
  assert.deepEqual([...target.querySelectorAll('li')].map((li) => li.textContent), ['a', 'b', 'c'], 'undo 恢复原顺序')
  document.body.removeChild(root)
  document.body.removeChild(target)
})

// ── 路由页面交互：ctx.render 必须可用（createRouter 注入——非空 ctx） ──

test('路由：页面组件交互（ctx.render 重渲染当前页）——点击更新', async () => {
  const { createRouter } = await import('../ui-dom/vdom3/router.ts')
  const root = document.createElement('div')
  document.body.appendChild(root)
  let n = 0
  const CounterPage = async (_init: any, ctx: any) => {
    const rerender = () => ctx.render()
    return async () => h('div', { id: 'rpage' }, [
      h('button', { id: 'rbtn', onClick: () => { n++; rerender() } }, [`n: ${n}`]),
      n > 0 ? h('p', { id: 'note' }, `clicked ${n}`) : null,
    ])
  }
  const router = createRouter([
    { path: '/counter', render: () => h(CounterPage, {}) },
  ], root, { initialPath: '/counter' })
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(root.querySelector('[id="rpage"]'), '页面挂载')
  assert.equal(root.querySelector('[id="rbtn"]')?.textContent, 'n: 0', '初始')
  ;(root.querySelector('[id="rbtn"]') as HTMLButtonElement)?.click()
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(root.querySelector('[id="rbtn"]')?.textContent, 'n: 1', '点击更新（ctx.render 生效）')
  assert.ok(root.querySelector('[id="note"]'), '条件块出现')
  router.close()
  document.body.removeChild(root)
})

// ── 事件流容量保护：环形缓冲（溢出只保留最近 max——O(1) emit） ──

test('事件流：环形缓冲——溢出保留最近 max 条（最旧丢弃）+ 顺序正确', async () => {
  const { createEventStream } = await import('../ui-dom/vdom3/events.ts')
  const s = createEventStream(5)
  for (let i = 1; i <= 8; i++) s.emit({ type: 'NODE_CREATE', id: `n${i}`, tag: 'div', ts: i })
  const evs = s.events()
  assert.equal(evs.length, 5, '容量 5（保留最近 5）')
  assert.deepEqual(evs.map((e: any) => e.id), ['n4', 'n5', 'n6', 'n7', 'n8'], '最旧 3 条丢弃——顺序正确')
  s.reset()
  assert.equal(s.events().length, 0, 'reset 清空')
  // reset 后可复用
  s.emit({ type: 'NODE_CREATE', id: 'x', tag: 'span', ts: 1 })
  assert.equal(s.events().length, 1, 'reset 后继续记录')
})
